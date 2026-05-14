/**
 * ConsoleSession - Terminal I/O for LORD (CLI mode)
 *
 * Provides async terminal output, cursor control, and key reading
 * for the Node.js CLI port. Uses event-driven stdin reading via Promises
 * instead of blocking fs.readSync.
 */

'use strict';

import type { ISession, ConsoleAttr, GetstrOptions } from '../types';

// Re-export types for backwards compatibility
export type { ConsoleAttr, GetstrOptions };

/**
 * ConsoleSession - CLI terminal I/O implementation
 * Implements IO for CLI mode with async key reading.
 */
class ConsoleSession implements ISession {
    attr: ConsoleAttr;
    rows: number;
    cols: number;

    /** Buffered keystrokes not yet consumed by getkey(). */
    private _keyBuffer: string[] = [];

    /** Pending resolver for the next getkey() call (if waiting). */
    private _keyResolver: ((key: string) => void) | null = null;

    /** Whether stdin listener is installed. */
    private _listening = false;

    /** Whether the stream has ended (EOF on piped input). */
    private _eof = false;

    /**
     * Timestamp (Date.now()) of the last keystroke delivered by the client.
     * Updated on every deliverKeys() call so the server can monitor idle sessions.
     */
    private _lastActivityTime: number = Date.now();

    inputInterceptor?: ((data: string) => void) | null;

    constructor() {
        // Terminal attributes (Synchronet-compatible)
        this.attr = { value: 7 };
        this.rows = process.stdout.rows || 24;
        this.cols = process.stdout.columns || 80;

        // Listen for terminal resize events (e.g. user resizes iTerm/Terminal window)
        if (process.stdout.isTTY) {
            process.stdout.on('resize', () => {
                this.rows = process.stdout.rows || 24;
                this.cols = process.stdout.columns || 80;
            });
        }

        this._setupStdin();
    }

    /**
     * Timestamp of the last keystroke received from the client.
     * The server uses this to detect idle/abandoned sessions.
     */
    get lastActivityTime(): number {
        return this._lastActivityTime;
    }

    /** Local terminal always supports ANSI. */
    get ansi(): boolean {
        return true;
    }

    /**
     * Set up stdin for async raw-mode reading.
     * Puts stdin into raw mode (if TTY) and flowing mode so 'data' events fire.
     */
    private _setupStdin(): void {
        if (this._listening) return;
        this._listening = true;

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        // Use 'latin1' so each byte is one character (matches old readSync behaviour)
        process.stdin.setEncoding('latin1');

        process.stdin.on('data', (chunk: string) => {
            this._lastActivityTime = Date.now();
            // If an interceptor is installed, forward raw input there (e.g. child process bridge)
            if (this.inputInterceptor) {
                this.inputInterceptor(chunk);
                return;
            }
            // Push each byte as a separate key
            for (let i = 0; i < chunk.length; i++) {
                const ch = chunk[i];
                if (this._keyResolver) {
                    // Someone is waiting for a key - deliver immediately
                    const resolve = this._keyResolver;
                    this._keyResolver = null;
                    resolve(ch);
                } else {
                    // No one waiting - buffer it
                    this._keyBuffer.push(ch);
                }
            }
        });

        process.stdin.on('end', () => {
            this._eof = true;
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                resolve('CONNECTION_CLOSED');
            }
        });
    }

    // ── Output ──────────────────────────────────────────────────────────

    puts(s: string): void {
        process.stdout.write(String(s) + '\n');
    }

    write(s: string): void {
        process.stdout.write(String(s));
    }

    print(s: string): void {
        process.stdout.write(String(s));
    }

    center(s: string): void {
        const str = String(s);
        process.stdout.write(str.padStart(Math.floor((80 + str.length) / 2)) + '\n');
    }

    // ── Cursor control ──────────────────────────────────────────────────

    gotoxy(x: number, y: number): void {
        process.stdout.write(`\x1b[${y + 1};${x + 1}H`);
    }

    clear(): void {
        process.stdout.write('\x1b[2J\x1b[H');
    }

    cleareol(): void {
        process.stdout.write('\x1b[K');
    }

    // ── Async key reading ───────────────────────────────────────────────

    /**
     * inkey(): Non-blocking key check.
     * Returns the next buffered key if one is available, or undefined.
     */
    inkey(): string | undefined {
        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift();
        }
        return undefined;
    }

    /**
     * waitkey(timeout): Returns true if a key is available within the
     * given timeout (milliseconds), false on timeout.
     */
    async waitkey(timeout?: number): Promise<boolean> {
        // Already have data buffered?
        if (this._keyBuffer.length > 0) return true;
        if (this._eof) return true;

        if (timeout === undefined || timeout <= 0) {
            // Non-blocking check
            return this._keyBuffer.length > 0;
        }

        // Wait up to timeout ms for a key to arrive
        return new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => {
                this._keyResolver = null;
                resolve(false);
            }, timeout);

            this._keyResolver = (key: string) => {
                clearTimeout(timer);
                // Put the key back - waitkey checks availability but doesn't consume
                this._keyBuffer.unshift(key);
                resolve(true);
            };
        });
    }

    /**
     * getkey(): Asynchronously read a single key press.
     * Returns the key string, or 'CONNECTION_CLOSED' on EOF.
     */
    async getkey(): Promise<string> {
        // Check buffer first
        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift()!;
        }

        if (this._eof) {
            return 'CONNECTION_CLOSED';
        }

        // Wait for a key to arrive
        return new Promise<string>((resolve) => {
            this._keyResolver = resolve;
        });
    }

    /**
     * getstr(mode): Async line input with basic editing.
     * mode.len = max length, mode.edit = default text, mode.crlf = emit newline
     */
    async getstr(mode?: GetstrOptions): Promise<string> {
        if (mode === undefined) mode = {};
        const maxLen = mode.len || 255;
        let str = mode.edit || '';

        // Show existing text
        if (str.length > 0) process.stdout.write(str);

        while (true) {
            const ch = await this.getkey();
            if (ch === 'CONNECTION_CLOSED') break;

            if (ch === '\r' || ch === '\n') {
                if (mode.crlf !== false) process.stdout.write('\r\n');
                break;
            }
            if (ch === '\x1b') break;                    // Escape – cancel
            if (ch === '\x08' || ch === '\x7f') {        // Backspace
                if (str.length > 0) {
                    str = str.slice(0, -1);
                    process.stdout.write('\x08 \x08');
                }
                continue;
            }
            if (ch.charCodeAt(0) < 32) continue;         // ignore control chars

            if (str.length < maxLen) {
                str += ch[0];
                process.stdout.write(ch[0]);
            }
        }

        return str;
    }

    // Optional flush for buffered consoles (no-op for CLI)
    flush(): void {
        // No buffering in CLI mode
    }

    /**
     * Deliver a keystroke (or multiple keystrokes) from the connection handler.
     * Called by the server when input arrives from the client.
     */
    deliverKeys(data: string): void {
        this._lastActivityTime = Date.now();
        if (this.inputInterceptor) {
            this.inputInterceptor(data);
            return;
        }
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

    /**
     * closeConnection(): Signal end-of-session so the Node.js process can exit.
     * Pauses stdin (releasing the event-loop reference) and satisfies any
     * pending getkey() promise with CONNECTION_CLOSED.
     */
    closeConnection(): void {
        this._eof = true;
        if (this._keyResolver) {
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve('CONNECTION_CLOSED');
        }
        // Disable raw mode and pause stdin so the event loop is free to drain.
        try {
            if (process.stdin.isTTY) process.stdin.setRawMode(false);
        } catch (_e) { /* ignore - stdin may already be closed */ }
        process.stdin.pause();
    }
}

export default ConsoleSession;
