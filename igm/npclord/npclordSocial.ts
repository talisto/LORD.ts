/**
 * NPCLord - Social Module
 * Romance, marriage, flirt, AI mail, bar chat, and mail processing.
 */
import { random } from '@lordts/util/Util';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type { LoadedPlayerRecord } from '@lordts/core/types';
import type State from '@lordts/core/State';
import type { NpcPhrases, AttachedConfig } from './npclordDefs';
import { NpcUtil } from './npclordUtil';

export class NpcSocial {
    // ─── Romance: NPC reads and responds to incoming mail ────────────────────────

    /**
     * NPC reads their mailbox and responds to romantic proposals and generic mail.
     * Matches npcromance procedure - processes mail codes `U/`Y/`T/`I for romantic
     * actions, `b for bank deposits, `E for experience, and replies to player
     * mail using keyword matching from AIREPLY.CFG.
     */
    static npcRomance(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        // Read NPC's mail
        const mailLines = storage.getMail(npc.Record);
        if (mailLines.length === 0) return;

        const remainingLines: string[] = [];
        let i = 0;

        while (i < mailLines.length) {
            const line = mailLines[i];

            // Check for bank codes (`b followed by digits)
            if (/^`b\d+/.test(line.trim())) {
                const amount = parseInt(line.trim().substring(2), 10);
                if (!isNaN(amount)) npc.bank += amount;
                i++;
                continue;
            }

            // Check for experience codes (`E followed by digits)
            if (/^`E\d+/.test(line.trim())) {
                const amount = parseInt(line.trim().substring(2), 10);
                if (!isNaN(amount)) npc.exp += amount;
                i++;
                continue;
            }

            // Check for romantic proposal codes (`U, `Y, `T, `I followed by sender record)
            const romanticMatch = /^`([UYTI])(\d+)/.exec(line.trim());
            if (romanticMatch) {
                const senderRecord = parseInt(romanticMatch[2], 10);
                NpcSocial._handleRomanticCode(npc, romanticMatch[1], senderRecord, allPlayers, storage);
                i++;
                continue;
            }

            // Check for "sent you this..." mail from players (AI reply system)
            if (line.includes(' sent you this...')) {
                i = NpcSocial._processIncomingPlayerMail(npc, mailLines, i, phrases, storage);
                continue;
            }

            // Other mail codes we should skip (increment lays, etc.)
            if (/^`[{}``,;:+MKDSG]/.test(line.trim())) {
                i++;
                continue;
            }

            // Keep unrecognized lines for now
            remainingLines.push(line);
            i++;
        }

        // Clear all mail - it's been processed
        storage.deleteMail(npc.Record);
    }

    // ─── Romance Response Actions ────────────────────────────────────────────────

    private static romanceDinner(npc: LoadedPlayerRecord, targetRecord: number, storage: IgmDeps['storage']): void {
        const pronoun = npc.sex === 'F' ? 'She' : 'He';
        storage.sendMail(targetRecord,
            '`%  ** Romantic Mail Return From ' + npc.name + ' **\n' +
            '`2-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-\n' +
            '`0  ' + pronoun + ' agrees to go to dinner with you!\n' +
            '`0\n' +
            '`0  You both have a wonderful time, and learn a lot from eachother.\n' +
            '`0\n' +
            '`2  You receive `%' + (npc.level * 20) + ' `2experience points!\n' +
            '`E' + (npc.level * 20) + '\n' +
            '``',
        );
    }

    private static romanceKiss(npc: LoadedPlayerRecord, targetRecord: number, storage: IgmDeps['storage']): void {
        const pronoun = npc.sex === 'F' ? 'She' : 'He';
        storage.sendMail(targetRecord,
            '`%  ** Romantic Mail Return From ' + npc.name + ' **\n' +
            '`2-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-\n' +
            '`0  ' + pronoun + ' gives you a big wet kiss!\n' +
            '`0\n' +
            '`2  You receive `%' + (npc.level * 10) + ' `2experience points!\n' +
            '`E' + (npc.level * 10) + '\n' +
            '``',
        );
    }

    private static romanceFlatter(npc: LoadedPlayerRecord, targetRecord: number, storage: IgmDeps['storage']): void {
        const pronoun = npc.sex === 'F' ? 'She' : 'He';
        storage.sendMail(targetRecord,
            '`%  ** Romantic Mail Return From ' + npc.name + ' **\n' +
            '`2-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-\n' +
            '`0  ' + pronoun + ' smiles back, encouragingly!\n' +
            '`0\n' +
            '`2  You receive `%' + (npc.level * 5) + ' `2experience points!\n' +
            '`E' + (npc.level * 5) + '\n' +
            '``',
        );
    }

    private static romanceInvite(npc: LoadedPlayerRecord, targetRecord: number, storage: IgmDeps['storage']): void {
        const pronoun = npc.sex === 'F' ? 'She' : 'He';
        storage.sendMail(targetRecord,
            '`%  ** Romantic Mail Return From ' + npc.name + ' **\n' +
            '`2-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-\n' +
            '`0  ' + pronoun + ' agrees to sleep with you!\n' +
            '`0\n' +
            '`0  You both have a wonderfully sweaty time, and learn very little\n' +
            '`0  from eachother.  (but you had fun!)\n' +
            '`0\n' +
            '`2  You receive `%' + (npc.level * 50) + ' `2experience points!\n' +
            '`E' + (npc.level * 50) + '\n' +
            '`{\n' +
            '``',
        );

        // If NPC is female, record the partner
        if (npc.sex === 'F') {
            npc.married_to = targetRecord;
        }
    }

    private static romanceReject(npc: LoadedPlayerRecord, targetRecord: number, type: string, storage: IgmDeps['storage']): void {
        const pronoun = npc.sex === 'F' ? 'She' : 'He';
        let rejectMsg: string;
        switch (type) {
            case 'dinner':
                rejectMsg = pronoun + ' turns down your dinner invitation!';
                break;
            case 'kiss':
                rejectMsg = pronoun + ' slaps you when you try to kiss!';
                break;
            case 'flatter':
                rejectMsg = pronoun + ' ignores your flattery completely!';
                break;
            case 'invite':
                rejectMsg = pronoun + ' turns up their nose at the idea!';
                break;
            default:
                rejectMsg = pronoun + ' is not interested.';
        }
        storage.sendMail(targetRecord,
            '`%  ** Romantic Mail Return From ' + npc.name + ' **\n' +
            '`2-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-=-=-=-=-=-=-=--=-=-=-=-=-=-\n' +
            '`0  ' + rejectMsg + '\n' +
            '``',
        );
    }

    // ─── Extracted Mail Processing Helpers ───────────────────────────────────────

    private static _handleRomanticCode(
        npc: LoadedPlayerRecord,
        code: string,
        senderRecord: number,
        allPlayers: LoadedPlayerRecord[],
        storage: IgmDeps['storage'],
    ): void {
        // Mail codes map to romantic actions: U dinner, Y kiss,
        // T flatter, I invite. Acceptance is biased by the charm gap
        // between sender and NPC, then tempered by personality stat2.
        const sender = allPlayers.find(p => p.Record === senderRecord);
        if (!sender) return;

        const stat2 = Math.max(1, Math.min(5, npc.new_stat2 || 1));
        const charmDiff = (npc.cha || 0) - (sender.cha || 0);
        const accepted = !((random(stat2) - charmDiff - 2) > 0);

        if (accepted) {
            switch (code) {
                case 'U': NpcSocial.romanceDinner(npc, senderRecord, storage); break;
                case 'Y': NpcSocial.romanceKiss(npc, senderRecord, storage); break;
                case 'T': NpcSocial.romanceFlatter(npc, senderRecord, storage); break;
                case 'I': NpcSocial.romanceInvite(npc, senderRecord, storage); break;
            }
        } else {
            switch (code) {
                case 'U': NpcSocial.romanceReject(npc, senderRecord, 'dinner', storage); break;
                case 'Y': NpcSocial.romanceReject(npc, senderRecord, 'kiss', storage); break;
                case 'T': NpcSocial.romanceReject(npc, senderRecord, 'flatter', storage); break;
                case 'I': NpcSocial.romanceReject(npc, senderRecord, 'invite', storage); break;
            }
        }
    }

    private static _processIncomingPlayerMail(
        npc: LoadedPlayerRecord,
        mailLines: string[],
        currentIndex: number,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): number {
        // Player-written mail ends with a `-NNN sender marker. Consume
        // until that sentinel so the NPC replies to the whole message.
        const mailBodyLines: string[] = [];
        let senderRecord = -1;
        let i = currentIndex + 1;

        while (i < mailLines.length) {
            const bodyLine = mailLines[i];
            if (/^`-\d{1,3}$/.test(bodyLine.trim())) {
                senderRecord = parseInt(bodyLine.trim().substring(2), 10);
                i++;
                break;
            }
            // Skip divider lines
            if (!bodyLine.startsWith('`0-=') && !bodyLine.startsWith('`0-=-')) {
                mailBodyLines.push(bodyLine);
            }
            i++;
        }

        if (senderRecord >= 0 && mailBodyLines.length > 0) {
            NpcSocial.npcReplyToMail(npc, senderRecord, mailBodyLines.join(' '), phrases, storage);
        }

        return i;
    }

    private static _sendRomanticProposal(
        npc: LoadedPlayerRecord,
        target: LoadedPlayerRecord,
        stat3: number,
        storage: IgmDeps['storage'],
    ): void {
        const pronoun = npc.sex === 'F' ? 'her' : 'him';
        const npcRecIdx = npc.Record;

        switch (stat3) {
            case 5:
                // Flatter
                storage.sendMail(target.Record,
                    '  `2Romantic Message From `0' + npc.name + '`2!\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '  `2' + npc.name + ' is flirting with you!\n' +
                    '  `2\n' +
                    '`0  "I\'d pick up yer hankie anywheres! Hyuck!"\n' +
                    '`T' + npcRecIdx + '\n',
                );
                return;
            case 6:
                // Kiss
                storage.sendMail(target.Record,
                    '  `2Romantic Message From `0' + npc.name + '`2!\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '  `2' + npc.name + ' wants you to kiss ' + pronoun + '!\n' +
                    '  `2\n' +
                    '`0  "Kiss me, I use a mouth wash!"\n' +
                    '`Y' + npcRecIdx + '\n',
                );
                return;
            case 7:
                // Dinner
                storage.sendMail(target.Record,
                    '  `2Romantic Message From `0' + npc.name + '`2!\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '  `2' + npc.name + ' wants to treat you to dinner!\n' +
                    '  `2\n' +
                    '`0  "Please?  I\'ll cook Dragon for ya!"\n' +
                    '`U' + npcRecIdx + '\n',
                );
                return;
            default: {
                // 8, 9, 10 - Invite (sleep together)
                const genderNoun = npc.sex === 'F' ? 'woman' : 'man';
                const possessive = npc.sex === 'F' ? 'her' : 'his';
                storage.sendMail(target.Record,
                    '  `2Romantic Message From `0' + npc.name + '`2!\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '  `2' + npc.name + ' wants you to join ' + pronoun + ' in a night of\n' +
                    '  `2funfilled passion, in ' + possessive + ' room at the Inn.\n' +
                    '  `2\n' +
                    '`0  "Make me a ' + genderNoun + ' tonight, honey!  Pleeeeeease?!"\n' +
                    '`I' + npcRecIdx + '\n',
                );
                // 10% chance to fall in love
                if (random(10) === 0 && !NpcUtil.getAttachedLover(npc.Record, storage)) {
                    NpcUtil.setAttachedLover(npc.Record, target.name, storage);
                }
                return;
            }
        }
    }

    // ─── AI Mail Reply System ────────────────────────────────────────────────────

    /**
     * NPC replies to a player's mail by keyword-matching against AIREPLY.CFG.
     * Original reads keyword/response pairs, checks if keyword appears in the mail text.
     */
    private static npcReplyToMail(
        npc: LoadedPlayerRecord,
        senderRecord: number,
        mailText: string,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        const textUpper = mailText.toUpperCase();
        const npcRecStr = String(npc.Record).padStart(3, '0');

        // First keyword match wins, preserving the original ordered reply table.
        for (const pair of phrases.aiReplyPairs) {
            if (textUpper.includes(pair.keyword.toUpperCase())) {
                storage.sendMail(senderRecord,
                    '\n' +
                    '  `0' + npc.name + '`2 sent you this...\n' +
                    '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                    '`%  ' + pair.response + '\n' +
                    '`%\n' +
                    '`-' + npcRecStr,
                );
                return;
            }
        }

        // Default reply if no keyword matched and default is configured
        if (phrases.aiReplyDefault) {
            storage.sendMail(senderRecord,
                '\n' +
                '  `0' + npc.name + '`2 sent you this...\n' +
                '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                '`%  ' + phrases.aiReplyDefault + '\n' +
                '`%\n' +
                '`-' + npcRecStr,
            );
        }
    }

    // ─── Romance Proposals: NPC proposes to opposite-sex players ─────────────────

    /**
     * NPC sends romantic proposals to opposite-sex players. (matches npcromance2)
     * Proposal type escalates with new_stat3 (5=flatter, 6=kiss, 7=dinner, 8-10=invite).
     */
    static npcRomance2(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        storage: IgmDeps['storage'],
    ): void {
        const stat3 = Math.max(5, Math.min(10, npc.new_stat3 || 5));

        // ~10% chance per day - proactive romance proposals should be rare events, not daily spam
        if (random(10) !== 0) return;

        // Target opposite sex
        const targetSex = npc.sex === 'F' ? 'M' : 'F';

        for (const target of allPlayers) {
            if (target.sex !== targetSex || !target.name || target.name === 'X') continue;
            if (random(3) !== 0) continue; // 1/3 chance per eligible target

            NpcSocial._sendRomanticProposal(npc, target, stat3, storage);
            return;
        }
    }

    // ─── Attached Lover ──────────────────────────────────────────────────────────

    /**
     * NPC interacts with their attached lover. (matches attached procedure)
     * Three possible actions (each with independent random chance):
     * 1. Send affection mail
     * 2. Transfer gold (level^2 * 1000)
     * 3. Check if lover killed the NPC - if so, send betrayal mail and break up
     */
    static npcAttached(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        attachedCfg: AttachedConfig,
        storage: IgmDeps['storage'],
    ): void {
        if (attachedCfg.killed === 'NEVER') return;

        const loveName = NpcUtil.getAttachedLover(npc.Record, storage);
        if (!loveName) return;

        const stat3 = Math.max(5, Math.min(10, npc.new_stat3 || 5));
        const lover = allPlayers.find(p => p.name === loveName);
        if (!lover) {
            NpcUtil.setAttachedLover(npc.Record, '', storage);
            return;
        }

        const npcRecStr = String(npc.Record).padStart(3, '0');

        // Action 1: Send affection mail
        if (random(stat3) > 6) {
            storage.sendMail(lover.Record,
                '\n' +
                '  `0' + npc.name + '`2 sent you this...\n' +
                '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                '`%  ' + attachedCfg.affection + '\n' +
                '`%\n' +
                '`-' + npcRecStr,
            );
        }

        // Action 2: Transfer gold
        if (random(stat3) > 7) {
            const amount = npc.level * npc.level * 1000;
            storage.sendMail(lover.Record,
                '\n' +
                '  `0' + npc.name + '`2 sent you this...\n' +
                '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                '`%  ' + attachedCfg.transfer + '\n' +
                '`%\n' +
                '`-' + npcRecStr + '\n' +
                '\n' +
                '  `%BANK NOTICE:\n' +
                '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                '  `0' + npc.name + ' `2has transfered `%' + amount + ' `2gold\n' +
                '  to your account.\n' +
                '`b' + amount,
            );
        }

        // Action 3: Check if lover killed the NPC (read NPC's mail for attack notices)
        if (random(stat3) > 7) {
            const npcMail = storage.getMail(npc.Record);
            for (const line of npcMail) {
                if (line.includes('YOU HAVE BEEN ATTACKED') || line.includes('has attacked you')) {
                    // Check if the attacker is our lover
                    if (line.includes(loveName)) {
                        storage.sendMail(lover.Record,
                            '\n' +
                            '  `0' + npc.name + '`2 sent you this...\n' +
                            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
                            '`%  ' + attachedCfg.killed + '\n' +
                            '`%\n' +
                            '`-' + npcRecStr,
                        );
                        NpcUtil.setAttachedLover(npc.Record, '', storage); // Break up
                        return;
                    }
                }
            }
        }
    }

    // ─── Violet Marriage ─────────────────────────────────────────────────────────

    /**
     * NPC attempts to marry Violet. (matches NPCMarry procedure)
     * 5% chance (random(20) === 3), male NPCs only, Violet must be single.
     */
    static npcMarry(
        npc: LoadedPlayerRecord,
        state: State,
        marryViolet: boolean,
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        // Violet already married?
        if (state.married_to_violet !== undefined && state.married_to_violet >= 0) return;
        // Marriage disabled?
        if (!marryViolet) return;
        // Only males can marry Violet
        if (npc.sex === 'F') return;

        // 5% chance
        if (random(20) !== 3) return;

        // Set Violet as married to this NPC
        state.married_to_violet = npc.Record;

        // Log the marriage
        storage.appendLog('today',
            '`2  `#Violet`2 has `%MARRIED `0' + npc.name + '`2!!!!!',
        );
        storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');

        // XP bonus
        npc.exp += npc.level * 1000;

        // Post announcement to bar
        if (phrases.marriage.length > 0) {
            const msg = phrases.marriage[random(phrases.marriage.length)];
            NpcUtil.postToBar(npc, msg, storage);
        }
    }

    // ─── Kids ────────────────────────────────────────────────────────────────────

    /**
     * If a female NPC has a spouse (married_to field), there's a 1/3 chance
     * the child is sent to the father via a "social services" mail.
     */
    static npcKids(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        storage: IgmDeps['storage'],
    ): void {
        if (npc.sex !== 'F') return;
        if (!npc.married_to || npc.married_to < 0) return;

        const father = allPlayers.find(p => p.Record === npc.married_to);
        if (!father) return;

        if (random(3) !== 0) return;

        storage.sendMail(father.Record,
            '\n' +
            '  `2A Note From the `$Department of Social Services\n' +
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
            '`%  `2' + npc.name + '`% has been deemed an unfit mother\n' +
            '`%  by our chief investigator.  Her child has been turned over\n' +
            '`%  to you, the father.  Please take good care of the child.\n' +
            '`%',
        );
        father.kids = (father.kids || 0) + 1;
        father.put();
    }

    // ─── NPC Flirt ───────────────────────────────────────────────────────────────

    /**
     * NPC flirt/cosmetic activity. (matches npcflirt procedure)
     * Random chance for NPC to flirt with Violet (males) or Seth Able (females).
     */
    static npcFlirt(
        npc: LoadedPlayerRecord,
        laidlog: boolean,
        violetMarried: boolean,
        storage: IgmDeps['storage'],
    ): void {
        // Original: if violetmarried then exit
        if (violetMarried) return;

        // Original: Case Random(3) of 1: ... else: exit
        if (random(3) !== 1) return;

        const ran = 1 + random(6);
        const charm = npc.cha || 0;

        if (laidlog) {
            if (ran < charm + 1 && charm < 6) return; // didn't manage to flirt

            let lfMsg: string;
            if (ran > charm && charm < 6) {
                // Flirt attempt failed
                lfMsg = npc.sex === 'M'
                    ? '`0  ' + npc.name + ' `%Got kicked in the groin by `#Violet`%!'
                    : '`0  ' + npc.name + ' `%was called a whore by `0Seth Able!';
            } else {
                // Flirt succeeded
                lfMsg = npc.sex === 'M'
                    ? '`0  ' + npc.name + ' `%Got laid by `#Violet`%!'
                    : '`0  ' + npc.name + ' `%Got laid by `0Seth Able!';
            }
            storage.appendLog('today', lfMsg);
            storage.appendLog('today', '`>`.`2-`0=`2-`0=`2-`0=`2-');
        }

        if (charm < 6) return;
        npc.laid = (npc.laid || 0) + 1;
        npc.exp += npc.level * 200;
    }

    // ─── AI Mail ─────────────────────────────────────────────────────────────────

    /**
     * NPC sends AI mail to a random player. (matches aimail procedure)
     */
    static npcAiMail(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        if (phrases.aiMail.length === 0) return;

        // ~10% chance per day - proactive AI mail should be a rare surprise, not daily noise
        if (random(10) !== 0) return;

        const targets = allPlayers.filter(p => !p.is_npc && p.name && p.name !== 'X');
        if (targets.length === 0) return;

        const target = targets[random(targets.length)];
        const phrase = phrases.aiMail[random(phrases.aiMail.length)];
        const npcRecStr = String(npc.Record).padStart(3, '0');

        storage.sendMail(target.Record,
            '\n' +
            '  `0' + npc.name + '`2 sent you this...\n' +
            '`0-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-`2\n' +
            '`%  ' + phrase + '\n' +
            '`%\n' +
            '`-' + npcRecStr,
        );
    }

    // ─── Bar Chat ────────────────────────────────────────────────────────────────

    /**
     * NPC posts a phrase to the bar or darkbar conversation. (matches npctalk procedure)
     */
    static npcTalk(
        npc: LoadedPlayerRecord,
        allPlayers: LoadedPlayerRecord[],
        phrases: NpcPhrases,
        storage: IgmDeps['storage'],
    ): void {
        if (phrases.barChat.length === 0) return;

        const barName = random(3) === 1 ? 'darkbar' : 'bar';

        // Pick a random phrase
        let phrase = phrases.barChat[random(phrases.barChat.length)];

        // Substitute %N with a random player name (original used %1..%9)
        const humanPlayers = allPlayers.filter(p => !p.is_npc && p.name && p.name !== 'X');
        if (humanPlayers.length > 0) {
            phrase = phrase.replace(/%([1-9])/g, () => {
                const target = humanPlayers[random(humanPlayers.length)];
                return target.name;
            });
        }

        storage.appendConversation(barName, [
            '  `%' + npc.name + ':',
            '  `2' + phrase,
        ], 18);
    }
}
