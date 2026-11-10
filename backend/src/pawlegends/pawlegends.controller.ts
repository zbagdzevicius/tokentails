import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Inject,
    Optional,
    Post,
    Query,
    RawBodyRequest,
    Req,
    Res,
    ServiceUnavailableException,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import {
    FOUNDER_LEGEND_CAP,
    PAWLEGENDS_SKU_IDS,
    PAWLEGENDS_SKUS,
    PAWLEGENDS_TERMS_VERSION,
    PawlegendsCheckoutRequest,
    PawlegendsCheckoutResponse,
    PawlegendsEntitlementResponse,
    PawlegendsOfferResponse,
} from './pawlegends.contracts';
import { PawlegendsAccountService } from './pawlegends-account.service';
import { pawlegendsCheckoutReady, pawlegendsEmailReady } from './pawlegends-env';
import { PAWLEGENDS_SIM_INFO } from './pawlegends-sim-info';
import { PAWLEGENDS_CAT_SALE, PawlegendsCatSale, PawlegendsOfferService } from './pawlegends-offer.service';
import { championCards } from './pawlegends-champions';
import { CatRepository } from 'src/cat/cat.repository';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { accountIdOf } from './pawlegends-account-id';
import { PawlegendsStripeService } from './pawlegends-stripe.service';
import { PawlegendsWebhookService } from './pawlegends-webhook.service';
import { PartyTicketService } from './party/party-ticket.service';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { PawlegendsSeasonService } from './pawlegends-season.service';
import { CATALOG_SKUS, CURRENT_SEASON_ID, SEASONS, STORE_TERMS_VERSION } from './pawlegends-catalog';

/*
 * Pawlegends store routes (POC.md §8.3). Every route is always on; a route whose secret is missing answers 503 and
 * `GET /pawlegends/status` reports the store not ready (the host hides the store button, the game still plays).
 * Public routes skip the global throttler and count a per-client-IP limit in the handler, like /badcat. No route
 * here writes a score: matches save through `POST /user/catbassadors/live` (`pawlegends-live.ts`).
 *
 * Checkout's optional `accesstoken` (§8.3) is a twin route: `POST /pawlegends/checkout/account` behind AppAuthGuard
 * (registered accounts; guests get 403 and the host retries the plain route) adds the user id as a key of the
 * spend cap and the once-only SKUs, next to the email (required) and the device id (§8.5).
 */

const MINUTE = 60_000;
/** Per client IP. */
export const PAWLEGENDS_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    status: { limit: 60, ttl: MINUTE },
    checkout: { limit: 5, ttl: MINUTE },
    entitlements: { limit: 30, ttl: MINUTE },
    restore: { limit: 3, ttl: 10 * MINUTE },
    restoreVerify: { limit: 10, ttl: MINUTE },
    offer: { limit: 60, ttl: MINUTE },
    offerSeen: { limit: 30, ttl: MINUTE },
    founders: { limit: 60, ttl: MINUTE },
    champions: { limit: 60, ttl: MINUTE },
    notify: { limit: 3, ttl: 10 * MINUTE },
    notifyConfirm: { limit: 10, ttl: MINUTE },
    // Party play (MULTIPLAYER.md §5.2): 30 tickets per 10 minutes per client IP.
    partyTicket: { limit: 30, ttl: 10 * MINUTE },
    // Store and Legends Pass (STORE-PASS.md)
    me: { limit: 60, ttl: MINUTE },
    passClaim: { limit: 30, ttl: MINUTE },
};

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsController {
    constructor(
        private readonly stripe: PawlegendsStripeService,
        private readonly webhooks: PawlegendsWebhookService,
        private readonly account: PawlegendsAccountService,
        private readonly offers: PawlegendsOfferService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        // Sim v9 champions: the catalog cats and the direct-purchase check (both already providers in AppModule).
        @Optional() private readonly cats?: CatRepository,
        @Optional() @Inject(PAWLEGENDS_CAT_SALE) private readonly catSale?: PawlegendsCatSale,
        // Party play tickets (MULTIPLAYER.md §5.2).
        @Optional() private readonly partyTickets?: PartyTicketService,
        // Store ownership and the Legends Pass (STORE-PASS.md).
        @Optional() private readonly season?: PawlegendsSeasonService
    ) {}

    private seasonService(): PawlegendsSeasonService {
        if (!this.season) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'PAWLEGENDS_PASS_UNAVAILABLE',
                message: 'The Legends Pass is not configured',
            });
        }
        return this.season;
    }

    /**
     * Owned store items and the current Legends Pass row (STORE-PASS.md §3 step 5). Guests too: they earn Season XP
     * through their `/live` saves and can claim the free row (the premium row needs a registered account).
     */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('me', req, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient) return { items: [], season: null };
        return this.seasonService().me(String(id));
    }

    /** Claim one pass reward `{seasonId, row: 'f' | 'p', tier}` or all `{all: true}`. Idempotent. */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('pass/claim')
    async passClaim(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('passClaim', req, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'PAWLEGENDS_PASS_UNAVAILABLE',
                message: 'No account',
            });
        }
        return this.seasonService().claim(String(id), body || {});
    }

    /**
     * Party play ticket (MULTIPLAYER.md §5.2): a 60 s single-use HMAC token naming the caller (a registered account or
     * a guest) for the relay's `hello`. 503 PAWLEGENDS_PARTY_TICKET_UNAVAILABLE without PAWLEGENDS_PARTY_TICKET_SECRET
     * (rooms are then unscored; nothing else is disabled).
     */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('party/ticket')
    async partyTicket(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('partyTicket', req, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!this.partyTickets || !id) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                code: 'PAWLEGENDS_PARTY_TICKET_UNAVAILABLE',
                message: 'Party tickets are not configured',
            });
        }
        const guest = !!req.user.isGuest;
        return this.partyTickets.issue({ accountId: String(id), guest });
    }

    private async throttle(name: keyof typeof PAWLEGENDS_THROTTLES, req: any, res?: any): Promise<void> {
        await this.ipThrottler.consume(`PawlegendsController.${name}`, req, PAWLEGENDS_THROTTLES[name], res);
    }

    /** Store readiness and the SKU table (display prices; the server price always wins). */
    @Header('Cache-Control', 'public, max-age=30')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('status', req, res);
        return {
            store: pawlegendsCheckoutReady(),
            email: pawlegendsEmailReady(),
            termsVersion: PAWLEGENDS_TERMS_VERSION,
            storeTermsVersion: STORE_TERMS_VERSION,
            skus: PAWLEGENDS_SKU_IDS.map(sku => {
                const def = PAWLEGENDS_SKUS[sku];
                return {
                    sku,
                    label: def.label,
                    cents: def.cents,
                    deliveredNow: def.deliveredNow,
                    deliveredAtMvp: def.deliveredAtMvp,
                    ...(def.retired ? { retired: true } : {}),
                    ...(def.kind ? { kind: def.kind, items: def.items } : {}),
                    ...(def.bundleOf ? { bundleOf: def.bundleOf } : {}),
                    ...(def.requires ? { requires: def.requires } : {}),
                };
            }),
            catalog: CATALOG_SKUS.map(def => def.sku),
            season: (() => {
                const s = SEASONS.find(x => x.id === CURRENT_SEASON_ID)!;
                return { id: s.id, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt };
            })(),
        };
    }

    /** Which sim `/live` replays with (`npm run vendor-sim:check-remote` in pawlegends/). */
    @Header('Cache-Control', 'public, max-age=60')
    @Get('sim')
    sim() {
        return PAWLEGENDS_SIM_INFO;
    }

    @Post('checkout')
    async checkout(
        @Body() body: PawlegendsCheckoutRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<PawlegendsCheckoutResponse> {
        await this.throttle('checkout', req, res);
        return this.stripe.createCheckout(body);
    }

    /** The same checkout with a Token Tails session: the account id is a spend-cap and once-only key too. */
    @UseGuards(AppAuthGuard)
    @Post('checkout/account')
    async checkoutAccount(
        @Body() body: PawlegendsCheckoutRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<PawlegendsCheckoutResponse> {
        await this.throttle('checkout', req, res);
        return this.stripe.createCheckout(body, process.env, accountIdOf(req));
    }

    @HttpCode(200)
    @Post('stripe/webhook')
    async webhook(
        @Req() req: RawBodyRequest<any>,
        @Headers('stripe-signature') signature: string
    ): Promise<{ received: boolean; outcome: string }> {
        // Only the webhook secret (503 without it) and the signature (400) gate it, never checkout readiness.
        const event = this.webhooks.verify(req.rawBody, signature);
        const outcome = await this.webhooks.handle(event);
        return { received: true, outcome };
    }

    /** `?sessionId=cs_…` after Checkout, or the token in `x-pawlegends-token` to refresh it. */
    @Get('entitlements')
    async entitlements(
        @Query('sessionId') sessionId: string | undefined,
        @Headers('x-pawlegends-token') token: string | undefined,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<PawlegendsEntitlementResponse> {
        await this.throttle('entitlements', req, res);
        return this.account.entitlements(token ? { token } : { sessionId });
    }

    @HttpCode(200)
    @Post('restore')
    async restore(@Body() body: { email?: string }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('restore', req, res);
        return this.account.restore(body?.email);
    }

    @HttpCode(200)
    @Post('restore/verify')
    async restoreVerify(@Body() body: { t?: string }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('restoreVerify', req, res);
        return this.account.verifyRestore(body?.t);
    }

    @Get('offer')
    async offer(
        @Query() query: Record<string, unknown>,
        @Headers('x-pawlegends-token') token: string | undefined,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<PawlegendsOfferResponse> {
        await this.throttle('offer', req, res);
        return this.offers.offer({ ...query, token });
    }

    @HttpCode(200)
    @Post('offer/seen')
    async offerSeen(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('offerSeen', req, res);
        return this.offers.seen(body);
    }

    /**
     * Sim v9: the shelter champions' Token Tails cards (storefront fields and `forSale`), cached 5 minutes. Every
     * champion is free to play: this route only feeds the cosmetics and the Meet link (`pawlegends-champions.ts`).
     */
    @Header('Cache-Control', 'public, max-age=300')
    @Get('champions')
    async champions(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('champions', req, res);
        if (!this.cats) return { cats: [] };
        return championCards(this.cats as any, this.catSale);
    }

    /** Founder Legend seats left (a number only in the POC). */
    @Header('Cache-Control', 'public, max-age=15')
    @Get('founders')
    async founders(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('founders', req, res);
        return { left: await this.stripe.legendSeatsLeft(), cap: FOUNDER_LEGEND_CAP };
    }

    @HttpCode(200)
    @Post('notify')
    async notify(
        @Body() body: { email?: string; source?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.throttle('notify', req, res);
        return this.account.notify(body?.email, body?.source);
    }

    @HttpCode(200)
    @Post('notify/confirm')
    async notifyConfirm(@Body() body: { t?: string }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('notifyConfirm', req, res);
        return this.account.confirmNotify(body?.t);
    }
}
