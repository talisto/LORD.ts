/**
 * Violet's Cottage - Porch (Female Path)
 * Front porch, lemonade, gossip, Peter backyard, Archon the Bard
 */
import { random } from '@lordts/util/Util';
import type IO from '@lordts/core/io/IO';
import type Log from '@lordts/core/Log';
import type { VioletRecord } from './violetDefs';
import { DEFAULT_GOSSIP } from './violetDefs';


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

interface GossipStore {
    getEntries(): Promise<string[]>;
    addEntry(entry: string): Promise<void>;
}

export class Porch {
    private io: IO;
    private player: PlayerRecord;
    private log: Log;
    private record: VioletRecord;
    private gossipStore: GossipStore;
    private srcDir: string;

    constructor(io: IO, player: PlayerRecord, log: Log, record: VioletRecord, gossipStore: GossipStore, srcDir: string) {
        this.io = io;
        this.player = player;
        this.log = log;
        this.record = record;
        this.gossipStore = gossipStore;
        this.srcDir = srcDir;
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_882c - Female Cottage entrance
    // ═══════════════════════════════════════════════════════════════

    async run(): Promise<void> {
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Violet\'s Cottage', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You search the woods extensively, and eventually you spot a small clearing. As you step out of the forest and into the clearing, you see a small cottage. On the porch of the cottage sits an old man and an old woman. The beckon for you to come closer.', 0);
        await this.io.sln();
        await this.io.lln('  (`#S`0)`2tride boldy to the cottage to meet these two interesting individuals', 0);
        await this.io.lln('  (`#D`0)`2ecline their offer and return to the town', 0);
        await this.io.sln();
        await this.io.lw('`2Ok, you\'ve come this far, NOW what? ');

        this.io.emitPrompt('violet_porch_approach', [
            { key: 'S', label: 'Stride boldly' }, { key: 'D', label: 'Decline' },
        ]);
        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('SD'.indexOf(ch) === -1);

        // Female-path porch visit branches immediately into the lemonade / gossip
        // flow on acceptance; declining simply ends the encounter.
        if (ch === 'S') {
            await this.frontPorch();
        }
        // D = decline, just exit
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_8584 - Front porch (lemonade offer)
    // ═══════════════════════════════════════════════════════════════

    private async frontPorch(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the front porch', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You boldly go where no....wait a second, wrong realm......', 0);
        await this.io.lln('`2Let\'s try that again...', 0);
        await this.io.lln('`2You stride boldly to the front of the porch, truly expecting some sort of hideous mutation to occur before your very eyes! You\'re slightly dissapointed when the old woman hands you a glass of lemonade and asks you to sit with them.', 0);
        await this.io.sln();
        await this.io.lln('  (`#A`0)`2ccept her gracious offer and sit down', 0);
        await this.io.lln('  (`#D`0)`2ecline the drink, but sit down anyway', 0);
        await this.io.sln();
        await this.io.lw('`2Gee that lemonade looks tasty...whaddya think? ');

        this.io.emitPrompt('violet_lemonade', [
            { key: 'A', label: 'Accept' }, { key: 'D', label: 'Decline' },
        ]);
        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('AD'.indexOf(ch) === -1);

        if (ch === 'A') {
            await this.lemonade();
        } else if (ch === 'D') {
            await this.declineLemonade();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_832e - Decline lemonade
    // ═══════════════════════════════════════════════════════════════

    private async declineLemonade(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%On the porch', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You decline their offer of lemonade.', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0You ingrateful creetin! Get off my property!', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('`2You think this might be a good time to depart.', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_80a1 - Lemonade scene / Drinking with Ma and Pa
    // ═══════════════════════════════════════════════════════════════

    private async lemonade(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Drinking with Ma and Pa', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You accept the tasty looking lemonade and gulp it down. To your utter amazement, it makes you feel GREAT! You feel like you could kill the Red Dragon with your bare hands (I wouldn\'t suggest trying that thought <G>).', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0"So ye liketh that liquid, dost thee? Its an old family recipie!', 0);
        await this.io.lw('`0Ask ');
        await this.printViolet();
        this.io.foreground(10);
        await this.io.lw('`0 about it sometime. She LOVES our lemonade!"');
        this.io.foreground(2);
        await this.io.lw('`2 says the old man.');
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('  (`#A`0)`2sk them what they do for fun around here', 0);
        await this.io.lln('  (`#I`0)`2nquire about Seth Able', 0);
        await this.io.lln('  (`#S`0)`2lip away for a rendezvous with Archon', 0);
        await this.io.sln();
        await this.io.lw('`2That ain\'t no sippin tea, DO SOMETHING! ');

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('AIS'.indexOf(ch) === -1);

        // Lemonade unlocks the real porch content: gossip, Seth/Peter talk, or
        // the Archon rendezvous branch.
        if (ch === 'S') {
            await this.archon();
        } else if (ch === 'A') {
            await this.gossipPrompt();
        } else if (ch === 'I') {
            await this.inquireSethAble();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_63a9 - Inquire about Seth Able → Peter redirect
    // ═══════════════════════════════════════════════════════════════

    private async inquireSethAble(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Shootin the breeze...', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You attempt to strike up a conversation about that hunk, Seth Able! However, the old people don\'t seem to agree with you on this one.', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lw('`0"Why, our son ');
        this.io.foreground(14);
        await this.io.lw('`%Peter');
        this.io.foreground(10);
        await this.io.lln('`0 is a better looking fellow than that old Seth Able! Why dontcha go out to the back yard and talk to him!"', 0);
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lw('`2You want to talk to Peter? (Y/[N]): ');
        const ch = (await this.io.getkey()).toUpperCase();
        if (ch === 'Y') {
            await this.peterBackyard();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Gossip system
    // ═══════════════════════════════════════════════════════════════

    private async gossipPrompt(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Gabbin with the Old Folks', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(10);
        await this.io.lln('`0"Well, youngin, we do lots of stuff. But what we do ALOT is GOSSIP! Ya got any new stories fer us? We\'d love to hear em!"', 0);
        this.io.foreground(2);
        await this.io.lln('`2the old lady says to you.', 0);
        await this.io.sln();
        await this.io.lw('`2You wanna gossip? (Y/[N]): ');
        const ch = (await this.io.getkey()).toUpperCase();
        if (ch === 'N') {
            await this.declineGossip();
        } else {
            await this.gossip();
        }
    }

    private async declineGossip(): Promise<void> {
        await this.io.sln();
        await this.io.lln('`2Oh well youngin, that\'s ok...thanks just the same!', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    private async gossip(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Old Lady\'s gossip', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2Here\'s what the Old Lady\'s heard so far: ', 0);
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Gossip', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.sln();

        // Display the stock gossip table first, then append anything persisted
        // through the shared gossip store by earlier visitors.
        for (const entry of DEFAULT_GOSSIP) {
            await this.io.lln(entry, 0);
        }

        // Display stored gossip entries
        const entries = await this.gossipStore.getEntries();
        for (const entry of entries) {
            await this.io.lln(entry, 0);
        }

        await this.io.sln();
        await this.io.lw('`2Enter your own gossip: ');
        const newGossip = await this.io.getstr({ len: 40 });
        await this.gossipStore.addEntry(newGossip.substring(0, 40));

        await this.io.sln();
        await this.io.lln('`2Thanks for the gossip!', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_5d62 - Peter backyard
    // ═══════════════════════════════════════════════════════════════

    private async peterBackyard(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%In the Backyard', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You leave the two old folks and head toward the backyard. Upon arriving there, you meet a GORGEOUS young man. You assume this is Peter.', 0);
        await this.io.sln();
        await this.io.lln('  (`#N`0)`2ever mind', 0);
        await this.io.lln('  (`#S`0)`2how him some thigh', 0);
        await this.io.lln('  (`#L`0)`2ick your lips seductively', 0);
        await this.io.lln('  (`#K`0)`2iss the strapping young lad', 0);
        await this.io.lln('  (`#P`0)`2ut your hand down his pants', 0);
        await this.io.lln('  (`#G`0)`2ive him a night he won\'t soon forget!', 0);
        await this.io.sln();
        await this.io.lw('`2Choose, but choose wisely: ');

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('NSLKPG'.indexOf(ch) === -1);

        await this.io.sln();
        await this.io.sln();

        if (ch === 'N') {
            await this.io.lln('`2You walk away before you get your feelings hurt', 0);
            await this.io.sln();
            await this.pressAKey();
        } else if (ch === 'S') {
            await this.peterShowThigh();
        } else if (ch === 'L') {
            await this.peterLickLips();
        } else if (ch === 'K') {
            await this.peterKiss();
        } else if (ch === 'P') {
            await this.peterHandDown();
        } else if (ch === 'G') {
            await this.peterFullEncounter();
        }
    }

    private async peterShowThigh(): Promise<void> {
        await this.io.lln('`2You pull up your skirt a little to show Peter what you\'ve got to offer...', 0);
        await this.io.sln();

        if (this.player.cha > 4) {
            await this.io.lln('`2He blushes and gives you a kiss!', 0);
            await this.io.lln('`2You gain 2 charm!', 0);
            this.player.cha += 2;
            await this.pressAKey();
        }
        if (this.player.cha < 5) {
            await this.io.lln('`2He calls you a tramp and leaves!', 0);
            await this.io.lln('`2You LOSE 2 charm!', 0);
            this.player.cha -= 2;
            await this.pressAKey();
        }
    }

    private async peterLickLips(): Promise<void> {
        await this.io.lln('`2You lick your lips in an effort to arouse Peter.', 0);
        await this.io.sln();

        if (this.player.cha > 9) {
            await this.io.lln('`2It worked! He blushes and asks you to talk to him again soon!', 0);
            await this.io.lln('`2You gain 1000 experience!', 0);
            this.player.exp += 1000;
            await this.pressAKey();
        }
        if (this.player.cha < 10) {
            await this.io.lln('`2He seems disinterested. You feel silly!', 0);
            await this.io.lln('`2You lose 10% of your experience!', 0);
            this.player.exp -= Math.floor(this.player.exp / 10);
            await this.pressAKey();
        }
    }

    private async peterKiss(): Promise<void> {
        await this.io.lln('`2You kiss Peter full on the lips.', 0);
        await this.io.sln();

        if (this.player.cha > 0x13) {
            await this.io.lln('`2He doesn\'t object! He even kisses you back!', 0);
            await this.io.lln('`2You gain 2500 Experience!', 0);
            this.player.exp += 2500;
            await this.pressAKey();
        }
        if (this.player.cha < 0x14) {
            await this.io.lln('`2He calls you a tramp and leaves!', 0);
            await this.io.lln('`2You LOSE 10% of your experience!', 0);
            this.player.exp -= Math.floor(this.player.exp / 10);
            await this.pressAKey();
        }
    }

    private async peterHandDown(): Promise<void> {
        await this.io.lln('`2You put you\'re hand down his pants to find his manliness.', 0);
        await this.io.sln();

        if (this.player.cha > 0x18) {
            await this.io.lln('`2He likes it and fondles you as well!', 0);
            await this.io.lln('`2You gain 100 extra hitpoints!', 0);
            this.player.hp += 100;
            await this.pressAKey();
        }
        if (this.player.cha < 0x19) {
            await this.io.lln('`2Peter slaps you and runs away!', 0);
            await this.io.lln('`2You LOSE your healthiness!', 0);
            this.player.hp = 1;
            await this.pressAKey();
        }
    }

    private async peterFullEncounter(): Promise<void> {
        await this.io.lln('`2You start to undress and motion him to do the same...', 0);
        await this.io.sln();

        if (this.player.cha > 0x1e) {
            await this.io.lln('`2He undresses too! You have a WONDERFUL time together that night!', 0);
            await this.io.lln('`2You gain 5000 Experience!', 0);
            this.player.exp += 5000;
            this.player.laid += 1;
            await this.log.logLine(`\`0${this.player.name} \`2was laid by \`$Peter \`2!`);
            await this.pressAKey();
        }
        if (this.player.cha < 0x1f) {
            await this.io.lln('`2He calls you a tramp and leaves!', 0);
            await this.io.lln('`2You lose self esteem! ', 0);
            this.player.cha = 1;
            await this.pressAKey();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_7650 - Archon the Bard
    // ═══════════════════════════════════════════════════════════════

    private async archon(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lw('  ');
        this.io.foreground(4);
        await this.io.lw('`4SECRET ');
        this.io.foreground(15);
        await this.io.lw('`%rendezvous with ');
        this.io.foreground(12);
        await this.io.lln('`!Archon ', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You thought Seth Able was the greatest of all bards, well....YOU WERE WRONG! Archon, The greatest bard of all time, who captures the hearts of women in all lands, gives audiences after his shows for certain women that he likes. You overheard one day that such audiences are held behind Violet\'s Cottage.', 0);
        await this.io.sln();
        await this.io.lln('`2You go to the backyard, wave a Peter on the way, and enter a thicket. After about an hour of traveling, you stumble upon an open area. You see a large stage, and a GORGEOUS hunk of a man sitting on it with a mandolin just a strummin away...', 0);
        await this.io.sln();
        await this.io.lln('  (`#T`0)`2alk to the beautiful bard', 0);
        await this.io.lln('  (`#D`0)`2o a dance for the bard', 0);
        await this.io.lln('  (`#S`0)`2hoot the hostage! (Hey, it worked in Speed!)', 0);
        await this.io.sln();
        await this.io.lw('`2Do what you feel is right : ');

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('TDS'.indexOf(ch) === -1);

        if (ch === 'S') {
            await this.archonShoot();
        } else if (ch === 'T') {
            await this.archonTalk();
        } else if (ch === 'D') {
            await this.archonDance();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Archon S - Shoot the hostage (random event)
    // ═══════════════════════════════════════════════════════════════

    private async archonShoot(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%A rather...unorthodox choice', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2Well, you choose an interesting thing to do...dunno why, just seemed to fit in this case, right? Well, anyway, consider this the random event portion of this program....hey, EVERY program has to have one right?', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0SUPER DOUBLE BACKFLIP NONSENSE EVENT IN THE FOREST!!!', 0);
        await this.io.sln();
        this.io.foreground(2);

        const eventCase = random(5) + 1;

        if (eventCase === 1) {
            await this._archonShootGold();
        } else if (eventCase === 2) {
            await this._archonShootMiss();
        } else if (eventCase === 3) {
            await this._archonShootSniper();
        } else if (eventCase === 4) {
            await this._archonShootZombie();
        } else if (eventCase === 5) {
            await this._archonShootSubmit();
        }
    }

    private async _archonShootGold(): Promise<void> {
        await this.io.lln('`2Wow. Archon is sooooo impressed with your movie knowledge that he decides to give you money to see his new movie at the Village Singleplex!', 0);
        await this.io.sln();
        await this.io.lw('`2You gain ');
        this.io.foreground(10);
        await this.io.lw('`01000 ');
        this.io.foreground(14);
        await this.io.lw('`%gold');
        this.io.foreground(2);
        await this.io.lln('`2!', 0);
        this.player.gold += 1000;
        await this.pressAKey();
    }

    private async _archonShootMiss(): Promise<void> {
        await this.io.lln('`2You miss the hostage and hit Archon square in the chest with the bullet! He doubles over in pain, but stands right back up! As he is pummeling you, you can just barely hear him say "There can be only one!"...', 0);
        await this.io.sln();
        await this.io.lln('`2Ooops...that was kinda dumb! You are near death...', 0);
        this.player.hp = 1;
        await this.pressAKey();
    }

    private async _archonShootSniper(): Promise<void> {
        await this.io.lln('`2You hit a sniper in the balcony who was trying to kill Archon! Archon is VERY grateful! He takes you in his arms and gives you the sweetest kiss. of all your life! You feel, well, REALLY GOOD!', 0);
        await this.io.sln();
        await this.io.lln('`2Boy, can that Archon KISS! You gain 3 charm!', 0);
        this.player.cha += 3;
        await this.pressAKey();
    }

    private async _archonShootZombie(): Promise<void> {
        await this.io.lln('`2The hostage dies as you shoot him. He is promptly buried, and after a short funeral service, he promptly rises from the dead as a zombie to take his revenge on you! BOY is HE pissed!', 0);
        await this.io.sln();
        await this.io.lln('`2For having a zombie follow you around all the time now, you lose 2 charm!', 0);
        this.player.cha -= 2;
        if (this.player.cha < 0) {
            this.player.cha = 0;
        }
        await this.pressAKey();
    }

    private async _archonShootSubmit(): Promise<void> {
        await this.io.lln('`2The bard runs to your side to stop you from messing with such an obviously dangerous weapon! You relent, and submit to him! He has his way with you before he leaves!', 0);
        await this.io.sln();
        await this.io.lln('`2Wow, what an experience! You gain 10 HP to your max!', 0);
        this.player.hp_max += 10;
        await this.log.logLine(`\`0${this.player.name} \`2was laid by \`!Archon the Bard\`2!`);
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Archon T - Talk to the bard
    // ═══════════════════════════════════════════════════════════════

    private async archonTalk(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Talking to the bard', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2Boy, he\'s SOOOOO cute that you just HAVE to go and talk to him! You step up to the stage with a little bit of apprehension, but he takes your hand and melts away all your fears...', 0);
        await this.io.sln();
        await this.io.lln('  (`#A`0)`2sk him about his life and times', 0);
        await this.io.lln('  (`#T`0)`2alk to him about being a warrior', 0);
        await this.io.lln('  (`#S`0)`2ee what kind of things he likes', 0);
        await this.io.sln();
        await this.io.lw('`2Well, go ahead, speak up : ');

        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while ('ATS'.indexOf(ch) === -1);

        if (ch === 'A') {
            await this.archonTalkLife();
        } else if (ch === 'T') {
            await this.archonTalkWarrior();
        } else if (ch === 'S') {
            await this.archonTalkLikes();
        }
    }

    private async archonTalkLife(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%The Life and Times of Archon the Bard', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2Archon is very pleased that you are interested in him! He starts to tell you about his life, the things he\'s seen, the people he\'s met, but all you can do is stare into those beautiful green eyes of his!', 0);
        await this.io.sln();
        await this.io.lln('`2You pull him closer and kiss him full on the lips! He doesn\'t object and also continues to embrace your love. You have the feeling that this is the beginning of a beautiful relationship!', 0);
        await this.io.sln();
        await this.io.lln('`2You gain 100 HP!', 0);
        this.player.hp += 100;
        await this.pressAKey();
    }

    private async archonTalkWarrior(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Your life and times', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You talk to him about what you\'ve accomplished in your short term as a warrior. He seems very disinterested...therefore you decide to embellish your life a little to get his attention. He perks up immediately and starts to write it down! But when you get to the name of your weapon, he frowns...', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lln('`0"Such a mighty warrior needs to have a mighty name for her weapon!', 0);
        this.io.foreground(2);
        await this.io.lw('`2Name your weapon :');
        const newName = await this.io.getstr({ len: 16 });
        this.player.weapon = newName.substring(0, 20);
        await this.pressAKey();
    }

    private async archonTalkLikes(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%What HE likes!', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You ask Archon what he likes in a woman. He says that he is turned on by the warrior type, but that his ideal woman is standing in front of him! You blush at these words, and run back to the town to tell all your friends what Archon has told you...But, they like him too, so they call you a liar!', 0);
        await this.io.sln();
        await this.io.lln('`2You are castigated by your friends, and the women in the town dislike you! You feel AWFUL. You spend HOURS inside moping. Your natural beauty dissipates from what it was. You lose almost ALL your charm! But, you use your time like a good warrior. You hone your body into an intense fighting machine! You GAIN 10 Strength and 10 Defense!', 0);

        if (this.player.name.toUpperCase() === 'ANASTASIA') {
            await this.io.sln();
            await this.io.lln('`2And because it is YOU my darling, I fixed this version for YOU only!!! That\'s', 0);
            await this.io.lln('`2right! It will now ADD charm instead of taking it, but only for YOU...', 0);
            await this.io.lln('`2I `4Love `2you Kris...know that for forever...', 0);
            this.player.cha += 10;
        } else {
            this.player.cha = 1;
        }
        this.player.str += 10;
        this.player.def += 10;
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Archon D - Dance
    // ═══════════════════════════════════════════════════════════════

    private async archonDance(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%DANCE DANCE DANCE!', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You do a little dance for Archon! He\'s impressed! He takes you on the road with him! You see the sites of all the land! You meet the most famous people in the land!', 0);
        await this.io.sln();
        await this.io.lln('`2Actually, none of it happens. You just get a charm point for being daring <G>.', 0);
        await this.pressAKey();
        this.player.cha += 1;
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
