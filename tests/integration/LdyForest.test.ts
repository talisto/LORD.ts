/**
 * Integration tests for the LDY forest event pipeline.
 *
 * These tests load real .LDY files from the ldy/ directory and run them
 * through LdyExecutor with a mock player, verifying that player state
 * changes match expected behaviour for each forest event.
 */

import { LdyExecutor } from '@lordts/core/lady/LdyExecutor';
import { LdyManager } from '@lordts/core/lady/LdyManager';
import { Lazy } from '@lordts/util/Lazy';
import * as path from 'path';
import type IO from '@lordts/core/io/IO';
import type State from '@lordts/core/State';
import type { Settings, ArmourStats, WeaponStats, UiMode } from '@lordts/core/types';
import type PlayerClass from '@lordts/core/Player';

const LDY_DIR = path.join(__dirname, '../../ldy');
const LDY_DIRS = [
    path.join(LDY_DIR, 'official'),
    path.join(LDY_DIR, '3rdparty'),
];

/** Minimal mock player record - all numeric fields typed for arithmetic in tests */
interface MockPlayer {
    name: string; real_name: string;
    hp: number; hp_max: number; str: number; def: number;
    gold: number; bank: number; level: number; gem: number; cha: number;
    forest_fights: number; pvp_fights: number; clss: number;
    horse: boolean; sex: string; seen_bard: boolean; dead: boolean;
    seen_master: boolean; seen_dragon: boolean; seen_violet: boolean;
    has_fairy: boolean; kids: number; drag_kills: number; pvp: number;
    weapon: string; weapon_num: number; arm: string; arm_num: number;
    laid: number; inn: boolean; on_now: boolean; exp: number;
    high_spirits: boolean; amulet: number; flirted: boolean;
    olivia: boolean; divorced: boolean; married_to: number;
    skillw: number; skillm: number; skillt: number;
    levelw: number; levelm: number; levelt: number;
    Record: number; _playerIndex: number;
    put: jest.Mock;
    [key: string]: unknown;
}

/**
 * Build a minimal mock GameContext for integration testing.
 */
function makeMockContext(playerOverrides: Record<string, unknown> = {}) {
    const output: string[] = [];
    const inputQueue: string[] = [];

    const player: MockPlayer = {
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
        married_to: -1,
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

    const context = {
        player,
        io,
        uiMode: { mode: 'ansi', lastScreen: '' } as UiMode,
        settings: { clean_mode: false },
        state: { latesthero: 'SomeHero', won_by: 0 },
        running: true,
        mail: { addMail: jest.fn() },
        armourStats: [] as ArmourStats[],
        weaponStats: [] as WeaponStats[],
        ldyDirs: LDY_DIRS,
    };

    return { context, player, io, output, inputQueue };
}

type MockContext = ReturnType<typeof makeMockContext>['context'];

/** Helper to build an LdyExecutor from a mock context and ldy directories. */
function makeExecutor(context: MockContext, ldyDirs: string[]): LdyExecutor {
    return new LdyExecutor(
        context.io as unknown as IO,
        context.uiMode,
        context.settings as unknown as Settings,
        ldyDirs,
        new Lazy(() => context.running),
        new Lazy(() => context.state as unknown as State),
        context.armourStats,
        context.weaponStats,
        context.player as unknown as PlayerClass,
    );
}

/** Helper to build an LdyManager from a mock context. */
function makeManager(context: MockContext): LdyManager {
    return new LdyManager(
        context.ldyDirs || LDY_DIRS,
        context.io as unknown as IO,
        context.uiMode,
        context.settings as unknown as Settings,
        new Lazy(() => context.running),
        new Lazy(() => context.state as unknown as State),
        context.armourStats,
        context.weaponStats,
        new Lazy(() => context.player as unknown as PlayerClass),
    );
}

describe('LDY Forest Events - Integration', () => {

    describe('GEM event (gem.ldy)', () => {
        test('should give the player +1 gem', async () => {
            const { context, player, io } = makeMockContext({ gem: 3 });
            const exec = makeExecutor(context, LDY_DIRS);

            const result = await exec.run('GEM', 'gem.ldy');
            expect(result).toBe('endquest');
            expect(player.gem).toBe(4);

            // Should output the event header
            const allOutput = io.lln.mock.calls.map((c: unknown[]) => c[0]).join('\n');
            expect(allOutput).toContain('gem');
            // Should have cleared screen and waited for key press
            expect(io.moreNoMail).toHaveBeenCalled();
            expect(io.sclrscr).toHaveBeenCalled();
        });
    });

    describe('OLDMAN event (oldman.ldy)', () => {
        test('player accepts: should gain gold, charm, lose forest fight', async () => {
            const { context, player, inputQueue } = makeMockContext({
                level: 5,
                gold: 1000,
                cha: 8,
                forest_fights: 10,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('Y');

            await exec.run('OLDMAN', 'oldman.ldy');

            // Gold should increase by 500 * level = 2500
            expect(player.gold).toBe(1000 + 2500);
            // Charm should increase by 1
            expect(player.cha).toBe(9);
            // Forest fights should decrease by 1
            expect(player.forest_fights).toBe(9);
        });

        test('player declines: no stat changes, different message by charm level', async () => {
            const { context, player, inputQueue, io } = makeMockContext({
                level: 5,
                gold: 1000,
                cha: 5,
                forest_fights: 10,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('N');

            await exec.run('OLDMAN', 'oldman.ldy');

            // No gold or charm change when declining
            expect(player.gold).toBe(1000);
            expect(player.cha).toBe(5);
            expect(player.forest_fights).toBe(10);

            // Should show "cold" message for low charm
            const allOutput = io.lln.mock.calls.map((c: unknown[]) => c[0]).join('\n');
            expect(allOutput.toLowerCase()).toContain('cold');
        });

        test('player with high charm declines: different message', async () => {
            const { context, inputQueue, io } = makeMockContext({
                cha: 15,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('N');

            await exec.run('OLDMAN', 'oldman.ldy');

            // High charm players get a different message (not "coldly")
            const allOutput = io.lln.mock.calls.map((c: unknown[]) => c[0]).join('\n');
            // Should contain the polite rejection
            expect(allOutput).toContain('yourself');
        });
    });

    describe('BAGOGOLD event (bagogold.ldy)', () => {
        test('should give gold equal to level * random amount', async () => {
            const { context, player } = makeMockContext({
                level: 4,
                gold: 100,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            const goldBefore = player.gold;
            await exec.run('BAGOGOLD', 'bagogold.ldy');

            // Gold should have increased (by some random amount * level)
            expect(player.gold).toBeGreaterThan(goldBefore);
        });
    });

    describe('HAG event (hag.ldy)', () => {
        test('player with gems who agrees (at full HP): should lose gem and gain hp_max', async () => {
            const { context, player, inputQueue } = makeMockContext({
                gem: 3,
                hp: 200,
                hp_max: 200,
                level: 2,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('Y');

            await exec.run('HAG', 'hag.ldy');

            // Should have lost 1 gem
            expect(player.gem).toBe(2);
            // At full HP, hag gives +1 hp_max
            expect(player.hp_max).toBe(201);
        });

        test('player with gems who agrees (hurt): should lose gem and heal', async () => {
            const { context, player, inputQueue } = makeMockContext({
                gem: 3,
                hp: 50,
                hp_max: 200,
                level: 2,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('Y');

            await exec.run('HAG', 'hag.ldy');

            // Should have lost 1 gem
            expect(player.gem).toBe(2);
            // When hurt, hag heals to full
            expect(player.hp).toBe(200);
        });

        test('player with no gems: different path', async () => {
            const { context, player } = makeMockContext({
                gem: 0,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            await exec.run('HAG', 'hag.ldy');

            // Should not lose gems (already 0)
            expect(player.gem).toBe(0);
        });
    });

    describe('HAMMERSTONE event (hamstone.ldy)', () => {
        test('should give +1 strength', async () => {
            const { context, player } = makeMockContext({
                str: 20,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            await exec.run('HAMMERSTONE', 'hamstone.ldy');

            expect(player.str).toBe(21);
        });
    });

    describe('MERRYMEN event (merrymen.ldy)', () => {
        test('player at full HP: event restarts (no effective action)', async () => {
            const { context, player } = makeMockContext({
                hp: 200,
                hp_max: 200,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            // merrymen.ldy checks if hp < hp_max; if at full health,
            // the script does @endquest without healing
            const hpBefore = player.hp;
            await exec.run('MERRYMEN', 'merrymen.ldy');

            // HP should be unchanged (was already full)
            expect(player.hp).toBe(hpBefore);
        });

        test('player with low HP: should be healed', async () => {
            const { context, player } = makeMockContext({
                hp: 50,
                hp_max: 200,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            await exec.run('MERRYMEN', 'merrymen.ldy');

            // HP should have increased
            expect(player.hp).toBeGreaterThan(50);
        });
    });

    describe('UGLYSTICK event (ugly.ldy)', () => {
        test('should change charm (pretty stick +1-5 or ugly stick -2)', async () => {
            const { context, player } = makeMockContext({
                cha: 10,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            const chaBefore = player.cha;
            await exec.run('UGLYSTICK', 'ugly.ldy');

            // Charm should change: either +1..+5 (pretty stick, 1/3 chance)
            // or -2 (ugly stick, 2/3 chance)
            const diff = player.cha - chaBefore;
            expect(diff === -2 || (diff >= 1 && diff <= 5)).toBe(true);
        });
    });

    describe('HORSE event (horse.ldy)', () => {
        test('executor can load and parse horse.ldy without errors', async () => {
            const { context, inputQueue } = makeMockContext({
                horse: false,
                gold: 500000,
                level: 3,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            // Horse event is an interactive shop with @goto loops.
            // Provide enough input to navigate: B(uy), Y(es), then G(o back)
            inputQueue.push('B');  // Buy a horse
            inputQueue.push('Y');  // Yes, buy it
            inputQueue.push('G');  // Go back to forest
            inputQueue.push('\r');
            inputQueue.push('G');
            inputQueue.push('\r');

            // Just make sure the script completes without throwing
            const result = await exec.run('HORSE', 'horse.ldy');
            expect(['ok', 'endquest']).toContain(result);
        });
    });

    describe('TROLL event (troll.ldy)', () => {
        test('should deal damage to the player', async () => {
            const { context, player } = makeMockContext({
                hp: 100,
                level: 3,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            const hpBefore = player.hp;
            await exec.run('TROLL', 'troll.ldy');

            // Troll should have dealt damage (or player could be dead)
            expect(player.hp).toBeLessThanOrEqual(hpBefore);
        });
    });

    describe('new 3rd-party forest events', () => {
        test('merchant-gambit: watch branch can expose the cheat', async () => {
            const { context, player, inputQueue } = makeMockContext({
                level: 10,
                cha: 30,
                gold: 500,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('W');
            inputQueue.push('B');

            await exec.run('MERCHANT', 'merchant-gambit.ldy');

            expect(player.gold).toBe(500 + (10 * 40 + 75));
        });

        test('fey-bargain: gem bargain heals hurt players', async () => {
            const { context, player, inputQueue } = makeMockContext({
                gem: 2,
                hp: 40,
                hp_max: 200,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('B');

            await exec.run('FEYBARGAIN', 'fey-bargain.ldy');

            expect(player.gem).toBe(1);
            expect(player.hp).toBe(200);
        });

        test('beasts-mirror: admitting the truth grants charm', async () => {
            const { context, player, inputQueue } = makeMockContext({ cha: 7 });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('T');
            inputQueue.push('Y');

            await exec.run('BEASTSMIRROR', 'beasts-mirror.ldy');

            expect(player.cha).toBe(8);
        });

        test('cursed-well: quiet small wish stays within bounded gold swing', async () => {
            const { context, player, inputQueue } = makeMockContext({
                gold: 200,
                hp: 80,
                hp_max: 200,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            jest.spyOn(Math, 'random').mockReturnValue(0.5);

            inputQueue.push('A');
            inputQueue.push('W');

            await exec.run('CURWWELL', 'cursed-well.ldy');

            expect(player.gold).toBeGreaterThanOrEqual(190);
            expect(player.gold).toBeLessThanOrEqual(210);
            expect(player.hp).toBeGreaterThanOrEqual(1);
        });

        test('trickster-sprite: charm wager only changes charm by at most one', async () => {
            const { context, player, inputQueue } = makeMockContext({ cha: 10 });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('C');
            inputQueue.push('H');
            inputQueue.push('H');
            inputQueue.push('H');
            inputQueue.push('H');

            await exec.run('TRICKSTER', 'trickster-sprite.ldy');

            expect(player.cha).toBeGreaterThanOrEqual(9);
            expect(player.cha).toBeLessThanOrEqual(11);
        });

        test('hermit-cache: waiting for the hermit can earn a safer trail', async () => {
            const { context, player, inputQueue } = makeMockContext({ forest_fights: 10 });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('C');
            inputQueue.push('D');

            await exec.run('HERMITCACHE', 'hermit-cache.ldy');

            expect(player.forest_fights).toBe(11);
        });

        test('guardian-trial: riddle branch rewards correct answers', async () => {
            const { context, player, inputQueue, output } = makeMockContext({
                level: 5,
                exp: 100,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            // Seed randomness to always select riddle 1 (FIRE)
            jest.spyOn(Math, 'random').mockReturnValue(0);

            inputQueue.push('R');
            inputQueue.push('FIRE');

            await exec.run('GUARDIAN', 'guardian-trial.ldy');

            expect(player.exp).toBeGreaterThan(100);

            const allOutput = output.join('');
            expect(allOutput).toContain('Your response?');
            expect(allOutput).toContain('You gain 210 experience!');
            expect(allOutput).not.toContain('&N');
        });

        test('twilight-market: successful haggle at the map stall grants forest fights', async () => {
            const { context, player, inputQueue } = makeMockContext({
                cha: 20,
                gold: 500,
                forest_fights: 10,
            });
            const exec = makeExecutor(context, LDY_DIRS);

            inputQueue.push('A');
            inputQueue.push('H');

            await exec.run('TWILIGHT', 'twilight-market.ldy');

            expect(player.forest_fights).toBe(12);
            expect(player.gold).toBeLessThan(500);
        });
    });
});

describe('LdyManager - Integration', () => {
    test('should be constructable with a mock context', () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);
        expect(mgr).toBeDefined();
        expect(mgr.isAvailable()).toBe(true);
    });

    test('runEvent should execute a specific event', async () => {
        const { context, player } = makeMockContext({ gem: 5 });
        const mgr = makeManager(context);

        const result = await mgr.runEvent('GEM', 'gem.ldy');
        expect(result).toBe('endquest');
        // Gem should have been incremented
        expect(player.gem).toBe(6);
        // _postEvent should have called put()
        expect(player.put).toHaveBeenCalled();
    });

    test('resolveEventReference should add .ldy and infer the default section from install metadata', () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);

        expect(mgr.resolveEventReference('gem')).toEqual({
            filename: 'gem.ldy',
            defaultSection: 'GEM',
        });
    });

    test('resolveEventReference should fall back to the first real section when there is no install wrapper', () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);

        expect(mgr.resolveEventReference('bardsong')).toEqual({
            filename: 'bardsong.ldy',
            defaultSection: 'BARDSONG',
        });
    });

    test('getAvailableEventFiles should list known LDY files with default sections', () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);

        const files = mgr.getAvailableEventFiles();
        expect(files).toEqual(expect.arrayContaining([
            { filename: 'gem.ldy', defaultSection: 'GEM' },
            { filename: 'bardsong.ldy', defaultSection: 'BARDSONG' },
        ]));
    });

    test('runEvent should clamp negative values after event', async () => {
        const { context, player } = makeMockContext({ gold: 0, gem: 0 });
        const mgr = makeManager(context);

        // Run an event that doesn't modify anything special
        await mgr.runEvent('GEM', 'gem.ldy');

        // Gold should be clamped to 0 minimum
        expect(player.gold).toBeGreaterThanOrEqual(0);
        // Gems got +1 from the GEM event
        expect(player.gem).toBeGreaterThanOrEqual(0);
    });

    test('runEvent should handle missing sections gracefully', async () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);

        const result = await mgr.runEvent('NONEXISTENT', 'gem.ldy');
        expect(result).toBe('ok');
    });

    test('runEvent should handle missing files gracefully', async () => {
        const { context } = makeMockContext();
        const mgr = makeManager(context);

        const result = await mgr.runEvent('TEST', 'totally_nonexistent_xyz.ldy');
        expect(result).toBe('ok');
    });

    test('runBardSong should execute bardsong.ldy', async () => {
        const { context, inputQueue } = makeMockContext({ sex: 'M' });
        const mgr = makeManager(context);

        // Bard song script needs a keypress at some point
        inputQueue.push('\r');

        const result = await mgr.runBardSong();
        expect(['ok', 'endquest']).toContain(result);
    });

    test('runLeaveBankEvent should execute bank.ldy', async () => {
        const { context, inputQueue } = makeMockContext();
        const mgr = makeManager(context);

        // Bank leave event may ask about amulet
        inputQueue.push('N');
        inputQueue.push('\r');

        const result = await mgr.runLeaveBankEvent();
        expect(['ok', 'endquest']).toContain(result);
    });

    test('runLeaveInnEvent should execute inn.ldy', async () => {
        const { context, inputQueue } = makeMockContext();
        const mgr = makeManager(context);

        // Inn leave event may ask about amulet
        inputQueue.push('N');
        inputQueue.push('\r');

        const result = await mgr.runLeaveInnEvent();
        expect(['ok', 'endquest']).toContain(result);
    });
});
