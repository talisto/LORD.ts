import { EventEmitter } from 'events';
import * as path from 'path';
import { AuthHandler } from '@lordts/core/net/AuthHandler';
import type { IConnection } from '@lordts/core/net/ConnectionTypes';
import type AuthManager from '@lordts/core/net/AuthManager';
import { RE_ANSI_SEQ } from '@lordts/util/ANSI';

class MockConnection extends EventEmitter implements IConnection {
    readyState = 1;
    remoteAddress = '127.0.0.1';
    terminalType?: string;
    useUTF8 = false;
    supportsJsonMessages = false;
    termCols = 80;
    termRows = 24;
    sent: string[] = [];
    send = jest.fn((data: string | Buffer) => {
        this.sent.push(typeof data === 'string' ? data : data.toString('latin1'));
    });
    sendJson = jest.fn();
    close = jest.fn((_code?: number, _reason?: string) => {
        this.readyState = 0;
        this.emit('close');
    });
}

const projectRoot = path.resolve(__dirname, '..', '..');

function stripAnsi(text: string): string {
    return text.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
}

async function flushAsync(turns: number = 4): Promise<void> {
    for (let i = 0; i < turns; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

describe('AuthHandler', () => {
    test('probes SyncTERM telnet sessions, uploads RIP icons, and renders auth RIP screens inline', async () => {
        const conn = new MockConnection();
        conn.terminalType = 'SYNCTERM';

        new AuthHandler(conn, {
            startGameSession: jest.fn(),
            authManager: {} as AuthManager,
        }, projectRoot);

        await flushAsync();
        expect(conn.sent.join('')).toContain('\x1b[!\x1b[6n');

        conn.emit('message', 'RIPSCRIP015400\r\x1b_test\x1b\\\x1b_\x1b\\Q');
        await flushAsync(10);
        if (conn.close.mock.calls.length === 0) {
            conn.emit('message', 'Q');
            await flushAsync(6);
        }

        const output = conn.sent.join('');
        expect(output).toContain('\x1b_SyncTERM:C;L;test\x1b\\');
        expect(output).toContain('\x1b_SyncTERM:C;S;RIP/LORDFRM1.ICN;');
        expect(output).toContain('!|');
        expect(conn.close).toHaveBeenCalled();
    });

    test('uses the RIP cache capability probe for non-SyncTERM RIP terminals too', async () => {
        const conn = new MockConnection();
        conn.terminalType = 'RIPTERM';

        new AuthHandler(conn, {
            startGameSession: jest.fn(),
            authManager: {} as AuthManager,
        }, projectRoot);

        await flushAsync();
        conn.emit('message', 'RIPSCRIP015400\r\x1b_test\x1b\\\x1b_\x1b\\Q');
        await flushAsync(10);

        const output = conn.sent.join('');
        expect(output).toContain('\x1b_SyncTERM:C;L;test\x1b\\');
        expect(output).toContain('\x1b_SyncTERM:C;S;RIP/LORDFRM1.ICN;');
    });

    test('auth divider lines use the RIP text-window width after W1 is shown', async () => {
        const conn = new MockConnection();
        conn.terminalType = 'SYNCTERM';

        new AuthHandler(conn, {
            startGameSession: jest.fn(),
            authManager: {} as AuthManager,
        }, projectRoot);

        conn.emit('message', 'RIPSCRIP015400\r\x1b_test\x1b\\\x1b_\x1b\\Q');
        await flushAsync(10);

        const dividerLines = stripAnsi(conn.sent.join(''))
            .split('\r\n')
            .filter((line) => /^ {2}[-=]+$/.test(line));

        expect(dividerLines.length).toBeGreaterThan(0);
        dividerLines.forEach((line) => {
            expect(line.trimStart().length).toBeLessThanOrEqual(68);
        });
    });

    test('auth divider lines keep the same right margin as the game UI', async () => {
        const conn = new MockConnection();
        conn.supportsJsonMessages = true;
        conn.termCols = 40;

        new AuthHandler(conn, {
            startGameSession: jest.fn(),
            authManager: {} as AuthManager,
        }, projectRoot);

        conn.emit('message', '\rQ');
        await flushAsync(6);

        const dividerLines = stripAnsi(conn.sent.join(''))
            .split('\r\n')
            .filter((line) => /^ {2}[-=]+$/.test(line));

        expect(dividerLines.length).toBeGreaterThan(0);
        dividerLines.forEach((line) => {
            expect(line.trimStart().length).toBeLessThanOrEqual(conn.termCols - 5);
        });
    });
});