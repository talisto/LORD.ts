/**
 * LDY Manager - Manages the LORD "Lady" scripting system for the web port.
 *
 * The Lady scripting system allows game events (random forest encounters, bard
 * songs, leave-bank/leave-inn events, etc.) to be defined in .LDY text files
 * rather than hard-coded. LORD 4.07 shipped with these default event scripts:
 *
 * Forest events (dispatched from LORD.LDY):
 *   - GEM (gem.ldy)            - Find a gem
 *   - HORSE (horse.ldy)        - Horse trader event (gated by 25% chance)
 *   - OLDMAN (oldman.ldy)      - Old man asks for directions
 *   - BAGOGOLD (bagogold.ldy)  - Find a sack of gold
 *   - HAMMERSTONE (hamstone.ldy) - Find a hammerstone (+1 str)
 *   - MERRYMEN (merrymen.ldy)  - Merry men heal you (only if hurt)
 *   - HAG (hag.ldy)            - Old hag wants a gem
 *   - TROLL (troll.ldy)        - Troll attacks (can kill you!)
 *   - UGLYSTICK (ugly.ldy)     - Pretty/ugly stick (+/- charm)
 *
 * Bard songs (bardsong.ldy):
 *   - BARDSONG                 - Main entry: unisex/male/female songs
 *   - UNISEXSONGS              - Generic songs for any gender
 *   - MALESONGS                - Male-specific songs
 *   - FEMALESONGS              - Female-specific songs
 *
 * Leave-bank event (bank.ldy):
 *   - LEAVEBANK -> AMULET (amulet.ldy)  - Amulet of Accuracy offer
 *
 * Leave-inn event (inn.ldy):
 *   - LEAVEINN -> AMULET (amulet.ldy)   - Amulet of Accuracy offer
 *
 * The manager pre-parses the LORD.LDY dispatch table to understand the
 * configured events, then provides an API for the game to run them.
 */

'use strict';

import * as path from 'path';
import * as fs from 'fs';
import { LdyExecutor, EndGameSignal } from './LdyExecutor';
import type IO from '../io/IO';
import type Player from '../Player';
import type State from '../State';
import type { Settings, ArmourStats, WeaponStats, UiMode } from '../types';
import { Lazy } from '@lordts/util/Lazy';

export interface LdyForestEvent {
    section: string;
    filename: string;
}

export interface LdyEventReference {
    filename: string;
    defaultSection: string | null;
}

export class LdyManager {
    private _executor: LdyExecutor;

    constructor(
        private ldyDirs: string[],
        private io: IO,
        private _uiMode: UiMode,
        private settings: Settings,
        private _running: Lazy<boolean>,
        private _gameState: Lazy<State>,
        private armourStats: ArmourStats[],
        private weaponStats: WeaponStats[],
        private _player: Lazy<Player>,
    ) {
        // Pre-load all LDY files at construction time
        this._executor = new LdyExecutor(io, _uiMode, settings, ldyDirs, _running, _gameState, armourStats, weaponStats, _player.value);
    }

    get rip(): boolean { return this._uiMode.mode === 'rip'; }

    private _normalizeRequestedFilename(filename: string): string {
        return /\.ldy$/i.test(filename) ? filename : filename + '.ldy';
    }

    resolveFilename(filename: string): string {
        const normalized = this._normalizeRequestedFilename(filename);
        const candidates = [normalized, normalized.toLowerCase(), normalized.toUpperCase()];
        for (const dir of this.ldyDirs) {
            for (const candidate of candidates) {
                const filePath = path.join(dir, candidate);
                if (fs.existsSync(filePath)) {
                    return path.basename(filePath);
                }
            }
        }
        return normalized;
    }

    private _readLdyFile(filename: string): string | null {
        const resolved = this.resolveFilename(filename);
        const candidates = [resolved, resolved.toUpperCase(), resolved.toLowerCase()];
        for (const dir of this.ldyDirs) {
            for (const candidate of candidates) {
                const filePath = path.join(dir, candidate);
                if (fs.existsSync(filePath)) {
                    return fs.readFileSync(filePath, 'utf-8');
                }
            }
        }
        return null;
    }

    getDefaultEventSection(filename: string): string | null {
        const fileText = this._readLdyFile(filename);
        if (!fileText) {
            return null;
        }

        const installMatch = fileText.match(/@#INSTALL([\s\S]*?)(?:^@#\S|\s*$)/im);
        const installBlock = installMatch?.[1] || '';
        const installRunsubMatch = installBlock.match(/^\s*@runsub\s+([A-Z0-9_]+)\b/im);
        if (installRunsubMatch) {
            return installRunsubMatch[1].toUpperCase();
        }

        const sections = [...fileText.matchAll(/^\s*@#([A-Z0-9_]+)\s*$/gim)]
            .map((match) => match[1].toUpperCase())
            .filter((section) => section !== 'INSTALL' && section !== 'UNINSTALL');

        return sections[0] || null;
    }

    resolveEventReference(filename: string): LdyEventReference {
        const resolvedFilename = this.resolveFilename(filename);
        return {
            filename: resolvedFilename,
            defaultSection: this.getDefaultEventSection(resolvedFilename),
        };
    }

    getAvailableEventFiles(): LdyEventReference[] {
        const files = new Map<string, string>();

        for (const dir of this.ldyDirs) {
            if (!fs.existsSync(dir)) {
                continue;
            }

            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (!entry.isFile() || !/\.ldy$/i.test(entry.name)) {
                    continue;
                }

                const key = entry.name.toLowerCase();
                if (!files.has(key)) {
                    files.set(key, entry.name);
                }
            }
        }

        return [...files.values()]
            .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
            .map((filename) => this.resolveEventReference(filename));
    }

    getForestEvents(): LdyForestEvent[] {
        const fileText = this._readLdyFile('lord.ldy');
        if (!fileText) {
            return [];
        }

        const events = new Map<string, LdyForestEvent>();
        // lord.ldy lines can have optional weight prefix (e.g. "3: @runsub HORSE horse.ldy")
        const runsubPattern = /^\s*\d*:?\s*@runsub\s+([A-Z0-9_]+)\s+([^\s;]+)/gim;
        let match: RegExpExecArray | null;
        while ((match = runsubPattern.exec(fileText)) !== null) {
            const section = match[1].toUpperCase();
            const filename = match[2];
            // Skip the self-referential @runsub LORD entry (the dispatch section, not an event)
            if (section === 'LORD') {
                continue;
            }
            events.set(section, { section, filename });
        }

        return [...events.values()].sort((left, right) => left.section.localeCompare(right.section));
    }

    /**
     * Run the main LORD.LDY forest event dispatch.
     * LORD.LDY is the master random event dispatcher - it picks a random
     * event from its configured table (official + 3rd-party) and runs it.
     * Sysops can customize runtime/lord.ldy to add, remove, or reweight events.
     *
     * Called by Forest.ts whenever a LDY-based forest event slot triggers.
     *
     * @returns 'endquest', 'endgame', or 'ok'
     */
    async runForestEvent(): Promise<string> {
        try {
            const result = await this._executor.run('LORD', 'lord.ldy');
            this._postEvent();
            return result;
        } catch (e) {
            if (e instanceof EndGameSignal) {
                return 'endgame';
            }
            console.error('[LDY] Forest event error:', (e as Error).message || e);
            return 'ok';
        }
    }

    /**
     * Run the bard song event.
     * Executes the BARDSONG section from bardsong.ldy.
     *
     * @returns 'endquest' or 'ok'
     */
    async runBardSong(): Promise<string> {
        try {
            const result = await this._executor.run('BARDSONG', 'bardsong.ldy');
            this._postEvent();
            return result;
        } catch (e) {
            console.error('[LDY] Bard song error:', (e as Error).message || e);
            return 'ok';
        }
    }

    /**
     * Run the leave-bank event (LEAVEBANK section from bank.ldy).
     *
     * @returns 'endquest' or 'ok'
     */
    async runLeaveBankEvent(): Promise<string> {
        try {
            const result = await this._executor.run('LEAVEBANK', 'bank.ldy');
            this._postEvent();
            return result;
        } catch (e) {
            console.error('[LDY] Leave bank event error:', (e as Error).message || e);
            return 'ok';
        }
    }

    /**
     * Run the leave-inn event (LEAVEINN section from inn.ldy).
     *
     * @returns 'endquest' or 'ok'
     */
    async runLeaveInnEvent(): Promise<string> {
        try {
            const result = await this._executor.run('LEAVEINN', 'inn.ldy');
            this._postEvent();
            return result;
        } catch (e) {
            console.error('[LDY] Leave inn event error:', (e as Error).message || e);
            return 'ok';
        }
    }

    /**
     * Run a specific named event from a specific LDY file.
     * Used for custom/direct event triggering.
     *
     * @param section - Section name (e.g., "OLDMAN")
     * @param filename - LDY file (e.g., "oldman.ldy")
     * @returns Result
     */
    async runEvent(section: string, filename: string): Promise<string> {
        try {
            const result = await this._executor.run(section, filename);
            this._postEvent();
            return result;
        } catch (e) {
            console.error(`[LDY] Event error (${section}/${filename}):`, (e as Error).message || e);
            return 'ok';
        }
    }

    /**
     * Check if LDY files are available (lord.ldy exists in any search directory)
     */
    isAvailable(): boolean {
        return this.ldyDirs.some(dir => fs.existsSync(path.join(dir, 'lord.ldy')));
    }

    /**
     * Post-event processing - check if player was killed, save state, etc.
     */
    private _postEvent(): void {
        const player = this._player.value;

        // Check if player was killed by the event
        if (player.hp <= 0 && !player.dead) {
            player.dead = true;
            player.hp = 0;
        }

        // Defensive clamp: LDY scripts can set arbitrary values; prevent game-breaking negatives
        if (player.cha < 1) player.cha = 1;
        if (player.gold < 0) player.gold = 0;
        if (player.gem < 0) player.gem = 0;
        if (player.forest_fights < 0) player.forest_fights = 0;
        if (player.pvp_fights < 0) player.pvp_fights = 0;
        if (player.bank < 0) player.bank = 0;

        // Save player after event
        player.put();
    }
}

export { LdyManager as default };
