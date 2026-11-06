import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'http';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { MongoRoomStore } from './room-store';

/*
 * Nest wiring of the party relay (docs/plans/moba/MULTIPLAYER.md §3.1). On bootstrap it takes the HTTP server from
 * HttpAdapterHost, restores rooms handed off by the previous instance (N9) and starts accepting `/pawlegends/ws`
 * upgrades. On shutdown (SIGTERM) it stops the clocks, sends `room_gone` (retry in 3 s) and checkpoints with
 * `handoff`. It holds no UserRepository or GameRepository: it never writes a score (party-relay.no-score.spec.ts).
 * No feature flag (D9): always on; without PAWLEGENDS_PARTY_TICKET_SECRET rooms are simply unscored.
 */
@Injectable()
export class PartyRelayService implements OnApplicationBootstrap, OnApplicationShutdown {
    private relay: PartyRelay | null = null;
    private readonly logger = new Logger('PartyRelay');

    constructor(
        private readonly adapter: HttpAdapterHost,
        private readonly store: MongoRoomStore,
        private readonly tickets: PartyTicketService
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const server = this.adapter.httpAdapter?.getHttpServer?.() as Server | undefined;
        if (!server) return;
        this.relay = new PartyRelay({
            server,
            store: this.store,
            tickets: this.tickets,
            log: (event, props) => this.logger.log(`${event} ${JSON.stringify(props)}`),
        });
        try {
            const restored = await this.relay.restore();
            if (restored.length) this.logger.log(`restored ${restored.length} room(s)`);
        } catch (e) {
            this.logger.warn(`restore failed: ${String((e as Error)?.message || e)}`);
        }
    }

    async onApplicationShutdown(): Promise<void> {
        await this.relay?.shutdown();
    }

    get counters() {
        return this.relay?.counters() ?? null;
    }
}
