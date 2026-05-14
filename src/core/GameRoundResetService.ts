/**
 * GameRoundResetService - End-of-round player reset service for LORD.
 *
 * Wipes all player records between game rounds, preserving identity fields
 * (name, sex, class). Records the outgoing round winner in WinnerHistory
 * before clearing the state record and resetting the day counter.
 */
import * as fs from 'fs';
import * as path from 'path';
import { backfillWinner } from './WinnerHistory';
import { createStorageOnly } from '@lordts/storage/PersistenceFactory';
import type { IStorage } from '@lordts/storage/IStorage';
import { Player_Def, State_Def } from '@lordts/storage/RecordDefs';
import { loadSettings } from '@lordts/util/Settings';

interface GameRoundResetResult {
    hadStateRecord: boolean;
    previousWinner: number | null;
    resetCount: number;
    skippedCount: number;
    notificationFlagRemoved: boolean;
    notificationFlagPath: string;
}

type GameRoundResetOptions = {
    storage?: IStorage;
    notificationFlagPath?: string;
};

export class GameRoundResetService {
    // Preserve identity only. Everything else is wiped so each round starts as
    // a fresh contest while names, sex, and class remain recognizable.
    private static readonly KEEP_FIELDS = new Set(['name', 'real_name', 'sex', 'clss']);

    static reset(basePath: string, options: GameRoundResetOptions = {}): GameRoundResetResult {
        const ownsStorage = options.storage === undefined;
        const settings = loadSettings(path.join(basePath, 'data'));
        const storage = options.storage ?? createStorageOnly({ settings, projectRoot: basePath });
        const notificationFlagPath = options.notificationFlagPath
            ?? path.join(path.resolve(basePath, settings.runtime_dir ?? 'runtime'), 'gameover_notified');

        let hadStateRecord = false;
        let previousWinner: number | null = null;
        let previousRoundDays = 0;
        let resetCount = 0;
        let skippedCount = 0;
        let notificationFlagRemoved = false;

        try {
            const stateFile = storage.create('state', State_Def);
            if (stateFile.length > 0) {
                const stateRec = stateFile.get(0);
                if (stateRec) {
                    // Clear the winner/day/marriage markers before touching the
                    // players so a partially reset round cannot linger in state.
                    hadStateRecord = true;
                    previousWinner = stateRec.won_by as number;
                    previousRoundDays = stateRec.days as number;
                    stateRec.won_by = -1;
                    stateRec.days = 0;
                    stateRec.married_to_seth = -1;
                    stateRec.married_to_violet = -1;
                    stateRec.put();
                }
            }

            const playerFile = storage.create('players', Player_Def);
            if (previousWinner !== null && previousWinner >= 0 && previousWinner < playerFile.length) {
                const winner = playerFile.get(previousWinner);
                if (winner && typeof winner.name === 'string' && winner.name !== 'X') {
                    backfillWinner(storage, {
                        Record: previousWinner,
                        real_name: typeof winner.real_name === 'string' ? winner.real_name : '',
                        name: winner.name,
                        level: typeof winner.level === 'number' ? winner.level : 0,
                        exp: typeof winner.exp === 'number' ? winner.exp : 0,
                        drag_kills: typeof winner.drag_kills === 'number' ? winner.drag_kills : 0,
                        pvp: typeof winner.pvp === 'number' ? winner.pvp : 0,
                        laid: typeof winner.laid === 'number' ? winner.laid : 0,
                        gold: typeof winner.gold === 'number' ? winner.gold : 0,
                        bank: typeof winner.bank === 'number' ? winner.bank : 0,
                        gem: typeof winner.gem === 'number' ? winner.gem : 0,
                        clss: typeof winner.clss === 'number' ? winner.clss : 0,
                        sex: typeof winner.sex === 'string' ? winner.sex : '',
                    }, {
                        winType: 'reset_backfill',
                        roundDays: previousRoundDays,
                    });
                }
            }

            for (let i = 0; i < playerFile.length; i++) {
                const rec = playerFile.get(i);
                if (!rec) {
                    continue;
                }
                const playerName = rec.name as string;
                if (!playerName || playerName === 'X') {
                    skippedCount += 1;
                    continue;
                }

                const savedFields: Record<string, unknown> = {};
                for (const field of this.KEEP_FIELDS) {
                    savedFields[field] = rec[field];
                }

                rec.reInit();
                for (const field of this.KEEP_FIELDS) {
                    rec[field] = savedFields[field];
                }
                // Force every surviving player offline so a new round never
                // inherits stale session presence from the previous one.
                rec.on_now = false;
                rec.last_on_unix = 0;
                rec.put();
                resetCount += 1;
            }

            if (fs.existsSync(notificationFlagPath)) {
                fs.unlinkSync(notificationFlagPath);
                notificationFlagRemoved = true;
            }

            return {
                hadStateRecord,
                previousWinner,
                resetCount,
                skippedCount,
                notificationFlagRemoved,
                notificationFlagPath,
            };
        } finally {
            if (ownsStorage) {
                storage.close();
            }
        }
    }
}