/**
 * DoorTimekeeper - Unit tests
 *
 * Tests countdown tracking, warning thresholds, and expiry callbacks.
 */

import { DoorTimekeeper } from '@lordts/door/DoorTimekeeper';

describe('DoorTimekeeper', () => {

    test('initializes with correct time remaining', () => {
        const keeper = new DoorTimekeeper(30);
        // Right after construction, ~30 minutes should remain
        expect(keeper.minutesRemaining).toBeGreaterThanOrEqual(29);
        expect(keeper.minutesRemaining).toBeLessThanOrEqual(30);
        expect(keeper.isExpired).toBe(false);
    });

    test('returns 0 for negative time input', () => {
        const keeper = new DoorTimekeeper(-5);
        expect(keeper.secondsRemaining).toBe(0);
        expect(keeper.isExpired).toBe(true);
    });

    test('fires warning callbacks at correct thresholds', () => {
        // Create a keeper with 3 minutes left, warnings at [3, 2, 1]
        const keeper = new DoorTimekeeper(3, [3, 2, 1]);
        const warnings: number[] = [];
        keeper.onWarning = (mins) => warnings.push(mins);

        // Right away, 3 minutes remain → fires the 3-minute warning
        keeper.check();
        expect(warnings).toEqual([3]);

        // Call again - should NOT re-fire the 3-minute warning
        keeper.check();
        expect(warnings).toEqual([3]);
    });

    test('fires expiry callback when time is zero', () => {
        const keeper = new DoorTimekeeper(0);
        let expired = false;
        keeper.onExpired = () => { expired = true; };

        keeper.check();
        expect(expired).toBe(true);
    });

    test('does not fire expiry more than once', () => {
        const keeper = new DoorTimekeeper(0);
        let count = 0;
        keeper.onExpired = () => { count++; };

        keeper.check();
        keeper.check();
        keeper.check();
        expect(count).toBe(1);
    });

    test('fires multiple warnings in correct order', () => {
        // 0 minutes left, so all warnings should fire immediately
        const keeper = new DoorTimekeeper(0, [5, 2, 1]);
        const warnings: number[] = [];
        keeper.onWarning = (mins) => warnings.push(mins);

        keeper.check();
        // All thresholds crossed at once - fired in descending order (5, 2, 1)
        expect(warnings).toEqual([5, 2, 1]);
    });

    test('elapsedSeconds is non-negative', () => {
        const keeper = new DoorTimekeeper(10);
        expect(keeper.elapsedSeconds).toBeGreaterThanOrEqual(0);
    });

    test('secondsRemaining does not go below zero', () => {
        const keeper = new DoorTimekeeper(0);
        expect(keeper.secondsRemaining).toBe(0);
    });
});
