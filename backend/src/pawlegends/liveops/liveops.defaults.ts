/*
 * Live ops (docs/plans/moba/LIVEOPS.md): the code defaults and the pure rules of `GET /pawlegends/config`. A Mongo doc
 * (`pawlegendsliveopsconfig`, `_id: 'live'`) may override the goal, the vote, Winter Nap and the featured mode; every
 * field it sets is checked here and a bad field falls back to the default, so a typo never takes the Events list down.
 * The baked-in weekly rotation is the featured mode when the doc names none.
 *
 * Rewards are existing palette coats only (the game's render/cosmetics.ts FREE_COATS ids): no new art, no price, no
 * random reward. Days are UTC days (`YYYY-MM-DD`).
 */

export const LIVEOPS_GOAL_METRICS = ['matches', 'wins', 'takedowns'] as const;
export type LiveopsGoalMetric = typeof LIVEOPS_GOAL_METRICS[number];

export interface LiveopsGoalDef {
    id: string;
    label: string;
    metric: LiveopsGoalMetric;
    target: number;
    /** A palette coat id (`coat.<hero>.<key>`). */
    rewardItem: string;
    rewardName: string;
    startsAt: string;
    endsAt: string;
}

export interface LiveopsVoteOption {
    id: 'a' | 'b';
    name: string;
    hero: string;
    /** Three `#rrggbb` swatches: the concept's base, light and accent. */
    colors: string[];
}

export interface LiveopsVoteDef {
    id: string;
    question: string;
    options: LiveopsVoteOption[];
    startsAt: string;
    endsAt: string;
}

export interface LiveopsGift {
    /** The gift for the n-th day played (1-based). */
    day: number;
    item: string;
    name: string;
}

export interface LiveopsNapDef {
    id: string;
    name: string;
    /** First UTC day (inclusive) and the end instant (exclusive). */
    startsAt: string;
    endsAt: string;
    gifts: LiveopsGift[];
}

export interface LiveopsFeatured {
    id: string;
    endsAt: string;
}

export interface LiveopsEvent {
    id: string;
    kind: 'mode' | 'goal' | 'nap' | 'vote';
    title: string;
    sub: string;
    startsAt: string;
    endsAt: string;
    mode?: string;
}

/**
 * Sim v27 (docs/plans/moba/V27.md §4): the week's twist, a rule set (a sim mutator) played on the Crossing vs bots
 * from the "Weekly Twist" tile. `id` is one of the game sim's WEEKLY_TWISTS.
 */
export interface LiveopsTwist {
    id: LiveopsTwistId;
    name: string;
    rules: string[];
    endsAt: string;
}

export interface LiveopsDefs {
    goal: LiveopsGoalDef | null;
    vote: LiveopsVoteDef | null;
    nap: LiveopsNapDef | null;
    featuredMode: LiveopsFeatured | null;
    featuredQuests: string[];
    twist: LiveopsTwist | null;
}

/** Sim v27: the weekly twists, in the baked rotation's order (the sim's WEEKLY_TWISTS, pawlegends/src/sim/api.ts). */
export const WEEKLY_TWISTS = ['toybox', 'rapid', 'bounty'] as const;
export type LiveopsTwistId = typeof WEEKLY_TWISTS[number];
/** Each twist's tile name and its two rule lines (the game shows them in the mode's "i" popover). */
export const TWIST_INFO: Readonly<Record<LiveopsTwistId, { name: string; rules: string[] }>> = Object.freeze({
    toybox: {
        name: 'Toy Box',
        rules: ['Fish comes twice as fast, so Toys arrive sooner.', 'Frenzy Catnip and Fish Snacks spawn twice as often.'],
    },
    rapid: { name: 'Rapid Paws', rules: ['Every ability and Paw Trick cools down 40% faster.'] },
    bounty: {
        name: 'Bounty Hunt',
        rules: ['A hero on a takedown streak is worth three times the bounty.', 'Ending a streak pays three times the Fish.'],
    },
});

/** The modes the baked rotation features, one per ISO week (live modes only: never Ranked or a coming-soon mode). */
export const FEATURED_ROTATION: readonly string[] = Object.freeze(['blitz', 'skirmish', 'classic']);
/** The modes a config doc may feature: the rotation's, plus sim v27's Weekly Twist tile. */
export const FEATURABLE: readonly string[] = Object.freeze([...FEATURED_ROTATION, 'twist']);
export const MODE_NAMES: Readonly<Record<string, string>> = Object.freeze({
    blitz: 'Blitz',
    skirmish: 'Skirmish',
    classic: 'Classic 5v5',
    twist: 'Weekly Twist',
});

export const DEFAULT_GOAL: LiveopsGoalDef = Object.freeze({
    id: 'g1-paws-together',
    label: 'Play 2,000 matches together',
    metric: 'matches',
    target: 2000,
    rewardItem: 'coat.clem.loop.honey',
    rewardName: 'Honey coat for Clem',
    startsAt: '2026-11-13T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
}) as LiveopsGoalDef;

export const DEFAULT_VOTE: LiveopsVoteDef = Object.freeze({
    id: 'v1-winter-coat',
    question: 'Which coat should we make next?',
    options: [
        { id: 'a', name: 'Aurora Frost', hero: 'sage', colors: ['#8fc8ff', '#eef6ff', '#9be3c4'] },
        { id: 'b', name: 'Candy Cane', hero: 'brutus', colors: ['#ff3d7f', '#fff3e3', '#c8102e'] },
    ],
    startsAt: '2026-11-13T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
}) as LiveopsVoteDef;

/** Winter Nap, Dec 15 – Jan 4 (UTC): the n-th day played opens gift n; a missed day never resets it. */
export const DEFAULT_NAP: LiveopsNapDef = Object.freeze({
    id: 'nap-2026',
    name: 'Winter Nap',
    startsAt: '2026-12-15T00:00:00.000Z',
    endsAt: '2027-01-05T00:00:00.000Z',
    gifts: [
        { day: 1, item: 'coat.sage.loop.slate', name: 'Slate coat for Sage' },
        { day: 2, item: 'coat.brutus.loop.ink', name: 'Ink coat for Brutus' },
        { day: 3, item: 'coat.pixel.loop.coral', name: 'Coral coat for Pixel' },
        { day: 4, item: 'coat.meatball.loop.cocoa', name: 'Cocoa coat for Meatball' },
        { day: 5, item: 'coat.duchess.loop.plum', name: 'Plum coat for Duchess' },
        { day: 6, item: 'coat.marshmallow.loop.peach', name: 'Peach coat for Marshmallow' },
        { day: 7, item: 'coat.cacklejaw.frost', name: 'Frost coat for Cacklejaw' },
    ],
}) as LiveopsNapDef;

const DAY = 86_400_000;
const COAT = /^coat\.[a-z]{2,16}\.[a-z0-9._-]{1,40}$/;
const ID = /^[a-z0-9-]{1,40}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const MODE = /^[a-z0-9-]{1,24}$/;

/** `YYYY-MM-DD` of a UTC instant. Pure. */
export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

const iso = (v: unknown): string | null => {
    if (typeof v !== 'string' && !(v instanceof Date)) return null;
    const t = new Date(v as string).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const text = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim().length >= 1 && v.length <= max ? v.trim() : null;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Is `now` inside [startsAt, endsAt)? Pure. */
export const within = (w: { startsAt: string; endsAt: string }, now: Date): boolean =>
    now.getTime() >= Date.parse(w.startsAt) && now.getTime() < Date.parse(w.endsAt);

/** The Monday 00:00 UTC that starts the ISO week after `now`. Pure. */
export function nextMonday(now: Date): Date {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = (d.getUTCDay() + 6) % 7; // Monday 0
    return new Date(d.getTime() + (7 - dow) * DAY);
}

/** The baked rotation: one live mode per ISO week, ending Monday 00:00 UTC. Pure. */
export function rotationFeatured(now: Date): LiveopsFeatured {
    const end = nextMonday(now);
    const weeks = Math.floor(end.getTime() / (7 * DAY));
    return { id: FEATURED_ROTATION[weeks % FEATURED_ROTATION.length], endsAt: end.toISOString() };
}

/** Sim v27: the baked twist rotation, one twist per ISO week ending Monday 00:00 UTC. Pure. */
export function rotationTwist(now: Date): LiveopsTwist {
    const end = nextMonday(now);
    const weeks = Math.floor(end.getTime() / (7 * DAY));
    const id = WEEKLY_TWISTS[weeks % WEEKLY_TWISTS.length];
    return { id, ...TWIST_INFO[id], endsAt: end.toISOString() };
}

/** A config doc's `twist` (`{ id, endsAt }`): a known twist that has not ended yet, else null. Pure. */
export function cleanTwist(v: unknown, now: Date): LiveopsTwist | null {
    if (!isRecord(v) || typeof v.id !== 'string' || !(WEEKLY_TWISTS as readonly string[]).includes(v.id)) return null;
    const endsAt = iso(v.endsAt);
    if (!endsAt || Date.parse(endsAt) <= now.getTime()) return null;
    const id = v.id as LiveopsTwistId;
    return { id, ...TWIST_INFO[id], endsAt };
}

export function cleanGoal(v: unknown): LiveopsGoalDef | null {
    if (!isRecord(v)) return null;
    const id = typeof v.id === 'string' && ID.test(v.id) ? v.id : null;
    const label = text(v.label, 60);
    const metric = (LIVEOPS_GOAL_METRICS as readonly string[]).includes(v.metric as string)
        ? (v.metric as LiveopsGoalMetric)
        : null;
    const target =
        typeof v.target === 'number' && Number.isInteger(v.target) && v.target >= 1 && v.target <= 1e9
            ? v.target
            : null;
    const rewardItem = typeof v.rewardItem === 'string' && COAT.test(v.rewardItem) ? v.rewardItem : null;
    const rewardName = text(v.rewardName, 60);
    const startsAt = iso(v.startsAt);
    const endsAt = iso(v.endsAt);
    if (!id || !label || !metric || !target || !rewardItem || !rewardName || !startsAt || !endsAt) return null;
    if (Date.parse(endsAt) <= Date.parse(startsAt)) return null;
    return { id, label, metric, target, rewardItem, rewardName, startsAt, endsAt };
}

export function cleanVote(v: unknown): LiveopsVoteDef | null {
    if (!isRecord(v) || !Array.isArray(v.options) || v.options.length !== 2) return null;
    const id = typeof v.id === 'string' && ID.test(v.id) ? v.id : null;
    const question = text(v.question, 80);
    const startsAt = iso(v.startsAt);
    const endsAt = iso(v.endsAt);
    const options: LiveopsVoteOption[] = [];
    for (const [i, o] of v.options.entries()) {
        if (!isRecord(o)) return null;
        const name = text(o.name, 32);
        const hero = typeof o.hero === 'string' && /^[a-z]{2,16}$/.test(o.hero) ? o.hero : null;
        const colors = Array.isArray(o.colors) ? o.colors.filter(c => typeof c === 'string' && HEX.test(c)) : [];
        if (!name || !hero || colors.length !== 3) return null;
        options.push({ id: i === 0 ? 'a' : 'b', name, hero, colors: colors as string[] });
    }
    if (!id || !question || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
    return { id, question, options, startsAt, endsAt };
}

export function cleanNap(v: unknown): LiveopsNapDef | null {
    if (!isRecord(v) || !Array.isArray(v.gifts) || v.gifts.length < 1 || v.gifts.length > 21) return null;
    const id = typeof v.id === 'string' && ID.test(v.id) ? v.id : null;
    const name = text(v.name, 32);
    const startsAt = iso(v.startsAt);
    const endsAt = iso(v.endsAt);
    const gifts: LiveopsGift[] = [];
    for (const [i, g] of v.gifts.entries()) {
        if (!isRecord(g) || typeof g.item !== 'string' || !COAT.test(g.item)) return null;
        const gn = text(g.name, 60);
        if (!gn) return null;
        gifts.push({ day: i + 1, item: g.item, name: gn });
    }
    if (!id || !name || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
    return { id, name, startsAt, endsAt, gifts };
}

export function cleanFeatured(v: unknown, now: Date): LiveopsFeatured | null {
    if (!isRecord(v) || typeof v.id !== 'string' || !MODE.test(v.id)) return null;
    if (!FEATURABLE.includes(v.id)) return null;
    const endsAt = iso(v.endsAt);
    if (!endsAt || Date.parse(endsAt) <= now.getTime()) return null;
    return { id: v.id, endsAt };
}

/**
 * The definitions in force: the doc's valid fields over the code defaults. A doc field set to `null` turns that
 * piece off (no goal, no vote); a missing or invalid one keeps the default. Pure.
 */
export function resolveDefs(doc: Record<string, unknown> | null | undefined, now: Date): LiveopsDefs {
    const d = doc ?? {};
    const pick = <T>(key: string, clean: (v: unknown) => T | null, fallback: T): T | null => {
        if (!(key in d)) return fallback;
        if (d[key] === null) return null;
        return clean(d[key]) ?? fallback;
    };
    const quests = Array.isArray(d.featuredQuests)
        ? (d.featuredQuests as unknown[])
              .map(q => text(q, 60))
              .filter((q): q is string => !!q)
              .slice(0, 3)
        : [];
    // Sim v27: the week's twist is the featured mode (a doc's `featuredMode` still wins; `twist: null` turns it off and
    // the baked mode rotation comes back). A doc's `featuredMode: 'twist'` with no twist falls back too.
    const twist = 'twist' in d && d.twist === null ? null : cleanTwist(d.twist, now) ?? rotationTwist(now);
    const featured = cleanFeatured(d.featuredMode, now);
    return {
        goal: pick('goal', cleanGoal, DEFAULT_GOAL),
        vote: pick('vote', cleanVote, DEFAULT_VOTE),
        nap: pick('nap', cleanNap, DEFAULT_NAP),
        featuredMode:
            (featured && (featured.id !== 'twist' || twist) ? featured : null) ??
            (twist ? { id: 'twist', endsAt: twist.endsAt } : rotationFeatured(now)),
        featuredQuests: quests,
        twist,
    };
}

const DATE_FMT = (s: string): string =>
    new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The Events calendar rows, soonest first; past windows are dropped. Pure. */
export function eventsOf(defs: LiveopsDefs, now: Date): LiveopsEvent[] {
    const out: LiveopsEvent[] = [];
    const t = now.getTime();
    if (defs.featuredMode) {
        out.push({
            id: `mode-${defs.featuredMode.id}`,
            kind: 'mode',
            mode: defs.featuredMode.id,
            title:
                defs.featuredMode.id === 'twist' && defs.twist
                    ? `Weekly Twist: ${defs.twist.name}`
                    : `Featured: ${MODE_NAMES[defs.featuredMode.id] ?? defs.featuredMode.id}`,
            sub: `Until ${DATE_FMT(defs.featuredMode.endsAt)}`,
            startsAt: new Date(Date.parse(defs.featuredMode.endsAt) - 7 * DAY).toISOString(),
            endsAt: defs.featuredMode.endsAt,
        });
    }
    if (defs.goal && Date.parse(defs.goal.endsAt) > t)
        out.push({
            id: defs.goal.id,
            kind: 'goal',
            title: defs.goal.label,
            sub: `Until ${DATE_FMT(defs.goal.endsAt)}`,
            startsAt: defs.goal.startsAt,
            endsAt: defs.goal.endsAt,
        });
    if (defs.vote && Date.parse(defs.vote.endsAt) > t)
        out.push({
            id: defs.vote.id,
            kind: 'vote',
            title: 'Fan vote',
            sub: `Until ${DATE_FMT(defs.vote.endsAt)}`,
            startsAt: defs.vote.startsAt,
            endsAt: defs.vote.endsAt,
        });
    if (defs.nap && Date.parse(defs.nap.endsAt) > t)
        out.push({
            id: defs.nap.id,
            kind: 'nap',
            title: defs.nap.name,
            sub: `${DATE_FMT(defs.nap.startsAt)} – ${DATE_FMT(
                new Date(Date.parse(defs.nap.endsAt) - 1).toISOString()
            )}`,
            startsAt: defs.nap.startsAt,
            endsAt: defs.nap.endsAt,
        });
    return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The community goal's share of one verified match. A forfeit adds nothing. Pure. */
export function goalAmount(
    metric: LiveopsGoalMetric,
    m: { won: boolean; forfeit: boolean; takedowns: number }
): number {
    if (m.forfeit) return 0;
    if (metric === 'matches') return 1;
    if (metric === 'wins') return m.won ? 1 : 0;
    return Math.max(0, Math.min(60, Math.floor(m.takedowns)));
}

/** The Winter Nap gifts a player has earned: one per distinct UTC day played inside the window, never reset. Pure. */
export function napEarned(nap: LiveopsNapDef, days: readonly string[]): number {
    const first = nap.startsAt.slice(0, 10);
    const last = utcDay(new Date(Date.parse(nap.endsAt) - 1));
    const n = new Set(days.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= first && d <= last)).size;
    return Math.min(n, nap.gifts.length);
}
