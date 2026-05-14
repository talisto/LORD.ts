import { EventEmitter } from 'events';
import * as path from 'path';
import { SessionManager } from '@lordts/core/net/SessionManager';
import type { IConnection } from '@lordts/core/net/ConnectionTypes';
import type { ISession } from '@lordts/core/types';
import type { IStorage } from '@lordts/storage/IStorage';
import type AuthManager from '@lordts/core/net/AuthManager';
import { SqliteStorage } from '@lordts/storage/SqliteStorage';
import { WebSocketSession } from '@lordts/core/net/WebSocketSession';

class TestConnection extends EventEmitter implements IConnection {
    readyState = 1;
    remoteAddress = '127.0.0.1';
    useUTF8 = true;
    supportsJsonMessages = false;
    termCols = 80;
    termRows = 24;
    send = jest.fn();
    sendJson = jest.fn();
    close = jest.fn((_code?: number, _reason?: string) => {
        this.readyState = 0;
        this.emit('close');
    });
}

const projectRoot = path.resolve(__dirname, '..', '..');

async function flushAsync(turns: number = 8): Promise<void> {
    for (let i = 0; i < turns; i++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}

describe('SessionManager', () => {
    test('handleAuth rejects new auth sessions while maintenance mode is active', () => {
        const sessionManager = new SessionManager(
            '/tmp/project',
            '/tmp/project',
            {} as IStorage,
            {} as AuthManager,
        );
        const conn = new TestConnection();
        sessionManager.setMaintenanceMode(true);

        sessionManager.handleAuth(conn);

        expect(conn.send).toHaveBeenCalledWith(expect.stringContaining('maintenance'));
        expect(conn.close).toHaveBeenCalledWith(1013, 'Maintenance window');
        sessionManager.shutdown();
    });

    test('startSession rejects authenticated sessions while maintenance mode is active', () => {
        const sessionManager = new SessionManager(
            '/tmp/project',
            '/tmp/project',
            {} as IStorage,
            {} as AuthManager,
        );
        const conn = new TestConnection();
        const adapter = {
            write: jest.fn(),
            flush: jest.fn(),
            closeConnection: jest.fn(),
            lastActivityTime: Date.now(),
        } as unknown as ISession;
        sessionManager.setMaintenanceMode(true);

        sessionManager.startSession(conn, adapter, 'testuser', false);

        expect((adapter.write as jest.Mock)).toHaveBeenCalledWith(expect.stringContaining('maintenance'));
        expect((adapter.closeConnection as jest.Mock)).toHaveBeenCalled();
        expect(conn.close).toHaveBeenCalledWith(1013, 'Maintenance window');
        expect(sessionManager.getActiveSessionCount()).toBe(0);
        sessionManager.shutdown();
    });

    test('non-JSON sessions keep RIP screens in the raw terminal stream', async () => {
        const storage = new SqliteStorage(':memory:');
        const sessionManager = new SessionManager(
            projectRoot,
            projectRoot,
            storage as unknown as IStorage,
            {} as AuthManager,
        );
        const conn = new TestConnection();
        const adapter = new WebSocketSession();
        const sendRipSpy = jest.spyOn(adapter, 'sendRip');

        sessionManager.startSession(conn, adapter, 'testuser', true);
        conn.emit('message', '\rQ');
        await flushAsync(12);

        expect(sendRipSpy).not.toHaveBeenCalled();
        expect(conn.send).toHaveBeenCalledWith(expect.stringContaining('!|'));

        adapter.closeConnection();
        if (conn.readyState === 1) {
            conn.close();
        }
        storage.close();
        sessionManager.shutdown();
    });
});