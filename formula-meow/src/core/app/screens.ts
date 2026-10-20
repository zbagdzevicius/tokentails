/**
 * Screens (iteration 2 contract, integrator-owned): one overlay stack for every menu layer, lazy by default.
 *
 * - `registerScreen(id, loader)`: the loader returns (or resolves to) a module with `mount(root, params, api)`;
 *   lanes register their screens from their install file and the code loads on first push (a lazy chunk).
 * - `screens.push(id, params)` puts a layer on top and hides the one below it (B46: the pause panel used to show
 *   under the Tracks sheet), `replace` swaps the top, `pop` removes it and shows the one below again.
 * - Every layer gets keyboard / D-pad / stick focus navigation (src/ui/kit `focusNav`): A or Enter confirms, B or
 *   Esc goes back (the top screen's `back()`; by default it pops).
 *
 * Each layer root is `div.fm-overlay.on.fm-screen[data-screen][data-ui-layer]`, so the shell's panel styles apply.
 */
import { focusNav } from '../../ui/kit';

export type ScreenId =
  | 'title'
  | 'menu'
  | 'select'
  | 'class'
  | 'cup'
  | 'standings'
  | 'podium'
  | 'tt'
  | 'battle'
  | 'race'
  | 'garage'
  | 'achievements'
  | 'stats'
  | 'settings'
  | 'howto'
  | 'results'
  | 'pause'
  | 'tracks'
  | 'editor'
  | 'yourcat'
  | 'pinkpaw'
  | 'rewards';

export interface ScreenHandle {
  /** cleanup when the layer is removed */
  unmount?(): void;
  /** Esc / gamepad B: return true when handled; otherwise the stack pops the layer */
  back?(): boolean | void;
}

export interface ScreenApi {
  readonly id: ScreenId;
  /** close this layer (same as `screens.pop()` when it is on top) */
  close(): void;
}

export interface ScreenModule {
  mount(root: HTMLElement, params: unknown, api: ScreenApi): ScreenHandle | void;
}

export type ScreenLoader = () => ScreenModule | Promise<ScreenModule>;

const loaders = new Map<ScreenId, ScreenLoader>();

/** Register (or replace) the loader for a screen id. Lanes call this from their install file. */
export function registerScreen(id: ScreenId, loader: ScreenLoader): void {
  loaders.set(id, loader);
}

export function hasScreen(id: ScreenId): boolean {
  return loaders.has(id);
}

interface Layer {
  id: ScreenId;
  root: HTMLDivElement;
  handle: ScreenHandle;
  stopNav: () => void;
  lastFocus?: HTMLElement;
}

export class ScreenStack {
  private host: HTMLElement | null = null;
  private layers: Layer[] = [];
  private listeners: Array<(top: ScreenId | null, prev: ScreenId | null) => void> = [];
  /** bumped on every change: a push that resolves after a newer change is dropped */
  private gen = 0;

  attach(host: HTMLElement): void {
    this.host = host;
    if (typeof window !== 'undefined')
      window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !this.layers.length) return;
        e.preventDefault();
        e.stopPropagation();
        this.back();
      });
  }

  get size(): number {
    return this.layers.length;
  }

  top(): ScreenId | null {
    return this.layers.length ? this.layers[this.layers.length - 1].id : null;
  }

  has(id: ScreenId): boolean {
    return this.layers.some((l) => l.id === id);
  }

  ids(): ScreenId[] {
    return this.layers.map((l) => l.id);
  }

  onChange(fn: (top: ScreenId | null, prev: ScreenId | null) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((x) => x !== fn));
  }

  /** Push a screen (loads its chunk on first use). Resolves to the layer root, or null when it could not load. */
  async push(id: ScreenId, params?: unknown): Promise<HTMLElement | null> {
    const g = ++this.gen;
    const loader = loaders.get(id);
    if (!loader || !this.host) return null;
    let mod: ScreenModule;
    try {
      mod = await loader();
    } catch (err) {
      console.warn(`[screens] "${id}" did not load`, err);
      return null;
    }
    if (g !== this.gen && this.has(id)) return null; // a newer change already showed it
    return this.mountLayer(id, mod, params);
  }

  /** Replace the top layer with `id`. */
  async replace(id: ScreenId, params?: unknown): Promise<HTMLElement | null> {
    this.removeTop(false);
    return this.push(id, params);
  }

  /** Remove the top layer and show the one below it. */
  pop(): void {
    this.removeTop(true);
  }

  /** Remove `id` wherever it sits in the stack. */
  remove(id: ScreenId): void {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const prev = this.top();
    const [l] = this.layers.splice(i, 1);
    this.destroy(l);
    this.showTop();
    this.changed(prev);
  }

  /** Remove every layer. */
  clear(): void {
    const prev = this.top();
    while (this.layers.length) this.destroy(this.layers.pop()!);
    this.gen++;
    this.changed(prev);
  }

  /** Esc / gamepad B on the top layer. */
  back(): void {
    const l = this.layers[this.layers.length - 1];
    if (!l) return;
    if (l.handle.back?.() === true) return;
    if (this.layers[this.layers.length - 1] === l) this.pop();
  }

  private mountLayer(id: ScreenId, mod: ScreenModule, params: unknown): HTMLElement {
    const prev = this.top();
    const root = document.createElement('div');
    root.className = 'fm-overlay on fm-screen';
    root.dataset.screen = id;
    root.dataset.uiLayer = '';
    this.host!.appendChild(root);
    const layer: Layer = { id, root, handle: {}, stopNav: () => {} };
    this.layers.push(layer);
    for (const l of this.layers) {
      // remember where the focus was on the layer we cover, to give it back when this one closes (B6)
      if (l !== layer && !l.root.hidden && l.root.contains(document.activeElement)) l.lastFocus = document.activeElement as HTMLElement;
      l.root.hidden = l !== layer;
    }
    const api: ScreenApi = {
      id,
      close: () => {
        if (this.layers.includes(layer)) this.remove(id);
      },
    };
    try {
      layer.handle = mod.mount(root, params, api) ?? {};
    } catch (err) {
      console.warn(`[screens] "${id}" failed to mount`, err);
    }
    layer.stopNav = focusNav(root, { back: () => this.back() });
    this.changed(prev);
    autoFocus(root);
    return root;
  }

  private removeTop(show: boolean): void {
    const l = this.layers.pop();
    if (!l) return;
    const prev = l.id;
    this.destroy(l);
    if (show) this.showTop();
    this.changed(prev);
  }

  private showTop(): void {
    const t = this.layers[this.layers.length - 1];
    for (const l of this.layers) l.root.hidden = l !== t;
    if (!t) return;
    const back = t.lastFocus;
    t.lastFocus = undefined;
    if (back?.isConnected && !(back as HTMLButtonElement).disabled && !keyboardless()) back.focus({ preventScroll: true });
    else autoFocus(t.root);
  }

  private destroy(l: Layer): void {
    l.stopNav();
    try {
      l.handle.unmount?.();
    } catch (err) {
      console.warn(`[screens] "${l.id}" failed to unmount`, err);
    }
    l.root.remove();
  }

  private changed(prev: ScreenId | null): void {
    const top = this.top();
    for (const fn of this.listeners.slice()) {
      try {
        fn(top, prev);
      } catch (err) {
        console.warn('[screens] listener failed', err);
      }
    }
  }
}

export const screens = new ScreenStack();

function keyboardless(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}

/**
 * B5: a layer that opens with nothing focused (Garage, Awards, Stats, Settings, How to play, Tracks…) focuses its
 * first control two frames later, unless the screen already focused one itself. Never on touch (no focus ring).
 */
function autoFocus(root: HTMLElement): void {
  if (typeof requestAnimationFrame === 'undefined' || keyboardless()) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!root.isConnected || root.hidden || root.contains(document.activeElement)) return;
      const a = document.activeElement as HTMLElement | null;
      // a dialog over the screens (kit modal, maker) owns the focus
      if (a && a !== document.body && a.closest('[data-ui-layer]:not(.fm-screen)') && !root.contains(a)) return;
      const els = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]')].filter(
        (el) => el.getClientRects().length > 0 && el.dataset.act !== 'back' && el.dataset.act !== 'head-back' && el.getAttribute('aria-disabled') !== 'true',
      );
      (els.find((el) => el.classList.contains('primary')) ?? els[0])?.focus({ preventScroll: true });
    }),
  );
}
