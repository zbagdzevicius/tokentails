import { BeforeApplicationShutdown, Controller, Get, HttpStatus, Inject, Optional, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Connection } from 'mongoose';
import { PartyRelayService } from '../../pawlegends/party/party-relay.service';
import { BACKEND_ROLE, type BackendRole, servesRelay } from './backend-role';

/*
 * Health endpoints for load balancers and uptime checks (infra/gcp/RUNBOOK.md). `GET /` keeps answering `1`.
 *
 * - `GET /healthz`: liveness. 200 while the process serves HTTP. The relay role adds its counters (live rooms,
 *   sockets, loop p99); on Google Cloud the load balancer sends only `/pawlegends/ws` to the relay, so those numbers
 *   are reachable from the health checker and the VM itself only, never from the internet.
 * - `GET /readyz`: readiness. 503 while MongoDB is not connected, while the process is shutting down (SIGTERM, the
 *   relay handing its rooms off), while the relay drains (LIVE-MATCH-DEPLOYS.md §4.3: it reads the relay's own state,
 *   so it flips in the same tick, before Nest reaches this controller's shutdown hook), or when this role should serve
 *   the relay and it has not started. `/healthz` stays 200 while draining: liveness checks (DigitalOcean
 *   `health_check`, the GCP autoheal) must never restart a draining relay.
 */
// Probes are never throttled: a 429 from the app's global ThrottlerGuard would read as unhealthy.
@SkipThrottle()
@Controller()
export class HealthController implements BeforeApplicationShutdown {
    private stopping = false;

    constructor(
        @Inject(BACKEND_ROLE) private readonly role: BackendRole,
        @InjectConnection() private readonly connection: Connection,
        @Optional() private readonly relay?: PartyRelayService
    ) {}

    beforeApplicationShutdown(): void {
        this.stopping = true;
    }

    @Get('healthz')
    healthz() {
        // No uptime: it would show deploy times to anyone (the route is public on DigitalOcean and through Cloudflare).
        const body: Record<string, unknown> = { ok: true, role: this.role };
        // Cloud Run sets K_REVISION: deploy-gcp.yml checks that its canary request reached the new revision.
        if (process.env.K_REVISION) body.revision = process.env.K_REVISION;
        if (this.role === 'relay') body.relay = this.relay?.counters ?? null;
        // deploy.sh and replace-relay.sh poll this on the slot's control port while it drains (LIVE-MATCH-DEPLOYS.md §4.3)
        if (this.relay) body.state = this.relay.draining ? 'draining' : 'serving';
        return body;
    }

    @Get('readyz')
    readyz(@Res({ passthrough: true }) res: Response) {
        const mongo = this.connection?.readyState === 1;
        const relayUp = !servesRelay(this.role) || !!this.relay?.counters;
        const draining = !!this.relay?.draining;
        const ready = mongo && relayUp && !this.stopping && !draining;
        res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
        return {
            ready,
            role: this.role,
            mongo,
            relay: servesRelay(this.role) ? relayUp : undefined,
            stopping: this.stopping || draining,
            ...(draining ? { draining: true } : {}),
        };
    }
}
