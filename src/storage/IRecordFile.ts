'use strict';

/**
 * IRecordFile - Shared interface for record-file implementations.
 *
 * Both BinaryRecordFile (flat binary .dat files) and DbRecordFile (SQLite)
 * implement this interface so that the rest of the game can treat them
 * interchangeably.  All code that deals with player records or game state
 * should type its variables as IRecordFile / IRecordData rather than
 * referring to either concrete implementation.
 */

/**
 * A single record returned by an IRecordFile implementation.
 *
 * Beyond the well-known members below, each record carries all of the
 * game-data fields defined by the corresponding RecordDef (Player_Def,
 * State_Def, etc.).  Those fields are accessed via the index signature.
 */
export interface IRecordData {
    /** Zero-based index of this record within the store. */
    Record: number;

    /** True when this session holds the logical lock on the record. */
    Yours?: boolean;

    /**
     * Write this record back to the underlying store.
     * @param leaveLocked - If true, keep the logical lock after writing.
     */
    put(leaveLocked?: boolean): void;

    /** Release any logical lock held on this record (no-op for SQLite). */
    unLock(): void;

    /** Reset all record fields to their schema-defined default values. */
    reInit(leaveLocked?: boolean): void;

    /**
     * Re-read this record fresh from the underlying store, overwriting any
     * in-memory changes made since the last get() / reLoad().
     */
    reLoad(leaveLocked?: boolean): void;

    /** Game-data fields (player name, HP, gold, …). */
    [key: string]: unknown;
}

/**
 * IRecordFile - Sequential, indexed store of typed records.
 *
 * Provides schema-driven access to records that are identified by a
 * zero-based integer index.  Implementations:
 *
 *  - BinaryRecordFile  - flat binary .dat files (original LORD format)
 *  - DbRecordFile      - SQLite table, one JSON row per record
 */
export interface IRecordFile {
    /** Total number of records currently persisted in the store. */
    readonly length: number;

    /**
     * Path to the backing file, if this is a file-based implementation.
     * Absent (undefined) for SQLite-backed stores - SQLite handles its own
     * concurrency, so callers should skip file-level mutex operations when
     * this property is undefined.
     */
    filepath?: string;

    /**
     * Fetch a record by index.
     *
     * @param index       - Zero-based record index.
     * @param leaveLocked - If true, keep a logical lock after reading.
     * @returns The record object adorned with convenience methods, or null
     *          if index is out of range.
     */
    get(index: number, leaveLocked?: boolean): IRecordData | null;

    /**
     * Create a new record initialised to schema defaults, persist it, and
     * return it (ready for immediate modification and put()).
     *
     * Declared as a function property (not method syntax) because TypeScript
     * reserves `new()` in interface method position as a construct signature.
     *
     * @param count       - Ignored; present for API compatibility with
     *                      Synchronet's RecordFile.
     * @param leaveLocked - If true, keep a logical lock on the new record.
     */
    new: (count?: number, leaveLocked?: boolean) => IRecordData | null;

    /** Release any held resources (file handles, etc.). No-op for SQLite. */
    close(): void;
}

/**
 * Minimal field definition accepted by IRecordFileFactory.
 *
 * Covers the fields needed by both BinaryRecordFile (prop, type, def,
 * recordDef) and DbRecordFile (prop, def).  The full RecordDef from
 * RecordDefs.ts (which adds a required `name`) is assignable to
 * RecordFieldDef[], so callers can pass either shape.
 */
export interface RecordFieldDef {
    prop: string;
    type: string;
    def?: unknown;
    name?: string;
    recordDef?: RecordFieldDef[];
}

/**
 * Factory for creating IRecordFile instances without coupling callers
 * (especially IGMs) to a specific storage implementation.
 *
 * Implementations:
 *  - BinaryRecordFileFactory - creates BinaryRecordFile instances on disk
 *  - DbRecordFileFactory     - creates DbRecordFile instances in SQLite
 */
export interface IRecordFileFactory {
    create(name: string, fieldDefs: RecordFieldDef[]): IRecordFile;
}
