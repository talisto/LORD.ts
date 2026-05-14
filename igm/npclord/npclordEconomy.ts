/**
 * NPCLord - Economy Module
 * Equipment buying, banking, stat gains.
 */
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { LoadedPlayerRecord } from '@lordts/core/types';

export class NpcEconomy {
    // ─── Equipment Buying ────────────────────────────────────────────────────────

    /**
     * NPC buys better weapons and armor. (matches npcbuyequip procedure)
     * NPC consolidates bank gold into hand, then purchases next tier if affordable.
     */
    static npcBuyEquip(npc: LoadedPlayerRecord, equipment: IgmDeps['equipment']): void {
        if ((npc.weapon_num || 0) >= 15) return;

        // Consolidate bank into hand
        npc.gold += npc.bank;
        npc.bank = 0;

        const wn = npc.weapon_num || 0;
        const an = npc.arm_num || 0;

        // Buy armor first when armor tier <= weapon tier (keeps equipment balanced).
        // Sells current at 50%, buys next tier. Returns: only one purchase per day.
        if (an <= wn && an < 15) {
            const nextArmour = equipment.getArmour(an + 1);
            const sellback = an > 0 ? Math.floor(equipment.getArmour(an).price / 2) : 0;
            if (npc.gold + sellback >= nextArmour.price) {
                npc.arm_num = an + 1;
                npc.gold += sellback;
                npc.gold -= nextArmour.price;
                npc.def += nextArmour.num;
                npc.arm = nextArmour.name;
            }
            return;
        }

        // Buy weapon (uses weapons.json via Equipment)
        if (wn < 15) {
            const nextWeapon = equipment.getWeapon(wn + 1);
            if (npc.gold < nextWeapon.price) return;
            const sellback = wn > 0 ? Math.floor(equipment.getWeapon(wn).price / 2) : 0;
            npc.weapon_num = wn + 1;
            npc.gold += sellback;
            npc.gold -= nextWeapon.price;
            npc.str += nextWeapon.num;
            npc.weapon = nextWeapon.name;
        }
    }

    // ─── Banking ─────────────────────────────────────────────────────────────────

    /**
     * NPC deposits gold and stays at the inn if wealthy enough. (matches npcother procedure)
     * Original: all gold → bank. If bank > level*400, stay at inn and deduct level*400.
     */
    static npcBanking(npc: LoadedPlayerRecord): void {
        npc.bank += npc.gold;
        npc.gold = 0;

        // Inn costs level*400 from bank; staying protects NPC from PvP attacks that day
        if (npc.bank > npc.level * 400) {
            npc.inn = true;
            npc.bank -= npc.level * 400;
        }
    }
}
