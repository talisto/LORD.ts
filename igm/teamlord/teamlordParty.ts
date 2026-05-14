/**
 * TeamLord v2.0 - Party Module
 * Ported from PARTYU.PAS
 */
import { random, prettyInt } from '@lordts/util/Util';
import { pressAKey } from './teamlordDefs';
import type { TeamLordContext } from './teamlordDefs';

class TeamLordParty {
    private ctx: TeamLordContext;

    constructor(ctx: TeamLordContext) {
        this.ctx = ctx;
    }

    async party(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        let ch: string;

        while (true) {
            io.sclrscr();
            await io.lln('');
            await io.lln('');
            await io.lln('`%Team Options - `2 Partying!');
            await io.lln('`0`L');
            await io.lln('`2Even in these medieval times, there\'s still a lust for getting wasted and having some good, old-fashioned fun!');
            await io.lln('');
            await io.lln('(`5H`2)ead for the Inn');
            const genderLabel = player.sex === 'M' ? 'Gal' : 'Guy';
            await io.lln('(`5G`2)rab a ' + genderLabel);
            await io.lln('(`5T`2)hrow a Party! (Your Place)');
            await io.lln('(`5S`2)leep!');
            await io.lln('');
            await io.lw('`2  Your command, `0' + player.name + '`2?`% ');

            io.emitPrompt('teamlord_party', [
                { key: 'H', label: 'Head for Inn' },
                { key: 'G', label: 'Grab a ' + genderLabel },
                { key: 'T', label: 'Party at Your Place' },
                { key: 'S', label: 'Sleep' },
            ]);
            do {
                ch = (await io.getkey()).toUpperCase();
            } while ('HGTS'.indexOf(ch) === -1);
            await io.lln(ch);

            // `partied` is TeamLord's daily party-point pool. It starts at
            // 100 + 5*level and each activity spends 5 points until only sleep
            // remains available.
            if (igmPlay.partied < 100 && ch !== 'S') {
                await io.lln('');
                await io.lln('`2  You\'ve had enough for today!');
                await pressAKey(io);
                return;
            }

            switch (ch) {
                case 'H': await this.headForInn(); break;
                case 'G': await this.grab(); break;
                case 'T': await this.tparty(); break;
                case 'S': return;
            }

            if (!igmPlay.onteam) return;
        }
    }

    private async headForInn(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        // Every party action burns one 5-point chunk from the daily pool.
        igmPlay.partied -= 5;
        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Team Options - `2 Partying In the Inn!');
        await io.lln('`0`L');

        let yo: number;

        switch (random(6)) {
            case 0:
                await io.lln('`2You enter the inn, and plop down on a bar stool. You drink far into the night, and awake in a pile of your own bodily fluids.');
                await io.lln('');
                yo = Math.floor(player.str / 20);
                if (yo < 1) yo = 1;
                player.str -= yo;
                player.put();
                await io.lln('You weaken by `%' + prettyInt(yo) + ' `2strength.');
                await pressAKey(io);
                break;
            case 1:
                await this._innDrinkingContest();
                break;
            case 2:
                await this._innBarFight();
                break;
            case 3:
                await io.lln('`2You get wildy drunk at the bar, and try to proposition the coat rack for a "hot night".  Turgon gets involved later, when you try to take the coat rack up on its offer.  After getting a minor fine, you sell your story to the Realm Times');
                yo = Math.floor((player.gold + player.bank) / 5);
                if (yo < 1) yo = 1;
                player.gold += yo;
                player.put();
                await io.lln('for `%' + prettyInt(yo) + ' gold!');
                await io.lln('');
                await pressAKey(io);
                break;
            case 4:
                await io.lln('`2After a few tall ones, you hear someone call your name in the distance.  Turning around sharply, you collide with a wealthy lawyer. To avoid a court confronation, you slip him enough for another 5 rounds - ');
                yo = Math.floor(player.bank / 10);
                if (yo < 1) yo = 1;
                player.bank -= yo;
                player.put();
                await io.lln('`%' + prettyInt(yo) + ' gold!');
                await io.lln('');
                await pressAKey(io);
                break;
            case 5:
                await io.lln('`2You get Seth wildly drunk, and get him to confess his stories concerning his "fling" with a young barmaid during his first marriage. Later, you tell everyone in town his tale.  When Seth learns of this, he rearranges certain body parts of yours.  The healer\'s charge is huge!');
                yo = Math.floor(player.bank / 3);
                if (yo < 1) yo = 1;
                player.bank -= yo;
                player.put();
                await io.lln('Pay `%' + prettyInt(yo) + ' gold!');
                await io.lln('');
                await pressAKey(io);
                break;
        }
    }

    private async grab(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        igmPlay.partied -= 5;
        io.sclrscr();
        const genderLabel = player.sex === 'M' ? 'Gal' : 'Guy';
        await io.lln('');
        await io.lln('');
        await io.lln('`%Team Options - `2 Grab a ' + genderLabel + '!');
        await io.lln('`0`L');
        await io.lln('`2You hit the inn, looking for a hot date!');
        await io.lw('After some time');

        await io.lw('.');
        await io.lw('.');
        await io.lw('.');

        switch (random(3)) {
            case 0:
                await io.lln('`%Success!');
                await io.lln('`2You both have a wonderful night, and promise to meet again, which you don\'t do.  You receive `#' + prettyInt(player.level) + ' `2charm!');
                player.cha += player.level;
                player.put();
                await io.lln('');
                await pressAKey(io);
                break;
            case 1:
                await this._grabFined();
                break;
            case 2:
                await io.lln('  `4failure`2...');
                await io.lln('');
                await io.lln('`2Better luck next time!');
                await io.lln('');
                await pressAKey(io);
                break;
        }
    }

    private async _innDrinkingContest(): Promise<void> {
        const { io, player } = this.ctx;
        await io.lln('`2You enter the inn, and plop down on a bar stool. You engage in a drinking contest with an extremely obese bearded man.  However, the Bartender wants you to win, so he passes you water instead.  After 43 shots of vodka (water for you), the man passes out onto the floor.');
        await io.lln('');
        let yo = Math.floor((player.gold + player.bank) / 10);
        if (yo < 1) yo = 1;
        if (player.gold > 2000000000 - yo) {
            player.gold = 2000000000;
        } else {
            player.gold += yo;
        }
        player.put();
        await io.lln('You lift `%' + prettyInt(yo) + ' `2gold from the man\'s pocket, and leave in a hurry for the restroom.');
        await pressAKey(io);
    }

    private async _innBarFight(): Promise<void> {
        const { io, player } = this.ctx;
        await io.lln('`2You enter the inn, and feel in a rowdy mood. You pick up a wooden chair, and bash it over Seth Able\'s head!  You also cause some serious damage to the premises before Turgon gets to the Inn and knocks you out.  When you come to, you are given a bill for damages.');
        await io.lln('');
        let yo = Math.floor((player.gold + player.bank) / 10);
        if (yo < 1) yo = 1;
        if (yo > player.gold) {
            yo -= player.gold;
            player.gold = 0;
            if (yo > player.bank) {
                player.bank = 0;
            } else {
                player.bank -= yo;
            }
        } else {
            player.gold -= yo;
        }
        player.put();
        await io.lln('`2You pay `%' + prettyInt(yo) + ' `2gold in damages.');
        await pressAKey(io);
    }

    private async _grabFined(): Promise<void> {
        const { io, player } = this.ctx;
        const pronoun = player.sex === 'M' ? 'her' : 'him';
        await io.lln('`%Success!');
        await io.lln('`2However, after the first 10 minutes with ' + pronoun + ', you become homicidal.  The police arrive soon after, and fine you');
        let yo = player.level * 100;
        await io.lln('`$' + prettyInt(yo) + ' `2for disturbing the peace.');

        if (yo > player.gold) {
            yo -= player.gold;
            player.gold = 0;
            if (yo > player.bank) {
                player.bank = 0;
            } else {
                player.bank -= yo;
            }
        } else {
            player.gold -= yo;
        }

        player.put();
        await io.lln('');
        await pressAKey(io);
    }

    private async tparty(): Promise<void> {
        const { io, player } = this.ctx;
        const igmPlay = this.ctx.igmPlay;

        igmPlay.partied -= 5;
        io.sclrscr();
        await io.lln('');
        await io.lln('');
        await io.lln('`%Team Options - `2 Party at Your Place!');
        await io.lln('`0`L');
        // Attendance drives the whole payout curve: below 35 guests the party
        // loses money, above 35 it earns level-scaled profit.
        const yo = random(75);
        await io.lln('`2You post messages all over the realm, advertising the big bash at your place!  However, you are secretly drugging the punch, so you can rob your patrons when they are "out cold".');
        await io.lln('');
        await io.lln('Finally, the time comes, and `0' + prettyInt(yo) + ' `2people show up!');
        await io.lln('');
        if (yo - 35 < 0) {
            await io.lln('However, even the money you rip off these bums is not enough to pay for the costs of the party!  You lose quite a large sum of money!');
            player.bank -= Math.floor(player.bank / 2);
            player.gold -= Math.floor(player.gold / 2);
        } else if (yo - 35 === 0) {
            await io.lln('However, the amount of money you steal from your guests is just enough to cover your operating charges!');
        } else {
            let goldEarned = (yo - 35) * 100 * player.level;

            if (player.gold > 2000000000 - goldEarned) {
                goldEarned = 2000000000 - player.gold;
                player.gold = 2000000000;
            } else {
                player.gold += goldEarned;
            }

            await io.lln('`2Wow!  What a crowd!  You take in `%' + prettyInt(goldEarned) + ' `2gold!');
        }
        player.put();
        await io.lln('');
        await pressAKey(io);
    }
}

export { TeamLordParty };
