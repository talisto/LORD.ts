/**
 * GameContext - Composition Root for LORD
 *
 * This is the main bootstrap class that instantiates all feature src
 * and wires their individual dependencies. Each class receives only the
 * dependencies it actually needs - no class receives the full GameContext
 * (except IGM, which needs it to pass to JS-based in-game modules).
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs';

// Import all feature src
// Named exports (export class X)
import { AbdulsArmour } from './locations/AbdulsArmour';
import { Bank } from './locations/Bank';
import { Bard } from './locations/Bard';
import { Blackjack } from './locations/Blackjack';
import { Output } from './io/Output';
import { GameEvents } from './GameEvents';
import { FileUtils, SharedFileState } from '@lordts/util/FileUtils';
import { Healers } from './locations/Healers';
import { Input } from './io/Input';
import { IO } from './io/IO';
import { KingArthurs } from './locations/KingArthurs';
import { Violet } from './locations/Violet';
import { Marriage } from './Marriage';
import { RedDragonInn } from './locations/RedDragonInn';
import { Turgons } from './locations/Turgons';
import { Lazy } from '@lordts/util/Lazy';
import { loadSettings } from '@lordts/util/Settings';
import BadWords from '@lordts/util/BadWords';
import { JsonLoader } from '@lordts/util/JsonLoader';
import { LdyManager } from './lady/LdyManager';
import GodMode from './GodMode';

// Default exports (class X + export default X)
import Battle from './Battle';
import DailyMaint from './DailyMaint';
import Equipment from './Equipment';
import Forest from './locations/Forest';
import Game from './Game';
import IGM from '@lordts/igm/IGM';
import Log from './Log';
import Mail from './Mail';
import OnlineBattle from './OnlineBattle';
import Player from './Player';
import Rankings from './Rankings';
import State from './State';
import Town from './locations/Town';

import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';
import { createPersistence } from '@lordts/storage/PersistenceFactory';
import { LocalBattleCoordinator } from '@lordts/storage/LocalBattleCoordinator';
import type {
    ISession, User, Connection, TrainerStats, MonsterStats,
    ArmourStats, WeaponStats, CastleStats, Settings,
    Dragon,
    TextIndex, SyncTermCacheFiles, IGameContext,
    UiMode,
} from './types';
import type { File as LocalFile } from '@lordts/util/FileUtils';

// ── GameContext Class ───────────────────────────────────────────────────────

// Server mode creates many GameContext instances. Cache package.json reads so
// each session does not re-parse the version from disk.
const packageVersionCache = new Map<string, string>();

function resolveProjectRoot(execDir: string): string {
    // tsx/dev runs from the project root, while built/tested entrypoints can
    // execute from dist/. Normalize both to the package root.
    return path.basename(execDir) === 'dist'
        ? path.resolve(execDir, '../')
        : execDir;
}

function loadPackageVersion(projectRoot: string): string {
    const cachedVersion = packageVersionCache.get(projectRoot);
    if (cachedVersion) {
        return cachedVersion;
    }

    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };

    if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
        throw new Error(`Invalid version in ${packageJsonPath}`);
    }

    packageVersionCache.set(projectRoot, packageJson.version);
    return packageJson.version;
}

export class GameContext implements IGameContext {
    // Version
    ver: string;

    // File handles and data stores
    storage: IStorage;
    battleCoordinator: IBattleCoordinator;

    // Shared mutable file state (shared between FileUtils, Output, and GameContext)
    private _sharedFileState: SharedFileState;
    get txtfile(): LocalFile | null { return this._sharedFileState.txtfile; }
    set txtfile(v: LocalFile | null) { this._sharedFileState.txtfile = v; }
    get txtindex(): TextIndex { return this._sharedFileState.txtindex; }
    set txtindex(v: TextIndex) { this._sharedFileState.txtindex = v; }
    get ripfile(): LocalFile | null { return this._sharedFileState.ripfile; }
    set ripfile(v: LocalFile | null) { this._sharedFileState.ripfile = v; }
    get ripindex(): TextIndex { return this._sharedFileState.ripindex; }
    set ripindex(v: TextIndex) { this._sharedFileState.ripindex = v; }

    // Current game state
    player: Player | null;
    whichCastle: number;
    state: State | null;
    running: boolean;

    // Output state
    curlinenum: number;
    curcolnum: number;
    morechk: boolean;
    rows: number;
    cols: number;

    // Cleanup
    cleanupFiles: string[];

    // String handling
    whitelist: string[];

    // Display mode - uiMode is the single shared mutable reference.
    // The getters/setters delegate to uiMode fields so that every
    // class holding a reference to uiMode sees changes immediately.
    uiMode: UiMode;
    get rip(): boolean { return this.uiMode.mode === 'rip'; }
    set rip(v: boolean) { this.uiMode.mode = v ? 'rip' : 'ansi'; }
    get modern(): boolean { return this.uiMode.mode === 'modern'; }
    set modern(v: boolean) { this.uiMode.mode = v ? 'modern' : 'ansi'; }
    get lastrip(): string { return this.uiMode.lastScreen; }
    set lastrip(v: string) { this.uiMode.lastScreen = v; }
    synctermCache: boolean;
    synctermCacheFiles: SyncTermCacheFiles;

    // Session data
    user: User;
    connection: Connection;
    /** The raw session adapter (ISession) for this connection. */
    session: ISession;

    // Paths
    baseDir: string;
    dataDir: string;
    runtimeDir: string;
    lrdDir: string;
    ldyDir: string;
    ldyDirs: string[];

    // DATA OBJECTS
    trainerStats: TrainerStats[];
    monsterStats: MonsterStats[][];
    armourStats: ArmourStats[];
    weaponStats: WeaponStats[];
    castles: CastleStats[];
    settings: Settings;
    dragon: Dragon;

    // CLASS INSTANCES

    // Tier 0: No dependencies on other src
    fileUtils: FileUtils;
    equipment: Equipment;

    // Event system
    events: GameEvents;

    // Tier 1: Depends on stringUtils, fileUtils, console
    input: Input;
    display: Output;
    io: IO;
    log: Log;
    mail: Mail;
    rankings: Rankings;

    // Tier 2: Depends on io, player, mail, etc.
    abdulsArmour: AbdulsArmour;
    bank: Bank;
    bard: Bard;
    battle: Battle;
    blackjack: Blackjack;
    dailyMaint: DailyMaint;
    forest: Forest;
    healers: Healers;
    igm: IGM;
    kingArthurs: KingArthurs;
    marriage: Marriage;
    onlineBattle: OnlineBattle;
    redDragonInn: RedDragonInn;
    turgons: Turgons;
    town: Town;
    violet: Violet;
    ldyManager: LdyManager;

    // Tier 3: Depends on everything above
    game: Game;

    /** Returns the player instance, throwing if not yet initialized. */
    private requirePlayer(): Player {
        if (!this.player) throw new Error('Player not yet initialized');
        return this.player;
    }

    /** Returns the state instance, throwing if not yet initialized. */
    private requireState(): State {
        if (!this.state) throw new Error('State not yet initialized');
        return this.state;
    }

    constructor(
        execDir: string,
        adapter: ISession,
        username: string,
        ripEnabled: boolean = false,
        remoteIp?: string,
        nodeId?: number,
        storage?: IStorage,
        uiEnabled: boolean = false,
        godModeEnabled: boolean = false,
    ) {
        // Bootstrap order matters here: resolve paths/settings first, create
        // shared persistence next, then instantiate gameplay classes in
        // dependency tiers so Lazy wrappers only cross intentional cycles.
        const projectRoot = resolveProjectRoot(execDir);

        // Version - kept in sync with package.json
        this.ver = loadPackageVersion(projectRoot);

        // File handles and data stores
        this._sharedFileState = {
            txtfile: null,
            txtindex: {},
            ripfile: null,
            ripindex: {},
        };

        // Current game state
        this.player       = null;
        this.whichCastle = Math.floor(Math.random() * 5) + 1;
        this.state        = null;
        this.running      = true;

        // Output state
        this.curlinenum = 1;
        this.curcolnum  = 1;
        this.morechk    = true;
        this.rows       = 24;
        this.cols       = 80;

        // Cleanup
        this.cleanupFiles = [];

        // String handling
        this.whitelist = [];

        // Display mode
        this.uiMode               = { mode: ripEnabled ? 'rip' : (uiEnabled ? 'modern' : 'ansi'), lastScreen: '' };
        this.synctermCache         = false;
        this.synctermCacheFiles   = {};

        // Session data
        this.session = adapter;
        this.user = {
            name: username,
            secondsRemaining: 3600,
            secondsRemainingFrom: Math.floor(Date.now() / 1000),
        };
        this.connection = {
            remoteIp: remoteIp || '127.0.0.1',
            node: nodeId || 0,
        };

        // Paths - determine project root correctly whether running from source
        // (/) or from compiled output (/dist)

        this.baseDir = projectRoot + path.sep;
        this.dataDir = path.join(projectRoot, 'data');
        this.lrdDir  = path.join(projectRoot, 'lrd');
        this.ldyDir  = path.join(projectRoot, 'ldy');

        // DATA OBJECTS - settings must load before runtime dir resolution
        // so LORD_RUNTIME_DIR env var overrides take effect.
        this.settings = loadSettings(this.dataDir);

        // Runtime dir - resolved from settings (configurable via LORD_RUNTIME_DIR).
        // Relative paths are resolved against projectRoot; absolute paths used as-is.
        this.runtimeDir = path.resolve(projectRoot, this.settings.runtime_dir || 'runtime');

        // LDY search order: runtime/ (user-customizable lord.ldy), then official/, then 3rdparty/
        this.ldyDirs = [
            this.runtimeDir,
            path.join(this.ldyDir, 'official'),
            path.join(this.ldyDir, '3rdparty'),
        ];

        // Copy lord.ldy to runtime/ on first startup so operators can customize it
        const runtimeLordLdy = path.join(this.runtimeDir, 'lord.ldy');
        const officialLordLdy = path.join(this.ldyDir, 'official', 'lord.ldy');
        if (!fs.existsSync(runtimeLordLdy) && fs.existsSync(officialLordLdy)) {
            if (!fs.existsSync(this.runtimeDir)) {
                fs.mkdirSync(this.runtimeDir, { recursive: true });
            }
            fs.copyFileSync(officialLordLdy, runtimeLordLdy);
        }

        // Shared storage - all sessions share one instance.
        // If a shared instance is provided by the caller (e.g. server.ts), use it;
        // otherwise create a new one (CLI / test usage).
        if (storage) {
            this.storage = storage;
            this.battleCoordinator = new LocalBattleCoordinator(storage, nodeId || 0);
        } else {
            const persistence = createPersistence({
                settings: this.settings,
                projectRoot,
                nodeId: nodeId || 0,
            });
            this.storage = persistence.storage;
            this.battleCoordinator = persistence.battleCoordinator;
        }

        // JsonLoader checks the runtime directory first (allowing server operators
        // to override data files without touching the read-only data/ directory),
        // then falls back to the data directory.
        const jsonLoader = new JsonLoader(this.dataDir, this.settings, projectRoot);
        this.trainerStats       = jsonLoader.load<TrainerStats[]>('trainers.json');
        this.monsterStats       = jsonLoader.load<MonsterStats[][]>('monsters.json');
        this.armourStats        = jsonLoader.load<ArmourStats[]>('armour.json');
        this.weaponStats        = jsonLoader.load<WeaponStats[]>('weapons.json');
        this.castles             = jsonLoader.load<CastleStats[]>('castles.json');
        this.dragon              = jsonLoader.load<Dragon>('dragon.json');

        // CLASSES - Order matters!  Dependencies must be constructed first.
        // Lazy wrappers keep the wiring readable while still allowing mutual
        // references like Player <-> Game or Output <-> IO.
        const lazy = <T>(f: () => T) => new Lazy(f);

        // Event system - shared by all classes, subscribed to by transports.
        this.events = new GameEvents();

        // Tier 0: No dependencies on other src
        this.fileUtils   = new FileUtils(this.settings, this.baseDir, this.cleanupFiles, this._sharedFileState, lazy(() => this.io));
        this.equipment   = new Equipment(this.trainerStats, this.armourStats, this.weaponStats);

        // Give the BadWords singleton access to the file resolver so it can
        // lazily load BADWORDS.DAT (runtime copy takes precedence over data/).
        BadWords.instance.configure(this.fileUtils);

        // Tier 1: Depends on fileUtils, console
        this.input    = new Input(this.settings, this.uiMode, lazy(() => this.player), adapter, this.user);
        this.display  = new Output(
            null, // io not yet created
            this.uiMode, this.fileUtils, this.settings,
            this.ver, adapter, this.user, this.connection,
            this.baseDir, this._sharedFileState,
            lazy(() => this.requirePlayer()), lazy(() => this.mail), lazy(() => this.requireState()),
            lazy(() => this.log), lazy(() => this.dailyMaint),
            lazy(() => this.onlineBattle), lazy(() => this.marriage), lazy(() => this.igm),
            lazy(() => this.storage),
        );
        this.io       = new IO(this.display, this.input);
        // Wire IO references now that IO exists
        this.display.io = this.io;
        this.input.io = this.io;
        this.display.input = this.input;
        this.io.events = this.events;

        this.log      = new Log(this.io, this.uiMode, this.fileUtils, this.settings, lazy(() => this.dailyMaint), lazy(() => this.requireState()), lazy(() => this.storage));
        this.mail     = new Mail(
            this.io, this.fileUtils, this.settings,
            this.uiMode,
            lazy(() => this.requireState()), lazy(() => this.requirePlayer()),
            lazy(() => this.mail), lazy(() => this.marriage), lazy(() => this.log), lazy(() => this.dailyMaint),
            lazy(() => this.storage),
        );
        this.rankings = new Rankings(this.io, this.uiMode, this.ver, lazy(() => this.requirePlayer()));
        // State exists before Player so player helpers can safely require the
        // shared state object during the rest of the bootstrap.
        this.state    = new State(this.whitelist, lazy(() => this.player), lazy(() => this.storage));
        this.player   = new Player(
            this.io, this.user, this.fileUtils, this.settings,
            this.whitelist, this.mail,
            this.uiMode, this.ver,
            lazy(() => this.requireState()), lazy(() => this.game),
            lazy(() => this.storage), lazy(() => this.battleCoordinator),
        );

        // Tier 2: Depends on io, player, mail, etc.
        this.abdulsArmour = new AbdulsArmour(this.io, this.settings, lazy(() => this.equipment), lazy(() => this.requirePlayer()), this.uiMode);
        this.bank         = new Bank(this.io, this.settings, this.uiMode, lazy(() => this.requirePlayer()), lazy(() => this.mail), lazy(() => this.ldyManager));
        this.bard         = new Bard(this.io, this.state, this.settings, lazy(() => this.mail), lazy(() => this.requirePlayer()), lazy(() => this.log), lazy(() => this.dailyMaint), this.uiMode, lazy(() => this.ldyManager));
        this.battle       = new Battle(
            this.io, this.fileUtils, this.settings, this.rankings,
            this.uiMode, this.dragon,
            lazy(() => this.battle), lazy(() => this.requirePlayer()),
            lazy(() => this.requireState()), lazy(() => this.log), lazy(() => this.mail),
            lazy(() => this.equipment), lazy(() => this.dailyMaint), lazy(() => this.igm), lazy(() => this.onlineBattle),
            lazy(() => this.storage), lazy(() => this.battleCoordinator), this.monsterStats,
        );
        this.blackjack    = new Blackjack(this.io, this.uiMode, lazy(() => this.requirePlayer()));
        this.dailyMaint   = new DailyMaint(
            this.io, this.state, this.fileUtils, this.settings,
            lazy(() => this.dailyMaint), lazy(() => this.mail), lazy(() => this.requirePlayer()), lazy(() => this.marriage),
            this.uiMode, lazy(() => this.storage), lazy(() => this.battleCoordinator),
        );
        this.forest       = new Forest(
            this.io, this.state, this.fileUtils, this.settings,
            lazy(() => this.requirePlayer()), lazy(() => this.log), lazy(() => this.battle),
            lazy(() => this.dailyMaint), lazy(() => this.blackjack), lazy(() => this.healers),
            lazy(() => this.redDragonInn), lazy(() => this.ldyManager),
            this.uiMode, this.whichCastle,
            this.monsterStats, this.castles, lazy(() => this.storage),
        );
        this.healers      = new Healers(this.io, this.requirePlayer(), this.uiMode);
        // IGM receives a Lazy<GameContext> because legacy JS IGMs expect the
        // full context object even though the rest of the engine avoids it.
        this.igm          = new IGM(this.io, this.baseDir, this.runtimeDir, this.fileUtils, this.settings, lazy(() => this.requirePlayer()), this.connection, lazy(() => this), lazy(() => this.storage));
        // Register the IGM maintenance hook so dailyMaint() can trigger IGM resets.
        this.dailyMaint.setIgmMaintHook(() => this.igm.runMaintenance());
        this.kingArthurs  = new KingArthurs(this.io, this.settings, lazy(() => this.equipment), lazy(() => this.requirePlayer()), this.uiMode);
        this.marriage     = new Marriage(
            this.io, this.state, this.mail,
            lazy(() => this.requirePlayer()),
            lazy(() => this.log), this.uiMode,
            lazy(() => this.storage),
        );
        this.violet       = new Violet(
            this.io, this.state, this.settings,
            lazy(() => this.requirePlayer()),
            lazy(() => this.log), this.uiMode, lazy(() => this.dailyMaint),
        );
        this.onlineBattle = new OnlineBattle(
            this.io,
            this.settings,
            this.monsterStats,
            lazy(() => this.mail), lazy(() => this.requirePlayer()),
            lazy(() => this.log), lazy(() => this.dailyMaint),
            this.uiMode, lazy(() => this.battleCoordinator),
        );
        this.redDragonInn = new RedDragonInn(
            this.io, this.state, this.fileUtils, this.settings,
            lazy(() => this.mail), lazy(() => this.requirePlayer()), lazy(() => this.rankings),
            lazy(() => this.log), lazy(() => this.battle), lazy(() => this.bard), lazy(() => this.marriage),
            lazy(() => this.violet),
            this.uiMode, lazy(() => this.ldyManager), lazy(() => this.storage),
        );
        this.turgons      = new Turgons(
            this.io,
            lazy(() => this.equipment), lazy(() => this.requirePlayer()), lazy(() => this.log),
            lazy(() => this.battle), lazy(() => this.dailyMaint),
            this.uiMode,
        );
        this.town         = new Town(
            this.io, this.state, this.fileUtils, this.settings, this.uiMode, this.user,
            lazy(() => this.requirePlayer()), lazy(() => this.rankings),
            lazy(() => this.redDragonInn), lazy(() => this.kingArthurs), lazy(() => this.battle),
            lazy(() => this.abdulsArmour), lazy(() => this.igm), lazy(() => this.forest),
            lazy(() => this.healers), lazy(() => this.turgons), lazy(() => this.blackjack),
            lazy(() => this.onlineBattle), lazy(() => this.bard), lazy(() => this.bank),
            lazy(() => this.marriage),
            lazy(() => this.mail), lazy(() => this.log), lazy(() => this.dailyMaint),
            lazy(() => this.storage),
        );
        this.ldyManager   = new LdyManager(
            this.ldyDirs, this.io, this.uiMode, this.settings,
            lazy(() => this.running), lazy(() => this.requireState()),
            this.armourStats, this.weaponStats,
            lazy(() => this.requirePlayer()),
        );
        if (godModeEnabled) {
            this.input.godMode = new GodMode(
                this.io,
                this.requirePlayer(),
                this.forest,
                this.redDragonInn,
                this.bard,
                this.violet,
                this.blackjack,
                this.ldyManager,
            );
        }

        // Tier 3: Depends on everything above
        this.game = new Game(
            this.io, this.fileUtils, this.state, this.settings,
            this.log, this.uiMode,
            this.user, this.connection,
            lazy(() => this.mail), lazy(() => this.requirePlayer()), lazy(() => this.rankings),
            lazy(() => this.redDragonInn), lazy(() => this.igm),
            lazy(() => this.town), lazy(() => this.storage),
        );
    }

    /**
     * Immediately mark the session's player record as offline in the database.
     * Safe to call multiple times (idempotent) and safe to call before the
     * player record has been loaded (it null-checks at every step).
     */
    markPlayerOffline(): void {
        try {
            const player = this.player;
            if (player && player.on_now) {
                player.on_now = false;
                player.put();
            }
        } catch (_e) { /* ignore - best-effort */ }
    }
}

export default GameContext;
