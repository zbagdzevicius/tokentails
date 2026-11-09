// @vitest-environment happy-dom
/**
 * Skill preview player (src/ui/preview): every hero × slot has a scripted scenario whose cast the real sim registers,
 * the loop is deterministic, and the player creates and disposes its scene without leaking (GL context, DOM,
 * listeners, the shared sfx bus and the palette / view-yaw globals). The GL renderer is a stub: happy-dom has no WebGL.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { ALLY, DUMMY, LOOP_MAX, LOOP_MIN, ME, PREVIEW_SLOTS, SkillSandbox, scenarioFor } from '../../src/ui/preview/skillSandbox';

const fake = vi.hoisted(() => ({ lost: 0, disposed: 0 }));

vi.mock('../../src/render/renderer', async () => {
  const T = await import('three');
  return {
    createRenderer(container: HTMLElement) {
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(30, 1, 0.5, 300);
      const gr = {
        renderer: {
          domElement: canvas,
          compile() {},
          initTexture() {},
          render() {},
          forceContextLoss() {
            fake.lost++;
          },
          dispose() {
            fake.disposed++;
          },
        },
        scene,
        camera,
        focus: new T.Vector3(),
        zoom: 1,
        dist: 21,
        shadowHalf: 30,
        settings: { tier: 'low', maxDpr: 1, shadows: false, bloom: false, outlines: false, antialias: false, shadowMap: 1024, shadowEvery: 1, forestHalf: true, vfxTier: 'low', overheadDpr: 1, minimapHz: 15, fpsCap: 60, resScale: 1, phone: false, step: 0 },
        preRender: null,
        active: scene,
        place: null as ((c: THREE.PerspectiveCamera) => void) | null,
        setTier() {},
        resize() {},
        render() {
          gr.place?.(camera);
        },
        dispose() {
          gr.renderer.dispose();
          canvas.remove();
        },
      };
      return gr;
    },
  };
});

describe('skill sandbox: every hero and slot casts in the real sim', () => {
  for (const hero of HERO_IDS)
    for (const slot of PREVIEW_SLOTS) {
      it(`${hero} ${slot.toUpperCase()}`, () => {
        const sb = new SkillSandbox(hero, slot);
        const sc = sb.scenario;
        expect(sc.loop).toBeGreaterThanOrEqual(LOOP_MIN);
        expect(sc.loop).toBeLessThanOrEqual(LOOP_MAX);
        let seen = false;
        for (let i = 0; i < sc.loop; i++) {
          const f = sb.next();
          if (f.cast) seen = true;
          // the dummy and the ally stay on screen (visible to the hero's team) the whole clip
          if (i === sc.castAt) {
            expect(f.snap.entities.find((e) => e.id === DUMMY)).toBeTruthy();
            expect(f.snap.entities.find((e) => e.id === ALLY)).toBeTruthy();
          }
        }
        expect(seen).toBe(true);
        expect(sb.casts).toBeGreaterThanOrEqual(1);
        // the first cast lands within a second and a half of the order (a windup or a walk-in, never a fizzle)
        expect(sb.castTicks[0]).toBeGreaterThanOrEqual(sc.castAt);
        expect(sb.castTicks[0]).toBeLessThanOrEqual(sc.castAt + 45);
        // the hero is the previewed hero, at the preview level (the ultimate unlocked)
        const me = sb.next().snap.entities.find((e) => e.id === ME);
        expect(me?.hero).toBe(hero);
      });
    }

  it('loops are identical (deterministic restart)', () => {
    for (const [hero, slot] of [
      ['clem', 'q'],
      ['sage', 'r'],
      ['gabe', 'w'],
    ] as const) {
      const sb = new SkillSandbox(hero, slot);
      const loop = sb.scenario.loop;
      const a: string[] = [];
      const b: string[] = [];
      for (let i = 0; i < loop; i++) a.push(JSON.stringify(sb.next().snap.entities.filter((e) => e.kind === 'hero')));
      const first = [...sb.castTicks];
      for (let i = 0; i < loop; i++) b.push(JSON.stringify(sb.next().snap.entities.filter((e) => e.kind === 'hero')));
      expect(sb.loops).toBe(1);
      expect(b).toEqual(a);
      expect(sb.castTicks).toEqual(first);
    }
  });

  it('recast skills recast in the clip (Clem Q, Cacklejaw Q, Avietė E)', () => {
    for (const [hero, slot] of [
      ['clem', 'q'],
      ['cacklejaw', 'q'],
      ['aviete', 'e'],
    ] as const) {
      const sb = new SkillSandbox(hero, slot);
      for (let i = 0; i < sb.scenario.loop; i++) sb.next();
      expect(sb.casts, `${hero} ${slot}`).toBe(2);
    }
  });

  it('ally skills aim at the ally, and the dummy is the other side', () => {
    expect(scenarioFor('gabe', 'w').at).toBe('ally');
    for (const hero of HERO_IDS) {
      const sb = new SkillSandbox(hero, 'q');
      const s = sb.next().snap;
      const du = s.entities.find((e) => e.id === DUMMY);
      const al = s.entities.find((e) => e.id === ALLY);
      expect(du?.hero && HEROES[du.hero].side).not.toBe(HEROES[hero].side);
      expect(al?.hero && HEROES[al.hero].side).toBe(HEROES[hero].side);
      expect(al?.hero).not.toBe(hero);
      // the ally starts hurt, so a heal or a shield reads
      expect(al!.hp).toBeLessThan(al!.maxHp);
    }
  });
});

/** A do-nothing 2D context (the map paints its ground textures on canvases at load). */
function stub2d(): void {
  const ctx: Record<string, unknown> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(t, k) {
      if (k in t) return t[k as string];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'getImageData' || k === 'createImageData') return (_a: number, _b: number, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
      if (k === 'canvas') return document.createElement('canvas');
      return () => proxy;
    },
    set(t, k, v) {
      t[k as string] = v;
      return true;
    },
  };
  const proxy = new Proxy(ctx, handler);
  HTMLCanvasElement.prototype.getContext = (() => proxy) as unknown as HTMLCanvasElement['getContext'];
}

describe('skill preview player: create, switch, dispose', () => {
  stub2d();
  it('mounts, plays by hand, switches slot and hero, and disposes without leaking', async () => {
    const { mountSkillPreview } = await import('../../src/ui/preview/skillPreview');
    const { sfx } = await import('../../src/audio/sfx');
    const { cameraYaw } = await import('../../src/render/coords');
    const { sidesSwapped } = await import('../../src/render/palette');
    const yaw0 = cameraYaw();
    const swap0 = sidesSwapped();
    const play0 = sfx.play;
    // PERF-IOS §8 Track C: the identity layer is muted too (it starts its sound past play and voice)
    let layered = 0;
    const layer0 = (sfx.playLayer = (() => {
      layered++;
      return true;
    }) as typeof sfx.playLayer);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    for (let round = 0; round < 2; round++) {
      const p = mountSkillPreview(el, 'domino', 'q', { autoplay: false, tier: 'low' });
      await p.ready;
      expect(el.querySelector('canvas')).toBe(p.canvas);
      // a dog previews with the dog palette while it is open
      expect(sidesSwapped()).toBe(true);
      p.advance(2);
      expect(p.stats().casts).toBeGreaterThanOrEqual(1);
      // never sounds: the sfx bus is the shared one, restored after every frame
      expect(sfx.play).toBe(play0);
      expect(sfx.playLayer).toBe(layer0);
      expect(layered).toBe(0);
      // no DOM damage numbers from the box (their pool sat under the browser panel)
      expect(document.querySelector('.fx-dmg-layer')).toBeNull();
      await p.set('domino', 'r');
      p.advance(2.5);
      expect(p.stats().slot).toBe('r');
      expect(p.stats().casts).toBeGreaterThanOrEqual(1);
      await p.set('clem', 'e');
      p.advance(1.5);
      expect(p.stats().hero).toBe('clem');
      expect(p.stats().casts).toBeGreaterThanOrEqual(1);
      expect(sidesSwapped()).toBe(false);
      p.dispose();
      p.dispose(); // twice is harmless
      expect(el.children.length).toBe(0);
      expect(fake.lost).toBe(round + 1);
      expect(fake.disposed).toBe(round + 1);
    }
    const vis = (s: typeof add | typeof remove): number => s.mock.calls.filter((c) => c[0] === 'visibilitychange').length;
    expect(vis(remove)).toBe(vis(add));
    expect(cameraYaw()).toBe(yaw0);
    expect(sidesSwapped()).toBe(swap0);
    expect(sfx.play).toBe(play0);
  }, 90000);

  it('a stopped preview draws nothing more; play restarts the clock', async () => {
    const { mountSkillPreview } = await import('../../src/ui/preview/skillPreview');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const p = mountSkillPreview(el, 'sage', 'w', { autoplay: false, tier: 'low' });
    await p.ready;
    const f0 = p.stats().frames;
    await new Promise((r) => setTimeout(r, 60));
    expect(p.stats().frames).toBe(f0);
    expect(p.stats().playing).toBe(false);
    p.dispose();
  }, 60000);
});
