/**
 * GodMode - Sysop in-game debugger for LORD.
 *
 * Provides an interactive command shell accessible to the sysop during a
 * live session. Allows inspecting and modifying player fields, triggering
 * forest and Lady events, adjusting random number seeds for testing, and
 * other diagnostic operations.
 */
'use strict';

import { Player_Def, type FieldDef as PlayerFieldDef } from '@lordts/storage/RecordDefs';
import { clearQueuedRandomValues, getQueuedRandomValues, prettyInt, queueRandomValues } from '@lordts/util/Util';
import { GameExitError } from './GameExitError';
import type IO from './io/IO';
import type Player from './Player';
import type Forest from './locations/Forest';
import type { RedDragonInn } from './locations/RedDragonInn';
import type { Bard } from './locations/Bard';
import type { Blackjack } from './locations/Blackjack';
import type { Violet } from './locations/Violet';
import type { LdyForestEvent, LdyManager } from './lady/LdyManager';

interface GodFieldDescriptor {
    prop: string;
    name: string;
    type: string;
    persisted: boolean;
}

// Extra runtime-only toggles that live on Player but not in the persisted
// record schema. God mode exposes them beside Player_Def for one unified shell.
const EXTRA_FIELDS: GodFieldDescriptor[] = [
    { prop: 'expert', name: 'Expert Mode', type: 'Boolean', persisted: false },
    { prop: 'has_fairy', name: 'Has Fairy', type: 'Boolean', persisted: false },
    { prop: 'fairy_lore', name: 'Fairy Lore', type: 'Boolean', persisted: false },
    { prop: 'magically_delicious', name: 'Magically Delicious', type: 'Boolean', persisted: false },
];

const FIELD_ALIASES: Record<string, string> = {
    armor: 'arm',
    armour: 'arm',
    charm: 'cha',
    class: 'clss',
    defense: 'def',
    defence: 'def',
    forestfights: 'forest_fights',
    gems: 'gem',
    maxhp: 'hp_max',
    pvpfights: 'pvp_fights',
    strength: 'str',
};

export default class GodMode {
    /** Whether god mode is currently active (prevents re-entrant entry). */
    private _active = false;
    /** All player record fields plus non-persisted runtime flags, built from Player_Def + EXTRA_FIELDS. */
    private readonly fieldDescriptors: GodFieldDescriptor[];
    /** Rolling history of commands entered this session, for up/down arrow recall. */
    private readonly commandHistory: string[] = [];
    /** Maximum number of entries retained in commandHistory. */
    private readonly maxHistoryEntries = 100;

    constructor(
        private io: IO,
        private player: Player,
        private forest: Forest,
        private redDragonInn: RedDragonInn,
        private bard: Bard,
        private violet: Violet,
        private blackjack: Blackjack,
        private ldyManager: LdyManager,
    ) {
        this.fieldDescriptors = [
            // Merge persisted Player_Def fields with the runtime-only extras so
            // `get`/`set` can resolve both through the same descriptor list.
            ...Player_Def.map((field: PlayerFieldDef) => ({
                prop: field.prop,
                name: field.name,
                type: field.type,
                persisted: true,
            })),
            ...EXTRA_FIELDS,
        ];
    }

    get active(): boolean {
        return this._active;
    }

    // ── Shell entry ──────────────────────────────────────────────────────

    async enter(): Promise<void> {
        if (this._active) {
            return;
        }

        this._active = true;
        try {
            await this.io.sln();
            await this.io.lln('`%God mode`2 ready. Type `0help`2 or `0?`2 for commands, or `0exit`2/`0q`2/`0x`2 to return. Use `0up/down arrows`2 for command history.');

            while (true) {
                const command = (await this.readCommandLine()).trim();
                await this.io.sln();
                if (!command) {
                    continue;
                }

                this.rememberCommand(command);

                try {
                    if (await this.execute(command)) {
                        break;
                    }
                } catch (error) {
                    if (error instanceof GameExitError) {
                        throw error;
                    }
                    const message = error instanceof Error ? error.message : String(error);
                    await this.io.lln('`4God mode error:`2 ' + message);
                }
            }
        } finally {
            this._active = false;
        }
    }

    // ── Field resolution ───────────────────────────────────────────────

    private normalize(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    private commandName(command: string): string {
        const trimmed = command.trim();
        if (trimmed === '?') {
            return '?';
        }
        // Only the leading token controls command routing; the rest is handled
        // by the individual command parser.
        return this.normalize(trimmed.split(/\s+/)[0] || '');
    }

    private resetPaginationCounters(): void {
        this.io.input.curlinenum = 1;
        this.io.output.curlinenum = 1;
    }

    private activeRecord(): Record<string, unknown> | null {
        return this.player.player as Record<string, unknown> | null;
    }

    private currentValue(fieldName: string): unknown {
        const record = this.activeRecord();
        if (record && fieldName in record) {
            return record[fieldName];
        }
        return (this.player as unknown as Record<string, unknown>)[fieldName];
    }

    private formatValue(value: unknown): string {
        if (value === undefined) return '(undefined)';
        if (value === null) return '(null)';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'number') return Number.isInteger(value) ? prettyInt(value) : String(value);
        if (typeof value === 'string') return value === '' ? '(empty)' : value;
        return JSON.stringify(value);
    }

    private resolveField(fieldName: string): GodFieldDescriptor | undefined {
        const normalized = FIELD_ALIASES[this.normalize(fieldName)] ?? this.normalize(fieldName);
        return this.fieldDescriptors.find((field) => this.normalize(field.prop) === normalized);
    }

    // ── Value parsing ───────────────────────────────────────────────────

    private parseBoolean(rawValue: string): boolean {
        const normalized = this.normalize(rawValue);
        if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
        throw new Error('Boolean fields accept true/false, yes/no, on/off, or 1/0.');
    }

    private stripQuotes(rawValue: string): string {
        if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
            return rawValue.slice(1, -1);
        }
        return rawValue;
    }

    private parseValue(field: GodFieldDescriptor | undefined, rawValue: string): string | number | boolean {
        const value = this.stripQuotes(rawValue);
        const type = field?.type || '';
        if (type === 'Boolean') {
            return this.parseBoolean(value);
        }
        if (type.includes('Integer')) {
            const parsed = parseInt(value, 10);
            if (Number.isNaN(parsed)) {
                throw new Error('Numeric fields require an integer value.');
            }
            return parsed;
        }
        if (['true', 'false', 'yes', 'no', 'on', 'off', '0', '1'].includes(this.normalize(value))) {
            return this.parseBoolean(value);
        }
        if (/^-?\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        return value;
    }

    // ── Command history ───────────────────────────────────────────────

    private rememberCommand(command: string): void {
        const normalized = this.commandName(command);
        if (command.length === 0 || ['exit', 'quit', 'return', 'q', 'x'].includes(normalized)) {
            return;
        }
        this.commandHistory.push(command);
        if (this.commandHistory.length > this.maxHistoryEntries) {
            this.commandHistory.shift();
        }
    }

    // ── Command execution ──────────────────────────────────────────────

    private async renderCommandLine(buffer: string): Promise<void> {
        this.io.print('\r');
        await this.io.lw('`%god`2> `%');
        this.io.print(buffer);
        this.io.cleareol();
        this.io.flush();
    }

    private async readRawKey(): Promise<string> {
        const ch = await this.io.input.session.getkey();
        if (ch === 'CONNECTION_CLOSED') {
            throw new GameExitError();
        }
        return ch;
    }

    private async readEscapeSequence(): Promise<'up' | 'down' | 'left' | 'right' | 'escape' | 'unknown'> {
        if (!(await this.io.waitkey(10))) {
            return 'escape';
        }

        // Parse the ANSI/VT100 arrow-key suffix after the leading ESC byte.
        const prefix = await this.readRawKey();
        if (prefix !== '[' && prefix !== 'O') {
            return 'escape';
        }
        if (!(await this.io.waitkey(10))) {
            return 'escape';
        }

        const code = await this.readRawKey();
        switch (code) {
            case 'A':
                return 'up';
            case 'B':
                return 'down';
            case 'C':
                return 'right';
            case 'D':
                return 'left';
            default:
                return 'unknown';
        }
    }

    private async readCommandLine(): Promise<string> {
        let buffer = '';
        let draft = '';
        let historyIndex = this.commandHistory.length;

        this.resetPaginationCounters();
        await this.renderCommandLine(buffer);

        while (true) {
            const ch = await this.readRawKey();

            if (ch === '\r' || ch === '\n') {
                return buffer;
            }

            if (ch === '\x1b') {
                switch (await this.readEscapeSequence()) {
                    case 'up':
                        if (this.commandHistory.length === 0 || historyIndex === 0) {
                            continue;
                        }
                        if (historyIndex === this.commandHistory.length) {
                            draft = buffer;
                        }
                        historyIndex -= 1;
                        buffer = this.commandHistory[historyIndex];
                        await this.renderCommandLine(buffer);
                        continue;
                    case 'down':
                        if (historyIndex >= this.commandHistory.length) {
                            continue;
                        }
                        historyIndex += 1;
                        buffer = historyIndex === this.commandHistory.length ? draft : this.commandHistory[historyIndex];
                        await this.renderCommandLine(buffer);
                        continue;
                    case 'left':
                    case 'right':
                    case 'unknown':
                        continue;
                    case 'escape':
                        return buffer;
                }
            }

            if (ch === '\x08' || ch === '\x7f') {
                if (buffer.length > 0) {
                    buffer = buffer.slice(0, -1);
                    await this.renderCommandLine(buffer);
                }
                continue;
            }

            if (ch.charCodeAt(0) < 32 || buffer.length >= 160) {
                continue;
            }

            buffer += ch[0];
            if (historyIndex === this.commandHistory.length) {
                draft = buffer;
            }
            await this.renderCommandLine(buffer);
        }
    }

    private ensurePlayerLoaded(): void {
        if (!this.player.player) {
            throw new Error('No active player is loaded yet. Enter the realm first.');
        }
    }

    private async printHelp(): Promise<void> {
        await this.io.lln('`2Commands:');
        await this.io.lln('  `0help`2 or `0?`2 - show this help');
        await this.io.lln('  `0status`2 - show player summary and queued random values');
        await this.io.lln('  `0fields [extra|all]`2 - list editable fields');
        await this.io.lln('  `0show <field>`2 - show one field value');
        await this.io.lln('  `0set <field> <value>`2 - change a field and auto-save persisted fields');
        await this.io.lln('  `0save`2 - write the current player record to storage');
        await this.io.lln('  `0random`2 - show queued random values');
        await this.io.lln('  `0random queue <v1> <v2> ...`2 - queue exact future random(n) returns');
        await this.io.lln('  `0random clear`2 - clear queued random values');
        await this.io.lln('  `0event list [forest|inn|bank|darkhorse|ldy]`2 - list triggerable events');
        await this.io.lln('  `0event forest <name>`2 - run a forest event or forest LDY section');
        await this.io.lln('  `0event inn <bartender|violet|bard|bard_song|leave_inn>`2 - run inn flows');
        await this.io.lln('  `0event bank leave_bank`2 - run the leave-bank LDY event');
        await this.io.lln('  `0event darkhorse <tavern|blackjack>`2 - enter DarkCloak Tavern or blackjack');
        await this.io.lln('  `0event ldy <file> [section]`2 - run an LDY event by file, with section optional');
        await this.io.lln('  `0up/down arrows`2 - browse previously entered god commands for this session');
        await this.io.lln('  `0exit`2, `0q`2, `0x`2 - return to the game');
        await this.io.lln('`2Examples:');
        await this.io.lln('  `0set gold 500000');
        await this.io.lln('  `0set has_fairy true');
        await this.io.lln('  `0random queue 1 14 0');
        await this.io.lln('  `0event forest fairy');
        await this.io.lln('  `0event forest oldman');
        await this.io.lln('  `0event inn violet');
        await this.io.lln('  `0event ldy gem');
        await this.io.lln('  `0event ldy beasts-mirror BEASTSMIRROR');
    }

    private async printStatus(): Promise<void> {
        const queued = getQueuedRandomValues();
        const record = this.activeRecord();

        if (!record) {
            await this.io.lln('`2No active player loaded yet.');
            await this.io.lln('`2Queued random values: `0' + (queued.length > 0 ? queued.join(', ') : '(none)'));
            return;
        }

        await this.io.lln('`2Player: `0' + this.formatValue(record.name) + '`2  Record: `0' + this.formatValue(record.Record));
        await this.io.lln('`2Level: `0' + this.formatValue(record.level) + '`2  HP: `0' + this.formatValue(record.hp) + '`2/`0' + this.formatValue(record.hp_max));
        await this.io.lln('`2Gold: `0' + this.formatValue(record.gold) + '`2  Bank: `0' + this.formatValue(record.bank) + '`2  Gems: `0' + this.formatValue(record.gem));
        await this.io.lln('`2Forest fights: `0' + this.formatValue(record.forest_fights) + '`2  PvP fights: `0' + this.formatValue(record.pvp_fights));
        await this.io.lln('`2Charm: `0' + this.formatValue(record.cha) + '`2  Strength: `0' + this.formatValue(record.str) + '`2  Defense: `0' + this.formatValue(record.def));
        await this.io.lln('`2Queued random values: `0' + (queued.length > 0 ? queued.join(', ') : '(none)'));
    }

    private async listFields(mode?: string): Promise<void> {
        const normalizedMode = this.normalize(mode || '');
        const includePersisted = normalizedMode !== 'extra';
        const includeExtras = normalizedMode === 'all' || normalizedMode === 'extra';

        for (const field of this.fieldDescriptors) {
            if (field.persisted && !includePersisted) continue;
            if (!field.persisted && !includeExtras) continue;
            await this.io.lln(
                '  `0' + field.prop + '`2 [' + field.type + (field.persisted ? ', saved' : ', transient') + '] = `0' +
                this.formatValue(this.currentValue(field.prop))
            );
        }
    }

    private async showField(fieldName: string): Promise<void> {
        const field = this.resolveField(fieldName);
        const prop = field?.prop || fieldName;
        await this.io.lln('`2' + prop + ': `0' + this.formatValue(this.currentValue(prop)));
    }

    private async setField(command: string): Promise<void> {
        this.ensurePlayerLoaded();

        const trimmed = command.trim();
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) {
            throw new Error('Usage: set <field> <value>');
        }

        const fieldName = parts[1];
        const field = this.resolveField(fieldName);
        const prop = field?.prop || fieldName;
        let rawValue = trimmed.slice((parts[0] + ' ' + fieldName).length).trim();

        if (rawValue.length === 0) {
            const currentValue = this.currentValue(prop);
            const editValue = typeof currentValue === 'string'
                ? currentValue
                : typeof currentValue === 'number' || typeof currentValue === 'boolean'
                    ? String(currentValue)
                    : '';
            await this.io.lw('`2New value for `0' + prop + '`2 [`%' + this.formatValue(currentValue) + '`2] : `%');
            rawValue = await this.io.getstr({ len: 120, edit: editValue });
            await this.io.sln();
        }

        const value = this.parseValue(field, rawValue);
        const record = this.activeRecord();
        if (field?.persisted) {
            (this.player as unknown as Record<string, unknown>)[prop] = value;
            this.player.put();
            await this.io.lln('`2Saved `0' + prop + '`2 = `0' + this.formatValue(value));
            return;
        }

        if (record) {
            record[prop] = value;
        } else {
            (this.player as unknown as Record<string, unknown>)[prop] = value;
        }
        await this.io.lln('`2Set transient field `0' + prop + '`2 = `0' + this.formatValue(value));
    }

    private async savePlayer(): Promise<void> {
        this.ensurePlayerLoaded();
        this.player.put();
        await this.io.lln('`2Player record saved.');
    }

    private async showRandomQueue(): Promise<void> {
        const queued = getQueuedRandomValues();
        await this.io.lln('`2Queued random values: `0' + (queued.length > 0 ? queued.join(', ') : '(none)'));
    }

    private async handleRandomCommand(command: string): Promise<void> {
        const parts = command.trim().split(/\s+/).slice(1);
        if (parts.length === 0 || this.normalize(parts[0]) === 'show') {
            await this.showRandomQueue();
            return;
        }

        const subcommand = this.normalize(parts[0]);
        if (subcommand === 'clear') {
            clearQueuedRandomValues();
            await this.io.lln('`2Queued random values cleared.');
            return;
        }

        if (subcommand !== 'queue') {
            throw new Error('Usage: random, random queue <values...>, or random clear');
        }

        const values = parts.slice(1).flatMap((part) => part.split(',')).filter((part) => part.length > 0).map((part) => {
            const parsed = parseInt(part, 10);
            if (Number.isNaN(parsed)) {
                throw new Error('Random queue values must be integers.');
            }
            return parsed;
        });

        if (values.length === 0) {
            throw new Error('Provide at least one integer value to queue.');
        }

        queueRandomValues(values);
        await this.io.lln('`2Queued random values: `0' + getQueuedRandomValues().join(', '));
    }

    private lookupForestLdyEvent(eventName: string): LdyForestEvent | undefined {
        const normalized = this.normalize(eventName);
        return this.ldyManager.getForestEvents().find((event) => {
            const fileBase = event.filename.replace(/\.ldy$/i, '');
            return this.normalize(event.section) === normalized || this.normalize(fileBase) === normalized;
        });
    }

    private async listEvents(category?: string): Promise<void> {
        const normalized = this.normalize(category || 'all');
        if (normalized === 'all' || normalized === 'forest') {
            await this.io.lln('`2Forest events:');
            await this.io.lln('  `0look`2 - run a normal forest search using queued random values');
            await this.io.lln('  `0flower_garden, class_event, death_knight, mystical, thief, fairy');
            await this.io.lln('  `0olivia, rescue_the_princess, find_lost_gold, darkhorse, ldy');
            for (const event of this.ldyManager.getForestEvents()) {
                await this.io.lln('  `0' + event.section.toLowerCase() + '`2 -> `0' + event.filename);
            }
        }
        if (normalized === 'all' || normalized === 'inn') {
            await this.io.lln('`2Inn events:');
            await this.io.lln('  `0bartender, violet, bard, bard_song, leave_inn');
        }
        if (normalized === 'all' || normalized === 'bank') {
            await this.io.lln('`2Bank events:');
            await this.io.lln('  `0leave_bank');
        }
        if (normalized === 'all' || normalized === 'darkhorse') {
            await this.io.lln('`2Dark horse events:');
            await this.io.lln('  `0tavern`2 - enter the tavern menu (Chance, Old Man, gambling, conversation)');
            await this.io.lln('  `0blackjack');
        }
        if (normalized === 'all' || normalized === 'ldy') {
            await this.io.lln('`2Direct LDY runner:');
            await this.io.lln('  `0event ldy <file> [section]');
            await this.io.lln('  `2If section is omitted, the file\'s main event entrypoint is used.');
            for (const eventFile of this.ldyManager.getAvailableEventFiles()) {
                await this.io.lln(
                    '  `0' + eventFile.filename + '`2 -> `0' + (eventFile.defaultSection || '(no default section)')
                );
            }
        }
        await this.io.lln('`2Use `0random queue`2 before an event to force nested random branches.');
    }

    private async runEvent(command: string): Promise<void> {
        this.ensurePlayerLoaded();

        const parts = command.trim().split(/\s+/);
        if (parts.length < 2 || this.normalize(parts[1]) === 'list') {
            await this.listEvents(parts[2]);
            return;
        }

        const category = this.normalize(parts[1]);
        const name = this.normalize(parts[2] || '');

        switch (category) {
            case 'forest':
                await this._runForestEvent(parts, name);
                return;
            case 'inn':
                await this._runInnEvent(parts, name);
                return;
            case 'bank':
                if (name === 'leave_bank' || name === 'leavebank') {
                    await this.io.lln('`2Running leave-bank LDY event.');
                    await this.ldyManager.runLeaveBankEvent();
                    return;
                }
                throw new Error('Unknown bank event: ' + (parts[2] || '(missing)'));
            case 'darkhorse':
            case 'dark_horse':
                await this._runDarkhorseEvent(parts, name);
                return;
            case 'ldy':
                await this._runLdyEvent(parts);
                return;
            default:
                throw new Error('Unknown event category: ' + parts[1]);
        }
    }

    private async _runForestEvent(parts: string[], name: string): Promise<void> {
        if (!name) {
            await this.listEvents('forest');
            return;
        }
        if (name === 'ldy' || name === 'dispatcher') {
            if (parts[3]) {
                const directSection = parts[3].toUpperCase();
                const directEvent = this.lookupForestLdyEvent(parts[3]);
                const filename = parts[4] || directEvent?.filename;
                if (!filename) {
                    throw new Error('Specify the LDY file, or use a forest LDY event name from `event list forest`.');
                }
                await this.io.lln('`2Running forest LDY event `0' + directSection + '`2 from `0' + filename);
                await this.ldyManager.runEvent(directSection, filename);
                return;
            }
            await this.io.lln('`2Running forest LDY dispatcher.');
            await this.forest.triggerGodEvent('ldy');
            return;
        }

        const forestLdyEvent = this.lookupForestLdyEvent(name);
        if (forestLdyEvent) {
            await this.io.lln('`2Running forest LDY event `0' + forestLdyEvent.section + '`2 from `0' + forestLdyEvent.filename);
            await this.ldyManager.runEvent(forestLdyEvent.section, forestLdyEvent.filename);
            return;
        }

        await this.io.lln('`2Running forest event `0' + name);
        await this.forest.triggerGodEvent(name);
    }

    private async _runInnEvent(parts: string[], name: string): Promise<void> {
        switch (name) {
            case 'bartender':
                await this.io.lln('`2Running inn bartender flow.');
                await this.redDragonInn.talkWithBartender();
                return;
            case 'violet':
                await this.io.lln('`2Running Violet flow.');
                await this.violet.flirtWithViolet();
                return;
            case 'bard':
                await this.io.lln('`2Running Seth Able conversation.');
                await this.bard.talkToBard();
                return;
            case 'bard_song':
            case 'bardsong':
                await this.io.lln('`2Running bard song.');
                await this.bard.bardSong();
                return;
            case 'leave_inn':
            case 'leaveinn':
                await this.io.lln('`2Running leave-inn LDY event.');
                await this.ldyManager.runLeaveInnEvent();
                return;
            default:
                throw new Error('Unknown inn event: ' + (parts[2] || '(missing)'));
        }
    }

    private async _runDarkhorseEvent(parts: string[], name: string): Promise<void> {
        switch (name) {
            case 'tavern':
            case 'darkhorse':
            case 'darkcloak':
                await this.io.lln('`2Entering the DarkCloak Tavern.');
                await this.forest.triggerGodEvent('darkhorse');
                return;
            case 'blackjack':
                await this.io.lln('`2Running blackjack.');
                await this.blackjack.run();
                return;
            default:
                throw new Error('Unknown dark horse event: ' + (parts[2] || '(missing)'));
        }
    }

    private async _runLdyEvent(parts: string[]): Promise<void> {
        const fileArg = parts[2];
        const sectionArg = parts[3];
        if (!fileArg) {
            throw new Error('Usage: event ldy <file> [section]');
        }

        const eventRef = this.ldyManager.resolveEventReference(fileArg);
        const section = sectionArg ? sectionArg.toUpperCase() : eventRef.defaultSection;
        if (!section) {
            throw new Error('Could not determine a default section for ' + eventRef.filename + '. Specify one explicitly.');
        }

        await this.io.lln('`2Running LDY section `0' + section + '`2 from `0' + eventRef.filename);
        await this.ldyManager.runEvent(section, eventRef.filename);
    }

    async execute(command: string): Promise<boolean> {
        const trimmed = command.trim();
        const normalized = this.commandName(trimmed);

        switch (normalized) {
            case '?':
            case 'help':
                await this.printHelp();
                return false;
            case 'status':
                await this.printStatus();
                return false;
            case 'fields': {
                const parts = trimmed.split(/\s+/);
                await this.listFields(parts[1]);
                return false;
            }
            case 'show': {
                const parts = trimmed.split(/\s+/);
                if (!parts[1]) {
                    await this.printStatus();
                } else {
                    await this.showField(parts[1]);
                }
                return false;
            }
            case 'set':
                await this.setField(trimmed);
                return false;
            case 'save':
                await this.savePlayer();
                return false;
            case 'random':
                await this.handleRandomCommand(trimmed);
                return false;
            case 'event':
                await this.runEvent(trimmed);
                return false;
            case 'exit':
            case 'quit':
            case 'return':
            case 'q':
            case 'x':
                await this.io.lln('`2Leaving god mode.');
                return true;
            default:
                throw new Error('Unknown command: ' + trimmed);
        }
    }
}