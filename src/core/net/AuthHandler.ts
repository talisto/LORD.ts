/**
 * AuthHandler - Async authentication flow for LORD
 *
 * Handles login and registration using a WebSocketSession for async I/O.
 * Supports both ANSI text mode and RIP graphics mode.
 *
 * Flow:
 *   1. Show intro screen (ANSI art or RIP INTRO)
 *   2. Main menu: Login / Register / Quit
 *   3. Login or register with aligned, styled prompts
 *   4. On success: emit auth_success (web) or start game session (telnet)
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import type { IConnection } from './ConnectionTypes';
import type AuthManager from './AuthManager';
import { WebSocketSession } from './WebSocketSession';
import { renderBacktickLine, resetBacktickAttr, DEFAULT_ATTR } from '@lordts/util/Backtick';
import { buildLrdIndex } from '@lordts/util/FileUtils';
import { divider as dividerUtil } from '@lordts/util/Util';
import type { ISession, RipMessage } from '../types';
import {
    applyRipSectionDimensions,
    detectRipSupport as probeRipSupport,
    queryRipAssetCache,
    RIP_ICON_FILES,
    ripAssetHashMatches,
    uploadRipAssetToCache,
} from '../io/RipSupport';

// ── Types ───────────────────────────────────────────────────────────────────

export type AuthDeps = {
    initialRip?: boolean;
    systemName?: string;
    startGameSession: (conn: IConnection, adapter: ISession, username: string, initialRip: boolean) => void;
    authManager: AuthManager;
};

type TextIndex = Record<string, string[]>;

// ── ANSI intro art names (shorter ones suitable for auth splash) ─────

const INTRO_ARTS = [
    'ACCESSD'
];

// ── AuthHandler ─────────────────────────────────────────────────────────

export class AuthHandler {
    private static authAssetCache = new Map<string, { txtIndex: TextIndex; ripIndex: TextIndex }>();
    private readonly AUTH_IDLE_TIMEOUT_MS = 2 * 60 * 1000;
    private readonly RIP_DETECT_TIMEOUT_MS = 750;
    private readonly RIP_CACHE_TIMEOUT_MS = 2000;
    // Only terminals known to support RIP graphics; probing dumb terminals would display garbage
    private readonly RIP_PROBE_TERMINALS = ['SYNCTERM', 'CTERM', 'RIP'];

    private conn: IConnection;
    private wsc: WebSocketSession;
    private rip: boolean;
    private attr = DEFAULT_ATTR;
    private txtIndex: TextIndex;
    private ripIndex: TextIndex;
    private messageHandler: (data: Buffer | string) => void;
    private resizeHandler: (dims: { cols: number; rows: number }) => void;
    private closeHandler: () => void;
    private authManager: AuthManager;
    private systemName: string;
    private startGameSession: (conn: IConnection, adapter: ISession, username: string, initialRip: boolean) => void;
    private authIdleTimer: ReturnType<typeof setTimeout> | null = null;
    private cleanedUp = false;
    private projectRoot: string;
    private ripAssetCacheSupported?: boolean;
    private ripAssetCacheFiles: Record<string, string> = {};

    private static getAuthAssets(projectRoot: string): { txtIndex: TextIndex; ripIndex: TextIndex } {
        const cached = this.authAssetCache.get(projectRoot);
        if (cached) return cached;

        const assets = {
            txtIndex: buildLrdIndex(path.join(projectRoot, 'data', 'LORDTXT.DAT')),
            ripIndex: buildLrdIndex(path.join(projectRoot, 'data', 'LORDRIP.DAT')),
        };
        this.authAssetCache.set(projectRoot, assets);
        return assets;
    }

    constructor(conn: IConnection, deps: AuthDeps, projectRoot: string) {
        this.conn = conn;
        this.rip = !!deps.initialRip;
        this.authManager = deps.authManager;
        this.systemName = deps.systemName || 'The Realm';
        this.startGameSession = deps.startGameSession;
        this.projectRoot = projectRoot;

        const authAssets = AuthHandler.getAuthAssets(projectRoot);
        this.txtIndex = authAssets.txtIndex;
        this.ripIndex = authAssets.ripIndex;

        // Create console and wire to connection
        this.wsc = new WebSocketSession();
        this.wsc.cols = conn.termCols;
        this.wsc.rows = conn.termRows;
        this.wsc.setOutputHandler((data: string) => {
            if (conn.readyState === 1) conn.send(data);
        });
        if (conn.supportsJsonMessages) {
            this.wsc.setRipHandler((msg: RipMessage) => {
                if (conn.readyState === 1) conn.send(JSON.stringify(msg));
            });
        }
        this.wsc.setInputOverflowHandler((reason: string) => {
            console.warn(`[auth] ${this.conn.remoteAddress}: closing connection (${reason})`);
            this.terminateAuthConnection('*** Input limit exceeded ***', 4009, 'Input limit exceeded');
        });

        // Keep terminal dimensions in sync if the client resizes during auth (Telnet NAWS)
        this.resizeHandler = ({ cols, rows }: { cols: number; rows: number }) => {
            this.wsc.cols = cols;
            this.wsc.rows = rows;
        };
        conn.on('resize', this.resizeHandler);

        // Wire input: connection → console
        this.messageHandler = (data: Buffer | string) => {
            this.resetAuthIdleTimer();
            const str = data.toString();
            if (str.startsWith('{')) {
                try {
                    const msg = JSON.parse(str) as { type: string; enabled?: boolean };
                    if (msg.type === 'rip_toggle') {
                        this.rip = !!msg.enabled;
                        return;
                    }
                } catch (_e) { /* not JSON - treat as keystrokes */ }
            }
            this.wsc.deliverKeys(str);
        };
        conn.on('message', this.messageHandler);

        this.closeHandler = () => {
            this.wsc.closeConnection();
            this.cleanup();
        };
        conn.on('close', this.closeHandler);

        this.resetAuthIdleTimer();

        // Start the async auth flow
        void this.run();
    }

    private resetAuthIdleTimer(): void {
        if (this.authIdleTimer) {
            clearTimeout(this.authIdleTimer);
        }
        this.authIdleTimer = setTimeout(() => {
            this.terminateAuthConnection('*** Login timed out ***', 4008, 'Authentication timeout');
        }, this.AUTH_IDLE_TIMEOUT_MS);
        this.authIdleTimer.unref();
    }

    private terminateAuthConnection(message: string, closeCode: number, closeReason: string): void {
        if (this.cleanedUp) return;
        try {
            if (this.conn.readyState === 1) {
                this.conn.send(`\r\n\x1b[1;31m${message}\x1b[0m\r\n`);
            }
        } catch (_e) { /* ignore */ }
        this.wsc.closeConnection();
        this.cleanup();
        try {
            this.conn.close(closeCode, closeReason);
        } catch (_e) { /* ignore */ }
    }

    private formatRateLimitMessage(retryAfterMs: number): string {
        const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
        return `Too many login attempts. Please wait about ${retryAfterMinutes} minute(s).`;
    }

    private logRateLimitHit(context: 'login' | 'register', username: string, retryAfterMs: number): void {
        console.warn(
            `[auth] rate limit hit (${context}) ip=${this.conn.remoteAddress} username=${username || '(blank)'} retryAfterMs=${retryAfterMs}`
        );
    }

    private divider(): string {
        return '`2' + dividerUtil(Math.max(1, this.wsc.cols - 5), '  ');
    }

    private shouldProbeRip(): boolean {
        if (this.rip || this.conn.supportsJsonMessages) {
            return false;
        }
        const termType = this.conn.terminalType?.toUpperCase();
        return termType !== undefined && this.RIP_PROBE_TERMINALS.some((token) => termType.includes(token));
    }

    private async ensureRipAssetCache(): Promise<boolean> {
        const cacheFiles = await queryRipAssetCache(this.wsc, this.RIP_CACHE_TIMEOUT_MS);
        if (cacheFiles === undefined) {
            return false;
        }
        this.ripAssetCacheFiles = cacheFiles;
        return true;
    }

    private async uploadIfNewer(fname: string, localPath: string): Promise<boolean> {
        if (this.ripAssetCacheSupported === undefined) {
            this.ripAssetCacheSupported = await this.ensureRipAssetCache();
        }
        if (!this.ripAssetCacheSupported) {
            return false;
        }

        if (ripAssetHashMatches(localPath, this.ripAssetCacheFiles[fname])) {
            return true;
        }

        return uploadRipAssetToCache(this.wsc, fname, localPath);
    }

    private async uploadRipIcons(): Promise<boolean> {
        const ripIconDir = path.join(this.projectRoot, 'data', 'rip', 'icons');
        for (const icon of RIP_ICON_FILES) {
            const localPath = path.join(ripIconDir, icon);
            if (!fs.existsSync(localPath)) {
                continue;
            }
            if (!await this.uploadIfNewer(icon, localPath)) {
                return false;
            }
        }

        return true;
    }

    private async detectRipSupport(): Promise<void> {
        if (!this.shouldProbeRip()) {
            return;
        }

        this.rip = await probeRipSupport(this.wsc, this.RIP_DETECT_TIMEOUT_MS);
        if (this.rip) {
            const uploaded = await this.uploadRipIcons();
            if (!uploaded) {
                this.rip = false;
            }
        }
    }

    // ── Output helpers ─────────────────────────────────────────────────

    /** Write raw text to the console. */
    private write(s: string): void {
        this.wsc.print(s);
    }

    /** Write LORD-formatted text (with backtick codes) and CRLF. */
    private writeLn(s: string): void {
        const { result, attr } = renderBacktickLine(s, this.attr, this.wsc.cols);
        this.attr = attr;
        this.write(result + '\r\n');
    }

    /** Write LORD-formatted text without CRLF. */
    private writeText(s: string): void {
        const { result, attr } = renderBacktickLine(s, this.attr, this.wsc.cols);
        this.attr = attr;
        this.write(result);
    }

    /** Clear the screen. */
    private clear(): void {
        this.wsc.clear();
    }

    /** Flush output buffer. */
    private flush(): void {
        this.wsc.flush();
    }

    /** Wait for a single keypress and return it. */
    private async getKey(): Promise<string> {
        this.flush();
        return this.wsc.getkey();
    }

    /**
     * Read a line of text with optional password masking.
     * Draws a background-colored input field of the given width.
     */
    private async readField(maxLen: number, masked: boolean = false): Promise<string> {
        // Draw the input field background (white on blue)
        this.write('\x1b[1;37;44m');
        this.write(' '.repeat(maxLen));
        this.write('\x1b[' + maxLen + 'D');  // move cursor back to start of field
        this.flush();

        let str = '';
        while (true) {
            const ch = await this.getKey();
            if (ch === 'CONNECTION_CLOSED') return '';
            if (ch === '\r' || ch === '\n') break;
            if (ch === '\x1b') { str = ''; break; }
            if (ch === '\x08' || ch === '\x7f') {
                if (str.length > 0) {
                    str = str.slice(0, -1);
                    // Move back, overwrite with a blue space, move back again
                    this.write('\x08\x1b[1;37;44m \x08');
                }
                continue;
            }
            if (ch.charCodeAt(0) < 32) continue;
            if (str.length < maxLen) {
                str += ch;
                this.write(masked ? '*' : ch);
            }
        }

        // Reset colors after input
        this.write(resetBacktickAttr());
        this.attr = DEFAULT_ATTR;
        return str;
    }

    /** Output an lrd text section (ANSI art). */
    private displayLrdSection(name: string): void {
        const lines = this.txtIndex[name];
        if (!lines) return;
        for (const line of lines) {
            this.writeLn(line);
        }
    }

    /** Send a RIP screen section to the client. */
    private sendRip(section: string): void {
        const lines = this.ripIndex[section];
        if (!lines) return;
        applyRipSectionDimensions(this.wsc, lines, {
            cols: this.conn.termCols > 0 ? this.conn.termCols : 80,
            rows: this.conn.termRows > 0 ? this.conn.termRows : 24,
        });
        if (!this.conn.supportsJsonMessages) {
            for (const line of lines) {
                this.write(line + '\r\n');
            }
            return;
        }
        this.wsc.sendRip({
            type: 'rip',
            action: 'show',
            section,
            lines,
        });
    }

    // ── UI Screens ──────────────────────────────────────────────────────

    /** Show the intro splash screen and wait for a keypress. */
    private async showIntro(): Promise<void> {
        this.clear();
        if (this.rip) {
            this.sendRip('INTRO');
        } else {
            // Pick a random LORD intro art from the available set
            const available = INTRO_ARTS.filter(name => name in this.txtIndex);
            if (available.length > 0) {
                const pick = available[Math.floor(Math.random() * available.length)];
                this.displayLrdSection(pick);
            }
        }
        this.flush();
        await this.getKey();
    }

    /** Draw the auth screen header with optional subtitle. */
    private drawHeader(subtitle?: string): void {
        this.clear();
        if (this.rip) {
            this.sendRip('W1');
        }
        this.write('\r\n');
        this.writeLn(this.divider());
        this.writeLn('`>`!' + this.systemName);
        this.writeLn('`>`% Legend of the `4Red `%Dragon');
        if (subtitle) {
            this.writeLn('`>`2' + subtitle);
        }
        this.writeLn(this.divider());
        this.write('\r\n');
    }

    /** Show the main menu and return the user's choice (L, R, or Q). */
    private async showMenu(): Promise<string> {
        this.drawHeader();
        this.writeLn('`2      (`0L`2) `7Login to existing account');
        this.writeLn('`2      (`0R`2) `7Register new warrior');
        this.writeLn('`2      (`0Q`2) `7Quit');
        this.write('\r\n');
        this.writeLn(this.divider());
        this.write('\r\n');
        this.writeText('`2      Your choice, warrior? [`0L`2]: `%');
        this.flush();

        while (true) {
            const ch = await this.getKey();
            if (ch === 'CONNECTION_CLOSED') return 'Q';
            const upper = ch.toUpperCase();
            if (upper === 'L' || upper === '\r' || upper === '\n') {
                this.write('L\r\n');
                return 'L';
            }
            if (upper === 'R') {
                this.write('R\r\n');
                return 'R';
            }
            if (upper === 'Q') {
                this.write('Q\r\n');
                return 'Q';
            }
            // Ignore invalid keys - no echo, no error, just wait
        }
    }

    /** Show an error message and wait for a keypress. */
    private async showError(message: string): Promise<void> {
        this.write('\r\n');
        this.writeLn('`4  ' + message);
        this.write('\r\n');
        this.writeText('`2  Press any key...`7 ');
        this.flush();
        await this.getKey();
    }

    /** Show a success message. */
    private showSuccess(message: string): void {
        this.write('\r\n');
        this.writeLn(message);
        this.write('\r\n');
    }

    private async promptRequiredEmail(username: string): Promise<string | null> {
        const fieldWidth = Math.min(48, Math.max(30, this.wsc.cols - 18));

        while (true) {
            this.drawHeader('`7Email Address Required');
            this.writeLn('`2  Before you continue, this realm needs an email address');
            this.writeLn('`2  on file for password recovery and account features.');
            this.writeLn('`2  We will not spam you!');
            this.write('\r\n');
            this.writeLn('`2  Account:   `%' + username + '`2');
            this.writeText('`2  Email:     ');
            const email = await this.readField(fieldWidth);
            this.write('\r\n');

            if (!email) {
                return null;
            }

            const normalizedEmail = email.trim();
            if (this.authManager.isValidEmail(normalizedEmail)) {
                return normalizedEmail;
            }

            await this.showError('Invalid email address.');
        }
    }

    private async captureRequiredEmail(username: string): Promise<boolean> {
        while (true) {
            const email = await this.promptRequiredEmail(username);
            if (!email) {
                return false;
            }

            const result = this.authManager.setUserEmail(username, email);
            if (result.ok) {
                return true;
            }

            await this.showError(result.error || 'Unable to update email address.');
        }
    }

    // ── Auth flows ──────────────────────────────────────────────────────

    /** Login flow. Returns username on success, null on failure. */
    private async doLogin(): Promise<string | null> {
        this.drawHeader('`7Login');
        const FIELD_WIDTH = 30;

        this.writeText('`2  Username:  ');
        const username = await this.readField(FIELD_WIDTH);
        this.write('\r\n');
        if (!username) return null;

        this.writeText('`2  Password:  ');
        const password = await this.readField(FIELD_WIDTH, true);
        this.write('\r\n');
        if (!password) return null;

        const rateLimit = this.authManager.checkAuthAllowed(this.conn.remoteAddress);
        if (!rateLimit.allowed) {
            this.logRateLimitHit('login', username, rateLimit.retryAfterMs);
            await this.showError(this.formatRateLimitMessage(rateLimit.retryAfterMs));
            return null;
        }

        const canonicalName = this.authManager.validateUser(username, password);
        if (canonicalName !== null) {
            this.authManager.recordAuthSuccess(this.conn.remoteAddress);
            if (this.authManager.userNeedsEmail(canonicalName)) {
                const captured = await this.captureRequiredEmail(canonicalName);
                if (!captured) return null;
            }
            return canonicalName;
        }

        this.authManager.recordAuthFailure(this.conn.remoteAddress);

        await this.showError('Invalid username or password.');
        return null;
    }

    /** Registration flow. Returns username on success, null on failure. */
    private async doRegister(): Promise<string | null> {
        this.drawHeader('`7Register');
        const FIELD_WIDTH = 30;

        this.writeText('`2  Username:  ');
        const username = await this.readField(FIELD_WIDTH);
        this.write('\r\n');
        if (!username) return null;

        const rateLimit = this.authManager.checkAuthAllowed(this.conn.remoteAddress);
        if (!rateLimit.allowed) {
            this.logRateLimitHit('register', username, rateLimit.retryAfterMs);
            await this.showError(this.formatRateLimitMessage(rateLimit.retryAfterMs));
            return null;
        }

        if (username.length < 2 || username.length > 30) {
            await this.showError('Username must be 2-30 characters.');
            return null;
        }
        if (this.authManager.userExists(username)) {
            this.authManager.recordAuthFailure(this.conn.remoteAddress);
            await this.showError('Username already taken.');
            return null;
        }

        this.writeText('`2  Password:  ');
        const password = await this.readField(FIELD_WIDTH, true);
        this.write('\r\n');
        if (!password) return null;

        if (password.length < 3) {
            await this.showError('Password must be at least 3 characters.');
            return null;
        }

        this.writeText('`2  Confirm:   ');
        const confirm = await this.readField(FIELD_WIDTH, true);
        this.write('\r\n');
        if (!confirm) return null;

        if (password !== confirm) {
            await this.showError('Passwords don\'t match.');
            return null;
        }

        let email: string | null = null;
        if (this.authManager.isEmailRequired()) {
            email = await this.promptRequiredEmail(username);
            if (!email) return null;
        }

        if (this.authManager.createUser(username, password, email)) {
            this.authManager.recordAuthSuccess(this.conn.remoteAddress);
            return username;
        }

        this.authManager.recordAuthFailure(this.conn.remoteAddress);

        await this.showError('Registration failed. Username may already be taken.');
        return null;
    }

    // ── Main auth loop ──────────────────────────────────────────────────

    private async run(): Promise<void> {
        try {
            await this.detectRipSupport();

            // Show intro splash screen
            await this.showIntro();

            // Main auth loop - returns to menu on failure while the auth idle timer
            // guards against abandoned unauthenticated connections.
            while (true) {
                const choice = await this.showMenu();

                if (choice === 'Q') {
                    this.conn.sendJson({ type: 'auth_quit' });
                    this.cleanup();
                    this.conn.close();
                    return;
                }

                let username: string | null = null;

                if (choice === 'L') {
                    username = await this.doLogin();
                } else if (choice === 'R') {
                    username = await this.doRegister();
                }

                if (username !== null) {
                    const token = this.authManager.createSession(username);
                    const label = choice === 'L' ? 'Welcome back' : 'Account created! Welcome';
                    this.showSuccess('`2  ' + label + ', `%' + username + '`2!');
                    this.flush();

                    // Clean up auth listeners before handing off
                    this.cleanup();

                    if (this.conn.supportsJsonMessages) {
                        // Web mode: send auth_success; client reconnects with token
                        this.conn.sendJson({ type: 'auth_success', token, username });
                    } else {
                        // Telnet/CLI mode: start game session on this connection
                        this.startGameSession(this.conn, this.wsc, username, this.rip);
                    }
                    return;
                }
                // Auth failed - loop back to menu (no timeout)
            }
        } catch (e: unknown) {
            const error = e as Error;
            if (error?.message !== 'CONNECTION_CLOSED') {
                console.error('[auth] Error:', error?.message || e);
            }
            this.cleanup();
        }
    }

    /** Remove auth event listeners from the connection. */
    private cleanup(): void {
        if (this.cleanedUp) return;
        this.cleanedUp = true;
        if (this.authIdleTimer) {
            clearTimeout(this.authIdleTimer);
            this.authIdleTimer = null;
        }
        try { this.conn.removeListener('message', this.messageHandler); } catch (_e) { /* ignore */ }
        try { this.conn.removeListener('resize', this.resizeHandler); } catch (_e) { /* ignore */ }
        try { this.conn.removeListener('close', this.closeHandler); } catch (_e) { /* ignore */ }
    }
}

export default AuthHandler;
