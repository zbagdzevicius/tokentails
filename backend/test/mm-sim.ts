/*
 * Quick Play queue simulation (docs/plans/moba/M1A-IMPL.md §9.5): Poisson arrivals through the real Matchmaker on a
 * fake clock. 30 % duos, sides 40 % either / 35 % cats / 25 % dogs, ratings N(1450, 200), 2 hours per rate. Prints
 * p50, p95 and max wait and the humans-per-match histogram per rate; exits non-zero unless p50 <= 15 s and
 * p95 <= 30.5 s at every rate and >= 60 % of matches seat >= 2 humans at >= 20 joins per minute.
 *
 *   npx ts-node --transpile-only test/mm-sim.ts
 */
import { Matchmaker, type MmEntry, type MmSideChoice } from '../src/pawlegends/mm/matchmaker';
import { BOT_RATING } from '../src/pawlegends/mm/casual';
import { MM_CASUAL, MM_LIMITS } from '../src/pawlegends/mm/mm-limits';

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface SimResult {
    rate: number;
    p50: number;
    p95: number;
    max: number;
    matches: number;
    humans: [number, number, number];
}

export function simulate(perMin: number, hours = 2, seed = 7): SimResult {
    const rand = rng(seed + Math.round(perMin * 1000));
    const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    let now = 0;
    let n = 0;
    const mm = new Matchmaker(
        () => now,
        () => `id${(++n).toString(36).padStart(10, '0')}`.slice(-12)
    );
    const endMs = hours * 3600_000;
    const tick = MM_LIMITS.tickMs;
    // arrivals of player units (an entry is a solo or a duo)
    let nextArrival = (-Math.log(rand() || 1e-9) / perMin) * 60_000;
    const waits: number[] = [];
    const humans: [number, number, number] = [0, 0, 0];
    let people = 0;
    while (now < endMs) {
        while (nextArrival <= now) {
            const duo = rand() < 0.3;
            const r = rand();
            const side: MmSideChoice = r < 0.4 ? 'any' : r < 0.75 ? 'cat' : 'dog';
            const members = Array.from({ length: duo ? 2 : 1 }, () => {
                const k = `acct:p${++people}`;
                return {
                    member: k,
                    identityKey: k,
                    accountId: k,
                    ipKey: k,
                    netKey: k,
                    rating: { r: 1450 + 200 * normal(), rd: rand() < 0.3 ? 320 : 120 },
                    newbie: rand() < 0.2,
                    maxDifficulty: null,
                };
            });
            const e: MmEntry = {
                id: `e${people}`,
                partyId: duo ? `p${people}` : null,
                members,
                queue: 'coop',
                side,
                region: 'eu',
                sim: '14:x',
                enqueuedMs: nextArrival,
                notBeforeMs: 0,
                awaySinceMs: null,
            };
            mm.join(e);
            // a duo counts as one arrival of a party unit; the rate is joins of units per minute
            nextArrival += (-Math.log(rand() || 1e-9) / perMin) * 60_000;
        }
        now += tick;
        const t = mm.tick();
        for (const m of t.matches) {
            humans[m.humans - 1]++;
            for (const id of m.entries) waits.push(m.waitedMs[id]);
        }
    }
    waits.sort((a, b) => a - b);
    const q = (p: number) => (waits.length ? waits[Math.min(waits.length - 1, Math.floor(waits.length * p))] : 0);
    return {
        rate: perMin,
        p50: q(0.5),
        p95: q(0.95),
        max: waits[waits.length - 1] ?? 0,
        matches: humans[0] + humans[1] + humans[2],
        humans,
    };
}

export const RATES = [0.25, 0.5, 1, 2, 4, 6, 10, 20, 60];

export function verdict(results: SimResult[]): string[] {
    const fails: string[] = [];
    for (const r of results) {
        if (r.p50 > 15_000) fails.push(`rate ${r.rate}/min: p50 ${r.p50} ms > 15000`);
        if (r.p95 > 30_500) fails.push(`rate ${r.rate}/min: p95 ${r.p95} ms > 30500`);
        if (r.rate >= 20 && r.matches && (r.humans[1] + r.humans[2]) / r.matches < 0.6)
            fails.push(
                `rate ${r.rate}/min: ${(((r.humans[1] + r.humans[2]) / r.matches) * 100).toFixed(
                    0
                )} % of matches with >= 2 humans < 60 %`
            );
    }
    return fails;
}

// -------------------------------------------------------------------------------------------------------------------
// Casual PvP (docs/plans/moba/V16.md §4.6): solos 70 %, duos 20 %, trios 10 %; every unit queues casual; a unit with no
// opponent moves to co-op at the switch and is seated there. The wait is to the first seat, casual or co-op.

export interface CasualSimResult {
    rate: number;
    p50: number;
    p95: number;
    max: number;
    matches: number;
    /** Casual matches with at least 4 humans, and with a predicted win chance inside 40..60 % (human-only ones). */
    fourPlus: number;
    humanOnly: number;
    fair: number;
    /** Every casual match (bots counted at their level) predicted inside `MM_CASUAL.fairAfter`. */
    boundedAll: number;
    /** Casual matches whose two teams got different bot levels (must stay 0). */
    botSplit: number;
    /** Units seated in co-op after the switch. */
    toCoop: number;
}

export function simulateCasual(perMin: number, hours = 2, seed = 11): CasualSimResult {
    const rand = rng(seed + Math.round(perMin * 1000));
    const normal = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
    let now = 0;
    let n = 0;
    const mm = new Matchmaker(
        () => now,
        () => `id${(++n).toString(36).padStart(10, '0')}`.slice(-12)
    );
    const endMs = hours * 3600_000;
    let nextArrival = (-Math.log(rand() || 1e-9) / perMin) * 60_000;
    const waits: number[] = [];
    let people = 0;
    let matches = 0;
    let fourPlus = 0;
    let humanOnly = 0;
    let fair = 0;
    let boundedAll = 0;
    let botSplit = 0;
    let toCoop = 0;
    const rating = new Map<string, number>();
    while (now < endMs) {
        while (nextArrival <= now) {
            const r0 = rand();
            const size = r0 < 0.7 ? 1 : r0 < 0.9 ? 2 : 3;
            const r = rand();
            const side: MmSideChoice = r < 0.5 ? 'any' : r < 0.78 ? 'cat' : 'dog';
            const members = Array.from({ length: size }, () => {
                const k = `acct:p${++people}`;
                const rr = 1450 + 200 * normal();
                rating.set(k, rr);
                return {
                    member: k,
                    identityKey: k,
                    accountId: k,
                    ipKey: k,
                    netKey: k,
                    rating: { r: rr, rd: rand() < 0.1 ? 280 : 120 },
                    newbie: false,
                    maxDifficulty: null,
                };
            });
            mm.join({
                id: `e${people}`,
                partyId: size > 1 ? `p${people}` : null,
                members,
                queue: 'casual',
                side,
                region: 'eu',
                sim: '16:x',
                enqueuedMs: nextArrival,
                notBeforeMs: 0,
                awaySinceMs: null,
            });
            nextArrival += (-Math.log(rand() || 1e-9) / perMin) * 60_000;
        }
        now += MM_LIMITS.tickMs;
        const t = mm.tick();
        for (const m of t.matches) {
            for (const id of m.entries) waits.push(m.waitedMs[id]);
            if (m.mode !== 'casual') {
                toCoop += m.entries.length;
                continue;
            }
            matches++;
            if (m.humans >= 4) fourPlus++;
            const [t0, t1] = m.teams!;
            if (t0.difficulty !== t1.difficulty) botSplit++;
            const eff = (t: typeof t0) => (t.rating * t.humans + t.bots * BOT_RATING[t.difficulty]) / 3;
            const pAll = 1 / (1 + Math.pow(10, (eff(t1) - eff(t0)) / 400));
            if (pAll >= MM_CASUAL.fairAfter[0] - 1e-9 && pAll <= MM_CASUAL.fairAfter[1] + 1e-9) boundedAll++;
            if (m.humans === 6) {
                humanOnly++;
                const p = 1 / (1 + Math.pow(10, (m.teams![1].rating - m.teams![0].rating) / 400));
                if (p >= 0.4 && p <= 0.6) fair++;
            }
        }
    }
    waits.sort((a, b) => a - b);
    const q = (p: number) => (waits.length ? waits[Math.min(waits.length - 1, Math.floor(waits.length * p))] : 0);
    return {
        rate: perMin,
        p50: q(0.5),
        p95: q(0.95),
        max: waits[waits.length - 1] ?? 0,
        matches,
        fourPlus,
        humanOnly,
        fair,
        boundedAll,
        botSplit,
        toCoop,
    };
}

export const CASUAL_RATES = [0.25, 0.5, 1, 2, 4, 6, 10, 20, 60, 120];

/**
 * The casual gates: every unit seated (casual or co-op) by the switch plus its grace (p95 and max <= 45.5 s) at every
 * rate; p50 < 30 s once a pool is busy enough for PvP (>= 6 joins per minute: below it most units have no opponent
 * within the 30 s fill and seat in co-op at 45 s by design); at >= 60 joins per minute >= 70 % of casual matches seat
 * >= 4 humans and p50 < 20 s; from 20 joins per minute (where human-only matches are common) >= 80 % of them are
 * predicted inside 40..60 %.
 */
export function casualVerdict(results: CasualSimResult[]): string[] {
    const fails: string[] = [];
    const seatBy = MM_CASUAL.switchMs + MM_CASUAL.switchGraceMs + 500;
    for (const r of results) {
        if (r.p95 > seatBy) fails.push(`casual ${r.rate}/min: p95 ${r.p95} ms > ${seatBy}`);
        if (r.max > seatBy + 500) fails.push(`casual ${r.rate}/min: max ${r.max} ms > ${seatBy + 500}`);
        if (r.rate >= 6 && r.p50 > 30_500) fails.push(`casual ${r.rate}/min: p50 ${r.p50} ms > 30500`);
        if (r.rate >= 60 && r.matches && r.fourPlus / r.matches < 0.7)
            fails.push(
                `casual ${r.rate}/min: ${((r.fourPlus / r.matches) * 100).toFixed(0)} % with >= 4 humans < 70 %`
            );
        if (r.rate >= 60 && r.p50 >= 20_000) fails.push(`casual ${r.rate}/min: p50 ${r.p50} ms >= 20000`);
        if (r.boundedAll !== r.matches)
            fails.push(
                `casual ${r.rate}/min: ${r.matches - r.boundedAll} matches predicted outside ${MM_CASUAL.fairAfter.join(
                    '..'
                )}`
            );
        if (r.botSplit) fails.push(`casual ${r.rate}/min: ${r.botSplit} matches with different bot levels per team`);
        if (r.rate >= 20 && r.humanOnly >= 20 && r.fair / r.humanOnly < 0.8)
            fails.push(`casual ${r.rate}/min: ${((r.fair / r.humanOnly) * 100).toFixed(0)} % fair < 80 %`);
    }
    return fails;
}

if (require.main === module && process.argv.includes('--casual')) {
    const results = CASUAL_RATES.map(r => simulateCasual(r));
    for (const r of results)
        console.log(
            `${String(r.rate).padStart(5)}/min  p50 ${(r.p50 / 1000).toFixed(1).padStart(5)} s  p95 ${(r.p95 / 1000)
                .toFixed(1)
                .padStart(5)} s  max ${(r.max / 1000).toFixed(1).padStart(5)} s  pvp ${String(r.matches).padStart(
                5
            )}  ` +
                `>=4 humans ${r.matches ? ((r.fourPlus / r.matches) * 100).toFixed(0) : 0} %  fair ${
                    r.humanOnly ? ((r.fair / r.humanOnly) * 100).toFixed(0) : '-'
                } % of ${r.humanOnly}  bounded ${r.boundedAll}/${r.matches}  to co-op ${r.toCoop}`
        );
    const fails = casualVerdict(results);
    for (const f of fails) console.error(`FAIL ${f}`);
    process.exit(fails.length ? 1 : 0);
} else if (require.main === module) {
    const results = RATES.map(r => simulate(r));
    for (const r of results) {
        const share = r.matches ? ((r.humans[1] + r.humans[2]) / r.matches) * 100 : 0;
        console.log(
            `${String(r.rate).padStart(5)}/min  p50 ${(r.p50 / 1000).toFixed(1).padStart(5)} s  p95 ${(r.p95 / 1000)
                .toFixed(1)
                .padStart(5)} s  max ${(r.max / 1000).toFixed(1).padStart(5)} s  matches ${String(r.matches).padStart(
                5
            )}  humans 1/2/3 ${r.humans.join('/')}  >=2: ${share.toFixed(0)} %`
        );
    }
    const fails = verdict(results);
    for (const f of fails) console.error(`FAIL ${f}`);
    process.exit(fails.length ? 1 : 0);
}
