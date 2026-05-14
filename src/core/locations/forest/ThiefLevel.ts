/**
 * ThiefLevel - Forest sub-scene: Thief Skills leveling event for LORD.
 *
 * Thieves who encounter the Master Thieves' guild in the forest can spend
 * skill points to advance their sneaking abilities and gain extra skill uses.
 */
import type IO from '../../io/IO';
import type Player from '../../Player';
import type { UiMode } from '../../types';

class ThiefLevel {

    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private player: Player,
        private eventHeader: (showTitle: boolean) => Promise<void>,
    ) {}

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    // ── Thief encounter ─────────────────────────────────────────────────

    async run(): Promise<void> {
        let ich: string;

        if (this.rip) await this.io.showRip("TSKILLS1");
        await this.eventHeader(false);

        // skillt 40+ = fully mastered Thief; grant a bonus use instead of training
        if (this.player.skillt > 39) {
            await this.io.lln("`1`2You are carefully moving through the forest, making absolutely no noise when your sensitive ears pick up a twig breaking.  You circle around towards the noise, and find it's not an animal, but The Master Thieves!");
            await this.io.sln();
            await this.io.lln('As they pass under a tree you are in, you call out. `0"Ahh... Master Thieves!  Do you think it would be possible to make even MORE noise?!"`2');
            await this.io.sln();
            await this.io.lln("The group is very embarrassed, but they overcome it to chew the fat with you.");
            await this.io.sln();
            await this.io.lln("`%EXTRA THIEVING USE FOR TODAY!");
            await this.io.lln("");
            this.player.levelt += 1;
            await this.io.more();
            return;
        }

        await this.io.lln("`2You are innocently skipping through the forest, when you suddenly notice you are surrounded by a group of rogues!");
        await this.io.sln();

        if (this.player.skillt < 20) {
            await this.io.lln('`0"Greetings, `%' + this.player.name + "`0.  We are members of the Master Thieves Guild.  We know you are struggling to learn our ways.  We will give you a lesson, for the price of one Gem.\"", 1);
        } else {
            await this.io.lln('`0"Greetings, `%' + this.player.name + '`0.  We are proud that you have mastered the skills.  But, we will continue to teach you anyway..For the usual price!" `2The scarred man laughs gleefully.', 1);
        }

        while (true) {
            await this.io.sln();
            if (!this.rip) {
                await this.io.lln("`2(`0G`2)ive Them A Hard Earned Gem");
                await this.io.lln("`2(`0S`2)pit In Their Faces");
                await this.io.lln("`2(`0M`2)umble Apologies And Run");
                await this.io.sln();
            }
            ich = await this.io.commandPrompt('thief_choice', [
                { key: 'G', label: 'Give Them A Gem' },
                { key: 'S', label: 'Spit In Their Faces' },
                { key: 'M', label: 'Mumble Apologies And Run' },
            ], true);
            if (ich === "M") {
                await this.io.sln();
                await this.io.lln('`0"You are nothing but a coward!  We will never let you join us!"');
                await this.io.sln();
                await this.io.more();
                return;
            }
            if (ich === "S") {
                await this.io.sln();
                await this.io.lln("`2You hawk a good sized piece of phlegm into the leader's face.");
                await this.io.sln();
                await this.io.moreNoMail();
                if (this.player.sex === "F") {
                    await this.io.lln('`0"You have spirit girl!  Maybe next time!"`2');
                } else {
                    await this.io.lln('`0"You have spirit boy!  Maybe next time!"`2');
                }
                await this.io.sln("The man laughs.");
                await this.io.sln();
                await this.io.moreNoMail();
                return;
            }
            if (ich === "G") {
                if (this.player.gem < 1) {
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.lln("`2You fumble through your pockets and find you don't posses a Gem.  You don't think it would be wise to try to pull one over on the Master Thieves' Guild.  You have a reputation to worry about!");
                    await this.io.sln();
                    await this.io.moreNoMail();
                } else {
                    this.player.gem -= 1;
                    await this.io.sln();
                    await this.io.sln("You nonchalantly flip them a sparkling Gem.  The Thieves look impressed.");
                    await this.io.sln();
                    await this.io.lln('`0"Nice rock.  Alright...True to our word, we will instruct you."`2');
                    await this.io.sln();
                    await this.io.more();
                    await this.player.raiseClass();
                    return;
                }
            }
        }
    }
}

export default ThiefLevel;
