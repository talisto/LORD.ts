'use strict';

/**
 * IBattleCoordinator - Session coordination and battle synchronization for LORD.
 *
 * Abstracts all active-session and real-time battle operations behind a
 * synchronous interface.  Game classes depend on this instead of raw
 * IStorage in-memory state for battle coordination.
 *
 * Implementations:
 *  - LocalBattleCoordinator  - single-instance, uses IStorage Maps
 *  - SynchronetBattleCoordinator - remote, speaks lordserv socket protocol
 */

/**
 * Result of attempting to start a PvP battle against an offline player.
 */
export type BattleStartResult =
    | { kind: 'ok' }
    | { kind: 'out'; location: string }
    | { kind: 'online' }
    | { kind: 'dead' }
    | { kind: 'in-battle'; attackerRecord: number };

export interface IBattleCoordinator {

    // ========== SESSION BINDING ==========

    /**
     * Bind the active player for this session.
     * In local mode: sets the node-player mapping.
     * In remote mode: sends SetPlayer command.
     */
    bindPlayer(record: number): void;

    /**
     * Clear the active player binding for this session.
     * In local mode: clears the node-player mapping.
     * In remote mode: sends ClearPlayer command.
     */
    clearPlayer(): void;

    // ========== LOGIN-TIME BATTLE CHECK ==========

    /**
     * Check if a player is currently being attacked (has a battle lock).
     * Returns the attacker's record number, or -1 if not in battle.
     */
    checkBattle(record: number): number;

    /**
     * Returns true when the player is one of the two participants in a
     * pending offline PvP battle.
     */
    isPlayerInOfflineBattle(record: number): boolean;

    /**
     * Returns the opponent record for a pending offline PvP battle, or -1 if
     * the player is not currently tied to one.
     */
    getOfflineBattleOpponent(record: number): number;

    // ========== PVP BATTLE INITIATION ==========

    /**
     * Attempt to start an offline PvP battle against a target player.
     *
     * Checks preconditions (target not in IGM, not online, not dead,
     * not already in battle) and sets the battle lock if OK.
     *
     * Returns a discriminated union indicating the result.
     */
    startBattle(
        attackerRecord: number,
        targetRecord: number,
        preventTargetIfAlreadyInBattle?: boolean,
    ): BattleStartResult;

    // ========== OFFLINE PVP BATTLE RESOLUTION ==========

    /**
     * Called when the attacker killed the opponent.
     *
     * Applies penalties to opponent record (lose gems, exp, gold; marked dead),
     * clears battle lock, puts record.
     */
    battleOpponentDefeated(targetRecord: number): void;

    /**
     * Called when the opponent killed the attacker.
     *
     * Awards opponent (pvp++, exp += attackerExp/2), clears battle lock,
     * puts record.
     *
     * @param targetRecord - The opponent's record number.
     * @param attackerExp  - The attacker's current exp (used to calculate
     *                       the opponent's reward: exp/2).
     */
    battleAttackerDefeated(targetRecord: number, attackerExp: number): void;

    /**
     * Called when the attacker ran away from an offline PvP fight.
     * Clears the battle lock.
     */
    battleAttackerFled(targetRecord: number): void;

    // ========== ONLINE BATTLE SIGNALING ==========

    /**
     * Wait for a battle response from the online opponent.
     *
     * @returns The response string, or null if the timeout elapsed
     *          without a response.
     */
    waitBattleResponse(): string | null;

    /**
     * Send a battle response (attack result or yell) to the opponent.
     */
    sendBattleResponse(targetRecord: number, response: string): void;

    /**
     * Abort waiting for a battle response (e.g. when refusing a duel).
     */
    abortBattleWait(): void;

    /**
     * Signal that an online battle is complete.
     * Clears fight locks and battle state.
     */
    doneOnlineBattle(): void;

    // ========== BATTLE LOCK ACCESS ==========
    // Low-level access for code that needs direct lock manipulation
    // (e.g. Player.loadPlayer login-time wait loop).

    getBattleLock(record: number): string | null;
    hasBattleLock(record: number): boolean;
    setBattleLock(record: number, content: string): void;
    clearBattleLock(record: number): void;

    // ========== FIGHT LOCK ACCESS ==========
    // Used by OnlineBattle for marking players as in active online combat.

    hasFightLock(record: number): boolean;
    setFightLock(record: number, content: string): void;
    clearFightLock(record: number): void;

    // ========== WAR MESSAGE ACCESS ==========
    // Used by OnlineBattle for battle response delivery between sessions.

    getWarMessage(record: number): string | null;
    hasWarMessage(record: number): boolean;
    setWarMessage(record: number, msg: string): void;
    clearWarMessage(record: number): void;

    // ========== BATTLE MESSAGE ACCESS ==========
    // Used by OnlineBattle for taunt delivery between sessions.

    getBattleMessage(record: number): string | null;
    hasBattleMessage(record: number): boolean;
    setBattleMessage(record: number, msg: string): void;
    clearBattleMessage(record: number): void;
}
