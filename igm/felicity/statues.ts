/**
 * Felicity's Temple - Statue Room interactions
 * Vindicator (Thief), Faethor (Death Knight), Karadoc (Mage) class events.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';

/** Statue room menu (RIGHT) */
export async function statueRoom(ctx: FelicityBase): Promise<void> {
    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('RIGHT');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('Right Doorway', [
            { key: 'T', label: 'Vindicator' },
            { key: 'W', label: 'Faethor' },
            { key: 'M', label: 'Karadoc' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'T':
                ctx.menuRedisplay = true;
                await vindicator(ctx);
                break;
            case 'W':
                ctx.menuRedisplay = true;
                await faethor(ctx);
                break;
            case 'M':
                ctx.menuRedisplay = true;
                await karadoc(ctx);
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
}

/* ── Vindicator (Thief class skill) ── */

async function vindicator(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.statue_vin) {
        await ctx.io.sln();
        await ctx.io.lln('`2I don\'t think it would be wise to see Vindicator again today.');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('VINDICAT');
        ch = await ctx.commandPrompt('Praying At Vindicator', [
            { key: 'P', label: 'Pray' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    if (ch === 'L') return;

    ctx.rec.statue_vin = true;
    ctx.rec.put();

    // Each statue only responds to its matching class, and only once per day.
    // Vindicator is the thief path.
    if (ctx.player.clss !== 3) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`%Nice Try! But you hafta be A Thief to Pray before Vindicator!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    // Thief event - from EXE strings matching the forest thief event
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You descend to one knee and begin to pray at the Statue of Vindicator the Thief. You drift off into unconscienceness. During your calming meditation you dream meeting the Master Thiefs Guild in the Forest...');
    await ctx.io.sln();
    await ctx.io.mswait(500);
    await ctx.displayMenuInline('THIEF');

    ctx.io.emitPrompt('felicity_thief', [
        { key: 'G', label: 'Give a gem' },
        { key: 'S', label: 'Spit' },
        { key: 'M', label: 'Make apologies' },
    ]);
    const thiefKeys = ['G', 'S', 'M'];
    do {
        ch = (await ctx.io.getkey()).toUpperCase();
    } while (thiefKeys.indexOf(ch) === -1);

    ctx.io.sclrscr();
    await ctx.io.sln();

    switch (ch) {
        case 'G':
            if (ctx.player.gem > 0) {
                await ctx.io.lln('`2You nonchalantly flip them a sparkling Gem. The Thieves look Impressed.');
                await ctx.io.lln('`0"Nice rock! Alright...True to our word, we will instruct you."');
                ctx.gemCheck(-1);
                await ctx.io.sln();
                await ctx.player.raiseClass();
            } else {
                await ctx.io.lln('`2You fumble through your pockets and find that you don\'t possess a gem. You don\'t think it would be wise to pull one on the Master Thieves Guild...');
                await ctx.io.lln('`2You have a reputation to worry about!');
            }
            break;
        case 'S':
            await ctx.io.lln('`2You hawk a goodly sized piece of phlegm into the leader\'s face.');
            await ctx.io.lln('`0"You have spirit! Maybe next time." `2the man laughs.');
            break;
        case 'M':
            await ctx.io.lln('`2You mumble apologies and run away.');
            break;
    }

    await ctx.io.sln();
    await ctx.io.lln('`2You awake thinking that it was all just a dream....but was it???');
    await ctx.io.sln();
    ctx.player.put();
    await ctx.pressAKey();
}

/* ── Faethor (Death Knight class skill) ── */

async function faethor(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.statue_fae) {
        await ctx.io.sln();
        await ctx.io.lln('`2I don\'t think it would be wise to see Faethor again today.');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('FAETHOR');
        ch = await ctx.commandPrompt('Praying At Faethor', [
            { key: 'P', label: 'Pray' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    if (ch === 'L') return;

    ctx.rec.statue_fae = true;
    ctx.rec.put();

    // Faethor is the Death Knight path.
    if (ctx.player.clss !== 1) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`%Nice Try! But you hafta be A Death Knigh to Pray at this Statue!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    // Death Knight dungeon event
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You descend to one knee and begin to pray at the Statue of Faethor the Death Knight. You fall into a deep death-like trance. During your meditation you dream meeting of finding the Death Knight Castle in The Deep Forest....');
    await ctx.io.sln();
    await ctx.io.lln('`%   Event In The Forest');
    await ctx.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
    await ctx.io.lln('`2 While trekking through the forest, you come to the hidden castle of the Black Knights. You are immediately greeted by a score of men in shiny black armour.');
    await ctx.io.sln();
    await ctx.io.lln('`0 "Well met! We have been expecting you. We know you aspire to join us, and become a Death Knight. We will teach you a lesson today, but only if you pass a test of our device.');
    await ctx.io.lln('`2 THEY LEAD YOU TO THE DEATH KNIGHT DUNGEON.');
    await ctx.io.sln();
    await ctx.pressAKey();

    // The dungeon test flips one hidden truth bit: guilty or innocent. The
    // player only sees the consequence after committing to judgment.
    const manIsInnocent = random(2) === 0;

    await ctx.displayMenu('DEATH');
    ctx.io.emitPrompt('felicity_death', [
        { key: '1', label: 'Decapitate' },
        { key: '2', label: 'Release him' },
    ]);
    const deathKeys = ['1', '2'];
    do {
        ch = (await ctx.io.getkey()).toUpperCase();
    } while (deathKeys.indexOf(ch) === -1);

    ctx.io.sclrscr();
    await ctx.io.sln();

    if (ch === '1') {
        await _faethorDecapitate(ctx, manIsInnocent);
    } else {
        await _faethorRelease(ctx, manIsInnocent);
    }

    await ctx.io.sln();
    await ctx.io.lln('`2You awake thinking that it was all a dream....but was it????');
    await ctx.io.sln();
    ctx.player.put();
    await ctx.pressAKey();
}

async function _faethorDecapitate(ctx: FelicityBase, manIsInnocent: boolean): Promise<void> {
    await ctx.io.lln('`2You take the axe and bring it down as hard as you can. After a sickening (but satisfying) crunch the deed is done.');
    await ctx.io.sln();
    await ctx.io.lw('`0You have chosen');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    if (manIsInnocent) {
        await ctx.io.lln('`4POORLY!`0"');
        await ctx.io.lln('`0This man did no crime. He was the father of 6 children "WAS" being the key word here. Perhaps another time."');
    } else {
        await ctx.io.lln('`%WISELY!`0"');
        await ctx.io.lln('`0"You have done this country justice today."');
        await ctx.io.sln();
        await ctx.player.raiseClass();
    }
}

async function _faethorRelease(ctx: FelicityBase, manIsInnocent: boolean): Promise<void> {
    await ctx.io.lln('`%"That man is innocent! You shall not harm a hair on his head, as long as long as I have a breath in me to fight!" `2you shout dramatically.');
    await ctx.io.sln();
    await ctx.io.lw('`0You have chosen');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    await ctx.io.lw('.');
    await ctx.io.mswait(500);
    if (manIsInnocent) {
        await ctx.io.lln('`0"You speak eloquently. your words do not fall upon deaf ears."');
        await ctx.io.lln('`0"We believe you, You are wise today."');
        await ctx.io.sln();
        await ctx.player.raiseClass();
    } else {
        await ctx.io.lln('`0"You are a fool. This man raped 6 women. And you defend him?"');
        await ctx.io.lln('`0"Good god man! Perhaps another time."');
    }
}

/* ── Karadoc (Mage / Mystical class skill) ── */

async function karadoc(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.statue_kar) {
        await ctx.io.sln();
        await ctx.io.lln('`2I don\'t think it would be wise to see Karadoc again today.');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('KARADOC');
        ch = await ctx.commandPrompt('Praying At Karadoc', [
            { key: 'P', label: 'Pray' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    if (ch === 'L') return;

    ctx.rec.statue_kar = true;
    ctx.rec.put();

    // Must be Mage class (2)
    if (ctx.player.clss !== 2) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`%Nice Try! But you hafta be interested in the Mystical skills to');
        await ctx.io.lln('`%Pray here!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    // Mage event - old man number guess
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You descend to one knee and begin to pray at the Statue of Karadoc the mage.  You drift off into unconscienceness. During your calming meditation you dream of and experience the same game you play with the crazy man in the Forest.........');
    await ctx.io.sln();
    await ctx.io.lln('`%   Event In The Forest');
    await ctx.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
    await ctx.io.lln('`2 While trekking through the forest, you come upon a small Hut.');
    await ctx.io.lln('`2 You politely knock on the knotted wooden door.');
    await ctx.io.lln('`2 You are about to leave, when you hear a voice from above.');
    await ctx.io.lln('`0 "Whatcha doin\' down there Sonny?!"  `2you look up and see a wizend old man.');
    await ctx.io.sln();
    await ctx.io.lln('`0 Tell you what! I\'ll give ya a mystical lesson if you can pass my test!" `2the old man giggles.');
    await ctx.io.sln();
    await ctx.io.lln('`%                            ** THE TEST **');
    await ctx.io.lln('`0"All right now! I\'m thinking of a number between 1 and 100. I\'ll');
    await ctx.io.lln('`0 give you six guesses."');
    await ctx.io.lln('`2 The old man leans even further out the window in anticipation');
    await ctx.io.sln();

    const target = random(100) + 1;
    let won = false;

    for (let guess = 1; guess <= 6; guess++) {
        await ctx.io.lw('`2Guess `0' + guess + ' `2: ');
        ctx.io.emitPrompt('felicity_wizard_guess', [], 'number');
        const input = await ctx.io.getstr({ len: 3, c: 1, c1: 15, edit: '', integer: true, min: 1, max: 100 });
        const num = parseInt(input, 10);

        if (isNaN(num) || num < 1 || num > 100) {
            await ctx.io.lln('`0 I *SAID* a number between 0 and 100!!!!');
            continue;
        }

        if (num === target) {
            won = true;
            break;
        } else if (num > target) {
            await ctx.io.lln('`0"The number is lower then that"');
        } else {
            await ctx.io.lln('`0"The number is higher then that!"');
        }
    }

    await ctx.io.sln();
    if (won) {
        await ctx.io.lln('`0That\'s right!  That\'s the number I was thinking of!  You read my mind!"');
        await ctx.io.lln('`2The old man nearly falls from his window in his excitement.');
        await ctx.io.lln('`%                     ** YOU HAVE PASSED THE TEST **');
        await ctx.io.sln();
        await ctx.player.raiseClass();
    } else {
        await ctx.io.lln('`2The old man drops his head and shakes it sadly. You notice small dandruff flakes drifting down from the window `0"No, no, NO! The number was `%' + target + '`0! Geeze! I won\'t teach such an unpromising student!"');
    }

    await ctx.io.sln();
    await ctx.io.lln('`2You awake thinking it was all a dream....but was it????');
    await ctx.io.sln();
    ctx.player.put();
    await ctx.pressAKey();
}
