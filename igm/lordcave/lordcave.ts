/**
 * The L.O.R.D. Cavern v1.7 - LORD IGM
 * Ported from lordcave.exe (DOS, Borland Pascal 7.01)
 * Original by Jason Brown (1995-2000, 2002-2005)
 * Maintained by Donald Tidmore (2002-2005)
 * Ported to TypeScript by AI from EXE string extraction and documentation.
 *
 * A random-event IGM where players explore a cave and encounter
 * 14 different random events plus optional RHP (Random Happening Program)
 * scripts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { random } from '@lordts/util/Util';
import { preprocessAnsi80 } from '@lordts/util/ANSI';
import { cp437toUnicode } from '@lordts/util/CP437';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type Log from '@lordts/core/Log';
import type State from '@lordts/core/State';
import type { Settings } from '@lordts/core/types';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import { LordCave_Defs, DEFAULT_SEARCHES, DEFAULT_KIDS_PER_DAY, KID_LOSS_THRESHOLD } from './data';
import type { CaveRecord } from './data';
import { RhpEngine, RhpExit, RhpKill } from './rhp';
import {
    eventNothing, eventVoice, eventFall, eventBats,
    eventRiver,
    eventSkeleton, eventMonster, eventTrip, eventOliver,
    eventWarrior, eventTroll, eventRiddler, eventShinyRiver,
} from './events';

const IGM_VERSION = 'JS v1.7';

/**
 * Event probability table from decompiled v1.7 dispatch (FUN_1000_b82c).
 * Each entry: [cumulativeThreshold, eventId]
 */
const EVENT_TABLE: Array<[number, string]> = [
    [10, 'nothing'],      // 10%
    [30, 'rhp'],          // 20%
    [37, 'riddler'],      //  7%
    [44, 'troll'],        //  7%
    [50, 'voice'],        //  6%
    [57, 'fall'],         //  7%
    [63, 'bats'],         //  6%
    [70, 'river'],        //  7%
    [77, 'shinyriver'],   //  7%
    [83, 'skeleton'],     //  6%
    [89, 'monster'],      //  6%
    [94, 'trip'],         //  5%
    [97, 'oliver'],       //  3%
    [100, 'warrior'],     //  3%
];

class LordCavern {
    private io: IO;
    private player: Player;
    private log: Log;
    private state: State;
    private settings: Settings;
    private srcDir: string;
    private igmDir: string;
    private storage: IStorage;
    private caveFile: IRecordFile | null = null;
    private caveRecord: CaveRecord | null = null;
    private rhpFiles: string[] = [];
    private kidsPerDay: number = DEFAULT_KIDS_PER_DAY;
    private maxSearches: number = DEFAULT_SEARCHES;
    private wasKilled = false;
    private fairySaved = false;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.log = deps.log;
        this.state = deps.state;
        this.settings = deps.settings;
        this.srcDir = deps.srcDir + path.sep;
        this.igmDir = path.join(deps.runtimeDir, 'lordcave') + path.sep;
        this.storage = deps.storage;
    }

    static get desc(): string {
        return '`#T`5he `#L`5.`#O`5.`#R`5.`#D`5. `#C`5avern';
    }

    /** Daily maintenance: reset searches for all players */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDir = path.join(deps.runtimeDir, 'lordcave') + path.sep;
        if (!fs.existsSync(igmDir)) fs.mkdirSync(igmDir, { recursive: true });
        const cf = deps.storage.create(igmDir + 'lordcave.dat', LordCave_Defs);
        for (let i = 0; i < cf.length; i++) {
            const rec = cf.get(i) as unknown as CaveRecord;
            if (rec.day !== deps.state.days) {
                rec.day = deps.state.days;
                rec.searches = DEFAULT_SEARCHES;
                rec.adoptions = 0;
                rec.visits = 0;
                rec.was_killed = false;
                rec.fairy_saved = false;
                rec.put();
            }
        }
    }

    async run(): Promise<void> {
        if (!fs.existsSync(this.igmDir)) {
            fs.mkdirSync(this.igmDir, { recursive: true });
        }
        this.loadConfig();
        this.initRecord();
        await this.showIntro();
        await this.entranceMenu();
        await this.exitGame();
    }

    // ── Configuration ──

    private loadConfig(): void {
        // Discover any .RHP scripts shipped beside the source. The event table
        // can hand control to one of these scripts during a cave search.
        this.rhpFiles = [];
        if (fs.existsSync(this.srcDir)) {
            const files = fs.readdirSync(this.srcDir);
            for (const f of files) {
                if (f.toLowerCase().endsWith('.rhp')) {
                    this.rhpFiles.push(path.join(this.srcDir, f));
                }
            }
        }
    }

    // ── Record Management ──

    private initRecord(): void {
        this.caveFile = this.storage.create(
            this.igmDir + 'lordcave.dat', LordCave_Defs,
        );
        let found = false;
        for (let i = 0; i < this.caveFile.length; i++) {
            const rec = this.caveFile.get(i) as unknown as CaveRecord;
            if (rec.lrdrecord === this.player.Record) {
                this.caveRecord = rec;
                found = true;
                break;
            }
        }
        if (!found) {
            this.caveRecord = this.caveFile.new() as unknown as CaveRecord;
            this.caveRecord.lrdrecord = this.player.Record;
            this.caveRecord.day = this.state.days;
            this.caveRecord.searches = this.maxSearches;
            this.caveRecord.adoptions = 0;
            this.caveRecord.visits = 0;
            this.caveRecord.was_killed = false;
            this.caveRecord.fairy_saved = false;
            this.caveRecord.put();
        }
        // Daily reset is duplicated here so maintenance is not required before
        // the first player visit of a new game day.
        if (this.caveRecord!.day !== this.state.days) {
            this.caveRecord!.day = this.state.days;
            this.caveRecord!.searches = this.maxSearches;
            this.caveRecord!.adoptions = 0;
            this.caveRecord!.visits = 0;
            this.caveRecord!.was_killed = false;
            this.caveRecord!.fairy_saved = false;
            this.caveRecord!.put();
        }
        this.caveRecord!.visits++;
        this.caveRecord!.put();
    }

    private get record(): CaveRecord {
        if (!this.caveRecord) throw new Error('Cave record not initialized');
        return this.caveRecord;
    }

    // ── Display ──

    private async showIntro(): Promise<void> {
        this.io.sclrscr();
        // Show ANSI art title if available.
        // We bypass displayFilePaged and preprocess the art to insert explicit
        // \r\n at every 80-column boundary so it renders correctly on terminals
        // that are wider than 80 characters.
        const ansFile = path.join(this.srcDir, 'lordcave.ans');
        if (fs.existsSync(ansFile)) {
            const raw = cp437toUnicode(fs.readFileSync(ansFile, 'latin1'));
            for (const line of preprocessAnsi80(raw)) {
                await this.io.lw(line);
                await this.io.sln();
            }
            await this.pressAKey();
        }
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`#T`5he `#L`5.`#O`5.`#R`5.`#D`5. `#C`5avern`%`!');
        await this.io.sln();
        await this.io.lln('`!By `#Jason Brown, `!1995-2000, 2002-2005', 5);
        await this.io.lln('`!Ported to JS: `0' + IGM_VERSION, 5);
        await this.io.sln();
        await this.io.lln('`!Graciously run by: `#' + (this.settings.system_name || 'The Sysop') + '`0', 5);
        await this.io.sln();
        await this.pressAKey();
    }

    private async showStats(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`%' + this.player.name + '`%\'s Stats...');
        await this.io.lln('`l');
        const p = this.player;
        const pad = (v: number | string) => String(v).padEnd(21);
        await this.io.lln('`0Experience    `!: `%' + pad(p.exp) + '`0Cave Searches      `!: `%' + this.record.searches);
        await this.io.lln('`0Level         `!: `%' + pad(p.level) + '`0HitPoints          `!: `%' + p.hp + ' `0of `%' + p.hp_max);
        await this.io.lln('`0Forest Fights `!: `%' + pad(p.forest_fights) + '`0Player Fights Left `!: `%' + p.pvp_fights);
        await this.io.lln('`0Gold in Hand  `!: `%' + pad(p.gold) + '`0Gold in Bank       `!: `%' + p.bank);
        await this.io.lln('`0Weapon  [`%' + p.weapon_num + '`0]   `!: `%' + p.weapon);
        await this.io.lln('`0Armour  [`%' + p.arm_num + '`0]   `!: `%' + p.arm);
        await this.io.lln('`0Charm         `!: `%' + pad(p.cha) + '`0Gems               `!: `%' + p.gem);
        await this.io.lln('`0Children      `!: `%' + pad(p.kids) + '`0Adoptions Today    `!: `%' + this.record.adoptions);
        await this.io.lln('`l');
        await this.pressAKey();
    }

    // ── Menus ──

    private async entranceMenu(): Promise<void> {
        // Check if already out of searches
        if (this.record.searches <= 0) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`$------------------------------------------------ ');
            await this.io.lln('`#You\'re too tired to search the `@Cavern `@any more today.');
            await this.io.lln('`!Mozie on home, and get some `0shut-eye.', 4);
            await this.pressAKey();
            return;
        }

        let done = false;
        while (!done) {
            this.io.sclrscr();
            await this.io.sln();
            // Center the 32-char-wide text box + 12-col left offset = 44 total width
            const caveIndent = Math.max(0, Math.floor((this.io.cols - 44) / 2));
            await this.io.lln('`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=', caveIndent);
            await this.io.lln('`2You find the entrance to the   ', caveIndent + 1);
            await this.io.lln('`2Cavern.  `3It is dark and empty. ', caveIndent + 1);
            await this.io.lln('`2A skeleton lies in front of    ', caveIndent + 1);
            await this.io.lln('`2it, pointing away, as if       ', caveIndent + 1);
            await this.io.lln('`2warning you to leave `6...     ', caveIndent + 1);
            await this.io.sln();
            await this.io.lln('`2(`#C`2)`%ontinue inside', caveIndent + 1);
            await this.io.lln('`2(`#V`2)`%iew your `@LORD `%Stats', caveIndent + 1);
            await this.io.lln('`2(`#R`2)`%eturn to town', caveIndent + 1);
            await this.io.sln();
            await this.io.lw('`#Your choice, `%' + this.player.name + '`2? `0', caveIndent + 1);

            this.io.emitPrompt('lordcave_cavern_entrance', [
                { key: 'C', label: 'Continue inside' },
                { key: 'V', label: 'View Stats' },
                { key: 'R', label: 'Return to town' },
            ]);
            let ch: string;
            do { ch = (await this.io.getkey()).toUpperCase(); } while ('CVR'.indexOf(ch) === -1);
            await this.io.sln(ch);

            switch (ch) {
            case 'C':
                await this.insideCavern();
                if (this.wasKilled) return;
                done = this.record.searches <= 0;
                break;
            case 'V':
                await this.showStats();
                break;
            case 'R':
                done = true;
                break;
            }
        }
    }

    private async insideCavern(): Promise<void> {
        await this.io.lln('`0Y`2ou begin the hike to the `#C`5ave `6...');
        await this.io.mswait(500);

        let done = false;
        while (!done && !this.wasKilled) {
            this.io.sclrscr();
            await this.io.sln();
            await this.io.lln('`@I`3nside `@T`3he `@C`3avern', 7);
            await this.io.lw('  `3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-');
            await this.io.lln('`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-`!=`3-');
            await this.io.lln('`7You light your torch.  You can see many tunnels ahead of');
            await this.io.lln('`7you.  There\'s possibly more here than meets the eye ...');
            await this.io.sln();
            await this.io.lln('`%(`0S`%)`!earch down a Tunnel');
            await this.io.lln('`%(`0V`%)`!iew your Stats');
            await this.io.lln('`%(`0R`%)`!un back to Town');
            await this.io.sln();
            await this.io.lw('         `%Your choice, `@' + this.player.name + '`%? `#');

            this.io.emitPrompt('lordcave_inside_cavern', [
                { key: 'S', label: 'Search Tunnel' },
                { key: 'V', label: 'View Stats' },
                { key: 'R', label: 'Run back to Town' },
            ]);
            let ch: string;
            do { ch = (await this.io.getkey()).toUpperCase(); } while ('SVR'.indexOf(ch) === -1);
            await this.io.sln(ch);

            switch (ch) {
            case 'S':
                done = await this._searchTunnel();
                if (this.wasKilled) return;
                break;
            case 'V':
                await this.showStats();
                break;
            case 'R':
                done = true;
                break;
            }
        }
    }

    private async _searchTunnel(): Promise<boolean> {
        if (this.record.searches <= 0) {
            await this.io.sln();
            await this.io.lln('`%You feel tired.  You decide to leave this strange place.');
            await this.io.lln('`0You think about returning tomorrow `6...', 4);
            await this.io.lln('`!You wonder what treasures remain undiscovered inside `6...');
            await this.pressAKey();
            return true;
        }
        this.record.searches--;
        this.record.put();
        await this.doRandomEvent();
        if (this.wasKilled) return true;
        return this.record.searches <= 0;
    }

    // ── Random Event Dispatcher ──

    private async doRandomEvent(): Promise<void> {
        const roll = random(100) + 1;
        let eventId = 'nothing';
        // EVENT_TABLE stores cumulative probability thresholds. The first row
        // whose threshold meets the roll selects the cave event.
        for (const [threshold, id] of EVENT_TABLE) {
            if (roll <= threshold) {
                eventId = id;
                break;
            }
        }

        // If RHP was selected but no scripts exist, reroll only inside the
        // non-RHP portion of the table so the missing-script branch never acts
        // like a free extra chance at the common low-threshold events.
        if (eventId === 'rhp' && this.rhpFiles.length === 0) {
            const reroll = random(70) + 31;
            eventId = 'nothing';
            for (const [threshold, id] of EVENT_TABLE) {
                if (reroll <= threshold) {
                    eventId = id;
                    break;
                }
            }
        }

        try {
            switch (eventId) {
            case 'nothing': await eventNothing(this.io); break;
            case 'voice': await eventVoice(this.io); break;
            case 'fall': await eventFall(this.io, this.player); break;
            case 'bats': await eventBats(this.io, this.player); break;
            case 'river': await eventRiver(this.io, this.player); break;
            case 'skeleton': await eventSkeleton(this.io, this.player, this.log); break;
            case 'monster': await eventMonster(this.io, this.player); break;
            case 'trip': await eventTrip(this.io, this.player); break;
            case 'oliver': await eventOliver(this.io, this.player, this.log, this.record, this.kidsPerDay); break;
            case 'warrior': await eventWarrior(this.io, this.player, this.log, this.settings); break;
            case 'troll': await eventTroll(this.io, this.player); break;
            case 'riddler': await eventRiddler(this.io, this.player); break;
            case 'rhp': await this.runRhpScript(); break;
            case 'shinyriver': await eventShinyRiver(this.io, this.player); break;
            default: await eventNothing(this.io); break;
            }
            // Non-RHP events get a pause here (RHP scripts handle their own <MoRE> prompt)
            if (eventId !== 'rhp') {
                await this.pressAKey();
            }
        } catch (e) {
            if (e instanceof RhpKill) {
                if (e.fairySave) {
                    this.fairySaved = true;
                } else {
                    this.wasKilled = true;
                    this.player.dead = true;
                    this.player.hp = 0;
                }
            } else if (e instanceof RhpExit) {
                // Normal RHP exit
            } else {
                throw e;
            }
        }

        // Check if player died from stat damage
        if (this.player.hp <= 0 && !this.wasKilled) {
            this.wasKilled = true;
            this.player.dead = true;
            this.player.hp = 0;
            await this.io.sln();
            await this.io.lln('`@Oops!  `#You collapsed, and hit your head on a rock.');
            await this.io.lln('`!You lie on the ground `!unconscious for awhile.', 4);
            await this.io.lln('`0A passer-by saw you there, and helped you out of the `@Cave,');
            await this.io.lln('`0where you awaken.  `0Fortunately, you didn\'t hurt yourself');
            await this.io.lln('`0too badly, and everything\'s fine.');
            await this.io.lln('`#Best of all, they didn\'t steal anything from you.', 4);
        }
    }

    // ── RHP Script Execution ──

    private async runRhpScript(): Promise<void> {
        if (this.rhpFiles.length === 0) {
            await eventNothing(this.io);
            return;
        }
        // Each RHP visit picks one discovered script at random, then syncs any
        // modified search count back into the persisted cave record.
        const scriptFile = this.rhpFiles[random(this.rhpFiles.length)];
        const engine = new RhpEngine(
            this.io, this.player, this.log, this.settings, this.record.searches,
        );
        await engine.executeFile(scriptFile);
        // Update searches from RHP (scripts can modify cave searches)
        this.record.searches = engine.searches;
        this.record.put();
    }

    // ── Exit ──

    private async exitGame(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();

        // Exit processing preserves the original order: kid loss first, then a
        // shared horse-or-fairy roll, then stats and any death/fairy messages.
        // Kid loss event (before horse/fairy, per original FUN_1000_14de)
        if (this.player.kids > KID_LOSS_THRESHOLD) {
            const kidRoll = random(100) + 1;
            if (kidRoll > 24) {
                await this.kidLossEvent();
            }
        }

        // Horse and Fairy events use a single roll (FUN_1000_0c9e)
        if (!this.wasKilled) {
            const exitRoll = random(100) + 1;
            if (exitRoll < 9) {
                await this.horseEvent();
            } else if (exitRoll > 89) {
                await this.fairyEvent();
            }
        }

        // Announce stats display then show them (FUN_1000_14de: lln 0x12ad + 3s delay + FUN_1d47_0375)
        await this.io.sln();
        await this.io.lln('`0Displaying your current `@LORD `!Stats `0in `$3 `0seconds.');
        await this.io.mswait(3000);
        await this.showStats();

        // Fairy rescue message - shown after stats if fairy saved player from death (flag 0x1b31)
        if (this.fairySaved) {
            await this.io.sln();
            await this.io.lln('`!As you are leaving the `@Cavern, `!you remember that you were ');
            await this.io.lln('`!rescued from the `@Grim Reaper\'s `!grasp by your `0Fairy.  `!You ');
            await this.io.lln('`!pause a moment to give thanks that you survived that adventure.');
            await this.io.sln();
            await this.pressAKey();
        }

        // Killed message - shown after stats if player was killed (flag 0x2d62)
        if (this.wasKilled) {
            await this.io.sln();
            await this.io.lln('`%You are an unlucky warrior!  You got `@KILLED `%during your visit`0! ');
            await this.io.lln('`%Perhaps you will have better luck tomorrow, adventuring in the `#Cavern. ');
            await this.log.logLine(
                '`$' + this.player.name +
                ' `2died in `#T`5he `#L`5.`#O`5.`#R`5.`#D`5. `#C`5avern`2.'
            );
            await this.io.sln();
            await this.io.mswait(3000);
        }

        // Final exit text (from FUN_265c_35cc: lln 0x3571 then lln 0x3594 then 2500ms delay)
        await this.io.sln();
        await this.io.lln('`!Returning to `@L.O.R.D. `!now.');
        await this.io.lln('`0Thanks for using `#The L.O.R.D. Cavern `0IGM today.');
        await this.io.sln();
        await this.io.mswait(2500);

        this.player.put();
        this.record.put();
        if (this.caveFile) this.caveFile.close();
    }

    private async horseEvent(): Promise<void> {
        await this.io.sln();
        await this.io.lln(',`#T`5he `#L`%.`#O`%.`#R`%.`#D`%. `#C`5avern.');
        await this.io.lln('#     `$SPECIAL CAVERN `#HORSE EVENT');
        await this.io.lln('`0====================================================');

        if (this.player.horse) {
            // Lose horse
            await this.io.lln('`%As you leave the `#Cavern, `%you see your `$Horse `%is:');
            await this.io.lln('`%eating grass in a meadow.  Suddenly, the ground starts');
            await this.io.lln('`%shaking as a small earth-quake occurs`@!');
            await this.io.lln('`6Your Horse becomes spooked, and it runs off into the `2Forest`@!', 4);
            await this.io.lln('`@Oops!  `%You just `@LOST `%your `$Horse`@!');
            this.player.horse = false;
            await this.log.logLine(
                '`$' + this.player.name + ' `%LOST `! `$Horse `0visiting `@The L.O.R.D. Cavern.'
            );
        } else {
            // Gain horse
            await this.io.lln('`%As you depart the `!Cavern\'s `%entrance, and start walking');
            await this.io.lln('`%into the Forest, you spot a `$Horse `%grazing in a meadow.');
            await this.io.lln('`!The horse adopts you, and you no longer have to walk anywhere.');
            await this.io.lln('`!Your new steed is very happy after you feed it some apples.');
            await this.io.lln('`!You `#GAIN `!a `0Horse`%! ');
            await this.io.lln('`$He is a beautiful, `0white stallion.', 4);
            this.player.horse = true;
            await this.log.logLine(
                '`$' + this.player.name + ' `!GAINED `%a `$Horse `0visiting `@The L.O.R.D. Cavern.'
            );
        }
    }

    private async fairyEvent(): Promise<void> {
        await this.io.sln();
        await this.io.lln(',`#T`5he `#L`%.`#O`%.`#R`%.`#D`%. `#C`5avern.');
        await this.io.lln('#     `$SPECIAL CAVERN `#FAIRY EVENT');
        await this.io.lln('`0================================================');

        if (this.player.has_fairy) {
            // Lose fairy
            await this.io.lln('`%Just before you leave the `#Cavern, `%your `0Fairy');
            await this.io.lln('`%flies out of your pocket, and down the tunnel!');
            await this.io.lln('`%You just `#LOST `%your `$Fairy!', 4);
            await this.io.lln('`#Sorry, but your `0"Life Insurance policy" `#just got cancelled!');
            this.player.has_fairy = false;
            await this.log.logLine(
                '`$' + this.player.name + ' `%LOST `! `$Fairy `0visiting `@The L.O.R.D. Cavern.'
            );
        } else {
            // Gain fairy
            await this.io.lln('`%You leave the `#Cavern, `%and enter the sunlight. `6...');
            await this.io.lln('`$A little green `$Fairy `$flies into your pocket!', 4);
            await this.io.lln('`9You `@GAIN `9a `@Fairy`%!', 4);
            await this.io.lln('`%He\'ll restore your life if you get killed, sometimes.');
            this.player.has_fairy = true;
            await this.log.logLine(
                '`$' + this.player.name + ' `!GAINED `%a `$Fairy `0visiting `@The L.O.R.D. Cavern.'
            );
        }
    }

    private async kidLossEvent(): Promise<void> {
        // Tiered loss based on kid count (per decompiled FUN_1000_14de)
        let numLost: number;
        const kids = this.player.kids;
        if (kids <= 100) numLost = 1;
        else if (kids <= 200) numLost = 2;
        else if (kids <= 300) numLost = 4;
        else if (kids <= 400) numLost = 6;
        else if (kids <= 500) numLost = 8;
        else if (kids <= 32000) numLost = 10;
        else numLost = 20;
        const actualLost = Math.min(numLost, this.player.kids);
        if (actualLost <= 0) return;

        await this.io.sln();
        if (actualLost === 1) {
            const childType = random(2) === 0 ? 'daughter' : 'son';
            await this.io.lln('`2Tragic News!   `#From `@L.O.R.D. Cavern: ', 10);
            await this.io.lln('`l');
            await this.io.lln('`6When you return home, you find out that some of');
            await this.io.lln('`6your ' + childType + ' went looking for you in the `@Cavern,');
            await this.io.lln('`6and while there, `#they `6fell off a 100-foot high cliff!');
            await this.io.lln('`6Sadly, `%your child `@died `6in the fall.  You mourn awhile');
            await this.io.lln('`6over the loss of your beloved child.');
        } else {
            await this.io.lln('`2Tragic News!   `#From `@L.O.R.D. Cavern: ', 10);
            await this.io.lln('`l');
            await this.io.lln('`6When you return home, you find out that some of');
            await this.io.lln('`6your children went looking for you in the `@Cavern,');
            await this.io.lln('`6and while there, `#they `6fell off a 100-foot high cliff!');
            await this.io.lln('`2Sadly, `%' + actualLost + ' `2of your children `@died `2in the fall. You', 4);
            await this.io.lln('`2mourn for days over the loss of your `6beloved kids.');
        }
        this.player.kids = Math.max(0, this.player.kids - actualLost);
        await this.log.logLine(
            '`#A child was `5lost near the `@C`2avern today.'
        );
    }

    // ── Utilities ──

    private async pressAKey(): Promise<void> {
        await this.io.sln();
        await this.io.lw('     `#<`0Pause`#>');
        this.io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
        this.io.sclrscr();
    }
}

export default LordCavern;
