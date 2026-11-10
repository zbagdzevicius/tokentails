import { INestApplication } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import { createServer, type Server } from 'http';
import * as dotenv from 'dotenv';
import { corsOrigins } from './shared/cors-origins';
import { loadDevShelterKey } from './shelter/onchain/shelter-dev-key';
import { applyTrustProxy } from './shared/trust-proxy';
import { AppValidationPipe } from './user/dto/live-game.dto';
import { applyBodyParsers } from './user/heist/live-body-limit';
import { backendRole, checkProductionEnv } from './shared/runtime/backend-role';
import { rootModuleFor } from './shared/runtime/root-module';
dotenv.config();

function initializeCors(app: INestApplication): void {
    const corsOptions: CorsOptions = {
        origin: corsOrigins(),
        credentials: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        exposedHeaders: [
            'Accept',
            'authorization',
            'Content-Type',
            'If-None-Match',
            'SourceType',
            'content-disposition',
            // Read by the client to retry a throttled POST /user/catbassadors/live.
            'Retry-After',
            // x402 receipt on GET /shelter/agent/cat-card, read by shelter-rail's payAndFetch.
            'X-PAYMENT-RESPONSE',
            // x402 v2 headers (the 402 challenge and the receipt).
            'PAYMENT-REQUIRED',
            'PAYMENT-RESPONSE',
        ],
    };

    app.enableCors(corsOptions);
}

async function bootstrap() {
    // Dev only (never NODE_ENV=production): the hot wallet key from the local Foundry keystore when
    // SHELTER_DONATE_PRIVATE_KEY is unset, before any service reads the shelter config.
    await loadDevShelterKey();
    // BACKEND_ROLE (all | api | relay, src/shared/runtime/backend-role.ts) picks the root module.
    const role = backendRole();
    checkProductionEnv(role);
    const app = await NestFactory.create(await rootModuleFor(role), { rawBody: true });
    initializeCors(app);
    applyTrustProxy(app);

    // Raw body for the Stripe webhook, a 64 KB limit for POST /user/catbassadors/live (plan F6), then
    // the global 50 MB JSON parser (a known issue, unchanged), in that order.
    applyBodyParsers(app);

    // No global `whitelist`: most @Body() types are undecorated Mongoose schema classes (User, Blessing,
    // Article, Category, Quest, Shelter, Ticket), which `whitelist` would strip to `{}`, and interface or
    // inline types are not validated at all. Routes with a decorated DTO add a strict pipe of their own,
    // for example `profileWritePipe` in src/user/dto/profile-write.dto.ts. `AppValidationPipe` is the
    // plain ValidationPipe except that it leaves `LiveGameDto` to `liveGamePipe`, so a bad Heist log
    // gets its F5.6 code (HEIST_SIM_VERSION, HEIST_REPLAY_INVALID) instead of a generic 400.
    app.useGlobalPipes(new AppValidationPipe({ transform: true }));
    // SIGTERM runs the shutdown hooks: the party relay hands its rooms off (MULTIPLAYER.md section 3.6) before Nest
    // closes the HTTP server, so open sockets get 1012 and the handoff checkpoint reaches Mongo.
    app.enableShutdownHooks();
    await app.init();
    // Live-match deploys (docs/plans/moba/LIVE-MATCH-DEPLOYS.md §8.2): on Linux the port is opened with SO_REUSEPORT,
    // so the relay VM can start the new slot next to the draining one on the same port (Node 22.12+; older Node and
    // other platforms ignore it). Nothing else changes: one process per port everywhere else.
    const server = app.getHttpServer() as Server;
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(
            { port: Number(process.env.PORT || 3005), ...(process.platform === 'linux' ? { reusePort: true } : {}) },
            () => {
                server.off('error', reject);
                resolve();
            }
        );
    });
    // The relay VM's per-slot control port (RELAY_CONTROL_PORT): /healthz, /readyz and POST /pawlegends/relay/drain of
    // this one process, on loopback, while two slots share the public port.
    const control = Number(process.env.RELAY_CONTROL_PORT || 0);
    if (Number.isInteger(control) && control > 0 && control < 65536) {
        createServer(app.getHttpAdapter().getInstance()).listen(control, '127.0.0.1').unref();
    }
}
bootstrap();
