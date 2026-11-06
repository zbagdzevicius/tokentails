/**
 * The top notification rail (LoL pass, lane A): the DOM side of ui/notifyQueue.ts. One centred column just under the
 * score bar replaces the old centre-screen banner, callouts, tower alert, tip card, goal chip, countdown and gate pill,
 * so no message ever covers the hero. Phones show one 26-28 px line; desktop a main line, a smaller second line and a
 * resting line under them. A LoL announcer plate: dark navy, gold bevel, clipped corners, the tone as a left accent.
 *
 * `update(dt)` from Juice.update drives it: render time, never slower than the wall clock, held while paused.
 * `said` and the rail's `data-said` list what showed (e2e).
 */
import { NoteQueue, type Note, type NoteTone, type RailState, type RestKind, type RestLine, type ShownNote } from './notifyQueue';

export type { Note, NoteAction, NotePrio, NoteTone, RestKind } from './notifyQueue';

/** What the rest of the client needs from the rail (tips, objectives, the lifecycle HUD take this, tests fake it). */
export interface NotifyLike {
  push(n: Note): boolean;
  rest(kind: RestKind, text: string | null, tone?: NoteTone, ping?: string): void;
  drop(key: string): void;
}

const byRoot = new WeakMap<HTMLElement, Notify>();

/** The rail mounted on this match root (null before Juice made it, and in node tests). */
export function notifyFor(root: HTMLElement | null): Notify | null {
  return root ? (byRoot.get(root) ?? null) : null;
}

const SKULL =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.8 1.3 4.6 3 5.7V19a1.5 1.5 0 0 0 1.5 1.5h1V18h1.5v2.5h3V18H15v2.5h1a1.5 1.5 0 0 0 1.5-1.5v-2.8c1.7-1.1 3-2.9 3-5.7 0-4.6-3.5-8-8.5-8zM8.6 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6.8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>';
const LOCK =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect fill="currentColor" x="4.5" y="10" width="15" height="11" rx="3"/></svg>';
const FLAG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 2.5h2v19H5zM8 3.5h11l-2.6 4 2.6 4H8z"/></svg>';
const REST_ICON: Record<RestKind, string> = { respawn: SKULL, countdown: '', gate: LOCK, goal: FLAG };

/** Tower glyph for danger notes (tower alerts). */
export const TOWER_GLYPH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 2.5h2.4v2.2h2.4V2.5h2.4v2.2h2.4V2.5H18v6l-2 1.6V19h2v2.5H6V19h2v-8.9L6 8.5z"/></svg>';

const isUrl = (s: string): boolean => /^(data:|https?:|\/|\.\/|blob:)/.test(s);

/** One drawn line (main, second or rest). */
class Line {
  readonly el: HTMLElement;
  private readonly ic: HTMLElement;
  private readonly tt: HTMLElement;
  private readonly sb: HTMLElement;
  private readonly ct: HTMLElement;
  private readonly ac: HTMLElement;
  private shownActs = '';
  private shownId = -1;
  private shownText = '';
  private shownSub = '';
  private shownN = 1;
  private shownCls = '';
  private outAt = 0;
  on = false;

  constructor(parent: HTMLElement, cls: string) {
    this.el = document.createElement('div');
    this.el.className = cls;
    this.el.innerHTML = '<span class="ic"></span><b class="tt"></b><span class="ct"></span><span class="sb"></span><span class="ac"></span>';
    this.ic = this.el.firstElementChild as HTMLElement;
    this.tt = this.el.querySelector('.tt') as HTMLElement;
    this.ct = this.el.querySelector('.ct') as HTMLElement;
    this.sb = this.el.querySelector('.sb') as HTMLElement;
    this.ac = this.el.querySelector('.ac') as HTMLElement;
    parent.appendChild(this.el);
  }

  private setIcon(icon: string | undefined): void {
    if (!icon) {
      this.ic.innerHTML = '';
      this.ic.style.backgroundImage = '';
      this.ic.hidden = true;
      return;
    }
    this.ic.hidden = false;
    if (isUrl(icon)) {
      this.ic.innerHTML = '';
      this.ic.style.backgroundImage = `url("${icon}")`;
      this.ic.classList.add('pic');
    } else {
      this.ic.classList.remove('pic');
      this.ic.style.backgroundImage = '';
      if (icon.startsWith('<')) this.ic.innerHTML = icon;
      else this.ic.textContent = icon;
    }
  }

  /** Show a note (`id` new → re-animate). */
  note(n: ShownNote, base: string): void {
    const cls = `${base} on tone-${n.tone ?? 'info'} p${n.prio}${n.big ? ' big' : ''}${n.sub ? ' has-sub' : ''}`;
    if (n.id !== this.shownId) {
      this.shownId = n.id;
      this.setIcon(n.icon);
      this.el.dataset.key = n.key;
      this.el.className = base;
      void this.el.offsetWidth;
      this.shownCls = '';
    }
    if (cls !== this.shownCls) {
      this.el.className = cls;
      this.shownCls = cls;
    }
    if (n.title !== this.shownText) this.tt.textContent = this.shownText = n.title;
    const sub = n.sub ?? '';
    if (sub !== this.shownSub) this.sb.textContent = this.shownSub = sub;
    if (n.n !== this.shownN) {
      this.shownN = n.n;
      this.ct.textContent = n.n > 1 ? `×${n.n}` : '';
    }
    this.actions(n.actions);
    this.on = true;
    this.outAt = 0;
  }

  /** Party votes (lane M5): the note's chips, each a ≥ 40 px button; the rail's pointerdown dispatches them. */
  private actions(list: Note['actions']): void {
    const key = list?.length ? list.map((a) => `${a.id}:${a.label}`).join('|') : '';
    if (key === this.shownActs) return;
    this.shownActs = key;
    this.ac.textContent = '';
    this.el.classList.toggle('has-act', !!key);
    for (const a of list ?? []) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pl-rail-act';
      b.dataset.act = a.id;
      b.textContent = a.label;
      this.ac.appendChild(b);
    }
  }

  /** Show a resting line. */
  rest(r: RestLine, base: string): void {
    const key = `${r.kind}|${r.text}|${r.tone ?? ''}|${r.ping ?? ''}`;
    if (key !== this.shownText || !this.on) {
      const kindChanged = this.shownSub !== r.kind;
      this.shownText = key;
      this.shownSub = r.kind;
      if (kindChanged || !this.on) this.setIcon(REST_ICON[r.kind] || undefined);
      const cls = `${base} on rest-${r.kind} tone-${r.tone ?? (r.kind === 'respawn' ? 'bad' : 'info')}${r.ping ? ' tap' : ''}`;
      // a countdown digit pops each step
      if (r.kind === 'countdown') {
        this.el.className = base;
        void this.el.offsetWidth;
      }
      this.el.className = cls;
      this.el.dataset.key = `rest:${r.kind}`;
      this.actions(undefined);
      this.tt.textContent = r.text;
      if (r.ping) this.el.dataset.ping = r.ping;
      else delete this.el.dataset.ping;
    }
    this.on = true;
    this.outAt = 0;
  }

  hide(now: number): void {
    if (!this.on) {
      // the fade has run: clear the words (no stale text for a reader or a test)
      if (this.outAt && now - this.outAt > 200) {
        this.outAt = 0;
        this.tt.textContent = '';
        this.sb.textContent = '';
        this.ct.textContent = '';
        this.actions(undefined);
        this.shownText = '';
        this.shownSub = '';
        this.shownN = 1;
      }
      return;
    }
    this.on = false;
    this.outAt = now;
    this.shownId = -1;
    this.el.classList.remove('on');
    this.shownCls = '';
    delete this.el.dataset.ping;
    delete this.el.dataset.key;
  }
}

export class Notify implements NotifyLike {
  readonly queue = new NoteQueue();
  readonly el: HTMLElement | null = null;
  /** Titles pushed (e2e telemetry and tests). */
  readonly said: string[] = [];
  /** A tap on the resting goal line (its ping key). */
  onRestTap: ((key: string) => void) | null = null;
  /** A tap on a note's chip (party votes, lane M5): the action id and the note's key. */
  onAction: ((id: string, key: string) => void) | null = null;
  private main: Line | null = null;
  private second: Line | null = null;
  private restLine: Line | null = null;
  /** Render-time clock (ms). */
  private clock = 0;
  private state: RailState = { main: null, second: null, rest: null };
  private shownTitles: string[] = [];
  private lastMainId = -1;
  private layoutAt = -1e9;
  private lastReal = 0;

  constructor(root: HTMLElement | null) {
    if (!root || typeof document === 'undefined') return;
    const el = document.createElement('div');
    el.className = 'pl-rail empty';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.dataset.said = '';
    root.appendChild(el);
    this.el = el;
    this.main = new Line(el, 'pl-rail-line pl-rail-main');
    this.second = new Line(el, 'pl-rail-line pl-rail-second');
    this.restLine = new Line(el, 'pl-rail-line pl-rail-rest');
    this.restLine.el.addEventListener('pointerdown', (e) => {
      const key = this.restLine?.el.dataset.ping;
      if (!key) return;
      e.stopPropagation();
      e.preventDefault();
      this.onRestTap?.(key);
    });
    // a note's chips: the rail itself lets taps through (pointer-events: none); the chips take them (ui.css)
    el.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-act]');
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      const key = b.closest<HTMLElement>('.pl-rail-line')?.dataset.key ?? '';
      this.onAction?.(b.dataset.act ?? '', key);
    });
    byRoot.set(root, this);
    this.layout();
  }

  /** Match speed (staleness scale). */
  set speed(v: number) {
    this.queue.speed = v;
  }

  /** The talent picker is open: only prio 0-1 notes show. */
  set hold(on: boolean) {
    this.queue.hold = on;
  }

  push(n: Note): boolean {
    this.said.push(n.title);
    if (this.said.length > 40) this.said.shift();
    return this.queue.push(n, this.clock);
  }

  rest(kind: RestKind, text: string | null, tone?: NoteTone, ping?: string): void {
    this.queue.rest(kind, text, tone, ping);
  }

  drop(key: string): void {
    this.queue.drop(key);
  }

  /** The main note's title on screen now ('' when none). */
  get showing(): string {
    return this.state.main?.title ?? '';
  }

  /** The key of the main note on screen now ('' when none). */
  get showingKey(): string {
    return this.state.main?.key ?? '';
  }

  queued(key: string): boolean {
    return this.queue.queued(key);
  }

  /** Is a note with this key on the rail (the main or, on desktop, the second line) or waiting for it? */
  onRail(key: string): boolean {
    return this.state.main?.key === key || this.state.second?.key === key || this.queue.queued(key);
  }

  /** Phones (touch) and short desktop windows show one line; a full desktop two. */
  private layout(): void {
    let one = true;
    try {
      one = document.documentElement.dataset.touch === '1' || window.innerHeight < 600 || window.matchMedia('(pointer: coarse)').matches;
    } catch {
      /* node */
    }
    this.queue.slots = one ? 1 : 2;
    this.el?.classList.toggle('one', one);
  }

  update(dt: number): void {
    // render time, but never slower than the wall clock: a slow device (or a headless test) clamps dt per frame, and
    // a 2 s note must not stay up for 20 s. A paused frame (dt 0) holds it.
    const real = typeof performance !== 'undefined' ? performance.now() : 0;
    const wall = this.lastReal ? Math.min(1000, real - this.lastReal) : 0;
    this.lastReal = real;
    if (dt > 0) this.clock += Math.max(dt * 1000, wall);
    if (this.clock - this.layoutAt > 500) {
      this.layoutAt = this.clock;
      this.layout();
    }
    const s = (this.state = this.queue.tick(this.clock));
    const el = this.el;
    if (!el || !this.main || !this.second || !this.restLine) return;
    if (s.main) this.main.note(s.main, 'pl-rail-line pl-rail-main');
    else this.main.hide(this.clock);
    if (s.second) this.second.note(s.second, 'pl-rail-line pl-rail-second');
    else this.second.hide(this.clock);
    if (s.rest) this.restLine.rest(s.rest, 'pl-rail-line pl-rail-rest');
    else this.restLine.hide(this.clock);
    if (s.main && s.main.id !== this.lastMainId) {
      this.lastMainId = s.main.id;
      this.shownTitles.push(s.main.title);
      if (this.shownTitles.length > 12) this.shownTitles.shift();
      el.dataset.said = this.shownTitles.join('|');
      try {
        document.documentElement.dataset.banner = s.main.title;
      } catch {
        /* node */
      }
    } else if (!s.main && this.lastMainId !== -1) {
      this.lastMainId = -1;
      try {
        delete document.documentElement.dataset.banner;
      } catch {
        /* node */
      }
    }
    const any = !!(s.main || s.second || s.rest);
    el.classList.toggle('empty', !any);
    el.classList.toggle('has-main', !!s.main);
    el.classList.toggle('has-rest', !!s.rest);
    el.classList.toggle('has-second', !!s.second);
    // party votes (lane M5): a note waiting on this player stays on screen over a local menu (ui.css)
    el.classList.toggle('act', !!s.main?.actions?.length);
  }

  clear(): void {
    this.queue.clear();
  }

  dispose(): void {
    this.el?.remove();
  }
}
