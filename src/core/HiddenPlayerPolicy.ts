/**
 * HiddenPlayerPolicy - Hidden player list management for LORD.
 *
 * Controls which player records are suppressed from the rankings, the
 * online player list, and the web leaderboard. Hidden status and the
 * reason for hiding are persisted in the config store.
 */
import type { IStorage } from '@lordts/storage/IStorage';
import type { LoadedPlayerRecord } from './types';

interface HiddenPlayerEntry {
    /** Game day when the player was hidden; useful for audit and restore flows. */
    hidden_since_day: number;
    /** Why the player is hidden (inactive cleanup, admin action, etc.). */
    reason: string;
}

type HiddenPlayersConfig = Record<string, HiddenPlayerEntry>;

export class HiddenPlayerPolicy {
    private static readonly CONFIG_NAME = 'hidden_players';

    static isPlayerHidden(storage: IStorage, playerRecord: number): boolean {
        if (!Number.isInteger(playerRecord) || playerRecord < 0) {
            return false;
        }

        const hiddenPlayers = this.loadHiddenPlayers(storage);
        return hiddenPlayers[String(playerRecord)] !== undefined;
    }

    static hidePlayer(storage: IStorage, playerRecord: number, hiddenSinceDay: number, reason: string): void {
        if (!Number.isInteger(playerRecord) || playerRecord < 0) {
            return;
        }

        const hiddenPlayers = this.loadHiddenPlayers(storage);
        hiddenPlayers[String(playerRecord)] = {
            hidden_since_day: hiddenSinceDay,
            reason,
        };
        storage.setConfig(this.CONFIG_NAME, hiddenPlayers);
    }

    static unhidePlayer(storage: IStorage, playerRecord: number): void {
        if (!Number.isInteger(playerRecord) || playerRecord < 0) {
            return;
        }

        const hiddenPlayers = this.loadHiddenPlayers(storage);
        delete hiddenPlayers[String(playerRecord)];

        if (Object.keys(hiddenPlayers).length === 0) {
            storage.deleteConfig(this.CONFIG_NAME);
            return;
        }

        storage.setConfig(this.CONFIG_NAME, hiddenPlayers);
    }

    static isVisiblePlayer(storage: IStorage, player: Pick<LoadedPlayerRecord, 'Record' | 'name'>): boolean {
        // Dummy records use name 'X'. Treat them the same as hidden players so
        // rankings and online lists only show real, active characters.
        return player.name !== 'X' && !this.isPlayerHidden(storage, player.Record);
    }

    private static loadHiddenPlayers(storage: IStorage): HiddenPlayersConfig {
        const raw = storage.getConfig(this.CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }

        const hiddenPlayers: HiddenPlayersConfig = {};
        for (const [recordKey, value] of Object.entries(raw as Record<string, unknown>)) {
            // Config is user-editable and persisted across versions. Skip any
            // malformed entries instead of throwing so one bad record does not
            // make the entire hidden-player list unreadable.
            const playerRecord = Number.parseInt(recordKey, 10);
            if (!Number.isInteger(playerRecord) || playerRecord < 0) {
                continue;
            }
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                continue;
            }

            const hiddenSinceDay = (value as HiddenPlayerEntry).hidden_since_day;
            const reason = (value as HiddenPlayerEntry).reason;
            if (!Number.isInteger(hiddenSinceDay) || hiddenSinceDay < 0 || typeof reason !== 'string' || reason.length === 0) {
                continue;
            }

            hiddenPlayers[String(playerRecord)] = {
                hidden_since_day: hiddenSinceDay,
                reason,
            };
        }

        return hiddenPlayers;
    }
}