import type IO from '@lordts/core/io/IO';
import { SandBarBlackMarket } from '@lordts/igm-sandbar/sandbarBlackMarket';
import type { SandBarContext } from '@lordts/igm-sandbar/sandbarDefs';

function makeContext(keys: string[]): SandBarContext {
    let keyIndex = 0;

    const io = {
        sclrscr: jest.fn(),
        emitPrompt: jest.fn(),
        lln: jest.fn(async () => {}),
        lw: jest.fn(async () => {}),
        sln: jest.fn(async () => {}),
        getkey: jest.fn(async () => keys[keyIndex++] ?? '\r'),
    } as unknown as IO;

    const player = {
        clss: 0,
        levelw: 0,
        levelm: 0,
        levelt: 0,
    } as unknown as SandBarContext['player'];

    return {
        io,
        player,
        state: {} as SandBarContext['state'],
        log: {} as SandBarContext['log'],
        equipment: {} as SandBarContext['equipment'],
        storage: {} as SandBarContext['storage'],
        config: {
            skillChangeCost: 25,
        } as SandBarContext['config'],
        record: { barcoins: 0, put: jest.fn() } as unknown as SandBarContext['record'],
        file: {} as SandBarContext['file'],
        barcoins: 100,
    };
}

describe('SandBarBlackMarket', () => {
    test.each([
        ['D', 1, { levelw: 1, levelm: 0, levelt: 0 }],
        ['M', 2, { levelw: 0, levelm: 1, levelt: 0 }],
        ['T', 3, { levelw: 0, levelm: 0, levelt: 1 }],
    ] as const)('skill change %s awards the matching use point', async (choice, clss, levels) => {
        const ctx = makeContext(['S', choice, '\r']);
        const market = new SandBarBlackMarket(ctx);

        await (market as unknown as { skillsMenu(): Promise<void> }).skillsMenu();

        expect(ctx.player.clss).toBe(clss);
        expect(ctx.player.levelw).toBe(levels.levelw);
        expect(ctx.player.levelm).toBe(levels.levelm);
        expect(ctx.player.levelt).toBe(levels.levelt);
        expect(ctx.barcoins).toBe(75);
    });
});