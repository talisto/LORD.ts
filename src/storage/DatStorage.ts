/**
 * DatStorage - Flat-file IStorage implementation for LORD.
 *
 * Stores game data using the original DOS LORD file formats where possible:
 *
 *   Records    → BinaryRecordFile .dat files (players.dat, state.dat, etc.)
 *   Game log   → LOGNOW.TXT / LOGOLD.TXT (line-per-entry text files)
 *   Mail       → mail/index.json (JSON index of all messages)
 *   Convos     → convos/<name>.txt (one text file per conversation)
 *   IGM data   → igm_data/<igm_name>.json (JSON per IGM)
 *   Config     → config/<name>.json (JSON per config key)
 *   Auth       → auth/users.json + auth/sessions.json
 *
 * Extends BaseStorage which provides in-memory transient session state
 * (battle locks, war messages, etc.) and shared utility methods.
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import { BinaryRecordFile } from './BinaryRecordFile';
import type { IRecordFile, RecordFieldDef } from './IRecordFile';
import { BaseStorage } from './BaseStorage';

// ── Helpers ─────────────────────────────────────────────────────────────

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readTextFile(filepath: string): string {
    if (!fs.existsSync(filepath)) return '';
    return fs.readFileSync(filepath, 'utf8');
}

function writeTextFile(filepath: string, content: string): void {
    ensureDir(path.dirname(filepath));
    fs.writeFileSync(filepath, content, 'utf8');
}

function readJsonFile<T>(filepath: string): T | null {
    if (!fs.existsSync(filepath)) return null;
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw) as T;
}

function writeJsonFile(filepath: string, data: unknown): void {
    ensureDir(path.dirname(filepath));
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Types ───────────────────────────────────────────────────────────────

interface UserRecord {
    username: string;
    password_hash: string;
    salt: string;
    email?: string | null;
    created_at: number;
}

interface SessionRecord {
    token: string;
    username: string;
    created_at: number;
}

interface MailMessage {
    id: number;
    to_record: number;
    line: string;
    created_at: number;
}

// ── DatStorage ──────────────────────────────────────────────────────────

export class DatStorage extends BaseStorage {
    private _runtimeDir: string;

    // Registry of record "tables" → BinaryRecordFile instances + field defs
    private _recordFiles = new Map<string, { file: BinaryRecordFile; fieldDefs: RecordFieldDef[] }>();

    // Mail auto-increment counter
    private _nextMailId = 1;

    /**
     * @param runtimeDir - absolute path to the runtime directory
     *                      (e.g. '/path/to/lord-ts/runtime')
     */
    constructor(runtimeDir: string) {
        super();
        this._runtimeDir = runtimeDir;
        ensureDir(runtimeDir);
        this._initMailCounter();
    }

    // ── IRecordFileFactory ──────────────────────────────────────────────

    get filename(): string {
        return path.basename(this._runtimeDir);
    }

    create(name: string, fieldDefs: RecordFieldDef[]): IRecordFile {
        const tableName = path.basename(name, path.extname(name));
        const existing = this._recordFiles.get(tableName);
        if (existing) return existing.file;

        let filepath: string;
        if (name.includes(path.sep) || name.includes('/')) {
            filepath = name.endsWith('.dat') ? name : name + '.dat';
        } else {
            filepath = path.join(this._runtimeDir, tableName + '.dat');
        }

        const file = new BinaryRecordFile(filepath, fieldDefs);
        this._recordFiles.set(tableName, { file, fieldDefs });
        return file;
    }

    // ── Generic Record Operations ───────────────────────────────────────

    getRecord(tableName: string, index: number): Record<string, unknown> | null {
        const entry = this._recordFiles.get(tableName);
        if (!entry) return null;
        const record = entry.file.get(index);
        if (!record) return null;
        const data: Record<string, unknown> = {};
        for (const field of entry.fieldDefs) {
            data[field.prop] = (record as Record<string, unknown>)[field.prop];
        }
        return data;
    }

    putRecord(tableName: string, index: number, data: Record<string, unknown>): void {
        const entry = this._recordFiles.get(tableName);
        if (!entry) return;
        let record = entry.file.get(index);
        if (!record) {
            while (entry.file.length <= index) {
                entry.file.new();
            }
            record = entry.file.get(index);
            if (!record) return;
        }
        for (const key of Object.keys(data)) {
            (record as Record<string, unknown>)[key] = data[key];
        }
        record.put();
    }

    countRecords(tableName: string): number {
        const entry = this._recordFiles.get(tableName);
        if (!entry) return 0;
        return entry.file.length;
    }

    nextIndex(tableName: string): number {
        const entry = this._recordFiles.get(tableName);
        if (!entry) return 0;
        return entry.file.length;
    }

    getAllRecords(tableName: string): Array<{ idx: number; data: Record<string, unknown> }> {
        const entry = this._recordFiles.get(tableName);
        if (!entry) return [];
        const results: Array<{ idx: number; data: Record<string, unknown> }> = [];
        for (let i = 0; i < entry.file.length; i++) {
            const record = entry.file.get(i);
            if (record) {
                const data: Record<string, unknown> = {};
                for (const field of entry.fieldDefs) {
                    data[field.prop] = (record as Record<string, unknown>)[field.prop];
                }
                results.push({ idx: i, data });
            }
        }
        return results;
    }

    // ── Game Log ────────────────────────────────────────────────────────

    private _logPath(day: string): string {
        const filename = day === 'today' ? 'LOGNOW.TXT' : 'LOGOLD.TXT';
        return path.join(this._runtimeDir, filename);
    }

    appendLog(day: string, line: string): void {
        const filepath = this._logPath(day);
        ensureDir(path.dirname(filepath));
        fs.appendFileSync(filepath, line + '\n', 'utf8');
    }

    getLogLines(day: string, limit: number = 0): string[] {
        const content = readTextFile(this._logPath(day));
        if (!content) return [];
        const lines = content.split('\n').filter(l => l.length > 0);
        if (limit > 0) {
            return lines.slice(-limit);
        }
        return lines;
    }

    getLogCount(day: string): number {
        const content = readTextFile(this._logPath(day));
        if (!content) return 0;
        return content.split('\n').filter(l => l.length > 0).length;
    }

    rotateLogs(): void {
        const todayPath = this._logPath('today');
        const yesterdayPath = this._logPath('yesterday');
        if (fs.existsSync(yesterdayPath)) {
            fs.unlinkSync(yesterdayPath);
        }
        if (fs.existsSync(todayPath)) {
            fs.renameSync(todayPath, yesterdayPath);
        }
    }

    // ── Mail ────────────────────────────────────────────────────────────

    private _mailDir(): string {
        return path.join(this._runtimeDir, 'mail');
    }

    private _mailIndexPath(): string {
        return path.join(this._mailDir(), 'index.json');
    }

    private _readMailIndex(): MailMessage[] {
        return readJsonFile<MailMessage[]>(this._mailIndexPath()) ?? [];
    }

    private _writeMailIndex(messages: MailMessage[]): void {
        writeJsonFile(this._mailIndexPath(), messages);
    }

    private _initMailCounter(): void {
        const messages = this._readMailIndex();
        if (messages.length > 0) {
            this._nextMailId = Math.max(...messages.map(m => m.id)) + 1;
        }
    }

    sendMail(toRecord: number, content: string): void {
        const messages = this._readMailIndex();
        const lines = content.split('\n');
        const now = Math.floor(Date.now() / 1000);
        for (const line of lines) {
            messages.push({
                id: this._nextMailId++,
                to_record: toRecord,
                line,
                created_at: now,
            });
        }
        this._writeMailIndex(messages);
    }

    getMail(toRecord: number): string[] {
        const messages = this._readMailIndex();
        return messages
            .filter(m => m.to_record === toRecord)
            .sort((a, b) => a.id - b.id)
            .map(m => m.line);
    }

    hasMail(toRecord: number): boolean {
        const messages = this._readMailIndex();
        return messages.some(m => m.to_record === toRecord);
    }

    deleteMail(toRecord: number): void {
        const messages = this._readMailIndex();
        const remaining = messages.filter(m => m.to_record !== toRecord);
        this._writeMailIndex(remaining);
    }

    // ── Conversations ───────────────────────────────────────────────────

    private _convoPath(name: string): string {
        return path.join(this._runtimeDir, 'convos', name + '.txt');
    }

    getConversation(name: string): string {
        return readTextFile(this._convoPath(name));
    }

    getConversationLines(name: string): string[] {
        const content = this.getConversation(name);
        if (!content) return [];
        return content.split('\n');
    }

    setConversation(name: string, content: string): void {
        writeTextFile(this._convoPath(name), content);
    }

    appendConversation(name: string, newLines: string[], maxLines: number = 0): void {
        const existing = this.getConversation(name);
        const lines = existing ? existing.split('\n') : [];
        lines.push(...newLines);
        if (maxLines > 0) {
            while (lines.length > maxLines) {
                lines.shift();
            }
        }
        this.setConversation(name, lines.join('\n'));
    }

    initConversation(name: string, filePath: string): void {
        if (this.hasConversation(name)) return;
        if (!fs.existsSync(filePath)) return;
        let content = fs.readFileSync(filePath, 'latin1');
        content = content.replace(/\r\n/g, '\n');
        if (content.endsWith('\n')) {
            content = content.slice(0, -1);
        }
        this.setConversation(name, content);
    }

    hasConversation(name: string): boolean {
        return fs.existsSync(this._convoPath(name));
    }

    // ── IGM Data ────────────────────────────────────────────────────────

    private _igmDataPath(igmName: string): string {
        return path.join(this._runtimeDir, 'igm_data', igmName + '.json');
    }

    private _readIgmStore(igmName: string): Record<string, Record<string, unknown>> {
        return readJsonFile<Record<string, Record<string, unknown>>>(this._igmDataPath(igmName)) ?? {};
    }

    private _writeIgmStore(igmName: string, store: Record<string, Record<string, unknown>>): void {
        writeJsonFile(this._igmDataPath(igmName), store);
    }

    getIgmData(igmName: string, index: number): Record<string, unknown> | null {
        const store = this._readIgmStore(igmName);
        return store[String(index)] ?? null;
    }

    setIgmData(igmName: string, index: number, data: Record<string, unknown>): void {
        const store = this._readIgmStore(igmName);
        store[String(index)] = data;
        this._writeIgmStore(igmName, store);
    }

    countIgmData(igmName: string): number {
        const store = this._readIgmStore(igmName);
        return Object.keys(store).length;
    }

    nextIgmIndex(igmName: string): number {
        const store = this._readIgmStore(igmName);
        const keys = Object.keys(store).map(Number).filter(n => !isNaN(n));
        if (keys.length === 0) return 0;
        return Math.max(...keys) + 1;
    }

    getAllIgmData(igmName: string): Array<{ idx: number; data: Record<string, unknown> }> {
        const store = this._readIgmStore(igmName);
        return Object.entries(store)
            .map(([key, data]) => ({ idx: Number(key), data }))
            .sort((a, b) => a.idx - b.idx);
    }

    clearIgmData(igmName: string): void {
        const filepath = this._igmDataPath(igmName);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    }

    // ── Config ──────────────────────────────────────────────────────────

    private _configPath(name: string): string {
        return path.join(this._runtimeDir, 'config', name + '.json');
    }

    getConfig(name: string): unknown {
        return readJsonFile(this._configPath(name));
    }

    setConfig(name: string, data: unknown): void {
        writeJsonFile(this._configPath(name), data);
    }

    deleteConfig(name: string): void {
        const filepath = this._configPath(name);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    }

    hasConfig(name: string): boolean {
        return fs.existsSync(this._configPath(name));
    }

    // ── Auth ────────────────────────────────────────────────────────────

    private _authDir(): string {
        return path.join(this._runtimeDir, 'auth');
    }

    private _usersPath(): string {
        return path.join(this._authDir(), 'users.json');
    }

    private _sessionsPath(): string {
        return path.join(this._authDir(), 'sessions.json');
    }

    private _readUsers(): UserRecord[] {
        return readJsonFile<UserRecord[]>(this._usersPath()) ?? [];
    }

    private _writeUsers(users: UserRecord[]): void {
        writeJsonFile(this._usersPath(), users);
    }

    private _readSessions(): SessionRecord[] {
        return readJsonFile<SessionRecord[]>(this._sessionsPath()) ?? [];
    }

    private _writeSessions(sessions: SessionRecord[]): void {
        writeJsonFile(this._sessionsPath(), sessions);
    }

    authCreateUser(username: string, passwordHash: string, salt: string, email: string | null = null): boolean {
        const users = this._readUsers();
        if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            return false;
        }
        users.push({
            username,
            password_hash: passwordHash,
            salt,
            email,
            created_at: Math.floor(Date.now() / 1000),
        });
        this._writeUsers(users);
        return true;
    }

    authGetUser(username: string): { username: string; password_hash: string; salt: string; email: string | null } | undefined {
        const users = this._readUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return undefined;
        return { username: user.username, password_hash: user.password_hash, salt: user.salt, email: user.email ?? null };
    }

    authUserExists(username: string): boolean {
        const users = this._readUsers();
        return users.some(u => u.username.toLowerCase() === username.toLowerCase());
    }

    authUpdateUserPassword(username: string, passwordHash: string, salt: string): boolean {
        const users = this._readUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return false;
        user.password_hash = passwordHash;
        user.salt = salt;
        this._writeUsers(users);
        return true;
    }

    authUpdateUserEmail(username: string, email: string): boolean {
        const users = this._readUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (!user) return false;
        user.email = email;
        this._writeUsers(users);
        return true;
    }

    authGetSession(token: string): { token: string; username: string; created_at: number } | undefined {
        const sessions = this._readSessions();
        return sessions.find(s => s.token === token);
    }

    authInsertSession(token: string, username: string, createdAt: number): void {
        try {
            const sessions = this._readSessions();
            sessions.push({ token, username, created_at: createdAt });
            this._writeSessions(sessions);
        } catch (_e) { /* silently ignore */ }
    }

    authUpdateSession(token: string, createdAt: number): void {
        try {
            const sessions = this._readSessions();
            const session = sessions.find(s => s.token === token);
            if (session) {
                session.created_at = createdAt;
                this._writeSessions(sessions);
            }
        } catch (_e) { /* silently ignore */ }
    }

    authDeleteSession(token: string): void {
        try {
            const sessions = this._readSessions();
            const remaining = sessions.filter(s => s.token !== token);
            this._writeSessions(remaining);
        } catch (_e) { /* silently ignore */ }
    }

    authGetAllSessions(): Array<{ token: string; username: string; created_at: number }> {
        try {
            return this._readSessions();
        } catch (_e) {
            return [];
        }
    }

    // ── Admin / Reporting ───────────────────────────────────────────────

    listAllMail(limit?: number): Array<{ id: number; to_record: number; line: string; created_at: number }> {
        const messages = this._readMailIndex();
        messages.sort((a, b) => a.id - b.id);
        if (limit && limit > 0) {
            return messages.slice(0, limit);
        }
        return messages;
    }

    listAllConversations(): Array<{ name: string; content: string }> {
        const convoDir = path.join(this._runtimeDir, 'convos');
        if (!fs.existsSync(convoDir)) return [];
        const files = fs.readdirSync(convoDir).filter(f => f.endsWith('.txt')).sort();
        return files.map(f => ({
            name: path.basename(f, '.txt'),
            content: readTextFile(path.join(convoDir, f)),
        }));
    }

    authListUsers(): Array<{ id: number; username: string; email: string | null; created_at: number }> {
        const users = this._readUsers();
        return users.map((u, i) => ({
            id: i + 1,
            username: u.username,
            email: u.email ?? null,
            created_at: u.created_at,
        }));
    }

    countAllMail(): number {
        return this._readMailIndex().length;
    }

    authCountUsers(): number {
        return this._readUsers().length;
    }

    listIgmTables(): Array<{ name: string; count: number }> {
        const igmDir = path.join(this._runtimeDir, 'igm_data');
        if (!fs.existsSync(igmDir)) return [];
        const files = fs.readdirSync(igmDir).filter(f => f.endsWith('.json')).sort();
        return files.map(f => {
            const name = path.basename(f, '.json');
            return { name, count: this.countIgmData(name) };
        });
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    close(): void {
        this._recordFiles.clear();
        this.clearTransientState();
    }
}

/** @deprecated Use DatStorage directly */
export const GameFilesystem = DatStorage;
