/**
 * Which slide comes next, and when (the while-you-wait slideshow). Pure: no DOM, no timers, no storage.
 *
 * - `buildDeck`: the slides for this account level and input, the ones this device has not seen first (no repeats
 *   until the whole cycle was shown), new players' basics first, kinds interleaved so two champions or two tips rarely
 *   meet.
 * - `liveSlides`: the player's own numbers (level, last match, Cats vs Dogs) as panels, or none.
 * - `Stepper`: the index, the auto-advance clock, and the pause reasons (hover, touch, a hidden tab).
 */
import type { Slide, SlideKind } from './content';
import { levelInfo, moreMatches } from '../../meta/accountLevel';
import type { HeroId } from '../../data/heroes';

/** Auto-advance every this many ms (founder ask: ~6–7 s). */
export const SLIDE_MS = 6500;
/** Dots per round: the dots show where the current slide sits in its round of this many. */
export const ROUND = 6;
/** New players (up to this account level) see the basics first. */
export const NEW_PLAYER_LV = 3;

export interface DeckOpts {
  level: number;
  device: 'mouse' | 'touch';
  /** Ids already shown on this device in the current cycle. */
  seen: ReadonlySet<string>;
  /** 0..1, e.g. Math.random (tests pass a seeded one). */
  rand: () => number;
}

/** The order kinds are dealt in (a tip and a champion most often; a map every few slides). */
const PATTERN: readonly SlideKind[] = ['tip', 'champ', 'tip', 'map', 'champ'];

/** May this slide show for `level` on `device`? Pure. */
export function fits(s: Slide, level: number, device: 'mouse' | 'touch'): boolean {
  return level >= (s.minLv ?? 1) && level <= (s.maxLv ?? Infinity) && (!s.device || s.device === device);
}

function shuffle<T>(a: T[], rand: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * The deck for one wait. Unseen slides first; once every fitting slide was seen, `cycleDone` is true and the deck is
 * the whole set again (the caller clears its seen list). Pure.
 */
export function buildDeck(all: readonly Slide[], o: DeckOpts): { deck: Slide[]; cycleDone: boolean } {
  const fit = all.filter((s) => fits(s, o.level, o.device));
  let fresh = fit.filter((s) => !o.seen.has(s.id));
  const cycleDone = fresh.length === 0;
  if (cycleDone) fresh = fit;
  const newbie = o.level <= NEW_PLAYER_LV;
  const byKind = new Map<SlideKind, Slide[]>();
  for (const s of fresh) {
    const list = byKind.get(s.kind) ?? [];
    list.push(s);
    byKind.set(s.kind, list);
  }
  for (const [k, list] of byKind) {
    shuffle(list, o.rand);
    // a new player's basics lead their kind (still shuffled among themselves)
    if (newbie) byKind.set(k, [...list.filter((s) => s.basic), ...list.filter((s) => !s.basic)]);
  }
  const deck: Slide[] = [];
  // a new player opens on a tip; everyone else on a random point of the pattern
  let p = newbie ? 0 : Math.floor(o.rand() * PATTERN.length);
  while (deck.length < fresh.length) {
    let took = false;
    for (let i = 0; i < PATTERN.length && !took; i++) {
      const k = PATTERN[(p + i) % PATTERN.length]!;
      const list = byKind.get(k);
      if (list?.length) {
        deck.push(list.shift()!);
        took = true;
        p = (p + i + 1) % PATTERN.length;
      }
    }
    // kinds outside the pattern (none today) go last
    if (!took) for (const [, list] of byKind) deck.push(...list.splice(0));
  }
  return { deck, cycleDone };
}

// ------------------------------------------------------------------------------------------------------- live
export interface LastMatch {
  hero: string;
  heroTitle: string;
  outcome: 'won' | 'lost' | 'draw';
  k: number;
  d: number;
  a: number;
  grade: string | null;
  best?: string | null;
  seconds: number;
}

/** The Cats vs Dogs board's answer (`board.get {kind: 'sides'}`), the parts the slide reads. */
export interface SidesData {
  season?: { cat?: number; dog?: number };
  mine?: { cat?: number; dog?: number };
}

export interface LiveInfo {
  matches: number;
  last: LastMatch | null;
  sides: SidesData | null;
  /** Mode unlock levels (ui/modeSelect/unlocks.ts) that still lie ahead, e.g. [{name: 'Practice', level: 5}]. */
  unlocks: readonly { name: string; level: number }[];
}

const n0 = (v: unknown): number => Math.max(0, Math.floor(Number(v) || 0));
const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Panels from the player's own numbers; any part missing is left out. Pure. */
export function liveSlides(info: LiveInfo): Slide[] {
  const out: Slide[] = [];
  const li = levelInfo(info.matches);
  const next = info.unlocks.filter((u) => u.level > li.level).sort((a, b) => a.level - b.level)[0];
  if (li.toNext > 0) {
    const text = `${moreMatches(li.toNext)} to Lv ${li.level + 1}.${next ? ` ${next.name} opens at Lv ${next.level}.` : ''}`;
    out.push({ id: 'l-level', kind: 'live', tag: 'YOU', title: `Level ${li.level}`, text, art: { t: 'icon', icon: 'crown', tone: 'bolt' } });
  }
  const l = info.last;
  if (l) {
    const res = l.outcome === 'won' ? 'Won' : l.outcome === 'lost' ? 'Lost' : 'Draw';
    const bits = [`${res} as ${l.heroTitle}`, `${n0(l.k)}/${n0(l.d)}/${n0(l.a)}`, l.seconds > 0 ? clock(l.seconds) : '', l.grade ? `Grade ${l.grade}` : ''].filter(Boolean);
    out.push({
      id: 'l-last',
      kind: 'live',
      tag: 'YOU',
      title: 'Last match',
      text: bits.join(' · '),
      ...(l.best ? { sub: `Best moment: ${l.best}` } : {}),
      art: { t: 'face', hero: l.hero as HeroId },
    });
  }
  const season = info.sides?.season;
  const cat = n0(season?.cat);
  const dog = n0(season?.dog);
  if (cat + dog > 0) {
    const c = Math.round((cat / (cat + dog)) * 100);
    const lead = cat === dog || c === 50 ? 'Dead even this season.' : `${cat > dog ? 'Cats' : 'Dogs'} lead this season, ${Math.max(c, 100 - c)}% of all wins.`;
    const mine = info.sides?.mine;
    const mc = n0(mine?.cat);
    const md = n0(mine?.dog);
    out.push({
      id: 'l-sides',
      kind: 'live',
      tag: 'LIVE',
      title: 'Cats vs Dogs',
      text: lead,
      ...(mc + md > 0 ? { sub: `Your wins: ${mc.toLocaleString('en-US')} as a cat, ${md.toLocaleString('en-US')} as a dog` } : { sub: 'Every win you play counts for your side.' }),
      art: { t: 'split', cat, dog },
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------ stepper
export type PauseReason = 'hover' | 'touch' | 'hidden' | 'focus';

/** The slideshow's clock: `tick(dt)` advances after `every` ms unless paused; stepping restarts the clock. */
export class Stepper {
  index = 0;
  /** ms into the current slide. */
  elapsed = 0;
  private readonly paused = new Set<PauseReason>();

  constructor(
    public count: number,
    readonly every: number = SLIDE_MS,
  ) {}

  get isPaused(): boolean {
    return this.paused.size > 0;
  }

  /** 0..1 of the current slide's time. */
  get progress(): number {
    return Math.min(1, this.elapsed / this.every);
  }

  /** Advance the clock; true when it moved to the next slide. */
  tick(dt: number): boolean {
    if (this.count <= 1 || this.isPaused || !(dt > 0)) return false;
    this.elapsed += dt;
    if (this.elapsed < this.every) return false;
    this.go(this.index + 1);
    return true;
  }

  go(i: number): void {
    if (this.count <= 0) return;
    this.index = ((i % this.count) + this.count) % this.count;
    this.elapsed = 0;
  }

  next(): void {
    this.go(this.index + 1);
  }

  prev(): void {
    this.go(this.index - 1);
  }

  pause(r: PauseReason): void {
    this.paused.add(r);
  }

  resume(r: PauseReason): void {
    this.paused.delete(r);
  }

  /** The deck grew or shrank (live slides arrived): keep the current slide's index in range. */
  setCount(n: number): void {
    this.count = Math.max(0, n);
    if (this.index >= this.count) this.go(0);
  }

  /** The dots' round: its first index and length, and the current dot. */
  round(size = ROUND): { start: number; len: number; at: number } {
    const start = Math.floor(this.index / size) * size;
    return { start, len: Math.max(0, Math.min(size, this.count - start)), at: this.index - start };
  }
}
