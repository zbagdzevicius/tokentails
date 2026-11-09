// @vitest-environment happy-dom
/**
 * PERF-IOS §8 Track C (docs/plans/moba/PERF-IOS.md): cooldown sweeps written only when they move a step, the loading veil that
 * waits for the warm-up (with caps), the warm-up's hero list, and the champion browser's cover flag.
 */
import { describe, expect, it } from 'vitest';
import { SWEEP_STEPS, applySweep, newSweep, sweepFrac } from '../../src/ui/cdSweep';
import { WARM, warmMatch } from '../../src/render/perf/pacer';
import { warmPlan } from '../../src/render/gameView';
import { champCovered, setChampCovered } from '../../src/ui/champBrowser/cover';
import { PREVIEW_BARS_DPR, PREVIEW_FPS } from '../../src/ui/preview/skillPreview';

describe('cooldown sweep: a write only when the sweep moves a step', () => {
  /** Frames at `step` ms over a cooldown of `secs` (sim ticks at 30 Hz); returns the writes. */
  function writes(secs: number, step = 16.7): number {
    const el = document.createElement('i');
    const r = newSweep();
    const max = secs * 30;
    let n = 0;
    for (let t = 0; t <= secs * 1000 + 100; t += step) {
      const cd = Math.max(0, max - Math.floor((t / 1000) * 30));
      if (applySweep(el, r, cd, max)) n++;
    }
    return n;
  }

  it('writes at most SWEEP_STEPS + 1 times a cooldown, whatever the frame rate (was one write a frame)', () => {
    // 8 s at 60 fps: 480 frames, 91 writes; at 120 fps the same
    expect(writes(8)).toBeLessThanOrEqual(SWEEP_STEPS + 1);
    expect(writes(8, 8.3)).toBeLessThanOrEqual(SWEEP_STEPS + 1);
    // a 1 s cooldown at 60 fps: no more than one a frame
    expect(writes(1)).toBeLessThanOrEqual(62);
  });

  it('steps round up: "ready" (0) only when the cooldown is over; full at the start', () => {
    expect(sweepFrac(0, 300)).toBe(0);
    expect(sweepFrac(-1, 300)).toBe(0);
    expect(sweepFrac(1, 300)).toBe(1 / SWEEP_STEPS);
    expect(sweepFrac(300, 300)).toBe(1);
    expect(sweepFrac(450, 300)).toBe(1);
    expect(sweepFrac(150, 300)).toBeCloseTo(0.5, 6);
    // within one step of the exact share, never under it
    for (let cd = 1; cd <= 300; cd += 7) {
      const f = sweepFrac(cd, 300);
      expect(f).toBeGreaterThanOrEqual(cd / 300 - 1e-9);
      expect(f - cd / 300).toBeLessThan(1 / SWEEP_STEPS);
    }
  });

  it('writes --cd on the element only on a change', () => {
    const el = document.createElement('i');
    const r = newSweep();
    expect(applySweep(el, r, 150, 300)).toBe(true);
    expect(el.style.getPropertyValue('--cd')).toBe('0.5000');
    expect(applySweep(el, r, 149, 300)).toBe(false);
    expect(applySweep(el, r, 0, 300)).toBe(true);
    expect(el.style.getPropertyValue('--cd')).toBe('0.0000');
    expect(applySweep(el, r, 0, 300)).toBe(false);
  });
});

describe('loading veil waits for the warm-up', () => {
  /** A fake clock: each wait() is a timer; timers fire earliest first, after the pending promise jobs. */
  const clock = (): { t: number; wait: (ms: number) => Promise<void>; elapsed: () => number } => {
    const timers: { due: number; done: () => void }[] = [];
    const c = {
      t: 0,
      wait: (ms: number) =>
        new Promise<void>((done) => {
          timers.push({ due: c.t + ms, done });
          setTimeout(() => {
            timers.sort((a, b) => a.due - b.due);
            const next = timers.shift();
            if (!next) return;
            c.t = Math.max(c.t, next.due);
            next.done();
          }, 0);
        }),
      elapsed: () => c.t,
    };
    return c;
  };

  it('waits for the roster, then for the warm-up, and keeps the old 250 ms minimum', async () => {
    const c = clock();
    let warmed = 0;
    const r = await warmMatch(
      () => c.t >= 120,
      async () => {
        warmed++;
        c.t += 400;
      },
      c.wait,
      c.elapsed,
    );
    expect(warmed).toBe(1);
    expect(r.warmed).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(520 + WARM.settleMs);
    expect(r.ms).toBeLessThan(WARM.totalMs);
    const quick = clock();
    const q = await warmMatch(() => true, async () => undefined, quick.wait, quick.elapsed);
    expect(q.ms).toBe(Math.max(WARM.minMs, WARM.settleMs));
  });

  it('never holds the veil past the caps: no roster, a slow or failing warm-up, a session that ended', async () => {
    const a = clock();
    const noRoster = await warmMatch(() => false, async () => undefined, a.wait, a.elapsed);
    expect(noRoster.warmed).toBe(false);
    expect(noRoster.ms).toBeLessThanOrEqual(WARM.rosterMs + WARM.pollMs);
    const b = clock();
    const slow = await warmMatch(() => true, () => new Promise(() => undefined), b.wait, b.elapsed);
    expect(slow.warmed).toBe(false);
    expect(slow.ms).toBe(WARM.totalMs);
    const c = clock();
    const fail = await warmMatch(() => true, async () => Promise.reject(new Error('gl')), c.wait, c.elapsed);
    expect(fail.warmed).toBe(false);
    const d = clock();
    expect((await warmMatch(() => null, async () => undefined, d.wait, d.elapsed)).ms).toBe(-1);
  });
});

describe('warm-up hero list', () => {
  const roster = ['clem', 'domino', 'brutus', 'pixel', 'sage', 'nugget'] as const;
  it('every slot but the own hero and the rigs already up, with the hull its scope gives it', () => {
    const plan = warmPlan(roster as never, 0, 0, 'key', (s) => s === 1);
    expect(plan.map((p) => p.slot)).toEqual([2, 3, 4, 5]);
    expect(plan.filter((p) => p.outline).map((p) => p.slot)).toEqual([3, 4, 5]);
    expect(plan.every((p) => p.team === (p.slot < 3 ? 0 : 1))).toBe(true);
    expect(warmPlan(roster as never, 4, 1, 'all', () => false).every((p) => p.outline)).toBe(true);
    expect(warmPlan(roster as never, 4, 1, 'own', () => false).some((p) => p.outline)).toBe(false);
    expect(warmPlan(roster as never, 4, 1, 'key', () => false).filter((p) => p.outline).map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(warmPlan([], 0, 0, 'all', () => false)).toEqual([]);
  });
});

describe('champion browser cover and preview pacing', () => {
  it('the cover flag follows open and close and marks the page for the CSS', () => {
    expect(champCovered()).toBe(false);
    setChampCovered(true);
    expect(champCovered()).toBe(true);
    expect(document.documentElement.dataset.champ).toBe('1');
    setChampCovered(false);
    expect(champCovered()).toBe(false);
    expect(document.documentElement.dataset.champ).toBeUndefined();
  });
  it('the clip draws at the menu rate and its bars canvas stays at DPR 1.5 or less', () => {
    expect(PREVIEW_FPS).toBe(30);
    expect(PREVIEW_BARS_DPR).toBeLessThanOrEqual(1.5);
  });
});
