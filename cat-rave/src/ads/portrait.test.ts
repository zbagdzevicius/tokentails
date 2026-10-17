import { describe, expect, it } from 'vitest';
import { declineNextStep } from '../checkout/stripe';
import { AISLE, buildSlots, inBoothAisle } from '../crowd/slots';
import { AD_KINDS, AD_SEEN_IN, AD_SLOTS, MOON, PORTRAIT_ASPECT, moonRingOffset, slotCenter, viewAngles } from './slots';

/*
 * Round-1 UX fixes: ads in the portrait (phone) hero shot, the booth sightline aisle that keeps the Arc
 * desk logo visible, and the decline message's next step.
 */

/** Portrait hero (director.ts portraitHero): cat-eye camera with a small crowd, raised over a big one. */
const PHONE_CAMS = [
  { x: 0, y: 1.15, z: 8 },
  { x: 0, y: 3.4, z: 12 },
];
/** 390 x 844 phone: vfov 50 + (1 - 0.46) * 26 ≈ 64° → about ±16° horizontally. */
const PHONE_HALF_H = 16;
const halfAngle = (size: number, d: number) => (Math.atan2(size / 2, d) * 180) / Math.PI;

describe('ads in the portrait hero shot', () => {
  it('both moon-ring banners sit fully inside the phone frame, off the moon disc', () => {
    expect(PORTRAIT_ASPECT).toBeGreaterThan(0.46);
    for (const cam of PHONE_CAMS) {
      const moon = viewAngles({ x: MOON.center[0], y: MOON.center[1], z: MOON.center[2] }, cam);
      const moonR = (Math.asin(MOON.radius / moon.d) * 180) / Math.PI;
      for (const s of AD_SLOTS.filter((x) => x.kind === 'moon')) {
        const a = viewAngles(slotCenter(s, 0, MOON.center, true), cam);
        const hw = halfAngle(s.w, a.d);
        const hh = halfAngle(s.h, a.d);
        expect(Math.abs(a.h) + hw, `${s.id} inside the frame`).toBeLessThan(PHONE_HALF_H);
        const dx = Math.max(0, Math.abs(a.h - moon.h) - hw);
        const dy = Math.max(0, Math.abs(a.v - moon.v) - hh);
        expect(Math.hypot(dx, dy), `${s.id} off the moon`).toBeGreaterThan(moonR);
      }
    }
  });

  it('keeps the landscape position for wide screens, and says where each kind is seen', () => {
    expect(moonRingOffset(0)).toEqual(AD_SLOTS.find((s) => s.id === 'moon-1')!.pos);
    for (const k of Object.keys(AD_KINDS)) expect(AD_SEEN_IN[k as keyof typeof AD_KINDS]).toMatch(/\w/);
    expect(AD_SEEN_IN.moon).toMatch(/phones/i);
  });
});

describe('booth sightline aisle', () => {
  it('no crowd slot stands in the aisle in front of the booth, and growing still never moves a cat', () => {
    const big = buildSlots(3000);
    for (let i = 0; i < big.count; i++) expect(inBoothAisle(big.x[i], big.z[i])).toBe(false);
    const small = buildSlots(60);
    for (let i = 0; i < 60; i++) expect([small.x[i], small.z[i]]).toEqual([big.x[i], big.z[i]]);
    // The aisle covers the desk logo plate (1.42 m wide) from the front row on.
    expect(AISLE.halfWidth).toBeGreaterThan(1.42 / 2);
    expect(inBoothAisle(0, 3.5)).toBe(true);
    expect(inBoothAisle(0, -3.5)).toBe(false);
    expect(inBoothAisle(2.5, 3.5)).toBe(false);
  });
});

describe('card decline', () => {
  it('always names a next step; USDC only when it is on', () => {
    expect(declineNextStep(true)).toMatch(/another card.*Apple Pay.*Google Pay.*USDC/);
    expect(declineNextStep(false)).not.toMatch(/USDC/);
  });
});
