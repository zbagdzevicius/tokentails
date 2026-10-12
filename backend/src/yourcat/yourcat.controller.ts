import {
    Body,
    CanActivate,
    Controller,
    Delete,
    Get,
    Header,
    Injectable,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UploadedFile,
    UseFilters,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, ThrottlerException } from '@nestjs/throttler';
import { AiBudgetDayView, AiBudgetService, utcDay } from 'src/ai-budget/ai-budget.service';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottle, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PhotoUploadExceptionFilter } from 'src/shared/photo-upload.filter';
import { PHOTO_MULTER_OPTIONS } from 'src/shared/utils/photo-upload';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import {
    YourcatCheckoutView,
    YourcatDeleteView,
    YourcatPublicView,
    YourcatStatusView,
    YourcatView,
} from './yourcat.contracts';
import { YOURCAT_ERRORS } from './yourcat.errors';
import { IUploadBody, yourcatEnabled, YourcatService } from './yourcat.service';

/*
 * Bet #3 `/yourcat` (docs/plans/yourcat-v2.md section 2.2). Guests may call every route except the
 * stats (each route is in GUEST_ALLOW_LIST); `status` and `public/:shareId` are public (no guard list).
 * The global throttler is skipped (its bucket is site-wide while TRUST_PROXY is unset); each route has a
 * per-user and a per-client-IP burst limit instead, and the paid AI work is capped per day by
 * `AiUploadGate`.
 *
 * The literal routes (`status`, `public/:shareId`, `me`, `stats`, `manual`) are declared before the `:id`
 * routes, so Express never reads them as an id.
 */

/**
 * Paid-delivery counters every `GET /yourcat/stats` day carries, 0 when nothing was counted, so a failed
 * portrait email (KI-11) shows as a column even on a day without one.
 */
export const STATS_ALWAYS_COUNTERS = ['portraitsDelivered', 'portraitsDeliveryFailed', 'portraitsEmailFailed'] as const;

export const withStatsDefaults = (counts: AiBudgetDayView['counts'] | undefined): AiBudgetDayView['counts'] => ({
    ...Object.fromEntries(STATS_ALWAYS_COUNTERS.map(counter => [counter, 0])),
    ...(counts || {}),
});

/** Per minute: per client IP, per user. */
export const YOURCAT_THROTTLES = {
    status: { ip: { limit: 30, ttl: 60000 } },
    public: { ip: { limit: 60, ttl: 60000 } },
    upload: { ip: { limit: 10, ttl: 60000 }, user: { limit: 5, ttl: 60000 } },
    manual: { ip: { limit: 10, ttl: 60000 }, user: { limit: 5, ttl: 60000 } },
    me: { ip: { limit: 60, ttl: 60000 }, user: { limit: 30, ttl: 60000 } },
    get: { ip: { limit: 120, ttl: 60000 }, user: { limit: 60, ttl: 60000 } },
    rename: { ip: { limit: 20, ttl: 60000 }, user: { limit: 10, ttl: 60000 } },
    remove: { ip: { limit: 10, ttl: 60000 }, user: { limit: 10, ttl: 60000 } },
    // Stripe spam: 5 a minute per address and per user (in memory, like every burst limit), and 10
    // checkouts a day per user, counted in MongoDB (`AiBudgetService.claimQuota`), so a restart or a
    // second replica does not reset it (KI-15).
    checkout: {
        ip: { limit: 5, ttl: 60000 },
        user: { limit: 5, ttl: 60000 },
        userDaily: 10,
    },
} as const;

/** The per-user daily portrait checkout counter (an `aiquotas` document, removed 48 h after its day). */
export const portraitCheckoutQuotaId = (userId: string, day: string) => `portrait-checkout:user:${userId}:${day}`;

/** Seconds until the next UTC midnight, when the daily counter starts again. */
export const secondsToUtcMidnight = (now: Date) => {
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
};

/** The kill switch, checked before multer reads the file (section 2.3 step 1). */
@Injectable()
export class YourcatEnabledGuard implements CanActivate {
    canActivate(): boolean {
        if (!yourcatEnabled()) {
            throw YOURCAT_ERRORS.disabled();
        }
        return true;
    }
}

@Controller('yourcat')
@SkipThrottle()
export class YourcatController {
    constructor(
        private readonly service: YourcatService,
        private readonly budget: AiBudgetService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    /** The per-user daily checkout limit, in MongoDB. 429 with Retry-After (to UTC midnight) above it. */
    async claimDailyCheckout(user: IAuthUser, res?: any): Promise<void> {
        const now = this.budget.now();
        const day = utcDay(now);
        const claimed = await this.budget.claimQuota(
            portraitCheckoutQuotaId(String(user?._id), day),
            YOURCAT_THROTTLES.checkout.userDaily,
            day
        );
        if (!claimed) {
            res?.header?.('Retry-After', secondsToUtcMidnight(now));
            throw new ThrottlerException();
        }
    }

    /**
     * Public. Its per-IP limit is applied in the handler: a guard list must start with AppAuthGuard
     * (guard-migration.spec.ts), and this route has no caller.
     */
    @Header('Cache-Control', 'public, max-age=30')
    @Get('status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<YourcatStatusView> {
        await this.ipThrottler.consume('YourcatController.status', req, YOURCAT_THROTTLES.status.ip, res);
        return this.service.status();
    }

    /**
     * The friend link `/yourcat?cat=<shareId>` (docs/plans/yourcat-polish.md section 8). Public, like
     * `status`: its per-IP limit is applied in the handler. The id is checked against
     * `^[A-Za-z0-9_-]{12}$` before any query; anything else, or no match, is 404 `YOURCAT_NOT_FOUND`.
     * Works with the kill switch off: a link already shared keeps showing the cat. `Cache-Control:
     * public, max-age=60` is set on a found cat only, so a shared cache never keeps a 404 or a 429.
     */
    @Get('public/:shareId')
    async publicCat(
        @Param('shareId') shareId: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<YourcatPublicView> {
        await this.ipThrottler.consume('YourcatController.publicCat', req, YOURCAT_THROTTLES.public.ip, res);
        const view = await this.service.publicView(shareId);
        res?.header?.('Cache-Control', 'public, max-age=60');
        return view;
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest({ transient: true })
    @UserThrottle(YOURCAT_THROTTLES.me.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.me.ip)
    @Get('me')
    async me(@AUTH_USER() user: IAuthUser): Promise<{ item: YourcatView | null }> {
        return this.service.latest(user);
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @SkipThrottle({ default: false })
    @Get('stats')
    async stats(@Query('days') days?: string): Promise<{ days: AiBudgetDayView[] }> {
        const rows = await this.budget.stats(Number(days) || 14);
        return { days: rows.map(row => ({ ...row, counts: withStatsDefaults(row.counts) })) };
    }

    @UseGuards(AppAuthGuard, YourcatEnabledGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.manual.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.manual.ip)
    @Post('manual')
    async manual(
        @AUTH_USER() user: IAuthUser,
        @Body() body: { family?: unknown; name?: unknown }
    ): Promise<YourcatView> {
        return this.service.createManual(user, body || {});
    }

    @UseGuards(AppAuthGuard, YourcatEnabledGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.upload.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.upload.ip)
    @UseFilters(PhotoUploadExceptionFilter)
    @UseInterceptors(FileInterceptor('file', PHOTO_MULTER_OPTIONS))
    @Post()
    async upload(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @UploadedFile() file: { buffer?: Buffer } | undefined,
        @Body() body: IUploadBody
    ): Promise<YourcatView> {
        return this.service.uploadPhoto(user, req, file, body || {});
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.get.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.get.ip)
    @Get(':id')
    async findOne(@AUTH_USER() user: IAuthUser, @Param('id') id: string): Promise<YourcatView> {
        return this.service.get(user, id);
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.rename.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.rename.ip)
    @Patch(':id')
    async rename(
        @AUTH_USER() user: IAuthUser,
        @Param('id') id: string,
        @Body() body: { name?: unknown }
    ): Promise<YourcatView> {
        return this.service.rename(user, id, body?.name);
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.remove.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.remove.ip)
    @Delete(':id')
    async remove(@AUTH_USER() user: IAuthUser, @Param('id') id: string): Promise<YourcatDeleteView> {
        return this.service.remove(user, id);
    }

    @UseGuards(AppAuthGuard, UserThrottlerGuard, ClientIpThrottlerGuard)
    @AllowGuest()
    @UserThrottle(YOURCAT_THROTTLES.checkout.user)
    @ClientIpThrottle(YOURCAT_THROTTLES.checkout.ip)
    @Post(':id/portrait-checkout')
    async portraitCheckout(
        @AUTH_USER() user: IAuthUser,
        @Param('id') id: string,
        @Body() body: { style?: unknown },
        @Res({ passthrough: true }) res: any
    ): Promise<YourcatCheckoutView> {
        await this.claimDailyCheckout(user, res);
        return this.service.portraitCheckout(user, id, body?.style);
    }
}
