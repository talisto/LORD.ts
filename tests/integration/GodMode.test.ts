import { clearQueuedRandomValues, getQueuedRandomValues } from '@lordts/util/Util';
import { TestHarness } from '../harness';

function queueCommand(harness: TestHarness, command: string): void {
    harness.session.queueString(command);
    harness.queueKeys('\r');
}

function queueArrow(harness: TestHarness, direction: 'up' | 'down'): void {
    harness.queueKeys('\x1b', '[', direction === 'up' ? 'A' : 'B');
}

function queueBackspaces(harness: TestHarness, count: number): void {
    for (let i = 0; i < count; i++) {
        harness.queueKeys('\x08');
    }
}

function restoreRealLdyMethods(harness: TestHarness): void {
    const prototype = Object.getPrototypeOf(harness.context.ldyManager) as {
        runEvent: (section: string, filename: string) => Promise<string>;
        runForestEvent: () => Promise<string>;
    };

    harness.context.ldyManager.runEvent = prototype.runEvent.bind(harness.context.ldyManager);
    harness.context.ldyManager.runForestEvent = prototype.runForestEvent.bind(harness.context.ldyManager);
}

function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
}

describe('God mode', () => {
    let harness: TestHarness;

    afterEach(() => {
        clearQueuedRandomValues();
        harness?.cleanup();
    });

    test('slash opens god mode and set updates a persisted field', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gold: 500 },
        });

        harness.queueKeys('/');
        queueCommand(harness, 'set gold 4321');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');
        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gold).toBe(4321);
        expect(harness.player!.put).toHaveBeenCalled();
        expect(harness.outputContains('Saved gold')).toBe(true);
    });

    test('can trigger a hard-coded forest event directly', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gold: 500 },
        });

        harness.queueKeys('/');
        queueCommand(harness, 'event forest find_lost_gold');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');
        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gold).toBeGreaterThan(500);
        expect(harness.outputContains('Fortune smiles')).toBe(true);
    });

    test('can trigger an LDY event directly using the file name with default section', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gem: 0 },
        });
        restoreRealLdyMethods(harness);

        harness.queueKeys('/');
        queueCommand(harness, 'event ldy gem');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');
        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gem).toBe(1);
        expect(harness.outputContains('find a gem')).toBe(true);
    });

    test('queued random values can force the normal forest dispatcher', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gold: 500 },
        });

        harness.queueKeys('/');
        queueCommand(harness, 'random queue 1 5');
        queueCommand(harness, 'event forest look');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');
        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gold).toBeGreaterThan(500);
        expect(harness.outputContains('Fortune smiles')).toBe(true);
        expect(getQueuedRandomValues()).toEqual([]);
    });

    test('event list ldy shows available files and inferred default sections', async () => {
        harness = TestHarness.create({
            godMode: true,
        });

        harness.queueKeys('/');
        queueCommand(harness, 'event list ldy');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');
        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.outputContains('gem.ldy')).toBe(true);
        expect(harness.outputContains('GEM')).toBe(true);
        expect(harness.outputContains('bardsong.ldy')).toBe(true);
        expect(harness.outputContains('BARDSONG')).toBe(true);
    });

    test('question mark shows help and q or x can leave god mode', async () => {
        harness = TestHarness.create({
            godMode: true,
        });

        harness.queueKeys('/');
        queueCommand(harness, '?');
        queueCommand(harness, 'q');
        harness.queueKeys('/');
        queueCommand(harness, 'x');
        harness.queueKeys('A');

        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.outputContains('Commands:')).toBe(true);
        expect(harness.outputContains('help or ?')).toBe(true);
        expect(countOccurrences(harness.plainOutput, 'Leaving god mode.')).toBe(2);
    });

    test('up arrow recalls previous commands across god-mode invocations and allows editing them', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gold: 0 },
        });

        harness.queueKeys('/');
        queueCommand(harness, 'set gold 111');
        queueCommand(harness, 'exit');
        harness.queueKeys('/', '\x1b', '[', 'A');
        queueBackspaces(harness, 3);
        harness.session.queueString('222');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');

        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gold).toBe(222);
        expect(harness.context.player!.put).toHaveBeenCalledTimes(2);
    });

    test('down arrow restores the current draft after browsing history', async () => {
        harness = TestHarness.create({
            godMode: true,
            playerOverrides: { gold: 10, bank: 0 },
        });

        harness.queueKeys('/');
        queueCommand(harness, 'set gold 99');
        harness.session.queueString('set bank 7');
        queueArrow(harness, 'up');
        queueArrow(harness, 'down');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');

        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.player!.gold).toBe(99);
        expect(harness.player!.bank).toBe(7);
    });

    test('returning to the god prompt resets pagination before the next command', async () => {
        harness = TestHarness.create({
            godMode: true,
        });
        harness.session.rows = 11;

        harness.queueKeys('/');
        queueCommand(harness, 'status');
        queueCommand(harness, 'show gold');
        harness.queueKeys('\r');
        queueCommand(harness, 'exit');
        harness.queueKeys('A');

        const ch = await harness.context.input.getkey();

        expect(ch).toBe('A');
        expect(harness.outputContains('gold: 500')).toBe(true);
        expect(countOccurrences(harness.plainOutput, '<MORE>')).toBe(0);
    });
});