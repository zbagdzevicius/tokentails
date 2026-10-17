/**
 * L-AUDIO: synthesized music (WebAudio only, no samples, no copyrighted audio) and the BeatClock
 * every module syncs to. SPEC.md "Audio".
 *
 * Timing model: the visual clock is the performance clock (smooth, never stalls, works before unlock,
 * while muted and in tests). The synth maps that clock onto AudioContext time with a measured offset
 * (getOutputTimestamp, so output latency such as Bluetooth is compensated) and schedules 16ths a
 * little ahead. Both read the same Timeline, so build/drop changes land on the same bar for ears and
 * eyes.
 */
import { BPM } from '../config';
import type { BeatClock, BeatEvent, BeatEventPayload, BeatInfo } from '../types';
import { Synth } from './synth';
import { Timeline, energyAt, hatOn, kickOn, type DropCause } from './timeline';

export { Timeline, kickOn, hatOn, energyAt, LOOP_BARS, sectionStart } from './timeline';

export interface BeatClockOptions {
  muted: boolean;
  /** Seconds source (tests pass a fake). Defaults to performance.now() / 1000. */
  now?: () => number;
}

/** BeatClock plus a few sound effects for L-UI / L-DJ. All are no-ops while silent. */
export interface RaveClock extends BeatClock {
  /** Tap on the floor: an open hat and a tiny chirp (rate limited). */
  tap(): void;
  /** A one-off meow, `midi` default 81. */
  meow(midi?: number): void;
  /** A crowd cheer, `size` 0.5..1.5. */
  cheer(size?: number): void;
}

const LOOKAHEAD = 0.12;
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const PUMP_MS = 25;
const SPB = 60 / BPM;
const STEP = SPB / 4;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type SessionNavigator = Navigator & { audioSession?: { type: string } };

function supersawVoices(): number {
  if (typeof navigator === 'undefined') return 5;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (cores <= 4) return 3;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse ? 5 : 7;
}

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
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastBeat = -1;
  let lastKey: string | null = null;
  let lastChirp = 0;

  const beatNow = () => Math.max(0, (clockNow() - t0) / SPB);
  const curBar = () => Math.floor(beatNow() / 4);
  /** First bar nothing has been scheduled for yet: the earliest bar a change may land on. */
  const horizonBar = () => {
    const cur = Math.floor(beatNow() * 4) + 1;
    return Math.ceil(Math.max(cur, nextStep) / 16);
  };

  const info = (): BeatInfo => {
    const beat = beatNow();
    const whole = Math.floor(beat);
    const phase = beat - whole;
    const bar = Math.floor(whole / 4);
    const beatInBar = whole % 4;
    const pos = tl.at(bar);
    const progress = Math.min(1, Math.max(0, (beat / 4 - pos.startBar) / pos.bars));
    const k = kickOn(pos, beatInBar, held);
    const offPhase = phase >= 0.5 ? phase - 0.5 : phase + 0.5;
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

  const resync = () => {
    if (!ctx) return;
    offset = measureOffset();
    nextStep = Math.floor((ctx.currentTime - offset - t0) / STEP) + 1;
  };

  const pump = () => {
    const c = ctx;
    const s = synth;
    if (!c || !s || muted || nextStep < 0 || c.state !== 'running') return;
    const meas = measureOffset();
    if (Math.abs(meas - offset) > 0.04) offset = meas;
    else offset += (meas - offset) * 0.05;

    const now = c.currentTime;
    const horizon = now + LOOKAHEAD;
    // Fell far behind (tab throttled, context hiccup): skip ahead instead of a burst of notes.
    if (t0 + nextStep * STEP + offset < now - 0.25) nextStep = Math.floor((now - offset - t0) / STEP) + 1;
    for (let guard = 0; guard < 64; guard++) {
      const at = t0 + nextStep * STEP + offset;
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
  // Public API
  // -------------------------------------------------------------------------------------------

  const api: RaveClock = {
    bpm: BPM,
    now: info,

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
          if (ctx?.state === 'running' && !muted && nextStep < 0 && !document.hidden) startScheduling();
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
      if (m) {
        synth.fade(0, 0.06);
        stopScheduling();
        const c = ctx;
        setTimeout(() => {
          if (muted && c.state === 'running') void c.suspend().catch(() => {});
        }, 150);
      } else void resumeAudio();
    },

    get muted() {
      return muted;
    },

    beginBuild() {
      if (held) return;
      held = true;
      const nb = horizonBar();
      if (tl.at(nb).section === 'build') return; // already building (or about to)
      tl.jumpTo(nb, 'build', 'viewer');
    },

    endBuild() {
      if (!held) return;
      held = false;
      const nb = horizonBar();
      const nxt = tl.at(nb);
      if (nxt.section !== 'build') return; // the build already ran out into its drop
      // Released before the build even started: still give it one bar of tension.
      const dropBar = nxt.sectionBar === 0 ? nb + 1 : nb;
      tl.jumpTo(dropBar, 'drop', 'viewer');
    },

    queueDrop(cause: Exclude<DropCause, 'arrangement'>) {
      const cur = tl.at(curBar());
      if (cur.section === 'drop' && cur.sectionBar < 2) return;
      const nb = horizonBar();
      const nxt = tl.at(nb);
      held = false;
      if (nxt.section === 'drop' && nxt.sectionBar === 0) {
        if (cause === 'new-cat' && nxt.cause !== 'new-cat') tl.jumpTo(nb, 'drop', cause);
        return;
      }
      tl.jumpTo(nb, 'drop', cause);
    },

    tick() {
      if (disposed) return;
      const beat = info();
      const whole = Math.floor(beat.beat);
      if (whole !== lastBeat) {
        lastBeat = whole;
        emit('beat', { beat });
        if (beat.beatInBar === 0) emit('bar', { beat });
      }
      const pos = tl.at(beat.bar);
      const key = `${pos.startBar}:${pos.section}`;
      if (key !== lastKey) {
        const first = lastKey === null;
        lastKey = key;
        if (!first) {
          emit('section', { beat });
          if (pos.section === 'build') emit('build', { beat });
          if (pos.section === 'drop') {
            let cause: DropCause = pos.cause;
            if (held) {
              cause = 'viewer'; // held all the way into the drop
              held = false;
            }
            emit('drop', { beat: { ...beat, held: false }, cause });
          }
        }
      }
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
      stopScheduling();
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
  return api;
}
