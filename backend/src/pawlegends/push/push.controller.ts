import { Body, Controller, Get, Header, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PUSH_ERRORS, PushService } from './push.service';

/*
 * Push routes (docs/plans/moba/SHARE-PUSH.md §2). The key is public; the rest take the caller's account (guests too:
 * Winter Nap, events and ranked are for every player). Sending happens only inside the server (push-sink.ts).
 */

const MINUTE = 60_000;

const accountOf = (req: any): string => {
    const id = req?.user?._id ?? req?.user?.id;
    if (!id || req?.user?.transient) throw PUSH_ERRORS.needAccount();
    return String(id);
};

@Controller('pawlegends/push')
@SkipThrottle()
export class PawlegendsPushController {
    constructor(private readonly push: PushService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    @Header('Cache-Control', 'public, max-age=300')
    @Get('key')
    async key(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsPush.key', req, { limit: 30, ttl: MINUTE }, res);
        return this.push.key();
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('subscribe')
    async subscribe(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsPush.write', req, { limit: 20, ttl: MINUTE }, res);
        return this.push.subscribe(accountOf(req), body ?? {});
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('prefs')
    async prefs(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsPush.write', req, { limit: 20, ttl: MINUTE }, res);
        return this.push.prefs(accountOf(req), body ?? {});
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('unsubscribe')
    async unsubscribe(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsPush.write', req, { limit: 20, ttl: MINUTE }, res);
        return this.push.unsubscribe(accountOf(req), body ?? {});
    }
}
