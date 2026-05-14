/**
 * ChildProcessBridge - Parent-side IO bridge for external IGM processes.
 *
 * When LORD spawns an IGM as a child process, this class wires the
 * session's IO to the child's stdin/stdout:
 *
 *   User input → session.inputInterceptor → child.stdin
 *   Child stdout → session.write() → user's terminal
 *
 * The bridge temporarily installs a session `inputInterceptor`
 * to forward keystrokes to the child process, and restores it when
 * the child exits.
 *
 * This works transparently with all transports (WebSocket, Telnet, CLI)
 * because the interceptor runs underneath the transport-specific input path and
 * `session.write()` is the universal output method.
 */

'use strict';

import type { ChildProcess } from 'child_process';
import type { ISession } from '@lordts/core/types';
import type { GameEvents, GameEvent } from '@lordts/core/GameEvents';

/** Options for the child process bridge. */
export interface BridgeOptions {
    /** Maximum time (ms) to wait before killing the child. Default: 30 minutes. */
    timeout?: number;
    /** Parent GameEvents emitter - when provided, IPC game events from the child are re-emitted here. */
    parentEvents?: GameEvents;
}

/** Default timeout: 30 minutes. */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class ChildProcessBridge {
    private _session: ISession;
    private _child: ChildProcess;
    private _timeout: number;
    private _parentEvents: GameEvents | undefined;

    constructor(session: ISession, child: ChildProcess, options?: BridgeOptions) {
        this._session = session;
        this._child = child;
        this._timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
        this._parentEvents = options?.parentEvents;
    }

    /**
     * Bridge IO between the session and child process.
     *
     * Returns a promise that resolves with the child's exit code when
     * the child process exits. Rejects if the child crashes, and always
     * restores the parent's input path before resolving or rejecting.
     */
    bridge(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const child = this._child;
            const session = this._session;

            // ── Forward user input to child stdin ───────────────────────
            // Install an input interceptor on the session.  This catches
            // ALL input regardless of transport (stdin 'data' handler in
            // CLI mode, deliverKeys() in WebSocket/Telnet mode, etc.)
            session.inputInterceptor = (data: string): void => {
                if (child.stdin && !child.stdin.destroyed) {
                    child.stdin.write(data);
                }
            };

            // ── Forward child stdout to user's terminal ─────────────────
            if (child.stdout) {
                child.stdout.on('data', (chunk: Buffer | string) => {
                    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
                    session.write(str);
                    // Flush buffered output immediately so webclient receives it
                    // without waiting for the buffer to fill (WebSocketSession buffers
                    // until 4 KB; IGM prompts are much smaller).
                    session.flush();
                });
            }

            // ── Forward child stderr to server console ──────────────────
            if (child.stderr) {
                child.stderr.on('data', (chunk: Buffer | string) => {
                    const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
                    process.stderr.write(`[IGM] ${str}`);
                });
            }

            // ── Forward IPC game events to parent ───────────────────────
            if (this._parentEvents) {
                const events = this._parentEvents;
                child.on('message', (msg: unknown) => {
                    if (msg && typeof msg === 'object' && 'type' in msg
                        && (msg as Record<string, unknown>).type === 'game_event'
                        && 'category' in msg && 'event' in msg) {
                        // Strip the 'type' wrapper and re-emit as a GameEvent
                        const { type: _type, ...event } = msg as Record<string, unknown>;
                        events.emit(event as unknown as GameEvent);
                    }
                });
            }

            // ── Timeout handling ────────────────────────────────────────
            let timer: ReturnType<typeof setTimeout> | null = null;
            if (this._timeout > 0) {
                timer = setTimeout(() => {
                    process.stderr.write(`[IGM] Child process timed out after ${this._timeout}ms, killing\n`);
                    child.kill('SIGTERM');
                    // Give it a moment to exit gracefully, then force kill
                    setTimeout(() => {
                        if (!child.killed) {
                            child.kill('SIGKILL');
                        }
                    }, 5000);
                }, this._timeout);
            }

            // ── Handle child exit ───────────────────────────────────────
            child.on('exit', (code: number | null, signal: string | null) => {
                if (timer) clearTimeout(timer);
                // Restore input first so callers can immediately continue using
                // the session even if they inspect the exit result right away.
                this._restore();

                if (signal) {
                    // Child was killed by a signal
                    process.stderr.write(`[IGM] Child process killed by signal ${signal}\n`);
                    resolve(1);
                } else {
                    resolve(code ?? 0);
                }
            });

            child.on('error', (err: Error) => {
                if (timer) clearTimeout(timer);
                // Error paths use the same cleanup order as normal exit.
                this._restore();
                reject(new Error(`IGM child process error: ${err.message}`));
            });
        });
    }

    /**
     * Remove the input interceptor from the session so keys flow normally again.
     */
    private _restore(): void {
        this._session.inputInterceptor = null;
    }
}
