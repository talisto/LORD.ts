/**
 * Felicity's Temple - Temple interior interactions
 * Talking to Felicity, Akasha, Turin, and the passage area.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';

/** Talk to Felicity (TALKFEL menu) - once per day */
export async function talkFelicity(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.talked_fel) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You think that you better not disturb Felicity again. Try Tomorrow!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('TALKFEL');
        ch = await ctx.commandPrompt('Talking To Felicity', [
            { key: 'K', label: 'Kiss her ring' },
            { key: 'A', label: 'Ask for a blessing' },
            { key: '!', label: 'Kiss Felicity' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    ctx.rec.talked_fel = true;
    ctx.rec.put();

    switch (ch) {
        case 'K': await kissRing(ctx); break;
        case 'A': await askBlessing(ctx); break;
        case '!': await kissFelicity(ctx); break;
        case 'L': break;
    }
}

async function kissRing(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You lean over and plant a firm kiss on her ring...');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 She stares at you.... Her eyes close...');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 Something strange is happening......');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 Glowing energy surrounds you....');
    await ctx.io.mswait(500);
    await ctx.io.sln();

    // Two equally weighted ring outcomes: lose defense or gain strength.
    const rand = random(2);
    if (rand === 0) {
        await ctx.io.lln('`2You feel.......');
        await ctx.io.mswait(500);
        await ctx.io.sln();
        await ctx.io.lln('`2Sucked of strength!? You look at Felicity and she just grins at you.');
        await ctx.io.lln('`0"Sorry, I was hungry." `2says Felicity calmly.');
        await ctx.io.sln();
        await ctx.io.lln('`4YOU LOSE 10 DEFENSE!');
        if (ctx.player.def < 29) {
            ctx.player.def = 20;
        } else {
            ctx.player.def -= 10;
        }
    } else {
        await ctx.io.lln('`2You feel.......');
        await ctx.io.mswait(500);
        await ctx.io.sln();
        await ctx.io.lln('`%ENERGISED!! `2 You thank Felicity.');
        await ctx.io.lln('`%YOU GAIN 10 STRENGTH POINTS!!');
        ctx.strCheck(10);
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function askBlessing(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You ask Felicity for a blessing...');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 She nods her head in acknoledgement..Her eyes close...');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 She starts mumbling some weird chant.');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 Glowing energy surrounds you....and you pass out.');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 Upon waking you notice that....');
    await ctx.io.mswait(500);
    await ctx.io.sln();

    // Blessings intentionally include two no-op results, so getting an audience
    // with Felicity is helpful on average but not guaranteed to pay off.
    const rand = random(6);
    switch (rand) {
        case 0:
            await ctx.io.lln('`%YOU NOW HAVE 5 MORE GEMS IN YOUR POCKET!!!');
            await ctx.io.lln('`2You bow to Felicty, and continue on your way.');
            ctx.gemCheck(5);
            break;
        case 1:
            await ctx.io.lln('`2You now have a faint buzzing coming from your front pocket of your Tunic');
            await ctx.io.lln('`%YOU NOW HAVE A FAIRY IN YOUR POCKET!!!');
            await ctx.io.lln('`2You bow to Felicity and continue on your way.');
            ctx.player.has_fairy = true;
            break;
        case 2:
            await ctx.io.lln('`2You feel richer. After counting your gold you find that `%YOU HAVE `%              50000 MORE GOLD!!');
            await ctx.io.lln('`2You bow to Felicity and continue on your way.');
            ctx.goldCheck(50000);
            break;
        case 3:
            await ctx.io.lln('`2You feel better...`%YOU ARE TOTALLY HEALED!');
            ctx.player.hp = ctx.player.hp_max;
            break;
        case 4:
            await ctx.io.lln('`2You are the same as before.');
            await ctx.io.lln('`2Nothing has been changed.');
            break;
        case 5:
            await ctx.io.lln('`2You are the same as before.');
            await ctx.io.lln('`2Nothing has been changed.');
            break;
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function kissFelicity(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You look at Felicity, and your hormones rage!');
    await ctx.io.lln('`2 Your hands grab for her, pulling her close. Heart pounding wildly, you fling yourself upon her. She looks at you in in surprise as you kiss her fully on the lips...');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 As you remove yourself from her, her eyes widen.');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 Before you can say anything...');
    await ctx.io.sln();
    await ctx.io.mswait(500);
    await ctx.pressAKey();

    // This branch is a pure gamble: three punishments and two rewards.
    const rand = random(5);
    switch (rand) {
        case 0:
            // Vindicator catches you
            await ctx.io.lln('`0"WHAT ARE YOU DOING WITH FELICITY!????", `2says Vindicator in rage.');
            await ctx.io.lln('`2Fearing for your life you try to run away, but Vindicator catches you and beats the crap out of you.....`%OWCH!');
            await ctx.io.sln();
            await ctx.io.lln('`2You get up bloody and notice that `4YOUR HIT POINTS ARE WAY DOWN `2and `4VINDICATOR TOOK ALL THE GOLD YOU HAD!');
            ctx.hpWayDown();
            ctx.player.gold = 1;
            break;
        case 1:
            // Karadoc sees
            await ctx.io.lln('`2You notice that the Mage Karadoc saw it all! You turn around and are met with a bright white light coming from his hands. Karadoc just smiles and walks away.');
            await ctx.io.sln();
            await ctx.io.lln('`2You get up and seem to forget all about the skills you have learned....');
            await ctx.io.lln('`4LOSE ALL USE POINTS FOR THE DAY!!!');
            ctx.player.levelw = 0;
            ctx.player.levelm = 0;
            ctx.player.levelt = 0;
            break;
        case 2:
            await _kissFelicityFaethor(ctx);
            break;
        case 3:
            // Felicity likes it - 15 gems
            await ctx.io.lln('`2Felicity just stands there flushed with a surprised look on her face.');
            await ctx.io.lln('`2You expect her to be mad, but instead she smiles. `0"WOW! My three `0Ex-Husbands put together couldn\'t make me feel this way after one `0kiss!  Here take these Gems....I think I need to go nap now."');
            await ctx.io.sln();
            await ctx.io.lln('`2You head back smiling....`%FELICITY GAVE YOU 15 GEMS!!!');
            ctx.gemCheck(15);
            break;
        case 4:
            // Felicity loves it - doubles gold
            await ctx.io.lln('`2Felicity grabs you and kisses you again! `0"By Torak, you are the `0best kisser in the whole Realm! Here let me double your gold, it\'s `0the least I could give you for a kiss like that!"');
            await ctx.io.sln();
            await ctx.io.lln('`2You leave proud....`%FELICITY DOUBLED YOUR GOLD ON HAND!!!');
            ctx.goldCheck(ctx.player.gold); // double by adding current amount
            break;
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function _kissFelicityFaethor(ctx: FelicityBase): Promise<void> {
    await ctx.io.lln('`2You hear footsteps. You turn around just in time to see Faethor\'s fist before it hits you square in the nose. He has a look of Rage on his face.');
    await ctx.io.lln('`2He continues to hit and beat you till you can barely move.....');
    await ctx.io.sln();
    if (ctx.player.horse) {
        await ctx.io.lln('`2Just before Faethor leaves, you see him pull out a Death Crystal and throw it at your horse. `4YOUR HORSE IS VAPORIZED!');
        ctx.player.horse = false;
    }
    await ctx.io.lln('`2You drift into Unconscieness to the tune of Feathor\'s laughter.');
    await ctx.io.lln('`2You regain conscienceness to find that you can hardly move.....');
    await ctx.io.lln('`4YOUR HIT POINTS ARE WAY DOWN!');
    ctx.hpWayDown();
}

/** Talk to Akasha (FEL menu → A → AKASHA menu) - once per day */
export async function talkAkasha(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.talked_akasha) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2You think that you better not disturb Akasha again. Try Tomorrow!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    let ch: string;
    do {
        await ctx.displayMenu('AKASHA');
        ch = await ctx.commandPrompt('Talking To Akasha', [
            { key: 'K', label: 'Ask for a kiss' },
            { key: 'B', label: 'Ask her to bite you' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    if (ch === 'L') return;

    ctx.rec.talked_akasha = true;
    ctx.rec.put();

    if (ch === 'K') {
        await akashaKiss(ctx);
    } else {
        await akashaBite(ctx);
    }
}

async function akashaKiss(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 You ask for a kiss from Akasha.');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 She looks at you and gives you a little smirk.');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 "What a naughty person you are!" She says seductivly,');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 "I\'ll kiss you allright, but I\'m not sure that the kiss I\'ll give you is the kiss you had in mind."');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2 What she says scares you a little, so you close your eyes and wait.');
    await ctx.io.lln('`2Akasha moves in closer, and closer, and closer....');
    await ctx.io.sln();
    await ctx.io.mswait(500);

    await ctx.io.lln('`2You get.......');
    await ctx.io.sln();

    const rand = random(9);
    switch (rand) {
        case 0:
            await ctx.io.lln('`2Wiser!? `%YOU GAINED 7000 EXPERIENCE!!!!');
            ctx.expCheck(7000);
            break;
        case 1:
            await ctx.io.lln('`%5 CHARM!! `2You leave feeling better about yourself.');
            ctx.charmCheck(5);
            break;
        case 2:
            await ctx.io.lln('`0SCARED! `2You feel blood dripping down your neck! `0"You bit me!!!" `2 `2you scream terrified. Just then the blood in your hand transforms to `2a `4RED `2Gem. Akasha grabs the Gem from your hand. `0"I\'ll take that.');
            await ctx.io.lln('`0here\'s 5 regular Gems.....consider it a trade."');
            await ctx.io.sln();
            await ctx.io.lln('`%YOU GET 5 GEMS!!');
            ctx.gemCheck(5);
            break;
        case 3:
            await ctx.io.lln('`%ENERGIZED!! `2You leave Feling like you could take on the world!');
            ctx.player.hp = ctx.player.hp_max * 2;
            break;
        case 4:
            await ctx.io.lln('`%STRONGER!!! YOU GAIN ' + ctx.player.level + ' STRENGTH!!!');
            ctx.strCheck(ctx.player.level);
            break;
        case 5:
            await ctx.io.lln('`%TOUGHER!!! YOU GAIN ' + (ctx.player.level * 2) + ' DEFENSE!!!');
            ctx.defCheck(ctx.player.level * 2);
            break;
        case 6: {
            const lossExp = ctx.player.level * 100;
            await ctx.io.lln('`2What are you stupid!?? You would purposly let a Vampire Kiss you????');
            await ctx.io.sln();
            await ctx.io.lln('`4LOSE ' + lossExp + ' EXPERIENCE FOR BEING STUPID!!!');
            ctx.expCheck(-lossExp);
            break;
        }
        case 7:
            if (ctx.player.cha > 7) {
                await ctx.io.lln('`2You `4LOSE 5 CHARM `2from the scars on your neck.');
                ctx.charmCheck(-5);
            }
            break;
        case 8:
            await ctx.io.lln('`2Weaker! `4YOUR HIT POINTS ARE WAYYY DOWN FROM THE BLOOD LOSS.');
            ctx.hpWayDown();
            break;
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

async function akashaBite(ctx: FelicityBase): Promise<void> {
    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2 Seeing as you have always had a fascination with Vampires you ask Akasha to bite you and make you immortal.  You plead your case for many minutes `2before Akasha changes her mind.');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 She looks at you and explains how hard it is to transfer her power to another.  She says that doing anything like that is a major risk that may end in death.  You decide to take that risk in the hope of becoming stronger.');
    await ctx.io.mswait(500);
    await ctx.io.sln();
    await ctx.io.lln('`2 "Akasha says "If this is your wish, so be it!"');
    await ctx.io.lln('`2 You close your eyes and wait for the deed to be done.');
    await ctx.io.mswait(500);
    await ctx.io.lln('`2Akasha moves in closer, and closer, and closer....');
    await ctx.io.sln();
    await ctx.io.mswait(500);

    await ctx.io.lln('`2She bites.......');
    await ctx.io.sln();

    const rand = random(8);
    switch (rand) {
        case 0:
            await ctx.io.lln('`2You can feel the power flowing through your veins you feel like you could take on the world! `% YOU GAIN 5 DEFENSE!! MAX HIT `%POINTS UP BY 2!!!');
            ctx.defCheck(5);
            ctx.hitMaxCheck(2);
            break;
        case 1:
            await ctx.io.lln('`2You feel more attractive after that kiss, `% GAIN 2 CHARM!!!');
            ctx.charmCheck(2);
            break;
        case 2:
            await ctx.io.lln('`2Akasha stops milliseconds before she bites. `0" I can\'t go through `0with this, it\'s too risky for you." she says in a depressed voice.');
            break;
        case 3:
            await ctx.io.lln('`2After the bite you feel the same, `0"Hmm maybe nothing happened." `2you think to yourself. Then you notice in a mirror the scar that `2was left on your neck.');
            await ctx.io.lln('`4LOSE 2 CHARM!');
            if (ctx.player.cha > 4) {
                ctx.charmCheck(-2);
            }
            break;
        case 4:
            await ctx.io.lln('`2After the kiss you can barely stand. I guess Akasha drank a little `2too much blood! `4LOSE 2 STRENGTH!! HIT POINTS ARE WAY DOWN!!');
            ctx.player.hp = 1;
            if (ctx.player.str < 20) {
                ctx.player.str = 10;
            } else {
                ctx.player.str -= 2;
            }
            break;
        case 5:
            await ctx.io.lln('`2Akasha stops milliseconds before she bites. `0" I\'ve changed `0my mind. I\'m no longer hungry." she says in a depressed voice.');
            break;
        case 6:
            await ctx.io.lln('`2Akasha stops after many attempts to bite you. `0" I can\'t get through `0your thick skin!!" she says in a surprised voice.');
            break;
        case 7:
            await ctx.io.lln('`2Akasha stops mid-bite `0" Ewww gross!!! What have you been eating!?? `0I can\'t finish get out of here!" she says in a angry voice.');
            break;
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Talk to Felicity at main hall - routes to Akasha or Felicity talk */
export async function felicityGreeting(ctx: FelicityBase): Promise<void> {
    let ch: string;
    do {
        await ctx.displayMenu('FEL');
        ch = await ctx.commandPrompt('Talking To Felicity', [
            { key: 'A', label: 'Talk to Akasha' },
            { key: 'F', label: 'Talk to Felicity' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    switch (ch) {
        case 'A': await talkAkasha(ctx); break;
        case 'F': await talkFelicity(ctx); break;
        case 'L': break;
    }
}

/** Turin conversation - just displays text */
export async function talkTurin(ctx: FelicityBase): Promise<void> {
    await ctx.displayMenu('TURIN');
    await ctx.pressAKey();
}
