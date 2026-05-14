/**
 * Bard - Seth Able the Bard feature tests
 *
 * Tests the bard interaction menu: song request, flirting,
 * navigation, and flirt restrictions.
 */

import { TestHarness } from '../harness';

describe('Bard', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('talkToBard()', () => {
        test('R exits the bard conversation', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.queueKeys('R');
            await harness.context.bard.talkToBard();
        });

        test('Q exits the bard conversation', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.queueKeys('Q');
            await harness.context.bard.talkToBard();
        });

        test('Enter exits the bard conversation', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.queueKeys('\r');
            await harness.context.bard.talkToBard();
        });

        test('? re-shows the bard menu', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.queueKeys('?', 'R');
            await harness.context.bard.talkToBard();
        });

        test('A requests a bard song', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', seen_bard: false },
            });

            // Stub bardSong to avoid full complex flow
            harness.context.bard.bardSong = jest.fn().mockResolvedValue(undefined);

            harness.queueKeys('A', 'R');
            await harness.context.bard.talkToBard();

            expect(harness.context.bard.bardSong).toHaveBeenCalled();
        });

        test('F as male says "rather flirt with Violet"', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.queueKeys('F', 'R');
            await harness.context.bard.talkToBard();

            expect(harness.outputContains('Violet')).toBe(true);
        });

        test('F as unmarried female when seth is single enters singleSeth', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    sex: 'F',
                    married_to: -1,
                    cha: 50,
                    seen_violet: false,
                    innSession: { talkedToBartender: true },
                },
            });

            // Set state so seth is not married
            harness.context.state!['married_to_seth'] = -1;

            // Stub singleSeth to avoid complex dialog
            harness.context.bard.singleSeth = jest.fn().mockResolvedValue(undefined);

            harness.queueKeys('F', 'R');
            await harness.context.bard.talkToBard();

            expect(harness.context.bard.singleSeth).toHaveBeenCalled();
        });

        test('F as married female when seth is married to her shows love response', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    sex: 'F',
                    Record: 0,
                    seen_violet: false,
                },
            });

            // Override getState to set married_to_seth to this player
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                harness.context.state!['married_to_seth'] = 0;
                harness.context.state!['married_to_violet'] = -1;
            });

            harness.queueKeys('F', 'R');
            await harness.context.bard.talkToBard();

            // Should get one of the married responses
            expect(harness.player!.seen_violet).toBe(true);
        });

        test('shows "lovingly" when married to seth', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', Record: 0 },
            });

            // Override getState to set married_to_seth to this player
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                harness.context.state!['married_to_seth'] = 0;
                harness.context.state!['married_to_violet'] = -1;
            });

            harness.queueKeys('R');
            await harness.context.bard.talkToBard();

            expect(harness.outputContains('lovingly')).toBe(true);
        });

        test('shows "expectantly" when not married to seth', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' },
            });

            harness.context.state!['married_to_seth'] = -1;

            harness.queueKeys('R');
            await harness.context.bard.talkToBard();

            expect(harness.outputContains('expectantly')).toBe(true);
        });
    });

    describe('bardSong() - RIP mode "throat too dry" message', () => {
        test('non-RIP mode: outputs single-line "Perhaps tomorrow." message', async () => {
            harness = TestHarness.create({
                rip: false,
                playerOverrides: { seen_bard: true },
            });

            await harness.context.bard.bardSong();

            // Non-RIP: both words on the same line (no \r\n between Perhaps and tomorrow)
            expect(harness.outputContains(
                '"I\'m sorry, but my throat is too dry..  Perhaps tomorrow."',
            )).toBe(true);
        });

        test('RIP mode: splits "throat too dry" across two lines', async () => {
            harness = TestHarness.create({
                rip: true,
                playerOverrides: { seen_bard: true },
            });

            await harness.context.bard.bardSong();

            // RIP: "tomorrow." appears (on the second @writeln line)
            expect(harness.outputContains('tomorrow."')).toBe(true);
            // RIP: the two words are NOT on the same line
            expect(harness.outputContains(
                '"I\'m sorry, but my throat is too dry..  Perhaps tomorrow."',
            )).toBe(false);
        });

        test('RIP mode: does NOT output the single-line combined version', async () => {
            harness = TestHarness.create({
                rip: true,
                playerOverrides: { seen_bard: true },
            });

            await harness.context.bard.bardSong();

            expect(harness.outputContains(
                '"I\'m sorry, but my throat is too dry..  Perhaps tomorrow."',
            )).toBe(false);
        });
    });

    describe('singleSeth() - direct tests', () => {
        test('R exits singleSeth', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 10 },
            });
            harness.queueKeys('R');
            await harness.context.bard.singleSeth();
        });

        test('W (wink) with cha >= 1 gives experience', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 5, level: 2, exp: 0 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            // 'W' triggers wink(); '\r' is consumed by more(); seen_violet=true exits loop
            harness.queueKeys('W', '\r');
            await harness.context.bard.singleSeth();

            // With cha >= 1: earns level*5 exp = 10 exp
            expect(harness.player!.exp).toBeGreaterThan(0);
            expect(harness.outputContains('He blushes')).toBe(true);
        });

        test('W (wink) with cha 0 loses HP', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 0, level: 2, hp: 100 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('W', '\r');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('looks the other way')).toBe(true);
        });

        test('F (flutter) with cha >= 2 gives experience', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 5, level: 3, exp: 0 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('F', '\r');
            await harness.context.bard.singleSeth();

            // level*10 = 30 exp
            expect(harness.player!.exp).toBeGreaterThan(0);
            expect(harness.outputContains('smiles broadly')).toBe(true);
        });

        test('F (flutter) with cha 0 damages player', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 0, hp: 100, level: 3 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('F', '\r');
            await harness.context.bard.singleSeth();

            // HP should go down (loses level HP points)
            expect(harness.outputContains("doesn't seem interested")).toBe(true);
        });

        test('D (drop hanky) with cha >= 4 gives experience', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 10, level: 2, exp: 0 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('D', '\r');
            await harness.context.bard.singleSeth();

            // level*20 = 40 exp
            expect(harness.player!.exp).toBeGreaterThan(0);
            expect(harness.outputContains('picks it up')).toBe(true);
        });

        test('D (drop hanky) with low cha damages player', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 1, hp: 100, level: 2 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('D', '\r');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('ignores your plea')).toBe(true);
        });

        test('A (ask drink) with cha >= 8 gives experience', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 10, level: 2, exp: 0 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('A', '\r');
            await harness.context.bard.singleSeth();

            // level*30 = 60 exp
            expect(harness.player!.exp).toBeGreaterThan(0);
            expect(harness.outputContains('most expensive drink')).toBe(true);
        });

        test('A (ask drink) with low cha damages player', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 2, hp: 100, level: 2 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('A', '\r');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('mumbles a lame excuse')).toBe(true);
        });

        test('K (kiss) with cha >= 16 gives experience', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 20, level: 2, exp: 0 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('K', '\r');
            await harness.context.bard.singleSeth();

            // level*40 = 80 exp
            expect(harness.player!.exp).toBeGreaterThan(0);
            expect(harness.outputContains("doesn't object")).toBe(true);
        });

        test('K (kiss) with low cha damages player', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 5, hp: 200, level: 2 },
            });
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('K', '\r');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('pushes your face away')).toBe(true);
        });

        test('C (seduce) with clean_mode=true shows disabled message', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 50 },
            });
            harness.context.settings.clean_mode = true;

            harness.queueKeys('C', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('sysop has disabled')).toBe(true);
        });

        test('C (seduce) married player gets called harlot', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 50, married_to: 1 },
            });
            harness.context.settings.clean_mode = false;
            jest.spyOn(harness.context.io, 'mswait').mockResolvedValue(undefined);

            harness.queueKeys('C', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('appalled')).toBe(true);
        });

        test('M (marriage) with cha < 10 gets rejection', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 5, married_to: -1, divorced: false, Record: 0 },
            });
            harness.context.state!.married_to_violet = -1;

            harness.queueKeys('M', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('will not consider it')).toBe(true);
        });

        test('M (marriage) divorced player cannot remarry', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 100, married_to: -1, divorced: true, Record: 0 },
            });

            harness.queueKeys('M', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('moving to quickly')).toBe(true);
        });

        test('M (marriage) shows "already married" when married to another', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 100, married_to: 1, divorced: false, Record: 0 },
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn()
                .mockReturnValue({ name: 'OtherPlayer', sex: 'M', Record: 1 });

            harness.queueKeys('M', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('doubt you husband')).toBe(true);
        });

        test('M (marriage) shows "already married to violet" message', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 100, married_to: -1, divorced: false, Record: 0 },
            });
            harness.context.state!.married_to_violet = 0;  // Player is married to violet

            harness.queueKeys('M', 'R');
            await harness.context.bard.singleSeth();

            expect(harness.outputContains('wife')).toBe(true);
        });

        test('? shows menu again', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 10 },
            });
            harness.queueKeys('?', 'R');
            await harness.context.bard.singleSeth();
        });

        test('N exits singleSeth', async () => {
            expect.assertions(0);
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', cha: 5 },
            });
            harness.queueKeys('N');
            await harness.context.bard.singleSeth();
        });
    });
});
