import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { CHAT_LIMITS } from '../../shared-contracts/chat';
import { CHAT_ERRORS, ChatService } from './chat.service';

/*
 * Friends chat routes (CHAT-AVATARS.md §4). Registered accounts only: AppAuthGuard refuses guests (no @AllowGuest) and
 * the handler refuses a transient caller. Every route counts a per-account and a per-IP bucket on top of the chat
 * limits in ChatService (per sender, per thread, duplicates, strikes). The open-thread poll (`since`) has its own
 * bucket sized for one poll every 4 s.
 */

const MIN = 60_000;
const LIMITS: Record<string, { account: ClientIpThrottleOptions; ip: ClientIpThrottleOptions }> = {
    list: { account: { limit: 30, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    history: { account: { limit: 60, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    since: { account: { limit: 40, ttl: MIN }, ip: { limit: 240, ttl: MIN } },
    open: { account: { limit: 20, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    send: { account: { limit: 30, ttl: MIN }, ip: { limit: CHAT_LIMITS.ipPerMinute, ttl: MIN } },
    edit: { account: { limit: 60, ttl: MIN }, ip: { limit: 120, ttl: MIN } },
    report: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
};

@Controller('pawlegends/social/chat')
@SkipThrottle()
export class PawlegendsChatController {
    constructor(
        private readonly chat: ChatService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage
    ) {}

    private async gate(name: keyof typeof LIMITS, req: any, res: any): Promise<string> {
        const id = req?.user?._id ?? req?.user?.id;
        if (!id || req?.user?.transient || req?.user?.isGuest) throw CHAT_ERRORS.needAccount();
        const acc = String(id);
        const opt = LIMITS[name].account;
        const { totalHits, timeToExpire } = await this.storage.increment(`pl-chat:${name}:${acc}`, opt.ttl);
        if (totalHits > opt.limit) {
            res?.header?.('Retry-After', timeToExpire);
            throw new ThrottlerException();
        }
        await this.ipThrottler.consume(`PawlegendsChat.${name}`, req, LIMITS[name].ip, res);
        return acc;
    }

    @UseGuards(AppAuthGuard)
    @Get()
    async list(@Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.chat.list(await this.gate('list', req, res));
    }

    /** `{msg, kind, note?}`: report one received message. Declared before `:thread` so it is never a thread id. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('report')
    async report(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.chat.report(await this.gate('report', req, res), body || {});
    }

    /** Opens (or creates) the DM thread with a friend: `{thread, tier}`. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('dm/:code')
    async open(@Param('code') code: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.chat.open(await this.gate('open', req, res), code);
    }

    @UseGuards(AppAuthGuard)
    @Get(':thread')
    async history(
        @Param('thread') thread: string,
        @Query('before') before: string,
        @Query('limit') limit: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.chat.history(await this.gate('history', req, res), thread, before, limit);
    }

    /** 204 when nothing is new. */
    @UseGuards(AppAuthGuard)
    @Get(':thread/since/:id')
    async since(
        @Param('thread') thread: string,
        @Param('id') id: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        const out = await this.chat.since(await this.gate('since', req, res), thread, id);
        if (!out) {
            res?.status?.(204);
            return undefined;
        }
        return out;
    }

    /** `{k:'t', text} | {k:'q', id} | {k:'s', id}`. */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post(':thread')
    async send(
        @Param('thread') thread: string,
        @Body() body: Record<string, unknown>,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.chat.send(await this.gate('send', req, res), thread, body);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post(':thread/read')
    async read(
        @Param('thread') thread: string,
        @Body() body: { upTo?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.chat.markRead(await this.gate('edit', req, res), thread, body?.upTo);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post(':thread/mute')
    async mute(
        @Param('thread') thread: string,
        @Body() body: { muted?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.chat.mute(await this.gate('edit', req, res), thread, body?.muted);
    }
}
