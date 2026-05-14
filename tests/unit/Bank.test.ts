import { Bank } from '@lordts/core/locations/Bank';
import { Lazy } from '@lordts/util/Lazy';

describe('Bank', () => {
    let mockContext: any;
    let bank: any;

    beforeEach(() => {
        mockContext = {
            io: {
                sclrscr: jest.fn(),
                showRip: jest.fn(),
                showTxt: jest.fn(),
                sln: jest.fn(),
                lw: jest.fn(),
                lln: jest.fn(),
                commandPrompt: jest.fn(),
                getkey: jest.fn(),
                getstr: jest.fn(),
                emitPrompt: jest.fn(),
            },
            settings: {},
            uiMode: { mode: 'ansi', lastScreen: '' },
            player: {
                gold: 1000,
                bank: 5000,
                sex: 'M'
            },
            mail: {},
            ldyManager: { runLeaveBankEvent: jest.fn().mockResolvedValue('ok') },
        };

        bank = new Bank(
            mockContext.io,
            mockContext.settings,
            mockContext.uiMode,
            new Lazy(() => mockContext.player),
            new Lazy(() => mockContext.mail),
            new Lazy(() => mockContext.ldyManager),
        );
    });

    describe('menu', () => {
        test('should display bank menu', () => {
            bank.menu();
            expect(mockContext.io.sclrscr).toHaveBeenCalled();
            expect(mockContext.io.showTxt).toHaveBeenCalledWith('BANK');
        });

        test('should display rip menu if rip is enabled', () => {
            mockContext.uiMode.mode = 'rip';
            bank = new Bank(
                mockContext.io,
                mockContext.settings,
                mockContext.uiMode,
                new Lazy(() => mockContext.player),
                new Lazy(() => mockContext.mail),
                new Lazy(() => mockContext.ldyManager),
            );
            bank.menu();
            expect(mockContext.io.sclrscr).toHaveBeenCalled();
            expect(mockContext.io.showRip).toHaveBeenCalledWith('BANK');
        });
    });

    describe('prompt', () => {
        test('should display bank prompt', async () => {
            await bank.prompt();
            expect(mockContext.io.lw).toHaveBeenCalledWith('`2Gold In Hand: `01,000', 2);
            expect(mockContext.io.lln).toHaveBeenCalledWith('`2Gold In Bank: `05,000');
            expect(mockContext.io.lln).toHaveBeenCalledWith('`5The Bank `8(W,D,R,T,Q)  (? for menu)');
        });
    });
});
