import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    writeInfoFile,
    readInfoFile,
    updateTimeLeft,
    removeInfoFile,
} from '@lordts/igm/IgmInfoFile';
import type { InfoFileData } from '@lordts/igm/IgmInfoFile';

describe('IgmInfoFile', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-info-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function sampleInfo(): InfoFileData {
        return {
            accountNumber: 3,
            graphics: 3,
            rip: false,
            fairy: true,
            timeLeft: 45,
            handle: 'TestHero',
            realFirstName: 'John',
            realLastName: 'Doe',
            comPort: 0,
            callerBaud: 0,
            portBaud: 0,
            ioDriver: 'INTERNAL',
            registered: 'REGISTERED',
            cleanMode: 'CLEAN MODE OFF',
        };
    }

    test('writeInfoFile and readInfoFile round-trip standard fields', () => {
        const info = sampleInfo();
        writeInfoFile(tmpDir, 1, info);

        const result = readInfoFile(tmpDir, 1);

        expect(result.accountNumber).toBe(3);
        expect(result.graphics).toBe(3);
        expect(result.rip).toBe(false);
        expect(result.fairy).toBe(true);
        expect(result.timeLeft).toBe(45);
        expect(result.handle).toBe('TestHero');
        expect(result.realFirstName).toBe('John');
        expect(result.realLastName).toBe('Doe');
        expect(result.comPort).toBe(0);
        expect(result.callerBaud).toBe(0);
        expect(result.portBaud).toBe(0);
        expect(result.ioDriver).toBe('INTERNAL');
        expect(result.registered).toBe('REGISTERED');
        expect(result.cleanMode).toBe('CLEAN MODE OFF');
    });

    test('writeInfoFile includes LORDTS extensions', () => {
        const info = sampleInfo();
        writeInfoFile(tmpDir, 2, info);

        const result = readInfoFile(tmpDir, 2);

        expect(result.lordtsVersion).toBe(1);
    });

    test('readInfoFile without LORDTS extensions returns undefined for extensions', () => {
        // Write a minimal 14-line INFO file without extensions
        const lines = [
            '5', '3', 'FALSE', 'FALSE', '30',
            'OldPlayer', 'Jane', 'Smith',
            '1', '9600', '19200',
            'FOSSIL', 'REGISTERED', 'CLEAN MODE ON',
        ];
        const filePath = path.join(tmpDir, 'INFO.3');
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');

        const result = readInfoFile(tmpDir, 3);

        expect(result.accountNumber).toBe(5);
        expect(result.handle).toBe('OldPlayer');
        expect(result.rip).toBe(false);
        expect(result.cleanMode).toBe('CLEAN MODE ON');
        expect(result.lordtsVersion).toBeUndefined();
    });

    test('updateTimeLeft modifies only the time field', () => {
        const info = sampleInfo();
        writeInfoFile(tmpDir, 1, info);

        updateTimeLeft(tmpDir, 1, 10);

        const result = readInfoFile(tmpDir, 1);
        expect(result.timeLeft).toBe(10);
        expect(result.handle).toBe('TestHero');
    });

    test('removeInfoFile deletes the file', () => {
        const info = sampleInfo();
        writeInfoFile(tmpDir, 1, info);
        expect(fs.existsSync(path.join(tmpDir, 'INFO.1'))).toBe(true);

        removeInfoFile(tmpDir, 1);
        expect(fs.existsSync(path.join(tmpDir, 'INFO.1'))).toBe(false);
    });

    test('removeInfoFile is a no-op when file does not exist', () => {
        expect(() => removeInfoFile(tmpDir, 99)).not.toThrow();
    });

    test('readInfoFile throws for missing file', () => {
        expect(() => readInfoFile(tmpDir, 99)).toThrow();
    });

    test('node number is used in filename', () => {
        writeInfoFile(tmpDir, 7, sampleInfo());
        expect(fs.existsSync(path.join(tmpDir, 'INFO.7'))).toBe(true);
    });
});
