/**
 * DeathKnightLevel - Forest sub-scene: Death Knight skill leveling for LORD.
 *
 * Warriors who encounter the Black Knights' castle can spend skill points
 * to advance their Death Knight abilities and receive stat bonuses.
 */
import { random } from '@lordts/util/Util';
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { UiMode } from '../../types';

class DeathKnightLevel {

    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private player: Player,
        private eventHeader: (param: boolean) => Promise<void>,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Death Knight encounter ────────────────────────────────────────

    async run(): Promise<void> {
        let ich: string;

        await this.eventHeader(true);
        await this.io.lln("While trekking through the forest, you come to the hidden castle of The Black Knights.  You are immediately greeted by a score of men in shiny black armour.");
        await this.io.sln();
        const title = this.player.sex === "F" ? "Lady" : "Lord";

        // skillw 40+ = fully mastered Death Knight; grant a free use instead of training
        if (this.player.skillw > 39) {
            await this.io.lln('`0"Well met ' + title + " `%" + this.player.name + '`0!  A fellow Black Knight is Always welcome here."`2  You walk the grounds, and eat with your comrades.  You are fully refreshed.');
            await this.io.lln("");
            if (this.player.hp < this.player.hp_max) {
                this.player.hp = this.player.hp_max;
            }
            this.player.levelw += 1;
            await this.io.lln("`%HIT POINTS FILLED AND YOU RECEIVE THE ENERGY FOR 1 DEATH KNIGHT ATTACK!");
            await this.io.sln();
            await this.io.more();
            return;
        }
        if (this.player.skillw < 20) {
            await this.io.lln('`0"Well met ' + title + " `%" + this.player.name + '`0!  We have been expecting you.  We know you aspire to join us, and become a Death Knight.  We will teach you a lesson today, but only if you pass a test of our device."', 1);
        } else {
            await this.io.lln('`0"Greetings ' + title + " `%" + this.player.name + '`0!  What are you doing around here?! Even tho you are already a member, now is a great time to practice your skills.  To become an even better warrior.  You know the routine..."', 1);
        }

        await this.io.sln();
        this.io.foreground(2);
        await this.io.sln("THEY LEAD YOU TO THE DEATH KNIGHT DUNGEON.");
        await this.io.sln();
        await this.io.moreNoMail();
        this.io.foreground(15);
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        if (this.rip) await this.io.showRip("DKSKILL1");
        await this.io.sln("** THE TEST **", 28);
        await this.io.sln();
        await this.io.lln("`2You ignore the shrieks of pain, the suffering of this dungeon's occupants.");
        await this.io.sln("You are shown a man kneeling over a stained chopping block.");
        await this.io.sln();
        await this.io.lln('`0"This man is accused of a crime.  Is he innocent or guilty?"');
        if (!this.rip) {
            await this.io.sln();
            await this.io.lln("`2(`01`2) Decapitate Him");
            await this.io.lln("(`02`2) Release Him");
            await this.io.sln();
        }
        ich = await this.io.commandPrompt('death_knight_choice', [
            { key: '1', label: 'Decapitate Him' },
            { key: '2', label: 'Release Him' },
        ], false);
        if (ich !== "2") {
            ich = "1";
        }
        await this.io.sln(ich, 0);
        await this.io.sln();
        const guilty = !!(random(2) === 1);
        await this.io.sln();
        if (ich === "1") {
            if (this.rip) await this.io.showRip("DKSKILL2");
            await this.io.lln("`2You take the axe and bring it down as hard as you can.  After a sickening (but satisfying) crunch the deed is done.");
            await this.io.sln();
        } else {
            await this.io.lln('`%"That man is innocent!  You shall not harm a hair on his head, as long as I have a breath in me to fight!" `2 you shout dramatically.');
        }
        await this.io.lw('`0"You have chosen.', 2);
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        this.io.sw(".");
        await this.io.mswait(500);
        if (guilty) {
            if (ich === "1") {
                await this.io.lln('`%WISELY!`0" "You have done this country justice today."', 1);
                this.io.foreground(2);
                await this.io.sln();
                await this.io.more();
                await this.io.lln("");
                await this.player.raiseClass();
            } else {
                await this.io.lln('`4POORLY`0." "That man raped 6 women.  And you defend him?  Good God man!', 1);
                await this.io.sln();
                await this.io.more();
                await this.io.sln();
                return;
            }
        } else {
            if (ich === "1") {
                await this.io.lln('`4POORLY`0." "This man did no crime.  He was the father of 6 children.  "Was" being the key word here.  Perhaps another time."', 1);
                this.io.foreground(2);
                await this.io.sln();
                // Cross-event: players who befriended Olivia show empathy, earning +1 charm
                if (this.player.olivia_count > 7) {
                    this.io.foreground(2);
                    await this.io.sln("Thinking of Olivia, you pick up the severed head and check it for life.");
                    await this.io.sln();
                    this.io.foreground(15);
                    await this.io.sln("IT'S DEAD, BUT YOUR KINDNESS MAKES YOU BEAUTIFUL. (1 CHARM ADDED)");
                    await this.io.sln();
                    this.player.cha += 1;
                }
                await this.io.more();
                await this.io.sln();
                return;
            }
            await this.io.lln('`%WISELY!`0" "You speak eloquently.  Your words do not fall upon deaf ears. We believe you.  You are wise today."', 1);
            await this.io.sln();
            await this.io.more();
            await this.io.sln();
            await this.player.raiseClass();
        }
    }
}

export { DeathKnightLevel };
export default DeathKnightLevel;
