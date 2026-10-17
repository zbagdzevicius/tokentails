import { describe, expect, it, vi } from 'vitest';
import { ARC_WEEK, arcWeekActive, arcWeekOverride, brandUrl, isArcChain, msToNextArcChange } from '../arc/arcweek';
import { createAdsApi, parseAdOrder, parseAdsStatus, parseLiveAds, safeImageUrl } from './api';
import { AD_IMAGE_MAX_BYTES, adQuote, checkAdName, checkImageFile, cropRect, normalizeAdUrl } from './form';
import { AD_KINDS, AD_SLOTS, AD_SLOT_IDS, BLIMP_ORBIT, MOON, adSlot, blimpPosition, miniMapPoint, slotAspect, slotCenter, viewAngles } from './slots';

// ------------------------------------------------------------------ Arc week

describe('Arc week window', () => {
  it('is on from 2026-10-16 00:00 UTC to 2026-10-23 23:59 UTC, off outside', () => {
    expect(ARC_WEEK).toEqual({ start: '2026-10-16T00:00:00Z', end: '2026-10-23T23:59:00Z' });
    expect(arcWeekActive(new Date('2026-10-15T23:59:59Z'))).toBe(false);
    expect(arcWeekActive(new Date('2026-10-16T00:00:00Z'))).toBe(true);
    expect(arcWeekActive(new Date('2026-10-20T12:00:00Z'))).toBe(true);
    expect(arcWeekActive(new Date('2026-10-23T23:59:00Z'))).toBe(true);
    expect(arcWeekActive(new Date('2026-10-23T23:59:01Z'))).toBe(false);
  });
  it('a malformed window is never active; ?arc= forces it', () => {
    expect(arcWeekActive(Date.now(), { start: 'nope', end: '2030-01-01' })).toBe(false);
    expect(arcWeekActive(Date.parse('2026-10-18T00:00:00Z'), { start: '2026-10-20T00:00:00Z', end: '2026-10-16T00:00:00Z' })).toBe(false);
    expect(arcWeekOverride('?arc=1')).toBe(true);
    expect(arcWeekOverride('?arc=off')).toBe(false);
    expect(arcWeekOverride('?shot=hero')).toBeNull();
  });
  it('knows when the badge next changes, and which chains are Arc', () => {
    expect(msToNextArcChange(Date.parse('2026-10-15T23:00:00Z'))).toBe(3600_000);
    expect(msToNextArcChange(Date.parse('2026-10-24T00:00:00Z'))).toBeNull();
    expect(isArcChain(5042)).toBe(true);
    expect(isArcChain(5042002)).toBe(true);
    expect(isArcChain(8453)).toBe(false);
    expect(isArcChain(null)).toBe(false);
    expect(brandUrl('brand/arc-logo-white.svg', '/rave/')).toBe('/rave/brand/arc-logo-white.svg');
    expect(brandUrl('brand/arc-logo-white.svg', './')).toBe('./brand/arc-logo-white.svg');
  });
});

// ------------------------------------------------------------------ slot layout

/** The landscape hero camera over a big crowd (director.ts HERO_BIG_Y / HERO_BIG_MAX_Z), and a closer one. */
const HERO_CAMS = [
  { x: 0, y: 3.3, z: 10.5 },
  { x: 0, y: 2.2, z: 8 },
];
/** Landscape hero: 44° vertical fov at 16:9 → about ±36° horizontally. */
const HERO_HALF_H = 36;
const halfAngle = (size: number, d: number) => (Math.atan2(size / 2, d) * 180) / Math.PI;

describe('ad slot layout', () => {
  it('has 20 slots: 2 screens, 6 banners, 6 tower wraps, 4 blimps, 2 moon-ring banners', () => {
    expect(AD_SLOTS).toHaveLength(20);
    expect(new Set(AD_SLOT_IDS).size).toBe(20);
    const count = (k: string) => AD_SLOTS.filter((s) => s.kind === k).length;
    expect([count('screen'), count('banner'), count('tower'), count('blimp'), count('moon')]).toEqual([2, 6, 6, 4, 2]);
    expect(Object.values(AD_KINDS).reduce((n, k) => n + k.count, 0)).toBe(20);
    expect(adSlot('blimp-4')?.kind).toBe('blimp');
    expect(adSlot('nope')).toBeNull();
  });

  it('every face has its image aspect, so nothing is stretched', () => {
    for (const s of AD_SLOTS) expect(s.w / s.h).toBeCloseTo(slotAspect(s), 5);
  });

  it('every ad on the floor stands above the cats (1 m) and clear of the booth', () => {
    for (const s of AD_SLOTS) {
      if (s.kind === 'moon') continue;
      for (const t of [0, 17, 35, 70, 105]) {
        const c = slotCenter(s, t);
        expect(c.y - s.h / 2).toBeGreaterThan(1.05);
        expect(Math.hypot(c.x, c.z)).toBeGreaterThan(5);
      }
    }
  });

  it('nothing covers the moon or the DJ in the hero shot', () => {
    for (const cam of HERO_CAMS) {
      const moon = viewAngles({ x: MOON.center[0], y: MOON.center[1], z: MOON.center[2] }, cam);
      const moonR = (Math.asin(MOON.radius / moon.d) * 180) / Math.PI;
      const dj = viewAngles({ x: 0, y: 2.2, z: 0 }, cam);
      for (const s of AD_SLOTS) {
        // Blimps: sample a whole orbit.
        const times = s.kind === 'blimp' ? Array.from({ length: 72 }, (_, i) => (i / 72) * BLIMP_ORBIT.period) : [0];
        for (const t of times) {
          const c = slotCenter(s, t);
          const a = viewAngles(c, cam);
          if (c.z > cam.z - 0.5) continue; // behind the camera
          const hw = halfAngle(s.w, a.d);
          const hh = halfAngle(s.h, a.d);
          // Closest point of the face's angular box to the moon centre: outside the disc.
          const dx = Math.max(0, Math.abs(a.h - moon.h) - hw);
          const dy = Math.max(0, Math.abs(a.v - moon.v) - hh);
          const inFrame = Math.abs(a.h) - hw < HERO_HALF_H;
          if (inFrame) expect(Math.hypot(dx, dy), `${s.id} t=${t} covers the moon`).toBeGreaterThan(moonR);
          // The DJ (≈ ±4° round the booth) is never behind an ad.
          const ddx = Math.max(0, Math.abs(a.h - dj.h) - hw);
          expect(ddx + Math.max(0, Math.abs(a.v - dj.v) - hh), `${s.id} covers the DJ`).toBeGreaterThan(4);
        }
      }
    }
  });

  it('the hero shot shows the two screens and the two moon-ring banners', () => {
    const cam = HERO_CAMS[0];
    const inHero = AD_SLOTS.filter((s) => {
      const a = viewAngles(slotCenter(s, 0), cam);
      return Math.abs(a.h) < HERO_HALF_H && a.v < 18 && a.v > -20;
    }).map((s) => s.id);
    expect(inHero).toEqual(expect.arrayContaining(['screen-1', 'screen-2', 'moon-1', 'moon-2']));
  });

  it('blimps climb over the moon sightline instead of crossing it', () => {
    const far = blimpPosition(Math.PI * 0, 0); // a = 0: the far side (−Z)
    expect(far.z).toBeLessThan(-10);
    expect(far.y).toBeGreaterThan(BLIMP_ORBIT.y + BLIMP_ORBIT.climb * 0.9);
    const near = blimpPosition(Math.PI, 0);
    expect(near.y).toBe(BLIMP_ORBIT.y);
  });

  it('places every slot on the mini-map inside the frame, none on top of another', () => {
    const pts = AD_SLOTS.map((s) => ({ id: s.id, ...miniMapPoint(s) }));
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(0.02);
      expect(p.x).toBeLessThan(0.98);
      expect(p.y).toBeGreaterThan(0.02);
      expect(p.y).toBeLessThan(0.98);
    }
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y), `${pts[i].id} vs ${pts[j].id}`).toBeGreaterThan(0.06);
  });
});

// ------------------------------------------------------------------ purchase form

describe('ad purchase form', () => {
  it('accepts https links to public sites only', () => {
    expect(normalizeAdUrl(' https://Purrfect.example.com/menu ')).toEqual({ ok: true, url: 'https://purrfect.example.com/menu' });
    for (const bad of ['http://a.com', 'javascript:alert(1)', 'a.com', 'https://localhost/', 'https://10.0.0.1/', 'https://u:p@a.com', 'https://a.com:444/', '']) {
      expect(normalizeAdUrl(bad).ok, bad).toBe(false);
    }
  });
  it('checks the sponsor name like the server', () => {
    expect(checkAdName('  Purrfect   Coffee & Co. ')).toEqual({ ok: true, value: 'Purrfect Coffee & Co.' });
    expect(checkAdName('a').ok).toBe(false);
    expect(checkAdName('x'.repeat(33)).ok).toBe(false);
    expect(checkAdName('<b>hi</b>').ok).toBe(false);
    expect(checkAdName('visit evil.com').ok).toBe(false);
  });
  it('takes PNG, JPG or WebP up to 2 MB', () => {
    expect(checkImageFile({ type: 'image/png', size: 1000 }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/webp', size: AD_IMAGE_MAX_BYTES }).ok).toBe(true);
    expect(checkImageFile({ type: 'image/png', size: AD_IMAGE_MAX_BYTES + 1 }).ok).toBe(false);
    expect(checkImageFile({ type: 'image/gif', size: 10 }).ok).toBe(false);
    expect(checkImageFile({ type: 'image/svg+xml', size: 10 }).ok).toBe(false);
    expect(checkImageFile(null).ok).toBe(false);
  });
  it('prices $100 with the same fee gross-up as the server', () => {
    const fee = { percentBps: 290, fixedCents: 30 };
    expect(adQuote(10000, true, fee)).toEqual({ priceCents: 10000, feeCents: 330, amountCents: 10330 });
    expect(adQuote(10000, false, fee)).toEqual({ priceCents: 10000, feeCents: 0, amountCents: 10000 });
  });
  it('crops to the slot aspect from the centre', () => {
    expect(cropRect(1000, 1000, 16 / 9)).toEqual({ sx: 0, sy: 219, sw: 1000, sh: 563 });
    expect(cropRect(1600, 400, 1 / 3)).toEqual({ sx: 734, sy: 0, sw: 133, sh: 400 });
    expect(cropRect(1200, 300, 4)).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 300 });
  });
  it('posts the form as multipart with the server-side fields only (no price)', async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect([...form.keys()].sort()).toEqual(['clientKey', 'coverFee', 'image', 'method', 'name', 'slotId', 'url', 'x']);
      expect(form.get('coverFee')).toBe('true');
      expect(form.get('slotId')).toBe('banner-2');
      expect(form.get('method')).toBe('card');
      return new Response(
        JSON.stringify({ adId: 'ad_0123456789abcdef', slotId: 'banner-2', status: 'held', name: 'Purr', url: 'https://purr.example.com/', x: 'purr', imageUrl: 'https://cdn.example.com/a.webp', priceCents: 10000, feeCents: 330, amountCents: 10330, holdUntil: '2026-10-16T12:15:00Z', liveUntil: null, clientSecret: 'pi_1_secret_2' }),
        { status: 201 },
      );
    });
    const api = createAdsApi({ base: 'https://api.example.com/', fetchFn: fetchFn as unknown as typeof fetch });
    const order = await api.checkout({ slotId: 'banner-2', name: 'Purr', url: 'https://purr.example.com/', x: 'purr', coverFee: true, clientKey: 'k-12345678', image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), method: 'card' });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.example.com/rave/ads/checkout');
    expect(order).toMatchObject({ adId: 'ad_0123456789abcdef', amountCents: 10330, clientSecret: 'pi_1_secret_2' });
  });
  it('turns a taken slot into a readable error', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ statusCode: 409, code: 'RAVE_AD_SLOT_TAKEN', message: 'x' }), { status: 409 }));
    const api = createAdsApi({ base: 'https://api.example.com', fetchFn: fetchFn as unknown as typeof fetch });
    await expect(api.checkout({ slotId: 'screen-1', name: 'Purr', url: 'https://a.com/', x: '', coverFee: false, clientKey: 'k-12345678', image: new Blob(['x']), method: 'card' })).rejects.toMatchObject({
      code: 'RAVE_AD_SLOT_TAKEN',
      message: 'Someone just took that slot. Pick another one.',
    });
  });
});

// ------------------------------------------------------------------ answers from the server

describe('ad API answers', () => {
  it('status: unknown or missing slots are not for sale; not ready stays closed', () => {
    expect(parseAdsStatus({ enabled: false, reason: 'stripe' })).toEqual({ enabled: false, reason: 'stripe' });
    expect(parseAdsStatus(null)).toEqual({ enabled: false, reason: 'unknown' });
    expect(parseAdsStatus({ enabled: true, publishableKey: 'sk_live_x' })).toEqual({ enabled: false, reason: 'stripe' });
    const st = parseAdsStatus({ enabled: true, publishableKey: 'pk_test_abc', priceCents: 10000, slots: [{ slotId: 'screen-1', free: true }, { slotId: 'evil', free: true }] });
    if (!st.enabled) throw new Error('expected on');
    expect(st.slots).toHaveLength(20);
    expect(st.slots.filter((s) => s.free).map((s) => s.slotId)).toEqual(['screen-1']);
  });
  it('live ads: https images and links only, one per slot, handles re-checked', () => {
    const ok = { adId: 'ad_0123456789abcdef', slotId: 'moon-1', name: 'Purr', url: 'https://purr.example.com', x: 'purr', imageUrl: 'https://cdn.example.com/a.webp', liveUntil: '2026-11-15T00:00:00Z' };
    const list = parseLiveAds({
      ads: [
        ok,
        { ...ok, adId: 'ad_1111111111111111' }, // same slot twice
        { ...ok, adId: 'ad_2222222222222222', slotId: 'moon-2', imageUrl: 'http://cdn.example.com/a.webp' },
        { ...ok, adId: 'ad_3333333333333333', slotId: 'tower-1', url: 'javascript:alert(1)' },
        { ...ok, adId: 'ad_4444444444444444', slotId: 'tower-2', x: 'not a handle!' },
      ],
    });
    expect(list.map((a) => a.slotId)).toEqual(['moon-1', 'tower-2']);
    expect(list[1].x).toBeNull();
    expect(list[0].url).toBe('https://purr.example.com/');
    expect(safeImageUrl('data:image/png;base64,AAA')).toBeNull();
  });
  it('orders: a bad client secret is dropped', () => {
    const o = parseAdOrder({ adId: 'ad_0123456789abcdef', slotId: 'screen-2', status: 'held', clientSecret: '<script>' });
    expect(o?.clientSecret).toBeNull();
    expect(parseAdOrder({ adId: 'nope', slotId: 'screen-2', status: 'held' })).toBeNull();
  });
});
