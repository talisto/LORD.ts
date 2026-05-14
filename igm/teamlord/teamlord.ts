/**
 * TeamLord v2.0 - Main IGM Class
 * Ported from original Pascal source code
 * Original by Joseph Masters / Michael Preslar (Elysium Software)
 *
 * Features:
 * - Team creation and joining
 * - Team treasury with leader perks
 * - Doorguard dragon training and defense
 * - Team vs team attacks and house invasions
 * - Party system (pub, grab, throw party)
 * - Personal banking and healers
 * - Team management (kick, revive, mail, password, disband)
 */
import * as path from 'path';
import { prettyInt } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import {
    MAX_PLAY, TEAM_CREATE_COST,
    TeamLordPlayer_Defs, Team_Defs,
    pressAKey, buildPlayerIndex, loadTeam,
    findOrCreatePlayerRec, calcMagicNum,
} from './teamlordDefs';
import type { TeamLordContext, TeamLordPlayerRecord, TeamRecord } from './teamlordDefs';
import { TeamLordActions } from './teamlordActions';
import { TeamLordManagement } from './teamlordManagement';

class TeamLord {
    private deps: IgmDeps;
    private igmDataDir: string;

    constructor(deps: IgmDeps) {
        this.deps = deps;
        this.igmDataDir = path.join(deps.runtimeDir, 'teamlord') + path.sep;
    }

    static get desc(): string { return '`5T`2eam `5L`2ord'; }

    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDataDir = path.join(deps.runtimeDir, 'teamlord') + path.sep;
        const playerFile = await Promise.resolve(deps.storage.create(igmDataDir + 'teamlord_players.dat', TeamLordPlayer_Defs));
        const pr = buildPlayerIndex(deps.player);

        for (let i = 0; i < playerFile.length; i++) {
            const rec = playerFile.get(i) as unknown as TeamLordPlayerRecord;
            if (!rec) continue;

            // Purge deleted players
            if (rec.recpos >= 0 && rec.recpos < pr.length) {
                if (pr[rec.recpos].real_name === 'X' || pr[rec.recpos].name === 'X') {
                    rec.deleted = true;
                    rec.put();
                    continue;
                }
            }

            rec.deleted = false;

            // Reset withdrawal limit
            rec.left = calcMagicNum(rec.recpos >= 0 && rec.recpos < pr.length
                ? pr[rec.recpos].level : 1);

            // Base 1 invasion/day; Thieves (class 3) get 3 total (stealth advantage)
            rec.invaded = 1;
            if (rec.recpos >= 0 && rec.recpos < pr.length && pr[rec.recpos].clss === 3) {
                rec.invaded += 2;
            }

            // Reset party points
            const level = (rec.recpos >= 0 && rec.recpos < pr.length) ? pr[rec.recpos].level : 1;
            rec.partied = 100 + (5 * level);

            rec.put();
        }
    }

    async run(): Promise<void> {
        const { io, player, state, log, equipment, storage } = this.deps;

        // Initialize record files
        const playerFile = this.deps.storage.create(
            this.igmDataDir + 'teamlord_players.dat', TeamLordPlayer_Defs
        );
        const teamFile = this.deps.storage.create(
            this.igmDataDir + 'teamlord_teams.dat', Team_Defs
        );

        // Load or create per-player IGM record
        const { rec: igmPlay } = findOrCreatePlayerRec(
            playerFile,
            player.real_name,
            player.name,
            player.Record,
        );

        // Update name and recpos in case they changed
        igmPlay.name = player.name;
        igmPlay.recpos = player.Record;
        igmPlay.put();

        // Load team if on one
        let myTeam: TeamRecord | null = null;
        if (igmPlay.onteam && igmPlay.teamnum >= 0) {
            myTeam = loadTeam(teamFile, igmPlay.teamnum);
            if (!myTeam || myTeam.deleted) {
                igmPlay.onteam = false;
                igmPlay.teamnum = -1;
                igmPlay.put();
                myTeam = null;
            }
        } else {
            igmPlay.onteam = false;
            igmPlay.teamnum = -1;
        }

        // Build shared context
        const ctx: TeamLordContext = {
            io,
            player,
            state,
            log,
            equipment,
            storage,
            playerFile,
            teamFile,
            igmPlay,
            myTeam,
            playPos: player.Record,
        };

        const actions = new TeamLordActions(ctx);
        const management = new TeamLordManagement(ctx);

        // Main menu loop
        let ch: string;
        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`>`%Team Options');
            await io.lln('`0`L');
            await io.lln('`2You grow weary of searching the forest alone.  You yearn for company in your adventures -- someone to share the glory with...');
            await io.lln('');

            if (!igmPlay.onteam) {
                await io.lln('  `2(`5J`2)oin Team');
                await io.lln('  `2(`5C`2)reate Team');
            } else {
                await io.lln('  `2(`5A`2)ction Options');
                await io.lln('  `2(`5M`2)anagement Options');
            }
            await io.lln('  `2(`5H`2)ealers');
            await io.lln('  `2(`5B`2)anking');
            await io.lln('  `2(`5V`2)iew Your Stats');
            await io.lln('  `2(`%Q`2)uit to the Realm');
            await io.lln('');
            await io.lw('  `2Your command, `0' + igmPlay.name + '`2?`% ');

            const validKeys = igmPlay.onteam ? 'AMHBVQ' : 'JCHBVQ';
            const menuItems = [];
            if (!igmPlay.onteam) {
                menuItems.push({ key: 'J', label: 'Join Team' });
                menuItems.push({ key: 'C', label: 'Create Team' });
            } else {
                menuItems.push({ key: 'A', label: 'Action Options' });
                menuItems.push({ key: 'M', label: 'Management Options' });
            }
            menuItems.push(
                { key: 'H', label: 'Healers' },
                { key: 'B', label: 'Banking' },
                { key: 'V', label: 'View Your Stats' },
                { key: 'Q', label: 'Quit' },
            );
            io.emitPrompt('teamlord_main', menuItems);

            do {
                ch = (await io.getkey()).toUpperCase();
            } while (validKeys.indexOf(ch) === -1);
            await io.lln(ch);

            switch (ch) {
                case 'A': await actions.actionMenu(); break;
                case 'M': await management.management(); break;
                case 'J':
                    if (!igmPlay.onteam) {
                        await this.joinTeam(ctx);
                    }
                    break;
                case 'C':
                    if (!igmPlay.onteam) {
                        await this.createTeam(ctx);
                    }
                    break;
                case 'B': await this.banking(ctx); break;
                case 'V': await this.viewStats(ctx); break;
                case 'H': await this.healers(ctx); break;
                case 'Q':
                    playerFile.close();
                    teamFile.close();
                    return;
            }
        }
    }

    // ─── Join Team ───────────────────────────────────────────────────────────

    private async joinTeam(ctx: TeamLordContext): Promise<void> {
        const { io, player, teamFile } = ctx;
        const igmPlay = ctx.igmPlay;

        igmPlay.teamnum = -1;
        igmPlay.onteam = false;
        igmPlay.put();

        // Check if any teams exist
        let hasTeams = false;
        for (let i = 0; i < teamFile.length; i++) {
            const team = loadTeam(teamFile, i);
            if (team && !team.deleted) {
                hasTeams = true;
                break;
            }
        }

        if (!hasTeams) {
            await io.lln('');
            await io.lln('`2No teams exist!');
            await pressAKey(io);
            return;
        }

        io.sclrscr();
        await io.lln('`>`%Teams Available');
        await io.lln('');
        await io.lln('');

        const r = await this.selectTeamForJoin(ctx);
        if (r === -1) return;

        const team = loadTeam(teamFile, r);
        if (!team) return;

        await io.lln('');
        await io.lw('`2  Please enter the password for `0' + team.name + '`2: `%');
        io.emitPrompt('teamlord_join_pass', [], 'line');
        const tempstr = await io.getstr({ len: 20 });

        if (tempstr.toUpperCase() === team.pass.toUpperCase()) {
            await io.lln('');
            await io.lln('`2Congratulations!  You\'re now a member of `0' + team.name + '`2!');
            igmPlay.onteam = true;
            igmPlay.teamnum = r;
            igmPlay.put();
            team.sleep[player.Record] = false;
            team.member[player.Record] = true;
            team.put();
            ctx.myTeam = team;
            await pressAKey(io);
        } else {
            await io.lln('');
            await io.lln('`2Sorry - Wrong Password!');
            await pressAKey(io);
        }
    }

    private async selectTeamForJoin(ctx: TeamLordContext): Promise<number> {
        const { io, teamFile } = ctx;

        while (true) {
            let count = 0;
            const teamIndices: number[] = [];

            for (let i = 0; i < teamFile.length; i++) {
                const team = loadTeam(teamFile, i);
                if (!team || team.deleted) continue;
                count++;
                teamIndices.push(i);
                const numStr = String(count).padStart(3, ' ');
                await io.lln('  `#' + numStr + ' `0' + team.name);

                if (count % 20 === 0) {
                    await pressAKey(io);
                    await io.lln('');
                }
            }

            await io.lln('');
            await io.lw('`2  What team would you like to join? (? - List, Blank to Quit)`% ');
            io.emitPrompt('teamlord_join_team', [], 'line');
            const input = await io.getstr({ len: 20 });
            if (input === '') return -1;
            if (input === '?') {
                io.sclrscr();
                continue;
            }

            const num = parseInt(input, 10);
            if (!isNaN(num) && num > 0 && num <= teamIndices.length) {
                return teamIndices[num - 1];
            }
        }
    }

    // ─── Create Team ─────────────────────────────────────────────────────────

    private async createTeam(ctx: TeamLordContext): Promise<void> {
        const { io, player, teamFile } = ctx;
        const igmPlay = ctx.igmPlay;

        if (igmPlay.onteam) {
            await io.lln('');
            await io.lln('`2You\'re already _on_ a team!');
            await pressAKey(io);
            return;
        }

        // Collect existing team names for duplicate check
        const existingNames: string[] = [];
        for (let i = 0; i < teamFile.length; i++) {
            const team = loadTeam(teamFile, i);
            if (team && !team.deleted) {
                existingNames.push(team.name.toUpperCase());
            }
        }

        await io.lln('');
        await io.lw('`2  Costs to start a team are `%50,000 `$gold`2, for the house. [`5N`2]:`% ');
        io.emitPrompt('teamlord_create_cost', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let ch = (await io.getkey()).toUpperCase();
        await io.lln(ch);

        if (ch !== 'Y') return;

        if (player.gold < TEAM_CREATE_COST) {
            await io.lln('');
            await io.lln('`2You don\'t have enough gold!');
            await pressAKey(io);
            return;
        }

        let done = false;
        let teamName = '';
        let teamPass = '';

        while (!done) {
            await io.lln('');
            await io.lw('`2  What will the name of the team be?`% ');
            io.emitPrompt('teamlord_team_name', [], 'line');
            teamName = await io.getstr({ len: 30 });

            if (teamName === '') return;

            // Check for duplicate names
            if (existingNames.indexOf(teamName.toUpperCase()) !== -1) {
                await io.lln('');
                await io.lln('`0' + teamName + ' `2is already the name of an existing team!');
                await io.lln('');
                continue;
            }

            await io.sln();

            await io.lw('`2  What will the password be (8 Letters Max)?`% ');
            io.emitPrompt('teamlord_team_pass', [], 'line');
            teamPass = await io.getstr({ len: 8 });

            await io.lln('');
            await io.lln('`0' + teamName);
            await io.lln('`2' + teamPass);
            await io.lln('');
            await io.lln('');
            await io.lw('`2  Is this correct? [`5N`2]:`% ');
            io.emitPrompt('teamlord_confirm', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            ch = (await io.getkey()).toUpperCase();
            await io.lln(ch);

            if (ch === 'Y') done = true;
        }

        // Find a slot: reuse a deleted slot or create new
        let teamIdx = -1;
        for (let i = 0; i < teamFile.length; i++) {
            const existing = loadTeam(teamFile, i);
            if (existing && existing.deleted) {
                teamIdx = i;
                break;
            }
        }

        let newTeam: TeamRecord;
        if (teamIdx >= 0) {
            newTeam = loadTeam(teamFile, teamIdx)!;
        } else {
            newTeam = teamFile.new() as unknown as TeamRecord;
            teamIdx = teamFile.length - 1;
        }

        newTeam.name = teamName;
        newTeam.pass = teamPass;
        newTeam.treasury = 0;
        newTeam.dgstr = 0;
        newTeam.dgdef = 0;
        newTeam.deleted = false;
        newTeam.leader = player.Record;
        for (let i = 0; i < MAX_PLAY; i++) {
            newTeam.member[i] = false;
            newTeam.sleep[i] = false;
        }
        newTeam.member[player.Record] = true;
        newTeam.put();

        player.gold -= TEAM_CREATE_COST;
        player.put();

        igmPlay.onteam = true;
        igmPlay.teamnum = teamIdx;
        igmPlay.put();

        ctx.myTeam = newTeam;
    }

    // ─── View Stats ──────────────────────────────────────────────────────────

    private async viewStats(ctx: TeamLordContext): Promise<void> {
        const { io, player } = ctx;
        const igmPlay = ctx.igmPlay;

        io.sclrscr();
        await io.lln('`%' + player.name + '`0\'s stats...');
        await io.lln('');
        await io.lln('   `2Experience: `%' + prettyInt(player.exp).padEnd(20) +
            '               `2Charm: `%' + prettyInt(player.cha));
        await io.lln('   `2Level     : `%' + prettyInt(player.level).padEnd(20) +
            '               `2Gems : `%' + prettyInt(player.gem));
        await io.lln('   `2Strength  : `%' + prettyInt(player.str).padEnd(20) +
            '               `2Gold : `%' + prettyInt(player.gold));
        await io.lln('   `2Defense   : `%' + prettyInt(player.def).padEnd(20) +
            '               `2Bank : `%' + prettyInt(player.bank));
        await io.lln('   `2Hit Pt Max: `%' + prettyInt(player.hp_max).padEnd(20) +
            '               `2Lays : `%' + prettyInt(player.laid));
        await io.lln('   `2Won Game  : `%' + prettyInt(player.drag_kills).padEnd(20) +
            '               `2Kills: `%' + prettyInt(player.pvp));
        await io.lln('');
        await io.lln('   `2Armor     : `%' + player.arm.padEnd(20) +
            '               `2Weapon : `%' + player.weapon);
        await io.lln('');
        if (!igmPlay.onteam) {
            await io.lln('                         `0On Team: `%None');
        } else {
            await io.lln('                         `0On Team: `$' + (ctx.myTeam?.name ?? 'None'));
        }
        await pressAKey(io);
    }

    // ─── Healers ─────────────────────────────────────────────────────────────

    private async healers(ctx: TeamLordContext): Promise<void> {
        const { io, player } = ctx;

        io.sclrscr();

        if (player.hp >= player.hp_max) {
            await io.lln('');
            await io.lln('');
            await io.lln('`%Legend of the Red Dragon -`2 Healers');
            await io.lln('`0`L');
            await io.lln('`0"You look fine to us!`0" `2The healers say.');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        await io.lln('');
        await io.lln('');
        await io.lln('`%Legend of the Red Dragon -`2 Healers');
        await io.lln('`0`L');
        await io.lln('`2You enter the smoky healers hut.');
        await io.lln('`5"What is your wish, warrior?"`2 the old healer asks.');
        await io.lln('');
        await io.lln('(`5H`2)eal all possible');
        await io.lln('(`5C`2)ertain amount healed');
        await io.lln('(`5R`2)eturn');
        await io.lln('');
        await io.lln('`2Hitpoints: `0(`%' + prettyInt(player.hp) +
            '`2 out of `%' + prettyInt(player.hp_max) +
            '`0)  `2Gold: `%' + prettyInt(player.gold));
        await io.lln('`2It costs `%' + prettyInt(player.level * 5) +
            ' `2gold to heal `%1 `2hitpoint.');
        await io.lln('');
        await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

        io.emitPrompt('teamlord_healers', [
            { key: 'H', label: 'Heal All' },
            { key: 'C', label: 'Certain Amount' },
            { key: 'R', label: 'Return' },
        ]);

        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('HCR'.indexOf(ch) === -1);
        await io.lln(ch);

        const costPerHp = player.level * 5;

        switch (ch) {
            case 'H': await this._healAll(ctx, costPerHp); break;
            case 'C': await this._healCertainAmount(ctx, costPerHp); break;
        }
    }

    private async _healAll(ctx: TeamLordContext, costPerHp: number): Promise<void> {
        const { io, player } = ctx;

        const num = Math.floor(player.gold / costPerHp);
        let amt = player.hp_max - player.hp;
        if (amt > num) amt = num;
        if (amt * costPerHp > player.gold) {
            amt = Math.floor(player.gold / costPerHp);
        }

        player.hp += amt;
        player.gold -= amt * costPerHp;
        player.put();

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Legend of the Red Dragon -`2 Healers');
        await io.lln('`0`L');
        await io.lln('');
        await io.lln('`%' + prettyInt(amt) + ' `2hit points are healed!');
        await io.lln('');
        await pressAKey(io);
    }

    private async _healCertainAmount(ctx: TeamLordContext, costPerHp: number): Promise<void> {
        const { io, player } = ctx;

        const amt = Math.floor(player.gold / costPerHp);
        let num = player.hp_max - player.hp;
        if (num > amt) num = amt;

        await io.lln('');
        await io.lln('`2You can afford to heal `%' + prettyInt(num) + ' `2hitpoints.');
        await io.lw('`2  AMOUNT:`% ');
        io.emitPrompt('teamlord_heal_amount', [], 'number');
        const input = await io.getstr({ len: String(num).length });

        if (input === '') return;

        const requested = parseInt(input, 10);
        if (isNaN(requested) || requested === 0) return;

        if (requested > num) {
            await io.lln('');
            await io.lln('`0"`2Sorry, but you cannot afford that.`0"`2');
            await io.lln('');
            await pressAKey(io);
            return;
        }

        player.gold -= requested * costPerHp;
        player.hp += requested;
        player.put();

        await io.lln('');
        await io.lln('`0"`2Done!`0"`2');
        await io.lln('');
        await pressAKey(io);
    }

    // ─── Banking ─────────────────────────────────────────────────────────────

    private async banking(ctx: TeamLordContext): Promise<void> {
        const { io, player } = ctx;

        let ch: string;
        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('   `%Legend of the Red Dragon - `2Bank');
            await io.lln('`0`L');
            await io.lln('`2A polite clerk approaches.  `5"Can I help you sir?"');
            await io.lln('');
            await io.lln('`2(`5D`2)eposit Gold');
            await io.lln('(`5W`2)ithdraw Gold');
            await io.lln('(`5R`2)eturn to Main');
            await io.lln('');
            await io.lln('');
            await io.lln('`2Gold In Hand: `0' + prettyInt(player.gold) +
                '  `2Gold In Bank: `0' + prettyInt(player.bank));
            await io.lln('');
            await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_bank', [
                { key: 'D', label: 'Deposit' },
                { key: 'W', label: 'Withdraw' },
                { key: 'R', label: 'Return' },
            ]);

            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('DWRQ'.indexOf(ch) === -1);
            if (ch === '\r') ch = 'R';
            await io.lln(ch);

            switch (ch) {
                case 'D': await this.deposit(ctx); break;
                case 'W': await this.withdraw(ctx); break;
                case 'R':
                case 'Q':
                    return;
            }
        }
    }

    private async deposit(ctx: TeamLordContext): Promise<void> {
        const { io, player } = ctx;

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%  Ye Olde Bank');
        await io.lln('`0`L');
        await io.lln('`2Gold In Hand: `0' + prettyInt(player.gold) +
            '   `2Gold In Bank: `0' + prettyInt(player.bank));
        await io.lln('');
        await io.lln('`2`0"`2How much gold would you like to deposit?`0"`2 (`01 for ALL of it`2)');
        await io.lw('`2  AMOUNT:`% ');
        io.emitPrompt('teamlord_deposit', [], 'number');
        const input = await io.getstr({ len: String(player.gold).length });
        const num = parseInt(input, 10);
        if (isNaN(num) || num === 0) return;

        await io.lln('');

        if (num === 1) {
            if (2000000000 - player.bank >= player.gold) {
                player.bank += player.gold;
                player.gold = 0;
                await io.lln('`0Done!');
            } else {
                await io.lln('`0"`2You don\'t have enough room in your account for that!`0"`2');
            }
        } else {
            if (num > player.gold) {
                await io.lln('`0"`2You don\'t have that much gold!`0"`2');
            } else if (2000000000 - player.bank >= num) {
                player.bank += num;
                player.gold -= num;
                await io.lln('`0Done!');
            } else {
                await io.lln('`0"`2You don\'t have enough room in your account for that!`0"');
            }
        }

        player.put();
        await io.lln('');
        await pressAKey(io);
    }

    private async withdraw(ctx: TeamLordContext): Promise<void> {
        const { io, player } = ctx;

        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%  Ye Olde Bank');
        await io.lln('`0`L');
        await io.lln('`2Gold In Hand: `0' + prettyInt(player.gold) +
            '   `2Gold In Bank: `0' + prettyInt(player.bank));
        await io.lln('');
        await io.lln('`2`0"`2How much gold would you like to withdraw?`0"`2 (`01 for ALL of it`2)');
        await io.lw('`2  AMOUNT:`% ');
        io.emitPrompt('teamlord_withdraw', [], 'number');
        const input = await io.getstr({ len: String(player.bank).length });
        const num = parseInt(input, 10);
        if (isNaN(num) || num === 0) return;
        if (num > player.bank) return;

        await io.lln('');

        if (num === 1) {
            if (2000000000 - player.gold >= player.bank) {
                player.gold += player.bank;
                player.bank = 0;
                await io.lln('`0Done!');
            } else {
                await io.lln('`0"`2You can\'t carry that much gold!`0"`2');
            }
        } else {
            if (2000000000 - player.gold >= num) {
                player.gold += num;
                player.bank -= num;
                await io.lln('`0Done!');
            } else {
                await io.lln('`0"`2You can\'t carry that much gold!`0"`2');
            }
        }

        player.put();
        await io.lln('');
        await pressAKey(io);
    }
}

export default TeamLord;
export { TeamLord };
