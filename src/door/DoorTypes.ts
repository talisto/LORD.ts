/**
 * DoorTypes - Type definitions for BBS door game support.
 *
 * Defines interfaces and enums for drop file parsing, communication
 * modes, and door session configuration.
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// Enums
// ══════════════════════════════════════════════════════════════════════════════

/** Communication type from DOOR32.SYS Line 1 */
export enum CommType {
    /** Local mode - no remote connection */
    Local = 0,
    /** Serial/modem connection (not supported by Node.js - falls back to stdio) */
    Serial = 1,
    /** Telnet / TCP socket connection */
    Telnet = 2,
}

/** Terminal emulation type from DOOR32.SYS Line 10 */
export enum EmulationType {
    ASCII = 0,
    ANSI = 1,
    Avatar = 2,
    RIP = 3,
    MaxGraphics = 4,
}

/** Which drop file format was detected/parsed */
export enum DropFileFormat {
    None = 'none',
    Door32Sys = 'door32.sys',
    DoorSys = 'door.sys',
    DorInfo = 'dorinfo',
}

// ══════════════════════════════════════════════════════════════════════════════
// Interfaces
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parsed drop file data - the union of fields extracted from any supported
 * drop file format (DOOR32.SYS, DOOR.SYS, DORINFOx.DEF).
 *
 * Fields that don't exist in a given format are set to sensible defaults.
 */
export interface DropFileData {
    /** Which format was parsed */
    format: DropFileFormat;

    /** Communication type: local, serial, or telnet (default: Local) */
    commType: CommType;

    /** Socket handle / file descriptor inherited from BBS (0 for local/stdio) */
    socketHandle: number;

    /** Baud rate (informational for telnet; typically 38400 or 0) */
    baudRate: number;

    /** BBS software identifier (e.g. "Mystic 1.12", "Enigma 0.0.14-beta") */
    bbsId: string;

    /** User's record position in the BBS user file (1-based; 0 if unknown) */
    userRecordPos: number;

    /** User's real name from the BBS */
    realName: string;

    /** User's handle/alias from the BBS */
    alias: string;

    /** User's security level (0–255) */
    securityLevel: number;

    /** Time remaining for this session, in minutes */
    timeLeftMinutes: number;

    /** Terminal emulation supported by the user */
    emulation: EmulationType;

    /** BBS node number (for multi-node systems) */
    nodeNumber: number;

    // ── Extended fields (DOOR.SYS only) ─────────────────────────────────

    /** User's location / calling from */
    location?: string;

    /** Total number of times user has called the BBS */
    totalCalls?: number;

    /** User's screen height (page length) */
    screenLines?: number;

    /** Whether the user is in expert mode */
    expertMode?: boolean;
}

/**
 * Configuration options for door mode, resolved from CLI args and
 * environment variables.
 */
export interface DoorConfig {
    /** Path to the drop file (auto-detected if not specified) */
    dropFilePath?: string;

    /** Explicit drop file format to use (auto-detected if not specified) */
    dropFileFormat?: DropFileFormat;

    /** Override the node number from the drop file */
    nodeNumber?: number;

    /** Use the user's alias instead of real name (default: true) */
    useAlias: boolean;

    /** Time warning intervals in minutes (default: [5, 2, 1]) */
    timeWarnings: number[];

    /** Local mode: skip drop file, prompt for username */
    localMode: boolean;

    /** Enable the in-game god console for local CLI sessions. */
    godMode?: boolean;

    /** Path to the directory containing the drop file (default: cwd) */
    dropFileDir?: string;
}
