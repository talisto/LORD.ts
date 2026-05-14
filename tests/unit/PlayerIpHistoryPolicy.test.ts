import { PlayerIpHistoryPolicy } from '@lordts/core/PlayerIpHistoryPolicy';
import { TestHarness } from '../harness';

describe('PlayerIpHistoryPolicy', () => {
    let harness: TestHarness;

    afterEach(() => {
        harness.cleanup();
    });

    test('records public IPs and detects recent shared usage', () => {
        harness = TestHarness.create();
        const settings = {
            shared_ip_restriction_days: 7,
            shared_ip_ignore_private_addresses: true,
        };

        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 0, '203.0.113.10', settings);
        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 1, '203.0.113.10', settings);

        expect(PlayerIpHistoryPolicy.havePlayersSharedRecentIp(harness.context.storage, 42, 0, 1, settings)).toBe(true);
    });

    test('ignores private addresses when configured', () => {
        harness = TestHarness.create();
        const settings = {
            shared_ip_restriction_days: 7,
            shared_ip_ignore_private_addresses: true,
        };

        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 0, '192.168.0.10', settings);
        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 42, 1, '192.168.0.10', settings);

        expect(PlayerIpHistoryPolicy.havePlayersSharedRecentIp(harness.context.storage, 42, 0, 1, settings)).toBe(false);
    });

    test('prunes history older than the configured restriction window', () => {
        harness = TestHarness.create();
        const settings = {
            shared_ip_restriction_days: 2,
            shared_ip_ignore_private_addresses: false,
        };

        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 1, 0, '203.0.113.10', settings);
        PlayerIpHistoryPolicy.recordPlayerIp(harness.context.storage, 5, 1, '203.0.113.10', settings);

        expect(PlayerIpHistoryPolicy.havePlayersSharedRecentIp(harness.context.storage, 5, 0, 1, settings)).toBe(false);
    });
});