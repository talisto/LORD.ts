/**
 * Battle - Combat engine for LORD.
 *
 * Implements all combat mechanics: monster selection and stat scaling,
 * player and enemy attacks, power moves, special skills (Death Knight,
 * Mystical, Thief), online PvP battles, and the dragon fight. Behavioral
 * parity with LORD 4.08 is preserved except where explicitly noted with
 * DIFF comments.
 */

import { random, prettyInt, cleanStr } from '@lordts/util/Util';
import type FileUtils from '@lordts/util/FileUtils';
import { File } from '@lordts/util/FileUtils';
import { resolveDeathKnightDamageMultiplier } from '@lordts/util/Settings';
import type { WeaponStats, Dragon, UiMode, MonsterStats } from './types';
import type DailyMaint from './DailyMaint';
import type Equipment from './Equipment';
import type IGM from '@lordts/igm/IGM';
import type IO from './io/IO';
import type Log from './Log';
import type Mail from './Mail';
import type OnlineBattle from './OnlineBattle';
import type Player from './Player';
import type Rankings from './Rankings';
import type { Settings, PlayerRecord, LoadedPlayerRecord, Monster } from './types';
import type State from './State';
import { Lazy } from '@lordts/util/Lazy';
import { BankTransferAmountPolicy } from './BankTransferAmountPolicy';
import { GameExitError } from './GameExitError';
import { recordWinner } from './WinnerHistory';
import { PlayerIpHistoryPolicy } from './PlayerIpHistoryPolicy';
import { PlayerRelationPolicy } from './PlayerRelationPolicy';
import { PvpLootPolicy } from './PvpLootPolicy';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';

class Battle {
    constructor(
        private io: IO,
        private fileUtils: FileUtils,
        private settings: Settings,
        private rankings: Rankings,
        private _uiMode: UiMode,
        private dragon: Dragon,
        private _battle: Lazy<Battle>,
        private _player: Lazy<Player>,
        private _state: Lazy<State>,
        private _log: Lazy<Log>,
        private _mail: Lazy<Mail>,
        private _equipment: Lazy<Equipment>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _igm: Lazy<IGM>,
        private _onlineBattle: Lazy<OnlineBattle>,
        private _storage: Lazy<IStorage>,
        private _battleCoordinator: Lazy<IBattleCoordinator>,
        private monsterStats: MonsterStats[][],
    ) {}

    // ── UI mode accessors ────────────────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get lastrip(): string { return this._uiMode.lastScreen; }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get battle(): Battle {
        return this._battle.value;
    }

    get player(): Player {
        return this._player.value;
    }

    get state(): State {
        return this._state.value;
    }

    get log(): Log {
        return this._log.value;
    }

    get mail(): Mail {
        return this._mail.value;
    }

    get equipment(): Equipment {
        return this._equipment.value;
    }

    get dailyMaint(): DailyMaint {
        return this._dailyMaint.value;
    }

    get igm(): IGM {
        return this._igm.value;
    }

    get onlineBattle(): OnlineBattle {
        return this._onlineBattle.value;
    }

    get storage(): IStorage {
        return this._storage.value;
    }

    get battleCoordinator(): IBattleCoordinator {
        return this._battleCoordinator.value;
    }

    // ── Stat utilities ───────────────────────────────────────────────────

    /** Scale an attack value by the configured Death Knight damage multiplier. */
    private scaleDeathKnightAttack(atk: number): number {
        return Math.floor(atk * resolveDeathKnightDamageMultiplier(this.settings));
    }

    /**
     * Optionally inflate a monster's HP and strength based on how many dragons
     * the player has killed. Only active when the `beef_up` setting is enabled.
     * Dragon kill count is capped at 5 to prevent runaway scaling.
     */
    beefUp(m: Monster): void {
        let drk: number;
        let max: number;
        let adj: number;

        if (this.settings.beef_up) {
            if (this.player.drag_kills > 0 && random(5) < 2) {
                if (this.player.drag_kills < 6) {
                    drk = this.player.drag_kills;
                } else {
                    // Cap at 5 to bound the scaling formula
                    drk = 5;
                }
                max = 2000000000 - m.hp;
                adj = random((drk * (random(10) + random(10)) * m.hp) / 100);
                if (adj < max) {
                    m.hp += adj;
                }
                max = 2000000000 - m.str;
                adj = random((drk * (random(10) + random(10)) * m.str) / 100);
                if (adj < max) {
                    m.str += adj;
                }
            }
        }
    }

    /** Add HP to the player's max HP, capped at the LORD engine maximum of 32000. */
    addHp(num: number): void {
        this.player.hp_max += num;
        if (this.player.hp_max > 32000) {
            this.player.hp_max = 32000;
        }
    }

    /** Add to the player's strength, capped at the LORD engine maximum of 32000. */
    addStr(num: number): void {
        this.player.str += num;
        if (this.player.str > 32000) {
            this.player.str = 32000;
        }
    }

    /** Add to the player's defense, capped at the LORD engine maximum of 32000. */
    addDef(num: number): void {
        this.player.def += num;
        if (this.player.def > 32000) {
            this.player.def = 32000;
        }
    }

    // ── Combat round mechanics ───────────────────────────────────────────

    async enemyAttack(op: Monster, pfight: boolean = false): Promise<void> {
        let atk: number;
        let his: string;

        // Damage formula: random half + fixed half gives range [str/2, str]
        atk = random(op.str / 2) + parseInt(String(op.str / 2), 10);
        if (op.is_dragon !== undefined && op.is_dragon) {
            switch (random(4)) {
                case 0:
                    op.weapon = "Huge Claw";
                    break;
                case 1:
                    op.weapon = "Swishing Tail";
                    break;
                case 2:
                    op.weapon = "`4Flaming Breath";
                    atk += atk;
                    break;
                case 3:
                    op.weapon = "Stomping The Ground";
                    break;
            }
        }
        // ~3.3% chance of enemy power move (1 in 30); adds 50% bonus damage.
        // Forest monsters can have power moves disabled via settings.
        const enemyPowerMoveRoll = random(30);
        if (!(op.is_forest && this.settings.forest_monster_power_moves === false) && enemyPowerMoveRoll === 1) {
            atk += parseInt(String(atk / 2), 10);
            await this.io.lln("`4** `0" + op.name + "`4 Executes A Power Move **");
            await this.io.sln();
        }
        atk = atk - this.player.def;
        if (atk < 1) {
            await this.io.lln("`%** `0" + op.name + "`2 misses you Completely! `%**");
            return;
        }
        // Children (from romance) can intervene: probability scales with kid
        // count above 5 (e.g. 10 kids = ~5% chance). The child deals half the
        // enemy's HP as damage but dies in the process.
        if (!(await this._handleChildIntervention(op))) {
            if (pfight) {
                his = op.sex === "M" ? "his" : "her";
                await this.io.lw("`4** `0" + op.name + " `2hits with " + his + " `0" + op.weapon + " `2for ", 2);
            } else {
                await this.io.lw("`4** `0" + op.name + " `2hits with its `0" + op.weapon + " `2for ", 2);
            }
            if (this.player.light_shield !== undefined && this.player.light_shield) {
                atk = parseInt(String(atk / 2), 10);
            }
            this.player.hp -= atk;
            if (this.player.hp < 1) {
                this.player.dead = true;
            }
            this.io.events?.emitCombatAttack('enemy_attack', op.name, this.player.name, atk, this.player.hp);
            this.io.foreground(4);
            await this.io.lln(prettyInt(atk) + " `2damage! `4**");
            if (this.player.has_fairy !== undefined && this.player.has_fairy && this.player.dead) {
                await this._handleFairyRescue();
            }
        }
        // DIFF: You could horse-kill someone after you die...
        if (this.player.hp > 0 && this.player.horse && !pfight && random(25) === 10) {
            await this._handleHorseEvent(op);
        }
    }

    private async _handleChildIntervention(op: Monster): Promise<boolean> {
        if (this.player.kids <= 5 || random(100) + 1 >= this.player.kids - 5) {
            return false;
        }
        let son: string;
        let his: string;
        if (random(2) === 1) {
            son = "son";
            his = "him";
        } else {
            son = "duaghter";
            his = "her";
        }
        this.player.kids--;
        await this.io.lln("`0Your enemy is startled - someone is attacking him from behind!");
        // DIFF: Originally, this had an off-by-one where hold and hit were set the same...
        const tmp = parseInt(String(op.hp / 2), 10);
        op.hp -= tmp;
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln(
            "  `%** `2Your `0" +
                son +
                "`2 hits " +
                op.name +
                " `2for `4" +
                prettyInt(tmp) +
                " `2points of damage! `%**",
        );
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`0" + op.name + " `2points its `4" + op.weapon + " `2at " + his + "!");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`2You jump to intercept the blow - but you are too late.  Your child is struck down.  Your `0" + son + "`2 dies in your arms.");
        await this.io.sln();
        await this.io.moreNoMail();
        return true;
    }

    private async _handleFairyRescue(): Promise<void> {
        await this.io.sln();
        await this.io.lln("`%YOU FEEL A BUZZING IN YOUR POUCH!");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`2Knowing you are too weak to go on, you decide to release the fairy in your pocket.");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`0The tiny thing rises in the air - And blows you a kiss!");
        await this.io.sln();
        await this.io.lln("`%YOU FEEL MUCH BETTER!");
        await this.io.sln();
        await this.io.moreNoMail();
        this.player.has_fairy = false;
        this.player.dead = false;
        this.player.hp = this.player.hp_max;
    }

    private async _handleHorseEvent(op: Monster): Promise<void> {
        if (op.is_dragon !== undefined && op.is_dragon) {
            this.io.foreground(10);
            await this.io.sln();
            await this.io.sln("In an unexpected move, the Dragon makes a quick swipe towards you!", 0);
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.sln("Your horse moves its huge body to intercept the attack", 0);
            await this.io.sln();
            await this.io.sln("You're horse is killed by the Dragon's attack!", 0);
            // DIFF: Horse wasn't killed before...
            this.player.horse = false;
            const sacrificeDamage = this.settings.dragon_horse_sacrifice_damage ?? 0;
            if (sacrificeDamage > 0) {
                op.hp = Math.max(0, op.hp - sacrificeDamage);
            }
        } else {
            await this.io.sln();
            op.hp = 0;
            this.player.horse = false;
            await this.io.lln('`0"Prepare to die, fool!" `2' + op.name + " `2screams.");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`2He takes a `)Death Crystal`2 from his cloak and throws it at you!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`2Your horse moves its huge body to intercept the crystal.");
            await this.io.sln();
            await this.io.lln("`4YOUR HORSE IS VAPORIZED!");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`2Tears of anger flow down your cheeks.  Your valiant steed must be avenged.");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`%YOU PUMMEL `0" + op.name + " `%WITH BLOWS!");
            await this.io.sln();
            await this.io.lln("`2A few seconds later, your adversary is dead.");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`0You bury your horse in a small clearing.  The best friend you ever had.");
            await this.io.sln();
        }
    }

    // ── Battle UI ────────────────────────────────────────────────────────

    private async battlePrompt(op: Monster): Promise<void> {
        await this.io.sln();
        await this.io.lln("`2Your Hitpoints : `0" + prettyInt(this.player.hp));
        await this.io.lln("`2" + op.name + "`2's Hitpoints : `0" + prettyInt(op.hp));
        await this.io.sln();
        if (!this.rip && !this.modern) {
            await this.io.lln("`2(`5A`2)ttack");
            await this.io.lln("(`5S`2)tats");
            await this.io.lln("(`5R`2)un");
            if (this.player.fairy_lore !== undefined && this.player.fairy_lore) {
                await this.io.lln("`2(`5H`2)eal");
            }
        }
        if (!this.modern) {
            if (this.player.levelw > 0 || this.player.levelm > 0 || this.player.levelt > 0) {
                await this.io.sln();
            }
            if (this.player.levelw > 0) {
                await this.io.lln("`2(`0D`2)`0eath Knight Attack (`%" + this.player.levelw + "`0)");
            }
            if (this.player.levelm > 0) {
                await this.io.lln("`2(`0M`2)`0ystical Skills     (`%" + this.player.levelm + "`0)");
            }
            if (this.player.levelt > 0) {
                await this.io.lln("`2(`0T`2)`0hieving Skills     (`%" + this.player.levelt + "`0)");
            }
            await this.io.sln();
            await this.io.lw("`2Your command, `0" + this.player.name + "`2?  [`5A`2] : ", 2);
        }
        const promptOpts = [
            { key: 'A', label: 'Attack' },
            { key: 'S', label: 'Stats' },
            { key: 'R', label: 'Run' },
        ];
        if (this.player.fairy_lore !== undefined && this.player.fairy_lore) {
            promptOpts.push({ key: 'H', label: 'Heal' });
        }
        if (this.player.levelw > 0) promptOpts.push({ key: 'D', label: 'Death Knight Attack' });
        if (this.player.levelm > 0) promptOpts.push({ key: 'M', label: 'Mystical Skills' });
        if (this.player.levelt > 0) promptOpts.push({ key: 'T', label: 'Thieving Skills' });
        this.io.emitPrompt('battle', promptOpts);
    }

    // DIFF: This is new for the training...
    battlePromptLines(): number {
        let ret = 8;
        if (this.player.fairy_lore !== undefined && this.player.fairy_lore) {
            ret += 1;
        }
        if (this.player.levelw > 0 || this.player.levelm > 0 || this.player.levelt > 0) {
            ret += 1;
        }
        if (this.player.levelw > 0) {
            ret += 1;
        }
        if (this.player.levelm > 0) {
            ret += 1;
        }
        if (this.player.levelt > 0) {
            ret += 1;
        }
        return ret;
    }

    // ── Combat round resolution ──────────────────────────────────────────

    private async handleHit(atk: number, op: Monster, pfight: boolean): Promise<void> {
        await this.io.sln();
        this.io.foreground(2);
        if (pfight) {
            atk -= op.def || 0;
        }
        if (atk < 1) {
            atk = 1;
        }
        await this.io.lln("`2You hit `0" + op.name + "`2 for `0" + prettyInt(atk) + " `2damage!");
        op.hp -= atk;
        this.io.events?.emitCombatAttack('player_attack', this.player.name, op.name, atk, op.hp);
        if (atk > this.player.str && op.hp < 1) {
            await this.io.sln();
            // DIFF: This was unconditional in original...
            if (!pfight) {
                await this.io.lln("" + op.death);
            }
            // DIFF: In 4.07, this was random(2) so more gold never happened.
            // rand(1,3) is what's used in the PHP version, and what we use here.
            switch (random(3)) {
                case 0:
                    await this.io.sln();
                    await this.io.lln("`2You find a `%Gem`2!");
                    this.player.gem += 1;
                    break;
                case 1:
                    await this.io.sln();
                    await this.io.sln("You find more gold than expected!");
                    op.gold *= 2;
                    break;
            }
        }
        if (op.hp > 0) {
            await this.enemyAttack(op, pfight);
        }
    }

    private async doAttack(op: Monster, pfight: boolean = false): Promise<string> {
        let atk: number;
        let c: number;
        let ret = "";

        await this.io.sln();
        atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
        // Power move roll: base 10% chance (c > 9 on d10+1). Amulet adds +2,
        // raising it to 30% (c > 9 on d10+3). Power moves deal 3x damage.
        c = random(10) + 1;
        if (this.player.amulet) {
            c += 2;
        }
        if (pfight) {
            atk -= op.def || 0;
        }
        if (this.player.amulet && atk < 1) {
            atk = 1;
        }
        if (atk < 1) {
            await this.io.sln();
            await this.io.lw("`2You miss `0" + op.name + "`2 completely!", 2);
            await this.io.sln();
            await this.enemyAttack(op, pfight);
            return "";
        }
        if (c > 9) {
            atk *= 3;
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("**POWER MOVE**");
            if (pfight) {
                ret += "\n  `0" + this.player.name + " `2did a power move for `4" + prettyInt(atk) + " `2damage!";
            }
        }
        await this.io.sln();
        await this.io.lln("`2You hit `0" + op.name + "`2 for `0" + prettyInt(atk) + " `2damage!");
        op.hp -= atk;
        this.io.events?.emitCombatAttack('player_attack', this.player.name, op.name, atk, op.hp);
        if (atk > this.player.str && op.hp < 1) {
            await this.io.sln();
            if (!pfight) {
                await this.io.lln("" + op.death);
            }
            // DIFF: In 4.07, this was random(2) so more gold never happened.
            // rand(1,3) is what's used in the PHP version, and what we use here.
            switch (random(3)) {
                case 0:
                    await this.io.sln();
                    await this.io.lln("`2You find a `%Gem`2!");
                    this.player.gem += 1;
                    break;
                case 1:
                    await this.io.sln();
                    await this.io.sln("You find more gold than expected!");
                    op.gold *= 2;
                    break;
            }
        }
        if (op.hp > 0) {
            await this.enemyAttack(op, pfight);
        }
        return ret;
    }

    private async tryRunning(op: Monster, pfight: boolean, cantRun: boolean): Promise<string> {
        if (op.is_arena !== undefined && op.is_arena) {
            await this.io.lln("You cannot run from an Arena!!!  You came here to prove your worth, and that's what you are going to do.");
            await this.battlePrompt(op);
            return "";
        }

        if (cantRun || random(9) === 1) {
            await this.io.sln();
            await this.io.lln("`0" + op.name + " `2sees you!");
            await this.enemyAttack(op, pfight);
            return "";
        }

        this.player.ran_away = true;
        if (pfight) {
            await this.io.sln();
            await this.io.lln("`2You barely manage to escape!  `0" + op.name + "`2 laughs as you scurry away.");
            this.io.events?.emitCombatEnd('flee', op.name);
            return "\n  `0" + this.player.name + "`2 has run away like a scared rat!";
        }

        if (op.is_dragon !== undefined && op.is_dragon) {
            await this.io.sln();
            await this.io.lln("`2You barely flip out of the way, as the `4Dragon`2 breathes huge amounts of fire where you were a second ago!  You run towards the forest, screaming all the way!");
        }
        this.io.events?.emitCombatEnd('flee', op.name);
        return "";
    }

    // ── Special skill actions ────────────────────────────────────────────

    private async useDeathKnight(op: Monster, pfight: boolean): Promise<void> {
        let atk: number;

        await this.io.sln();
        await this.io.sln();
        // Honor system: special skills are blocked in PvP when attacking a
        // player of equal or lower level. Allowed only against higher levels.
        if (pfight && this.player.level >= (op.level ?? 0)) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }
        if (op.is_arena !== undefined && op.is_arena) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle against your teacher.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }
        if (pfight && this.player.level < (op.level ?? 0)) {
            await this.io.sln("In a situation like this, you need every advantage you can get.");
            await this.io.sln();
        }
        await this.io.lln("`%** ULTRA POWERFUL MOVE **");
        await this.io.sln();
        this.io.foreground(15);
        switch (random(7)) {
            case 0:
                await this.io.lln("In a swift move you have `0" + op.name + "`2 by the neck and begin to exert huge amounts of pressure.  You hear a sickening crack.");
                break;
            case 1:
                await this.io.lln("In a spectacular move, you drive your weapon up between `0" + op.name + "`2's legs.  You grin as your " + this.player.weapon + " crunches noisily.");
                break;
            case 2:
                await this.io.lln("Seeing an opening, you feel your tendons strain as you swing your " + this.player.weapon + ". `0" + op.name + "'s`2 left arm falls to the ground, a gout of blood pulsating at the stump.");
                break;
            case 3:
                await this.io.lln("You duck an uncontrolled swing, and retaliate by slicing a wide gash under `0" + op.name + "'s`2 belly.  You feel sick as steamy intestines slither out into a pile at your enemy's feet.");
                break;
            case 4:
                await this.io.lln("In a scream of rage, you brandish your " + this.player.weapon + " wildly.  The surprised `0" + op.name + "`2 misses a parry, and you are able to send your enemy's nose into the air with a smooth blow.");
                break;
            case 5:
                await this.io.lln("After exchanging blows & blocks for nearly a minute, `0" + op.name + "`2 gets too fancy, and as a result an attempt to jump a low swing results in the severing of your enemy's left leg.  His remaining leg slips in blood.");
                break;
            case 6:
                await this.io.lln("You swing your " + this.player.weapon + " as hard as you can, intending to drive it into the fiend's side.  Instead he ducks, and your blade slides right into the top part of his skull.  He stares at you in horror.  The creature's warm brain slides smoothly from the cloven skull and lands with a soft plop on your shoe.  You kick it away, disgusted.");
                break;
        }

        atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
        atk = this.scaleDeathKnightAttack(atk);
        await this.handleHit(atk, op, pfight);
        this.player.levelw -= 1;
    }

    private async useThiefSkill(op: Monster, pfight: boolean): Promise<void> {
        let atk: number;

        await this.io.sln();
        await this.io.sln();
        if (pfight && this.player.level >= (op.level ?? 0)) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }
        if (op.is_arena !== undefined && op.is_arena) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle against your teacher.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }
        if (pfight && this.player.level < (op.level ?? 0)) {
            await this.io.sln("In a situation like this, you need every advantage you can get.");
            await this.io.sln();
        }
        await this.io.lln("`%** ULTRA SNEAKY MOVE **");
        await this.io.sln();
        this.io.foreground(2);
        switch (random(7)) {
            case 0:
                await this.io.lln('You point behind your enemy, and yell "Whats that?!"  `0' + op.name + "`2 turns around stupidly, before the fool realizes its error, there are two daggers planted in its back.");
                break;
            case 1:
                await this.io.lln("You suddenly find `0" + op.name + "'s`2 right eye very unnatractive. In a smooth motion you slide a dagger from your boot into the air. End over end it flies, finding its mark.  Your enemy's right eye \"pops\".");
                break;
            case 2:
                await this.io.lln("A devious plan enters your mind.  You fall to the ground, clutching at your chest.  The dumbfounded `0" + op.name + "`2 drops his guard and leans over you.  You scream \"Surprise you hoochie fiend!\" and drive your " + this.player.weapon + " into his neck.  It's nice to be covered with someone else's blood for once.");
                break;
            case 3:
                await this.io.lln("You duck an uncontrolled swing, and retaliate by slicing a wide gash under `0" + op.name + "'s`2 belly.  You feel sick as steamy intestines slither out into a pile at your enemy's feet.");
                break;
            case 4:
                await this.io.lln("In a scream of rage, you brandish your " + this.player.weapon + " wildly.  The surprised `0" + op.name + "`2 misses a parry, and you are able to send your enemy's nose into the air with a smooth blow.");
                break;
            case 5:
                await this.io.lln("After exchanging blows & blocks for nearly a minute, `0" + op.name + "`2 gets too fancy, and as a result an attempt to jump a low swing results in the severing of your enemy's left leg.  His remaining leg slips in blood.");
                break;
            case 6:
                await this.io.lln("You swing your " + this.player.weapon + " as hard as you can, intending to drive it into the fiend's side.  Instead he ducks, and your blade slides right into the top part of his skull.  He stares at you in horror.  The creature's warm brain slides smoothly from the cloven skull and lands with a soft plop on your shoe.  You kick it away, disgusted.");
                break;
        }

        // Thief skill: flat 3x base damage, simpler than mystical formulas
        atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
        atk *= 3;
        await this.handleHit(atk, op, pfight);
        this.player.levelt -= 1;
    }

    private async _mysticalTooTired(): Promise<void> {
        this.io.foreground(10);
        await this.io.lln("Your face contorts in concentration.  You reach deep within yourself for the power, but gasp as you realize is just isn't there.  You need rest before your mind will be ready for this.");
        await this.io.sln();
        await this.io.more();
    }

    private async useMysticalSkill(op: Monster, pfight: boolean): Promise<void> {
        let atk: number;
        let ch: string;
        let valid: string;

        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`%** MYSTICAL SKILLS **");
        await this.io.sln();

        // Honor checks: print on the current fight screen and return early without
        // showing the MSKILL RIP screen.
        if (pfight && this.player.level >= (op.level ?? 0)) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }
        if (op.is_arena !== undefined && op.is_arena) {
            await this.io.lln("Your honor stops you from using the more unorthodox methods of battle against your teacher.");
            await this.io.sln();
            await this.battlePrompt(op);
            return;
        }

        // Save the current fight screen BEFORE showRip("MSKILL") changes lastrip,
        // then show MSKILL so sclrscr() clears the terminal before we write content.
        const prevRipScreen = this.lastrip;
        if (this.rip) await this.io.showRip("MSKILL");

        if (pfight && this.player.level < (op.level ?? 0)) {
            await this.io.sln("In a situation like this, you need every advantage you can get.");
            await this.io.sln();
        }
        await this.io.sln();
        this.io.foreground(2);
        switch (random(7)) {
            case 0:
                await this.io.lln("`2You quickly decide which mystical skill to use.");
                break;
            case 1:
                await this.io.lln("`2Your enemy gives you a chance to contemplate your next action.");
                break;
            case 2:
                await this.io.lln("`2You decide a little magic might change the outcome of this battle.");
                break;
            case 3:
                await this.io.lln("`2You struggle to keep your anger under control.");
                break;
            case 4:
                await this.io.lln("`2Your mind carefully goes over what you have learned.");
                break;
            case 5:
                await this.io.lln("`2You feel power dancing in your mind, maybe it's time to use it.");
                break;
            case 6:
                await this.io.lln("`0" + op.name + " `2looks dumbfounded as you sheathe your " + this.player.weapon + ".");
                break;
        }
        await this.io.sln();
        // Each mystical skill requires BOTH enough remaining uses (levelm)
        // AND enough permanent skill points (skillm) to unlock. The number
        // in parentheses is the use-point cost per cast.
        await this.io.lln("`5(`#P`5)inch Real Hard                 `5(`%1`5)");
        valid = "P";
        if (this.player.levelm > 3 && this.player.skillm > 3) {
            await this.io.lln("`5(`#D`5)isappear                       `5(`%4`5)");
            valid += "D";
        }
        if (this.player.levelm > 7 && this.player.skillm > 7) {
            await this.io.lln("`5(`#H`5)eat Wave                       `5(`%8`5)");
            valid += "H";
        }
        if (this.player.levelm > 11 && this.player.skillm > 11) {
            await this.io.lln("`5(`#L`5)ight Shield                    `5(`%12`5)");
            valid += "L";
        }
        if (this.player.levelm > 15 && this.player.skillm > 15) {
            await this.io.lln("`5(`#S`5)hatter                         `5(`%16`5)");
            valid += "S";
        }
        if (this.player.levelm > 19 && this.player.skillm > 19) {
            await this.io.lln("`5(`#M`5)ind Heal                       `5(`%20`5)");
            valid += "M";
        }
        await this.io.sln();

        await this.io.lw("`5You Have `%" + this.player.levelm + "`5 Use Points.  Choose.  [`#Nothing`5] : ", 2);
        // Build dynamic mystical skills options
        const skillOpts = [{ key: 'P', label: 'Pinch Real Hard' }];
        if (valid.indexOf('D') !== -1) skillOpts.push({ key: 'D', label: 'Disappear' });
        if (valid.indexOf('H') !== -1) skillOpts.push({ key: 'H', label: 'Heat Wave' });
        if (valid.indexOf('L') !== -1) skillOpts.push({ key: 'L', label: 'Light Shield' });
        if (valid.indexOf('S') !== -1) skillOpts.push({ key: 'S', label: 'Shatter' });
        if (valid.indexOf('M') !== -1) skillOpts.push({ key: 'M', label: 'Mind Heal' });
        skillOpts.push({ key: '\r', label: 'Nothing' });
        this.io.emitPrompt('mystical_skills', skillOpts);
        ch = (await this.io.getkey()).toUpperCase();
        if (valid.indexOf(ch) === -1) {
            ch = "Nothing";
        }
        if (!this.rip) await this.io.sln(ch, 0);
        // Restore fight screen using the screen that was active BEFORE MSKILL.
        // prevRipScreen is "FORFIGHT" on the first skill use, "FORUP" on
        // subsequent uses, or another screen if called from a different context.
        if (this.rip && prevRipScreen == "FORFIGHT") await this.io.showRip("FORUP");
        else if (this.rip) await this.io.showRip(prevRipScreen);
        if (ch === "P") {
            if (this.player.levelm < 1) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("`0You whisper the word.  You smile as `2" + op.name + "`0 screams out in pain.");
            atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
            // Pinch: 1.5x base damage (2x minus 25%). Costs 1 use point.
            atk = atk * 2 - parseInt(String((atk * 2) / 4), 10);
            await this.handleHit(atk, op, pfight);
            this.player.levelm -= 1;
            if (this.player.hp > 0 && op.hp > 0) {
                await this.battlePrompt(op);
            }
        }
        if (ch === "D") {
            if (this.player.levelm < 4) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("You imagine yourself being in a different part of the forest, and begin to concentrate.  The next instant you are standing in a cool glade, nowhere near your enemy.  You almost laugh remembering `2" + op.name + "'s`0 befuddled");
            this.player.levelm -= 4;
            this.player.ran_away = true;
        }
        if (ch === "H") {
            if (this.player.levelm < 8) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("`0Your face contorts in anger.  How DARE `2" + op.name + "`0 presume that IT can beat YOU?  The air in front of you begins to shimmer.  A few seconds later, the fiend is engulfed by flames.");
            this.player.levelm -= 8;
            atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
            // Heat Wave: 2.5x base damage (2x plus 25%). Costs 8 use points.
            atk = atk * 2 + parseInt(String((atk * 2) / 4), 10);
            await this.handleHit(atk, op, pfight);
        }
        if (ch === "L") {
            if (this.player.levelm < 12) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("`0You look into the clouds.  A beam of light covers your face.  You hear `2" + op.name + "`0 scream as the light expands to cover your whole body.  The beam disappears, but you are still glowing.");
            this.player.levelm -= 12;
            this.player.light_shield = true;
        }
        if (ch === "S") {
            if (this.player.levelm < 16) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("`0You visualize the bones in your enemy, then imagine them imploding. `2" + op.name + "`0 pierces the air with a scream of horror that makes your blood run cold.  Even so, you feel no remorse.");
            this.player.levelm -= 16;
            atk = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
            // Shatter: 5x base damage (4x plus 25%). Costs 16 use points.
            atk = atk * 4 + parseInt(String((atk * 4) / 4), 10);
            await this.handleHit(atk, op, pfight);
        }
        if (ch === "M") {
            if (this.player.levelm < 20) {
                await this._mysticalTooTired();
                return;
            }
            await this.io.lln("`0You look down at your bloody body.  This will never do.  With an inhuman scream, you will yourself to be healed.  `2" + op.name + "`0 gasps as missing pieces of your flesh crawl back into place.");
            await this.io.sln();
            await this.io.lln("`%YOU ARE HEALED.`2");
            this.player.levelm -= 20;
            this.player.hp = this.player.hp_max;
        }
    }

    // ── Main combat loop ─────────────────────────────────────────────────

    async fight(op: Monster, pfight: boolean = false, cantRun: boolean = false): Promise<string> {
        let tmp: number;
        let ch: string;
        let mail = "";

        // Initiative roll: 10% base chance of being surprised (>90 on d99+1).
        // In PvP against a higher-level opponent, any roll above 60 is forced
        // to 95, raising surprise chance from ~10% to ~40%.
        tmp = random(99) + 1;
        if (pfight) {
            if ((op.level ?? 0) > this.player.level) {
                if (tmp > 60) {
                    tmp = 95;
                }
            }
        }

        if (tmp > 90) {
            await this.io.lln("`0" + op.name + " `2surprises you.");
            await this.enemyAttack(op, pfight);
        } else {
            await this.io.sln("Your skill allows you to get the first strike.");
        }

        this.player.ran_away = false;
        while (true) {
            if (!this.player.dead && this.player.hp > 0) {
                await this.battlePrompt(op);
            }
            if (this.player.dead) {
                break;
            }
            if (this.player.hp < 1) {
                break;
            }
            // NOTE: This prompt is being left non-normalized...
            ch = (await this.io.getkey()).toUpperCase();
            if (ch === "\r") {
                ch = "A";
            }
            if (!this.rip && !this.modern) this.io.sw(ch);
            switch (ch) {
                case "Q":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("You are in combat!  Try running.");
                    await this.io.sln();
                    break;
                case "A":
                    mail += await this.doAttack(op, pfight);
                    break;
                case "R":
                    mail += await this.tryRunning(op, pfight, cantRun);
                    break;
                case "S":
                    await this.io.showStats();
                    break;
                case "L":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("What?!  You want to fight two at once?");
                    await this.io.sln();
                    break;
                case "D":
                    if (this.player.levelw < 1) {
                        await this.io.sln();
                        await this.io.sln();
                        if (this.player.skillw < 1) {
                            await this.io.sln("You don't know any at the moment!");
                        } else {
                            await this.io.sln("You will need rest before you can use those again.");
                        }
                        await this.io.sln();
                    } else {
                        await this.useDeathKnight(op, pfight);
                    }
                    break;
                case "T":
                    if (this.player.levelt < 1) {
                        await this.io.sln();
                        await this.io.sln();
                        if (this.player.skillt < 1) {
                            await this.io.sln("You don't know any at the moment!");
                        } else {
                            await this.io.sln("You will need rest before you can use those again.");
                        }
                        await this.io.sln();
                    } else {
                        await this.useThiefSkill(op, pfight);
                    }
                    break;
                case "M":
                    if (this.player.levelm < 1) {
                        await this.io.sln();
                        await this.io.sln();
                        if (this.player.skillm < 1) {
                            await this.io.sln("You don't know any at the moment!");
                        } else {
                            await this.io.sln("You will need rest before you can use those again.");
                        }
                        await this.io.sln();
                    } else {
                        await this.useMysticalSkill(op, pfight);
                    }
                    break;
                case "H":
                    await this.io.sln();
                    await this.io.sln();
                    if (this.player.fairy_lore === undefined || !this.player.fairy_lore) {
                        await this.io.sln("You are in combat, and they don't make house calls!");
                    } else {
                        this.io.foreground(10);
                        await this.io.sln("Thanks to your fairy lore training today, you are able to heal yourself.");
                        ch = await this.io.prompt(
                            "  `2Do it? [`%Y`2] : `%",
                            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                            'fairy_heal_confirm',
                            { defaultKey: 'Y', leadingBlank: false, trailingBlank: false }
                        );
                        this.io.foreground(10);
                        if (ch === "Y") {
                            this.player.hp = this.player.hp_max;
                            this.player.fairy_lore = false;
                            await this.io.sln("Concentrating only on your wounds, they heal themselves!");
                        }
                    }
                    await this.io.sln();
                    break;
            }
            if (this.player.ran_away !== undefined && this.player.ran_away) {
                break;
            }
            if (this.player.dead) {
                break;
            }
            if (this.player.hp < 1) {
                break;
            }
            if (op.hp < 1) {
                break;
            }
        }

        this.player.ran_away = false;
        return mail;
    }

    // (No-op) kept previously but removed to avoid name conflict with the `battle` getter.

    // ── Death messages and taunts ────────────────────────────────────────

    private async customSaying(): Promise<string> {
        let ch: string;
        let ret: string;

        ch = await this.io.prompt(
            "  `2Say something to the press? [`0N`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'press_say',
            { defaultKey: 'N', leadingBlank: true, trailingBlank: false, echoStyle: 'char' }
        );
        if (ch === "N") {
            return "";
        }
        while (true) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`2Share your feelings now.. (Max 50 char!)", 1);
            await this.io.sln("Max", 45);
            await this.io.sln("^", 46);
            await this.io.lw('`0"`2', 2);
            this.io.emitPrompt('press_statement', [], 'line');
            ret = await this.io.getstr();
            ret = cleanStr(ret);
            if (ret.length > 50) {
                await this.io.sln();
                await this.io.lln("`2The press thinks you are boring and leaves!");
                await this.io.sln();
                await this.io.moreNoMail();
                return "";
            }
            if (ret.length < 5) {
                await this.io.sln();
                await this.io.lln("`2That just isn't interesting enough.  Sorry man.");
                await this.io.sln();
                await this.io.moreNoMail();
                return "";
            }
            ret = '`0"' + ret + '"`2 ';
            await this.io.sln();
            await this.io.lln("`2(`0H`2)appy");
            await this.io.lln("`2(`0S`2)ad");
            await this.io.lln("`2(`0M`2)oaning");
            await this.io.lln("`2(`0C`2)ursing");
            await this.io.lln("`2(`0E`2)ffing Mad");
            ch = await this.io.prompt(
                "  Your emotional state? `2[`0H`2] : `%",
                [
                    { key: 'H', label: 'Happy' },
                    { key: 'S', label: 'Sad' },
                    { key: 'M', label: 'Moaning' },
                    { key: 'C', label: 'Cursing' },
                    { key: 'E', label: 'Effing Mad' },
                ],
                'emotional_state',
                { defaultKey: 'H', leadingBlank: true, trailingBlank: false, echoStyle: 'char' }
            );
            switch (ch) {
                case "H":
                    ret += "laughs `%" + this.player.name + "`2.";
                    break;
                case "S":
                    ret += "`%" + this.player.name + "`2 declares sadly.";
                    break;
                case "M":
                    ret += "moans `%" + this.player.name + "`2.";
                    break;
                case "C":
                    ret += "curses `%" + this.player.name + "`2.";
                    break;
                case "E":
                    ret += "screams `%" + this.player.name + "`2 in anger.";
                    break;
            }
            await this.io.sln();
            await this.io.sln();
            await this.io.lln(ret);
            await this.io.sln();
            await this.io.sln();
            ch = await this.io.prompt(
                "  `2Does this look ok? [`0Y`2] :`% ",
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'saying_confirm',
                { defaultKey: 'Y', leadingBlank: false, trailingBlank: false }
            );
            if (ch !== "N") {
                await this.io.sln();
                await this.io.lln("Your comment has been noted.`2");
                return ret;
            }
        }
    }

    async say(fname: string, enemy: { name: string }, type: number, header: string, force: string = ""): Promise<void> {
        const f = new File(fname);
        let i: number;
        let c: number;

        if (force === "") {
            if (!f.open("r")) {
                throw new Error("Unable to open " + f.name);
            }
            // DAT file format: line 1 is header (ignored), line 2 is the
            // count of sayings. A random index selects by skipping 0..N-1 lines.
            // Template codes: `e = enemy name, `g = player name, `n = newline.
            f.readln();
            c = parseInt(f.readln() ?? '0', 10);
            c = random(c);
            for (i = 0; i < c; i += 1) {
                force = "`2" + f.readln();
            }
            f.close();
            force = force.replace(/`([neg])/g, (_ignore: string, c: string): string => {
                if (c === "n") {
                    return "\n";
                }
                switch (type) {
                    case 1:
                        if (c === "e") {
                            return "`0" + enemy.name + "`2";
                        }
                        if (c === "g") {
                            return "`5" + this.player.name + "`2";
                        }
                        break;
                    case 2:
                        if (c === "e") {
                            return "`5" + enemy.name + "`2";
                        }
                        if (c === "g") {
                            return "`0" + this.player.name + "`2";
                        }
                        break;
                    case 3:
                        if (c === "e") {
                            return "`0" + enemy.name + "`2";
                        }
                        if (c === "g") {
                            return "`5" + this.player.name + "`2";
                        }
                        break;
                }
                return "";
            });
        }
        await this.log.logLine(header + "\n" + force);
    }

    async badSay(enemy: { name: string }, header: string): Promise<void> {
        await this.say(this.fileUtils.runtimeOrData("BADSAY.DAT"), enemy, 3, header, await this.customSaying());
    }

    async goodSay(enemy: { name: string }, header: string): Promise<void> {
        await this.say(this.fileUtils.runtimeOrData("GOODSAY.DAT"), enemy, 2, header, await this.customSaying());
    }

    // ── Town PvP (attack another player) ────────────────────────────────

    async attackPlayer(op: LoadedPlayerRecord, inn: boolean): Promise<void> {
        let mail: string;

        if (this.player.pvp_fights < 1) {
            await this.io.sln();
            await this.io.sln("You are too tired to look for that warrior.  Try again tomorrow.");
            await this.io.sln();
            await this.io.more();
            return;
        }
        if (this.settings.player_blocking === true && PlayerRelationPolicy.isPlayerBlocked(this.storage, op.Record, this.player.Record)) {
            await this.io.sln();
            await this.io.sln('That warrior wants nothing to do with you.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (
            this.settings.shared_ip_block_pvp === true
            && PlayerIpHistoryPolicy.havePlayersSharedRecentIp(this.storage, this.player.time, this.player.Record, op.Record, this.settings)
        ) {
            await this.io.sln();
            await this.io.sln('That warrior recently shared your address.  The fight is refused.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        const pronoun = op.sex === "M" ? "his" : "her";
        const battleResult = this.battleCoordinator.startBattle(
            this.player.Record,
            op.Record,
            this.settings.prevent_pvp_target_if_already_in_battle === true,
        );
        switch (battleResult.kind) {
            case 'ok':
                break;
            case 'out':
                await this.io.sln();
                await this.io.sln("That warrior is currently visiting another section of the realm.");
                await this.io.lln("`2(" + op.name + " " + (battleResult.location ?? '') + "`2)");
                await this.io.moreNoMail();
                return;
            case 'online':
                await this.io.sln();
                await this.io.sln("That warrior is currently online!");
                await this.io.sln();
                await this.onlineBattle.onlineBattle(op);
                return;
            case 'dead':
                await this.io.sln();
                await this.io.sln("Your jaw drops as a shadowy figure finishes " + pronoun + " off!");
                await this.io.sln();
                await this.io.moreNoMail();
                return;
            case 'in-battle': {
                await this.io.sln();
                const newOp = this.player.playerGet(battleResult.attackerRecord);
                if (newOp) {
                    await this.io.lln("As you move forward, " + pronoun + " is attacked by `2" + newOp.name + "`2.");
                } else {
                    await this.io.lln("As you move forward, " + pronoun + " is attacked by someone.");
                }
                await this.io.sln("You fade back, vowing to return soon.");
                await this.io.sln();
                await this.io.moreNoMail();
                return;
            }
        }
        if (this.rip) await this.io.showRip("BATTLE");
        mail =
            " \n  `%YOU HAVE BEEN ATTACKED!\n`l\n  `0" +
            this.player.name +
            "`2 has attacked you!";
        this.player.pvp_fights -= 1;
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2** `%PLAYER FIGHT `2**");
        await this.io.sln();
        await this.io.lln("You have encountered " + op.name + "`2!!");
        await this.io.sln();
        const classNames = ['', 'warrior', 'magician', 'thief'];
        const playerImage = classNames[op.clss] ? `img/rpgui/player/${classNames[op.clss]}-${op.sex.toLowerCase()}-sm.png` : undefined;
        this.io.events?.emitCombatEncounter({ name: op.name, hp: op.hp, str: op.str, weapon: op.weapon, isPlayer: true, image: playerImage });
        if (op.hp < op.hp_max) {
            op.hp = op.hp_max;
        }
        mail += await this.fight(op as unknown as Monster, true, false);
        if (this.player.dead) {
            await this._handlePvpAttackerDied(op, mail);
            return;
        }

        if (op.hp < 1) {
            await this._handlePvpAttackerWon(op, inn, mail, pronoun);
        } else {
            this.battleCoordinator.battleAttackerFled(op.Record);
        }

        this.player.light_shield = false;
        if (this.rip)
            await this.io.showRip("WAR");
    }

    private async _handlePvpAttackerDied(op: LoadedPlayerRecord, mail: string): Promise<void> {
        await this.io.sln();
        this.player.gold = 0;
        this.player.exp -= parseInt(String(this.player.exp / 10), 10);
        mail +=
            "\n`.  `2You have killed `0" +
            this.player.name +
            " `2in self defense!\n`.  `2You receive `%" +
            prettyInt(this.player.exp / 2) +
            "`2 experience!";
        this.battleCoordinator.battleAttackerDefeated(op.Record, this.player.exp);
        await this.mail.mailTo(op.Record, mail);
        this.io.events?.emitCombatEnd('defeat', op.name);
        await this.io.deadScreen(op);
        await this.badSay(op, "`.`0" + op.name + " `2has killed `5" + this.player.name + " `2in self defence!");
        if (this.rip) {
            await this.io.showRip("EXIT");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        await this.io.sln();
    }

    private async _handlePvpAttackerWon(op: LoadedPlayerRecord, inn: boolean, mail: string, pronoun: string): Promise<void> {
        let tmp: number;
        let ch: string;
        let wep: WeaponStats;

        this.io.foreground(15);
        await this.io.sln();
        await this.io.lln("You have killed " + op.name + "`%!");
        await this.io.sln();
        this.io.foreground(2);
        const goldReward = PvpLootPolicy.resolveGoldReward(
            op.gold,
            this.player.level,
            this.monsterStats,
            this.settings,
        );
        tmp = this.player.gold;
        this.player.gold += goldReward;
        if (this.player.gold >= 2000000000) {
            this.player.gold = 2000000000;
        }
        const goldReceived = this.player.gold - (tmp);
        tmp = this.player.exp;
        this.player.exp += parseInt(String(op.exp / 2), 10);
        if (this.player.exp >= 2000000000) {
            this.player.exp = 2000000000;
        }
        await this.io.lln("You receive `%" + prettyInt(goldReceived) + " `2gold, and " + prettyInt(this.player.exp - (tmp)) + " experience!", 0);
        const gemReward = PvpLootPolicy.resolveGemReward(op.gem, this.settings);
        if (gemReward > 0) {
            tmp = this.player.gem;
            this.player.gem += gemReward;
            await this.io.sln();
            tmp = this.player.gem - (tmp);
            await this.io.lln("`2You also find `0" + prettyInt(tmp) + " `%" + (tmp === 1 ? "Gem" : "Gems") + "`2!");
        }
        if (this.player.def < 32000 - 3) {
            if (this.settings.def_for_pk) {
                await this.io.lw("`2You also gain `%3 `2defense points", 2);
                this.player.def += 3;
                if (this.player.str < 32000 - 2) {
                    // In 4.07, you don't actually get the str points!
                    await this.io.lw(", and you gain `%2 `2strength points");
                    if (this.settings.str_for_pk) {
                        this.player.str += 2;
                    }
                }
            }
            await this.io.sln();
        }
        if (!this.settings.def_for_pk && this.settings.str_for_pk) {
            if (this.player.str < 32000 - 2) {
                await this.io.lw("`2You also gain `%2 `2strength points", 2);
                this.player.str += 2;
            }
        }
        this.battleCoordinator.battleOpponentDefeated(op.Record);
        mail += "\n`.  `0" + this.player.name + " `2has killed you!";

        // Remote-game weapon loot is intentionally skipped (see comment in original lord.js).
        if (inn) {
            if (random(10) === 1) {
                if (this.player.level < op.level - 1) {
                    if (op.weapon_num > this.player.weapon_num) {
                        await this.io.sln();
                        await this.io.lln("`2Do you wish to trade your " + this.player.weapon + " `2for " + pronoun + " `%" + op.weapon + "`2? `0[N] : `%");
                        this.io.emitPrompt('weapon_trade', [
                            { key: 'Y', label: 'Yes' },
                            { key: 'N', label: 'No' },
                        ]);
                        ch = (await this.io.getkey()).toUpperCase();
                        if (ch !== "Y") {
                            ch = "N";
                        }
                        await this.io.sln(ch, 0);
                        if (ch === "Y") {
                            wep = this.equipment.getWeapon(op.weapon_num);
                            op.str -= wep.num;
                            this.player.str += wep.num;
                            wep = this.equipment.getWeapon(this.player.weapon_num);
                            op.str += wep.num;
                            this.player.str -= wep.num;
                            const tmpWeapon = op.weapon;
                            op.weapon = this.player.weapon;
                            this.player.weapon = tmpWeapon;
                            const tmpWeaponNum = op.weapon_num;
                            op.weapon_num = this.player.weapon_num;
                            this.player.weapon_num = tmpWeaponNum;
                            mail += "\n  `$" + this.player.name + " took your weapon!";
                            await this.io.lln("`2Done! You now have a " + this.player.weapon + "`2!");
                        }
                    }
                }
            }
        }
        await this.mail.mailTo(op.Record, mail);
        await this.io.sln();
        this.player.killedaplayer = true;
        if (this.player.pvp < 32000) {
            this.player.pvp += 1;
        }
        await this.goodSay(op, "`.`0" + this.player.name + " `2has killed `5" + op.name + "`2!");
        await this.dailyMaint.tournamentCheck();
    }

    // ── Dragon fight ─────────────────────────────────────────────────────

    private async _story(): Promise<void> {
        if (this.player.clss === 1) {
            await this.io.lln("`c`%EPILOGUE `2- `0The Warrior's Ending", 19);
            await this.io.lln(this.io.divider(0, '`0'), 0);
            await this.io.lln("`2After your bloody duel with the huge Dragon, your first inpulse is to rip its head off and bring it town.  Careful thought reveals it is much to big for your horse, so that plan is moot.  Your second notion is bring back the childrens bones.  Bags and bags of them for proper burial, but you realize this would only cause the town's inhabitants `0MORE`2 pain.  You finally decide on the Dragon's heart.  After adding ten years to your sword's life, you finally chip off enough scales to wallow in the huge beast's insides.");
            await this.io.sln();
            await this.io.lln("`2When you are finished, and fit the still heart in a gunny sack you brought, (who would have thought this would be its use?) you make your way back to town.  As you share your story to a crowd of excited onlookers, this crowd becomes a gathering, and this gathering becomes an assemblage, and this assemblage becomes a multitude!");
            await this.io.sln();
            await this.io.lln("`2This multitude nearly becomes a mob, but thinking quick, you make a speech.");
            await this.io.sln();
            await this.io.more();
            await this.io.lln('`0"PEOPLE!" `2your voice booms.  `0"It is true I have ridden this town of its curse, the `4Red Dragon`0.  And this is his heart."');
            await this.io.sln();
            await this.io.lln('`2You dump the bloody object onto the ground.  From the back, Barak\'s voice is heard.  `5"How do we know where you got that thing?  It looks like you skinned a sheep!"  `2A flicker of annoyance crosses your face, but you force a smile.  `0"Why Barak, would you doubt me?  A LEVEL 12 warrior?  If I am not mistaken, you are quite a bit lower, still at level two, eh?"');
            await this.io.sln();
            if (this.player.sex === "M") {
                await this.io.lln("`2Barak gives you no more trouble, and you are declared a hero by all. `#Violet `2tops off the evening by giving you a kiss on the cheek, and a whisper of things to come later that night makes even you almost blush.  Almost.");
            } else {
                await this.io.lln("`2Barak gives you no more trouble, and you are declared a hero by all. `%Seth `2tops off the evening by giving you a kiss on the cheek, and a whisper of things to come later that night makes even you almost blush.  Almost.");
            }
            await this.io.sln();
            await this.io.moreNoMail();
        }
        if (this.player.clss === 2) {
            await this.io.lln("`c`%EPILOGUE `2- `#The Mystical Skills User Ending", 12);
            await this.io.lln(this.io.divider(0, '`0'), 0);
            await this.io.lln('`2Still shaking from the battle, you decide it is time to return to town and share the good tidings.  You close your eyes and concentrate. `0"There is no place like Town"`2...A when you open your eyes, you are under a cow in a farm outside - Not far from Abduls Armour.  You trek the distance to the Armoury, cursing as you go.  Wizards were not made for this kind of hardship you tell yourself.');
            await this.io.sln();
            await this.io.lln("`2Miss Abdul is estatic when you tell her about your escapades.  She agrees to accompany you to the Inn.  She lends you a horse when you tell her of how your feet ache.  ");
            await this.io.sln();
            await this.io.lln("`2When you enter the smokey bar with a loud clatter, merry makers stop their carousing, people hunched over their meals stop chewing and Seth Able stops playing in mid-strum.");
            await this.io.sln();
            await this.io.more();
            await this.io.lln('`0"People!  I have slain the beast!"`2 you shout triumphantly. A voice is heard from the back. `0"What beast?  A large rat or something?"`2  You scowl.  It is Barak.  You nonchalantly make a gesture with one hand. A few moments later, Barak stands up suprised.  He looks wildly around, then makes a bolt for the door.');
            await this.io.sln();
            await this.io.lln('`0"What happened to him?" `2Miss Adbul asks you in puzzlement.');
            await this.io.sln();
            await this.io.lln('`0"Nature called." `2you smile.  Your face becomes serious as you address the bar.  `0"The `4Red Dragon`0 is no more."`2 `#Violet `2sets her serving tray down to hear better. `0"We cannot bring back those dead, but I have stopped this from happening again." ');
            await this.io.sln();
            await this.io.lln('`0"And he did it with Armour from Abduls Armour!"`2 Miss Abdul adds.');
            await this.io.sln();
            await this.io.lln('`0"Er, thank you.  Anyway, make sure you put something in the Daily happenings about this!"`2  The crowd gives you a standing ovation.');
            await this.io.sln();
            await this.io.more();
        }
        if (this.player.clss === 3) {
            await this.io.lln("`c`%EPILOGUE `2- `9The Thief's Ending", 22);
            await this.io.lln(this.io.divider(0, '`0'), 0);
            await this.io.lln("`2You breathe a sigh of relief, retrieve your daggers and carefully clean them.  Although you realized some may think it cold hearted if they ever found out, you pick through the childrens bones, picking up a gold piece here, a silver there.  Afterall, these children didn't need it to buy a meal anymore... They WERE a meal!  You smile at your own dry wit and realize you had better get to town and share the news.");
            await this.io.sln();
            await this.io.lln("The hike to town is long, but you are used to it, and rather enjoy the peace it brings.  You find the town deserted.  You enter the Inn, hoping to find some clue, but all you find is " + (this.player.sex === "M" ? "`#Violet`2" : "`%The Bard`2") + ".");
            if (this.player.sex === "M") {
                await this.io.sln();
                await this.io.lln('`0"Via, Where has everyone gone?  Have they finally given up hope of ever stopping the `4Red Dragon`0, and have gone to seek a new lifestyle?');
                await this.io.lln("");
                await this.io.lln("`2There is a pause, then she responds.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`0"No, they are having a feast at Turgons Place.  Naturally SOMEONE had to stay here, and OF COURSE it would be me...I never get to have any fun!"');
                await this.io.sln();
                await this.io.lln('`2You give her a wink.  `0"That just isn\'t so...Remember last night?"');
                await this.io.lln("`2She giggles, and after a few more naughty sayings you have her cheeks as deep a scarlet as a rose.");
            } else {
                await this.io.sln();
                await this.io.lln('`0"Seth, Where has everyone gone?  Have they finally given up hope of ever stopping the `4Red Dragon`0, and have gone to seek a new lifestyle?');
                await this.io.lln("");
                await this.io.lln("`2There is a pause, then he responds.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln("`0\"No, they are having a feast at Turgons Place.  I didn't feel like going to a party.  At least not by myself.  I'm just not the party type.\"");
                await this.io.sln();
                await this.io.lln('`2You give him a wink.  `0"That just isn\'t so...Remember last night?"');
                await this.io.lln("`2He laughs, and after a few more naughty sayings you have him ready to take a cold shower.  (But you do something else instead) ;> ");
            }
            await this.io.sln();
            await this.io.lln("`2When you finally meet up at Turgon's, you share your story.  You can't help but be pleased at seeing so many faces in awe over your doings, so you 'spice' up the story in a few places... As you are finishing, a woman in the back cries out.");
            await this.io.sln();
            await this.io.lln('`0"That Thief is wearing the ring I gave my Ellie the last birthday before she disappeared!"`2');
            await this.io.sln();
            await this.io.lln("You decide now would be the perfect time to make your departure.");
            await this.io.sln();
            await this.io.more();
            await this.io.sln();
            await this.io.more();
        }
    }

    private async _handleDragonDeath(): Promise<void> {
        this.player.hp = 0;
        this.player.dead = true;
        this.player.gold = 0;
        this.player.put();
        await this.io.sln();
        this.io.sclrscr();
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2The Dragon pauses to look at you, then snorts in a Dragon laugh, and delicately rips your head off, with the finesse only a Dragon well practiced in the art could do.  ");
        await this.io.sln();
        await this.log.logLine("`2The `4Red Dragon `2has killed `5" + this.player.name + "`2!");
        this.io.events?.emitPlayer('death', { killedBy: 'The Red Dragon' });
        await this.io.more();
    }

    private async _handleDragonVictory(): Promise<void> {
        await this.io.sln();
        await this.io.sln("You have defeated The Red Dragon!");
        await this.io.sln();
        await this.io.more();
        if (this.rip) {
            await this.io.showRip("3DRAGON");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            await this.io.showRip("W1");
        }
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        await this.io.sln("You have defeated the Dragon, and saved the town.  Your stomach churns at the site of stacks of clean white bones - Bones of small children.");
        await this.io.sln();
        await this.io.sln("THANKS TO YOU, THE HORROR HAS ENDED!");
        await this.io.sln();
        await this.log.logLine("`.`%" + this.player.name + " `2has slain the `4Red Dragon`2 and become a hero.");
        await this.io.more();
        await this._story();
        this.io.foreground(15);
        await this.io.sln("Thanks for being tough enough to win the game, ", 13);
        //sln('                 and thank your sysop for registering!');
        await this.io.sln();
        this.io.foreground(10);
        await this.io.sln("-Seth Able", 30);
        await this.io.sln();
        await this.io.more();
        // Dragon kill resets player to level 1 with starter stats but
        // preserves: special skills, charm, kids, drag_kills, horse,
        // pvp count, and fairy_lore. This incentivizes repeated kills.
        this.player.level = 1;
        this.player.hp_max = 20;
        this.player.hp = this.player.hp_max;
        this.player.weapon_num = 1;
        this.player.weapon = "Stick";
        this.player.gold = 500;
        this.player.bank = 0;
        this.player.def = 1;
        this.player.str = 10;
        this.player.gem = 10;
        this.player.arm = "Coat";
        this.player.arm_num = 1;
        this.player.dead = false;
        this.player.inn = false;
        this.player.exp = 10;
        if ((this.settings.forest_fights || 0) > 32000) {
            this.settings.forest_fights = 32000;
        }
        if ((this.settings.forest_fights || 0) + this.player.kids > 32000) {
            this.player.forest_fights = 32000;
        } else {
            this.player.forest_fights = (this.settings.forest_fights || 0) + this.player.kids;
        }
        this.player.pvp_fights = this.settings.pvp_fights_per_day;
        this.player.flirted = false;
        this.player.high_spirits = true;
        this.player.drag_kills += 1;
        if (this.settings.daily_bank_transfer_gold_cap_reset_on_dragon_kill === true) {
            BankTransferAmountPolicy.resetPlayerUsage(this.storage, this.player.time, this.player.Record);
        }
        this.player.put();
        this.storage.setLatestHero(this.player.name);
        await this.state.getState(true);
        this.state.latesthero = this.player.name;
        await this.dailyMaint.tournamentCheck();
        if ((this.settings.win_deeds || 0) > 0 && this.player.drag_kills >= (this.settings.win_deeds || 0)) {
            this.state.won_by = this.player.Record;
            recordWinner(this.storage, this.player, {
                winType: 'dragon',
                winStat: 'drag_kills',
                roundDays: this.state.days,
            });
            this.state.putState();
            await this.io.lln("`c`%** YOUR QUEST IS OVER **");
            await this.io.sln();
            await this.io.lln("`2You must indeed be the chosen one.  The ancient magic that kept the `4dragon `2alive is now truly no more.");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`0Now begone, blessed among warriors - Your fight is over.");
            this.player.on_now = false;
            this.player.put();
            throw new GameExitError();
        }
        this.state.putState();
        await this.io.lln("`c`%** YOUR QUEST IS NOT OVER **", 18);
        await this.io.sln();
        await this.io.lln("`2You are a hero.  Bards will sing of your deeds, but that doesn't mean your life doesn't go on.  ");
        await this.io.sln();
        await this.io.lln("`%YOUR CHARACTER WILL NOW BE RESET.  `2But you will keep a few things you have earned.  Like the following.");
        await this.io.sln();
        await this.io.lln("`%ALL SPECIAL SKILLS.");
        await this.io.lln("CHARM.");
        await this.io.lln("A FEW OTHER THINGS.");
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`c`%YOU FEEL STRANGE.");
        await this.io.sln();
        await this.io.lln("`2Apparently, you have been sleeping.  You dust yourself off, and regain your bearings.  You feel like a new person!");
        await this.io.sln();
        await this.io.more();
    }

    async fightDragon(cantRun: boolean): Promise<void> {

        const dragon = { ...this.dragon };
        this.player.seen_dragon = true;
        this.beefUp(dragon);
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`%**`4DRAGON ENCOUNTER`%**");
        await this.io.sln();
        await this.io.lln("`2The Red Dragon approaches.");
        await this.io.sln();
        if (this.rip) await this.io.showRip("FORFIGHT");
        await this.fight(dragon, false, cantRun);
        this.io.foreground(2);
        if (this.player.dead) {
            await this._handleDragonDeath();
        }
        if (dragon.hp < 1) {
            await this._handleDragonVictory();
        }
    }

    private _topKiller(): PlayerRecord {
        let ret = { pvp: -1 } as unknown as PlayerRecord;

        this.player.allPlayers().forEach(function (pl: LoadedPlayerRecord): void {
            if (pl.name !== "X" && pl.pvp > ret.pvp) {
                ret = pl;
            }
        });
        return ret;
    }

    private async _slaughterSearchPlayer(): Promise<boolean> {
        let ch: string;
        let enemy: LoadedPlayerRecord | null;
        let out: string[];
        let where: string | null;

        await this.io.sln("Who would you like to attack?");
        const atk = await this.player.findPlayer();
        if (atk === -1) {
            await this.io.sln("No warriors found.");
        } else if (atk === this.player.Record) {
            await this.io.sln("You wish to attack yourself?!!  You decide against it.");
        } else {
            enemy = this.player.playerGet(atk);
            if (!enemy) {
                await this.io.sln("Player not found.");
                return false;
            }
            const outLines = this.storage.getPlayerLocation(enemy.Record);
            out = outLines ?? [''];
            if (out[0].length > 0) {
                where = out[0];
                await this.io.sln();
                await this.io.sln("That warrior is currently visiting another section of the realm.");
                await this.io.lln("`2(" + enemy.name + " " + where + "`2)");
                await this.io.sln();
                await this.io.moreNoMail();
            } else if (enemy.dead) {
                await this.io.lln("`2You look for that warrior...And you find " + (enemy.sex === "M" ? "him..." : "her..."), 2);
                await this.io.sln("A rotting corpse...Looks like you were a little late..");
            } else if (enemy.inn) {
                await this.io.sln("You search the fields but do not find that warrior.");
                await this.io.lln("`2You conclude " + (enemy.sex === "F" ? "s" : "") + "he is staying at the Inn.", 2);
            } else {
                this.player.put();
                if (this.rip) {
                    await this.io.showRip("W5");
                    await this.io.lw("`1`2");
                }
                await this.io.lw("`2You hunt around for `0" + enemy.name + "`2...", 2);
                if (enemy.sex === "M") {
                    await this.io.lln("YOU FIND HIM!  He is brandishing a dangerous looking " + enemy.weapon + ".", 1);
                } else {
                    await this.io.lln("YOU FIND HER!  She is brandishing a dangerous looking " + enemy.weapon + ".", 1);
                }
                ch = await this.io.prompt(
                    "  `2Attack `5" + enemy.name + " `2[`0Y`2] : `%",
                    [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                    'attack_player_confirm',
                    { defaultKey: 'Y', leadingBlank: true, trailingBlank: false }
                );
                this.io.foreground(2);
                if (ch === "Y") {
                    await this.io.showRip("BATTLE");
                    await this.attackPlayer(enemy, false);
                }
                if (this.player.dead) {
                    return true;
                }
            }
        }
        return false;
    }

    private async _slaughterExamineDirt(): Promise<void> {
        await this.io.lln("`c`%** EXAMINING THE DIRT **", 25);
        await this.io.sln();
        const tk = this._topKiller();
        await this.io.lln("`2The town elders have named `0" + tk.name + " `2the most dangerous warrior in the realm with a whopping `%" + prettyInt(tk.pvp) + "`2 kills.");
        await this.io.sln();
        const dirtContent = this.storage.getConversation('dirt');
        if (dirtContent) {
            await this.io.showBuffer(dirtContent, false, false);
        } else {
            await this.io.lln("`2The dirt appears soft and malleable.");
        }
    }

    private async _slaughterWriteInDirt(): Promise<void> {
        let line: string;
        let lines: string[];

        await this.io.lln("`c`%** WRITING IN THE DIRT **", 25);
        await this.io.sln();
        if (!this.player.killedaplayer && this.player.name !== this.state.latesthero) {
            await this.io.lln("`2You are about to inscribe something, when you hear `0" + this.state.latesthero + "'`2s voice in your head!");
            await this.io.sln();
            await this.io.lln('`0"My son, you have not challenged and killed another warrior this day."');
            await this.io.sln();
            await this.io.lln("`2You lower your eyes in homage to your better.");
            await this.io.sln();
            await this.io.lln('`0"You may share wisdom when you have killed, and have it."');
            await this.io.lln("");
            await this.io.more();
        } else {
            if (this.player.name === this.state.latesthero) {
                await this.io.lln("`2The crowd parts in awe, as you approach the dirt patch.  You smile, maybe slaying that Dragon did more for your reputation than you know.");
                await this.io.sln();
            }
            await this.io.lln("`2You pick up a nearby stick and inscribe some of your wisdom.");
            await this.io.sln();
            lines = [];
            // DIFF: Previously, no max length on dirt...
            do {
                await this.io.lw("`. `0>`%");
                this.io.emitPrompt('dirt_inscription', [], 'line');
                line = "  " + cleanStr(await this.io.getstr());
                lines.push(line);
            } while (line !== "  " && lines.length < 20);
            this.storage.setConversation('dirt', lines.join('\n'));
        }
    }

    async slaughterOthers(): Promise<void> {
        let ch: string;

        this.io.sclrscr();
        if (!this.player.expert) {
            if (this.rip) await this.io.showRip("WAR");
            else await this.io.showTxt("WAR");
        }
        for (;;) {
            if (!this.rip) {
                await this.io.sln();
                this.io.foreground(5);
                await this.io.sln("Slaughter Other Players");
                this.io.foreground(2);
                await this.io.sln();
                await this.io.sln("(S,L,E,W,R)  (? for menu)");
            }
            await this.mail.checkMail();
            ch = await this.io.commandPrompt('slaughter_menu', [
                { key: 'S', label: 'Search for player' },
                { key: 'L', label: 'List players' },
                { key: 'E', label: 'Examine the dirt' },
                { key: 'W', label: 'Write in dirt' },
                { key: 'R', label: 'Return' },
                { key: '?', label: 'Menu' },
            ]);
            switch (ch) {
                case "L":
                    await this.io.showBuffer(this.rankings.generateRankings(false, true, false), true, true);
                    break;
                case "R":
                case "Q":
                case "\r":
                    return;
                case "?":
                    if (this.rip) await this.io.showRip("WAR");
                    else await this.io.showTxt("WAR");
                    break;
                case "V":
                    await this.io.showStats();
                    break;
                case "S":
                    if (await this._slaughterSearchPlayer()) return;
                    break;
                case "E":
                    await this._slaughterExamineDirt();
                    break;
                case "W":
                    await this._slaughterWriteInDirt();
                    break;
            }
        }
    }
}

export default Battle;
