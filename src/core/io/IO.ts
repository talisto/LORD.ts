/**
 * IO - Unified display + input facade for LORD
 *
 * This class composes Output and Input concerns behind a short `this.io` API.
 */

'use strict';

import { mswait as _mswait } from '@lordts/util/Util';
import type { Output } from './Output';
import type { Input } from './Input';
import type { GetstrOptions, PromptConfig } from '../types';
import type { GameEvents, PromptOption, PromptInputMode } from '../GameEvents';

export class IO {
    output: Output;
    input: Input;
    events: GameEvents | null;

    constructor(output: Output, input: Input) {
        this.output = output;
        this.input = input;
        this.events = null;
        // Wire back-references so Input and Output can call io methods
        if (input) input.io = this;
        if (output) output.io = this;
    }

    sw(str: string, indent: boolean | number = 0): void {
        return this.output.sw(str, indent);
    }

    async sln(str?: string, indent: boolean | number = 2, wrap: boolean = true): Promise<void> {
        return this.output.sln(str || '', indent, wrap);
    }

    async lln(str: string, indent: boolean | number = 2, ext?: boolean, wrap: boolean = true): Promise<void> {
        return this.output.lln(str, indent, ext, wrap);
    }

    async lw(str: string, indent: boolean | number = 0, ext?: boolean): Promise<void> {
        return this.output.lw(str, indent, ext);
    }

    foreground(col: number): void {
        this.output.foreground(col);
    }

    background(col: number): void {
        this.output.background(col);
    }

    sclrscr(): void {
        this.output.sclrscr();
    }

    async showTxt(fname: string, more?: boolean): Promise<void> {
        return this.output.showTxt(fname, more);
    }

    async showRip(fname: string, update?: boolean): Promise<void> {
        return this.output.showRip(fname, update);
    }

    async more(): Promise<void> {
        return this.output.more();
    }

    async moreNoMail(): Promise<void> {
        return this.output.moreNoMail();
    }

    async showFile(fname: string, quote?: boolean, mail?: boolean): Promise<void> {
        return this.output.showFile(fname, quote, mail);
    }

    async displayFilePaged(fname: string, canskip?: boolean, more?: boolean): Promise<void> {
        return this.output.displayFilePaged(fname, canskip, more);
    }

    async deadScreen(op: { name: string | null }): Promise<void> {
        return this.output.deadScreen(op);
    }

    async showBuffer(buf: string, quote?: boolean, mail?: boolean): Promise<void> {
        return this.output.showBuffer(buf, quote, mail);
    }

    async showStats(): Promise<void> {
        return this.output.showStats();
    }

    async showLooks(op: { sex: string; cha: number }): Promise<void> {
        return this.output.showLooks(op);
    }

    async warriorsOnNow(inhello?: boolean): Promise<void> {
        return this.output.warriorsOnNow(inhello);
    }

    async showAlone(): Promise<void> {
        await this.output.showAlone();
    }

    async showGameStats(): Promise<void> {
        return this.output.showGameStats();
    }

    async checkRip(name: string): Promise<void> {
        await this.output.checkRip(name);
    }

    async announce(): Promise<void> {
        return this.output.announce();
    }

    async instructions(): Promise<void> {
        return this.output.instructions();
    }

    /** Flush any buffered output to the client immediately. No-op on CLI. */
    flush(): void {
        this.output.flush();
    }

    /**
     * Flush buffered output then emit a prompt event for the GUI.
     * Flushing ensures all preceding terminal text reaches the client
     * before the prompt JSON message so buttons update correctly.
     */
    emitPrompt(promptId: string, options: PromptOption[], inputMode?: PromptInputMode, defaultValue?: string): void {
        this.flush();
        this.events?.emitPrompt(promptId, options, inputMode, defaultValue);
    }

    /**
     * Flush buffered output then wait for the given number of milliseconds.
     * Use this instead of the bare `mswait()` utility whenever output should
     * be visible to the client before the delay (e.g. progressive dot animations).
     */
    async mswait(ms: number): Promise<void> {
        this.flush();
        return _mswait(ms);
    }

    // ── Low-level console proxies ─────────────────────────────────────────
    // These forward directly to the underlying IO terminal so that game
    // classes never need a separate `console: IO` dependency.

    get rows(): number {
        return this.output.rows;
    }

    get cols(): number {
        return this.output.cols;
    }

    get ansi(): boolean | undefined {
        return this.output.ansi;
    }

    get modern(): boolean {
        return this.input.modern;
    }

    gotoxy(x: number, y: number): void {
        this.output.gotoxy(x, y);
    }

    cleareol(): void {
        this.output.cleareol();
    }

    /** Low-level print (no backtick processing, no line tracking). */
    print(s: string): void {
        this.output.print(s);
    }

    async waitkey(timeout?: number): Promise<boolean> {
        return this.input.waitkey(timeout);
    }

    // ── Input ─────────────────────────────────────────────────────────────

    async getkey(): Promise<string> {
        return this.input.getkey();
    }

    async getstr(options?: GetstrOptions): Promise<string> {
        const opts = options || {};
        const x = opts.x || 0;
        const y = opts.y || 0;
        const len = opts.len || 0;
        const c = opts.c || 0;
        const c1 = opts.c1 || 0;
        const str = opts.edit || "";
        return this.input.getstr(x, y, len, c, c1, str, opts);
    }

    async commandPrompt(promptId?: string, options?: PromptOption[], echo?: boolean): Promise<string> {
        return this.input.commandPrompt(promptId, options, echo);
    }

    async readStr(timeout: number, regex?: RegExp): Promise<string> {
        return this.input.readStr(timeout, regex);
    }

    async readApc(timeout: number): Promise<string | undefined> {
        return this.input.readApc(timeout);
    }

    /**
     * Probe the terminal for RIP/SyncTerm support.
     * Returns true if a RIP-capable terminal is detected within the timeout.
     */
    async detectRip(timeout: number): Promise<boolean> {
        return this.input.detectRip(timeout);
    }

    /**
     * Upload LORD RIP icon files to a SyncTerm-capable terminal.
     * Only uploads icons that are missing or outdated in the terminal's cache.
     * Returns false if any upload fails (caller should disable RIP).
     */
    async uploadRipIcons(): Promise<boolean> {
        return this.output.uploadRipIcons();
    }

    /**
     * Prompt the player with a set of valid options, emitting a prompt event
     * for the GUI, then wait for a valid key press.
     *
     * This helper consolidates the common pattern of:
     * 1. Print leading blank line
     * 2. Print prompt text (or auto-generate from options)
     * 3. Emit prompt event for GUI
     * 4. Wait for valid keypress (loop until valid, or use default)
     * 5. Echo the keypress
     * 6. Print trailing blank line
     * 7. Return the uppercased key
     *
     * @param text      Prompt text to display, or null to auto-generate from options
     * @param options   Array of valid key/label pairs
     * @param promptId  Optional identifier for this prompt (for GUI events)
     * @param config    Optional configuration
     * @returns         The key that was pressed (uppercased)
     */
    async prompt(
        text: string | null,
        options: PromptOption[],
        promptId?: string,
        config?: PromptConfig
    ): Promise<string> {
        const cfg: PromptConfig = {
            echo: true,
            echoStyle: 'line',
            leadingBlank: true,
            trailingBlank: true,
            anyKey: false,
            rawText: false,
            ...config
        };

        // In UI mode, suppress terminal prompt text and echo - the graphical
        // overlay handles display via the emitted prompt event below.
        // showTextInModern overrides this so inline dialogues remain readable.
        const suppress = this.input.modern && !cfg.showTextInModern;

        // Build valid keys set (uppercase)
        const validKeys = new Set(options.map(o => o.key.toUpperCase()));

        // Leading blank line
        if (cfg.leadingBlank && !suppress) {
            await this.sln();
        }

        // Print prompt text (or auto-generate)
        if (!suppress) {
            const promptText = text ?? this.generatePromptText(options);
            if (promptText) {
                if (cfg.rawText) {
                    this.sw(promptText);
                } else {
                    await this.lw(promptText);
                }
            }
        }

        // Emit prompt event for GUI
        if (promptId) {
            this.emitPrompt(promptId, options);
        }

        // Wait for valid keypress
        let ch: string;
        for (;;) {
            ch = (await this.input.getkey()).toUpperCase();

            // If anyKey is set, any key is valid
            if (cfg.anyKey) {
                break;
            }

            // Check if key is valid
            if (validKeys.has(ch)) {
                break;
            }

            // If default key is set and invalid key pressed, use default
            if (cfg.defaultKey !== undefined) {
                // Enter or invalid key -> use default
                if (ch === '\r' || ch === '\n' || !validKeys.has(ch)) {
                    ch = cfg.defaultKey.toUpperCase();
                    break;
                }
            }
            // Otherwise loop and try again
        }

        // Echo the keypress
        if (cfg.echo && !suppress) {
            if (cfg.echoStyle === 'char') {
                this.sw(ch);
            } else {
                await this.sln(ch, 0);
            }
        }

        // Trailing blank line
        if (cfg.trailingBlank && !suppress) {
            await this.sln();
        }

        return ch;
    }

    /**
     * Auto-generate prompt text from options using LORD backtick color codes.
     * Format: "  `2(`0K`2,`0D`2) : `%"
     * `0 = dark grey (key letter), `2 = green (separator), `% = reset.
     */
    private generatePromptText(options: PromptOption[]): string {
        if (options.length === 0) return '';
        const keys = options.map(o => '`0' + o.key + '`2').join(',');
        return `  \`2(${keys}) : \`%`;
    }

    divider(length: number = 0, prefix: string = '', suffix: string = ''): string {
        return this.output.divider(length, prefix, suffix);
    }
}

export default IO;
