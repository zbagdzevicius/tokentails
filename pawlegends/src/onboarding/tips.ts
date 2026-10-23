/**
 * First-match tips (POC.md §12): five ghost-paw tips fire on events (move at 0:05, attack a minion when the first
 * wave arrives, Q when an enemy hero comes close, Tumble away from the first enemy ability aimed at you, R at
 * level 4).
 * Each hides when done or after 8 s. Only in the player's first match. A tip whose event comes while another tip
 * is up waits in a queue and shows when that one hides (unless the player did it meanwhile), so one-off events
 * (the first wind-up, level 4) are never lost.
 */
import { trackpadOn, trackpadPref } from '../input/presets';
import { icon } from '../ui/icons';

export type TipId = 'move' | 'attack' | 'q' | 'dodge' | 'ult';

/** Ability names for the touch wording (the touch buttons show icons, not Q/W/E/R). */
export interface TipNames {
  q: string;
  e: string;
  r: string;
}

const DEFAULT_NAMES: TipNames = { q: 'your first ability', e: 'your third ability', r: 'the big gold button' };

/** Is left-click moving: true (trackpad mode), false (a mouse), null (Auto still watching, both buttons work). */
export type PadMode = boolean | null;

/** The pad mode from the saved choice alone (no match running). */
export const savedPadMode = (): PadMode => (trackpadOn() ? true : trackpadPref() === 'auto' ? null : false);

/** Tip text; touch names the button by its skill (and the button pulses), keyboard names the key (and says
 *  "Click" in trackpad mode, where left-click moves and attacks). While Auto is still watching, the move and attack
 *  tips name both buttons: told only "Right-click", a trackpad player two-finger clicks and Auto never sees them. */
export function tipText(id: TipId, touch: boolean, n: TipNames = DEFAULT_NAMES, pad: PadMode = savedPadMode()): string {
  const click = pad === null ? 'Click or right-click' : pad ? 'Click' : 'Right-click';
  switch (id) {
    case 'move':
      return touch ? 'Drag on the left to walk' : `${click} the ground to walk`;
    case 'attack':
      return touch ? 'Tap ATK to attack the nearest enemy' : `${click} an enemy minion to attack`;
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
/** Round 1 ("tips for things I had already done appeared late"): a queued tip older than this is dropped. */
export const TIP_QUEUE_S = 20;
/** Tips that make no sense in a hero fight (they step aside while an enemy hero is in combat range). */
const CALM_ONLY: readonly TipId[] = ['move', 'attack'];
/** Tips whose desktop wording depends on the pad mode. */
const PAD_TIPS: readonly TipId[] = ['move', 'attack'];

export class Tips {
  private el: HTMLElement | null = null;
  private active: { id: TipId; left: number } | null = null;
  private fired = new Set<TipId>();
  private queue: { id: TipId; at: number }[] = [];
  /** Seconds since the match started (update's dt). */
  private clock = 0;
  private done = new Set<TipId>();
  /** Tips completed in this match (analytics `tip_done`). */
  readonly completed: TipId[] = [];
  touch = false;
  /** The player's ability names (touch wording). */
  names: TipNames = DEFAULT_NAMES;
  /** The live pad mode (DesktopInput.padMode; Auto can flip it mid-tip), else the saved choice. */
  padMode: (() => PadMode | undefined) | null = null;
  /** The tip text on screen (re-rendered when the pad mode flips). */
  private text = '';

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
      if (this.active.id !== id && !this.queue.some((q) => q.id === id)) this.queue.push({ id, at: this.clock });
      return;
    }
    this.show(id);
  }

  private show(id: TipId): void {
    this.fired.add(id);
    this.active = { id, left: TIP_HIDE_S };
    if (this.el) {
      this.el.dataset.id = id;
      this.text = '';
      this.render(id);
      this.el.classList.add('on');
      setTipKey(this.touch ? TIP_KEY[id] : '');
    }
  }

  private render(id: TipId): void {
    const text = tipText(id, this.touch, this.names, this.padMode?.() ?? savedPadMode());
    if (!this.el || text === this.text) return;
    this.text = text;
    this.el.innerHTML = `<span class="ghost">${icon('paw')}</span><b>${text}</b>`;
  }

  /** The player did the thing. */
  complete(id: TipId): void {
    if (!this.enabled || this.done.has(id)) return;
    this.done.add(id);
    this.queue = this.queue.filter((q) => q.id !== id);
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
    this.queue = this.queue.filter((q) => !this.done.has(q.id) && !this.fired.has(q.id) && this.clock - q.at <= TIP_QUEUE_S);
    const next = this.queue.shift();
    if (next) this.show(next.id);
  }

  /** An enemy hero is in combat range: a move or attack tip steps aside (it does not come back). */
  combat(on: boolean): void {
    if (on && this.active && CALM_ONLY.includes(this.active.id)) this.hide();
  }

  update(dt: number): void {
    this.clock += dt;
    if (!this.active) return;
    if (!this.touch && PAD_TIPS.includes(this.active.id)) this.render(this.active.id);
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
