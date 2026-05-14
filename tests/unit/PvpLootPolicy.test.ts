import type { MonsterStats } from '@lordts/core/types';
import { PvpLootPolicy } from '@lordts/core/PvpLootPolicy';

function buildMonsterStats(): MonsterStats[][] {
    const monsterStats: MonsterStats[] = [];

    for (let bucket = 0; bucket < 3; bucket += 1) {
        for (let offset = 0; offset < 10; offset += 1) {
            monsterStats[bucket * 11 + offset] = {
                name: 'Monster ' + bucket + '-' + offset,
                str: 1,
                def: 0,
                weapon: 'Claw',
                death: 'dies',
                gold: (bucket + 1) * 100,
                exp: 1,
            };
        }
    }

    return monsterStats as unknown as MonsterStats[][];
}

describe('PvpLootPolicy', () => {
    test('averages gold across all eligible forest buckets for the attacker level', () => {
        const average = PvpLootPolicy.averageForestFightGoldForLevel(3, buildMonsterStats(), {
            forest_allow_level_one_monsters_above_level_one: true,
        });

        expect(average).toBe(200);
    });

    test('skips level-one forest monsters when that pool is disabled above level one', () => {
        const average = PvpLootPolicy.averageForestFightGoldForLevel(3, buildMonsterStats(), {
            forest_allow_level_one_monsters_above_level_one: false,
        });

        expect(average).toBe(250);
    });

    test('caps PvP gold rewards when the factor is enabled', () => {
        const reward = PvpLootPolicy.resolveGoldReward(1000, 3, buildMonsterStats(), {
            forest_allow_level_one_monsters_above_level_one: true,
            pvp_gold_loot_cap_factor: 1.25,
        });

        expect(reward).toBe(250);
    });

    test('keeps the full PvP gold reward when the factor is disabled', () => {
        const reward = PvpLootPolicy.resolveGoldReward(1000, 3, buildMonsterStats(), {
            forest_allow_level_one_monsters_above_level_one: true,
            pvp_gold_loot_cap_factor: 0,
        });

        expect(reward).toBe(1000);
    });

    test('uses the stock half-gem victim loss rule', () => {
        expect(PvpLootPolicy.resolveVictimGemLoss(1)).toBe(0);
        expect(PvpLootPolicy.resolveVictimGemLoss(5)).toBe(2);
    });

    test('caps PvP gem rewards when the cap is enabled', () => {
        const reward = PvpLootPolicy.resolveGemReward(10, {
            pvp_gem_loot_cap: 3,
        });

        expect(reward).toBe(3);
    });

    test('keeps the stock half-gem reward when the cap is disabled', () => {
        const reward = PvpLootPolicy.resolveGemReward(10, {
            pvp_gem_loot_cap: 0,
        });

        expect(reward).toBe(5);
    });
});