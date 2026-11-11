import { Controller, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { needAccount, RankedService } from './ranked.service';

/*
 * Ranked and leaderboard reads (docs/plans/moba/SOCIAL-RANKED.md §10). `ranked/status`, and the global, hero and weekly
 * boards are public (60 a minute per client IP); the friends board and `ranked/me` need a token. Nothing here writes.
 */

const MINUTE = 60_000;

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsRankedController {
    constructor(private readonly ranked: RankedService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    @Header('Cache-Control', 'public, max-age=30')
    @Get('ranked/status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsRanked.status', req, { limit: 60, ttl: MINUTE }, res);
        return this.ranked.status();
    }

    @UseGuards(AppAuthGuard)
    @Get('ranked/me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsRanked.me', req, { limit: 60, ttl: MINUTE }, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient) throw needAccount();
        return this.ranked.me(String(id), !!req.user.isGuest);
    }

    /** Public: global, hero and weekly. */
    @Get('boards/:kind')
    async board(
        @Param('kind') kind: string,
        @Query() query: Record<string, unknown>,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.ipThrottler.consume('PawlegendsRanked.board', req, { limit: 60, ttl: MINUTE }, res);
        if (kind === 'friends') throw needAccount();
        return this.ranked.board(kind, query || {}, null);
    }

    /** With a token: the friends board, and `me` on the others (registered accounts). */
    @UseGuards(AppAuthGuard)
    @Get('boards/:kind/me')
    async boardMe(
        @Param('kind') kind: string,
        @Query() query: Record<string, unknown>,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.ipThrottler.consume('PawlegendsRanked.boardMe', req, { limit: 60, ttl: MINUTE }, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw needAccount();
        return this.ranked.board(kind, query || {}, String(id));
    }
}
