/**
 * TelnetConnection - Telnet IConnection implementation for LORD.
 *
 * Implements the standard BBS Telnet negotiation sequence (ECHO, SGA, NAWS,
 * TERMINAL-TYPE, LINEMODE suppression), translates Unicode output to CP437
 * for classic BBS clients, and exposes an IConnection interface compatible
 * with WebSocketConnection.
 */
import { EventEmitter } from 'events';
import * as net from 'net';
import { unicodeToCp437 } from '@lordts/util/CP437';
import type { IConnection } from './ConnectionTypes';

export class TelnetConnection extends EventEmitter implements IConnection {
    private readonly MAX_INPUT_CHUNK_BYTES = 4096;
    // Classic DOS/BBS clients expect CP437 bytes instead of UTF-8. If the
    // negotiated terminal type contains one of these tokens, switch encodings.
    private readonly CLASSIC_BBS_TERM_TYPES = ['SYNCTERM', 'CTERM', 'ANSI', 'RIP'];

    // Telnet negotiation constants
    readonly IAC  = 255;
    readonly DONT = 254;
    readonly DO   = 253;
    readonly WONT = 252;
    readonly WILL = 251;
    readonly SB   = 250;
    readonly SE   = 240;
    readonly ECHO_OPT = 1;
    readonly SUPPRESS_GO_AHEAD = 3;
    readonly TERMINAL_TYPE = 24;
    readonly NAWS = 31;
    readonly LINEMODE = 34;

    readyState: number = 1;
    remoteAddress: string;
    terminalType?: string;
    useUTF8: boolean = true; // Default to UTF-8 for modern terminals
    supportsJsonMessages: boolean = false;
    termCols: number = 80;
    termRows: number = 24;

    constructor(private socket: net.Socket) {
        super();
        this.remoteAddress = socket.remoteAddress || '127.0.0.1';
        this.socket.setNoDelay(true);

        // Standard BBS Telnet negotiation:
        // 1. IAC WILL ECHO (255, 251, 1) - Server will handle echoing characters.
        //    Clients should disable local echo.
        // 2. IAC WILL SUPPRESS_GO_AHEAD (255, 251, 3) - Modern behavior.
        // 3. IAC DO TERMINAL_TYPE (255, 253, 24) - Ask client for terminal type.
        // 4. IAC DO NAWS (255, 253, 31) - Negotiate window size.
        // 5. IAC DONT LINEMODE (255, 254, 34) - Force character-at-a-time mode.
        this.socket.write(Buffer.from([
            this.IAC, this.WILL, this.ECHO_OPT,
            this.IAC, this.WILL, this.SUPPRESS_GO_AHEAD,
            this.IAC, this.DO, this.TERMINAL_TYPE,
            this.IAC, this.DO, this.NAWS,
            this.IAC, this.DONT, this.LINEMODE
        ]));

        this.socket.on('data', (data: Buffer) => {
            if (data.length > this.MAX_INPUT_CHUNK_BYTES) {
                console.warn(`[telnet] ${this.remoteAddress} closing connection: input chunk too large (${data.length} bytes)`);
                this.close();
                return;
            }

            // Filter and handle telnet IAC commands
            let i = 0;
            const output: number[] = [];
            while (i < data.length) {
                if (data[i] === this.IAC) {
                    // Telnet commands are protocol framing, not gameplay input.
                    // Strip them here so the game only sees printable bytes.
                    const cmd = data[i + 1];
                    if (cmd >= 251 && cmd <= 254) {
                        // DO/DONT/WILL/WONT negotiation
                        const opt = data[i + 2];
                        // Auto-respond to some requests if needed
                        if (cmd === this.WILL && opt === this.TERMINAL_TYPE) {
                            // Sub-negotiate TERMINAL_TYPE SEND
                            this.socket.write(Buffer.from([this.IAC, this.SB, this.TERMINAL_TYPE, 1, this.IAC, this.SE]));
                        }
                        i += 3;
                    } else if (cmd === this.SB) { // SB (Sub-negotiation)
                        // Handle SB for terminal type or NAWS
                        let j = i + 2;
                        if (data[j] === this.TERMINAL_TYPE && data[j + 1] === 0) {
                            // Client sent TERMINAL_TYPE response
                            let end = j + 2;
                            while (end < data.length - 1) {
                                if (data[end] === this.IAC && data[end + 1] === this.SE) {
                                    break;
                                }
                                end++;
                            }
                            const termType = data.slice(j + 2, end).toString().toUpperCase();
                            this.terminalType = termType;
                            // Classic terminal ids imply CP437 art and line-drawing.
                            this.useUTF8 = !this.CLASSIC_BBS_TERM_TYPES.some((token) => termType.includes(token));
                        } else if (data[j] === this.NAWS) {
                            // RFC 1073: IAC SB NAWS <W1> <W0> <H1> <H0> IAC SE
                            // Extract payload bytes, unescaping doubled 0xFF per RFC 854.
                            const payload: number[] = [];
                            let k = j + 1;
                            while (k < data.length - 1) {
                                if (data[k] === this.IAC && data[k + 1] === this.SE) break;
                                if (data[k] === this.IAC && data[k + 1] === this.IAC) {
                                    payload.push(this.IAC);
                                    k += 2;
                                } else {
                                    payload.push(data[k]);
                                    k++;
                                }
                            }
                            if (payload.length >= 4) {
                                const cols = (payload[0] << 8) | payload[1];
                                const rows = (payload[2] << 8) | payload[3];
                                if (cols > 0 && cols <= 500 && rows > 0 && rows <= 500) {
                                    this.termCols = cols;
                                    this.termRows = rows;
                                    this.emit('resize', { cols, rows });
                                }
                            }
                        }
                        // Skip until SE (Sub-negotiation End)
                        j = i + 2;
                        while (j < data.length && (data[j] !== this.SE || data[j - 1] !== this.IAC)) {
                            j++;
                        }
                        i = j + 1;
                    } else if (cmd === this.IAC) {
                        output.push(this.IAC);
                        i += 2;
                    } else {
                        i += 2;
                    }
                } else {
                    const ch = data[i];
                    // Normalize Telnet Enter sequences (CR LF and CR NUL) down
                    // to the single carriage return the rest of LORD expects.
                    if (ch === 13) {
                        output.push(13);
                        if (data[i + 1] === 10 || data[i + 1] === 0) i += 2;
                        else i++;
                    } else {
                        output.push(ch);
                        i++;
                    }
                }
            }
            if (output.length > 0) {
                this.emit('message', Buffer.from(output));
            }
        });

        this.socket.on('close', () => {
            this.readyState = 0;
            this.emit('close');
        });

        this.socket.on('error', (err) => {
            console.error(`[telnet] ${this.remoteAddress} socket error:`, err.message);
            this.close();
        });
    }

    // ── Message transport ───────────────────────────────────────────────

    sendJson(_msg: Record<string, unknown>): void {
        // Telnet does not support JSON side-channel messages - no-op.
    }

    send(data: string | Buffer): void {
        if (!this.socket.writable) return;
        if (typeof data === 'string') {
            // Convert Unicode (v4.07 internal) for telnet clients
            let buffer: Buffer;
            if (this.useUTF8) {
                // Modern terminal - send UTF-8
                buffer = Buffer.from(data, 'utf8');
            } else {
                // Classic BBS client - send CP437 as binary
                buffer = Buffer.from(unicodeToCp437(data), 'latin1');
            }

            // Telnet protocol requirement: 0xFF MUST be escaped as 0xFF 0xFF
            // This prevents data bytes from being mistaken for Telnet commands.
            let iacCount = 0;
            for (let i = 0; i < buffer.length; i++) {
                if (buffer[i] === 255) iacCount++;
            }

            if (iacCount > 0) {
                const escaped = Buffer.alloc(buffer.length + iacCount);
                let writePtr = 0;
                for (let i = 0; i < buffer.length; i++) {
                    escaped[writePtr++] = buffer[i];
                    if (buffer[i] === 255) escaped[writePtr++] = 255;
                }
                this.socket.write(escaped);
            } else {
                this.socket.write(buffer);
            }
        } else {
            // Raw buffer - assume already escaped if it came from the app,
            // but for safety we don't escape raw chunks which might be binary data.
            this.socket.write(data);
        }
    }

    close(): void {
        this.readyState = 0;
        try {
            this.socket.end();
            this.socket.destroy();
        } catch (_e) { /* ignore */ }
    }
}

export default TelnetConnection;
