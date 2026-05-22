/**
 * Forest - The Forest location for LORD.
 *
 * Implements the daily combat loop where players fight level-appropriate
 * monsters, gain experience and gold, and encounter random events (Olivia,
 * the dragon's lair, Darkhorse Tavern, skill-leveling encounters, etc.).
 * Also serves as the entry point to the dragon fight.
 */
import { random, prettyInt, cleanStr } from '@lordts/util/Util';
import type FileUtils from '@lordts/util/FileUtils';
import Lazy from '@lordts/util/Lazy';
import type Battle from '../Battle';
import type Blackjack from './Blackjack';
import type Player from '../Player';
import type Healers from './Healers';
import type IO from '../io/IO';
import type Log from '../Log';
import type RedDragonInn from './RedDragonInn';
import type { Settings, MonsterStats, CastleStats, UiMode, Monster } from '../types';
import type DailyMaint from '../DailyMaint';
import type State from '../State';
import type { LdyManager } from '../lady/LdyManager';
import type { IStorage } from '@lordts/storage/IStorage';

// Forest event modules
import DarkhorseTavern from './forest/DarkhorseTavern';
import FindLostGold from './forest/FindLostGold';
import RescueThePrincess from './forest/RescueThePrincess';
import Olivia from './forest/Olivia';
import DeathKnightLevel from './forest/DeathKnightLevel';
import MysticalLevel from './forest/MysticalLevel';
import ThiefLevel from './forest/ThiefLevel';
import FlowerGarden from './forest/FlowerGarden';
import AttackDragon from './forest/AttackDragon';
import { GameExitError } from '../GameExitError';

class Forest {
    /** Current keypress captured in the forest menu loop. */
    private ch: string | undefined;
    /** Set to true to break out of the daily forest combat loop. */
    private over: boolean;
    /** Local line counter passed to paging routines within forest encounters. */
    private curlinenum: number;
    /** The monster currently engaged in combat for the active encounter. */
    private enemy: MonsterStats | undefined;

    constructor(
        public io: IO,
        public state: State,
        public fileUtils: FileUtils,
        public settings: Settings,
        private _player: Lazy<Player>,
        private _log: Lazy<Log>,
        private _battle: Lazy<Battle>,
        private _dailyMaint: Lazy<DailyMaint>,
        private _blackjack: Lazy<Blackjack>,
        private _healers: Lazy<Healers>,
        private _redDragonInn: Lazy<RedDragonInn>,
        private _ldyManager: Lazy<LdyManager>,
        private _uiMode: UiMode,
        public whichCastle: number,
        private monsterStats: MonsterStats[][],
        public castles: CastleStats[],
        private _storage: Lazy<IStorage>,
    ) {
        this.over = false;
        this.curlinenum = 1;
    }

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }
    get lastrip(): string { return this._uiMode.lastScreen; }
    get player(): Player { return this._player.value; }
    get log(): Log { return this._log.value; }
    get battle(): Battle { return this._battle.value; }
    get dailyMaint(): DailyMaint { return this._dailyMaint.value; }
    get blackjack(): Blackjack { return this._blackjack.value; }
    get healers(): Healers { return this._healers.value; }
    get redDragonInn(): RedDragonInn { return this._redDragonInn.value; }
    get ldyManager(): LdyManager { return this._ldyManager.value; }
    get storage(): IStorage { return this._storage.value; }

    // ── Event display helpers ───────────────────────────────────────────

    async eventHeader(draw: boolean): Promise<void> {
        if (draw && this.rip) await this.io.showRip("W1");
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("Event In The Forest");
        if (this.rip) await this.io.lln(this.io.divider(39, '`0'), 0);
        else await this.io.lln(this.io.divider(0, '`0'), 0);
        this.io.foreground(2);
    }

    async darkhorseTavern(): Promise<void> {
        this.io.events?.emitNavigation('enter', 'dark_horse_tavern');
        await new DarkhorseTavern(this.io, this._uiMode, this.player, this.state, this.settings, this.log, this.redDragonInn, this.blackjack).run();
        this.io.events?.emitNavigation('leave', 'dark_horse_tavern');
        this.io.events?.emitNavigation('enter', 'forest');
    }

    private async findLostGold(): Promise<void> {
        await new FindLostGold(this.io, this.player, this.storage).run();
    }

    private async rescueThePrincess(): Promise<void> {
        await new RescueThePrincess(
            this.io,
            this.player,
            this.settings,
            this.castles,
            this.log,
            this.dailyMaint,
            () => this.whichCastle,
            (v: number) => { this.whichCastle = v; },
        ).run();
    }

    async olivia(): Promise<void> {
        await new Olivia(this.io, this.player, this.settings, this.castles, this.log, this.dailyMaint, () => this.whichCastle, (v: number) => { this.whichCastle = v; }).run();
    }

    // ── Monster selection ─────────────────────────────────────────────

    loadMonster(num: number): Monster {
        const ret = {} as Monster;
        // Clone the monster template before beefUp() mutates combat stats so
        // later encounters still start from the pristine JSON baseline.
        Object.keys(this.monsterStats[num]).forEach((s) => {
            (ret as unknown as Record<string, unknown>)[s] = (this.monsterStats[num] as unknown as Record<string, unknown>)[s];
        });
        ret.is_forest = true;
        this.battle.beefUp(ret);
        return ret;
    }

    private saveForestGold(amt: number): void {
        // LORD only feeds a fraction of lost carried gold back into the forest
        // pool so random gold finds never grow as fast as player losses.
        amt = parseInt((amt / 15).toString(), 10);
        this.storage.addForestGold(amt);
    }

    private async handleEventDeath(): Promise<never> {
        this.player.exp -= parseInt((this.player.exp / 10).toString(), 10);
        if (this.player.exp < 0) this.player.exp = 0;
        this.saveForestGold(this.player.gold);
        this.player.gold = 0;
        this.player.on_now = false;
        this.player.put();
        await this.io.deadScreen({ name: null });
        if (this.rip) {
            await this.io.showRip("EXIT");
            this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
        throw new GameExitError();
    }

    private pickForestMonsterNumber(): number {
        if (this.player.level === 1) {
            return random(10);
        }

        // Most encounters stay in the player's current level bucket. A smaller
        // branch reaches back to an earlier bucket so the forest still mixes in
        // weaker monsters instead of being perfectly level-locked.
        if (random(6) !== 2) {
            return (this.player.level - 1) * 11 + random(10);
        }

        const minBucket = this.settings.forest_allow_level_one_monsters_above_level_one === false ? 1 : 0;
        return (minBucket + random(this.player.level - minBucket)) * 11 + random(10);
    }

    private async deathKnightLevel(): Promise<void> {
        await new DeathKnightLevel(this.io, this._uiMode, this.player, (param: boolean) => this.eventHeader(param)).run();
    }

    private async mysticalLevel(): Promise<void> {
        await new MysticalLevel(this.io, this._uiMode, this.player, (arg: boolean) => this.eventHeader(arg)).run();
    }

    private async thiefLevel(): Promise<void> {
        await new ThiefLevel(this.io, this._uiMode, this.player, (showTitle: boolean) => this.eventHeader(showTitle)).run();
    }

    private async flowerGarden(): Promise<void> {
        await new FlowerGarden(this.io, this.player, this.settings, this.fileUtils, this.storage).run();
    }

    private async runLdyForestEvent(): Promise<void> {
        this.io.events?.emitForest('event', { name: 'ldy' });
        if (this.rip) await this.io.showRip("W1");
        await this.ldyManager.runForestEvent();
    }

    private async fairyEvent(): Promise<void> {
        let ich: string;
        let tmp: number;

        this.io.events?.emitForest('fairy');
        if (this.rip) await this.io.showRip("W1");
        await this.io.showTxt("FAIRY");
        await this.io.more();
        this.io.sclrscr();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("YOU ARE NOTICED!");
        await this.io.sln();
        this.io.foreground(2);
        await this.io.lln('The small things encircle you.  A small wet female bangs your shin.  `0"How dare you spy on us, human!" `2you can\'t help but smile, the defiance in her silvery voice is truly a sight, you think to yourself.  Further contemplation is interrupted by another sharpfully painful prod.');
        await this.io.sln();
        await this.io.lln("`2(`0A`2)sk for a blessing");
        if (!this.player.has_fairy) {
            await this.io.lln("`2(`0T`2)ry to catch one to show your friends");
        }
        {
            const fairyOpts = [{ key: 'A', label: 'Ask for a blessing' }];
            if (!this.player.has_fairy) fairyOpts.push({ key: 'T', label: 'Try to catch one' });
            ich = await this.io.prompt(
                "  `0Your choice? [`2A`0] : `%",
                fairyOpts,
                'fairy_choice',
                { defaultKey: 'A', leadingBlank: true, trailingBlank: false }
            );
        }
        if (this.player.has_fairy && ich === "T") {
            ich = "A";
        }
        if (ich === "A") {
            await this.io.sln();
            await this.io.lln('`%"Bless me!" `2you implore the small figure.');
            await this.io.sln();
            await this.io.lln('`0"Very well." `2she agrees, `0"But we\'re still angry at you!');
            await this.io.sln();
            await this.io.lw("`0Your blessing is", 2);
            await this.io.mswait(500);
            this.io.sw(".");
            await this.io.mswait(500);
            this.io.sw(".");
            await this.io.mswait(500);
            this.io.sw(".");
            switch (random(3 + (this.player.horse ? 0 : 1))) {
                case 0:
                    this.io.sw("a kiss from ");
                    if (this.player.sex === "M") {
                        await this.io.sln("Teesha!", 0);
                    } else {
                        await this.io.sln("Nolmar!", 0);
                    }
                    await this.io.sln();
                    await this.io.moreNoMail();
                    this.io.foreground(2);
                    await this.io.sln("A fairy near her wordlessly upstretches its arms to you.");
                    await this.io.sln();
                    await this.io.lln("`%THE KISS IS STRANGELY FULFILLING! `2(You're refreshed)");
                    this.player.hp = this.player.hp_max;
                    await this.io.sln();
                    await this.io.moreNoMail();
                    break;
                case 1:
                    await this.io.sln('an incredibly sad story!"', 0);
                    await this.io.moreNoMail();
                    this.io.foreground(2);
                    await this.io.lln("The small body beckons you to lift her.  As you bring her closer, she begins to whisper.");
                    await this.io.sln();
                    await this.io.moreNoMail();
                    await this.io.sln("You almost immediately begin to cry.");
                    await this.io.sln();
                    await this.io.lln("`%YOUR TEARS TURNS INTO GEMS AND FALL INTO YOUR HANDS!");
                    await this.io.sln();
                    this.player.gem += 2;
                    if (this.player.gem > 32000) {
                        this.player.gem = 32000;
                    }
                    await this.io.moreNoMail();
                    break;
                case 2:
                    await this.io.sln('a forest melody!"', 0);
                    await this.io.moreNoMail();
                    this.io.foreground(2);
                    await this.io.lln("Immediately a small figure in the back raises her tiny reed flute to her lips and begins to play.");
                    await this.io.sln();
                    await this.io.moreNoMail();
                    await this.io.sln("The strange sounds send thousands of images to your mind.");
                    await this.io.sln();
                    this.io.foreground(15);
                    await this.io.sln("YOU LEARN FAIRY LORE");
                    tmp = this.player.exp;
                    this.player.exp += 10 * (this.player.level * this.player.level);
                    if (this.player.exp > 2000000000) {
                        this.player.exp = 2000000000;
                    }
                    tmp = this.player.exp - tmp;
                    if (tmp > 0) {
                        await this.io.lln("- AND GET " + prettyInt(tmp) + " EXPERIENCE!", 1);
                    }
                    this.player.fairy_lore = true;
                    await this.io.sln();
                    await this.io.moreNoMail();
                    await this.dailyMaint.tournamentCheck();
                    break;
                case 3:
                    await this.io.sln('a companion for your travels!"', 0);
                    await this.io.sln();
                    await this.io.moreNoMail();
                    this.io.foreground(2);
                    if (random(2) === 1) {
                        await this.io.sln("A shiny black stallion surfaces its head in the lake!");
                    } else {
                        await this.io.sln("A pure white mare nudges your back!");
                    }
                    await this.io.sln();
                    this.io.foreground(15);
                    await this.io.sln("YOU FEEL THE DAY GROW LONGER.");
                    this.player.forest_fights = parseInt((this.player.forest_fights * 1.25).toString(), 10);
                    this.player.horse = true;
                    await this.io.sln();
                    await this.io.moreNoMail();
                    break;
            }
        } else if (!this.player.has_fairy) {
            await this.io.sln();
            this.io.foreground(15);
            await this.io.sln("YOU MAKE A WILD GRAB FOR THE SMALL FIGURES!");
            await this.io.sln();
            await this.io.moreNoMail();
            this.io.foreground(2);
            this.io.sw("Your hand finally connects with", 2);
            await this.io.mswait(500);
            this.io.sw(".");
            await this.io.mswait(500);
            this.io.sw(".");
            await this.io.mswait(500);
            this.io.sw(".");
            await this.io.mswait(500);
            this.io.sw(".");
            if (random(2) === 1) {
                await this.io.lln("`4a thornberry bush`2!", 0);
                await this.io.sln();
                this.player.hp = 1;
                await this.io.moreNoMail();
                await this.io.lln("`4(HIT POINTS GO DOWN....WAAAAY DOWN)");
                await this.io.sln();
                await this.io.lln("`2The fairy leader laughs at you!  You slink away in defeat.");
                await this.io.sln();
                await this.io.moreNoMail();
            } else {
                this.io.foreground(15);
                await this.io.sln("A FAIRY!");
                await this.io.sln();
                this.player.has_fairy = true;
                this.io.foreground(2);
                await this.io.lln("`2You throw the screaming creature into your pouch.  What hidden powers could it have?");
                await this.io.sln();
                await this.io.sln("You think now would be splendid time to leave.");
                await this.io.sln();
                await this.io.moreNoMail();
            }
        }
    }

    private async creepyEvent(): Promise<void> {
        if (this.settings.olivia !== true) {
            return;
        }
        if (this.rip) await this.io.showRip("W1");
        await this.io.showTxt("CREEPY");
        this.io.emitPrompt('creepy_continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        await this.olivia();
    }

    private async darkhorseEncounter(): Promise<void> {
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("Event In The Forest");
        await this.io.lln(this.io.divider(0, '`0'), 0);
        this.io.foreground(2);
        await this.io.lln("In the gloom of the shady forest, you see smoke coming from a bright chimney.");
        await this.io.sln();
        await this.io.more();
        await this.darkhorseTavern();
    }

    async triggerGodEvent(eventName: string): Promise<void> {
        const normalized = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        switch (normalized) {
            case 'look':
            case 'random':
            case 'encounter':
                await this.lookToKill();
                return;
            case 'flower':
            case 'flower_garden':
            case 'garden':
                if (this.rip) await this.io.showRip("W5");
                await this.flowerGarden();
                break;
            case 'class':
            case 'class_event':
                switch (this.player.clss) {
                    case 1:
                        await this.deathKnightLevel();
                        break;
                    case 2:
                        await this.mysticalLevel();
                        break;
                    case 3:
                        await this.thiefLevel();
                        break;
                    default:
                        throw new Error('Class event requires clss to be 1, 2, or 3.');
                }
                break;
            case 'death_knight':
            case 'deathknight':
            case 'dk':
                await this.deathKnightLevel();
                break;
            case 'mystical':
            case 'mystical_level':
            case 'mage':
                await this.mysticalLevel();
                break;
            case 'thief':
            case 'thief_level':
                await this.thiefLevel();
                break;
            case 'fairy':
                await this.fairyEvent();
                break;
            case 'olivia':
            case 'creepy':
                await this.creepyEvent();
                break;
            case 'rescue':
            case 'rescue_the_princess':
            case 'princess':
                if (this.rip) await this.io.showRip("W1");
                await this.rescueThePrincess();
                break;
            case 'find_lost_gold':
            case 'lost_gold':
            case 'gold':
                if (this.rip) await this.io.showRip("W1");
                await this.findLostGold();
                break;
            case 'darkhorse':
            case 'dark_horse':
            case 'darkcloak':
            case 'tavern':
                await this.darkhorseEncounter();
                break;
            case 'ldy':
            case 'dispatcher':
                await this.runLdyForestEvent();
                break;
            default:
                throw new Error('Unknown forest event: ' + eventName);
        }

        if (this.player.dead) {
            await this.handleEventDeath();
        }
    }

    // ── Daily combat loop ─────────────────────────────────────────────

    private async lookToKill(): Promise<void> {
        let tmp: number;

        this.io.sclrscr();
        this.io.events?.emitForest('search');
        if (random(5) === 1) {
            const eventRoll = random(15 + (this.player.horse ? 1 : 0));
            this.io.events?.emitForest('event', {
                roll: eventRoll,
                forest_fights: this.player.forest_fights,
                exp: this.player.exp,
                level: this.player.level,
            });
            switch (eventRoll) {
                case 0:
                    if (random(2) === 1) {
                        if (this.rip) await this.io.showRip("W5"); // flower garden has Y/N prompt
                        await this.flowerGarden();
                    } else {
                        await this.runLdyForestEvent();
                    }
                    break;
                case 1:
                    switch (this.player.clss) {
                        case 1:
                            await this.deathKnightLevel();
                            break;
                        case 2:
                            await this.mysticalLevel();
                            break;
                        case 3:
                            await this.thiefLevel();
                            break;
                    }
                    break;
                case 2:
                        await this.fairyEvent();
                    break;
                case 3:
                    await this.creepyEvent();
                    break;
                case 4:
                    if (this.rip) await this.io.showRip("W1");
                    await this.rescueThePrincess();
                    break;
                case 5:
                    if (this.rip) await this.io.showRip("W1");
                    await this.findLostGold();
                    break;
                case 6:
                    break; // Intentional no-op: LORD v4 event 14 does nothing ("annoy the player").
                case 7:
                    // Dark Horse Tavern - only reachable with a horse (random(16) vs random(15))
                    if (this.player.horse) {
                        await this.darkhorseEncounter();
                    } else {
                        // No horse - slot acts as LDY event
                        await this.runLdyForestEvent();
                    }
                    break;
                default:
                    // LDY forest events - dispatched via lord.ldy master event
                    // table. lord.ldy picks a random event from its configured
                    // slots (official + 3rd-party) so sysops can customize
                    // runtime/lord.ldy to add, remove, or reweight events.
                    await this.runLdyForestEvent();
                    break;
            }
            if (this.player.dead) {
                await this.handleEventDeath();
            }
            return;
        }

        const mnum = this.pickForestMonsterNumber();
        const enemy = this.loadMonster(mnum);
        this.player.forest_fights -= 1;
        this.io.events?.emitCombatEncounter({
            name: enemy.name,
            hp: enemy.hp,
            str: enemy.str,
            weapon: enemy.weapon,
            image: enemy.image,
        });
        if (this.rip && this.lastrip != "FORFIGHT") await this.io.showRip("FORFIGHT");
        await this.io.sln();
        await this.io.sln();
        await this.io.lln("`2**`%FIGHT`2**");
        await this.io.sln();
        await this.io.lln("You have encountered " + enemy.name + "`2!!");
        await this.io.sln();
        await this.battle.fight(enemy, false, false);
        if (this.player.dead) {
            this.io.events?.emitCombatEnd('defeat', enemy.name);
            this.io.events?.emitPlayer('death', { killedBy: enemy.name });
            this.player.put();
            await this.battle.say(
                this.fileUtils.runtimeOrData("NORMSAY.DAT"),
                enemy,
                1,
                "`5" + this.player.name + " `2has been killed by `0" + enemy.name + "`2!",
                "",
            );
            this.saveForestGold(this.player.gold);
            this.player.gold = 0;
            this.player.exp = this.player.exp - parseInt((this.player.exp / 10).toString(), 10);
            this.player.on_now = false;
            this.player.put();
            await this.io.sln();
            await this.io.deadScreen(enemy);
            await this.io.sln();
            if (this.rip) {
                await this.io.showRip("EXIT");
                this.io.emitPrompt('rip_continue', [{ key: '\r', label: 'Continue' }]);
                await this.io.getkey();
            }
            throw new GameExitError();
        }
        if (enemy.hp < 1) {
            this.io.foreground(15);
            await this.io.sln();
            await this.io.lln("You have killed " + enemy.name + "`%!");
            await this.io.sln();
            this.io.foreground(2);
            if (enemy.gold > 0) {
                tmp = this.player.gold;
                this.player.gold += enemy.gold;
                if (this.player.gold > 2000000000) {
                    this.player.gold = 2000000000;
                }
                if (tmp === this.player.gold) {
                    await this.io.sln("You don't find any gold, but you do get");
                } else {
                    await this.io.lw("`2You receive `0" + prettyInt(this.player.gold - tmp) + " `2gold, and", 2);
                }
            } else {
                await this.io.sln("You don't find any gold, but you do get");
            }
            await this.io.lln("`0 " + prettyInt(enemy.exp) + "`2 experience!", 0);
            this.player.exp += enemy.exp;
            this.io.events?.emitCombatEnd('victory', enemy.name, enemy.gold, enemy.exp);
            if (this.player.exp > 2000000000) {
                this.player.exp = 2000000000;
                this.io.foreground(10);
                await this.io.sln("Wow, you have a LOT of experience!", 0);
            }
            await this.io.sln();
            await this.io.more();
            await this.dailyMaint.tournamentCheck();
        }
        if (this.rip && this.lastrip != "FORFIGHT") await this.io.showRip("FORFIGHT");
    }

    // ── Dragon's lair ──────────────────────────────────────────────────

    private async forestSpecial(): Promise<void> {

        if (this.rip) await this.io.showRip("W1");
        await this.io.lln("`c`%** WIERD EVENT **", 24);
        await this.io.lln(this.io.divider(0, '`2'), 0);
        await this.io.lln("`0You are heading into the forest, when you hear the voice of angels singing.");
        await this.io.lln("");
        await this.io.moreNoMail();
        await this.io.sln("You follow the sound for some time - when you are about to give up...");
        await this.io.lln("");
        await this.io.moreNoMail();
        await this.io.lw("`2You find.", 2);
        await this.io.mswait(40);
        this.io.sw(".");
        await this.io.mswait(40);
        this.io.sw(".");
        const g = random(this.player.level) + 1;
        await this.io.sln(g > 1 ? g + " Gems!" : "1 Gem!");
        await this.io.sln();
        this.player.gem += g;
        this.player.weird = false;
        await this.io.moreNoMail();
    }

    private async attackDragon(): Promise<void> {
        await new AttackDragon(this.io, this._uiMode, this.player, this.battle).run();
    }

    async menu(special?: boolean): Promise<void> {
        if (special === undefined) special = true;
        if (special && this.player.weird) {
            await this.forestSpecial();
        }
        if (!this.player.expert) {
            if (this.rip) await this.io.showRip("FOREST");
            else await this.io.showTxt("FOREST");
            this.io.foreground(2);
            await this.io.sln();
            if (this.rip) {
                await this.io.lln("`2(`0L`2)ook for something to kill");
                await this.io.lln("(`0H`2)ealer's Hut");
                await this.io.lln("`2(`0R`2)eturn to town");
            } else {
                await this.io.lln("`2(`0L`2)ook for something to kill       (`0H`2)ealer's Hut");
                await this.io.lw("`2(`0R`2)eturn to town                 ", 2);
            }
            if (this.player.horse) {
                await this.io.lln("`2(`0T`2)ake Horse To DarkCloak Tavern");
            } else {
                await this.io.sln();
            }
        }
    }

    async prompt(): Promise<void> {
        await this.io.sln();
        await this.io.lw("`2HitPoints: (`0" + prettyInt(this.player.hp) + "`2 of `0" + prettyInt(this.player.hp_max) + "`2)", 2);
        if (this.rip) await this.io.sln();
        await this.io.lw("Fights: `0" + prettyInt(this.player.forest_fights) + "`2 Gold: `0" + prettyInt(this.player.gold), 2);
        if (this.rip) await this.io.sln();
        await this.io.lw("`2Gems: `0" + prettyInt(this.player.gem), 2);
        await this.io.sln();
        if (!this.rip && !this.modern) {
            await this.io.lw("`5The Forest", 2);
            this.io.sw("(L,H,R,", 3);
            if (this.player.horse) {
                this.io.sw("T,");
            }
            await this.io.sln("Q)  (? for menu)", 0);
        }
        const opts = [
            { key: 'L', label: 'Look for Something to Kill' },
            { key: 'H', label: 'Healers Hut' },
            { key: 'R', label: 'Return to Town' },
        ];
        if (this.player.horse) {
            opts.push({ key: 'T', label: 'DarkCloak Tavern' });
        }
        this.io.emitPrompt('forest_menu', opts);
    }

    // ── Extracted run() helpers ──────────────────────────────────────────

    private async _handleDarkCloakRide(): Promise<void> {
        if (this.rip) await this.io.showRip("W1");
        await this.io.sln();
        await this.io.lln("`2You nudge your horse deeper into the woods.");
        await this.io.sln();
        await this.io.moreNoMail();
        await this.io.sln();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.sln("Event In The Forest");
        await this.io.lln(this.io.divider(0, '`0'), 0);
        this.io.foreground(2);
        await this.io.sln("In the gloom of the shady forest, you see smoke coming from a bright chimney.");
        await this.io.sln();
        await this.io.more();
        await this.darkhorseTavern();
    }

    private async _handleJennieSecret(): Promise<void> {
        if (!this.player.high_spirits) return;
        this.player.high_spirits = false;
        if (
            (await this.io.getkey()).toUpperCase() === "E" &&
            (await this.io.getkey()).toUpperCase() === "N" &&
            (await this.io.getkey()).toUpperCase() === "N" &&
            (await this.io.getkey()).toUpperCase() === "I" &&
            (await this.io.getkey()).toUpperCase() === "E"
        ) {
            await this.io.sln();
            await this.io.sln();
            await this.io.lln("`0Jennie?  Jennie Garth?");
            await this.io.lw("`2Define her. ", 2);
            const definition = cleanStr((await this.io.getstr({ x: 0, y: 0, len: 4, c: 1, c1: 15, edit: "" })).toUpperCase());
            this.curlinenum = 1;
            await this.io.sln();
            await this.io.sln();
            await this._handleJennieDefine(definition);
            await this.io.sln();
            await this.io.moreNoMail();
        }
    }

    private async _handleJennieDefine(definition: string): Promise<void> {
        switch (definition) {
            case "BABE":
                await this.io.lln("`0That is correct. `2(YOU RECIEVE AN EXTRA FOREST FIGHT!)");
                this.player.forest_fights += 1;
                if (this.player.forest_fights > 32000) {
                    this.player.forest_fights = 32000;
                }
                break;
            case "SEXY":
                await this.io.lln("`0Exellent. `2(YOU RECIEVE AN EXTRA USER FIGHT!)");
                this.player.pvp_fights += 1;
                if (this.player.pvp_fights > 32000) {
                    this.player.pvp_fights = 32000;
                }
                break;
            case "LADY":
                await this.io.lln("`0Very true.  `2(YOU GET SOME GOLD!)");
                this.player.gold += 1000 * this.player.level;
                if (this.player.gold > 2000000000) {
                    this.player.gold = 2000000000;
                }
                break;
            case "DUMB":
                await this.io.lln("`0You idiot.  You will `)never`0 be a useful member of society.");
                break;
            case "STAR":
                await this.io.lln("`0A huge star, infant.");
                await this.io.lln("`4(YOU GET NOTHING, YOU STATED THE OBVIOUS)");
                break;
            case "DUNG":
                await this._handleFrogTransformation();
                break;
            case "FOXY":
                await this.io.lln("`0Very wise. `%(YOU RECIEVE AN EXTRA GEM!)");
                this.player.gem += 1;
                if (this.player.gem > 32000) {
                    this.player.gem = 32000;
                }
                break;
            case "FAIR":
                await this.io.lln("`0Very fair. `2(YOU FEEL EXCITED!)");
                this.player.flirted = false;
                break;
            case "UGLY":
                this.player.on_now = false;
                this.player.put();
                await this.io.lln("`0You understand nothing.  `4(YOU ARE BITCH SLAPPED!)");
                this.player.hp = 1;
                await this.io.sln();
                await this.io.moreNoMail();
                this.player.on_now = false;
                throw new GameExitError();
                break; // For syncjslint...
            case "HOTT":
                await this.io.lln('`0"Hot" is spelled with only one T.. But good job, nonetheless.');
                await this.io.sln();
                this.player.hp = parseInt((this.player.hp_max + this.player.hp_max / 5).toString(), 10);
                if (this.player.hp > 32000) {
                    this.player.hp = 32000;
                }
                await this.io.lln("`%(YOU FEEL ENERGIZED!)");
                break;
            case "COOL":
                await this.io.lln("`0Why, you are cool to notice that.");
                await this.io.sln();
                if (this.player.hp < this.player.hp_max) {
                    await this.io.lln("`%GOD NOTICES YOU ARE WOUNDED AND PITIES YOU.  YOU LOOK BETTER!");
                    this.player.cha += 1;
                    if (this.player.cha > 32000) {
                        this.player.cha = 32000;
                    }
                }
                break;
            case "GIFT":
                await this._handleMagicalGift();
                break;
            // 'NICE' was only special in LORD versions prior to v4 – default handler is correct.
            default:
                if (this.player.sex === "M") {
                    await this.io.sln("You do not understand her, my son.");
                } else {
                    await this.io.sln("Perhaps if you were male you might understand better.");
                }
        }
    }

    private async _handleFrogTransformation(): Promise<void> {
        if (this.player.sex === "M") {
            await this.io.lln("`0You are a fool, sir.  `4(YOU ARE TURNED INTO A FROG)");
        } else {
            await this.io.lln("`0You are a fool, woman.  `4(YOU ARE TURNED INTO A FROG)");
        }
        await this.io.lln("");
        await this.io.moreNoMail();
        let ch: string;
        do {
            await this.io.lln("`c`2The Forest Floor");
            await this.io.sln();
            await this.io.lln("`2(`0H`2)op Like Crazy");
            await this.io.lln("`2(`0A`2)pologize");
            await this.io.sln();
            await this.io.lw("`2Your command, greeny? : `%", 2);
            this.io.emitPrompt('frog_menu', [
                { key: 'H', label: 'Hop Like Crazy' },
                { key: 'A', label: 'Apologize' },
            ]);
            ch = (await this.io.getkey()).toUpperCase();
            if (ch !== "A") {
                ch = "H";
            }
            await this.io.sln(ch, 0);
            if (ch !== "A") {
                this.io.foreground(2);
                await this.io.sln("You hop around like a crazy frog.  What is this accomplishing, pray tell?");
                await this.io.sln();
                await this.io.moreNoMail();
            }
        } while (ch !== "A");
        await this.io.sln();
        await this.io.lln("`2You apologize humbly, knowing what you did was wrong.");
        await this.io.lln("");
        await this.io.lln("`%(YOU ARE CHANGED BACK TO YOUR (MOSTLY) HUMAN FORM)");
    }

    private async _handleMagicalGift(): Promise<void> {
        await this.io.lln("`0Yes, she is this.  And now, a magical gift for you.");
        await this.io.sln();
        switch (this.player.clss) {
            case 2:
                if (this.player.skillm < 1 || this.player.magically_delicious) {
                    await this.io.lln("`%You are unable to accept the gift.");
                } else {
                    await this.io.lln("`5YOU FEEL MAGICALLY DELICIOUS.");
                    this.player.levelm = this.player.skillm;
                    this.player.magically_delicious = true;
                }
                break;
            case 1:
                if (this.player.skillw < 1 || this.player.magically_delicious) {
                    await this.io.lln("`%You are unable to accept the gift.");
                } else {
                    await this.io.lln("`5YOU FEEL MAGICALLY DELICIOUS.");
                    this.player.levelw = this.player.skillw;
                    this.player.magically_delicious = true;
                }
                break;
            case 3:
                if (this.player.skillt < 1 || this.player.magically_delicious) {
                    await this.io.lln("`%You are unable to accept the gift.");
                } else {
                    await this.io.lln("`5YOU FEEL MAGICALLY DELICIOUS.");
                    this.player.levelt = this.player.skillt;
                    this.player.magically_delicious = true;
                }
                break;
        }
    }

    async run(): Promise<void> {
        let ch: string;
        let over = false;
        this.io.sclrscr();
        await this.menu();
        do {
            if (this.rip && this.lastrip != "FOREST") await this.io.showRip("FOREST");
            await this.prompt();
            ch = await this.io.commandPrompt(undefined, undefined, false);
            if (!this.rip && !this.modern && ch !== "J") {
                await this.io.sln(ch, 0);
            }
            switch (ch) {
                case "B":
                    if (this.player.gold > 0) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("You throw your gold pouch up into the air gleefully.");
                        await this.io.sln();
                        await this.io.lln("`0AN UGLY VULTURE `)GRABS `0IT IN MID AIR!");
                        this.player.bank += this.player.gold;
                        if (this.player.bank > 2000000000) {
                            this.player.bank = 2000000000;
                        }
                        this.player.gold = 0;
                    }
                    break;
                case "R":
                case "Q":
                case "\r":
                    over = true;
                    break;
                // DIFF: Removed explicit space handling...
                case "V":
                    await this.io.showStats();
                    break;
                case "1":
                    if (this.rip) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("The vulture eyes you warily.");
                        await this.io.sln();
                    }
                    break;
                case "2":
                    if (this.rip) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("Nice trunk.");
                        await this.io.sln();
                    }
                    break;
                case "3":
                    if (this.rip) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("Trying to get back to your roots?");
                        await this.io.sln();
                    }
                    break;
                case "L":
                    if (this.player.forest_fights < 1) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("You are too tired.");
                        await this.io.sln();
                        await this.io.sln("Try again tomorrow.");
                        await this.io.sln();
                        await this.io.more();
                    } else {
                        await this.lookToKill();
                        if (this.player.dead) {
                            over = true;
                        }
                    }
                    break;
                case "T":
                    if (this.player.horse) {
                        await this._handleDarkCloakRide();
                        this.io.sclrscr();
                        await this.menu();
                        break;
                    }
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("Your Thieving skills cannot help you here.");
                    await this.io.sln();
                    break;
                case "M":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("Your Mystical skills cannot help you here.");
                    await this.io.sln();
                    break;
                case "D":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("Your Death Knight skills cannot help you here.");
                    await this.io.sln();
                    break;
                case "A":
                    await this.io.sln();
                    await this.io.sln();
                    await this.io.sln("You brandish your weapon dramatically.");
                    await this.io.sln();
                    break;
                case "H":
                    await this.healers.run();
                    if (this.rip) await this.menu(false);
                    break;
                case "?":
                    if (this.player.expert) {
                        if (this.rip) await this.io.showRip("FOREST");
                        else await this.io.showTxt("FOREST");
                    }
                    await this.menu();
                    break;
                case "S":
                    if (this.player.level < 12) {
                        await this.io.showStats();
                    } else {
                        await this.attackDragon();
                        if (this.player.dead) {
                            over = true;
                            break;
                        }
                    }
                    this.io.sclrscr();
                    await this.menu();
                    break;
                case "J":
                    await this._handleJennieSecret();
                    break;
            }
        } while (!over);
    }
}

export default Forest;
