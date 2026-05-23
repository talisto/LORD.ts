/**
 * Olodrin's Orphanage - IGM for LORD
 * Ported from Javascript source code
 */
'use strict';

import * as path from 'path';
import { prettyInt, random } from '@lordts/util/Util';
import { File } from '@lordts/util/FileUtils';
import type { IgmDeps } from '@lordts/igm/IgmDeps';

// Type placeholder for GameContext

const lookingForWaifText: string[] = [
    "After skulking through the grass a while, you spot your quarry!",
    "You try wandering casually down a path, lunging out as a youth passes",
    "Playing dead, you jump up when a curious youth approaches",
    "You are completely surprised as you are suddenly jumped!",
    "You charge into the fields screaming bloody murder!",
    "Thinking you're sneaking, you clatter loudly down the path",
    "'I suure hate eating this chocolate!' you scream out. Suddenly...",
    "You stand perfectly still until a wild youth looks at you, puzzled"
];

const intermediateaction: string[] = [
    "You flail wildly, trying to get a hand on the quick youngster",
    "You decide your best bet is to sweep the leg",
    "A smarter individual would have brought a net...",
    "You grab a chunk of flesh and bite down hard",
    "You close your eyes and let an inner voice guide you"
];

const goodcatch: string[] = [
    "Success! You vow to hug him and squeeze him and call him George",
    "Congratulations! Under that mess of hair is a little girl to win over",
    "You manage to get hold of a scamp and calm them down!",
    "Your first attempt fails, but chocolate bribery works!"
];

const badcatch: string[] = [
    "You get hit with a stick behind the knee and go down hard",
    "Somehow you manage to kick YOURSELF in the face",
    "You feel teeth dig into your arm and scream out in pain!",
    "You feel an impact in the back of the head and see stars",
    "After feeling pain, you stop biting yourself and take stock"
];

const OORPHANS_MAX_KIDS = 12;
const OORPHANS_SELL_PRICE = 250;
const OORPHANS_MAX_PRICE = 2000000000;

interface OrphanGuardian {
    title: string;
    sex: string;
}

const orphanGuardian: OrphanGuardian[] = [
    { title:'Father', sex:'Male' },
    { title:'Mother', sex:'Female' },
    { title:'Grandfather', sex:'Male' },
    { title:'Grandmother', sex:'Female' },
    { title:'Papa', sex:'Male' },
    { title:'Mama', sex:'Female' },
    { title:'Aunt', sex:'Female' },
    { title:'Uncle', sex:'Male' },
    { title:'Brother', sex:'Male' },
    { title:'Sister', sex:'Female' },
    { title:'Uncle Daddy', sex:'Male' },
    { title:'Sister Mama', sex:'Female' }
];

class Oorphans {
    private io: IgmDeps['io'];
    private player: IgmDeps['player'];
    private igmDir: string;
    private boyNames: string[];
    private girlNames: string[];
    private howTheyDied: string[];

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.igmDir = deps.srcDir + path.sep;
        this.boyNames = [];
        this.girlNames = [];
        this.howTheyDied = [];
    }

    static get desc(): string { return '`9Olodrin\'s `3Orphanage'; }

    async run(): Promise<void> {
        await this.main();
    }

    /* Utility Functions */

    async saySlow(str: string): Promise<void> {
        for (let i = 0; i < str.length; i++) {
            this.io.sw(str[i]);
            await this.io.mswait(100);
        }
    }

    async wait(): Promise<void> {
        await this.io.mswait(1000);
        this.io.sw('.');
    }

    async getHead(str: string): Promise<void> {
        await this.io.lln('`r0`0`2`c  `%' + str, 0);
        await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);
        await this.io.sln();
    }

    private getAdoptionPrice(): number {
        let price = Math.max(1000, Math.round((this.player.level * this.player.level) * 1000));
        for (let i = 0; i < this.player.kids; i++) {
            if (price >= Math.floor(OORPHANS_MAX_PRICE / 2)) {
                return OORPHANS_MAX_PRICE;
            }
            price *= 2;
        }
        return price;
    }

    private getHorseTradeCost(): number {
        return Math.min(this.player.level * this.player.level, OORPHANS_MAX_KIDS);
    }

    private async showTooManyKidsMessage(): Promise<void> {
        await this.io.sln();
        await this.io.lln('`!Olodrin `2glares at the parade of rugrats behind you.', 1);
        await this.io.lln('`0"No more, nit! `2You already have `$' + prettyInt(this.player.kids) + ' `2children to feed."', 1);
        await this.io.moreNoMail();
    }

    private getboynames(): void {
        const boynamefile = new File(this.igmDir+'boynames.dat');

        if (!boynamefile.open('r')) {
            return;
        }
        let rname: string | null;
        while (true) {
            rname = boynamefile.readln();
            if (rname === null) {
                break;
            }
            this.boyNames.push(rname);
        }
        boynamefile.close();
    }

    private getgirlnames(): void {
        const girlnamefile = new File(this.igmDir+'girlnames.dat');

        if (!girlnamefile.open('r')) {
            return;
        }
        let rname: string | null;
        while (true) {
            rname = girlnamefile.readln();
            if (rname === null) {
                break;
            }
            this.girlNames.push(rname);
        }
        girlnamefile.close();
    }

    private gethowdiedlist(): void {
        const howdiedfile = new File(this.igmDir+'howdied.dat');

        if (!howdiedfile.open('r')) {
            return;
        }
        let diedway: string | null;
        while (true) {
            diedway = howdiedfile.readln();
            if (diedway === null) {
                break;
            }
            this.howTheyDied.push(diedway);
        }
        howdiedfile.close();
    }

    private async orphanDescription(): Promise<string> {
        const sexrand = random(2);
        let orphanName: string;
        let gaurdiannum: number;
        let diedby: string;
        let gaurdianName: string;

        if (sexrand == 1) {
            orphanName = this.boyNames[random(this.boyNames.length)];
            gaurdiannum = random(orphanGuardian.length);
            diedby = this.howTheyDied[random(this.howTheyDied.length)];
            if (orphanGuardian[gaurdiannum].sex == "Female") {
                gaurdianName = this.girlNames[random(this.girlNames.length)];
            }
            else {
                gaurdianName = this.boyNames[random(this.boyNames.length)];
            }
            //"Male"
            await this.io.sln();
            await this.io.lln("`2This is `!" + orphanName, 1);
            await this.io.lln('`2His last guardian was his `!' + orphanGuardian[gaurdiannum].title + ", `$" + gaurdianName + ", `2who... ", 1);
            await this.io.lln("`4" + diedby, 1);
            await this.io.lln( ' `2Needless to say, he ended up in our care');
        }
        else {
            orphanName = this.girlNames[random(this.girlNames.length)];
            gaurdiannum = random(orphanGuardian.length);
            diedby = this.howTheyDied[random(this.howTheyDied.length)];
            if (orphanGuardian[gaurdiannum].sex == "Female") {
                gaurdianName = this.girlNames[random(this.girlNames.length)];
            }
            else {
                gaurdianName = this.boyNames[random(this.boyNames.length)];
            }
            //"Female"
            await this.io.sln();
            await this.io.lln("`2This is `!" + orphanName, 1);
            await this.io.lln('`2Her last guardian was her `!' + orphanGuardian[gaurdiannum].title + ", `$" + gaurdianName + ", `2who... ", 1);
            await this.io.lln("`4" + diedby, 1);
            await this.io.lln( ' `2Needless to say, she ended up in our care');
        }
        return orphanName;
    }

    private async buyOrphans(): Promise<void> {
        const orphanprice = this.getAdoptionPrice();
        this.io.sclrscr();
        await this.getHead('Get yourself a waif!');
        if (this.player.kids >= OORPHANS_MAX_KIDS) {
            await this.showTooManyKidsMessage();
            return;
        }
        const newname = await this.orphanDescription();
        await this.io.moreNoMail();
        await this.io.sln();
        await this.io.lln("It will cost you `$" + prettyInt(orphanprice) + " gold `2 to adopt this child.", 1);
        await this.io.sln();
        await this.io.sln();
        const ch = await this.io.prompt(
            " Do it? [y/N]:",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'adopt_confirm',
            { defaultKey: 'N', echo: false, leadingBlank: false, trailingBlank: false }
        );
        if (ch == "Y") {
            if (this.player.gold < orphanprice) {
                await this.io.sln();
                await this.io.lln("`!You fool! `2You don't have enough gold!", 1);
                await this.io.moreNoMail();
            }
            else {
                this.player.gold = (this.player.gold - orphanprice);
                this.player.kids += 1;
                await this.io.sln();
                await this.io.lln("`2Take good care of `!" + newname + "!`2");
                await this.io.moreNoMail();
            }
        }
    }

    private async sellOrphans(): Promise<void> {
        const orphanprice = OORPHANS_SELL_PRICE;
        if (this.player.kids < 1) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`!You fool! You don't have any children!", 1);
            await this.io.lln("`3Did you get hit in the head one too many times?", 1);
            await this.io.sln();
            await this.io.sln();
            await this.io.sln();
            await this.io.moreNoMail();
        }
        else {
            this.io.sclrscr();
            await this.getHead('Sell your rugrats');
            await this.io.lln("`2'Hmmm...' says `!Olodrin, `2looking over the youngster you push forward.", 1);
            await this.io.lln("`2I will give you `$" + prettyInt(orphanprice) + "`2 for this child.", 1);
            const ch = await this.io.prompt(
                " Do it? [y/N]:",
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'sell_confirm',
                { defaultKey: 'N', echo: false, leadingBlank: false, trailingBlank: false }
            );
            if (ch == "Y") {
                this.player.gold = (this.player.gold += orphanprice);
                this.player.kids = (this.player.kids - 1);
                await this.io.sln();
                await this.io.lln("`2Don't worry, we'll take good care of `!" + this.boyNames[random(this.boyNames.length)] +"!`2");
                await this.io.moreNoMail();
            }
            else {
                await this.io.sln();
                await this.io.lln("`2Suit yourself!`2");
                await this.io.moreNoMail();
            }
        }
    }

    private async tradeOrphansForHorse(): Promise<void> {
        const orphanstotrade = this.getHorseTradeCost();
        if (this.player.horse) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`!You stupid nit! You already have a horse!", 1);
            await this.io.sln();
            await this.io.moreNoMail();
        }
        else {
            this.io.sclrscr();
            await this.getHead('Trade ragamuffins for a Steed!');
            await this.io.lln("`!Olodrin `2opens his mouth to speak:", 1);
            await this.io.lln("For you, I will give you a horse in exchange for `$" + prettyInt(orphanstotrade) + " `2children.", 1);
            const ch = await this.io.prompt(
                " Do it? [y/N]:",
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'trade_confirm',
                { defaultKey: 'N', echo: false, leadingBlank: false, trailingBlank: false }
            );
            if (ch == "Y") {
                if (this.player.kids >= orphanstotrade) {
                    this.player.kids = (this.player.kids - orphanstotrade);
                    this.player.horse = true;
                    await this.io.sln();
                    await this.io.lln("`2Don't worry, we'll take good care of `!THESE `2children...");
                    await this.io.moreNoMail();
                }
                else {
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln("`!You stupid nit! You only have `$" + this.player.kids + " `2children!", 1);
                    await this.io.sln();
                    await this.io.moreNoMail();
                }
            }
            else {
                await this.io.sln();
                await this.io.lln("`2Suit yourself!`2");
                await this.io.moreNoMail();
            }
        }
    }

    private async catchOrphans(): Promise<void> {
        this.io.sclrscr();
        await this.getHead("Trying to catch a wild child");
        await this.io.lln("" + lookingForWaifText[random(lookingForWaifText.length)], 1);
        await this.io.moreNoMail();
        await this.io.lln("" + intermediateaction[random(intermediateaction.length)], 1);
        await this.io.moreNoMail();
        // Catch outcomes: 2/7 success (29%), 1/7 lose charm, 2/7 lose gold,
        // 1/7 lose exp, 1/7 lose gems (50-74%)
        const resultselect = random(7);
        if ((resultselect == 1) || (resultselect == 6)) {
            if (this.player.kids >= OORPHANS_MAX_KIDS) {
                await this.io.lln('`2You lunge forward, but the little brat takes one look at your brood and bolts!', 1);
                await this.io.lln('`!Olodrin `2howls with laughter. `0"No more, nit! `2Your house is full already!"', 1);
                await this.io.moreNoMail();
                return;
            }
            if (this.player.kids > 0) {
                await this.io.lln('`2You nearly snatch the little guttersnipe by the collar...', 1);
                await this.io.lln('`2but the brat spots the child already hanging on you and tears off laughing!', 1);
                await this.io.lln('`!Olodrin `2cackles. `0"One at a time, nit! `2Take that one home first."', 1);
                await this.io.moreNoMail();
                return;
            }
            await this.io.lln("`2" + goodcatch[random(goodcatch.length)], 1);
            await this.io.moreNoMail();
            this.player.kids += 1;
        }
        else if (resultselect == 2) {
            await this.io.lln("`2" + badcatch[random(badcatch.length)], 1);
            const tolose = random(5);
            await this.io.moreNoMail();
            await this.io.lln("`2You Lose `$" + tolose + "`2 charm due to injuries", 1);
            this.player.cha = (this.player.cha - tolose);
            await this.io.moreNoMail();
        }
        else if ((resultselect == 0) || (resultselect == 3)) {
            await this.io.lln("`2" + badcatch[random(badcatch.length)], 1);
            const rnglose = random(20);
            const tolose = Math.round(((rnglose/100) * this.player.gold));
            const ftolose = String(tolose).replace(/(.)(?=(\d{3})+$)/g,'$1,');
            await this.io.moreNoMail();
            await this.io.lln("`2That scamp made off with `$" + ftolose + "`2 of your gold!", 1);
            this.player.gold = (this.player.gold - tolose);
            await this.io.moreNoMail();
        }
        else if (resultselect == 4) {
            await this.io.lln("`2" + badcatch[random(badcatch.length)], 1);
            const rnglose = random(10);
            const tolose = Math.round(((rnglose/100) * this.player.exp));
            const ftolose = String(tolose).replace(/(.)(?=(\d{3})+$)/g,'$1,');
            await this.io.moreNoMail();
            await this.io.lln("`2You get hit so hard you forget your own birthday...", 1);
            await this.io.lln("`2You lose `$" + ftolose + "`2 experience!", 1);
            this.player.exp = (this.player.exp - tolose);
            await this.io.moreNoMail();
        }
        else if (resultselect == 5) {
            await this.io.lln("`2" + badcatch[random(badcatch.length)], 1);
            let rnglose = random(25);
            rnglose += 50;
            const tolose = Math.round(((rnglose/100) * this.player.gem));
            const ftolose = String(tolose).replace(/(.)(?=(\d{3})+$)/g,'$1,');
            await this.io.moreNoMail();
            await this.io.lln("`2Those little guttersnipes make off with `$" + ftolose + "`2 of your Gems!", 1);
            this.player.gem = (this.player.gem - tolose);
            await this.io.moreNoMail();
        }
        else {
            await this.io.lln("`2Suddenly you find yourself fighting with yourself. There is no scamp in sight.", 1);
            await this.io.moreNoMail();
        }
    }

    private async igminfo(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`!Olodrin's Orphanage", 31);
        await this.io.lln("`2A `4LoRD`2 5.00 `2IGM by `$Underminer `2in the year `$2020.`2", 16);
        await this.io.moreNoMail();
    }

    private async welcome(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`2You travel for what feels like ages down a beaten dirt path.');
        await this.io.moreNoMail();
        await this.io.lln('`2Finally, up ahead you see a dilapidated sign lit dimly by `$two torches.`2');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`2It would seem you have arrived at `4Olodrin's Orphanage`2");
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async olodrinMain(): Promise<void> {
        this.io.sclrscr();
        await this.getHead("Olodrin's Orphanage");
        await this.io.lln('`!Olodrin`2 stands before you, arms crossed');
        await this.io.lln('`2He waits for you to make a decision');
        await this.io.sln();
        await this.io.lln('`2(`0A`2)dopt an orphan');
        await this.io.lln('`2(`0G`2)ive child up for adoption');
        await this.io.lln('`2(`0C`2)atch a feral child');
        await this.io.lln('`2(`0T`2)rade some of your children for a horse');
        await this.io.lln('`2(`0Q`2)uit and go home');
        await this.io.sln();
        await this.io.lw('`2You decide to... [`0Q`2] :`%', 2);
    }

    async goodBye(what?: string): Promise<void> {
        if(what === undefined) what = 'uneventful';
        await this.io.sln();
        await this.io.lln("`2You have had a `$"+what+" `2visit to the Olodrin's Orphans today.");
        await this.io.sln();
        await this.io.lw('You continue your on you way back to `4', 2);
        await this.wait();
        await this.saySlow(' The Undermine!');
        await this.io.mswait(1000);
    }

    async main(): Promise<void> {
        this.getboynames();
        this.getgirlnames();
        this.gethowdiedlist();
        await this.welcome();
        await this.igminfo();
        let exitigm = false;
        while(!exitigm) {
            await this.olodrinMain();
            this.io.emitPrompt('oorphans_menu', [
                { key: 'A', label: 'Adopt' },
                { key: 'G', label: 'Get Rid Of' },
                { key: 'C', label: 'Catch' },
                { key: 'T', label: 'Trade' },
                { key: 'Q', label: 'Quit' },
                { key: '?', label: 'Help' },
            ]);
            let ch = (await this.io.getkey()).toUpperCase();
            if ('QAGC?T'.indexOf(ch) == -1) {
                ch = 'Q';
            }
            if (ch == 'A') {
                await this.buyOrphans();
            }
            if (ch == 'G') {
                await this.sellOrphans();
            }
            if (ch == 'C') {
                await this.catchOrphans();
            }
            if (ch == 'T') {
                await this.tradeOrphansForHorse();
            }
            if (ch == 'Q') {
                await this.io.sln();
                await this.io.sln();
                await this.io.sln();
                await this.io.lln('`2Olodrin asks "`4Leaving already?`2" as you turn back to town.', 1);
                await this.io.sln();
                await this.io.sln();
                await this.io.moreNoMail();
                await this.igminfo();
                await this.goodBye();
                exitigm = true;
            }
            if (ch == '?') {
                await this.olodrinMain();
            }
        }
    }
}

export default Oorphans;
