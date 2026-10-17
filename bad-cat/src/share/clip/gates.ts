/**
 * Clip gates (GDD 7.3 "Gates for every clip format"): 0–1 s has no UI; the caption is readable in 1 s; the
 * watermark and URL line sit inside the safe box (top 11 %, right 16 %, bottom 25 % clear); the URL line is
 * present in the last 2 s; the last frame matches the first frame's framing; no "link in bio" anywhere.
 */
import { CLIP_H, CLIP_W, type ClipPlan } from '../../types';
import { LINK_IN_BIO } from './captions';
import {
  CLIP_FPS,
  CLIP_FRAMES,
  LOOP_FROM_FRAME,
  OPENER_FRAMES,
  URL_FROM_FRAME,
  WATERMARK_FROM_FRAME,
  loopFromFrame,
  planFrames,
  planSize,
  urlFromFrame,
} from './highlights';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Framing = 'opener' | 'closeup' | 'room' | 'card';

export interface ClipLayout {
  width: number;
  height: number;
  totalFrames: number;
  watermark: { rect: Rect; fromFrame: number };
  caption: { rect: Rect; fromFrame: number; toFrame: number };
  urlLine: { rect: Rect; fromFrame: number; toFrame: number };
  overlay: { rect: Rect; fromFrame: number; toFrame: number };
  /** First frame any logo/URL/HUD element may appear (captions excluded). */
  uiFromFrame: number;
  firstFraming: Framing;
  lastFraming: Framing;
  /** Frame the loop cut back to the first frame's framing starts. */
  loopFromFrame: number;
  // ----- FULL build (optional) -----
  /** Safe box override (a split-screen half carries only the part of the full frame's safe box it covers). */
  safe?: Rect;
  /** Height of the frame the viewer sees (1280 for the 720 x 640 split top half); size gates use it. */
  refHeight?: number;
  /** The tail repeats frame 0 even without an opener photo (game close-up loops on itself). */
  loopToFirst?: boolean;
}

export const SAFE_MARGINS = { top: 0.11, right: 0.16, bottom: 0.25, left: 0 } as const;
/** Longest hook caption that still reads in ~1 s on a phone. */
export const MAX_CAPTION_CHARS = 56;

export function safeBox(w = CLIP_W, h = CLIP_H): Rect {
  const x = Math.ceil(w * SAFE_MARGINS.left);
  const y = Math.ceil(h * SAFE_MARGINS.top);
  return { x, y, w: Math.floor(w * (1 - SAFE_MARGINS.right)) - x, h: Math.floor(h * (1 - SAFE_MARGINS.bottom)) - y };
}

export function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Default 720 × 1280 layout used by compose.ts. Caption sits in the top third, above FACE_RECT (y 380). */
export const DEFAULT_LAYOUT: ClipLayout = Object.freeze({
  width: CLIP_W,
  height: CLIP_H,
  totalFrames: CLIP_FRAMES,
  watermark: { rect: { x: 24, y: 152, w: 300, h: 52 }, fromFrame: WATERMARK_FROM_FRAME },
  caption: { rect: { x: 36, y: 216, w: 548, h: 116 }, fromFrame: 0, toFrame: URL_FROM_FRAME - 1 },
  urlLine: { rect: { x: 36, y: 216, w: 548, h: 116 }, fromFrame: URL_FROM_FRAME, toFrame: CLIP_FRAMES - 1 },
  overlay: { rect: { x: 36, y: 342, w: 548, h: 52 }, fromFrame: OPENER_FRAMES, toFrame: URL_FROM_FRAME - 1 },
  uiFromFrame: WATERMARK_FROM_FRAME,
  firstFraming: 'opener',
  lastFraming: 'opener',
  loopFromFrame: LOOP_FROM_FRAME,
}) as ClipLayout;

export { LINK_IN_BIO };

/** Pixel rect scaled from the 720-wide default layout to a frame `w` wide (same y). */
function at(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h };
}

/**
 * Layout for any plan (GDD 7.3 gates for every format): the URL line in the last 2 s, the watermark from 1 s, the
 * handle pill from 2 s, the loop tail in the last 1 s; 720 x 640 split top half for 'irl_vs_game'; the household
 * clip starts and ends on a 2D card.
 */
export function layoutFor(plan: ClipPlan): ClipLayout {
  const n = planFrames(plan);
  const { w, h } = planSize(plan);
  const urlFrom = urlFromFrame(plan);
  const fmt = plan.format ?? 'pov';
  if (h <= w) {
    // split-screen top half: the full frame is 720 x 1280, so its top 11 % (141 px) and right 16 % apply here
    const top = Math.ceil(CLIP_H * SAFE_MARGINS.top);
    const right = Math.floor(w * (1 - SAFE_MARGINS.right));
    return {
      width: w,
      height: h,
      totalFrames: n,
      watermark: { rect: at(24, top + 8, 300, 48), fromFrame: WATERMARK_FROM_FRAME },
      caption: { rect: at(36, top + 64, Math.min(548, right - 36), 104), fromFrame: 0, toFrame: urlFrom - 1 },
      urlLine: { rect: at(36, top + 64, Math.min(548, right - 36), 104), fromFrame: urlFrom, toFrame: n - 1 },
      overlay: { rect: at(36, top + 172, Math.min(548, right - 36), 40), fromFrame: OPENER_FRAMES, toFrame: urlFrom - 1 },
      uiFromFrame: WATERMARK_FROM_FRAME,
      firstFraming: 'closeup',
      lastFraming: 'closeup',
      loopFromFrame: loopFromFrame(plan),
      safe: { x: 0, y: top, w: right, h: h - top },
      refHeight: CLIP_H,
      loopToFirst: true,
    };
  }
  const household = fmt === 'household';
  return {
    width: w,
    height: h,
    totalFrames: n,
    watermark: { rect: at(24, 152, 300, 52), fromFrame: WATERMARK_FROM_FRAME },
    caption: { rect: at(36, 216, 548, 116), fromFrame: 0, toFrame: urlFrom - 1 },
    urlLine: { rect: at(36, 216, 548, 116), fromFrame: urlFrom, toFrame: n - 1 },
    // the handle pill (stitch / reply) sits under the caption, still in the top third, from the match cut (2 s)
    overlay: { rect: at(36, 342, 548, 52), fromFrame: OPENER_FRAMES, toFrame: urlFrom - 1 },
    uiFromFrame: WATERMARK_FROM_FRAME,
    firstFraming: household ? 'card' : 'opener',
    lastFraming: household ? 'card' : 'opener',
    loopFromFrame: loopFromFrame(plan),
  };
}

/** Returns a list of violations; empty = the clip passes every gate. */
export function clipGates(plan: ClipPlan, layout: ClipLayout = layoutFor(plan)): string[] {
  const v: string[] = [];
  const box = layout.safe ?? safeBox(layout.width, layout.height);
  const fps = CLIP_FPS;
  const refH = layout.refHeight ?? layout.height;

  if (layout.uiFromFrame < fps) v.push('ui_in_first_second');
  if (layout.watermark.fromFrame < fps) v.push('watermark_in_first_second');
  if (layout.urlLine.fromFrame < fps) v.push('url_in_first_second');
  if (!rectInside(layout.watermark.rect, box)) v.push('watermark_outside_safe_box');
  if (!rectInside(layout.urlLine.rect, box)) v.push('url_outside_safe_box');
  if (!rectInside(layout.caption.rect, box)) v.push('caption_outside_safe_box');
  if (plan.overlay && !rectInside(layout.overlay.rect, box)) v.push('overlay_outside_safe_box');
  const wmH = layout.watermark.rect.h / refH;
  if (wmH < 0.03 || wmH > 0.06) v.push('watermark_size');
  if (layout.caption.rect.y + layout.caption.rect.h > refH / 3) v.push('caption_not_top_third');
  if (plan.overlay && layout.overlay.rect.y + layout.overlay.rect.h > refH / 3) v.push('overlay_not_top_third');
  if (plan.overlay && layout.overlay.fromFrame < fps) v.push('overlay_in_first_second');

  const last2s = layout.totalFrames - 2 * fps;
  // an end line ("Mila is still waiting") takes the URL line's place; the URL then stays in the watermark
  if (layout.urlLine.fromFrame > last2s || layout.urlLine.toFrame < layout.totalFrames - 1) v.push('url_not_in_last_2s');
  if (plan.endLine !== undefined) {
    if (!plan.endLine.trim()) v.push('end_line_empty');
    if (layout.watermark.fromFrame > last2s) v.push('url_not_in_last_2s');
  } else if (!plan.urlLine || !/\w\.\w/.test(plan.urlLine)) v.push('url_line_missing');

  if (!plan.hook || !plan.hook.trim()) v.push('caption_missing');
  else if (plan.hook.length > MAX_CAPTION_CHARS) v.push('caption_too_long');
  if (layout.caption.fromFrame > 0) v.push('caption_late');

  if (layout.firstFraming !== layout.lastFraming) v.push('loop_framing_mismatch');
  if (layout.loopFromFrame > layout.totalFrames - 1) v.push('loop_missing');
  if (layout.totalFrames !== planFrames(plan)) v.push('frames_mismatch');

  for (const t of [plan.hook, plan.urlLine, plan.overlay ?? '', plan.endLine ?? '']) if (LINK_IN_BIO.test(t)) v.push('link_in_bio');

  const s = plan.slowMo;
  if (!(s.speed > 0 && s.speed <= 1) || s.toTick < s.fromTick) v.push('slowmo_invalid');
  if (plan.crime.toTick < plan.crime.breakTick || plan.matchCutTick < 0) v.push('crime_window_invalid');
  return v;
}
