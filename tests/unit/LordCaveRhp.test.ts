import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestHarness } from '../harness';
import { RhpEngine } from '@lordts/igm-lordcave/rhp';

describe('LordCave RHP child limits', () => {
    let harness: TestHarness;

    afterEach(() => {
        if (harness) {
            harness.cleanup();
        }
    });

    test('women.rhp routes capped families to the orphanage instead of adding another child', async () => {
        harness = TestHarness.create({
            playerOverrides: {
                sex: 'M',
                kids: 16,
                laid: 0,
                married_to: -1,
            },
        });

        const engine = new RhpEngine(
            harness.context.io,
            harness.context.player!,
            harness.context.log,
            harness.context.settings,
            15,
        );

        harness.queueKeys('Y', '\r', 'B', '1', '\r');
        await engine.executeFile(path.join(__dirname, '../../igm/lordcave/women.rhp'));

        expect(harness.player!.kids).toBe(16);
        expect(harness.player!.laid).toBe(1);
        expect(harness.outputContains("King's Orphanage")).toBe(true);
    });

    test('generic RHP KIDS writes clamp to the LordCave family cap', async () => {
        harness = TestHarness.create();

        const engine = new RhpEngine(
            harness.context.io,
            harness.context.player!,
            harness.context.log,
            harness.context.settings,
            15,
        );

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lordcave-rhp-'));
        const scriptPath = path.join(tempDir, 'cap-test.rhp');
        fs.writeFileSync(scriptPath, '@SHOW@\n@KIDS@ 999\n@END@\n', 'ascii');

        try {
            harness.queueKeys('\r');
            await engine.executeFile(scriptPath);

            expect(harness.player!.kids).toBe(16);
            expect(harness.outputContains('GAIN 16')).toBe(true);
            expect(harness.outputContains('GAIN 999')).toBe(false);
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});