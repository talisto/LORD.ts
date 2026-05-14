/**
 * LORD - Legend of the Red Dragon
 * BBS Door Mode Entry Point
 *
 * Runs LORD as an external door game for BBS systems.
 * Reads user information from standard BBS drop files (DOOR32.SYS,
 * DOOR.SYS, DORINFOx.DEF) and communicates via stdin/stdout or an
 * inherited socket handle.
 *
 * Usage:
 *   node door.js                        # Auto-detect drop file in cwd
 *   node door.js -d /path/to/door32.sys # Explicit drop file path
 *   node door.js --env-file .env.game2  # Load env vars from a specific file
 *   node door.js --local [username]     # Local mode (no drop file)
 *   node door.js --node 2               # Override node number
 *   node door.js --use-realname         # Use real name instead of alias
 *
 * Environment variables:
 *   LORD_DOOR_USE_ALIAS=true|false      # Use alias (default) or real name
 *   LORD_DOOR_TIME_WARN=5,2,1           # Warning intervals in minutes
 *   LORD_DOOR_DROP_DIR=/path            # Directory to search for drop files
 */

'use strict';

import * as path from 'path';
import { GameContext } from '@lordts/core/GameContext';
import { GameExitError } from '@lordts/core/GameExitError';
import ConsoleSession from '@lordts/core/net/ConsoleSession';
import { extractEnvFileArg, loadDotEnv } from '@lordts/util/Settings';
import { DoorSession } from '@lordts/door/DoorSession';
import { autoDetect, parseDropFile } from '@lordts/door/DropFileParser';
import { CommType, DropFileFormat } from '@lordts/door/DoorTypes';
import type { DropFileData, DoorConfig } from '@lordts/door/DoorTypes';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(argv: string[]): DoorConfig {
    const config: DoorConfig = {
        useAlias: true,
        timeWarnings: [5, 2, 1],
        localMode: false,
    };

    let i = 2; // skip node and script
    while (i < argv.length) {
        const arg = argv[i];

        if (arg === '-d' || arg === '--dropfile') {
            config.dropFilePath = argv[++i];
        } else if (arg === '--local' || arg === '-l' || arg === '--cli') {
            config.localMode = true;
        } else if (arg === '--node' || arg === '-n') {
            config.nodeNumber = parseInt(argv[++i], 10);
        } else if (arg === '--god') {
            config.godMode = true;
        } else if (arg === '--use-realname') {
            config.useAlias = false;
        } else if (arg === '--drop-dir') {
            config.dropFileDir = argv[++i];
        } else if (arg === '--format') {
            const fmt = argv[++i]?.toLowerCase();
            if (fmt === 'door32') config.dropFileFormat = DropFileFormat.Door32Sys;
            else if (fmt === 'doorsys') config.dropFileFormat = DropFileFormat.DoorSys;
            else if (fmt === 'dorinfo') config.dropFileFormat = DropFileFormat.DorInfo;
        } else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        } else if (!arg.startsWith('-') && config.localMode) {
            // Positional arg after --local: treat as username
            config.dropFilePath = undefined;
            // Store username in env for pickup later
            process.env['LORD_DOOR_LOCAL_USER'] = arg;
        }
        i++;
    }

    // Apply environment variable overrides
    if (process.env['LORD_DOOR_USE_ALIAS'] !== undefined) {
        config.useAlias = process.env['LORD_DOOR_USE_ALIAS'] !== 'false' &&
                          process.env['LORD_DOOR_USE_ALIAS'] !== '0';
    }
    if (process.env['LORD_DOOR_TIME_WARN']) {
        config.timeWarnings = process.env['LORD_DOOR_TIME_WARN']
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0);
    }
    if (process.env['LORD_DOOR_DROP_DIR'] && !config.dropFileDir) {
        config.dropFileDir = process.env['LORD_DOOR_DROP_DIR'];
    }

    return config;
}

function printUsage(): void {
    process.stdout.write([
        'Usage: node door.js [options]',
        '',
        'Run LORD as a BBS door game or CLI mode. In door mode, reads user info from',
        'a drop file (DOOR32.SYS, DOOR.SYS, or DORINFOx.DEF) and communicates via',
        'stdin/stdout or an inherited socket handle.',
        '',
        'Options:',
        '  -d, --dropfile <path>   Path to the drop file',
        '  --drop-dir <dir>        Directory to search for drop files (default: cwd)',
        '  --env-file <path>       Load environment variables from a specific file',
        '  --format <type>         Force drop file format: door32, doorsys, dorinfo',
        '  -n, --node <num>        Override node number',
        '  --use-realname          Use real name instead of alias for player name',
        '  -l, --local [username]  Local mode (no drop file, no time limit)',
        '  --cli [username]        Alias for --local (CLI mode)',
        '  --god                   Enable the in-game god console (local mode only)',
        '  -h, --help              Show this help',
        '',
        'Environment variables:',
        '  LORD_DOOR_USE_ALIAS=true    Use alias (default) or real name',
        '  LORD_DOOR_TIME_WARN=5,2,1   Time warning intervals (minutes)',
        '  LORD_DOOR_DROP_DIR=/path     Drop file search directory',
        '',
        'Supported BBS software:',
        '  Mystic BBS, Enigma½, Talisman, Synchronet, WWIV 5.x, EleBBS',
        '',
    ].join('\n'));
}

// ============================================================================
// Local Mode (no drop file)
// ============================================================================

/**
 * Synthesize a DropFileData for local/CLI mode (no BBS connection).
 * securityLevel 255 = sysop-level (BBS max). emulation 1 = ANSI (DOOR32.SYS codes).
 * timeLeftMinutes 999 = effectively unlimited.
 */
function createLocalDropFile(username: string): DropFileData {
    return {
        format: DropFileFormat.None,
        commType: CommType.Local,
        socketHandle: 0,
        baudRate: 0,
        bbsId: 'Local',
        userRecordPos: 0,
        realName: username,
        alias: username,
        securityLevel: 255,
        timeLeftMinutes: 999, // effectively unlimited
        emulation: 1, // ANSI
        nodeNumber: 1,
    };
}

// ============================================================================
// Main
// ============================================================================

void (async () => {
    const projectRoot = path.basename(__dirname) === 'dist'
        ? path.resolve(__dirname, '../')
        : __dirname;

    let argv = process.argv;
    let envFilePath: string | undefined;
    try {
        ({ argv, envFilePath } = extractEnvFileArg(projectRoot, process.argv));
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stderr.write('Error: ' + msg + '\r\n');
        process.exit(1);
    }

    loadDotEnv(projectRoot, envFilePath);

    const config = parseArgs(argv);
    let dropFile: DropFileData | null;
    const startedAt = Date.now();

    if (config.localMode) {
        // Local mode: no drop file, prompt for username if not provided
        const username = process.env['LORD_DOOR_LOCAL_USER'] || '';
        if (!username) {
            process.stdout.write('\r\nLORD - Legend of the Red Dragon (Door - Local Mode)\r\n');
            process.stdout.write('Enter your username: ');

            // Simple line read from stdin for local mode
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            const line = await new Promise<string>((resolve) => {
                process.stdin.once('data', (data: string) => resolve(data.trim()));
            });
            process.stdin.pause();

            if (!line) {
                process.stdout.write('No username entered. Exiting.\r\n');
                process.exit(0);
            }
            dropFile = createLocalDropFile(line);
        } else {
            dropFile = createLocalDropFile(username);
        }
    } else if (config.dropFilePath) {
        // Explicit drop file path
        dropFile = parseDropFile(config.dropFilePath, config.dropFileFormat);
    } else {
        // Auto-detect drop file in specified directory or cwd
        dropFile = autoDetect(config.dropFileDir);
    }

    if (!dropFile) {
        process.stderr.write(
            'Error: No drop file found. Use -d <path> to specify one, or --local for local mode.\r\n' +
            'Searched for: door32.sys, door.sys, dorinfo*.def\r\n',
        );
        process.exit(1);
    }

    if (config.godMode && !config.localMode) {
        process.stderr.write('Error: --god is only supported with --local / --cli.\r\n');
        process.exit(1);
    }

    // Apply node number override
    if (config.nodeNumber !== undefined) {
        dropFile.nodeNumber = config.nodeNumber;
    }

    // Determine the player username from drop file
    const username = config.useAlias && dropFile.alias
        ? dropFile.alias
        : dropFile.realName;

    if (!username) {
        process.stderr.write('Error: No username found in drop file.\r\n');
        process.exit(1);
    }

    if (config.localMode) {
        process.stderr.write(
            `[LORD CLI] User: ${username} | Node: ${dropFile.nodeNumber}\n`,
        );
    } else {
        process.stderr.write(
            `[LORD Door] User: ${username} | Node: ${dropFile.nodeNumber} | ` +
            `Time: ${dropFile.timeLeftMinutes}m | BBS: ${dropFile.bbsId || 'unknown'} | ` +
            `Format: ${dropFile.format}\n`,
        );
    }

    const doorIO = config.localMode
        ? null
        : new DoorSession(dropFile, config.timeWarnings);
    const IO = doorIO ?? new ConsoleSession();

    // Create the game context
    const ctx = new GameContext(
        __dirname,
        IO,
        username,
        false, // RIP not typically supported in door mode
        '127.0.0.1',
        dropFile.nodeNumber,
        undefined,
        false,
        config.godMode === true,
    );

    if (config.localMode) {
        ctx.user.noTimeout = true;
        if (config.godMode) {
            process.stderr.write('[LORD CLI] God mode enabled. Press / at any key prompt.\n');
        }
    } else {
        ctx.user.secondsRemaining = dropFile.timeLeftMinutes * 60;
        ctx.user.secondsRemainingFrom = Math.floor(Date.now() / 1000);
    }

    // Detect RIP/SyncTerm terminal support (BBS connections only; skip local mode)
    if (!config.localMode) {
        if (await ctx.io.detectRip(5000)) {
            ctx.rip = true;
            ctx.fileUtils.buildRipIndex();
            process.stderr.write('[LORD Door] RIP terminal detected, uploading icons...\n');
            if (!await ctx.io.uploadRipIcons()) {
                ctx.rip = false;
                process.stderr.write('[LORD Door] RIP icon upload failed; disabling RIP.\n');
            }
        }
    }

    // Register cleanup for unexpected exits
    process.on('exit', () => {
        const player = ctx.player;
        if (player && player.on_now) {
            player.on_now = false;
            try { player.put(); } catch (_e) { /* ignore */ }
        }
        while (ctx.cleanupFiles.length) {
            const fileToClean = ctx.cleanupFiles.shift();
            if (fileToClean) {
                try { ctx.fileUtils.fileRemove(fileToClean); } catch (_e) { /* ignore */ }
            }
        }
    });

    try {
        await ctx.game.start();
    } catch (e: unknown) {
        if (!(e instanceof GameExitError)) {
            throw e;
        }
        // Normal game exit
    } finally {
        IO.closeConnection();
        const elapsed = doorIO
            ? doorIO.timekeeper.elapsedSeconds
            : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        process.stderr.write(
            `[LORD ${config.localMode ? 'CLI' : 'Door'}] Session ended for ${username} | Duration: ${mins}m ${secs}s\n`,
        );
    }
})();
