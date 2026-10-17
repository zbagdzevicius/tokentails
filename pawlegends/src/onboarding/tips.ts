/**
 * First-match tips (POC.md §12): five ghost-paw tips fire on events (move at 0:05, attack a minion when the first
 * wave arrives, Q when an enemy hero comes close, Tumble away from the first enemy ability aimed at you, R at
 * level 4).
 * Each hides when done or after 8 s. Only in the player's first match. A tip whose event comes while another tip
 * is up waits in a queue and shows when that one hides (unless the player did it meanwhile), so one-off events
 * (the first wind-up, level 4) are never lost.
 */
import { icon } from '../ui/icons';

export type TipId = 'move' | 'attack' | 'q' | 'dodge' | 'ult';

/** Ability names for the touch wording (the touch buttons show icons, not Q/W/E/R). */
export interface TipNames {
  q: string;
  e: string;
  r: string;
}

const DEFAULT_NAMES: TipNames = { q: 'your first ability', e: 'your third ability', r: 'the big gold button' };

/** Tip text; touch names the button by its skill (and the button pulses), keyboard names the key. */
export function tipText(id: TipId, touch: boolean, n: TipNames = DEFAULT_NAMES): string {
  switch (id) {
    case 'move':
      return touch ? 'Drag on the left to walk' : 'Right-click the ground to walk';
    case 'attack':
      return touch ? 'Tap ATK to attack the nearest enemy' : 'Right-click an enemy minion to attack';
    case 'q':
      return touch ? `Enemy hero! Tap ${n.q} (glowing) to strike` : 'Enemy hero! Press Q to strike';
    case 'dodge':
      return touch ? `Incoming! Tap ${n.e} (glowing) to get out of the way` : 'Incoming! Press E to Tumble out of the way';
    case 'ult':
      return touch ? `Level 4! Tap ${n.r} (glowing) for your ultimate` : 'Level 4! Press R for your ultimate';
  }
}

/** The touch button a tip points at (html[data-tip-key] pulses it). */
const TIP_KEY: Record<TipId, string> = { move: '', attack: 'attack', q: 'q', dodge: 'e', ult: 'r' };

export const TIP_HIDE_S = 8;

export class Tips {
  private el: HTMLElement | null = null;
  private active: { id: TipId; left: number } | null = null;
  private fired = new Set<TipId>();
  private queue: TipId[] = [];
  private done = new Set<TipId>();
  /** Tips completed in this match (analytics `tip_done`). */
  readonly completed: TipId[] = [];
  touch = false;
  /** The player's ability names (touch wording). */
  names: TipNames = DEFAULT_NAMES;

  constructor(
    parent: HTMLElement | null,
    readonly enabled: boolean,
    private readonly onDone?: (id: TipId) => void,
  ) {
    if (parent && enabled) {
      this.el = document.createElement('div');
      this.el.className = 'pl-tip';
      parent.appendChild(this.el);
    }
  }

  /** An event happened that should show `id` (once per match). */
  trigger(id: TipId): void {
    if (!this.enabled || this.fired.has(id) || this.done.has(id)) return;
    if (this.active) {
      if (this.active.id !== id && !this.queue.includes(id)) this.queue.push(id);
      return;
    }
    this.show(id);
  }

  private show(id: TipId): void {
    this.fired.add(id);
    this.active = { id, left: TIP_HIDE_S };
    if (this.el) {
      this.el.innerHTML = `<span class="ghost">${icon('paw')}</span><b>${tipText(id, this.touch, this.names)}</b>`;
      this.el.classList.add('on');
      setTipKey(this.touch ? TIP_KEY[id] : '');
    }
  }

  /** The player did the thing. */
  complete(id: TipId): void {
    if (!this.enabled || this.done.has(id)) return;
    this.done.add(id);
    this.queue = this.queue.filter((q) => q !== id);
    this.completed.push(id);
    this.onDone?.(id);
    if (this.active?.id === id) this.hide();
  }

  isActive(id: TipId): boolean {
    return this.active?.id === id;
  }

  /** The tip on screen, or null. */
  get current(): TipId | null {
    return this.active?.id ?? null;
  }

  /** Tips shown so far, in order. */
  get shown(): TipId[] {
    return [...this.fired];
  }

  private hide(): void {
    this.active = null;
    setTipKey('');
    this.el?.classList.remove('on');
    this.queue = this.queue.filter((q) => !this.done.has(q) && !this.fired.has(q));
    const next = this.queue.shift();
    if (next) this.show(next);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.active.left -= dt;
    if (this.active.left <= 0) this.hide();
  }

  dispose(): void {
    this.el?.remove();
    setTipKey('');
  }
}

function setTipKey(k: string): void {
  try {
    const d = document.documentElement.dataset;
    if (k) d.tipKey = k;
    else delete d.tipKey;
  } catch {
    /* no document (node tests) */
  }
}
