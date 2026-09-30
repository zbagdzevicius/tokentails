import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Default limit for every route: requests per IP per minute. Routes tighten it with `@Throttle`. */
export const DEFAULT_THROTTLE = { name: 'default', ttl: 60000, limit: 300 };

/**
 * Global rate limiter, registered as APP_GUARD in the app module.
 *
 * Tracks by client IP. `req.ips` is only filled when Express `trust proxy` is set, so the
 * spoofable X-Forwarded-For header is never read otherwise. Behind a load balancer without
 * `trust proxy`, every request shares the balancer's IP and one bucket.
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
        const forwarded: string[] | undefined = req.ips;
        return forwarded?.length ? forwarded[0] : req.ip;
    }
}
