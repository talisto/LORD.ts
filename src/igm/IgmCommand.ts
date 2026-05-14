/**
 * IgmCommand - CLI command interface for IGMs.
 *
 * IGMs can expose administrative commands discoverable by lordctl.
 * Similar to `runMaint()` for daily maintenance, commands let IGMs define
 * sysop-facing CLI operations without coupling lordctl to specific IGMs.
 *
 * Usage in an IGM class:
 *
 *   import type { IgmCommand, IgmCommandContext } from '@lordts/igm';
 *
 *   class MyIgm {
 *       static commandGroup = 'myigm';
 *       static commands: IgmCommand[] = [
 *           { name: 'list', description: 'List things', handler: MyIgm.cmdList },
 *       ];
 *       private static cmdList(ctx: IgmCommandContext): void { ... }
 *   }
 */
import type { IStorage } from '@lordts/storage/IStorage';

/**
 * Context passed to IGM command handlers.
 *
 * Provides everything a CLI command needs: the project root, a database
 * connection, and the remaining command-line arguments.
 */
export interface IgmCommandContext {
    /** Absolute path to the LORD-TS project root directory. */
    basePath: string;
    /** Open storage instance for database access. */
    storage: IStorage;
    /** Remaining command-line arguments after the command name. */
    args: string[];
}

/**
 * Descriptor for a single CLI command exposed by an IGM.
 */
export interface IgmCommand {
    /** Command name (e.g. 'list', 'create', 'delete'). */
    name: string;
    /** One-line description shown in help output. */
    description: string;
    /** Usage hint for arguments (e.g. '<name>', '[name] [M|F]'). */
    usage?: string;
    /** The command handler function. */
    handler: (ctx: IgmCommandContext) => void | Promise<void>;
}
