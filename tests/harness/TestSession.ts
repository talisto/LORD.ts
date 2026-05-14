/**
 * TestSession - A mock ISession for automated testing of LORD.
 *
 * Behaves like a real terminal/connection to the game code, but:
 *   - Input is driven by a pre-loaded queue of keystrokes / strings
 *   - Output is captured into a buffer for assertions
 *   - waitkey() never blocks - it checks the queue instantly
 *
 * Analogous to ConsoleSession / WebSocketSession but for testing.
 *
 * Usage:
 *   const session = new TestSession();
 *   harness.queueKeys('E', '\r', 'TestUser\r', 'M', 'K');
 *   // ... run game code that reads input ...
 *   expect(harness.output).toContain('Welcome');
 */

import type { ISession, ConsoleAttr, GetstrOptions } from '@lordts/core/types';

export class TestSession implements ISession {
    /** Accumulated raw output from the game */
    outputParts: string[] = [];

    /** Pre-loaded input queue - each element is one key or one getstr() response */
    inputQueue: string[] = [];

    /** ANSI attribute state */
    attr: ConsoleAttr = { value: 7 };

    /** Terminal dimensions */
    rows: number = 24;
    cols: number = 80;

    /** Whether ANSI is supported (always true in tests for simplicity) */
    ansiSupported: boolean = true;

    /** Whether ANSI terminal mode is active - mirrors ansiSupported for testing. */
    get ansi(): boolean {
        return this.ansiSupported;
    }

    lastActivityTime: number = 0;

    // ── Output ──────────────────────────────────────────────────────────

    puts(s: string): void {
        this.outputParts.push(String(s) + '\n');
    }

    write(s: string): void {
        this.outputParts.push(String(s));
    }

    print(s: string): void {
        this.outputParts.push(String(s));
    }

    center(s: string): void {
        const str = String(s);
        this.outputParts.push(str.padStart(Math.floor((80 + str.length) / 2)) + '\n');
    }

    // ── Cursor control ──────────────────────────────────────────────────

    gotoxy(x: number, y: number): void {
        // tracked as a marker in output for assertions
        this.outputParts.push(`\x1b[${y + 1};${x + 1}H`);
    }

    clear(): void {
        this.outputParts.push('\x1b[2J\x1b[H');
    }

    cleareol(): void {
        this.outputParts.push('\x1b[K');
    }

    // ── Input ───────────────────────────────────────────────────────────

    inkey(_timeout?: number): string | undefined {
        if (this.inputQueue.length > 0) {
            return this.inputQueue.shift()!;
        }
        return undefined;
    }

    waitkey(timeout?: number): Promise<boolean> {
        // Non-blocking polls (timeout=0) always return false so that
        // key-draining loops like flushKeys() are no-ops in tests.
        // With noTimeout=true on the test user, getkeyw() skips the
        // waitkey loop entirely and calls getkey() directly.
        if (timeout === 0) return Promise.resolve(false);
        return Promise.resolve(this.inputQueue.length > 0);
    }

    /** Tracks consecutive getkey() calls after input queue exhaustion */
    private _exhaustedCalls = 0;

    getkey(): Promise<string> {
        if (this.inputQueue.length > 0) {
            this._exhaustedCalls = 0;
            return Promise.resolve(this.inputQueue.shift()!);
        }
        // Allow a few default '\r' returns for simple "press a key" prompts.
        // After too many consecutive exhausted calls, throw to catch infinite
        // loops in menu-key validation (do-while) patterns.
        this._exhaustedCalls++;
        if (this._exhaustedCalls > 20) {
            throw new Error('TestSession input queue exhausted - queue more keys for this test path');
        }
        return Promise.resolve('\r');
    }

    getstr(mode?: GetstrOptions): Promise<string> {
        if (this.inputQueue.length > 0) {
            return Promise.resolve(this.inputQueue.shift()!);
        }
        return Promise.resolve(mode?.edit || '');
    }

    // ── Test helpers ────────────────────────────────────────────────────

    /** Queue a sequence of keystrokes / getstr responses */
    queueKeys(...keys: string[]): void {
        this.inputQueue.push(...keys);
    }

    /** Queue a string as individual character keystrokes (useful for getkey loops) */
    queueString(str: string): void {
        for (const ch of str) {
            this.inputQueue.push(ch);
        }
    }

    /** Get the full captured output as a single string */
    get output(): string {
        return this.outputParts.join('');
    }

    /** Get output with ANSI escape codes stripped */
    get plainOutput(): string {
        // Control-character escapes (\x1b) are intentional: we are stripping
        // ANSI escape sequences which begin with the ESC control character.
        // eslint-disable-next-line no-control-regex
        return this.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\[[0-9;]*[HJK]/g, '');
    }

    /** Search output for a plain-text substring (ignoring ANSI codes) */
    outputContains(text: string): boolean {
        return this.plainOutput.includes(text);
    }

    /** Reset all output and input state */
    reset(): void {
        this.outputParts = [];
        this.inputQueue = [];
        this.attr = { value: 7 };
    }

    /** Clear just the output buffer (keep remaining input) */
    clearOutput(): void {
        this.outputParts = [];
    }

    /** Return all remaining unprocessed input keys */
    get remainingInput(): string[] {
        return [...this.inputQueue];
    }

    flush(): void {
    }

    closeConnection(): void {
    }

    deliverKeys(str: string): void {
        this.outputParts.push(str);
    }
}

export default TestSession;
