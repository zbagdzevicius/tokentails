import {
    afterDodges,
    convergence,
    decayedPoints,
    freshPoints,
    ladderOf,
    legendInactive,
    rankedStep,
    softReset,
    tierOfRating,
} from './points';
import { LEGEND_IDX, tierLabel } from './tiers';

const DAY = 86_400_000;
const placed = (tierIdx: number, points = 0) => ({ tierIdx, points, shield: 1, placementsLeft: 0, peakIdx: tierIdx });

describe('ranked points (SOCIAL-RANKED.md §7.3–§7.8)', () => {
    it('maps hidden ratings to divisions and labels them', () => {
        expect(tierOfRating(900)).toBe(0);
        expect(tierOfRating(1300)).toBe(4);
        expect(tierOfRating(1899)).toBe(11);
        expect(tierOfRating(2400)).toBe(LEGEND_IDX);
        expect(tierLabel(4)).toBe('Tabby II');
        expect(tierLabel(12, 240)).toBe('Legend · 240 pts');
    });

    it('convergence c is clamped to 0.5..1.5', () => {
        expect(convergence(1450, 6)).toBe(1);
        expect(convergence(1650, 6)).toBe(1.5);
        expect(convergence(1000, 6)).toBe(0.5);
    });

    it('placements show nothing for 5 matches, then reveal the tier, capped at Lion I in a first season', () => {
        let s = freshPoints();
        for (let i = 0; i < 4; i++) {
            const step = rankedStep({ state: s, won: true, r: 2100, firstSeason: true });
            expect(step.placed).toBeUndefined();
            s = step.state;
        }
        const last = rankedStep({ state: s, won: true, r: 2100, firstSeason: true });
        expect(last.placed).toBe(true);
        expect(last.state.tierIdx).toBe(11);
        expect(rankedStep({ state: { ...s }, won: true, r: 2100, firstSeason: false }).state.tierIdx).toBe(LEGEND_IDX);
        // a returning season's floor: at most 2 divisions under the finish
        expect(
            rankedStep({ state: { ...s, placementsLeft: 1 }, won: false, r: 1000, firstSeason: false, floorIdx: 7 })
                .state.tierIdx
        ).toBe(7);
    });

    it('wins promote and carry the remainder; Legend is uncapped', () => {
        const step = rankedStep({ state: placed(6, 90), won: true, r: 1450, firstSeason: false });
        expect(step).toMatchObject({ delta: 20, promoted: true, state: { tierIdx: 7, points: 10 } });
        const legend = rankedStep({ state: placed(LEGEND_IDX, 480), won: true, r: 1900, firstSeason: false });
        expect(legend.state).toMatchObject({ tierIdx: LEGEND_IDX, points: 500 });
        expect(ladderOf(legend.state)).toBe(1700);
        expect(ladderOf({ tierIdx: 4, points: 64 })).toBe(464);
    });

    it('Kitten and Tabby never lose points; forgiven and backfill losses cost 0', () => {
        expect(rankedStep({ state: placed(4, 10), won: false, r: 1000, firstSeason: false }).state.points).toBe(10);
        expect(rankedStep({ state: placed(7, 10), won: false, r: 1525, free: true, firstSeason: false }).delta).toBe(0);
    });

    it('a loss below 0 uses the shield first, then demotes', () => {
        const a = rankedStep({ state: placed(7, 5), won: false, r: 1525, firstSeason: false });
        expect(a).toMatchObject({ delta: -15, state: { tierIdx: 7, points: 0, shield: 0 } });
        const b = rankedStep({ state: a.state, won: false, r: 1525, firstSeason: false });
        expect(b).toMatchObject({ demoted: true, state: { tierIdx: 6, points: 75, shield: 1 } });
        // the grade cushions the loss
        expect(
            rankedStep({ state: placed(7, 50), won: false, r: 1525, gradeShare: 0.5, firstSeason: false }).delta
        ).toBe(-8);
    });

    it('Legend decays 20 a day after 14 days, never below 0, and is hidden from the top 100', () => {
        const now = new Date(Date.UTC(2026, 11, 1));
        const ago = (d: number) => new Date(now.getTime() - d * DAY);
        expect(decayedPoints({ tierIdx: LEGEND_IDX, points: 200 }, ago(14), now)).toBe(200);
        expect(decayedPoints({ tierIdx: LEGEND_IDX, points: 200 }, ago(17), now)).toBe(140);
        expect(decayedPoints({ tierIdx: LEGEND_IDX, points: 30 }, ago(40), now)).toBe(0);
        expect(decayedPoints({ tierIdx: 11, points: 50 }, ago(40), now)).toBe(50);
        expect(legendInactive(ago(14), now)).toBe(true);
        expect(legendInactive(ago(3), now)).toBe(false);
    });

    it('dodges cost 3 each, never below the division floor', () => {
        expect(afterDodges(10, 2)).toBe(4);
        expect(afterDodges(5, 4)).toBe(0);
    });

    it('soft reset: r 25% toward 1500, RD at least 150, 3 placements, floor 2 divisions under the finish', () => {
        expect(softReset({ r: 1900, rd: 60, tierIdx: 10 })).toEqual({
            r: 1800,
            rd: 150,
            placementsLeft: 3,
            floorIdx: 8,
        });
        expect(softReset({ r: 1100, rd: 200, tierIdx: 1 })).toEqual({
            r: 1200,
            rd: 200,
            placementsLeft: 3,
            floorIdx: 0,
        });
    });
});
