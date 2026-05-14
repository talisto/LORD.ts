import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createAuthStorage, createStorageOnly } from '@lordts/storage/PersistenceFactory';

describe('PersistenceFactory auth storage', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-auth-storage-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('defaults auth storage to the same runtime db when auth_runtime_dir is not set', () => {
        const settings = {
            storage_backend: 'sqlite',
            runtime_dir: 'runtime/game1',
        };

        const gameStorage = createStorageOnly({ settings, projectRoot: tmpDir });
        const authStorage = createAuthStorage({ settings, projectRoot: tmpDir });

        expect(authStorage.authCreateUser('SharedUser', 'hash', 'salt')).toBe(true);
        expect(gameStorage.authUserExists('SharedUser')).toBe(true);

        gameStorage.close();
        authStorage.close();
    });

    test('isolates auth storage when auth_runtime_dir is set', () => {
        const settings = {
            storage_backend: 'sqlite',
            runtime_dir: 'runtime/game1',
            auth_runtime_dir: 'runtime/auth',
        };

        const gameStorage = createStorageOnly({ settings, projectRoot: tmpDir });
        const authStorage = createAuthStorage({ settings, projectRoot: tmpDir });

        expect(authStorage.authCreateUser('SharedUser', 'hash', 'salt')).toBe(true);
        expect(gameStorage.authUserExists('SharedUser')).toBe(false);
        expect(authStorage.authUserExists('SharedUser')).toBe(true);

        gameStorage.close();
        authStorage.close();
    });
});