/**
 * Input - Keyboard input handler for LORD.
 *
 * Implements getkey/getstr over async terminal sessions, enforces inactivity
 * timeouts, handles BBS paging delays (mswait), and intercepts sysop god
 * mode commands before passing input to the game.
 */

'use strict';

import { time, ascii } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type { ISession, GetstrOptions } from '../types';
import type IO from './IO';
import { GameExitError } from '../GameExitError';
import type { Settings, UiMode } from '../types';
import type { User } from '../types';
import type Player from '../Player';
import type { PromptOption } from '../GameEvents';
import type GodMode from '../GodMode';
import { detectRipSupport, readApcMessage, readSessionString } from './RipSupport';

export class Input {
    /** Current output line number, kept in sync with Output.curlinenum for paging. */
    curlinenum: number;
    /** The combined IO facade; wired after construction to break the circular dep with Output. */
    private _io: IO | null;
    /** Sysop god mode interceptor; non-null only when the sysop has unlocked god mode. */
    godMode: GodMode | null;

    constructor(
        public settings: Settings,
        private _uiMode: UiMode,
        private _player: Lazy<Player | null>,
        public session: ISession,
        public user: User,
    ) {
        this.curlinenum = 1;
        this._io = null;
        this.godMode = null;
    }

    get timeout(): number { return this.settings.timeout; }
    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    // ── IO wiring ────────────────────────────────────────────────────────

    // Resolve `io` lazily to avoid constructor-time cycles (GameState builds `io` after `input`).
    get io(): IO | null { return this._io; }
    set io(val: IO | null) { this._io = val; }

    /** Return IO reference, throwing if not yet wired. */
    private get requireIo(): IO {
        if (!this._io) throw new Error('Input.io accessed before IO was wired');
        return this._io;
    }

    // Allow late-binding of player reference
    get player(): Player | null {
        return this._player.value;
    }

    /** Mark the active player record offline if one is loaded. */
    private markPlayerOffline(): void {
        const record = this.player?.player;
        if (record) {
            record.on_now = false;
            record.put();
        }
    }

    // ── Key input ────────────────────────────────────────────────────────

    async getkeyw(): Promise<string> {
        // In CLI mode noTimeout is set - no BBS time limit or inactivity timeout.
        // Just wait indefinitely for the next keystroke.
        if (this.user.noTimeout) {
            return await this.session.getkey();
        }

        let tl: number;
        let now: number;
        const startTime = time();

        do {
            now = time();
            // LORD tracks both remaining BBS time and local idle time. The
            // former prevents the door from overrunning the caller's session,
            // while the latter kicks out sleepers even if BBS time remains.
            tl = this.user.secondsRemaining + this.user.secondsRemainingFrom - this.timeout - now;
            if (tl < 1) {
                if (this.settings.notime && this.settings.notime.length > 0) {
                    await this.requireIo.displayFilePaged(this.settings.notime, false, true);
                } else {
                    await this.requireIo.sln("(*** GOD STRIKES YOU UNCONSCIOUS (OUT OF BBS TIME!) ***)", 0);
                    if (this.rip) {
                        await this.requireIo.showRip("EXIT");
                        await this.requireIo.getkey();
                    }
                }
                this.markPlayerOffline();
                throw new GameExitError();
            }
            if (now - startTime >= this.timeout) {
                await this.requireIo.sln();
                await this.requireIo.sln();
                await this.requireIo.lln("Ack!  Apperently you didn't find this door very exciting, because you have obviously fallen asleep.  Please come back sometime when you feel like actually playing.");
                await this.requireIo.sln();
                if (this.rip) {
                    await this.requireIo.showRip("EXIT");
                    await this.requireIo.getkey();
                }
                this.markPlayerOffline();
                throw new GameExitError();
            }
        } while (!(await this.session.waitkey(10000)));
        // Key is ready - read it from the platform directly (not this.getkey, which would recurse)
        return await this.session.getkey();
    }

    async getkey(): Promise<string> {
        let ch: string;
        let a: number;

        this.curlinenum = 1;
        // Reset Output's line counter too - in the original monolithic code
        // there was one global curlinenum.  Resetting it on every keypress
        // prevents spurious MORE prompts (matches DOS LORD v4.07 behavior).
        if (this._io) this._io.output.curlinenum = 1;
        do {
            ch = await this.getkeyw();
            if (ch === "CONNECTION_CLOSED") {
                this.markPlayerOffline();
                throw new GameExitError();
            }
            if (ch === null || ch.length !== 1) {
                ch = "\x00";
            }
            a = ascii(ch);
            // Normalize control bytes to '.' so ANSI cursor reports, telnet
            // negotiation leftovers, or stray control keys never become game
            // commands.
            if (a >= 1 && a <= 7) {
                ch = ".";
            }
            if (a >= 9 && a <= 12) {
                ch = ".";
            }
            if (a >= 14 && a <= 26) {
                ch = ".";
            }
            if (a >= 127) {
                ch = ".";
            }
            // Slash is reserved for sysop god mode entry and should not fall
            // through to ordinary gameplay command handlers.
            if (ch === "/" && this.godMode && !this.godMode.active) {
                await this.godMode.enter();
                ch = "\x00";
            }
        } while (ch === "\x00");

        return ch;
    }

    async getstr(x: number, y: number, len: number, c: number, c1: number, str: string, mode?: GetstrOptions): Promise<string> {
        const oa = this.session.attr.value;

        if (mode === undefined) {
            mode = {};
        }
        mode.len = len;
        mode.edit = str;
        mode.inputBox = true;
        mode.crlf = false;
        if (str.length > 0) {
            mode.select = true;
        }
        this.curlinenum = 1;
        if (x !== 0 && y !== 0) {
            this.session.gotoxy(x - 1, y - 1);
        }
        // Only apply colors if explicitly set in options; defaulting to 0 would render
        // typed text as black-on-black (invisible) when no color was intended.
        if (mode.c !== undefined) this.requireIo.background(c);
        if (mode.c1 !== undefined) this.requireIo.foreground(c1);
        const ret = await this.session.getstr(mode);
        this.session.attr.value = oa;
        return ret;
    }

    /**
     * Display the command prompt (time-remaining) and read one keystroke.
     *
     * In non-RIP mode the standard "Your command, name? [X:XX] : " line is
     * printed before waiting for input.  In RIP mode the text is suppressed
     * (the graphical overlay handles display) but input is still consumed.
     *
     * @param promptId  GUI event identifier (emitted before input if provided).
     * @param options   GUI button options to include in the emitted event.
     * @param echo      Whether to echo the typed key on a new line.  Defaults
     *                  to `true` in non-RIP mode and `false` in RIP mode.
     * @returns         The uppercased key the player pressed.
     */
    async commandPrompt(promptId?: string, options?: PromptOption[], echo?: boolean): Promise<string> {
        const tl = this.user.secondsRemaining + this.user.secondsRemainingFrom - this.timeout - time();
        const remain = parseInt(String(tl / 60), 10) + ":" + (tl % 60);
        if (!(this.rip || this.modern)) {
            await this.requireIo.sln();
            await this.requireIo.lw("`2  Your command,`0 " + (this.player ? this.player.name : "warrior") + "`2? `2[`%" + remain + "`2] : `%");
        }
        if (promptId !== undefined && options !== undefined) {
            this.requireIo.emitPrompt(promptId, options);
        } else {
            this.requireIo.flush();
        }
        const ch = (await this.getkey()).toUpperCase();
        const echoEnabled = echo !== undefined ? echo : !(this.rip || this.modern);
        if (echoEnabled) {
            await this.requireIo.sln(ch, 0);
        }
        return ch;
    }

    async readStr(timeout: number, regex?: RegExp): Promise<string> {
        return readSessionString(this.session, timeout, regex);
    }

    async readApc(timeout: number): Promise<string | undefined> {
        return readApcMessage(this.session, timeout);
    }

    async waitkey(timeout?: number): Promise<boolean> {
        return this.session.waitkey(timeout);
    }

    /**
     * Probe the terminal for RIP/SyncTerm support by sending a cursor-position
     * request that SyncTERM intercepts and responds to with a RIPSCRIP
     * capability string.  Returns true if the response indicates a RIP-capable
     * terminal within the given timeout (ms).
     */
    async detectRip(timeout: number): Promise<boolean> {
        return detectRipSupport(this.session, timeout);
    }
}

export default Input;
