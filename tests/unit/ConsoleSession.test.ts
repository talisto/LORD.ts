import ConsoleSession from '@lordts/core/net/ConsoleSession';

function mockProperty(target: object, key: string, initialValue: unknown): { set: (value: unknown) => void; restore: () => void } {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);

    const set = (value: unknown): void => {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: descriptor?.enumerable ?? true,
            writable: true,
            value,
        });
    };

    set(initialValue);

    return {
        set,
        restore: () => {
            if (descriptor) {
                Object.defineProperty(target, key, descriptor);
            } else {
                Reflect.deleteProperty(target, key);
            }
        },
    };
}

describe('ConsoleSession', () => {
    test('uses tty dimensions and updates when the terminal resizes', () => {
        const stdoutIsTty = mockProperty(process.stdout as object, 'isTTY', true);
        const stdoutRows = mockProperty(process.stdout as object, 'rows', 37);
        const stdoutCols = mockProperty(process.stdout as object, 'columns', 123);
        const stdoutOnSpy = jest.spyOn(process.stdout, 'on').mockImplementation(() => process.stdout);
        const setupStdinSpy = jest.spyOn(
            ConsoleSession.prototype as unknown as { _setupStdin: () => void },
            '_setupStdin',
        ).mockImplementation(() => {});

        try {
            const session = new ConsoleSession();

            expect(session.rows).toBe(37);
            expect(session.cols).toBe(123);
            expect(stdoutOnSpy).toHaveBeenCalledWith('resize', expect.any(Function));

            const resizeHandler = stdoutOnSpy.mock.calls.find(([event]) => event === 'resize')?.[1] as (() => void) | undefined;
            expect(resizeHandler).toBeDefined();

            stdoutRows.set(40);
            stdoutCols.set(132);
            resizeHandler?.();

            expect(session.rows).toBe(40);
            expect(session.cols).toBe(132);
        } finally {
            setupStdinSpy.mockRestore();
            stdoutOnSpy.mockRestore();
            stdoutCols.restore();
            stdoutRows.restore();
            stdoutIsTty.restore();
        }
    });
});