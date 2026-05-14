export default class MockConsole {
    output: string[];
    inputQueue: string[];
    attr: { value: number };
    rows: number;
    cols: number;
    lastActivityTime: number = 0;

    constructor() {
        this.output = [];
        this.inputQueue = [];
        this.attr = { value: 7 };
        this.rows = 24;
        this.cols = 80;
    }

    puts(s: string) {
        this.output.push(String(s) + '\n');
    }

    write(s: string) {
        this.output.push(String(s));
    }

    print(s: string) {
        this.output.push(String(s));
    }

    center(s: string) {
        const str = String(s);
        this.output.push(str.padStart(Math.floor((80 + str.length) / 2)) + '\n');
    }

    gotoxy(x: number, y: number) {
        this.output.push(`[GOTOXY ${x},${y}]`);
    }

    clear() {
        this.output.push('[CLEAR]');
    }

    cleareol() {
        this.output.push('[CLEAREOL]');
    }

    inkey() {
        if (this.inputQueue.length > 0) {
            return this.inputQueue.shift();
        }
        return undefined;
    }

    waitkey(_timeout?: number): Promise<boolean> {
        return Promise.resolve(this.inputQueue.length > 0);
    }

    getkey(): Promise<string> {
        if (this.inputQueue.length > 0) {
            return Promise.resolve(this.inputQueue.shift()!);
        }
        return Promise.resolve('\r'); // Default to enter if no input
    }

    getstr(_mode?: Record<string, unknown>): Promise<string> {
        if (this.inputQueue.length > 0) {
            return Promise.resolve(this.inputQueue.shift()!);
        }
        return Promise.resolve('');
    }

    // Test helpers
    pushInput(input: string) {
        this.inputQueue.push(input);
    }

    getOutput() {
        return this.output.join('');
    }

    clearOutput() {
        this.output = [];
    }

    flush(): void {
    }

    closeConnection(): void {
    }

    deliverKeys(str: string): void {
        this.output.push(str);
    }
}
