/**
 * BaseStorage - Abstract base class for IStorage implementations.
 *
 * Provides:
 *  - In-memory transient session state (Maps for battle locks, war messages, etc.)
 *  - Common implementations for clearStaleOnlinePlayers, getPlayerNames
 *  - DbRecordFile (IRecordFile backed by IStorage.getRecord/putRecord)
 *
 * Subclasses only need to implement the abstract storage operations
 * (record CRUD, logs, mail, conversations, IGM data, config, auth, admin).
 */

'use strict';

import type { IRecordFile, IRecordData, RecordFieldDef } from './IRecordFile';
import type { IStorage } from './IStorage';
import { Player_Def, State_Def, normalizePlayerRecordAliases } from './RecordDefs';

// ── DbRecordFile ────────────────────────────────────────────────────────
// Drop-in replacement for BinaryRecordFile, backed by an IStorage's
// generic record operations (getRecord / putRecord / countRecords / nextIndex).

interface RecordData extends IRecordData {
    [key: string]: unknown;
    Record: number;
    Yours?: boolean;
    put: (leaveLocked?: boolean) => void;
    unLock: () => void;
    reInit: (leaveLocked?: boolean) => void;
    reLoad: (leaveLocked?: boolean) => void;
}

/**
 * DbRecordFile - IRecordFile backed by an IStorage implementation.
 *
 * Fully interchangeable with BinaryRecordFile.  Every get() reads fresh
 * from the storage backend, and every put() writes immediately.
 *
 * Since the underlying IStorage provides its own concurrency guarantees
 * (e.g. SQLite's WAL mode), callers must NOT use file-level mutexes
 * when `filepath === undefined`.
 */
export class DbRecordFile implements IRecordFile {
    private storage: IStorage;
    private tableName: string;
    private recordDef: RecordFieldDef[];

    readonly filepath: undefined = undefined;

    constructor(storage: IStorage, tableName: string, recordDef: RecordFieldDef[]) {
        this.storage = storage;
        this.tableName = tableName;
        this.recordDef = recordDef;
    }

    private _makeDefaults(): Record<string, unknown> {
        const rec: Record<string, unknown> = {};
        for (const field of this.recordDef) {
            rec[field.prop] = field.def;
        }
        return rec;
    }

    close(): void {}

    get length(): number {
        return this.storage.countRecords(this.tableName);
    }

    get(index: number, _leaveLocked?: boolean): IRecordData | null {
        const rawData = this.storage.getRecord(this.tableName, index);
        if (!rawData) return null;

        if (this.tableName === 'players') {
            normalizePlayerRecordAliases(rawData);
        }

        const rec = Object.assign(this._makeDefaults(), rawData) as RecordData;
        rec.Record = index;
        rec.Yours = true;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;

        rec.put = function (this: RecordData, _leaveLocked?: boolean): void {
            const data: Record<string, unknown> = {};
            for (const field of self.recordDef) {
                const fname = field.prop;
                data[fname] = this[fname] !== undefined ? this[fname] : field.def;
            }
            self.storage.putRecord(self.tableName, this.Record, data);
        };

        rec.unLock = function (): void {};

        rec.reInit = function (this: RecordData): void {
            const defs = self._makeDefaults();
            for (const key of Object.keys(defs)) {
                this[key] = defs[key];
            }
        };

        rec.reLoad = function (this: RecordData, _leaveLocked?: boolean): void {
            const fresh = self.storage.getRecord(self.tableName, this.Record);
            if (fresh) {
                if (self.tableName === 'players') {
                    normalizePlayerRecordAliases(fresh);
                }
                for (const key of Object.keys(fresh)) {
                    this[key] = fresh[key];
                }
            }
        };

        return rec;
    }

    new(_count?: number, leaveLocked?: boolean): IRecordData | null {
        const rec = this._makeDefaults();
        const index = this.storage.nextIndex(this.tableName);
        this.storage.putRecord(this.tableName, index, rec);
        return this.get(index, leaveLocked);
    }
}

// ── BaseStorage (abstract) ──────────────────────────────────────────

export abstract class BaseStorage implements IStorage {

    // ── In-memory transient session state ───────────────────────────────
    // These Maps hold data that does NOT survive a server restart.

    private _playerLocations = new Map<number, string[]>();
    private _battleLocks = new Map<number, string>();
    private _offlineBattleOpponents = new Map<number, number>();
    private _fightLocks = new Map<number, string>();
    private _warMessages = new Map<number, string>();
    private _battleMessages = new Map<number, string>();
    private _nodeMap = new Map<number, number>();
    private _quoteBuffers = new Map<number, string[]>();

    // ── Abstract - must be implemented by subclasses ────────────────────

    abstract readonly filename: string;

    // IRecordFileFactory
    abstract create(name: string, fieldDefs: RecordFieldDef[]): IRecordFile;

    // Generic record operations
    abstract getRecord(tableName: string, index: number): Record<string, unknown> | null;
    abstract putRecord(tableName: string, index: number, data: Record<string, unknown>): void;
    abstract countRecords(tableName: string): number;
    abstract nextIndex(tableName: string): number;
    abstract getAllRecords(tableName: string): Array<{ idx: number; data: Record<string, unknown> }>;

    // Game log
    abstract appendLog(day: string, line: string): void;
    abstract getLogLines(day: string, limit?: number): string[];
    abstract getLogCount(day: string): number;
    abstract rotateLogs(): void;

    // Mail
    abstract sendMail(toRecord: number, content: string): void;
    abstract getMail(toRecord: number): string[];
    abstract hasMail(toRecord: number): boolean;
    abstract deleteMail(toRecord: number): void;

    // Conversations
    abstract getConversation(name: string): string;
    abstract getConversationLines(name: string): string[];
    abstract setConversation(name: string, content: string): void;
    abstract appendConversation(name: string, newLines: string[], maxLines?: number): void;
    abstract initConversation(name: string, filePath: string): void;
    abstract hasConversation(name: string): boolean;

    // IGM data
    abstract getIgmData(igmName: string, index: number): Record<string, unknown> | null;
    abstract setIgmData(igmName: string, index: number, data: Record<string, unknown>): void;
    abstract countIgmData(igmName: string): number;
    abstract nextIgmIndex(igmName: string): number;
    abstract getAllIgmData(igmName: string): Array<{ idx: number; data: Record<string, unknown> }>;
    abstract clearIgmData(igmName: string): void;

    // Config
    abstract getConfig(name: string): unknown;
    abstract setConfig(name: string, data: unknown): void;
    abstract deleteConfig(name: string): void;
    abstract hasConfig(name: string): boolean;

    // Auth
    abstract authCreateUser(username: string, passwordHash: string, salt: string, email?: string | null): boolean;
    abstract authGetUser(username: string): { username: string; password_hash: string; salt: string; email: string | null } | undefined;
    abstract authUserExists(username: string): boolean;
    abstract authUpdateUserPassword(username: string, passwordHash: string, salt: string): boolean;
    abstract authUpdateUserEmail(username: string, email: string): boolean;
    abstract authGetSession(token: string): { token: string; username: string; created_at: number } | undefined;
    abstract authInsertSession(token: string, username: string, createdAt: number): void;
    abstract authUpdateSession(token: string, createdAt: number): void;
    abstract authDeleteSession(token: string): void;
    abstract authGetAllSessions(): Array<{ token: string; username: string; created_at: number }>;

    // Admin / reporting
    abstract listAllMail(limit?: number): Array<{ id: number; to_record: number; line: string; created_at: number }>;
    abstract listAllConversations(): Array<{ name: string; content: string }>;
    abstract authListUsers(): Array<{ id: number; username: string; email: string | null; created_at: number }>;
    abstract countAllMail(): number;
    abstract authCountUsers(): number;
    abstract listIgmTables(): Array<{ name: string; count: number }>;

    // Lifecycle
    abstract close(): void;

    // ── Concrete - shared implementations ───────────────────────────────

    /**
     * Get player names indexed by record number.
     * Shared implementation - reads from the generic record store.
     */
    getPlayerNames(): Map<number, string> {
        const rows = this.getAllRecords('players');
        const names = new Map<number, string>();
        for (const row of rows) {
            if (typeof row.data.name === 'string') {
                names.set(row.idx, row.data.name);
            }
        }
        return names;
    }

    /**
     * Clear stale on_now flags for all players.
     * Called at server startup to clean up after unclean shutdowns.
     */
    clearStaleOnlinePlayers(): number {
        const rows = this.getAllRecords('players');
        let cleared = 0;
        for (const row of rows) {
            if (row.data.on_now) {
                row.data.on_now = false;
                row.data.last_on_unix = 0;
                this.putRecord('players', row.idx, row.data);
                cleared++;
            }
        }
        return cleared;
    }

    // ── In-memory session state (concrete) ──────────────────────────────

    getPlayerLocation(record: number): string[] | null {
        return this._playerLocations.get(record) ?? null;
    }
    setPlayerLocation(record: number, lines: string[]): void {
        this._playerLocations.set(record, lines);
    }
    clearPlayerLocation(record: number): void {
        this._playerLocations.delete(record);
    }

    getBattleLock(record: number): string | null {
        return this._battleLocks.get(record) ?? null;
    }
    hasBattleLock(record: number): boolean {
        return this._battleLocks.has(record);
    }
    setBattleLock(record: number, content: string): void {
        this._battleLocks.set(record, content);
    }
    clearBattleLock(record: number): void {
        this._battleLocks.delete(record);
    }

    getOfflineBattleOpponent(record: number): number | null {
        return this._offlineBattleOpponents.get(record) ?? null;
    }
    setOfflineBattleOpponent(record: number, opponentRecord: number): void {
        this._offlineBattleOpponents.set(record, opponentRecord);
    }
    clearOfflineBattleOpponent(record: number): void {
        this._offlineBattleOpponents.delete(record);
    }

    hasFightLock(record: number): boolean {
        return this._fightLocks.has(record);
    }
    setFightLock(record: number, content: string): void {
        this._fightLocks.set(record, content);
    }
    clearFightLock(record: number): void {
        this._fightLocks.delete(record);
    }

    getWarMessage(record: number): string | null {
        return this._warMessages.get(record) ?? null;
    }
    hasWarMessage(record: number): boolean {
        return this._warMessages.has(record);
    }
    setWarMessage(record: number, msg: string): void {
        this._warMessages.set(record, msg);
    }
    clearWarMessage(record: number): void {
        this._warMessages.delete(record);
    }

    getBattleMessage(record: number): string | null {
        return this._battleMessages.get(record) ?? null;
    }
    hasBattleMessage(record: number): boolean {
        return this._battleMessages.has(record);
    }
    setBattleMessage(record: number, msg: string): void {
        this._battleMessages.set(record, msg);
    }
    clearBattleMessage(record: number): void {
        this._battleMessages.delete(record);
    }

    getNodePlayer(node: number): number | null {
        return this._nodeMap.get(node) ?? null;
    }
    setNodePlayer(node: number, record: number): void {
        this._nodeMap.set(node, record);
    }
    clearNodePlayer(node: number): void {
        this._nodeMap.delete(node);
    }

    getQuoteBuffer(record: number): string[] {
        return this._quoteBuffers.get(record) ?? [];
    }
    appendQuoteLine(record: number, line: string): void {
        let buf = this._quoteBuffers.get(record);
        if (!buf) {
            buf = [];
            this._quoteBuffers.set(record, buf);
        }
        buf.push(line);
    }
    clearQuoteBuffer(record: number): void {
        this._quoteBuffers.delete(record);
    }

    // ── High-level player/state record operations ───────────────────────

    private _pfile: IRecordFile | null = null;
    private _statefile: IRecordFile | null = null;

    private pfile(): IRecordFile {
        if (this._pfile === null) {
            this._pfile = this.create('players', Player_Def);
        }
        return this._pfile;
    }

    private statefile(): IRecordFile {
        if (this._statefile === null) {
            this._statefile = this.create('state', State_Def);
        }
        return this._statefile;
    }

    getPlayer(record: number, leaveLocked?: boolean): IRecordData | null {
        const rec = this.pfile().get(record, leaveLocked);
        if (rec !== null) {
            rec.Yours = true;
        }
        return rec;
    }

    newPlayer(): IRecordData | null {
        const pf = this.pfile();
        return pf.new ? pf.new() : null;
    }

    getPlayerCount(): number {
        return this.pfile().length;
    }

    getState(): IRecordData {
        const sf = this.statefile();
        if (sf.length < 1) {
            const newRec = sf.new ? sf.new() : null;
            if (newRec === null) throw new Error('Failed to create state record');
            return newRec;
        }
        const rec = sf.get(0);
        if (rec === null) throw new Error('Failed to load state record');
        return rec;
    }

    addForestGold(amount: number): void {
        const rec = this.getState();
        rec.forest_gold = (rec.forest_gold as number) + amount;
        rec.put();
    }

    claimForestGold(resetToMinimum: number): number {
        const rec = this.getState();
        const found = rec.forest_gold as number;
        rec.forest_gold = resetToMinimum;
        rec.put();
        return found;
    }

    claimNpcMarriage(npc: 'seth' | 'violet', record: number): boolean {
        const rec = this.getState();
        const field = npc === 'seth' ? 'married_to_seth' : 'married_to_violet';
        if ((rec[field] as number) > -1) {
            rec.unLock();
            return false;
        }
        rec[field] = record;
        rec.put();
        return true;
    }

    releaseNpcMarriage(npc: 'seth' | 'violet'): void {
        const rec = this.getState();
        const field = npc === 'seth' ? 'married_to_seth' : 'married_to_violet';
        rec[field] = -1;
        rec.put();
    }

    marry(recordA: number, recordB: number): boolean {
        const playerA = this.getPlayer(recordA);
        const playerB = this.getPlayer(recordB);
        if (!playerA || !playerB) return false;
        if ((playerA.married_to as number) > -1 || (playerB.married_to as number) > -1) {
            playerA.unLock();
            playerB.unLock();
            return false;
        }
        playerA.married_to = recordB;
        playerA.put();
        playerB.married_to = recordA;
        playerB.put();
        return true;
    }

    divorce(recordA: number, recordB: number): boolean {
        const playerA = this.getPlayer(recordA);
        const playerB = this.getPlayer(recordB);
        if (!playerA || !playerB) {
            if (playerA) playerA.unLock();
            if (playerB) playerB.unLock();
            return false;
        }
        playerA.married_to = -1;
        playerA.put();
        playerB.married_to = -1;
        playerB.put();
        return true;
    }

    setLatestHero(name: string): void {
        const rec = this.getState();
        rec.latesthero = name;
        rec.put();
    }

    /**
     * Clear all in-memory transient state.
     * Called by subclass close() implementations.
     */
    protected clearTransientState(): void {
        this._playerLocations.clear();
        this._battleLocks.clear();
        this._offlineBattleOpponents.clear();
        this._fightLocks.clear();
        this._warMessages.clear();
        this._battleMessages.clear();
        this._nodeMap.clear();
        this._quoteBuffers.clear();
    }
}
