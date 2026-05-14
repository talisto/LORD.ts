/**
 * Equipment - Weapons, armour, and trainer data accessor for LORD.
 *
 * Provides bounded access to pre-loaded stats arrays.
 * File loading (including runtime directory override support) is handled
 * by JsonLoader in GameContext - Equipment does not touch the filesystem.
 */

import type { ArmourStats, WeaponStats, TrainerStats } from './types';

class Equipment {
    constructor(
        private trainerStats: TrainerStats[],
        private armourStats: ArmourStats[],
        private weaponStats: WeaponStats[],
    ) {}

    /** Number of trainer entries - useful for bounded iteration by callers. */
    get trainerCount(): number {
        return this.trainerStats.length;
    }

    // Trainers are 1-indexed in game data; clamp to valid range
    getTrainer(num: number): TrainerStats {
        const idx = num - 1;
        if (idx < 0) {
            return this.trainerStats[0];
        }
        if (idx >= this.trainerStats.length) {
            return this.trainerStats[this.trainerStats.length - 1];
        }
        return this.trainerStats[idx];
    }

    // LORD v4.08 supports exactly 15 armour tiers (index 1-15);
    // array[0] is the "no armour" fallback
    getArmour(num: number): ArmourStats {
        if (num < 1) {
            return this.armourStats[0];
        }
        if (num > 15) {
            num = 15;
        }
        return this.armourStats[num];
    }

    // LORD v4.08 supports exactly 15 weapon tiers (index 1-15);
    // array[0] is the "no weapon" fallback
    getWeapon(num: number): WeaponStats {
        if (num < 1) {
            return this.weaponStats[0];
        }
        if (num > 15) {
            num = 15;
        }
        return this.weaponStats[num];
    }
}

export default Equipment;
