/**
 * DropFileParser - Unit tests
 *
 * Tests parsing of DOOR32.SYS, DOOR.SYS, and DORINFOx.DEF drop files,
 * as well as auto-detection and format inference.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    parseDoor32Sys,
    parseDoorSys,
    parseDorInfo,
    autoDetect,
    parseDropFile,
} from '@lordts/door/DropFileParser';
import {
    CommType,
    EmulationType,
    DropFileFormat,
} from '@lordts/door/DoorTypes';

const FIXTURES = path.join(__dirname, '../fixtures/door');

// ══════════════════════════════════════════════════════════════════════════════
// DOOR32.SYS
// ══════════════════════════════════════════════════════════════════════════════

describe('parseDoor32Sys', () => {
    test('parses a valid DOOR32.SYS file', () => {
        const data = parseDoor32Sys(path.join(FIXTURES, 'door32.sys'));

        expect(data.format).toBe(DropFileFormat.Door32Sys);
        expect(data.commType).toBe(CommType.Telnet);
        expect(data.socketHandle).toBe(5);
        expect(data.baudRate).toBe(38400);
        expect(data.bbsId).toBe('Mystic 1.12');
        expect(data.userRecordPos).toBe(42);
        expect(data.realName).toBe('James Coyle');
        expect(data.alias).toBe('g00r00');
        expect(data.securityLevel).toBe(255);
        expect(data.timeLeftMinutes).toBe(58);
        expect(data.emulation).toBe(EmulationType.ANSI);
        expect(data.nodeNumber).toBe(3);
    });

    test('handles local mode (commType 0)', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        const tmpFile = path.join(tmpDir, 'door32.sys');
        fs.writeFileSync(tmpFile, '0\n0\n0\nTest BBS\n1\nLocal User\nLocalAlias\n100\n30\n1\n1\n');

        try {
            const data = parseDoor32Sys(tmpFile);
            expect(data.commType).toBe(CommType.Local);
            expect(data.socketHandle).toBe(0);
            expect(data.realName).toBe('Local User');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('handles missing or short file gracefully', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        const tmpFile = path.join(tmpDir, 'door32.sys');
        fs.writeFileSync(tmpFile, '2\n10\n');

        try {
            const data = parseDoor32Sys(tmpFile);
            expect(data.commType).toBe(CommType.Telnet);
            expect(data.socketHandle).toBe(10);
            expect(data.realName).toBe('');
            expect(data.alias).toBe('');
            expect(data.timeLeftMinutes).toBe(60); // default
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// DOOR.SYS
// ══════════════════════════════════════════════════════════════════════════════

describe('parseDoorSys', () => {
    test('parses a valid DOOR.SYS file', () => {
        const data = parseDoorSys(path.join(FIXTURES, 'door.sys'));

        expect(data.format).toBe(DropFileFormat.DoorSys);
        expect(data.commType).toBe(CommType.Serial);
        expect(data.baudRate).toBe(2400);
        expect(data.realName).toBe('Rick Greer');
        expect(data.location).toBe('Lewisville, Tx.');
        expect(data.securityLevel).toBe(110);
        expect(data.totalCalls).toBe(1456);
        expect(data.timeLeftMinutes).toBe(126);
        expect(data.emulation).toBe(EmulationType.ANSI);
        expect(data.screenLines).toBe(23);
        expect(data.expertMode).toBe(true);
        expect(data.alias).toBe('Stud');
        expect(data.nodeNumber).toBe(1);
    });

    test('detects local mode from COM0:', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        const tmpFile = path.join(tmpDir, 'door.sys');
        const lines = new Array(40).fill('');
        lines[0] = 'COM0:';
        lines[1] = '0';
        lines[9] = 'Test User';
        lines[18] = '30';
        lines[19] = 'GR';
        fs.writeFileSync(tmpFile, lines.join('\n'));

        try {
            const data = parseDoorSys(tmpFile);
            expect(data.commType).toBe(CommType.Local);
            expect(data.realName).toBe('Test User');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('falls back alias to real name when line 34 is empty', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        const tmpFile = path.join(tmpDir, 'door.sys');
        const lines = new Array(35).fill('');
        lines[0] = 'COM1:';
        lines[9] = 'John Doe';
        lines[18] = '60';
        lines[19] = 'NG';
        fs.writeFileSync(tmpFile, lines.join('\n'));

        try {
            const data = parseDoorSys(tmpFile);
            expect(data.realName).toBe('John Doe');
            expect(data.alias).toBe('John Doe');
            expect(data.emulation).toBe(EmulationType.ASCII);
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// DORINFOx.DEF
// ══════════════════════════════════════════════════════════════════════════════

describe('parseDorInfo', () => {
    test('parses a valid DORINFOx.DEF file', () => {
        const data = parseDorInfo(path.join(FIXTURES, 'dorinfo1.def'));

        expect(data.format).toBe(DropFileFormat.DorInfo);
        expect(data.bbsId).toBe('My BBS');
        expect(data.commType).toBe(CommType.Local);
        expect(data.baudRate).toBe(0);
        expect(data.realName).toBe('Jane Smith');
        expect(data.alias).toBe('Jane Smith');
        expect(data.location).toBe('Anytown USA');
        expect(data.emulation).toBe(EmulationType.ANSI);
        expect(data.securityLevel).toBe(200);
        expect(data.timeLeftMinutes).toBe(45);
    });

    test('handles single-name user (no last name)', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        const tmpFile = path.join(tmpDir, 'dorinfo1.def');
        fs.writeFileSync(tmpFile, [
            'BBS Name', 'Sysop', '', 'COM1', '9600', '0',
            'SingleName', '', 'Somewhere', '1', '100', '30',
        ].join('\n'));

        try {
            const data = parseDorInfo(tmpFile);
            expect(data.realName).toBe('SingleName');
            expect(data.commType).toBe(CommType.Serial);
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// Auto-Detection
// ══════════════════════════════════════════════════════════════════════════════

describe('autoDetect', () => {
    test('detects DOOR32.SYS when present', () => {
        const data = autoDetect(FIXTURES);
        expect(data).not.toBeNull();
        expect(data!.format).toBe(DropFileFormat.Door32Sys);
    });

    test('returns null when no drop files exist', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-empty-'));
        try {
            const data = autoDetect(tmpDir);
            expect(data).toBeNull();
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('falls back to DOOR.SYS when DOOR32.SYS is absent', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        // Only create door.sys
        const lines = new Array(40).fill('');
        lines[0] = 'COM1:';
        lines[9] = 'Fallback User';
        lines[18] = '60';
        lines[19] = 'GR';
        lines[34] = 'FallbackAlias';
        fs.writeFileSync(path.join(tmpDir, 'door.sys'), lines.join('\n'));

        try {
            const data = autoDetect(tmpDir);
            expect(data).not.toBeNull();
            expect(data!.format).toBe(DropFileFormat.DoorSys);
            expect(data!.realName).toBe('Fallback User');
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });

    test('falls back to DORINFOx.DEF as last resort', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-test-'));
        fs.writeFileSync(path.join(tmpDir, 'dorinfo1.def'), [
            'BBS', 'Sys', 'Op', 'COM0', '0', '0',
            'Only', 'DorInfo', 'City', '1', '50', '20',
        ].join('\n'));

        try {
            const data = autoDetect(tmpDir);
            expect(data).not.toBeNull();
            expect(data!.format).toBe(DropFileFormat.DorInfo);
        } finally {
            fs.rmSync(tmpDir, { recursive: true });
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// parseDropFile
// ══════════════════════════════════════════════════════════════════════════════

describe('parseDropFile', () => {
    test('parses with explicit format', () => {
        const data = parseDropFile(
            path.join(FIXTURES, 'door32.sys'),
            DropFileFormat.Door32Sys,
        );
        expect(data.format).toBe(DropFileFormat.Door32Sys);
        expect(data.realName).toBe('James Coyle');
    });

    test('auto-detects format from filename', () => {
        const data = parseDropFile(path.join(FIXTURES, 'dorinfo1.def'));
        expect(data.format).toBe(DropFileFormat.DorInfo);
    });
});
