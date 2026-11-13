/*
 * Account progress blob (gap plan P2 `rewards-cloud`): the Treat Track, today's quests, the local match counters, the
 * free unlocks, the applied grant ids and the settings, so they follow the account between the web and the apps. It is
 * the cosmetic-progress store, NOT a score path: scores and every match-derived server counter are written only by
 * `POST /user/catbassadors/live`. A client can only raise its own cosmetic progress here, as it always could locally.
 *
 * The merge is a max per field, so progress only goes up whatever order devices sync in: numbers take the larger value,
 * days the later one, id lists the union (capped), and settings the newer `prefs.at` as a whole. Pure; the client
 * mirror is `pawlegends/src/meta/progressCloud.ts`.
 */

export interface ProgressBlob {
    v: 1;
    treats: { xp: number; chests: number; winDay: string | null };
    quests: { day: string | null; progress: Record<string, number>; done: string[] };
    counts: { matches: number; wins: number; firstWin: number; heroMatches: Record<string, number> };
    unlocks: string[];
    /** Server grant ids the client already applied (`lucky:<day>`, `welcome:<n>`...). */
    applied: string[];
    /** Settings, newest wins as a whole. `at` = ms of the change; 0 = never set. */
    prefs: { at: number; data: Record<string, unknown> };
}

/** The client's Treat Track step (meta/treats.ts TREAT_STEP): chests can never run ahead of the XP. */
export const TREAT_STEP = 300;
export const BLOB_LIMITS = Object.freeze({
    xp: 10_000_000,
    count: 1_000_000,
    unlocks: 400,
    applied: 200,
    questKeys: 40,
    heroes: 48,
    prefsChars: 6000,
});

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const QUEST_ID = /^[a-z0-9_]{1,24}$/;
const HERO = /^[a-z]{2,16}$/;
const ITEM = /^[A-Za-z0-9._:-]{1,80}$/;
const GRANT = /^(lucky|treat|welcome):[A-Za-z0-9:_-]{1,40}$/;
const PREF_KEY = /^[A-Za-z0-9_.-]{1,40}$/;

export function emptyBlob(): ProgressBlob {
    return {
        v: 1,
        treats: { xp: 0, chests: 0, winDay: null },
        quests: { day: null, progress: {}, done: [] },
        counts: { matches: 0, wins: 0, firstWin: 0, heroMatches: {} },
        unlocks: [],
        applied: [],
        prefs: { at: 0, data: {} },
    };
}

const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const int = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0;
const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : null);
const ids = (v: unknown, re: RegExp, cap: number) =>
    Array.isArray(v)
        ? [...new Set(v.filter((x): x is string => typeof x === 'string' && re.test(x)))].slice(0, cap)
        : [];

/** A small plain JSON value for settings: objects 5 deep at most, short strings, short arrays; anything else dropped. */
function prefValue(v: unknown, depth: number): unknown {
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') return v.length <= 80 ? v : undefined;
    if (depth >= 5) return undefined;
    if (Array.isArray(v))
        return v
            .slice(0, 20)
            .map(x => prefValue(x, depth + 1))
            .filter(x => x !== undefined);
    const o = obj(v);
    if (!o) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o).slice(0, 60)) {
        if (!PREF_KEY.test(k)) continue;
        const c = prefValue(x, depth + 1);
        if (c !== undefined) out[k] = c;
    }
    return out;
}

/** Untrusted input (a client body or a stored doc) to a valid blob. Pure. */
export function sanitizeBlob(raw: unknown): ProgressBlob {
    const b = emptyBlob();
    const o = obj(raw);
    if (!o) return b;
    const t = obj(o.treats);
    if (t) {
        b.treats.xp = int(t.xp, BLOB_LIMITS.xp);
        b.treats.chests = Math.min(int(t.chests, BLOB_LIMITS.xp), Math.floor(b.treats.xp / TREAT_STEP));
        b.treats.winDay = day(t.winDay);
    }
    const q = obj(o.quests);
    if (q && day(q.day)) {
        b.quests.day = day(q.day);
        const p = obj(q.progress);
        if (p)
            for (const [k, v] of Object.entries(p).slice(0, BLOB_LIMITS.questKeys))
                if (QUEST_ID.test(k)) b.quests.progress[k] = int(v, 1000);
        b.quests.done = ids(q.done, QUEST_ID, BLOB_LIMITS.questKeys);
    }
    const c = obj(o.counts);
    if (c) {
        b.counts.matches = int(c.matches, BLOB_LIMITS.count);
        b.counts.wins = Math.min(int(c.wins, BLOB_LIMITS.count), b.counts.matches);
        b.counts.firstWin = c.firstWin === 1 || c.firstWin === true ? 1 : 0;
        const h = obj(c.heroMatches);
        if (h)
            for (const [k, v] of Object.entries(h).slice(0, BLOB_LIMITS.heroes))
                if (HERO.test(k) && int(v, BLOB_LIMITS.count) > 0) b.counts.heroMatches[k] = int(v, BLOB_LIMITS.count);
    }
    b.unlocks = ids(o.unlocks, ITEM, BLOB_LIMITS.unlocks);
    b.applied = ids(o.applied, GRANT, 1000).slice(-BLOB_LIMITS.applied);
    const pr = obj(o.prefs);
    if (pr) {
        const data = prefValue(pr.data, 0) as Record<string, unknown> | undefined;
        let size = Infinity;
        try {
            size = JSON.stringify(data ?? {}).length;
        } catch {
            size = Infinity;
        }
        if (data && size <= BLOB_LIMITS.prefsChars) b.prefs = { at: int(pr.at, Number.MAX_SAFE_INTEGER), data };
    }
    return b;
}

const union = (a: readonly string[], b: readonly string[], cap: number) => [...new Set([...a, ...b])].slice(0, cap);
/** The newest `cap` of a union (grant ids: the server ledger keeps only recent grants, so old applied ids may go). */
const unionLast = (a: readonly string[], b: readonly string[], cap: number) => [...new Set([...a, ...b])].slice(-cap);
const maxDay = (a: string | null, b: string | null) => (!a ? b : !b ? a : a >= b ? a : b);

/** Max-merge two blobs (both already sanitized): progress only goes up. Commutative except for exact prefs ties. Pure. */
export function mergeBlobs(server: ProgressBlob, client: ProgressBlob): ProgressBlob {
    const out = emptyBlob();
    out.treats.xp = Math.max(server.treats.xp, client.treats.xp);
    out.treats.chests = Math.min(
        Math.max(server.treats.chests, client.treats.chests),
        Math.floor(out.treats.xp / TREAT_STEP)
    );
    out.treats.winDay = maxDay(server.treats.winDay, client.treats.winDay);

    const qd = maxDay(server.quests.day, client.quests.day);
    const qs = [server.quests, client.quests].filter(q => q.day === qd);
    out.quests.day = qd;
    for (const q of qs) {
        for (const [k, v] of Object.entries(q.progress))
            out.quests.progress[k] = Math.max(out.quests.progress[k] ?? 0, v);
        out.quests.done = union(out.quests.done, q.done, BLOB_LIMITS.questKeys);
    }

    out.counts.matches = Math.max(server.counts.matches, client.counts.matches);
    out.counts.wins = Math.max(server.counts.wins, client.counts.wins);
    out.counts.firstWin = Math.max(server.counts.firstWin, client.counts.firstWin);
    for (const h of [server.counts.heroMatches, client.counts.heroMatches])
        for (const [k, v] of Object.entries(h)) out.counts.heroMatches[k] = Math.max(out.counts.heroMatches[k] ?? 0, v);

    out.unlocks = union(server.unlocks, client.unlocks, BLOB_LIMITS.unlocks);
    out.applied = unionLast(server.applied, client.applied, BLOB_LIMITS.applied);
    out.prefs = client.prefs.at > server.prefs.at ? client.prefs : server.prefs;
    return out;
}
