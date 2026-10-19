/**
 * Race rules (GDD 1.2): countdown, laps from the continuous track distance, finish with a sub-tick time, live
 * positions and overtake events, and when the race is over. Lap counting uses `dist` (signed progress accumulated
 * from the local track query), so reversing over the line or cutting across the infield cannot add a lap.
 *
 * Iteration 2 fixes: a lap taken back and re-crossed is not a new lap (B1: no bogus best lap, no second `lap`
 * event); karts finishing in the same tick are placed by their sub-tick crossing time (B2); positions have
 * hysteresis and overtake events a cooldown (B3: side-by-side karts used to swap every tick).
 */
import { RACE } from '../../tuning';
import { speedOf } from './kart';
import type { SimContext } from './plugins';

/** Lap the kart is on: 1..laps (0 on the grid, laps+1 once finished). */
export function lapOf(dist: number, lapLength: number): number {
  return dist < 0 ? 0 : Math.floor(dist / lapLength) + 1;
}

export function stepCountdown(ctx: SimContext): void {
  const { st, goTick } = ctx;
  const t = st.tick;
  if (t === goTick - 180 || t === goTick - 120 || t === goTick - 60) ctx.emit({ type: 'countdown', kart: -1, a: (goTick - t) / 60 });
  if (t === goTick) {
    st.phase = 'race';
    for (const k of st.karts) k.lapStartTick = goTick;
    ctx.emit({ type: 'go', kart: -1 });
  }
}

/** Kart index + crossing data of this tick's finishers (scratch, reused). */
const fin: Array<{ i: number; cross: number; over: number }> = [];

export function stepLaps(ctx: SimContext): void {
  const { st, track, cfg } = ctx;
  const L = track.length;
  fin.length = 0;
  for (let i = 0; i < st.karts.length; i++) {
    const k = st.karts[i];
    if (k.finished) continue;
    const lap = lapOf(k.dist, L);
    if (lap > k.lap) {
      // sub-tick crossing time from the overshoot past the line and the distance this tick actually covered (B2)
      const over = k.dist - (lap - 1) * L;
      const prev = ctx.prevDist ? ctx.prevDist[i] : k.dist - speedOf(k) / 60;
      const moved = Math.max(0.05 / 60, k.dist - prev);
      const frac = Math.max(0, Math.min(1, over / moved));
      const cross = st.tick - frac;
      if (lap > k.lapMax) {
        // a new lap: the lap just completed counts for the best lap
        if (k.lap >= 1) {
          const lt = cross - k.lapStartTick;
          if (k.bestLapTicks === 0 || lt < k.bestLapTicks) k.bestLapTicks = lt;
        }
        k.lapMax = lap;
        k.lapStartPrev = k.lapStartTick;
        k.lapStartTick = cross;
        k.lap = lap;
        if (lap > st.laps) fin.push({ i, cross, over });
        else if (lap >= 2) {
          ctx.emit({ type: 'lap', kart: i, a: lap });
          if (lap === st.laps) ctx.emit({ type: 'finalLap', kart: i });
        }
      } else {
        // re-crossing a line driven back over (B1): no lap event, no best lap; the lap clock restarts here
        k.lapStartPrev = k.lapStartTick;
        k.lapStartTick = cross;
        k.lap = lap;
      }
    } else if (lap < k.lap && k.lap <= st.laps) {
      // drove backwards over the line: the lap is taken back, and its clock with it
      k.lap = Math.max(lap, 0);
      k.lapStartTick = k.lapStartPrev;
    }
  }
  if (!fin.length) return;
  // same-tick finishers: earlier crossing first, then the bigger overshoot, then the kart index (deterministic)
  fin.sort((a, b) => a.cross - b.cross || b.over - a.over || a.i - b.i);
  let already = 0;
  for (const k of st.karts) if (k.finished) already++;
  for (let r = 0; r < fin.length; r++) {
    const { i, cross } = fin[r];
    const k = st.karts[i];
    k.finished = 1;
    k.finishTime = cross - ctx.goTick;
    k.place = already + r + 1;
    k.wrongTicks = 0;
  }
  for (const { i } of fin) {
    const k = st.karts[i];
    ctx.emit({ type: 'finish', kart: i, a: k.place, b: k.finishTime });
    const human = cfg.humans.includes(i);
    if (st.firstFinishTick < 0 && (human || cfg.humans.length === 0)) st.firstFinishTick = st.tick;
  }
}

/** Scratch arrays for stepPositions (B58: no per-tick allocation). */
let prevOrd: number[] = [];

/**
 * Race order with hysteresis (B3): finished karts by finish time; racing karts keep their order until the one behind
 * leads by `RACE.leadMargin` or has been ahead for `RACE.leadTicks` in a row. Overtake events (humans only) have a
 * per-pair cooldown and stay quiet for the first seconds after GO, when the grid sorts itself out.
 */
export function stepPositions(ctx: SimContext): void {
  const { st, cfg } = ctx;
  const ks = st.karts;
  const n = ks.length;
  const lead = st.pairs?.lead;
  // how many ticks in a row kart a has been ahead of kart b
  if (lead) {
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const p = a * n + b;
        lead[p] = ks[a].dist > ks[b].dist ? lead[p] + 1 : 0;
      }
  }
  /** should a be ahead of b? */
  const ahead = (a: number, b: number): boolean => {
    const ka = ks[a];
    const kb = ks[b];
    if (ka.finished !== kb.finished) return ka.finished > kb.finished;
    if (ka.finished) return ka.finishTime < kb.finishTime || (ka.finishTime === kb.finishTime && a < b);
    if (ka.dist > kb.dist + RACE.leadMargin) return true;
    if (kb.dist > ka.dist + RACE.leadMargin) return false;
    if (lead && st.phase === 'race') return ka.dist > kb.dist && lead[a * n + b] >= RACE.leadTicks;
    return ka.dist > kb.dist || (ka.dist === kb.dist && a < b);
  };
  if (prevOrd.length !== st.order.length) prevOrd = st.order.slice();
  else for (let p = 0; p < n; p++) prevOrd[p] = st.order[p];
  const ord = st.order;
  // insertion sort from the previous order: only swaps that pass the hysteresis move a kart
  for (let p = 1; p < n; p++) {
    const v = ord[p];
    let q = p - 1;
    while (q >= 0 && ahead(v, ord[q])) {
      ord[q + 1] = ord[q];
      q--;
    }
    ord[q + 1] = v;
  }
  for (let p = 0; p < n; p++) {
    const k = ks[ord[p]];
    if (!k.finished) k.place = p + 1;
  }
  if (st.phase !== 'race' || ctx.track.arena) return;
  const quiet = st.tick < ctx.goTick + RACE.overtakeQuietTicks;
  const cd = st.pairs?.overtake;
  const fire = (kart: number, place: number, passed: number) => {
    const p = kart * n + passed;
    if (quiet || (cd && cd[p] > 0)) return;
    if (cd) cd[p] = RACE.overtakeCooldownTicks;
    ctx.emit({ type: 'overtake', kart, a: place, b: passed });
  };
  for (const h of cfg.humans) {
    const was = prevOrd.indexOf(h);
    const now = ord.indexOf(h);
    if (now < was) {
      for (let p = now + 1; p <= was; p++) fire(h, now + 1, ord[p]);
    } else if (now > was) {
      for (let p = was; p < now; p++) fire(ord[p], p + 1, h);
    }
  }
}

/** The race is over when every kart finished, a tail after the first human finish ran out, or the hard cap hit. */
export function raceOver(ctx: SimContext, tailTicks: number, maxTicks: number): boolean {
  const { st } = ctx;
  if (!ctx.track.arena) {
    if (st.karts.every((k) => k.finished)) return true;
    if (st.firstFinishTick >= 0 && st.tick - st.firstFinishTick >= tailTicks) return true;
  }
  return st.tick - ctx.goTick >= maxTicks;
}
