/**
 * ClientIp - Client IP address resolution for LORD HTTP requests.
 *
 * Safely extracts the real client IP from X-Forwarded-For and Forwarded
 * headers when the server is behind a trusted reverse proxy (loopback or
 * private network peers). Falls back to the direct socket address.
 */
import type { IncomingMessage } from 'http';
import { isIP } from 'net';

function normalizeIp(ip: string): string {
    const trimmed = ip.trim().replace(/^"|"$/g, '');
    return trimmed.startsWith('::ffff:') ? trimmed.substring(7) : trimmed;
}

function isTrustedProxyPeer(ip: string): boolean {
    const normalized = normalizeIp(ip);
    return normalized === '127.0.0.1'
        || normalized === '::1'
        || normalized.startsWith('10.')
        || normalized.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized);
}

function headerValues(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) return value;
    return typeof value === 'string' ? [value] : [];
}

function sanitizeForwardedToken(value: string): string {
    let candidate = normalizeIp(value);

    if (candidate.startsWith('[')) {
        const end = candidate.indexOf(']');
        if (end !== -1) {
            candidate = candidate.substring(1, end);
        }
    // Strip port from "192.168.1.1:8080" - if last colon is after last dot, it's ip:port not IPv6
    } else if (candidate.includes('.') && candidate.includes(':')) {
        const lastColon = candidate.lastIndexOf(':');
        const lastDot = candidate.lastIndexOf('.');
        if (lastColon > lastDot) {
            candidate = candidate.substring(0, lastColon);
        }
    }

    return normalizeIp(candidate);
}

// Priority: most-specific single-IP headers first, then multi-hop X-Forwarded-For leftmost entry
function firstValidIp(candidates: string[]): string | null {
    for (const rawCandidate of candidates) {
        const candidate = sanitizeForwardedToken(rawCandidate);
        if (candidate.length > 0 && isIP(candidate) !== 0) {
            return candidate;
        }
    }
    return null;
}

function forwardedHeaderIp(value: string | string[] | undefined): string | null {
    const candidates: string[] = [];
    for (const entry of headerValues(value)) {
        for (const segment of entry.split(',')) {
            for (const part of segment.split(';')) {
                const trimmed = part.trim();
                if (!trimmed.toLowerCase().startsWith('for=')) continue;
                candidates.push(trimmed.substring(4));
            }
        }
    }
    return firstValidIp(candidates);
}

export function getRequestClientIp(req: IncomingMessage): string {
    const peerIp = req.socket.remoteAddress || '127.0.0.1';

    if (isTrustedProxyPeer(peerIp)) {
        const forwardedClientIp = firstValidIp([
            ...headerValues(req.headers['cf-connecting-ip']),
            ...headerValues(req.headers['true-client-ip']),
            ...headerValues(req.headers['x-real-ip']),
            ...headerValues(req.headers['x-forwarded-for']).flatMap((entry) => entry.split(',')),
        ]) ?? forwardedHeaderIp(req.headers.forwarded);

        if (forwardedClientIp) {
            return forwardedClientIp;
        }
    }

    return normalizeIp(peerIp);
}
