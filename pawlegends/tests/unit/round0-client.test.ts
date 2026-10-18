// @vitest-environment happy-dom
/**
 * Playtest round 0 client fixes: the bought cat walks (squad order), the pick-screen swap, hero-following daily
 * quests, the bot ladder, deferred talent offers, banner priority and the Frenzy / Nine Lives callouts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { parseRoster, rosterCosmetics } from '../../src/meta/roster';
import { chooseSquadMate, noteNewCat, squadPrefs } from '../../src/meta/squad';
import { PLACEMENT, impactOf, recordLadder } from '../../src/meta/ladder';
import { dailyQuests, freshQuests, progressQuests } from '../../src/meta/quests';
import { TalentPicker } from '../../src/ui/talents';
import { Juice } from '../../src/render/juice';
import { pickCards } from '../../src/ui/cards';

const SIX = parseRoster([
  { id: 's1', name: 'Scout', type: 'WIND', tier: 'COMMON', isStarter: true, starterBreed: 'SCOUT', origin: 'starter' },
  { id: 'p1', name: 'Pumpkin', type: 'GRASS', tier: 'COMMON', isStarter: false, origin: 'pack' },
  { id: 'n1', name: 'Nova', type: 'STELLAR', tier: 'EPIC', isStarter: false, origin: 'adopt', catalogId: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
  { id: 'b1', name: 'Blaze', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'pack' },
  { id: 'z1', name: 'Ziggy', type: 'ELECTRIC', tier: 'RARE', isStarter: false, origin: 'pack' },
  { id: 'l1', name: 'Luna', type: 'DARK', tier: 'RARE', isStarter: false, origin: 'adopt', catalogId: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
]);

describe('round 0: squad mates', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
  });

  it('a cat bought on a 6-cat roster walks in the next match (the "Luna walks with your waves" promise)', () => {
    // round 1: no saved choice → the highest tiers walk (Blaze LEGENDARY, Nova EPIC), not two Commons
    expect(rosterCosmetics(SIX).companions.map((c) => c.name)).toEqual(['Blaze', 'Nova']);
    noteNewCat('bbbbbbbbbbbbbbbbbbbbbbbb');
    const r = rosterCosmetics(SIX, squadPrefs());
    expect(r.companions[0].name).toBe('Luna');
    expect(r.cats).toHaveLength(6);
  });

  it('the pick screen swap puts any owned cat first and clears the newest-cat rule', () => {
    noteNewCat('bbbbbbbbbbbbbbbbbbbbbbbb');
    const next = chooseSquadMate('b1', ['l1', 's1']);
    expect(next).toEqual(['b1', 'l1']);
    expect(loadProfile().newCat).toBeNull();
    expect(rosterCosmetics(SIX, squadPrefs()).companions.map((c) => c.name)).toEqual(['Blaze', 'Luna']);
  });

  it('pickCards shows the bench and reports a swap', () => {
    let chosen = '';
    const r = rosterCosmetics(SIX);
    const mate = (c: (typeof r.cats)[number]) => ({ id: c.id, name: c.name, type: c.element, tier: c.tier });
    const el = pickCards({ squad: r.companions.map(mate), bench: r.cats.slice(2).map(mate), guest: null, askSignIn: false }, { signIn: () => {}, choose: (id) => (chosen = id) });
    const swaps = el.querySelectorAll<HTMLButtonElement>('[data-a="squad-swap"]');
    expect(swaps).toHaveLength(4);
    swaps[0].click();
    expect(chosen).toBe(r.cats[2].id);
  });
});

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
    const a = recordLadder({ won: true, difficulty: 'normal', hero: 'clem', heroName: 'Clem', seconds: 400, takedowns: 6 });
    expect(a?.delta).toBe(25);
    const b = recordLadder({ won: false, difficulty: 'easy', hero: 'clem', heroName: 'Clem', seconds: 300, takedowns: 0, deaths: 4 });
    expect(b?.delta).toBe(-8);
    const c = recordLadder({ won: true, difficulty: 'rookie', hero: 'clem', heroName: 'Clem', seconds: 350, takedowns: 9 });
    expect(c?.delta).toBe(0);
    expect(c?.personal).toMatch(/fastest Clem win/);
    expect(loadProfile().rating).toBe(1017);
    expect(c?.personal).toBeTruthy();
    const p = loadProfile();
    p.rating = 3;
    saveProfile(p);
    expect(recordLadder({ won: false, difficulty: 'normal', hero: 'sage', heroName: 'Sage', seconds: 1, takedowns: 0 })?.rating).toBe(0);
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

  it('banners: one at a time, urgent ones first, no duplicates, text cleared after the fade', () => {
    const root = document.createElement('div');
    const j = new Juice(root);
    j.banner({ title: 'Frenzy' });
    j.banner({ title: 'Frenzy' });
    j.banner({ title: 'Our core is under attack!', urgent: true });
    j.update(0.016);
    const el = root.querySelector('.pl-banner') as HTMLElement;
    expect(el.textContent).toContain('Our core is under attack!');
    j.update(2.2);
    j.update(0.4); // the fade-out gap
    expect(el.textContent).toContain('Frenzy');
    j.update(2.2);
    j.update(0.4);
    expect(el.textContent).toBe('');
    expect(document.documentElement.dataset.banner).toBeUndefined();
    j.dispose();
  });
});

describe('round 1: ladder impact and placement', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfileCache();
  });

  it('placement matches never lose points; a 1/14 win earns almost nothing', () => {
    const l = recordLadder({ won: false, difficulty: 'easy', hero: 'clem', heroName: 'Clem', seconds: 400, takedowns: 1, deaths: 6 });
    expect(l).toMatchObject({ delta: 0, placement: 1 });
    expect(impactOf(1, 14)).toBe(0.1);
    expect(impactOf(6, 2)).toBe(1);
    const w = recordLadder({ won: true, difficulty: 'hard', hero: 'sage', heroName: 'Sage', seconds: 421, takedowns: 1, deaths: 14 });
    expect(w?.delta).toBe(4);
  });
});
