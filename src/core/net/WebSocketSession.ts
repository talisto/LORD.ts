/**
 * WebSocketSession - Terminal I/O for LORD over WebSocket
 *
 * Async implementation that communicates via method calls from the server.
 * Keystrokes are delivered by calling deliverKey() from the connection
 * handler. Output is sent via a callback function.
 *
 * No SharedArrayBuffer or Atomics - fully event-driven and async.
 */

'use strict';

import type { ISession, ConsoleAttr, GetstrOptions, RipMessage, PlayerStats } from '../types';

// Re-export types for backwards compatibility
export type { ConsoleAttr, GetstrOptions, RipMessage, PlayerStats };

/**
 * WebSocketSession - WebSocket terminal I/O implementation
 * Implements IO for web mode via async Promises.
 */
export class WebSocketSession implements ISession {
    private readonly MAX_INPUT_CHUNK_CHARS = 4096;
    private readonly MAX_KEY_BUFFER_CHARS = 4096;

    attr: ConsoleAttr;
    rows: number;
    cols: number;

    /** Buffered keystrokes not yet consumed. */
    private _keyBuffer: string[] = [];

    /** Pending resolver for the next getkey() call (if waiting). */
    private _keyResolver: ((key: string) => void) | null = null;

    /** Whether the connection has been closed. */
    private _closed = false;

    /**
     * Timestamp (Date.now()) of the last keystroke delivered by the client.
     * Updated on every deliverKeys() call so the server can monitor idle sessions.
     */
    private _lastActivityTime: number = Date.now();

    inputInterceptor?: ((data: string) => void) | null;

    /** Output buffer - flushed before every input wait and when large. */
    private _outputBuffer: string = '';

    /** Callback to send output data to the client. */
    private _sendOutput: ((data: string) => void) | null = null;

    /** Callback to send RIP messages to the client. */
    private _sendRipMessage: ((msg: RipMessage) => void) | null = null;

    /** Callback to send player stats to the client. */
    private _sendStatsMessage: ((stats: PlayerStats) => void) | null = null;

    /** Callback to send game events to the client. */
    private _sendGameEvent: ((event: Record<string, unknown>) => void) | null = null;

    /** Callback invoked when buffered transport input exceeds safety limits. */
    private _inputOverflowHandler: ((reason: string) => void) | null = null;

    /** Callback to get current player stats (set by server after context is created). */
    private _getPlayerStats: (() => PlayerStats | null) | null = null;

    /**
     * Optional callback invoked when a control message (e.g. rip_toggle)
     * arrives from the connection handler.
     */
    onControlMessage?: (msg: Record<string, unknown>) => void;

    /**
     * Timestamp of the last keystroke received from the client.
     * The server uses this to detect idle/abandoned sessions.
     */
    get lastActivityTime(): number {
        return this._lastActivityTime;
    }

    /** Web client always supports ANSI. */
    get ansi(): boolean {
        return true;
    }

    constructor() {
        // Synchronet-compatible terminal attribute byte
        this.attr = { value: 7 };
        this.rows = 27;
        this.cols = 80;
    }

    /**
     * Set the output callback. Called by the server to wire up output delivery.
     */
    setOutputHandler(handler: (data: string) => void): void {
        this._sendOutput = handler;
    }

    /**
     * Set the RIP message callback.
     */
    setRipHandler(handler: (msg: RipMessage) => void): void {
        this._sendRipMessage = handler;
    }

    /**
     * Set the player stats message callback.
     */
    setStatsHandler(handler: (stats: PlayerStats) => void): void {
        this._sendStatsMessage = handler;
    }

    /**
     * Set the player stats provider.
     * Called by the server once the GameContext is created.
     */
    setStatsProvider(provider: () => PlayerStats | null): void {
        this._getPlayerStats = provider;
    }

    /**
     * Set the game event callback.
     * Called by the server to wire up game event delivery to the client.
     */
    setGameEventHandler(handler: (event: Record<string, unknown>) => void): void {
        this._sendGameEvent = handler;
    }

    /**
     * Set the callback invoked when input limits are exceeded.
     */
    setInputOverflowHandler(handler: (reason: string) => void): void {
        this._inputOverflowHandler = handler;
    }

    private _handleInputOverflow(reason: string): void {
        if (this._closed) return;
        this._keyBuffer = [];
        this.closeConnection();
        try {
            this._inputOverflowHandler?.(reason);
        } catch (_e) { /* ignore */ }
    }

    /**
     * Deliver a keystroke (or multiple keystrokes) from the connection handler.
     * Called by the server when input arrives from the client.
     */
    deliverKeys(data: string): void {
        if (this._closed) return;
        this._lastActivityTime = Date.now();
        if (data.length > this.MAX_INPUT_CHUNK_CHARS) {
            this._handleInputOverflow(`input chunk too large (${data.length} chars)`);
            return;
        }
        if (this.inputInterceptor) {
            this.inputInterceptor(data);
            return;
        }

        let startIndex = 0;
        if (this._keyResolver && data.length > 0) {
            // If getkey()/waitkey() is already parked, satisfy it immediately
            // with the first byte and buffer the rest for later reads.
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve(data[0]);
            startIndex = 1;
        }

        if (this._keyBuffer.length + (data.length - startIndex) > this.MAX_KEY_BUFFER_CHARS) {
            this._handleInputOverflow(`input buffer exceeded ${this.MAX_KEY_BUFFER_CHARS} chars`);
            return;
        }

        for (let i = startIndex; i < data.length; i++) {
            this._keyBuffer.push(data[i]);
        }
    }

    /**
     * Signal that the connection has been closed.
     */
    closeConnection(): void {
        this._closed = true;
        if (this._keyResolver) {
            const resolve = this._keyResolver;
            this._keyResolver = null;
            resolve('CONNECTION_CLOSED');
        }
    }

    /**
     * Deliver a control message (e.g. rip_toggle).
     */
    deliverControlMessage(msg: Record<string, unknown>): void {
        // Non-terminal side-channel events (rip toggles, resize metadata, etc.)
        // bypass the keystroke buffer and go straight to the connection handler.
        if (this.onControlMessage) {
            this.onControlMessage(msg);
        }
    }

    // ── Output buffering ────────────────────────────────────────────────

    flush(): void {
        if (this._outputBuffer.length > 0 && this._sendOutput) {
            this._sendOutput(this._outputBuffer);
            this._outputBuffer = '';
        }
    }

    private _bufferOutput(str: string): void {
        this._outputBuffer += str;
        if (this._outputBuffer.length >= 4096) {
            this.flush();
        }
    }

    // ── Output methods (mirror IO API) ─────────────────────────────

    puts(s: string): void {
        this._bufferOutput(String(s) + '\n');
    }

    write(s: string): void {
        this._bufferOutput(String(s));
    }

    print(s: string): void {
        this._bufferOutput(String(s));
    }

    center(s: string): void {
        const str = String(s);
        this._bufferOutput(str.padStart(Math.floor((80 + str.length) / 2)) + '\n');
    }

    // ── Cursor control ──────────────────────────────────────────────────

    gotoxy(x: number, y: number): void {
        this._bufferOutput(`\x1b[${y + 1};${x + 1}H`);
    }

    clear(): void {
        // Clear screen and also erase the scrollback buffer (xterm-compatible)
        this._bufferOutput('\x1b[2J\x1b[3J\x1b[H');
    }

    cleareol(): void {
        this._bufferOutput('\x1b[K');
    }

    // ── RIP side-channel ────────────────────────────────────────────────

    /**
     * Send a structured RIP message to the client.
     */
    sendRip(msg: RipMessage): void {
        this.flush();
        if (this._sendRipMessage) {
            this._sendRipMessage(msg);
        }
    }

    // ── Async input methods ─────────────────────────────────────────────

    /**
     * inkey(): Non-blocking key check.
     * Returns the next key character if one is immediately available,
     * or undefined if no key is pending.
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
        this.flush();

        // Before the client waits for more input, push any pending stats update
        // so the browser HUD stays in sync with the latest server-side state.
        // Send player stats update to the client before waiting for input
        if (this._getPlayerStats && this._sendStatsMessage) {
            const stats = this._getPlayerStats();
            if (stats) {
                this._sendStatsMessage(stats);
            }
        }

        // Already have data?
        if (this._keyBuffer.length > 0) return true;
        if (this._closed) return true;

        if (timeout === undefined || timeout <= 0) {
            return this._keyBuffer.length > 0;
        }

        // Wait up to timeout ms
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
     * Returns the key string, or 'CONNECTION_CLOSED'.
     */
    async getkey(): Promise<string> {
        this.flush();

        if (this._keyBuffer.length > 0) {
            return this._keyBuffer.shift()!;
        }

        if (this._closed) return 'CONNECTION_CLOSED';

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

        // This is intentionally simple terminal-style line editing. The web UI
        // can present richer controls, but the session still behaves like LORD.
        // Show existing text
        if (str.length > 0) this.print(str);

        while (true) {
            this.flush();

            const ch = await this.getkey();
            if (ch === 'CONNECTION_CLOSED') break;

            if (ch === '\r' || ch === '\n') {
                if (mode.crlf !== false) this.print('\r\n');
                break;
            }
            if (ch === '\x1b') break;                     // Escape - cancel
            if (ch === '\x08' || ch === '\x7f') {         // Backspace
                if (str.length > 0) {
                    str = str.slice(0, -1);
                    this.print('\x08 \x08');
                }
                continue;
            }
            if (ch.charCodeAt(0) < 32) continue;          // ignore control chars

            if (str.length < maxLen) {
                str += ch[0];
                this.print(ch[0]);
            }
        }

        return str;
    }
}

export default WebSocketSession;
