/**
 * SessionManager - Game session lifecycle management for LORD
 *
 * Handles creation, tracking, idle monitoring, and cleanup of game sessions.
 * Shared across all connection types (WebSocket, Telnet, CLI).
 */

'use strict';

import { GameContext } from '../GameContext';
import { GameExitError } from '../GameExitError';
import type { IConnection } from './ConnectionTypes';
import type { ISession } from '../types';
import type { IStorage } from '@lordts/storage/IStorage';
import type AuthManager from './AuthManager';
import AuthHandler from './AuthHandler';
import { SessionLogger } from './SessionLogger';

import * as Sentry from '@sentry/node';

interface RipToggleMessage {
    type: 'rip_toggle';
    enabled: boolean;
}

interface UiToggleMessage {
    type: 'ui_toggle';
    enabled: boolean;
}

interface ResizeMessage {
    type: 'resize';
    rows: number;
    cols: number;
}

export class SessionManager {
    private nextNodeId = 1;
    private activeSessions = new Map<string, ISession>();
    private activeContexts = new Map<string, GameContext>();
    private idleMonitorInterval: ReturnType<typeof setInterval>;
    private maintenanceMode = false;

    /** Server idle timeout in milliseconds (15 minutes). */
    private readonly SERVER_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    private readonly MAINTENANCE_MESSAGE = '\r\n\x1b[1;33m*** The realm is closed for maintenance. Please try again shortly. ***\x1b[0m\r\n';

    /**
     * Callback invoked when a player connects or disconnects.
     * Set by the WebSocket handler to broadcast events to all clients.
     */
    onPlayerEvent?: (eventType: 'player_connect' | 'player_disconnect', username: string) => void;

    constructor(
        private projectRoot: string,
        private execDir: string,
        private storage: IStorage,
        private authManager: AuthManager,
    ) {
        // ── Session idle monitor ─────────────────────────────────────────
        // Check once per minute for sessions that haven't received input
        // in SERVER_IDLE_TIMEOUT_MS and forcibly close them.
        this.idleMonitorInterval = setInterval(() => {
            this.checkIdleSessions();
        }, 60_000);
        this.idleMonitorInterval.unref();
    }

    setMaintenanceMode(active: boolean): void {
        this.maintenanceMode = active;
    }

    getActiveSessionCount(): number {
        return this.activeSessions.size;
    }

    closeAllSessionsForMaintenance(): void {
        for (const [username, gameConsole] of this.activeSessions) {
            console.log(`[session] ${username}: closing for maintenance window`);
            const ctx = this.activeContexts.get(username);
            if (ctx) {
                ctx.markPlayerOffline();
            }
            gameConsole.write(this.MAINTENANCE_MESSAGE);
            gameConsole.flush();
            gameConsole.closeConnection();
        }
    }

    /**
     * Start the auth flow on a connection (BBS-style login/registration).
     */
    handleAuth(conn: IConnection, initialRip: boolean = false): void {
        if (this.maintenanceMode) {
            if (conn.readyState === 1) {
                conn.send(this.MAINTENANCE_MESSAGE);
            }
            conn.close(1013, 'Maintenance window');
            return;
        }

        new AuthHandler(conn, {
            initialRip,
            systemName: process.env.LORD_SYSTEM_NAME || 'The Realm',
            startGameSession: (c, ioAdapter, username, rip) => this.startSession(c, ioAdapter, username, rip),
            authManager: this.authManager,
        }, this.projectRoot);
    }

    /**
     * Start a game session for an authenticated user.
     * The caller is responsible for creating and providing the ISession.
     */
    startSession(conn: IConnection, adapter: ISession, username: string, ripEnabled: boolean, uiEnabled: boolean = false): void {
        if (this.maintenanceMode) {
            adapter.write(this.MAINTENANCE_MESSAGE);
            adapter.flush();
            adapter.closeConnection();
            if (conn.readyState === 1) {
                conn.close(1013, 'Maintenance window');
            }
            return;
        }

        const nodeId = this.nextNodeId++;
        const remoteIp = conn.remoteAddress;

        // ── Multi-login protection ─────────────────────────────────────
        const existingConsole = this.activeSessions.get(username);
        if (existingConsole) {
            console.log(`[session] ${username}: kicking existing session (new login from ${remoteIp})`);
            existingConsole.write(
                '\r\n\x1b[1;33m*** You have logged in from another location. This session is closing. ***\x1b[0m\r\n'
            );
            existingConsole.flush();
            existingConsole.closeConnection();
        }
        this.activeSessions.set(username, adapter);

        // Wire output: adapter → connection
        adapter.setOutputHandler?.((data: string) => {
            if (conn.readyState === 1) conn.send(data);
        });
        adapter.setInputOverflowHandler?.((reason: string) => {
            console.warn(`[session] ${username}: closing connection (${reason})`);
            if (conn.readyState === 1) {
                try {
                    conn.send('\r\n\x1b[1;31m*** Input limit exceeded ***\x1b[0m\r\n');
                } catch (_e) { /* ignore */ }
                conn.close(4009, 'Input limit exceeded');
            }
        });

        // JSON side-channels (RIP, stats) - only for connections that support JSON
        if (conn.supportsJsonMessages) {
            adapter.setRipHandler?.((msg) => {
                conn.sendJson(msg as unknown as Record<string, unknown>);
            });

            adapter.setStatsHandler?.((stats) => {
                conn.sendJson({ type: 'player_stats', stats });
            });
        }

        // Build the game context
        const ctx = new GameContext(this.execDir, adapter, username, ripEnabled, remoteIp, nodeId, this.storage, uiEnabled);
        this.activeContexts.set(username, ctx);

        // Wire game events to JSON-capable transports (WebSocket).
        // The GameEvents emitter fires synchronously; the listener forwards
        // each event as a JSON message to the client.
        if (conn.supportsJsonMessages) {
            ctx.events.on((event) => {
                if (conn.readyState === 1) {
                    conn.sendJson({ type: 'game_event', ...event });
                }
            });
        }

        // ── Debug session logger (opt-in via DEBUG_LEVEL + DEBUG_PLAYERS env vars) ──
        const sessionLogger = SessionLogger.create(ctx.runtimeDir, username, ctx.events);
        if (sessionLogger) {
            sessionLogger.info('ip=' + remoteIp + ' node=' + nodeId + ' rip=' + ripEnabled + ' ui=' + uiEnabled);
        }

        // Wire up RIP sender for JSON-based transports
        if (ctx.rip) {
            ctx.fileUtils.buildRipIndex();
        }

        // Structured RIP messages are only valid for transports that support
        // the JSON side-channel. Telnet RIP terminals expect raw inline !|...
        // commands in the terminal stream.
        if (conn.supportsJsonMessages && adapter.sendRip) {
            ctx.display.setRipSender((section: string, lines: string[]) => {
                adapter.sendRip?.({
                    type: 'rip',
                    action: 'show',
                    section,
                    lines,
                });
            });
        }

        // Handle control messages (e.g. rip_toggle, ui_toggle)
        adapter.onControlMessage = (msg: Record<string, unknown>) => {
            if (msg && msg.type === 'rip_toggle') {
                ctx.rip = msg.enabled as boolean;
                if (msg.enabled && Object.keys(ctx.ripindex).length === 0) {
                    ctx.fileUtils.buildRipIndex();
                }
            }
            if (msg && msg.type === 'ui_toggle') {
                ctx.modern = msg.enabled as boolean;
            }
        };

        // Wire up player stats provider
        adapter.setStatsProvider?.(() => this._getPlayerStats(ctx));

        // Hook into player on_now changes to broadcast connect/disconnect
        try {
            if (ctx.player) {
                ctx.player.on_player_event = (eventType: 'player_connect' | 'player_disconnect', uname: string) => {
                    try { this.onPlayerEvent?.(eventType, uname); } catch (_e) { /* ignore */ }
                };
            }
        } catch (_e) { /* ignore */ }

        console.log(`[session] ${username} connected (node ${nodeId}, rip=${ripEnabled}, ui=${uiEnabled}, ip=${remoteIp})`);

        // ── Initialize terminal dimensions from connection ────────────
        // For Telnet: populated by NAWS negotiation before session start.
        // For WebSocket: defaults (80x24); updated live via resize messages.
        if (conn.termCols > 0) adapter.cols = conn.termCols;
        if (conn.termRows > 0) adapter.rows = conn.termRows;

        // ── Connection → Game (input via deliverKeys) ────────────────
        conn.on('message', (data: Buffer | string) => {
            this._handleSessionMessage(data, adapter);
        });

        // ── Telnet live resize (RFC 1073 NAWS) ───────────────────────
        conn.on('resize', ({ cols, rows }: { cols: number; rows: number }) => {
            adapter.cols = cols;
            adapter.rows = rows;
        });

        conn.on('close', () => {
            console.log(`[session] ${username} disconnected`);
            ctx.markPlayerOffline();
            adapter.closeConnection();
        });

        // ── Run the game (async) ─────────────────────────────────────
        void this._runGameLoop(ctx, adapter, conn, username, sessionLogger);
    }

    private _getPlayerStats(ctx: GameContext) {
        const player = ctx.player;
        if (!player || !player.player) return null;

        let playersOnline = 0;
        const allPlayers = player.allPlayers();
        for (const p of allPlayers) {
            if (p.name !== 'X' && p.on_now) {
                playersOnline++;
            }
        }

        const p = player.player;
        return {
            name: p.name,
            level: p.level,
            hp: p.hp,
            hp_max: p.hp_max,
            gold: p.gold,
            bank: p.bank,
            exp: p.exp,
            forest_fights: p.forest_fights,
            pvp_fights: p.pvp_fights,
            gems: p.gem,
            weapon: p.weapon,
            armour: p.arm,
            strength: p.str,
            defense: p.def,
            charm: p.cha,
            dead: p.dead,
            playersOnline,
        };
    }

    private _handleSessionMessage(data: Buffer | string, adapter: ISession): void {
        const str = data.toString();

        // Handle JSON control messages from the client (optional - transport-specific)
        if (str.startsWith('{') && adapter.deliverControlMessage) {
            try {
                const msg = JSON.parse(str) as RipToggleMessage | UiToggleMessage | ResizeMessage;
                // Inject Enter so the game loop re-renders the current menu in the new mode
                if (msg.type === 'rip_toggle') {
                    adapter.deliverControlMessage(msg as unknown as Record<string, unknown>);
                    adapter.deliverKeys('\r');
                    return;
                }
                if (msg.type === 'ui_toggle') {
                    adapter.deliverControlMessage(msg as unknown as Record<string, unknown>);
                    return;
                }
                if (msg.type === 'resize') {
                    const rm = msg;
                    // Clamp to sane bounds; malicious clients could send huge values to trigger OOM
                    if (typeof rm.rows === 'number' && typeof rm.cols === 'number'
                        && rm.rows > 0 && rm.rows <= 500 && rm.cols > 0 && rm.cols <= 500) {
                        adapter.rows = rm.rows;
                        adapter.cols = rm.cols;
                    }
                    return;
                }
            } catch (_e) { /* not JSON - treat as keystroke data */ }
        }

        adapter.deliverKeys(str);
    }

    private async _runGameLoop(ctx: GameContext, adapter: ISession, conn: IConnection, username: string, sessionLogger: SessionLogger | null): Promise<void> {
        try {
            await ctx.game.start();
        } catch (e: unknown) {
            const error = e as Error;
            if (error instanceof GameExitError) {
                // Normal game exit
            } else {
                Sentry.captureException(error);
                console.error(`[session] ${username} error:`, error?.message || e);
                if (conn.readyState === 1) {
                    conn.send('\r\n\x1b[1;31m*** Internal error: ' + (error?.message || e) + ' ***\x1b[0m\r\n');
                }
            }
        } finally {
            sessionLogger?.close();
            ctx.markPlayerOffline();

            while (ctx.cleanupFiles.length) {
                try {
                    ctx.fileUtils.fileRemove(ctx.cleanupFiles.shift() as string);
                } catch (_e) { /* ignore */ }
            }

            adapter.flush();

            // Only delete if this is still the active session; a newer login may have replaced us
            if (this.activeSessions.get(username) === adapter) {
                this.activeSessions.delete(username);
            }
            if (this.activeContexts.get(username) === ctx) {
                this.activeContexts.delete(username);
            }

            console.log(`[session] ${username} game exited`);
            if (conn.readyState === 1) conn.close();
        }
    }

    private checkIdleSessions(): void {
        const now = Date.now();
        const nowSecs = Math.floor(now / 1000);
        for (const [username, gameConsole] of this.activeSessions) {
            const idle = now - gameConsole.lastActivityTime;
            if (idle >= this.SERVER_IDLE_TIMEOUT_MS) {
                console.log(`[session] ${username}: closing idle session (${Math.round(idle / 1000)}s since last input)`);
                const ctx = this.activeContexts.get(username);
                if (ctx) ctx.markPlayerOffline();
                gameConsole.closeConnection();
            } else {
                // Piggyback on idle check to persist last-seen timestamp for other nodes
                const ctx = this.activeContexts.get(username);
                try {
                    const rec = ctx?.player?.player;
                    if (rec && rec.on_now) {
                        rec.last_on_unix = nowSecs;
                    }
                } catch (_e) { /* ignore */ }
            }
        }
    }

    /**
     * Stop the idle monitor. Call when shutting down the server.
     */
    shutdown(): void {
        clearInterval(this.idleMonitorInterval);
    }
}

export default SessionManager;
