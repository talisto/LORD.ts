/**
 * CP437 to Unicode mapping for LORD text files.
 *
 * BBS door games used IBM Code Page 437 which includes box-drawing characters,
 * block elements, and other special characters in the 0x80-0xFF range.
 */

'use strict';

// Map of CP437 byte values (128-255) to Unicode characters
const CP437_HIGH: readonly string[] = [
    '\u00C7', '\u00FC', '\u00E9', '\u00E2', '\u00E4', '\u00E0', '\u00E5', '\u00E7', // 80-87
    '\u00EA', '\u00EB', '\u00E8', '\u00EF', '\u00EE', '\u00EC', '\u00C4', '\u00C5', // 88-8F
    '\u00C9', '\u00E6', '\u00C6', '\u00F4', '\u00F6', '\u00F2', '\u00FB', '\u00F9', // 90-97
    '\u00FF', '\u00D6', '\u00DC', '\u00A2', '\u00A3', '\u00A5', '\u20A7', '\u0192', // 98-9F
    '\u00E1', '\u00ED', '\u00F3', '\u00FA', '\u00F1', '\u00D1', '\u00AA', '\u00BA', // A0-A7
    '\u00BF', '\u2310', '\u00AC', '\u00BD', '\u00BC', '\u00A1', '\u00AB', '\u00BB', // A8-AF
    '\u2591', '\u2592', '\u2593', '\u2502', '\u2524', '\u2561', '\u2562', '\u2556', // B0-B7
    '\u2555', '\u2563', '\u2551', '\u2557', '\u255D', '\u255C', '\u255B', '\u2510', // B8-BF
    '\u2514', '\u2534', '\u252C', '\u251C', '\u2500', '\u253C', '\u255E', '\u255F', // C0-C7
    '\u255A', '\u2554', '\u2569', '\u2566', '\u2560', '\u2550', '\u256C', '\u2567', // C8-CF
    '\u2568', '\u2564', '\u2565', '\u2559', '\u2558', '\u2552', '\u2553', '\u256B', // D0-D7
    '\u256A', '\u2518', '\u250C', '\u2588', '\u2584', '\u258C', '\u2590', '\u2580', // D8-DF
    '\u03B1', '\u00DF', '\u0393', '\u03C0', '\u03A3', '\u03C3', '\u00B5', '\u03C4', // E0-E7
    '\u03A6', '\u0398', '\u03A9', '\u03B4', '\u221E', '\u03C6', '\u03B5', '\u2229', // E8-EF
    '\u2261', '\u00B1', '\u2265', '\u2264', '\u2320', '\u2321', '\u00F7', '\u2248', // F0-F7
    '\u00B0', '\u2219', '\u00B7', '\u221A', '\u207F', '\u00B2', '\u25A0', '\u00A0', // F8-FF
];

/**
 * Convert a CP437 encoded string (read as latin1) to proper Unicode.
 * Characters 0-127 are ASCII (same in both), 128-255 differ.
 */
export function cp437toUnicode(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code >= 128) {
            result += CP437_HIGH[code - 128];
        } else {
            result += str[i];
        }
    }
    return result;
}

// Build reverse lookup: Unicode char → CP437 byte value
const unicodeToCP437Map: Record<string, number> = {};
for (let i = 0; i < CP437_HIGH.length; i++) {
    unicodeToCP437Map[CP437_HIGH[i]] = i + 128;
}

/**
 * Convert a Unicode string back to CP437 (as a latin1-encoded string).
 * Characters 0-127 are passed through; mapped high characters are
 * converted back to their CP437 byte values.
 */
export function unicodeToCp437(str: string): string {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 128) {
            result += str[i];
        } else {
            const cp437byte = unicodeToCP437Map[str[i]];
            result += String.fromCharCode(cp437byte !== undefined ? cp437byte : 0x3F); // '?' for unmapped
        }
    }
    return result;
}
