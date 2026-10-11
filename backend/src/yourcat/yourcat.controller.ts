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
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AiBudgetDayView, AiBudgetService } from 'src/ai-budget/ai-budget.service';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottle, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { UserThrottle, UserThrottlerGuard } from 'src/shared/guards/user-throttler.guard';
import { PhotoUploadExceptionFilter } from 'src/shared/photo-upload.filter';
import { PHOTO_MULTER_OPTIONS } from 'src/shared/utils/photo-upload';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { YourcatCheckoutView, YourcatDeleteView, YourcatStatusView, YourcatView } from './yourcat.contracts';
import { YOURCAT_ERRORS } from './yourcat.errors';
import { IUploadBody, yourcatEnabled, YourcatService } from './yourcat.service';

/*
 * Bet #3 `/yourcat` (docs/plans/yourcat-v2.md section 2.2). Guests may call every route except the
 * stats (each route is in GUEST_ALLOW_LIST). The global throttler is skipped (its bucket is site-wide
 * while TRUST_PROXY is unset); each route has a per-user and a per-client-IP burst limit instead, and the
 * paid AI work is capped per day by `AiUploadGate`.
 *
 * The literal routes (`status`, `me`, `stats`, `manual`) are declared before the `:id` routes, so Express
 * never reads them as an id.
 */

/** Per minute: per client IP, per user. */
export const YOURCAT_THROTTLES = {
    status: { ip: { limit: 30, ttl: 60000 } },
    upload: { ip: { limit: 10, ttl: 60000 }, user: { limit: 5, ttl: 60000 } },
    manual: { ip: { limit: 10, ttl: 60000 }, user: { limit: 5, ttl: 60000 } },
    me: { ip: { limit: 60, ttl: 60000 }, user: { limit: 30, ttl: 60000 } },
    get: { ip: { limit: 120, ttl: 60000 }, user: { limit: 60, ttl: 60000 } },
    rename: { ip: { limit: 20, ttl: 60000 }, user: { limit: 10, ttl: 60000 } },
    remove: { ip: { limit: 10, ttl: 60000 }, user: { limit: 10, ttl: 60000 } },
    // Stripe spam: 5 a minute per address and per user (`userBurst`, counted in the handler), and
    // 10 sessions a day per user.
    checkout: {
        ip: { limit: 5, ttl: 60000 },
        user: { limit: 10, ttl: 24 * 60 * 60 * 1000 },
        userBurst: { limit: 5, ttl: 60000 },
    },
} as const;

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
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly throttlerStorage: ThrottlerStorage
    ) {}

    /**
     * A second per-user window on one route (`@UserThrottle` holds one): the `UserThrottlerGuard` count,
     * in its own bucket. 429 above the limit.
     */
    async consumeUserBurst(scope: string, user: IAuthUser, options: { limit: number; ttl: number }, res?: any) {
        const { totalHits, timeToExpire } = await this.throttlerStorage.increment(
            `user-throttle:${scope}.burst:${String(user?._id)}`,
            options.ttl
        );
        if (totalHits > options.limit) {
            res?.header?.('Retry-After', timeToExpire);
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
        return { days: await this.budget.stats(Number(days) || 14) };
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
        await this.consumeUserBurst(
            'YourcatController.portraitCheckout',
            user,
            YOURCAT_THROTTLES.checkout.userBurst,
            res
        );
        return this.service.portraitCheckout(user, id, body?.style);
    }
}
