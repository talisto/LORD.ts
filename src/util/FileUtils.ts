/**
 * FileUtils - File operations for LORD
 *
 * Contains file I/O helpers, path resolution, mutex management,
 * and lightweight File / RecordFile stub src that replace the
 * Synchronet built-ins for local Node.js development.
 */

'use strict';

import * as fs from 'fs';
import * as path from 'path';
import { cp437toUnicode } from './CP437';
import { needsAnsiRender, renderAnsiSection } from './ANSI';
import Lazy from './Lazy';
import type IO from '@lordts/core/io/IO';
import type { Settings, TextIndex } from '@lordts/core/types';

// Type definitions

interface WriteOptions {
    append?: boolean;
}

/**
 * Shared mutable file-handle state.  Passed by reference so FileUtils,
 * Output, and GameContext all see the same values.
 */
export interface SharedFileState {
    txtfile: File | null;
    txtindex: TextIndex;
    ripfile: File | null;
    ripindex: TextIndex;
}

// ── Stub src (moved from PlatformStubs) ─────────────────────────────

export class File {
    private path: string;
    name: string;
    mode: string;
    private _lines: string[] | null;
    private _linePos: number;

    constructor(fname: string, mode?: string) {
        this.path = fname;
        this.name = fname;
        this.mode = mode || 'r';
        this._lines = null;
        this._linePos = 0;
    }

    get position(): number { return this._linePos; }
    set position(v: number) { this._linePos = v; }

    open(m?: string): boolean {
        this.mode = m || this.mode;
        this._lines = null;
        this._linePos = 0;
        return true;
    }

    readAll(): string | null {
        if (!fs.existsSync(this.path)) return null;
        return cp437toUnicode(fs.readFileSync(this.path, 'latin1'));
    }

    readln(): string | null {
        if (this._lines === null) {
            if (!fs.existsSync(this.path)) return null;
            // Match Synchronet's line-oriented file API by loading once and
            // serving subsequent reads from an in-memory cursor.
            this._lines = cp437toUnicode(fs.readFileSync(this.path, 'latin1')).split(/\r?\n/);
            this._linePos = 0;
        }
        if (this._linePos >= this._lines.length) return null;
        return this._lines[this._linePos++];
    }

    write(data: unknown, opts?: WriteOptions): void {
        if (opts === undefined) opts = { append: true };
        if (opts.append) fs.writeFileSync(this.path, String(data), { flag: 'a' });
        else             fs.writeFileSync(this.path, String(data));
    }

    writeln(data: unknown): void {
        fs.writeFileSync(this.path, String(data) + '\n', { flag: 'a' });
    }

    writeAll(lines: string[]): void {
        fs.writeFileSync(this.path, lines.join('\n'));
    }

    truncate(n: number): void {
        fs.truncateSync(this.path, n);
    }

    close(): void { /* no-op for sync file ops */ }

    private exists(): boolean { return fs.existsSync(this.path); }

    size(): number {
        try { return fs.statSync(this.path).size; }
        catch (_e) { return 0; }
    }
}

export class RecordFile {
    private path: string;
    private recordSize: number;

    constructor(fname: string, recordSize?: number) {
        this.path = fname;
        this.recordSize = recordSize || 0;
    }

    readAll(): string[] {
        if (!fs.existsSync(this.path)) return [];
        return fs.readFileSync(this.path, 'utf8').split(/\r?\n/);
    }
}

// ── Standalone index builder (no GameContext needed) ─────────────────────

/**
 * Build a LORD section index from one or more .lrd / .dat files.
 *
 * Sections begin with a `@#SECTIONNAME` marker line; all following lines
 * belong to that section until the next marker.  When multiple files are
 * provided they are read in order - a section that appears in a later file
 * replaces any earlier content with the same name (LORD overlay semantics).
 * Missing files are silently skipped.
 */
export function buildLrdIndex(filePaths: string | string[]): TextIndex {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const index: TextIndex = {};
    let section: string | null = null;
    for (const filePath of paths) {
        if (!fs.existsSync(filePath)) continue;
        const lines = cp437toUnicode(fs.readFileSync(filePath, 'latin1')).split(/\r?\n/);
        for (const line of lines) {
            if (line.startsWith('@#')) {
                section = line.substring(2);
                index[section] = [];
            } else if (section !== null) {
                index[section].push(line);
            }
        }
    }
    return index;
}

// ── FileUtils class ─────────────────────────────────────────────────────

export class FileUtils {
    constructor(
        private settings: Settings,
        private baseDir: string,
        private cleanupFiles: string[],
        private _shared: SharedFileState,
        private _io: Lazy<IO>,
    ) {}

    // Lazy accessors for shared file handles and indexes
    get txtfile(): File | null { return this._shared.txtfile; }
    set txtfile(v: File | null) { this._shared.txtfile = v; }
    get txtindex(): Record<string, string[]> | undefined { return this._shared.txtindex; }
    set txtindex(v: Record<string, string[]>) { this._shared.txtindex = v; }
    get ripfile(): File | null { return this._shared.ripfile; }
    set ripfile(v: File | null) { this._shared.ripfile = v; }
    get ripindex(): Record<string, string[]> | undefined { return this._shared.ripindex; }
    set ripindex(v: Record<string, string[]>) { this._shared.ripindex = v; }
    get io(): IO { return this._io.value; }

    // ── File-system helpers (moved from PlatformStubs) ──────────────────

    fileExists(name: string): boolean { return fs.existsSync(name); }
    fileRemove(name: string): void { if (fs.existsSync(name)) fs.unlinkSync(name); }
    private fileRename(from: string, to: string): void { fs.renameSync(from, to); }
    private fileIsdir(p: string): boolean {
        try { return fs.statSync(p).isDirectory(); }
        catch (_e) { return false; }
    }
    fileDate(name: string): number {
        try { return Math.floor(fs.statSync(name).mtimeMs / 1000); }
        catch (_e) { return 0; }
    }
    private fileCopy(src: string, dst: string): boolean {
        try { fs.copyFileSync(src, dst); return true; }
        catch (_e) { return false; }
    }
    fileSize(name: string): number {
        try { return fs.statSync(name).size; }
        catch (_e) { return 0; }
    }

    private backslash(p: string): string {
        if (!p) return p;
        return p.endsWith(path.sep) ? p : p + path.sep;
    }

    /**
     * Simple file-based mutex: attempt to create a lockfile using wx flag.
     * Returns the lock filename on success, null if already locked.
     * Note: the caller (fmutex) already appends .lock to the filename.
     */
    private fileMutex(name: string, str?: string): string | null {
        try {
            fs.writeFileSync(name, String(str || ''), { flag: 'wx' });
            return name;
        } catch (_e) {
            return null;
        }
    }

    // ── Path resolution ─────────────────────────────────────────────────

    runtimeFilePath(fname: string): string {
        let gpre: string;

        // runtime_dir may be absolute (operator-managed outside the package)
        // or relative to the LORD install. Preserve both layouts.
        if (this.settings.runtime_dir.length > 0) {
            if (
                this.settings.runtime_dir[0] === "/" ||
                this.settings.runtime_dir[0] === "\\" ||
                (this.settings.runtime_dir[1] === ":" &&
                    (this.settings.runtime_dir[2] === "\\" || this.settings.runtime_dir[2] === "/"))
            ) {
                gpre = this.settings.runtime_dir;
            } else {
                gpre = this.baseDir + this.settings.runtime_dir;
            }
        } else {
            gpre = this.baseDir;
        }
        if (this.fileIsdir(gpre)) {
            gpre = this.backslash(gpre);
        }
        return gpre + fname;
    }

    runtimeOrData(fname: string): string {
        let gpre: string | undefined;

        // Override order is: runtime copy first, configured data dir second,
        // package-local data last. This lets operators patch assets without
        // modifying the shipped read-only files.
        if (this.settings.runtime_dir.length > 0) {
            if (
                this.settings.runtime_dir[0] === "/" ||
                this.settings.runtime_dir[0] === "\\" ||
                (this.settings.runtime_dir[1] === ":" &&
                    (this.settings.runtime_dir[2] === "\\" || this.settings.runtime_dir[2] === "/"))
            ) {
                gpre = this.settings.runtime_dir;
            } else {
                gpre = this.baseDir + this.settings.runtime_dir;
            }
            if (gpre && (!this.fileIsdir(gpre) || !this.fileExists((gpre) + fname))) {
                gpre = undefined;
            }
        }
        if (gpre === undefined) {
            if (this.settings.data_dir.length > 0) {
                if (
                    this.settings.data_dir[0] === "/" ||
                    this.settings.data_dir[0] === "\\" ||
                    (this.settings.data_dir[1] === ":" &&
                        (this.settings.data_dir[2] === "\\" || this.settings.data_dir[2] === "/"))
                ) {
                    gpre = this.settings.data_dir;
                } else {
                    gpre = this.baseDir + this.settings.data_dir;
                }
            } else {
                gpre = this.baseDir;
            }
        }
        if (this.fileIsdir(gpre)) {
            gpre = this.backslash(gpre);
        }
        if (this.fileExists((gpre) + fname)) {
            return (gpre) + fname;
        }
        // Fall back to the package root for legacy layouts and tests that put
        // assets beside the executable instead of under data/.
        return this.baseDir + fname;
    }
    async buildTxtIndex(): Promise<void> {
        const filesToLoad = [
            'LORDTXT.DAT',
            'LGAMETXT.DAT',
            'LORDEXT.DAT',
            'TRAINTXT.DAT',
        ];

        // Ensure at least the primary file exists (preserve prior behavior)
        const primaryPath = this.runtimeOrData('LORDTXT.DAT');
        if (!fs.existsSync(primaryPath)) {
            await this.io.sln('Unable to open ' + primaryPath + '!', 0);
            throw new Error('Unable to open ' + primaryPath + '!');
        }

        const filePaths = filesToLoad.map(f => this.runtimeOrData(f));
        this.txtindex = buildLrdIndex(filePaths);

        // Post-process ANSI sections: resolve cursor positioning and
        // strip trailing empty lines so DOS ANSI art renders correctly
        // on modern terminals that use deferred line-wrapping.
        for (const name of Object.keys(this.txtindex)) {
            const sectionLines = this.txtindex[name];
            const hasAnsi = sectionLines.some(l => l.includes('\x1b'));

            if (hasAnsi && needsAnsiRender(sectionLines)) {
                this.txtindex[name] = renderAnsiSection(sectionLines);
            } else if (hasAnsi) {
                while (sectionLines.length > 0 && sectionLines[sectionLines.length - 1].trim() === '') {
                    sectionLines.pop();
                }
            }
        }
    }

    buildRipIndex(): void {
        // LORDRIP.DAT is optional - buildLrdIndex returns {} when the file is missing.
        this.ripindex = buildLrdIndex(this.runtimeOrData('LORDRIP.DAT'));
    }
}

export default FileUtils;
