/**
 * Aragorn's Timer - IGM for LORD
 * Ported directly from Pascal source code
 */
import * as path from 'path';
import { random } from '@lordts/util/Util';
import type { IRecordData, IRecordFile, RecordFieldDef } from '@lordts/storage/IRecordFile';
import type { IStorage } from '@lordts/storage/IStorage';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import type IO from '@lordts/core/io/IO';

interface AratimeRecord extends IRecordData {
    resetKey: number;
    played: boolean[];
}

interface PlayerRecord {
    Record: number;
    sex: string;
    gold: number;
    put(): void;
}

const MAX_PLAYERS = 150;
const TIMER_SECONDS = 20;
const MAX_GUESSES = 15;

const Arag_Defs: RecordFieldDef[] = [
    {
        prop: 'resetKey',
        type: 'SignedInteger',
        def: -1
    },
    {
        prop: 'played',
        type: 'Array:150:Boolean',
        def: Array.from({ length: MAX_PLAYERS }, () => false)
    }
];

function createPlayedFlags(): boolean[] {
    return Array.from({ length: MAX_PLAYERS }, () => false);
}

function currentResetKey(now: Date = new Date()): number {
    // Preserve the original DAT reset scheme: a simple calendar-derived key
    // that changes once per day without storing a full timestamp.
    return now.getFullYear() + now.getMonth() + 1 + now.getDate();
}

function normalizePlayedFlags(value: unknown): boolean[] {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: MAX_PLAYERS }, (_, index) => Boolean(source[index]));
}

class Aratime {
    private readonly io: IO;
    private readonly player: PlayerRecord;
    private readonly storage: IStorage;
    private readonly stateFilePath: string;

    constructor(deps: IgmDeps) {
        this.io = deps.io;
        this.player = deps.player;
        this.storage = deps.storage;
        this.stateFilePath = path.join(deps.runtimeDir, 'aratime', 'aragtime.dat');
    }

    static get desc(): string { return '`%Aragorn`2\'s Timer'; }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: IgmClass.runMaint interface
    static async runMaint(deps: IgmDeps): Promise<void> {
        const recordFile = deps.storage.create(path.join(deps.runtimeDir, 'aratime', 'aragtime.dat'), Arag_Defs);
        const record = Aratime.loadStateRecord(recordFile);
        Aratime.resetForNewDay(record);
    }

    async run(): Promise<void> {
        const recordFile = this.storage.create(this.stateFilePath, Arag_Defs);
        const record = Aratime.loadStateRecord(recordFile);
        Aratime.resetForNewDay(record);

        if (record.played[this.player.Record]) {
            this.io.sclrscr();
            await this.io.lln('`0Aragorn`2\'s Cave looks darker than it usually does.');
            await this.io.lln('`2Maybe he\'s not home...');
            await this.io.moreNoMail();
            return;
        }

        await this.menu(record);
    }

    private static loadStateRecord(recordFile: IRecordFile): AratimeRecord {
        const record = (recordFile.get(0) ?? recordFile.new()) as AratimeRecord | null;
        if (record === null) {
            throw new Error('Unable to initialize Aragorn\'s Timer state record');
        }

        // Old data may contain missing or wrong-length arrays. Normalize every
        // load back to the fixed 150-player boolean table before using it.
        const normalizedPlayed = normalizePlayedFlags(record.played);
        const normalizedResetKey = typeof record.resetKey === 'number' ? record.resetKey : -1;
        const playedChanged = normalizedPlayed.some((value, index) => value !== record.played?.[index])
            || !Array.isArray(record.played)
            || record.played.length !== MAX_PLAYERS;

        record.played = normalizedPlayed;
        if (playedChanged || record.resetKey !== normalizedResetKey) {
            record.resetKey = normalizedResetKey;
            record.put();
        }

        return record;
    }

    private static resetForNewDay(record: AratimeRecord, now: Date = new Date()): void {
        const resetKey = currentResetKey(now);
        if (record.resetKey === resetKey) {
            return;
        }

        record.resetKey = resetKey;
        record.played = createPlayedFlags();
        record.put();
    }

    private parseBet(input: string): number | null {
        if (!/^\d+$/.test(input)) {
            return null;
        }
        return parseInt(input, 10);
    }

    private async readGuess(): Promise<number> {
        await this.io.lw('`2Guess?`% ');
        this.io.emitPrompt('aratime_guess', [], 'number');
        const input = await this.io.getstr({ x: 0, y: 0, len: 10, c: 0, c1: 7, edit: '', integer: true });
        return /^\d+$/.test(input) ? parseInt(input, 10) : 0;
    }

    private secondsRemaining(deadline: number): number {
        return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    }

    private async showGuessFeedback(guess: number, actual: number, deadline: number): Promise<void> {
        const result = guess > actual ? 'Too High' : 'Too Low';
        await this.io.lln('`0' + result);
        await this.io.lln('`2You have `$' + this.secondsRemaining(deadline) + ' `2seconds left!');
        await this.io.sln();
    }

    async menu(astate: AratimeRecord): Promise<void> {
        this.io.sclrscr();
        await this.io.lln('`2You take a hesitant step toward the opening of `0Aragorn`2\'s Cave.');
        await this.io.lln('You\'ve heard of his games making some very rich indeed, and you desire that wealth.  But others have been broken - destined to be level five warriors forever...');
        await this.io.sln();
        let ch = await this.io.prompt(
            '`2Shall you enter? [`5N`2]:`% ',
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'enter_cave',
            { defaultKey: 'N', leadingBlank: false, trailingBlank: false }
        );
        if (ch === 'N') {
            await this.io.sln();
            await this.io.lln('`2You turn, and run back to the realm.');
            await this.io.moreNoMail();
            return;
        }
        this.io.sclrscr();
        await this.io.lln('`0Aragorn `2smiles, to welcome you.  Many piles of gold are stacked by his side.  The dingy room radiates a rare type of warmth, and you are compelled to sit down in the chair opposite him.');
        await this.io.sln();
        const childTitle = this.player.sex === 'F' ? 'daughter' : 'son';
        await this.io.lln('`%"`0My ' + childTitle + ', I play a very simple game.  You have 20');
        await this.io.sln('seconds and 15 tries to guess my number, from 1 to 1000.  If');
        await this.io.sln('you get it right, then I will give you your money, and half');
        await this.io.sln('again.  If you do not, then you lose all.');
        await this.io.sln();
        if (this.player.gold < 1) {
            await this.io.lln('`0Aragorn `2suddenly stands up.');
            await this.io.lln('`%"`0You have no money!  Why don\'t you get some, and come back later!');
            await this.io.moreNoMail();
            return;
        }
        await this.io.lln('`%"`0Good.  Now, do you wish to play?`%"');
        await this.io.sln();
        ch = await this.io.prompt(
            '`2[`5Y`2]:`% ',
            [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }],
            'play_game',
            { defaultKey: 'Y', leadingBlank: false, trailingBlank: false }
        );
        if (ch === 'N') {
            await this.io.sln();
            await this.io.lln('`0Aragorn `2dismisses you with a wave of his hand.');
            await this.io.moreNoMail();
            return;
        }
        astate.played[this.player.Record] = true;
        astate.put();

        this.io.sclrscr();
        let wager: number | null;
        do {
            await this.io.lw('`2How much of your `$' + this.player.gold + ' `2will you wager?`% ');
            this.io.emitPrompt('aratime_wager', [], 'number');
            wager = this.parseBet(await this.io.getstr({ x: 0, y: 0, len: 10, c: 0, c1: 7, edit: '', integer: true }));
        } while (wager === null || wager <= 0 || wager > this.player.gold);

        await this.io.sln();
        await this.io.lln('`0Aragon `2smiles.  He turns over his timeglass.');
        await this.io.sln();
        const actualNumber = random(1000) + 1;
        let guess = await this.readGuess();
        const deadline = Date.now() + TIMER_SECONDS * 1000;

        if (guess !== actualNumber) {
            await this.showGuessFeedback(guess, actualNumber, deadline);
        }

        let done = false;
        let attempts = 1;
        while (guess !== actualNumber && !done) {
            guess = await this.readGuess();
            done = Date.now() >= deadline;
            attempts += 1;
            if (attempts > MAX_GUESSES) {
                done = true;
            }
            // A correct last-second guess still counts as a win even if the
            // deadline expired during the same iteration.
            if (done && guess === actualNumber) {
                done = false;
            }
            if (!done && guess !== actualNumber) {
                await this.showGuessFeedback(guess, actualNumber, deadline);
            }
        }

        if (done) {
            await this.io.sln();
            if (attempts < MAX_GUESSES + 1)
                await this.io.lln('`2Time\'s Up!');
            else
                await this.io.lln('`2Guess Limit Exceeded!');
            await this.io.sln();
            this.player.gold -= Math.round(wager);
            this.player.put();
            await this.io.lln('`0Aragorn `2smiles softly to himself, and deposits your `$' + Math.round(wager) + ' `2into his pocket.  He then sits down, and waves you away.');
            await this.io.sln();
            await this.io.lln('`2You trudge out of the cave, very disappointed.  Maybe tomorrow.');
            await this.io.moreNoMail();
            return;
        }

        await this.io.sln();
        await this.io.lln('`0Aragorn `2looks extremely surprised.  You try to hide the smug look on your face.');
        await this.io.sln();
        const winnings = Math.round(wager / 2);
        this.player.gold += winnings;
        this.player.put();
        await this.io.lln('`%"`0So you beat me once... Beginner\'s luck.  Anyway, I do play fair, so here is the `$' + winnings + ' `0gold I owe you.', 1);
        await this.io.sln();
        await this.io.lln('`2You think that this would be a good time to depart, before `0Aragon `2grabs his money back.  You skip home, delighted!');
        await this.io.moreNoMail();
    }
}

export default Aratime;
