/**
 * DoorTimekeeper - BBS session time limit enforcement.
 *
 * Tracks remaining time from the BBS drop file and provides:
 *   - Countdown tracking
 *   - Configurable warning callbacks at specified intervals
 *   - Expiry callback when time runs out
 *   - Time remaining queries for the game
 *
 * The keeper does NOT run a background timer - it is polled by DoorSession
 * on each I/O operation (getkey, waitkey) to check elapsed time. This avoids
 * background timers that might conflict with the game's own event loop.
 */

'use strict';

/**
 * Callback invoked when a time warning threshold is crossed.
 * @param minutesLeft Minutes remaining when the warning fires
 */
export type TimeWarningCallback = (minutesLeft: number) => void;

/**
 * Callback invoked when time has expired.
 */
export type TimeExpiredCallback = () => void;

export class DoorTimekeeper {
    /** Total session time in seconds (from drop file). */
    private readonly _totalSeconds: number;

    /** Timestamp (Date.now()) when the timekeeper was started. */
    private readonly _startTime: number;

    /** Warning thresholds in minutes, sorted descending. */
    private readonly _warnings: number[];

    /** Set of warning thresholds already fired (in minutes). */
    private readonly _firedWarnings: Set<number> = new Set();

    /** Whether the expiry callback has already fired. */
    private _expired = false;

    /** Callback for time warnings. */
    private _onWarning: TimeWarningCallback | null = null;

    /** Callback for time expiry. */
    private _onExpired: TimeExpiredCallback | null = null;

    /**
     * @param timeLeftMinutes Minutes remaining from the drop file
     * @param warningMinutes  Array of minute thresholds to warn at (e.g. [5, 2, 1])
     */
    constructor(timeLeftMinutes: number, warningMinutes: number[] = [5, 2, 1]) {
        this._totalSeconds = Math.max(0, timeLeftMinutes) * 60;
        this._startTime = Date.now();
        // Sort descending so we check largest thresholds first
        this._warnings = [...warningMinutes].sort((a, b) => b - a);
    }

    /** Register a callback for time warnings. */
    set onWarning(cb: TimeWarningCallback | null) {
        this._onWarning = cb;
    }

    /** Register a callback for time expiry. */
    set onExpired(cb: TimeExpiredCallback | null) {
        this._onExpired = cb;
    }

    /** Seconds elapsed since the timekeeper started. */
    get elapsedSeconds(): number {
        return Math.floor((Date.now() - this._startTime) / 1000);
    }

    /** Seconds remaining in the session. */
    get secondsRemaining(): number {
        return Math.max(0, this._totalSeconds - this.elapsedSeconds);
    }

    /** Minutes remaining in the session (rounded down). */
    get minutesRemaining(): number {
        return Math.floor(this.secondsRemaining / 60);
    }

    /** Whether time has expired. */
    get isExpired(): boolean {
        return this.secondsRemaining <= 0;
    }

    /**
     * Check time and fire any pending warnings or the expiry callback.
     *
     * Call this on each I/O cycle (before getkey() blocks, after output, etc.).
     * It is safe to call repeatedly - each warning fires only once, and the
     * expiry callback fires only once.
     */
    check(): void {
        const remaining = this.minutesRemaining;

        // Check warning thresholds
        if (this._onWarning) {
            for (const threshold of this._warnings) {
                if (remaining <= threshold && !this._firedWarnings.has(threshold)) {
                    this._firedWarnings.add(threshold);
                    this._onWarning(threshold);
                }
            }
        }

        // Check expiry
        if (this.isExpired && !this._expired) {
            this._expired = true;
            if (this._onExpired) {
                this._onExpired();
            }
        }
    }
}
