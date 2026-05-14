import type { IncomingMessage } from 'http';
import { getRequestClientIp } from '@lordts/core/net/ClientIp';

function makeRequest(remoteAddress: string, headers: Record<string, string> = {}): IncomingMessage {
    return {
        headers,
        socket: { remoteAddress },
    } as IncomingMessage;
}

describe('ClientIp', () => {
    test('prefers CF-Connecting-IP when request comes from a trusted proxy hop', () => {
        const req = makeRequest('172.18.0.2', {
            'cf-connecting-ip': '198.51.100.7',
            'x-forwarded-for': '198.51.100.8, 172.70.10.20',
        });

        expect(getRequestClientIp(req)).toBe('198.51.100.7');
    });

    test('uses X-Forwarded-For when trusted proxy forwards the client chain', () => {
        const req = makeRequest('172.18.0.2', {
            'x-forwarded-for': '198.51.100.8, 172.70.10.20',
        });

        expect(getRequestClientIp(req)).toBe('198.51.100.8');
    });

    test('ignores forwarded headers from untrusted peers', () => {
        const req = makeRequest('203.0.113.50', {
            'cf-connecting-ip': '198.51.100.7',
            'x-forwarded-for': '198.51.100.8',
        });

        expect(getRequestClientIp(req)).toBe('203.0.113.50');
    });
});
