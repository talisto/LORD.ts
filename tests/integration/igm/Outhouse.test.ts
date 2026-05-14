/**
 * Outhouse IGM - Functional Tests
 */

import { TestHarness } from '../../harness';
import Outhouse from '@lordts/igm-outhouse/outhouse';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import path from 'path';

describe('Outhouse IGM', () => {
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
            srcDir: path.join(__dirname, '../../../igm/outhouse'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    describe('menu navigation', () => {
        test('L exits the outhouse', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const outhouse = new Outhouse(deps);

            // Queue: L to leave, Y to confirm quit, press key for "run back" message
            harness.session.queueKeys('L', 'Y', '\r');
            await outhouse.run();

            const output = harness.session.output;
            expect(output).toContain('Outhouse');
        });

        test('R shows the intro/sign', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const outhouse = new Outhouse(deps);

            // Queue: R to read sign, press key for intro, L to leave, Y to confirm, press key for "run back"
            harness.session.queueKeys('R', '\r', 'L', 'Y', '\r');
            await outhouse.run();

            const output = harness.session.output;
            expect(output).toContain('Lloyd Hannesson');
        });

        test('V shows player stats', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const outhouse = new Outhouse(deps);

            // Queue: V to view stats, L to leave, Y to confirm, press key for "run back"
            harness.session.queueKeys('V', 'L', 'Y', '\r');
            await outhouse.run();

            // showStats is called through io which is mocked in tests
            expect(harness.context.io.showStats).toHaveBeenCalled();
        });
    });

    describe('already done business today', () => {
        test('exits early if already used the outhouse', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const outhouse = new Outhouse(deps);

            // First visit - do business (W = wait in line)
            harness.session.queueKeys('W', '\r');
            await outhouse.run();

            // Second visit - should say already done
            harness.session.clearOutput();
            const outhouse2 = new Outhouse(deps);
            harness.session.queueKeys('\r');
            await outhouse2.run();

            const output = harness.session.output;
            expect(output).toContain('turn around and head back to town');
        });
    });
});

