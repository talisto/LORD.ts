/**
 * NPCLord - Daily NPC Maintenance Utility for LORD
 * Ported from NPCMaint by Joseph Masters (Sons of Salami Software Group, 1995)
 *
 * On each daily maintenance run, iterates through all NPC players (is_npc=true)
 * and performs: romance, AI mail, attached lovers, romance proposals,
 * stat gains, violet marriage, combat, dragon fight, equipment upgrades,
 * bar chat, flirting, level advancement, PvP slaughter, and banking.
 */
import * as path from 'path';
import * as fs from 'fs';
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { IgmCommand } from '@lordts/igm/IgmCommand';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import {
    NPCLORD_CONFIG_KEY, NPCLORD_CONFIG_DEFAULTS,
} from './npclordDefs';
import type { NpcConfig, NpcPhrases, NpcRunState, AttachedConfig, MonsterData } from './npclordDefs';
import type { AiReplyConfig } from './npclordDefs';
import { NpcUtil } from './npclordUtil';
import { NpcCombat } from './npclordCombat';
import { NpcSocial } from './npclordSocial';
import { NpcEconomy } from './npclordEconomy';
import { NPC_COMMANDS } from './npclordCommands';

// ─── Main Class ──────────────────────────────────────────────────────────────

class NpcLord {
    static get desc(): string { return '`2NPC Lord'; }
    static readonly maintenanceOnly = true;
    static readonly commandGroup = 'npc';
    static readonly commands: IgmCommand[] = NPC_COMMANDS;

    static runMaint(deps: IgmDeps): void {
        const { storage, player, log, equipment, state } = deps;

        const utilDataDir = deps.srcDir;

        // Load config: JSON file on disk, merged with DB overrides
        const cfg = NpcLord.loadConfig(utilDataDir, storage);

        // Load all phrase/data files
        const phrases = NpcLord.loadPhrases(utilDataDir);
        const attachedCfg = NpcLord.loadAttachedConfig(utilDataDir);

        const monstersPath = path.join(deps.dataDir, 'monsters.json');
        const monsters: MonsterData[] = fs.existsSync(monstersPath)
            ? JSON.parse(fs.readFileSync(monstersPath, 'utf8')) as MonsterData[]
            : [];

        const logFlags = {
            monlog:      cfg.logMonster,
            laidlog:     cfg.logLaid,
            slaughterlog:cfg.logSlaughter,
            dragonlog:   cfg.logDragon,
            masterlog:   cfg.logMaster,
        };

        // Get all players
        const allPlayers = player.allPlayers();
        const npcPlayers = allPlayers.filter(p => p.is_npc && p.name && p.name !== 'X');

        if (npcPlayers.length === 0) return;

        // Check if Violet is married
        const violetMarried = state.married_to_violet !== undefined && state.married_to_violet >= 0;

        for (const npc of npcPlayers) {
            // Initialize NPC state for this day
            const runState: NpcRunState = {
                alive: true,
                fightsPerDay: cfg.fightsPerDay,
                playFights: cfg.playFights,
                levelFight: cfg.levelFight,
            };

            // Sanitize NPC stats
            if (npc.gold < 0) npc.gold = 0;
            if (npc.bank < 0) npc.bank = 0;
            if (npc.exp < 0) npc.exp = 10;

            // Sanitize personality stats (new_stat1/new_stat2/new_stat3)
            NpcUtil.sanitizePersonalityStats(npc);

            // Reset dead flag and restore HP
            npc.dead = false;
            npc.hp = npc.hp_max;

            // Apply probabilistic skip (unless everyday=true)
            // Personality stats sum: new_stat1(1-5) + new_stat2(1-5) + new_stat3(5-10) = 7..20
            // Higher stats → more active NPC (more likely to play on any given day)
            //   Min stats (7):  random(20) >= 7 → 65% skip, 35% play
            //   Mid stats (14): random(20) >= 14 → 30% skip, 70% play
            //   Max stats (20): random(20) >= 20 → 0% skip, 100% play
            if (!cfg.everyday) {
                const statsSum = npc.new_stat1 + npc.new_stat2 + npc.new_stat3;
                if (random(20) >= statsSum) {
                    npc.put();
                    continue;
                }
            }

            // NPC comes out of the inn
            npc.inn = false;

            // Kids: female NPCs with a spouse may send "unfit mother" mail
            if (cfg.havekids) {
                NpcSocial.npcKids(npc, allPlayers, storage);
            }

            // ═══ MAIN LOOP ORDER (matches original maintenance procedure) ═══

            // 1. NPC reads and responds to incoming mail (romantic proposals, AI replies)
            NpcSocial.npcRomance(npc, allPlayers, phrases, storage);

            // 2. AI mail - send a random phrase to a random player
            NpcSocial.npcAiMail(npc, allPlayers, phrases, storage);

            // 3. Attached lover interactions (affection, gold transfer, betrayal check)
            NpcSocial.npcAttached(npc, allPlayers, attachedCfg, storage);

            // 4. NPC sends romantic proposals to opposite-sex players
            NpcSocial.npcRomance2(npc, allPlayers, storage);

            // 5. Convert gems to stats
            NpcUtil.npcGain(npc);

            // 6. Violet marriage attempt (males only)
            NpcSocial.npcMarry(npc, state, cfg.marryViolet, phrases, storage);

            // 7. NPC fights monsters (earn exp/gold)
            NpcCombat.npcFight(npc, runState, monsters);

            if (!runState.alive) {
                NpcLord.cleanupNpc(npc);
                continue;
            }

            // 8. Dragon fight (level 12 only)
            NpcCombat.npcWinGame(npc, runState, allPlayers.length, logFlags.dragonlog, phrases, storage);

            if (!runState.alive) {
                NpcLord.cleanupNpc(npc);
                continue;
            }

            // 9. Convert gems to stats again: gems earned from monster kills (step 7)
            // and the dragon fight (step 8) are converted here; pre-existing gems
            // were already converted in step 5. The dual call matches the original.
            NpcUtil.npcGain(npc);

            // 10. Buy equipment if affordable
            NpcEconomy.npcBuyEquip(npc, equipment);

            // 11. NPC talk - post a chat message in the bar
            NpcSocial.npcTalk(npc, allPlayers, phrases, storage);

            // 12. NPC flirt
            NpcSocial.npcFlirt(npc, logFlags.laidlog, violetMarried, storage);

            // 13. Level advancement (leveljump times)
            for (let j = 0; j < cfg.leveljump; j++) {
                NpcCombat.npcAdvance(npc, logFlags.masterlog, log);
            }

            // 14. NPC slaughter - PvP combat against matching-level players
            NpcCombat.npcSlaughter(npc, runState, allPlayers, cfg, logFlags.slaughterlog, phrases, storage);

            // 15. Banking - deposit gold, stay at inn if wealthy
            NpcEconomy.npcBanking(npc);

            // Final cleanup
            NpcLord.cleanupNpc(npc);
        }
    }

    // ─── Data Loaders ────────────────────────────────────────────────────────

    private static readFileLines(filepath: string): string[] {
        if (!fs.existsSync(filepath)) return [];
        return fs.readFileSync(filepath, 'utf8').split(/\r?\n/).filter(l => l !== '');
    }

    private static readJsonFile<T>(filepath: string): T | null {
        if (!fs.existsSync(filepath)) return null;
        return JSON.parse(fs.readFileSync(filepath, 'utf8')) as T;
    }

    private static loadConfig(dataDir: string, storage: IgmDeps['storage']): NpcConfig {
        // 3-tier merge (lowest → highest priority):
        // 1. NPCLORD_CONFIG_DEFAULTS (built-in code defaults)
        // 2. npclord.json (read-only on-disk defaults shipped with the game)
        // 3. DB config (sysop overrides set via the admin web panel - highest priority)
        const fileCfg = NpcLord.readJsonFile<Partial<NpcConfig>>(path.join(dataDir, 'npclord.json'));
        const dbCfg = storage.getConfig(NPCLORD_CONFIG_KEY) as Partial<NpcConfig> | null;
        return { ...NPCLORD_CONFIG_DEFAULTS, ...(fileCfg ?? {}), ...(dbCfg ?? {}) };
    }

    private static loadPhrases(dataDir: string): NpcPhrases {
        const aiReplyData = NpcLord.readJsonFile<AiReplyConfig>(path.join(dataDir, 'AIREPLY.JSON'));
        return {
            barChat: NpcLord.readFileLines(path.join(dataDir, 'PHRASES.TXT')),
            aiMail: NpcLord.readFileLines(path.join(dataDir, 'AIMAIL.TXT')),
            pvpNpcWins: NpcLord.readFileLines(path.join(dataDir, 'PVP_NPC_WINS.TXT')),
            pvpNpcLoses: NpcLord.readFileLines(path.join(dataDir, 'PVP_NPC_LOSES.TXT')),
            dragonSlay: NpcLord.readFileLines(path.join(dataDir, 'DRAGON_SLAY.TXT')),
            marriage: NpcLord.readFileLines(path.join(dataDir, 'MARRIAGE.TXT')),
            aiReplyPairs: aiReplyData?.pairs ?? [],
            aiReplyDefault: aiReplyData?.defaultReply ?? '',
        };
    }

    private static loadAttachedConfig(dataDir: string): AttachedConfig {
        const data = NpcLord.readJsonFile<AttachedConfig>(path.join(dataDir, 'ATTACHED.JSON'));
        return data ?? { killed: 'NEVER', transfer: '', affection: '' };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static cleanupNpc(npc: LoadedPlayerRecord): void {
        if (npc.gold < 0) npc.gold = 0;
        if (npc.bank < 0) npc.bank = 0;
        if (npc.exp < 0) npc.exp = 10;
        npc.last_on_unix = Math.floor(Date.now() / 1000);
        npc.put();
    }
}

export { NpcLord };
export default NpcLord;
