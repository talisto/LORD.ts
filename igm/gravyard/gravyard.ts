/**
 * The Warrior's Graveyard - IGM for LORD
 * Ported from Javascript source code
 * JS v1.1 - by Lloyd Hannesson
 */
'use strict';

import * as path from 'path';
import { random, prettyInt as _pretty_int } from '@lordts/util/Util';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import { File } from '@lordts/util/FileUtils';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { IRecordData } from '@lordts/storage/IRecordFile';
import type { PromptOption } from '@lordts/core/GameEvents';

// Type placeholder for GameContext

const graName: string = 'The Warrior\'s Graveyard';
const graVersion: string = 'TS v1.0';

interface Graveplot {
    name: string;
    desc1: string;
    desc2: string;
    desc3: string;
    desc4: string;
    desc5: string;
    good: boolean;
    sex: string;
    gold: number;
    gems: number;
}

const Graveplots: Graveplot[] = [
    {
        name:'Edward Drake',
        desc1:'       A good man, who lived a short',
        desc2:'       life. Died by the hands of the',
        desc3:'       of the evil Barbarrion Syril.',
        desc4:'           May He Rest In Peace.',
        desc5:'',
        good:true,
        sex:'M',
        gold:1024,
        gems:5
    },
    {
        name:'Sir Thomas of Marks',
        desc1:'       This Valliant knight, who faught hard',
        desc2:'       in every battle. Died by arrow from an',
        desc3:'       archer, while he slept. A tragic loss.',
        desc4:'           May He Rest In Peace.',
        desc5:'',
        good:true,
        sex:'M',
        gold:1200,
        gems:4
    },
    {
        name:'Duke Osgood',
        desc1:'       A good man, who lived a short life.',
        desc2:'       Whilst walking through his castle',
        desc3:'       castle one day, a Battle axe suddenly',
        desc4:'       fell and split him in two!',
        desc5:'           May They Rest In Two Places.',
        good:true,
        sex:'M',
        gold:1000,
        gems:2
    },
    {
        name:'Chelsea Cruz',
        desc1:'       She was a sinner.  She sold her body',
        desc2:'       for a few measly pieces of gold. She',
        desc3:'       died from a VD she caught from her goat.',
        desc4:'           May She Rest In Peace.',
        desc5:'',
        good:false,
        sex:'F',
        gold:2000,
        gems:7
    },
    {
        name:'Lady Claria',
        desc1:'       A tragic loss to her family,',
        desc2:'       and all who knew her. Janet',
        desc3:'       Claria died giving birth to',
        desc4:'       her son Marcus.',
        desc5:'          May She Rest In Peace',
        good:true,
        sex:'F',
        gold:3000,
        gems:7
    },
    {
        name:'Princess Scarlet',
        desc1:'       She died a quick death. Sentenced',
        desc2:'       to beheading after her husband',
        desc3:'       found her in bed with 3 other men!',
        desc4:'            May She Rest In Pieces',
        desc5:'',
        good:false,
        sex:'F',
        gold:4000,
        gems:2
    },
    {
        name:'Baron Vandersquat',
        desc1:'       Many have praised the death of',
        desc2:'       this cold hearted landlord. It\'s',
        desc3:'       not hard to believe that he won\'t',
        desc4:'       be missed.',
        desc5:'            May He Rest In Peace',
        good:false,
        sex:'M',
        gold:5000,
        gems:11
    },
    {
        name:'Red, the BlackSmith',
        desc1:'       Thought of to be the most dedicated',
        desc2:'       man in town, Red worked long and hard',
        desc3:'       for 50 years as the town Smith. Red',
        desc4:'       died of natural causes.',
        desc5:'           May He Rest In Peace',
        good:true,
        sex:'F',
        gold:1024,
        gems:4
    },
    {
        name:'Joe The Town Leper',
        desc1:'       Died after he was beaten by the',
        desc2:'       town drunk. He kind of crumbled.',
        desc3:'             May He Rest In Chunks.',
        desc4:'',
        desc5:'',
        good:true,
        sex:'M',
        gold:1500,
        gems:8
    },
    {
        name:'Cliff The Town Drunk',
        desc1:'       Died from leprosy. Caught it from Joe',
        desc2:'       the Town Leper. Sadly, he also crumbled.',
        desc3:'             May He Rest In Chunks',
        desc4:'',
        desc5:'',
        good:false,
        sex:'M',
        gold:480,
        gems:2
    },
    {
        name:'Glyn, The Royal Hog Farmer',
        desc1:'       He lived a happy life, killing pigs here,',
        desc2:'       killing pigs there, here, there, E-I-E-I-O!',
        desc3:'       Sadly he died when his pigs stampeded.',
        desc4:'                  May He Rest Flat',
        desc5:'            He always did like pancakes.',
        good:true,
        sex:'M',
        gold:2024,
        gems:5
    },
    {
        name:'Mike Fergiono a.k.a. Bandit. [`@Donated!`%]',
        desc1:'      He lived a rich life, but by his name',
        desc2:'      it makes you wonder how it was achieved!',
        desc3:'      He stole from the rich and gave to the',
        desc4:'      poor [`@Sysops!?`%].',
        desc5:'            May He Rest In Peace',
        good:true,
        sex:'M',
        gold:2040,
        gems:8
    },
    {
        name:'Bennie Hutto',
        desc1:'      A king among men. It\'s a shame to see',
        desc2:'      him go. But the tales of the things he',
        desc3:'      did [`@Beta Test!?`%] will live on for ever.',
        desc4:'      You can find and talk to his ghostly spirt',
        desc5:'               The Wall BBS.',
        good:true,
        sex:'M',
        gold:1745,
        gems:6
    }
];

interface GraveyardRecordDef {
    prop: string;
    name: string;
    type: string;
    def: unknown;
}

interface GraveyardRecord extends IRecordData {
    day: number;
    lrdrecord: number;
    potioned: boolean;
    flirted: boolean;
    graverobbed: boolean;
    lemonaide: boolean;
    ghost: boolean;
    seenjim: boolean;
    kitten: boolean;
    gamed: boolean;
}

const Graveyard_Defs: GraveyardRecordDef[] = [
    {
        prop:'lrdrecord',
        name:'Lord Player Record #',
        type:'SignedInteger',
        def:-1
    },
    {
        prop:'day',
        name:'Lord Day last played.',
        type:'Integer',
        def:123456
    },
    {
        prop:'potioned',
        name:'Drank a Potion',
        type:'Boolean',
        def:false
    },
    {
        prop:'flirted',
        name:'Flirted Today (Mike or Tanya)',
        type:'Boolean',
        def:false
    },
    {
        prop:'graverobbed',
        name:'Grave Robbed Today',
        type:'Boolean',
        def:false
    },
    {
        prop:'lemonaide',
        name:'Drank Lemon-Aide Today',
        type:'Boolean',
        def:false
    },
    {
        prop:'ghost',
        name:'Visited one of the 2 special ghosts?',
        type:'Boolean',
        def:false
    },
    {
        prop:'seenjim',
        name:'Seen Jim Bob Jones',
        type:'Boolean',
        def:false
    },
    {
        prop:'kitten',
        name:'Found the Kitten Today',
        type:'Boolean',
        def:false
    },
    {
        prop:'gamed',
        name:'Played a Game of Chance Today',
        type:'Boolean',
        def:false
    }
];

class Gravyard {
    private io: IgmDeps['io'];
    private fileUtils: IgmDeps['fileUtils'];
    private settings: IgmDeps['settings'];
    private player: IgmDeps['player'];
    private state: IgmDeps['state'];
    private log: IgmDeps['log'];
    private igmDir: string;
    private igmDataDir: string;
    private storage: IStorage;
    private menuRedisplay: boolean;
    private menu_file!: File;
    private menuIndex: { [key: string]: number };
    private graFile!: IRecordFile;
    private graRecord!: GraveyardRecord;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.fileUtils = deps.fileUtils;
        this.settings = deps.settings;
        this.player = deps.player;
        this.state = deps.state;
        this.log = deps.log;
        this.igmDir = deps.srcDir + path.sep;
        this.igmDataDir = path.join(deps.runtimeDir, 'gravyard') + path.sep;
        this.storage = deps.storage;
        this.menuRedisplay = true;
        // menu_file, graFile, graRecord are lazily initialized
        this.menuIndex = {};
    }

    static get desc(): string { return '`8· `%T`7he `%W`7arrior\'s `%G`7raveyard `8·'; }

    /** Server-side daily maintenance hook: reset per-player flags for each record whose day is stale. */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDataDir = path.join(deps.runtimeDir, 'gravyard') + path.sep;
        const gf = deps.storage.create(igmDataDir + 'gravyard.dat', Graveyard_Defs);
        for (let i = 0; i < gf.length; i++) {
            const rec = gf.get(i) as unknown as GraveyardRecord;
            if (rec.day !== deps.state.days) {
                rec.day = deps.state.days;
                rec.potioned = false;
                rec.flirted = false;
                rec.graverobbed = false;
                rec.lemonaide = false;
                rec.ghost = false;
                rec.seenjim = false;
                rec.kitten = false;
                rec.gamed = false;
                rec.put();
            }
        }
    }

    async run(): Promise<void> {
        await this.main();
    }

    /* Utility Functions */

    async exitGame(): Promise<void> {
        this.io.sclrscr();
        await this.io.lln('`2Thanks for playing`% '+graName+' `0'+graVersion, 0);
        await this.io.lw('`2Now returning to Other Places');
        for (let i = 0; i < 5; i++) {
            await this.io.mswait(300);
            await this.io.lw('`4.');
        }
        this.player.put();
        this.graFile.close();
        this.menu_file.close();
    }

    /**
     * Build an index of named sections within the .gra menu file.
     * Format: lines starting with `@#NAME` mark the start of a display section.
     * displayMenu() seeks to the recorded position and prints until the next `@#`.
     */
    private async buildMenuIndex(): Promise<void> {
        let l: string | null;

        this.menu_file = new File(this.igmDir+'gravyard.gra');
        if (!this.menu_file.open('r')) {
            await this.io.sln('Unable to open '+this.menu_file.name+'!', 0);
            return;
        }

        while (true) {
            l = this.menu_file.readln();
            if (l === null) {
                break;
            }
            if (l.substr(0,2) === '@#') {
                this.menuIndex[l.substr(2)] = this.menu_file.position;
            }
        }
    }

    private async displayMenu(fname: string, _more?: boolean): Promise<void> {
        let ln: string | null;

        this.io.sclrscr();

        if (this.menuIndex[fname] === undefined) {
            return;
        }
        this.menu_file.position = this.menuIndex[fname];

        while(true) {
            ln = this.menu_file.readln();
            if (ln === null) {
                break;
            }
            if (ln.search(/^@#/) === 0) {
                break;
            }
            await this.io.lln(ln);
        }
    }

    async commandPrompt(currentPlace: string, options: PromptOption[]): Promise<string> {
        let ch: string;
        const validKeys = options.map(o => o.key.toUpperCase());

        if (!this.io.modern) {
            await this.io.sln();
            await this.io.lln('`#[`5'+currentPlace+'`#]  `2(? for menu)');
            await this.io.lw('`2  Your command, `0'+this.player.name+'`2 : ');
        }

        // Filter out secret keys (backtick) from UI buttons
        const uiOptions = options.filter(o => o.key !== '`');
        this.io.emitPrompt('gravyard_command', uiOptions);
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (validKeys.indexOf(ch) === -1);

        if (!this.io.modern) await this.io.lw('`2'+ch);
        return(ch);
    }

    async pressAKey(noClear?: boolean | number): Promise<void> {
        await this.io.lw(' `@· `0Press A Key `@·');
        await this.flushKeys();
        this.io.emitPrompt('gravyard_continue', [{ key: 'any', label: 'Continue' }]);
        await this.io.getkey();
        if(noClear) {
            this.io.print('\r');
            this.io.cleareol();
        } else {
            this.io.sclrscr();
        }
    }

    async areYouSure(): Promise<boolean> {

        await this.io.sln();
        const ch = await this.io.prompt(
            '  `2Really QUIT? [`0Y`2/`0N`2]  ',
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'gravyard_quit_confirm',
            { echo: false, leadingBlank: false, trailingBlank: false }
        );
        if(ch === 'Y') {
            return(true);
        }
        await this.io.sln();
        return(false);
    }

    async flushKeys(): Promise<void> {
        while (await this.io.waitkey(0)) {
            await this.io.getkey();
        }
    }

    prettyInt(n: number): string {
        return _pretty_int(n);
    }

    charmCheck(charm: number): void {
        this.player.cha = this.player.cha + parseInt(String(charm));
        if (this.player.cha > 32000) {
            this.player.cha = 32000;
        }
        if (this.player.cha < 0) {
            this.player.cha = 0;
        }
    }

    gemCheck(gems: number): void {
        this.player.gem = this.player.gem + parseInt(String(gems));
        if (this.player.gem > 32000) {
            this.player.gem = 32000;
        }
        if (this.player.gem < 0) {
            this.player.gem = 0;
        }
    }

    goldCheck(gold: number): void {
        this.player.gold = this.player.gold + parseInt(String(gold),10);
        if (this.player.gold > 2000000000) {
            this.player.gold = 2000000000;
        }
        if (this.player.gold < 0) {
            this.player.gold = 0;
        }
    }

    defCheck(defVal: number): void {
        this.player.def = this.player.def + parseInt(String(defVal));
        if (this.player.def > 32000) {
            this.player.def = 32000;
        }
        if (this.player.def < 0) {
            this.player.def = 0;
        }
    }

    strCheck(strVal: number): void {
        this.player.str = this.player.str + parseInt(String(strVal));
        if (this.player.str > 32000) {
            this.player.str = 32000;
        }
        if (this.player.str < 0) {
            this.player.str = 0;
        }
    }

    forestCheck(forest: number): void {
        this.player.forest_fights = this.player.forest_fights + parseInt(String(forest));
        if (this.player.forest_fights > 32000) {
            this.player.forest_fights = 32000;
        }
        if (this.player.forest_fights < 0) {
            this.player.forest_fights = 0;
        }
    }

    private expCheck(exp: number): void {
        this.player.exp = this.player.exp + parseInt(String(exp),10);
        if (this.player.exp > 2000000000) {
            this.player.exp = 2000000000;
        }
        if (this.player.exp < 1) {
            this.player.exp = 1;
        }
    }

    private hitMaxCheck(hitMax: number): void {
        this.player.hp_max = this.player.hp_max + parseInt(String(hitMax));
        if (this.player.hp_max > 32000) {
            this.player.hp_max = 32000;
        }
    }

    /* Other Functions */

    private async doRandomStuff(): Promise<void> {
        // 1% chance per visit of Jim Bob Jones appearing (once per day max)
        const num = random(100);
        if (num==1 && this.graRecord.seenjim == false) {
            await this.log.logLine('`0Jim Bob Jones `2visited `%'+this.player.name+' `2today in `5The Warrior\'s Graveyard!');
            await this.graJimBob();
            this.graRecord.seenjim = true;
            this.graRecord.put();
            this.menuRedisplay=true;
        }
    }

    private async graIntro(): Promise<void> {
        await this.io.lln('`%'+graName+' - Ver '+graVersion, 0);
        await this.io.sln();
        await this.io.lln('`2An IGM for LORD by `0SETH ABLE ROBINSON', 0);
        await this.io.lln('`2Thanks to Stephen Hurd (Deuce) and other contributors for porting LORD to JS!', 0);
        await this.io.sln();
        await this.io.lln('`2JS Version is based on The Warrior\'s Graveyard v1.8 (2002)', 0);
        await this.io.sln();
        await this.io.lln('`2Written By `%Lloyd Hannesson', 0);
        await this.io.lln('`2Email me for support/bug reports: `%dasme@dasme.org', 0);
        await this.io.sln();
        await this.io.lln('`4Copyright (c) 1995-2023 - Lloyd Hannesson', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    private graMaint(): void {
        this.graRecord.day = this.state.days;
        this.graRecord.potioned = false;
        this.graRecord.flirted = false;
        this.graRecord.graverobbed = false;
        this.graRecord.lemonaide = false;
        this.graRecord.ghost = false;
        this.graRecord.seenjim = false;
        this.graRecord.kitten = false;
        this.graRecord.gamed = false;
        this.graRecord.put();
    }

    private graInitialize(): void {
        let recordFound = false;

        this.graFile = this.storage.create(this.igmDataDir+'gravyard.dat', Graveyard_Defs);

        if (this.graFile.length < 1) {
            this.graRecord = this.graFile.new() as unknown as GraveyardRecord;
            this.graRecord.lrdrecord = this.player.Record;
            this.graRecord.day = this.state.days;
            this.graRecord.put();
        } else {

            for (let i = 0; i < this.graFile.length; i++) {
                this.graRecord=this.graFile.get(i) as unknown as GraveyardRecord;
                if(this.graRecord.lrdrecord == this.player.Record) {
                    recordFound=true;
                    break;
                }
            }

            if(!recordFound){
                this.graRecord = this.graFile.new() as unknown as GraveyardRecord;
                this.graRecord.lrdrecord = this.player.Record;
                this.graRecord.day = this.state.days;
                this.graRecord.put();
            }

            if(this.graRecord.day != this.state.days){
                this.graMaint();
            }
        }
    }

    private async graPlayGame(): Promise<void> {
        let ch: string;

        if(this.player.gold <= 0) {
            await this.io.sln();
            await this.io.lln('`2Wait, you don\'t have any money on you! Come back when you are less poor.');
            await this.pressAKey();
        } else {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`5.·`#──`2[`0Game of Chance`2]`#──`5·.');
            await this.io.sln();
            await this.io.lln('`0"Let\'s play a game!" `2you say to the Old Hag. She thinks for a second `2and then agrees to play a game. I have four marbles in this bag, 2 are `0GREEN`2, and 2 are `9BLUE`2. What you hafta do is pull out 2 marbles one at `2a time. The order and the colors you pull them determine if you win or lose!');
            await this.io.sln();
            const oddsIndent = Math.max(0, Math.floor((this.io.cols - 38) / 2));
            await this.io.lln('`2Here are the different combinations and their prize values: ', 5);
            await this.io.lln('`9Blue  `2and `9Blue  `4: LOSE ALL YOUR BET.', oddsIndent);
            await this.io.lln('`9Blue  `2and `0Green `4: LOSE HALF YOUR BET.', oddsIndent);
            await this.io.lln('`0Green `2and `9Blue  `%: WIN YOUR BET BACK.', oddsIndent);
            await this.io.lln('`0Green `2and `0Green `%: DOUBLE YOUR BET.', oddsIndent);
            await this.io.sln();

            ch = await this.io.prompt(
                '  `2Do you want to play? [`0Y`2/`0N`2]  ',
                [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                'gravyard_play',
                { leadingBlank: false, trailingBlank: false, echoStyle: 'char' }
            );
            await this.io.lw('`2');
            await this.io.sln();
            await this.io.sln();

            switch (ch) {
                case 'N':
                    await this.io.sln();
                    await this.io.lln('`2"Huh. Well thanks for wastin\' my time!" shouts the Hag as she returns to her book...');
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 'Y':
                    await this._playGameRound();
            }
        }
    }

    private async _playGameRound(): Promise<void> {
        let bet: number | string;

        this.graRecord.gamed = true;
        this.graRecord.put();

        const gold = (this.player.gold > 1000000)? 1000000 : this.player.gold;

        await this.io.lw('`2  You have a total of '+this.prettyInt(this.player.gold)+' gold to wager');
        if(this.player.gold > 1000000){
            await this.io.lln('but you can only risk', 1);
            await this.io.lln('a max of 1,000,000 coins.', 1);
        }
        await this.io.sln();
        await this.io.lln('`2Please enter your wager. (A number between 1 and '+this.prettyInt(gold)+')');
        await this.io.lw('`2: ', 2);
        this.io.emitPrompt('gravyard_wager', [], 'number');
        bet = await this.io.getstr({len:53, c:1, c1:15, edit:'', integer:true, min:1, max:gold});
        if(bet == '') { bet =1; }
        bet = Number(bet);
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`2Alright, well your wager of '+this.prettyInt(bet)+' gold is on the line!');

        // Outcomes (25% each): lose 100%, lose 50%, win 100%, win 200%
        // Expected value: -12.5% (house edge)
        const rand = random(4);
        await this.io.sln();

        switch (rand) {
            case 0:
                // lose your full bet
                await this.io.lln('`2You plunge your hand in and pull out a `9BLUE `2marble.');
                await this.io.mswait(800);
                await this.io.lln('`2Your second pick is a `9BLUE `2marble.');
                await this.io.mswait(800);
                await this.io.sln();
                await this.io.lln('`0"Awwww darn! You lost all of your bet! I\'m *so* sorry." `2laughs the Hag.');
                await this.io.lln('`4YOU LOST '+this.prettyInt(bet)+' GOLD!');
                await this.io.sln();
                await this.io.lln('`2You can hear the Hag laughing to herself as she counts the coins.');
                await this.io.sln();
                this.goldCheck(-bet);
                this.player.put();
                break;
            case 1:
                // lose half your bet
                bet=Math.round(bet/2);
                await this.io.lln('`2You plunge your hand in and pull out a `9BLUE `2marble.');
                await this.io.mswait(800);
                await this.io.lln('`2Your second pick is a `0GREEN `2marble.');
                await this.io.mswait(800);
                await this.io.sln();
                await this.io.lln('`2You lost half of your bet. `0"Better luck next time!" `2laughs the Hag.');
                await this.io.lln('`4YOU LOST '+this.prettyInt(bet)+' GOLD!');
                await this.io.sln();
                this.goldCheck(-bet);
                this.player.put();
                break;
            case 2:
                //win your bet back
                await this.io.lln('`2You plunge your hand in and pull out a `0GREEN `2marble.');
                await this.io.mswait(800);
                await this.io.lln('`2Your second pick is a `9BLUE `2marble.');
                await this.io.mswait(800);
                await this.io.sln();
                await this.io.lln('`0"Dangnabit! You win all of your bet back!" `2whines the Hag.');
                await this.io.sln();
                await this.io.lln('`>`%YOU WON '+this.prettyInt(bet)+' GOLD!');
                await this.io.sln();
                this.goldCheck(bet);
                this.player.put();
                break;
            case 3:
                //double gold back
                bet = bet*2;
                await this.io.lln('`2You plunge your hand in and pull out a `0GREEN `2marble.');
                await this.io.mswait(800);
                await this.io.lln('`2Your second pick is a `0GREEN `2marble.');
                await this.io.mswait(800);
                await this.io.sln();
                await this.io.lln('`0"DAMN YOU!" `2screams the Hag in anger, `0"You took my lunch money from me!"');
                await this.io.sln();
                await this.io.lln('`>`%YOU WON DOUBLE YOUR BET BACK! YOU WON '+this.prettyInt(bet)+' GOLD!');
                await this.io.sln();
                await this.io.lln('`2You place your winnings into your pockets and thank the Hag for funding your');
                await this.io.lln('`2night at the tavern!');
                await this.io.sln();
                this.goldCheck(bet);
                this.player.put();
        }

        await this.pressAKey();
    }

    private async graFlirtMike(): Promise<void> {
        await this.log.logLine('`%'+this.player.name+' `2spent the night with `!Mike The Ghost!');

        this.player.laid += 1;

        await this.displayMenu('FLIRTMIKE');
        await this.pressAKey();
    }

    private async graFlirtTanya(): Promise<void> {
        await this.log.logLine('`%'+this.player.name+' `2spent the night with `#Tanya The Ghost!');

        this.player.laid += 1;

        await this.displayMenu('FLIRTTANYA');
        await this.pressAKey();
    }

    private async graBuyAide(): Promise<void> {
        // Level less than 4 $1000 else $10000
        const price = (this.player.level <= 4) ? 1000 : 10000;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`5.·`#──`2[`0Buying Some Lemon Aide`2]`#──`5·.');
        await this.io.sln();
        await this.io.lln('`2You look at the Lemon-Aide that the Juice-Seller is pushing on you and', 4);
        await this.io.lln('`2ask, `0"What the hell is in that stuff? It almost looks green!?"');
        await this.io.lln('`2The Juice-Seller says, `0"Well it\'s `$Lemon-Aide`0! Duh. Why else would');
        await this.io.lln('`0I be at a Lemon-Aide stand!? That greenish tinge is from the special');
        await this.io.lln('`0ingredient I add... It has some weird effects, but the ghosts seem to');
        await this.io.lln('`0like it."');
        await this.io.sln();

        const ch = await this.io.prompt(
            '  `2  Do you want to try the `$Lemon-Aide`2? It\'s only '+price+' Gold! [`0Y`2/`0N`2]  ',
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'gravyard_lemonade',
            { leadingBlank: false, trailingBlank: false, echoStyle: 'char' }
        );
        await this.io.lw('`2');
        await this.io.sln();
        await this.io.sln();

        switch (ch) {
            case 'N':
                await this.io.lln('`0"Well fine then. That just means more for my transparent friends!"', 4);
                await this.io.lln('`2barks the Juice-Seller.');
                await this.io.sln();
                break;
            case 'Y':
                await this._drinkLemonAide(price);
        }

        await this.pressAKey();
    }

    private async _drinkLemonAide(price: number): Promise<void> {
        let rand: number;
        const gold = this.player.gold;

        if(gold >= price) {

            this.goldCheck(-price);

            await this.io.lln('`2You take the sweet smelling `$Lemon-Aide`2, and swallow it in 1 gulp.');
            await this.io.sln();
            await this.io.lln('`2You start to feel weird and notice that.......');
            await this.io.sln();
            await this.pressAKey(1);

            rand=random(4);
            switch (rand) {
                case 0:
                    await this.io.lln('`2You feel like you\'ve been fully healed!');
                    await this.io.sln();
                    await this.io.lln('`%YOUR HIT POINTS ARE MAXED OUT!');
                    await this.io.sln();
                    this.player.hp = this.player.hp_max;
                    this.player.put();
                    break;
                // Resets daily flirt flags: another visit to Violet/Bard and ghost flirt
                case 1:
                    await this.io.lln('`2You feel vigorous once again! Maybe you could try flirting?');
                    await this.io.sln();
                    await this.io.lln('`%WHAT COULD THIS MEAN!?');
                    await this.io.sln();
                    await this.io.lln('`2Oh yeah, I already told you...');
                    await this.io.sln();
                    this.player.seen_violet = false;
                    this.player.seen_bard = false;
                    this.player.flirted = false;
                    this.player.put();
                    this.graRecord.flirted = false;
                    this.graRecord.put();
                    break;
                case 2:
                    await this.io.lln('`2You feel like you are slightly glowing! A Fairy flys over and enters');
                    await this.io.lln('`2your pocket.');
                    await this.io.sln();
                    await this.io.lln('`%YOU NOW HAVE A FAIRY!');
                    await this.io.sln();
                    this.player.has_fairy = true;
                    this.player.put();
                    break;
                case 3:
                    await this.io.lln('`2You feel lucky! You look down by your feet and notice something sticking out ');
                    await this.io.lln('`2from under a rock. Upon closer look you see that it\'s a small bag!');
                    await this.io.lln('`2You empty it\'s contents into your hand and find...');
                    await this.io.sln();
                    await this.io.lln('`%YOU FOUND `65 `%GEMS!');
                    await this.io.sln();
                    this.gemCheck(5);
                    this.player.put();
            }
            this.graRecord.lemonaide = true;
            this.graRecord.put();

        } else {
            await this.io.sln();
            await this.io.lln('`0"Hey! You don\'t have '+price+' gold coins! Thanks for wastin\' my time buddy!"');
            await this.io.sln();
        }
    }

    private async graGetPotion(onlyGood?: boolean): Promise<void> {
        let temp: number;

        await this.io.lln('`2You swallow the thick concoction and......');
        await this.io.sln();
        const num = (onlyGood == true)? 6 : 12;
        const rand = random(num);

        switch (rand) {
            case 0:
                await this.io.lln('`2You feel somewhat better looking! `%CHARM RAISED BY 2!!!!');
                this.charmCheck(2);
                break;
            case 1:
                await this.io.lln('`2You feel somewhat more agile! `%DEFENCE UP BY 2!!!');
                this.defCheck(2);
                break;
            case 2:
                await this.io.lln('`2You feel somewhat stronger! `%STRENGTH RAISED BY 2!!!!');
                this.strCheck(2);
                break;
            case 3:
                await this.io.lln('`2You feel less tired! `%FOREST FIGHTS UP BY 5!!!');
                this.forestCheck(5);
                break;
            case 4:
                temp = Math.min(this.player.level, 5) * 1024;
                await this.io.lln('`2You feel somewhat wiser! `%EXPERIENCE UP BY '+temp.toString()+'!!!!');
                this.expCheck(temp);
                break;
            case 5:
                await this.io.lln('`2You feel a lot healthier! `%MAX HIT POINTS UP BY 1!!!!');
                this.hitMaxCheck(1);
                break;
            case 6:
                await this.io.lln('`2You feel the same as before. I guess the stupid potion did nothing.');
                break;
            case 7:
                await this.io.lln('`2You feel as though nothing has happened.');
                break;
            case 8:
                await this.io.lln('`2You feel as though you died! `4YOUR HIT POINTS ARE WAY DOWN!');
                this.player.hp=1;
                break;
            case 9:
                await this.io.lln('`2You feel somewhat weaker! `4STRENGTH DOWN BY 2!!!!');
                this.strCheck(-2);
                break;
            case 10:
                await this.io.lln('`2You feel somewhat slower! `4DEFENCE DOWN BY 2!!');
                this.defCheck(-2);
                break;
            case 11:
                await this.io.lln('`2You feel UGLY! `4CHARM DOWN BY 1!!!!');
                this.charmCheck(-1);
        }
        await this.io.sln();
    }

    private async graJimBob(): Promise<void> {
        let ch: string;
        let tempPick: number;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%ULTRA GHASTLY EVENT!!!!!!');
        await this.io.lln('`5-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=- ', 1);
        await this.io.sln();
        await this.io.lln('`2Seemingly out of nowhere a Ghost materializes in front of you.');
        await this.io.lln('`0"I am Jim Bob Jones! The Greatest Warrior that ever lived. I see that');
        await this.io.lln('`0you have a lot of potential, and I have decided to help you on your quest."');
        await this.io.lln('`2You stare in awe at this muscular Ghost, still adorned in his armor and');
        await this.io.lln('`2weapon. You wonder what he could do to help you?');
        await this.io.sln();
        await this.io.lln('`0"I am prepared to help you on your quest. What would help you the most?"');
        await this.io.sln();
        await this.io.lln('`2(`0S`2)trength', 7);
        await this.io.lln('`2(`0D`2)efence', 7);
        await this.io.lln('`2(`0E`2)xperience', 7);
        await this.io.lln('`2(`0G`2)ems', 7);
        await this.io.lln('`2(`0C`2)harm', 7);
        await this.io.lln('`2(`0R`2)iches', 7);
        await this.io.sln();
        await this.io.lw(' `2Choose Carefully : ');

        const menuKeys = ['S','D','E','G','C','R'];
        this.io.emitPrompt('gravyard_jimbob_reward', [
            { key: 'S', label: 'Strength' }, { key: 'D', label: 'Defence' },
            { key: 'E', label: 'Experience' }, { key: 'G', label: 'Gems' },
            { key: 'C', label: 'Charm' }, { key: 'R', label: 'Riches' }
        ]);
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (menuKeys.indexOf(ch) === -1);

        await this.io.lw('`2'+ch);
        await this.io.sln();

        switch (ch) {
            case 'S':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Strength.', 1);
                await this.io.lln('`0"Yes, I can see why you asked, my Grandma could have killed you!!', 1);
                await this.io.sln();
                tempPick=this.player.level*5;
                await this.io.lw(' `5JIM INCREASED YOUR STRENGTH BY ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('!!!', 1);
                this.strCheck(tempPick);
                break;
            case 'D':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Defence.', 1);
                await this.io.lln('`0"Yah you do look a little soft.', 1);
                await this.io.sln();
                tempPick=this.player.level*5;
                await this.io.lw(' `5JIM INCREASED YOUR DEFENCE BY ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('!!!', 1);
                this.defCheck(tempPick);
                break;
            case 'E':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Experience.', 1);
                await this.io.lln('`0"Ok I see that you are a little Unexperienced.', 1);
                await this.io.sln();
                tempPick=this.player.level*1024;
                await this.io.lw(' `5JIM INCREASED YOUR EXPERIENCE BY ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('!!!', 1);
                this.expCheck(tempPick);
                break;
            case 'G':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Gems.', 1);
                await this.io.lln('`0"Gems eh? Well ok I guess I can spare you a few.', 1);
                await this.io.sln();
                tempPick=4;
                await this.io.lw(' `5JIM GAVE YOU ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('GEMS!!!', 1);
                this.gemCheck(tempPick);
                break;
            case 'C':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Charm.', 1);
                await this.io.lln('`0"Yes you are kind of UGLY. I\'ll try.', 1);
                await this.io.sln();
                tempPick=this.player.level;
                await this.io.lw(' `5JIM INCREASED YOUR CHARM BY ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('!!!', 1);
                this.charmCheck(tempPick);
                break;
            case 'R':
                this.menuRedisplay=true;
                await this.io.lln('`2You ask Jim Bob Jones for some Gold.', 1);
                await this.io.lln('`0"Well, I guess you are a little poor!!', 1);
                await this.io.sln();
                tempPick=this.player.level;
                tempPick=tempPick*5000;
                await this.io.lw(' `5JIM GAVE YOU ');
                await this.io.lw(tempPick.toString());
                await this.io.lln('GOLD COINS!!!', 1);
                this.goldCheck(tempPick);
        }

        await this.io.sln();
        await this.pressAKey();
    }

    private async graKitten(): Promise<void> {
        let TempInt: number;

        await this.log.logLine('`%'+this.player.name+' `2has found `0The Kitten `2in `5The Warrior\'s Graveyard!');

        await this.io.sln();
        await this.io.lln('`2You hear a scratching sound coming from an old box to your left');
        await this.io.lln('`2and decide to check it out. To your surprise you see a small kitten');
        await this.io.lln('`2licking it\'s paws. You bend down for a closer look and notice that');
        await this.io.lln('`2this isn\'t any normal kitten...');
        await this.io.sln();
        await this.io.lln('`%**** `0YOU FOUND THE KITTEN!!!!! `%****', 3);
        await this.io.mswait(600);
        await this.io.sln();
        await this.io.lln('`2The kitten notices your presence and starts purring. The fact that');
        await this.io.lln('`2it is glowing and translucent (as most ghosts are) doesn\'t seem to');
        await this.io.lln('`2bother you as much as it should. It slowly walks over, and you');
        await this.io.lln('`2pick it up.');
        await this.io.mswait(600);
        await this.io.sln();
        await this.io.lln('`2It lightly kisses your nose and you notice that...');
        await this.io.mswait(600);
        await this.io.sln();

        switch (random(4)) {
            case 0:
                TempInt = this.player.level;
                await this.io.lw('`0You gain '+TempInt.toString()+' Strength!', 2);
                await this.io.sln();
                this.strCheck(TempInt);
                await this.io.sln();
                await this.pressAKey();
                break;
            case 1:
                TempInt = this.player.level;
                await this.io.lw('`0You gain '+TempInt.toString()+' Defence!', 2);
                await this.io.sln();
                this.defCheck(TempInt);
                await this.io.sln();
                await this.pressAKey();
                break;
            case 2:
                await this.io.lw('`0You gain 1 Charm!', 2);
                await this.io.sln();
                this.charmCheck(1);
                await this.io.sln();
                await this.pressAKey();
                break;
            case 3:
                await this.io.lw('`0You gain 15 Forest Fights for today!', 2);
                await this.io.sln();
                this.forestCheck(15);
                await this.io.sln();
                await this.pressAKey();
        }
    }

    private async graGraveRob(): Promise<void> {
        let ch: string;

        const rand = random(13);
        this.io.sclrscr();

        await this.io.sln();
        await this.io.lln('`2Looking upon the Tombstone you read...');
        await this.io.sln();
        await this.io.lw('`%Here lies ', 7);

        await this.io.lln(''+Graveplots[rand].name, 0);
        await this.io.sln();
        await this.io.lln(''+Graveplots[rand].desc1);
        await this.io.lln(''+Graveplots[rand].desc2);
        await this.io.lln(''+Graveplots[rand].desc3);
        if(Graveplots[rand].desc4 != '') {
            await this.io.lln(''+Graveplots[rand].desc4);
        }
        if(Graveplots[rand].desc5 != '') {
            await this.io.lln(''+Graveplots[rand].desc5);
        }
        await this.io.sln();
        await this.io.lln('`2You think to yourself, `0"Surely there must be some riches to be found here!"');
        await this.io.sln();

        const pot = random(2);
        const gold = Graveplots[rand].gold * this.player.level;
        const gems = Graveplots[rand].gems;

        await this.io.lw('`2You dig up the grave of this`0 ', 2);
        await this.io.lw((Graveplots[rand].good == true ? "Good" : "Evil"));
        await this.io.lw(' ');
        await this.io.lw((Graveplots[rand].sex == "M" ? "Man" : "Woman"));
        await this.io.lln('`2, and find...', 0);
        await this.io.lw('`0 ', 2);
        await this.io.lw(gold.toString());
        await this.io.lw('`2 gold, and`0 ');
        await this.io.lw(gems.toString());
        await this.io.lln('`2gems.', 1);
        await this.io.sln();
        await this.io.lw('`2Do you want to rob the grave of this ', 2);
        await this.io.lw((Graveplots[rand].good == true ? "Good" : "Evil"));
        await this.io.lw(' person? `0[`2Y`0/`2N`0]`2 : ');

        const menuKeys = ['Y','N','G'];
        this.io.emitPrompt('gravyard_rob_grave', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }, { key: 'G', label: 'Goto' }]);
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (menuKeys.indexOf(ch) === -1);

        await this.io.lw('`2'+ch);
        await this.io.sln();

        switch (ch) {
            case 'N':
                await this.io.sln();
                await this.io.lln('`2You decide to let this corpse keep it\'s valuables...');
                if(Graveplots[rand].good == true) {
                    await this.io.sln();
                    await this.io.lln('`0For leaving this grave alone you gain `%1 CHARM!');
                    await this.io.sln();
                    this.charmCheck(1);
                    await this.pressAKey();
                }
                break;
            case 'Y':
                await this._attemptGraveRob(rand, gold, gems, pot);
                break;
            case 'G':
                await this.graGhostGeorge();
        }
    }

    /* Menus */

    private async graGhostMike(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;
        let mikeAsk = false;

        this.io.sclrscr();
        await this.log.logLine('`%'+this.player.name+' `2has found `!Mike the Ghost `2in `5The Warrior\'s Graveyard!');
        await this.displayMenu('FOUNDMIKE');
        await this.pressAKey();

        do {
            if (this.menuRedisplay == true) {
                await this.displayMenu('MIKEMENU');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('Ghostly Event', [
                { key: 'A', label: 'Ask a favor' },
                { key: 'T', label: 'Talk' },
                { key: 'F', label: 'Flirt' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'A':
                    this.menuRedisplay=true;
                    if(!mikeAsk) {
                        await this.displayMenu('MIKEASK');
                        this.charmCheck(2);
                        await this.io.lln('`2You thank Mike with a full passionate kiss, he just smiles.');
                        await this.io.sln();
                        await this.pressAKey(true);
                        mikeAsk=true;
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2Don\'t you think you\'ve already asked enough of Mike?');
                        await this.io.sln();
                        await this.pressAKey();
                    }
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    await this.displayMenu('TALKMIKE');
                    await this.pressAKey();
                    break;
                case 'F':
                    this.menuRedisplay=true;
                    if(!this.graRecord.flirted) {
                        await this.graFlirtMike();
                        this.graRecord.flirted = true;
                        this.graRecord.put();
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2I think once is enough! Flirt with this ghost too much and he might');
                        await this.io.lln('`2get sick of you!');
                        await this.io.sln();
                        await this.pressAKey();
                    }
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay = true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }
        } while (!menuDone);
    }

    private async graGhostTanya(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;
        let tanyaAsk = false;

        this.io.sclrscr();
        await this.log.logLine('`%'+this.player.name+' `2has found `#Tanya the Ghost `2in `5The Warrior\'s Graveyard!');
        await this.displayMenu('FOUNDTANYA');
        await this.pressAKey();

        do {
            if (this.menuRedisplay == true) {
                await this.displayMenu('TANYAMENU');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('Ghostly Event', [
                { key: 'A', label: 'Ask a favor' },
                { key: 'T', label: 'Talk' },
                { key: 'F', label: 'Flirt' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'A':
                    this.menuRedisplay=true;
                    if(!tanyaAsk) {
                        await this.displayMenu('TANYAPOTION');
                        await this.graGetPotion(true);
                        await this.pressAKey(true);
                        tanyaAsk = true;
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2She already gave you a potion!!! Whatmore could you want from her!!!!', 1);
                        await this.io.lln('`2Then again.........', 1);
                        await this.pressAKey();
                    }
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    await this.displayMenu('TANYATALK');
                    await this.pressAKey();
                    break;
                case 'F':
                    this.menuRedisplay=true;
                    if(!this.graRecord.flirted) {
                        await this.graFlirtTanya();
                        this.graRecord.flirted = true;
                        this.graRecord.put();
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2I think once is enough! Flirt with this ghost too much and she might');
                        await this.io.lln('`2get sick of you!');
                        await this.io.sln();
                        await this.pressAKey();
                    }
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay = true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }
        } while (!menuDone);
    }

    private async graGhostGeorge(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;
        let talked = false;
        let asked = false;

        await this.log.logLine('`%'+this.player.name+' `2has found `0George the Ghost `2in `5The Warrior\'s Graveyard!');

        await this.displayMenu('FOUNDGEORGE');
        await this.pressAKey();

        do {

            if (this.menuRedisplay == true) {
                await this.displayMenu('GEORGEMENU');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('Ghostly Event', [
                { key: 'T', label: 'Talk' },
                { key: 'A', label: 'Ask for help' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'A':
                    this.menuRedisplay=true;
                    asked = await this._georgeAskHelp(asked);
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    talked = await this._georgeTalk(talked);
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay=true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }

        } while (!menuDone);
    }

    private async _georgeAskHelp(asked: boolean): Promise<boolean> {
        await this.io.sln();
        await this.io.lln('`2You ask nicely if George will help you. He thinks for a while and then...');
        if(!asked) {
            const rand = random(3);
            switch (rand) {
                case 0:
                    await this.io.sln();
                    await this.io.lln('`0"Well here, I\'ll give you the Strength to fight more monsters today!"');
                    await this.io.sln();
                    await this.io.lln('`%YOU GET 10 MORE FOREST FIGHTS!!!!!');
                    await this.io.sln();
                    this.forestCheck(10);
                    await this.pressAKey();
                    break;
                case 1:
                    await this.io.sln();
                    await this.io.lln('`0"Hmmm... Well, you could sure use some help in the field..."');
                    await this.io.sln();
                    await this.io.lln('`%YOU GAIN 1 DEFENSE AND 1 STRENGTH!!!!!');
                    await this.io.sln();
                    this.strCheck(1);
                    this.defCheck(1);
                    await this.pressAKey();
                    break;
                case 2:
                    await this.io.sln();
                    await this.io.lln('`0"Well here I have a potion I don\'t need, you can have it!"');
                    await this.io.sln();
                    await this.graGetPotion(true);
                    await this.pressAKey();
            }
            return true;
        } else {
            await this.io.sln();
            await this.io.lln('`2Better not ask for too many things, George Might get mad at you!!');
            await this.io.sln();
            await this.pressAKey();
            return true;
        }
    }

    private async _georgeTalk(talked: boolean): Promise<boolean> {
        if(!talked) {
            const rand = random(3);
            switch(rand) {
                case 0:
                    await this.io.sln();
                    await this.io.lln('`0"Well I\'m not the only ghost in this Graveyard y\'know. You should');
                    await this.io.lln('`0be able to find the others like you did me."');
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 1:
                    await this.io.sln();
                    await this.io.lln('`0"Y\'know there is something good to be said about sparing the');
                    await this.io.lln('`0graves of Good Hearted people. It\'ll make you look better as a person"');
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 2:
                    await this.io.sln();
                    await this.io.lln('`0"Jim Bob Jones is a tough ghost to get a hold of. You\'d think he would always');
                    await this.io.lln('`0be in just one place, but he is a random kinda guy!"');
                    await this.io.sln();
                    await this.pressAKey();
            }
            return true;
        } else {
            await this.io.sln();
            await this.io.lln('`2You think that you\'ve asked enough of this Ghost for today...', 1);
            await this.io.sln();
            await this.pressAKey();
            return true;
        }
    }

    private async _attemptGraveRob(rand: number, gold: number, gems: number, pot: number): Promise<void> {
        // Catch probability: 11% for good person's grave, 6% for evil
        // (random(100) returns 0-99; <= 10 is 11 values, <= 5 is 6 values)
        const chance = random(100);
        const limit = (Graveplots[rand].good == true) ? 10 : 5;
        if(chance <= limit) {
            await this.io.sln();
            await this.io.lln('`2Just as you are about to shove some of the valuables into your pockets,');
            await this.io.lln('you hear a twig crack just behind you.  You turn around just in time to');
            await this.io.lln('feel the Gravediggers shovel hitting your skull....Just before you drift');
            await this.io.lln('off to dreamland you hear the Gravedigger say sadly,`0 "What did I tell you');
            await this.io.lln('`0about grave robbing? And to think that I thought you were a good person.."');
            await this.io.sln();
            await this.io.lln('`2As the Gravedigger trudges away you notice that you still have a little ');
            await this.io.lln('`2life left in your old body. You chalk this up to experience and decide to');
            await this.io.lln('`2not make this mistake again.');
            await this.log.logLine('`%'+this.player.name+' `2was caught Grave Robbing today in `5The Warrior\'s Graveyard!');
            await this.io.sln();
            this.player.hp=1;
            await this.pressAKey();
        } else {
            await this.io.sln();
            await this.io.lln('`2Thinking nothing of it you bend down and stuff all this corpse\'s valuables');
            await this.io.lln('into your pockets.`0 "Geeze! This is too easy!"`2, you exclaim.');
            await this.io.sln();
            await this.io.lln('`%YOU GET...');
            await this.io.lln(''+gold.toString()+' `0GOLD PIECES AND`% '+gems.toString()+' GEMS!!!`2 What an easy score!', 1);
            this.gemCheck(gems);
            this.goldCheck(gold);
            if(pot == 1){
                await this.io.sln();
                await this.io.lln('`2You also find `%A POTION!!!!');
                await this.io.lln('`2You decide to drink it.......');
                await this.graGetPotion();
            }
            await this.io.sln();
            await this.io.sln();
            await this.pressAKey();
        }
    }

    private async graShack(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;

        await this.doRandomStuff();

        do {

            if (this.menuRedisplay == true) {
                await this.displayMenu('SHACK');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('In The Shack', this.player.sex === 'M' ? [
                { key: 'A', label: 'Ask for Potion' },
                { key: 'P', label: 'Play a Game' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ] : [
                { key: '1', label: 'Visit Ghost' },
                { key: 'A', label: 'Ask for Potion' },
                { key: 'P', label: 'Play a Game' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'A':
                    this.menuRedisplay=true;
                    if(!this.graRecord.potioned) {
                        await this.io.sln();
                        await this.io.lln('`2Looking around at all the little labeled bottles the Hag owns you decide');
                        await this.io.lln('`2to ask her to make you a potion. Hell what harm could it do!? Hmmmmm.....');
                        await this.io.sln();
                        await this.io.lln('`0"So you want that I should make you a potion eh??? Well I guess so, but ');
                        await this.io.lln('`0just one as I haven\'t much time."`2 she says eagerly. After many minutes,');
                        await this.io.lln('`2and just as many broken bottles, the potion is done.');
                        await this.io.sln();
                        await this.io.lln('`2She holds it before you and smiles. You look at it and take a whiff. ');
                        await this.io.lln('`2It smells like yesterday\'s garbage, but you decide to drink it anyways.');
                        await this.io.sln();
                        await this.graGetPotion();
                        this.graRecord.potioned = true;
                        this.graRecord.put();
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2You scream `0"Hey Hag! I want another potion!!"`2. The Hag just looks back');
                        await this.io.lln('`2at you and shakes her head. She just goes back to reading.');
                        await this.io.sln();
                        await this.io.lln('`2I guess she\'s too busy to make you another one. Try again tomorrow.');
                        await this.io.sln();
                    }
                    await this.pressAKey();
                    break;
                case 'P':
                    this.menuRedisplay=true;
                    if(!this.graRecord.gamed) {
                        await this.graPlayGame();
                    } else {
                        await this.io.lln('');
                        await this.io.lln('`2You think that placing another wager today would be unwise, the');
                        await this.io.lln('`2Hag is mumbling to herself a little more than usual...');
                        await this.io.sln();
                        await this.pressAKey();
                    }
                    break;
                case '1':
                    this.menuRedisplay=true;
                    if(!this.graRecord.ghost) {
                        this.graRecord.ghost = true;
                        this.graRecord.put();
                        await this.graGhostMike();
                    }
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay=true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }

        } while (!menuDone);
    }

    private async graLemon(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;

        await this.doRandomStuff();
        do {

            if (this.menuRedisplay == true) {
                await this.displayMenu('LEMON');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('The Lemon-Aide Stand', [
                { key: 'B', label: 'Buy Lemon-Aide' },
                { key: 'T', label: 'Talk' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'B':
                    this.menuRedisplay=true;
                    if(!this.graRecord.lemonaide) {
                        await this.graBuyAide();
                    } else {
                        await this.io.sln();
                        await this.io.lln('`2You think that drinking too much of this stuff would be a bad idea...');
                        await this.io.sln();
                        await this.pressAKey();
                    }
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    await this.displayMenu('AIDETALK');
                    await this.pressAKey();
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay=true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }

        } while (!menuDone);
    }

    private async graDigger(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;

        await this.doRandomStuff();
        do {

            if (this.menuRedisplay == true) {
                await this.displayMenu('DIGGER');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('The Grave Digger', this.player.sex === 'M' ? [
                { key: '1', label: 'Look for Ghosts' },
                { key: 'W', label: 'Whose grave is this?' },
                { key: 'T', label: 'Tell me about treasure' },
                { key: 'G', label: 'Tell me about ghosts' },
                { key: 'H', label: 'Tell me about the Hag' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ] : [
                { key: 'W', label: 'Whose grave is this?' },
                { key: 'T', label: 'Tell me about treasure' },
                { key: 'G', label: 'Tell me about ghosts' },
                { key: 'H', label: 'Tell me about the Hag' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'W':
                    this.menuRedisplay=true;
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln('`2Who is this grave for you ask??? Well it\'s for `%'+this.player.name+'`2!');
                    await this.io.lln('`2Hehehe just kidding. This is actualy a grave for the great warrior');
                    await this.io.lln('`2Jim Bob Jones! People say that his generous soul is still roaming the');
                    await this.io.lln('`2night, looking for a good deed or two to do. Consider yourself lucky');
                    await this.io.lln('`2if you meet him.');
                    await this.io.sln();
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 'G':
                    this.menuRedisplay=true;
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln('`2Ghosts yah say??? Well yah there are always a few ghosts to be found');
                    if (this.player.sex === 'M') {
                        await this.io.lln('`2in a Graveyard, you just hafta know where to `01`2ook! I hear that a few');
                    } else {
                        await this.io.lln('`2in a Graveyard, you just hafta know where to 1ook! I hear that a few');
                    }
                    await this.io.lln('`2of the ghosts that have been seen here have actually been friendly!');
                    await this.io.sln();
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln('`2So you want me to tell you about treasure eh? Well alls I can tell you');
                    await this.io.lln('`2is that most Great Warriors ask to be buried intact. That means all of');
                    await this.io.lln('`2their Weapons, Armor, and riches! Don\'t be Grave robbing tho, it\'s far');
                    await this.io.lln('`2too dangerous for a Warrior like you.');
                    await this.io.sln();
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case 'H':
                    this.menuRedisplay=true;
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln('`2Hmmmmm, the hag. What can I say about her that her looks don\'t explain');
                    await this.io.lln('`2for themselves! As of late the Hag has taken a real likin\' to the art');
                    await this.io.lln('`2of Alchemy! Who knows what she can mix up. Legend has it that this Hag');
                    await this.io.lln('`2wasn\'t always such a foul creature, people say that she once was even');
                    await this.io.lln('`2more beautiful then the Barmaid `5VIOLET`2!!! The stories people make up.');
                    await this.io.sln();
                    await this.io.sln();
                    await this.pressAKey();
                    break;
                case '1':
                    this.menuRedisplay=true;
                    if(!this.graRecord.ghost) {
                        this.graRecord.ghost = true;
                        this.graRecord.put();
                        await this.graGhostTanya();
                    }
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    menuDone = true;
                    this.menuRedisplay=true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }

        } while (!menuDone);
    }

    async mainMenu(): Promise<void> {
        let menuChoice: string;
        let menuDone = false;

        do {
            if (this.menuRedisplay == true) {
                await this.displayMenu('MAIN');
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('The Graveyard', [
                // Secret key: backtick is filtered from UI buttons but accepted from keyboard
                { key: '`', label: 'Look around quietly' },
                { key: 'E', label: 'Enter the Shack' },
                { key: 'T', label: 'Talk to Grave Digger' },
                { key: 'G', label: 'Rob a Grave' },
                { key: 'S', label: 'Lemon-Aide Stand' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case '`':
                    this.menuRedisplay=true;
                    if(!this.graRecord.kitten) {
                        this.graRecord.kitten = true;
                        this.graRecord.put();
                        await this.graKitten();
                    }
                    break;
                case 'E':
                    this.menuRedisplay=true;
                    await this.graShack();
                    break;
                case 'T':
                    this.menuRedisplay=true;
                    await this.graDigger();
                    break;
                case 'G':
                    this.menuRedisplay=true;
                    if(this.graRecord.graverobbed == true) {
                        await this.io.sln();
                        await this.io.lln('`2You think that robbing more than one grave today would be too DANGEROUS!');
                        await this.io.lln('`2So at the last minute you stop yourself.');
                        await this.io.sln();
                        await this.io.lln('`2Tomorrow is a new day afterall...');
                        await this.io.sln();
                        await this.pressAKey();
                    } else {
                        this.graRecord.graverobbed = true;
                        this.graRecord.put();
                        await this.graGraveRob();
                    }
                    break;
                case 'S':
                    this.menuRedisplay=true;
                    await this.graLemon();
                    break;
                case 'V':
                    this.menuRedisplay=true;
                    await this.io.showStats();
                    break;
                case 'L':
                    if(await this.areYouSure()) {
                        menuDone = true;
                    }
                    this.menuRedisplay = true;
                    break;
                case '?':
                    this.menuRedisplay=true;
            }
        } while (!menuDone);
    }

    async main(): Promise<void> {
        await this.buildMenuIndex();
        this.graInitialize();

        this.io.sclrscr();
        await this.graIntro();

        await this.mainMenu();
        await this.exitGame();
    }
}

export default Gravyard;
