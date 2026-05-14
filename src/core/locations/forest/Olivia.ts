/**
 * Olivia - Forest sub-scene: Olivia's Castle encounters for LORD.
 *
 * A multi-castle recurring series where players can rescue and romance the
 * princess Olivia, earning charm bonuses and eventually marrying her.
 */
import { random, prettyInt } from '@lordts/util/Util';
import type { CastleStats, Settings } from '../../types';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type Log from '../../Log';
import type DailyMaint from '../../DailyMaint';

class Olivia {

    private _getWhichCastle: () => number;
    private _setWhichCastle: (v: number) => void;

    constructor(
        private io: IO,
        private player: Player,
        private settings: Settings,
        private castles: CastleStats[],
        private log: Log,
        private dailyMaint: DailyMaint,
        getWhichCastle: () => number,
        setWhichCastle: (v: number) => void,
    ) {
        this._getWhichCastle = getWhichCastle;
        this._setWhichCastle = setWhichCastle;
    }

    get whichCastle(): number { return this._getWhichCastle(); }
    set whichCastle(v: number) { this._setWhichCastle(v); }

    // ── Castle encounter scene ──────────────────────────────────────────

    async run(): Promise<void> {
        // olivia_count is a multi-day relationship state machine:
        // 0=first meet, 1-7=building rapport, 8-9=flirting, 10+=romance, 25=history reveal
        if (this.player.olivia_asshole) {
            await this._asshole();
            return;
        }
        if (!this.player.olivia) {
            await this._firstMeeting();
            return;
        }
        await this.io.lln("`c`%WAIT A SEC!");
        await this.io.sln();
        await this.io.lln("`2It's just your old pal `%Olivia `2the bodyless woman.");
        await this.io.sln();
        if (this.player.olivia_count === 0) {
            await this.io.lln('`0"I was wondering if you were coming back," `2she informs you.');
            await this.io.sln();
        }
        if (this.player.olivia_count === 1) {
            await this.io.lln('`0"You want more information I suppose." `2she says rather sadly.');
            await this.io.sln();
        }
        if (this.player.olivia_count === 2) {
            await this.io.lln('`0"Life is worthless, I am worthless." `2she drones.');
            await this.io.sln();
            await this.io.sln("You realize she is dangerously depressed.");
            await this.io.sln();
        }
        if (this.player.olivia_count === 3) {
            await this.io.lln('`0"I wish I had a friend.  You just use me." `2she rebukes.');
            await this.io.sln();
            await this.io.lln("She's still depressed apparently.");
            await this.io.sln();
        }
        if (this.player.olivia_count === 4) {
            await this.io.lln('`0"It\'s about time.  I do get bored you know," `2she scolds.');
            await this.io.lln("");
        }
        if (this.player.olivia_count === 5) {
            await this.io.lln("`0\"You're looking sharp today, " + this.player.name + '`0," `2she complements.');
            await this.io.lln("");
        }
        if (this.player.olivia_count === 6) {
            await this.io.lln('`0"' + this.player.name + "`0! I've missed you!\" `2she exclaims.");
            await this.io.sln();
            await this.io.sln("Odd, considering you were just here not too long ago.");
            await this.io.sln();
        }
        // Female players can't progress past friendship (no romance path with Olivia)
        if (this.player.olivia_count > 7 && this.player.sex === "F") {
            this.player.olivia_count = 7;
        }
        if (this.player.olivia_count === 7) {
            await this.io.lln('`0"Hello, ' + this.player.name + "`0.  I'm glad you could visit.\"`2 she smiles.");
            await this.io.sln();
            await this.io.sln("She seems happy.");
            await this.io.sln();
        }
        if (this.player.olivia_count === 8) {
            await this.io.lln('`0"Do you find me attractive?" `2she asks pensively.');
            await this.io.sln();
            await this.io.lln('`%"Why?  Are you unattached?" `2you smirk.');
            await this.io.sln();
            await this.io.lln('`0"Do shutup!" `2she screeches.');
            await this.io.sln();
        }
        if (this.player.olivia_count === 9) {
            await this.io.lln('`0"Am I pretty?" `2she asks hopefully.');
            await this.io.sln();
            await this.io.lln('`%"Well, uh, you don\'t weigh too much." `2you smirk.');
            await this.io.sln();
            await this.io.lln('`0"I\'m being serious!" `2she screeches.');
            await this.io.lln("");
        }
        // DIFF: The test for !== 25 wasn't here... always show the history now.
        if (this.player.olivia_count === 10 || (this.player.olivia_count !== 25 && this.player.olivia_count > 10 && random(7) === 1)) {
            await this._romanceScene();
            return;
        }
        if (this.player.olivia_count === 25) {
            await this._historyReveal();
            return;
        }
        if (this.player.olivia_count > 10 && this.player.olivia_count < 18) {
            await this.io.lln("`0Olivia warmly greets you.");
            await this.io.sln();
        }
        if (this.player.olivia_count > 17 && this.player.olivia_count < 21) {
            await this.io.lln("`0Olivia greets you with a butterfly kiss.");
            await this.io.sln();
        }
        if (this.player.olivia_count > 20) {
            await this.io.lln("`0Olivia greets you with a head hug.");
            await this.io.lln("");
        }
        if (this.player.olivia_count > 100) {
            this.player.olivia_count = 100;
        }
        let tmp = "G";
        await this.io.lln("`2(`0G`2)et inside her head");
        if (this.player.sex === "M") {
            tmp += "A";
            await this.io.lln("`2(`0A`2)sk for a kiss.");
        } else {
            await this.io.lln("`2(`0C`2)onsole her.");
            await this.io.lln("`2(`0D`2)o her hair.");
            tmp += "CD";
        }
        await this.io.sln();
        await this.io.lw("What will it be? [`0G`2] `8:`% ", 2);
        const och = await this._oliviaGetch(tmp);
        this.player.olivia_count += 1;
        this.player.put();
        switch (och) {
            case "C":
                if (await this._consoleOlivia()) return;
                break;
            case "D":
                if (await this._doHair()) return;
                break;
            case "A":
                if (await this._askForKiss()) return;
                break;
            case "G":
                await this._getInsideHead();
                break;
        }
        await this.io.lln('`%"Getting bored here.  Gotta go, see ya," `2you break in rudely.');
        await this.io.sln();
        await this.io.sln("You travel back to the forest entrance.");
        await this.io.lln("");
        await this.io.more();
        return;
    }

    private async _oliviaGetch(chars: string): Promise<string> {
        let ich: string;

        const options = chars.split('').map(c => ({ key: c, label: c }));
        this.io.emitPrompt('olivia_choice', options);
        do {
            ich = (await this.io.getkey()).toUpperCase();
            if (ich === "\r") {
                ich = chars[0];
            }
        } while (chars.indexOf(ich) === -1);
        await this.io.sln(ich, 0);
        return ich;
    }

    private async _asshole(): Promise<void> {
        let cannot: boolean;

        await this.io.lln("`c`%THE WAILING GROWS LOUDER.");
        await this.io.sln();
        await this.io.lln("You investigate - only to find a womans head on the ground.");
        await this.io.sln();
        if (this.player.sex === "M") {
            await this.io.lln('`0"I see you, foolish boy.  Leave me alone!" `2the head screams savagely.');
        } else {
            await this.io.lln('`0"I see you, foolish girl.  Leave me alone!" `2the head shouts.');
        }
        await this.io.sln();
        await this.io.lln("`2(`0A`2)pologize for what you did last time");
        await this.io.lln('`2(`0P`2)lay some "head ball"');
        await this.io.sln();
        await this.io.lw("`2Well? [`0A`2] `2: `0", 2);
        const ich = await this._oliviaGetch("AP");
        await this.io.sln();
        if (ich === "P") {
            switch (random(3)) {
                case 0:
                    await this.io.lln("`2You are distracted by a huge spider climbing up the cave wall.");
                    await this.io.sln();
                    await this.io.lln("`0Thinking quickly, you pick up the head and throw it at it!");
                    await this.io.sln();
                    await this.io.more();
                    await this.io.lln('`2You hear a satisfying squishing sound.  As you leave you hear the head screaming after you.  `0"How dare you!!  You\'re going to pay!"');
                    await this.io.sln();
                    await this.io.lln("`%THE EXCERCISE GIVES YOU STRENGTH FOR ANOTHER FOREST FIGHT!");
                    this.player.forest_fights += 1;
                    if (this.player.forest_fights > 32000) {
                        this.player.forest_fights = 32000;
                    }
                    await this.io.sln();
                    await this.io.more();
                    return;
                case 1:
                    await this.io.lln("`2Seeing the fine texture of the heads hair and the this.rip in your garment, you decide to do something about it.");
                    await this.io.sln();
                    await this.io.more();
                    await this.io.lln('`0"PUT ME DOWN!" `2the head screams as you cut off a few strands of its long hair and mend the tear.');
                    await this.io.sln();
                    cannot = false;
                    if (this.player.clss === 3) {
                        if (this.player.level < 2) {
                            cannot = true;
                        }
                    } else {
                        if (this.player.level < 6) {
                            cannot = true;
                        }
                    }
                    if (cannot) {
                        await this.io.lln("`4You lack the skill needed to sew your " + this.player.arm + ".");
                    } else {
                        await this.io.lln("`2There!  Your " + this.player.arm + " is better than ever!");
                        await this.io.sln();
                        await this.io.lln("`%YOU FEEL SO CLEVER YOU GAIN THE STRENGTH FOR ANOTHER FOREST FIGHT!");
                        this.player.forest_fights += 1;
                        if (this.player.forest_fights > 32000) {
                            this.player.forest_fights = 32000;
                        }
                    }
                    await this.io.sln();
                    await this.io.more();
                    return;
            }
        }
        switch (random(3)) {
            case 0:
                await this.io.lln("`0\"I'm very sorry, ma'am.  I was a jerk.\"");
                await this.io.sln();
                await this.io.lln("`%She narrows her eyes at you.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`0"And I uh, think you are perfectly beheading.  I mean, becoming!"');
                await this.io.sln();
                await this.io.lln('`#"AWK!! GO DIE YOU PIECE OF <choking spasm>" `2she screams.');
                await this.io.sln();
                await this.io.lln("`4YOU FEEL SO WOEBEGONE YOU LOSE A FOREST FIGHT FOR TODAY.");
                await this.io.sln();
                break;
            case 1:
                await this.io.lln('`0"Hey?  My old pal!  What are you doing in this \'neck\' of the woods?" `2you inquire sincerely.');
                await this.io.sln();
                await this.io.lln("`%She narrows her eyes at you.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`0"Don\'t be mad!  Please!  Geez, time to try decapit..I mean, decaffinated!"');
                await this.io.sln();
                await this.io.lln('`#"GO EAT BUGS AND DIE, YOU HEARTLESS TROLL!" `2she screams.');
                await this.io.sln();
                await this.io.lln("`4YOU FEEL SO CRAPPY YOU LOSE A FOREST FIGHT FOR TODAY.");
                await this.io.sln();
                break;
            case 2:
                await this.io.lln('`0"You know before?  I was just kidding \'round!  Use your head woman! `2you say earnestly.');
                await this.io.sln();
                await this.io.lln("`%She narrows her eyes at you.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`0Yeah, just joking!  Man you are so guillotine..I mean, er gullible!"');
                await this.io.sln();
                await this.io.lln('`#"I HATE YOU!" `2she screams.');
                await this.io.sln();
                await this.io.lln("`4YOU FEEL SO WOEBEGONE YOU LOSE A FOREST FIGHT FOR TODAY.");
                await this.io.sln();
                break;
        }
        this.player.forest_fights -= 1;
        await this.io.more();
    }

    private async _firstMeeting(): Promise<void> {
        await this.io.lln("`c`%THE WAILING GROWS LOUDER");
        await this.io.sln();
        await this.io.lln("`2You catch a glimpse of something moving in the mouth of the cave.");
        await this.io.sln();
        await this.io.lln("`2(`0I`2)nvestigate further");
        await this.io.lln("`2(`0G`2)et smart and leave it alone");
        await this.io.sln();
        await this.io.lw("`2Well? [`0I`2] : `0", 2);
        const och = await this._oliviaGetch("IG");
        if (och === "G") {
            await this.io.sln();
            await this.io.lln("`2You hurry away from this evil place.");
            await this.io.sln();
            await this.io.more();
            return;
        }
        await this.io.sln();
        await this.io.sln("You slowly make your way inside the the damp cave.  You feel a cold breeze - or perhaps you just shivered for another reason.");
        await this.io.sln();
        await this.io.lln("`4YOU TRIP OVER SOMETHING!");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln("`2You blindly reach down `8- `2your fingers find something wet `8- `2You have put your hand inside the mouth of a severed head.  `0You scream like a child!");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`#"Oh, do shut up!" `2the head implores you, scowling.');
        await this.io.sln();
        if (this.player.sex === "M") {
            await this.io.lln("`2You stare at the head in shock.  (which really isn't bad looking)");
        } else {
            await this.io.lln("`2You stare at the head in shock.");
        }
        await this.io.sln();
        await this.io.lln("`2(`0A`2)sk the head who she is");
        await this.io.lln("`2(`0B`2)oot her a distance");
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2After careful consideration you.. [`0A`2] `8: `%");
        const och2 = await this._oliviaGetch("AB");
        await this.io.sln();
        if (och2 === "B") {
            await this.io.lln('`0"C\'mere you freak of nature!" `2you taunt, grabbing her by the hair.');
            await this.io.sln();
            await this.io.lln('`#"NooOoooOooo!" `2she screams as you toss her deep into the underbrush.');
            await this.io.sln();
            if (this.player.sex === "M") {
                await this.io.lln("`2You can't stop thinking about what she would be like in bed.");
            } else {
                await this.io.lln("`2You can't help but wonder if you made the right choice.");
            }
            await this.io.sln();
            this.player.olivia_asshole = true;
            await this.io.more();
            return;
        }
        this.player.olivia = true;
        await this.io.showTxt("OLIVIA");
    }

    private async _romanceScene(): Promise<void> {
        this.player.olivia_count += 1;
        if (!this.settings.clean_mode) {
            if (this.player.olivia_count === 10) {
                await this.io.lln('`0"I\'m through with the hints!  Do you want to mess around?" `2she states bluntly.');
                await this.io.sln();
                await this.io.lln("`%\"Olivia, I'm flattered - But .. you don't have a body.\"");
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`0"If we put our minds to it, we can figure out a way." `2she grins wickedly.');
                await this.io.sln();
                await this.io.more();
            } else {
                await this.io.lln('`0"I\'m ready for love again.    Do you want to mess around?" `2she states bluntly.');
                await this.io.lln("");
            }
            await this.io.lln("`2(`0B`2)e pleasured by Olivia");
            await this.io.lln("`2(`0T`2)urn her down.");
            await this.io.sln();
            await this.io.lw("What will it be? [`0B`2] `8:`% ", 2);
            const och = await this._oliviaGetch("BT");
            if (och === "B") {
                await this.io.sln();
                await this.io.lln("`0You stroke her stump lovingly.");
                await this.io.sln();
                await this.io.more();
                await this.io.lln("`2Olivia gives all she has.  And in fact, what she is.");
                await this.io.lln("");
                await this.io.more();
                if (this.player.has_fairy) {
                    await this.io.lln("`b** `%UH OH! `b**");
                    await this.io.lln("");
                    await this.io.lln("`2You feel a buzzing in your pocket.  You smile, your old twig & berries still works.  `0The buzzing grows uncomfortably loud.");
                    await this.io.lln("");
                    await this.log.logLine("`0" + this.player.name + "'s `2fairy escapes.");
                    this.player.has_fairy = false;
                    this.player.olivia_count = 0;
                    await this.io.more();
                    await this.io.sln();
                    await this.io.lln("`%A tiny light shoots out of your trousers!");
                    await this.io.sln();
                    await this.io.lln("`2Olivia blinks in surprise.");
                    await this.io.sln();
                    await this.io.more();
                    await this.io.sln("You wince - Your fairy is loose!  You attempt to suavely cover up your 'accident'.");
                    await this.io.sln();
                    await this.io.lln('`%"Wow baby!  Uh, that was great, gotta go!"');
                    await this.io.sln();
                    await this.io.more();
                    await this.io.lln("`2You leave an angry Olivia while you search around her cave for the little creature.  Looks like it's gone for good.");
                    await this.io.sln();
                    await this.io.lln("`4FOR BLOWING IT AND MAKING OLIVIA MAD, YOU GET NO EXPERIENCE.");
                    await this.io.sln();
                    await this.io.more();
                    return;
                }
                await this.log.logLine("`0" + this.player.name + " `2walks out of the forest acting chipper!");
                await this.io.lln("`2A very short time later...");
                await this.io.sln();
                await this.io.lln('`%"That was wonderfull!  Can I put you in my napsack and take you with me?" `2you ask hopefully.');
                await this.io.sln();
                await this.io.lln('`0"No, I don\'t think so.  My place is here, I would just be a freak and an oddity anywhere else." `2she answers sadly.');
                await this.io.sln();
                await this.io.more();
                await this.io.lln('`%"But.. that\'s what you are here too!  Keep your chin up, honey." `2you clumsly encourage.');
                await this.io.sln();
                await this.io.lln("`2She smiles wanly.");
                await this.io.sln();
                const tmp = this.player.level * this.player.level * 25;
                await this.io.lln("`%YOU RECIEVE " + prettyInt(tmp) + " EXPERIENCE.");
                this.player.exp += tmp;
                if (this.player.exp > 2000000000) {
                    this.player.exp = 2000000000;
                }
                this.player.olivia_count += 1;
                await this.io.sln();
                await this.io.more();
                await this.dailyMaint.tournamentCheck();
                return;
            }
        }
        if (this.settings.clean_mode) {
            await this.io.lln('`0"I\'ll never find a husband!" `2Olivia cries for no apparent reason.');
            await this.io.lln("");
        }
        await this.io.sln();
        await this.io.lln('`%"Lets not get a ..head of ourselves.  You need someone who you can relate too.  Someone who... well also is a severed head?" `2you let her down as easy as you can.');
        await this.io.sln();
        await this.io.lln('`0"But I\'ll NEVER find him!!" `2Olivia wails.');
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`0"Oh yes you will!  Someday." `2you lie glibly.');
        await this.io.sln();
        await this.io.lln("`2Feeling uncofortably, you decide to take off.");
        await this.io.sln();
        await this.io.more();
    }

    private async _historyReveal(): Promise<void> {
        await this.io.lln("`2Olivia is perched on a rock waiting for you.");
        await this.io.sln();
        await this.io.lln('`0"Hello.  I need to tell you something.  I need to tell you why they beheaded me."');
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`%"Fine.  If you need to get this off your che, <cough>, uh, go ahead." `2you encourage.');
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`c`%OLIVIAS HISTORY", 25);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        await this.io.lln("`2Olivia was not beheaded publicly.  She was not even beheaded by a decree of the king.");
        await this.io.sln();
        await this.io.lln("She was decapitated by a man named `0Earnest Drinklewip`2. ");
        await this.io.sln();
        await this.io.sln("Why did he do it?  Olivia tells you because she would not find favor with him.  His reason was she was a witch.  She assures you she is not.");
        await this.io.sln();
        await this.io.sln("You don't know what to believe - all you know for sure is this man slew her, and put her head in this cave to rot.  The problem is it didn't. ");
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`%"So why aren\'t you dead and rotting, Olivia?" `2you ask, confused.');
        await this.io.sln();
        await this.io.lln("`0\"I don't know!  Maybe I'm charmed, maybe I'm cursed.  I don't know.\"");
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`%\"I'm going to find 'em!  And find out what happened to the rest of you!  Goodbye for now!\"");
        await this.io.sln();
        this.player.olivia_count += 1;
        await this.io.more();
    }

    private async _consoleOlivia(): Promise<boolean> {
        if (this.player.sex !== "F") return false;
        await this.io.sln();
        await this.io.lln("`2You feel sorry for the head, and attempt to solace her.");
        await this.io.lw('`%"', 2);
        switch (random(5)) {
            case 0:
                await this.io.lln("Don't feel bad Olivia, I'll help you cope.\" `2you offer.", 0);
                break;
            case 1:
                await this.io.lln('We girls will always stick together!" `2you swear.', 0);
                break;
            case 2:
                await this.io.lln("You're lucky, you don't have to watch your weight.\"`2you tell her.", 0);
                break;
            case 3:
                await this.io.lln('Why Olivia, I love that uh, hair style you have today!" `2you compliment.', 0);
                break;
            case 4:
                await this.io.lln("I'm your friend always.  Lets do each others hair.\" `2you offer.", 0);
                break;
        }
        await this.io.sln();
        if (this.player.olivia_count < 6) {
            await this.io.lln("`2She thanks you, and feels better!");
            await this.io.sln();
            await this.io.lln("`%HELPING ANOTHER LIFTS YOUR SPIRITS.");
            this.player.high_spirits = true;
        } else {
            await this.io.lln('`0"But ' + this.player.name + "`0, I'm not depressed anymore!\" `2she laughs.");
            await this.io.sln();
        }
        await this.io.sln();
        await this.io.more();
        return true;
    }

    private async _doHair(): Promise<boolean> {
        if (this.player.sex !== "F") return false;
        await this.io.sln();
        await this.io.lln("`2You take your brush to Olivia's tangled locks.");
        await this.io.sln();
        if (this.player.olivia_count < 6) {
            await this.io.lln('`0"Don\'t touch me!" `2Olivia screeches.');
            await this.io.sln();
        } else {
            await this.io.lln("`2She thanks you, and feels better!");
            await this.io.sln();
            await this.io.lln("`%HELPING ANOTHER LIFTS YOUR SPIRITS.");
            this.player.high_spirits = true;
            await this.io.sln();
        }
        await this.io.more();
        return true;
    }

    private async _askForKiss(): Promise<boolean> {
        if (this.player.sex !== "M") return false;
        await this.io.lln("`c`%LOVE IN YOUR HAND", 24);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        if (random(2) === 0) {
            await this.io.lln("`2You pick Olivia up by the ears and kiss her soundly.");
        } else {
            await this.io.lln("`2You carefully wipe the dirt of Olivia's lips and kiss her.");
        }
        if (this.player.olivia_count < 6) {
            await this.io.lln('`0"Don\'t touch me!" `2Olivia screeches.');
            await this.io.sln();
        } else {
            await this.io.sln();
            await this.io.lln("`%YOU LEAVE IN HIGH SPIRITS!");
            await this.io.sln();
            this.player.high_spirits = true;
        }
        await this.io.more();
        return true;
    }

    private async _getInsideHead(): Promise<void> {
        await this.io.lln("`c`%A FREUDIAN SLIP", 24);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        this.io.sw('"', 2);
        this.io.foreground(15);
        switch (random(5)) {
            case 0:
                await this.io.lln('Penny for your thoughts?" `2you inquire.', 0);
                break;
            case 1:
                await this.io.lln("Watcha thinkin'?\" `2you ask politely.", 0);
                break;
            case 2:
                await this.io.lln('Will you tell me about yourself?" `2you ask Olivia.', 0);
                break;
            case 3:
                await this.io.lln("What's on your mind?\" `2you inquire.", 0);
                break;
            case 4:
                await this.io.lln('You must be thinking hard, since thats all you can do." `2you laugh.', 0);
                break;
        }
        await this.io.sln();
        await this.io.lln("`2Olivia nudges herself to a better speaking position.");
        await this.io.sln();
        if (random(2) === 0) {
            await this.io.lln('`0"I was just thinking about my past.  I grew up in a great palace. I was pampered and treated like a queen.  In fact, I would have been queen too - if not for the evil Duke of..`%' + this.castles[this.whichCastle].name + '`0 was it?  Something like that.  And then.."');
            await this.io.sln();
            await this.io.more();
        } else {
            await this.io.lln('`0"Well..  I was thinking about when I had a body.  A very beautiful one if I do say myself.  Men followed me like flies on honey.  Especially one man.  At the time he was a town crier at `%' + this.castles[this.whichCastle].name + '`0. ');
            await this.io.sln();
            await this.io.sln('It is because of him I am like this..You see, he.."');
            await this.io.sln();
            await this.io.more();
        }
    }
}

export default Olivia;
