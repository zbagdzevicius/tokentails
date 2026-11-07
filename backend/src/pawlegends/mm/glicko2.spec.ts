import { BOT_RATING, coopUpdate, glicko2Update, GLICKO, growRd, seedRating } from './glicko2';

/* Hidden Glicko-2 (M1A-IMPL.md §4.1). */

describe('glicko2', () => {
    it("Glickman's worked example: 1500/200/0.06 vs 1400/30 (won), 1550/100, 1700/300 (lost)", () => {
        const out = glicko2Update({ r: 1500, rd: 200, sigma: 0.06 }, [
            { r: 1400, rd: 30, score: 1 },
            { r: 1550, rd: 100, score: 0 },
            { r: 1700, rd: 300, score: 0 },
        ]);
        expect(out.r).toBeCloseTo(1464.06, 1);
        expect(out.rd).toBeCloseTo(151.52, 1);
        expect(out.sigma).toBeCloseTo(0.06, 4);
    });

    it('same inputs, same outputs (bit for bit)', () => {
        const a = coopUpdate({ r: 1432.1, rd: 211.7, sigma: 0.06 }, 'normal', true);
        const b = coopUpdate({ r: 1432.1, rd: 211.7, sigma: 0.06 }, 'normal', true);
        expect(Object.is(a.r, b.r) && Object.is(a.rd, b.rd) && Object.is(a.sigma, b.sigma)).toBe(true);
    });

    it('RD grows one period per full 7 idle days, capped at 350; the RD floor is 45', () => {
        const day = 86_400_000;
        const x = { r: 1500, rd: 100, sigma: 0.06 };
        expect(growRd(x, 0, 6 * day).rd).toBe(100);
        const one = growRd(x, 0, 7 * day).rd;
        expect(one).toBeGreaterThan(100);
        expect(growRd(x, 0, 14 * day).rd).toBeGreaterThan(one);
        expect(growRd(x, 0, 100_000 * day).rd).toBe(GLICKO.rdMax);
        let tight = { r: 1500, rd: 50, sigma: 0.0001 };
        for (let i = 0; i < 50; i++) tight = coopUpdate(tight, 'normal', i % 2 === 0);
        expect(tight.rd).toBeGreaterThanOrEqual(GLICKO.rdFloor);
    });

    it('the bot pseudo-players and the hint seeds', () => {
        expect(BOT_RATING.rookie).toEqual({ r: 1000, rd: 60 });
        expect(BOT_RATING.hard).toEqual({ r: 1750, rd: 60 });
        expect(seedRating('easy')).toEqual({ r: 1350, rd: 300, sigma: 0.06 });
        expect(seedRating(undefined)).toEqual({ r: 1500, rd: 350, sigma: 0.06 });
        // a win against hard bots moves you up more than a win against rookies
        const x = { r: 1500, rd: 200, sigma: 0.06 };
        expect(coopUpdate(x, 'hard', true).r).toBeGreaterThan(coopUpdate(x, 'rookie', true).r);
        expect(coopUpdate(x, 'normal', false).r).toBeLessThan(1500);
    });
});
