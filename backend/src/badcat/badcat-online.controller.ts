import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AUTH_USER, IAuthUser } from 'src/common/decorators/auth-user.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { PermissionGuard } from 'src/shared/guards/permission.guard';
import { PERMISSION_LEVEL } from 'src/user/models/user.model';
import {
    AccountResponse,
    BoardMeResponse,
    BoardResponse,
    CreatorDashboard,
    EntitlementResponse,
    FeedResponse,
    FeedRoom,
    PushSubscribeRequest,
    RoomPublishRequest,
    RoomPublishResponse,
    ShortLinkRequest,
    ShortLinkResponse,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { BadcatLinksService } from './badcat-links.service';
import { BadcatOnlineService, TreatMeterView } from './badcat-online.service';
import { BadcatPushService } from './badcat-push.service';
import { BADCAT_SIM_INFO, IBadcatSimInfo } from './badcat-sim-info';

/*
 * Bad Cat Daily Phase 2 routes (GDD 10, 17.3). Same rules as BadcatController: always on (push answers 503 without
 * the BADCAT_VAPID_* keys), a per-client-IP limit counted in the handler, admin routes behind
 * AppAuthGuard + PermissionGuard(ADMIN). Signed-in routes take the lowercase `accesstoken` header (Firebase `fb`
 * token) through AppAuthGuard. No route here writes a score (ranked runs: the one score route (/live in the user module), BAD_CAT).
 */

const MINUTE = 60_000;
export const BADCAT_ONLINE_THROTTLES: Record<string, ClientIpThrottleOptions> = {
    sim: { limit: 60, ttl: MINUTE },
    board: { limit: 120, ttl: MINUTE },
    boardMe: { limit: 60, ttl: MINUTE },
    account: { limit: 60, ttl: MINUTE },
    claim: { limit: 10, ttl: MINUTE },
    link: { limit: 20, ttl: MINUTE },
    linkGet: { limit: 300, ttl: MINUTE },
    room: { limit: 6, ttl: MINUTE },
    roomGet: { limit: 120, ttl: MINUTE },
    feed: { limit: 60, ttl: MINUTE },
    play: { limit: 30, ttl: MINUTE },
    report: { limit: 5, ttl: 10 * MINUTE },
    meter: { limit: 60, ttl: MINUTE },
    push: { limit: 10, ttl: MINUTE },
    creator: { limit: 20, ttl: MINUTE },
    face: { limit: 5, ttl: MINUTE },
};

const intParam = (value: unknown): number =>
    typeof value === 'string' && /^-?\d{1,7}$/.test(value) ? Number(value) : NaN;

@Controller('badcat')
@SkipThrottle()
export class BadcatOnlineController {
    constructor(
        private readonly online: BadcatOnlineService,
        private readonly links: BadcatLinksService,
        private readonly push: BadcatPushService,
        private readonly ipThrottler: ClientIpThrottlerGuard
    ) {}

    /** The per-client-IP limit of one public route. */
    private async throttle(name: keyof typeof BADCAT_ONLINE_THROTTLES, req: any, res?: any): Promise<void> {
        await this.ipThrottler.consume(`BadcatOnline.${name}`, req, BADCAT_ONLINE_THROTTLES[name], res);
    }

    /** Which sim the BAD_CAT branch of /live replays with (the game's deploy compares it with its build). */
    @Header('Cache-Control', 'public, max-age=60')
    @Get('sim')
    async sim(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<IBadcatSimInfo> {
        await this.throttle('sim', req, res);
        return BADCAT_SIM_INFO;
    }

    // ----- boards -----

    @Header('Cache-Control', 'public, max-age=30')
    @Get('board/:day')
    async board(
        @Param('day') day: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<BoardResponse> {
        await this.throttle('board', req, res);
        return this.online.board(intParam(day));
    }

    @UseGuards(AppAuthGuard)
    @AllowGuest({ transient: true })
    @Header('Cache-Control', 'private, no-store')
    @Get('board/:day/me')
    async boardMe(
        @Param('day') day: string,
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<BoardMeResponse> {
        await this.throttle('boardMe', req, res);
        return this.online.boardMe(intParam(day), user);
    }

    // ----- accounts -----

    @UseGuards(AppAuthGuard)
    @AllowGuest({ transient: true })
    @Header('Cache-Control', 'private, no-store')
    @Get('account')
    async account(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<AccountResponse> {
        await this.throttle('account', req, res);
        return this.online.accountSummary(user);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('account/claim')
    async claim(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<EntitlementResponse> {
        await this.throttle('claim', req, res);
        return this.online.claim(user);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('account/streak-email')
    async streakEmail(
        @AUTH_USER() user: IAuthUser,
        @Body() body: { on?: boolean },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; on: boolean }> {
        await this.throttle('account', req, res);
        return this.online.setStreakEmail(user, body?.on);
    }

    @UseGuards(AppAuthGuard)
    @Header('Cache-Control', 'private, no-store')
    @Get('creator/me')
    async creator(
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<CreatorDashboard> {
        await this.throttle('creator', req, res);
        return this.online.creatorDashboard(user);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('face/:cameoId/yourcat')
    async faceFromYourcat(
        @Param('cameoId') cameoId: string,
        @AUTH_USER() user: IAuthUser,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; status: 'approved' }> {
        await this.throttle('face', req, res);
        return this.online.faceFromYourcat(cameoId, user);
    }

    // ----- short links and server OG -----

    @HttpCode(200)
    @Post('link')
    async link(
        @Body() body: ShortLinkRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<ShortLinkResponse> {
        await this.throttle('link', req, res);
        return this.links.createLink(body);
    }

    @Get('s/:id')
    async shortLink(@Param('id') id: string, @Req() req: any, @Res() res: any): Promise<void> {
        await this.throttle('linkGet', req, res);
        const html = await this.links.linkPage(id);
        if (!html) throw BADCAT_ERRORS.notFound();
        res.set({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy':
                "default-src 'none'; img-src https:; script-src 'unsafe-inline'; base-uri 'none'",
        });
        res.send(html);
    }

    @Get('og/:file')
    async ogImage(@Param('file') file: string, @Req() req: any, @Res() res: any): Promise<void> {
        await this.throttle('linkGet', req, res);
        const match = /^([A-Za-z0-9]{8})\.png$/.exec(file || '');
        const png = match ? await this.links.linkCard(match[1]) : null;
        if (!png) throw BADCAT_ERRORS.notFound();
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
        });
        res.send(png);
    }

    // ----- rooms and the feed -----

    @HttpCode(200)
    @Post('room')
    async publishRoom(
        @Body() body: RoomPublishRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<RoomPublishResponse> {
        await this.throttle('room', req, res);
        return this.links.publishRoom(body, null);
    }

    @Header('Cache-Control', 'public, max-age=60')
    @Get('room/:id')
    async room(@Param('id') id: string, @Req() req: any, @Res({ passthrough: true }) res: any): Promise<FeedRoom> {
        await this.throttle('roomGet', req, res);
        const room = await this.links.room(id);
        if (!room) throw BADCAT_ERRORS.notFound();
        return room;
    }

    @HttpCode(200)
    @Post('room/:id/play')
    async play(
        @Param('id') id: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean }> {
        await this.throttle('play', req, res);
        return this.links.play(id);
    }

    @HttpCode(200)
    @Post('room/:id/report')
    async report(
        @Param('id') id: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean }> {
        await this.throttle('report', req, res);
        return this.links.report(id);
    }

    @Header('Cache-Control', 'public, max-age=60')
    @Get('feed')
    async feed(
        @Query('sort') sort: string,
        @Query('cursor') cursor: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<FeedResponse> {
        await this.throttle('feed', req, res);
        return this.links.feed(sort, cursor);
    }

    // ----- live treat meter -----

    @Header('Cache-Control', 'public, max-age=300')
    @Get('meter')
    async meter(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<TreatMeterView> {
        await this.throttle('meter', req, res);
        return this.online.meter();
    }

    // ----- web push -----

    @Header('Cache-Control', 'public, max-age=3600')
    @Get('push/key')
    async pushKey(@Req() req: any, @Res({ passthrough: true }) res: any): Promise<{ publicKey: string }> {
        await this.throttle('push', req, res);
        return this.push.publicKey();
    }

    @HttpCode(200)
    @Post('push/subscribe')
    async pushSubscribe(
        @Body() body: PushSubscribeRequest,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean; utcHour: number }> {
        await this.throttle('push', req, res);
        return this.push.subscribe(body);
    }

    @HttpCode(200)
    @Post('push/unsubscribe')
    async pushUnsubscribe(
        @Body() body: { endpoint?: string },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ ok: boolean }> {
        await this.throttle('push', req, res);
        return this.push.unsubscribe(body?.endpoint);
    }

    // ----- admin: the room feed queue -----

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @Get('admin/rooms')
    async adminRooms(@Query('status') status: string) {
        return { items: await this.links.adminRooms(status) };
    }

    @UseGuards(AppAuthGuard, PermissionGuard(PERMISSION_LEVEL.ADMIN))
    @HttpCode(200)
    @Post('admin/rooms/:id/:decision')
    async reviewRoom(@Param('id') id: string, @Param('decision') decision: string) {
        if (decision !== 'approve' && decision !== 'reject' && decision !== 'hide') throw BADCAT_ERRORS.notFound();
        return this.links.reviewRoom(id, decision);
    }
}
