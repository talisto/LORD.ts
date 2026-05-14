/**
 * LDY Parser - Parses LORD's "Lady" scripting language (.LDY files)
 *
 * The Lady scripting language was introduced in LORD 4.05+ to allow sysops
 * to customize random events without editing compiled binaries. LDY files
 * contain one or more named sections (prefixed with @#SECTIONNAME) each
 * containing commands like @writeln, @if/@else/@endif, @case/@endcase,
 * @set, @math, @choice, @display/@enddisplay, etc.
 *
 * This parser reads .LDY files, splits them into named sections, and
 * produces an array of parsed command objects for each section that
 * the LdyExecutor can run.
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';

// ============ AST Node Interfaces ============

export interface BaseLdyCommand {
    type: string;
    line: number;
}

export interface WritelnCommand extends BaseLdyCommand {
    type: 'writeln';
    text: string;
}

export interface WriteCommand extends BaseLdyCommand {
    type: 'write';
    text: string;
}

export interface DisplayStartCommand extends BaseLdyCommand {
    type: 'display_start';
}

export interface DisplayEndCommand extends BaseLdyCommand {
    type: 'display_end';
}

export interface ChoiceCommand extends BaseLdyCommand {
    type: 'choice';
    options: string;
    prompt: string;
}

export interface CaseStartCommand extends BaseLdyCommand {
    type: 'case_start';
    variable: string;
    id: string;
}

export interface CaseEndCommand extends BaseLdyCommand {
    type: 'case_end';
    id: string;
}

export interface CaseLabelCommand extends BaseLdyCommand {
    type: 'case_label';
    label: string;
    body: LdyCommand | null;
}

export interface IfCommand extends BaseLdyCommand {
    type: 'if';
    left: string;
    operator: string;
    right: string;
    id: string;
}

export interface ElseCommand extends BaseLdyCommand {
    type: 'else';
    id: string;
}

export interface EndifCommand extends BaseLdyCommand {
    type: 'endif';
    id: string;
}

export interface BeginCommand extends BaseLdyCommand {
    type: 'begin';
}

export interface EndCommand extends BaseLdyCommand {
    type: 'end';
}

export interface SetCommand extends BaseLdyCommand {
    type: 'set';
    variable: string;
    value: string;
}

export interface MathCommand extends BaseLdyCommand {
    type: 'math';
    target: string;
    expression: string;
}

export interface LabelCommand extends BaseLdyCommand {
    type: 'label';
    name: string;
}

export interface GotoCommand extends BaseLdyCommand {
    type: 'goto';
    target: string;
}

export interface RunsubCommand extends BaseLdyCommand {
    type: 'runsub';
    section: string;
    file: string | null;
}

export interface HitakeyCommand extends BaseLdyCommand {
    type: 'hitakey';
}

export interface ClrscrCommand extends BaseLdyCommand {
    type: 'clrscr';
}

export interface EndquestCommand extends BaseLdyCommand {
    type: 'endquest';
}

export interface EndgameCommand extends BaseLdyCommand {
    type: 'endgame';
}

export interface SaveplayerCommand extends BaseLdyCommand {
    type: 'saveplayer';
}

export interface VerreqCommand extends BaseLdyCommand {
    type: 'verreq';
    version: string;
}

export interface DelayCommand extends BaseLdyCommand {
    type: 'delay';
    ms: number;
}

export interface EventnameCommand extends BaseLdyCommand {
    type: 'eventname';
    name: string;
}

export interface AuthorCommand extends BaseLdyCommand {
    type: 'author';
    name: string;
}

export interface AuthidCommand extends BaseLdyCommand {
    type: 'authid';
    id: string;
}

export interface CodebeginCommand extends BaseLdyCommand {
    type: 'codebegin';
}

export interface CodeendCommand extends BaseLdyCommand {
    type: 'codeend';
}

export interface TargetCommand extends BaseLdyCommand {
    type: 'target';
    name: string;
}

export interface OpenfileCommand extends BaseLdyCommand {
    type: 'openfile';
    args: string;
}

export interface ClosefileCommand extends BaseLdyCommand {
    type: 'closefile';
}

export interface ReadlineCommand extends BaseLdyCommand {
    type: 'readline';
    variable: string;
}

export interface IsbitsetCommand extends BaseLdyCommand {
    type: 'isbitset';
    source: string;
    bit: string;
    dest: string;
}

export interface SetbitCommand extends BaseLdyCommand {
    type: 'setbit';
    variable: string;
    bit: string;
    value: string;
}

export interface ChangewepCommand extends BaseLdyCommand {
    type: 'changewep';
    num: number;
}

export interface ChangearmCommand extends BaseLdyCommand {
    type: 'changearm';
    num: number;
}

export interface DisplayfileCommand extends BaseLdyCommand {
    type: 'displayfile';
    file: string;
    section: string | null;
}

export interface PromptCommand extends BaseLdyCommand {
    type: 'prompt';
    varNum: number;
    maxLen: number;
    blueBg: boolean;
}

export interface PromptnCommand extends BaseLdyCommand {
    type: 'promptn';
    varNum: number;
    maxLen: number;
}

export interface RewritefileCommand extends BaseLdyCommand {
    type: 'rewritefile';
    handle: string;
    filename: string;
}

export interface AppendfileCommand extends BaseLdyCommand {
    type: 'appendfile';
    handle: string;
    filename: string;
}

export interface UpstrCommand extends BaseLdyCommand {
    type: 'upstr';
    variable: string;
}

export interface LowstrCommand extends BaseLdyCommand {
    type: 'lowstr';
    variable: string;
}

export interface DebugCommand extends BaseLdyCommand {
    type: 'debug';
    mode: string;
}

export interface TextCommand extends BaseLdyCommand {
    type: 'text';
    value: string;
}

export interface NoopCommand extends BaseLdyCommand {
    type: 'noop';
}

export interface UnknownCommand extends BaseLdyCommand {
    type: 'unknown';
    command: string;
    args: string;
}

export type LdyCommand =
    | WritelnCommand
    | WriteCommand
    | DisplayStartCommand
    | DisplayEndCommand
    | ChoiceCommand
    | CaseStartCommand
    | CaseEndCommand
    | CaseLabelCommand
    | IfCommand
    | ElseCommand
    | EndifCommand
    | BeginCommand
    | EndCommand
    | SetCommand
    | MathCommand
    | LabelCommand
    | GotoCommand
    | RunsubCommand
    | HitakeyCommand
    | ClrscrCommand
    | EndquestCommand
    | EndgameCommand
    | SaveplayerCommand
    | VerreqCommand
    | DelayCommand
    | EventnameCommand
    | AuthorCommand
    | AuthidCommand
    | CodebeginCommand
    | CodeendCommand
    | TargetCommand
    | OpenfileCommand
    | ClosefileCommand
    | ReadlineCommand
    | IsbitsetCommand
    | SetbitCommand
    | ChangewepCommand
    | ChangearmCommand
    | DisplayfileCommand
    | PromptCommand
    | PromptnCommand
    | RewritefileCommand
    | AppendfileCommand
    | UpstrCommand
    | LowstrCommand
    | DebugCommand
    | TextCommand
    | NoopCommand
    | UnknownCommand;

export interface IfCondition {
    left: string;
    operator: string;
    right: string;
    id: string;
}

// ============ Parser Functions ============

/**
 * Parse a raw LDY file into a map of { sectionName -> [commands] }
 * @param content - Raw text content of the LDY file
 * @param filename - Optional filename for error messages
 * @returns Map of section name to parsed command arrays
 */
export function parseLdyFile(content: string, filename?: string): Map<string, LdyCommand[]> {
    const sections = new Map<string, LdyCommand[]>();
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let currentSection: string | null = null;
    let currentLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trimStart();

        // Section delimiter: @#SECTIONNAME
        if (trimmed.startsWith('@#')) {
            // Save previous section
            if (currentSection !== null) {
                sections.set(currentSection, parseSection(currentLines, filename, currentSection));
            }
            currentSection = trimmed.substring(2).trim().toUpperCase();
            currentLines = [];
            continue;
        }

        if (currentSection !== null) {
            currentLines.push(line);
        }
    }

    // Save last section
    if (currentSection !== null) {
        sections.set(currentSection, parseSection(currentLines, filename, currentSection));
    }

    return sections;
}

/**
 * Parse the lines of a single section into command objects.
 * @param lines - Raw lines in this section
 * @param filename - Source filename
 * @param sectionName - Section name for error messages
 * @returns Array of command objects
 */
export function parseSection(lines: string[], filename?: string, sectionName?: string): LdyCommand[] {
    const commands: LdyCommand[] = [];
    let inDisplay = false;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmedRaw = rawLine.trimStart();

        if (inDisplay) {
            if (trimmedRaw.startsWith('@')) {
                const cmd = parseLine(trimmedRaw, rawLine, i + 1, filename, sectionName);
                if (cmd) {
                    commands.push(cmd);
                    if (cmd.type === 'display_end') {
                        inDisplay = false;
                    }
                }
            } else {
                commands.push({ type: 'text', value: rawLine, line: i + 1 });
            }
            continue;
        }

        const stripped = stripComment(rawLine);
        const trimmed = stripped.trimStart();

        // Skip blank lines and pure comment lines
        if (trimmed === '') continue;

        // Parse the command
        const cmd = parseLine(trimmed, rawLine, i + 1, filename, sectionName);
        if (cmd) {
            commands.push(cmd);
            if (cmd.type === 'display_start') {
                inDisplay = true;
            }
        }
    }

    return commands;
}

/**
 * Strip comments from a line. Comments start with ; but NOT inside strings.
 * A semicolon after a command is a comment.
 */
function stripComment(line: string): string {
    // If line starts with ; it's a pure comment
    const trimmed = line.trimStart();
    if (trimmed.startsWith(';')) return '';

    // Only strip full-line comments; inline semicolons are stripped per-command in parseAtCommand

    return line;
}

/**
 * Parse a single line into a command object
 */
function parseLine(
    trimmed: string,
    rawLine: string,
    lineNum: number,
    filename?: string,
    sectionName?: string
): LdyCommand | null {
    // Handle @@ literal (display a literal @)
    if (trimmed.startsWith('@@')) {
        return { type: 'writeln', text: '@' + trimmed.substring(2), line: lineNum };
    }

    // Handle @commands
    if (trimmed.startsWith('@')) {
        return parseAtCommand(trimmed, lineNum, filename, sectionName);
    }

    // Handle case labels like "Y: @begin" or "1: @begin"
    const caseMatch = trimmed.match(/^(\S+):\s*(.*)/);
    if (caseMatch) {
        const label = caseMatch[1];
        const rest = caseMatch[2].trim();
        const body = rest ? parseLine(rest, rawLine, lineNum, filename, sectionName) : null;
        return { type: 'case_label', label: label, body: body, line: lineNum };
    }

    // Lines inside @display blocks or after @writeln that are just text
    // These get handled as implicit writeln with the raw text
    // But actually in the LDY language, bare text lines only appear inside @display blocks
    // Outside of @display, bare text doesn't really occur in well-formed LDY
    // We'll treat them as text nodes for @display blocks to collect
    return { type: 'text', value: trimmed, line: lineNum };
}

/**
 * Parse an @command
 */
function parseAtCommand(
    trimmed: string,
    lineNum: number,
    _filename?: string,
    _sectionName?: string
): LdyCommand {
    // Extract command name and arguments
    const spaceIdx = trimmed.indexOf(' ');
    let cmdName: string;
    let args: string;

    if (spaceIdx === -1) {
        cmdName = trimmed.toLowerCase();
        args = '';
    } else {
        cmdName = trimmed.substring(0, spaceIdx).toLowerCase();
        args = trimmed.substring(spaceIdx + 1);
    }

    // Strip trailing comments from args. ; marks a comment on all commands except @display.
    if (cmdName !== '@display') {
        const semiIdx = args.indexOf(';');
        if (semiIdx >= 0) {
            args = args.substring(0, semiIdx).trimEnd();
        }
    }

    switch (cmdName) {
        case '@writeln':
            return { type: 'writeln', text: args, line: lineNum };

        case '@write':
            return { type: 'write', text: args, line: lineNum };

        case '@display':
            return { type: 'display_start', line: lineNum };

        case '@enddisplay':
            return { type: 'display_end', line: lineNum };

        case '@choice': {
            // @choice YN   prompt text
            // @choice GBS   prompt text
            const choiceMatch = args.match(/^(\S+)\s(.*)/);
            if (choiceMatch) {
                return { type: 'choice', options: choiceMatch[1], prompt: choiceMatch[2], line: lineNum };
            }
            return { type: 'choice', options: args.trim(), prompt: '', line: lineNum };
        }

        case '@case': {
            // @case responce 1
            // @case response 1
            // @case &N1 1
            // @case &rnd5 1
            // @case &Pcl 1
            // @case &S1 of  (undocumented alternate syntax)
            const caseArgs = args.trim();
            const caseParts = caseArgs.split(/\s+/);
            const variable = caseParts[0];
            const id = caseParts.length > 1 ? caseParts[caseParts.length - 1] : '1';
            // The trailing number pairs @case with its @endcase for nesting, not a case value
            return { type: 'case_start', variable: variable, id: id, line: lineNum };
        }

        case '@endcase': {
            const id = args.trim() || '1';
            return { type: 'case_end', id: id, line: lineNum };
        }

        case '@if': {
            // @if &Pht < &Phx 1
            // @if &Pcl = 3 1
            // @if &rnd3 = 1 1
            // @if &Pho is true 1
            // @if &Pho is false 1
            // @if &Pge < 1 1
            const ifParts = parseIfCondition(args.trim());
            return { type: 'if', ...ifParts, line: lineNum };
        }

        case '@else': {
            const id = args.trim() || '1';
            return { type: 'else', id: id, line: lineNum };
        }

        case '@endif': {
            const id = args.trim() || '1';
            return { type: 'endif', id: id, line: lineNum };
        }

        case '@begin':
            return { type: 'begin', line: lineNum };

        case '@end':
            return { type: 'end', line: lineNum };

        case '@set': {
            // @set &N1 to &rnd9
            // @set &Pgo to +&N1
            // @set &Pht to &Phx
            // @set &Pho to true
            // @set &Pho to false
            // @set &Psb to true
            // @set &Pch to +1
            // @set &Pff to -1
            // @set &S1 to warrior
            // @set &Pam to 1
            // @set &Pam to not true  (for boolean negation)
            const setParts = args.trim().split(/\s+/);
            const setVar = setParts[0];
            // Skip 'to' keyword
            const toIdx = setParts.indexOf('to');
            const setValueParts = toIdx >= 0 ? setParts.slice(toIdx + 1) : setParts.slice(2);
            const setValue = setValueParts.join(' ');
            return { type: 'set', variable: setVar, value: setValue, line: lineNum };
        }

        case '@math': {
            // @math &N1 = 500 * &Plv
            // @math &N1 = &rnd500 + 250
            // @math &N1 = &N1 * &Plv
            // @math &N10 = 10000 * &Plv
            // @math &N1 = &Pge - 1
            // @math &N1 = &Pff + 2
            const mathMatch = args.match(/^(\S+)\s*=\s*(.*)/);
            if (mathMatch) {
                const target = mathMatch[1];
                const expression = mathMatch[2].trim();
                return { type: 'math', target: target, expression: expression, line: lineNum };
            }
            return { type: 'noop', line: lineNum };
        }

        case '@label': {
            return { type: 'label', name: args.trim(), line: lineNum };
        }

        case '@goto': {
            return { type: 'goto', target: args.trim(), line: lineNum };
        }

        case '@runsub': {
            // @runsub SECTIONNAME filename.ldy
            // @runsub OLDMAN &filename
            const parts = args.trim().split(/\s+/);
            const subSection = parts[0];
            const subFile = parts.length > 1 ? parts[1] : null;
            return { type: 'runsub', section: subSection, file: subFile, line: lineNum };
        }

        case '@hitakey':
            return { type: 'hitakey', line: lineNum };

        case '@clrscr':
        case '@cls':
            return { type: 'clrscr', line: lineNum };

        case '@endquest':
            return { type: 'endquest', line: lineNum };

        case '@closequest':
            return { type: 'endquest', line: lineNum }; // Same as endquest per spec

        case '@endgame':
            return { type: 'endgame', line: lineNum };

        case '@saveplayer':
            return { type: 'saveplayer', line: lineNum };

        case '@verreq':
            // Version requirement - we always satisfy this
            return { type: 'verreq', version: args.trim(), line: lineNum };

        case '@delay': {
            // LADY.DOC says "100 is a second" - units are centiseconds (1/100th sec)
            const delayVal = parseInt(args.trim()) || 100;
            return { type: 'delay', ms: delayVal * 10, line: lineNum };
        }

        case '@eventname':
            return { type: 'eventname', name: args.trim(), line: lineNum };

        case '@author':
            return { type: 'author', name: args.trim(), line: lineNum };

        case '@authid':
            return { type: 'authid', id: args.trim(), line: lineNum };

        case '@codebegin':
            return { type: 'codebegin', line: lineNum };

        case '@codeend':
            return { type: 'codeend', line: lineNum };

        case '@target':
            return { type: 'target', name: args.trim(), line: lineNum };

        case '@openfile':
            return { type: 'openfile', args: args.trim(), line: lineNum };

        case '@closefile':
            return { type: 'closefile', line: lineNum };

        case '@readline':
        case '@readln':
            return { type: 'readline', variable: args.trim(), line: lineNum };

        case '@isbitset': {
            const isbitParts = args.trim().split(/\s+/);
            return { type: 'isbitset', source: isbitParts[0], bit: isbitParts[1], dest: isbitParts[2], line: lineNum };
        }

        case '@setbit': {
            const setbitParts = args.trim().split(/\s+/);
            return { type: 'setbit', variable: setbitParts[0], bit: setbitParts[1], value: setbitParts[2], line: lineNum };
        }

        case '@changewep': {
            return { type: 'changewep', num: parseInt(args.trim()) || 1, line: lineNum };
        }

        case '@changearm': {
            return { type: 'changearm', num: parseInt(args.trim()) || 1, line: lineNum };
        }

        case '@displayfile': {
            const dfParts = args.trim().split(/\s+/);
            return { type: 'displayfile', file: dfParts[0], section: dfParts[1] || null, line: lineNum };
        }

        case '@prompt':
        case '@prompts': {
            // @prompt <&S var num> <max length> [true/false]
            const promptParts = args.trim().split(/\s+/);
            return {
                type: 'prompt',
                varNum: parseInt(promptParts[0]) || 1,
                maxLen: parseInt(promptParts[1]) || 79,
                blueBg: (promptParts[2] || '').toLowerCase() === 'true',
                line: lineNum
            };
        }

        case '@promptn': {
            // @promptn <&N var num> <max length of digits>
            const pnParts = args.trim().split(/\s+/);
            return {
                type: 'promptn',
                varNum: parseInt(pnParts[0]) || 1,
                maxLen: parseInt(pnParts[1]) || 10,
                line: lineNum
            };
        }

        case '@rewritefile': {
            const rwParts = args.trim().split(/\s+/);
            return { type: 'rewritefile', handle: rwParts[0], filename: rwParts.slice(1).join(' '), line: lineNum };
        }

        case '@appendfile': {
            const afParts = args.trim().split(/\s+/);
            return { type: 'appendfile', handle: afParts[0], filename: afParts.slice(1).join(' '), line: lineNum };
        }

        case '@upstr': {
            return { type: 'upstr', variable: args.trim(), line: lineNum };
        }

        case '@lowstr': {
            return { type: 'lowstr', variable: args.trim(), line: lineNum };
        }

        case '@debug': {
            return { type: 'debug', mode: args.trim(), line: lineNum };
        }

        default:
            // Unknown command - treat as noop but log it
            return { type: 'unknown', command: cmdName, args: args, line: lineNum };
    }
}

/**
 * Parse an @if condition string into its components
 * Examples:
 *   "&Pht < &Phx 1"
 *   "&Pcl = 3 1"
 *   "&rnd3 = 1 1"
 *   "&Pho is true 1"
 *   "&Pho is false 1"
 *   "&Pge < 1 1"
 *   "&rip is true 2"
 *   "&N1 <= 32000 4"
 */
function parseIfCondition(str: string): IfCondition {
    const parts = str.split(/\s+/);

    // Last token is a numeric nesting ID that pairs @if with @else/@endif, not part of the condition
    const id = parts[parts.length - 1];

    // Check for "is" form: &var is true/false ID
    const isIdx = parts.indexOf('is');
    if (isIdx >= 0) {
        const left = parts.slice(0, isIdx).join(' ');
        const right = parts.slice(isIdx + 1, parts.length - 1).join(' ');
        return { left: left, operator: 'is', right: right, id: id };
    }

    // Check for comparison operators
    const operators = ['<=', '>=', '<>', '!=', '<', '>', '='];
    for (const op of operators) {
        // Find the operator in the parts
        const opIdx = parts.indexOf(op);
        if (opIdx >= 0) {
            const left = parts.slice(0, opIdx).join(' ');
            const right = parts.slice(opIdx + 1, parts.length - 1).join(' ');
            return { left: left, operator: op, right: right, id: id };
        }
    }

    // Fallback - shouldn't normally happen
    return { left: parts[0], operator: '=', right: parts[1] || '0', id: id || '1' };
}

/**
 * Load and parse all LDY files from a directory
 * @param ldyDir - Path to the directory containing .LDY files
 * @returns Map of filename -> sections map
 */
export function loadLdyDirectory(ldyDir: string): Map<string, Map<string, LdyCommand[]>> {
    const files = new Map<string, Map<string, LdyCommand[]>>();

    if (!fs.existsSync(ldyDir)) {
        return files;
    }

    const entries = fs.readdirSync(ldyDir);
    for (const entry of entries) {
        if (entry.toUpperCase().endsWith('.LDY')) {
            const fullPath = path.join(ldyDir, entry);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const sections = parseLdyFile(content, entry);
            // Store with lowercase key for easy lookup
            files.set(entry.toLowerCase(), sections);
        }
    }

    return files;
}

/**
 * Build a structured tree from flat commands - groups @display blocks,
 * @if/@else/@endif, @case/@endcase, @begin/@end into nested structures.
 * This is done at execution time by the executor.
 */

export { parseLdyFile as default };
