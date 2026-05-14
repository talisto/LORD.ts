/**
 * Game - Main game session loop for LORD.
 *
 * Orchestrates the top-level player session: processes login, checks whether
 * daily maintenance is due, runs the main town loop, dispatches IGM hooks,
 * handles player death and re-entry, and performs end-of-session cleanup.
 */
"use strict";

import { random, time, strftime } from '@lordts/util/Util';
import { sendGameOverNotification } from './net/AdminNotify';
import type FileUtils from '@lordts/util/FileUtils';
import type { IStorage } from '@lordts/storage/IStorage';
import type { User, Connection, LoadedPlayerRecord, UiMode } from './types';
import type IGM from '@lordts/igm/IGM';
import type IO from './io/IO';
import type Log from './Log';
import type Mail from './Mail';
import type Rankings from './Rankings';
import type RedDragonInn from './locations/RedDragonInn';
import type { Settings } from './types';
import type State from './State';
import type Town from './locations/Town';
import type Player from './Player';
import type { IGMPlace } from './types';
import { Lazy } from '@lordts/util/Lazy';
import { GameExitError } from './GameExitError';
import { HiddenPlayerPolicy } from './HiddenPlayerPolicy';
import { PlayerIpHistoryPolicy } from './PlayerIpHistoryPolicy';

// (no class-level fields; all state is injected via constructor)
class Game {
    constructor(
        private io: IO,
        private fileUtils: FileUtils,
        private state: State,
        private settings: Settings,
        private log: Log,
        private _uiMode: UiMode,
        private user: User,
        private connection: Connection,
        private _mail: Lazy<Mail>,
        private _player: Lazy<Player>,
        private _rankings: Lazy<Rankings>,
        private _redDragonInn: Lazy<RedDragonInn>,
        private _igm: Lazy<IGM>,
        private _town: Lazy<Town>,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get storage(): IStorage { return this._storage.value; }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    set rip(v: boolean) { this._uiMode.mode = v ? 'rip' : 'ansi'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    get mail(): Mail { return this._mail.value; }

    get player(): Player { return this._player.value; }

    get rankings(): Rankings { return this._rankings.value; }

    get redDragonInn(): RedDragonInn { return this._redDragonInn.value; }
    get igm(): IGM { return this._igm.value; }
    get town(): Town { return this._town.value; }

    // ── Session messages ──────────────────────────────────────────────

    async quitMsg(): Promise<void> {
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        switch (random(5)) {
            case 0:
                await this.io.lln("`2The very earth groans at your depature.");
                return;
            case 1:
                await this.io.lln("`2The very trees seem to moan as you leave.");
                return;
            case 2:
                await this.io.lln("`2Echoing screams fill the wastelands as you close your eyes.");
                return;
            case 3:
                await this.io.lln("`2The black thing inside rejoices at your departure.");
                return;
            case 4:
                await this.io.lln("`2Your very soul aches as you wake up from your favorite dream.");
                return;
        }
        await this.io.sln();
        if (this.rip) {
            await this.io.showRip("EXIT");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
    }

    async hello(): Promise<void> {
        let op: LoadedPlayerRecord | null;

        this.storage.clearQuoteBuffer(this.player.Record);

        // safe_node: if another player was logged into this node (e.g. after
        // a crash), mark them offline before claiming the node for this session
        if (this.settings.safe_node) {
            const prevRecord = this.storage.getNodePlayer(this.connection.node);
            if (prevRecord !== null && prevRecord !== this.player.Record) {
                op = this.player.playerGet(prevRecord);
                if (op !== null) {
                    op.on_now = false;
                    op.put(false);
                }
            }
            this.storage.setNodePlayer(this.connection.node, this.player.Record);
        }

        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        // NOTE: Likely wrap checks... not needed.
        if (this.player.bank < 0) {
            this.player.bank = 0;
        }
        if (this.player.gold < 0) {
            this.player.gold = 0;
        }
        if (this.player.exp < 0) {
            this.player.exp = 0;
        }
        this.player.on_now = true;
        this.player.put();

        this.io.events?.emitSystem('login', { player: this.player.name });

        this.player.time_on = strftime("%I:%M", time());
        this.player.put();
        await this.io.warriorsOnNow(true);
        await this.io.sln();
        await this.log.createLog(false);
        // player.time tracks the last day they played; if it matches today
        // they get a limited return session (no wakeUp, can't play if dead)
        if (this.player.time === this.state.days) {
            this.io.foreground(2);
            await this.io.sln();
            await this.io.sln("You have already been on today.");
            if (this.player.inn) {
                await this.io.sln("You wake up early, sheathe your weapon, and head down to the bar.");
            }
            if (this.player.dead || this.player.hp < 1) {
                this.player.dead = true;
                await this.io.lln("`2You have been `4killed`2 today.  You will not be allowed to play until TOMORROW.");
                this.player.on_now = false;
                this.player.put();
                await this.io.sln();
                return;
            }
            await this.io.sln();
        } else {
            await this.redDragonInn.wakeUp();
        }
        // Spouse check: "hidden" (sysop-hidden) preserves marriage with a
        // hope message; "deleted" (name === "X") dissolves it and halves charm
        if (this.player.married_to > -1) {
            await this._checkSpouseStatus();
        }
        // In modern UI mode the terminal is empty at this point (intro screen was
        // handled as a graphical overlay), so there is nothing for the player to
        // acknowledge - skip the pre-stats <MORE> prompt.
        if (!this.modern) await this.io.moreNoMail();
        await this.io.showStats();
        if (this.mail.mailCheck()) {
            await this.io.sln();
            await this.io.lln("`%You have mail today!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.mail.checkMail();
        }
        await this.log.showLog();
        if (this.player.clss === 0) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("** You feel listless, you need a goal in life **");
            this.player.clss = await this.player.chooseProfession(false);
        }
        this.player.put();
    }

    async introMenu(): Promise<string> {
        let ch: string;
        // Center the menu block based on the longest visible line (31 chars)
        const menuIndent = this.rip ? 25 : Math.max(0, Math.floor((this.io.cols - 31) / 2));

        do {
            if (!this.rip) {
                await this.io.sln();
                await this.io.lln("`2(`0E`2)nter the realm of the Dragon", menuIndent);
                await this.io.lln("`2(`0I`2)nstructions", menuIndent);
                await this.io.lln("`2(`0L`2)ist Warriors", menuIndent);
                await this.io.lln("`2(`0Q`2)uit back to BBS", menuIndent);
            }
            do {
                await this.io.sln();
                await this.io.lw("`2Your choice, warrior? [`0E`2]: `%", menuIndent);
                this.io.emitPrompt('intro_menu', [
                    { key: 'E', label: 'Enter the Realm' },
                    { key: 'I', label: 'Instructions' },
                    { key: 'L', label: 'List Warriors' },
                    { key: 'Q', label: 'Quit' },
                ]);
                ch = (await this.io.getkey()).toUpperCase();
                // "S" = hidden story key; digits 1-0 = hidden help/art screens;
                // Enter defaults to "E". These are undocumented in the menu text.
                if ("SE\rILQ1234567890".indexOf(ch) === -1) {
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln("`>`2Try entering a valid option, it might actually do something.");
                }
            } while ("SE\rILQ1234567890".indexOf(ch) === -1);
            await this.io.sln(ch, 0);
            switch (ch) {
                case "1":
                    await this.io.showTxt("INTRO1");
                    break;
                case "2":
                    await this.io.showTxt("DRAG");
                    break;
                case "3":
                    await this.io.showTxt("INTRO2");
                    break;
                case "4":
                    await this.io.showTxt("DRAGON3");
                    break;
                case "5":
                    await this.io.showTxt("SM-LORD");
                    break;
                case "6":
                    await this.io.showTxt("LORD");
                    break;
                case "7":
                    await this.io.showTxt("FOOT");
                    break;
                case "8":
                    await this.io.showTxt("DEMON");
                    break;
                case "9":
                    await this.io.showTxt("LONGINTRO");
                    break;
                case "0":
                    await this.io.showTxt("ACCESSD");
                    break;
                case "Q":
                    await this.quitMsg();
                    break;
                case "S":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.lln("`c`2You have pressed the `0S`2 key.  `0S`2 is for story.");
                    await this.io.sln();
                    await this.io.moreNoMail();
                    await this.io.showTxt("STORY", true);
                    await this.io.moreNoMail();
                    if (this.rip) {
                        await this.io.sln();
                        await this.io.showRip("LOGON");
                    }
                    await this.io.sln();
                    break;
                case "L":
                    await this._showWarriorList();
                    break;
                case "I":
                    await this.io.instructions();
                    if (this.rip) await this.io.showRip("LOGON");
                    break;
            }
        } while ("E\rQ".indexOf(ch) === -1);
        return ch;
    }

    // ── Session flow ────────────────────────────────────────────────────

    private async checkGameover(): Promise<void> {
        let wb: LoadedPlayerRecord;

        await this.state.getState(false);
        if (this.state.won_by >= 0) {
            const wonByPlayer = this.player.playerGet(this.state.won_by);
            wb = wonByPlayer ?? { name: 'Unknown', Record: -1 } as LoadedPlayerRecord;
            // loadPlayer(false) = load without prompting to create; the session
            // player may not exist yet if they quit at the intro menu
            await this.player.loadPlayer(false);
            if (this.player.player === undefined || this.player.player === null) {
                this.player.player = { Record: -1 } as unknown as LoadedPlayerRecord;
            }
            await this.io.showTxt("WIN");
            await this.io.moreNoMail();
            await this.io.lln("`c`%PAY HOMAGE TO YOUR BETTER!     ", 22);
            await this.io.sln();
            await this.io.lln("`0The incredible warrior whose deeds will grace every tongue of every minstrel in every town every song of every day is the master warrior known as `%" + wb.name + "`2.");
            await this.io.sln();
            await this.io.moreNoMail();
            if (this.state.won_by === this.player.Record) {
                await this.io.lln("`0You smile modestly.  If only people knew, that incredible warrior was you.");
            } else {
                await this.io.lln("`2You bow your head in reverence - vowing to follow the teachings of this great person - to learn whatever this Godlike wonder can show you.");
                await this.io.sln();
                if (this.settings.auto_reset_won_round === true) {
                    await this.io.lln("`#(THE GAME WILL RESET AFTER MIDNIGHT MAINTENANCE)`%");
                } else {
                    await this.io.lln("`#(ASK YOUR SYSOP TO RESET THE GAME)`%");
                }
            }
            await this.io.sln();
            await this.io.moreNoMail();
            this.player.on_now = false;
            this.player.put();

            // Send a one-shot admin notification so the operator knows a reset
            // is required.  The flag file prevents duplicate emails on every
            // subsequent login.
            const flagPath = this.fileUtils.runtimeFilePath('gameover_notified');
            // Fire-and-forget - we do not await so that a slow/broken SMTP
            // server does not delay the player's session exit.
            void sendGameOverNotification(wb.name, flagPath);

            throw new GameExitError();
        }
    }

    async start(): Promise<void> {
        const igm: IGMPlace = { cmdline: '', desc: '', menu: '' };

        await this.fileUtils.buildTxtIndex();
        if (this.rip) {
            this.fileUtils.buildRipIndex();
        }

        // Should this allow a global file?
        if (this.fileUtils.fileExists(this.fileUtils.runtimeFilePath("hello.lrd"))) {
            await this.io.displayFilePaged(this.fileUtils.runtimeFilePath("hello.lrd"), false, false);
        }

        this.io.sclrscr();

        await this._showIntroArt();
        this.io.events?.emitNavigation('enter', 'intro');
        this.io.emitPrompt('instructions_continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        this.io.sclrscr();
        if (this.rip) {
            await this.io.showRip("LOGON");
        } else {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`>`0L`2egend `0O`2f The `0R`2ed `0D`2ragon");
            await this.io.sln();
        }
        await this.state.getState(false);
        if (!this.rip) {
            await this.io.lln("`>`2The current game has been running `0" + this.state.days + "`2 days.");
            await this.io.lln("`>`2Players are deleted after `0" + this.settings.delete_days + "`2 days of inactivity.");
            await this.io.showAlone();
        }

        if ((await this.introMenu()) === "Q") {
            if (this.player.player != null) {
                this.player.on_now = false;
                this.player.put();
            }
            if (this.rip) {
                await this.io.showRip("EXIT");
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
            throw new GameExitError();
        }

        await this.checkGameover();
        await this.player.loadPlayer(true);
        if (this.player.player != null) {
            PlayerIpHistoryPolicy.recordPlayerIp(
                this.storage,
                this.state.days,
                this.player.Record,
                this.connection.remoteIp,
                this.settings,
            );
        }
        // LOCKOUT.DAT was never implemented in the SBBS port either; access control is handled by AuthManager.
        // RIP clients need full menu graphics rendered each time; expert mode
        // (which suppresses repeated menus) would break the graphical flow
        if (this.player.player != null && this.rip) this.player.expert = false;

        // Note: cleanup on session end is handled by server.ts's finally block (web mode)
        // or by door.ts's process.on('exit') handler (CLI/door mode). Registering a handler
        // here would accumulate one per server-mode session, causing a listener leak.

        if (this.player.on_now) {
            await this._resumeExistingSession(igm);
        }
    }

    // ── Extracted private methods ────────────────────────────────────────

    private async _checkSpouseStatus(): Promise<void> {
        const op = this.player.playerGet(this.player.married_to);
        if (op && HiddenPlayerPolicy.isPlayerHidden(this.storage, op.Record)) {
            await this.io.sln();
            await this.io.lln("`2Your lover has been declared MISSING!");
            await this.io.sln();
            await this.io.lln("`2No one knows when they may return.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (op && op.name === "X") {
            await this.io.sln();
            await this.io.lln("`2Your lover has been declared MISSING!");
            await this.io.sln();
            await this.io.lln("`%YOU FEEL HEARTBROKEN!  (CHARM DROPS 50%)");
            await this.io.sln();
            this.player.married_to = -1;
            this.player.cha = parseInt((this.player.cha / 2).toString(), 10);
            await this.io.moreNoMail();
        }
    }

    private async _showWarriorList(): Promise<void> {
        // In the DB-backed port there may be no player.bin file; check
        // the actual player count instead of testing for a legacy file.
        let rankContent: string | null = null;
        try {
            const playerCount = this.player.playerLength();
            if (playerCount === 0) {
                await this.io.sln();
                await this.io.sln();
                await this.io.lln("`>The game has never been played before.");
            } else {
                rankContent = this.rankings.generateRankings(true, true, false);
            }
        } catch (_e) {
            // If player backend isn't available, fall back to the old file check.
            if (!this.fileUtils.fileExists(this.fileUtils.runtimeFilePath("player.bin"))) {
                await this.io.sln();
                await this.io.sln();
                await this.io.lln("`>The game has never been played before.");
            } else {
                rankContent = this.rankings.generateRankings(true, true, false);
            }
        }

        if (rankContent !== null) {
            this.io.sclrscr();
            if (this.rip) await this.io.showRip("W1");
            await this.io.showBuffer(rankContent, true, true);
            if (this.rip) {
                await this.io.sln();
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
                await this.io.showRip("LOGON");
            }
            await this.io.sln();
            await this.io.sln();
        }
    }

    private async _showIntroArt(): Promise<void> {
        if (this.rip) {
            await this.io.showRip("INTRO");
            return;
        }
        const introScreens = [
            "INTRO1", "DRAG", "INTRO2", "DRAGON3", "SM-LORD",
            "LORD", "FOOT", "DEMON", "LONGINTRO", "ACCESSD", "INTRO",
        ];
        await this.io.showTxt(introScreens[random(11)]);
    }

    private async _resumeExistingSession(igm: IGMPlace): Promise<void> {
        this.storage.setNodePlayer(this.connection.node, this.player.Record);
        if (!this.player.dead && this.player.hp > 0) {
            const outLines = this.storage.getPlayerLocation(this.player.Record);
            if (outLines) {
                igm.desc = outLines[0] || '';
                igm.cmdline = outLines[1] || '';
                if (igm.cmdline !== null) {
                    if (await this.igm.handleIgm(igm)) {
                        throw new GameExitError();
                    }
                }
            }
            await this.town.run();
        }

        this.player.on_now = false;
        this.player.put();
        this.storage.clearNodePlayer(this.connection.node);
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        await this.io.sln("Leaving the realm.");
    }
}

export default Game;
