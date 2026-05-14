/**
 * SeededRandom - Deterministic random number generation for tests.
 *
 * Replaces Math.random with a seeded PRNG (xoshiro128**) and provides
 * utilities to mock the `random()` function from src/Util.ts.
 *
 * Two modes of operation:
 *
 * 1. **Seeded mode**: Supply a numeric seed - every call to Math.random()
 *    returns a deterministic, repeatable sequence.
 *
 * 2. **Queue mode**: Supply a pre-determined list of values that random()
 *    should return in order.  When the queue is exhausted, falls back to
 *    the seeded PRNG (or real Math.random if no seed).
 *
 * Usage:
 *   const sr = new SeededRandom(42);
 *   sr.install();            // patches Math.random globally
 *   // ... run game code ...
 *   sr.restore();            // restores original Math.random
 *
 *   // Or with a queue:
 *   const sr = new SeededRandom();
 *   sr.queueRandomValues([3, 0, 1, 4]); // random(n) returns 3, then 0, ...
 *   sr.install();
 */

// We also need to patch the `random` export from Util.ts.
// The cleanest way is to use jest.spyOn on the Util module.
import * as Util from '@lordts/util/Util';

export class SeededRandom {
    private _origMathRandom: () => number;
    private _seed: number;
    private _state: Uint32Array;
    private _queue: number[] = [];
    private _randomSpy: jest.SpyInstance | null = null;

    constructor(seed: number = 12345) {
        this._origMathRandom = Math.random;
        this._seed = seed;
        this._state = new Uint32Array(4);
        this._initState(seed);
    }

    // ── xoshiro128** PRNG ───────────────────────────────────────────────

    private _initState(seed: number): void {
        // Use SplitMix32 to initialize the 4-word state from a single seed
        let s = seed >>> 0;
        for (let i = 0; i < 4; i++) {
            s = (s + 0x9e3779b9) >>> 0;
            let z = s;
            z = (z ^ (z >>> 16)) >>> 0;
            z = Math.imul(z, 0x85ebca6b) >>> 0;
            z = (z ^ (z >>> 13)) >>> 0;
            z = Math.imul(z, 0xc2b2ae35) >>> 0;
            z = (z ^ (z >>> 16)) >>> 0;
            this._state[i] = z;
        }
    }

    /** Returns a float in [0, 1) - drop-in replacement for Math.random() */
    next(): number {
        const s = this._state;
        const result = (Math.imul(rotl(Math.imul(s[1], 5), 7), 9)) >>> 0;
        const t = (s[1] << 9) >>> 0;

        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = rotl(s[3], 11) >>> 0;

        return (result >>> 0) / 0x100000000;
    }

    /** Returns an integer in [0, n) - same as Util.random(n) */
    nextInt(n: number): number {
        return Math.floor(this.next() * n);
    }

    // ── Queue mode ──────────────────────────────────────────────────────

    /**
     * Queue predetermined values that `random(n)` will return.
     * Values are consumed in FIFO order.  The value itself is returned
     * directly (not modulo n), so queue exactly what you want returned.
     */
    queueRandomValues(values: number[]): void {
        this._queue.push(...values);
    }

    /** Clear the queue */
    clearQueue(): void {
        this._queue = [];
    }

    // ── Install / Restore ───────────────────────────────────────────────

    /**
     * Patch Math.random and Util.random globally for the duration of a test.
     * Call restore() in afterEach().
     */
    install(): void {
        // Replace Math.random
        Math.random = () => this.next();

        // Spy on Util.random to use our queue or seeded PRNG
        this._randomSpy = jest.spyOn(Util, 'random').mockImplementation((n: number): number => {
            const queuedRuntimeValue = Util.consumeQueuedRandomValue();
            if (queuedRuntimeValue !== undefined) {
                return queuedRuntimeValue;
            }
            if (this._queue.length > 0) {
                return this._queue.shift()!;
            }
            return Math.floor(this.next() * n);
        });
    }

    /** Restore original Math.random and Util.random */
    restore(): void {
        Math.random = this._origMathRandom;
        if (this._randomSpy) {
            this._randomSpy.mockRestore();
            this._randomSpy = null;
        }
    }

    /** Reset the PRNG state to the original seed (re-start the sequence) */
    reset(newSeed?: number): void {
        if (newSeed !== undefined) this._seed = newSeed;
        this._initState(this._seed);
        this._queue = [];
    }
}

/** Rotate left helper for xoshiro128** */
function rotl(x: number, k: number): number {
    return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export default SeededRandom;
