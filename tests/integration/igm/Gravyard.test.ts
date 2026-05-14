/**
 * Gravyard IGM - Functional Tests
 */

import { TestHarness } from '../../harness';
import Gravyard from '@lordts/igm-gravyard/gravyard';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import path from 'path';

describe('Gravyard IGM', () => {
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
            srcDir: path.join(__dirname, '../../../igm/gravyard'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    describe('menu navigation', () => {
        test('Q quits the graveyard', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const gravyard = new Gravyard(deps);

            // Queue: press key for intro, L to leave, Y to confirm
            harness.session.queueKeys('\r', 'L', 'Y');
            await gravyard.run();

            const output = harness.session.output;
            expect(output).toContain('Graveyard');
        });

        test('can view stats with V', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const gravyard = new Gravyard(deps);

            // Queue: press key for intro, V to view stats, L to leave, Y to confirm
            harness.session.queueKeys('\r', 'V', 'L', 'Y');
            await gravyard.run();

            // showStats is called through io which is mocked in tests
            expect(harness.context.io.showStats).toHaveBeenCalled();
        });

        test('R shows intro/credits', async () => {
            harness = TestHarness.create();
            const deps = createDeps(harness);
            const gravyard = new Gravyard(deps);

            // Queue: press key for intro, ? to redisplay menu, L to leave, Y to confirm
            harness.session.queueKeys('\r', '?', 'L', 'Y');
            await gravyard.run();

            const output = harness.session.output;
            // Should show graveyard intro text
            expect(output.length).toBeGreaterThan(100);
        });
    });

    describe('Tanya the Ghost', () => {
        test('Tanya gives a potion only once per visit (A is limited to one use)', async () => {
            // Regression test: tanyaAsk guard was declared `const` (always false),
            // allowing players to press A repeatedly and receive unlimited potions.
            // After the fix, the guard is set to true after the first potion and
            // the second press should show the denial message instead.
            harness = TestHarness.create({
                playerOverrides: { sex: 'M' }
            });

            // Control random outcomes:
            //   random(100) in doRandomStuff → 0 (no Jim Bob encounter)
            //   random(6) in graGetPotion    → 0 (case 0: CHARM RAISED BY 2)
            harness.rng.queueRandomValues([0, 0]);
            harness.rng.install();

            const initialCharm = harness.context.player!.cha;
            const deps = createDeps(harness);
            const gravyard = new Gravyard(deps);

            // Navigation:
            //   \r  - dismiss graIntro "Press A Key"
            //   T   - mainMenu → Grave Digger (graDigger)
            //   1   - graDigger → find ghost (graGhostTanya, male-only option)
            //   \r  - dismiss FOUNDTANYA "Press A Key"
            //   A   - Tanya menu: ask for help (first time - should give potion)
            //   \r  - dismiss potion pressAKey
            //   A   - Tanya menu: ask for help (second time - should be denied)
            //   \r  - dismiss denial pressAKey
            //   L   - leave Tanya
            //   L   - leave Grave Digger
            //   L   - leave main menu
            //   Y   - confirm quit
            harness.session.queueKeys('\r', 'T', '1', '\r', 'A', '\r', 'A', '\r', 'L', 'L', 'L', 'Y');

            await gravyard.run();

            const out = harness.session.plainOutput;

            // First press: potion should have been given
            expect(out).toContain('YOU GOT A POTION FROM TANYA');
            // First press: graGetPotion rand=0 gives charm bonus
            expect(out).toContain('CHARM RAISED BY 2');
            // Second press: should be blocked with the denial message
            expect(out).toContain('She already gave you a potion');

            // Charm raised exactly once, not twice
            const charmOccurrences = (out.match(/CHARM RAISED BY 2/g) ?? []).length;
            expect(charmOccurrences).toBe(1);
            expect(harness.context.player!.cha).toBe(initialCharm + 2);
        });
    });
});
