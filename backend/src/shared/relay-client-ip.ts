import type { IncomingHttpHeaders } from 'http';
import { isIP } from 'net';
import { isCloudflareIp } from './cloudflare-ips';
import { BackendRole, backendRole } from './runtime/backend-role';
import { isTrustedProxyHop } from './trust-proxy';

/*
 * The visitor address of a party relay upgrade (S1 rule, docs/plans/moba/MULTIPLAYER.md §9). Every per-IP cap of the
 * relay and of Quick Play (sockets, live rooms, parties, joins, queued entries) keys on it, so a forged address would
 * void them all.
 *
 * - A Cloudflare peer: its `cf-connecting-ip`.
 * - Split roles (`api`, `relay`: Google Cloud): the balancer admits Cloudflare ranges only (see `visitorIp` in
 *   client-ip.ts), so a valid `cf-connecting-ip` from one of our hops was set by Cloudflare.
 * - Role `all` (DigitalOcean, local): the app sits behind the DigitalOcean ingress, which is reachable directly (the
 *   *.ondigitalocean.app domain). The header is trusted only when the request really came through Cloudflare: the
 *   first X-Forwarded-For entry from the right that is not one of our private hops is a Cloudflare edge. Otherwise
 *   that entry is the visitor (a direct caller cannot forge it: the ingress appends it). No X-Forwarded-For at all
 *   (local development, specs) keeps the header from a loopback or private peer.
 *
 * The header must parse as an IP (`isIP`); anything else is ignored.
 */

const norm = (v: string): string => {
    let a = v.trim().toLowerCase();
    if (a.startsWith('::ffff:') && isIP(a.slice('::ffff:'.length)) === 4) a = a.slice('::ffff:'.length);
    return a;
};

/** A private, loopback, link-local or CGNAT hop of ours (a Cloudflare edge is not counted here). */
const ownPrivateHop = (ip: string): boolean => isTrustedProxyHop(ip) && !isCloudflareIp(ip);

export function relayClientIp(peer: string, headers: IncomingHttpHeaders, role: BackendRole = backendRole()): string {
    const raw = headers['cf-connecting-ip'];
    const cf = typeof raw === 'string' ? norm(raw) : '';
    const cfOk = !!cf && isIP(cf) !== 0;
    if (isCloudflareIp(peer)) return cfOk ? cf : peer;
    if (!isTrustedProxyHop(peer)) return peer;
    if (role !== 'all') return cfOk ? cf : peer;
    const xffRaw = headers['x-forwarded-for'];
    const xff = (Array.isArray(xffRaw) ? xffRaw.join(',') : xffRaw ?? '').split(',').map(norm).filter(Boolean);
    for (let i = xff.length - 1; i >= 0; i--) {
        const hop = xff[i];
        if (isIP(hop) === 0) return peer; // a hop we cannot read: fall back to the peer, never the header
        if (ownPrivateHop(hop)) continue;
        if (isCloudflareIp(hop)) return cfOk ? cf : hop;
        return hop; // a direct caller through the ingress: the address the ingress saw
    }
    return cfOk ? cf : peer;
}
