/**
 * Marriage - Feature tests
 *
 * Tests the marriage system: divorce, violet/seth marriage daily events,
 * haveBaby, checkMarriage, flirtWithViolet, romance, conjugalityList.
 */

import { TestHarness, makeDefaultPlayerRecord } from '../harness';
import { HiddenPlayerPolicy } from '@lordts/core/HiddenPlayerPolicy';

describe('Marriage', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('divorceSeth()', () => {
        test('sets married_to_seth to -1', () => {
            harness = TestHarness.create();
            harness.context.state!.married_to_seth = 0;

            harness.context.marriage.divorceSeth();

            expect(harness.context.state!.married_to_seth).toBe(-1);
        });

        test('produces no display output', () => {
            harness = TestHarness.create();
            harness.context.state!.married_to_seth = 0;

            harness.context.marriage.divorceSeth();

            // divorceSeth only sets state, no sln/lln calls
            expect(harness.output).toBe('');
        });
    });

    describe('divorceViolet()', () => {
        test('sets married_to_violet to -1', () => {
            harness = TestHarness.create();
            harness.context.state!.married_to_violet = 0;

            harness.context.marriage.divorceViolet();

            expect(harness.context.state!.married_to_violet).toBe(-1);
        });

        test('produces no display output', () => {
            harness = TestHarness.create();
            harness.context.state!.married_to_violet = 0;

            harness.context.marriage.divorceViolet();

            expect(harness.output).toBe('');
        });
    });

    describe('violetMarriage()', () => {
        test('sends mail to husband on non-divorce event', async () => {
            harness = TestHarness.create();
            const husband = makeDefaultPlayerRecord({
                name: 'HusbandGuy', Record: 2, level: 5, cha: 50
            });
            harness.context.state!.married_to_violet = 2;
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(husband);
            // Force non-divorce path (random(5) >= 1)
            harness.rng.queueRandomValues([0.5, 0.0]); // random(5)=2, random(4)=0

            await harness.context.marriage.violetMarriage();

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                2, expect.stringContaining('Violet')
            );
            expect(harness.context.log.logLine).toHaveBeenCalled();
        });

        test('divorces when random(5) < 1 and halves charm', async () => {
            harness = TestHarness.create();
            const husband = makeDefaultPlayerRecord({
                name: 'HusbandGuy', Record: 2, level: 5, cha: 50
            });
            harness.context.state!.married_to_violet = 2;
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(husband);
            // Force divorce path: random(5)=0
            harness.rng.queueRandomValues([0.0, 0.0]); // random(5)=0, random(3)=0

            await harness.context.marriage.violetMarriage();

            expect(harness.context.state!.married_to_violet).toBe(-1);
            expect(husband.cha).toBe(25); // halved from 50
            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                2, expect.stringContaining('CHARM DROPS TO')
            );
        });
    });

    describe('sethMarriage()', () => {
        test('sends mail to wife on non-divorce event', async () => {
            harness = TestHarness.create();
            const wife = makeDefaultPlayerRecord({
                name: 'WifeGal', Record: 3, level: 5, cha: 40
            });
            harness.context.state!.married_to_seth = 3;
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(wife);
            harness.rng.queueRandomValues([0.5, 0.0]); // random(5)=2, random(4)=0

            await harness.context.marriage.sethMarriage();

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                3, expect.stringContaining('Seth Able')
            );
            expect(harness.context.log.logLine).toHaveBeenCalled();
        });

        test('divorces when random(5) < 1 and halves charm', async () => {
            harness = TestHarness.create();
            const wife = makeDefaultPlayerRecord({
                name: 'WifeGal', Record: 3, level: 5, cha: 40
            });
            harness.context.state!.married_to_seth = 3;
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(wife);
            harness.rng.queueRandomValues([0.0, 0.0]); // random(5)=0, random(3)=0

            await harness.context.marriage.sethMarriage();

            expect(harness.context.state!.married_to_seth).toBe(-1);
            expect(wife.cha).toBe(20); // halved from 40
            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                3, expect.stringContaining('CHARM DROPS TO')
            );
        });
    });

    describe('romance()', () => {
        test('sends romantic mail when input is long enough', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', Record: 0, name: 'TestHero' },
            });
            // Queue a long enough romance line (> 4 chars after cleanStr)
            // getstr reads one queue entry, so queue as a single string
            harness.queueKeys('I love you so much');
            harness.rng.queueRandomValues([0]); // picks first option from mopts

            const result = await harness.context.marriage.romance(
                'Say something: ',
                ['my sweet love'],
                ['my sweet love'],
                5, 'Too short!',
                '  `2A romantic message arrives!',
                'F'
            );

            expect(result).toBe(true);
            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                5, expect.stringContaining('Romantic Message From')
            );
            expect(harness.outputContains('WRITING ROMANTIC MAIL')).toBe(true);
        });

        test('returns false when input is too short', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', Record: 0 },
            });
            // Queue a short line (< 5 chars)
            harness.queueString('hi\r');
            harness.rng.queueRandomValues([0]); // random for mopts/fopts

            const result = await harness.context.marriage.romance(
                'Say something: ',
                ['default line'],
                ['default line'],
                5, 'Too short bud!',
                '  romantic mail body',
                'F'
            );

            expect(result).toBe(false);
            expect(harness.outputContains('Too short bud!')).toBe(true);
        });
    });

    describe('haveBaby()', () => {
        test('stillbirth when random(20)+1 === 20', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', kids: 0, married_to: -1 },
            });
            // random(20) must return 19, so n = 20 (stillborn)
            harness.rng.queueRandomValues([19]);
            harness.queueKeys('\r', '\r', '\r', '\r'); // moreNoMail calls

            await harness.context.marriage.haveBaby();

            expect(harness.player!.kids).toBe(0);
            expect(harness.outputContains('Not breathing')).toBe(true);
            expect(harness.outputContains('Live is precious')).toBe(true);
        });

        test('baby boy when n < 10 and prompts for name', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', kids: 0, married_to: -1 },
            });
            // random(20) must return 0, so n = 1 (boy)
            harness.rng.queueRandomValues([0]);
            harness.queueKeys('\r', '\r', '\r', '\r'); // moreNoMail calls
            harness.queueString('Bobby\r');

            await harness.context.marriage.haveBaby();

            expect(harness.player!.kids).toBe(1);
            expect(harness.outputContains('baby boy')).toBe(true);
            expect(harness.context.log.logLine).toHaveBeenCalledWith(
                expect.stringContaining('birth to a boy')
            );
        });

        test('baby girl when n >= 10 and n < 20', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', kids: 0, married_to: -1 },
            });
            // random(20) must return 10, so n = 11 (girl)
            harness.rng.queueRandomValues([10]);
            harness.queueKeys('\r', '\r', '\r', '\r'); // moreNoMail calls
            harness.queueString('Sally\r');

            await harness.context.marriage.haveBaby();

            expect(harness.player!.kids).toBe(1);
            expect(harness.outputContains('baby girl')).toBe(true);
            expect(harness.outputContains('heartbreaker')).toBe(true);
        });

        test('sends mail to husband when married and baby boy', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F', kids: 0, married_to: 3 },
            });
            const husband = makeDefaultPlayerRecord({
                name: 'HusbandGuy', Record: 3,
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(husband);

            harness.rng.queueRandomValues([0]); // n=1 (boy)
            harness.queueKeys('\r', '\r', '\r', '\r');
            harness.queueString('Junior\r');

            await harness.context.marriage.haveBaby();

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                3, expect.stringContaining('JOYOUS OCCASION')
            );
        });
    });

    describe('checkMarriage()', () => {
        test('returns early if married to seth', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, married_to: 5 },
            });
            harness.context.state!.married_to_seth = 0;

            await harness.context.marriage.checkMarriage();

            // No output because early return
            expect(harness.output).toBe('');
        });

        test('returns early if married to violet', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, married_to: 5 },
            });
            harness.context.state!.married_to_violet = 0;

            await harness.context.marriage.checkMarriage();

            expect(harness.output).toBe('');
        });

        test('returns early if not married', async () => {
            harness = TestHarness.create({
                playerOverrides: { married_to: -1 },
            });

            await harness.context.marriage.checkMarriage();

            expect(harness.output).toBe('');
        });

        test('handles missing spouse (name === X)', async () => {
            harness = TestHarness.create({
                playerOverrides: { married_to: 5, cha: 100, Record: 0 },
            });
            // playerGet for record 5 returns name 'X' by default
            harness.queueKeys('\r'); // moreNoMail

            await harness.context.marriage.checkMarriage();

            expect(harness.outputContains('MISSING')).toBe(true);
            expect(harness.player!.married_to).toBe(-1);
            expect(harness.player!.cha).toBe(50); // halved
        });

        test('treats a hidden spouse as missing without breaking the marriage', async () => {
            harness = TestHarness.create({
                playerOverrides: { married_to: 5, cha: 100, Record: 0 },
            });
            const spouse = makeDefaultPlayerRecord({ name: 'HiddenSpouse', Record: 5, sex: 'F' });

            HiddenPlayerPolicy.hidePlayer(harness.context.storage, 5, 10, 'inactive');
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(spouse);
            harness.queueKeys('\r');

            await harness.context.marriage.checkMarriage();

            expect(harness.outputContains('MISSING')).toBe(true);
            expect(harness.player!.married_to).toBe(5);
            expect(harness.player!.cha).toBe(100);
        });

        test('happy mood choice keeps marriage intact', async () => {
            harness = TestHarness.create({
                playerOverrides: { married_to: 5, sex: 'M', Record: 0 },
            });
            const spouse = makeDefaultPlayerRecord({
                name: 'SpouseGal', Record: 5, sex: 'F'
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(spouse);
            harness.rng.queueRandomValues([0.0, 0.0]); // random picks for mood arrays
            harness.queueKeys('1'); // Choose happy mood

            await harness.context.marriage.checkMarriage();

            expect(harness.outputContains('Life is good')).toBe(true);
            expect(harness.player!.married_to).toBe(5);
        });

        test('angry mood triggers divorce', async () => {
            harness = TestHarness.create({
                playerOverrides: { married_to: 5, sex: 'M', cha: 100, Record: 0 },
            });
            const spouse = makeDefaultPlayerRecord({
                name: 'SpouseGal', Record: 5, sex: 'F'
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(spouse);
            harness.rng.queueRandomValues([0.0, 0.0]);
            harness.queueKeys('2', '\r'); // Choose angry mood + moreNoMail

            await harness.context.marriage.checkMarriage();

            expect(harness.outputContains('FED UP WITH WOMEN')).toBe(true);
            expect(harness.player!.married_to).toBe(-1);
            expect(harness.player!.divorced).toBe(true);
            expect(harness.player!.cha).toBe(50); // halved from 100
            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                5, expect.stringContaining('DIVORCED')
            );
        });
    });

    describe('flirtWithViolet()', () => {
        test('female players are told to flirt with seth', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'F' },
            });

            const result = await harness.context.violet.flirtWithViolet();

            expect(result).toBe(true);
            expect(harness.outputContains('Seth Able')).toBe(true);
        });

        test('when violet is married and seen_violet: shows Grizelda warning', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', seen_violet: true },
            });
            // Override getState mock to preserve married_to_violet
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                harness.context.state!.married_to_violet = 5;
            });
            harness.context.state!.married_to_violet = 5;

            harness.queueKeys('\r'); // more()

            const result = await harness.context.violet.flirtWithViolet();

            expect(result).toBe(true);
            expect(harness.outputContains('Grizelda')).toBe(true);
        });

        test('when violet is married and not seen_violet: introduces Grizelda', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', seen_violet: false },
            });
            // Override getState mock to preserve married_to_violet
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                harness.context.state!.married_to_violet = 5;
            });
            harness.context.state!.married_to_violet = 5;
            const marriedTo = makeDefaultPlayerRecord({ name: 'SomeGuy', Record: 5 });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(marriedTo);

            harness.queueKeys('\r'); // more()

            const result = await harness.context.violet.flirtWithViolet();

            expect(result).toBe(true);
            expect(harness.outputContains('LUMPS OF CELLULITE')).toBe(true);
            expect(harness.player!.seen_violet).toBe(true);
        });

        test('when seen_violet and violet is single: says maybe tomorrow', async () => {
            harness = TestHarness.create({
                playerOverrides: { sex: 'M', seen_violet: true },
            });
            harness.context.state!.married_to_violet = -1;

            const result = await harness.context.violet.flirtWithViolet();

            expect(result).toBe(false);
            expect(harness.outputContains('maybe tomorrow')).toBe(true);
        });
    });

    describe('conjugalityList()', () => {
        test('shows no married message when nobody is married', async () => {
            harness = TestHarness.create();
            (harness.context.player as unknown as Record<string, unknown>).allPlayers = jest.fn().mockReturnValue([
                makeDefaultPlayerRecord({ name: 'Hero', Record: 0, married_to: -1 }),
            ]);
            harness.queueKeys('\r'); // moreNoMail

            await harness.context.marriage.conjugalityList();

            expect(harness.outputContains('CONJUGALITY LIST')).toBe(true);
            expect(harness.outputContains('No one is married')).toBe(true);
        });

        test('shows married couples with phrases', async () => {
            harness = TestHarness.create();
            const p1 = makeDefaultPlayerRecord({ name: 'Romeo', Record: 0, married_to: 1 });
            const p2 = makeDefaultPlayerRecord({ name: 'Juliet', Record: 1, married_to: 0 });
            (harness.context.player as unknown as Record<string, unknown>).allPlayers = jest.fn().mockReturnValue([p1, p2]);
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(p2);
            harness.queueKeys('\r'); // moreNoMail

            await harness.context.marriage.conjugalityList();

            expect(harness.outputContains('Romeo')).toBe(true);
            expect(harness.outputContains('Juliet')).toBe(true);
        });

        test('shows NPC marriages for seth and violet', async () => {
            harness = TestHarness.create();
            const p1 = makeDefaultPlayerRecord({ name: 'SethWife', Record: 0, married_to: -1 });
            const p2 = makeDefaultPlayerRecord({ name: 'VioletHub', Record: 1, married_to: -1 });
            (harness.context.player as unknown as Record<string, unknown>).allPlayers = jest.fn().mockReturnValue([p1, p2]);
            // Override getState mock to preserve NPC marriage values
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                harness.context.state!.married_to_seth = 0;
                harness.context.state!.married_to_violet = 1;
            });
            harness.context.state!.married_to_seth = 0;
            harness.context.state!.married_to_violet = 1;
            harness.queueKeys('\r'); // moreNoMail

            await harness.context.marriage.conjugalityList();

            expect(harness.outputContains('Seth Able')).toBe(true);
            expect(harness.outputContains('Violet')).toBe(true);
        });
    });

    describe('handleMarryConfirm()', () => {
        test('sets married_to when partner record matches', () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, married_to: -1 },
            });
            const clearQuoteSpy = jest.spyOn(harness.context.storage, 'clearQuoteBuffer');
            const partner = makeDefaultPlayerRecord({
                name: 'Partner', Record: 3, married_to: 0,
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(partner);

            harness.context.marriage.handleMarryConfirm(3);

            expect(harness.player!.married_to).toBe(3);
            expect(harness.player!.put).toHaveBeenCalled();
            expect(clearQuoteSpy).toHaveBeenCalled();
        });

        test('does not set married_to when partner record does not match', () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, married_to: -1 },
            });
            const clearQuoteSpy = jest.spyOn(harness.context.storage, 'clearQuoteBuffer');
            const partner = makeDefaultPlayerRecord({
                name: 'Partner', Record: 3, married_to: 7, // married to someone else
            });
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(partner);

            harness.context.marriage.handleMarryConfirm(3);

            expect(harness.player!.married_to).toBe(-1);
            expect(clearQuoteSpy).toHaveBeenCalled();
        });
    });
});
