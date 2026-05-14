/**
 * Violet's Cottage - IGM for LORD
 * Ported from VIOLET53/VIOLET.EXE (Borland Pascal binary)
 * Original by Trevor Herndon / Archon Computing, 1995
 */
import * as path from 'path';
import * as fs from 'fs';
import { cp437toUnicode } from '@lordts/util/CP437';
import { preprocessAnsi80 } from '@lordts/util/ANSI';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type IO from '@lordts/core/io/IO';
import type Log from '@lordts/core/Log';
import type State from '@lordts/core/State';
import { Violet_Defs, Gossip_Defs } from './violetDefs';
import type { VioletRecord, GossipRecord } from './violetDefs';
import { Cottage } from './cottage';
import { Porch } from './porch';

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

class Violet {
    private io: IO;
    private player: PlayerRecord;
    private state: State;
    private log: Log;
    private igmDir: string;
    private srcDir: string;
    private storage: IStorage;
    private violetFile: IRecordFile | null;
    private violetRecord: VioletRecord | null;
    private gossipFile: IRecordFile | null;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.state = deps.state;
        this.log = deps.log;
        this.igmDir = path.join(deps.runtimeDir, 'violet') + path.sep;
        this.srcDir = deps.srcDir + path.sep;
        this.storage = deps.storage;
        this.violetFile = null;
        this.violetRecord = null;
        this.gossipFile = null;
    }

    static get desc(): string { return '`#Violet`2\'s `0C`2ottage'; }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const igmDir = path.join(deps.runtimeDir, 'violet') + path.sep;
        const vf = deps.storage.create(igmDir + 'violet.dat', Violet_Defs);
        for (let i = 0; i < vf.length; i++) {
            const rec = vf.get(i) as unknown as VioletRecord;
            if (rec.day !== deps.state.days) {
                rec.day = deps.state.days;
                rec.visited = false;
                rec.put();
            }
        }
    }

    private get record(): VioletRecord {
        if (!this.violetRecord) throw new Error('Violet record not initialized');
        return this.violetRecord;
    }

    private get file(): IRecordFile {
        if (!this.violetFile) throw new Error('Violet file not initialized');
        return this.violetFile;
    }

    async run(): Promise<void> {
        this.initialize();

        this.io.foreground(2);
        this.io.background(0);
        this.io.sclrscr();

        // Display ANSI art on entry (original shows VIOLET.ANS before anything else)
        await this.displayAnsiArt();

        if (this.record.visited) {
            await this.alreadyVisited();
        } else {
            this.record.visited = true;
            this.record.put();
            await this.intro();

            if (this.player.sex !== 'F') {
                // Male path: old lady at door, option to enter cottage
                await this.malePath();
            } else {
                // Female path: old couple on porch
                const gossipStore = this.createGossipStore();
                const porch = new Porch(this.io, this.player, this.log, this.record, gossipStore, this.srcDir);
                await porch.run();
            }

            await this.exitMessage();
        }

        this.player.put();
        this.record.put();
        this.file.close();
        if (this.gossipFile) {
            this.gossipFile.close();
        }
    }

    private initialize(): void {
        let recordFound = false;

        this.violetFile = this.storage.create(this.igmDir + 'violet.dat', Violet_Defs);

        if (this.violetFile.length < 1) {
            this.violetRecord = this.violetFile.new() as unknown as VioletRecord;
            this.violetRecord.lrdrecord = this.player.Record;
            this.violetRecord.day = this.state.days;
            this.violetRecord.put();
        } else {
            for (let i = 0; i < this.violetFile.length; i++) {
                this.violetRecord = this.violetFile.get(i) as unknown as VioletRecord;
                if (this.violetRecord.lrdrecord === this.player.Record) {
                    recordFound = true;
                    break;
                }
            }

            if (!recordFound) {
                this.violetRecord = this.violetFile.new() as unknown as VioletRecord;
                this.violetRecord.lrdrecord = this.player.Record;
                this.violetRecord.day = this.state.days;
                this.violetRecord.put();
            }

            if (this.record.day !== this.state.days) {
                this.record.day = this.state.days;
                this.record.visited = false;
                this.record.put();
            }
        }
    }

    private createGossipStore() {
        this.gossipFile = this.storage.create(this.igmDir + 'gossip.dat', Gossip_Defs);
        const gossipFile = this.gossipFile;
        return {
            // eslint-disable-next-line @typescript-eslint/require-await -- async required: GossipStore interface
            async getEntries(): Promise<string[]> {
                const entries: string[] = [];
                for (let i = 0; i < gossipFile.length; i++) {
                    const rec = gossipFile.get(i) as unknown as GossipRecord;
                    if (rec.text && rec.text.trim().length > 0) {
                        entries.push(rec.text);
                    }
                }
                return entries;
            },
            // eslint-disable-next-line @typescript-eslint/require-await -- async required: GossipStore interface
            async addEntry(entry: string): Promise<void> {
                const rec = gossipFile.new() as unknown as GossipRecord;
                rec.text = entry;
                rec.put();
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_8a49 - Intro narrative
    // ═══════════════════════════════════════════════════════════════

    private async intro(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Violet\'s Cottage', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lw('`2Ahh, the lovely ');
        await this.printViolet();
        this.io.foreground(2);
        await this.io.lln('`2. Many a man has courted her, and many a man', 0);
        await this.io.lln('`2visited her room in the bar. But how many of you "brave" warriors', 0);
        await this.io.lw('`2have visited her cottage in deep in the woods? ');
        await this.printViolet();
        this.io.foreground(2);
        await this.io.lln('`2 likes to go to', 0);
        await this.io.lln('`2her house when she is not at the bar. LOTS of interesting things go', 0);
        await this.io.lln('`2on there, as you shall soon see!', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // FUN_1000_53c0 - Male path: old lady at cottage door
    // ═══════════════════════════════════════════════════════════════

    private async malePath(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Violet\'s Cottage', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.sln();
        await this.io.lln('`2After searching through the forest for what seemed to be HOURS,', 0);
        await this.io.lln('`2you come upon a tidy little cottage, hidden within the dense forest.', 0);
        await this.io.lln('`2On the porch of this cottage, you notice a rocking chair. Presently', 0);
        await this.io.lln('`2sitting in this chair is an old, but striking female. As you approach', 0);
        await this.io.lln('`2the cottage, the old lady stands up and speaks directly at you.', 0);
        await this.io.sln();
        this.io.foreground(10);
        await this.io.lw('`0"If you\'re fer going into this house, be warned: my daughter, ');
        await this.printViolet();
        await this.io.lln('`0,', 0);
        this.io.foreground(10);
        await this.io.lw('`0and her sisters are a wild bunch. Enter at your own risk!');
        this.io.foreground(2);
        await this.io.lln('`2 she says.', 0);
        await this.io.sln();
        await this.io.lw('`0(`#G`0)`2');
        await this.io.lln('o into the house, despite the woman\'s warning', 0);
        await this.io.lw('`0(`#L`0)`2');
        await this.io.lln('isten to the Old Woman and leave before you get hurt', 0);
        await this.io.sln();
        await this.io.lw('`2What do you want to do? ');

        this.io.emitPrompt('violet_enter_cottage', [
            { key: 'G', label: 'Go into the house' },
            { key: 'L', label: 'Leave' },
        ]);
        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
            if (ch === 'G') {
                const cottage = new Cottage(this.io, this.player, this.log, this.record);
                await cottage.run();
                return;
            }
        } while (ch !== 'L');
    }

    // ═══════════════════════════════════════════════════════════════
    // Already visited message
    // ═══════════════════════════════════════════════════════════════

    private async alreadyVisited(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Braving the Danger of the Forest', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You get lost in the woods. You barely are able to find your way back to the town. This leads you to believe that you can only visit the Cottage once a day SAFELY. Come back and join the fun again tomorrow!', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Exit message
    // ═══════════════════════════════════════════════════════════════

    private async exitMessage(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        this.io.foreground(15);
        await this.io.lln('`%Leaving Violet\'s Cottage in the Woods', 0);
        await this.io.lln('`l', 0);
        this.io.foreground(2);
        await this.io.lln('`2You eventually find the path back to town. You can\'t wait Until tomorrow when you can go back and visit the cottage in the woods again!', 0);
        await this.io.sln();
        await this.pressAKey();
    }

    // ═══════════════════════════════════════════════════════════════
    // Helpers
    // ═══════════════════════════════════════════════════════════════

    private async printViolet(): Promise<void> {
        this.io.foreground(13);
        await this.io.lw('`#Violet');
    }

    private async displayAnsiArt(): Promise<void> {
        const ansFile = path.join(this.srcDir, 'violet.ans');
        if (fs.existsSync(ansFile)) {
            const raw = cp437toUnicode(fs.readFileSync(ansFile, 'latin1'));
            this.io.print(preprocessAnsi80(raw).join('\r\n') + '\r\n');
            this.io.emitPrompt('violet_ansi_continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
        }
    }

    private async pressAKey(): Promise<void> {
        await this.io.lw('`0·`2 Touch `0ANY`2 key to continue `0·');
        this.io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
        await this.io.getkey();
    }
}

export default Violet;
