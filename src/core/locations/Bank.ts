/**
 * Bank - Ye Olde Bank location for LORD
 * Refactored from lord.js - nested functions extracted as class methods
 */

import { random, prettyInt } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type { LdyManager } from '../lady/LdyManager';
import type IO from '../io/IO';
import type Mail from '../Mail';
import { BankTransferAmountPolicy } from '../BankTransferAmountPolicy';
import { PlayerIpHistoryPolicy } from '../PlayerIpHistoryPolicy';
import { PlayerRelationPolicy } from '../PlayerRelationPolicy';
import type Player from '../Player';
import type { Settings, PlayerRecord, UiMode } from '../types';

export class Bank {
    private classList: string[];

    constructor(
        private io: IO,
        private settings: Settings,
        private _uiMode: UiMode,
        private _player: Lazy<Player>,
        private _mail: Lazy<Mail>,
        private _ldyManager: Lazy<LdyManager>,
    ) {
        this.classList = ["stranger", "warrior", "magician", "thief"];
    }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get player(): Player { return this._player.value; }
    get mail(): Mail { return this._mail.value; }
    get ldyManager(): LdyManager { return this._ldyManager.value; }

    async menu(): Promise<void> {
        this.io.sclrscr();
        // Bank screens still come from the stock BANK text/RIP assets so the
        // location keeps the original presentation across ANSI and RIP modes.
        if (this.rip) await this.io.showRip("BANK");
        else await this.io.showTxt("BANK");
    }

    async prompt(): Promise<void> {
        await this.io.sln();
        await this.io.lw("`2Gold In Hand: `0" + prettyInt(this.player.gold), 2);
        if (this.rip) await this.io.sln();
        await this.io.lln("`2Gold In Bank: `0" + prettyInt(this.player.bank));
        if (!this.rip && !this.modern) await this.io.lln("`5The Bank `8(W,D,R,T,Q)  (? for menu)");
        this.io.emitPrompt('bank_menu', [
            { key: 'W', label: 'Withdraw' },
            { key: 'D', label: 'Deposit' },
            { key: 'R', label: 'Return' },
            { key: 'T', label: 'Transfer' },
            { key: 'Q', label: 'Quit' },
        ]);
    }

    async run(): Promise<void> {
        await this.menu();
        await this.prompt();
        let ch: string;
        do {
            ch = await this.io.commandPrompt();
            switch (ch) {
                case "W":
                    await this._withdraw();
                    break;
                case "D":
                    await this._deposit();
                    break;
                case "T":
                    await this._transfer();
                    break;
                case "R":
                case "Q":
                case "\r":
                    break;
                case "?":
                    await this.menu();
                    await this.prompt();
                    break;
                case "1":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("Nice rock.");
                    await this.io.sln();
                    break;
                case "4":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln("`2Look wise guy, these are `)NOT `2secret keys.  They say these things when you click on pictures in RIP.  Nothing more. (Then again...)");
                    await this.io.sln();
                    break;
                case "2":
                    await this._trySteal();
                    break;
                case "3":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("Maybe there is a Genie in there.");
                    await this.io.sln();
                    break;
            }
        } while ("RQ\r".indexOf(ch) === -1);

        if (!this.player.leftbank) {
            this.player.leftbank = true;
            await this.ldyManager.runLeaveBankEvent();
        }
    }

    private async _withdraw(): Promise<void> {
        if (this.rip) {
            await this.io.sln();
            await this.io.lln('`2"How much gold would you like to withdraw?" `0(1 for ALL of it)');
        } else {
            await this.io.lln("`c`%Ye Olde Bank`#");
            await this.io.sln(this.io.divider());
            await this.io.lln(
                "  `2Gold In Hand: `0" +
                    prettyInt(this.player.gold) +
                    "  `2Gold In Bank: `0" +
                    prettyInt(this.player.bank),
            );
            await this.io.sln();
            await this.io.lln('`2"How much gold would you like to withdraw?" `0(1 for ALL of it)');
        }
        await this.io.sln();
        await this.io.lw("`0AMOUNT : ", 2);
        this.io.emitPrompt('bank_withdraw_amount', [], 'number');
        let amt = parseInt(await this.io.getstr({ len: 11, integer: true }), 10);
        if (isNaN(amt)) {
            amt = 0;
        }
        // Stock shorthand: entering 1 means "withdraw everything".
        if (amt === 1) {
            amt = this.player.bank;
        }
        // Cap carried gold at LORD's 2,000,000,000 ceiling.
        if (this.player.gold + amt > 2000000000) {
            amt = 2000000000 - this.player.gold;
        }
        if (amt === 0) {
            await this.io.sln();
            await this.io.sln('"Okay. Maybe another time."');
        } else if (amt < 0) {
            await this.io.sln();
            await this.io.sln('"Uh...Wouldn\'t that be depositing?!"');
        } else if (amt > this.player.bank) {
            await this.io.sln();
            await this.io.lln("\"I'm afraid you don't have that much in your account, " + (this.player.sex === "M" ? 'sir."' : "ma'am.\""));
        } else {
            await this.io.sln();
            await this.io.sln("Done! " + prettyInt(amt) + " withdrawn.");
            this.player.bank -= amt;
            this.player.gold += amt;
            this.io.events?.emitEconomy('withdraw', amt);
        }
        if (this.rip || this.modern) await this.prompt();
    }

    private async _deposit(): Promise<void> {
        if (this.rip) {
            await this.io.lln('`2"How much gold would you like to deposit?" `0(1 for ALL of it)');
        } else {
            await this.io.lln("`c`%Ye Olde Bank`#");
            await this.io.sln(this.io.divider());
            await this.io.lln(
                "  `2Gold In Hand: `0" +
                    prettyInt(this.player.gold) +
                    "   `2Gold In Bank: `0" +
                    prettyInt(this.player.bank),
            );
            await this.io.sln();
            await this.io.lln('`2"How much gold would you like to deposit?" `0(1 for ALL of it)');
        }
        await this.io.sln();
        await this.io.lw("`0AMOUNT: ", 2);
        this.io.emitPrompt('bank_deposit_amount', [], 'number');
        let amt = parseInt(await this.io.getstr({ len: 11, integer: true }), 10);
        if (isNaN(amt)) {
            amt = 0;
        }
        // Stock shorthand: entering 1 means "deposit everything".
        if (amt === 1) {
            amt = this.player.gold;
        }
        if (this.player.bank + amt > 2000000000) {
            amt = 2000000000 - this.player.bank;
        }
        if (amt === 0) {
            await this.io.sln();
            await this.io.sln('"Okay. Maybe another time."');
        } else if (amt < 0) {
            await this.io.sln();
            await this.io.lln('"Uh...Wouldn\'t that be withdrawing?!"');
        } else if (amt > this.player.gold) {
            await this.io.sln();
            await this.io.sln("\"I'm afraid you don't have that much on you, " + (this.player.sex === "M" ? 'sir."' : "ma'am.\""));
        } else if (this.player.bank >= 2000000000) {
            this.player.bank = 2000000000;
            await this.io.sln();
            await this.io.sln("\"I'm sorry, but we can only keep 2,000,000,000 gold at a time. ");
        } else {
            await this.io.sln();
            await this.io.sln("Done! " + prettyInt(amt) + " deposited.");
            this.player.gold -= amt;
            this.player.bank += amt;
            this.io.events?.emitEconomy('deposit', amt);
        }
        if (this.rip || this.modern) await this.prompt();
    }

    private async _transfer(): Promise<void> {
        if (!this.settings.transfers_on) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`0I'm sorry, but all of our carriers are on permanent vacation.");
            await this.io.sln();
            return;
        }
        if (!this.rip) {
            await this.io.lln("`c`%Ye Olde Bank`#");
            await this.io.lln(this.io.divider(), 0);
        }
        await this.io.lw("`2Gold In Hand: `0" + prettyInt(this.player.gold), 2);
        if (this.rip) await this.io.sln();
        await this.io.lln("`2Gold In Bank: `0" + prettyInt(this.player.bank));
        this.io.foreground(2);
        await this.io.sln('"How much gold would you like to transfer?"');
        await this.io.lw("`0AMOUNT : ", 2);
        this.io.emitPrompt('bank_transfer_amount', [], 'number');
        let amt = parseInt(await this.io.getstr({ len: 11, integer: true }), 10);
        if (isNaN(amt)) {
            amt = 0;
        }
        if (amt === 0) {
            await this.io.sln();
            await this.io.sln('"Okay. Maybe some other time."');
        } else if (amt < 0) {
            await this.io.sln();
            await this.io.sln('"Uh...Wouldn\'t that be taking money from his account?!"');
        } else if (amt > this.player.bank) {
            await this.io.sln();
            await this.io.sln("\"I'm afraid you don't have that much in your account, " + (this.player.sex === "M" ? 'sir."' : 'woman."'));
        } else if (amt > (this.settings.transfer_amount || 0)) {
            await this.io.sln();
            await this.io.sln(
                '"Our messenger will not carry more than ' +
                    prettyInt(this.settings.transfer_amount || 0) +
                    ' gold pieces at a time!"',
            );
        } else {
            // Transfer validation layers: daily gold-cap policy,
            // daily courier count, shared-IP abuse checks, then
            // per-player blocking rules before money actually moves.
            const amountCapCheck = BankTransferAmountPolicy.canTransfer(
                this.mail.storage,
                this.player.time,
                this.player.Record,
                amt,
                this.settings.daily_bank_transfer_gold_cap || 0,
            );
            if (!amountCapCheck.allowed) {
                await this.io.sln();
                if (amountCapCheck.remaining > 0) {
                    await this.io.sln(
                        '"Our ledgers say you may only send ' +
                            prettyInt(amountCapCheck.remaining) +
                            ' more gold today!"',
                    );
                } else {
                    await this.io.sln('"Our ledgers say you have already sent all the gold you may send today."');
                }
            } else if ((this.settings.transfers_per_day || 0) > 0 && this.player.transferred_gold >= (this.settings.transfers_per_day || 0)) {
                await this.io.lln('`0"Very sorry, but all couriers are busy.');
                await this.io.sln();
            } else {
                await this.io.sln();
                await this.io.sln('"And who would you like to send this gold to?"');
                const to = await this.player.findPlayer();
                if (to === -1 || to === this.player.Record) {
                    await this.io.sln();
                    await this.io.sln("Gold Not Sent!");
                    return;
                }
                const op = this.player.playerGet(to) as PlayerRecord | null;
                if (
                    this.settings.shared_ip_block_bank_transfers === true
                    && PlayerIpHistoryPolicy.havePlayersSharedRecentIp(this.mail.storage, this.player.time, this.player.Record, to, this.settings)
                ) {
                    await this.io.sln();
                    await this.io.sln('That player recently shared your address.');
                    await this.io.sln('Gold Not Sent!');
                    return;
                }
                if (this.settings.player_blocking === true && PlayerRelationPolicy.isPlayerBlocked(this.mail.storage, to, this.player.Record)) {
                    await this.io.sln();
                    await this.io.sln('That player refuses bank deliveries from you.');
                    await this.io.sln('Gold Not Sent!');
                    return;
                }
                this.player.bank -= amt;
                this.player.transferred_gold += 1;
                this.player.put();
                BankTransferAmountPolicy.recordTransfer(this.mail.storage, this.player.time, this.player.Record, amt);
                this.io.events?.emitEconomy('transfer', amt, undefined, { to: op?.name || 'Someone' });
                await this.io.sln();
                await this.io.lln("Done!  " + (op?.name || "Someone") + " will be notified!");
                const mline =
                    " \n  `%BANK NOTICE:\n`l\n  `0" +
                    this.player.name +
                    " `2has transferred `%" +
                    amt +
                    " `2gold\n  to your account.\n`b" +
                    amt;
                await this.mail.mailTo(to, mline);
            }
        }
    }

    private async _trySteal(): Promise<void> {
        await this.io.sln();
        await this.io.sln();
        if (this.player.clss === 3) {
            if (this.player.has_fairy) {
                await this.io.lln("`0** `%TRICKY EVENT! `0**`2");
                await this.io.sln();
                await this.io.sln("The buzzing in your pocket reminds you that the little fairy can feel your emotions.");
                await this.io.sln();
                await (this.io).moreNoMail();
                await this.io.lln("`%IT ESCAPES FROM YOUR POCKET AND PICKS THE LOCK!");
                await this.io.sln();
                await (this.io).moreNoMail();
                let amt: number;
                if (this.settings.old_steal) {
                    amt = (random(500) + 500) * this.player.level * this.player.level * this.player.level;
                } else {
                    amt = (random(500) + 500) * this.player.level;
                }
                this.player.has_fairy = false;
                await this.io.lln("`2You steal `0" + prettyInt(amt) + " `2while the banker isn't looking.");
                this.player.gold += amt;
                this.io.events?.emitEconomy('gold_gained', amt, undefined, { source: 'bank_steal' });
                await this.io.sln();
                await (this.io).moreNoMail();
                await this.prompt();
                return;
            }
            await this.io.sln("You're a thief, find the key.");
        } else {
            await this.io.sln("Steal?  Never!");
        }
        await this.io.sln();
    }
}

export default Bank;
