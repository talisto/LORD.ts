'use strict';

/**
 * IStorage - Abstract storage interface for LORD.
 *
 * Decouples the game engine, IGMs, and server components from any specific
 * storage backend.  All game code should depend on this interface rather
 * than on a concrete implementation such as GameDatabase (SQLite).
 *
 * Implementations:
 *  - GameDatabase (src/db/DB.ts)        - SQLite via better-sqlite3
 *  - (future) flat .dat files, MySQL, PostgreSQL, etc.
 *
 * Extends IRecordFileFactory so that callers can obtain IRecordFile
 * instances (for players, state, IGM data, etc.) via create().
 */

import type { IRecordData, IRecordFileFactory } from './IRecordFile';

export interface AuthStorageUser {
    username: string;
    password_hash: string;
    salt: string;
    email: string | null;
}

export interface AuthStorageSession {
    token: string;
    username: string;
    created_at: number;
}

export interface AuthStorageListUser {
    id: number;
    username: string;
    email: string | null;
    created_at: number;
}

export interface IStorage extends IRecordFileFactory {

    /**
     * Basename of the storage location, used for child-process handoff.
     * For SQLite this is the .db filename; for network backends it may be
     * a connection identifier or URL.
     */
    readonly filename: string;

    // ========== GENERIC RECORD OPERATIONS ==========
    // Used by DbRecordFile internally and by admin interfaces.

    getRecord(tableName: string, index: number): Record<string, unknown> | null;
    putRecord(tableName: string, index: number, data: Record<string, unknown>): void;
    countRecords(tableName: string): number;
    nextIndex(tableName: string): number;
    getAllRecords(tableName: string): Array<{ idx: number; data: Record<string, unknown> }>;

    // ========== GAME LOG ==========

    appendLog(day: string, line: string): void;
    getLogLines(day: string, limit?: number): string[];
    getLogCount(day: string): number;
    rotateLogs(): void;

    // ========== MAIL ==========

    sendMail(toRecord: number, content: string): void;
    getMail(toRecord: number): string[];
    hasMail(toRecord: number): boolean;
    deleteMail(toRecord: number): void;

    // ========== CONVERSATIONS ==========

    getConversation(name: string): string;
    getConversationLines(name: string): string[];
    setConversation(name: string, content: string): void;
    appendConversation(name: string, newLines: string[], maxLines?: number): void;
    initConversation(name: string, filePath: string): void;
    hasConversation(name: string): boolean;

    // ========== IGM DATA ==========

    getIgmData(igmName: string, index: number): Record<string, unknown> | null;
    setIgmData(igmName: string, index: number, data: Record<string, unknown>): void;
    countIgmData(igmName: string): number;
    nextIgmIndex(igmName: string): number;
    getAllIgmData(igmName: string): Array<{ idx: number; data: Record<string, unknown> }>;
    clearIgmData(igmName: string): void;

    // ========== CONFIG ==========

    getConfig(name: string): unknown;
    setConfig(name: string, data: unknown): void;
    deleteConfig(name: string): void;
    hasConfig(name: string): boolean;

    // ========== AUTH ==========

    authCreateUser(username: string, passwordHash: string, salt: string, email?: string | null): boolean;
    authGetUser(username: string): AuthStorageUser | undefined;
    authUserExists(username: string): boolean;
    authUpdateUserPassword(username: string, passwordHash: string, salt: string): boolean;
    authUpdateUserEmail(username: string, email: string): boolean;
    authGetSession(token: string): AuthStorageSession | undefined;
    authInsertSession(token: string, username: string, createdAt: number): void;
    authUpdateSession(token: string, createdAt: number): void;
    authDeleteSession(token: string): void;
    authGetAllSessions(): AuthStorageSession[];

    // ========== ADMIN / REPORTING ==========

    /** List all mail messages, most recent first. */
    listAllMail(limit?: number): Array<{ id: number; to_record: number; line: string; created_at: number }>;
    /** Map of player record index → player name. */
    getPlayerNames(): Map<number, string>;
    /** List all stored conversations. */
    listAllConversations(): Array<{ name: string; content: string }>;
    /** List all registered auth users. */
    authListUsers(): AuthStorageListUser[];
    /** Total mail message count across all recipients. */
    countAllMail(): number;
    /** Total registered user count. */
    authCountUsers(): number;
    /** List non-system data tables (IGM tables, etc.). */
    listIgmTables(): Array<{ name: string; count: number }>;

    // ========== MAINTENANCE ==========

    /** Clear stale on_now flags for all players (called at server startup). */
    clearStaleOnlinePlayers(): number;

    // ========== IN-MEMORY SESSION STATE ==========
    // Transient state that does NOT survive server restarts.
    // These methods mirror the original per-node file-based state (war*.bin,
    // mess*.bin, nodeon.*, etc.).  For distributed deployments, backends
    // may use Redis or a shared cache instead of in-process Maps.

    // -- Player location --
    getPlayerLocation(record: number): string[] | null;
    setPlayerLocation(record: number, lines: string[]): void;
    clearPlayerLocation(record: number): void;

    // -- Battle locks --
    getBattleLock(record: number): string | null;
    hasBattleLock(record: number): boolean;
    setBattleLock(record: number, content: string): void;
    clearBattleLock(record: number): void;

    // -- Offline PvP participant tracking --
    getOfflineBattleOpponent(record: number): number | null;
    setOfflineBattleOpponent(record: number, opponentRecord: number): void;
    clearOfflineBattleOpponent(record: number): void;

    // -- Online fight locks --
    hasFightLock(record: number): boolean;
    setFightLock(record: number, content: string): void;
    clearFightLock(record: number): void;

    // -- War messages (online battle responses) --
    getWarMessage(record: number): string | null;
    hasWarMessage(record: number): boolean;
    setWarMessage(record: number, msg: string): void;
    clearWarMessage(record: number): void;

    // -- Battle messages (taunts) --
    getBattleMessage(record: number): string | null;
    hasBattleMessage(record: number): boolean;
    setBattleMessage(record: number, msg: string): void;
    clearBattleMessage(record: number): void;

    // -- Node-to-player mapping --
    getNodePlayer(node: number): number | null;
    setNodePlayer(node: number, record: number): void;
    clearNodePlayer(node: number): void;

    // -- Quote buffers --
    getQuoteBuffer(record: number): string[];
    appendQuoteLine(record: number, line: string): void;
    clearQuoteBuffer(record: number): void;

    // ========== PLAYER RECORDS (HIGH-LEVEL) ==========
    // Higher-level record operations used by game classes.

    /**
     * Retrieve a player record by index.
     * Returns null if the index is out of range or the slot is empty.
     * The returned record has put(), unLock(), reInit(), reLoad() methods.
     */
    getPlayer(record: number, leaveLocked?: boolean): IRecordData | null;

    /**
     * Create a new player record with schema-default values.
     * Returns null if the maximum player count has been reached.
     */
    newPlayer(): IRecordData | null;

    /** Total number of player record slots (including empty/deleted). */
    getPlayerCount(): number;

    // ========== WORLD STATE (HIGH-LEVEL) ==========

    /**
     * Load the global game state record.
     * Creates the state record on first call if it does not yet exist.
     * The returned IRecordData can be modified and put() back.
     */
    getState(): IRecordData;

    // ========== FOREST GOLD ==========

    /**
     * Add gold to the shared forest gold pool.
     * Loads state, increments forest_gold, and saves.
     */
    addForestGold(amount: number): void;

    /**
     * Claim the current forest gold pool.
     * Returns the amount that was in the pool, then resets it to resetToMinimum.
     */
    claimForestGold(resetToMinimum: number): number;

    // ========== NPC MARRIAGE (SETH / VIOLET) ==========

    /**
     * Attempt to claim an NPC marriage.
     * Returns true if the claim succeeded (the NPC was unmarried).
     * Returns false if someone else is already married to that NPC.
     */
    claimNpcMarriage(npc: 'seth' | 'violet', record: number): boolean;

    /**
     * Release an NPC marriage (set to -1).
     */
    releaseNpcMarriage(npc: 'seth' | 'violet'): void;

    // ========== PLAYER MARRIAGE ==========

    /**
     * Marry two players (sets married_to on both records).
     * Returns true if successful, false if either is already married.
     */
    marry(recordA: number, recordB: number): boolean;

    /**
     * Divorce two players (clears married_to on both records).
     * Returns true if successful.
     */
    divorce(recordA: number, recordB: number): boolean;

    // ========== LATEST HERO ==========

    /** Record the name of the latest dragon slayer in the world state. */
    setLatestHero(name: string): void;

    close(): void;
}
