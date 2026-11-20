/*
 * Player codes by account id (docs/plans/moba/PLAYER-CARD.md): a board row and an end-of-match seat carry the player's
 * code so a tap on the name opens their Player Card (`GET /pawlegends/history/u/:code`). The code is the opaque handle
 * every social route accepts (formatted like the friends list, PL-XXXX-XXXX); it is never an account id. Unknown ids
 * and profiles without a code are left out.
 */
import { formatPlayerCode } from './social.contracts';

export async function playerCodes(
    social: { find(filter: Record<string, unknown>): any },
    ids: readonly string[]
): Promise<Map<string, string>> {
    const want = [...new Set(ids)].filter(Boolean).slice(0, 120);
    if (!want.length) return new Map();
    const rows = (await social
        .find({ _id: { $in: want } })
        .select({ code: 1 })
        .lean()) as Array<{ _id: unknown; code?: unknown }>;
    return new Map(
        rows
            .filter(r => typeof r.code === 'string' && r.code)
            .map(r => [String(r._id), formatPlayerCode(r.code as string)])
    );
}

/** A public (token-less) board answer never carries codes: only a signed-in caller can open a Player Card. */
export function withoutCodes<T>(answer: T): T {
    const a = answer as unknown as { rows?: unknown };
    if (!a || typeof a !== 'object' || !Array.isArray(a.rows)) return answer;
    return {
        ...(answer as object),
        rows: a.rows.map(r => {
            if (!r || typeof r !== 'object' || !('code' in r)) return r;
            const { code: _drop, ...rest } = r as Record<string, unknown>;
            void _drop;
            return rest;
        }),
    } as T;
}
