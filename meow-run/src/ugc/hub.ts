// UGC hub (INTEGRATOR-owned, frozen for the lanes): buttons in the four menu slots, full screens, overlays and toasts.
// Lanes never edit index.html or src/ui/flow.ts; they add their UI through these calls and style it from their own
// CSS file (import './x.css' from TS). Slots are the rows index.html reserves:
//   #ugc-title (under PLAY), #ugc-select (under the stage map), #ugc-pause (pause card), #ugc-results (results card).
// Screens: addScreen(id) makes <section id=id class="screen ui"> shown while body[data-screen=id] (setScreen(id)).
export type Slot = 'title' | 'select' | 'pause' | 'results';
export type UgcScreen = 'wardrobe' | 'photo' | 'trails' | 'clip' | 'share';

export interface HubButton {
  /** element id (shots click it), e.g. 'ugcClip' */
  id: string;
  slot: Slot;
  label: string;
  /** inline SVG markup (procedural, no files) */
  icon?: string;
  /** lower first; see ITERATION2.md for each lane's numbers */
  order?: number;
  tone?: '' | 'alt' | 'green' | 'gold';
  /** re-checked every time the slot's screen shows (default: always visible) */
  visible?(): boolean;
  /** a small pill on the button ('NEW', '3'); null = none */
  badge?(): string | null;
  onClick(): void;
}

const SLOT_SCREEN: Record<Slot, string> = { title: 'title', select: 'select', pause: 'pause', results: 'results' };
const buttons: { spec: HubButton; el: HTMLButtonElement }[] = [];
const screenListeners: ((s: string) => void)[] = [];
let styleEl: HTMLStyleElement | null = null;

function ensureStyle(): HTMLStyleElement {
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ugc-screens';
    document.head.appendChild(styleEl);
  }
  return styleEl;
}

/** Add a button to a slot. Returns the element (already in the DOM). */
export function addButton(spec: HubButton): HTMLButtonElement {
  const host = document.getElementById(`ugc-${spec.slot}`);
  const el = document.createElement('button');
  el.id = spec.id;
  el.type = 'button';
  el.className = `btn small${spec.tone ? ` ${spec.tone}` : ''}`;
  el.dataset.order = String(spec.order ?? 50);
  el.innerHTML = `${spec.icon ? `<span class="ugc-ico">${spec.icon}</span>` : ''}<span class="ugc-lbl"></span><span class="ugc-badge hidden"></span>`;
  (el.querySelector('.ugc-lbl') as HTMLElement).textContent = spec.label;
  el.addEventListener('click', () => {
    try {
      spec.onClick();
    } catch (err) {
      console.error(`ugc button ${spec.id} failed`, err);
    }
  });
  if (host) {
    const after = [...host.children].find((c) => Number((c as HTMLElement).dataset.order ?? 50) > (spec.order ?? 50));
    host.insertBefore(el, after ?? null);
  }
  buttons.push({ spec, el });
  refreshOne(spec, el);
  return el;
}

function refreshOne(spec: HubButton, el: HTMLButtonElement): void {
  let vis = true;
  try {
    vis = spec.visible ? spec.visible() : true;
  } catch {
    vis = false;
  }
  el.classList.toggle('hidden', !vis);
  const b = el.querySelector('.ugc-badge') as HTMLElement;
  let text: string | null = null;
  try {
    text = spec.badge ? spec.badge() : null;
  } catch {
    text = null;
  }
  b.textContent = text ?? '';
  b.classList.toggle('hidden', !text);
}

/** Re-check visible() and badge() (all slots, or one). The hub does it on every screen change. */
export function refreshHub(slot?: Slot): void {
  for (const { spec, el } of buttons) if (!slot || spec.slot === slot) refreshOne(spec, el);
}

/** A full screen for the lane (hidden until setScreen(id)). Call once; returns the section. */
export function addScreen(id: UgcScreen, opts: { dim?: boolean } = {}): HTMLElement {
  const existing = document.getElementById(id);
  if (existing) return existing;
  const sec = document.createElement('section');
  sec.id = id;
  sec.className = `screen ui ugc-screen${opts.dim ? ' dim' : ''}`;
  const fade = document.getElementById('fade');
  document.body.insertBefore(sec, fade);
  ensureStyle().textContent += `body[data-screen="${id}"] #${id} { display: flex; }\n`;
  return sec;
}

/**
 * A modal overlay above any screen (name entry, share sheet, clip progress). It is a .ui element (touch gestures
 * ignore it). close() removes it.
 */
export function openOverlay(className = ''): { el: HTMLElement; close(): void } {
  const el = document.createElement('div');
  el.className = `ugc-overlay ui ${className}`.trim();
  document.body.appendChild(el);
  // a toast already up moves to the bottom so it never covers the overlay's header
  document.getElementById('ugc-toast')?.classList.add('bottom');
  return { el, close: () => el.remove() };
}

let toastT = 0;
let toastOn = '';
let toastAt = 0;
/** an overlay (share sheet, clip sheet, name entry) is open: toasts move to the bottom so no modal header is covered */
const overlayOpen = (): boolean => !!document.querySelector('.ugc-overlay');
/** A short message at the top of the screen ("Link copied!"); at the bottom while an overlay is open. It is cleared
 *  when play starts, or when the screen it was raised on is left. */
export function toast(text: string, ms = 1800): void {
  let el = document.getElementById('ugc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ugc-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.toggle('bottom', overlayOpen());
  el.classList.add('on');
  toastOn = document.body.dataset.screen ?? '';
  toastAt = performance.now();
  clearTimeout(toastT);
  toastT = window.setTimeout(() => el!.classList.remove('on'), ms);
}
function hideToast(): void {
  clearTimeout(toastT);
  document.getElementById('ugc-toast')?.classList.remove('on');
}

/** Called by flow.setScreen (and nothing else). */
export function screenChanged(s: string): void {
  // a toast never rides into gameplay or onto a screen it was not raised for (one raised just before the change is
  // meant for the new screen)
  if (s === 'play' || s === 'pause' || (s !== toastOn && performance.now() - toastAt > 200)) hideToast();
  for (const slot of Object.keys(SLOT_SCREEN) as Slot[]) if (SLOT_SCREEN[slot] === s) refreshHub(slot);
  for (let i = 0; i < screenListeners.length; i++) {
    try {
      screenListeners[i](s);
    } catch (err) {
      console.error('ugc screen listener failed', err);
    }
  }
}
/** Listen to screen changes (body[data-screen]). Returns an unsubscribe. */
export function onScreen(fn: (s: string) => void): () => void {
  screenListeners.push(fn);
  return () => {
    const i = screenListeners.indexOf(fn);
    if (i >= 0) screenListeners.splice(i, 1);
  };
}
