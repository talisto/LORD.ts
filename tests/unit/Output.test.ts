import { Output } from '@lordts/core/io/Output';
import { Lazy } from '@lordts/util/Lazy';
import type { ISession, Connection } from '@lordts/core/types';

describe('Output', () => {
    let mockSession: ISession;
    let mockConnection: Connection;
    let output: Output;
    let printSpy: jest.Mock;
    let clearSpy: jest.Mock;

    beforeEach(() => {
        printSpy = jest.fn();
        clearSpy = jest.fn();
        mockSession = {
            print: printSpy,
            println: jest.fn(),
            inkey: jest.fn().mockReturnValue(undefined),
            clear: clearSpy,
            rows: 24,
            cols: 80,
            attr: { value: 0x07 } // default CGA attribute (white on black)
        } as unknown as ISession;

        mockConnection = {
            supportsRip: false,
            remoteIp: '127.0.0.1',
            node: 1
        } as Connection;

        const mockContext: any = {
            io: null,
            fileUtils: {},
            settings: {},
            ver: '4.07',
            user: { username: 'testuser' },
            baseDir: '/test',
            _shared: {},
            _uiMode: { mode: 'ansi', lastScreen: '' },
            player: {},
            mail: {},
            state: {},
            log: {},
            dailyMaint: {},
            onlineBattle: {},
            marriage: {},
            igm: undefined,
            storage: {}
        };

        output = new Output(
            mockContext.io,
            mockContext._uiMode,
            mockContext.fileUtils,
            mockContext.settings,
            mockContext.ver,
            mockSession,
            mockContext.user,
            mockConnection,
            mockContext.baseDir,
            mockContext._shared,
            new Lazy(() => mockContext.player),
            new Lazy(() => mockContext.mail),
            new Lazy(() => mockContext.state),
            new Lazy(() => mockContext.log),
            new Lazy(() => mockContext.dailyMaint),
            new Lazy(() => mockContext.onlineBattle),
            new Lazy(() => mockContext.marriage),
            new Lazy(() => mockContext.igm),
            new Lazy(() => mockContext.storage)
        );
    });

    describe('constructor', () => {
        test('initializes with default values', () => {
            expect(output.curcolnum).toBe(1);
            expect(output.curlinenum).toBe(1);
            expect(output.morechk).toBe(true);
        });
    });

    describe('sw()', () => {
        test('does nothing for empty string', () => {
            output.sw('');
            expect(printSpy).not.toHaveBeenCalled();
        });

        test('prints string and updates column number', () => {
            output.sw('hello');
            expect(printSpy).toHaveBeenCalledWith('hello');
            expect(output.curcolnum).toBe(6); // 1 + 5
        });

        test('resets column to 1 on newline', () => {
            output.sw('test');
            expect(output.curcolnum).toBe(5);
            output.sw('\r\n');
            expect(output.curcolnum).toBe(1);
        });

        test('newline does not add to column count', () => {
            output.curcolnum = 10;
            output.sw('\r\n');
            expect(output.curcolnum).toBe(1);
        });
    });

    describe('foreground()', () => {
        test('sets foreground color using ANSI codes', () => {
            output.foreground(2); // green
            expect(printSpy).toHaveBeenCalled();
            const call = printSpy.mock.calls[0][0];
            expect(call).toContain('\x1b['); // ANSI escape sequence
        });
    });

    describe('background()', () => {
        test('sets background color using ANSI codes', () => {
            output.background(1); // blue bg
            expect(printSpy).toHaveBeenCalled();
            const call = printSpy.mock.calls[0][0];
            expect(call).toContain('\x1b['); // ANSI escape sequence
        });
    });

    describe('flush()', () => {
        test('does not throw', () => {
            expect(() => output.flush()).not.toThrow();
        });
    });

    describe('sclrscr()', () => {
        test('clears screen and resets cursor', () => {
            output.sclrscr();
            expect(output.curcolnum).toBe(1);
            expect(output.curlinenum).toBe(1);
            expect(clearSpy).toHaveBeenCalled();
        });
    });

    describe('rip getter/setter', () => {
        test('returns uiMode.mode rip state', () => {
            expect(output.rip).toBe(false);
        });
    });

    describe('lastrip getter/setter', () => {
        test('returns uiMode.lastScreen', () => {
            expect(output.lastrip).toBe('');
        });

        test('sets uiMode.lastScreen', () => {
            output.lastrip = 'test_screen';
            expect(output.lastrip).toBe('test_screen');
        });
    });

    describe('showRip()', () => {
        test('does not clear the raw terminal after inline RIP output', async () => {
            (output as unknown as { _uiMode: { mode: string } })._uiMode.mode = 'rip';
            (output as unknown as { _shared: { ripindex: Record<string, string[]> } })._shared.ripindex = {
                LOGON: [
                    '!|1K|*|w0000000000',
                    '!|#|#|#',
                ],
            };

            await output.showRip('LOGON');

            expect(clearSpy).not.toHaveBeenCalled();
            expect(printSpy).toHaveBeenCalledWith('!|1K|*|w0000000000');
        });
    });
});
