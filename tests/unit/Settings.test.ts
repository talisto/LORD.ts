/**
 * Settings - Unit tests for game settings loading
 *
 * Tests loadSettings, loadDotEnv, environment variable overrides,
 * boolean/number coercion, and key name mapping.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    DEFAULT_USE_POINT_DIVISOR,
    BOOSTED_DEATH_KNIGHT_DAMAGE_MULTIPLIER,
    DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER,
    LEGACY_USE_POINT_DIVISOR,
    extractEnvFileArg,
    loadSettings,
    loadDotEnv,
    resolveDeathKnightUsePointDivisor,
    resolveEnvFilePath,
    resolveThiefUsePointDivisor,
} from '@lordts/util/Settings';

const DATA_DIR = path.join(__dirname, '../../data');

function loadSettingsWithEnv(envKey: string, envValue: string) {
    const orig = process.env[envKey];
    try {
        process.env[envKey] = envValue;
        return loadSettings(DATA_DIR);
    } finally {
        if (orig === undefined) {
            delete process.env[envKey];
        } else {
            process.env[envKey] = orig;
        }
    }
}

describe('Settings', () => {

    // ── loadSettings ────────────────────────────────────────────────────

    describe('loadSettings()', () => {
        test('loads default settings from data/settings.json', () => {
            const settings = loadSettings(DATA_DIR);
            expect(settings).toBeDefined();
            expect(typeof settings).toBe('object');
        });

        test('default settings have forest_fights as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.forest_fights).toBe('number');
            expect(settings.forest_fights).toBeGreaterThan(0);
        });

        test('default settings have timeout as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.timeout).toBe('number');
            expect(settings.timeout).toBe(900);
        });

        test('default settings include tournament fields in the main settings object', () => {
            const settings = loadSettings(DATA_DIR);
            expect(settings.tournament_enabled).toBe(false);
            expect(settings.tournament_days).toBe(0);
            expect(settings.tournament_dkills).toBe(0);
        });

        test('default settings have pvp_gold_loot_cap_factor as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.pvp_gold_loot_cap_factor).toBe('number');
            expect(settings.pvp_gold_loot_cap_factor).toBe(0);
        });

        test('default settings have pvp_gem_loot_cap as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.pvp_gem_loot_cap).toBe('number');
            expect(settings.pvp_gem_loot_cap).toBe(0);
        });

        test('default settings have daily_bank_transfer_gold_cap as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.daily_bank_transfer_gold_cap).toBe('number');
            expect(settings.daily_bank_transfer_gold_cap).toBe(0);
        });

        test('default settings have daily_bank_transfer_gold_cap_reset_on_dragon_kill as a boolean', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.daily_bank_transfer_gold_cap_reset_on_dragon_kill).toBe('boolean');
            expect(settings.daily_bank_transfer_gold_cap_reset_on_dragon_kill).toBe(false);
        });

        test('default settings have shared_ip_restriction_days as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.shared_ip_restriction_days).toBe('number');
            expect(settings.shared_ip_restriction_days).toBe(0);
        });

        test('default settings have shared-IP restriction flags as booleans', () => {
            const settings = loadSettings(DATA_DIR);
            expect(settings.shared_ip_block_pvp).toBe(false);
            expect(settings.shared_ip_block_bank_transfers).toBe(false);
            expect(settings.shared_ip_block_romantic_mail).toBe(false);
            expect(settings.shared_ip_ignore_private_addresses).toBe(true);
        });

        test('default settings have del_1xp as a boolean', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.del_1xp).toBe('boolean');
        });

        test('default settings have clean_mode as a boolean', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.clean_mode).toBe('boolean');
        });

        test('default settings have maintenance_window_seconds as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.maintenance_window_seconds).toBe('number');
            expect(settings.maintenance_window_seconds).toBe(0);
        });

        test('default settings have inactive_resurrection_spread_minutes as a number', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.inactive_resurrection_spread_minutes).toBe('number');
            expect(settings.inactive_resurrection_spread_minutes).toBe(0);
        });

        test('default settings have maintenance_force_disconnect as a boolean', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.maintenance_force_disconnect).toBe('boolean');
            expect(settings.maintenance_force_disconnect).toBe(false);
        });

        test('default settings have auto_reset_won_round as a boolean', () => {
            const settings = loadSettings(DATA_DIR);
            expect(typeof settings.auto_reset_won_round).toBe('boolean');
            expect(settings.auto_reset_won_round).toBe(false);
        });

        test('default settings resolve Death Knight damage multiplier to stock damage', () => {
            const settings = loadSettings(DATA_DIR);
            expect(settings.death_knight_damage_multiplier).toBe(DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER);
        });

        test('default settings resolve use point divisors to stock values', () => {
            const settings = loadSettings(DATA_DIR);
            expect(resolveDeathKnightUsePointDivisor(settings)).toBe(DEFAULT_USE_POINT_DIVISOR);
            expect(resolveThiefUsePointDivisor(settings)).toBe(DEFAULT_USE_POINT_DIVISOR);
        });

        test('LORD_ env var overrides a numeric setting', () => {
            const orig = process.env['LORD_FOREST_FIGHTS'];
            try {
                process.env['LORD_FOREST_FIGHTS'] = '42';
                const settings = loadSettings(DATA_DIR);
                expect(settings.forest_fights).toBe(42);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_FOREST_FIGHTS'];
                } else {
                    process.env['LORD_FOREST_FIGHTS'] = orig;
                }
            }
        });

        test('LORD_ env var overrides PvP gold loot cap factor', () => {
            const orig = process.env['LORD_PVP_GOLD_LOOT_CAP_FACTOR'];
            try {
                process.env['LORD_PVP_GOLD_LOOT_CAP_FACTOR'] = '1.25';
                const settings = loadSettings(DATA_DIR);
                expect(settings.pvp_gold_loot_cap_factor).toBe(1.25);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_PVP_GOLD_LOOT_CAP_FACTOR'];
                } else {
                    process.env['LORD_PVP_GOLD_LOOT_CAP_FACTOR'] = orig;
                }
            }
        });

        test('LORD_ env var overrides PvP gem loot cap', () => {
            const orig = process.env['LORD_PVP_GEM_LOOT_CAP'];
            try {
                process.env['LORD_PVP_GEM_LOOT_CAP'] = '3';
                const settings = loadSettings(DATA_DIR);
                expect(settings.pvp_gem_loot_cap).toBe(3);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_PVP_GEM_LOOT_CAP'];
                } else {
                    process.env['LORD_PVP_GEM_LOOT_CAP'] = orig;
                }
            }
        });

        test('LORD_ env var overrides daily bank transfer gold cap', () => {
            const settings = loadSettingsWithEnv('LORD_BANK_XFER_GOLD_CAP', '7500');
            expect(settings.daily_bank_transfer_gold_cap).toBe(7500);
        });

        test('LORD_ env var overrides dragon-kill reset for the daily bank transfer cap', () => {
            const settings = loadSettingsWithEnv('LORD_BANK_XFER_GOLD_RESET_KILL', 'true');
            expect(settings.daily_bank_transfer_gold_cap_reset_on_dragon_kill).toBe(true);
        });

        test('LORD_ env var overrides shared IP restriction days', () => {
            const settings = loadSettingsWithEnv('LORD_SHARED_IP_WINDOW_DAYS', '7');
            expect(settings.shared_ip_restriction_days).toBe(7);
        });

        test('LORD_ env var overrides shared IP PvP blocking', () => {
            const orig = process.env['LORD_SHARED_IP_BLOCK_PVP'];
            try {
                process.env['LORD_SHARED_IP_BLOCK_PVP'] = 'true';
                const settings = loadSettings(DATA_DIR);
                expect(settings.shared_ip_block_pvp).toBe(true);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_SHARED_IP_BLOCK_PVP'];
                } else {
                    process.env['LORD_SHARED_IP_BLOCK_PVP'] = orig;
                }
            }
        });

        test('LORD_ env var overrides auth email requirement as a boolean', () => {
            const settings = loadSettingsWithEnv('LORD_AUTH_REQUIRE_EMAIL', 'true');
            expect(settings.auth_require_email).toBe(true);
        });

        test('LORD_ env var overrides tournament enabled', () => {
            const settings = loadSettingsWithEnv('LORD_TOURNAMENT_ENABLED', 'true');
            expect(settings.tournament_enabled).toBe(true);
        });

        test('LORD_ env var overrides tournament thresholds', () => {
            const settings = loadSettingsWithEnv('LORD_TOURNAMENT_DKILLS', '5');
            expect(settings.tournament_dkills).toBe(5);
        });

        test.each([
            ['LORD_INACT_RES_SPREAD_MINS', 'inactive_resurrection_spread_minutes', '15', 15],
            ['LORD_FLOWER_BG_COLORS', 'flower_garden_allow_background_colors', 'false', false],
            ['LORD_FOREST_L1_ABOVE_L1', 'forest_allow_level_one_monsters_above_level_one', 'false', false],
            ['LORD_FOREST_POWER_MOVES', 'forest_monster_power_moves', 'false', false],
            ['LORD_BAR_NPC_CHATTER_PROB', 'bar_npc_chatter_probability', '0.25', 0.25],
            ['LORD_BLANK_MAIL_DEFAULT_MSG', 'blank_mail_sends_default_message', 'false', false],
            ['LORD_SHARED_IP_BLOCK_BANK_XFER', 'shared_ip_block_bank_transfers', 'true', true],
            ['LORD_SHARED_IP_BLOCK_ROMANCE', 'shared_ip_block_romantic_mail', 'true', true],
            ['LORD_SHARED_IP_IGNORE_PRIVATE', 'shared_ip_ignore_private_addresses', 'false', false],
            ['LORD_ANN_MAX_PER_PLAYER_DAY', 'announcement_max_per_player_per_day', '3', 3],
            ['LORD_ANN_MAX_TOTAL_DAY', 'announcement_max_total_per_day', '8', 8],
            ['LORD_ANN_MAX_CHARS_LINE', 'announcement_max_chars_per_line', '60', 60],
            ['LORD_MAINT_WINDOW_SECONDS', 'maintenance_window_seconds', '30', 30],
            ['LORD_MAINT_FORCE_DISCONNECT', 'maintenance_force_disconnect', 'true', true],
            ['LORD_SHOP_RESTORE_ITEM_ON_FAIL', 'shop_restore_old_item_on_failed_upgrade', 'true', true],
            ['LORD_DK_USE_POINT_DIVISOR', 'death_knight_use_point_divisor', '6', 6],
            ['LORD_DK_DAMAGE_MULTIPLIER', 'death_knight_damage_multiplier', '4.2', 4.2],
            ['LORD_DRAGON_HORSE_SAC_DAMAGE', 'dragon_horse_sacrifice_damage', '12', 12],
            ['LORD_BLOCK_PVP_IF_IN_BATTLE', 'prevent_pvp_target_if_already_in_battle', 'true', true],
            ['LORD_BLOCK_LOGIN_PEND_BATTLE', 'prevent_login_while_offline_battle_pending', 'true', true],
            ['LORD_BANK_XFER_GOLD_CAP', 'daily_bank_transfer_gold_cap', '7500', 7500],
            ['LORD_BANK_XFER_GOLD_RESET_KILL', 'daily_bank_transfer_gold_cap_reset_on_dragon_kill', 'true', true],
        ] as const)('short alias %s overrides %s', (envKey, settingsKey, envValue, expected) => {
            const settings = loadSettingsWithEnv(envKey, envValue);
            expect((settings as Record<string, unknown>)[settingsKey]).toBe(expected);
        });

        test('LORD_ env var overrides Death Knight damage multiplier', () => {
            const settings = loadSettingsWithEnv('LORD_DK_DAMAGE_MULTIPLIER', '4.2');
            expect(settings.death_knight_damage_multiplier).toBe(4.2);
        });

        test('legacy dk_boost alias still resolves to the 3.3x multiplier', () => {
            const origMultiplier = process.env['LORD_DK_DAMAGE_MULTIPLIER'];
            const origBoost = process.env['LORD_DK_BOOST'];
            try {
                delete process.env['LORD_DK_DAMAGE_MULTIPLIER'];
                process.env['LORD_DK_BOOST'] = 'true';
                const settings = loadSettings(DATA_DIR);
                expect(settings.death_knight_damage_multiplier).toBe(BOOSTED_DEATH_KNIGHT_DAMAGE_MULTIPLIER);
            } finally {
                if (origMultiplier === undefined) {
                    delete process.env['LORD_DK_DAMAGE_MULTIPLIER'];
                } else {
                    process.env['LORD_DK_DAMAGE_MULTIPLIER'] = origMultiplier;
                }
                if (origBoost === undefined) {
                    delete process.env['LORD_DK_BOOST'];
                } else {
                    process.env['LORD_DK_BOOST'] = origBoost;
                }
            }
        });

        test('legacy old_skill_points alias still resolves both use point divisors to five', () => {
            const origOldSkillPoints = process.env['LORD_OLD_SKILL_POINTS'];
            try {
                process.env['LORD_OLD_SKILL_POINTS'] = 'true';
                const settings = loadSettings(DATA_DIR);
                expect(resolveDeathKnightUsePointDivisor(settings)).toBe(LEGACY_USE_POINT_DIVISOR);
                expect(resolveThiefUsePointDivisor(settings)).toBe(LEGACY_USE_POINT_DIVISOR);
            } finally {
                if (origOldSkillPoints === undefined) {
                    delete process.env['LORD_OLD_SKILL_POINTS'];
                } else {
                    process.env['LORD_OLD_SKILL_POINTS'] = origOldSkillPoints;
                }
            }
        });

        test('new use point divisor settings override the legacy alias', () => {
            const origOldSkillPoints = process.env['LORD_OLD_SKILL_POINTS'];
            const origDeathKnightDivisor = process.env['LORD_DK_USE_POINT_DIVISOR'];
            const origThiefDivisor = process.env['LORD_THIEF_USE_POINT_DIVISOR'];
            try {
                process.env['LORD_OLD_SKILL_POINTS'] = 'true';
                process.env['LORD_DK_USE_POINT_DIVISOR'] = '6';
                process.env['LORD_THIEF_USE_POINT_DIVISOR'] = '7';
                const settings = loadSettings(DATA_DIR);
                expect(resolveDeathKnightUsePointDivisor(settings)).toBe(6);
                expect(resolveThiefUsePointDivisor(settings)).toBe(7);
            } finally {
                if (origOldSkillPoints === undefined) {
                    delete process.env['LORD_OLD_SKILL_POINTS'];
                } else {
                    process.env['LORD_OLD_SKILL_POINTS'] = origOldSkillPoints;
                }
                if (origDeathKnightDivisor === undefined) {
                    delete process.env['LORD_DK_USE_POINT_DIVISOR'];
                } else {
                    process.env['LORD_DK_USE_POINT_DIVISOR'] = origDeathKnightDivisor;
                }
                if (origThiefDivisor === undefined) {
                    delete process.env['LORD_THIEF_USE_POINT_DIVISOR'];
                } else {
                    process.env['LORD_THIEF_USE_POINT_DIVISOR'] = origThiefDivisor;
                }
            }
        });

        test('invalid Death Knight damage multiplier falls back to stock damage', () => {
            const origMultiplier = process.env['LORD_DK_DAMAGE_MULTIPLIER'];
            const origBoost = process.env['LORD_DK_BOOST'];
            try {
                process.env['LORD_DK_DAMAGE_MULTIPLIER'] = '-1';
                process.env['LORD_DK_BOOST'] = 'true';
                const settings = loadSettings(DATA_DIR);
                expect(settings.death_knight_damage_multiplier).toBe(DEFAULT_DEATH_KNIGHT_DAMAGE_MULTIPLIER);
            } finally {
                if (origMultiplier === undefined) {
                    delete process.env['LORD_DK_DAMAGE_MULTIPLIER'];
                } else {
                    process.env['LORD_DK_DAMAGE_MULTIPLIER'] = origMultiplier;
                }
                if (origBoost === undefined) {
                    delete process.env['LORD_DK_BOOST'];
                } else {
                    process.env['LORD_DK_BOOST'] = origBoost;
                }
            }
        });

        test('LORD_ env var overrides a boolean setting (true)', () => {
            const orig = process.env['LORD_DEL_1XP'];
            try {
                process.env['LORD_DEL_1XP'] = 'true';
                const settings = loadSettings(DATA_DIR);
                expect(settings.del_1xp).toBe(true);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_DEL_1XP'];
                } else {
                    process.env['LORD_DEL_1XP'] = orig;
                }
            }
        });

        test('LORD_ env var overrides a boolean setting (false)', () => {
            const orig = process.env['LORD_DEL_1XP'];
            try {
                process.env['LORD_DEL_1XP'] = 'false';
                const settings = loadSettings(DATA_DIR);
                expect(settings.del_1xp).toBe(false);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_DEL_1XP'];
                } else {
                    process.env['LORD_DEL_1XP'] = orig;
                }
            }
        });

        test('boolean env var "1" coerces to true', () => {
            const orig = process.env['LORD_CLEAN_MODE'];
            try {
                process.env['LORD_CLEAN_MODE'] = '1';
                const settings = loadSettings(DATA_DIR);
                expect(settings.clean_mode).toBe(true);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_CLEAN_MODE'];
                } else {
                    process.env['LORD_CLEAN_MODE'] = orig;
                }
            }
        });

        test('boolean env var "yes" coerces to true', () => {
            const orig = process.env['LORD_CLEAN_MODE'];
            try {
                process.env['LORD_CLEAN_MODE'] = 'yes';
                const settings = loadSettings(DATA_DIR);
                expect(settings.clean_mode).toBe(true);
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_CLEAN_MODE'];
                } else {
                    process.env['LORD_CLEAN_MODE'] = orig;
                }
            }
        });

        test('string setting is kept as string', () => {
            const orig = process.env['LORD_TIMEZONE'];
            try {
                process.env['LORD_TIMEZONE'] = 'America/Los_Angeles';
                const settings = loadSettings(DATA_DIR);
                expect(settings.timezone).toBe('America/Los_Angeles');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TIMEZONE'];
                } else {
                    process.env['LORD_TIMEZONE'] = orig;
                }
            }
        });

        test('invalid number env var for numeric key gets NaN fallback', () => {
            const orig = process.env['LORD_TIMEOUT'];
            try {
                process.env['LORD_TIMEOUT'] = 'notanumber';
                const settings = loadSettings(DATA_DIR);
                // coerceValue returns the raw string if parseInt gives NaN
                expect(settings.timeout).toBe('notanumber');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TIMEOUT'];
                } else {
                    process.env['LORD_TIMEOUT'] = orig;
                }
            }
        });
    });

    // ── loadDotEnv ──────────────────────────────────────────────────────

    describe('loadDotEnv()', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-test-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('does nothing when .env file does not exist', () => {
            const before = process.env['LORD_TEST_VAR_DOTENV'];
            // No .env file - should not throw, no values added
            expect(() => loadDotEnv(tmpDir)).not.toThrow();
            expect(process.env['LORD_TEST_VAR_DOTENV']).toBe(before);
        });

        test('reads KEY=VALUE pairs from .env file', () => {
            const orig = process.env['LORD_TEST_DOTENV_SIMPLE'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), 'LORD_TEST_DOTENV_SIMPLE=hello\n');
                delete process.env['LORD_TEST_DOTENV_SIMPLE'];
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_DOTENV_SIMPLE']).toBe('hello');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_DOTENV_SIMPLE'];
                } else {
                    process.env['LORD_TEST_DOTENV_SIMPLE'] = orig;
                }
            }
        });

        test('reads from a custom env file path when provided', () => {
            const orig = process.env['LORD_TEST_CUSTOM_ENV_FILE'];
            try {
                fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
                fs.writeFileSync(
                    path.join(tmpDir, 'config', 'game2.env'),
                    'LORD_TEST_CUSTOM_ENV_FILE=custom\n'
                );
                delete process.env['LORD_TEST_CUSTOM_ENV_FILE'];
                loadDotEnv(tmpDir, 'config/game2.env');
                expect(process.env['LORD_TEST_CUSTOM_ENV_FILE']).toBe('custom');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_CUSTOM_ENV_FILE'];
                } else {
                    process.env['LORD_TEST_CUSTOM_ENV_FILE'] = orig;
                }
            }
        });

        test('strips double-quoted values', () => {
            const orig = process.env['LORD_TEST_QUOTED'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), 'LORD_TEST_QUOTED="hello world"\n');
                delete process.env['LORD_TEST_QUOTED'];
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_QUOTED']).toBe('hello world');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_QUOTED'];
                } else {
                    process.env['LORD_TEST_QUOTED'] = orig;
                }
            }
        });

        test('strips single-quoted values', () => {
            const orig = process.env['LORD_TEST_SQUOTED'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), "LORD_TEST_SQUOTED='single quote'\n");
                delete process.env['LORD_TEST_SQUOTED'];
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_SQUOTED']).toBe('single quote');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_SQUOTED'];
                } else {
                    process.env['LORD_TEST_SQUOTED'] = orig;
                }
            }
        });

        test('ignores comment lines starting with #', () => {
            const orig = process.env['LORD_TEST_COMMENT'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), '# This is a comment\nLORD_TEST_COMMENT=value\n');
                delete process.env['LORD_TEST_COMMENT'];
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_COMMENT']).toBe('value');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_COMMENT'];
                } else {
                    process.env['LORD_TEST_COMMENT'] = orig;
                }
            }
        });

        test('ignores blank lines', () => {
            const orig = process.env['LORD_TEST_BLANKS'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), '\n\nLORD_TEST_BLANKS=ok\n\n');
                delete process.env['LORD_TEST_BLANKS'];
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_BLANKS']).toBe('ok');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_BLANKS'];
                } else {
                    process.env['LORD_TEST_BLANKS'] = orig;
                }
            }
        });

        test('does not overwrite already-set env vars', () => {
            const orig = process.env['LORD_TEST_NO_OVERWRITE'];
            try {
                process.env['LORD_TEST_NO_OVERWRITE'] = 'original';
                fs.writeFileSync(path.join(tmpDir, '.env'), 'LORD_TEST_NO_OVERWRITE=override\n');
                loadDotEnv(tmpDir);
                expect(process.env['LORD_TEST_NO_OVERWRITE']).toBe('original');
            } finally {
                if (orig === undefined) {
                    delete process.env['LORD_TEST_NO_OVERWRITE'];
                } else {
                    process.env['LORD_TEST_NO_OVERWRITE'] = orig;
                }
            }
        });

        test('lines without = are ignored', () => {
            const orig = process.env['NODOTENV'];
            try {
                fs.writeFileSync(path.join(tmpDir, '.env'), 'NODOTENV\nVALID=yes\n');
                loadDotEnv(tmpDir);
                // NODOTENV should not be defined
                expect(process.env['NODOTENV']).toBe(orig);
            } finally {
                if (orig === undefined) {
                    delete process.env['NODOTENV'];
                } else {
                    process.env['NODOTENV'] = orig;
                }
                delete process.env['VALID'];
            }
        });
    });

    describe('resolveEnvFilePath()', () => {
        test('uses the default .env file when no path is provided', () => {
            expect(resolveEnvFilePath('/tmp/lord')).toBe(path.join('/tmp/lord', '.env'));
        });

        test('resolves relative env file paths against the project root', () => {
            expect(resolveEnvFilePath('/tmp/lord', 'config/game2.env'))
                .toBe(path.resolve('/tmp/lord', 'config/game2.env'));
        });

        test('keeps absolute env file paths unchanged', () => {
            const envPath = path.join('/tmp', 'game2.env');
            expect(resolveEnvFilePath('/tmp/lord', envPath)).toBe(envPath);
        });
    });

    describe('extractEnvFileArg()', () => {
        let tmpDir: string;

        beforeEach(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-argv-'));
        });

        afterEach(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('returns argv unchanged when no env file is provided', () => {
            const argv = ['node', 'door.ts', '--local', 'Barak'];
            expect(extractEnvFileArg(tmpDir, argv)).toEqual({ argv, envFilePath: undefined });
        });

        test('extracts a separate --env-file argument', () => {
            const envPath = path.join(tmpDir, 'game2.env');
            fs.writeFileSync(envPath, 'LORD_RUNTIME_DIR=runtime2\n');

            expect(extractEnvFileArg(tmpDir, ['node', 'door.ts', '--env-file', 'game2.env', '--local']))
                .toEqual({
                    argv: ['node', 'door.ts', '--local'],
                    envFilePath: envPath,
                });
        });

        test('extracts an equals-form --env-file argument', () => {
            const envPath = path.join(tmpDir, 'game3.env');
            fs.writeFileSync(envPath, 'LORD_RUNTIME_DIR=runtime3\n');

            expect(extractEnvFileArg(tmpDir, ['node', 'lordctl.ts', '--env-file=game3.env', 'state']))
                .toEqual({
                    argv: ['node', 'lordctl.ts', 'state'],
                    envFilePath: envPath,
                });
        });

        test('throws when --env-file is missing a value', () => {
            expect(() => extractEnvFileArg(tmpDir, ['node', 'door.ts', '--env-file']))
                .toThrow('--env-file requires a path');
        });

        test('throws when the requested env file does not exist', () => {
            expect(() => extractEnvFileArg(tmpDir, ['node', 'door.ts', '--env-file', 'missing.env']))
                .toThrow('Env file not found: ' + path.join(tmpDir, 'missing.env'));
        });
    });
});
