// @vitest-environment happy-dom
/**
 * LoL pass, lane B: the announcer's Ace and slain lines, the cooldown label, the trailing damage chunk, the XP ring,
 * the scoreboard's talent chips, and the HUD's crest, kill feed, death wash and nap bar.
 */
import { describe, expect, it } from 'vitest';
import { Announcer, isAce, ALLY_SLAIN_QUIET, type Moment } from '../../src/render/announcer';
import { cdLabel, Hud, trailStep, TRAIL_HOLD_MS, TRAIL_RATE, xpFrac } from '../../src/ui/hud';
import { talentChips } from '../../src/ui/scoreboard';
import { XP } from '../../src/data/xp';
import type { EntitySnap, MatchClock } from '../../src/sim/api';

const death = (tick: number, id: number, killer: number) => ({ type: 'death' as const, tick, id, killer });
const keys = (ms: Moment[]) => ms.map((m) => m.key);
const name = (s: number) => ['Clem', 'Sage', 'Sir Brutus', 'Cacklejaw', 'Sage', 'Clem'][s];

describe('Ace', () => {
  it('isAce: the victim plus the two others of its team down', () => {
    const down = new Set([4, 5]);
    expect(isAce(3, (s) => down.has(s))).toBe(true);
    expect(isAce(3, (s) => s === 4)).toBe(false);
    expect(isAce(0, (s) => s === 1 || s === 2)).toBe(true);
    expect(isAce(7, () => true)).toBe(false);
  });

  it('three enemy deaths with all three out at once: one "ACE!", gold and big, said by the voice', () => {
    const a = new Announcer(0, 0, name);
    const out = new Set<number>();
    a.down = (s) => out.has(s);
    a.feed(death(600, 3, 0));
    out.add(3);
    expect(keys(a.feed(death(640, 4, 1)))).not.toContain('ace');
    out.add(4);
    const third = a.feed(death(700, 5, 0));
    const ace = third.find((m) => m.key === 'ace');
    expect(ace?.title).toBe('ACE!');
    expect(ace?.tone).toBe('gold');
    expect(ace?.big).toBe(true);
    expect(ace?.voice).toBe('ace');
    expect(a.aces).toBe(1);
    // the same wipe is not called twice; after they are back, a new wipe is
    out.add(5);
    expect(keys(a.feed(death(705, 5, 0)))).not.toContain('ace');
    out.clear();
    expect(keys(a.feed(death(2000, 3, 0)))).not.toContain('ace');
    out.add(3).add(4);
    expect(keys(a.feed(death(2100, 5, 0)))).toContain('ace');
  });

  it('our whole team down: "Enemy team ACE" in the bad tone', () => {
    const a = new Announcer(0, 0, name);
    const out = new Set<number>([1, 2]);
    a.down = (s) => out.has(s);
    const m = a.feed(death(900, 0, 3)).find((x) => x.key === 'aceThem');
    expect(m?.title).toBe('Enemy team ACE');
    expect(m?.tone).toBe('bad');
    expect(m?.voice).toBe('aceUs');
  });

  it('without a snapshot, deaths close together count (same-tick kills too)', () => {
    const a = new Announcer(0, 0, name);
    a.feed(death(600, 3, 0));
    a.feed(death(600, 4, 0));
    expect(keys(a.feed(death(601, 5, 1)))).toContain('ace');
  });
});

describe('slain lines', () => {
  it('"You have been slain" with the killer as the badge; an ally\'s knockout once no takedown of ours is near', () => {
    const a = new Announcer(0, 0, name);
    const me = a.feed(death(600, 0, 3)).find((m) => m.key === 'slain');
    expect(me?.title).toBe('You have been slain');
    expect(me?.tone).toBe('bad');
    expect(me?.face).toBe(3);
    expect(me?.voice).toBe('slain');
    expect(a.feed(death(900, 1, 4)).find((m) => m.key === 'allySlain')?.title).toBe('An ally has been slain');
    // our takedown just now: the ally line keeps quiet
    a.feed(death(1500, 5, 2));
    expect(keys(a.feed(death(1500 + ALLY_SLAIN_QUIET - 5, 1, 4)))).not.toContain('allySlain');
    // never "Enemy slain": the Takedown callout covers it
    expect(keys(a.feed(death(3000, 4, 0)))).not.toContain('allySlain');
  });

  it('killing-spree tiers are big announcer banners', () => {
    const a = new Announcer(0, 0, name);
    a.feed(death(100, 3, 0));
    a.feed(death(1000, 4, 0));
    const s = a.feed(death(2000, 5, 0)).find((m) => m.key === 'streak3');
    expect(s?.size).toBe('banner');
    expect(s?.big).toBe(true);
  });
});

describe('ability bar numbers', () => {
  it('cdLabel: whole seconds from 1 s, one decimal under it', () => {
    expect(cdLabel(0)).toBe('');
    expect(cdLabel(-3)).toBe('');
    expect(cdLabel(90)).toBe('3');
    expect(cdLabel(31)).toBe('2');
    expect(cdLabel(30)).toBe('1');
    expect(cdLabel(18)).toBe('0.6');
    expect(cdLabel(1)).toBe('0.1');
  });

  it('trailStep: a drop holds TRAIL_HOLD_MS, then drains at TRAIL_RATE × maxHp a second; a heal snaps', () => {
    let t = trailStep(null, 1000, 1000, 0);
    t = trailStep(t, 600, 1000, 100);
    expect(t.v).toBe(1000);
    t = trailStep(t, 600, 1000, 100 + TRAIL_HOLD_MS - 1);
    expect(t.v).toBe(1000);
    t = trailStep(t, 600, 1000, 100 + TRAIL_HOLD_MS + 100);
    expect(t.v).toBeCloseTo(1000 - TRAIL_RATE * 1000 * 0.1, 5);
    t = trailStep(t, 600, 1000, 100 + TRAIL_HOLD_MS + 2000);
    expect(t.v).toBe(600);
    // a new hit restarts the hold from where the chunk is
    t = trailStep(t, 500, 1000, 5000);
    expect(t.v).toBe(600);
    // a heal snaps the chunk away
    expect(trailStep(t, 900, 1000, 5010).v).toBe(900);
  });

  it('xpFrac: the share of the way to the next level (full at the top)', () => {
    const lo = XP.toLevel[1];
    const hi = XP.toLevel[2];
    expect(xpFrac(2, lo)).toBe(0);
    expect(xpFrac(2, (lo + hi) / 2)).toBeCloseTo(0.5, 5);
    expect(xpFrac(XP.maxLevel, 1e9)).toBe(1);
  });
});

describe('scoreboard talents', () => {
  it('three chips: the pick\'s initial, an empty ring for a tier not picked, "?" when hidden', () => {
    const html = talentChips('sage', [0, -1, -1]);
    expect(html.match(/class="tc"/g)?.length).toBe(1);
    expect(html.match(/class="tc none"/g)?.length).toBe(2);
    expect(talentChips('sage', undefined).match(/tc unk/g)?.length).toBe(3);
  });
});

const CLOCK: MatchClock = { tick: 900, seconds: 30, phase: 'play', nextPhaseIn: 9000 } as MatchClock;
const me = (o: Partial<EntitySnap> = {}): EntitySnap =>
  ({ id: 0, kind: 'hero', team: 0, slot: 0, hero: 'sage', level: 3, x: 0, y: 0, hp: 500, maxHp: 600, shield: 0, state: 'idle', facing: 0, buffs: 0, cooldowns: [0, 0, 0, 0, 0], xp: 0, ...o }) as EntitySnap;

describe('HUD chrome', () => {
  it('the XP ring, a decimal cooldown and one ready flash per cooldown end', () => {
    document.body.innerHTML = '<div class="pl-match"></div>';
    const hud = new Hud(document.querySelector('.pl-match') as HTMLElement, 'sage', 'pounce', { onSlot: () => undefined });
    const lo = XP.toLevel[2];
    const hi = XP.toLevel[3];
    hud.update(me({ xp: lo + (hi - lo) * 0.25, cooldowns: [18, 0, 0, 0, 0] }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    const pic = document.querySelector<HTMLElement>('.pl-portrait')!;
    expect(Number(pic.dataset.xp)).toBeCloseTo(25, 0);
    expect(document.querySelector('.pl-slot[data-i="0"] .num')?.textContent).toBe('0.6');
    hud.update(me({ cooldowns: [0, 0, 0, 0, 0] }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    hud.update(me({ cooldowns: [0, 0, 0, 0, 0] }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(hud.cdFlashes).toBe(1);
    hud.dispose();
  });

  it('dead: the match greys (the .dead class and data-pl-dead), the seconds sit on the portrait; nap shows its bar', () => {
    document.body.innerHTML = '<div class="pl-match"></div>';
    const root = document.querySelector('.pl-match') as HTMLElement;
    const hud = new Hud(root, 'sage', 'pounce', { onSlot: () => undefined });
    // the death event's recap (matchSession.onKill) opens the nap card with the dead state
    hud.recap('Knocked out by Sir Brutus', { kind: 'hero', hero: 'brutus' });
    hud.update(me({ state: 'dead', hp: 0, respawnIn: 200 }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(root.classList.contains('dead')).toBe(true);
    expect(document.documentElement.dataset.plDead).toBe('1');
    expect(document.querySelector('.pl-portrait .dsec')?.textContent).toBe('7');
    // the nap card (ui/napCard.ts) shows the same seconds while out
    expect(document.querySelector('.pl-napcard.on .nc-secs')?.textContent).toBe('7');
    hud.update(me(), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(root.classList.contains('dead')).toBe(false);
    expect(document.querySelector('.pl-napcard.on')).toBeNull();
    expect(document.documentElement.dataset.plDead).toBeUndefined();
    hud.lowQuality = true;
    hud.recap('Knocked out by minions', { kind: 'minion' });
    hud.update(me({ state: 'dead', hp: 0, respawnIn: 60 }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(root.classList.contains('dead-low')).toBe(true);
    hud.update(me({ state: 'napping' }), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    const nap = document.querySelector<HTMLElement>('.lol-nap')!;
    expect(nap.classList.contains('on')).toBe(true);
    hud.update(me({ state: 'napping' }), { ...CLOCK, tick: CLOCK.tick + 60 }, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(Number(nap.style.getPropertyValue('--left'))).toBeCloseTo(0.5, 2);
    expect(nap.textContent).toBe('Napping 2.0s');
    hud.update(me(), CLOCK, { kills: [0, 0], towers: [0, 0] }, 0);
    expect(nap.classList.contains('on')).toBe(false);
    hud.dispose();
    expect(document.documentElement.dataset.plDead).toBeUndefined();
  });

  it('the kill feed: killer face, claw, greyed victim face; a tower gets its glyph; the crest says the result', () => {
    document.body.innerHTML = '<div class="pl-match"></div>';
    const hud = new Hud(document.querySelector('.pl-match') as HTMLElement, 'sage', 'pounce', { onSlot: () => undefined });
    hud.kill({ name: 'A tower', rel: 'enemy' }, { name: 'You', rel: 'self', hero: 'sage' }, false);
    const row = document.querySelector('.pl-feed-row.kill')!;
    expect(row.querySelector('.tt-kf.killer.glyph svg')).not.toBeNull();
    expect(row.querySelector('.tt-kf.victim')).not.toBeNull();
    expect(row.querySelector('.claw')).not.toBeNull();
    hud.crest(true);
    expect(document.querySelector('.pl-crest')?.textContent).toBe('VICTORY');
    hud.dispose();
    expect(document.querySelector('.pl-crest')).toBeNull();
  });
});
