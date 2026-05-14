import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BadWords from '@lordts/util/BadWords';
import { cp437toUnicode, unicodeToCp437 } from '@lordts/util/CP437';
import { GameExitError } from '@lordts/core/GameExitError';
import { JsonLoader } from '@lordts/util/JsonLoader';
import { Lazy } from '@lordts/util/Lazy';

describe('Misc classes lacking direct tests', () => {
    test('Lazy resolves current value from factory each time', () => {
        let n = 1;
        const lazy = new Lazy(() => n);

        expect(lazy.value).toBe(1);
        n = 7;
        expect(lazy.value).toBe(7);
    });

    test('GameExitError has expected name and message', () => {
        const err = new GameExitError();
        expect(err.name).toBe('GameExitError');
        expect(err.message).toBe('Game session ended');
    });

    test('JsonLoader uses runtime override and falls back on parse failure', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-jsonloader-'));
        const dataDir = path.join(tmp, 'data');
        const runtimeDir = path.join(tmp, 'runtime');
        fs.mkdirSync(dataDir, { recursive: true });
        fs.mkdirSync(runtimeDir, { recursive: true });

        fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ source: 'data', v: 1 }), 'utf8');
        fs.writeFileSync(path.join(runtimeDir, 'settings.json'), JSON.stringify({ source: 'runtime', v: 2 }), 'utf8');

        const loader = new JsonLoader(dataDir, { runtime_dir: 'runtime' } as unknown as any, tmp);
        const loaded = loader.load<{ source: string; v: number }>('settings.json');
        expect(loaded.source).toBe('runtime');

        fs.writeFileSync(path.join(runtimeDir, 'settings.json'), '{bad-json', 'utf8');
        const fallback = loader.load<{ source: string; v: number }>('settings.json');
        expect(fallback.source).toBe('data');

        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('BadWords filters configured patterns from BADWORDS.DAT', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-badwords-'));
        const bwPath = path.join(tmp, 'BADWORDS.DAT');
        fs.writeFileSync(bwPath, ';comment\nfoo|bar\n', 'utf8');

        const resolver = {
            runtimeOrData: jest.fn(() => bwPath),
            fileExists: jest.fn(() => true),
        };

        BadWords.instance.configure(resolver);
        const result = BadWords.instance.filter('Foo fighters and foo');
        expect(result).toBe('bar fighters and bar');

        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('CP437 helpers convert in both directions', () => {
        const cp = String.fromCharCode(0xB3); // vertical box char in CP437
        const unicode = cp437toUnicode(cp);
        expect(unicode).toBe('│');

        const roundTrip = unicodeToCp437(unicode);
        expect(roundTrip.charCodeAt(0)).toBe(0xB3);
    });
});
