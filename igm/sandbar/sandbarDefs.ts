/**
 * Sandtiger's Bar v1.02 - Definitions, Types, and Constants
 * Shared interfaces, record definitions, weapon/armor tables, card constants, and NPC names.
 */
import type { RecordFieldDef } from '@lordts/storage/IRecordFile';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type State from '@lordts/core/State';
import type Log from '@lordts/core/Log';
import type Equipment from '@lordts/core/Equipment';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IRecordFile } from '@lordts/storage/IRecordFile';

// ─── Per-Player Record ───────────────────────────────────────────────────────

interface SandBarRecord {
    lrdrecord: number;
    day: number;
    barcoins: number;
    visits: number;
    witchUsed: boolean;
    masterResetToday: boolean;
    forestFightsBoughtToday: number;
    pvpFightsBoughtToday: number;
    put(): void;
}

const SandBar_Defs: RecordFieldDef[] = [
    { prop: 'lrdrecord', name: 'Lord Player Record #', type: 'SignedInteger', def: -1 },
    { prop: 'day', name: 'Lord Day last played', type: 'Integer', def: 123456 },
    { prop: 'barcoins', name: 'BarCoins', type: 'SignedInteger', def: 0 },
    { prop: 'visits', name: 'Visits today', type: 'Integer', def: 0 },
    { prop: 'witchUsed', name: 'Witch used today', type: 'Boolean', def: false },
    { prop: 'masterResetToday', name: 'Master reset today', type: 'Boolean', def: false },
    { prop: 'forestFightsBoughtToday', name: 'Forest fights bought today', type: 'Integer', def: 0 },
    { prop: 'pvpFightsBoughtToday', name: 'PVP fights bought today', type: 'Integer', def: 0 },
];

// ─── Configuration ───────────────────────────────────────────────────────────

interface SandBarConfig {
    maxVisitsPerDay: number;
    barCoinExchangeRate: number;
    hpCost: number;
    strCost: number;
    defCost: number;
    chaCost: number;
    nameChangeCost: number;
    sexChangeCost: number;
    flirtAgainCost: number;
    seeMasterCost: number;
    hearBardCost: number;
    forestFightsCost: number;
    userFightsCost: number;
    expCost: number;
    gemCost: number;
    protectionCost: number;
    skillChangeCost: number;
    classChangeCost: number;
    curseCost: number;
    mindFryCost: number;
    dwarfCost: number;
    abandonmentCost: number;
    fairyCost: number;
    horseCost: number;
}

// ─── Shared Context ──────────────────────────────────────────────────────────
// Mutable context object shared by all sub-modules so barcoins etc. stay in sync.

interface SandBarContext {
    io: IO;
    player: Player;
    state: State;
    log: Log;
    equipment: Equipment;
    storage: IStorage;
    config: SandBarConfig;
    record: SandBarRecord;
    file: IRecordFile;
    barcoins: number;
}

// ─── Custom Weapons & Armor ─────────────────────────────────────────────────

interface SandBarItem {
    name: string;
    num: number;
    cost: number;
}

// `num` is weapon/armor power (attack/defense stat). cost=0 is a placeholder;
// actual cost computed at runtime from level-based formulas in sandbar.ts.
const SANDBAR_WEAPONS: SandBarItem[] = [
    { name: 'Sling Shot',      num: 5,   cost: 0 },
    { name: 'Dagger of Pain',  num: 15,  cost: 0 },
    { name: 'Lick of Flame',   num: 30,  cost: 0 },
    { name: 'Kiss of Death',   num: 60,  cost: 0 },
    { name: 'Joust',           num: 120, cost: 0 },
    { name: 'Touch of Light',  num: 200, cost: 0 },
];

const SANDBAR_ARMOR: SandBarItem[] = [
    { name: 'Lead Pan',        num: 5,   cost: 0 },
    { name: 'Porcupine Skin',  num: 15,  cost: 0 },
    { name: 'Weld Suit',       num: 30,  cost: 0 },
    { name: 'Ghod Armor',      num: 60,  cost: 0 },
    { name: 'Hand of Chance',  num: 120, cost: 0 },
    { name: 'Fairy\'s Light',  num: 200, cost: 0 },
];

// ─── Card Game Types ─────────────────────────────────────────────────────────

interface Card {
    suit: number;
    value: number;
}

// CP437 card suits: spade(\x06), heart(\x03), club(\x05), diamond(\x04)
// Colors: spades/clubs green(`2), hearts/diamonds red(`4)
const SUIT_NAMES = ['\x06', '\x03', '\x05', '\x04'];
const SUIT_COLORS = ['`2', '`4', '`2', '`4'];
const FACE_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_VALUES = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];

// Blackjack NPC names (6 NPCs + player = 7 players)
const BJ_NPCS = ['Razor', 'Marcia', 'Nicki', 'Seth Able', 'Todd', 'Bolus'];

// Elimination NPC names (6 NPCs + player = 7 players)
const ELIM_NPCS = ['Ultra Z', 'Dalton', 'Grim Reaper', 'Laser Lady', 'Bowling Ball Head', 'Lord Dakhoth'];

// ─── Utility Functions ───────────────────────────────────────────────────────

async function pressAKey(io: IO): Promise<void> {
    await io.lln('`2<`0MORE`2>');
    io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
    await io.getkey();
}

function canAfford(ctx: SandBarContext, cost: number): boolean {
    return ctx.barcoins >= cost;
}

function spendBarCoins(ctx: SandBarContext, amount: number): void {
    ctx.barcoins -= amount;
    if (ctx.barcoins < 0) ctx.barcoins = 0;
    ctx.record.barcoins = ctx.barcoins;
    ctx.record.put();
}

function earnBarCoins(ctx: SandBarContext, amount: number): void {
    ctx.barcoins += amount;
    if (ctx.barcoins > 2000000000) ctx.barcoins = 2000000000;
    ctx.record.barcoins = ctx.barcoins;
    ctx.record.put();
}

export {
    SandBar_Defs,
    SANDBAR_WEAPONS,
    SANDBAR_ARMOR,
    SUIT_NAMES,
    SUIT_COLORS,
    FACE_NAMES,
    CARD_VALUES,
    BJ_NPCS,
    ELIM_NPCS,
    pressAKey,
    canAfford,
    spendBarCoins,
    earnBarCoins,
};

export type {
    SandBarRecord,
    SandBarConfig,
    SandBarContext,
    SandBarItem,
    Card,
};
