'use strict';

/**
 * SynchronetBattleCoordinator - IBattleCoordinator implementation for Synchronet's lordsrv.
 *
 * Connects to lordsrv over TCP/TLS and maps IBattleCoordinator operations to
 * the lordsrv protocol. Uses a dedicated SynchronetSocket for its own connection
 * (separate from SynchronetStorage) because lordsrv tracks per-connection state
 * such as player_on and in_battle.
 *
 * Battle/fight locks and battle messages are kept in local in-memory Maps;
 * lordsrv manages battle state globally via BattleStart / LostBattle / WonBattle.
 *
 * Online battle signaling: hasWarMessage() sends a blocking WaitBattleResponse
 * command to lordsrv and caches the result. The event loop pauses during the
 * wait; this is a known limitation of the first release.
 */

import type { BattleStartResult, IBattleCoordinator } from './IBattleCoordinator';
import { SynchronetSocket } from './SynchronetSocket';

export class SynchronetBattleCoordinator implements IBattleCoordinator {

    private readonly _socket: SynchronetSocket;
    private readonly _node: number;
    private _boundPlayer: number = -1;

    // Cached battle response from WaitBattleResponse
    private _pendingWarMessage: string | null = null;

    // In-memory session state (local only - not shared across nodes)
    private readonly _battleLocks = new Map<number, string>();
    private readonly _fightLocks = new Map<number, string>();
    private readonly _battleMessages = new Map<number, string>();

    constructor(
        host: string,
        port: number,
        username: string,
        password: string,
        node: number,
    ) {
        this._node = node;
        this._socket = new SynchronetSocket(host, port, username, password);
    }

    // ========== SESSION BINDING ==========

    bindPlayer(record: number): void {
        this._boundPlayer = record;
        this._socket.send('SetPlayer ' + record);
    }

    clearPlayer(): void {
        if (this._boundPlayer >= 0) {
            this._socket.send('ClearPlayer');
        }
        this._boundPlayer = -1;
    }

    // ========== LOGIN-TIME BATTLE CHECK ==========

    /**
     * Query lordsrv for the attacker record of a player currently being attacked.
     * Returns the attacker's record number, or -1 if no active battle.
     */
    checkBattle(record: number): number {
        const resp = this._socket.send('CheckBattle ' + record);
        if (resp === 'No' || !resp) return -1;
        const n = parseInt(resp, 10);
        return isNaN(n) ? -1 : n;
    }

    isPlayerInOfflineBattle(_record: number): boolean {
        return false;
    }

    getOfflineBattleOpponent(_record: number): number {
        return -1;
    }

    // ========== PVP BATTLE INITIATION ==========

    startBattle(
        _attackerRecord: number,
        targetRecord: number,
        _preventTargetIfAlreadyInBattle: boolean = false,
    ): BattleStartResult {
        const resp = this._socket.send('BattleStart ' + targetRecord);
        if (resp === 'Dead') return { kind: 'dead' };
        if (resp === 'Online') return { kind: 'online' };
        if (resp.startsWith('Out: ')) return { kind: 'out', location: resp.slice(5) };
        if (resp.startsWith('InBattle ')) {
            const n = parseInt(resp.slice(9), 10);
            return { kind: 'in-battle', attackerRecord: isNaN(n) ? -1 : n };
        }
        // 'OK' or any other success response
        return { kind: 'ok' };
    }

    // ========== OFFLINE PVP BATTLE RESOLUTION ==========

    battleOpponentDefeated(targetRecord: number): void {
        this._socket.send('LostBattle ' + targetRecord);
    }

    battleAttackerDefeated(targetRecord: number, _attackerExp: number): void {
        // lordsrv's WonBattle uses the server-side stored exp for the reward
        this._socket.send('WonBattle ' + targetRecord);
    }

    battleAttackerFled(targetRecord: number): void {
        this._socket.send('RanFromBattle ' + targetRecord);
    }

    // ========== ONLINE BATTLE SIGNALING ==========

    /**
     * Wait for the opponent's battle response from lordsrv.
     * Returns cached result if available; otherwise blocks on WaitBattleResponse
     * (lordsrv returns immediately if a response is queued, or parks the socket
     * until the opponent calls SendBattleResponse).
     */
    waitBattleResponse(): string | null {
        if (this._pendingWarMessage !== null) {
            const msg = this._pendingWarMessage;
            this._pendingWarMessage = null;
            return msg;
        }
        const resp = this._socket.send('WaitBattleResponse');
        return resp || null;
    }

    sendBattleResponse(targetRecord: number, response: string): void {
        void targetRecord; // lordsrv uses the socket's player_on to route the response
        this._socket.send('SendBattleResponse ' + response);
    }

    abortBattleWait(): void {
        this._socket.send('AbortBattleWait');
    }

    doneOnlineBattle(): void {
        this._socket.send('DoneOnlineBattle');
        this._pendingWarMessage = null;
        if (this._boundPlayer >= 0) this._fightLocks.delete(this._boundPlayer);
    }

    // ========== BATTLE LOCK ACCESS ==========
    // Battle locks in lordsrv are tracked via in_battle; checkBattle queries that.
    // setBattleLock/clearBattleLock are local (used by Player.ts login-time wait loop).

    getBattleLock(record: number): string | null {
        return this._battleLocks.get(record) ?? null;
    }
    hasBattleLock(record: number): boolean {
        // Check lordsrv for the authoritative battle state
        return this.checkBattle(record) >= 0 || this._battleLocks.has(record);
    }
    setBattleLock(record: number, content: string): void {
        this._battleLocks.set(record, content);
    }
    clearBattleLock(record: number): void {
        this._battleLocks.delete(record);
    }

    // ========== FIGHT LOCK ACCESS ==========

    hasFightLock(record: number): boolean { return this._fightLocks.has(record); }
    setFightLock(record: number, content: string): void { this._fightLocks.set(record, content); }
    clearFightLock(record: number): void { this._fightLocks.delete(record); }

    // ========== WAR MESSAGE ACCESS ==========

    getWarMessage(_record: number): string | null {
        return this._pendingWarMessage;
    }

    /**
     * Check (and wait for) a war message from lordsrv.
     *
     * On first call: sends WaitBattleResponse, caches the response, returns true.
     * lordsrv returns immediately if a response is already queued, otherwise it
     * blocks until the opponent calls SendBattleResponse (this pauses the event
     * loop for the wait duration).
     * On subsequent calls before clearWarMessage: returns true from cache.
     */
    hasWarMessage(_record: number): boolean {
        if (this._pendingWarMessage !== null) return true;
        const resp = this._socket.send('WaitBattleResponse');
        if (resp) {
            this._pendingWarMessage = resp;
            return true;
        }
        return false;
    }

    setWarMessage(_record: number, msg: string): void {
        // Used by local callers; not forwarded to lordsrv
        this._pendingWarMessage = msg;
    }

    clearWarMessage(_record: number): void {
        this._pendingWarMessage = null;
    }

    // ========== BATTLE MESSAGE ACCESS ==========
    // Taunts are local only (lordsrv has no separate taunt protocol).

    getBattleMessage(record: number): string | null { return this._battleMessages.get(record) ?? null; }
    hasBattleMessage(record: number): boolean { return this._battleMessages.has(record); }
    setBattleMessage(record: number, msg: string): void { this._battleMessages.set(record, msg); }
    clearBattleMessage(record: number): void { this._battleMessages.delete(record); }

    close(): void {
        this._socket.close();
    }
}
