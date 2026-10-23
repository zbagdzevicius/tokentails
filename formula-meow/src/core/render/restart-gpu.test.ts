/**
 * Restart and the GPU (B61 and its follow-ups): a torn-down race's per-race objects leave the scene at once (so the
 * shell's shader warm-up never compiles programs it is about to free, and nothing of the old race stays drawn over the
 * new grid) while their GPU side is freed later; and the karts' see-through variant can be compiled up front, so the
 * first rival fading near the camera mid-race does not link a program.
 */
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { DEFAULT_CAT, type BodyId, type RacerInfo } from '../../types';
import { KartView } from './kart-view';
import { SpeedLines } from '../../juice/vfx/speed-lines';
import { TunnelFx } from '../../juice/vfx/tunnel-fx';
import { buildTrack } from '../track/build';
import { themeOf } from '../track/themes';
import { stuntLab } from '../../test/fixtures';

const racer = (): RacerInfo => ({ name: 'Test', cat: DEFAULT_CAT, kart: { body: 0 as BodyId, paint: [0xff5a5f, 0xfff3dc, 0x2a1a22], number: 7 }, hat: 0 });

type Mat = { transparent: boolean; opacity: number; dispose(): void };
const fadeMats = (v: KartView): Mat[] => {
  const out = new Set<Mat>();
  v.body.traverse((o) => {
    const m = (o as { material?: Mat }).material;
    if (m && !Array.isArray(m) && o.name !== 'cat-outline') out.add(m);
  });
  return [...out];
};

describe('restart and the GPU', () => {
  it("the speed-lines overlay leaves the race camera on detach (it stayed drawn, frozen, over the next grid); dispose later", () => {
    const cam = new PerspectiveCamera();
    const old = new SpeedLines(cam, 0xff3ea5);
    old.update(1 / 60, 30, 30, true, false);
    old.detach();
    expect(cam.children).toHaveLength(0);
    expect(SpeedLines.current).toBeNull();
    const next = new SpeedLines(cam, 0xff3ea5);
    old.dispose(); // the retire timer, after the next race started
    expect(SpeedLines.current).toBe(next);
    expect(cam.children).toEqual([next.mesh]);
    next.dispose();
  });

  it('the tunnel streaks leave the scene on detach without freeing their material yet', () => {
    const t = buildTrack(stuntLab(), 0);
    const scene = new Scene();
    const fx = new TunnelFx(scene, t, themeOf(t.def.theme));
    const mesh = scene.children[0] as unknown as { material: Mat };
    let freed = 0;
    const d = mesh.material.dispose.bind(mesh.material);
    mesh.material.dispose = () => {
      freed++;
      d();
    };
    fx.detach();
    expect(scene.children).toHaveLength(0);
    expect(freed).toBe(0);
    fx.dispose();
    expect(freed).toBe(1);
  });

  it("fadeVariant('see' / 'solid') switches a kart to the variants setFade uses; null puts back exactly what was there", () => {
    const warm = new KartView(racer());
    const faded = new KartView(racer());
    faded.setFade(0.8);
    const see = fadeMats(faded).filter((m) => m.transparent).length;
    expect(see).toBeGreaterThan(0);
    const before = fadeMats(warm).map((m) => [m.transparent, m.opacity]);
    warm.fadeVariant('see');
    expect(fadeMats(warm).filter((m) => m.transparent).length).toBeGreaterThanOrEqual(see);
    // faded back in, setFade leaves every fadeable material opaque
    faded.setFade(1);
    const solid = fadeMats(faded).map((m) => m.transparent);
    warm.fadeVariant('solid');
    expect(fadeMats(warm).map((m) => m.transparent)).toEqual(solid);
    warm.fadeVariant(null);
    expect(fadeMats(warm).map((m) => [m.transparent, m.opacity])).toEqual(before);
    faded.setFade(0.8);
    // a kart that is faded when the warm-up runs stays see-through
    const t0 = fadeMats(faded).map((m) => m.transparent);
    faded.fadeVariant('see');
    faded.fadeVariant('solid');
    faded.fadeVariant(null);
    expect(fadeMats(faded).map((m) => m.transparent)).toEqual(t0);
    warm.dispose();
    faded.dispose();
  });
});
