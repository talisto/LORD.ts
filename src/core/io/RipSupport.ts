/**
 * RipSupport - RIP graphics mode helpers for LORD.
 *
 * Provides icon file checksum computation (for client-side cache validation),
 * screen section dimension detection, and APC/private-sequence stream reading
 * used during the RIPterm client protocol handshake.
 */
'use strict';

import * as crypto from 'crypto';
import * as fs from 'fs';
import type { ISession } from '../types';

export const RIP_ICON_FILES = [
    'LORDFRM1.ICN', 'LORDFRM2.ICN', 'LORDFRM3.ICN', 'LORDFRST.ICN',
    'LORDTWN1.ICN', 'LORDTWN2.ICN', 'LORDTWN3.ICN', 'LORDWIZ2.ICN',
    'LORDWNDO.ICN', 'LORDTURG.ICN', 'LORDDEAD.ICN', 'LORDDARK.ICN',
    'LORDNEWW.ICN', 'LORDINN1.ICN', 'LORDTHEF.ICN', 'LORDDRAG.ICN',
    'LORDARMR.ICN', 'LORDBANK.ICN', 'LORDHEAL.ICN', 'LORDLRG.ICN',
    'LORDSCRL.ICN', 'LORDBART.ICN', 'LORDKING.ICN', 'LORDTAV.ICN',
    'LORDINN2.ICN', 'LORDINT1.ICN', 'LORDINT2.ICN', 'LORDHEAD.ICN',
];

const RIP_FONT_W = [8, 7, 8, 7, 16];
const RIP_INSET_PX = 2;

// RIP font id -> glyph width in pixels. The |w command gives window bounds in
// character cells, so we convert through the selected font width to recover the
// visible text columns for wrapping and paging.

export interface RipSectionDimensions {
    rows: number;
    cols: number;
    reset: boolean;
}

export async function readSessionString(session: ISession, timeout: number, regex?: RegExp): Promise<string> {
    let ret = '';

    while (await session.waitkey(timeout)) {
        const ch = await session.getkey();
        if (ch === '\x1b' || ch.length > 1) break;
        if (regex !== undefined && ch === '\r') break;

        ret += ch;
        if (regex !== undefined && ret.search(regex) !== -1) {
            break;
        }
    }

    return ret;
}

export async function readApcMessage(session: ISession, timeout: number): Promise<string | undefined> {
    let ret = '';
    let state = 0;

    while (await session.waitkey(timeout)) {
        const ch = await session.getkey();
        // APC/private messages arrive as ESC _ payload ESC \
        // State 0: wait for ESC
        // State 1: wait for underscore introducer
        // State 2: accumulate payload bytes
        // State 3: require the final backslash terminator
        switch (state) {
        case 0:
            if (ch === '\x1b') {
                state++;
            }
            break;
        case 1:
            if (ch === '_') {
                state++;
                break;
            }
            state = 0;
            break;
        case 2:
            if (ch === '\x1b') {
                state++;
                break;
            }
            ret += ch;
            break;
        case 3:
            if (ch === '\\') {
                return ret;
            }
            return undefined;
        }
    }

    return undefined;
}

export async function detectRipSupport(session: ISession, timeout: number): Promise<boolean> {
    // RIPterm/SyncTERM answer this probe with a RIPSCRIP capability string.
    session.print('\x1b[!\x1b[6n');
    const response = await readSessionString(session, timeout, /RIPSCRIP[0-9]{6}/);
    return response.includes('RIPSCRIP');
}

export function getRipSectionDimensions(lines: string[]): RipSectionDimensions {
    let textH = 0;
    let textW = 0;
    let reset = false;
    const reW = /\|w([0-9A-Za-z]{10})/g;

    for (const line of lines) {
        if (line.includes('|*')) reset = true;
        for (const match of line.matchAll(reW)) {
            const args = match[1];
            // |w packs x0/y0/x1/y1/font flags into base-36 pairs. Convert them
            // back into text geometry so RIP screens paginate like ANSI text.
            const x0 = parseInt(args.substring(0, 2), 36);
            const y0 = parseInt(args.substring(2, 4), 36);
            const x1 = parseInt(args.substring(4, 6), 36);
            const y1 = parseInt(args.substring(6, 8), 36);
            const size = parseInt(args.substring(9, 10), 36);

            if (x0 === 0 && y0 === 0 && x1 === 0 && y1 === 0) continue;

            const cellW = x1 - x0 + 1;
            const cellH = y1 - y0 + 1;
            const fontW = RIP_FONT_W[size & 0x0f] ?? 8;
            const pixelW = cellW * fontW;
            const clampedW = pixelW - RIP_INSET_PX * 2;
            const visibleCols = Math.floor(clampedW / fontW);

            if (cellH > 0) textH = cellH;
            if (visibleCols > 0) textW = visibleCols;
        }
    }

    return { rows: textH, cols: textW, reset };
}

export function applyRipSectionDimensions(
    session: Pick<ISession, 'rows' | 'cols'>,
    lines: string[],
    defaults: { rows: number; cols: number } = { rows: 24, cols: 80 },
): RipSectionDimensions {
    const dims = getRipSectionDimensions(lines);

    if (dims.reset) {
        session.rows = defaults.rows;
        session.cols = defaults.cols;
    }
    if (dims.rows > 1) {
        session.rows = dims.rows;
    }
    if (dims.cols > 1) {
        session.cols = dims.cols;
    }

    return dims;
}

export async function queryRipAssetCache(session: ISession, timeout: number): Promise<Record<string, string> | undefined> {
    // First probe the SyncTERM cache extension itself. If that succeeds, ask
    // for the current RIP/* listing so Output can upload only missing assets.
    session.print('\x1b_SyncTERM:C;L;test\x1b\\');
    const status = await readApcMessage(session, timeout);
    if (status === undefined) {
        return undefined;
    }

    const files: Record<string, string> = {};
    session.print('\x1b_SyncTERM:C;L;RIP/*.*\x1b\\');
    const list = await readApcMessage(session, timeout);
    if (list) {
        for (const entry of list.split('\n')) {
            const parts = entry.split('\t');
            if (parts.length === 2) {
                files[parts[0]] = parts[1];
            }
        }
    }

    return files;
}

export function ripAssetHashMatches(localPath: string, expectedHash?: string): boolean {
    if (expectedHash === undefined) {
        return false;
    }

    try {
        const data = fs.readFileSync(localPath);
        const hash = crypto.createHash('md5').update(data).digest('hex');
        return hash === expectedHash;
    } catch (_e) {
        return false;
    }
}

export async function uploadRipAssetToCache(
    session: ISession,
    fname: string,
    localPath: string,
    drainInput: boolean = false,
): Promise<boolean> {
    try {
        const data = fs.readFileSync(localPath);
        const b64 = data.toString('base64');
        session.print('\x1b_SyncTERM:C;S;RIP/' + fname + ';' + b64 + '\x1b\\');
        if (drainInput) {
            while (await session.waitkey(0)) {
                await session.getkey();
            }
        }
        return true;
    } catch (_e) {
        return false;
    }
}