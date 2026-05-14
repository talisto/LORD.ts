import * as Util from '@lordts/util/Util';
import DarkhorseTavern from '@lordts/core/locations/forest/DarkhorseTavern';
import FlowerGarden from '@lordts/core/locations/forest/FlowerGarden';
import Olivia from '@lordts/core/locations/forest/Olivia';
import RescueThePrincess from '@lordts/core/locations/forest/RescueThePrincess';
import type IO from '@lordts/core/io/IO';

type BigIo = {
    sln: jest.Mock<Promise<void>, [string?]>;
    lln: jest.Mock<Promise<void>, [string?]>;
    lw: jest.Mock<Promise<void>, [string?]>;
    sw: jest.Mock<void, [string?]>;
    foreground: jest.Mock<void, [number?]>;
    more: jest.Mock<Promise<void>, []>;
    moreNoMail: jest.Mock<Promise<void>, []>;
    getkey: jest.Mock<Promise<string>, []>;
    getstr: jest.Mock<Promise<string>, [Record<string, unknown>?]>;
    prompt: jest.Mock<Promise<string>, [string?, unknown[]?, string?, Record<string, unknown>?]>;
    showTxt: jest.Mock<Promise<void>, [string?]>;
    showRip: jest.Mock<Promise<void>, [string?]>;
    showBuffer: jest.Mock<Promise<void>, [string?, boolean?, boolean?]>;
    sclrscr: jest.Mock<void, []>;
    mswait: jest.Mock<Promise<void>, [number?]>;
    showStats: jest.Mock<Promise<void>, []>;
    divider: jest.Mock<string, [number?, string?, string?]>;
    emitPrompt: jest.Mock<void, [string?, unknown[]?, string?, string?]>;
};

function makeIo(keys: string[] = [], strs: string[] = []): BigIo {
    return {
        sln: jest.fn(async () => {}),
        lln: jest.fn(async () => {}),
        lw: jest.fn(async () => {}),
        sw: jest.fn(() => {}),
        foreground: jest.fn(() => {}),
        more: jest.fn(async () => {}),
        moreNoMail: jest.fn(async () => {}),
        getkey: jest.fn(async () => keys.shift() ?? '\r'),
        getstr: jest.fn(async () => strs.shift() ?? ''),
        prompt: jest.fn(async () => keys.shift()?.toUpperCase() ?? 'Y'),
        showTxt: jest.fn(async () => {}),
        showRip: jest.fn(async () => {}),
        showBuffer: jest.fn(async () => {}),
        sclrscr: jest.fn(() => {}),
        mswait: jest.fn(async () => {}),
        showStats: jest.fn(async () => {}),
        divider: jest.fn((n?: number, pre?: string, suf?: string) => (pre ?? '') + '-=-=-=-=-'.repeat(10).slice(0, n ?? 75) + (suf ?? '')),
        emitPrompt: jest.fn(),
    };
}

describe('Large forest event classes', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('RescueThePrincess successful rescue grants rewards', async () => {
        const randomSpy = jest.spyOn(Util, 'random');
        randomSpy.mockReturnValueOnce(0).mockReturnValueOnce(2);

        const io = makeIo(['S', 'C', '\r']);
        const player = {
            horse: false,
            done_tower: false,
            sex: 'M',
            level: 2,
            cha: 5,
            exp: 10,
            laid: 0,
            gem: 0,
            name: 'Hero',
        };
        let whichCastle = 1;
        const rescue = new RescueThePrincess(
            io as unknown as IO,
            player as unknown as any,
            { clean_mode: false } as unknown as any,
            ['none', 'Castle Coldrake', 'Fortress Liddux', 'Gannon Keep', 'Penyon Manor', "Dema's Lair"] as unknown as any,
            { logLine: jest.fn(async () => {}) } as unknown as any,
            { tournamentCheck: jest.fn(async () => {}) } as unknown as any,
            () => whichCastle,
            (v: number) => {
                whichCastle = v;
            },
        );

        await rescue.run();

        expect(player.done_tower).toBe(true);
        expect(player.exp).toBeGreaterThan(10);
        expect(player.gem).toBe(6);
    });

    test('Olivia first encounter sets olivia flag', async () => {
        const io = makeIo(['I', 'A']);
        const player = {
            olivia_asshole: false,
            olivia: false,
            sex: 'M',
            name: 'Hero',
        };

        const event = new Olivia(
            io as unknown as IO,
            player as unknown as any,
            { clean_mode: false } as unknown as any,
            [],
            { logLine: jest.fn(async () => {}) } as unknown as any,
            { tournamentCheck: jest.fn(async () => {}) } as unknown as any,
            () => 1,
            () => {},
        );

        await event.run();

        expect(player.olivia).toBe(true);
        expect(io.showTxt).toHaveBeenCalledWith('OLIVIA');
    });

    test('Olivia asshole path can add a forest fight', async () => {
        jest.spyOn(Util, 'random').mockReturnValue(0);
        const io = makeIo(['P']);
        const player = {
            olivia_asshole: true,
            olivia: true,
            forest_fights: 2,
            sex: 'F',
            arm: 'Leather',
            clss: 1,
            level: 10,
            name: 'Heroine',
            put: jest.fn(),
        };

        const event = new Olivia(
            io as unknown as IO,
            player as unknown as any,
            { clean_mode: false } as unknown as any,
            [],
            { logLine: jest.fn(async () => {}) } as unknown as any,
            { tournamentCheck: jest.fn(async () => {}) } as unknown as any,
            () => 1,
            () => {},
        );

        await event.run();

        expect(player.forest_fights).toBe(3);
    });

    test('Olivia kiss path uses olivia_count gate', async () => {
        jest.spyOn(Util, 'random').mockReturnValue(0);
        const io = makeIo(['A']);
        const player = {
            olivia_asshole: false,
            olivia: true,
            olivia_count: 0,
            high_spirits: false,
            sex: 'M',
            name: 'Hero',
            put: jest.fn(),
        };

        const event = new Olivia(
            io as unknown as IO,
            player as unknown as any,
            { clean_mode: false } as unknown as any,
            [],
            { logLine: jest.fn(async () => {}) } as unknown as any,
            { tournamentCheck: jest.fn(async () => {}) } as unknown as any,
            () => 1,
            () => {},
        );

        await event.run();

        expect(player.olivia_count).toBe(1);
        expect(player.high_spirits).toBe(false);
        expect(player.put).toHaveBeenCalled();
        expect(io.lln.mock.calls.some(([line]) => typeof line === 'string' && line.includes("Don't touch me!"))).toBe(true);
    });

    test('DarkhorseTavern gamble flow can increase gold', async () => {
        const randomSpy = jest.spyOn(Util, 'random');
        randomSpy
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(9)
            .mockReturnValueOnce(90)
            .mockReturnValueOnce(20)
            .mockReturnValueOnce(0);

        const io = makeIo(['G', 'R'], ['50']);
        const player = {
            gold: 100,
            laid: 0,
            pvp: 0,
            allPlayers: jest.fn(() => []),
        };

        const tavern = new DarkhorseTavern(
            io as unknown as IO,
            { mode: 'ansi', lastScreen: '' },
            player as unknown as any,
            { getState: jest.fn(async () => {}), married_to_seth: -1, married_to_violet: -1 } as unknown as any,
            { clean_mode: false } as unknown as any,
            { showLog: jest.fn(async () => {}), logLine: jest.fn(async () => {}) } as unknown as any,
            { converse: jest.fn(async () => {}) } as unknown as any,
            { run: jest.fn(async () => {}) } as unknown as any,
        );

        await tavern.run();

        expect(player.gold).toBe(150);
    });

    test('DarkhorseTavern chance practice line path works', async () => {
        jest.spyOn(Util, 'random').mockReturnValue(0);

        const io = makeIo(['T', 'P', 'R', 'R'], ['`5Colors are ``cool']);
        const player = {
            gold: 100,
            laid: 0,
            pvp: 0,
            allPlayers: jest.fn(() => []),
            findPlayer: jest.fn(async () => -1),
            chooseProfession: jest.fn(async () => 1),
            Record: 1,
        };

        const tavern = new DarkhorseTavern(
            io as unknown as IO,
            { mode: 'ansi', lastScreen: '' },
            player as unknown as any,
            { getState: jest.fn(async () => {}), married_to_seth: -1, married_to_violet: -1 } as unknown as any,
            { clean_mode: false } as unknown as any,
            { showLog: jest.fn(async () => {}), logLine: jest.fn(async () => {}) } as unknown as any,
            { converse: jest.fn(async () => {}) } as unknown as any,
            { run: jest.fn(async () => {}) } as unknown as any,
        );

        await tavern.run();

        expect(io.showTxt).toHaveBeenCalledWith('CHANCE');
        expect(io.getstr).toHaveBeenCalled();
    });

    test('FlowerGarden local conversation path appends message', async () => {
        const io = makeIo(['Y', 'Y'], ['Hello there']);
        const player = {
            forest_fights: 4,
            hp: 5,
            hp_max: 12,
            name: 'Hero',
        };
        const storage = {
            hasConversation: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
            initConversation: jest.fn(),
            setConversation: jest.fn(),
            getConversation: jest.fn(() => 'Line1\nLine2'),
            appendConversation: jest.fn(),
        };

        const event = new FlowerGarden(
            io as unknown as IO,
            player as unknown as any,
            { funky_flowers: false } as unknown as any,
            { runtimeOrData: jest.fn(() => 'GARDEN.TXT') } as unknown as any,
            storage as unknown as any,
        );

        await event.run();

        expect(player.forest_fights).toBe(5);
        expect(player.hp).toBe(12);
        expect(storage.appendConversation).toHaveBeenCalled();
    });

    test('FlowerGarden strips background codes while preserving foreground colors when configured', async () => {
        const io = makeIo(['Y', 'Y'], ['`2Hello `r4there']);
        const player = {
            forest_fights: 4,
            hp: 5,
            hp_max: 12,
            name: 'Hero',
        };
        const storage = {
            hasConversation: jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true),
            initConversation: jest.fn(),
            setConversation: jest.fn(),
            getConversation: jest.fn(() => 'Line1\n`2Line`r4Two'),
            appendConversation: jest.fn(),
        };

        const event = new FlowerGarden(
            io as unknown as IO,
            player as unknown as any,
            { funky_flowers: true, flower_garden_allow_background_colors: false } as unknown as any,
            { runtimeOrData: jest.fn(() => 'GARDEN.TXT') } as unknown as any,
            storage as unknown as any,
        );

        await event.run();

        expect(io.showBuffer).toHaveBeenCalledWith('Line1\n`2LineTwo', false, false);
        const appendedLine = storage.appendConversation.mock.calls[0][1][0];
        expect(appendedLine).toContain('`2Hello there`%"');
        expect(appendedLine).not.toContain('`r4');
        expect(appendedLine).not.toContain('`r0');
    });

});
