/**
 * Sandtiger's Bar v1.02 - Talk to Sandtiger
 * Interactive chat with Sandtiger: buy drinks, ask keywords, hear stories.
 * Ported line-for-line from SBARADD.PAS talksandtiger() and drinkcheck().
 */
import { prettyInt } from '@lordts/util/Util';
import type { SandBarContext } from './sandbarDefs';
import { pressAKey, spendBarCoins } from './sandbarDefs';

// Drink value sentinel: 250 means "leave the table"
const DRINK_EXIT = 250;

class SandBarTalk {
    private ctx: SandBarContext;
    private drink: number;

    constructor(ctx: SandBarContext) {
        this.ctx = ctx;
        this.drink = 0;
    }

    async talkToSandtiger(): Promise<void> {
        const { io, player } = this.ctx;

        io.sclrscr();
        await io.lln('`2You timidly approach Sandtiger, who is currently nursing a beer in the corner.  He takes one last gulp, and motions for you to take a seat.');
        await pressAKey(io);
        io.sclrscr();
        this.drink = 0;

        // Main conversation loop (Pascal uses repeat/until with goto baja)
        for (;;) {
            // Check if drink is empty - if so, buy one or leave
            this.drink = await this.drinkcheck();
            if (this.drink === DRINK_EXIT) return;

            await io.sln();
            await io.lln('`2Sandtiger nurses his drink, waiting for your next request.');
            await io.lw('`0] `5');
            io.emitPrompt('sandbar_talk', [], 'line');
            const tempstr = await io.getstr({ len: 80 });
            await io.sln();
            const upper = tempstr.toUpperCase();

            // Keyword matching - order and logic matches Pascal exactly.
            // Note: Pascal checks are sequential if/then (not else-if), but
            // each match either uses "goto baja" (continue loop) or falls through.
            // We replicate with continue after each match.

            if (upper.includes('HELP') || upper.includes('?')) {
                await io.sln();
                await io.lln('`2Well...  Most people like to ask about beautiful women.');
                await io.lln('`2Or how to cheat...');
                await io.lln('`2But most like to chat about the history of this place.');
                await pressAKey(io);
                // Pascal: HELP has no `goto baja` - falls through to subsequent
                // keyword checks and ultimately to "Sandtiger looks confused."
            }

            if (upper.includes('LORD') || upper.includes('LEGEND')) {
                await io.sln();
                await io.lln('`2That\'s an interesting concept.  But have you heard of New World?');
                await pressAKey(io);
                continue;
            }

            if (upper.includes('VIOL')) {
                await io.sln();
                await io.lln('`2Turgon\'s daughter is almost beautiful as Jennie Garth.');
                await pressAKey(io);
                continue;
            }

            if (upper.includes('DRAG')) {
                await io.sln();
                await io.lln('`2I don\'t think you could take him on...');
                await pressAKey(io);
                continue;
            }

            if (upper.includes('SETH')) {
                await io.sln();
                await io.lln('`2Seth Able?  The man with the angelic voice.');
                await pressAKey(io);
                continue;
            }

            if (upper.includes('GOD')) {
                await io.sln();
                await io.lln('`2Jennie Garth is a god.');
                await pressAKey(io);
                continue;
            }

            if (upper.includes('HELLO')) {
                await io.sln();
                await io.lln('`2Greetings, ' + player.name);
                await pressAKey(io);
                continue;
            }

            if (upper.includes('FUCK') || upper.includes('SHIT')) {
                await io.sln();
                await io.lln('`2Sandtiger stands up and strikes you down!  You lose two hit points!');
                if (player.hp_max > 2) player.hp_max -= 2;
                await pressAKey(io);
                continue;
            }

            if (upper.includes('JENN')) {
                if (await this._handleJennie()) return;
                continue;
            }

            if (upper.includes('WITCH')) {
                if (await this._handleWitch()) return;
                continue;
            }

            if (upper.includes('CHEAT') || upper.includes('TRICK')) {
                await io.sln();
                await io.lln('`0"`2What?  Me Cheat?  I can\'t even spell JENNIE right!`0"');
                await io.sln();
                continue;
            }

            if (upper.includes('HIST') || upper.includes('STOR')) {
                if (await this._handleStory()) return;
                continue;
            }

            // Exit keywords
            if (upper.includes('EXI') || upper.includes('BY') || upper.includes('QUIT')
                || upper.includes('L8R') || upper.includes('CYA') || upper.includes('SEEYA')) {
                return;
            }

            // No keyword matched
            await io.sln();
            await io.lln('`2Sandtiger looks confused.');
        }
    }

    // ─── Keyword Handlers ─────────────────────────────────────────────────────

    private async _handleJennie(): Promise<boolean> {
        const { io } = this.ctx;
        await io.sln();
        await io.lln('`0"`2So... You wanna know about Jennie Garth, eh, child?`0"');
        await io.sln();
        await io.lln('`2Sandtiger takes a monstrous gulp of the murky liquid.');
        this.consumeDrink(15);
        await io.sln();
        await io.lln('`2Well, she certainly is a BABE...');
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(15);
        await io.sln();
        await io.lln('`2And I guess you could call her SEXY... or FOXY...');
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(15);
        await io.sln();
        await io.lln('`2But don\'t call her UGLY or DUNG!');
        await pressAKey(io);
        return false;
    }

    private async _handleWitch(): Promise<boolean> {
        const { io } = this.ctx;
        // The Witch topic intentionally spans multiple drink refills.
        // Sandtiger only reveals the stronger curses after enough beer.
        await io.sln();
        await io.lln('`0"`2So... You wanna know about the Old Witch?`0"');
        await io.sln();
        await io.lln('`2Sandtiger takes a sip of the murky liquid.');
        this.consumeDrink(5);
        await io.sln();
        await io.lln('`2Hmmm... standard curses take a chunk off your defense.');
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(10);
        await pressAKey(io);
        await io.sln();
        await io.lln('`2And mind fries are strength takers-away.');
        await pressAKey(io);
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(15);
        await io.sln();
        await io.lln('`2But the dwarfing is both... but stronger than either one!');
        await pressAKey(io);
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(25);
        await io.sln();
        await io.lln('`2The Abandonment?  Huh?');
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(35);
        await io.sln();
        await io.lln('`2Let me think about this....');
        await pressAKey(io);
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(50);
        await io.sln();
        await io.lln('`2It just leaves you alone, I think... maybe another drink would help.');
        await pressAKey(io);
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        this.consumeDrink(76);
        await io.sln();
        await io.lln('`2Something about getting killed by higher levels...');
        await pressAKey(io);
        return false;
    }

    private async _handleStory(): Promise<boolean> {
        const { io } = this.ctx;
        await io.sln();
        await io.lln('`2I like stories too.  But first, a drink!');
        await pressAKey(io);
        this.drink = 0;
        this.drink = await this.drinkcheck();
        if (this.drink === DRINK_EXIT) return true;
        io.sclrscr();
        await io.lln('`2I know lots of stories!');
        await io.sln();
        await io.lln('     `0(`5H`0)`2alder\'s Story');
        await io.lln('     `0(`5T`0)`2he Barak Life');
        await io.lln('     `0(`5A`0)`2ragorn vs. Olodrin');
        await io.lln('     `0(`5C`0)`2hance\'s Exile');
        await io.sln();
        await io.lw('`2Pick a story, my child: ');
        io.emitPrompt('sandbar_story', [
            { key: 'H', label: "Halder's Story" },
            { key: 'T', label: 'The Barak Life' },
            { key: 'A', label: 'Aragorn vs. Olodrin' },
            { key: 'C', label: "Chance's Exile" },
        ]);
        const storyCh = (await io.getkey()).toUpperCase();

        switch (storyCh) {
            case 'H': await this.storyHalder(); break;
            case 'T': await this.storyBarak(); break;
            case 'A': await this.storyAragorn(); break;
            case 'C': await this.storyChance(); break;
        }
        return false;
    }

    // ─── Drink Management ────────────────────────────────────────────────────

    /**
     * Consume drink points. If drink < amount, set to 0; else subtract.
     * Matches Pascal: IF (DRINK < N) then drink := 0 else dec(drink,N);
     */
    private consumeDrink(amount: number): void {
        if (this.drink < amount) {
            this.drink = 0;
        } else {
            this.drink -= amount;
        }
    }

    /**
     * drinkcheck - if drink > 0, return as-is. Otherwise prompt to buy a drink.
     * Returns drink value or DRINK_EXIT (250) if player leaves.
     * Ported line-for-line from SBARADD.PAS drinkcheck().
     */
    private async drinkcheck(): Promise<number> {
        const { io } = this.ctx;

        if (this.drink > 0) {
            return this.drink;
        }

        // Once the current drink runs dry, the player must buy the next round
        // or leave the conversation entirely.
        await io.sln();
        await io.lln('`2Sandtiger looks sadly at his empty beer glass.');
        await io.sln();
        await io.lln('`2Now he\'s looking at you...  What will you do?');
        await io.sln();
        await io.lln('`0[`2B`0]`2uy the man another beer!');
        await io.lln('`0[`2S`0]`2tand up and leave the table.');
        io.emitPrompt('sandbar_buy_leave', [
            { key: 'B', label: 'Buy another beer' },
            { key: 'S', label: 'Leave the table' },
        ]);
        const ch = (await io.getkey()).toUpperCase();
        await io.sln();

        // Pascal: only checks for 'S', anything else is treated as 'B' (buy)
        if (ch === 'S') {
            return DRINK_EXIT;
        }

        // Buy a drink
        await io.sln();
        await io.lln('`2A good-looking waitress comes over to your table.');
        await io.lln('She takes one glance at Sandtiger, and then at you.');
        await io.lln('`0"`2Buying a drink for the boss?`0"');
        await io.sln();
        await io.lln('`2  We got...');
        await io.lln('                 `0(`#P`0)`2hlegm Nog `!- `2   3 `#BarCoins');
        await io.lln('                 `0(`#N`0)`2yte-Quill `!- `2  10 `#BarCoins');
        await io.lln('                 `0(`#S`0)`2ake       `!- `2  25 `#BarCoins');
        await io.lln('                 `0(`#R`0)`2ed Dawg   `!- `2  50 `#BarCoins');
        await io.lln('                 `0(`#H`0)`2urricane  `!- `2 100 `#BarCoins');
        await io.lln('                 `0(`#E`0)`2verClear  `!- `21000 `#BarCoins');
        await io.sln();
        await io.lln('`2Or if you wish to leave the boss `#[`0A`#]`2lone, I understand.');
        await io.sln();
        await io.lln(`\`2You have \`%${prettyInt(this.ctx.barcoins)}\`2 BarCoins.`);
        io.emitPrompt('sandbar_drink', [
            { key: 'P', label: 'Phlegm Nog (3)' },
            { key: 'N', label: 'Nyte-Quill (10)' },
            { key: 'S', label: 'Sake (25)' },
            { key: 'R', label: 'Red Dawg (50)' },
            { key: 'H', label: 'Hurricane (100)' },
            { key: 'E', label: 'EverClear (1000)' },
            { key: 'A', label: 'Leave him alone' },
        ]);
        const drinkCh = (await io.getkey()).toUpperCase();

        let cost: number;
        let drinkValue: number;
        switch (drinkCh) {
            case 'P': cost = 3;    drinkValue = 5;  break;
            case 'N': cost = 10;   drinkValue = 11; break;
            case 'S': cost = 25;   drinkValue = 15; break;
            case 'R': cost = 50;   drinkValue = 29; break;
            case 'H': cost = 100;  drinkValue = 49; break;
            // NOTE: Original Pascal checks barcash < 100 but charges 1000.
            // This is a bug in the original - we preserve it exactly.
            case 'E': cost = 1000; drinkValue = 79; break;
            case 'A': return DRINK_EXIT;
            // Pascal: invalid key falls through CASE with no assignment;
            // function returns undefined (effectively 0 = drink stays empty).
            default: return 0;
        }

        // EverClear affordability check uses 100 in the original (bug), not 1000
        const affordCheck = drinkCh === 'E' ? 100 : cost;
        if (this.ctx.barcoins < affordCheck) {
            await io.lln('`2You can\'t afford to pay this!');
            await pressAKey(io);
            return DRINK_EXIT;
        }

        spendBarCoins(this.ctx, cost);
        this.drink = drinkValue;
        await pressAKey(io);
        return this.drink;
    }

    // ─── Stories ─────────────────────────────────────────────────────────────

    private async storyHalder(): Promise<void> {
        const { io } = this.ctx;
        io.sclrscr();
        await io.lln('`2   Halder was born in Devonshire.  His parents were both quite wealthy, and gave him everything he ever needed.');
        await io.lln('However, this is not the way to raise a budding young warrior, and Halder was spoiled rotten.  He began to visit the nightclubs daily, not do his work, and got very lazy.');
        await io.sln();
        await io.lln('   Indeed, his parents got quite worried about him.  His younger sister, Yundra, wandered off one day into the woods -- near the dragon\'s den.  Halder was sent off in search her, and when he returned, he said he had searched the cave and found nothing inside it.');
        await io.sln();
        await io.lln('   However, Halder was lying.  He had, in fact, gone back to the Fox\'s Den bar immediately after setting off.  And thus caused the death of his poor sister.');
        await pressAKey(io);
        await io.sln();
        await io.lln('   Turgon found out about this incident, and became enraged that a warrior under his training had done such a thing.');
        await io.lln('The first moment Turgon got, he found Halder, and backed him into a corner, a Death Sword at his neck.  As Turgon was to make the killing blow, Barak, then the level one master, came up to them.');
        await io.sln();
        await io.lln('   `0"`2Whatcha doin\'?`0" `2he asked, innocently snapping the sassafras gum in his mouth.');
        await io.sln();
        await io.lln('   Turgon turned to him, and then back to Halder.');
        await io.sln();
        await io.lln('   `%"`2No,`%" `2he said, `%"`2I will not kill you.  Instead, you will be ranked underneath Barak, and must take orders from him.`%"');
        await io.sln();
        await io.lln('   `2And that is why Halder, the rich child, cannot kill or or hurt the gentle Barak.');
        await pressAKey(io);
    }

    private async storyBarak(): Promise<void> {
        const { io } = this.ctx;
        io.sclrscr();
        await io.lln('   `2My child, you seem interested in Barak.  Well, everyone is, but we really know little about him.  Perhaps some of the sages in another town might know.  But no one really knows where he comes from.  And we\'re not quite sure if he does, either.');
        await pressAKey(io);
    }

    private async storyAragorn(): Promise<void> {
        const { io } = this.ctx;
        io.sclrscr();
        await io.lln('   `0It all really started on a warm summer day.  But it\'s been very cold ever since.');
        await io.sln();
        await io.lln('   `2It was the big day at school.  Aragorn\'s girlfriend, Tybet, had taken up with Olodrin.  And Aragorn had challenged the thief to a fight.  It was time.');
        await io.sln();
        await io.lln('   Aragorn circled \'round his opponent as Olodrin followed with his eyes.  The first punch was thrown, and Aragorn\'s fist met Olodrin\'s forehead.  Olodrin tried to throw a haymaker, but was stopped in mid-stride by Aragorn, who kicked him in the stomach.  With an "OOF!", Olodrin stumbled backward.  Aragorn followed with a swift kick to the head and Olodrin crumpled to the ground.  Aragorn knelt down next to him, and slowly withdrew his dagger, a present of his father\'s.');
        await io.sln();
        await io.lln('   But before Aragorn could slice, a great THUD! was heard.');
        await io.lln('A scream in unison, `@THE DRAGON`0!!!`2 was next.  Aragorn started heading in the direction of the crowd, but Olodrin was oblivious.  Tybet tripped and fell on her way down the hill to outrun the Dragon.`0"');
        await pressAKey(io);
        await io.sln();
        await io.lln('   Aragorn saw her crumpled body, and ran back to go get her, but as he reached her body, the Dragon was upon them.  ');
        await pressAKey(io);
        await io.sln();
        await io.lln('   Suddenly, the oddest sound came from the Dragon\'s fire-breathing mouth.  A...  cry of pain?  It did an about-face, and tore back towards its cave, blood dripping from its tail.');
        await io.sln();
        await io.lln('   Olodrin slumped back onto the grass.  The dagger that was meant to end his life had saved the life of his would-be murderer.  ');
        await io.sln();
        await io.lln('   `0"`2Damn, that thing can sure run with half its tail draggin\' on the ground behind it.`0" `2he said weakly.');
        await io.sln();
        await io.lln('   `2Aragorn just sat down next to him, and held out his hand.');
        await io.lln('Olodrin placed his in Aragorn\'s.');
        await pressAKey(io);
        await io.sln();
        await io.sln();
        await io.lln('   `0Now, of course, they\'re both grown up, but they\'re as close as that, still.  Oh, and Tybet?  She\'s married to Prince Caspian now.  But that\'s another story.');
        await pressAKey(io);
    }

    private async storyChance(): Promise<void> {
        const { io } = this.ctx;
        io.sclrscr();
        await io.lln('   `2Chance.  Now there\'s a fine man.  And an even finer daughter, if I do say so myself.  But his story is sad, it makes one wonder how he can stay so happy.');
        await io.sln();
        await io.lln('   It dates back to the time of Replogle, the former leader -- or rather, level 12 leader -- of the realm.  Before he got eaten by the Dragon, that is.');
        await io.sln();
        await io.lln('   You see, Replogle had two sons, Jeffrey and Chance.  Both studied to be warriors.  But Jeffrey, oh, Jeffrey was a ladies\' man, and he loved the women.  He also began a small gambling group in his father\'s temple every Sunday.  And when Replogle heard of this, he kicked his son out of the house.  And his son ended up on the Innkeeper\'s door.');
        await pressAKey(io);
        await io.sln();
        await io.lln('   Chance, being the good son, forgot about his scandalous brother, and worked his way to being an excellent fighter, and reached level nine in no time at all.');
        await io.sln();
        await io.lln('   Meanwhile, Jeffrey worked for the Innkeeper, and decided that what needed to be added to the Inn was a bar.  And since his father, the most honorable warrior in all the land, did not come to the Inn, he felt he would be safe running it.  And the bar flourished.  The Innkeeper earned more money than he would ever need, and in this manner, he helped his son, a young man called Turgon, through warrior training.  Now Turgon was the best fighter the realm had ever seen, better than Replogle.  And Replogle knew he had to prove his worth -- by going after the dragon.');
        await io.sln();
        await io.lln('   And he did... and so he perished.');
        await pressAKey(io);
        await io.sln();
        await io.lln('   Now Turgon owed a lot to Jeffrey, now called The Bartender, for helping him become the youngest level 12 warrior ever, and the youngest master ever.  So he granted Jeffrey one wish.  And Jeffrey, who\'s hate for his brother was ever so strong, ordered Chance banned from the realm.');
        await io.sln();
        await io.lln('   Chance, with no other choice, packed up for the forest.  And even though he lived on berries and twigs for 3 years, he eventually came upon a wide clearing -- invisible from all angles, but something a horse might find quite easily.  And he began building, with whole trees, and using sap for cement.  But it has worked, and even though he cannot offer the same delicacies as Jeffrey\'s place, Chance has a nice bar.... and a nice daughter!');
        await pressAKey(io);
    }
}

export { SandBarTalk };
