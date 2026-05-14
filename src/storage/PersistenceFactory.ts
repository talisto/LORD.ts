'use strict';

/**
 * PersistenceFactory - Creates IStorage and IBattleCoordinator instances
 * from game settings.
 *
 * Entry points (GameContext, IgmContext) call this factory instead of
 * hard-coding LocalBattleCoordinator or SqliteStorage. The factory reads
 * settings.storage_backend (or the STORAGE_BACKEND env var) to decide
 * which implementations to instantiate.
 *
 * Supported backends:
 *  - 'sqlite'      - SqliteStorage + LocalBattleCoordinator (default)
 *  - 'dat'         - DatStorage + LocalBattleCoordinator
 *  - 'synchronet'  - SynchronetStorage + SynchronetBattleCoordinator
 *
 * Synchronet settings: remote_game (host or host:port), game_user, game_pass.
 * Env var equivalents: LORD_REMOTE_GAME, LORD_GAME_USER, LORD_GAME_PASS.
 */

import * as path from 'path';
import type { IStorage } from './IStorage';
import type { IBattleCoordinator } from './IBattleCoordinator';
import { LocalBattleCoordinator } from './LocalBattleCoordinator';
import { SqliteStorage } from './SqliteStorage';
import { DatStorage } from './DatStorage';
import { SynchronetStorage } from './SynchronetStorage';
import { SynchronetBattleCoordinator } from './SynchronetBattleCoordinator';

export interface PersistenceConfig {
    /**
     * Game settings (provides storage_backend, runtime_dir, and
     * optional Synchronet connection info).
     */
    settings?: {
        storage_backend?: string;
        runtime_dir?: string;
        auth_runtime_dir?: string;
        /** lordsrv host, optionally "host:port" (default port 57038). */
        remote_game?: string;
        /** BBS username for lordsrv Auth. */
        game_user?: string;
        /** BBS password for lordsrv Auth. */
        game_pass?: string;
    };
    /** Project root directory for resolving relative paths. */
    projectRoot?: string;
    /** Explicit storage path override (sqlite .db path or dat runtime dir). */
    storagePath?: string;
    /** Explicit backend override (takes precedence over settings/env). */
    backend?: string;
    /** Node/connection slot ID for the battle coordinator. */
    nodeId?: number;
}

export interface PersistenceResult {
    storage: IStorage;
    battleCoordinator: IBattleCoordinator;
}

/**
 * Create storage and battle coordinator instances for the given configuration.
 *
 * For local backends (sqlite, dat), creates a LocalBattleCoordinator that
 * uses the same IStorage instance for both persistence and battle state.
 *
 * For the Synchronet backend, connects to lordsrv and creates
 * SynchronetStorage + SynchronetBattleCoordinator.
 */
export function createPersistence(config: PersistenceConfig): PersistenceResult {
    const backend = resolveBackend(config);

    const nodeId = config.nodeId ?? 0;

    const storage = createStorageOnly({
        ...config,
        backend,
    });

    if (backend === 'synchronet') {
        const { host, port } = parseSynchronetAddress(config);
        const username = config.settings?.game_user ?? process.env.LORD_GAME_USER ?? '';
        const password = config.settings?.game_pass ?? process.env.LORD_GAME_PASS ?? '';
        return {
            storage,
            battleCoordinator: new SynchronetBattleCoordinator(host, port, username, password, nodeId),
        };
    }

    return {
        storage,
        battleCoordinator: new LocalBattleCoordinator(storage, nodeId),
    };
}

/**
 * Create only an IStorage instance (no battle coordinator).
 *
 * Used by server startup, IgmContext, and other contexts that do not need
 * battle coordination.
 */
export function createStorageOnly(config: PersistenceConfig): IStorage {
    const backend = resolveBackend(config);

    if (backend === 'synchronet') {
        const { host, port } = parseSynchronetAddress(config);
        const username = config.settings?.game_user ?? process.env.LORD_GAME_USER ?? '';
        const password = config.settings?.game_pass ?? process.env.LORD_GAME_PASS ?? '';
        return new SynchronetStorage(host, port, username, password);
    }

    return createLocalStorage(config, backend);
}

/**
 * Create the storage used for auth users and shared web sessions.
 *
 * By default this shares the same local storage path as the game runtime.
 * Set auth_runtime_dir / LORD_AUTH_RUNTIME_DIR to isolate auth into its own
 * local directory while still letting multiple game instances share it.
 */
export function createAuthStorage(config: PersistenceConfig): IStorage {
    const authBackend = resolveAuthBackend(config);
    const authStoragePath = resolveAuthStoragePath(config, authBackend);
    return createLocalStorage({
        ...config,
        storagePath: authStoragePath,
    }, authBackend);
}

export function resolveAuthStoragePath(config: PersistenceConfig, backend?: string): string {
    const authBackend = backend ?? resolveAuthBackend(config);
    const authRuntimeDir = config.settings?.auth_runtime_dir;

    if (authRuntimeDir && authRuntimeDir.trim() !== '') {
        const resolvedDir = path.resolve(config.projectRoot ?? '.', authRuntimeDir);
        return authBackend === 'sqlite'
            ? path.join(resolvedDir, 'lord.db')
            : resolvedDir;
    }

    const gameBackend = resolveBackend(config);
    if (config.storagePath && gameBackend === authBackend) {
        return config.storagePath;
    }

    const runtimeDir = resolveRuntimeDir({
        ...config,
        storagePath: undefined,
    });

    return authBackend === 'sqlite'
        ? path.join(runtimeDir, 'lord.db')
        : runtimeDir;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveBackend(config: PersistenceConfig): string {
    return config.backend
        ?? config.settings?.storage_backend
        ?? process.env.STORAGE_BACKEND
        ?? 'sqlite';
}

function resolveRuntimeDir(config: PersistenceConfig): string {
    if (config.storagePath) return config.storagePath;
    const runtimeDir = config.settings?.runtime_dir ?? 'runtime';
    const projectRoot = config.projectRoot ?? '.';
    return path.resolve(projectRoot, runtimeDir);
}

function resolveAuthBackend(config: PersistenceConfig): string {
    const backend = resolveBackend(config);
    if (backend === 'dat' || backend === 'filesystem') return 'dat';
    return 'sqlite';
}

function createLocalStorage(config: PersistenceConfig, backend: string): IStorage {
    switch (backend) {
        case 'sqlite': {
            const dbPath = config.storagePath
                ?? path.join(resolveRuntimeDir(config), 'lord.db');
            return new SqliteStorage(dbPath);
        }
        case 'dat':
        case 'filesystem': {
            const runtimeDir = config.storagePath ?? resolveRuntimeDir(config);
            return new DatStorage(runtimeDir);
        }
        default:
            throw new Error(
                'Unknown storage backend: "' + backend + '". Supported backends: sqlite, dat, synchronet'
            );
    }
}

/**
 * Parse host and port from config.settings.remote_game (or LORD_REMOTE_GAME env var).
 * Accepts "host" or "host:port". Default port: 57038 (0xdece, the lordsrv default).
 */
function parseSynchronetAddress(config: PersistenceConfig): { host: string; port: number } {
    const raw = config.settings?.remote_game ?? process.env.LORD_REMOTE_GAME ?? 'localhost';
    const colonIdx = raw.lastIndexOf(':');
    if (colonIdx > 0) {
        const host = raw.substring(0, colonIdx);
        const port = parseInt(raw.substring(colonIdx + 1), 10);
        return { host, port: isNaN(port) ? 0xdece : port };
    }
    return { host: raw, port: 0xdece };
}
