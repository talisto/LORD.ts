/**
 * GameEvents - Typed event emitter for LORD GUI mode
 *
 * Provides a structured event system that game classes use to emit events
 * describing what is happening in the game. Transports (WebSocket, Telnet,
 * CLI) can subscribe to these events and forward them to their clients.
 *
 * CLI and Telnet ignore events by default. The WebSocket transport forwards
 * them as JSON messages so the web client can render graphics, animations,
 * or interactive UI elements.
 *
 * Events fall into several categories:
 *   - Navigation:   player enters a location (inn, forest, bank, etc.)
 *   - Combat:       encounter start, attack, defend, victory, defeat
 *   - Prompt:       the game is waiting for input with specific valid options
 *   - Player:       stat changes, level up, death, equipment changes
 *   - Social:       mail, chat, marriage, flirting
 *   - Economy:      gold/gem transactions, bank, shopping
 *   - System:       login, logout, daily maintenance
 */

'use strict';

// ── Event Payload Interfaces ────────────────────────────────────────────

/** Base shape shared by every game event. */
export interface GameEventBase {
    /** Event category (e.g. 'navigation', 'combat', 'prompt'). */
    category: string;
    /** Specific event name within the category. */
    event: string;
    /** ISO-8601 timestamp of when the event was emitted. */
    timestamp: string;
}

/** Navigation event - player enters or leaves a location. */
export interface NavigationEvent extends GameEventBase {
    category: 'navigation';
    event: 'enter' | 'leave';
    location: string;
}

/** Combat encounter start. */
export interface CombatEncounterEvent extends GameEventBase {
    category: 'combat';
    event: 'encounter';
    enemy: {
        name: string;
        hp: number;
        str: number;
        weapon: string;
        isDragon?: boolean;
        isPlayer?: boolean;
        image?: string;
    };
}

/** An attack lands (player or enemy). */
export interface CombatAttackEvent extends GameEventBase {
    category: 'combat';
    event: 'player_attack' | 'enemy_attack';
    damage: number;
    attacker: string;
    defender: string;
    defenderHp: number;
    critical?: boolean;
}

/** Combat ends. */
export interface CombatEndEvent extends GameEventBase {
    category: 'combat';
    event: 'victory' | 'defeat' | 'flee';
    enemy?: string;
    goldGained?: number;
    expGained?: number;
}

/** A prompt option for the GUI to display as a button. */
export interface PromptOption {
    /** The key the game expects (e.g. 'A', 'F', '\r'). */
    key: string;
    /** Human-readable label for the button (e.g. 'Attack', 'Forest'). */
    label: string;
}

/**
 * How the GUI should collect the player's input.
 * - `'key'` (default) - single keypress; clicking a button sends one character.
 * - `'string'` - multi-character selection; clicking a button sends all
 *   characters of the key followed by Enter.
 * - `'number'` - numeric input; the GUI shows an input field and sends
 *   the typed number followed by Enter.
 * - `'text'` - free-form text entry; the GUI shows a textarea.
 * - `'line'` - single-line text entry; the GUI shows a text input field.
 */
export type PromptInputMode = 'key' | 'string' | 'number' | 'text' | 'line';

/** The game is waiting for input. */
export interface PromptEvent extends GameEventBase {
    category: 'prompt';
    event: 'menu';
    /** Identifier for this prompt context (e.g. 'main_menu', 'forest_menu'). */
    promptId: string;
    /** Valid options the player can choose. */
    options: PromptOption[];
    /** How the GUI should collect input (default: 'key'). */
    inputMode?: PromptInputMode;
    /** Pre-filled default value for number/line/text input modes. */
    defaultValue?: string;
}

/** Player stat or status change. */
export interface PlayerEvent extends GameEventBase {
    category: 'player';
    event: 'level_up' | 'death' | 'revive' | 'equip' | 'stat_change' | 'class_change' | 'healed';
    details?: Record<string, unknown>;
}

/** Social interaction events. */
export interface SocialEvent extends GameEventBase {
    category: 'social';
    event: 'mail_received' | 'flirt' | 'marriage' | 'divorce';
    details?: Record<string, unknown>;
}

/** Economy / transaction events. */
export interface EconomyEvent extends GameEventBase {
    category: 'economy';
    event: 'purchase' | 'sell' | 'deposit' | 'withdraw' | 'transfer' | 'gold_gained' | 'gold_lost' | 'gem_gained';
    amount?: number;
    item?: string;
    details?: Record<string, unknown>;
}

/** System-level events (login, logout, maintenance). */
export interface SystemEvent extends GameEventBase {
    category: 'system';
    event: 'login' | 'logout' | 'daily_maintenance' | 'game_over';
    details?: Record<string, unknown>;
}

/** Forest-specific events */
export interface ForestEvent extends GameEventBase {
    category: 'forest';
    event: 'enter' | 'search' | 'find_gold' | 'find_gem' | 'fairy' | 'event';
    details?: Record<string, unknown>;
}

/** Union of all game event types. */
export type GameEvent =
    | NavigationEvent
    | CombatEncounterEvent
    | CombatAttackEvent
    | CombatEndEvent
    | PromptEvent
    | PlayerEvent
    | SocialEvent
    | EconomyEvent
    | SystemEvent
    | ForestEvent;

// ── Event Listener Type ─────────────────────────────────────────────────

export type GameEventListener = (event: GameEvent) => void;

// ── GameEvents Class ────────────────────────────────────────────────────

/**
 * GameEvents - typed event emitter for the LORD game.
 *
 * Game classes call `emit()` to fire events. Transports subscribe via
 * `on()` / `off()` to receive them. The emitter is synchronous - listeners
 * run inline, which is safe because they should only be forwarding the
 * event payload to the client (no async work or game-state mutation).
 */
export class GameEvents {
    private _listeners: GameEventListener[] = [];

    /** Subscribe to all game events. */
    on(listener: GameEventListener): void {
        this._listeners.push(listener);
    }

    /** Unsubscribe a previously registered listener. */
    off(listener: GameEventListener): void {
        const idx = this._listeners.indexOf(listener);
        if (idx !== -1) this._listeners.splice(idx, 1);
    }

    /** Emit an event to all registered listeners. */
    emit(event: GameEvent): void {
        for (const listener of this._listeners) {
            try {
                listener(event);
            } catch (_e) {
                // Listeners must not throw - swallow silently to protect game flow.
            }
        }
    }

    /** Remove all listeners (used during cleanup). */
    removeAllListeners(): void {
        this._listeners.length = 0;
    }

    // ── Convenience emitters ────────────────────────────────────────────

    /** Emit a navigation event. */
    emitNavigation(eventName: 'enter' | 'leave', location: string): void {
        this.emit({
            category: 'navigation',
            event: eventName,
            location,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a combat encounter event. */
    emitCombatEncounter(enemy: CombatEncounterEvent['enemy']): void {
        this.emit({
            category: 'combat',
            event: 'encounter',
            enemy,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a combat attack event. */
    emitCombatAttack(
        eventName: 'player_attack' | 'enemy_attack',
        attacker: string,
        defender: string,
        damage: number,
        defenderHp: number,
        critical?: boolean,
    ): void {
        this.emit({
            category: 'combat',
            event: eventName,
            attacker,
            defender,
            damage,
            defenderHp,
            critical,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a combat end event. */
    emitCombatEnd(eventName: 'victory' | 'defeat' | 'flee', enemy?: string, goldGained?: number, expGained?: number): void {
        this.emit({
            category: 'combat',
            event: eventName,
            enemy,
            goldGained,
            expGained,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a prompt event with available options for the GUI. */
    emitPrompt(promptId: string, options: PromptOption[], inputMode?: PromptInputMode, defaultValue?: string): void {
        // '?' is a terminal-only 'show menu' key that has no place in GUI button lists.
        const uiOptions = options.filter(o => o.key !== '?');
        this.emit({
            category: 'prompt',
            event: 'menu',
            promptId,
            options: uiOptions,
            ...(inputMode ? { inputMode } : {}),
            ...(defaultValue !== undefined ? { defaultValue } : {}),
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a player event. */
    emitPlayer(eventName: PlayerEvent['event'], details?: Record<string, unknown>): void {
        this.emit({
            category: 'player',
            event: eventName,
            details,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a social event. */
    emitSocial(eventName: SocialEvent['event'], details?: Record<string, unknown>): void {
        this.emit({
            category: 'social',
            event: eventName,
            details,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit an economy event. */
    emitEconomy(eventName: EconomyEvent['event'], amount?: number, item?: string, details?: Record<string, unknown>): void {
        this.emit({
            category: 'economy',
            event: eventName,
            amount,
            item,
            details,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a system event. */
    emitSystem(eventName: SystemEvent['event'], details?: Record<string, unknown>): void {
        this.emit({
            category: 'system',
            event: eventName,
            details,
            timestamp: new Date().toISOString(),
        });
    }

    /** Emit a forest event. */
    emitForest(eventName: ForestEvent['event'], details?: Record<string, unknown>): void {
        this.emit({
            category: 'forest',
            event: eventName,
            details,
            timestamp: new Date().toISOString(),
        });
    }
}

export default GameEvents;
