import { gradeOf, gradeScore, HERO_ROLES, lossShareOf, RANKED_GRADE, roleOf, slotGrade } from './grade';

/* The server grade (SOCIAL-RANKED.md §7.12): the game's meta/grade.ts on verified stats (the game deep-compares). */

const row = (slot: number, hero: string, k: number, d: number, a: number, dmg: number, tower: number, extra = {}) => ({
    slot,
    hero,
    kills: k,
    deaths: d,
    assists: a,
    heroDamage: dmg,
    towerDamage: tower,
    ...extra,
});

describe('server grade (§7.12)', () => {
    it('grades a carry S and a quiet seat C, shares within the own team', () => {
        const stats = [
            row(0, 'clem', 6, 0, 2, 9000, 3000),
            row(1, 'brutus', 0, 4, 1, 800, 100),
            row(2, 'sage', 0, 5, 1, 900, 100),
            row(3, 'gabe', 0, 9, 0, 10, 0),
            row(4, 'pixel', 4, 2, 3, 4000, 3000),
            row(5, 'stilts', 2, 3, 3, 3000, 1500),
        ];
        expect(slotGrade(stats, 0)).toBe('S');
        expect(slotGrade(stats, 3)).toBe('C');
        expect(slotGrade(stats, 9)).toBeNull();
        expect(slotGrade(null, 0)).toBeNull();
        expect(gradeScore(stats, 0)).toBeGreaterThan(0.8);
    });

    it('frontline roles grade on damage taken and heal/shield', () => {
        const base = [
            row(0, 'brutus', 1, 2, 3, 500, 100, { damageTaken: 9000 }),
            row(1, 'clem', 2, 2, 1, 4000, 900, { damageTaken: 1000 }),
        ];
        expect(roleOf('brutus')).toBe('tank');
        expect(gradeScore(base, 0)).toBeGreaterThan(
            gradeScore(
                base.map(r => ({ ...r, damageTaken: 0 })),
                0
            )
        );
        expect(roleOf('not-a-hero')).toBe('fighter');
        expect(Object.keys(HERO_ROLES)).toHaveLength(24);
    });

    it('thresholds: S at the line, C below B', () => {
        expect(gradeOf(0.588, 'fighter')).toBe('S');
        expect(gradeOf(0.5879, 'fighter')).toBe('A');
        expect(gradeOf(0.1, 'support')).toBe('C');
    });

    it('only S halves a loss', () => {
        expect(lossShareOf('S')).toBe(RANKED_GRADE.sLossShare);
        for (const g of ['A', 'B', 'C', null] as const) expect(lossShareOf(g)).toBe(1);
    });
});
