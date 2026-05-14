import { Input } from '@lordts/core/io/Input';
import { Lazy } from '@lordts/util/Lazy';
import type { ISession, Settings, UiMode, User } from '@lordts/core/types';

describe('Input', () => {
    test('commandPrompt suppresses the plain prompt line in RIP mode', async () => {
        const session = {
            attr: { value: 7 },
            rows: 24,
            cols: 80,
            ansi: true,
            getkey: jest.fn().mockResolvedValue('q'),
            waitkey: jest.fn(),
            print: jest.fn(),
        } as unknown as ISession;
        const settings = {
            timeout: 300,
        } as Settings;
        const uiMode = { mode: 'rip', lastScreen: '' } as UiMode;
        const user = {
            noTimeout: true,
            secondsRemaining: 0,
            secondsRemainingFrom: 0,
        } as User;
        const input = new Input(settings, uiMode, new Lazy(() => null), session, user);
        const io = {
            output: { curlinenum: 1 },
            sln: jest.fn(),
            lw: jest.fn(),
            emitPrompt: jest.fn(),
            flush: jest.fn(),
        };

        input.io = io as never;

        const ch = await input.commandPrompt('main_menu', [{ key: 'Q', label: 'Quit' }], false);

        expect(ch).toBe('Q');
        expect(io.sln).not.toHaveBeenCalled();
        expect(io.lw).not.toHaveBeenCalled();
        expect(io.emitPrompt).toHaveBeenCalledWith('main_menu', [{ key: 'Q', label: 'Quit' }]);
    });
});