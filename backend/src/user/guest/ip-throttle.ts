import { HttpException, HttpStatus, Logger } from '@nestjs/common';

/** The client address the global throttler uses too: `req.ips[0]` only when `trust proxy` is set. */
export function requestIp(req: { ips?: string[]; ip?: string } | undefined | null): string {
    const forwarded = req?.ips;
    return (forwarded?.length ? forwarded[0] : req?.ip) || 'unknown';
}

/**
 * Whether `ip` can identify one client: false for `'unknown'`, loopback, private (RFC 1918, unique
 * local IPv6), link-local and carrier-grade NAT addresses. Behind a load balancer with TRUST_PROXY
 * unset, `req.ip` is the balancer's private address, shared by every player.
 */
export function isUsableClientIp(ip: string | undefined | null): boolean {
    if (typeof ip !== 'string' || !ip || ip === 'unknown') {
        return false;
    }
    let address = ip.trim().toLowerCase();
    if (address.startsWith('::ffff:')) {
        address = address.slice('::ffff:'.length);
    }
    if (address.includes(':')) {
        // IPv6: loopback, unspecified, unique local fc00::/7, link-local fe80::/10.
        return !(address === '::1' || address === '::' || /^f[cd]/.test(address) || /^fe[89ab]/.test(address));
    }
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }
    const [a, b] = parts;
    return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
    );
}

const logger = new Logger('IpWindowThrottle');
// One warning per process, however many throttles skip.
let warnedUnusableIp = false;

export const tooManyRequests = (message: string) =>
    new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message }, HttpStatus.TOO_MANY_REQUESTS);

/**
 * Counts successful creations per IP in a sliding window (F5.2 step 4 `NewAccountThrottle`, F5.5
 * guest sessions). `check` runs before the write and refuses with 429 once the IP is at its limit;
 * `record` runs only after a document was really inserted, so parallel first requests of one
 * player count once.
 *
 * In-process, like the default throttler storage: each replica counts on its own, so the effective
 * limit is `limit × replicas`. Shared NATs (schools, carriers) share one bucket, which is why the
 * limits are loose.
 *
 * Fails open (2a review fix #3): an address that cannot identify a client (`isUsableClientIp`: a
 * missing address, or the balancer's private address when TRUST_PROXY is unset) is neither checked
 * nor recorded, and one warning is logged. Otherwise every new player of the site would share one
 * bucket and get 429 after the first few sign-ups of the hour.
 */
export class IpWindowThrottle {
    private readonly hits = new Map<string, number[]>();

    constructor(
        private readonly limit: () => number,
        private readonly message: string,
        private readonly windowMs = 60 * 60 * 1000,
        private readonly now: () => number = Date.now
    ) {}

    private recent(ip: string): number[] {
        const cutoff = this.now() - this.windowMs;
        const kept = (this.hits.get(ip) || []).filter(time => time > cutoff);
        if (kept.length) {
            this.hits.set(ip, kept);
        } else {
            this.hits.delete(ip);
        }
        return kept;
    }

    private usable(ip: string): boolean {
        if (isUsableClientIp(ip)) {
            return true;
        }
        if (!warnedUnusableIp) {
            warnedUnusableIp = true;
            logger.warn(
                'per-IP throttle skipped: the request has no public client address (set TRUST_PROXY behind a load balancer)'
            );
        }
        return false;
    }

    check(ip: string): void {
        if (!this.usable(ip)) {
            return;
        }
        if (this.recent(ip).length >= this.limit()) {
            throw tooManyRequests(this.message);
        }
    }

    record(ip: string): void {
        if (!this.usable(ip)) {
            return;
        }
        this.hits.set(ip, [...this.recent(ip), this.now()]);
        // Bound memory: drop the oldest buckets when very many addresses are tracked.
        if (this.hits.size > 50000) {
            const oldest = this.hits.keys().next().value;
            if (oldest !== undefined) {
                this.hits.delete(oldest);
            }
        }
    }
}
