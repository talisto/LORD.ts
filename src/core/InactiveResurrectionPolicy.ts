/**
 * InactiveResurrectionPolicy - Automatic resurrection of inactive dead players.
 *
 * Identifies dead characters who have been offline long enough to qualify
 * for resurrection and either revives them immediately or schedules the
 * revival for a later day, depending on the configured resurrection mode.
 */
import { random } from '@lordts/util/Util';
import type { IStorage } from '@lordts/storage/IStorage';
import type { LoadedPlayerRecord, Settings } from './types';

interface ScheduledResurrectionEntry {
    day: number;
    dueAt: number;
}

type ScheduledResurrectionsConfig = Record<string, ScheduledResurrectionEntry>;

export class InactiveResurrectionPolicy {
    private static readonly CONFIG_NAME = 'scheduled_resurrections';

    static isEligibleInactiveDeadPlayer(
        player: Pick<LoadedPlayerRecord, 'on_now' | 'time' | 'last_reincarnated' | 'dead' | 'gone'>,
        currentDay: number,
        resDays: number,
    ): boolean {
        // Conditions: game is past early grace period (day 3), player is offline,
        // hasn't played in 2+ days, wasn't already auto-resurrected recently,
        // is dead, and hasn't exceeded the max auto-resurrection count (gone)
        return (
            currentDay > 3
            && !player.on_now
            && player.time < (currentDay - 2)
            && player.last_reincarnated < (currentDay - 2)
            && player.dead
            && player.gone < resDays
        );
    }

    static resurrectImmediately(player: LoadedPlayerRecord, currentDay: number, resDays: number): boolean {
        if (!this.isEligibleInactiveDeadPlayer(player, currentDay, resDays)) {
            return false;
        }

        player.dead = false;
        player.inn = false;
        player.last_reincarnated = currentDay;
        // Increment resurrection count; stops future auto-res once gone >= resDays
        if (resDays > 0) {
            player.gone += 1;
        }
        player.divorced = false;
        player.put();
        return true;
    }

    static scheduleResurrections(
        storage: IStorage,
        playerRecords: number[],
        currentDay: number,
        settings: Pick<Settings, 'inactive_resurrection_spread_minutes' | 'timezone'>,
        now: Date = new Date(),
        randomInt: (max: number) => number = random,
    ): void {
        const spreadSeconds = this.resolveSpreadSeconds(settings.inactive_resurrection_spread_minutes);
        if (spreadSeconds <= 0 || playerRecords.length === 0) {
            this.clearScheduledResurrections(storage);
            return;
        }

        const uniqueRecords = [...new Set(playerRecords)].filter((playerRecord) => (
            Number.isInteger(playerRecord) && playerRecord >= 0
        ));
        if (uniqueRecords.length === 0) {
            this.clearScheduledResurrections(storage);
            return;
        }

        const dayStart = this.resolveWindowStartUnix(now, settings.timezone);
        const scheduled: ScheduledResurrectionsConfig = {};

        for (const playerRecord of uniqueRecords) {
            const offset = spreadSeconds <= 1 ? 0 : randomInt(spreadSeconds);
            scheduled[String(playerRecord)] = {
                day: currentDay,
                dueAt: dayStart + offset,
            };
        }

        storage.setConfig(this.CONFIG_NAME, scheduled);
    }

    static applyDueResurrections(
        storage: IStorage,
        settings: Pick<Settings, 'res_days'>,
        now: Date = new Date(),
        specificRecord?: number,
        currentDay?: number,
    ): string[] {
        const scheduled = this.loadScheduledResurrections(storage);
        if (Object.keys(scheduled).length === 0) {
            return [];
        }

        const day = currentDay ?? this.resolveCurrentDay(storage);
        const dueAt = Math.floor(now.getTime() / 1000);
        const remaining: ScheduledResurrectionsConfig = {};
        const resurrected: string[] = [];
        const resDays = typeof settings.res_days === 'number' ? settings.res_days : 0;

        for (const [recordKey, entry] of Object.entries(scheduled)) {
            const playerRecord = Number.parseInt(recordKey, 10);
            if (!Number.isInteger(playerRecord) || playerRecord < 0) {
                continue;
            }
            if (specificRecord !== undefined && playerRecord !== specificRecord) {
                remaining[recordKey] = entry;
                continue;
            }
            if (entry.day > day || entry.dueAt > dueAt) {
                remaining[recordKey] = entry;
                continue;
            }

            const player = storage.getPlayer(playerRecord) as LoadedPlayerRecord | null;
            if (!player || player.name === 'X') {
                continue;
            }

            if (this.resurrectImmediately(player, day, resDays)) {
                resurrected.push(player.name);
            }
        }

        if (Object.keys(remaining).length === 0) {
            storage.deleteConfig(this.CONFIG_NAME);
        } else {
            storage.setConfig(this.CONFIG_NAME, remaining);
        }

        return resurrected;
    }

    static clearScheduledResurrections(storage: IStorage): void {
        storage.deleteConfig(this.CONFIG_NAME);
    }

    private static resolveCurrentDay(storage: IStorage): number {
        const state = storage.getState();
        return typeof state.days === 'number' ? state.days : 0;
    }

    private static loadScheduledResurrections(storage: IStorage): ScheduledResurrectionsConfig {
        const raw = storage.getConfig(this.CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }

        const normalized: ScheduledResurrectionsConfig = {};
        for (const [recordKey, value] of Object.entries(raw as Record<string, unknown>)) {
            const playerRecord = Number.parseInt(recordKey, 10);
            if (!Number.isInteger(playerRecord) || playerRecord < 0) {
                continue;
            }
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                continue;
            }

            const day = (value as ScheduledResurrectionEntry).day;
            const dueAt = (value as ScheduledResurrectionEntry).dueAt;
            if (!Number.isInteger(day) || day < 0 || !Number.isInteger(dueAt) || dueAt < 0) {
                continue;
            }

            normalized[String(playerRecord)] = { day, dueAt };
        }

        return normalized;
    }

    private static resolveSpreadSeconds(spreadMinutes: unknown): number {
        if (typeof spreadMinutes !== 'number' || isNaN(spreadMinutes) || spreadMinutes <= 0) {
            return 0;
        }

        return Math.max(0, Math.floor(spreadMinutes * 60));
    }

    private static resolveWindowStartUnix(now: Date, timezone?: string): number {
        if (!timezone) {
            const localMidnight = new Date(now);
            localMidnight.setHours(0, 0, 0, 0);
            return Math.floor(localMidnight.getTime() / 1000);
        }

        return Math.floor(now.getTime() / 1000) - this.resolveSecondsSinceMidnight(now, timezone);
    }

    private static resolveSecondsSinceMidnight(now: Date, timezone: string): number {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const values: Record<string, string> = {};
        for (const part of parts) {
            if (part.type !== 'literal') {
                values[part.type] = part.value;
            }
        }

        const hour = Number.parseInt(values.hour || '0', 10);
        const minute = Number.parseInt(values.minute || '0', 10);
        const second = Number.parseInt(values.second || '0', 10);
        return hour * 3600 + minute * 60 + second;
    }
}