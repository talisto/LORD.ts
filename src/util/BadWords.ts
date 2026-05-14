/**
 * BadWords - Profanity filter singleton for LORD
 *
 * Reads word-substitution pairs from BADWORDS.DAT the first time filter() is
 * called.  The file format (identical to LORD v4.07 and the original SBBS port)
 * is one `word|replacement` pair per line; lines starting with `;` or blank
 * lines are ignored.
 *
 * Usage:
 *   // Once at startup, give it a path resolver (usually FileUtils):
 *   BadWords.instance.configure(fileUtils);
 *
 *   // Then anywhere - e.g. inside cleanStr():
 *   return BadWords.instance.filter(str);
 */

'use strict';

import * as fs from 'fs';

/**
 * Minimal interface that BadWords needs from FileUtils.
 * Using a structural type instead of importing FileUtils directly avoids the
 * circular dependency: FileUtils → Util → BadWords → FileUtils.
 */
interface BadwordsResolver {
    runtimeOrData(fname: string): string;
    fileExists(path: string): boolean;
}

class BadWords {
    private static readonly _instance = new BadWords();

    /** Compiled word/replacement pairs.  Null means "not yet loaded". */
    private _pairs: Array<{ pattern: RegExp; replacement: string }> | null = null;

    /** Provided by the caller; used the first time filter() is invoked. */
    private _resolver: BadwordsResolver | null = null;

    // Singleton - private constructor prevents external instantiation.
    private constructor() {}

    static get instance(): BadWords {
        return BadWords._instance;
    }

    /**
     * Provide the file resolver.  Call this once at startup (e.g. from
     * GameContext) before any user input is processed.  Calling it again
     * resets the loaded pairs so the file is re-read on the next filter().
     */
    configure(resolver: BadwordsResolver): void {
        this._resolver = resolver;
        this._pairs = null; // will be lazily re-loaded on next access
    }

    /** Read and compile BADWORDS.DAT.  Called automatically on first use. */
    private _load(): void {
        this._pairs = [];
        if (this._resolver === null) return;

        const bwPath = this._resolver.runtimeOrData('BADWORDS.DAT');
        if (!this._resolver.fileExists(bwPath)) return;

        const lines = fs.readFileSync(bwPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(';')) continue;
            const sep = trimmed.indexOf('|');
            if (sep < 1) continue;
            const word = trimmed.slice(0, sep).trim();
            const replacement = trimmed.slice(sep + 1).trim();
            if (word.length > 0) {
                // `word` comes from sysop-controlled BADWORDS.DAT, not player input;
                // regex special chars are intentional (e.g. "sh[i1]t" for leet-speak)
                this._pairs.push({ pattern: new RegExp(word, 'gi'), replacement });
            }
        }
    }

    /**
     * Apply the profanity filter to `str`.  On the first call after
     * configure() the DAT file is read and compiled automatically.
     */
    filter(str: string): string {
        if (this._pairs === null) {
            this._load();
        }
        let result = str;
        for (const bw of this._pairs as Array<{ pattern: RegExp; replacement: string }>) {
            result = result.replace(bw.pattern, bw.replacement);
        }
        return result;
    }
}

export default BadWords;
