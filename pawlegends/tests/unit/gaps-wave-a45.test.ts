// @vitest-environment happy-dom
/**
 * GAPS.md Wave A items A4 and A5 (docs/plans/moba/GAPS.md §3): the next-objective chip and its timers (Pudding, the
 * rat camps, Sunset, Sudden Death), the minimap countdowns, the portrait strip's death timers, the touch target lock,
 * "Target first" and the optional last-hit and tower buttons. Client only: the sim runs here only to check that the
 * timers read from snapshots and events match the sim's own schedule.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RAT_CAMP_STATS } from '../../src/data/camps';
import { PUDDING, PUD_STATE } from '../../src/data/pudding';
import { TIMELINE } from '../../src/data/timeline';
import { aimFor, type AimSpec } from '../../src/input/abilities';
import { lastHitButton, resetControlPrefs, setLastHitButton, setTargetFirst, targetFirst, towerButton } from '../../src/input/presets';
import { attackPriority, lastHitTarget, smartAim, towerTarget, type Unit } from '../../src/input/targeting';
import { LOCK, lockable, TargetLock } from '../../src/input/touch/assist';
import { ObjectiveClock, campPoint, fmtSecs } from '../../src/onboarding/objectives';
import { createMatch, createPlayerBot, fillPicks, playerBotCommands, result, snapshot, step, type EntitySnap, type MatchClock } from '../../src/sim/index';
import { G } from '../../src/sim/world';
import { Hud, portraitTimer } from '../../src/ui/hud';
import { settingsPanel } from '../../src/ui/settings';

const clock = (tick: number, phase: MatchClock['phase'], nextPhaseIn: number): MatchClock => ({ tick, seconds: Math.floor(tick / 30), phase, nextPhaseIn });
const u = (id: number, kind: Unit['kind'], team: number, x: number, y: number, hp = 500, maxHp = 500, state: Unit['state'] = 'idle'): Unit => ({ id, kind, team, x, y, hp, maxHp, state });
const snap = (e: Partial<EntitySnap> & Pick<EntitySnap, 'id' | 'kind' | 'team'>): EntitySnap => ({ slot: 0, x: 0, y: 0, hp: 100, maxHp: 100, shield: 0, state: 'idle', facing: 0, buffs: 0, ...e });

describe('A4: next objective chip', () => {
  it('reads the gates, then the own rats, then Pudding; Sunset within a minute beats every timer', () => {
    const c = new ObjectiveClock(0);
    c.frame([], clock(0, 'gate', 90));
    expect(c.chip()).toMatchObject({ key: 'gates', title: 'Gates open in 0:03', secs: 3 });
    c.frame([], clock(300, 'play', 9000));
    expect(c.chip()).toMatchObject({ key: 'rats', title: `Your rats ${fmtSecs((TIMELINE.campsUp - 300) / 30)}` });
    // the camps come up (snapshots show the rats), so Pudding is next
    const rats = [0, 1, 2, 3].map((k) => snap({ id: 40 + k, kind: 'camp', team: 2, slot: k, hp: RAT_CAMP_STATS.hp, maxHp: RAT_CAMP_STATS.hp }));
    c.frame(rats, clock(TIMELINE.campsUp, 'play', 8000));
    expect(c.chip()).toMatchObject({ key: 'pudding', title: `Pudding in ${fmtSecs((TIMELINE.pudding - TIMELINE.campsUp) / 30)}` });
    c.frame(rats, clock(TIMELINE.campsUp + 30, 'play', 1200));
    expect(c.chip()).toMatchObject({ key: 'sunset', title: 'Sunset in 0:40' });
  });

  it('Calm Pudding!, then the escort HP for our side or theirs, and the respawn after he leaves', () => {
    const c = new ObjectiveClock(0);
    c.frame([], clock(TIMELINE.pudding, 'play', 6000));
    c.feed({ type: 'pudding', tick: TIMELINE.pudding, what: 'spawn' });
    expect(c.chip()).toMatchObject({ key: 'calm', title: 'Calm Pudding!', secs: null });
    c.feed({ type: 'pudding', tick: 4600, what: 'calmed', team: 0 });
    expect(c.chip().title).toBe('Pudding joins your next wave');
    c.feed({ type: 'pudding', tick: 4700, what: 'escort', team: 0 });
    c.frame([snap({ id: 62, kind: 'pudding', team: 0, hp: 1840, maxHp: PUDDING.escortHp })], clock(4700, 'play', 5000));
    expect(c.chip()).toMatchObject({ key: 'escort', title: 'Escort: 1,840 HP' });
    const them = new ObjectiveClock(1);
    them.feed({ type: 'pudding', tick: 4700, what: 'escort', team: 0 });
    them.frame([snap({ id: 62, kind: 'pudding', team: 0, hp: 1840, maxHp: PUDDING.escortHp })], clock(4700, 'play', 5000));
    expect(them.chip().title).toBe('Their escort: 1,840 HP');
    c.feed({ type: 'pudding', tick: 5000, what: 'leave' });
    c.frame([], clock(5000, 'play', 5000));
    expect(c.chip()).toMatchObject({ key: 'pudding', title: `Pudding in ${fmtSecs(PUDDING.respawn / 30)}` });
    expect(c.timers()).toContainEqual(expect.objectContaining({ key: 'pudding', left: PUDDING.respawn, total: PUDDING.respawn }));
  });

  it('an escort out of sight shows no HP: neither the wild HP from before he was calmed nor a stale escort reading', () => {
    const them = new ObjectiveClock(1);
    them.feed({ type: 'pudding', tick: TIMELINE.pudding, what: 'spawn' });
    them.frame([snap({ id: 62, kind: 'pudding', team: 2, hp: 300, maxHp: PUDDING.escortHp })], clock(4500, 'play', 5000));
    expect(them.chip().key).toBe('calm');
    them.feed({ type: 'pudding', tick: 4600, what: 'calmed', team: 0 });
    them.feed({ type: 'pudding', tick: 4700, what: 'escort', team: 0 });
    // the escort spawns at their base, out of our vision
    them.frame([], clock(4700, 'play', 5000));
    expect(them.chip().title).toBe('Their Pudding is coming');
    them.frame([snap({ id: 62, kind: 'pudding', team: 0, hp: 2400, maxHp: PUDDING.escortHp })], clock(4800, 'play', 5000));
    expect(them.chip().title).toBe('Their escort: 2,400 HP');
    // he walks out of sight again: the 2,400 is no longer live
    them.frame([], clock(4830, 'play', 5000));
    expect(them.chip().title).toBe('Their Pudding is coming');
    const us = new ObjectiveClock(0);
    us.feed({ type: 'pudding', tick: 4700, what: 'escort', team: 0 });
    us.frame([], clock(4700, 'play', 5000));
    expect(us.chip().title).toBe('Escort Pudding');
  });

  it('the enemy camp shows only once its clear was seen (a Pack buff on a hero we can see); the own camp always', () => {
    const rats = [0, 1, 2, 3].map((k) => snap({ id: 40 + k, kind: 'camp', team: 2, slot: k }));
    const c = new ObjectiveClock(0);
    c.frame(rats, clock(1000, 'play', 8000));
    // their camp (rats 42, 43) cleared out of sight: no timer
    c.feed({ type: 'death', tick: 1100, id: 42, killer: 4 });
    c.feed({ type: 'death', tick: 1101, id: 43, killer: 4 });
    c.frame(rats.slice(0, 2), clock(1101, 'play', 8000));
    expect(c.timers().map((t) => t.key)).not.toContain('theirRats');
    expect(c.chip().key).not.toBe('theirRats');
    // our camp cleared by them: we still know when ours is back
    c.feed({ type: 'death', tick: 1200, id: 40, killer: 4 });
    c.feed({ type: 'death', tick: 1200, id: 41, killer: 4 });
    expect(c.camps[0].upAt).toBe(1200 + RAT_CAMP_STATS.respawn);
    expect(c.timers()).toContainEqual(expect.objectContaining({ key: 'rats', x: campPoint(0).x }));
    // a seen clear of theirs: the Pack buff lands on a visible hero on the clear's tick (before or after the death)
    const d = new ObjectiveClock(0);
    d.frame(rats, clock(1000, 'play', 8000));
    d.feed({ type: 'death', tick: 1300, id: 42, killer: 1 });
    d.feed({ type: 'buff', tick: 1301, id: 1, kind: 'pack', ticks: RAT_CAMP_STATS.packTicks });
    d.feed({ type: 'death', tick: 1301, id: 43, killer: 1 });
    d.frame(rats.slice(0, 2), clock(1301, 'play', 8000));
    expect(d.camps[1]).toMatchObject({ known: true, upAt: 1301 + RAT_CAMP_STATS.respawn });
    expect(d.chip()).toMatchObject({ key: 'theirRats', title: `Their rats ${fmtSecs(RAT_CAMP_STATS.respawn / 30)}` });
  });

  it('Sudden Death: the chip says so (a live Pudding still comes first)', () => {
    const c = new ObjectiveClock(0);
    c.feed({ type: 'pudding', tick: 11000, what: 'leave' });
    c.frame([], clock(12000, 'sunset', 600));
    expect(c.chip()).toMatchObject({ key: 'suddenDeath', title: 'Sudden Death in 0:20' });
    c.frame([], clock(13000, 'suddenDeath', 3000));
    expect(c.chip()).toMatchObject({ key: 'suddenDeath', title: 'Sudden Death!' });
    c.feed({ type: 'pudding', tick: 14600, what: 'spawn' });
    expect(c.chip().key).toBe('calm');
  });

  it('timers read from snapshots and events match the sim’s own schedule (camps and Pudding), full bot matches', () => {
    let campChecks = 0;
    let pudChecks = 0;
    let enemySeen = 0;
    for (const seed of [3, 11]) {
      const { picks, tricks } = fillPicks(seed, 'sage', 'hiss');
      const m = createMatch({ seed, picks, tricks, difficulty: 'normal' });
      const bot = createPlayerBot(m, 'normal');
      const c = new ObjectiveClock(0);
      const w = m.world;
      while (!result(m)) {
        step(m, playerBotCommands(m, bot));
        const s = snapshot(m, 0);
        for (const ev of s.events) c.feed(ev);
        c.frame(s.entities, s.clock);
        const tick = s.clock.tick;
        const own = w.globals[G.CampAt0];
        if (own > tick) {
          expect(c.camps[0].upAt, `own camp at ${tick}`).toBe(own);
          campChecks++;
        }
        const theirs = w.globals[G.CampAt1];
        if (c.camps[1].known && c.camps[1].upAt !== null) {
          expect(c.camps[1].upAt, `their camp at ${tick}`).toBe(theirs);
          enemySeen++;
        }
        if (w.globals[G.PudState] === PUD_STATE.Away && w.globals[G.PudAt] > tick) {
          expect(c.pud.state).toBe('away');
          expect(c.pud.at).toBe(w.globals[G.PudAt]);
          pudChecks++;
        }
        if (w.globals[G.PudState] === PUD_STATE.Wild) expect(c.pud.state).toBe('wild');
      }
    }
    // the respawns after a clear and a leave were exercised, not just the opening timers
    expect(campChecks).toBeGreaterThan(TIMELINE.campsUp * 2);
    expect(pudChecks).toBeGreaterThan(TIMELINE.pudding * 2);
    expect(enemySeen).toBeGreaterThan(0);
  }, 60_000);
});

describe('A4: portrait strip', () => {
  it('death timers from respawnIn, kept while an enemy who died in view is out of sight', () => {
    expect(portraitTimer({ state: 'idle' }, 100, -1)).toEqual({ until: -1, secs: null, seen: true });
    const d = portraitTimer({ state: 'dead', respawnIn: 300 }, 100, -1);
    expect(d).toEqual({ until: 400, secs: 10, seen: true });
    expect(portraitTimer(undefined, 250, d.until)).toEqual({ until: 400, secs: 5, seen: false });
    expect(portraitTimer(undefined, 400, d.until)).toEqual({ until: -1, secs: null, seen: false });
  });

  it('allies left, enemies right of the score bar; a touch tap on an enemy portrait asks for the lock', () => {
    document.body.innerHTML = '';
    const taps: number[] = [];
    const hud = new Hud(document.body, 'sage', 'hiss', { onSlot: () => {}, onPortrait: (s) => taps.push(s) });
    hud.mountStrip(['sage', 'clem', 'brutus', 'cacklejaw', 'lambo', 'gabe'], 0, 0, ['You', 'Clem', 'Brutus', 'Cacklejaw', 'Lambo', 'Gabė']);
    expect(document.querySelectorAll('.pl-strip.ally .pp').length).toBe(2);
    expect(document.querySelectorAll('.pl-top .pl-strip.enemy button.pp').length).toBe(3);
    const byId = new Map<number, EntitySnap>([[4, snap({ id: 4, kind: 'hero', team: 1, state: 'dead', respawnIn: 90 })]]);
    hud.stripUpdate(byId, 0, 3);
    const lambo = document.querySelector<HTMLElement>('.pp[data-slot="4"]')!;
    expect(lambo.classList.contains('dead')).toBe(true);
    expect(lambo.querySelector('.t')!.textContent).toBe('3');
    expect(document.querySelector('.pp[data-slot="3"]')!.classList.contains('locked')).toBe(true);
    expect(document.querySelector('.pp[data-slot="5"]')!.classList.contains('unseen')).toBe(true);
    const ev = new Event('pointerdown', { bubbles: true }) as Event & { pointerType: string };
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    document.querySelector('.pp[data-slot="5"]')!.dispatchEvent(ev);
    expect(taps).toEqual([5]);
    // allies are not buttons: no lock on a friend
    expect(document.querySelector('.pl-strip.ally button')).toBeNull();
    hud.dispose();
  });
});

describe('A5: touch target lock', () => {
  const me = u(0, 'hero', 0, 50000, 30000);
  it('holds 5 s, until the hero dies, hides or is more than 9 m away; a second tap lets go', () => {
    const foe = u(4, 'hero', 1, 54000, 30000);
    const l = new TargetLock();
    expect(l.set(4, 0)).toBe(true);
    expect(l.check([me, foe], me, 0, LOCK.ms - 1)).toBe(4);
    expect(l.check([me, foe], me, 0, LOCK.ms)).toBeNull();
    l.set(4, 0);
    expect(l.check([me, { ...foe, state: 'dead' }], me, 0, 10)).toBeNull();
    l.set(4, 0);
    expect(l.check([me], me, 0, 10)).toBeNull();
    l.set(4, 0);
    expect(l.check([me, { ...foe, x: me.x + LOCK.rangeMm + 1 }], me, 0, 10)).toBeNull();
    l.set(4, 0);
    expect(l.set(4, 100)).toBe(false);
    expect(l.id).toBeNull();
    expect(l.left(0)).toBe(0);
    l.set(4, 0);
    expect(l.left(LOCK.ms / 2)).toBeCloseTo(0.5);
  });

  it('only living enemy heroes within 9 m can be locked', () => {
    expect(lockable(u(4, 'hero', 1, 52000, 30000), me, 0)).toBe(true);
    expect(lockable(u(1, 'hero', 0, 52000, 30000), me, 0)).toBe(false);
    expect(lockable(u(20, 'minion', 1, 52000, 30000), me, 0)).toBe(false);
    expect(lockable(u(4, 'hero', 1, 60000, 30000), me, 0)).toBe(false);
    expect(lockable(undefined, me, 0)).toBe(false);
  });

  it('smart casts aim at the locked hero within their reach (unit casts carry its id); out of reach the usual pick', () => {
    const near = u(3, 'hero', 1, 52000, 30000);
    const locked = u(4, 'hero', 1, 54000, 31000, 500, 500);
    const unit: AimSpec = { kind: 'unit', shape: 'none', range: 5000, smart: 'hero' };
    expect(smartAim(unit, [me, near, locked], me, 0, 0)).toMatchObject({ id: 3 });
    expect(smartAim(unit, [me, near, locked], me, 0, 0, 4)).toEqual({ x: locked.x, y: locked.y, id: 4 });
    const cone = aimFor('sage', 0);
    expect(smartAim(cone, [me, near, locked], me, 0, 0, 4)).toEqual({ x: locked.x, y: locked.y, id: 0xff });
    const far = { ...locked, x: me.x + cone.range * 1.3 + 500 };
    expect(smartAim(cone, [me, near, far], me, 0, 0, 4)).toMatchObject({ x: near.x, y: near.y });
    // a self cast or a no-smart aim ignores the lock
    const self: AimSpec = { kind: 'self', shape: 'ring', range: 3000, smart: 'none' };
    expect(smartAim(self, [me, locked], me, 0, 0, 4)).toEqual({ x: me.x, y: me.y, id: 0xff });
  });
});

describe('A5: Target first, last-hit and tower buttons', () => {
  const me = u(0, 'hero', 0, 50000, 30000);
  const hurtMinion = u(20, 'minion', 1, 51200, 30000, 50, 400);
  const fullHero = u(4, 'hero', 1, 51800, 30000, 600, 600);
  const closeMinion = u(21, 'minion', 1, 50900, 30000, 400, 400);
  const units = [me, hurtMinion, fullHero, closeMinion];

  it('Heroes (default) keeps the old order; Lowest HP % and Closest pick among units in range, towers after', () => {
    expect(attackPriority(units, me, 0, 1600)).toBe(4);
    expect(attackPriority(units, me, 0, 1600, 7000, 'heroes')).toBe(4);
    expect(attackPriority(units, me, 0, 1600, 7000, 'lowest')).toBe(20);
    expect(attackPriority(units, me, 0, 1600, 7000, 'closest')).toBe(21);
    const tower = u(30, 'tower', 1, 51500, 31000, 3000, 3000);
    expect(attackPriority([me, tower], me, 0, 1600, 7000, 'lowest')).toBe(30);
    expect(attackPriority([me, tower, hurtMinion], me, 0, 1600, 7000, 'closest')).toBe(20);
  });

  it('last-hit takes the lowest-HP minion or camp monster in range, never a hero or a tower', () => {
    expect(lastHitTarget(units, me, 0, 1600)).toBe(20);
    expect(lastHitTarget([me, fullHero, u(30, 'tower', 1, 51000, 30000)], me, 0, 1600)).toBeNull();
    expect(lastHitTarget([me, u(41, 'camp', 2, 51000, 30000, 100, 450)], me, 0, 1600)).toBe(41);
  });

  it('tower: one in range, else the nearest tanked one; never an untanked walk-in', () => {
    const tower = u(30, 'tower', 1, 52500, 30000, 3000, 3000);
    expect(towerTarget([me, tower], me, 0, 1600)).toBe(30);
    const farTower = u(31, 'tower', 1, 57000, 30000, 3000, 3000);
    expect(towerTarget([me, farTower], me, 0, 1600)).toBeNull();
    const tank = u(22, 'minion', 0, 56000, 30000);
    expect(towerTarget([me, farTower, tank], me, 0, 1600)).toBe(31);
  });

  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* none */
    }
    resetControlPrefs();
  });

  it('defaults: Heroes first, both extra buttons off; choices persist', () => {
    expect(targetFirst()).toBe('heroes');
    expect(lastHitButton()).toBe(false);
    expect(towerButton()).toBe(false);
    setTargetFirst('closest');
    setLastHitButton(true);
    resetControlPrefs();
    expect(targetFirst()).toBe('closest');
    expect(lastHitButton()).toBe(true);
  });

  it('Settings shows the touch rows on a touch device (no hover), the desktop rows otherwise', () => {
    const mm = window.matchMedia;
    const panel = (hoverNone: boolean): HTMLElement => {
      window.matchMedia = ((q: string) => ({ matches: hoverNone && q.includes('hover: none'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
      document.body.innerHTML = '';
      return settingsPanel(document.body, { state: { muted: false, tier: 'med', tipsOn: true, stats: null }, onMute() {}, onTier() {}, onTips() {}, onStats() {}, onClose() {} });
    };
    try {
      const touch = panel(true);
      expect(touch.querySelector('[data-target="heroes"]')?.classList.contains('on')).toBe(true);
      expect(touch.textContent).toContain('Lowest HP %');
      expect(touch.querySelector('[data-a="lasthit"]')?.textContent).toBe('Off');
      expect(touch.querySelector('[data-a="tower"]')?.textContent).toBe('Off');
      expect(touch.querySelector('[data-cast]')).toBeNull();
      (touch.querySelector('[data-target="lowest"]') as HTMLElement).click();
      expect(targetFirst()).toBe('lowest');
      (touch.querySelector('[data-a="tower"]') as HTMLElement).click();
      expect(towerButton()).toBe(true);
      const desk = panel(false);
      expect(desk.querySelector('[data-target]')).toBeNull();
      expect(desk.querySelector('[data-cast]')).not.toBeNull();
    } finally {
      window.matchMedia = mm;
    }
  });
});
