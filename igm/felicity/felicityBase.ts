/**
 * Felicity's Temple - Base class with shared utilities
 * Provides menu display, stat checking, and common prompts.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import * as path from 'path';
import { File } from '@lordts/util/FileUtils';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type Log from '@lordts/core/Log';
import type State from '@lordts/core/State';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { FelicityRecord, WarriorScore } from './felicityDefs';
import { Felicity_Defs, Score_Defs, DEFAULT_TOP_TEN } from './felicityDefs';
import type { PromptOption } from '@lordts/core/GameEvents';

export class FelicityBase {
    io: IO;
    player: Player;
    state: State;
    log: Log;
    igmDir: string;
    igmDataDir: string;
    menuFile!: File;
    menuIndex: Record<string, number> = {};
    felFile!: IRecordFile;
    rec!: FelicityRecord;
    menuRedisplay = true;
    topTen: WarriorScore[] = [];
    private scoreFile!: IRecordFile;

    constructor(private deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.state = deps.state;
        this.log = deps.log;
        this.igmDir = deps.srcDir + path.sep;
        this.igmDataDir = path.join(deps.runtimeDir, 'felicity') + path.sep;
    }

    /* ── Menu file handling ── */

    async buildMenuIndex(): Promise<void> {
        this.menuFile = new File(this.igmDir + 'felicity.fel');
        if (!this.menuFile.open('r')) {
            await this.io.lln('`4FELICITY.FEL `0Was not found Please inform the Sysop!!!');
            return;
        }
        while (true) {
            const l = this.menuFile.readln();
            if (l === null) break;
            if (l.substring(0, 2) === '@#') {
                this.menuIndex[l.substring(2).trim()] = this.menuFile.position;
            }
        }
    }

    async displayMenu(name: string): Promise<void> {
        this.io.sclrscr();
        if (this.menuIndex[name] === undefined) {
            await this.io.lln('`4 display not found in `%FELICITY.FEL');
            return;
        }
        this.menuFile.position = this.menuIndex[name];
        while (true) {
            const ln = this.menuFile.readln();
            if (ln === null) break;
            if (ln.substring(0, 2) === '@#') break;
            await this.io.lln(ln, 0);
        }
    }

    async displayMenuInline(name: string): Promise<void> {
        if (this.menuIndex[name] === undefined) return;
        this.menuFile.position = this.menuIndex[name];
        while (true) {
            const ln = this.menuFile.readln();
            if (ln === null) break;
            if (ln.substring(0, 2) === '@#') break;
            await this.io.lln(ln, 0);
        }
    }

    /* ── Common prompts ── */

    async commandPrompt(currentPlace: string, options: PromptOption[]): Promise<string> {
        const validKeys = options.map(o => o.key.toUpperCase());
        const displayKeys = validKeys.filter(k => k !== '?').sort();
        if (!this.io.modern) {
            await this.io.sln();
            await this.io.lln('`5' + currentPlace + ' `8(? for Menu)');
            await this.io.lln('`8(' + displayKeys.join(',') + ')');
            await this.io.lw('`2  Your command, `0' + this.player.name + '`2 : ');
        }
        this.io.emitPrompt('felicity_command', options);
        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (validKeys.indexOf(ch) === -1);
        if (!this.io.modern) await this.io.lw('`2' + ch);
        return ch;
    }

    async pressAKey(noClear?: boolean): Promise<void> {
        await this.io.lw(' `0Press A Key `@');
        await this.flushKeys();
        this.io.emitPrompt('felicity_continue', [{ key: 'any', label: 'Continue' }]);
        await this.io.getkey();
        if (noClear) {
            this.io.print('\r');
            this.io.cleareol();
        } else {
            this.io.sclrscr();
        }
    }

    async areYouSure(): Promise<boolean> {
        await this.io.sln();
        await this.io.lw('  `2Really QUIT? [`0Y`2/`0N`2]  ');
        this.io.emitPrompt('felicity_quit', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await this.io.getkey()).toUpperCase();
        return ch === 'Y';
    }

    async flushKeys(): Promise<void> {
        while (await this.io.waitkey(0)) {
            await this.io.getkey();
        }
    }

    /* ── Stat clamping helpers ── */

    strCheck(val: number): void {
        this.player.str = Math.max(0, Math.min(32000, this.player.str + val));
    }

    defCheck(val: number): void {
        this.player.def = Math.max(0, Math.min(32000, this.player.def + val));
    }

    charmCheck(val: number): void {
        this.player.cha = Math.max(0, Math.min(32000, this.player.cha + val));
    }

    gemCheck(val: number): void {
        this.player.gem = Math.max(0, Math.min(32000, this.player.gem + val));
    }

    // Stat caps mirror LORD's integer field limits:
    // str/def/cha/gem/hp_max: 32000 (signed 16-bit), gold/exp: 2B (signed 32-bit)
    // exp minimum is 1 (not 0) to prevent division-by-zero in level calculations
    goldCheck(val: number): void {
        this.player.gold = Math.max(0, Math.min(2000000000, this.player.gold + val));
    }

    expCheck(val: number): void {
        this.player.exp = Math.max(1, Math.min(2000000000, this.player.exp + val));
    }

    hitMaxCheck(val: number): void {
        this.player.hp_max = Math.min(32000, this.player.hp_max + val);
    }

    hpWayDown(): void {
        this.player.hp = 1;
    }

    /* ── Record file init ── */

    initRecord(): void {
        this.felFile = this.deps.storage.create(this.igmDataDir + 'felicity.dat', Felicity_Defs);

        // Linear scan: IGM records are keyed by LORD player Record# (not slot index).
        // This matches the original RHP pattern where IGM .DAT files use separate numbering.
        let recordFound = false;
        for (let i = 0; i < this.felFile.length; i++) {
            this.rec = this.felFile.get(i) as unknown as FelicityRecord;
            if (this.rec.lrdrecord === this.player.Record) {
                recordFound = true;
                break;
            }
        }

        if (!recordFound) {
            this.rec = this.felFile.new() as unknown as FelicityRecord;
            this.rec.lrdrecord = this.player.Record;
            this.rec.day = this.state.days;
            this.rec.put();
        }

        if (this.rec.day !== this.state.days) {
            this.resetDaily();
        }
    }

    private resetDaily(): void {
        this.rec.day = this.state.days;
        this.rec.talked_fel = false;
        this.rec.talked_akasha = false;
        this.rec.prayed = false;
        this.rec.fountain = false;
        this.rec.explored = false;
        this.rec.janitor_helped = false;
        this.rec.janitor_lf = false;
        this.rec.arcade_played = false;
        this.rec.flirted = false;
        this.rec.statue_vin = false;
        this.rec.statue_fae = false;
        this.rec.statue_kar = false;
        this.rec.put();
    }

    /* ── Top-ten Warrior's Revenge scores ── */

    loadTopTen(): void {
        this.scoreFile = this.deps.storage.create(this.igmDataDir + 'felicity_scores.dat', Score_Defs);
        this.topTen = [];

        if (this.scoreFile.length === 0) {
            // Initialize with defaults
            for (const entry of DEFAULT_TOP_TEN) {
                const rec = this.scoreFile.new()!;
                rec.name = entry.name;
                rec.score = entry.score;
                rec.put();
            }
        }

        for (let i = 0; i < this.scoreFile.length && i < 10; i++) {
            const rec = this.scoreFile.get(i);
            if (rec) {
                this.topTen.push({ name: rec.name as string, score: rec.score as number });
            }
        }
    }

    saveTopTen(): void {
        for (let i = 0; i < this.topTen.length && i < 10; i++) {
            const rec = this.scoreFile.get(i);
            if (rec) {
                rec.name = this.topTen[i].name;
                rec.score = this.topTen[i].score;
                rec.put();
            }
        }
    }

    insertScore(playerName: string, score: number): number {
        for (let i = 0; i < this.topTen.length; i++) {
            if (score > this.topTen[i].score) {
                this.topTen.splice(i, 0, { name: playerName, score });
                this.topTen.length = 10;
                this.saveTopTen();
                return i + 1;
            }
        }
        return -1;
    }

    async showTopTen(): Promise<void> {
        this.io.sclrscr();
        await this.io.sln();
        await this.io.lln('`2          -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=');
        await this.io.lln('`$                 Top Ten Immortals For Warrior\'s Revenge   ');
        await this.io.lln('`4              Rank            Name                   Score');
        for (let i = 0; i < this.topTen.length; i++) {
            const rank = String(i + 1).padStart(14);
            const name = this.topTen[i].name.padEnd(24);
            const score = String(this.topTen[i].score);
            await this.io.lln('`%' + rank + '.        ' + name + score);
        }
        await this.io.sln();
        await this.pressAKey();
    }

    cleanup(): void {
        if (this.felFile) this.felFile.close();
        if (this.scoreFile) this.scoreFile.close();
        if (this.menuFile) this.menuFile.close();
    }
}
