/**
 * Objective chips (fun plan F1): the Rookie match's story beats as a chip under the score bar, each with a world
 * arrow the match session points at the beat's target (the lane, a minion, the scripted dog, Pudding, the next
 * tower). One chip at a time; a beat that comes while another is up waits in a queue. Each hides when done or when
 * its time runs out, and fires at most once a match. `lite` (matches 2 and 3) keeps only Ultimate and Pudding.
 * The DOM part is optional (null parent in node tests).
 */
import { icon } from '../ui/icons';
import type { GuideMode } from '../app/firstSession';

export type BeatId = 'lane' | 'minions' | 'dog' | 'ult' | 'pudding' | 'push' | 'sunset';

export interface BeatText {
  title: string;
  sub: string;
  icon: Parameters<typeof icon>[0];
}

export interface BeatNames {
  q: string;
  r: string;
}

const LITE: readonly BeatId[] = ['ult', 'pudding'];

/** Seconds a beat stays up when the player does not do it. */
export const BEAT_TTL: Readonly<Record<BeatId, number>> = Object.freeze({ lane: 22, minions: 16, dog: 14, ult: 14, pudding: 30, push: 9, sunset: 9 });

export function beatText(id: BeatId, touch: boolean, n: BeatNames = { q: 'Q', r: 'R' }): BeatText {
  switch (id) {
    case 'lane':
      return { title: 'Run to the lane!', sub: touch ? 'Drag left to follow the arrow' : 'Right-click along the arrow', icon: 'paw' };
    case 'minions':
      return { title: 'Hit minions', sub: touch ? 'Tap ATK next to the dog minions' : 'Right-click a dog minion', icon: 'sword' };
    case 'dog':
      return { title: touch ? `A dog! Tap ${n.q}` : 'A dog! Press Q', sub: 'Your abilities do most of your damage', icon: 'sword' };
    case 'ult':
      return { title: 'ULTIMATE READY', sub: touch ? `Tap ${n.r} near the enemy` : 'Press R near the enemy', icon: 'crown' };
    case 'pudding':
      return { title: 'Calm Pudding!', sub: 'Stand next to him in the river', icon: 'heart' };
    case 'push':
      return { title: 'Push with your minions', sub: 'Walk in behind them: the tower hits them first', icon: 'shield' };
    case 'sunset':
      return { title: 'Sunset: towers crumble faster', sub: 'Push now and finish their core!', icon: 'sun' };
  }
}

export class Objectives {
  private el: HTMLElement | null = null;
  private ringEl: HTMLElement | null = null;
  private active: { id: BeatId; left: number } | null = null;
  private readonly fired = new Set<BeatId>();
  private readonly done = new Set<BeatId>();
  private queue: BeatId[] = [];
  readonly completed: BeatId[] = [];
  touch = false;
  names: BeatNames = { q: 'Q', r: 'R' };
  /** 0..1 progress on the chip's ring (Pudding), or null for none. */
  private progress: number | null = null;

  /** Round 1 standing goal: shown whenever no beat is up ("between them the HUD goal was often blank"). */
  private standingText: BeatText | null = null;
  private standingKey = '';

  constructor(
    parent: HTMLElement | null,
    readonly mode: GuideMode,
  ) {
    // every match has the chip now: matches 4+ only ever show the standing goal
    if (parent) {
      this.el = document.createElement('div');
      this.el.className = 'pl-goal';
      this.el.setAttribute('role', 'status');
      parent.appendChild(this.el);
    }
  }

  get enabled(): boolean {
    return this.mode !== 'off';
  }

  allows(id: BeatId): boolean {
    return this.mode === 'rookie' || (this.mode === 'lite' && LITE.includes(id));
  }

  /** The beat on screen, or null. */
  get current(): BeatId | null {
    return this.active?.id ?? null;
  }

  get shown(): BeatId[] {
    return [...this.fired];
  }

  isDone(id: BeatId): boolean {
    return this.done.has(id);
  }

  /** Show `id` (once a match); queued behind the chip on screen. */
  start(id: BeatId): void {
    if (!this.allows(id) || this.fired.has(id) || this.done.has(id)) return;
    if (this.active) {
      if (this.active.id !== id && !this.queue.includes(id)) this.queue.push(id);
      return;
    }
    this.show(id);
  }

  /** The standing goal (null: none). Drawn at once when no beat is up; a beat replaces it while it runs. */
  standing(t: BeatText | null): void {
    const key = t ? `${t.title}|${t.sub}` : '';
    if (key === this.standingKey) return;
    this.standingKey = key;
    this.standingText = t;
    if (!this.active) this.drawStanding();
  }

  /** The standing goal on screen now (tests, e2e), or null. */
  get standingTitle(): string | null {
    return this.active ? null : (this.standingText?.title ?? null);
  }

  private drawStanding(): void {
    const el = this.el;
    if (!el) return;
    const t = this.standingText;
    if (!t) {
      el.classList.remove('on', 'standing');
      return;
    }
    el.dataset.goal = 'standing';
    el.innerHTML = `<span class="ico">${icon(t.icon)}</span><span class="txt"><b></b><small></small></span>`;
    (el.querySelector('b') as HTMLElement).textContent = t.title;
    (el.querySelector('small') as HTMLElement).textContent = t.sub;
    this.ringEl = null;
    el.classList.remove('done', 'prog');
    el.classList.add('on', 'standing');
  }

  private show(id: BeatId): void {
    this.fired.add(id);
    this.active = { id, left: BEAT_TTL[id] };
    this.progress = null;
    const el = this.el;
    if (!el) return;
    const t = beatText(id, this.touch, this.names);
    el.dataset.goal = id;
    el.innerHTML = `<span class="ico">${icon(t.icon)}<i class="ring"></i></span><span class="txt"><b></b><small></small></span>`;
    (el.querySelector('b') as HTMLElement).textContent = t.title;
    (el.querySelector('small') as HTMLElement).textContent = t.sub;
    this.ringEl = el.querySelector('.ring');
    el.classList.remove('done', 'standing');
    el.classList.add('on');
    setGoalAttr(id);
  }

  /** The player did it: a tick mark, then the next queued beat. */
  complete(id: BeatId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.completed.push(id);
    this.queue = this.queue.filter((q) => q !== id);
    if (this.active?.id === id) {
      this.el?.classList.add('done');
      this.active.left = Math.min(this.active.left, 0.9);
    }
  }

  /** The beat is over without the player doing it (the other team calmed Pudding): just hide it. */
  dismiss(id: BeatId): void {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.queue = this.queue.filter((q) => q !== id);
    if (this.active?.id === id) this.active.left = 0;
  }

  setProgress(p: number | null): void {
    this.progress = p === null ? null : Math.max(0, Math.min(1, p));
    if (this.ringEl) this.ringEl.style.setProperty('--p', this.progress === null ? '0' : this.progress.toFixed(3));
    this.el?.classList.toggle('prog', this.progress !== null);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.active.left -= dt;
    if (this.active.left > 0) return;
    this.active = null;
    this.el?.classList.remove('on', 'done', 'prog');
    setGoalAttr('');
    this.queue = this.queue.filter((q) => !this.done.has(q) && !this.fired.has(q));
    const next = this.queue.shift();
    if (next) this.show(next);
    else this.drawStanding();
  }

  dispose(): void {
    this.el?.remove();
    setGoalAttr('');
  }
}

function setGoalAttr(id: string): void {
  try {
    const d = document.documentElement.dataset;
    if (id) d.goal = id;
    else delete d.goal;
  } catch {
    /* node */
  }
}
