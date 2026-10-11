import { clientIp, clientIpKey, hasOriginProof } from './client-ip';
import { isCloudflareIp } from './cloudflare-ips';

const VISITOR = '203.0.113.7';
const CLOUDFLARE_EDGE = '172.70.1.2';

const request = (headers: Record<string, string> = {}, ip = '10.0.0.4', ips: string[] = []) => ({ headers, ip, ips });

describe('clientIp', () => {
    it('trusts cf-connecting-ip only with a matching x-tt-origin-auth', () => {
        const env = { CF_ORIGIN_SECRET: 's3cret', NODE_ENV: 'production' } as any;
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR, 'x-tt-origin-auth': 's3cret' }), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
            trusted: true,
        });
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR, 'x-tt-origin-auth': 'guess' }), env)?.trusted).toBe(
            false
        );
        expect(hasOriginProof(request({ 'x-tt-origin-auth': 's3cret' }), env)).toBe(true);
        expect(hasOriginProof(request({ 'x-tt-origin-auth': 's3cret' }), {} as any)).toBe(false);
    });

    it('under TRUST_PROXY, trusts cf-connecting-ip when req.ip is a Cloudflare edge address', () => {
        const env = { TRUST_PROXY: '1', NODE_ENV: 'production' } as any;
        expect(isCloudflareIp(CLOUDFLARE_EDGE)).toBe(true);
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR }, CLOUDFLARE_EDGE), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
            trusted: true,
        });
        // Not a Cloudflare hop: req.ip is the client (trusted under TRUST_PROXY), the header is ignored.
        expect(clientIp(request({ 'cf-connecting-ip': '198.51.100.1' }, VISITOR), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
            trusted: true,
        });
    });

    it('a forged header sent straight to the origin is trusted: false', () => {
        const env = { NODE_ENV: 'production' } as any;
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR }), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
            trusted: false,
        });
    });

    it('skips private and loopback addresses', () => {
        const env = { NODE_ENV: 'production' } as any;
        expect(clientIp(request({ 'cf-connecting-ip': '192.168.1.5' }, '127.0.0.1'), env)).toBeNull();
        expect(clientIp(request({ 'cf-connecting-ip': '10.1.2.3' }, VISITOR), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
            trusted: false,
        });
    });

    it('production with no usable address gives null; elsewhere the shared dev bucket', () => {
        expect(clientIp(request(), { NODE_ENV: 'production' } as any)).toBeNull();
        expect(clientIp(request(), { NODE_ENV: 'development' } as any)).toEqual({
            ip: 'dev',
            key: 'dev',
            trusted: false,
        });
    });

    it('keys IPv6 on its /64', () => {
        expect(clientIpKey('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
        expect(clientIpKey('2001:db8:aa:bb::9')).toBe('2001:db8:aa:bb::/64');
        expect(clientIpKey('::ffff:203.0.113.7')).toBe(VISITOR);
    });
});
