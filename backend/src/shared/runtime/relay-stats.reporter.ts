import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PartyRelayService } from '../../pawlegends/party/party-relay.service';

/** One structured log line (Cloud Logging reads `severity` and puts the rest in jsonPayload). */
export function relayStatsLine(counters: Record<string, unknown> | null, now = new Date()): string {
    return JSON.stringify({
        severity: 'INFO',
        event: 'relay_stats',
        at: now.toISOString(),
        ...(counters ?? { up: false }),
    });
}

/*
 * BACKEND_ROLE=relay only (src/relay.module.ts): writes the relay counters (rooms_live, sockets, loop_delay_p99,
 * turn_overrun_ms_p99, referee_lag_turns and the restore, desync and refused_busy totals) as one JSON line a minute.
 * The log-based metrics and alerts in infra/gcp/terraform/modules/monitoring read these lines. No ids, no IPs.
 */
@Injectable()
export class RelayStatsReporter implements OnApplicationBootstrap, OnApplicationShutdown {
    static everyMs = 60_000;
    private timer: NodeJS.Timeout | null = null;

    /** Test seam: where the line goes (stdout in production, where the logging agent reads it). */
    write: (line: string) => void = line => process.stdout.write(`${line}\n`);

    constructor(private readonly relay: PartyRelayService) {}

    onApplicationBootstrap(): void {
        this.timer = setInterval(() => this.report(), RelayStatsReporter.everyMs);
        this.timer.unref?.();
    }

    report(): void {
        try {
            this.write(relayStatsLine(this.relay.counters as Record<string, unknown> | null));
        } catch {
            // a stats line must never break the relay
        }
    }

    onApplicationShutdown(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }
}
