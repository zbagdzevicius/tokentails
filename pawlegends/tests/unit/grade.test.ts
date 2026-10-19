// @vitest-environment happy-dom
/** GAPS A2: the match grade (S/A/B/C), the MVP, "Best on your team" and the ladder share it replaced impactOf with. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { HeroId, SlotStats } from '../../src/sim/api';
import {
  FRONTLINE_ROLES,
  GRADE_LADDER,
  GRADE_THRESHOLDS,
  GRADE_TREAT_XP,
  GRADE_WEIGHTS,
  gradeMatch,
  gradeOf,
  gradeParts,
  gradeScore,
  roleOf,
  weightsFor,
} from '../../src/meta/grade';
import { PLACEMENT, recordLadder } from '../../src/meta/ladder';
import { loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { HERO_IDS } from '../../src/data/heroes';
import { resultsScreen } from '../../src/ui/screens';

const row = (slot: number, hero: HeroId, k: number, d: number, a: number, heroDamage: number, towerDamage: number): SlotStats => ({ slot, hero, kills: k, deaths: d, assists: a, heroDamage, towerDamage, level: 10 });

const MATCH: SlotStats[] = [
  row(0, 'clem', 6, 2, 4, 9000, 3000),
  row(1, 'brutus', 1, 3, 8, 3000, 500),
  row(2, 'sage', 3, 4, 2, 6000, 1500),
  row(3, 'cacklejaw', 5, 3, 2, 8000, 1000),
  row(4, 'brutus', 2, 4, 5, 4000, 0),
  row(5, 'cacklejaw', 1, 5, 3, 3000, 0),
];

describe('GAPS A2: grade.ts', () => {
  it('weights by role: carry 0.35/0.25/0.20/0.20, tank and support 0.50/0.10/0.10/0.30, each summing to 1', () => {
    expect(GRADE_WEIGHTS.carry).toEqual({ kp: 0.35, heroDmg: 0.25, towerDmg: 0.2, alive: 0.2 });
    expect(GRADE_WEIGHTS.frontline).toEqual({ kp: 0.5, heroDmg: 0.1, towerDmg: 0.1, alive: 0.3 });
    for (const w of Object.values(GRADE_WEIGHTS)) expect(w.kp + w.heroDmg + w.towerDmg + w.alive).toBeCloseTo(1, 9);
    expect([...FRONTLINE_ROLES].sort()).toEqual(['support', 'tank']);
    for (const h of ['brutus', 'lambo', 'gabe'] as HeroId[]) expect(weightsFor(roleOf(h))).toBe(GRADE_WEIGHTS.frontline);
    for (const h of ['clem', 'sage', 'cacklejaw', 'aviete', 'bengas'] as HeroId[]) expect(weightsFor(roleOf(h))).toBe(GRADE_WEIGHTS.carry);
  });

  it('every hero has a role with ordered thresholds S > A > B inside 0..1', () => {
    for (const h of HERO_IDS) {
      const t = GRADE_THRESHOLDS[roleOf(h)];
      expect(t, h).toBeDefined();
      expect(t.S).toBeGreaterThan(t.A);
      expect(t.A).toBeGreaterThan(t.B);
      expect(t.B).toBeGreaterThan(0);
      expect(t.S).toBeLessThan(1);
    }
  });

  it('KP, damage shares and D come from the slot and its own team', () => {
    const p = gradeParts(MATCH, 0);
    expect(p.kp).toBeCloseTo((6 + 4) / 10, 9);
    expect(p.heroDmgShare).toBeCloseTo(9000 / 18000, 9);
    expect(p.towerDmgShare).toBeCloseTo(3000 / 5000, 9);
    expect(p.alive).toBeCloseTo(1 - 2 / 5, 9);
    expect(gradeScore(MATCH, 0)).toBeCloseTo(0.35 * 1 + 0.25 * 0.5 + 0.2 * 0.6 + 0.2 * 0.6, 9);
    // the enemy shares are of the enemy team
    expect(gradeParts(MATCH, 3).kp).toBeCloseTo(7 / 8, 9);
    // the frontline formula for Sir Brutus
    const b = gradeParts(MATCH, 1);
    expect(gradeScore(MATCH, 1)).toBeCloseTo(0.5 * b.kp + 0.1 * b.heroDmgShare + 0.1 * b.towerDmgShare + 0.3 * b.alive, 9);
  });

  it('never divides by zero: a team with no kills, damage or tower damage grades on D alone', () => {
    const idle = [row(0, 'sage', 0, 0, 0, 0, 0), row(1, 'clem', 0, 0, 0, 0, 0), row(2, 'gabe', 0, 0, 0, 0, 0), row(3, 'brutus', 3, 0, 0, 100, 100)];
    expect(gradeScore(idle, 0)).toBeCloseTo(0.2, 9);
    expect(gradeScore(idle, 2)).toBeCloseTo(0.3, 9);
    expect(gradeScore([], 0)).toBe(0);
    expect(Number.isFinite(gradeScore(idle, 9))).toBe(true);
  });

  it('a score maps to a letter on its role thresholds', () => {
    for (const role of Object.keys(GRADE_THRESHOLDS) as (keyof typeof GRADE_THRESHOLDS)[]) {
      const t = GRADE_THRESHOLDS[role];
      expect(gradeOf(t.S, role)).toBe('S');
      expect(gradeOf(t.S - 1e-6, role)).toBe('A');
      expect(gradeOf(t.A, role)).toBe('A');
      expect(gradeOf(t.B, role)).toBe('B');
      expect(gradeOf(t.B - 1e-6, role)).toBe('C');
      expect(gradeOf(0, role)).toBe('C');
      expect(gradeOf(1, role)).toBe('S');
    }
  });

  it('MVP is the best on the winning team; each team names its best', () => {
    const won = gradeMatch({ stats: MATCH, winner: 0 });
    expect(won.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    const top = (team: number) => won.slots.filter((s) => (s.slot < 3 ? 0 : 1) === team).sort((a, b) => b.score - a.score)[0].slot;
    expect(won.best).toEqual([top(0), top(1)]);
    expect(won.mvp).toBe(won.best[0]);
    const lost = gradeMatch({ stats: MATCH, winner: 1 });
    expect(lost.mvp).toBe(lost.best[1]);
    expect(lost.best[0]).toBe(won.best[0]);
  });

  it('ties go to more takedowns, then the lower slot; pure (same input, same output)', () => {
    const twin = [row(0, 'clem', 2, 1, 1, 1000, 0), row(1, 'clem', 2, 1, 1, 1000, 0), row(2, 'clem', 2, 1, 1, 1000, 0), row(3, 'clem', 1, 1, 0, 10, 0)];
    expect(gradeMatch({ stats: twin, winner: 0 }).mvp).toBe(0);
    expect(gradeMatch({ stats: twin, winner: 0 })).toEqual(gradeMatch({ stats: twin, winner: 0 }));
  });

  it('Treat XP S +40, A +25, B +10, C 0 (never catnip: the module has no catnip at all)', () => {
    expect(GRADE_TREAT_XP).toEqual({ S: 40, A: 25, B: 10, C: 0 });
  });
});

describe('GAPS A2: the grade replaces impactOf on the ladder (no stacking)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
    const p = loadProfile();
    p.ladderGames = PLACEMENT;
    p.rating = 1000;
    saveProfile(p);
  });
  const play = (won: boolean, grade: 'S' | 'A' | 'B' | 'C', takedowns = 5) => recordLadder({ won, difficulty: 'normal', hero: 'clem', heroName: 'Clem', seconds: 400, takedowns, grade });

  it('an S or A loss costs half the step, B three quarters, C all of it', () => {
    expect(play(false, 'S')?.delta).toBe(-6);
    expect(play(false, 'A')?.delta).toBe(-6);
    expect(play(false, 'B')?.delta).toBe(-9);
    expect(play(false, 'C')?.delta).toBe(-12);
  });

  it('a win pays by grade (S and A all, C 60%), whatever the takedowns', () => {
    expect(play(true, 'S', 0)?.delta).toBe(25);
    expect(play(true, 'A', 0)?.delta).toBe(Math.round(25 * GRADE_LADDER.A.win));
    expect(play(true, 'B', 30)?.delta).toBe(Math.round(25 * GRADE_LADDER.B.win));
    expect(play(true, 'C', 30)?.delta).toBe(15);
    for (const g of ['S', 'A', 'B', 'C'] as const) expect(GRADE_LADDER[g].loss === 0.5).toBe(g === 'S' || g === 'A');
  });

  it('reports the grade and its share; placement losses still cost nothing', () => {
    const p = loadProfile();
    p.ladderGames = 0;
    saveProfile(p);
    expect(play(false, 'C')).toMatchObject({ delta: 0, placement: 1, grade: 'C', impact: 1 });
    expect(play(false, 'A')).toMatchObject({ delta: 0, placement: 2, grade: 'A', impact: 0.5 });
  });
});

describe('GAPS A2 + A3: the results screen', () => {
  const base = {
    seconds: 432,
    hero: 'clem' as const,
    difficulty: 'normal' as const,
    kills: 4,
    deaths: 3,
    level: 9,
    teamKills: [9, 14] as [number, number],
    firstWin: false,
    best: false,
    dareLink: null,
    onShare: () => {},
  };

  it('a loss shows the grade, its Treat XP, the MVP and "Best on your team"; the rows carry grades and tags', () => {
    const calls: string[] = [];
    const root = resultsScreen(document.body, {
      ...base,
      won: false,
      onAgain: () => calls.push('again'),
      onChange: () => calls.push('change'),
      grade: { grade: 'A', xp: 25, mvp: { name: 'Rex', you: false }, bestOnTeam: { name: 'Clem', you: true } },
      ladder: { rating: 994, delta: -6, grade: 'A', impact: 0.5 },
      table: [
        { name: 'Clem', rel: 'self', k: 4, d: 3, a: 5, heroDmg: 9000, towerDmg: 2000, grade: 'A', best: true },
        { name: 'Rex', rel: 'enemy', k: 6, d: 1, a: 4, heroDmg: 9500, towerDmg: 3000, grade: 'S', mvp: true },
      ],
    });
    const g = root.querySelector<HTMLElement>('.pl-grade')!;
    expect(g.dataset.grade).toBe('A');
    expect(g.textContent).toContain('+25 Treat XP');
    expect(g.querySelector('[data-mvp]')!.textContent).toContain('MVP: Rex');
    expect(g.querySelector('[data-best="you"]')!.textContent).toContain('Best on your team: You');
    expect(root.querySelector('.pl-ladder')!.textContent).toContain('Grade A: half the points lost');
    expect(root.querySelector('.pl-table td.g[data-grade="S"]')).not.toBeNull();
    expect(root.querySelector('.pl-table em.mvp')!.closest('tr')!.textContent).toContain('Rex');
    expect(root.textContent).not.toMatch(/catnip/i);
    // GAPS A3: Run it back (same hero) and Switch cat
    const again = root.querySelector<HTMLElement>('[data-a="again"]')!;
    const change = root.querySelector<HTMLElement>('[data-a="change"]')!;
    expect(again.textContent).toContain('Run it back');
    expect(again.textContent).toContain('Clem');
    expect(change.textContent).toContain('Switch cat');
    again.click();
    change.click();
    expect(calls).toEqual(['again', 'change']);
    root.remove();
  });

  it('a win shows the MVP but no "Best on your team"; a C grade says how to get a B', () => {
    const root = resultsScreen(document.body, { ...base, won: true, teamKills: [14, 9], onAgain: () => {}, onChange: () => {}, tryHero: 'sage', grade: { grade: 'C', xp: 0, mvp: { name: 'Clem', you: true }, bestOnTeam: null } });
    expect(root.querySelector('[data-mvp="you"]')!.textContent).toContain('MVP: You');
    expect(root.querySelector('[data-best]')).toBeNull();
    expect(root.querySelector('.pl-grade')!.textContent).not.toContain('Treat XP');
    expect(root.querySelector('[data-a="change"]')!.textContent).toMatch(/Switch cat.*Try Sage/);
    root.remove();
  });
});
