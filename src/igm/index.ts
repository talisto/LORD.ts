/**
 * IGM Package - In-Game Module support for LORD-TS.
 *
 * Contains the IGM engine (IGM.ts), dependency interface (IgmDeps),
 * and external process runner/bridge infrastructure.
 * See src/igm/README.md for developer documentation.
 *
 * Usage (IGM entry point):
 *   import { IgmRunner } from '@lordts/igm';
 *   import MyIgm from './myigm';
 *   IgmRunner.run(MyIgm);
 */

'use strict';

// IGM engine - core IGM loading and execution
export { default as IGM } from './IGM';

// IGM dependency interface
export type { IgmDeps } from './IgmDeps';

// IGM runner - the one-liner entry point for external IGMs
export { IgmRunner } from './IgmRunner';
export type { IgmClass } from './IgmRunner';

// IGM CLI commands - lordctl-discoverable command interface
export type { IgmCommand, IgmCommandContext } from './IgmCommand';

// INFO drop file - read/write LORD's original drop file format
export {
    writeInfoFile,
    readInfoFile,
    updateTimeLeft,
    removeInfoFile,
    infoFileName,
} from './IgmInfoFile';
export type { InfoFileData } from './IgmInfoFile';

// IgmContext - lightweight composition root for child processes
export { IgmContext } from './IgmContext';

// StdioIgmSession - ISession for piped stdin/stdout
export { StdioIgmSession } from './StdioIgmSession';

// ChildProcessBridge - parent-side IO bridge (used by IGM.ts)
export { ChildProcessBridge } from './ChildProcessBridge';
export type { BridgeOptions } from './ChildProcessBridge';
