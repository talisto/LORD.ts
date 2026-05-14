import { DailyMaintenanceRunner } from '@lordts/core/DailyMaintenanceRunner';
import type GameContext from '@lordts/core/GameContext';
import type { IStorage } from '@lordts/storage/IStorage';

describe('DailyMaintenanceRunner', () => {
    test('auto resets a won round after maintenance when enabled', async () => {
        const state = {
            getState: jest.fn().mockResolvedValue(undefined),
            putState: jest.fn(),
            days: 5,
            log_date: 123,
            won_by: 1,
        };
        const ctx = {
            state,
            log: {
                createLog: jest.fn().mockImplementation(async () => {
                    state.days = 6;
                    state.won_by = 1;
                }),
            },
            settings: {
                auto_reset_won_round: true,
            },
            storage: {} as IStorage,
            fileUtils: {
                runtimeFilePath: jest.fn().mockReturnValue('/tmp/gameover_notified'),
            },
        } as unknown as Pick<GameContext, 'state' | 'log' | 'settings' | 'storage' | 'fileUtils'>;
        const resetRound = jest.fn().mockImplementation(() => {
            state.days = 0;
            state.won_by = -1;
            return {
                hadStateRecord: true,
                previousWinner: 1,
                resetCount: 1,
                skippedCount: 0,
                notificationFlagRemoved: false,
                notificationFlagPath: '/tmp/gameover_notified',
            };
        });

        const result = await DailyMaintenanceRunner.runContext(ctx, '/tmp/project', resetRound);

        expect(resetRound).toHaveBeenCalledWith('/tmp/project', {
            storage: ctx.storage,
            notificationFlagPath: '/tmp/gameover_notified',
        });
        expect(state.getState).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ dayBefore: 5, dayAfter: 0 });
    });

    test('does not auto reset when the setting is disabled', async () => {
        const state = {
            getState: jest.fn().mockResolvedValue(undefined),
            putState: jest.fn(),
            days: 5,
            log_date: 123,
            won_by: 1,
        };
        const ctx = {
            state,
            log: {
                createLog: jest.fn().mockImplementation(async () => {
                    state.days = 6;
                }),
            },
            settings: {
                auto_reset_won_round: false,
            },
            storage: {} as IStorage,
            fileUtils: {
                runtimeFilePath: jest.fn().mockReturnValue('/tmp/gameover_notified'),
            },
        } as unknown as Pick<GameContext, 'state' | 'log' | 'settings' | 'storage' | 'fileUtils'>;
        const resetRound = jest.fn();

        const result = await DailyMaintenanceRunner.runContext(ctx, '/tmp/project', resetRound);

        expect(resetRound).not.toHaveBeenCalled();
        expect(result).toEqual({ dayBefore: 5, dayAfter: 6 });
    });
});