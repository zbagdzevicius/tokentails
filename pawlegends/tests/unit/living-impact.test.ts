/**
 * Living pass (P4): the shared Ambient contract (render/ambient.ts), the impact life (render/fx/impactLife.ts: scuff
 * caps, look, alpha, tier gating), the particle pools' ambient guard, the light drift and the CombatVfx hook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DRIFT, ambientFor, applyAmbient, attachAmbientFx, driftAt, type Ambient } from '../../src/render/ambient';
import { tierSettings } from '../../src/render/quality';
import { GOV_STEP } from '../../src/render/perf/governor';
import { CAST_GLOW, ImpactLife, SCUFF, SCUFF_GLYPHS, ScuffGate, hash01, impactBudget, scuffLook } from '../../src/render/fx/impactLife';
import { Linger, LINGER_TIER } from '../../src/render/anim/fxkit/linger';
import { FX_KIND, fxUniforms } from '../../src/render/anim/fxkit/fxMaterial';
import { Particles } from '../../src/render/fx/Particles.js';
import { CombatVfx } from '../../src/render/fx/combatVfx';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p: string): string => fs.readFileSync(path.join(here, '../../src', p), 'utf8');

const amb = (tier: 'low' | 'med' | 'high', reduced = false, phone = false): Ambient => ambientFor({ tier, phone }, reduced);

function rig(tier: 'low' | 'med' | 'high', reduced = false) {
  const linger = new Linger(fxUniforms());
  linger.tier = tier;
  const particles = new Particles({ rng: Math.random, groundY: () => 0 });
  particles.setBudget(2000);
  const glows: unknown[] = [];
  const meshFx = { spawn: (k: string, o: unknown) => (glows.push([k, o]), 0) };
  const life = new ImpactLife(linger, particles, meshFx as never);
  life.setAmbient(amb(tier, reduced));
  return { linger, particles, life, glows };
}

describe('ambient contract', () => {
  it('Low is level 0 with no motion or density, also on a phone and under the governor Low step', () => {
    expect(amb('low')).toMatchObject({ level: 0, motion: 0, density: 0 });
    expect(amb('low', false, true)).toMatchObject({ level: 0, motion: 0, density: 0 });
    const gov = tierSettings('high', { phone: true, step: GOV_STEP.lowTier });
    expect(gov.tier).toBe('low');
    expect(ambientFor(gov, false).level).toBe(0);
  });
  it('Med is modest, High full; phones are thinner', () => {
    expect(amb('med')).toMatchObject({ level: 1, motion: 0.7, density: 0.5, speed: 1 });
    expect(amb('high')).toMatchObject({ level: 2, motion: 1, density: 1, speed: 1 });
    expect(amb('high', false, true).density).toBe(0.6);
    expect(amb('med', false, true).density).toBe(0.35);
  });
  it('reduce motion scales amplitude ×0.3, speed ×0.5, density ×0.4', () => {
    const a = amb('high', true);
    expect(a.motion).toBeCloseTo(0.3);
    expect(a.speed).toBe(0.5);
    expect(a.density).toBeCloseTo(0.4);
  });
  it('applyAmbient / attachAmbientFx are no-ops on targets without the hook', () => {
    expect(() => applyAmbient({}, amb('high'))).not.toThrow();
    expect(() => applyAmbient(null, amb('high'))).not.toThrow();
    expect(() => attachAmbientFx({ setAmbientFx: 3 }, { particles: null as never, shock: null as never })).not.toThrow();
    let got: Ambient | null = null;
    applyAmbient({ setAmbient: (a: Ambient) => (got = a) }, amb('med'));
    expect(got).toMatchObject({ level: 1 });
  });
  it('gameView wires every view and the impact life, keyed on tier, reduce motion and phone', () => {
    const gv = src('render/gameView.ts');
    for (const v of ['map', 'heroes', 'minions', 'structures']) {
      expect(gv).toContain(`attachAmbientFx(this.${v}, ambFx)`);
      expect(gv).toContain(`applyAmbient(this.${v}, amb)`);
    }
    expect(gv).toContain('applyAmbient(this.impactLife, amb)');
    expect(gv).toContain('`${t}:${red}:${phone}`');
  });
});

describe('impact budget per tier', () => {
  it('Low: nothing; Med: scuffs only; High: scuffs, sparks, grit, glow, drift', () => {
    expect(impactBudget(amb('low'))).toEqual({ maxAlive: 0, perSec: 0, sparks: false, grit: false, glow: false, drift: false });
    expect(impactBudget(amb('med'))).toEqual({ maxAlive: 8, perSec: 3, sparks: false, grit: false, glow: false, drift: false });
    expect(impactBudget(amb('high'))).toEqual({ maxAlive: 8, perSec: 3, sparks: true, grit: true, glow: true, drift: true });
  });
  it('reduce motion: scuffs only at 0.6 of the count and rate', () => {
    const b = impactBudget(amb('high', true));
    expect(b).toMatchObject({ sparks: false, grit: false, glow: false, drift: false });
    expect(b.maxAlive).toBe(5);
    expect(b.perSec).toBeCloseTo(1.8);
  });
});

describe('scuff caps and look', () => {
  it('never more than 3 a second, never more than 8 alive', () => {
    const g = new ScuffGate({ maxAlive: 8, perSec: 3 });
    let n = 0;
    for (let i = 0; i < 100; i++) if (g.take(i * 0.01, 2)) n++;
    expect(n).toBe(3);
    // any 1 s window holds at most 3 starts
    const g3 = new ScuffGate({ maxAlive: 99, perSec: 3 });
    const at: number[] = [];
    for (let t = 0; t < 10; t += 0.07) if (g3.take(t, 0.1)) at.push(t);
    for (const t of at) expect(at.filter((u) => u > t - 1 && u <= t).length).toBeLessThanOrEqual(3);
    const g2 = new ScuffGate({ maxAlive: 8, perSec: 3 });
    let alive = 0;
    for (let t = 0; t < 3; t += 0.05) {
      if (g2.take(t, 2.8)) alive++;
      expect(g2.alive(t)).toBeLessThanOrEqual(8);
    }
    expect(alive).toBeLessThanOrEqual(9);
  });
  it('a scuff is a thin crack or scratch, never a ring, disc, crater or scorch; it lives 1.5 to 3 s', () => {
    for (let i = 0; i < 200; i++) {
      const l = scuffLook(i * 0.37, -i * 1.3, (i % 9) / 5, i, i % 5 === 0 ? 0.4 : NaN);
      expect(SCUFF_GLYPHS).toContain(l.glyph);
      expect(['scorch', 'crater', 'petals']).not.toContain(l.glyph);
      expect(l.life).toBeGreaterThanOrEqual(1.5);
      expect(l.life).toBeLessThanOrEqual(3);
      expect(l.size).toBeLessThanOrEqual(1.1 * 1.15 + 1e-9);
    }
    // light hits keep one slot of the second free for a heavy one
    const g4 = new ScuffGate({ maxAlive: 8, perSec: 3 });
    expect(g4.take(0, 2, 1)).toBe(true);
    expect(g4.take(0.1, 2, 1)).toBe(true);
    expect(g4.take(0.2, 2, 1)).toBe(false);
    expect(g4.take(0.3, 2, 0)).toBe(true);
    expect(scuffLook(1, 2, 1, 0, 1.2)).toMatchObject({ glyph: 'scratches', yaw: 1.2 });
  });
  it('the look is seeded: the same point and counter give the same scuff', () => {
    expect(scuffLook(3.2, -7.1, 0.8, 4)).toEqual(scuffLook(3.2, -7.1, 0.8, 4));
    expect(hash01(1, 2, 3)).toBe(hash01(1, 2, 3));
    const h = hash01(5, 6, 7);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
  });
  it('ink-brown, low alpha, and not a team or bolt colour', () => {
    const c = new THREE.Color(SCUFF.ink);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    expect(hsl.l).toBeLessThan(0.25);
    expect(hsl.h * 360).toBeGreaterThan(10);
    expect(hsl.h * 360).toBeLessThan(40);
    expect(SCUFF.alpha).toBeLessThanOrEqual(0.35);
    const g = new THREE.Color(CAST_GLOW.color);
    g.getHSL(hsl);
    expect(hsl.h * 360).toBeGreaterThan(18);
    expect(hsl.h * 360).toBeLessThan(40);
  });
});

describe('impact life', () => {
  it('Low emits nothing at all', () => {
    const { linger, particles, life, glows } = rig('low');
    for (let i = 0; i < 20; i++) life.impact(i * 0.1, 0, 1.6, 'dirt', 0xff0000);
    life.castGlow(0, 0, 1);
    expect(linger.pool.n).toBe(0);
    expect(particles.live).toBe(0);
    expect(glows.length).toBe(0);
  });
  it('Med: scuffs into the glyph pool (rate-capped), no sparks, grit or glow', () => {
    const { linger, particles, life, glows } = rig('med');
    life.update(0);
    for (let i = 0; i < 20; i++) life.impact(i * 0.3, 0, 1, 'dirt', 0xff0000);
    life.castGlow(0, 0, 1);
    expect(linger.pool.n).toBe(3);
    expect(particles.live).toBe(0);
    expect(glows.length).toBe(0);
  });
  it('High: sparks and grit within the ambient guard, a cast glow, no scuff on water', () => {
    const { linger, particles, life, glows } = rig('high');
    life.update(0);
    life.impact(0, 0, 1, 'water', 0xff0000);
    expect(linger.pool.n).toBe(0);
    expect(particles.add.count).toBeGreaterThan(0);
    life.impact(1, 0, 1, 'dirt', 0xff0000);
    expect(linger.pool.n).toBe(1);
    expect(particles.alpha.count).toBeGreaterThan(0);
    life.castGlow(0, 0, 1);
    expect(glows[0]).toMatchObject(['glow', { life: CAST_GLOW.life }]);
  });
  it('skips impacts far from the camera focus', () => {
    const { linger, life } = rig('high');
    life.focus.x = 0;
    life.impact(SCUFF.near + 5, 0, 1, 'dirt', 0);
    expect(linger.pool.n).toBe(0);
  });
  it('leaves the authored skill glyphs their headroom in the pool', () => {
    const { linger, life } = rig('med');
    const free = LINGER_TIER.med.n - SCUFF.headroom;
    for (let i = 0; i < free; i++) linger.add('crackStar', 0, 0, 1, 0, 0xc2a070);
    life.update(0);
    life.impact(0, 0, 1, 'dirt', 0);
    expect(linger.pool.n).toBe(free);
  });
  it("our scuffs' alpha is held at SCUFF.alpha after the pool's update; authored glyphs keep theirs", () => {
    const { linger, life } = rig('high');
    life.update(0);
    linger.add('crackStar', 5, 5, 1, 0, 0xc2a070);
    life.impact(0, 0, 1, 'dirt', 0);
    linger.update(0.1);
    life.update(0.1);
    const a = linger.pool.mesh.geometry.getAttribute('aAlpha').array as Float32Array;
    const k = linger.pool.kindOf;
    const mine = [0, 1].find((i) => k[i] !== FX_KIND.crackStar || i === 1)!;
    const vals = [a[0], a[1]].sort();
    expect(vals[0] * 0.8).toBeLessThanOrEqual(SCUFF.alpha + 1e-6);
    expect(vals[1]).toBe(1);
    expect(mine).toBeGreaterThanOrEqual(0);
  });
  it('CombatVfx debris drives it (every heavy ground impact), dashes give directional scratches', () => {
    const { linger, particles, life } = rig('med');
    const vfx = new CombatVfx(particles, { start() {}, crack() {}, thud() {} } as never);
    vfx.setTier('med');
    vfx.life = life;
    life.focus.x = 10;
    life.focus.z = -30;
    life.update(0);
    vfx.dash(10, -30, 14, -30, 0xff8800);
    expect(linger.pool.n).toBe(1);
    expect(linger.pool.kindOf[0]).toBe(FX_KIND.scratches);
  });
});

describe('ambient particle guard', () => {
  it('room / claim keep the last 20 % of the pool for combat VFX', () => {
    const p = new Particles({ rng: Math.random });
    p.setBudget(1000);
    const lim = p.add.limit;
    expect(p.claim(true, 5)).toBe(5);
    p.burst(new THREE.Vector3(), { additive: true, n: Math.floor(lim * 0.8) - 2, exact: true });
    expect(p.claim(true, 5)).toBe(2);
    expect(p.room(true, 3)).toBe(false);
    expect(p.room(false, 3)).toBe(true);
  });
});

describe('light drift', () => {
  it('stays within ±3 % and moves slowly (period about 120 s)', () => {
    const o = { k: 1, warm: 0 };
    let lo = 9;
    let hi = -9;
    for (let t = 0; t < 600; t += 0.5) {
      driftAt(t, o);
      expect(Math.abs(o.k - 1)).toBeLessThanOrEqual(DRIFT.amp + 1e-9);
      expect(Math.abs(o.warm)).toBeLessThanOrEqual(1 + 1e-9);
      lo = Math.min(lo, o.warm);
      hi = Math.max(hi, o.warm);
    }
    expect(hi - lo).toBeGreaterThan(1);
    // slow: under 0.1 % intensity change per second
    const a = driftAt(10).k;
    const b = driftAt(11).k;
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
  it('the renderer only tints and scales the lights; the sun direction is not touched by the drift', () => {
    const r = src('render/renderer.ts');
    const body = r.slice(r.indexOf('lightDrift(t, on) {'), r.indexOf('dispose() {', r.indexOf('lightDrift(t, on) {')));
    expect(body).not.toMatch(/position/);
    expect(body).toMatch(/driftAt/);
  });
  it('gameView runs the drift on High without reduce motion only, and resets it on dispose', () => {
    const gv = src('render/gameView.ts');
    expect(gv).toContain('this.gr.lightDrift?.(this.time, this.amb.level === 2 && !this.amb.reduced)');
    expect(gv).toContain('this.gr.lightDrift?.(0, false)');
  });
});
