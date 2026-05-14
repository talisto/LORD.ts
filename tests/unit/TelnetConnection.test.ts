import { EventEmitter } from 'events';
import { TelnetConnection } from '@lordts/core/net/TelnetConnection';

class MockSocket extends EventEmitter {
    remoteAddress = '127.0.0.1';
    writable = true;
    writes: Buffer[] = [];
    setNoDelay = jest.fn();
    write = jest.fn((data: string | Buffer) => {
        this.writes.push(typeof data === 'string' ? Buffer.from(data) : Buffer.from(data));
        return true;
    });
    end = jest.fn();
    destroy = jest.fn();
}

describe('TelnetConnection', () => {
    test('requests terminal type from WILL response and switches SyncTERM clients to CP437 output', () => {
        const socket = new MockSocket();
        const conn = new TelnetConnection(socket as never);

        socket.emit('data', Buffer.from([255, 251, 24]));

        expect(socket.writes.at(-1)).toEqual(Buffer.from([255, 250, 24, 1, 255, 240]));

        socket.emit('data', Buffer.concat([
            Buffer.from([255, 250, 24, 0]),
            Buffer.from('SyncTERM', 'ascii'),
            Buffer.from([255, 240]),
        ]));

        expect(conn.terminalType).toBe('SYNCTERM');
        expect(conn.useUTF8).toBe(false);

        conn.send('│');

        expect(socket.writes.at(-1)).toEqual(Buffer.from([0xB3]));
    });
});