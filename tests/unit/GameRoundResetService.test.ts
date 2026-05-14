import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GameRoundResetService } from '@lordts/core/GameRoundResetService';
import { getLastWinner } from '@lordts/core/WinnerHistory';
import { Player_Def, State_Def } from '@lordts/storage/RecordDefs';
import { TestHarness } from '../harness';

describe('GameRoundResetService', () => {
    let harness: TestHarness;
    let tempDir: string;

    afterEach(() => {
        harness.cleanup();
        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('resets won round state and live players while preserving identity fields', async () => {
        harness = TestHarness.create();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-reset-'));
        const flagPath = path.join(tempDir, 'gameover_notified');
        fs.writeFileSync(flagPath, 'notify');

        const stateFile = harness.context.storage.create('state', State_Def);
        const state = stateFile.new();
        if (!state) {
            throw new Error('Failed to create state record for reset test');
        }

        state.days = 42;
        state.married_to_seth = 7;
        state.married_to_violet = 8;

        const playerFile = harness.context.storage.create('players', Player_Def);
        const activePlayer = playerFile.new();
        const deletedPlayer = playerFile.new();
        if (!activePlayer || !deletedPlayer) {
            throw new Error('Failed to create player records for reset test');
        }

        activePlayer.name = 'Hero';
        activePlayer.real_name = 'Hero Real';
        activePlayer.sex = 'M';
        activePlayer.clss = 1;
        activePlayer.level = 12;
        activePlayer.gold = 9999;
        activePlayer.on_now = true;
        activePlayer.put();
        state.won_by = activePlayer.Record;
        state.put();

        deletedPlayer.name = 'X';
        deletedPlayer.put();

        const result = GameRoundResetService.reset(path.join(__dirname, '../..'), {
            storage: harness.context.storage,
            notificationFlagPath: flagPath,
        });
        const stateAfter = harness.context.storage.getState();
        const resetPlayer = playerFile.get(activePlayer.Record);
        const defaultGold = Player_Def.find((field) => field.prop === 'gold')?.def;

        expect(result.hadStateRecord).toBe(true);
        expect(result.previousWinner).toBe(activePlayer.Record);
        expect(result.resetCount).toBe(1);
        expect(result.skippedCount).toBe(1);
        expect(stateAfter.won_by).toBe(-1);
        expect(stateAfter.days).toBe(0);
        expect(stateAfter.married_to_seth).toBe(-1);
        expect(stateAfter.married_to_violet).toBe(-1);
        expect(resetPlayer?.name).toBe('Hero');
        expect(resetPlayer?.real_name).toBe('Hero Real');
        expect(resetPlayer?.sex).toBe('M');
        expect(resetPlayer?.clss).toBe(1);
        expect(defaultGold).toBeDefined();
        expect(resetPlayer?.gold).toBe(defaultGold);
        expect(resetPlayer?.on_now).toBe(false);
        expect(getLastWinner(harness.context.storage)).toMatchObject({
            account_username: 'Hero Real',
            record: activePlayer.Record,
            name: 'Hero',
            win_type: 'reset_backfill',
            round_days: 42,
            level: 12,
            gold: 9999,
            won_at: expect.any(Number),
        });
        expect(fs.existsSync(flagPath)).toBe(false);
    });
});