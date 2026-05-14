'use strict';

/**
 * SynchronetStorage - IStorage implementation for Synchronet's lordsrv.
 *
 * Game data (players, state, mail, logs, conversations, forest gold, NPC marriages,
 * player marriages, latest hero, IGM player-location) is served by lordsrv over TCP/TLS.
 *
 * Data that lordsrv does not manage (IGM record tables, config, auth) is stored
 * in a local SQLite file via SqliteStorage.
 *
 * Extends BaseStorage to inherit the in-memory transient-state Maps (battle locks,
 * fight locks, war messages, node map, quote buffers, etc.) and common helpers.
 *
 * Connection config comes from settings: remote_game (host or host:port),
 * game_user, game_pass.
 *
 * Note: Every lordsrv call blocks the Node.js event loop for the round-trip duration.
 * For production multi-session use, run each game session in its own Worker thread.
 */

import type { IRecordFile, IRecordData, RecordFieldDef } from './IRecordFile';
import { BaseStorage } from './BaseStorage';
import { SqliteStorage } from './SqliteStorage';
import { SynchronetSocket } from './SynchronetSocket';
import { Player_Def, State_Def, Server_State_Def, normalizePlayerRecordAliases } from './RecordDefs';

// ── Remote record helpers ────────────────────────────────────────────────────

type PlainRecord = Record<string, unknown>;

function makeDefaults(fieldDefs: typeof Player_Def): PlainRecord {
    const obj: PlainRecord = {};
    for (const f of fieldDefs) obj[f.prop] = f.def;
    return obj;
}

function mergeWithDefaults(json: string, fieldDefs: typeof Player_Def, index: number): PlainRecord {
    let parsed: PlainRecord = {};
    try { parsed = JSON.parse(json) as PlainRecord; } catch { /* use empty */ }
    if (fieldDefs === Player_Def) {
        normalizePlayerRecordAliases(parsed);
    }
    const rec = Object.assign(makeDefaults(fieldDefs), parsed);
    rec.Record = index;
    rec.Yours = parsed.Yours !== false;
    return rec;
}

function extractFields(rec: PlainRecord, fieldDefs: typeof Player_Def): PlainRecord {
    const out: PlainRecord = {};
    for (const f of fieldDefs) {
        out[f.prop] = rec[f.prop] !== undefined ? rec[f.prop] : f.def;
    }
    out.Record = rec.Record;
    out.Yours = rec.Yours;
    return out;
}

function makeRecordData(
    rec: PlainRecord,
    fieldDefs: typeof Player_Def,
    onPut: (data: PlainRecord) => void,
    onReload: () => PlainRecord,
): IRecordData {
    interface Rec extends IRecordData { [key: string]: unknown }
    const out = rec as Rec;
    out.put = function (_leaveLocked?: boolean) { onPut(extractFields(this, fieldDefs)); };
    out.unLock = function () { /* no-op */ };
    out.reInit = function (_leaveLocked?: boolean) {
        const defs = makeDefaults(fieldDefs);
        for (const k of Object.keys(defs)) { this[k] = defs[k]; }
    };
    out.reLoad = function (_leaveLocked?: boolean) {
        const fresh = onReload();
        for (const k of Object.keys(fresh)) {
            if (k !== 'put' && k !== 'unLock' && k !== 'reInit' && k !== 'reLoad') {
                this[k] = fresh[k];
            }
        }
    };
    return out;
}

function startOfToday(): number {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}
function startOfYesterday(): number {
    const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d.getTime();
}

// ── SynchronetStorage ────────────────────────────────────────────────────────

export class SynchronetStorage extends BaseStorage {

    readonly filename: string;
    private readonly _socket: SynchronetSocket;
    /** Local SQLite for IGM data, config, auth, and tables not managed by lordsrv. */
    private readonly _local: SqliteStorage;

    constructor(
        host: string,
        port: number,
        username: string,
        password: string,
        localDbPath = ':memory:',
    ) {
        super();
        this.filename = 'synchronet://' + host + ':' + port;
        this._socket = new SynchronetSocket(host, port, username, password);
        this._local = new SqliteStorage(localDbPath);
    }

    // ========== IRecordFileFactory ==========

    create(name: string, fieldDefs: RecordFieldDef[]): IRecordFile {
        return this._local.create(name, fieldDefs);
    }

    // ========== GENERIC RECORD OPERATIONS (local - used for IGM tables only) ==========

    getRecord(t: string, i: number): PlainRecord | null { return this._local.getRecord(t, i); }
    putRecord(t: string, i: number, d: PlainRecord): void { this._local.putRecord(t, i, d); }
    countRecords(t: string): number { return this._local.countRecords(t); }
    nextIndex(t: string): number { return this._local.nextIndex(t); }
    getAllRecords(t: string): Array<{ idx: number; data: PlainRecord }> { return this._local.getAllRecords(t); }

    // ========== GAME LOG ==========

    appendLog(day: string, line: string): void {
        if (day !== 'today') return;
        this._socket.sendData('LogEntry', line);
    }

    getLogLines(day: string, limit?: number): string[] {
        let raw: string;
        if (day === 'today') {
            raw = this._socket.send('GetLogFrom ' + startOfToday());
        } else if (day === 'yesterday') {
            raw = this._socket.send('GetLogRange ' + startOfYesterday() + ' ' + startOfToday());
        } else {
            return [];
        }
        const lines = raw ? raw.split('\n').filter((l) => l !== '') : [];
        return limit !== undefined ? lines.slice(0, limit) : lines;
    }

    getLogCount(day: string): number { return this.getLogLines(day).length; }
    rotateLogs(): void { /* lordsrv manages log rotation automatically */ }

    // ========== MAIL ==========

    sendMail(toRecord: number, content: string): void {
        this._socket.sendData('WriteMail ' + toRecord, content);
    }
    getMail(toRecord: number): string[] {
        const raw = this._socket.send('GetMail ' + toRecord);
        return raw ? raw.split(/\r?\n/) : [];
    }
    hasMail(toRecord: number): boolean { return this._socket.send('CheckMail ' + toRecord) === 'Yes'; }
    deleteMail(toRecord: number): void { this._socket.send('KillMail ' + toRecord); }

    // ========== CONVERSATIONS ==========

    getConversation(name: string): string { return this._socket.send('GetConversation ' + name); }
    getConversationLines(name: string): string[] {
        const raw = this.getConversation(name);
        return raw ? raw.split('\n').filter((l) => l !== '') : [];
    }
    setConversation(name: string, content: string): void {
        this._socket.sendData('AddToConversation ' + name, content);
    }
    appendConversation(name: string, newLines: string[], _maxLines?: number): void {
        if (newLines.length === 0) return;
        this._socket.sendData('AddToConversation ' + name, newLines.join('\r\n'));
    }
    initConversation(_name: string, _filePath: string): void { /* lordsrv manages conversation files */ }
    hasConversation(name: string): boolean {
        return ['bar', 'darkbar', 'garden', 'dirt'].includes(name);
    }

    // ========== IGM DATA (local) ==========

    getIgmData(n: string, i: number): PlainRecord | null { return this._local.getIgmData(n, i); }
    setIgmData(n: string, i: number, d: PlainRecord): void { this._local.setIgmData(n, i, d); }
    countIgmData(n: string): number { return this._local.countIgmData(n); }
    nextIgmIndex(n: string): number { return this._local.nextIgmIndex(n); }
    getAllIgmData(n: string): Array<{ idx: number; data: PlainRecord }> { return this._local.getAllIgmData(n); }
    clearIgmData(n: string): void { this._local.clearIgmData(n); }

    // ========== CONFIG (local) ==========

    getConfig(n: string): unknown { return this._local.getConfig(n); }
    setConfig(n: string, d: unknown): void { this._local.setConfig(n, d); }
    deleteConfig(n: string): void { this._local.deleteConfig(n); }
    hasConfig(n: string): boolean { return this._local.hasConfig(n); }

    // ========== AUTH (local) ==========

    authCreateUser(u: string, ph: string, s: string, e?: string | null): boolean { return this._local.authCreateUser(u, ph, s, e); }
    authGetUser(u: string) { return this._local.authGetUser(u); }
    authUserExists(u: string): boolean { return this._local.authUserExists(u); }
    authUpdateUserPassword(u: string, ph: string, s: string): boolean { return this._local.authUpdateUserPassword(u, ph, s); }
    authUpdateUserEmail(u: string, e: string): boolean { return this._local.authUpdateUserEmail(u, e); }
    authGetSession(t: string) { return this._local.authGetSession(t); }
    authInsertSession(t: string, u: string, c: number): void { this._local.authInsertSession(t, u, c); }
    authUpdateSession(t: string, c: number): void { this._local.authUpdateSession(t, c); }
    authDeleteSession(t: string): void { this._local.authDeleteSession(t); }
    authGetAllSessions() { return this._local.authGetAllSessions(); }

    // ========== ADMIN / REPORTING ==========

    listAllMail(limit?: number) { return this._local.listAllMail(limit); }

    override getPlayerNames(): Map<number, string> {
        const count = this.getPlayerCount();
        const names = new Map<number, string>();
        for (let i = 0; i < count; i++) {
            const rec = this.getPlayer(i);
            if (rec !== null && typeof rec.name === 'string') names.set(i, rec.name);
        }
        return names;
    }

    listAllConversations() { return this._local.listAllConversations(); }
    authListUsers() { return this._local.authListUsers(); }
    countAllMail(): number { return this._local.countAllMail(); }
    authCountUsers(): number { return this._local.authCountUsers(); }
    listIgmTables() { return this._local.listIgmTables(); }

    // ========== MAINTENANCE ==========

    /** lordsrv clears stale online flags on disconnect; no action needed here. */
    override clearStaleOnlinePlayers(): number { return 0; }

    // ========== PLAYER LOCATION (via lordsrv GetIGM / IGMData commands) ==========

    override getPlayerLocation(record: number): string[] | null {
        const raw = this._socket.send('GetIGM ' + record);
        if (!raw) return null;
        const parts = raw.split('\n');
        const path = parts[0] ?? '';
        if (!path) return null;
        return [path, parts[1] ?? ''];
    }
    override setPlayerLocation(_record: number, lines: string[]): void {
        // IGMData sets the current socket's player_on location (sock.LORD.player_on)
        this._socket.sendData('IGMData', (lines[0] ?? '') + '\r\n' + (lines[1] ?? ''));
    }
    override clearPlayerLocation(_record: number): void {
        this._socket.sendData('IGMData', '\r\n');
    }

    // ========== PLAYER RECORDS (HIGH-LEVEL) ==========

    override getPlayer(record: number, _leaveLocked?: boolean): IRecordData | null {
        const json = this._socket.send('GetPlayer ' + record);
        if (!json) return null;
        const raw = mergeWithDefaults(json, Player_Def, record);
        return makeRecordData(raw, Player_Def,
            (data) => { this._socket.sendData('PutPlayer ' + record, JSON.stringify(data)); },
            () => mergeWithDefaults(this._socket.send('GetPlayer ' + record), Player_Def, record),
        );
    }

    override newPlayer(): IRecordData | null {
        const json = this._socket.send('NewPlayer');
        if (!json || json.startsWith('Game') || json.startsWith('Server')) return null;
        let parsed: PlainRecord;
        try { parsed = JSON.parse(json) as PlainRecord; } catch { return null; }
        const record = typeof parsed.Record === 'number' ? parsed.Record : 0;
        const raw = mergeWithDefaults(json, Player_Def, record);
        return makeRecordData(raw, Player_Def,
            (data) => { this._socket.sendData('PutPlayer ' + record, JSON.stringify(data)); },
            () => mergeWithDefaults(this._socket.send('GetPlayer ' + record), Player_Def, record),
        );
    }

    override getPlayerCount(): number {
        const n = parseInt(this._socket.send('RecordCount'), 10);
        return isNaN(n) ? 0 : n;
    }

    // ========== WORLD STATE (HIGH-LEVEL) ==========

    override getState(): IRecordData {
        const json = this._socket.send('GetState') || '{}';
        const raw = mergeWithDefaults(json, State_Def, 0);
        for (const f of Server_State_Def) { if (raw[f.prop] === undefined) raw[f.prop] = f.def; }
        return makeRecordData(raw, State_Def,
            (_data) => { /* no generic PutState in lordsrv; use specific IStorage methods */ },
            () => mergeWithDefaults(this._socket.send('GetState') || '{}', State_Def, 0),
        );
    }

    // ========== FOREST GOLD ==========

    override addForestGold(amount: number): void { this._socket.send('AddForestGold ' + amount); }
    override claimForestGold(resetToMinimum: number): number {
        const resp = this._socket.send('GetForestGold ' + resetToMinimum);
        const match = resp.match(/^ForestGold\s+(-?\d+)/);
        if (match) return parseInt(match[1], 10);
        const n = parseInt(resp, 10);
        return isNaN(n) ? resetToMinimum : n;
    }

    // ========== NPC MARRIAGE ==========

    override claimNpcMarriage(npc: 'seth' | 'violet', record: number): boolean {
        return this._socket.send((npc === 'seth' ? 'SethMarried' : 'VioletMarried') + ' ' + record) === 'Yes';
    }
    override releaseNpcMarriage(npc: 'seth' | 'violet'): void {
        this._socket.send((npc === 'seth' ? 'SethMarried' : 'VioletMarried') + ' -1');
    }

    // ========== PLAYER MARRIAGE ==========

    override marry(a: number, b: number): boolean { return this._socket.send('Marry ' + a + ' ' + b) === 'Yes'; }
    override divorce(a: number, b: number): boolean { return this._socket.send('Divorce ' + a + ' ' + b) === 'Yes'; }

    // ========== LATEST HERO ==========

    override setLatestHero(name: string): void { this._socket.send('NewHero ' + name); }

    // ========== LIFECYCLE ==========

    close(): void {
        this._socket.close();
        this._local.close();
        this.clearTransientState();
    }
}
