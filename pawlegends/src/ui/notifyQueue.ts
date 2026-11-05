/**
 * The top notification rail's queue (LoL pass, lane A): one ordered list for every screen-anchored message (announcer
 * banners, callouts, tower alerts, coaching tips, objective beats), so nothing is drawn in the middle of the screen
 * and nothing stacks. Pure logic: time is passed in (ms), no DOM, so tests drive it without timers. The DOM side is
 * ui/notify.ts.
 *
 * Priorities: 0 critical (core, result, "Go!"), 1 danger (tower, dive, enemy ult), 2 announce (First Blood, towers,
 * objectives), 3 personal (Takedown!, Level N), 4 info (tips, lane help). Phones show one line; desktop shows a main
 * line plus a smaller second line that takes only prio 3-4 while the main line holds prio 0-2. Under both sits the
 * resting line (respawn > countdown > gate > goal), which phones show only while no note is up.
 */
export type NotePrio = 0 | 1 | 2 | 3 | 4;
export type NoteTone = 'good' | 'bad' | 'gold' | 'info';

export interface Note {
  /** Dedupe key; default = title. */
  key?: string;
  /** Phone: one line, ≤ 28 chars recommended (CSS truncates with an ellipsis). */
  title: string;
  /** Desktop only, shown after the title; phones drop it. */
  sub?: string;
  tone?: NoteTone;
  prio: NotePrio;
  /** ms on screen (render time); defaults per prio (NOTE_TTL). */
  ttl?: number;
  /** A portrait URL or one glyph (inline SVG or a character), drawn as a badge on the left. */
  icon?: string;
  /** Desktop announcer size (First Blood, Ace, multikills, towers, the result). */
  big?: boolean;
  /** ms it may wait in the queue before it is dropped (default per prio, NOTE_STALE). */
  stale?: number;
  /** ms per key: a push within this long of the key last showing is ignored. */
  cooldown?: number;
  /** The same key while showing → "×N" instead of a re-show. */
  count?: boolean;
  /** Supersede group ('takedown', 'multi', 'level'). */
  tag?: string;
  /** Queued notes of these tags (pushed in the last SUPERSEDE_MS, or any age for its own tag) are dropped. */
  drops?: readonly string[];
}

/** A note as the rail draws it: `id` changes on every new show (re-animate), `n` is the ×N count. */
export interface ShownNote extends Note {
  key: string;
  id: number;
  n: number;
}

export type RestKind = 'respawn' | 'gate' | 'countdown' | 'goal';
/** Highest first. */
export const REST_ORDER: readonly RestKind[] = Object.freeze(['respawn', 'countdown', 'gate', 'goal'] as RestKind[]);

export interface RestLine {
  kind: RestKind;
  text: string;
  tone?: NoteTone;
  /** A tap on it names this objective (the goal line's ping key). */
  ping?: string;
}

export interface RailState {
  main: ShownNote | null;
  second: ShownNote | null;
  rest: RestLine | null;
}

export const NOTE_TTL: Readonly<Record<NotePrio, number>> = Object.freeze({ 0: 2400, 1: 2000, 2: 2000, 3: 1200, 4: 3000 });
/** A prio 1-2 note shows this long when more wait behind it (prio 0: NOTE_TTL_BUSY0). */
export const NOTE_TTL_BUSY = 1400;
export const NOTE_TTL_BUSY0 = 1800;
/** A big announcer note (First Blood, ACE, a multikill, a tower) waits this long before it is stale (QA v2 #8). */
export const NOTE_STALE_BIG = 5000;
/** A note waiting longer than this in the queue is dropped (Infinity: never). Divided by the match speed. */
export const NOTE_STALE: Readonly<Record<NotePrio, number>> = Object.freeze({ 0: Infinity, 1: 1500, 2: 3000, 3: 2000, 4: 6000 });
export const QUEUE_CAP = 5;
/** A more important note replaces the one on screen once that one has been up this long (or is 2+ prio levels lower). */
export const PREEMPT_AFTER_MS = 400;
/** A replaced note goes back to the queue when it had more than this left. */
export const REQUEUE_MIN_LEFT_MS = 800;
export const SUPERSEDE_MS = 1500;

interface Item {
  n: Note;
  key: string;
  /** Push time (stale check). */
  at: number;
  /** Sort rank inside its prio group (push time; a requeued note goes to the front). */
  rank: number;
  /** ms left for a requeued note. */
  left?: number;
  id: number;
  count: number;
  shownAt: number;
  until: number;
}

export class NoteQueue {
  /** Lines visible: 1 on phones, 2 on desktop (a main line and a second line). */
  slots: 1 | 2 = 1;
  /** Match speed: staleness is divided by it (an e2e run at speed 4 makes events 4 times as fast). */
  speed = 1;
  /** The talent picker is open: only prio 0-1 notes show, the rest wait. */
  hold = false;
  private q: Item[] = [];
  private main: Item | null = null;
  private second: Item | null = null;
  private readonly lastShown = new Map<string, number>();
  private readonly rests = new Map<RestKind, RestLine>();
  private seq = 0;

  /** Queue a note. False when its cooldown blocks it or the queue cap dropped it at once. */
  push(note: Note, now: number): boolean {
    const key = note.key ?? note.title;
    const last = this.lastShown.get(key);
    if (note.cooldown && last !== undefined && now - last < note.cooldown) return false;
    // the same key on screen: refresh it (and count it), no re-show
    for (const s of [this.main, this.second]) {
      if (!s || s.key !== key) continue;
      if (note.count) s.count++;
      s.n = { ...note, title: note.title };
      s.until = Math.max(s.until, now + this.ttlOf(note));
      return true;
    }
    if (note.drops?.length) {
      this.q = this.q.filter((q) => !(q.n.tag && note.drops!.includes(q.n.tag) && (q.n.tag === note.tag || now - q.at <= SUPERSEDE_MS)));
    }
    // the same key waiting: the newer note takes its place
    const i = this.q.findIndex((q) => q.key === key);
    if (i >= 0) this.q.splice(i, 1);
    const item: Item = { n: note, key, at: now, rank: now, id: 0, count: 1, shownAt: 0, until: 0 };
    this.q.push(item);
    this.sort();
    while (this.q.length > QUEUE_CAP) {
      // drop the least important (highest prio number); among those a plain note before a big announcer one (QA v2
      // #8: a burst dropped the ACE, the oldest prio 2 note), then the oldest
      // A note cut off on screen (requeued with time left) is dropped last: it was already chosen to be read.
      let k = 0;
      for (let j = 1; j < this.q.length; j++) {
        const a = this.q[j];
        const b = this.q[k];
        const ar = a.left !== undefined ? 1 : 0;
        const br = b.left !== undefined ? 1 : 0;
        const ab = a.n.big ? 1 : 0;
        const bb = b.n.big ? 1 : 0;
        if (ar < br || (ar === br && (a.n.prio > b.n.prio || (a.n.prio === b.n.prio && (ab < bb || (ab === bb && a.at < b.at)))))) k = j;
      }
      this.q.splice(k, 1);
    }
    return this.q.includes(item);
  }

  /** Set (or clear with null) a resting line. */
  rest(kind: RestKind, text: string | null, tone?: NoteTone, ping?: string): void {
    if (text === null || text === '') this.rests.delete(kind);
    else this.rests.set(kind, { kind, text, ...(tone ? { tone } : {}), ...(ping ? { ping } : {}) });
  }

  /** The resting line of `kind` now (tests). */
  restOf(kind: RestKind): RestLine | null {
    return this.rests.get(kind) ?? null;
  }

  /** Remove a note by key, on screen or waiting (a tip the player did, a tower that stopped shooting). */
  drop(key: string): void {
    this.q = this.q.filter((q) => q.key !== key);
    if (this.main?.key === key) this.main = null;
    if (this.second?.key === key) this.second = null;
  }

  /** Is a note with this key waiting (not on screen)? */
  queued(key: string): boolean {
    return this.q.some((q) => q.key === key);
  }

  /** The keys waiting, in order (tests). */
  get waiting(): string[] {
    return this.q.map((q) => q.key);
  }

  tick(now: number): RailState {
    const sp = Math.max(1, this.speed);
    this.q = this.q.filter((q) => now - q.at <= this.staleOf(q.n) / sp);
    if (this.main && now >= this.main.until) this.main = null;
    if (this.second && now >= this.second.until) this.second = null;
    const ok = (p: NotePrio): boolean => !this.hold || p <= 1;
    const head = this.q.find((q) => ok(q.n.prio));
    // preemption: a more important note replaces the one on screen
    if (head && this.main && head.n.prio < this.main.n.prio) {
      const m = this.main;
      if (now - m.shownAt >= PREEMPT_AFTER_MS || m.n.prio - head.n.prio >= 2) {
        const left = m.until - now;
        this.main = null;
        // a note cut off on screen is current, not stale: it goes back to the front of its group with a fresh stale
        // clock (e2e pings.spec: at ?speed=8 the 5.5 s ping tip was dropped after an ally-slain line cut in)
        if (left > REQUEUE_MIN_LEFT_MS) {
          const firstOfGroup = this.q.find((q) => q.n.prio === m.n.prio);
          m.rank = (firstOfGroup ? Math.min(firstOfGroup.rank, m.rank) : m.rank) - 1;
          m.left = left;
          m.at = now;
          this.q.push(m);
          this.sort();
        }
      }
    }
    if (!this.main) {
      const next = this.q.find((q) => ok(q.n.prio));
      if (next) this.main = this.show(next, now);
    }
    if (this.slots === 2 && !this.second && this.main && this.main.n.prio <= 2) {
      const next = this.q.find((q) => q.n.prio >= 3 && ok(q.n.prio));
      if (next) this.second = this.show(next, now);
    }
    if (this.slots === 1) this.second = null;
    let rest: RestLine | null = null;
    if (this.slots === 2 || !this.main) for (const k of REST_ORDER) if ((rest = this.rests.get(k) ?? null)) break;
    return { main: this.view(this.main), second: this.view(this.second), rest };
  }

  clear(): void {
    this.q = [];
    this.main = null;
    this.second = null;
    this.rests.clear();
  }

  private show(it: Item, now: number): Item {
    this.q.splice(this.q.indexOf(it), 1);
    // more waiting: prio 0-2 notes take turns faster (QA v2 #8: a one-line phone rail held the first note 2.4 s)
    const busy = this.q.length > 0 && it.n.prio <= 2 ? (it.n.prio === 0 ? NOTE_TTL_BUSY0 : NOTE_TTL_BUSY) : 0;
    const ttl = it.left ?? it.n.ttl ?? (busy || NOTE_TTL[it.n.prio]);
    it.left = undefined;
    it.id = ++this.seq;
    it.shownAt = now;
    it.until = now + ttl;
    this.lastShown.set(it.key, now);
    return it;
  }

  private staleOf(n: Note): number {
    return n.stale ?? (n.big && n.prio === 2 ? NOTE_STALE_BIG : NOTE_STALE[n.prio]);
  }

  private ttlOf(n: Note): number {
    return n.ttl ?? NOTE_TTL[n.prio];
  }

  private sort(): void {
    this.q.sort((a, b) => a.n.prio - b.n.prio || a.rank - b.rank);
  }

  private view(it: Item | null): ShownNote | null {
    if (!it) return null;
    return { ...it.n, key: it.key, id: it.id, n: it.count };
  }
}
