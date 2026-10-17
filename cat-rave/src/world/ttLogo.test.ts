import { Texture, type TextureLoader } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AD_SLOTS, BLIMP_ORBIT, MOON, slotCenter, viewAngles } from '../ads/slots';
import { DESK_PLATE } from '../arc/deskLogo';
import { LAYOUT } from '../config';
import { HERO_AIM_LIFT, HERO_BIG_MAX_Z, HERO_BIG_Y, portraitHero } from '../ui/director';
import { createTokenTailsLogo } from './ttLogo';
import {
  DJ_TOP_Y,
  PORTRAIT_FIT,
  hudTopNdc,
  TT_LOGO_ASPECT,
  TT_SIDE_MARK_H,
  TT_SIDE_PLATE,
  TT_SIGN,
  elevation,
  moonCover,
  moonFor,
  ndcY,
  portraitSignPose,
  signBox,
  signLevel,
  ttSignPose,
  type Cam,
  type SignPose,
} from './ttLogoLayout';

/**
 * Landscape hero cameras measured in the running scene (director.ts heroFit is internal to the director):
 * 17, 150 and 500 cats at 1280 x 800, plus a plain reference pose. The framing inputs they come from are
 * pinned below, so a change to the director or the DJ fails here instead of silently moving the sign.
 */
const DESKTOP: Cam[] = [
  { x: 0.46, y: 1.85, z: 8.71, pitch: 2.64, fov: 43.9, aspect: 1.6 },
  { x: 0.48, y: 2.09, z: 14, pitch: 0.69, fov: 44, aspect: 1.6 },
  { x: 0.46, y: 3.3, z: 10.5, pitch: -5.68, fov: 43.9, aspect: 1.6 },
  { x: 0, y: 2.2, z: 8, pitch: 0, fov: 44, aspect: 1.6 },
];

/**
 * Portrait hero cameras computed with the director's own portraitHero, for crowd extents from a few cats to a
 * packed floor, on tall phones (HUD bottom 215 px, 230 with the demo banner, measured in the running page) and a
 * short one (iPhone SE, 213 px).
 */
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
      return [-0.6, 0, 0.6].map((drift) => {
        const x = drift * (0.3 + 0.7 * (1 - p.small));
        return {
          x,
          y: p.y,
          z: p.z,
          pitch: (Math.atan2(p.ty - p.y, p.z) * 180) / Math.PI,
          fov,
          aspect,
          hpx: h,
          hudPx,
        };
      });
    }),
  );
});
const SHORT = (c: PhoneCam) => c.hpx < 700;
const phoneSign = (c: PhoneCam) => portraitSignPose(c, hudTopNdc(c.hpx, c.hudPx));

const cases: { cam: Cam; portrait: boolean; sign: SignPose }[] = [
  ...DESKTOP.map((cam) => ({ cam, portrait: false, sign: ttSignPose(false) })),
  ...PHONE.map((cam) => ({ cam, portrait: true, sign: phoneSign(cam) })),
];
const halfAngle = (size: number, d: number) => (Math.atan2(size / 2, d) * 180) / Math.PI;
const tag = (c: { cam: Cam; portrait: boolean }) => `${c.portrait ? 'phone' : 'desktop'} cam ${JSON.stringify(c.cam)}`;
/** Sign width as a fraction of the screen width. */
const widthFrac = (s: SignPose, cam: Cam) => {
  const b = signBox(s, cam);
  const th = Math.tan(((cam.fov / 2) * Math.PI) / 180) * cam.aspect;
  const x = (deg: number) => Math.tan((deg * Math.PI) / 180) / th;
  return (x(b.right) - x(b.left)) / 2;
};

describe('framing inputs the sign layout was measured against', () => {
  it('DJ, booth and landscape hero framing are unchanged (re-measure DJ_TOP_Y and DESKTOP if they move)', () => {
    expect(LAYOUT.djScale).toBe(1.75);
    expect(LAYOUT.boothSize).toEqual({ w: 2.4, h: 1.1, d: 1.2 });
    expect([HERO_BIG_Y, HERO_BIG_MAX_Z, HERO_AIM_LIFT]).toEqual([3.3, 10.5, 0.4]);
    expect(MOON.radius).toBe(LAYOUT.moon.radius);
    expect(MOON.center).toEqual(LAYOUT.moon.center);
  });
});

describe('Token Tails hero sign', () => {
  it('uses the official lockup proportions', () => {
    for (const { sign } of cases) expect(sign.w / sign.h).toBeCloseTo(TT_LOGO_ASPECT, 6);
    expect(ttSignPose(false)).toBe(TT_SIGN.landscape);
  });

  it('never covers the DJ: its bottom edge stays above the headphones in every hero shot', () => {
    for (const c of cases) {
      const b = signBox(c.sign, c.cam);
      const dj = elevation({ x: 0, y: DJ_TOP_Y, z: 0 }, c.cam);
      // DJ_TOP_Y is already the worst case (ears at the top of the bob, sword raised).
      expect(b.bottom - dj, tag(c)).toBeGreaterThan(0.5);
    }
  });

  it('stays clear of the Arc plate on the booth front', () => {
    for (const c of cases) {
      const b = signBox(c.sign, c.cam);
      const plateTop = elevation({ x: 0, y: DESK_PLATE.y + DESK_PLATE.h / 2, z: LAYOUT.boothSize.d / 2 }, c.cam);
      expect(b.bottom, tag(c)).toBeGreaterThan(plateTop + 3);
    }
  });

  it('is inside the frame and centred', () => {
    for (const c of cases) {
      const { cam } = c;
      const b = signBox(c.sign, cam);
      expect(ndcY(b.top, cam), tag(c)).toBeLessThan(0.98);
      expect(ndcY(b.bottom, cam), tag(c)).toBeGreaterThan(-0.2);
      const halfH = (Math.atan(Math.tan(((cam.fov / 2) * Math.PI) / 180) * cam.aspect) * 180) / Math.PI;
      expect(Math.max(Math.abs(b.left), Math.abs(b.right)), tag(c)).toBeLessThan(halfH * 0.95);
    }
  });

  it('stays under the phone HUD; a short phone may tuck its top edge under the HUD rather than cover the DJ', () => {
    for (const cam of PHONE) {
      const top = ndcY(signBox(phoneSign(cam), cam).top, cam);
      const limit = hudTopNdc(cam.hpx, cam.hudPx);
      // NDC 0.06 on a 667 px screen is 20 px: the HUD's bottom padding, the sign's ring top behind it.
      expect(top, `phone cam ${JSON.stringify(cam)}`).toBeLessThanOrEqual(limit + (SHORT(cam) ? 0.06 : 1e-6));
    }
  });

  it('is readable: ~18% of the screen width on desktop, about a quarter to a third on phones (an eighth on short ones)', () => {
    expect(widthFrac(ttSignPose(false), DESKTOP[0])).toBeGreaterThan(0.18);
    for (const cam of PHONE) {
      const w = widthFrac(phoneSign(cam), cam);
      expect(w, `phone cam ${JSON.stringify(cam)}`).toBeGreaterThan(SHORT(cam) ? 0.12 : 0.24);
      expect(w, `phone cam ${JSON.stringify(cam)}`).toBeLessThan(0.4);
    }
  });

  it('keeps the same on-screen size and place through a phone hero shot (only the camera drift changes)', () => {
    for (let i = 0; i < PHONE.length; i += 3) {
      const poses = PHONE.slice(i, i + 3).map(phoneSign);
      for (const p of poses) {
        expect(Math.abs(p.h - poses[1].h)).toBeLessThan(0.01); // < 1 cm
        expect(Math.abs(p.y - poses[1].y)).toBeLessThan(0.01);
      }
    }
  });

  it('crowns the moon on the few-cats phone shot (bottom edge on the disc, top edge above it)', () => {
    const cam = PHONE.find((c) => c.y < 1.3 && c.x === 0 && c.hpx === 844)!;
    const s = phoneSign(cam);
    const m = moonFor(true);
    const c = { x: m.center[0], y: m.center[1], z: m.center[2] };
    const r = (Math.asin(m.radius / Math.hypot(c.x - cam.x, c.y - cam.y, cam.z - c.z)) * 180) / Math.PI;
    const moonTop = elevation(c, cam) + r;
    const b = signBox(s, cam);
    expect(b.bottom).toBeLessThan(moonTop);
    expect(b.top).toBeGreaterThan(moonTop);
  });

  it('leaves the moon visible: covers under a fifth of its disc, and its centre only on a short phone', () => {
    for (const c of cases) {
      const m = moonFor(c.portrait);
      expect(moonCover(c.sign, c.cam, m), tag(c)).toBeLessThan(0.2);
      if (c.portrait && SHORT(c.cam as PhoneCam)) continue;
      const centre = elevation({ x: m.center[0], y: m.center[1], z: m.center[2] }, c.cam);
      expect(signBox(c.sign, c.cam).bottom, tag(c)).toBeGreaterThan(centre + 0.25);
    }
  });

  it('no ad slot covers the sign, and the sign covers no ad slot, in the hero shot', () => {
    for (const c of cases) {
      const { cam, portrait } = c;
      const b = signBox(c.sign, cam);
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

  it('keeps the portrait fit within its own limits', () => {
    for (const cam of PHONE) {
      const s = phoneSign(cam);
      expect(s.h).toBeGreaterThanOrEqual(PORTRAIT_FIT.minH);
      expect(s.h).toBeLessThanOrEqual(PORTRAIT_FIT.maxH);
      expect(s.z).toBe(PORTRAIT_FIT.z);
    }
  });
});

describe('Token Tails booth-side marks', () => {
  it('fit on the booth side faces with clear space, above the floor glow', () => {
    const { h, d } = LAYOUT.boothSize;
    expect(TT_SIDE_PLATE.w).toBeLessThan(d - 0.2);
    expect(TT_SIDE_PLATE.y + TT_SIDE_PLATE.h / 2).toBeLessThan(h - 0.1);
    expect(TT_SIDE_PLATE.y - TT_SIDE_PLATE.h / 2).toBeGreaterThan(0.1);
    expect(TT_SIDE_MARK_H).toBeLessThan(TT_SIDE_PLATE.h - 0.1);
  });
});

describe('sign beat pulse', () => {
  it('glows steadily, lifts on the kick, more in a drop, and stays below a blow-out', () => {
    const rest = signLevel(0, 0, 0, false);
    const kick = signLevel(1, 1, 0, false);
    const drop = signLevel(1, 1, 1, false);
    expect(rest).toBeGreaterThanOrEqual(1);
    expect(kick).toBeGreaterThan(rest);
    expect(drop).toBeGreaterThan(kick);
    expect(drop).toBeLessThan(1.5);
    expect(signLevel(1, 1, 1, true) - rest).toBeLessThan((drop - rest) / 2);
    expect(signLevel(5, 5, 5, false)).toBe(drop); // inputs are clamped
  });
});

describe('createTokenTailsLogo (three.js objects)', () => {
  const booth = LAYOUT.boothSize;
  const profile = { quality: 'mid' } as Parameters<typeof createTokenTailsLogo>[2];
  const stubLoader = () => {
    const calls: {
      url: string;
      tex: Texture;
      onLoad: (t: Texture) => void;
      onError: (e: unknown) => void;
    }[] = [];
    const loader = {
      load(url: string, onLoad: (t: Texture) => void, _p: unknown, onError: (e: unknown) => void) {
        const tex = new Texture();
        calls.push({ url, tex, onLoad, onError });
        return tex;
      },
    } as unknown as TextureLoader;
    return { loader, calls };
  };

  it('builds the sign and the booth sides from the official files, sRGB and premultiplied, hidden until loaded', () => {
    const { loader, calls } = stubLoader();
    const logo = createTokenTailsLogo(booth, null, profile, loader);
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['tokentails-logo.webp', 'tokentails-cat.webp']);
    for (const c of calls) {
      expect(c.tex.colorSpace).toBe('srgb');
      expect(c.tex.premultiplyAlpha).toBe(true);
    }
    expect(logo.sign.userData.noMirror).toBe(true);
    const signMesh = logo.sign.getObjectByName('tt-sign-logo') as unknown as {
      material: { opacity: number; depthWrite: boolean; alphaTest: number };
    };
    expect(signMesh.material.opacity).toBe(0);
    // Writes depth (alpha-tested) so haze sheets and beams behind the sign can't wash over it.
    expect(signMesh.material.depthWrite).toBe(true);
    expect(signMesh.material.alphaTest).toBeGreaterThan(0);
    expect(logo.loaded).toBe(false);
    for (const c of calls) c.onLoad(c.tex);
    expect(logo.loaded).toBe(true);
    expect(signMesh.material.opacity).toBe(1);
  });

  it('puts one mark on each booth side, facing outwards, and settles even when a file fails', () => {
    const { loader, calls } = stubLoader();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logo = createTokenTailsLogo(booth, null, profile, loader);
    const faces = logo.sides.children;
    expect(faces).toHaveLength(2);
    logo.sides.updateMatrixWorld(true);
    for (const face of faces) {
      const n = face.getWorldDirection(face.position.clone()); // local +Z in world space
      expect(Math.sign(n.x)).toBe(Math.sign(face.position.x));
      expect(Math.abs(face.position.x)).toBeGreaterThan(booth.w / 2);
    }
    calls[0].onError(new Error('404'));
    calls[1].onLoad(calls[1].tex);
    expect(logo.loaded).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('follows the phone hero camera, holds still on other shots, and frees everything on dispose', async () => {
    const { PerspectiveCamera } = await import('three');
    const { loader, calls } = stubLoader();
    const logo = createTokenTailsLogo(booth, null, profile, loader);
    logo.setPortrait(true);
    const cam = new PerspectiveCamera(58, 390 / 844, 0.1, 500);
    const p = PHONE.find((c) => c.y > 3.4 && c.x === 0)!;
    cam.position.set(p.x, p.y, p.z);
    cam.lookAt(0, p.y + Math.tan((p.pitch * Math.PI) / 180) * p.z, 0);
    cam.updateMatrixWorld();
    logo.follow(cam, 0.016);
    const want = portraitSignPose({ ...p, fov: 58 }, hudTopNdc(844)); // no DOM here: the default HUD
    expect(logo.sign.position.y).toBeCloseTo(want.y, 2);
    expect(logo.sign.scale.y).toBeCloseTo(want.h, 2);
    // A top-down shot doesn't move it.
    cam.position.set(0, 30, 2);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    logo.follow(cam, 0.5);
    expect(logo.sign.position.y).toBeCloseTo(want.y, 2);
    // Landscape goes back to the fixed pose.
    logo.setPortrait(false);
    expect(logo.sign.position.y).toBeCloseTo(TT_SIGN.landscape.y, 6);
    const spies = calls.map((c) => vi.spyOn(c.tex, 'dispose'));
    logo.dispose();
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});
