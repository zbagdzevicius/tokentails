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

const TEXT: Record<TipId, { kbm: string; touch: string }> = {
  move: { kbm: 'Right-click the ground to walk', touch: 'Drag on the left to walk' },
  attack: { kbm: 'Right-click an enemy minion to attack', touch: 'Tap ATK to attack the nearest enemy' },
  q: { kbm: 'Enemy hero! Press Q to strike', touch: 'Enemy hero! Tap Q to strike' },
  dodge: { kbm: 'Incoming! Press E to Tumble out of the way', touch: 'Incoming! Tap E to Tumble out of the way' },
  ult: { kbm: 'Level 4! Press R for your ultimate', touch: 'Level 4! Tap R for your ultimate' },
};

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
      this.el.innerHTML = `<span class="ghost">${icon('paw')}</span><b>${TEXT[id][this.touch ? 'touch' : 'kbm']}</b>`;
      this.el.classList.add('on');
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
  }
}
