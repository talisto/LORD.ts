'use strict';

/**
 * SynchronetSocket.worker - Worker thread that manages the lordsrv TCP/TLS connection.
 *
 * Receives commands from the main thread via a SharedArrayBuffer, forwards them
 * to lordsrv, and writes the response back. Uses Atomics.waitAsync so the
 * event loop stays alive for async I/O.
 *
 * SharedArrayBuffer layout (Int32 header, then data areas):
 *   [0]  state:    0=idle, 1=connecting, 2=cmd_ready, 3=resp_ready, -1=error
 *   [1]  timeout:  timeout in ms for this command (0 = wait forever)
 *   [2]  cmdLen:   byte length of command in cmdArea
 *   [3]  respLen:  byte length of response in respArea
 *   [4]  status:   0=ok, 1=timeout, -1=error
 *   [20..20+512KB-1]    cmdArea
 *   [20+512KB..end]     respArea
 */

import { workerData } from 'worker_threads';
import * as net from 'net';
import * as tls from 'tls';

interface WorkerData {
    host: string;
    port: number;
    useTls: boolean;
    username: string;
    password: string;
    sharedBuffer: SharedArrayBuffer;
}

const { host, port, useTls, username, password, sharedBuffer } = workerData as WorkerData;

const HDR_INTS = 5;
const HDR_SIZE = HDR_INTS * 4; // 20 bytes
const CMD_SIZE = 512 * 1024;

// Int32Array index constants
const IDX_STATE = 0;
const IDX_TIMEOUT = 1;
const IDX_CMDLEN = 2;
const IDX_RESPLEN = 3;
const IDX_STATUS = 4;

// State constants
const ST_IDLE = 0;
const ST_CONNECTING = 1;
const ST_CMD = 2;
const ST_RESP = 3;
const ST_ERROR = -1;

// lordsrv response keywords that are followed by a length-framed body
const LENGTH_PREFIXED = new Set([
    'PlayerRecord', 'StateData', 'Mail', 'LogData', 'Conversation', 'IGMData',
]);

const hdrView = new Int32Array(sharedBuffer, 0, HDR_INTS);
const cmdBuf = Buffer.from(sharedBuffer, HDR_SIZE, CMD_SIZE);
const respBuf = Buffer.from(sharedBuffer, HDR_SIZE + CMD_SIZE, CMD_SIZE);

let socket: net.Socket | null = null;
let rxBuf = '';

// ── Socket helpers ──────────────────────────────────────────────────────────

function waitForLine(timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
        const tryRead = (): string | null => {
            const idx = rxBuf.indexOf('\n');
            if (idx === -1) return null;
            const line = rxBuf.substring(0, idx).replace(/\r$/, '');
            rxBuf = rxBuf.substring(idx + 1);
            return line;
        };

        const immediate = tryRead();
        if (immediate !== null) { resolve(immediate); return; }

        let timer: ReturnType<typeof setTimeout> | null = null;
        const interval = setInterval(() => {
            const line = tryRead();
            if (line !== null) {
                clearInterval(interval);
                if (timer) clearTimeout(timer);
                resolve(line);
            }
        }, 1);

        if (timeoutMs > 0) {
            timer = setTimeout(() => { clearInterval(interval); resolve(null); }, timeoutMs);
        }
    });
}

function waitForBytes(count: number, timeoutMs: number): Promise<string | null> {
    return new Promise((resolve) => {
        const tryRead = (): string | null => {
            if (rxBuf.length < count) return null;
            const data = rxBuf.substring(0, count);
            rxBuf = rxBuf.substring(count);
            return data;
        };

        const immediate = tryRead();
        if (immediate !== null) { resolve(immediate); return; }

        let timer: ReturnType<typeof setTimeout> | null = null;
        const interval = setInterval(() => {
            const data = tryRead();
            if (data !== null) {
                clearInterval(interval);
                if (timer) clearTimeout(timer);
                resolve(data);
            }
        }, 1);

        if (timeoutMs > 0) {
            timer = setTimeout(() => { clearInterval(interval); resolve(null); }, timeoutMs);
        }
    });
}

/**
 * Read a full response from lordsrv.
 * Handles both simple single-line responses and length-prefixed multi-line responses.
 */
async function readResponse(timeoutMs: number): Promise<{ data: string; timedOut: boolean }> {
    const firstLine = await waitForLine(timeoutMs);
    if (firstLine === null) return { data: '', timedOut: true };

    // Check for length-prefixed response: "<Keyword> <len>"
    const spaceIdx = firstLine.indexOf(' ');
    if (spaceIdx !== -1) {
        const keyword = firstLine.substring(0, spaceIdx);
        if (LENGTH_PREFIXED.has(keyword)) {
            const len = parseInt(firstLine.substring(spaceIdx + 1), 10);
            if (!isNaN(len) && len >= 0) {
                // Body is len bytes + \r\n terminator; strip the terminator
                const raw = await waitForBytes(len + 2, timeoutMs > 0 ? timeoutMs : 0);
                if (raw === null) return { data: '', timedOut: true };
                return { data: raw.substring(0, len), timedOut: false };
            }
        }
    }

    return { data: firstLine, timedOut: false };
}

// ── Connection ──────────────────────────────────────────────────────────────

function connectAndAuth(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (useTls) {
            socket = tls.connect({ host, port, rejectUnauthorized: false });
        } else {
            socket = net.connect({ host, port });
        }

        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => { rxBuf += chunk; });
        socket.once('error', reject);

        socket.once('connect', () => {
            socket!.write('Auth ' + username + ' ' + password + '\r\n');
            void waitForLine(10000).then((line) => {
                if (line === 'OK') resolve();
                else reject(new Error('Auth failed: ' + (line ?? 'timeout')));
            });
        });
    });
}

// ── Command loop ────────────────────────────────────────────────────────────

async function waitForCommand(): Promise<void> {
    while (true) {
        const current = Atomics.load(hdrView, IDX_STATE);
        if (current === ST_CMD) return;
        const result = Atomics.waitAsync(hdrView, IDX_STATE, current);
        if (result.async) await result.value;
        // Loop back and re-check
    }
}

async function main(): Promise<void> {
    Atomics.store(hdrView, IDX_STATE, ST_CONNECTING);

    try {
        await connectAndAuth();
    } catch (err) {
        const msg = String((err as Error).message ?? err);
        const bytes = Buffer.from(msg, 'utf8');
        bytes.copy(respBuf);
        Atomics.store(hdrView, IDX_RESPLEN, bytes.length);
        Atomics.store(hdrView, IDX_STATUS, ST_ERROR);
        Atomics.store(hdrView, IDX_STATE, ST_ERROR);
        Atomics.notify(hdrView, IDX_STATE);
        return;
    }

    // Signal ready
    Atomics.store(hdrView, IDX_STATE, ST_IDLE);
    Atomics.notify(hdrView, IDX_STATE);

    while (true) {
        await waitForCommand();

        const cmdLen = Atomics.load(hdrView, IDX_CMDLEN);
        const timeoutMs = Atomics.load(hdrView, IDX_TIMEOUT);
        const cmd = cmdBuf.subarray(0, cmdLen).toString('utf8');

        let response: string;
        let timedOut: boolean;
        let errored: boolean;

        try {
            socket!.write(cmd);
            const result = await readResponse(timeoutMs);
            response = result.data;
            timedOut = result.timedOut;
            errored = false;
        } catch (err) {
            response = String((err as Error).message ?? err);
            timedOut = false;
            errored = true;
        }

        const bytes = Buffer.from(response, 'utf8');
        bytes.copy(respBuf);
        Atomics.store(hdrView, IDX_RESPLEN, bytes.length);
        Atomics.store(hdrView, IDX_STATUS, timedOut ? 1 : (errored ? -1 : 0));
        Atomics.store(hdrView, IDX_STATE, ST_RESP);
        Atomics.notify(hdrView, IDX_STATE);
    }
}

void main();
