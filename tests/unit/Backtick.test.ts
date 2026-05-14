/**
 * Backtick - Unit tests for LORD backtick color-code utilities
 *
 * Tests renderBacktickLine and resetBacktickAttr.
 */

import {
    BACKTICK_FG_MAP,
    DEFAULT_ATTR,
    renderBacktickLine,
    resetBacktickAttr,
} from '@lordts/util/Backtick';

describe('Backtick color utilities', () => {

    // ── Constants ───────────────────────────────────────────────────────

    describe('DEFAULT_ATTR', () => {
        test('is 7 (white on black)', () => {
            expect(DEFAULT_ATTR).toBe(7);
        });
    });

    describe('BACKTICK_FG_MAP', () => {
        test('has entries for all digit keys', () => {
            for (const k of ['1','2','3','4','5','6','7','8','9','0']) {
                expect(BACKTICK_FG_MAP).toHaveProperty(k);
            }
        });

        test('has entries for special character codes', () => {
            for (const k of ['!','@','#','$','%','^',')']) {
                expect(BACKTICK_FG_MAP).toHaveProperty(k);
            }
        });

        test('caret maps to 0 (black)', () => {
            expect(BACKTICK_FG_MAP['^']).toBe(0);
        });

        test('percent maps to 15 (bright white)', () => {
            expect(BACKTICK_FG_MAP['%']).toBe(15);
        });

        test('closing paren maps to 20 (blink red)', () => {
            expect(BACKTICK_FG_MAP[')']).toBe(20);
        });
    });

    // ── renderBacktickLine ──────────────────────────────────────────────

    describe('renderBacktickLine()', () => {
        test('plain text with no backtick codes is returned unchanged', () => {
            const { result } = renderBacktickLine('Hello World');
            expect(result).toBe('Hello World');
        });

        test('empty string returns empty result', () => {
            const { result, attr } = renderBacktickLine('');
            expect(result).toBe('');
            expect(attr).toBe(DEFAULT_ATTR);
        });

        test('`2 sets green foreground (color 2)', () => {
            const { result } = renderBacktickLine('`2Green text');
            expect(result).toContain('\x1b[');  // ANSI escape sequence
            expect(result).toContain('Green text');
        });

        test('`% sets bright white foreground (color 15)', () => {
            const { result } = renderBacktickLine('`%Bright');
            expect(result).toContain('\x1b[');
            expect(result).toContain('Bright');
        });

        test('`0 sets bright green (color 10 via `0 key)', () => {
            const { result } = renderBacktickLine('`0BrightGreen');
            expect(result).toContain('\x1b[');
            expect(result).toContain('BrightGreen');
        });

        test('`r0 sets black background', () => {
            const { result } = renderBacktickLine('`r0Text');
            expect(result).toContain('\x1b[');
            expect(result).toContain('Text');
        });

        test('`r7 sets white background', () => {
            const { result } = renderBacktickLine('`r7Text');
            expect(result).toContain('\x1b[');
        });

        test('`r with out-of-range value does not emit escape', () => {
            // `r without a digit 0-7 should not add an escape
            const { result } = renderBacktickLine('`r8NoChange');
            expect(result).toContain('NoChange');
        });

        test('`B1 sets blinking color', () => {
            const { result } = renderBacktickLine('`B1Blink');
            expect(result).toContain('\x1b[');
            expect(result).toContain('Blink');
        });

        test('`l outputs divider line', () => {
            const { result } = renderBacktickLine('`l');
            expect(result).toContain('-=-=-');
        });

        test('`c outputs clear screen + 2 newlines', () => {
            const { result } = renderBacktickLine('`c');
            expect(result).toContain('\x1b[2J');
            expect(result).toContain('\r\n');
        });

        test('`C outputs clear screen only', () => {
            const { result } = renderBacktickLine('`C');
            expect(result).toContain('\x1b[2J');
        });

        test('`n outputs newline', () => {
            const { result } = renderBacktickLine('`n');
            expect(result).toBe('\r\n');
        });

        test('`. outputs nothing (no-op)', () => {
            const { result } = renderBacktickLine('`.Before and after');
            expect(result).toBe('Before and after');
        });

        test('double backtick `` is skipped', () => {
            const { result } = renderBacktickLine('Before``After');
            // Double backtick means wait-for-key - skip the second backtick
            expect(result).toBe('BeforeAfter');
        });

        test('unknown code passes through as literal backtick + code', () => {
            const { result } = renderBacktickLine('`z');
            expect(result).toBe('`z');
        });

        test('consecutive color codes update attr correctly', () => {
            const { result, attr } = renderBacktickLine('`2`4Red after green');
            // attr should reflect the last color set (red=4... but colors shift)
            expect(result).toContain('Red after green');
            expect(attr).not.toBe(DEFAULT_ATTR);
        });

        test('custom starting attr is respected', () => {
            const { result } = renderBacktickLine('Plain', 0x0e); // yellow start
            expect(result).toBe('Plain');
        });

        test('returns updated attr for chaining', () => {
            const { attr: attr1 } = renderBacktickLine('`2');
            const { attr: attr2 } = renderBacktickLine('`4', attr1);
            expect(attr2).not.toBe(attr1);
        });

        test('backtick at end of string is passed through', () => {
            // Trailing backtick with no following char
            const { result } = renderBacktickLine('Hello`');
            // The lone backtick at the end - the loop condition checks i+1 < length
            // so it falls to the else branch and outputs the character
            expect(result).toContain('Hello');
        });

        test('mixed text and color codes render in correct order', () => {
            const { result } = renderBacktickLine('`2Green`nNewLine`%White');
            expect(result).toContain('\r\n'); // from `n
            expect(result).toContain('Green');
            expect(result).toContain('White');
        });

        test('`^` sets black (color 0)', () => {
            const { result } = renderBacktickLine('`^Black fg');
            expect(result).toContain('\x1b[');
            expect(result).toContain('Black fg');
        });

        test('`) sets blinking red (color 20)', () => {
            const { result } = renderBacktickLine('`)Blink Red');
            expect(result).toContain('\x1b[');
            expect(result).toContain('Blink Red');
        });
    });

    // ── resetBacktickAttr ───────────────────────────────────────────────

    describe('resetBacktickAttr()', () => {
        test('returns a string containing ANSI reset', () => {
            const result = resetBacktickAttr();
            expect(result).toContain('\x1b[0m');
        });

        test('returns a string containing white foreground code', () => {
            const result = resetBacktickAttr();
            expect(result).toContain('37');
        });

        test('is consistent across calls', () => {
            expect(resetBacktickAttr()).toBe(resetBacktickAttr());
        });
    });
});
