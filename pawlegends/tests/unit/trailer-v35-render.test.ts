// @vitest-environment happy-dom
/**
 * Glare from the trailer v3.4 review (render only; nothing under src/sim changes): every blown-out white area left in
 * the cuts was an additive effect summed over pale ground (the sand paths, the river, the dog plaza): the shockwave
 * walls (Pack Hunt, the teamfight slams, the core burst), the Champion's Challenge circle (a zone decal) and the level
 * auras round the heroes' feet. The walls now draw in their own capped colour, the additive ground marks with a screen
 * blend, so neither can reach white; both stay as large and as coloured as before.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SHOCK_LUMA_MAX, Shockwaves, shockColor } from '../../src/render/fx/Shockwaves.js';
import { DecalLayer, SCREEN_BLEND, ringTexture } from '../../src/render/views/decals';

const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('shockwave walls never sum to white', () => {
  it('a cream or white wall colour is scaled down to the luma cap, its hue kept', () => {
    for (const hex of ['#FFFFFF', '#FFF1D6', '#FFE0C8', '#FFE066']) {
      const c = shockColor(hex);
      expect(luma(c)).toBeLessThanOrEqual(SHOCK_LUMA_MAX + 1e-6);
      expect(luma(c)).toBeGreaterThan(SHOCK_LUMA_MAX - 0.01);
    }
    const [r, g, b] = shockColor('#FFE066');
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // the cap keeps even the lightest wall under the trailer's glare line (Y 225 of 255) at full cover with the rim lift
    expect(SHOCK_LUMA_MAX * 1.1 * 255).toBeLessThan(225);
  });

  it('a saturated wall colour is left as it is', () => {
    const [r, g, b] = shockColor('#FF5A36');
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0x5a / 255, 3);
    expect(b).toBeCloseTo(0x36 / 255, 3);
  });

  it('the wall is drawn with normal blending, not added on top of the ground', () => {
    const sh = new Shockwaves({}, { particles: { burst() {}, single() {} }, groundY: () => 0, rng: () => 0.5 });
    sh.init(new THREE.Scene());
    expect(sh.rings.length).toBeGreaterThan(0);
    for (const r of sh.rings) expect(r.material.blending).toBe(THREE.NormalBlending);
    sh.start({ x: 0, y: 0, z: 0 }, { color: '#FFF1D6' });
    const c = sh.rings[0].material.uniforms.uColor.value as THREE.Color;
    const out = { r: 0, g: 0, b: 0 };
    c.getRGB(out, THREE.SRGBColorSpace);
    expect(luma([out.r, out.g, out.b])).toBeLessThanOrEqual(SHOCK_LUMA_MAX + 1e-3);
  });
});

describe('additive ground marks are screen-blended', () => {
  it('an additive DecalLayer blends dst + src * (1 - dst) on the premultiplied mark', () => {
    const m = new DecalLayer(ringTexture(), 2, { additive: true, name: 'level-aura' }).mesh.material as THREE.MeshBasicMaterial;
    expect(m.blending).toBe(THREE.CustomBlending);
    expect(m.blendSrc).toBe(THREE.OneMinusDstColorFactor);
    expect(m.blendDst).toBe(THREE.OneFactor);
    expect(m.premultipliedAlpha).toBe(true);
    expect(SCREEN_BLEND.blending).toBe(THREE.CustomBlending);
  });

  it('screen blending never brightens pale ground past white the way additive did', () => {
    const screen = (dst: number, src: number) => dst + src * (1 - dst);
    // a 0.35 mark over the sand or the plaza (0.78, Y about 200): additive clipped it, the screen blend stays under the glare line
    expect(0.78 + 0.35).toBeGreaterThan(1);
    expect(screen(0.78, 0.35) * 255).toBeLessThan(225);
    // over grass (0.45) it still lifts the mark clearly
    expect(screen(0.45, 0.35) - 0.45).toBeGreaterThan(0.18);
  });

  it('a non-additive layer keeps normal blending', () => {
    const m = new DecalLayer(ringTexture(), 2, { additive: false }).mesh.material as THREE.MeshBasicMaterial;
    expect(m.blending).toBe(THREE.NormalBlending);
  });
});
