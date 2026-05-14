/**
 * Town Menu - Integration tests
 *
 * Tests the main game loop (town square) dispatch. Each key in the
 * town menu routes to a feature - we verify the correct feature is
 * invoked and that the loop handles quit/dead states correctly.
 */

import { TestHarness } from '../harness';

describe('Town Menu (Game.town)', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    test('V - View Stats is invoked', async () => {
        harness = TestHarness.create();
        // V to view stats, then Q + Y to quit
        harness.queueKeys('V', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.io.showStats).toHaveBeenCalled();
    });

    test('D - Daily Log is shown', async () => {
        harness = TestHarness.create();
        harness.queueKeys('D', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.log.showLog).toHaveBeenCalled();
    });

    test('F - Forest is entered', async () => {
        harness = TestHarness.create();
        harness.context.forest.run = jest.fn();
        harness.queueKeys('F', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.forest.run).toHaveBeenCalled();
    });

    test('F - Player death in forest ends loop', async () => {
        harness = TestHarness.create();
        harness.context.forest.run = jest.fn().mockImplementation(() => {
            harness.player!.dead = true;
        });
        harness.queueKeys('F');
        await harness.context.game.town.run();

        // Loop should exit because player is dead
        expect(harness.context.forest.run).toHaveBeenCalled();
    });

    test('K - King Arthurs is entered', async () => {
        harness = TestHarness.create();
        harness.context.kingArthurs.run = jest.fn();
        harness.queueKeys('K', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.kingArthurs.run).toHaveBeenCalled();
    });

    test('A - Abduls Armour is entered', async () => {
        harness = TestHarness.create();
        harness.context.abdulsArmour.run = jest.fn();
        harness.queueKeys('A', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.abdulsArmour.run).toHaveBeenCalled();
    });

    test('H - Healers is entered', async () => {
        harness = TestHarness.create();
        harness.context.healers.run = jest.fn();
        harness.queueKeys('H', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.healers.run).toHaveBeenCalled();
    });

    test('I - Red Dragon Inn is entered', async () => {
        harness = TestHarness.create();
        harness.context.redDragonInn.run = jest.fn();
        harness.queueKeys('I', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.redDragonInn.run).toHaveBeenCalled();
    });

    test('I - Inn causes quit when player sleeps at inn', async () => {
        harness = TestHarness.create();
        harness.context.redDragonInn.run = jest.fn().mockImplementation(() => {
            harness.player!.inn = true;
        });
        harness.queueKeys('I');
        await harness.context.game.town.run();

        expect(harness.context.redDragonInn.run).toHaveBeenCalled();
    });

    test('T - Turgons is entered', async () => {
        harness = TestHarness.create();
        harness.context.turgons.run = jest.fn();
        harness.queueKeys('T', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.turgons.run).toHaveBeenCalled();
    });

    test('Y - Bank is entered', async () => {
        harness = TestHarness.create();
        harness.context.bank.run = jest.fn();
        harness.queueKeys('Y', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.bank.run).toHaveBeenCalled();
    });

    test('S - Slaughter others is entered', async () => {
        harness = TestHarness.create();
        harness.context.battle.slaughterOthers = jest.fn();
        harness.queueKeys('S', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.battle.slaughterOthers).toHaveBeenCalled();
    });

    test('W - Write mail is entered', async () => {
        harness = TestHarness.create();
        harness.queueKeys('W', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.mail.composeMail).toHaveBeenCalled();
    });

    test('L - List players is shown', async () => {
        harness = TestHarness.create();
        harness.queueKeys('L', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.rankings.listPlayers).toHaveBeenCalled();
    });

    test('C - Conjugality list is shown', async () => {
        harness = TestHarness.create();
        harness.context.marriage.conjugalityList = jest.fn();
        harness.queueKeys('C', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.marriage.conjugalityList).toHaveBeenCalled();
    });

    test('O - Other places menu shows and Q exits', async () => {
        harness = TestHarness.create();
        harness.queueKeys('O', 'Q', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.igm.createOtherPlaces).toHaveBeenCalled();
    });

    test('X - Toggle expert mode', async () => {
        harness = TestHarness.create();
        harness.player!.expert = false;
        harness.queueKeys('X', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.outputContains('EXPERT MODE ON')).toBe(true);
    });

    test('X - Toggle expert mode off', async () => {
        harness = TestHarness.create();
        harness.player!.expert = true;
        harness.queueKeys('X', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.outputContains('EXPERT MODE OFF')).toBe(true);
    });

    test('M - Announcements is shown', async () => {
        harness = TestHarness.create();
        harness.queueKeys('M', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.io.announce).toHaveBeenCalled();
    });

    test('P - Players online is shown', async () => {
        harness = TestHarness.create();
        harness.queueKeys('P', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.io.warriorsOnNow).toHaveBeenCalled();
    });

    test('Q then N does not quit', async () => {
        harness = TestHarness.create();
        // Q then N (don't quit), then Q then Y (do quit)
        harness.queueKeys('Q', 'N', 'Q', 'Y');
        await expect(harness.runUntilExit(() => harness.context.game.town.run())).resolves.toBeUndefined();

        // runUntilExit completing confirms the game eventually exited (after the second Q+Y)
    });

    test('? shows menu', async () => {
        harness = TestHarness.create();
        harness.queueKeys('?', 'Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.io.showTxt).toHaveBeenCalledWith('MAIN');
    });

    test('player at inn starts at Red Dragon Inn', async () => {
        harness = TestHarness.create();
        harness.player!.inn = true;
        // RedDragonInn.run sets inn to false so main loop continues
        harness.context.redDragonInn.run = jest.fn().mockImplementation(() => {
            harness.player!.inn = false;
        });
        harness.queueKeys('Q', 'Y');
        await harness.runUntilExit(() => harness.context.game.town.run());

        expect(harness.context.redDragonInn.run).toHaveBeenCalled();
    });
});
