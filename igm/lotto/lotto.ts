/**
 * Seth's Tribute Lotto - IGM for LORD
 * Ported from SLOTTO.PAS by Joseph Masters (Sons of Salami Software Group, 9/25/95)
 *
 * Features:
 * - One lottery play per day per player
 * - Cost: 10 * player.level gold per ticket
 * - Player enters a 4-digit code; machine generates 4 random digits (0-9)
 * - Prize based on how many machine digits appear in the player code
 * - Prize formula scales with player level
 */
import * as path from 'path';
import { random } from '@lordts/util/Util';
import type { IRecordFile } from '@lordts/storage/IRecordFile';
import type { IgmDeps } from '@lordts/igm/IgmDeps';
import { Lotto_Defs } from './lottoDefs';
import type { LottoRecord } from './lottoDefs';

class Lotto {
    private igmDataDir: string;
    private lottoFile: IRecordFile | null;
    private lottoRecord: LottoRecord | null;

    constructor(private deps: IgmDeps) {
        this.igmDataDir = path.join(deps.runtimeDir, 'lotto') + path.sep;
        this.lottoFile = null;
        this.lottoRecord = null;
    }

    static get desc(): string { return '`0Seth\'s `2Tribute `0Lotto'; }

    static async runMaint(_deps: IgmDeps): Promise<void> {
        // No daily reset needed - day tracking is per-record (day field compared to state.days)
    }

    async run(): Promise<void> {
        const { io, player, state } = this.deps;

        this.initRecord();

        io.sclrscr();
        await io.sln();
        await io.lln('`2Following a path instinctively, you come to a large hill.');
        await io.lln('`2It appears insurmountable, but you feel a warmth come over you, And a pulling force brings you to the top of the hill.');
        await io.sln();
        await io.lln('`2At the top is an oddly-shaped box with buttons next to the numbers 1 through 9.  A plaque sits below it.');
        await io.sln();
        await io.sln();
        await io.lln('`0"`2This Lottery is placed in Honor of Seth Able Robinson for his great wisdom and advice.`0"');
        await io.lln('            `0- `2Dedicated by Joseph Masters, 9/25/95');
        await io.sln();
        await io.sln();
        await io.lln('`2This appears to be some kind of Lottery Machine...');

        // Check if already played today
        if (this.record.day === state.days) {
            await io.sln();
            await io.lln('`2You already tried your luck today!');
            await io.lln('`2Come back tomorrow.');
            await this.pressAKey();
            this.file.close();
            return;
        }

        // Check if player can afford ticket
        const cost = 10 * player.level;
        if (player.gold < cost) {
            await io.lln('`2However, you don\'t seem to have the kind of money you need to use the machine!');
            await this.pressAKey();
            this.file.close();
            return;
        }

        // Ask if player wants to play
        await io.lw('`2  Try it out? [`5Y`2]:`% ');
        io.emitPrompt('lotto_play', [{ key: 'Y', label: 'Yes' }, { key: 'N', label: 'No' }]);
        let ch = (await io.getkey()).toUpperCase();
        if (ch !== 'N') ch = 'Y';
        await io.lln(ch);
        await io.sln();

        if (ch === 'N') {
            await io.lln('`2You trudge home, unaware of what you\'ve missed.');
            await this.pressAKey();
            this.file.close();
            return;
        }

        // Mark as played and deduct gold
        this.record.day = state.days;
        this.record.put();
        player.gold -= cost;

        await io.lln('`2You deposit `$' + String(cost) + '`2 gold into the box, and read the directions.');
        await io.sln();
        await io.sln();
        await io.lln('`0"`2Press four numbers to come up with your code.  Then, wait for the machine to come up with its.  If you match one or more numbers, you will win some gold back!`0"');

        // Get player's 4-digit code
        let playerCode: string[] = [];
        let valid = false;
        while (!valid) {
            await io.sln();
            await io.lw('  `2Enter Your Code:`% ');
            io.emitPrompt('lotto_code', [], 'line');
            const tempstr = await io.getstr({ len: 4 });
            await io.sln();
            if (tempstr === '') {
                this.file.close();
                return;
            }
            if (tempstr.length < 4) {
                await io.lln('`2  Too short!');
            } else if (tempstr.length > 4) {
                await io.lln('`2  Too long!');
            } else if (!/^\d+$/.test(tempstr)) {
                await io.lln('`2  Not a number!');
            } else {
                playerCode = tempstr.split('');
                valid = true;
            }
        }

        // Generate machine's 4 random digits
        const machineCode: string[] = [];
        for (let i = 0; i < 4; i++) {
            machineCode.push(String(random(10)));
        }

        // Count matches without caring about position, but never let one player
        // digit satisfy more than one machine digit.
        const used = [false, false, false, false];
        let matched = 0;
        for (let l = 0; l < 4; l++) {
            let match = false;
            let w = -1;
            while (!match && w < 3) {
                w++;
                if (machineCode[l] === playerCode[w] && !used[w]) {
                    used[w] = true;
                    match = true;
                    matched++;
                }
            }
        }

        const machineStr = machineCode.join('');
        await io.lln('`2Machine\'s Code :`% ' + machineStr);
        await io.sln();

        if (matched < 1) {
            await io.lln('`2You didn\'t match any numbers!');
            await io.sln();
            await io.lln('`2Try again tomorrow!');
            await this.pressAKey();
        } else {
            await io.lln('`2You matched ' + String(matched) + '`2 numbers!');
            await io.sln();
            if (matched > 3) {
                await io.lln('`2You hit the jackpot!');
            } else {
                await io.lln('`2You almost hit the jackpot!');
            }
            await io.sln();

            // Prize formula is kept as a literal port from the Pascal IGM so
            // high-level payouts scale exactly like the original machine.
            let magicnum = (player.level % 2 !== 0) ? 10 : 30;
            if (player.level === 12) magicnum = 20;
            const loopCount = Math.floor(player.level / 2) + 2; // for num := -1 to (level DIV 2)
            for (let i = 0; i < loopCount; i++) {
                magicnum *= 10;
            }
            if (matched < 4) magicnum = Math.floor(magicnum / 10);
            if (matched < 3) magicnum = Math.floor(magicnum / 10);
            if (matched < 2) magicnum = Math.floor(magicnum / 10);

            await io.lln('`2  You win `$' + String(magicnum) + ' `2gold!');
            if (player.gold + magicnum > 0) {
                player.gold += magicnum;
            }
            await this.pressAKey();
        }

        player.put();
        this.file.close();
    }

    // ─── Record Management ──────────────────────────────────────────────────

    private get file(): IRecordFile {
        if (!this.lottoFile) throw new Error('Lotto file not initialized');
        return this.lottoFile;
    }

    private get record(): LottoRecord {
        if (!this.lottoRecord) throw new Error('Lotto record not initialized');
        return this.lottoRecord;
    }

    private initRecord(): void {
        this.lottoFile = this.deps.storage.create(
            this.igmDataDir + 'lotto.dat', Lotto_Defs
        );

        // lotto.dat holds one row per LORD player. Scan for the caller's record
        // number and create it lazily the first time they ever play.
        let found = false;
        for (let i = 0; i < this.file.length; i++) {
            const rec = this.file.get(i) as unknown as LottoRecord;
            if (rec.lrdrecord === this.deps.player.Record) {
                this.lottoRecord = rec;
                found = true;
                break;
            }
        }

        if (!found) {
            this.lottoRecord = this.file.new() as unknown as LottoRecord;
            this.lottoRecord.lrdrecord = this.deps.player.Record;
            this.lottoRecord.day = -1;
            this.lottoRecord.put();
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private async pressAKey(): Promise<void> {
        const { io } = this.deps;
        await io.lw('  `0<`2MORE`0>');
        io.emitPrompt('continue', [{ key: '\r', label: 'Continue' }]);
        await io.getkey();
        await io.lln('');
    }
}

export { Lotto };
export default Lotto;
