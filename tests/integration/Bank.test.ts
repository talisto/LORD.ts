/**
 * Bank - Feature tests
 *
 * Tests all Bank options: Withdraw, Deposit, Transfer, Return/Quit,
 * and the random amulet event on leaving.
 */

import { TestHarness } from '../harness';
import { BankTransferAmountPolicy } from '@lordts/core/BankTransferAmountPolicy';
import { PlayerIpHistoryPolicy } from '@lordts/core/PlayerIpHistoryPolicy';
import { PlayerRelationPolicy } from '@lordts/core/PlayerRelationPolicy';

describe('Bank', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    describe('Withdraw', () => {
        test('withdraws a specific amount', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 5000 },
            });

            // W to withdraw, enter 500, then R to return
            harness.queueKeys('W', '500', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(600);
            expect(harness.player!.bank).toBe(4500);
            expect(harness.outputContains('500 withdrawn')).toBe(true);
        });

        test('withdraws all with amount=1', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 3000 },
            });

            harness.queueKeys('W', '1', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(3100);
            expect(harness.player!.bank).toBe(0);
        });

        test('rejects withdrawing more than balance', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 500 },
            });

            harness.queueKeys('W', '1000', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(100);
            expect(harness.player!.bank).toBe(500);
            expect(harness.outputContains("don't have that much")).toBe(true);
        });

        test('rejects negative withdrawal', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 500 },
            });

            harness.queueKeys('W', '-100', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(100);
            expect(harness.outputContains('depositing')).toBe(true);
        });

        test('handles zero withdrawal', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 500 },
            });

            harness.queueKeys('W', '0', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(100);
            expect(harness.outputContains('another time')).toBe(true);
        });
    });

    describe('Deposit', () => {
        test('deposits a specific amount', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 5000, bank: 100 },
            });

            harness.queueKeys('D', '2000', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(3000);
            expect(harness.player!.bank).toBe(2100);
            expect(harness.outputContains('deposited')).toBe(true);
        });

        test('deposits all with amount=1', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 3000, bank: 0 },
            });

            harness.queueKeys('D', '1', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(0);
            expect(harness.player!.bank).toBe(3000);
        });

        test('rejects depositing more than on hand', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100, bank: 0 },
            });

            harness.queueKeys('D', '500', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(100);
            expect(harness.player!.bank).toBe(0);
            expect(harness.outputContains("don't have that much")).toBe(true);
        });

        test('rejects deposit when bank is full (2B cap)', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 1000, bank: 2000000000 },
            });

            harness.queueKeys('D', '500', 'R');
            await harness.context.bank.run();

            expect(harness.player!.bank).toBe(2000000000);
            expect(harness.outputContains('2,000,000,000')).toBe(true);
        });

        test('rejects negative deposit', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 1000, bank: 0 },
            });

            harness.queueKeys('D', '-50', 'R');
            await harness.context.bank.run();

            expect(harness.player!.gold).toBe(1000);
            expect(harness.outputContains('withdrawing')).toBe(true);
        });
    });

    describe('Transfer', () => {
        test('transfer is denied when transfers_on is false', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 1000, bank: 5000 },
            });
            harness.context.settings.transfers_on = false;

            harness.queueKeys('T', 'R');
            await harness.context.bank.run();

            expect(harness.outputContains('permanent vacation')).toBe(true);
        });

        test('transfer prompts for amount and recipient when enabled', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 1000, bank: 5000, transferred_gold: 0 },
            });
            harness.context.settings.transfers_on = true;
            harness.context.settings.transfers_per_day = 5;
            harness.context.settings.transfer_amount = 10000;

            // T, amount, then player search that returns -1 (not found)
            harness.context.player!.findPlayer = jest.fn().mockReturnValue(-1);
            harness.queueKeys('T', '500', 'R');
            await harness.context.bank.run();

            expect(harness.outputContains('Gold Not Sent')).toBe(true);
        });

        test('transfer is denied when the recipient has blocked the sender', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, gold: 1000, bank: 5000, transferred_gold: 0 },
            });
            harness.context.settings.transfers_on = true;
            harness.context.settings.player_blocking = true;
            harness.context.settings.transfers_per_day = 5;
            harness.context.settings.transfer_amount = 10000;
            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            PlayerRelationPolicy.setPlayerBlocked(harness.context.storage, 1, 0, true);

            harness.queueKeys('T', '500', 'Q');
            await harness.context.bank.run();

            expect(harness.player!.bank).toBe(5000);
            expect(harness.player!.transferred_gold).toBe(0);
            expect(harness.outputContains('refuses bank deliveries')).toBe(true);
            expect(harness.outputContains('Gold Not Sent')).toBe(true);
        });

        test('transfer is denied when the recipient recently shared an IP with the sender', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, gold: 1000, bank: 5000, transferred_gold: 0, time: 42 },
            });
            harness.context.settings.transfers_on = true;
            harness.context.settings.shared_ip_restriction_days = 7;
            harness.context.settings.shared_ip_block_bank_transfers = true;
            harness.context.settings.transfers_per_day = 5;
            harness.context.settings.transfer_amount = 10000;
            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 0, '203.0.113.10', harness.context.settings);
            PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 1, '203.0.113.10', harness.context.settings);

            harness.queueKeys('T', '500', 'Q');
            await harness.context.bank.run();

            expect(harness.player!.bank).toBe(5000);
            expect(harness.player!.transferred_gold).toBe(0);
            expect(harness.outputContains('recently shared your address')).toBe(true);
            expect(harness.outputContains('Gold Not Sent')).toBe(true);
        });

        test('daily transfer amount cap is enforced before the transfer-count cap', async () => {
            harness = TestHarness.create({
                playerOverrides: { Record: 0, gold: 1000, bank: 5000, transferred_gold: 1, time: 42 },
            });
            harness.context.settings.transfers_on = true;
            harness.context.settings.transfers_per_day = 1;
            harness.context.settings.transfer_amount = 10000;
            harness.context.settings.daily_bank_transfer_gold_cap = 1000;
            BankTransferAmountPolicy.recordTransfer(harness.context.storage, 42, 0, 900);

            harness.context.player!.findPlayer = jest.fn().mockResolvedValue(1);

            harness.queueKeys('T', '200', 'Q');
            await harness.context.bank.run();

            expect(harness.context.player!.findPlayer).not.toHaveBeenCalled();
            expect(harness.player!.bank).toBe(5000);
            expect(harness.outputContains('only send 100 more gold today')).toBe(true);
            expect(harness.outputContains('couriers are busy')).toBe(false);
        });
    });

    describe('Menu and quit', () => {
        test('Q exits the bank', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('Q');
            await harness.context.bank.run();
            // Should complete without error
        });

        test('R exits the bank', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('R');
            await harness.context.bank.run();
        });

        test('Enter exits the bank', async () => {
            expect.assertions(0);
            harness = TestHarness.create();
            harness.queueKeys('\r');
            await harness.context.bank.run();
        });

        test('? re-shows the menu', async () => {
            harness = TestHarness.create();
            harness.queueKeys('?', 'Q');
            await harness.context.bank.run();
            // showTxt should have been called for 'BANK'
            expect(harness.context.io.showTxt).toHaveBeenCalledWith('BANK');
        });
    });

    describe('Easter eggs', () => {
        test('1 - Nice rock', async () => {
            harness = TestHarness.create();
            harness.queueKeys('1', 'Q');
            await harness.context.bank.run();

            expect(harness.outputContains('Nice rock')).toBe(true);
        });

        test('3 - Genie', async () => {
            harness = TestHarness.create();
            harness.queueKeys('3', 'Q');
            await harness.context.bank.run();

            expect(harness.outputContains('Genie')).toBe(true);
        });

        test('2 - Thief with fairy steals gold', async () => {
            harness = TestHarness.create({
                playerOverrides: { clss: 3, has_fairy: true, gold: 100, level: 5 },
            });

            harness.queueKeys('2', '\r', '\r', '\r', 'Q');
            await harness.context.bank.run();

            // Gold should have increased (stole from the bank)
            expect(harness.player!.gold).toBeGreaterThan(100);
            expect(harness.player!.has_fairy).toBe(false);
        });
    });

    describe('Amulet event on leaving', () => {
        test('amulet event can trigger with seeded random', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100000, level: 5, leftbank: false, amulet: false, clss: 1, cha: 1 },
            });

            // Queue random: random(30) must return 25 to trigger the event
            harness.rng.queueRandomValues([25]);

            // Y to buy, then Q to exit bank
            harness.queueKeys('Q', 'Y');
            await harness.context.bank.run();

            // The amulet event should have triggered
            expect(harness.outputContains('Amulet of Accuracy')).toBe(true);
            expect(harness.player!.amulet).toBe(true);
        });

        test('amulet event does not trigger twice', async () => {
            harness = TestHarness.create({
                playerOverrides: { gold: 100000, level: 5, leftbank: true, amulet: false },
            });

            harness.queueKeys('Q');
            await harness.context.bank.run();

            // leftbank was already true so event should not have fired
            expect(harness.outputContains('Amulet of Accuracy')).toBe(false);
        });
    });
});
