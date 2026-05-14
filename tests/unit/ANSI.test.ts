/**
 * ANSI - Unit tests for ANSI color utilities
 *
 * Tests attrToAnsi, fgAnsi, bgAnsi, needsAnsiRender,
 * cgaAttrToAnsiSGR, and renderAnsiSection.
 */

/* eslint-disable no-control-regex */
import {
    FG_CODES,
    BG_CODES,
    RE_ANSI_SEQ,
    attrToAnsi,
    fgAnsi,
    bgAnsi,
    needsAnsiRender,
    cgaAttrToAnsiSGR,
    renderAnsiSection,
} from '@lordts/util/ANSI';

describe('ANSI color utilities', () => {

    // ── Color lookup tables ─────────────────────────────────────────────

    describe('FG_CODES', () => {
        test('has 16 entries', () => {
            expect(FG_CODES.length).toBe(16);
        });

        test('black is 30', () => {
            expect(FG_CODES[0]).toBe('30');
        });

        test('bright white is 1;37', () => {
            expect(FG_CODES[15]).toBe('1;37');
        });
    });

    describe('BG_CODES', () => {
        test('has 8 entries', () => {
            expect(BG_CODES.length).toBe(8);
        });

        test('black bg is 40', () => {
            expect(BG_CODES[0]).toBe('40');
        });

        test('white bg is 47', () => {
            expect(BG_CODES[7]).toBe('47');
        });
    });

    // ── attrToAnsi ──────────────────────────────────────────────────────

    describe('attrToAnsi()', () => {
        test('default attr (white on black = 0x07) produces correct escape', () => {
            const result = attrToAnsi(0x07);
            expect(result).toContain('\x1b[');
            expect(result).toContain('37');   // white fg
            expect(result).toContain('40');   // black bg
        });

        test('bright white on blue (0x1f)', () => {
            // fg = 0x0f (bright white), bg = 0x01 (blue)
            const result = attrToAnsi(0x1f);
            expect(result).toContain('1;37'); // bright white fg
            expect(result).toContain('44');   // blue bg
        });

        test('blink flag (bit 7 set) adds blink code', () => {
            const result = attrToAnsi(0x87); // blink + white on black
            expect(result).toContain('5;');
        });

        test('black on black (0x00)', () => {
            const result = attrToAnsi(0x00);
            expect(result).toContain('30');  // black fg
            expect(result).toContain('40');  // black bg
        });

        test('all colors produce valid escape sequences', () => {
            for (let attr = 0; attr < 128; attr++) {
                const result = attrToAnsi(attr);
                expect(result).toMatch(/^\x1b\[/);
                expect(result).toMatch(/m$/);
            }
        });
    });

    // ── fgAnsi ──────────────────────────────────────────────────────────

    describe('fgAnsi()', () => {
        test('standard foreground color 7 (white)', () => {
            const result = fgAnsi(7);
            expect(result).toContain('37');
            expect(result).toMatch(/^\x1b\[/);
        });

        test('bright blue (9) has 1;34 code', () => {
            const result = fgAnsi(9);
            expect(result).toContain('1;34');
        });

        test('fg > 15 adds blink bit', () => {
            // Values > 15 indicate blink + low nibble
            const result = fgAnsi(16);
            expect(result).toContain('5;'); // blink
        });

        test('all standard fg values 0-15 produce valid escapes', () => {
            for (let fg = 0; fg <= 15; fg++) {
                const result = fgAnsi(fg);
                expect(result).toMatch(/^\x1b\[/);
                expect(result).toMatch(/m$/);
            }
        });
    });

    // ── bgAnsi ──────────────────────────────────────────────────────────

    describe('bgAnsi()', () => {
        test('black bg (0) returns correct escape', () => {
            const result = bgAnsi(0);
            expect(result).toContain('40');
        });

        test('white bg (7) returns correct escape', () => {
            const result = bgAnsi(7);
            expect(result).toContain('47');
        });

        test('negative bg returns empty string', () => {
            expect(bgAnsi(-1)).toBe('');
        });

        test('bg > 7 returns empty string', () => {
            expect(bgAnsi(8)).toBe('');
            expect(bgAnsi(255)).toBe('');
        });

        test('all valid bg values 0-7 produce valid escapes', () => {
            for (let bg = 0; bg <= 7; bg++) {
                const result = bgAnsi(bg);
                expect(result).toMatch(/^\x1b\[/);
                expect(result).toMatch(/m$/);
            }
        });
    });

    // ── needsAnsiRender ─────────────────────────────────────────────────

    describe('needsAnsiRender()', () => {
        test('returns false for plain text', () => {
            expect(needsAnsiRender(['Hello World', 'No codes here'])).toBe(false);
        });

        test('returns false for simple SGR codes', () => {
            expect(needsAnsiRender(['\x1b[0;37;40m', '\x1b[1;31mText'])).toBe(false);
        });

        test('returns true for cursor up (ESC[A)', () => {
            expect(needsAnsiRender(['\x1b[5AHello'])).toBe(true);
        });

        test('returns true for cursor up without count (ESC[A)', () => {
            expect(needsAnsiRender(['\x1b[AHello'])).toBe(true);
        });

        test('returns true for save cursor (ESC[s)', () => {
            expect(needsAnsiRender(['text\x1b[smore'])).toBe(true);
        });

        test('returns true for restore cursor (ESC[u)', () => {
            expect(needsAnsiRender(['text\x1b[umore'])).toBe(true);
        });

        test('returns true for absolute position (ESC[r;cH)', () => {
            expect(needsAnsiRender(['\x1b[10;5H'])).toBe(true);
        });

        test('returns false for empty array', () => {
            expect(needsAnsiRender([])).toBe(false);
        });

        test('detects cursor up in any line of the array', () => {
            expect(needsAnsiRender(['plain', 'also plain', '\x1b[2Aup'])).toBe(true);
        });
    });

    // ── cgaAttrToAnsiSGR ────────────────────────────────────────────────

    describe('cgaAttrToAnsiSGR()', () => {
        test('default (0x07 = light grey on black) produces reset+fg+bg', () => {
            const result = cgaAttrToAnsiSGR(0x07);
            expect(result).toMatch(/^\x1b\[/);
            expect(result).toMatch(/m$/);
            expect(result).toContain('0');  // reset
        });

        test('bold bit (0x08) produces bold code', () => {
            const result = cgaAttrToAnsiSGR(0x0f); // bright white = white + bold
            expect(result).toContain('1');  // bold
        });

        test('blink bit (0x80) produces blink code', () => {
            const result = cgaAttrToAnsiSGR(0x87); // blink + white on black
            expect(result).toContain('5');  // blink
        });

        test('high bg bit is treated as color, not blink', () => {
            // bg field is (attr >> 4) & 0x07 - so bit 7 is blink only for fg
            const result = cgaAttrToAnsiSGR(0x17); // white fg, blue bg
            expect(result).toContain('44'); // blue bg (ANSI)
        });

        test('all 256 attrs produce valid SGR strings', () => {
            for (let a = 0; a < 256; a++) {
                const r = cgaAttrToAnsiSGR(a);
                expect(r).toMatch(/^\x1b\[[\d;]+m$/);
            }
        });
    });

    // ── RE_ANSI_SEQ ─────────────────────────────────────────────────────

    describe('RE_ANSI_SEQ', () => {
        test('matches basic SGR sequence', () => {
            const m = '\x1b[0;37;40m'.match(RE_ANSI_SEQ);
            expect(m).not.toBeNull();
        });

        test('strips all ANSI codes from a string', () => {
            const raw = '\x1b[1;32mHello\x1b[0m World\x1b[31m!';
            const stripped = raw.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toBe('Hello World!');
        });
    });

    // ── renderAnsiSection ───────────────────────────────────────────────

    describe('renderAnsiSection()', () => {
        test('renders plain text unchanged', () => {
            const result = renderAnsiSection(['Hello World']);
            // Should have at least one line containing "Hello World"
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Hello World');
        });

        test('returns empty array for empty input', () => {
            const result = renderAnsiSection([]);
            expect(result).toEqual([]);
        });

        test('returns empty array for all-empty input', () => {
            const result = renderAnsiSection(['', '', '']);
            expect(result).toEqual([]);
        });

        test('handles cursor-up (ESC[A) by repositioning', () => {
            // Write a line, then cursor up and overwrite
            const data = ['Hello\x1b[1AWorld'];
            const result = renderAnsiSection(data);
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles absolute cursor position (ESC[H)', () => {
            const data = ['\x1b[1;1HTest'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Test');
        });

        test('handles save/restore cursor', () => {
            const data = ['AB\x1b[sCD\x1b[uEF'];
            const result = renderAnsiSection(data);
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles clear screen (ESC[2J) + cursor home', () => {
            const data = ['Before\x1b[2J\x1b[HAfter'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            // Should contain clear screen sequence in result
            expect(combined).toContain('\x1b[2J');
        });

        test('handles SGR color codes', () => {
            const data = ['\x1b[1;32mGreen Text\x1b[0m'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Green Text');
        });

        test('handles cursor movement (C=forward, D=back)', () => {
            const data = ['\x1b[5CForward\x1b[3DBack'];
            const result = renderAnsiSection(data);
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles cursor down (ESC[B)', () => {
            const data = ['\x1b[2BAfterDown'];
            const result = renderAnsiSection(data);
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles erase line (ESC[K)', () => {
            const data = ['ABCDE\x1b[K'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('ABCDE');
        });

        test('handles SGR reset (ESC[0m)', () => {
            const data = ['\x1b[1;31mRed\x1b[0mNormal'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('RedNormal');
        });

        test('wraps at column 80 (DOS style)', () => {
            // 80 chars should wrap to next line
            const longLine = 'A'.repeat(80) + 'B';
            const result = renderAnsiSection([longLine]);
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        test('each output line ends with ANSI reset', () => {
            const data = ['Hello World'];
            const result = renderAnsiSection(data);
            result.filter(l => l.length > 0).forEach(line => {
                expect(line).toContain('\x1b[0m');
            });
        });

        test('strips trailing empty rows', () => {
            const data = ['Content', '', '', ''];
            const result = renderAnsiSection(data);
            // Last entry should not be empty
            expect(result.length).toBeGreaterThan(0);
            const lastStripped = result[result.length - 1]
                .replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '')
                .trim();
            expect(lastStripped).not.toBe('');
        });

        test('handles f cursor command (same as H)', () => {
            const data = ['\x1b[2;10fText'];
            const result = renderAnsiSection(data);
            expect(result.length).toBeGreaterThan(0);
        });

        test('handles bold SGR (ESC[1m)', () => {
            const data = ['\x1b[1mBold'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Bold');
        });

        test('handles blink SGR (ESC[5m)', () => {
            const data = ['\x1b[5mBlink'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Blink');
        });

        test('handles background SGR codes (40-47)', () => {
            const data = ['\x1b[42mGreen BG'];
            const result = renderAnsiSection(data);
            const combined = result.join('');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Green BG');
        });

        test('multiple lines are rendered correctly', () => {
            const data = ['Line 1', 'Line 2', 'Line 3'];
            const result = renderAnsiSection(data);
            const combined = result.join('\n');
            const stripped = combined.replace(new RegExp(RE_ANSI_SEQ.source, 'g'), '');
            expect(stripped).toContain('Line 1');
            expect(stripped).toContain('Line 2');
            expect(stripped).toContain('Line 3');
        });
    });
});
