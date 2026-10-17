/**
 * One live run: input.sample() → sim.stepSim → audio.onEvents at 30 Hz, renderer.frame + HUD on rAF.
 * Records every TickInput (the replay / clip source) and builds the RunResult when the sim ends.
 */
import {
  NO_INPUT,
  SIM_VERSION,
  STAMP_IDS,
  type AudioEngine,
  type CatSpec,
  type GhostRef,
  type PlayableRoom,
  type Renderer,
  type RunResult,
  type SimApi,
  type SimEvent,
  type SimState,
  type StampId,
  type TickInput,
} from '../types';
import { emojiTimeline, rankFor } from './copy';
import { createGhostLanes, stepGhostLanes, type GhostLane } from './hud/ghosts';
import { hapticFor } from './hud/popups';
import { swatHintFor, type GameInput } from './input/source';
import { createLoop, type Clock, type Loop } from './loop';
import type { Hud, PauseKind } from './screens/Hud';

export interface RunDeps {
  sim: SimApi;
  play: PlayableRoom;
  cat: CatSpec;
  input: GameInput;
  audio: AudioEngine;
  renderer: Renderer | null;
  hud: Hud;
  vibrate(ms: number): void;
  swatTarget?: (s: SimState) => { prop: number; grab: boolean; pull?: 'cloth' | 'cable' };
  onFirstCrash?(tick: number): void;
  /** Every tick's sim events (after audio), e.g. the accomplice's wish being granted. Never throws into the run. */
  onEvents?(events: readonly SimEvent[], s: SimState): void;
  onEnd(r: RunResult): void;
  onRenderError?(err: unknown): void;
  clock?: Clock;
  /** Dare ghosts: replayed in lockstep with the player and drawn translucent (GDD 6.3). */
  ghosts?: readonly GhostRef[];
  /** Freeze-frame before the result screen (ms). */
  freezeMs?: number;
  /** Run intro (GDD 3.1): the cat's close-up eases out to the room, then "GO!". The sim holds at tick 0. */
  intro?: boolean;
  /** Not the player's first session: the intro holds the close-up for INTRO_HOLD_REPEAT_MS only. */
  repeat?: boolean;
}

/** Render-only hitstop on a crash (ms): a break, a Must-Wreck target. */
export const HITSTOP_BREAK_MS = 90;
export const HITSTOP_TARGET_MS = 110;

/** Intro timing (ms): hold the close-up, then ease to the live view. */
export const INTRO_HOLD_MS = 900;
export const INTRO_EASE_MS = 600;
/** Repeat runs hold the close-up shorter (round 3). */
export const INTRO_HOLD_REPEAT_MS = 600;
/** Any stick or key input during the intro skips straight to a quick ease (round 3: input is never dropped). */
export const INTRO_SKIP_EASE_MS = 150;

/**
 * Intro progress (pure; tested). 0..0.6 = the close-up hold, 0.6..1 = the ease to the room (Renderer.setIntro's
 * split). `skipAt` (ms since start, -1 none): input arrived, the hold ends there and a INTRO_SKIP_EASE_MS ease runs.
 */
export function introProgress(elapsed: number, holdMs: number, skipAt = -1): number {
  if (skipAt >= 0 && skipAt < holdMs) {
    if (elapsed < skipAt) return (0.6 * elapsed) / holdMs;
    const from = (0.6 * skipAt) / holdMs;
    const u = Math.min(1, (elapsed - skipAt) / INTRO_SKIP_EASE_MS);
    return from + (1 - from) * u;
  }
  if (elapsed < holdMs) return (0.6 * elapsed) / holdMs;
  return Math.min(1, 0.6 + (0.4 * (elapsed - holdMs)) / INTRO_EASE_MS);
}

/** Builds a RunResult from a finished (or stopped) live state. Pure apart from hashState. */
export function buildResult(sim: SimApi, play: PlayableRoom, s: SimState, inputs: TickInput[], events: SimEvent[]): RunResult {
  const stamp: StampId = STAMP_IDS[s.stamp] ?? (s.caughtTick >= 0 ? 'caught' : 'clean');
  const score = s.ended ? s.finalScore : s.score;
  let hash = 0;
  try {
    hash = sim.hashState(s);
  } catch {
    hash = 0;
  }
  return {
    roomId: play.room.id,
    dayNo: play.dayNo,
    mode: play.mode,
    simVersion: s.rules ?? SIM_VERSION,
    score,
    stamp,
    rank: rankFor(score, stamp === 'caught', play.rankPct ?? 100, play.rankMins),
    maxCombo: s.maxCombo,
    seenCount: s.seenCount,
    targets: s.targetsHit,
    framed: s.framed,
    ticks: s.tick,
    timeline: emojiTimeline(events, s.tick),
    inputs,
    events,
    finalHash: hash >>> 0,
    // v5 stats (same derivation as sim.runToEnd; harmless zeros under rules 4)
    wish: s.wish === 1,
    stashed: s.cat?.stashed ?? 0,
    slides: s.slides ?? 0,
    pulls: s.pulls ?? 0,
    onCamera: s.onCamera ?? 0,
    maxNoise: s.maxNoise ?? 0,
    humans: s.humans?.length ?? 1,
  };
}

/**
 * Strongest haptic of one tick's events (ms, 0 none): light for swat/slide/pull, medium for crashes and being
 * spotted, strong for a topple. One buzz per tick, so a 4-plate stack does not rattle the phone four times.
 */
export function tickHaptic(events: readonly SimEvent[]): number {
  let ms = 0;
  for (const e of events) ms = Math.max(ms, hapticFor(e));
  return ms;
}

export class RunSession {
  readonly s: SimState;
  readonly inputs: TickInput[] = [];
  readonly events: SimEvent[] = [];
  private frameEvents: SimEvent[] = [];
  private loop: Loop;
  private script: readonly TickInput[] | null = null;
  private scriptIdx = 0;
  private firstCrash = false;
  private finished = false;
  private endTimer = 0;
  private pausedKind: PauseKind = null;
  private grabHint = false;
  private swatHint: 'swat' | 'grab' | 'pull' = 'swat';
  private lanes: GhostLane[] = [];
  private introRaf = 0;
  /** Buttons pressed during the intro: they fire on the first sim tick after GO (never dropped). */
  private introButtons = 0;
  private introPlayed = false;
  /** Best crash so far (points) and the tick its frame should be grabbed at (a few ticks after impact). */
  private bestPts = 0;
  private shotAt = -1;
  private shotCount = 0;
  /** Frame of the biggest crash (result card hero), null until one was grabbed. */
  bestFrame: Promise<Blob | null> | null = null;
  private disposed = false;
  /** performance.now() until which the loop holds (hitstop), 0 = none. */
  private holdUntil = 0;

  constructor(private d: RunDeps) {
    this.s = d.sim.initSim(d.play, d.cat);
    // each ghost replays with the rule set it was recorded under (v4 ghosts: replay only, no beat / lose)
    this.lanes = createGhostLanes(d.sim, d.play, d.ghosts, 2);
    try {
      d.renderer?.setGhosts?.(this.lanes.map((l) => l.state));
    } catch {
      /* ghosts are decoration */
    }
    try {
      d.hud.setGhosts?.(this.lanes);
      // the eye floats above the human: read the renderer lazily (it is dropped after a render error)
      d.hud.setProjector?.({
        human: (i) => this.d.renderer?.projectHuman?.(i) ?? null,
        world: (x, z, level) => this.d.renderer?.projectWorld?.(x, z, level) ?? null,
      });
    } catch {
      /* HUD extras are optional */
    }
    this.loop = createLoop(
      {
        tick: () => this.tick(),
        draw: (a) => this.draw(a),
        maxSteps: () => (this.script ? 120 : 8),
        turbo: () => this.script !== null,
        hold: () => this.holdUntil > 0 && (typeof performance !== 'undefined' ? performance.now() : 0) < this.holdUntil,
      },
      d.clock,
    );
  }

  start(): void {
    const r = this.d.renderer;
    if (this.d.intro && r?.setIntro && !this.script && typeof requestAnimationFrame !== 'undefined') {
      this.playIntro(r);
      return;
    }
    this.go();
  }

  private go(): void {
    if (this.disposed) return;
    // After an intro the input has been live (and buffered) all along: a key or thumb held since then keeps going.
    if (!this.introPlayed) this.d.input.reset();
    this.d.input.setEnabled(true);
    try {
      this.d.audio.stinger('go');
    } catch {
      /* silent */
    }
    this.d.hud.showGo?.();
    this.loop.start();
  }

  /** Render-only intro; the sim stays at tick 0 until "GO!". */
  private playIntro(r: Renderer): void {
    let t0 = performance.now();
    let pausedAt = -1;
    let skipAt = -1;
    const holdMs = this.d.repeat ? INTRO_HOLD_REPEAT_MS : INTRO_HOLD_MS;
    this.introPlayed = true;
    // round 3: input is live from the start of the intro and buffered while the sim waits at tick 0
    this.d.input.reset();
    this.d.input.setEnabled(true);
    const step = (): void => {
      if (this.disposed) return;
      if (this.pausedKind) {
        if (pausedAt < 0) pausedAt = performance.now();
        this.introRaf = requestAnimationFrame(step);
        return;
      }
      if (pausedAt >= 0) {
        t0 += performance.now() - pausedAt;
        pausedAt = -1;
      }
      const elapsed = performance.now() - t0;
      const inp = this.d.input.sample();
      this.introButtons |= inp.buttons;
      if (skipAt < 0 && (inp.dir !== 0 || inp.buttons !== 0)) skipAt = elapsed;
      const p = introProgress(elapsed, holdMs, skipAt);
      try {
        r.setIntro?.(p);
        r.frame(this.s, 0, []);
      } catch {
        /* the intro is decoration */
      }
      if (p < 1) this.introRaf = requestAnimationFrame(step);
      else {
        try {
          r.setIntro?.(null);
        } catch {
          /* ignore */
        }
        this.go();
      }
    };
    this.d.hud.update(this.s, []);
    this.introRaf = requestAnimationFrame(step);
  }

  /** QA: feed scripted inputs instead of the live controls, as fast as possible. */
  setScript(inputs: readonly TickInput[]): void {
    this.script = inputs;
    this.scriptIdx = 0;
  }

  /** Live ghost race lanes (state, rule set, replay-only flag). */
  get ghostLanes(): readonly GhostLane[] {
    return this.lanes;
  }

  get paused(): PauseKind {
    return this.pausedKind;
  }

  pause(kind: Exclude<PauseKind, null>): void {
    if (this.finished) return;
    if (this.pausedKind === 'context' && kind !== 'context') return;
    this.pausedKind = kind;
    this.loop.setPaused(true);
    this.d.input.setEnabled(false);
    this.d.hud.setPaused(kind);
  }

  resume(): void {
    if (!this.pausedKind || this.finished) return;
    this.pausedKind = null;
    this.d.hud.setPaused(null);
    this.d.input.reset();
    this.d.input.setEnabled(true);
    this.loop.setPaused(false);
  }

  dispose(): void {
    this.disposed = true;
    if (this.introRaf) cancelAnimationFrame(this.introRaf);
    try {
      this.d.renderer?.setIntro?.(null);
    } catch {
      /* ignore */
    }
    clearTimeout(this.endTimer);
    this.loop.stop();
    this.d.input.setEnabled(false);
    this.d.input.setGrabHint(false);
    this.d.input.setSwatHint?.('swat');
  }

  private tick(): boolean {
    const s = this.s;
    if (s.ended) return false;
    const raw = this.script ? this.script[this.scriptIdx++] ?? NO_INPUT : this.d.input.sample();
    const inp: TickInput = { dir: raw.dir, speed: raw.speed, buttons: raw.buttons | this.introButtons };
    this.introButtons = 0;
    this.inputs.push(inp);
    const ev: SimEvent[] = [];
    this.d.sim.stepSim(s, this.d.play, inp, ev);
    stepGhostLanes(this.d.sim, this.d.play, this.lanes);
    if (ev.length) {
      const buzz = tickHaptic(ev);
      if (buzz > 0) this.d.vibrate(buzz);
      for (const e of ev) {
        this.events.push(e);
        this.frameEvents.push(e);
        if (e.t === 'break' && e.points > this.bestPts && !this.script && this.shotCount < 4) {
          this.bestPts = e.points;
          this.shotAt = e.tick + 6;
        }
        // hitstop: the frame freezes on the impact (longer for a Must-Wreck or a toppled tree), then the run resumes
        if (!this.script && (e.t === 'break' || e.t === 'spill' || e.t === 'target' || e.t === 'topple') && typeof performance !== 'undefined') {
          const until = performance.now() + (e.t === 'target' || e.t === 'topple' ? HITSTOP_TARGET_MS : HITSTOP_BREAK_MS);
          if (until > this.holdUntil) this.holdUntil = until;
        }
        if (!this.firstCrash && (e.t === 'break' || e.t === 'land' || e.t === 'spill')) {
          this.firstCrash = true;
          this.d.onFirstCrash?.(e.tick);
        }
      }
    }
    try {
      this.d.audio.onEvents(ev, s);
    } catch {
      /* audio never breaks a run */
    }
    if (ev.length && this.d.onEvents) {
      try {
        this.d.onEvents(ev, s);
      } catch {
        /* listeners never break a run */
      }
    }
    if (this.d.swatTarget) {
      const carrying = s.cat.carrying >= 0;
      // While the FTUE says "tap SWAT" the button must read SWAT, even next to a sock.
      const swatLesson = !carrying && this.d.hud.promptId?.() === 2;
      let target: { grab: boolean; pull?: 'cloth' | 'cable' } | null = null;
      if (!carrying && !swatLesson) {
        try {
          target = this.d.swatTarget(s);
        } catch {
          target = null;
        }
      }
      const hint = swatHintFor(target, carrying, swatLesson);
      const g = hint === 'grab';
      if (g !== this.grabHint) {
        this.grabHint = g;
        this.d.input.setGrabHint(g);
      }
      if (hint !== this.swatHint) {
        this.swatHint = hint;
        this.d.input.setSwatHint?.(hint);
      }
    }
    if (s.ended) {
      this.finish();
      return false;
    }
    return true;
  }

  private draw(alpha: number): void {
    const evs = this.frameEvents;
    this.frameEvents = [];
    this.d.hud.update(this.s, evs);
    const r = this.d.renderer;
    if (!r) return;
    try {
      r.frame(this.s, alpha, evs);
      if (this.shotAt >= 0 && this.s.tick >= this.shotAt && r.snapshotBlob) {
        this.shotAt = -1;
        this.shotCount++;
        const prev = this.bestFrame;
        this.bestFrame = r.snapshotBlob('image/jpeg', 0.85).then((b) => b ?? prev ?? null).catch(() => null);
      }
    } catch (err) {
      this.d.renderer = null;
      this.d.onRenderError?.(err);
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.d.input.setEnabled(false);
    const result = buildResult(this.d.sim, this.d.play, this.s, this.inputs, this.events);
    const ms = this.script ? 0 : this.d.freezeMs ?? 900;
    this.endTimer = window.setTimeout(() => this.d.onEnd(result), ms);
  }
}
