/**
 * TeamLord v2.0 - Definitions, Types, and Constants
 * Ported from TeamLord by Joseph Masters / Michael Preslar (Elysium Software)
 */
import type { RecordFieldDef } from '@lordts/storage/IRecordFile';
import type IO from '@lordts/core/io/IO';
import type Player from '@lordts/core/Player';
import type State from '@lordts/core/State';
import type Log from '@lordts/core/Log';
import type Equipment from '@lordts/core/Equipment';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IRecordFile } from '@lordts/storage/IRecordFile';


// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PLAY = 150;
const TEAM_CREATE_COST = 50000;
const DOORGUARD_COST = 10000;
const DOORGUARD_MAX_STAT = 2500;
const ENDURANCE_TRAIN_COST = 20000;
const STRENGTH_TRAIN_COST = 25000;
const MAX_ENDURANCE_HOURS = 7;
const MAX_STRENGTH_HOURS = 9;

// ─── Per-Player IGM Record ──────────────────────────────────────────────────

interface TeamLordPlayerRecord {
    realname: string;
    name: string;
    onteam: boolean;
    teamnum: number;
    invaded: number;
    partied: number;
    left: number;
    recpos: number;
    deleted: boolean;
    put(): void;
}

const TeamLordPlayer_Defs: RecordFieldDef[] = [
    { prop: 'realname', name: 'Real Name', type: 'String', def: '' },
    { prop: 'name', name: 'Player Name', type: 'String', def: '' },
    { prop: 'onteam', name: 'On Team', type: 'Boolean', def: false },
    { prop: 'teamnum', name: 'Team Number', type: 'SignedInteger', def: -1 },
    { prop: 'invaded', name: 'Invasions Left', type: 'Integer', def: 0 },
    { prop: 'partied', name: 'Party Points', type: 'Integer', def: 0 },
    { prop: 'left', name: 'Treasury Withdrawal Left', type: 'SignedInteger', def: 0 },
    { prop: 'recpos', name: 'LORD Record Position', type: 'SignedInteger', def: -1 },
    { prop: 'deleted', name: 'Deleted', type: 'Boolean', def: false },
];

// ─── Team Record ─────────────────────────────────────────────────────────────

interface TeamRecord {
    name: string;
    pass: string;
    treasury: number;
    leader: number;
    deleted: boolean;
    dgstr: number;
    dgdef: number;
    sleep: boolean[];
    member: boolean[];
    put(): void;
}

const Team_Defs: RecordFieldDef[] = [
    { prop: 'name', name: 'Team Name', type: 'String', def: '' },
    { prop: 'pass', name: 'Password', type: 'String', def: '' },
    { prop: 'treasury', name: 'Treasury', type: 'SignedInteger', def: 0 },
    { prop: 'leader', name: 'Leader Record', type: 'SignedInteger', def: -1 },
    { prop: 'deleted', name: 'Deleted', type: 'Boolean', def: false },
    { prop: 'dgstr', name: 'Doorguard Strength', type: 'SignedInteger', def: 0 },
    { prop: 'dgdef', name: 'Doorguard Defense', type: 'SignedInteger', def: 0 },
    // member[] and sleep[] are indexed by LORD player Record number (0-based).
    // member[recpos]=true means player is on this team; sleep[recpos]=true means at HQ.
    { prop: 'sleep', name: 'Sleeping Members', type: `Array:${MAX_PLAY}:Boolean`, def: makeDefaultBoolArray() },
    { prop: 'member', name: 'Team Members', type: `Array:${MAX_PLAY}:Boolean`, def: makeDefaultBoolArray() },
];

function makeDefaultBoolArray(): boolean[] {
    const arr: boolean[] = [];
    while (arr.length < MAX_PLAY) arr.push(false);
    return arr;
}

// ─── Shared Context ──────────────────────────────────────────────────────────

interface TeamLordContext {
    io: IO;
    player: Player;
    state: State;
    log: Log;
    equipment: Equipment;
    storage: IStorage;
    playerFile: IRecordFile;
    teamFile: IRecordFile;
    igmPlay: TeamLordPlayerRecord;
    myTeam: TeamRecord | null;
    playPos: number;
}

// ─── Player Index Entry ──────────────────────────────────────────────────────

interface PlayerIndexEntry {
    real_name: string;
    name: string;
    hp_max: number;
    dead: boolean;
    str: number;
    on_now: boolean;
    exp: number;
    level: number;
    clss: number;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

async function pressAKey(io: IO): Promise<void> {
    await io.lw('`0<`2MORE`0>');
    io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
    await io.getkey();
}

function buildPlayerIndex(player: Player): PlayerIndexEntry[] {
    const all = player.allPlayers();
    const index: PlayerIndexEntry[] = [];
    for (const p of all) {
        index.push({
            real_name: p.real_name,
            name: p.name,
            hp_max: p.hp_max,
            dead: p.dead,
            str: p.str,
            on_now: p.on_now,
            exp: p.exp,
            level: p.level,
            clss: p.clss,
        });
    }
    return index;
}

function loadTeam(teamFile: IRecordFile, index: number): TeamRecord | null {
    return teamFile.get(index) as unknown as TeamRecord | null;
}

function loadPlayerRec(playerFile: IRecordFile, index: number): TeamLordPlayerRecord | null {
    return playerFile.get(index) as unknown as TeamLordPlayerRecord | null;
}

/**
 * Find or create the per-player IGM record, matching by real_name.
 */
function findOrCreatePlayerRec(
    playerFile: IRecordFile,
    realName: string,
    playerName: string,
    recpos: number,
): { rec: TeamLordPlayerRecord; pos: number } {
    for (let i = 0; i < playerFile.length; i++) {
        const rec = playerFile.get(i) as unknown as TeamLordPlayerRecord;
        if (rec && rec.realname.toUpperCase() === realName.toUpperCase()) {
            return { rec, pos: i };
        }
    }
    // Create new
    const rec = playerFile.new() as unknown as TeamLordPlayerRecord;
    rec.realname = realName;
    rec.name = playerName;
    rec.onteam = false;
    rec.teamnum = -1;
    rec.recpos = recpos;
    rec.deleted = false;
    rec.put();
    const pos = playerFile.length - 1;
    return { rec, pos };
}

/**
 * Treasury withdrawal limit per day. Odd levels: 1*10^(L/2+2), even: 3*10^(L/2+2).
 * Creates a staircase: L1=100, L2=300, L3=1000, L4=3000, L5=10000, etc.
 */
function calcMagicNum(level: number): number {
    let magicNum: number;
    if (level % 2 !== 0) {
        magicNum = 1;
    } else {
        magicNum = 3;
    }
    for (let i = -1; i <= Math.floor(level / 2); i++) {
        magicNum = magicNum * 10;
    }
    return magicNum;
}

export {
    MAX_PLAY,
    TEAM_CREATE_COST,
    DOORGUARD_COST,
    DOORGUARD_MAX_STAT,
    ENDURANCE_TRAIN_COST,
    STRENGTH_TRAIN_COST,
    MAX_ENDURANCE_HOURS,
    MAX_STRENGTH_HOURS,
    TeamLordPlayer_Defs,
    Team_Defs,
    pressAKey,
    buildPlayerIndex,
    loadTeam,
    loadPlayerRec,
    findOrCreatePlayerRec,
    calcMagicNum,
};

export type {
    TeamLordPlayerRecord,
    TeamRecord,
    TeamLordContext,
    PlayerIndexEntry,
};
