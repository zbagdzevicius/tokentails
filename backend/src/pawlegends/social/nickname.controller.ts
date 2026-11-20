import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { NAME_ERRORS } from './nickname';
import { NicknameService } from './nickname.service';

/*
 * The nickname routes (SOCIAL-RANKED.md §2.3). Registered accounts only: AppAuthGuard refuses guests (no @AllowGuest)
 * and a transient or guest caller gets 403 PAWLEGENDS_NEED_ACCOUNT ("Sign in to choose your name"). A per-account and a
 * per-IP bucket on each route; the change has a tight one (the Yarn and the cooldown are the real limits).
 */

const MIN = 60_000;
const LIMITS: Record<
    'view' | 'change' | 'check' | 'notice',
    { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }
> = {
    view: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    // the live "taken / available" check while typing (debounced by the game)
    check: { account: { limit: 60, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    notice: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    change: { account: { limit: 6, ttl: 10 * MIN }, ip: { limit: 20, ttl: 10 * MIN } },
};

@Controller('pawlegends/name')
@SkipThrottle()
export class PawlegendsNicknameController {
    constructor(
        private readonly names: NicknameService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    private async gate(name: keyof typeof LIMITS, req: any, res: any): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw NAME_ERRORS.needAccount();
        const acc = String(id);
        const opt = LIMITS[name].account;
        const { totalHits, timeToExpire } = await this.storage.increment(`pl-name:${name}:${acc}`, opt.ttl);
        if (totalHits > opt.limit) {
            res?.header?.('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        await this.ipThrottler.consume(`PawlegendsName.${name}`, req, LIMITS[name].ip, res);
        return acc;
    }

    /** The name others see, the nickname, whether the next change is free, its price, the cooldown and the Yarn. */
    @UseGuards(AppAuthGuard)
    @Get()
    async view(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.names.view(await this.gate('view', req, res));
    }

    /** `{name}`: change the nickname (free the first time, then Yarn); answers the new view plus `paid`. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post()
    async change(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.names.change(await this.gate('change', req, res), body || {});
    }

    /** `?name=`: is this name valid and free? `{name, available, mine?, reason?, message?}` (no id, code or email). */
    @UseGuards(AppAuthGuard)
    @Get('check')
    async check(@Query('name') name: unknown, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.names.check(await this.gate('check', req, res), name);
    }

    /** The player saw the one-time name notice (`notice` on the view). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('notice')
    async notice(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.names.seen(await this.gate('notice', req, res));
    }
}
