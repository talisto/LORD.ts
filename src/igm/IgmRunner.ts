/**
 * IgmRunner - Entry point bootstrapper for IGMs running as child processes.
 *
 * IGM authors use this as a one-liner to make their IGM executable:
 *
 *   import { IgmRunner } from '@lordts/igm';
 *   import MyIgm from './myigm';
 *   IgmRunner.run(MyIgm);
 *
 * The runner:
 *   1. Parses command-line args (node# and lordDir)
 *   2. Reads the INFO.<node#> drop file
 *   3. Creates a lightweight IgmContext with piped stdio
 *   4. Builds IgmDeps and runs the IGM
 *   5. Saves player data and exits cleanly
 */

'use strict';

import * as path from 'path';
import { readInfoFile, updateTimeLeft } from './IgmInfoFile';
import { StdioIgmSession } from './StdioIgmSession';
import { IgmContext } from './IgmContext';
import type { IgmDeps } from './IgmDeps';
import type { IgmCommand } from './IgmCommand';

/** The interface an IGM class must satisfy to be run by IgmRunner. */
export interface IgmClass {
    new(deps: IgmDeps): { run(): Promise<void> };
    desc?: string;
    /** If true, this module is a maintenance-only utility and must not appear in the player-facing IGM menu. */
    maintenanceOnly?: boolean;
    runMaint?(deps: IgmDeps): Promise<void>;
    /**
     * CLI command group name for lordctl (e.g. 'npc').
     * If not set, defaults to the IGM's directory name.
     */
    commandGroup?: string;
    /**
     * CLI commands exposed to lordctl.
     * Each command has a name, description, and handler function.
     */
    commands?: IgmCommand[];
}

export class IgmRunner {
    /**
     * Run an IGM class as an external process.
     *
     * Reads node number and LORD directory from process.argv, bootstraps
     * the IgmContext, and executes the IGM.
     *
     * @param igmCtor - The IGM class to instantiate and run.
     */
    static async run(igmCtor: IgmClass): Promise<void> {
        const startTime = Date.now();

        // Parse command-line arguments
        // Usage: node igm/<name>/main.js <node#> <lordDir> [projectRoot]
        const nodeArg = process.argv[2];
        const lordDirArg = process.argv[3];
        const projectRootArg = process.argv[4];

        if (nodeArg === undefined || lordDirArg === undefined) {
            process.stderr.write(
                `Usage: node ${path.basename(process.argv[1] || 'main.js')} <node#> <lordDir> [projectRoot]\n`,
            );
            process.exit(1);
        }

        const nodeNum = parseInt(nodeArg, 10);
        if (isNaN(nodeNum) || nodeNum < 0) {
            process.stderr.write(`Invalid node number: ${nodeArg}\n`);
            process.exit(1);
        }

        const lordDir = path.resolve(lordDirArg);

        let context: IgmContext | null = null;

        // Graceful shutdown on signals and normal exit. Child IGMs must save the
        // player record and write remaining time back into INFO.<node> so the
        // parent door session sees an accurate time-left value.
        const cleanup = async (): Promise<void> => {
            if (context) {
                try {
                    await context.shutdown();
                } catch (e) {
                    process.stderr.write(`Shutdown error: ${String(e)}\n`);
                }
            }
            // Update time left in the INFO file
            const elapsedMinutes = (Date.now() - startTime) / 60000;
            try {
                const info = readInfoFile(lordDir, nodeNum);
                const remaining = Math.max(0, info.timeLeft - elapsedMinutes);
                updateTimeLeft(lordDir, nodeNum, remaining);
            } catch (_e) {
                // INFO file may have been cleaned up already
            }
        };

        // SIGTERM is used by ChildProcessBridge timeouts; SIGINT covers manual
        // interruption during development.
        process.on('SIGTERM', () => { void cleanup().then(() => process.exit(0)); });
        process.on('SIGINT',  () => { void cleanup().then(() => process.exit(0)); });

        try {
            // Read the drop file
            const info = readInfoFile(lordDir, nodeNum);

            // Create stdio session for piped I/O; pass ANSI flag from INFO file (graphics >= 3 = ANSI)
            const session = new StdioIgmSession(24, 80, info.graphics >= 3);

            // Bootstrap the lightweight context
            // projectRoot is passed explicitly so IgmContext doesn't need to
            // derive it from lordDir (which breaks when runtimeDir != <root>/runtime).
            // srcDir is the IGM's own source directory (where main.ts lives).
            const projectRoot = projectRootArg ? path.resolve(projectRootArg) : undefined;
            const srcDir = path.dirname(path.resolve(process.argv[1] || '.'));
            context = new IgmContext(info, lordDir, session, projectRoot, srcDir);
            await context.init(info.accountNumber);

            // Build deps and run the IGM
            const deps = context.getDeps();
            const igm = new igmCtor(deps);
            await igm.run();

            // Save and exit
            await cleanup();
            process.exit(0);
        } catch (e) {
            process.stderr.write(`IGM error: ${String(e)}\n`);
            if (e instanceof Error && e.stack) {
                process.stderr.write(e.stack + '\n');
            }
            await cleanup();
            process.exit(1);
        }
    }
}
