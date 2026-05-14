/**
 * WebSocketServer - WebSocket connection handler for LORD
 *
 * Encapsulates WebSocket server creation, heartbeat (ping/pong),
 * connection setup, and player event broadcasting.
 */

'use strict';

import * as http from 'http';
import { URL } from 'url';
import { WebSocketServer as Wss, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { WebSocketConnection } from './WebSocketConnection';
import { WebSocketSession } from './WebSocketSession';
import type AuthManager from './AuthManager';
import type SessionManager from './SessionManager';

export class WebSocketServer {
    private wss: Wss;
    // WeakMap keeps per-socket heartbeat state without extending the ws object
    // and without retaining closed sockets after the server drops references.
    private wsAlive = new WeakMap<WebSocket, boolean>();
    private heartbeatInterval: ReturnType<typeof setInterval>;

    /** Ping interval in milliseconds (30 seconds). */
    private readonly WS_PING_INTERVAL_MS = 30_000;
    /** Maximum client-to-server frame size accepted by the game transport. */
    private readonly WS_MAX_PAYLOAD_BYTES = 4096;

    constructor(
        httpServer: http.Server,
        private authManager: AuthManager,
        private sessionManager: SessionManager,
    ) {
        this.wss = new Wss({
            server: httpServer,
            path: '/ws',
            maxPayload: this.WS_MAX_PAYLOAD_BYTES,
            perMessageDeflate: false,
        });

        // Wire up player event broadcasting via the session manager
        this.sessionManager.onPlayerEvent = (eventType, username) => {
            this.broadcastPlayerEvent(eventType, username);
        };

        // ── Heartbeat (ping/pong) ────────────────────────────────────
        this.heartbeatInterval = setInterval(() => {
            for (const client of this.wss.clients) {
                const ws = client;
                if (ws.readyState !== WebSocket.OPEN) continue;
                if (this.wsAlive.get(ws) === false) {
                    console.log('[ws] terminating unresponsive WebSocket connection');
                    ws.terminate();
                    continue;
                }
                this.wsAlive.set(ws, false);
                ws.ping();
            }
        }, this.WS_PING_INTERVAL_MS);
        this.heartbeatInterval.unref();

        // ── Handle new connections ───────────────────────────────────
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
            this.handleConnection(ws, req);
        });
    }

    private handleConnection(ws: WebSocket, req: IncomingMessage): void {
        let url: URL;
        try {
            url = new URL(req.url || '/', `http://${req.headers.host}`);
        } catch (_e) {
            ws.close(4000, 'Bad request URL');
            return;
        }

        // Register with the heartbeat tracker
        this.wsAlive.set(ws, true);
        ws.on('pong', () => this.wsAlive.set(ws, true));

        // Query parameters mirror the webclient bootstrap flow: token selects
        // an authenticated game session, while rip/ui toggle initial display mode.
        const token = url.searchParams.get('token');
        const ripEnabled = url.searchParams.get('rip') === '1';
        const uiEnabled = url.searchParams.get('ui') === '1';
        const conn = new WebSocketConnection(ws, req);

        if (token) {
            const session = this.authManager.validateSession(token);
            if (!session) {
                ws.close(4001, 'Invalid or expired session');
                return;
            }
            if (session.needsEmail) {
                ws.close(4002, 'Email address required');
                return;
            }
            const ioAdapter = new WebSocketSession();
            this.sessionManager.startSession(conn, ioAdapter, session.username, ripEnabled, uiEnabled);
        } else {
            this.sessionManager.handleAuth(conn, ripEnabled);
        }
    }

    /**
     * Broadcast a player connect/disconnect event to all connected WebSocket clients.
     */
    private broadcastPlayerEvent(eventType: 'player_connect' | 'player_disconnect', username: string): void {
        const msg = JSON.stringify({ type: eventType, username });
        for (const client of this.wss.clients) {
            try {
                // Broadcast to any open browser transport, including clients that
                // are still on login/menu screens and need live player presence.
                if (client.readyState === WebSocket.OPEN) {
                    client.send(msg);
                }
            } catch (_e) {
                // ignore send errors for individual clients
            }
        }
    }

    /**
     * Shut down the WebSocket handler. Clears the heartbeat interval.
     */
    shutdown(): void {
        clearInterval(this.heartbeatInterval);
    }
}

export default WebSocketServer;
