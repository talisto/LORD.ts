/**
 * lordctl.ts - LORD Admin CLI Utility
 *
 * Provides administrative commands for managing the LORD game without
 * having to start a full game session. Useful for development, testing,
 * and day-to-day sysop tasks.
 *
 * Usage:
 *   npm run lordctl -- [--env-file <path>] <command> [args...]
 *
 * Built-in commands:
 *   maint                   Run daily maintenance immediately
 *   day                     Show current day number
 *   day advance [N]         Advance the day counter by N (default: 1)
 *   state                   Show current game state summary
 *   player list             List all active players
 *   player reset <name>     Reset a player's stats to starting values
 *   player delete <name>    Delete a player (marks record as 'X')
 *   igm list                List all configured IGMs
 *   igm enable <name>       Enable an IGM
 *   igm disable <name>      Disable an IGM
 *   help                    Show this help message
 *
 * IGM commands:
 *   Additional commands are discovered from enabled IGMs in 3rdparty.dat.
 *   IGMs that define a static `commands` array and optional `commandGroup`
 *   string expose their commands under `lordctl <group> <command> [args]`.
 *   Run `lordctl help` to see all available commands.
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import { extractEnvFileArg, loadDotEnv, loadSettings } from '@lordts/util/Settings';
import { createStorageOnly } from '@lordts/storage/PersistenceFactory';
import { DailyMaintenanceRunner } from '@lordts/core/DailyMaintenanceRunner';
import { GameRoundResetService } from '@lordts/core/GameRoundResetService';
import type { IStorage } from '@lordts/storage/IStorage';
import { Player_Def, State_Def } from '@lordts/storage/RecordDefs';
import type { IgmClass } from '@lordts/igm/IgmRunner';
import type { IgmCommand } from '@lordts/igm/IgmCommand';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve the project root regardless of whether lordctl.js is running from
 * the compiled dist/ directory or directly from the project root.  Mirrors
 * the identical logic in GameContext.ts so all path lookups stay consistent.
 */
function resolveProjectRoot(): string {
    return path.basename(__dirname) === 'dist'
        ? path.resolve(__dirname, '../')
        : __dirname;
}

/** Resolve the runtime dir from settings (supports LORD_RUNTIME_DIR env override). */
function resolveRtDir(basePath: string): string {
    const settings = loadSettings(path.join(basePath, 'data'));
    return path.resolve(basePath, settings.runtime_dir ?? 'runtime');
}

function openStorage(basePath: string): IStorage {
    const settings = loadSettings(path.join(basePath, 'data'));
    const runtimeDir = path.resolve(basePath, settings.runtime_dir ?? 'runtime');
    if (!fs.existsSync(runtimeDir)) {
        process.stderr.write(`Runtime directory not found: ${runtimeDir}\n`);
        process.stderr.write('Run the game at least once to initialise the storage.\n');
        process.exit(1);
    }
    return createStorageOnly({ settings, projectRoot: basePath });
}

function die(msg: string): never {
    process.stderr.write(`Error: ${msg}\n`);
    process.exit(1);
}

// ============================================================================
// Commands
// ============================================================================

async function cmdMaint(basePath: string): Promise<void> {
    process.stdout.write('LORD Daily Maintenance\n');
    process.stdout.write('======================\n\n');

    const { dayBefore, dayAfter } = await DailyMaintenanceRunner.run(basePath);
    process.stdout.write(`Running maintenance for day ${dayBefore} → ${dayBefore + 1}...\n\n`);

    process.stdout.write(`\nMaintenance complete. Day is now ${dayAfter}.\n`);
}

function cmdDayShow(basePath: string): void {
    const storage = openStorage(basePath);
    const stateFile = storage.create('state', State_Def);
    if (stateFile.length === 0) {
        process.stdout.write('No state record found.\n');
    } else {
        const rec = stateFile.get(0);
        process.stdout.write(`Current day: ${rec?.days ?? 0}\n`);
    }
    storage.close();
}

function cmdDayAdvance(basePath: string, n: number): void {
    if (n < 1 || !Number.isInteger(n)) die('N must be a positive integer');

    const storage = openStorage(basePath);
    const stateFile = storage.create('state', State_Def);
    if (stateFile.length === 0) {
        process.stdout.write('No state record found.\n');
    } else {
        const rec = stateFile.get(0);
        if (rec) {
            const before = rec.days as number;
            rec.days = before + n;
            rec.put();
            process.stdout.write(`Day advanced from ${before} to ${rec.days as number}.\n`);
            process.stdout.write('Note: use "maint" to actually run daily maintenance logic.\n');
        }
    }
    storage.close();
}

function cmdState(basePath: string): void {
    const storage = openStorage(basePath);
    const stateFile = storage.create('state', State_Def);
    if (stateFile.length === 0) {
        process.stdout.write('No state record found.\n');
    } else {
        const rec = stateFile.get(0);
        if (rec) {
            process.stdout.write('Game State\n');
            process.stdout.write('==========\n');
            process.stdout.write(`  Days running   : ${rec.days}\n`);
            process.stdout.write(`  Won by (record): ${rec.won_by === -1 ? '(nobody yet)' : rec.won_by}\n`);
            process.stdout.write(`  Latest hero    : ${rec.latesthero || '(none)'}\n`);
            process.stdout.write(`  Log date       : ${rec.log_date}\n`);
            process.stdout.write(`  Married to Seth  : ${rec.married_to_seth === -1 ? '(nobody)' : rec.married_to_seth}\n`);
            process.stdout.write(`  Married to Violet: ${rec.married_to_violet === -1 ? '(nobody)' : rec.married_to_violet}\n`);
        }
    }
    storage.close();
}

function cmdPlayerList(basePath: string): void {
    const storage = openStorage(basePath);
    const playerFile = storage.create('players', Player_Def);
    const len = playerFile.length;

    if (len === 0) {
        process.stdout.write('No players found.\n');
        storage.close();
        return;
    }

    const header = [
        '#'.padEnd(4),
        'Name'.padEnd(20),
        'Level'.padEnd(6),
        'HP'.padEnd(8),
        'Exp'.padEnd(12),
        'Gold'.padEnd(12),
        'Class'.padEnd(6),
        'Sex',
    ].join('  ');
    process.stdout.write(header + '\n');
    process.stdout.write('-'.repeat(header.length) + '\n');

    let count = 0;
    for (let i = 0; i < len; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        const name = rec.name as string;
        if (!name || name === 'X') continue;

        const classNames: Record<number, string> = { 1: 'DK', 2: 'Thief', 3: 'Mage' };
        const cls = classNames[rec.clss as number] ?? String(rec.clss);
        const online = rec.on_now ? ' *' : '';

        process.stdout.write([
            String(i).padEnd(4),
            (name + online).padEnd(20),
            String(rec.level).padEnd(6),
            `${rec.hp}/${rec.hp_max}`.padEnd(8),
            String(rec.exp).padEnd(12),
            String(rec.gold).padEnd(12),
            cls.padEnd(6),
            rec.sex as string,
        ].join('  ') + '\n');
        count++;
    }
    process.stdout.write(`\n${count} active player(s). (* = currently online)\n`);
    storage.close();
}

function cmdPlayerReset(basePath: string, name: string): void {
    const storage = openStorage(basePath);
    const playerFile = storage.create('players', Player_Def);
    const len = playerFile.length;

    const target = name.toLowerCase();
    let found = false;

    for (let i = 0; i < len; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        if ((rec.name as string).toLowerCase() !== target) continue;
        if (rec.name === 'X') continue;

        found = true;
        const savedName = rec.name as string;
        const savedRealName = rec.real_name as string;
        const savedSex = rec.sex as string;
        const savedClss = rec.clss as number;

        rec.reInit();
        rec.name = savedName;
        rec.real_name = savedRealName;
        rec.sex = savedSex;
        rec.clss = savedClss;
        rec.on_now = false;
        rec.last_on_unix = 0;
        rec.put();

        process.stdout.write(`Player "${savedName}" reset to starting stats.\n`);
        break;
    }

    if (!found) {
        process.stderr.write(`Player "${name}" not found.\n`);
        process.exit(1);
    }
    storage.close();
}

function cmdPlayerDelete(basePath: string, name: string): void {
    const storage = openStorage(basePath);
    const playerFile = storage.create('players', Player_Def);
    const len = playerFile.length;

    const target = name.toLowerCase();
    let found = false;

    for (let i = 0; i < len; i++) {
        const rec = playerFile.get(i);
        if (!rec) continue;
        if ((rec.name as string).toLowerCase() !== target) continue;
        if (rec.name === 'X') continue;

        found = true;
        const savedName = rec.name as string;
        rec.name = 'X';
        rec.real_name = 'X';
        rec.on_now = false;
        rec.put();
        process.stdout.write(`Player "${savedName}" deleted.\n`);
        break;
    }

    if (!found) {
        process.stderr.write(`Player "${name}" not found.\n`);
        process.exit(1);
    }
    storage.close();
}

// ============================================================================
// IGM Command Discovery
// ============================================================================

/**
 * Discovered IGM command group: an IGM that exposes CLI commands.
 */
interface IgmCommandGroup {
    /** The command group name (e.g. 'npc'). */
    group: string;
    /** The IGM's display description. */
    desc: string;
    /** The commands this IGM exposes. */
    commands: IgmCommand[];
}

/**
 * Resolve a 3rdparty.dat cmdline path to a loadable module path.
 * Tries .ts and .js extensions, checks igm/ and dist/igm/ prefixes.
 */
function resolveIgmModulePath(basePath: string, cmdlinePath: string): string | null {
    const normalized = cmdlinePath.replace(/\\/g, '/').split(/\s/)[0];
    const candidates: string[] = [];
    const full = path.isAbsolute(normalized)
        ? normalized
        : path.join(basePath, normalized);
    candidates.push(full);
    if (!normalized.startsWith('igm/')) {
        candidates.push(path.join(basePath, 'igm', normalized));
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
        if (fs.existsSync(candidate + '.ts')) return candidate + '.ts';
        if (fs.existsSync(candidate + '.js')) return candidate + '.js';
    }
    return null;
}

/**
 * Discover all IGM command groups from enabled entries in 3rdparty.dat.
 * Loads each enabled IGM module and checks for `commandGroup` and `commands`.
 */
function discoverIgmCommands(basePath: string): IgmCommandGroup[] {
    const datPath = path.join(resolveRtDir(basePath), '3rdparty.dat');
    if (!fs.existsSync(datPath)) return [];

    const { entries } = readIgmDat(datPath);
    const groups: IgmCommandGroup[] = [];

    for (const entry of entries) {
        if (!entry.enabled) continue;

        const modulePath = resolveIgmModulePath(basePath, entry.cmdline);
        if (!modulePath || !fs.existsSync(modulePath)) continue;

        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const exported = require(modulePath) as Record<string, unknown>;
            const IgmCtor = ((exported && exported.default) ? exported.default : exported) as IgmClass;
            if (!IgmCtor || !IgmCtor.commands || IgmCtor.commands.length === 0) continue;

            // Derive group name: explicit commandGroup, or directory name from the module path
            const group = IgmCtor.commandGroup
                ?? path.basename(path.dirname(modulePath));
            const desc = IgmCtor.desc ?? group;

            groups.push({ group, desc, commands: IgmCtor.commands });
        } catch (_e) {
            // Module failed to load - skip silently (lordctl should be resilient)
        }
    }

    return groups;
}

/**
 * Try to route a top-level command to an IGM command group.
 * Returns true if the command was handled, false otherwise.
 */
async function tryIgmCommand(basePath: string, cmd: string, subArgs: string[]): Promise<boolean> {
    const groups = discoverIgmCommands(basePath);
    const group = groups.find(g => g.group === cmd);
    if (!group) return false;

    const sub = subArgs[0];

    // No subcommand or "help" - show available commands for this group
    if (!sub || sub === 'help') {
        process.stdout.write('Commands for ' + group.group + ':\n\n');
        for (const c of group.commands) {
            const usage = c.usage ? ' ' + c.usage : '';
            process.stdout.write('  ' + group.group + ' ' + c.name + usage + '\n');
            process.stdout.write('    ' + c.description + '\n');
        }
        process.stdout.write('\n');
        return true;
    }

    const command = group.commands.find(c => c.name === sub);
    if (!command) {
        const names = group.commands.map(c => '"' + c.name + '"').join(', ');
        die('Unknown ' + group.group + ' subcommand: ' + sub + '. Available: ' + names + '.');
    }

    const storage = openStorage(basePath);
    try {
        await command.handler({ basePath, storage, args: subArgs.slice(1) });
    } finally {
        storage.close();
    }
    return true;
}

// ============================================================================
// IGM Commands
// ============================================================================

interface IgmEntry {
    cmdline: string;
    desc: string;
    enabled: boolean;
}

function readIgmDat(datPath: string): { header: string; entries: IgmEntry[]; exists: boolean } {
    if (!fs.existsSync(datPath)) {
        return { header: '', entries: [], exists: false };
    }

    const content = fs.readFileSync(datPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const headerLines: string[] = [];
    const entries: IgmEntry[] = [];

    let i = 0;
    // Collect header: leading ';' comment lines before the first data entry
    while (i < lines.length) {
        const line = lines[i];
        if (line.trimStart().startsWith(';') || line.trim() === '') {
            headerLines.push(line);
            i++;
        } else {
            break;
        }
    }

    // Parse body: pairs of (cmdline, desc) lines; ';'-prefixed pairs are disabled
    while (i < lines.length) {
        const raw = lines[i];
        const trimmed = raw.trim();

        if (trimmed === '') { i++; continue; }

        if (trimmed.startsWith(';')) {
            const disabledCmdline = trimmed.substring(1).trim();
            if (!disabledCmdline) { i++; continue; }
            i++;
            while (i < lines.length && lines[i].trim() === '') i++;
            if (i < lines.length && lines[i].trim().startsWith(';')) {
                const disabledDesc = lines[i].trim().substring(1).trim();
                i++;
                entries.push({ cmdline: disabledCmdline, desc: disabledDesc, enabled: false });
            }
            continue;
        }

        // Active cmdline line
        const cmdline = trimmed;
        i++;
        while (i < lines.length && lines[i].trim() === '') i++;
        if (i < lines.length) {
            const desc = lines[i].trim();
            if (!desc.startsWith(';')) {
                i++;
                entries.push({ cmdline, desc, enabled: true });
                continue;
            }
        }
        entries.push({ cmdline, desc: cmdline, enabled: true });
    }

    return { header: headerLines.join('\n'), entries, exists: true };
}

function writeIgmDat(datPath: string, header: string, entries: IgmEntry[]): void {
    const lines: string[] = [];
    if (header) lines.push(header);
    for (const entry of entries) {
        if (entry.enabled) {
            lines.push(entry.cmdline);
            lines.push(entry.desc);
        } else {
            lines.push(';' + entry.cmdline);
            lines.push(';' + entry.desc);
        }
    }
    fs.writeFileSync(datPath, lines.join('\n') + '\n', 'utf8');
}

/** Find IGM entry index by case-insensitive partial match on cmdline or desc. */
function findIgmIndex(entries: IgmEntry[], name: string): number {
    const lower = name.toLowerCase();
    // Exact match on base name of cmdline path first
    let idx = entries.findIndex(e => {
        const base = path.basename(e.cmdline.split(' ')[0], path.extname(e.cmdline.split(' ')[0]));
        return base.toLowerCase() === lower;
    });
    if (idx !== -1) return idx;
    // Partial match on cmdline path
    idx = entries.findIndex(e => e.cmdline.toLowerCase().includes(lower));
    if (idx !== -1) return idx;
    // Partial match on desc
    return entries.findIndex(e => e.desc.toLowerCase().includes(lower));
}

function cmdIgmList(basePath: string): void {
    const datPath = path.join(resolveRtDir(basePath), '3rdparty.dat');
    const { entries, exists } = readIgmDat(datPath);

    if (!exists) {
        process.stdout.write('No 3rdparty.dat found. Run the game once to auto-generate it.\n');
        return;
    }
    if (entries.length === 0) {
        process.stdout.write('No IGMs configured in runtime/3rdparty.dat.\n');
        return;
    }

    const header = ['Status'.padEnd(10), 'Description'.padEnd(30), 'Cmdline'].join('  ');
    process.stdout.write(header + '\n');
    process.stdout.write('-'.repeat(header.length) + '\n');
    for (const e of entries) {
        process.stdout.write([
            (e.enabled ? 'enabled' : 'disabled').padEnd(10),
            e.desc.padEnd(30),
            e.cmdline,
        ].join('  ') + '\n');
    }
    process.stdout.write(`\n${entries.length} IGM(s).\n`);
}

function cmdIgmSetEnabled(basePath: string, name: string, enable: boolean): void {
    const datPath = path.join(resolveRtDir(basePath), '3rdparty.dat');
    const { header, entries, exists } = readIgmDat(datPath);

    if (!exists) die('No 3rdparty.dat found. Run the game once to auto-generate it.');

    const idx = findIgmIndex(entries, name);
    if (idx === -1) {
        process.stderr.write(`IGM "${name}" not found.\n`);
        process.stderr.write('Use "igm list" to see available IGMs.\n');
        process.exit(1);
    }

    const entry = entries[idx];
    if (entry.enabled === enable) {
        process.stdout.write(`IGM "${entry.desc}" is already ${enable ? 'enabled' : 'disabled'}.\n`);
        return;
    }

    entry.enabled = enable;
    writeIgmDat(datPath, header, entries);
    process.stdout.write(`IGM "${entry.desc}" ${enable ? 'enabled' : 'disabled'}.\n`);
}

/**
 * Reset the game after a win.
 *
 * - Sets state.won_by = -1 (unlocks the game)
 * - Sets state.days = 0 (restarts tournament timer if active)
 * - Resets state marriage pointers
 * - Resets all live player records to starting stats, keeping name / sex /
 *   class so players do not need to re-register
 * - Deletes the gameover_notified flag so the admin email can fire again on
 *   the next win
 */
async function cmdResetGame(basePath: string): Promise<void> {
    process.stdout.write('LORD - Legend of the Red Dragon: Game Reset\n');
    process.stdout.write('===========================================\n\n');

    const result = GameRoundResetService.reset(basePath);
    if (result.hadStateRecord) {
        if (result.previousWinner !== null && result.previousWinner >= 0) {
            process.stdout.write(`  Previous winner record #${result.previousWinner} cleared\n`);
        }
        process.stdout.write('  State reset: won_by=-1, days=0\n');
    } else {
        process.stdout.write('  No state record found - nothing to reset in state table.\n');
    }

    process.stdout.write(`  Players reset: ${result.resetCount} (${result.skippedCount} empty/deleted slots skipped)\n`);
    if (result.notificationFlagRemoved) {
        process.stdout.write('  Notification flag removed (admin email will fire on next win)\n');
    }

    process.stdout.write('\nReset complete. Players can now log in and start a new game.\n');
}

function showHelp(basePath: string): void {
    process.stdout.write([
        'Usage: npm run lordctl -- [--env-file <path>] <command> [args...]',
        '',
        'Commands:',
        '  maint                   Run daily maintenance immediately',
        '  day                     Show current day number',
        '  day advance [N]         Advance the day counter by N (default: 1)',
        '  state                   Show current game state summary',
        '  reset-game              Reset game after a win, keeping player accounts',
        '  player list             List all active players',
        '  player reset <name>     Reset a player\'s stats to starting values',
        '  player delete <name>    Delete a player (marks record as \'X\')',
        '  igm list                List all configured IGMs with enabled/disabled status',
        '  igm enable <name>       Enable an IGM by name (partial match)',
        '  igm disable <name>      Disable an IGM by name (partial match)',
        '  help                    Show this help message',
        '',
        'Global options:',
        '  --env-file <path>       Load environment variables from a specific file',
        '',
    ].join('\n'));

    // Show discovered IGM command groups
    const groups = discoverIgmCommands(basePath);
    if (groups.length > 0) {
        process.stdout.write('IGM Commands (from enabled IGMs):\n');
        for (const g of groups) {
            for (const c of g.commands) {
                const usage = c.usage ? ' ' + c.usage : '';
                process.stdout.write('  ' + (g.group + ' ' + c.name + usage).padEnd(26) + c.description + '\n');
            }
        }
        process.stdout.write('\n');
    }

    process.stdout.write([
        'Examples:',
        '  npm run lordctl -- maint',
        '  npm run lordctl -- --env-file .env.game2 state',
        '  npm run lordctl -- day advance',
        '  npm run lordctl -- day advance 3',
        '  npm run lordctl -- player list',
        '  npm run lordctl -- player reset "Barak"',
        '  npm run lordctl -- reset-game',
        '  npm run lordctl -- igm list',
        '  npm run lordctl -- igm disable felicity',
        '  npm run lordctl -- igm enable lotto',
        '',
    ].join('\n'));
}

// ============================================================================
// Entry point
// ============================================================================

void (async () => {
    const basePath = resolveProjectRoot();
    let argv = process.argv;
    let envFilePath: string | undefined;
    try {
        ({ argv, envFilePath } = extractEnvFileArg(basePath, process.argv));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write('Error: ' + msg + '\n');
        process.exit(1);
    }

    loadDotEnv(basePath, envFilePath);
    const args = argv.slice(2);
    const cmd = args[0];

    if (!cmd || cmd === 'help' || cmd === '--help') {
        showHelp(basePath);
        process.exit(0);
    }

    if (cmd === 'maint') {
        await cmdMaint(basePath);

    } else if (cmd === 'day') {
        const sub = args[1];
        if (!sub || sub === 'show') {
            cmdDayShow(basePath);
        } else if (sub === 'advance') {
            const n = args[2] ? parseInt(args[2], 10) : 1;
            if (isNaN(n)) die('N must be a number');
            cmdDayAdvance(basePath, n);
        } else {
            die(`Unknown day subcommand: ${sub}. Use "show" or "advance [N]".`);
        }

    } else if (cmd === 'state') {
        cmdState(basePath);

    } else if (cmd === 'reset-game') {
        await cmdResetGame(basePath);

    } else if (cmd === 'player') {
        const sub = args[1];
        if (!sub || sub === 'list') {
            cmdPlayerList(basePath);
        } else if (sub === 'reset') {
            const name = args[2];
            if (!name) die('Usage: player reset <name>');
            cmdPlayerReset(basePath, name);
        } else if (sub === 'delete') {
            const name = args[2];
            if (!name) die('Usage: player delete <name>');
            cmdPlayerDelete(basePath, name);
        } else {
            die(`Unknown player subcommand: ${sub}. Use "list", "reset <name>", or "delete <name>".`);
        }

    } else if (cmd === 'igm') {
        const sub = args[1];
        if (!sub || sub === 'list') {
            cmdIgmList(basePath);
        } else if (sub === 'enable') {
            const name = args[2];
            if (!name) die('Usage: igm enable <name>');
            cmdIgmSetEnabled(basePath, name, true);
        } else if (sub === 'disable') {
            const name = args[2];
            if (!name) die('Usage: igm disable <name>');
            cmdIgmSetEnabled(basePath, name, false);
        } else {
            die(`Unknown igm subcommand: ${sub}. Use "list", "enable <name>", or "disable <name>".`);
        }

    } else {
        // Try IGM-provided commands (discovered from enabled IGMs in 3rdparty.dat)
        const handled = await tryIgmCommand(basePath, cmd, args.slice(1));
        if (!handled) {
            process.stderr.write('Unknown command: ' + cmd + '\n\n');
            showHelp(basePath);
            process.exit(1);
        }
    }
})();
