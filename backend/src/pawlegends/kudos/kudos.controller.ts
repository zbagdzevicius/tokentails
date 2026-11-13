import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { KUDOS_ERRORS, KudosService } from './kudos.service';

/*
 * Good-teammate kudos (docs/plans/moba/CLUBS-KUDOS.md §5): `POST /pawlegends/kudos {room, slot}` from the PvP results
 * screen and `GET /pawlegends/kudos/me`. Registered accounts only; per-account and per-IP buckets on top of the
 * service's once-per-teammate-per-match and daily rules.
 */

const MIN = 60_000;
const LIMITS: Record<string, { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }> = {
    give: { account: { limit: 20, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    view: { account: { limit: 30, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
};

@Controller('pawlegends/kudos')
@SkipThrottle()
export class PawlegendsKudosController {
    constructor(
        private readonly kudos: KudosService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    private async gate(name: keyof typeof LIMITS, req: any, res: any): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw KUDOS_ERRORS.needAccount();
        const acc = String(id);
        const opt = LIMITS[name].account;
        const { totalHits, timeToExpire } = await this.storage.increment(`pl-kudos:${name}:${acc}`, opt.ttl);
        if (totalHits > opt.limit) {
            res?.header?.('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        await this.ipThrottler.consume(`PawlegendsKudos.${name}`, req, LIMITS[name].ip, res);
        return acc;
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post()
    async give(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.kudos.give(await this.gate('give', req, res), body?.room, body?.slot);
    }

    @UseGuards(AppAuthGuard)
    @Get('me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.kudos.me(await this.gate('view', req, res));
    }
}
