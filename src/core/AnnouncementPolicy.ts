/**
 * AnnouncementPolicy - Public announcement rate limiter for LORD.
 *
 * Enforces per-player and total daily caps on Red Dragon Inn announcements.
 * Usage counts are persisted in the config store keyed by day and pruned
 * automatically when the day rolls over.
 */
import type { IStorage } from '@lordts/storage/IStorage';

interface AnnouncementDayUsage {
    total: number;
    perPlayer: Record<string, number>;
}

type AnnouncementUsageConfig = Record<string, AnnouncementDayUsage>;

export class AnnouncementPolicy {
    private static readonly CONFIG_NAME = 'announcement_usage';

    static canPlayerAnnounce(
        storage: IStorage,
        day: number,
        playerRecord: number,
        maxPerPlayerPerDay: number,
        maxTotalPerDay: number,
    ): 'ok' | 'per-player' | 'total' {
        const usage = this.getDayUsage(storage, day);
        const playerCount = usage.perPlayer[String(playerRecord)] ?? 0;

        if (maxTotalPerDay > 0 && usage.total >= maxTotalPerDay) {
            return 'total';
        }
        if (maxPerPlayerPerDay > 0 && playerCount >= maxPerPlayerPerDay) {
            return 'per-player';
        }
        return 'ok';
    }

    static recordAnnouncement(storage: IStorage, day: number, playerRecord: number): void {
        const usage = this.getDayUsage(storage, day);
        const playerKey = String(playerRecord);

        usage.total += 1;
        usage.perPlayer[playerKey] = (usage.perPlayer[playerKey] ?? 0) + 1;

        storage.setConfig(this.CONFIG_NAME, {
            [String(day)]: usage,
        });
    }

    private static getDayUsage(storage: IStorage, day: number): AnnouncementDayUsage {
        const raw = storage.getConfig(this.CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { total: 0, perPlayer: {} };
        }

        const dayUsage = (raw as AnnouncementUsageConfig)[String(day)];
        if (!dayUsage || typeof dayUsage !== 'object' || Array.isArray(dayUsage)) {
            return { total: 0, perPlayer: {} };
        }

        const total = typeof dayUsage.total === 'number' && Number.isInteger(dayUsage.total) && dayUsage.total > 0
            ? dayUsage.total
            : 0;
        const perPlayer = this.normalizePerPlayerUsage(dayUsage.perPlayer);

        return { total, perPlayer };
    }

    private static normalizePerPlayerUsage(perPlayer: unknown): Record<string, number> {
        if (!perPlayer || typeof perPlayer !== 'object' || Array.isArray(perPlayer)) {
            return {};
        }

        const normalized: Record<string, number> = {};
        for (const [playerRecord, count] of Object.entries(perPlayer as Record<string, unknown>)) {
            const normalizedRecord = Number.parseInt(playerRecord, 10);
            if (!Number.isInteger(normalizedRecord) || normalizedRecord < 0) {
                continue;
            }
            if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
                continue;
            }
            normalized[String(normalizedRecord)] = count;
        }

        return normalized;
    }
}