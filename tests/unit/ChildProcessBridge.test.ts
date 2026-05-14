import { spawn } from 'child_process';
import { ChildProcessBridge } from '@lordts/igm/ChildProcessBridge';
import type { ISession } from '@lordts/core/types';

function makeMockSession(): ISession {
    return {
        write: jest.fn(),
        deliverKeys: jest.fn(),
        flush: jest.fn(),
        close: jest.fn(),
    } as unknown as ISession;
}

describe('ChildProcessBridge', () => {
    test('bridges child stdout to session.write', async () => {
        const session = makeMockSession();
        const child = spawn(process.execPath, ['-e', 'process.stdout.write("hello")']);
        const bridge = new ChildProcessBridge(session, child);

        const exitCode = await bridge.bridge();

        expect(exitCode).toBe(0);
        // stdout data should have been forwarded to session.write
        expect(session.write).toHaveBeenCalled();
        const allWrites = (session.write as jest.Mock).mock.calls.map(c => c[0]).join('');
        expect(allWrites).toBe('hello');
    });

    test('returns non-zero exit code', async () => {
        const session = makeMockSession();
        const child = spawn(process.execPath, ['-e', 'process.exit(42)']);
        const bridge = new ChildProcessBridge(session, child);

        const exitCode = await bridge.bridge();

        expect(exitCode).toBe(42);
    });

    test('clears inputInterceptor after child exits', async () => {
        const session = makeMockSession();
        const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
        const bridge = new ChildProcessBridge(session, child);

        await bridge.bridge();

        // inputInterceptor should be cleared
        expect(session.inputInterceptor).toBeNull();
    });

    test('sets inputInterceptor to forward input to child stdin', async () => {
        const session = makeMockSession();

        // Child echoes stdin to stdout then exits
        const child = spawn(process.execPath, ['-e', `
            process.stdin.once('data', (d) => { process.stdout.write(d); process.exit(0); });
        `]);

        const bridge = new ChildProcessBridge(session, child);
        const bridgePromise = bridge.bridge();

        // Wait a tick for the bridge to set up
        await new Promise(r => setTimeout(r, 50));

        // inputInterceptor should be set
        expect(typeof session.inputInterceptor).toBe('function');

        // Simulate input arriving (as if stdin handler or deliverKeys called it)
        session.inputInterceptor!('x');

        const exitCode = await bridgePromise;
        expect(exitCode).toBe(0);

        // The echoed 'x' should appear in session.write calls
        const allWrites = (session.write as jest.Mock).mock.calls.map(c => c[0]).join('');
        expect(allWrites).toBe('x');
    });

    test('timeout kills child process', async () => {
        const session = makeMockSession();
        // Child that sleeps indefinitely
        const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)']);
        const bridge = new ChildProcessBridge(session, child, { timeout: 200 });

        const exitCode = await bridge.bridge();

        // Should have been killed (signal → exit code 1)
        expect(exitCode).toBe(1);
    }, 10000);
});
