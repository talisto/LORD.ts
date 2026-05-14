/**
 * Seth's Tribute Lotto - Definitions and Types
 * Ported from SLOTTO.PAS by Joseph Masters, 9/25/95
 */
import type { RecordFieldDef } from '@lordts/storage/IRecordFile';

export interface LottoRecord {
    lrdrecord: number;
    day: number;
    put(): void;
}

export const Lotto_Defs: RecordFieldDef[] = [
    { prop: 'lrdrecord', name: 'Lord Player Record #', type: 'SignedInteger', def: -1 },
    { prop: 'day', name: 'Day last played', type: 'Integer', def: -1 },
];
