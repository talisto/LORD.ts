/**
 * DailyMaint - Daily maintenance feature tests
 *
 * Tests tournamentCheck logic which is the most testable
 * part of daily maintenance without full database access.
 */

import { TestHarness } from '../harness';
import DailyMaint from '@lordts/core/DailyMaint';
import { HiddenPlayerPolicy } from '@lordts/core/HiddenPlayerPolicy';
import { InactiveResurrectionPolicy } from '@lordts/core/InactiveResurrectionPolicy';
import type { LoadedPlayerRecord } from '@lordts/core/types';

// Save the real tournamentCheck from the prototype
const realTournamentCheck = DailyMaint.prototype.tournamentCheck;
const realRunDailyMaint = DailyMaint.prototype.runDailyMaint;

describe('DailyMaint', () => {
    let harness: TestHarness;

    type TournamentSettingOverrides = Partial<{
        tournament_enabled: boolean;
        tournament_days: number;
        tournament_xp: number;
        tournament_dkills: number;
        tournament_pkills: number;
        tournament_level: number;
        tournament_lays: number;
        tournament_winstat: number;
    }>;

    afterEach(() => {
        harness.cleanup();
    });

    /** Helper to restore real tournamentCheck (TestHarness stubs it) */
    function restoreTournamentCheck() {
        harness.context.dailyMaint.tournamentCheck = realTournamentCheck.bind(harness.context.dailyMaint);
    }

    function restoreRunDailyMaint() {
        harness.context.dailyMaint.runDailyMaint = realRunDailyMaint.bind(harness.context.dailyMaint);
    }

    function setTournamentSettings(overrides: TournamentSettingOverrides): void {
        Object.assign(harness.context.settings, {
            tournament_enabled: false,
            tournament_days: 0,
            tournament_xp: 0,
            tournament_dkills: 0,
            tournament_pkills: 0,
            tournament_level: 0,
            tournament_lays: 0,
            tournament_winstat: 0,
            ...overrides,
        });
    }

    function useStoredPlayers() {
        harness.context.player!.playerLength = jest.fn(() => harness.context.storage.getPlayerCount());
        harness.context.player!.playerGet = jest.fn((record: number) => {
            const player = harness.context.storage.getPlayer(record) as LoadedPlayerRecord | null;
            if (player) {
                player.Yours = true;
            }
            return player;
        });
    }

    function createStoredPlayer(overrides: Partial<LoadedPlayerRecord>): LoadedPlayerRecord {
        const player = harness.context.storage.newPlayer() as LoadedPlayerRecord | null;
        if (!player) {
            throw new Error('Failed to create stored player for DailyMaint test');
        }

        player.exp = 100;
        player.drag_kills = 1;
        Object.assign(player, overrides);
        player.put();
        return player;
    }

    describe('tournamentCheck()', () => {
        test('does nothing when tournament not enabled', async () => {
            harness = TestHarness.create();
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: false });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when days remaining > 0', async () => {
            harness = TestHarness.create();
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_days: 5 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when player doesn\'t meet exp requirement', async () => {
            harness = TestHarness.create({
                playerOverrides: { exp: 100 },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_xp: 1000000 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when player doesn\'t meet dragon kills', async () => {
            harness = TestHarness.create({
                playerOverrides: { exp: 2000000000, drag_kills: 0 },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_dkills: 5 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when player doesn\'t meet pvp kills', async () => {
            harness = TestHarness.create({
                playerOverrides: { exp: 2000000000, drag_kills: 100, pvp: 0 },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_pkills: 10 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when player doesn\'t meet level', async () => {
            harness = TestHarness.create({
                playerOverrides: { exp: 2000000000, drag_kills: 100, pvp: 100, level: 1 },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_level: 12 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('does nothing when player doesn\'t meet lays', async () => {
            harness = TestHarness.create({
                playerOverrides: { exp: 2000000000, drag_kills: 100, pvp: 100, level: 12, laid: 0 },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true, tournament_lays: 5 });
            await harness.context.dailyMaint.tournamentCheck();

            expect(process.exit).not.toHaveBeenCalled();
        });

        test('wins tournament when all conditions met and no prior winner', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    exp: 2000000000,
                    drag_kills: 100,
                    pvp: 100,
                    level: 12,
                    laid: 50,
                    Record: 0,
                    name: 'Champion',
                },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true });

            // won_by = -1 means no one has won yet (getState stub sets this)
            harness.queueKeys('\r');  // more prompt after win
            await harness.runUntilExit(() => harness.context.dailyMaint.tournamentCheck());

            expect(harness.outputContains('Congratulations')).toBe(true);
            // exit is implicitly verified: runUntilExit caught __GAME_EXIT__
        });

        test('shows "got there first" when someone already won', async () => {
            harness = TestHarness.create({
                playerOverrides: {
                    exp: 2000000000,
                    drag_kills: 100,
                    pvp: 100,
                    level: 12,
                    laid: 50,
                    Record: 1,
                },
            });
            restoreTournamentCheck();

            setTournamentSettings({ tournament_enabled: true });

            // Override getState to set won_by to someone else
            harness.context.state!.getState = jest.fn().mockImplementation(() => {
                (harness.context.state as Record<string, unknown>)['won_by'] = 0;
            });

            harness.queueKeys('\r');  // more prompt
            await harness.runUntilExit(() => harness.context.dailyMaint.tournamentCheck());

            expect(harness.outputContains('got there first')).toBe(true);
            // exit is implicitly verified: runUntilExit caught __GAME_EXIT__
        });
    });

    describe('runDailyMaint()', () => {
        test('uses bar chatter probability setting to suppress NPC chatter', async () => {
            harness = TestHarness.create();
            restoreRunDailyMaint();
            harness.context.dailyMaint.setIgmMaintHook(async () => {});

            harness.context.settings.bar_npc_chatter_probability = 0;
            const state = harness.context.state!;
            state.last_bar = 0;
            const appendConversationSpy = jest.spyOn(harness.context.dailyMaint.storage, 'appendConversation');

            harness.rng.queueRandomValues([0]);
            harness.queueKeys('\r');

            await harness.context.dailyMaint.runDailyMaint();

            expect(appendConversationSpy).not.toHaveBeenCalledWith('bar', expect.any(Array), 18);
        });

        test('uses bar chatter probability setting to allow NPC chatter', async () => {
            harness = TestHarness.create();
            restoreRunDailyMaint();
            harness.context.dailyMaint.setIgmMaintHook(async () => {});

            harness.context.settings.bar_npc_chatter_probability = 1;
            const state = harness.context.state!;
            state.last_bar = 0;
            const appendConversationSpy = jest.spyOn(harness.context.dailyMaint.storage, 'appendConversation');

            harness.rng.queueRandomValues([0, 0]);
            harness.queueKeys('\r');

            await harness.context.dailyMaint.runDailyMaint();

            expect(appendConversationSpy).toHaveBeenCalledWith('bar', expect.any(Array), 18);
        });

        test('nochat still disables NPC bar chatter when probability is enabled', async () => {
            harness = TestHarness.create();
            restoreRunDailyMaint();
            harness.context.dailyMaint.setIgmMaintHook(async () => {});

            harness.context.settings.nochat = true;
            harness.context.settings.bar_npc_chatter_probability = 1;
            const state = harness.context.state!;
            state.last_bar = 0;
            const appendConversationSpy = jest.spyOn(harness.context.dailyMaint.storage, 'appendConversation');

            harness.rng.queueRandomValues([0, 0]);
            harness.queueKeys('\r');

            await harness.context.dailyMaint.runDailyMaint();

            expect(appendConversationSpy).not.toHaveBeenCalledWith('bar', expect.any(Array), 18);
        });

        test('keeps immediate inactive resurrection behavior when the spread window is disabled', async () => {
            harness = TestHarness.create();
            restoreRunDailyMaint();
            harness.context.dailyMaint.setIgmMaintHook(async () => {});
            useStoredPlayers();

            harness.context.state!.days = 10;
            harness.context.settings.res_days = 3;
            harness.context.settings.inactive_resurrection_spread_minutes = 0;

            const deadPlayer = createStoredPlayer({
                name: 'GhostOne',
                real_name: 'GhostOne',
                dead: true,
                on_now: false,
                time: 1,
                last_reincarnated: 1,
                gone: 0,
            });

            harness.queueKeys('\r');
            await harness.context.dailyMaint.runDailyMaint();

            const resurrected = harness.context.storage.getPlayer(deadPlayer.Record) as LoadedPlayerRecord | null;
            expect(resurrected?.dead).toBe(false);
            expect(resurrected?.gone).toBe(1);
            expect(harness.context.storage.hasConfig('scheduled_resurrections')).toBe(false);
        });

        test('hides inactive players instead of deleting them when configured', async () => {
            harness = TestHarness.create();
            restoreRunDailyMaint();
            harness.context.dailyMaint.setIgmMaintHook(async () => {});
            useStoredPlayers();

            harness.context.state!.days = 20;
            harness.context.settings.delete_days = 5;
            harness.context.settings.inactive_player_policy = 'hide';

            const hiddenPlayer = createStoredPlayer({
                name: 'GoneHero',
                real_name: 'GoneHero',
                dead: false,
                on_now: false,
                time: 1,
            });

            harness.queueKeys('\r');
            await harness.context.dailyMaint.runDailyMaint();

            const updatedPlayer = harness.context.storage.getPlayer(hiddenPlayer.Record) as LoadedPlayerRecord | null;
            expect(updatedPlayer?.name).toBe('GoneHero');
            expect(updatedPlayer?.real_name).toBe('GoneHero');
            expect(HiddenPlayerPolicy.isPlayerHidden(harness.context.storage, hiddenPlayer.Record)).toBe(true);
        });

        test('schedules inactive resurrections across the configured spread window', async () => {
            jest.useFakeTimers();
            try {
                jest.setSystemTime(new Date('2026-04-25T00:00:00Z'));

                harness = TestHarness.create();
                restoreRunDailyMaint();
                harness.context.dailyMaint.setIgmMaintHook(async () => {});
                useStoredPlayers();

                harness.context.state!.days = 10;
                harness.context.settings.timezone = 'UTC';
                harness.context.settings.res_days = 3;
                harness.context.settings.inactive_resurrection_spread_minutes = 60;

                const firstDeadPlayer = createStoredPlayer({
                    name: 'GhostOne',
                    real_name: 'GhostOne',
                    dead: true,
                    on_now: false,
                    time: 1,
                    last_reincarnated: 1,
                    gone: 0,
                });
                const secondDeadPlayer = createStoredPlayer({
                    name: 'GhostTwo',
                    real_name: 'GhostTwo',
                    dead: true,
                    on_now: false,
                    time: 1,
                    last_reincarnated: 1,
                    gone: 0,
                });

                harness.rng.queueRandomValues([60, 1800]);
                harness.queueKeys('\r');

                await harness.context.dailyMaint.runDailyMaint();

                const firstAfterSchedule = harness.context.storage.getPlayer(firstDeadPlayer.Record) as LoadedPlayerRecord | null;
                const secondAfterSchedule = harness.context.storage.getPlayer(secondDeadPlayer.Record) as LoadedPlayerRecord | null;
                expect(firstAfterSchedule?.dead).toBe(true);
                expect(secondAfterSchedule?.dead).toBe(true);
                expect(harness.context.storage.hasConfig('scheduled_resurrections')).toBe(true);

                const resurrectedPlayers = InactiveResurrectionPolicy.applyDueResurrections(
                    harness.context.storage,
                    harness.context.settings,
                    new Date('2026-04-25T00:10:00Z'),
                    undefined,
                    harness.context.state!.days,
                );
                const firstAfterDue = harness.context.storage.getPlayer(firstDeadPlayer.Record) as LoadedPlayerRecord | null;
                const secondAfterDue = harness.context.storage.getPlayer(secondDeadPlayer.Record) as LoadedPlayerRecord | null;

                expect(resurrectedPlayers).toEqual(['GhostOne']);
                expect(firstAfterDue?.dead).toBe(false);
                expect(secondAfterDue?.dead).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
