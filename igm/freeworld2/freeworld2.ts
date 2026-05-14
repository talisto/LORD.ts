/**
 * The FreeWorld II v1.0 - LORD IGM
 * Original Pascal source by Chris Martino and Mike Preslar (2005)
 * Ported to TypeScript for lord-ts.
 *
 * A once-per-day adventure IGM where players explore a magical world,
 * visit the High Chancellor for a gold-prize guessing game, and stumble
 * upon random events including the famous Wishing Well.
 *
 * Faithful port of the original, with the four identical "path goes forever"
 * no-op walk events replaced by four distinct flavor events.
 */
import * as fs from 'fs';
import * as path from 'path';
import { random, prettyInt } from '@lordts/util/Util';
import { preprocessAnsi80 } from '@lordts/util/ANSI';
import { cp437toUnicode } from '@lordts/util/CP437';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type State from '@lordts/core/State';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IgmDeps } from '@lordts/igm/IgmDeps';

// ── Constants ─────────────────────────────────────────────────────────────────

const IGM_VERSION = 'TS v1.0';
const IGM_DISPLAY_NAME = '`0The `%FreeWorld `0II';
const MAX_WALKS_PER_SESSION = 5;

// ── Record definition ─────────────────────────────────────────────────────────

const FW2_Defs = [
    { prop: 'lrdrecord', type: 'SignedInteger', def: -1 },
    { prop: 'day',       type: 'Integer',       def: 0  },
];

interface Fw2Record {
    lrdrecord: number;
    day: number;
    put(): void;
}

// ── Main class ────────────────────────────────────────────────────────────────

class FreeWorld2 {
    private io: IO;
    private player: Player;
    private state: State;
    private srcDir: string;
    private igmDir: string;
    private storage: IStorage;
    private fw2File: IRecordFile | null = null;
    private fw2Record: Fw2Record | null = null;

    // Session-only counters (not persisted - matching original behaviour).
    // The player can only visit once per day, but may still walk multiple
    // times within that one visit before the IGM sends them home.
    private walksToday = 0;
    private sawChancellor = false;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.state = deps.state;
        this.srcDir = deps.srcDir + path.sep;
        this.igmDir = path.join(deps.runtimeDir, 'freeworld2') + path.sep;
        this.storage = deps.storage;
    }

    static get desc(): string {
        return '`0The `%FreeWorld `0II';
    }

    // ── Entry point ──

    async run(): Promise<void> {
        if (!fs.existsSync(this.igmDir)) {
            fs.mkdirSync(this.igmDir, { recursive: true });
        }
        this.initRecord();

        // Daily limit: player may only visit once per LORD game-day
        if (this.record.day === this.state.days) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln(`\`0You Can't Seem To Find The Path To Take You To ${IGM_DISPLAY_NAME}\`%.`);
            await this.io.sln();
            await this.io.lln('`2Try Again Tomorrow`%...');
            await this.pressAKey();
            return;
        }

        // Mark today as visited before anything else so a crash doesn't
        // let the player replay the IGM.
        this.record.day = this.state.days;
        this.record.put();

        await this.showIntro();
        await this.mainMenu();

        // Ensure player record is saved on clean exit
        this.player.put();
    }

    // ── Record management ──

    private initRecord(): void {
        this.fw2File = this.storage.create(
            this.igmDir + 'fw2.dat', FW2_Defs,
        );
        // One persistent row per LORD player, keyed by Record number.
        let found = false;
        for (let i = 0; i < this.fw2File.length; i++) {
            const rec = this.fw2File.get(i) as unknown as Fw2Record;
            if (rec.lrdrecord === this.player.Record) {
                this.fw2Record = rec;
                found = true;
                break;
            }
        }
        if (!found) {
            this.fw2Record = this.fw2File.new() as unknown as Fw2Record;
            this.fw2Record.lrdrecord = this.player.Record;
            this.fw2Record.day = 0;
            this.fw2Record.put();
        }
    }

    private get record(): Fw2Record {
        if (!this.fw2Record) throw new Error('FreeWorld2 record not initialized');
        return this.fw2Record;
    }

    // ── Shared UI helpers ──

    private async pressAKey(): Promise<void> {
        await this.io.sln();
        await this.io.lw('`0<`2MORE`0> ');
        this.io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
    }

    private async showAnsiFile(filename: string): Promise<void> {
        const ansFile = path.join(this.srcDir, filename);
        if (!fs.existsSync(ansFile)) return;
        // Preprocess the bundled 80-column ANSI art so wider modern terminals
        // keep the original hard line breaks instead of wrapping unpredictably.
        const raw = cp437toUnicode(fs.readFileSync(ansFile, 'latin1'));
        for (const line of preprocessAnsi80(raw)) {
            await this.io.lw(line);
            await this.io.sln();
        }
        await this.pressAKey();
        this.io.sclrscr();
    }

    // ── Screens ──

    private async showIntro(): Promise<void> {
        this.io.sclrscr();
        await this.showAnsiFile('INTRO1.ANS');
        await this.io.sln();
        await this.io.lln(`           \`@LORD IGM\`%: ${IGM_DISPLAY_NAME} \`$v\`21\`%.\`20`);
        await this.io.sln();
        await this.io.lln('`$-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
        await this.io.lln('           `@• `$AUTHOR`%:  `0Chris Martino');
        await this.io.sln();
        await this.io.lln('           `@• `$LANGUAGE`%: `!VIRTUAL PASCAL `%v2.1');
        await this.io.sln();
        await this.io.lln('           `@• `$SPECIAL THANKS`%: `!Michael Preslar And Rick Parrish');
        await this.io.sln();
        await this.io.lln('           `@• `$IGM INFO`%: `!This Is A Remake Of The FreeWorld IGM');
        await this.io.lln('                       `!Full Rewrite. Color Scheme From ANGEL Door Kit.');
        await this.io.sln();
        await this.io.lln('                       `!Ported to TypeScript: `0' + IGM_VERSION);
        await this.io.sln();
        await this.io.lln('                       `!IGM Can Only Be Played Once A Day');
        await this.pressAKey();
    }

    private async showStats(): Promise<void> {
        this.io.sclrscr();
        const p = this.player;
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US');
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        await this.io.sln();
        await this.io.lln(`\`2${p.name}'\`%\`2s Stats...     \`2${dateStr}     \`2${timeStr}`);
        await this.io.lln('`2-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');

        await this.io.lln(`\`2Experience   \`%: \`0${p.exp}`);
        await this.io.lln(`\`2Games Won    \`%: \`0${p.drag_kills}`);
        await this.io.lln(`\`2Game Level   \`%: \`0${p.level}`);
        await this.io.lln(`\`2Hit Points   \`%: \`0${p.hp} \`2of \`0${p.hp_max}`);
        await this.io.lln(`\`2Forest Fights\`%: \`0${p.forest_fights}`);
        await this.io.lln(`\`2Player Fights\`%: \`0${p.pvp_fights}`);
        await this.io.lln(`\`2Gold on Hand \`%: \`0${p.gold}`);
        await this.io.lln(`\`2Gold in Bank \`%: \`0${p.bank}`);

        if (p.weapon_num < 10) {
            await this.io.lln(`\`2Weapon  [\`0${p.weapon_num}\`%]   \`%: \`0${p.weapon}`);
        } else {
            await this.io.lln(`\`2Weapon [\`0${p.weapon_num}\`%]    \`%: \`0${p.weapon}`);
        }

        await this.io.lln(`\`2Strength     \`%: \`0${p.str}`);

        if (p.arm_num < 10) {
            await this.io.lln(`\`2Armour  [\`0${p.arm_num}\`%]   \`%: \`0${p.arm}`);
        } else {
            await this.io.lln(`\`2Armour [\`0${p.arm_num}\`%]    \`%: \`0${p.arm}`);
        }

        await this.io.lln(`\`2Defense      \`%: \`0${p.def}`);
        await this.io.lln(`\`2Charm        \`%: \`0${p.cha}`);
        await this.io.lln(`\`2Gems         \`%: \`0${p.gem}`);
        await this.io.lln(`\`2Kills        \`%: \`0${p.pvp}`);
        await this.io.lln(`\`2Lays         \`%: \`0${p.laid}`);

        if (p.kids <= 0) {
            await this.io.lln('`2Children     `%: `0None.');
        } else {
            await this.io.lln(`\`2Children     \`%: \`0${p.kids}`);
        }

        await this.io.sln();

        // Skill points
        const skillRows: Array<{ label: string; skill: number; uses: number }> = [
            { label: '`%Death Knight Skills', skill: p.skillw, uses: p.levelw },
            { label: '`%    Mystical Skills',  skill: p.skillm, uses: p.levelm },
            { label: '`%    Thieving Skills',  skill: p.skillt, uses: p.levelt },
        ];
        for (const row of skillRows) {
            if (row.skill > 0 || row.uses > 0) {
                const mastered = row.skill >= 40 ? ' `0(`%MASTERED`0)' : '';
                await this.io.lln(`${row.label}\`%: \`$${row.skill}${mastered}  \`%Uses Today\`%: \`$${row.uses}`);
            } else {
                await this.io.lln(`${row.label}\`%: \`0None.       \`%Uses Today\`%: \`$${row.uses}`);
            }
        }

        await this.io.sln();

        const classLabel =
            p.clss === 1 ? '`$Death Knight ' :
            p.clss === 2 ? '`$Mystical '     : '`$Thieving ';
        await this.io.lln(`\`0You are currently interested in ${classLabel}\`0Skills.`);

        await this.io.sln();

        // Marriage: player-to-player
        if (p.married_to > -1) {
            const allP = this.player.allPlayers();
            const spouse = allP[p.married_to];
            const spouseName = spouse ? spouse.name : '(unknown)';
            await this.io.lln(`\`0You are married to \`$${spouseName}\`0.`);
        }

        // Marriage: to NPC characters
        if (p.sex === 'F') {
            if (this.state.married_to_seth === p.Record) {
                await this.io.lln('`0You are married to `$Seth Able`0.');
            }
        } else {
            if (this.state.married_to_violet === p.Record) {
                await this.io.lln('`0You are married to `$Violet`0.');
            }
        }

        if (p.horse) {
            await this.io.lln('`0Your `$Horse `0is tied up outside, to a tree.');
        }
        if (p.has_fairy) {
            await this.io.lln('`$You have a `2Fairy `$in your pocket.');
        }

        await this.io.sln();
        await this.pressAKey();
    }

    // ── Main menu ──

    private async mainMenu(): Promise<void> {
        let done = false;
        while (!done) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln(`\`0The \`%FreeWorld \`0II \`$v\`21\`%.\`20 \`%Menu`);
            await this.io.lln('`2-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
            await this.io.sln();
            await this.io.lln('`2(`5W`2)alk Around');
            await this.io.lln('`2(`5H`2)igh Chancellor');
            await this.io.lln('`2(`5V`2)iew Your Stats');
            await this.io.lln(`\`2(\`5I\`2)nfo On ${IGM_DISPLAY_NAME} \`$v\`21\`%.\`20`);
            await this.io.lln('`2(`5Q`2)uit Back To `4Lord');
            await this.io.sln();
            await this.io.lw('`2Enter Option: ');

            this.io.emitPrompt('fw2_main_menu', [
                { key: 'W', label: 'Walk Around' },
                { key: 'H', label: 'High Chancellor' },
                { key: 'V', label: 'View Stats' },
                { key: 'I', label: 'Info' },
                { key: 'Q', label: 'Quit' },
            ]);
            let ch: string;
            do { ch = (await this.io.getkey()).toUpperCase(); } while ('WHVIQ'.indexOf(ch) === -1);
            await this.io.lw(ch);
            await this.io.sln();

            switch (ch) {
                case 'W':
                    this.walksToday++;
                    if (this.walksToday > MAX_WALKS_PER_SESSION) {
                        this.io.sclrscr();
                        await this.io.sln();
                        await this.io.lln('`2You Used All Your Turns For Today Please Play Again Tomorrow`%!');
                        await this.io.sln();
                        await this.io.lln('`$Returning To `2Legend Of The `4Red `2Dragon.....');
                        await this.io.mswait(2000);
                        done = true;
                    } else {
                        await this.walk();
                    }
                    break;
                case 'H':
                    await this.highChancellor();
                    break;
                case 'V':
                    await this.showStats();
                    break;
                case 'I':
                    await this.oleManInfo();
                    break;
                case 'Q':
                    done = true;
                    break;
            }
        }

        if (this.walksToday <= MAX_WALKS_PER_SESSION) {
            // Normal exit (Q was pressed)
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`$Returning To `2Legend Of The `4Red `2Dragon.....');
            await this.io.mswait(2000);
        }
    }

    // ── Walk Around ──

    private async walk(): Promise<void> {
        const wk = random(10) + 1; // 1–10
        await this.io.sln();
        await this.io.sln();

        switch (wk) {
            case 1:
                await this.walkTripIntoPit();
                break;
            case 2:
                await this.walkFairyRestores();
                break;
            case 3:
                await this.walkNapUnderTree();
                break;
            case 4:
                await this.wishingWell();
                break;
            case 5:
                // Replaced duplicate: path fades into undergrowth
                await this.io.lln('`2The Path You Follow Fades Into Thick Undergrowth`%.');
                await this.io.lln('`2After Some Struggling, You Find Your Way Back`%.');
                await this.pressAKey();
                break;
            case 6:
                await this.fairyWizard();
                break;
            case 7:
                // Replaced duplicate: ancient ruins
                await this.io.lln('`2You Spot Ancient Ruins Carved Into The Hillside`%...');
                await this.io.lln('`2But They Crumble And Collapse As You Approach`%.');
                await this.io.lln('`2You Back Away Slowly`%.');
                await this.pressAKey();
                break;
            case 8:
                // Replaced duplicate: abandoned campfire
                await this.io.lln('`2A Warm Campfire Still Smolders Nearby`%.');
                await this.io.lln('`2Someone Was Here Recently`%...');
                await this.io.lln('`2You Listen Carefully`%... `%But Hear Nothing`%.');
                await this.pressAKey();
                break;
            case 9:
                // Replaced duplicate: dark cloaked figure
                await this.io.lln('`2A Figure In A Dark Cloak Passes You On The Trail`%.');
                await this.io.lln('`2They Say Nothing`%... `2And Vanish Into The Mist`%.');
                await this.io.lln('`2You Wonder Who That Could Have Been`%.');
                await this.pressAKey();
                break;
            case 10:
                await this.leatherPouch();
                break;
        }
    }

    private async walkTripIntoPit(): Promise<void> {
        const hl = random(Math.max(1, this.player.hp)) + 1;
        this.player.hp = Math.max(1, this.player.hp - hl);
        this.player.put();
        await this.io.lln('`2Your Walking Along And Trip And Fall Into A `4Pit`%!!!');
        await this.io.lln('`2After Climbing Out You Notice Your Hurt`%.');
        await this.io.lln(`\`2You Lost \`4${hl} Hit Points\`%!`);
        await this.pressAKey();
    }

    private async walkFairyRestores(): Promise<void> {
        this.player.hp = this.player.hp_max;
        this.player.put();
        await this.io.lln('`2You Wander Into Some Thick Brush And Tree\'s`%.');
        await this.io.lln('`2A Bright `%White `2Light Start\'s To Come Towards You`%.');
        await this.io.lln('`2As It Gets Closer You Notice It\'s A Fairy`%!');
        await this.io.lln('`2She Looks You Over And Says A Few Words That You Dont Understand`%.');
        await this.io.lln('`2All Your `%Hitpoints `2Are Fully Restored`%!');
        await this.pressAKey();
    }

    private async walkNapUnderTree(): Promise<void> {
        await this.io.lln('`2You Wander Into Some Thick Brush And Tree\'s`%.');
        await this.io.lln('`2Your Starting To Get Tired`%.');
        await this.io.lw('`2You Find A Nice Tree And Settle In For A Nap`%...');
        await this.io.mswait(1500);
        await this.io.lw('`%...');
        await this.io.mswait(1500);
        await this.io.lw('`%...');
        await this.io.mswait(1500);
        await this.io.lw('`%...');
        this.io.print('\n');
        await this.io.lln('`2You Wake Up Fully Refreshed`%!');
        await this.pressAKey();
    }

    // ── Wishing Well ──

    private async wishingWell(): Promise<void> {
        await this.io.lln('`2You Stumble Upon A Wishing Well`%!!!');
        await this.io.lln('`2What Do You Want To Wish For`%?');
        await this.io.sln();
        await this.io.lln('`%A`$. Strength     `%B`$. Charm');
        await this.io.lln('`%C`$. Defense      `%D`$. Forest Fights');
        await this.io.lln('`%E`$. Human Fights `%F`$. Hit Points');
        await this.io.lln('`%G`$. Gold In Bank `%H`$. Lays');
        await this.io.lln('`%I`$. Experience   `%J`$. Gold');
        await this.io.lln('`%K`$. Kids         `%L`$. Gems');
        await this.io.lln('`%M`$. Skill Points');
        await this.io.sln();
        await this.io.lw('`2Enter Choice: ');

        this.io.emitPrompt('fw2_wishing_well', [
            { key: 'A', label: 'Strength' }, { key: 'B', label: 'Charm' },
            { key: 'C', label: 'Defense' }, { key: 'D', label: 'Forest Fights' },
            { key: 'E', label: 'Human Fights' }, { key: 'F', label: 'Hit Points' },
            { key: 'G', label: 'Gold In Bank' }, { key: 'H', label: 'Lays' },
            { key: 'I', label: 'Experience' }, { key: 'J', label: 'Gold' },
            { key: 'K', label: 'Kids' }, { key: 'L', label: 'Gems' },
            { key: 'M', label: 'Skill Points' },
        ]);
        let ch: string;
        do { ch = (await this.io.getkey()).toUpperCase(); } while ('ABCDEFGHIJKLM'.indexOf(ch) === -1);
        await this.io.lw(ch);
        await this.io.sln();

        // 1-in-3 chance of the wish being granted
        const granted = (random(3) + 1) === 3;

        if (ch === 'M') {
            if (granted) {
                // Randomly pick one of the three skill types to boost
                const t = random(3) + 1;
                if (t === 1) this.player.skillw += random(1) + 1;
                else if (t === 2) this.player.skillm += random(1) + 1;
                else this.player.skillt += random(1) + 1;
                this.player.put();
                await this.io.lln('`2Wish Granted`%!!');
            } else {
                await this.io.lln('`2Not Your Lucky Day`%!!');
            }
            await this.pressAKey();
            return;
        }

        type WishEntry = { apply: (n: number) => void; maxAmt: number };
        const wishMap: Record<string, WishEntry> = {
            A: { apply: (n) => { this.player.str          += n; }, maxAmt: 100  },
            B: { apply: (n) => { this.player.cha          += n; }, maxAmt: 10   },
            C: { apply: (n) => { this.player.def          += n; }, maxAmt: 100  },
            D: { apply: (n) => { this.player.forest_fights += n; }, maxAmt: 10   },
            E: { apply: (n) => { this.player.pvp_fights   += n; }, maxAmt: 10   },
            F: { apply: (n) => { this.player.hp_max       += n; }, maxAmt: 30   },
            G: { apply: (n) => { this.player.bank         += n; }, maxAmt: 5000 },
            H: { apply: (n) => { this.player.laid         += n; }, maxAmt: 1    },
            I: { apply: (n) => { this.player.exp          += n; }, maxAmt: 5000 },
            J: { apply: (n) => { this.player.gold         += n; }, maxAmt: 5000 },
            K: { apply: (n) => { this.player.kids         += n; }, maxAmt: 1    },
            L: { apply: (n) => { this.player.gem          += n; }, maxAmt: 10   },
        };

        const wish = wishMap[ch];
        if (wish) {
            if (granted) {
                wish.apply(random(wish.maxAmt) + 1);
                this.player.put();
                await this.io.lln('`2Wish Granted`%!!');
            } else {
                await this.io.lln('`2Not Your Lucky Day`%!!');
            }
        }
        await this.pressAKey();
    }

    // ── Fairy Wizard ──

    private async fairyWizard(): Promise<void> {
        // Gold scales with level: 50,000 per level, capped at 700,000.
        // Cap is intentionally below Felicity's 750,000 buy price to prevent a buy-and-flip loop.
        const fairyGold = Math.min(700_000, this.player.level * 50_000);
        await this.io.lln('`2Your Journey Brings You To A Dark Area Of The Forest`%.');
        await this.io.lw('`2You Begin To Examine The Area`%...');
        await this.io.mswait(1500);
        await this.io.lw('`%...');
        await this.io.mswait(1500);
        await this.io.lw('`%...');
        this.io.print('\n');
        await this.io.mswait(1500);
        await this.io.lln('`5POOOOOOFFFF!');
        await this.io.lln('`2You See A Cloud Of Smoke..As It Begins To Clear You Notice A Dark Figure.');
        await this.io.lln('`%I\'m The Great Fairy Wizard`%! `2I Offer You `2$`0' + prettyInt(fairyGold) + ' `2Reward For A `%Fairy!');
        await this.io.lw('`2Accept Offer`%[`2Y`%/`2N`%]`2: ');

        this.io.emitPrompt('fw2_fairy_wizard', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let ch: string;
        do { ch = (await this.io.getkey()).toUpperCase(); } while ('YN'.indexOf(ch) === -1);
        await this.io.lw(ch);
        await this.io.sln();

        if (ch === 'Y') {
            if (this.player.has_fairy) {
                this.player.has_fairy = false;
                this.player.gold += fairyGold;
                this.player.put();
                await this.io.sln();
                await this.io.lln('`2You Give Him Your Fairy In Exchange For The Cash');
            } else {
                await this.io.sln();
                await this.io.lln('`2You Don\'t Have A Fairy`%!!!!!');
            }
        }
        await this.pressAKey();
    }

    // ── Leather Pouch ──

    private async leatherPouch(): Promise<void> {
        await this.io.lln('`2You See A Leather Pouch On The Ground`%!!!');
        await this.io.lw('`2Pick It Up`%[`2Y`%/`2N`%]`2: ');

        this.io.emitPrompt('fw2_leather_pouch', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let ch: string;
        do { ch = (await this.io.getkey()).toUpperCase(); } while ('YN'.indexOf(ch) === -1);
        await this.io.lw(ch);
        await this.io.sln();

        if (ch === 'Y') {
            const roll = random(3) + 1;
            if (roll === 3) {
                const goldAmt = random(10000) + 1;
                await this.io.lln('`2You Find `$$' + goldAmt + ' `2Gold Coins Inside`%!');
                this.player.gold += goldAmt;
                this.player.put();
            } else {
                const expLoss = random(Math.max(1, this.player.exp)) + 1;
                this.player.exp = Math.max(0, this.player.exp - expLoss);
                this.player.put();
                await this.io.lln(`\`2You Get Stung By A Scorpion You Lose ${expLoss} Experience Points\`%!`);
            }
        } else {
            await this.io.lln('`2You Continue Your Journey`%.');
        }
        await this.pressAKey();
    }

    // ── High Chancellor ──

    private async highChancellor(): Promise<void> {
        if (this.sawChancellor) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`2You Can Only See The Chancellor Once A Day`%!');
            await this.pressAKey();
            return;
        }
        this.sawChancellor = true;

        this.io.sclrscr();
        await this.showAnsiFile('CHANCE.ANS');

        await this.io.sln();
        await this.io.lln('`0The Chancellor Is Very Busy`%.');
        await this.io.lln('`2But, He Will Pay You `$Gold `2If You Can Pass A Test`%!');
        await this.io.sln();
        await this.io.lw('`2Accept Offer`%[`2Y`%/`2N`%]`2: ');

        this.io.emitPrompt('fw2_chancellor_offer', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let choice: string;
        do { choice = (await this.io.getkey()).toUpperCase(); } while ('YN'.indexOf(choice) === -1);
        await this.io.lw(choice);
        await this.io.sln();

        if (choice === 'N') {
            await this.io.sln();
            await this.io.lln('`4Don\'t Waste My Time');
            await this.pressAKey();
            return;
        }

        // Guessing game: pick a number 1–100, player has 5 tries
        const target = random(100) + 1;
        await this.io.sln();
        await this.io.lln('`%Very Well`2, Here Is A Test`%.');
        await this.io.sln();
        await this.io.lln('`2Guess A Number Between `%1 `2And `%100 `2In Less Than `%5 Tries`%.');

        let won = false;
        for (let tries = 0; tries < 5 && !won; tries++) {
            await this.io.sln();
            await this.io.lw('`%Your Answer: `2');
            this.io.emitPrompt('fw2_chancellor_guess', [], 'number');
            const input = await this.io.getstr({ len: 3, integer: true });
            const guess = parseInt(input, 10);

            if (isNaN(guess) || guess < 1 || guess > 100) {
                await this.io.lln('`%Please enter a number between 1 and 100.');
                // This try still counts against the 5 attempts (matching original)
                continue;
            }

            if (guess === target) {
                won = true;
                const prize = 50000;
                this.player.gold += prize;
                this.player.put();
                await this.io.lln('`2You Got It! The Chancellor Pays You `$' + prize + ' `2Gold Coins');
            } else if (guess < target) {
                await this.io.lln('`%Too Low!');
            } else {
                await this.io.lln('`%Too High!');
            }
        }

        if (!won) {
            await this.io.lln('`2You Didn\'t Get The Correct Number`%!');
        }
        await this.pressAKey();
    }

    // ── OLE MAN info ──

    private async oleManInfo(): Promise<void> {
        let done = false;
        while (!done) {
            this.io.sclrscr();
            await this.io.lln('`2As you get closer to read the carvings you notice something`%...');
            await this.io.lln('`2Someone else is here`%.');
            await this.io.lln('`2It is OLE MAN');
            await this.io.lln('`2You cautiously approach the OLE MAN');
            await this.io.lln('`2He seems to not notice you`%.....');
            await this.io.sln();
            await this.io.lln('`%[`2A`%]`2ttack');
            await this.io.lln('`%[`2Q`%]`2uestion');
            await this.io.lln('`%[`2L`%]`2eave');
            await this.io.sln();
            await this.io.lw('`2OTHER WORLDS `%(`2A`%,`2Q`%,`2L`%): ');

            this.io.emitPrompt('fw2_ole_man', [
                { key: 'A', label: 'Attack' },
                { key: 'Q', label: 'Question' },
                { key: 'L', label: 'Leave' },
            ]);
            let ch: string;
            do { ch = (await this.io.getkey()).toUpperCase(); } while ('AQL'.indexOf(ch) === -1);
            await this.io.lw(ch);
            await this.io.sln();

            if (ch === 'A') {
                await this.io.sln();
                await this.io.lln('`2You jump on the OLE MAN`%.....');
                await this.io.sln();
                await this.io.lln('`2In an instant the OLE MAN has you pinned to the ground');
                await this.io.lln('`2HE SAYS : Don\'t mess with me KID`%.... `2I`%\'`2ll feed you to the DRAGON`%!');
                await this.io.sln();
                await this.io.lln('`2The OLE MAN then lets you up and asks if you\'re OK`%?');
                await this.io.lln('`2You shake your head and quickly run off`%!');
                await this.io.lln('`2You wonder who the HELL was that`%?');
                await this.pressAKey();
            } else if (ch === 'Q') {
                await this.io.sln();
                await this.io.lln('`2He calmly replies `%:');
                await this.io.sln();
                await this.io.lln('`2This is my `%FreeWorld `0II`%.............');
                await this.io.lln('`2I can make many things happen when I use this dang MAGIC LAMP right`%.');
                await this.io.lln('`2I see you are a MIGHTY WARRIOR from the Legend of `4Red `2Dragon');
                await this.io.lln('`2I will tell you more`%!');
                await this.pressAKey();
            } else {
                // 'L' - leave
                done = true;
            }
        }
    }
}

export default FreeWorld2;
