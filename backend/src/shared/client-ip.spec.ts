import { clientIp, clientIpKey } from './client-ip';

const VISITOR = '203.0.113.7';
const CLOUDFLARE_EDGE = '172.70.1.2';

const request = (headers: Record<string, string> = {}, ip = '10.0.0.4', ips: string[] = []) => ({ headers, ip, ips });

describe('clientIp', () => {
    it('uses a usable cf-connecting-ip with no env at all', () => {
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR }), {} as any)).toEqual({ ip: VISITOR, key: VISITOR });
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR }), { NODE_ENV: 'production' } as any)).toEqual({
            ip: VISITOR,
            key: VISITOR,
        });
        // A leftover CF_ORIGIN_SECRET and a missing x-tt-origin-auth header change nothing.
        expect(
            clientIp(request({ 'cf-connecting-ip': VISITOR }), { NODE_ENV: 'production', CF_ORIGIN_SECRET: 'x' } as any)
        ).toEqual({ ip: VISITOR, key: VISITOR });
    });

    it('with no header, uses the Express address (req.ips[0], else req.ip)', () => {
        const env = { NODE_ENV: 'production' } as any;
        expect(clientIp(request({}, VISITOR), env)).toEqual({ ip: VISITOR, key: VISITOR });
        expect(clientIp(request({}, '10.0.0.4', ['198.51.100.9', '162.158.1.1']), env)).toEqual({
            ip: '198.51.100.9',
            key: '198.51.100.9',
        });
    });

    it('never uses a private, loopback or Cloudflare edge address as the visitor', () => {
        const env = { NODE_ENV: 'production' } as any;
        expect(clientIp(request({ 'cf-connecting-ip': '192.168.1.5' }, '127.0.0.1'), env)).toBeNull();
        expect(clientIp(request({ 'cf-connecting-ip': '10.1.2.3' }, VISITOR), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
        });
        expect(clientIp(request({}, CLOUDFLARE_EDGE), env)).toBeNull();
        expect(clientIp(request({ 'cf-connecting-ip': VISITOR }, CLOUDFLARE_EDGE), env)).toEqual({
            ip: VISITOR,
            key: VISITOR,
        });
    });

    it('production with no usable address gives null; elsewhere the shared dev bucket', () => {
        expect(clientIp(request(), { NODE_ENV: 'production' } as any)).toBeNull();
        expect(clientIp(request(), { NODE_ENV: 'development' } as any)).toEqual({ ip: 'dev', key: 'dev' });
    });

    it('keys IPv6 on its /64', () => {
        expect(clientIpKey('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
        expect(clientIpKey('2001:db8:aa:bb::9')).toBe('2001:db8:aa:bb::/64');
        expect(clientIpKey('::ffff:203.0.113.7')).toBe(VISITOR);
        expect(clientIp(request({ 'cf-connecting-ip': '2001:db8:aa:bb:1:2:3:4' }), {} as any)?.key).toBe(
            '2001:db8:aa:bb::/64'
        );
    });
});
