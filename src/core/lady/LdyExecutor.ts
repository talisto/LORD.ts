/**
 * LDY Executor - Runs parsed Lady script commands against a GameSession.
 *
 * The Lady scripting language supports:
 * - Output: @writeln, @write, @display/@enddisplay, @clrscr/@cls
 * - Input: @choice, @hitakey
 * - Control flow: @if/@else/@endif, @case/@endcase, @begin/@end, @label/@goto
 * - Variables: &N1-&N40 (numbers), &S1-&S40 (strings), &B1-&B40 (booleans)
 * - Player vars: &Pxx (mapped to player record fields)
 * - Random: &rndN (random 1..N)
 * - Special: &nick, &hero, &filename, &ver, &play, &rip, &clean
 * - Math: @math &var = expr
 * - Assignment: @set &var to value
 * - Subroutines: @runsub SECTION file.ldy
 * - Game actions: @saveplayer, @endquest, @endgame
 *
 * Variables are shared across @runsub calls within the same event execution.
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import { random } from '@lordts/util/Util';
import {
    parseLdyFile, LdyCommand, IfCommand, SetCommand, MathCommand,
    ChoiceCommand, SetbitCommand, IsbitsetCommand,
} from './LdyParser';
import type IO from '../io/IO';
import type Player from '../Player';
import type State from '../State';
import type { Settings, ArmourStats, WeaponStats, UiMode } from '../types';
import { Lazy } from '@lordts/util/Lazy';

/** A value in the Lady scripting engine (script variables can hold strings, numbers, or booleans) */
type LdyValue = string | number | boolean;

/**
 * Special signal to indicate script wants to end quest
 */
export class EndQuestSignal extends Error {
    type: string = 'endquest';
    constructor() { super('endquest'); this.name = 'EndQuestSignal'; this.type = 'endquest'; }
}

export class EndGameSignal extends Error {
    type: string = 'endgame';
    constructor() { super('endgame'); this.name = 'EndGameSignal'; this.type = 'endgame'; }
}

// Goto, EndQuest, EndGame use exception-based flow because they must unwind
// through nested _execute/_executeOne call stacks (runsub, begin/end, case blocks)
export class GotoSignal extends Error {
    type: string = 'goto';
    label: string;
    constructor(label: string) { super('goto: ' + label); this.name = 'GotoSignal'; this.type = 'goto'; this.label = label; }
}

interface PlayerVarMapping {
    field: string;
    type: 'num' | 'bool' | 'str' | 'sexbool';
}

export class LdyExecutor {
    private _player: Player | null;

    // Variable storage (shared across runsub calls within one execution)
    private numVars: { [key: number]: number };
    private strVars: { [key: number]: string };
    private boolVars: { [key: number]: boolean };

    // Last @choice response
    private lastResponse: string;

    // Loaded file cache: filename -> Map<sectionName, commands[]>
    private fileCache: Map<string, Map<string, LdyCommand[]>>;

    // Current filename being executed (for &filename variable)
    private currentFilename: string;

    // File I/O state
    private fileCreated: boolean;

    /**
     * @param io - IO instance for display/input
     * @param rip - Whether RIP graphics are enabled
     * @param settings - Game settings
     * @param ldyDirs - Directories to search for .ldy files (checked in order)
     * @param _running - Lazy accessor for the running flag
     * @param _state - Lazy accessor for the State instance
     * @param player - Initial player reference (may be null)
     */
    constructor(
        private io: IO,
        private _uiMode: UiMode,
        private settings: Settings,
        private ldyDirs: string[],
        private _running: Lazy<boolean>,
        private _gameState: Lazy<State>,
        private armourStats: ArmourStats[],
        private weaponStats: WeaponStats[],
        player: Player | null,
    ) {
        this._player = player;

        // Variable storage (shared across runsub calls within one execution)
        this.numVars = {};    // &N1 through &N40
        this.strVars = {};    // &S1 through &S40
        this.boolVars = {};   // &B1 through &B40

        // Last @choice response
        this.lastResponse = '';

        // Loaded file cache: filename -> Map<sectionName, commands[]>
        this.fileCache = new Map();

        // Current filename being executed (for &filename variable)
        this.currentFilename = '';

        // File I/O state
        this.fileCreated = false;
    }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    /**
     * Get the player reference from the session
     */
    get player(): Player {
        if (!this._player) throw new Error('LdyExecutor.player accessed before player was set');
        return this._player;
    }

    /**
     * Reset variables for a new event execution
     */
    private _resetVars(): void {
        this.numVars = {};
        this.strVars = {};
        this.boolVars = {};
        this.lastResponse = '';
    }

    /**
     * Load a LDY file (with caching).
     * Searches all configured LDY directories in order.
     */
    private _loadFile(filename: string): Map<string, LdyCommand[]> | null {
        const key = filename.toLowerCase();
        if (this.fileCache.has(key)) {
            return this.fileCache.get(key) ?? null;
        }

        // Try various case combinations across all LDY directories
        const candidates = [filename, filename.toUpperCase(), filename.toLowerCase()];
        let content: string | null = null;
        for (const dir of this.ldyDirs) {
            for (const candidate of candidates) {
                const tryPath = path.join(dir, candidate);
                if (fs.existsSync(tryPath)) {
                    content = fs.readFileSync(tryPath, 'utf-8');
                    break;
                }
            }
            if (content) break;
        }

        if (!content) {
            console.error(`[LDY] File not found: ${filename} in ${this.ldyDirs.join(', ')}`);
            return null;
        }

        const sections = parseLdyFile(content, filename);
        this.fileCache.set(key, sections);
        return sections;
    }

    /**
     * Main entry point: run a named section from a LDY file.
     * @param sectionName - Section to run (e.g., "OLDMAN")
     * @param filename - LDY filename (e.g., "oldman.ldy")
     * @param isTopLevel - If true, reset variables
     * @returns Result: 'endquest', 'endgame', or 'ok'
     */
    async run(sectionName: string, filename: string, isTopLevel: boolean = true): Promise<string> {
        if (isTopLevel) {
            this._resetVars();
            // In RIP mode, show W1 text window before running LDY events
            // so that any @display/@writeln text appears in a visible area
            if (this.rip) {
                await this.io.showRip('W1');
            }
        }

        this.currentFilename = filename;

        const sections = this._loadFile(filename);
        if (!sections) {
            console.error(`[LDY] Cannot load file: ${filename}`);
            return 'ok';
        }

        const commands = sections.get(sectionName.toUpperCase());
        if (!commands) {
            console.error(`[LDY] Section not found: ${sectionName} in ${filename}`);
            return 'ok';
        }

        try {
            await this._execute(commands);
            return 'ok';
        } catch (e) {
            if (e instanceof EndQuestSignal) {
                return 'endquest';
            }
            if (e instanceof EndGameSignal) {
                return 'endgame';
            }
            throw e;
        }
    }

    /**
     * Execute an array of commands
     */
    private async _execute(commands: LdyCommand[]): Promise<void> {
        let i = 0;

        while (i < commands.length) {
            if (!this._running.value) throw new EndQuestSignal();

            const cmd = commands[i];

            try {
                const result = await this._executeOne(cmd, commands, i);
                if (typeof result === 'number') {
                    // Jump to specific index (from @goto)
                    i = result;
                    continue;
                }
                i++;
            } catch (e) {
                if (e instanceof GotoSignal) {
                    // Find label in commands (labels are NOT case specific per LADY.DOC)
                    const targetLower = e.label.toLowerCase();
                    const labelIdx = commands.findIndex(c => c.type === 'label' && (c).name.toLowerCase() === targetLower);
                    if (labelIdx >= 0) {
                        i = labelIdx + 1;
                        continue;
                    } else {
                        // Label not in this scope - re-throw so parent can handle it
                        throw e;
                    }
                } else {
                    throw e;
                }
            }
        }
    }

    /**
     * Execute a single command. Returns next index offset or undefined.
     */
    private async _executeOne(cmd: LdyCommand, commands: LdyCommand[], idx: number): Promise<number | void> {
        const g = { armourStats: this.armourStats, weaponStats: this.weaponStats };

        switch (cmd.type) {
            case 'verreq':
            case 'eventname':
            case 'author':
            case 'authid':
            case 'codebegin':
            case 'codeend':
            case 'target':
            case 'noop':
            case 'unknown':
                // Metadata / no-ops
                return;

            case 'writeln': {
                const text = this._expandVars((cmd).text);
                if (this._processMailCode(text)) return; // Mail code consumed
                await this.io.lln(text, 0);
                return;
            }

            case 'write': {
                const text = this._expandVars((cmd).text);
                if (this._processMailCode(text)) return; // Mail code consumed
                await this.io.lw(text);
                return;
            }

            case 'display_start': {
                return await this._executeDisplayBlock(commands, idx);
            }

            case 'display_end':
                // Should not be reached directly
                return;

            case 'text': {
                // Bare text line (inside display blocks handled above, but just in case)
                const expanded = this._expandVars((cmd).value);
                if (this._processMailCode(expanded)) return;
                await this.io.lln(expanded, 0);
                return;
            }

            case 'choice': {
                await this._executeChoiceCommand(cmd);
                return;
            }

            case 'case_start': {
                // Find matching case labels and @endcase
                const caseId = (cmd).id;
                let caseValue: string;
                const varName = (cmd).variable.toLowerCase();
                if (varName === 'responce' || varName === 'response') {
                    caseValue = this.lastResponse.toUpperCase();
                } else {
                    caseValue = this._resolveValue((cmd).variable) as string;
                }

                // Collect case branches
                return await this._executeCase(commands, idx, caseId, caseValue);
            }

            case 'if': {
                return await this._executeIf(commands, idx, cmd);
            }

            case 'begin': {
                // @begin ... @end - collect and execute the block
                const blockEnd = this._findMatchingEnd(commands, idx);
                const blockCmds = commands.slice(idx + 1, blockEnd);
                await this._execute(blockCmds);
                return blockEnd + 1;
            }

            case 'set': {
                this._executeSet(cmd);
                return;
            }

            case 'math': {
                this._executeMath(cmd);
                return;
            }

            case 'label':
                // Labels are targets for @goto, no action needed
                return;

            case 'goto':
                throw new GotoSignal((cmd).target);

            case 'runsub': {
                let file = (cmd).file;
                if (file === '&filename') {
                    file = this.currentFilename;
                }
                const section = (cmd).section.toUpperCase();
                await this.run(section, file || this.currentFilename, false);
                return;
            }

            case 'hitakey':
                await this.io.moreNoMail();
                return;

            case 'clrscr':
                this.io.sclrscr();
                return;

            case 'endquest':
                throw new EndQuestSignal();

            case 'endgame':
                throw new EndGameSignal();

            case 'saveplayer':
                this._player?.put();
                return;

            case 'delay': {
                // Delay is cosmetic; in sync mode we skip it
                // (original BBS would have used a blocking sleep here)
                return;
            }

            case 'case_label':
                // These are handled inside _executeCase, shouldn't be hit standalone
                return;

            case 'case_end':
            case 'else':
            case 'endif':
            case 'end':
                // These are structural markers handled by their parent constructs
                return;

            case 'prompt': {
                // @prompt <&S var num> <max length> [true/false]
                await this.io.lw('  `2Your response? `2: `%');
                this.io.emitPrompt('ldy_prompt', [], 'line');
                const result = await this.io.getstr({ len: (cmd).maxLen || 79 });
                const varIdx = this._clampVarIndex((cmd).varNum);
                this.strVars[varIdx] = result || '';
                return;
            }

            case 'promptn': {
                // @promptn <&N var num> <max length>
                await this.io.lw('  `2Enter a number `2: `%');
                this.io.emitPrompt('ldy_promptn', [], 'number');
                const result = await this.io.getstr({ len: (cmd).maxLen || 10 });
                const varIdx = this._clampVarIndex((cmd).varNum);
                this.numVars[varIdx] = parseInt(result) || 0;
                return;
            }

            case 'changearm': {
                // @changearm <1..15>
                const num = (cmd).num;
                if (num >= 1 && num <= 15) {
                    const armour = g.armourStats[num - 1];
                    if (armour) {
                        this.player.arm = armour.name;
                        this.player.arm_num = num;
                    }
                }
                return;
            }

            case 'changewep': {
                // @changewep <1..15>
                const num = (cmd).num;
                if (num >= 1 && num <= 15) {
                    const weapon = g.weaponStats[num - 1];
                    if (weapon) {
                        this.player.weapon = weapon.name;
                        this.player.weapon_num = num;
                    }
                }
                return;
            }

            case 'upstr': {
                // @upstr &S<n>
                const sMatch = (cmd).variable.match(/^&[Ss](\d+)$/);
                if (sMatch) {
                    const varIdx = this._clampVarIndex(parseInt(sMatch[1]));
                    this.strVars[varIdx] = (this.strVars[varIdx] || '').toUpperCase();
                }
                return;
            }

            case 'lowstr': {
                // @lowstr &S<n>
                const sMatch = (cmd).variable.match(/^&[Ss](\d+)$/);
                if (sMatch) {
                    const varIdx = this._clampVarIndex(parseInt(sMatch[1]));
                    this.strVars[varIdx] = (this.strVars[varIdx] || '').toLowerCase();
                }
                return;
            }

            case 'setbit': {
                this._executeSetbit(cmd);
                return;
            }

            case 'isbitset': {
                this._executeIsbitset(cmd);
                return;
            }

            case 'openfile':
            case 'rewritefile':
            case 'appendfile':
            case 'closefile':
            case 'readline':
                // File I/O - stub (not used by default events)
                return;

            case 'displayfile':
                // Output ANSI/SANSI file - stub (not used by default events)
                return;

            case 'debug':
                // Debug toggling - no-op in web version
                return;

            default:
                // Unknown command type - skip
                return;
        }
    }

    /**
     * Execute an @if/@else/@endif chain
     * Returns the command index to jump to after the endif
     */
    private async _executeIf(commands: LdyCommand[], startIdx: number, ifCmd: IfCommand): Promise<number> {
        const ifId = ifCmd.id;
        const conditionResult = this._evaluateCondition(ifCmd);

        // Find the matching @else and @endif for this ID
        let elseIdx = -1;
        let endifIdx = -1;
        let depth = 0;

        for (let j = startIdx + 1; j < commands.length; j++) {
            const c = commands[j];
            if (c.type === 'if' && (c).id === ifId) {
                depth++;
            } else if (c.type === 'endif' && (c).id === ifId) {
                if (depth === 0) {
                    endifIdx = j;
                    break;
                }
                depth--;
            } else if (c.type === 'else' && (c).id === ifId && depth === 0) {
                elseIdx = j;
            }
        }

        if (endifIdx === -1) {
            // Malformed script - no matching endif
            console.error(`[LDY] No matching @endif for ID ${ifId} at line ${ifCmd.line}`);
            return startIdx + 1;
        }

        if (conditionResult) {
            // Execute the "then" block (between @if and @else or @endif)
            const thenEnd = elseIdx >= 0 ? elseIdx : endifIdx;
            const thenCmds = commands.slice(startIdx + 1, thenEnd);
            await this._execute(thenCmds);
        } else if (elseIdx >= 0) {
            // Execute the "else" block
            const elseCmds = commands.slice(elseIdx + 1, endifIdx);
            await this._execute(elseCmds);
        }

        return endifIdx + 1;
    }

    /**
     * Execute a @case/@endcase block
     * Returns the command index to jump to after the endcase
     */
    private async _executeCase(commands: LdyCommand[], startIdx: number, caseId: string, caseValue: LdyValue): Promise<number> {
        // Find matching @endcase (same id, respecting nesting of the same id)
        let endcaseIdx = -1;
        let depth = 0;

        for (let j = startIdx + 1; j < commands.length; j++) {
            const c = commands[j];
            if (c.type === 'case_start' && (c).id === caseId) {
                depth++;
            } else if (c.type === 'case_end' && (c).id === caseId) {
                if (depth === 0) {
                    endcaseIdx = j;
                    break;
                }
                depth--;
            }
        }

        if (endcaseIdx === -1) {
            console.error(`[LDY] No matching @endcase for ID ${caseId} at line ${commands[startIdx].line}`);
            return startIdx + 1;
        }

        const caseStr = String(caseValue).toUpperCase().trim();

        for (let j = startIdx + 1; j < endcaseIdx; j++) {
            const c = commands[j];
            if (c.type === 'case_label') {
                const labelStr = String((c).label).toUpperCase().trim();
                const cleanLabel = labelStr.replace(/:$/, '');

                if (cleanLabel === caseStr) {
                    const caseLabel = c;

                    if (caseLabel.body && caseLabel.body.type !== 'begin') {
                        // Single-command inline body (e.g. "Y: @writeln text")
                        await this._executeOne(caseLabel.body, commands, j);
                    } else {
                        // Multi-line body or "Label: @begin" body.
                        //
                        // The LDY language allows two patterns for case blocks:
                        //   N: @begin … @end          (explicit closing @end)
                        //   Y: @begin … @endcase       (NO @end; scope ends implicitly at @endcase)
                        //
                        // Because of the second pattern the @end/@begin depth counter cannot
                        // reliably locate the end of a case body - the last case label in a
                        // block has a hidden @begin (via case_label.body) with no corresponding
                        // @end before @endcase.
                        //
                        // Instead we collect the body by tracking nested @case depth: we stop
                        // when we reach a sibling case_label (nestedCase === 0) or endcaseIdx.
                        // This correctly handles nested @case/@endcase blocks by skipping their
                        // inner case_label nodes.
                        const bodyCmds: LdyCommand[] = [];
                        let k = j + 1;
                        let nestedCase = 0;

                        while (k < endcaseIdx) {
                            const cmd = commands[k];
                            if (cmd.type === 'case_start') {
                                nestedCase++;
                            } else if (cmd.type === 'case_end') {
                                if (nestedCase > 0) nestedCase--;
                            } else if (cmd.type === 'case_label' && nestedCase === 0) {
                                break; // sibling case label - this case body ends here
                            }
                            bodyCmds.push(cmd);
                            k++;
                        }

                        // If the case label had an inline @begin body, prepend it so that
                        // _execute sees the @begin and uses _findMatchingEnd to execute the
                        // block. (For the null-body path the @begin is the first collected
                        // command, so no prepend is needed.)
                        if (caseLabel.body?.type === 'begin') {
                            bodyCmds.unshift(caseLabel.body);
                        }

                        await this._execute(bodyCmds);
                    }
                    break;
                }
            }
        }

        return endcaseIdx + 1;
    }

    private async _executeDisplayBlock(commands: LdyCommand[], idx: number): Promise<number> {
        let j = idx + 1;
        while (j < commands.length && commands[j].type !== 'display_end') {
            const subcmd = commands[j];
            if (subcmd.type === 'text') {
                const expanded = this._expandVars((subcmd).value);
                if (!this._processMailCode(expanded)) {
                    await this.io.lln(expanded, 0);
                }
            } else if (subcmd.type === 'writeln') {
                const text = this._expandVars((subcmd).text);
                if (!this._processMailCode(text)) {
                    await this.io.lln(text, 0);
                }
            } else if (subcmd.type === 'hitakey') {
                await this.io.moreNoMail();
            } else {
                await this._executeOne(subcmd, commands, j);
            }
            j++;
        }
        if (j < commands.length && commands[j].type === 'display_end') {
            return j + 1;
        }
        return j;
    }

    private async _executeChoiceCommand(cmd: ChoiceCommand): Promise<void> {
        const prompt = this._expandVars(cmd.prompt);
        const choiceOptions = cmd.options.toUpperCase();
        const ynLabels: Record<string, string> = { Y: 'Yes', N: 'No' };
        const promptOptions = choiceOptions.split('').map((c: string) => ({
            key: c,
            label: (choiceOptions === 'YN' || choiceOptions === 'NY') ? (ynLabels[c] ?? c) : c
        }));
        const options = cmd.options.toUpperCase();
        this.lastResponse = await this.io.prompt(prompt, promptOptions, 'ldy_choice', {
            leadingBlank: false,
            trailingBlank: false,
            echoStyle: 'line',
            defaultKey: options[0]
        });
    }

    private _executeSetbit(cmd: SetbitCommand): void {
        const sMatch = cmd.variable.match(/^&[Nn](\d+)$/);
        if (sMatch) {
            const varIdx = this._clampVarIndex(parseInt(sMatch[1]));
            const bit = parseInt(cmd.bit) || 1;
            const valStr = (cmd.value || 'true').toLowerCase();
            const on = (valStr === 'on' || valStr === 'true' || valStr === '1');
            let current = this.numVars[varIdx] || 0;
            if (on) {
                current = current | (1 << (bit - 1));
            } else {
                current = current & ~(1 << (bit - 1));
            }
            this.numVars[varIdx] = current;
        }
    }

    private _executeIsbitset(cmd: IsbitsetCommand): void {
        const srcMatch = cmd.source.match(/^&[Nn](\d+)$/);
        const dstMatch = cmd.dest ? cmd.dest.match(/^&[Nn](\d+)$/) : null;
        if (srcMatch && dstMatch) {
            const srcIdx = this._clampVarIndex(parseInt(srcMatch[1]));
            const dstIdx = this._clampVarIndex(parseInt(dstMatch[1]));
            const bit = parseInt(cmd.bit) || 1;
            const val = this.numVars[srcIdx] || 0;
            this.numVars[dstIdx] = (val & (1 << (bit - 1))) ? 1 : 0;
        }
    }

    /**
     * Process mail codes that modify player stats.
     * Per LADY.DOC, these must be the only thing on the line and at the beginning.
     * Returns true if a mail code was processed (line consumed), false otherwise.
     */
    private _processMailCode(text: string): boolean {
        if (!text || text.length < 2) return false;

        // Mail codes start with a backtick
        const trimmed = text.trim();
        if (!trimmed.startsWith('`')) return false;

        // Per lady.doc: mail codes must be the ONLY thing on the line.
        // A valid mail-code line is `<code> optionally followed by a signed integer.
        // Anything else (e.g. `$Just then... or `0Some text) is colored display text.
        if (!/^`[^\s]\s*-?\d*\s*$/.test(trimmed)) return false;

        const code = trimmed[1];
        const amountStr = trimmed.substring(2).trim();
        const amount = isNaN(parseInt(amountStr, 10)) ? 0 : parseInt(amountStr, 10);
        const p = this.player;

        switch (code) {
            case 'b': // deposit in bank
                p.bank = Math.max(0, (p.bank || 0) + amount);
                return true;
            case 'G': // gold in hand
                p.gold = Math.max(0, (p.gold || 0) + amount);
                return true;
            case 'E': // experience
                p.exp = Math.max(0, (p.exp || 0) + amount);
                return true;
            case '$': // married_to player number (-1 = not married)
                // Only set if an explicit integer was provided (not bare `$)
                if (amountStr.length > 0) {
                    p.married_to = parseInt(amountStr, 10);
                }
                return true;
            case '{': // increment lays
                p.laid = (p.laid || 0) + 1;
                return true;
            case '}': // increment charm
                p.cha = (p.cha || 0) + 1;
                return true;
            case '+': // set charm to specific number
                p.cha = Math.max(0, amount);
                return true;
            case 'K': // increment kids
                p.kids = (p.kids || 0) + 1;
                return true;
            case 'M': // increment strength
                p.str = Math.max(0, (p.str || 0) + amount);
                return true;
            case 'D': // increment defense
                p.def = Math.max(0, (p.def || 0) + amount);
                return true;
            case ',': // increment forest fights
                p.forest_fights = Math.max(0, (p.forest_fights || 0) + amount);
                return true;
            case ':': // increment human fights
                p.pvp_fights = Math.max(0, (p.pvp_fights || 0) + amount);
                return true;
            case ';': // increment hp max
                p.hp_max = Math.max(0, (p.hp_max || 0) + amount);
                return true;
            case 'S': // raise class skill (won't pass 40)
                if (p.clss === 1) p.skillw = Math.min(40, (p.skillw || 0) + 1);
                else if (p.clss === 2) p.skillm = Math.min(40, (p.skillm || 0) + 1);
                else if (p.clss === 3) p.skillt = Math.min(40, (p.skillt || 0) + 1);
                return true;
            default:
                return false;
        }
    }

    /**
     * Find the matching @end for a @begin at the given index.
     * Also counts case_label nodes whose inline body is a @begin command, because
     * the corresponding @end is a standalone node but the begin is hidden inside
     * case_label.body - failing to count it would break the depth balance.
     */
    private _findMatchingEnd(commands: LdyCommand[], beginIdx: number): number {
        let depth = 0;
        for (let j = beginIdx + 1; j < commands.length; j++) {
            const c = commands[j];
            if (c.type === 'begin') {
                depth++;
            } else if (c.type === 'case_label' && (c).body?.type === 'begin') {
                // Hidden begin: the @begin lives in case_label.body but its @end is standalone.
                depth++;
            } else if (c.type === 'end') {
                if (depth === 0) return j;
                depth--;
            }
        }
        return commands.length; // fallback
    }

    /**
     * Evaluate an @if condition
     */
    private _evaluateCondition(ifCmd: IfCommand): boolean {
        const left = this._resolveValue(ifCmd.left);
        const right = this._resolveValue(ifCmd.right);
        const op = ifCmd.operator;

        if (op === 'is') {
            // Boolean comparison: "is true" / "is false"
            const boolLeft = this._toBool(left);
            const rightStr = String(right).toLowerCase().trim();
            if (rightStr === 'true' || rightStr === 't' || rightStr === '1') return boolLeft === true;
            if (rightStr === 'false' || rightStr === 'f' || rightStr === '0') return boolLeft === false;
            if (rightStr === 'not true') return boolLeft === false;
            if (rightStr === 'not false') return boolLeft === true;
            return boolLeft == right;
        }

        // Check if this is a string comparison (per spec: "Lady will determine
        // if you are doing a string comparison based on the first operand")
        const leftIsStr = ifCmd.left && (ifCmd.left.match(/^&[Ss]\d+$/i) ||
            ifCmd.left === '&name' || ifCmd.left === '&nick' ||
            ifCmd.left === '&F' || ifCmd.left === '&L');

        if (leftIsStr && typeof left === 'string') {
            // String comparison is case-sensitive per spec
            const strRight = String(right);
            switch (op) {
                case '=': return left === strRight;
                case '<>':
                case '!=': return left !== strRight;
                case '<': return left < strRight;
                case '>': return left > strRight;
                default: return left === strRight;
            }
        }

        // Numeric comparisons
        const numLeft = this._toNum(left);
        const numRight = this._toNum(right);

        switch (op) {
            case '=': return numLeft === numRight;
            case '<': return numLeft < numRight;
            case '>': return numLeft > numRight;
            case '<=': return numLeft <= numRight;
            case '>=': return numLeft >= numRight;
            case '<>':
            case '!=': return numLeft !== numRight;
            default: return false;
        }
    }

    /**
     * Execute a @set command
     */
    private _executeSet(cmd: SetCommand): void {
        const varName = cmd.variable;
        const valueStr = cmd.value.trim();

        // Determine the variable target type
        const varType = this._getVarType(varName);

        if (varType === 'num') {
            // Numeric set: @set &N1 to &rnd9, @set &N1 to 5
            // Also handles increment: @set &Pgo to +&N1, @set &Pff to -1
            const isIncrement = valueStr.startsWith('+');
            const isDecrement = valueStr.startsWith('-') && !valueStr.startsWith('-&') && !/^-\d/.test(valueStr) ? false : valueStr.startsWith('-');

            let val: number;
            if (isIncrement) {
                const addend = this._toNum(this._resolveValue(valueStr.substring(1)));
                const current = this._toNum(this._getVar(varName));
                val = current + addend;
            } else if (isDecrement && valueStr.length > 1) {
                // Check if it's a negative number or a decrement
                // "-&N1" = decrement by &N1, "-5" = decrement by 5
                const subtrahend = this._toNum(this._resolveValue(valueStr.substring(1)));
                const current = this._toNum(this._getVar(varName));
                val = current - subtrahend;
            } else {
                val = this._toNum(this._resolveValue(valueStr));
            }

            this._setVar(varName, val);
        } else if (varType === 'bool') {
            // Boolean set
            const lowerVal = valueStr.toLowerCase();
            if (lowerVal === 'true' || lowerVal === 't' || lowerVal === '1') {
                this._setVar(varName, true);
            } else if (lowerVal === 'false' || lowerVal === 'f' || lowerVal === '0') {
                this._setVar(varName, false);
            } else if (lowerVal.startsWith('not ')) {
                // @set &B1 to not true
                const inner = lowerVal.substring(4).trim();
                this._setVar(varName, !(inner === 'true' || inner === 't' || inner === '1'));
            } else if (lowerVal.startsWith('!')) {
                // @set &B1 to !true  (LADY.DOC: exclamation = negate)
                const inner = lowerVal.substring(1).trim();
                if (inner.startsWith('&')) {
                    this._setVar(varName, !this._toBool(this._resolveValue(valueStr.substring(1))));
                } else {
                    this._setVar(varName, !(inner === 'true' || inner === 't' || inner === '1'));
                }
            } else {
                this._setVar(varName, this._toBool(this._resolveValue(valueStr)));
            }
        } else if (varType === 'str') {
            this._setVar(varName, this._expandVars(valueStr));
        } else {
            // Player vars or unknown - try to be smart about it
            if (valueStr.startsWith('+')) {
                const addend = this._toNum(this._resolveValue(valueStr.substring(1)));
                const current = this._toNum(this._getVar(varName));
                this._setVar(varName, current + addend);
            } else if (valueStr.startsWith('-')) {
                const subtrahend = this._toNum(this._resolveValue(valueStr.substring(1)));
                const current = this._toNum(this._getVar(varName));
                this._setVar(varName, current - subtrahend);
            } else if (valueStr.toLowerCase() === 'true') {
                this._setVar(varName, true);
            } else if (valueStr.toLowerCase() === 'false') {
                this._setVar(varName, false);
            } else {
                // Might be a variable reference or literal
                const resolved = this._resolveValue(valueStr);
                this._setVar(varName, resolved);
            }
        }
    }

    /**
     * Execute a @math command
     * Supports: +, -, *, /, !
     */
    private _executeMath(cmd: MathCommand): void {
        const target = cmd.target;
        const expr = cmd.expression;

        // Parse expression: "operand operator operand" or just "operand"
        const parts = expr.split(/\s+/);

        if (parts.length === 1) {
            // Simple assignment: @math &N1 = &rnd5
            this._setVar(target, this._toNum(this._resolveValue(parts[0])));
        } else if (parts.length === 3) {
            // Binary operation: @math &N1 = operand op operand
            const left = this._toNum(this._resolveValue(parts[0]));
            const op = parts[1];
            const right = this._toNum(this._resolveValue(parts[2]));

            let result: number;
            switch (op) {
                case '+': result = left + right; break;
                case '-': result = left - right; break;
                case '*': result = left * right; break;
                case '/': result = right !== 0 ? Math.floor(left / right) : 0; break;
                // LADY.DOC: '!' is modulo (not logical-not); integer division truncates toward zero
                case '!': result = left % right; break;
                default: result = left; break;
            }

            this._setVar(target, result);
        } else {
            // Multi-part expression - evaluate left to right
            let result = this._toNum(this._resolveValue(parts[0]));
            for (let i = 1; i < parts.length - 1; i += 2) {
                const op = parts[i];
                const right = this._toNum(this._resolveValue(parts[i + 1]));
                switch (op) {
                    case '+': result = result + right; break;
                    case '-': result = result - right; break;
                    case '*': result = result * right; break;
                    case '/': result = right !== 0 ? Math.floor(result / right) : 0; break;
                    case '!': result = result % right; break;
                    default: break;
                }
            }
            this._setVar(target, result);
        }
    }

    // ========== VARIABLE RESOLUTION ==========

    /**
     * Clamp a variable index to 1-40 range per LADY.DOC spec.
     * "if the specified number isnt between 1 and 40, then itll default to 1"
     */
    private _clampVarIndex(idx: number): number {
        if (idx < 1 || idx > 40) return 1;
        return idx;
    }

    /**
     * Determine variable type from its name prefix
     */
    private _getVarType(varName: string): string {
        if (varName.startsWith('&N') || varName.startsWith('&n')) return 'num';
        if (varName.startsWith('&S') || varName.startsWith('&s')) return 'str';
        if (varName.startsWith('&B') || varName.startsWith('&b')) return 'bool';
        // Player vars can be num, bool, or string depending on the specific one
        if (varName.startsWith('&P') || varName.startsWith('&p')) return 'player';
        return 'unknown';
    }

    /**
     * Map of &P variable codes to player record field names and types
     */
    private static get PLAYER_VAR_MAP(): { [key: string]: PlayerVarMapping } {
        return {
            'ht': { field: 'hp', type: 'num' },
            'hx': { field: 'hp_max', type: 'num' },
            'sr': { field: 'str', type: 'num' },
            'df': { field: 'def', type: 'num' },
            'de': { field: 'def', type: 'num' },        // LADY.DOC alias for &Pde
            'go': { field: 'gold', type: 'num' },
            'ba': { field: 'bank', type: 'num' },
            'lv': { field: 'level', type: 'num' },
            'ge': { field: 'gem', type: 'num' },
            'ch': { field: 'cha', type: 'num' },
            'ff': { field: 'forest_fights', type: 'num' },
            'hf': { field: 'pvp_fights', type: 'num' },
            'cl': { field: 'clss', type: 'num' },
            'ho': { field: 'horse', type: 'bool' },
            'sx': { field: 'sex', type: 'sexbool' },    // true if female
            'sb': { field: 'seen_bard', type: 'bool' },
            'dd': { field: 'dead', type: 'bool' },
            'sm': { field: 'skillm', type: 'num' },       // LADY.DOC &Psm = Mystical skill points
            'se': { field: 'seen_master', type: 'bool' },// LADY.DOC &Pse = seen master today
            'sd': { field: 'seen_dragon', type: 'bool' },
            'dr': { field: 'seen_dragon', type: 'bool' },// LADY.DOC alias for &Pdr
            'sv': { field: 'seen_violet', type: 'bool' },
            'fa': { field: 'has_fairy', type: 'bool' },
            'kd': { field: 'kids', type: 'num' },
            'ki': { field: 'kids', type: 'num' },        // LADY.DOC alias for &Pki
            'dk': { field: 'drag_kills', type: 'num' },
            'pk': { field: 'pvp', type: 'num' },
            'we': { field: 'weapon', type: 'str' },      // weapon name
            'wn': { field: 'weapon_num', type: 'num' },
            'ar': { field: 'arm', type: 'str' },         // armor name
            'an': { field: 'arm_num', type: 'num' },
            'la': { field: 'laid', type: 'num' },
            'ly': { field: 'laid', type: 'num' },         // LADY.DOC alias for &Ply
            'nm': { field: 'name', type: 'str' },
            'rn': { field: 'real_name', type: 'str' },
            'in': { field: 'inn', type: 'bool' },
            'on': { field: 'on_now', type: 'bool' },
            'ex': { field: 'exp', type: 'num' },
            'hs': { field: 'high_spirits', type: 'bool' },
            'hi': { field: 'high_spirits', type: 'bool' },// LADY.DOC alias for &Phi
            'am': { field: 'amulet', type: 'bool' },     // amulet true=has, false=not
            'fl': { field: 'flirted', type: 'bool' },
            'fi': { field: 'flirted', type: 'bool' },    // LADY.DOC alias for &Pfi
            'ol': { field: 'olivia', type: 'bool' },
            'dv': { field: 'divorced', type: 'bool' },
            'di': { field: 'divorced', type: 'bool' },   // LADY.DOC alias for &Pdi
            'mt': { field: 'married_to', type: 'num' },
            'ma': { field: '_isMarried', type: 'bool' },  // LADY.DOC &Pma - is married? (readonly)
            'mn': { field: '_marriedName', type: 'str' }, // LADY.DOC &Pmn - married-to name (readonly)
            'sw': { field: 'skillw', type: 'num' },
            'si': { field: 'skillm', type: 'num' },
            'st': { field: 'skillt', type: 'num' },
            'lw': { field: 'levelw', type: 'num' },
            'lm': { field: 'levelm', type: 'num' },
            'lt': { field: 'levelt', type: 'num' },
            'pl': { field: '_playerIndex', type: 'num' }, // player record number
        };
    }

    /**
     * Get a variable's value
     */
    private _getVar(varName: string): LdyValue {
        if (!varName.startsWith('&')) return varName;

        const code = varName.substring(1); // Remove &

        // Numeric vars: N1-N40
        const numMatch = code.match(/^[Nn](\d+)$/);
        if (numMatch) {
            const idx = this._clampVarIndex(parseInt(numMatch[1]));
            return this.numVars[idx] || 0;
        }

        // String vars: S1-S40
        const strMatch = code.match(/^[Ss](\d+)$/);
        if (strMatch) {
            const idx = this._clampVarIndex(parseInt(strMatch[1]));
            return this.strVars[idx] || '';
        }

        // Boolean vars: B1-B40
        const boolMatch = code.match(/^[Bb](\d+)$/);
        if (boolMatch) {
            const idx = this._clampVarIndex(parseInt(boolMatch[1]));
            return this.boolVars[idx] || false;
        }

        // File handle vars: I1-I3 (stub)
        const iMatch = code.match(/^[Ii]([1-3])$/);
        if (iMatch) {
            return 0; // File handles not yet implemented
        }

        // Read-only variables
        const codeLower = code.toLowerCase();
        if (codeLower === 'f') {
            // &F - user's first name
            const name = this.player.real_name || this.player.name || '';
            return name.split(' ')[0] || name;
        }
        if (codeLower === 'l') {
            // &L - user's last name
            const name = this.player.real_name || this.player.name || '';
            const parts = name.split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : '';
        }
        if (codeLower === 'name') {
            // &name - user's first and last name
            return this.player.real_name || this.player.name || 'Unknown';
        }
        // BBS door mode had per-session time limits; web has none, so return 60 min to prevent scripts from triggering "time running out" logic
        if (codeLower === 'time') {
            return 60;
        }
        if (codeLower === 'playedtoday') {
            // &playedtoday - whether player has seen this event today
            return 0; // Default: not tracked
        }
        if (codeLower === 'file_created') {
            return this.fileCreated || false;
        }
        if (codeLower === 'rip') {
            return this.rip;
        }
        if (codeLower === 'clean') {
            return this.settings.clean_mode === true;
        }
        if (codeLower === 'nick') {
            return this.player.name || this.player.real_name || 'Unknown';
        }
        // Lady scripts use @verreq 407; return the version they expect (LORD 4.07 protocol level)
        if (codeLower === 'ver') {
            return '407';
        }
        if (codeLower === 'play') {
            return this.player.Record || 0;
        }
        if (codeLower === 'filename') {
            return this.currentFilename;
        }

        // Player vars: Pxx
        const pMatch = code.match(/^[Pp](.+)$/);
        if (pMatch) {
            const pCode = pMatch[1].toLowerCase();
            const mapping = LdyExecutor.PLAYER_VAR_MAP[pCode];
            if (mapping) {
                if (mapping.field === '_playerIndex') {
                    return this.player.Record || 0;
                }
                if (mapping.field === '_marriedName') {
                    // &Pmn - name of spouse (read-only, requires player lookup)
                    return '';
                }
                if (mapping.field === '_isMarried') {
                    // &Pma - is player married? (read-only)
                    return (this.player.married_to ?? -1) >= 0;
                }
                const val = (this.player as Record<string, unknown>)[mapping.field];
                if (mapping.type === 'sexbool') {
                    return val === 'F' || val === 'f';
                }
                return val as LdyValue;
            }
        }

        return 0; // fallback
    }

    /**
     * Set a variable's value
     */
    private _setVar(varName: string, value: LdyValue): void {
        if (!varName.startsWith('&')) return;

        const code = varName.substring(1);

        // Numeric vars
        const numMatch = code.match(/^[Nn](\d+)$/);
        if (numMatch) {
            this.numVars[this._clampVarIndex(parseInt(numMatch[1]))] = this._toNum(value);
            return;
        }

        // String vars
        const strMatch = code.match(/^[Ss](\d+)$/);
        if (strMatch) {
            // LADY.DOC: string variables are max 79 characters (Turbo Pascal String[79])
            this.strVars[this._clampVarIndex(parseInt(strMatch[1]))] = String(value).substring(0, 79);
            return;
        }

        // Boolean vars
        const boolMatch = code.match(/^[Bb](\d+)$/);
        if (boolMatch) {
            this.boolVars[this._clampVarIndex(parseInt(boolMatch[1]))] = this._toBool(value);
            return;
        }

        // Player vars
        const pMatch = code.match(/^[Pp](.+)$/);
        if (pMatch) {
            const pCode = pMatch[1].toLowerCase();
            const mapping = LdyExecutor.PLAYER_VAR_MAP[pCode];
            if (mapping) {
                if (mapping.field === '_playerIndex') return; // read-only
                if (mapping.field === '_marriedName') return; // read-only
                if (mapping.field === '_isMarried') return;   // read-only

                if (mapping.type === 'sexbool') {
                    this.player[mapping.field] = this._toBool(value) ? 'F' : 'M';
                    return;
                }
                if (mapping.type === 'bool') {
                    this.player[mapping.field] = this._toBool(value);
                } else if (mapping.type === 'num') {
                    let numVal = this._toNum(value);
                    // Ensure certain values don't go below minimums
                    const field = mapping.field;
                    if (field === 'hp' && numVal < 0) numVal = 0;
                    if (field === 'cha' && numVal < 1) numVal = 1;
                    if (field === 'gold' && numVal < 0) numVal = 0;
                    if (field === 'gem' && numVal < 0) numVal = 0;
                    if (field === 'forest_fights' && numVal < 0) numVal = 0;
                    if (field === 'pvp_fights' && numVal < 0) numVal = 0;
                    this.player[mapping.field] = numVal;
                } else {
                    // String type
                    this.player[mapping.field] = String(value);
                }
                return;
            }
        }
    }

    /**
     * Resolve a value expression (could be a variable reference, random, or literal)
     */
    private _resolveValue(expr: LdyValue | undefined | null): LdyValue {
        if (expr === undefined || expr === null) return 0;
        const trimmed = String(expr).trim();

        // Variable reference
        if (trimmed.startsWith('&')) {
            // Random: &rndN (literal number max)
            const rndMatch = trimmed.match(/^&rnd(\d+)$/i);
            if (rndMatch) {
                const max = parseInt(rndMatch[1]);
                return random(max) + 1; // &rnd returns 1..N
            }

            // Random with variable max: &rnd&N1, &rnd&Plv, etc.
            const rndVarMatch = trimmed.match(/^&rnd(&.+)$/i);
            if (rndVarMatch) {
                const max = this._toNum(this._getVar(rndVarMatch[1]));
                if (max > 0) return random(max) + 1;
                return 1;
            }

            return this._getVar(trimmed);
        }

        // Boolean literals
        if (trimmed.toLowerCase() === 'true') return true;
        if (trimmed.toLowerCase() === 'false') return false;

        // Numeric literal
        const num = parseInt(trimmed);
        if (!isNaN(num)) return num;

        // String literal
        return trimmed;
    }

    /**
     * Expand all &variable references in a text string.
     * Replaces &Pxx, &N1, &S1, &nick, &hero, &filename, etc.
     */
    private _expandVars(text: string): string {
        if (!text) return '';

        let result = text;

        // Replace all &variable references
        // We need to handle longest match first to avoid partial replacements
        // e.g., &N10 before &N1

        // Replace &rndN patterns first (greedy number matching)
        result = result.replace(/&rnd(\d+)/gi, (_match: string, num: string) => {
            const max = parseInt(num);
            return String(random(max) + 1);
        });

        // Replace &rnd with variable max: &rnd&N1, &rnd&Plv
        result = result.replace(/&rnd(&[A-Za-z]\w*)/gi, (_match: string, varRef: string) => {
            const max = this._toNum(this._getVar(varRef));
            if (max > 0) return String(random(max) + 1);
            return '1';
        });

        // Replace &hero
        result = result.replace(/&hero/gi, () => {
            const state = this._gameState.value;
            return state ? ((state.latesthero) || 'an unknown hero') : 'an unknown hero';
        });

        // Replace &nick - player's LORD name
        result = result.replace(/&nick/gi, () => {
            return this.player.name || this.player.real_name || 'Unknown';
        });

        // Replace &name - full real name
        result = result.replace(/&name/gi, () => {
            return this.player.real_name || this.player.name || 'Unknown';
        });

        // Replace &filename
        result = result.replace(/&filename/gi, () => {
            return this.currentFilename;
        });

        // Replace &ver
        result = result.replace(/&ver/gi, '407');

        // Replace &playedtoday
        result = result.replace(/&playedtoday/gi, '0');

        // Replace &time (minutes remaining)
        result = result.replace(/&time/gi, '60');

        // Negative lookahead (?!e) prevents &play from consuming the prefix of &playedtoday
        result = result.replace(/&play(?!e)/gi, () => {
            return String(this.player.Record || 0);
        });

        // Replace &rip
        result = result.replace(/&rip/gi, () => this.rip ? 'true' : 'false');

        // Replace &clean
        result = result.replace(/&clean/gi, () => {
            return this.settings.clean_mode ? 'true' : 'false';
        });

        // Replace &file_created
        result = result.replace(/&file_created/gi, () => {
            return (this.fileCreated || false) ? 'true' : 'false';
        });

        // Replace &lorddir (return first LDY directory as the LORD base path)
        result = result.replace(/&lorddir/gi, () => {
            return this.ldyDirs[0] || '';
        });

        // Replace &F (first name)
        result = result.replace(/&F(?![A-Za-z])/gi, () => {
            const name = this.player.real_name || this.player.name || '';
            return name.split(' ')[0] || name;
        });

        // Replace &L (last name)
        result = result.replace(/&L(?![A-Za-z])/gi, () => {
            const name = this.player.real_name || this.player.name || '';
            const parts = name.split(' ');
            return parts.length > 1 ? parts.slice(1).join(' ') : '';
        });

        // Replace &Pxx player variables (do longer codes first)
        const pVarMap = LdyExecutor.PLAYER_VAR_MAP;
        // Sort by code length descending so &Phx matches before &Ph
        const pCodes = Object.keys(pVarMap).sort((a, b) => b.length - a.length);

        for (const code of pCodes) {
            const regex = new RegExp('&P' + this._escapeRegex(code), 'gi');
            result = result.replace(regex, () => {
                const mapping = pVarMap[code];
                if (mapping.field === '_playerIndex') {
                    return String(this.player.Record || 0);
                }
                const val = (this.player as Record<string, unknown>)[mapping.field];
                if (mapping.type === 'sexbool') {
                    return (val === 'F' || val === 'f') ? 'true' : 'false';
                }
                if (mapping.type === 'bool') {
                    return val ? 'true' : 'false';
                }
                if (val == null) return '';
                if (typeof val === 'string') return val;
                return String(val as string | number | boolean);
            });
        }

        // Replace &S variables (longest first: &S40 before &S4)
        for (let i = 40; i >= 1; i--) {
            const regex = new RegExp('&S' + i + '(?!\\d)', 'gi');
            result = result.replace(regex, () => String(this.strVars[i] || ''));
        }

        // Replace &N variables (longest first) - displayed with commas per spec
        for (let i = 40; i >= 1; i--) {
            const regex = new RegExp('&N' + i + '(?!\\d)', 'gi');
            result = result.replace(regex, () => {
                const val = this.numVars[i] || 0;
                return val.toLocaleString('en-US');
            });
        }

        // Replace &B variables
        for (let i = 40; i >= 1; i--) {
            const regex = new RegExp('&B' + i + '(?!\\d)', 'gi');
            result = result.replace(regex, () => (this.boolVars[i] ? 'true' : 'false'));
        }

        return result;
    }

    /**
     * Helper: escape string for use in regex
     */
    private _escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Convert value to number
     */
    private _toNum(value: LdyValue): number {
        if (typeof value === 'number') return Math.floor(value);
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'string') {
            const n = parseInt(value);
            return isNaN(n) ? 0 : n;
        }
        return 0;
    }

    /**
     * Convert value to boolean
     */
    private _toBool(value: LdyValue): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            // LORD stores horse as numeric 5 in player record; Lady treats it as boolean true
            if (lower === 'true' || lower === '1' || lower === '5') return true;
            if (lower === 'false' || lower === '0') return false;
            return value.length > 0;
        }
        return false;
    }
}

export { LdyExecutor as default };
