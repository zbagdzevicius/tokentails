import { Body, Controller, ForbiddenException, HttpCode, NotFoundException, Optional, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PartyRelayService } from '../../pawlegends/party/party-relay.service';

/** Loopback addresses only: the socket peer, never a forwarded header (a proxy could claim anything there). */
export const isLoopback = (addr: string | undefined): boolean =>
    addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

/*
 * `POST /pawlegends/relay/drain {maxMs?}` (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §4.2): start or tighten a drain of
 * the party relay in this process. deploy.sh on the GCP relay VM calls it on the old slot's loopback control port
 * once the new slot is ready, then polls `rooms_live` on `/healthz`. Loopback callers only (the socket peer address):
 * the load balancer never forwards it, and on DigitalOcean the route is public but every caller there is refused.
 * Idempotent: a second call keeps the earlier (sooner) deadline.
 */
@SkipThrottle()
@Controller('pawlegends/relay')
export class RelayDrainController {
    constructor(@Optional() private readonly relay?: PartyRelayService) {}

    @Post('drain')
    @HttpCode(202)
    drain(@Req() req: Request, @Body() body: { maxMs?: unknown } | undefined) {
        if (!isLoopback(req.socket?.remoteAddress)) throw new ForbiddenException();
        const maxMs = typeof body?.maxMs === 'number' ? body.maxMs : undefined;
        const out = this.relay?.drain(maxMs);
        if (!out) throw new NotFoundException('no relay in this process');
        return out;
    }
}
