/**
 * Settings - Load and merge game settings from data/settings.json and environment variables.
 *
 * Priority (highest wins):
 *   1. Environment variables (LORD_* prefix, SCREAMING_SNAKE_CASE)
 *   2. .env file at project root, or a CLI-selected env file
 *   3. data/settings.json (defaults shipped with the repo)
 *
 * Environment variable naming: LORD_<SETTING_NAME> in SCREAMING_SNAKE_CASE.
 * A few long settings use shorter canonical aliases to keep env names concise.
 *   e.g. LORD_TIMEOUT=300, LORD_FOREST_FIGHTS=15, LORD_CLEAN_MODE=true
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Settings } from '@lordts/core/types';

export const DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER = 3.0;
export const BOOSTED_DEATH_KNIGHT_DAMAGE_MULTIPLIER = 3.3;
export const DEFAULT_USE_POINT_DIVISOR = 4;
export const LEGACY_USE_POINT_DIVISOR = 5;

/** Map of settings.json key → expected JS type for coercion */
const BOOLEAN_KEYS = new Set([
    'del_1xp', 'clean_mode', 'transfers_on', 'safe_node', 'use_fancy_more',
    'nochat', 'olivia', 'funky_flowers', 'shop_limit', 'old_skill_points',
    'def_for_pk', 'str_for_pk', 'beef_up', 'old_steal', 'sleep_dragon',
    'dk_boost', 'no_igms_allowed', 'prevent_pvp_target_if_already_in_battle',
    'prevent_login_while_offline_battle_pending', 'flower_garden_allow_background_colors',
    'forest_allow_level_one_monsters_above_level_one', 'forest_monster_power_moves',
    'blank_mail_sends_default_message', 'player_blocking',
    'auth_require_email', 'tournament_enabled',
    'maintenance_force_disconnect', 'auto_reset_won_round',
    'shop_buyback_enabled', 'shop_restore_old_item_on_failed_upgrade',
    'daily_bank_transfer_gold_cap_reset_on_dragon_kill',
    'shared_ip_block_pvp', 'shared_ip_block_bank_transfers', 'shared_ip_block_romantic_mail',
    'shared_ip_ignore_private_addresses',
]);

const NUMBER_KEYS = new Set([
    'timeout', 'delete_days', 'transfers_per_day', 'transfer_amount',
    'pvp_fights_per_day', 'pvp_gold_loot_cap_factor', 'pvp_gem_loot_cap', 'daily_bank_transfer_gold_cap', 'shared_ip_restriction_days', 'forest_fights', 'res_days', 'inactive_resurrection_spread_minutes', 'bank_interest',
    'win_deeds', 'death_knight_damage_multiplier', 'dragon_horse_sacrifice_damage',
    'tournament_days', 'tournament_winstat', 'tournament_xp', 'tournament_dkills', 'tournament_pkills', 'tournament_level', 'tournament_lays',
    'bar_npc_chatter_probability', 'death_knight_use_point_divisor', 'thief_use_point_divisor',
    'announcement_max_lines', 'announcement_max_per_player_per_day',
    'announcement_max_total_per_day', 'announcement_max_chars_per_line',
    'maintenance_window_seconds',
]);

const RENAMED_ENV_KEYS = new Map<string, string>([
    ['INACT_RES_SPREAD_MINS', 'inactive_resurrection_spread_minutes'],
    ['BANK_XFER_GOLD_CAP', 'daily_bank_transfer_gold_cap'],
    ['BANK_XFER_GOLD_RESET_KILL', 'daily_bank_transfer_gold_cap_reset_on_dragon_kill'],
    ['FLOWER_BG_COLORS', 'flower_garden_allow_background_colors'],
    ['FOREST_L1_ABOVE_L1', 'forest_allow_level_one_monsters_above_level_one'],
    ['FOREST_POWER_MOVES', 'forest_monster_power_moves'],
    ['BAR_NPC_CHATTER_PROB', 'bar_npc_chatter_probability'],
    ['BLANK_MAIL_DEFAULT_MSG', 'blank_mail_sends_default_message'],
    ['SHARED_IP_WINDOW_DAYS', 'shared_ip_restriction_days'],
    ['SHARED_IP_BLOCK_BANK_XFER', 'shared_ip_block_bank_transfers'],
    ['SHARED_IP_BLOCK_ROMANCE', 'shared_ip_block_romantic_mail'],
    ['SHARED_IP_IGNORE_PRIVATE', 'shared_ip_ignore_private_addresses'],
    ['ANN_MAX_PER_PLAYER_DAY', 'announcement_max_per_player_per_day'],
    ['ANN_MAX_TOTAL_DAY', 'announcement_max_total_per_day'],
    ['ANN_MAX_CHARS_LINE', 'announcement_max_chars_per_line'],
    ['MAINT_WINDOW_SECONDS', 'maintenance_window_seconds'],
    ['MAINT_FORCE_DISCONNECT', 'maintenance_force_disconnect'],
    ['SHOP_RESTORE_ITEM_ON_FAIL', 'shop_restore_old_item_on_failed_upgrade'],
    ['DK_USE_POINT_DIVISOR', 'death_knight_use_point_divisor'],
    ['DK_DAMAGE_MULTIPLIER', 'death_knight_damage_multiplier'],
    ['DRAGON_HORSE_SAC_DAMAGE', 'dragon_horse_sacrifice_damage'],
    ['BLOCK_PVP_IF_IN_BATTLE', 'prevent_pvp_target_if_already_in_battle'],
    ['BLOCK_LOGIN_PEND_BATTLE', 'prevent_login_while_offline_battle_pending'],
]);

function isValidNonNegativeNumber(value: unknown): value is number {
    return typeof value === 'number' && !isNaN(value) && value >= 0;
}

function isValidPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Resolve effective Death Knight damage multiplier with backwards-compatible dk_boost:
 * 1. No explicit multiplier -> use dk_boost flag to choose 3.0 or 3.3
 * 2. Invalid value -> fall back to 3.0
 * 3. Configured at exactly 3.0 AND dk_boost=true -> upgrade to 3.3 (legacy compat)
 * 4. Any other explicit value -> use as-is (dk_boost ignored)
 */
export function resolveDeathKnightDamageMultiplier(
    settings: Pick<Settings, 'death_knight_damage_multiplier' | 'dk_boost'>,
): number {
    const configuredMultiplier = settings.death_knight_damage_multiplier;

    if (configuredMultiplier === undefined) {
        return settings.dk_boost
            ? BOOSTED_DEATH_KNIGHT_DAMAGE_MULTIPLIER
            : DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER;
    }

    if (!isValidNonNegativeNumber(configuredMultiplier)) {
        return DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER;
    }

    if (
        configuredMultiplier === DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER
        && settings.dk_boost
    ) {
        return BOOSTED_DEATH_KNIGHT_DAMAGE_MULTIPLIER;
    }

    return configuredMultiplier;
}

function resolveUsePointDivisor(configuredDivisor: number | undefined, oldSkillPoints: boolean): number {
    if (configuredDivisor === undefined) {
        return oldSkillPoints ? LEGACY_USE_POINT_DIVISOR : DEFAULT_USE_POINT_DIVISOR;
    }

    if (!isValidPositiveInteger(configuredDivisor)) {
        return DEFAULT_USE_POINT_DIVISOR;
    }

    if (configuredDivisor === DEFAULT_USE_POINT_DIVISOR && oldSkillPoints) {
        return LEGACY_USE_POINT_DIVISOR;
    }

    return configuredDivisor;
}

export function resolveDeathKnightUsePointDivisor(
    settings: Pick<Settings, 'death_knight_use_point_divisor' | 'old_skill_points'>,
): number {
    return resolveUsePointDivisor(settings.death_knight_use_point_divisor, settings.old_skill_points);
}

export function resolveThiefUsePointDivisor(
    settings: Pick<Settings, 'thief_use_point_divisor' | 'old_skill_points'>,
): number {
    return resolveUsePointDivisor(settings.thief_use_point_divisor, settings.old_skill_points);
}

/**
 * Parse a .env file into key-value pairs.
 * Supports: KEY=VALUE, KEY="VALUE", KEY='VALUE', # comments, blank lines.
 */
function parseEnvFile(filePath: string): Record<string, string> {
    const result: Record<string, string> = {};
    if (!fs.existsSync(filePath)) return result;

    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx < 1) continue;
        const key = line.substring(0, eqIdx).trim();
        let value = line.substring(eqIdx + 1).trim();
        // Strip matching quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

/**
 * Coerce a string environment value to the appropriate JS type
 * based on the setting key name.
 */
function coerceValue(key: string, value: string): string | number | boolean {
    if (BOOLEAN_KEYS.has(key)) {
        return value === 'true' || value === '1' || value === 'yes';
    }
    if (NUMBER_KEYS.has(key)) {
        const n = Number(value);
        return isNaN(n) ? value : n;
    }
    return value;
}

/**
 * Convert SCREAMING_SNAKE_CASE to the settings.json key format (lowercase_snake_case).
 * e.g. "FOREST_FIGHTS" → "forest_fights", "TIMEOUT" → "timeout"
 */
function envKeyToSettingsKey(envKey: string): string {
    return envKey.toLowerCase();
}

function resolveSettingsKeyFromEnvSuffix(envSuffix: string): string | undefined {
    return RENAMED_ENV_KEYS.get(envSuffix) ?? envKeyToSettingsKey(envSuffix);
}

/** Resolve the default or CLI-selected env file path. */
export function resolveEnvFilePath(projectRoot: string, envFilePath?: string): string {
    if (!envFilePath) return path.join(projectRoot, '.env');
    return path.isAbsolute(envFilePath) ? envFilePath : path.resolve(projectRoot, envFilePath);
}

/**
 * Extract a global --env-file option from a CLI argv array.
 * Relative paths are resolved against the project root.
 */
export function extractEnvFileArg(projectRoot: string, argv: string[]): { argv: string[]; envFilePath?: string } {
    const filteredArgv = argv.slice(0, 2);
    let envFilePath: string | undefined;

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--env-file') {
            const value = argv[++i];
            if (!value) throw new Error('--env-file requires a path');
            envFilePath = resolveEnvFilePath(projectRoot, value);
            continue;
        }

        if (arg.startsWith('--env-file=')) {
            const value = arg.substring('--env-file='.length);
            if (!value) throw new Error('--env-file requires a path');
            envFilePath = resolveEnvFilePath(projectRoot, value);
            continue;
        }

        filteredArgv.push(arg);
    }

    if (envFilePath && !fs.existsSync(envFilePath)) {
        throw new Error('Env file not found: ' + envFilePath);
    }

    return { argv: filteredArgv, envFilePath };
}

/**
 * Load the default or CLI-selected env file (if it exists) into process.env,
 * without overwriting variables that are already set.
 */
export function loadDotEnv(projectRoot: string, envFilePath?: string): void {
    const envPath = resolveEnvFilePath(projectRoot, envFilePath);
    const parsed = parseEnvFile(envPath);
    for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

/**
 * Load settings:
 * 1. Read defaults from data/settings.json
 * 2. Override with LORD_* environment variables
 */
export function loadSettings(dataDir: string): Settings {
    const defaults: Settings = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')
    ) as Settings;

    // Apply LORD_* env var overrides
    const prefix = 'LORD_';
    for (const [envKey, envValue] of Object.entries(process.env)) {
        if (!envKey.startsWith(prefix) || envValue === undefined) continue;
        const settingsKey = resolveSettingsKeyFromEnvSuffix(envKey.substring(prefix.length));
        if (settingsKey === undefined) continue;
        (defaults as Record<string, unknown>)[settingsKey] = coerceValue(settingsKey, envValue);
    }

    defaults.death_knight_damage_multiplier = resolveDeathKnightDamageMultiplier(defaults);

    return defaults;
}
