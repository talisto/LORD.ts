/**
 * Abdul's Armour - Feature tests
 *
 * Tests buying armour, selling armour, and the defense requirement system.
 */

import { TestHarness } from '../harness';

describe('Abduls Armour', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run()', () => {
        test('Q exits the shop', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('Q');
            await harness.context.abdulsArmour.run();
        });

        test('R exits the shop', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('R');
            await harness.context.abdulsArmour.run();
        });
    });

    describe('sellArmour()', () => {
        test('sells current armour for gold', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    arm_num: 2,
                    arm: 'Heavy Coat',
                    gold: 100,
                    def: 20,
                    level: 1,
                    cha: 1,
                },
            });

            harness.queueKeys('S', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.player!.arm_num).toBe(0);
            expect(harness.player!.gold).toBeGreaterThan(100);
        });

        test('declines to sell armour', async () => {
            harness = TestHarness.create({
                playerOverrides: { arm_num: 2, arm: 'Heavy Coat', gold: 100, def: 20 },
            });

            harness.queueKeys('S', 'N', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.player!.arm_num).toBe(2);
        });

        test('allows same-store armour buyback at the sale price', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    arm_num: 2,
                    arm: 'Heavy Coat',
                    gold: 1000,
                    def: 20,
                    level: 1,
                    cha: 1,
                },
            });
            harness.context.settings.shop_buyback_enabled = true;
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('S', 'Y', '\r', 'B', '2', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.player!.arm_num).toBe(2);
            expect(harness.player!.gold).toBe(1000);
        });

        test('shows error when no armour to sell', async () => {
            harness = TestHarness.create({
                playerOverrides: { arm_num: 0, arm: 'Coat', gold: 100 },
            });

            harness.queueKeys('S', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.outputContains("don't have")).toBe(true);
        });
    });

    describe('buyArmour()', () => {
        test('buys armour successfully', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    arm_num: 0,
                    arm: 'Coat',
                    gold: 50000,
                    def: 100,
                    level: 5,
                    cha: 1,
                },
            });
            harness.context.settings.shop_limit = false;

            harness.queueKeys('B', '2', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.player!.arm_num).toBe(2);
            expect(harness.player!.gold).toBeLessThan(50000);
        });

        test('rejects buying when already has armour', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    arm_num: 2,
                    arm: 'Heavy Coat',
                    gold: 50000,
                    def: 100,
                },
            });
            harness.context.settings.shop_limit = false;

            harness.queueKeys('B', '3', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.outputContains("already have")).toBe(true);
        });

        test('rejects with insufficient gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { arm_num: 0, gold: 10, def: 100 },
            });
            harness.context.settings.shop_limit = false;

            harness.queueKeys('B', '5', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.outputContains('lacking funds')).toBe(true);
        });

        test('rejects when defense too low for armour', async () => {
            harness = TestHarness.create({
                playerOverrides: { arm_num: 0, gold: 500000, def: 1, level: 1 },
            });
            harness.context.settings.shop_limit = true;

            harness.queueKeys('B', '10', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.outputContains('not strong enough')).toBe(true);
        });

        test('restores sold armour after failed upgrade when enabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    arm_num: 2,
                    arm: 'Heavy Coat',
                    gold: 100,
                    def: 20,
                    level: 1,
                    cha: 1,
                },
            });
            harness.context.settings.shop_buyback_enabled = true;
            harness.context.settings.shop_restore_old_item_on_failed_upgrade = true;
            harness.context.settings.shop_limit = true;
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('S', 'Y', '\r', 'B', '10', 'Y', '\r', 'Q');
            await harness.context.abdulsArmour.run();

            expect(harness.player!.arm_num).toBe(2);
            expect(harness.player!.arm).toBe('Heavy Coat');
            expect(harness.player!.gold).toBe(100);
        });

        test('0 exits buy screen', async () => {
            expect.assertions(0);
            harness = TestHarness.create();

            harness.queueKeys('B', '0', 'Q');
            await harness.context.abdulsArmour.run();
        });
    });
});
