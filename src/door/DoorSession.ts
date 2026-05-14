/**
 * DoorSession - ISession implementation for BBS door mode.
 *
 * Based on ConsoleSession but adapted for running as an external door game:
 *   - Does NOT set raw mode on stdin (the BBS handles terminal mode)
 *   - Does NOT listen for terminal resize (BBS manages terminal size)
 *   - Reads user info from a parsed drop file (DropFileData)
 *   - Integrates DoorTimekeeper for time limit warnings/enforcement
 *   - Supports both stdio mode (stdin/stdout piped by BBS) and
 *     socket handle mode (inherited file descriptor from BBS)
 *   - Detects carrier loss via EOF on stdin or socket close
 */

'use strict';

import * as net from 'net';
import type { ISession, ConsoleAttr, GetstrOptions } from '@lordts/core/types';
import type { DropFileData } from './DoorTypes';
import { CommType, EmulationType } from './DoorTypes';
import { DoorTimekeeper } from './DoorTimekeeper';

export class DoorSession implements ISession {
    attr: ConsoleAttr;
    rows: number;
    cols: number;

    /** Buffered keystrokes not yet consumed by getkey(). */
    private _keyBuffer: string[] = [];

    /** Pending resolver for the next getkey() call (if waiting). */
    private _keyResolver: ((key: string) => void) | null = null;

    /** Whether the input stream listener is installed. */
    private _listening = false;

    /** Whether the stream has ended (EOF / carrier loss). */
    private _eof = false;

    /** Timestamp of the last input received. */
    private _lastActivityTime: number = Date.now();

    inputInterceptor?: ((data: string) => void) | null;

    /** The parsed drop file data. */
    private _dropFile: DropFileData;

    /** Time limit enforcement. */
    private _timekeeper: DoorTimekeeper;

    /** The readable input stream (stdin or socket). */
    private _input: NodeJS.ReadableStream;

    /** The writable output stream (stdout or socket). */
    private _output: NodeJS.WritableStream;

    /** Socket reference if using socket handle mode (for cleanup). */
    private _socket: net.Socket | null = null;

    constructor(dropFile: DropFileData, warningMinutes: number[] = [5, 2, 1]) {
        this._dropFile = dropFile;
        this.attr = { value: 7 };
        this.rows = dropFile.screenLines || 24;
        this.cols = 80;

        // Set up time limit enforcement
        this._timekeeper = new DoorTimekeeper(dropFile.timeLeftMinutes, warningMinutes);
        this._timekeeper.onWarning = (mins) => this._showTimeWarning(mins);
        this._timekeeper.onExpired = () => this._handleTimeExpired();

        // Determine I/O streams based on communication type
        if (dropFile.commType === CommType.Telnet && dropFile.socketHandle > 0) {
            // Socket handle mode: create a net.Socket from the inherited fd
            this._socket = new net.Socket({ fd: dropFile.socketHandle, readable: true, writable: true });
            this._input = this._socket;
            this._output = this._socket;
        } else {
            // Stdio mode: BBS has piped the user's connection to our stdin/stdout
            this._input = process.stdin;
            this._output = process.stdout;
        }

        this._setupInput();
    }

    get lastActivityTime(): number {
        return this._lastActivityTime;
    }

    /** Access the timekeeper for external queries (e.g. GameContext time tracking). */
    get timekeeper(): DoorTimekeeper {
        return this._timekeeper;
    }

    /** The parsed drop file data. */
    get dropFile(): DropFileData {
        return this._dropFile;
    }

    /** Whether the remote terminal supports ANSI. Derived from drop file emulation field. */
    get ansi(): boolean {
        return this._dropFile.emulation !== EmulationType.ASCII;
    }

    /**
     * Set up input stream for async reading.
     * Unlike ConsoleSession, we do NOT set raw mode - the BBS handles that.
     */
    private _setupInput(): void {
        if (this._listening) return;
        this._listening = true;

        const input = this._input as NodeJS.ReadStream;

        if ('resume' in input && typeof input.resume === 'function') {
            input.resume();
        }
        if ('setEncoding' in input && typeof input.setEncoding === 'function') {
            (input).setEncoding('latin1');
        }

        input.on('data', (chunk: string | Buffer) => {
            const str = typeof chunk === 'string' ? chunk : chunk.toString('latin1');
            this._lastActivityTime = Date.now();
            if (this.inputInterceptor) {
                this.inputInterceptor(str);
                return;
            }
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

        input.on('end', () => {
            this._eof = true;
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                resolve('CONNECTION_CLOSED');
            }
        });

        input.on('error', () => {
            this._eof = true;
            if (this._keyResolver) {
                const resolve = this._keyResolver;
                this._keyResolver = null;
                resolve('CONNECTION_CLOSED');
            }
        });

        // Socket-specific: detect close as carrier loss
        if (this._socket) {
            this._socket.on('close', () => {
                this._eof = true;
                if (this._keyResolver) {
                    const resolve = this._keyResolver;
                    this._keyResolver = null;
                    resolve('CONNECTION_CLOSED');
                }
            });
        }
    }

    // ── Output ──────────────────────────────────────────────────────────

    private _write(s: string): void {
        try {
            if (this._output === process.stdout) {
                process.stdout.write(String(s));
            } else {
                (this._output as net.Socket).write(String(s));
            }
        } catch (_e) {
            // Output stream closed - treat as carrier loss
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
        this._timekeeper.check();
        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift();
        }
        return undefined;
    }

    async waitkey(timeout?: number): Promise<boolean> {
        this._timekeeper.check();
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
        this._timekeeper.check();
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
        // No buffering in door mode stdio
    }

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

    closeConnection(): void {
        this._eof = true;
        if (this._keyResolver) {
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve('CONNECTION_CLOSED');
        }

        if (this._socket) {
            try { this._socket.end(); } catch (_e) { /* ignore */ }
        } else {
            // Stdio mode: disable raw mode if we set it, and pause stdin
            try {
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
            } catch (_e) { /* ignore */ }
            process.stdin.pause();
        }
    }

    // ── Time Warning Display ────────────────────────────────────────────

    private _showTimeWarning(minutesLeft: number): void {
        const plural = minutesLeft === 1 ? '' : 's';
        this._write(`\r\n\x1b[1;33m*** WARNING: ${minutesLeft} minute${plural} remaining! ***\x1b[0m\r\n`);
    }

    private _handleTimeExpired(): void {
        this._write('\r\n\x1b[1;31m*** Your time has expired! Disconnecting... ***\x1b[0m\r\n');
        // Signal connection closed so the game exits its input loop
        this._eof = true;
        if (this._keyResolver) {
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve('CONNECTION_CLOSED');
        }
    }
}
