/**
 * Player - Player data management for LORD.
 *
 * Loads and persists the active player's record, handles character creation,
 * stat mutations, and provides the runtime player object shared across all
 * game classes during a session.
 *
 * The class returns a Proxy from its constructor so callers can treat the
 * Player instance as both a service object (`loadPlayer`, `allPlayers`, etc.)
 * and the active LoadedPlayerRecord (`hp`, `str`, `bank`, `on_now`, etc.).
 * This preserves the original LORD calling style without duplicating every
 * record field on the class itself.
 */
import { random, prettyInt, cleanStr, dispStr, dispLen, properCase } from '@lordts/util/Util';
import type FileUtils from '@lordts/util/FileUtils';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';
import type { Settings, User, LoadedPlayerRecord, PlayerRecord, UiMode } from './types';
import type Game from './Game';
import type IO from './io/IO';
import type Mail from './Mail';
import type State from './State';
import { Lazy } from '@lordts/util/Lazy';
import { GameExitError } from './GameExitError';
import { HiddenPlayerPolicy } from './HiddenPlayerPolicy';
import { InactiveResurrectionPolicy } from './InactiveResurrectionPolicy';
import {
    resolveDeathKnightUsePointDivisor,
    resolveThiefUsePointDivisor,
} from '@lordts/util/Settings';

function lessonCountWord(count: number): string {
    const lessonWords: Record<number, string> = {
        1: 'one',
        2: 'two',
        3: 'three',
        4: 'four',
        5: 'five',
        6: 'six',
        7: 'seven',
        8: 'eight',
        9: 'nine',
        10: 'ten',
    };

    return lessonWords[count] ?? prettyInt(count);
}

// Set of known class instance properties (not record fields).
// The Proxy consults this before writing so that service state stays on the
// Player object while gameplay fields keep flowing through the active record.
const PLAYER_CLASS_PROPS = new Set([
    'io', 'console', 'user', 'fileUtils', 'settings',
    'whitelist', 'mail',
    'player', 'rip', 'ver',
    '_state', '_game', '_storage', '_battleCoordinator',
    'on_player_event',
]);

// Declaration merging is required here so that Player instances expose all
// LoadedPlayerRecord fields (e.g. `player.hp`, `player.str`) without
// duplicating every property definition.  TypeScript has no other mechanism
// to mix a plain-object record shape into a class.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
interface Player extends LoadedPlayerRecord {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class Player {
    /** The active player record, null until loadPlayer() succeeds. */
    player: LoadedPlayerRecord | null;
    /** Optional callback for online presence events (connect/disconnect); used by the server. */
    on_player_event?: (eventType: 'player_connect' | 'player_disconnect', username: string) => void;

    constructor(
        public io: IO,
        public user: User,
        public fileUtils: FileUtils,
        public settings: Settings,
        public whitelist: string[],
        public mail: Mail,
        private _uiMode: UiMode,
        public ver: string,
        private _state: Lazy<State>,
        private _game: Lazy<Game>,
        private _storage: Lazy<IStorage>,
        private _battleCoordinator: Lazy<IBattleCoordinator>,
    ) {
        this.player = null;

        // Return a Proxy so that external callers can keep a single `player`
        // reference and still reach both Player methods and the live record.
        // Reads and writes fall through to `this.player` only when the member
        // is not part of the service object itself.
        return new Proxy(this, {
            get(target: Player, prop: string | symbol, receiver: object): unknown {
                // Symbols and prototype lookups belong to the class instance.
                if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
                // Service methods and explicitly tracked fields stay on Player.
                if (prop in target) return Reflect.get(target, prop, receiver);
                // Gameplay data is stored on the loaded record object.
                if (target.player && prop in target.player) return Reflect.get(target.player, prop, receiver);
                return undefined;
            },
            set(target: Player, prop: string | symbol, value: unknown): boolean {
                // Service state writes stay on the Player wrapper.
                if (typeof prop === 'string' && (PLAYER_CLASS_PROPS.has(prop) || prop in target.constructor.prototype)) {
                    Reflect.set(target, prop, value);
                    return true;
                }
                // Record fields mutate the active player row directly so later
                // `put()` calls persist the exact state the game has been using.
                if (target.player && typeof prop === 'string' && prop in target.player) {
                    // Detect changes to on_now so callers can be notified
                    if (prop === 'on_now') {
                        const oldVal = target.player.on_now;
                        Reflect.set(target.player, prop, value);
                        // Record the unix timestamp of when this session came online.
                        // Used by server-side idle monitor and DailyMaint to detect
                        // stale on_now flags left by crashed/unclean sessions.
                        if (value === true) {
                            target.player.last_on_unix = Math.floor(Date.now() / 1000);
                        }
                        try {
                            if (oldVal !== value && typeof target.on_player_event === 'function') {
                                const uname = target.player.name || '';
                                const ev = value ? 'player_connect' : 'player_disconnect';
                                try { target.on_player_event(ev, uname); } catch (_e) { /* ignore */ }
                            }
                        } catch (_e) { /* ignore */ }
                        return true;
                    }

                    Reflect.set(target.player, prop, value);
                    return true;
                }
                // Fallback: set on target (new class property)
                Reflect.set(target, prop, value);
                return true;
            },
        });
    }

    // Dynamic access to properties populated after Player construction
    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get state(): State {
        return this._state.value;
    }

    get game(): Game {
        return this._game.value;
    }

    get storage(): IStorage {
        return this._storage.value;
    }

    get battleCoordinator(): IBattleCoordinator {
        return this._battleCoordinator.value;
    }

    // ── Record management ────────────────────────────────────────────

    playerNew(_leaveLocked?: boolean): LoadedPlayerRecord | null {
        const ret = this.storage.newPlayer() as LoadedPlayerRecord | null;
        if (ret !== null) {
            ret.Yours = true;
        }
        return ret;
    }

    playerGet(rec: number, leaveLocked?: boolean): LoadedPlayerRecord | null {
        // Some timed resurrection rules are applied lazily when a record is
        // loaded so offline players recover even if DailyMaint has not touched
        // them yet.
        InactiveResurrectionPolicy.applyDueResurrections(this.storage, this.settings, new Date(), rec);
        const ret = this.storage.getPlayer(rec, leaveLocked) as LoadedPlayerRecord | null;
        if (ret !== null) {
            ret.Yours = true;
        }
        return ret;
    }

    playerLength(): number {
        return this.storage.getPlayerCount();
    }

    allPlayers(includeHidden: boolean = false): LoadedPlayerRecord[] {
        const len = this.playerLength();
        const ret: LoadedPlayerRecord[] = [];
        for (let i = 0; i < len; i += 1) {
            const p = this.storage.getPlayer(i) as LoadedPlayerRecord | null;
            if (p === null) {
                continue;
            }
            p.Yours = true;
            // HiddenPlayerPolicy filters sysop-hidden and dummy placeholder
            // records from public views unless the caller explicitly opts in.
            if (!includeHidden && !HiddenPlayerPolicy.isVisiblePlayer(this.storage, p)) {
                continue;
            }
            ret.push(p);
        }
        return ret;
    }

    // ── Character creation ────────────────────────────────────────────

    async checkName(str: string): Promise<boolean> {
        let resp = "";

        str = dispStr(str).toUpperCase();

        switch (str) {
            case "BARAK":
                resp = "Naw, the real Barak would decapitate you if he found out.";
                break;
            case "SETH":
                resp = "You are not Seth Able!  Don't take his name in vain!";
                break;
            case "SETH ABLE":
                resp = "You are not God!";
                break;
            case "TURGON":
                resp = "Haw.  Hardly - Turgon has muscles.";
                break;
            case "VIOLET":
                resp = "Haw.  Hardly - Violet has breasts.";
                break;
            case "RED DRAGON":
                resp = "Oh go plague some other land!";
                break;
            case "DRAGON":
                resp = "You ain't Bruce Lee, so get out!";
                break;
            case "JENNIE GARTH":
                resp = "You are not a goddess, don't use her name!";
                break;
            case "KIRSTEN DUNST":
                resp = "Hardly! You only wish you were in a movie with Wynona!";
                break;
            case "BUSH":
                resp = "Lower my taxes!";
                break;
            case "BAGGIO":
                resp = "Darius sucks!";
                break;
            case "DAVID FOLLEY":
                resp = "You rule, dude - but use a handle or you will mobbed!";
                break;
            case "ARNOLD PALMER":
                resp = "Ha!  You're too old to be playing games.";
                break;
            case "BARTENDER":
                resp = "Nah, the bartender is smarter than you!";
                break;
            case "CHANCE":
                resp = "Why not go take a chance with a rattlesnake?";
                break;
            case "MICHAEL PRESLAR":
                resp = "You want to be a small town kid?";
                break;
            case "GOD":
            case "JESUS":
                resp = "Why arent you in church?";
                break;
        }

        if (resp !== "") {
            await this.io.sln();
            await this.io.lln("`)** `%" + resp + " `)**`2");
            await this.io.sln();
            return false;
        }

        return true;
    }

    async chooseProfession(dhTavern: boolean): Promise<number> {
        let ch: string;

        if (dhTavern) {
            await this.io.lln("`2You concentrate deeply.");
        } else {
            await this.io.lln("`%As you remember your childhood, you remember...");
            await this.io.sln();
            await this.io.lln("`0(`5K`0)illing A Lot Of Woodland Creatures");
            await this.io.lln("`0(`5D`0)abbling In The Mystical Forces");
            await this.io.lln("`0(`5L`0)ying, Cheating, And Stealing From The Blind");
        }

        do {
            await this.io.sln();
            await this.io.lw("`2Pick one.  (`0K`2,`0D`2,`0L`2) : `%", 2);
            this.io.emitPrompt('class_selection', [
                { key: 'K', label: 'Death Knight' },
                { key: 'D', label: 'Mystical Skills' },
                { key: 'L', label: 'Thieving Skills' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            await this.io.sln(ch, 0);
            this.io.foreground(15);
            await this.io.sln();
            await this.io.sln();
            if (dhTavern && this.rip) await this.io.showRip("W1");
            switch (ch) {
                case "K":
                    await this.io.lln("Now that you've grown up, you have decided to study the ways of the the Death Knights.  All beginners want the power to use their body and weapon as one.  To inflict twice the damage with the finesse only a warrior of perfect mind can do.");
                    break;
                case "D":
                    await this.io.lln("You have always wanted to explain the unexplainable.  To understand the powerful forces that rule the earth.  To tame the beast that oversees all things.  Of course, having the power to burn someone by making a gesture wouldn't hurt.");
                    break;
                case "L":
                    await this.io.lln("You decide to follow your instincts.  To get better at what you've always done best.  So you decide to lead a dishonest lifestyle. Of course, your ultimate goal will always be to join the Master Thieves Guild.  To arrive, remember one thing, \"Even thieves have honor.\"");
                    break;
                default:
                    await this.io.sln();
                    await this.io.sln("This is a very important choice.  Pay attention idiot!");
            }
        } while ("KDL".indexOf(ch) === -1);
        await this.io.sln();
        await this.io.moreNoMail();
        return " KDL".indexOf(ch);
    }

    async findPlayer(): Promise<number> {
        let tname: string;
        let op: LoadedPlayerRecord | null;
        let i: number;
        let ch: string;

        await this.io.sln();
        await this.io.lln("`2(full or `0PARTIAL`2 name)");
        await this.io.lw("NAME: `%", 2);
        this.io.emitPrompt('find_player_name', [], 'line');
        const name = cleanStr(await this.io.getstr());
        const ucname = dispStr(name).toUpperCase();
        if (ucname.trim().length < 1) {
            return -1;
        }
        const plen = this.playerLength();
        for (i = 0; i < plen; i += 1) {
            op = this.playerGet(i);
            if (op === null || !HiddenPlayerPolicy.isVisiblePlayer(this.storage, op)) continue;
            tname = dispStr(op.name).toUpperCase();
            if (tname.indexOf(ucname) !== -1) {
                ch = await this.io.prompt(
                    '  `2You mean "`0' + op.name + '"? `2[`%Y`2] `: ',
                    [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                    'find_player_confirm',
                    { defaultKey: 'Y', leadingBlank: true, trailingBlank: false }
                );
                if (ch === "Y") {
                    await this.io.sln();
                    return op.Record;
                }
            }
        }
        return -1;
    }

    private _applyPartialRecord(newp: Partial<PlayerRecord>): void {
        Object.keys(newp).forEach((npkey: string) => {
            if (this.player) {
                (this.player as Record<string, unknown>)[npkey] = (newp as Record<string, unknown>)[npkey];
            }
        });
    }

    async newPlayer(): Promise<void> {
        let name: string;
        const np: Partial<PlayerRecord> = {};
        let tp: LoadedPlayerRecord | null;
        let i: number;
        let ch: string;
        let plen: number;

        this.io.sclrscr();
        if (this.playerLength() > 147) {
            await this.io.sln();
            await this.io.lln("`c`>`%** THE REALM IS FULL **", 24);
            await this.io.lln(this.io.divider(0, '`0'), 0);
            await this.io.lln("`2An over-population problem is keeping you from moving in.");
            await this.io.sln();
            await this.io.lln("`0Take heart. `2 Although `%LORD " + this.ver + "`2 is NEVER reset, players who do not visit for a certain number of days are deleted every morning.");
            await this.io.sln();
            await this.io.sln("(You may want to ask your Sysop to make the # of days less)");
            await this.io.sln();
            await this.io.sln("Please try again tomorrow.  Until then, you can only dream of the wonderful world that awaits...");
            await this.io.sln();
            await this.io.moreNoMail();
            throw new GameExitError();
        }
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`>** Welcome to the realm new warrior! **");
        ch = "";
        do {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`0What would you like as an alias? ");
            await this.io.lln("");
            await this.io.lw("`2Name: `%", 2);
            this.io.emitPrompt('player_name_entry', [], 'line');
            name = await this.io.getstr({ len: 20 });
            if (name === "") {
                await this.io.sln();
                await this.io.lln("`)YOU'RE NOTHING BUT A WEENIE!");
                await this.io.sln();
                if (this.player != null) {
                    this.player.on_now = false;
                    this.player.put();
                }
                throw new GameExitError();
            }
            this.io.foreground(10);
            name = name.trim();
            name = cleanStr(name);
            name = properCase(name);
            np.name = name;
            if (name.length > 18) {
                await this.io.sln("Try a shorter name!");
                await this.io.sln();
            } else if (name.length < 3) {
                await this.io.sln("Try a longer name!");
                await this.io.sln();
            } else if (dispLen(name) < 3) {
                await this.io.sln("You are such a sneaky boy.  Yet so simplistic.");
                await this.io.sln();
            } else {
                plen = this.playerLength();
                for (i = 0; i < plen; i += 1) {
                    tp = this.playerGet(i);
                    if (tp && dispStr(tp.name).toUpperCase() === dispStr(name).toUpperCase()) {
                        await this.io.sln();
                        await this.io.lln("`2You recall hearing that another warrior currently goes by that name.  Not wanting to dishonor `0" + tp.name + " `2you decide to pick another.");
                        await this.io.sln();
                        break;
                    }
                }
                if (i === plen) {
                    if (await this.checkName(name)) {
                        await this.io.sln();
                        await this.io.lw("`0" + name + "`2? `2[`0Y`2] : `%", 2);
                        this.io.emitPrompt('name_confirm', [
                            { key: 'Y', label: 'Yes' },
                            { key: 'N', label: 'No' },
                        ]);
                        ch = (await this.io.getkey()).toUpperCase();
                        if (ch !== "N") {
                            ch = "Y";
                        }
                        this.io.foreground(15);
                        await this.io.sln(ch, 0);
                        this.io.foreground(10);
                    }
                }
            }
        } while (ch !== "Y");
        // Note: name uniqueness is enforced at entry time, not at the moment of record creation.
        ch = await this.io.prompt(
            "  `2And your gender?  (`0M`2/`0F`2) [`0M`2]: `%",
            [{ key: 'M', label: 'Male' }, { key: 'F', label: 'Female' }],
            'gender_selection',
            { defaultKey: 'M' }
        );

        np.sex = ch;
        if (ch === "M") {
            switch (random(5)) {
                case 0:
                    await this.io.lln('With a name like "' + np.name + '`0", no one is going to believe it.');
                    break;
                case 1:
                    await this.io.sln("ALL RIGHT!!  A member of the more ADVANCED sex.  You had better win.");
                    break;
                case 2:
                    await this.io.sln("Good.  Men rule this earth.  We own and run EVERYTHING.");
                    break;
                case 3:
                    await this.io.sln("Then don't be wearing any dresses, eh.");
                    break;
                case 4:
                    await this.io.sln("Very good.  If a woman ever beats you in battle, go into exile.");
                    break;
            }
        } else {
            switch (random(5)) {
                case 0:
                    await this.io.sln("Good.  Teach those men that they do NOT rule the world.");
                    break;
                case 1:
                    await this.io.sln("ALL RIGHT!!  A member of the more ADVANCED sex.  You had better win.");
                    break;
                case 2:
                    await this.io.sln("Excellent.  Taunt the men, tease them, and break their hearts!");
                    break;
                case 3:
                    await this.io.sln("Be warned, you are going to have to fight, kill and maim here.");
                    break;
                case 4:
                    await this.io.sln("Good.  There are way too many men in this land..");
                    break;
            }
        }
        await this.io.sln();
        np.clss = await this.chooseProfession(false);
        plen = this.playerLength();
        for (i = 0; i < plen; i += 1) {
            this.player = this.playerGet(i, true);
            if (this.player && this.player.name === "X" && this.player.Yours) {
                this.player.reInit();
                this._applyPartialRecord(np);
                // In this port user.name is the unique login username (unlike SBBS where real name was not unique).
                this.player.real_name = this.user.name;
                this.player.put(false);
                break;
            }
            if (this.player) {
                this.player.unLock();
            }
        }
        if (i === plen) {
            this.player = this.playerNew(true);
            this._applyPartialRecord(np);
            // In this port user.name is the unique login username.
            if (this.player) {
                this.player.real_name = this.user.name;
                this.player.put(false);
            }
        }
        if (this.settings.res_days !== undefined && this.settings.res_days > 0) {
            if (this.player) this.player.gone = 0;
        } else {
            if (this.player) this.player.gone = -1;
        }
        if (this.player) {
            this.mail.killmail(this.player.Record);
        }
        await this.state.getState(true);
        // Can this even happen?  Isn't this done when the player is deleted?
        if (this.player && this.state.married_to_seth === this.player.Record) {
            this.state.married_to_seth = -1;
            this.storage.releaseNpcMarriage('seth');
        }
        if (this.player && this.state.married_to_violet === this.player.Record) {
            this.state.married_to_violet = -1;
            this.storage.releaseNpcMarriage('violet');
        }
        this.state.putState();
        await this.game.hello();
    }

    // ── Login and session ────────────────────────────────────────────

    async loadPlayer(create: boolean): Promise<void> {
        let i: number;
        let ch: string;
        let op: LoadedPlayerRecord | null;

        InactiveResurrectionPolicy.applyDueResurrections(this.storage, this.settings);

        const plen = this.playerLength();
        for (i = 0; i < plen; i += 1) {
            this.player = this.playerGet(i);
            // user.name is the unique login username in this port.
            if (this.player && this.player.real_name === this.user.name && this.player.Yours) {
                break;
            }
        }
        // user.name is the unique login username in this port.
        if (this.player == null || this.player.real_name !== this.user.name || !this.player.Yours) {
            // Player not found - clear this.player so the stats provider returns null
            // (prevents a stale player record from briefly appearing in the status bar)
            this.player = null;
            if (create) {
                this.io.sclrscr();
                if (this.rip) await this.io.showRip("W5");
                await this.io.sln();
                await this.io.sln();
                this.io.foreground(15);
                await this.io.sln("Joining The Game");
                this.io.foreground(10);
                await this.io.sln(this.io.divider());
                this.io.foreground(2);
                await this.io.sln("You have never visited the realm before.  Do you want to join this place of Dragons, Knights, Magic, Friends & Foes and Good & Evil?");
                await this.io.sln();
                await this.io.lln("`2(`0Y`2)es.");
                await this.io.lln("`2(`0N`2)o.");
                await this.io.sln();
                this.io.foreground(10);
                ch = await this.io.prompt(
                    "  `2Your choice?  `2[`0Y`2] : `%",
                    [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                    'join_game',
                    { defaultKey: 'Y', leadingBlank: true, trailingBlank: false }
                );
                if (ch !== "Y") {
                    await this.game.quitMsg();
                    throw new GameExitError();
                }
                await this.newPlayer();
            }
        } else {
            if (HiddenPlayerPolicy.isPlayerHidden(this.storage, this.player.Record)) {
                HiddenPlayerPolicy.unhidePlayer(this.storage, this.player.Record);
            }

            if (this.settings.prevent_login_while_offline_battle_pending === true) {
                const attackerRecord = this.battleCoordinator.checkBattle(this.player.Record);
                const opponentRecord = this.battleCoordinator.getOfflineBattleOpponent(this.player.Record);

                if (attackerRecord < 0 && opponentRecord >= 0) {
                    op = this.playerGet(opponentRecord);
                    await this.io.sln();
                    if (op) {
                        await this.io.lln('`2You cannot enter the realm while your unfinished battle with `0' + op.name + '`2 remains unresolved.');
                    } else {
                        await this.io.lln('`2You cannot enter the realm while your unfinished battle remains unresolved.');
                    }
                    await this.io.sln('`2Please return after the battle is resolved or ask the sysop to clear it.');
                    await this.io.sln();
                    await this.io.moreNoMail();
                    throw new GameExitError();
                }
            }

            this.player.on_now = true;
            this.player.put();
            try {
                if (typeof this.on_player_event === 'function') {
                    const uname = (this.player).name || '';
                    try { this.on_player_event('player_connect', uname); } catch (_e) { /* ignore */ }
                }
            } catch (_e) { /* ignore */ }
            await this._waitForBattleInProgress();
            await this.game.hello();
        }
    }

    private async _waitForBattleInProgress(): Promise<void> {
        if (!this.player) return;
        const attackerRecord = this.battleCoordinator.checkBattle(this.player.Record);
        if (attackerRecord >= 0) {
            const op = this.playerGet(attackerRecord);
            if (op) {
                const currentPlayer = this.player;
                if (this.rip) await this.io.showRip("W1");
                await this.io.lln("`%" + op.name + "`2 is currently battling you");
                do {
                    await this.io.mswait(500);
                    currentPlayer.reLoad();
                    op.reLoad();
                    this.io.sw("\r");
                    this.io.print("\r");
                    if (this.io.cleareol) this.io.cleareol();
                    await this.io.lw("Your HP: " + prettyInt(currentPlayer.hp) + "\tHis HP: " + prettyInt(op.hp));
                    // Defensive: if the attacker is no longer online the battle
                    // lock is orphaned (e.g. crash or missed cleanup). Clear it
                    // so the entering player is not stuck here indefinitely.
                    if (!op.on_now) {
                        this.battleCoordinator.clearBattleLock(this.player.Record);
                        break;
                    }
                } while (this.battleCoordinator.hasBattleLock(this.player.Record));
            } else {
                this.battleCoordinator.clearBattleLock(this.player.Record);
            }
        }
    }

    // ── Stat mutations ────────────────────────────────────────────────

    async raiseClass(): Promise<void> {
        await this.io.sln();

        if (!this.player) return;

        if (this.player.skillw > 39 && this.player.skillm > 39 && this.player.skillt > 39) {
            await this.io.lln("`%** `0YOU HAVE ALREADY MASTERED ALL SKILLS `%**");
            return;
        }
        switch (this.player.clss) {
            case 1:
                if (this.player.skillw > 39) {
                    await this.io.lln("`%** `0YOU HAVE ALREADY MASTERED THIS CLASS `%**");
                    await this.io.sln();
                    return;
                }
                break;
            case 2:
                if (this.player.skillm > 39) {
                    await this.io.lln("`%** `0YOU HAVE ALREADY MASTERED THIS CLASS `%**");
                    await this.io.sln();
                    return;
                }
                break;
            case 3:
                if (this.player.skillt > 39) {
                    await this.io.lln("`%** `0YOU HAVE ALREADY MASTERED THIS CLASS `%**");
                    await this.io.sln();
                    return;
                }
                break;
        }

        await this.io.lln("`%** `0YOUR CLASS SKILL IS RAISED BY ONE! `%**");
        await this.io.sln();
        if (this.player.clss === 1) {
            await this._raiseDeathKnight();
        } else if (this.player.clss === 2) {
            await this._raiseMystical();
        } else if (this.player.clss === 3) {
            await this._raiseThief();
        }
        await this.io.sln();
    }

    private async _raiseDeathKnight(): Promise<void> {
        if (!this.player) return;
        this.player.skillw += 1;
        const deathKnightUsePointDivisor = resolveDeathKnightUsePointDivisor(this.settings);
        const deathKnightRemainder = this.player.skillw % deathKnightUsePointDivisor;
        if (deathKnightRemainder === 0) {
            await this.io.lln(
                "  `2You now have `0" +
                    prettyInt(parseInt(String(this.player.skillw / deathKnightUsePointDivisor), 10)) +
                    "`2 uses of Death Knight Skills a day.",
            );
            this.player.levelw += 1;
            await this.io.sln();
            if (this.player.skillw === 40) {
                await this.io.sln("You have mastered The Death Knight Skills Completely.  You may choose to learn a NEW skill now.");
                await this.io.sln();
                this.player.clss = await this.chooseProfession(false);
            } else {
                await this.io.sln("(" + lessonCountWord(deathKnightUsePointDivisor) + " more lessons needed for next raise in uses per day)");
            }
        } else {
            const lessonsRemaining = deathKnightUsePointDivisor - deathKnightRemainder;
            await this.io.sln(
                "You need " +
                    lessonCountWord(lessonsRemaining) +
                    " more " +
                    (lessonsRemaining === 1 ? 'lesson' : 'lessons') +
                    " to also raise your Death Knight Uses Per Day.",
            );
        }
    }

    private async _raiseMystical(): Promise<void> {
        if (!this.player) return;
        this.player.skillm += 1;
        await this.io.sln();
        await this.io.lln("`2You now have `0" + prettyInt(this.player.skillm) + "`2 Mystical Skill points a day.");
        this.player.levelm += 1;
        switch (this.player.skillm % 4) {
            case 0:
                await this.io.sln();
                await this.io.more();
                await this.io.lln("`c`%**  MYSTICAL INSTRUCTION **", 22);
                await this.io.sln();
                this.io.foreground(2);
                await this.io.sln("An old man with a long white beard suddenly appears next to you.");
                await this.io.sln();
                await this.io.lln("`0\"You're ready for your next lesson " + (this.player.sex === "F" ? "my girl!" : "boy!"));
                await this.io.sln();
                await this.io.more();
                if (this.player.skillm === 4) {
                    await this.io.lln("`0\"You ever been chased by a monster that just wouldn't quit?  I have, Muh wife!  Heehee! In a case like that there is only one thing to do! Disappear!\"");
                }
                if (this.player.skillm === 8) {
                    await this.io.lln("`0\"Ok, you're still new at this, but I think you're ready for a little trick I call The Heat Wave.  This little 'beaut will blow a wind that not only warms your enemy, it cooks him.\"");
                }
                if (this.player.skillm === 12) {
                    await this.io.lln('`0"Ok, pardner, lemmie give it to ya straight.  Sometimes yer enemy is stronger then ya.  Ya need an advantage.  For instance, having a protective Light Shield wrapped around ya.  Half damage!"');
                }
                if (this.player.skillm === 16) {
                    await this.io.lln('`0"Ok, sometimes ya lose your temper, and you want to vent your anger in a contructive way?  Am I right?  Causing someone\'s bones to shatter is a great way to relieve stress."');
                }
                if (this.player.skillm === 20) {
                    await this.io.lln('`0"This is also your LAST lesson!" `2the old man\'s face turns sober.  `0"You have finally shown enough control to master the most complicated thing. Your body.  Healing yourself with your mind is an awesome power."');
                }
                await this.io.sln();
                await this.io.lln("`2The old man vanishes as quickly as he appeared.");
                if (this.player.skillm === 40) {
                    await this.io.sln();
                    await this.io.sln("You have mastered the Mystical skills Completely.  You may choose to learn a NEW skill now.");
                    await this.io.sln();
                    this.player.clss = await this.chooseProfession(false);
                }
                await this.io.sln("(four more lessons needed to learn a new Mystical Skill)");
                break;
            case 3:
                await this.io.sln("You need only one more lesson to learn a new Mystical Skill.");
                break;
            case 2:
                await this.io.sln("You need two more lessons to learn a new Mystical Skill.");
                break;
            case 1:
                await this.io.sln("You need three more lessons to learn a new Mystical Skill.");
                break;
        }
    }

    private async _raiseThief(): Promise<void> {
        if (!this.player) return;
        this.player.skillt += 1;
        const thiefUsePointDivisor = resolveThiefUsePointDivisor(this.settings);
        const thiefRemainder = this.player.skillt % thiefUsePointDivisor;
        if (thiefRemainder === 0) {
            await this.io.lln(
                "  `2You now have `0" +
                    prettyInt(parseInt(String(this.player.skillt / thiefUsePointDivisor), 10)) +
                    "`2 uses of The Thieving Skills a day.",
            );
            this.player.levelt += 1;
            await this.io.sln();
            if (this.player.skillt === 40) {
                await this.io.sln();
                await this.io.sln("You have mastered The Thieving Knight Skills Completely.  You may choose to learn a NEW skill now.");
                await this.io.sln();
                this.player.clss = await this.chooseProfession(false);
            }
            await this.io.sln("(" + lessonCountWord(thiefUsePointDivisor) + " more lessons needed for next raise in uses per day)");
        } else {
            const lessonsRemaining = thiefUsePointDivisor - thiefRemainder;
            await this.io.sln(
                "You need " +
                    (lessonsRemaining === 1 ? 'only ' : '') +
                    lessonCountWord(lessonsRemaining) +
                    " more " +
                    (lessonsRemaining === 1 ? 'lesson' : 'lessons') +
                    " to also raise your Thieving Uses Per Day.",
            );
        }
    }

    checkFields(): void {
        if (!this.player) return;

        if (this.player.hp < 0) {
            this.player.hp = 0;
        }
        if (this.player.hp > 32000) {
            this.player.hp = 32000;
        }
        if (this.player.hp_max < 0) {
            this.player.hp_max = 0;
        }
        if (this.player.hp_max > 32000) {
            this.player.hp_max = 32000;
        }
        if (this.player.forest_fights < 0) {
            this.player.forest_fights = 0;
        }
        if (this.player.forest_fights > 32000) {
            this.player.forest_fights = 32000;
        }
        if (this.player.pvp_fights < 0) {
            this.player.pvp_fights = 0;
        }
        if (this.player.pvp_fights > 32000) {
            this.player.pvp_fights = 32000;
        }
        if (this.player.gold < 0) {
            this.player.gold = 0;
        }
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        if (this.player.bank < 0) {
            this.player.bank = 0;
        }
        if (this.player.bank > 2000000000) {
            this.player.bank = 2000000000;
        }
        if (this.player.def < 0) {
            this.player.def = 0;
        }
        if (this.player.def > 32000) {
            this.player.def = 32000;
        }
        if (this.player.str < 0) {
            this.player.str = 0;
        }
        if (this.player.str > 32000) {
            this.player.str = 32000;
        }
        if (this.player.cha < 0) {
            this.player.cha = 0;
        }
        if (this.player.cha > 32000) {
            this.player.cha = 32000;
        }
        if (this.player.exp < 0) {
            this.player.exp = 0;
        }
        if (this.player.exp > 2000000000) {
            this.player.exp = 2000000000;
        }
        if (this.player.laid < 0) {
            this.player.laid = 0;
        }
        if (this.player.laid > 32000) {
            this.player.laid = 32000;
        }
        if (this.player.kids < 0) {
            this.player.kids = 0;
        }
        if (this.player.kids > 32000) {
            this.player.kids = 32000;
        }
    }
}

export default Player;
