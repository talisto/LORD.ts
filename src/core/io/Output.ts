/**
 * Output - Terminal output engine for LORD.
 *
 * Renders all game text to the player's session: ANSI color attributes,
 * backtick color sequences, RIP graphics, text file display (showTxt/showRip),
 * line paging (more/moreNoMail), and divider/header formatting helpers.
 */

'use strict';

import { File } from '@lordts/util/FileUtils';
import * as path from 'path';
import type { SharedFileState } from '@lordts/util/FileUtils';
import type { IStorage } from '@lordts/storage/IStorage';
import type FileUtils from '@lordts/util/FileUtils';
import { attrToAnsi } from '@lordts/util/ANSI';
import { BACKTICK_FG_MAP } from '@lordts/util/Backtick';
import {
    DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER,
    resolveDeathKnightDamageMultiplier,
} from '@lordts/util/Settings';
import type DailyMaint from '../DailyMaint';
import type { ISession } from '../types';
import type IGM from '@lordts/igm/IGM';
import type IO from './IO';
import type Input from './Input';
import { divider as dividerUtil } from '@lordts/util/Util';
import type Log from '../Log';
import type Mail from '../Mail';
import type Marriage from '../Marriage';
import type OnlineBattle from '../OnlineBattle';
import type Player from '../Player';
import type State from '../State';
import { prettyInt, spacePad, cleanStr, wordWrap, dispLen } from '@lordts/util/Util';
import type { Settings, User, LoadedPlayerRecord, UiMode, Connection } from '../types';
import { Lazy } from '@lordts/util/Lazy';
import { AnnouncementPolicy } from '../AnnouncementPolicy';
import {
    applyRipSectionDimensions,
    queryRipAssetCache,
    RIP_ICON_FILES,
    ripAssetHashMatches,
    uploadRipAssetToCache,
} from './RipSupport';
// (cp437toUnicode conversion is intentionally NOT applied in sw() -- strings
// are already Unicode after File.readln/readAll conversion.)

export class Output {
    /** Current column position in the output stream (1-based). */
    curcolnum: number;
    /** Current output line number, used by the `more` pager to decide when to pause. */
    curlinenum: number;
    /** Whether the `more` pager is active; set to false to suppress pause prompts. */
    morechk: boolean;
    /** Right-side padding in columns, used for RIP text window insets. */
    rightPadding: number;
    /** Reference back to the Input instance, wired after construction to break circular deps. */
    input?: Input;
    /** Whether the SyncTerm asset cache has been initialized for this session. */
    synctermCache?: boolean;
    /** Map of filename to hash for RIP icon files already uploaded to the SyncTerm cache. */
    synctermCacheFiles: Record<string, string>;
    private ripSender?: (section: string, lines: string[]) => void;
    /** RIP text window column count from the last |w command, used for word wrapping.
     *  Immune to async client resize messages that would overwrite session.cols. */
    private ripCols: number = 0;

    constructor(
        public io: IO | null,
        private _uiMode: UiMode,
        public fileUtils: FileUtils,
        public settings: Settings,
        public ver: string,
        public session: ISession,
        public user: User,
        public connection: Connection,
        private baseDir: string,
        private _shared: SharedFileState,
        private _player: Lazy<Player>,
        private _mail: Lazy<Mail>,
        private _state: Lazy<State>,
        private _log: Lazy<Log>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _onlineBattle: Lazy<OnlineBattle>,
        private _marriage: Lazy<Marriage>,
        private _igm: Lazy<IGM | undefined>,
        private _storage: Lazy<IStorage>,
    ) {
        this.curcolnum = 1;
        this.curlinenum = 1;
        this.morechk = true;
        this.rightPadding = 0;
        this.synctermCacheFiles = {};
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    // Dynamic access to properties populated after construction
    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get lastrip(): string { return this._uiMode.lastScreen; }
    set lastrip(v: string) { this._uiMode.lastScreen = v; }
    get txtindex(): Record<string, string[]> { return this._shared.txtindex || {}; }
    get ripindex(): Record<string, string[]> { return this._shared.ripindex || {}; }
    get player(): Player { return this._player.value; }
    get mail(): Mail { return this._mail.value; }
    get state(): State { return this._state.value; }
    get log(): Log { return this._log.value; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }
    get onlineBattle(): OnlineBattle { return this._onlineBattle.value; }
    get marriage(): Marriage { return this._marriage.value; }
    get igm(): IGM | undefined { return this._igm.value; }
    get storage(): IStorage { return this._storage.value; }

    // ── Low-level output ───────────────────────────────────────────────

    /** Return IO reference, throwing if not yet wired. */
    private get requireIo(): IO {
        if (!this.io) throw new Error('Output.io accessed before IO was wired');
        return this.io;
    }

    /**
     * Set custom RIP sender for specific transports (e.g. Websockets).
     * If set, showRip will use this instead of line-by-line output.
     */
    setRipSender(sender: (section: string, lines: string[]) => void): void {
        this.ripSender = sender;
    }

    sw(str: string, indent: boolean | number = 0): void {
        if (str === "") {
            return;
        }
        if (str === "\r\n") {
            this.curcolnum = 1;
        }

        if (indent !== false) {
            this.session.print(' '.repeat(+ indent));
            this.curcolnum += (+ indent);
        }

        // Strings arriving here are already Unicode (converted by File.readln/readAll
        // or written as JS literals).  Do NOT apply cp437toUnicode again – a second
        // pass turns characters like U+2219 (8729) into undefined because their code
        // points exceed the 128-entry CP437_HIGH table.
        this.session.print(str);
        if (str !== "\r\n") {
            this.curcolnum += str.length;
        }
    }

    // ── File and text display ───────────────────────────────────────────

    async displayFilePaged(fname: string, canskip?: boolean, more?: boolean): Promise<void> {
        const f = new File(fname);
        let lc = 0;
        let ch: string | undefined;
        let ln: string | null;
        const ms = this.morechk;

        if (canskip === undefined) {
            canskip = true;
        }
        if (more === undefined) {
            more = true;
        }

        if (!f.readAll && !f.readln) {
            throw new Error("Unable to open " + fname);
        }

        this.morechk = false;
        readLoop: while (true) {
            ln = f.readln();
            if (ln === null) {
                break;
            }
            lc += 1;
            if (more && lc % (this.session.rows - 1) === 0) {
                await this.moreNoMail();
            }
            await this.lln(ln, false, true, false);
            if (canskip) {
                do {
                    ch = this.session.inkey();
                    if (ch === "\x03" || ch === " ") {
                        await this.sln();
                        break readLoop;
                    }
                } while (ch !== undefined);
            }
        }
        f.close();
        this.morechk = ms;
    }

    // ── Paging ────────────────────────────────────────────────────────────

    async moreNoMail(): Promise<void> {
        const oa = this.session.attr.value;

        this.curlinenum = 1;
        if (this.rip) await this.lw("<CLICK>");
        else await this.lw("`2<`0MORE`2>", 2);
        this.requireIo.emitPrompt('more', [{ key: '\r', label: 'Continue' }]);
        const moreKey = await this.requireIo.getkey();
        // If the player pressed an arrow key, only the leading ESC byte was
        // returned.  Silently drain the trailing sequence bytes (e.g. '[A') so
        // they don't leak into the next getkey() call as spurious input.
        if (moreKey === '\x1b') {
            this.session.inkey(); // consume '[' or 'O'
            this.session.inkey(); // consume direction code (A/B/C/D)
        }
        if (!this.user.ansiSupported || this.settings.use_fancy_more === false) {
            await this.sln();
            this.curlinenum = 1;
        } else {
            this.session.print("\r");
            this.session.cleareol();
        }
        this.session.attr.value = oa;
    }

    /** Calculate available text width given left indent, accounting for right padding. */
    private wrapWidth(indent: boolean | number): number {
        const indentCols = (indent === false) ? 0 : +indent;
        const rightPad = this.rightPadding > 0 ? this.rightPadding : indentCols;
        return this.effectiveCols - indentCols - rightPad;
    }

    async sln(str: string = '', indent: boolean | number = 2, wrap: boolean = true): Promise<void> {
        // *ALL* CRLFs should be sent from here!
        if (str !== "") {
            if (wrap) {
                const availWidth = this.wrapWidth(indent);
                if (availWidth >= 10 && dispLen(str) > availWidth) {
                    const lines = wordWrap(str, availWidth);
                    for (let i = 0; i < lines.length; i++) {
                        this.sw(lines[i], indent);
                        this.sw("\r\n");
                        this.curlinenum += 1;
                        if (this.morechk && this.curlinenum > this.session.rows - 1) {
                            await this.moreNoMail();
                            this.curlinenum = 1;
                        }
                    }
                    return;
                }
            }
            this.sw(str, indent);
        }
        this.sw("\r\n");
        this.curlinenum += 1;
        if (this.morechk) {
            if (this.curlinenum > this.session.rows - 1) {
                await this.moreNoMail();
                this.curlinenum = 1;
            }
        } else {
            this.curlinenum = 1;
        }
    }

    sclrscr(): void {
        const oa = this.session.attr.value;

        // Reset SGR before clearing so xterm/terminals fill with black,
        // not the currently-active background color.
        this.session.print('\x1b[0m');
        this.session.clear();
        this.session.attr.value = oa;
        this.curlinenum = 1;
    }

    /** Flush any buffered output to the client immediately. No-op on CLI. */
    flush(): void {
        this.session.flush?.();
    }

    // ── Color and ANSI ─────────────────────────────────────────────────

    foreground(col: number): void {
        if (col > 15) {
            col = 0x80 | (col & 0x0f);
        }
        this.session.attr.value = (this.session.attr.value & 0x70) | col;
        this.session.print(attrToAnsi(this.session.attr.value));
    }

    background(col: number): void {
        if (col > 7 || col < 0) {
            return;
        }
        this.session.attr.value = (this.session.attr.value & 0x8f) | (col << 4);
        this.session.print(attrToAnsi(this.session.attr.value));
    }

    /**
     * Output a backtick-coded string followed by CRLF.
     * @param str - The backtick-coded string to output
     * @param indent - Left indent (columns) or false for no indent
     * @param ext - Extended processing flag for mail format
     * @param wrap - Whether to word-wrap long lines (default true). Set false for ANSI art.
     */
    // ── Line output helpers ─────────────────────────────────────────────

    async lln(str: string, indent: boolean | number = 2, ext?: boolean, wrap: boolean = true): Promise<void> {
        // `> centering code: disable wrapping for centered lines
        if (str.includes('`>')) {
            wrap = false;
        }
        if (wrap) {
            const availWidth = this.wrapWidth(indent);
            if (availWidth >= 10 && dispLen(str) > availWidth) {
                const lines = wordWrap(str, availWidth);
                for (let i = 0; i < lines.length; i++) {
                    await this.lw(lines[i], indent, ext);
                    await this.sln();
                }
                return;
            }
        }
        await this.lw(str, indent, ext);
        await this.sln();
    }

    async showFile(fname: string, quote?: boolean, mail?: boolean): Promise<void> {
        const f = new File(fname);
        let ln: string | null;
        let lc = 0;
        let ns = false;
        let ch: string;
        const ms = this.morechk;

        if (!f.readln && !f.readAll) {
            return;
        }
        this.morechk = false;
        while (true) {
            ln = f.readln();
            if (ln === null) {
                break;
            }
            if (quote) {
                this.storage.appendQuoteLine(this.player.Record, ln);
            }
            await this.lln(ln, false, mail, false);
            lc += 1;
            if (ns === false && lc >= this.session.rows - 1) {
                await this.lw(" `2(`5C`2)ontinue, (`5S`2)top, (`5N`2)onstop `0: `%");
                this.requireIo.emitPrompt('pager', [
                    { key: 'C', label: 'Continue' },
                    { key: 'S', label: 'Stop' },
                    { key: 'N', label: 'Nonstop' },
                ]);
                if (this.input && typeof this.input.getkey === "function") {
                    ch = (await this.input.getkey()).toUpperCase();
                } else {
                    ch = (await this.requireIo.getkey()).toUpperCase();
                }
                lc = 0;
                if (ch === "S") {
                    this.session.print("\r");
                    this.session.cleareol();
                    break;
                }
                if (ch === "N") {
                    ns = true;
                }
                this.session.print("\r");
                this.session.cleareol();
            }
        }
        this.morechk = ms;
        f.close();
    }

    async showBuffer(buf: string, quote?: boolean, mail?: boolean): Promise<void> {
        let ln: string;
        let lc = 0;
        let ns = false;
        let ch: string;
        const ms = this.morechk;

        // Reuse the same pager semantics as showFile(), but over an in-memory
        // buffer. Logs, mail, rankings, and generated text all flow through here.
        this.morechk = false;
        const lines = buf.split(/\r?\n/);
        while (lines.length > 0) {
            ln = lines.shift() ?? '';
            if (quote) {
                this.storage.appendQuoteLine(this.player.Record, ln);
            }
            await this.lln(ln, false, mail, false);
            lc += 1;
            if (ns === false && lc >= this.session.rows - 1) {
                await this.lw(" `2(`5C`2)ontinue, (`5S`2)top, (`5N`2)onstop `0: `%");
                this.requireIo.emitPrompt('pager', [
                    { key: 'C', label: 'Continue' },
                    { key: 'S', label: 'Stop' },
                    { key: 'N', label: 'Nonstop' },
                ]);
                ch = (await this.requireIo.getkey()).toUpperCase();
                lc = 0;
                if (ch === "S") {
                    this.session.print("\r");
                    this.session.cleareol();
                    break;
                }
                if (ch === "N") {
                    ns = true;
                }
                this.session.print("\r");
                this.session.cleareol();
            }
        }
        this.morechk = ms;
    }

    async more(): Promise<void> {
        const oa = this.session.attr.value;

        // DIFF: There's some weird mail_off and new_game checking here...
        //       It appears it's to keep player writes to a minimum.
        const linesOnPage = this.curlinenum;
        this.curlinenum = 1;
        // Stock LORD persists the player and checks mail at page breaks so the
        // session stays durable even during long read-only screens.
        this.player.put();
        await this.mail.checkMail();

        // If auto-pagination in sln() fired on the very last line before this
        // call, curlinenum will have been reset to 1 with no new content shown
        // since. Skip the prompt to avoid back-to-back <CLICK>/<MORE> screens.
        if (linesOnPage <= 1) {
            this.session.attr.value = oa;
            return;
        }

        if (this.rip) await this.lw("<CLICK>");
        else await this.lw("`2<`0MORE`2>", 2);
        this.requireIo.emitPrompt('more', [{ key: '\r', label: 'Continue' }]);
        await this.requireIo.getkey();
        if (!this.user.ansiSupported || this.settings.use_fancy_more === false) {
            await this.sln();
            this.curlinenum = 1;
        } else {
            this.session.print("\r");
            this.session.cleareol();
        }
        this.session.attr.value = oa;
    }

    private looks(sex: string, charm?: number): string {
        let i: number;
        let ln: string = '';
        const f = new File(this.fileUtils.runtimeOrData(sex === "M" ? "MLOOKS.DAT" : "FLOOKS.DAT"));

        if (!f.open("r")) {
            throw new Error("Unable to open " + f.name);
        }
        if (charm === undefined || charm < 1) {
            charm = 1;
        }
        if (charm > 100) {
            charm = 101;
        }
        for (i = 0; i < charm; i += 1) {
            ln = f.readln() ?? '';
        }
        f.close();
        return ln ?? '';
    }

    async showLooks(op: { sex: string; cha: number }): Promise<void> {
        const upronoun = op.sex === "M" ? "His" : "Her";
        const upronoun2 = op.sex === "M" ? "He" : "She";

        if (op.cha < 30) {
            await this.lln("`4WARNING:  `2" + upronoun + " Charm Rating is only `%" + prettyInt(op.cha) + "`2!");
        } else {
            await this.lln("`2" + upronoun + " Charm Rating is `%" + prettyInt(op.cha) + "`2.");
        }
        await this.sln();
        await this.lln("`2" + upronoun2 + " " + this.looks(op.sex, op.cha));
        await this.sln();
    }

    async deadScreen(op: { name: string | null }): Promise<void> {
        this.io?.events?.emitPlayer('death', { killedBy: op.name ?? 'unknown' });
        if (this.rip) await this.showRip("DEAD");
        await this.sln();
        if (op.name !== null) {
            await this.lln("`4You have been killed by " + op.name + "`2.");
            await this.sln();
            await this.moreNoMail();
        }
        await this.lln("`2GOLD ON HAND WAS `4LOST`2.  ");
        await this.sln();
        await this.sln();
        await this.lln("`2TEN PERCENT OF EXPERIENCE `4LOST`2.");
        await this.sln("");
        this.foreground(2);
        await this.lln("You have been defeated on your way to glory.  The road to success is long and hard.  You have encountered a minor setback.  But do `0NOT`2 lose heart, you can continue your struggle tomorrow.");
        await this.sln();
        await this.moreNoMail();
    }

    async showTxt(fname: string, more?: boolean): Promise<void> {
        const mc = this.morechk;

        if (more === undefined) {
            more = false;
        }

        if (this.txtindex[fname] === undefined) {
            return;
        }
        const lines = this.txtindex[fname];

        if (!more) {
            this.morechk = false;
        }
        for (let i = 0; i < lines.length; i++) {
            await this.lln(lines[i], 0, undefined, false);
        }
        this.morechk = mc;
        this.curlinenum = 1;
    }

    // ── RIP graphics ─────────────────────────────────────────────────────

    async showRip(fname: string, update?: boolean): Promise<void> {
        if (update === undefined) update = true;
        if (this.ripindex[fname] === undefined) {
            return;
        }
        if (update) this.lastrip = fname;
        const lines = this.ripindex[fname];

        // Synchronously update session.rows and session.cols from the RIP section's
        // |w command so that sln() auto-pagination and word wrapping use the correct
        // values before the async client-side resize message arrives.
        const ripDims = applyRipSectionDimensions(this.session, lines);
        if (ripDims.reset) {
            this.ripCols = 0;
        }
        if (ripDims.cols > 1) {
            this.ripCols = ripDims.cols;
        }

        // Web clients can consume RIP as a structured side-channel message.
        // CLI/telnet fall back to the traditional line-by-line rendering path.
        if (this.ripSender) {
            this.ripSender(fname, lines);
            this.sclrscr();
            this.curlinenum = 1;
            return;
        }

        // Otherwise use traditional line-by-line output
        const mc = this.morechk;
        this.morechk = false;

        for (let i = 0; i < lines.length; i++) {
            await this.lln(lines[i], 0, undefined, false);
        }
        this.morechk = mc;
        this.curlinenum = 1;
    }

    async instructions(): Promise<void> {
        if (this.rip) await this.showRip("HINTS");
        await this.showTxt("HINTS", true);
        await this.moreNoMail();
        await this.sln();
    }

    async warriorsOnNow(inhello?: boolean): Promise<void> {
        let i: number;
        const on: LoadedPlayerRecord[] = [];
        let where: string | string[];

        await this.sln();
        this.foreground(15);
        this.background(0);
        await this.sln("Warriors in the Realm Now", 23);
        await this.lln(this.divider(0, '`2'), 0);
        this.player.allPlayers().forEach((op: LoadedPlayerRecord) => {
            if (op.name !== "X" && op.on_now) {
                on.push(op);
            }
        });
        for (i = 0; i < on.length; i += 1) {
            const outLines = this.storage.getPlayerLocation(on[i].Record);
            if (outLines) {
                where = outLines[0] ?? '';
                if ((outLines[1] ?? '').length === 0) {
                    await this.lln("`0" + on[i].name + '`2 is in `0"' + where + '`0".');
                } else {
                    await this.lln("`0" + on[i].name + '`2 "' + where);
                }
            } else {
                await this.lln("`0" + spacePad(on[i].name, 25) + "   `2Arrived At`%                   " + on[i].time_on);
            }
            if (inhello && on[i].Record !== this.player.Record) {
                await this.mail.mailTo(on[i].Record, "`0  " + this.player.name + " `2has entered the realm.");
            }
        }
        if (this.rip || this.modern) {
            await this.sln();
            await this.moreNoMail();
        }
    }

    async showStats(): Promise<void> {
        let tp: LoadedPlayerRecord | null;

        this.sclrscr();
        await this.sln();
        if (this.rip) await this.showRip("W1");
        await this.lln("`%" + this.player.name + "`2's Stats...");
        await this.lln(this.divider(0, '`0'), 0);
        await this.lln("`2Experience   : `0" + prettyInt(this.player.exp));
        await this.lln(
            "`2Level        : `0" +
                spacePad(prettyInt(this.player.level), 17) +
                " `2HitPoints          : `0" +
                prettyInt(this.player.hp) +
                "`2 of `0" +
                prettyInt(this.player.hp_max),
        );
        await this.lln(
            "`2Forest Fights: `0" +
                spacePad(prettyInt(this.player.forest_fights), 17) +
                " `2Player Fights Left : `0" +
                prettyInt(this.player.pvp_fights),
        );
        await this.lln(
            "`2Gold In Hand : `0" +
                spacePad(prettyInt(this.player.gold), 17) +
                " `2Gold In Bank       : `0" +
                prettyInt(this.player.bank),
        );
        await this.lln(
            "`2Weapon       : `0" +
                spacePad(this.player.weapon, 17) +
                " `2Attack Strength    : `0" +
                prettyInt(this.player.str),
        );
        await this.lln(
            "`2Armour       : `0" + spacePad(this.player.arm, 17) + " `2Defensive Strength : `0" + prettyInt(this.player.def),
        );
        await this.lln(
            "`2Charm        : `0" +
                spacePad(prettyInt(this.player.cha), 17) +
                " `2Gems               : `0" +
                prettyInt(this.player.gem),
        );
        await this.sln();
        await this.state.getState(false);
        if (this.state.married_to_violet === this.player.Record) {
            await this.lln("`2You are married to `#Violet`2.");
            await this.sln();
        }
        if (this.state.married_to_seth === this.player.Record) {
            await this.lln("`2You are married to `%Seth Able`2.");
            await this.sln();
        }
        if (this.player.married_to !== -1) {
            tp = this.player.playerGet(this.player.married_to);
            if (tp) {
                await this.lln("`2You are married to `%" + tp.name + "`2.");
                await this.sln();
            }
        }
        if (this.player.kids === 1) {
            await this.lln("`2You have `01`2 child.");
            await this.sln();
        }
        if (this.player.kids > 1) {
            await this.lln("`2You have `0" + prettyInt(this.player.kids) + "`2 children.");
            await this.sln();
        }
        if (this.player.horse) {
            await this.lln("`2You are on `%horseback`2.");
        }
        if (this.player.has_fairy !== undefined && this.player.has_fairy) {
            await this.lln("`2You have a `#fairy`2 in your pocket.");
        }
        if (this.player.levelw > 0 || this.player.skillw > 0) {
            await this.lw("`2Death Knight Skills: `0", 2);
            if (this.player.skillw === 0) {
                this.sw("NONE       ");
            } else if (this.player.skillw >= 40) {
                this.sw("MASTERED   ");
            } else if (this.player.skillw > 0) {
                this.sw(spacePad(prettyInt(this.player.skillw), 11));
            }
            await this.lln("`2 Uses Today: (`0" + prettyInt(this.player.levelw) + "`2)", 0);
        }
        if (this.player.levelm > 0 || this.player.skillm > 0) {
            await this.lw("`2The Mystical Skills: `0", 2);
            if (this.player.skillm === 0) {
                this.sw("NONE       ");
            } else if (this.player.skillm >= 40) {
                this.sw("MASTERED   ");
            } else if (this.player.skillm > 0) {
                this.sw(spacePad(prettyInt(this.player.skillm), 11));
            }
            await this.lln("`2 Uses Today: (`0" + prettyInt(this.player.levelm) + "`2)", 0);
        }
        if (this.player.levelt > 0 || this.player.skillt > 0) {
            await this.lw("`2The Thieving Skills: `0", 2);
            if (this.player.skillt === 0) {
                this.sw("NONE       ");
            } else if (this.player.skillt >= 40) {
                this.sw("MASTERED   ");
            } else if (this.player.skillt > 0) {
                this.sw(spacePad(prettyInt(this.player.skillt), 11));
            }
            await this.lln("`2 Uses Today: (`0" + prettyInt(this.player.levelt) + "`2)", 0);
        }

        await this.sln();

        switch (this.player.clss) {
            case 1:
                await this.lln("`0You are currently interested in `%Death Knight`0 skills.");
                break;
            case 2:
                await this.lln("`0You are currently interested in `%The Mystical`0 skills.");
                break;
            case 3:
                await this.lln("`0You are currently interested in `%The Thieving`0 skills.");
                break;
        }

        await this.sln();

        if (this.player.amulet) {
            await this.lln("`2You are wearing an `%Amulet of Accuracy`2.");
            await this.sln();
        }
        await this.more();
    }

    async announce(): Promise<void> {
        let ch: string;
        let msg: string;
        let l: string;
        let lines = 0;

        const resolveAnnouncementCap = (value: number | undefined): number => {
            if (typeof value !== 'number' || isNaN(value) || value < 0) {
                return 0;
            }

            return Math.floor(value);
        };
        const maxLines = resolveAnnouncementCap(this.settings.announcement_max_lines);
        const maxPerPlayerPerDay = resolveAnnouncementCap(this.settings.announcement_max_per_player_per_day);
        const maxTotalPerDay = resolveAnnouncementCap(this.settings.announcement_max_total_per_day);
        const maxCharsPerLine = (() => {
            const value = this.settings.announcement_max_chars_per_line;
            if (typeof value !== 'number' || isNaN(value) || value < 1) {
                return 75;
            }

            return Math.floor(value);
        })();

        await this.sln();
        await this.sln();
        this.foreground(2);
        await this.lln("Are you sure you want to announce something?  It will appear to EVERYONE in the daily happenings.");
        await this.sln();
        await this.lw("Make Announcement? [`0Y`2] :`% ", 2);
        this.requireIo.emitPrompt('announce_confirm', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        ch = (await this.requireIo.getkey()).toUpperCase();
        if (ch !== "N") {
            ch = "Y";
        }
        await this.sln(ch, 0);
        if (ch === "N") {
            return;
        }

        await this.log.createLog(false);
        switch (AnnouncementPolicy.canPlayerAnnounce(
            this.storage,
            this.state.days,
            this.player.Record,
            maxPerPlayerPerDay,
            maxTotalPerDay,
        )) {
            case 'per-player':
                await this.sln();
                await this.sln('You have already made the maximum number of announcements today.');
                if (this.rip || this.modern) {
                    await this.moreNoMail();
                }
                return;
            case 'total':
                await this.sln();
                await this.sln('The daily happenings cannot fit any more announcements today.');
                if (this.rip || this.modern) {
                    await this.moreNoMail();
                }
                return;
            case 'ok':
                break;
        }

        msg = "\n`0" + this.player.name + "`2 Announces:`%";
        await this.sln();
        await this.sln("Enter message now..Blank line quits!");
        this.requireIo.emitPrompt('write_announcement', [], 'text');
        do {
            await this.lw(" `2>`% ");
            l = "`%" + cleanStr(await this.session.getstr({ len: maxCharsPerLine }));
            if (l !== "`%") {
                msg = msg + "\n" + l;
                lines += 1;
                if (maxLines > 0 && lines >= maxLines) {
                    break;
                }
            }
        } while (l !== "`%");
        await this.log.logLine(msg);
        AnnouncementPolicy.recordAnnouncement(this.storage, this.state.days, this.player.Record);
        await this.sln();
        await this.sln("Announcement Made!");
        if (this.rip || this.modern) {
            await this.moreNoMail();
        }
    }

    async checkRip(name: string): Promise<void> {
        if (this.rip && this.lastrip !== name) await this.showRip(name);
    }

    async showAlone(): Promise<void> {
        let alone = true;

        this.player.allPlayers().forEach((tp: LoadedPlayerRecord) => {
            if (tp.on_now) {
                alone = false;
            }
        });
        if (!alone) {
            await this.lln("`>`0You are `%NOT ALONE`0 here.  `2(Someone else is playing also)");
        }
    }

    async showGameStats(): Promise<void> {
        let tmp: number;

        await this.state.getState(false);
        if (this.rip) await this.showRip("W1");
        await this.lln("`c`%** GAME STATISTICS " + this.ver + " **", 21);
        await this.sln();
        await this.lln("`2This game has been running for `%" + prettyInt(this.state.days) + "`2 days.");
        await this.lln("`2You are playing a `0J`2A`0V`2A`0S`2C`0R`2I`0P`2T game.");
        if ((this.settings.win_deeds || 0) > 0) {
            await this.lln("`2Game can be `0FINISHED `2by getting " + prettyInt(this.settings.win_deeds || 0) + " heroic deeds");
        } else {
            await this.lln("`2Game is set to run indefinitely.");
        }
        await this.sln();
        tmp = 0;
        this.player.allPlayers().forEach((op: LoadedPlayerRecord) => {
            if (op.name !== "X") {
                tmp += 1;
            }
        });
        await this.lln("`2There are currently `%" + prettyInt(tmp) + " `2people playing.");
        await this.sln();
        await this.lln("`2Players are deleted after `%" + prettyInt(this.settings.delete_days) + " `2days of inactivity.");
        await this.sln();
        if (this.settings.clean_mode) {
            await this.lln("`2Clean mode is `0ENABLED`2.");
        } else {
            await this.lln("`2Clean mode is OFF!  (Thank the stars!)");
        }
        await this.sln();
        if (this.settings.transfers_on) {
            await this.lln(
                "  `2Transferring Funds is enabled, max of `%" +
                    prettyInt(this.settings.transfer_amount || 0) +
                    "`2 per transfer.",
            );
            if ((this.settings.transfers_per_day || 0) > 0) {
                await this.lln("`2You can do this up to `%" + prettyInt(this.settings.transfers_per_day || 0) + "`2 times a day.");
            } else {
                await this.lln("`2You can do this `%unlimited`2 times per day.");
            }
        } else {
            await this.lln("`2Bank option Transferring Funds is disabled by Sysop");
        }
        await this.sln();
        await this.lln("`2Need an ego boost?  This is what you overhear being said about yourself.");
        if (this.player.sex === "M") {
            await this.lln('`0"He ' + this.looks(this.player.sex, this.player.cha) + '"');
        } else {
            await this.lln('`0"She ' + this.looks(this.player.sex, this.player.cha) + '"');
        }
        await this.sln();
        await this.lln("`0Current user tasker: " + process.platform + " " + process.arch + " and you're on node " + prettyInt(this.connection.node));
        await this.lw("`2  ");
        if (!this.settings.del_1xp) {
            await this.lw("NK1 "); // No Kill 1XP
        }
        if (this.settings.res_days !== 3) {
            await this.lw("R" + this.settings.res_days + " "); // Resurection Days
        }
        if (!this.settings.olivia) {
            await this.lw("NO "); // No Olivia
        }
        if (!this.settings.funky_flowers) {
            await this.lw("BF "); // Boring Flowers
        }
        if (!this.settings.shop_limit) {
            await this.lw("NL "); // No Shop Limit
        }
        if (this.settings.old_skill_points) {
            await this.lw("5S "); // 5 skill points per use
        }
        if (this.settings.def_for_pk) {
            await this.lw("DP "); // Def for pk
        }
        if (this.settings.str_for_pk) {
            await this.lw("SP "); // Str for pk
        }
        if (this.settings.beef_up) {
            await this.lw("BEEF "); // Beef up monsters
        }
        if (!this.settings.old_steal) {
            await this.lw("CT "); // Crappy Thieves
        }
        if (resolveDeathKnightDamageMultiplier(this.settings) !== DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER) {
            await this.lw("DK "); // Modified Death Knight damage
        }
        if (this.settings.sleep_dragon) {
            await this.lw("SD "); // Anti-camping Dragon attacks
        }
        await this.sln();
        await this.moreNoMail();
    }

    // Outputs text with ` codes (no CRLF)
    async lw(str: string, indent: boolean | number = 0, ext?: boolean): Promise<void> {
        let i: number;
        let snip = '';

        if (ext === undefined) {
            ext = false;
        }

        // `> centering code: if present anywhere in the string, suppress the default indent so
        // that codes like `c (which re-apply indent after clearing the screen) don't interfere.
        // The actual centering spaces are emitted when `> is encountered in the loop below.
        if (str.includes('`>')) {
            indent = false;
        }

        if (indent !== false) {
            this.sw(' '.repeat(+ indent));
        }

        for (i = 0; i < str.length; i += 1) {
            if (str[i] === '`') {
                this.sw(snip);
                snip = '';
                i += 1;
                if (i > str.length) {
                    break;
                }
                const code = str[i];
                if (code in BACKTICK_FG_MAP) {
                    this.foreground(BACKTICK_FG_MAP[code]);
                } else switch (code) {
                    case '.':
                        break;
                    case 'n':
                        if (this.curcolnum <= this.session.cols) {
                            await this.sln();
                        }
                        break;
                    case '`':
                        await this.requireIo.getkey();
                        break;
                    case 'l':
                        this.foreground(2);
                        this.sw(this.divider(0));
                        break;
                    case 'c':
                        this.sclrscr();
                        await this.sln();
                        await this.sln();
                        if (indent !== false) {
                            this.sw(' '.repeat(+ indent));
                        }
                        break;
                    case 'C':
                        this.sclrscr();
                        if (indent !== false) {
                            this.sw(' '.repeat(+ indent));
                        }
                        break;
                    case '>':
                        // Centering: emit spaces to center remaining visible content
                        this.sw(' '.repeat(Math.max(0, Math.floor((this.effectiveCols - dispLen(str.substring(i + 1))) / 2))));
                        break;
                    case '|':
                        this.storage.clearQuoteBuffer(this.player.Record);
                        break;
                    case 'B':
                        i += 1;
                        if (i > str.length) {
                            break;
                        }
                        if (str[i] in BACKTICK_FG_MAP) {
                            this.foreground(BACKTICK_FG_MAP[str[i]] + 16);
                        }
                        break;
                    case 'r':
                        i += 1;
                        if (i > str.length) {
                            break;
                        }
                        if (str[i] >= '0' && str[i] <= '7') {
                            this.background(parseInt(str[i]));
                        }
                        break;
                    default:
                        if (i === 1 && ext) {
                            if (await this._processExtCode(str)) return;
                        }
                }
            }
            else {
                snip += str[i];
            }
        }
        this.sw(snip);
    }

    private async _processExtCode(str: string): Promise<boolean> {
        let to: number;
        let oop: LoadedPlayerRecord | null;

        switch (str[1]) {
            case '-':
                await this.mail.answerMail(parseInt(str.substr(2)));
                return true;
            case 'b':
                this.player.bank += parseInt(str.substr(2), 10);
                if (this.player.bank > 2000000000) {
                    this.player.bank = 2000000000;
                }
                return true;
            case 'E':
                this.player.exp += parseInt(str.substr(2), 10);
                if (this.player.exp > 2000000000) {
                    this.player.exp = 2000000000;
                }
                await this.dailyMaint.tournamentCheck();
                return true;
            case '{':
                this.player.laid += 1;
                await this.dailyMaint.tournamentCheck();
                return true;
            case 'G':
                this.player.gold += parseInt(str.substr(2), 10);
                if (this.player.gold > 2000000000) {
                    this.player.gold = 2000000000;
                }
                return true;
            case ',':
                this.player.forest_fights += parseInt(str.substr(2), 10);
                if (this.player.forest_fights > 32000) {
                    this.player.forest_fights = 32000;
                }
                return true;
            case ':':
                this.player.pvp_fights += parseInt(str.substr(2), 10);
                if (this.player.pvp_fights > 32000) {
                    this.player.pvp_fights = 32000;
                }
                return true;
            case ';':
                this.player.hp += parseInt(str.substr(2), 10);
                if (this.player.hp > 2000000000) {
                    this.player.hp = 2000000000;
                }
                return true;
            case '+':
                this.player.cha = parseInt(str.substr(2), 10);
                return true;
            case '}':
                this.player.cha += 1;
                if (this.player.cha > 32000) {
                    this.player.cha = 32000;
                }
                return true;
            case 'K':
            case 'k':
                this.player.kids += 1;
                if (this.player.kids > 32000) {
                    this.player.kids = 32000;
                }
                return true;
            case 'V':
                this.player.exp -= parseInt(str.substr(2), 10);
                if (this.player.exp < 1) {
                    this.player.exp = 1;
                }
                return true;
            case 'M':
                this.player.str += parseInt(str.substr(2), 10);
                if (this.player.str > 2000000000) {
                    this.player.str = 2000000000;
                }
                return true;
            case 'D':
                this.player.def += parseInt(str.substr(2), 10);
                if (this.player.def > 2000000000) {
                    this.player.def = 2000000000;
                }
                return true;
            case 'T':
                await this.mail.smileMail(parseInt(str.substr(2), 10));
                return true;
            case 'Y':
                await this.mail.kissMail(parseInt(str.substr(2), 10));
                return true;
            case 'U':
                await this.mail.dinnerMail(parseInt(str.substr(2), 10));
                return true;
            case 'I':
                await this.mail.sleepMail(parseInt(str.substr(2), 10));
                return true;
            case '?':
                this.marriage.handleMarryConfirm(parseInt(str.substr(2), 10));
                return true;
            case 'o':
                // Note: fragile - the mail lock is still held at this point.
                this.storage.clearQuoteBuffer(this.player.Record);
                to = parseInt(str.substr(2), 10);
                oop = this.player.playerGet(to);
                if (oop) await this.onlineBattle.handleOnlineChallenge(oop);
                return false;
            case 'P':
                await this.marriage.handleMarryProposal(parseInt(str.substr(2), 10));
                return true;
            case 'S':
                switch (this.player.clss) {
                    case 1:
                        this.player.skillw += 1;
                        if (this.player.skillw > 40) {
                            this.player.skillw = 40;
                        }
                        break;
                    case 2:
                        this.player.skillm += 1;
                        if (this.player.skillm > 40) {
                            this.player.skillm = 40;
                        }
                        break;
                    case 3:
                        this.player.skillt += 1;
                        if (this.player.skillt > 40) {
                            this.player.skillt = 40;
                        }
                        break;
                }
                return true;
        }
        return false;
    }

    private async ymodemUpload(fname: string): Promise<boolean> {
        // Note: system.mode check was Synchronet BBS-specific; dead branch removed in this port.
        this.session.print('\r!|9\x1b06020000' + fname + '<>\r\n');
        // bbs.send_file is not available in Node.js
        const ret = false; // bbs.send_file(path, 'G', 'LORD Icon', false);
        while (await this.session.waitkey(0))
            await this.session.getkey();
        return ret;
    }

    private async supportsRipAssetCache(): Promise<boolean> {
        const cacheFiles = await queryRipAssetCache(this.session, 10000);
        if (cacheFiles === undefined) {
            return false;
        }
        this.synctermCacheFiles = cacheFiles;
        return true;
    }

    private async upload(fname: string, localPath: string): Promise<boolean> {
        let ret: boolean;

        this.session.print('\r\x1b[K  Updating ' + fname);
        if (this.synctermCache === undefined)
            this.synctermCache = await this.supportsRipAssetCache();
        if (this.synctermCache)
            ret = await uploadRipAssetToCache(this.session, fname, localPath, true);
        else
            ret = await this.ymodemUpload(fname);
        if (ret)
            this.session.print('\r\x1b[K');
        else
            this.session.print('\r\x1b[K  Update of ' + fname + ' FAILED!');
        return ret;
    }

    private _isYmodemFileOutdated(stat: string, localPath: string): boolean {
        if (stat === '0') {
            return true;
        }
        // 1.20345.01/02/93.03:04:30
        const m = stat.match(/^1\.([0-9]+)\.([0-9]{2})\/([0-9]{2})\/([0-9]{2})\.([0-9]{2}):([0-9]{2}):([0-9]{2})$/);
        if (m === null) {
            return true;
        }
        if (parseInt(m[1], 10) !== this.fileUtils.fileSize(localPath)) {
            return true;
        }
        const fdate = new Date();
        fdate.setTime(this.fileUtils.fileDate(localPath));
        const rdate = new Date();
        rdate.setUTCMilliseconds(0);
        rdate.setUTCSeconds(parseInt(m[7], 10));
        rdate.setUTCMinutes(parseInt(m[6], 10));
        rdate.setUTCHours(parseInt(m[5], 10));
        rdate.setUTCDate(1);
        let yr = parseInt(m[4], 10) + 1900;
        if (yr < new Date().getUTCFullYear() - 50)
            yr += 100;
        rdate.setUTCFullYear(yr);
        rdate.setUTCDate(parseInt(m[3], 10));
        rdate.setUTCMonth(parseInt(m[2], 10));
        return rdate < fdate;
    }

    private async uploadIfNewer(fname: string, localPath: string): Promise<boolean> {
        let stat: string;

        if (!this.fileUtils.fileExists(localPath))
            return false;
        if (this.synctermCache === undefined)
            this.synctermCache = await this.supportsRipAssetCache();
        while (await this.session.waitkey(0))
            await this.session.getkey();
        this.session.print('\r\x1b[K  Checking ' + fname);
        if (this.synctermCache) {
            if (ripAssetHashMatches(localPath, this.synctermCacheFiles[fname])) {
                this.session.print('\r\x1b[K');
                return true;
            }
        }
        else {
            this.session.print('\r!|1F030000' + fname + '\r\n');
            stat = await this.requireIo.readStr(10000, /[01]\.[0-9]+\.[0-9]{2}\/[0-9]{2}\/[0-9]{2}\.[0-9]{2}:[0-9]{2}:[0-9]{2}/);
            if (stat === '')
                return false;
            if (!this._isYmodemFileOutdated(stat, localPath)) {
                this.session.print('\r\x1b[K');
                return true;
            }
        }
        const ret = await this.upload(fname, localPath);
        return ret;
    }

    /**
     * Upload all LORD RIP icon files to a SyncTerm-capable terminal.
     * Skips icons that are not present on disk; only uploads those that are
     * missing from or outdated in the terminal's cache.
     *
     * Returns false if any upload fails for a file that IS present, in which
     * case the caller should disable RIP mode.
     */
    async uploadRipIcons(): Promise<boolean> {
        // Icons are shipped with the port in data/rip/icons/.
        // A sysop can override individual icons by placing them in runtime/ or data/.
        const ripIconDir = path.join(this.baseDir, 'data', 'rip', 'icons');

        await this.sln('');
        this.foreground(2);
        await this.sln('  RIP support detected, checking RIP icon cache...');

        for (const icon of RIP_ICON_FILES) {
            // Prefer runtime/ or data/ override, fall back to shipped data/rip/icons/
            let localPath = this.fileUtils.runtimeOrData(icon);
            if (!this.fileUtils.fileExists(localPath)) {
                localPath = path.join(ripIconDir, icon);
            }
            if (!this.fileUtils.fileExists(localPath)) continue;
            if (!await this.uploadIfNewer(icon, localPath)) {
                await this.sln('  Cache invalid, disabling RIP.');
                return false;
            }
        }

        while (await this.session.waitkey(0))
            await this.session.getkey();
        await this.sln('  RIP Enabled.');
        return true;
    }

    get rows(): number {
        return this.session.rows;
    }

    get cols(): number {
        return this.effectiveCols;
    }

    get ansi(): boolean | undefined {
        return this.session.ansi;
    }

    gotoxy(x: number, y: number): void {
        this.session.gotoxy(x, y);
    }

    cleareol(): void {
        this.session.cleareol();
    }

    /** Low-level print (no backtick processing, no line tracking). */
    print(s: string): void {
        this.session.print(s);
    }

    /**
     * The effective column width for text output.
     * In RIP mode, uses the authoritative text window width from showRip.
     * Otherwise uses session.cols.
     */
    get effectiveCols(): number {
        return this.rip && this.ripCols > 0 ? this.ripCols : this.session.cols;
    }

    /**
     * Generate a divider string of alternating - and = characters.
     * When length is 0 (default), auto-sizes to fill the terminal width
     * minus a small margin. Explicit lengths are preserved for mail content
     * that will be read back by other players.
     * @param length The length of the divider (0 = auto-size to terminal width).
     * @param prefix Optional prefix string (e.g., backtick codes).
     * @param suffix Optional suffix string.
     * @returns The divider string.
     */
    divider(length: number = 0, prefix: string = '', suffix: string = ''): string {
        if (length <= 0) {
            // Auto-size: fill terminal width minus a 5-column margin
            length = this.effectiveCols - 5;
        }
        // In RIP mode, cap at visible text window width
        if (this.rip && this.ripCols > 0 && length > this.ripCols) {
            length = this.ripCols;
        }
        if (length < 1) length = 1;
        return dividerUtil(length, prefix, suffix);
    }
}

export default Output;
