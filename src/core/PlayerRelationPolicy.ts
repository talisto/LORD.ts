/**
 * PlayerRelationPolicy - Player block list management for LORD.
 *
 * Stores which players have blocked which others from appearing in the
 * online player list. Block relationships are persisted in the config
 * store and resolved by record number.
 */
import type { IStorage } from '@lordts/storage/IStorage';

type PlayerBlocksConfig = Record<string, number[]>;

export class PlayerRelationPolicy {
    private static readonly BLOCKS_CONFIG_NAME = 'player_blocks';

    static isPlayerBlocked(storage: IStorage, blockerRecord: number, blockedRecord: number): boolean {
        if (blockerRecord < 0 || blockedRecord < 0) {
            return false;
        }

        const blocks = this.loadBlocks(storage);
        return (blocks[String(blockerRecord)] ?? []).includes(blockedRecord);
    }

    static setPlayerBlocked(storage: IStorage, blockerRecord: number, blockedRecord: number, blocked: boolean): void {
        if (blockerRecord < 0 || blockedRecord < 0 || blockerRecord === blockedRecord) {
            return;
        }

        const blocks = this.loadBlocks(storage);
        const key = String(blockerRecord);
        const blockedRecords = new Set(blocks[key] ?? []);

        if (blocked) {
            blockedRecords.add(blockedRecord);
        } else {
            blockedRecords.delete(blockedRecord);
        }

        if (blockedRecords.size > 0) {
            blocks[key] = [...blockedRecords].sort((left, right) => left - right);
        } else {
            delete blocks[key];
        }

        if (Object.keys(blocks).length === 0) {
            storage.deleteConfig(this.BLOCKS_CONFIG_NAME);
            return;
        }

        storage.setConfig(this.BLOCKS_CONFIG_NAME, blocks);
    }

    private static loadBlocks(storage: IStorage): PlayerBlocksConfig {
        const raw = storage.getConfig(this.BLOCKS_CONFIG_NAME);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }

        const blocks: PlayerBlocksConfig = {};
        for (const [blockerRecord, blockedRecords] of Object.entries(raw as Record<string, unknown>)) {
            const normalizedRecord = Number.parseInt(blockerRecord, 10);
            if (!Number.isInteger(normalizedRecord) || normalizedRecord < 0) {
                continue;
            }

            const normalizedBlockedRecords = this.normalizeBlockedRecords(blockedRecords);
            if (normalizedBlockedRecords.length > 0) {
                blocks[String(normalizedRecord)] = normalizedBlockedRecords;
            }
        }

        return blocks;
    }

    private static normalizeBlockedRecords(blockedRecords: unknown): number[] {
        if (!Array.isArray(blockedRecords)) {
            return [];
        }

        return [...new Set(blockedRecords.filter((record): record is number => (
            typeof record === 'number' && Number.isInteger(record) && record >= 0
        )))].sort((left, right) => left - right);
    }
}