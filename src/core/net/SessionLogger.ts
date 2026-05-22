/**
 * SessionLogger - Structured activity logger for LORD sessions.
 *
 * Controlled entirely via environment variables:
 *
 *   DEBUG_LEVEL=none|error|info|debug
 *     none  - logging disabled (default)
 *     error - only errors and abnormal disconnects
 *     info  - session lifecycle, navigation, combat outcomes, economy
 *     debug - everything: prompts, individual attacks, event rolls
 *
 *   DEBUG_PLAYERS=*|player1,player2,...
 *     Which players to log. "*" logs all players.
 *     Comma-separated list of usernames (case-insensitive).
 *     If omitted, no players are logged regardless of DEBUG_LEVEL.
 *
 * Logs are written to: runtime/logs/<username>.log
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import type { GameEvent, GameEventListener } from '../GameEvents';
import type { GameEvents } from '../GameEvents';

export type DebugLevel = 'none' | 'error' | 'info' | 'debug';

const LEVEL_RANK: Record<DebugLevel, number> = {
    none: 0,
    error: 1,
    info: 2,
    debug: 3,
};

/** Read DEBUG_LEVEL from env, default to 'none'. */
function getDebugLevel(): DebugLevel {
    const raw = (process.env.DEBUG_LEVEL || '').toLowerCase().trim();
    if (raw === 'error' || raw === 'info' || raw === 'debug') return raw;
    return 'none';
}

/** Read DEBUG_PLAYERS from env. Returns null if unset/empty. */
function getDebugPlayers(): string | string[] | null {
    const raw = (process.env.DEBUG_PLAYERS || '').trim();
    if (!raw) return null;
    if (raw === '*') return '*';
    return raw.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
}

export class SessionLogger {
    private _stream: fs.WriteStream | null = null;
    private _listener: GameEventListener | null = null;
    private _username: string;
    private _level: DebugLevel;

    constructor(
        private _runtimeDir: string,
        username: string,
        private _events: GameEvents,
        level: DebugLevel,
    ) {
        this._username = username;
        this._level = level;
        this._init();
    }

    private _init(): void {
        const logDir = path.join(this._runtimeDir, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const logFile = path.join(logDir, this._username + '.log');
        this._stream = fs.createWriteStream(logFile, { flags: 'a' });

        this._writeRaw('--- SESSION START (level=' + this._level + ') ---');

        this._listener = (event: GameEvent) => {
            this._logEvent(event);
        };
        this._events.on(this._listener);
    }

    private _writeRaw(message: string): void {
        if (!this._stream) return;
        const ts = new Date().toISOString();
        this._stream.write(ts + ' ' + message + '\n');
    }

    /** Check if the given level should be logged at the current threshold. */
    private _shouldLog(level: DebugLevel): boolean {
        return LEVEL_RANK[level] <= LEVEL_RANK[this._level];
    }

    private _logEvent(event: GameEvent): void {
        switch (event.category) {
            case 'navigation':
                if (!this._shouldLog('info')) return;
                this._writeRaw('[NAV] ' + event.event + ' ' + event.location);
                break;
            case 'combat':
                if (event.event === 'encounter') {
                    if (!this._shouldLog('info')) return;
                    this._writeRaw('[COMBAT] encounter: ' + event.enemy.name +
                        ' (hp=' + event.enemy.hp + ' str=' + event.enemy.str + ')');
                } else if (event.event === 'player_attack' || event.event === 'enemy_attack') {
                    if (!this._shouldLog('debug')) return;
                    this._writeRaw('[COMBAT] ' + event.event + ': ' + event.attacker +
                        ' -> ' + event.defender + ' dmg=' + event.damage +
                        ' defHp=' + event.defenderHp);
                } else if (event.event === 'victory' || event.event === 'defeat' || event.event === 'flee') {
                    if (!this._shouldLog('info')) return;
                    this._writeRaw('[COMBAT] ' + event.event +
                        (event.enemy ? ' enemy=' + event.enemy : '') +
                        (event.expGained ? ' exp=' + event.expGained : '') +
                        (event.goldGained ? ' gold=' + event.goldGained : ''));
                }
                break;
            case 'prompt':
                if (!this._shouldLog('debug')) return;
                this._writeRaw('[PROMPT] ' + event.promptId +
                    (event.inputMode && event.inputMode !== 'key' ? ' mode=' + event.inputMode : '') +
                    (event.options.length > 0
                        ? ' opts=[' + event.options.map(o => o.key + ':' + o.label).join(', ') + ']'
                        : ''));
                break;
            case 'player':
                if (!this._shouldLog('info')) return;
                this._writeRaw('[PLAYER] ' + event.event +
                    (event.details ? ' ' + JSON.stringify(event.details) : ''));
                break;
            case 'economy':
                if (!this._shouldLog('info')) return;
                this._writeRaw('[ECON] ' + event.event +
                    (event.amount !== undefined ? ' amount=' + event.amount : '') +
                    (event.item ? ' item=' + event.item : '') +
                    (event.details ? ' ' + JSON.stringify(event.details) : ''));
                break;
            case 'system':
                if (!this._shouldLog('info')) return;
                this._writeRaw('[SYSTEM] ' + event.event +
                    (event.details ? ' ' + JSON.stringify(event.details) : ''));
                break;
            case 'forest':
                if (!this._shouldLog('info')) return;
                this._writeRaw('[FOREST] ' + event.event +
                    (event.details ? ' ' + JSON.stringify(event.details) : ''));
                break;
            default:
                if (!this._shouldLog('debug')) return;
                this._writeRaw('[EVENT] ' + JSON.stringify(event));
                break;
        }
    }

    /** Log an error-level message (abnormal conditions). */
    error(message: string): void {
        if (this._shouldLog('error')) this._writeRaw('[ERROR] ' + message);
    }

    /** Log an info-level message (significant actions). */
    info(message: string): void {
        if (this._shouldLog('info')) this._writeRaw('[INFO] ' + message);
    }

    /** Log a debug-level message (verbose tracing). */
    debug(message: string): void {
        if (this._shouldLog('debug')) this._writeRaw('[DEBUG] ' + message);
    }

    /** Flush and close the logger. Call on session end. */
    close(): void {
        if (this._listener) {
            this._events.off(this._listener);
            this._listener = null;
        }
        if (this._stream) {
            this._writeRaw('--- SESSION END ---');
            this._stream.end();
            this._stream = null;
        }
    }

    /**
     * Create a SessionLogger if logging is enabled for this player.
     * Returns null if DEBUG_LEVEL is 'none' or the player is not in DEBUG_PLAYERS.
     */
    static create(runtimeDir: string, username: string, events: GameEvents): SessionLogger | null {
        const level = getDebugLevel();
        if (level === 'none') return null;

        const players = getDebugPlayers();
        if (!players) return null;
        if (players !== '*') {
            if (!players.includes(username.toLowerCase())) return null;
        }

        return new SessionLogger(runtimeDir, username, events, level);
    }
}

export default SessionLogger;
