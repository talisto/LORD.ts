/**
 * IgmDeps - dependency bundle passed to JS-module IGMs (In-Game Modules).
 *
 * Provides individual services to IGM plugins without coupling them to the
 * full GameContext class.  IGM.ts builds an IgmDeps object from GameContext
 * and passes it to each IGM class constructor.
 */
import type { IStorage } from '@lordts/storage/IStorage';
import type Equipment from '@lordts/core/Equipment';
import type FileUtils from '@lordts/util/FileUtils';
import type IO from '@lordts/core/io/IO';
import type Log from '@lordts/core/Log';
import type Player from '@lordts/core/Player';
import type State from '@lordts/core/State';
import type { Settings } from '@lordts/core/types';

export interface IgmDeps {
    io: IO;
    fileUtils: FileUtils;
    storage: IStorage;
    settings: Settings;
    /** IGM's own source directory (where the IGM's .ts/.js files live). No trailing separator. */
    srcDir: string;
    /** Project data directory (read-only shared data like monsters.json). No trailing separator. */
    dataDir: string;
    /** Resolved absolute path to the runtime data directory. Use for per-game writable state. */
    runtimeDir: string;
    player: Player;
    state: State;
    equipment: Equipment;
    log: Log;
    morechk: boolean;
}
