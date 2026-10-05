import { INestApplication } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { NestFactory } from '@nestjs/core';
import * as dotenv from 'dotenv';
import { AppModule } from './app.module';
import { loadDevShelterKey } from './shelter/onchain/shelter-dev-key';
import { applyTrustProxy } from './shared/trust-proxy';
import { AppValidationPipe } from './user/dto/live-game.dto';
import { applyBodyParsers } from './user/heist/live-body-limit';
import { warnIfProxyUntrusted } from './user/heist/proxy-warning';
dotenv.config();

function initializeCors(app: INestApplication): void {
    const corsOptions: CorsOptions = {
        origin: [
            'http://localhost',
            'capacitor://localhost',
            'http://localhost:3000',
            'http://localhost:3001',
            'https://cats.tokentails.com',
            'https://test.tokentails.com',
            'https://tokentails.com',
            ...(process.env.FRONT_END_URLS?.split(',') || ['*']),
        ],
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
        ],
    };

    app.enableCors(corsOptions);
}

async function bootstrap() {
    // Dev only (never NODE_ENV=production): the hot wallet key from the local Foundry keystore when
    // SHELTER_DONATE_PRIVATE_KEY is unset, before any service reads the shelter config.
    await loadDevShelterKey();
    const app = await NestFactory.create(AppModule, { rawBody: true });
    initializeCors(app);
    applyTrustProxy(app);
    warnIfProxyUntrusted();

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
    await app.listen(process.env.PORT || 3005);
    // await app.listen(process.env.PORT || 3005, '0.0.0.0');
}
bootstrap();
