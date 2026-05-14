/**
 * SqliteStorage - SQLite-backed IStorage implementation for LORD.
 *
 * Uses better-sqlite3 for synchronous operations.  All sessions share a
 * single SqliteStorage instance so changes made by one session are
 * immediately visible to all others.
 *
 * Extends BaseStorage which provides in-memory transient session state
 * and the DbRecordFile implementation.
 */

'use strict';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { IRecordFile, RecordFieldDef } from './IRecordFile';
import { BaseStorage, DbRecordFile } from './BaseStorage';

// ── Internal types ──────────────────────────────────────────────────────

interface RecordRow {
    idx: number;
    data: string;
}

interface LogRow {
    line: string;
}

interface CountRow {
    cnt: number;
}

interface MaxIdxRow {
    maxIdx: number | null;
}

interface DataRow {
    data: string;
}

interface TableInfoRow {
    name: string;
}

interface PreparedStatements {
    get: Database.Statement;
    upsert: Database.Statement;
    count: Database.Statement;
    maxIdx: Database.Statement;
    all: Database.Statement;
}

// ── SqliteStorage ───────────────────────────────────────────────────────

export class SqliteStorage extends BaseStorage {
    db: Database.Database;
    private _knownTables?: Set<string>;
    private _stmtCache?: Record<string, PreparedStatements>;

    get filename(): string {
        return path.basename(this.db.name);
    }

    constructor(dbPath: string) {
        super();

        if (dbPath !== ':memory:') {
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        this.db = new Database(dbPath);

        // WAL mode for better concurrent read performance
        this.db.pragma('journal_mode = WAL');
        // Synchronous NORMAL for good balance of safety and speed
        this.db.pragma('synchronous = NORMAL');

        this._createTables();
    }

    // ── Schema ──────────────────────────────────────────────────────────

    private _createTables(): void {
        this._ensureTable('players');
        this._ensureTable('state');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS game_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day TEXT NOT NULL DEFAULT 'today',
                line TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS mail (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                to_record INTEGER NOT NULL,
                line TEXT NOT NULL,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
        `);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_mail_to ON mail(to_record)`);
        this.db.exec(`CREATE INDEX IF NOT EXISTS idx_game_log_day ON game_log(day)`);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                name TEXT PRIMARY KEY,
                content TEXT NOT NULL DEFAULT ''
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS igm_data (
                igm_name TEXT NOT NULL,
                idx INTEGER NOT NULL,
                data TEXT NOT NULL,
                PRIMARY KEY (igm_name, idx)
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS config (
                name TEXT PRIMARY KEY,
                data TEXT NOT NULL
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                email TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
        `);
        this._ensureUserColumns();
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
    }

    private _ensureUserColumns(): void {
        const columns = this.db.prepare('PRAGMA table_info(users)').all() as TableInfoRow[];
        if (!columns.some((column) => column.name === 'email')) {
            this.db.exec('ALTER TABLE users ADD COLUMN email TEXT');
        }
    }

    private _ensureTable(tableName: string): void {
        if (this._knownTables && this._knownTables.has(tableName)) return;
        if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`);
        }
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ${tableName} (
                idx INTEGER PRIMARY KEY,
                data TEXT NOT NULL
            )
        `);
        if (!this._knownTables) this._knownTables = new Set();
        this._knownTables.add(tableName);
    }

    private _getStatements(tableName: string): PreparedStatements {
        if (!this._stmtCache) this._stmtCache = {};
        if (!this._stmtCache[tableName]) {
            this._ensureTable(tableName);
            this._stmtCache[tableName] = {
                get: this.db.prepare(`SELECT data FROM ${tableName} WHERE idx = ?`),
                upsert: this.db.prepare(`INSERT OR REPLACE INTO ${tableName} (idx, data) VALUES (?, ?)`),
                count: this.db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`),
                maxIdx: this.db.prepare(`SELECT MAX(idx) as maxIdx FROM ${tableName}`),
                all: this.db.prepare(`SELECT idx, data FROM ${tableName} ORDER BY idx`),
            };
        }
        return this._stmtCache[tableName];
    }

    // ── IRecordFileFactory ──────────────────────────────────────────────

    create(name: string, fieldDefs: RecordFieldDef[]): IRecordFile {
        const tableName = path.basename(name, path.extname(name));
        return new DbRecordFile(this, tableName, fieldDefs);
    }

    // ── Generic record operations ───────────────────────────────────────

    getRecord(tableName: string, index: number): Record<string, unknown> | null {
        const stmts = this._getStatements(tableName);
        const row = stmts.get.get(index) as DataRow | undefined;
        if (!row) return null;
        return JSON.parse(row.data) as Record<string, unknown>;
    }

    putRecord(tableName: string, index: number, data: Record<string, unknown>): void {
        const stmts = this._getStatements(tableName);
        stmts.upsert.run(index, JSON.stringify(data));
    }

    countRecords(tableName: string): number {
        const stmts = this._getStatements(tableName);
        const row = stmts.count.get() as CountRow | undefined;
        return row ? row.cnt : 0;
    }

    nextIndex(tableName: string): number {
        const stmts = this._getStatements(tableName);
        const row = stmts.maxIdx.get() as MaxIdxRow | undefined;
        if (row && row.maxIdx !== null) return row.maxIdx + 1;
        return 0;
    }

    getAllRecords(tableName: string): Array<{ idx: number; data: Record<string, unknown> }> {
        const stmts = this._getStatements(tableName);
        const rows = stmts.all.all() as RecordRow[];
        return rows.map((r: RecordRow) => ({ idx: r.idx, data: JSON.parse(r.data) as Record<string, unknown> }));
    }

    // ── Game log ────────────────────────────────────────────────────────

    appendLog(day: string, line: string): void {
        this.db.prepare('INSERT INTO game_log (day, line) VALUES (?, ?)').run(day, line);
    }

    getLogLines(day: string, limit: number = 0): string[] {
        let stmt: Database.Statement;
        if (limit > 0) {
            stmt = this.db.prepare(
                'SELECT line FROM (SELECT line, id FROM game_log WHERE day = ? ORDER BY id DESC LIMIT ?) ORDER BY id'
            );
            return (stmt.all(day, limit) as LogRow[]).map((r: LogRow) => r.line);
        }
        stmt = this.db.prepare('SELECT line FROM game_log WHERE day = ? ORDER BY id');
        return (stmt.all(day) as LogRow[]).map((r: LogRow) => r.line);
    }

    getLogCount(day: string): number {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM game_log WHERE day = ?').get(day) as CountRow | undefined;
        return row ? row.cnt : 0;
    }

    rotateLogs(): void {
        this.db.prepare('DELETE FROM game_log WHERE day = ?').run('yesterday');
        this.db.prepare('UPDATE game_log SET day = ? WHERE day = ?').run('yesterday', 'today');
    }

    // ── Mail ────────────────────────────────────────────────────────────

    sendMail(toRecord: number, content: string): void {
        const lines = content.split('\n');
        const stmt = this.db.prepare('INSERT INTO mail (to_record, line) VALUES (?, ?)');
        const insertMany = this.db.transaction((lines: string[]) => {
            for (const line of lines) {
                stmt.run(toRecord, line);
            }
        });
        insertMany(lines);
    }

    getMail(toRecord: number): string[] {
        const rows = this.db.prepare('SELECT line FROM mail WHERE to_record = ? ORDER BY id').all(toRecord) as LogRow[];
        return rows.map((r: LogRow) => r.line);
    }

    hasMail(toRecord: number): boolean {
        const row = this.db.prepare('SELECT 1 FROM mail WHERE to_record = ? LIMIT 1').get(toRecord);
        return !!row;
    }

    deleteMail(toRecord: number): void {
        this.db.prepare('DELETE FROM mail WHERE to_record = ?').run(toRecord);
    }

    // ── Conversations ───────────────────────────────────────────────────

    getConversation(name: string): string {
        const row = this.db.prepare('SELECT content FROM conversations WHERE name = ?').get(name) as { content: string } | undefined;
        return row ? row.content : '';
    }

    getConversationLines(name: string): string[] {
        const content = this.getConversation(name);
        return content ? content.split('\n') : [];
    }

    setConversation(name: string, content: string): void {
        this.db.prepare('INSERT OR REPLACE INTO conversations (name, content) VALUES (?, ?)').run(name, content);
    }

    appendConversation(name: string, newLines: string[], maxLines: number = 0): void {
        const existing = this.getConversation(name);
        const all = existing ? existing.split('\n') : [];
        all.push(...newLines);
        if (maxLines > 0) {
            while (all.length > maxLines) {
                all.shift();
            }
        }
        this.setConversation(name, all.join('\n'));
    }

    hasConversation(name: string): boolean {
        return !!this.db.prepare('SELECT 1 FROM conversations WHERE name = ? LIMIT 1').get(name);
    }

    initConversation(name: string, filePath: string): void {
        if (this.hasConversation(name)) return;
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'latin1').replace(/\r\n/g, '\n').replace(/\n$/, '');
        this.setConversation(name, content);
    }

    // ── IGM data ────────────────────────────────────────────────────────

    getIgmData(igmName: string, index: number): Record<string, unknown> | null {
        const row = this.db.prepare('SELECT data FROM igm_data WHERE igm_name = ? AND idx = ?').get(igmName, index) as DataRow | undefined;
        if (!row) return null;
        return JSON.parse(row.data) as Record<string, unknown>;
    }

    setIgmData(igmName: string, index: number, data: Record<string, unknown>): void {
        this.db.prepare('INSERT OR REPLACE INTO igm_data (igm_name, idx, data) VALUES (?, ?, ?)').run(igmName, index, JSON.stringify(data));
    }

    countIgmData(igmName: string): number {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM igm_data WHERE igm_name = ?').get(igmName) as CountRow | undefined;
        return row ? row.cnt : 0;
    }

    nextIgmIndex(igmName: string): number {
        const row = this.db.prepare('SELECT MAX(idx) as maxIdx FROM igm_data WHERE igm_name = ?').get(igmName) as MaxIdxRow | undefined;
        if (row && row.maxIdx !== null) return row.maxIdx + 1;
        return 0;
    }

    getAllIgmData(igmName: string): Array<{ idx: number; data: Record<string, unknown> }> {
        const rows = this.db.prepare('SELECT idx, data FROM igm_data WHERE igm_name = ? ORDER BY idx').all(igmName) as RecordRow[];
        return rows.map((r: RecordRow) => ({ idx: r.idx, data: JSON.parse(r.data) as Record<string, unknown> }));
    }

    clearIgmData(igmName: string): void {
        this.db.prepare('DELETE FROM igm_data WHERE igm_name = ?').run(igmName);
    }

    // ── Config ──────────────────────────────────────────────────────────

    getConfig(name: string): unknown {
        const row = this.db.prepare('SELECT data FROM config WHERE name = ?').get(name) as DataRow | undefined;
        if (!row) return null;
        return JSON.parse(row.data);
    }

    setConfig(name: string, data: unknown): void {
        this.db.prepare('INSERT OR REPLACE INTO config (name, data) VALUES (?, ?)').run(name, JSON.stringify(data));
    }

    deleteConfig(name: string): void {
        this.db.prepare('DELETE FROM config WHERE name = ?').run(name);
    }

    hasConfig(name: string): boolean {
        return !!this.db.prepare('SELECT 1 FROM config WHERE name = ? LIMIT 1').get(name);
    }

    // ── Auth ────────────────────────────────────────────────────────────

    authCreateUser(username: string, passwordHash: string, salt: string, email: string | null = null): boolean {
        try {
            this.db.prepare('INSERT INTO users (username, password_hash, salt, email) VALUES (?, ?, ?, ?)').run(username, passwordHash, salt, email);
            return true;
        } catch (_e) {
            return false;
        }
    }

    authGetUser(username: string): { username: string; password_hash: string; salt: string; email: string | null } | undefined {
        return this.db.prepare('SELECT username, password_hash, salt, email FROM users WHERE username = ?').get(username) as { username: string; password_hash: string; salt: string; email: string | null } | undefined;
    }

    authUserExists(username: string): boolean {
        return !!this.db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
    }

    authUpdateUserPassword(username: string, passwordHash: string, salt: string): boolean {
        try {
            const result = this.db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?').run(passwordHash, salt, username);
            return result.changes > 0;
        } catch (_e) {
            return false;
        }
    }

    authUpdateUserEmail(username: string, email: string): boolean {
        try {
            const result = this.db.prepare('UPDATE users SET email = ? WHERE username = ?').run(email, username);
            return result.changes > 0;
        } catch (_e) {
            return false;
        }
    }

    authGetSession(token: string): { token: string; username: string; created_at: number } | undefined {
        return this.db.prepare('SELECT token, username, created_at FROM sessions WHERE token = ?').get(token) as { token: string; username: string; created_at: number } | undefined;
    }

    authInsertSession(token: string, username: string, createdAt: number): void {
        try { this.db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)').run(token, username, createdAt); } catch (_e) {}
    }

    authUpdateSession(token: string, createdAt: number): void {
        try { this.db.prepare('UPDATE sessions SET created_at = ? WHERE token = ?').run(createdAt, token); } catch (_e) {}
    }

    authDeleteSession(token: string): void {
        try { this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token); } catch (_e) {}
    }

    authGetAllSessions(): Array<{ token: string; username: string; created_at: number }> {
        try {
            return this.db.prepare('SELECT token, username, created_at FROM sessions').all() as Array<{ token: string; username: string; created_at: number }>;
        } catch (_e) {
            return [];
        }
    }

    // ── Admin / reporting ───────────────────────────────────────────────

    listAllMail(limit?: number): Array<{ id: number; to_record: number; line: string; created_at: number }> {
        const sql = limit && limit > 0
            ? 'SELECT id, to_record, line, created_at FROM mail ORDER BY id ASC LIMIT ?'
            : 'SELECT id, to_record, line, created_at FROM mail ORDER BY id ASC';
        const rows = limit && limit > 0
            ? this.db.prepare(sql).all(limit)
            : this.db.prepare(sql).all();
        return rows as Array<{ id: number; to_record: number; line: string; created_at: number }>;
    }

    listAllConversations(): Array<{ name: string; content: string }> {
        return this.db.prepare('SELECT name, content FROM conversations ORDER BY name').all() as Array<{ name: string; content: string }>;
    }

    authListUsers(): Array<{ id: number; username: string; email: string | null; created_at: number }> {
        return this.db.prepare('SELECT id, username, email, created_at FROM users ORDER BY id').all() as Array<{ id: number; username: string; email: string | null; created_at: number }>;
    }

    countAllMail(): number {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM mail').get() as CountRow | undefined;
        return row ? row.cnt : 0;
    }

    authCountUsers(): number {
        const row = this.db.prepare('SELECT COUNT(*) as cnt FROM users').get() as CountRow | undefined;
        return row ? row.cnt : 0;
    }

    private static readonly SYSTEM_TABLES = new Set([
        'players', 'state', 'game_log', 'mail', 'conversations',
        'igm_data', 'config', 'users', 'sessions',
    ]);

    listIgmTables(): Array<{ name: string; count: number }> {
        const rows = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all() as Array<{ name: string }>;

        return rows
            .filter(r => !SqliteStorage.SYSTEM_TABLES.has(r.name))
            .map(r => {
                const cnt = (this.db.prepare(`SELECT COUNT(*) as cnt FROM "${r.name}"`).get() as CountRow | undefined)?.cnt ?? 0;
                return { name: r.name, count: cnt };
            });
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    close(): void {
        this.db.close();
        this.clearTransientState();
    }
}

/** @deprecated Use SqliteStorage directly */
export const GameDatabase = SqliteStorage;

export { SqliteStorage as default };
