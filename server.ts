/**
 * server.ts - LORD Web Server
 *
 * HTTP server + WebSocket and Telnet connection handlers.
 *
 * Handles:
 *   1. HTTP API endpoints (/api/validate, /api/leaderboard)
 *   2. WebSocket connections (auth + game sessions)
 *   3. Telnet connections (auth + game sessions)
 *   4. Admin console (optional, on ADMIN_PORT)
 *
 * All session lifecycle logic lives in SessionManager.
 * Transport-specific concerns live in WebSocketServer and TelnetServer.
 *
 * Server startup is conditional based on environment variables:
 *   - HTTP_PORT: WebSocket server (default 80, set to empty/false/null to disable)
 *   - TELNET_PORT: Telnet server (default 2323, set to empty/false/null to disable)
 *   - ADMIN_PORT: Admin console (disabled by default, set to a port number to enable)
 *
 * Caddy (or another reverse proxy) sits in front and serves the static
 * webclient files.  This server only handles /ws and /api/* routes.
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import AuthManager from '@lordts/core/net/AuthManager';
import { createAuthStorage, createStorageOnly } from '@lordts/storage/PersistenceFactory';
import { SessionManager } from '@lordts/core/net/SessionManager';
import { WebSocketServer } from '@lordts/core/net/WebSocketServer';
import { TelnetServer } from '@lordts/core/net/TelnetServer';
import { HttpServer } from '@lordts/core/net/HttpServer';
import { DailyMaintenanceRunner } from '@lordts/core/DailyMaintenanceRunner';
import { InactiveResurrectionPolicy } from '@lordts/core/InactiveResurrectionPolicy';
import { MaintenanceScheduler } from '@lordts/core/net/MaintenanceScheduler';
import { loadDotEnv, loadSettings } from '@lordts/util/Settings';

/** Check if a port value indicates the server should be disabled */
function isPortDisabled(value: string | undefined): boolean {
    if (value === undefined || value === '') return true;
    const lower = value.toLowerCase().trim();
    if (lower === 'false' || lower === 'null' || lower === '0' || lower === 'off' || lower === 'disabled') return true;
    const num = parseInt(value, 10);
    return isNaN(num) || num <= 0;
}

// ── Ensure runtime directory exists ─────────────────────────────────────

// When compiled, __dirname is <project>/dist - go up one level.
// When running via `tsx watch` (dev), __dirname is already the project root.
const PROJECT_ROOT = path.basename(__dirname) === 'dist'
    ? path.resolve(__dirname, '..')
    : __dirname;

// Load .env file (if present) before any configuration reads -
// must happen before loadSettings() so LORD_RUNTIME_DIR takes effect.
loadDotEnv(PROJECT_ROOT);

// ── Sentry error reporting (only when SENTRY_DSN env var is provided) ───

import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        sendDefaultPii: true,
    });
}

// ── Shared services ─────────────────────────────────────────────────────

const settings = loadSettings(path.join(PROJECT_ROOT, 'data'));

// Runtime dir - resolved from settings (configurable via LORD_RUNTIME_DIR).
const RUNTIME_DIR = path.resolve(PROJECT_ROOT, settings.runtime_dir || 'runtime');
if (!fs.existsSync(RUNTIME_DIR)) {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

const sharedStorage = createStorageOnly({ settings, projectRoot: PROJECT_ROOT });
const authStorage = createAuthStorage({ settings, projectRoot: PROJECT_ROOT });
const authManager = new AuthManager(authStorage, {
    requireEmail: settings.auth_require_email === true,
});

// ── Startup sweep: clear stale on_now flags ─────────────────────────────

try {
    const cleared = sharedStorage.clearStaleOnlinePlayers();
    if (cleared > 0) {
        console.log(`[startup] Cleared stale on_now flag for ${cleared} player(s)`);
    }
} catch (e) {
    console.error('[startup] Failed to clear stale on_now flags:', e);
}

// ── Configuration ───────────────────────────────────────────────────────

// WebSocket server port - disabled if set to empty/false/null
const HTTP_PORT_ENV = process.env.HTTP_PORT;
const HTTP_ENABLED = HTTP_PORT_ENV === undefined || !isPortDisabled(HTTP_PORT_ENV);
const HTTP_PORT = HTTP_ENABLED ? parseInt(HTTP_PORT_ENV || '80', 10) : 0;

// Telnet server port - disabled if set to empty/false/null
const TELNET_PORT_ENV = process.env.TELNET_PORT;
const TELNET_ENABLED = TELNET_PORT_ENV === undefined || !isPortDisabled(TELNET_PORT_ENV);
const TELNET_PORT = TELNET_ENABLED ? parseInt(TELNET_PORT_ENV || '2323', 10) : 0;

// ── Session manager ─────────────────────────────────────────────────────

const sessionManager = new SessionManager(PROJECT_ROOT, __dirname, sharedStorage, authManager);
// MaintenanceScheduler orchestrates the daily reset: enter maintenance mode,
// wait for sessions to drain, run deferred tasks (resurrections), then daily maint.
const maintenanceScheduler = new MaintenanceScheduler(settings, {
    setMaintenanceMode: (active: boolean) => sessionManager.setMaintenanceMode(active),
    getActiveSessionCount: () => sessionManager.getActiveSessionCount(),
    closeAllSessions: () => sessionManager.closeAllSessionsForMaintenance(),
    runDeferredTasks: () => {
        const resurrectedPlayers = InactiveResurrectionPolicy.applyDueResurrections(sharedStorage, settings);
        if (resurrectedPlayers.length > 0) {
            console.log(`[maintenance] Applied ${resurrectedPlayers.length} scheduled resurrection(s)`);
        }
    },
    runMaintenance: async () => {
        const { dayBefore, dayAfter } = await DailyMaintenanceRunner.run(PROJECT_ROOT);
        console.log(`[maintenance] Completed daily maintenance ${dayBefore} -> ${dayAfter}`);
    },
});
maintenanceScheduler.start();

// ── HTTP + WebSocket + Telnet servers ────────────────────────────────────

const httpServer = new HttpServer(authManager);

let wsHandler: WebSocketServer | null = null;
let telnetHandler: TelnetServer | null = null;

if (TELNET_ENABLED) {
    telnetHandler = new TelnetServer(sessionManager);
}

// ── Start servers ───────────────────────────────────────────────────────

if (HTTP_ENABLED) {
    wsHandler = new WebSocketServer(httpServer.httpServer, authManager, sessionManager);
    httpServer.listen(HTTP_PORT);
} else {
    console.log('[startup] WebSocket server disabled (HTTP_PORT not set or disabled)');
}

if (TELNET_ENABLED && telnetHandler) {
    telnetHandler.listen(TELNET_PORT);
} else {
    console.log('[startup] Telnet server disabled (TELNET_PORT not set or disabled)');
}

process.on('SIGTERM', () => {
    maintenanceScheduler.stop();
    sessionManager.shutdown();
    httpServer.shutdown();
    if (wsHandler) wsHandler.shutdown();
    if (telnetHandler) telnetHandler.shutdown();
});