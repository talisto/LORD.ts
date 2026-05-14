/**
 * TelnetServer - Telnet connection handler for LORD
 *
 * Encapsulates Telnet server creation and connection setup.
 */

'use strict';

import * as net from 'net';
import { TelnetConnection } from './TelnetConnection';
import type SessionManager from './SessionManager';

export class TelnetServer {
    private server: net.Server;

    constructor(
        private sessionManager: SessionManager,
    ) {
        this.server = net.createServer((socket) => {
            this.handleConnection(socket);
        });
    }

    private handleConnection(socket: net.Socket): void {
        const adapter = new TelnetConnection(socket);
        // Give the client a short moment to process Telnet negotiation bytes
        // (helps ensure clients disable local echo before we send the menu)
        // before SessionManager starts printing the auth/menu screens.
        setTimeout(() => this.sessionManager.handleAuth(adapter, false), 100);
    }

    /**
     * Start listening for Telnet connections on the given port.
     */
    listen(port: number): void {
        this.server.listen(port, () => {
            console.log(`LORD Telnet server listening on port ${port}`);
        });
    }

    /**
     * Shut down the Telnet server.
     */
    shutdown(): void {
        this.server.close();
    }
}

export default TelnetServer;
