import * as Util from '@lordts/util/Util';
import AttackDragon from '@lordts/core/locations/forest/AttackDragon';
import FindLostGold from '@lordts/core/locations/forest/FindLostGold';
import { DeathKnightLevel } from '@lordts/core/locations/forest/DeathKnightLevel';
import MysticalLevel from '@lordts/core/locations/forest/MysticalLevel';
import ThiefLevel from '@lordts/core/locations/forest/ThiefLevel';
import type IO from '@lordts/core/io/IO';

type TestPlayer = {
    seen_dragon: boolean;
    gold: number;
    hp: number;
    hp_max: number;
    forest_fights: number;
    sex: string;
    name: string;
    skillw: number;
    levelw: number;
    olivia_count: number;
    cha: number;
    skillm: number;
    levelm: number;
    skillt: number;
    levelt: number;
    gem: number;
    raiseClass: jest.Mock<Promise<void>, []>;
};

type TestIo = {
    showRip: jest.Mock<Promise<void>, [string?]>;
    showTxt: jest.Mock<Promise<void>, [string?]>;
    sln: jest.Mock<Promise<void>, [string?]>;
    lln: jest.Mock<Promise<void>, [string?]>;
    lw: jest.Mock<Promise<void>, [string?]>;
    sw: jest.Mock<void, [string?]>;
    foreground: jest.Mock<void, [number?]>;
    commandPrompt: jest.Mock<Promise<string>, []>;
    getkey: jest.Mock<Promise<string>, []>;
    getstr: jest.Mock<Promise<string>, [Record<string, unknown>?]>;
    mswait: jest.Mock<Promise<void>, [number?]>;
    more: jest.Mock<Promise<void>, []>;
    moreNoMail: jest.Mock<Promise<void>, []>;
    sclrscr: jest.Mock<void, []>;
    showBuffer: jest.Mock<Promise<void>, [string?, boolean?, boolean?]>;
};

function makeIo(keys: string[] = [], strs: string[] = []): TestIo {
    return {
        showRip: jest.fn(async () => {}),
        showTxt: jest.fn(async () => {}),
        sln: jest.fn(async () => {}),
        lln: jest.fn(async () => {}),
        lw: jest.fn(async () => {}),
        sw: jest.fn(() => {}),
        foreground: jest.fn(() => {}),
        commandPrompt: jest.fn(async () => keys.shift()?.toUpperCase() ?? '\r'),
        getkey: jest.fn(async () => keys.shift() ?? '\r'),
        getstr: jest.fn(async () => strs.shift() ?? ''),
        mswait: jest.fn(async () => {}),
        more: jest.fn(async () => {}),
        moreNoMail: jest.fn(async () => {}),
        sclrscr: jest.fn(() => {}),
        showBuffer: jest.fn(async () => {}),
    };
}

function makePlayer(overrides: Partial<TestPlayer> = {}): TestPlayer {
    return {
        seen_dragon: false,
        gold: 500,
        hp: 10,
        hp_max: 20,
        forest_fights: 5,
        sex: 'M',
        name: 'Hero',
        skillw: 0,
        levelw: 0,
        olivia_count: 0,
        cha: 1,
        skillm: 0,
        levelm: 0,
        skillt: 0,
        levelt: 0,
        gem: 2,
        raiseClass: jest.fn(async () => {}),
        ...overrides,
    };
}

describe('Forest mini event classes', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('AttackDragon returns early when dragon already seen', async () => {
        const io = makeIo();
        const player = makePlayer({ seen_dragon: true });
        const battle = { fightDragon: jest.fn(async () => {}) };
        const event = new AttackDragon(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, battle as unknown as any);

        await event.run();

        expect(battle.fightDragon).not.toHaveBeenCalled();
        expect(io.more).toHaveBeenCalled();
    });

    test('AttackDragon can attack then retreat', async () => {
        const io = makeIo(['A', 'R']);
        const player = makePlayer();
        const battle = {
            fightDragon: jest.fn(async () => {
                player.seen_dragon = true;
            }),
        };
        const event = new AttackDragon(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, battle as unknown as any);

        await event.run();

        expect(battle.fightDragon).toHaveBeenCalledWith(false);
    });

    test('FindLostGold updates player gold', async () => {
        const io = makeIo();
        const player = makePlayer({ gold: 1500 });
        const storage = {
            claimForestGold: jest.fn().mockReturnValue(250),
        };
        const event = new FindLostGold(io as unknown as IO, player as unknown as any, storage as unknown as any);

        await event.run();

        expect(storage.claimForestGold).toHaveBeenCalled();
        expect(player.gold).toBe(1750);
    });

    test('DeathKnightLevel rewards high skill players', async () => {
        const io = makeIo();
        const player = makePlayer({ skillw: 40, hp: 5, hp_max: 25, levelw: 1 });
        const event = new DeathKnightLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(player.hp).toBe(25);
        expect(player.levelw).toBe(2);
    });

    test('DeathKnightLevel can raise class on wise choice', async () => {
        jest.spyOn(Util, 'random').mockReturnValue(0);
        const io = makeIo(['2']);
        const player = makePlayer({ skillw: 10 });
        const event = new DeathKnightLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(player.raiseClass).toHaveBeenCalled();
    });

    test('MysticalLevel leaves when player chooses L', async () => {
        const io = makeIo(['L']);
        const player = makePlayer();
        const event = new MysticalLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(io.more).toHaveBeenCalled();
        expect(player.raiseClass).not.toHaveBeenCalled();
    });

    test('MysticalLevel pass test can increase levelm for masters', async () => {
        const randomSpy = jest.spyOn(Util, 'random');
        randomSpy
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(41);

        const io = makeIo(['K'], ['42']);
        const player = makePlayer({ skillm: 40, levelm: 3 });
        const event = new MysticalLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(player.levelm).toBe(7);
        expect(player.raiseClass).not.toHaveBeenCalled();
    });

    test('ThiefLevel can run master-thief branch', async () => {
        const io = makeIo();
        const player = makePlayer({ skillt: 40, levelt: 5 });
        const event = new ThiefLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(player.levelt).toBe(6);
    });

    test('ThiefLevel gem payment raises class', async () => {
        const io = makeIo(['G']);
        const player = makePlayer({ skillt: 5, gem: 2 });
        const event = new ThiefLevel(io as unknown as IO, { mode: 'ansi', lastScreen: '' }, player as unknown as any, jest.fn(async () => {}));

        await event.run();

        expect(player.gem).toBe(1);
        expect(player.raiseClass).toHaveBeenCalled();
    });
});
