/**
 * Felicity's Temple - Praying at the Statue
 * Six prayer types with 30/30/40 positive/neutral/negative distribution.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';

/** Prayer room menu loop */
export async function prayerRoom(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.prayed) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You have already Prayed at `%Felicity\'s `2Statue today!!!');
        await ctx.io.lln('`2Come back tomorrow for another Prayer.');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('PRAY');
        ch = await ctx.commandPrompt('At Felicity\'s Statue', [
            { key: 'S', label: 'Pray for Defence' },
            { key: 'V', label: 'Pray for Strength' },
            { key: 'L', label: 'Pray for Life' },
            { key: '!', label: 'Pray for Gold' },
            { key: 'G', label: 'Pray for Gems' },
            { key: 'C', label: 'Pray for Charm' },
            { key: 'N', label: "Don't pray" },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
    } while (ch === '?');

    if (ch === 'N') {
        await ctx.io.lln('`2You decide not to Pray at the moment.');
        return;
    }

    ctx.rec.prayed = true;
    ctx.rec.put();

    await ctx.io.sln();
    await ctx.io.lln('`2You kneel before the Statue of `%Felicity `2and begin to Pray....');
    await ctx.io.sln();

    // Roll: random(10)+1 → 1-10. 1-3=positive(30%), 4-6=neutral(30%), 7-10=negative(40%)
    const roll = random(10) + 1;
    const positive = roll < 4;
    const neutral = roll >= 4 && roll < 7;
    const negative = roll > 6;

    switch (ch) {
        case 'S': await prayDefence(ctx, positive, neutral, negative); break;
        case 'V': await prayStrength(ctx, positive, neutral, negative); break;
        case 'L': await prayLife(ctx, positive, neutral, negative); break;
        case '!': await prayChild(ctx, positive, neutral, negative); break;
        case 'G': await prayGems(ctx, positive, neutral, negative); break;
        case 'C': await prayCharm(ctx, positive, neutral, negative); break;
    }

    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Pray for Defence (Song) */
async function prayDefence(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with more Vitality..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! `%YOU GAIN 10 DEFENCE!!!');
        ctx.defCheck(10);
    } else if (negative) {
        if (ctx.player.def < 31) {
            await ctx.io.lln('`%Felicity `4strikes you down with RAGE!!!!');
            await ctx.io.lln('`4YOUR HIT POINTS PLUMMET!!!');
            ctx.hpWayDown();
        } else {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE 10 DEFENCE!!!');
            ctx.defCheck(-10);
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}

/** Pray for Strength (Verse) */
async function prayStrength(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with more Strength..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! `%YOU GAIN 10 STRENGTH!!!');
        ctx.strCheck(10);
    } else if (negative) {
        if (ctx.player.str < 16) {
            await ctx.io.lln('`%Felicity `4strikes you down with RAGE!!!!');
            await ctx.io.lln('`4YOUR HIT POINTS PLUMMET!!!');
            ctx.hpWayDown();
        } else {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE 10 STRENGTH!!!');
            ctx.strCheck(-10);
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}

/** Pray for Life (Hit Points) */
async function prayLife(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with more Life..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! `%YOU GAIN 10 MAX HIT POINTS!!!');
        ctx.hitMaxCheck(10);
    } else if (negative) {
        if (ctx.player.hp_max > 30) {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE 10 MAX HIT POINTS!!!');
            ctx.hitMaxCheck(-10);
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}

/** Pray for a Child */
async function prayChild(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with a child..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! A child appears at your feet!!');
        await ctx.io.lln('`%YOU NOW HAVE ANOTHER KID!!!');
        ctx.player.kids += 1;
    } else if (negative) {
        if (ctx.player.kids >= 2) {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE A CHILD!!!');
            ctx.player.kids -= 1;
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}

/** Pray for Gems (Grace) */
async function prayGems(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with precious Gems..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! `%YOU GAIN 20 GEMS!!!');
        ctx.gemCheck(20);
    } else if (negative) {
        if (ctx.player.gem >= 11) {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE 10 GEMS!!!');
            ctx.gemCheck(-10);
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}

/** Pray for Charm (Chant) */
async function prayCharm(ctx: FelicityBase, positive: boolean, _neutral: boolean, negative: boolean): Promise<void> {
    await ctx.io.lln('`2You Pray `0"O\' `%Felicity `0please bless me with more Charm..."');
    await ctx.io.sln();
    await ctx.pressAKey(true);
    if (positive) {
        await ctx.io.lln('`%Felicity `2Smiles upon you!!! `%YOU GAIN 10 CHARM!!!');
        ctx.charmCheck(10);
    } else if (negative) {
        if (ctx.player.cha >= 2) {
            await ctx.io.lln('`%Felicity `2frowns upon your existance!!!!');
            await ctx.io.lln('`4YOU LOSE 10 CHARM!!!');
            ctx.charmCheck(-10);
        }
    } else {
        await ctx.io.lln('`%Felicity `2does not seem to be listening right now....');
    }
}
