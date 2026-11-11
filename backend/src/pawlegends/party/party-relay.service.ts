import {
    BeforeApplicationShutdown,
    Inject,
    Injectable,
    Logger,
    OnApplicationBootstrap,
    Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'http';
import { CatRepository } from '../../cat/cat.repository';
import { partyCardResolver, type PartyCatDoc } from './party-cards';
import { drainMaxMsFrom, maxLiveRoomsFrom, PARTY_LIMITS, relayPoolFrom } from './party-limits';
import { PartyRelay } from './party-relay';
import { PartyTicketService } from './party-ticket.service';
import { MongoRoomStore } from './room-store';
import { MmService } from '../mm/mm.service';
import { InjectModel } from '@nestjs/mongoose';
import { PawlegendsPresence } from '../social/social.schema';
import { PresenceSink, type PresenceWriter } from './presence-sink';
import { BACKEND_ROLE, type BackendRole } from '../../shared/runtime/backend-role';

/*
 * Nest wiring of the party relay (docs/plans/moba/MULTIPLAYER.md §3.1). On bootstrap it takes the HTTP server from
 * HttpAdapterHost, restores rooms handed off by the previous instance (N9) and starts accepting `/pawlegends/ws`
 * upgrades; the relay keeps claiming handed-off rooms every second after that (LIVE-MATCH-DEPLOYS.md §5.3).
 * On SIGTERM it drains (LIVE-MATCH-DEPLOYS.md §4): readiness drops, live rooms play on until they end or until
 * RELAY_DRAIN_MAX_MS, then whatever is left is handed off (`room_gone` retry 0, checkpoint with `handoff`) and the
 * serving relay claims it. It holds no UserRepository or GameRepository: it never writes a score
 * (party-relay.no-score.spec.ts). No feature flag (D9): always on; without PAWLEGENDS_PARTY_TICKET_SECRET rooms are
 * simply unscored.
 */
@Injectable()
export class PartyRelayService implements OnApplicationBootstrap, BeforeApplicationShutdown {
    private relay: PartyRelay | null = null;
    /** Presence (SOCIAL-RANKED.md §4.3): the relay's phases into `pawlegendspresence`, batched every 5 s. */
    private presence: PresenceSink | null = null;
    private readonly logger = new Logger('PartyRelay');

    constructor(
        private readonly adapter: HttpAdapterHost,
        private readonly store: MongoRoomStore,
        private readonly tickets: PartyTicketService,
        private readonly cats: CatRepository,
        private readonly mm: MmService,
        @Optional() @Inject(BACKEND_ROLE) private readonly role?: BackendRole,
        @Optional() @InjectModel(PawlegendsPresence.name) private readonly presenceModel?: PresenceWriter
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const server = this.adapter.httpAdapter?.getHttpServer?.() as Server | undefined;
        if (!server) return;
        this.relay = new PartyRelay({
            server,
            store: this.store,
            tickets: this.tickets,
            maxLiveRooms: maxLiveRoomsFrom(),
            // D8: only a card the ticketed account owns; peers see its art, element, tier and catalog name
            cards: partyCardResolver({
                byId: async id => (await this.cats.get(id)) as unknown as PartyCatDoc | null,
            }),
            log: (event, props) => this.logger.log(`${event} ${JSON.stringify(props)}`),
            mm: this.mm,
            // the GCP relay VM owns its listener (blue/green on one port); DigitalOcean shares it with the HTTP API
            ownsServer: this.role === 'relay',
            drainMaxMs: drainMaxMsFrom(),
            pool: relayPoolFrom(this.role),
        });
        const relay = this.relay;
        this.presence = new PresenceSink(
            () => relay.presenceSnapshot(),
            this.presenceModel ?? null,
            Date.now,
            (event, props) => this.logger.warn(`${event} ${JSON.stringify(props)}`)
        );
        this.presence.start();
        try {
            const restored = await this.relay.restore();
            if (restored.length) this.logger.log(`restored ${restored.length} room(s)`);
        } catch (e) {
            this.logger.warn(`restore failed: ${String((e as Error)?.message || e)}`);
        }
    }

    // Before, not on, application shutdown: Nest closes the HTTP server between the two, and server.close() waits for
    // every upgraded socket, which only relay.shutdown() closes (1012). Mongo is still connected here for the handoff.
    // SIGTERM drains first (LIVE-MATCH-DEPLOYS.md §4.1): rooms that end within RELAY_DRAIN_MAX_MS never move at all.
    async beforeApplicationShutdown(): Promise<void> {
        this.presence?.stop();
        if (!this.relay) return;
        const d = this.relay.drain('sigterm', drainMaxMsFrom());
        this.logger.log(
            `drain on SIGTERM: ${d.rooms_live} live room(s), up to ${Math.round((d.deadlineMs - Date.now()) / 1000)} s`
        );
        await d.done;
        await this.relay.shutdown();
    }

    /** `POST /pawlegends/relay/drain` (loopback only): start or tighten a drain; answers at once. */
    drain(maxMs?: number) {
        if (!this.relay) return null;
        const ms = typeof maxMs === 'number' && Number.isFinite(maxMs) && maxMs >= 0 ? maxMs : drainMaxMsFrom();
        const d = this.relay.drain('endpoint', Math.min(ms, PARTY_LIMITS.drainEndpointMaxMs));
        return { state: d.state, rooms_live: d.rooms_live, deadline_in_ms: Math.max(0, d.deadlineMs - Date.now()) };
    }

    /** Draining or stopped: readiness answers 503 at once (LIVE-MATCH-DEPLOYS.md §4.3). */
    get draining(): boolean {
        return !!this.relay?.draining;
    }

    get counters() {
        return this.relay?.counters() ?? null;
    }
}
