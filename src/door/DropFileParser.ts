/**
 * DropFileParser - Parse BBS drop files (DOOR32.SYS, DOOR.SYS, DORINFOx.DEF)
 *
 * Supports auto-detection: tries DOOR32.SYS first (preferred modern format),
 * then DOOR.SYS, then DORINFOx.DEF. Can also be called with an explicit format.
 *
 * References:
 *   - DOOR32.SYS: dev/src/d32_02/docs/DOOR32.FMT (Revision 1, Feb 2001)
 *   - DOOR.SYS:   dev/src/ckit258/DOORSYS.TXT (PCBoard standard)
 *   - DORINFOx.DEF: dev/src/odoors60/DORINFO1.DEF
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {
    CommType,
    EmulationType,
    DropFileFormat,
    type DropFileData,
} from './DoorTypes';

/** Create a DropFileData with sensible defaults. */
function defaultDropFileData(format: DropFileFormat): DropFileData {
    return {
        format,
        commType: CommType.Local,
        socketHandle: 0,
        baudRate: 0,
        bbsId: '',
        userRecordPos: 0,
        realName: '',
        alias: '',
        securityLevel: 0,
        timeLeftMinutes: 60,
        emulation: EmulationType.ANSI,
        nodeNumber: 1,
    };
}

/**
 * Read a drop file and split into trimmed lines.
 * Handles both \r\n (Windows/DOS) and \n (Unix) line endings.
 */
function readLines(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split(/\r?\n/);
}

/** Safely parse an integer, returning a fallback on NaN. */
function safeInt(s: string | undefined, fallback: number = 0): number {
    if (s === undefined) return fallback;
    const n = parseInt(s.trim(), 10);
    return isNaN(n) ? fallback : n;
}

// ══════════════════════════════════════════════════════════════════════════════
// DOOR32.SYS Parser
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a DOOR32.SYS file.
 *
 * Format (11 lines):
 *   Line 1:  Comm type (0=local, 1=serial, 2=telnet)
 *   Line 2:  Comm or socket handle
 *   Line 3:  Baud rate
 *   Line 4:  BBSID (software name and version)
 *   Line 5:  User record position (1-based)
 *   Line 6:  User's real name
 *   Line 7:  User's handle/alias
 *   Line 8:  User's security level (0-255)
 *   Line 9:  User's time left (in minutes)
 *   Line 10: Emulation (0=ASCII, 1=ANSI, 2=Avatar, 3=RIP, 4=Max)
 *   Line 11: Current node number
 */
export function parseDoor32Sys(filePath: string): DropFileData {
    const lines = readLines(filePath);
    const data = defaultDropFileData(DropFileFormat.Door32Sys);

    data.commType       = safeInt(lines[0], 0) as CommType;
    data.socketHandle   = safeInt(lines[1], 0);
    data.baudRate       = safeInt(lines[2], 0);
    data.bbsId          = (lines[3] || '').trim();
    data.userRecordPos  = safeInt(lines[4], 0);
    data.realName       = (lines[5] || '').trim();
    data.alias          = (lines[6] || '').trim();
    data.securityLevel  = safeInt(lines[7], 0);
    data.timeLeftMinutes = safeInt(lines[8], 60);

    // Emulation: 0=ASCII, 1=ANSI, 2=Avatar, 3=RIP, 4=Max
    // Avatar, RIP, and Max all have ANSI fallback - treat as ANSI for our purposes
    const emu = safeInt(lines[9], 1);
    data.emulation = (emu >= 0 && emu <= 4) ? emu as EmulationType : EmulationType.ANSI;

    data.nodeNumber = safeInt(lines[10], 1);

    return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// DOOR.SYS Parser
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a DOOR.SYS file.
 *
 * This is the PCBoard-standard format with 33+ lines of detailed user and
 * system info. We extract the fields relevant to LORD door mode.
 *
 * Key lines (0-indexed):
 *   0:  COM port (COM1:, COM2:, COM0: = local)
 *   1:  Baud rate
 *   4:  DTE rate (actual BPS)
 *   5:  Screen display (Y/N)
 *   9:  User full name
 *   10: Calling from (location)
 *   14: Security level
 *   15: Total times on
 *   17: Time remaining (seconds)
 *   18: Minutes remaining
 *   19: Graphics mode (GR/NG/7E)
 *   20: Page length (screen lines)
 *   21: Expert mode (Y/N)
 *   25: User record number
 *   34: Alias / handle
 */
export function parseDoorSys(filePath: string): DropFileData {
    const lines = readLines(filePath);
    const data = defaultDropFileData(DropFileFormat.DoorSys);

    // Line 0: COM port - "COM0:" means local, "COM1:"–"COM4:" means serial
    const comPort = (lines[0] || '').trim().toUpperCase();
    if (comPort === 'COM0:' || comPort === 'LOCAL') {
        data.commType = CommType.Local;
    } else {
        data.commType = CommType.Serial;
    }

    data.baudRate = safeInt(lines[1], 0);

    // Line 9: User full name
    data.realName = (lines[9] || '').trim();

    // Line 10: Calling from / location
    data.location = (lines[10] || '').trim();

    // Line 14: Security level
    data.securityLevel = safeInt(lines[14], 0);

    // Line 15: Total times on
    data.totalCalls = safeInt(lines[15], 0);

    // Line 18: Minutes remaining (prefer over seconds on line 17)
    data.timeLeftMinutes = safeInt(lines[18], 60);

    // Line 19: Graphics mode - "GR" = ANSI graphics, "NG" = no graphics
    const gfx = (lines[19] || '').trim().toUpperCase();
    data.emulation = (gfx === 'GR' || gfx === '7E') ? EmulationType.ANSI : EmulationType.ASCII;

    // Line 20: Page length (screen lines)
    data.screenLines = safeInt(lines[20], 24);

    // Line 21: Expert mode
    data.expertMode = (lines[21] || '').trim().toUpperCase() === 'Y';

    // Line 25: User record number (0-indexed in DOOR.SYS; we store as-is)
    data.userRecordPos = safeInt(lines[25], 0);

    // Line 35: Alias / handle (may not exist in all DOOR.SYS variants)
    // (Line 34 is sysop's name, line 35 is the user alias)
    data.alias = (lines[35] || '').trim();

    // If no alias was found, use the real name
    if (!data.alias) {
        data.alias = data.realName;
    }

    // DOOR.SYS doesn't have a BBSID field - leave empty
    data.bbsId = '';

    // DOOR.SYS doesn't have a node number in a standard location;
    // Line 3 is "Node Number (1-99)" in some implementations
    data.nodeNumber = safeInt(lines[3], 1);

    // Socket handle: DOOR.SYS is serial-era; no socket handle concept.
    // Door will use stdio when comm type is serial.
    data.socketHandle = 0;

    return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// DORINFOx.DEF Parser
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a DORINFOx.DEF file.
 *
 * Format (~12 lines):
 *   Line 0:  BBS name (system name)
 *   Line 1:  Sysop first name
 *   Line 2:  Sysop last name
 *   Line 3:  COM port (COM0 = local, COM1-COM4 = serial)
 *   Line 4:  Baud rate (FOSSIL) - "0" for local
 *   Line 5:  Networked (0 = non-networked)
 *   Line 6:  User first name
 *   Line 7:  User last name
 *   Line 8:  Location / city
 *   Line 9:  Emulation (0=ASCII, 1=ANSI, 2=Avatar)
 *   Line 10: Security level
 *   Line 11: Time remaining (minutes)
 */
export function parseDorInfo(filePath: string): DropFileData {
    const lines = readLines(filePath);
    const data = defaultDropFileData(DropFileFormat.DorInfo);

    data.bbsId = (lines[0] || '').trim();

    // Line 3: COM port
    const comPort = (lines[3] || '').trim().toUpperCase();
    if (comPort === 'COM0' || comPort === 'LOCAL' || comPort === '0') {
        data.commType = CommType.Local;
    } else {
        data.commType = CommType.Serial;
    }

    data.baudRate = safeInt(lines[4], 0);

    // Lines 6+7: User name (first + last)
    const firstName = (lines[6] || '').trim();
    const lastName = (lines[7] || '').trim();
    data.realName = lastName ? `${firstName} ${lastName}` : firstName;
    data.alias = data.realName; // DORINFOx doesn't have a separate alias field

    data.location = (lines[8] || '').trim();

    // Line 9: Emulation
    const emu = safeInt(lines[9], 1);
    data.emulation = (emu >= 0 && emu <= 2) ? emu as EmulationType : EmulationType.ANSI;

    data.securityLevel = safeInt(lines[10], 0);
    data.timeLeftMinutes = safeInt(lines[11], 60);

    // DORINFOx doesn't provide these:
    data.socketHandle = 0;
    data.nodeNumber = 1;
    data.userRecordPos = 0;

    return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// Auto-Detection
// ══════════════════════════════════════════════════════════════════════════════

/** Candidate drop file names in priority order */
const DOOR32_NAMES = ['door32.sys', 'DOOR32.SYS'];
const DOORSYS_NAMES = ['door.sys', 'DOOR.SYS'];
const DORINFO_NAMES = [
    'dorinfo1.def', 'DORINFO1.DEF',
    'dorinfo2.def', 'DORINFO2.DEF',
    'dorinfo3.def', 'DORINFO3.DEF',
    'dorinfo4.def', 'DORINFO4.DEF',
];

/** Try to find a file matching any of the candidate names in a directory. */
function findFile(dir: string, candidates: string[]): string | null {
    for (const name of candidates) {
        const filePath = path.join(dir, name);
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
}

/**
 * Auto-detect and parse a drop file from the given directory.
 *
 * Search order:
 *   1. DOOR32.SYS (preferred - modern, simple, multi-platform)
 *   2. DOOR.SYS   (legacy but widely supported)
 *   3. DORINFOx.DEF (QuickBBS/RA family)
 *
 * @param dir Directory to search for drop files (defaults to cwd)
 * @returns Parsed drop file data, or null if no drop file found
 */
export function autoDetect(dir?: string): DropFileData | null {
    const searchDir = dir || process.cwd();

    // Try DOOR32.SYS first
    const door32 = findFile(searchDir, DOOR32_NAMES);
    if (door32) return parseDoor32Sys(door32);

    // Try DOOR.SYS
    const doorSys = findFile(searchDir, DOORSYS_NAMES);
    if (doorSys) return parseDoorSys(doorSys);

    // Try DORINFOx.DEF
    const dorInfo = findFile(searchDir, DORINFO_NAMES);
    if (dorInfo) return parseDorInfo(dorInfo);

    return null;
}

/**
 * Parse a specific drop file, auto-detecting its format from the filename.
 *
 * @param filePath Path to the drop file
 * @param format   Explicit format override (auto-detected from filename if omitted)
 * @returns Parsed drop file data
 */
export function parseDropFile(filePath: string, format?: DropFileFormat): DropFileData {
    const resolvedFormat = format || detectFormat(filePath);

    switch (resolvedFormat) {
        case DropFileFormat.Door32Sys:
            return parseDoor32Sys(filePath);
        case DropFileFormat.DoorSys:
            return parseDoorSys(filePath);
        case DropFileFormat.DorInfo:
            return parseDorInfo(filePath);
        default:
            throw new Error(`Unknown drop file format: ${resolvedFormat}`);
    }
}

/**
 * Detect the drop file format from a filename.
 */
function detectFormat(filePath: string): DropFileFormat {
    const basename = path.basename(filePath).toLowerCase();

    if (basename === 'door32.sys') return DropFileFormat.Door32Sys;
    if (basename === 'door.sys') return DropFileFormat.DoorSys;
    if (basename.startsWith('dorinfo') && basename.endsWith('.def')) return DropFileFormat.DorInfo;

    // Default to DOOR32.SYS for unknown filenames - it's the simplest format
    // and most likely to parse without errors
    return DropFileFormat.Door32Sys;
}
