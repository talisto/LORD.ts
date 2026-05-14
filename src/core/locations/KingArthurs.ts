/**
 * KingArthurs - King Arthur's Weapons Shop location for LORD.
 *
 * Lets players browse and purchase weapon upgrades using gold. Displays
 * available weapon tiers with costs relative to the player's current weapon,
 * and handles the purchase transaction.
 */

import { random, format, prettyInt, dispLen } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type { WeaponStats, UiMode } from '../types';
import type Equipment from '../Equipment';
import type IO from '../io/IO';
import type Player from '../Player';
import type { Settings } from '../types';

interface PendingWeaponSale {
    weaponNum: number;
    weapon: WeaponStats;
    salePrice: number;
}

export class KingArthurs {
    private morechk: boolean;
    private pendingWeaponSale: PendingWeaponSale | null;

    constructor(
        private io: IO,
        private settings: Settings,
        private _equipment: Lazy<Equipment>,
        private _player: Lazy<Player>,
        private _uiMode: UiMode,
    ) {
        this.morechk = true;
        this.pendingWeaponSale = null;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get equipment(): Equipment { return this._equipment.value; }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    get player(): Player { return this._player.value; }

    // ── Shop operations ────────────────────────────────────────────────

    private restorePendingWeaponSale(): void {
        if (!this.pendingWeaponSale) {
            return;
        }

        this.player.weapon_num = this.pendingWeaponSale.weaponNum;
        this.player.weapon = this.pendingWeaponSale.weapon.name;
        this.player.gold -= this.pendingWeaponSale.salePrice;
        this.player.str += this.pendingWeaponSale.weapon.num;
        if (this.player.str > 32000) {
            this.player.str = 32000;
        }
        this.pendingWeaponSale = null;
    }

    private async maybeRestorePendingWeaponSale(): Promise<void> {
        if (this.settings.shop_restore_old_item_on_failed_upgrade !== true || !this.pendingWeaponSale) {
            return;
        }

        await this.io.sln();
        await this.io.lln('`2"`0On second thought, take your old weapon back before you hurt yourself out there.`2"');
        this.restorePendingWeaponSale();
    }

    private async displayWeapons(): Promise<void> {
        let i: number;
        let w: WeaponStats;
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
            w = this.equipment.getWeapon(i);
            l = w.name;
            p = prettyInt(w.price);
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

    private async sellWeapon(): Promise<void> {
        let price: number;

        await this.io.lln("`c`%King Arthurs Weapons");
        this.io.foreground(2);
        if (this.rip) await this.io.sln(this.io.divider(25));
        else await this.io.sln(this.io.divider());
        await this.io.sln();
        if (this.player.weapon_num === 0) {
            await this.io.lln('`2"`0What the...?!!`2" the stout man shouts. `2"`0You don\'t have a weapon to sell!`2"');
            await this.io.sln();
            await this.io.sln();
            await this.io.more();
            return;
        }
        const oldw = this.equipment.getWeapon(this.player.weapon_num);
        // Sell price = half base + random bonus from level^2 * charisma; guards Pascal 16-bit overflow
        const mult = this.player.level * this.player.cha * this.player.level;
        if (mult > 0 && mult < 65530) {
            price = parseInt(String(oldw.price / 2 + random(mult)), 10);
        } else {
            price = parseInt(String(oldw.price / 2 + random(65535)), 10);
        }
        if (price > oldw.price - price / 3) {
            price = oldw.price - parseInt(String(oldw.price / 3), 10);
        }
        await this.io.lln('`2"`0Hmmm I will buy your `%' + this.player.weapon + "`0 for `%" + prettyInt(price) + '`0, Agreed?`2"');
        const ich = await this.io.prompt(
            "   Sell it?  [`0N`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'sell_weapon_confirm',
            { defaultKey: 'N', echo: !this.rip && !this.modern, trailingBlank: false }
        );
        if (ich !== "Y") {
            await this.io.sln();
            await this.io.lln("`2\"`0You don't want to sell?!  Fine!  I don't want your stinken' weapon!`2\"");
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        await this.io.sln();
        await this.io.lln('`2"`0Great!`2" The fat man takes your weapon, and gives you the money.');
        if (this.settings.shop_buyback_enabled === true || this.settings.shop_restore_old_item_on_failed_upgrade === true) {
            this.pendingWeaponSale = {
                weaponNum: this.player.weapon_num,
                weapon: oldw,
                salePrice: price,
            };
        } else {
            this.pendingWeaponSale = null;
        }
        this.player.weapon_num = 0;
        const neww = this.equipment.getWeapon(this.player.weapon_num);
        this.player.weapon = neww.name;
        this.player.gold += price;
        this.io.events?.emitEconomy('sell', price, oldw.name);
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
            await this.io.lln("Wow, you have a lot of money!", 0);
        }
        this.player.str -= oldw.num;
        if (this.player.str < 5) {
            this.player.str = 5;
        }
        await this.io.moreNoMail();
    }

    // Minimum strength to wield: base 10 + sum of trainer str_gained up to (weapon tier - 2)
    private strNeeded(weap: number): number {
        let i: number;
        let ret = 10;

        if (!this.settings.shop_limit) {
            return 0;
        }
        if (weap < 3) {
            return 0;
        }
        for (i = 1; i < weap - 1 && i <= this.equipment.trainerCount; i += 1) {
            ret += this.equipment.getTrainer(i).str_gained;
        }
        return ret;
    }

    private async _processWeaponPurchase(n: number): Promise<void> {
        const oldw = this.equipment.getWeapon(this.player.weapon_num);
        const neww = this.equipment.getWeapon(n);
        const isBuyback = this.settings.shop_buyback_enabled === true
            && this.pendingWeaponSale !== null
            && this.pendingWeaponSale.weaponNum === n;
        const price = isBuyback && this.pendingWeaponSale ? this.pendingWeaponSale.salePrice : neww.price;
        const need = this.strNeeded(n);
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("King Arthurs Weapons");
        this.io.foreground(2);
        if (this.rip) await this.io.sln(this.io.divider(25));
        if (isBuyback) {
            await this.io.lln('  `2"`0I suppose I can let you buy back your old `%' + neww.name + "`0 for `%" + prettyInt(price) + ' `0gold.`2"');
        } else {
            await this.io.lln(
                '  `2"`0Hmmm I will sell you my FAVORITE `%' +
                    neww.name +
                    "`0 for `%" +
                    prettyInt(price) +
                    ' `0gold!`2"',
            );
        }
        if (this.settings.shop_buyback_enabled === true && this.pendingWeaponSale !== null) {
            await this.io.lln('`2Buyback available: `0' + this.pendingWeaponSale.weapon.name + ' `2for `%' + prettyInt(this.pendingWeaponSale.salePrice) + '`2 gold.');
        }
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2Note: It takes `%" + prettyInt(need) + " `2strength points to weild this weapon.");
        await this.io.lln("`2You currently have `%" + prettyInt(this.player.str - oldw.num) + " `2strength points.");
        const ich = await this.io.prompt(
            "  `2Buy it?  [`0N`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'buy_weapon_confirm',
            { defaultKey: 'N', echo: !this.rip && !this.modern, leadingBlank: true, trailingBlank: true }
        );
        if (ich === "N") {
            await this.io.lln('`2"`0Fine..You will come back...`2" the man grunts.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (!isBuyback && this.player.str < need) {
            await this.maybeRestorePendingWeaponSale();
            await this.io.sln();
            await this.io.lln("`2\"`0You silly fool! You aren't strong enough to carry that weapon!`2\"");
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (this.player.weapon_num > 0) {
            await this.io.sln();
            await this.io.lln("`2\"`0You fool!  You already have a weapon, and you can't carry two!`2\"  You realize he is right.");
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (this.player.gold < price) {
            await this.io.sln();
            await this.io.lln("`2\"`0You stupid fool!  You don't have that much gold! I knew you were up to no good the moment I saw you!`2\"");
            await this.maybeRestorePendingWeaponSale();
            await this.io.sln();
            await this.io.sln();
            // DIFF: This more wasn't here...
            await this.io.moreNoMail();
            return;
        }
        await this.io.sln();
        await this.io.lln('`2"`0Great!`2" The fat man takes your money, and gives you the weapon.');
        this.player.weapon_num = n;
        this.player.weapon = neww.name;
        this.player.gold -= price;
        this.player.str += neww.num;
        this.io.events?.emitEconomy('purchase', price, neww.name);
        if (this.player.str > 32000) {
            this.player.str = 32000;
        }
        this.pendingWeaponSale = null;
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async buyWeapon(): Promise<void> {
        this.io.sclrscr();
        if (!this.player.expert) {
            this.io.sclrscr();
            if (!this.rip) await this.io.showTxt("BUYWEP");
            await this.displayWeapons();
        }
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2(`0Gold: `%" + prettyInt(this.player.gold) + "`2)  (`00 to exit`2)");
        await this.io.lw("`0Number Of Weapon `2: `%", 2);
        // Emit item prompt for UI mode
        const weaponOpts = [];
        for (let wi = 1; wi < 16; wi++) {
            const w = this.equipment.getWeapon(wi);
            weaponOpts.push({ key: String(wi), label: `${w.name} (${prettyInt(w.price)} gold)` });
        }
        weaponOpts.push({ key: '0', label: 'Exit' });
        this.io.emitPrompt('buy_weapon', weaponOpts, 'string');
        const n = parseInt(await this.io.getstr({ len: 2, integer: true }), 10);
        if (!isNaN(n) && n > 0 && n < 16) {
            await this._processWeaponPurchase(n);
        }
    }

    async menu(): Promise<void> {
        if (!this.player.expert) {
            if (this.rip) await this.io.showRip("BUYWEP");
            else await this.io.showTxt("ARTHUR");
        }
    }

    async prompt(): Promise<void> {
        if (!this.rip && !this.modern) {
            await this.io.sln();
            await this.io.lln("`2Current weapon: `0" + this.player.weapon);
            await this.io.lln("`5King Arthur's Weapons `8(B,S,Y,R)  (? for menu)");
        }
        this.io.emitPrompt('king_arthurs_menu', [
            { key: 'B', label: 'Buy Weapon' },
            { key: 'S', label: 'Sell Weapon' },
            { key: 'Y', label: 'Your Stats' },
            { key: 'R', label: 'Return' },
        ]);
    }

    async run(): Promise<void> {
        let over = false;
        let ch: string;

        this.pendingWeaponSale = null;

        if (this.rip) {
            await this.io.showRip("ARTHUR");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        this.io.sclrscr();
        await this.menu();

        do {
            await this.prompt();
            ch = await this.io.commandPrompt();
            switch (ch) {
                case "L":
                    if (this.rip) await this.io.showRip("ARTHUR3");
                    else {
                        this.io.sclrscr();
                        await this.io.showTxt("BUYWEP");
                    }
                    await this.displayWeapons();
                    break;
                case "Y":
                    await this.io.showStats();
                    await this.menu();
                    break;
                case "S":
                    if (this.rip) await this.io.showRip("ARTHUR3");
                    await this.sellWeapon();
                    if (this.rip) await this.io.showRip("BUYWEP");
                    else if (this.modern) await this.menu();
                    break;
                case "B":
                    if (this.rip) await this.io.showRip("ARTHUR3");
                    await this.buyWeapon();
                    if (this.rip) await this.io.showRip("BUYWEP");
                    else if (this.modern) await this.menu();
                    break;
                case "R":
                case "Q":
                case "\r":
                    over = true;
                    break;
                // DIFF ' ' would cycle, but not call prompt()...
                case "?":
                    if (this.player.expert) {
                        if (this.rip) await this.io.showTxt("ARTHUR");
                        else await this.io.showTxt("ARTHUR");
                    }
                    await this.menu();
                    break;
            }
        } while (!over);

        this.pendingWeaponSale = null;
    }
}

export default KingArthurs;
