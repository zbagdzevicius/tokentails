// @vitest-environment happy-dom
/**
 * Playtest round 0 client fixes (the squad parts went with NO-TOKENTAILS.md): hero-following daily quests, the bot ladder, deferred talent offers, banner priority and the Frenzy / Nine Lives callouts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { PLACEMENT, recordLadder } from '../../src/meta/ladder';
import { dailyQuests, freshQuests, progressQuests } from '../../src/meta/quests';
import { TalentPicker } from '../../src/ui/talents';
import { Juice } from '../../src/render/juice';

describe('round 0: quests, ladder', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
  });

  it('early matches: the hero-win quest names the hero being played', () => {
    for (let d = 1; d <= 28; d++) {
      const day = `2026-11-${String(d).padStart(2, '0')}`;
      const base = dailyQuests(day);
      const mine = dailyQuests(day, 'clem');
      if (base.some((q) => q.hero)) expect(mine.some((q) => q.hero === 'clem')).toBe(true);
      expect(mine.filter((q) => q.hero && q.hero !== 'clem')).toEqual([]);
    }
    const day = Array.from({ length: 60 }, (_, i) => `2026-12-${String((i % 28) + 1).padStart(2, '0')}`).find((x) => dailyQuests(x).some((q) => q.hero && q.hero !== 'clem'))!;
    const r = progressQuests(freshQuests(day), { won: true, hero: 'clem', takedowns: 0, pudding: false, towers: 0, combos: 0 }, true);
    expect(r.views.find((v) => v.quest.hero)?.done).toBe(true);
  });

  it('the bot ladder moves on wins and losses (not on Rookie) and keeps personal bests', () => {
    // round 1: the first PLACEMENT ladder matches never lose points
    const p0 = loadProfile();
    p0.ladderGames = PLACEMENT;
    saveProfile(p0);
    const a = recordLadder({ won: true, difficulty: 'normal', hero: 'clem', heroName: 'Clem', seconds: 400, takedowns: 6, grade: 'S' });
    expect(a?.delta).toBe(25);
    const b = recordLadder({ won: false, difficulty: 'easy', hero: 'clem', heroName: 'Clem', seconds: 300, takedowns: 0, grade: 'C' });
    expect(b?.delta).toBe(-8);
    const c = recordLadder({ won: true, difficulty: 'rookie', hero: 'clem', heroName: 'Clem', seconds: 350, takedowns: 9, grade: 'A' });
    expect(c?.delta).toBe(0);
    expect(c?.personal).toMatch(/fastest Clem win/);
    expect(loadProfile().rating).toBe(1017);
    expect(c?.personal).toBeTruthy();
    const p = loadProfile();
    p.rating = 3;
    saveProfile(p);
    expect(recordLadder({ won: false, difficulty: 'normal', hero: 'sage', heroName: 'Sage', seconds: 1, takedowns: 0, grade: 'C' })?.rating).toBe(0);
  });
});

describe('round 0: HUD channels', () => {
  it('a talent offer that comes mid-fight waits behind the portrait until revealed', () => {
    const picks: number[] = [];
    const t = new TalentPicker(document.body, 'clem', (_tier, c) => picks.push(c));
    let glow = false;
    t.onWait = (on) => (glow = on);
    t.offer(0, true);
    expect([t.open, t.waiting, glow, t.root.classList.contains('on')]).toEqual([true, true, true, false]);
    t.update(30);
    expect(picks).toEqual([]); // no auto-pick while it waits
    t.reveal();
    expect([t.waiting, glow, t.root.classList.contains('on')]).toEqual([false, false, true]);
    expect(t.root.querySelector('.s')?.textContent).toBe('Stun on 3rd swipe');
    t.dispose();
  });

  it('banners: one at a time on the top rail, urgent ones first, no duplicates, text cleared after the fade', () => {
    const root = document.createElement('div');
    const j = new Juice(root);
    j.banner({ title: 'Frenzy' });
    j.banner({ title: 'Frenzy' });
    j.banner({ title: 'Our core is under attack!', urgent: true });
    j.update(0.016);
    // LoL pass (lane A): the rail replaces the centre banner
    const el = root.querySelector('.pl-rail-main') as HTMLElement;
    expect(root.querySelector('.pl-banner')).toBeNull();
    expect(el.textContent).toContain('Our core is under attack!');
    j.update(2.5);
    expect(el.textContent).toContain('Frenzy');
    expect(root.querySelectorAll('.pl-rail-line.on').length).toBe(1);
    j.update(2.2);
    j.update(0.4); // the fade-out gap
    expect(el.querySelector('.tt')?.textContent).toBe('');
    expect(document.documentElement.dataset.banner).toBeUndefined();
    j.dispose();
  });
});

describe('round 1: ladder impact and placement', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
  });

  it('placement matches never lose points; a C-grade win (1/14) earns 60%', () => {
    const l = recordLadder({ won: false, difficulty: 'easy', hero: 'clem', heroName: 'Clem', seconds: 400, takedowns: 1, grade: 'C' });
    expect(l).toMatchObject({ delta: 0, placement: 1 });
    // GAPS A2: the grade replaced impactOf (40 × 0.6)
    const w = recordLadder({ won: true, difficulty: 'hard', hero: 'sage', heroName: 'Sage', seconds: 421, takedowns: 1, grade: 'C' });
    expect(w?.delta).toBe(24);
  });
});
