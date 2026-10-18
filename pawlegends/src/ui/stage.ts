/**
 * The centre-screen arbiter (playtest round 1: "banners, tips and callouts still stack on top of each other and on
 * the hero"). Every overlay that puts words in the middle band of the screen claims a kind here before it shows;
 * only the highest claim is visible, and the CSS hides the rest (`.pl-match[data-stage=...]` in ui.css). So a death
 * recap beats everything, a tower warning beats a banner, a banner beats a callout, and a coaching tip never shows
 * next to any of them.
 *
 * Pure bookkeeping: time is passed in (ms), so tests drive it without timers.
 */
export type StageKind = 'recap' | 'urgent' | 'alert' | 'talent' | 'banner' | 'callout' | 'tip';

/** Highest first. */
export const STAGE_ORDER: readonly StageKind[] = Object.freeze(['recap', 'urgent', 'alert', 'talent', 'banner', 'callout', 'tip'] as StageKind[]);

export class Stage {
  /** kind → until (ms); Infinity = held until released. */
  private readonly until = new Map<StageKind, number>();
  private shown: StageKind | null = null;

  constructor(private readonly el: HTMLElement | null = null) {}

  /** Claim `kind` for `ms` from `now` (a later claim of the same kind extends it). */
  claim(kind: StageKind, ms: number, now: number): void {
    this.until.set(kind, Math.max(this.until.get(kind) ?? 0, now + ms));
    this.apply(now);
  }

  /** Hold `kind` while `on` (the death recap, an open talent card, a coaching tip). */
  hold(kind: StageKind, on: boolean, now: number): void {
    if (on) this.until.set(kind, Infinity);
    else this.until.delete(kind);
    this.apply(now);
  }

  /** The kind on stage now, or null. */
  top(now: number): StageKind | null {
    for (const k of STAGE_ORDER) {
      const u = this.until.get(k);
      if (u === undefined) continue;
      if (u > now) return k;
      this.until.delete(k);
    }
    return null;
  }

  /** May `kind` show now (nothing above it)? */
  allows(kind: StageKind, now: number): boolean {
    const t = this.top(now);
    return t === null || STAGE_ORDER.indexOf(t) >= STAGE_ORDER.indexOf(kind);
  }

  /** Recompute (call once a frame: claims expire on their own). */
  apply(now: number): StageKind | null {
    const t = this.top(now);
    if (t !== this.shown) {
      this.shown = t;
      if (this.el) {
        if (t) this.el.dataset.stage = t;
        else delete this.el.dataset.stage;
      }
    }
    return t;
  }
}
