/**
 * WebSocketConnection - WebSocket IConnection implementation for LORD.
 *
 * Wraps a `ws` WebSocket instance, exposes the IConnection interface, and
 * supports the JSON side-channel used by GUI mode for structured game events
 * and prompt messages.
 */
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { IConnection } from './ConnectionTypes';
import { getRequestClientIp } from './ClientIp';

export class WebSocketConnection extends EventEmitter implements IConnection {
    remoteAddress: string;
    useUTF8: boolean = true;
    supportsJsonMessages: boolean = true;
    termCols: number = 80;
    termRows: number = 24;

    constructor(private ws: WebSocket, req: IncomingMessage) {
        super();
        this.remoteAddress = getRequestClientIp(req);

        this.ws.on('message', (data) => this.emit('message', data));
        this.ws.on('close', () => this.emit('close'));
        this.ws.on('error', (err) => this.emit('error', err));
    }

    get readyState() { return this.ws.readyState; }

    // ── Message transport ───────────────────────────────────────────────

    send(data: string | Buffer): void {
        if (this.ws.readyState === 1) {
            this.ws.send(data);
        }
    }

    sendJson(msg: Record<string, unknown>): void {
        if (this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    close(code?: number, reason?: string): void {
        this.ws.close(code, reason);
    }
}

export default WebSocketConnection;
