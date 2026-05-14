/**
 * Barak IGM - Functional Tests
 */

import { TestHarness } from '../../harness';
import Barak from '@lordts/igm-barak/barak';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import path from 'path';

describe('Barak IGM', () => {
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
            srcDir: path.join(__dirname, '../../../igm/barak'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    describe('game mechanics', () => {
        test('can enter and quit the game', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    gold: 10000,
                    level: 5,
                    hp: 100,
                    hp_max: 100
                }
            });
            const deps = createDeps(harness);
            const barak = new Barak(deps);

            // Queue: H to head back to town immediately
            harness.session.queueKeys('H');
            await barak.run();

            const output = harness.session.output;
            // Just verify the game ran without crashing
            expect(output.length).toBeGreaterThan(0);
        });
    });
});
