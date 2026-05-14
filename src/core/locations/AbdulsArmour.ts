/**
 * AbdulsArmour - Abdul's Armour Shop location for LORD.
 *
 * Lets players browse and purchase armour upgrades using gold. Displays
 * available armour tiers with costs relative to the player's current
 * equipment, and handles the purchase transaction.
 */

import { random, format, prettyInt, dispLen } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type Equipment from '../Equipment';
import type IO from '../io/IO';
import type Player from '../Player';
import type { Settings, ArmourStats, UiMode } from '../types';

interface PendingArmourSale {
    armourNum: number;
    armour: ArmourStats;
    salePrice: number;
}

export class AbdulsArmour {
    private morechk: boolean;
    private pendingArmourSale: PendingArmourSale | null;

    constructor(
        private io: IO,
        private settings: Settings,
        private _equipment: Lazy<Equipment>,
        private _player: Lazy<Player>,
        private _uiMode: UiMode,
    ) {
        this.morechk = true;
        this.pendingArmourSale = null;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get equipment(): Equipment { return this._equipment.value; }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    get player(): Player { return this._player.value; }

    // ── Shop operations ────────────────────────────────────────────────

    private restorePendingArmourSale(): void {
        if (!this.pendingArmourSale) {
            return;
        }

        this.player.arm_num = this.pendingArmourSale.armourNum;
        this.player.arm = this.pendingArmourSale.armour.name;
        this.player.gold -= this.pendingArmourSale.salePrice;
        this.player.def += this.pendingArmourSale.armour.num;
        if (this.player.def > 32000) {
            this.player.def = 32000;
        }
        this.pendingArmourSale = null;
    }

    private async maybeRestorePendingArmourSale(): Promise<void> {
        if (this.settings.shop_restore_old_item_on_failed_upgrade !== true || !this.pendingArmourSale) {
            return;
        }

        await this.io.sln();
        await this.io.lln('`2"`0Never mind.  Here, take your old armour back before you get hurt.`2"');
        this.restorePendingArmourSale();
    }

    private async displayArmour(): Promise<void> {
        let i: number;
        let a: ArmourStats;
        let l: string;
        let p: string;
        let n: string;
        const mc = this.morechk;

        this.morechk = false;
        let rowOnPage = 4; // items start at row 4 (gotoxy y=4)
        for (i = 1; i < 16; i += 1) {
            // Paginate before writing an item that would fall off the bottom
            if (rowOnPage >= this.io.rows) {
                await this.io.moreNoMail();
                this.io.sclrscr();
                rowOnPage = 4;
            }
            a = this.equipment.getArmour(i);
            l = a.name;
            p = prettyInt(a.price);
            n = format("%2d", i);
            while (dispLen(l) + p.length < 42) {
                l += ".";
            }
            this.io.gotoxy(17, rowOnPage);
            await this.io.lln("`2" + n + ". " + l + "`0" + p, 0);
            rowOnPage += 1;
        }
        this.morechk = mc;
    }

    // Minimum defense to equip: sum of trainer defense gains up to (armour tier - 2)
    private defNeeded(arm: number): number {
        let i: number;
        let ret = 0;

        if (!this.settings.shop_limit) {
            return 0;
        }
        if (arm < 3) {
            return 0;
        }
        for (i = 1; i < arm - 1 && i <= this.equipment.trainerCount; i += 1) {
            ret += this.equipment.getTrainer(i).def;
        }
        return ret;
    }

    private async buyArmour(): Promise<void> {
        let n: number;
        let olda: ArmourStats;
        let newa: ArmourStats;
        let need: number;
        let ich: string;
        let price: number;
        let isBuyback: boolean;

        if (!this.player.expert) {
            this.io.sclrscr();
            if (!this.rip) await this.io.showTxt("BUYARM");
            this.io.background(0);
            await this.displayArmour();
        }
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2(`0Gold: `%" + prettyInt(this.player.gold) + "`2)  (`00 to Exit`2) ");
        await this.io.lw("`0Number Of Armour `2: `%", 2);
        // Emit item prompt for UI mode
        const armourOpts = [];
        for (let ai = 1; ai < 16; ai++) {
            const a = this.equipment.getArmour(ai);
            armourOpts.push({ key: String(ai), label: `${a.name} (${prettyInt(a.price)} gold)` });
        }
        armourOpts.push({ key: '0', label: 'Exit' });
        this.io.emitPrompt('buy_armour', armourOpts, 'string');
        n = parseInt(await this.io.getstr({ len: 2, integer: true }), 10);
        if (isNaN(n)) {
            n = 0;
        }
        if (n > 0 && n < 16) {
            newa = this.equipment.getArmour(n);
            olda = this.equipment.getArmour(this.player.arm_num);
            need = this.defNeeded(n);
            isBuyback = this.settings.shop_buyback_enabled === true
                && this.pendingArmourSale !== null
                && this.pendingArmourSale.armourNum === n;
            price = isBuyback && this.pendingArmourSale ? this.pendingArmourSale.salePrice : newa.price;
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("Abduls Armour Shop");
            this.io.foreground(2);
            if (this.rip) await this.io.sln(this.io.divider(27));
            else await this.io.sln(this.io.divider());
            await this.io.sln();
            if (isBuyback) {
                await this.io.lln('"`0I can let you buy back your `%' + newa.name + "`0 for `%" + prettyInt(price) + '`0. Agreed, friend?`2"', 1);
            } else {
                await this.io.lln('"`0Hmmm I will sell you a nice `%' + newa.name + "`0 for `%" + prettyInt(price) + '`0. Agreed, friend?`2"', 1);
            }
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(2);
            if (this.settings.shop_buyback_enabled === true && this.pendingArmourSale !== null) {
                await this.io.lln('`2Buyback available: `0' + this.pendingArmourSale.armour.name + ' `2for `%' + prettyInt(this.pendingArmourSale.salePrice) + '`2 gold.');
            }
            await this.io.lln("Note: It takes `%" + prettyInt(need) + "`2 defense points to wear this armor.");
            await this.io.lln("`2You currently have `%" + prettyInt(this.player.def - olda.num) + " `2defense points.");
            ich = await this.io.prompt(
                "   `2Buy it?  [`0N`2] : `%",
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'buy_armour_confirm',
                { defaultKey: 'N', echo: !this.rip && !this.modern, leadingBlank: true, trailingBlank: true }
            );
            if (ich === "N") {
                await this.io.lln('`2"`0Ok!  No rush!`2" the girl smiles.');
            } else if (!isBuyback && this.player.def < need) {
                await this.io.lln('`2"`0I\'m sorry, but you are not strong enough to wear that armor.`2"');
                await this.maybeRestorePendingArmourSale();
            } else if (this.player.arm_num > 0) {
                await this.io.lln('`2"`0You already have armour, and you can\'t wear two!`2" You realize she is right.');
            } else if (this.player.gold < price) {
                await this.io.lln('`2"`0I\'m sorry, but you seem to be lacking funds at the moment.`2"  the girl tells you.');
                await this.maybeRestorePendingArmourSale();
            } else {
                await this.io.lln('`2"`0Wonderful!`2" The girl takes your money, and helps you into your new armour.');
                this.player.arm = newa.name;
                this.player.arm_num = n;
                this.player.gold -= price;
                this.player.def += newa.num;
                this.io.events?.emitEconomy('purchase', price, newa.name);
                // DIFF: Used to compare to 3200 and set to 32000!
                if (this.player.def > 32000) {
                    this.player.def = 32000;
                }
                this.pendingArmourSale = null;
            }
            await this.io.sln();
            await this.io.moreNoMail();
        }
    }

    private async sellArmour(): Promise<void> {
        let price: number;

        this.io.sclrscr();
        this.io.foreground(15);
        await this.io.sln("Abduls Armour Shop");
        this.io.foreground(2);
        if (this.rip) await this.io.sln(this.io.divider(23));
        else await this.io.sln(this.io.divider());
        await this.io.sln();
        if (this.player.arm_num === 0) {
            await this.io.lln('`2"`0You silly kidder!!`2" Paula laughs, "`0You don\'t have any armour to sell!`2"');
            await this.io.sln();
            await this.io.sln();
            await this.io.more();
            return;
        }
        const olda = this.equipment.getArmour(this.player.arm_num);
        // Sell price = half base price + random bonus from level^2 * charisma; 65530 guards Pascal 16-bit overflow
        const mult = this.player.level * this.player.cha * this.player.level;
        if (mult >= 0 && mult <= 65530) {
            price = parseInt(String(olda.price / 2 + random(mult)), 10);
        } else {
            price = parseInt(String(olda.price / 2 + random(65530)), 10);
        }
        // Never sell for more than 2/3 of base price regardless of charisma bonus
        if (price > olda.price - price / 3) {
            price = olda.price - parseInt(String(olda.price / 3), 10);
        }
        await this.io.lln('`2"`0Hmmm I will buy your `%' + this.player.arm + " `0for `%" + prettyInt(price) + '`0 gold. Agreed, friend?`2"');
        // DIFF: This was after the print...
        const ich = await this.io.prompt(
            "  `2Sell it?  [`0N`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'sell_armour_confirm',
            { defaultKey: 'N', echo: !this.rip && !this.modern, leadingBlank: true, trailingBlank: true }
        );
        if (ich === "N") {
            await this.io.lln('`2"`0Thats ok.  Your armour probably has sentimental value to you.`2"');
            if (this.rip || this.modern) {
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
            if (this.rip) await this.io.showRip("BUYARM");
            return;
        }
        await this.io.lln('`2"`0Good doing business with you!`2" The girl takes your armour');
        await this.io.sln("and gives you the money.");
        if (this.settings.shop_buyback_enabled === true || this.settings.shop_restore_old_item_on_failed_upgrade === true) {
            this.pendingArmourSale = {
                armourNum: this.player.arm_num,
                armour: olda,
                salePrice: price,
            };
        } else {
            this.pendingArmourSale = null;
        }
        this.player.arm = "Nothing!";
        this.player.arm_num = 0;
        this.player.gold += price;
        this.io.events?.emitEconomy('sell', price, olda.name);
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
            await this.io.sln("Wow, you have a lot of money!", 0);
        }
        this.player.def -= olda.num;
        if (this.player.def < 1) {
            this.player.def = 0;
        }
        await this.io.moreNoMail();
    }

    async menu(): Promise<void> {
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("BUYARM");
        else {
            if (!this.player.expert) {
                await this.io.showTxt("ABDUL");
            }
        }
    }

    async run(): Promise<void> {
        let over = false;
        let ch: string;

        this.pendingArmourSale = null;

        if (this.rip) {
            await this.io.showRip("ABDUL");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        await this.menu();

        do {
            if (!this.rip && !this.modern) {
                await this.io.sln();
                await this.io.lln("`2Current armour: `0" + this.player.arm);
                await this.io.lln("`5Abduls Armour `8(B,S,Y,R)  (? for menu)");
            }
            ch = await this.io.commandPrompt('abduls_armour_menu', [
                { key: 'B', label: 'Buy Armour' },
                { key: 'S', label: 'Sell Armour' },
                { key: 'Y', label: 'Your Stats' },
                { key: 'R', label: 'Return' },
            ]);
            switch (ch) {
                case "L":
                    this.io.sclrscr();
                    if (this.rip) await this.io.showRip("BUYARM");
                    else await this.io.showTxt("BUYARM");
                    await this.displayArmour();
                    break;
                case "V":
                case "Y":
                    await this.io.showStats();
                    if (this.rip || this.modern) await this.menu();
                    break;
                case "S":
                    if (this.rip) await this.io.showRip("ABDUL3");
                    await this.sellArmour();
                    if (this.rip) await this.menu();
                    else if (this.modern) await this.menu();
                    break;
                case "B":
                    if (this.rip) await this.io.showRip("ABDUL3");
                    await this.buyArmour();
                    if (this.rip) await this.menu();
                    else if (this.modern) await this.menu();
                    break;
                case "R":
                case "Q":
                case "\r":
                    over = true;
                    break;
                case "?":
                    if (this.player.expert) {
                        if (this.rip) await this.io.showRip("ABDUL");
                        else await this.io.showTxt("ABDUL");
                    }
                    await this.menu();
                    break;
            }
        } while (!over);

        this.pendingArmourSale = null;
    }
}

export default AbdulsArmour;
