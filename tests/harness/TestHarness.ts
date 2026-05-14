/**
 * TestHarness - High-level test fixture for LORD feature testing.
 *
 * Creates a fully-wired GameContext with a TestSession (mock ISession) and
 * SeededRandom, stubs out filesystem / database operations that need a real
 * runtime, and provides convenience methods for common test patterns.
 *
 * Usage:
 *   const harness = TestHarness.create({ username: 'Hero', seed: 42 });
 *   harness.queueKeys('F', 'L', '\r');
 *   harness.context.forest.run();
 *   expect(harness.outputContains('Forest')).toBe(true);
 *   harness.cleanup();
 */

import * as fs from 'fs';
import * as path from 'path';
import { TestSession } from './TestSession';
import { SeededRandom } from './SeededRandom';
import { GameContext } from '@lordts/core/GameContext';
import { SqliteStorage } from '@lordts/storage/SqliteStorage';
import { GameExitError } from '@lordts/core/GameExitError';
import { Player_Def } from '@lordts/storage/RecordDefs';
import type { LoadedPlayerRecord, TextIndex } from '@lordts/core/types';

// ── ExitError ───────────────────────────────────────────────────────────

/**
 * Thrown when game code calls process.exit() during tests.
 * Tests that expect the game to quit should use session.runUntilExit().
 */
export class ExitError extends Error {
    code: number | undefined;
    constructor(code?: number) {
        super(`process.exit(${code})`);
        this.name = 'ExitError';
        this.code = code;
    }
}

// ── Configuration ───────────────────────────────────────────────────────

export interface TestHarnessOptions {
    /** Player name (default: 'TestHero') */
    username?: string;
    /** Random seed (default: 12345) */
    seed?: number;
    /** Whether to automatically create a default player (default: true) */
    createPlayer?: boolean;
    /** Player overrides to apply after creation */
    playerOverrides?: Partial<LoadedPlayerRecord>;
    /** Whether RIP graphics are enabled (default: false) */
    rip?: boolean;
    /** Enable the runtime god console for tests that exercise it */
    godMode?: boolean;
}

// ── Default player record ───────────────────────────────────────────────

function makeDefaultPlayerRecord(overrides?: Partial<LoadedPlayerRecord>): LoadedPlayerRecord {
    const defaults: Record<string, unknown> = {};
    for (const def of Player_Def) {
        defaults[def.prop] = def.def;
    }
    // Sensible test defaults
    defaults.name = 'TestHero';
    defaults.real_name = 'TestHero';
    defaults.hp = 20;
    defaults.hp_max = 20;
    defaults.str = 10;
    defaults.def = 1;
    defaults.weapon = 'Stick';
    defaults.weapon_num = 1;
    defaults.arm = 'Coat';
    defaults.arm_num = 1;
    defaults.gold = 500;
    defaults.bank = 0;
    defaults.gem = 0;
    defaults.exp = 1;
    defaults.level = 1;
    defaults.clss = 1;  // Death Knight
    defaults.dead = false;
    defaults.inn = false;
    defaults.on_now = true;
    defaults.horse = false;
    defaults.sex = 'M';
    defaults.cha = 1;
    defaults.married_to = -1;
    defaults.expert = false;
    defaults.fairy_lore = false;
    defaults.magically_delicious = false;
    defaults.forest_fights = 15;
    defaults.pvp_fights = 3;
    defaults.time = 0;
    defaults.time_on = '12:00';
    defaults.last_on_unix = 0;
    defaults.Record = 0;
    defaults.Yours = true;
    defaults.high_spirits = true;
    defaults.kids = 0;
    defaults.drag_kills = 0;
    defaults.laid = 0;
    defaults.pvp = 0;
    defaults.seen_master = false;
    defaults.seen_dragon = false;
    defaults.seen_violet = false;
    defaults.seen_bard = false;
    defaults.levelw = 0;
    defaults.levelm = 0;
    defaults.levelt = 0;
    defaults.skillw = 0;
    defaults.skillm = 0;
    defaults.skillt = 0;
    defaults.transferred_gold = 0;
    defaults.flirted = false;
    defaults.weird = false;
    defaults.leftbank = false;
    defaults.has_fairy = false;
    defaults.amulet = false;
    defaults.olivia = false;
    defaults.olivia_asshole = false;
    defaults.olivia_count = 0;
    defaults.done_tower = false;
    defaults.has_des = false;
    defaults.des1 = '';
    defaults.des2 = '';
    defaults.gone = 0;
    defaults.last_reincarnated = 0;
    defaults.got_delicious = false;
    defaults.divorced = false;
    defaults.is_npc = false;
    defaults.padding = '';

    // Apply overrides
    if (overrides) {
        Object.assign(defaults, overrides);
    }

    // Add record methods (stubs for testing)
    defaults.put = jest.fn();
    defaults.unLock = jest.fn();
    defaults.reInit = jest.fn();
    defaults.reLoad = jest.fn();

    return defaults as LoadedPlayerRecord;
}

// ── TestHarness class ──────────────────────────────────────────────────

export class TestHarness {
    readonly session: TestSession;
    readonly rng: SeededRandom;
    readonly context: GameContext;
    private _originalExit: typeof process.exit;

    private constructor(session: TestSession, rng: SeededRandom, context: GameContext) {
        this.session = session;
        this.rng = rng;
        this.context = context;
        this._originalExit = process.exit;
    }

    /**
     * Factory: create a ready-to-use test session.
     * Mocks process.exit, filesystem ops, and optionally sets up a player.
     */
    static create(opts?: TestHarnessOptions): TestHarness {
        const options = {
            username: 'TestHero',
            seed: 12345,
            createPlayer: true,
            rip: false,
            ...opts,
        };

        // Ensure runtime directory exists for any tests that do touch disk
        const runtimeDir = path.join(__dirname, '../../runtime');
        if (!fs.existsSync(runtimeDir)) {
            fs.mkdirSync(runtimeDir, { recursive: true });
        }

        // Create the mock session (ISession adapter) and RNG
        const testConsole = new TestSession();
        const rng = new SeededRandom(options.seed);
        rng.install();

        // Mock process.exit before constructing GameContext
        const _origExit = process.exit;
        process.exit = jest.fn().mockImplementation((code?: number) => {
            throw new ExitError(code);
        }) as unknown as typeof process.exit;

        // Create the game context with an in-memory database for test isolation
        const memDb = new SqliteStorage(':memory:');
        const ctx = new GameContext(
            path.join(__dirname, '../..'),
            testConsole,
            options.username,
            options.rip,
            '127.0.0.1',
            99,
            memDb,
            false,
            options.godMode === true,
        );

        // Skip BBS timeout checks in getkeyw() - tests drive input via the queue
        ctx.user.noTimeout = true;

        const session = new TestHarness(testConsole, rng, ctx);

        // Stub out methods that would block or require real filesystem/DB
        session._stubFileSystem();
        session._stubState();

        // Mock mswait so tests don't wait on real timers
        ctx.io.mswait = jest.fn().mockResolvedValue(undefined);

        // Set up player if requested
        if (options.createPlayer) {
            session.setPlayer(options.playerOverrides);
        }

        return session;
    }

    // ── Player helpers ──────────────────────────────────────────────────

    /** Set the active player record (creates a default if none provided) */
    setPlayer(overrides?: Partial<LoadedPlayerRecord>): void {
        const record = makeDefaultPlayerRecord({
            name: this.context.user.name,
            real_name: this.context.user.name,
            ...overrides,
        });
        // Set the player record on the Player class
        this.context.player!.player = record;
        // Also update input's player reference
        (this.context.input as unknown as { _player: unknown })._player = this.context.player;
    }

    /** Get the current player record for assertions */
    get player(): LoadedPlayerRecord | null {
        return this.context.player!.player || null;
    }

    /** Shorthand to set specific player properties */
    setPlayerProps(props: Record<string, unknown>): void {
        const p = this.player;
        if (p) {
            Object.assign(p, props);
        }
    }

    // ── Input helpers ───────────────────────────────────────────────────

    /** Queue keystrokes for the game to read */
    queueKeys(...keys: string[]): void {
        this.session.queueKeys(...keys);
    }

    /** Queue a full string broken into individual character keystrokes */
    queueString(str: string): void {
        this.session.queueString(str);
    }

    // ── Output helpers ──────────────────────────────────────────────────

    /** Get the full raw output */
    get output(): string {
        return this.session.output;
    }

    /** Get output with ANSI codes stripped */
    get plainOutput(): string {
        return this.session.plainOutput;
    }

    /** Check if output contains text (ANSI-stripped) */
    outputContains(text: string): boolean {
        return this.session.outputContains(text);
    }

    /** Clear output for fresh assertions */
    clearOutput(): void {
        this.session.clearOutput();
    }

    /**
     * Run a function that is expected to exit the game session.
     * Catches ExitError (from mocked process.exit) and GameExitError
     * (thrown by game code) so the test can continue to make assertions.
     */
    async runUntilExit(fn: () => void | Promise<unknown>): Promise<void> {
        try {
            await fn();
        } catch (e) {
            if (e instanceof ExitError) return;
            if (e instanceof GameExitError) return;
            throw e;
        }
    }

    // ── Cleanup ─────────────────────────────────────────────────────────

    /** Must be called in afterEach() to restore globals */
    cleanup(): void {
        this.rng.restore();
        process.exit = this._originalExit;
    }

    // ── Internal stubs ──────────────────────────────────────────────────

    /** Stub filesystem operations that might fail in tests */
    private _stubFileSystem(): void {
        const ctx = this.context;

        // buildTxtIndex loads LRD text blocks - stub to avoid file reads
        ctx.fileUtils.buildTxtIndex = jest.fn();

        // Default txtindex with empty entries so showTxt calls don't crash
        ctx.txtindex = new Proxy({} as TextIndex, {
            get: (_target: TextIndex, prop: string) => {
                if (prop in _target) return _target[prop];
                return [];  // return empty array for any unset text index
            }
        });

        // fileExists defaults to false in tests
        ctx.fileUtils.fileExists = jest.fn().mockReturnValue(false);
        ctx.fileUtils.fileRemove = jest.fn();

        // runtimeFilePath returns a path under runtime/
        const runtimeDir = path.join(__dirname, '../../runtime');
        ctx.fileUtils.runtimeFilePath = jest.fn((name: string) => path.join(runtimeDir, name));
        ctx.fileUtils.runtimeOrData = jest.fn((name: string) => path.join(ctx.dataDir, name));

        // Output file stubs
        ctx.display.displayFilePaged = jest.fn();
        ctx.display.showFile = jest.fn();
        ctx.display.showBuffer = jest.fn();
        ctx.display.morechk = false;  // Disable page-break pauses in tests
        ctx.io.showTxt = jest.fn();
        ctx.io.showRip = jest.fn();
        ctx.io.checkRip = jest.fn();
        ctx.io.announce = jest.fn();
        ctx.io.instructions = jest.fn();

        // showStats, warriorsOnNow etc - display-only
        ctx.io.showStats = jest.fn();
        ctx.io.warriorsOnNow = jest.fn();
        ctx.io.showAlone = jest.fn();
        ctx.io.showGameStats = jest.fn();
        ctx.io.showLooks = jest.fn();
        ctx.io.deadScreen = jest.fn();
    }

    /** Stub state and data layer */
    private _stubState(): void {
        const ctx = this.context;

        // State methods
        ctx.state!.getState = jest.fn().mockImplementation(() => {
            // Set some default state values
            ctx.state!.days = 1;
            ctx.state!.won_by = -1;
            ctx.state!.log_date = 0;
            ctx.state!.married_to_seth = -1;
            ctx.state!.married_to_violet = -1;
            ctx.state!.forest_gold = 100;
            ctx.state!.latesthero = 'Master Turgon';
        });
        ctx.state!.putState = jest.fn();

        // Set default state values directly (some modules access state
        // properties without calling getState first)
        ctx.state!.days = 1;
        ctx.state!.won_by = -1;
        ctx.state!.log_date = 0;
        ctx.state!.married_to_seth = -1;
        ctx.state!.married_to_violet = -1;
        ctx.state!.forest_gold = 100;
        ctx.state!.latesthero = 'Master Turgon';

        // Log methods
        ctx.log.createLog = jest.fn();
        ctx.log.showLog = jest.fn();
        ctx.log.logLine = jest.fn();

        // Mail methods
        ctx.mail.mailCheck = jest.fn().mockReturnValue(false);
        ctx.mail.checkMail = jest.fn();
        ctx.mail.mailTo = jest.fn();
        ctx.mail.composeMail = jest.fn();
        ctx.mail.killmail = jest.fn();

        // Rankings
        ctx.rankings.generateRankings = jest.fn();
        ctx.rankings.listPlayers = jest.fn();

        // Player persistence
        ctx.player!.pfileInit = jest.fn();
        ctx.player!.playerLength = jest.fn().mockReturnValue(1);
        ctx.player!.playerGet = jest.fn().mockImplementation((rec: number) => {
            if (rec === 0) {
                return this.context.player!.player;
            }
            return makeDefaultPlayerRecord({ name: 'X', Record: rec });
        });
        ctx.player!.playerNew = jest.fn().mockImplementation(() => {
            return makeDefaultPlayerRecord({ name: '', Record: 0 });
        });

        // DailyMaint
        ctx.dailyMaint.tournamentCheck = jest.fn();
        ctx.dailyMaint.runDailyMaint = jest.fn();

        // IGM
        ctx.igm.createOtherPlaces = jest.fn().mockReturnValue([]);
        ctx.igm.handleIgm = jest.fn().mockResolvedValue(false);

        // LdyManager
        ctx.ldyManager.runEvent = jest.fn();
        ctx.ldyManager.runForestEvent = jest.fn();
    }
}

/** Helper to create a default player record for direct use */
export { makeDefaultPlayerRecord };

export default TestHarness;
