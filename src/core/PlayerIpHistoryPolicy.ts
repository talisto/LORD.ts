/**
 * PlayerIpHistoryPolicy - Player IP address history tracking for LORD.
 *
 * Records each player's login IP addresses and detects shared-IP situations
 * where multiple accounts log in from the same address within a configurable
 * look-back window, used to enforce the shared-IP restriction setting.
 */
import { isIP } from 'net';
import type { IStorage } from '@lordts/storage/IStorage';
import type { Settings } from './types';

interface PlayerIpHistoryEntry {
    ip: string;
    day: number;
}

type PlayerIpHistoryConfig = Record<string, PlayerIpHistoryEntry[]>;

export class PlayerIpHistoryPolicy {
    private static readonly CONFIG_NAME = 'player_ip_history';

    static recordPlayerIp(
        storage: IStorage,
        currentDay: number,
        playerRecord: number,
        ip: string,
        settings: Pick<Settings, 'shared_ip_ignore_private_addresses' | 'shared_ip_restriction_days'>,
    ): void {
        if (this.getRestrictionWindow(settings) < 1) {
            return;
        }

        const normalizedIp = this.normalizeIp(ip);
        if (!normalizedIp || !this.shouldTrackIp(normalizedIp, settings)) {
            return;
        }

        const { history } = this.loadHistory(storage, currentDay, settings);
        const playerKey = this.normalizeKey(playerRecord);
        const entries = (history[playerKey] ?? []).filter((entry) => entry.ip !== normalizedIp);

        entries.push({ ip: normalizedIp, day: this.normalizeDay(currentDay) });
        history[playerKey] = entries;

        this.saveHistory(storage, history);
    }

    static havePlayersSharedRecentIp(
        storage: IStorage,
        currentDay: number,
        recordA: number,
        recordB: number,
        settings: Pick<Settings, 'shared_ip_ignore_private_addresses' | 'shared_ip_restriction_days'>,
    ): boolean {
        if (this.getRestrictionWindow(settings) < 1 || recordA === recordB) {
            return false;
        }

        const { history, mutated } = this.loadHistory(storage, currentDay, settings);
        if (mutated) {
            this.saveHistory(storage, history);
        }

        const recordBIps = new Set((history[this.normalizeKey(recordB)] ?? []).map((entry) => entry.ip));

        return (history[this.normalizeKey(recordA)] ?? []).some((entry) => recordBIps.has(entry.ip));
    }

    private static loadHistory(
        storage: IStorage,
        currentDay: number,
        settings: Pick<Settings, 'shared_ip_ignore_private_addresses' | 'shared_ip_restriction_days'>,
    ): { history: PlayerIpHistoryConfig; mutated: boolean } {
        const raw = storage.getConfig(this.CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { history: {}, mutated: false };
        }

        const history: PlayerIpHistoryConfig = {};
        let mutated = false;

        for (const [playerKey, entries] of Object.entries(raw as Record<string, unknown>)) {
            const normalizedPlayerRecord = Number.parseInt(playerKey, 10);
            if (!Number.isInteger(normalizedPlayerRecord) || normalizedPlayerRecord < 0) {
                mutated = true;
                continue;
            }

            const normalizedEntries = this.normalizeEntries(entries, currentDay, settings);
            if (normalizedEntries.length > 0) {
                history[this.normalizeKey(normalizedPlayerRecord)] = normalizedEntries;
            } else if (Array.isArray(entries) && entries.length > 0) {
                mutated = true;
            }
        }

        return { history, mutated };
    }

    private static normalizeEntries(
        entries: unknown,
        currentDay: number,
        settings: Pick<Settings, 'shared_ip_ignore_private_addresses' | 'shared_ip_restriction_days'>,
    ): PlayerIpHistoryEntry[] {
        if (!Array.isArray(entries)) {
            return [];
        }

        const cutoffDay = this.normalizeDay(currentDay) - this.getRestrictionWindow(settings);
        const normalized = new Map<string, PlayerIpHistoryEntry>();

        for (const entry of entries) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                continue;
            }

            const ip = this.normalizeIp((entry as Record<string, unknown>)['ip']);
            const day = this.normalizeDay((entry as Record<string, unknown>)['day']);
            if (!ip || day < cutoffDay || !this.shouldTrackIp(ip, settings)) {
                continue;
            }

            const existing = normalized.get(ip);
            if (!existing || existing.day < day) {
                normalized.set(ip, { ip, day });
            }
        }

        return Array.from(normalized.values());
    }

    private static saveHistory(storage: IStorage, history: PlayerIpHistoryConfig): void {
        if (Object.keys(history).length > 0) {
            storage.setConfig(this.CONFIG_NAME, history);
        } else {
            storage.deleteConfig(this.CONFIG_NAME);
        }
    }

    private static shouldTrackIp(
        ip: string,
        settings: Pick<Settings, 'shared_ip_ignore_private_addresses'>,
    ): boolean {
        if (settings.shared_ip_ignore_private_addresses !== true) {
            return true;
        }

        return !this.isPrivateIp(ip);
    }

    private static isPrivateIp(ip: string): boolean {
        const lowerIp = ip.toLowerCase();
        // Strip IPv4-mapped IPv6 prefix to check the underlying v4 address
        if (lowerIp.startsWith('::ffff:')) {
            return this.isPrivateIp(lowerIp.slice(7));
        }

        if (lowerIp === '::1' || lowerIp.startsWith('fc') || lowerIp.startsWith('fd') || lowerIp.startsWith('fe80:')) {
            return true;
        }

        const octets = lowerIp.split('.').map((part) => Number.parseInt(part, 10));
        if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
            const [first, second] = octets;
            return first === 10
                || first === 127
                || (first === 172 && second >= 16 && second <= 31)
                || (first === 192 && second === 168)
                || (first === 169 && second === 254);
        }

        return false;
    }

    private static getRestrictionWindow(
        settings: Pick<Settings, 'shared_ip_restriction_days'>,
    ): number {
        return Math.max(0, Math.trunc(settings.shared_ip_restriction_days || 0));
    }

    private static normalizeIp(ip: unknown): string | undefined {
        if (typeof ip !== 'string') {
            return undefined;
        }

        const normalized = ip.trim();
        return isIP(normalized) > 0 ? normalized : undefined;
    }

    private static normalizeDay(day: unknown): number {
        return typeof day === 'number' && Number.isInteger(day) && day >= 0 ? day : 0;
    }

    private static normalizeKey(record: number): string {
        return String(this.normalizeDay(record));
    }
}