/**
 * OnlineBattle - Real-time PvP combat for LORD.
 *
 * Coordinates battles between players who are simultaneously online.
 * Manages the challenge/accept handshake, combat round resolution, and
 * outcome handling (loot, death, fleeing) via IBattleCoordinator.
 */

import { random, time, prettyInt } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';
import type { LoadedPlayerRecord, UiMode, Settings, MonsterStats } from './types';
import type DailyMaint from './DailyMaint';
import type IO from './io/IO';
import type Log from './Log';
import type Mail from './Mail';
import type Player from './Player';
import { GameExitError } from './GameExitError';
import { PvpLootPolicy } from './PvpLootPolicy';

class OnlineBattle {
    /** Prevents the attacker from sending a second taunt message in the same exchange. */
    private cantaunt: boolean;

    constructor(
        private io: IO,
        private settings: Settings,
        private monsterStats: MonsterStats[][],
        private _mail: Lazy<Mail>,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _uiMode: UiMode,
        private _battleCoordinator: Lazy<IBattleCoordinator>,
    ) {
        this.cantaunt = false;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get lastrip(): string { return this._uiMode.lastScreen; }

    get mail(): Mail {
        return this._mail.value;
    }

    get player(): Player {
        return this._player.value;
    }

    get log(): Log {
        return this._log.value;
    }

    get dailyMaint(): DailyMaint {
        return this._dailyMaint.value;
    }

    get battleCoordinator(): IBattleCoordinator {
        return this._battleCoordinator.value;
    }

    // ── Battle lock and message IPC helpers ────────────────────────────

    obCleanup(): void {
        // War messages carry duel requests and strike results, while battle
        // messages are free-form taunts. Clear both channels and the fight lock
        // so later duels never inherit stale state.
        this.battleCoordinator.clearWarMessage(this.player.Record);
        this.battleCoordinator.clearFightLock(this.player.Record);
        this.battleCoordinator.clearBattleMessage(this.player.Record);
    }

    /**
     * Poll one IPC channel for up to 15 seconds and clear it after reading.
     * This matches the loose turn-based pacing of classic online duels while
     * still letting callers abort when the remote side vanishes.
     */
    async obReadMsg(record: number, type: 'war' | 'battle'): Promise<string | undefined> {
        let msg: string | null;
        const end = time() + 15;

        do {
            msg = type === 'war'
                ? this.battleCoordinator.getWarMessage(record)
                : this.battleCoordinator.getBattleMessage(record);
            if (msg !== null && msg.length > 0) break;
            await this.io.mswait(100);
        } while (time() <= end);
        const result = (msg ?? '').replace(/[\r\n]/g, "");

        if (type === 'war') {
            this.battleCoordinator.clearWarMessage(record);
        } else {
            this.battleCoordinator.clearBattleMessage(record);
        }
        return result;
    }

    private obSendResp(op: LoadedPlayerRecord, str: string): void {
        this.battleCoordinator.sendBattleResponse(op.Record, str);
    }

    // ── Combat round ───────────────────────────────────────────────────

    async obGetMessage(op: LoadedPlayerRecord): Promise<boolean> {
        let msg: string | undefined;

        if (this.battleCoordinator.hasBattleMessage(this.player.Record)) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`0" + op.name + " `2screams something at you!`%");
            await this.io.sln();
            msg = await this.obReadMsg(this.player.Record, 'battle');
            await this.io.lln(msg || "");
            this.cantaunt = true;
            await this.io.sln();
            await this.io.moreNoMail();
            return true;
        }
        return false;
    }

    private async obGetResponse(op: LoadedPlayerRecord): Promise<string> {
        let dh: string;
        let loops = 0;
        let done = false;

        await this.io.sln();
        await this.io.lw("`2Waiting`0.", 2);
        do {
            op.reLoad();
            if (!op.on_now) {
                return "R";
            }
            if (await this.io.waitkey(0)) {
                dh = (await this.io.getkey()).toUpperCase();
            } else {
                dh = "";
            }
            if (loops > 70 && dh === "R") {
                await this.log.logLine("``.`0" + this.player.name + " `2has been eluded by `0" + op.name + "`2.");
                this.obSendResp(op, "R");
                await this.io.sln();
                return "ABORT";
            }
            this.io.sw(".");
            // After a prolonged wait, let the local player abandon the duel
            // instead of spinning forever if the remote user stops responding.
            if (loops === 70) {
                await this.io.sln();
                await this.io.lln("`2(`0R`2)un Away");
                await this.io.sln();
                await this.io.lw("`2Continuing wait`0.", 2);
            }
            if (await this.obGetMessage(op)) {
                await this.io.sln();
                await this.io.lw("`2Continuing wait`0.", 2);
            }
            loops += 1;
            await this.io.mswait(600);
            if (this.battleCoordinator.hasWarMessage(this.player.Record)) {
                done = true;
            }
        } while (!done);
        const msg = await this.obReadMsg(this.player.Record, 'war');
        await this.io.sln();
        return msg || "";
    }

    private async _onStruck(op: LoadedPlayerRecord, amount: number | string): Promise<void> {
        const his = op.sex === "M" ? "his" : "her";

        this.cantaunt = true;
        amount = parseInt(amount as string, 10);

        if (amount < 1) {
            await this.io.lln("`0" + op.name + " `2misses you!");
            await this.io.sln();
            return;
        }
        await this.io.lln("`0" + op.name + " `2hits you for `4" + prettyInt(amount) + "`2 points of damage!");
        this.player.hp -= amount;
        await this.io.sln();
        if (this.player.hp < 1) {
            await this.io.lln("You fall to the ground.  You think " + op.name + " `2is going to let you go... Just before you feel " + his + " " + op.weapon + " sliding through your chest.");
            await this.io.sln();
            await this.io.lln("You distantly feel your lungs filling with blood, when everything becomes black.");
            this.player.dead = true;
            this.battleCoordinator.doneOnlineBattle();
            await this.log.logLine("``.`0" + op.name + " `2has killed `5" + this.player.name + " `2in an Online Duel!");
            this.player.gold = 0;
            this.player.gem -= PvpLootPolicy.resolveVictimGemLoss(this.player.gem);
            this.player.exp -= parseInt(String(this.player.exp / 10), 10);
            this.player.hp = 0;
            this.player.on_now = false;
            this.player.put();
            this.io.events?.emitCombatEnd('defeat', op.name);
            await this.io.moreNoMail();
            await this.io.deadScreen(op);
            await this.io.sln();
            if (this.rip) {
                await this.io.showRip("EXIT");
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
        }
    }

    private async _waitForHit(op: LoadedPlayerRecord): Promise<string | void> {
        await this.io.lln("You wait as " + op.name + " `2strikes.");
        const waction = await this.obGetResponse(op);
        if (waction === "ABORT") {
            await this.io.sln();
            await this.io.sln("You run as fast as your legs will carry you!");
            await this.io.sln();
            await this.io.moreNoMail();
            return "ABORT";
        }
        if (waction === "R") {
            await this.io.lln("`0The sniveling " + op.name + " `0has run away.  Unfortunately, this battle is OVER.");
            await this.log.logLine("`0" + this.player.name + " `2& `0" + op.name + " `2had an uneventful online duel.");
            await this.io.sln();
            await this.io.moreNoMail();
            return "ABORT";
        }
        await this._onStruck(op, waction);
        return;
    }

    private async _handleAttack(op: LoadedPlayerRecord): Promise<boolean> {
        await this.io.sln();
        let tmp: number = random(parseInt(String(this.player.str / 2), 10)) + parseInt(String(this.player.str / 2), 10);
        tmp -= op.def;
        if (tmp < 1) {
            await this.io.lln("`2You miss `0" + op.name + "`2 Completely!");
            await this.io.sln();
            this.obSendResp(op, "0");
            if (await this._waitForHit(op) === "ABORT") return true;
            return false;
        }
        await this.io.lln("`2You HIT `0" + op.name + "`2 for `4" + prettyInt(tmp) + "`2 points of damage!");
        this.obSendResp(op, String(tmp));
        op.hp -= tmp;
        if (op.hp < 1) {
            await this.io.sln();
            await this.io.lln("You have killed " + op.name + "`2.");
            this.player.killedaplayer = true;
            const goldReward = PvpLootPolicy.resolveGoldReward(
                op.gold,
                this.player.level,
                this.monsterStats,
                this.settings,
            );
            await this.io.sln();
            const prevGold = this.player.gold;
            this.player.gold += goldReward;
            if (this.player.gold > 2000000000) {
                this.player.gold = 2000000000;
            }
            await this.io.lw(
                "  `2You receive `%" +
                    prettyInt(this.player.gold - prevGold) +
                    "`2 gold, and " +
                    prettyInt(op.exp / 2) +
                    " experience!",
            );
            const gemReward = PvpLootPolicy.resolveGemReward(op.gem, this.settings);
            if (gemReward > 0) {
                const prevGem = this.player.gem;
                this.player.gem += gemReward;
                if (this.player.gem > 32000) {
                    this.player.gem = 32000;
                }
                // DIFF: You got an extra pvp fight here?!?!
                const gemsFound = this.player.gem - prevGem;
                await this.io.lw("You also find " + prettyInt(gemsFound) + ' ' + (gemsFound === 1 ? 'Gem' : 'Gems') + '!', 2);
            }
            await this.io.sln();
            this.player.exp += parseInt(String(op.exp / 2), 10);
            this.battleCoordinator.doneOnlineBattle();
            this.player.put();
            await this.io.moreNoMail();
            await this.dailyMaint.tournamentCheck();
            return true;
        }
        if (await this._waitForHit(op) === "ABORT") return true;
        return false;
    }

    private async _handleYell(op: LoadedPlayerRecord): Promise<void> {
        if (this.cantaunt) {
            await this.io.sln();
            await this.io.sln("Yell what?");
            await this.io.sln();
            await this.io.lw(" `0>`2");
            this.io.emitPrompt('battle_yell', [], 'line');
            const msg = "  " + await this.io.getstr();
            this.battleCoordinator.setBattleMessage(op.Record, msg + "\n");
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`%** MESSAGE YELLED **");
            await this.io.sln();
            this.cantaunt = false;
        } else {
            await this.io.sln();
            await this.io.lln("`2You feel you had better stop taunting " + op.name + "`2, or you will lose your attack!");
            await this.io.sln();
        }
    }

    private async onBattle(op: LoadedPlayerRecord, first: boolean, action?: string): Promise<void> {
        let ch: string;

        if (first) {
            await this.io.lln("`%** YOUR SKILL ALLOWS YOU TO ATTACK FIRST **");
            await this.io.sln();
            await this.io.moreNoMail();
        } else {
            await this.io.lln("`%** YOUR ENEMY STRIKES YOU FIRST **");
            if (action === undefined) {
                if (await this._waitForHit(op) === "ABORT") return;
            } else {
                await this._onStruck(op, action);
            }
        }

        this.cantaunt = true;
        outer: while (true) {
            op.reLoad();
            if (this.player.hp < 1 || op.hp < 1) {
                break;
            }
            await this.io.lln("`2Your Hitpoints:`0 " + prettyInt(this.player.hp));
            await this.io.lln("`0" + op.name + "`2's Hitpoints:`0 " + prettyInt(op.hp));
            if (!this.rip) {
                await this.io.sln();
                await this.io.lln("`2(`0A`2)ttack Your Enemy");
                if (this.cantaunt) {
                    await this.io.lln("`2(`0Y`2)ell Something To Your Enemy");
                }
                await this.io.lln("`2(`0R`2)un For Your Life");
            }
            await this.io.sln();
            await this.io.lw("`2Your Command ?  :`0 ", 2);
            this.io.emitPrompt('online_battle_menu', [
                { key: 'A', label: 'Attack Your Enemy' },
                { key: 'Y', label: 'Yell Something' },
                { key: 'R', label: 'Run For Your Life' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            if (!this.rip) await this.io.sln(ch, 0);
            if (!await this.obGetMessage(op)) {
                switch (ch) {
                    case "A":
                        if (await this._handleAttack(op)) break outer;
                        break;
                    case "Y":
                        await this._handleYell(op);
                        break;
                    case "R":
                        this.obSendResp(op, "R");
                        await this.io.sln();
                        await this.io.lln("`2You run like the dickens!  You manage to elude `0" + op.name + "`2!");
                        break outer;
                }
            }
        }
    }

    // ── Challenge / accept flow ───────────────────────────────────────────

    async onlineBattle(op: LoadedPlayerRecord): Promise<void> {

        if (this.rip) await this.io.showRip("ONLINE");
        await this.io.lln("`c`%** ONLINE BATTLE **", 29);
        await this.io.lln(this.io.divider(0, '`0'), 0);
        if (this.battleCoordinator.hasFightLock(op.Record)) {
            await this.io.sln();
            await this.io.sln("Sorry!  That user is currently already in battle.  Try again later.");
            await this.io.sln();
            await this.io.moreNoMail();
            this.obCleanup();
            return;
        }
        this.battleCoordinator.setFightLock(this.player.Record, "");
        // `o` mail is a special wake-up code consumed by Output/handleOnlineChallenge.
        // It lets the challenged player get an immediate duel prompt even if they
        // were in the middle of another screen when the challenge arrived.
        await this.mail.mailTo(op.Record, "`o" + this.player.Record);
        // DIFF: You got free full healing here!
        // this.player.hp = this.player.hp_max
        this.player.put();
        await this.io.lln("`2Issuing an Online Duel challenge to " + op.name + "`2.");
        const action = await this.obGetResponse(op);
        if (action === "ABORT") {
            await this.io.sln();
            await this.io.sln("You decide you are really not ready for battle anyway.");
            await this.io.sln();
            await this.io.moreNoMail();
            this.obCleanup();
            return;
        }
        await this.io.sln();
        if (action[0] === "R") {
            await this.io.lln("`2You call out, but `0" + op.name + "`2 hides from you. ");
            await this.io.sln();
            await this.io.moreNoMail();
            this.obCleanup();
            return;
        }
        this.player.pvp_fights -= 1;
        await this.io.lln("`0" + op.name + " `2draws his " + op.weapon + " for battle!");
        await this.io.sln();
        const classNames = ['', 'warrior', 'magician', 'thief'];
        const playerImage = classNames[op.clss] ? `img/rpgui/player/${classNames[op.clss]}-${op.sex.toLowerCase()}-sm.png` : undefined;
        this.io.events?.emitCombatEncounter({ name: op.name, hp: op.hp, str: op.str, weapon: op.weapon, isPlayer: true, image: playerImage });
        // The response channel returns either an immediate attack marker (`A`)
        // or the first damage payload if the defender struck first.
        if (action[0] === "A") {
            await this.onBattle(op, true);
        } else {
            await this.onBattle(op, false, action);
        }
        this.obCleanup();
    }

    // -------------------------------------------------------------------------
    // handleOnlineChallenge - called from Output.lw() for the `o mail code
    // -------------------------------------------------------------------------
    async handleOnlineChallenge(oop: LoadedPlayerRecord): Promise<void> {
        let lwch: string;

        if (!oop.on_now) {
            return;
        }
        if (this.rip) await this.io.showRip("ONLINE");
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("** ONLINE BATTLE **", 29);
        this.io.foreground(10);
        await this.io.sln(this.io.divider());
        this.player.put();
        await this.io.lln("`0" + oop.name + " `2has challenged you to an Online Duel!");
        await this.io.sln();
        await this.io.lw("Do you accept? [`%N`2] : ", 2);
        this.io.emitPrompt('duel_accept', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        lwch = (await this.io.getkey()).toUpperCase();
        if (lwch !== "Y") {
            lwch = "N";
        }
        await this.io.sln(lwch);
        if (lwch === "N") {
            this.obSendResp(oop, "R");
            this.battleCoordinator.doneOnlineBattle();
            this.obCleanup();
            return;
        }
        await this.io.sln();
        await this.io.sln("As is the tradition, you are allowed to completely heal yourself first.");
        await this.io.sln();
        this.battleCoordinator.setFightLock(this.player.Record, "IN BATTLE\n");
        this.player.hp = this.player.hp_max;
        this.io.foreground(15);
        const classNames = ['', 'warrior', 'magician', 'thief'];
        const playerImage = classNames[oop.clss] ? `img/rpgui/player/${classNames[oop.clss]}-${oop.sex.toLowerCase()}-sm.png` : undefined;
        this.io.events?.emitCombatEncounter({ name: oop.name, hp: oop.hp, str: oop.str, weapon: oop.weapon, isPlayer: true, image: playerImage });
        if (random(10) < 5) {
            await this.onBattle(oop, true);
        } else {
            this.obSendResp(oop, "A");
            await this.onBattle(oop, false);
        }
        this.obCleanup();
        if (this.player.hp < 1 || this.player.dead) {
            this.player.hp = 0;
            this.player.dead = true;
            this.player.online = false;
            this.player.put();
            throw new GameExitError();
        }
    }
}

export default OnlineBattle;
