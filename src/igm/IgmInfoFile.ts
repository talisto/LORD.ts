/**
 * IgmInfoFile - Read/write LORD INFO.<node#> drop files.
 *
 * Implements the original LORD 4.08 drop file format (14 text lines)
 * with optional LORDTS extensions appended as additional lines for
 * backwards compatibility.
 *
 * Original DOS IGMs only read lines 1-14 and ignore anything beyond.
 *
 * @see dev/src/igmdv308/IGMDRIVE.DOC - original specification
 * @see dev/src/lordstrc.h - C structure reference
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';

// ── INFO File Data ──────────────────────────────────────────────────────────

/** Parsed contents of an INFO.<node#> drop file. */
export interface InfoFileData {
    // ── Standard LORD lines 1-14 ──
    /** Player account/record number (0-based). */
    accountNumber: number;
    /** Graphics setting: 3 = ANSI, less = ASCII. */
    graphics: number;
    /** Whether RIP graphics are enabled. */
    rip: boolean;
    /** Whether the player has a fairy. */
    fairy: boolean;
    /** Time left in minutes. IGMs must update this on exit. */
    timeLeft: number;
    /** Player's LORD handle/nickname. */
    handle: string;
    /** Real first name. */
    realFirstName: string;
    /** Real last name. */
    realLastName: string;
    /** COM port number (0 = local/stdio). */
    comPort: number;
    /** Caller baud rate (0 = local). */
    callerBaud: number;
    /** Locked port baud rate (0 = local). */
    portBaud: number;
    /** I/O driver: 'FOSSIL' or 'INTERNAL'. */
    ioDriver: string;
    /** Registration status: 'REGISTERED' or 'UNREGISTERED'. */
    registered: string;
    /** Clean mode: 'CLEAN MODE ON' or 'CLEAN MODE OFF'. */
    cleanMode: string;

    // ── LORDTS extension (lines 15+) ──
    /** LORDTS protocol version (undefined if not a LORDTS drop file). */
    lordtsVersion?: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Current LORDTS extension protocol version. */
const LORDTS_PROTOCOL_VERSION = 1;

/** Prefix for the LORDTS extension line. */
const LORDTS_PREFIX = 'LORDTS';

// ── Public API ──────────────────────────────────────────────────────────────

/** Build the filename for an INFO drop file: `INFO.<node>` */
export function infoFileName(node: number): string {
    return `INFO.${node}`;
}

/**
 * Write an INFO.<node#> drop file to the specified directory.
 *
 * Writes the standard 14-line LORD format followed by LORDTS extension
 * lines (protocol ID, database filename).
 */
export function writeInfoFile(dir: string, node: number, data: InfoFileData): void {
    const lines: string[] = [
        /* 1  */ String(data.accountNumber),
        /* 2  */ String(data.graphics),
        /* 3  */ data.rip ? 'RIP YES' : 'RIP NO',
        /* 4  */ data.fairy ? 'FAIRY YES' : 'FAIRY NO',
        /* 5  */ String(data.timeLeft),
        /* 6  */ data.handle,
        /* 7  */ data.realFirstName,
        /* 8  */ data.realLastName,
        /* 9  */ String(data.comPort),
        /* 10 */ String(data.callerBaud),
        /* 11 */ String(data.portBaud),
        /* 12 */ data.ioDriver,
        /* 13 */ data.registered,
        /* 14 */ data.cleanMode,
    ];

    // LORDTS extensions (lines 15+)
    const version = data.lordtsVersion ?? LORDTS_PROTOCOL_VERSION;
    lines.push(`${LORDTS_PREFIX} ${version}`);

    const filePath = path.join(dir, infoFileName(node));
    fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

/**
 * Read and parse an INFO.<node#> drop file.
 *
 * Reads the standard 14-line LORD format and detects LORDTS extension
 * lines if present.
 */
export function readInfoFile(dir: string, node: number): InfoFileData {
    const filePath = path.join(dir, infoFileName(node));
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    if (lines.length < 14) {
        throw new Error(`INFO.${node}: expected at least 14 lines, got ${lines.length}`);
    }

    const data: InfoFileData = {
        accountNumber: parseInt(lines[0], 10) || 0,
        graphics: parseInt(lines[1], 10) || 0,
        rip: lines[2]?.toUpperCase() === 'RIP YES',
        fairy: lines[3]?.toUpperCase() === 'FAIRY YES',
        timeLeft: parseInt(lines[4], 10) || 0,
        handle: lines[5] || '',
        realFirstName: lines[6] || '',
        realLastName: lines[7] || '',
        comPort: parseInt(lines[8], 10) || 0,
        callerBaud: parseInt(lines[9], 10) || 0,
        portBaud: parseInt(lines[10], 10) || 0,
        ioDriver: lines[11] || 'INTERNAL',
        registered: lines[12] || 'REGISTERED',
        cleanMode: lines[13] || 'CLEAN MODE OFF',
    };

    // Check for LORDTS extensions (line 15+)
    if (lines.length > 14) {
        const extLine = lines[14];
        if (extLine && extLine.startsWith(LORDTS_PREFIX)) {
            const parts = extLine.split(' ');
            data.lordtsVersion = parseInt(parts[1], 10) || LORDTS_PROTOCOL_VERSION;
        }
    }

    return data;
}

/**
 * Update the time-left field (line 5) in an existing INFO.<node#> file.
 *
 * Reads all lines, updates line 5, and writes back.  This is the pattern
 * used by original LORD IGMs on exit.
 */
export function updateTimeLeft(dir: string, node: number, minutesLeft: number): void {
    const filePath = path.join(dir, infoFileName(node));
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    if (lines.length >= 5) {
        lines[4] = String(Math.max(0, Math.floor(minutesLeft)));
    }

    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

/**
 * Remove an INFO.<node#> drop file if it exists.
 */
export function removeInfoFile(dir: string, node: number): void {
    const filePath = path.join(dir, infoFileName(node));
    try {
        fs.unlinkSync(filePath);
    } catch (_e) {
        // File already removed or never existed - ignore.
    }
}
