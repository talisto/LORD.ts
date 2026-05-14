import AuthManager from '@lordts/core/net/AuthManager';
import { SqliteStorage } from '@lordts/storage/SqliteStorage';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeAuthManager(): AuthManager {
    return new AuthManager(new SqliteStorage(':memory:'));
}

describe('AuthManager', () => {
    test('blocks repeated failed attempts for the same IP', () => {
        const auth = makeAuthManager();

        for (let i = 0; i < 10; i++) {
            expect(auth.checkAuthAllowed('203.0.113.10').allowed).toBe(true);
            auth.recordAuthFailure('203.0.113.10');
        }

        expect(auth.checkAuthAllowed('203.0.113.10').allowed).toBe(false);
        expect(auth.checkAuthAllowed('198.51.100.25').allowed).toBe(true);
    });

    test('blocks repeated failed attempts across usernames from the same IP', () => {
        const auth = makeAuthManager();

        for (let i = 0; i < 10; i++) {
            auth.recordAuthFailure('203.0.113.10');
        }

        expect(auth.checkAuthAllowed('203.0.113.10').allowed).toBe(false);
        expect(auth.checkAuthAllowed('198.51.100.25').allowed).toBe(true);
    });

    test('successful auth clears rate limits for the same IP', () => {
        const auth = makeAuthManager();

        for (let i = 0; i < 10; i++) {
            auth.recordAuthFailure('203.0.113.10');
        }

        expect(auth.checkAuthAllowed('203.0.113.10').allowed).toBe(false);

        auth.recordAuthSuccess('203.0.113.10');

        expect(auth.checkAuthAllowed('203.0.113.10').allowed).toBe(true);
    });

    test('validates a session created by another AuthManager instance sharing the same storage', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lord-auth-manager-'));
        const dbPath = path.join(tmpDir, 'auth.db');

        try {
            const creatorStorage = new SqliteStorage(dbPath);
            const validatorStorage = new SqliteStorage(dbPath);
            const creator = new AuthManager(creatorStorage);
            const validator = new AuthManager(validatorStorage);

            expect(creator.createUser('SharedUser', 'pw')).toBe(true);
            const token = creator.createSession('SharedUser');

            expect(validator.validateSession(token)).toEqual({
                username: 'SharedUser',
                createdAt: expect.any(Number),
                email: null,
                needsEmail: false,
            });

            creatorStorage.close();
            validatorStorage.close();
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test('tracks required-email account status and updates it when email is set', () => {
        const auth = new AuthManager(new SqliteStorage(':memory:'), { requireEmail: true });

        expect(auth.createUser('SharedUser', 'pw')).toBe(true);
        expect(auth.getAccountStatus('SharedUser')).toEqual({
            username: 'SharedUser',
            email: null,
            needsEmail: true,
        });

        expect(auth.setUserEmail('SharedUser', 'shared@example.com')).toEqual({
            ok: true,
            status: {
                username: 'SharedUser',
                email: 'shared@example.com',
                needsEmail: false,
            },
        });
    });

    test('changes a password when the current password matches', () => {
        const auth = makeAuthManager();

        expect(auth.createUser('SharedUser', 'oldpw')).toBe(true);
        expect(auth.changePassword('SharedUser', 'oldpw', 'newpw')).toEqual({
            ok: true,
            status: {
                username: 'SharedUser',
                email: null,
                needsEmail: false,
            },
        });
        expect(auth.validateUser('SharedUser', 'oldpw')).toBeNull();
        expect(auth.validateUser('SharedUser', 'newpw')).toBe('SharedUser');
    });
});
