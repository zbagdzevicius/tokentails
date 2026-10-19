// @vitest-environment happy-dom
/**
 * Playtest round 2 (2026-10-18, sim v8; average fun 5.2/10): the takedown chip is capped (a kill lead takes towers, not
 * the core), Hard is a mirror, enemy bots leave a new player alone in the opening, catch-up XP is stronger and visible,
 * the per-hero tuning replaces the species edge, and the client explains its results, names its bots and stops
 * covering the HUD.
 */
import { describe, expect, it } from 'vitest';
import { BOTS, DIFFICULTY_RULES } from '../../src/data/bots';
import { HEROES } from '../../src/data/heroes';
import { XP } from '../../src/data/xp';
import { botParams } from '../../src/sim/bots';
import { resolveDeaths } from '../../src/sim/combat/damage';
import { applyBp } from '../../src/sim/fixed';
import { step } from '../../src/sim/index';
import { G, RANGE } from '../../src/sim/world';
import { SIM_VERSION } from '../../src/sim/version';
import { CoreLog, endCause } from '../../src/app/endCause';
import { tryHeroFor } from '../../src/app/app';
import { dareText } from '../../src/share/dare';
import { CAT_NAMES, DOG_NAMES, DIFFICULTY_HINT, pvpNumbers, slotNames } from '../../src/ui/heroText';
import { tierLabel } from '../../src/ui/cards';
import { slideAngle } from '../../src/input/orders';
import { cellOf, createGrid, walkable } from '../../src/sim/map/grid';
import { rosterCosmetics, type RosterCat } from '../../src/meta/roster';
import { companionCoat, kittenCoat } from '../../src/render/cosmetics';
import { zoomMax, ZOOM_MAX, ZOOM_MAX_WIDE } from '../../src/render/camera/zoom';
import { TalentPicker, TALENT_AUTO_S } from '../../src/ui/talents';
import { coreId, quietMatch } from './sim-helpers';
import { heroMatch, hold, place } from './heroes/kit-helpers';

describe('sim v8: the takedown chip', () => {
  it('SIM_VERSION is 9 (sim v9: the shelter champions kept the chip)', () => {
    expect(SIM_VERSION).toBe(9);
  });

  it('stops at the cap before Sunset, then chips the weakest tower that can be hit', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    const core = coreId(1);
    const r = DIFFICULTY_RULES.normal;
    w.globals[G.Tick] = 3000;
    const full = w.hp[core];
    const chips = r.takedownChipCapBp / r.takedownChipBp;
    for (let k = 0; k < chips + 3; k++) {
      // the victim respawns at once so the same slot can fall again
      w.alive[3] = 1;
      w.hp[3] = 0;
      resolveDeaths(m);
    }
    expect(full - w.hp[core]).toBe(chips * applyBp(w.maxHp[core], r.takedownChipBp));
    // the three takedowns past the cap went to a Woof tower instead
    let towerLoss = 0;
    for (let id = RANGE.towers; id < RANGE.cores; id++) if (w.team[id] === 1) towerLoss += w.maxHp[id] - w.hp[id];
    expect(towerLoss).toBeGreaterThan(0);
  });

  it('keeps chipping the core past the cap once an inner tower of that side is down', () => {
    const m = quietMatch(1, false, 'normal');
    const w = m.world;
    const core = coreId(1);
    w.globals[G.Tick] = 3000;
    // every Woof tower down: its base is open
    for (let id = RANGE.towers; id < RANGE.cores; id++) if (w.team[id] === 1) w.alive[id] = 0;
    w.globals[G.Kills0] = 20;
    const before = w.hp[core];
    w.hp[3] = 0;
    resolveDeaths(m);
    expect(before - w.hp[core]).toBe(applyBp(w.maxHp[core], DIFFICULTY_RULES.normal.takedownChipBp));
  });

  it('a chip is a map hit of kind "chip" (the client does not call it "under attack")', () => {
    const m = quietMatch(1, false, 'normal');
    m.world.globals[G.Tick] = 3000;
    m.world.hp[3] = 0;
    m.events.length = 0;
    resolveDeaths(m);
    const hit = m.events.find((e) => e.type === 'hit' && e.dst === coreId(1));
    expect(hit && hit.type === 'hit' ? [hit.src, hit.kind] : null).toEqual([-1, 'chip']);
  });
});

describe('sim v8: bots', () => {
  it('Hard allies play at Hard (a mirror); Easy and Normal allies at Normal', () => {
    const hard = quietMatch(1, false, 'hard');
    expect(botParams(hard, 1)).toBe(BOTS.hard);
    expect(botParams(hard, 4)).toBe(BOTS.hard);
    expect(botParams(quietMatch(1, false, 'normal'), 1).reactionTicks).toBe(BOTS.normal.reactionTicks);
  });

  it('enemy bots leave the human alone before the opening truce (Rookie and Easy 0:40, Normal 0:30, Hard none)', () => {
    expect(DIFFICULTY_RULES.rookie.truceUntil).toBe(1200);
    expect(DIFFICULTY_RULES.easy.truceUntil).toBe(1200);
    expect(DIFFICULTY_RULES.normal.truceUntil).toBe(900);
    expect(DIFFICULTY_RULES.hard.truceUntil).toBe(0);
    const foeAt = (tick: number): number => {
      const m = heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'sage', 'clem']);
      (m.config as { difficulty: string }).difficulty = 'easy';
      const w = m.world;
      w.globals[G.BotsOff] = 0;
      for (let id = 0; id < 6; id++) place(m, id, id < 3 ? 20000 : 80000, 10000 + id * 7000);
      hold(m, 0);
      place(m, 0, 50000, 30000);
      place(m, 4, 54000, 30000);
      w.hp[0] = 60;
      w.rootT[4] = 600;
      w.globals[G.Tick] = tick;
      for (let i = 0; i < 60; i++) {
        step(m);
        if (w.botFoe[4] === 0) return 0;
      }
      return -1;
    };
    expect(foeAt(300)).toBe(-1);
    expect(foeAt(DIFFICULTY_RULES.easy.truceUntil)).toBe(0);
  });

  it('catch-up is +35% a level behind beyond the first; the trailing team gets 1.5× the rat camp', () => {
    expect(XP.catchUpPerLevelBp).toBe(3500);
    expect(XP.campBehindBp).toBe(15000);
  });

  it('per-hero tuning replaced the species edge (dogs deal more and take less)', () => {
    expect(HEROES.brutus.pvp.dmgBp).toBeGreaterThan(10000);
    expect(HEROES.cacklejaw.pvp.takenBp).toBeLessThan(10000);
    // sim v9 balance pass: the cat heroes carry their own small numbers too (Clem 9300/10200, Sage 10300/9800)
    expect(HEROES.clem.pvp).toEqual({ dmgBp: 9300, takenBp: 10200 });
    expect(pvpNumbers('clem')).toBe('Hero fights (Normal, Hard): deals 7% less · takes 2% more');
    expect(pvpNumbers('brutus')).toMatch(/^Hero fights \(Normal, Hard\): deals 11% more · takes 7.5% less$/);
    // the bots chips no longer print a species handicap
    for (const h of Object.values(DIFFICULTY_HINT)) expect(h).not.toMatch(/species|Woof pack/);
  });
});

describe('round 2 client: why the match ended', () => {
  it('CoreLog names what hit a core most in its window', () => {
    const log = new CoreLog(600);
    log.add(0, 100, 'heroes', 500);
    log.add(0, 900, 'minions', 300);
    log.add(0, 950, 'minions', 300);
    expect(log.top(0, 1000)).toBe('minions'); // the hero hit at 100 is out of the window
    expect(log.top(1, 1000)).toBeNull();
  });

  it('a loss while ahead on takedowns says the core decided it', () => {
    const line = endCause({ won: false, reason: 'core', phase: 'suddenDeath', top: 'minions', kills: [10, 9], towers: [2, 2], oursForward: 3, oursAlive: 3 });
    expect(line).toBe('Their minions broke our core in Sudden Death while all 3 of us were in their base. Takedowns help, but towers and the core win.');
    expect(endCause({ won: false, reason: 'core', phase: 'suddenDeath', top: 'decay', kills: [3, 9], towers: [0, 2], oursForward: 0, oursAlive: 2 })).toMatch(/fewer takedowns burns faster/);
    expect(endCause({ won: true, reason: 'core', phase: 'play', top: 'heroes', kills: [4, 9], towers: [3, 1], oursForward: 2, oursAlive: 3 })).toBe('We broke their core. Behind on takedowns, but the core is what counts.');
    expect(endCause({ won: true, reason: 'safetyEnd', phase: 'suddenDeath', top: null, kills: [1, 1], towers: [0, 0], oursForward: 0, oursAlive: 3 })).toMatch(/Time ran out/);
  });

  it('the dare after a Rookie match says Rookie', () => {
    expect(dareText({ seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'rookie', seconds: 301 })).toBe('Beat my 5:01 vs Rookie bots in Pawlegends!');
    expect(dareText({ seed: 1, hero: 'clem', trick: 'pounce', difficulty: 'easy', seconds: 301 })).toBe('Beat my 5:01 vs Easy bots in Pawlegends!');
  });

  it('Change hero teases a hero not yet won with', () => {
    expect(tryHeroFor('clem', {})).toBe('sage');
    expect(tryHeroFor('clem', { sage: { fastest: 1, takedowns: 1 } })).toBe('brutus');
    // sim v9: after Cacklejaw come the shelter champions
    expect(tryHeroFor('cacklejaw', { clem: {}, sage: {}, brutus: {} })).toBe('lambo');
    expect(tryHeroFor('gabe', {})).toBe('clem');
  });
});

describe('round 2 client: names, cats and controls', () => {
  it('bots get persona names from the seed, unique in a match; the human keeps the title', () => {
    const picks = ['clem', 'clem', 'sage', 'brutus', 'brutus', 'cacklejaw'] as const;
    const a = slotNames(picks, 42, 0);
    expect(a[0]).toBe('Clem');
    expect(new Set(a).size).toBe(6);
    expect(a[1]).toMatch(/ the Clem$/);
    expect(a[3]).toMatch(/ the Brutus$/);
    expect(CAT_NAMES.some((n) => a[1].startsWith(n))).toBe(true);
    expect(DOG_NAMES.some((n) => a[3].startsWith(n))).toBe(true);
    expect(slotNames(picks, 42, 0)).toEqual(a);
    expect(slotNames(picks, 43, 0)).not.toEqual(a);
  });

  it('a squad chip names its tier and element, never "no frame"', () => {
    expect(tierLabel({ tier: 'LEGENDARY', type: 'FIRE' })).toBe('Legendary · Fire');
    expect(tierLabel({ tier: 'COMMON', type: 'WATER' })).toBe('Water');
  });

  it('adopting a cat keeps the Legendary adopted by name over a pack Legendary', () => {
    const cats: RosterCat[] = [
      { id: 'blaze', name: 'Blaze', type: 'FIRE', tier: 'LEGENDARY', isStarter: false, origin: 'pack' },
      { id: 'queenie', name: 'Queenie', type: 'FAIRY', tier: 'LEGENDARY', isStarter: false, origin: 'adopted' },
      { id: 'luna', name: 'Luna', type: 'WATER', tier: 'RARE', isStarter: false, origin: 'adopted' },
    ] as RosterCat[];
    expect(rosterCosmetics(cats, ['luna']).companions.map((c) => c.name)).toEqual(['Luna', 'Queenie']);
    // a chosen squad of two plus a new adoption drops the lower tier of the two
    const withCommon = [...cats, { id: 'tom', name: 'Tom', type: 'SAND', tier: 'COMMON', isStarter: false, origin: 'adopted' } as RosterCat];
    expect(rosterCosmetics(withCommon, ['luna', 'tom', 'queenie']).companions.map((c) => c.name)).toEqual(['Luna', 'Queenie']);
  });

  it('a kitten without a breed takes its element colour; breed coats stay', () => {
    expect(companionCoat(3, 'FIRE').base).not.toBe(kittenCoat(3).base);
    expect(companionCoat('PINKIE', 'FIRE')).toEqual(kittenCoat('PINKIE'));
  });

  it('the joystick slides along a wall instead of pushing into it', () => {
    // find a walkable cell with a wall 1 m below it and open ground left or right (a wall edge), then push down
    const g = createGrid();
    const a = -Math.PI / 2;
    let found: { x: number; y: number } | null = null;
    for (let y = 4500; y < 56000 && !found; y += 1000) {
      for (let x = 4500; x < 96000 && !found; x += 1000) {
        const open = (px: number, py: number): boolean => walkable(g, cellOf(px, py));
        if (open(x, y) && !open(x, y - 1200) && open(x + 2400, y) && open(x - 2400, y)) found = { x, y };
      }
    }
    expect(found).not.toBeNull();
    const out = slideAngle(found!.x, found!.y, a);
    expect(out).not.toBe(a);
    expect(Math.abs(out - a)).toBeLessThanOrEqual((4 * Math.PI) / 9 + 1e-9);
    // open ground keeps the input
    expect(slideAngle(50000, 30000, 0)).toBe(0);
  });

  it('desktop windows 1100 px and wider zoom out further', () => {
    expect(zoomMax(1280)).toBe(ZOOM_MAX_WIDE);
    expect(zoomMax(844)).toBe(ZOOM_MAX);
    expect(ZOOM_MAX_WIDE / ZOOM_MAX).toBeGreaterThan(1.35);
  });

  it('the talent auto-pick runs on wall-clock time (a slow phone no longer stretches it)', () => {
    const picks: number[] = [];
    const p = new TalentPicker(document.body, 'clem', (tier) => picks.push(tier));
    p.offer(0);
    // a 4 fps phone for 10.5 s of wall clock: a summed, clamped frame dt ran slow, the wall clock does not
    for (let t = 0; t <= 10500; t += 250) p.tick(true, 1, t);
    expect(picks).toEqual([0]);
    // a tab switch (9.5 s with no frame) counts at most 1 s, and paused time not at all
    p.offer(1);
    p.tick(true, 1, 20000);
    p.tick(false, 1, 40000);
    p.tick(true, 1, 41000);
    expect(p.timeLeft).toBeCloseTo(TALENT_AUTO_S - 2, 5);
    expect(TALENT_AUTO_S).toBe(10);
    p.dispose();
  });
});
