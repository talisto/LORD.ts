/**
 * Bard - Seth Able the Bard location for LORD.
 *
 * Handles the bard performance loop, romance options, and the player-to-NPC
 * marriage storyline with Seth. Integrates LDY script events for custom
 * bard songs defined by the server operator.
 */
import { random, prettyInt } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type { LdyManager } from '../lady/LdyManager';
import type IO from '../io/IO';
import type State from '../State';
import type Player from '../Player';
import type Mail from '../Mail';
import type Log from '../Log';
import type DailyMaint from '../DailyMaint';
import type { Settings, LoadedPlayerRecord, UiMode } from '../types';

// Type placeholder for GameContext

export class Bard {
    constructor(
        private io: IO,
        private state: State,
        private settings: Settings,
        private _mail: Lazy<Mail>,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _uiMode: UiMode,
        private _ldyManager: Lazy<LdyManager>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get ldyManager(): LdyManager { return this._ldyManager.value; }
    get mail(): Mail { return this._mail.value; }

    get player(): Player { return this._player.value; }

    get log(): Log { return this._log.value; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }

    // ── Private romance helpers ──────────────────────────────────────────

    private async _seduce(): Promise<void> {
        const insults: string[] = ["filthy harlot", "slut"];

        await this.io.lln("You turn on the charm, moving your body seductively against him, you ask him to come upstairs with you...");
        await this.io.sln();
        await this.io.mswait(2000);
        this.player.seen_violet = true;
        if (this.player.married_to > -1) {
            await this.io.sln();
            this.io.foreground(10);
            await this.io.lln("Seth Able is appalled that you would even suggest such a thing!");
            await this.io.sln();
            await this.io.sln("He calls you a filthy harlot!");
            await this.log.logLine(
                "`%Seth Able `2calls `0" + this.player.name + " `2a `)" + insults[random(insults.length)] + "`2!",
            );
            return;
        }
        if (this.player.cha >= 32) {
            switch (random(4)) {
                case 2:
                    await this.io.sln("He smiles invitingly...  ");
                    await this.io.mswait(4000);
                    await this.io.sln();
                    this.io.foreground(2);
                    await this.io.lln("Hours later.. You saunter downstairs. When a bearded drunk asks you all the racket was, you smile knowingly and look away..");
                    await this.io.sln("The drunks are mystified!");
                    await this.io.sln();
                    await this.io.lln("`0YOU GET `%" + this.player.level * 40 + " `0EXPERIENCE!");
                    this.player.exp += this.player.level * 40;
                    await this.log.logLine("`0" + this.player.name + " `2got laid by `%Seth Able`2!");
                    this.player.laid += 1;
                    await this.dailyMaint.tournamentCheck();
                    break;
                case 0:
                    await this.io.sln("He tells you he has a headache!");
                    await this.io.sln("You are very disappointed.");
                    break;
                case 1:
                    await this.io.sln("He tells you he is not in the mood!");
                    await this.io.sln("You saunter around the bar disappointed.");
                    break;
                case 3:
                    await this.io.sln("He tells you he is too exausted from last night!");
                    await this.io.sln("You saunter around the bar disappointed.");
                    break;
            }
        } else {
            await this.io.sln();
            this.io.foreground(2);
            await this.io.sln("He shoves you away harshly!");
            await this.io.sln("He calls you a filthy whore!");
            await this.io.sln("You trudge away from him dejectedly..");
            await this.io.sln("The entire bar laughs at your misfortune!!");
            await this.io.sln();
            this.io.foreground(4);
            await this.io.sln("YOUR HITPOINTS GO DOWN TO 1!");
            this.player.hp = 1;
            await this.log.logLine("`5" + this.player.name + " `2 was called a whore by `%Seth Able`2!");
        }
        await this.io.more();
    }

    private async _wink(): Promise<void> {
        this.player.seen_violet = true;
        if (this.player.cha >= 1) {
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("You wink at Seth Able seductively..");
            await this.io.mswait(5000);
            this.io.foreground(2);
            await this.io.sln("He blushes and smiles!!");
            await this.io.sln("You are making progress with him!");
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("You receive " + prettyInt(this.player.level * 5) + " experience!");
            this.player.exp += this.player.level * 5;
            await this.dailyMaint.tournamentCheck();
        } else {
            this.io.foreground(15);
            await this.io.sln("You wink at Seth Able seductively..");
            await this.io.mswait(5000);
            this.io.foreground(4);
            await this.io.sln("He looks the other way!");
            await this.io.sln("You nearly die of embarrassment!");
        }
        await this.io.more();
    }

    private async _flutter(): Promise<void> {
        this.player.seen_violet = true;
        this.io.foreground(15);
        await this.io.sln("You turn to Seth Able and flutter your eyelashes violently..");
        await this.io.mswait(5000);
        this.io.foreground(2);
        if (this.player.cha >= 2) {
            await this.io.sln("He smiles broadly and winks back!");
            await this.io.sln("Your relationship with him is taking off!");
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("You receive " + prettyInt(this.player.level * 10) + " experience!");
            this.player.exp += this.player.level * 10;
            await this.dailyMaint.tournamentCheck();
        } else {
            await this.io.sln("He doesn't seem interested and starts talking to Violet!");
            await this.io.sln("You nearly faint from embarresment!");
            await this.io.sln();
            this.io.foreground(4);
            await this.io.sln("YOU LOSE " + prettyInt(this.player.level) + " HIT POINTS!");
            this.player.hp -= this.player.level;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async _hanky(): Promise<void> {
        this.io.foreground(15);
        await this.io.sln("You innocently drop your lace hanky on the ground..");
        await this.io.mswait(5000);
        this.player.seen_violet = true;
        this.io.foreground(2);
        if (this.player.cha >= 4) {
            await this.io.sln("Seth sees it, picks it up and offers it to you!");
            await this.io.sln("He smiles hugely!  You are elated!");
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("YOU RECEIVE " + prettyInt(this.player.level * 20) + " EXPERIENCE!");
            this.player.exp += this.player.level * 20;
            await this.dailyMaint.tournamentCheck();
        } else {
            await this.io.sln("He ignores your plea for attention, and looks away!");
            await this.io.sln("You nearly faint from embarresment!");
            await this.io.sln();
            this.io.foreground(4);
            await this.io.sln("YOU LOSE " + prettyInt(this.player.level * 3) + " HIT POINTS!");
            this.player.hp -= this.player.level * 3;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async _drink(): Promise<void> {
        this.io.foreground(15);
        await this.io.sln("You wave Seth over and ask him to buy you a drink..");
        await this.io.mswait(5000);
        this.player.seen_violet = true;
        this.io.foreground(2);
        if (this.player.cha >= 8) {
            await this.io.lln("He buys you the most expensive drink in the house, and gives you a hug!  You cherish his warmth!");
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("YOU RECEIVE " + prettyInt(this.player.level * 30) + " EXPERIENCE!");
            this.player.exp += this.player.level * 30;
            await this.dailyMaint.tournamentCheck();
        } else {
            await this.io.sln("He looks startled at your advances and mumbles a lame excuse!");
            await this.io.sln("You nearly die of embarresment!");
            await this.io.sln();
            this.io.foreground(4);
            await this.io.sln("YOU LOSE " + prettyInt(this.player.level * 5) + " HIT POINTS!");
            this.player.hp -= this.player.level * 5;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async _kiss(): Promise<void> {
        this.io.foreground(15);
        await this.io.sln("You reach over his mandolin, and kiss him soundly...");
        this.io.foreground(2);
        await this.io.mswait(5000);
        this.player.seen_violet = true;
        if (this.player.cha >= 16) {
            await this.io.sln("He doesn't object!  He kisses you back! ");
            await this.io.sln("You become over excited and force yourself away!");
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("YOU RECEIVE " + prettyInt(this.player.level * 40) + " EXPERIENCE!");
            this.player.exp += this.player.level * 40;
            await this.dailyMaint.tournamentCheck();
        } else {
            await this.io.lln("He pushes your face away, and says he is just not ready for that kind of relationship!");
            await this.io.sln("You nearly die of embarresment!");
            await this.io.sln();
            this.io.foreground(4);
            await this.io.sln("YOU LOSE " + prettyInt(this.player.level * 10) + " HITPOINTS!");
            this.player.hp -= this.player.level * 10;
            if (this.player.hp < 1) {
                this.player.hp = 1;
            }
        }
        await this.io.more();
    }

    private async _marriage(): Promise<void> {
        let mop: LoadedPlayerRecord | null;

        this.player.seen_violet = true;
        if (this.player.cha < 10) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + '`0!  I will not consider it!"`2');
            await this.io.sln();
            await this.io.sln("His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("Your world crumbles to the ground!");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.player.cha < 20) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0..We are just not right for each other.. We are so different - And in this case opposites DON'T attract.\"", 1);
            await this.io.sln();
            this.io.foreground(2);
            await this.io.sln("His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("You feel so stupid.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.player.cha < 50) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0.. I cannot say yes.  I do find you attractive, but my life is here, serving the people.\"", 1);
            await this.io.sln();
            await this.io.lln("`2His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("Your heart hurts.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.player.cha < 80) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0.. I do love you - You are one of the most wonderful women in the realm!  I still cannot say yes.\"", 1);
            await this.io.sln();
            await this.io.lln("`2His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("Humiliation turns your face a deep scarlet.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.player.cha < 100) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0.. You are truly a thing of beauty.  Please have mercy on me and do not hate me when I tell I cannot.\"", 1);
            await this.io.sln();
            await this.io.lln("`2His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("A fierce anger burns inside.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else if (this.player.cha < 120) {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you very seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0.. You are so dear to me.  You are truly THE most beautiful woman in the realm.  I pray to God you will not hate me when I tell you I cannot mary you.  You see, I was married once before.  My wife was killed many years ago. I cannot go through that pain again.  I am so sorry.");
            await this.io.sln();
            await this.io.lln("`2His words carry through the air and everyone looks at you.");
            await this.io.sln();
            await this.io.sln("You see tears in the eyes of many onlookers.");
            await this.io.sln();
            await this.io.moreNoMail();
        } else {
            await this.io.sln();
            await this.io.sln();
            await this.io.sln("Seth Able looks at you very seriously.");
            await this.io.sln();
            await this.io.lln('`0"' + this.player.name + "`0.. The many times you've visited me have truly done my heart good.\"", 1);
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('"I do love you.  And if you\'ll have me, I will be the best husband I can be for you."', 1);
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`2The bard then takes you in his arms and squeezes you tightly.");
            await this.io.sln();
                await this.io.lln('The news of the wedding travels like wildfire - shortly, a vast assemblege of townspeople are sitting rather impatiently in the the great church found near the outskirts of town.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("`c`%** THE WEDDING **", 22);
            await this.io.sln();
            await this.state.getState(true);
            if (this.state.married_to_seth === -1 || this.state.married_to_seth === this.player.Record) {
                this.state.married_to_seth = this.player.Record;
                this.state.putState();
                if (this.player.laid > 0) {
                    await this.io.sln("Wearing a slightly off-white dress you walk demurely down the aisle.");
                    await this.log.logLine("`)** `0" + this.player.name + " `2has MARRIED `%Seth Able`2!`) **");
                } else {
                    await this.io.lln("`0Wearing a PURE `%white `0dress you walk demurely down the asle.");
                    await this.io.sln();
                    await this.io.lln("`0Your heart is completely fulfilled.");
                    await this.log.logLine("`)** `0" + this.player.name + " `2has MARRIED `%Seth Able`2 in `%WHITE`2!`) **");
                    await this.io.sln();
                    this.player.exp += this.player.level * 5000;
                    await this.io.lln("`%You feel heavenly!  You receive " + prettyInt(this.player.level * 5000) + " experience!");
                }
                await this.io.sln();
                await this.io.lln("`0You barely notice the ceremony taking place - your eyes and your husbands never leave each other.");
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.sln("At the appropriate time, the bard kisses you deeply and long.");
                await this.io.sln();
                await this.io.lln("`%THE ENTIRE CHURCH ROARS ITS APPROVAL!");
                await this.io.sln();
                await this.io.moreNoMail();
                await this.dailyMaint.tournamentCheck();
            } else {
                this.state.putState();
                mop = this.player.playerGet(this.state.married_to_seth);
                if (this.player.laid > 0) {
                    await this.io.sln("Wearing a slightly off-white dress you walk demurely to the aisle.");
                } else {
                    await this.io.lln("`0Wearing a PURE `%white `0dress you walk demurely to the aisle.");
                }
                await this.io.moreNoMail();
                await this.io.lln("`0When you get there, you can't believe your ears...");
                await this.io.lln('`0"I now pronounce you husband and wife... you may kiss the bride"');
                await this.io.sln();
                await this.io.lln("`0Seth Able has just married " + mop!.name + "!");
                await this.io.moreNoMail();
                await this.io.lln("`0You run away sobbing.");
            }
        }
    }

    private async _sethMenu(): Promise<void> {
        if (this.rip) await this.io.showRip(this.player.sex === "M" ? "HIS~SETH" : "HER~SETH");
        else await this.io.showTxt(this.player.sex === "M" ? "BARD" : "BARDF");
    }

    // ── Bard scenes ─────────────────────────────────────────────────────

    async singleSeth(): Promise<void> {
        let ch: string;
        let done: boolean = false;
        let op: LoadedPlayerRecord | null;

        // seen_violet is the daily romance lock shared by both Seth and Violet interactions
        if (this.player.seen_violet) {
            await this.io.sln("The Bard seems occupied...Maybe tomorrow...");
            await this.io.sln();
            return;
        }
        await this.io.sln();
        if (this.rip) await this.io.showRip("SETH");
        else await this.io.showTxt("SETH");
        do {
            await this.io.sln();
            if (!this.modern) await this.io.lw("`0`2Your choice?  (`0? for menu`2) : ", 2);
            this.io.emitPrompt('seth_menu', [
                { key: 'W', label: 'Wink' },
                { key: 'A', label: 'Ask Day' },
                { key: 'S', label: 'Swoon' },
                { key: 'F', label: 'Flatter' },
                { key: 'P', label: 'Peck Kiss' },
                { key: 'K', label: 'Kiss Passionately' },
                { key: 'D', label: 'Drop Hanky' },
                { key: 'M', label: 'Marry Me' },
                { key: 'N', label: 'None' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            if (ch === "\r") {
                ch = "R";
            }
            if (!this.rip && !this.modern) await this.io.sln(ch, 0);
            await this.io.sln();
            switch (ch) {
                case "N":
                case "R":
                case "Q":
                    done = true;
                    break;
                case "?":
                    await this.io.sln();
                    if (this.rip) await this.io.showRip("SETH");
                    else await this.io.showTxt("SETH");
                    break;
                case "W":
                    await this._wink();
                    break;
                case "F":
                    await this._flutter();
                    break;
                case "D":
                    await this._hanky();
                    break;
                case "A":
                    await this._drink();
                    break;
                case "K":
                    await this._kiss();
                    break;
                case "C":
                    if (!this.settings.clean_mode) {
                        await this._seduce();
                    } else {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("Sorry, your sysop has disabled that function...");
                        await this.io.sln();
                    }
                    break;
                case "M":
                    await this.state.getState(false);
                    if (this.player.divorced) {
                        await this.io.sln("Since you've just gotten out of a serious relationship, you feel it'd be moving to quickly to get married again.");
                    } else if (this.player.married_to > -1) {
                        op = this.player.playerGet(this.player.married_to);
                        await this.io.sln();
                        await this.io.lln("`0You kind of doubt you husband `)" + op!.name + " `0would like that...");
                        await this.io.moreNoMail();
                    } else if (this.state.married_to_violet === this.player.Record) {
                        await this.io.sln();
                        await this.io.lln("`0You kind of doubt you wife `#Violet `0would like that...");
                        await this.io.moreNoMail();
                    } else {
                        await this._marriage();
                    }
                    break;
            }
        } while (!done && !this.player.seen_violet);
        if (this.rip) await this.io.showRip("HER~SETH");
        await this.io.sln();
    }

    async bardSong(): Promise<void> {
        await this.ldyManager.runBardSong();
    }

    async talkToBard(): Promise<void> {
        let ch: string;
        let done: boolean = false;
        let op: LoadedPlayerRecord | null;

        await this.state.getState(false);
        await this._sethMenu();
        do {
            if (!this.rip && !this.modern) {
                await this.io.sln();
                if (this.state.married_to_seth === this.player.Record) {
                    await this.io.lln("`2Seth Able looks at you lovingly. (`0? for menu`2)");
                } else {
                    await this.io.lln("`2Seth Able looks at you expectantly.  (`0? for menu`2)");
                }
            }
            ch = await this.io.commandPrompt('bard_menu', [
                { key: 'A', label: 'Ask for Song' },
                { key: 'F', label: 'Flirt' },
                { key: 'R', label: 'Return' },
            ]);
            switch (ch) {
                case "?":
                    await this._sethMenu();
                    break;
                case "R":
                case "Q":
                case "\r":
                    done = true;
                    break;
                case "A":
                    await this.bardSong();
                    break;
                case "F":
                    if (this.player.sex === "M") {
                        await this.io.sln();
                        await this.io.sln("You would rather flirt with Violet.");
                        break;
                    }
                    await this.state.getState(false);
                    if (this.state.married_to_seth > -1) {
                        if (this.state.married_to_seth === this.player.Record) {
                            await this.io.sln();
                            if (this.player.seen_violet) {
                                await this.io.lln("`2You don't wish to interrupt his song.");
                            } else {
                                this.player.seen_violet = true;
                                switch (random(8)) {
                                    case 0:
                                        await this.io.lln('`0"I love you too, honey!"');
                                        break;
                                    case 1:
                                        await this.io.lln("`2Seth gives you a quick peck on the cheek.");
                                        break;
                                    case 2:
                                        await this.io.lln('`0"I\'d love to sweetie, but duty calls."');
                                        break;
                                    case 3:
                                        await this.io.lln('`0"We\'ll have plenty of time for that tonight!"');
                                        break;
                                    case 4:
                                        await this.io.lln("`2In the roar of the crowd, he doesn't hear.");
                                        break;
                                    case 5:
                                        await this.io.lln("`2You don't wish to bother your busy husband.");
                                        break;
                                    case 6:
                                        await this.io.lln('`0"After work, you\'re mine!" `2he laughs.');
                                        break;
                                    case 7:
                                        await this.io.lln('`0"Later, honey!" `2Seth winks hugely at you.');
                                        break;
                                }
                            }
                        } else {
                            await this.io.sln();
                            this.io.foreground(2);
                            op = this.player.playerGet(this.state.married_to_seth);
                            if (this.player.seen_violet) {
                                if (op && this.player.cha > op.cha) {
                                    await this.io.sln("You decide you've done enough homewrecking for one day.");
                                } else {
                                    await this.io.sln("You are too shamed to even think such a thought.");
                                }
                            } else {
                                await this.io.lln("`2You are about to give Seth your best, when he turns away.  You see a shiny new `0ring `2on his hand. ");
                                await this.io.sln();
                                await this.io.lw("Attempt to seduce him anyway? `![`0N`!] : ", 2);
                                this.io.emitPrompt('seduce_confirm', [
                                    { key: 'Y', label: 'Yes' },
                                    { key: 'N', label: 'No' },
                                ]);
                                ch = (await this.io.getkey()).toUpperCase();
                                if (ch !== "Y") {
                                    ch = "N";
                                }
                                await this.io.sln(ch, 0);
                                await this.io.sln();
                                if (ch === "Y") {
                                    await this.io.sln("You rub your body against the man in the most disarming way you can.");
                                    await this.io.sln();
                                    await this.io.moreNoMail();
                                    this.player.seen_violet = true;
                                    // Seducing married Seth succeeds only if you have more charm than his wife
                                    if (op && this.player.cha > op.cha) {
                                        await this.io.lln("`2Seth looks at you hungrily.");
                                        await this.io.sln();
                                        await this.io.lln('`0"Dear ' + this.player.name + "`0..  You make me think unworthy thoughts!\" `2the bard cries in agony.");
                                        await this.io.sln();
                                        await this.log.logLine("`0" + this.player.name + " `2has made `%Seth Able`2 falter.");
                                        await this.mail.mailTo(
                                            this.state.married_to_seth,
                                            "\n" +
                                                "  `0**** `)UGLY RUMOR `0****\n" +
                                                "'`l'\n" +
                                                "  `2Anonymous sources tell you " +
                                                this.player.name +
                                                "`2 was seen" +
                                                "  `2attempting to seduce your husband!",
                                        );
                                        await this.io.moreNoMail();
                                        await this.io.lln("`2You have caused the bard to falter!");
                                        await this.io.sln();
                                        await this.io.lln("`%YOU RECEIVE " + prettyInt(this.player.level * 100) + " EXPERIENCE!");
                                        this.player.exp += this.player.level * 100;
                                        await this.dailyMaint.tournamentCheck();
                                    } else {
                                        await this.io.lln("`2Seth looks at you angrily.");
                                        await this.io.sln();
                                        await this.io.lln('`0"' + this.player.name + "`0..  You are an extremely silly wench.  My God woman, you would need at least " + prettyInt((op ? op.cha : 0) - this.player.cha) + ' more charm to be considered female!"');
                                        await this.io.sln();
                                        await this.log.logLine("`%Seth Able`2 called `0" + this.player.name + " `2a silly wench!");
                                    }
                                }
                            }
                        }
                    } else {
                        await this.singleSeth();
                    }
                    break;
            }
        } while (!done);
        await this.io.sln();
    }
}

export default Bard;
