/**
 * The L.O.R.D. Cavern v1.7 - RHP (Random Happening Program) Script Engine
 * Parses and executes .RHP script files used by LORD Cavern.
 * Based on cavecode.txt documentation and EXE string extraction.
 */
import * as fs from 'fs';
import { random } from '@lordts/util/Util';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type Log from '@lordts/core/Log';
import type { Settings } from '@lordts/core/types';
import { MAX_KIDS_TOTAL, skillClassName, skillFieldName, skillUseFieldName } from './data';

/** Sentinel thrown to abort RHP execution cleanly */
export class RhpExit extends Error { constructor() { super('RhpExit'); this.name = 'RhpExit'; } }
export class RhpKill extends Error { fairySave: boolean; constructor(fs: boolean) { super('RhpKill'); this.name = 'RhpKill'; this.fairySave = fs; } }

interface RhpState {
    variables: number[];
    // MAIL/NEWS commands switch the interpreter into a buffered recording mode
    // until the matching END command flushes the collected lines.
    recording: 'none' | 'mail' | 'news';
    mailBuffer: string[];
    newsBuffer: string[];
}

export class RhpEngine {
    private io: IO;
    private player: Player;
    private log: Log;
    private settings: Settings;
    private caveSearches: number;
    private lines: string[] = [];
    private pc = 0;
    private state: RhpState;

    constructor(io: IO, player: Player, log: Log, settings: Settings, caveSearches: number) {
        this.io = io;
        this.player = player;
        this.log = log;
        this.settings = settings;
        this.caveSearches = caveSearches;
        this.state = {
            variables: [0, 0, 0, 0, 0],
            recording: 'none',
            mailBuffer: [],
            newsBuffer: [],
        };
    }

    get searches(): number { return this.caveSearches; }

    async executeFile(filePath: string): Promise<void> {
        if (!fs.existsSync(filePath)) return;
        const content = fs.readFileSync(filePath, 'ascii');
        this.lines = content.split(/\r?\n/);
        this.pc = 0;

        // Ignore scripts that explicitly target a different IGM.
        for (const line of this.lines) {
            const progMatch = line.match(/@;@@PROGRAM@\s+(\S+)/i);
            if (progMatch && progMatch[1].toUpperCase() !== 'LORDCAVE') {
                return; // Not for this IGM
            }
        }

        while (this.pc < this.lines.length) {
            await this.executeLine(this.lines[this.pc]);
            this.pc++;
        }
    }

    private async executeLine(rawLine: string): Promise<void> {
        // Comments
        if (rawLine.startsWith('@;@')) return;

        // Strip inline comments (@;@ can appear after commands)
        let processedLine = rawLine;
        const commentIdx = processedLine.indexOf('@;@');
        if (commentIdx >= 0) {
            processedLine = processedLine.substring(0, commentIdx).trimEnd();
            if (processedLine.length === 0) return;
        }

        // Replace display variables @*@VAR@*@
        let line = this.replaceDisplayVars(processedLine);

        // Replace backtick player codes
        line = this.replacePlayerCodes(line);

        // Command dispatch stays close to the original text-based interpreter:
        // first handle structural commands, then stat/toggle/condition forms,
        // and finally treat anything left as display text.
        const trimmed = line.trim();

        if (trimmed === '@SHOW@') {
            return; // script-start marker, no-op
        }
        if (trimmed === '@CLEAR@') {
            this.io.sclrscr();
            return;
        }
        if (trimmed === '@MORE@') {
            await this.io.moreNoMail();
            return;
        }
        if (trimmed === '@DELAY@') {
            await this.io.mswait(250);
            return;
        }
        if (trimmed === '@END@') {
            await this.io.moreNoMail();
            this.pc = this.lines.length;
            return;
        }
        if (trimmed === '@EXIT@') {
            await this.io.moreNoMail();
            this.pc = this.lines.length;
            throw new RhpExit();
        }
        if (trimmed === '@KILL@') {
            this.player.hp = 0;
            this.player.dead = true;
            await this.io.lln('`0Oh, dear!  You seem to have gotten yourself killed!', 3);
            this.io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
            await this.io.getkey();
            this.pc = this.lines.length;
            throw new RhpKill(false);
        }
        if (trimmed === '@KILLSAVE@') {
            await this._handleKillSave();
        }
        if (trimmed === '@STATS@') {
            await this.showStats();
            return;
        }
        if (trimmed === '@HEAL@') {
            this.player.hp = this.player.hp_max;
            return;
        }

        // @YESNO@
        if (trimmed === '@YESNO@') {
            await this.handleYesNo();
            return;
        }

        // @RANDOM@ x
        const randomMatch = trimmed.match(/^@RANDOM@\s+(\d+)$/i);
        if (randomMatch) {
            await this.handleRandom(parseInt(randomMatch[1], 10));
            return;
        }

        // @PROMPT@ XX..
        const promptMatch = trimmed.match(/^@PROMPT@\s+(.+)$/i);
        if (promptMatch) {
            await this.handlePrompt(promptMatch[1].trim());
            return;
        }

        // @RUNRHP@ filename
        const runrhpMatch = trimmed.match(/^@RUNRHP@\s+(.+)$/i);
        if (runrhpMatch) {
            // Not implemented - would need directory context
            this.pc = this.lines.length;
            return;
        }

        // @GOTO@ @#label
        const gotoMatch = trimmed.match(/^@GOTO@\s+@#(.+)$/i);
        if (gotoMatch) {
            this.gotoLabel(gotoMatch[1]);
            return;
        }

        // Section labels @#label and @##X - skip (handled by goto/yesno/random)
        if (trimmed.startsWith('@#')) return;

        // @MAIL@ / @MAILEND@ / @NEWS@ / @NEWSEND@ / @NEWSLINE@
        if (trimmed === '@MAIL@') { this.state.recording = 'mail'; this.state.mailBuffer = []; return; }
        if (trimmed === '@MAILEND@') { this.state.recording = 'none'; await this.sendMail(); return; }
        if (trimmed === '@NEWS@') { this.state.recording = 'news'; this.state.newsBuffer = []; return; }
        if (trimmed === '@NEWSEND@') { this.state.recording = 'none'; await this.sendNews(false); return; }
        if (trimmed === '@NEWSLINE@') { this.state.recording = 'none'; await this.sendNews(true); return; }

        // Stat-changing commands
        if (await this.tryStatCommand(trimmed)) return;

        // Toggle commands
        if (await this.tryToggleCommand(trimmed)) return;

        // @IF@ / @IFNOT@ conditions
        const ifMatch = trimmed.match(/^@IF@\s+(.+)$/i);
        if (ifMatch) { await this.handleIf(ifMatch[1], false); return; }
        const ifNotMatch = trimmed.match(/^@IFNOT@\s+(.+)$/i);
        if (ifNotMatch) { await this.handleIf(ifNotMatch[1], true); return; }

        // @SPACE@ x
        const spaceMatch = trimmed.match(/^@SPACE@\s+(\d+)$/i);
        if (spaceMatch) {
            const spaces = ' '.repeat(parseInt(spaceMatch[1], 10));
            if (this.state.recording === 'mail') this.state.mailBuffer.push(spaces);
            else if (this.state.recording === 'news') this.state.newsBuffer.push(spaces);
            else this.io.sw(spaces);
            return;
        }

        // Plain text output
        if (line.length > 0) {
            const hasNoLf = line.includes('`l');
            const cleanLine = line.replace(/`l/g, '');

            if (this.state.recording === 'mail') {
                this.state.mailBuffer.push(cleanLine);
            } else if (this.state.recording === 'news') {
                this.state.newsBuffer.push(cleanLine);
            } else if (hasNoLf) {
                await this.io.lw(cleanLine);
            } else {
                await this.io.lln(cleanLine);
            }
        }
    }

    private async _handleKillSave(): Promise<never> {
        if (this.player.has_fairy && random(2) === 0) {
            // Fairy saves
            await this.io.lln('`$Oh my, just as you realize you are dying, something happens!');
            await this.io.lln('`$There is a buzzing noise in your pouch, and your `!Fairy `$emerges.', 4);
            await this.io.lln('`%He taps you with a wand, and you are `@HEALED!.  `%Then he flies off.');
            this.player.hp = this.player.hp_max;
            this.player.has_fairy = false;
            throw new RhpKill(true);
        } else {
            if (this.player.has_fairy) {
                await this.io.lln('`#Unfortunately, your Fairy is on strike.  No healing today!', 4);
                await this.io.lln('`%The Fairy flies off, and your ghost is having a fit. `2...');
                this.player.has_fairy = false;
            }
            this.player.hp = 0;
            this.player.dead = true;
            throw new RhpKill(false);
        }
    }

    private replaceDisplayVars(line: string): string {
        // @*@VAR@*@ is the RHP display-variable syntax used to splice current
        // player stats and cave counters into ordinary output lines.
        return line.replace(/@\*@(\w+)@\*@/gi, (_match, varName: string) => {
            const val = this.resolveStatValue(varName.toUpperCase());
            return val !== undefined ? String(val) : '';
        });
    }

    private replacePlayerCodes(line: string): string {
        const p = this.player;
        const isFemale = p.sex === 'F';
        // Backtick substitutions mirror the legacy LORD text-code system so
        // ported RHP scripts can stay close to their original wording.
        return line
            .replace(/`n/g, p.name)
            .replace(/`a/g, p.arm)
            .replace(/`w/g, p.weapon)
            .replace(/`m/g, String(p.married_to >= 0 ? 'someone' : 'no one'))
            .replace(/`s/g, isFemale ? 'she' : 'he')
            .replace(/`o/g, isFemale ? 'he' : 'she')
            .replace(/`\[/g, isFemale ? 'her' : 'his')
            .replace(/`\]/g, isFemale ? 'his' : 'her')
            .replace(/`</g, isFemale ? 'her' : 'him')
            .replace(/`>/g, isFemale ? 'him' : 'her');
    }

    private resolveStatValue(name: string): number | string | undefined {
        const p = this.player;
        switch (name) {
        case 'SEARCH': return this.caveSearches;
        case 'FOREST': return p.forest_fights;
        case 'FIGHTS': return p.pvp_fights;
        case 'KIDS': return p.kids;
        case 'DEFENCE': case 'DEFENSE': return p.def;
        case 'STRENGTH': return p.str;
        case 'EXPERIENCE': return p.exp;
        case 'LAYS': return p.laid;
        case 'HITPOINTS': return p.hp;
        case 'HITMAX': return p.hp_max;
        case 'GEMS': return p.gem;
        case 'GOLD': return p.gold;
        case 'BANK': return p.bank;
        case 'ALLGOLD': return p.gold + p.bank;
        case 'CHARM': return p.cha;
        case 'WEAPON': return p.weapon;
        case 'WEAPONNUM': return p.weapon_num;
        case 'ARMOUR': case 'ARMOURNUM': case 'ARMORNUM': return p.arm_num;
        case 'LEVEL': return p.level;
        case 'KILLS': return p.drag_kills;
        case 'WINS': return p.drag_kills;
        case 'SKILL': return p[skillFieldName(p.clss)];
        case 'SKILLUSE': return p[skillUseFieldName(p.clss)];
        case 'NAME': return p.name;
        case 'CLASS': return skillClassName(p.clss);
        case 'MARRIED': return p.married_to >= 0 ? 'someone' : '';
        case 'VARIABLE1': return this.state.variables[0];
        case 'VARIABLE2': return this.state.variables[1];
        case 'VARIABLE3': return this.state.variables[2];
        case 'VARIABLE4': return this.state.variables[3];
        case 'VARIABLE5': return this.state.variables[4];
        default: return undefined;
        }
    }

    private resolveNumericValue(token: string): number {
        const num = parseInt(token, 10);
        if (!isNaN(num)) return num;
        const val = this.resolveStatValue(token.toUpperCase());
        return typeof val === 'number' ? val : 0;
    }

    private evaluateCondition(condStr: string): boolean {
        const upper = condStr.toUpperCase().trim();
        const p = this.player;

        // Boolean conditions
        switch (upper) {
        case 'FEMALE': return p.sex === 'F';
        case 'MALE': return p.sex === 'M';
        case 'FIGHTER': return p.clss === 0;
        case 'MAGIC': return p.clss === 1;
        case 'THIEF': return p.clss === 2;
        case 'HORSE': return !!p.horse;
        case 'FAIRY': return !!p.has_fairy;
        case 'MARRIED': return p.married_to >= 0;
        case 'SPIRITS': return !!p.high_spirits;
        case 'WEIRDEVENT': return !!p.weird;
        case 'HEALED': return p.hp >= p.hp_max;
        case 'CLEANMODE': return !!this.settings.clean_mode;
        case 'BARDSONG': return !!p.seen_bard;
        case 'FLIRTED': return !!p.flirted;
        case 'SETHVIOLET': return !!p.seen_violet;
        case 'SEENMASTER': return !!p.seen_master;
        case 'SEENDRAGON': return !!p.seen_dragon;
        }

        // Comparison conditions: x<>y, x=y, x<y, x>y
        let m = upper.match(/^(.+)<>(.+)$/);
        if (m) return this.resolveNumericValue(m[1]) !== this.resolveNumericValue(m[2]);
        m = upper.match(/^(.+)=(.+)$/);
        if (m) return this.resolveNumericValue(m[1]) === this.resolveNumericValue(m[2]);
        m = upper.match(/^(.+)<(.+)$/);
        if (m) return this.resolveNumericValue(m[1]) < this.resolveNumericValue(m[2]);
        m = upper.match(/^(.+)>(.+)$/);
        if (m) return this.resolveNumericValue(m[1]) > this.resolveNumericValue(m[2]);

        return false;
    }

    private async handleIf(rest: string, negate: boolean): Promise<void> {
        // Parse: condition command_or_text
        // Condition ends at first space followed by @command@ or text
        const parts = rest.match(/^(\S+)\s+(.+)$/);
        if (!parts) return;
        const condition = parts[1];
        const command = parts[2];
        let result = this.evaluateCondition(condition);
        if (negate) result = !result;
        if (result) {
            await this.executeLine(command);
        }
    }

    private gotoLabel(label: string): void {
        const target = '@#' + label;
        // Search forward first
        for (let i = this.pc + 1; i < this.lines.length; i++) {
            if (this.lines[i].trim().toUpperCase() === target.toUpperCase()) {
                this.pc = i;
                return;
            }
        }
        // Then search from beginning
        for (let i = 0; i < this.pc; i++) {
            if (this.lines[i].trim().toUpperCase() === target.toUpperCase()) {
                this.pc = i;
                return;
            }
        }
    }

    private async handleYesNo(): Promise<void> {
        await this.io.lw('  `0[`#Y`0/`5n`0] `3');
        this.io.emitPrompt('lordcave_rhp_yesno', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        const ch = (await this.io.getkey()).toUpperCase();
        const display = (ch === 'Y' || ch === '\r') ? 'Y' : 'N';
        await this.io.sln(display);
        if (display === 'Y') {
            this.gotoSection('Y');
        } else {
            this.gotoSection('N');
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    private async handleRandom(max: number): Promise<void> {
        const choice = random(max) + 1;
        this.gotoSection(String(choice));
    }

    private async handlePrompt(selections: string): Promise<void> {
        const keys = selections.split('');
        await this.io.lw('`2  Your choice, `%' + this.player.name + '`2? `0');
        this.io.emitPrompt('lordcave_rhp_prompt', keys.map(k => ({ key: k, label: k })));
        let ch: string;
        do {
            ch = (await this.io.getkey()).toUpperCase();
        } while (!keys.includes(ch));
        await this.io.sln('`2' + ch);
        this.gotoSection(ch);
    }

    private gotoSection(key: string): void {
        const target = '@##' + key;
        for (let i = this.pc + 1; i < this.lines.length; i++) {
            if (this.lines[i].trim().toUpperCase() === target.toUpperCase()) {
                this.pc = i;
                return;
            }
        }
        // Search from beginning
        for (let i = 0; i < this.pc; i++) {
            if (this.lines[i].trim().toUpperCase() === target.toUpperCase()) {
                this.pc = i;
                return;
            }
        }
    }

    private async tryStatCommand(line: string): Promise<boolean> {
        const statCmds: Array<{ pattern: RegExp; stat: string }> = [
            { pattern: /^@SEARCH@\s+(.+)$/i, stat: 'SEARCH' },
            { pattern: /^@FOREST@\s+(.+)$/i, stat: 'FOREST' },
            { pattern: /^@FIGHTS@\s+(.+)$/i, stat: 'FIGHTS' },
            { pattern: /^@KIDS@\s+(.+)$/i, stat: 'KIDS' },
            { pattern: /^@DEFENCE@\s+(.+)$/i, stat: 'DEFENCE' },
            { pattern: /^@DEFENSE@\s+(.+)$/i, stat: 'DEFENSE' },
            { pattern: /^@STRENGTH@\s+(.+)$/i, stat: 'STRENGTH' },
            { pattern: /^@EXPERIENCE@\s+(.+)$/i, stat: 'EXPERIENCE' },
            { pattern: /^@LAYS@\s+(.+)$/i, stat: 'LAYS' },
            { pattern: /^@SKILL@\s+(.+)$/i, stat: 'SKILL' },
            { pattern: /^@SKILLUSE@\s+(.+)$/i, stat: 'SKILLUSE' },
            { pattern: /^@HITPOINTS@\s+(.+)$/i, stat: 'HITPOINTS' },
            { pattern: /^@HITMAX@\s+(.+)$/i, stat: 'HITMAX' },
            { pattern: /^@GEMS@\s+(.+)$/i, stat: 'GEMS' },
            { pattern: /^@GOLD@\s+(.+)$/i, stat: 'GOLD' },
            { pattern: /^@BANK@\s+(.+)$/i, stat: 'BANK' },
            { pattern: /^@CHARM@\s+(.+)$/i, stat: 'CHARM' },
            { pattern: /^@KILLS@\s+(.+)$/i, stat: 'KILLS' },
            { pattern: /^@VARIABLE1@\s+(.+)$/i, stat: 'VARIABLE1' },
            { pattern: /^@VARIABLE2@\s+(.+)$/i, stat: 'VARIABLE2' },
            { pattern: /^@VARIABLE3@\s+(.+)$/i, stat: 'VARIABLE3' },
            { pattern: /^@VARIABLE4@\s+(.+)$/i, stat: 'VARIABLE4' },
            { pattern: /^@VARIABLE5@\s+(.+)$/i, stat: 'VARIABLE5' },
        ];

        for (const cmd of statCmds) {
            const m = line.match(cmd.pattern);
            if (m) {
                await this.applyStat(cmd.stat, m[1].trim());
                return true;
            }
        }
        return false;
    }

    private async applyStat(stat: string, expr: string): Promise<void> {
        const currentVal = this.getStatNum(stat);

        let newVal: number;

        if (expr.startsWith('=')) {
            // Set absolute
            newVal = this.evaluateExpr(expr.substring(1));
        } else if (expr.startsWith('%')) {
            // Percentage
            const pct = this.evaluateExpr(expr.substring(1));
            newVal = currentVal + Math.floor(currentVal * pct / 100);
        } else if (expr === '$') {
            // Increment by 1
            newVal = currentVal + 1;
        } else {
            // Add value (may include +/- and *LEVEL or *STAT)
            const delta = this.evaluateExpr(expr);
            newVal = currentVal + delta;
        }

        this.setStatNum(stat, newVal);
        const appliedVal = this.getStatNum(stat);
        const diff = appliedVal - currentVal;

        // Notify player (not in mail recording, not for variables)
        if (this.state.recording === 'none' && !stat.startsWith('VARIABLE')) {
            const label = this.getStatLabel(stat);
            if (label && diff !== 0) {
                if (diff > 0) {
                    await this.io.lln('`!You `#GAIN `%' + diff + ' `0' + label + '!');
                } else {
                    await this.io.lln('`$You `#LOSE `%' + Math.abs(diff) + ' `0' + label + '!');
                }
            }
        }
    }

    private evaluateExpr(expr: string): number {
        const cleaned = expr.replace(/^\+/, '');
        // Check for *LEVEL or *STAT multiplier
        const mulMatch = cleaned.match(/^(-?\d+)\*(.+)$/);
        if (mulMatch) {
            const base = parseInt(mulMatch[1], 10);
            const mulVal = this.resolveNumericValue(mulMatch[2]);
            return base * mulVal;
        }
        // Check for stat*number
        const mulMatch2 = cleaned.match(/^(\w+)\*(-?\d+)$/);
        if (mulMatch2) {
            const statVal = this.resolveNumericValue(mulMatch2[1]);
            return statVal * parseInt(mulMatch2[2], 10);
        }
        // Check for stat%number (N percent of stat, e.g. DEFENSE%10 = 10% of DEFENSE)
        const pctMatch = cleaned.match(/^(\w+)%(\d+)$/);
        if (pctMatch) {
            const statVal = this.resolveNumericValue(pctMatch[1]);
            const pct = parseInt(pctMatch[2], 10);
            return Math.floor(statVal * pct / 100);
        }
        return this.resolveNumericValue(cleaned);
    }

    private getStatNum(stat: string): number {
        const v = this.resolveStatValue(stat);
        return typeof v === 'number' ? v : 0;
    }

    private setStatNum(stat: string, val: number): void {
        const p = this.player;
        // Clamp values
        if (val < 0 && !stat.startsWith('VARIABLE')) val = 0;
        if (val > 2000000000) val = 2000000000;

        switch (stat) {
        case 'SEARCH': this.caveSearches = Math.max(0, Math.min(128, val)); break;
        case 'FOREST': p.forest_fights = val; break;
        case 'FIGHTS': p.pvp_fights = val; break;
        case 'KIDS': p.kids = Math.min(val, MAX_KIDS_TOTAL); break;
        case 'DEFENCE': case 'DEFENSE': p.def = val; break;
        case 'STRENGTH': p.str = val; break;
        case 'EXPERIENCE': p.exp = val; break;
        case 'LAYS': p.laid = val; break;
        case 'HITPOINTS': p.hp = Math.min(val, p.hp_max); break;
        case 'HITMAX': p.hp_max = val; break;
        case 'GEMS': p.gem = val; break;
        case 'GOLD': p.gold = val; break;
        case 'BANK': p.bank = val; break;
        case 'CHARM': p.cha = val; break;
        case 'KILLS': p.drag_kills = val; break;
        case 'SKILL': {
            const f = skillFieldName(p.clss);
            (p as Record<string, unknown>)[f] = Math.min(val, 100);
            break;
        }
        case 'SKILLUSE': {
            const f = skillUseFieldName(p.clss);
            (p as Record<string, unknown>)[f] = Math.min(val, 100);
            break;
        }
        case 'VARIABLE1': this.state.variables[0] = val; break;
        case 'VARIABLE2': this.state.variables[1] = val; break;
        case 'VARIABLE3': this.state.variables[2] = val; break;
        case 'VARIABLE4': this.state.variables[3] = val; break;
        case 'VARIABLE5': this.state.variables[4] = val; break;
        }
    }

    private getStatLabel(stat: string): string {
        switch (stat) {
        case 'SEARCH': return 'Cave Search';
        case 'FOREST': return 'Forest Fight';
        case 'FIGHTS': return 'Player Fight';
        case 'KIDS': return 'Kid';
        case 'DEFENCE': case 'DEFENSE': return 'Defense point';
        case 'STRENGTH': return 'Strength point';
        case 'EXPERIENCE': return 'Experience point';
        case 'LAYS': return 'Lay';
        case 'HITPOINTS': return 'HitPoint';
        case 'HITMAX': return 'Max HitPoint';
        case 'GEMS': return 'Gem';
        case 'GOLD': return 'Gold coin';
        case 'BANK': return 'Bank Gold';
        case 'CHARM': return 'Charm point';
        case 'KILLS': return 'Player Kill';
        case 'SKILL': return 'Skill Point';
        case 'SKILLUSE': return 'Skill Use Point';
        default: return '';
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    private async tryToggleCommand(line: string): Promise<boolean> {
        const upper = line.toUpperCase().trim();
        const p = this.player;
        switch (upper) {
        case '@FAIRY@': p.has_fairy = !p.has_fairy; return true;
        case '@HORSE@': p.horse = !p.horse; return true;
        case '@SEX@': p.sex = p.sex === 'M' ? 'F' : 'M'; return true;
        case '@HEAL@': p.hp = p.hp_max; return true;
        case '@SPIRITS@': p.high_spirits = !p.high_spirits; return true;
        case '@WEIRDEVENT@': p.weird = !p.weird; return true;
        case '@BARDSONG@': p.seen_bard = !p.seen_bard; return true;
        case '@FLIRTED@': p.flirted = !p.flirted; return true;
        case '@SETHVIOLET@': p.seen_violet = !p.seen_violet; return true;
        case '@SEENMASTER@': p.seen_master = !p.seen_master; return true;
        case '@SEENDRAGON@': p.seen_dragon = !p.seen_dragon; return true;
        }
        return false;
    }

    private async sendMail(): Promise<void> {
        // Mail sending requires storage - simplified version writes nothing
        // In a full implementation this would use deps.storage.sendMail()
    }

    private async sendNews(_withLine: boolean): Promise<void> {
        const text = this.state.newsBuffer.join('\n');
        if (text.trim()) {
            await this.log.logLine(text);
        }
        // logLine() already appends the standard divider, so no extra divider needed
        this.state.newsBuffer = [];
    }

    private async showStats(): Promise<void> {
        const p = this.player;
        await this.io.sln();
        await this.io.lln('`%' + p.name + '`%\'s Stats...');
        await this.io.lln('`l');
        await this.io.lln('`0Experience    `!: `%' + p.exp);
        await this.io.lln('`0Level         `!: `%' + p.level);
        await this.io.lln('`0Forest Fights `!: `%' + p.forest_fights);
        await this.io.lln('`0Gold in Hand  `!: `%' + p.gold);
        await this.io.lln('`0Charm         `!: `%' + p.cha);
        await this.io.lln('`0Children      `!: `%' + p.kids);
        await this.io.lln('`l');
        await this.io.moreNoMail();
    }
}
