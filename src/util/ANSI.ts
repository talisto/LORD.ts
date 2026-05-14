/**
 * ANSI Color Utilities for LORD
 *
 * Maps LORD's attribute system (CGA-compatible) to ANSI escape sequences.
 */

'use strict';

// CGA color index to ANSI SGR code mapping
// CGA: 0=black, 1=blue, 2=green, 3=cyan, 4=red, 5=magenta, 6=brown/yellow, 7=white
// with high-intensity bit: 8=dark gray, 9=bright blue, 10=bright green, etc.
export const FG_CODES: readonly string[] = [
    '30',    // 0: black
    '34',    // 1: blue
    '32',    // 2: green
    '36',    // 3: cyan
    '31',    // 4: red
    '35',    // 5: magenta
    '33',    // 6: yellow/brown
    '37',    // 7: white/gray
    '1;30',  // 8: bright black (dark gray)
    '1;34',  // 9: bright blue
    '1;32',  // 10: bright green
    '1;36',  // 11: bright cyan
    '1;31',  // 12: bright red
    '1;35',  // 13: bright magenta
    '1;33',  // 14: bright yellow
    '1;37',  // 15: bright white
];

export const BG_CODES: readonly string[] = [
    '40',    // 0: black
    '44',    // 1: blue
    '42',    // 2: green
    '46',    // 3: cyan
    '41',    // 4: red
    '45',    // 5: magenta
    '43',    // 6: yellow/brown
    '47',    // 7: white/gray
];

/**
 * Convert a LORD CGA attribute byte to an ANSI escape sequence.
 * Bit layout: [blink][bg2][bg1][bg0][hi][fg2][fg1][fg0]
 *   bits 0-2: foreground color (CGA 0-7)
 *   bit 3:    high-intensity (bright) foreground
 *   bits 4-6: background color (CGA 0-7)
 *   bit 7:    blink
 */
export function attrToAnsi(attr: number): string {
    const fg = attr & 0x0f;
    const bg = (attr >> 4) & 0x07;
    const blink = (attr & 0x80) ? '5;' : '';

    // Reset first, then apply
    return `\x1b[0;${blink}${FG_CODES[fg]};${BG_CODES[bg]}m`;
}

/**
 * Set just foreground from attribute
 */
export function fgAnsi(fg: number): string {
    if (fg > 15) {
        // Blink + low nibble
        const code = fg & 0x0f;
        return `\x1b[5;${FG_CODES[code]}m`;
    }
    return `\x1b[${FG_CODES[fg]}m`;
}

/**
 * Set just background
 */
export function bgAnsi(bg: number): string {
    if (bg < 0 || bg > 7) return '';
    return `\x1b[${BG_CODES[bg]}m`;
}

// ── ANSI Art Renderer ───────────────────────────────────────────────────
//
// The original LORD ANSI art was designed for DOS ANSI.SYS, which wraps
// the cursor immediately when printing past column 79.  Modern terminals
// use deferred (pending) wrapping, causing cursor-forward commands after
// column 79 to behave differently.  These helpers resolve all cursor
// positioning by rendering through a virtual screen with DOS wrapping
// semantics, then outputting clean lines with only ANSI SGR (color)
// codes - no cursor positioning.

// ANSI and CGA use different orderings for the base 8 colors:
//   ANSI SGR: 0=black 1=red 2=green 3=yellow 4=blue 5=magenta 6=cyan 7=white
//   CGA:      0=black 1=blue 2=green 3=cyan 4=red 5=magenta 6=yellow 7=white
// This table maps ANSI index -> CGA index (red/blue and cyan/yellow are swapped).
const ANSI_TO_CGA: readonly number[] = [0, 4, 2, 6, 1, 5, 3, 7];

/** CGA palette index → ANSI SGR foreground code */
const CGA_TO_ANSI_FG: readonly number[] = [30, 34, 32, 36, 31, 35, 33, 37];

/** CGA palette index → ANSI SGR background code */
const CGA_TO_ANSI_BG: readonly number[] = [40, 44, 42, 46, 41, 45, 43, 47];

// Precompiled regexes built dynamically to satisfy no-control-regex
const ESC_CH = String.fromCharCode(0x1b);
const RE_CURSOR_UP = new RegExp(ESC_CH + '\\[\\d*A');
const RE_ABS_POS   = new RegExp(ESC_CH + '\\[\\d+;\\d*H');
export const RE_ANSI_SEQ = new RegExp(ESC_CH + '\\[[0-9;]*[a-zA-Z]', 'g');
const ESC_SAVE    = ESC_CH + '[s';
const ESC_RESTORE = ESC_CH + '[u';

/**
 * Returns true when a section contains ANSI cursor-positioning codes
 * (cursor up, save/restore, absolute position) that won't render
 * correctly on modern terminals with deferred line-wrapping.
 */
export function needsAnsiRender(lines: string[]): boolean {
    for (const line of lines) {
        if (RE_CURSOR_UP.test(line)) return true;          // Cursor up
        if (line.includes(ESC_SAVE) || line.includes(ESC_RESTORE)) return true; // Save/restore
        if (RE_ABS_POS.test(line)) return true;            // Absolute position
    }
    return false;
}

/**
 * Convert a CGA attribute byte to an ANSI SGR escape sequence.
 * Emits a full reset-then-set to ensure correctness regardless of
 * the terminal's prior state.
 */
export function cgaAttrToAnsiSGR(cgaAttr: number): string {
    const fg    = cgaAttr & 0x07;
    const bold  = !!(cgaAttr & 0x08);
    const bg    = (cgaAttr >> 4) & 0x07;
    const blink = !!(cgaAttr & 0x80);

    const p: number[] = [0];                    // reset
    if (bold) p.push(1);
    if (blink) p.push(5);
    p.push(CGA_TO_ANSI_FG[fg]);
    p.push(CGA_TO_ANSI_BG[bg]);

    return '\x1b[' + p.join(';') + 'm';
}

/**
 * Render an ANSI art section through a DOS-style 80×N virtual screen,
 * resolving all cursor positioning into clean per-row output with ANSI
 * SGR color codes only.  Trailing empty rows are stripped to prevent
 * unwanted scrolling.
 */
export function renderAnsiSection(inputLines: string[]): string[] {
    const COLS = 80;
    const ROWS = 200;   // Virtual height exceeds any real ANSI art; trimmed to maxY (highest row written)

    // Flat screen buffers
    const chars    = new Array<string>(ROWS * COLS).fill(' ');
    const cellAttr = new Uint8Array(ROWS * COLS).fill(0x07);

    let cx = 0, cy = 0;
    let attr = 0x07;   // current CGA attribute (light grey on black)
    let savedCx = 0, savedCy = 0;
    let maxY = 0;

    // Join lines with \r\n (simulating file playback)
    const data = inputLines.join('\r\n');

    const hasClearScreen = data.includes('\x1b[2J');

    // ── process stream ──────────────────────────────────────────────

    let pos = 0;
    while (pos < data.length) {
        if (data[pos] === '\x1b' && pos + 1 < data.length && data[pos + 1] === '[') {
            pos += 2;
            let params = '';
            while (pos < data.length && ((data[pos] >= '0' && data[pos] <= '9') || data[pos] === ';')) {
                params += data[pos++];
            }
            if (pos < data.length) csi(params, data[pos++]);
        } else if (data[pos] === '\r') {
            cx = 0;
            pos++;
        } else if (data[pos] === '\n') {
            cy++;
            if (cy > maxY) maxY = cy;
            pos++;
        } else {
            putch(data[pos++]);
        }
    }

    /* DOS-style character write with immediate column-80 wrap */
    function putch(ch: string): void {
        if (cx >= COLS) { cx = 0; cy++; }
        if (cy >= ROWS) return;
        const idx = cy * COLS + cx;
        chars[idx] = ch;
        cellAttr[idx] = attr;
        cx++;
        if (cx >= COLS) { cx = 0; cy++; }
        if (cy > maxY) maxY = cy;
    }

    function csi(params: string, cmd: string): void {
        const parts = params ? params.split(';') : [];
        const nums = parts.map(s => (s ? parseInt(s, 10) : 0));

        switch (cmd) {
            case 'H': case 'f': {                           // Cursor position
                const row = nums.length > 0 && nums[0] > 0 ? nums[0] : 1;
                const col = nums.length > 1 && nums[1] > 0 ? nums[1] : 1;
                cy = Math.min(row - 1, ROWS - 1);
                cx = Math.min(col - 1, COLS - 1);
                if (cy > maxY) maxY = cy;
                break;
            }
            case 'A': {                                     // Cursor up
                const n = nums.length > 0 && nums[0] > 0 ? nums[0] : 1;
                cy = Math.max(0, cy - n);
                break;
            }
            case 'B': {                                     // Cursor down
                const n = nums.length > 0 && nums[0] > 0 ? nums[0] : 1;
                cy = Math.min(ROWS - 1, cy + n);
                if (cy > maxY) maxY = cy;
                break;
            }
            case 'C': {                                     // Cursor forward
                const n = nums.length > 0 && nums[0] > 0 ? nums[0] : 1;
                cx = Math.min(COLS - 1, cx + n);
                break;
            }
            case 'D': {                                     // Cursor back
                const n = nums.length > 0 && nums[0] > 0 ? nums[0] : 1;
                cx = Math.max(0, cx - n);
                break;
            }
            case 'J': {                                     // Erase in display
                const n = nums.length > 0 ? nums[0] : 0;
                if (n === 2) {
                    chars.fill(' ');
                    cellAttr.fill(attr);
                }
                break;
            }
            case 'K': {                                     // Erase in line
                const n = nums.length > 0 ? nums[0] : 0;
                if (n === 0 && cy < ROWS) {
                    for (let c = cx; c < COLS; c++) {
                        const idx = cy * COLS + c;
                        chars[idx] = ' ';
                        cellAttr[idx] = attr;
                    }
                }
                break;
            }
            case 'm':                                       // SGR
                sgr(nums.length > 0 ? nums : [0]);
                break;
            case 's':                                       // Save cursor
                savedCx = cx; savedCy = cy;
                break;
            case 'u':                                       // Restore cursor
                cx = savedCx; cy = savedCy;
                break;
        }
    }

    function sgr(params: number[]): void {
        for (const p of params) {
            if (p === 0)           attr = 0x07;
            else if (p === 1)      attr |= 0x08;
            else if (p === 5)      attr |= 0x80;
            else if (p >= 30 && p <= 37)
                attr = (attr & 0xF8) | ANSI_TO_CGA[p - 30];
            else if (p >= 40 && p <= 47)
                attr = (attr & 0x8F) | (ANSI_TO_CGA[p - 40] << 4);
        }
    }

    // ── read back screen → ANSI-encoded entries ─────────────────────

    const entries: string[] = [];
    let lastAttr = -1;
    const effectiveMaxY = Math.min(maxY, ROWS - 1);

    for (let y = 0; y <= effectiveMaxY; y++) {
        // Find rightmost visible cell (non-space or non-black background)
        let rightmost = -1;
        for (let x = COLS - 1; x >= 0; x--) {
            const idx = y * COLS + x;
            if (chars[idx] !== ' ' || ((cellAttr[idx] >> 4) & 0x07) !== 0) {
                rightmost = x;
                break;
            }
        }

        if (rightmost < 0) {
            // Empty row
            entries.push('');
            lastAttr = -1;
            continue;
        }

        // Emit ANSI SGR + character for each visible cell in this row
        let rowContent = '';
        for (let x = 0; x <= rightmost; x++) {
            const idx = y * COLS + x;
            const ca  = cellAttr[idx];
            if (ca !== lastAttr) {
                rowContent += cgaAttrToAnsiSGR(ca);
                lastAttr = ca;
            }
            rowContent += chars[idx];
        }

        // Always push each rendered row as its own entry.  Append a
        // reset (`\x1b[0m`) so any background SGR does not bleed past
        // the end of the line on wider terminals.
        // lln() appends \r\n; on modern terminals with deferred wrapping,
        // \r clears the pending-wrap state so no double-spacing occurs even
        // for full 80-column rows.  Relying on auto-wrap at col 80 was the
        // previous approach but breaks on any terminal wider than 80 columns.
        entries.push(rowContent + '\x1b[0m');
        lastAttr = -1;
    }

    // Strip trailing empty / whitespace-only entries
    while (entries.length > 0) {
        // RE_ANSI_SEQ has the 'g' flag so lastIndex must be reset each call
        const seq = new RegExp(RE_ANSI_SEQ.source, 'g');
        const stripped = entries[entries.length - 1].replace(seq, '').trim();
        if (stripped === '') entries.pop();
        else break;
    }

    // Prepend clear-screen + cursor-home if the original data contained one
    if (hasClearScreen && entries.length > 0) {
        entries[0] = '\x1b[0m\x1b[2J\x1b[H' + entries[0];
    }

    // Ensure a trailing attribute reset
    if (entries.length > 0) {
        entries[entries.length - 1] += '\x1b[0m';
    }

    return entries;
}

/**
 * Re-processes ANSI art designed for 80-column terminals.
 * Inserts explicit line breaks at every 80-visible-character boundary
 * so that the content renders correctly on wider terminals.
 */
export function preprocessAnsi80(content: string): string[] {
    const lines: string[] = [];
    let col = 0;
    let current = '';
    let i = 0;
    while (i < content.length) {
        const ch = content[i];
        if (ch === '\r') {
            col = 0;
            i++;
        } else if (ch === '\n') {
            lines.push(current);
            current = '';
            i++;
        } else if (ch === '\x1b') {
            let seq = ch;
            i++;
            if (i < content.length && content[i] === '[') {
                seq += content[i++];
                while (i < content.length && !/[A-Za-z]/.test(content[i])) {
                    seq += content[i++];
                }
                if (i < content.length) {
                    const cmd = content[i++];
                    seq += cmd;
                    const paramStr = seq.slice(2, -1);
                    const n = parseInt(paramStr || '1', 10) || 1;
                    if (cmd === 'C') {
                        col += n;
                    } else if (cmd === 'D') {
                        // ESC[200D is a common ANSI art idiom meaning "move to column 0"
                        // (move back more than any possible column count)
                        col = n >= 200 ? 0 : Math.max(0, col - n);
                    } else if (cmd === 'G') {
                        col = Math.max(0, n - 1);
                    } else if (cmd === 'H' || cmd === 'f') {
                        const parts = paramStr.split(';');
                        col = Math.max(0, (parseInt(parts[1] || '1', 10) || 1) - 1);
                    }
                }
            } else if (i < content.length) {
                seq += content[i++];
            }
            current += seq;
        } else {
            if (col >= 80) {
                lines.push(current);
                current = '';
                col = 0;
            }
            current += ch;
            col++;
            i++;
        }
    }
    if (current !== '') lines.push(current);
    return lines;
}
