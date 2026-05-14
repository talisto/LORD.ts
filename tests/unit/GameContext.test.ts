import * as path from 'path';

import GameContext from '@lordts/core/GameContext';
import MockConsole from '../MockConsole';
import { version as PKG_VERSION } from '../../package.json';

describe('GameContext', () => {
    let mockConsole: MockConsole;

    beforeEach(() => {
        mockConsole = new MockConsole();
    });

    test('should initialize with default values', () => {
        const context = new GameContext(path.join(__dirname, '../..'), mockConsole, 'TestUser', false, '127.0.0.1', 1);

        expect(context.user.name).toBe('TestUser');
        expect(context.connection.remoteIp).toBe('127.0.0.1');
        expect(context.connection.node).toBe(1);
        expect(context.rip).toBe(false);
        expect(context.ver).toBe(PKG_VERSION);
    });

    test('should load data objects', () => {
        const context = new GameContext(path.join(__dirname, '../..'), mockConsole, 'TestUser', false, '127.0.0.1', 1);

        expect(context.trainerStats).toBeDefined();
        expect(context.monsterStats).toBeDefined();
        expect(context.armourStats).toBeDefined();
        expect(context.weaponStats).toBeDefined();
        expect(context.castles).toBeDefined();
        expect(context.settings).toBeDefined();
        expect(context.settings.tournament_enabled).toBe(false);
        expect(context.settings.tournament_days).toBe(0);
    });

    test('should initialize src', () => {
        const context = new GameContext(path.join(__dirname, '../..'), mockConsole, 'TestUser', false, '127.0.0.1', 1);

        expect(context.fileUtils).toBeDefined();
        expect(context.io).toBeDefined();
        expect(context.display).toBeDefined();
        expect(context.player).toBeDefined();
        expect(context.game).toBeDefined();
    });
});
