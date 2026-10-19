/**
 * Time-trial ghosts (pure sim helpers, no DOM): the time-trial race config, the dev ghost and medal times, and
 * re-simulating a ghost's inputs for its time and checkpoint splits.
 *
 * The dev ghost is an in-house run by the Token Tails team's scripted test driver (items-ai `playerBot` at full
 * skill), recorded on this device against the current sim, so it always replays exactly; it is labelled "Dev ghost
 * (Token Tails team)" and never shown as a player record. Medals: gold, silver, bronze at the dev time +2 %, +6 %,
 * +12 %.
 */
import { DEFAULT_CAT, packInput, unpackInput, type KartLook, type RaceClass, type RaceConfig, type RacerInfo, type TickInput, type TrackDef } from '../../types';
import { SimWorld } from '../../core/sim/world';
import { createSimPlugins, kartLookFor } from '../../items-ai';
import { playerBot } from '../../items-ai/balance/bots';
import { RACE } from '../../tuning';

/** Time trials run on one fixed seed (hazards draw from it), so a ghost and a new run see the same track. */
export const TT_SEED = 0x7717;
export const MEDAL_STEPS: readonly number[] = [1.02, 1.06, 1.12];
export const DEV_SKILL = 1;

export function ttConfig(track: TrackDef, cls: RaceClass, modifiers: number, racer: RacerInfo, forgiving = false): RaceConfig {
  return { track, seed: TT_SEED, cls, modifiers, racers: [racer], humans: [0], forgiving, mode: 'tt' };
}

export function devRacer(kart?: KartLook): RacerInfo {
  return { name: 'Dev ghost', cat: DEFAULT_CAT, kart: kart ?? { ...kartLookFor(0), body: 0 } };
}

export interface GhostRun {
  /** packed inputs per tick */
  inputs: number[];
  /** finish time, seconds; null = did not finish */
  time: number | null;
  /** checkpoint times, seconds */
  splits: number[];
}

/** A stepping job: `step(n)` runs up to n ticks and returns the result once done. */
export interface SimJob<T> {
  step(n: number): T | null;
}

const maxTicks = (): number => Math.round((RACE.maxTime + 10) * 60);

function splitsOf(w: SimWorld): number[] {
  const out: number[] = [];
  for (const e of w.st.events) if (e.type === 'checkpoint' && e.kart === 0) out[e.a ?? 0] = (e.b ?? 0) / 60;
  return out;
}

/** Record the dev ghost: the team's scripted driver runs the time trial. */
export function devGhostJob(cfg: RaceConfig): SimJob<GhostRun> {
  const w = new SimWorld(cfg, createSimPlugins(cfg));
  const inputs: number[] = [];
  const buf: TickInput[] = [];
  const cap = maxTicks();
  return {
    step(n) {
      for (let i = 0; i < n && !w.done && w.tick < cap; i++) {
        const k = w.st.karts[0];
        if (k.finished) break;
        const packed = packInput(playerBot(w.ctx, 0, DEV_SKILL));
        inputs.push(packed);
        buf[0] = unpackInput(packed);
        w.step(buf);
      }
      const k = w.st.karts[0];
      if (!k.finished && !w.done && w.tick < cap) return null;
      return { inputs, time: k.finished ? k.finishTime / 60 : null, splits: splitsOf(w) };
    },
  };
}

/** Re-simulate recorded inputs (a ghost) for its time and splits. */
export function replayJob(cfg: RaceConfig, inputs: readonly number[]): SimJob<GhostRun> {
  const w = new SimWorld(cfg, createSimPlugins(cfg));
  const buf: TickInput[] = [];
  return {
    step(n) {
      for (let i = 0; i < n && !w.done && w.tick < inputs.length; i++) {
        if (w.st.karts[0].finished) break;
        buf[0] = unpackInput(inputs[w.tick]);
        w.step(buf);
      }
      const k = w.st.karts[0];
      if (!k.finished && !w.done && w.tick < inputs.length) return null;
      return { inputs: inputs.slice(), time: k.finished ? k.finishTime / 60 : null, splits: splitsOf(w) };
    },
  };
}

/** Run a job to the end in one go (tests). */
export function runSync<T>(job: SimJob<T>): T {
  for (;;) {
    const r = job.step(100_000);
    if (r) return r;
  }
}

/** Run a job a slice per macrotask so menus stay smooth (about 1500 ticks a slice). */
export function runAsync<T>(job: SimJob<T>, slice = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const r = job.step(slice);
        if (r) resolve(r);
        else setTimeout(tick, 0);
      } catch (err) {
        reject(err);
      }
    };
    setTimeout(tick, 0);
  });
}

/** Medal times from the dev time: [gold, silver, bronze], to the hundredth (what the screen shows). */
export function medalTimes(dev: number): [number, number, number] {
  const r = (x: number) => Math.round(dev * x * 100) / 100;
  return [r(MEDAL_STEPS[0]), r(MEDAL_STEPS[1]), r(MEDAL_STEPS[2])];
}

/** Medal for a time: 3 gold, 2 silver, 1 bronze, 0 none. */
export function medalFor(time: number | null, dev: number | null): number {
  if (time == null || dev == null) return 0;
  const [g, s, b] = medalTimes(dev);
  return time <= g ? 3 : time <= s ? 2 : time <= b ? 1 : 0;
}

/** A short signature of a track definition: dev times are cached per track shape and sim version. */
export function trackSig(def: TrackDef): string {
  const s = JSON.stringify([def.points, def.features, def.laps, def.branches ?? null, def.hazards ?? null, def.coins ?? null]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
