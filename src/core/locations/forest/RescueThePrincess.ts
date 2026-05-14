/**
 * RescueThePrincess - Forest sub-scene: Rescue the Princess event for LORD.
 *
 * A combat encounter at one of Olivia's castles where the player fights a
 * guard to rescue a captive princess, rewarded with gold and a charm bonus.
 */
import { random, prettyInt } from '@lordts/util/Util';
import type { CastleStats, Settings } from '../../types';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type Log from '../../Log';
import type DailyMaint from '../../DailyMaint';

class RescueThePrincess {

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
        setWhichCastle: (v: number) => void
    ) {
        this._getWhichCastle = getWhichCastle;
        this._setWhichCastle = setWhichCastle;
    }

    get whichCastle(): number { return this._getWhichCastle(); }
    set whichCastle(v: number) { this._setWhichCastle(v); }

    // ── Rescue scene ───────────────────────────────────────────────────

    async run(): Promise<void> {
        let him: string;
        let lad: string;
        let ich: string;

        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("FOREST EVENT", 25);
        this.io.foreground(2);
        await this.io.sln(this.io.divider());
        this.io.foreground(10);
        if (this.player.horse) {
            await this.io.sln("Your horse stumbles.");
        } else {
            await this.io.sln("You stumble.");
        }
        await this.io.sln();
        this.io.foreground(2);
        if (this.player.done_tower) {
            await this.io.sln("Sure enough.  Another dead bird with a scroll.");
            await this.io.sln();
        } else {
            await this.io.lln("This would normally not be noted, since this happens all the time - but what is interesting here is WHAT you stumbed over.");
            await this.io.sln();
            await this.io.more();
            this.io.foreground(10);
            await this.io.sln("The object in question is a large dead bird.  Its stink is great.");
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln("This would normally not be noted either, since the forest is full of dead things, and sometimes they rot before being eaten.");
            await this.io.sln();
            this.io.foreground(10);
            await this.io.sln("But the bird has a small scroll carefully tied to one leg.");
            await this.io.sln();
        }
        await this.io.more();
        await this.io.lln("`r1  `%THE SCROLL READS:  `r0");
        await this.io.sln();
        this.io.foreground(7);
        switch (random(3)) {
            case 0:
                await this.io.sln("Dear whomever:");
                await this.io.sln();
                await this.io.lln("My ruthless uncle has trapped me in his castle.  He is angered because I will not submit to him - in the way that he wants me to.");
                await this.io.sln();
                await this.io.sln("Please come save me,");
                await this.io.sln("-Sleepless in a tower", 8);
                break;
            case 1:
                await this.io.sln("Dear Brave Heart:");
                await this.io.sln();
                await this.io.lln("I am to wed one against my will.  My father tells me I am selfish, because this political marriage will bring peace.");
                await this.io.sln();
                await this.io.sln("Get me out of here,");
                await this.io.sln("-a prisoner of war", 8);
                break;
            case 2:
                await this.io.sln("To whom it may concern:");
                await this.io.sln();
                await this.io.lln("Geez am I bored.  I've been locked in the highest peak of this castle for an ever so long time.  Crikey,  I would explain why, but I'm running out of ink.  You see, I've been up here for such a long time, it's drying up.  Well what do you know!  Guess I have enough to explain after all!  Isn't that a lucky break?  Ok, I'm up here because I wa..");
                await this.io.sln();
                await this.io.sln("The note isn't signed.");
                break;
        }
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("You quickly swipe a tear from your eye as you put down the note.");
        await this.io.sln();
        await this.io.more();
        if (this.player.sex === "M") {
            him = "her";
            lad = "girl";
        } else {
            him = "him";
            lad = "lad";
        }
        await this.io.lln("`2(`0S`2)ave " + him);
        await this.io.lln("`2(`0I`2)gnore the " + lad);
        ich = await this.io.prompt(
            "  `2Well? [`%S`2] `8: `%",
            [{ key: 'S', label: 'Save' }, { key: 'I', label: 'Ignore' }],
            'rescue_choice',
            { defaultKey: 'S', leadingBlank: true, trailingBlank: true }
        );
        if (ich === "I") {
            await this.io.sln("You look at the note a moment - then blithely toss it in a nearby creek.  You skip away merrily! (evil can be fun!)");
            await this.io.sln();
            await this.io.more();
            return;
        }
        await this.io.lln("`0You're quite a hero.  Unfortunately, the " + lad + " seems to have forgotten the return address.  You'll have to guess.");
        await this.io.sln();
        await this.io.lln("`2(`0C`2)astle Coldrake");
        await this.io.lln("`2(`0F`2)ortress Liddux");
        await this.io.lln("`2(`0G`2)annon Keep");
        await this.io.lln("`2(`0P`2)enyon Manor");
        await this.io.lln("`2(`0D`2)ema's Lair");
        await this.io.sln();
        await this.io.lw("Where do we go now? `8: `%", 2);
        this.io.emitPrompt('castle_choice', [
            { key: 'C', label: 'Castle Coldrake' },
            { key: 'F', label: 'Fortress Liddux' },
            { key: 'G', label: 'Gannon Keep' },
            { key: 'P', label: 'Penyon Manor' },
            { key: 'D', label: 'Dema\'s Lair' },
        ]);
        do {
            ich = (await this.io.getkey()).toUpperCase();
        } while ("CFGPD".indexOf(ich) === -1);
        // Map letter choice to castle index 1-5 (matches castles[] array offsets)
        const castle = "CFGPD".indexOf(ich) + 1;
        await this.io.sln(ich, 0);
        await this.io.sln();
        await this.io.lln("`2You set your jaw resolutely and journey to `%" + this.castles[castle].name + "`2.");
        await this.io.sln();
        await this.io.more();
        this.io.sclrscr();
        await this.io.showTxt("TOWER");
        this.io.emitPrompt('tower_continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`%THE RESCUE", 25);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        this.player.done_tower = true;
        await this.io.lln("`%THE DOOR SWINGS WIDE OPEN!");
        await this.io.sln();
        await this.io.more();
        // Re-randomize the target castle for the next rescue event
        if (castle === this.whichCastle) {
            await this._rescueSuccess(lad);
        } else {
            switch (random(2)) {
                case 0:
                    await this._hollEncounter();
                    return;
                case 1:
                    await this._chessPlayersEncounter(castle);
                    break;
            }
        }
        await this.io.more();
    }

    private async _rescueSuccess(lad: string): Promise<void> {
        this.whichCastle = random(5) + 1;
        await this.io.lln('`0"You\'ve come for me!" `2shouts an overjoyed (and darn good looking) ' + lad + ".");
        await this.io.sln();
        await this.io.lln("`2You breathe a sigh of relief.  This was the right place.");
        await this.io.sln();
        if (this.player.sex === "M") {
            if (!this.settings.clean_mode) {
                await this.io.lln('`2The girl eyes you dreamily.  `0"I can never repay you, and I.."');
                await this.io.sln();
                await this.io.lln('`%"Oh but you can.  Is that your bed?" `2you interrupt.');
            }
            await this.io.lln("");
            await this.io.more();
            await this.io.lln(
                "  `2" +
                    prettyInt(this.player.cha) +
                    " minute" +
                    (this.player.cha > 1 ? "s" : "") +
                    " later, you feel quite repaid.",
            );
        }
        await this.io.sln();
        await this.io.lln("`0YOU GET `%" + prettyInt(this.player.level * this.player.level * 20) + " `0EXPERIENCE.");
        this.player.exp += this.player.level * this.player.level * 20;
        if (this.player.exp > 2000000000) {
            this.player.exp = 2000000000;
        }
        await this.io.sln();
        await this.io.more();
        if (this.player.sex === "M") {
            if (!this.settings.clean_mode) {
                await this.io.lln('`%"Well, that was fun, gotta go," `2you mutter as you throw your tunic back on.');
                await this.io.sln();
                this.player.laid += 1;
                await this.io.lln('A sweet voice from the bed stops you as you hit the stairs. `0"Wait!');
                await this.io.sln('I have something else for you too."');
                await this.io.lln("");
                await this.io.more();
            }
            await this.io.lln("`2Your blank face turns to joy as she hands you a pouch.");
        } else {
            await this.io.lln("`2Your blank face turns to joy as he hands you a pouch.");
        }

        await this.io.sln();
        await this.io.lln("`0YOU GET `%" + prettyInt(3 * this.player.level) + " `0GEMS FOR YOUR TROUBLE.");
        this.player.gem += 3 * this.player.level;
        if (this.player.gem > 2000000000) {
            this.player.gem = 2000000000;
        }
        await this.io.sln();
        if (this.player.sex === "M") {
            await this.log.logLine("`0" + this.player.name + " `2saved a princess today!");
        } else {
            await this.log.logLine("`0" + this.player.name + " `2saved a prince today!");
        }
        await this.dailyMaint.tournamentCheck();
    }

    private async _hollEncounter(): Promise<void> {
        await this.io.lln("`2The room is empty, save a giant chest in the middle.");
        // DIFF: This didn't decrease your HP if it was less than 4...
        this.player.hp = parseInt(String(this.player.hp / 4), 10);
        if (this.player.hp < 1) {
            this.player.hp = 1;
        }
        await this.io.sln();
        await this.io.lln('`%"Hello?  Anybody home?" `2you call softly.');
        await this.io.sln();
        await this.io.sln("You jump in surprise when you hear a voice answer - from the chest.");
        await this.io.sln();
        await this.io.lln('`0"Help me!  I\'m in here!  I wrote the note!"`2 the voice pleads.');
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`%"Um, how did you write the note from in there?" `2you wonder out loud.');
        await this.io.sln();
        await this.io.lln('`0"Nevermind that!  Just help me!"');
        await this.io.sln();
        await this.io.more();
        if (this.player.sex === "M") {
            await this.io.lln('`%"Fine." `2you open the chest.  Surprisingly, there is not a fair maiden inside.  Instead, you find a..');
        } else {
            await this.io.lln('`%"Fine." `2you open the chest.  Surprisingly, there is not a fair prince inside.  Instead, you find a..');
        }
        await this.io.sln();
        await this.io.more();
        if (this.player.sex === "M") {
            await this.io.lln('`%"`bMY GOD A HOLL!  `%A HALF HUMAN HALF TROLL WOMAN!  NOOO!" `2you scream.');
        } else {
            await this.io.lln('`%"`bMY GOD A HOLL!  `%A HALF HUMAN HALF TROLL MAN!  NOOO!" `2you scream.');
        }
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`c`%THE UGLY PART", 25);
        this.io.foreground(2);
        await this.io.sln(this.io.divider());
        if (!this.settings.clean_mode) {
            if (this.player.sex === "M") {
                await this.io.sln("You are violated by this hairy beast.  Apparently she needs love like anyone else.");
            } else {
                await this.io.sln("You are violated by this hairy beast.  Apparently he needs love like anyone else.");
            }
        } else {
            await this.io.sln("The thing beats you up.  Yeah.  Real bad.");
        }
        await this.io.sln();
        this.io.foreground(4);
        if (this.player.sex === "M") {
            await this.io.sln("YOU WEAKLY CRAWL AWAY FROM HER SOMETIME LATER.");
        } else {
            await this.io.sln("YOU WEAKLY CRAWL AWAY FROM HIM SOMETIME LATER.");
        }
        await this.io.sln();
        await this.log.logLine("`0" + this.player.name + " `2had a nasty run in with a Holl!");
        await this.io.more();
    }

    private async _chessPlayersEncounter(castle: number): Promise<void> {
        this.io.foreground(10);
        if (this.player.sex === "M") {
            await this.io.sln("You see two beautiful women playing chess.");
            await this.io.sln();
            await this.io.lln('`%"Hello, ladys.  Which one of you needs rescuing?" `2you ask politely.');
        } else {
            await this.io.sln("You see two handsome men playing chess.");
            await this.io.sln();
            await this.io.lln('`%"Hello, boys.  Which one of you needs rescuing?" `2you ask politely.');
        }
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`0"Neither!" `2they chime.');
        await this.io.sln();
        if (this.player.sex === "M") {
            await this.io.lln('`2You scratch your chin in confusion.  `%"So where is the damn damsel in distress?!"');
        } else {
            await this.io.lln("`2You scratch your chin in confusion.  `%\"So where is the stinkin' prince in distress?!\"");
        }
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`0At this moment, a messager burst through the broken doorway.");
        await this.io.sln();
        await this.io.lln('`5"My friends, I bear terrible news - `%' + this.castles[castle].name + '`5 has been attacked.  Your father the King is dead." `2the messenger is now audibly sobbing.');
        await this.io.sln();
        await this.io.more();
        await this.io.lln('`%"Ah.  Yes.  Well, this is all very tragic, but I uh, need to be going." `2you studder uncomfortably.');
        await this.io.sln();
        this.io.foreground(10);
        if (this.player.sex === "M") {
            await this.io.sln("The now ashen white faced women look at you dumbfounded as you make your exit.");
        } else {
            await this.io.sln("The now ashen white faced men look at you dumbfounded as you make your exit.");
        }
        await this.io.sln();
        if (this.player.sex === "M") {
            await this.log.logLine("`0" + this.player.name + " `2showed courage today by trying to save a princess.");
        } else {
            await this.log.logLine("`0" + this.player.name + " `2showed courage today by trying to save a prince.");
        }
    }
}

export default RescueThePrincess;
