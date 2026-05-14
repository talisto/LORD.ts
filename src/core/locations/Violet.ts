/**
 * Violet - Violet the Barmaid location for LORD.
 *
 * Handles the romance and marriage storyline with Violet, the NPC barmaid
 * at the Red Dragon Inn. Manages proposal, acceptance, and the ongoing
 * married-player interactions with per-day visit tracking.
 */
import { random, prettyInt } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type IO from '../io/IO';
import type State from '../State';
import type Player from '../Player';
import type Log from '../Log';
import type DailyMaint from '../DailyMaint';
import type { Settings, LoadedPlayerRecord, UiMode } from '../types';

export class Violet {
    constructor(
        private io: IO,
        private state: State,
        private settings: Settings,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _uiMode: UiMode,
        private _dailyMaint: Lazy<DailyMaint>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get player(): Player { return this._player.value; }
    get log(): Log { return this._log.value; }
    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }

    // ── Violet interactions ───────────────────────────────────────────

    async flirtWithViolet(): Promise<boolean> {
        let ch: string;

        if (this.player.sex === 'F') {
            if (this.rip)
                await this.io.showRip('W1');
            await this.io.sln();
            await this.io.sln();
            await this.io.sln('You would rather flirt with Seth Able.');
            return true;
        }
        await this.state.getState(false);
        if (this.state.married_to_violet > -1) {
            if (this.rip)
                await this.io.showRip('W1');
            if (this.player.seen_violet) {
                await this._handleGrizeldaRevisit();
            }
            else {
                await this._handleGrizeldaFirstEncounter();
            }
            return true;
        }
        if (this.player.seen_violet) {
            if (this.rip) {
                await this.io.showRip('BUSY', false);
            }
            else {
                await this.io.sln();
                await this.io.sln();
                await this.io.sln('You feel you had better not go too fast, maybe tomorrow.');
                await this.io.sln();
            }
            if (this.modern) {
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
            return false;
        }
        await this.io.sln();
        if (this.rip)
            await this.io.showRip('VIOLET');
        else
            await this.io.showTxt('VIOLET');
        do {
            await this.io.sln();
            if (!this.modern) await this.io.lw('`0`2Your choice?  (`0? for menu`2) : ', 2);
            this.io.emitPrompt('violet_flirt', [
                { key: 'W', label: 'Wink' },
                { key: 'K', label: 'Kiss Hand' },
                { key: 'P', label: 'Peck on Lips' },
                { key: 'S', label: 'Sit on Lap' },
                { key: 'G', label: 'Grab' },
                { key: 'C', label: 'Carry Upstairs' },
                { key: 'M', label: 'Marry' },
                { key: 'R', label: 'Return' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            if (ch === '\r') {
                ch = 'R';
            }
            if (!this.rip && !this.modern)
                await this.io.sln(ch, 0);
            await this.io.sln();
            switch(ch) {
                case '?':
                    await this.io.sln();
                    if (this.rip)
                        await this.io.showRip('VIOLET');
                    else
                        await this.io.showTxt('VIOLET');
                    break;
                case 'N':
                case 'R':
                case 'Q':
                    return true;
                case 'K':
                    await this.kiss();
                    break;
                case 'W':
                    await this.wink();
                    break;
                case 'P':
                    await this.peck();
                    break;
                case 'S':
                    await this.sit();
                    break;
                case 'G':
                    await this.grab();
                    break;
                case 'C':
                    if (this.settings.clean_mode) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln('Sorry, your sysop has disabled that function!');
                        await this.io.sln();
                    }
                    else {
                        await this.carryUpstairs();
                    }
                    break;
                case 'M':
                    return await this._handleMarryAttempt();
            }
        } while(!this.player.seen_violet);
        return true;
    }

    private async _handleGrizeldaRevisit(): Promise<void> {
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`2You are still shaking from your last encounter with `4Grizelda`2!');
        await this.io.sln();
        if (this.rip || this.modern) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        else
            await this.io.more();
    }

    private async _handleGrizeldaFirstEncounter(): Promise<void> {
        let op: LoadedPlayerRecord | null;

        await this.io.sln();
        await this.io.sln();
        await this.io.lln('You whistle loudly for the barmaid, hardly containing your glee at the thought of patting Violet\'s soft supple hips, but when you pat...');
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`4YOU FEEL HUGE LUMPS OF CELLULITE!');
        await this.io.sln();
        await this.io.lln('`2The obese barmaid intruduces her portly self as `4Grizelda`2!');
        await this.io.sln();
        if (this.state.married_to_violet === this.player.Record) {
            await this.io.sln('You remember now that Violet quit work when she married you!');
            await this.io.sln();
            await this.io.lln('You feel sorry for all the other warriors who must suffer at the hands of `4Grizelda`2.');
        }
        else {
            op = this.player.playerGet(this.state.married_to_violet);
            if (op) {
                await this.io.lln('You suddenly remember seeing something in the news about `0'+op.name +'`2 marrying Violet!  As Grizelda grabs you for a kiss, her buckteeth jab you painfully.  You curse `0'+op.name+'`2 as you scream in horror.');
            }
        }
        await this.io.sln();
        this.player.seen_violet = true;
        if (this.rip || this.modern) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        else
            await this.io.more();
    }

    private async _handleMarryAttempt(): Promise<boolean> {
        let op: LoadedPlayerRecord | null;

        await this.state.getState(false);
        if (this.player.married_to > -1) {
            op = this.player.playerGet(this.player.married_to);
            if (op) {
                await this.io.sln();
                await this.io.lln('`0You kind of doubt you wife `)'+op.name+' `0would');
                await this.io.sln('like that...');
                await this.io.moreNoMail();
            }
            return true;
        }
        if (this.state.married_to_seth === this.player.Record) {
            await this.io.sln();
            await this.io.lln('`0You kind of doubt you husband `%Seth Able `0would');
            await this.io.sln('like that...');
            await this.io.moreNoMail();
            return true;
        }
        await this.proposeMarriage();
        return true;
    }

    private async rejectMarriageProposal(): Promise<void> {
        await this.io.sln();
        await this.io.sln('Your hopeful smile slowly turns into a look of deep sadness.');
        await this.io.sln();
        await this.io.lln('`%THE ENTIRE BAR LAUGHS AT YOUR MISFORTUNE!');
        await this.io.sln();
        this.player.seen_violet = true;
        await this.log.logLine('`2`#Violet`2 has refused to marry `0'+this.player.name+'`2!');
        await this.io.more();
    }

    private async completeMarriageProposal(): Promise<void> {
        let mop: LoadedPlayerRecord | null;

        await this.state.getState(true);
        // Race condition guard: another player may have married Violet between proposal and ceremony
        if (this.state.married_to_violet !== -1 && this.state.married_to_violet !== this.player.Record) {
            this.state.putState();
            mop = this.player.playerGet(this.state.married_to_violet);
            if (!mop) return;
            await this.io.lln('`c`>`%** THE BLESSED DAY ARRIVES **');
            await this.io.sln(this.io.divider());
            await this.io.lln('`2As you walk up to the chapel, you see Violet walking out... on the arm of '+mop.name+'!');
            await this.io.sln();
        }
        else {
            if (this.rip)
                await this.io.showRip('W1');
            this.state.married_to_violet = this.player.Record;
            this.state.putState();
            await this.io.lln('`c`>`%** THE BLESSED DAY ARRIVES **');
            await this.io.sln(this.io.divider());
            await this.io.lln('`2Violet agrees to marry you!');
            await this.io.sln();
            await this.io.sln('After a short ceremony you are finally able to take her into your arms.');
            await this.io.sln('(Well, you\'ve done that quite a few times, but not as your wife!)');
            await this.io.sln();
            await this.io.sln('She agrees to quit her job and take care of your house.');
            await this.io.sln();
            await this.io.sln('You look forward to inspiration from her every day.');
            await this.io.sln();
            await this.io.lln('`%YOU RECEIVE '+prettyInt(1000 * this.player.level)+' EXPERIENCE!');
            this.player.exp += this.player.level * 1000;
            await this.io.sln();
            this.player.seen_violet = false;
            this.io.events?.emitSocial('marriage', { spouse: 'Violet' });
            await this.log.logLine('`2`#Violet`2 has `%MARRIED `0'+this.player.name+'`2!!!!!\n`2She `%QUITS`2 her job at the bar to the towns dismay!');
            await this.dailyMaint.tournamentCheck();
        }
    }

    private async proposeMarriage(): Promise<void> {
        if (this.player.divorced) {
            await this.io.sln('Since you\'ve just gotten out of a serious relationship, you feel');
            await this.io.sln('it\'d be moving to quickly to get married again.');
            return;
        }
        if (this.rip)
            await this.io.showRip('W1');
        await this.io.sln();
        await this.io.lln('`2You take Violet\'s hand and squeeze it gently.  `0"My sweet Violet.');
        await this.io.sln('will you make me the happiest man alive?  Will you marry me?"');
        await this.io.sln();
        await this.io.lw('`2With your heart on your sleeve, you await her answer.', 2);
        await this.io.mswait(1500);
        this.io.sw('.');
        await this.io.mswait(1500);
        this.io.sw('.');
        await this.io.mswait(1500);
        await this.io.sln();
        await this.io.sln();

        if (this.player.cha < 3) {
            await this.io.lln('`#"Marry YOU?!" `2 She laughs as if she just heard the funniest joke on earth.', 1);
        }
        else if(this.player.cha < 6) {
            await this.io.lln('`#"Is this a joke?"`2 she asks seriously.');
        }
        else if(this.player.cha < 10) {
            await this.io.lln('`#"You\'re sweet, but I just don\'t like you in that way." `2she tells you seriously.', 1);
        }
        else if (this.player.cha < 50) {
            await this.io.lln('`#"I like you, I really do!  I just don\'t feel ready for that kind of commitment right now!" `2she explains sadly.', 1);
        }
        else if(this.player.cha < 80) {
            await this.io.lln('`#"I think I\'m in love with you!  But I can\'t marry you.  My last marriage was a disaster." `2she explains sadly.', 1);
        }
        else if(this.player.cha < 100) {
            await this.io.lln('`#"I...I can\'t say yes.  Ask me another time. Please." `2she begs.');
        }
        else {
            await this.io.lln('`#"Yes!  I WILL marry you!" `2she laughs!');
            await this.io.sln();
        }

        if (this.player.cha < 100) {
            await this.rejectMarriageProposal();
        }
        else {
            await this.completeMarriageProposal();
        }
        await this.io.moreNoMail();
    }

    private async carryUpstairs(): Promise<void> {
        await this.io.sln('You pick Violet up and roughly carry her upstairs and throw her on');
        await this.io.sln('the bed...');
        await this.io.mswait(1500);
        await this.io.sln();
        this.player.seen_violet = true;
        if (this.player.married_to > -1) {
            await this.io.sln();
            await this.io.lln('`#Violet `0is appalled that you would even suggest such');
            await this.io.sln('a thing!');
            await this.io.sln();
            await this.io.sln('She calls you a dirty old man!');
            await this.log.logLine('`#Violet `2calls `0'+this.player.name+' `2a `)'+(random(2) ? 'dirty old man' : 'bastard')+'`2!');
        }
        else {
            if (this.player.cha > 32) {
                if (random(3) === 1) {
                    await this.io.lln('`0She smiles invitingly...  ');
                    await this.io.mswait(1500);
                    await this.io.sln();
                    await this.io.lln('`2Half an hour later....You saunter downstairs. When a bearded drunk');
                    await this.io.sln('asks you all the racket was, you smile knowingly and look away...');
                    await this.io.sln('The drunks are mystified!');
                    await this.io.sln();
                    await this.io.lln('`0YOU GET `%'+prettyInt(this.player.level * 40)+'`0 EXPERIENCE!');
                    this.player.exp += this.player.level * 40;
                    await this.log.logLine('`5'+this.player.name+' `%Got laid by `#Violet`%!');
                    this.player.laid += 1;
                    await this.dailyMaint.tournamentCheck();
                }
                else {
                    switch(random(4)) {
                        case 0:
                            await this.io.sln('She tells you she has a headache!');
                            await this.io.sln('You saunter down to the bar disappointed.');
                            break;
                        case 1:
                            await this.io.sln('She tells you she has to wash her hair!');
                            await this.io.sln('You saunter down to the bar disappointed.');
                            break;
                        case 2:
                            await this.io.sln('She tells you she is just too busy!');
                            await this.io.sln('You saunter down to the bar disappointed.');
                            break;
                        case 3:
                            await this.io.sln('She tells you she just doesn\'t have the urge today!');
                            await this.io.sln('You saunter down to the bar - Wondering if she\'s been faithful!?');
                            break;
                    }
                }
            }
            else {
                await this.io.sln();
                this.io.foreground(4);
                await this.io.sln('She jumps off the bed screaming at you!  She savagely kicks you in the');
                await this.io.sln('groin!  You trudge down the stairs dejectedly..');
                await this.io.sln('The entire bar laughs at your misfortune!!');
                await this.io.sln();
                await this.io.sln('YOUR HITPOINTS GO DOWN TO 1!');
                this.player.hp = 1;
                await this.log.logLine('`0'+this.player.name+' `2got kicked in the groin by `#Violet`2!');
            }
        }
        await this.io.more();
    }

    private async wink(): Promise<void> {
        this.player.seen_violet = true;
        await this.io.sln();
        await this.io.lln('`%You wink at Violet seductively..');
        await this.io.mswait(1500);
        if (this.player.cha >= 1) {
            this.player.exp += this.player.level * 5;
            await this.io.lln('`2She blushes and smiles!!');
            await this.io.sln('You are making progress with her!');
            await this.io.sln();
            await this.io.lln('`%You receive '+prettyInt(this.player.level * 5)+' experience!');
            await this.dailyMaint.tournamentCheck();
        }
        else {
            await this.io.lln('`4She dumps a tankard of ale on your head!!');
            await this.io.sln('The entire bar laughs at your misfortune!!');
        }
        await this.io.more();
    }

    private async kiss(): Promise<void> {
        this.player.seen_violet = true;
        if (this.player.cha >= 2) {
            await this.io.lln('`%You take Violet\'s hand and kiss it!');
            await this.io.mswait(1500);
            await this.io.lln('`2She pulls her hand away and laughs merrily!!');
            await this.io.sln('Your relationship with her is taking off!');
            await this.io.sln();
            await this.io.lln('`%You receive '+prettyInt(this.player.level*10)+' experience!');
            this.player.exp += this.player.level * 10;
        }
        else {
            await this.io.lln('`%You take her hand and kiss it!');
            await this.io.mswait(1500);
            await this.io.lln('`2She pulls her hand away and slaps your face!');
            await this.io.sln('The entire bar laughs at your misfortune!!');
            await this.io.sln();
            await this.io.lln('`4YOU LOSE '+prettyInt(this.player.level)+' HIT POINTS!');
            this.player.hp -= this.player.level;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async peck(): Promise<void> {
        await this.io.lln('`%You attempt to meekly kiss her on the lips, but...');
        await this.io.mswait(1500);
        this.player.seen_violet = true;
        if (this.player.cha >= 4) {
            this.player.exp += this.player.level * 20;
            await this.io.lln('`2She pulls you into a rough embrace, and kisses you');
            await this.io.sln('soundly!!   You are elated!');
            await this.io.sln();
            await this.io.lln('`%YOU RECEIVE '+prettyInt(this.player.level*20)+' EXPERIENCE!');
            await this.dailyMaint.tournamentCheck();
        }
        else {
            await this.io.lln('`2She pushes you away and kicks you in the shin!');
            await this.io.sln('The entire bar laughs at your misfortune!!');
            await this.io.sln();
            await this.io.lln('`4YOU LOSE '+prettyInt(this.player.level*3)+' HIT POINTS!');
            this.player.hp -= this.player.level * 3;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async sit(): Promise<void> {
        await this.io.lln('`%You grab her and throw her on your lap...');
        await this.io.mswait(1500);
        this.player.seen_violet = true;
        if (this.player.cha >= 8) {
            await this.io.lln('`2She laughs and hugs you around the neck!!');
            await this.io.sln('You cherish her warmth!!');
            await this.io.sln();
            await this.io.lln('`%YOU RECEIVE '+prettyInt(this.player.level*30)+' EXPERIENCE!');
            this.player.exp += this.player.level * 30;
            await this.dailyMaint.tournamentCheck();
        }
        else {
            await this.io.sln('She jumps off your lap, and punches you hard!');
            await this.io.sln('Your chair tips over backwards!');
            await this.io.sln('The entire bar laughs at your misfortune!!');
            await this.io.lln('');
            this.player.hp -= this.player.level * 5;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
            await this.io.lln('`4YOU LOSE '+prettyInt(this.player.level*5)+' HIT POINTS!');
        }
        await this.io.more();
    }

    private async grab(): Promise<void> {
        await this.io.lln('`%You palm her shapely cheeks...`2');
        await this.io.mswait(1500);
        this.player.seen_violet = true;
        if (this.player.cha >= 16) {
            this.player.exp += this.player.level * 40;
            await this.io.sln('She doesn\'t object!  ');
            await this.io.sln('You become over excited and force your hand away!');
            await this.io.sln();
            await this.io.lln('`%YOU RECEIVE '+prettyInt(this.player.level*40)+' EXPERIENCE!');
            await this.dailyMaint.tournamentCheck();
        }
        else {
            await this.io.sln('She breaks a tankard over your head!');
            await this.io.sln('You swoon and fall on your face!');
            await this.io.sln('The entire bar laughs at your misfortune!!');
            await this.io.sln();
            await this.io.lln('`4YOU LOSE '+prettyInt(this.player.level*10)+' HITPOINTS!');
            this.player.hp -= this.player.level * 10;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }
}

export default Violet;