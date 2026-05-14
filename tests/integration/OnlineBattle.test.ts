/**
 * OnlineBattle - Feature tests
 *
 * Tests what can be tested without real networking:
 * obCleanup, obGetMessage (file-based), constructor init.
 *
 * Note: Full online battle testing requires socket mocking which is
 * beyond the scope of these integration tests. The key methods that
 * rely on psock/file-based messaging are covered at the unit level.
 */

import { TestHarness, makeDefaultPlayerRecord } from '../harness';
import { PvpLootPolicy } from '@lordts/core/PvpLootPolicy';

describe('OnlineBattle', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('constructor', () => {
        test('initializes with cantaunt = false', () => {
            harness = TestHarness.create();

            expect((harness.context.onlineBattle as unknown as Record<string, unknown>)['cantaunt']).toBe(false);
        });
    });

    describe('obCleanup()', () => {
        test('clears battle state', () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            const clearWarSpy = jest.spyOn(harness.context.battleCoordinator, 'clearWarMessage');
            const clearFightSpy = jest.spyOn(harness.context.battleCoordinator, 'clearFightLock');
            const clearBattleSpy = jest.spyOn(harness.context.battleCoordinator, 'clearBattleMessage');

            harness.context.onlineBattle.obCleanup();

            expect(clearWarSpy).toHaveBeenCalledWith(0);
            expect(clearFightSpy).toHaveBeenCalledWith(0);
            expect(clearBattleSpy).toHaveBeenCalledWith(0);
        });
    });

    describe('obGetMessage()', () => {
        test('returns false when no message file exists', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });

            const op = makeDefaultPlayerRecord({ name: 'Rival', Record: 1 });

            // fileExists is mocked to return false
            const result = await harness.context.onlineBattle.obGetMessage(op);

            expect(result).toBe(false);
        });

        test('reads and displays message when battle message exists', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });

            const op = makeDefaultPlayerRecord({ name: 'Rival', Record: 1 });

            // Set a battle message in battleCoordinator for this player
            harness.context.battleCoordinator.setBattleMessage(0, 'You smell!');

            // Stub obReadMsg to return a message
            harness.context.onlineBattle.obReadMsg = jest.fn().mockReturnValue('You smell!');

            harness.queueKeys('\r');  // more prompt
            const result = await harness.context.onlineBattle.obGetMessage(op);

            expect(result).toBe(true);
            expect(harness.outputContains('screams something')).toBe(true);
        });
    });

    describe('onBattle()', () => {
        test('caps gold gained from killing an online opponent', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    gold: 100,
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 100,
                    level: 3,
                },
            });
            harness.context.settings.pvp_gold_loot_cap_factor = 1;

            const opponent = makeDefaultPlayerRecord({
                name: 'Rival',
                Record: 1,
                on_now: true,
                hp: 1,
                hp_max: 1,
                str: 1,
                def: 0,
                gold: 100000,
                exp: 100,
                level: 1,
            });
            const expectedReward = PvpLootPolicy.resolveGoldReward(
                opponent.gold,
                harness.player!.level,
                harness.context.monsterStats,
                harness.context.settings,
            );
            const onlineBattle = harness.context.onlineBattle as unknown as {
                onBattle(op: typeof opponent, first: boolean, action?: string): Promise<void>;
            };

            harness.rng.queueRandomValues([0]);
            harness.queueKeys('\r', 'A', '\r');

            await onlineBattle.onBattle(opponent, true);

            expect(harness.player!.gold).toBe(100 + expectedReward);
            expect(harness.outputContains('You receive')).toBe(true);
        });

        test('caps gems gained from killing an online opponent', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    hp: 1000,
                    hp_max: 1000,
                    str: 100,
                    def: 100,
                    gem: 0,
                    level: 3,
                },
            });
            harness.context.settings.pvp_gem_loot_cap = 3;

            const opponent = makeDefaultPlayerRecord({
                name: 'Rival',
                Record: 1,
                on_now: true,
                hp: 1,
                hp_max: 1,
                str: 1,
                def: 0,
                gold: 1000,
                gem: 10,
                exp: 100,
                level: 1,
            });
            const expectedReward = PvpLootPolicy.resolveGemReward(opponent.gem, harness.context.settings);
            const onlineBattle = harness.context.onlineBattle as unknown as {
                onBattle(op: typeof opponent, first: boolean, action?: string): Promise<void>;
            };

            harness.rng.queueRandomValues([0]);
            harness.queueKeys('\r', 'A', '\r');

            await onlineBattle.onBattle(opponent, true);

            expect(harness.player!.gem).toBe(expectedReward);
            expect(harness.outputContains('You also find')).toBe(true);
        });

        test('online duel deaths still remove half the victim gems', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 10,
                    hp: 10,
                    hp_max: 10,
                    gem: 10,
                },
            });

            const opponent = makeDefaultPlayerRecord({
                name: 'Rival',
                Record: 1,
                on_now: true,
                weapon: 'Sword',
            });
            const onlineBattle = harness.context.onlineBattle as unknown as {
                onBattle(op: typeof opponent, first: boolean, action?: string): Promise<void>;
            };

            harness.queueKeys('\r');

            await onlineBattle.onBattle(opponent, false, '50');

            expect(harness.player!.dead).toBe(true);
            expect(harness.player!.gem).toBe(5);
        });
    });
});
