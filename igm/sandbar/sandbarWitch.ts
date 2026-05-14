/**
 * Sandtiger's Bar v1.02 - Old Witch
 * Curse other players via the Old Witch.
 */
import { prettyInt } from '@lordts/util/Util';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import type { SandBarContext } from './sandbarDefs';
import { pressAKey, canAfford, spendBarCoins } from './sandbarDefs';

class SandBarWitch {
    private ctx: SandBarContext;

    constructor(ctx: SandBarContext) {
        this.ctx = ctx;
    }

    async oldWitch(): Promise<void> {
        const { io, player, config } = this.ctx;

        // Only one witch purchase per day. The per-day flag lives in the IGM's
        // record so revisiting the bar does not reset the restriction.
        if (this.ctx.record.witchUsed) {
            await io.lln('`%The Old Witch is closed for the day.');
            await pressAKey(io);
            return;
        }

        io.sclrscr();
        await io.lln('`2As you approach the Old Witch, you feel that she would make a');
        await io.lln('`2good match for the man in the black market.');
        await io.sln();
        await io.lln('`2Her eyes burn your forehead.  Looks like you should make a descision.');
        await io.sln();
        await io.lln('         `2(`5C`2)urse');
        await io.lln('         `2(`5M`2)ind Fry');
        await io.lln('         `2(`5D`2)warf');
        await io.lln('         `2(`5A`2)bandonment');
        await io.lln('         `2(`5L`2)eave');
        await io.sln();

        io.emitPrompt('sandbar_witch', [
            { key: 'C', label: 'Curse' }, { key: 'M', label: 'Mind Fry' },
            { key: 'D', label: 'Dwarf' }, { key: 'A', label: 'Abandonment' },
            { key: 'L', label: 'Leave' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('CMDAL'.indexOf(ch) === -1);

        if (ch === 'L') return;

        let cost: number;
        let curseType: string;
        switch (ch) {
            case 'C': cost = config.curseCost; curseType = 'curse'; break;
            case 'M': cost = config.mindFryCost; curseType = 'mindfry'; break;
            case 'D': cost = config.dwarfCost; curseType = 'dwarf'; break;
            case 'A': cost = config.abandonmentCost; curseType = 'abandonment'; break;
            default: return;
        }

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`2You cannot afford this.');
            await pressAKey(io);
            return;
        }

        await io.lln(`\`2This will cost \`$${prettyInt(cost)} \`2BarCoins.`);
        await io.lw('`2Will you do it? `0[`2Y`0/`2n`0] ');

        io.emitPrompt('sandbar_witch_confirm', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let confirm: string;
        do {
            confirm = (await io.getkey()).toUpperCase();
        } while ('YN'.indexOf(confirm) === -1);

        if (confirm !== 'Y') return;

        // Targeting is a partial-name search with per-match confirmation, which
        // mirrors the original slow, manual victim selection flow.
        await io.lw('`2Partial Name? ');
        const partialName = await io.getstr({ len: 20 });
        if (partialName.length === 0) return;

        const allPlayers = player.allPlayers();
        let target: LoadedPlayerRecord | null = null;

        for (const p of allPlayers) {
            if (p.Record === player.Record) continue;
            if (p.name.toLowerCase().includes(partialName.toLowerCase())) {
                await io.lln(`  \`0[\`5Y\`0] ${p.name}`);
                io.emitPrompt('sandbar_witch_target', [
                    { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
                ]);
                let yn: string;
                do {
                    yn = (await io.getkey()).toUpperCase();
                } while ('YN'.indexOf(yn) === -1);
                if (yn === 'Y') {
                    target = p;
                    break;
                }
            }
        }

        if (!target) {
            await io.lln('`2No matching player found.');
            await pressAKey(io);
            return;
        }

        spendBarCoins(this.ctx, cost);
        this.ctx.record.witchUsed = true;
        this.ctx.record.put();

        await io.lln('`2That was a wicked thing... !');

        await this.applyCurse(target, curseType);
        await pressAKey(io);
    }

    private async applyCurse(target: LoadedPlayerRecord, curseType: string): Promise<void> {
        const { log, player } = this.ctx;
        const attackerName = player.name;

        // Curse effects are intentionally asymmetric: some hit combat stats,
        // some hit experience or charm, and all announce the suspected culprit.
        switch (curseType) {
            case 'curse': {
                target.str = Math.max(1, Math.floor(target.str * 0.9));
                target.def = Math.max(1, Math.floor(target.def * 0.9));
                target.put();
                const logMsg = `\`2You have been \`4cursed \`2by the Old Witch in Sandtiger's Bar.\n` +
                    '`#You feel weak....\n' +
                    `\`2Rumor has it that \`%${attackerName} \`2was responsible.`;
                await log.logLine(logMsg);
                break;
            }
            case 'mindfry': {
                const expLoss = Math.floor(target.exp * 0.1);
                target.exp = Math.max(0, target.exp - expLoss);
                target.put();
                const logMsg = `\`2Your \`4mind \`2has been fried by the Old Witch in Sandtiger's Bar.\n` +
                    '`#You feel decimated...\n' +
                    `\`2Rumor has it that \`%${attackerName} \`2was responsible.`;
                await log.logLine(logMsg);
                break;
            }
            case 'dwarf': {
                target.hp = Math.max(1, Math.floor(target.hp * 0.5));
                target.hp_max = Math.max(1, Math.floor(target.hp_max * 0.9));
                target.put();
                const logMsg = `\`2Your \`4body \`2has been dwarfed by the Old Witch in Sandtiger's Bar.\n` +
                    '`#You feel close to dead...\n' +
                    `\`2Rumor has it that \`%${attackerName} \`2was responsible.`;
                await log.logLine(logMsg);
                break;
            }
            case 'abandonment': {
                target.cha = Math.max(0, Math.floor(target.cha * 0.7));
                target.put();
                const logMsg = '`2You feel strangely alone... like everyone is better than you.\n' +
                    `\`2Rumor has it that \`%${attackerName} \`2was responsible.`;
                await log.logLine(logMsg);
                break;
            }
        }
    }
}

export { SandBarWitch };
