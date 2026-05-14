/**
 * RedDragonInn - The Red Dragon Inn location for LORD.
 *
 * The game's social hub: players can chat with others online, send love
 * notes, make public announcements, read gossip, play blackjack, and
 * interact with Violet the Barmaid. Enforces announcement rate limits via
 * AnnouncementPolicy.
 */
import { random, prettyInt, dispStr, cleanStr } from '@lordts/util/Util';
import Lazy from '@lordts/util/Lazy';
import type IO from '../io/IO';
import type State from '../State';
import type FileUtils from '@lordts/util/FileUtils';
import type { Settings } from '../types';
import type Mail from '../Mail';
import type Player from '../Player';
import type Rankings from '../Rankings';
import type Log from '../Log';
import type Battle from '../Battle';
import type Bard from './Bard';
import type { Violet } from './Violet';
import type { LoadedPlayerRecord, UiMode } from '../types';
import type { PromptOption } from '../GameEvents';
import type { Marriage } from '../Marriage';
import { BankTransferAmountPolicy } from '../BankTransferAmountPolicy';
import { GameExitError } from '../GameExitError';
import type { LdyManager } from '../lady/LdyManager';
import type { IStorage } from '@lordts/storage/IStorage';
import {
    resolveDeathKnightUsePointDivisor,
    resolveThiefUsePointDivisor,
} from '@lordts/util/Settings';

// Type placeholder for GameContext

export class RedDragonInn {
    constructor(
        private io: IO,
        private state: State,
        private fileUtils: FileUtils,
        private settings: Settings,
        private _mail: Lazy<Mail>,
        private _player: Lazy<Player>,
        private _rankings: Lazy<Rankings>,
        private _log: Lazy<Log>,
        private _battle: Lazy<Battle>,
        private _bard: Lazy<Bard>,
        private _marriage: Lazy<Marriage>,
        private _violet: Lazy<Violet>,
        private _uiMode: UiMode,
        private _ldyManager: Lazy<LdyManager>,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get ldyManager(): LdyManager { return this._ldyManager.value; }
    get storage(): IStorage { return this._storage.value; }
    get mail(): Mail { return this._mail.value; }

    get player(): Player { return this._player.value; }

    get rankings(): Rankings { return this._rankings.value; }

    get log(): Log { return this._log.value; }
    get battle(): Battle { return this._battle.value; }
    get bard(): Bard { return this._bard.value; }
    get marriage(): Marriage { return this._marriage.value; }
    get violet(): Violet { return this._violet.value; }

    // ── Inn operations ──────────────────────────────────────────────────

    async wakeUp(): Promise<void> {
        let mstr: string;
        const vds: string[] = ["AIDS!", "HERPES!", "SYPHILIS!", "GONORRHEA!", "the HIV virus!"];
        const sethSupport: string[] = [
            "  `0I love you, and still do not regret what we did. Nor will I ever.\n",
            "  `0You must be strong - Do not let the gossip hurt you.\n",
            "  `0Teach our young to be strong - To be like her mother.\n",
            "  `0I am sending what I can - Not because of the law, I want to do it.\n",
        ];
        const salutations: string[] = ["  `0My dearest ", "  `0My lovely ", "  `0My goddess ", "  `0Dear "];
        const origDead: boolean = this.player.dead || this.player.hp < 1;

        await this.state.getState(false);
        this.player.hp = this.player.hp_max;
        this.player.seen_master = false;
        BankTransferAmountPolicy.resetPlayerUsage(this.storage, this.state.days, this.player.Record);
        this.player.transferred_gold = 0;
        this.player.flirted = false;
        this.player.forest_fights = 15;
        this.player.seen_bard = false;
        this.player.last_reincarnated = this.state.days;
        this.player.time = this.state.days;
        this.player.pvp_fights = this.settings.pvp_fights_per_day;
        if (random(5) + 1 === 3) {
            this.player.weird = true;
        }
        this.player.seen_dragon = false;
        this.player.seen_violet = false;
        this.player.dead = false;
        this.player.leftbank = false;
        if (this.settings.forest_fights > 32000) {
            this.settings.forest_fights = 32000;
        }
        if (this.settings.forest_fights > 0 && this.settings.forest_fights <= 32000) {
            this.player.forest_fights = this.settings.forest_fights;
        }
        // do some other player maint ..  but not if theyve been gone for too long
        if (this.player.gone < this.settings.res_days) {
            const deathKnightUsePointDivisor = resolveDeathKnightUsePointDivisor(this.settings);
            const thiefUsePointDivisor = resolveThiefUsePointDivisor(this.settings);
            // Daily use points: DK and Thief divide skill by configurable divisor; Mystical gets raw skill points
            this.player.levelw = Math.floor(this.player.skillw / deathKnightUsePointDivisor);
            this.player.levelm = this.player.skillm;
            this.player.levelt = Math.floor(this.player.skillt / thiefUsePointDivisor);
            if (this.player.clss === 1) {
                this.player.levelw += 1;
            }
            if (this.player.clss === 2) {
                this.player.levelm += 1;
            }
            if (this.player.clss === 3) {
                this.player.levelt += 1;
            }
            if (this.player.clss === 1 || this.player.clss === 3) {
                this.io.foreground(15);
                const usePointDivisor = this.player.clss === 1 ? deathKnightUsePointDivisor : thiefUsePointDivisor;
                await this.io.sln("(Remember, " + prettyInt(usePointDivisor) + " Skill Points = 1 Use Point)", 17);
                await this.io.sln();
            }
            this.io.foreground(10);
            if (this.player.clss === 1) {
                await this.io.lln("For being a `%Death Knight`0, you get an extra `%Death Knight`0 use point!");
            } else if (this.player.clss === 2) {
                await this.io.lln("For being a `5Mystical Skills`0 student, you get an extra use point for today!");
            } else if (this.player.clss === 3) {
                await this.io.lln("For being a Pilferer, you get an extra `%Thieving Skills`0 use point!");
            }

            await this.io.sln();
            if (this.player.kids > 0) {
                this.io.foreground(2);
                this.io.sw("You are inspired by your child", 2);
                if (this.player.kids === 1) {
                    await this.io.sln(".", 0);
                } else {
                    await this.io.sln("ren.", 0);
                }
                await this.io.sln();
                await this.io.lln("`%YOU RECEIVE `0" + prettyInt(this.player.kids) + " `%EXTRA FOREST FIGHTS FOR TODAY.");
                await this.io.sln();
                this.player.forest_fights += this.player.kids;
                if (this.player.forest_fights > 32000) {
                    this.player.forest_fights = 32000;
                }
            }
            if (this.player.bank >= 2000000000) {
                await this.io.lln("`$No interest earned today.  The coins won't fit in the bank!");
                this.player.bank = 2000000000;
            } else {
                this.player.bank += Math.floor(this.player.bank * this.settings.bank_interest / 100);
                if (this.player.bank > 2000000000) {
                    this.player.bank = 2000000000;
                    await this.io.lln("`0Wow! You have a lot of gold!");
                }
            }
        } else {
            this.player.gone = 0;
            await this.io.lln("`0The townspeople thought you had abandoned them!");
            await this.io.sln();
        }
        if (this.settings.sleep_dragon && origDead === false && (this.player.level > 12 || this.player.exp > 15000000)) {
            await this.io.lln("`c`2You awake to odd movement in the middle of the night...");
            await this.io.sln();
            await this.io.lln("It feels like you're on a boat, a slow rolling side to side lulling you back to sleep...");
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln(
                "  Suddenly, you bolt awake!  You went to sleep " + (this.player.inn ? "at the inn" : "in the fields") + "!",
            );
            await this.io.sln();
            await this.io.moreNoMail();
            await this.io.lln("The `4Red Dragon `2spits you out onto the ground in front of it.");
            await this.io.lln("Unprepared, you fumble for your " + this.player.weapon + "`2.");
            await this.io.sln();
            await this.battle.fightDragon(true);
            await this.io.moreNoMail();
        }
        if (this.player.dead || this.player.hp < 1) {
            this.player.online = false;
            this.player.put();
        } else {
            // Single mothers with 3+ kids and 13+ encounters: 20% chance of Seth's child support gold
            if (this.player.sex === "F" && this.player.kids > 3 && this.player.laid > 13) {
                if (this.player.married_to < 0 && this.state.married_to_seth !== this.player.Record) {
                    if (random(5) === 3) {
                        mstr = "  `0Seth Able `2sent you this...\n";
                        mstr += '`l\n';
                        mstr += salutations[random(salutations.length)];
                        mstr += this.player.name + ",\n";
                        mstr += sethSupport[random(sethSupport.length)];
                        mstr += "  `0\n";
                        mstr += "  `0Visit me today, please.\n";
                        mstr += " \n";
                        mstr += "  `%BANK NOTICE:\n";
                        mstr += '`l\n';
                        mstr +=
                            "  `0Seth Able `2has transfered `%" +
                            prettyInt(this.player.kids * 1000 * this.player.level) +
                            " `2gold\n";
                        mstr += "  to your account.\n";
                        mstr += "`b" + this.player.kids * 1000 * this.player.level + "\n";
                        await this.mail.mailTo(this.player.Record, mstr);
                    }
                }
            }
        }
        // 2/3 chance of high spirits (affects forest combat damage)
        if (random(3) + 1 > 1) {
            await this.io.lln("`2You are in `0high `2spirits today.");
            this.player.high_spirits = true;
            await this.io.sln();
        } else {
            await this.io.lln("`2You are in `0low `2spirits today.");
            await this.io.sln();
            this.player.high_spirits = false;
        }
        if (this.player.horse) {
            await this.io.lln("`)** `%You ready your horse `)**`2");
            await this.io.sln();
            // Horse grants +25% forest fights (rounded down)
            this.player.forest_fights += Math.floor(this.player.forest_fights / 4);
            if (this.player.forest_fights > 32000) {
                this.player.forest_fights = 32000;
            }
        }
        if (this.player.inn) {
            await this.io.sln("You wake up early, sheathe your weapon, and head down to the bar.");
        } else {
            await this.io.lln("`2You wake up early, strap your `" + (this.player.weapon.includes("`") ? "" : "%") + this.player.weapon + "`2 to your back, and head out to the Town Square, seeking adventure, fame, and honor.", 2);
            await this.io.sln();
        }
        // ~3% daily pregnancy chance if laid count exceeds 5x kids (fertility throttle)
        if (this.player.sex === "F" && random(34) + 1 === 11 && this.player.laid * 5 > this.player.kids) {
            await this.marriage.haveBaby();
        }
        await this.marriage.checkMarriage();
        // ~4% daily VD chance once player has 50+ romantic encounters
        if (this.player.laid > 50) {
            if (random(23) === 13) {
                await this.io.sln();
                await this.io.lln("`0** `%YOU FEEL SICK THIS MORNING! `0**");
                await this.io.sln();
                this.player.hp = 1;
                await this.log.logLine("`0" + this.player.name + " `2went to the healers to get cured of `4VD`2!");
                await this.io.moreNoMail();
                await this.io.lln("`2You head to the healers in dismay, what can it be?");
                await this.io.sln();
                await this.io.moreNoMail();
                this.io.sclrscr();
                await this.io.sln();
                await this.io.sln();
                this.io.foreground(15);
                await this.io.sln("Healers");
                this.io.foreground(1);
                await this.io.sln(this.io.divider());
                this.io.foreground(2);
                await this.io.lln('`0"My God!" `2Nathan, the lead healer screams.');
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.lw("`%You are diagnosed with ", 2);
                await this.io.sln(vds[random(vds.length)]);
                await this.io.sln();
                await this.io.lln("`2You are fairly sure you didn't get it off a toilet seat.");
                await this.io.sln();
                await this.io.moreNoMail();
                await this.io.lln("`2Luckily, Nathan has a potion that can cure it.  This time.");
                await this.io.sln("However, you still feel quite weak from the experience.");
                await this.io.sln();
            }
        }
    }

    async getARoom(): Promise<boolean> {

        await this.io.sln();
        await this.io.sln();
        if (this.rip) await this.io.showRip("W5");
        this.io.foreground(2);
        await this.io.sln("The bartender approaches you at the mention of a room.");
        this.io.foreground(5);
        await this.io.sln("\"You want a room, eh?  That'll be " + prettyInt(400 * this.player.level) + ' gold!"');
        const ch = await this.io.prompt(
            "  `2Do you agree? [`0Y`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'room_confirm',
            { defaultKey: 'Y', leadingBlank: false, trailingBlank: false }
        );
        if (ch !== "Y") {
            await this.io.sln();
            await this.io.sln("The bartender grunts, then walks away uninterested.");
            return false;
        }

        await this.io.sln();
        await this.io.sln();
        // Charm 100+ gets a free room (normally costs 400 * level gold)
        if (this.player.cha > 99) {
            if (this.player.sex === "M") {
                await this.io.lln("\"You seem like a nice guy, and I hear you're tough, so tell you what, I'll just give you the room for free....\"");
            } else {
                await this.io.lln("\"Hey good lookin'!  I'll be glad to give you a freebie... A free room I mean, of course.  Har!\"");
            }
            await this.io.sln();
            await this.io.moreNoMail();
        } else {
            if (this.player.gold < 400 * this.player.level) {
                this.io.foreground(4);
                await this.io.sln('"Hey!  You stupid fool! You don\'t have that much gold!"');
                return false;
            }
            if (this.player.cha < 100) {
                this.player.gold -= 400 * this.player.level;
            }
        }

        this.player.inn = true;
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("The Room At The Inn");
        this.io.foreground(10);
        await this.io.sln(this.io.divider());
        this.io.foreground(2);
        await this.io.sln("You are escorted to a small but cozy room in the Inn.");
        await this.io.lln("You relax on the soft bed, and soon fall asleep, still wearing your armour.");
        await this.io.sln();
        await this.io.sln();
        this.player.on_now = false;
        this.player.put();
        if (this.rip) {
            await this.io.showRip("EXIT");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        throw new GameExitError();
    }

    private async attackInInn(): Promise<void> {
        let ch: string;
        let done: boolean = false;
        let atk: number;
        let op: LoadedPlayerRecord;
        let pronoun: string;

        if (this.rip) await this.io.showRip("WARINN");
        this.io.sclrscr();
        await this.io.showBuffer(this.rankings.generateRankings(true, true, true), true, true);
        await this.io.sln();
        do {
            await this.io.sln();
            this.io.foreground(5);
            await this.io.sln('"What next, kid?"');
            await this.io.sln();
            if (!this.rip && !this.modern) {
                this.io.foreground(2);
                await this.io.lln("`2(`5L`2)ist Warriors in the Inn");
                await this.io.lln("`2(`5S`2)laughter Warriors in the Inn");
                await this.io.lln("`2(`5R`2)eturn to Bar");
            }
            ch = await this.io.commandPrompt('inn_attack_menu', [
                { key: 'L', label: 'List Warriors' },
                { key: 'S', label: 'Slaughter Warriors' },
                { key: 'R', label: 'Return to Bar' },
            ], true);
            switch (ch) {
                case "L":
                    await this.io.showBuffer(this.rankings.generateRankings(true, true, true), true, true);
                    break;
                case "R":
                    this.io.foreground(5);
                    await this.io.sln();
                    await this.io.lln("\"So ya aren't going to attack anyone?  Here is half your money back...'   The other half will cover my time!\" `2the bartender laughs harshly.");
                    this.player.gold += 400 * (this.player.level * 2);
                    await this.io.sln();
                    await this.io.moreNoMail();
                    done = true;
                    break;
                case "S": {
                    await this.io.sln("Who would you like to attack?");
                    atk = await this.player.findPlayer();
                    if (atk === -1) {
                        await this.io.sln("No warriors found.");
                        break;
                    }
                    await this.io.sln();
                    const foundOp = this.player.playerGet(atk);
                    if (!foundOp) {
                        await this.io.sln("No warriors found.");
                        break;
                    }
                    op = foundOp;
                    pronoun = op.sex === "M" ? "he" : "she";
                    if (atk === this.player.Record) {
                        await this.io.sln("You wish to attack yourself?!!  You decide against it.");
                        break;
                    }
                    if (op.dead) {
                        await this.io.sln("That warrior isn't at the Inn at the moment.");
                        await this.io.sln("You recall seeing in the news that " + pronoun + " was dead..");
                        break;
                    }
                    if (!op.inn) {
                        await this.io.lln("That warrior is not staying at the Inn today, " + pronoun + " is probably in the fields.");
                        break;
                    }
                    // Can't attack players 2+ levels below you in the inn
                    if (op.level + 1 < this.player.level) {
                        await this.io.sln("A child could beat that wimp!  Attack someone else!");
                        break;
                    }
                    if (this.rip) await this.io.showRip("W5");
                    if (op.sex === "M") {
                        await this.io.lln("You enter " + op.name + "`2s room...He is sleeping.");
                        await this.io.lln("You notice he has a dangerous looking " + op.weapon + " `2by his bed..");
                        await this.io.lln("Are you sure you want to attack him?");
                    } else {
                        await this.io.lln("You enter " + op.name + "`2s room...She is sleeping.");
                        await this.io.lln("You notice she has a dangerous looking " + op.weapon + " `2by her bed..");
                        await this.io.lln("Are you sure you want to attack her?");
                    }
                    ch = await this.io.prompt(
                        "  `2Attack `5" + op.name + " `2[`0Y`2] :`0",
                        [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
                        'attack_inn_confirm',
                        { defaultKey: 'Y', leadingBlank: true, trailingBlank: true }
                    );
                    if (ch === "N") {
                        if (this.rip) await this.io.showRip("WARINN");
                        break;
                    }
                    await this.io.sln();
                    await this.io.sln("Being a trained warrior, " + pronoun + " jumps up suddenly, aware of your presence!");
                    await this.mail.mailTo(
                        atk,
                        "  `%YOU HAVE BEEN ATTACKED IN YOUR ROOM!\n`l\n" +
                            "  `0" +
                            this.player.name +
                            "`2 has broken into your room at the Inn!",
                    );
                    await this.io.more();
                    await this.battle.attackPlayer(op, true);
                    done = true;
                    break;
                }
            }
        } while (!done);
    }

    private async _isUniqueName(name: string): Promise<boolean> {
        let ui: number;
        let uop: LoadedPlayerRecord;
        const plen = this.player.playerLength();

        for (ui = 0; ui < plen; ui += 1) {
            if (ui !== this.player.Record) {
                const lookupPlayer = this.player.playerGet(ui);
                if (!lookupPlayer) continue;
                uop = lookupPlayer;
                if (name === dispStr(uop.name).trim()) {
                    await this.io.sln();
                    this.io.foreground(2);
                    await this.io.lln("`2You recall hearing that another warrior currently goes by that name.  Not wanting to dishonor " + uop.name + "`2 you decide to pick another.");
                    await this.io.sln();
                    return false;
                }
            }
        }
        return true;
    }

    private async _showBartenderMenu(): Promise<void> {
        if (this.player.level > 11) {
            if (this.rip) await this.io.showRip(this.player.sex === "M" ? "BT1" : "BT1F");
            else await this.io.showTxt(this.player.sex === "M" ? "BT1" : "BT1F");
        }
        if (this.player.level < 12) {
            if (this.rip) await this.io.showRip(this.player.sex === "M" ? "BT" : "BTF");
            else await this.io.showTxt(this.player.sex === "M" ? "BT" : "BTF");
        }
    }

    private async _handleBuyGems(): Promise<void> {
        await this.io.sln();
        this.io.foreground(5);
        await this.io.lln('"You have `%Gems`5, eh?  I\'ll give ya a pint of magic elixir for two."');
        this.io.foreground(2);
        await this.io.lw('Buy how many elixirs?  [`0' + prettyInt(this.player.gem / 2) + '`2] : ', 2);
        this.io.foreground(15);
        this.io.flush();
        const gemDefault = parseInt(String(this.player.gem / 2), 10).toString();
        this.io.emitPrompt('buy_elixirs', [], 'number', gemDefault);
        let ch = await this.io.getstr({ edit: this.modern ? '' : gemDefault, len: 10, integer: true });
        if (ch === undefined || ch === '') {
            ch = '0';
        }
        let i = parseInt(ch, 10);
        if (isNaN(i)) {
            i = 0;
        }
        if (i === 0) {
            this.io.foreground(5);
            await this.io.sln();
            await this.io.sln('"They are vary valuable, please reconsider it.."');
            return;
        }
        if (i > 2000000) {
            this.io.foreground(5);
            await this.io.sln();
            await this.io.sln('"Ha!  There isn\'t enough brew in all the world for that much!"');
            return;
        }
        if (this.player.gem / 2 < i) {
            await this.io.sln();
            this.io.foreground(5);
            await this.io.lln('"You don\'t have `%' + prettyInt(i * 2) + ' `5Gems.  Find some..."');
            return;
        }
        if (i < 0) {
            await this.io.sln();
            this.io.foreground(5);
            await this.io.sln('"Ha.. Like I\'m really gonna give you a negetive amount, idiot."');
            return;
        }
        this.player.gem -= i * 2;
        this.io.foreground(2);
        if (this.rip) await this.io.showRip('ELIXIR');
        await this.io.sln();
        let desc: string;
        if (i === 1) {
            desc = 'small cup';
        } else if (i <= 5) {
            desc = 'steaming mug';
        } else if (i <= 9) {
            desc = 'huge tankard';
        } else {
            desc = 'keg \'o brew';
        }
        this.io.foreground(2);
        if (!this.rip && !this.modern) {
            await this.io.sln('The bartender retrieves a ' + desc + ' from the back room.');
            await this.io.sln('Before you drink it, what do you wish for?');
        } else {
            await this.io.sln('The bartender retrieves a steaming tankard. ');
        }
        await this.io.sln();
        await this.io.lln('`2(`0H`2)it Points');
        await this.io.lln('`2(`%S`2)trength');
        await this.io.lln('`2(`#V`2)itality');
        ch = await this.io.commandPrompt('brew_menu', [
            { key: 'H', label: 'Hit Points' },
            { key: 'S', label: 'Strength' },
            { key: 'V', label: 'Vitality' },
        ], false);
        if ('HSV'.indexOf(ch) === -1) {
            ch = 'V';
        }
        await this.io.sln(ch, 0);
        this.io.foreground(15);
        await this.io.sln();
        switch (ch) {
            case 'H':
                await this.io.sln('YOU DRINK THE BREW AND FEEL REFRESHED!');
                await this.io.sln();
                this.battle.addHp(i);
                break;
            case 'V':
                await this.io.sln('YOU DRINK THE BREW AND YOUR SOUL REJOICES!');
                await this.io.sln();
                this.battle.addDef(i);
                break;
            case 'S':
                await this.io.sln('YOU DRINK THE BREW AND FEEL STRONGER!');
                await this.io.sln();
                this.battle.addStr(i);
                break;
        }
        if (this.rip || this.modern) {
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            await this._showBartenderMenu();
        }
    }

    private async _handleChangeName(): Promise<void> {
        const classNames: string[] = ["lazy", "warrior", "mystical skills user", "thief"];

        await this.io.sln();
        this.io.foreground(5);
        await this.io.sln('"Ya wanna change your name, eh?  Yeah..');
        await this.io.lln("" + this.player.name + " `5the " + classNames[this.player.clss] + " does sound kinda funny..");
        this.io.sw("it would cost ya " + prettyInt(this.player.level * 500) + ' gold... Deal?"', 2);
        await this.io.lw("`2Change your name?  [`0N`2] : ", 2);
        this.io.emitPrompt('name_change_confirm', [
            { key: 'Y', label: 'Yes' },
            { key: 'N', label: 'No' },
        ]);
        let ch = (await this.io.getkey()).toUpperCase();
        if (ch !== "Y") {
            ch = "N";
        }
        await this.io.sln(ch, 0);
        if (ch !== "Y") {
            this.io.foreground(5);
            await this.io.sln('"Fine.. Keep your stupid name.. See if I care.."');
            return;
        }
        await this.io.sln();
        if (this.player.gold < 500 * this.player.level) {
            this.io.foreground(4);
            await this.io.sln();
            await this.io.sln('"Hey!  You stupid fool! You don\'t have that much gold!"');
            await this.io.sln();
            if (this.rip || this.modern) await this._showBartenderMenu();
            return;
        }
        this.player.gold -= 500 * this.player.level;

        let nname: string;
        while (true) {
            this.io.foreground(5);
            await this.io.sln('"What would you like as an alias?" ');
            this.io.foreground(2);
            this.io.sw("NAME: ", 2);
            nname = await this.io.getstr({ len: 50 });
            await this.io.sln();
            nname = nname.trim();
            nname = cleanStr(nname);
            const tmp = dispStr(nname).trim();
            if (nname.length > 18) {
                this.io.foreground(4);
                await this.io.sln('"Try a shorter name ya stupid, ugly troll!"');
                await this.io.sln();
            } else if (nname.length < 3) {
                this.io.foreground(4);
                await this.io.sln("Try a longer name, bonehead!");
                await this.io.sln();
            } else if (tmp.length < 3) {
                this.io.foreground(4);
                await this.io.sln("You think yer pretty damn smart, don't ya.  Ha!");
                await this.io.sln();
            } else if (await this._isUniqueName(tmp) && await this.player.checkName(tmp)) {
                await this.io.lw('`5"' + nname + "`5?  That's kinda flaky, you sure?\"  `2[`0Y`2] : `%", 2);
                this.io.emitPrompt('new_name_confirm', [
                    { key: 'Y', label: 'Yes' },
                    { key: 'N', label: 'No' },
                ]);
                ch = (await this.io.getkey()).toUpperCase();
                if (ch !== "N") {
                    ch = "Y";
                }
                await this.io.sln(ch, 0);
                if (ch === "Y") {
                    break;
                }
                await this.io.sln();
            }
        }
        // DIFF: This did not happen previously,
        // so people could steal the heros name
        // and write in the dirt.
        await this.state.getState(true);
        if (this.state.latesthero === this.player.name) {
            this.state.latesthero = nname;
        }
        this.state.putState();
        this.player.name = nname;
        await this.io.sln();
        await this.io.sln();
        await this.io.lln('`%"Done!  You are now ' + this.player.name + '`%!"');
        await this.io.sln();
        await this.io.more();
    }

    private async _handleBribeBartender(): Promise<boolean> {
        this.io.foreground(5);
        await this.io.sln();
        await this.io.sln('"Ahh.. Bribe.. Now you are speaking my language friend! I will let you borrow my room keys.. on one condition..');
        this.io.sw("That ya pay me " + prettyInt(this.player.level * 1600) + ' gold!!"', 2);
        const ch = await this.io.prompt(
            "   `2Deal?  [`0N`2] : `%",
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'bribe_confirm',
            { defaultKey: 'N', leadingBlank: false, trailingBlank: false }
        );
        if (ch === "N") {
            await this.io.sln();
            this.io.foreground(5);
            await this.io.sln('"Fine.. Forget I offered that deal to you.."');
            return false;
        }
        await this.io.sln();
        await this.io.sln();
        if (this.player.gold < 800 * (this.player.level * 2)) {
            this.io.foreground(4);
            await this.io.sln('"Hey! You slobbering idiot! You don\'t have that much gold!"');
            return false;
        }
        this.player.gold -= 800 * (this.player.level * 2);
        await this.attackInInn();
        return this.player.dead;
    }

    async talkWithBartender(): Promise<void> {
        let done: boolean = false;
        let ch: string;

        if (this.rip && this.player.level == 1) {
            await this.io.showRip("BARMAD");
            return;
        }
        if (!this.rip && !this.modern) {
            await this.io.sln();
            await this.io.sln();
            this.io.foreground(2);
            await this.io.sln("You find the bartender and ask if he will talk privately with you.");
            await this.io.sln();

            if (this.player.level === 1) {
                this.io.foreground(5);
                await this.io.lln("\"I don't recall ever hearing the name `0" + this.player.name + '`5 before!  Get outta my face!"');
                this.io.foreground(2);
                await this.io.sln();
                return;
            }
        }

        await this._showBartenderMenu();

        do {
            this.io.foreground(5);
            await this.io.sln();
            this.io.sw('"Well?"', 2);
            if (!this.modern) {
                await this.io.lln("The bartender inquires.  (`0? for menu`2)", 1);
            } else {
                await this.io.lln("The bartender inquires.", 1);
            }
            const bartenderOpts: PromptOption[] = [
                { key: 'C', label: 'Change your name' },
                { key: 'G', label: 'Gems' },
                { key: 'B', label: 'Bribe' },
            ];
            if (this.player.sex === 'M') bartenderOpts.push({ key: 'V', label: 'See Violet' });
            if (this.player.sex === 'F') bartenderOpts.push({ key: 'S', label: 'Seth Able The Bard' });
            if (this.player.level === 12) bartenderOpts.push({ key: 'D', label: 'Dragon' });
            bartenderOpts.push({ key: 'R', label: 'Return' }, { key: '?', label: 'Menu' });
            ch = await this.io.commandPrompt('bartender_menu', bartenderOpts, false);
            if (ch === "\r") {
                ch = "R";
            }
            if (!this.rip && !this.modern) {
                await this.io.sln(ch, 0);
            }
            switch (ch) {
                case "?":
                    await this._showBartenderMenu();
                    break;
                case "R":
                case "Q":
                    done = true;
                    break;
                case "V":
                    if (this.player.sex === "M") {
                        await this.io.sln();
                        this.io.foreground(5);
                        await this.io.lln("\"Ya want to know about `#Violet`5 do ya?  She is every warrior's wet dream...But forget it, Lad, she only goes for the type of guy who would help old people...\"");
                    }
                    break;
                case "S":
                    if (this.player.sex === "F") {
                        await this.io.sln();
                        this.io.foreground(5);
                        await this.io.lln('"Ya want to know about `%Seth Able`5 the Bard, eh?  Well... He has a good voice, and can really play that mandolin.  I don\'t think he would go for your type tho,  he likes he type of girl that would help an old man or something... A lot of Charm is is what you would need.  However, I could sure go for your type Har har har!"');
                    }
                    break;
                case "G":
                    await this._handleBuyGems();
                    break;
                case "C":
                    await this._handleChangeName();
                    break;
                case "B":
                    if (await this._handleBribeBartender()) {
                        done = true;
                    }
                    break;
                case "D":
                    if (this.player.level === 12) {
                        this.io.foreground(5);
                        await this.io.sln();
                        await this.io.sln('"Ahhh...If anyone could kill that Dragon, it would be you.. I have heard rumors that strange noises have been heard in the forest... You might try (');
                        await this.io.lw("`2S`5");
                        await this.io.sln(')earching the forest...My son did," and never came back.', 0);
                        await this.io.sln();
                        await this.io.moreNoMail();
                    }
                    break;
            }
        } while (!done);

        await this.io.sln();
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    private async initBar(darkhorse: boolean): Promise<void> {
        const bfnames: string[] = ["START1", "START2", "START3", "START4", "START5"];
        const convName = darkhorse ? "darkbar" : "bar";

        if (!this.storage.hasConversation(convName)) {
            if (darkhorse) {
                this.storage.initConversation(convName, this.fileUtils.runtimeOrData("DSTART"));
            } else {
                this.storage.initConversation(convName, this.fileUtils.runtimeOrData(bfnames[random(bfnames.length)]));
            }
        }
    }

    async converse(darkhorse: boolean): Promise<void> {
        let l: string | null;
        const convName = darkhorse ? "darkbar" : "bar";
        let ch: string;

        if (this.rip) await this.io.showRip("BARTALK");
        await this.initBar(darkhorse);
        this.io.sclrscr();
        if (!this.rip && !this.modern) {
            await this.io.lln("`%Conversation at the Bar`#");
            await this.io.lln("`l", 0);
        }
        const all = this.storage.getConversationLines(convName);
        for (const li of all) {
            await this.io.lln(li);
        }
        if (!this.rip && !this.modern) {
            await this.io.sln();
            await this.io.lw("`2(`5C`2)ontinue  (`5A`2)dd to Conversation `0[`5C`0] : ", 2);
        }
        this.io.emitPrompt('converse_menu', [
            { key: 'C', label: 'Continue' },
            { key: 'A', label: 'Add to Conversation' },
        ]);
        ch = (await this.io.getkey()).toUpperCase();
        if (ch !== "A") {
            ch = "C";
        }
        if (this.rip || this.modern) await this.io.sln();
        else await this.io.sln(ch, 0);
        if (ch === "A") {
            await this.io.sln();
            this.io.foreground(2);
            await this.io.sln("Share your feelings now.. (Max 75 char!)", 1);
            await this.io.sln("Max", 71);
            await this.io.sln("^", 73);
            await this.io.lw(" `0>`2");
            this.io.emitPrompt('converse_add', [], 'text');
            l = cleanStr(await this.io.getstr());
            if (l.length < 2) {
                await this.io.sln("You decide not to speak..You really don't have anything to say.");
                await this.io.sln("(ENTRY NOT ENTERED)");
                return;
            }
            if (l.length > 75) {
                await this.io.sln("You talk so long, that it bores the other warriors!");
                await this.io.sln("(ENTRY NOT ENTERED)");
                return;
            }
            this.storage.appendConversation(convName, [
                "  `%" + this.player.name + ":",
                "  `2" + l,
            ], 18);

            if (!darkhorse) {
                await this.state.getState(true);
                this.state.last_bar = this.player.Record;
                this.state.putState();
            }
        }
    }

    async run(): Promise<number> {
        let ch: string;
        let ret: number = 0;
        let done: boolean = false;
        let justArrived: boolean = true;

        const menu = async (): Promise<void> => {
            if (!this.player.expert) {
                if (this.rip) {
                    await this.io.showRip("RDI"); // RDI is an ANSI file; RDIF is lordtext (female variant).
                    if (justArrived) {
                        await this.io.showRip(this.player.sex === "M" ? "HIS~INN" : "HER~INN");
                        justArrived = false;
                        this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                        await this.io.getkey();
                    }
                    await this.io.showRip(this.player.sex === "M" ? "HIS~MENU" : "HER~MENU");
                } else if (this.modern) {
                    // no-op: modern mode doesn't show RIP graphics
                } else await this.io.showTxt(this.player.sex === "M" ? "RDI" : "RDIF"); // RDI is ANSI, RDIF is the lordtext female variant.
            }
        };

        this.io.foreground(5);
        await this.io.sln();
        this.player.inn = false;
        this.io.sclrscr();
        await menu();

        do {
            await this.mail.checkMail();
            this.io.foreground(5);
            if (!this.rip && !this.modern) {
                await this.io.sln();
                await this.io.lln("The Red Dragon Inn   `8(? for menu)");
                await this.io.sln("(C,D,F,T,G,V,H,M,R)");
            }
            ch = await this.io.commandPrompt('inn_menu', [
                { key: 'C', label: 'Converse' },
                { key: 'D', label: 'Daily News' },
                { key: 'F', label: 'Flirt' },
                { key: 'T', label: 'Talk to Bartender' },
                { key: 'G', label: 'Get a Room' },
                { key: 'V', label: 'View Stats' },
                { key: 'H', label: 'Hear Seth Able' },
                { key: 'M', label: 'Make Announcement' },
                { key: 'R', label: 'Return' },
            ]);
            switch (ch) {
                case "R":
                case "Q":
                case "\r":
                    done = true;
                    break;
                case "?":
                    await menu();
                    break;
                case "V":
                case "Y":
                    await this.io.showStats();
                    if (this.rip || this.modern) await menu();
                    break;
                case "W":
                    if (this.rip) await this.io.showRip("W3");
                    await this.mail.composeMail();
                    if (this.rip || this.modern) await menu();
                    break;
                case "G":
                    if (this.rip) await this.io.showRip("W5");
                    if (await this.getARoom()) {
                        ret = -1;
                        done = true;
                    }
                    if (this.rip || this.modern) await menu();
                    break;
                case "D":
                    await this.log.showLog();
                    await menu();
                    break;
                case "T":
                    await this.talkWithBartender();
                    if (this.rip && this.player.level == 1) {
                        this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                        await this.io.getkey();
                        await menu();
                    }
                    if (this.player.dead) {
                        done = true;
                    }
                    break;
                case "C":
                    await this.converse(false);
                    if (this.rip || this.modern) await menu();
                    break;
                case "H":
                    await this.bard.talkToBard();
                    if (this.rip || this.modern) await menu();
                    break;
                case "M":
                    if (this.rip) await this.io.showRip("W5");
                    await this.io.announce();
                    if (this.rip || this.modern) await menu();
                    break;
                case "F":
                    if ((await this.violet.flirtWithViolet()) && (this.rip || this.modern)) await menu();
                    break;
                case "1":
                    if (this.rip) await this.io.showRip("LEGS");
                    break;
                case "2":
                    if (this.rip) await this.io.showRip("GUITAR");
                    break;
            }
        } while (!done);
        // Run leave-inn event when actually leaving (not when renting a room)
        if (ret === 0) {
            await this.ldyManager.runLeaveInnEvent();
        }
        return ret;
    }
}

export default RedDragonInn;
