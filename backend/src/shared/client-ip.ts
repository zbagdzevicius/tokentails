import { createHash, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { isUsableClientIp, requestIp } from 'src/user/guest/ip-throttle';
import { isCloudflareIp } from './cloudflare-ips';

/*
 * The visitor's address for the AI quotas and the per-IP throttler (bet #3, docs/plans/yourcat-v2.md
 * section 3.1, layer 2).
 *
 * `cf-connecting-ip` is believed only when the request provably came through Cloudflare:
 * (a) CF_ORIGIN_SECRET is set and the request carries the same value in `x-tt-origin-auth` (a Cloudflare
 *     Transform Rule adds it to every proxied request), compared in constant time; or
 * (b) TRUST_PROXY is set and `req.ip` (the hop in front of the DigitalOcean balancer) is a Cloudflare
 *     edge address.
 * Otherwise `req.ip` under TRUST_PROXY is trusted, and a raw `cf-connecting-ip` may still be used as a
 * quota key, but `trusted: false`: a request sent straight to the origin can forge it.
 *
 * The address checks follow `guestTreatIp` (shelter module, not imported) and use `isUsableClientIp`.
 */

export interface ClientIp {
    /** The address (never logged or stored). */
    ip: string;
    /** The bucket key: the address, or its /64 for IPv6 (one home network rotates through a /64). */
    key: string;
    trusted: boolean;
}

export const ORIGIN_AUTH_HEADER = 'x-tt-origin-auth';

/**
 * The one bucket every unprovable address shares in production (the AI preview quota and the per-IP
 * throttler). Keying those requests on the raw `cf-connecting-ip` let a forger mint a fresh bucket per
 * request; one shared key caps them all.
 */
export const UNTRUSTED_IP_BUCKET = 'untrusted';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison of the origin secret header with CF_ORIGIN_SECRET. */
export function hasOriginProof(req: any, env: NodeJS.ProcessEnv = process.env): boolean {
    const secret = env.CF_ORIGIN_SECRET;
    const header = req?.headers?.[ORIGIN_AUTH_HEADER];
    if (!secret || typeof header !== 'string' || !header) {
        return false;
    }
    return timingSafeEqual(digest(header), digest(secret));
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

const result = (ip: string, trusted: boolean): ClientIp => ({ ip, key: clientIpKey(ip), trusted });

/**
 * The client address, or null in production when none is usable. Outside production a request with
 * no usable address (local development) gets the shared `'dev'` bucket.
 */
export function clientIp(req: any, env: NodeJS.ProcessEnv = process.env): ClientIp | null {
    const header = req?.headers?.['cf-connecting-ip'];
    const cf = typeof header === 'string' ? header.trim() : '';
    const trustProxy = !!env.TRUST_PROXY;
    const viaCloudflare = hasOriginProof(req, env) || (trustProxy && isCloudflareIp(req?.ip));

    if (viaCloudflare && isUsableClientIp(cf)) {
        return result(cf, true);
    }
    const express = requestIp(req);
    // Under TRUST_PROXY `req.ip` is the client, unless it is Cloudflare's own edge address.
    if (trustProxy && isUsableClientIp(express) && !isCloudflareIp(express)) {
        return result(express, true);
    }
    if (isUsableClientIp(cf)) {
        return result(cf, false);
    }
    if (isUsableClientIp(express)) {
        return result(express, false);
    }
    if (env.NODE_ENV === 'production') {
        return null;
    }
    return { ip: 'dev', key: 'dev', trusted: false };
}
