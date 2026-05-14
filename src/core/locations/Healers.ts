/**
 * Healers - The Healer's Hut location for LORD.
 *
 * Lets players purchase HP restoration. The cost scales with the amount of
 * health needed and the player's current gold. Supports full heal, partial
 * heal, and the free inn recovery path.
 */
import { prettyInt } from '@lordts/util/Util';
import type IO from '../io/IO';
import type Player from '../Player';
import type { UiMode } from '../types';

export class Healers {
    constructor(
        private io: IO,
        private player: Player,
        private _uiMode: UiMode,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    // ── Healer operations ────────────────────────────────────────────

    private async healAll(): Promise<boolean> {
        let afford: number;
        let need: number;
        let ret = false;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        if (!this.rip) {
            await this.io.lln("`%Healers`#");
            await this.io.sln(this.io.divider());
        }
        this.io.foreground(2);
        await this.io.sln();
        // DIFF: was just =
        if (this.player.hp >= this.player.hp_max) {
            await this.io.lln('`0"You look fine to us!"');
        } else {
            // Healing costs 5 * level gold per HP; afford = max HP the player can pay for
            afford = parseInt(String(this.player.gold / 5 / this.player.level), 10);
            need = this.player.hp_max - this.player.hp;
            // DIFF: Was >, not >=
            if (this.player.gold >= need * 5 * this.player.level) {
                this.player.hp += need;
                await this.io.lln("`0" + prettyInt(need) + "`2 hit points are healed and you feel much better.");
                this.player.gold -= need * 5 * this.player.level;
                this.io.events?.emitPlayer('healed', { hp: need,  cost: (afford * 5 * this.player.level)});
                this.io.events?.emitEconomy('gold_lost', need * 5 * this.player.level, 'healing');
                ret = true;
            } else if (afford < need) {
                this.player.hp += afford;
                await this.io.lln("`0" + prettyInt(afford) + "`2 hit points are healed and you feel much better.");
                this.player.gold -= afford * 5 * this.player.level;
                this.io.events?.emitPlayer('healed', { hp: afford,  cost: (afford * 5 * this.player.level)});
                this.io.events?.emitEconomy('gold_lost', afford * 5 * this.player.level, 'healing');
            }
        }
        await this.io.sln();
        await this.io.more();
        return ret;
    }

    private async healSome(): Promise<void> {
        let amt: number;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        if (this.rip) {
            await this.io.lln("`%Healers`#");
            await this.io.lln(this.io.divider(), 0);
        }
        await this.io.sln();
        await this.io.lw("`2HitPoints: (`0" + prettyInt(this.player.hp) + " `2of `0" + prettyInt(this.player.hp_max) + "`2)", 2);
        await this.io.lln("`2Gold: `0" + prettyInt(this.player.gold));
        await this.io.lln("`2(it costs `%" + prettyInt(5 * this.player.level) + " `2to heal 1 hitpoint)");
        await this.io.sln();
        await this.io.sln('"How many hit points would you like healed?"');
        await this.io.lw("`0AMOUNT : `%", 2);
        this.io.emitPrompt('heal_amount', [], 'number');
        amt = parseInt(await this.io.getstr({ len: 5, integer: true }), 10);
        if (isNaN(amt)) {
            amt = 0;
        }
        await this.io.sln();
        if (amt === 0) {
            await this.io.sln('"Maybe some other time.."');
        } else if (amt < 0) {
            await this.io.sln('"Uh...Wouldn\'t that be hurting yourself?!"');
        } else {
            if (amt * (5 * this.player.level) > this.player.gold) {
                await this.io.sln("\"I'm afraid you don't have enough gold to cover that.\"");
            } else if (amt > this.player.hp_max - this.player.hp) {
                await this.io.sln('"It would be deadly to over heal yourself!!"');
            } else {
                await this.io.sln("Done!");
                this.player.gold = this.player.gold - amt * 5 * this.player.level;
                this.player.hp += amt;
                this.io.events?.emitPlayer('healed', { hp: amt,  cost: (amt * 5 * this.player.level)});
                this.io.events?.emitEconomy('gold_lost', amt * 5 * this.player.level, 'healing');
            }
        }
    }

    async menu(): Promise<boolean> {
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("HEAL");
        else await this.io.showTxt("HEAL");
        // DIFF: Was just ===
        if (this.player.hp >= this.player.hp_max) {
            if (this.rip) {
                await this.io.lln('`4`0"You look fine to us!"`2 the healers tell you.');
            } else {
                await this.io.sln();
                await this.io.sln();
                this.io.foreground(15);
                await this.io.lln("`%Healers`#");
                await this.io.sln(this.io.divider());
                await this.io.lln('`4`0"You look fine to us!"`2 the healers tell you.');
            }
            await this.io.sln();
            await this.io.more();
            return true;
        }
        return false;
    }

    async run(): Promise<void> {
        let ch: string;

        if (this.player.hp < 0) {
            this.player.hp = 1;
        }

        if (await this.menu()) {
            return;
        }

        do {
            await this.io.sln();
            await this.io.lln("`3`2HitPoints: (`0" + prettyInt(this.player.hp) + " `2of`0 " + prettyInt(this.player.hp_max) + "`2)");
            if (this.rip) await this.io.sln();
            await this.io.lln("`2Gold: `0" + prettyInt(this.player.gold));
            await this.io.lln("`2(it costs `%" + prettyInt(5 * this.player.level) + "`2 to heal 1 hitpoint)");
            await this.io.sln();
            if (!this.rip && !this.modern) await this.io.lln("`5The Healers`2   (H,C,R)  (`0? for menu`2)");
            ch = await this.io.commandPrompt('healers_menu', [
                { key: 'H', label: 'Heal All' },
                { key: 'C', label: 'Heal Some' },
                { key: 'R', label: 'Return' },
            ]);
            switch (ch) {
                case "1":
                    await this.io.sln();
                    await this.io.sln("I wonder what's cooking..");
                    await this.io.sln();
                    break;
                case "2":
                    await this.io.sln();
                    await this.io.sln("Eye am not sure what you're looking at.");
                    await this.io.sln();
                    break;
                case "3":
                    await this.io.sln();
                    await this.io.sln("Used to be a patient..  Hmmm.");
                    await this.io.sln();
                    break;
                case "C":
                    await this.healSome();
                    break;
                case "?":
                    if (await this.menu()) {
                        return;
                    }
                    break;
                case "H":
                    if (await this.healAll()) {
                        return;
                    }
                    break;
                // DIFF: space used to continue without show HitPoints etc...
            }
        } while ("RQ\r".indexOf(ch) === -1);
    }
}

export default Healers;
