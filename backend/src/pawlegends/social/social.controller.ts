import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Optional,
    Param,
    Post,
    Query,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { InjectThrottlerStorage, SkipThrottle, ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottleOptions, ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { ChatService } from './chat.service';
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
    // SOCIAL-INVITES.md: the fast inbox, one poll every 4 s per open game (two tabs fit), shared IPs (NAT) fit
    inbox: { account: { limit: 40, ttl: MIN }, ip: { limit: 600, ttl: MIN } },
    answer: { account: { limit: 20, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    request: { account: { limit: 5, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    edit: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    me: { account: { limit: 10, ttl: MIN }, ip: { limit: 30, ttl: MIN } },
    rotate: { account: { limit: 3, ttl: 24 * 60 * MIN }, ip: { limit: 10, ttl: 60 * MIN } },
    recent: { account: { limit: 30, ttl: MIN }, ip: { limit: 60, ttl: MIN } },
    invite: { account: { limit: 10, ttl: 10 * MIN }, ip: { limit: 30, ttl: 10 * MIN } },
    age: { account: { limit: 5, ttl: MIN }, ip: { limit: 20, ttl: MIN } },
    code: { account: { limit: 30, ttl: 10 * MIN }, ip: { limit: 60, ttl: 10 * MIN } },
    // SOCIAL-INVITES.md: nickname suggestions while typing (the game waits 300 ms between keys and needs 2 letters)
    search: { account: { limit: 40, ttl: MIN }, ip: { limit: 200, ttl: MIN } },
};

@Controller('pawlegends/social')
@SkipThrottle()
export class PawlegendsSocialController {
    constructor(
        private readonly social: SocialService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
        @Optional() private readonly chat?: ChatService
    ) {}

    /** The DM badge (CHAT-AVATARS.md §4): unread count and the newest unread thread; never fails the caller. */
    private async chatSummary(me: string) {
        try {
            return (await this.chat?.summary(me)) ?? { unread: 0 };
        } catch {
            return { unread: 0 };
        }
    }

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
        const me = await this.gate('state', req, res);
        const [state, chat] = await Promise.all([this.social.state(me), this.chatSummary(me)]);
        return { ...state, chat };
    }

    /**
     * 204 while nothing changed; else `{rev, invites, chat}` and the game fetches GET /pawlegends/social. A DM bumps the
     * recipient's rev, so the next pulse answers 200 with the unread count (CHAT-AVATARS.md §4).
     */
    @UseGuards(AppAuthGuard)
    @Get('pulse')
    async pulse(@Query('rev') rev: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('pulse', req, res);
        const out = await this.social.pulse(me, rev);
        if (!out.changed) {
            res?.status?.(204);
            return undefined;
        }
        return { rev: out.rev, invites: out.invites, chat: await this.chatSummary(me) };
    }

    /**
     * The fast inbox (SOCIAL-INVITES.md): 204 while the caller's own rev is `rev`; else `{rev, invites, answers, chat}`.
     * Invites and DMs bump the recipient's rev, an answer bumps the inviter's, so the 4 s poll is one indexed read.
     */
    @UseGuards(AppAuthGuard)
    @Get('inbox')
    async inbox(@Query('rev') rev: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('inbox', req, res);
        const out = await this.social.inbox(me, rev);
        if (!out.changed) {
            res?.status?.(204);
            return undefined;
        }
        return { rev: out.rev, invites: out.invites, answers: out.answers, chat: await this.chatSummary(me) };
    }

    /** `{answer: 'accept' | 'decline'}` on an invite toast; accept answers `{ok, party}` (410 when it expired). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('invite/:id/answer')
    async answer(
        @Param('id') id: string,
        @Body() body: { answer?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.social.answerInvite(await this.gate('answer', req, res), id, body?.answer);
    }

    /**
     * Nickname suggestions (SOCIAL-INVITES.md): `?q=` (2+ letters) answers up to 5 `{name, av, cc?, rel?}` whose
     * nickname starts with it. Never a code or an account id; its own bucket against enumeration.
     */
    @UseGuards(AppAuthGuard)
    @Get('search')
    async search(@Query('q') q: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.search(await this.gate('search', req, res), q);
    }

    /** `{code}`, `{name}` (an exact nickname) or `{room, slot}` (recent). */
    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('friends')
    async request(@Body() body: Record<string, unknown>, @Req() req: any, @Res({ passthrough: true }) res: any) {
        const me = await this.gate('request', req, res, body?.code !== undefined || body?.name !== undefined);
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

    /**
     * `{name?: 'generated' | catId, invisible?, allowRecent?, avatar?, frame?, title?, dmPolicy?}`: avatar parts are
     * checked against what the caller owns (CHAT-AVATARS.md §7.2).
     */
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
    async invite(
        @Body() body: { to?: unknown; mode?: unknown; sim?: unknown },
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ) {
        return this.social.invite(await this.gate('invite', req, res, true), body?.to, body?.mode, body?.sim);
    }

    @UseGuards(AppAuthGuard)
    @HttpCode(200)
    @Post('age')
    async age(@Body() body: { ageBand?: unknown }, @Req() req: any, @Res({ passthrough: true }) res: any) {
        return this.social.setAge(await this.gate('age', req, res), body?.ageBand);
    }
}
