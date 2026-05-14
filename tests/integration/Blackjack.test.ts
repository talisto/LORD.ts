/**
 * Blackjack - Feature tests
 *
 * Tests the Blackjack mini-game's core logic: handTotal calculation,
 * shuffle, and basic game flow.
 */

import { TestHarness } from '../harness';

interface TestCard {
    suit: number;
    val: number;
}

interface TestBlackjackState {
    hands: {
        dealer: TestCard[][];
        player: TestCard[][];
    };
    cards: TestCard[];
    bet: number;
    cardCheck: () => Promise<string>;
}

describe('Blackjack', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('handTotal()', () => {
        test('calculates simple hand total', () => {
            harness = TestHarness.create();

            // Cards: 2 (val=1) + 5 (val=4) = 2 + 5 = 7
            const hand = [
                { suit: 0, val: 1 },  // 2
                { suit: 1, val: 4 },  // 5
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(7);
        });

        test('Ace counts as 11 when total <= 21', () => {
            harness = TestHarness.create();

            // Ace (val=0, value=11) + 5 (val=4, value=5) = 16
            const hand = [
                { suit: 0, val: 0 },  // Ace = 11
                { suit: 1, val: 4 },  // 5
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(16);
        });

        test('Ace counts as 1 when total would exceed 21', () => {
            harness = TestHarness.create();

            // Ace (11) + 10 (10) + 5 (5) → 26, so Ace becomes 1 → 16
            const hand = [
                { suit: 0, val: 0 },   // Ace
                { suit: 1, val: 9 },   // 10
                { suit: 2, val: 4 },   // 5
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(16);
        });

        test('two Aces: one becomes 1', () => {
            harness = TestHarness.create();

            // Ace + Ace → 11 + 11 = 22, one becomes 1 → 12
            const hand = [
                { suit: 0, val: 0 },
                { suit: 1, val: 0 },
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(12);
        });

        test('face cards are 10', () => {
            harness = TestHarness.create();

            // Jack (val=10) + Queen (val=11) + King (val=12) = 30
            const hand = [
                { suit: 0, val: 10 },  // J = 10
                { suit: 1, val: 11 },  // Q = 10
                { suit: 2, val: 12 },  // K = 10
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(30);
        });

        test('blackjack (Ace + face card = 21)', () => {
            harness = TestHarness.create();

            const hand = [
                { suit: 0, val: 0 },   // Ace = 11
                { suit: 1, val: 12 },  // King = 10
            ];

            expect(harness.context.blackjack.handTotal(hand)).toBe(21);
        });

        test('min mode counts all aces as 1', () => {
            harness = TestHarness.create();

            // Ace + 5: normal=16, min=6
            const hand = [
                { suit: 0, val: 0 },  // Ace
                { suit: 1, val: 4 },  // 5
            ];

            expect(harness.context.blackjack.handTotal(hand, true)).toBe(6);
        });
    });

    describe('shuffle()', () => {
        test('creates a 52-card deck', () => {
            harness = TestHarness.create();

            harness.context.blackjack.shuffle();

            // Access the internal cards array
            const cards = (harness.context.blackjack as unknown as Record<string, unknown>)['cards'] as unknown[];
            expect(cards.length).toBe(52);
        });

        test('deck contains all suits and values', () => {
            harness = TestHarness.create();

            harness.context.blackjack.shuffle();

            const cards = (harness.context.blackjack as unknown as Record<string, unknown>)['cards'] as any[];

            // Check all unique suit/val combos exist
            const seen = new Set<string>();
            for (const card of cards) {
                seen.add(`${card.suit}-${card.val}`);
            }

            expect(seen.size).toBe(52);

            // Verify all 4 suits × 13 values
            for (let s = 0; s < 4; s++) {
                for (let v = 0; v < 13; v++) {
                    expect(seen.has(`${s}-${v}`)).toBe(true);
                }
            }
        });
    });

    describe('run()', () => {
        test('T tells the dwarf to screw off', async () => {
            harness = TestHarness.create();
            harness.session.queueKeys('T', '\r');

            await harness.context.blackjack.run();

            const output = harness.session.output;
            expect(output).toContain('Your loss, kid');
        });
    });

    describe('card rendering', () => {
        test('uses Unicode card borders for split hands and dealer reveals', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 5000 },
            });
            harness.clearOutput();

            const blackjack = harness.context.blackjack as unknown as TestBlackjackState;
            blackjack.bet = 200;
            blackjack.hands = {
                dealer: [[
                    { suit: 2, val: 9 },
                    { suit: 3, val: 2 },
                ]],
                player: [[
                    { suit: 1, val: 11 },
                    { suit: 0, val: 11 },
                ]],
            };
            blackjack.cards = [
                { suit: 2, val: 6 },
                { suit: 1, val: 9 },
                { suit: 0, val: 5 },
            ];

            harness.queueKeys('Y', 'S', 'S');

            const result = await blackjack.cardCheck();
            const output = harness.plainOutput;

            expect(result).toBe('DW');
            expect(output).toContain('╒═════╕');
            expect(output).toContain('│Q♠   │');
            expect(output).toContain('│3♦   │');
            expect(output).not.toContain('Õ');
            expect(output).not.toContain('Í');
            expect(output).not.toContain('³');
            expect(output).not.toContain('À');
            expect(output).not.toContain('Ä');
            expect(output).not.toContain('Ù');
        });
    });
});
