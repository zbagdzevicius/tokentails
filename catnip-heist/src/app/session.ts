/**
 * One heist run: owns the sim states, the fixed-timestep accumulator and the recorded input log.
 * Pure (no DOM, no three) so it is unit-tested with vitest.
 *
 *   const s = new HeistSession({ level, seed, catIds });
 *   // every animation frame:
 *   s.advance(dtSeconds, () => input.sample(), (state) => renderer.observe(state));
 *   renderer.update(s.prev, s.cur, s.alpha);
 */
import { NO_INPUT, SIM_VERSION, TICK_HZ, type Input, type LevelDef, type RunResult, type SimState } from '../types';
import { decodeInputs, encodeInputs, initSim, stepSim, type InputLog } from '../sim';

export const TICK_S = 1 / TICK_HZ;
/** Never simulate more than this many ticks in one frame (a stalled tab must not spiral). */
export const MAX_TICKS_PER_FRAME = 8;
/** Frame deltas above this (seconds) are clamped: time spent in a background tab is dropped. */
export const MAX_FRAME_DT = 0.25;

export interface SessionOptions {
  level: LevelDef;
  seed: number;
  catIds: [string, string];
  /** Replay mode: play these recorded inputs instead of live input. */
  replay?: InputLog;
}

export type TickListener = (state: SimState, input: Input) => void;

/**
 * A rewind re-simulates the cut log from the latest saved state at or before the target. States
 * are immutable and come from the same `stepSim` calls, so starting from a saved one gives the
 * exact state a replay from tick 0 reaches. One is kept every this many ticks.
 */
export const KEYFRAME_TICKS = 150;

export class HeistSession {
  readonly level: LevelDef;
  readonly seed: number;
  readonly catIds: [string, string];
  readonly mode: 'play' | 'replay';
  prev: SimState;
  cur: SimState;
  /** Every input fed to the sim, one per tick (the recording). */
  readonly inputs: Input[] = [];
  private readonly replayInputs: Input[] | null;
  private acc = 0;
  /** keyframes[k] is the state after k * KEYFRAME_TICKS ticks (keyframes[0] is the initial state). */
  private readonly keyframes: SimState[];
  /** Rewinds done in this run (play mode). */
  rewinds = 0;

  constructor(opts: SessionOptions) {
    this.level = opts.level;
    if (opts.replay) {
      const log = opts.replay;
      if (log.levelId !== opts.level.id) throw new Error(`replay is for ${log.levelId}, not ${opts.level.id}`);
      if (log.simVersion !== SIM_VERSION) throw new Error(`replay sim version ${log.simVersion} != ${SIM_VERSION}`);
      this.seed = log.seed;
      this.catIds = [log.catIds[0], log.catIds[1]];
      this.replayInputs = decodeInputs(log.runs);
      this.mode = 'replay';
    } else {
      this.seed = opts.seed;
      this.catIds = opts.catIds;
      this.replayInputs = null;
      this.mode = 'play';
    }
    this.cur = initSim(this.level, this.seed, this.catIds);
    this.prev = this.cur;
    this.keyframes = [this.cur];
  }

  /** Won, or a replay that ran out of inputs. */
  get done(): boolean {
    return this.cur.won || (this.replayInputs !== null && this.cur.tick >= this.replayInputs.length);
  }

  /** Interpolation factor between prev and cur for rendering, in [0, 1]. */
  get alpha(): number {
    return this.done ? 1 : Math.min(1, this.acc / TICK_S);
  }

  /** Remaining replay ticks (0 in play mode). */
  get replayRemaining(): number {
    return this.replayInputs ? Math.max(0, this.replayInputs.length - this.cur.tick) : 0;
  }

  /** Advance exactly one tick. In replay mode `input` is ignored. Returns false when done. */
  stepOnce(input: Input = NO_INPUT, onTick?: TickListener): boolean {
    if (this.done) return false;
    const inp = this.replayInputs ? (this.replayInputs[this.cur.tick] ?? NO_INPUT) : input;
    this.prev = this.cur;
    this.cur = stepSim(this.level, this.cur, inp);
    this.inputs.push(inp);
    if (this.cur.tick % KEYFRAME_TICKS === 0) this.keyframes[this.cur.tick / KEYFRAME_TICKS] = this.cur;
    onTick?.(this.cur, inp);
    return true;
  }

  /**
   * Rewind (plan G10, decision #72): cut the recorded inputs back to `tick` and re-simulate the cut
   * log, so the run continues as if the cut ticks never happened. The sim is untouched, and the log
   * this session saves afterwards is the cut log plus whatever is played next, which any replay
   * (and the server's `verifyRun`) reproduces from tick 0. Play mode only; returns the tick reached.
   */
  rewindTo(tick: number): number {
    if (this.mode !== 'play') throw new Error('rewind is for play-mode runs');
    if (this.cur.won) return this.cur.tick;
    const target = Math.max(0, Math.min(this.inputs.length, Math.floor(tick)));
    if (target === this.inputs.length) return target;
    this.inputs.length = target;
    const k = Math.floor(target / KEYFRAME_TICKS);
    this.keyframes.length = k + 1;
    let s = this.keyframes[k];
    for (let i = s.tick; i < target; i++) s = stepSim(this.level, s, this.inputs[i]);
    this.prev = s;
    this.cur = s;
    this.acc = 0;
    this.rewinds++;
    return target;
  }

  /**
   * Fixed-timestep advance: accumulate real time, run whole ticks at TICK_HZ. `sample` is called once
   * per tick (so edge-triggered buttons map to exactly one tick). Returns the ticks run.
   */
  advance(dtSeconds: number, sample: () => Input, onTick?: TickListener, speed = 1): number {
    if (this.done) {
      this.acc = 0;
      return 0;
    }
    this.acc += Math.min(MAX_FRAME_DT, Math.max(0, dtSeconds)) * speed;
    const cap = MAX_TICKS_PER_FRAME * Math.max(1, Math.ceil(speed));
    let n = 0;
    while (this.acc >= TICK_S && n < cap && !this.done) {
      this.acc -= TICK_S;
      this.stepOnce(this.replayInputs ? NO_INPUT : sample(), onTick);
      n++;
    }
    if (n >= cap) this.acc = Math.min(this.acc, TICK_S);
    return n;
  }

  /** Drop accumulated time (after a pause, so the sim does not jump). */
  resetClock(): void {
    this.acc = 0;
  }

  /** The run so far as a compact, replayable input log. */
  log(): InputLog {
    return {
      levelId: this.level.id,
      simVersion: SIM_VERSION,
      seed: this.seed,
      catIds: [this.catIds[0], this.catIds[1]],
      ticks: this.inputs.length,
      runs: encodeInputs(this.inputs),
      finalHash: this.cur.hash,
      score: this.cur.score,
      spottedCount: this.cur.spottedCount,
      coins: this.cur.coinsCollected,
    };
  }

  result(): RunResult {
    const s = this.cur;
    return {
      levelId: this.level.id,
      catIds: [this.catIds[0], this.catIds[1]],
      seed: this.seed,
      ticks: s.tick,
      coins: s.coinsCollected,
      rescued: s.rescued,
      rescuedName: this.level.crate.catName,
      spottedCount: s.spottedCount,
      score: s.score,
      hash: s.hash,
    };
  }
}
