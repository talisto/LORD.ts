import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import IGM from '@lordts/igm/IGM';
import { Lazy } from '@lordts/util/Lazy';
import type IO from '@lordts/core/io/IO';

function makeIo(): IO {
    return {
        sln: jest.fn(async () => {}),
        lln: jest.fn(async () => {}),
        lw: jest.fn(async () => {}),
        sw: jest.fn(() => {}),
        getkey: jest.fn(async () => '\r'),
        showTxt: jest.fn(async () => {}),
    } as unknown as IO;
}

function makeIgm(tmpDir: string): IGM {
    const io = makeIo();
    const runtimeDir = path.join(tmpDir, 'runtime');
    const player = {
        put: jest.fn(),
        checkFields: jest.fn(),
        Record: 1,
    };
    const storage = {
        clearPlayerLocation: jest.fn(),
        setPlayerLocation: jest.fn(),
        getPlayerLocation: jest.fn(() => []),
    };
    const ctx = {
        io,
        fileUtils: {},
        settings: {},
        baseDir: tmpDir,
        dataDir: path.join(tmpDir, 'data'),
        runtimeDir,
        player,
        state: {},
        equipment: {},
        log: {},
        morechk: false,
    };

    return new IGM(
        io,
        tmpDir,
        runtimeDir,
        {} as unknown as any,
        { no_igms_allowed: false } as unknown as any,
        new Lazy(() => player as unknown as any),
        { node: 1 } as unknown as any,
        new Lazy(() => ctx as unknown as any),
        new Lazy(() => storage as unknown as any),
    );
}

describe('IGM', () => {
    test('createOtherPlaces respects no_igms_allowed', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-igm-'));
        const igm = makeIgm(tmp);
        (igm as unknown as { settings: { no_igms_allowed: boolean } }).settings.no_igms_allowed = true;

        const places = igm.createOtherPlaces();

        expect(places).toEqual([]);
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('createOtherPlaces reads runtime/3rdparty.dat entries', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-igm-'));
        const runtimeDir = path.join(tmp, 'runtime');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.writeFileSync(path.join(runtimeDir, '3rdparty.dat'), 'foo/bar.js\nBar IGM\n', 'utf8');

        const igm = makeIgm(tmp);
        const places = igm.createOtherPlaces();

        expect(places.length).toBe(1);
        expect(places[0].desc).toBe('Bar IGM');
        expect(places[0].jsIgm).toBe(false);
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('handleIgm runs jsIgm module in-process', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-igm-'));
        const modulePath = path.join(tmp, 'dummy-igm.js');
        fs.writeFileSync(
            modulePath,
            'module.exports = class DummyIgm { static desc = "Dummy"; constructor(deps){ this.deps = deps; } async run(){ this.deps.io.sln("ran", 0); } };',
            'utf8',
        );

        const igm = makeIgm(tmp);
        const result = await igm.handleIgm({
            cmdline: modulePath,
            desc: 'Dummy',
            menu: '1',
            jsIgm: true,
            modulePath,
        });

        expect(result).toBe(false);
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    test('runMaintenance invokes static runMaint for discovered igm modules', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-igm-'));
        const igmDir = path.join(tmp, 'igm', 'sample');
        fs.mkdirSync(igmDir, { recursive: true });
        fs.writeFileSync(
            path.join(igmDir, 'sample.js'),
            'module.exports = class SampleIgm { static runMaint(){ global.__igmMaintCalled = true; } };',
            'utf8',
        );
        (global as unknown as { __igmMaintCalled?: boolean }).__igmMaintCalled = false;

        const igm = makeIgm(tmp);
        await igm.runMaintenance();

        expect((global as unknown as { __igmMaintCalled?: boolean }).__igmMaintCalled).toBe(true);
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});
