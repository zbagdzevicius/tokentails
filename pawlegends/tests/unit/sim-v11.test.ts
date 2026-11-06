/**
 * Sim v11 (docs/plans/moba/CATS-V11.md §3): the four original cats join the roster at HERO_IDS 8..11; projectile
 * kinds 12 (cap) and 13 (fluff) count as hero ability damage; the snapshot carries `form`, `channel`, Duchess's
 * Disdain `stacks` and Stilts's Stride `resource` through the wire; a dash can carry its own speed; the overhead
 * draws Disdain pips and the Stride meter.
 */
import { describe, expect, it } from 'vitest';
import { BOT_AI } from '../../src/data/bots';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { CAT_HEROES } from '../../src/render/cosmetics';
import { PROJECTILE_KIND } from '../../src/data/towers';
import { decodeSnap, encodeSnap } from '../../src/host/protocol';
import { snapshot } from '../../src/sim/index';
import { dash, travelTicks } from '../../src/sim/effects';
import { SIM_VERSION } from '../../src/sim/version';
import { FM } from '../../src/sim/world';
import type { Team } from '../../src/sim/api';
import { STILTS_INDEX } from '../../src/sim/heroes/stilts';
import { disdainPips, strideMeter } from '../../src/ui/overhead';
import { MID, heroMatch, place } from './heroes/kit-helpers';

const NEW = ['meatball', 'pixel', 'duchess', 'stilts'] as const;

describe('sim v11 roster', () => {
  it('SIM_VERSION is 12 or later; the four cats are appended at 8..11, with new roles and elements', () => {
    expect(SIM_VERSION).toBeGreaterThanOrEqual(12);
    expect(HERO_IDS.slice(8, 12)).toEqual([...NEW]);
    expect(HERO_IDS.indexOf('stilts')).toBe(STILTS_INDEX);
    expect(NEW.map((h) => HEROES[h].role)).toEqual(['tank', 'marksman', 'mage', 'assassin']);
    expect(NEW.map((h) => HEROES[h].element)).toEqual(['GRASS', 'ICE', 'DARK', 'SAND']);
    for (const h of NEW) expect(HEROES[h].side, h).toBe('cat');
    expect(CAT_HEROES).toEqual(expect.arrayContaining([...NEW]));
  });

  it('projectile kinds cap 12 and fluff 13 (after hero: ability damage)', () => {
    expect(PROJECTILE_KIND.cap).toBe(12);
    expect(PROJECTILE_KIND.fluff).toBe(13);
    expect(PROJECTILE_KIND.cap).toBeGreaterThan(PROJECTILE_KIND.hero);
  });

  it('BOT_AI carries every number the new bots read', () => {
    for (const k of ['meatballLoafFoes', 'meatballPeelRange', 'meatballChonkRange', 'meatballChaseHpBp', 'meatballChaseRange', 'pixelBeamSafe', 'pixelBeamMin', 'pixelBoxbotHpBp', 'pixelBoxbotRange', 'duchessPeelRange', 'duchessSpacing', 'stiltsCommitHpBp', 'stiltsZoomiesHpBp', 'stiltsZoomiesRange', 'stiltsOrbit'] as const) {
      expect(Number.isInteger(BOT_AI[k]), k).toBe(true);
    }
    expect(BOT_AI.pixelBeamMin).toBeGreaterThan(BOT_AI.pixelBeamSafe);
  });
});

describe('sim v11 dash speed', () => {
  it('dash takes its own speed: Duchess glides 4 m in 10 ticks, the shared 20 m/s takes 6', () => {
    const m = heroMatch(['duchess', 'clem', 'sage', 'clem', 'sage', 'clem']);
    place(m, 0, MID.x, MID.y, 0);
    expect(dash(m, 0, 0, 4000, HEROES.duchess.abilities.e.speed)).toBe(10);
    expect(m.world.fmKind[0]).toBe(FM.Dash);
    expect(travelTicks(4000, 20000)).toBe(6);
  });
});

describe('sim v11 snapshot bits (sim → wire)', () => {
  const arena = () => {
    const m = heroMatch(['pixel', 'stilts', 'meatball', 'clem', 'sage', 'clem']);
    place(m, 0, MID.x, MID.y, 0);
    place(m, 1, MID.x, MID.y + 4000, 0);
    place(m, 3, MID.x + 3000, MID.y, 2048);
    return m;
  };
  const wire = (m: ReturnType<typeof arena>, viewer: Team, id: number) => decodeSnap(encodeSnap(snapshot(m, viewer))).entities.find((e) => e.id === id)!;

  it('form and channel go to both teams and survive the wire; absent when off', () => {
    const m = arena();
    expect(wire(m, 0, 0).form).toBeUndefined();
    expect(wire(m, 0, 0).channel).toBeUndefined();
    m.world.kWindow[0] = 30; // Boxbot
    m.world.kWT[0] = 20; // the beam
    for (const viewer of [0, 1] as const) {
      const e = wire(m, viewer, 0);
      expect(e.form, `viewer ${viewer}`).toBe(true);
      expect(e.channel, `viewer ${viewer}`).toBe(true);
    }
    m.world.kRT[1] = 30; // Zoomies
    expect(wire(m, 1, 1).form).toBe(true);
  });

  it('stacks (Disdain on the victim) go to both teams and survive the wire', () => {
    const m = arena();
    m.world.mkStack[3] = 2;
    m.world.mkT[3] = 60;
    expect(wire(m, 0, 3).stacks).toBe(2);
    expect(wire(m, 1, 3).stacks).toBe(2);
    m.world.mkStack[3] = 0;
    expect(wire(m, 0, 3).stacks).toBeUndefined();
  });

  it("Stilts's Stride rides `resource` to her own team only", () => {
    const m = arena();
    m.world.kValor[1] = 70;
    expect(wire(m, 0, 1).resource).toBe(70);
    expect(wire(m, 1, 1).resource).toBeUndefined();
  });
});

describe('sim v11 overhead reads', () => {
  it('disdainPips: lit crowns from stacks, none when dead or not a hero', () => {
    const max = HEROES.duchess.passive.stacks;
    expect(disdainPips({ kind: 'hero', stacks: 2, state: 'idle' })).toEqual({ lit: 2, max });
    expect(disdainPips({ kind: 'hero', state: 'idle' }).lit).toBe(0);
    expect(disdainPips({ kind: 'hero', stacks: 9, state: 'idle' }).lit).toBe(max);
    expect(disdainPips({ kind: 'hero', stacks: 2, state: 'dead' }).lit).toBe(0);
    expect(disdainPips({ kind: 'minion', stacks: 2, state: 'idle' }).lit).toBe(0);
  });

  it('strideMeter: her own Stilts only (resource present), full at max', () => {
    expect(strideMeter({ hero: 'stilts', resource: 50, state: 'idle' })).toBe(0.5);
    expect(strideMeter({ hero: 'stilts', resource: 100, state: 'idle' })).toBe(1);
    expect(strideMeter({ hero: 'stilts', state: 'idle' })).toBe(-1);
    expect(strideMeter({ hero: 'stilts', resource: 50, state: 'dead' })).toBe(-1);
    expect(strideMeter({ hero: 'clem', resource: 50, state: 'idle' })).toBe(-1);
  });
});
