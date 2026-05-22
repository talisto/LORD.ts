/**
 * Sandtiger's Bar v1.02 - Black Market
 * The old man's shop: stats, looks, dailies, exp/gems, protection, skills,
 * weapons, armor, and forest specialties.
 */
import { prettyInt } from '@lordts/util/Util';
import type { SandBarContext } from './sandbarDefs';
import { SANDBAR_WEAPONS, SANDBAR_ARMOR, pressAKey, canAfford, spendBarCoins, earnBarCoins } from './sandbarDefs';

class SandBarBlackMarket {
    private ctx: SandBarContext;

    constructor(ctx: SandBarContext) {
        this.ctx = ctx;
    }

    async menu(): Promise<void> {
        const { io } = this.ctx;

        io.sclrscr();
        await io.lln('`2You look at the old man, but he seems too tired to say anything.');
        await io.lln('`2He gestures to the list on the table.  It is apparent that you');
        await io.lln('`2must push down one of the lumps.');
        await io.sln();

        await io.lln('      `2[`5C`2]haracter Enhancements       `2[`5L`2]ooks');
        await io.lln('      `2[`5A`2]gain - Deja Vu              `2[`5D`2]ailies');
        await io.lln('      `2[`5E`2]xperience/Gems              `2[`5P`2]rotection');
        await io.lln('      `2[`5S`2]kills                       `2[`5F`2]orest Specialities');
        await io.lln('      `2[`5W`2]eapon Market                `2[`5N`2]ew Armor Market');
        await io.lln('                         `2[`5R`2]eturn to Bar');
        await io.sln();
        // Categories mix permanent upgrades, once-per-day reset switches, and
        // equipment shops. Each branch spends the same BarCoin currency.
        await io.lw('`2The old man looks up at you inquiringly: ');

        io.emitPrompt('sandbar_black_market', [
            { key: 'C', label: 'Character Enhancements' }, { key: 'L', label: 'Looks' },
            { key: 'A', label: 'Again - Deja Vu' }, { key: 'D', label: 'Dailies' },
            { key: 'E', label: 'Experience/Gems' }, { key: 'P', label: 'Protection' },
            { key: 'S', label: 'Skills' }, { key: 'F', label: 'Forest Specialities' },
            { key: 'W', label: 'Weapon Market' }, { key: 'N', label: 'New Armor Market' },
            { key: 'R', label: 'Return to Bar' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('CLADEPSFWNR'.indexOf(ch) === -1);

        switch (ch) {
            case 'C': await this.charEnhancements(); break;
            case 'L': await this.looksMenu(); break;
            case 'A': await this.againMenu(); break;
            case 'D': await this.dailiesMenu(); break;
            case 'E': await this.expGemsMenu(); break;
            case 'P': await this.protectionMenu(); break;
            case 'S': await this.skillsMenu(); break;
            case 'F': await this.forestSpecialties(); break;
            case 'W': await this.weaponMarket(); break;
            case 'N': await this.armorMarket(); break;
            case 'R': break;
        }
    }

    private async charEnhancements(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in General Warez...`0"');
        await io.sln();
        await io.lln(`\`0(\`2H\`0)\`2it points \`5- \`%${prettyInt(config.hpCost)}`);
        await io.lln(`\`0(\`2S\`0)\`2trength   \`5- \`%${prettyInt(config.strCost)}`);
        await io.lln(`\`0(\`2D\`0)\`2efense    \`5- \`%${prettyInt(config.defCost)}`);
        await io.lln(`\`0(\`2C\`0)\`2harm      \`5- \`%${prettyInt(config.chaCost)}`);
        await io.lln('`0(`2R`0)`2eturn to the Bar');
        await io.sln();
        await io.lw('`%The Old Man looks at you expectantly.');

        io.emitPrompt('sandbar_char_enhancements', [
            { key: 'H', label: 'Hit Points' }, { key: 'S', label: 'Strength' },
            { key: 'D', label: 'Defense' }, { key: 'C', label: 'Charm' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('HSDCR'.indexOf(ch) === -1);

        let cost: number;
        let stat: string;
        switch (ch) {
            case 'H': cost = config.hpCost; stat = 'hp'; break;
            case 'S': cost = config.strCost; stat = 'str'; break;
            case 'D': cost = config.defCost; stat = 'def'; break;
            case 'C': cost = config.chaCost; stat = 'cha'; break;
            default: return;
        }

        if (!canAfford(this.ctx, cost)) {
            await io.sln();
            await io.lln('`%The old man looks back at his supply.');
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        const maxBuy = Math.floor(this.ctx.barcoins / cost);
        await io.sln();
        await io.lln(`\`0"\`2You can afford to buy \`#${prettyInt(maxBuy)} \`2of 'em.\`0"`);
        await io.lw('`%How Many? ');
        io.emitPrompt('sandbar_enhance_amount', [], 'number');
        const input = await io.getstr({ len: 10 });
        let amount = parseInt(input, 10);
        if (isNaN(amount) || amount <= 0) return;
        if (amount > maxBuy) amount = maxBuy;

        // Buy in batches, then clamp back to LORD's 32k stat ceilings.
        const totalCost = amount * cost;
        spendBarCoins(this.ctx, totalCost);

        switch (stat) {
            case 'hp':
                player.hp_max += amount;
                player.hp += amount;
                if (player.hp_max > 32000) player.hp_max = 32000;
                if (player.hp > 32000) player.hp = 32000;
                break;
            case 'str':
                player.str += amount;
                if (player.str > 32000) player.str = 32000;
                break;
            case 'def':
                player.def += amount;
                if (player.def > 32000) player.def = 32000;
                break;
            case 'cha':
                player.cha += amount;
                if (player.cha > 32000) player.cha = 32000;
                break;
        }

        await io.lln('`0Sold!');
        await pressAKey(io);
    }

    private async looksMenu(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Changing...`0"');
        await io.sln();
        await io.lln(`\`!(\`$N\`!)\`2ame Change \`5- \`%${prettyInt(config.nameChangeCost)}`);
        await io.lln(`\`!(\`$S\`!)\`2ex Change  \`5- \`%${prettyInt(config.sexChangeCost)}`);
        await io.lln('`!(`$R`!)`2eturn to the Bar');
        await io.sln();

        io.emitPrompt('sandbar_looks', [
            { key: 'N', label: 'Name Change' }, { key: 'S', label: 'Sex Change' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('NSR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const cost = ch === 'N' ? config.nameChangeCost : config.sexChangeCost;

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        if (ch === 'N') {
            await io.lw('`2What would you like to change it to? ');
            io.emitPrompt('sandbar_name_change', [], 'line');
            const newName = await io.getstr({ len: 20 });
            if (newName.length < 2 || newName.length > 20) {
                await io.lln('`2Invalid Length...');
                await pressAKey(io);
                return;
            }
            spendBarCoins(this.ctx, cost);
            player.name = newName;
        } else {
            spendBarCoins(this.ctx, cost);
            player.sex = player.sex === 'M' ? 'F' : 'M';
        }

        await io.lln('`0Done!');
        await pressAKey(io);
    }

    private async againMenu(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in doing things again...`0"');
        await io.sln();
        await io.lln(`\`0(\`2F\`0)\`%lirt Again      \`5- \`2${prettyInt(config.flirtAgainCost)}`);
        await io.lln(`\`0(\`2S\`0)\`%ee Master Again \`5- \`2${prettyInt(config.seeMasterCost)}`);
        await io.lln(`\`0(\`2H\`0)\`%ear Bard Again \`5- \`2${prettyInt(config.hearBardCost)}`);
        await io.lln('`!(`$R`!)`%eturn to the Bar');
        await io.sln();

        io.emitPrompt('sandbar_again', [
            { key: 'F', label: 'Flirt Again' }, { key: 'S', label: 'See Master Again' },
            { key: 'H', label: 'Hear Bard Again' }, { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('FSHR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        let cost: number;
        switch (ch) {
            case 'F': cost = config.flirtAgainCost; break;
            case 'S': cost = config.seeMasterCost; break;
            case 'H': cost = config.hearBardCost; break;
            default: return;
        }

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        // "Again" purchases reset a once-per-day gate so the player may repeat
        // a stock LORD action instead of granting a brand-new reward outright.
        if (ch === 'S' && this.ctx.record.masterResetToday) {
            await io.lln('`2The old man shakes his head. `0"I already fixed that for you today."');
            await pressAKey(io);
            return;
        }

        spendBarCoins(this.ctx, cost);

        switch (ch) {
            case 'F':
                player.flirted = false;
                break;
            case 'S':
                player.seen_master = false;
                this.ctx.record.masterResetToday = true;
                this.ctx.record.put();
                break;
            case 'H':
                player.seen_bard = false;
                break;
        }

        await io.lln('`0Done!');
        await pressAKey(io);
    }

    private async dailiesMenu(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Dailies...');
        await io.sln();
        await io.lln(`\`0(\`2F\`0)\`2orest Fights \`5- \`%${prettyInt(config.forestFightsCost)}`);
        await io.lln(`\`0(\`2U\`0)\`2ser Fights   \`5- \`%${prettyInt(config.userFightsCost)}`);
        await io.sln();
        await io.lln('`%The old man looks back at you.');

        io.emitPrompt('sandbar_dailies', [
            { key: 'F', label: 'Forest Fights' }, { key: 'U', label: 'User Fights' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('FUR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const cost = ch === 'F' ? config.forestFightsCost : config.userFightsCost;

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        const DAILY_FOREST_CAP = 10;
        const DAILY_PVP_CAP = 5;
        const boughtToday = ch === 'F' ? this.ctx.record.forestFightsBoughtToday : this.ctx.record.pvpFightsBoughtToday;
        const dailyCap = ch === 'F' ? DAILY_FOREST_CAP : DAILY_PVP_CAP;
        const canBuyToday = dailyCap - boughtToday;

        if (canBuyToday <= 0) {
            await io.lln('`0"Come back tomorrow!"`2 The old man turns his back on you.');
            await pressAKey(io);
            return;
        }

        const maxBuy = Math.min(Math.floor(this.ctx.barcoins / cost), canBuyToday);
        await io.lln(`\`0"\`2You can afford to buy \`#${prettyInt(maxBuy)} \`2of 'em.\`0"`);
        await io.lw('`%How Many? ');
        io.emitPrompt('sandbar_dailies_amount', [], 'number');
        const input = await io.getstr({ len: 10 });
        let amount = parseInt(input, 10);
        if (isNaN(amount) || amount <= 0) return;
        if (amount > maxBuy) amount = maxBuy;

        spendBarCoins(this.ctx, amount * cost);

        if (ch === 'F') {
            player.forest_fights += amount;
            this.ctx.record.forestFightsBoughtToday += amount;
            this.ctx.io.events?.emitEconomy('purchase', amount, 'forest_fights', {
                source: 'sandbar', barcoins_spent: amount * cost, barcoins_remaining: this.ctx.barcoins,
            });
        } else {
            player.pvp_fights += amount;
            this.ctx.record.pvpFightsBoughtToday += amount;
            this.ctx.io.events?.emitEconomy('purchase', amount, 'pvp_fights', {
                source: 'sandbar', barcoins_spent: amount * cost, barcoins_remaining: this.ctx.barcoins,
            });
        }
        this.ctx.record.put();

        await io.lln('`0Sold!');
        await pressAKey(io);
    }

    private async expGemsMenu(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Experience...');
        await io.sln();
        await io.lln(`\`0(\`2E\`0)\`2xperience \`5- \`%${prettyInt(config.expCost)}`);
        await io.lln(`\`0(\`2G\`0)\`2ems \`5- \`%${prettyInt(config.gemCost)}`);
        await io.sln();

        io.emitPrompt('sandbar_exp_gems', [
            { key: 'E', label: 'Experience' }, { key: 'G', label: 'Gems' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('EGR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const cost = ch === 'E' ? config.expCost : config.gemCost;

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        const maxBuy = Math.floor(this.ctx.barcoins / cost);
        await io.lln(`\`0"\`2You can afford to buy \`#${prettyInt(maxBuy)} \`2of 'em.\`0"`);
        await io.lw('`%How Many? ');
        io.emitPrompt('sandbar_expgem_amount', [], 'number');
        const input = await io.getstr({ len: 10 });
        let amount = parseInt(input, 10);
        if (isNaN(amount) || amount <= 0) return;
        if (amount > maxBuy) amount = maxBuy;

        spendBarCoins(this.ctx, amount * cost);

        if (ch === 'E') {
            player.exp += amount;
            if (player.exp > 2000000000) player.exp = 2000000000;
            this.ctx.io.events?.emitEconomy('purchase', amount, 'experience', {
                source: 'sandbar', barcoins_spent: amount * cost, barcoins_remaining: this.ctx.barcoins,
            });
        } else {
            player.gem += amount;
            if (player.gem > 32000) player.gem = 32000;
            this.ctx.io.events?.emitEconomy('purchase', amount, 'gems', {
                source: 'sandbar', barcoins_spent: amount * cost, barcoins_remaining: this.ctx.barcoins,
            });
        }

        await io.lln('`0Sold!');
        await pressAKey(io);
    }

    private async protectionMenu(): Promise<void> {
        const { io, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Protection...');
        await io.sln();
        await io.lln(`\`0(\`2P\`0)\`2rotection \`5- \`%${prettyInt(config.protectionCost)}`);
        await io.sln();

        if (!canAfford(this.ctx, config.protectionCost)) {
            await io.lln('`2You can\'t afford this.');
            await pressAKey(io);
            return;
        }

        await io.lln('`0"`2You won\'t be able to play again today if you buy this.`0"');
        await io.lw('`2Do it?`% ');

        io.emitPrompt('sandbar_protection', [
            { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('YN'.indexOf(ch) === -1);

        if (ch === 'Y') {
            spendBarCoins(this.ctx, config.protectionCost);
            this.ctx.player.inn = true;
            await io.lln('`0Done!');
        }
        await pressAKey(io);
    }

    private async skillsMenu(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Skills...');
        await io.sln();
        await io.lln(`\`0(\`2S\`0)\`2kill Change \`5- \`%${prettyInt(config.skillChangeCost)}`);
        await io.lln(`\`0(\`2D\`0)\`2eathknights \`5- \`%${prettyInt(config.skillChangeCost)}`);
        await io.lln(`\`0(\`2M\`0)\`2ystical     \`5- \`%${prettyInt(config.skillChangeCost)}`);
        await io.lln(`\`0(\`2T\`0)\`2heiving     \`5- \`%${prettyInt(config.skillChangeCost)}`);
        await io.sln();

        io.emitPrompt('sandbar_skills', [
            { key: 'S', label: 'Skill Change' }, { key: 'D', label: 'Deathknights' },
            { key: 'M', label: 'Mystical' }, { key: 'T', label: 'Thieving' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('SDMTR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        if (!canAfford(this.ctx, config.skillChangeCost)) {
            await io.lln('`2You cannot afford this!');
            await pressAKey(io);
            return;
        }

        if (ch === 'S') {
            await io.lln('`%The Old Man says that you\'ll also get an extra pt for that day.');
            await io.sln();
            await io.lln('`%The old man at you.');
            await io.lw('`2What skill you want?');
            await io.sln();
            await io.lln('`0[`2D`0]`2eathknights');
            await io.lln('`0[`2M`0]`2ystical');
            await io.lln('`0[`2T`0]`2hieving');

            io.emitPrompt('sandbar_skill_change', [
                { key: 'D', label: 'Deathknights' }, { key: 'M', label: 'Mystical' },
                { key: 'T', label: 'Thieving' },
            ]);
            let skill: string;
            do {
                skill = (await io.getkey()).toUpperCase();
            } while ('DMT'.indexOf(skill) === -1);

            ch = skill;
        }

        spendBarCoins(this.ctx, config.skillChangeCost);

        switch (ch) {
            case 'D':
                player.clss = 1;
                player.levelw += 1;
                break;
            case 'M':
                player.clss = 2;
                player.levelm += 1;
                break;
            case 'T':
                player.clss = 3;
                player.levelt += 1;
                break;
        }

        await io.lln('`0Sold!');
        await pressAKey(io);
    }

    private async weaponMarket(): Promise<void> {
        const { io, player } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Weapons...');
        await io.sln();

        const L = player.level;
        const weapCosts = [
            L * L * 5,
            L * L * 15,
            L * L * 30,
            L * L * 60,
            L * L * 120,
            L * L * 200,
        ];

        const keys = 'SDLKJT';
        for (let i = 0; i < SANDBAR_WEAPONS.length; i++) {
            SANDBAR_WEAPONS[i].cost = weapCosts[i];
            await io.lln(`\`0(\`2${keys[i]}\`0)\`2${SANDBAR_WEAPONS[i].name.padEnd(15)} \`5- \`%${prettyInt(weapCosts[i])}`);
        }
        await io.sln();
        await io.lln('`%The Old Man is twiddling his thumbs.');

        io.emitPrompt('sandbar_weapon_market', [
            ...SANDBAR_WEAPONS.map((w, i) => ({ key: keys[i], label: w.name })),
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('SDLKJTR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const idx = keys.indexOf(ch);
        if (idx === -1) return;

        const weapon = SANDBAR_WEAPONS[idx];

        if (!canAfford(this.ctx, weapon.cost)) {
            await io.lln('`2You can\'t afford this!');
            await pressAKey(io);
            return;
        }

        const curWeapon = player.weapon;
        const curWeaponNum = player.weapon_num;
        if (curWeaponNum > 0) {
            const sellPrice = Math.floor(weapon.cost / 2);
            await io.lln(`\`2Will you sell your \`%${curWeapon} \`2for \`$${prettyInt(sellPrice)} \`2barcoins.`);

            io.emitPrompt('sandbar_sell_weapon', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let sell: string;
            do {
                sell = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(sell) === -1);

            if (sell === 'Y') {
                earnBarCoins(this.ctx, sellPrice);
                await io.lln(`\`2Your \`%${curWeapon} \`2just sold for \`$${prettyInt(sellPrice)} \`2barcoins.`);
            }
        }

        spendBarCoins(this.ctx, weapon.cost);
        player.weapon = weapon.name;
        player.weapon_num = weapon.num;

        await io.lln(`\`2${weapon.name} \`2is now in your possession.`);
        await pressAKey(io);
    }

    private async armorMarket(): Promise<void> {
        const { io, player } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Armor...');
        await io.sln();

        const L = player.level;
        const armCosts = [
            L * L * 5,
            L * L * 15,
            L * L * 30,
            L * L * 60,
            L * L * 120,
            L * L * 200,
        ];

        const keys = 'LPWGHF';
        for (let i = 0; i < SANDBAR_ARMOR.length; i++) {
            SANDBAR_ARMOR[i].cost = armCosts[i];
            await io.lln(`\`0(\`2${keys[i]}\`0)\`2${SANDBAR_ARMOR[i].name.padEnd(15)} \`5- \`%${prettyInt(armCosts[i])}`);
        }
        await io.sln();

        io.emitPrompt('sandbar_armor_market', [
            ...SANDBAR_ARMOR.map((a, i) => ({ key: keys[i], label: a.name })),
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('LPWGHFR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const idx = keys.indexOf(ch);
        if (idx === -1) return;

        const armor = SANDBAR_ARMOR[idx];

        if (!canAfford(this.ctx, armor.cost)) {
            await io.lln('`2You can\'t afford this!');
            await pressAKey(io);
            return;
        }

        const curArmor = player.arm;
        const curArmorNum = player.arm_num;
        if (curArmorNum > 0) {
            const sellPrice = Math.floor(armor.cost / 2);
            await io.lln(`\`2Will you sell your \`%${curArmor} \`2for \`$${prettyInt(sellPrice)}`);

            io.emitPrompt('sandbar_sell_armor', [
                { key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' },
            ]);
            let sell: string;
            do {
                sell = (await io.getkey()).toUpperCase();
            } while ('YN'.indexOf(sell) === -1);

            if (sell === 'Y') {
                earnBarCoins(this.ctx, sellPrice);
                await io.lln(`\`2Your \`0${curArmor} \`2just sold for \`$${prettyInt(sellPrice)} \`2gold.`);
            }
        }

        spendBarCoins(this.ctx, armor.cost);
        player.arm = armor.name;
        player.arm_num = armor.num;

        await io.lln(`\`2${armor.name} \`2is now in your possession.`);
        await pressAKey(io);
    }

    private async forestSpecialties(): Promise<void> {
        const { io, player, config } = this.ctx;

        io.sclrscr();
        await io.lln('`0"`2Ahh... You are interested in Forest Specialities...`0"');
        await io.sln();
        await io.lln(`\`0(\`2F\`0)\`%airies       \`5- \`%${prettyInt(config.fairyCost)}`);
        await io.lln(`\`0(\`2H\`0)\`%orsies       \`5- \`%${prettyInt(config.horseCost)}`);
        await io.sln();

        io.emitPrompt('sandbar_forest_spec', [
            { key: 'F', label: 'Fairies' }, { key: 'H', label: 'Horses' },
            { key: 'R', label: 'Return' },
        ]);
        let ch: string;
        do {
            ch = (await io.getkey()).toUpperCase();
        } while ('FHR'.indexOf(ch) === -1);

        if (ch === 'R') return;

        const cost = ch === 'F' ? config.fairyCost : config.horseCost;

        if (!canAfford(this.ctx, cost)) {
            await io.lln('`%The old man waves you away.');
            await pressAKey(io);
            return;
        }

        spendBarCoins(this.ctx, cost);

        if (ch === 'F') {
            player.has_fairy = true;
        } else {
            player.horse = true;
        }

        await io.lln('`0Sold!');
        await pressAKey(io);
    }
}

export { SandBarBlackMarket };
