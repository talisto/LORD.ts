/**
 * Backtick.ts - LORD backtick color-code utilities
 *
 * LORD (Legend of the Red Dragon) uses backtick sequences in text files
 * and in-game strings to encode colors and simple formatting commands.
 *
 * This module provides:
 *   - BACKTICK_FG_MAP:  backtick code → CGA foreground color index
 *   - renderBacktickLine():  convert a LORD-formatted string to ANSI
 *   - resetBacktickAttr():  ANSI escape to reset to default colors
 */

'use strict';

import { attrToAnsi } from './ANSI';
import { dispLen, divider as dividerUtil } from './Util';

// ── Constants ───────────────────────────────────────────────────────────

/** Default CGA attribute byte: white (7) on black (0), no blink. */
export const DEFAULT_ATTR = 7;

/**
 * Map a backtick color-code character to a CGA foreground color index.
 *
 * Standard CGA colors 0–7 (dark), 8–15 (bright).
 * `^` = 0 (black), `)` = 20 (blinking red - the blink bit is applied
 * automatically by the foreground setter when col > 15).
 */
export const BACKTICK_FG_MAP: Record<string, number> = {
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '0': 10, '!': 11, '@': 12, '#': 13, '$': 14, '%': 15,
    '^': 0,
    // `)` = 20 triggers blinking red: setFg() treats values > 15 as 0x80 | (val & 0x0f)
    ')': 20,
};

// ── Pure-function renderer ──────────────────────────────────────────────

/**
 * Set foreground color in a CGA attribute byte.
 * For col 0-15: direct foreground (bits 0-3), preserving background (bits 4-6).
 * For col > 15: blink (bit 7) + foreground (bits 0-3), e.g. 20 -> 0x84 = blinking red.
 */
function setFg(attr: number, col: number): { escape: string; attr: number } {
    if (col > 15) col = 0x80 | (col & 0x0f);
    const newAttr = (attr & 0x70) | col;
    return { escape: attrToAnsi(newAttr), attr: newAttr };
}

/**
 * Compute the new CGA attribute byte after setting a background color,
 * and return the corresponding ANSI escape sequence.
 */
function setBg(attr: number, col: number): { escape: string; attr: number } {
    if (col > 7 || col < 0) return { escape: '', attr };
    const newAttr = (attr & 0x8f) | (col << 4);
    return { escape: attrToAnsi(newAttr), attr: newAttr };
}

/**
 * Render a LORD backtick-coded string to an ANSI string.
 *
 * Handles foreground colors, background (`r`), blinking (`B`), divider
 * line (`l`), clear screen (`c`/`C`), newline (`n`), no-op (`.`), and
 * double-backtick (skipped).
 *
 * Does NOT handle game-specific ext-mode codes or side-effect codes
 * (those require the full `Output.lw()` pipeline).
 *
 * @param str   LORD-formatted input string.
 * @param attr  Starting CGA attribute byte (default: white on black).
 * @param cols  Terminal width for the `l divider code (default: 73).
 * @returns     The rendered ANSI string and the updated attribute byte.
 */
export function renderBacktickLine(
    str: string,
    attr: number = DEFAULT_ATTR,
    cols: number = 73,
): { result: string; attr: number } {
    let result = '';

    for (let i = 0; i < str.length; i++) {
        if (str[i] === '`' && i + 1 < str.length) {
            i++;
            const code = str[i];

            // Foreground color
            if (code in BACKTICK_FG_MAP) {
                const fg = setFg(attr, BACKTICK_FG_MAP[code]);
                result += fg.escape;
                attr = fg.attr;
                continue;
            }

            switch (code) {
            case 'r': // Background color (`r0` – `r7`)
                i++;
                if (i < str.length && str[i] >= '0' && str[i] <= '7') {
                    const bg = setBg(attr, parseInt(str[i]));
                    result += bg.escape;
                    attr = bg.attr;
                }
                break;
            case 'B': // Blinking foreground (`B1` – `B%`, `B^`)
                i++;
                if (i < str.length && str[i] in BACKTICK_FG_MAP) {
                    const fg = setFg(attr, BACKTICK_FG_MAP[str[i]] + 16);
                    result += fg.escape;
                    attr = fg.attr;
                }
                break;
            case 'l': { // Divider line
                const fg = setFg(attr, 2);
                result += fg.escape;
                attr = fg.attr;
                result += dividerUtil(Math.max(0, cols - 2), '  ');
                break;
            }
            case 'c': // Clear screen + 2 newlines
                result += '\x1b[2J\x1b[H\r\n\r\n';
                break;
            case 'C': // Clear screen only
                result += '\x1b[2J\x1b[H';
                break;
            case '>': { // Centering: pad to center remaining visible content
                const remaining = str.substring(i + 1);
                const pad = Math.max(0, Math.floor((cols - dispLen(remaining)) / 2));
                result += ' '.repeat(pad);
                break;
            }
            case 'n': // Newline
                result += '\r\n';
                break;
            case '.': // No-op (blank line placeholder in .lrd files)
                break;
            case '`': // Double backtick - skip (wait-for-key in game context)
                break;
            default:
                // Unknown code - output literal backtick + code
                result += '`' + code;
                break;
            }
        } else {
            result += str[i];
        }
    }

    return { result, attr };
}

/**
 * Return the ANSI escape sequence that resets to default LORD colors
 * (white foreground on black background, no blink).
 */
export function resetBacktickAttr(): string {
    return '\x1b[0m\x1b[0;37m';
}

/**
 * Strip LORD backtick background color codes (`r0` through `r7`) while
 * leaving foreground and other formatting codes intact.
 */
export function stripBacktickBackgroundColors(str: string): string {
    return str.replace(/`r[0-7]/g, '');
}

/**
 * Strip LORD backtick color codes from a string, returning plain text.
 * Removes sequences like `0, `%, `>, etc.
 */
export function stripBacktickCodes(str: string): string {
    return str.replace(/`[0-9!@#$%^)>c<a-z]/gi, '').trim();
}
