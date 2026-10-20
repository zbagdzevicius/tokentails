/**
 * L-AUDIO: Moon Rave tune: original, synthesized. Back on Track mix by ModeGospel: licensed by the
 * founder, streamed from music/back-on-track-v1. The BeatClock every module syncs to. SPEC.md "Audio".
 *
 * Timing model: the visual clock is the performance clock (smooth, never stalls, works before unlock,
 * while muted and in tests). The synth maps that clock onto AudioContext time with a measured offset
 * (getOutputTimestamp, so output latency such as Bluetooth is compensated) and schedules 16ths a
 * little ahead. Both read the same Timeline, so build/drop changes land on the same bar for ears and
 * eyes.
 *
 * Two tracks (SPEC.md 8.1). The clock runs in epochs: a synth epoch counts beats at 136 BPM from a
 * clock time; a mix epoch maps clock time to a virtual track time and reads beats, bars and sections
 * from the mix's own beat map (never time-stretched). While the mix is audible the audio is master:
 * the epoch is nudged so the virtual playhead matches what is heard. Swaps land on a bar line and
 * `beat` / `bar` never run backwards. In the mix, hold / double tap / a new cat are visual only.
 */
import { BPM } from '../config';
import type { BeatClock, BeatEvent, BeatEventPayload, BeatInfo } from '../types';
import { MixPlan, MixTempo, type MixManifest, type TrackId } from './beatmap';
import { createMixLoader, MixPlayer, type MixLoader } from './mix';
import { Synth } from './synth';
import { Timeline, energyAt, hatOn, kickOn, type BarPos, type DropCause } from './timeline';

export { Timeline, kickOn, hatOn, energyAt, LOOP_BARS, sectionStart } from './timeline';
export type { TrackId } from './beatmap';

export type TrackState = 'idle' | 'loading' | 'ready' | 'error';

/** What the clock needs from a mix player (MixPlayer; tests may inject a fake). */
export interface MixPlayerLike {
  readonly anchor: number | null;
  onError: (err: Error) => void;
  start(when: number, trackSec: number): Promise<void>;
  stop(fadeSec?: number, when?: number): void;
  fade(to: number, sec: number): void;
  pump(now: number): void;
  preload?(i: number): Promise<unknown>;
  segmentAt?(sec: number): number;
  /** Drop decoded segments (back on the synth; they re-decode from the HTTP cache). */
  release?(): void;
  dispose(): void;
}

export interface BeatClockOptions {
  muted: boolean;
  /** Seconds source (tests pass a fake). Defaults to performance.now() / 1000. */
  now?: () => number;
  /** Track to start on (default 'synth'). 'mix' still needs `setTrack('mix')` (main calls it). */
  track?: TrackId;
  /** Manifest / beat map / segment source (tests inject a fake). */
  mixLoader?: MixLoader;
  /** Builds the audible player once an AudioContext exists (default MixPlayer). */
  playerFactory?: (ctx: AudioContext, manifest: MixManifest, loader: MixLoader) => MixPlayerLike;
}

/** BeatClock plus a few sound effects for L-UI / L-DJ. All are no-ops while silent. */
export interface RaveClock extends BeatClock {
  /** Tap on the floor: an open hat and a tiny chirp (rate limited). */
  tap(): void;
  /** A one-off meow, `midi` default 81. */
  meow(midi?: number): void;
  /** A crowd cheer, `size` 0.5..1.5. */
  cheer(size?: number): void;
  /** The track playing now (it changes on the swap bar, with the 'track' event). */
  readonly track: TrackId;
  /** The track it is heading for: an armed swap's track, else `track`. Toggles choose from this. */
  readonly targetTrack: TrackId;
  readonly trackState: TrackState;
  /** "Back on Track (mix) by ModeGospel" once the mix manifest has loaded. */
  readonly credit: string | null;
  /**
   * Switch tracks on the next bar line. Resolves true once the swap is armed ('track' fires when it
   * lands), false if the mix could not load (the synth keeps playing, trackState 'error').
   */
  setTrack(id: TrackId): Promise<boolean>;
}

const LOOKAHEAD = 0.12;
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const PUMP_MS = 25;
const SPB = 60 / BPM;
const STEP = SPB / 4;
/** A swap or a viewer change never lands closer than this to now (seconds). */
const SWAP_MARGIN = 0.15;
const LOAD_TIMEOUT_MS = 15_000;
/** Audio vs virtual playhead disagreement that re-bases the mix epoch (seconds). */
const DRIFT = 0.03;
/** Bigger disagreements (an interrupted or stalled context) re-seek the audio instead. */
const SEEK_DRIFT = 0.5;
/** Visual-only builds and drops in the mix last this many bars. */
const OVERRIDE_BARS = 8;
/** "No more synth steps" while the mix plays. */
const NO_STEP = Number.MAX_SAFE_INTEGER;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type SessionNavigator = Navigator & { audioSession?: { type: string } };

type SynthEpoch = { kind: 'synth'; clockStart: number; beatStart: number };
type MixEpoch = { kind: 'mix'; clockStart: number; trackStart: number; barBase: number };
type Epoch = SynthEpoch | MixEpoch;
/** A swap armed for clock time `at`. */
interface Pending {
  at: number;
  epoch: Epoch;
  track: TrackId;
  error: boolean;
}
/** Visual-only section in the mix (global bars, `until` exclusive). */
interface Override {
  from: number;
  until: number;
  section: 'build' | 'drop';
  cause: DropCause;
}

function supersawVoices(): number {
  if (typeof navigator === 'undefined') return 5;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) return 3;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 5 : 7;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function createBeatClock(opts: BeatClockOptions): RaveClock {
  const clockNow = opts.now ?? (() => performance.now() / 1000);
  const usesPerf = !opts.now;
  const t0 = clockNow();
  const tl = new Timeline({ shortFirstPass: true });
  const listeners = new Map<BeatEvent, Set<(p: BeatEventPayload) => void>>();

  let muted = opts.muted;
  let held = false;
  let disposed = false;
  let unlocked = false;
  let ctx: AudioContext | null = null;
  let synth: Synth | null = null;
  /** AudioContext time minus clock time, as heard (includes output latency). */
  let offset = 0;
  /** Next 16th to schedule; -1 while not scheduling. */
  let nextStep = -1;
  /** The synth schedules no step at or after this one (set when the mix takes over). */
  let stopStep = Infinity;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastBeat = -1;
  let lastKey: string | null = null;
  let lastChirp = 0;

  // ---- tracks ----
  let epoch: Epoch = { kind: 'synth', clockStart: t0, beatStart: 0 };
  let pending: Pending | null = null;
  let track: TrackId = 'synth';
  let trackState: TrackState = 'idle';
  /** 'track' events waiting for the next tick. */
  const trackEvents: { track: TrackId; error: boolean }[] = [];
  /** Set by the first swap: from then on `beat` is guarded to never run backwards. */
  let switched = false;
  let lastBeatOut = -Infinity;
  let loader: MixLoader | null = opts.mixLoader ?? null;
  let manifest: MixManifest | null = null;
  let tempo: MixTempo | null = null;
  let plan: MixPlan | null = null;
  let player: MixPlayerLike | null = null;
  let loadingTrack: Promise<boolean> | null = null;
  let overrides: Override[] = [];
  /** The last tick's section came from a visual override (its end resumes the plan mid-section). */
  let lastFromOverride = false;
  let muteTimer: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------------------------------
  // Epochs
  // -------------------------------------------------------------------------------------------

  /** Virtual track seconds of a mix epoch at clock time `c` (not wrapped). */
  const rawTrackSec = (e: MixEpoch, c: number) => e.trackStart + (c - e.clockStart);
  /** Mix beat number (global) for track time `sec` in epoch `e`. */
  const mixBeat = (e: MixEpoch, sec: number) => 4 * e.barBase + tempo!.beatAt(sec);
  const barBaseFor = (bar: number, trackStart: number) => bar - Math.floor(tempo!.beatAt(trackStart) / 4);
  /** Track time the mix is entered at: its first downbeat (mix bar 0), so the swap lands on a bar line. */
  const mixEntry = () => Math.max(0, tempo!.barStart(0));

  /** Promote an armed swap whose time has come; wrap the mix at its end. */
  const sync = () => {
    const c = clockNow();
    if (pending && c >= pending.at) {
      const p = pending;
      pending = null;
      epoch = p.epoch;
      switched = true;
      if (p.track !== track) {
        track = p.track;
        if (track === 'synth') {
          overrides = [];
          player?.stop(0.05);
          player?.release?.();
        }
        trackEvents.push({ track, error: p.error });
      }
    }
    if (epoch.kind === 'mix' && manifest && rawTrackSec(epoch, c) >= manifest.duration) {
      // Loop: bar numbers keep counting up, track time starts again from 0.
      const e = epoch;
      const wrapAt = e.clockStart + (manifest.duration - e.trackStart);
      const lastBar = Math.floor(mixBeat(e, manifest.duration) / 4);
      epoch = { kind: 'mix', clockStart: wrapAt, trackStart: 0, barBase: barBaseFor(lastBar + 1, 0) };
      overrides = [];
    }
  };

  /** Current track seconds (mix epoch only), wrapped into the track. */
  const trackSecNow = (): number => {
    if (epoch.kind !== 'mix' || !manifest) return 0;
    const d = manifest.duration;
    const t = rawTrackSec(epoch, clockNow());
    return ((t % d) + d) % d;
  };

  const rawBeat = (): number => {
    if (epoch.kind === 'synth') return Math.max(0, (clockNow() - epoch.clockStart) / SPB + epoch.beatStart);
    return mixBeat(epoch, trackSecNow());
  };
  const beatNow = () => {
    sync();
    const b = rawBeat();
    if (!switched) return b;
    lastBeatOut = Math.max(lastBeatOut, b);
    return lastBeatOut;
  };
  const curBar = () => Math.floor(beatNow() / 4);

  /** Clock time a global bar starts at, in the epoch now in force. */
  const clockOfBar = (bar: number): number => {
    if (epoch.kind === 'synth') return epoch.clockStart + (4 * bar - epoch.beatStart) * SPB;
    return epoch.clockStart + (tempo!.barStart(bar - epoch.barBase) - epoch.trackStart);
  };

  /** First bar nothing has been scheduled for yet: the earliest bar a change may land on. */
  const horizonBar = () => {
    if (epoch.kind === 'synth') {
      const cur = Math.floor(beatNow() * 4) + 1;
      return Math.ceil(Math.max(cur, Math.min(nextStep, stopStep)) / 16);
    }
    // Mix: nothing is scheduled per bar, the first bar starting at least SWAP_MARGIN from now, and
    // late enough that a synth step on it is still ahead of the context once output latency counts.
    const c = clockNow();
    const latency = ctx && unlocked && ctx.state === 'running' ? ctx.currentTime - offset - c : 0;
    const soon = c + Math.max(SWAP_MARGIN, latency + LOOKAHEAD);
    let bar = curBar() + 1;
    while (clockOfBar(bar) < soon) bar++;
    return bar;
  };

  const overrideAt = (bar: number) => (epoch.kind === 'mix' && plan ? overrides.find((x) => bar >= x.from && bar < x.until) : undefined);

  /** First global bar in (from, to) where the mix's own build or drop starts, else `to`. */
  const nextRealSection = (from: number, to: number): number => {
    if (epoch.kind !== 'mix' || !plan) return to;
    const base = epoch.barBase;
    for (let b = from + 1; b < to; b++) {
      const p = plan.at(b - base);
      if (p.startBar === b - base && (p.section === 'build' || p.section === 'drop')) return b;
    }
    return to;
  };

  /** Section plan at a global bar, in either track. */
  const posAt = (bar: number): BarPos => {
    if (epoch.kind === 'synth' || !plan) return tl.at(bar);
    const base = epoch.barBase;
    const p = plan.at(bar - base);
    const o = overrideAt(bar);
    if (o) return { bar, section: o.section, startBar: o.from, sectionBar: bar - o.from, bars: o.until - o.from, cause: o.cause, loop: p.loop };
    return { ...p, bar, startBar: p.startBar + base };
  };

  /** Viewer change from `bar` on: the synth's timeline, or a visual-only override in the mix. */
  const jumpTo = (bar: number, section: 'build' | 'drop', cause: DropCause) => {
    if (epoch.kind === 'synth') {
      tl.jumpTo(bar, section, cause);
      return;
    }
    overrides = overrides.filter((o) => o.from < bar).map((o) => (o.until > bar ? { ...o, until: bar } : o));
    // Never past the mix's own next build or drop: the beat map's section takes over on its bar.
    const real = nextRealSection(bar, bar + (section === 'build' ? 2 : 1) * OVERRIDE_BARS);
    overrides.push({ from: bar, until: Math.min(real, bar + OVERRIDE_BARS), section, cause });
    // A held build runs into its drop like the synth's does.
    if (section === 'build' && real > bar + OVERRIDE_BARS) overrides.push({ from: bar + OVERRIDE_BARS, until: real, section: 'drop', cause: 'arrangement' });
  };

  const info = (): BeatInfo => {
    const beat = beatNow();
    const whole = Math.floor(beat);
    const phase = beat - whole;
    const bar = Math.floor(whole / 4);
    const beatInBar = ((whole % 4) + 4) % 4;
    const pos = posAt(bar);
    const progress = Math.min(1, Math.max(0, (beat / 4 - pos.startBar) / pos.bars));
    const offPhase = phase >= 0.5 ? phase - 0.5 : phase + 0.5;
    if (epoch.kind === 'mix' && plan && tempo) {
      const t = trackSecNow();
      const e = plan.energyAt(t);
      const kicking = plan.kickAt(t) && !plan.beatless(t);
      return {
        bpm: tempo.bpmAt(t),
        beat,
        bar,
        beatInBar,
        phase,
        section: pos.section,
        sectionProgress: progress,
        energy: clamp01(0.5 * e + 0.5 * energyAt(pos, progress, held)),
        loop: pos.loop,
        kick: kicking ? (0.85 + 0.15 * e) * Math.exp(-phase * 6) : 0,
        hat: kicking && phase >= 0.5 ? Math.exp(-offPhase * 10) * 0.8 : 0,
        held,
      };
    }
    const k = kickOn(pos, beatInBar, held);
    const h = hatOn(pos);
    return {
      bpm: BPM,
      beat,
      bar,
      beatInBar,
      phase,
      section: pos.section,
      sectionProgress: progress,
      energy: energyAt(pos, progress, held),
      loop: pos.loop,
      kick: k > 0 ? Math.min(1, k + 0.15) * Math.exp(-phase * 6) : 0,
      hat: h > 0 && phase >= 0.5 ? Math.exp(-offPhase * 10) : 0,
      held,
    };
  };

  const emit = (event: BeatEvent, payload: BeatEventPayload) => {
    listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('[cat-rave] beat listener failed', err);
      }
    });
  };

  // -------------------------------------------------------------------------------------------
  // Audio side
  // -------------------------------------------------------------------------------------------

  const measureOffset = (): number => {
    const c = ctx!;
    const fallback = () => c.currentTime - clockNow() - Math.min(0.5, c.outputLatency || c.baseLatency || 0);
    if (!usesPerf || typeof c.getOutputTimestamp !== 'function') return fallback();
    const ts = c.getOutputTimestamp();
    if (!ts.contextTime || !ts.performanceTime) return fallback();
    const off = ts.contextTime - ts.performanceTime / 1000;
    // Sanity: the implied output latency must be 0..0.5 s.
    const latency = c.currentTime - clockNow() - off;
    return latency > -0.02 && latency < 0.5 ? off : fallback();
  };

  /** The synth epoch that schedules step `s` (the armed one once the swap back is due), or null. */
  const synthEpochFor = (s: number): SynthEpoch | null => {
    const pe = pending?.epoch;
    if (pe?.kind === 'synth' && s >= pe.beatStart * 4) return pe;
    return epoch.kind === 'synth' ? epoch : null;
  };
  const stepClock = (e: SynthEpoch, s: number) => e.clockStart + (s - e.beatStart * 4) * STEP;
  const stepAtClock = (e: SynthEpoch, c: number) => Math.floor((c - e.clockStart) / STEP + e.beatStart * 4) + 1;

  const resync = () => {
    if (!ctx) return;
    offset = measureOffset();
    sync();
    const c = ctx.currentTime - offset;
    if (epoch.kind === 'synth') nextStep = stepAtClock(epoch, c);
    else if (pending?.epoch.kind === 'synth') nextStep = (pending.epoch as SynthEpoch).beatStart * 4;
    else nextStep = NO_STEP;
  };

  /** The mix should be sounding now. */
  const mixAudible = () => track === 'mix' && epoch.kind === 'mix' && !!player && !muted && unlocked && ctx?.state === 'running';

  /** Start the mix player at the virtual playhead, a little ahead (unmute, resume, unlock). */
  const startMixAt = (whenCtx: number) => {
    if (!ctx || !player || epoch.kind !== 'mix' || !manifest) return;
    const e = epoch;
    const d = manifest.duration;
    const t = rawTrackSec(e, whenCtx - offset);
    void player.start(whenCtx, ((t % d) + d) % d);
  };

  /** Mix audible but its player stopped (resume after an interruption, unmute): seek it back in. */
  const ensureMixPlaying = () => {
    if (!ctx || track !== 'mix' || pending?.track === 'synth' || !ensurePlayer()) return;
    if (player!.anchor === null) startMixAt(ctx.currentTime + 0.1);
    else player!.fade(1, 0.25); // a mute undone inside its 150 ms window left the gain at 0
  };

  const ensurePlayer = (): MixPlayerLike | null => {
    if (player || !ctx || !manifest || !loader) return player;
    try {
      player = opts.playerFactory ? opts.playerFactory(ctx, manifest, loader) : new MixPlayer(ctx, manifest, loader);
      player.onError = (err) => {
        console.warn('[cat-rave] mix stopped loading; back to the synth', err);
        void switchToSynth(true);
      };
    } catch (err) {
      console.error('[cat-rave] mix player failed', err);
      player = null;
    }
    return player;
  };

  const pump = () => {
    const c = ctx;
    const s = synth;
    if (!c || !s || muted || nextStep < 0 || c.state !== 'running') return;
    const meas = measureOffset();
    if (Math.abs(meas - offset) > 0.04) offset = meas;
    else offset += (meas - offset) * 0.05;

    const now = c.currentTime;
    sync();
    if (mixAudible() && epoch.kind === 'mix' && manifest) {
      player!.pump(now);
      const anchor = player!.anchor;
      if (anchor !== null && now >= anchor) {
        // Audio is master: re-base the virtual playhead on what is heard.
        const d = manifest.duration;
        const clk = now - offset;
        const heard = now - anchor; // track position sounding at clock time clk
        let diff = (rawTrackSec(epoch, clk) - heard) % d;
        if (diff > d / 2) diff -= d;
        if (diff < -d / 2) diff += d;
        // Small drift: nudge the virtual playhead to the audio. A big gap means the context stalled
        // (iOS interruption) while the clock ran on: the virtual position wins and the audio re-seeks.
        if (Math.abs(diff) > SEEK_DRIFT) startMixAt(now + 0.1);
        else if (Math.abs(diff) > DRIFT) epoch = { ...epoch, clockStart: epoch.clockStart + diff };
      }
    }

    const horizon = now + LOOKAHEAD;
    const se = synthEpochFor(nextStep);
    // Fell far behind (tab throttled, context hiccup): skip ahead instead of a burst of notes.
    if (se && epoch.kind === 'synth' && stepClock(se, nextStep) + offset < now - 0.25) nextStep = stepAtClock(epoch, now - offset);
    for (let guard = 0; guard < 64; guard++) {
      if (nextStep >= stopStep) break;
      const e = synthEpochFor(nextStep);
      if (!e) break;
      const at = stepClock(e, nextStep) + offset;
      if (at >= horizon) break;
      if (at >= now - 0.005) {
        const bar = Math.floor(nextStep / 16);
        try {
          s.step({
            t: Math.max(at, now),
            s16: nextStep % 16,
            pos: tl.at(bar),
            next: tl.at(bar + 1),
            held,
            stepDur: STEP,
          });
        } catch (err) {
          console.error('[cat-rave] synth step failed', err);
        }
      }
      nextStep++;
    }
  };

  const startScheduling = () => {
    if (!ctx || !synth) return;
    resync();
    synth.fade(1, 0.25);
    if (!timer) timer = setInterval(pump, PUMP_MS);
    // Resume paths can run this twice in a row (unmute + onstatechange): start the mix once.
    if (track === 'mix') ensureMixPlaying();
    else if (pending?.track === 'mix' && pending.epoch.kind === 'mix' && ensurePlayer() && player!.anchor === null) void player!.start(pending.at + offset, pending.epoch.trackStart);
    pump();
  };

  const stopScheduling = () => {
    nextStep = -1;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const resumeAudio = async () => {
    if (!ctx || muted || disposed) return;
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      return;
    }
    if (ctx.state === 'running' && !muted) startScheduling();
  };

  const onVisibility = () => {
    if (!ctx || !unlocked) return;
    if (document.hidden) {
      stopScheduling();
      player?.stop(0);
      void ctx.suspend().catch(() => {});
    } else if (!muted) void resumeAudio();
  };

  // iOS can "interrupt" the context (calls, Siri, lock screen); any later gesture brings it back.
  // It also retries a first unlock that failed: WebKit ignores a drag or pinch as a user gesture,
  // so the context can still be suspended after the first touch.
  let retry: (() => void) | null = null;
  const onGesture = () => {
    if (!ctx || muted || document.hidden) return;
    if (!unlocked) retry?.();
    else if (ctx.state !== 'running') void resumeAudio();
  };

  const play = (fn: (s: Synth, t: number) => void) => {
    if (!ctx || !synth || muted || ctx.state !== 'running') return;
    try {
      fn(synth, ctx.currentTime + 0.01);
    } catch (err) {
      console.error('[cat-rave] sfx failed', err);
    }
  };

  // -------------------------------------------------------------------------------------------
  // Track swaps
  // -------------------------------------------------------------------------------------------

  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('mix load timed out')), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

  const switchToMix = async (): Promise<boolean> => {
    trackState = 'loading';
    try {
      loader ??= createMixLoader();
      await withTimeout(
        (async () => {
          const data = await loader!.load();
          manifest = data.manifest;
          tempo = new MixTempo(data.map);
          plan = new MixPlan(data.map);
          // Audible: have the first segment decoded before arming, so the swap bar has sound.
          if (unlocked && !muted && ctx?.state === 'running' && ensurePlayer()?.preload) await player!.preload!(0);
        })(),
        LOAD_TIMEOUT_MS,
      );
    } catch (err) {
      console.warn('[cat-rave] could not load the mix', err);
      trackState = 'error';
      return false;
    }
    if (disposed) return false;
    sync();
    if (epoch.kind !== 'synth') return true; // already swapped meanwhile
    let bar = horizonBar();
    if (clockOfBar(bar) - clockNow() < SWAP_MARGIN) bar++;
    const at = clockOfBar(bar);
    stopStep = 16 * bar;
    const entry = mixEntry();
    pending = { at, epoch: { kind: 'mix', clockStart: at, trackStart: entry, barBase: barBaseFor(bar, entry) }, track: 'mix', error: false };
    overrides = [];
    held = false;
    trackState = 'ready';
    if (ctx && unlocked && !muted && ctx.state === 'running' && ensurePlayer()) void player!.start(at + offset, entry);
    return true;
  };

  /** Back to the mix while the swap to the synth is still armed: disarm it, the mix plays on. */
  const cancelSynthSwap = () => {
    const p = pending;
    if (p?.epoch.kind !== 'synth') return;
    // The synth's first 16ths of the swap bar are already on the context: too late, let it land.
    if (nextStep > p.epoch.beatStart * 4) return;
    pending = null;
    stopStep = p.epoch.beatStart * 4;
    if (nextStep >= 0) nextStep = NO_STEP;
    trackState = 'ready';
    // switchToSynth told the player to stop on the swap bar: seek it back in at the virtual playhead.
    if (ctx && unlocked && !muted && ctx.state === 'running' && player) startMixAt(ctx.currentTime + 0.1);
  };

  const switchToSynth = async (error = false): Promise<boolean> => {
    sync();
    if (pending?.track === 'mix') {
      // Not swapped yet: just disarm.
      pending = null;
      stopStep = Infinity;
      player?.stop(0);
      if (error) {
        trackState = 'error';
        trackEvents.push({ track: 'synth', error: true });
      }
      return true;
    }
    if (epoch.kind !== 'mix') return true;
    const bar = horizonBar();
    const at = clockOfBar(bar);
    pending = { at, epoch: { kind: 'synth', clockStart: at, beatStart: 4 * bar }, track: 'synth', error };
    tl.jumpTo(bar, 'groove', 'arrangement');
    stopStep = Infinity;
    if (nextStep >= 0) nextStep = 16 * bar;
    trackState = error ? 'error' : 'ready';
    held = false;
    if (player && ctx) player.stop(0.05, at + offset);
    return true;
  };

  // -------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------

  const api: RaveClock = {
    get bpm() {
      sync();
      return epoch.kind === 'mix' && tempo ? tempo.bpmAt(trackSecNow()) : BPM;
    },
    now: info,

    get track() {
      sync();
      return track;
    },
    get targetTrack() {
      sync();
      return pending?.track ?? track;
    },
    get trackState() {
      return trackState;
    },
    get credit() {
      return manifest?.credit ?? null;
    },

    setTrack(id) {
      if (disposed) return Promise.resolve(false);
      sync();
      if (id === 'mix') {
        if (pending?.track === 'synth') {
          cancelSynthSwap();
          return Promise.resolve(true);
        }
        if (track === 'mix' || pending?.track === 'mix') return Promise.resolve(true);
        if (loadingTrack) return loadingTrack;
        loadingTrack = switchToMix().finally(() => (loadingTrack = null));
        return loadingTrack;
      }
      if (track === 'synth' && pending?.track !== 'mix') return Promise.resolve(true);
      if (pending?.track === 'synth') return Promise.resolve(true);
      return switchToSynth();
    },

    on(event, cb) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },

    async unlock() {
      if (disposed || typeof window === 'undefined') return false;
      if (!ctx) {
        const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
        if (!AC) return false;
        try {
          // Let the page play through the iPhone silent switch, like a music app.
          const nav = navigator as SessionNavigator;
          if (nav.audioSession) nav.audioSession.type = 'playback';
        } catch {
          /* optional API */
        }
        try {
          ctx = new AC({ latencyHint: 'interactive' });
          synth = new Synth(ctx, { voices: supersawVoices(), bpm: BPM });
        } catch (err) {
          console.error('[cat-rave] audio init failed', err);
          ctx = null;
          synth = null;
          return false;
        }
        ctx.onstatechange = () => {
          if (!ctx || muted) return;
          if (ctx.state !== 'running') {
            // Interrupted (iOS call, Siri) or suspended: the mix carries on virtually, and coming
            // back re-seeks it to the virtual playhead instead of resuming where the audio paused.
            if (unlocked) player?.stop(0);
            return;
          }
          if (document.hidden) return;
          if (nextStep < 0) startScheduling();
          else if (unlocked) ensureMixPlaying();
        };
        document.addEventListener('visibilitychange', onVisibility);
        // pointerup / touchend / click count as user activation on iOS; pointerdown alone does not.
        for (const ev of GESTURE_EVENTS) window.addEventListener(ev, onGesture, { passive: true });
      }
      // iOS unlock: start a silent buffer and resume inside the same gesture, before any await.
      try {
        const b = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* ignore */
      }
      const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
      try {
        await resumed;
      } catch {
        /* reported below via state */
      }
      if (disposed || !ctx) return false;
      if ((ctx.state as string) !== 'running') return false;
      unlocked = true;
      if (muted) {
        stopScheduling();
        void ctx.suspend().catch(() => {});
      } else if (nextStep < 0) startScheduling();
      return true;
    },

    get unlocked() {
      return unlocked;
    },

    setMuted(m) {
      if (m === muted) return;
      muted = m;
      if (!ctx || !synth || !unlocked) return;
      if (muteTimer) {
        clearTimeout(muteTimer);
        muteTimer = null;
      }
      if (m) {
        synth.fade(0, 0.06);
        const p = player;
        p?.fade(0, 0.06);
        stopScheduling();
        const c = ctx;
        muteTimer = setTimeout(() => {
          muteTimer = null;
          if (!muted) return;
          p?.stop(0); // the mix carries on virtually; unmute re-seeks to it
          if (c.state === 'running') void c.suspend().catch(() => {});
        }, 150);
      } else void resumeAudio(); // startScheduling fades a still-running mix back up
    },

    get muted() {
      return muted;
    },

    beginBuild() {
      if (held) return;
      held = true;
      const nb = horizonBar();
      if (posAt(nb).section === 'build') return; // already building (or about to)
      jumpTo(nb, 'build', 'viewer');
    },

    endBuild() {
      if (!held) return;
      held = false;
      const nb = horizonBar();
      const nxt = posAt(nb);
      if (nxt.section !== 'build') return; // the build already ran out into its drop
      // Released before the build even started: still give it one bar of tension.
      const dropBar = nxt.sectionBar === 0 ? nb + 1 : nb;
      jumpTo(dropBar, 'drop', 'viewer');
    },

    queueDrop(cause: Exclude<DropCause, 'arrangement'>) {
      const cur = posAt(curBar());
      if (cur.section === 'drop' && cur.sectionBar < 2) return;
      const nb = horizonBar();
      const nxt = posAt(nb);
      held = false;
      if (nxt.section === 'drop' && nxt.sectionBar === 0) {
        if (cause === 'new-cat' && nxt.cause !== 'new-cat') jumpTo(nb, 'drop', cause);
        return;
      }
      jumpTo(nb, 'drop', cause);
    },

    tick() {
      if (disposed) return;
      const beat = info();
      while (trackEvents.length) {
        const ev = trackEvents.shift()!;
        emit('track', { beat, track: ev.track, ...(ev.error ? { trackState: 'error' as const } : {}) });
      }
      const whole = Math.floor(beat.beat);
      if (whole !== lastBeat) {
        lastBeat = whole;
        emit('beat', { beat });
        if (beat.beatInBar === 0) emit('bar', { beat });
      }
      const pos = posAt(beat.bar);
      const key = `${pos.startBar}:${pos.section}`;
      const fromOverride = !!overrideAt(beat.bar);
      if (key !== lastKey) {
        const first = lastKey === null;
        // A visual override ending inside a mix section that began earlier: say 'section', but the
        // build or drop itself already happened (or was replaced), so do not fire it late.
        const resumed = lastFromOverride && !fromOverride && pos.startBar < beat.bar;
        lastKey = key;
        if (!first) {
          emit('section', { beat });
          if (resumed) {
            /* no late build / drop */
          } else if (pos.section === 'build') emit('build', { beat });
          else if (pos.section === 'drop') {
            let cause: DropCause = pos.cause;
            if (held) {
              cause = 'viewer'; // held all the way into the drop
              held = false;
            }
            emit('drop', { beat: { ...beat, held: false }, cause });
          }
        }
      }
      lastFromOverride = fromOverride;
      pump();
    },

    tap() {
      const now = clockNow();
      if (now - lastChirp < 0.22) return play((s, t) => s.hat(t, 0.5, true));
      lastChirp = now;
      play((s, t) => s.chirp(t));
    },

    meow(midi = 81) {
      play((s, t) => s.meow(t, midi, 0.5, 0.85));
    },

    cheer(size = 1) {
      play((s, t) => s.cheer(t, Math.max(0.3, Math.min(1.6, size))));
    },

    dispose() {
      disposed = true;
      listeners.clear();
      if (muteTimer) clearTimeout(muteTimer);
      stopScheduling();
      player?.dispose();
      player = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      if (typeof window !== 'undefined') {
        for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, onGesture);
      }
      if (ctx) {
        ctx.onstatechange = null;
        void ctx.close().catch(() => {});
      }
      ctx = null;
      synth = null;
    },
  };
  retry = () => void api.unlock();
  // Starting on the mix (`?track=mix`, a stored choice): it runs virtual (visuals at the mix tempo)
  // until the existing "Tap for sound" unlock makes it audible.
  if (opts.track === 'mix') void api.setTrack('mix');
  return api;
}
