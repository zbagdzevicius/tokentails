import { isIP } from 'net';
import { isUsableClientIp, requestIp } from 'src/user/guest/ip-throttle';
import { isCloudflareIp } from './cloudflare-ips';
import { BackendRole, backendRole } from './runtime/backend-role';

/*
 * The visitor's address for the AI quotas, the per-IP throttlers and the Heist replay bucket (bet #3,
 * docs/plans/yourcat-v2.md section 3.1, layer 2).
 *
 * 1. `cf-connecting-ip` when it is a usable public address (Cloudflare sets it on every proxied
 *    request; it keeps working if another public hop sits in front of the origin).
 * 2. Else the Express address (`requestIp`: `req.ips[0]` or `req.ip`), which the default `trust proxy`
 *    setting (shared/trust-proxy.ts) resolves to the first hop that is not ours. A Cloudflare edge
 *    address is never used as a visitor: it is shared by many visitors.
 *
 * There is no origin secret (removed 2026-10-16, founder decision). A caller who reaches the origin
 * directly can set `cf-connecting-ip` and get a fresh per-IP bucket; docs/BACKEND.md "Known issues"
 * records this accepted risk. The per-chain treat budget and the AI euro caps still bound the cost.
 *
 * The address checks use `isUsableClientIp` (no loopback, private, link-local or CGNAT addresses).
 */

export interface ClientIp {
    /** The address (never logged or stored). */
    ip: string;
    /** The bucket key: the address, or its /64 for IPv6 (one home network rotates through a /64). */
    key: string;
}

export function clientIpKey(ip: string): string {
    let address = ip.trim().toLowerCase();
    if (address.startsWith('::ffff:') && isIP(address.slice('::ffff:'.length)) === 4) {
        address = address.slice('::ffff:'.length);
    }
    if (isIP(address) !== 6) {
        return address;
    }
    // Expand to 8 groups and keep the first 4 (the /64).
    const [head, tail = ''] = address.split('::');
    const left = head ? head.split(':') : [];
    const right = address.includes('::') && tail ? tail.split(':') : [];
    const groups = address.includes('::')
        ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
        : left;
    return `${groups
        .slice(0, 4)
        .map(group => parseInt(group || '0', 16).toString(16))
        .join(':')}::/64`;
}

const result = (ip: string): ClientIp => ({ ip, key: clientIpKey(ip) });

/**
 * The client address, or null in production when none is usable. Outside production a request with
 * no usable address (local development) gets the shared `'dev'` bucket.
 */
export function clientIp(req: any, env: NodeJS.ProcessEnv = process.env): ClientIp | null {
    const header = req?.headers?.['cf-connecting-ip'];
    const cf = typeof header === 'string' ? header.trim() : '';
    if (isUsableClientIp(cf) && !isCloudflareIp(cf)) {
        return result(cf);
    }
    const express = requestIp(req);
    if (isUsableClientIp(express) && !isCloudflareIp(express)) {
        return result(express);
    }
    if (env.NODE_ENV === 'production') {
        return null;
    }
    return { ip: 'dev', key: 'dev' };
}

/**
 * The visitor address for the per-IP creation throttles (new accounts, guest sessions) and the donation relay hash.
 *
 * - Split roles (`api`, `relay`: Google Cloud only): a usable `cf-connecting-ip` first, else the Express address.
 *   There the origin is reachable only through the regional load balancer, whose Cloud Armor policy admits Cloudflare
 *   ranges only (infra/gcp `edge_lb_regional`, Cloud Run ingress `INTERNAL_LOAD_BALANCER`), so the header was set by
 *   Cloudflare. The Express address is the balancer's own public forwarding-rule IP for every visitor (it appends
 *   itself to X-Forwarded-For and is not a hop `trust-proxy.ts` trusts), so reading `requestIp` directly there would
 *   put the whole site in one bucket.
 * - Role `all` (DigitalOcean, local development): the Express address (`requestIp`) only, as before the migration.
 *   The DigitalOcean origin URL is reachable directly, so a client-sent `cf-connecting-ip` cannot be told from
 *   Cloudflare's; trusting it would let a direct caller skip these caps with a fresh address per request, or fill a
 *   victim address's bucket. These caps do not take the "Accepted (founder, 2026-10-16)" risk of `clientIp()`.
 *
 * Never null. An unusable result is skipped downstream (`IpWindowThrottle` fails open).
 */
export function visitorIp(req: any, role: BackendRole = backendRole()): string {
    if (role !== 'all') {
        const header = req?.headers?.['cf-connecting-ip'];
        const cf = typeof header === 'string' ? header.trim() : '';
        if (isUsableClientIp(cf) && !isCloudflareIp(cf)) {
            return cf;
        }
    }
    return requestIp(req);
}
