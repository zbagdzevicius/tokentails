// @vitest-environment happy-dom
/**
 * While-you-wait slides (src/ui/waitSlides, founder Nov 20): the content is true and well-formed, the map numbers the
 * client writes out match the sim's map specs, the deck is level-aware and never repeats before the cycle is done, the
 * stepper's clock, and the panel's controls (dots, arrows, keys, tap) in a DOM.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAP_SLIDES, TIP_SLIDES, championSlides, staticSlides, type Slide } from '../../src/ui/waitSlides/content';
import { NEW_PLAYER_LV, ROUND, Stepper, buildDeck, fits, liveSlides } from '../../src/ui/waitSlides/deck';
import { mountWaitSlides } from '../../src/ui/waitSlides/waitSlides';
import { HERO_IDS } from '../../src/data/heroes';
import { RIDGE } from '../../src/data/maps/ridge';
import { THICKET } from '../../src/data/maps/thicket';
import { QUARRY } from '../../src/data/maps/quarry';
import { PITCH } from '../../src/data/maps/pitch';
import { RIDGE_TIMELINE } from '../../src/data/timeline';
import { MAP_POOL_3V3 } from '../../src/sim/api';
import { PINNED } from '../../src/ui/waitSlides/pinned';
import { FISH } from '../../src/data/fish';
import { TOWERS } from '../../src/data/towers';
import { PICKUPS } from '../../src/data/pickups';
import { RAT_CAMP_STATS } from '../../src/data/camps';
import { CROSSING_PUDDING } from '../../src/data/pudding';

/** A seeded 0..1 (mulberry32). */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ALL = staticSlides();

describe('wait slides: content', () => {
  it('has at least 40 slides across tips, champions and maps, ids unique and short', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(40);
    expect(TIP_SLIDES.length).toBeGreaterThanOrEqual(25);
    expect(MAP_SLIDES.length).toBeGreaterThanOrEqual(MAP_POOL_3V3.length);
    expect(championSlides()).toHaveLength(HERO_IDS.length * 2);
    const ids = ALL.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    // the analytics scrubber drops id-like strings of 16+ characters
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{3,15}$/);
  });

  it('reads like the game: short, plain, no placeholders, no other brand', () => {
    for (const s of ALL) {
      expect(s.title.length, s.id).toBeGreaterThan(1);
      expect(s.title.length, s.id).toBeLessThanOrEqual(32);
      expect(s.text.length, s.id).toBeLessThanOrEqual(200);
      const all = `${s.tag} ${s.title} ${s.sub ?? ''} ${s.text}`;
      expect(all, s.id).not.toMatch(/undefined|NaN|\[object|Token ?Tails|tokentails|—/i);
    }
  });

  it('every 3v3 map has a slide', () => {
    for (const m of MAP_POOL_3V3) expect(MAP_SLIDES.some((s) => s.art.t === 'map' && s.art.map === m), m).toBe(true);
  });

  it('the map numbers written out match the sim map specs', () => {
    const r = RIDGE.objective!;
    expect([r.first, r.capture, r.potPerSecond, r.buffTicks, r.minionStructBp, r.endAt]).toEqual([1800, 120, 4, 1350, 12500, 8100]);
    expect(RIDGE.laneNames).toHaveLength(1);
    expect(RIDGE_TIMELINE.pudding).toBe(r.endAt);
    const t = THICKET.objective!;
    expect([t.first, t.capture, t.cooldown, t.speedBp, t.minionStructBp, t.heroStructBp]).toEqual([2700, 90, 1800, 1000, 11500, 11500]);
    const q = QUARRY.objective!;
    expect([q.first, q.cooldown, q.gemNeed, q.countdown, q.buffTicks, q.minionTakenBp, q.minionStructBp]).toEqual([1350, 180, 7, 360, 1350, 7000, 15000]);
    const p = PITCH.objective!;
    expect([p.siegeBp, p.fish, p.xp, p.capture]).toEqual([1200, 40, 50, 1]);
    const text = (id: string) => MAP_SLIDES.find((s) => s.id === id)!.text;
    expect(text('m-mill')).toContain('4 Fish a second');
    expect(text('m-surge')).toContain('Hold 7 gems');
    expect(text('m-pitch')).toContain('12%');
  });

  it('the copied sim numbers (pinned.ts) equal their sources', () => {
    for (const [k, v] of Object.entries(PINNED.fish)) expect(FISH[k as keyof typeof FISH], `fish.${k}`).toEqual(v);
    for (const [k, v] of Object.entries(PINNED.towers)) if (k !== 'fortifyUntil') expect(TOWERS[k as keyof typeof TOWERS], `towers.${k}`).toEqual(v);
    // Crossing (0) and the four pool maps (2..5) share the slide's one time
    for (const i of [0, 2, 3, 4, 5]) expect(TOWERS.fortifyUntil[i]).toBe(PINNED.towers.fortifyUntil[0]);
    for (const [k, v] of Object.entries(PINNED.pickups.frenzy)) expect(PICKUPS.frenzy[k as keyof typeof PICKUPS.frenzy], `frenzy.${k}`).toBe(v);
    for (const [k, v] of Object.entries(PINNED.pickups.snack)) expect(PICKUPS.snack[k as keyof typeof PICKUPS.snack], `snack.${k}`).toBe(v);
    for (const [k, v] of Object.entries(PINNED.rats)) expect(RAT_CAMP_STATS[k as keyof typeof RAT_CAMP_STATS], `rats.${k}`).toBe(v);
    for (const [k, v] of Object.entries(PINNED.pudding)) expect(CROSSING_PUDDING[k as keyof typeof CROSSING_PUDDING], `pudding.${k}`).toBe(v);
  });

  it('numbers come from the data (spot checks)', () => {
    const text = (id: string) => TIP_SLIDES.find((s) => s.id === id)!.text;
    expect(text('t-lasthit')).toBe('Land the final blow on a minion and you take 80% of its Fish. Teammates close by get 30% each.');
    expect(text('t-toys')).toContain('3,150 Fish');
    expect(TIP_SLIDES.find((s) => s.id === 't-talents')!.text).toContain('3, 6 and 9');
    expect(text('t-siege')).toContain('every 3rd wave');
    expect(text('t-lockon')).toContain('1 second');
  });
});

describe('wait slides: deck', () => {
  const opts = (level: number, seen: Set<string> = new Set(), device: 'mouse' | 'touch' = 'mouse') => ({ level, device, seen, rand: seeded(level * 7 + seen.size) });

  it('a new player gets basics first, opening on a tip, and nothing above its level', () => {
    const { deck } = buildDeck(ALL, opts(1));
    expect(deck[0]!.kind).toBe('tip');
    expect(deck[0]!.basic).toBe(true);
    for (const s of deck) expect(s.minLv ?? 1).toBeLessThanOrEqual(1);
    // the basic tips come before any non-basic tip
    const tips = deck.filter((s) => s.kind === 'tip');
    const firstPlain = tips.findIndex((s) => !s.basic);
    expect(tips.slice(firstPlain).some((s) => s.basic)).toBe(false);
    expect(NEW_PLAYER_LV).toBe(3);
  });

  it('a veteran sees the advanced tips too', () => {
    const lv1 = buildDeck(ALL, opts(1)).deck.map((s) => s.id);
    const lv8 = buildDeck(ALL, opts(8)).deck.map((s) => s.id);
    expect(lv8.length).toBeGreaterThan(lv1.length);
    expect(lv8).toContain('t-ninelives');
    expect(lv1).not.toContain('t-ninelives');
  });

  it('device tips: keys on a mouse, cast modes on touch', () => {
    const mouse = buildDeck(ALL, opts(5)).deck.map((s) => s.id);
    const touch = buildDeck(ALL, opts(5, new Set(), 'touch')).deck.map((s) => s.id);
    expect(mouse).toContain('t-keys');
    expect(mouse).not.toContain('t-touchcast');
    expect(touch).toContain('t-touchcast');
    expect(touch).not.toContain('t-keys');
  });

  it('no repeats in a deck, the seen ones held back until the cycle is done', () => {
    const first = buildDeck(ALL, opts(6)).deck;
    expect(new Set(first.map((s) => s.id)).size).toBe(first.length);
    const seen = new Set(first.slice(0, 30).map((s) => s.id));
    const second = buildDeck(ALL, opts(6, seen));
    expect(second.cycleDone).toBe(false);
    expect(second.deck.some((s) => seen.has(s.id))).toBe(false);
    expect(second.deck.length).toBe(first.length - 30);
    const all = new Set(first.map((s) => s.id));
    const done = buildDeck(ALL, opts(6, all));
    expect(done.cycleDone).toBe(true);
    expect(done.deck.length).toBe(first.length);
  });

  it('kinds are interleaved: two champions never meet while tips remain', () => {
    const { deck } = buildDeck(ALL, opts(6));
    const tipsLeft = (i: number) => deck.slice(i).some((s) => s.kind === 'tip');
    for (let i = 1; i < deck.length; i++) if (tipsLeft(i)) expect(deck[i]!.kind === 'champ' && deck[i - 1]!.kind === 'champ', `at ${i}`).toBe(false);
  });

  it('fits: level band and device', () => {
    const s: Slide = { id: 'x', kind: 'tip', tag: 'TIP', title: 'X', text: 'x', art: { t: 'icon', icon: 'paw', tone: 'bolt' }, minLv: 2, maxLv: 4, device: 'touch' };
    expect(fits(s, 1, 'touch')).toBe(false);
    expect(fits(s, 3, 'touch')).toBe(true);
    expect(fits(s, 3, 'mouse')).toBe(false);
    expect(fits(s, 5, 'touch')).toBe(false);
  });
});

describe('wait slides: live panels', () => {
  it('level, last match and Cats vs Dogs from the player numbers', () => {
    const s = liveSlides({
      matches: 6,
      last: { hero: 'sage', heroTitle: 'Sage', outcome: 'won', k: 7, d: 2, a: 5, grade: 'A', best: 'Triple Pounce', seconds: 552 },
      sides: { season: { cat: 520, dog: 480 }, mine: { cat: 12, dog: 4 } },
      unlocks: [
        { name: 'Practice', level: 5 },
        { name: 'Ranked', level: 10 },
      ],
    });
    expect(s.map((x) => x.id)).toEqual(['l-level', 'l-last', 'l-sides']);
    // 6 matches is Lv 4 (2 more to Lv 5, where Practice opens)
    expect(s[0]!.title).toBe('Level 4');
    expect(s[0]!.text).toBe('2 more matches to Lv 5. Practice opens at Lv 5.');
    expect(s[1]!.text).toBe('Won as Sage · 7/2/5 · 9:12 · Grade A');
    expect(s[1]!.sub).toBe('Best moment: Triple Pounce');
    expect(s[2]!.text).toBe('Cats lead this season, 52% of all wins.');
    expect(s[2]!.sub).toBe('Your wins: 12 as a cat, 4 as a dog');
  });

  it('offline or empty: only what is known', () => {
    expect(liveSlides({ matches: 0, last: null, sides: null, unlocks: [] }).map((x) => x.id)).toEqual(['l-level']);
    expect(liveSlides({ matches: 0, last: null, sides: { season: { cat: 0, dog: 0 } }, unlocks: [] }).map((x) => x.id)).toEqual(['l-level']);
  });
});

describe('wait slides: stepper', () => {
  it('advances after the interval, pauses and resumes, wraps both ways', () => {
    const st = new Stepper(3, 1000);
    expect(st.tick(600)).toBe(false);
    expect(st.progress).toBeCloseTo(0.6);
    expect(st.tick(500)).toBe(true);
    expect(st.index).toBe(1);
    expect(st.elapsed).toBe(0);
    st.pause('hover');
    expect(st.tick(5000)).toBe(false);
    st.pause('touch');
    st.resume('hover');
    expect(st.tick(5000)).toBe(false);
    st.resume('touch');
    expect(st.tick(1000)).toBe(true);
    expect(st.index).toBe(2);
    st.next();
    expect(st.index).toBe(0);
    st.prev();
    expect(st.index).toBe(2);
  });

  it('one slide never advances; a shrinking deck keeps the index in range', () => {
    const st = new Stepper(1, 1000);
    expect(st.tick(5000)).toBe(false);
    const s2 = new Stepper(10, 1000);
    s2.go(8);
    s2.setCount(4);
    expect(s2.index).toBe(0);
  });

  it('dots show the round the slide sits in', () => {
    const st = new Stepper(14, 1000);
    st.go(7);
    expect(st.round(ROUND)).toEqual({ start: 6, len: 6, at: 1 });
    st.go(13);
    expect(st.round(ROUND)).toEqual({ start: 12, len: 2, at: 1 });
  });
});

describe('wait slides: the panel', () => {
  let root: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => root.remove());

  const current = () => root.querySelector<HTMLElement>('[data-testid="wait-stage"]')!.dataset.id;

  it('shows a slide, steps with the arrows, dots and keys, and logs each slide once', async () => {
    const events: Record<string, unknown>[] = [];
    const h = mountWaitSlides(root, { matches: 1, rand: seeded(3), track: (p) => events.push(p), every: 60_000 });
    expect(h.el.hidden).toBe(true);
    h.show(true);
    expect(h.el.hidden).toBe(false);
    const a = current();
    expect(a).toBeTruthy();
    expect(root.querySelectorAll('.pw-dot')).toHaveLength(ROUND);
    root.querySelector<HTMLElement>('[data-testid="wait-next"]')!.click();
    const b = current();
    expect(b).not.toBe(a);
    root.querySelector<HTMLElement>('[data-testid="wait-prev"]')!.click();
    expect(current()).toBe(a);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(current()).toBe(b);
    // a radio group keeps its own arrows (the queue card's side chip)
    const radio = document.createElement('div');
    radio.setAttribute('role', 'radiogroup');
    const btn = document.createElement('button');
    radio.appendChild(btn);
    root.appendChild(radio);
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(current()).toBe(b);
    root.querySelectorAll<HTMLElement>('.pw-dot')[3]!.click();
    expect(root.querySelector<HTMLElement>('[data-testid="wait-stage"]')!.dataset.index).toBe('3');
    expect(events.map((e) => e.slide)).toEqual([...new Set(events.map((e) => e.slide))]);
    expect(events[0]).toMatchObject({ n: 1, how: 'auto' });
    h.show(false);
    expect(h.el.hidden).toBe(true);
    h.destroy();
    expect(root.querySelector('[data-testid="wait-slides"]')).toBeNull();
  });

  it('auto-advances on its own clock', async () => {
    const h = mountWaitSlides(root, { matches: 1, rand: seeded(5), every: 150 });
    h.show(true);
    const a = current();
    await new Promise((r) => setTimeout(r, 450));
    expect(current()).not.toBe(a);
    h.destroy();
  });

  it('a second wait continues with slides not seen yet; live panels come next', async () => {
    const h = mountWaitSlides(root, {
      matches: 6,
      rand: seeded(9),
      every: 60_000,
      live: () => Promise.resolve({ matches: 6, last: null, sides: { season: { cat: 3, dog: 1 } }, unlocks: [] }),
    });
    h.show(true);
    const first = current();
    await Promise.resolve();
    await Promise.resolve();
    root.querySelector<HTMLElement>('[data-testid="wait-next"]')!.click();
    expect(current()).toBe('l-level');
    h.show(false);
    h.show(true);
    expect(current()).not.toBe(first);
    h.destroy();
  });
});
