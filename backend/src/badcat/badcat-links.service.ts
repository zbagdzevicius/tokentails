import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { isValidObjectId, Types } from 'mongoose';
import { IAuthUser, isGuestUser } from 'src/common/decorators/auth-user.decorator';
import { heistReplayQueue, ReplayQueue } from 'src/user/heist/replay-queue';
import { BadcatRoomCheck, catCodeOk, checkRoom, cleanName, cleanTitle, dayTitle } from 'src/vendor/badcat-sim';
import {
    FeedResponse,
    FeedRoom,
    RoomPublishRequest,
    RoomPublishResponse,
    SHORT_LINK_MAX_PATH,
    ShortLinkKind,
    ShortLinkRequest,
    ShortLinkResponse,
} from './badcat.contracts';
import { BADCAT_ERRORS } from './badcat.errors';
import { badcatFeedAutoApprove, badcatPublicUrl, badcatShortLinkBase, Env } from './badcat-flags';
import { escapeHtml } from './badcat-email';
import { BadcatOnlineStore, BadcatRoomStatus } from './badcat-online.schema';
import sharp = require('sharp');

/*
 * Phase 2 short links, server OG cards and the public room feed (GDD 6.4, 6.6, 10, 17.3).
 *
 * - POST /badcat/link turns a long game link (a dare with ghosts, a room, a cat) into /badcat/s/<id>. The id is
 *   stable per long link. GET /badcat/s/<id> is a tiny HTML page with per-link OG tags ("Mochi scored 8,420. Your
 *   cat can't.") and an immediate redirect to the long link on BADCAT_PUBLIC_URL. GET /badcat/og/<id>.png draws
 *   that card (1200 x 630) with sharp from an SVG, so no headless browser and no outside service.
 * - POST /badcat/room checks a player room with the vendored Room Maker rules and replays its maker's clear run, then
 *   stores it once per gameplay hash. Listed in GET /badcat/feed only when the maker asked for it and it was approved
 *   (by an admin, or at once with BADCAT_FEED_AUTO_APPROVE). Reports hide a room after BADCAT_FEED_REPORT_HIDE (3).
 * Only game paths are accepted: never restore, thanks or redeem links (they carry secrets).
 */

/** Short ids: 8 base62 characters. */
const SLUG_PATTERN = /^[A-Za-z0-9]{8}$/;
const SLUG_ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const FEED_PAGE = 20;
const FEED_MAX_SKIP = 400;

export function newSlug(): string {
    const bytes = randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += SLUG_ABC[bytes[i] % SLUG_ABC.length];
    return out;
}

/** Game paths a short link may point to (no secrets: restore, thanks, redeem and checkout routes are refused). */
const GAME_PATH = /^\/badcat(\/(d\/(p?-?\d{1,5})|glass|pick|r|c(\/[A-Za-z0-9_-]{1,64})?|maker))?\/?$/;
const SECRET_PARAMS = new Set(['t', 'session_id', 'code', 'token', 'email']);
/** Any printable text (names may carry spaces and emoji); control characters are refused. */
const QUERY_VALUE = /^[^\u0000-\u001f\u007f]{0,2000}$/;

/** The normalised `/badcat/...?...` path, or null when it is not a shareable game link. */
export function normaliseGamePath(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length < 7 || raw.length > SHORT_LINK_MAX_PATH || !raw.startsWith('/badcat'))
        return null;
    let url: URL;
    try {
        url = new URL(raw, 'https://x.invalid');
    } catch {
        return null;
    }
    if (url.origin !== 'https://x.invalid' || url.hash) return null;
    if (!GAME_PATH.test(url.pathname)) return null;
    const params: string[] = [];
    for (const [key, value] of url.searchParams) {
        if (!/^[a-z][a-z0-9]{0,11}$/.test(key) || SECRET_PARAMS.has(key) || !QUERY_VALUE.test(value)) return null;
        params.push(`${key}=${encodeURIComponent(value)}`);
    }
    return url.pathname.replace(/\/$/, '') + (params.length ? `?${params.join('&')}` : '');
}

const KINDS: readonly ShortLinkKind[] = ['dare', 'room', 'cat', 'day', 'other'];

/** "Mochi scored 8,420. Your cat can't." and friends: the OG title of a short link. */
export function cardTitle(link: {
    kind: string;
    name?: string;
    score?: number;
    dayNo?: number;
    title?: string;
}): string {
    const name = link.name || 'A bad cat';
    if (link.kind === 'dare' && typeof link.score === 'number') {
        return `${name} scored ${link.score.toLocaleString('en-US')}. Your cat can't.`;
    }
    if (link.kind === 'room') return `${link.title || 'A player room'}${link.name ? ` by ${link.name}` : ''}: wreck it`;
    if (link.kind === 'cat') return `Meet ${name}, a very bad cat`;
    if (link.kind === 'day' && typeof link.dayNo === 'number') return `Bad Cat Daily: ${dayTitle(link.dayNo)}`;
    return 'Bad Cat Daily: be a bad cat';
}

/** The 1200 x 630 card as SVG (the PNG route rasterises it). Warm toon colours, a cat silhouette, the line. */
export function cardSvg(title: string, sub: string): string {
    const lines = wrap(title, 26).slice(0, 3);
    const text = lines
        .map(
            (line, i) =>
                `<text x="80" y="${
                    210 + i * 84
                }" font-family="Arial, Helvetica, sans-serif" font-size="68" font-weight="700" fill="#2b1a10">${escapeHtml(
                    line
                )}</text>`
        )
        .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8c7"/><stop offset="1" stop-color="#ffc98f"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<rect x="0" y="520" width="1200" height="110" fill="#c9824f"/>
<g transform="translate(930 250)" fill="#3a2a22">
<ellipse cx="0" cy="170" rx="120" ry="100"/><circle cx="0" cy="40" r="80"/>
<polygon points="-70,-10 -40,-90 -10,-20"/><polygon points="70,-10 40,-90 10,-20"/>
<path d="M110 200 q90 -30 60 -120" stroke="#3a2a22" stroke-width="26" fill="none" stroke-linecap="round"/>
<circle cx="-28" cy="35" r="11" fill="#ffd34d"/><circle cx="28" cy="35" r="11" fill="#ffd34d"/>
</g>
<g transform="translate(760 470) rotate(-18)"><rect x="-26" y="-60" width="52" height="80" rx="10" fill="#9fd3ff" opacity="0.9"/><rect x="-26" y="-60" width="52" height="16" fill="#ffffff" opacity="0.6"/></g>
<text x="80" y="110" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#7b2cbf">BAD CAT DAILY</text>
${text}
<text x="80" y="585" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#fff8ef">${escapeHtml(sub)}</text>
</svg>`;
}

function wrap(text: string, width: number): string[] {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
        if ((line + ' ' + word).trim().length > width && line) {
            out.push(line);
            line = word;
        } else line = (line + ' ' + word).trim();
    }
    if (line) out.push(line);
    return out;
}

@Injectable()
export class BadcatLinksService {
    now: () => Date = () => new Date();
    queue: ReplayQueue = heistReplayQueue;

    constructor(private readonly store: BadcatOnlineStore) {}

    // ---------------------------------------------------------------------------------------------
    // Short links
    // ---------------------------------------------------------------------------------------------

    async createLink(body: ShortLinkRequest, env: Env = process.env): Promise<ShortLinkResponse> {
        const path = normaliseGamePath(body?.path);
        if (!path) throw BADCAT_ERRORS.invalid('path must be a Bad Cat game link');
        const kind: ShortLinkKind = KINDS.includes(body?.kind) ? body.kind : 'other';
        const pathHash = createHash('sha256').update(path).digest('hex');
        const existing = (await this.store.links.findOne({ pathHash }).lean()) as any;
        if (existing) return { id: existing.slug, url: this.shortUrl(existing.slug, env) };
        const name = cleanName(body?.name ?? '', 12);
        const score =
            Number.isInteger(body?.score) && (body.score as number) >= 0 && (body.score as number) < 10_000_000
                ? body.score
                : undefined;
        const dayNo =
            Number.isInteger(body?.dayNo) && Math.abs(body.dayNo as number) < 100_000 ? body.dayNo : undefined;
        const catCode = typeof body?.catCode === 'string' && catCodeOk(body.catCode) ? body.catCode : undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
            const slug = newSlug();
            try {
                await this.store.links.create({
                    slug,
                    path,
                    pathHash,
                    kind,
                    ...(name ? { name } : {}),
                    ...(score !== undefined ? { score } : {}),
                    ...(dayNo !== undefined ? { dayNo } : {}),
                    ...(catCode ? { catCode } : {}),
                });
                return { id: slug, url: this.shortUrl(slug, env) };
            } catch (error) {
                if ((error as { code?: number })?.code !== 11000) throw error;
                const again = (await this.store.links.findOne({ pathHash }).lean()) as any;
                if (again) return { id: again.slug, url: this.shortUrl(again.slug, env) };
            }
        }
        throw BADCAT_ERRORS.conflict('Could not make a short link, try again');
    }

    shortUrl(slug: string, env: Env = process.env): string {
        return `${badcatShortLinkBase(env)}/badcat/s/${slug}`;
    }

    private async findLink(slug: string): Promise<any | null> {
        if (!SLUG_PATTERN.test(slug || '')) return null;
        return this.store.links.findOne({ slug }).lean();
    }

    /** GET /badcat/s/:id: the OG page (and one hit counted), or null for an unknown id. */
    async linkPage(slug: string, env: Env = process.env): Promise<string | null> {
        const link = await this.findLink(slug);
        if (!link) return null;
        await this.store.links.updateOne({ slug }, { $inc: { hits: 1 }, $set: { lastHitAt: this.now() } });
        const target = `${badcatPublicUrl(env)}${link.path}`;
        const title = cardTitle(link);
        const image = `${badcatShortLinkBase(env)}/badcat/og/${slug}.png`;
        const t = escapeHtml(title);
        const u = escapeHtml(target);
        return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t}</title>
<meta name="description" content="A daily cat-chaos game. Knock things off the counter before the human looks.">
<meta property="og:type" content="website"><meta property="og:title" content="${t}">
<meta property="og:description" content="Bad Cat Daily: one room a day, 75 seconds of chaos.">
<meta property="og:image" content="${escapeHtml(
            image
        )}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="${u}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${u}"><link rel="canonical" href="${u}">
</head><body style="font-family:Arial,sans-serif;background:#ffe8c7;text-align:center;padding:40px">
<p><a href="${u}">${t}</a></p><script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
</body></html>`;
    }

    /** GET /badcat/og/:id.png: the card, or null. */
    async linkCard(slug: string): Promise<Buffer | null> {
        const link = await this.findLink(slug);
        if (!link) return null;
        const sub = link.kind === 'room' ? 'Wreck it at tokentails.com/badcat' : 'Play free at tokentails.com/badcat';
        return sharp(Buffer.from(cardSvg(cardTitle(link), sub)))
            .png()
            .toBuffer();
    }

    // ---------------------------------------------------------------------------------------------
    // Rooms and the feed
    // ---------------------------------------------------------------------------------------------

    async publishRoom(
        body: RoomPublishRequest,
        user: IAuthUser | null,
        env: Env = process.env
    ): Promise<RoomPublishResponse> {
        if (typeof body?.code !== 'string' || body.code.length > 2000)
            throw BADCAT_ERRORS.invalid('code must be a room code');
        const wantsFeed = body.feed === true;
        if (wantsFeed && body.clear === undefined) throw BADCAT_ERRORS.invalid('a feed room needs the clear run');
        const res: BadcatRoomCheck = await this.queue.run(() => checkRoom(body.code, body.clear));
        if (!res.ok || !res.room) {
            throw BADCAT_ERRORS.invalid(`room not accepted: ${(res.errors || []).slice(0, 3).join('; ') || 'invalid'}`);
        }
        const existing = (await this.store.rooms.findOne({ gameplayHash: res.room.gameplayHash }).lean()) as any;
        if (existing) {
            if (wantsFeed && !existing.feed) {
                await this.store.rooms.updateOne({ _id: existing._id }, { $set: { feed: true } });
            }
            return {
                id: existing.slug,
                url: await this.roomUrl(existing.slug, existing.code, env),
                status: existing.status,
                feed: wantsFeed || !!existing.feed,
            };
        }
        const status: BadcatRoomStatus = badcatFeedAutoApprove(env) ? 'approved' : 'pending';
        const owner =
            user && !isGuestUser(user) && isValidObjectId(String(user._id))
                ? new Types.ObjectId(String(user._id))
                : undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
            const slug = newSlug();
            try {
                await this.store.rooms.create({
                    slug,
                    code: body.code,
                    gameplayHash: res.room.gameplayHash,
                    title: cleanTitle(res.room.title, 24) || 'A player room',
                    author: res.room.author,
                    shell: res.room.shell,
                    props: res.room.props,
                    ancestors: res.room.ancestors,
                    feed: wantsFeed,
                    status,
                    clearTargets: res.clear?.targets ?? 0,
                    ...(owner ? { user: owner } : {}),
                });
                return { id: slug, url: await this.roomUrl(slug, body.code, env), status, feed: wantsFeed };
            } catch (error) {
                if ((error as { code?: number })?.code !== 11000) throw error;
                const again = (await this.store.rooms.findOne({ gameplayHash: res.room.gameplayHash }).lean()) as any;
                if (again) {
                    return {
                        id: again.slug,
                        url: await this.roomUrl(again.slug, again.code, env),
                        status: again.status,
                        feed: !!again.feed,
                    };
                }
            }
        }
        throw BADCAT_ERRORS.conflict('Could not store the room, try again');
    }

    /** A short link, else (the link could not be stored) the long room link. */
    private async roomUrl(slug: string, code: string, env: Env): Promise<string> {
        const long = `/badcat/r?r=${encodeURIComponent(code)}`;
        try {
            return (await this.createLink({ path: long, kind: 'room' }, env)).url;
        } catch {
            return `${badcatPublicUrl(env)}${long}`;
        }
    }

    /** GET /badcat/room/:id: the room of a short id (any status but rejected or hidden). */
    async room(slug: string): Promise<FeedRoom | null> {
        if (!SLUG_PATTERN.test(slug || '')) return null;
        const row = (await this.store.rooms.findOne({ slug }).lean()) as any;
        if (!row || row.status === 'rejected' || row.status === 'hidden') return null;
        return feedRoom(row);
    }

    async feed(sort: unknown, cursor: unknown): Promise<FeedResponse> {
        const skip = Math.min(
            FEED_MAX_SKIP,
            Math.max(0, Number.parseInt(typeof cursor === 'string' ? cursor : '0', 36) || 0)
        );
        const order: Record<string, 1 | -1> = sort === 'top' ? { plays: -1, createdAt: -1 } : { createdAt: -1 };
        const rows = (await this.store.rooms
            .find({ feed: true, status: 'approved' })
            .sort(order)
            .skip(skip)
            .limit(FEED_PAGE + 1)
            .lean()) as any[];
        const page = rows.slice(0, FEED_PAGE).map(feedRoom);
        return {
            rooms: page,
            ...(rows.length > FEED_PAGE && skip + FEED_PAGE < FEED_MAX_SKIP
                ? { next: (skip + FEED_PAGE).toString(36) }
                : {}),
        };
    }

    async play(slug: string): Promise<{ ok: boolean }> {
        if (!SLUG_PATTERN.test(slug || '')) throw BADCAT_ERRORS.notFound();
        const res = await this.store.rooms.updateOne(
            { slug, status: { $in: ['approved', 'pending'] } },
            { $inc: { plays: 1 } }
        );
        return { ok: ((res as { matchedCount?: number }).matchedCount || 0) > 0 };
    }

    async report(slug: string, env: Env = process.env): Promise<{ ok: boolean }> {
        if (!SLUG_PATTERN.test(slug || '')) throw BADCAT_ERRORS.notFound();
        const limit = Number(env.BADCAT_FEED_REPORT_HIDE);
        const hideAt = Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 3;
        const row = (await this.store.rooms
            .findOneAndUpdate({ slug }, { $inc: { reports: 1 } }, { new: true })
            .lean()) as any;
        if (!row) throw BADCAT_ERRORS.notFound();
        if (row.reports >= hideAt && row.status === 'approved') {
            await this.store.rooms.updateOne({ _id: row._id, status: 'approved' }, { $set: { status: 'hidden' } });
        }
        return { ok: true };
    }

    // ----- admin -----

    async adminRooms(status: unknown): Promise<(FeedRoom & { status: string; reports: number; feed: boolean })[]> {
        const want = ['pending', 'approved', 'rejected', 'hidden'].includes(status as string) ? status : 'pending';
        const rows = (await this.store.rooms.find({ status: want }).sort({ createdAt: 1 }).limit(100).lean()) as any[];
        return rows.map(row => ({ ...feedRoom(row), status: row.status, reports: row.reports || 0, feed: !!row.feed }));
    }

    async reviewRoom(slug: string, decision: 'approve' | 'reject' | 'hide'): Promise<{ ok: boolean; status: string }> {
        if (!SLUG_PATTERN.test(slug || '')) throw BADCAT_ERRORS.notFound();
        const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'hidden';
        const res = await this.store.rooms.updateOne({ slug }, { $set: { status, reviewedAt: this.now() } });
        if (!((res as { matchedCount?: number }).matchedCount || 0)) throw BADCAT_ERRORS.notFound();
        return { ok: true, status };
    }
}

function feedRoom(row: any): FeedRoom {
    return {
        id: row.slug,
        code: row.code,
        title: row.title,
        author: row.author || '',
        shell: row.shell,
        props: row.props,
        plays: row.plays || 0,
        ancestors: row.ancestors || [],
        createdAt: new Date(row.createdAt || 0).toISOString(),
    };
}
