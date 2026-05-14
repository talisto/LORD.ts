/**
 * State - Unit tests for State class
 *
 * Tests getState() and putState() using an in-memory SQLite database so
 * we can verify that state is persisted and retrieved correctly without
 * touching any real files or requiring a full GameContext.
 */

import State from '@lordts/core/State';
import { SqliteStorage } from '@lordts/storage/SqliteStorage';
import { Lazy } from '@lordts/util/Lazy';

function makeState(): { state: State; db: SqliteStorage } {
    const db = new SqliteStorage(':memory:');
    const lazyStorage = new Lazy(() => db);
    const lazyPlayer = new Lazy(() => null);
    const state = new State([], lazyPlayer, lazyStorage);
    return { state, db };
}

describe('State', () => {
    describe('getState()', () => {
        test('loads default state values from empty DB', async () => {
            const { state } = makeState();
            await state.getState(false);

            // Default values from State_Def definitions
            expect(typeof state.days).toBe('number');
            expect(typeof state.won_by).toBe('number');
            expect(typeof state.log_date).toBe('number');
        });

        test('uses storage on first call', async () => {
            const { state } = makeState();
            await state.getState(false);
            // storage should have been accessed
            expect(state.storage).toBeDefined();
        });

        test('subsequent calls do not throw', async () => {
            const { state } = makeState();
            await state.getState(false);
            await state.getState(false);
            expect(state.storage).toBeDefined();
        });

        test('maps known state properties onto this', async () => {
            const { state } = makeState();
            await state.getState(false);

            // After getState, known fields should be on the instance
            expect(Object.prototype.hasOwnProperty.call(state, 'days')).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(state, 'won_by')).toBe(true);
            expect(Object.prototype.hasOwnProperty.call(state, 'latesthero')).toBe(true);
        });
    });

    describe('putState()', () => {
        test('persists modified state fields', async () => {
            const { state } = makeState();
            await state.getState(false);

            // Modify a field
            state.days = 42;
            state.latesthero = 'TestHero';
            state.putState();

            // Reload state
            await state.getState(false);
            expect(state.days).toBe(42);
            expect(state.latesthero).toBe('TestHero');
        });

        test('does nothing when called before getState', () => {
            const { state } = makeState();
            // Should not throw even though _put is null
            expect(() => state.putState()).not.toThrow();
        });

        test('persists won_by field', async () => {
            const { state } = makeState();
            await state.getState(false);
            state.won_by = 5;
            state.putState();

            await state.getState(false);
            expect(state.won_by).toBe(5);
        });

        test('persists forest_gold field', async () => {
            const { state } = makeState();
            await state.getState(false);
            state.forest_gold = 9999;
            state.putState();

            await state.getState(false);
            expect(state.forest_gold).toBe(9999);
        });
    });
});
