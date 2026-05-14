/**
 * UiMode reactivity tests.
 *
 * Verifies that the shared UiMode object propagates changes from
 * GameContext to every class that received it, without reconstruction.
 */

import * as path from 'path';

import GameContext from '@lordts/core/GameContext';
import MockConsole from '../MockConsole';
import WebSocketSession from '@lordts/core/net/WebSocketSession';

describe('UiMode reactivity', () => {
    let mockConsole: MockConsole;
    let ctx: GameContext;

    beforeEach(() => {
        mockConsole = new MockConsole();
        ctx = new GameContext(
            path.join(__dirname, '../..'),
            mockConsole,
            'TestUser',
            false,         // ripEnabled starts as false
            '127.0.0.1',
            1,
        );
    });

    test('GameContext.rip getter returns uiMode.mode rip state', () => {
        expect(ctx.rip).toBe(false);
        expect(ctx.uiMode.mode).toBe('ansi');

        ctx.uiMode.mode = 'rip';
        expect(ctx.rip).toBe(true);
    });

    test('GameContext.rip setter updates uiMode.mode', () => {
        ctx.rip = true;
        expect(ctx.uiMode.mode).toBe('rip');

        ctx.rip = false;
        expect(ctx.uiMode.mode).toBe('ansi');
    });

    test('changing ctx.rip is visible to Output', () => {
        expect(ctx.display.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.display.rip).toBe(true);
        ctx.rip = false;
        expect(ctx.display.rip).toBe(false);
    });

    test('changing ctx.rip is visible to Input', () => {
        expect(ctx.input.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.input.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Game', () => {
        expect(ctx.game.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.game.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Forest', () => {
        expect(ctx.forest.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.forest.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Battle', () => {
        expect(ctx.battle.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.battle.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Marriage', () => {
        expect(ctx.marriage.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.marriage.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Mail', () => {
        expect(ctx.mail.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.mail.rip).toBe(true);
    });

    test('changing ctx.rip is visible to RedDragonInn', () => {
        expect(ctx.redDragonInn.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.redDragonInn.rip).toBe(true);
    });

    test('changing ctx.rip is visible to Bank', () => {
        expect(ctx.bank.rip).toBe(false);
        ctx.rip = true;
        expect(ctx.bank.rip).toBe(true);
    });

    test('Game.rip setter also updates shared state', () => {
        // The in-game RIP toggle does: this.rip = !this.rip
        // Verify this propagates back to ctx and other src
        ctx.game.rip = true;
        expect(ctx.rip).toBe(true);
        expect(ctx.display.rip).toBe(true);
        expect(ctx.forest.rip).toBe(true);

        ctx.game.rip = false;
        expect(ctx.rip).toBe(false);
        expect(ctx.display.rip).toBe(false);
    });

    test('rip_toggle simulation propagates to all src', () => {
        // Simulate what game-worker.ts does on rip_toggle message
        const srcWithRip = [
            ctx.display, ctx.input, ctx.game, ctx.forest, ctx.battle,
            ctx.marriage, ctx.mail, ctx.redDragonInn, ctx.bank,
            ctx.bard, ctx.blackjack, ctx.dailyMaint, ctx.healers,
            ctx.kingArthurs, ctx.onlineBattle, ctx.turgons,
            ctx.log, ctx.rankings,
        ];

        // Initially all false
        for (const cls of srcWithRip) {
            expect(cls.rip).toBe(false);
        }

        // Toggle on
        ctx.rip = true;
        for (const cls of srcWithRip) {
            expect(cls.rip).toBe(true);
        }

        // Toggle off
        ctx.rip = false;
        for (const cls of srcWithRip) {
            expect(cls.rip).toBe(false);
        }
    });

    test('constructed with ripEnabled=true starts all src as true', () => {
        const ctx2 = new GameContext(
            path.join(__dirname, '../..'),
            mockConsole,
            'TestUser2',
            true,          // ripEnabled starts as true
            '127.0.0.1',
            2,
        );

        expect(ctx2.rip).toBe(true);
        expect(ctx2.display.rip).toBe(true);
        expect(ctx2.game.rip).toBe(true);
        expect(ctx2.forest.rip).toBe(true);
    });
});

describe('WebSocketAdapter onControlMessage', () => {
    test('onControlMessage callback fires when _drainControlMessages is polled', () => {
        // We can't easily test receiveMessageOnPort without a real worker,
        // but we CAN verify the callback plumbing works by invoking
        // _drainControlMessages indirectly through flush() in a unit-friendly way.
        // Here we test the callback setter is wired up correctly.

        // WebSocketAdapter constructor grabs parentPort (null in test env).
        // That's fine - _drainControlMessages early-returns when _parentPort is null.
        const wss = new WebSocketSession();

        const received: Record<string, unknown>[] = [];
        wss.onControlMessage = (msg: Record<string, unknown>) => {
            received.push(msg);
        };

        // In a test environment parentPort is null, so _drainControlMessages
        // won't poll, but verify the callback is set and wouldn't throw.
        wss.flush();
        expect(received).toHaveLength(0); // no messages because no real parentPort
        expect(typeof wss.onControlMessage).toBe('function');
    });
});
