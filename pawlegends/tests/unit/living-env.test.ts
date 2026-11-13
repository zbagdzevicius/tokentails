import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ambientFor } from '../../src/render/ambient';
import { WIND, WIND_GLSL, patchWind, stepWind, windAmp, windUniforms, windWeight } from '../../src/render/views/env/wind';
import { CLOUD, cloudCover, cloudDarken, cloudUniforms, patchCloudShadow, stepClouds } from '../../src/render/views/env/clouds';
import { WATER, riverLifeUniforms, stepWater, waterLive } from '../../src/render/views/env/waterLife';
import { BANNER, clothWave, livingAmp, livingMaterial, livingUniforms, stepLiving } from '../../src/render/views/env/banner';
import { bridgeParts, riverWeirs } from '../../src/render/views/mapView';
import { hwRiverWeirs } from '../../src/render/views/hearthwoodView';
import { MAP } from '../../src/data/map';

const tiers = ['low', 'med', 'high'] as const;
const all = tiers.flatMap((tier) => [false, true].flatMap((phone) => [false, true].map((reduced) => ambientFor({ tier, phone }, reduced))));

/** A fake three.js shader with the chunks the patches hook. */
const fakeShader = (): { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string } => ({
  uniforms: {},
  vertexShader: '#include <common>\nvoid main(){\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>\n}',
  fragmentShader: '#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n#include <dithering_fragment>\n}',
});

describe('living pass P1: environment life', () => {
  it('Low is still: every amplitude is 0 and the uniforms stay 0 after a step', () => {
    for (const a of all.filter((x) => x.level === 0)) {
      expect(windAmp(a)).toBe(0);
      expect(cloudDarken(a)).toBe(0);
      expect(waterLive(a)).toBe(0);
      expect(livingAmp(a)).toBe(0);
      const w = windUniforms();
      const c = cloudUniforms();
      const r = riverLifeUniforms([]);
      const l = livingUniforms();
      for (let i = 0; i < 10; i++) {
        stepWind(w, a, 0.016);
        stepClouds(c, a, 0.016);
        stepWater(r, a, 0.016);
        stepLiving(l, a, 0.016);
      }
      expect([w.uWindAmp.value, w.uWindT.value, c.uCloud.value, c.uCloudOff.value.length(), r.uLive.value, r.uFlowT.value, l.uLiveAmp.value, l.uLiveT.value]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    }
  });

  it('Med is modest, High full, reduce motion damps amplitude and halves speed', () => {
    const med = ambientFor({ tier: 'med', phone: false }, false);
    const high = ambientFor({ tier: 'high', phone: false }, false);
    const highR = ambientFor({ tier: 'high', phone: false }, true);
    expect(windAmp(med)).toBeCloseTo(0.7);
    expect(windAmp(high)).toBe(1);
    expect(windAmp(highR)).toBeCloseTo(0.3);
    expect(cloudDarken(med)).toBe(CLOUD.med);
    expect(cloudDarken(high)).toBe(CLOUD.high);
    const w = windUniforms();
    stepWind(w, highR, 1);
    expect(w.uWindT.value).toBeCloseTo(0.5);
    const c = cloudUniforms();
    stepClouds(c, high, 1);
    expect(c.uCloudOff.value.length()).toBeCloseTo(CLOUD.drift, 2);
    const cr = cloudUniforms();
    stepClouds(cr, highR, 1);
    expect(cr.uCloudOff.value.length()).toBeCloseTo(CLOUD.drift * 0.5, 2);
  });

  it('the cloud shadow never darkens more than 6 %, and cover is a soft 0..1 blob', () => {
    for (const a of all) expect(cloudDarken(a)).toBeLessThanOrEqual(0.06);
    expect(cloudCover(0)).toBe(0);
    expect(cloudCover(1)).toBe(1);
    expect(cloudCover(0.65)).toBeGreaterThan(0);
    expect(cloudCover(0.65)).toBeLessThan(1);
  });

  it('the wind weight is 0 at a bush base and at the trunk top, and a bush sways under 3 cm', () => {
    expect(windWeight(0.15, 0.15)).toBe(0);
    expect(windWeight(0, 0.15)).toBe(0);
    // a tree of scale s: its trunk (top 1.6 s) and pivot at 1.2 s
    for (const s of [0.75, 1, 1.6]) {
      expect(windWeight(0, 1.2 * s)).toBe(0);
      expect(windWeight(1.2 * s, 1.2 * s)).toBe(0);
      expect(windWeight(4.3 * s, 1.2 * s)).toBeGreaterThan(0.9);
    }
    // the highest bush leaf: 0.7 m centre + 1.15 m radius × 0.85
    const top = 0.7 + 1.15 * 0.85;
    expect(WIND.bushCm * windWeight(top, 0.15)).toBeLessThanOrEqual(3);
    // the shader adds up to |dir·(0.72+0.28)·1 + 0.25| + 0.3 across: under 1.6 × the cm figure at full weight
    expect(WIND.bushCm * windWeight(top, 0.15) * 1.6).toBeLessThan(4);
    expect(WIND.treeCm).toBeLessThanOrEqual(5);
  });

  it('patches chain onto the material’s own compile, bump the cache keys, and the sway lands before the cut line', () => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    };
    m.customProgramCacheKey = () => 'pl-forest-cut-v1';
    const u = windUniforms();
    patchWind(m, u);
    expect(m.customProgramCacheKey()).toBe('pl-forest-cut-v1-wind1');
    const sh = fakeShader();
    m.onBeforeCompile(sh as never, {} as never);
    expect(sh.uniforms.uWindAmp).toBe(u.uWindAmp);
    const body = sh.vertexShader.indexOf('transformed += plD * plWk');
    expect(body).toBeGreaterThan(0);
    expect(body).toBeLessThan(sh.vertexShader.indexOf('vFW ='));
    // Low = a uniform, never a define: one program on every tier
    expect(WIND_GLSL.body).toContain('uWindAmp > 0.0');
    expect(sh.vertexShader).not.toMatch(/#define\s+PL_/);

    const g = new THREE.MeshLambertMaterial();
    g.customProgramCacheKey = () => 'pl-outer-grass-v1';
    patchCloudShadow(g, cloudUniforms());
    expect(g.customProgramCacheKey()).toBe('pl-outer-grass-v1-cloud1');
    const gs = fakeShader();
    g.onBeforeCompile(gs as never, {} as never);
    expect(gs.fragmentShader.indexOf('uCloud > 0.0')).toBeLessThan(gs.fragmentShader.indexOf('#include <dithering_fragment>'));

    const lm = livingMaterial(livingUniforms(), 'pl-living-v1');
    expect(lm.customProgramCacheKey()).toBe('pl-living-v1');
    const ls = fakeShader();
    lm.onBeforeCompile(ls as never, {} as never);
    expect(ls.vertexShader.indexOf('plLz = sin')).toBeLessThan(ls.vertexShader.indexOf('transformed.z += plLz'));
  });

  it('the banner cloth is pinned at the pole and waves at most BANNER.wave at its free edge', () => {
    for (let t = 0; t < 6; t += 0.37) {
      expect(clothWave(0, t, 1.3, 1)).toBeCloseTo(0, 6);
      expect(Math.abs(clothWave(BANNER.width, t, 1.3, 1))).toBeLessThanOrEqual(BANNER.wave + 1e-9);
      expect(clothWave(BANNER.width, t, 1.3, 0)).toBeCloseTo(0, 9);
    }
  });

  it('river foam sits on both edges of every bridge deck and on the log jams, inside the river run', () => {
    const w = riverWeirs();
    expect(w.length).toBe(bridgeParts().length + 2);
    expect(w.length).toBeLessThanOrEqual(WATER.weirs);
    for (const b of bridgeParts()) expect(w.some((x) => Math.abs(x.at + b.deckY) < 1e-9 && Math.abs(x.half - b.width / 2) < 1e-9)).toBe(true);
    const H = MAP.height / 1000;
    for (const x of w) {
      expect(x.at).toBeLessThanOrEqual(0.5);
      expect(x.at).toBeGreaterThanOrEqual(-H - 0.5 - 2);
    }
    // Hearthwood: a crossing at the map centre sits at 0 along the diagonal
    expect(hwRiverWeirs([{ x: 30, y: 30 }], 60, 60)[0].at).toBeCloseTo(0);
    expect(hwRiverWeirs([{ x: 40, y: 20 }], 60, 60)[0].at).toBeCloseTo(20 / Math.SQRT2);
    // unused slots are switched off (half < 0)
    const u = riverLifeUniforms(w);
    expect(u.uWeir.value.filter((v) => v.y < 0).length).toBe(WATER.weirs - w.length);
  });
});
