/**
 * TeamLord v2.0 - Action Module
 * Ported from TEAMACT.PAS - train doorguard, team attacks, invade houses, get a room
 */
import { random, prettyInt } from '@lordts/util/Util';
import {
    MAX_PLAY, DOORGUARD_COST, DOORGUARD_MAX_STAT,
    ENDURANCE_TRAIN_COST, STRENGTH_TRAIN_COST,
    MAX_ENDURANCE_HOURS, MAX_STRENGTH_HOURS,
    pressAKey, buildPlayerIndex, loadTeam,
} from './teamlordDefs';
import type { TeamLordContext, PlayerIndexEntry, TeamRecord } from './teamlordDefs';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import { TeamLordParty } from './teamlordParty';

class TeamLordActions {
    private ctx: TeamLordContext;
    private partyModule: TeamLordParty;

    constructor(ctx: TeamLordContext) {
        this.ctx = ctx;
        this.partyModule = new TeamLordParty(ctx);
    }

    async actionMenu(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        // reload team data
        this.reloadMyTeam();

        const oldTeam = igmPlay.onteam;

        let ch: string;
        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('                             `%Action Options');
            await io.lln('`0`L');
            await io.lln('');
            await io.lln('         `2(`5T`2)rain Door Guard                     `2(`5G`2)et A Room');
            await io.lln('         `2(`5P`2)arty                                `2(`5I`2)nvade a House');
            await io.lln('         `2(`5A`2)ttack Team                          `2(`%Q`2)uit');
            await io.lln('');
            await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_actions', [
                { key: 'T', label: 'Train Door Guard' },
                { key: 'G', label: 'Get A Room' },
                { key: 'P', label: 'Party' },
                { key: 'I', label: 'Invade a House' },
                { key: 'A', label: 'Attack Team' },
                { key: 'Q', label: 'Quit' },
            ]);
            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('TGPAIAQ'.indexOf(ch) === -1);
            await io.lln(ch);

            if (!igmPlay.onteam && ch !== 'Q') {
                await io.lln('');
                await io.lln('`%You\'re not on a team!');
                await io.lln('');
                await pressAKey(io);
            } else {
                // TeamLord keeps all activity branches behind the same team
                // membership gate. Once a branch removes the player from the
                // team, the action loop exits immediately.
                switch (ch) {
                    case 'I': await this.invade(); break;
                    case 'A': await this.attack(); break;
                    case 'T': await this.train(); break;
                    case 'G': await this.getARoom(); break;
                    case 'P': await this.partyModule.party(); break;
                    case 'Q': return;
                }
            }

            if (oldTeam && !igmPlay.onteam) return;
        }
    }

    // ─── Get A Room ──────────────────────────────────────────────────────────

    private async getARoom(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        await io.lln('');
        await io.lw('`2  Do you want to stay for the night? [`5N`2]:`% ');
        io.emitPrompt('teamlord_getaroom', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'Y') ch = 'N';
        await io.lln(ch);

        if (ch === 'N') {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`%  Visiting the Team House');
            await io.lln('`0`L');
            await io.lln('`2You pass the doorguard on the way into your house, and feel very confident that he would protect you in the case of an intruder.  You feel that sleeping here would be much safer than staying in the Inn.  You never trusted that sneaky bartender anyway...');
            await pressAKey(io);
            return;
        }

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%  Retiring...');
        await io.lln('`0`L');
        await io.lln('`2You pass the doorguard on the way into your house, and feel very confident that he will protect you in the case of an intruder.  Walking back to your room, you lock the doors and windows.  Finally, you collapse in your bed, and wait for sleep...');
        await io.lln('');
        await io.lln('');
        await io.lln('RETURNING TO THE MUNDANE WORLD...');

        // Set player as sleeping in team house
        player.on_now = false;
        player.put();
        myTeam.sleep[player.Record] = true;
        myTeam.put();
        igmPlay.put();

        // The outer LORD session sees the player as offline, while TeamLord's
        // own team record remembers that the player is sleeping in the house.
        await this.ctx.log.logLine('`.`2' + player.name + ' `2is asleep in the `0' + myTeam.name + '`2 team house.');
    }

    // ─── Train Doorguard ─────────────────────────────────────────────────────

    private async train(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        if (myTeam.dgstr === 0) {
            await io.lln('');
            await io.lw('`2  You do not have a doorguard!  Would you like to purchase one? [`5Y`2]:`% ');
            io.emitPrompt('teamlord_buy_doorguard', [
                { key: 'Y', label: 'Yes' },
                { key: 'N', label: 'No' },
            ]);
            let ch = (await io.getkey()).toUpperCase();
            if (ch !== 'N') ch = 'Y';
            await io.lln(ch);
            if (ch === 'N') return;

            await io.lln('');
            await io.lln('`2A doorguard dragon will cost 10,000 gold.');
            await io.lln('');
            if (player.gold < DOORGUARD_COST) {
                await io.lln('`2You can\'t afford this!');
                await pressAKey(io);
                return;
            }
            await io.lw('`2  Pay it? [`5Y`2]:`% ');
            io.emitPrompt('teamlord_pay_doorguard', [
                { key: 'Y', label: 'Yes' },
                { key: 'N', label: 'No' },
            ]);
            ch = (await io.getkey()).toUpperCase();
            if (ch !== 'N') ch = 'Y';
            await io.lln(ch);
            if (ch === 'N') return;

            await io.lln('');
            await io.lln('`2You take the dragon back to the house, to train it.');
            myTeam.dgstr = 1;
            myTeam.dgdef = 10;
            player.gold -= DOORGUARD_COST;
            myTeam.put();
            player.put();
            await pressAKey(io);
            await io.lln('');
            io.sclrscr();
        }

        while (true) {
            await io.lln('');
            await io.lln('');
            await io.lln('`%    Training the doorguard');
            await io.lln('`0`L');
            await io.lln('`2Your little dragon could use some training to increase the size of his muscles - after all, he\'s the watchman while you sleep.');
            await io.lln('');

            let tempStr = prettyInt(myTeam.dgstr);
            if (myTeam.dgstr === DOORGUARD_MAX_STAT) tempStr += ' `0(`2Maximum!`2)';
            await io.lln('`0      Strength :`% ' + tempStr);

            tempStr = prettyInt(myTeam.dgdef);
            if (myTeam.dgdef === DOORGUARD_MAX_STAT) tempStr += ' `0(`2Maximum!`0)';
            await io.lln('`0      Endurance:`% ' + tempStr);

            await io.lln('');
            await io.lln('');
            await io.lln('        `2(`5T`2)rain Your Dragon');
            await io.lln('');
            await io.lln('        `2(`5R`2)eturn to Team Menu');
            await io.lln('');
            await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_train', [
                { key: 'T', label: 'Train' },
                { key: 'R', label: 'Return' },
            ]);
            let ch = (await io.getkey()).toUpperCase();
            if (ch !== 'T') ch = 'R';
            await io.lln(ch);
            if (ch === 'R') return;

            // Party points are spent in 5-point chunks by the Party module.
            // Training only works when a full chunk remains to convert into
            // doorguard practice time.
            if (igmPlay.partied === 0 || igmPlay.partied % 5 !== 0) {
                await io.lln('');
                await io.lln('`2  Sorry, you\'ve already trained it enough today!');
                await pressAKey(io);
                return;
            }

            await io.lln('');
            await io.lw('`2  Train the dragon in [`0E`2]ndurance or [`0S`2]trength? [`5E`2]:`% ');
            io.emitPrompt('teamlord_train_type', [
                { key: 'E', label: 'Endurance' },
                { key: 'S', label: 'Strength' },
            ]);
            ch = (await io.getkey()).toUpperCase();
            if (ch !== 'S') ch = 'E';
            await io.lln(ch);

            if (ch === 'E') {
                if (await this._trainEndurance(myTeam)) continue;
            } else {
                if (await this._trainStrength(myTeam)) continue;
            }

            if (!igmPlay.onteam) return;
        }
    }

    private async _trainEndurance(myTeam: TeamRecord): Promise<boolean> {
        const { io, player } = this.ctx;

        await io.lln('');
        await io.lln('`2Endurance training for dragons involves intensive running, fire-breathing, and frisbee-catching.  This process will increase the dragon\'s endurance by 1 for every hour that you submit him to (up to 7 hours a training session).  Each training hour will cost `$20,000 `2gold.');
        await io.lln('');

        const maxAffordable = Math.floor(player.gold / ENDURANCE_TRAIN_COST);
        let maxStr = prettyInt(maxAffordable);
        if (maxAffordable > MAX_ENDURANCE_HOURS) maxStr = String(MAX_ENDURANCE_HOURS);
        await io.lw('`2  How many hours of training will you submit him to? (`$' + maxStr + '`0 max`2)`% ');

        io.emitPrompt('teamlord_endurance_hours', [], 'number');
        const chHours = (await io.getkey());
        const hours = parseInt(chHours, 10);
        await io.lln(chHours);

        if (isNaN(hours) || hours < 1 || hours > MAX_ENDURANCE_HOURS) return true;

        if (hours > Math.floor(player.gold / ENDURANCE_TRAIN_COST)) {
            await io.lln('');
            await io.lln('`2You can\'t afford that!');
            await pressAKey(io);
            return true;
        }

        await io.lln('');
        await io.lln('`2Dragon trained! (`$' + prettyInt(hours * ENDURANCE_TRAIN_COST) + ' `2gold spent!)');
        player.gold -= hours * ENDURANCE_TRAIN_COST;
        myTeam.dgdef += hours;
        if (myTeam.dgdef > DOORGUARD_MAX_STAT) myTeam.dgdef = DOORGUARD_MAX_STAT;
        player.put();
        myTeam.put();
        await pressAKey(io);
        return false;
    }

    private async _trainStrength(myTeam: TeamRecord): Promise<boolean> {
        const { io, player } = this.ctx;

        await io.lln('');
        await io.lln('`2Strength training for dragons involves pumping iron with tongues, running cross-country (in Siberia), and picking up heavy objects (such as Rush Limbaugh or the Sunday New York Times).  You may strength train the dragon for up to nine hours a training session.  Each hour of training costs `$25,000 `2gold, and will increase the dragon\'s strength by 1.');
        await io.lln('');

        const maxAffordable = Math.floor(player.gold / STRENGTH_TRAIN_COST);
        let maxStr = prettyInt(maxAffordable);
        if (maxAffordable > MAX_STRENGTH_HOURS) maxStr = String(MAX_STRENGTH_HOURS);
        await io.lw('`2  How many hours of training will you submit him to? (`$' + maxStr + '`0 max`2)`% ');

        io.emitPrompt('teamlord_strength_hours', [], 'number');
        const chHours = (await io.getkey());
        const hours = parseInt(chHours, 10);
        await io.lln(chHours);

        if (isNaN(hours) || hours < 1 || hours > MAX_STRENGTH_HOURS) return true;

        if (hours > Math.floor(player.gold / STRENGTH_TRAIN_COST)) {
            await io.lln('');
            await io.lln('`2You can\'t afford that!');
            await pressAKey(io);
            return true;
        }

        await io.lln('');
        await io.lln('`2Dragon trained! (`$' + prettyInt(hours * STRENGTH_TRAIN_COST) + ' `2gold spent!)');
        player.gold -= hours * STRENGTH_TRAIN_COST;
        myTeam.dgstr += hours;
        if (myTeam.dgstr > DOORGUARD_MAX_STAT) myTeam.dgstr = DOORGUARD_MAX_STAT;
        player.put();
        myTeam.put();
        await pressAKey(io);
        return false;
    }

    // ─── Team Attack ─────────────────────────────────────────────────────────

    private async attack(): Promise<void> {
        const { io, player } = this.ctx;
        const myTeam = this.ctx.myTeam!;

        const logLines: string[] = [];

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%    Team Attacks');
        await io.lln('`0`L');
        await io.lln('`2You glance around at your teammates, and see their lust for battle.  It\'s time to make a choice.');
        await io.lln('');
        await io.lln('        `2(`5A`2)ttack Another Team');
        await io.lln('');
        await io.lln('        `2(`5R`2)eturn to Team Menu');
        await io.lln('');
        await io.lw('`2  Your command, `0' + player.name + '`2? [R] `%');

        io.emitPrompt('teamlord_attack_menu', [
            { key: 'A', label: 'Attack' },
            { key: 'R', label: 'Return' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'A') ch = 'R';
        await io.lln(ch);
        if (ch === 'R') return;

        // Select target team
        let targetIdx: number;
        const pr = buildPlayerIndex(player);

        while (true) {
            targetIdx = await this.selectTeam();
            if (targetIdx === -1) return;

            const targetTeam = loadTeam(this.ctx.teamFile, targetIdx);
            if (!targetTeam) continue;

            // Check if anyone is alive and not online
            let allDead = true;
            for (let o = 0; o < MAX_PLAY && o < pr.length; o++) {
                if (targetTeam.member[o] && !pr[o].dead && !pr[o].on_now) {
                    allDead = false;
                    break;
                }
            }

            if (allDead) {
                await io.lln('');
                await io.lln('`2Everyone on that team is dead or hiding (online now)!');
                await pressAKey(io);
                continue;
            }

            await io.lln('');
            await io.lw('`2  Are you sure you want to attack `0' + targetTeam.name + '`2? [`5N`2]:`% ');
            ch = (await io.getkey()).toUpperCase();
            if (ch !== 'Y') ch = 'N';
            await io.lln(ch);
            if (ch === 'N') continue;

            logLines.push('`%' + myTeam.name + ' `2has initiated a team fight against `0' + targetTeam.name + '`2!');

            // Run the team battle
            const playerDied = await this.runTeamBattle(targetTeam, targetIdx, pr, logLines);

            // Write log entries
            if (logLines.length > 0) {
                for (const line of logLines) {
                    await this.ctx.log.logLine(line);
                }
                await this.ctx.log.logLine('                                `2-`0=`2-`0=`2-`0=`2-');
            }

            if (playerDied) return;
            break;
        }
    }

    private async runTeamBattle(
        targetTeam: TeamRecord,
        _targetIdx: number,
        pr: PlayerIndexEntry[],
        logLines: string[],
    ): Promise<boolean> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        const myTeam = this.ctx.myTeam!;

        // Build matchups
        const myUsed: boolean[] = Array.from({ length: MAX_PLAY }, () => false);
        const hisUsed: boolean[] = Array.from({ length: MAX_PLAY }, () => false);
        const myRec: number[] = Array.from({ length: MAX_PLAY }, () => -1);
        const hisRec: number[] = Array.from({ length: MAX_PLAY }, () => -1);

        io.sclrscr();
        await io.lln('`>`%Enemy Matchups!');
        await io.lln('');

        // This matchup algorithm matches exactly the original Pascal code logic.
        // It pairs up members from both teams for combat.
        let matchCount = 0;
        const needMoreMatches = true;

        while (needMoreMatches) {
            // Find next available member from my team
            let myFighter = -1;
            for (let e = 0; e < MAX_PLAY && e < pr.length; e++) {
                if (myTeam.member[e] && !myUsed[e] && !pr[e].dead && !pr[e].on_now) {
                    myFighter = e;
                    myUsed[e] = true;
                    break;
                }
            }

            if (myFighter === -1) break;

            // Find next available member from enemy team
            let hisFighter = -1;
            for (let o = 0; o < MAX_PLAY && o < pr.length; o++) {
                if (targetTeam.member[o] && !hisUsed[o] && !pr[o].dead && !pr[o].on_now) {
                    hisFighter = o;
                    hisUsed[o] = true;
                    break;
                }
            }

            if (hisFighter === -1) break;

            await io.lln('`0' + pr[myFighter].name + ' `2lines up with `0' + pr[hisFighter].name + '`2...');
            myRec[matchCount] = myFighter;
            hisRec[matchCount] = hisFighter;
            matchCount++;
        }

        // Fight each matchup
        for (let l = 0; l < matchCount; l++) {
            io.sclrscr();
            const isMe = (myRec[l] === player.Record);
            let ch: string;

            if (isMe) {
                await io.lln('`2You look over, and square off against `0' + pr[hisRec[l]].name);
                await pressAKey(io);
            } else {
                await io.lln('`0' + pr[myRec[l]].name + ' `2squares off against `0' + pr[hisRec[l]].name);
            }

            await io.lln('');
            await io.lln('');

            let goodPts = pr[myRec[l]].hp_max;
            let badPts = pr[hisRec[l]].hp_max;

            // Combat loop
            while (badPts > 0 && goodPts > 0) {
                if (isMe) {
                    await io.lln('`0Your Hitpoints: `2' + prettyInt(goodPts));
                    await io.lln(' ');
                    await io.lln('`0' + pr[hisRec[l]].name + '\'s Hitpoints: `2' + prettyInt(badPts));
                    await io.lln(' ');
                    await io.lln('`2[`5A`2]ttack');
                    await io.lln('`2[`5R`2]un');
                    await io.lln(' ');
                    await io.lw('`2  Your Choice, `0' + pr[myRec[l]].name + '`2? `2[`0A`2]`% ');

                    io.emitPrompt('teamlord_battle', [
                        { key: 'A', label: 'Attack' },
                        { key: 'R', label: 'Run' },
                    ]);
                    ch = (await io.getkey()).toUpperCase();
                    if (ch !== 'R') ch = 'A';
                    await io.lln(ch);

                    if (ch === 'R') {
                        await io.lln('');
                        await io.lln('`2RUN???  You can\'t run from a rumble!');
                        await pressAKey(io);
                        await io.lln('');
                        await io.lln('');
                        continue;
                    }
                    await io.lln('');
                }

                // My team member attacks
                let powermove = (random(20) === 7);
                let damage = this.calcDamage(pr[myRec[l]].str);

                if (powermove) {
                    badPts -= 2 * damage;
                    if (isMe) {
                        await io.lln('`@**POWER MOVE**');
                        await io.lln('');
                        await io.lln('`2You hit `0' + pr[hisRec[l]].name + '`2 for `$' + prettyInt(damage * 2) + '`2 hit points!');
                        await io.lln('');
                    }
                } else {
                    badPts -= damage;
                    if (isMe) {
                        await io.lln('`2You hit `0' + pr[hisRec[l]].name + '`2 for `$' + prettyInt(damage) + '`2 hit points!');
                        await io.lln('');
                    }
                }

                // Enemy counter-attacks if still alive
                if (badPts > 0) {
                    powermove = (random(20) === 7);
                    damage = this.calcDamage(pr[hisRec[l]].str);

                    if (powermove) {
                        goodPts -= 2 * damage;
                        if (isMe) {
                            await io.lln('`@**POWER MOVE**');
                            await io.lln('');
                            await io.lln('`%' + pr[hisRec[l]].name + '`0 hits you for `$' + prettyInt(damage * 2) + '`0 hit points!');
                            await io.lln('');
                        }
                    } else {
                        goodPts -= damage;
                        if (isMe) {
                            await io.lln('`%' + pr[hisRec[l]].name + '`0 hits you for `$' + prettyInt(damage) + '`0 hit points!');
                            await io.lln('');
                        }
                    }
                }
            }

            // Determine outcome
            if (badPts < 1) {
                // My team member won
                let xpGain = Math.floor(pr[hisRec[l]].exp / 2) + Math.floor(pr[hisRec[l]].exp / 10);
                if (pr[myRec[l]].exp > 2000000000 - xpGain) {
                    xpGain = 2000000000 - pr[myRec[l]].exp;
                }

                if (isMe) {
                    await io.lln('`0You have defeated `%' + pr[hisRec[l]].name + '`0!');
                } else {
                    await io.lln('`0' + pr[myRec[l]].name + '`2 has defeated `%' + pr[hisRec[l]].name + '`0!');
                }
                await io.lln('');

                const xpLost = pr[hisRec[l]].exp > 0 ? Math.floor(pr[hisRec[l]].exp / 10) : 0;

                // Send mail to both fighters
                this.sendBattleMail(myRec[l], pr[hisRec[l]].name, targetTeam.name, xpGain, true);
                this.sendBattleMail(hisRec[l], pr[myRec[l]].name, myTeam.name, xpLost, false);

                if (isMe) {
                    await io.lln('`0You receive `%' + prettyInt(xpGain) + ' `0experience!');
                } else {
                    await io.lln('`0' + pr[myRec[l]].name + '`2 received `%' + prettyInt(xpGain) + ' `0experience!');
                }
                await io.lln('');

                logLines.push('`5' + pr[myRec[l]].name + ' `2(`0' + myTeam.name + '`2) has killed `5' + pr[hisRec[l]].name + '`2!');

                // Update enemy player record
                const enemyRec = player.playerGet(hisRec[l]);
                if (enemyRec) {
                    enemyRec.exp -= xpLost;
                    enemyRec.dead = true;
                    enemyRec.put();
                }

                // Update winner (if not the current player)
                if (!isMe) {
                    const winnerRec = player.playerGet(myRec[l]);
                    if (winnerRec) {
                        winnerRec.exp += xpGain;
                        winnerRec.put();
                    }
                } else {
                    player.exp += xpGain;
                    player.put();
                }

                // Winner can fight again - mark as available
                myUsed[myRec[l]] = false;

                await pressAKey(io);
            } else {
                // My team member lost
                const xpLost = Math.floor(pr[myRec[l]].exp / 10);
                const xpGainEnemy = Math.floor(pr[myRec[l]].exp / 2) + Math.floor(pr[myRec[l]].exp / 10);

                if (isMe) {
                    await io.lln('`0You have been defeated by `%' + pr[hisRec[l]].name + '`0!');
                } else {
                    await io.lln('`0' + pr[myRec[l]].name + '`2 has been defeated by `%' + pr[hisRec[l]].name + '`0!');
                }
                await io.lln('');

                if (isMe) {
                    await io.lln('`0You lost `%' + prettyInt(xpLost) + ' `0experience!');
                } else {
                    await io.lln('`0' + pr[myRec[l]].name + '`2 lost `%' + prettyInt(xpLost) + ' `0experience!');
                }

                this.sendBattleMail(myRec[l], pr[hisRec[l]].name, targetTeam.name, xpLost, false);
                this.sendBattleMail(hisRec[l], pr[myRec[l]].name, myTeam.name, xpGainEnemy, true);

                logLines.push('`5' + pr[hisRec[l]].name + ' `2(`0' + targetTeam.name + '`2) has killed `5' + pr[myRec[l]].name + '`2!');

                // Update enemy (winner)
                const enemyRec = player.playerGet(hisRec[l]);
                if (enemyRec) {
                    const gain = Math.min(xpGainEnemy, 2000000000 - enemyRec.exp);
                    enemyRec.exp += gain;
                    enemyRec.put();
                }

                if (isMe) {
                    player.exp -= xpLost;
                    player.dead = true;
                    player.on_now = false;
                    player.put();
                    myTeam.sleep[player.Record] = false;
                    myTeam.put();
                    igmPlay.put();

                    await io.lln('');
                    await io.lln('`2Abort!  Iniatator is dead!');
                    await pressAKey(io);
                    return true; // player died
                } else {
                    const loserRec = player.playerGet(myRec[l]);
                    if (loserRec) {
                        loserRec.exp -= xpLost;
                        loserRec.dead = true;
                        loserRec.put();
                    }
                    myTeam.sleep[myRec[l]] = false;
                    myTeam.put();
                }

                // Loser's opponent can fight again
                hisUsed[hisRec[l]] = false;

                await pressAKey(io);
            }
        }

        return false; // player survived
    }

    private calcDamage(strength: number): number {
        const min = strength - Math.floor(strength / 5);
        const range = strength + Math.floor(strength / 5) - min;
        return min + 1 + random(range);
    }

    private sendBattleMail(toRecord: number, opponentName: string, opponentTeam: string, xpAmount: number, won: boolean): void {
        const lines: string[] = [];
        lines.push('  `%TEAM ATTACK RESULTS!');
        lines.push('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2');
        if (won) {
            lines.push('  `2You have killed `0' + opponentName + ' `2(`0' + opponentTeam + '`2)!');
            lines.push('  `2You receive `$' + prettyInt(xpAmount) + ' `2experience!');
        } else {
            lines.push('  `2You have been killed by `0' + opponentName + ' `2(`0' + opponentTeam + '`2)!');
            lines.push('  `2You lose `$' + prettyInt(xpAmount) + ' `2experience!');
        }
        lines.push('');
        this.ctx.storage.sendMail(toRecord, lines.join('\n'));
    }

    // ─── Invade ──────────────────────────────────────────────────────────────

    async invade(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        if (igmPlay.invaded < 1 || igmPlay.invaded > 200) {
            await io.lln('');
            await io.lln('`2To be on the safe side, you decide you will wait until tomorrow before attempting to invade another house.');
            await pressAKey(io);
            return;
        }

        const numTeams = this.ctx.teamFile.length;
        if (numTeams === 0) {
            await io.lln('');
            await io.lln('`2There are no teams to invade!');
            await pressAKey(io);
            return;
        }

        const targetIdx = await this.selectInvadeTarget(igmPlay, numTeams);
        if (targetIdx === -1) return;

        const team = loadTeam(this.ctx.teamFile, targetIdx);
        if (!team) return;

        igmPlay.invaded--;

        // Fight doorguard (if present, 7/8 chance of encounter)
        if (team.dgstr > 0 && team.dgdef > 0 && random(8) !== 1) {
            await io.lln('`2Before you can steal into the house, however, you chance upon an enormous dragon - the doorguard!');
            await io.lln('');
            const survived = await this.invadeFightDoorguard(team, targetIdx);
            if (!survived) return; // player died
        }

        let triedSteal = false;
        let q = 1;
        let ch: string;

        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`%House Invasion...');
            await io.lln('`0`L');

            if (q >= 10) {
                await io.lln('`2You\'re feeling kind of antsy now - you decide to leave before someone wakes up!');
                await pressAKey(io);
                ch = 'R';
            } else {
                await io.lln('`2You\'re in!  Now, what to do...');
                await io.lln('');
                await io.lln('`2      (`5K`2)ill an Enemy');
                await io.lln('`2      (`5S`2)teal from the Treasury');
                await io.lln('');
                await io.lln('`2      (`5R`2)un Away!');
                await io.lln('');
                await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

                io.emitPrompt('teamlord_invade', [
                    { key: 'K', label: 'Kill an Enemy' },
                    { key: 'S', label: 'Steal from Treasury' },
                    { key: 'R', label: 'Run Away' },
                ]);
                do {
                    ch = (await io.getkey()).toUpperCase();
                } while ('KSR'.indexOf(ch) === -1 && ch !== '\r');
                if (ch === '\r') ch = 'R';
                await io.lln(ch);
            }

            switch (ch) {
                case 'R':
                case 'Q':
                    team.put();
                    await this.ctx.log.logLine('`5' + player.name + '`2 broke into the `0' + team.name + '`2\'s house!');
                    await this.ctx.log.logLine('                                `2-`0=`2-`0=`2-`0=`2-');
                    return;
                case 'K':
                    await this.invadeKillEnemy(team, targetIdx);
                    q++;
                    break;
                case 'S':
                    await io.lln('');
                    if (triedSteal) {
                        await io.lln('`2You probably shouldn\'t try to steal again!  You might get caught!');
                        await pressAKey(io);
                        continue;
                    }
                    triedSteal = true;
                    await this.invadeSteal(team, targetIdx);
                    q++;
                    break;
            }

            if (!igmPlay.onteam) return;
        }
    }

    private async invadeFightDoorguard(team: TeamRecord, _teamIdx: number): Promise<boolean> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        let goodPts = player.hp;
        let badPts = team.dgdef;

        while (true) {
            await io.lln('`0Your Hitpoints: `2' + prettyInt(goodPts));
            await io.lln(' ');
            await io.lln('`0Doorguard\'s Hitpoints: `2' + prettyInt(badPts));
            await io.lln(' ');
            await io.lln('`2[`5A`2]ttack');
            await io.lln('`2[`5R`2]un');
            await io.lln(' ');
            await io.lw('`2  Your Choice, `0' + igmPlay.name + '`2? `2[`0A`2]`% ');

            io.emitPrompt('teamlord_doorguard', [
                { key: 'A', label: 'Attack' },
                { key: 'R', label: 'Run' },
            ]);
            let ch = (await io.getkey()).toUpperCase();
            if (ch !== 'R') ch = 'A';
            await io.lln(ch);

            if (ch === 'R') {
                await io.lln('');
                await io.lln('`2You try to run away, but to no avail!');
                await pressAKey(io);
                await io.lln('');
                await io.lln('');
                continue;
            }

            await io.lln('');
            // Player attacks doorguard
            let powermove = (random(20) === 7);
            let damage = this.calcDamage(player.str);

            if (powermove) {
                badPts -= 2 * damage;
                await io.lln('`@**POWER MOVE**`2');
                await io.lln('');
                await io.lln('`2You hit `0Doorguard`2 for `$' + prettyInt(damage * 2) + '`2 hit points!');
                await io.lln('');
            } else {
                badPts -= damage;
                await io.lln('`2You hit `0Doorguard`2 for `$' + prettyInt(damage) + '`2 hit points!');
                await io.lln('');
            }

            // Doorguard counter-attacks
            if (badPts > 1) {
                powermove = (random(20) === 7);
                damage = this.calcDamage(team.dgstr);

                if (powermove) {
                    goodPts -= 2 * damage;
                    await io.lln('`@**POWER MOVE**');
                    await io.lln('');
                    await io.lln('`%Doorguard`0 hits you for `$' + prettyInt(damage * 2) + '`0 hit points!');
                    await io.lln('');
                } else {
                    goodPts -= damage;
                    await io.lln('`%Doorguard`0 hits you for `$' + prettyInt(damage) + '`0 hit points!');
                    await io.lln('');
                }
            }

            if (badPts < 1) {
                return await this._doorguardDefeated(team, goodPts);
            }

            if (goodPts < 1) {
                return await this._playerKilledByDoorguard(team);
            }
        }
    }

    private async _doorguardDefeated(team: TeamRecord, goodPts: number): Promise<boolean> {
        const { io, player } = this.ctx;

        team.dgdef -= player.def * 10;
        team.dgstr -= player.str * 10;
        if (team.dgdef < 1) team.dgdef = 0;
        if (team.dgstr < 1) team.dgstr = 0;
        team.put();

        player.hp = goodPts;
        player.put();

        const mailLines = [
            '',
            '  `%YOUR DOOR GAURD IS DEAD!',
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2',
            '  `0' + player.name + '`2 has invaded the `%' + team.name + ' house',
            '  and killed your dragon door gaurd!',
            '',
        ];
        this.ctx.storage.sendMail(team.leader, mailLines.join('\n'));

        await io.lln('`0You have defeated `%Doorguard`0!');
        await pressAKey(io);
        return true;
    }

    private async _playerKilledByDoorguard(team: TeamRecord): Promise<boolean> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        const myTeam = this.ctx.myTeam!;

        const xpLost = Math.floor(player.exp / 10);
        player.exp -= xpLost;
        player.dead = true;
        player.on_now = false;
        player.put();
        igmPlay.put();
        myTeam.sleep[player.Record] = false;
        myTeam.put();

        await io.lln('`0You have been defeated by `%Doorguard`0!');
        await io.lln('`0You lost `%' + prettyInt(xpLost) + ' `0experience!');
        await io.lln('');
        await io.lln('`2  RETURNING TO THE MUNDANE WORLD...');

        await this.ctx.log.logLine('`5' + player.name + '`2 attempted to break into the `0' + team.name + '`2\'s house!');
        await this.ctx.log.logLine('`2However, they were killed by the doorguard.');
        await this.ctx.log.logLine('                                `2-`0=`2-`0=`2-`0=`2-');

        return false;
    }

    private async invadeSteal(team: TeamRecord, _teamIdx: number): Promise<void> {
        const { io, player } = this.ctx;

        if (team.treasury < 100) {
            await io.lln('`2It appears that they have no money to steal!');
            await pressAKey(io);
            return;
        }

        const stealAmount = Math.floor(team.treasury / 5) + random(Math.floor(team.treasury / 5));

        await io.lln('`2It appears that you can safely steal up to `%' + prettyInt(stealAmount) + '`2 gold!');
        await io.lw('`2  Try it? [`5Y`2]:`% ');
        io.emitPrompt('teamlord_steal', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'N') ch = 'Y';
        await io.lln(ch);

        if (ch === 'Y') {
            await io.lln('');
            if (random(player.level) > 4) {
                await io.lln('`2You did it!');
                await io.lln('');
                team.treasury -= stealAmount;
                if (player.gold > 2000000000 - stealAmount) {
                    player.gold = 2000000000;
                } else {
                    player.gold += stealAmount;
                }
                team.put();
                player.put();
                await io.lln('`2You now have `%' + prettyInt(player.gold) + ' `2gold.');
            } else {
                await io.lln('`2You hear a grunt over in the corner as you approach the safe.');
                await io.lln('');
                await io.lln('`2You decide not to risk it.');
            }
            await pressAKey(io);
        }
    }

    private async invadeKillEnemy(team: TeamRecord, _teamIdx: number): Promise<void> {
        const { io, player } = this.ctx;

        // Find a sleeping enemy
        let targetRec = -1;
        for (let i = 0; i < MAX_PLAY; i++) {
            if (team.sleep[i] && team.member[i]) {
                targetRec = i;
            }
        }

        if (targetRec === -1) {
            await io.lln('');
            await io.lln('`2No one is currently staying here!');
            await pressAKey(io);
            return;
        }

        const enemy = player.playerGet(targetRec);
        if (!enemy) return;

        await io.lln('');
        await io.lln('`2It appears that `0' + enemy.name + ' `2is sleeping here.');
        await io.lw('`2  Kill them? [`5Y`2]:`% ');
        io.emitPrompt('teamlord_kill', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'N') ch = 'Y';
        await io.lln(ch);

        if (ch !== 'Y') {
            await io.lln('');
            await io.lln('`2You decide to let `0' + enemy.name + ' `2live.');
            await pressAKey(io);
            return;
        }

        await io.lln('');
        if (random(player.level - enemy.level) >= 2 || random(10) <= 2) {
            await this._invadeKillSuccess(enemy, team, targetRec);
        } else {
            await this._invadeKillFailed(enemy, team, targetRec);
        }
    }

    private async _invadeKillSuccess(enemy: LoadedPlayerRecord, team: TeamRecord, targetRec: number): Promise<void> {
        const { io, player } = this.ctx;

        await io.lln('`2You make the blow quickly, and sharply.');
        await io.lln('');

        let lostXp: number;
        if (player.exp > 2000000000 - Math.floor(enemy.exp / 5)) {
            lostXp = 2000000000 - player.exp;
        } else {
            lostXp = Math.floor(enemy.exp / 5);
        }

        player.exp += lostXp;
        enemy.exp -= lostXp;
        await io.lln('`2You gain `%' + prettyInt(lostXp) + ' `2experience!');
        await io.lln('');

        let lostGems = enemy.gem;
        if (player.gem > 32767 - lostGems) {
            lostGems = 32767 - player.gem;
        }
        player.gem += lostGems;
        enemy.gem -= lostGems;

        await io.lln('`2You steal `$' + prettyInt(lostGems) + ' `2gems!');

        enemy.dead = true;
        team.sleep[targetRec] = false;

        team.put();
        enemy.put();
        player.put();

        const mailLines = [
            '  `%YOU HAVE BEEN MURDERED!',
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2',
            '  `0' + player.name + '`2 has invaded the `%' + team.name + ' `2house!',
            '  `0' + player.name + '`2 has murdered you!',
            '  `2You lose `$' + prettyInt(lostXp) + ' `2experience!',
            '  `2You lost `$' + prettyInt(lostGems) + '  `2gems!',
            '',
        ];
        this.ctx.storage.sendMail(targetRec, mailLines.join('\n'));

        await pressAKey(io);
    }

    private async _invadeKillFailed(enemy: LoadedPlayerRecord, team: TeamRecord, targetRec: number): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        const myTeam = this.ctx.myTeam!;

        await io.lln('`0' + enemy.name + '`2\'s eyes flash open, and you realize that you\'re in trouble!');
        await io.lln('`0' + enemy.name + '`2 reaches under a pillow, and pulls out a dagger...');
        await io.lln('');

        switch (random(2)) {
            case 0: {
                await io.lln('`0' + enemy.name + '`2 hurls the dagger into your chest!');
                await io.lln('');
                await io.lln('`2The lights begin to dim as you feel a sticky red ooze burn out of your ribs and onto your skin.');
                await io.lln('');
                await io.lln('`2Darkness overwhelms your eyes, and you sink into infinity...');
                player.on_now = false;
                player.dead = true;
                player.put();
                igmPlay.put();
                myTeam.sleep[player.Record] = false;
                myTeam.put();

                const defMailLines = [
                    '  `%YOU HAVE BEEN ATTACKED!',
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2',
                    '  `0' + player.name + '`2 has invaded the `%' + team.name + ' `2house!',
                    '  `0' + player.name + '`2 tried to murdered you, but you were faster!',
                    '',
                ];
                this.ctx.storage.sendMail(targetRec, defMailLines.join('\n'));
                break;
            }
            case 1: {
                player.hp = 1;
                player.put();
                await io.lln('`0' + enemy.name + '`2 hurls the dagger into your side!');
                await io.lln('');
                await io.lln('`2The lights begin to dim as you feel a sticky red ooze burn out of your gut and onto your skin.');
                await io.lln('');
                await io.lln('`2You summon your remaining power, and dash out of the house!');

                const atkMailLines = [
                    '  `%YOU HAVE BEEN ATTACKED!',
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2',
                    '  `0' + player.name + '`2 has invaded the `%' + team.name + ' `2house!',
                    '  `0' + player.name + '`2 tried to murdered you, but failed!',
                    '',
                ];
                this.ctx.storage.sendMail(targetRec, atkMailLines.join('\n'));
                break;
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    async selectTeam(): Promise<number> {
        const { io } = this.ctx;
        const igmPlay = this.ctx.igmPlay;
        const teamFile = this.ctx.teamFile;
        const numTeams = teamFile.length;

        if (numTeams === 0) {
            await io.lln('');
            await io.lln('`2No teams exist!');
            await pressAKey(io);
            return -1;
        }

        // Display teams
        let q = 0;
        for (let i = 0; i < numTeams; i++) {
            const t = loadTeam(teamFile, i);
            if (!t || t.deleted) continue;
            if (i === igmPlay.teamnum) continue; // skip own team

            q++;
            const numStr = String(q).padStart(3, ' ');
            await io.lln('`0' + numStr + '. `2' + t.name);

            if (q % 20 === 0) {
                await io.lln('');
                await io.lw('`2  (`%Q`2)uit, `2(`%C`2)ontinue, or team number: `%');
                io.emitPrompt('teamlord_team_select', [], 'line');
                const instr = await io.getstr({ len: 10 });
                await io.lln('');

                if (instr.toUpperCase() === 'Q') return -1;
                if (instr !== '' && instr.toUpperCase() !== 'C') {
                    const x = parseInt(instr, 10);
                    if (x > 0 && x <= numTeams) {
                        const idx = x - 1;
                        if (idx === igmPlay.teamnum) {
                            await io.lln('`2That\'s your own team!');
                            await pressAKey(io);
                            continue;
                        }
                        return idx;
                    }
                }
            }
        }

        await io.lw('`2  Enter team number: `%');
        io.emitPrompt('teamlord_team_select', [], 'line');
        const instr = await io.getstr({ len: 10 });
        await io.lln('');

        if (instr === '') return -1;

        const x = parseInt(instr, 10);
        if (x > 0 && x <= numTeams) {
            const idx = x - 1;
            if (idx === igmPlay.teamnum) {
                await io.lln('`2That\'s your own team!');
                await pressAKey(io);
                return -1;
            }
            return idx;
        }
        return -1;
    }

    private async selectInvadeTarget(igmPlay: { teamnum: number }, numTeams: number): Promise<number> {
        const { io } = this.ctx;

        while (true) {
            await io.lln('');
            await io.lw('`2  Which team (Q to Quit, ? to List)? ');
            io.emitPrompt('teamlord_invade_target', [], 'line');
            const instr = await io.getstr({ len: 10 });

            await io.lln('');

            if (instr === '' || instr.toUpperCase() === 'Q') return -1;

            let idx: number;
            if (instr === '?') {
                idx = await this.selectTeam();
                if (idx === -1) return -1;
            } else {
                idx = parseInt(instr, 10);
                if (isNaN(idx) || idx < 1 || idx > numTeams) {
                    continue;
                }
                idx -= 1; // convert to 0-based
            }

            if (idx === igmPlay.teamnum) {
                await io.lln('');
                await io.lln('`2You can\'t invade your own home!');
                await pressAKey(io);
                continue;
            }

            return idx;
        }
    }

    private reloadMyTeam(): void {
        const igmPlay = this.ctx.igmPlay;
        if (igmPlay.onteam && igmPlay.teamnum >= 0) {
            this.ctx.myTeam = loadTeam(this.ctx.teamFile, igmPlay.teamnum);
        }
    }
}

export { TeamLordActions };
