/**
 * Turgons - Turgon's Warrior Training location for LORD.
 *
 * Handles spending of the three fighter skill trees (Death Knight, Mystical,
 * Thief) earned through forest encounters. Displays current skill levels and
 * applies the associated stat bonuses when skills are upgraded.
 */

import { format, prettyInt, spacePad } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type Battle from '../Battle';
import type { TrainerStats, LoadedPlayerRecord, UiMode, Monster } from '../types';
import type DailyMaint from '../DailyMaint';
import type Equipment from '../Equipment';
import type IO from '../io/IO';
import type Log from '../Log';
import type Player from '../Player';

export class Turgons {
    private trainer: TrainerStats | null;
    private curlinenum: number;
    private morechk: boolean;

    constructor(
        private io: IO,
        private _equipment: Lazy<Equipment>,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _battle: Lazy<Battle>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _uiMode: UiMode,
    ) {
        this.trainer = null;
        this.curlinenum = 1;
        this.morechk = true;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get equipment(): Equipment { return this._equipment.value; }

    get player(): Player { return this._player.value; }

    get log(): Log { return this._log.value; }
    get battle(): Battle { return this._battle.value; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }

    /** Return trainer reference, throwing if not yet loaded via prompt(). */
    private get requireTrainer(): TrainerStats {
        if (!this.trainer) throw new Error('Turgons.trainer accessed before prompt() was called');
        return this.trainer;
    }

    // ── Training operations ────────────────────────────────────────────

    private async ask(): Promise<void> {
        const mc = this.morechk;

        if (this.rip) await this.io.showRip("W1");
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln("`%Questioning Your Master`2");
        await this.io.sln(this.io.divider());
        this.io.foreground(10);
        this.morechk = false;
        await this.io.showTxt("LEVEL" + this.player.level + (this.player.sex === "M" ? "MALE" : "FEMALE"), true);
        await this.io.sln();
        if (this.player.exp > this.requireTrainer.need) {
            await this.io.lln("`0" + this.requireTrainer.name + " `2looks at your carefully and says: ");
            await this.io.sln();
            if (this.requireTrainer.needstr1 !== "") {
                await this.io.lln('`2"`0' + this.requireTrainer.needstr1.replace(/&PWE/i, this.player.weapon) + '`2"');
            }
            if (this.requireTrainer.needstr2 !== "") {
                await this.io.lln('`2"`0' + this.requireTrainer.needstr2 + '`2"');
            }
        } else {
            await this.io.sln();
            await this.io.lln("`0" + this.requireTrainer.name + "`2 looks at you carefully.");
            await this.io.sln();
            await this.io.lln('`2"`0You need about `%' + prettyInt(this.requireTrainer.need - this.player.exp) + "`0 more experience before you will be as good as I am.`2\"");
        }
        await this.io.sln();
        this.morechk = mc;
        await this.io.more();
    }

    private rankKing(): string {
        let i: number;
        const pl: LoadedPlayerRecord[] = [];
        const lines: string[] = [];

        this.player.allPlayers().forEach(function (op: LoadedPlayerRecord) {
            if (op.name !== "X" && op.drag_kills > 0) {
                pl.push(op);
            }
        });
        // Hero ranking: dragon kills first, then level, then experience as tiebreaker
        pl.sort(function (a: LoadedPlayerRecord, b: LoadedPlayerRecord) {
            if (a.drag_kills !== b.drag_kills) {
                return b.drag_kills - a.drag_kills;
            }
            if (a.level !== b.level) {
                return b.level - a.level;
            }
            return b.exp - a.exp;
        });
        lines.push("");
        lines.push("");
        lines.push("                           `%Heroes Of The Realm");
        lines.push("");
        lines.push("  `0Name                       Heroic Deeds Done         Current Level");
        lines.push(this.io.divider(0, '`2'));
        for (i = 0; i < pl.length; i += 1) {
            lines.push(
                "`0  " +
                    spacePad(pl[i].name, 22) +
                    "           `%" +
                    format("%3d", pl[i].drag_kills) +
                    "                       `0" +
                    format("%2d", pl[i].level),
            );
        }
        if (pl.length === 0) {
            lines.push("  `0Sad times indeed, there are no heroes in this realm.");
        }
        return lines.join('\n');
    }

    private async attackMaster(): Promise<void> {
        let son: string;
        let mline: string;

        if (this.rip) await this.io.showRip("TURGON2");
        else this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`%Fighting Your Master");
        this.io.foreground(2);
        if (this.rip) await this.io.sln(this.io.divider(33));
        else await this.io.sln(this.io.divider());
        this.io.foreground(10);
        if (this.player.seen_master) {
            son = this.player.sex === "M" ? "son" : "daughter";
            await this.io.sln('"I would like to battle again, but it is too late my ' + son + '."');
            await this.io.lln("`2" + this.requireTrainer.name + " tells you.  You figure you will try again tomorrow.");
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (this.player.exp < this.requireTrainer.need) {
            await this.io.sln("You are escorted down the hallway and into the battle arena.");
            await this.io.sln();
            this.io.foreground(10);
            await this.io.sln("THE BATTLE BEGINS!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`2You raise your `0" + this.player.weapon + " `2to strike!  You wonder why everyone is looking at you with grins on their faces...");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.sln("Your weapon is gone!  You are holding air!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.sln("Your Master is holding it!  The entire crowd is laughing at you!");
            await this.io.sln();
            await this.io.sln("You meekly accept the fact that you are not ready for your testing.");
            await this.io.sln();
            await this.io.moreNoMail();
            this.player.seen_master = true;
            return;
        }
        await this.io.lln("`2You enter the fighting arena, ready with your `0" + this.player.weapon + "`2.");
        await this.io.sln();
        await this.io.sln("When your name is called, you move to the proper position and take a fighting stance against your master.");
        this.player.seen_master = true;
        if (this.rip) {
            await this.io.sln();
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2**`%MASTER FIGHT`2**");
        await this.io.sln();
        await this.io.lln("You have encountered " + this.requireTrainer.name + "`2!!");
        await this.io.sln();
        // DIFF: Added this pause when the battle prompt would pause.
        if (this.curlinenum + this.battle.battlePromptLines() > this.io.rows - 1) {
            await this.io.moreNoMail();
        }
        const op = this.requireTrainer;
        if (op.gold === undefined) op.gold = 0;
        if (op.exp === undefined) op.exp = 0;
        // Emit combat encounter for the modern UI battle layout
        this.io.events?.emitCombatEncounter({
            name: op.name,
            hp: op.hp,
            str: op.str,
            weapon: op.weapon,
            image: op.image,
        });
        await this.battle.fight(op as unknown as Monster, false, false);
        if (this.player.dead) {
            this.player.dead = false;
            this.player.hp = this.player.hp_max;
            await this.io.sln();
            await this.io.lln("`0" + this.requireTrainer.name + " `2raises his " + this.requireTrainer.weapon + "`2 to kill you!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("At the last minute, he reaches down and helps you up.  He tells you not to be discouraged, and for good gesture has you healed before you go.");
            await this.io.sln();
            await this.io.more();
        } else if (this.requireTrainer.hp < 1) {
            this.player.dead = false;
            await this.io.sln();
            await this.io.lln("`%You have bested " + this.requireTrainer.name + "`%!");
            await this.io.sln();
            await this.io.lln("`%" + this.requireTrainer.swear);
            await this.io.sln();
            this.player.hp_max += this.requireTrainer.hp_gained;
            this.player.hp = this.player.hp_max;
            this.player.str += this.requireTrainer.str_gained;
            this.player.def += this.requireTrainer.def;
            this.player.level += 1;
            await this.io.lln("`2  You receive `0" + prettyInt(this.requireTrainer.hp_gained) + "`2 hitpoints, `0" + prettyInt(this.requireTrainer.str_gained) + "`2 strength and `0" + prettyInt(this.requireTrainer.def) + "`2 defense points!", 0);
            await this.io.sln();
            await this.io.lln("`%YOU ARE NOW LEVEL " + prettyInt(this.player.level) + ".");
            this.io.events?.emitPlayer('level_up', { level: this.player.level, trainer: this.requireTrainer.name });
            await this.io.sln();
            mline = "`0" + this.player.name + " `2has beaten `%" + this.requireTrainer.name + "!";
            if (this.player.level === 12) {
                mline += "\n";
                if (this.player.sex === "M") {
                    mline += "He ";
                } else {
                    mline += "She ";
                }
                mline += "has become the Ultimate Warrior!";
            }
            await this.log.logLine(mline);
            await this.player.raiseClass();
            this.player.seen_master = false;
            await this.dailyMaint.tournamentCheck();
        }
        this.io.events?.emitCombatEnd('victory');
    }

    async menu(): Promise<void> {
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("TURGON");
        else await this.io.showTxt("TURGON");
    }

    async prompt(): Promise<boolean> {
        if (this.player.level < 12) {
            this.trainer = this.equipment.getTrainer(this.player.level);
        } else {
            this.trainer = this.equipment.getTrainer(11);
        }
        await this.io.lln("`3`2Your master is `%" + this.trainer.name + "`2.");
        await this.io.sln();
        await this.io.lln("`5Turgon's Warrior Training`2");

        if (this.player.level > 11) {
            await this.io.sln();
            await this.io.lln("You pay your respects to Turgon, and stroll around the grounds.  Lesser warriors bow low as you pass.  Turgon's last words advise you to find and kill the `4Red Dragon`2..");
            await this.io.sln();
            await this.io.more();
            return true;
        }
        if (!this.rip && !this.modern) await this.io.lln("`2(Q,A,V,R)  (`0? for menu`2)");
        this.io.emitPrompt('turgons_menu', [
            { key: 'Q', label: 'Question Master' },
            { key: 'A', label: 'Attack Master' },
            { key: 'V', label: 'View Heroes' },
            { key: 'R', label: 'Return' },
        ]);
        return false;
    }

    async run(): Promise<void> {
        let ch: string;

        await this.menu();
        do {
            if (await this.prompt()) {
                return;
            }

            ch = await this.io.commandPrompt();
            switch (ch) {
                case "Q":
                    await this.ask();
                    if (this.rip) await this.menu();
                    break;
                case "R":
                case "\r":
                    break;
                case "A":
                    await this.attackMaster();
                    if (this.rip) await this.menu();
                    break;
                case "?":
                    await this.menu();
                    break;
                // DIFF: Removed space which just skipped prompt.
                case "V":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.showBuffer(this.rankKing(), false, false);
                    await this.io.sln();
                    await this.io.moreNoMail();
                    if (this.rip) await this.menu();
                    this.io.foreground(2);
                    break;
            }
        } while ("R\r".indexOf(ch) === -1);
    }
}

export default Turgons;
