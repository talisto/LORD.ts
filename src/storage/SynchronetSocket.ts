'use strict';

/**
 * SynchronetSocket - Synchronous bridge to a lordsrv TCP connection.
 *
 * Spawns a Worker thread that owns the TCP socket. The main thread
 * communicates synchronously via a SharedArrayBuffer: it writes the
 * command, signals the worker, then blocks with Atomics.wait until
 * the worker writes the response and signals back.
 *
 * Node.js v9.4+ allows Atomics.wait on the main thread (unlike browsers).
 * Blocking the event loop is acceptable here because IStorage is a
 * synchronous interface; game sessions are expected to be I/O-latency-tolerant
 * or run in their own Worker threads for best multi-session performance.
 *
 * SharedArrayBuffer layout:
 *   Bytes 0-19:      Int32 header [state, timeout_ms, cmdLen, respLen, status]
 *   Bytes 20-524307: cmdArea  (512 KB)
 *   Bytes 524308+:   respArea (512 KB)
 *
 * State values: 0=idle, 1=connecting, 2=cmd_ready, 3=resp_ready, -1=error
 */

import { Worker } from 'worker_threads';
import { join } from 'path';

// ── Buffer layout constants ──────────────────────────────────────────────────

const HDR_SIZE = 20;       // 5 × Int32
const AREA_SIZE = 512 * 1024;
const BUF_SIZE = HDR_SIZE + 2 * AREA_SIZE;

// Int32Array indices
const IDX_STATE = 0;
const IDX_TIMEOUT = 1;
const IDX_CMDLEN = 2;
const IDX_RESPLEN = 3;
const IDX_STATUS = 4;

// State machine values
const ST_IDLE = 0;
const ST_CONNECTING = 1;
const ST_CMD = 2;
// ST_RESP (3) is written by the worker; not used directly in the main-thread class
const ST_ERROR = -1;

// ── Options ──────────────────────────────────────────────────────────────────

export interface SynchronetSocketOptions {
    /** Use TLS. Default: true. */
    tls?: boolean;
}

// ── SynchronetSocket ─────────────────────────────────────────────────────────

export class SynchronetSocket {
    private readonly _hdr: Int32Array;
    private readonly _cmdBuf: Buffer;
    private readonly _respBuf: Buffer;
    private readonly _worker: Worker;

    constructor(
        host: string,
        port: number,
        username: string,
        password: string,
        options: SynchronetSocketOptions = {},
    ) {
        const sharedBuffer = new SharedArrayBuffer(BUF_SIZE);
        this._hdr = new Int32Array(sharedBuffer, 0, 5);
        this._cmdBuf = Buffer.from(sharedBuffer, HDR_SIZE, AREA_SIZE);
        this._respBuf = Buffer.from(sharedBuffer, HDR_SIZE + AREA_SIZE, AREA_SIZE);

        // Initial state: connecting
        Atomics.store(this._hdr, IDX_STATE, ST_CONNECTING);

        // Resolve worker file path. The package has no "type": "module" so
        // __dirname and __filename are always available (CJS globals).
        const ext = __filename.endsWith('.ts') ? '.ts' : '.js';
        const workerPath = join(__dirname, 'SynchronetSocket.worker' + ext);
        const execArgv = ext === '.ts' ? ['--import', 'tsx'] : [];

        this._worker = new Worker(workerPath, {
            workerData: {
                host,
                port,
                useTls: options.tls !== false,
                username,
                password,
                sharedBuffer,
            },
            execArgv,
        });

        // Block until the worker finishes connecting (ST_CONNECTING changes to ST_IDLE or ST_ERROR)
        Atomics.wait(this._hdr, IDX_STATE, ST_CONNECTING);

        if (Atomics.load(this._hdr, IDX_STATE) === ST_ERROR) {
            const len = Atomics.load(this._hdr, IDX_RESPLEN);
            const msg = this._respBuf.subarray(0, len).toString('utf8');
            void this._worker.terminate();
            throw new Error('SynchronetSocket: connection failed: ' + msg);
        }
    }

    /**
     * Send a single-line command to lordsrv and return the response text.
     * Automatically appends "\r\n". Blocks until the response is ready.
     *
     * @param cmd       - Command string, without terminator.
     * @param timeoutMs - Milliseconds to wait for a response (0 = no timeout).
     */
    send(cmd: string, timeoutMs = 0): string {
        const bytes = Buffer.from(cmd + '\r\n', 'utf8');
        if (bytes.length > AREA_SIZE) throw new Error('SynchronetSocket: command too large');

        bytes.copy(this._cmdBuf);
        Atomics.store(this._hdr, IDX_CMDLEN, bytes.length);
        Atomics.store(this._hdr, IDX_TIMEOUT, timeoutMs);
        Atomics.store(this._hdr, IDX_STATE, ST_CMD);
        Atomics.notify(this._hdr, IDX_STATE);

        // Block until worker transitions to ST_RESP
        Atomics.wait(this._hdr, IDX_STATE, ST_CMD);

        const status = Atomics.load(this._hdr, IDX_STATUS);
        const respLen = Atomics.load(this._hdr, IDX_RESPLEN);
        const response = this._respBuf.subarray(0, respLen).toString('utf8');

        // Return state to idle so the worker can wait for the next command
        Atomics.store(this._hdr, IDX_STATE, ST_IDLE);
        Atomics.notify(this._hdr, IDX_STATE);

        if (status === -1) throw new Error('SynchronetSocket: lordsrv error: ' + response);
        // status === 1 means timeout - return empty string
        return response;
    }

    /**
     * Send a length-framed data command and return the response.
     *
     * Constructs: `<cmdLine> <byteLength>\r\n<data>\r\n`
     * (the trailing \r\n is the data block terminator lordsrv expects).
     *
     * @param cmdLine - Command line including any record/name args (no length).
     * @param data    - Raw data body (no \r\n).
     */
    sendData(cmdLine: string, data: string): string {
        const dataLen = Buffer.byteLength(data, 'utf8');
        // Pass as one blob: "cmdLine <len>\r\ndata" - send() appends the final \r\n
        return this.send(cmdLine + ' ' + dataLen + '\r\n' + data);
    }

    close(): void {
        void this._worker.terminate();
    }
}
