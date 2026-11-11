/*
 * The map-hack score (SOCIAL-RANKED.md §9.3), pure. The referee counts, per human slot of a PvP room, the attack and
 * cast commands (`acts`), those aimed at an enemy hero hidden from the slot's team for at least 1 s (`hid`), and those
 * sent while such a hidden hero stood within 9 m (`opp`, the honest bush-guess denominator). The relay stores the
 * counts on the mm room member (`intel`). Moderators see the z-score; players never do; nothing acts on it.
 */

export interface MemberIntel {
    acts: number;
    hid: number;
    opp: number;
    /** The hero the slot played (the baseline is per hero). */
    hero?: string;
}

export interface IntelRoom {
    members: Array<{ accountId: string | null; intel?: MemberIntel | null }>;
}

export const INTEL = Object.freeze({
    lastRooms: 20,
    baselineMinRooms: 5,
    /** Below this many opportunities in total, no score (too little signal). */
    minOpp: 10,
});

const rate = (hid: number, opp: number) => hid / Math.max(1, opp);

/** Per hero sums of one account over its rooms (newest first; at most the last 20 with intel). */
export function accountIntel(
    rooms: readonly IntelRoom[],
    accountId: string
): Map<string, { hid: number; opp: number; rooms: number }> {
    const out = new Map<string, { hid: number; opp: number; rooms: number }>();
    let n = 0;
    for (const room of rooms) {
        const m = room.members.find(x => x.accountId === accountId && x.intel);
        if (!m?.intel) continue;
        const hero = m.intel.hero || '?';
        const s = out.get(hero) ?? { hid: 0, opp: 0, rooms: 0 };
        s.hid += m.intel.hid;
        s.opp += m.intel.opp;
        s.rooms += 1;
        out.set(hero, s);
        if (++n >= INTEL.lastRooms) break;
    }
    return out;
}

export interface HeroBaseline {
    mean: number;
    sd: number;
    accounts: number;
}

/** Mean and SD of the per-account rate per hero, among accounts with at least 5 rooms on that hero. */
export function heroBaselines(rooms: readonly IntelRoom[]): Map<string, HeroBaseline> {
    const per = new Map<string, Map<string, { hid: number; opp: number; rooms: number }>>();
    for (const room of rooms)
        for (const m of room.members) {
            if (!m.accountId || !m.intel) continue;
            const hero = m.intel.hero || '?';
            const byAcc = per.get(hero) ?? new Map();
            const s = byAcc.get(m.accountId) ?? { hid: 0, opp: 0, rooms: 0 };
            s.hid += m.intel.hid;
            s.opp += m.intel.opp;
            s.rooms += 1;
            byAcc.set(m.accountId, s);
            per.set(hero, byAcc);
        }
    const out = new Map<string, HeroBaseline>();
    for (const [hero, byAcc] of per) {
        const rates = [...byAcc.values()].filter(s => s.rooms >= INTEL.baselineMinRooms).map(s => rate(s.hid, s.opp));
        if (rates.length < 2) continue;
        const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
        const sd = Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / (rates.length - 1));
        out.set(hero, { mean, sd, accounts: rates.length });
    }
    return out;
}

/** The opp-weighted z over the heroes played; null without a baseline or with too little signal. */
export function intelZ(
    mine: Map<string, { hid: number; opp: number; rooms: number }>,
    baselines: Map<string, HeroBaseline>
): { z: number | null; matches: number; hid: number; opp: number } {
    let wz = 0;
    let w = 0;
    let matches = 0;
    let hid = 0;
    let opp = 0;
    for (const [hero, s] of mine) {
        matches += s.rooms;
        hid += s.hid;
        opp += s.opp;
        const b = baselines.get(hero);
        if (!b || s.opp <= 0) continue;
        // a floor on the SD keeps a near-constant population from turning noise into a huge z
        const sd = Math.max(b.sd, 0.02);
        wz += ((rate(s.hid, s.opp) - b.mean) / sd) * s.opp;
        w += s.opp;
    }
    const z = w > 0 && opp >= INTEL.minOpp ? Math.round((wz / w) * 100) / 100 : null;
    return { z, matches, hid, opp };
}
