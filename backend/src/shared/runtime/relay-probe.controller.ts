import { Controller, Get } from '@nestjs/common';

/*
 * BACKEND_ROLE=relay only. The load balancer sends `/pawlegends/ws` and `/pawlegends/ws/*` to the relay VM, so this
 * plain GET proves from the outside (uptime check through Cloudflare) that the route reaches the relay and not the
 * API. It shows no counters; those stay on the internal `/healthz`.
 */
@Controller('pawlegends/ws')
export class RelayProbeController {
    @Get('healthz')
    probe() {
        return { ok: true, role: 'relay' };
    }
}
