import {
    ArgumentsHost,
    Body,
    CallHandler,
    Catch,
    Controller,
    ExecutionContext,
    Get,
    Header,
    Injectable,
    NestInterceptor,
    Param,
    PayloadTooLargeException,
    Post,
    Query,
    Req,
    Res,
    UploadedFile,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import {
    clientIpBucket,
    ClientIpThrottleOptions,
    ClientIpThrottlerGuard,
} from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { RAVE_AD_ERRORS } from './rave-ads.errors';
import { RAVE_AD_IMAGE_MAX_BYTES } from './rave-ads.image';
import { RaveAdCheckoutBody, RaveAdsService } from './rave-ads.service';

/*
 * Moon Rave ad space (cat-rave/src/ads). Guest routes, no login, a per-client-IP limit like the rave
 * checkout. Checkout answers 503 while neither the card nor the crypto (USDC on Arc) tab is open (GET
 * /rave/ads/status then says `enabled: false` with a reason), and for a closed tab; GET /rave/ads stays
 * readable so live ads keep showing. Card payments arrive through the rave webhook (POST
 * /rave/stripe/webhook, optional) or the Events API pull; USDC payments through POST /rave/ads/:adId/usdc-tx.
 * Approve / reject (with a Stripe refund, or a USDC refund flagged for doing by hand) need ADMIN (5).
 */

const MINUTE = 60_000;
export const RAVE_AD_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    status: { limit: 60, ttl: MINUTE },
    list: { limit: 60, ttl: MINUTE },
    checkout: { limit: 6, ttl: 10 * MINUTE },
    ad: { limit: 30, ttl: MINUTE },
    usdcTx: { limit: 10, ttl: 10 * MINUTE },
};

export const RAVE_AD_MULTER = {
    limits: { fileSize: RAVE_AD_IMAGE_MAX_BYTES, files: 1, fields: 10, fieldSize: 1024, parts: 12 },
};

/**
 * Readiness check and per-IP limit of POST /rave/ads/checkout, as the FIRST interceptor (before FileInterceptor),
 * so a closed or throttled request is refused before multer reads up to 2 MB into memory. An interceptor,
 * not a guard: every guarded route must start with AppAuthGuard (guard-migration.spec.ts), and this
 * route is a guest route.
 */
@Injectable()
export class RaveAdCheckoutGate implements NestInterceptor {
    constructor(private readonly ads: RaveAdsService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    async intercept(context: ExecutionContext, next: CallHandler) {
        const http = context.switchToHttp();
        this.ads.assertOpen();
        await this.ipThrottler.consume(
            'RaveAdsController.checkout',
            http.getRequest(),
            RAVE_AD_THROTTLES.checkout,
            http.getResponse()
        );
        return next.handle();
    }
}

/** Multer's size and count errors on the ad upload → `RAVE_AD_IMAGE`; everything else passes through. */
@Catch()
export class RaveAdUploadFilter extends BaseExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const code = (exception as { code?: unknown })?.code;
        if (exception instanceof PayloadTooLargeException || code === 'LIMIT_FILE_SIZE') {
            return super.catch(RAVE_AD_ERRORS.image('IMAGE_TOO_LARGE'), host);
        }
        if (typeof code === 'string' && code.startsWith('LIMIT_')) {
            return super.catch(RAVE_AD_ERRORS.invalid('Unexpected form fields'), host);
        }
        return super.catch(exception, host);
    }
}

@Controller('rave/ads')
@SkipThrottle()
export class RaveAdsController {
    constructor(private readonly ads: RaveAdsService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    private throttle(name: keyof typeof RAVE_AD_THROTTLES, req: any, res?: any) {
        return this.ipThrottler.consume(`RaveAdsController.${name}`, req, RAVE_AD_THROTTLES[name], res);
    }

    @Header('Cache-Control', 'no-store')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('status', req, res);
        return this.ads.status();
    }

    @Header('Cache-Control', 'public, max-age=15')
    @Get()
    async list(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('list', req, res);
        return this.ads.listPublic();
    }

    @UseFilters(RaveAdUploadFilter)
    @UseInterceptors(RaveAdCheckoutGate, FileInterceptor('image', RAVE_AD_MULTER))
    @Post('checkout')
    async checkout(
        @Body() body: RaveAdCheckoutBody,
        @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
        @Req() req: any
    ) {
        // Readiness and per-IP limit: RaveAdCheckoutGate (first interceptor), before the upload is read.
        return this.ads.checkout(body || {}, file, new Date(), clientIpBucket(req));
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Header('Cache-Control', 'no-store')
    @Get('admin/list')
    async adminList(@Query('status') status: string) {
        return this.ads.adminList(status);
    }

    /** The private image of a paid ad, for review (it is not on the public CDN before approval). */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/:adId/image')
    async adminImage(@Param('adId') adId: string, @Res() res: any) {
        const data = await this.ads.adminImage(adId);
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(data);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post(':adId/approve')
    async approve(@Param('adId') adId: string, @Req() req: any) {
        return this.ads.approve(adId, req.user?._id ? String(req.user._id) : undefined);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Post(':adId/reject')
    async reject(@Param('adId') adId: string, @Body() body: { reason?: unknown }, @Req() req: any) {
        return this.ads.reject(adId, body?.reason, req.user?._id ? String(req.user._id) : undefined);
    }

    /** The buyer's wallet paid a USDC ad: record the tx and read its receipt (works while crypto reports closed). */
    @Post(':adId/usdc-tx')
    async usdcTx(
        @Param('adId') adId: string,
        @Body() body: { txHash?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.throttle('usdcTx', req, res);
        return this.ads.reportUsdcTx(adId, body || {});
    }

    @Header('Cache-Control', 'no-store')
    @Get(':adId')
    async ad(@Param('adId') adId: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.throttle('ad', req, res);
        return this.ads.getAd(adId);
    }
}
