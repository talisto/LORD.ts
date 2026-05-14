/**
 * NPCLord - Definitions, Types, and Constants
 * Ported from NPCMaint by Joseph Masters, 1995
 */

// ─── Level Advancement Tables ─────────────────────────────────────────────────

/**
 * Experience required to reach each level (index = target level, 1..12).
 * Progression is roughly 4x/2.5x alternating, matching LORD v4.08 exactly.
 * Index 12 = Infinity: level 12 players never auto-advance (dragon fight required).
 */
export const LEVEL_EXP: readonly number[] = [
    0,      // level 0 (unused)
    100,    // level 1 → 2
    400,    // level 2 → 3
    1000,   // level 3 → 4
    4000,   // level 4 → 5
    10000,  // level 5 → 6
    40000,  // level 6 → 7
    100000, // level 7 → 8
    400000, // level 8 → 9
    1000000,// level 9 → 10
    4000000,// level 10 → 11
    10000000, // level 11 → 12
    Infinity,
];

/** HP max gain on level up (index = new level, 2..12) */
export const LEVEL_HP_GAIN: readonly number[] = [
    0, 0,    // 0,1 unused
    10, 15, 20, 30, 50, 75, 100, 185, 250, 350, 550,
];

/** Strength gain on level up */
export const LEVEL_STR_GAIN: readonly number[] = [
    0, 0,    // 0,1 unused
    5, 7, 10, 12, 20, 35, 50, 75, 110, 150, 200,
];

/** Defense gain on level up */
export const LEVEL_DEF_GAIN: readonly number[] = [
    0, 0,    // 0,1 unused
    2, 3, 5, 10, 15, 22, 37, 60, 80, 120, 150,
];

/** Master name per new level (index = new level, 2..12) */
export const LEVEL_MASTER: readonly string[] = [
    '', '',   // 0,1 unused
    'Halder', 'Barak', 'Aragorn', 'Olodrin', 'Sand Tiger',
    'Sparhawk', 'Atsuko Sensei', 'Aladdin', 'Prince Caspian', 'Gandalf', 'Turgon',
];

// ─── NPC Config ───────────────────────────────────────────────────────────────

/** Config stored in DB under key 'npclord' */
export interface NpcConfig {
    fightsPerDay: number;  // number of forest fights per NPC per day (default 10)
    playFights: number;    // number of PvP fights per NPC per day (default 3)
    levelFight: number;    // level range bonus for PvP targeting (default 2)
    leveljump: number;     // max level advances per day per NPC (default 1)
    everyday: boolean;     // if false, NPC has a chance to skip daily actions based on personality stats (default false)
    havekids: boolean;     // allow NPC child interactions (default false)
    marryViolet: boolean;  // allow NPCs to marry Violet (default true)
    logMonster: boolean;   // log monster kills (default true)
    logLaid: boolean;      // log flirt events (default true)
    logSlaughter: boolean; // log NPC kills (default true)
    logDragon: boolean;    // log dragon kills (default true)
    logMaster: boolean;    // log level advances (default true)
}

export const NPCLORD_CONFIG_KEY = 'npclord';

export const NPCLORD_CONFIG_DEFAULTS: NpcConfig = {
    fightsPerDay: 10,
    playFights: 3,
    levelFight: 2,
    leveljump: 1,
    everyday: false,
    havekids: false,
    marryViolet: true,
    logMonster: true,
    logLaid: true,
    logSlaughter: true,
    logDragon: true,
    logMaster: true,
};

// ─── Dragon Fight Constants ───────────────────────────────────────────────────

export const DRAGON_HP = 11250;
export const DRAGON_STR = 1000;

// ─── NPC Personality Stat Ranges ──────────────────────────────────────────────

/** new_stat1: fight aggression (1-5). Stored in player.new_stat1 */
export const STAT1_MIN = 1;
export const STAT1_MAX = 5;
/** new_stat2: social/charm probability (1-5). Stored in player.new_stat2 */
export const STAT2_MIN = 1;
export const STAT2_MAX = 5;
/** new_stat3: romance level (5-10). Stored in player.new_stat3 */
export const STAT3_MIN = 5;
export const STAT3_MAX = 10;

/** IGM data key for NPCLord per-player data in the igm_data table */
export const NPCLORD_IGM_DATA_KEY = 'npclord';

// ─── NPC Run State ────────────────────────────────────────────────────────────

export interface NpcRunState {
    alive: boolean;
    fightsPerDay: number;
    playFights: number;
    levelFight: number;
}

// ─── Phrase Collections ───────────────────────────────────────────────────────

export interface NpcPhrases {
    barChat: string[];
    aiMail: string[];
    pvpNpcWins: string[];    // taunts when NPC wins PvP (sent as mail + bar post)
    pvpNpcLoses: string[];   // congrats when NPC loses PvP (sent as mail + bar post)
    dragonSlay: string[];    // bar post when NPC slays dragon
    marriage: string[];      // bar post when NPC marries Violet
    aiReplyPairs: AiReplyPair[];  // keyword→response pairs for mail replies
    aiReplyDefault: string;  // default reply when no keyword matches
}

export interface AiReplyPair {
    keyword: string;
    response: string;
}

/** JSON structure for AIREPLY.JSON */
export interface AiReplyConfig {
    defaultReply: string;
    pairs: AiReplyPair[];
}

// ─── Attached Lover Config ────────────────────────────────────────────────────

export interface AttachedConfig {
    killed: string;      // message sent when NPC's lover killed the NPC
    transfer: string;    // message sent with gold transfer
    affection: string;   // love message sent to lover
}

// ─── Monster data (from data/monsters.json) ───────────────────────────────────

export interface MonsterData {
    name: string;
    str: number;
    gold: number;
    weapon: string;
    exp: number;
    hp: number;
    death: string;
}
