/**
 * Turgons - Turgon's Warrior Training feature tests
 *
 * Tests the training facility: viewing master, asking about master,
 * attacking master with sufficient/insufficient exp, and level-up.
 */

import { TestHarness } from '../harness';

describe('Turgons', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run()', () => {
        test('R exits the training grounds', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { level: 1, exp: 1 },
            });

            harness.queueKeys('R');
            await harness.context.turgons.run();
        });

        test('Enter exits the training grounds', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { level: 1, exp: 1 },
            });

            harness.queueKeys('\r');
            await harness.context.turgons.run();
        });

        test('? re-shows the menu', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { level: 1, exp: 1 },
            });

            harness.queueKeys('?', 'R');
            await harness.context.turgons.run();
        });

        test('level 12+ player gets "kill the Red Dragon" message and exits', async () => {
            harness = TestHarness.create({
                playerOverrides: { level: 12, exp: 2000000000 },
            });

            harness.queueKeys('\r');
            await harness.context.turgons.run();

            expect(harness.outputContains('Red Dragon')).toBe(true);
        });
    });

    describe('ask() - Question Your Master', () => {
        test('shows experience needed when not enough exp', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 1,
                    sex: 'M',
                    weapon: 'Stick',
                },
            });

            harness.queueKeys('Q', '\r', 'R');
            await harness.context.turgons.run();

            expect(harness.outputContains('more experience')).toBe(true);
        });

        test('shows master response when sufficient exp', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 999999,
                    sex: 'M',
                    weapon: 'Stick',
                },
            });

            harness.queueKeys('Q', '\r', 'R');
            await harness.context.turgons.run();

            // The trainer looks at you carefully and says something
            expect(harness.outputContains('looks at')).toBe(true);
        });
    });

    describe('attackMaster()', () => {
        test('not enough exp - weapon taken, seen_master set', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 1,
                    seen_master: false,
                    weapon: 'Stick',
                    hp: 50,
                    hp_max: 50,
                    str: 10,
                    def: 1,
                },
            });

            harness.queueKeys('A', '\r', '\r', '\r', '\r', 'R');
            await harness.context.turgons.run();

            expect(harness.player!.seen_master).toBe(true);
            expect(harness.outputContains('not ready')).toBe(true);
        });

        test('already seen master today - cannot fight again', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 1,
                    seen_master: true,
                    weapon: 'Stick',
                },
            });

            harness.queueKeys('A', '\r', 'R');
            await harness.context.turgons.run();

            expect(harness.outputContains('too late')).toBe(true);
        });

        test('wins master fight - levels up', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 999999,
                    seen_master: false,
                    weapon: 'Stick',
                    hp: 32000,
                    hp_max: 32000,
                    str: 32000,
                    def: 10000,
                    clss: 1,
                },
            });

            // Stub battle.fight to instantly kill the trainer
            harness.context.battle.fight = jest.fn().mockImplementation((enemy: any) => {
                enemy.hp = 0;
            });

            // Key sequence:
            // 1. 'A' - select attackMaster from menu
            // 2. '\r' - more prompt inside attackMaster (entering arena)
            // 3. battle.fight runs (stubbed - trainer dies instantly)
            // 4. '\r' - more prompt after "you have bested" / level up text
            // 5. 'R' - exit turgons (back in run() loop)
            harness.queueKeys(
                'A',   // menu: attack master
                '\r',  // more prompt entering arena
                '\r',  // more prompt after level up
                'R',   // exit turgons
            );
            await harness.context.turgons.run();

            expect(harness.player!.level).toBe(2);
            expect(harness.outputContains('LEVEL 2')).toBe(true);
        });

        test('loses master fight - fully healed and not dead', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    level: 1,
                    exp: 999999,
                    seen_master: false,
                    weapon: 'Stick',
                    hp: 1,
                    hp_max: 20,
                    str: 1,
                    def: 0,
                    clss: 1,
                },
            });

            // Stub battle.fight to make the player die
            harness.context.battle.fight = jest.fn().mockImplementation(() => {
                harness.player!.dead = true;
                harness.player!.hp = 0;
            });

            // Key sequence:
            // 1. 'A' - select attackMaster from menu
            // 2. '\r' - more prompt entering arena
            // 3. battle.fight runs (stubbed - player dies)
            // 4. '\r' - more after "raises weapon to kill"
            // 5. '\r' - more after "helps you up"
            // 6. 'R' - exit turgons
            harness.queueKeys(
                'A',   // menu: attack master
                '\r',  // more prompt entering arena
                '\r',  // more after "raises weapon"
                '\r',  // more after "helps you up"
                'R',   // exit turgons
            );
            await harness.context.turgons.run();

            // After losing to master, player is healed, not dead
            expect(harness.player!.dead).toBe(false);
            expect(harness.player!.hp).toBe(harness.player!.hp_max);
            expect(harness.outputContains('helps you up')).toBe(true);
        });
    });

    describe('rankKing() - View heroes', () => {
        test('V key shows heroes list', async () => {
            harness = TestHarness.create({
                playerOverrides: { level: 5, exp: 10000, drag_kills: 0 },
            });

            // Stub allPlayers for rankKing
            (harness.context.player as unknown as Record<string, unknown>).allPlayers = jest.fn().mockReturnValue([
                { name: 'HeroA', drag_kills: 3, level: 10, exp: 500000 },
                { name: 'HeroB', drag_kills: 1, level: 5, exp: 100000 },
            ]);
            harness.context.io.showBuffer = jest.fn();

            harness.queueKeys('V', '\r', 'R');
            await harness.context.turgons.run();

            // rankKing was invoked - showBuffer should have been called
            expect(harness.context.io.showBuffer).toHaveBeenCalled();
        });
    });
});
