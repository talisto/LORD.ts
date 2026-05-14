/**
 * JsonLoader - Loads JSON data files with runtime override support.
 *
 * Checks the runtime directory first; if the file exists there, it is loaded
 * from there so server operators can customise data without touching the
 * read-only data/ directory.  Falls back to the data directory otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Settings } from '@lordts/core/types';

export class JsonLoader {
    private runtimeDir: string;

    constructor(
        private dataDir: string,
        settings: Settings,
        baseDir: string,
    ) {
        // Resolve the runtime directory path using the same logic as
        // FileUtils.runtimeFilePath(), without depending on FileUtils.
        const rd = settings.runtime_dir ?? '';
        if (rd.length > 0) {
            if (
                rd[0] === '/' ||
                rd[0] === '\\' ||
                (rd.length > 2 && rd[1] === ':' && (rd[2] === '\\' || rd[2] === '/'))
            ) {
                // Absolute path
                this.runtimeDir = rd;
            } else {
                // Relative path - resolve against project root
                this.runtimeDir = path.join(baseDir, rd);
            }
        } else {
            this.runtimeDir = baseDir;
        }
    }

    /**
     * Load a JSON file.  The runtime directory is checked first; if the file
     * exists there, it is loaded from there.  Otherwise, the data directory
     * is used.
     */
    load<T>(filename: string): T {
        const runtimePath = path.join(this.runtimeDir, filename);
        if (fs.existsSync(runtimePath)) {
            try {
                return JSON.parse(fs.readFileSync(runtimePath, 'utf8')) as T;
            } catch (_e) {
                // Fall through to data directory on parse error
            }
        }
        return JSON.parse(fs.readFileSync(path.join(this.dataDir, filename), 'utf8')) as T;
    }
}
