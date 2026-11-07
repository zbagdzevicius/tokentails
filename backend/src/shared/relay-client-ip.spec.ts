import type { IncomingHttpHeaders } from 'http';
import { relayClientIp } from './relay-client-ip';

const CF_EDGE = '173.245.48.10';

describe('relayClientIp (the party relay S1 rule)', () => {
    const h = (o: Record<string, string>): IncomingHttpHeaders => o;

    it('a Cloudflare peer: the header, when it is an IP', () => {
        expect(relayClientIp(CF_EDGE, h({ 'cf-connecting-ip': '9.9.9.9' }), 'all')).toBe('9.9.9.9');
        expect(relayClientIp(CF_EDGE, h({ 'cf-connecting-ip': 'not-an-ip' }), 'all')).toBe(CF_EDGE);
    });

    it('a public peer that is not Cloudflare never picks its address', () => {
        expect(relayClientIp('8.8.4.4', h({ 'cf-connecting-ip': '9.9.9.9' }), 'all')).toBe('8.8.4.4');
    });

    it('DigitalOcean ingress: the header only when X-Forwarded-For names a Cloudflare edge', () => {
        const via = (xff: string, cf = '9.9.9.9') =>
            relayClientIp('10.0.0.1', h({ 'cf-connecting-ip': cf, 'x-forwarded-for': xff }), 'all');
        expect(via(`9.9.9.9, ${CF_EDGE}`)).toBe('9.9.9.9');
        expect(via(`${CF_EDGE}, 10.0.0.7`)).toBe('9.9.9.9');
        // a direct caller (the *.ondigitalocean.app domain): the forged header is ignored, the ingress' entry wins
        expect(via('1.2.3.4', '5.6.7.8')).toBe('1.2.3.4');
        expect(via('6.6.6.6, 1.2.3.4', '5.6.7.8')).toBe('1.2.3.4');
        // a header that is no IP is never a fresh bucket
        expect(via(CF_EDGE, 'garbage-1')).toBe(CF_EDGE);
    });

    it('local (no X-Forwarded-For) keeps the header from a private or loopback peer', () => {
        expect(relayClientIp('127.0.0.1', h({ 'cf-connecting-ip': '9.9.9.9' }), 'all')).toBe('9.9.9.9');
        expect(relayClientIp('127.0.0.1', h({ 'cf-connecting-ip': 'x' }), 'all')).toBe('127.0.0.1');
    });

    it('split roles (Google Cloud, Cloudflare-only balancer): a valid header from our hop', () => {
        expect(
            relayClientIp('10.0.0.1', h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }), 'relay')
        ).toBe('9.9.9.9');
        expect(relayClientIp('10.0.0.1', h({ 'cf-connecting-ip': 'nope' }), 'relay')).toBe('10.0.0.1');
    });
});
