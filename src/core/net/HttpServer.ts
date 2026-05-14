/**
 * HttpServer - HTTP server for the LORD base web client
 *
 * Handles:
 *   - GET  /api/validate   - checks if a session token is valid
 *
 * The underlying http.Server is exposed so that WebSocketServer can attach
 * its upgrade handler to the same port.
 */

'use strict';

import * as http from 'http';
import { URL } from 'url';
import type AuthManager from './AuthManager';

export class HttpServer {
    readonly httpServer: http.Server;

    private authManager: AuthManager;

    constructor(authManager: AuthManager) {
        this.authManager = authManager;

        this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        let url: URL;
        try {
            url = new URL(req.url || '/', `http://${req.headers.host}`);
        } catch (_e) {
            res.writeHead(400);
            res.end('Bad Request');
            return;
        }

        if (url.pathname === '/api/validate') {
            this.handleValidate(url, res);
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    }

    private handleValidate(url: URL, res: http.ServerResponse): void {
        const token = url.searchParams.get('token');
        const session = token ? this.authManager.validateSession(token) : null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            valid: !!session,
            username: session?.username ?? null,
            email: session?.email ?? null,
            needsEmail: session?.needsEmail ?? false,
        }));
    }

    listen(port: number): void {
        this.httpServer.listen(port, () => {
            console.log('LORD Web Server listening on port ' + port);
        });
    }

    shutdown(): void {
        this.httpServer.close();
    }
}
