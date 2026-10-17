import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { clientIp } from '../client-ip';

/** Default limit for every route: requests per IP per minute. Routes tighten it with `@Throttle`. */
export const DEFAULT_THROTTLE = { name: 'default', ttl: 60000, limit: 300 };

/**
 * Global rate limiter, registered as APP_GUARD in the app module.
 *
 * Tracks by the client address (`clientIp`: a usable `cf-connecting-ip`, else the Express address that
 * the default `trust proxy` setting resolves past our own hops). A request with no usable address
 * falls back to `req.ips[0]` or `req.ip`. Raw X-Forwarded-For is never read here.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
    /** The `GET /` health check is never throttled, so probes cannot be locked out. */
    protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return true;
        }
        const req = context.switchToHttp().getRequest();
        return req?.method === 'GET' && (req.path === '/' || req.url === '/');
    }

    protected async getTracker(req: Record<string, any>): Promise<string> {
        const client = clientIp(req);
        if (client && client.ip !== 'dev') {
            return client.key;
        }
        const forwarded: string[] | undefined = req.ips;
        return forwarded?.length ? forwarded[0] : req.ip;
    }
}
