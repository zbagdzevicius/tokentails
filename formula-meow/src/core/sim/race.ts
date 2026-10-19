/**
 * Race rules (GDD 1.2): countdown, laps from the continuous track distance, finish with a sub-tick time, live
 * positions and overtake events, and when the race is over. Lap counting uses `dist` (signed progress accumulated
 * from the local track query), so reversing over the line or cutting across the infield cannot add a lap.
 */
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

export function stepLaps(ctx: SimContext): void {
  const { st, track, cfg } = ctx;
  const L = track.length;
  for (let i = 0; i < st.karts.length; i++) {
    const k = st.karts[i];
    if (k.finished) continue;
    const lap = lapOf(k.dist, L);
    if (lap > k.lap) {
      // sub-tick crossing time from the overshoot past the line
      const over = k.dist - (lap - 1) * L;
      const v = Math.max(1, speedOf(k));
      const cross = st.tick - Math.min(1, over / v / (1 / 60));
      if (k.lap >= 1) {
        const lt = cross - k.lapStartTick;
        if (k.bestLapTicks === 0 || lt < k.bestLapTicks) k.bestLapTicks = lt;
      }
      k.lap = lap;
      k.lapStartTick = cross;
      if (lap > st.laps) {
        k.finished = 1;
        k.finishTime = cross - ctx.goTick;
        let place = 1;
        for (const o of st.karts) if (o !== k && o.finished) place++;
        k.place = place;
        ctx.emit({ type: 'finish', kart: i, a: place, b: k.finishTime });
        const human = cfg.humans.includes(i);
        if (st.firstFinishTick < 0 && (human || cfg.humans.length === 0)) st.firstFinishTick = st.tick;
      } else if (lap >= 2) {
        ctx.emit({ type: 'lap', kart: i, a: lap });
        if (lap === st.laps) ctx.emit({ type: 'finalLap', kart: i });
      }
    } else if (lap < k.lap && k.lap <= st.laps) {
      // drove backwards over the line: the lap is taken back (the lap timer keeps running)
      k.lap = Math.max(lap, 0);
    }
  }
}

/** Race order: finished karts by finish time, then by distance, then by index (deterministic). */
export function stepPositions(ctx: SimContext): void {
  const { st, cfg } = ctx;
  const prev = st.order.slice();
  const ord = st.karts.map((_, i) => i);
  ord.sort((a, b) => {
    const ka = st.karts[a];
    const kb = st.karts[b];
    if (ka.finished !== kb.finished) return kb.finished - ka.finished;
    if (ka.finished) return ka.finishTime - kb.finishTime || a - b;
    return kb.dist - ka.dist || a - b;
  });
  st.order = ord;
  for (let p = 0; p < ord.length; p++) {
    const k = st.karts[ord[p]];
    if (!k.finished) k.place = p + 1;
  }
  if (st.phase !== 'race' || prev.length !== ord.length) return;
  for (const h of cfg.humans) {
    const was = prev.indexOf(h);
    const now = ord.indexOf(h);
    if (now < was) for (let p = now + 1; p <= was; p++) ctx.emit({ type: 'overtake', kart: h, a: now + 1, b: ord[p] });
    else if (now > was) for (let p = was; p < now; p++) ctx.emit({ type: 'overtake', kart: ord[p], a: p + 1, b: h });
  }
}

/** The race is over when every kart finished, a tail after the first human finish ran out, or the hard cap hit. */
export function raceOver(ctx: SimContext, tailTicks: number, maxTicks: number): boolean {
  const { st } = ctx;
  if (st.karts.every((k) => k.finished)) return true;
  if (st.firstFinishTick >= 0 && st.tick - st.firstFinishTick >= tailTicks) return true;
  return st.tick - ctx.goTick >= maxTicks;
}
