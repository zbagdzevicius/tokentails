import { createHash } from 'crypto';
import { AVATAR_IMG_RE, AvatarView, isAvatarView } from '../../shared-contracts/chat';
import { SIM_VERSION, simFor } from '../../vendor/pawlegends-sim';
import { artOf } from '../party/party-cards';

/*
 * Player avatars (CHAT-AVATARS.md §7): an icon (a champion portrait, one of the player's own Token Tails cats, or an
 * earned icon), a border (an owned frame) and an optional owned title. Stored on `pawlegendssocial` and checked on write
 * (`checkAvatarChoice`); resolved at read time (`resolveAvatars`) so a lost item (a cat transferred, a refund) falls
 * back to the default without a write. No photo uploads and no free-text titles, ever.
 */

/** The live sim's hero ids (every champion can be an avatar icon). */
export function liveHeroIds(): readonly string[] {
    const party = (simFor(SIM_VERSION) as unknown as { party?: { HERO_IDS?: readonly string[] } } | null)?.party;
    return party?.HERO_IDS ?? [];
}

export type AvatarChoice = { kind: 'hero'; hero: string } | { kind: 'cat'; catId: string } | { kind: 'icon'; icon: string };

export interface AvatarProfile {
    _id: string;
    avatar?: AvatarChoice | null;
    frame?: string | null;
    title?: string | null;
}

export interface AvatarDeps {
    social: { find(filter: Record<string, unknown>): any };
    /** `pawlegendsowned` (find only): `{accountId, item, revokedAt?}`. Absent: no frames, titles or icons. */
    owned?: { find(filter: Record<string, unknown>): any } | null;
    /** The cats model (find only): `{_id, owner, catImg}`. Absent: cat icons fall back. */
    cats?: { find(filter: Record<string, unknown>): any } | null;
    /** The live sim's hero ids. */
    heroes: readonly string[];
}

/** The default icon of an account: a stable champion picked from the account id (every hero, the default look). */
export function defaultHero(accountId: string, heroes: readonly string[]): string {
    if (!heroes.length) return 'clem';
    const h = createHash('sha256').update(String(accountId)).digest();
    return heroes[h.readUInt32BE(0) % heroes.length];
}

export const defaultAvatar = (accountId: string, heroes: readonly string[]): AvatarView => ({
    i: `h:${defaultHero(accountId, heroes)}`,
});

const ITEM_RE = /^(frame|title|icon)\.[a-z0-9._-]{1,48}$/;

async function ownedItems(deps: AvatarDeps, ids: readonly string[], items: readonly string[]) {
    const out = new Set<string>();
    if (!deps.owned || !ids.length || !items.length) return out;
    const rows = (await deps.owned
        .find({ accountId: { $in: [...ids] }, item: { $in: [...new Set(items)] }, revokedAt: { $exists: false } })
        .lean()) as Array<{ accountId: string; item: string }>;
    for (const r of rows) out.add(`${r.accountId}|${r.item}`);
    return out;
}

/** The avatars of these accounts, each checked against what the account still owns. Never throws on bad rows. */
export async function resolveAvatars(deps: AvatarDeps, idsIn: readonly string[]): Promise<Map<string, AvatarView>> {
    const out = new Map<string, AvatarView>();
    const ids = [...new Set(idsIn.filter(Boolean))];
    if (!ids.length) return out;
    let profiles: AvatarProfile[] = [];
    try {
        profiles = (await deps.social
            .find({ _id: { $in: ids } })
            .select({ avatar: 1, frame: 1, title: 1 })
            .lean()) as AvatarProfile[];
    } catch {
        profiles = [];
    }
    const byId = new Map(profiles.map(p => [String(p._id), p]));
    const items: string[] = [];
    const catIds: string[] = [];
    for (const p of profiles) {
        if (p.frame && ITEM_RE.test(p.frame)) items.push(p.frame);
        if (p.title && ITEM_RE.test(p.title)) items.push(p.title);
        if (p.avatar?.kind === 'icon' && ITEM_RE.test(`icon.${p.avatar.icon}`)) items.push(`icon.${p.avatar.icon}`);
        if (p.avatar?.kind === 'cat' && /^[a-f0-9]{24}$/i.test(p.avatar.catId)) catIds.push(p.avatar.catId);
    }
    let owned = new Set<string>();
    try {
        owned = await ownedItems(deps, ids, items);
    } catch {
        owned = new Set();
    }
    const catArt = new Map<string, { owner: string; img: string }>();
    if (catIds.length && deps.cats) {
        try {
            const cats = (await deps.cats
                .find({ _id: { $in: catIds } })
                .select({ owner: 1, catImg: 1, deletedAt: 1 })
                .lean()) as Array<{ _id: unknown; owner?: unknown; catImg?: unknown; deletedAt?: unknown }>;
            for (const c of cats) {
                const img = artOf(c.catImg);
                if (img && !c.deletedAt && AVATAR_IMG_RE.test(img))
                    catArt.set(String(c._id), { owner: String(c.owner ?? ''), img });
            }
        } catch {
            // a bad id: default icons
        }
    }
    for (const id of ids) {
        const p = byId.get(id);
        const view: AvatarView = defaultAvatar(id, deps.heroes);
        const a = p?.avatar;
        if (a?.kind === 'hero' && deps.heroes.includes(a.hero)) view.i = `h:${a.hero}`;
        else if (a?.kind === 'cat') {
            const art = catArt.get(a.catId);
            if (art && art.owner === id) {
                view.i = `c:${a.catId.toLowerCase()}`;
                view.img = art.img;
            }
        } else if (a?.kind === 'icon' && owned.has(`${id}|icon.${a.icon}`)) view.i = `i:${a.icon}`;
        if (p?.frame && owned.has(`${id}|${p.frame}`) && p.frame.startsWith('frame.')) view.f = p.frame;
        if (p?.title && owned.has(`${id}|${p.title}`) && p.title.startsWith('title.')) view.t = p.title;
        out.set(id, isAvatarView(view) ? view : defaultAvatar(id, deps.heroes));
    }
    return out;
}

export interface AvatarChoiceInput {
    avatar?: unknown;
    frame?: unknown;
    title?: unknown;
}

/**
 * Checks a `POST social/me` avatar choice for `accountId`: a hero id of the live sim, one of the caller's own cats with
 * bucket art, an owned icon, an owned frame, an owned title (null clears frame and title). Returns the `$set`, or a
 * field name that failed.
 */
export async function checkAvatarChoice(
    deps: AvatarDeps & { catById?: (id: string) => Promise<{ owner?: unknown; catImg?: unknown; deletedAt?: unknown } | null> },
    accountId: string,
    body: AvatarChoiceInput
): Promise<{ set: Record<string, unknown> } | { bad: string }> {
    const set: Record<string, unknown> = {};
    const items: string[] = [];
    if (body.avatar !== undefined) {
        const a = body.avatar as Record<string, unknown> | null;
        if (!a || typeof a !== 'object' || Array.isArray(a)) return { bad: 'avatar' };
        if (a.kind === 'hero' && typeof a.hero === 'string' && deps.heroes.includes(a.hero) && Object.keys(a).length === 2)
            set.avatar = { kind: 'hero', hero: a.hero };
        else if (a.kind === 'cat' && typeof a.catId === 'string' && /^[a-f0-9]{24}$/i.test(a.catId) && Object.keys(a).length === 2) {
            const cat = deps.catById ? await deps.catById(a.catId) : null;
            if (!cat || String(cat.owner ?? '') !== accountId || cat.deletedAt || !artOf(cat.catImg)) return { bad: 'avatar' };
            set.avatar = { kind: 'cat', catId: a.catId.toLowerCase() };
        } else if (a.kind === 'icon' && typeof a.icon === 'string' && /^[a-z0-9._-]{1,48}$/.test(a.icon) && Object.keys(a).length === 2) {
            items.push(`icon.${a.icon}`);
            set.avatar = { kind: 'icon', icon: a.icon };
        } else return { bad: 'avatar' };
    }
    for (const field of ['frame', 'title'] as const) {
        const v = body[field];
        if (v === undefined) continue;
        if (v === null) {
            set[field] = null;
            continue;
        }
        if (typeof v !== 'string' || !ITEM_RE.test(v) || !v.startsWith(`${field}.`)) return { bad: field };
        items.push(v);
        set[field] = v;
    }
    if (items.length) {
        const owned = await ownedItems(deps, [accountId], items);
        for (const item of items)
            if (!owned.has(`${accountId}|${item}`)) return { bad: item.startsWith('icon.') ? 'avatar' : item.split('.')[0] };
    }
    return { set };
}
