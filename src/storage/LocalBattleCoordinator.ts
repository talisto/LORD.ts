'use strict';

/**
 * LocalBattleCoordinator - Local (single-instance) implementation of IBattleCoordinator.
 *
 * Manages session binding, battle locks, and online battle signaling using
 * the in-memory Maps provided by IStorage (BaseStorage).
 *
 * Battle resolution methods (battleOpponentDefeated, battleAttackerDefeated)
 * apply the standard LORD v4.08 game rules to the opponent's record.
 */

import type { IStorage } from './IStorage';
import type { BattleStartResult, IBattleCoordinator } from './IBattleCoordinator';

export class LocalBattleCoordinator implements IBattleCoordinator {

    /** The node (connection slot) this coordinator is bound to. */
    private _node: number;

    /** The currently bound player record, or -1 if none. */
    private _boundPlayer: number = -1;

    constructor(
        private readonly _storage: IStorage,
        node: number,
    ) {
        this._node = node;
    }

    // ========== SESSION BINDING ==========

    bindPlayer(record: number): void {
        this._boundPlayer = record;
        this._storage.setNodePlayer(this._node, record);
    }

    clearPlayer(): void {
        if (this._boundPlayer >= 0) {
            this._storage.clearNodePlayer(this._node);
        }
        this._boundPlayer = -1;
    }

    // ========== LOGIN-TIME BATTLE CHECK ==========

    checkBattle(record: number): number {
        const lock = this._storage.getBattleLock(record);
        if (lock !== null) {
            // The lock content is "attackerRecord\n"
            const attackerRecord = parseInt(lock.trim(), 10);
            return isNaN(attackerRecord) ? -1 : attackerRecord;
        }
        return -1;
    }

    isPlayerInOfflineBattle(record: number): boolean {
        return this._storage.getOfflineBattleOpponent(record) !== null;
    }

    getOfflineBattleOpponent(record: number): number {
        return this._storage.getOfflineBattleOpponent(record) ?? -1;
    }

    private setOfflineBattlePair(recordA: number, recordB: number): void {
        this._storage.setOfflineBattleOpponent(recordA, recordB);
        this._storage.setOfflineBattleOpponent(recordB, recordA);
    }

    private clearOfflineBattlePair(record: number): void {
        const opponentRecord = this._storage.getOfflineBattleOpponent(record);
        this._storage.clearOfflineBattleOpponent(record);
        if (opponentRecord !== null) {
            this._storage.clearOfflineBattleOpponent(opponentRecord);
        }
    }

    // ========== PVP BATTLE INITIATION ==========

    startBattle(
        attackerRecord: number,
        targetRecord: number,
        preventTargetIfAlreadyInBattle: boolean = false,
    ): BattleStartResult {
        if (preventTargetIfAlreadyInBattle) {
            const existingAttackerRecord = this.checkBattle(targetRecord);
            if (existingAttackerRecord >= 0) {
                return { kind: 'in-battle', attackerRecord: existingAttackerRecord };
            }
        }

        // Check if target is in an IGM
        const location = this._storage.getPlayerLocation(targetRecord);
        if (location && location[0]) {
            return { kind: 'out', location: location[0] };
        }

        // Set battle lock before checking online status
        this._storage.setBattleLock(targetRecord, attackerRecord + '\n');

        // Check if target is online
        const target = this._storage.getPlayer(targetRecord);
        if (target && target.on_now) {
            this._storage.clearBattleLock(targetRecord);
            return { kind: 'online' };
        }

        // Check if target is dead
        if (target && target.dead) {
            this._storage.clearBattleLock(targetRecord);
            return { kind: 'dead' };
        }

        this.setOfflineBattlePair(attackerRecord, targetRecord);

        return { kind: 'ok' };
    }

    // ========== OFFLINE PVP BATTLE RESOLUTION ==========

    battleOpponentDefeated(targetRecord: number): void {
        const target = this._storage.getPlayer(targetRecord);
        if (target) {
            target.gem = (target.gem as number) - Math.floor((target.gem as number) / 2);
            target.exp = (target.exp as number) - Math.floor((target.exp as number) / 10);
            target.gold = 0;
            target.dead = true;
            target.inn = false;
            target.put();
        }
        this.clearBattleLock(targetRecord);
    }

    battleAttackerDefeated(targetRecord: number, attackerExp: number): void {
        const target = this._storage.getPlayer(targetRecord);
        if (target) {
            target.pvp = Math.min((target.pvp as number) + 1, 32000);
            target.exp = Math.min(
                (target.exp as number) + Math.floor(attackerExp / 2),
                2000000000,
            );
            target.put();
        }
        this.clearBattleLock(targetRecord);
    }

    battleAttackerFled(targetRecord: number): void {
        this.clearBattleLock(targetRecord);
    }

    // ========== ONLINE BATTLE SIGNALING ==========

    waitBattleResponse(): string | null {
        if (this._boundPlayer < 0) return null;
        if (this._storage.hasWarMessage(this._boundPlayer)) {
            const msg = this._storage.getWarMessage(this._boundPlayer);
            this._storage.clearWarMessage(this._boundPlayer);
            return msg;
        }
        return null;
    }

    sendBattleResponse(targetRecord: number, response: string): void {
        this._storage.setWarMessage(targetRecord, response);
    }

    abortBattleWait(): void {
        // Send "R" (refuse) to whoever was waiting for a response from us.
        // In the local coordinator there is no direct "opponent" to notify.
        // The caller handles this by directly setting the war message.
    }

    doneOnlineBattle(): void {
        if (this._boundPlayer >= 0) {
            this._storage.clearFightLock(this._boundPlayer);
        }
    }

    // ========== BATTLE LOCK ACCESS ==========

    getBattleLock(record: number): string | null {
        return this._storage.getBattleLock(record);
    }

    hasBattleLock(record: number): boolean {
        return this._storage.hasBattleLock(record);
    }

    setBattleLock(record: number, content: string): void {
        this._storage.setBattleLock(record, content);
    }

    clearBattleLock(record: number): void {
        this.clearOfflineBattlePair(record);
        this._storage.clearBattleLock(record);
    }

    // ========== FIGHT LOCK ACCESS ==========

    hasFightLock(record: number): boolean {
        return this._storage.hasFightLock(record);
    }

    setFightLock(record: number, content: string): void {
        this._storage.setFightLock(record, content);
    }

    clearFightLock(record: number): void {
        this._storage.clearFightLock(record);
    }

    // ========== WAR MESSAGE ACCESS ==========

    getWarMessage(record: number): string | null {
        return this._storage.getWarMessage(record);
    }

    hasWarMessage(record: number): boolean {
        return this._storage.hasWarMessage(record);
    }

    setWarMessage(record: number, msg: string): void {
        this._storage.setWarMessage(record, msg);
    }

    clearWarMessage(record: number): void {
        this._storage.clearWarMessage(record);
    }

    // ========== BATTLE MESSAGE ACCESS ==========

    getBattleMessage(record: number): string | null {
        return this._storage.getBattleMessage(record);
    }

    hasBattleMessage(record: number): boolean {
        return this._storage.hasBattleMessage(record);
    }

    setBattleMessage(record: number, msg: string): void {
        this._storage.setBattleMessage(record, msg);
    }

    clearBattleMessage(record: number): void {
        this._storage.clearBattleMessage(record);
    }
}
