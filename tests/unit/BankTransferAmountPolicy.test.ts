import { BankTransferAmountPolicy } from '@lordts/core/BankTransferAmountPolicy';
import { TestHarness } from '../harness';

describe('BankTransferAmountPolicy', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    test('records transferred gold per player and day', () => {
        harness = TestHarness.create();

        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 1, 0, 400);
        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 1, 0, 100);

        expect(BankTransferAmountPolicy.getTransferredAmount(harness.context.storage, 1, 0)).toBe(500);
    });

    test('resetPlayerUsage clears only the targeted player and day', () => {
        harness = TestHarness.create();

        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 1, 0, 400);
        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 1, 1, 300);
        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 2, 0, 200);

        BankTransferAmountPolicy.resetPlayerUsage(harness.context.storage, 1, 0);

        expect(BankTransferAmountPolicy.getTransferredAmount(harness.context.storage, 1, 0)).toBe(0);
        expect(BankTransferAmountPolicy.getTransferredAmount(harness.context.storage, 1, 1)).toBe(300);
        expect(BankTransferAmountPolicy.getTransferredAmount(harness.context.storage, 2, 0)).toBe(200);
    });

    test('canTransfer reports the remaining daily amount', () => {
        harness = TestHarness.create();
        BankTransferAmountPolicy.recordTransfer(harness.context.storage, 1, 0, 800);

        expect(BankTransferAmountPolicy.canTransfer(harness.context.storage, 1, 0, 150, 1000)).toEqual({
            allowed: true,
            remaining: 200,
        });
        expect(BankTransferAmountPolicy.canTransfer(harness.context.storage, 1, 0, 250, 1000)).toEqual({
            allowed: false,
            remaining: 200,
        });
    });
});