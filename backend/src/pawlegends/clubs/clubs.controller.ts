import { Body, Controller, Get, HttpCode, Optional, Post, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { KudosService } from '../kudos/kudos.service';
import { CLUB_ERRORS, ClubsService } from './clubs.service';

/*
 * Club routes (docs/plans/moba/CLUBS-KUDOS.md §3). Registered accounts only: AppAuthGuard refuses guests (no
 * @AllowGuest) and the handler refuses a transient or guest caller. Every route counts a per-account and a per-IP
 * bucket; join-by-code has its own bucket against code guessing. Club chat uses the friends chat routes with the
 * club's thread id (`/pawlegends/social/chat/:thread`).
 */

const MIN = 60_000;
const LIMITS: Record<string, { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }> = {
    view: { account: { limit: 30, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    create: { account: { limit: 3, ttl: 60 * MIN }, ip: { limit: 10, ttl: 60 * MIN } },
    join: { account: { limit: 10, ttl: 10 * MIN }, ip: { limit: 30, ttl: 10 * MIN } },
    edit: { account: { limit: 20, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    claim: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
};

@Controller('pawlegends/clubs')
@SkipThrottle()
export class PawlegendsClubsController {
    constructor(
        private readonly clubs: ClubsService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
        @Optional() private readonly kudos?: KudosService
    ) {}

    private async gate(name: keyof typeof LIMITS, req: any, res: any): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw CLUB_ERRORS.needAccount();
        const acc = String(id);
        const opt = LIMITS[name].account;
        const { totalHits, timeToExpire } = await this.storage.increment(`pl-club:${name}:${acc}`, opt.ttl);
        if (totalHits > opt.limit) {
            res?.header?.('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        await this.ipThrottler.consume(`PawlegendsClubs.${name}`, req, LIMITS[name].ip, res);
        return acc;
    }

    /** The good-teammate card rides along (one call for the Clubs tab); never fails the caller. */
    private async withKudos<T extends object>(me: string, view: T) {
        let kudos: unknown = null;
        try {
            kudos = (await this.kudos?.me(me)) ?? null;
        } catch {
            kudos = null;
        }
        return { ...view, kudos };
    }

    @UseGuards(AppAuthGuard)
    @Get('me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('view', req, res);
        return this.withKudos(me, await this.clubs.view(me));
    }

    /** `{name: "<first>.<second>"}`: the two name-list positions (never text). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post()
    async create(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('create', req, res);
        return this.withKudos(me, await this.clubs.create(me, body?.name));
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('join')
    async join(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('join', req, res);
        return this.withKudos(me, await this.clubs.join(me, body?.code));
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('leave')
    async leave(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('edit', req, res);
        return this.withKudos(me, await this.clubs.leave(me));
    }

    /** The owner removes a member: `{to}` = the member's opaque id from the view. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('remove')
    async remove(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('edit', req, res);
        return this.withKudos(me, await this.clubs.remove(me, body?.to));
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('chest/claim')
    async claim(@Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('claim', req, res);
        return this.withKudos(me, await this.clubs.claim(me));
    }
}
