/**
 * King Arthur's Weapons - Feature tests
 *
 * Tests buying weapons, selling weapons, and the strength requirement system.
 */

import { TestHarness } from '../harness';

describe('King Arthurs Weapons', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run()', () => {
        test('Q exits the shop', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('Q');
            await harness.context.kingArthurs.run();
            // Should complete
        });

        test('R exits the shop', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('R');
            await harness.context.kingArthurs.run();
        });
    });

    describe('sellWeapon()', () => {
        test('sells current weapon for gold', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    weapon_num: 2,
                    weapon: 'Dagger',
                    gold: 100,
                    str: 20,
                    level: 1,
                    cha: 1,
                },
            });

            // S to sell, Y to confirm
            harness.queueKeys('S', 'Y', '\r', 'Q');
            await harness.context.kingArthurs.run();

            // Weapon should be reset to Stick (weapon 0)
            expect(harness.player!.weapon_num).toBe(0);
            expect(harness.player!.gold).toBeGreaterThan(100);
        });

        test('declines to sell weapon', async () => {
            harness = TestHarness.create({
                playerOverrides: { weapon_num: 2, weapon: 'Dagger', gold: 100, str: 20 },
            });

            harness.queueKeys('S', 'N', '\r', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.player!.weapon_num).toBe(2);
        });

        test('allows same-store weapon buyback at the sale price', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    weapon_num: 2,
                    weapon: 'Dagger',
                    gold: 1000,
                    str: 20,
                    level: 1,
                    cha: 1,
                },
            });
            harness.context.settings.shop_buyback_enabled = true;
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('S', 'Y', '\r', 'B', '2', 'Y', '\r', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.player!.weapon_num).toBe(2);
            expect(harness.player!.gold).toBe(1000);
        });

        test('shows error when no weapon to sell', async () => {
            harness = TestHarness.create({
                playerOverrides: { weapon_num: 0, weapon: 'Stick', gold: 100 },
            });

            harness.queueKeys('S', '\r', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.outputContains("don't have")).toBe(true);
        });
    });

    describe('buyWeapon()', () => {
        test('buys a weapon successfully', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    weapon_num: 0,
                    weapon: 'Stick',
                    gold: 50000,
                    str: 100,
                    level: 5,
                    cha: 1,
                },
            });
            harness.context.settings.shop_limit = false;

            // B to buy, weapon number 2, Y to confirm
            harness.queueKeys('B', '2', 'Y', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.player!.weapon_num).toBe(2);
            expect(harness.player!.gold).toBeLessThan(50000);
        });

        test('rejects buying when already has a weapon', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    weapon_num: 2,
                    weapon: 'Dagger',
                    gold: 50000,
                    str: 100,
                },
            });
            harness.context.settings.shop_limit = false;

            harness.queueKeys('B', '3', 'Y', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.outputContains('already have')).toBe(true);
        });

        test('rejects when insufficient gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { weapon_num: 0, gold: 10, str: 100 },
            });
            harness.context.settings.shop_limit = false;

            harness.queueKeys('B', '5', 'Y', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.outputContains("don't have that much gold")).toBe(true);
        });

        test('restores sold weapon after failed upgrade when enabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    weapon_num: 2,
                    weapon: 'Dagger',
                    gold: 100,
                    str: 20,
                    level: 1,
                    cha: 1,
                },
            });
            harness.context.settings.shop_buyback_enabled = true;
            harness.context.settings.shop_restore_old_item_on_failed_upgrade = true;
            harness.context.settings.shop_limit = false;
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('S', 'Y', '\r', 'B', '5', 'Y', '\r', 'Q');
            await harness.context.kingArthurs.run();

            expect(harness.player!.weapon_num).toBe(2);
            expect(harness.player!.weapon).toBe('Dagger');
            expect(harness.player!.gold).toBe(100);
        });

        test('0 exits buy screen', async () => {
            expect.assertions(0);
            harness = TestHarness.create();

            harness.queueKeys('B', '0', 'Q');
            await harness.context.kingArthurs.run();
            // Should exit cleanly
        });
    });
});
