/**
 * DarkhorseTavern - Forest sub-scene: The Darkhorse Tavern for LORD.
 *
 * A secret tavern hidden in the forest. Players can drink, gamble gold,
 * challenge other patrons to fights, and interact with the shady regulars.
 */
import { random, format, prettyInt, cleanStr, spacePad } from '@lordts/util/Util';
import type Blackjack from '../../locations/Blackjack';
import type { LoadedPlayerRecord, UiMode } from '../../types';
import type IO from '../../io/IO';
import type Log from '../../Log';
import type Player from '../../Player';
import type RedDragonInn from '../../locations/RedDragonInn';
import type { Settings } from '../../types';
import type State from '../../State';

class DarkhorseTavern {
    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private player: Player,
        private state: State,
        private settings: Settings,
        private log: Log,
        private redDragonInn: RedDragonInn,
        private blackjack: Blackjack,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Tavern scene ────────────────────────────────────────────────────

    async run(): Promise<void> {
        let dch: string;
        let gamesPlayed: number = 0;

        if (this.rip) await this.io.showRip("CLOAK");
        else await this.io.showTxt("CLOAK");
        do {
            if (!this.rip) {
                await this.io.sln();
                await this.io.lln("`0DarkCloak Tavern `2(C,E,T,V,D,G,W,R) (? for menu)");
            }
            await this.io.sln();
            await this.io.lw("`2Your command? : ", 2);
            this.io.emitPrompt('darkcloak_menu', [
                { key: 'C', label: 'Converse' },
                { key: 'E', label: 'Examine' },
                { key: 'T', label: 'Talk' },
                { key: 'V', label: 'View' },
                { key: 'D', label: 'Daily News' },
                { key: 'G', label: 'Gamble' },
                { key: 'W', label: 'Write' },
                { key: 'R', label: 'Return' },
            ]);
            dch = (await this.io.getkey()).toUpperCase();
            if ("\rQ".indexOf(dch) !== -1) {
                dch = "R";
            }
            if (!this.rip) await this.io.sln(dch);
            switch (dch) {
                case "D":
                    await this.log.showLog();
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "Y":
                    await this.io.showStats();
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "G":
                    if (this.rip) await this.io.showRip("GAMBLE");
                    gamesPlayed = await this._gamble(gamesPlayed);
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "T":
                    await this._chance();
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "W":
                    await this._oldMan();
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "C":
                    await this.redDragonInn.converse(true);
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
                case "?":
                    if (this.rip) await this.io.showRip("CLOAK");
                    else await this.io.showTxt("CLOAK");
                    break;
                case "E":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.showBuffer(this._rankLays(), true, true);
                    await this.io.sln();
                    await this.io.moreNoMail();
                    if (this.rip) await this.io.showRip("CLOAK");
                    break;
            }
        } while (dch !== "R");

        // 4% chance of a random blackjack encounter when leaving the tavern
        if (random(25) === 17) {
            await this.blackjack.run();
        }
    }

    private async _wager(): Promise<number> {
        let ret: number;

        do {
            await this.io.lln(
                "  `2How much gold of your `%" +
                    prettyInt(this.player.gold) +
                    "`2 will you hazard? (`00`2 to chicken out)",
            );
            await this.io.lw("`2WAGER : `0", 2);
            ret = parseInt(await this.io.getstr({ len: 11, integer: true }), 10);
            if (isNaN(ret)) {
                ret = 0;
            }
            await this.io.sln();
            if (ret > this.player.gold) {
                await this.io.lln("`2Betting what you don't have is `4NOT`2 a good idea.");
                await this.io.sln();
                ret = -1;
            } else if (ret < 0) {
                await this.io.lln("`2You don't think that will go over too big.");
                await this.io.sln();
            }
        } while (ret < 0);
        await this.io.sln();
        return ret;
    }

    private async _gambleNumberGuess(bet: number): Promise<void> {
        let hisnum: number;

        await this.io.lln('`0"Fine!  `%' + prettyInt(bet) + '`0 it is!  Concentrate on a number."`2');
        await this.io.sln();
        const mynum = random(100) + 1;
        await this.io.lln("`2You concentrate on the number.");
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        await this.io.lln("`%" + mynum, 0);
        await this.io.sln();
        await this.io.lln("`2The old man studies you quietly for a moment.  Then screams in delight.");
        await this.io.sln();
        await this.io.moreNoMail();
        // DIFF: This was clearly broken, and he always guess right.
        // it was hisnum !== mynum in the loop test.
        // ~45% chance old man guesses correctly; otherwise pick any wrong number
        hisnum = random(100) + 1;
        if (hisnum > 55) {
            hisnum = random(100) + 1;
            while (hisnum === mynum) {
                hisnum = random(100) + 1;
            }
        } else {
            hisnum = mynum;
        }
        await this.io.lw('`0"The number is', 2);
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        await this.io.lw(".`%");
        await this.io.lln(hisnum + "`0 isn't it?!!!!!!!!!!!");
        await this.io.sln();
        if (hisnum !== mynum) {
            await this.io.lln("`2You sadly inform the Old Man of his mistake, and he grudgingly gives you `%" + prettyInt(bet) + "`2 gold from his pouch.");
            this.player.gold += bet;
            if (this.player.gold > 2000000000) {
                this.player.gold = 2000000000;
            }
            return;
        }
        await this.io.lln("`2You feel obliged to admit that he chose correctly.  You count out `%" + prettyInt(bet) + "`2 gold and give it to him with a scowl.");
        this.player.gold -= bet;
        await this.io.sln();
        await this.io.lln("`2The old man dances a jig of joy!");
    }

    private async _gambleMugGame(bet: number): Promise<void> {
        await this.io.lln('`0"Agreed!" `2The old man waits for your response.');
        await this.io.sln();
        await this.io.more();
        switch (random(2)) {
            case 0:
                await this.io.lln("`2You demand to see what's in the first mug!");
                break;
            case 1:
                await this.io.lln("`2You demand to see what's in the second mug!");
                break;
        }
        await this.io.sln();
        const hisnum = random(100) + 1;
        await this.io.lw("`2The old man slowly turns over the mug.", 2);
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        this.io.sw(".");
        // Player wins ~55% of the time
        if (hisnum > 45) {
            await this.io.lln("`%IT HAS HIS WOODEN TEETH IN IT!", 0);
            this.player.gold += bet;
            if (this.player.gold > 2000000000) {
                this.player.gold = 2000000000;
            }
            await this.io.sln();
            await this.io.lln("`2The entire bar cheers at your success!");
            await this.io.sln();
            await this.io.sln("The old man groans and hands you the gold you've won.");
        } else {
            await this.io.lln("`4IT IS EMPTY SAVE SOME STALE BEER!", 0);
            this.player.gold -= bet;
            await this.io.sln();
            await this.io.lln("`2The old man howls in delight as you pay him.");
        }
    }

    private async _gambleDaggerThrow(bet: number): Promise<void> {
        let mynum: number;

        await this.io.lln("`2The old man positions himself carefully, and places the Mug on his head.");
        await this.io.sln();
        await this.io.lln('`0"You\'ll never hit it, sharpshooter!  Throw it already!"');
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`2You give it your best shot.");
        await this.io.sln();
        await this.io.lw("`%** `0WHO", 2);
        for (mynum = 0; mynum < 15; mynum += 1) {
            await this.io.mswait(100);
            this.io.sw("O");
        }
        await this.io.lln("SH `%**", 0);
        await this.io.sln();
        // ~56% chance of hitting the mug (player-favorable)
        if (random(100) + 1 > 44) {
            await this.io.lln("`2YOU HAVE KNOCKED IT OFF LEAVING THE OLD MAN HIGH AND DRY!");
            await this.io.sln();
            await this.io.lln("The old man swears sourly, but pays you the `%" + prettyInt(bet) + "`2 gold.");
            await this.io.sln();
            this.player.gold += bet;
            if (this.player.gold > 2000000000) {
                this.player.gold = 2000000000;
            }
            return;
        }
        this.io.foreground(4);
        await this.io.sln("YOU MISS YOUR TARGET!");
        this.io.foreground(2);
        await this.io.sln();
        await this.io.mswait(500);
        switch (random(6)) {
            case 0:
                await this.io.lln("`2The dagger ricochetted off the wall and into `%Chance`2's drink!");
                await this.io.sln();
                await this.io.sln("He looks furious!");
                break;
            case 1:
                await this.io.sln("The dagger smoothly implants itself into the old mans forehead!");
                await this.io.sln();
                await this.io.sln("But he is ok!");
                break;
            case 2:
                await this.io.sln("The dagger stabs deeply into the oak behind the old mans head!");
                break;
            case 3:
                await this.io.sln("The dagger stabs near your foot!  The entire tavern laughs at you!");
                break;
            case 4:
                await this.io.lln("The dagger hits the bar, and slides to a screeching stop in front of a young warrior.  His face is white as a sheet - The entire bar laughs!");
                break;
            case 5:
                await this.io.sln("The dagger flies through an open window!");
                break;
        }
        await this.io.sln();
        await this.io.sln("The old man laughs with glee.  You mumble curses as you pay him.");
        this.player.gold -= bet;
    }

    private async _gamble(gamesPlayed: number): Promise<number> {
        let bet: number;

        await this.io.lln("`c`%** GAMBLE TIME! **");
        await this.io.sln();
        this.io.foreground(2);
        await this.io.sln("You saunter over to the bar and demand that someone gamble with you.");
        await this.io.sln();
        // Limit to 2 gamble sessions per tavern visit
        if (gamesPlayed > 1) {
            await this.io.lln("No one seems too thrilled at the prospect.  Perhaps if you came back another time.");
            await this.io.sln();
            if (gamesPlayed > 2) {
                await this.io.lln("(You wonder if it had anything to do with your making a joke out of the word honor)");
                await this.io.sln();
                if (this.rip) {
                    this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                    await this.io.getkey();
                }
            }
            return gamesPlayed;
        }

        gamesPlayed += 1;
        switch (random(3)) {
            case 0:
                await this.io.sln("The old man stops etching on the table he is at and walks over to you.");
                await this.io.sln();
                await this.io.lln('`0"I\'ll play a game with ya, kid!  I\'ll bet I can guess what number you are thinkin\'!"');
                await this.io.sln();
                await this.io.more();
                bet = await this._wager();
                if (bet === 0) {
                    await this.io.lln("`2The old man laughs in your face then continues his carving in the table.");
                    break;
                }
                await this._gambleNumberGuess(bet);
                break;
            case 1:
                await this.io.sln("The old man stops etching on the table he is at and walks over to you.");
                await this.io.sln();
                await this.io.lln('`0"I\'ll play a game with ya, kid!"');
                await this.io.sln();
                await this.io.lln('`2The old man grabs two wooden mugs from a table and slaps them down in front of you upside down.  `0"Guess which one I hid muh teeth in!"');
                await this.io.sln();
                await this.io.more();
                bet = await this._wager();
                if (bet === 0) {
                    await this.io.lln("`2The old man laughs in your face then continues his carving in the table.");
                    break;
                }
                await this._gambleMugGame(bet);
                break;
            case 2:
                await this.io.sln("The old man stops etching on the table he is at and walks over to you.");
                await this.io.sln();
                await this.io.lln('`0"I\'ll play a game with ya, kid!"');
                await this.io.sln();
                await this.io.lln("`2The old man walks over to you and hands you a small dagger.  Then he moves to the other side of the Tavern, and picks up a tankard of brew.");
                await this.io.sln();
                await this.io.lln("`0\"I'll bet you can't knock this off my head without getting me wet!\"");
                await this.io.sln();
                await this.io.more();
                bet = await this._wager();
                if (bet === 0) {
                    await this.io.lln("`2The old man laughs in your face then continues his carving in the table.");
                    break;
                }
                await this._gambleDaggerThrow(bet);
                break;
        }
        await this.io.sln();
        if (this.rip) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        return gamesPlayed;
    }

    private async _showEnemyInfo(op: LoadedPlayerRecord): Promise<void> {
        let he: string;

        this.player.gem -= 2;
        await this.io.lln('`0"Alright.  Come with me."');
        await this.io.sln();
        await this.io.lln("`2Chance leads you to a small room in back of the tavern, and you take a comfortable seat.");
        await this.io.sln();
        await this.io.lln('`0"Well...Here is everthing I know about ' + op.name + '`0."');
        await this.io.sln();
        await this.io.more();
        if (op.sex === "M") {
            he = "he";
        } else {
            he = "she";
        }
        await this.io.lln(
            '  `0"Fights with a ' +
                op.weapon +
                "`0 and has a total Strength of `%" +
                prettyInt(op.str) +
                '`0."',
        );
        await this.io.lln(
            '  `0"Wears a ' +
                op.arm +
                "`0 and has a total Defense of `%" +
                prettyInt(op.def) +
                '`0."',
        );
        await this.io.sln();
        if (op.cha < 3) {
            await this.io.lln('`0"' + op.name + ' is very ugly."');
        } else if (op.cha < 5) {
            await this.io.lln('`0"' + op.name + ' is kind of blah looking."');
        } else if (op.cha < 10) {
            await this.io.lln('`0"' + op.name + ' is fairly good looking."');
        } else if (op.cha < 50) {
            await this.io.lln('`0"' + op.name + ' has a very fair countenance."');
        } else if (op.cha < 90) {
            // DIFF: This used the *players* sex!
            if (op.sex === "F") {
                await this.io.lln('`0"' + op.name + ' is a very good looking woman."');
            } else {
                await this.io.lln('`0"' + op.name + ' gets all the women...The lucky brute!"');
            }
        } else {
            // DIFF: This used the *players* sex!
            if (op.sex === "F") {
                await this.io.lln('`0"I have heard ' + op.name + ' has the face and body of a Goddess."');
            } else {
                await this.io.lln('`0"' + op.name + ' is a good looking bastard."');
            }
        }
        await this.io.sln();
        await this.io.lln('`0"Total worth in gold is ' + prettyInt(op.gold + op.bank) + '."');
        await this.io.sln();
        await this.io.lln('`0"Last time we checked, ' + he + " had " + prettyInt(op.gem) + ' `%Gems`0."');
        await this.io.sln();
        if (op.kids === 0) {
            await this.io.lln('`0"' + op.name + ' has no offspring."');
        } else {
            await this.io.lln('`0"' + op.name + " has `%" + prettyInt(op.kids) + " `2offspring.");
        }
        if (op.horse) {
            await this.io.lln("`0That person owns a horse.");
            await this.io.sln();
        }
        // DIFF: Didn't check Seth and Violet marriages...
        await this.state.getState(false);
        if (
            op.married_to > -1 ||
            this.state.married_to_seth === op.Record ||
            this.state.married_to_violet === op.Record
        ) {
            await this.io.lln("`0That person is married.");
            await this.io.sln();
        }
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async _chance(): Promise<void> {
        let ich: string;
        let ch: string = '';
        let op: LoadedPlayerRecord;
        let pl: number;
        let him: string;
        let he: string;
        let prof: string;
        const classStrs: string[] = ["Nobody", "`0Warrior", "`#Mystical Skills User`0", "`9Thief`0"];

        const cmenu = async (): Promise<void> => {
            if (this.rip) await this.io.showRip("CHANCE");
            else await this.io.showTxt("CHANCE");
        }

        await cmenu();

        do {
            await this.io.lw(" `2 Your command? (`0? `2for menu)  [`0R`2] : ");
            this.io.emitPrompt('chance_menu', [
                { key: 'T', label: 'Talk About Colors' },
                { key: 'P', label: 'Practice Colors' },
                { key: 'L', label: 'Learn About Enemy' },
                { key: 'S', label: 'Select Profession' },
                { key: 'R', label: 'Return' },
            ]);
            ich = (await this.io.getkey()).toUpperCase();
            if (ich === "\r") {
                ich = "R";
            }
            await this.io.sln(ich, 0);
            await this.io.sln();
            if (ich === "L") {
                if (this.rip) await this.io.showRip("W1");
                await this.io.lln('`0"I know many things about many people.  Who is your enemy?"`2');
                pl = await this.player.findPlayer();
                if (pl === -1) {
                    await this.io.lln("");
                    await this.io.lln('`0"I don\'t know anyone with a name even close to that."`2');
                    await this.io.sln();
                    if (this.rip) {
                        this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                        await this.io.getkey();
                    }
                    await cmenu();
                } else if (pl === this.player.Record) {
                    if (this.player.sex === "M") {
                        him = "him";
                        he = "he";
                    } else {
                        him = "her";
                        he = "she";
                    }
                    await this.io.lln('`0"Yes..I know ' + him + ".  " + he + ' is a favorite customer of mine!"');
                    await this.io.lln("`2Chance laughs heartily.");
                    await this.io.lln("");
                    if (this.rip) {
                        this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                        await this.io.getkey();
                        await cmenu();
                    }
                } else {
                    const foundPlayer = this.player.playerGet(pl);
                    if (!foundPlayer) break;
                    op = foundPlayer;
                    prof = classStrs[op.clss];
                    await this.io.lln("`2Chance's face turns somber.");
                    await this.io.lln('`0"' + op.name + "`0 the " + prof + '?  I know who that is."');
                    await this.io.sln();
                    await this.io.lln('`0"This information was not easily come by, and I am going to have to charge two `%Gems`0 for it.  Now you know why this tavern is REALLY here."');
                    await this.io.lln("");
                    if (this.player.gem < 2) {
                        await this.io.lln("`2Not having two `%Gems`2, you decline.");
                        await this.io.sln();
                    } else {
                        await this.io.lw("`2Pay Chance two `%Gems`2 for the info? [`0Pay 'Em`2] : ", 2);
                        this.io.emitPrompt('pay_gems_confirm', [
                            { key: 'Y', label: 'Pay' },
                            { key: 'N', label: 'No' },
                        ]);
                        ich = (await this.io.getkey()).toUpperCase();
                        // DIFF: Previously, 'N' was forced to 'Y', and anything except N or Y would be an effective "no"
                        if (ich !== "N") {
                            ich = "Y";
                        }
                        await this.io.sln(ich, 0);
                        await this.io.sln();
                        if (ich !== "Y") {
                            await this.io.lln('`0"No problem!  I know how it is these days."');
                            await this.io.sln();
                            if (this.rip) {
                                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                                await this.io.getkey();
                                await cmenu();
                            }
                        } else {
                            await this._showEnemyInfo(op);
                            if (this.rip) {
                                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                                await this.io.getkey();
                                await cmenu();
                            }
                        }
                    }
                }
            } else if (ich === "?") {
                await cmenu();
            }
            // DIFF: The 'S' key was not in here, but it was in the menu.
            else if (ich === "C" || ich === "S") {
                if (this.rip) await this.io.showRip("MEMORY");
                else {
                    await this.io.lln('`0"Tired of what you do?  I know how it is.  To figure out what you REALLY want to do in your life, think about your childhood."`2 ');
                    await this.io.sln();
                    await this.io.lln('`0"Remember.  You NEVER forget what you learn in ANY profession."`2');
                }
                this.player.clss = await this.player.chooseProfession(true);
                await this.io.sln();
                await cmenu();
            } else if (ich === "T") {
                await this.io.sln();
                await this.io.lln('`0"C`3o`4l`5o`6r`7s`8?`0"`2, Chance laughs, `0"They are easy."');
                await this.io.sln();
                await this.io.sln("`1 `2 `3 `4 `5 `6 `7 `8 `9 `0 `! `@ `# `$ `%");
                await this.io.lln("`1^^ `2^^ `3^^ `4^^ `5^^ `6^^ `7^^ `8^^ `9^^ `0^^ `!^^ `@^^ `#^^ `$^^ `%^^");
                await this.io.sln();
                await this.io.sln("`5Colors are `%FUN`5! would look like...");
                await this.io.sln();
                await this.io.lln("`5Colors are `%FUN`5!");
                await this.io.sln();
                await this.io.lln("`0\"Using that symbol and a number, you can make any color.  They don't work in mail, but try 'em talking to people or write it in the dirt.\"");
                await this.io.lln("`2", 0);
            } else if (ich === "P") {
                await this.io.lln('`0"Ok, enter your practice line."');
                await this.io.lw("`2Text `0: `%", 2);
                pl = cleanStr(await this.io.getstr({ len: 69 })) as unknown as number;
                await this.io.sln();
                await this.io.lln('`0"Here is what that would look like."');
                await this.io.lln("`2`%" + pl);
                await this.io.sln();
            } else {
                if (ich === "R") {
                    ch = "Q";
                }
            }
        } while (ch !== "Q");
    }

    private async _oldMan(): Promise<void> {
        let ich: string;
        let pl: number;
        let him: string;
        let op: LoadedPlayerRecord;
        let l: string;

        if (this.rip) await this.io.showRip("W1");
        else await this.io.showTxt("OLDMAN");
        do {
            await this.io.sln();
            await this.io.lw(" `2 Your command? (`0? `2for menu)  [`0R`2] : ");
            this.io.emitPrompt('oldman_menu', [
                { key: 'V', label: 'View info' },
                { key: 'E', label: 'Examine' },
                { key: '?', label: 'Menu' },
                { key: 'R', label: 'Return' },
            ]);
            ich = (await this.io.getkey()).toUpperCase();
            if ("V?E".indexOf(ich) === -1) {
                ich = "R";
            }
            await this.io.sln(ich, 0);
            await this.io.sln();
            switch (ich) {
                case "?":
                    if (this.rip) await this.io.showRip("W1");
                    else await this.io.showTxt("OLDMAN");
                    break;
                case "V":
                    if (this.rip) await this.io.showRip("W1");
                    await this.io.lln('`0"Who would you like to know more about?"`2');
                    pl = await this.player.findPlayer();
                    if (pl === -1) {
                        await this.io.sln();
                        await this.io.lln('`0"I don\'t know anyone with a name even close to that."`2');
                        await this.io.sln();
                        if (this.rip) {
                            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                            await this.io.getkey();
                            await this.io.showRip("W1");
                        }
                    } else if (pl === this.player.Record) {
                        await this.io.lln('`0"Why, Id hope you know what you\'ve said about yourself.."`2,');
                        await this.io.sln("the old man cackles.");
                        await this.io.lln("");
                        if (this.rip) {
                            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                            await this.io.getkey();
                            await this.io.showRip("W1");
                        }
                    } else {
                        const foundPlayer = this.player.playerGet(pl);
                        if (!foundPlayer) break;
                        op = foundPlayer;
                        him = op.sex === "M" ? "him" : "her";
                        await this.io.lln("`2The Old Man thinks for a minute..");
                        if (!op.has_des) {
                            await this.io.lln('`0"' + op.name + "?  I haven't heard anything about " + him + '."');
                        } else {
                            await this.io.lln('`0"' + op.name + '?  I know who that is. Last I heard.."');
                            await this.io.sln();
                            await this.io.lln("`2" + op.des1, 4);
                            await this.io.lln("`2" + op.des2, 4);
                        }
                    }
                    break;
                case "E":
                    await this.io.lln('`0"What do you want me to remember about you?"');
                    await this.io.lw(" `2-> `%");
                    l = cleanStr(await this.io.getstr({ len: 70 }));
                    if (l !== "") {
                        this.player.des1 = l;
                        this.player.des = true;
                        await this.io.lw(" `2-> `%");
                        l = cleanStr(await this.io.getstr({ len: 70 }));
                        this.player.des2 = l;
                        await this.io.sln();
                        await this.io.lln('`2"`0It has been noted..`2"');
                        this.player.put();
                    }
                    break;
            }
        } while (ich !== "R");
    }

    private _rankLays(): string {
        let i: number;
        const pl: LoadedPlayerRecord[] = [];
        const lines: string[] = [];

        this.player.allPlayers().forEach(function (op: LoadedPlayerRecord) {
            if (op.name !== "X" && op.laid > 0) {
                pl.push(op);
            }
        });
        pl.sort(function (a: LoadedPlayerRecord, b: LoadedPlayerRecord) {
            if (a.laid !== b.laid) {
                return b.laid - a.laid;
            }
            return b.cha - a.cha;
        });
        lines.push("");
        lines.push("");
        lines.push("                          `%The Old Man's Ranking");
        lines.push("");
        if (this.settings.clean_mode) {
            lines.push("  `0Name                             Evil Deeds             Player Kills");
        } else {
            lines.push("  `0Name                                Lays                Player Kills");
        }
        lines.push(this.io.divider(0, '`#'));
        for (i = 0; i < pl.length; i += 1) {
            lines.push(
                "  `0" +
                    spacePad(pl[i].name, 22) +
                    "            `%" +
                    format("%5d", pl[i].laid) +
                    "                      `4 " +
                    format("%6.6s", prettyInt(pl[i].pvp)),
            );
        }
        if (pl.length === 0) {
            lines.push("  `0Sad times indeed, no one has managed to make this list.");
        }
        return lines.join('\n');
    }
}

export { DarkhorseTavern };
export default DarkhorseTavern;
