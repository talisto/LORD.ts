/**
 * StdioIgmSession - ISession implementation for IGMs running as child processes.
 *
 * Reads input from stdin and writes output to stdout.  Designed to be used
 * by IgmRunner when an IGM is spawned as an external process with piped I/O.
 *
 * Unlike DoorSession, this does NOT set raw mode (the parent process handles
 * the terminal), does NOT negotiate terminal capabilities, and does NOT
 * enforce time limits (the parent tracks time).
 */

'use strict';

import type { ISession, ConsoleAttr, GetstrOptions } from '@lordts/core/types';

export class StdioIgmSession implements ISession {
    attr: ConsoleAttr;
    rows: number;
    cols: number;

    /** Buffered keystrokes not yet consumed by getkey(). */
    private _keyBuffer: string[] = [];

    /** Pending resolver for the next getkey() call (if waiting). */
    private _keyResolver: ((key: string) => void) | null = null;

    /** Whether the input stream listener is installed. */
    private _listening = false;

    /** Whether the input stream has ended (EOF / parent closed pipe). */
    private _eof = false;

    /** Timestamp of the last input received. */
    private _lastActivityTime: number = Date.now();

    /** Whether the terminal supports ANSI (passed from parent INFO file). */
    readonly ansi: boolean;

    constructor(rows: number = 24, cols: number = 80, ansi: boolean = true) {
        this.attr = { value: 7 };
        this.rows = rows;
        this.cols = cols;
        this.ansi = ansi;
        this._setupInput();
    }

    get lastActivityTime(): number {
        return this._lastActivityTime;
    }

    /**
     * Set up stdin for async reading.
     * No raw mode - the parent process handles terminal mode for the user.
     */
    private _setupInput(): void {
        if (this._listening) return;
        this._listening = true;

        if ('resume' in process.stdin && typeof process.stdin.resume === 'function') {
            process.stdin.resume();
        }
        if ('setEncoding' in process.stdin && typeof process.stdin.setEncoding === 'function') {
            process.stdin.setEncoding('utf8');
        }

        process.stdin.on('data', (chunk: string | Buffer) => {
            this._lastActivityTime = Date.now();
            const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            for (let i = 0; i < str.length; i++) {
                const ch = str[i];
                if (this._keyResolver) {
                    const resolve = this._keyResolver;
                    this._keyResolver = null;
                    resolve(ch);
                } else {
                    this._keyBuffer.push(ch);
                }
            }
        });

        process.stdin.on('end', () => {
            this._eof = true;
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                // Resolve pending getkey() with sentinel string; IO.getkey() checks
                // for this value to trigger session teardown rather than treating it as input
                resolve('CONNECTION_CLOSED');
            }
        });

        process.stdin.on('error', () => {
            this._eof = true;
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                resolve('CONNECTION_CLOSED');
            }
        });
    }

    // ── Output ──────────────────────────────────────────────────────────

    private _write(s: string): void {
        try {
            process.stdout.write(String(s));
        } catch (_e) {
            this._eof = true;
        }
    }

    puts(s: string): void {
        this._write(String(s) + '\n');
    }

    write(s: string): void {
        this._write(String(s));
    }

    print(s: string): void {
        this._write(String(s));
    }

    center(s: string): void {
        const str = String(s);
        this._write(str.padStart(Math.floor((80 + str.length) / 2)) + '\n');
    }

    // ── Cursor control ──────────────────────────────────────────────────

    gotoxy(x: number, y: number): void {
        this._write(`\x1b[${y + 1};${x + 1}H`);
    }

    clear(): void {
        this._write('\x1b[2J\x1b[H');
    }

    cleareol(): void {
        this._write('\x1b[K');
    }

    // ── Async key reading ───────────────────────────────────────────────

    inkey(): string | undefined {
        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift();
        }
        return undefined;
    }

    async waitkey(timeout?: number): Promise<boolean> {
        if (this._keyBuffer.length > 0) return true;
        if (this._eof) return true;

        if (timeout === undefined || timeout <= 0) {
            return this._keyBuffer.length > 0;
        }

        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                this._keyResolver = null;
                resolve(false);
            }, timeout);

            this._keyResolver = (key: string) => {
                clearTimeout(timer);
                this._keyBuffer.unshift(key);
                resolve(true);
            };
        });
    }

    async getkey(): Promise<string> {
        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift()!;
        }
        if (this._eof) {
            return 'CONNECTION_CLOSED';
        }

        return new Promise<string>((resolve) => {
            this._keyResolver = resolve;
        });
    }

    async getstr(mode?: GetstrOptions): Promise<string> {
        if (mode === undefined) mode = {};
        const maxLen = mode.len || 255;
        let str = mode.edit || '';

        if (str.length > 0) this._write(str);

        while (true) {
            const ch = await this.getkey();
            if (ch === 'CONNECTION_CLOSED') break;

            if (ch === '\r' || ch === '\n') {
                if (mode.crlf !== false) this._write('\r\n');
                break;
            }
            if (ch === '\x1b') break;
            if (ch === '\x08' || ch === '\x7f') {
                if (str.length > 0) {
                    str = str.slice(0, -1);
                    // Destructive backspace: move cursor back, overwrite with space, move back again
                    this._write('\x08 \x08');
                }
                continue;
            }
            if (ch.charCodeAt(0) < 32) continue;

            if (str.length < maxLen) {
                str += ch[0];
                this._write(ch[0]);
            }
        }

        return str;
    }

    flush(): void {
        // No buffering - stdout writes are immediate.
    }

    deliverKeys(data: string): void {
        this._lastActivityTime = Date.now();
        for (let i = 0; i < data.length; i++) {
            const ch = data[i];
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                resolve(ch);
            } else {
                this._keyBuffer.push(ch);
            }
        }
    }

    closeConnection(): void {
        this._eof = true;
        if (this._keyResolver) {
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve('CONNECTION_CLOSED');
        }
        process.stdin.pause();
    }
}
