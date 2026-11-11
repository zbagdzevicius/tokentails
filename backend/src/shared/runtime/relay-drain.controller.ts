import { Body, Controller, ForbiddenException, HttpCode, NotFoundException, Optional, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PartyRelayService } from '../../pawlegends/party/party-relay.service';

/** Loopback addresses only: the socket peer, never a forwarded header (a proxy could claim anything there). */
export const isLoopback = (addr: string | undefined): boolean =>
    addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';

/** The relay VM's per-slot loopback control port (RELAY_CONTROL_PORT, main.ts); 0 when this process has none. */
export function controlPortFrom(env: NodeJS.ProcessEnv = process.env): number {
    const n = Number(env.RELAY_CONTROL_PORT || 0);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : 0;
}

/*
 * `POST /pawlegends/relay/drain {maxMs?}` (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §4.2): start or tighten a drain of
 * the party relay in this process. deploy.sh on the GCP relay VM calls it on the old slot's loopback control port
 * once the new slot is ready, then polls `rooms_live` on `/healthz`. Served only to a loopback peer on the control
 * port (RELAY_CONTROL_PORT, bound to 127.0.0.1 by main.ts): the public port refuses it even from a loopback peer (a
 * local reverse proxy would make every internet caller look like 127.0.0.1), and a process without a control port
 * (DigitalOcean, Cloud Run) refuses every caller. An endpoint drain ends in relay.shutdown(), so it must never be
 * reachable from outside. Idempotent: a second call keeps the earlier (sooner) deadline.
 */
@SkipThrottle()
@Controller('pawlegends/relay')
export class RelayDrainController {
    constructor(@Optional() private readonly relay?: PartyRelayService) {}

    @Post('drain')
    @HttpCode(202)
    drain(@Req() req: Request, @Body() body: { maxMs?: unknown } | undefined) {
        const control = controlPortFrom();
        if (!control || req.socket?.localPort !== control || !isLoopback(req.socket?.remoteAddress))
            throw new ForbiddenException();
        const maxMs = typeof body?.maxMs === 'number' ? body.maxMs : undefined;
        const out = this.relay?.drain(maxMs);
        if (!out) throw new NotFoundException('no relay in this process');
        return out;
    }
}
