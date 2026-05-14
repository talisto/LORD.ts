/**
 * LRDEVENT - Daily Event Maintenance Utility for LORD
 * Ported from LRDEVENT by Joseph Masters (Sons of Salami Software Group, 9/25/95)
 *
 * On each daily maintenance run, selects one or more events from lrdevent.json
 * and sends LORD mail to qualifying players. The mail contains backtick stat-change
 * codes that are applied when the player reads their mail.
 *
 * Targeting modes: All, Female, Male, Above <level>, Below <level>, Random <1-in-N>,
 * Kids (has children), Inn (sleeping at inn), Fields (not at inn).
 *
 * Events may be paired: when event N has a non-zero pair field, event pair[N] also runs,
 * but players already affected by event N are excluded from the paired event.
 */
import * as path from 'path';
import * as fs from 'fs';
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import {
    LRDEVENT_CONFIG_KEY, LRDEVENT_CONFIG_DEFAULTS,
} from './lrdeventDefs';
import type { LrdEvent, LrdEventConfig } from './lrdeventDefs';

// ─── Formula Evaluation ──────────────────────────────────────────────────────

/**
 * Strictly parse an integer token - returns 0 for any non-pure-integer string.
 * This matches Turbo Pascal's val() behavior (returns 0 on error), including
 * the case where backslash ('\', Pascal integer DIV) is not handled by the
 * original convert() function and causes those expressions to evaluate to 0.
 */
function parseToken(s: string): number {
    if (/^-?\d+$/.test(s.trim())) return parseInt(s.trim(), 10);
    return 0;
}

/**
 * Evaluate a simple arithmetic expression left-to-right.
 * Supports: +, -, *, / (integer division).
 * '\' (Pascal DIV) is NOT handled, matching the original convert() bug which
 * causes expressions containing '\' to produce 0.
 */
function evalExpr(expr: string): number {
    const parts: number[] = [];
    const ops: string[] = [];
    let current = '';
    for (let i = 0; i < expr.length; i++) {
        const c = expr[i];
        if (c === '*' || c === '/' || c === '+' || c === '-') {
            parts.push(parseToken(current));
            ops.push(c);
            current = '';
        } else {
            current += c;
        }
    }
    parts.push(parseToken(current));

    let result = parts[0];
    for (let i = 0; i < ops.length; i++) {
        const operand = parts[i + 1];
        switch (ops[i]) {
            case '*': result = result * operand; break;
            case '/': result = operand !== 0 ? Math.trunc(result / operand) : 0; break;
            case '+': result = result + operand; break;
            case '-': result = result - operand; break;
        }
    }
    return result;
}

/**
 * Evaluate an LRDEVENT formula string against a player's current stat and level.
 * Supports: LEVEL (player level), % suffix (percentage of statValue), arithmetic.
 * '\' (backslash division) is not handled - matching the original behavior.
 */
function convertFormula(formula: string, statValue: number, playerLevel: number): number {
    if (!formula || formula === '0') return 0;
    let expr = formula.replace(/LEVEL/g, String(playerLevel));
    const isNeg = expr.startsWith('-');
    if (isNeg) expr = expr.slice(1);
    const isPercent = expr.endsWith('%');
    if (isPercent) expr = expr.slice(0, -1);
    let result = evalExpr(expr);
    if (isPercent) result = Math.trunc((statValue * result) / 100);
    return isNeg ? -result : result;
}

// ─── Message Substitution ────────────────────────────────────────────────────

/**
 * Substitute %1-%9 and %0 placeholders in an event message with stat change amounts.
 * Uses absolute values (matching the original check() cleanup behavior).
 * sArr[0]=exp, [1]=def, [2]=str, [3]=hp, [4]=ff, [5]=pf, [6]=gold, [7]=charm,
 * [8]=lays, [9]=skill
 */
function substituteVars(msg: string, sArr: number[]): string {
    // %1..%9 → sArr[0]..sArr[8], %0 → sArr[9]
    const mapping: [string, number][] = [
        ['%1', 0], ['%2', 1], ['%3', 2], ['%4', 3], ['%5', 4],
        ['%6', 5], ['%7', 6], ['%8', 7], ['%9', 8], ['%0', 9],
    ];
    let result = msg;
    for (const [token, idx] of mapping) {
        if (result.includes(token)) {
            result = result.split(token).join(String(Math.abs(sArr[idx])));
        }
    }
    return result;
}

// ─── Player Filtering ────────────────────────────────────────────────────────

function isActivePlayer(p: LoadedPlayerRecord): boolean {
    return !(!p.name || p.name === 'X' || p.name === '');
}

function playerMatchesEvent(event: LrdEvent, p: LoadedPlayerRecord): boolean {
    const dir = event.Directed;
    const v = event.dirvar;
    switch (dir) {
        case 'Female': return p.sex === 'F';
        case 'Male': return p.sex === 'M';
        case 'Above': return p.level >= v;
        case 'Below': return p.level <= v;
        case 'Kids': return (p.kids || 0) > 0;
        case 'Inn': return !!p.inn;
        case 'Fields': return !p.inn;
        case 'Random': return random(v) === 0;
        case 'All':
        default: return true;
    }
}

// ─── Main Class ──────────────────────────────────────────────────────────────

class LordEvent {
    static get desc(): string { return '`2Lord Event'; }
    static readonly maintenanceOnly = true;

    static runMaint(deps: IgmDeps): void {
        const { storage, player } = deps;

        // Load config
        const rawCfg = storage.getConfig(LRDEVENT_CONFIG_KEY) as Partial<LrdEventConfig> | null;
        const cfg: LrdEventConfig = { ...LRDEVENT_CONFIG_DEFAULTS, ...(rawCfg ?? {}) };

        // Load events from JSON
        const eventsPath = path.join(deps.srcDir, 'lrdevent.json');
        if (!fs.existsSync(eventsPath)) return;
        const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8')) as LrdEvent[];
        if (events.length === 0) return;

        // Determine which events to run
        const eventIndices: number[] = [];
        if (cfg.mode === 1) {
            // Random chance: 1-in-count probability of running 1 event
            if (random(cfg.count) !== 0) return;
            eventIndices.push(pickEvent(events));
        } else {
            // Fixed count: run cfg.count events per day
            for (let i = 0; i < cfg.count; i++) {
                eventIndices.push(pickEvent(events));
            }
        }

        // Process each chosen event (handle pairs)
        const allPlayers = player.allPlayers().filter(isActivePlayer);
        const alreadyAffected = new Set<number>();

        for (const idx of eventIndices) {
            processEventChain(events, idx, allPlayers, alreadyAffected, storage);
        }
    }
}

// ─── Event Execution ─────────────────────────────────────────────────────────

/**
 * Pick a random event index (0-based) from the event array.
 */
function pickEvent(events: LrdEvent[]): number {
    return random(events.length);
}

/**
 * Process an event and its paired event (if any), matching the original
 * LRDEVENT chaining behavior with the alreadyAffected exclusion set.
 */
function processEventChain(
    events: LrdEvent[],
    startIdx: number,
    allPlayers: LoadedPlayerRecord[],
    alreadyAffected: Set<number>,
    storage: IgmDeps['storage'],
): void {
    const firstIdx = startIdx;
    let currentIdx = startIdx;
    const processed = new Set<number>();

    while (true) {  // break exits; matching original Pascal goto chain
        runEvent(events[currentIdx], allPlayers, alreadyAffected, storage);
        processed.add(currentIdx);

        const pairIdx = events[currentIdx].pair - 1; // convert 1-based to 0-based
        if (events[currentIdx].pair > 0 && pairIdx !== firstIdx && !processed.has(pairIdx)) {
            currentIdx = pairIdx;
        } else {
            break;
        }
    }
}

/**
 * Run a single event against all players, sending mail to qualifying ones.
 */
function runEvent(
    event: LrdEvent,
    allPlayers: LoadedPlayerRecord[],
    alreadyAffected: Set<number>,
    storage: IgmDeps['storage'],
): void {
    for (const p of allPlayers) {
        const recId = p.Record;
        if (alreadyAffected.has(recId)) continue;
        if (!playerMatchesEvent(event, p)) continue;

        alreadyAffected.add(recId);

        const mail = buildEventMail(event, p);
        if (mail) {
            storage.sendMail(recId, mail);
        }
    }
}

/**
 * Build the mail content for a player receiving this event.
 * Returns null if the event has no visible message and no stat changes.
 * Uses LORD backtick mail codes for stat changes; these are applied by
 * LdyExecutor._processMailCode() when the player reads their mail.
 */
function buildEventMail(event: LrdEvent, p: LoadedPlayerRecord): string | null {
    // Calculate stat changes - s[0..9] matches original s[1..10]
    // s[0]=exp, [1]=def, [2]=str, [3]=hp_max, [4]=ff, [5]=pf, [6]=gold(bank),
    // [7]=charm, [8]=lays, [9]=skill
    const s = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const level = p.level || 1;
    s[0] = convertFormula(event.expinc, p.exp || 0, level);
    s[1] = convertFormula(event.definc, p.def || 0, level);
    s[2] = convertFormula(event.strinc, p.str || 0, level);
    s[3] = convertFormula(event.hitinc, p.hp_max || 0, level);
    s[4] = convertFormula(event.ffinc, p.forest_fights || 0, level);
    s[5] = convertFormula(event.pfinc, p.pvp_fights || 0, level);
    s[6] = convertFormula(event.goldinc, p.bank || 0, level);
    // charminc: convert uses charm value; skill uses class-specific skill
    s[7] = convertFormula(event.charminc, p.cha || 0, level);
    s[8] = convertFormula(event.laysinc, p.laid || 0, level);
    const skillVal = p.clss === 1 ? (p.skillw || 0) : p.clss === 2 ? (p.skillm || 0) : (p.skillt || 0);
    s[9] = convertFormula(event.skillinc, skillVal, level);

    // Substitute %N placeholders in messages with absolute stat change amounts
    const msg1 = substituteVars(event.message, s);
    const msg2 = substituteVars(event.message2, s);
    const msg3 = substituteVars(event.message3, s);

    const hasMessage = msg1 && !msg1.includes('BLANK');
    const hasStats = s.some(v => v !== 0);
    if (!hasMessage && !hasStats) return null;

    const lines: string[] = [];

    // Mail header (only written if message line 1 is not blank)
    if (hasMessage) {
        lines.push('`2');
        lines.push('`%                          -*- Lord Event -*-');
        lines.push('`2-=-=-=--=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=');
        lines.push('`2  ' + msg1);
    }
    if (msg2 && !msg2.includes('BLANK')) lines.push('`2  ' + msg2);
    if (msg3 && !msg3.includes('BLANK')) lines.push('`2  ' + msg3);

    // Stat change codes (applied by LdyExecutor._processMailCode when mail is read)
    if (s[0] !== 0) lines.push('`E' + s[0]);         // exp
    if (s[1] !== 0) lines.push('`D' + s[1]);         // def
    if (s[2] !== 0) lines.push('`M' + s[2]);         // str
    if (s[3] !== 0) lines.push('`;' + s[3]);         // hp_max
    if (s[4] !== 0) lines.push('`,' + s[4]);         // forest_fights
    if (s[5] !== 0) lines.push('`:' + s[5]);         // pvp_fights (human fights)
    if (s[6] !== 0) lines.push('`b' + s[6]);         // bank gold
    // charm: send s[7] individual `} increments
    for (let i = 0; i < Math.abs(s[7]); i++) lines.push('`}');
    // lays: send s[8] individual `{ increments
    for (let i = 0; i < Math.abs(s[8]); i++) lines.push('`{');
    // skill: original bug - writes `S repeated s[7] times (charminc count), not s[9]
    // Since no default events use skillinc, this is a no-op in normal operation
    if (s[9] !== 0) {
        for (let i = 0; i < Math.abs(s[7]); i++) lines.push('`S');
    }

    lines.push('`2');
    return lines.join('\n');
}

export { LordEvent };
export default LordEvent;
