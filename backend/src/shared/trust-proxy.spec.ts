import * as express from 'express';
import { applyTrustProxy, describeResolvedIp, isTrustedProxyHop, trustProxySetting } from './trust-proxy';

/** Builds a request through a real Express app with the given setting and returns req.ip / req.ips. */
function resolve(setting: unknown, socket: string, xff?: string): { ip: string; ips: string[] } {
    const app = express();
    app.set('trust proxy', setting);
    const req: any = Object.create((app as any).request);
    req.app = app;
    req.headers = xff ? { 'x-forwarded-for': xff } : {};
    req.connection = req.socket = { remoteAddress: socket };
    return { ip: req.ip, ips: req.ips };
}

describe('TRUST_PROXY', () => {
    it('defaults to trusting private, CGNAT and Cloudflare hops only', () => {
        const setting = trustProxySetting(undefined);
        expect(typeof setting).toBe('function');
        expect(trustProxySetting('')).toBe(setting);
        for (const hop of [
            '10.1.2.3',
            '127.0.0.1',
            '172.20.0.1',
            '192.168.1.1',
            '100.64.3.4',
            '169.254.1.1',
            '::1',
            'fd00::1',
            '162.158.1.1',
            '2606:4700::1',
            '::ffff:10.0.0.1',
        ]) {
            expect(isTrustedProxyHop(hop)).toBe(true);
        }
        for (const visitor of ['1.2.3.4', '203.0.113.7', '2001:db8::1', 'unknown', '']) {
            expect(isTrustedProxyHop(visitor)).toBe(false);
        }
    });

    it('by default the visitor is the first untrusted address from the right', () => {
        const setting = trustProxySetting(undefined);
        // Socket is the balancer (10.x); Cloudflare's edge is the last forwarded hop.
        expect(resolve(setting, '10.0.0.4', '1.2.3.4, 162.158.1.1')).toMatchObject({ ip: '1.2.3.4' });
        expect(resolve(setting, '10.0.0.4', '1.2.3.4, 162.158.1.1').ips[0]).toBe('1.2.3.4');
        // A forged leftmost entry is ignored.
        expect(resolve(setting, '10.0.0.4', '6.6.6.6, 1.2.3.4, 162.158.1.1').ip).toBe('1.2.3.4');
        // No proxy in front: the socket address is the visitor.
        expect(resolve(setting, '1.2.3.4', '6.6.6.6').ip).toBe('1.2.3.4');
    });

    it('keeps TRUST_PROXY as an override', () => {
        expect(trustProxySetting('1')).toBe(1);
        expect(trustProxySetting('loopback')).toBe('loopback');
        expect(trustProxySetting('false')).toBe(false);
        expect(trustProxySetting('0')).toBe(0);
        expect(resolve(trustProxySetting('0'), '10.0.0.4', '1.2.3.4').ip).toBe('10.0.0.4');
        expect(resolve(trustProxySetting('false'), '10.0.0.4', '1.2.3.4').ip).toBe('10.0.0.4');
        expect(resolve(trustProxySetting('1'), '10.0.0.4', '6.6.6.6, 1.2.3.4').ip).toBe('1.2.3.4');
    });

    it('applies the setting to Express and logs the first request kind once, never the address', () => {
        const set = jest.fn();
        const use = jest.fn();
        const app: any = { getHttpAdapter: () => ({ getInstance: () => ({ set, use }) }) };
        const logger: any = { log: jest.fn() };

        applyTrustProxy(app, '', logger);
        expect(set).toHaveBeenCalledWith('trust proxy', expect.any(Function));
        applyTrustProxy(app, '2', logger);
        expect(set).toHaveBeenLastCalledWith('trust proxy', 2);

        const middleware = use.mock.calls[0][0];
        const next = jest.fn();
        middleware({ ip: '1.2.3.4', headers: { 'cf-connecting-ip': '1.2.3.4' } }, {}, next);
        middleware({ ip: '5.6.7.8', headers: {} }, {}, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(logger.log).toHaveBeenCalledTimes(1);
        expect(logger.log.mock.calls[0][0]).not.toContain('1.2.3.4');
        expect(describeResolvedIp({ ip: '162.158.1.1', headers: {} })).toBe(
            'first request: req.ip is a Cloudflare edge, without cf-connecting-ip'
        );
    });
});
