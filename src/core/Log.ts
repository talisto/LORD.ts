/**
 * Log - Daily event log for LORD.
 *
 * Records notable in-game events each day (kills, deaths, marriages,
 * announcements, etc.) that other players can read at the Red Dragon Inn.
 * Maintains a rolling current/previous log pair and trims entries when the
 * log grows too long.
 */
import { random } from '@lordts/util/Util';
import type FileUtils from '@lordts/util/FileUtils';
import Lazy from '@lordts/util/Lazy';
import type { UiMode } from './types';
import type IO from './io/IO';
import type State from './State';
import type { Settings } from './types';
import type { IStorage } from '@lordts/storage/IStorage';
import type DailyMaint from './DailyMaint';

class Log {
    constructor(
        public io: IO,
        private _uiMode: UiMode,
        public fileUtils: FileUtils,
        private settings: Settings,
        private _dailyMaint: Lazy<DailyMaint>,
        private _state: Lazy<State>,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get rip(): boolean { return this._uiMode.mode === 'rip'; }
    get modern(): boolean { return this._uiMode.mode === 'modern'; }

    get dailyMaint(): DailyMaint {
        return this._dailyMaint.value;
    }

    get state(): State {
        return this._state.value;
    }

    get storage(): IStorage {
        return this._storage.value;
    }

    // ── Log operations ────────────────────────────────────────────────

    async createLog(_havelock: boolean): Promise<void> {
        const now = new Date();
        // Needs to be unique for each calendar day. Use configured timezone
        // (IANA name) when present so day-boundaries match the sysop's setting.
        let y: number;
        let mzero: number;
        let d: number;
        if (this.settings && this.settings.timezone) {
            const fmt = new Intl.DateTimeFormat('en-US', { timeZone: this.settings.timezone, year: 'numeric', month: 'numeric', day: 'numeric' });
            const parts = fmt.formatToParts(now);
            const partMap: Record<string, string> = {};
            for (const p of parts) {
                if (p.type && p.value) partMap[p.type] = p.value;
            }
            y = parseInt(partMap.year || String(now.getFullYear()), 10);
            // formatToParts month is 1-12; convert to zero-based to match Date.getMonth()
            mzero = parseInt(partMap.month || String(now.getMonth() + 1), 10) - 1;
            d = parseInt(partMap.day || String(now.getDate()), 10);
        } else {
            y = now.getFullYear();
            mzero = now.getMonth();
            d = now.getDate();
        }
        const tday = y * 366 + mzero * 31 + d;
        const happenings: string[] = [
            "`4  A Child was found today!  But scared deaf and dumb.",
            "`4  More children are missing today.",
            "`4  A small girl was missing today.",
            "`4  The town is in grief.  Several children didn't come home today.",
            "`4  Dragon sighting reported today by a drunken old man.",
            "`4  Despair covers the land - more bloody remains have been found today.",
            "`4  A group of children did not return from a nature walk today.",
            "`4  The land is in chaos today.  Will the abductions ever stop?",
            "`4  Dragon scales have been found in the forest today..Old or new?",
            "`4  Several farmers report missing cattle today.",
        ];

        await this.state.getState(true);
        if (this.storage.getLogCount('today') > 0) {
            if (this.state.log_date !== tday) {
                this.storage.rotateLogs();
            } else {
                this.state.putState();
                return;
            }
        } else {
            this.state.putState();
        }
        this.storage.appendLog('today', "`2  The Daily Happenings....");
        this.storage.appendLog('today', '`l');
        this.storage.appendLog('today', happenings[random(happenings.length)]);
        this.storage.appendLog('today', "`>`.`2-`0=`2-`0=`2-`0=`2-");
        this.state.log_date = tday;
        // IGM maintenance hooks not implemented (not implemented in original SBBS port either).
        await this.dailyMaint.runDailyMaint();
        this.state.putState();
    }

    async logLine(text: string): Promise<void> {
        const indented = text.split('\n').map(line => '  ' + line).join('\n');
        if (this.storage.getLogCount('today') === 0) {
            await this.createLog(true);
        }
        this.storage.appendLog('today', indented);
        this.storage.appendLog('today', "`>`.`2-`0=`2-`0=`2-`0=`2-");
    }

    private async _displayLog(today: boolean): Promise<void> {
        const which = today ? 'today' : 'yesterday';
        const lines = this.storage.getLogLines(which);
        if (lines.length > 0) {
            await this.io.showBuffer(lines.join('\n'), false, false);
        }
    }

    async showLog(): Promise<void> {
        let ch: string;
        await this.createLog(false);

        do {
            if (this.rip) await this.io.showRip("W2");
            this.io.sclrscr();
            await this.io.sln();
            await this.io.sln();
            await this._displayLog(true);
            do {
                await this.io.sln();
                this.io.foreground(2);
                if (this.rip) await this.io.lw("Make a choice : ", 2);
                else if (!this.modern) await this.io.lw("`2(`5C`2)ontinue   (`5T`2)odays happenings again  (`5Y`2)esterdays `0[`5C`0] : ", 2);
                this.io.emitPrompt('daily_news', [
                    { key: 'C', label: 'Continue' },
                    { key: 'T', label: "Today's News" },
                    { key: 'Y', label: "Yesterday's News" },
                ]);
                ch = (await this.io.getkey()).toUpperCase();
                if ("TY".indexOf(ch) === -1) {
                    ch = "C";
                }
                if (!this.rip && !this.modern) this.io.sw(ch);
                if (ch === "T") {
                    break;
                }
                if (ch === "Y") {
                    if (this.storage.getLogCount('yesterday') === 0) {
                        await this.io.sln();
                        await this.io.sln();
                        await this.io.sln("Apparently nothing of importance happened yesterday.");
                    } else {
                        this.io.sclrscr();
                        await this.io.sln();
                        await this.io.sln();
                        await this._displayLog(false);
                    }
                }
            } while (ch !== "C");
        } while (ch !== "C");
        await this.io.sln();
    }
}

export default Log;
