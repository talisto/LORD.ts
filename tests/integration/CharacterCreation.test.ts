/**
 * Character Creation Flow - Integration tests
 *
 * Tests the full character creation flow: joining the game, picking a name,
 * choosing gender, and selecting a profession.
 */

import { TestHarness, makeDefaultPlayerRecord } from '../harness';
import { HiddenPlayerPolicy } from '@lordts/core/HiddenPlayerPolicy';
import { Player_Def } from '@lordts/storage/RecordDefs';
import { GameExitError } from '@lordts/core/GameExitError';
import type { LoadedPlayerRecord } from '@lordts/core/types';

describe('Character Creation', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('newPlayer()', () => {
        test('creates a male Death Knight character', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'NewPlayer' });

            // Stub player methods for new player flow
            const ctx = harness.context;
            ctx.player!.player = null;

            // playerLength returns 0 (no existing players)
            ctx.player!.playerLength = jest.fn().mockReturnValue(0);
            // playerNew returns a blank record
            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });

            // Stub hello() to avoid the full login flow
            ctx.game.hello = jest.fn();

            // Queue input: name, confirm name, gender=M, profession=K (Death Knight)
            harness.queueKeys(
                'HeroName\r',  // getstr: enter name (typed in getstr call)
                'Y',            // confirm name? Y
                'M',            // gender: M
                'K',            // profession: K (Death Knight)
                '\r',           // more prompt after profession description
            );

            // Need to also handle the console.getstr call for the name
            // which bypasses io.getstr - it uses console.getstr directly
            harness.session.inputQueue.unshift('HeroName');  // for console.getstr() call

            await ctx.player!.newPlayer();

            // Verify: player was created with correct name
            expect(ctx.player!.playerNew).toHaveBeenCalled();
            expect(harness.outputContains('Welcome to the realm')).toBe(true);
        });

        test('creates a female Mystic character', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'Sorceress' });
            const ctx = harness.context;
            ctx.player!.player = null;

            ctx.player!.playerLength = jest.fn().mockReturnValue(0);
            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });
            ctx.game.hello = jest.fn();

            harness.queueKeys(
                'Sorceress',  // console.getstr name
                'Y',          // confirm name
                'F',          // gender: Female
                'D',          // profession: D (Mystic/Magic)
                '\r',         // more prompt
            );

            await ctx.player!.newPlayer();

            expect(ctx.player!.playerNew).toHaveBeenCalled();
        });

        test('creates a Thief character', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'Rogue' });
            const ctx = harness.context;
            ctx.player!.player = null;

            ctx.player!.playerLength = jest.fn().mockReturnValue(0);
            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });
            ctx.game.hello = jest.fn();

            harness.queueKeys(
                'Rogue',    // name
                'Y',        // confirm
                'M',        // gender
                'L',        // profession: L (Thief)
                '\r',       // more
            );

            await ctx.player!.newPlayer();

            expect(harness.outputContains('dishonest lifestyle')).toBe(true);
        });

        test('rejects reserved names', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'BadName' });
            const ctx = harness.context;
            ctx.player!.player = null;

            ctx.player!.playerLength = jest.fn().mockReturnValue(0);
            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });
            ctx.game.hello = jest.fn();

            // First try 'Seth Able' (reserved), then use a valid name
            harness.queueKeys(
                'Seth Able', // console.getstr - reserved name
                'ValidHero', // retry with valid name
                'Y',         // confirm
                'M',         // gender
                'K',         // profession
                '\r',        // more
            );

            await ctx.player!.newPlayer();

            // Should have rejected "Seth Able"
            expect(harness.outputContains('You are not God')).toBe(true);
        });

        test('rejects empty name and exits', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'Empty' });
            const ctx = harness.context;
            ctx.player!.player = null;

            ctx.player!.playerLength = jest.fn().mockReturnValue(0);

            harness.queueKeys('');  // empty name

            await harness.runUntilExit(() => ctx.player!.newPlayer());

            expect(harness.outputContains('WEENIE')).toBe(true);
            // exit is implicitly verified: runUntilExit caught __GAME_EXIT__
        });

        test('rejects too short name', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'Short' });
            const ctx = harness.context;
            ctx.player!.player = null;

            ctx.player!.playerLength = jest.fn().mockReturnValue(0);
            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });
            ctx.game.hello = jest.fn();

            harness.queueKeys(
                'AB',           // too short
                'ValidName',    // valid
                'Y',            // confirm
                'M',            // gender
                'K',            // profession
                '\r',           // more
            );

            await ctx.player!.newPlayer();

            expect(harness.outputContains('longer name')).toBe(true);
        });
    });

    describe('chooseProfession()', () => {
        test('Death Knight (K) shows correct description', async () => {
            harness = TestHarness.create();

            harness.queueKeys('K', '\r');
            const clss = await harness.context.player!.chooseProfession(false);

            expect(clss).toBe(1);
            expect(harness.outputContains('finesse')).toBe(true);
        });

        test('Mystical Skills (D) shows correct description', async () => {
            harness = TestHarness.create();

            harness.queueKeys('D', '\r');
            const clss = await harness.context.player!.chooseProfession(false);

            expect(clss).toBe(2);
            expect(harness.outputContains('unexplainable')).toBe(true);
        });

        test('Thief (L) shows correct description', async () => {
            harness = TestHarness.create();

            harness.queueKeys('L', '\r');
            const clss = await harness.context.player!.chooseProfession(false);

            expect(clss).toBe(3);
            expect(harness.outputContains('dishonest lifestyle')).toBe(true);
        });

        test('rejects invalid input then accepts valid one', async () => {
            harness = TestHarness.create();

            harness.queueKeys('Z', 'K', '\r');
            const clss = await harness.context.player!.chooseProfession(false);

            expect(clss).toBe(1);
            expect(harness.outputContains('Pay attention')).toBe(true);
        });
    });

    describe('loadPlayer()', () => {
        test('finds existing player by real_name', async () => {
            harness = TestHarness.create({ username: 'ExistingUser' });
            const ctx = harness.context;

            // Mock playerGet to return a matching player
            const existingRecord: Record<string, unknown> = {
                name: 'TheHero',
                real_name: 'ExistingUser',
                Record: 0,
                Yours: true,
                on_now: false,
                dead: false,
                hp: 20,
                hp_max: 20,
                put: jest.fn(),
                unLock: jest.fn(),
                reInit: jest.fn(),
                reLoad: jest.fn(),
            };
            ctx.player!.playerGet = jest.fn().mockReturnValue(existingRecord);
            ctx.player!.playerLength = jest.fn().mockReturnValue(1);
            ctx.game.hello = jest.fn();

            await ctx.player!.loadPlayer(false);

            // Should have found and loaded the player
            expect(ctx.player!.player!.real_name).toBe('ExistingUser');
        });

        test('restores visibility when a hidden player logs back in', async () => {
            harness = TestHarness.create({ username: 'ExistingUser' });
            const ctx = harness.context;

            const existingRecord: Record<string, unknown> = {
                name: 'TheHero',
                real_name: 'ExistingUser',
                Record: 0,
                Yours: true,
                on_now: false,
                dead: false,
                hp: 20,
                hp_max: 20,
                put: jest.fn(),
                unLock: jest.fn(),
                reInit: jest.fn(),
                reLoad: jest.fn(),
            };
            HiddenPlayerPolicy.hidePlayer(ctx.storage, 0, 10, 'inactive');
            ctx.player!.playerGet = jest.fn().mockReturnValue(existingRecord);
            ctx.player!.playerLength = jest.fn().mockReturnValue(1);
            ctx.game.hello = jest.fn();

            await ctx.player!.loadPlayer(false);

            expect(HiddenPlayerPolicy.isPlayerHidden(ctx.storage, 0)).toBe(false);
        });

        test('prompts to join when no existing player (create=true)', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'NewUser' });
            const ctx = harness.context;

            // No matching player
            ctx.player!.playerGet = jest.fn().mockReturnValue({
                name: 'X',
                real_name: 'OtherUser',
                Record: 0,
                Yours: true,
                put: jest.fn(),
                unLock: jest.fn(),
                reInit: jest.fn(),
                reLoad: jest.fn(),
            });
            ctx.player!.playerLength = jest.fn().mockReturnValue(1);

            // Queue: Y to join, then name, confirm, gender, profession
            harness.queueKeys(
                'Y',         // Yes, join
                'NewUser',   // name (console.getstr)
                'Y',         // confirm
                'M',         // gender
                'K',         // class
                '\r',        // more
            );

            ctx.player!.playerNew = jest.fn().mockImplementation(() => {
                const rec: Record<string, unknown> = {};
                for (const def of Player_Def) {
                    rec[def.prop] = def.def;
                }
                rec.Record = 0;
                rec.Yours = true;
                rec.put = jest.fn();
                rec.unLock = jest.fn();
                rec.reInit = jest.fn();
                rec.reLoad = jest.fn();
                return rec as unknown as LoadedPlayerRecord;
            });
            ctx.game.hello = jest.fn();

            await ctx.player!.loadPlayer(true);

            expect(harness.outputContains('Joining The Game')).toBe(true);
        });

        test('clears orphaned battle lock and proceeds when attacker is offline', async () => {
            // Regression: if a battle lock existed but the attacker (op) was no
            // longer online (on_now=false), the login wait loop spun forever.
            // The fix breaks out of the loop and clears the stale lock.
            harness = TestHarness.create({ username: 'Victim', createPlayer: false });
            const ctx = harness.context;

            const victim = makeDefaultPlayerRecord({
                name: 'Victim',
                real_name: 'Victim',
                Record: 0,
            });

            const offlineAttacker = makeDefaultPlayerRecord({
                name: 'Bebum',
                real_name: 'Bebum',
                Record: 1,
                // on_now=false simulates the attacker having disconnected without
                // clearing the lock (the trigger for the infinite-loop bug)
                on_now: false,
            });

            ctx.player!.playerLength = jest.fn().mockReturnValue(1);
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 0) return victim;
                if (rec === 1) return offlineAttacker;
                return null;
            });
            ctx.game.hello = jest.fn();

            // Plant an orphaned battle lock on the victim pointing to attacker record 1
            ctx.storage.setBattleLock(0, '1\n');
            ctx.storage.setOfflineBattleOpponent(0, 1);
            ctx.storage.setOfflineBattleOpponent(1, 0);
            expect(ctx.storage.hasBattleLock(0)).toBe(true);

            await ctx.player!.loadPlayer(false);

            // Lock must have been cleared - not left dangling
            expect(ctx.storage.hasBattleLock(0)).toBe(false);
            expect(ctx.storage.getOfflineBattleOpponent(0)).toBeNull();
            expect(ctx.storage.getOfflineBattleOpponent(1)).toBeNull();
            // The game should have proceeded to hello()
            expect(ctx.game.hello).toHaveBeenCalled();
        });

        test('refuses login when attacker still has an unresolved offline battle', async () => {
            harness = TestHarness.create({ username: 'Attacker', createPlayer: false });
            const ctx = harness.context;

            const attacker = makeDefaultPlayerRecord({
                name: 'Attacker',
                real_name: 'Attacker',
                Record: 0,
                on_now: false,
            });

            const victim = makeDefaultPlayerRecord({
                name: 'Victim',
                real_name: 'Victim',
                Record: 1,
                on_now: false,
            });

            ctx.settings.prevent_login_while_offline_battle_pending = true;
            ctx.player!.playerLength = jest.fn().mockReturnValue(1);
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 0) return attacker;
                if (rec === 1) return victim;
                return null;
            });
            ctx.game.hello = jest.fn();

            ctx.storage.setOfflineBattleOpponent(0, 1);
            ctx.storage.setOfflineBattleOpponent(1, 0);

            harness.queueKeys('\r');

            await expect(ctx.player!.loadPlayer(false)).rejects.toThrow(GameExitError);

            expect(attacker.on_now).toBe(false);
            expect(ctx.game.hello).not.toHaveBeenCalled();
            expect(harness.outputContains('unfinished battle')).toBe(true);
        });

        test('battle lock message is shown then clears when lock is removed', async () => {
            // Simulates the normal case: attacker IS online, fight resolves quickly,
            // and the entering player sees the HP status line then proceeds.
            harness = TestHarness.create({ username: 'Victim', createPlayer: false });
            const ctx = harness.context;

            const victim = makeDefaultPlayerRecord({
                name: 'Victim',
                real_name: 'Victim',
                Record: 0,
            });

            let pollCount = 0;
            const activeAttacker = makeDefaultPlayerRecord({
                name: 'Bebum',
                real_name: 'Bebum',
                Record: 1,
                on_now: true,
            });
            // After one poll cycle, simulate the battle ending by removing the lock
            activeAttacker.reLoad = jest.fn().mockImplementation(() => {
                pollCount++;
                if (pollCount >= 1) {
                    ctx.storage.clearBattleLock(0);
                }
            });

            ctx.player!.playerLength = jest.fn().mockReturnValue(1);
            ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
                if (rec === 0) return victim;
                if (rec === 1) return activeAttacker;
                return null;
            });
            ctx.game.hello = jest.fn();

            ctx.storage.setBattleLock(0, '1\n');

            await ctx.player!.loadPlayer(false);

            expect(harness.outputContains('currently battling you')).toBe(true);
            expect(ctx.storage.hasBattleLock(0)).toBe(false);
            expect(ctx.game.hello).toHaveBeenCalled();
        });

        test('quits when player declines to join', async () => {
            harness = TestHarness.create({ createPlayer: false, username: 'Quitter' });
            const ctx = harness.context;

            ctx.player!.playerGet = jest.fn().mockReturnValue({
                name: 'X',
                real_name: 'OtherUser',
                Record: 0,
                Yours: true,
                put: jest.fn(),
                unLock: jest.fn(),
                reInit: jest.fn(),
                reLoad: jest.fn(),
            });
            ctx.player!.playerLength = jest.fn().mockReturnValue(1);

            harness.queueKeys('N');  // No, don't join

            await expect(harness.runUntilExit(() => ctx.player!.loadPlayer(true))).resolves.toBeUndefined();

            // exit is implicitly verified: runUntilExit caught __GAME_EXIT__
        });
    });
});
