/**
 * Forest - Feature tests
 *
 * Tests the Forest area: menu, navigation, lookToKill (monster fight),
 * random events, Healer's Hut access, horse/tavern, easter eggs.
 */

import { TestHarness } from '../harness';

describe('Forest', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run() - navigation', () => {
        test('R exits the forest', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('R');
            await harness.context.forest.run();
        });

        test('Q exits the forest', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('Q');
            await harness.context.forest.run();
        });

        test('Enter exits the forest', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('\r');
            await harness.context.forest.run();
        });

        test('? re-shows the forest menu', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('?', 'R');
            await harness.context.forest.run();
        });

        test('V shows player stats', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('V', 'R');
            await harness.context.forest.run();

            expect(harness.context.io.showStats).toHaveBeenCalled();
        });

        test('H enters Healer\'s Hut', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15, hp: 20, hp_max: 20 },
            });

            // Healer run() will Q out, then R to exit forest
            harness.queueKeys('H', 'R', 'R');
            await harness.context.forest.run();
        });
    });

    describe('prompt()', () => {
        test('shows HP, fights, gold, gems', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 10, hp: 15, hp_max: 20, gold: 500, gem: 3 },
            });

            harness.queueKeys('R');
            await harness.context.forest.run();

            expect(harness.outputContains('15')).toBe(true);
            expect(harness.outputContains('20')).toBe(true);
        });
    });

    describe('lookToKill() - too tired', () => {
        test('shows "too tired" when no forest fights left', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 0 },
            });

            harness.queueKeys('L', '\r', 'R');
            await harness.context.forest.run();

            expect(harness.outputContains('too tired')).toBe(true);
        });
    });

    describe('lookToKill() - monster fight', () => {
        test('fights and kills a monster, getting gold and exp', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    forest_fights: 15,
                    hp: 32000,
                    hp_max: 32000,
                    str: 32000,
                    def: 10000,
                    gold: 100,
                    exp: 10,
                    drag_kills: 0,
                },
            });

            // random(5) must not return 1 → goes to monster fight, not random event
            harness.rng.queueRandomValues([2]);  // random(5) = 2, not 1

            // Queue L to look, A attacks, more \r's for prompts
            const keys: string[] = ['L'];
            for (let i = 0; i < 20; i++) keys.push('A');
            keys.push('\r');  // more prompt after kill
            keys.push('R');   // exit forest

            harness.queueKeys(...keys);
            await harness.context.forest.run();

            expect(harness.player!.forest_fights).toBe(14);
            expect(harness.player!.exp).toBeGreaterThan(10);
        });

        test('level 1 still rolls the level 1 monster pool when the setting is disabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    forest_fights: 15,
                    hp: 32000,
                    hp_max: 32000,
                    str: 32000,
                    def: 10000,
                    gold: 100,
                    exp: 10,
                },
            });
            harness.context.settings.forest_allow_level_one_monsters_above_level_one = false;
            const loadMonsterSpy = jest.spyOn(harness.context.forest, 'loadMonster');

            harness.rng.queueRandomValues([2, 7]);

            const keys: string[] = ['L'];
            for (let i = 0; i < 20; i++) keys.push('A');
            keys.push('\r');
            keys.push('R');

            harness.queueKeys(...keys);
            await harness.context.forest.run();

            expect(loadMonsterSpy).toHaveBeenCalledWith(7);
        });

        test('higher-level players skip level 1 monster bucket when the setting is disabled', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 3,
                    forest_fights: 15,
                    hp: 32000,
                    hp_max: 32000,
                    str: 32000,
                    def: 10000,
                    gold: 100,
                    exp: 10,
                },
            });
            harness.context.settings.forest_allow_level_one_monsters_above_level_one = false;
            const loadMonsterSpy = jest.spyOn(harness.context.forest, 'loadMonster');

            harness.rng.queueRandomValues([
                2,
                2,
                0,
                4,
            ]);

            const keys: string[] = ['L'];
            for (let i = 0; i < 20; i++) keys.push('A');
            keys.push('\r');
            keys.push('R');

            harness.queueKeys(...keys);
            await harness.context.forest.run();

            expect(loadMonsterSpy).toHaveBeenCalledWith(15);
        });

        test('death in forest ends the loop', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    forest_fights: 15,
                    hp: 1,
                    hp_max: 1,
                    str: 1,
                    def: 0,
                    gold: 100,
                    drag_kills: 0,
                },
            });

            // random(5) must not return 1 → monster fight
            harness.rng.queueRandomValues([2]);

            // Queue L to look, then A attacks until death
            const keys: string[] = ['L'];
            for (let i = 0; i < 30; i++) keys.push('A');
            keys.push('\r');

            harness.queueKeys(...keys);
            await harness.runUntilExit(() => harness.context.forest.run());

            expect(harness.player!.dead).toBe(true);
        });
    });

    describe('lookToKill() - random events', () => {
        test('triggers LDY forest event via lord.ldy (default case)', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    forest_fights: 15,
                    hp: 100,
                    hp_max: 100,
                    horse: false,
                },
            });

            // random(5)===1 triggers event, random(15)=8 hits default → LDY
            harness.rng.queueRandomValues([
                1,   // random(5) = 1 → event
                8,   // random(15) = 8 → default → LDY event
            ]);

            harness.queueKeys('L', 'R');
            await harness.context.forest.run();

            expect(harness.context.ldyManager.runForestEvent).toHaveBeenCalled();
        });

        test('triggers LDY forest event on multiple default slots', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    forest_fights: 15,
                    horse: false,
                },
            });

            harness.rng.queueRandomValues([
                1,     // random(5) = 1 → event
                14,    // random(15) = 14 → default → LDY event
            ]);

            harness.queueKeys('L', 'R');
            await harness.context.forest.run();

            expect(harness.context.ldyManager.runForestEvent).toHaveBeenCalled();
        });
    });

    describe('forest easter eggs', () => {
        test('B throws gold to vulture (gold goes to bank)', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15, gold: 1000, bank: 500 },
            });

            harness.queueKeys('B', 'R');
            await harness.context.forest.run();

            expect(harness.player!.gold).toBe(0);
            expect(harness.player!.bank).toBe(1500);
        });

        test('A brandishes weapon dramatically', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('A', 'R');
            await harness.context.forest.run();

            expect(harness.outputContains('brandish')).toBe(true);
        });

        test('D shows Death Knight skills can\'t help', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('D', 'R');
            await harness.context.forest.run();

            expect(harness.outputContains('Death Knight skills')).toBe(true);
        });

        test('M shows Mystical skills can\'t help', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15 },
            });

            harness.queueKeys('M', 'R');
            await harness.context.forest.run();

            expect(harness.outputContains('Mystical skills')).toBe(true);
        });

        test('T without horse shows Thieving skills message', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15, horse: false },
            });

            harness.queueKeys('T', 'R');
            await harness.context.forest.run();

            expect(harness.outputContains('Thieving skills')).toBe(true);
        });
    });

    describe('forestSpecial() - weird event', () => {
        test('weird event triggers gem find on entry', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    forest_fights: 15,
                    weird: true,
                    gem: 0,
                    level: 3,
                },
            });

            harness.queueKeys('\r', 'R');
            await harness.context.forest.run();

            // Player should get gems and weird flag should be cleared
            expect(harness.player!.weird).toBe(false);
            expect(harness.player!.gem).toBeGreaterThan(0);
        });
    });

    describe('S key - level 12 attack dragon / lower level show stats', () => {
        test('S at level < 12 shows stats', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15, level: 5 },
            });

            harness.queueKeys('S', 'R');
            await harness.context.forest.run();

            expect(harness.context.io.showStats).toHaveBeenCalled();
        });
    });

    describe('T with horse - Dark Horse Tavern', () => {
        test('T with horse goes to Darkhorse Tavern', async () => {
            harness = TestHarness.create({
                playerOverrides: { forest_fights: 15, horse: true },
            });

            // Stub DarkhorseTavern to avoid complex sub-menu
            harness.context.forest.darkhorseTavern = jest.fn();

            harness.queueKeys('T', '\r', 'R');
            await harness.context.forest.run();

            expect(harness.context.forest.darkhorseTavern).toHaveBeenCalled();
        });
    });
});
