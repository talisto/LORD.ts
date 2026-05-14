/**
 * Tests for RedDragonInn
 *
 * Tests for conversation board behavior at the Inn.
 */
import { RedDragonInn } from '@lordts/core/locations/RedDragonInn';
import { Lazy } from '@lordts/util/Lazy';

describe('RedDragonInn', () => {
    let inn: any;
    let mockIo: any;
    let mockFileUtils: any;
    let mockPlayer: any;
    let mockState: any;
    let mockStorage: any;

    beforeEach(() => {
        mockIo = {
            sclrscr: jest.fn(),
            showRip: jest.fn().mockResolvedValue(undefined),
            lln: jest.fn().mockResolvedValue(undefined),
            sln: jest.fn().mockResolvedValue(undefined),
            lw: jest.fn().mockResolvedValue(undefined),
            sw: jest.fn().mockResolvedValue(undefined),
            getkey: jest.fn().mockResolvedValue('a'), // user presses 'A' to add a message
            getstr: jest.fn().mockResolvedValue('This is my message'), // 18 chars, valid length
            foreground: jest.fn(),
            emitPrompt: jest.fn(),
        };


        mockFileUtils = {
            runtimeFilePath: jest.fn().mockImplementation((name: string) => `/tmp/${name}`),
            runtimeOrData: jest.fn().mockImplementation((name: string) => `/data/${name}`),
            fileExists: jest.fn().mockReturnValue(true),
            fileCopy: jest.fn(),
        };

        mockPlayer = {
            name: 'SirGalahad',
            Record: 3,
        };

        mockState = {
            getState: jest.fn().mockResolvedValue(undefined),
            putState: jest.fn(),
            last_bar: 0,
        };

        // storage mock with conversation storage
        const conversationStore: Record<string, string> = {
            bar: '  `%Warrior:\n  `2Hello there',
        };
        mockStorage = {
            hasConversation: jest.fn().mockImplementation((name: string) => name in conversationStore),
            getConversation: jest.fn().mockImplementation((name: string) => conversationStore[name] ?? ''),
            getConversationLines: jest.fn().mockImplementation((name: string) => {
                const content = conversationStore[name];
                return content ? content.split('\n') : [];
            }),
            setConversation: jest.fn().mockImplementation((name: string, content: string) => {
                conversationStore[name] = content;
            }),
            appendConversation: jest.fn().mockImplementation((name: string, newLines: string[], maxLines: number) => {
                const existing = conversationStore[name];
                const all = existing ? existing.split('\n') : [];
                all.push(...newLines);
                if (maxLines > 0) {
                    while (all.length > maxLines) all.shift();
                }
                conversationStore[name] = all.join('\n');
            }),
            initConversation: jest.fn(),
        };

        inn = new RedDragonInn(
            mockIo,
            mockState,
            mockFileUtils,
            {} as any,                       // settings
            new Lazy(() => ({} as any)),     // mail
            new Lazy(() => mockPlayer),      // player
            new Lazy(() => ({} as any)),     // rankings
            new Lazy(() => ({} as any)),     // log
            new Lazy(() => ({} as any)),     // battle
            new Lazy(() => ({} as any)),     // bard
            new Lazy(() => ({} as any)),     // marriage
            new Lazy(() => ({} as any)),     // violet
            { mode: 'ansi', lastScreen: '' }, // uiMode
            new Lazy(() => ({} as any)),     // ldyManager
            new Lazy(() => mockStorage),      // storage
        );
    });

    describe('converse - conversation board', () => {
        test('adding a message does not throw', async () => {
            await expect(inn.converse(false)).resolves.not.toThrow();
        });

        test('adding a message calls appendConversation with the player name and message', async () => {
            await inn.converse(false);

            expect(mockStorage.appendConversation).toHaveBeenCalledTimes(1);
            const [name, lines, maxLines] = mockStorage.appendConversation.mock.calls[0];
            expect(name).toBe('bar');
            expect(lines).toContain('  `%SirGalahad:');
            expect(lines).toContain('  `2This is my message');
            expect(maxLines).toBe(18);
        });

        test('existing conversation lines are preserved and new lines are appended', async () => {
            await inn.converse(false);

            // Check that the stored conversation has both old and new lines
            const stored = mockStorage.getConversation('bar');
            expect(stored).toContain('  `%Warrior:');
            expect(stored).toContain('  `2Hello there');
            expect(stored).toContain('  `%SirGalahad:');
            expect(stored).toContain('  `2This is my message');
        });

        test('conversation is trimmed to at most 18 entries', async () => {
            // Simulate a conversation already containing 18 lines
            const manyLines = Array.from({ length: 18 }, (_, i) => `line ${i + 1}`).join('\n');
            mockStorage.getConversation.mockReturnValue(manyLines);
            mockStorage.getConversationLines.mockReturnValue(manyLines.split('\n'));
            mockStorage.hasConversation.mockReturnValue(true);

            await inn.converse(false);

            // appendConversation was called with maxLines=18
            expect(mockStorage.appendConversation).toHaveBeenCalledWith('bar', expect.any(Array), 18);
        });

        test('does not add message when input is too short (< 2 chars)', async () => {
            mockIo.getstr.mockResolvedValue('X');

            await inn.converse(false);

            expect(mockStorage.appendConversation).not.toHaveBeenCalled();
        });

        test('does not update state for the dark horse bar', async () => {
            mockIo.getstr.mockResolvedValue('Hi');

            await inn.converse(true);

            // state.getState should NOT be called (darkhorse skips it)
            expect(mockState.getState).not.toHaveBeenCalled();
        });
    });
});
