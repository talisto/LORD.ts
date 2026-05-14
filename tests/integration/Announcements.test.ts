import { TestHarness } from '../harness';

describe('Announcements', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    function unstubAnnouncements(s: TestHarness): void {
        delete (s.context.log as unknown as Record<string, unknown>).createLog;
        delete (s.context.log as unknown as Record<string, unknown>).logLine;
        s.context.state!.getState = jest.fn();
    }

    test('enforces a single announcement line when configured', async () => {
        harness = TestHarness.create({
            playerOverrides: { Record: 0, name: 'TestHero' },
        });
        unstubAnnouncements(harness);
        harness.context.settings.announcement_max_lines = 1;

        harness.queueKeys('Y', 'First line', 'Second line');
        await harness.context.display.announce();

        const lines = harness.context.storage.getLogLines('today');
        expect(lines.some(line => line.includes('First line'))).toBe(true);
        expect(lines.some(line => line.includes('Second line'))).toBe(false);
        expect(harness.outputContains('Announcement Made!')).toBe(true);
    });

    test('blocks a player after the daily per-player announcement cap is reached', async () => {
        harness = TestHarness.create({
            playerOverrides: { Record: 0, name: 'TestHero' },
        });
        unstubAnnouncements(harness);
        harness.context.settings.announcement_max_per_player_per_day = 1;

        harness.queueKeys('Y', 'First announcement', '');
        await harness.context.display.announce();

        const firstLogCount = harness.context.storage.getLogCount('today');
        expect(firstLogCount).toBeGreaterThan(4);

        harness.clearOutput();
        harness.queueKeys('Y');
        await harness.context.display.announce();

        expect(harness.context.storage.getLogCount('today')).toBe(firstLogCount);
        expect(harness.outputContains('maximum number of announcements today')).toBe(true);
    });

    test('blocks announcements after the global daily cap is reached', async () => {
        harness = TestHarness.create({
            playerOverrides: { Record: 0, name: 'TestHero' },
        });
        unstubAnnouncements(harness);
        harness.context.settings.announcement_max_total_per_day = 1;

        harness.queueKeys('Y', 'Only announcement', '');
        await harness.context.display.announce();

        const firstLogCount = harness.context.storage.getLogCount('today');
        expect(firstLogCount).toBeGreaterThan(4);

        harness.clearOutput();
        harness.queueKeys('Y');
        await harness.context.display.announce();

        expect(harness.context.storage.getLogCount('today')).toBe(firstLogCount);
        expect(harness.outputContains('cannot fit any more announcements today')).toBe(true);
    });
});