/**
 * Crime stickers (pure; tested): which v5 sim events slap a sticker on the screen, with what text, how important
 * it is when several land in one frame, where it sticks (at the prop, at a cell, at a human, under the score), and
 * how hard the phone buzzes. The DOM side (pooled stickers) lives in layer.ts.
 */
import { propKind, type SimEvent } from '../../types';
import { HUD_COPY, stackNoun, type Pronoun } from './copy-hud';

export type PopAnchor =
  | { at: 'prop'; prop: number }
  | { at: 'cell'; x: number; z: number; level: number }
  | { at: 'human'; human: number }
  | { at: 'under' };

export type PopKind = 'framed' | 'slide' | 'pull' | 'topple' | 'stack' | 'wish' | 'box' | 'cam' | 'wake' | 'target' | 'stash';

export interface CrimePop {
  kind: PopKind;
  text: string;
  /** Higher wins when more stickers land in one frame than the screen should show. */
  prio: number;
  anchor: PopAnchor;
  /** Sticker tilt in degrees (deterministic per event, so a replay looks the same). */
  tilt: number;
  /** Sticker colour class suffix. */
  tone: 'gold' | 'pink' | 'blue' | 'green' | 'red' | 'cream';
  /** Delay (ms) so the sticker lands a beat after the crash's own "+480". */
  delayMs: number;
}

/** Priority per sticker kind: the rarer and funnier the crime, the higher. */
export const POP_PRIO: Readonly<Record<PopKind, number>> = {
  wish: 100,
  wake: 95,
  framed: 90,
  topple: 85,
  target: 80,
  stack: 70,
  cam: 60,
  stash: 55,
  pull: 50,
  slide: 40,
  box: 30,
};

/** At most this many new stickers per frame (the rest are dropped, lowest priority first). */
export const MAX_POPS_PER_FRAME = 3;

export interface PopCtx {
  /** Prop kind of prop index `i` (stack nouns); -1 unknown. */
  kindOf(i: number): number;
  /** Today's accomplice name ("Mila"), for the wish sticker. */
  accompliceName: string;
  pronoun: Pronoun;
}

/** Deterministic tilt in -6..6 degrees from the event tick and a salt. */
export function popTilt(tick: number, salt = 0): number {
  const v = (((tick * 7 + salt * 13) % 13) + 13) % 13;
  return v - 6;
}

/** The sticker for one sim event, or null when the event has none (pure). */
export function crimePopFor(e: SimEvent, ctx: PopCtx): CrimePop | null {
  const mk = (kind: PopKind, text: string, anchor: PopAnchor, tone: CrimePop['tone'], delayMs = 0): CrimePop => ({
    kind,
    text,
    prio: POP_PRIO[kind],
    anchor,
    tilt: popTilt(e.tick, POP_PRIO[kind]),
    tone,
    delayMs,
  });
  switch (e.t) {
    case 'framed':
      return mk('framed', HUD_COPY.framed, { at: 'prop', prop: e.prop }, 'blue', 180);
    case 'slide':
      return mk('slide', HUD_COPY.slide, { at: 'cell', x: e.x, z: e.z, level: 0 }, 'blue');
    case 'pull':
      return mk('pull', e.kind === 'cable' ? HUD_COPY.pullCable : HUD_COPY.pullCloth, { at: 'prop', prop: e.prop }, 'pink');
    case 'topple':
      return mk('topple', HUD_COPY.topple, { at: 'prop', prop: e.prop }, 'green');
    case 'stack': {
      const k = ctx.kindOf(e.prop);
      const name = k >= 0 ? propKind(k)?.name ?? '' : '';
      return mk('stack', HUD_COPY.stack(Math.max(1, e.items | 0), stackNoun(name)), { at: 'prop', prop: e.prop }, 'gold', 120);
    }
    case 'wish':
      return mk('wish', HUD_COPY.wish(ctx.accompliceName || 'Your accomplice'), { at: 'under' }, 'pink', 300);
    case 'enter':
      return mk('box', HUD_COPY.box, { at: 'prop', prop: e.prop }, 'cream');
    case 'wake':
      return mk('wake', HUD_COPY.wake(ctx.pronoun), { at: 'human', human: e.human }, 'red');
    case 'target':
      return mk('target', HUD_COPY.target, { at: 'under' }, 'gold', 250);
    case 'stash':
      return mk('stash', HUD_COPY.stash, { at: 'under' }, 'gold');
    case 'break':
    case 'land':
    case 'spill':
    case 'hit':
      return e.cam && e.points > 0 ? mk('cam', HUD_COPY.onCamera, { at: 'prop', prop: e.prop }, 'red', 160) : null;
    default:
      return null;
  }
}

/**
 * Stickers for one frame's events: highest priority first (ties keep event order), at most `max`, one per kind
 * and anchor (a 4-plate stack does not stack four stickers).
 */
export function crimePops(events: readonly SimEvent[], ctx: PopCtx, max = MAX_POPS_PER_FRAME): CrimePop[] {
  const out: { p: CrimePop; i: number }[] = [];
  const seen = new Set<string>();
  events.forEach((e, i) => {
    const p = crimePopFor(e, ctx);
    if (!p) return;
    const key = `${p.kind}:${JSON.stringify(p.anchor)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ p, i });
  });
  out.sort((a, b) => b.p.prio - a.p.prio || a.i - b.i);
  return out.slice(0, Math.max(0, max)).map((o) => o.p);
}

/** Haptic buzz (ms) for an event, 0 none. Light for swat/slide/pull, medium for crashes, strong for a topple. */
export const HAPTIC = { light: 12, medium: 30, strong: 60 } as const;
export function hapticFor(e: SimEvent): number {
  switch (e.t) {
    case 'swat':
    case 'slide':
    case 'pull':
    case 'enter':
      return HAPTIC.light;
    case 'break':
    case 'spill':
    case 'seen':
    case 'wake':
    case 'framed':
      return HAPTIC.medium;
    case 'topple':
      return HAPTIC.strong;
    default:
      return 0;
  }
}
