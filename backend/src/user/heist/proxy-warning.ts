import { Logger } from '@nestjs/common';

/**
 * True when the service runs in production without TRUST_PROXY. Behind the production load balancer
 * every request then comes from the balancer's address, so per-IP limits (the global throttler, the
 * Heist replay bucket) cannot tell clients apart.
 */
export function isProxyUntrusted(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.NODE_ENV === 'production' && !env.TRUST_PROXY;
}

/**
 * Say it loudly at startup (review 3b finding 2). The Heist replay guard also refuses replays with
 * 503 in this state (review 3b sixth pass, finding 1): per-player buckets alone would let a few
 * scripted guest accounts keep the replay queue full.
 */
export function warnIfProxyUntrusted(env: NodeJS.ProcessEnv = process.env, logger = new Logger('Bootstrap')): boolean {
    if (isProxyUntrusted(env)) {
        logger.error(
            'TRUST_PROXY is not set in production: behind a load balancer every client shares one per-IP rate-limit bucket, ' +
                'and Heist replays are refused with 503. Set TRUST_PROXY to the number of proxy hops (usually 1).'
        );
        return true;
    }
    return false;
}
