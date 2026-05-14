/**
 * BankTransferAmountPolicy - Daily bank transfer cap enforcement for LORD.
 *
 * Tracks the cumulative gold transferred from bank to hand per player per
 * day and enforces the configurable `bank_transfer_daily_cap` setting.
 * Usage is persisted in the config store and pruned when the day changes.
 */
import type { IStorage } from '@lordts/storage/IStorage';

type BankTransferAmountUsageConfig = Record<string, Record<string, number>>;

export class BankTransferAmountPolicy {
    private static readonly CONFIG_NAME = 'bank_transfer_amount_usage';

    static canTransfer(
        storage: IStorage,
        day: number,
        playerRecord: number,
        amount: number,
        dailyCap: number,
    ): { allowed: boolean; remaining: number } {
        const normalizedCap = Math.max(0, Math.trunc(dailyCap));

        if (normalizedCap < 1) {
            return { allowed: true, remaining: 0 };
        }

        const used = this.getTransferredAmount(storage, day, playerRecord);
        const remaining = Math.max(0, normalizedCap - used);

        return {
            allowed: Math.max(0, Math.trunc(amount)) <= remaining,
            remaining,
        };
    }

    static getTransferredAmount(storage: IStorage, day: number, playerRecord: number): number {
        const dayUsage = this.getAllUsage(storage)[this.normalizeKey(day)];

        if (!dayUsage) {
            return 0;
        }

        return dayUsage[this.normalizeKey(playerRecord)] ?? 0;
    }

    static recordTransfer(storage: IStorage, day: number, playerRecord: number, amount: number): void {
        const normalizedAmount = Math.max(0, Math.trunc(amount));

        if (normalizedAmount < 1) {
            return;
        }

        const allUsage = this.getAllUsage(storage);
        const dayKey = this.normalizeKey(day);
        const playerKey = this.normalizeKey(playerRecord);
        const dayUsage = allUsage[dayKey] ?? {};

        dayUsage[playerKey] = (dayUsage[playerKey] ?? 0) + normalizedAmount;
        allUsage[dayKey] = dayUsage;

        storage.setConfig(this.CONFIG_NAME, allUsage);
    }

    static resetPlayerUsage(storage: IStorage, day: number, playerRecord: number): void {
        const allUsage = this.getAllUsage(storage);
        const dayKey = this.normalizeKey(day);
        const playerKey = this.normalizeKey(playerRecord);
        const dayUsage = allUsage[dayKey];

        if (!dayUsage || !(playerKey in dayUsage)) {
            return;
        }

        delete dayUsage[playerKey];
        if (Object.keys(dayUsage).length > 0) {
            allUsage[dayKey] = dayUsage;
        } else {
            delete allUsage[dayKey];
        }

        if (Object.keys(allUsage).length > 0) {
            storage.setConfig(this.CONFIG_NAME, allUsage);
        } else {
            storage.deleteConfig(this.CONFIG_NAME);
        }
    }

    private static getAllUsage(storage: IStorage): BankTransferAmountUsageConfig {
        const raw = storage.getConfig(this.CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }

        const normalized: BankTransferAmountUsageConfig = {};

        for (const [dayKey, dayUsage] of Object.entries(raw as Record<string, unknown>)) {
            const normalizedDay = this.normalizeUsageRecord(dayUsage);
            if (Object.keys(normalizedDay).length > 0) {
                normalized[this.normalizeKey(Number.parseInt(dayKey, 10))] = normalizedDay;
            }
        }

        return normalized;
    }

    private static normalizeUsageRecord(dayUsage: unknown): Record<string, number> {
        if (!dayUsage || typeof dayUsage !== 'object' || Array.isArray(dayUsage)) {
            return {};
        }

        const normalized: Record<string, number> = {};
        for (const [playerKey, amount] of Object.entries(dayUsage as Record<string, unknown>)) {
            const normalizedPlayer = Number.parseInt(playerKey, 10);
            if (!Number.isInteger(normalizedPlayer) || normalizedPlayer < 0) {
                continue;
            }
            if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
                continue;
            }
            normalized[this.normalizeKey(normalizedPlayer)] = amount;
        }

        return normalized;
    }

    private static normalizeKey(value: number): string {
        if (!Number.isInteger(value) || value < 0) {
            return '0';
        }

        return String(value);
    }
}