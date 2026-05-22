import { getLastWinner, listWinnerHistory, recordWinner, summarizeWinnerAccounts, WINNER_HISTORY_TABLE } from '@lordts/core/WinnerHistory';
import { SqliteStorage } from '@lordts/storage/SqliteStorage';
import { TestHarness } from '../harness';

describe('WinnerHistory', () => {
    let harness: TestHarness | undefined;

    afterEach(() => {
        harness?.cleanup();
        harness = undefined;
    });

    test('records winner snapshots and groups wins by account', () => {
        harness = TestHarness.create();

        recordWinner(harness.context.storage, {
            Record: 0,
            real_name: 'HeroUser',
            name: 'Hero',
            level: 12,
            exp: 40000,
            drag_kills: 2,
            pvp: 5,
            laid: 1,
            gold: 5000,
            bank: 20000,
            gem: 12,
            clss: 1,
            sex: 'M',
        }, {
            winType: 'dragon',
            winStat: 'drag_kills',
            roundDays: 42,
            wonAt: 1_700_000_100,
        });

        recordWinner(harness.context.storage, {
            Record: 1,
            real_name: 'RivalUser',
            name: 'Rival',
            level: 10,
            exp: 35000,
            drag_kills: 1,
            pvp: 9,
            laid: 0,
            gold: 2500,
            bank: 17000,
            gem: 8,
            clss: 2,
            sex: 'F',
        }, {
            winType: 'tournament_time',
            winStat: 'exp',
            roundDays: 51,
            wonAt: 1_700_000_200,
        });

        recordWinner(harness.context.storage, {
            Record: 0,
            real_name: 'HeroUser',
            name: 'Hero Prime',
            level: 14,
            exp: 60000,
            drag_kills: 3,
            pvp: 7,
            laid: 2,
            gold: 8000,
            bank: 30000,
            gem: 18,
            clss: 1,
            sex: 'M',
        }, {
            winType: 'tournament_stat',
            winStat: 'thresholds',
            winStatValue: 1,
            roundDays: 64,
            wonAt: 1_700_000_300,
        });

        const history = listWinnerHistory(harness.context.storage);
        const summary = summarizeWinnerAccounts(harness.context.storage);

        expect(history.map((entry) => entry.name)).toEqual(['Hero Prime', 'Rival', 'Hero']);
        expect(getLastWinner(harness.context.storage)).toMatchObject({
            account_username: 'HeroUser',
            name: 'Hero Prime',
            win_type: 'tournament_stat',
            exp: 60000,
            level: 14,
        });
        expect(summary).toEqual([
            {
                account_username: 'HeroUser',
                wins: 2,
                last_won_at: 1_700_000_300,
                latest_name: 'Hero Prime',
                latest_win_type: 'tournament_stat',
                best_level: 14,
                best_exp: 60000,
                player_names: ['Hero', 'Hero Prime'],
            },
            {
                account_username: 'RivalUser',
                wins: 1,
                last_won_at: 1_700_000_200,
                latest_name: 'Rival',
                latest_win_type: 'tournament_time',
                best_level: 10,
                best_exp: 35000,
                player_names: ['Rival'],
            },
        ]);
    });

    test('logs malformed stored winner-history rows while keeping readable snapshots', () => {
        harness = TestHarness.create();
        const storage = harness.context.storage as SqliteStorage;
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        try {
            storage.putRecord(WINNER_HISTORY_TABLE, 1, {
                account_username: 'HeroUser',
                name: 'Hero',
                record: 0,
                won_at: 1_700_000_100,
            });
            storage.putRecord(WINNER_HISTORY_TABLE, 2, {
                account_username: 'NamelessUser',
                won_at: 1_700_000_101,
            });
            storage.db.prepare(`INSERT INTO ${WINNER_HISTORY_TABLE} (idx, data) VALUES (?, ?)`).run(0, 'yesterday');

            expect(listWinnerHistory(storage)).toHaveLength(1);
            expect(getLastWinner(storage)).toMatchObject({
                name: 'Hero',
                account_username: 'HeroUser',
            });
            expect(consoleSpy.mock.calls.map(([message]) => String(message))).toEqual(expect.arrayContaining([
                expect.stringContaining('[storage] Ignoring malformed winner_history record idx=0: invalid JSON'),
                expect.stringContaining('[WinnerHistory] Detected malformed winner_history row idx=1: missing fields:'),
                expect.stringContaining('[WinnerHistory] Detected malformed winner_history row idx=2: missing required name; row skipped'),
            ]));
        } finally {
            consoleSpy.mockRestore();
        }
    });

    test('rejects invalid winner snapshots before writing malformed rows', () => {
        harness = TestHarness.create();

        expect(() => recordWinner(harness!.context.storage, {
            Record: 0,
            real_name: 'HeroUser',
            name: '',
            level: 12,
            exp: 40000,
            drag_kills: 2,
            pvp: 5,
            laid: 1,
            gold: 5000,
            bank: 20000,
            gem: 12,
            clss: 1,
            sex: 'M',
        }, {
            winType: 'dragon',
            winStat: 'drag_kills',
            roundDays: 42,
            wonAt: 1_700_000_100,
        })).toThrow('[WinnerHistory] Cannot record winner without a character name');

        expect(listWinnerHistory(harness.context.storage)).toEqual([]);
    });
});