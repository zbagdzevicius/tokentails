/*
 * What the relay reads about an account for chat (CHAT-AVATARS.md §2.2, §5, §7.3): the stored age band (the store's
 * `pawlegendsbuyers` row), an active `chat_mute`, the text cooldown, the accounts it blocked, its resolved avatar and its
 * chosen name (a nickname or cat name; absent on the generated name), and the profile rev it was read at.
 * Never from the client. A read error answers the safe side: unknown band (quick chat), not muted, no blocks, default
 * avatar. Relative imports only (the relay role loads it without the `src/` alias).
 */
import { resolveAvatars, type AvatarDeps } from '../social/avatar';
import { chosenNames } from '../social/display-name';
import { BLOCKS_CAP } from '../social/social.contracts';
import type { RelayChatInfo } from './party-relay';

type Model = { findOne(f: Record<string, unknown>): any; find(f: Record<string, unknown>): any };

export interface RelayChatInfoDeps {
    buyers: Model;
    sanctions: Model;
    blocks: Model;
    social: Model;
    avatars: AvatarDeps;
    now?: () => number;
}

const BANDS = new Set(['under16', '16-17', '18+']);

export function relayChatInfo(deps: RelayChatInfoDeps) {
    return async (accountId: string): Promise<RelayChatInfo> => {
        const now = deps.now?.() ?? Date.now();
        const safe = async <T>(p: () => Promise<T>, fallback: T): Promise<T> => {
            try {
                return await p();
            } catch {
                return fallback;
            }
        };
        const [buyer, sanctions, blocks, profile, avatars, names] = await Promise.all([
            safe<any>(() => deps.buyers.findOne({ key: `account:${accountId}` }).lean(), null),
            safe(
                () =>
                    deps.sanctions
                        .find({
                            accountId,
                            kind: 'chat_mute',
                            $or: [{ until: null }, { until: { $gt: new Date(now) } }],
                        })
                        .lean(),
                []
            ),
            safe(() => deps.blocks.find({ blocker: accountId }).select({ blocked: 1 }).limit(BLOCKS_CAP).lean(), []),
            safe<any>(
                () => deps.social.findOne({ _id: accountId }).select({ chatCooldownUntil: 1, rev: 1 }).lean(),
                null
            ),
            safe(() => resolveAvatars(deps.avatars, [accountId]), new Map()),
            safe(() => chosenNames({ social: deps.social, cats: deps.avatars.cats ?? null }, [accountId]), new Map()),
        ]);
        const band = BANDS.has(buyer?.ageBand) ? buyer.ageBand : null;
        const rows = (sanctions ?? []) as Array<{ until: Date | null }>;
        const muted = !rows.length
            ? false
            : rows.some(r => !r.until)
            ? null
            : Math.max(...rows.map(r => new Date(r.until as Date).getTime()));
        const cd = profile?.chatCooldownUntil ? new Date(profile.chatCooldownUntil).getTime() : 0;
        return {
            band,
            muted,
            blocked: ((blocks ?? []) as Array<{ blocked: string }>).map(b => String(b.blocked)),
            ...(avatars.get(accountId) ? { av: avatars.get(accountId) } : {}),
            ...(names.get(accountId) ? { name: names.get(accountId) } : {}),
            ...(cd > now ? { cooldownUntil: cd } : {}),
            // the relay's name watch reads the chat side again when the profile's rev moves (a rename)
            ...(typeof profile?.rev === 'number' ? { rev: profile.rev } : {}),
        };
    };
}

/** The social profiles' current `rev` (the relay's name watch, NAME_WATCH_MS): one read, missing rows are absent. */
export function relaySocialRevs(social: Model) {
    return async (ids: string[]): Promise<Map<string, number>> => {
        const out = new Map<string, number>();
        if (!ids.length) return out;
        const rows = (await social
            .find({ _id: { $in: ids } })
            .select({ rev: 1 })
            .lean()) as Array<{ _id: unknown; rev?: number }>;
        for (const r of rows) out.set(String(r._id), typeof r.rev === 'number' ? r.rev : 0);
        return out;
    };
}
