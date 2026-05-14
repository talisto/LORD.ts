/**
 * State - Shared game state record for LORD.
 *
 * Loads and persists the single state.dat / state table record that holds
 * server-wide values: the current day, the round winner, the NPC marriage
 * flags (Seth, Violet), and miscellaneous day-counter fields.
 */
import { State_Def } from '@lordts/storage/RecordDefs';
import Lazy from '@lordts/util/Lazy';
import type { IStorage } from '@lordts/storage/IStorage';
import type Player from './Player';

interface StateRecord {
    put(): void;
    [key: string]: unknown;
}

class State {
    private _record: StateRecord | null;
    private _put: ((leaveLocked?: boolean) => void) | null;

    // State record fields (from State_Def)
    days: number = 0;
    won_by: number = -1;
    log_date: number = 0;
    married_to_seth: number = -1;
    married_to_violet: number = -1;
    latesthero: string = 'Master Turgon';
    last_bar: number = 0;
    forest_gold: number = 100;
    res_days?: number;  // Legacy field accessed from state (not in State_Def)
    [key: string]: unknown;

    constructor(
        public whitelist: string[],
        private _player: Lazy<Player | null>,
        private _storage: Lazy<IStorage>,
    ) {
        this._record = null;
        this._put = null;
    }

    get player(): Player | null {
        return this._player.value;
    }

    get storage(): IStorage {
        return this._storage.value;
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async required: callers await this
    async getState(_lock: boolean): Promise<void> {
        const record = this.storage.getState() as StateRecord;

        // Copy state record properties onto this instance so callers
        // can read e.g. state.days, state.won_by directly.
        this._record = record;
        for (const def of State_Def) {
            this[def.prop] = record[def.prop];
        }
        // Preserve the put() method from the record
        this._put = record.put ? record.put.bind(record) : null;
    }

    putState(leaveLocked?: boolean): void {
        // Sync any modified properties back to the record before writing
        if (this._record) {
            for (const def of State_Def) {
                this._record[def.prop] = this[def.prop];
            }
        }
        if (this._put) {
            this._put(leaveLocked);
        }

    }
}

export default State;
