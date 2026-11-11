import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { SOCIAL_ERRORS, SocialService } from './social.service';

/*
 * The Friends sheet routes (SOCIAL-RANKED.md §10). Registered accounts only: AppAuthGuard refuses guests with 403
 * (no @AllowGuest), and the handler refuses a transient caller with PAWLEGENDS_NEED_ACCOUNT. Every route counts a
 * per-account and a per-IP bucket; code lookups have their own (30 / 10 min per account, 60 / 10 min per IP) against
 * enumeration.
 */

const MIN = 60_000;
const LIMITS: Record<string, { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }> = {
    state: { account: { limit: 60, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    pulse: { account: { limit: 6, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    request: { account: { limit: 5, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    edit: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    me: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    rotate: { account: { limit: 3, ttl: 24 * 60 * MIN }, ip: { limit: 10, ttl: 60 * MIN } },
    recent: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    invite: { account: { limit: 10, ttl: 10 * MIN }, ip: { limit: 30, ttl: 10 * MIN } },
    age: { account: { limit: 5, ttl: MIN }, ip: { limit: 20, ttl: MIN } },
    code: { account: { limit: 30, ttl: 10 * MIN }, ip: { limit: 60, ttl: 10 * MIN } },
};

@Controller('pawlegends/social')
@SkipThrottle()
export class PawlegendsSocialController {
    constructor(
        private readonly social: SocialService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    private async gate(name: keyof typeof LIMITS, req: any, res: any, codeLookup = false): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw SOCIAL_ERRORS.needAccount();
        const acc = String(id);
        const buckets: Array<[string, ClientIpThrottleOptions]> = [[name, LIMITS[name].account]];
        if (codeLookup) buckets.push(['code', LIMITS.code.account]);
        for (const [scope, opt] of buckets) {
            const { totalHits, timeToExpire } = await this.storage.increment(`pl-social:${scope}:${acc}`, opt.ttl);
            if (totalHits > opt.limit) {
                res?.header?.('Retry-After', timeToExpire);
                throw new ThrottlerException();
            }
        }
        await this.ipThrottler.consume(`PawlegendsSocial.${name}`, req, LIMITS[name].ip, res);
        if (codeLookup) await this.ipThrottler.consume('PawlegendsSocial.code', req, LIMITS.code.ip, res);
        return acc;
    }

    @UseGuards(AppAuthGuard)
    @Get()
    async state(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.state(await this.gate('state', req, res));
    }

    /** 204 while nothing changed; else `{rev, invites}` and the game fetches GET /pawlegends/social. */
    @UseGuards(AppAuthGuard)
    @Get('pulse')
    async pulse(@Query('rev') rev: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const out = await this.social.pulse(await this.gate('pulse', req, res), rev);
        if (!out.changed) {
            res?.status?.(204);
            return undefined;
        }
        return { rev: out.rev, invites: out.invites };
    }

    /** `{code}` or `{room, slot}` (recent). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('friends')
    async request(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('request', req, res, body?.code !== undefined);
        const target = await this.social.targetOf(me, body || {});
        return this.social.request(me, target.id, target.via);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('friends/:code/accept')
    async accept(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.accept(await this.gate('edit', req, res), code);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('friends/:code/decline')
    async decline(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.remove(await this.gate('edit', req, res), code);
    }

    @UseGuards(AppAuthGuard)
    @Delete('friends/:code')
    async remove(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.remove(await this.gate('edit', req, res), code);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('blocks')
    async block(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.block(await this.gate('edit', req, res, body?.code !== undefined), body || {});
    }

    @UseGuards(AppAuthGuard)
    @Delete('blocks/:code')
    async unblock(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.unblock(await this.gate('edit', req, res), code);
    }

    /** `{name?: 'generated' | catId, invisible?, allowRecent?}`. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('me')
    async setMe(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.setMe(await this.gate('me', req, res), body || {});
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('code/rotate')
    async rotate(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.rotateCode(await this.gate('rotate', req, res));
    }

    @UseGuards(AppAuthGuard)
    @Get('recent')
    async recent(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.recent(await this.gate('recent', req, res));
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('invite')
    async invite(@Body() body: { to?: unknown }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.invite(await this.gate('invite', req, res, true), body?.to);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('age')
    async age(@Body() body: { ageBand?: unknown }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.setAge(await this.gate('age', req, res), body?.ageBand);
    }
}
