import {
    prettyInt,
    cleanStr,
    dispLen,
    dispStr,
    spacePad,
    center,
    format,
    strftime,
    ascii,
    properCase,
    formatDate,
    random,
    time,
    wordWrap,
} from '@lordts/util/Util';
import { stripBacktickBackgroundColors } from '@lordts/util/Backtick';

describe('StringUtils', () => {

    describe('stripBacktickBackgroundColors', () => {
        test('removes background codes while preserving other backtick codes', () => {
            expect(stripBacktickBackgroundColors('`2Hello `r4there`%')).toBe('`2Hello there`%');
        });
    });

    describe('prettyInt', () => {
        test('should format numbers with commas', () => {
            expect(prettyInt(1000)).toBe('1,000');
            expect(prettyInt(1000000)).toBe('1,000,000');
            expect(prettyInt(100)).toBe('100');
            expect(prettyInt(0)).toBe('0');
            expect(prettyInt(-1000)).toBe('-1,000');
        });

        test('handles string input', () => {
            expect(prettyInt('5000')).toBe('5,000');
        });

        test('handles numbers < 1000', () => {
            expect(prettyInt(999)).toBe('999');
            expect(prettyInt(1)).toBe('1');
        });
    });

    describe('cleanStr', () => {
        test('should keep valid color codes', () => {
            expect(cleanStr('`2Hello `0World')).toBe('`2Hello `0World');
            expect(cleanStr('`%Test `#String')).toBe('`%Test `#String');
        });

        test('should remove invalid color codes', () => {
            expect(cleanStr('`xInvalid `yColors')).toBe('Invalid Colors');
        });

        test('keeps all valid single-digit codes 0-9', () => {
            for (let i = 0; i <= 9; i++) {
                const result = cleanStr(`\`${i}Hi`);
                expect(result).toContain(`\`${i}Hi`);
            }
        });

        test('keeps ! @ # $ % codes', () => {
            for (const code of ['!', '@', '#', '$', '%']) {
                const result = cleanStr(`\`${code}Text`);
                expect(result).toContain(`\`${code}Text`);
            }
        });

        test('plain string without codes is returned unchanged', () => {
            expect(cleanStr('Hello World')).toBe('Hello World');
        });
    });

    describe('dispLen', () => {
        test('should calculate display length ignoring color codes', () => {
            expect(dispLen('`2Hello `0World')).toBe(11);
            expect(dispLen('Test')).toBe(4);
        });

        test('ignores background color codes (`r0–`r7)', () => {
            // `r + digit is a 3-char sequence: `, r, digit
            expect(dispLen('`r0Text')).toBe(4);
        });

        test('empty string has length 0', () => {
            expect(dispLen('')).toBe(0);
        });

        test('plain text length equals string length', () => {
            expect(dispLen('Hello')).toBe(5);
        });
    });

    describe('dispStr', () => {
        test('strips color codes but keeps visible text', () => {
            expect(dispStr('`2Hello `0World')).toBe('Hello World');
        });

        test('strips background codes', () => {
            expect(dispStr('`r3Blue bg text')).toBe('Blue bg text');
        });

        test('empty string returns empty', () => {
            expect(dispStr('')).toBe('');
        });

        test('plain text returned unchanged', () => {
            expect(dispStr('NoColors')).toBe('NoColors');
        });

        test('nested/consecutive codes', () => {
            expect(dispStr('`2`4Red')).toBe('Red');
        });
    });

    describe('spacePad', () => {
        test('should pad string to specified length', () => {
            expect(spacePad('Test', 10)).toBe('Test      ');
            expect(spacePad('Test', 10, true)).toBe('      Test');
            expect(spacePad('Test', 2)).toBe('Test');
        });

        test('left-pads numbers correctly', () => {
            const result = spacePad('42', 5, true);
            expect(result).toBe('   42');
        });

        test('string already at length is returned unchanged', () => {
            expect(spacePad('Hello', 5)).toBe('Hello');
        });

        test('color-coded string uses display length for padding', () => {
            // `2Hi is 2 visible chars
            const result = spacePad('`2Hi', 5);
            expect(result.endsWith('   ')).toBe(true);
        });
    });

    describe('center', () => {
        test('should center string within 80 characters', () => {
            const centered = center('Test');
            expect(centered.length).toBe(38 + 4);
            expect(centered.startsWith('                                      ')).toBe(true);
        });

        test('centers a longer string', () => {
            const str = 'Hello World 80 Chars Test';
            const centered = center(str);
            const spaces = (centered.length - str.length) / 2;
            expect(spaces).toBeGreaterThan(0);
        });

        test('works with color-coded string using display length', () => {
            const str = '`2Color';  // display length = 5
            const centered = center(str);
            expect(centered).toContain('`2Color');
        });
    });

    describe('format', () => {
        test('formats integers with %d', () => {
            expect(format('%d', 42)).toBe('42');
        });

        test('formats zero-padded integer with %02d', () => {
            expect(format('%02d', 5)).toBe('05');
        });

        test('formats zero-padded integer with leading zeros', () => {
            expect(format('%05d', 7)).toBe('00007');
        });

        test('formats float with %f', () => {
            expect(format('%.2f', 3.14159)).toBe('3.14');
        });

        test('formats string with %s', () => {
            expect(format('%s', 'hello')).toBe('hello');
        });

        test('truncates string with precision %6.3s', () => {
            expect(format('%6.3s', 'hello')).toBe('   hel');
        });

        test('handles multiple format args', () => {
            expect(format('%d/%d/%04d', 3, 5, 2026)).toBe('3/5/2026');
        });

        test('falls back to util.format for non-printf args', () => {
            const result = format('Hello %s', 'World');
            expect(result).toBe('Hello World');
        });

        test('no format args just returns the string', () => {
            expect(format('no args')).toBe('no args');
        });

        test('formats negative integer', () => {
            expect(format('%d', -42)).toBe('-42');
        });

        test('formats float without precision', () => {
            const result = format('%f', 1.5);
            expect(result).toContain('1.5');
        });

        test('handles null/undefined string arg as empty', () => {
            expect(format('%s', null as unknown as string)).toBe('');
        });
    });

    describe('strftime', () => {
        const fixedDate = new Date(2026, 2, 5, 14, 30, 45); // March 5, 2026 at 14:30:45

        test('formats year %Y', () => {
            expect(strftime('%Y', fixedDate)).toBe('2026');
        });

        test('formats 2-digit year %y', () => {
            expect(strftime('%y', fixedDate)).toBe('26');
        });

        test('formats month %m', () => {
            expect(strftime('%m', fixedDate)).toBe('03');
        });

        test('formats day %d', () => {
            expect(strftime('%d', fixedDate)).toBe('05');
        });

        test('formats 24h hour %H', () => {
            expect(strftime('%H', fixedDate)).toBe('14');
        });

        test('formats 12h hour %I', () => {
            expect(strftime('%I', fixedDate)).toBe('02');
        });

        test('formats 12h hour %I at midnight (12)', () => {
            const midnight = new Date(2026, 0, 1, 0, 0, 0);
            expect(strftime('%I', midnight)).toBe('12');
        });

        test('formats minutes %M', () => {
            expect(strftime('%M', fixedDate)).toBe('30');
        });

        test('formats seconds %S', () => {
            expect(strftime('%S', fixedDate)).toBe('45');
        });

        test('formats AM/PM %p', () => {
            expect(strftime('%p', fixedDate)).toBe('PM');
            const morning = new Date(2026, 0, 1, 9, 0, 0);
            expect(strftime('%p', morning)).toBe('AM');
        });

        test('formats am/pm lowercase %P', () => {
            expect(strftime('%P', fixedDate)).toBe('pm');
            const morning = new Date(2026, 0, 1, 9, 0, 0);
            expect(strftime('%P', morning)).toBe('am');
        });

        test('accepts unix timestamp (number)', () => {
            const ts = Math.floor(fixedDate.getTime() / 1000);
            const result = strftime('%Y', ts);
            expect(result).toBe('2026');
        });

        test('uses current date when no date provided', () => {
            const result = strftime('%Y');
            expect(result).toBeTruthy();
            expect(result.length).toBe(4);
        });

        test('handles combined format string', () => {
            const result = strftime('%m/%d/%Y', fixedDate);
            expect(result).toBe('03/05/2026');
        });
    });

    describe('ascii', () => {
        test('converts number to character', () => {
            expect(ascii(65)).toBe('A');
            expect(ascii(97)).toBe('a');
            expect(ascii(48)).toBe('0');
        });

        test('converts character to char code', () => {
            expect(ascii('A')).toBe(65);
            expect(ascii('a')).toBe(97);
            expect(ascii('0')).toBe(48);
        });

        test('returns 0 for empty string', () => {
            expect(ascii('')).toBe(0);
        });
    });

    describe('properCase', () => {
        test('capitalizes first letter of each word', () => {
            expect(properCase('hello world')).toBe('Hello World');
        });

        test('leaves existing uppercase unchanged', () => {
            expect(properCase('HELLO WORLD')).toBe('HELLO WORLD');
        });

        test('handles single word', () => {
            expect(properCase('test')).toBe('Test');
        });

        test('handles empty string', () => {
            expect(properCase('')).toBe('');
        });

        test('handles mixed case', () => {
            expect(properCase('the quick brown fox')).toBe('The Quick Brown Fox');
        });
    });

    describe('formatDate', () => {
        test('returns a date in MM/DD/YYYY format', () => {
            const result = formatDate();
            expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        });

        test('year is 4 digits', () => {
            const result = formatDate();
            const parts = result.split('/');
            expect(parts[2].length).toBe(4);
        });
    });

    describe('random', () => {
        test('returns value in [0, n)', () => {
            for (let i = 0; i < 100; i++) {
                const r = random(10);
                expect(r).toBeGreaterThanOrEqual(0);
                expect(r).toBeLessThan(10);
            }
        });

        test('returns integer', () => {
            for (let i = 0; i < 50; i++) {
                const r = random(100);
                expect(Number.isInteger(r)).toBe(true);
            }
        });
    });

    describe('time', () => {
        test('returns current Unix timestamp in seconds', () => {
            const before = Math.floor(Date.now() / 1000);
            const t = time();
            const after = Math.floor(Date.now() / 1000);
            expect(t).toBeGreaterThanOrEqual(before);
            expect(t).toBeLessThanOrEqual(after);
        });
    });

    describe('wordWrap', () => {
        test('returns single-element array when text fits', () => {
            expect(wordWrap('hello world', 80)).toEqual(['hello world']);
        });

        test('returns input as-is for empty string', () => {
            expect(wordWrap('', 80)).toEqual(['']);
        });

        test('wraps plain text at word boundary', () => {
            const text = 'The quick brown fox jumps over the lazy dog';
            const result = wordWrap(text, 20);
            // Each line should be <= 20 visible chars
            for (const line of result) {
                expect(dispLen(line)).toBeLessThanOrEqual(20);
            }
            // Combined content should match original (minus wrapping spaces)
            expect(result.join(' ')).toBe(text);
        });

        test('wraps at exact boundary', () => {
            const result = wordWrap('abcde fghij', 5);
            expect(result).toEqual(['abcde', 'fghij']);
        });

        test('handles long word exceeding width with hard break', () => {
            const result = wordWrap('abcdefghijklmnop', 5);
            expect(result.length).toBeGreaterThan(1);
            expect(dispLen(result[0])).toBeLessThanOrEqual(5);
        });

        test('preserves backtick color codes as zero-width', () => {
            const text = '`2Hello `0World';
            // visible: "Hello World" = 11 chars
            expect(wordWrap(text, 80)).toEqual([text]);
        });

        test('wraps backtick-coded text correctly', () => {
            const text = '`2The quick brown fox `0jumps over the lazy dog';
            const result = wordWrap(text, 20);
            for (const line of result) {
                expect(dispLen(line)).toBeLessThanOrEqual(20);
            }
        });

        test('carries forward active color to wrapped lines', () => {
            const text = '`4This is red text that should wrap to the next line';
            const result = wordWrap(text, 25);
            expect(result.length).toBeGreaterThan(1);
            // Second line should start with the active color code
            expect(result[1].startsWith('`4')).toBe(true);
        });

        test('handles backtick newline code', () => {
            const text = '`2First line`nSecond line';
            const result = wordWrap(text, 80);
            expect(result).toEqual(['`2First line', '`2Second line']);
        });

        test('handles background color codes', () => {
            const text = '`r1`2Hello World';
            expect(wordWrap(text, 80)).toEqual([text]);
        });

        test('handles width < 10 gracefully', () => {
            // wordWrap itself handles any positive width; the Output.lln guard
            // skips wrapping for very narrow terminals
            const result = wordWrap('hello world', 5);
            expect(result.length).toBeGreaterThan(1);
        });

        test('preserves trailing spaces in text', () => {
            const text = 'Hello world  ';
            const result = wordWrap(text, 80);
            expect(result).toEqual(['Hello world  ']);
        });

        test('handles multiple color changes mid-text', () => {
            const text = '`2You `0attack `4the `%dragon `2with your sword and it hits for';
            const result = wordWrap(text, 30);
            expect(result.length).toBeGreaterThan(1);
            for (const line of result) {
                expect(dispLen(line)).toBeLessThanOrEqual(30);
            }
        });
    });
});
