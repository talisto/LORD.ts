/**
 * IgmContext - Lightweight composition root for IGMs running as child processes.
 *
 * This is a stripped-down alternative to GameContext that bootstraps only the
 * dependencies exposed through IgmDeps. It does NOT create Game,
 * SessionManager, DailyMaint, ForestShaman, or any other server-only classes.
 */

'use strict';

import * as path from 'path';
import { Output } from '@lordts/core/io/Output';
import { Input } from '@lordts/core/io/Input';
import { IO } from '@lordts/core/io/IO';
import { GameEvents } from '@lordts/core/GameEvents';
import { FileUtils, SharedFileState } from '@lordts/util/FileUtils';
import { Lazy } from '@lordts/util/Lazy';
import type { IStorage } from '@lordts/storage/IStorage';
import { createStorageOnly } from '@lordts/storage/PersistenceFactory';
import { loadSettings } from '@lordts/util/Settings';
import { JsonLoader } from '@lordts/util/JsonLoader';
import Equipment from '@lordts/core/Equipment';
import Log from '@lordts/core/Log';
import Mail from '@lordts/core/Mail';
import Player from '@lordts/core/Player';
import State from '@lordts/core/State';
import { Marriage } from '@lordts/core/Marriage';
import type { ISession, User, Connection, Settings, UiMode, TrainerStats, ArmourStats, WeaponStats } from '@lordts/core/types';
import type { IgmDeps } from './IgmDeps';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { InfoFileData } from './IgmInfoFile';

export class IgmContext {
    // Core objects
    readonly baseDir: string;
    readonly runtimeDir: string;
    readonly srcDir: string;
    readonly settings: Settings;
    readonly storage: IStorage;
    readonly io: IO;
    readonly events: GameEvents;
    readonly player: Player;
    readonly state: State;
    readonly equipment: Equipment;
    readonly fileUtils: FileUtils;
    readonly log: Log;
    readonly morechk: boolean;

    // Private internals
    private readonly _session: ISession;
    private readonly _user: User;
    private readonly _connection: Connection;
    private readonly _uiMode: UiMode;
    private readonly _display: Output;
    private readonly _input: Input;
    private readonly _mail: Mail;
    private readonly _sharedFileState: SharedFileState;

    // Lazy shared deps
    // Mail expects Marriage, but most IGMs never touch marriage logic. Build it
    // only on demand so the child-process context stays minimal.
    private _marriage: Marriage | null = null;

    // Data loaded for lazy deps
    private readonly _dataDir: string;

    // Player record file reference
    private _pfile: IRecordFile | null = null;

    constructor(info: InfoFileData, lordDir: string, session: ISession, projectRootOverride?: string, srcDir?: string) {
        // Resolve project root:
        // - If explicitly provided (modern protocol), use it directly.
        // - Otherwise fall back to legacy behaviour (one level up from lordDir).
        const projectRoot = projectRootOverride
            ? projectRootOverride
            : path.resolve(lordDir, '..');
        this.baseDir = projectRoot + path.sep;
        this.runtimeDir = path.resolve(lordDir);
        this.srcDir = srcDir ?? process.cwd();
        this._dataDir = path.join(projectRoot, 'data');

        // Session data
        this._session = session;
        this._uiMode = { mode: info.rip ? 'rip' : 'ansi', lastScreen: '' };
        this._user = {
            name: info.handle,
            secondsRemaining: info.timeLeft * 60,
            secondsRemainingFrom: Math.floor(Date.now() / 1000),
            noTimeout: true, // Parent session already owns timeout enforcement
            ansiSupported: info.graphics >= 3,
        };
        this._connection = {
            remoteIp: '127.0.0.1',
            node: 0,
        };

        // Load settings
        this.settings = loadSettings(this._dataDir);
        this.morechk = true;

        // Database - derive path from settings + project root (same as the parent process)
        this.storage = createStorageOnly({ settings: this.settings, projectRoot });

        // Shared file state
        this._sharedFileState = {
            txtfile: null,
            txtindex: {},
            ripfile: null,
            ripindex: {},
        };

        // Tier 0: No inter-deps
        this.fileUtils = new FileUtils(
            this.settings, this.baseDir, [],
            this._sharedFileState, new Lazy(() => this.io),
        );
        const jsonLoader = new JsonLoader(this._dataDir, this.settings, projectRoot);
        const trainerStats = jsonLoader.load<TrainerStats[]>('trainers.json');
        const armourStats = jsonLoader.load<ArmourStats[]>('armour.json');
        const weaponStats = jsonLoader.load<WeaponStats[]>('weapons.json');
        this.equipment = new Equipment(trainerStats, armourStats, weaponStats);

        // Tier 1: IO stack
        const lazy = <T>(f: () => T) => new Lazy(f);

        this._input = new Input(
            this.settings, this._uiMode,
            lazy(() => this.player as Player | null),
            session, this._user,
        );

        this._display = new Output(
            null, // io not yet created
            this._uiMode, this.fileUtils, this.settings,
            '0.0.0', // ver - not critical for IGMs
            session, this._user, this._connection,
            this.baseDir, this._sharedFileState,
            lazy(() => this.player),
            lazy(() => this._mail),
            lazy(() => this.state),
            lazy(() => this.log),
            lazy(() => null as never), // dailyMaint - not available in IGM context
            lazy(() => null as never), // onlineBattle - not available
            lazy(() => this._getMarriage()),
            lazy(() => undefined), // igm
            lazy(() => this.storage),
        );

        this.io = new IO(this._display, this._input);
        this._display.io = this.io;
        this._input.io = this.io;
        this._display.input = this._input;

        // Wire GameEvents so io.prompt() emits events
        this.events = new GameEvents();
        this.io.events = this.events;

        // Forward events via IPC when running as a child process
        if (typeof process.send === 'function') {
            const send = process.send.bind(process);
            this.events.on((event) => {
                try {
                    send({ type: 'game_event', ...event });
                } catch (_e) {
                    // IPC channel may have closed - ignore
                }
            });
        }

        // Tier 1: Core services
        this.log = new Log(
            this.io, this._uiMode, this.fileUtils, this.settings,
            lazy(() => null as never), // dailyMaint
            lazy(() => this.state),
            lazy(() => this.storage),
        );

        this._mail = new Mail(
            this.io, this.fileUtils, this.settings,
            this._uiMode,
            lazy(() => this.state),
            lazy(() => this.player),
            lazy(() => this._mail),
            lazy(() => this._getMarriage()),
            lazy(() => this.log),
            lazy(() => null as never), // dailyMaint
            lazy(() => this.storage),
        );

        this.state = new State(
            [], // whitelist
            lazy(() => this.player as Player | null),
            lazy(() => this.storage),
        );

        this.player = new Player(
            this.io, this._user, this.fileUtils, this.settings,
            [], // whitelist
            this._mail,
            this._uiMode,
            '0.0.0', // ver
            lazy(() => this.state),
            lazy(() => null as never), // game - not available in IGM context
            lazy(() => this.storage),
            lazy(() => null as never), // battleCoordinator - not available in IGM context
        );
    }

    /**
     * Initialize the context: load state and player data from the database.
     * Must be called after construction and before building IgmDeps.
     */
    async init(accountNumber: number): Promise<void> {
        // Load game state
        await this.state.getState(false);

        // INFO.<node> carries the caller's record number. An IGM is entered
        // from an already-authenticated parent session, so it must load that
        // exact row directly rather than run Player.loadPlayer(). The latter
        // is an interactive login path and expects Game and
        // IBattleCoordinator dependencies that do not exist in this child
        // context.
        const record = this.player.playerGet(accountNumber);
        if (!record) {
            throw new Error(`Player record ${accountNumber} not found in database`);
        }
        this.player.player = record;
    }

    /**
     * Build the IgmDeps bundle that gets passed to IGM constructors.
     */
    getDeps(): IgmDeps {
        return {
            io: this.io,
            fileUtils: this.fileUtils,
            storage: this.storage,
            settings: this.settings,
            srcDir: this.srcDir,
            dataDir: this._dataDir,
            runtimeDir: this.runtimeDir,
            player: this.player,
            state: this.state,
            equipment: this.equipment,
            log: this.log,
            morechk: this.morechk,
        };
    }

    /**
     * Save player state and close the database connection.
     * Call this before exiting the IGM process.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    async shutdown(): Promise<void> {
        // Save player record
        if (this.player.player) {
            this.player.player.put();
        }
        // Close database
        this.storage.close();
    }

    // ── Lazy shared dependency getters ──────────────────────────────────

    private _getMarriage(): Marriage {
        if (!this._marriage) {
            const lazy = <T>(f: () => T) => new Lazy(f);
            this._marriage = new Marriage(
                this.io, this.state, this._mail,
                lazy(() => this.player),
                lazy(() => this.log),
                this._uiMode,
                lazy(() => this.storage),
            );
        }
        return this._marriage;
    }
}
