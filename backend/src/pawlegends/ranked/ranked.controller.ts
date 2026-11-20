import { Controller, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { needAccount, RankedService } from './ranked.service';
import { withoutCodes } from '../social/player-codes';

/*
 * Ranked and leaderboard reads (docs/plans/moba/SOCIAL-RANKED.md §10). `ranked/status`, `ping` (§7.11) and the global,
 * hero and weekly boards are public (60 a minute per client IP); the friends and local boards and `ranked/me` need a
 * token (Local is the caller's own country, from their flag).
 * The Leaderboards window's own boards (LEADERBOARDS.md, LeaderboardService): `level`, `sides` and `countries` (Top
 * countries alone: country codes and totals, no players) are public, `country` needs a token (the caller's own country);
 * `/me` adds the caller's row (and, on `sides`, their own wins by species).
 * Nothing here writes.
 */

const MINUTE = 60_000;

@Controller('pawlegends')
@SkipThrottle()
export class PawlegendsRankedController {
    constructor(
        private readonly ranked: RankedService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        private readonly leaderboard: LeaderboardService
    ) {}

    /** The Leaderboards window's boards, or null for a ranked one. */
    private leaderboardBoard(kind: string, query: Record<string, unknown>, caller: string | null) {
        const page = Math.max(0, Math.min(50, Math.floor(Number(query.page) || 0)));
        if (kind === 'level') return this.leaderboard.levelBoard(page, caller);
        if (kind === 'sides') return this.leaderboard.sidesBoard(caller);
        // Top countries alone (no players): public, the guest's Country tab
        if (kind === 'countries') return this.leaderboard.countriesBoard();
        if (kind === 'country') {
            if (!caller) throw needAccount();
            return this.leaderboard.countryBoard(page, caller);
        }
        return null;
    }

    @Header('Cache-Control', 'public, max-age=30')
    @Get('ranked/status')
    async status(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsRanked.status', req, { limit: 60, ttl: MINUTE }, res);
        return this.ranked.status();
    }

    /**
     * The region ping (SOCIAL-RANKED.md §7.11, groundwork): the game times a few of these per region and shows the
     * median. Never cached, nothing read or written.
     */
    @Header('Cache-Control', 'no-store')
    @Get('ping')
    async ping(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsRanked.ping', req, { limit: 60, ttl: MINUTE }, res);
        return { ok: true };
    }

    @UseGuards(AppAuthGuard)
    @Get('ranked/me')
    async me(@Req() req: any, @Res({ passthrough: true }) res: any) {
        await this.ipThrottler.consume('PawlegendsRanked.me', req, { limit: 60, ttl: MINUTE }, res);
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient) throw needAccount();
        return this.ranked.me(String(id), !!req.user.isGuest);
    }

    /** Public: global, hero, weekly, level, sides and countries. */
    @Get('boards/:kind')
    async board(
        @Param('kind') kind: string,
        @Query() query: Record<string, unknown>,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        await this.ipThrottler.consume('PawlegendsRanked.board', req, { limit: 60, ttl: MINUTE }, res);
        if (kind === 'friends' || kind === 'local' || kind === 'country') throw needAccount();
        // no player codes without a token (PLAYER-CARD.md: only a signed-in caller opens a Player Card)
        return withoutCodes(
            await (this.leaderboardBoard(kind, query || {}, null) ?? this.ranked.board(kind, query || {}, null))
        );
    }

    /** With a token: the friends and local boards, and `me` on the others (registered accounts). */
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
        return this.leaderboardBoard(kind, query || {}, String(id)) ?? this.ranked.board(kind, query || {}, String(id));
    }
}
