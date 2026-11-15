/*
 * The match grade on the server (GAPS R4, docs/plans/moba/SOCIAL-RANKED.md §7.12): the S/A/B/C letter the results
 * screen shows, computed from the referee's VERIFIED per-slot stats (`room.verdict.stats`), never from the client.
 * Ranked uses it for the S-grade loss protection: an S grade in a loss costs half the points (`RANKED_GRADE.sLossShare`).
 *
 * Duplicated from the game's `pawlegends/src/meta/grade.ts` (weights, thresholds and roles); the game's
 * tests/unit/ranked-draft.test.ts deep-compares the two copies and checks that every hero has the same role here. Change
 * both. Pure: it reads only stats, so the sim, a replay and its hash are untouched (no sim change).
 */

export type Grade = 'S' | 'A' | 'B' | 'C';
export type HeroRole = 'fighter' | 'marksman' | 'assassin' | 'mage' | 'tank' | 'support';

export interface GradeWeights {
    kp: number;
    heroDmg: number;
    towerDmg: number;
    alive: number;
    taken: number;
    healShield: number;
}

export const GRADE_WEIGHTS: Readonly<{ carry: GradeWeights; tank: GradeWeights; support: GradeWeights }> =
    Object.freeze({
        carry: Object.freeze({ kp: 0.35, heroDmg: 0.25, towerDmg: 0.2, alive: 0.2, taken: 0, healShield: 0 }),
        tank: Object.freeze({ kp: 0.35, heroDmg: 0.05, towerDmg: 0.1, alive: 0.25, taken: 0.25, healShield: 0 }),
        support: Object.freeze({ kp: 0.35, heroDmg: 0.05, towerDmg: 0.1, alive: 0.25, taken: 0, healShield: 0.25 }),
    });

export const GRADE_THRESHOLDS: Readonly<Record<HeroRole, Readonly<{ S: number; A: number; B: number }>>> =
    Object.freeze({
        fighter: Object.freeze({ S: 0.588, A: 0.5, B: 0.416 }),
        marksman: Object.freeze({ S: 0.633, A: 0.548, B: 0.453 }),
        assassin: Object.freeze({ S: 0.593, A: 0.506, B: 0.418 }),
        mage: Object.freeze({ S: 0.6, A: 0.511, B: 0.432 }),
        tank: Object.freeze({ S: 0.582, A: 0.503, B: 0.424 }),
        support: Object.freeze({ S: 0.726, A: 0.65, B: 0.572 }),
    });

/** Every hero's role (pawlegends/src/data/heroes). A hero missing here grades as a fighter until it is added. */
export const HERO_ROLES: Readonly<Record<string, HeroRole>> = Object.freeze({
    clem: 'fighter',
    sage: 'marksman',
    brutus: 'tank',
    cacklejaw: 'assassin',
    lambo: 'tank',
    aviete: 'assassin',
    bengas: 'mage',
    gabe: 'support',
    meatball: 'tank',
    pixel: 'marksman',
    duchess: 'mage',
    stilts: 'assassin',
    nugget: 'support',
    marshmallow: 'mage',
    bravo: 'tank',
    chili: 'marksman',
    howler: 'fighter',
    rocket: 'marksman',
    frankie: 'assassin',
    domino: 'mage',
    mochi: 'support',
    ziggy: 'fighter',
    biscuit: 'support',
    champ: 'fighter',
});

/**
 * Ranked's use of the grade (SOCIAL-RANKED.md §7.12): an S grade in a loss loses `sLossShare` of the points (WR's Galio
 * Aegis, MLBB's star protection). Only S: the letter the results screen already shows, about 12% of matches.
 */
export const RANKED_GRADE = Object.freeze({ sLossShare: 0.5 });

/** The stats a grade reads (a subset of the sim's SlotStats; v9 results lack the last two, read as 0). */
export interface GradeStats {
    slot: number;
    hero: string;
    kills: number;
    deaths: number;
    assists: number;
    heroDamage: number;
    towerDamage: number;
    damageTaken?: number;
    healShield?: number;
}

export const roleOf = (hero: string): HeroRole => HERO_ROLES[hero] ?? 'fighter';
export const weightsFor = (role: HeroRole): GradeWeights =>
    role === 'tank' ? GRADE_WEIGHTS.tank : role === 'support' ? GRADE_WEIGHTS.support : GRADE_WEIGHTS.carry;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
type StatKey = 'kills' | 'heroDamage' | 'towerDamage' | 'damageTaken' | 'healShield';
const stat = (s: GradeStats, k: StatKey): number => {
    const v = Number(s[k] ?? 0);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
};

/** The 0..1 score of `slot` (shares are of its own team; `teamSize` 3 on the Crossing, 5 on Hearthwood). Pure. */
export function gradeScore(stats: readonly GradeStats[], slot: number, teamSize = 3): number {
    const me = stats.find(s => s.slot === slot);
    if (!me) return 0;
    const teamOf = (x: number) => (x < teamSize ? 0 : 1);
    const mates = stats.filter(s => teamOf(s.slot) === teamOf(slot));
    const sum = (k: StatKey) => mates.reduce((t, s) => t + stat(s, k), 0);
    const share = (k: Exclude<StatKey, 'kills'>) => clamp01(stat(me, k) / Math.max(1, sum(k)));
    const deaths = Math.max(0, Number(me.deaths) || 0);
    const kp = clamp01(((Number(me.kills) || 0) + (Number(me.assists) || 0)) / Math.max(1, sum('kills')));
    const w = weightsFor(roleOf(me.hero));
    return (
        w.kp * kp +
        w.heroDmg * share('heroDamage') +
        w.towerDmg * share('towerDamage') +
        w.alive * (1 - deaths / (deaths + 3)) +
        w.taken * share('damageTaken') +
        w.healShield * share('healShield')
    );
}

export function gradeOf(score: number, role: HeroRole): Grade {
    const t = GRADE_THRESHOLDS[role];
    return score >= t.S ? 'S' : score >= t.A ? 'A' : score >= t.B ? 'B' : 'C';
}

/** The letter of `slot` from the verified stats, or null when the slot has no stats row. Pure. */
export function slotGrade(stats: readonly GradeStats[] | null | undefined, slot: number, teamSize = 3): Grade | null {
    if (!Array.isArray(stats)) return null;
    const me = stats.find(s => s && s.slot === slot);
    if (!me) return null;
    return gradeOf(gradeScore(stats, slot, teamSize), roleOf(me.hero));
}

/** The share of a ranked loss this grade costs (1: all of it). Pure. */
export const lossShareOf = (grade: Grade | null): number => (grade === 'S' ? RANKED_GRADE.sLossShare : 1);
