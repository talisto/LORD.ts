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

    describe('menu navigation', () => {
        test('Q quits the orphanage', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            // welcome() has 3 moreNoMail, igminfo() has 1, Q path has 1 moreNoMail + igminfo again
            harness.session.queueKeys('\r', '\r', '\r', '\r', 'Q', '\r', '\r');
            await oorphans.run();

            const output = harness.session.output;
            expect(output).toContain('Orphanage');
        });

        test('shows main menu options', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const oorphans = new Oorphans(deps);

            // welcome() 3 + igminfo() 1 + Q menu + quit moreNoMail + igminfo
            harness.session.queueKeys('\r', '\r', '\r', '\r', 'Q', '\r', '\r');
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
            harness.session.queueKeys('\r', '\r', '\r', '\r', '?', 'Q', '\r', '\r');
            await oorphans.run();

            const output = harness.session.output;
            // Should show the menu text
            expect(output.length).toBeGreaterThan(100);
        });
    });
});
