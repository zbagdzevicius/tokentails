import { BeforeApplicationShutdown, Controller, Get, HttpStatus, Inject, Optional, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
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
 *   relay handing its rooms off), or when this role should serve the relay and it has not started.
 */
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
        const body: Record<string, unknown> = { ok: true, role: this.role, uptimeS: Math.round(process.uptime()) };
        if (this.role === 'relay') body.relay = this.relay?.counters ?? null;
        return body;
    }

    @Get('readyz')
    readyz(@Res({ passthrough: true }) res: Response) {
        const mongo = this.connection?.readyState === 1;
        const relayUp = !servesRelay(this.role) || !!this.relay?.counters;
        const ready = mongo && relayUp && !this.stopping;
        res.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
        return {
            ready,
            role: this.role,
            mongo,
            relay: servesRelay(this.role) ? relayUp : undefined,
            stopping: this.stopping,
        };
    }
}
