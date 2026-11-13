/*
 * Champion mastery (Wild Rift Honorary Medals and Omnichamp, MLBB hero proficiency, Brawl Stars Prestige): a per-hero
 * count of verified matches and wins, written only inside the `/live` save. Points are matches plus wins; levels
 * M1 to M7 at fixed thresholds. Cosmetic: it gates nothing and shows on champion cards and in the champion browser.
 * The client mirror is `pawlegends/src/meta/mastery.ts` (keep both in step).
 */

/** Points needed for M1..M7. */
export const MASTERY_STEPS: readonly number[] = Object.freeze([1, 5, 12, 25, 45, 75, 120]);
export const MASTERY_MAX = MASTERY_STEPS.length;

/** A hero id safe to use as a Mongo path segment. */
export const MASTERY_HERO = /^[a-z]{2,16}$/;

export function masteryLevel(m: number, w: number): number {
    const pts = Math.max(0, Math.floor(m)) + Math.max(0, Math.floor(w));
    let lvl = 0;
    for (const s of MASTERY_STEPS) if (pts >= s) lvl++;
    return lvl;
}

export interface MasteryRow {
    m: number;
    w: number;
    level: number;
}

/** The stored counters as the view the client reads (unknown or bad entries dropped). Pure. */
export function masteryView(raw: unknown): Record<string, MasteryRow> {
    const out: Record<string, MasteryRow> = {};
    if (!raw || typeof raw !== 'object') return out;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    for (const [hero, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!MASTERY_HERO.test(hero) || !v || typeof v !== 'object') continue;
        const m = n((v as Record<string, unknown>).m);
        const w = Math.min(m, n((v as Record<string, unknown>).w));
        if (m > 0) out[hero] = { m, w, level: masteryLevel(m, w) };
    }
    return out;
}
