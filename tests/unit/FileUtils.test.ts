/**
 * Tests for FileUtils - specifically the File stub class.
 *
 * Regression test for bug: "f.truncate is not a function"
 * The File class was missing a truncate() method, causing a runtime crash
 * when the Inn and DailyMaint conversation boards tried to overwrite a file.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { File } from '@lordts/util/FileUtils';

// Helper: create a temp file with the given content and return its path.
function makeTempFile(content: string): string {
    const p = path.join(os.tmpdir(), `lord-test-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(p, content, 'utf8');
    return p;
}

describe('File', () => {
    let tmpPath: string;

    afterEach(() => {
        // Clean up temp files
        try { if (tmpPath) fs.unlinkSync(tmpPath); } catch (_e) { /* ignore */ }
    });

    describe('truncate()', () => {
        test('truncate(0) empties an existing file', () => {
            tmpPath = makeTempFile('hello world\nsecond line\n');
            const f = new File(tmpPath);

            // This was the failing call: cast to unknown to call truncate because
            // the method didn't exist on the File class.
            f.truncate(0);

            const result = fs.readFileSync(tmpPath, 'utf8');
            expect(result).toBe('');
            expect(result.length).toBe(0);
        });

        test('truncate(n) trims file to n bytes', () => {
            tmpPath = makeTempFile('hello world');
            const f = new File(tmpPath);

            f.truncate(5);

            const result = fs.readFileSync(tmpPath, 'utf8');
            expect(result).toBe('hello');
        });

        test('truncate(0) then writeAll writes fresh content', () => {
            // This is the exact sequence used in converse() and talkNow():
            //   1. read existing lines
            //   2. push new lines
            //   3. position = 0
            //   4. truncate(0)    ← was throwing "f.truncate is not a function"
            //   5. writeAll(lines)
            tmpPath = makeTempFile('  `%OldWarrior:\n  `2Greetings!\n');
            const f = new File(tmpPath);
            f.open('r+');

            const raw = f.readAll();
            const lines = raw ? raw.split(/\r?\n/) : [];
            lines.push('  `%NewPlayer:');
            lines.push('  `2Hello there!');

            f.position = 0;
            f.truncate(0);           // ← previously threw
            f.writeAll(lines);
            f.close();

            const written = fs.readFileSync(tmpPath, 'utf8');
            expect(written).toContain('  `%OldWarrior:');
            expect(written).toContain('  `2Greetings!');
            expect(written).toContain('  `%NewPlayer:');
            expect(written).toContain('  `2Hello there!');
        });

        test('File class exposes truncate as a proper method (not via cast)', () => {
            tmpPath = makeTempFile('');
            const f = new File(tmpPath);
            // If truncate were missing, typeof would be 'undefined'
            expect(typeof f.truncate).toBe('function');
        });
    });

    describe('readAll()', () => {
        test('returns null for a non-existent file', () => {
            const f = new File('/tmp/__nonexistent_lord_test__.lrd');
            expect(f.readAll()).toBeNull();
        });

        test('returns file content as a string', () => {
            tmpPath = makeTempFile('line one\nline two\n');
            const f = new File(tmpPath);
            const result = f.readAll();
            expect(result).toContain('line one');
            expect(result).toContain('line two');
        });
    });

    describe('writeAll()', () => {
        test('overwrites the file with the joined lines', () => {
            tmpPath = makeTempFile('old content');
            const f = new File(tmpPath);
            f.writeAll(['new line one', 'new line two']);
            const result = fs.readFileSync(tmpPath, 'utf8');
            expect(result).toBe('new line one\nnew line two');
        });
    });
});
