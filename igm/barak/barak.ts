/**
 * Barak's House - IGM for LORD
 * Ported from Javascript source code
 */
import * as path from 'path';
import { random, prettyInt } from '@lordts/util/Util';
import type { IStorage } from '@lordts/storage/IStorage';
import type FileUtils from '@lordts/util/FileUtils';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type IO from '@lordts/core/io/IO';
import type State from '@lordts/core/State';

interface RecordDef {
    prop: string;
    type: string;
    def: unknown;
}

interface BarakRecord {
    day: number;
    canPlay: boolean[];
    put(): void;
}

interface PlayerRecord {
    Record: number;
    name: string;
    sex: string;
    gold: number;
    gem: number;
    hp: number;
    hp_max: number;
    cha: number;
    str: number;
    exp: number;
    level: number;
    clss: number;
    forest_fights: number;
    high_spirits: boolean;
    weapon: string;
    skillw: number;
    skillm: number;
    skillt: number;
    put(): void;
}

const Barak_Defs: RecordDef[] = [
    {
        prop: 'day',
        type: 'SignedInteger',
        def: -1
    },
    {
        prop: 'canPlay',
        type: 'Array:150:Boolean',
        def: (function(): boolean[] { const aret: boolean[] = []; while (aret.length < 150) aret.push(true); return aret; })()
    }
];

class Barak {
    private io: IO;
    private fileUtils: FileUtils;
    private morechk: boolean;
    private player: PlayerRecord;
    private state: State;
    private igmDir: string;
    private storage: IStorage;
    private _x1: number = 0;
    private _y1: number = 0;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.fileUtils = deps.fileUtils;
        this.morechk = deps.morechk;
        this.player = deps.player;
        this.state = deps.state;
        this.igmDir = path.join(deps.runtimeDir, 'barak') + path.sep;
        this.storage = deps.storage;
    }

    static get desc(): string { return '`0T`2ravel `0T`2o `0B`2arak\'s `0H`2ouse`2'; }

    /** Server-side daily maintenance hook: reset all "can play today" flags. */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDir = path.join(deps.runtimeDir, 'barak') + path.sep;
        const bs = deps.storage.create(igmDir + 'barak.dat', Barak_Defs);
        if (bs.length < 1) return;
        const b = bs.get(0) as unknown as BarakRecord;
        if (b.day !== deps.state.days) {
            for (let i = 0; i < b.canPlay.length; i++) {
                b.canPlay[i] = true;
            }
            b.day = deps.state.days;
            b.put();
        }
    }

    async run(): Promise<void> {
        await this.main();
    }

    private async catchup(): Promise<void> {
        while (await this.io.waitkey(0)) {
            await this.io.getkey();
        }
    }

    private async readDirection(): Promise<string> {
        // Route through io.getkey() so that web-session timeout tracking is respected.
        this.io.emitPrompt('barak_maze_direction', [
            { key: 'W', label: 'Up' }, { key: 'A', label: 'Left' },
            { key: 'S', label: 'Down' }, { key: 'D', label: 'Right' }, { key: 'Q', label: 'Quit' }
        ]);
        const ch: string = await this.io.getkey();

        // Accept keypad digits, WASD, and ANSI arrows, then collapse them into
        // the simple U/L/D/R tokens used by the original minigame loop.
        switch (ch) {
            case '8':
            case 'KEY_UP':
            case 'w':
            case 'W':
                return 'U';
            case '4':
            case 'KEY_LEFT':
            case 'a':
                return 'L';
            case '2':
            case 'KEY_DOWN':
            case 's':
            case 'S':
                return 'D';
            case '6':
            case 'KEY_RIGHT':
            case 'd':
            case 'D':
                return 'R';
            case 'q':
            case 'Q':
                return 'Q';
            case ' ':
                return ' ';
            case '\x1b': {
                // Consume ANSI/VT100 arrow-key escape sequence: ESC [ A/B/C/D
                // or SS3 form: ESC O A/B/C/D.  The bytes arrive in the same
                // TCP segment so they are already in the buffer.
                const bracket = await this.io.getkey();
                if (bracket === '[' || bracket === 'O') {
                    const code = await this.io.getkey();
                    switch (code) {
                        case 'A': return 'U'; // up arrow
                        case 'B': return 'D'; // down arrow
                        case 'C': return 'R'; // right arrow
                        case 'D': return 'L'; // left arrow
                    }
                }
                return '|';
            }
            default:
                return '|';
        }
    }

    private checkMove(x: number, y: number): boolean {
        // The maze is drawn inside a fixed rectangle in the ANSI art, so moves
        // are clipped against those literal screen coordinates.
        if (x > 57) {
            return false;
        }
        if (y > 21) {
            return false;
        }
        if (x < 16) {
            return false;
        }
        if (y < 4) {
            return false;
        }
        return true;
    }

    private async runGame(): Promise<void> {
        const oldGold: number = this.player.gold;
        let time: number = 30;
        let over: boolean = false;
        // Arena game: the player and Barak move inside the hard-coded house
        // playfield while ten gold piles are collected before the timer ends.
        let youX: number = random(41) + 16;
        let youY: number = random(17) + 4;
        let barX: number = random(41) + 16;
        let barY: number = random(17) + 4;
        let youOldX: number = youX;
        let youOldY: number = youY;
        let barOldX: number = barX;
        let barOldY: number = barY;
        let oldTime: number = (new Date()).valueOf() + 500;
        let j: number;
        const gold: Array<{ x: number; y: number }> = [];
        let tmp: { x: number; y: number };
        let stole: number = 0;
        let num: number;
        let ch: string;

        for (j = 0; j < 10; j++) {
            tmp = { x: random(41) + 16, y: random(17) + 4 };
            gold.push(tmp);
            this.io.gotoxy(tmp.x - 1, tmp.y - 1);
            await this.io.lw('`r6`%∞`r0');
        }
        this.io.gotoxy(youX - 1, youY - 1);
        await this.io.lw('`r6`%Ω`r0');
        this.io.gotoxy(barX - 1, barY - 1);
        await this.io.lw('`r6`%B`r0');
        this.io.gotoxy(1, 7);
        await this.io.lw('`0READY...');
        this.io.gotoxy(1, 8);
        await this.io.mswait(1000);
        await this.io.lw('`0SET...');
        await this.io.mswait(1000);
        await this.io.lw('`4GO!');
        await this.io.mswait(400);
        do {
            ch = await this.readDirection();
            if (ch === 'L') {
                if (this.checkMove(youX - 1, youY)) {
                    youX -= 1;
                }
            }
            else if (ch === 'R') {
                if (this.checkMove(youX + 1, youY)) {
                    youX += 1;
                }
            }
            else if (ch === 'U') {
                if (this.checkMove(youX, youY - 1)) {
                    youY -= 1;
                }
            }
            else if (ch === 'D') {
                if (this.checkMove(youX, youY + 1)) {
                    youY += 1;
                }
            }
            else if (ch === 'Q') {
                over = true;
            }
            if (youOldX != youX || youOldY != youY) {
                this.io.gotoxy(youX - 1, youY - 1);
                await this.io.lw('`r6`%Ω`r0');
                num = this._findGoldAtPosition(gold, youX, youY);
                if (num >= 0) {
                    gold[num].x = 0;
                    gold[num].y = 0;
                    this.player.gold += this.player.level * this.player.level * 100;
                    stole += 1;
                    this.io.gotoxy(0, 7);
                    await this.io.lw('`r0`0Gold: `%' + prettyInt(this.player.gold));
                    this.io.gotoxy(0, 8);
                    await this.io.lw('`0Time: `%' + prettyInt(time) + '  ');
                }
                this.io.gotoxy(youOldX - 1, youOldY - 1);
                await this.io.lw('`r6 `r0');
            }
            youOldX = youX;
            youOldY = youY;
            if ((new Date()).valueOf() > oldTime) {
                oldTime += 500;
                if (youX > barX && this.checkMove(barX + 1, barY)) {
                    barX += 1;
                }
                if (youX < barX && this.checkMove(barX - 1, barY)) {
                    barX -= 1;
                }
                if (youY > barY && this.checkMove(barX, barY + 1)) {
                    barY += 1;
                }
                if (youY < barY && this.checkMove(barX, barY - 1)) {
                    barY -= 1;
                }
                this.io.gotoxy(0, 7);
                await this.io.lw('`r0`0Gold: `%' + prettyInt(this.player.gold));
                this.io.gotoxy(0, 8);
                await this.io.lw('`0Time: `%' + prettyInt(time) + '  ');
                time--;
            }
            if (barOldX !== barX || barOldY !== barY) {
                this.io.gotoxy(barX - 1, barY - 1);
                await this.io.lw('`r6`%B`r0');
                this.io.gotoxy(barOldX - 1, barOldY - 1);
                num = this._findGoldAtPosition(gold, barOldX, barOldY);
                if (num >= 0) {
                    await this.io.lw('`r6∞`r0');
                }
                else {
                    await this.io.lw('`r6 `r0');
                }
            }
            barOldX = barX;
            barOldY = barY;
            if (barOldX === youX && barOldY === youY) {
                await this._handleBarakCatches(barX, barY, oldGold);
                return;
            }
            if (time < 0) {
                await this._handleGameVictory(youX, youY, oldGold, stole);
                return;
            }
        } while (!over);
    }

    private _findGoldAtPosition(gold: Array<{ x: number; y: number }>, x: number, y: number): number {
        for (let i = 0; i < gold.length; i++) {
            if (gold[i].x === x && gold[i].y === y) {
                return i;
            }
        }
        return -1;
    }

    private async _handleBarakCatches(barX: number, barY: number, oldGold: number): Promise<void> {
        this.io.gotoxy(barX - 4, barY - 1);
        await this.io.lw('`)Splat!');
        await this.io.mswait(1000);
        await this.io.lln('`r0`c  `%YOU ARE DEFEATED.', 0);
        await this.io.lln(this.io.divider(53, '`0'), 0);
        await this.io.lln('`2Barak laughs as warm blood flows down your cheek.');
        if (oldGold != this.player.gold) {
            await this.io.sln('He savagely takes back the gold you stole from him.');
        }
        this.player.gold = oldGold;
        await this.io.sln('Maybe next time?');
        await this.io.sln();
        await this.io.lln('`4YOU FEEL AWFULLY WEAK.');
        await this.io.sln();
        this.player.hp = 1;
        await this.catchup();
    }

    private async _handleGameVictory(youX: number, youY: number, oldGold: number, stole: number): Promise<void> {
        this.io.gotoxy(youX - 4, youY - 1);
        await this.io.lw('`0YAHOO!');
        await this.io.mswait(1000);
        await this.io.lln('`r0`c  `%YOU PUT BARAK TO SHAME!', 0);
        await this.io.lln(this.io.divider(53, '`0'), 0);
        await this.io.lln('`2Barak curses as you nimbly dance away from his knife.  Not only did you live, you also stole `0' + prettyInt(this.player.gold - oldGold) + '`2 from his house!');
        await this.io.sln();
        if (this.player.clss === 3) {
            if (stole === 10) {
                await this.io.lln('`%FOR FANTASTIC THIEVING, YOU GET AN EXTRA ' + prettyInt(200 * this.player.level * this.player.level));
                this.player.gold += 200 * this.player.level * this.player.level;
                await this.io.sln();
            }
        }
        await this.io.lln('`%YOU HEAD HOME, IN GOOD HUMOR.');
        await this.io.sln();
        await this.catchup();
    }

    private async _handleOfferToRead(): Promise<void> {
        const r = random(3) + 1;
        await this.io.lln('`0"You will?" `2Barak pitifully, wiping his nose.  `0"Will');
        await this.io.lln('you read this to me?"');
        await this.io.lln('');
        await this.io.lw('`2Barak shows you a book of.', 2);
        await this.waitDot();
        await this.waitDot();
        await this.waitDot();
        if (r === 1) {
            await this.io.lln('`%History`2.');
        }
        if (r === 2) {
            await this.io.lln('`%Newspaper Clippings`2.');
        }
        if (r === 3) {
            if (this.player.clss === 1) {
                await this.io.lln('`0Fighting`2.', 0);
            }
            if (this.player.clss === 2) {
                await this.io.lln('`#Magic Use`2.', 0);
            }
            if (this.player.clss === 3) {
                await this.io.lln('`1Dirty Deeds`2.', 0);
            }
        }
        await this.io.sln();
        await this.io.lln('`2You are non-plussed, but agree to read it.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`c`%Story time with Barak');
        await this.io.lln(this.io.divider(57, '`0'), 0);
        if (r === 1) {
            await this.history();
        }
        if (r === 2) {
            await this.newspaper();
        }
        if (r === 3) {
            await this.skill();
        }
        await this.io.sln();
        await this.io.lln('`2You put down the book.  `0"Please, ' + this.player.name + '`0!  Read more!"');
        await this.io.lln('`2Barak whines.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2You smile.  `%"Nah, I gotta go.  See you later."');
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async startFight(): Promise<void> {
        let i: number;
        const mc: boolean = this.morechk;

        this.morechk = false;
        await this.io.lln('`c`%HAVING FUN AT BARAK\'S', 22);
        await this.io.sln();
        for (i = 0; i < 18; i++) {
            await this.io.lln('`r0               `r6                                          `r0', 0);
        }
        await this.io.sln();
        await this.io.lln('`0(`2Use the keypad`0, `2arrow keys or `%Ctrl`0-`2S`0,`2E`0,`2D`0,`2X keys to run like hell!`0)', 4);
        await this.runGame();
        this.morechk = mc;
        await this.io.moreNoMail();
    }

    private async sugar(): Promise<void> {

        if (this.player.sex === 'M') {
            await this.io.lln('`0"You want sugar?!  Go give a few gems to `#Violet`0, she\'ll give you some sugar!  Har!"');
        }
        else {
            await this.io.lln('`0"You want sugar?!  Go give a few gems to `%Seth Able`0, he\'ll give you some sugar!  Har!"');
        }
        await this.io.sln();
        await this.io.lln('`2(`0Y`2)ou animal!  How dare you! Prepare to fight!');
        await this.io.lln('`2(`0L`2)augh loudly at Baraks lame humor.');
        await this.io.sln();
        await this.io.lw('`2Your choice?  [`0Y`2] :`%', 2);
        this.io.emitPrompt('barak_sugar_response', [{ key: 'Y', label: 'Fight' }, { key: 'L', label: 'Laugh' }]);
        const ch = (await this.io.getkey()).toUpperCase();
        await this.io.sln(ch, 0);
        await this.io.sln();
        if (ch === 'L') {
            await this.io.lln('`2You giggle uncontrollably.  Barak looks pleased as hell.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`0"You know kid?  You\'re ok.  Here is a little somethun for ya."');
            await this.io.sln();
            await this.io.lln('`%BARAK TOSSES YOU A GEM!');
            this.player.gem++;
            this.player.put();
            await this.io.sln();
            await this.io.sln('You trot back home in triumph.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        await this.io.lln('`2Barak looks quite upset.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2He then pulls out a bigass knife.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2He then proceeds to chase you around the house with it.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.startFight();
    }

    async saySlow(str: string): Promise<void> {
        let i: number;

        for (i = 0; i < str.length; i++) {
            this.io.sw(str[i]);
            await this.io.mswait(100);
        }
    }

    async saySlow2(str: string): Promise<void> {
        let i: number;

        for (i = 0; i < str.length; i++) {
            this.io.sw(str[i]);
            await this.io.mswait(10);
        }
    }

    private async hairEnd(timesHit: number, shotsLeft: number): Promise<void> {
        let numEnd: number;

        await this.io.lln('`c`%EPILOGUE', 28);
        await this.io.lln(this.io.divider(68, '`0'), 0);
        await this.io.lln('`2The battle is over.');
        await this.io.sln();
        if (timesHit > 0 && timesHit < 5) {
            await this.io.lln('You struck the hair `0' + prettyInt(timesHit) + '`2 times.');
        }
        if (timesHit === 0) {
            await this.io.lln('`2The old woman laughs at you.  `#"You are the worst shot I have ever seen, fool!  Go practice with the hair on your back.  Begone."');
            await this.io.sln();
            if (this.player.sex === 'M') {
                await this.io.lln('`4The old women flashes you!  `2You gag reflexes take over as you gape at her `4crusty saggers`2.');
                await this.io.sln();
            }
            await this.io.lln('`%YOU TRUDGE HOME IN DEFEAT - YOU FEEL HAIRABLE.');
            this.player.high_spirits = false;
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (timesHit === 5) {
            await this.io.lln('`2You totally `%DESTROYED `2the hair!');
            await this.io.sln();
            if (shotsLeft > 0) {
                await this.io.lln('`0You even had `%' + prettyInt(shotsLeft) + ' `2tries left!');
            }
        }
        await this.io.sln();
        await this.io.moreNoMail();
        if (timesHit < 5) {
            await this.io.lln('`#"Not bad!  Here is your reward." `2the wrinkled woman cackles.');
        }
        else {
            await this.io.lln('`#"Incredible!  Here is your reward."`2 the saggy one exclaims.');
        }
        await this.io.lln('`0She waves her hair strangely.');
        await this.io.sln();
        if (timesHit > 4) {
            numEnd = (timesHit + shotsLeft) * (10 * this.player.level);
        }
        else {
            numEnd = (timesHit) * (5 * this.player.level);
        }
        numEnd *= this.player.level;
        this.player.exp += numEnd;
        if (this.player.exp > 220020020) {
            this.player.exp = 220020020;
        }
        await this.io.lln('`%YOU GET ' + prettyInt(numEnd) + ' EXPERIENCE.');
        await this.io.sln();
        if (timesHit === 5) {
            await this.io.lln('`%YOUR STRENTH IS RAISED BY ONE!');
            this.player.str += 1;
            await this.io.sln();
            return;
        }
        await this.io.moreNoMail();
        this.player.high_spirits = true;
        await this.io.lln('`0You travel home in an incredible mood.');
    }

    private async fly(): Promise<void> {
        let j: number;
        let tries: number;
        let time: number;
        let oldTime2: number = 0;
        let oldTime: number;
        let oldTime1: number;
        let curTime: number = 0;
        let wz: number;
        // DIFF: forward1 was uninitialized...
        let forward1: boolean = !(random(2) === 0);
        let timesHit: number;
        let speed: number;
        let ch: string;

        const wepChar = 'I';
        await this.io.lln('`c`%A HAIRY PREDICAMENT', 21);
        await this.io.sln();
        for (j = 0; j < 10; j++) {
            await this.io.lln('`r0                     `r6                   `r0', 0);
        }
        await this.io.lln('`r0                     `r6         `#o         `r0', 0);
        await this.io.lln('`r0                     `r6        `#<`5█`#>        `r0', 0);
        await this.io.lln('`r0                     `r6        `#/\'>        `r0', 0);
        await this.io.sln();
        tries = 10;
        time = 40;
        this.io.gotoxy(24, 18);
        await this.io.lw('`0Tries Left: `%' + prettyInt(tries) + '  ');
        this.io.gotoxy(24, 19);
        await this.io.lw('`0Time  Left: `%' + prettyInt(time) + '  ');
        speed = random(10);
        this.io.gotoxy(0, 22);
        await this.io.lln('`0(Press space to take your best shot)          ', 14);
        oldTime = (new Date()).valueOf();
        oldTime1 = oldTime;
        oldTime = oldTime + 500;
        oldTime1 = oldTime1 + speed * 10;
        wz = 23;
        const wy = 5;
        this.io.gotoxy(wz - 1, wy - 1);
        await this.io.lln('`r6≈≈', 0);
        timesHit = 0;
        j = 1;

        do {
            ch = await this.readDirection();
            if (tries > 0 && ch === ' ') {
                tries -= 1;
                j = 14;
                oldTime2 = curTime + 100;
                this.io.gotoxy(24, 18);
                await this.io.lw('`0`r0Tries Left: `%' + prettyInt(tries) + ' ');
            }
            if (curTime > oldTime2 && j > 4) {
                if (j !== 14) {
                    this.io.gotoxy(29, j);
                    await this.io.lw('`r6 ');
                }
                this.io.gotoxy(29, j - 1);
                await this.io.lw('`r6' + wepChar);
                j -= 1;
                if (j === 4 && wz > 28 && wz < 31) {
                    timesHit += 1;
                    this.io.gotoxy(0, 22);
                    await this.io.lw('`r0');
                    if (timesHit === 1) {
                        await this.io.lw('`0You hit the thing!  It wobbles a little. `2<KEY>             ', 14);
                    }
                    if (timesHit === 2) {
                        await this.io.lw('`0Nice shot!  The wig falters a bit. `2<KEY>                  ', 14);
                    }
                    if (timesHit === 3) {
                        await this.io.lw('`0Direct hit!  The hair piece is limping around! `2<KEY>           ', 14);
                    }
                    if (timesHit === 4) {
                        await this.io.lw('`0You knock some hairs off - It\'s almost dead! `2<KEY>               ', 14);
                    }
                    if (timesHit === 5) {
                        await this.io.lw('`0Beautiful shot.  The wig stops moving.  `2<KEY>               ', 14);
                    }
                    this.io.emitPrompt('barak_hair_continue', [{ key: 'any', label: 'Continue' }]);
                    await this.io.getkey();
                    if (timesHit === 5) {
                        await this.hairEnd(timesHit, tries);
                        return;
                    }
                    speed = random(10);
                    this.io.gotoxy(0, 22);
                    await this.io.lln('`r0              `0(Press space to take your best shot)               ', 0);
                }
                oldTime2 = curTime + 100;
            }
            if (time < 1) {
                this.io.gotoxy(0, 22);
                await this.io.lln('`r0              `%YOU ARE OUT OF TIME!                     ', 0);
                await this.io.mswait(2000);
                await this.hairEnd(timesHit, tries);
                return;
            }
            if (tries < 1 && j < 5) {
                this.io.gotoxy(0, 22);
                await this.io.lln('`r0              `%YOU ARE TOO TIRED TO THROW AGAIN!        ', 0);
                await this.io.mswait(2000);
                await this.hairEnd(timesHit, tries);
                return;
            }
            curTime = (new Date()).valueOf();
            if (curTime > oldTime) {
                oldTime = curTime;
                oldTime += 500;
                time -= 1;
                this.io.gotoxy(25, 20);
                await this.io.lw('`0`r0Time  Left: `%' + prettyInt(time) + '  ');
            }
            if (curTime > oldTime1) {
                oldTime1 = curTime + speed * 10;
                this.io.gotoxy(wz - 1, wy - 1);
                await this.io.lw('`r6  ');
                if (forward1) {
                    wz += 1;
                    if (wz === 39) {
                        forward1 = false;
                    }
                }
                else {
                    wz -= 1;
                    if (wz < 24) {
                        forward1 = true;
                    }
                }
                this.io.gotoxy(wz - 1, wy - 1);
                await this.io.lw('`r6`$≈≈');
            }
        } while (time >= 0);
    }

    private async beard(): Promise<void> {
        let man: string;

        await this.io.sln();
        await this.io.lln('`2Barak\'s face falls. `0"You don\'t like my beard?"');
        await this.io.sln();
        await this.io.lln('`%"No, I definitely do not." `2you assure him.');
        await this.io.sln();
        await this.io.lln('`2A large tear wells up in one if his eyes.');
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.lln('`2Just then, an old women pops up behind him!');
        await this.io.sln();
        await this.io.lw('`0  ');
        await this.saySlow('"MOTHER!"');
        await this.io.lln('`2Barak screams.  `0"Get back into the basement!"');
        await this.io.sln();
        await this.io.moreNoMail();
        man = (this.player.sex === 'M' ? 'man' : 'woman');
        await this.io.lln('`#"I will not, boy! - That young ' + man + ' just insulted your beard!"');
        await this.io.sln();
        await this.io.lln('`2You scowl at the hag.  `%"I\'m just being honest with your boy, ma\'am."');
        await this.io.sln();
        await this.io.lln('`#"I cannot tell if you are being serious or not!  Are you willing to let me test your skills?"');
        await this.io.sln();
        await this.io.lln('`2(`0A`2)gree with the hag');
        await this.io.lln('`2(`0T`2)ell her to shove it');
        await this.io.sln();
        const ch = await this.io.prompt(
            '  `2You decide to ... [`0A`2] :`%',
            [{ key: 'A', label: 'Agree' }, { key: 'T', label: 'Tell off' }],
            'barak_beard_response',
            { defaultKey: 'A', leadingBlank: false, trailingBlank: false }
        );
        await this.io.sln();
        if (ch === 'T') {
            this.player.hp = 1;
            await this.io.lln('`%"Forget it, ancient one.  Your boy looks like an ogre." `2you taunt.');
            await this.io.sln();
            await this.io.moreNoMail();
            man = (this.player.sex === 'M' ? '"YOU BASTARD!"' : '"YOU BITCH!"');
            await this.io.lw('`#', 2);
            await this.saySlow(man);
            await this.io.lln('`2screams the old woman, spittle forming at her mouth.  She then plucks off her hair - only a few strands of white adorn her bald head!');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`4SHE `)THROWS `4HER HAIR AT YOU!');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`c`2Time has passed.  Hours have passed - you rub your sore head wondering what happened.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2YOU TRUDGE HOME WEAK AND DEJECTEDLY.');
            await this.io.sln();
            return;
        }
        if (ch === 'A') {
            this.player.hp = 1;
            await this.io.lln('`%"Lets do this thing, antique." `2you challenge.');
            await this.io.sln();
            await this.io.lln('`2Her wig rises from her head as if by `#magic`2!');
            await this.io.sln();
            await this.io.lln('`%IT FLOATS WILDLY AROUND THE ROOM!');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2You grip your `0' + this.player.weapon + ' `2tightly, and prepare to take down the hurling hair piece.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.fly();
            return;
        }
    }

    private async waitDot(): Promise<void> {
        await this.io.mswait(1000);
        this.io.sw('.');
    }

    private async history(): Promise<void> {
        if (random(2) == 0) {
            await this.io.lln('`%"The Way Things Were" `2by `0Master Turgon`2.');
            await this.io.sln();
            await this.io.sln('Our town has gone to pot.  Things used to be so nice - Children used to play on the street.  Now they huddle together under their beds and whisper stories about the dreaded `4Dragon`2. ');
            await this.io.sln();
            await this.io.lln('I remember when my own daughter, `#Violet`2 (my but she\'s grown) used laugh and play outside.  (now she seems to play inside more often now)');
            await this.io.sln();
            await this.io.sln('Many have asked, why don\'t *I* hunt the dragon?  The answer is simple.  I\'m not expendable - like all these new warriors.  Someone must stay behind and teach the others. (Also, someone\'s got to run my training center, right?!)');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.sln('Am I a coward?  Maybe.  But I am getting along in years.  We need a younger hero.');
            await this.io.sln();
            await this.io.sln('** THE END **', 22);
            await this.io.sln();
            await this.io.moreNoMail();
        }
        else {
            await this.io.lln('`%"The Story Of The Gods" `2by `0Master Turgon`2.');
            await this.io.sln();
            await this.io.sln('Even in this day and age many of us are religious.  Many of us still believe in God.  Some say it is a male deity, others say female.  I believe the latter.  Her name is said to be `%Jennie`2.');
            await this.io.sln();
            await this.io.sln('Once a man named Nalyd Yakcm screamed the devine ones named in the forest.  He came back to the village telling people she appeared to him.  Is it true?  None can say.');
            await this.io.sln();
            await this.io.sln('** THE END **', 22);
            await this.io.sln();
            await this.io.moreNoMail();
        }
    }

    private async skill(): Promise<void> {
        if (this.player.clss === 1) {
            await this.io.lln('`%"The Art Of Swordfighting" `2by Aragorn.');
            await this.io.sln();
            await this.io.sln('Swing it good, swing it hard - and try to avoid blows to your groin area.');
        }
        if (this.player.clss === 2) {
            await this.io.lln('`%"The Art Of Being Mystical" `2by Atsuko Sensei.');
            await this.io.sln();
            await this.io.sln('Never fully explain yourself, and well - thats pretty much it.');
        }
        if (this.player.clss === 3) {
            await this.io.lln('`%"The Art Of Thievery" `2by Chance.');
            await this.io.sln();
            await this.io.sln('Sellect your targets carefully.  Don\'t steal from level 12 people - being beheaded isn\'t particularly fun.');
        }
        await this.io.sln();
        await this.io.lln('`%YOU LEARN SOMETHING FROM THE DRIVEL.');
        if (this.player.clss === 1 && this.player.skillw < 100) {
            this.player.skillw += 1;
        }
        if (this.player.clss === 2 && this.player.skillm < 100) {
            this.player.skillm += 1;
        }
        if (this.player.clss === 3 && this.player.skillt < 100) {
            this.player.skillt += 1;
        }
    }

    private async newspaper(): Promise<void> {
        switch (random(9)) {
            case 0:
                await this.io.lln('`2You read a clipping from `06 `2years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%DIVORCE ROCKS NATION!`2=-=-=-=-', 6);
                await this.io.lln('`2Sweet hearts `0Seth Able `2and `#Violet `2are divorced!  `0"They were a troubled couple" `2reports a close friend.  No one really knows why the breakup occurred.');
                break;
            case 1:
                await this.io.lln('`2You read a clipping from `02`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%CHILD FOUND!`2=-=-=-=-', 6);
                await this.io.lln('`2Tiny angelic faced `#Lee Wren`2 was found today.  Her life was barely saved by the healers - thanks to The Old Man who brought her in.  `0"Usually it\'s the old man that needs saving." `2a bystander comments.');
                break;
            case 2:
                await this.io.lln('`2You read a clipping from `07`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%TROUBLE IN PARADISE!`2=-=-=-=-', 6);
                await this.io.lln('`2A fight errupted in the Able home as newly weds `0Seth`2 and `#Violet`2 had a squabble.  Over what?  `0"A big dumb egg" `2a family friend informed.  Now, the relationship as well as the egg is cracked as ever.');
                break;
            case 3:
                await this.io.lln('`2You read a clipping from `013`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%GRAND OPENING!`2=-=-=-=-', 6);
                await this.io.lln('`2Are you scrawny and have arms like toothpicks?  Come enroll at `%Turgon\'s Warrior Training`2.  Head trainer `0Turgon `2GURANTEE\'S `2you\'ll be kicking butt in two weeks flat. (`0Women trained too!`2)');
                break;
            case 4:
                await this.io.lln('`2You read a clipping from `08`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%NEW TRAINER HIRED!`2=-=-=-=-', 6);
                await this.io.lln('`2Recently a local boy known as Barak was hired as a level 2 master at Turgon\'s Warrior Training.  `0"We needed somebody fast and couldn\'t be picky."`2 commented Turgon.');
                break;
            case 5:
                await this.io.lln('`2You read a clipping from `09`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%AN UNPOPULAR HAUNT IS CLOSED`2=-=-=-=-', 6);
                await this.io.lln('`%"King Arthur\'s House Of Sex" `2was closed today.  It seems the owner just wasn\'t getting the business. `0"People seemed to prefer good looking girls.  Next time I\'ll listen."`2 he commented');
                break;
            case 6:
                await this.io.lln('`2You read a clipping from `09`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%A NEW PLACE OPENS!`2=-=-=-=-', 6);
                await this.io.lln('`%"Abdul\'s Armour" `2had it\'s grand opening today.  It seems the young lady who owns it used to be a minstrel. `0"People were always fighting over me and getting hurt.  I saw the need for better armour."`2 she commented.');
                break;
            case 7:
                await this.io.lln('`2You read a clipping from `09`2 years ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%THIEF ESCAPES!`2=-=-=-=-', 6);
                await this.io.lln('`2A young man known as `%"Chance"`2 `2escaped jail today.  Many believe this hard to find individual to be a ringleader of a guild of thieves.');
                await this.io.lln('`0"His father was a Master Thief - Young `%Chance`2 will become one also." `2comments Turgon.');
                break;
            case 8:
                await this.io.lln('`2You read a clipping from `02`2 months ago.');
                await this.io.sln();
                await this.io.lln('`2-=-=-=-=`%Healers Blow It!`2=-=-=-=-', 6);
                await this.io.lln('`2The level one master `%Halder`2 seems to have convinced the healers to create a wieght gaining potion for him.  Instead, the faulty formula shrunk his twig and berries.  `%Halder`2 was heard begging `0"Please don\'t print this!"');
                break;
        }
    }

    async drawMan(x: number, y: number): Promise<void> {
        if (this._x1 !== 0) {
            this.io.gotoxy(this._x1, this._y1 - 1);
            await this.io.lw('`r0 ');
            this.io.gotoxy(this._x1 - 1, this._y1);
            this.io.sw('   ');
            this.io.gotoxy(this._x1 - 1, this._y1 + 1);
            this.io.sw('   ');
        }
        this.io.gotoxy(x, y - 1);
        await this.io.lw('`r0`#o');
        this.io.gotoxy(x - 1, y);
        await this.io.lw('`#<`5█`#>');
        this.io.gotoxy(x - 1, y + 1);
        await this.io.lw('`#/\'>');
        this._x1 = x;
        this._y1 = y;
    }

    private async chest(): Promise<void> {
        const chestArr: boolean[] = [true, true, true, true, true, true];
        let x: number = 21;
        let y: number = 7;
        const badOne: number = random(6);
        let curChest: number;
        let n1: number;
        let chestsOpened: number = 0;
        let ch: string;

        this._x1 = 0;
        this._y1 = 0;

        await this.io.lln('`c`0** `%THE BASEMENT `0**', 27);
        await this.io.sln();
        await this.io.lln('`r1`!▄▄▄▄▄▄▄▄`r0                       `r1▄▄▄▄▄▄▄▄`r0', 17);
        await this.io.lln('`r1████████`r0                       `r1████████`r0', 17);
        await this.io.sln();
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`r1`!▄▄▄▄▄▄▄▄`r0                       `r1▄▄▄▄▄▄▄▄`r0', 17);
        await this.io.lln('`r1████████`r0                       `r1████████`r0', 17);
        await this.io.sln();
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`r1`!▄▄▄▄▄▄▄▄`r0                       `r1▄▄▄▄▄▄▄▄`r0', 17);
        await this.io.lln('`r1████████`r0                       `r1████████`r0', 17);

        this.io.gotoxy(0, 19);
        await this.io.lln('`0(`2Use Arrow Keys`0, `2Num Pad or `%Ctrl`0-`2S`0,`2E`0,`2D`0,`2X`0 to move. `%Space `2to open chests`0)');

        await this.drawMan(x, y);
        do {
            ch = await this.readDirection();
            if (ch === 'R') {
                if (x < 50) {
                    x += 5;
                    await this.drawMan(x, y);
                }
            }
            if (ch === 'L') {
                if (x > 21) {
                    x -= 5;
                    await this.drawMan(x, y);
                }
            }
            if (ch === 'U') {
                if (y > 7) {
                    y -= 5;
                    await this.drawMan(x, y);
                }
            }
            if (ch === 'D') {
                if (y < 17) {
                    y += 5;
                    await this.drawMan(x, y);
                }
            }
            if (ch === ' ') {
                curChest = -1;
                if (x === 21 && y === 7) {
                    curChest = 0;
                }
                if (x === 21 && y === 12) {
                    curChest = 1;
                }
                if (x === 21 && y === 17) {
                    curChest = 2;
                }
                if (x === 51 && y === 7) {
                    curChest = 3;
                }
                if (x === 51 && y === 12) {
                    curChest = 4;
                }
                if (x === 51 && y === 17) {
                    curChest = 5;
                }
                if (curChest === -1) {
                    this.io.gotoxy(0, 19);
                    await this.io.lw('`0Are you trying to open air?                                            ', 2);
                    continue;
                }
                else if (chestArr[curChest] === false) {
                    this.io.gotoxy(0, 19);
                    await this.io.lln('`0The chest is empty.  (`2Hmm - Maybe \'cuz you already opened it?!`0)');
                    await this.io.moreNoMail();
                    this.io.gotoxy(0, 19);
                    await this.io.lw('`0Barak seems to be looking the other way.                             ', 2);
                }
                else {
                    this.io.gotoxy(0, 19);
                    await this.io.lw('`0You sneakily open a chest up while Barak isn\'t looking...               ', 2);
                    if (curChest < 3) {
                        this.io.gotoxy(x - 4, y - 3);
                    }
                    else {
                        this.io.gotoxy(x - 3, y - 3);
                    }
                    await this.io.lw('`r1`!▀▀▀▀▀▀▀▀`r0');
                    this.io.gotoxy(0, 20);
                    await this.io.lw('`2', 2);
                    await this.saySlow('YOU FIND...');
                    await this.io.lw('`%');
                    if (badOne === curChest) {
                        await this.io.lw('`4');
                        await this.saySlow2('BARAK\'S CRAZY MOTHER!');
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.moreNoMail();
                        await this.io.lln('`c`%**   `4THE JIG IS UP.  `%**', 19);
                        await this.io.lln(this.io.divider(63, '`2'), 0);
                        await this.io.lln('`#"You thieving little puke!" `2Barak\'s mother screams at you.');
                        await this.io.lln('`2Bits of foam bubble through her teeth in her frenzy.');
                        await this.io.sln();
                        await this.io.moreNoMail();
                        if (chestsOpened > 1) {
                            await this.io.lln('At least you got away with opening `%' + prettyInt(chestsOpened) + '`2 chests!');
                        }
                        else if (chestsOpened === 0) {
                            await this.io.sln('You didn\'t steal one thing - Rotten luck today.');
                        }
                        else {
                            await this.io.sln('You only stole one thing - Sort of rotten luck today.');
                        }
                        await this.io.sln();
                        await this.io.sln('At her command, Barak throws you out!');
                        await this.io.sln();
                        if (chestsOpened > 1) {
                            await this.io.lln('`0You trudge back to town `2- `%Victorious`0!');
                        }
                        else if (chestsOpened === 1) {
                            await this.io.lln('`0You trudge back to town.  Not especially proud of yourself.');
                        }
                        else {
                            await this.io.lln('`4You crawl back to down in total defeat.');
                        }
                        await this.io.sln();
                        await this.io.moreNoMail();
                        return;
                    }
                    chestArr[curChest] = false;
                    chestsOpened += 1;
                    if (random(2) == 0) {
                        await this.saySlow2('A GEM!');
                        this.player.gem += 1;
                    }
                    else {
                        n1 = 20 * this.player.level;
                        n1 *= this.player.level;
                        n1 = random(n1 * this.player.level) + 1;
                        await this.saySlow2('A POUCH WITH ' + prettyInt(n1) + ' GOLD IN IT!');
                        this.player.gold += n1;
                        if (this.player.gold > 2100100100) {
                            this.player.gold = 2100100100;
                        }
                    }
                    await this.io.sln();
                    await this.io.moreNoMail();
                    if (chestsOpened === 5) {
                        await this.io.lln('`c`%**  `0EXELLENT!  `%**', 20);
                        await this.io.lln(this.io.divider(63, '`2'), 0);
                        await this.io.lln('`2You figure now would be a good time to leave - You have a');
                        await this.io.lln('`2feeling something awfully putrid is in that last chance...');
                        await this.io.sln();
                        await this.io.lln('`0"Leaving already, friend ' + this.player.name + '`0?" `2Barak asks');
                        await this.io.sln('disappointedly.');
                        await this.io.sln();
                        await this.io.lln('`2You barely supress laughing at loud.  `%"Uh, yeah... Been a long day."');
                        await this.io.sln();
                        await this.io.lln('`0BARAK GIVES YOU SOME ULTRA ALE FOR HELPING HIM CLEAN UP!');
                        this.player.hp = this.player.hp_max + parseInt(String(this.player.hp_max / 4), 10);
                        await this.io.sln();
                        await this.io.lln('`0You trudge back to town `2- `%FEELING WONDERFUL`0!');
                        await this.io.moreNoMail();
                        return;
                    }
                    this.io.gotoxy(0, 20);
                    this.io.cleareol();
                    this.io.gotoxy(0, 19);
                    this.io.cleareol();
                    switch (random(6)) {
                        case 0:
                            await this.io.lw('`0Barak looks occupied with studying his \'Playmaid\' collection...', 2);
                            break;
                        case 1:
                            await this.io.lw('`0Barak seems busy scratching himself in a corner...', 2);
                            break;
                        case 2:
                            await this.io.lw('`0Now seems like a good time to steal something...', 2);
                            break;
                        case 3:
                            await this.io.lw('`0You smile - Barak is totally absorbed in chasing a rat around...', 2);
                            break;
                        case 4:
                            await this.io.lw('`0Barak looks busy arranging his severed heads...', 2);
                            break;
                        case 5:
                            await this.io.lw('`0Barak is busy amusing himself by making faces in a mirror.', 2);
                            break;
                    }
                }
            }
        } while (ch !== 'Q');
        await this.io.moreNoMail();
    }

    private async shoot(): Promise<void> {
        let ch: string;

        await this.io.lln('`c`%Chatting With Barak');
        await this.io.lln(this.io.divider(49, '`0'), 0);
        await this.io.lln('`0"Shoot the breeze?" `2Barak asks, obviously puzzled.');
        await this.io.sln();
        await this.io.lln('`2(`0C`2)an I read some of your books?');
        await this.io.lln('`2(`0W`2)ant to play a game?');
        await this.io.sln();
        await this.io.lw('`2You decide to say... [`0W`2] :`%', 2);
        this.io.emitPrompt('barak_shoot_menu', [{ key: 'C', label: 'Read books' }, { key: 'W', label: 'Play game' }]);
        ch = (await this.io.getkey()).toUpperCase();
        await this.io.sln(ch, 0);
        await this.io.sln();
        if (ch === 'C') {
            await this.io.lln('`0"Books?!  BOOKS?!  You know I can\'t read!" `2Barak shouts, tears');
            await this.io.sln('streaming out of his eyes.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2(`0L`2)augh like hell at poor Barak.');
            await this.io.lln('`2(`0O`2)ffer to read him a story.');
            await this.io.sln();
            await this.io.lw('`2You decide to ... [`0O`2] :`%', 2);
            this.io.emitPrompt('barak_books_response', [{ key: 'L', label: 'Laugh' }, { key: 'O', label: 'Offer to read' }]);
            ch = (await this.io.getkey()).toUpperCase();
            await this.io.sln(ch, 0);
            if (ch !== 'L') {
                await this._handleOfferToRead();
            }
            else {
                await this.io.lw('`2You can\'t stop yourself from bellowing out in laughter.  Barak\'s', 2);
                await this.io.sln('face falls.  Then turns to stone.', 1);
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.sln('He then pulls out an Able\'s Sword!');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.sln('Barak hunts you down like a dog.');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.startFight();
            }
            return;
        }
        await this.io.lln('`0"Game?  Ok - Uh, want to play \'let\'s clean out the basement\'?"');
        await this.io.lln('`2Barak asks slyly.');
        await this.io.sln();
        await this.io.lln('`2(`0O`2)k, uh, that sounds like a really fun game.');
        await this.io.lln('`2(`0F`2)orget it.  I\'m not that stupid.');
        await this.io.sln();
        ch = await this.io.prompt(
            '  `2You decide to ... [`0O`2] :`%',
            [{ key: 'O', label: 'OK' }, { key: 'F', label: 'Forget it' }],
            'barak_game_response',
            { defaultKey: 'O', leadingBlank: false, trailingBlank: false }
        );
        await this.io.sln();
        if (ch === 'O') {
            await this.io.lln('`2Barak looks overjoyed.  You smile at his simplicity, and get');
            await this.io.lln('ready to pocket a few things for yourself in this little \'cleanup\'.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.chest();
            return;
        }
        await this.io.lln('`0"You stupid brat!" `2screams Barak in a fit of rage.  `0"Get out');
        await this.io.sln('my house!"');
        await this.io.sln();
        await this.io.lln('`2You wonder if helping out would have been that bad of an idea...');
        await this.io.sln();
        await this.io.lln('`%YOU TRUDGE HOME, FEELING LIKE A LOSER.');
        await this.io.sln();
        await this.io.moreNoMail();
    }

    private async knock(): Promise<void> {

        await this.io.lln('`c`%Visiting Old Friends');
        await this.io.lln(this.io.divider(49, '`0'), 0);
        await this.io.lln('`%Barak opens the door!');
        await this.io.sln();
        await this.io.lln('`0"Whadaya ya want, kid?" `2Barak asks harshly.');
        await this.io.sln();
        await this.io.lln('`2(`0J`2)ust wanted to shoot the breeze, friend!');
        await this.io.lln('`2(`0C`2)an I borrow a cup of sugar, neighbor?');
        await this.io.lln('`2(`0Y`2)our beard went out of style centuries ago.');
        await this.io.sln();
        await this.io.lw('`2You decide to say... [`0J`2] :`%', 2);
        this.io.emitPrompt('barak_door_menu', [
            { key: 'J', label: 'Chat' }, { key: 'C', label: 'Borrow sugar' }, { key: 'Y', label: 'Insult beard' }
        ]);
        const ch = (await this.io.getkey()).toUpperCase();
        await this.io.sln(ch, 0);
        await this.io.sln();
        if (ch === 'C') {
            await this.sugar();
            return;
        }
        if (ch === 'Y') {
            await this.beard();
            return;
        }
        await this.shoot();
    }

    private async walkIn(): Promise<void> {
        await this.io.lln('`c`%Uh oh...');
        await this.io.lln(this.io.divider(49, '`0'), 0);
        await this.io.lln('`2You saunter in like you own the place.  Barak');
        await this.io.sln('stares at you in wonder as you help yourself to');
        await this.io.sln('some meat and cheese sitting on the table.');
        await this.io.sln();
        await this.io.lln('`0"You insolent pubby!  You will die for this."`2 the ');
        await this.io.sln('bearded man growls.');
        await this.io.sln();
        await this.io.lln('`2(`0A`2)ppologize and leave him be');
        await this.io.lln('`2(`0K`2)ick him in the shin and have a good laugh');
        await this.io.sln();
        const ch = await this.io.prompt(
            '  `2You decide to... [`0A`2] :`%',
            [{ key: 'A', label: 'Apologize' }, { key: 'K', label: 'Kick shin' }],
            'barak_apology_response',
            { echo: false, defaultKey: 'A', leadingBlank: false, trailingBlank: false }
        );
        await this.io.sln();
        if (ch === 'A') {
            await this.io.lln('`%"I\'m uh.. sorry.. I thought no one was home," `2you');
            await this.io.sln('finish lamely.');
            if (this.player.cha > 1) {
                this.player.cha -= 1;
            }
            this.player.put();
            await this.io.sln();
            await this.io.lln('`0"You stupid fool!" `2 Barak screams.  He then gives');
            await this.io.sln('you a severe throttling to your face and ears.');
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln('`2You are then thrown out of his house, landing in a rather');
            await this.io.sln('large pile of cow dung.');
            await this.io.sln();
            await this.io.lln('`%(THE SMELL IS OVERWELMING, YOU LOSE 1 CHARM)');
            await this.io.sln();
            await this.io.moreNoMail();
        }
        if (ch === 'K') {
            await this.io.lln('`2You kick him a good one!');
            await this.io.sln();
            if (this.player.level < 3) {
                await this.io.lln('`2Barak laughs at your puny attempt.');
                await this.io.lln('');
                if (this.player.cha > 1) {
                    this.player.cha -= 1;
                }
                await this.io.moreNoMail();
                await this.io.sln('He grabs you by your throat and lifts you off the ground.');
                await this.io.lln('`0"You fool.  I am the level two master - And you have never bested');
                await this.io.sln('me.  How do you expect to do so now?"');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.sln('`2You are then thrown out of his house, landing in a rather');
                await this.io.sln('large pile of cow dung.');
                await this.io.sln();
                await this.io.lln('`%(THE SMELL IS OVERWELMING, YOU LOSE 1 CHARM)');
            }
            else {
                await this.io.lln('`%He screams in pain!');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.lln('`2You help yourself to another chunk of bread, and');
                await this.io.sln('laugh so hard at Barak small pieces fly out of');
                await this.io.sln('your mouth and pummel him.');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.lln('`0"No more!" `2Barak shrieks in a rather high pitched voice.');
                await this.io.sln();
                await this.io.lln('You laugh.  `%"Give me your most valuable possesion, you hairy');
                await this.io.lln('fool." `2you demand.');
                await this.io.sln();
                await this.io.lln('`0"Alright!  I\'ll give you a flask of my Ultra Ale, damnit!"');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.sln('`2You snatch up this \'Ultra Ale\' and drain it in one swig.');
                await this.io.sln();
                await this.io.lln('`%YOU FEEL INVICINCIBLE!');
                await this.io.sln();
                await this.io.lln('`2You feel you\'ve done enough Barak taunting for now and head home.');
                this.player.hp = this.player.hp_max + parseInt(String(this.player.hp_max / 4), 10);
            }
            await this.io.sln();
            await this.io.moreNoMail();
        }
    }

    runMaint(b: BarakRecord): void {
        let i: number;

        for (i = 0; i < b.canPlay.length; i++) {
            b.canPlay[i] = true;
        }
        b.day = this.state.days;
        b.put();
    }

    async main(): Promise<void> {
        let b: BarakRecord;

        this.io.foreground(2);
        this.io.background(0);

        this._x1 = 0;
        this._y1 = 0;

        await this.io.lln('`r0`0`2`c  `%Visiting A Friend', 0);
        await this.io.lln(this.io.divider(59, '`0'), 0);
        if (!this.io.ansi) {
            await this.io.sln('NOTE:  The \'arcade\' sequences in this IGM *REQUIRE* ANSI terminal');
            await this.io.sln('support.  Things will look out of wack in your current settings.');
            await this.io.sln('You can switch to ANSI inside of LORD by pressing 3 from the main');
            await this.io.sln('menu.  You just better hope your terminal supports it...');
            await this.io.sln();
        }

        const bs = this.storage.create(this.igmDir + 'barak.dat', Barak_Defs);
        if (bs.length < 1) {
            b = bs.new() as unknown as BarakRecord;
        }
        else {
            b = bs.get(0) as unknown as BarakRecord;
        }
        if (b.day != this.state.days) {
            this.runMaint(b);
        }
        if (!b.canPlay[this.player.Record] || this.player.forest_fights < 1) {
            await this.io.lln('`2You like Barak and all - But you feel a might too weary to');
            await this.io.sln('make the trip.  Maybe tomorrow.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        b.canPlay[this.player.Record] = false;
        b.put();

        this.player.forest_fights--;
        await this.io.lln('`2Feeling a might lonely, you decide to pay a visit to a');
        await this.io.sln('dear friend.  It\'s no short journey and you are quite');
        await this.io.sln('tired when you arrive.');
        await this.io.sln();
        await this.io.lln('`2(`0K`2)nock on the door');
        await this.io.lln('`2(`0W`2)alk in like you own the place');
        await this.io.lln('`2(`0H`2)ead back to town');
        await this.io.sln();
        const ch = await this.io.prompt(
            '  `2You decide to... [`0K`2] :`%',
            [{ key: 'K', label: 'Knock' }, { key: 'W', label: 'Walk in' }, { key: 'H', label: 'Head back' }],
            'barak_visit_menu',
            { defaultKey: 'K', leadingBlank: false, trailingBlank: false }
        );
        await this.io.sln();
        if (ch === 'H') {
            await this.io.lln('`2You decide maybe you should have called first - and trudge back');
            await this.io.sln('home.');
            await this.io.sln();
            await this.io.moreNoMail();
            return;
        }
        if (ch === 'K') {
            await this.knock();
        }
        if (ch == 'W') {
            await this.walkIn();
        }
    }
}

export default Barak;
