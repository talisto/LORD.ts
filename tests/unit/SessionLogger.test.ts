import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildSessionLogFilename, buildSessionLogPath } from '@lordts/core/net/SessionLogger';

describe('SessionLogger', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-session-logger-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('keeps readable filenames for ordinary usernames', () => {
        expect(buildSessionLogFilename('Spork')).toBe('Spork.log');
    });

    test('sanitizes traversal-like usernames before creating log files', () => {
        const runtimeDir = path.join(tmpDir, 'runtime');
        const logDir = path.join(runtimeDir, 'logs');
        const expectedFilename = buildSessionLogFilename('../../index.php');
        const expectedPath = buildSessionLogPath(runtimeDir, '../../index.php');

        expect(path.dirname(expectedPath)).toBe(logDir);
        expect(expectedPath.startsWith(logDir + path.sep)).toBe(true);
        expect(expectedFilename).toMatch(/\.log$/);
        expect(expectedFilename).toContain('index.php');
        expect(expectedFilename).toContain('_');
    });
});