import { applyTrustProxy, trustProxySetting } from './trust-proxy';

describe('TRUST_PROXY', () => {
    it('is off unless set, and parses a hop count', () => {
        expect(trustProxySetting('')).toBeUndefined();
        expect(trustProxySetting(undefined)).toBeUndefined();
        expect(trustProxySetting('1')).toBe(1);
        expect(trustProxySetting('loopback')).toBe('loopback');
    });

    it('sets Express trust proxy only when configured', () => {
        const set = jest.fn();
        const app: any = { getHttpAdapter: () => ({ getInstance: () => ({ set }) }) };

        applyTrustProxy(app, '');
        expect(set).not.toHaveBeenCalled();
        applyTrustProxy(app, '2');
        expect(set).toHaveBeenCalledWith('trust proxy', 2);
    });
});
