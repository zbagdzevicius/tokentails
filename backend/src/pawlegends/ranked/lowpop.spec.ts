import { freshPoints, kindShare, rankedStep } from './points';
import { rankedKindOf } from './settlement';
import { RANKED_BOTS, RANKED_POINTS } from './tiers';
import { inPrimeTime, primeTime } from './windows';

/*
 * Low-population ranked (SOCIAL-RANKED.md §7.11, round 4): what a bot-filled or vs AI match pays, the vs AI ceiling at
 * Alley III, placements against bots only, the kind of a room record, and Prime Time.
 */

const placed = (tierIdx: number, points = 0) => ({ tierIdx, points, shield: 1, placementsLeft: 0, peakIdx: tierIdx });
// a hidden rating at the division's anchor: c = 1, so a players win pays exactly RANKED_POINTS.win
const ANCHOR_ALLEY_III = 1450;
const ANCHOR_KITTEN_I = 1150;

describe('low-population ranked points (§7.11)', () => {
    it('shares: players 1, bot-filled half, vs AI a quarter', () => {
        expect(kindShare('players')).toBe(1);
        expect(kindShare('filled')).toBe(RANKED_BOTS.filledShare);
        expect(kindShare('ai')).toBe(RANKED_BOTS.aiShare);
    });

    it('a bot-filled win pays half, a bot-filled loss costs half (Alley III, c = 1)', () => {
        const win = rankedStep({
            state: placed(6, 50),
            won: true,
            r: ANCHOR_ALLEY_III,
            firstSeason: true,
            kind: 'filled',
        });
        expect(win.delta).toBe(RANKED_POINTS.win / 2);
        const loss = rankedStep({
            state: placed(6, 50),
            won: false,
            r: ANCHOR_ALLEY_III,
            firstSeason: true,
            kind: 'filled',
        });
        expect(loss.delta).toBe(-Math.round(RANKED_POINTS.loss / 2));
        const full = rankedStep({ state: placed(6, 50), won: true, r: ANCHOR_ALLEY_III, firstSeason: true });
        expect(full.delta).toBe(RANKED_POINTS.win);
    });

    it('vs AI pays a quarter below Alley III and nothing from Alley III up', () => {
        const low = rankedStep({ state: placed(2, 10), won: true, r: ANCHOR_KITTEN_I, firstSeason: true, kind: 'ai' });
        expect(low.delta).toBe(RANKED_POINTS.win / 4);
        const at = rankedStep({ state: placed(6, 10), won: true, r: ANCHOR_ALLEY_III, firstSeason: true, kind: 'ai' });
        expect(at).toEqual({ state: placed(6, 10), delta: 0 });
        const lost = rankedStep({ state: placed(8, 10), won: false, r: 1600, firstSeason: true, kind: 'ai' });
        expect(lost.delta).toBe(0);
    });

    it('vs AI wins climb Kitten and Tabby but stop at Alley III', () => {
        let s = placed(5, 98);
        const r = rankedStep({ state: s, won: true, r: 1375, firstSeason: true, kind: 'ai' });
        expect(r.promoted).toBe(true);
        expect(r.state.tierIdx).toBe(RANKED_BOTS.aiCapIdx);
        s = r.state;
        for (let i = 0; i < 30; i++)
            s = rankedStep({ state: s, won: true, r: 1800, firstSeason: true, kind: 'ai' }).state;
        expect(s.tierIdx).toBe(RANKED_BOTS.aiCapIdx);
    });

    it('placements: vs AI matches count; with none against players the placement is at most Alley III', () => {
        let s = freshPoints();
        for (let i = 0; i < 5; i++)
            s = rankedStep({ state: s, won: true, r: 1850, firstSeason: true, kind: 'ai' }).state;
        expect(s.placementsLeft).toBe(0);
        expect(s.tierIdx).toBe(RANKED_BOTS.aiCapIdx);
        // one placement against players lifts the ceiling (first season: Lion I)
        let t = freshPoints();
        t = rankedStep({ state: t, won: true, r: 1850, firstSeason: true, kind: 'filled' }).state;
        for (let i = 0; i < 4; i++)
            t = rankedStep({ state: t, won: true, r: 1850, firstSeason: true, kind: 'ai' }).state;
        expect(t.tierIdx).toBe(11);
        expect(t.vsPlayers).toBe(0);
    });
});

describe('rankedKindOf (§7.11)', () => {
    it('reads a room record: vs AI, bot-filled, or six players', () => {
        expect(rankedKindOf({ vsAi: true, fill: [1, 2] })).toBe('ai');
        expect(rankedKindOf({ fill: [1, 2] })).toBe('ai');
        const teams = [
            { species: 'cat' as const, slots: [0], difficulty: 'normal', rating: 1500 },
            { species: 'dog' as const, slots: [3], difficulty: 'normal', rating: 1500 },
        ];
        expect(rankedKindOf({ teams, fill: [1, 2, 4, 5] })).toBe('filled');
        expect(rankedKindOf({ teams, fill: [] })).toBe('players');
    });
});

describe('Prime Time (§7.11)', () => {
    it('weekdays 18:00–22:00 UTC; Saturday and Sunday 12:00–22:00 UTC as one window', () => {
        // Wednesday 2026-11-18
        expect(inPrimeTime(Date.UTC(2026, 10, 18, 17, 59))).toBe(false);
        expect(primeTime(Date.UTC(2026, 10, 18, 12))).toEqual({
            active: false,
            startsAt: Date.UTC(2026, 10, 18, 18),
            endsAt: Date.UTC(2026, 10, 18, 22),
        });
        expect(primeTime(Date.UTC(2026, 10, 18, 20))).toMatchObject({
            active: true,
            endsAt: Date.UTC(2026, 10, 18, 22),
        });
        // after 22:00 the next window is tomorrow
        expect(primeTime(Date.UTC(2026, 10, 18, 23))).toMatchObject({
            active: false,
            startsAt: Date.UTC(2026, 10, 19, 18),
        });
        // Saturday 2026-11-21: 12:00–22:00 merged
        expect(primeTime(Date.UTC(2026, 10, 21, 13))).toEqual({
            active: true,
            startsAt: Date.UTC(2026, 10, 21, 12),
            endsAt: Date.UTC(2026, 10, 21, 22),
        });
        // Friday night: the next window is Saturday noon
        expect(primeTime(Date.UTC(2026, 10, 20, 23))).toMatchObject({ startsAt: Date.UTC(2026, 10, 21, 12) });
    });
});
