/**
 * WinnerHistory - Round winner history ledger for LORD.
 *
 * Records each game-round winner with full stats (level, experience, kills,
 * gold, etc.) for display on the leaderboard and in the admin console.
 * Also handles migration from the legacy `last_winner` config key used by
 * older versions.
 */
import { WinnerHistory_Def } from '@lordts/storage/RecordDefs';
import type { IStorage } from '@lordts/storage/IStorage';
import type { LoadedPlayerRecord } from './types';

export const WINNER_HISTORY_TABLE = 'winner_history';
export const LEGACY_LAST_WINNER_CONFIG_KEY = 'last_winner';

const WINNER_HISTORY_FIELDS = [
    'account_username',
    'name',
    'record',
    'won_at',
    'win_type',
    'win_stat',
    'win_stat_value',
    'round_days',
    'level',
    'exp',
    'drag_kills',
    'pvp_kills',
    'lays',
    'gold',
    'bank',
    'gems',
    'clss',
    'sex',
] as const;

const reportedMalformedWinnerRows = new Set<string>();

export type WinnerHistoryWinType = 'dragon' | 'tournament_time' | 'tournament_stat' | 'reset_backfill' | 'legacy_backfill';

export interface WinnerHistoryEntry {
    id: number;
    account_username: string;
    name: string;
    record: number;
    won_at: number;
    win_type: WinnerHistoryWinType;
    win_stat: string;
    win_stat_value: number;
    round_days: number;
    level: number;
    exp: number;
    drag_kills: number;
    pvp_kills: number;
    lays: number;
    gold: number;
    bank: number;
    gems: number;
    clss: number;
    sex: string;
}

export interface WinnerAccountSummary {
    account_username: string;
    wins: number;
    last_won_at: number;
    latest_name: string;
    latest_win_type: WinnerHistoryWinType;
    best_level: number;
    best_exp: number;
    player_names: string[];
}

type WinnerHistorySource = Pick<LoadedPlayerRecord,
    'Record' | 'real_name' | 'name' | 'level' | 'exp' | 'drag_kills' | 'pvp' | 'laid' | 'gold' | 'bank' | 'gem' | 'clss' | 'sex'
>;

interface RecordWinnerOptions {
    winType: WinnerHistoryWinType;
    winStat?: string;
    winStatValue?: number;
    roundDays?: number;
    wonAt?: number;
}

function ensureWinnerHistoryTable(storage: IStorage): void {
    storage.create(WINNER_HISTORY_TABLE, WinnerHistory_Def);
}

function normalizeUnixSeconds(value: number): number {
    // Timestamps above ~4 billion are milliseconds (past year 2096 in seconds)
    if (value > 4_000_000_000) {
        return Math.floor(value / 1000);
    }
    return Math.floor(value);
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function normalizeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isWinnerHistoryWinType(value: unknown): value is WinnerHistoryWinType {
    return value === 'dragon'
        || value === 'tournament_time'
        || value === 'tournament_stat'
        || value === 'reset_backfill'
        || value === 'legacy_backfill';
}

function normalizeWinType(value: unknown): WinnerHistoryWinType {
    if (isWinnerHistoryWinType(value)) {
        return value;
    }
    return 'legacy_backfill';
}

function normalizeWinStat(value: string | undefined): string {
    if (!value) {
        return '';
    }
    // Legacy tournament configs used 'pvp_kills'; canonical field name is 'pvp'
    if (value === 'pvp_kills') {
        return 'pvp';
    }
    return value;
}

function readWinStatValue(player: WinnerHistorySource, winStat: string): number {
    switch (winStat) {
        case 'exp':
            return normalizeNumber(player.exp);
        case 'drag_kills':
            return normalizeNumber(player.drag_kills);
        case 'pvp':
            return normalizeNumber(player.pvp);
        case 'level':
            return normalizeNumber(player.level);
        case 'laid':
            return normalizeNumber(player.laid);
        default:
            return 0;
    }
}

function normalizeRequiredWinnerName(value: unknown): string {
    const name = normalizeString(value);
    if (!name.trim()) {
        throw new Error('[WinnerHistory] Cannot record winner without a character name');
    }
    return name;
}

function missingWinnerFields(data: Record<string, unknown>): string[] {
    return WINNER_HISTORY_FIELDS.filter((field) => !(field in data));
}

function reportMalformedWinnerRow(id: number, reason: string, data: Record<string, unknown>): void {
    const warningKey = id + ':' + reason;
    if (reportedMalformedWinnerRows.has(warningKey)) {
        return;
    }
    reportedMalformedWinnerRows.add(warningKey);
    console.error(`[WinnerHistory] Detected malformed ${WINNER_HISTORY_TABLE} row idx=${id}: ${reason}`, data);
}

function buildWinnerEntry(id: number, player: WinnerHistorySource, options: RecordWinnerOptions): WinnerHistoryEntry {
    const winStat = normalizeWinStat(options.winStat);
    const name = normalizeRequiredWinnerName(player.name);
    const accountUsername = typeof player.real_name === 'string' && player.real_name !== '' && player.real_name !== 'X'
        ? player.real_name
        : name;
    const record = normalizeNumber(player.Record);
    if (!Number.isInteger(record) || record < 0) {
        throw new Error('[WinnerHistory] Cannot record winner without a valid player record number');
    }
    const wonAt = normalizeUnixSeconds(normalizeNumber(options.wonAt ?? Date.now()));
    if (wonAt <= 0) {
        throw new Error('[WinnerHistory] Cannot record winner without a valid win timestamp');
    }
    if (!isWinnerHistoryWinType(options.winType)) {
        throw new Error('[WinnerHistory] Cannot record winner with an invalid win type: ' + String(options.winType));
    }

    return {
        id,
        account_username: accountUsername,
        name,
        record,
        won_at: wonAt,
        win_type: options.winType,
        win_stat: winStat,
        win_stat_value: options.winStatValue === undefined ? readWinStatValue(player, winStat) : normalizeNumber(options.winStatValue),
        round_days: normalizeNumber(options.roundDays),
        level: normalizeNumber(player.level),
        exp: normalizeNumber(player.exp),
        drag_kills: normalizeNumber(player.drag_kills),
        pvp_kills: normalizeNumber(player.pvp),
        lays: normalizeNumber(player.laid),
        gold: normalizeNumber(player.gold),
        bank: normalizeNumber(player.bank),
        gems: normalizeNumber(player.gem),
        clss: normalizeNumber(player.clss),
        sex: normalizeString(player.sex) || 'M',
    };
}

function writeWinnerEntry(storage: IStorage, entry: WinnerHistoryEntry): WinnerHistoryEntry {
    ensureWinnerHistoryTable(storage);
    const id = storage.nextIndex(WINNER_HISTORY_TABLE);
    const storedEntry = {
        ...entry,
        id,
    };
    const storageData = {
        account_username: storedEntry.account_username,
        name: storedEntry.name,
        record: storedEntry.record,
        won_at: storedEntry.won_at,
        win_type: storedEntry.win_type,
        win_stat: storedEntry.win_stat,
        win_stat_value: storedEntry.win_stat_value,
        round_days: storedEntry.round_days,
        level: storedEntry.level,
        exp: storedEntry.exp,
        drag_kills: storedEntry.drag_kills,
        pvp_kills: storedEntry.pvp_kills,
        lays: storedEntry.lays,
        gold: storedEntry.gold,
        bank: storedEntry.bank,
        gems: storedEntry.gems,
        clss: storedEntry.clss,
        sex: storedEntry.sex,
    };
    const missingFields = missingWinnerFields(storageData);
    if (missingFields.length > 0) {
        throw new Error('[WinnerHistory] Refusing to write incomplete winner_history row idx=' + id + ': missing ' + missingFields.join(', '));
    }
    storage.putRecord(WINNER_HISTORY_TABLE, id, storageData);
    return storedEntry;
}

function parseWinnerEntry(id: number, data: Record<string, unknown>): WinnerHistoryEntry | null {
    const missingFields = missingWinnerFields(data);
    const name = normalizeString(data.name);
    if (!name.trim()) {
        const missingReason = missingFields.length > 0 ? '; missing fields: ' + missingFields.join(', ') : '';
        reportMalformedWinnerRow(id, 'missing required name; row skipped' + missingReason, data);
        return null;
    }

    if (missingFields.length > 0) {
        reportMalformedWinnerRow(id, 'missing fields: ' + missingFields.join(', ') + '; default values applied', data);
    }

    return {
        id,
        account_username: normalizeString(data.account_username),
        name,
        record: normalizeNumber(data.record),
        won_at: normalizeUnixSeconds(normalizeNumber(data.won_at)),
        win_type: normalizeWinType(data.win_type),
        win_stat: normalizeString(data.win_stat),
        win_stat_value: normalizeNumber(data.win_stat_value),
        round_days: normalizeNumber(data.round_days),
        level: normalizeNumber(data.level),
        exp: normalizeNumber(data.exp),
        drag_kills: normalizeNumber(data.drag_kills),
        pvp_kills: normalizeNumber(data.pvp_kills),
        lays: normalizeNumber(data.lays),
        gold: normalizeNumber(data.gold),
        bank: normalizeNumber(data.bank),
        gems: normalizeNumber(data.gems),
        clss: normalizeNumber(data.clss),
        sex: normalizeString(data.sex),
    };
}

function legacyLastWinner(storage: IStorage): WinnerHistoryEntry | null {
    const raw = storage.getConfig(LEGACY_LAST_WINNER_CONFIG_KEY) as Record<string, unknown> | null;
    if (!raw) {
        return null;
    }

    const name = normalizeString(raw.name);
    const record = normalizeNumber(raw.record);
    const wonAt = normalizeNumber(raw.won_at);
    if (!name || !Number.isFinite(record) || !Number.isFinite(wonAt)) {
        return null;
    }

    return {
        id: -1,
        account_username: '',
        name,
        record,
        won_at: normalizeUnixSeconds(wonAt),
        win_type: 'legacy_backfill',
        win_stat: '',
        win_stat_value: 0,
        round_days: 0,
        level: 0,
        exp: 0,
        drag_kills: 0,
        pvp_kills: 0,
        lays: 0,
        gold: 0,
        bank: 0,
        gems: 0,
        clss: 0,
        sex: '',
    };
}

function isSameSnapshot(left: WinnerHistoryEntry, right: WinnerHistoryEntry): boolean {
    return left.account_username === right.account_username
        && left.name === right.name
        && left.record === right.record
        && left.win_type === right.win_type
        && left.win_stat === right.win_stat
        && left.win_stat_value === right.win_stat_value
        && left.round_days === right.round_days
        && left.level === right.level
        && left.exp === right.exp
        && left.drag_kills === right.drag_kills
        && left.pvp_kills === right.pvp_kills
        && left.lays === right.lays
        && left.gold === right.gold
        && left.bank === right.bank
        && left.gems === right.gems
        && left.clss === right.clss
        && left.sex === right.sex;
}

export function listWinnerHistory(storage: IStorage, limit: number = 0): WinnerHistoryEntry[] {
    ensureWinnerHistoryTable(storage);
    const history = storage.getAllRecords(WINNER_HISTORY_TABLE)
        .map(row => parseWinnerEntry(row.idx, row.data))
        .filter((entry): entry is WinnerHistoryEntry => entry !== null)
        .sort((left, right) => {
            if (right.won_at !== left.won_at) {
                return right.won_at - left.won_at;
            }
            return right.id - left.id;
        });

    if (limit > 0) {
        return history.slice(0, limit);
    }
    return history;
}

export function getLastWinner(storage: IStorage): WinnerHistoryEntry | null {
    const history = listWinnerHistory(storage, 1);
    if (history.length > 0) {
        return history[0];
    }
    return legacyLastWinner(storage);
}

export function recordWinner(storage: IStorage, player: WinnerHistorySource, options: RecordWinnerOptions): WinnerHistoryEntry {
    return writeWinnerEntry(storage, buildWinnerEntry(-1, player, options));
}

export function backfillWinner(storage: IStorage, player: WinnerHistorySource, options: RecordWinnerOptions): WinnerHistoryEntry {
    const candidate = buildWinnerEntry(-1, player, options);
    const latest = listWinnerHistory(storage, 1)[0];
    if (latest && isSameSnapshot(latest, candidate)) {
        return latest;
    }
    return writeWinnerEntry(storage, candidate);
}

export function summarizeWinnerAccounts(storage: IStorage): WinnerAccountSummary[] {
    const history = listWinnerHistory(storage);
    const grouped = new Map<string, {
        wins: number;
        last_won_at: number;
        latest_name: string;
        latest_win_type: WinnerHistoryWinType;
        best_level: number;
        best_exp: number;
        player_names: Set<string>;
    }>();

    for (const entry of history) {
        const accountUsername = entry.account_username || entry.name;
        const existing = grouped.get(accountUsername);
        if (existing) {
            existing.wins += 1;
            if (entry.won_at > existing.last_won_at) {
                existing.last_won_at = entry.won_at;
                existing.latest_name = entry.name;
                existing.latest_win_type = entry.win_type;
            }
            existing.best_level = Math.max(existing.best_level, entry.level);
            existing.best_exp = Math.max(existing.best_exp, entry.exp);
            existing.player_names.add(entry.name);
            continue;
        }

        grouped.set(accountUsername, {
            wins: 1,
            last_won_at: entry.won_at,
            latest_name: entry.name,
            latest_win_type: entry.win_type,
            best_level: entry.level,
            best_exp: entry.exp,
            player_names: new Set([entry.name]),
        });
    }

    return Array.from(grouped.entries())
        .map(([accountUsername, summary]) => ({
            account_username: accountUsername,
            wins: summary.wins,
            last_won_at: summary.last_won_at,
            latest_name: summary.latest_name,
            latest_win_type: summary.latest_win_type,
            best_level: summary.best_level,
            best_exp: summary.best_exp,
            player_names: Array.from(summary.player_names).sort((left, right) => left.localeCompare(right)),
        }))
        .sort((left, right) => {
            if (right.wins !== left.wins) {
                return right.wins - left.wins;
            }
            if (right.last_won_at !== left.last_won_at) {
                return right.last_won_at - left.last_won_at;
            }
            return left.account_username.localeCompare(right.account_username);
        });
}