/**
 * Felicity IGM - Nursery tests
 */

import path from 'path';
import { TestHarness } from '../../harness';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import Felicity from '@lordts/igm-felicity/felicity';
import { discoverStorage } from '@lordts/igm-felicity/secrets';

describe('Felicity nursery', () => {
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
            srcDir: path.join(__dirname, '../../../igm/felicity'),
            dataDir: path.join(__dirname, '../../../data'),
            runtimeDir: path.join(__dirname, '../../../runtime'),
            equipment: harness.context.equipment,
            log: harness.context.log,
            morechk: harness.context.morechk,
        };
    }

    async function enterStorageRoom(): Promise<Felicity> {
        const felicity = new Felicity(createDeps(harness));
        await felicity.buildMenuIndex();
        felicity.initRecord();
        felicity.rec.found_storage = true;
        return felicity;
    }

    test('adoption price scales with existing children', async () => {
        harness = TestHarness.create();
        harness.context.player!.kids = 3;
        harness.context.player!.gold = 7999999;

        const felicity = await enterStorageRoom();

        harness.session.queueKeys('K', 'A', 'Y', '\r', 'L');
        await discoverStorage(felicity);

        expect(harness.context.player!.kids).toBe(3);
        expect(harness.context.player!.gold).toBe(7999999);
        expect(harness.session.output).toContain('8,000,000 gold');
        expect(harness.session.output).toContain("don't have 8,000,000 gold on hand");
    });

    test('refuses new adoptions once the nursery cap is reached', async () => {
        harness = TestHarness.create();
        harness.context.player!.kids = 12;

        const felicity = await enterStorageRoom();

        harness.session.queueKeys('K', 'A', '\r', 'L');
        await discoverStorage(felicity);

        expect(harness.context.player!.kids).toBe(12);
        expect(harness.session.output).toContain('What do you think this is');
        expect(harness.session.output).toContain('refuses to hand you another brat');
    });

    test('selling a child still pays the fixed nursery amount', async () => {
        harness = TestHarness.create();
        harness.context.player!.kids = 2;
        harness.context.player!.gold = 1000;

        const felicity = await enterStorageRoom();

        harness.session.queueKeys('K', 'G', 'Y', '\r', 'L');
        await discoverStorage(felicity);

        expect(harness.context.player!.kids).toBe(1);
        expect(harness.context.player!.gold).toBe(251000);
        expect(harness.session.output).toContain('250,000 gold');
    });
});