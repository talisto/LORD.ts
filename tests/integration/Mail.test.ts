/**
 * Mail - Feature tests
 *
 * Tests mail system response handlers: answerMail, smileMail,
 * kissMail, dinnerMail interactions.
 */

import { TestHarness, makeDefaultPlayerRecord } from '../harness';
import { PlayerIpHistoryPolicy } from '@lordts/core/PlayerIpHistoryPolicy';
import { PlayerRelationPolicy } from '@lordts/core/PlayerRelationPolicy';

describe('Mail', () => {
    let harness: TestHarness;

    function writeMailDirect(s: TestHarness): (to: number, quote?: boolean) => Promise<void> {
        return (s.context.mail as unknown as {
            writeMail: (to: number, quote?: boolean) => Promise<void>;
        }).writeMail.bind(s.context.mail);
    }

    afterEach(() => {
        harness.cleanup();
    });

    // Re-enable mail methods for these tests (they're stubbed by default)
    function unstubMail(s: TestHarness) {
        // Restore real implementations by re-importing
        // Instead, we rely on the constructor having set methods; we just
        // need to re-enable the ones we want to test and keep mailTo stubbed
        s.context.mail.mailTo = jest.fn();
    }

    describe('answerMail()', () => {
        test('declines to answer (N)', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            unstubMail(harness);

            // playerGet returns the target player
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'M', Record: 1 }),
            );

            harness.queueKeys('N');
            await harness.context.mail.answerMail(1);

            // Should not compose a reply
            expect(harness.context.mail.mailTo).not.toHaveBeenCalled();
        });

        test('rejects mailing yourself', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'TestHero', sex: 'M', Record: 0 }),
            );

            // Y to answer, but to=self
            harness.queueKeys('Y');
            await harness.context.mail.answerMail(0);

            expect(harness.outputContains('REFUSES TO DELIVER')).toBe(true);
        });
    });

    describe('writeMail()', () => {
        test('blank first line still sends the canned message by default', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            harness.context.storage.deleteMail(1);
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('\r');
            await writeMailDirect(harness)(1);

            const mail = harness.context.storage.getMail(1);
            expect(mail).toHaveLength(5);
            expect(mail.some(line => line.includes('Greetings.  How fare you, traveler?'))).toBe(true);
            expect(harness.outputContains('Mail sent!')).toBe(true);
        });

        test('blank first line cancels mail when the setting is disabled', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            harness.context.settings.blank_mail_sends_default_message = false;
            harness.context.storage.deleteMail(1);

            harness.queueKeys('\r');
            await writeMailDirect(harness)(1);

            expect(harness.context.storage.getMail(1)).toHaveLength(0);
            expect(harness.outputContains('Mail cancelled.')).toBe(true);
            expect(harness.outputContains('Mail sent!')).toBe(false);
        });

        test('refuses direct mail when the recipient has blocked the sender', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            harness.context.settings.player_blocking = true;
            harness.context.storage.deleteMail(1);
            PlayerRelationPolicy.setPlayerBlocked(harness.context.storage, 1, 0, true);

            await writeMailDirect(harness)(1);

            expect(harness.context.storage.getMail(1)).toHaveLength(0);
            expect(harness.outputContains('refusing messages')).toBe(true);
        });

        test('restores delivery after the blocker removes the block', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            harness.context.settings.player_blocking = true;
            harness.context.storage.deleteMail(1);
            PlayerRelationPolicy.setPlayerBlocked(harness.context.storage, 1, 0, true);
            PlayerRelationPolicy.setPlayerBlocked(harness.context.storage, 1, 0, false);
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('\r');
            await writeMailDirect(harness)(1);

            expect(harness.context.storage.getMail(1).some(line => line.includes('Greetings.  How fare you, traveler?'))).toBe(true);
        });
    });

    describe('composeMail()', () => {
        test('can block and unblock a selected player from the mail flow', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M' },
            });
            harness.context.settings.player_blocking = true;
            delete (harness.context.mail as unknown as Record<string, unknown>).composeMail;

            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'M', Record: 1 }),
            );

            harness.queueKeys('B');
            await harness.context.mail.composeMail();

            expect(PlayerRelationPolicy.isPlayerBlocked(harness.context.storage, 0, 1)).toBe(true);
            expect(harness.outputContains('now blocking Rival')).toBe(true);

            harness.queueKeys('U');
            await harness.context.mail.composeMail();

            expect(PlayerRelationPolicy.isPlayerBlocked(harness.context.storage, 0, 1)).toBe(false);
            expect(harness.outputContains('no longer blocking Rival')).toBe(true);
        });

        test('refuses romantic mail before showing the romance menu when blocked', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M', flirted: false },
            });
            harness.context.settings.player_blocking = true;
            delete (harness.context.mail as unknown as Record<string, unknown>).composeMail;

            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1 }),
            );
            PlayerRelationPolicy.setPlayerBlocked(harness.context.storage, 1, 0, true);

            harness.queueKeys('W');
            await harness.context.mail.composeMail();

            expect(harness.outputContains('refusing messages')).toBe(true);
            expect(harness.outputContains('ROMANTIC MESSAGE')).toBe(false);
        });

        test('refuses romantic mail when players recently shared an IP', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M', flirted: false, time: 42 },
            });
            harness.context.settings.shared_ip_restriction_days = 7;
            harness.context.settings.shared_ip_block_romantic_mail = true;
            delete (harness.context.mail as unknown as Record<string, unknown>).composeMail;

            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1 }),
            );
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 0, '203.0.113.10', harness.context.settings);
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 1, '203.0.113.10', harness.context.settings);

            harness.queueKeys('Y');
            await harness.context.mail.composeMail();

            expect(harness.outputContains('refuses romantic mail')).toBe(true);
            expect(harness.outputContains('ROMANTIC MESSAGE')).toBe(false);
        });

        test('same-IP restrictions do not block ordinary mail', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M', flirted: false, time: 42 },
            });
            harness.context.settings.shared_ip_restriction_days = 7;
            harness.context.settings.shared_ip_block_romantic_mail = true;
            delete (harness.context.mail as unknown as Record<string, unknown>).composeMail;
            harness.context.storage.deleteMail(1);

            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1 }),
            );
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 0, '203.0.113.10', harness.context.settings);
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 1, '203.0.113.10', harness.context.settings);
            harness.rng.queueRandomValues([0]);

            harness.queueKeys('N', '\r');
            await harness.context.mail.composeMail();

            expect(harness.context.storage.getMail(1).some(line => line.includes('Greetings.  How fare you, traveler?'))).toBe(true);
            expect(harness.outputContains('refuses romantic mail')).toBe(false);
        });
    });

    describe('smileMail()', () => {
        test('smiling back grants exp to sender', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1, level: 5 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('S');  // Smile
            await harness.context.mail.smileMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('smiles back'),
            );
        });

        test('ignoring sends snub message', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1, level: 5 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('P');  // Pointedly ignore
            await harness.context.mail.smileMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('ignores you'),
            );
        });
    });

    describe('kissMail()', () => {
        test('kissing back sends kiss message', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'F' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'M', Record: 1, level: 3 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('K');  // Kiss
            await harness.context.mail.kissMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('big wet kiss'),
            );
        });

        test('ignoring sends snub message with exp loss', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'F' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'M', Record: 1, level: 3 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('P');  // Pointedly ignore
            await harness.context.mail.kissMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('LOSE'),
            );
        });
    });

    describe('dinnerMail()', () => {
        test('accepting dinner grants exp and logs', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1, level: 4 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('G', '\r');  // Go to dinner + more prompt
            await harness.context.mail.dinnerMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('agrees to go to dinner'),
            );
            expect(harness.context.log.logLine).toHaveBeenCalledWith(
                expect.stringContaining('dinner'),
            );
        });

        test('refusing dinner sends snub and logs', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M' },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Rival', sex: 'F', Record: 1, level: 4 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('P');  // Pointedly ignore
            await harness.context.mail.dinnerMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('laughs in your face'),
            );
        });
    });

    describe('sleepMail()', () => {
        test('declining (P) sends snub message and logs', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M', level: 2 },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Isabella', sex: 'F', Record: 1, level: 3 }),
            );
            harness.context.io.showLooks = jest.fn();

            harness.queueKeys('P');  // Decline sleep
            await harness.context.mail.sleepMail(1);

            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('laughs in your face'),
            );
            expect(harness.outputContains('Ouch')).toBe(true);
        });

        test('accepting (S) increments laid count and shows inn scene', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, sex: 'M', level: 2, laid: 0 },
            });
            unstubMail(harness);

            (harness.context.player as unknown as Record<string, unknown>).playerGet = jest.fn().mockReturnValue(
                makeDefaultPlayerRecord({ name: 'Isabella', sex: 'F', Record: 1, level: 3 }),
            );
            harness.context.io.showLooks = jest.fn();

            // random(2) = 1 → skip optional hi-five moreNoMail → 5 moreNoMail calls total
            harness.rng.queueRandomValues([1]);
            harness.queueKeys('S', '\r', '\r', '\r', '\r', '\r');
            await harness.context.mail.sleepMail(1);

            expect(harness.player!.laid).toBe(1);
            expect(harness.context.mail.mailTo).toHaveBeenCalledWith(
                1,
                expect.stringContaining('agrees to sleep'),
            );
            expect(harness.outputContains('UPSTAIRS IN THE INN')).toBe(true);
        });
    });

    describe('mailCheck()', () => {
        test('returns false when player has no mail', () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            delete (harness.context.mail as unknown as Record<string, unknown>).mailCheck;
            // Ensure no residual mail from previous runs
            harness.context.storage.deleteMail(0);

            const result = harness.context.mail.mailCheck();
            expect(result).toBe(false);
        });

        test('returns true when player has mail', () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            delete (harness.context.mail as unknown as Record<string, unknown>).mailCheck;
            harness.context.storage.deleteMail(0);

            harness.context.storage.sendMail(0, 'Test message from a fellow adventurer');
            const result = harness.context.mail.mailCheck();

            expect(result).toBe(true);
        });
    });

    describe('checkMail()', () => {
        test('delivers mail when player has messages', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            delete (harness.context.mail as unknown as Record<string, unknown>).checkMail;
            harness.context.storage.deleteMail(0);

            harness.context.storage.sendMail(0, 'You have been challenged to a duel!');
            await harness.context.mail.checkMail();

            expect(harness.outputContains('MESSENGER')).toBe(true);
        });

        test('no output when player has no messages', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0 },
            });
            delete (harness.context.mail as unknown as Record<string, unknown>).checkMail;
            harness.context.storage.deleteMail(0);

            await harness.context.mail.checkMail();

            expect(harness.outputContains('MESSENGER')).toBe(false);
        });
    });
});
