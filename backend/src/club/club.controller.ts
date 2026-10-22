import {
    Body,
    Controller,
    Get,
    Header,
    Headers,
    HttpCode,
    Param,
    Post,
    Query,
    RawBodyRequest,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { CLUB_RETURN_URL, CLUB_THROTTLES } from './club.config';
import { ClubCheckoutBody, ClubService } from './club.service';
import { ClubWebhookService } from './club-webhook.service';

/*
 * Tails Club (docs/BACKEND.md "Tails Club", docs/API.md). The landing's club card pays in place: no login,
 * so public routes carry no auth guard. They skip the global throttler and count a per-client-IP limit
 * (CLUB_THROTTLES) instead, like /rave. Checkout answers 503 CLUB_OFF until every required env is set and
 * both prices read from Stripe. GET /club/me sits behind AppAuthGuard (guests denied). No route here writes a
 * game score.
 */

@Controller('club')
@SkipThrottle()
export class ClubController {
    constructor(
        private readonly club: ClubService,
        private readonly webhooks: ClubWebhookService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    private throttle(name: keyof typeof CLUB_THROTTLES, req: any, res?: any) {
        return this.ipThrottler.consume(`ClubController.${name}`, req, CLUB_THROTTLES[name], res);
    }

    @Header('Cache-Control', 'public, max-age=60')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('status', req, res);
        return this.club.status();
    }

    @Post('checkout')
    async checkout(
        @Body() body: ClubCheckoutBody,
        @Headers('accesstoken') accesstoken: string | undefined,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        // Closed costs nothing: the readiness check comes before the per-IP limit.
        await this.club.assertOpen();
        await this.throttle('checkout', req, res);
        const userId = await this.club.optionalUserId(accesstoken);
        return this.club.checkout(body, userId);
    }

    @Header('Cache-Control', 'no-store')
    @Get('subscriptions/:id')
    async subscription(
        @Param('id') id: string,
        @Query('k') k: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.throttle('subscription', req, res);
        return this.club.getSubscription(id, k);
    }

    /** `{manageToken}` → `{url}` (200); `{email}` → `{sent:true}` (202) whether or not the email is a member. */
    @Header('Cache-Control', 'no-store')
    @Post('portal')
    async portal(
        @Body() body: { manageToken?: unknown; email?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.throttle('portal', req, res);
        const out = await this.club.portal(body || {});
        res?.status?.('url' in out ? 200 : 202);
        return out;
    }

    /** The emailed link: 303 to a fresh portal session, or back to the club card when the link expired. */
    @Get('portal/open')
    async portalOpen(@Query('t') t: string, @Req() req: any, @Res() res: any) {
        await this.throttle('portalOpen', req, res);
        const url = await this.club.openPortal(t);
        res.setHeader?.('Cache-Control', 'no-store');
        return res.redirect(303, url || CLUB_RETURN_URL.replace('/#club', '/?club_portal=expired#club'));
    }

    @Header('Cache-Control', 'private, no-store')
    @UseGuards(AppAuthGuard)
    @Get('me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('me', req, res);
        return this.club.me(req.user);
    }

    @HttpCode(200)
    @Post('stripe/webhook')
    async webhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
        const event = this.webhooks.verify(req.rawBody, signature);
        const outcome = await this.webhooks.handle(event);
        return { received: true, outcome };
    }
}
