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
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import {
    BadcatServerStatus,
    CameoBundle,
    CheckoutCompletion,
    CheckoutRequest,
    CheckoutResponse,
    EntitlementResponse,
    RedeemRequest,
    RedeemResponse,
    SeenResponse,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { BadcatFlags, badcatFlags } from './badcat-flags';
import { BadcatAccountService } from './badcat-account.service';
import { BadcatAdminService } from './badcat-admin.service';
import { BadcatCameoService } from './badcat-cameo.service';
import { BadcatStripeService } from './badcat-stripe.service';
import { BadcatWebhookService } from './badcat-webhook.service';

/*
 * Bad Cat Daily (badcat), FULL-PLAN decision 1: payments, entitlements, cameos and the typed redirect live
 * in the backend. Every route answers 404 unless BADCAT_ENABLED=true and its feature flag is on
 * (GET /badcat/status then answers all false). Public routes skip the global throttler (one site-wide
 * bucket while TRUST_PROXY is unset) and count a per-client-IP limit in the handler, like /yourcat;
 * the flag check comes first, so a switched-off route costs nothing. Admin routes need
 * AppAuthGuard + PermissionGuard(ADMIN). No route here writes a score.
 */

const MINUTE = 60_000;
/** Per client IP. */
export const BADCAT_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    status: { limit: 60, ttl: MINUTE },
    checkout: { limit: 5, ttl: MINUTE },
    entitlement: { limit: 30, ttl: MINUTE },
    restore: { limit: 3, ttl: 10 * MINUTE },
    restoreVerify: { limit: 10, ttl: MINUTE },
    portal: { limit: 5, ttl: MINUTE },
    redeem: { limit: 5, ttl: MINUTE },
    cameos: { limit: 120, ttl: MINUTE },
    seen: { limit: 60, ttl: MINUTE },
    faceUpload: { limit: 5, ttl: MINUTE },
    faceGet: { limit: 600, ttl: MINUTE },
    clubCat: { limit: 10, ttl: MINUTE },
    creatorCode: { limit: 3, ttl: 60 * MINUTE },
    typed: { limit: 60, ttl: MINUTE },
};

const intParam = (value: unknown): number =>
    typeof value === 'string' && /^-?\d{1,7}$/.test(value) ? Number(value) : NaN;

@Controller('badcat')
@SkipThrottle()
export class BadcatController {
    constructor(
        private readonly stripe: BadcatStripeService,
        private readonly webhooks: BadcatWebhookService,
        private readonly account: BadcatAccountService,
        private readonly cameos: BadcatCameoService,
        private readonly admin: BadcatAdminService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    /** 404 unless the master switch and `feature` are on, then the per-IP limit. */
    private async gate(
        feature: keyof BadcatFlags,
        throttle: keyof typeof BADCAT_THROTTLES | null,
        req: any,
        res?: any
    ): Promise<void> {
        const flags = badcatFlags();
        if (!flags.enabled || !flags[feature]) throw BADCAT_ERRORS.notFound();
        if (throttle) {
            await this.ipThrottler.consume(`BadcatController.${throttle}`, req, BADCAT_THROTTLES[throttle], res);
        }
    }

    @Header('Cache-Control', 'public, max-age=30')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<BadcatServerStatus> {
        if (badcatFlags().enabled) {
            await this.ipThrottler.consume('BadcatController.status', req, BADCAT_THROTTLES.status, res);
        }
        return this.admin.status();
    }

    @Post('checkout')
    async checkout(
        @Body() body: CheckoutRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CheckoutResponse> {
        await this.gate('checkout', 'checkout', req, res);
        return this.stripe.createCheckout(body);
    }

    @HttpCode(200)
    @Post('stripe/webhook')
    async webhook(
        @Req() req: RawBodyRequest<any>,
        @Headers('stripe-signature') signature: string
    ): Promise<{ received: boolean; outcome: string }> {
        // Its own gate: only the webhook secret (503 without it) and the signature (400). Pausing checkout, or
        // all of Bad Cat, must not drop cancellations, refunds and renewals: Stripe stops retrying after ~3 days.
        const event = this.webhooks.verify(req.rawBody, signature);
        const outcome = await this.webhooks.handle(event);
        return { received: true, outcome };
    }

    /** `{ sessionId }` → CheckoutCompletion (thanks page); `{ token }` → a refreshed EntitlementResponse. */
    @HttpCode(200)
    @Post('entitlement')
    async entitlement(
        @Body() body: { sessionId?: string; token?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CheckoutCompletion | EntitlementResponse> {
        await this.gate('checkout', 'entitlement', req, res);
        if (body?.sessionId !== undefined) return this.account.complete(body.sessionId, process.env, body.token);
        if (body?.token !== undefined) return this.account.refresh(body.token);
        throw BADCAT_ERRORS.invalid('sessionId or token is required');
    }

    @HttpCode(200)
    @Post('restore')
    async restore(
        @Body() body: { email?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; devLink?: string }> {
        await this.gate('checkout', 'restore', req, res);
        return this.account.restore(body?.email);
    }

    @HttpCode(200)
    @Post('restore/verify')
    async restoreVerify(
        @Body() body: { t?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<EntitlementResponse> {
        await this.gate('checkout', 'restoreVerify', req, res);
        return this.account.verifyRestore(body?.t);
    }

    @HttpCode(200)
    @Post('portal')
    async portal(
        @Body() body: { token?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ url: string }> {
        await this.gate('checkout', 'portal', req, res);
        return this.account.portal(body?.token);
    }

    @HttpCode(200)
    @Post('redeem')
    async redeem(
        @Body() body: RedeemRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<RedeemResponse> {
        await this.gate('checkout', null, req);
        await this.gate('gifts', 'redeem', req, res);
        return this.account.redeem(body);
    }

    @HttpCode(200)
    @Post('club/cat')
    async clubCat(
        @Body() body: { token?: string; catCode?: string; name?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean }> {
        await this.gate('checkout', 'clubCat', req, res);
        return this.account.setClubCat(body?.token, body?.catCode, body?.name);
    }

    /** Never cached: every request is one room load on the shuffle's counter. */
    @Header('Cache-Control', 'no-store')
    @Get('cameos')
    async cameoBundle(
        @Query('day') day: string,
        @Query('s') s: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CameoBundle> {
        await this.gate('cameos', 'cameos', req, res);
        return this.cameos.bundle(intParam(day), intParam(s));
    }

    @Header('Cache-Control', 'private, max-age=300')
    @Get('seen')
    async seen(
        @Query('cat') cat: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<SeenResponse> {
        await this.gate('cameos', 'seen', req, res);
        return this.cameos.seen(cat);
    }

    @HttpCode(200)
    @Post('face/:cameoId')
    async uploadFace(
        @Param('cameoId') cameoId: string,
        @Body() body: { token?: string; png?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; status: 'pending' }> {
        await this.gate('faceUploads', 'faceUpload', req, res);
        return this.cameos.uploadFace(cameoId, body?.token, body?.png);
    }

    /** `/badcat/face/<id>.png`: approved faces only. */
    @Get('face/:file')
    async face(@Param('file') file: string, @Req() req: any, @Res() res: any): Promise<void> {
        await this.gate('enabled', 'faceGet', req, res);
        const match = /^([0-9a-f]{24})\.png$/.exec(file || '');
        const png = match ? await this.cameos.facePng(match[1]) : null;
        if (!png) throw BADCAT_ERRORS.notFound();
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(png);
    }

    @HttpCode(200)
    @Post('creator-code')
    async creatorCode(
        @Body() body: { code?: string; email?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; status: 'pending' }> {
        await this.gate('creatorCodes', 'creatorCode', req, res);
        return this.admin.requestCreatorCode(body?.code, body?.email);
    }

    /** The short domain lands here: 302 to /badcat/pick?e=t and one typed arrival counted (no personal data). */
    @Get('t')
    async typed(@Req() req: any, @Res() res: any): Promise<void> {
        await this.gate('typedRedirect', 'typed', req, res);
        res.set('Cache-Control', 'no-store');
        res.redirect(302, await this.admin.typedArrival());
    }

    // ---------------------------------------------------------------------------------------------
    // Admin (PermissionGuard(ADMIN)); 404 while BADCAT_ENABLED is off
    // ---------------------------------------------------------------------------------------------

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/faces')
    async adminFaces(@Req() req: any) {
        await this.gate('enabled', null, req);
        return { items: await this.cameos.pendingFaces() };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @HttpCode(200)
    @Post('admin/faces/:id/approve')
    async approveFace(@Param('id') id: string, @Req() req: any) {
        await this.gate('enabled', null, req);
        return this.cameos.reviewFace(id, 'approve');
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @HttpCode(200)
    @Post('admin/faces/:id/reject')
    async rejectFace(@Param('id') id: string, @Req() req: any) {
        await this.gate('enabled', null, req);
        return this.cameos.reviewFace(id, 'reject');
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post('admin/cameo')
    async adminCameo(
        @Body() body: { catCode?: string; name?: string; dayNo?: number; kind?: string },
        @Req() req: any
    ) {
        await this.gate('enabled', null, req);
        return this.cameos.grant(body);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/stats')
    async adminStats(@Query('days') days: string, @Req() req: any) {
        await this.gate('enabled', null, req);
        return this.admin.stats(intParam(days) || 30);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/creator-codes')
    async adminCreatorCodes(@Req() req: any) {
        await this.gate('enabled', null, req);
        return { items: await this.admin.listCreatorCodes() };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/creator-codes/report')
    async adminCreatorReport(@Req() req: any) {
        await this.gate('enabled', null, req);
        return { items: await this.admin.creatorReport() };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @HttpCode(200)
    @Post('admin/creator-codes/:code/approve')
    async approveCreatorCode(@Param('code') code: string, @Req() req: any) {
        await this.gate('enabled', null, req);
        return this.admin.reviewCreatorCode(code, 'approve');
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @HttpCode(200)
    @Post('admin/creator-codes/:code/reject')
    async rejectCreatorCode(@Param('code') code: string, @Req() req: any) {
        await this.gate('enabled', null, req);
        return this.admin.reviewCreatorCode(code, 'reject');
    }
}
