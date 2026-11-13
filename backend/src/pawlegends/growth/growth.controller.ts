import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import { GROWTH_ERRORS, GrowthService } from './growth.service';

/*
 * Growth routes (docs/plans/moba/GROWTH.md). Invites: registered accounts only (AppAuthGuard refuses guests with 403;
 * a transient caller is refused here), free, so the apps may call them too. The first-purchase offer and the creator
 * lookup serve the web store sheet. The creator admin and payout report need PermissionGuard(MANAGER).
 *
 * Abuse limits: every route counts a per-account and a per-IP bucket; redeeming a code also has a daily per-account
 * bucket (code guessing), and an account and a device accept one invite ever (unique indexes).
 */

const MIN = 60_000;
const LIMITS: Record<string, { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }> = {
    state: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    redeem: { account: { limit: 5, ttl: 10 * MIN }, ip: { limit: 20, ttl: 10 * MIN } },
    redeemDay: { account: { limit: 10, ttl: 24 * 60 * MIN }, ip: { limit: 60, ttl: 24 * 60 * MIN } },
    claim: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    gift: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    creator: { account: { limit: 20, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
};

const DAY_MS = 86_400_000;

@Controller('pawlegends/growth')
@SkipThrottle()
export class PawlegendsGrowthController {
    constructor(
        private readonly growth: GrowthService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    private async gate(names: (keyof typeof LIMITS)[], req: any, res: any, needAccount = true): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        const acc = id && !req?.user?.transient && !req?.user?.isGuest ? String(id) : null;
        if (needAccount && !acc) throw GROWTH_ERRORS.needAccount();
        for (const name of names) {
            if (acc) {
                const { totalHits, timeToExpire } = await this.storage.increment(
                    `pl-growth:${name}:${acc}`,
                    LIMITS[name].account.ttl
                );
                if (totalHits > LIMITS[name].account.limit) {
                    res?.header?.('Retry-After', timeToExpire);
                    throw new ThrottlerException();
                }
            }
            await this.ipThrottler.consume(`PawlegendsGrowth.${name}`, req, LIMITS[name].ip, res);
        }
        return acc ?? '';
    }

    /** The Social sheet's invite row: my code and link, my invites, the one I accepted, rewards ready. */
    @UseGuards(AppAuthGuard)
    @Get('invite')
    async invite(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate(['state'], req, res);
        return this.growth.state(me);
    }

    /** `{code, deviceId?}`: accept a friend's invite (a `?ref=` link or a typed code). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('invite/redeem')
    async redeem(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate(['redeem', 'redeemDay'], req, res);
        return this.growth.redeem(me, body?.code, body?.deviceId);
    }

    /** Claim every finished invite's coat (idempotent); answers the coats given and the fresh state. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('invite/claim')
    async claim(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate(['claim'], req, res);
        return this.growth.claim(me);
    }

    /**
     * The web store sheet: the first-purchase gift offer (5 coats when the next order is the first) and the creator
     * code that applies to this account's purchases now. Web only: the apps never ask (they sell nothing).
     */
    @UseGuards(AppAuthGuard)
    @Get('checkout')
    async checkout(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate(['gift'], req, res);
        const [gift, creator] = await Promise.all([this.growth.giftOffer(me), this.growth.linkOf(me)]);
        return { gift, creator };
    }

    /** Public: is this a creator code? `{code, name}` or 404 (the checkout field checks as the buyer types). */
    @Get('creators/:code')
    async creator(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.gate(['creator'], req, res, false);
        const found = await this.growth.creator(code);
        if (!found) throw GROWTH_ERRORS.creatorUnknown();
        return found;
    }

    /** Admin: add or change a creator `{code, name, shareBps?, active?}`. */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @HttpCode(200)
    @Post('creators')
    async upsertCreator(@Body() body: Record<string, unknown>) {
        return this.growth.upsertCreator(body || {});
    }

    /** Admin: the payout report for paid orders in `[from, to)` (ISO dates; default the last 30 days). */
    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.MANAGER))
    @Get('creators-report')
    async report(@Query('from') from?: string, @Query('to') to?: string) {
        const end = to && Number.isFinite(Date.parse(to)) ? new Date(to) : new Date();
        const start =
            from && Number.isFinite(Date.parse(from)) ? new Date(from) : new Date(end.getTime() - 30 * DAY_MS);
        return this.growth.report(start, end);
    }
}
