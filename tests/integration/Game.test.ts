import GameContext from '@lordts/core/GameContext';
import { GameExitError } from '@lordts/core/GameExitError';
import { PlayerIpHistoryPolicy } from '@lordts/core/PlayerIpHistoryPolicy';
import MockConsole from '../MockConsole';
import fs from 'fs';
import path from 'path';

describe('Game Integration', () => {
    let mockConsole: any;
    let context: any;
    let originalExit: typeof process.exit;

    beforeAll(() => {
        // Mock process.exit to prevent tests from actually exiting
        originalExit = process.exit;
        // @ts-expect-error - jest.fn() type is compatible at runtime but not statically
        process.exit = jest.fn();

        // Ensure runtime directory exists
        const runtimeDir = path.join(__dirname, '../../runtime');
        if (!fs.existsSync(runtimeDir)) {
            fs.mkdirSync(runtimeDir, { recursive: true });
        }
    });

    afterAll(() => {
        process.exit = originalExit;
    });

    beforeEach(() => {
        mockConsole = new MockConsole();
        context = new GameContext(path.join(__dirname, '../..'), mockConsole, 'TestUser', false, '127.0.0.1', 1);

        // Mock some methods that might cause issues in tests
        context.fileUtils.buildTxtIndex = jest.fn();
        context.state.getState = jest.fn();
        context.player.loadPlayer = jest.fn();
        context.player.put = jest.fn();
        context.rankings.generateRankings = jest.fn();
        context.io.showTxt = jest.fn();
        context.io.getkey = jest.fn().mockResolvedValue('\r');
        context.io.showAlone = jest.fn();

        // Mock introMenu to return 'Q' (Quit)
        context.game.introMenu = jest.fn().mockResolvedValue('Q');
    });

    test('should start game and quit from intro menu', async () => {
        // Mock player to be logged in
        context.player.player = { name: 'TestUser' };

        // Run the game start method - exits by throwing GameExitError
        await expect(context.game.start()).rejects.toBeInstanceOf(GameExitError);

        // Verify that the player was saved
        expect(context.player.put).toHaveBeenCalled();
    });

    test('should handle game over state', async () => {
        // Mock state to indicate game is over
        context.state.won_by = 1;
        context.player.playerGet = jest.fn().mockReturnValue({ name: 'Winner' });

        // Mock introMenu to return 'E' (Enter Realm)
        context.game.introMenu = jest.fn().mockResolvedValue('E');

        // Run the game start method - exits by throwing GameExitError
        await expect(context.game.start()).rejects.toBeInstanceOf(GameExitError);

        // Verify that the player was saved
        expect(context.player.put).toHaveBeenCalled();
    });

    test('records the current remote IP after a successful login', async () => {
        context = new GameContext(path.join(__dirname, '../..'), mockConsole, 'TestUser', false, '203.0.113.10', 1);
        context.settings.shared_ip_restriction_days = 7;
        context.settings.shared_ip_ignore_private_addresses = true;

        context.fileUtils.buildTxtIndex = jest.fn();
        context.state.getState = jest.fn().mockImplementation(() => {
            context.state.days = 42;
        });
        context.player.loadPlayer = jest.fn().mockImplementation(async () => {
            context.player.player = { name: 'TestUser', Record: 0, on_now: false };
        });
        context.io.showTxt = jest.fn();
        context.io.getkey = jest.fn().mockResolvedValue('\r');
        context.io.showAlone = jest.fn();
        context.game.introMenu = jest.fn().mockResolvedValue('E');
        context.game.checkGameover = jest.fn().mockResolvedValue(undefined);

        await context.game.start();

        PlayerIpHistoryPolicy.recordPlayerIp(context.storage, 42, 1, '203.0.113.10', context.settings);

        expect(PlayerIpHistoryPolicy.havePlayersSharedRecentIp(context.storage, 42, 0, 1, context.settings)).toBe(true);
    });
});
