import { LdyExecutor } from '@lordts/core/lady/LdyExecutor';
import { parseLdyFile, LdyCommand } from '@lordts/core/lady/LdyParser';
import { Lazy } from '@lordts/util/Lazy';
import * as path from 'path';

type ExecFileCache = { fileCache: Map<string, Map<string, LdyCommand[]>> };

/**
 * Build a minimal mock GameContext suitable for LdyExecutor tests.
 * IO methods record calls so we can assert on output.
 */
function makeMockContext(playerOverrides: Record<string, unknown> = {}) {
    const output: string[] = [];
    const inputQueue: string[] = [];

    const player: Record<string, unknown> = {
        name: 'TestHero',
        real_name: 'Test User',
        hp: 100,
        hp_max: 200,
        str: 20,
        def: 15,
        gold: 500,
        bank: 1000,
        level: 3,
        gem: 2,
        cha: 10,
        forest_fights: 10,
        pvp_fights: 3,
        clss: 1,          // Death Knight
        horse: false,
        sex: 'M',
        seen_bard: false,
        dead: false,
        seen_master: false,
        seen_dragon: false,
        seen_violet: false,
        has_fairy: false,
        kids: 0,
        drag_kills: 0,
        pvp: 0,
        weapon: 'Stick',
        weapon_num: 1,
        arm: 'Coat',
        arm_num: 1,
        laid: 0,
        inn: false,
        on_now: true,
        exp: 100,
        high_spirits: false,
        amulet: 0,
        flirted: false,
        olivia: false,
        divorced: false,
        married_to: 0,
        skillw: 0,
        skillm: 0,
        skillt: 0,
        levelw: 0,
        levelm: 0,
        levelt: 0,
        Record: 1,
        _playerIndex: 1,
        put: jest.fn(),
        ...playerOverrides,
    };

    const io = {
        lln: jest.fn((text: string) => { output.push(text + '\n'); }),
        lw: jest.fn((text: string) => { output.push(text); }),
        sln: jest.fn((text: string) => { output.push(text + '\n'); }),
        sclrscr: jest.fn(),
        showRip: jest.fn(),
        moreNoMail: jest.fn(),
        emitPrompt: jest.fn(),
        getkey: jest.fn(() => Promise.resolve(inputQueue.shift() || '\r')),
        getstr: jest.fn(() => Promise.resolve(inputQueue.shift() || '')),
        prompt: jest.fn(async (text: string | null, options: { key: string; label: string }[], _promptId?: string, config?: any): Promise<string> => {
            if (text) {
                io.lw(text);
            }
            const ch: string = (await io.getkey()).toUpperCase();
            const validKeys = new Set(options.map(o => o.key.toUpperCase()));
            let finalCh: string = ch;
            if (!validKeys.has(ch) && config?.defaultKey) {
                finalCh = config.defaultKey.toUpperCase();
            }
            if (config?.echo !== false) {
                io.sln(finalCh);
            }
            return finalCh;
        }),
    };

    const context: Record<string, any> = {
        player,
        io,
        uiMode: { mode: 'ansi', lastScreen: '' },
        settings: { clean_mode: false },
        state: { latesthero: 'SomeHero', won_by: 0 },
        running: true,
        mail: { addMail: jest.fn() },
        armourStats: [],
        weaponStats: [],
    };

    return { context, player, io, output, inputQueue };
}

/** Helper to build an LdyExecutor from a mock context and ldy directories. */
function makeExecutor(context: Record<string, any>, ldyDirs: string[]): LdyExecutor {
    return new LdyExecutor(
        context.io,
        context.uiMode,
        context.settings,
        ldyDirs,
        new Lazy(() => context.running),
        new Lazy(() => context.state),
        context.armourStats,
        context.weaponStats,
        context.player,
    );
}

describe('LdyExecutor', () => {
    const ldyDirs = [
        path.join(__dirname, '../../ldy/official'),
        path.join(__dirname, '../../ldy/3rdparty'),
    ];

    describe('run() - basic execution', () => {
        test('should handle missing file gracefully', async () => {
            const { context } = makeMockContext();
            const exec = makeExecutor(context, ldyDirs);
            const result = await exec.run('NOSECTION', 'nonexistent_file_xyz.ldy');
            expect(result).toBe('ok');
        });

        test('should handle missing section gracefully', async () => {
            const { context } = makeMockContext();
            const exec = makeExecutor(context, ldyDirs);
            // gem.ldy exists but NOSECTION does not
            const result = await exec.run('NOSECTION', 'gem.ldy');
            expect(result).toBe('ok');
        });

        test('should execute a simple writeln script', async () => {
            const { context } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            // Manually populate the file cache with a test script
            const content = '@#TEST\n@writeln Hello World\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            const result = await exec.run('TEST', 'test.ldy');
            expect(result).toBe('ok');
            expect(context.io.lln).toHaveBeenCalledWith('Hello World', 0);
        });

        test('should return endquest on @endquest', async () => {
            const { context } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@writeln msg\n@endquest\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            const result = await exec.run('TEST', 'test.ldy');
            expect(result).toBe('endquest');
        });

        test('should return endgame on @endgame', async () => {
            const { context } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@endgame\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            const result = await exec.run('TEST', 'test.ldy');
            expect(result).toBe('endgame');
        });
    });

    describe('@set command', () => {
        test('should set a numeric variable', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@set &N1 to 42',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            // &N1 should be expanded to "42" (with locale formatting)
            expect(io.lln).toHaveBeenCalledWith('42', 0);
        });

        test('should increment a player variable', async () => {
            const { context, player } = makeMockContext({ gem: 5 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@set &Pge to +3\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(player.gem).toBe(8);
        });

        test('should decrement a player variable', async () => {
            const { context, player } = makeMockContext({ forest_fights: 10 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@set &Pff to -1\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(player.forest_fights).toBe(9);
        });

        test('should set a boolean player variable', async () => {
            const { context, player } = makeMockContext({ horse: false });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@set &Pho to true\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(player.horse).toBe(true);
        });

        test('should set a string variable', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@set &S1 to Hello World',
                '@writeln &S1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('Hello World', 0);
        });

        test('should set a boolean variable', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@set &B1 to true',
                '@set &B2 to false',
                '@writeln &B1 &B2',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('true false', 0);
        });
    });

    describe('@math command', () => {
        test('should perform addition', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@math &N1 = 10 + 5',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('15', 0);
        });

        test('should perform multiplication with player vars', async () => {
            const { context, io } = makeMockContext({ level: 5 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@math &N1 = 500 * &Plv',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            // 500 * 5 = 2500, displayed with locale formatting
            expect(io.lln).toHaveBeenCalledWith('2,500', 0);
        });

        test('should perform integer division', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@math &N1 = 10 / 3',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('3', 0); // floor(10/3) = 3
        });

        test('should perform modulo with ! operator', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@math &N1 = 10 ! 3',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('1', 0); // 10 % 3 = 1
        });

        test('should handle division by zero', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@math &N1 = 10 / 0',
                '@writeln &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('0', 0);
        });
    });

    describe('@prompt commands', () => {
        test('should display a visible string prompt and store the response', async () => {
            const { context, io, inputQueue } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@prompt &S1 20',
                '@writeln &S1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            inputQueue.push('echo');

            await exec.run('TEST', 'test.ldy');

            expect(io.lw).toHaveBeenCalledWith('  `2Your response? `2: `%');
            expect(io.emitPrompt).toHaveBeenCalledWith('ldy_prompt', [], 'line');
            expect(io.lln).toHaveBeenCalledWith('echo', 0);
        });

        test('should display a visible numeric prompt and store the response', async () => {
            const { context, io, inputQueue } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@promptn 20 3',
                '@writeln &N20',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            inputQueue.push('12');

            await exec.run('TEST', 'test.ldy');

            expect(io.lw).toHaveBeenCalledWith('  `2Enter a number `2: `%');
            expect(io.emitPrompt).toHaveBeenCalledWith('ldy_promptn', [], 'number');
            expect(io.lln).toHaveBeenCalledWith('12', 0);
        });
    });

    describe('@if/@else/@endif control flow', () => {
        test('should execute if-true branch', async () => {
            const { context, io } = makeMockContext({ level: 5 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &Plv > 3 1',
                '@begin',
                '@writeln high level',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('high level', 0);
        });

        test('should execute else branch when condition is false', async () => {
            const { context, io } = makeMockContext({ level: 1 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &Plv > 3 1',
                '@begin',
                '@writeln high level',
                '@end',
                '@else 1',
                '@begin',
                '@writeln low level',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).not.toHaveBeenCalledWith('high level');
            expect(io.lln).toHaveBeenCalledWith('low level', 0);
        });

        test('should evaluate "is true" for boolean player var', async () => {
            const { context, io } = makeMockContext({ horse: true });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &Pho is true 1',
                '@begin',
                '@writeln has horse',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('has horse', 0);
        });

        test('should evaluate "is false" for boolean player var', async () => {
            const { context, io } = makeMockContext({ horse: false });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &Pho is false 1',
                '@begin',
                '@writeln no horse',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('no horse', 0);
        });

        test('should evaluate equality comparison', async () => {
            const { context, io } = makeMockContext({ clss: 2 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &Pcl = 2 1',
                '@begin',
                '@writeln is magician',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('is magician', 0);
        });

        test('should evaluate &rip is true when rip is enabled', async () => {
            const { context, io } = makeMockContext();
            context.uiMode = { mode: 'rip', lastScreen: '' };
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &rip is true 1',
                '@begin',
                '@writeln rip mode',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('rip mode', 0);
        });

        test('should evaluate &rip is false when rip is disabled', async () => {
            const { context, io } = makeMockContext();
            context.uiMode = { mode: 'ansi', lastScreen: '' };
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@if &rip is true 1',
                '@begin',
                '@writeln rip mode',
                '@end',
                '@else 1',
                '@begin',
                '@writeln no rip',
                '@end',
                '@endif 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).not.toHaveBeenCalledWith('rip mode');
            expect(io.lln).toHaveBeenCalledWith('no rip', 0);
        });
    });

    describe('@choice and @case', () => {
        test('should handle choice + case dispatch', async () => {
            const { context, io, inputQueue } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            inputQueue.push('Y');

            const content = [
                '@#TEST',
                '@choice YN   Choose: ',
                '@case responce 1',
                'Y: @writeln Chose yes',
                'N: @writeln Chose no',
                '@endcase 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            // Check that 'Chose yes' was written
            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('Chose yes');
            expect(calls).not.toContain('Chose no');
        });

        test('should default to first option if invalid key pressed', async () => {
            const { context, io, inputQueue } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            inputQueue.push('X'); // Not Y or N

            const content = [
                '@#TEST',
                '@choice YN   Choose: ',
                '@case responce 1',
                'Y: @writeln Chose yes',
                'N: @writeln Chose no',
                '@endcase 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            // Invalid key defaults to first option 'Y'
            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('Chose yes');
        });
    });

    describe('@display/@enddisplay', () => {
        test('should output text within display blocks', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@display',
                '  `2Line one',
                '  `0Line two',
                '@enddisplay',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('  `2Line one');
            expect(calls).toContain('  `0Line two');
        });

        test('should preserve blank lines within display blocks', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#TEST',
                '@display',
                '  `2Line one',
                '',
                '  `0Line two',
                '@enddisplay',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toEqual(expect.arrayContaining(['  `2Line one', '', '  `0Line two']));

            const lineOneIndex = calls.indexOf('  `2Line one');
            const blankLineIndex = calls.indexOf('');
            const lineTwoIndex = calls.indexOf('  `0Line two');
            expect(lineOneIndex).toBeGreaterThanOrEqual(0);
            expect(blankLineIndex).toBeGreaterThan(lineOneIndex);
            expect(lineTwoIndex).toBeGreaterThan(blankLineIndex);
        });
    });

    describe('variable expansion', () => {
        test('should expand &nick to player name', async () => {
            const { context, io } = makeMockContext({ name: 'BraveSir' });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@writeln Hello &nick\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('Hello BraveSir', 0);
        });

        test('should expand player numeric vars', async () => {
            const { context, io } = makeMockContext({ gold: 1234 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@writeln Gold: &Pgo\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            // Player vars are expanded directly (not locale-formatted like &N vars)
            expect(io.lln).toHaveBeenCalledWith('Gold: 1234', 0);
        });

        test('should expand player boolean vars', async () => {
            const { context, io } = makeMockContext({ horse: true });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@writeln Horse: &Pho\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('Horse: true', 0);
        });

        test('should expand &rndN to a number in range', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@set &N1 to &rnd1\n@writeln &N1\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            // &rnd1 always produces 1 (random 1..1)
            expect(io.lln).toHaveBeenCalledWith('1', 0);
        });

        test('should expand &ver to 407', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@writeln Version &ver\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.lln).toHaveBeenCalledWith('Version 407', 0);
        });
    });

    describe('@runsub', () => {
        test('should run a sub-section within the same file', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#MAIN',
                '@writeln Before sub',
                '@runsub HELPER test.ldy',
                '@writeln After sub',
                '',
                '@#HELPER',
                '@writeln Inside helper',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('MAIN', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toEqual(['Before sub', 'Inside helper', 'After sub']);
        });

        test('should run a sub-section with &filename reference', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#MAIN',
                '@runsub SUB &filename',
                '',
                '@#SUB',
                '@writeln From sub',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('MAIN', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('From sub');
        });

        test('should share variables across runsub calls', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = [
                '@#MAIN',
                '@set &N1 to 99',
                '@runsub READER test.ldy',
                '',
                '@#READER',
                '@writeln Val is &N1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('MAIN', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('Val is 99');
        });
    });

    describe('@hitakey and @clrscr', () => {
        test('should call moreNoMail on @hitakey', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@hitakey\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.moreNoMail).toHaveBeenCalled();
        });

        test('should call sclrscr on @clrscr', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@clrscr\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(io.sclrscr).toHaveBeenCalled();
        });
    });

    describe('@delay', () => {
        test('should be a no-op (sync mode)', async () => {
            const { context, io } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@delay 1000\n@writeln after delay\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            const result = await exec.run('TEST', 'test.ldy');
            expect(result).toBe('ok');
            expect(io.lln).toHaveBeenCalledWith('after delay', 0);
        });
    });

    describe('@saveplayer', () => {
        test('should call player.put()', async () => {
            const { context, player } = makeMockContext();
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            const content = '@#TEST\n@saveplayer\n';
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');
            expect(player.put).toHaveBeenCalled();
        });
    });

    describe('complex scripts', () => {
        test('should handle nested @if inside @case with @begin/@end', async () => {
            const { context, io, inputQueue } = makeMockContext({ cha: 5 });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            inputQueue.push('N');

            const content = [
                '@#TEST',
                '@choice YN  Accept? ',
                '@case responce 1',
                'Y: @writeln Accepted',
                'N: @begin',
                '    @if &Pch < 10 1',
                '     @begin',
                '      @writeln Cold response',
                '     @end',
                '     @else 1',
                '     @begin',
                '      @writeln Firm response',
                '     @end',
                '    @endif 1',
                '   @end',
                '@endcase 1',
            ].join('\n');
            const sections = parseLdyFile(content, 'test.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

            await exec.run('TEST', 'test.ldy');

            const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
            expect(calls).toContain('Cold response');
            expect(calls).not.toContain('Firm response');
            expect(calls).not.toContain('Accepted');
        });

        // Regression test for horse.ldy: nested @case inside a case @begin block
        // where some case labels (N:) have an explicit @end and the final label (Y:)
        // does not - the body ends at @endcase. The depth tracker in _executeCaseBody
        // failed to count `case_label` nodes whose inline body is @begin, so the @end
        // that closed N's block was mistakenly treated as the end of the outer B: block,
        // leaving @endcase 2 out of the slice that was passed to _execute().
        describe('nested @case inside outer case @begin block (horse.ldy scenario)', () => {
            // The script mirrors the exact horse.ldy structure:
            //   @choice GBS → outer @case response 1
            //     B: @begin
            //       @choice YN → inner @case response 2
            //         N: @begin … @end           (explicit @end)
            //         Y: @begin … @endcase 2     (NO @end before @endcase)
            //     @end                            (closes B: @begin)
            //     G: @begin … @end
            //   @endcase 1
            const nestedCaseScript = [
                '@#TEST',
                '@math &N10 = 10000 * &Plv',
                '@choice GBS   Your command',
                '@case response 1',
                'B: @begin',
                '@writeln',
                '@choice YN   Buy a horse?',
                '@case response 2',
                'N: @begin',
                '@writeln N-declined',
                '@end',
                'Y: @begin',
                '@if &Pgo < &N10 1',
                ' @begin',
                '  @writeln Y-too-poor',
                ' @end',
                '@else 1',
                '@begin',
                '@set &Pho to true',
                '@set &Pgo to -&N10',
                '@writeln Y-bought',
                '@end',
                '@endif 1',
                '@endcase 2',
                '@end',
                'G: @begin',
                '@writeln G-go-back',
                '@end',
                '@endcase 1',
                '@endquest',
            ].join('\n');

            test('B then Y with insufficient gold shows too-poor message, no @endcase error', async () => {
                // Player has 500 gold; price = 10000 * level(3) = 30000
                const { context, io, inputQueue } = makeMockContext({ gold: 500, level: 3 });
                const exec = makeExecutor(context, ['/tmp']);

                inputQueue.push('B'); // choose Buy from outer choice
                inputQueue.push('Y'); // confirm Yes to buy

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                const sections = parseLdyFile(nestedCaseScript, 'test.ldy');
                (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

                await exec.run('TEST', 'test.ldy');

                const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
                expect(calls).toContain('Y-too-poor');
                expect(calls).not.toContain('Y-bought');
                expect(calls).not.toContain('N-declined');
                expect(calls).not.toContain('G-go-back');

                // Should NOT emit the "[LDY] No matching @endcase" error
                const errorCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
                expect(errorCalls.some(e => e.includes('No matching @endcase'))).toBe(false);

                consoleSpy.mockRestore();
            });

            test('B then N declines without error', async () => {
                const { context, io, inputQueue } = makeMockContext({ gold: 500, level: 3 });
                const exec = makeExecutor(context, ['/tmp']);

                inputQueue.push('B');
                inputQueue.push('N');

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                const sections = parseLdyFile(nestedCaseScript, 'test.ldy');
                (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

                await exec.run('TEST', 'test.ldy');

                const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
                expect(calls).toContain('N-declined');
                expect(calls).not.toContain('Y-too-poor');
                expect(calls).not.toContain('Y-bought');

                const errorCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
                expect(errorCalls.some(e => e.includes('No matching @endcase'))).toBe(false);

                consoleSpy.mockRestore();
            });

            test('B then Y with enough gold buys the horse', async () => {
                // Player has 50000 gold; price = 10000 * 3 = 30000
                const { context, player, inputQueue } = makeMockContext({ gold: 50000, level: 3, horse: false });
                const exec = makeExecutor(context, ['/tmp']);

                inputQueue.push('B');
                inputQueue.push('Y');

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                const sections = parseLdyFile(nestedCaseScript, 'test.ldy');
                (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

                await exec.run('TEST', 'test.ldy');

                // Horse should be set to true and gold deducted
                expect(player.horse).toBe(true);
                expect(player.gold).toBe(50000 - 30000);

                const errorCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
                expect(errorCalls.some(e => e.includes('No matching @endcase'))).toBe(false);

                consoleSpy.mockRestore();
            });

            test('G goes back without entering inner case', async () => {
                const { context, io, inputQueue } = makeMockContext({ gold: 500, level: 3 });
                const exec = makeExecutor(context, ['/tmp']);

                inputQueue.push('G');

                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                const sections = parseLdyFile(nestedCaseScript, 'test.ldy');
                (exec as unknown as ExecFileCache).fileCache.set('test.ldy', sections);

                await exec.run('TEST', 'test.ldy');

                const calls = io.lln.mock.calls.map((c: unknown[]) => c[0]);
                expect(calls).toContain('G-go-back');
                expect(calls).not.toContain('N-declined');
                expect(calls).not.toContain('Y-too-poor');

                const errorCalls = consoleSpy.mock.calls.map((c) => String(c[0]));
                expect(errorCalls.some(e => e.includes('No matching @endcase'))).toBe(false);

                consoleSpy.mockRestore();
            });
        });

        test('should handle a complete oldman-style event', async () => {
            const { context, inputQueue, player } = makeMockContext({
                level: 3,
                gold: 100,
                cha: 5,
                forest_fights: 10,
            });
            const exec = makeExecutor(context, ['/tmp/test-ldy']);

            inputQueue.push('Y'); // Accept the old man's request

            const content = [
                '@#OLDMAN',
                '@verreq 407',
                '@display',
                '`c  `%Event In The Forest`0',
                '`l',
                '',
                '  `2You come across an old man.',
                '@enddisplay',
                '@choice YN   Do you take the old man? [`0Y`2]',
                '@writeln',
                '@case responce 1',
                'Y: @begin',
                '    @math &N1 = 500 * &Plv',
                '    @set &Pgo to +&N1',
                '    @writeln   `2You get `%&N1 `2gold!',
                '    @set &Pch to +1',
                '    @set &Pff to -1',
                '   @end',
                'N: @begin',
                '    @writeln   `2Dismissed.',
                '   @end',
                '@endcase 1',
                '@writeln',
                '@hitakey',
                '@clrscr',
            ].join('\n');
            const sections = parseLdyFile(content, 'oldman.ldy');
            (exec as unknown as ExecFileCache).fileCache.set('oldman.ldy', sections);

            await exec.run('OLDMAN', 'oldman.ldy');

            // Player should gain 500*3 = 1500 gold
            expect(player.gold).toBe(100 + 1500);
            // Charm +1
            expect(player.cha).toBe(6);
            // Forest fights -1
            expect(player.forest_fights).toBe(9);
        });
    });
});
