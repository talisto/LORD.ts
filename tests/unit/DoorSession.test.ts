import { DoorSession } from '@lordts/door/DoorSession';
import { CommType, DropFileFormat, EmulationType } from '@lordts/door/DoorTypes';
import type { DropFileData } from '@lordts/door/DoorTypes';

function createDropFile(overrides: Partial<DropFileData> = {}): DropFileData {
    return {
        format: DropFileFormat.None,
        commType: CommType.Telnet,
        socketHandle: 0,
        baudRate: 0,
        bbsId: 'Mystic',
        userRecordPos: 0,
        realName: 'TestUser',
        alias: 'TestUser',
        securityLevel: 255,
        timeLeftMinutes: 60,
        emulation: EmulationType.ANSI,
        nodeNumber: 1,
        screenLines: 50,
        ...overrides,
    };
}

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

describe('DoorSession', () => {
    test('uses drop file dimensions for door sessions', () => {
        const stdoutIsTty = mockProperty(process.stdout as object, 'isTTY', true);
        const stdoutRows = mockProperty(process.stdout as object, 'rows', 24);
        const stdoutCols = mockProperty(process.stdout as object, 'columns', 80);
        const setupInputSpy = jest.spyOn(
            DoorSession.prototype as unknown as { _setupInput: () => void },
            '_setupInput',
        ).mockImplementation(() => {});

        try {
            const session = new DoorSession(createDropFile());

            expect(session.rows).toBe(50);
            expect(session.cols).toBe(80);

            stdoutRows.set(40);
            stdoutCols.set(132);
            process.stdout.emit('resize');

            expect(session.rows).toBe(50);
            expect(session.cols).toBe(80);

            session.closeConnection();
        } finally {
            setupInputSpy.mockRestore();
            stdoutCols.restore();
            stdoutRows.restore();
            stdoutIsTty.restore();
        }
    });
});