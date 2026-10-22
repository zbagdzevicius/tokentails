/**
 * ANIM-SPEC §9 / §12 readability.test: mesh FX over an enemy windup dim to 35% (ally windups never dim), enemy
 * effects get the danger rim, the coverage budget fades own / ally effects (never below 0.5), lingering glyphs are
 * never red, and FX layers draw under the telegraphs.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coverageFade, dimAt, packTele, RIM } from '../../../src/render/anim/fxkit/readability';
import { TELE_SLOTS } from '../../../src/render/anim/fxkit/fxMaterial';
import { MeshFx } from '../../../src/render/anim/fxkit/meshFx';
import { Linger } from '../../../src/render/anim/fxkit/linger';
import { Ribbons } from '../../../src/render/anim/trails';
import { RELATION } from '../../../src/render/palette';
import { TELEGRAPH_OVER } from '../../../src/render/telegraph';

describe('readability', () => {
  const tele = Array.from({ length: TELE_SLOTS }, () => new THREE.Vector4());
  const who = (id: number) => (id === 1 ? { team: 1, x: 10, z: -10 } : id === 2 ? { team: 0, x: 0, z: 0 } : null);

  it('a fragment over an enemy windup dims; an ally windup does not', () => {
    const n = packTele(
      [
        { src: 1, x: 14000, y: 10000, start: 0, ticks: 30 },
        { src: 2, x: 30000, y: 30000, start: 0, ticks: 15 },
      ],
      who,
      0,
      tele,
    );
    expect(n).toBe(1);
    expect(dimAt(12, -10, tele)).toBe(0.35);
    expect(dimAt(10, -10, tele)).toBe(0.35);
    expect(dimAt(30, -30, tele)).toBe(1);
  });

  it('enemy effects get the danger rim; own gold', () => {
    expect(RIM.enemy).toBe(RELATION.danger);
    expect(RIM.own).toBe(RELATION.self);
    expect(RIM.ally).not.toBe(RELATION.enemy);
  });

  it('coverage budget fades own effects toward 0.5', () => {
    expect(coverageFade(10, 1000, 'med')).toBe(1);
    expect(coverageFade(400, 1000, 'med')).toBeLessThan(1);
    expect(coverageFade(5000, 1000, 'med')).toBe(0.5);
    expect(coverageFade(250, 1000, 'low')).toBeLessThan(1);
  });

  it('FX draw below the telegraphs', () => {
    const fx = new MeshFx();
    const lg = new Linger(fx.uniforms);
    const rb = new Ribbons();
    expect(fx.pools.ground.mesh.renderOrder).toBeLessThanOrEqual(2);
    expect(lg.mesh.renderOrder).toBeLessThanOrEqual(2);
    expect(rb.mesh.renderOrder).toBeLessThanOrEqual(2);
    expect(fx.pools.vertical.mesh.renderOrder).toBeLessThan(TELEGRAPH_OVER);
    expect(fx.pools.dome.mesh.renderOrder).toBeLessThan(TELEGRAPH_OVER);
  });

  it('per-tier caps: Low has no twister, curtain or chain', () => {
    const fx = new MeshFx();
    fx.tier = 'low';
    expect(fx.spawn('twister', { x: 0, z: 0, sx: 1, life: 1, color: 0xffffff, rim: 0xffffff, rel: 'own' })).toBe(-1);
    expect(fx.spawn('curtain', { x: 0, z: 0, sx: 1, life: 1, color: 0xffffff, rim: 0xffffff, rel: 'own' })).toBe(-1);
    expect(fx.spawn('crescent', { x: 0, z: 0, sx: 2, life: 1, color: 0xffffff, rim: 0xffffff, rel: 'own', p0: 1.57 })).toBe(0);
    for (let i = 0; i < 10; i++) fx.spawn('crescent', { x: 0, z: 0, sx: 2, life: 1, color: 0xffffff, rim: 0xffffff, rel: 'own' });
    fx.update(0.01, 0);
    expect(fx.live()).toBe(6);
  });
});
