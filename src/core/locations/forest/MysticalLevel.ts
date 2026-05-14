/**
 * MysticalLevel - Forest sub-scene: Mystical Skills leveling event for LORD.
 *
 * Magic-users who stumble upon the Wizard's hut can spend skill points to
 * advance their mystical abilities through a number-guessing challenge.
 */
import { random } from '@lordts/util/Util';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { UiMode } from '../../types';

class MysticalLevel {

    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private player: Player,
        private eventHeader: (arg: boolean) => Promise<void>,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Mystical encounter ─────────────────────────────────────────────

    async run(): Promise<void> {
        let ich: string;
        let guesses: number = 0;
        let guess: number = 0;

        if (this.rip) await this.io.showRip("WIZHOME");
        await this.eventHeader(false);
        this.io.foreground(2);
        await this.io.sln("While trekking through the forest, you come upon a small hut.");
        await this.io.sln();
        if (!this.rip) {
            await this.io.lln("`2(`0K`2)nock On The Door");
            await this.io.lln("(`0B`2)ang On The Door");
            await this.io.lln("(`0L`2)eave It Be");
            await this.io.sln();
        }
        ich = await this.io.commandPrompt('mystical_door', [
            { key: 'K', label: 'Knock On The Door' },
            { key: 'B', label: 'Bang On The Door' },
            { key: 'L', label: 'Leave It Be' },
        ], false);
        if ("LB".indexOf(ich) === -1) {
            ich = "K";
        }
        await this.io.sln(ich, 0);
        if (ich === "L") {
            await this.io.sln("You walk away.  Who needs magical instruction anyway!");
            await this.io.sln();
            await this.io.more();
            return;
        }
        await this.io.sln();
        if (ich === "K") {
            await this.io.sln("You politely knock on the knotted wooden door.");
        }
        if (ich === "B") {
            await this.io.sln("You bang on the door as hard you can!");
        }
        await this.io.sln();
        // 25% chance the wizard isn't home, wasting the event roll
        if (random(4) === 1) {
            await this.io.sln("You wait a while but no one is home.  Maybe next time.");
            await this.io.sln();
            await this.io.more();
            return;
        }
        if (this.rip) await this.io.showRip("WIZARD");
        await this.io.lln("`2You are about to leave, when you hear a voice from above:");
        if (this.player.sex === "M") {
            await this.io.lln('`0"Watcha doin\' down there Sonny?!" `2 You look up and see a wizened old man.');
        } else {
            await this.io.lln('`0"Watcha doin\' down there Miss?!"  `2You look up and see a wizened old man.');
        }
        await this.io.sln();
        await this.io.lln("`0\"Tell ya what!  I'll give ya a mystical lesson if you can pass my test!\" `2the old man giggles.", 1);
        await this.io.sln();
        await this.io.more();
        await this.io.lln("`c`%** THE TEST **", 28);
        await this.io.sln();
        await this.io.lln("`0\"All right now!  I'm thinking of a number between 1 and 100.  I'll give ya six guesses.\"", 1);
        await this.io.sln();
        await this.io.lln("`2(The old man leans even farther out the window in anticipation)");
        await this.io.sln();
        const thenum = random(100) + 1;
        while (guesses < 6) {
            guesses += 1;
            await this.io.lw("`2Guess `0" + guesses + " `2: `%", 2);
            guess = parseInt(await this.io.getstr({ len: 3, integer: true }), 10);
            if (isNaN(guess)) {
                guess = 0;
            }
            if (guess > thenum) {
                await this.io.lln('`0"The number is lower than that!"');
            } else if (guess < thenum) {
                await this.io.lln('`0"The number is higher than that!"');
            } else if (guess === thenum) {
                await this.io.sln();
                await this.io.lln("`0\"That's right! That's the number I was thinking of!  You read my mind!\"");
                await this.io.lln("`2The old man nearly falls from his window in his excitement!");
                await this.io.lln("");
                await this.io.lln("`%** YOU HAVE PASSED THE TEST **", 25);
                await this.io.lln("");
                await this.io.moreNoMail();
                // Mastered mystics (40+) can't advance further; reward daily-use points instead
                if (this.player.skillm > 39) {
                    await this.io.sln();
                    await this.io.lln("The old man attempts to teach you something, but fails.  You know more than him.  The only thing he is able to give you is hope.");
                    await this.io.sln();
                    this.io.foreground(15);
                    await this.io.sln("YOU RECEIVE FOUR EXTRA MYSTICAL SKILLS USE POINTS!");
                    await this.io.sln();
                    this.player.levelm += 4;
                    await this.io.more();
                    return;
                }
                await this.player.raiseClass();
                return;
            }
        }

        if (guess !== thenum) {
            await this.io.sln();
            await this.io.lln('`2The old man drops his head and shakes it sadly.  You notice small dandruff flakes drifting down from the window. `0"No, no, NO!  The number was ' + thenum + '!  Geez!  I won\'t teach such an unpromising student!"');
            await this.io.sln();
            if (this.player.skillm > 19) {
                await this.io.lln('`0"I\'m already a Master anyway, old man," `2you retort coldy.');
                await this.io.sln();
            }
            await this.io.lln("`2He slams his window shut, and leaves you no recourse but to leave.");
            await this.io.sln();
            await this.io.more();
        }
    }
}

export default MysticalLevel;
