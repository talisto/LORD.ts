/**
 * Felicity's Temple - Fountain interactions
 * Colored water gives small stat boosts.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';

async function _drinkRedWater(ctx: FelicityBase): Promise<void> {
    ctx.rec.fountain = true;
    ctx.rec.put();
    if (random(10) < 8) {
        await ctx.io.lln('`2You take a sip of the `@RED `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.lln('`2You feel a wierd tingling in your stomach and...');
        await ctx.io.sln();
        await ctx.io.mswait(500);
        await ctx.io.lln('`%GAIN 1 STRENGTH!!!!!');
        await ctx.io.lln('`2You stand up satisfied.');
        ctx.strCheck(1);
    } else {
        await ctx.io.lln('`2You take a sip of the `@RED `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.mswait(500);
        await ctx.io.lln('`2the feeling fades....must of been indigestion!');
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _drinkGreenWater(ctx: FelicityBase): Promise<void> {
    ctx.rec.fountain = true;
    ctx.rec.put();
    if (random(10) < 8) {
        await ctx.io.lln('`2You take a sip of the `0GREEN `2water, and find that it\'s quite sweet.');
        await ctx.io.sln();
        await ctx.io.mswait(500);
        await ctx.io.lln('`%GAIN 1 DEFENCE!!!!!');
        ctx.defCheck(1);
    } else {
        await ctx.io.lln('`2You take a sip of the `0GREEN `2water, and find that it\'s quite sweet.');
        await ctx.io.mswait(500);
        await ctx.io.lln('`2the feeling fades....must of been indigestion!');
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _drinkBlueWater(ctx: FelicityBase): Promise<void> {
    ctx.rec.fountain = true;
    ctx.rec.put();
    if (random(10) < 8) {
        await ctx.io.lln('`2You take a sip of the `9BLUE `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.sln();
        await ctx.io.mswait(500);
        await ctx.io.lln('`%GAIN 1 HIT POINT!!!!!');
        ctx.hitMaxCheck(1);
    } else {
        await ctx.io.lln('`2You take a sip of the `9BLUE `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.mswait(500);
        await ctx.io.lln('`2the feeling fades....must of been indigestion!');
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _drinkWhiteWater(ctx: FelicityBase): Promise<void> {
    ctx.rec.fountain = true;
    ctx.rec.put();
    if (random(10) < 8) {
        await ctx.io.lln('`2You take a sip of the `%WHITE `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.sln();
        await ctx.io.mswait(500);
        await ctx.io.lln('`%GAIN 1 CHARM!!!!!');
        ctx.charmCheck(1);
    } else {
        await ctx.io.lln('`2You take a sip of the `%WHITE `2water, and find that it\'s acctually quite sweet.');
        await ctx.io.mswait(500);
        await ctx.io.lln('`2the feeling fades....must of been indigestion!');
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Fountain area - once per day */
export async function fountain(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.fountain) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You fear that drinking too much of this water may cause indigestion,');
        await ctx.io.lln('`2so you stop yourself from taking a drink.');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('FOUNTAIN');
            ctx.menuRedisplay = false;
        }

        const ch = await ctx.commandPrompt('At The Great Fountain', [
            { key: 'B', label: 'Drink Blue water' },
            { key: 'G', label: 'Drink Green water' },
            { key: 'R', label: 'Drink Red water' },
            { key: 'W', label: 'Drink White water' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: "Don't drink" },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();

        switch (ch) {
            case 'R':
                ctx.menuRedisplay = true;
                await _drinkRedWater(ctx);
                done = true;
                break;
            case 'G':
                ctx.menuRedisplay = true;
                await _drinkGreenWater(ctx);
                done = true;
                break;
            case 'B':
                ctx.menuRedisplay = true;
                await _drinkBlueWater(ctx);
                done = true;
                break;
            case 'W':
                ctx.menuRedisplay = true;
                await _drinkWhiteWater(ctx);
                done = true;
                break;
            case 'V':
                ctx.menuRedisplay = true;
                await ctx.io.showStats();
                break;
            case 'L':
                done = true;
                ctx.menuRedisplay = true;
                break;
            case '?':
                ctx.menuRedisplay = true;
                break;
        }
    } while (!done);

    // Secret bonus: 12.5% chance AFTER drinking (fountain flag must be set).
    // Grants +1 to ALL four stats - stacks with the chosen color's bonus.
    if (ctx.rec.fountain && random(8) === 0) {
        await ctx.io.sln();
        await ctx.io.lln('`2You notice a small puddle that has formed behind the fountain.');
        await ctx.io.lln('`2This puddle is a mixture of all the other colors. being the adventurer you claim to be, you bend down and try this Multicolored water....');
        await ctx.io.sln();
        await ctx.io.mswait(500);
        await ctx.io.lln('`%YOU GAIN 1 STRENGTH!!!!!');
        await ctx.io.lln('`%         1 DEFENSE!!!!!!');
        await ctx.io.lln('`%         1 HITPOINT!!!!');
        await ctx.io.lln('`%     AND 1 CHARM!!!!!!!!');
        ctx.strCheck(1);
        ctx.defCheck(1);
        ctx.hitMaxCheck(1);
        ctx.charmCheck(1);
        ctx.player.put();
        await ctx.io.sln();
        await ctx.pressAKey();
    }
}
