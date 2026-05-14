/**
 * Healers - Feature tests
 *
 * Tests all Healers options: Heal All (H), Heal Some (C), Return (R),
 * and the case where the player is already at full HP.
 */

import { TestHarness } from '../harness';

describe('Healers', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run()', () => {
        test('shows "look fine to us" when at full HP', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 20, hp_max: 20, gold: 1000 },
            });

            harness.queueKeys('\r');  // more prompt after healers message
            await harness.context.healers.run();

            expect(harness.outputContains('You look fine to us')).toBe(true);
        });

        test('R exits healers', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000 },
            });

            harness.queueKeys('R');
            await harness.context.healers.run();
            // Should complete without error
        });
    });

    describe('Heal All (H)', () => {
        test('heals fully when player has enough gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000, level: 1 },
            });

            // H to heal all, then more prompt
            harness.queueKeys('H', '\r');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(20);
            // Cost: 10 hp needed * 5 * level(1) = 50 gold
            expect(harness.player!.gold).toBe(950);
            expect(harness.outputContains('healed')).toBe(true);
        });

        test('partially heals when insufficient gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 5, hp_max: 20, gold: 30, level: 1 },
            });

            // Cost per hp: 5 * level(1) = 5. With 30 gold, can afford 6 hp.
            harness.queueKeys('H', '\r');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(11); // 5 + 6
            expect(harness.player!.gold).toBe(0); // 30 - 30
        });

        test('shows "look fine" when already at max (via heal all in loop)', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 20, hp_max: 20, gold: 1000, level: 1 },
            });

            harness.queueKeys('\r');
            await harness.context.healers.run();

            expect(harness.outputContains('You look fine to us')).toBe(true);
        });
    });

    describe('Heal Some (C)', () => {
        test('heals a specific amount', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000, level: 1 },
            });

            // C to choose amount, enter 5 hp, then R to leave
            harness.queueKeys('C', '5', 'R');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(15);
            // Cost: 5 hp * 5 * level(1) = 25
            expect(harness.player!.gold).toBe(975);
        });

        test('rejects overhealing', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 15, hp_max: 20, gold: 1000, level: 1 },
            });

            harness.queueKeys('C', '10', 'R');  // 10 is more than needed (5)
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(15);  // unchanged
            expect(harness.outputContains('deadly to over heal')).toBe(true);
        });

        test('rejects when not enough gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 10, level: 1 },
            });

            harness.queueKeys('C', '5', 'R');  // 5hp * 5gold = 25 needed, only 10
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(10);  // unchanged
            expect(harness.outputContains("don't have enough gold")).toBe(true);
        });

        test('handles zero amount', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000, level: 1 },
            });

            harness.queueKeys('C', '0', 'R');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(10);
            expect(harness.outputContains('other time')).toBe(true);
        });

        test('rejects negative amount', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000, level: 1 },
            });

            harness.queueKeys('C', '-5', 'R');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(10);
            expect(harness.outputContains('hurting yourself')).toBe(true);
        });
    });

    describe('Easter eggs', () => {
        test('1 - cooking', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000 },
            });

            harness.queueKeys('1', 'R');
            await harness.context.healers.run();

            expect(harness.outputContains('cooking')).toBe(true);
        });

        test('2 - eye', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000 },
            });

            harness.queueKeys('2', 'R');
            await harness.context.healers.run();

            expect(harness.outputContains('Eye am not sure')).toBe(true);
        });

        test('3 - patient', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 1000 },
            });

            harness.queueKeys('3', 'R');
            await harness.context.healers.run();

            expect(harness.outputContains('patient')).toBe(true);
        });
    });

    describe('Healing cost scales with level', () => {
        test('level 5 costs 25 gold per HP', async () => {
            harness = TestHarness.create({
                playerOverrides: { hp: 10, hp_max: 20, gold: 10000, level: 5 },
            });

            harness.queueKeys('C', '4', 'R');
            await harness.context.healers.run();

            expect(harness.player!.hp).toBe(14);
            // Cost: 4 hp * 5 * 5 = 100
            expect(harness.player!.gold).toBe(9900);
        });
    });
});
