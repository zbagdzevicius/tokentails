/**
 * Lane F (docs/FUN-PROGRESSION-V12.md F2, F3): the own hero's progression lines on the top rail. A level-up says what
 * it brings ("Level 4 — Ultimate unlocked!"), a Toy says what it adds ("Yarn Ball II — +8% damage"), and a buy and a
 * level-up within MERGE_TICKS of each other share one rail item ("Yarn Ball II +8% damage · Lv 5") instead of two lines in a
 * row. Every line uses one rail key, so a later one refreshes the item on screen. Pure: match ticks in, notes out.
 */
import type { Note } from './notifyQueue';

/** A buy and a level-up this close (ticks, 2 s at 30 Hz) are one rail item. */
export const MERGE_TICKS = 60;

/** ms a progression line may wait behind busier lines before it is dropped (render time, ÷ match speed). */
export const PROGRESS_STALE_MS = 6000;

/** The rail key every progression line uses (one item, refreshed in place). */
export const PROGRESS_KEY = 'progress';

/** The Fish glyph (inline SVG) used as the rail badge of a Toy line and on the Fish chip. */
export const FISH_GLYPH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 12c2.6-3.6 6-5.4 9.6-5.4 3.2 0 5.6 1.5 7 3.4L22.5 7v10L19.6 14c-1.4 1.9-3.8 3.4-7 3.4C9 17.4 5.6 15.6 3 12zm11.6-1.6a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z"/></svg>';

export interface LevelPart {
  level: number;
  /** "Ultimate unlocked!" ('' when the level brings nothing). */
  what: string;
  /** Desktop detail (rank numbers, the ult hint). */
  sub?: string;
}

export interface BuyPart {
  /** "Yarn Ball II". */
  name: string;
  /** "+8% damage". */
  head: string;
  /** Every stat, desktop only. */
  sub: string;
}

export class ProgressRail {
  private lvl: { tick: number; p: LevelPart } | null = null;
  private buy: { tick: number; p: BuyPart } | null = null;
  /** Lines built (tests). */
  readonly lines: string[] = [];

  /** The own hero reached `p.level` at `tick`: the note to push. */
  level(p: LevelPart, tick: number): Note {
    this.lvl = { tick, p };
    const b = this.buy && tick - this.buy.tick <= MERGE_TICKS ? this.buy.p : null;
    return this.note(p, b);
  }

  /** The own hero bought a Toy at `tick`: the note to push. */
  bought(p: BuyPart, tick: number): Note {
    this.buy = { tick, p };
    const l = this.lvl && tick - this.lvl.tick <= MERGE_TICKS ? this.lvl.p : null;
    return this.note(l, p);
  }

  private note(l: LevelPart | null, b: BuyPart | null): Note {
    let title: string;
    let sub: string | undefined;
    if (l && b) {
      // fun pass (playtest #9): the phone shows only the title, so the merged line keeps the Toy's stat in it
      title = b.head ? `${b.name} ${b.head} · Lv ${l.level}` : `${b.name} · Lv ${l.level}`;
      sub = l.what || undefined;
    } else if (l) {
      title = l.what ? `Level ${l.level} — ${l.what}` : `Level ${l.level}`;
      sub = l.sub;
    } else {
      title = b!.head ? `${b!.name} — ${b!.head}` : b!.name;
      // the desktop second part adds what the title does not say already (the other stats, the passive)
      const rest = b!.sub.startsWith(b!.head) ? b!.sub.slice(b!.head.length).replace(/^ · /, '') : b!.sub;
      sub = rest || undefined;
    }
    this.lines.push(title);
    return {
      key: PROGRESS_KEY,
      title,
      ...(sub ? { sub } : {}),
      tone: 'gold',
      // fun pass (playtest #9): a Toy is the player's big moment (prio 2: it no longer waits behind "Takedown!" and the
      // objective line while the chip already burst); a level-up alone stays personal (prio 3)
      prio: b ? 2 : 3,
      // a busy rail (an announcer line, a tip) holds it back; it waits up to PROGRESS_STALE_MS instead of the prio-3 2 s
      stale: PROGRESS_STALE_MS,
      tag: 'level',
      drops: ['level'],
      ...(b ? { icon: FISH_GLYPH } : {}),
    };
  }
}
