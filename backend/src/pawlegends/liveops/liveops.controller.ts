import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { liveopsNeedAccount, LiveopsService } from './liveops.service';

/*
 * Live ops routes (docs/plans/moba/LIVEOPS.md). `GET /pawlegends/config` is public and cached; the rest take the
 * caller's account (guests too: they play and earn like anyone). None of them moves the community goal or a Winter
 * Nap day: only `/live` does (liveops-live.ts). Every route is on; nothing here costs money.
 */

const MINUTE = 60_000;

const accountOf = (req: any): string => {
    const id = req?.user?._id ?? req?.user?.id;
    if (!id || req?.user?.transient) throw liveopsNeedAccount();
    return String(id);
};

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsLiveopsController {
    constructor(private readonly liveops: LiveopsService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    @Header('Cache-Control', 'public, max-age=30')
    @Get('config')
    async config(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsLiveops.config', req, { limit: 60, ttl: MINUTE }, res);
        return this.liveops.config();
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('config/me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsLiveops.me', req, { limit: 60, ttl: MINUTE }, res);
        return this.liveops.me(accountOf(req));
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('config/goal/claim')
    async claimGoal(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsLiveops.claim', req, { limit: 20, ttl: MINUTE }, res);
        return this.liveops.claimGoal(accountOf(req));
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('config/nap/claim')
    async claimNap(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsLiveops.claim', req, { limit: 20, ttl: MINUTE }, res);
        return this.liveops.claimNap(accountOf(req));
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('config/vote')
    async vote(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsLiveops.vote', req, { limit: 10, ttl: MINUTE }, res);
        return this.liveops.vote(accountOf(req), body?.option);
    }
}
