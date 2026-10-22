/**
 * Feel lane, iteration 4 render checks (headless): the phone tunnel look (F2), the Night Wild Card theme and kart
 * headlights (F11), and the Rug furniture fade (F14).
 */
import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshToonMaterial, BoxGeometry, Scene, type MeshBasicMaterial } from 'three';
import { DEFAULT_CAT, Modifier, type RaceState, type RacerInfo, type BodyId } from '../../types';
import { buildTrack } from '../track/build';
import { THEMES, nightTheme, themeOf } from '../track/themes';
import { RUG, TRACKS } from '../track/tracks';
import { raceConfig, world, stuntLab } from '../../test/fixtures';
import { TunnelFx, TUNNEL_FX } from '../../juice/vfx/tunnel-fx';
import { STUNT } from '../../tuning';
import { RaceView } from './race-view';
import { buildWorldView } from './world-view';
import { HEADLIGHTS } from './night';
import { OCCLUDER, OccluderFade, RUG_PROPS, blocksSight, furnitureGroups } from './occluder-fade';

const lum = (c: number) => 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);

describe('tunnel streaks on a phone (F2)', () => {
  const run = (narrow: boolean) => {
    const def = stuntLab();
    const t = buildTrack(def);
    const fx = new TunnelFx(new Scene(), t, THEMES[0]);
    fx.narrow = narrow;
    const w = world(raceConfig(def, { humans: [0], solo: true }));
    const pc = t.pieces.find((p) => p.kind === 'tunnel')!;
    w.st.karts[0].si = pc.i0 + 3;
    for (let n = 0; n < 40; n++) fx.update(w.st, 0, 1, 30, 1 / 60, false);
    // heights of the drawn streaks above the road
    const hs: number[] = [];
    const e = fx.mesh.instanceMatrix.array;
    for (let i = 0; i < fx.mesh.count; i++) {
      const y = e[i * 16 + 13];
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < t.n; j++) {
        const d = (t.px[j] - e[i * 16 + 12]) ** 2 + (t.pz[j] - e[i * 16 + 14]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      hs.push(y - t.py[best]);
    }
    return { fx, hs, opacity: (fx.mesh.material as MeshBasicMaterial).opacity };
  };

  it('narrow: half opacity, walls only (never the crown), 4 m near fade; wide keeps the arch', () => {
    const wide = run(false);
    const phone = run(true);
    expect(phone.fx.drawn).toBeGreaterThan(4);
    expect(phone.opacity).toBeCloseTo(wide.opacity * TUNNEL_FX.narrowOpacity, 5);
    const crown = STUNT.tunnel.ceiling * 0.8;
    expect(Math.max(...phone.hs)).toBeLessThan(crown);
    expect(Math.max(...wide.hs)).toBeGreaterThan(crown);
    expect(TUNNEL_FX.nearFade).toBe(4);
    expect(TUNNEL_FX.facetsNarrow.every((f) => f < 2 || f > 6)).toBe(true);
  });
});

describe('Night Wild Card render (F11)', () => {
  it('turns every day theme dark, keeps night themes, and keeps the road readable', () => {
    for (const id of [0, 2, 3, 5, 6] as const) {
      const d = THEMES[id];
      const n = nightTheme(d);
      expect(n.night).toBe(true);
      expect(lum(n.skyTop)).toBeLessThan(40);
      expect(lum(n.ground)).toBeLessThan(lum(d.ground));
      // the line and pads still stand out from the road
      expect(lum(n.line) - lum(n.road)).toBeGreaterThan(60);
      expect(n.pad).toBe(d.pad);
      expect(n.neonA).not.toBe(0);
    }
    expect(nightTheme(THEMES[1])).toBe(THEMES[1]);
    expect(nightTheme(THEMES[4])).toBe(THEMES[4]);
  });

  it('a Night race builds the night world (stars, warm fill) and 2 headlight meshes that follow the karts', () => {
    const def = TRACKS[0];
    const t = buildTrack(def);
    const day = buildWorldView(new Scene(), t);
    const night = buildWorldView(new Scene(), t, true);
    expect(day.theme).toBe(themeOf(def.theme));
    expect(night.theme.night).toBe(true);
    expect(day.group.getObjectByName('stars')).toBeUndefined();
    expect(night.group.getObjectByName('stars')).toBeDefined();
    const lights = (g: Group) => g.children.filter((c) => (c as { isDirectionalLight?: boolean }).isDirectionalLight).length;
    expect(lights(night.group)).toBe(lights(day.group) + 1);

    const racers: RacerInfo[] = Array.from({ length: 8 }, (_, i) => ({ name: `C${i}`, cat: DEFAULT_CAT, kart: { body: (i % 6) as BodyId, paint: [0xff5a5f, 0xfff3dc, 0x2a1a22], number: i }, hat: 0 }));
    const scene = new Scene();
    const plain = new RaceView(new Scene(), t, racers);
    expect(plain.headlights).toBeNull();
    const v = new RaceView(scene, t, racers, Modifier.Night | Modifier.Mirror);
    expect(v.headlights).not.toBeNull();
    expect(scene.getObjectByName('fm-headlight-pools')).toBeDefined();
    expect(scene.getObjectByName('fm-headlight-lamps')).toBeDefined();
    const w = world(raceConfig(def, { humans: [5] }));
    const st = w.st as RaceState;
    v.capture(st);
    v.capture(st);
    v.update(st, 1, 1 / 60, 30);
    // kart 5's pool lies ahead of the kart on the road
    const k = st.karts[5];
    const e = v.headlights!.pools.instanceMatrix.array;
    const px = e[5 * 16 + 12];
    const pz = e[5 * 16 + 14];
    const ahead = (px - k.x) * Math.sin(k.heading) + (pz - k.z) * Math.cos(k.heading);
    expect(ahead).toBeGreaterThan(HEADLIGHTS.ahead - 0.3);
    expect(ahead).toBeLessThan(HEADLIGHTS.ahead + 0.6);
    v.dispose();
    expect(scene.getObjectByName('fm-headlight-pools')).toBeUndefined();
    plain.dispose();
  });
});

describe('Rug furniture fade (F14)', () => {
  it('a block counts when it sits on the camera → kart line or right under the lens, never beside or past the kart', () => {
    expect(blocksSight(0, 0, 0, 10, 0.5, 5, 1)).toBe(true);
    expect(blocksSight(0, 0, 0, 10, 3, 5, 1)).toBe(false);
    expect(blocksSight(0, 0, 0, 10, 0, -2, 1)).toBe(false); // well behind the camera
    expect(blocksSight(0, 0, 0, 10, 0, -0.6, 1)).toBe(true); // the rig stopped just in front of it: under the lens
    expect(blocksSight(0, 0, 0, 10, 0, 12, 1)).toBe(false); // behind the kart
    expect(blocksSight(0, 0, 0, 10, 1.5, 9.8, 2)).toBe(false); // the kart rubs its side: beside it, not in the way
  });

  it('the sofa (three blocks in a row) is one piece of furniture; the table, chair, tree and pot stand alone', () => {
    const t = buildTrack(RUG);
    expect(Array.from(furnitureGroups(t.blocks))).toEqual([0, 1, 1, 1, 4, 5, 6]);
    const fade = new OccluderFade(new Group(), t);
    const s = t.blocks[2];
    // a sight line past the sofa's middle block fades all three
    for (let n = 0; n < 30; n++) fade.update({ x: s.x - 12, y: 6, z: s.z - s.r - 1 }, { x: s.x + 1, y: 0, z: s.z - s.r - 1 }, 1 / 60);
    expect(Array.from(fade.alpha.slice(1, 4)).every((a) => Math.abs(a - OCCLUDER.alpha) < 1e-5)).toBe(true);
    expect(fade.alpha[0]).toBe(1);
  });

  it('fades the block in the way to 30 % (others stay solid) and patches the lazily loaded prop mesh once', () => {
    const t = buildTrack(RUG);
    expect(t.blocks.length).toBeGreaterThan(2);
    const group = new Group();
    const fade = new OccluderFade(group, t);
    const b = t.blocks[0];
    const cam = { x: b.x - 12, y: 6, z: b.z };
    const kart = { x: b.x + 6, y: 0, z: b.z };
    // the dressing has not loaded yet: the fade still tracks, nothing to patch
    fade.update(cam, kart, 1 / 60);
    expect(fade.attached).toBe(false);
    const mat = new MeshToonMaterial({ vertexColors: true });
    const props = new Mesh(new BoxGeometry(1, 1, 1), mat);
    props.name = RUG_PROPS;
    group.add(props);
    for (let n = 0; n < 30; n++) fade.update(cam, kart, 1 / 60);
    expect(fade.attached).toBe(true);
    expect(mat.transparent).toBe(false); // a screen-door fade: the furniture stays in the opaque pass
    expect(fade.alpha[0]).toBeCloseTo(OCCLUDER.alpha, 5);
    for (let i = 1; i < t.blocks.length; i++) {
      if (fade.group[i] !== fade.group[0]) expect(fade.alpha[i]).toBe(1);
    }
    // the shader patch compiles into the toon program's source
    const sh = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <opaque_fragment>' };
    mat.onBeforeCompile(sh as never, null as never);
    expect(sh.fragmentShader).toContain('uFmBlocks');
    expect(sh.vertexShader).toContain('vFmW');
    expect(sh.fragmentShader).toContain('discard');
    // the line clears: back to solid; reduced motion snaps
    fade.update(cam, { x: b.x - 6, y: 0, z: b.z }, 1 / 60, true);
    expect(fade.alpha[0]).toBe(1);
  });
});
