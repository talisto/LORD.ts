/**
 * types.ts - Centralized type definitions for LORD
 *
 * This file contains all shared interfaces and types used across the codebase.
 * Instead of each class defining its own interfaces, all shared types are here.
 */

'use strict';

// Import types for class references (type-only imports avoid circular dependency issues)
import type { IStorage } from '@lordts/storage/IStorage';
import type { IBattleCoordinator } from '@lordts/storage/IBattleCoordinator';
import type { File as LordFile, FileUtils } from '@lordts/util/FileUtils';
import type Equipment from './Equipment';
import type { Input } from './io/Input';
import type { Output } from './io/Output';
import type { IO } from './io/IO';
import type Log from './Log';
import type Mail from './Mail';
import type Rankings from './Rankings';
import type { AbdulsArmour } from './locations/AbdulsArmour';
import type { Bank } from './locations/Bank';
import type { Bard } from './locations/Bard';
import type Battle from './Battle';
import type { Blackjack } from './locations/Blackjack';
import type DailyMaint from './DailyMaint';
import type Forest from './locations/Forest';
import type { Healers } from './locations/Healers';
import type IGM from '@lordts/igm/IGM';
import type { KingArthurs } from './locations/KingArthurs';
import type { Violet } from './locations/Violet';
import type { Marriage } from './Marriage';
import type OnlineBattle from './OnlineBattle';
import type { RedDragonInn } from './locations/RedDragonInn';
import type { Turgons } from './locations/Turgons';
import type Game from './Game';
import type Player from './Player';
import type State from './State';
import type { GameEvents } from './GameEvents';

// ══════════════════════════════════════════════════════════════════════════════
// Core IO Interface
// ══════════════════════════════════════════════════════════════════════════════

/** Terminal color attribute (Synchronet-compatible) */
export interface ConsoleAttr {
    value: number;
}

/** Options for getstr() method */
export interface GetstrOptions {
    len?: number;
    x?: number;
    y?: number;
    c?: number;
    c1?: number;
    edit?: string;
    inputBox?: boolean;
    crlf?: boolean;
    select?: boolean;
    integer?: boolean;
    min?: number;
    max?: number;
}

/** Configuration for io.prompt() method */
export interface PromptConfig {
    /** Echo the keypress after receiving it (default: true) */
    echo?: boolean;
    /** How to echo: 'line' for sln(ch, 0), 'char' for sw(ch) (default: 'line') */
    echoStyle?: 'line' | 'char';
    /** Default key to return if invalid key pressed; if undefined, loops until valid */
    defaultKey?: string;
    /** Add leading blank line before prompt (default: true) */
    leadingBlank?: boolean;
    /** Add trailing blank line after key pressed (default: true) */
    trailingBlank?: boolean;
    /** If true, any keypress is valid (for 'press any key' prompts) */
    anyKey?: boolean;
    /** If true, use sw() instead of lw() for the prompt text (no color parsing) */
    rawText?: boolean;
    /** If true, show prompt text in the terminal even in modern/UI mode (default: false - suppress in modern mode) */
    showTextInModern?: boolean;
}

/** RIP graphics message structure */
export interface RipMessage {
    type: string;
    action?: string;
    section?: string;
    lines?: string[];
    [key: string]: unknown;
}

/** Player stats for web status bar */
export interface PlayerStats {
    name: string;
    level: number;
    hp: number;
    hp_max: number;
    gold: number;
    bank: number;
    exp: number;
    forest_fights: number;
    pvp_fights: number;
    gems: number;
    weapon: string;
    armour: string;
    charm: number;
    dead: boolean;
    playersOnline: number;
}

/**
 * Display mode type - the three rendering modes supported by the client.
 *   - 'ansi'   - plain terminal (xterm)
 *   - 'rip'    - RIP graphics overlay (SyncTerm / web RIP emulator)
 *   - 'modern' - modern graphical RPG-style UI
 */
export type DisplayMode = 'ansi' | 'rip' | 'modern';

/**
 * UiMode - shared mutable reference for the current display mode.
 *
 * All classes hold a reference to the same UiMode object so that toggling
 * modes in one place (e.g. the WebSocket message handler, the settings menu,
 * or the in-game menu) is immediately visible everywhere without
 * reconstructing anything.
 */
export interface UiMode {
    mode: DisplayMode;
    /** RIP-specific: tracks the last RIP screen shown. */
    lastScreen: string;
}

/**
 * IO - The console interface implemented by both ConsoleSession and WebSocketSession
 *
 * This is the primary polymorphic interface in the codebase. CLI mode uses ConsoleSession,
 * web mode uses WebSocketSession, but both implement this interface.
 */
export interface ISession {
    attr: ConsoleAttr;
    rows: number;
    cols: number;

    /** Timestamp (Date.now()) of the last received input. Used for idle monitoring. */
    readonly lastActivityTime: number;

    // Output
    puts(s: string): void;
    write(s: string): void;
    print(s: string): void;
    center(s: string): void;

    // Cursor control
    gotoxy(x: number, y: number): void;
    clear(): void;
    cleareol(): void;

    // Input
    getkey(): Promise<string>;
    getstr(mode?: GetstrOptions): Promise<string>;
    inkey(timeout?: number): string | undefined;
    waitkey(timeout?: number): Promise<boolean>;

    // Terminal capabilities
    ansiSupported?: boolean;
    ansi?: boolean;

    // Optional flush for buffered consoles
    flush(): void;

    // Optional: signal that the connection/session is ending
    closeConnection(): void;

    /** Deliver raw keystroke data from the transport to the game. */
    deliverKeys(str: string): void;

    /**
     * Optional input interceptor. When set, ALL input paths (stdin handlers,
     * deliverKeys, etc.) forward raw keystrokes here instead of the internal
     * key buffer. Used by ChildProcessBridge to redirect input to a child process.
     */
    inputInterceptor?: ((data: string) => void) | null;

    /** Deliver a structured control message (e.g. rip_toggle). Optional - transport-specific. */
    deliverControlMessage?(msg: Record<string, unknown>): void;

    /** Wire a callback that sends buffered output to the transport. Optional - callback-driven transports. */
    setOutputHandler?(handler: (data: string) => void): void;

    /** Register a RIP graphics message handler. Optional - WebSocket only. */
    setRipHandler?(handler: (msg: RipMessage) => void): void;

    /** Register a player-stats push handler. Optional - WebSocket only. */
    setStatsHandler?(handler: (stats: PlayerStats) => void): void;

    /** Set the player stats provider callback. Optional - WebSocket only. */
    setStatsProvider?(provider: () => PlayerStats | null): void;

    /** Send a RIP graphics message. Optional - WebSocket only. */
    sendRip?(msg: RipMessage): void;

    /** Callback invoked when a control message arrives from the transport. Optional. */
    onControlMessage?: (msg: Record<string, unknown>) => void;

    /** Register a callback invoked when transport input limits are exceeded. Optional. */
    setInputOverflowHandler?(handler: (reason: string) => void): void;

    /** Register a game event handler. Optional - WebSocket only. */
    setGameEventHandler?(handler: (event: Record<string, unknown>) => void): void;
}

// ══════════════════════════════════════════════════════════════════════════════
// Session & Connection Types
// ══════════════════════════════════════════════════════════════════════════════

/** User session information */
export interface User {
    name: string;
    secondsRemaining: number;
    secondsRemainingFrom: number;
    number?: number;
    level?: number;
    ansiSupported?: boolean;
    /** When true, all session timeout checks are skipped (CLI mode). */
    noTimeout?: boolean;
}

/** Connection metadata */
export interface Connection {
    remoteIp: string;
    node: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Game Data Types (loaded from JSON files)
// ══════════════════════════════════════════════════════════════════════════════

/** Trainer stats from trainers.json */
export interface TrainerStats {
    name: string;
    str: number;
    def: number;
    hp: number;
    hp_gained: number;
    str_gained: number;
    weapon: string;
    armour: string;
    death: string;
    swear: string;
    needstr1: string;
    needstr2: string;
    need: number;
    gold: number;
    exp: number;
    image?: string;
    [key: string]: unknown;
}

/** Monster stats from monsters.json */
export interface MonsterStats {
    name: string;
    str: number;
    def: number;
    weapon: string;
    death: string;
    gold: number;
    exp: number;
    image?: string;
    [key: string]: unknown;
}

/** Armour stats from armour.json */
export interface ArmourStats {
    name: string;
    num: number;
    def: number;
    price: number;
    [key: string]: unknown;
}

/** Weapon stats from weapons.json */
export interface WeaponStats {
    name: string;
    num: number;
    str: number;
    price: number;
    [key: string]: unknown;
}

/** Castle definition from castles.json */
export interface CastleStats {
    name: string;
    [key: string]: unknown;
}

/** Game settings from settings.json */
export interface Settings {
    timeout: number;
    notime?: string;
    forest_fights: number;
    pvp_fights_per_day: number;
    pvp_gold_loot_cap_factor?: number;
    pvp_gem_loot_cap?: number;
    daily_bank_transfer_gold_cap?: number;
    daily_bank_transfer_gold_cap_reset_on_dragon_kill?: boolean;
    shared_ip_restriction_days?: number;
    shared_ip_block_pvp?: boolean;
    shared_ip_block_bank_transfers?: boolean;
    shared_ip_block_romantic_mail?: boolean;
    shared_ip_ignore_private_addresses?: boolean;
    bank_interest: number;
    transfers_on?: boolean;
    transfers_per_day?: number;
    transfer_amount?: number;
    old_steal?: boolean;
    clean_mode?: boolean;
    remote_game?: string;
    game_user?: string;
    game_pass?: string;
    win_deeds?: number;
    tournament_enabled?: boolean;
    tournament_days?: number;
    tournament_winstat?: number;
    tournament_xp?: number;
    tournament_dkills?: number;
    tournament_pkills?: number;
    tournament_level?: number;
    tournament_lays?: number;
    // Common settings fields from settings.json
    delete_days: number;
    res_days: number;
    inactive_resurrection_spread_minutes?: number;
    inactive_player_policy?: string;
    runtime_dir: string;
    auth_runtime_dir?: string;
    auth_require_email?: boolean;
    data_dir: string;
    nochat: boolean;
    del_1xp: boolean;
    beef_up: boolean;
    olivia: boolean;
    funky_flowers: boolean;
    flower_garden_allow_background_colors?: boolean;
    forest_allow_level_one_monsters_above_level_one?: boolean;
    shop_limit: boolean;
    old_skill_points: boolean;
    death_knight_use_point_divisor?: number;
    thief_use_point_divisor?: number;
    def_for_pk: boolean;
    str_for_pk: boolean;
    dk_boost: boolean;
    death_knight_damage_multiplier?: number;
    dragon_horse_sacrifice_damage?: number;
    prevent_pvp_target_if_already_in_battle?: boolean;
    prevent_login_while_offline_battle_pending?: boolean;
    forest_monster_power_moves?: boolean;
    bar_npc_chatter_probability?: number;
    sleep_dragon: boolean;
    blank_mail_sends_default_message?: boolean;
    player_blocking?: boolean;
    announcement_max_lines?: number;
    announcement_max_per_player_per_day?: number;
    announcement_max_total_per_day?: number;
    announcement_max_chars_per_line?: number;
    maintenance_window_seconds?: number;
    maintenance_force_disconnect?: boolean;
    auto_reset_won_round?: boolean;
    shop_buyback_enabled?: boolean;
    shop_restore_old_item_on_failed_upgrade?: boolean;
    use_fancy_more: boolean;
    safe_node: boolean;
    no_igms_allowed: boolean;
    /** The BBS/realm name displayed to players (e.g. in IGM sleep messages). */
    system_name?: string;
    /** Optional IANA timezone name used to determine day boundaries (e.g. "America/Los_Angeles").
     *  If omitted, the system/local timezone is used.
     */
    timezone?: string;
    /** Storage backend: 'sqlite' (default) or 'dat' (flat files). */
    storage_backend?: string;
    [key: string]: unknown;
}

export interface Dragon {
    name: string;
    str: number;
    gold: number;
    weapon: string;
    exp: number;
    hp: number;
    death: string;
    is_dragon: boolean;
}

/** In-game module (IGM) place entry, shared between Game.ts and IGM.ts */
export interface IGMPlace {
    cmdline: string;
    desc: string;
    menu: string;
    jsIgm?: boolean;
    modulePath?: string;
    /** If true, this is a maintenance-only addon with no player UI. */
    maintenanceOnly?: boolean;
}

/**
 * Monster - a combat opponent (forest creature, the dragon, or a player in PvP).
 * The superset of all fields used by Battle.ts and Forest.ts.
 */
export interface Monster {
    name: string;
    str: number;
    gold: number;
    weapon: string;
    exp: number;
    hp: number;
    death: string;
    def?: number;
    is_dragon?: boolean;
    is_arena?: boolean;
    is_forest?: boolean;
    image?: string;
    // Optional player properties (when pfight=true, op is a LoadedPlayerRecord)
    level?: number;
    sex?: string;
    hp_max?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// Record Definitions (player data, state data, etc.)
// ══════════════════════════════════════════════════════════════════════════════

/** Field definition for binary record files */
export interface FieldDef {
    prop: string;
    name?: string;
    type: string;
    def: string | number | boolean;
}

/** A record definition is an array of field definitions */
export type RecordDef = FieldDef[];

/** Persisted player fields backed by Player_Def. */
export interface PersistedPlayerRecord {
    drag_kills: number;
    olivia_count: number;
    olivia: boolean;
    olivia_asshole: boolean;
    weird: boolean;
    done_tower: boolean;
    has_des: boolean;
    des1: string;
    des2: string;
    name: string;
    real_name: string;
    hp: number;
    hp_max: number;
    gold: number;
    bank: number;
    exp: number;
    level: number;
    sex: string;
    weapon: string;
    weapon_num: number;
    arm: string;
    arm_num: number;
    str: number;
    def: number;
    cha: number;
    gem: number;
    dead: boolean;
    inn: boolean;
    on_now: boolean;
    forest_fights: number;
    high_spirits: boolean;
    time_on: string;
    last_on_unix: number;
    pvp: number;
    flirted: boolean;
    pvp_fights: number;
    seen_master: boolean;
    seen_dragon: boolean;
    seen_violet: boolean;
    seen_bard: boolean;
    horse: boolean;
    amulet: boolean;
    clss: number;
    skillm: number;
    skillw: number;
    skillt: number;
    levelm: number;
    levelw: number;
    levelt: number;
    kids: number;
    laid: number;
    married_to: number;
    divorced: boolean;
    time: number;
    gone: number;
    last_reincarnated: number;
    transferred_gold: number;
    leftbank: boolean;
    got_delicious: boolean;
    /** Reserved IGM field 1 (original LORD new_stat1 - used by NPCLord for personality) */
    new_stat1: number;
    /** Reserved IGM field 2 (original LORD new_stat2 - used by NPCLord for personality) */
    new_stat2: number;
    /** Reserved IGM field 3 (original LORD new_stat3 - used by NPCLord for personality) */
    new_stat3: number;
    is_npc: boolean;
    /** Internal compatibility filler bytes in the persisted record. */
    padding?: string;
}

/** Runtime-only player fields that are intentionally not part of Player_Def. */
export interface PlayerRuntimeFields {
    expert?: boolean;
    has_fairy?: boolean;
    fairy_lore?: boolean;
    magically_delicious?: boolean;
}

/** Player record fields commonly used by game logic. */
export type PlayerRecord = PersistedPlayerRecord;

/**
 * LoadedPlayerRecord - A persisted player record plus runtime-only fields and
 * record management helpers.
 */
export interface LoadedPlayerRecord extends PersistedPlayerRecord, PlayerRuntimeFields {
    Record: number;
    Yours: boolean;
    put(leaveLocked?: boolean): void;
    unLock(): void;
    reInit(): void;
    reLoad(): void;
    [key: string]: unknown;
}

/** State record - global game state */
export interface StateRecord {
    days: number;
    king_killed: boolean;
    king_killer: string;
    dragon_killed: boolean;
    dragon_killer: string;
    married_to_seth: number;
    married_to_violet: number;
    player_fights_today: boolean;
    date_1: number;
    date_2: number;
    [key: string]: unknown;
}

// ══════════════════════════════════════════════════════════════════════════════
// Index and Cache Types
// ══════════════════════════════════════════════════════════════════════════════

/** Text index for LRD files */
export interface TextIndex {
    [key: string]: string[];
}

/** SyncTERM cache files */
export interface SyncTermCacheFiles {
    [key: string]: boolean;
}

/**
 * IGameContext - Interface for the central game state container
 *
 * This is provided for documentation and type-checking purposes.
 * In practice, code should use the concrete GameContext class.
 */
export interface IGameContext {
    // Version
    ver: string;

    // File handles and data stores
    storage: IStorage;
    battleCoordinator: IBattleCoordinator;
    txtfile: LordFile | null;
    txtindex: TextIndex;
    ripfile: LordFile | null;
    ripindex: TextIndex;

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

    // Display mode (ansi / rip / modern)
    uiMode: UiMode;
    rip: boolean;
    modern: boolean;
    synctermCache: boolean;
    synctermCacheFiles: SyncTermCacheFiles;

    // Session data
    user: User;
    connection: Connection;

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

    // Event system
    events: GameEvents;

    // CLASS INSTANCES
    fileUtils: FileUtils;
    equipment: Equipment;
    input: Input;
    display: Output;
    io: IO;
    log: Log;
    mail: Mail;
    rankings: Rankings;
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
    violet: Violet;
    game: Game;
}
