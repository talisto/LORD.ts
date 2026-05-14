/**
 * Felicity's Temple - Data definitions
 * Record structure and constants for per-player IGM state.
 * Original by Lloyd Hannesson (1995-2002), Tech'N Software Group.
 */
import type { IRecordData } from '@lordts/storage/IRecordFile';

/** Per-player record fields stored via DbRecordFile */
export const Felicity_Defs = [
    { prop: 'lrdrecord', name: 'Lord Player Record #', type: 'SignedInteger', def: -1 },
    { prop: 'day', name: 'Lord Day last played', type: 'Integer', def: 0 },
    // daily flags
    { prop: 'talked_fel', name: 'Talked to Felicity today', type: 'Boolean', def: false },
    { prop: 'talked_akasha', name: 'Talked to Akasha today', type: 'Boolean', def: false },
    { prop: 'prayed', name: 'Prayed at statue today', type: 'Boolean', def: false },
    { prop: 'fountain', name: 'Used fountain today', type: 'Boolean', def: false },
    { prop: 'explored', name: 'Explored bushes today', type: 'Boolean', def: false },
    { prop: 'janitor_helped', name: 'Janitor helped today', type: 'Boolean', def: false },
    { prop: 'janitor_lf', name: 'Searched Lost & Found today', type: 'Boolean', def: false },
    { prop: 'arcade_played', name: 'Played arcade today', type: 'Boolean', def: false },
    { prop: 'flirted', name: 'Flirted today', type: 'Boolean', def: false },
    { prop: 'statue_vin', name: 'Visited Vindicator today', type: 'Boolean', def: false },
    { prop: 'statue_fae', name: 'Visited Faethor today', type: 'Boolean', def: false },
    { prop: 'statue_kar', name: 'Visited Karadoc today', type: 'Boolean', def: false },
    // persistent flags
    { prop: 'found_storage', name: 'Found storage room', type: 'Boolean', def: false },
    { prop: 'found_janitor', name: 'Found janitor room', type: 'Boolean', def: false },
];

export interface FelicityRecord extends IRecordData {
    lrdrecord: number;
    day: number;
    talked_fel: boolean;
    talked_akasha: boolean;
    prayed: boolean;
    fountain: boolean;
    explored: boolean;
    janitor_helped: boolean;
    janitor_lf: boolean;
    arcade_played: boolean;
    flirted: boolean;
    statue_vin: boolean;
    statue_fae: boolean;
    statue_kar: boolean;
    found_storage: boolean;
    found_janitor: boolean;
}

/** Top-ten score entry for Warrior's Revenge arcade game */
export interface WarriorScore {
    name: string;
    score: number;
}

/** Lost and Found items (index → reward) */
export const LOST_AND_FOUND = [
    { text: ' These `%2 `0Gems! ', type: 'gem', amount: 2 },
    { text: ' This bag of `%1,000 `0gold!', type: 'gold', amount: 1000 },
    { text: ' This `%1 `0gem!', type: 'gem', amount: 1 },
    { text: ' These `%3 `0gems!', type: 'gem', amount: 3 },
    { text: ' This `%Fairy `0in a bottle!', type: 'fairy', amount: 1 },
    { text: ' This bag of `%1,500 `0gold!', type: 'gold', amount: 1500 },
    { text: ' This bag of `%2,000 `0gold!', type: 'gold', amount: 2000 },
    { text: ' This `%Horse`0!!', type: 'horse', amount: 1 },
    { text: ' This bag of `%2,500 `0gold!', type: 'gold', amount: 2500 },
    { text: ' These `%2 `0gems!', type: 'gem', amount: 2 },
];

/** Janitor help outcomes */
export const JANITOR_HELP = [
    { text: ' `%Stronger!!!! YOU GAIN 3 STRENGTH!!!!!', stat: 'str', amount: 3 },
    { text: ' `%Tougher!!!! YOU GAIN 1 DEFENCE!!!!!', stat: 'def', amount: 1 },
    { text: ' `%Better Looking!!!! GAIN 1 CHARM!!!', stat: 'cha', amount: 1 },
    { text: ' `%Richer!!!!! GAIN 1,000 GOLD!!!!', stat: 'gold', amount: 1000 },
    { text: ' `%Wealthy!!!! YOU GET A GEM!!!!', stat: 'gem', amount: 1 },
];

/** Default top-ten names from the EXE */
export const DEFAULT_TOP_TEN: WarriorScore[] = [
    { name: 'Glibbon', score: 0 },
    { name: 'Kitty', score: 0 },
    { name: 'Zeus', score: 0 },
    { name: 'Karadoc', score: 0 },
    { name: 'Akasha', score: 0 },
    { name: 'Faethor', score: 0 },
    { name: 'Vindicator', score: 0 },
    { name: 'Felicity', score: 0 },
    { name: 'Turin', score: 0 },
    { name: 'Jim Bob Jones', score: 0 },
];

/** Record defs for Warrior's Revenge top-ten scores (stored in felicity_scores.dat) */
export const Score_Defs = [
    { prop: 'name', name: 'Player Name', type: 'String', def: '' },
    { prop: 'score', name: 'Score', type: 'Integer', def: 0 },
];

export const IGM_NAME = "Felicity's Temple";
export const IGM_VERSION = 'TS v2.1';
