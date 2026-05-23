/**
 * Oorphans IGM - Functional Tests
 */

import { TestHarness } from '../../harness';
import Oorphans from '@lordts/igm-oorphans/oorphans';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import path from 'path';

describe('Oorphans IGM', () => {
    let harness: TestHarness;

    afterEach(() => {
        if (harness) {
            harness.cleanup();
        }
    });

    function createDeps(harness: TestHarness): IgmDeps {
        return {
            io: harness.context.io,
            player: harness.context.player!,
            state: harness.context.state!,
            fileUtils: harness.context.fileUtils,
            storage: harness.context.storage,
            settings: harness.context.settings,
            srcDir: path.join(__dirname, '../../../igm/oorphans'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    function queueIntroKeys(): void {
        harness.session.queueKeys('\r', '\r', '\r', '\r');
    }

    describe('menu navigation', () => {
        test('Q quits the orphanage', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            // welcome() has 3 moreNoMail, igminfo() has 1, Q path has 1 moreNoMail + igminfo again
            queueIntroKeys();
            harness.session.queueKeys('Q', '\r', '\r');
            await oorphans.run();

            const output = harness.session.output;
            expect(output).toContain('Orphanage');
        });

        test('shows main menu options', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            // welcome() 3 + igminfo() 1 + Q menu + quit moreNoMail + igminfo
            queueIntroKeys();
            harness.session.queueKeys('Q', '\r', '\r');
            await oorphans.run();

            const output = harness.session.output;
            // Verify menu options appear
            expect(output).toContain('dopt');
        });

        test('? redisplays menu', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            // welcome(3) + igminfo(1) + ? + Q + quit moreNoMail + igminfo
            queueIntroKeys();
            harness.session.queueKeys('?', 'Q', '\r', '\r');
            await oorphans.run();

            const output = harness.session.output;
            // Should show the menu text
            expect(output.length).toBeGreaterThan(100);
        });
    });

    describe('economy rebalance', () => {
        test('adoption price doubles for each child already owned', async () => {
            harness = TestHarness.create();
            harness.context.player!.level = 2;
            harness.context.player!.kids = 3;

            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            queueIntroKeys();
            harness.session.queueKeys('A', '\r', 'N', 'Q', '\r', '\r');
            await oorphans.run();

            expect(harness.session.output).toContain('32,000 gold');
            expect(harness.context.player!.kids).toBe(3);
        });

        test('refuses adoptions once the household limit is reached', async () => {
            harness = TestHarness.create();
            harness.context.player!.kids = 12;

            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            queueIntroKeys();
            harness.session.queueKeys('A', '\r', 'Q', '\r', '\r');
            await oorphans.run();

            expect(harness.context.player!.kids).toBe(12);
            expect(harness.session.output).toContain('No more, nit!');
        });

        test('selling a child uses the fixed low resale value', async () => {
            harness = TestHarness.create();
            harness.context.player!.level = 10;
            harness.context.player!.kids = 2;
            harness.context.player!.gold = 1000;

            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            queueIntroKeys();
            harness.session.queueKeys('G', 'Y', '\r', 'Q', '\r', '\r');
            await oorphans.run();

            expect(harness.context.player!.kids).toBe(1);
            expect(harness.context.player!.gold).toBe(1250);
            expect(harness.session.output).toContain('250');
        });

        test('successful feral catches do not add more children once you already have one', async () => {
            harness = TestHarness.create();
            harness.context.player!.kids = 1;
            harness.rng.queueRandomValues([0, 0, 1]);

            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            queueIntroKeys();
            harness.session.queueKeys('C', '\r', '\r', '\r', 'Q', '\r', '\r');
            await oorphans.run();

            expect(harness.context.player!.kids).toBe(1);
            expect(harness.session.output).toContain('One at a time, nit!');
        });
    });
});
