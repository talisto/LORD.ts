/**
 * AuthManager - Authentication and session token manager for LORD.
 *
 * Handles account creation, password hashing (scrypt), login validation,
 * session token issuance and validation, brute-force rate limiting, and
 * email verification status tracking.
 */
import * as crypto from 'crypto';
import type { IStorage } from '@lordts/storage/IStorage';

interface Session {
    username: string;
    createdAt: number;
}

interface AuthRateState {
    failures: number[];
    blockedUntil: number;
}

export interface AuthRateCheck {
    allowed: boolean;
    retryAfterMs: number;
}

export interface AuthManagerOptions {
    requireEmail?: boolean;
}

export interface AccountStatus {
    username: string;
    email: string | null;
    needsEmail: boolean;
}

export interface AuthenticatedSession extends AccountStatus {
    createdAt: number;
}

export interface AuthMutationResult {
    ok: boolean;
    error?: string;
    status?: AccountStatus;
}

export class AuthManager {
    /** Persistent storage backend for accounts and sessions. */
    private storage: IStorage;
    /** In-memory map of active session token to session record; synced from storage on startup and hourly. */
    private sessions = new Map<string, Session>();
    /** Per-IP failure and lockout state for brute-force rate limiting. */
    private authRateStates = new Map<string, AuthRateState>();
    /** When true, new registrations without an email address are rejected. */
    private requireEmail: boolean;
    /** How long a session token stays valid (7 days). */
    private readonly SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
    /** Maximum number of consecutive auth failures before a block is applied. */
    private readonly AUTH_FAILURE_LIMIT = 10;
    /** Sliding window length in which failures are counted. */
    private readonly AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
    /** How long an IP remains blocked after exceeding AUTH_FAILURE_LIMIT. */
    private readonly AUTH_BLOCK_MS = 15 * 60 * 1000;

    constructor(storage: IStorage, options: AuthManagerOptions = {}) {
        this.storage = storage;
        this.requireEmail = options.requireEmail === true;
        this.loadSessions(); // Restore any persisted sessions into the in-memory cache
        this.startCleanup(); // Schedule hourly TTL cleanup
    }

    // ── Setup and lifecycle ────────────────────────────────────────────

    private loadSessions(): void {
        this.syncSessionsFromStorage();
    }

    private syncSessionsFromStorage(): void {
        const rows = this.storage.authGetAllSessions();
        const now = Date.now();
        const nextSessions = new Map<string, Session>();

        for (const r of rows) {
            if (now - r.created_at <= this.SESSION_TTL) {
                nextSessions.set(r.token, { username: r.username, createdAt: r.created_at });
            } else {
                this.storage.authDeleteSession(r.token);
            }
        }

        this.sessions = nextSessions;
    }

    private startCleanup(): void {
        const cleanupInterval = setInterval(() => {
            this.syncSessionsFromStorage();
        }, 60 * 60 * 1000);
        cleanupInterval.unref();
    }

    // ── Rate limiting ─────────────────────────────────────────────────

    private authRateKey(remoteAddress: string): string {
        return `ip:${remoteAddress || 'unknown'}`;
    }

    private getAuthRateState(key: string, now: number): AuthRateState {
        const existing = this.authRateStates.get(key);
        const state: AuthRateState = existing
            ? {
                // Rate limiting uses a sliding time window. Prune stale failures
                // every time the state is read so idle IPs naturally recover.
                failures: existing.failures.filter((ts) => ts > now - this.AUTH_FAILURE_WINDOW_MS),
                blockedUntil: existing.blockedUntil > now ? existing.blockedUntil : 0,
            }
            : { failures: [], blockedUntil: 0 };

        if (state.failures.length === 0 && state.blockedUntil === 0) {
            this.authRateStates.delete(key);
        } else {
            this.authRateStates.set(key, state);
        }

        return state;
    }

    checkAuthAllowed(remoteAddress: string): AuthRateCheck {
        const now = Date.now();
        const state = this.getAuthRateState(this.authRateKey(remoteAddress), now);
        const retryAfterMs = state.blockedUntil > now ? state.blockedUntil - now : 0;

        return {
            allowed: retryAfterMs === 0,
            retryAfterMs,
        };
    }

    recordAuthFailure(remoteAddress: string): void {
        const now = Date.now();
        const key = this.authRateKey(remoteAddress);
        const state = this.getAuthRateState(key, now);
        state.failures.push(now);
        // Once the failure count crosses the limit, clear the window and enter
        // a temporary blocked state instead of growing the array indefinitely.
        if (state.failures.length >= this.AUTH_FAILURE_LIMIT) {
            state.failures = [];
            state.blockedUntil = now + this.AUTH_BLOCK_MS;
        }
        this.authRateStates.set(key, state);
    }

    recordAuthSuccess(remoteAddress: string): void {
        this.authRateStates.delete(this.authRateKey(remoteAddress));
    }

    // ── Account operations ────────────────────────────────────────────

    private generateToken(): string { return crypto.randomBytes(32).toString('hex'); }
    private hashPassword(password: string, salt: string): string { return crypto.scryptSync(password, salt, 64).toString('hex'); }
    private normalizeEmail(email: string): string { return email.trim(); }

    isEmailRequired(): boolean {
        return this.requireEmail;
    }

    isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    getAccountStatus(username: string): AccountStatus | null {
        const row = this.storage.authGetUser(username);
        if (!row) {
            return null;
        }

        const email = row.email ?? null;
        return {
            username: row.username,
            email,
            needsEmail: this.requireEmail && !email,
        };
    }

    createUser(username: string, password: string, email: string | null = null): boolean {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = this.hashPassword(password, salt);
        const normalizedEmail = email ? this.normalizeEmail(email) : null;
        return this.storage.authCreateUser(username, hash, salt, normalizedEmail);
    }

    /** Returns the canonical stored username on success, or null on failure. */
    validateUser(username: string, password: string): string | null {
        const row = this.storage.authGetUser(username);
        if (!row) return null;
        const hash = this.hashPassword(password, row.salt);
        try {
            const valid = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(row.password_hash));
            return valid ? row.username : null;
        } catch (_e) { return null; }
    }

    userExists(username: string): boolean {
        return this.storage.authUserExists(username);
    }

    userNeedsEmail(username: string): boolean {
        return this.getAccountStatus(username)?.needsEmail === true;
    }

    setUserEmail(username: string, email: string): AuthMutationResult {
        const normalizedEmail = this.normalizeEmail(email);
        if (!this.isValidEmail(normalizedEmail)) {
            return { ok: false, error: 'Invalid email address.' };
        }

        if (!this.storage.authUpdateUserEmail(username, normalizedEmail)) {
            return { ok: false, error: 'Unable to update email address.' };
        }

        return {
            ok: true,
            status: this.getAccountStatus(username) ?? {
                username,
                email: normalizedEmail,
                needsEmail: false,
            },
        };
    }

    changePassword(username: string, currentPassword: string, newPassword: string): AuthMutationResult {
        if (newPassword.length < 3) {
            return { ok: false, error: 'Password must be at least 3 characters.' };
        }

        const row = this.storage.authGetUser(username);
        if (!row) {
            return { ok: false, error: 'Account not found.' };
        }

        const currentHash = this.hashPassword(currentPassword, row.salt);
        try {
            const valid = crypto.timingSafeEqual(Buffer.from(currentHash), Buffer.from(row.password_hash));
            if (!valid) {
                return { ok: false, error: 'Current password is incorrect.' };
            }
        } catch (_e) {
            return { ok: false, error: 'Current password is incorrect.' };
        }

        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = this.hashPassword(newPassword, newSalt);
        if (!this.storage.authUpdateUserPassword(username, newHash, newSalt)) {
            return { ok: false, error: 'Unable to update password.' };
        }

        return {
            ok: true,
            status: this.getAccountStatus(username) ?? {
                username,
                email: row.email ?? null,
                needsEmail: false,
            },
        };
    }

    // ── Session management ───────────────────────────────────────────

    createSession(username: string): string {
        const token = this.generateToken();
        const now = Date.now();
        this.sessions.set(token, { username, createdAt: now });
        this.storage.authInsertSession(token, username, now);
        return token;
    }

    validateSession(token: string): AuthenticatedSession | null {
        const persisted = this.storage.authGetSession(token);
        if (!persisted) {
            this.sessions.delete(token);
            return null;
        }

        if (Date.now() - persisted.created_at > this.SESSION_TTL) {
            this.storage.authDeleteSession(token);
            this.sessions.delete(token);
            return null;
        }

        // Touch the session TTL on every successful validation so active web
        // clients stay signed in while abandoned tokens still expire naturally.
        const now = Date.now();
        const status = this.getAccountStatus(persisted.username);
        this.sessions.set(token, { username: persisted.username, createdAt: now });
        this.storage.authUpdateSession(token, now);
        return {
            username: persisted.username,
            createdAt: now,
            email: status?.email ?? null,
            needsEmail: status?.needsEmail ?? false,
        };
    }
}

export default AuthManager;

