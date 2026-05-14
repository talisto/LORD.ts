/**
 * RedDragonInn - Red Dragon Inn feature tests
 *
 * Tests the inn menu: talk with bartender, get a room, conversation,
 * flirting, mail, stats, quit, and the wakeUp() daily reset.
 */

import { TestHarness } from '../harness';
import { BankTransferAmountPolicy } from '@lordts/core/BankTransferAmountPolicy';

describe('RedDragonInn', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('run() - menu navigation', () => {
        test('R exits the inn', async () => {
            harness = TestHarness.create();

            harness.queueKeys('R');
            const ret = await harness.context.redDragonInn.run();

            expect(ret).toBe(0);
        });

        test('Q exits the inn', async () => {
            harness = TestHarness.create();

            harness.queueKeys('Q');
            const ret = await harness.context.redDragonInn.run();

            expect(ret).toBe(0);
        });

        test('Enter exits the inn', async () => {
            harness = TestHarness.create();

            harness.queueKeys('\r');
            const ret = await harness.context.redDragonInn.run();

            expect(ret).toBe(0);
        });

        test('? re-shows the menu', async () => {
            expect.assertions(0);
            harness = TestHarness.create();

            harness.queueKeys('?', 'R');
            await harness.context.redDragonInn.run();
        });

        test('V shows stats', async () => {
            harness = TestHarness.create();

            harness.queueKeys('V', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.io.showStats).toHaveBeenCalled();
        });

        test('D shows daily log', async () => {
            harness = TestHarness.create();

            harness.queueKeys('D', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.log.showLog).toHaveBeenCalled();
        });

        test('W composes mail', async () => {
            harness = TestHarness.create();

            harness.queueKeys('W', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.mail.composeMail).toHaveBeenCalled();
        });

        test('M shows announcements', async () => {
            harness = TestHarness.create();

            harness.queueKeys('M', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.io.announce).toHaveBeenCalled();
        });

        test('C enters conversation', async () => {
            harness = TestHarness.create();

            // Stub converse to avoid complex dialog
            harness.context.redDragonInn.converse = jest.fn();

            harness.queueKeys('C', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.redDragonInn.converse).toHaveBeenCalled();
        });

        test('H talks to bard', async () => {
            harness = TestHarness.create();

            harness.context.bard.talkToBard = jest.fn();

            harness.queueKeys('H', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.bard.talkToBard).toHaveBeenCalled();
        });

        test('T talks with bartender', async () => {
            harness = TestHarness.create();

            // Stub talkWithBartender to avoid complex dialog
            harness.context.redDragonInn.talkWithBartender = jest.fn();

            harness.queueKeys('T', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.redDragonInn.talkWithBartender).toHaveBeenCalled();
        });

        test('F flirts with violet', async () => {
            harness = TestHarness.create();

            harness.context.violet.flirtWithViolet = jest.fn().mockReturnValue(false);

            harness.queueKeys('F', 'R');
            await harness.context.redDragonInn.run();

            expect(harness.context.violet.flirtWithViolet).toHaveBeenCalled();
        });

        test('inn flag is cleared on entry', async () => {
            harness = TestHarness.create({
                playerOverrides: { inn: true },
            });

            harness.queueKeys('R');
            await harness.context.redDragonInn.run();

            expect(harness.player!.inn).toBe(false);
        });
    });

    describe('getARoom()', () => {
        test('gets a room when enough gold', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    gold: 10000,
                    level: 1,
                    cha: 1,
                },
            });

            // Y to agree, exit is now via __GAME_EXIT__ (caught by runUntilExit)
            harness.queueKeys('Y');
            await harness.runUntilExit(() => harness.context.redDragonInn.getARoom());

            expect(harness.player!.inn).toBe(true);
            expect(harness.player!.gold).toBe(9600);  // 10000 - 400*1
            // exit is implicitly verified: runUntilExit caught __GAME_EXIT__
        });

        test('declines a room with N', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 10000, level: 1 },
            });

            harness.queueKeys('N');
            const result = await harness.context.redDragonInn.getARoom();

            expect(result).toBe(false);
            expect(harness.player!.inn).toBeFalsy();
        });

        test('rejects when insufficient gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 10, level: 1, cha: 1 },
            });

            harness.queueKeys('Y');
            const result = await harness.context.redDragonInn.getARoom();

            expect(result).toBe(false);
            expect(harness.outputContains("don't have that much")).toBe(true);
        });

        test('free room when charisma > 99', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    gold: 100,
                    level: 1,
                    cha: 100,
                    sex: 'M',
                },
            });

            harness.queueKeys('Y', '\r');
            await harness.runUntilExit(() => harness.context.redDragonInn.getARoom());

            expect(harness.player!.inn).toBe(true);
            expect(harness.player!.gold).toBe(100);  // no gold deducted
        });

        test('room cost scales with level', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    gold: 50000,
                    level: 5,
                    cha: 1,
                },
            });

            harness.queueKeys('Y');
            await harness.runUntilExit(() => harness.context.redDragonInn.getARoom());

            expect(harness.player!.gold).toBe(48000);  // 50000 - 400*5
        });
    });

    describe('wakeUp()', () => {
        test('resets daily stats', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 5,
                    hp_max: 100,
                    dead: false,
                    level: 3,
                    clss: 1,
                    sex: 'M',
                    pvp_fights: 0,
                    forest_fights: 0,
                    seen_master: true,
                    seen_bard: true,
                    flirted: true,
                    seen_dragon: true,
                    seen_violet: true,
                    leftbank: true,
                    inn: true,
                    bank: 1000,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    transferred_gold: 100,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                },
            });

            // Stub marriage methods called in wakeUp
            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            harness.queueKeys('\r');
            await harness.context.redDragonInn.wakeUp();

            expect(harness.player!.hp).toBe(harness.player!.hp_max);
            expect(harness.player!.seen_master).toBe(false);
            expect(harness.player!.transferred_gold).toBe(0);
            expect(harness.player!.flirted).toBe(false);
            expect(harness.player!.dead).toBe(false);
            expect(harness.player!.seen_dragon).toBe(false);
            expect(harness.player!.seen_violet).toBe(false);
            expect(harness.player!.leftbank).toBe(false);
            expect(harness.player!.seen_bard).toBe(false);
        });

        test('gives 10% bank interest', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    bank: 1000,
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                },
            });

            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            expect(harness.player!.bank).toBe(1100);
        });

        test('bank interest does not exceed 2B cap', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    bank: 2000000000,
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                },
            });

            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            expect(harness.player!.bank).toBe(2000000000);
        });

        test('wakeUp clears tracked bank transfer amount usage for the new day', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    Record: 0,
                    time: 1,
                    bank: 1000,
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                },
            });
            const state = harness.context.state;
            if (!state) {
                throw new Error('Expected test harness state to be initialized');
            }
            state.days = 2;
            state.getState = jest.fn().mockImplementation(async () => {
                state.days = 2;
            });
            BankTransferAmountPolicy.recordTransfer(harness.context.storage, 2, 0, 900);

            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            expect(BankTransferAmountPolicy.getTransferredAmount(harness.context.storage, 2, 0)).toBe(0);
        });

        test('horse gives extra forest fights', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    bank: 100,
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: true,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                    forest_fights: 0,
                },
            });

            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            // 15 base fights + floor(15/4) = 15 + 3 = 18
            expect(harness.player!.forest_fights).toBe(18);
        });

        test('kids give extra forest fights', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    bank: 100,
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 3,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 0,
                    forest_fights: 0,
                },
            });

            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            // 15 base + 3 from kids = 18
            expect(harness.player!.forest_fights).toBe(18);
        });

        test('uses configured Death Knight divisor during wakeUp recalculation', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 1,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 12,
                    skillm: 0,
                    skillt: 0,
                },
            });
            harness.context.settings.death_knight_use_point_divisor = 6;
            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            expect(harness.player!.levelw).toBe(3);
            expect(harness.outputContains('Remember, 6 Skill Points = 1 Use Point')).toBe(true);
        });

        test('uses configured thief divisor during wakeUp recalculation', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    hp: 100,
                    hp_max: 100,
                    level: 1,
                    clss: 3,
                    sex: 'M',
                    dead: false,
                    gone: 0,
                    horse: false,
                    laid: 0,
                    kids: 0,
                    inn: false,
                    exp: 100,
                    weapon: 'Stick',
                    skillw: 0,
                    skillm: 0,
                    skillt: 12,
                },
            });
            harness.context.settings.thief_use_point_divisor = 6;
            harness.context.marriage.haveBaby = jest.fn();
            harness.context.marriage.checkMarriage = jest.fn();

            await harness.context.redDragonInn.wakeUp();

            expect(harness.player!.levelt).toBe(3);
            expect(harness.outputContains('Remember, 6 Skill Points = 1 Use Point')).toBe(true);
        });
    });
});
