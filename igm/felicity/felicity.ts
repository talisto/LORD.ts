/**
 * Felicity's Temple v2.1 - Main IGM class
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 * Ported to TypeScript from FELICITY.EXE string extraction and FELICITY.FEL.
 *
 * Navigation: STARTOUT → MAIN → (statues|fountain|passage|behind)
 * Secret areas: Janitor (from MAIN), Storage (from PASSAGE)
 */
import * as fs from 'fs';
import * as path from 'path';
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import { FelicityBase } from './felicityBase';
import { IGM_NAME, IGM_VERSION } from './felicityDefs';

// Sub-modules
import { felicityGreeting, talkTurin } from './temple';
import { statueRoom } from './statues';
import { fountain } from './fountain';
import { behindTemple } from './behind';
import { prayerRoom } from './prayer';
import { discoverStorage, discoverJanitor } from './secrets';

class Felicity extends FelicityBase {
    static get desc(): string { return '`8· `%F`7elicity\'s `%T`7emple `8·'; }

    constructor(deps: IgmDeps) {
        super(deps);
    }

    /** Server-side daily maintenance: reset per-player daily flags */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        // Daily flags are reset on first visit each day via initRecord/resetDaily
        // Ensure the runtime directory exists
        const igmDataDir = path.join(deps.runtimeDir, 'felicity');
        if (!fs.existsSync(igmDataDir)) {
            fs.mkdirSync(igmDataDir, { recursive: true });
        }
    }

    async run(): Promise<void> {
        // Ensure runtime directory exists
        if (!fs.existsSync(this.igmDataDir)) {
            fs.mkdirSync(this.igmDataDir, { recursive: true });
        }

        await this.buildMenuIndex();
        this.initRecord();
        this.loadTopTen();

        await this.startOut();

        await this.exitGame();
    }

    /** Forest clearing - entry point (STARTOUT) */
    private async startOut(): Promise<void> {
        let done = false;
        do {
            if (this.menuRedisplay) {
                await this.displayMenu('STARTOUT');
                this.menuRedisplay = false;
            }
            const ch = await this.commandPrompt('Forest Clearing', [
                { key: 'E', label: 'Enter the Temple' },
                { key: 'G', label: 'Go Behind Temple' },
                { key: 'R', label: 'Read About Temple' },
                { key: 'Q', label: 'Quit' },
                { key: 'V', label: 'View Stats' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();
            switch (ch) {
                case 'E':
                    this.menuRedisplay = true;
                    await this.mainHall();
                    break;
                case 'G':
                    this.menuRedisplay = true;
                    await behindTemple(this);
                    break;
                case 'R':
                    this.menuRedisplay = true;
                    await this.displayMenu('READTEMPLE');
                    await this.pressAKey();
                    break;
                case 'Q':
                    if (await this.areYouSure()) {
                        done = true;
                    } else {
                        this.menuRedisplay = true;
                    }
                    break;
                case 'V':
                    this.menuRedisplay = true;
                    await this.io.showStats();
                    break;
                case '?':
                    this.menuRedisplay = true;
                    break;
            }
        } while (!done);
    }

    /** Main hallway (MAIN menu) */
    private async mainHall(): Promise<void> {
        let done = false;
        do {
            if (this.menuRedisplay) {
                await this.displayMenu('MAIN');
                this.menuRedisplay = false;
            }
            const ch = await this.commandPrompt('Main Hallway', [
                { key: 'T', label: 'Talk to Felicity' },
                { key: 'R', label: 'Statue Room' },
                { key: 'F', label: 'The Fountain' },
                { key: 'C', label: 'The Passage' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();
            switch (ch) {
                case 'T':
                    this.menuRedisplay = true;
                    await felicityGreeting(this);
                    break;
                case 'R':
                    this.menuRedisplay = true;
                    await statueRoom(this);
                    break;
                case 'F':
                    this.menuRedisplay = true;
                    await fountain(this);
                    break;
                case 'C':
                    this.menuRedisplay = true;
                    await this.passage();
                    break;
                case 'L':
                    done = true;
                    this.menuRedisplay = true;
                    break;
                case 'V':
                    this.menuRedisplay = true;
                    await this.io.showStats();
                    break;
                case '?':
                    this.menuRedisplay = true;
                    break;
            }

            // 12.5% base chance here; discoverJanitor() has an additional random(5)!=0
            // gate inside, making effective discovery rate ~2.5% per menu iteration
            if (!done && !this.rec.found_janitor && random(8) === 0) {
                await discoverJanitor(this);
            }
        } while (!done);
    }

    /** Passage area (PASSAGE menu) - leads to Turin and prayer */
    private async passage(): Promise<void> {
        let done = false;
        do {
            if (this.menuRedisplay) {
                await this.displayMenu('PASSAGE');
                this.menuRedisplay = false;
            }
            const ch = await this.commandPrompt('The Passage', [
                { key: 'T', label: 'Talk to Turin' },
                { key: 'P', label: 'Prayer Room' },
                { key: 'V', label: 'View Stats' },
                { key: 'L', label: 'Leave' },
                { key: '?', label: 'Menu' },
            ]);
            await this.io.sln();
            switch (ch) {
                case 'T':
                    this.menuRedisplay = true;
                    await talkTurin(this);
                    break;
                case 'P':
                    this.menuRedisplay = true;
                    await prayerRoom(this);
                    break;
                case 'L':
                    done = true;
                    this.menuRedisplay = true;
                    break;
                case 'V':
                    this.menuRedisplay = true;
                    await this.io.showStats();
                    break;
                case '?':
                    this.menuRedisplay = true;
                    break;
            }

            // Random chance to discover storage room
            if (!done && !this.rec.found_storage && random(8) === 0) {
                await discoverStorage(this);
            }
        } while (!done);
    }

    /** Exit game message */
    private async exitGame(): Promise<void> {
        this.io.sclrscr();
        await this.io.lln('`2Thanks for playing `%' + IGM_NAME + ' `0' + IGM_VERSION, 0);
        await this.io.lw('`2Now returning to Other Places');
        for (let i = 0; i < 5; i++) {
            await this.io.mswait(300);
            await this.io.lw('`4.');
        }
        this.player.put();
        this.cleanup();
    }
}

export default Felicity;
