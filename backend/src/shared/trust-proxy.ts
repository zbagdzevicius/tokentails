import { INestApplication, Logger } from '@nestjs/common';
import { BlockList, isIP } from 'net';
import { isCloudflareIp } from './cloudflare-ips';

/*
 * Which proxy hops Express trusts, so `req.ip` (and `req.ips[0]`) is the visitor and not a proxy.
 *
 * Default (TRUST_PROXY unset): trust our own hops only. Those are loopback, private (RFC 1918, unique
 * local IPv6), link-local, carrier-grade NAT (100.64.0.0/10, a possible DigitalOcean internal range)
 * and Cloudflare's edge ranges (`cloudflare-ips.ts`). Express walks X-Forwarded-For from the right and
 * skips trusted hops, so `req.ip` is the first address we do not trust: the visitor. A client can only
 * add entries on the left, so it cannot forge this, whatever the number of hops.
 *
 * TRUST_PROXY stays as an override: any Express `trust proxy` value (a hop count, `loopback`, a list
 * of addresses), or `0` / `false` to trust no proxy. `true` is not the default on purpose: with it,
 * `req.ips[0]` is the leftmost entry, which the client controls.
 */

const ownHops = new BlockList();
for (const [address, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
] as const) {
    ownHops.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
    ['::1', 128],
    ['fc00::', 7],
    ['fe80::', 10],
] as const) {
    ownHops.addSubnet(address, prefix, 'ipv6');
}

/** True for a hop the default setting trusts: private, loopback, link-local, CGNAT or Cloudflare. */
export function isTrustedProxyHop(ip: unknown): boolean {
    if (typeof ip !== 'string' || !ip) {
        return false;
    }
    let address = ip.trim().toLowerCase();
    if (address.startsWith('::ffff:') && isIP(address.slice('::ffff:'.length)) === 4) {
        address = address.slice('::ffff:'.length);
    }
    const family = isIP(address);
    if (family === 0) {
        return false;
    }
    if (ownHops.check(address, family === 4 ? 'ipv4' : 'ipv6')) {
        return true;
    }
    return isCloudflareIp(address);
}

/** The default `trust proxy` function (Express passes each hop address, right to left). */
export const defaultTrustProxy = (address: string): boolean => isTrustedProxyHop(address);

export type TrustProxySetting = number | string | boolean | ((address: string, hop: number) => boolean);

/** The Express `trust proxy` value: the TRUST_PROXY override when set, else `defaultTrustProxy`. */
export function trustProxySetting(value = process.env.TRUST_PROXY): TrustProxySetting {
    const raw = value?.trim();
    if (!raw) {
        return defaultTrustProxy;
    }
    if (raw.toLowerCase() === 'false') {
        return false;
    }
    if (raw.toLowerCase() === 'true') {
        return true;
    }
    return /^\d+$/.test(raw) ? Number(raw) : raw;
}

/** What kind of address a request resolved to, for the one startup log line (never the address). */
export function describeResolvedIp(req: { ip?: string; headers?: Record<string, unknown> }): string {
    const ip = req?.ip;
    const kind = !ip
        ? 'none'
        : isCloudflareIp(ip)
        ? 'a Cloudflare edge'
        : isTrustedProxyHop(ip)
        ? 'a private hop'
        : 'a public address';
    const cf = typeof req?.headers?.['cf-connecting-ip'] === 'string' ? 'with' : 'without';
    return `first request: req.ip is ${kind}, ${cf} cf-connecting-ip`;
}

export function applyTrustProxy(
    app: INestApplication,
    value = process.env.TRUST_PROXY,
    logger = new Logger('TrustProxy')
): void {
    const instance = app.getHttpAdapter().getInstance();
    instance.set('trust proxy', trustProxySetting(value));
    // Log once what the first request resolved to, so a wrong default shows in the deploy log.
    let logged = false;
    if (typeof instance.use === 'function') {
        instance.use((req: any, _res: unknown, next: () => void) => {
            if (!logged) {
                logged = true;
                try {
                    logger.log(describeResolvedIp(req));
                } catch {
                    // Logging must never break a request.
                }
            }
            next();
        });
    }
}
