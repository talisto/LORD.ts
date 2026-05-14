/**
 * NPCLord - Combat Module
 * Monster fights, PvP slaughter, and dragon fight.
 */
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import type { NpcConfig, MonsterData, NpcRunState, NpcPhrases } from './npclordDefs';
import { DRAGON_HP, DRAGON_STR, LEVEL_EXP, LEVEL_HP_GAIN, LEVEL_STR_GAIN, LEVEL_DEF_GAIN, LEVEL_MASTER } from './npclordDefs';
import { NpcUtil } from './npclordUtil';

export class NpcCombat {
    // ─── Monster Combat ──────────────────────────────────────────────────────────

    /**
     * NPC fights monsters to earn exp and gold. (matches npcfight procedure)
     * original: for n := 1 to fightsperday do ... case random(25) of ...
     */
    static npcFight(
        npc: LoadedPlayerRecord,
        state: NpcRunState,
        monsters: MonsterData[],
    ): void {
        for (let n = 0; n < state.fightsPerDay; n++) {
            npc.hp = npc.hp_max;
            if (!state.alive) return;

            const roll = random(25);
            // Roll table from the original maintenance utility:
            // 0-4,9,11-24 fight monsters; 5 gem; 6 magic; 7 gold;
            // 8 grants an extra fight; 10 grants charm.
            if (roll >= 0 && roll <= 4) {
                NpcCombat.attackMonster(npc, state, monsters);
            } else if (roll === 5) {
                npc.gem = (npc.gem || 0) + 1;
            } else if (roll === 6) {
                NpcUtil.addAMagic(npc);
            } else if (roll === 7) {
                npc.gold += npc.level * npc.level * 300;
            } else if (roll === 8) {
                state.fightsPerDay++;
            } else if (roll === 9) {
                NpcCombat.attackMonster(npc, state, monsters);
            } else if (roll === 10) {
                npc.cha = (npc.cha || 0) + 1;
            } else {
                // 11..24 → attack
                NpcCombat.attackMonster(npc, state, monsters);
            }
        }
    }

    /**
     * NPC fights a monster from the monsters array, matching npcmaint's attack() procedure.
     * Monster is selected based on NPC level, then combat plays out.
     */
    private static attackMonster(npc: LoadedPlayerRecord, state: NpcRunState, monsters: MonsterData[]): void {
        if (monsters.length === 0) return;

        // Select monster from the NPC's level bucket. The original data is laid
        // out in 11-monster groups per level, so clamp to avoid running past the
        // final partial bucket.
        const base = Math.max(0, (npc.level - 1) * 11);
        const idx = Math.min(base + random(9), monsters.length - 1);
        const monster = monsters[idx];

        npc.hp = npc.hp_max;
        let monHp = monster.hp;
        let npcAlive = true;
        let monAlive = true;

        while (npcAlive && monAlive) {
            // Stock damage formula: base STR minus one fifth, plus one, plus a
            // level-scaled random roll. A power move doubles the whole result.
            const powermove = random(20) === 6;
            const npcAtk = powermove
                ? 2 * (npc.str - Math.floor(npc.str / 5) + 1 + random(npc.level || 1))
                : npc.str - Math.floor(npc.str / 5) + 1 + random(npc.level || 1);
            monHp -= npcAtk;
            if (monHp < 1) { monAlive = false; break; }

            // Monster attack on NPC
            const mpow = random(20) === 6;
            const monAtk = mpow
                ? 2 * (monster.str - Math.floor(monster.str / 5) + 1 + random(npc.level || 1)) - npc.def
                : monster.str - Math.floor(monster.str / 5) + 1 + random(npc.level || 1) - npc.def;
            npc.hp -= monAtk;
            if (npc.hp < 1) { npcAlive = false; }
        }

        if (!monAlive) {
            npc.exp += monster.exp;
            npc.gold += monster.gold;
        } else {
            npc.exp = Math.max(10, npc.exp - Math.floor(npc.exp / 10));
            npc.gold = 0;
            npc.dead = true;
            state.alive = false;
        }
    }

    // ─── Dragon Fight ────────────────────────────────────────────────────────────

    /**
     * NPC fights the Red Dragon at level 12. (matches WinGame procedure)
     * Dragon: HP=11250, STR=1000. Win → log + bar post + reset to level 1.
     * Lose → NPC dies.
     */
    static npcWinGame(
        npc: LoadedPlayerRecord,
        state: NpcRunState,
        playerCount: number,
        dragonlog: boolean,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        if (npc.level !== 12) return;

        let dh = DRAGON_HP;
        npc.hp = npc.hp_max;

        // Combat loop
        while (npc.hp >= 1 && dh >= 1) {
            // NPC attacks dragon
            const pm1 = (1 + random(20)) === 7;
            const npcDmg = pm1
                ? 2 * (npc.str - Math.floor(npc.str / 5) + 1 + random(playerCount || 1))
                : npc.str - Math.floor(npc.str / 5) + 1 + random(playerCount || 1);
            dh -= npcDmg;

            if (dh < 1) break;

            // Dragon attacks NPC
            const pm2 = (1 + random(20)) === 7;
            const dragonDmg = pm2
                ? 2 * (DRAGON_STR - Math.floor(DRAGON_STR / 5) + 1 + random(playerCount || 1)) - npc.def
                : DRAGON_STR - Math.floor(DRAGON_STR / 5) + 1 + random(playerCount || 1) - npc.def;
            npc.hp -= dragonDmg;
        }

        if (dh < 1) {
            // NPC slew the dragon!
            if (dragonlog) {
                storage.appendLog('today',
                    '`.  `%' + npc.name + ' `2has slain the `4Red Dragon`2 and become a hero.',
                );
                storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');
            }

            // Dragon winners reset to a fresh level-1 hero, matching the stock
            // NPCLord loop where a dragon kill starts the climb over again.
            npc.str = 10;
            npc.def = 10;
            npc.hp_max = 10;
            npc.hp = 10;
            npc.level = 1;
            npc.arm_num = 1;
            npc.weapon_num = 1;
            npc.weapon = 'Stick';
            npc.arm = 'Coat';

            // Post dragon-slay announcement to bar
            if (phrases.dragonSlay.length > 0) {
                const msg = phrases.dragonSlay[random(phrases.dragonSlay.length)];
                NpcUtil.postToBar(npc, msg, storage);
            }
        } else {
            // NPC lost to dragon
            npc.exp = Math.max(10, npc.exp - Math.floor(npc.exp / 10));
            npc.gold = 0;
            npc.dead = true;
            state.alive = false;
        }
    }

    // ─── PvP Slaughter ───────────────────────────────────────────────────────────

    /**
     * NPC PvP slaughter - NPC attacks similarly-leveled human players. (matches npcslaughter)
     *
     * Original inhell() behavior: 50% chance to post wintext/losetext to bar,
     * 50% chance to send winmail/losemail as mail to the other player.
     */
    static npcSlaughter(
        npc: LoadedPlayerRecord,
        state: NpcRunState,
        allPlayers: LoadedPlayerRecord[],
        _cfg: NpcConfig,
        slaughterlog: boolean,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        let { levelFight, playFights } = state;
        const stat1 = NpcCombat.sanitizeStat1(npc);

        // Original: IF RANDOM(new_stat1) > 1 then inc(levelfight,random(new_stat1))
        if (random(stat1) > 1) levelFight += random(stat1);

        // Build eligible targets: not NPC, not dead, level within range, has a name
        const eligible = allPlayers.filter(p =>
            !p.is_npc &&
            p.name &&
            p.name !== 'X' &&
            p.name !== '' &&
            !p.dead &&
            p.level + levelFight >= npc.level &&
            p.level - levelFight <= npc.level,
        );
        if (eligible.length === 0) return;

        // Original: IF RANDOM(new_stat1) > 1 then inc(playfights,random(new_stat1))
        if (random(stat1) > 1) playFights += random(stat1);

        const fights = Math.min(playFights, eligible.length);

        for (let f = 0; f < fights; f++) {
            if (!state.alive) return;
            if (random(2) !== 1) continue; // 50% chance of engaging

            const target = eligible[random(eligible.length)];
            if (target.dead || target.name === npc.name) continue;

            // If target is at the inn, NPC must pay to attack (level*2400)
            if (target.inn) {
                npc.gold += npc.bank;
                npc.bank = 0;
                const cost = npc.level * 2400;
                if (npc.gold < cost) continue;
                npc.gold -= cost;
            }

            // Combat simulation
            let npcHp = npc.hp_max;
            let tgtHp = target.hp_max;
            npc.hp = npc.hp_max;
            let lastPower = 0;

            while (npcHp > 0 && tgtHp > 0) {
                // NPC attacks target
                const pm1 = (1 + random(20 - stat1)) === 7;
                const npcDmg = pm1
                    ? 2 * (npc.str - Math.floor(npc.str / 5) + 1 + random(allPlayers.length || 1))
                    : npc.str - Math.floor(npc.str / 5) + 1 + random(allPlayers.length || 1);
                const actualDmg = Math.max(1, npcDmg - target.def);
                tgtHp -= actualDmg;
                if (pm1) lastPower = actualDmg;

                if (tgtHp < 1) break;

                // Target attacks NPC
                const pm2 = (1 + random(20 - stat1)) === 7;
                const tgtDmg = pm2
                    ? 2 * (target.str - Math.floor(target.str / 5) + 1 + random(allPlayers.length || 1))
                    : target.str - Math.floor(target.str / 5) + 1 + random(allPlayers.length || 1);
                npcHp -= Math.max(1, tgtDmg - npc.def);
            }

            if (tgtHp < 1) {
                NpcCombat._handlePvpWin(npc, target, lastPower, slaughterlog, phrases, storage);
            } else if (npcHp < 1) {
                NpcCombat._handlePvpLoss(npc, target, state, slaughterlog, phrases, storage);
                return; // NPC is dead - stop slaughtering
            }
        }
    }

    // ─── Level Advancement ───────────────────────────────────────────────────────

    /**
     * Advance NPC level if eligible. (matches npcadvance procedure)
     */
    static npcAdvance(
        npc: LoadedPlayerRecord,
        masterlog: boolean,
        log: IgmDeps['log'],
    ): void {
        if (npc.level >= 12) return;
        const needed = LEVEL_EXP[npc.level];
        if (npc.exp - 1 < needed) return;

        npc.level++;
        npc.hp_max += LEVEL_HP_GAIN[npc.level] || 0;
        npc.str += LEVEL_STR_GAIN[npc.level] || 0;
        npc.def += LEVEL_DEF_GAIN[npc.level] || 0;
        NpcUtil.addAMagic(npc);

        if (masterlog) {
            const master = LEVEL_MASTER[npc.level] || 'Turgon';
            void log.logLine('`0' + npc.name + ' `2has beaten `%' + master + '`2!');
        }
    }

    // ─── PvP Result Handlers ────────────────────────────────────────────────────

    private static _handlePvpWin(
        npc: LoadedPlayerRecord,
        target: LoadedPlayerRecord,
        lastPower: number,
        slaughterlog: boolean,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        // NPC won, player lost
        npc.pvp = (npc.pvp || 0) + 1;
        npc.exp += Math.floor(target.exp / 10);
        if (target.gold > 0) npc.gold += target.gold;

        target.dead = true;
        target.inn = true;
        target.exp = Math.max(10, target.exp - Math.floor(target.exp / 10));
        target.gold = 0;
        target.put();

        // Send detailed battle mail to victim
        let mailBody =
            '\n' +
            '  `%YOU HAVE BEEN ATTACKED!\n' +
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
            '  `0' + npc.name + '`2 has attacked you!\n';
        if (lastPower > 0) {
            mailBody += '  `0' + npc.name + ' `2did a power move for `4' + lastPower + ' `2damage!\n';
        }
        mailBody +=
            '`.  `0' + npc.name + ' `2has killed you!\n' +
            '\n';
        storage.sendMail(target.Record, mailBody);

        // Log the kill
        if (slaughterlog) {
            storage.appendLog('today',
                '`.  `0' + npc.name + ' `2has killed `5' + target.name + ' `2in a vicious battle!',
            );
            storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');
        }

        // inhell: 50% bar post with wintext, 50% mail with winmail
        NpcCombat.inhell(npc, target, phrases.pvpNpcWins, phrases.pvpNpcWins, storage);

        npc.hp = npc.hp_max;
    }

    private static _handlePvpLoss(
        npc: LoadedPlayerRecord,
        target: LoadedPlayerRecord,
        state: NpcRunState,
        slaughterlog: boolean,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        // NPC lost, player won
        target.pvp = (target.pvp || 0) + 1;
        target.exp += Math.floor(npc.exp / 10);
        target.gold += npc.gold;
        target.put();

        npc.exp = Math.max(10, npc.exp - Math.floor(npc.exp / 10));
        npc.gold = 0;
        npc.dead = true;
        state.alive = false;

        // Send detailed battle mail to the victorious player
        const expGain = Math.floor(npc.exp / 10);
        storage.sendMail(target.Record,
            '\n' +
            '  `%YOU HAVE BEEN ATTACKED!\n' +
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
            '  `0' + npc.name + '`2 has attacked you!\n' +
            '`.  `2You have killed `0' + npc.name + ' in self defense!\n' +
            '`.  `2You receive `%' + expGain + '`2 experience!\n' +
            '\n',
        );

        // Log the self-defense kill
        if (slaughterlog) {
            storage.appendLog('today',
                '`.  `0' + target.name + ' `2has killed `5' + npc.name + ' `2in self defense!',
            );
            storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');
        }

        // inhell: 50% bar post with losetext, 50% mail with losemail
        NpcCombat.inhell(npc, target, phrases.pvpNpcLoses, phrases.pvpNpcLoses, storage);
    }

    // ─── inhell helper ───────────────────────────────────────────────────────────

    /**
     * Matching original inhell(): 50% chance to post a phrase to a bar conversation,
     * 50% chance to send a phrase as mail to the target player.
     * Both use random selection from the phrase array and replace %N with NPC/target name.
     */
    private static inhell(
        npc: LoadedPlayerRecord,
        target: LoadedPlayerRecord,
        barPhrases: string[],
        mailPhrases: string[],
        storage: IgmDeps['storage'],
    ): void {
        if (barPhrases.length === 0 && mailPhrases.length === 0) return;

        if (random(2) === 0) {
            // Bar post
            if (barPhrases.length > 0) {
                let phrase = barPhrases[random(barPhrases.length)];
                phrase = phrase.replace(/%N/g, npc.name);
                NpcUtil.postToBar(npc, phrase, storage);
            }
        } else {
            // Send mail to target
            if (mailPhrases.length > 0) {
                let phrase = mailPhrases[random(mailPhrases.length)];
                phrase = phrase.replace(/%N/g, npc.name);
                const npcRecStr = String(npc.Record).padStart(3, '0');
                storage.sendMail(target.Record,
                    '\n' +
                    '  `0' + npc.name + '`2 sent you this...\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '`%  ' + phrase + '\n' +
                    '`%\n' +
                    '`-' + npcRecStr,
                );
            }
        }
    }

    // ─── Stat Helpers ────────────────────────────────────────────────────────────

    private static sanitizeStat1(npc: LoadedPlayerRecord): number {
        let v = npc.new_stat1 || 1;
        if (v < 1 || v > 5) v = 1;
        return v;
    }
}
