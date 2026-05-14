/**
 * NPCLord - Shared Utility Functions
 */
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import { NPCLORD_IGM_DATA_KEY } from './npclordDefs';

/** Per-NPC data stored in the igm_data table (not in the player record). */
interface NpcIgmData {
    attachedLover?: string;  // Name of NPC's attached lover
}

export class NpcUtil {
    // ─── igm_data helpers ────────────────────────────────────────────────────────

    /** Get the NPC's attached lover name from igm_data. */
    static getAttachedLover(npcRecord: number, storage: IgmDeps['storage']): string {
        const data = storage.getIgmData(NPCLORD_IGM_DATA_KEY, npcRecord) as NpcIgmData | null;
        return data?.attachedLover ?? '';
    }

    /** Set the NPC's attached lover name in igm_data. */
    static setAttachedLover(npcRecord: number, loverName: string, storage: IgmDeps['storage']): void {
        const existing = storage.getIgmData(NPCLORD_IGM_DATA_KEY, npcRecord) as NpcIgmData | null;
        storage.setIgmData(NPCLORD_IGM_DATA_KEY, npcRecord, { ...(existing ?? {}), attachedLover: loverName });
    }
    /**
     * Post a message to a random bar/darkbar conversation or the daily log.
     * Matches the original inhell2() pattern:
     * - 1/3 chance lognow (appendLog), 1/3 chance bar, 1/3 chance darkbar.
     */
    static postToBar(
        npc: LoadedPlayerRecord,
        message: string,
        storage: IgmDeps['storage'],
    ): void {
        // Three equal-chance destinations: daily log, bar conversation, or darkbar conversation.
        // Bar/darkbar use 18-line ring buffers; old messages scroll off as new ones post.
        const roll = random(3);
        if (roll === 0) {
            // Post to daily log
            storage.appendLog('today', '  `5' + npc.name + '`2 Announces:`%');
            storage.appendLog('today', '  `%' + message);
            storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');
        } else {
            const barName = roll === 1 ? 'bar' : 'darkbar';
            storage.appendConversation(barName, [
                '  `%' + npc.name + ':',
                '  `2' + message,
            ], 18);
        }
    }

    /**
     * Add a magic gem/stat-boost item (matches addamagic procedure).
     * Randomly increases one of charm, hp_max, def, str, gem.
     */
    static addAMagic(npc: LoadedPlayerRecord): void {
        switch (random(5)) {
            case 0: npc.cha = (npc.cha || 0) + 1; break;
            case 1: npc.hp_max += 1; break;
            case 2: npc.def += 1; break;
            case 3: npc.str += 1; break;
            case 4: npc.gem = (npc.gem || 0) + 1; break;
        }
    }

    /**
     * Convert NPC gems to random stats. (matches npcgain procedure)
     */
    static npcGain(npc: LoadedPlayerRecord): void {
        // Each gem converts to +1 in a random stat (hp_max/def/str, equal 1/3 chance).
        // Charm is NOT included (unlike addAMagic which does include it).
        while ((npc.gem || 0) > 0) {
            switch (1 + random(3)) {
                case 1: npc.hp_max += 1; break;
                case 2: npc.def += 1; break;
                case 3: npc.str += 1; break;
            }
            npc.gem = (npc.gem || 0) - 1;
        }
    }

    /**
     * Sanitize personality stats to their valid ranges. (matches original maintenance begin)
     * new_stat1 (1-5), new_stat2 (1-5), new_stat3 (5-10)
     *
     * These are the 3 reserved IGM fields in the original LORD player record.
     * When a stat is out-of-range (including undefined/null/0 = never initialized),
     * assign a random value within the valid range so NPCs have varied activity
     * levels when everyday=false.
     */
    static sanitizePersonalityStats(npc: LoadedPlayerRecord): void {
        if (!npc.new_stat1 || npc.new_stat1 < 1 || npc.new_stat1 > 5) npc.new_stat1 = random(5) + 1;
        if (!npc.new_stat2 || npc.new_stat2 < 1 || npc.new_stat2 > 5) npc.new_stat2 = random(5) + 1;
        if (!npc.new_stat3 || npc.new_stat3 < 5 || npc.new_stat3 > 10) npc.new_stat3 = random(6) + 5;
    }
}
