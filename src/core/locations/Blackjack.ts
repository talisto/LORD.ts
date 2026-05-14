/**
 * Blackjack - Blackjack card game for LORD.
 *
 * Implements the in-game blackjack mini-game available at the Red Dragon Inn.
 * Handles betting, card dealing, hit/stand decisions, and gold win/loss
 * accounting.
 */
import { random, prettyInt, dispLen } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type IO from '../io/IO';
import type Player from '../Player';
import type { UiMode } from '../types';

// Type placeholder for GameContext

interface Card {
    suit: number;
    val: number;
}

interface Hands {
    dealer: Card[][];
    player: Card[][];
}

export class Blackjack {
    private suits: string[];
    private scol: string[];
    private faces: string[];
    private values: number[];
    private shuffleStrs: string[];
    private startgold: number;
    private cards: Card[];
    private hands: Hands;
    private bet: number;
    private curlinenum: number;
    private morechk: boolean;

    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private _player: Lazy<Player>,
    ) {
        this.suits = ["\u2660", "\u2665", "\u2663", "\u2666"];
        this.scol = ["`r2", "`r2`4", "`r2", "`r2`4"];
        this.faces = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
        this.values = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
        this.shuffleStrs = ["/\\", "==", "══"];
        this.startgold = 0;
        this.cards = [];
        this.hands = { dealer: [[]], player: [[]] };
        this.bet = 0;
        this.curlinenum = 1;
        this.morechk = true;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get player(): Player { return this._player.value; }

    // ── Game mechanics ────────────────────────────────────────────────

    // Standard blackjack ace logic: count as 11, demote to 1 on bust. min=true forces all aces to 1.
    handTotal(hand: Card[], min?: boolean): number {
        let hti: number;
        let aces11: number = 0;
        let ret: number = 0;

        if (min === undefined) {
            min = false;
        }
        for (hti = 0; hti < hand.length; hti += 1) {
            if (hand[hti].val === 0) {
                aces11 += 1;
            }
            ret += this.values[hand[hti].val];
            if (ret > 21) {
                if (aces11 > 0) {
                    ret -= 10;
                    aces11 -= 1;
                }
            }
        }
        if (min) {
            while (aces11 > 0) {
                ret -= 10;
                aces11 -= 1;
            }
        }
        return ret;
    }

    shuffle(): void {
        let si: number;
        let j: number;
        let stmp: Card;

        this.cards = [];
        for (j = 0; j < 4; j += 1) {
            for (si = 0; si < 13; si += 1) {
                this.cards.push({ suit: j, val: si });
            }
        }
        for (si = this.cards.length; si > 1; si -= 1) {
            j = random(si);
            stmp = this.cards[si - 1];
            this.cards[si - 1] = this.cards[j];
            this.cards[j] = stmp;
        }
    }

    private async showTotal(play: boolean, total: number | string, split: number): Promise<void> {
        if (split === 0 && this.hands.player.length > 1) {
            split = 1;
        }
        if (play) {
            if (split === 1) {
                this.io.gotoxy(0, 22);
                await this.io.lw("`r0`2Hand1: `0" + total);
            } else if (split === 2) {
                this.io.gotoxy(13, 22);
                await this.io.lw("`r0`2Hand2: `0" + total);
            } else {
                this.io.gotoxy(0, 22);
                await this.io.lw("`r0`2You: `0" + total);
            }
        } else {
            this.io.gotoxy(68, 22);
            await this.io.lw("`r0`2Dealer: `0" + total);
        }
    }

    private wizclrScr(num: number): void {
        let y: number;

        switch (num) {
            case 1:
                this.io.background(0);
                for (y = 11; y <= 19; y += 1) {
                    this.io.gotoxy(1, y);
                    this.io.sw("            ");
                }
                break;
            case 2:
                this.io.background(0);
                for (y = 11; y <= 19; y += 1) {
                    this.io.gotoxy(67, y);
                    this.io.sw("            ");
                }
                break;
            case 3:
                this.io.background(2);
                for (y = 1; y <= 7; y += 1) {
                    this.io.gotoxy(24, y);
                    this.io.sw("                              ");
                }
                break;
            case 4:
                this.io.background(2);
                for (y = 10; y <= 16; y += 1) {
                    this.io.gotoxy(16, y);
                    this.io.sw("                       ");
                }
                break;
            case 5:
                this.io.background(2);
                for (y = 10; y <= 16; y += 1) {
                    this.io.gotoxy(40, y);
                    this.io.sw("                       ");
                }
                break;
            case 6:
                this.io.background(1);
                this.io.gotoxy(37, 18);
                this.io.sw("        ");
                break;
        }
    }

    private async wizmore(): Promise<void> {
        let wi: number;

        this.io.gotoxy(4, 19);
        if (this.rip) await this.io.lw("<CLICK>");
        else await this.io.lw("`2<`0MORE`2>");
        this.io.emitPrompt('wizmore', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        for (wi = 0; wi < 6; wi += 1) {
            this.io.sw("\b");
        }
        for (wi = 0; wi < 6; wi += 1) {
            this.io.sw(" ");
        }
    }

    private getCpic(card: Card): string {
        return this.scol[card.suit] + this.faces[card.val] + this.suits[card.suit];
    }

    private drawCardTop(left: number, top: number): void {
        this.io.gotoxy(left, top);
        this.io.sw('╒═════╕');
    }

    private async drawCardRow(left: number, top: number, row: string): Promise<void> {
        const padding = ' '.repeat(Math.max(0, 5 - dispLen(row)));

        this.io.gotoxy(left, top + 1);
        await this.io.lw('│' + row + padding + '│');
    }

    private drawCardBody(left: number, top: number): void {
        this.io.gotoxy(left, top + 2);
        this.io.sw('│     │');
        this.io.gotoxy(left, top + 3);
        this.io.sw('│     │');
        this.io.gotoxy(left, top + 4);
        this.io.sw('└─────┘');
    }

    private async drawCard(left: number, top: number, row: string, full: boolean): Promise<void> {
        this.io.background(2);
        this.io.foreground(0);
        this.drawCardTop(left, top);
        await this.drawCardRow(left, top, row);
        if (full) {
            this.drawCardBody(left, top);
        }
    }

    private async deal(who: number, count: number, show: boolean, split?: boolean): Promise<void> {
        if (split === undefined) {
            split = false;
        }
        let cpic: string;
        let card: Card;
        let di: number;
        let x: number;
        let y: number;
        const hand: Card[] = this.hands[who === 1 ? "dealer" : "player"][split ? 1 : 0];
        let full: boolean;
        let first: boolean = false;
        let dtmp: number;

        for (di = 0; di < count; di += 1) {
            const shifted = this.cards.shift();
            if (!shifted) break;
            card = shifted;
            cpic = this.getCpic(card);
            await this.io.mswait(500);
            hand.push(card);
            if (who === 1 && hand.length === 2) {
                first = true;
            }
            full = !!(hand.length % 2 === 1);
            dtmp = hand.length;
            if (split) {
                dtmp = 14 - hand.length;
                if (hand.length % 2 === 1) {
                    dtmp -= 2;
                }
            }
            x = 17 + parseInt(String((dtmp - 1) / 2), 10) * 8;
            if (who === 1) {
                x += 8;
            }
            y = (who === 1 ? 1 : 10) + (dtmp % 2) * 2;
            if (first) {
                await this.drawCard(x - 1, y, '▒▒▒▒▒', full);
            } else {
                await this.drawCard(x - 1, y, cpic, full);
            }
        }
        if (show) {
            await this.showTotal(who === 2, this.handTotal(hand, false), split ? 2 : 0);
        } else {
            await this.showTotal(who === 2, "?", 0);
        }
        this.hands[who === 1 ? "dealer" : "player"][split ? 1 : 0] = hand;
    }

    private async _askSplit(): Promise<boolean> {
        this.wizclrScr(1);
        this.io.foreground(10);
        this.io.gotoxy(1, 11);
        this.io.sw("Would you");
        this.io.gotoxy(1, 12);
        this.io.sw("like to");
        this.io.gotoxy(1, 13);
        this.io.sw("split?");
        this.io.gotoxy(67, 11);
        await this.io.lw("`2(`0Y`2)es (`0N`2)o. ");
        this.io.emitPrompt('split_confirm', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let cch = (await this.io.getkey()).toUpperCase();
        if (cch !== "Y") {
            cch = "N";
        }
        if (cch !== "Y") {
            return false;
        }
        if (this.player.gold < this.bet) {
            this.wizclrScr(1);
            this.io.foreground(10);
            this.io.gotoxy(1, 11);
            this.io.sw("Hey! you");
            this.io.gotoxy(1, 12);
            this.io.sw("don't have");
            this.io.gotoxy(1, 13);
            this.io.sw("enough gold!");
            await this.wizmore();
            return true;
        }
        const popped = this.hands.player[0].pop();
        if (popped) {
            this.hands.player[1] = [popped];
        }
        this.player.gold -= this.bet;
        this.io.gotoxy(0, 21);
        await this.io.lw("`r0`2Gold on hand: `$" + prettyInt(this.player.gold));
        this.io.gotoxy(37, 18);
        await this.io.lw("`r2`4" + this.bet * 2);
        this.io.gotoxy(16, 10);
        await this.io.lw("`r2`2       ");
        this.io.gotoxy(16, 11);
        this.io.sw("       ");
        await this.drawCard(56, 12, this.getCpic(this.hands.player[1][0]), true);
        this.io.gotoxy(0, 22);
        await this.io.lw("`r0`2Hand1:       Hand2:  ");
        await this.deal(2, 1, true);
        await this.deal(2, 1, true, true);
        return true;
    }

    private async _askDoubleDown(): Promise<'bust' | 'doubled' | 'declined'> {
        while (true) {
            this.wizclrScr(1);
            this.io.foreground(10);
            this.io.gotoxy(1, 11);
            this.io.sw("Would you");
            this.io.gotoxy(1, 12);
            this.io.sw("like to");
            this.io.gotoxy(1, 13);
            this.io.sw("double down?");
            this.io.gotoxy(67, 11);
            await this.io.lw("`2(`0Y`2)es (`0N`2)o. ");
            this.io.emitPrompt('double_down_confirm', [
                { key: 'Y', label: 'Yes' },
                { key: 'N', label: 'No' },
            ]);
            const cch = (await this.io.getkey()).toUpperCase();
            if (cch === "N") {
                return 'declined';
            }
            if (cch === "Y") {
                if (this.player.gold < this.bet) {
                    this.wizclrScr(1);
                    this.io.foreground(10);
                    this.io.gotoxy(1, 11);
                    this.io.sw("Hey! you");
                    this.io.gotoxy(1, 12);
                    this.io.sw("don't have");
                    this.io.gotoxy(1, 13);
                    this.io.sw("enough gold!");
                    await this.wizmore();
                    return 'declined';
                }
                this.player.gold -= this.bet;
                this.bet *= 2;
                this.io.gotoxy(0, 21);
                await this.io.lw("`r0`2Gold on hand:                  ");
                this.io.gotoxy(0, 21);
                await this.io.lw("`r0`2Gold on hand: `$" + prettyInt(this.player.gold));
                this.io.gotoxy(37, 19);
                await this.io.lw("`r2`4" + this.bet);
                await this.deal(2, 1, true);
                if (this.handTotal(this.hands.player[0]) > 21) {
                    return 'bust';
                }
                return 'doubled';
            }
        }
    }

    private async cardCheck(): Promise<string> {
        let candouble: boolean = true;
        let ptotal: number = 0;
        let dealcards: boolean = true;
        let hand: number = 0;

        if (this.hands.player[0][0].val === this.hands.player[0][1].val) {
            if (await this._askSplit()) {
                candouble = false;
            }
        }
        if (this.handTotal(this.hands.player[0]) === 21 && this.hands.player[0].length === 2) {
            candouble = false;
        }
        // Double down offered when minimum hand total (aces as 1) is 9, 10, or 11
        if (candouble) {
            const cctmp = this.handTotal(this.hands.player[0], true);
            if (cctmp > 8 && cctmp < 12) {
                const ddResult = await this._askDoubleDown();
                if (ddResult === 'bust') {
                    return "BUST";
                }
                if (ddResult === 'doubled') {
                    dealcards = false;
                }
            }
        }
        while (dealcards) {
            ptotal = this.handTotal(this.hands.player[hand]);
            if (this.hands.player.length > 1) {
                if (ptotal > 21) {
                    this.wizclrScr(1);
                    this.io.gotoxy(1, 11);
                    await this.io.lw("`0Sorry!");
                    this.io.gotoxy(1, 12);
                    this.io.sw("That hand");
                    this.io.gotoxy(1, 13);
                    this.io.sw("busted.");
                    await this.wizmore();
                    if (hand === 1) {
                        break;
                    }
                    hand += 1;
                    ptotal = this.handTotal(this.hands.player[hand]);
                }
            } else {
                if (ptotal > 21) {
                    return "BUST";
                }
                if (this.hands.player[0].length === 2 && ptotal === 21) {
                    return "BLACKJACK";
                }
            }
            // start3
            this.wizclrScr(1);
            this.wizclrScr(2);
            this.io.foreground(10);
            this.io.gotoxy(1, 11);
            this.io.sw("Would you");
            this.io.gotoxy(1, 12);
            this.io.sw("like to hit");
            this.io.gotoxy(1, 13);
            this.io.sw("or stay?");
            if (this.hands.player.length > 1) {
                this.io.gotoxy(1, 15);
                this.io.sw("Hand" + (hand + 1));
            }
            this.io.gotoxy(67, 11);
            await this.io.lw("`2(`0H`2)it");
            this.io.gotoxy(67, 12);
            await this.io.lw("`2(`0S`2)tay");
            this.io.emitPrompt('hit_stay', [
                { key: 'H', label: 'Hit' },
                { key: 'S', label: 'Stay' },
            ]);
            const cch = (await this.io.getkey()).toUpperCase();
            if (cch === "S") {
                if (this.hands.player.length === 1) {
                    break;
                }
                if (hand === 1) {
                    break;
                }
                hand += 1;
            } else if (cch === "H") {
                await this.deal(2, 1, true, !(hand === 0));
            }
        }
        await this.io.lw("`r2");
        await this.drawCard(24, 1, '▒▒▒▒▒', false);
        await this.io.mswait(500);
        await this.drawCard(24, 1, '▒▒▒▒ ', false);
        await this.io.mswait(500);
        await this.drawCard(24, 1, '▒▒▒  ', false);
        await this.io.mswait(500);
        await this.drawCard(24, 1, this.getCpic(this.hands.dealer[0][1]), false);
        await this.showTotal(false, this.handTotal(this.hands.dealer[0]), 0);
        let dtotal: number;
        while (true) {
            dtotal = this.handTotal(this.hands.dealer[0]);
            if (dtotal > 21) {
                if (this.hands.player.length > 1) {
                    return "WW";
                }
                return "DBUST";
            }
            if (dtotal === 21 && this.hands.dealer[0].length === 2) {
                return "DBLACKJACK";
            }
            if (dtotal < 17) {
                await this.deal(1, 1, true);
            } else {
                break;
            }
        }
        if (this.hands.player.length === 1) {
            if (dtotal === ptotal) {
                return "PUSH";
            }
            if (dtotal > ptotal) {
                return "DWIN";
            }
            return "WIN";
        }
        let result = "";
        ptotal = this.handTotal(this.hands.player[0]);
        if (dtotal === ptotal) {
            result += "P";
        } else if (dtotal > ptotal || ptotal > 21) {
            result += "D";
        } else {
            result += "W";
        }
        ptotal = this.handTotal(this.hands.player[1]);
        if (dtotal === ptotal) {
            result += "P";
        } else if (dtotal > ptotal) {
            result += "D";
        } else {
            result += "W";
        }
        return result;
    }

    private async _placeBet(): Promise<boolean> {
        while (true) {
            this.wizclrScr(1);
            this.io.foreground(10);
            this.io.gotoxy(1, 11);
            this.io.sw("How much");
            this.io.gotoxy(1, 12);
            this.io.sw("ya gonna");
            this.io.gotoxy(1, 13);
            this.io.sw("wager?");
            this.io.foreground(4);
            this.io.background(2);
            this.io.gotoxy(37, 19);
            this.bet = parseInt(
                (await this.io.getstr({ x: 38, y: 19, len: 8, c: 1, c1: 15, edit: "200", integer: true, inputBox: true, select: true })).trim(),
                10,
            );
            if (isNaN(this.bet) || this.bet === 0) {
                this.wizclrScr(1);
                this.io.foreground(10);
                this.io.gotoxy(1, 11);
                this.io.sw("Fine, maybe");
                this.io.gotoxy(1, 12);
                this.io.sw("later.");
                await this.wizmore();
                return false;
            }
            // Bet range: 200 minimum, level * 1000 maximum
            if (this.bet < 200) {
                this.io.gotoxy(1, 14);
                await this.io.lw("`0`r0Too little!");
                await this.wizmore();
                this.wizclrScr(1);
            } else if (this.bet > this.player.level * 1000) {
                this.io.gotoxy(1, 14);
                await this.io.lw("`0`r0Too much!");
                await this.wizmore();
                this.wizclrScr(1);
            } else if (this.player.gold < this.bet) {
                this.wizclrScr(1);
                this.io.foreground(10);
                this.io.gotoxy(1, 11);
                this.io.sw("Hey! you");
                this.io.gotoxy(1, 12);
                this.io.sw("don't have");
                this.io.gotoxy(1, 13);
                this.io.sw("enough gold!");
                await this.wizmore();
                return false;
            } else {
                return true;
            }
        }
    }

    private async _handleResultBust(): Promise<void> {
        this.io.foreground(10);
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        switch (random(3)) {
            case 0:
                this.io.sw("You busted!");
                this.io.gotoxy(1, 12);
                this.io.sw("Better luck");
                this.io.gotoxy(1, 13);
                this.io.sw("next time.");
                break;
            case 1:
                this.io.sw("Oh too bad!");
                this.io.gotoxy(1, 12);
                this.io.sw("Maybe next");
                this.io.gotoxy(1, 13);
                this.io.sw("hand? (haw!)");
                break;
            case 2:
                this.io.sw("You busted!");
                this.io.gotoxy(1, 12);
                this.io.sw("Have you");
                this.io.gotoxy(1, 13);
                this.io.sw("played this");
                this.io.gotoxy(1, 14);
                this.io.sw("game before?");
                break;
        }
        await this.wizmore();
    }

    private async _handleResultBlackjack(): Promise<void> {
        this.io.foreground(10);
        // Blackjack pays 3x bet (2:1 payout); normal win pays 2x (1:1)
        this.bet *= 3;
        this.player.gold += this.bet;
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        this.io.sw("You got a");
        this.io.gotoxy(1, 12);
        this.io.sw("Blackjack!?");
        this.io.gotoxy(1, 13);
        this.io.sw("Are you");
        this.io.gotoxy(1, 14);
        this.io.sw("cheating?!");
        this.io.gotoxy(1, 16);
        this.io.sw("You win");
        this.io.gotoxy(1, 17);
        await this.io.lw("`$" + prettyInt(this.bet) + "`0");
        this.io.gotoxy(1, 18);
        this.io.sw("Gold.");
        await this.wizmore();
    }

    private async _handleResultDealerBust(): Promise<void> {
        this.io.foreground(10);
        this.bet *= 2;
        this.player.gold += this.bet;
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        switch (random(3)) {
            case 0:
                this.io.sw("I busted!");
                this.io.gotoxy(1, 12);
                this.io.sw("See? You");
                this.io.gotoxy(1, 13);
                this.io.sw("win ");
                this.io.gotoxy(1, 15);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 16);
                this.io.sw("Gold.");
                break;
            case 1:
                this.io.sw("Looks like");
                this.io.gotoxy(1, 12);
                this.io.sw("I busted.");
                this.io.gotoxy(1, 14);
                this.io.sw("You win");
                this.io.gotoxy(1, 15);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 16);
                this.io.sw("Gold... Arg.");
                break;
            case 2:
                this.io.sw("I busted!");
                this.io.gotoxy(1, 12);
                this.io.sw("Damnit!");
                this.io.gotoxy(1, 14);
                this.io.sw("You win");
                this.io.gotoxy(1, 15);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 16);
                this.io.sw("Gold.");
                break;
        }
        await this.wizmore();
    }

    private async _handleResultDealerBlackjack(): Promise<void> {
        this.io.foreground(10);
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        switch (random(3)) {
            case 0:
                this.io.sw("Dealer gets");
                this.io.gotoxy(1, 12);
                this.io.sw("Blackjack!");
                this.io.gotoxy(1, 13);
                this.io.sw("Aw, too bad");
                this.io.gotoxy(1, 14);
                this.io.sw("for the big");
                this.io.gotoxy(1, 15);
                this.io.sw("human.");
                break;
            case 1:
                this.io.sw("Blackjack!");
                this.io.gotoxy(1, 12);
                this.io.sw("I'm hot");
                this.io.gotoxy(1, 13);
                this.io.sw("today!");
                break;
            case 2:
                this.io.sw("Dealer gets");
                this.io.gotoxy(1, 12);
                this.io.sw("Blackjack!");
                this.io.gotoxy(1, 13);
                this.io.sw("Not your");
                this.io.gotoxy(1, 14);
                this.io.sw("day is it?");
                break;
        }
        await this.wizmore();
    }

    private async _handleResultPush(): Promise<void> {
        this.io.foreground(10);
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        this.io.sw("It's a push!");
        this.io.gotoxy(1, 12);
        this.io.sw("I guess it's");
        this.io.gotoxy(1, 13);
        this.io.sw("better than");
        this.io.gotoxy(1, 14);
        this.io.sw("losing.");
        this.player.gold += this.bet;
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        await this.wizmore();
    }

    private async _handleResultDealerWin(): Promise<void> {
        this.io.foreground(10);
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        this.io.sw("Looks like");
        this.io.gotoxy(1, 12);
        this.io.sw("you lose.");
        this.io.gotoxy(1, 13);
        this.io.sw("Oh well!");
        this.io.gotoxy(1, 14);
        this.io.sw("better luck");
        this.io.gotoxy(1, 15);
        this.io.sw("next time.");
        await this.wizmore();
    }

    private async _handleResultWin(): Promise<void> {
        this.io.foreground(10);
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        this.bet *= 2;
        this.player.gold += this.bet;
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        switch (random(3)) {
            case 0:
                this.io.sw("That beats");
                this.io.gotoxy(1, 12);
                this.io.sw("my hand!");
                this.io.gotoxy(1, 14);
                this.io.sw("You win");
                this.io.gotoxy(1, 15);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 16);
                this.io.sw("Gold, Loser.");
                break;
            case 1:
                this.io.sw("You win!");
                this.io.gotoxy(1, 12);
                this.io.sw("Are you");
                this.io.gotoxy(1, 13);
                this.io.sw("counting?");
                this.io.gotoxy(1, 15);
                this.io.sw("You win");
                this.io.gotoxy(1, 16);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 17);
                this.io.sw("Gold.");
                break;
            case 2:
                this.io.sw("You win!");
                this.io.gotoxy(1, 12);
                this.io.sw("Not too bad");
                this.io.gotoxy(1, 14);
                this.io.sw("for a kid...");
                this.io.gotoxy(1, 15);
                this.io.sw("You win");
                this.io.gotoxy(1, 16);
                await this.io.lw("`$" + prettyInt(this.bet) + "`0");
                this.io.gotoxy(1, 17);
                this.io.sw("Gold.");
                break;
        }
        await this.wizmore();
    }

    private async _handleResultSplit(res: string): Promise<void> {
        let tmp = 0;
        this.wizclrScr(1);
        this.io.gotoxy(1, 11);
        await this.io.lln("`0I have " + this.handTotal(this.hands.dealer[0]) + ".", 0);
        await this.io.mswait(1500);
        this.io.gotoxy(1, 12);
        switch (res[0]) {
            case "W":
                this.io.sw("Hand1 Wins!");
                tmp += this.bet * 2;
                break;
            case "P":
                this.io.sw("Hand1 Push!");
                tmp += this.bet;
                break;
            case "D":
                this.io.sw("Hand1 Loses!");
                break;
        }
        this.io.gotoxy(1, 14);
        switch (res[1]) {
            case "W":
                this.io.sw("Hand2 Wins!");
                tmp += this.bet * 2;
                break;
            case "P":
                this.io.sw("Hand2 Push!");
                tmp += this.bet;
                break;
            case "D":
                this.io.sw("Hand2 Loses!");
                break;
        }
        this.io.gotoxy(1, 15);
        this.io.sw("You win");
        this.io.gotoxy(1, 16);
        await this.io.lw("`$" + tmp + "`0");
        this.io.gotoxy(1, 17);
        this.io.sw("Gold.");
        this.player.gold += tmp;
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        await this.wizmore();
    }

    private async _showEndMessage(): Promise<void> {
        this.io.foreground(10);
        if (this.player.gold > this.startgold) {
            this.wizclrScr(1);
            this.io.gotoxy(1, 11);
            this.io.sw("Quitting");
            this.io.gotoxy(1, 12);
            this.io.sw("while your");
            this.io.gotoxy(1, 13);
            this.io.sw("ahead?");
            this.io.gotoxy(1, 14);
            this.io.sw("Smart move.");
        } else if (this.player.gold < this.startgold) {
            this.wizclrScr(1);
            this.io.gotoxy(1, 11);
            this.io.sw("Come back");
            this.io.gotoxy(1, 12);
            this.io.sw("soon. We");
            this.io.gotoxy(1, 13);
            this.io.sw("enjoyed");
            this.io.gotoxy(1, 14);
            this.io.sw("your money!");
            this.io.gotoxy(1, 15);
            this.io.sw("::snicker::");
        } else {
            this.wizclrScr(1);
            this.io.gotoxy(1, 11);
            this.io.sw("It's been");
            this.io.gotoxy(1, 12);
            this.io.sw("nice doing");
            this.io.gotoxy(1, 13);
            this.io.sw("business");
            this.io.gotoxy(1, 14);
            this.io.sw("with you...");
        }
        await this.wizmore();
    }

    private async playHand(): Promise<void> {
        //sam2
        let i: number;
        let res: string;
        let ch: string;
        const mc: boolean = this.morechk;

        this.morechk = false;
        hand: while (true) {
            this.shuffle();
            this.io.gotoxy(1, 11);
            await this.io.lw("`r0`%Shuffling.");
            for (i = 0; i < 9; i += 1) {
                await this.io.mswait(100);
                this.io.gotoxy(1, 12);
                this.io.sw(this.shuffleStrs[i % this.shuffleStrs.length]);
            }
            this.hands.dealer = [[]];
            this.hands.player = [[]];
            // DIFF: startgold was reset to this.player.gold here.
            // startgold = this.player.gold;
            this.io.gotoxy(0, 21);
            await this.io.lw("`r0`2Gold on hand: `$" + prettyInt(this.player.gold));
            this.io.gotoxy(0, 22);
            await this.io.lw("`r0                                                                              ");
            await this.showTotal(true, 0, 0);
            await this.showTotal(false, 0, 0);
            if (!await this._placeBet()) {
                break hand;
            }
            this.player.gold -= this.bet;
            this.io.gotoxy(0, 21);
            await this.io.lw("`r0`2Gold on hand: `$" + prettyInt(this.player.gold) + "            ");
            await this.deal(1, 1, false);
            await this.deal(2, 1, true);
            await this.deal(1, 1, false);
            await this.deal(2, 1, true);
            res = await this.cardCheck();
            switch (res) {
                case "BUST": await this._handleResultBust(); break;
                case "BLACKJACK": await this._handleResultBlackjack(); break;
                case "DBUST": await this._handleResultDealerBust(); break;
                case "DBLACKJACK": await this._handleResultDealerBlackjack(); break;
                case "PUSH": await this._handleResultPush(); break;
                case "DWIN": await this._handleResultDealerWin(); break;
                case "WIN": await this._handleResultWin(); break;
                default: await this._handleResultSplit(res); break;
            }
            this.wizclrScr(1);
            this.wizclrScr(2);
            this.io.gotoxy(1, 11);
            this.io.foreground(10);
            this.io.sw("Play again?");
            this.io.gotoxy(67, 11);
            await this.io.lw("`2(`0Y`2)es (`0N`2)o. ");
            this.io.emitPrompt('play_again', [
                { key: 'Y', label: 'Yes' },
                { key: 'N', label: 'No' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            if (ch !== "Y") {
                ch = "N";
            }
            if (ch === "N") {
                break;
            }
            this.wizclrScr(1);
            this.wizclrScr(2);
            this.wizclrScr(3);
            this.wizclrScr(4);
            this.wizclrScr(5);
            this.wizclrScr(6);
        }
        await this._showEndMessage();
        this.io.gotoxy(0, 23);
        this.morechk = mc;
        this.curlinenum = 1;
        const netGold = this.player.gold - this.startgold;
        if (netGold > 0) {
            this.io.events?.emitEconomy('gold_gained', netGold, 'blackjack');
        } else if (netGold < 0) {
            this.io.events?.emitEconomy('gold_lost', -netGold, 'blackjack');
        }
    }

    async run(): Promise<void> {
        let ch: string;
        this.startgold = this.player.gold;

        while (true) {
            await this.io.lln("`c`%A meeting of chance.`2");
            await this.io.sln();
            await this.io.sln("A sly looking dwarf hops out of the brush.");
            await this.io.sln();
            await this.io.lln('`2"`0How about a game, friend?`2"');
            await this.io.sln();
            await this.io.lln("`2(`0G`2)ive the game a chance");
            await this.io.lln("(`0T`2)ell the Dwarf to screw off");
            do {
                ch = await this.io.commandPrompt('blackjack_menu', [
                    { key: 'G', label: 'Give the game a chance' },
                    { key: 'T', label: 'Tell the Dwarf to screw off' },
                ], false);
            } while ("GT?".indexOf(ch) === -1);
            await this.io.sln();
            this.io.foreground(0);
            switch (ch) {
                case "?":
                    break;
                case "T":
                    await this.io.sln();
                    await this.io.lln('`2"`0Your loss, kid.  Forget you ever saw me!`2"');
                    await this.io.sln();
                    await this.io.more();
                    return;
                case "G":
                    await this.io.sln();
                    await this.io.lln('`0"Excellent!" `2the dwarf exclaims as he pulls out a makeshift black jack table!');
                    await this.io.sln();
                    await this.io.lln('`2"`0As for the rules... I have to stay on a 17.  You can double down on a 9, 10 or 11, and I do allow splitting pairs multiple times.`2"');
                    await this.io.sln();
                    await this.io.sln("You rub your chin - with any luck you'll double your money...");
                    await this.io.sln();
                    await this.io.more();
                    this.io.sclrscr();
                    await this.io.showTxt("BJTABLE");
                    await this.playHand();
                    return;
            }
        }
    }

    // Legacy method for backward compatibility
    async blackjack(): Promise<void> {
        await this.run();
    }
}

export default Blackjack;
