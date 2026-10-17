import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Texture, type TextureLoader } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AD_SLOTS, BLIMP_ORBIT, slotCenter, viewAngles } from '../ads/slots';
import { DESK_PLATE } from '../arc/deskLogo';
import { LAYOUT } from '../config';
import { PP_BADGE_TEXT } from '../ui/pinkPawBadge';
import { portraitHero } from '../ui/director';
import { createPinkPawSign } from './pinkPaw';
import {
  PP_BOUNDS,
  PP_LANDSCAPE,
  PP_LOGO_FILE,
  PP_PORTRAIT_FIT,
  djLeftNdc,
  pinkPawPortraitPose,
  ppBox,
  ppGlowLevel,
  ppNdcBox,
  project,
  ttLeftNdc,
  unproject,
  type PinkPawPose,
} from './pinkPawLayout';
import { DJ_TOP_Y, TT_SIDE_PLATE, azimuth, elevation, hudTopNdc, moonCover, moonFor, portraitSignPose, signBox, ttSignPose, type Cam } from './ttLogoLayout';

/** Landscape hero cameras measured in the running scene (the same set as ttLogo.test.ts). */
const DESKTOP: Cam[] = [
  { x: 0.46, y: 1.85, z: 8.71, pitch: 2.64, fov: 43.9, aspect: 1.6 },
  { x: 0.48, y: 2.09, z: 14, pitch: 0.69, fov: 44, aspect: 1.6 },
  { x: 0.46, y: 3.3, z: 10.5, pitch: -5.68, fov: 43.9, aspect: 1.6 },
  { x: 0, y: 2.2, z: 8, pitch: 0, fov: 44, aspect: 1.6 },
  // The same framings drifting the other way, and on a 4:3 screen.
  { x: -0.6, y: 1.85, z: 8.71, pitch: 2.64, fov: 43.9, aspect: 1.6 },
  { x: -0.6, y: 3.3, z: 10.5, pitch: -5.68, fov: 43.9, aspect: 1.33 },
];

/** Portrait hero cameras from the director's own portraitHero (as in ttLogo.test.ts). */
type PhoneCam = Cam & { hpx: number; hudPx: number };
const PHONE_SCREENS = [
  { w: 390, h: 844, hud: [215, 230] },
  { w: 412, h: 915, hud: [215, 230] },
  { w: 375, h: 667, hud: [213] },
];
const EXTENTS = [3.6, 5, 5.4, 7, 9, 11, 14, 16, 20, 30];
const PHONE: PhoneCam[] = PHONE_SCREENS.flatMap(({ w, h, hud }) => {
  const aspect = w / h;
  const fov = 44 + (1 - aspect) * 26; // director.ts baseFov(44)
  return hud.flatMap((hudPx) =>
    EXTENTS.flatMap((e) => {
      const p = portraitHero(e, fov, aspect, LAYOUT.boothSize.h);
      return [-0.6, 0, 0.6].map((drift) => ({
        x: drift * (0.3 + 0.7 * (1 - p.small)),
        y: p.y,
        z: p.z,
        pitch: (Math.atan2(p.ty - p.y, p.z) * 180) / Math.PI,
        fov,
        aspect,
        hpx: h,
        hudPx,
      }));
    }),
  );
});
const phoneTop = (c: PhoneCam) => hudTopNdc(c.hpx, c.hudPx);
const phonePose = (c: PhoneCam) => pinkPawPortraitPose(c, phoneTop(c));

const cases: { cam: Cam; portrait: boolean; pose: PinkPawPose; tt: ReturnType<typeof ttSignPose> }[] = [
  ...DESKTOP.map((cam) => ({ cam, portrait: false, pose: PP_LANDSCAPE, tt: ttSignPose(false) })),
  ...PHONE.map((cam) => ({ cam, portrait: true, pose: phonePose(cam), tt: portraitSignPose(cam, phoneTop(cam)) })),
];
const tag = (c: { cam: Cam; portrait: boolean }) => `${c.portrait ? 'phone' : 'desktop'} cam ${JSON.stringify(c.cam)}`;

/** Angular box (deg) of the whole sign seen from a camera. */
function angBox(p: PinkPawPose, cam: Cam) {
  const b = ppBox(p);
  return {
    left: azimuth({ x: b.left, z: b.z }, cam),
    right: azimuth({ x: b.right, z: b.z }, cam),
    bottom: elevation({ x: p.x, y: b.bottom, z: b.z }, cam),
    top: elevation({ x: p.x, y: b.top, z: b.z }, cam),
  };
}
const halfAngle = (size: number, d: number) => (Math.atan2(size / 2, d) * 180) / Math.PI;

describe('projection helpers', () => {
  it('unproject is the inverse of project on a plane', () => {
    for (const cam of [...DESKTOP, ...PHONE.slice(0, 10)]) {
      for (const [nx, ny] of [
        [0, 0],
        [-0.6, 0.3],
        [0.8, -0.5],
      ]) {
        const p = unproject(nx, ny, -1.5, cam);
        const back = project(p, cam);
        expect(back.x).toBeCloseTo(nx, 6);
        expect(back.y).toBeCloseTo(ny, 6);
        expect(back.depth).toBeCloseTo(p.depth, 6);
      }
    }
  });
});

describe('Pink Paw sign', () => {
  it('sits behind the booth, beside the DJ (left of it on screen, with a gap)', () => {
    for (const c of cases) {
      expect(c.pose.z, tag(c)).toBeLessThan(-LAYOUT.boothSize.d / 2);
      const b = ppNdcBox(c.pose, c.cam);
      expect(b.right, tag(c)).toBeLessThan(djLeftNdc(c.cam) - 0.04);
    }
  });

  it('never touches the Token Tails sign', () => {
    for (const c of cases) {
      const b = ppNdcBox(c.pose, c.cam);
      const tt = signBox(c.tt, c.cam);
      const pp = angBox(c.pose, c.cam);
      const apartH = pp.right < tt.left - 0.3;
      const apartV = pp.top < tt.bottom - 0.3;
      expect(apartH || apartV, `${tag(c)} ndc ${JSON.stringify(b)} vs tt left ${ttLeftNdc(c.tt, c.cam)}`).toBe(true);
    }
  });

  it('is inside the frame, under the HUD, and above the floor horizon on phones', () => {
    for (const c of cases) {
      const b = ppNdcBox(c.pose, c.cam);
      expect(b.left, tag(c)).toBeGreaterThan(-0.97);
      expect(b.bottom, tag(c)).toBeGreaterThan(-0.6);
      // Landscape: under the counter block and its Countries pill (bottom ~208 px of 720 at 1280 x 720).
      const limit = c.portrait ? phoneTop(c.cam as PhoneCam) : hudTopNdc(720, 208);
      expect(b.top, tag(c)).toBeLessThanOrEqual(limit + 1e-6);
    }
  });

  it('stays on the left half, away from the Arc badge, the screen buttons and the moon’s centre', () => {
    for (const c of cases) {
      const b = ppNdcBox(c.pose, c.cam);
      expect(b.right, tag(c)).toBeLessThan(0);
      const w = ppBox(c.pose);
      const asSign = { x: (w.left + w.right) / 2, y: (w.top + w.bottom) / 2, z: w.z, w: w.right - w.left, h: w.top - w.bottom };
      expect(moonCover(asSign, c.cam, moonFor(c.portrait)), tag(c)).toBeLessThan(0.2);
    }
  });

  it('is readable: the disc is about a tenth of a desktop screen and a sixth to a quarter of a phone', () => {
    const discFrac = (p: PinkPawPose, cam: Cam) => {
      const l = project({ x: p.x - p.s / 2, y: p.y, z: p.z }, cam).x;
      const r = project({ x: p.x + p.s / 2, y: p.y, z: p.z }, cam).x;
      return (r - l) / 2;
    };
    expect(discFrac(PP_LANDSCAPE, DESKTOP[0])).toBeGreaterThan(0.09);
    expect(discFrac(PP_LANDSCAPE, DESKTOP[0])).toBeLessThan(0.15);
    for (const cam of PHONE) {
      const f = discFrac(phonePose(cam), cam);
      expect(f, JSON.stringify(cam)).toBeGreaterThan(0.15);
      expect(f, JSON.stringify(cam)).toBeLessThanOrEqual(PP_PORTRAIT_FIT.widthFrac + 1e-6);
    }
  });

  it('stays clear of the Arc plate and the booth-side cat marks', () => {
    const { w, h, d } = LAYOUT.boothSize;
    for (const c of cases) {
      const pp = angBox(c.pose, c.cam);
      const plateLeft = azimuth({ x: -DESK_PLATE.w / 2, z: d / 2 }, c.cam);
      const plateTop = elevation({ x: 0, y: DESK_PLATE.y + DESK_PLATE.h / 2, z: d / 2 }, c.cam);
      expect(pp.right < plateLeft || pp.bottom > plateTop, tag(c)).toBe(true);
      // The left side face's plate (x = -w/2) at its nearest corner.
      const markTop = elevation({ x: -w / 2, y: TT_SIDE_PLATE.y + TT_SIDE_PLATE.h / 2, z: TT_SIDE_PLATE.w / 2 }, c.cam);
      expect(pp.bottom, tag(c)).toBeGreaterThan(markTop);
      // Beside the booth on screen, or seen above its top edge (the slab's front edge).
      expect(pp.right < azimuth({ x: -w / 2, z: d / 2 }, c.cam) || pp.bottom > elevation({ x: -w / 2, y: h, z: d / 2 }, c.cam), tag(c)).toBe(true);
    }
  });

  it('no ad slot covers the sign, and the sign covers no ad slot, in the hero shot', () => {
    for (const c of cases) {
      const { cam, portrait } = c;
      const b = angBox(c.pose, cam);
      const m = moonFor(portrait).center;
      for (const slot of AD_SLOTS) {
        const times = slot.kind === 'blimp' ? Array.from({ length: 72 }, (_, i) => (i / 72) * BLIMP_ORBIT.period) : [0];
        for (const t of times) {
          const sc = slotCenter(slot, t, m, portrait);
          if (sc.z > cam.z - 0.5) continue; // behind the camera
          const a = viewAngles(sc, cam);
          const hw = halfAngle(slot.w, a.d);
          const hh = halfAngle(slot.h, a.d);
          const apartH = a.h + hw < b.left || a.h - hw > b.right;
          const apartV = a.v + hh < b.bottom || a.v - hh > b.top;
          expect(apartH || apartV, `${slot.id} t=${t} overlaps the sign (${tag(c)})`).toBe(true);
        }
      }
    }
  });

  it('keeps the same on-screen place through a phone hero shot (only the camera drift changes)', () => {
    for (let i = 0; i < PHONE.length; i += 3) {
      const boxes = PHONE.slice(i, i + 3).map((cam) => ppNdcBox(phonePose(cam), cam));
      for (const b of boxes) {
        expect(Math.abs(b.top - boxes[1].top)).toBeLessThan(0.02);
        expect(Math.abs(b.right - b.left - (boxes[1].right - boxes[1].left))).toBeLessThan(0.15);
      }
    }
  });

  it('keeps the portrait fit within its own limits', () => {
    for (const cam of PHONE) {
      const p = phonePose(cam);
      expect(p.s).toBeGreaterThanOrEqual(PP_PORTRAIT_FIT.minS);
      expect(p.s).toBeLessThanOrEqual(PP_PORTRAIT_FIT.maxS);
      expect(p.z).toBe(PP_PORTRAIT_FIT.z);
    }
    expect(PP_BOUNDS.top).toBeGreaterThan(0.5);
    expect(PP_BOUNDS.bottom).toBeLessThan(-0.5);
    expect(DJ_TOP_Y).toBe(2.75);
  });

  it('glows steadily, lifts on the kick and in a drop, softer with reduced motion', () => {
    const rest = ppGlowLevel(0, 0, 0, false);
    const kick = ppGlowLevel(1, 1, 0, false);
    const drop = ppGlowLevel(1, 1, 1, false);
    expect(rest).toBe(1);
    expect(kick).toBeGreaterThan(rest);
    expect(drop).toBeGreaterThan(kick);
    expect(drop).toBeLessThan(1.6);
    expect(ppGlowLevel(1, 1, 1, true) - rest).toBeLessThan((drop - rest) / 2);
    expect(ppGlowLevel(9, 9, 9, false)).toBe(drop);
  });
});

describe('Pink Paw logo file', () => {
  it('is self-hosted next to the other brand files, small, and at most 512 px', () => {
    const file = fileURLToPath(new URL(`../../public/${PP_LOGO_FILE}`, import.meta.url));
    expect(existsSync(file)).toBe(true);
    const buf = readFileSync(file);
    expect(buf.length).toBeLessThan(40_000);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    // VP8X header: canvas width-1 / height-1 as 24-bit little endian at bytes 24..29.
    expect(buf.subarray(12, 16).toString('ascii')).toBe('VP8X');
    const w = 1 + buf.readUIntLE(24, 3);
    const h = 1 + buf.readUIntLE(27, 3);
    expect(w).toBe(h);
    expect(w).toBeLessThanOrEqual(512);
  });

  it('the sheet line names the shelter', () => {
    expect(`${PP_BADGE_TEXT.checkout}${PP_BADGE_TEXT.name}${PP_BADGE_TEXT.tail}`).toBe('Your $ goes to the Pink Paw cat shelter');
    expect(`${PP_BADGE_TEXT.rave}${PP_BADGE_TEXT.name}${PP_BADGE_TEXT.tail}`).toBe('We rave for the Pink Paw cat shelter');
  });
});

describe('createPinkPawSign (three.js objects)', () => {
  const profile = { quality: 'mid' } as Parameters<typeof createPinkPawSign>[1];
  const stubLoader = () => {
    const calls: { url: string; tex: Texture; onLoad: (t: Texture) => void; onError: (e: unknown) => void }[] = [];
    const loader = {
      load(url: string, onLoad: (t: Texture) => void, _p: unknown, onError: (e: unknown) => void) {
        const tex = new Texture();
        calls.push({ url, tex, onLoad, onError });
        return tex;
      },
    } as unknown as TextureLoader;
    return { loader, calls };
  };
  type Mat = { opacity: number; depthWrite: boolean; alphaTest: number };
  const matOf = (sign: ReturnType<typeof createPinkPawSign>, name: string) => (sign.group.getObjectByName(name) as unknown as { material: Mat }).material;

  it('loads the self-hosted logo as sRGB, premultiplied, hidden until it arrives', () => {
    const { loader, calls } = stubLoader();
    const sign = createPinkPawSign(null, profile, loader);
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['pink-paw-logo.webp']);
    expect(calls[0].tex.colorSpace).toBe('srgb');
    expect(calls[0].tex.premultiplyAlpha).toBe(true);
    expect(sign.group.userData.noMirror).toBe(true);
    const disc = matOf(sign, 'pinkpaw-logo');
    expect(disc.opacity).toBe(0);
    expect(matOf(sign, 'pinkpaw-rim').opacity).toBe(0);
    expect(disc.depthWrite).toBe(true);
    expect(disc.alphaTest).toBeGreaterThan(0);
    expect(sign.loaded).toBe(false);
    expect(sign.group.getObjectByName('pinkpaw-glow')!.visible).toBe(false);
    calls[0].onLoad(calls[0].tex);
    expect(sign.loaded).toBe(true);
    expect(disc.opacity).toBe(1);
    expect(sign.group.getObjectByName('pinkpaw-glow')!.visible).toBe(true);
    expect(sign.group.position.toArray()).toEqual([PP_LANDSCAPE.x, PP_LANDSCAPE.y, PP_LANDSCAPE.z]);
    expect(sign.group.scale.x).toBe(PP_LANDSCAPE.s);
  });

  it('settles when the logo fails (disc stays hidden, a warning, no throw)', () => {
    const { loader, calls } = stubLoader();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sign = createPinkPawSign(null, profile, loader);
    calls[0].onError(new Error('404'));
    expect(sign.loaded).toBe(true);
    expect(matOf(sign, 'pinkpaw-logo').opacity).toBe(0);
    expect(sign.group.getObjectByName('pinkpaw-glow')!.visible).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    // Beat updates still run (glow and rim).
    sign.update({ kick: 1, energy: 1 } as Parameters<typeof sign.update>[0], 0, false);
  });

  it('follows the phone hero camera, holds still on other shots, and frees everything on dispose', async () => {
    const { PerspectiveCamera } = await import('three');
    const { loader, calls } = stubLoader();
    const sign = createPinkPawSign(null, profile, loader);
    sign.setPortrait(true);
    const cam = new PerspectiveCamera(58, 390 / 844, 0.1, 500);
    const p = PHONE.find((c) => c.y > 3.4 && c.x === 0)!;
    cam.position.set(p.x, p.y, p.z);
    cam.lookAt(0, p.y + Math.tan((p.pitch * Math.PI) / 180) * p.z, 0);
    cam.updateMatrixWorld();
    sign.follow(cam, 0.016);
    const want = pinkPawPortraitPose({ ...p, fov: 58, aspect: 390 / 844 }, hudTopNdc(844)); // no DOM: the default HUD
    expect(sign.group.position.x).toBeCloseTo(want.x, 2);
    expect(sign.group.position.y).toBeCloseTo(want.y, 2);
    expect(sign.group.scale.x).toBeCloseTo(want.s, 2);
    cam.position.set(0, 30, 2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    sign.follow(cam, 0.5);
    expect(sign.group.position.y).toBeCloseTo(want.y, 2);
    sign.setPortrait(false);
    expect(sign.group.position.y).toBeCloseTo(PP_LANDSCAPE.y, 6);
    const spy = vi.spyOn(calls[0].tex, 'dispose');
    sign.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
