/**
 * Util - Small pure-utility helpers for LORD
 *
 * These are stateless functions that used to live on PlatformStubs.
 * Import only what you need:
 *
 *   import { random, time, mswait, ascii, format, strftime } from './Util';
 */

'use strict';

import * as util from 'util';
import BadWords from './BadWords';

// Deterministic random for testing: tests pre-load values via queueRandomValues([...]).
// Production code never touches the queue; once exhausted, falls through to Math.random().
const queuedRandomValues: number[] = [];

/** Consume one queued runtime random override, if present. */
export function consumeQueuedRandomValue(): number | undefined {
    return queuedRandomValues.shift();
}

/** Return a random integer in [0, n). */
export function random(n: number): number {
    const queuedValue = consumeQueuedRandomValue();
    if (queuedValue !== undefined) {
        return queuedValue;
    }
    return Math.floor(Math.random() * n);
}

/** Queue exact return values for subsequent random(n) calls. */
export function queueRandomValues(values: number[]): void {
    queuedRandomValues.push(...values.map((value) => Math.trunc(value)));
}

/** Remove any queued runtime random overrides. */
export function clearQueuedRandomValues(): void {
    queuedRandomValues.length = 0;
}

/** Return a copy of the queued runtime random overrides. */
export function getQueuedRandomValues(): number[] {
    return [...queuedRandomValues];
}

/** Promise-based millisecond delay. */
export async function mswait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Current Unix epoch in seconds. */
export function time(): number {
    return Math.floor(Date.now() / 1000);
}

/** sprintf-style formatting (delegates to Node's util.format). */
export function format(fmt: string, ...args: (string | number | boolean)[]): string {
    // Support a subset of printf-style width/precision specifiers used by
    // the LORD codebase: integers like "%2d", zero-padded "%03d", and
    // string width/precision like "%6.6s". Node's util.format doesn't
    // support these, so pre-process them and consume args accordingly.
    if (typeof fmt === 'string' && args.length > 0) {
        let argIndex = 0;
        fmt = fmt.replace(/%([0-9]*)(?:\.([0-9]+))?([dsf])/g, (_m: string, w: string, p: string, spec: string): string => {
            const widthStr = w || '';
            const precStr = p;
            const width = widthStr.length > 0 ? parseInt(widthStr, 10) : 0;
            const zeroPad = widthStr.startsWith('0');
            const prec = precStr ? parseInt(precStr, 10) : undefined;
            const val = args[argIndex++];

            if (spec === 'd') {
                const num = (typeof val === 'number') ? Math.trunc(val) : parseInt(String(val), 10) || 0;
                const s = String(num);
                if (width > s.length) return s.padStart(width, zeroPad ? '0' : ' ');
                return s;
            }
            if (spec === 'f') {
                const num = (typeof val === 'number') ? val : parseFloat(String(val)) || 0;
                const s = (prec !== undefined) ? num.toFixed(prec) : String(num);
                if (width > s.length) return s.padStart(width, zeroPad ? '0' : ' ');
                return s;
            }
            // spec === 's'
            let s = (val === null || val === undefined) ? '' : String(val);
            if (prec !== undefined) s = s.slice(0, prec);
            if (width > s.length) return s.padStart(width, ' ');
            return s;
        });
        if (argIndex > 0) {
            const remaining = args.slice(argIndex);
            return util.format(fmt, ...remaining);
        }
    }
    return util.format(fmt, ...args);
}

/**
 * Lightweight strftime.  Supports: %Y %y %m %d %H %I %M %S %p %P
 */
export function strftime(fmt: string, t?: Date | number): string {
    const d = (t instanceof Date) ? t : (typeof t === 'number' ? new Date(t * 1000) : new Date());
    const pad = (n: number, w: number = 2): string => String(n).padStart(w, '0');
    return String(fmt).replace(/%[YymdHIMSIpP]/g, (m: string): string => {
        switch (m) {
            case '%Y': return String(d.getFullYear());
            case '%y': return String(d.getFullYear()).slice(2);
            case '%m': return pad(d.getMonth() + 1);
            case '%d': return pad(d.getDate());
            case '%H': return pad(d.getHours());
            case '%I': { const h = d.getHours() % 12; return pad(h === 0 ? 12 : h); }
            case '%M': return pad(d.getMinutes());
            case '%S': return pad(d.getSeconds());
            case '%p': return d.getHours() < 12 ? 'AM' : 'PM';
            case '%P': return d.getHours() < 12 ? 'am' : 'pm';
            default:   return m;
        }
    });
}

/**
 * ascii(n) - if n is a number return the character; if a string return charCode.
 */
export function ascii(n: number): string;
export function ascii(n: string): number;
export function ascii(n: number | string): string | number {
    if (typeof n === 'number') return String.fromCharCode(n);
    if (typeof n === 'string' && n.length > 0) return n.charCodeAt(0);
    return 0;
}

// ── String-formatting helpers (formerly StringUtils) ────────────────

/** Format a number with comma separators (e.g. 1000 → "1,000"). */
export function prettyInt(int: number | string): string {
    let ret = parseInt(int as string, 10).toString();
    let i: number;

    for (i = ret.length - 3; i > 0; i -= 3) {
        ret = ret.substr(0, i) + "," + ret.substr(i);
    }
    return ret;
}

/**
 * Strip invalid colour codes from a LORD colour-coded string.
 * Valid foreground codes (`0-`9, `!, `@, `#, `$, `%) are kept.
 * All other backtick sequences (backgrounds, commands) are removed.
 * This sanitizes player-authored text (names, mail) to prevent abuse
 * of command codes like `c (clear screen) in user content.
 */
export function cleanStr(str: string): string {
    let ret = "";
    let i: number;

    for (i = 0; i < str.length; i += 1) {
        if (str[i] !== "`") {
            ret += str[i];
        } else {
            switch (str[i + 1]) {
                case "0":
                case "1":
                case "2":
                case "3":
                case "4":
                case "5":
                case "6":
                case "7":
                case "8":
                case "9":
                case "!":
                case "@":
                case "#":
                case "$":
                case "%":
                    ret += str[i];
                    break;
                default:
                    i += 1;
            }
        }
    }

    // Badwords filter: delegate to the BadWords singleton, which auto-loads
    // BADWORDS.DAT from disk the first time filter() is called.
    return BadWords.instance.filter(ret);
}

/** Return a formatted date string (MM/DD/YYYY). */
export function formatDate(): string {
    const now = new Date();

    return format("%02d/%02d/%04d", now.getMonth() + 1, now.getDate(), now.getFullYear());
}

/** Calculate the display length of a colour-coded string (ignoring colour codes). */
export function dispLen(str: string): number {
    let len = 0;
    let i: number;

    for (i = 0; i < str.length; i += 1) {
        if (str[i] === "`") {
            i += 1;
            if (str[i] === "r") {
                i += 1;
            }
        } else {
            len += 1;
        }
    }

    return len;
}

/** Return only the visible characters of a colour-coded string. */
export function dispStr(str: string): string {
    let ret = "";
    let i: number;

    for (i = 0; i < str.length; i += 1) {
        if (str[i] === "`") {
            i += 1;
            if (str[i] === "r") {
                i += 1;
            }
        } else {
            ret += str[i];
        }
    }

    return ret;
}

/**
 * Capitalise the first letter of each word in a string (proper/title case).
 * Leaves the remainder of each word's casing unchanged.
 */
export function properCase(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
}

/** Centre a colour-coded string within an 80-column display. */
export function center(str: string): string {
    const spaces = "                                        ";
    return spaces.substr(0, (80 - dispLen(str)) / 2) + str;
}

/** Pad a string with spaces to reach the given display length. */
export function spacePad(str: string, len: number, left?: boolean): string {
    if (left === undefined) {
        left = false;
    }

    while (dispLen(str) < len) {
        if (left) {
            str = " " + str;
        } else {
            str += " ";
        }
    }
    return str;
}

/** Generate a divider string of alternating - and = characters. */
export function divider(length: number = 75, prefix: string = '', suffix: string = ''): string {
    let d = '';
    for (let i = 0; i < length; i++) {
        d += (i % 2 === 0) ? '-' : '=';
    }
    return prefix + d + suffix;
}

/**
 * Word-wrap a backtick-coded LORD string to fit within a given display width.
 *
 * Splits at word boundaries (spaces) when the visible text would exceed `width`.
 * Backtick color codes are treated as zero-width and carried forward across
 * wrapped lines so that the color state is preserved.
 *
 * @param str    The backtick-coded string to wrap.
 * @param width  The maximum visible character width per line.
 * @returns      An array of backtick-coded lines (no trailing newlines).
 */
export function wordWrap(str: string, width: number): string[] {
    if (width < 1) width = 80;

    // Fast path: if the visible length fits and no explicit newlines, return as-is.
    if (dispLen(str) <= width && !str.includes('`n')) return [str];

    const lines: string[] = [];
    let currentLine = '';    // accumulated output (including backtick codes)
    let visibleLen = 0;      // visible chars on current line
    let lastSpaceIdx = -1;   // index into currentLine of last space char
    let activeColor = '';    // the last backtick color code we've seen (e.g. "`2")

    let i = 0;
    while (i < str.length) {
        if (str[i] === '`' && i + 1 < str.length) {
            // Backtick sequence - zero-width control code
            const code = str[i + 1];
            if (code === 'r' && i + 2 < str.length) {
                // Background color: `r0 through `r7 - 3 chars
                const seq = str.substring(i, i + 3);
                currentLine += seq;
                activeColor = seq;
                i += 3;
            } else if (code === 'B' && i + 2 < str.length) {
                // Blink foreground: `B<code> - 3 chars
                const seq = str.substring(i, i + 3);
                currentLine += seq;
                activeColor = seq;
                i += 3;
            } else if (code === 'n') {
                // Explicit newline - flush current line and start new one
                lines.push(currentLine);
                currentLine = activeColor;
                visibleLen = 0;
                lastSpaceIdx = -1;
                i += 2;
            } else {
                // Standard 2-char backtick code (color or other)
                const seq = str.substring(i, i + 2);
                currentLine += seq;
                // Track foreground color codes for carry-forward
                if (code in { '0':1,'1':1,'2':1,'3':1,'4':1,'5':1,'6':1,'7':1,
                    '8':1,'9':1,'!':1,'@':1,'#':1,'$':1,'%':1,'^':1,')':1 }) {
                    activeColor = seq;
                }
                i += 2;
            }
            continue;
        }

        // Visible character - check if we need to wrap BEFORE adding it
        if (str[i] === ' ' && visibleLen >= width) {
            // Space at or past the boundary - break here, discard the space
            lines.push(currentLine);
            currentLine = activeColor;
            visibleLen = 0;
            lastSpaceIdx = -1;
            i++;
            continue;
        }

        if (visibleLen >= width) {
            // Non-space at boundary - need to wrap
            if (lastSpaceIdx !== -1) {
                // Break at last space
                const beforeSpace = currentLine.substring(0, lastSpaceIdx);
                const afterSpace = currentLine.substring(lastSpaceIdx + 1); // skip the space
                lines.push(beforeSpace);
                currentLine = activeColor + afterSpace + str[i];
                visibleLen = dispLen(afterSpace) + 1;
            } else {
                // No space found - hard break
                lines.push(currentLine);
                currentLine = activeColor + str[i];
                visibleLen = 1;
            }
            lastSpaceIdx = -1;
        } else {
            if (str[i] === ' ') {
                lastSpaceIdx = currentLine.length;
            }
            currentLine += str[i];
            visibleLen++;
        }
        i++;
    }

    // Push remaining content
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}
