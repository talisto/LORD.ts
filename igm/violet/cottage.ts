/**
 * Violet's Cottage - Inside the Cottage (Male Path)
 * All rooms: Bathroom, Den, Kitchen, 1st Floor, 2nd Floor, Basement
 */
import { random } from '@lordts/util/Util';
import type IO from '@lordts/core/io/IO';
import type Log from '@lordts/core/Log';
import type { VioletRecord } from './violetDefs';

interface PlayerRecord {
    Record: number;
    name: string;
    sex: string;
    hp: number;
    hp_max: number;
    str: number;
    def: number;
    cha: number;
    gem: number;
    exp: number;
    gold: number;
    level: number;
    laid: number;
    dead: boolean;
    weapon: string;
    put(): void;
}

export class Cottage {
    private io: IO;
    private player: PlayerRecord;
    private log: Log;
    private record: VioletRecord;

    constructor(io: IO, player: PlayerRecord, log: Log, record: VioletRecord) {
        this.io = io;
        this.player = player;
        this.log = log;
        this.record = record;
    }

    async run(): Promise<void> {
        let roomDone = false;
        do {
            this.io.sclrscr();
            await this.io.sln();
            this.io.foreground(15);
            await this.io.lln('`%Inside the Cottage', 0);
            await this.io.lln('`l', 0);
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln('`2Immediately after you enter the Cottage, you are met by two VERY beautiful females.', 0);
            await this.io.sln();
            this.io.foreground(10);
            await this.io.lw('`0"Hi, we\'re ');
            await this.printViolet();
            this.io.foreground(10);
            await this.io.lw('`0\'s sisters, Rosy and Lily. Where would you like to go today? There are two upper floors, a basement, a kitchen,');
            await this.io.sln();
            await this.io.lw('`0and The Den"');
            this.io.foreground(2);
            await this.io.lw('`2 they say.');
            await this.io.sln();
            await this.io.sln();
            await this.io.lln('`0(`#1`0)`2st Floor', 0);
            await this.io.lln('`0(`#2`0)`2nd Floor', 0);
            await this.io.lw('`2The ');
            await this.io.lw('`0(`#K`0)`2itchen');
            await this.io.sln();
            await this.io.lln('`0(`#T`0)`2he Basement', 0);
            await this.io.lw('`2The ');
            await this.io.lw('`0(`#D`0)`2en');
            await this.io.sln();
            await this.io.lw('`2The ');
            await this.io.lw('`0(`#B`0)`2athroom');
            await this.io.sln();
            await this.io.lln('`0(`#L`0)`2eave the Cottage', 0);
            await this.io.sln();
            await this.io.lw('`2Which floor, oh mighty one? ');

            this.io.emitPrompt('violet_cottage_floor', [
                { key: '1', label: '1st Floor' }, { key: '2', label: '2nd Floor' },
                { key: 'K', label: 'Kitchen' }, { key: 'T', label: 'Basement' },
                { key: 'D', label: 'Den' }, { key: 'B', label: 'Bathroom' },
                { key: 'L', label: 'Leave' },
            ]);
            const ch = (await this.io.getkey()).toUpperCase();

            if (ch === 'L') break;

            // The original male-path cottage visit resolves after one room's
            // encounter, so any successful branch sets roomDone and exits.
            if (ch === 'B') {
                await this.bathroom();
                roomDone = true;
            } else if (ch === 'D') {
                await this.den();
                roomDone = true;
            } else if (ch === 'K') {
                await this.kitchen();
                roomDone = true;
            } else if (ch === '1') {
                await this.firstFloor();
                roomDone = true;
            } else if (ch === '2') {
                await this.secondFloor();
                roomDone = true;
            } else if (ch === 'T') {
                await this.basement();
                roomDone = true;
            }
        } while (!roomDone);
    }

    // ═══════════════════════════════════════════════════════════════
    // Bathroom (Daisy)
    // ═══════════════════════════════════════════════════════════════

    private async bathroom(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Bathroom', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You slip away to the master bathroom...as you enter, you see someone taking a shower! This someone also has beautiful curves as you can see from the sillouette on the curtain!', 0);
        await this.io.sln();
        await this.io.lln('`0(`#T`0)`2ake a dump ANYWAY', 0);
        await this.io.lln('`0(`#R`0)`2ip off the curtains to see who it is!', 0);
        await this.io.lln('`0(`#S`0)`2peak softly to the person behind the curtains', 0);
        await this.io.sln();
        await this.io.lw('`2Hurry! The water!!!! : ');
        this.io.emitPrompt('violet_bathroom', [
            { key: 'T', label: 'Take a dump' },
            { key: 'R', label: 'Rip off the curtains' },
            { key: 'S', label: 'Speak softly' },
        ]);

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('TRS'.indexOf(ch) === -1);

        if (ch === 'T') {
            this.io.sclrscr();
            await this.io.sln();
            this.io.foreground(15);
            await this.io.lln('`%Ya GOTTA go!', 0);
            await this.io.lln('`l', 0);
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln('`2You take a dump...the person in the shower opens the curtains! It turns out that it is Violet\'s cousin, Daisy! She\'s gagging on the smell! She beats you with her hairbrush!', 0);
            await this.io.sln();
            await this.io.lln('`2You lose 2 charm!', 0);
            this.player.cha -= 2;
            await this.pressAKey();
        } else if (ch === 'R') {
            this.io.sclrscr();
            await this.io.sln();
            this.io.foreground(15);
            await this.io.lln('`%You MUST know!', 0);
            await this.io.lln('`l', 0);
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln('`2You rip open the curtains. There, looking beautiful, is Violet\'s cousin, Daisy! She\'s startled, but then she sees who it is. She gives you a peck on the check and lets you dry her off!', 0);
            await this.io.sln();
            await this.io.lln('`2You gain 1 charm and 5 strength!', 0);
            this.player.cha += 1;
            this.player.str += 5;
            await this.pressAKey();
        } else if (ch === 'S') {
            this.io.sclrscr();
            await this.io.sln();
            this.io.foreground(15);
            await this.io.lln('`%You DAWG!', 0);
            await this.io.lln('`l', 0);
            await this.io.sln();
            this.io.foreground(2);
            await this.io.lln('`2You whisper the most enchanting phrases to the sweetness behind the curtain! The curtain draws back, and you see Violet\'s cousin, Daisy! She takes you back to her room for a little EXTRA recreation!', 0);
            await this.io.sln();
            await this.io.lln('`2You gain the knowledge you desire!', 0);
            await this.io.lln('`2You get a charm point, and 5 defense!', 0);
            this.player.cha += 1;
            this.player.def += 5;
            this.player.laid += 1;
            await this.log.logLine(`\`0${this.player.name} \`2was laid by \`$Daisy \`2!`);
            await this.pressAKey();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Den (Father fight)
    // ═══════════════════════════════════════════════════════════════

    private async den(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Den', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Before the two women can stop you, you scoot out of their grasps and run down the hallway. At then end of the hallway, you see a door, slightly cracked, with a beam of light coming out of the bottom. Before you can investigate, it opens. You enter the door and see what is inside. An older man and a young man are sitting in the room.', 0);
        await this.io.sln();
        await this.io.lln('`0(`#T`0)`2alk to the two men with confidence', 0);
        await this.io.lln('`0(`#D`0)`2raw your sword, just to be safe', 0);
        await this.io.lln('`0(`#R`0)`2un out of the room before things get nasty', 0);
        await this.io.sln();
        await this.io.lw('`2They\'re starting to stare! CHOOSE : ');
        this.io.emitPrompt('violet_den', [
            { key: 'T', label: 'Talk with confidence' },
            { key: 'D', label: 'Draw your sword' },
            { key: 'R', label: 'Run away' },
        ]);

        let denDone = false;
        do {
            const ch = (await this.io.getkey()).toUpperCase();

            if (ch === 'T') {
                await this.denTalk();
                denDone = true;
            } else if (ch === 'D') {
                await this.denDraw();
                denDone = true;
            } else if (ch === 'R') {
                await this.denRun();
                denDone = true;
            }
        } while (!denDone);
    }

    private async denTalk(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Den', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You attempt to communicate with the two men with your suaveness. However, you failed to take into account the fact that other men in Violet\'s Cottage would resent your presence!', 0);
        await this.io.sln();
        await this.io.lln('`2The older man introduces himself as the Father, and attacks you!', 0);
        await this.io.sln();

        // Combat with Father: his HP starts at twice the player's current HP,
        // making the den the cottage's dedicated combat-risk branch.
        let fatherHp = this.player.hp * 2;
        let fled = false;

        while (this.player.hp > 0 && fatherHp > 0) {
            await this.io.sln();
            await this.io.lln('`2The Father\'s Hit points: ' + fatherHp, 0);
            await this.io.lln('`2Your Hit points: ' + this.player.hp, 0);
            await this.io.sln();
            await this.io.lln('`0(`#A`0)`2ttack', 0);
            await this.io.lln('`0(`#R`0)`2un like chicken!', 0);
            await this.io.sln();
            await this.io.lw('`2Your command : ');
            this.io.emitPrompt('violet_father_fight', [
                { key: 'A', label: 'Attack' },
                { key: 'R', label: 'Run' },
            ]);

            let ch: string;
            do {
                ch = (await this.io.getkey()).toUpperCase();
            } while ('AR'.indexOf(ch) === -1);

            if (ch === 'R') {
                fled = true;
                break;
            }

            // Father attacks player: damage = random(level * 10)
            const fatherDmg = random(this.player.level * 10);
            this.player.hp -= fatherDmg;
            await this.io.sln();
            await this.io.lw('`2The Father hit for ');
            await this.io.lln(fatherDmg + ' damage!', 0);

            // Player attacks Father: damage = random(str * 2)
            const playerDmg = random(this.player.str * 2);
            fatherHp -= playerDmg;
            await this.io.lw('`2You hit for ');
            await this.io.lln(playerDmg + ' damage!', 0);
        }

        if (fled) {
            await this.io.sln();
            await this.io.lln('`2You get the HELL out of there!', 0);
            await this.io.sln();
            await this.pressAKey();
            return;
        }

        if (this.player.hp < 1) {
            await this.pressAKey();
            this.io.sclrscr();
            await this.io.lln('`2HE KILLED YOU!!!!!!!!!!!', 0);
            await this.io.lln('`2Your lungs fill with blood and you wished that you had never come here!', 0);
            await this.io.sln();
            this.player.dead = true;
            await this.log.logLine(`\`0${this.player.name} \`2 was killed by \`#Violet's \`@Father\`2!`);
            await this.pressAKey();
            return;
        }

        if (fatherHp <= 0 && this.player.hp > 0) {
            await this.pressAKey();
            this.io.sclrscr();
            await this.io.lln('`2You WHIPPED his ass!', 0);
            await this.io.lln('`2Good job, brave warrior! We are proud of you!', 0);
            await this.io.sln();
            // Experience gain: exp / 10 (10% of current exp)
            const expGain = Math.floor(this.player.exp / 10);
            this.player.exp += expGain;
            this.player.hp = this.player.hp_max;
            await this.pressAKey();
            await this.log.logLine(`\`0${this.player.name} \`2 killed \`#Violet's \`@Father\`2!`);
        }
    }

    private async denDraw(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Den', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lw('`2You draw your sword, and the two men stand up. They introduce themselves as ');
        await this.printViolet();
        await this.io.lw('`2\'s brother and father.');
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lw('`0"I like a kid with spunk!"');
        this.io.foreground(2);
        await this.io.lw('`2 he says.');
        await this.io.sln();
        this.io.foreground(10);
        await this.io.sln();
        await this.io.lln('`2You have a GREAT time with them!', 0);
        await this.io.lln('`2They say that your sword needs a new name!', 0);
        await this.io.sln();
        await this.io.lw('`2Name your sword: ');
        this.io.emitPrompt('violet_name_sword', [], 'line');
        const newName = await this.io.getstr({ len: 16 });
        this.player.weapon = newName.substring(0, 20);
        this.player.hp_max += 10;
        await this.pressAKey();
    }

    private async denRun(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Den', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You run like a madman before you get hurt!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0On the way out, you trip!', 0);
        await this.io.lln('`2Boy was THAT stupid!', 0);
        this.player.hp = Math.floor(this.player.hp / 2);
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Kitchen (Cook)
    // ═══════════════════════════════════════════════════════════════

    private async kitchen(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Kitchen', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2The two girls show you around the corner and into the kitchen. Even brave warriors like yourself get hungry now and then! As the girls leave, you encounter the cook: an attractive, yet tough looking female. The cook stares at you blankly, as if waiting for you to ask her something', 0);
        await this.io.sln();
        await this.io.lln('`0(`#A`0)`2sk the cook for a bite to eat, BOY you\'re famished!', 0);
        await this.io.lln('`0(`#S`0)`2tare back at the cook like the freak of nature that she is', 0);
        await this.io.lln('`0(`#C`0)`2ompliment the cook on her excellent taste in attire, and good food', 0);
        await this.io.sln();
        await this.io.lw('`2Do something you silly person : ');
        this.io.emitPrompt('violet_kitchen', [
            { key: 'A', label: 'Ask for food' },
            { key: 'S', label: 'Stare at the cook' },
            { key: 'C', label: 'Compliment the cook' },
        ]);

        let kitchenDone = false;
        do {
            const ch = (await this.io.getkey()).toUpperCase();

            if (ch === 'A') {
                await this.kitchenAsk();
                kitchenDone = true;
            } else if (ch === 'S') {
                await this.kitchenStare();
                kitchenDone = true;
            } else if (ch === 'C') {
                await this.kitchenCompliment();
                kitchenDone = true;
            }
        } while (!kitchenDone);
    }

    private async kitchenAsk(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Kitchen', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);

        if (this.record.cookReady) {
            await this.io.lln('`2Well, the cook decides you look pitiful enough to give you some food for your troubles. She hands you a bowl of soup and a mug of some WONDERFUL grog!', 0);
            await this.io.sln();
            this.io.foreground(10);
            await this.io.lln('`0BOY that was some tasty food! You feel invigorated!', 0);
            this.player.hp_max += 10;
            await this.io.sln();
            await this.pressAKey();
        } else {
            await this.io.lln('`2The cook looks at you with disdain!', 0);
            await this.io.sln();
            this.io.foreground(10);
            await this.io.lw('`0"You just don\'t TRY hard enough young man! See me when thou hast given thineself a fair shot!"');
            this.io.foreground(2);
            await this.io.lln('`2 she says.', 0);
            this.io.foreground(10);
            await this.io.sln();
            await this.io.lln('`2Well, you feel stupid...maybe you should talk to Violet first next time!', 0);
            this.record.cookReady = true;
            this.record.put();
            await this.io.sln();
            await this.pressAKey();
        }
    }

    private async kitchenStare(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Kitchen', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0"You EVIL, VILE man! I set upon you with a vengance!"', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2The cook attacks you!', 0);

        // Combat with Cook: Cook HP = Player HP * 2
        let cookHp = this.player.hp * 2;
        let fled = false;

        while (this.player.hp > 0 && cookHp > 0) {
            await this.io.sln();
            await this.io.lln('`2The Cook\'t Hit points: ' + cookHp, 0);
            await this.io.lln('`2Your Hit points: ' + this.player.hp, 0);
            await this.io.sln();
            await this.io.lln('`0(`#A`0)`2ttack', 0);
            await this.io.lln('`0(`#R`0)`2un like chicken!', 0);
            await this.io.sln();
            await this.io.lw('`2Your command : ');
            this.io.emitPrompt('violet_cook_fight', [
                { key: 'A', label: 'Attack' },
                { key: 'R', label: 'Run' },
            ]);

            let ch: string;
            do {
                ch = (await this.io.getkey()).toUpperCase();
            } while ('AR'.indexOf(ch) === -1);

            if (ch === 'R') {
                fled = true;
                break;
            }

            // Cook attacks player: damage = random(level * 10)
            const cookDmg = random(this.player.level * 10);
            this.player.hp -= cookDmg;
            await this.io.sln();
            await this.io.lw('`2The cook hit for ');
            await this.io.lln(cookDmg + ' damage!', 0);

            // Player attacks Cook: damage = random(str * 2)
            const playerDmg = random(this.player.str * 2);
            cookHp -= playerDmg;
            await this.io.lw('`2You hit for ');
            await this.io.lln(playerDmg + ' damage!', 0);
        }

        if (fled) {
            await this.io.sln();
            await this.io.lln('`2You get the HELL out of there!', 0);
            await this.io.sln();
            await this.pressAKey();
            return;
        }

        if (this.player.hp < 1) {
            await this.pressAKey();
            this.io.sclrscr();
            await this.io.lln('`2SHE KILLED YOU!!!!!!!!!!!', 0);
            await this.io.lln('`2Your lungs fill with blood and you wished that you had never come here!', 0);
            await this.io.sln();
            this.player.dead = true;
            await this.log.logLine(`\`0${this.player.name} \`2 was killed by the \`@Cook \`2!`);
            await this.pressAKey();
            return;
        }

        if (cookHp <= 0 && this.player.hp > 0) {
            await this.pressAKey();
            this.io.sclrscr();
            await this.io.lln('`2You WHIPPED her ass!', 0);
            await this.io.lln('`2Good job, brave warrior! We are proud of you!', 0);
            await this.io.sln();
            const expGain = Math.floor(this.player.exp / 10);
            this.player.exp += expGain;
            this.player.hp = this.player.hp_max;
            await this.pressAKey();
            await this.log.logLine(`\`0${this.player.name} \`2 killed \`#Violet's \`@Cook\`2!`);
        }
    }

    private async kitchenCompliment(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Kitchen', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
            await this.io.lln('`2The cook is so elated that you would notice her that she takes you into the meat locker! You\'ve never had it so good!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0You have a WONDERFUL time exploring the cook\'s cuisine!', 0);
        await this.io.sln();
        this.player.laid += 1;
        this.player.cha += 5;
        await this.log.logLine(`\`0${this.player.name} \`2got laid by \`#Violet's \`@Cook\`2!`);
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // First Floor (Lily)
    // ═══════════════════════════════════════════════════════════════

    private async firstFloor(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The First Floor', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Lily escorts you to the First Floor of the cottage. You are astonished at the grace and beauty of this fine young woman In the room, there\'s a couch. Lily takes you over to the couch And sits down next to you.', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0Oh ' + this.player.name + ', you are so strong and muscular, I could just eat you up!', 0);
        await this.io.sln();
        await this.io.lln('`0(`#R`0)`2eturn the compliment', 0);
        await this.io.lln('`0(`#T`0)`2ell her you would like to go someplace more, "private"', 0);
        await this.io.lln('`0(`#S`0)`2quirm your way out of her grasp', 0);
        await this.io.lln('`0(`#M`0)`2ake a move on her', 0);
        await this.io.sln();
        await this.io.lw('`2What do you say? ');
        this.io.emitPrompt('violet_lily', [
            { key: 'R', label: 'Return the compliment' },
            { key: 'T', label: 'Ask for privacy' },
            { key: 'S', label: 'Squirm away' },
            { key: 'M', label: 'Make a move' },
        ]);

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('RTSM'.indexOf(ch) === -1);

        if (ch === 'M') {
            await this._firstFloorMakeMove();
        } else if (ch === 'R') {
            await this._firstFloorReturnCompliment();
        } else if (ch === 'T') {
            await this._firstFloorAskPrivacy();
        } else if (ch === 'S') {
            await this._firstFloorSquirmAway();
        }
    }

    private async _firstFloorMakeMove(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the couch with Lily', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2As you move closer to Lily, she backs off. You start to move closer, and she backs off again. You try once more and she finally responds to your advances!', 0);
        this.io.foreground(10);
        await this.io.sln();
        await this.io.lln('`2Lily kicks you in the crotch for trying to take advantage of her! Defense decreases by 2, Hit points go WAY down... But you gain some valuable experience that you will heed later on!', 0);
        this.player.def -= 2;
        this.player.hp = 1;
        this.player.exp += 100;
        await this.pressAKey();
    }

    private async _firstFloorReturnCompliment(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the couch with Lily', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Lily takes the compliment well! She decides to show you some of the finer points of love!', 0);
        this.io.foreground(10);
        await this.io.sln();
        await this.io.lln('`2Your charm increases by 2!', 0);
        this.player.cha += 2;
        await this.io.sln();
        this.player.laid += 1;
        await this.log.logLine(`\`0${this.player.name} \`2was laid by \`!Lily \`2!`);
        await this.pressAKey();
    }

    private async _firstFloorAskPrivacy(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the couch with Lily', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Lily didn\'t like THAT at ALL!', 0);
        this.io.foreground(10);
        await this.io.sln();
        await this.io.lln('`2Your charm DECREASES by 2!', 0);
        this.player.cha -= 2;
        if (this.player.cha < 0) {
            this.player.cha = 0;
        }
        await this.io.sln();
        await this.pressAKey();
    }

    private async _firstFloorSquirmAway(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the couch with Lily', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You rejected her! She slaps you in the face for it!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`2You lose ALL charm for rejecting Violet\'s sister!', 0);
        this.player.cha = 0;
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Second Floor (Rosie)
    // ═══════════════════════════════════════════════════════════════

    private async secondFloor(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Second Floor', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Rosie grabs you by the hand and leads you up the steps to the 2nd floor of the cottage. When you get there, you are not too surprised to see a bed in the room. Rosie sits on the bed and motions for you sit beside her.', 0);
        await this.io.sln();
        await this.io.lln('`0(`#S`0)`2it down beside her, what harm could it do?', 0);
        await this.io.lln('`0(`#T`0)`2ell her you have to go to the little warrior\'s room', 0);
        await this.io.lln('`0(`#A`0)`2sk her what exactly it is she wants you to do', 0);
        await this.io.lln('`0(`#R`0)`2avish her like the manly warrior you claim to be', 0);
        await this.io.sln();
        await this.io.lw('`2What will the BRAVE warrior do? ');
        this.io.emitPrompt('violet_rosie', [
            { key: 'S', label: 'Sit beside her' },
            { key: 'T', label: 'Excuse yourself' },
            { key: 'A', label: 'Ask what she wants' },
            { key: 'R', label: 'Ravish her' },
        ]);

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('STAR'.indexOf(ch) === -1);

        if (ch === 'R') {
            await this._secondFloorRavish();
        } else if (ch === 'S') {
            await this._secondFloorSitBeside();
        } else if (ch === 'T') {
            await this._secondFloorExcuseYourself();
        } else if (ch === 'A') {
            await this._secondFloorAskWhatSheWants();
        }
    }

    private async _secondFloorRavish(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the bed with Rosie', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You pounce on Rosie in an attempt to show her what a REAL warrior is like, and she gives no resistance!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lw('`0You are ENGORGED with vigor! You feel so good that you think you might be able to give ');
        await this.printViolet();
        this.io.foreground(10);
        await this.io.lw('`0 another try!');
        await this.io.sln();
        this.player.laid += 1;
        this.record.cookReady = false;
        this.record.put();
        await this.log.logLine(`\`0${this.player.name} \`2was laid by \`@Rosie \`2!`);
        await this.io.sln();
        await this.pressAKey();
    }

    private async _secondFloorSitBeside(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the bed with Rosie', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2As you sit on the bed, you notice that Rosie is moving closer to you continuously. When she\'s sitting right next to you, she kisses you full on the lips! She\'s a GREAT kisser!', 0);
        await this.io.sln();
        this.io.foreground(10);
        const expGain = Math.floor(this.player.exp / 10);
        await this.io.lw('`0Your experience goes up by ');
        await this.io.lln('' + expGain, 0);
        this.player.exp += expGain;
        await this.io.sln();
        await this.pressAKey();
    }

    private async _secondFloorExcuseYourself(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Little Warrior\'s Room', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You excuse yourself and head to the facilities to drain the dragon. However, once you get there, you are astonished to see that there is NO toilet paper. You end up having to run out of the house buck naked because you don\'t want to dirty your only clothes!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0You gain 2 strength for running so fast, but lose 2 charm for being so embarrased!', 0);
        this.player.str += 2;
        this.player.cha -= 2;
        await this.io.sln();
        await this.pressAKey();
    }

    private async _secondFloorAskWhatSheWants(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`2What are you, a prude? I like my men to show me what they\'re made of! Next time you should show me a little more of that lizard in your pants you call a dragon!', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2Rosie thinks you are prudish, and decides that you are not worth her time or effort. But she shows pity on you, and gives you some tips on women and their ways.', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0For being a prude (heaven forbid!), you gain 1 charm!', 0);
        this.player.cha += 1;
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Basement (Violet)
    // ═══════════════════════════════════════════════════════════════

    private async basement(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Basement', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2The sisters show you the door to the basement, and quickly leave after doing so. As you climb down the stairs, you see a woman sitting by a lamp in the middle of the room. As you near the bottom of the stairs, you...', 0);
        await this.io.sln();
        await this.io.lln('`0(`#A`0)`2sk her who she is', 0);
        await this.io.lln('`0(`#T`0)`2ell her that you are `0' + this.player.name + '`2, come to save her from...uhh...whatever!', 0);
        await this.io.lln('`0(`#K`0)`2neel before her, in all her radiant beauty', 0);
        await this.io.sln();
        await this.io.lw('`2What do you do? ');
        this.io.emitPrompt('violet_basement', [
            { key: 'A', label: 'Ask who she is' },
            { key: 'T', label: 'Tell her who you are' },
            { key: 'K', label: 'Kneel before her' },
        ]);

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('ATK'.indexOf(ch) === -1);

        if (ch === 'A') {
            await this._basementAskName();
        } else if (ch === 'T') {
            await this._basementTellName();
        } else if (ch === 'K') {
            await this._basementKneel();
        }
    }

    private async _basementAskName(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Basement', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2The woman stands up, and removes her shawl, only to reveal herself as VIOLET!', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0"For being so polite, as to ask a lady\'s name, I give you a small token of my gratitude," says Violet.', 0);
        await this.io.sln();
        await this.io.lln('`2She hands you a bag of gems!', 0);
        await this.io.sln();
        this.player.gem += 5;
        await this.pressAKey();
    }

    private async _basementTellName(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the basement', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You run up to the maiden and begin the process of her liberation...', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0NOW JUST HOLD ON a second here, I need no rescuing! I am Violet! I can handle myself! But for the noble thought, I will give you a kiss!', 0);
        await this.io.sln();
        await this.printViolet();
        this.io.foreground(10);
        await this.io.lw('`0 kisses you full on the lips! You are overjoyed!');
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`2She put vigor in you! You gain 10 Strength!', 0);
        this.player.str += 10;
        await this.io.sln();
        await this.pressAKey();
    }

    private async _basementKneel(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Basement', 0);
        await this.io.lln('`l', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You kneel before the lady in awe and reverence. Before long, she speaks:', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0Rise, noble knight. I have chosen thee to be the receiver of a great blessing. Go forth, and use your power wisely.', 0);
        await this.io.sln();
        await this.io.lln('`2Your Hit Points have been raised by 100!', 0);
        await this.io.sln();
        this.player.hp += 100;
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    private async printViolet(): Promise<void> {
        this.io.foreground(13);
        await this.io.lw('`#Violet');
    }

    private async pressAKey(): Promise<void> {
        await this.io.lw('`0·`2 Touch `0ANY`2 key to continue `0·');
        this.io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
    }
}
