import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Post,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PawlegendsAnalyticsService } from './analytics.service';

const MIN = 60_000;
const LIMITS: Record<'get' | 'set', ClientIpThrottleOptions> = {
    get: { limit: 30, ttl: MIN },
    set: { limit: 20, ttl: MIN },
};

/*
 * The player's analytics choice (docs/BACKEND.md "Pawlegends server analytics"): the game's consent card and Settings
 * toggle, pawlegends.app's banner and the app shell send it here after the player answers, so the server's own events
 * (match results, purchases, Yarn, season tiers) follow the same choice. Guests with an account too; a transient guest
 * has nothing to store (428 from the guard).
 */
@Controller('pawlegends/analytics')
@SkipThrottle()
export class PawlegendsAnalyticsController {
    constructor(
        private readonly analytics: PawlegendsAnalyticsService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    private account(req: any): string {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient)
            throw new BadRequestException({
                statusCode: 400,
                code: 'PAWLEGENDS_ANALYTICS_ACCOUNT',
                message: 'No account',
            });
        return String(id);
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Header('Cache-Control', 'private, no-store')
    @Get('consent')
    async mine(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsAnalytics.get', req, LIMITS.get, res);
        return this.analytics.state(this.account(req));
    }

    /** `{granted: boolean, distinctId?: 'pl_<32 hex>', version?: string}`: answers `{granted, distinctId, configured}`. */
    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Header('Cache-Control', 'private, no-store')
    @Post('consent')
    async set(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsAnalytics.set', req, LIMITS.set, res);
        return this.analytics.setConsent(this.account(req), body ?? {});
    }
}
