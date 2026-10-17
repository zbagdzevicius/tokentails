/**
 * L-AUDIO: the arrangement timeline shared by the synth scheduler and the visual BeatClock.
 *
 * The default song loops ARRANGEMENT. Viewer actions (hold = build, release / double tap / new cat =
 * drop) never cut mid-bar: they place an "anchor" on a future bar that maps it to the start of a
 * section, and the loop continues from there. Anchors are only placed on bars the audio scheduler has
 * not scheduled yet, so what you hear and what the visuals read are always the same bar plan.
 */
import { ARRANGEMENT } from '../config';
import type { Section } from '../types';

export type DropCause = 'arrangement' | 'viewer' | 'new-cat';

interface SectionSpan {
  section: Section;
  start: number;
  bars: number;
}

const SPANS: readonly SectionSpan[] = (() => {
  let start = 0;
  return ARRANGEMENT.map((s) => {
    const span = { section: s.section as Section, start, bars: s.bars };
    start += s.bars;
    return span;
  });
})();

export const LOOP_BARS = SPANS.reduce((n, s) => n + s.bars, 0);

/**
 * Odd loops play a short drop (half length) and give the bars back to a longer breakdown, so the
 * loop length (and every section start) stays the same: long drop, short drop, long drop...
 */
const SHORT_SPANS: readonly SectionSpan[] = (() => {
  const drop = SPANS.find((s) => s.section === 'drop');
  const bd = SPANS.find((s) => s.section === 'breakdown');
  if (!drop || !bd || drop.start + drop.bars !== bd.start) return SPANS;
  const cut = Math.floor(drop.bars / 2);
  return SPANS.map((s) =>
    s === drop ? { ...s, bars: s.bars - cut } : s === bd ? { ...s, start: s.start - cut, bars: s.bars + cut } : s,
  );
})();

/**
 * The first pass of a visit (opt-in, the live clock uses it): groove 4 and build 4 bars, so the
 * first drop (sword, bows) lands at bar 12, about 21 s in at 136 BPM, not ~42 s. Loop 1 then
 * starts from its bar 0 and every later loop is the full arrangement.
 */
const FIRST_SPANS: readonly SectionSpan[] = (() => {
  const short: Partial<Record<Section, number>> = { groove: 4, build: 4 };
  let start = 0;
  return SPANS.map((s) => {
    const span = { ...s, start, bars: short[s.section] ?? s.bars };
    start += span.bars;
    return span;
  });
})();

export const FIRST_LOOP_BARS = FIRST_SPANS.reduce((n, s) => n + s.bars, 0);

/** First bar of `section` in the short first pass. */
export function firstPassStart(section: Section): number {
  return FIRST_SPANS.find((s) => s.section === section)?.start ?? 0;
}

/** True when loop `n` plays the short drop. */
export const shortDropLoop = (loop: number) => ((loop % 2) + 2) % 2 === 1;

/** First bar of `section` inside the loop. */
export function sectionStart(section: Section): number {
  return SPANS.find((s) => s.section === section)?.start ?? 0;
}

export function sectionLength(section: Section): number {
  return SPANS.find((s) => s.section === section)?.bars ?? 8;
}

export interface BarPos {
  bar: number;
  section: Section;
  /** Absolute bar where this section instance started. */
  startBar: number;
  /** Bars into the section (0-based). */
  sectionBar: number;
  /** Planned length of the section. */
  bars: number;
  /** What started this section instance. */
  cause: DropCause;
  /** 0-based pass through the arrangement: key, lead pattern, drop length and crowd moves vary by it. */
  loop: number;
}

interface Anchor {
  bar: number;
  loopBar: number;
  cause: DropCause;
  /** Loop index at the anchor bar. */
  loop: number;
  /** The visit's opening anchor with the short first pass (loopBar counts FIRST_SPANS bars). */
  first?: boolean;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export class Timeline {
  private anchors: Anchor[];

  /** `shortFirstPass`: the first loop plays groove 4 + build 4 (first drop at bar 12). */
  constructor(opts: { shortFirstPass?: boolean } = {}) {
    this.anchors = [{ bar: 0, loopBar: 0, cause: 'arrangement', loop: 0, first: !!opts.shortFirstPass }];
  }

  /** Anchor in force at `bar`, its position inside the loop and the loop index. */
  private locate(bar: number): { a: Anchor; loopPos: number; loop: number; first: boolean } {
    let a = this.anchors[0];
    for (const x of this.anchors) if (x.bar <= bar) a = x;
    let total = a.loopBar + (bar - a.bar);
    if (a.first) {
      if (total < FIRST_LOOP_BARS) return { a, loopPos: Math.max(0, total), loop: 0, first: true };
      total += LOOP_BARS - FIRST_LOOP_BARS; // loop 1 starts at its own bar 0
    }
    return { a, loopPos: mod(total, LOOP_BARS), loop: Math.max(0, a.loop + Math.floor(total / LOOP_BARS)), first: false };
  }

  at(bar: number): BarPos {
    const { a, loopPos, loop, first } = this.locate(bar);
    const spans = first ? FIRST_SPANS : shortDropLoop(loop) ? SHORT_SPANS : SPANS;
    let span = spans[0];
    for (const s of spans) if (loopPos >= s.start && loopPos < s.start + s.bars) span = s;
    const sectionBar = loopPos - span.start;
    const startBar = bar - sectionBar;
    return {
      bar,
      section: span.section,
      startBar,
      sectionBar,
      bars: span.bars,
      cause: startBar === a.bar ? a.cause : 'arrangement',
      loop,
    };
  }

  /** From `bar` on, play `section` from its first bar and continue the loop from there. */
  jumpTo(bar: number, section: Section, cause: DropCause): void {
    this.anchors = this.anchors.filter((a) => a.bar < bar);
    // Jumping back in the loop (a drop requested from the breakdown) starts the next loop.
    const prev = this.locate(bar - 1);
    const loopBar = sectionStart(section);
    // In the short first pass, compare against that pass's own section starts.
    const ahead = prev.first ? firstPassStart(section) > prev.loopPos : loopBar > prev.loopPos;
    const loop = ahead ? prev.loop : prev.loop + 1;
    this.anchors.push({ bar, loopBar, cause, loop });
    // Older anchors are only needed for bars long gone.
    if (this.anchors.length > 8) this.anchors.splice(1, this.anchors.length - 8);
  }
}

/** Kick velocity for a beat (0 = no kick). Shared by the synth and the visual `kick` envelope. */
export function kickOn(p: BarPos, beatInBar: number, held: boolean): number {
  switch (p.section) {
    case 'intro':
      return 0.85;
    case 'groove':
    case 'drop':
      return 1;
    case 'build':
      // The arranged build drops the kick for its last bar; a held build keeps pumping.
      return !held && p.sectionBar >= p.bars - 1 ? 0 : 1;
    case 'breakdown':
      return beatInBar === 0 ? 0.55 : 0;
  }
}

/** Open hat on the offbeat 8th. */
export function hatOn(p: BarPos): number {
  switch (p.section) {
    case 'intro':
      return p.sectionBar >= 2 ? 0.25 : 0;
    case 'groove':
      return 0.4;
    case 'build':
      return 0.45;
    case 'drop':
      return 0.5;
    case 'breakdown':
      return 0;
  }
}

/** 0..1 musical intensity; `progress` is the continuous 0..1 position in the section. */
export function energyAt(p: BarPos, progress: number, held: boolean): number {
  switch (p.section) {
    case 'intro':
      return 0.35 + 0.15 * progress;
    case 'groove':
      return p.sectionBar >= 8 ? 0.7 : 0.6;
    case 'build':
      return Math.min(1, 0.55 + 0.4 * progress + (held ? 0.05 : 0));
    case 'drop':
      return 1;
    case 'breakdown':
      return 0.25 + 0.1 * progress;
  }
}
