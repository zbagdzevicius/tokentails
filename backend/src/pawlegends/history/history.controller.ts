import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { accountIdOf } from '../pawlegends-account-id';
import { HISTORY_ERRORS, MatchHistoryService } from './history.service';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md):
 * - `GET /pawlegends/history?mode&before` and `GET /pawlegends/history/match/:id`: the caller's own (guests too);
 * - `GET /pawlegends/history/u/:code?mode&before` and `GET /pawlegends/history/u/:code/match/:id`: another player's,
 *   by player code, for registered accounts, when that player's choice allows it (default: friends);
 * - `POST /pawlegends/history/privacy {visibility}`: everyone | friends | me.
 * Read only (the rows are written by the `/live` save alone). Per-IP buckets on every route.
 */

const MINUTE = 60_000;

const needSession = () =>
    new ForbiddenException({ statusCode: 403, code: 'need_account', message: 'Match history needs an account session' });

@Controller('pawlegends/history')
@SkipThrottle()
export class PawlegendsHistoryController {
    constructor(private readonly history: MatchHistoryService, private readonly ipThrottler: ClientIpThrottlerGuard) {}

    private async who(name: string, limit: number, req: any, res: any): Promise<{ id: string; registered: boolean }> {
        await this.ipThrottler.consume(`PawlegendsHistory.${name}`, req, { limit, ttl: MINUTE }, res);
        const id = accountIdOf(req);
        if (!id) throw needSession();
        return { id, registered: !req?.user?.isGuest };
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get()
    async mine(@Query() q: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.who('list', 60, req, res);
        return this.history.list(me.id, { mode: q?.mode, before: q?.before }, me.registered);
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @Get('match/:id')
    async myMatch(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.who('match', 60, req, res);
        return this.history.match(me.id, { id }, me.registered);
    }

    @UseGuards(AppAuthGuard)
    @Get('u/:code')
    async theirs(
        @Param('code') code: string,
        @Query() q: Record<string, unknown>,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        const me = await this.who('list', 60, req, res);
        if (!me.registered) throw HISTORY_ERRORS.needAccount();
        return this.history.list(me.id, { code, mode: q?.mode, before: q?.before }, true);
    }

    @UseGuards(AppAuthGuard)
    @Get('u/:code/match/:id')
    async theirMatch(
        @Param('code') code: string,
        @Param('id') id: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        const me = await this.who('match', 60, req, res);
        if (!me.registered) throw HISTORY_ERRORS.needAccount();
        return this.history.match(me.id, { code, id }, true);
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest()
    @HttpCode(200)
    @Post('privacy')
    async privacy(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.who('privacy', 20, req, res);
        return this.history.setVisibility(me.id, body?.visibility);
    }
}
