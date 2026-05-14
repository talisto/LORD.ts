/**
 * IGM - Inter-Game Module (IGM) manager for LORD.
 *
 * Discovers installed IGMs from the configured IGM directory, writes INFO
 * drop files for each invocation, and dispatches control to the module:
 * either by spawning an external process (classic DOS-style IGMs) or by
 * directly invoking an in-process TypeScript IGM class.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { IStorage } from '@lordts/storage/IStorage';
import Lazy from '@lordts/util/Lazy';
import type GameContext from '@lordts/core/GameContext';
import type IO from '@lordts/core/io/IO';
import type FileUtils from '@lordts/util/FileUtils';
import type { IgmDeps } from './IgmDeps';
import type { IgmClass } from './IgmRunner';
import type { Settings, Connection, IGMPlace } from '@lordts/core/types';
import type Player from '@lordts/core/Player';
import { writeInfoFile, removeInfoFile, readInfoFile } from './IgmInfoFile';
import { ChildProcessBridge } from './ChildProcessBridge';
import type { InfoFileData } from './IgmInfoFile';

class IGM {
    constructor(
        private io: IO,
        private baseDir: string,
        private runtimeDir: string,
        private fileUtils: FileUtils,
        private settings: Settings,
        private _player: Lazy<Player>,
        private connection: Connection,
        // Stored so JS-module IGMs can be instantiated on demand with the full context
        private _context: Lazy<GameContext>,
        private _storage: Lazy<IStorage>,
    ) {}

    // ── Lazy-resolved dependencies ───────────────────────────────────────

    get player(): Player { return this._player.value; }
    get storage(): IStorage { return this._storage.value; }

    // ── IGM path resolution ───────────────────────────────────────────

    private resolveIgmModulePath(cmdlinePath: string): string {
        const normalized = cmdlinePath.replace(/\\/g, '/');
        const candidates = new Set<string>();

        const addCandidate = (candidate: string): void => {
            if (!candidate) return;
            candidates.add(path.normalize(candidate));
        };

        if (path.isAbsolute(normalized)) {
            addCandidate(normalized);
        } else {
            addCandidate(path.join(this.baseDir, normalized));

            if (!normalized.startsWith('dist/')) {
                addCandidate(path.join(this.baseDir, 'dist', normalized));
            }

            if (!normalized.startsWith('igm/')) {
                addCandidate(path.join(this.baseDir, 'igm', normalized));
            }

            if (!normalized.startsWith('dist/igm/')) {
                addCandidate(path.join(this.baseDir, 'dist', 'igm', normalized));
            }
        }

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
            // Try .ts and .js extensions (supports extension-free paths in 3rdparty.dat)
            const tsCandidate = candidate + '.ts';
            if (fs.existsSync(tsCandidate)) return tsCandidate;
            const jsCandidate = candidate + '.js';
            if (fs.existsSync(jsCandidate)) return jsCandidate;
        }

        return path.isAbsolute(normalized) ? path.normalize(normalized) : path.join(this.baseDir, normalized);
    }

    /**
     * Proxy around IO that binds all method calls to the original instance.
     * IGMs that destructure methods (e.g. `const { lln } = deps.io`) lose
     * `this` context; the proxy ensures binding is preserved.
     */
    private createIgmIoProxy(io: IO): IO {
        return new Proxy(io as unknown as Record<string, unknown>, {
            get: (target: Record<string, unknown>, prop: string | symbol): unknown => {
                const value: unknown = Reflect.get(target, prop);
                if (typeof value !== 'function') {
                    return value;
                }
                return (value as (...args: unknown[]) => unknown).bind(io);
            },
        }) as unknown as IO;
    }

    async handleIgm(place: IGMPlace): Promise<boolean> {
        const modulePath = place.modulePath;

        // ── External process IGM ────────────────────────────────────────
        // If a main.ts or main.js entry point exists alongside the module, spawn
        // it as a child process and bridge I/O. Prefers .ts (run via tsx in dev).
        const mainEntryPath = this._resolveMainEntry(place);
        if (mainEntryPath) {
            const ctx = this._context.value;
            if (!ctx.player) throw new Error('IGM requires player to be initialized');
            if (!ctx.state) throw new Error('IGM requires state to be initialized');

            const session = ctx.session;
            const runtimeDir = this.runtimeDir;
            const nodeNum = this.connection.node;

            ctx.player.put();

            const infoData: InfoFileData = {
                accountNumber: ctx.player.Record,
                // LORD graphics level: 0=ASCII, 1=ANSI(no color), 2=ANSI(color), 3=ANSI(full)
                // Original DROP file spec; IGMs check `graphics >= 2` for color support
                graphics: (ctx.session.ansi !== false) ? 3 : 0,
                rip: ctx.rip,
                fairy: ctx.player.fairy_lore === true,
                timeLeft: Math.floor(ctx.user.secondsRemaining / 60),
                handle: ctx.player.name || ctx.user.name,
                realFirstName: ctx.user.name,
                realLastName: '',
                comPort: 0,
                callerBaud: 0,
                portBaud: 0,
                ioDriver: 'INTERNAL',
                registered: 'REGISTERED',
                cleanMode: ctx.settings.clean_mode ? 'CLEAN MODE ON' : 'CLEAN MODE OFF',
            };
            writeInfoFile(runtimeDir, nodeNum, infoData);

            await this.io.sln();
            await this.io.lln('`)** `%HOLD ON.. `)**');
            await this.io.sln();

            this.storage.setPlayerLocation(ctx.player.Record, [place.desc]);

            // Use tsx for .ts entry points so TypeScript imports resolve correctly
            const isTsEntry = mainEntryPath.endsWith('.ts');
            // Pass both runtimeDir and projectRoot so child process doesn't need
            // to derive projectRoot from runtimeDir (which breaks when runtimeDir
            // is configured to a non-default location).
            const projectRoot = this.baseDir.replace(/[\\/]$/, '');
            const spawnArgs = isTsEntry
                ? [path.join(this.baseDir, 'node_modules', '.bin', 'tsx'), mainEntryPath, String(nodeNum), runtimeDir, projectRoot]
                : [mainEntryPath, String(nodeNum), runtimeDir, projectRoot];

            // stdio channels: [0]=stdin (piped for key delivery), [1]=stdout (piped for
            // output capture), [2]=stderr (inherited, visible in parent console),
            // [3]=IPC channel (Node message passing for prompt events and sync requests)
            const child = spawn(process.execPath, spawnArgs, {
                stdio: ['pipe', 'pipe', 'inherit', 'ipc'],
                cwd: path.dirname(mainEntryPath),
            });

            const bridge = new ChildProcessBridge(session, child, {
                parentEvents: ctx.events ?? undefined,
            });
            const exitCode = await bridge.bridge();

            if (exitCode !== 0) {
                console.error(`IGM ${place.cmdline} exited with code ${exitCode}`);
            }

            try {
                const updatedInfo = readInfoFile(runtimeDir, nodeNum);
                ctx.user.secondsRemaining = updatedInfo.timeLeft * 60;
                ctx.user.secondsRemainingFrom = Math.floor(Date.now() / 1000);
            } catch (_e) {
                // INFO file may have been cleaned up - ignore
            }

            const reloaded = ctx.player.playerGet(ctx.player.Record);
            if (reloaded) {
                ctx.player.player = reloaded;
            }
            ctx.player.checkFields();

            removeInfoFile(runtimeDir, nodeNum);
            this.storage.clearPlayerLocation(ctx.player.Record);

            return false;
        }

        // ── In-process IGM ──────────────────────────────────────────────
        // Load the JS module directly in-process. Works regardless of whether
        // the place was auto-discovered (jsIgm: true) or read from 3rdparty.dat
        // with a path that resolved to a loadable module (jsIgm: false).
        if (modulePath && fs.existsSync(modulePath)) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const exported = require(modulePath) as Record<string, unknown>;
            const IgmCtor = ((exported && exported.default) ? exported.default : exported) as IgmClass;
            const ctx = this._context.value;
            if (!ctx.player) throw new Error('IGM requires player to be initialized');
            if (!ctx.state) throw new Error('IGM requires state to be initialized');
            const igmIo = this.createIgmIoProxy(ctx.io);
            const igmDeps: IgmDeps = {
                io: igmIo,
                fileUtils: ctx.fileUtils,
                storage: ctx.storage,
                settings: ctx.settings,
                srcDir: path.dirname(modulePath),
                dataDir: ctx.dataDir,
                runtimeDir: this.runtimeDir,
                player: ctx.player,
                state: ctx.state,
                equipment: ctx.equipment,
                log: ctx.log,
                morechk: ctx.morechk,
            };
            const igmInstance = new IgmCtor(igmDeps);
            await igmInstance.run();
            return false;
        }

        // No module found - cannot run
        await this.io.lln('`4Unable to execute IGM: ' + place.cmdline, 0);
        console.error(`No runnable module found for IGM: ${place.cmdline}`);
        return false;
    }

    /**
     * Resolve the path to a main.js or main.ts entry point for an IGM.
     * If found, the IGM will be run as an external child process instead of in-process.
     * Prefers main.ts (dev mode via tsx) over main.js (compiled dist).
     */
    private _resolveMainEntry(place: IGMPlace): string | null {
        if (!place.modulePath) return null;
        const dir = path.dirname(place.modulePath);
        const mainTs = path.join(dir, 'main.ts');
        if (fs.existsSync(mainTs)) return mainTs;
        const mainJs = path.join(dir, 'main.js');
        if (fs.existsSync(mainJs)) return mainJs;
        return null;
    }

    /**
     * Run daily maintenance for all IGMs enabled in 3rdparty.dat that
     * expose a static `runMaint(deps: IgmDeps): Promise<void>` method.
     * Called from DailyMaint.runDailyMaint() to ensure IGM data is reset even
     * on days when no player visits a particular IGM.
     */
    async runMaintenance(): Promise<void> {
        const ctx = this._context.value;
        if (!ctx.player || !ctx.state) {
            // Maintenance can only run when a player session context is available.
            return;
        }
        const igmIo = this.createIgmIoProxy(ctx.io);

        // Only run maintenance for IGMs enabled in 3rdparty.dat
        const enabledEntries = this.parseEnabledEntries();
        for (const entry of enabledEntries) {
            if (!entry.modulePath || !fs.existsSync(entry.modulePath)) continue;
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const exported = require(entry.modulePath) as Record<string, unknown>;
                const IgmCtor = ((exported && exported.default) ? exported.default : exported) as IgmClass;
                if (IgmCtor && typeof IgmCtor.runMaint === 'function') {
                    // Build deps per-entry so srcDir points to each IGM's own directory
                    const deps: IgmDeps = {
                        io: igmIo,
                        fileUtils: ctx.fileUtils,
                        storage: ctx.storage,
                        settings: ctx.settings,
                        srcDir: path.dirname(entry.modulePath),
                        dataDir: ctx.dataDir,
                        runtimeDir: this.runtimeDir,
                        player: ctx.player,
                        state: ctx.state,
                        equipment: ctx.equipment,
                        log: ctx.log,
                        morechk: ctx.morechk,
                    };
                    await IgmCtor.runMaint(deps);
                }
            } catch (e) {
                console.error(`IGM maintenance error in ${entry.cmdline}:`, e);
            }
        }
    }

    /**
     * Discover all available JS IGMs from igm/ and dist/igm/ directories.
     * Returns a Map of IGM name → { relPath, desc, modulePath, maintenanceOnly }.
     */
    private discoverIgms(): Map<string, { relPath: string; desc: string; modulePath: string; maintenanceOnly: boolean }> {
        const igmDirs = [
            path.join(this.baseDir, 'igm'), path.join(this.baseDir, 'dist', 'igm'),
        ];
        const discovered = new Map<string, { relPath: string; desc: string; modulePath: string; maintenanceOnly: boolean }>();
        igmDirs.forEach((igmRoot) => {
            if (!fs.existsSync(igmRoot)) return;
            fs.readdirSync(igmRoot).sort().forEach((name) => {
                if (discovered.has(name)) return;
                // Prefer .ts source (dev mode) over .js (compiled dist)
                const tsPath = path.join(igmRoot, name, name + '.ts');
                const jsPath = path.join(igmRoot, name, name + '.js');
                const modulePath = fs.existsSync(tsPath) ? tsPath : fs.existsSync(jsPath) ? jsPath : null;
                if (modulePath) {
                    // Store extension-free relPath so 3rdparty.dat is portable between dev/prod
                    const relPath = path.relative(this.baseDir, modulePath).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const exported = require(modulePath) as Record<string, unknown>;
                    const IgmCtor = ((exported && exported.default) ? exported.default : exported) as IgmClass | undefined;
                    const maintOnly = !!(IgmCtor && IgmCtor.maintenanceOnly);
                    const desc = (IgmCtor && IgmCtor.desc !== undefined) ? IgmCtor.desc : name;
                    discovered.set(name, {
                        relPath,
                        desc,
                        modulePath: this.resolveIgmModulePath(relPath.split(/\s/)[0]),
                        maintenanceOnly: maintOnly,
                    });
                }
            });
        });
        return discovered;
    }

    /**
     * Generate the default content for 3rdparty.dat from discovered IGMs.
     * Includes both player-facing and maintenance-only IGMs.
     */
    private generate3rdPartyDat(discovered: Map<string, { relPath: string; desc: string; modulePath: string; maintenanceOnly: boolean }>): string {
        const lines: string[] = [
            ';-=-=-=-= LORD\'S INTERNAL 3RD PARTY SOFTWARE OPTION =-=-=-',
            ';Example of correct usage for external IGMs:',
            ';igm/barak/barak <PARMS>  (* will have lord.js interject node #)',
            ';`9Name `3As `3It `2Appears `%to `2Users',
            ';(Yes, two lines are needed for each app)',
            ';',
            ';JS IGMs in the igm/ folder are listed below automatically.',
            ';Comment out or remove any two-line entry to disable that IGM.',
        ];
        const maintLines: string[] = [];
        for (const [, info] of discovered) {
            if (info.maintenanceOnly) {
                maintLines.push(info.relPath);
                maintLines.push(info.desc);
            } else {
                lines.push(info.relPath);
                lines.push(info.desc);
            }
        }
        if (maintLines.length > 0) {
            lines.push(';');
            lines.push(';--- Maintenance-only IGMs (no player UI, run during daily maintenance) ---');
            lines.push(...maintLines);
        }
        return lines.join('\n') + '\n';
    }

    /**
     * Append any newly discovered IGMs to 3rdparty.dat that aren't already
     * mentioned (even as comments). Handles upgrades where new modules are added.
     */
    private appendNewEntries(datPath: string, discovered: Map<string, { relPath: string; desc: string; modulePath: string; maintenanceOnly: boolean }>): void {
        const content = fs.readFileSync(datPath, 'utf8');
        const newUi: string[] = [];
        const newMaint: string[] = [];

        for (const [, info] of discovered) {
            // Check if this IGM's relPath appears anywhere in the file (even commented out)
            if (!content.includes(info.relPath)) {
                if (info.maintenanceOnly) {
                    newMaint.push(info.relPath, info.desc);
                } else {
                    newUi.push(info.relPath, info.desc);
                }
            }
        }

        if (newUi.length > 0 || newMaint.length > 0) {
            const append: string[] = [];
            if (newUi.length > 0) append.push(...newUi);
            if (newMaint.length > 0) {
                if (!content.includes('Maintenance-only')) {
                    append.push(';', ';--- Maintenance-only IGMs (no player UI, run during daily maintenance) ---');
                }
                append.push(...newMaint);
            }
            fs.appendFileSync(datPath, '\n' + append.join('\n') + '\n', 'utf8');
        }
    }

    /**
     * Ensure 3rdparty.dat exists and parse all enabled (non-commented) entries.
     * Returns every enabled IGM entry with its maintenanceOnly flag resolved.
     * Newly discovered IGMs are automatically appended to the file.
     */
    private parseEnabledEntries(): IGMPlace[] {
        const discovered = this.discoverIgms();
        const datPath = path.join(this.runtimeDir, '3rdparty.dat');

        // Auto-generate 3rdparty.dat if it doesn't exist
        if (!fs.existsSync(datPath)) {
            if (!fs.existsSync(this.runtimeDir)) {
                fs.mkdirSync(this.runtimeDir, { recursive: true });
            }
            fs.writeFileSync(datPath, this.generate3rdPartyDat(discovered), 'utf8');
        } else {
            // Append any newly discovered modules not yet in the file
            this.appendNewEntries(datPath, discovered);
        }

        // Parse 3rdparty.dat - every uncommented two-line pair is an enabled entry
        const content = fs.readFileSync(datPath, 'utf8');
        const lines = content.split(/\r?\n/);
        const ret: IGMPlace[] = [];
        let i = 0;
        // 3rdparty.dat uses a two-line-per-entry format from original LORD:
        //   Line 1: module path (e.g. "igm/sandbar/sandbar")
        //   Line 2: display description (e.g. "`9Sandbar `2Stede's Bar")
        // Comment lines (;) and blanks are skipped but don't break pairs.
        while (i < lines.length) {
            const line = lines[i];
            // Skip comment lines and blank lines
            if (!line || line.startsWith(';')) {
                i++;
                continue;
            }
            // Expect pairs: cmdline then desc
            const cmdline = line.trim();
            i++;
            if (i >= lines.length) break;
            const desc = lines[i];
            i++;
            if (!cmdline) continue;

            // Look up this cmdline in discovered IGMs by matching the relPath
            // Strip .ts/.js extension for comparison so old 3rdparty.dat files still match
            const cmdBase = cmdline.split(/\s/)[0].replace(/\.(ts|js)$/, '');
            let matchedInfo: { relPath: string; desc: string; modulePath: string; maintenanceOnly: boolean } | undefined;
            for (const [, info] of discovered) {
                const infoBase = info.relPath.split(/\s/)[0];
                if (infoBase === cmdBase) {
                    matchedInfo = info;
                    break;
                }
            }

            const displayDesc = desc || (matchedInfo ? matchedInfo.desc : cmdline);
            ret.push({
                cmdline,
                desc: displayDesc,
                menu: '',
                jsIgm: !!matchedInfo,
                modulePath: matchedInfo?.modulePath ?? this.resolveIgmModulePath(cmdline.split(/\s/)[0]),
                maintenanceOnly: matchedInfo?.maintenanceOnly ?? false,
            });
        }

        return ret;
    }

    createOtherPlaces(): IGMPlace[] {
        if (this.settings.no_igms_allowed) return [];

        const allEntries = this.parseEnabledEntries();

        // Filter out maintenance-only IGMs and assign menu numbers
        let oi = 0;
        return allEntries
            .filter(e => !e.maintenanceOnly)
            .map(e => {
                oi += 1;
                return { ...e, menu: '`2(`0' + oi + '`2) ' + e.desc };
            });
    }
}

export default IGM;
