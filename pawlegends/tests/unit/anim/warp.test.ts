/**
 * ANIM-SPEC §4.2 / §12 warp.test: the contact pose lands on its sim anchor within one 60 Hz frame for windup, peek
 * and cadence leads; the 0.5–2.5× clamp and the snap coil; freeze debt is repaid; progress segments reach s = 1 on
 * the dash's end tick (4 m / 6 t, 3 m / 5 t, 5 m / 8 t) and an interrupted dash snaps to the landing.
 */
import { describe, expect, it } from 'vitest';
import { TimeWarp, RATE_MAX, RATE_MIN } from '../../../src/render/anim/warp';
import { ANCHOR_INDEX as A, newAnchors, Prio, type ClipDef } from '../../../src/render/anim/types';
import { DASH_SPEED, TICK_S, travelTicks } from '../../../src/render/anim/timing';
import { flip, swing } from '../../../src/render/anim/common';

const FRAME = 1 / 60;

/** Step a warp at 60 Hz from `t0` and return the render time of the first frame whose clip time reaches `marker`. */
function landing(w: TimeWarp, t0: number, marker: number, until = 3): number {
  for (let t = t0; t < t0 + until; t += FRAME) {
    w.step(FRAME);
    if (w.time(t) >= marker - 1e-9) return t;
  }
  return NaN;
}

const clip = (contact: number, len = contact + 0.3): ClipDef => ({
  id: 'test.c',
  len,
  mask: 'full',
  mode: 'override',
  prio: Prio.Ability,
  keys: [[0, null, null]],
  markers: { contact, end: len },
  warp: [['contact', 'contact']],
});

describe('time-warp: contact on the anchor', () => {
  it.each([
    ['windup lead (Sage R, 30 t)', 0.5, 30 * TICK_S],
    ['cadence lead (8 t + interp lag)', 0.267, 9.6 * TICK_S],
    ['peek lead (≈53 ms snap coil)', 0.267, 1.6 * TICK_S],
    ['long lead (delayed start)', 0.2, 1.5],
  ])('%s', (_name, c, lead) => {
    const now = 10;
    const an = newAnchors();
    an[A.contact] = now + lead;
    const w = new TimeWarp();
    w.build(clip(c), an, now);
    expect(w.preRate).toBeGreaterThanOrEqual(RATE_MIN - 1e-9);
    expect(w.preRate).toBeLessThanOrEqual(RATE_MAX + 1e-9);
    // never skips the contact pose
    expect(w.time(now)).toBeLessThanOrEqual(c);
    const hit = landing(w, now, c);
    expect(Math.abs(hit - (now + lead))).toBeLessThanOrEqual(FRAME + 1e-9);
  });

  it('snap coil: L < c / 2.5 starts inside the coil at 2.5×', () => {
    const w = new TimeWarp();
    const an = newAnchors();
    an[A.contact] = 0.05;
    w.build(clip(0.267), an, 0);
    expect(w.preRate).toBe(RATE_MAX);
    expect(w.startCt).toBeCloseTo(0.267 - 2.5 * 0.05, 9);
    expect(w.time(0.05)).toBeCloseTo(0.267, 9);
  });

  it('an anchor already passed plays impact-led from the contact pose (never late)', () => {
    const w = new TimeWarp();
    const an = newAnchors();
    an[A.contact] = 4.9;
    w.build(clip(0.267), an, 5);
    expect(w.time(5)).toBeCloseTo(0.267, 9);
  });

  it('time segments clamp to 0.5–2.5× and still land every marker on its anchor', () => {
    const def: ClipDef = { ...clip(0.1, 1.2), markers: { a: 0.1, b: 1.1, end: 1.2 }, warp: [['a', 'cast'], ['b', 'stateEnd']] };
    for (const span of [0.2, 0.5, 4]) {
      const an = newAnchors();
      an[A.cast] = 1;
      an[A.stateEnd] = 1 + span;
      const w = new TimeWarp();
      w.build(def, an, 0.9);
      expect(w.time(1)).toBeCloseTo(0.1, 6);
      expect(w.time(1 + span)).toBeCloseTo(1.1, 6);
      // the rate never leaves the clamp inside the segment
      let prev = w.time(1);
      for (let t = 1 + FRAME; t < 1 + span; t += FRAME) {
        const c = w.time(t);
        expect((c - prev) / FRAME).toBeLessThanOrEqual(RATE_MAX + 1e-6);
        prev = c;
      }
    }
  });

  it('post-contact runs at the basic post rate', () => {
    const w = new TimeWarp();
    const an = newAnchors();
    an[A.contact] = 1;
    w.build(clip(0.267, 1), an, 1 - 0.267, 1, 1.4);
    expect(w.time(1.1) - w.time(1)).toBeCloseTo(0.14, 6);
  });
});

describe('time-warp: freeze debt', () => {
  it('a freeze holds the clip, then 1.5× repays it before the next contact', () => {
    const w = new TimeWarp();
    const an = newAnchors();
    an[A.contact] = 1;
    w.build(clip(0.267, 1), an, 1 - 0.267);
    let t = 1;
    w.step(FRAME);
    const at = w.time(t);
    w.freeze(0.1);
    for (let i = 0; i < 6; i++) {
      t += FRAME;
      w.step(FRAME);
    }
    expect(w.time(t)).toBeCloseTo(at, 2);
    expect(w.debt).toBeGreaterThan(0.09);
    // repaid within 0.2 s of render time after the freeze (0.1 s debt / 0.5 per s)
    for (let i = 0; i < 13; i++) {
      t += FRAME;
      w.step(FRAME);
    }
    expect(w.debt).toBeCloseTo(0, 9);
    // the next basic's contact (a new bind) still lands on its tick
    const w2 = new TimeWarp();
    const an2 = newAnchors();
    an2[A.contact] = t + 0.3;
    w2.build(clip(0.267), an2, t);
    expect(Math.abs(landing(w2, t, 0.267) - (t + 0.3))).toBeLessThanOrEqual(FRAME + 1e-9);
  });
});

describe('time-warp: freeze on the contact pose', () => {
  it('a hit-stop asked a frame early still shows the contact pose on its anchor, then holds it', () => {
    const w = new TimeWarp();
    const an = newAnchors();
    an[A.contact] = 1;
    w.build(clip(0.267, 1), an, 1 - 0.267);
    // the hit fires on the frame that crosses the anchor (render 1 + half a frame)
    const t = 1 + FRAME / 2;
    w.freeze(0.045);
    w.step(FRAME, t);
    expect(w.time(t)).toBeCloseTo(0.267, 9);
    w.step(FRAME, t + FRAME);
    expect(w.time(t + FRAME)).toBeCloseTo(0.267, 9);
  });
});

describe('time-warp: progress segments', () => {
  it.each([
    ['Clem E 4 m', 4000, 6],
    ['Sage E 3 m', 3000, 5],
    ['Brutus E 5 m', 5000, 8],
  ])('%s: s = 1 on the dash end tick', (_n, mm, ticks) => {
    expect(travelTicks(mm, DASH_SPEED)).toBe(ticks);
    const def = flip({ id: 'test.flip' });
    const castT = 2;
    const an = newAnchors();
    an[A.cast] = castT;
    an[A.travelEnd] = castT + ticks * TICK_S;
    const w = new TimeWarp();
    w.build(def, an, castT - 1.6 * TICK_S);
    const land = def.markers.land;
    for (let k = 0; k <= ticks; k++) {
      const t = castT + k * TICK_S;
      const travelled = Math.min(mm, (DASH_SPEED / 30) * k);
      w.progress = travelled / mm;
      const c = w.time(t - 1e-9);
      if (k < ticks) expect(c).toBeLessThan(land);
    }
    w.progress = 1;
    expect(w.time(castT + ticks * TICK_S - 1e-6)).toBeCloseTo(land, 6);
  });

  it('an interrupted dash snaps to the landing', () => {
    const def = flip({ id: 'test.flip' });
    const an = newAnchors();
    an[A.cast] = 1;
    an[A.travelEnd] = 1 + 6 * TICK_S;
    const w = new TimeWarp();
    w.build(def, an, 1);
    w.progress = 0.4;
    expect(w.time(1 + 2 * TICK_S)).toBeLessThan(def.markers.land);
    // stopped by a wall at tick 3: progress 1 and the anchor moves to now
    w.progress = NaN;
    w.retime(A.travelEnd, 1 + 3 * TICK_S);
    expect(w.time(1 + 3 * TICK_S)).toBeCloseTo(def.markers.land, 6);
  });
});

describe('templates bind contact', () => {
  it('a swing template contacts at the 8 t basic windup', () => {
    const s = swing({ id: 'x.a' });
    expect(s.markers.contact).toBeCloseTo(8 / 30, 9);
    expect(s.warp[0]).toEqual(['contact', 'contact']);
  });
});
