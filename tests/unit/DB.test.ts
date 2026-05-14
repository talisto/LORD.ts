/**
 * DB - Unit tests for SqliteStorage class
 *
 * Tests database CRUD operations using an in-memory SQLite DB so tests
 * are fast, isolated, and require no filesystem access.
 */

import { SqliteStorage } from '@lordts/storage/SqliteStorage';

function makeDb(): SqliteStorage {
    return new SqliteStorage(':memory:');
}

describe('SqliteStorage', () => {
    describe('mail operations', () => {
        test('hasMail returns false for player with no mail', () => {
            const db = makeDb();
            expect(db.hasMail(0)).toBe(false);
        });

        test('sendMail + hasMail returns true', () => {
            const db = makeDb();
            db.sendMail(0, 'Welcome, adventurer!');
            expect(db.hasMail(0)).toBe(true);
        });

        test('getMail returns sent mail content lines', () => {
            const db = makeDb();
            db.sendMail(0, 'Hello\nWorld');
            const lines = db.getMail(0);
            expect(lines.join('\n')).toContain('Hello');
        });

        test('deleteMail removes all mail for player', () => {
            const db = makeDb();
            db.sendMail(0, 'Message 1');
            db.sendMail(0, 'Message 2');
            db.deleteMail(0);
            expect(db.hasMail(0)).toBe(false);
        });

        test('mail for one player does not affect another', () => {
            const db = makeDb();
            db.sendMail(0, 'To player 0');
            expect(db.hasMail(1)).toBe(false);
        });
    });

    describe('log operations', () => {
        test('getLogCount returns 0 for empty log', () => {
            const db = makeDb();
            expect(db.getLogCount('today')).toBe(0);
        });

        test('appendLog increases log count', () => {
            const db = makeDb();
            db.appendLog('today', 'A hero did something great!');
            expect(db.getLogCount('today')).toBe(1);
        });

        test('getLogLines returns appended lines', () => {
            const db = makeDb();
            db.appendLog('today', 'Line one');
            db.appendLog('today', 'Line two');
            const lines = db.getLogLines('today');
            expect(lines).toContain('Line one');
            expect(lines).toContain('Line two');
        });

        test('getLogLines with limit returns at most N lines', () => {
            const db = makeDb();
            for (let i = 0; i < 10; i++) {
                db.appendLog('today', `Line ${i}`);
            }
            const lines = db.getLogLines('today', 3);
            expect(lines.length).toBeLessThanOrEqual(3);
        });

        test('yesterday log is separate from today log', () => {
            const db = makeDb();
            db.appendLog('today', 'Today entry');
            db.appendLog('yesterday', 'Yesterday entry');
            expect(db.getLogCount('today')).toBe(1);
            expect(db.getLogCount('yesterday')).toBe(1);
        });

        test('rotateLogs moves today to yesterday and clears today', () => {
            const db = makeDb();
            db.appendLog('today', 'A great battle occurred');
            db.rotateLogs();
            expect(db.getLogCount('today')).toBe(0);
            expect(db.getLogCount('yesterday')).toBeGreaterThan(0);
        });
    });

    describe('conversation operations', () => {
        test('getConversation returns empty string for unknown name', () => {
            const db = makeDb();
            expect(db.getConversation('dirt')).toBe('');
        });

        test('setConversation + getConversation retrieves content', () => {
            const db = makeDb();
            db.setConversation('dirt', 'Here lies a brave hero.');
            expect(db.getConversation('dirt')).toBe('Here lies a brave hero.');
        });

        test('appendConversation adds lines', () => {
            const db = makeDb();
            db.appendConversation('dirt', ['Line 1', 'Line 2']);
            const lines = db.getConversationLines('dirt');
            expect(lines).toEqual(expect.arrayContaining(['Line 1', 'Line 2']));
        });

        test('appendConversation respects maxLines limit', () => {
            const db = makeDb();
            // Pre-fill with 5 lines
            db.appendConversation('dirt', ['A', 'B', 'C', 'D', 'E']);
            // Append with maxLines=5 so old lines get trimmed
            db.appendConversation('dirt', ['F', 'G'], 5);
            const lines = db.getConversationLines('dirt');
            expect(lines.length).toBeLessThanOrEqual(5);
        });

        test('hasConversation returns false when not set', () => {
            const db = makeDb();
            expect(db.hasConversation('noexist')).toBe(false);
        });

        test('hasConversation returns true after setConversation', () => {
            const db = makeDb();
            db.setConversation('heroes', 'Master Turgon slew the dragon!');
            expect(db.hasConversation('heroes')).toBe(true);
        });

        test('clearQuoteBuffer removes in-memory quote lines', () => {
            const db = makeDb();
            // appendQuoteLine adds to the in-memory quote buffer (separate from conversations)
            db.appendQuoteLine(0, 'A quote.');
            db.clearQuoteBuffer(0);
            expect(db.getQuoteBuffer(0)).toEqual([]);
        });
    });

    describe('record operations (players/state)', () => {
        test('countRecords returns 0 for empty table', () => {
            const db = makeDb();
            expect(db.countRecords('players')).toBe(0);
        });

        test('putRecord + getRecord roundtrip', () => {
            const db = makeDb();
            db.putRecord('players', 0, { name: 'Turgon', level: 5, hp: 100 });
            const record = db.getRecord('players', 0);
            expect(record).not.toBeNull();
            expect((record as Record<string, unknown>).name).toBe('Turgon');
        });

        test('countRecords returns count after insertions', () => {
            const db = makeDb();
            db.putRecord('players', 0, { name: 'Player0' });
            db.putRecord('players', 1, { name: 'Player1' });
            expect(db.countRecords('players')).toBe(2);
        });

        test('nextIndex returns 0 for empty table', () => {
            const db = makeDb();
            expect(db.nextIndex('players')).toBe(0);
        });

        test('nextIndex advances past existing records', () => {
            const db = makeDb();
            db.putRecord('players', 0, { name: 'P0' });
            db.putRecord('players', 1, { name: 'P1' });
            expect(db.nextIndex('players')).toBe(2);
        });

        test('getAllRecords returns all entries', () => {
            const db = makeDb();
            db.putRecord('players', 0, { name: 'P0' });
            db.putRecord('players', 1, { name: 'P1' });
            const records = db.getAllRecords('players');
            expect(records.length).toBe(2);
        });

        test('getRecord returns null for non-existent index', () => {
            const db = makeDb();
            expect(db.getRecord('players', 99)).toBeNull();
        });

        test('getPlayer maps legacy asshole field to olivia_asshole', () => {
            const db = makeDb();

            db.putRecord('players', 0, { name: 'Hero', asshole: true });

            const player = db.getPlayer(0);
            expect(player).not.toBeNull();
            expect(player!.olivia_asshole).toBe(true);

            player!.put();

            const stored = db.getRecord('players', 0) as Record<string, unknown>;
            expect(stored.olivia_asshole).toBe(true);
            expect(stored.asshole).toBeUndefined();
        });
    });

    describe('auth operations', () => {
        test('authUserExists returns false for unknown user', () => {
            const db = makeDb();
            expect(db.authUserExists('unknown')).toBe(false);
        });

        test('authCreateUser + authUserExists', () => {
            const db = makeDb();
            const created = db.authCreateUser('alice', 'hash123', 'salt456');
            expect(created).toBe(true);
            expect(db.authUserExists('alice')).toBe(true);
        });

        test('authUpdateUserPassword updates stored credentials', () => {
            const db = makeDb();
            db.authCreateUser('alice', 'hash123', 'salt456');

            expect(db.authUpdateUserPassword('alice', 'hash789', 'salt987')).toBe(true);
            const user = db.authGetUser('alice');
            expect(user).toBeDefined();
            expect(user!.password_hash).toBe('hash789');
            expect(user!.salt).toBe('salt987');
            expect(user!.email).toBeNull();
        });

        test('authUpdateUserEmail stores an email address', () => {
            const db = makeDb();
            db.authCreateUser('alice', 'hash123', 'salt456');

            expect(db.authUpdateUserEmail('alice', 'alice@example.com')).toBe(true);
            expect(db.authGetUser('alice')?.email).toBe('alice@example.com');
        });

        test('authCreateUser returns false for duplicate username', () => {
            const db = makeDb();
            db.authCreateUser('bob', 'hash', 'salt');
            const again = db.authCreateUser('bob', 'hash2', 'salt2');
            expect(again).toBe(false);
        });

        test('authGetUser returns correct data', () => {
            const db = makeDb();
            db.authCreateUser('carol', 'hashval', 'saltval');
            const user = db.authGetUser('carol');
            expect(user).toBeDefined();
            expect(user!.username).toBe('carol');
            expect(user!.password_hash).toBe('hashval');
            expect(user!.salt).toBe('saltval');
            expect(user!.email).toBeNull();
        });

        test('authGetUser returns undefined for unknown user', () => {
            const db = makeDb();
            expect(db.authGetUser('nobody')).toBeUndefined();
        });
    });

    describe('session operations', () => {
        test('authInsertSession + authGetAllSessions', () => {
            const db = makeDb();
            db.authInsertSession('token-abc', 'alice', 1000000);
            const sessions = db.authGetAllSessions();
            expect(sessions.length).toBe(1);
            expect(sessions[0].token).toBe('token-abc');
            expect(sessions[0].username).toBe('alice');
        });

        test('authDeleteSession removes session', () => {
            const db = makeDb();
            db.authInsertSession('tok', 'bob', 12345);
            db.authDeleteSession('tok');
            const sessions = db.authGetAllSessions();
            expect(sessions.find(s => s.token === 'tok')).toBeUndefined();
        });

        test('authUpdateSession changes created_at', () => {
            const db = makeDb();
            db.authInsertSession('tok2', 'carol', 1000);
            db.authUpdateSession('tok2', 2000);
            const sessions = db.authGetAllSessions();
            const session = sessions.find(s => s.token === 'tok2');
            expect(session!.created_at).toBe(2000);
        });
    });
});
