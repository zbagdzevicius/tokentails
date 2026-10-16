import { BlockList, isIP } from 'net';

/**
 * Cloudflare's published edge ranges, copied from https://www.cloudflare.com/ips-v4 and
 * https://www.cloudflare.com/ips-v6 on 2026-10-11. They feed the default `trust proxy` setting
 * (shared/trust-proxy.ts: a Cloudflare edge hop is skipped when finding the visitor) and keep an edge
 * address from ever being used as a visitor (shared/client-ip.ts). Re-copy them when Cloudflare
 * announces a change; a missing range makes those visitors share their edge's address.
 */
export const CLOUDFLARE_IPS_COPIED_AT = '2026-10-11';

export const CLOUDFLARE_IPV4 = [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
] as const;

export const CLOUDFLARE_IPV6 = [
    '2400:cb00::/32',
    '2606:4700::/32',
    '2803:f800::/32',
    '2405:b500::/32',
    '2405:8100::/32',
    '2a06:98c0::/29',
    '2c0f:f248::/32',
] as const;

const ranges = new BlockList();
for (const cidr of CLOUDFLARE_IPV4) {
    const [address, prefix] = cidr.split('/');
    ranges.addSubnet(address, Number(prefix), 'ipv4');
}
for (const cidr of CLOUDFLARE_IPV6) {
    const [address, prefix] = cidr.split('/');
    ranges.addSubnet(address, Number(prefix), 'ipv6');
}

/** Whether `ip` (IPv4, IPv6 or IPv4-mapped IPv6) is a Cloudflare edge address. */
export function isCloudflareIp(ip: unknown): boolean {
    if (typeof ip !== 'string' || !ip) {
        return false;
    }
    let address = ip.trim().toLowerCase();
    if (address.startsWith('::ffff:') && isIP(address.slice('::ffff:'.length)) === 4) {
        address = address.slice('::ffff:'.length);
    }
    const family = isIP(address);
    if (family === 4) {
        return ranges.check(address, 'ipv4');
    }
    if (family === 6) {
        return ranges.check(address, 'ipv6');
    }
    return false;
}
