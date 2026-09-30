import { INestApplication } from '@nestjs/common';

/**
 * The global throttler keys on the client IP. Behind a load balancer or reverse proxy, set
 * TRUST_PROXY to the number of proxy hops (usually 1), or any Express `trust proxy` value, so
 * req.ip is the client and not the proxy. Unset means no proxy is trusted: X-Forwarded-For is
 * ignored, and behind a proxy every user would share one rate-limit bucket.
 */
export function trustProxySetting(value = process.env.TRUST_PROXY): number | string | undefined {
    if (!value) {
        return undefined;
    }
    return /^\d+$/.test(value) ? Number(value) : value;
}

export function applyTrustProxy(app: INestApplication, value = process.env.TRUST_PROXY): void {
    const setting = trustProxySetting(value);
    if (setting !== undefined) {
        app.getHttpAdapter().getInstance().set('trust proxy', setting);
    }
}
