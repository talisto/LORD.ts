/**
 * Sandtiger's Bar v1.02 - Gambling Games
 * Blackjack and Elimination card games.
 */
import { random, prettyInt } from '@lordts/util/Util';
import type { SandBarContext, Card } from './sandbarDefs';
import {
    SUIT_NAMES, SUIT_COLORS, FACE_NAMES, CARD_VALUES,
    BJ_NPCS, ELIM_NPCS,
    pressAKey, spendBarCoins, earnBarCoins,
} from './sandbarDefs';

class SandBarGambling {
    private ctx: SandBarContext;

    constructor(ctx: SandBarContext) {
        this.ctx = ctx;
    }

    async gamblingTable(): Promise<void> {
        const { io } = this.ctx;

        io.sclrscr();
        await io.lln('`2You walk up to the gambling table.  The regulars look');
        await io.lln('`2at you expectantly. They do this day in, day out, and');
        await io.lln('`2desparately want new competition. Currently the game is');
        await io.sln();

        // Random game selection (1-3)
        let gameType = random(3) + 1;
        if (gameType === 3) {
            // The original package reserved Poker for registered copies. Keep
            // the same fallback by redirecting that slot to Blackjack here.
            gameType = 1;
        }

        const gameName = gameType === 1 ? 'Blackjack' : 'Elimination';

        await io.lln(`\`2${gameName}`);
        await io.lw('`2Wanna Play? `![`2Y`0/`2N`!] ');

        io.emitPrompt('sandbar_play_game', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let play: string;
        do {
            play = (await io.getkey()).toUpperCase();
        } while ('YN'.indexOf(play) === -1);

        if (play !== 'Y') return;

        if (gameType === 1) {
            await this.playBlackjack();
        } else {
            await this.playElimination();
        }
    }

    // ─── Card Utilities ──────────────────────────────────────────────────────

    private createDeck(): Card[] {
        const deck: Card[] = [];
        for (let suit = 0; suit < 4; suit++) {
            for (let val = 0; val < 13; val++) {
                deck.push({ suit, value: val });
            }
        }
        // Shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = random(i + 1);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    private cardName(card: Card): string {
        return `${SUIT_COLORS[card.suit]}${FACE_NAMES[card.value]}${SUIT_NAMES[card.suit]}`;
    }

    private handTotal(hand: Card[]): number {
        let total = 0;
        let aces = 0;
        for (const card of hand) {
            total += CARD_VALUES[card.value];
            if (card.value === 0) aces++;
        }
        // Start every ace at 11, then downgrade as needed until the hand fits
        // under 21. This mirrors standard Blackjack scoring.
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        return total;
    }

    // ─── Blackjack ───────────────────────────────────────────────────────────

    private async playBlackjack(): Promise<void> {
        const { io, player } = this.ctx;
        let playAgain = true;

        while (playAgain) {
            if (this.ctx.barcoins <= 0) {
                await io.lln('`2The gambling group is tired of you winning all the time.');
                await io.lln('`2Maybe you should come back later.');
                await pressAKey(io);
                return;
            }

            // Ask for rules
            await io.lw('`2You need rules? `![`2Y`0/`2N`!] ');
            io.emitPrompt('sandbar_bj_rules', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let rules: string;
            do {
                rules = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(rules) === -1);

            if (rules === 'Y') {
                io.sclrscr();
                await io.lln('`2Blackjack is a game of luck.  You are dealt 2 cards at the beginning of each game.  Your oponents are also dealt 2 cards each, and you can see the 2nd card dealt to all.');
                await io.lln('`2Each player decides whether they will take another card, or "stay".  When everyone has stopped, the winner is the player with the hand closest to 21.  If there is a tie, the earnings are split.');
                await io.lln('`2If a player receives an ace and a face card (or a 10), on the first deal, they automatically win.  Same if a player is still 21 or below with 5 cards.');
                await io.lln('`2Aces can be worth 1 or 11, Face Cards are worth 10.');
                await pressAKey(io);
            }

            await io.sln();
            await io.lln('`%        Bet whatever you want.  If you win, you get it times 6 back.');
            await io.lln('`%        If you tie, you\'ll split the winnings.');
            await io.sln();
            await io.lln(`\`2You have \`%${prettyInt(this.ctx.barcoins)} \`2in BarCoins.`);

            // Get bet
            let bet: number;
            do {
                await io.lw('`2Your Bet? `0(`%0 `2to quit`0) ');
                io.emitPrompt('sandbar_bj_bet', [], 'number');
                const input = await io.getstr({ len: 14 });
                bet = parseInt(input, 10);
                if (isNaN(bet)) bet = -1;
            } while (bet < 0 || bet > this.ctx.barcoins);

            if (bet === 0) return;

            spendBarCoins(this.ctx, bet);

            // Set up game
            await io.lln('`$Shuffling...');
            await io.mswait(500);

            const deck = this.createDeck();

            // 3 players: You + 2 NPCs
            const playerNames = [player.name, ...BJ_NPCS.slice(0, 2)];
            const hands: Card[][] = [[], [], []];

            // Deal 2 cards to each
            for (let round = 0; round < 2; round++) {
                for (let p = 0; p < 3; p++) {
                    hands[p].push(deck.pop()!);
                }
            }

            // Show initial hands
            await io.lln('`%Blackjack...');
            for (let p = 0; p < 3; p++) {
                if (p === 0) {
                    await io.lln(`\`2${playerNames[p]}: ${this.cardName(hands[p][0])} \`2and \`0${this.cardName(hands[p][1])}`);
                } else {
                    await io.lln(`\`2${playerNames[p]}: \`3Covered Card \`2and \`0${this.cardName(hands[p][1])}`);
                }
            }

            // Check for natural blackjack
            const busted = [false, false, false];
            const fiveCard = [false, false, false];

            for (let p = 0; p < 3; p++) {
                if (this.handTotal(hands[p]) === 21) {
                    await io.lln(`\`2${playerNames[p]} \`2got Blackjack!`);
                }
            }

            await this._bjPlayerTurn(hands, playerNames, busted, fiveCard, deck);
            await this._bjNpcTurns(hands, playerNames, busted, fiveCard, deck);

            // Final standings
            await io.sln();
            await io.lln('`%Final Standings...');
            for (let p = 0; p < 3; p++) {
                const total = this.handTotal(hands[p]);
                if (busted[p]) {
                    await io.lln(`\`2${playerNames[p]}: Busted! \`$Total: \`0${total}`);
                } else if (fiveCard[p]) {
                    await io.lln(`\`2${playerNames[p]}: Five Card Charlie! \`2Total: \`#${total}`);
                } else {
                    await io.lln(`\`2${playerNames[p]}: \`2Total: \`#${total}`);
                }
            }

            await this._bjScoreRound(hands, busted, fiveCard, bet);

            await io.sln();
            await io.lw('`2Wanna play again? `0[`2Y`0/`2N`0] ');
            io.emitPrompt('sandbar_bj_play_again', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let again: string;
            do {
                again = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(again) === -1);
            playAgain = again === 'Y';
        }
    }

    private async _bjPlayerTurn(hands: Card[][], playerNames: string[], busted: boolean[], fiveCard: boolean[], deck: Card[]): Promise<void> {
        const { io } = this.ctx;

        if (this.handTotal(hands[0]) >= 21) return;

        let playerDone = false;
        while (!playerDone && hands[0].length < 5) {
            await io.lw('`2[`0H`2]`!it `%or `2[`0S`2]`!tay`%? ');
            io.emitPrompt('sandbar_bj_hit_stay', [
                { key: 'H', label: 'Hit' }, { key: 'S', label: 'Stay' },
            ]);
            let action: string;
            do {
                action = (await io.getkey()).toUpperCase();
            } while ('HS'.indexOf(action) === -1);

            if (action === 'H') {
                hands[0].push(deck.pop()!);
                const total = this.handTotal(hands[0]);
                await io.lln(`\`2${playerNames[0]} \`2hits! ${this.cardName(hands[0][hands[0].length - 1])} \`2/\`3${total}`);
                if (total > 21) {
                    busted[0] = true;
                    playerDone = true;
                }
                if (hands[0].length === 5 && total <= 21) {
                    await io.lln(`\`2${playerNames[0]} \`2got a Five Card Charlie!`);
                    fiveCard[0] = true;
                    playerDone = true;
                }
            } else {
                await io.lln(`\`2${playerNames[0]} \`2stays!`);
                playerDone = true;
            }
        }
    }

    private async _bjNpcTurns(hands: Card[][], playerNames: string[], busted: boolean[], fiveCard: boolean[], deck: Card[]): Promise<void> {
        const { io } = this.ctx;

        // NPCs follow the simple casino rule: hit below 17, otherwise
        // stay, with Five Card Charlie still beating an ordinary hand.
        for (let p = 1; p < 3; p++) {
            if (this.handTotal(hands[p]) === 21) continue;

            while (this.handTotal(hands[p]) < 17 && hands[p].length < 5) {
                hands[p].push(deck.pop()!);
                const total = this.handTotal(hands[p]);
                await io.lln(`\`2${playerNames[p]} \`2hits! \`2/\`3${total}`);
                if (total > 21) {
                    busted[p] = true;
                }
                if (hands[p].length === 5 && total <= 21) {
                    await io.lln(`\`2${playerNames[p]} \`2got a Five Card Charlie!`);
                    fiveCard[p] = true;
                }
            }
            if (!busted[p] && !fiveCard[p]) {
                await io.lln(`\`2${playerNames[p]} \`2stays!`);
            }
        }
    }

    private async _bjScoreRound(hands: Card[][], busted: boolean[], fiveCard: boolean[], bet: number): Promise<void> {
        const { io } = this.ctx;
        const playerTotal = this.handTotal(hands[0]);

        if (busted[0] && !fiveCard[0]) {
            await io.lln('`0You won nothing!');
        } else {
            let playerWon = true;
            let tied = false;

            for (let p = 1; p < 3; p++) {
                if (busted[p]) continue;
                const npcTotal = this.handTotal(hands[p]);

                if (fiveCard[p] && !fiveCard[0]) {
                    await io.lln('Loser to Five Card');
                    playerWon = false;
                    break;
                }
                if (fiveCard[0]) continue;

                if (npcTotal > playerTotal) {
                    playerWon = false;
                    break;
                }
                if (npcTotal === playerTotal) {
                    tied = true;
                }
            }

            if (playerWon && !tied) {
                const winnings = bet * 6;
                earnBarCoins(this.ctx, winnings);
                await io.lln(`\`0You win \`$${prettyInt(winnings)} \`0BarCoins!`);
            } else if (tied) {
                const winnings = bet * 3;
                earnBarCoins(this.ctx, winnings);
                await io.lln(` \`0You win \`%${prettyInt(winnings)} \`0BarCoins!`);
            } else {
                await io.lln('`0You won nothing!');
            }
        }
    }

    // ─── Elimination ─────────────────────────────────────────────────────────

    private async playElimination(): Promise<void> {
        const { io, player } = this.ctx;
        let playAgain = true;

        while (playAgain) {
            if (this.ctx.barcoins <= 0) {
                await io.lln('`2The gambling group is tired of you winning all the time.');
                await io.lln('`2Maybe you should come back later.');
                await pressAKey(io);
                return;
            }

            // Ask for rules
            await io.lw('`2You need rules? `![`2Y`0/`2N`!] ');
            io.emitPrompt('sandbar_elim_rules', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let rules: string;
            do {
                rules = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(rules) === -1);

            if (rules === 'Y') {
                io.sclrscr();
                await io.lln('`2Elimination is a game of luck and skill.  You start with 13 points, when you reach 0, you lose. You get a card each round. You are given the choice of keeping it or trading it. If you trade it, you will either get a card from the deck, or from the person beside you.');
                await io.lln('`2Once everyone has their cards, the cards are flipped over. The people with the lowest card(s) lose the number of the card from their score. More than one person can get points deducted each round.');
                await pressAKey(io);
            }

            // Payout percentages
            await io.sln();
            await io.lln('`0Betting is as follows!');
            await io.lln('          `21st Place `9- `0200% of Bet');
            await io.lln('          `22nd Place `9- `050% of Bet');
            await io.lln('          `23rd Place `9- `025% of Bet');
            await io.lln('          `2Below...  You lose all!');
            await io.sln();

            await io.lln(`\`2You have \`%${prettyInt(this.ctx.barcoins)} \`2in BarCoins.`);

            // Get bet
            let bet: number;
            do {
                await io.lw('`2Your Bet? `0(`%0 `2to quit`0) ');
                io.emitPrompt('sandbar_elim_bet', [], 'number');
                const input = await io.getstr({ len: 14 });
                bet = parseInt(input, 10);
                if (isNaN(bet)) bet = -1;
            } while (bet < 0 || bet > this.ctx.barcoins);

            if (bet === 0) return;

            spendBarCoins(this.ctx, bet);

            await io.lln('`$Shuffling...');
            await io.mswait(500);

            // Players: you + up to 6 NPCs
            const npcCount = Math.min(random(5) + 2, ELIM_NPCS.length);
            const playerNames = [player.name];
            for (let i = 0; i < npcCount; i++) {
                playerNames.push(ELIM_NPCS[i]);
            }
            const totalPlayers = playerNames.length;

            // Scores start at 13
            const scores: number[] = new Array<number>(totalPlayers).fill(13);
            const eliminated: boolean[] = new Array<boolean>(totalPlayers).fill(false);

            await io.lln('`0Elimination...');

            // Display initial scores
            for (let p = 0; p < totalPlayers; p++) {
                await io.lln(`\`!${playerNames[p]}:  \`2(\`0${scores[p]}\`2)`);
            }

            let gameOver = false;

            while (!gameOver) {
                gameOver = await this._elimPlayRound(playerNames, scores, eliminated);
                if (!gameOver) {
                    await io.mswait(500);
                }
            }

            // Determine placement by final scores (highest first)
            const placements = playerNames
                .map((name, idx) => ({ name, score: scores[idx], idx, elim: eliminated[idx] }))
                .sort((a, b) => b.score - a.score);

            // Find player's placement (0-indexed)
            const playerPlace = placements.findIndex(p => p.idx === 0);

            if (playerPlace === 0) {
                const winnings = bet * 2;
                earnBarCoins(this.ctx, winnings);
                await io.lln(`\`0You win \`%${prettyInt(winnings)} \`0BarCoins!`);
            } else if (playerPlace === 1) {
                const winnings = Math.floor(bet * 0.5);
                earnBarCoins(this.ctx, winnings);
                await io.lln(`\`0You win \`%${prettyInt(winnings)} \`0BarCoins!`);
            } else if (playerPlace === 2) {
                const winnings = Math.floor(bet * 0.25);
                earnBarCoins(this.ctx, winnings);
                await io.lln(`\`0You win \`%${prettyInt(winnings)} \`0BarCoins!`);
            } else {
                await io.lln('`0You won nothing!');
            }

            await io.sln();
            await io.lw('`2Wanna play again? `0[`2Y`0/`2N`0] ');
            io.emitPrompt('sandbar_elim_play_again', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let again: string;
            do {
                again = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(again) === -1);
            playAgain = again === 'Y';
        }
    }

    private async _elimPlayRound(playerNames: string[], scores: number[], eliminated: boolean[]): Promise<boolean> {
        const { io } = this.ctx;
        const totalPlayers = playerNames.length;
        const deck = this.createDeck();

        // Deal one card to each alive player
        const cards: (Card | null)[] = [];
        for (let p = 0; p < totalPlayers; p++) {
            if (eliminated[p]) {
                cards.push(null);
            } else {
                cards.push(deck.pop()!);
            }
        }

        // Player can trade their card
        if (!eliminated[0] && cards[0]) {
            await io.lln(`\`2Your card: ${this.cardName(cards[0])}`);
            await io.lw('`2[`0T`2]`!rade `%or `2[`0K`2]`!eep`%? ');

            io.emitPrompt('sandbar_elim_trade_keep', [
                { key: 'T', label: 'Trade' }, { key: 'K', label: 'Keep' },
            ]);
            let action: string;
            do {
                action = (await io.getkey()).toUpperCase();
            } while ('TK'.indexOf(action) === -1);

            if (action === 'T') {
                cards[0] = deck.pop()!;
                await io.lln(`\`2New card: ${this.cardName(cards[0])}`);
            }
        }

        // NPC decisions: trade if card value < 5
        for (let p = 1; p < totalPlayers; p++) {
            if (eliminated[p] || !cards[p]) continue;
            if (CARD_VALUES[cards[p]!.value] < 5) {
                cards[p] = deck.pop()!;
            }
        }

        // Flip cards and find lowest
        await io.lln('`%Final Standings this round:');
        let lowestVal = 999;
        for (let p = 0; p < totalPlayers; p++) {
            if (eliminated[p] || !cards[p]) continue;
            const val = CARD_VALUES[cards[p]!.value];
            if (val < lowestVal) lowestVal = val;
            await io.lln(`\`!${playerNames[p]}: \`2${this.cardName(cards[p]!)} \`0(${val})`);
        }

        // Deduct points from those with the lowest card
        for (let p = 0; p < totalPlayers; p++) {
            if (eliminated[p] || !cards[p]) continue;
            const val = CARD_VALUES[cards[p]!.value];
            if (val === lowestVal) {
                scores[p] -= val;
                await io.lln(`\`2${playerNames[p]} \`2lost \`%${val} \`2points.`);
                if (scores[p] <= 0) {
                    scores[p] = 0;
                    eliminated[p] = true;
                    await io.lln(`\`2${playerNames[p]} \`2was eliminated!`);
                }
            }
        }

        // Check if game is over (1 or fewer players left)
        let alive = 0;
        for (let p = 0; p < totalPlayers; p++) {
            if (!eliminated[p]) alive++;
        }
        return alive <= 1;
    }
}

export { SandBarGambling };
