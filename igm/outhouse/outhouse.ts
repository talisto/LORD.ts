/**
 * The Outhouse - IGM for LORD
 * Ported from Javascript source code
 * JS v1.0 - by Lloyd Hannesson
 */
import * as path from 'path';
import { random, prettyInt } from '@lordts/util/Util';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type IO from '@lordts/core/io/IO';
import type State from '@lordts/core/State';
import type { PromptOption } from '@lordts/core/GameEvents';

const outhouseName: string = 'The Outhouse';
const outhouseVersion: string = 'JS v1.0';

interface RecordDef {
    prop: string;
    name?: string;
    type: string;
    def: unknown;
}

interface OutouseRecord {
    lrdrecord: number;
    day: number;
    business: boolean;
    put(): void;
}

interface PlayerRecord {
    Record: number;
    name: string;
    sex: string;
    gold: number;
    gem: number;
    cha: number;
    def: number;
    str: number;
    level: number;
    forest_fights: number;
    weapon: string;
    arm: string;
    put(): void;
}

const Outhouse_Defs: RecordDef[] = [
    {
        prop: 'lrdrecord',
        name: 'Lord Player Record #',
        type: 'SignedInteger',
        def: -1
    },
    {
        prop: 'day',
        name: 'Lord Day last played.',
        type: 'Integer',
        def: 123456  // Sentinel: guaranteed != state.days, forcing maint on first use
    },
    {
        prop: 'business',
        name: 'Done your business?',
        type: 'Boolean',
        def: false
    }
];

class Outhouse {
    private io: IO;
    private player: PlayerRecord;
    private state: State;
    private igmDir: string;
    private storage: IStorage;
    private menuRedisplay: boolean;
    private menuDone: boolean;
    private outhouseFile: IRecordFile | null;
    private outhouseRecord: OutouseRecord | null;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.state = deps.state;
        this.igmDir = path.join(deps.runtimeDir, 'outhouse') + path.sep;
        this.storage = deps.storage;
        this.menuRedisplay = true;
        this.menuDone = false;
        this.outhouseFile = null;
        this.outhouseRecord = null;
    }

    static get desc(): string { return '`0T`2he `0O`2uthouse'; }

    /** Server-side daily maintenance hook: reset per-player "done business" flags for stale records. */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDir = path.join(deps.runtimeDir, 'outhouse') + path.sep;
        const uf = deps.storage.create(igmDir + 'outhouse.dat', Outhouse_Defs);
        for (let i = 0; i < uf.length; i++) {
            const rec = uf.get(i) as unknown as OutouseRecord;
            if (rec.day !== deps.state.days) {
                rec.day = deps.state.days;
                rec.business = false;
                rec.put();
            }
        }
    }

    private get record(): OutouseRecord {
        if (!this.outhouseRecord) throw new Error('Outhouse record not initialized');
        return this.outhouseRecord;
    }

    private get file(): IRecordFile {
        if (!this.outhouseFile) throw new Error('Outhouse file not initialized');
        return this.outhouseFile;
    }

    async run(): Promise<void> {
        await this.main();
    }

    /* Utility Functions */

    async exitGame(): Promise<void> {
        let i: number;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`2Thanks for visiting`% ' + outhouseName + ' `0' + outhouseVersion, 1);
        await this.io.lw(' `2Now returning to Other Places');
        for (i = 0; i < 5; i++) {
            await this.io.mswait(300);
            await this.io.lw('`4.');
        }

        this.player.put();
        this.record.put();
        this.file.close();
    }

    async commandPrompt(currentPlace: string, options: PromptOption[]): Promise<string> {
        let ch: string;
        const validKeys = options.map(o => o.key.toUpperCase());

        await this.io.sln();
        await this.io.lln('`#[`5' + currentPlace + '`#]  `2(? for menu)');
        await this.io.lw('`2  Your command, `0' + this.player.name + '`2 : ');

        this.io.emitPrompt('outhouse_command', options);
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (validKeys.indexOf(ch) === -1);

        await this.io.lw('`2' + ch);
        return ch;
    }

    async pressAKey(noClear?: number): Promise<void> {
        //lw('  `2<`0MORE`2>');
        await this.io.lw(' `@· `0Press A Key `@·');
        await this.flushKeys();
        this.io.emitPrompt('outhouse_continue', [{ key: 'any', label: 'Continue' }]);
        await this.io.getkey();
        if (noClear) {
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
            'outhouse_quit_confirm',
            { echo: false, leadingBlank: false, trailingBlank: false }
        );
        if (ch === 'Y') {
            return true;
        }
        await this.io.sln();
        return false;
    }

    async flushKeys(): Promise<void> {
        while (await this.io.waitkey(0)) {
            await this.io.getkey();
        }
    }

    async saySlow(str: string, ms?: number): Promise<void> {
        // yoinked and modified from barak.js!
        let i: number;
        ms = (ms === undefined || ms === 0) ? 100 : ms;
        for (i = 0; i < str.length; i++) {
            this.io.sw(str[i]);
            await this.io.mswait(ms);
        }
    }

    prettyInt(n: number): string {
        return prettyInt(n);
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
        this.player.gold = this.player.gold + parseInt(String(gold), 10);
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

    /* Other Functions */

    private async outhouseIntro(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%' + outhouseName + ' - Ver ' + outhouseVersion, 0);
        await this.io.sln();
        await this.io.lln('`2An IGM for LORD by `0SETH ABLE ROBINSON', 0);
        await this.io.lln('`2Thanks to Stephen Hurd (Deuce) and other contributors for porting LORD to JS!', 0);
        await this.io.sln();
        await this.io.lln('`2Written By `%Lloyd Hannesson', 0);
        await this.io.lln('`2Original Concept By `#Robert Fogt', 0);
        await this.io.sln();
        await this.io.lln('`2Email me for support/bug reports: `%dasme@dasme.org', 0);
        await this.io.sln();
        await this.io.lln('`4Copyright (c) 1995-2023 - Lloyd Hannesson', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    private outhouseMaint(): void {
        this.record.day = this.state.days;
        this.record.business = false;
        this.record.put();
    }

    private outhouseInitialize(): void {
        let i: number;
        let recordFound: boolean = false;

        this.outhouseFile = this.storage.create(this.igmDir + 'outhouse.dat', Outhouse_Defs);

        if (this.outhouseFile.length < 1) {
            this.outhouseRecord = this.outhouseFile.new() as unknown as OutouseRecord;
            this.outhouseRecord.lrdrecord = this.player.Record;
            this.outhouseRecord.day = this.state.days;
            this.outhouseRecord.put();
        } else {

            /*
            We will have to iterate through all of the records. If we can't match the
            LoRD record ID, we'll have to create a new record.
            */
            for (i = 0; i < this.outhouseFile.length; i++) {
                this.outhouseRecord = this.outhouseFile.get(i) as unknown as OutouseRecord;
                if (this.outhouseRecord.lrdrecord == this.player.Record) {
                    recordFound = true;
                    break;
                }
            }

            // If we didn't find our record, we'll have to add one here.
            if (!recordFound) {
                this.outhouseRecord = this.outhouseFile.new() as unknown as OutouseRecord;
                this.outhouseRecord.lrdrecord = this.player.Record;
                this.outhouseRecord.day = this.state.days;
                this.outhouseRecord.put();
            }

            // If we do have a record and it's a new day, reset all of the booleans.
            if (this.record.day != this.state.days) {
                this.outhouseMaint();
            }
        }
    }

    private async foundShiny(): Promise<void> {
        let temp: number;

        await this.pressAKey(1);
        await this.io.lln('`2As you are getting up you notice a quick flash of something shiny out of the corner of your eye. Looking closer you see an item inside of the hole you just sat on.', 4);
        await this.io.sln();
        await this.io.lln('Against all common sense and everything your mother told you, you', 4);
        await this.io.lw('make a grab for the item', 2);

        await this.saySlow('.....', 400);

        const rand = random(2);

        if (rand == 0) {
            temp = this.player.level * 3500;
            this.goldCheck(temp);
            this.player.put();
            await this.io.lln('and find a pouch with `%' + this.prettyInt(temp) + '`2 gold!', 1);
        } else {
            temp = this.player.level * 3;
            this.gemCheck(temp);
            this.player.put();
            await this.io.lln('and find a small pouch with `%' + temp + '`2 gems!', 1);
        }

        await this.io.sln();
        await this.io.lln('`0"I wonder who left this here?" `2you think to yourself `0"wait, I hope that this was placed here and not..." `2you stop yourself and decide to just take the `%WIN`2 and not worry about the `4HOW`2.', 4);
    }

    private async inTheOuthouse(): Promise<boolean> {
        let pooped: boolean = false;
        let rand: number;

        if (this.player.forest_fights < 1) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`2You were heading towards the outhouse when you realized that you\'re too tired. You turn around and head back to town.');
            await this.io.sln();
            await this.io.lln('`0You really didn\'t have to go that bad anyways, maybe tomorrow.');
            await this.io.sln();
            await this.pressAKey();
        } else {
            this.forestCheck(-1);
            rand = random(3);

            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`%In the Outhouse');
            await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);

            switch (rand) {
                case 0:
                    await this._outhouseCharmScene();
                    break;
                case 1:
                    await this._outhouseDefenseScene();
                    break;
                case 2:
                    await this._outhouseStrengthScene();
            }

            this.record.business = true;
            this.record.put();
            this.player.put();
            pooped = true;

            rand = random(3);

            if (rand == 0) {
                await this.io.sln();
                await this.foundShiny();
                await this.io.sln();
                await this.pressAKey(1);
            }

            await this.io.sln();
            await this.io.lln('`2Satisfied, you turn and run back to the realm.');
            await this.io.sln();

            await this.pressAKey(1);
        }

        return pooped;
    }

    private async behindTheTrees(): Promise<boolean> {
        let pooped: boolean = false;
        let rand: number;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%Behind the Trees');
        await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);
        await this.io.lln('`2You wait until nobody is looking and run towards the trees. You really have to go bad, and if you don\'t do something quick you\'ll explode!', 4);
        await this.io.sln();
        await this.io.lln('`0You hear voices in the distance but you cant tell if they are coming closer or not.', 4);
        await this.io.sln();
        await this.io.lln('`2You grab some leaves off the nearest tree and think about your options and wonder if you should take a chance and try to go here?', 4);
        await this.io.sln();
        const ch = await this.io.prompt(
            '  `2Do you want chance it? [`0Y`2/`0N`2]  ',
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'outhouse_chance',
            { leadingBlank: false, trailingBlank: false, echoStyle: 'char' }
        );
        await this.io.lw('`2');
        await this.io.sln();
        await this.io.sln();

        if (ch == 'Y') {
            // 30% caught (lose 1 charm), 70% success (gain 1 charm)
            rand = random(10);
            switch (rand) {
                case 0:
                case 1:
                case 2:
                    await this._behindTreesCaught();
                    pooped = true;
                    break;
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                case 8:
                case 9:
                    await this._behindTreesSuccess();
                    pooped = true;
            }

            this.record.business = true;
            this.record.put();
        }

        await this.io.sln();
        await this.io.lln('`2You turn, and run back to the realm.');
        await this.io.sln();
        await this.pressAKey();
        this.menuDone = true;

        return pooped;
    }

    private async _outhouseCharmScene(): Promise<void> {
        this.charmCheck(2);
        await this.io.lln('`2After waiting for what seemed like hours, you finally get to the old Outhouse door. You enter, sit down, and can now get down to business.', 4);
        await this.io.lln('`2This place seems nicer than some rooms at the Inn. There is even a small wash basin and mirror on the wall. Neat!');
        await this.io.sln();
        await this.io.lln('`2After doing your business, you take the time to wash up and comb your hair.');
        await this.io.sln();
        await this.io.lln('`0You look much better now.');
        await this.io.sln();
        await this.io.lln('`%YOU GAIN 2 CHARM POINTS!', 5);
    }

    private async _outhouseDefenseScene(): Promise<void> {
        this.defCheck(2);
        await this.io.lln('`2After waiting for what seemed like hours, you finally get to the old Outhouse door. You enter, sit down, and can now get down to business.', 4);
        await this.io.lln('This place seems nicer than some rooms at the Inn!');
        await this.io.sln();
        await this.io.lln('While doing your business you notice a small tear in your `0' + this.player.arm + '`2, but thankfully it looks fixable!');
        await this.io.sln();
        await this.io.lln('You grab your repair kit from your backpack and manage to perfectly repair the damage!');
        await this.io.sln();
        await this.io.lln('`%YOU GAIN 2 DEFENSE POINTS!', 5);
    }

    private async _outhouseStrengthScene(): Promise<void> {
        this.strCheck(2);
        await this.io.lln('`2You enter the Outhouse, sit down and quickly get down to business.', 4);
        await this.io.lln('To pass the time you start to sing one of your favourite drinking songs, "`5Ode to the Red Dragon `#(`5Please don\'t eat me`#)`2". You must have been quite noisy since someone starts banging on the Outhouse wall.');
        await this.io.sln();
        await this.io.lln('The vibrations of your voice, combined with the banging dislodged some of the nails holding this shack together. They fall PERFECTLY onto your `0' + this.player.weapon + '`2!', 4);
        await this.io.sln();
        await this.io.lln('Besides looking bad-ass, they look like they will actually increase the damage! Who needs to work out when you can just attach more pointy things to your weapon!?', 4);
        await this.io.sln();
        await this.io.lln('`%YOU GAIN 2 ...err... "STRENGTH" POINTS!', 5);
    }

    private async _behindTreesCaught(): Promise<void> {
        this.charmCheck(-1);
        this.player.put();
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%Oh... oh no. Noooo.');
        await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);
        await this.io.lln('`2As you drop your pants, a large group of people walk by. You hear laughter and look up to see the group of people pointing and snickering.', 4);
        await this.io.sln();
        await this.io.lln('In your rush to get away you manage to `0step in the mess you made`2.');
        await this.io.sln();
        await this.io.lln('After the crowd disperses, you manage to clean yourself up a bit in the nearby river. It will be a while before you\'ll be able to wash your embarrassment away.', 4);
        await this.io.sln();
        await this.io.lln('`4YOU LOSE 1 CHARM!', 5);
    }

    private async _behindTreesSuccess(): Promise<void> {
        this.charmCheck(1);
        this.player.put();
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%Finally... Relief!');
        await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);
        await this.io.lln('`2You make your way to the trees and find a nice well hidden bush.', 4);
        await this.io.lln('Thankfully it seems as the nearby crowd has dispersed and you are free to do your business in peace.');
        await this.io.sln();
        await this.io.lln('`2You feel better now. Man, that was close one! You have a new pep in your step and it shows!', 4);
        await this.io.sln();
        await this.io.lln('`%YOU GAIN 1 CHARM!', 5);
    }

    private async _handleWaitChoice(): Promise<void> {
        if (this.record.business != true) {
            const poopCheck = await this.inTheOuthouse();
            if (poopCheck) {
                this.menuDone = true;
            }
        } else {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`2As much as you would like to go again, you just don\'t have anything left to give... maybe after a meal and some strong mead.');
            await this.io.sln();
            await this.io.lln('`2You turn around and head back to town.');
            await this.io.sln();
            await this.pressAKey();
            this.menuDone = true;
        }
    }

    private async _handleTreesChoice(): Promise<void> {
        if (this.record.business != true) {
            const poopCheck = await this.behindTheTrees();
            if (poopCheck) {
                this.menuDone = true;
            }
        } else {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`2As much as you would like to go again, you just don\'t have anything else to give... maybe after a meal and some strong mead.');
            await this.io.sln();
            await this.io.lln('`2You turn around and head back to town.');
            await this.io.sln();
            await this.pressAKey();
            this.menuDone = true;
        }
    }

    /* Menus */

    async mainMenu(): Promise<void> {
        let menuChoice: string;

        do {
            if (this.menuRedisplay == true) {
                this.io.sclrscr();
                await this.io.sln();
                await this.io.lln('`5.·`#──`2[`0The Outhouse`2]`#──`5·.');
                await this.io.sln();
                await this.io.lln('`2You realize that you really do need to make a pit stop so you head towards the outhouses. When you get there you see a `0very `2long line.', 4);
                await this.io.lln('`2You also notice some trees a fair distance away that look deserted. If you do decide to wait in line you\'ll lose `01`2 forest fight today. A small sign is nearby in the clearing.');
                await this.io.sln();
                await this.io.lln('`2What would you like to do?');
                await this.io.sln();
                await this.io.lln('`5·`2[`0w`2]`5· `0W`2ait in line at the outhouse.', 8);
                await this.io.lln('`5·`2[`0g`2]`5· `0G`2o behind the trees.', 8);
                await this.io.lln('`5·`2[`0r`2]`5· `0R`2ead the small sign.', 8);
                await this.io.lln('`5·`2[`0l`2]`5· `0L`2eave, you decide to just hold it for awhile.', 8);
                await this.io.sln();
                this.menuRedisplay = false;
            }

            menuChoice = await this.commandPrompt('The Outhouse', [
                { key: 'W', label: 'Wait in line' },
                { key: 'G', label: 'Go behind the trees' },
                { key: 'R', label: 'Read the sign' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();

            switch (menuChoice) {
                case 'W':
                    this.menuRedisplay = true;
                    await this._handleWaitChoice();
                    break;
                case 'G':
                    this.menuRedisplay = true;
                    await this._handleTreesChoice();
                    break;
                case 'R':
                    this.menuRedisplay = true;
                    await this.outhouseIntro();
                    break;
                case 'L':
                    if (await this.areYouSure()) {
                        this.menuDone = true;
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.lln('`2You realize that you don\'t have to go as bad as you thought...');
                        await this.io.lln('`2You turn, and run back to the realm.');
                        await this.io.sln();
                        await this.pressAKey(1);
                    }
                    this.menuRedisplay = true;
                    break;
                case 'V':
                    this.menuRedisplay = true;
                    await this.io.showStats();
                    break;
                case '?':
                    this.menuRedisplay = true;
            }
        } while (!this.menuDone);
    }

    async main(): Promise<void> {
        this.outhouseInitialize();

        this.io.foreground(2);
        this.io.background(0);
        this.io.sclrscr();

        if (this.record.business) {
            await this.io.sln();
            await this.io.lln('`%The Outhouse');
            await this.io.lln('`2-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-', 0);
            await this.io.sln();
            await this.io.lln('`2You were heading towards the outhouse when you realized that you\'re too tired. You turn around and head back to town.');
            await this.io.sln();
            await this.io.lln('`2You really didn\'t have to go that bad anyways, maybe tomorrow...');
            await this.io.sln();
            await this.pressAKey();
        } else {
            await this.mainMenu();
        }
        await this.exitGame();
    }
}

export default Outhouse;
