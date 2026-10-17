/**
 * Clip pass (GDD 7.3): re-run the sim from the recorded inputs and draw the clip (default 360 frames = 12 s at
 * 30 fps, 720 × 1280; `plan.frames` and `plan.size` override, e.g. the 6 s Roomba clip = 180 frames, the
 * IRL-vs-game split = 720 × 640) into the SAME canvas/context, one frame per `onFrame` call (L6 wraps each in a
 * VideoFrame in the same task and its promise is the backpressure). The DPR governor is frozen for the pass.
 *
 * Timeline (matches share's `clipFrameTick` for any frame count): frames 0–59 (the opener, L6 may overdraw it with
 * the photo) hold `matchCutTick` with a slow push on the cat's face; frame 60 is the match cut to the FACE_RECT
 * pose with the slow blink; then one take on the cat and the crime at 1×, `slowMo.speed`× inside `plan.slowMo`;
 * the last 30 frames (the loop tail, replaced by L6 with a still of frame 0) hold the wreck. A context loss
 * mid-pass throws.
 */
import { CLIP_H, CLIP_W, NO_INPUT, type CatSpec, type ClipPlan, type ClipShot, type PlayableRoom, type Renderer, type SimEvent, type TickInput } from '../types';
import { initSim, stepSim } from '../sim';
import { isGameRenderer } from './Renderer';

export const CLIP_FPS = 30;
export const CLIP_FRAMES = 360;
/** Frame of the match cut (2.0 s) = the opener length. */
export const MATCH_FRAME = 60;
export const OPENER_FRAMES = MATCH_FRAME;
/** The loop tail (last 1 s) that L6 replaces with a still of frame 0. */
export const TAIL_FRAMES = 30;
/** The slow blink right after the match cut (0.6 s). */
export const BLINK_FROM = 66;
export const BLINK_TO = 84;
/** Close-up hold after the match cut, then the crime take (360-frame clip). */
export const CLOSEUP_UNTIL = 96;
/** The human's head joins the follow shot this long before his turn starts (round 3; unused since the 2-shot). */
export const HUMAN_LEAD_TICKS = 45;
/** The cut to the human as he turns lasted this long (0.6 s; replaced by the 9–11 s 2-shot). */
export const HUMAN_CUT_TICKS = 18;
/** Back to the close-up for the loop (360-frame clip). */
export const LOOP_FROM = 345;
/** The last 0.5 s of a full-length clip hold frame 0's close-up framing (the loop cut at 11.5 s). */
export const LOOP_CUT_FRAMES = CLIP_FRAMES - LOOP_FROM;

/** Total frames of a plan (default 360). */
export function clipFrames(plan: Pick<ClipPlan, 'frames'>): number {
  const n = plan.frames ?? CLIP_FRAMES;
  return Math.max(OPENER_FRAMES + TAIL_FRAMES + 1, Math.floor(n));
}

/** Output size of a plan (default 720 × 1280). */
export function clipSize(plan: Pick<ClipPlan, 'size'>): { w: number; h: number } {
  const s = plan.size;
  return s && s.w > 0 && s.h > 0 ? { w: Math.round(s.w), h: Math.round(s.h) } : { w: CLIP_W, h: CLIP_H };
}

/** Frame where the close-up hold ends (36 frames after the match cut in a 12 s clip, shorter in short clips). */
export function closeUpUntil(n: number): number {
  return MATCH_FRAME + Math.min(36, Math.round((n - OPENER_FRAMES - TAIL_FRAMES) * 0.135));
}

/**
 * Sim tick (fractional) shown at clip frame `frame` (share's `clipFrameTick`, for any frame count): the opener and
 * the loop tail hold `matchCutTick`; in between the run plays at 1× from the match cut, at `slowMo.speed`× inside
 * the slow-motion window, then 1× again.
 */
export function clipFrameToTick(plan: ClipPlan, frame: number): number {
  const n = clipFrames(plan);
  const f = Math.max(0, Math.min(n - 1, Math.floor(frame)));
  const start = Math.max(0, plan.matchCutTick);
  if (f < OPENER_FRAMES || f >= n - TAIL_FRAMES) return start;
  const g = f - OPENER_FRAMES;
  const sm = plan.slowMo;
  const speed = sm?.speed ?? 1;
  if (!sm || speed >= 1 || speed <= 0 || sm.toTick <= sm.fromTick || sm.toTick <= start) return start + g;
  const slowStart = Math.max(start, sm.fromTick);
  const pre = slowStart - start;
  if (g <= pre) return start + g;
  const slowFrames = (sm.toTick - slowStart) / speed;
  const gs = g - pre;
  if (gs <= slowFrames) return slowStart + gs * speed;
  return sm.toTick + (gs - slowFrames);
}

/**
 * Camera shot for a clip frame (pure). Round 3: the tail stays on the crime at full push, so a clip without an
 * opener photo ends on the wreck; with an opener the composer loops back to the photo there anyway. The human's
 * head joins the shot when he turns in the window.
 */
export function shotForFrame(plan: ClipPlan, frame: number, tick: number): ClipShot {
  const n = clipFrames(plan);
  // review round 1: from 11.5 s the clip cuts back to frame 0's framing (the cat's face), so the loop joins even
  // without an opener photo (the last 3.7 s used to end on a wide shot)
  if (n >= CLIP_FRAMES && frame >= n - LOOP_CUT_FRAMES) return { focusProp: -1, push: 0, closeUp: true };
  if (frame < MATCH_FRAME) return { focusProp: -1, push: frame / MATCH_FRAME, closeUp: true };
  if (frame < closeUpUntil(n)) return { focusProp: -1, push: 1, closeUp: true };
  const c = plan.crime;
  const span = Math.max(1, c.breakTick - c.fromTick);
  const push = frame >= n - 15 ? 1 : Math.max(0, Math.min(1, (tick - c.fromTick) / span));
  // round 2 (QA): nothing fell: a wide establishing shot of the room instead of the cat's body in close-up
  if (c.prop < 0 && plan.pick === 'default') return { focusProp: -1, push, closeUp: false, wide: true };
  // round 3 (virality): 9–11 s of a 12 s clip (the 3 s before the loop tail, minus its last second) is a 2-shot of
  // the falling object and the human, so his double-take is in frame. It replaces the 0.6 s human cut and the
  // follow shot backing out for him, which left the crime unreadable.
  if (c.prop >= 0 && n >= CLIP_FRAMES && frame >= n - TWO_SHOT_FROM_END && frame < n - TAIL_FRAMES) return { focusProp: c.prop, push, closeUp: false, twoShot: true };
  // round 3 (virality): everything else from the close-up to the loop cut is locked to the cat-plus-target box
  return c.prop >= 0 ? { focusProp: c.prop, push, closeUp: false, crimeBox: true } : { focusProp: c.prop, push, closeUp: false };
}

/** The 2-shot starts this many frames before the end (9 s of a 12 s clip) and ends at the loop tail (11 s). */
export const TWO_SHOT_FROM_END = 90;

export function blinkAt(frame: number, n = CLIP_FRAMES): boolean {
  return frame >= BLINK_FROM && frame < Math.min(BLINK_TO, closeUpUntil(n));
}

export async function renderFrames(
  r: Renderer,
  play: PlayableRoom,
  cat: CatSpec,
  inputs: readonly TickInput[],
  plan: ClipPlan,
  onFrame: (c: HTMLCanvasElement, i: number) => Promise<void>,
): Promise<void> {
  const impl = isGameRenderer(r) ? r : null;
  const epoch0 = impl ? impl.contextEpoch : 0;
  if (impl?.contextLost) throw new Error('Clip interrupted: the graphics context was lost');
  const n = clipFrames(plan);
  const size = clipSize(plan);
  r.setTarget({ w: size.w, h: size.h, hud: false });
  impl?.resetVisuals();
  const roomba = plan.format === 'roomba';
  try {
    // the run's own rule set: a v5 replay renders on the v5 rules, matching its result card
    const s = initSim(play, cat, plan.simVersion ? { simVersion: plan.simVersion } : undefined);
    let shown = 0;
    for (let f = 0; f < n; f++) {
      // never step back: the held tail keeps the last drawn tick (L6 covers it with frame 0)
      const t = Math.max(shown, f >= n - TAIL_FRAMES ? shown : clipFrameToTick(plan, f));
      shown = t;
      const target = Math.floor(t);
      const ev: SimEvent[] = [];
      while (s.tick < target && !s.ended) stepSim(s, play, inputs[s.tick] ?? NO_INPUT, ev);
      const alpha = s.ended || s.tick < target ? 0 : t - target;
      r.setClipShot(shotForFrame(plan, f, s.tick + alpha));
      // held frames (opener, tail) keep the cat breathing and blinking: a visual-only pose clock
      const held = f < OPENER_FRAMES || f >= n - TAIL_FRAMES;
      impl?.setClipExtras({ blink: blinkAt(f, n), roomba, poseT: held ? f : 0 });
      r.frame(s, alpha, ev);
      if (impl && (impl.contextLost || impl.contextEpoch !== epoch0)) throw new Error('Clip interrupted: the graphics context was lost');
      await onFrame(r.canvas, f);
    }
  } finally {
    r.setClipShot(null);
    impl?.setClipExtras({ blink: false });
    impl?.resetVisuals();
    r.setTarget({ w: 0, h: 0, hud: true });
  }
}
