/**
 * Marriage - Romance and marriage mechanics for LORD.
 *
 * Handles player-to-player and player-to-NPC marriage proposals, divorces,
 * and the daily benefits granted to married characters. Also manages the
 * shared Seth-the-Bard and Violet-the-Barmaid NPC marriage state stored in
 * the game's State record.
 */
import { random, prettyInt, cleanStr } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type IO from './io/IO';
import type State from './State';
import type Player from './Player';
import type Mail from './Mail';
import type Log from './Log';
import type { IStorage } from '@lordts/storage/IStorage';
import type { LoadedPlayerRecord, UiMode } from './types';
import { HiddenPlayerPolicy } from './HiddenPlayerPolicy';

export class Marriage {
    constructor(
        private io: IO,
        private state: State,
        private mail: Mail,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _uiMode: UiMode,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get player(): Player { return this._player.value; }
    get log(): Log { return this._log.value; }
    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get storage(): IStorage { return this._storage.value; }

    // ── Marriage mechanics ───────────────────────────────────────────

    divorceSeth(): void {
        this.state.married_to_seth = -1;
        this.storage.releaseNpcMarriage('seth');
    }

    divorceViolet(): void {
        this.state.married_to_violet = -1;
        this.storage.releaseNpcMarriage('violet');
    }

    async violetMarriage(): Promise<void> {
        let mstr = '\n`%  Latest news about `#Violet`%, your wife.\n`l\n';
        const husband = this.player.playerGet(this.state.married_to_violet);
        if (!husband) return;

        // 20% daily chance of NPC marriage ending; charm halved as penalty
        if (random(5) < 1) {
            this.divorceViolet();
            husband.cha = Math.floor(husband.cha / 2);
            husband.put();
            switch (random(3)) {
                case 0:
                    await this.log.logLine('`2`#Violet`2 has `%DIVORCED `0'+husband.name+'`2 for cheating on her with\n'+
                        '`2`4Grizelda!  `#Violet`2 got her barmaid job back!');
                    mstr += '  `2Violet has divorced you because Grizelda said you kissed her!  You\n';
                    mstr += '  curse Grizelda!  What will people think?\n';
                    break;
                case 1:
                    await this.log.logLine('`2`#Violet`2 has `%LEFT `0'+husband.name+'`2 so she could get her old job\n'+
                        '`2back at the Inn!  `0'+husband.name+' `2is heartbroken.');
                    mstr += '  `2You hunt around the house for Violet, and all you find is a note!  She\n';
                    mstr += '  left you!  She could not resist the temptation of working at the Inn\n';
                    mstr += '  once again.  You try to control your convulsive sobs.\n';
                    break;
                case 2:
                    await this.log.logLine('`2`0'+husband.name+' `2has `%DIVORCED `#Violet`2 because she refused to do\n'+
                        '`2any housework!  She got her old job back at the Inn!');
                    mstr += '  `2You ask Violet to wash the dishes, and she refuses!  You have a big\n';
                    mstr += '  fight!  You decide she isn\'t the women you married, and divorce her.\n';
                    mstr += '  The whole experience has left you bitter.\n';
                    break;
            }
            mstr += '\n';
            mstr += '  `4CHARM DROPS TO '+prettyInt(husband.cha)+'\n';
            await this.mail.mailTo(husband.Record, mstr);
        }
        else {
            // NPC marriage daily rewards: 100*level (routine), 150*level
            // (son born), 50*level (daughter born), 200*level (event)
            switch(random(4)) {
                case 0:
                    await this.log.logLine('`2`#Violet`2 has `%PMS!  `0'+husband.name+'`2 is understanding, and peace\n'+
                        '`2is restored.  For now.');
                    mstr += '  `2Violet gets angry over little things!  You realize she has PMS this\n';
                    mstr += '  morning.  You treat her gently and calamity is avoided.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(100 * husband.level)+' EXPERIENCE.\n';
                    husband.exp += (100 * husband.level);
                    break;
                case 1:
                    await this.log.logLine('`2`#Violet`2 bears `0'+husband.name+'`2 a male child.');
                    mstr += '  `2Violet bears you a male child.  You have never loved her more.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(150 * husband.level)+' EXPERIENCE.\n';
                    husband.exp += (150 * husband.level);
                    husband.kids += 1;
                    break;
                case 2:
                    await this.log.logLine('`2`#Violet`2 bears `0'+husband.name+'`2 a female child.');
                    mstr += '  `2Violet bears you a female child.  You are a little disappointed.\n';
                    mstr += '  However, you are very pleased she retained her voluptuous figure.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(50 * husband.level)+' EXPERIENCE.\n';
                    husband.exp += (50 * husband.level);
                    husband.kids += 1;
                    break;
                case 3:
                    await this.log.logLine('`2`#Violet`2 and `0'+husband.name+'`2 didn\'t appear to get much sleep'+
                        '`2last night.  The town is mystified.');
                    mstr += '  `2Violet pleases you in ways you had only dreamed about.  Nothing\n';
                    mstr += '  has ever felt so good as your wife giving herself freely to you.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(100 * husband.level)+' EXPERIENCE.\n';
                    husband.exp += (100 * husband.level);
                    break;
            }
            husband.put();
            await this.mail.mailTo(husband.Record, mstr);
        }
    }

    async sethMarriage(): Promise<void> {
        let mstr = '\n`%  Latest news about `0Seth Able`%, your husband.\n`l\n';
        const wife = this.player.playerGet(this.state.married_to_seth);
        if (!wife) return;

        if (random(5) < 1) {
            this.divorceSeth();
            wife.cha = Math.floor(wife.cha / 2);
            wife.put();
            switch(random(3)) {
                case 0:
                    await this.log.logLine('`2`%Seth Able`2 has `%DIVORCED `0'+wife.name+'`2 for cheating on him with\n'+
                        '`2the Bartender!  He now sings a song of woe!');
                    mstr += '  `2Seth Able has divorced you because the Bartender said you kissed him!\n';
                    mstr += '  You curse him!  What will people think?\n';
                    break;
                case 1:
                    await this.log.logLine('`2`0Seth Able `2has been `%BOOTED `2by `0'+wife.name+'`2!  Artistic\n'+
                        '`2differences are to be blamed.');
                    mstr += '  `2You are getting tired of seeing Seth hang around the house in his\n';
                    mstr += '  underwear \'composing\' music.  You tell him to get a real job.\n';
                    mstr += '  There is a fight - And you end up booting this artist.\n';
                    break;
                case 2:
                    await this.log.logLine('`2`0'+wife.name+' `2has `%DIVORCED `0Seth Able`2 because he refused to do\n'+
                        '`2any housework!  It is "womans work" was his reply!');
                    mstr += '  `2You ask Seth to wash the dishes, and he refuses!  You have a big\n';
                    mstr += '  fight!  You decide he isn\'t the man you married, and divorce him.\n';
                    mstr += '  The whole experience has left you bitter.\n';
                    break;
            }
            mstr += '\n';
            mstr += '  `4CHARM DROPS TO '+prettyInt(wife.cha)+'\n';
            await this.mail.mailTo(wife.Record, mstr);
        }
        else {
            switch(random(4)) {
                case 0:
                    await this.log.logLine('`2`0'+wife.name+'`2 screams at `%Seth Able `2for leaving\n'+
                        '`2the lid up!  Seth is able to calm her down - peace is restored.');
                    mstr += '  `2You wake up to find the tiolet seat up - AGAIN!  You scream your\n';
                    mstr += '  objections at your man - He promises to be more carefull in the future.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(100 * wife.level)+' EXPERIENCE.\n';
                    wife.exp += (100 * wife.level);
                    wife.put();
                    await this.mail.mailTo(wife.Record, mstr);
                    break;
                case 1:
                    await this.log.logLine('`2`0'+wife.name+'`2 bears a male child - `%Seth Able`2 is proud.');
                    mstr += '  You bear a male child!  Seth Able is extremely pleased with you.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(150 * wife.level)+' EXPERIENCE.\n';
                    wife.exp += (150 * wife.level);
                    wife.kids += 1;
                    wife.put();
                    await this.mail.mailTo(wife.Record, mstr);
                    break;
                case 2:
                    await this.log.logLine('`2`0'+wife.name+'`2 bears a female child - `%Seth Able `2approves.');
                    mstr += '  `2You bear a female child!  You are puzzled why Seth is not as happy\n';
                    mstr += '  as you.  He refuses to speak about it.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(50 * wife.level)+' EXPERIENCE.\n';
                    wife.exp += (50 * wife.level);
                    wife.kids += 1;
                    wife.put();
                    await this.mail.mailTo(wife.Record, mstr);
                    break;
                case 3:
                    await this.log.logLine('`2`%Seth Able`2 and `0'+wife.name+'`2 didn\'t appear to get much sleep\n'+
                        '`2last night.  The town is mystified.');
                    mstr += '  `2Seth Able pleases you in ways you had only dreamed about.  Nothing\n';
                    mstr += '  has ever felt so good as your husband doing the chores around the house.\n';
                    mstr += '\n';
                    mstr += '  `%YOU RECEIVE '+prettyInt(100 * wife.level)+' EXPERIENCE.\n';
                    wife.exp += (100 * wife.level);
                    wife.put();
                    await this.mail.mailTo(wife.Record, mstr);
                    break;
            }
        }
    }

    async romance(prompt: string, mopts: string[], fopts: string[], to: number, shorttxt: string, mailtxt: string, kind: string): Promise<boolean> {
        let line: string;

        this.io.sw(prompt);
        if (this.player.sex === 'M') {
            line = mopts[random(mopts.length)];
        }
        else {
            line = fopts[random(fopts.length)];
        }

        this.io.emitPrompt('marriage_flirt', [], 'line', line);
        line = cleanStr(await this.io.getstr({ x: 0, y: 0, len: 53, c: 1, c1: 15, edit: line }));
        await this.io.sln();
        await this.io.sln();

        // Original LORD requires at least 5 chars to send a romantic message
        if (line.length < 5) {
            await this.io.sln(shorttxt);
            return false;
        }

        this.io.foreground(15);
        await this.io.sln('** WRITING ROMANTIC MAIL, PLEASE WAIT **');
        line = '`0  "'+line+'`0"';
        await this.mail.mailTo(to, ' \n'+
            '  `2Romantic Message From `0' + this.player.name + '`2!\n'+
            '`l\n'+
            mailtxt+'\n'+
            '  `2\n'+
            line+'\n'+
            '`'+kind+this.player.Record);
        return true;
    }

    async haveBaby(): Promise<void> {
        await this.io.sln();
        await this.io.lln('`0** `%YOU FEEL SICK THIS MORNING! `0**');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2You head to the healers in dismay, what can it be?');
        await this.io.sln();
        await this.io.moreNoMail();
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln('Healers');
        this.io.foreground(1);
        await this.io.sln(this.io.divider());
        this.io.foreground(2);
        await this.io.lln('`0"Madam!  You are with child, and it\'s due right now!"');
        this.io.foreground(2);
        await this.io.sln('Nathan, an elderly healer yells.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('At this moment, you feel something ripping your insides out.  You realize that it\'s childbirth pain.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('Then the fun begins.  Three hours of sweat and screaming later, it is over.  Nathan hands you a small bundle with tears in his eyes.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lw('`0The baby is `%', 2);
        // Birth outcomes: 1-9 = boy (45%), 10-19 = girl (50%), 20 = stillbirth (5%)
        const n = random(20) + 1;
        if (n === 20) {
            await this._haveBabyStillbirth();
        }
        else if (n < 10) {
            await this._haveBabyBoy();
        }
        else {
            await this._haveBabyGirl();
        }
    }

    async checkMarriage(): Promise<void> {
        const goodMood = ['Happy', 'Wonderful', 'Joyous', 'Excited', 'Loving',
            'Lucky', 'Providential', 'Felicitous', 'Glad', 'Light-hearted'];
        const badMood = ['Angry','Resentful','Disgusted','Revolted','Repulsed',
            'Sickened','Nauseated','Betrayed','Let Down','Cheated On'];

        if (this.state.married_to_seth === this.player.Record) {
            return;
        }
        if (this.state.married_to_violet === this.player.Record) {
            return;
        }
        if (this.player.married_to < 0) {
            return;
        }
        const op = this.player.playerGet(this.player.married_to);
        if (!op) return;
        if (HiddenPlayerPolicy.isPlayerHidden(this.storage, op.Record)) {
            await this.io.sln();
            await this.io.lln('`2Your lover has been declared MISSING!');
            await this.io.sln();
            await this.io.lln('`2No one knows when they may return.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        // Name 'X' is the sentinel for a deleted/purged player record
        if (op.name === 'X') {
            await this.io.sln();
            await this.io.lln('`2Your lover has been declared MISSING!');
            await this.io.sln();
            await this.io.lln('`%YOU FEEL HEARTBROKEN!  (CHARM DROPS 50%)');
            await this.io.sln();
            this.player.married_to = -1;
            this.player.cha = Math.floor(this.player.cha / 2);
            await this.io.moreNoMail();
            return;
        }
        await this.io.lln('`2You notice `0'+op.name+'`2 is asleep in your bed.');
        await this.io.sln();
        await this.io.lln('`%You feel...');
        await this.io.sln();
        const good = goodMood[random(goodMood.length)];
        const bad = badMood[random(badMood.length)];
        await this.io.lln('`2(`01`2) `%'+good);
        await this.io.lln('`2(`02`2) `%'+bad);
        const ch = await this.io.prompt(
            '  `0Choose.  [`21`0] :`%',
            [{ key: '1', label: 'Good mood' }, { key: '2', label: 'Bad mood' }],
            'mood_choice',
            { defaultKey: '1', leadingBlank: false }
        );
        if (ch === '1') {
            await this.io.lln('`2You smile at `%'+op.name+'`2.  Life is good.');
            await this.io.sln();
        }
        else {
            await this._handleBadMoodDivorce(op);
        }
    }

    async conjugalityList(): Promise<void> {
        let mt;
        let some = false;
        let l = 0;
        const phrase = ['hitched with','attached to','in love with','a love slave to',
            'smitten with love for','in matrimony with','in marital bliss with','wedded to'];

        if (this.rip)
            await this.io.showRip('W1');
        await this.io.lln('`c`>`%** CONJUGALITY LIST **');
        await this.io.lln('`>' + this.io.divider(25, '`2'), 0);
        this.player.put();
        await this.io.sln();
        await this.state.getState(false);
        const allPlayers = this.player.allPlayers();
        for (let i = 0; i < allPlayers.length; i++) {
            const op: LoadedPlayerRecord = allPlayers[i];
            // DIFF: This check if name length was over 2 chars...
            if (op.name !== 'X') {
                // Only print when i < married_to to avoid listing the same couple twice
                if (op.married_to > -1 && i < op.married_to) {
                    mt = this.player.playerGet(op.married_to);
                    if (mt) {
                        some = true;
                        await this.io.lln('`0'+op.name+' `2is '+phrase[l]+' `0'+mt.name+'`2.');
                        l += 1;
                        if (l >= phrase.length) {
                            l = 0;
                        }
                    }
                }
                if(i === this.state.married_to_seth) {
                    some = true;
                    await this.io.lln('`0'+op.name+' `2is the property of `0Seth Able`2.');
                }
                if(i === this.state.married_to_violet) {
                    some = true;
                    await this.io.lln('`0'+op.name+' `2belongs to `0Violet`2.');
                }
            }
        }
        if (!some) {
            await this.io.lln('`%No one is married in this realm.');
        }
        await this.io.sln();
        await this.io.moreNoMail();
    }

    // Called from Output.lw ext case '?' - confirms marriage record linkage
    handleMarryConfirm(from: number): void {
        const to = from;
        if (to > -1) {
            const oop = this.player.playerGet(to);
            if (!oop) return;
            if (oop.married_to === this.player.Record) {
                this.player.married_to = to;
                this.player.put();
            }
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    // Called from Output.lw ext case 'P' - handles a marriage proposal
    async handleMarryProposal(from: number): Promise<void> {
        const to = from;
        const oop = this.player.playerGet(to);
        if (!oop) return;

        await this.io.sln();
        await this.state.getState(false);
        if (this.player.married_to > -1 || this.state.married_to_seth === this.player.Record || this.state.married_to_violet === this.player.Record) {
            this.io.foreground(15);
            await this.io.sln('BECAUSE YOU ARE ALREADY MARRIED, YOU ARE FORCED TO DECLINE!');
            await this.io.sln();
            await this.mail.mailTo(to, '`%  ** Romantic Mail Return From '+this.player.name+'`% **\n'+
                '`l\n'+
                '`0  '+this.player.name+'`2 is already married, and cannot say yes.');
            await this.log.logLine('`%** `0'+this.player.name+' `2 had to decline `0'+oop.name+'`2\'s marriage proposal! `%**');
            await this.io.moreNoMail();
        }
        if (oop.married_to > -1 || this.state.married_to_seth === oop.Record || this.state.married_to_violet === oop.Record) {
            await this.io.lln('`%'+oop.name+' `0is already married!  No is the only answer.');
            await this.io.sln();
            await this.mail.mailTo(to, '`%  ** Romantic Mail Return From '+this.player.name+'`% **\n'+
                '`l'+
                '`0  '+this.player.name+' `2refuses to marry you!  You are already married!');
            await this.log.logLine('`%** `0'+this.player.name+' `2decides not to marry a married person. `%**');
            await this.io.moreNoMail();
        }
        // marry_mail inline from lw
        const mop = this.player.playerGet(to);
        if (!mop) return;

        const him = mop.sex === 'M' ? 'him' : 'her';
        const she = this.player.sex === 'M' ? 'He' : 'She';
        const her = this.player.sex === 'M' ? 'Her' : 'His';

        await this.io.lln('`2(`0S`2)ay YES!');
        await this.io.lln('`2(`0T`2)urn '+him+' down!');
        const ch = await this.io.prompt(
            '  What do you do about it? `0[`2T`0]`2 : ',
            [{ key: 'S', label: 'Say YES!' }, { key: 'T', label: 'Turn down' }],
            'marriage_response',
            { defaultKey: 'T', leadingBlank: true, trailingBlank: true }
        );
        await this.io.lln('`%** Please wait, writing '+him+' back **');
        if (ch === 'S') {
            await this._handleProposalAccepted(to, mop, she, her);
        }
        else {
            await this._handleProposalRejected(to, mop, she);
        }
        this.storage.clearQuoteBuffer(this.player.Record);
    }

    private async _haveBabyStillbirth(): Promise<void> {
        await this.io.lln('`4Not breathing`%.', 0);
        await this.io.sln();
        await this.io.moreNoMail();
        this.io.foreground(2);
        await this.io.lln('Your pain cannot be expressed in words.  You feel as though you have lost your own heart.  From this day on, everytime you think of this small helpless child who never got a chance to live, you cry.');
        await this.io.sln();
        await this.io.sln('Live is precious.  Period.');
        await this.io.sln();
        if (this.player.married_to === -1) {
            await this.log.logLine('`0'+this.player.name+' `2is grief stricken over a great loss.');
        }
        else {
            const op = this.player.playerGet(this.player.married_to);
            if (op) {
                await this.log.logLine('`0'+this.player.name+' `2and `0'+op.name+' `2are grief stricken.');
                await this.mail.mailTo(this.player.married_to,'  `0TRAGEDY STRIKE.\n'+
                    '`l\n'+
                    '  `0Your wife had a miscarriage today.  You feel you\n'+
                    '  `0should console her.\n'+
                    '`|');
            }
        }
    }

    private async _haveBabyBoy(): Promise<void> {
        await this.io.lln('`%A beautiful baby boy!', 0);
        await this.io.sln();
        await this.io.moreNoMail();
        this.player.kids += 1;
        this.io.foreground(2);
        await this.io.sln('What would you like to name this child?');
        this.io.sw('Name :', 2);
        this.io.emitPrompt('baby_name', [], 'line');
        const nm = cleanStr(await this.io.getstr({ x: 0, y: 0, len: 40, c: 1, c1: 15, edit: '' })).trim();
        let mstr = '`0'+this.player.name+' `2gives birth to a boy!  His name is `%'+nm+'`2.';
        let op;
        if (this.player.married_to > -1) {
            op = this.player.playerGet(this.player.married_to) ?? undefined;
            if (op) {
                mstr += '\n`0'+op.name+' `2is extremely proud.';
            }
        }
        await this.log.logLine(mstr);
        await this.io.sln();
        await this.io.sln();
        if (this.player.married_to === -1) {
            await this.io.lln('`2Oddly, he seems to  look a little like `%The Bard`2...');
        }
        else if (op) {
            await this.io.lln('`2He looks just like `0'+op.name+'`2.');
            mstr = '  `0JOYOUS OCCASION!\n';
            mstr += '`l\n';
            mstr += '  `2Your wife had a baby `%boy `2today!  Her face glows\n';
            mstr += '  `2like only a mothers can.  This baby is as much yours,\n';
            mstr += '  `2so you aspire to teach little `%'+nm+'`2 much.\n';
            mstr += '`K\n';
            mstr += '`|';
            await this.mail.mailTo(this.player.married_to, mstr);
        }
        await this.io.sln();
    }

    private async _haveBabyGirl(): Promise<void> {
        await this.io.lln('`%A beautiful baby girl!', 0);
        await this.io.sln();
        await this.io.moreNoMail();
        this.player.kids += 1;
        this.io.foreground(2);
        await this.io.sln('What would you like to name this child?');
        await this.io.lw('`2Name :', 2);
        this.io.emitPrompt('baby_name', [], 'line');
        const nm = cleanStr(await this.io.getstr({ x: 0, y: 0, len: 40, c: 1, c1: 15, edit: '' })).trim();
        let mstr = '`0'+this.player.name+' `2gives birth to a girl!  Her name is `%'+nm+'`2.';
        if (this.player.married_to > -1) {
            const op = this.player.playerGet(this.player.married_to);
            if (op) {
                mstr += '\n`0'+op.name+' `2is pleased.';
            }
        }
        await this.log.logLine(mstr);
        if (this.player.married_to > -1) {
            mstr = '  `0JOYOUS OCCASION!\n';
            mstr += '`l\n';
            mstr += '  `2Your wife had a baby `)girl `2today!  Her face glows\n';
            mstr += '  `2like only a mothers can.  This baby is as female, but\n';
            mstr += '  `2you hope to make a warrior out of `%'+nm+'`2 yet.\n';
            mstr += '`K\n';
            mstr += '`|';
            await this.mail.mailTo(this.player.married_to, mstr);
        }
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(2);
        await this.io.sln('You can tell she will be a heartbreaker.');
        await this.io.sln();
    }

    private async _handleBadMoodDivorce(op: LoadedPlayerRecord): Promise<void> {
        await this.io.lln('`2You scowl at the snoring figure in your bed.  Suddenly you feel your rage boiling over!');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('You kick '+op.name+' `2into consciousness.');
        await this.io.sln();
        await this.io.moreNoMail();
        if (this.player.sex === 'M') {
            await this.io.lln('The woman awakes in confusion.  `0"Get out, woman." `2you tell her harshly.');
            await this.io.sln();
            await this.io.sln('She slaps you in the face and walks out.');
            await this.io.sln();
            await this.io.lln('`%YOU FEEL FED UP WITH WOMEN!  (CHARM `)DROPS`% TO 50)');
        }
        else {
            await this.io.lln('The pig awakes in confusion.  `0"Get out of my house." `2you tell him coldly.');
            await this.io.sln();
            await this.io.lln('A short while later, he stands outside your door, naked, gawking in disbelief.');
            await this.io.sln();
            await this.io.lln('`%YOU FEEL FED UP WITH MEN!  (CHARM `)DROPS`% 50%)');
        }
        await this.io.sln();
        await this.log.logLine('`0'+this.player.name+' `2has `)DIVORCED `0'+op.name+'`2!');
        this.player.divorced = true;
        this.player.cha = Math.floor(this.player.cha / 2);
        this.storage.divorce(this.player.Record, op.Record);
        this.player.married_to = -1;
        let mstr = '`*\n';
        mstr += '  `)BAD NEWS!\n';
        mstr += '`l\n';
        mstr += '  `0'+this.player.name+' `2has `4DIVORCED `2you!\n';
        mstr += '\n';
        mstr += '  `0(CHARM DROPS 50%)';
        await this.mail.mailTo(op.Record, mstr);
    }

    private async _handleProposalAccepted(to: number, mop: LoadedPlayerRecord, she: string, her: string): Promise<void> {
        this.player.married_to = to;
        this.storage.marry(this.player.Record, to);
        mop.reLoad();
        // DIFF: See what happens here... this check is new.
        if (mop.married_to === -1 || mop.married_to === this.player.Record) {
            mop.married_to = this.player.Record;
            mop.put(false);
            this.player.put();
            await this.mail.mailTo(to, '`%  ** Romantic Mail Return From '+this.player.name+'`% **\n'+
                '`l\n'+
                '`0  '+she+' agrees to marry you!\n'+
                '\n'+
                '  The wedding is simple, but beautiful.   Your significant other\n'+
                '  stands elequently beside you, as you echange vows.)\n'+
                '\n'+
                '  `2Knowing the elders don\'t take marriage lightly, you hope it\n'+
                '  will last...\n'+
                // `? triggers handleMarryConfirm when recipient reads the mail
                '`?'+(this.player.Record));
            await this.log.logLine('`%** `0'+this.player.name+' `2said YES to `0'+mop.name+'`2\'s marriage proposal! `%**');
            await this._showWeddingCeremony(her);
        }
        else {
            // Race condition: proposer married someone else before
            // recipient responded; penalize with 100*level XP loss
            mop.unLock();
            const bae = this.player.playerGet(mop.married_to);
            if (!bae) return;
            await this.io.lln('`0'+mop.name+' laughs in your face!');
            await this.io.lln('You never answered, so I married '+bae.name+' instead!');
            await this.io.sln(''+she+' can at least answer a question.');
            await this.log.logLine('`%** `0'+this.player.name+' `2said YES to `0'+mop.name+'`2\'s marriage proposal! `%**\n`2(But not until after `0'+mop.name+'`2 already married `0'+bae.name+'`2!');
            await this.io.lln('`4YOU ARE `)ULTRA `4SNUBBED!');
            await this.io.lln('`0');
            await this.io.lln('`2You `4LOSE `%'+prettyInt(100*mop.level)+' `2experience points!');
            this.player.exp -= 100 * mop.level;
        }
    }

    private async _showWeddingCeremony(her: string): Promise<void> {
        this.io.sclrscr();
        this.io.foreground(15);
        await this.io.sln();
        await this.io.sln();
        await this.io.sln('** THE WEDDING **');
        await this.io.sln();
        this.io.foreground(2);
        await this.io.sln('Your spouse is overjoyed at your answer.  '+her+' face beams so');
        await this.io.sln('brightly,  you know you\'ve made the right choice.');
        await this.io.sln();
        await this.io.moreNoMail();
        if (this.player.sex === 'M') {
            await this._showMaleWeddingCeremony();
        }
        else {
            await this._showFemaleWeddingCeremony();
        }
        await this.io.lln('`%THE ENTIRE CROWD ROARS ITS APPROVAL!');
        await this.io.sln();
    }

    private async _showMaleWeddingCeremony(): Promise<void> {
        await this.io.sln('The vows are short and to the point - but heartfelt.  You are especially ');
        await this.io.sln('proud of the one "To have; To hold..  And to satisfy anytime she needs it"');
        await this.io.lln('(you made that one up yourself)  `%Seth Able `2laughs at the back of the');
        await this.io.sln('church at this.  Many faces turn in his direction - making him turn');
        await this.io.sln('a bright purple.');
        await this.io.sln();
        await this.io.moreNoMail();
        if (random(2) === 0) {
            await this.io.lln('`0A figure dressed in black attracts your attention in the back...');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2You recognize the voloptous curves to be `#Violet`2\'s.');
            await this.io.sln();
            await this.io.sln('A single tear glistens on her cheek.');
        }
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2Turgon solomnly gives you permission to kiss the bride.');
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async _showFemaleWeddingCeremony(): Promise<void> {
        await this.io.sln('The vows are short and to the point - but heartfelt.  Violet giggles as she');
        await this.io.sln('hands you the ring.  (You wonder why)  Even through the veil covering');
        await this.io.sln('your face - your man looks so handsome - so strong.  ');
        await this.io.sln();
        await this.io.moreNoMail();
        if (random(2) === 0) {
            await this.io.lln('`0A figure dressed in black attracts your attention in the back...');
            await this.io.sln();
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2You recognize the individual by the tightly clutched mandolin.');
            await this.io.sln();
            await this.io.sln('A single tear glistens on his cheek.');
            await this.io.sln();
            await this.io.moreNoMail();
        }
        await this.io.sln('Turgon solomnly gives your husband his permission to kiss you.');
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async _handleProposalRejected(to: number, mop: LoadedPlayerRecord, she: string): Promise<void> {
        await this.mail.mailTo(to, '`%  ** Romantic Mail Return From '+this.player.name+'`% **\n'+
            '`l\n'+
            '`0  '+she+' laughs in your face!\n'+
            '`4  YOU ARE `)ULTRA `4SNUBBED!\n'+
            '`0  \n'+
            '`2  You `4LOSE `%'+prettyInt(100*mop.level)+' `2experience points!\n'+
            '`V'+(100*mop.level)+'\n'+
            '```|');
        //DIFF: Returns didn't have `|, so the "Return from" bit was quoted in the NEXT message.
        //      Starting the first line with `. would also fix the problem.
        await this.log.logLine('`%'+mop.name+' `2got `)TURNED DOWN `2by `0'+this.player.name+'`2!');
        await this.io.sln();
        await this.io.lln('`%Yowzers you\'re cold!');
        await this.io.sln();
    }
}

export default Marriage;
