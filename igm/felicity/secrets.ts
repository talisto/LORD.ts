/**
 * Felicity's Temple - Secret areas
 * Storage Room (stable, fairy pool, kids) and Janitor's Room.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import { prettyInt, random } from '@lordts/util/Util';
import type { FelicityBase } from './felicityBase';
import { LOST_AND_FOUND, JANITOR_HELP } from './felicityDefs';

const FELICITY_NURSERY_MAX_KIDS = 12;
const FELICITY_NURSERY_BASE_PRICE = 1000000;
const FELICITY_NURSERY_SELL_PRICE = 250000;
const FELICITY_NURSERY_MAX_PRICE = 2000000000;

/* ═══════════════════════════════════════════
   Storage Room
   ═══════════════════════════════════════════ */

/** Storage Room discovery event (from passage area) */
export async function discoverStorage(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.found_storage) {
        await storageRoom(ctx);
        return;
    }

    // Random chance to find it
    if (random(5) !== 0) return;

    ctx.rec.found_storage = true;
    ctx.rec.put();

    await ctx.log.logLine('`0' + ctx.player.name + ' `2found `%Felicity\'s Storage room!!!!');
    await ctx.displayMenuInline('STORAGE1');
    await ctx.pressAKey();
    await storageRoom(ctx);
}

/** Storage room menu loop */
async function storageRoom(ctx: FelicityBase): Promise<void> {
    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('STORAGE2');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt('The Storage Room', [
            { key: 'T', label: 'Tap the Cask' },
            { key: 'S', label: 'The Stable' },
            { key: 'F', label: 'The Fairy Pool' },
            { key: 'K', label: 'The Kids Area' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'T':
                ctx.menuRedisplay = true;
                await ctx.displayMenuInline('STORAGE3');
                await ctx.io.sln();
                await ctx.pressAKey();
                break;
            case 'S':
                ctx.menuRedisplay = true;
                await stable(ctx);
                break;
            case 'F':
                ctx.menuRedisplay = true;
                await fairyPool(ctx);
                break;
            case 'K':
                ctx.menuRedisplay = true;
                await kidsArea(ctx);
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

/** Stable - buy or sell horse */
async function stable(ctx: FelicityBase): Promise<void> {
    if (ctx.player.horse) {
        // Has horse - offer to sell for 5,000
        await ctx.displayMenuInline('STABLE1');
        await ctx.io.lw('`2Do you accept this offer, and sell your Horse ? `0[`2Y`0/`2N`0] `2: ');
        ctx.io.emitPrompt('felicity_sell_horse', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await ctx.io.getkey()).toUpperCase();
        await ctx.io.sln();
        if (ch === 'Y') {
            await ctx.io.lln('`0"Thanks!!"`2, bursts the man,`0 "You don\'t know how hard it is to find a good Horse like this."`2 And he promptly Pays you.');
            ctx.player.horse = false;
            ctx.goldCheck(5000);
        } else {
            await ctx.io.lln('`0"Oh well your loss then...", says the man nearly crying.');
        }
    } else {
        // No horse - offer to buy for 1,000,000
        await ctx.displayMenuInline('STABLE2');
        await ctx.io.lw('`2Whaddaya say ? `0[`2Y`0/`2N`0] `2: ');
        ctx.io.emitPrompt('felicity_buy_horse', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await ctx.io.getkey()).toUpperCase();
        await ctx.io.sln();
        if (ch === 'Y') {
            if (ctx.player.gold >= 1000000) {
                await ctx.io.lln('`2You pay the man his 1,000,000 Gold Coins...');
                await ctx.io.lln('`0"Thanx! You won\'t regret this! he\'ll serve you well!');
                ctx.goldCheck(-1000000);
                ctx.player.horse = true;
            } else {
                await ctx.io.lln('`0"You don\'t even have 1,000,000 gold! Get a job you bum!"`2, screams the man');
            }
        }
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Fairy Pool - let fairy go, buy fairy */
async function fairyPool(ctx: FelicityBase): Promise<void> {
    await ctx.displayMenuInline('FAIRYPOOL1');

    if (ctx.player.has_fairy) {
        // Has fairy - offer to let her go
        await ctx.displayMenuInline('FAIRYPOOL2');
        await ctx.io.lw('`2Do you let this little Fairy join her friends ? `0[`2Y`0/`2N`0]`2 : ');
        ctx.io.emitPrompt('felicity_fairy_release', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await ctx.io.getkey()).toUpperCase();
        await ctx.io.sln();
        if (ch === 'Y') {
            await ctx.displayMenuInline('FAIRYPOOL4');
            ctx.player.has_fairy = false;
            // Fairy help bonus
            await fairyHelp(ctx);
        } else {
            await ctx.displayMenuInline('FAIRYPOOL3');
        }
    } else {
        // No fairy - offer to buy one for 750,000
        await ctx.displayMenuInline('FAIRYPOOL5');
        await ctx.io.lw('`2Do you want a Fairy? `0[`2Y`0/`2N`0]`2 : ');
        ctx.io.emitPrompt('felicity_buy_fairy', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await ctx.io.getkey()).toUpperCase();
        await ctx.io.sln();
        if (ch === 'Y') {
            if (ctx.player.gold >= 750000) {
                await ctx.io.lln('`2You hand the 750,000 gold coins to the Fairy Keeper, he thanks you then goes over and gets you a Fairy....You place Her in yer pocket.');
                ctx.goldCheck(-750000);
                ctx.player.has_fairy = true;
            } else {
                await ctx.io.lln('`2You don\'t have 750,000 Gold!!! Get a Job!');
            }
        }
    }
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Fairy help bonus when releasing fairy */
async function fairyHelp(ctx: FelicityBase): Promise<void> {
    await ctx.io.sln();

    const rand = random(4);
    switch (rand) {
        case 0:
            await ctx.io.lln('`2The little Fairy flies away and Blows you a kiss....');
            await ctx.io.lln('`%YOU FEEL ENERGISED!!!!');
            // Double current HP (capped at 30000 to stay within signed 16-bit range)
            if (ctx.player.hp_max < 15000) {
                ctx.player.hp = ctx.player.hp_max * 2;
            } else {
                ctx.player.hp = 30000;
            }
            break;
        case 1:
            await ctx.io.lln('`2You notice that the Fairy is now crying a tear of joy');
            await ctx.io.lln('`2It falls from her face to your hands...then turns into a `%GEM`2!!!');
            ctx.gemCheck(1);
            break;
        case 2:
            await ctx.io.lln('`2The Fairy Dust makes you feel `%TOUGHER!!!');
            await ctx.io.lln('`%YOU GAIN 2 DEFENCE!!!!!');
            ctx.defCheck(2);
            break;
        case 3:
            await ctx.io.lln('`2The Fairy Dust makes you feel `%STRONGER!!!');
            await ctx.io.lln('`%YOU GAIN 2 STRENGTH!!!!!');
            ctx.strCheck(2);
            break;
    }

    await ctx.io.sln();
    await ctx.io.lln('`2Your heart feels all warm watching your Fairy fly away and join her friends');
    await ctx.io.lln('`2You did the right thing....');
    ctx.player.put();
}

/** Kids area - adopt or give up a child */
async function kidsArea(ctx: FelicityBase): Promise<void> {
    let ch: string;
    do {
        await ctx.displayMenu('KIDS1');
        ch = await ctx.commandPrompt('The Nursery', [
            { key: 'G', label: 'Give up a child' },
            { key: 'A', label: 'Adopt a child' },
            { key: 'V', label: 'View Stats' },
            { key: 'N', label: 'Never mind' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    switch (ch) {
        case 'G':
            await _giveUpChild(ctx);
            break;
        case 'A':
            await _adoptChild(ctx);
            break;
        case 'N':
            break;
    }

    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

function getNurseryAdoptionPrice(kids: number): number {
    let price = FELICITY_NURSERY_BASE_PRICE;
    for (let i = 0; i < kids; i++) {
        if (price >= Math.floor(FELICITY_NURSERY_MAX_PRICE / 2)) {
            return FELICITY_NURSERY_MAX_PRICE;
        }
        price *= 2;
    }
    return price;
}

async function showNurseryFullMessage(ctx: FelicityBase): Promise<void> {
    await ctx.io.lln('`0"Whoa there! You already have `%' + prettyInt(ctx.player.kids) + ' `0kids!!! What do you think this is, your own orphanage!?"');
    await ctx.io.lln('`2The Man folds his arms and refuses to hand you another brat.');
}

async function _giveUpChild(ctx: FelicityBase): Promise<void> {
    if (ctx.player.kids <= 0) {
        await ctx.io.lln('`0"You don\'t have a kid! How could you put one up for adoption!?"');
    } else {
        await ctx.displayMenuInline('KIDS2');
        await ctx.io.lw('`2   Well? Do you want to off-load a kid? `0[`2Y`0/`2N`0]`2 : ');
        ctx.io.emitPrompt('felicity_give_kid', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const confirm = (await ctx.io.getkey()).toUpperCase();
        await ctx.io.sln();
        if (confirm === 'Y') {
            await ctx.io.lln('`0"Ok well I\'ll take a kid off your hands."');
            await ctx.io.lln('`2The Man pays you your ' + prettyInt(FELICITY_NURSERY_SELL_PRICE) + ' gold. You feel different somehow!');
            ctx.player.kids -= 1;
            ctx.goldCheck(FELICITY_NURSERY_SELL_PRICE);
            // Selling a kid: -5 charm penalty (guard prevents going below 0)
            if (ctx.player.cha > 4) {
                ctx.charmCheck(-5);
            }
        }
    }
}

async function _adoptChild(ctx: FelicityBase): Promise<void> {
    if (ctx.player.kids >= FELICITY_NURSERY_MAX_KIDS) {
        await showNurseryFullMessage(ctx);
        return;
    }

    const adoptionPrice = getNurseryAdoptionPrice(ctx.player.kids);
    await ctx.io.lln('`0"So you want to adopt eh??? Well I\'ll let you skip all the legal crap, and I\'ll give you this kid for ' + prettyInt(adoptionPrice) + ' gold!');
    await ctx.io.lw('`2So how about it? Is it a deal? `0[`2Y`0/`2N`0] `2: ');
    ctx.io.emitPrompt('felicity_adopt_kid', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
    const adopt = (await ctx.io.getkey()).toUpperCase();
    await ctx.io.sln();
    if (adopt === 'Y') {
        if (ctx.player.gold >= adoptionPrice) {
            ctx.goldCheck(-adoptionPrice);
            await ctx.io.lln('`2You hand over the gold...');
            await ctx.io.lln('`0"Thanx! I didn\'t think anyone would take one of these brats, ahh I mean nice children off my hands!!');

            if (random(2) === 0) {
                await ctx.io.lln('`2You adopted a baby `@Girl!!!!');
                await ctx.io.lw('`2  Name her (max 10 Chars) ');
                const name = await ctx.io.getstr({ len: 10, c: 1, c1: 15, edit: '' });
                await ctx.io.lln('`2You now have a baby `@Girl `2named `%' + name + '`2!!! Congrats!');
                await ctx.log.logLine('`%Felicity\'s Temple News:');
                await ctx.log.logLine('`0' + ctx.player.name + ' `2adopted a Baby Girl and named her `0' + name);
            } else {
                await ctx.io.lln('`2 You adopted a baby `9Boy!!!!');
                await ctx.io.lw('`2  Name him (max 10 Chars) ');
                const name = await ctx.io.getstr({ len: 10, c: 1, c1: 15, edit: '' });
                await ctx.io.lln('`2You now have a baby `9Boy `2named `%' + name + '`2!!! Congrats!');
                await ctx.log.logLine('`%Felicity\'s Temple News:');
                await ctx.log.logLine('`0' + ctx.player.name + ' `2adopted a Baby Boy and named Him `0' + name);
            }
            ctx.player.kids += 1;
        } else {
            await ctx.io.lln('`0"You don\'t have ' + prettyInt(adoptionPrice) + ' gold on hand!!! Get a job!');
        }
    }
}

/* ═══════════════════════════════════════════
   Janitor's Room
   ═══════════════════════════════════════════ */

/** Janitor room discovery event (from main hall) */
export async function discoverJanitor(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.found_janitor) {
        await janitorRoom(ctx);
        return;
    }

    // Random chance to find the secret door
    if (random(5) !== 0) return;

    ctx.rec.found_janitor = true;
    ctx.rec.put();

    await ctx.log.logLine('`0' + ctx.player.name + ' `2found `7The Janitor `2in `%Felicity\'s Temple!');
    await ctx.displayMenuInline('JANITOR1');
    await ctx.pressAKey();
    await janitorRoom(ctx);
}

/** Janitor room menu loop */
async function janitorRoom(ctx: FelicityBase): Promise<void> {
    let done = false;
    do {
        if (ctx.menuRedisplay) {
            await ctx.displayMenu('JANITOR2');
            ctx.menuRedisplay = false;
        }
        const ch = await ctx.commandPrompt("The Janitor's Room", [
            { key: 'T', label: 'Talk to Janitor' },
            { key: 'S', label: 'Search Lost & Found' },
            { key: 'A', label: 'Ask for Help' },
            { key: 'V', label: 'View Stats' },
            { key: 'L', label: 'Leave' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        switch (ch) {
            case 'T':
                ctx.menuRedisplay = true;
                await janitorTalk(ctx);
                break;
            case 'S':
                ctx.menuRedisplay = true;
                await janitorSearch(ctx);
                break;
            case 'A':
                ctx.menuRedisplay = true;
                await janitorHelp(ctx);
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

/** Janitor talk sub-menu */
async function janitorTalk(ctx: FelicityBase): Promise<void> {
    let ch: string;
    do {
        await ctx.displayMenu('JANTALK1');
        ch = await ctx.commandPrompt('Talking To The Janitor', [
            { key: 'O', label: 'Old days here' },
            { key: 'F', label: 'About Felicity' },
            { key: 'S', label: 'Strange things' },
            { key: 'V', label: 'View Stats' },
            { key: 'N', label: 'Never mind' },
            { key: '?', label: 'Menu' },
        ]);
        await ctx.io.sln();
        if (ch === 'V') await ctx.io.showStats();
    } while (ch === 'V' || ch === '?');

    switch (ch) {
        case 'O':
            await ctx.displayMenuInline('JANTALK2');
            break;
        case 'S':
            await ctx.displayMenuInline('JANTALK3');
            break;
        case 'F':
            await ctx.displayMenuInline('JANTALK4');
            break;
        case 'N':
            await ctx.io.lln('`2You decide not to bother this busy looking Janitor.');
            break;
    }
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Search Lost and Found - once per day */
async function janitorSearch(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.janitor_lf) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2The Janitor allready gave you what was in the Lost and Found!');
        await ctx.io.lln('`2Try again tomorrow, who knows what people will leave around!');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    ctx.rec.janitor_lf = true;
    ctx.rec.put();

    ctx.io.sclrscr();
    await ctx.io.sln();
    await ctx.io.lln('`2You ask the Janitor if he found any of lost items in the Temple recently');
    await ctx.io.lln('`0"Hmmm, well let me check the Lost and Found fer yah!"');
    await ctx.io.lln('`2You see him go behind the desk, seconds later he returns.');
    await ctx.io.sln();
    await ctx.io.lln('`0"Well all I see here is...');

    const item = LOST_AND_FOUND[random(LOST_AND_FOUND.length)];
    await ctx.io.lln(item.text);

    switch (item.type) {
        case 'gem':
            ctx.gemCheck(item.amount);
            break;
        case 'gold':
            ctx.goldCheck(item.amount);
            break;
        case 'fairy':
            ctx.player.has_fairy = true;
            break;
        case 'horse':
            ctx.player.horse = true;
            break;
    }

    await ctx.io.sln();
    await ctx.io.lln('`0Next time don\'t leave yer stuff laying around where I can find it!!!!!"');
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}

/** Ask janitor for help - once per day */
async function janitorHelp(ctx: FelicityBase): Promise<void> {
    if (ctx.rec.janitor_helped) {
        ctx.io.sclrscr();
        await ctx.io.sln();
        await ctx.io.lln('`2The Janitor allready helped you today! You wouldn\'t want him to get mad at you now would you????');
        await ctx.io.sln();
        await ctx.pressAKey();
        return;
    }

    ctx.rec.janitor_helped = true;
    ctx.rec.put();

    await ctx.displayMenuInline('JANHELP1');
    await ctx.io.sln();

    const help = JANITOR_HELP[random(JANITOR_HELP.length)];
    await ctx.io.lln(help.text);

    switch (help.stat) {
        case 'str': ctx.strCheck(help.amount); break;
        case 'def': ctx.defCheck(help.amount); break;
        case 'cha': ctx.charmCheck(help.amount); break;
        case 'gold': ctx.goldCheck(help.amount); break;
        case 'gem': ctx.gemCheck(help.amount); break;
    }

    await ctx.io.sln();
    await ctx.io.lln('`2You thank the Janitor for his help!');
    ctx.player.put();
    await ctx.io.sln();
    await ctx.pressAKey();
}
