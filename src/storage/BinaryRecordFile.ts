'use strict';

/**
 * BinaryRecordFile - reads/writes LORD's binary .dat files (RecordFile format).
 *
 * Faithfully reproduces the sbbs RecordFile binary layout:
 *   - Little-endian integers (8/16/32 bit, signed/unsigned)
 *   - Pascal strings (PString:N - 1 byte length prefix + N bytes data)
 *   - Fixed-width strings (String:N - NUL-padded)
 *   - Booleans (1 byte - 0xFF=true, 0x00=false)
 *   - Arrays of scalars (Array:N:TYPE)
 *   - Arrays of sub-records (SubArray:N with recordDef)
 */

import * as fs from 'fs';
import * as path from 'path';
import { cp437toUnicode, unicodeToCp437 } from '@lordts/util/CP437';
import type { IRecordFile, IRecordData, IRecordFileFactory, RecordFieldDef } from './IRecordFile';

/** Scalar types that can appear in record fields */
type ScalarValue = string | number | boolean;

// Type alias for internal use - RecordFieldDef is the shared schema type
type FieldDef = RecordFieldDef;

interface ReadResult {
    value: ScalarValue;
    pos: number;
}

interface RecordReadResult {
    obj: Record<string, unknown>;
    pos: number;
}

interface RecordData extends IRecordData {
    [key: string]: unknown;
    Record: number;
    put: (leaveLocked?: boolean) => void;
    unLock: () => void;
    reInit: (leaveLocked?: boolean) => void;
    reLoad: (leaveLocked?: boolean) => void;
}

// =====================================================================
//  Size calculation
// =====================================================================

function getScalarSize(type: string): number {
    if (type === 'Boolean' || type === 'SignedInteger8' || type === 'Integer8') return 1;
    if (type === 'SignedInteger16' || type === 'Integer16') return 2;
    if (type === 'SignedInteger' || type === 'Integer' ||
        type === 'SignedInteger32' || type === 'Integer32') return 4;
    if (type === 'Float') return 22;
    if (type.startsWith('String:')) return parseInt(type.split(':')[1], 10);
    if (type.startsWith('PString:')) return parseInt(type.split(':')[1], 10) + 1;
    throw new Error('Unknown scalar type: ' + type);
}

function getRecordSize(defs: FieldDef[]): number {
    let size = 0;
    for (const d of defs) {
        size += getFieldSize(d);
    }
    return size;
}

function getFieldSize(fieldDef: FieldDef): number {
    const type = fieldDef.type;
    if (type.startsWith('SubArray:')) {
        const count = parseInt(type.split(':')[1], 10);
        if (!fieldDef.recordDef) throw new Error('SubArray field missing recordDef: ' + fieldDef.prop);
        return count * getRecordSize(fieldDef.recordDef);
    }
    if (type.startsWith('Array:')) {
        const parts = type.split(':');
        const count = parseInt(parts[1], 10);
        const elemType = parts.slice(2).join(':');
        return count * getScalarSize(elemType);
    }
    return getScalarSize(type);
}

// =====================================================================
//  Binary reading
// =====================================================================

function readScalar(buf: Buffer, pos: number, type: string): ReadResult {
    switch (type) {
        case 'Boolean':
            return { value: buf.readUInt8(pos) > 0, pos: pos + 1 };
        case 'SignedInteger8':
            return { value: buf.readInt8(pos), pos: pos + 1 };
        case 'Integer8':
            return { value: buf.readUInt8(pos), pos: pos + 1 };
        case 'SignedInteger16':
            return { value: buf.readInt16LE(pos), pos: pos + 2 };
        case 'Integer16':
            return { value: buf.readUInt16LE(pos), pos: pos + 2 };
        case 'SignedInteger':
        case 'SignedInteger32':
            return { value: buf.readInt32LE(pos), pos: pos + 4 };
        case 'Integer':
        case 'Integer32':
            return { value: buf.readUInt32LE(pos), pos: pos + 4 };
    }
    if (type.startsWith('String:')) {
        const n = parseInt(type.split(':')[1], 10);
        // Read as latin1 (preserves raw bytes), then convert CP437 to Unicode
        // \x00 is intentional: we are stripping null bytes from binary record data.
        // eslint-disable-next-line no-control-regex
        const raw = buf.toString('latin1', pos, pos + n).replace(/\x00/g, '');
        const s = cp437toUnicode(raw);
        return { value: s, pos: pos + n };
    }
    if (type.startsWith('PString:')) {
        const n = parseInt(type.split(':')[1], 10);
        const len = buf.readUInt8(pos);
        // Read as latin1 (preserves raw bytes), then convert CP437 to Unicode
        const raw = buf.toString('latin1', pos + 1, pos + 1 + n).substr(0, len);
        const s = cp437toUnicode(raw);
        return { value: s, pos: pos + 1 + n };
    }
    throw new Error('Unknown type: ' + type);
}

function readRecord(buf: Buffer, pos: number, defs: FieldDef[]): RecordReadResult {
    const obj: Record<string, unknown> = {};
    for (const d of defs) {
        const type = d.type;
        if (type.startsWith('SubArray:')) {
            const count = parseInt(type.split(':')[1], 10);
            const arr: Record<string, unknown>[] = [];
            if (!d.recordDef) throw new Error('SubArray field missing recordDef: ' + d.prop);
            for (let i = 0; i < count; i++) {
                const sub = readRecord(buf, pos, d.recordDef);
                arr.push(sub.obj);
                pos = sub.pos;
            }
            obj[d.prop] = arr;
        } else if (type.startsWith('Array:')) {
            const parts = type.split(':');
            const count = parseInt(parts[1], 10);
            const elemType = parts.slice(2).join(':');
            const arr: ScalarValue[] = [];
            for (let i = 0; i < count; i++) {
                const r = readScalar(buf, pos, elemType);
                arr.push(r.value);
                pos = r.pos;
            }
            obj[d.prop] = arr;
        } else {
            const r = readScalar(buf, pos, type);
            obj[d.prop] = r.value;
            pos = r.pos;
        }
    }
    return { obj, pos };
}

// =====================================================================
//  Binary writing
// =====================================================================

function writeScalar(buf: Buffer, pos: number, type: string, val: ScalarValue | undefined): number {
    const numVal = Number(val) || 0;
    switch (type) {
        case 'Boolean':
            buf.writeUInt8(val ? 255 : 0, pos);
            return pos + 1;
        case 'SignedInteger8':
            buf.writeInt8(numVal, pos);
            return pos + 1;
        case 'Integer8':
            buf.writeUInt8(numVal & 0xFF, pos);
            return pos + 1;
        case 'SignedInteger16':
            buf.writeInt16LE(numVal, pos);
            return pos + 2;
        case 'Integer16':
            buf.writeUInt16LE(numVal & 0xFFFF, pos);
            return pos + 2;
        case 'SignedInteger':
        case 'SignedInteger32':
            buf.writeInt32LE(numVal, pos);
            return pos + 4;
        case 'Integer':
        case 'Integer32':
            buf.writeUInt32LE(numVal >>> 0, pos);
            return pos + 4;
    }
    if (type.startsWith('String:')) {
        const n = parseInt(type.split(':')[1], 10);
        buf.fill(0, pos, pos + n);
        // Convert Unicode back to CP437 before writing
        if (val) buf.write(unicodeToCp437(String(val)).substr(0, n), pos, n, 'latin1');
        return pos + n;
    }
    if (type.startsWith('PString:')) {
        const n = parseInt(type.split(':')[1], 10);
        // Convert Unicode back to CP437 before writing
        const s = val ? unicodeToCp437(String(val)) : '';
        const len = Math.min(s.length, n);
        buf.writeUInt8(len, pos);
        buf.fill(0, pos + 1, pos + 1 + n);
        if (s) buf.write(s.substr(0, n), pos + 1, n, 'latin1');
        return pos + 1 + n;
    }
    throw new Error('Unknown type: ' + type);
}

function writeRecord(buf: Buffer, pos: number, defs: FieldDef[], obj: Record<string, unknown>): number {
    for (const d of defs) {
        const type = d.type;
        const val = obj[d.prop];
        if (type.startsWith('SubArray:')) {
            const count = parseInt(type.split(':')[1], 10);
            const subArr = val as Array<Record<string, unknown>> | undefined;
            if (!d.recordDef) throw new Error('SubArray field missing recordDef: ' + d.prop);
            for (let i = 0; i < count; i++) {
                pos = writeRecord(buf, pos, d.recordDef, (subArr && subArr[i]) || {});
            }
        } else if (type.startsWith('Array:')) {
            const parts = type.split(':');
            const count = parseInt(parts[1], 10);
            const elemType = parts.slice(2).join(':');
            const partArr = val as ScalarValue[] | undefined;
            for (let i = 0; i < count; i++) {
                pos = writeScalar(buf, pos, elemType, partArr ? partArr[i] : undefined);
            }
        } else {
            pos = writeScalar(buf, pos, type, val as ScalarValue | undefined);
        }
    }
    return pos;
}

// =====================================================================
//  Default value generation
// =====================================================================

function getDefaultScalar(type: string): boolean | string | number {
    if (type === 'Boolean') return false;
    if (type.startsWith('String:') || type.startsWith('PString:')) return '';
    return 0;
}

function setDefaults(obj: Record<string, unknown>, defs: FieldDef[]): void {
    for (const d of defs) {
        const type = d.type;
        if (type.startsWith('SubArray:')) {
            const count = parseInt(type.split(':')[1], 10);
            obj[d.prop] = [];
            const subArr = obj[d.prop] as unknown[];
            if (!d.recordDef) throw new Error('SubArray field missing recordDef: ' + d.prop);
            for (let i = 0; i < count; i++) {
                const sub: Record<string, unknown> = {};
                setDefaults(sub, d.recordDef);
                subArr.push(sub);
            }
        } else if (type.startsWith('Array:')) {
            const parts = type.split(':');
            const count = parseInt(parts[1], 10);
            const elemType = parts.slice(2).join(':');
            obj[d.prop] = [];
            const elemArr = obj[d.prop] as unknown[];
            for (let i = 0; i < count; i++) {
                elemArr.push(d.def !== undefined ? d.def : getDefaultScalar(elemType));
            }
        } else {
            obj[d.prop] = d.def !== undefined ? d.def : getDefaultScalar(type);
        }
    }
}

// =====================================================================
//  BinaryRecordFile class
// =====================================================================

export class BinaryRecordFile implements IRecordFile {
    filepath: string;
    private fieldDefs: FieldDef[];
    private recordLength: number;

    /**
     * @param filepath - full path to the binary .dat file
     * @param fieldDefs - array of { prop, type, [recordDef] }
     */
    constructor(filepath: string, fieldDefs: FieldDef[]) {
        this.filepath = filepath;
        this.fieldDefs = fieldDefs;
        this.recordLength = getRecordSize(fieldDefs);
    }

    /** Number of records in the file */
    get length(): number {
        try {
            const stat = fs.statSync(this.filepath);
            return Math.floor(stat.size / this.recordLength);
        } catch (_e) {
            return 0;
        }
    }

    /**
     * Read record at index. Returns object with all fields + Record + put().
     * Returns null if index is out of range.
     */
    get(index: number): RecordData | null {
        if (index < 0 || index >= this.length) return null;

        const buf = Buffer.alloc(this.recordLength);
        const fd = fs.openSync(this.filepath, 'r');
        fs.readSync(fd, buf, 0, this.recordLength, index * this.recordLength);
        fs.closeSync(fd);

        const result = readRecord(buf, 0, this.fieldDefs);
        const record: RecordData = result.obj as RecordData;
        record.Record = index;

        // `self` alias is required: the inner functions are plain functions
        // whose `this` is the record object; we need `self` to access the
        // BinaryRecordFile instance (fieldDefs, recordLength, filepath).
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        record.put = function (this: RecordData): void {
            const writeBuf = Buffer.alloc(self.recordLength, 0);
            writeRecord(writeBuf, 0, self.fieldDefs, this);
            const wfd = fs.openSync(self.filepath, 'r+');
            fs.writeSync(wfd, writeBuf, 0, self.recordLength, this.Record * self.recordLength);
            fs.closeSync(wfd);
        };
        record.unLock = function (): void {};

        // Match RecordFile API: allow reInit() to reset to defaults
        record.reInit = function (this: RecordData): void {
            setDefaults(this as Record<string, unknown>, self.fieldDefs);
        };

        // reLoad() reads fresh from disk into this object
        record.reLoad = function (this: RecordData): void {
            const buf = Buffer.alloc(self.recordLength);
            const fd = fs.openSync(self.filepath, 'r');
            fs.readSync(fd, buf, 0, self.recordLength, this.Record * self.recordLength);
            fs.closeSync(fd);
            const rr = readRecord(buf, 0, self.fieldDefs);
            const fresh = rr.obj;
            for (const k of Object.keys(fresh)) {
                (this as Record<string, unknown>)[k] = (fresh)[k];
            }
        };

        return record;
    }

    /** No-op close – BinaryRecordFile opens/closes per operation */
    close(): void {}

    /** Append a new blank record and return it */
    new(): RecordData {
        const record: Record<string, unknown> = {};
        setDefaults(record, this.fieldDefs);
        record.Record = this.length;

        const buf = Buffer.alloc(this.recordLength, 0);
        writeRecord(buf, 0, this.fieldDefs, record);
        // Ensure the parent directory exists before writing
        fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
        fs.appendFileSync(this.filepath, buf);

        // `self` alias is required: see get() above for rationale.
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        const typedRecord = record as RecordData;
        typedRecord.put = function (this: RecordData): void {
            const writeBuf = Buffer.alloc(self.recordLength, 0);
            writeRecord(writeBuf, 0, self.fieldDefs, this);
            const wfd = fs.openSync(self.filepath, 'r+');
            fs.writeSync(wfd, writeBuf, 0, self.recordLength, this.Record * self.recordLength);
            fs.closeSync(wfd);
        };
        typedRecord.unLock = function (): void {};

        // Provide reInit and reLoad to match RecordFile API
        typedRecord.reInit = function (this: RecordData): void {
            setDefaults(this as Record<string, unknown>, self.fieldDefs);
        };

        typedRecord.reLoad = function (this: RecordData): void {
            const buf = Buffer.alloc(self.recordLength);
            const fd = fs.openSync(self.filepath, 'r');
            fs.readSync(fd, buf, 0, self.recordLength, this.Record * self.recordLength);
            fs.closeSync(fd);
            const rr = readRecord(buf, 0, self.fieldDefs);
            const fresh = rr.obj;
            for (const k of Object.keys(fresh)) {
                (this as Record<string, unknown>)[k] = (fresh)[k];
            }
        };

        return typedRecord;
    }
}

/**
 * Factory that creates BinaryRecordFile instances.
 * Pass to IGMs via IgmDeps so they can create record files without
 * importing BinaryRecordFile directly.
 */
export class BinaryRecordFileFactory implements IRecordFileFactory {
    create(filepath: string, fieldDefs: RecordFieldDef[]): IRecordFile {
        return new BinaryRecordFile(filepath, fieldDefs);
    }
}

export { BinaryRecordFile as default };
