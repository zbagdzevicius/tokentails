import {
    Body,
    Controller,
    ForbiddenException,
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
import { SkipThrottle } from '@nestjs/throttler';
import { AllowGuest } from 'src/common/decorators/allow-guest.decorator';
import { AppAuthGuard } from 'src/common/guards/app-auth.guard';
import { ClientIpThrottlerGuard } from 'src/shared/guards/client-ip-throttler.guard';
import { accountIdOf } from '../pawlegends-account-id';
import { PublicPlayerCard, RankedService } from '../ranked/ranked.service';
import { PlayerRelation, SocialService } from '../social/social.service';
import { HISTORY_ERRORS, MatchHistoryService } from './history.service';

/*
 * Match history (docs/plans/moba/MATCH-HISTORY.md):
 * - `GET /pawlegends/history?mode&before` and `GET /pawlegends/history/match/:id`: the caller's own (guests too);
 * - `GET /pawlegends/history/u/:code?mode&before` and `GET /pawlegends/history/u/:code/match/:id`: another player's,
 *   by player code, for registered accounts (public since Nov 17: no privacy choice; a block reads as no player); the
 *   first page also carries `player` (RankedService.publicCard: rank crest, level matches, avatar, flag) for the
 *   Profile screen's read-only view of another player;
 *   Player Card (docs/plans/moba/PLAYER-CARD.md): `player` also carries `rel` (the viewer's relation: self, friend,
 *   sent, asked, none) and `online` (true or false, nothing more), so the card shows Add friend / Request sent /
 *   Accept / Friends and Invite to party without a second call. The card body is cached 60 s per player;
 * - `GET /pawlegends/history/seat/:room/:slot`: the Player Card from an end-of-match scoreboard (no codes there): the
 *   seat's last human holder in a room the caller played, as `{code, name}`; a bot seat, an old room or a block all
 *   read as 404 no player (the answer never says "bot");
 * - `POST /pawlegends/history/privacy {visibility}`: kept for older builds; accepted, ignored, answers `everyone`.
 * Read only (the rows are written by the `/live` save alone). Per-IP buckets on every route.
 */

const MINUTE = 60_000;
/** The Player Card body (rank, level matches, avatar, flag) is cached this long per player. */
export const CARD_CACHE_MS = 60_000;
const CARD_CACHE_MAX = 2000;

const needSession = () =>
    new ForbiddenException({
        statusCode: 403,
        code: 'need_account',
        message: 'Match history needs an account session',
    });

@Controller('pawlegends/history')
@SkipThrottle()
export class PawlegendsHistoryController {
    constructor(
        private readonly history: MatchHistoryService,
        private readonly ipThrottler: ClientIpThrottlerGuard,
        @Optional() private readonly ranked?: RankedService,
        @Optional() private readonly social?: SocialService
    ) {}

    private readonly cards = new Map<string, { at: number; card: PublicPlayerCard }>();

    /** The public card of one account, cached CARD_CACHE_MS (the Boards and a match's scoreboard reopen it often). */
    private async card(id: string): Promise<PublicPlayerCard> {
        const now = Date.now();
        const hit = this.cards.get(id);
        if (hit && now - hit.at < CARD_CACHE_MS) return hit.card;
        const card = await this.ranked!.publicCard(id);
        if (this.cards.size >= CARD_CACHE_MAX) this.cards.clear();
        this.cards.set(id, { at: now, card });
        return card;
    }

    /** The viewer's relation and the player's online state (each failure only drops its field). */
    private async standing(viewer: string, id: string): Promise<{ rel?: PlayerRelation; online?: boolean }> {
        if (!this.social) return {};
        const [rel, online] = await Promise.all([
            this.social.relationOf(viewer, id).catch(() => undefined),
            viewer === id ? Promise.resolve(undefined) : this.social.onlineOf(id).catch(() => undefined),
        ]);
        return { ...(rel ? { rel } : {}), ...(online === undefined ? {} : { online }) };
    }

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
        const page = await this.history.list(me.id, { code, mode: q?.mode, before: q?.before }, true);
        const first = q?.before === undefined || q?.before === null || q?.before === '';
        if (!first || !this.ranked) return page;
        // the profile card never fails the history: without it the screen hides the rank
        try {
            const who = await this.history.ownerOf(me.id, code, true);
            const [card, standing] = await Promise.all([this.card(who.id), this.standing(me.id, who.id)]);
            return { ...page, player: { ...card, ...standing } };
        } catch {
            return page;
        }
    }

    /** The Player Card from an end-of-match scoreboard: who held this seat (PLAYER-CARD.md). */
    @UseGuards(AppAuthGuard)
    @Get('seat/:room/:slot')
    async seat(
        @Param('room') room: string,
        @Param('slot') slot: string,
        @Req() req: any,
        @Res({ passthrough: true }) res: any
    ): Promise<{ code: string; name: string }> {
        const me = await this.who('seat', 60, req, res);
        if (!me.registered) throw HISTORY_ERRORS.needAccount();
        if (!this.social) throw HISTORY_ERRORS.noPlayer();
        const id = await this.social.seatHolder(me.id, room, slot);
        if (!id || (await this.social.blockedEither(me.id, id))) throw HISTORY_ERRORS.noPlayer();
        const [codes, names] = await Promise.all([this.social.codesOf([id]), this.history.people.names([id])]);
        const code = codes.get(id);
        if (!code) throw HISTORY_ERRORS.noPlayer();
        return { code, name: names.get(id) ?? '' };
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
