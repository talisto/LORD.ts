/**
 * Sandtiger's Bar v1.02 - IGM for LORD
 * Ported from SANDBAR.EXE by Joseph Masters (Sons of Salami Software Group, 1995)
 *
 * Features:
 * - BarCoin currency system (gold→BarCoin exchange on entry, BarCoin→gold on exit)
 * - Gambling table: Blackjack, Elimination, Five Card Draw
 * - Black Market: Buy stats, weapons, armor, skills, forest specialties
 * - Old Witch: Curse other players
 * - Configurable pricing via level-based formulas
 */
import * as path from 'path';
import { random, prettyInt } from '@lordts/util/Util';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import {
    SandBar_Defs, pressAKey, earnBarCoins,
} from './sandbarDefs';
import type { SandBarRecord, SandBarConfig, SandBarContext } from './sandbarDefs';
import { SandBarBlackMarket } from './sandbarBlackMarket';
import { SandBarGambling } from './sandbarGambling';
import { SandBarTalk } from './sandbarTalk';
import { SandBarWitch } from './sandbarWitch';

class SandBar {
    private igmDataDir: string;
    private sandBarFile: IRecordFile | null;
    private sandBarRecord: SandBarRecord | null;
    private ctx: SandBarContext;
    private blackMarketModule: SandBarBlackMarket | null;
    private gamblingModule: SandBarGambling | null;
    private talkModule: SandBarTalk | null;
    private witchModule: SandBarWitch | null;

    constructor(private deps: IgmDeps) {
        this.igmDataDir = path.join(deps.runtimeDir, 'sandbar') + path.sep;
        this.sandBarFile = null;
        this.sandBarRecord = null;
        this.blackMarketModule = null;
        this.gamblingModule = null;
        this.talkModule = null;
        this.witchModule = null;

        // Context is fully initialized in run() after record is loaded
        this.ctx = {
            io: deps.io,
            player: deps.player,
            state: deps.state,
            log: deps.log,
            equipment: deps.equipment,
            storage: deps.storage,
            config: this.buildConfig(),
            record: null as unknown as SandBarRecord,
            file: null as unknown as IRecordFile,
            barcoins: 0,
        };
    }

    static get desc(): string { return '`5S`2andtiger\'s `5B`2ar'; }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDataDir = path.join(deps.runtimeDir, 'sandbar') + path.sep;
        const sf = deps.storage.create(igmDataDir + 'sandbar.dat', SandBar_Defs);
        for (let i = 0; i < sf.length; i++) {
            const rec = sf.get(i) as unknown as SandBarRecord;
            if (rec.day !== deps.state.days) {
                rec.day = deps.state.days;
                rec.visits = 0;
                rec.witchUsed = false;
                rec.put();
            }
        }
    }

    async run(): Promise<void> {
        this.initRecord();
        this.ctx.barcoins = this.record.barcoins;
        this.ctx.record = this.record;
        this.ctx.file = this.file;

        this.blackMarketModule = new SandBarBlackMarket(this.ctx);
        this.gamblingModule = new SandBarGambling(this.ctx);
        this.talkModule = new SandBarTalk(this.ctx);
        this.witchModule = new SandBarWitch(this.ctx);

        const { io, player } = this.ctx;

        // Check daily visits
        // maxVisitsPerDay=0 means "use player's remaining forest fights as the limit"
        const maxVisits = this.ctx.config.maxVisitsPerDay === 0
            ? player.forest_fights
            : this.ctx.config.maxVisitsPerDay;

        if (this.record.visits >= maxVisits) {
            io.sclrscr();
            await io.lln('`2You feel too tired to make the journey.');
            await pressAKey(io);
            this.saveAndExit();
            return;
        }

        this.record.visits++;
        this.record.put();

        // Random sickness event (1 in 20 chance)
        if (random(20) === 0 && player.hp < player.hp_max) {
            io.sclrscr();
            await io.lln('`2As you walk along the path to Sandtiger\'s Bar, you can feel your head pounding.  As you stop to take a breather, you have a coughing fit.  Maybe you should visit a healer.');
            await pressAKey(io);
            this.saveAndExit();
            return;
        }

        io.sclrscr();
        await io.lln('`2You stumble down the path to Sandtiger\'s bar.');
        await io.sln();

        io.events?.emitNavigation('enter', 'sandbar');

        // Flavor text
        if (random(2) === 0) {
            await io.lln('`2You see Sandtiger himself give a bearhug to one of his waitresses and drag her upstairs.');
        } else {
            await io.lln('`2As you straighten yourself at the front step, a woman pops out of nowhere.');
        }
        await io.sln();

        // Gold to BarCoin exchange
        await this.exchangeGoldForBarCoins();

        // Main bar menu
        await this.barMenu();

        this.saveAndExit();
    }

    // ─── Record Management ───────────────────────────────────────────────────

    private get file(): IRecordFile {
        if (!this.sandBarFile) throw new Error('SandBar file not initialized');
        return this.sandBarFile;
    }

    private get record(): SandBarRecord {
        if (!this.sandBarRecord) throw new Error('SandBar record not initialized');
        return this.sandBarRecord;
    }

    private initRecord(): void {
        this.sandBarFile = this.deps.storage.create(
            this.igmDataDir + 'sandbar.dat', SandBar_Defs
        );

        let found = false;
        for (let i = 0; i < this.file.length; i++) {
            const rec = this.file.get(i) as unknown as SandBarRecord;
            if (rec.lrdrecord === this.deps.player.Record) {
                this.sandBarRecord = rec;
                found = true;
                break;
            }
        }

        if (!found) {
            this.sandBarRecord = this.file.new() as unknown as SandBarRecord;
            this.sandBarRecord.lrdrecord = this.deps.player.Record;
            this.sandBarRecord.day = this.deps.state.days;
            this.sandBarRecord.put();
        }

        if (this.record.day !== this.deps.state.days) {
            this.record.day = this.deps.state.days;
            this.record.visits = 0;
            this.record.witchUsed = false;
            this.record.masterResetToday = false;
            this.record.forestFightsBoughtToday = 0;
            this.record.pvpFightsBoughtToday = 0;
            this.record.put();
        }
    }

    private saveAndExit(): void {
        this.ctx.io.events?.emitNavigation('leave', 'sandbar');
        this.record.barcoins = this.ctx.barcoins;
        this.record.put();
        this.deps.player.put();
        this.file.close();
    }

    // ─── Configuration ───────────────────────────────────────────────────────

    private buildConfig(): SandBarConfig {
        const L = Math.max(this.deps.player.level, 1);
        // Pricing scales polynomially with player level (L):
        //   Stat boosts: O(L^2), Consumables/resets: O(L^3), Permanent upgrades: O(L^4)
        return {
            maxVisitsPerDay: 0,
            barCoinExchangeRate: L * L * L * L * 100,
            hpCost: L * L * 10,
            strCost: L * L * 15,
            defCost: L * L * 15,
            chaCost: L * L * 8,
            nameChangeCost: L * L * L * 50,
            sexChangeCost: L * L * L * 50,
            flirtAgainCost: L * L * L * 20,
            seeMasterCost: L * L * L * 30,
            hearBardCost: L * L * L * 20,
            forestFightsCost: L * L * L * 40,
            userFightsCost: L * L * L * 30,
            expCost: L * L * L * 25,
            gemCost: L * L * L * 35,
            protectionCost: L * L * L * L * 100,
            skillChangeCost: L * L * L * 60,
            classChangeCost: L * L * L * L * 700,
            curseCost: L * L * 20,
            mindFryCost: L * L * 30,
            dwarfCost: L * L * 40,
            abandonmentCost: L * L * 25,
            fairyCost: L * L * L * L * 500,
            horseCost: L * L * L * L * 1000,
        };
    }

    // ─── Gold / BarCoin Exchange ─────────────────────────────────────────────

    private async exchangeGoldForBarCoins(): Promise<void> {
        const { io, player, config } = this.ctx;

        if (player.gold <= 0) {
            await io.lln('`2You got no cash kid!');
            await pressAKey(io);
            return;
        }

        await io.lln('`2Pssssst!  Mister!');
        await io.lln('`0Those gold pieces won\'t do you any good in Sandtiger\'s bar!');
        await io.lln('`0He\'ll throw you out if he sees you with any -- Turgon\'s gold, he says.');
        await io.sln();

        const rate = config.barCoinExchangeRate;
        const maxCoins = Math.floor(player.gold / rate);

        if (maxCoins < 1) {
            await io.lln('`2You can\'t afford any BarCoins.');
            await pressAKey(io);
            return;
        }

        await io.lln(`\`2I'll give you one BarCoin for every \`$${prettyInt(rate)} \`2of gold.`);
        await io.lln(`\`2You can afford \`$${prettyInt(maxCoins)} \`2BarCoins.`);
        await io.sln();

        let amount: number;
        do {
            await io.lw('`0How many you want, pal?  ');
            io.emitPrompt('sandbar_coin_trade', [], 'number');
            const input = await io.getstr({ len: 14 });
            amount = parseInt(input, 10);
            if (isNaN(amount)) amount = 0;
        } while (amount < 0 || amount > maxCoins);

        if (amount > 0) {
            const goldCost = amount * rate;
            player.gold -= goldCost;
            if (player.gold < 0) player.gold = 0;
            earnBarCoins(this.ctx, amount);
            io.events?.emitEconomy('purchase', amount, 'barcoins', {
                source: 'sandbar', gold_spent: goldCost, barcoins_total: this.ctx.barcoins,
            });

            await io.lln(`\`2OK, mister.  You're down to \`$${prettyInt(player.gold)} \`2gold.`);
        }
        await pressAKey(io);
    }

    private async exchangeBarCoinsForGold(): Promise<void> {
        const { io, player, config } = this.ctx;

        if (this.ctx.barcoins <= 0) return;

        io.sclrscr();
        await io.lln('`2On your way out, you stop at the exchange table.');
        await io.sln();

        const rate = config.barCoinExchangeRate;
        const goldBack = this.ctx.barcoins * rate;
        player.gold += goldBack;
        // Cap at 2B: original Pascal signed 32-bit longint max
        if (player.gold > 2000000000) player.gold = 2000000000;

        await io.lln(`\`2You get \`0${prettyInt(goldBack)} \`2gold with the exchange woman`);
        this.ctx.barcoins = 0;
        await pressAKey(io);
    }

    // ─── Main Bar Menu ───────────────────────────────────────────────────────

    private async barMenu(): Promise<void> {
        const { io, player } = this.ctx;
        let done = false;

        while (!done) {
            if (this.ctx.barcoins < 0) this.ctx.barcoins = 0;

            io.sclrscr();
            await io.lln('  `2The air in Sandtiger\'s bar stinks of opium and cigars.');
            await io.lln('  `2The whole place is incredibly crowded, you\'ll have to dig your way through.');
            await io.sln();
            await io.lln('          `0(`#H`0)`2it the gambling table');
            await io.lln('          `0(`#T`0)`2alk to Sandtiger');
            await io.lln('          `0(`#B`0)`2lack Market');
            await io.lln('          `0(`#O`0)`2ld Witch');
            await io.lln('          `0(`#L`0)`2eave the bar');
            await io.sln();
            await io.lln(`\`2  You have \`0${prettyInt(this.ctx.barcoins)} \`2BarCoins.`);
            await io.lw(`\`2  Your Move, \`0${player.name}\`2 > `);

            io.emitPrompt('sandbar_bar_menu', [
                { key: 'H', label: 'Gambling Table' },
                { key: 'T', label: 'Talk to Sandtiger' },
                { key: 'B', label: 'Black Market' },
                { key: 'O', label: 'Old Witch' },
                { key: 'L', label: 'Leave' },
            ]);
            let ch: string;
            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('HTBOL'.indexOf(ch) === -1);

            switch (ch) {
                case 'H':
                    await this.gamblingModule!.gamblingTable();
                    break;
                case 'T':
                    await this.talkToSandtiger();
                    break;
                case 'B':
                    await this.blackMarketModule!.menu();
                    break;
                case 'O':
                    await this.witchModule!.oldWitch();
                    break;
                case 'L':
                    await this.exchangeBarCoinsForGold();
                    done = true;
                    break;
            }
        }
    }

    private async talkToSandtiger(): Promise<void> {
        await this.talkModule!.talkToSandtiger();
    }
}

export { SandBar };
export default SandBar;
