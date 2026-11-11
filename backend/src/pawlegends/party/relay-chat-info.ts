/*
 * What the relay reads about an account for chat (CHAT-AVATARS.md §2.2, §5, §7.3): the stored age band (the store's
 * `pawlegendsbuyers` row), an active `chat_mute`, the text cooldown, the accounts it blocked and its resolved avatar.
 * Never from the client. A read error answers the safe side: unknown band (quick chat), not muted, no blocks, default
 * avatar. Relative imports only (the relay role loads it without the `src/` alias).
 */
import { resolveAvatars, type AvatarDeps } from '../social/avatar';
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
        const [buyer, sanctions, blocks, profile, avatars] = await Promise.all([
            safe<any>(() => deps.buyers.findOne({ key: `account:${accountId}` }).lean(), null),
            safe(
                () =>
                    deps.sanctions
                        .find({ accountId, kind: 'chat_mute', $or: [{ until: null }, { until: { $gt: new Date(now) } }] })
                        .lean(),
                []
            ),
            safe(() => deps.blocks.find({ blocker: accountId }).select({ blocked: 1 }).limit(BLOCKS_CAP).lean(), []),
            safe<any>(() => deps.social.findOne({ _id: accountId }).select({ chatCooldownUntil: 1 }).lean(), null),
            safe(() => resolveAvatars(deps.avatars, [accountId]), new Map()),
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
            ...(cd > now ? { cooldownUntil: cd } : {}),
        };
    };
}
