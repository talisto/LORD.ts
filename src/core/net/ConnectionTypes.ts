/**
 * ConnectionTypes - IConnection interface for LORD transport implementations.
 *
 * Defines the contract shared by WebSocketConnection and TelnetConnection:
 * ready-state, send, JSON side-channel messages, and terminal dimensions.
 * Game code that needs to push data to a client depends on this interface
 * rather than a concrete transport class.
 */
import { EventEmitter } from 'events';

export interface IConnection extends EventEmitter {
    readyState: number;
    remoteAddress: string;
    /** Uppercased terminal type reported via Telnet TERMINAL-TYPE negotiation, when available. */
    terminalType?: string;
    useUTF8: boolean;
    /** Whether this connection supports JSON side-channel messages. */
    supportsJsonMessages: boolean;
    /** Terminal width reported by the client (NAWS for Telnet, resize message for WebSocket). */
    termCols: number;
    /** Terminal height reported by the client (NAWS for Telnet, resize message for WebSocket). */
    termRows: number;
    send(data: string | Buffer): void;
    /**
     * Send a structured JSON message over the connection.
     * No-op on connection types that don't support JSON (e.g. Telnet).
     */
    sendJson(msg: Record<string, unknown>): void;
    close(code?: number, reason?: string): void;
}

export default IConnection;
