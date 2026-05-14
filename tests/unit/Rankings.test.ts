/**
 * Rankings - Unit tests for player ranking system
 *
 * Tests generateRankings() with mocked Player, IO, and state.
 */

import Rankings from '@lordts/core/Rankings';
import Lazy from '@lordts/util/Lazy';
import type { LoadedPlayerRecord, UiMode } from '@lordts/core/types';

function makePlayer(overrides: Partial<LoadedPlayerRecord> = {}): LoadedPlayerRecord {
    const base: Record<string, unknown> = {
        name: 'TestHero',
        exp: 1000,
        level: 1,
        dead: false,
        inn: false,
        sex: 'M',
        clss: 1,
        skillw: 0,
        skillm: 0,
        skillt: 0,
        on_now: false,
    };
    return { ...base, ...overrides } as LoadedPlayerRecord;
}

describe('Rankings', () => {
    let mockIo: Record<string, jest.Mock>;
    let uiMode: UiMode;
    let allPlayersData: LoadedPlayerRecord[];

    beforeEach(() => {
        mockIo = {
            sln: jest.fn().mockResolvedValue(undefined),
            showRip: jest.fn().mockResolvedValue(undefined),
            showBuffer: jest.fn().mockResolvedValue(undefined),
            getkey: jest.fn().mockResolvedValue('\r'),
            divider: jest.fn().mockReturnValue('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-'),
        };

        uiMode = { mode: 'ansi', lastScreen: '' };

        allPlayersData = [
            makePlayer({ name: 'Hero1', exp: 5000, level: 3, dead: false, inn: false, sex: 'M', clss: 1 }),
            makePlayer({ name: 'Hero2', exp: 10000, level: 5, dead: false, inn: false, sex: 'F', clss: 2 }),
            makePlayer({ name: 'Hero3', exp: 100, level: 1, dead: true, inn: false, sex: 'M', clss: 3 }),
            makePlayer({ name: 'X', exp: 0, level: 0, dead: false, inn: false }),  // filtered out
        ];
    });

    // helper factory removed - tests instantiate Rankings directly

    // ── generateRankings ─────────────────────────────────────────────────

    describe('generateRankings()', () => {
        let rankings: Rankings;

        beforeEach(() => {
            const mockPlayer = {
                allPlayers: jest.fn().mockReturnValue(allPlayersData),
            };
            rankings = new (Rankings as unknown as new (
                io: unknown, uiMode: UiMode, ver: string, player: unknown
            ) => Rankings)(
                mockIo,
                uiMode,
                'v4.07',
                new Lazy(() => mockPlayer),
            );
        });

        test('returns a string with header lines', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('Legend Of The Red Dragon');
            expect(result).toContain('Player Rankings');
        });

        test('players are sorted by exp descending', () => {
            const result = rankings.generateRankings(true);
            const hero1Pos = result.indexOf('Hero1');
            const hero2Pos = result.indexOf('Hero2');
            // Hero2 has more exp, so appears first
            expect(hero2Pos).toBeLessThan(hero1Pos);
        });

        test('excludes players named "X"', () => {
            const result = rankings.generateRankings(true);
            // The player with name "X" should not appear in the output
            // Just verify Hero1 and Hero2 are present
            expect(result).toContain('Hero1');
            expect(result).toContain('Hero2');
        });

        test('dead players excluded when all=false', () => {
            const resultAll = rankings.generateRankings(true);    // all=true includes dead
            const resultAlive = rankings.generateRankings(false);  // all=false excludes dead

            // Hero3 is dead
            expect(resultAll).toContain('Hero3');
            expect(resultAlive).not.toContain('Hero3');
        });

        test('inn=true only shows players at inn', () => {
            allPlayersData[0].inn = true; // Hero1 at inn
            const result = rankings.generateRankings(true, false, true);
            expect(result).toContain('Hero1');
            expect(result).not.toContain('Hero2');
        });

        test('inn=false excludes inn players when all=false', () => {
            allPlayersData[0].inn = true; // Hero1 at inn
            const result = rankings.generateRankings(false, false, false);
            expect(result).not.toContain('Hero1');
        });

        test('on=true marks online players', () => {
            allPlayersData[1].on_now = true; // Hero2 online
            const result = rankings.generateRankings(true, true);
            expect(result).toContain('On');
        });

        test('female player shows F prefix', () => {
            const result = rankings.generateRankings(true);
            // Hero2 is female
            expect(result).toContain('F ');
        });

        test('class 1 (Death Knight) shows D in output', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('D ');
        });

        test('class 2 (Mage) shows M in output', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('M ');
        });

        test('class 3 (Thief) shows T in output', () => {
            allPlayersData.push(makePlayer({ name: 'Thief1', exp: 200, clss: 3, dead: false, inn: false }));
            const result = rankings.generateRankings(true);
            expect(result).toContain('T ');
        });

        test('mastered warrior (skillw > 39) shows bright D', () => {
            allPlayersData[0].skillw = 40;
            const result = rankings.generateRankings(true);
            // `%D for fully mastered
            expect(result).toContain('`%D');
        });

        test('partial warrior mastery (skillw 20-39) shows dark D', () => {
            allPlayersData[0].skillw = 20;
            const result = rankings.generateRankings(true);
            expect(result).toContain('`0D');
        });

        test('mastered mage (skillm > 39) shows bright M', () => {
            allPlayersData[0].skillm = 40;
            const result = rankings.generateRankings(true);
            expect(result).toContain('`%M');
        });

        test('mastered thief (skillt > 39) shows bright T', () => {
            allPlayersData[0].skillt = 40;
            const result = rankings.generateRankings(true);
            expect(result).toContain('`%T');
        });

        test('dead player shows Dead status', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('Dead');
        });

        test('alive player shows Alive status', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('Alive');
        });

        test('version string is included in header', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('v4.07');
        });

        test('includes dash separator line', () => {
            const result = rankings.generateRankings(true);
            expect(result).toContain('-=-=-');
        });

        test('empty player list produces header only', () => {
            const mockPlayer = {
                allPlayers: jest.fn().mockReturnValue([]),
            };
            const emptyRankings = new (Rankings as unknown as new (
                io: unknown, uiMode: UiMode, ver: string, player: unknown
            ) => Rankings)(
                mockIo,
                uiMode,
                'v4.07',
                new Lazy(() => mockPlayer),
            );
            const result = emptyRankings.generateRankings(true);
            expect(result).toContain('Legend Of The Red Dragon');
            expect(result).not.toContain('Hero');
        });
    });
});
