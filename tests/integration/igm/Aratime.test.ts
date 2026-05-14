/**
 * Aratime IGM - Functional Tests
 */

import { TestHarness } from '../../harness';
import Aratime from '@lordts/igm-aratime/aratime';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import path from 'path';

describe('Aratime IGM', () => {
    let harness: TestHarness;

    afterEach(() => {
        if (harness) {
            harness.cleanup();
        }
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    function createDeps(harness: TestHarness): IgmDeps {
        return {
            io: harness.context.io,
            player: harness.context.player!,
            state: harness.context.state!,
            fileUtils: harness.context.fileUtils,
            storage: harness.context.storage,
            settings: harness.context.settings,
            srcDir: path.join(__dirname, '../../../igm/aratime'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    describe('basic functionality', () => {
        test('can enter and run aratime', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const aratime = new Aratime(deps);

            harness.queueKeys('N');
            await aratime.run();

            const output = harness.session.output;
            expect(output.length).toBeGreaterThan(0);
            expect(harness.session.outputContains('You turn, and run back to the realm.')).toBe(true);
        });

        test('only allows one visit per calendar day', async () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-14T12:00:00Z'));

            harness = TestHarness.create();
            harness.setPlayerProps({ gold: 100 });

            const deps = createDeps(harness);
            const aratime = new Aratime(deps);

            harness.queueKeys('Y', 'Y', '10');
            await aratime.run();

            harness.session.clearOutput();
            harness.queueKeys('N');
            await aratime.run();

            expect(harness.session.outputContains("Maybe he's not home...")).toBe(true);
        });

        test('rejects zero wagers and only charges the valid bet', async () => {
            harness = TestHarness.create();
            harness.setPlayerProps({ gold: 100 });

            const deps = createDeps(harness);
            const aratime = new Aratime(deps);

            harness.queueKeys('Y', 'Y', '0', '10');
            await aratime.run();

            expect(harness.player?.gold).toBe(90);
        });

        test('rounds odd-wager winnings like the Pascal source', async () => {
            harness = TestHarness.create();
            harness.setPlayerProps({ gold: 10 });
            harness.rng.queueRandomValues([0]);

            const deps = createDeps(harness);
            const aratime = new Aratime(deps);

            harness.queueKeys('Y', 'Y', '1', '1');
            await aratime.run();

            expect(harness.player?.gold).toBe(11);
            expect(harness.session.outputContains('So you beat me once')).toBe(true);
        });

        test('daily maintenance resets access on a new calendar day', async () => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-14T12:00:00Z'));

            harness = TestHarness.create();
            harness.setPlayerProps({ gold: 100 });

            const deps = createDeps(harness);
            const aratime = new Aratime(deps);

            harness.queueKeys('Y', 'Y', '10');
            await aratime.run();

            jest.setSystemTime(new Date('2026-04-15T12:00:00Z'));
            await Aratime.runMaint(deps);

            harness.session.clearOutput();
            harness.queueKeys('N');
            await aratime.run();

            expect(harness.session.outputContains("Maybe he's not home...")).toBe(false);
            expect(harness.session.outputContains('You turn, and run back to the realm.')).toBe(true);
        });
    });
});
