/**
 * PvpLootPolicy - PvP combat loot calculation for LORD.
 *
 * Determines how much gold and how many gems transfer from a defeated player
 * to the attacker. Gold is capped relative to the average forest-fight gold
 * for the attacker's level, scaled by the configurable loot cap factor.
 */
import type { MonsterStats, Settings } from './types';

export class PvpLootPolicy {
    static averageForestFightGoldForLevel(
        attackerLevel: number,
        monsterStats: readonly MonsterStats[][],
        settings: Pick<Settings, 'forest_allow_level_one_monsters_above_level_one'>,
    ): number {
        const goldValues = this.collectEligibleForestGold(attackerLevel, monsterStats, settings);

        if (goldValues.length < 1) {
            return 0;
        }

        return goldValues.reduce((sum, gold) => sum + gold, 0) / goldValues.length;
    }

    static resolveGoldReward(
        victimGold: number,
        attackerLevel: number,
        monsterStats: readonly MonsterStats[][],
        settings: Pick<Settings, 'forest_allow_level_one_monsters_above_level_one' | 'pvp_gold_loot_cap_factor'>,
    ): number {
        const victimGoldOnHand = Math.max(0, Math.trunc(victimGold));
        const factor = settings.pvp_gold_loot_cap_factor;

        if (typeof factor !== 'number' || factor <= 0) {
            return victimGoldOnHand;
        }

        const averageGold = this.averageForestFightGoldForLevel(attackerLevel, monsterStats, settings);
        const cap = Math.floor(averageGold * factor);

        return Math.min(victimGoldOnHand, Math.max(0, cap));
    }

    static resolveVictimGemLoss(victimGems: number): number {
        const victimGemCount = Math.max(0, Math.trunc(victimGems));

        // Victim loses half their gems (floor); below 2 means nothing to take
        if (victimGemCount < 2) {
            return 0;
        }

        return Math.floor(victimGemCount / 2);
    }

    static resolveGemReward(
        victimGems: number,
        settings: Pick<Settings, 'pvp_gem_loot_cap'>,
    ): number {
        const baseReward = this.resolveVictimGemLoss(victimGems);
        const cap = settings.pvp_gem_loot_cap;

        if (typeof cap !== 'number' || cap <= 0) {
            return baseReward;
        }

        return Math.min(baseReward, Math.max(0, Math.trunc(cap)));
    }

    private static collectEligibleForestGold(
        attackerLevel: number,
        monsterStats: readonly MonsterStats[][],
        settings: Pick<Settings, 'forest_allow_level_one_monsters_above_level_one'>,
    ): number[] {
        const normalizedLevel = Math.max(1, Math.trunc(attackerLevel));
        // Skip level-1 monster bucket when setting excludes them from higher-level encounters
        const minBucket = normalizedLevel > 1 && settings.forest_allow_level_one_monsters_above_level_one === false ? 1 : 0;
        const goldValues: number[] = [];

        for (let bucket = minBucket; bucket < normalizedLevel; bucket += 1) {
            // Forest encounter buckets are 11 slots wide, but only the first 10
            // are used by the regular random-fight pool.
            for (let offset = 0; offset < 10; offset += 1) {
                const monsterIndex = bucket * 11 + offset;
                const monster = monsterStats[monsterIndex] as unknown as MonsterStats | undefined;

                if (monster && typeof monster.gold === 'number') {
                    goldValues.push(monster.gold);
                }
            }
        }

        return goldValues;
    }
}