/**
 * TeamLord v2.0 - Management Module
 * Ported from TEAMMNG.PAS - treasury, exit team, kick member, list teams,
 * list team mates, revive, send message, password change
 */
import { prettyInt } from '@lordts/util/Util';
import {
    MAX_PLAY,
    pressAKey, buildPlayerIndex, loadTeam, loadPlayerRec, calcMagicNum,
} from './teamlordDefs';
import type { TeamLordContext, TeamRecord } from './teamlordDefs';

class TeamLordManagement {
    private ctx: TeamLordContext;

    constructor(ctx: TeamLordContext) {
        this.ctx = ctx;
    }

    async management(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        this.reloadMyTeam();
        if (!this.ctx.myTeam) return;
        const myTeam = this.ctx.myTeam;

        let leadName: string;
        if (myTeam.leader === player.Record) {
            leadName = 'You!';
        } else {
            const leader = player.playerGet(myTeam.leader);
            leadName = leader ? leader.name : 'Unknown';
        }

        const oldTeam = igmPlay.onteam;

        let ch: string;
        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`%Management Options');
            await io.lln('`0`L');
            await io.lln('');
            await io.lln('`2Team Leader: `0' + leadName);
            await io.lln('');
            await io.lln('         `2(`5Y`2)e Team Treasury                     `2(`5P`2)assword Change');
            await io.lln('         `2(`5E`2)xit Team                            `2(`5K`2)ick Off Team');
            await io.lln('         `2(`5D`2)isplay Teams                        `2(`5L`2)ist Team Mates');
            await io.lln('         `2(`5R`2)evive Team Mate                     `2(`5S`2)end Team Message');
            await io.lln('         `2(`%Q`2)uit to the Realm');
            await io.lln('');
            await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_management', [
                { key: 'Y', label: 'Team Treasury' },
                { key: 'P', label: 'Password Change' },
                { key: 'E', label: 'Exit Team' },
                { key: 'K', label: 'Kick Off Team' },
                { key: 'D', label: 'Display Teams' },
                { key: 'L', label: 'List Team Mates' },
                { key: 'R', label: 'Revive Team Mate' },
                { key: 'S', label: 'Send Team Message' },
                { key: 'Q', label: 'Quit' },
            ]);
            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('YPEKDLRSQ'.indexOf(ch) === -1);
            await io.lln(ch);
            await io.lln('');

            // Password changes and kicking members are reserved for the team
            // leader. The other management actions are available to any member.
            switch (ch) {
                case 'Y': await this.treasury(); break;
                case 'E':
                    await this.exitTeam();
                    if (!igmPlay.onteam) return;
                    break;
                case 'K':
                    if (myTeam.leader !== player.Record) {
                        await io.lln('`2Only the team leader can do that!');
                        await io.lln('');
                        await pressAKey(io);
                    } else {
                        await this.kickMember();
                    }
                    break;
                case 'D': await this.displayTeams(); break;
                case 'L': await this.listTeam(); break;
                case 'R': await this.revive(); break;
                case 'S': await this.sendMessage(); break;
                case 'P':
                    if (myTeam.leader !== player.Record) {
                        await io.lln('`2Only the team leader can do that!');
                        await io.lln('');
                        await pressAKey(io);
                    } else {
                        await this.passwordChange();
                    }
                    break;
                case 'Q': return;
            }

            if (oldTeam && !igmPlay.onteam) return;
        }
    }

    // ─── Password Change ─────────────────────────────────────────────────────

    private async passwordChange(): Promise<void> {
        const { io } = this.ctx;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Changing the team password');
        await io.lln('`0`L');
        await io.lln('');
        await io.lln('`2This option changes the password that people must give when they want to join the team.');
        await io.lln('');
        await io.lln('`2The current password is: `%' + myTeam.pass);
        await io.lln('');
        await io.lw('`0Change the password? `2[`0N`2] `%');

        io.emitPrompt('teamlord_change_pass_yn', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'Y') ch = 'N';
        await io.lln(ch);
        await io.lln('');

        if (ch === 'N') return;

        await io.lw('`2  Enter the new password: ');
        io.emitPrompt('teamlord_new_pass', [], 'line');
        const newPass = await io.getstr({ len: 20 });

        await io.lln('');
        await io.lln('');

        if (newPass === '') {
            await io.lln('`0Password not changed');
        } else {
            this.reloadMyTeam();
            myTeam.pass = newPass;
            myTeam.put();
            await io.lln('`0Done!');
        }

        await io.lln('');
        await pressAKey(io);
    }

    // ─── Send Message ────────────────────────────────────────────────────────

    private async sendMessage(): Promise<void> {
        const { io, player } = this.ctx;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Mailing all team mates');
        await io.lln('`0`L');
        await io.lln('');
        await io.lln('`2What do you want to send to your team mates? (5 lines max, blank quits)');
        await io.lln('');

        const lines: string[] = [];
        for (let c = 0; c < 5; c++) {
            io.emitPrompt('teamlord_mail_line', [], 'line');
            const line = await io.getstr({ len: 60 });
            if (line === '') break;
            lines.push(line);
        }

        if (lines.length === 0) return;

        for (let i = 0; i < MAX_PLAY; i++) {
            if (i === player.Record) continue;
            if (myTeam.member[i]) {
                // Team mail is expanded into ordinary LORD mail so offline team
                // mates receive it the next time they log in.
                const mailContent = [
                    '',
                    '  `%A Team Message from `0' + player.name,
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-',
                    '',
                    ...lines,
                    '',
                ].join('\n');
                this.ctx.storage.sendMail(i, mailContent);
            }
        }

        await io.lln('');
        await io.lln('`0Done!');
        await io.lln('');
        await pressAKey(io);
    }

    // ─── Revive ──────────────────────────────────────────────────────────────

    private async revive(): Promise<void> {
        const { io, player } = this.ctx;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        const pr = buildPlayerIndex(player);

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Reviving a dead team mate');
        await io.lln('`0`L');
        await io.lln('');

        let j = 0;
        for (let i = 0; i < MAX_PLAY && i < pr.length; i++) {
            if (myTeam.member[i] && pr[i].dead) {
                await io.lln('`0' + pr[i].name);
                j++;
                if (j % 10 === 0) {
                    await io.lln('');
                    await pressAKey(io);
                    await io.lln('');
                }
            }
        }

        if (j === 0) {
            await io.lln('');
            await io.lln('`0You have no dead team mates!');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        await io.lw('`0Who do you wish to revive? ');
        io.emitPrompt('teamlord_revive_name', [], 'line');
        const targetName = await io.getstr({ len: 20 });

        if (targetName === '') return;

        await io.lln('');
        await io.lln('');

        // Present only dead team mates, then confirm the chosen target once
        // more before charging the revival cost.
        let found = -1;
        for (let i = 0; i < MAX_PLAY && i < pr.length; i++) {
            if (myTeam.member[i] && pr[i].dead) {
                await io.lw('`2  Do you mean `0' + pr[i].name + '`2? `2[`0N`2] `%');
                io.emitPrompt('teamlord_revive_confirm', [
                    { key: 'Y', label: 'Yes' },
                    { key: 'N', label: 'No' },
                ]);
                let ch = (await io.getkey()).toUpperCase();
                if (ch !== 'Y') ch = 'N';
                await io.lln(ch);
                if (ch === 'Y') {
                    found = i;
                    break;
                }
            }
        }

        await io.lln('');

        if (found === -1) {
            await io.lln('`0No matching players');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        const amt = pr[found].level * 100000;
        await io.lln('`2It will cost `%' + prettyInt(amt) + ' `2gold to revive this person.');
        await io.lw('`2  Do it? `2[`0N`2] `%');

        io.emitPrompt('teamlord_revive_pay', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'Y') ch = 'N';
        await io.lln(ch);
        await io.lln('');

        if (ch === 'N') return;

        if (amt > player.gold) {
            await io.lln('`0You don\'t have that much gold!');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        const enemy = player.playerGet(found);
        if (!enemy) return;

        enemy.hp = enemy.hp_max;
        enemy.dead = false;
        enemy.put();

        player.gold -= amt;
        player.put();

        await io.lln('`0Done!');
        await io.lln('');
        await pressAKey(io);
    }

    // ─── List Team Mates ─────────────────────────────────────────────────────

    private async listTeam(): Promise<void> {
        const { io, player } = this.ctx;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        const pr = buildPlayerIndex(player);

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Your team mates');
        await io.lln('`0`L');
        await io.lln('');

        let j = 0;
        for (let i = 0; i < MAX_PLAY && i < pr.length; i++) {
            if (myTeam.member[i]) {
                j++;
                await io.lln('`0' + pr[i].name);
            }
            if (j > 0 && j % 10 === 0) {
                await io.lln('');
                await pressAKey(io);
                await io.lln('');
            }
        }

        if (j % 10 !== 0) {
            await io.lln('');
            await pressAKey(io);
        }
    }

    // ─── Display Teams ───────────────────────────────────────────────────────

    private async displayTeams(): Promise<void> {
        const { io, player } = this.ctx;
        const pr = buildPlayerIndex(player);
        const teamFile = this.ctx.teamFile;

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Teams');
        await io.lln('`0`L');
        await io.lln('');

        let i = 0;
        for (let idx = 0; idx < teamFile.length; idx++) {
            const team = loadTeam(teamFile, idx);
            if (!team || team.deleted) continue;

            i++;
            const leaderName = (team.leader >= 0 && team.leader < pr.length) ? pr[team.leader].name : 'Unknown';
            const numStr = String(i).padEnd(10, ' ');
            await io.lln('`2' + numStr + ': `0' + team.name.padEnd(30, ' ') + ' `2Leader: `0' + leaderName);

            if (i % 10 === 0) {
                await io.lln('');
                await pressAKey(io);
                await io.lln('');
            }
        }

        if (i % 10 !== 0) {
            await io.lln('');
            await pressAKey(io);
        }
    }

    // ─── Kick Member ─────────────────────────────────────────────────────────

    private async kickMember(): Promise<void> {
        const { io, player } = this.ctx;
        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        const pr = buildPlayerIndex(player);

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Kicking someone off of the team');
        await io.lln('`0`L');
        await io.lln('');

        let j = 0;
        for (let i = 0; i < MAX_PLAY && i < pr.length; i++) {
            if (myTeam.member[i]) {
                await io.lln('`0' + pr[i].name);
                j++;
            }

            if (j > 0 && j % 10 === 0) {
                j = 0;
                await io.lln('');
                await io.lw('`2  (`0C`2)ontinue or `2(`0S`2)top `2[`0C`2] `%');
                io.emitPrompt('teamlord_kick_page', [
                    { key: 'C', label: 'Continue' },
                    { key: 'S', label: 'Stop' },
                ]);
                let ch = (await io.getkey()).toUpperCase();
                if (ch !== 'S') ch = 'C';
                if (ch === 'S') break;
            }
        }

        await io.lln('');
        await io.lw('`0Who do you want to kick? ');
        io.emitPrompt('teamlord_kick_name', [], 'line');
        const targetName = await io.getstr({ len: 20 });

        if (targetName === '') return;

        const upperTarget = targetName.toUpperCase().trim();

        let found = false;
        let targetIdx = -1;

        for (let i = 0; i < MAX_PLAY && i < pr.length; i++) {
            if (myTeam.member[i]) {
                if (pr[i].name.toUpperCase().trim().indexOf(upperTarget) !== -1) {
                    await io.lln('');
                    await io.lw('`2  Do you mean `0' + pr[i].name + '`2? `2[`0N`2] `%');
                    io.emitPrompt('teamlord_kick_confirm', [
                        { key: 'Y', label: 'Yes' },
                        { key: 'N', label: 'No' },
                    ]);
                    let ch = (await io.getkey()).toUpperCase();
                    if (ch !== 'Y') ch = 'N';
                    await io.lln(ch);
                    if (ch === 'Y') {
                        targetIdx = i;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found) {
            await io.lln(' `0No matching players.');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        await io.lln('');
        await io.lw('`2  Kick `0' + pr[targetIdx].name + '`2 off of the team? `2[`0N`2] `%');
        io.emitPrompt('teamlord_kick_final', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'Y') ch = 'N';
        await io.lln(ch);
        await io.lln('');

        if (targetIdx === player.Record) {
            await io.lln('`0You can\'t kick yourself off!');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        myTeam.sleep[targetIdx] = false;
        myTeam.member[targetIdx] = false;
        myTeam.put();

        // Update the kicked player's IGM record
        for (let i = 0; i < this.ctx.playerFile.length; i++) {
            const rec = loadPlayerRec(this.ctx.playerFile, i);
            if (rec && rec.recpos === targetIdx) {
                rec.onteam = false;
                rec.teamnum = -1;
                rec.put();
                break;
            }
        }

        // Send mail to kicked player
        const mailContent = [
            '',
            '  `%KICKED OFF THE TEAM!',
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-',
            '  `2You have been kicked off the `0' + myTeam.name + '`2!',
            '',
        ].join('\n');
        this.ctx.storage.sendMail(targetIdx, mailContent);
    }

    // ─── Exit Team ───────────────────────────────────────────────────────────

    private async exitTeam(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        await io.lln('');
        await io.lln('');
        await io.lln(' `2This option allows you to quit your current team.');
        await io.lln('');
        await io.lln('If you are the team leader, doing this will DISBAND the team!');
        await io.lln('');
        await io.lw('`0Are you sure you want to do this? `2[`%N`2] : `%');

        io.emitPrompt('teamlord_exit_team', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'Y') ch = 'N';
        await io.lln(ch);
        await io.lln('');

        if (ch === 'N') return;

        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        if (myTeam.leader === player.Record) {
            this._disbandTeam(myTeam);
        }

        // Update current player
        myTeam.member[player.Record] = false;
        myTeam.sleep[player.Record] = false;
        myTeam.put();

        igmPlay.onteam = false;
        igmPlay.teamnum = -1;
        igmPlay.put();

        this.ctx.myTeam = null;

        await io.lln('`0Done!`2');
        await io.lln('');
        await pressAKey(io);
    }

    private _disbandTeam(myTeam: TeamRecord): void {
        const { player } = this.ctx;

        myTeam.deleted = true;

        for (let i = 0; i < MAX_PLAY; i++) {
            if (i === player.Record) continue;
            if (myTeam.member[i]) {
                myTeam.member[i] = false;
                myTeam.sleep[i] = false;

                for (let p = 0; p < this.ctx.playerFile.length; p++) {
                    const rec = loadPlayerRec(this.ctx.playerFile, p);
                    if (rec && rec.recpos === i) {
                        rec.onteam = false;
                        rec.teamnum = -1;
                        rec.put();
                        break;
                    }
                }

                const mailContent = [
                    '',
                    '  `%Mail From TeamLord',
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-',
                    '  `0' + player.name + ' `2has disbanded the team your were on!',
                    '  `2You are no longer on a team!',
                    '',
                ].join('\n');
                this.ctx.storage.sendMail(i, mailContent);
            }
        }

        myTeam.put();
    }

    // ─── Treasury ────────────────────────────────────────────────────────────

    private async treasury(): Promise<void> {
        const { io, player } = this.ctx;

        this.reloadMyTeam();
        const myTeam = this.ctx.myTeam!;

        let ch: string;
        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`%Team Treasury');
            await io.lln('`0`L');
            await io.lln('');
            await io.lln('');
            await io.lln('`%  Treasury');
            await io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
            await io.lln('`2You walk to the back of the team\'s house, and find the safe.  You spin in the combination, and it pops open.');
            await io.lln('');
            await io.lln('`2(`5D`2)eposit Gold');
            await io.lln('(`5W`2)ithdraw Gold');
            await io.lln('(`5R`2)eturn');
            await io.lln('');
            await io.lln('');
            await io.lln('`2Gold In Hand: `0' + prettyInt(player.gold) +
                '  `2Gold In Safe: `0' + prettyInt(myTeam.treasury));
            await io.lln('');
            await io.lw('`2  Your choice, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_treasury', [
                { key: 'D', label: 'Deposit' },
                { key: 'W', label: 'Withdraw' },
                { key: 'R', label: 'Return' },
            ]);
            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('DWRQ'.indexOf(ch) === -1);
            await io.lln(ch);
            await io.lln('');

            switch (ch) {
                case 'D':
                    await this._treasuryDeposit(myTeam);
                    break;
                case 'W':
                    await this._treasuryWithdraw(myTeam);
                    break;
                case 'R':
                case 'Q':
                    return;
            }
        }
    }

    private async _treasuryDeposit(myTeam: TeamRecord): Promise<void> {
        const { io, player } = this.ctx;

        await io.lw('`2  Deposit how much: ');
        io.emitPrompt('teamlord_treasury_deposit', [], 'number');
        const input = await io.getstr({ len: 14 });
        await io.lln('');
        await io.lln('');

        if (input === '') return;
        const amt = parseInt(input, 10);
        if (isNaN(amt) || amt === 0) return;

        if (amt > player.gold) {
            await io.lln('`0You don\'t have that much gold!`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        if (myTeam.treasury > 2000000000 - amt) {
            await io.lln('`0There\'s not enough room for that much gold!`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        myTeam.treasury += amt;
        player.gold -= amt;
        myTeam.put();
        player.put();

        await io.lln('`0Done!`2');
        await io.lln('');
        await pressAKey(io);
    }

    private async _treasuryWithdraw(myTeam: TeamRecord): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        if (myTeam.treasury < 1) {
            await io.lln('`0Your team doesn\'t have anything to withdraw!`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        await io.lw('`2  Withdraw how much? ');
        io.emitPrompt('teamlord_treasury_withdraw', [], 'number');
        const input = await io.getstr({ len: 14 });
        await io.lln('');
        await io.lln('');

        if (input === '') return;

        const magicNum = calcMagicNum(player.level);

        if (myTeam.leader === player.Record && igmPlay.left === magicNum) {
            if (igmPlay.left <= 2000000000 - igmPlay.left) {
                igmPlay.left += igmPlay.left;
            } else {
                igmPlay.left = 2000000000;
            }
        } else if (igmPlay.left > magicNum) {
            igmPlay.left = magicNum;
        }

        const amt = parseInt(input, 10);
        if (isNaN(amt) || amt === 0) return;

        if (amt > myTeam.treasury) {
            await io.lln('`0Your team doesn\'t have that much gold!`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        if (player.gold > 2000000000 - amt) {
            await io.lln('`0You don\'t have room for that much gold!`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        if (amt <= igmPlay.left) {
            player.gold += amt;
            myTeam.treasury -= amt;
            igmPlay.left -= amt;
            myTeam.put();
            player.put();
            await io.lln('`0Done!`2');
        } else {
            await io.lln('');
            await io.lln('`2Too much!  At your level, you can only take');
            await io.lln('`%' + prettyInt(igmPlay.left) + '`2 gold today!');
            await io.lln('                          `5- `0Team Regulations');
        }

        igmPlay.put();
        await io.lln('');
        await pressAKey(io);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private reloadMyTeam(): void {
        const igmPlay = this.ctx.igmPlay;
        if (igmPlay.onteam && igmPlay.teamnum >= 0) {
            this.ctx.myTeam = loadTeam(this.ctx.teamFile, igmPlay.teamnum);
        }
    }
}

export { TeamLordManagement };
