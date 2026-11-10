import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatRepository } from './cat/cat.repository';
import { Cat, CatSchema } from './cat/cat.schema';
import { MmService, PAWLEGENDS_MM_SCHEMAS } from './pawlegends/mm/mm.service';
import { PartyRelayService } from './pawlegends/party/party-relay.service';
import { PartyTicketService } from './pawlegends/party/party-ticket.service';
import { MongoRoomStore, PAWLEGENDS_PARTY_SCHEMAS } from './pawlegends/party/room-store';
import { BACKEND_ROLE } from './shared/runtime/backend-role';
import { HealthController } from './shared/runtime/health.controller';
import { RelayDrainController } from './shared/runtime/relay-drain.controller';
import { RelayProbeController } from './shared/runtime/relay-probe.controller';
import { RelayStatsReporter } from './shared/runtime/relay-stats.reporter';

/*
 * BACKEND_ROLE=relay (src/shared/runtime/backend-role.ts): the Pawlegends party relay alone, for its own VM.
 * - Only what PartyRelayService needs: its room store, the ticket verifier, the cat collection for party cards and
 *   MmService (Quick Play mm room records and the rating reader; it writes no rating, /live on the API does).
 * - No ScheduleModule, so no cron runs here; no Stripe, hot-wallet, Firebase or AI provider is built, so the relay VM
 *   holds none of those secrets.
 * - HTTP surface: `/healthz`, `/readyz`, `/pawlegends/ws/healthz` (routing probe), `POST /pawlegends/relay/drain`
 *   (loopback only, LIVE-MATCH-DEPLOYS.md §4.2) and the `/pawlegends/ws` upgrade.
 *   Party tickets are minted by the API role (`POST /pawlegends/party/ticket`) with the same
 *   PAWLEGENDS_PARTY_TICKET_SECRET.
 * - RelayStatsReporter logs the relay counters once a minute for the log-based metrics.
 */
@Module({
    imports: [
        MongooseModule.forRoot(process.env.MONGODB_URI!, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }),
        MongooseModule.forFeature([
            { name: Cat.name, schema: CatSchema },
            ...PAWLEGENDS_PARTY_SCHEMAS,
            ...PAWLEGENDS_MM_SCHEMAS,
        ]),
    ],
    controllers: [HealthController, RelayProbeController, RelayDrainController],
    providers: [
        { provide: BACKEND_ROLE, useValue: 'relay' },
        CatRepository,
        PartyTicketService,
        MongoRoomStore,
        MmService,
        PartyRelayService,
        RelayStatsReporter,
    ],
})
export class RelayModule {}
