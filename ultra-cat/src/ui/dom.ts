// DOM helpers, modal stack and keyboard/arrow navigation for the menus. Owned by the META-UI lane.
import { initAudio } from '../audio/synth';
import { uiClick, uiMove } from '../audio/ui-sfx';
import { screens } from '../core/api';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Escape text for innerHTML templates. */
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Inline SVG icons (procedural, no files). */
export const ICON = {
  star: (on: boolean, cls = '') =>
    `<svg class="ico star ${on ? 'on' : 'off'} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.95 6.1 6.7.9-4.9 4.6 1.2 6.6L12 17.2l-5.95 3.2 1.2-6.6-4.9-4.6 6.7-.9z"/></svg>`,
  leaf: () =>
    `<svg class="ico leaf" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 3C10 3 4 8 4 15c0 2 .6 3.6 1.4 4.8L3.5 21.6l1 1 2-1.9C7.7 21.5 9.3 22 11 22c7 0 11-7 9-19zM8 18c2-4 5-7 9-9-3 3-6 6-9 9z"/></svg>`,
  lock: () =>
    `<svg class="ico lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0110 0v3h1.5a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 20.5v-9A1.5 1.5 0 015.5 10H7zm2.5 0h5V7a2.5 2.5 0 00-5 0v3z"/></svg>`,
  cog: () =>
    `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.5 7.5 0 000-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 00-1.7-1L15 3.2h-4l-.4 2.7a7.6 7.6 0 00-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 001.7 1l.4 2.7h4l.4-2.7a7.6 7.6 0 001.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" transform="translate(-1 0)"/></svg>`,
  pause: () => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5"/><rect x="14" y="4" width="5" height="16" rx="1.5"/></svg>`,
  back: () => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4L7 12l8.5 8 2-2-6.4-6 6.4-6z"/></svg>`,
  paw: () =>
    `<svg class="ico paw" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/><ellipse cx="5.2" cy="10" rx="2.1" ry="2.7"/><ellipse cx="9.2" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="14.8" cy="5.8" rx="2.1" ry="2.8"/><ellipse cx="18.8" cy="10" rx="2.1" ry="2.7"/></svg>`,
  check: () => `<svg class="ico check" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2L5.3 12l-2 2 6.2 6.2L21 8.7l-2-2z"/></svg>`,
};

/** A cat face in the cat's accent colour (cards and the map marker). */
export function catFace(color: string, eye = '#ffd24a', cls = ''): string {
  return `<svg class="face ${cls}" viewBox="0 0 64 56" aria-hidden="true">
    <path d="M8 22 L6 2 L24 14 Q32 11 40 14 L58 2 L56 22 Q60 30 58 38 Q52 54 32 54 Q12 54 6 38 Q4 30 8 22z" fill="${color}" stroke="#241a16" stroke-width="3" stroke-linejoin="round"/>
    <path d="M11 8 L20 14 L12 18z M53 8 L44 14 L52 18z" fill="#ffb3c7" opacity=".8"/>
    <ellipse cx="22" cy="31" rx="5.5" ry="6.5" fill="${eye}" stroke="#241a16" stroke-width="2"/><ellipse cx="42" cy="31" rx="5.5" ry="6.5" fill="${eye}" stroke="#241a16" stroke-width="2"/>
    <ellipse cx="22.6" cy="31.5" rx="1.8" ry="4.6" fill="#241a16"/><ellipse cx="42.6" cy="31.5" rx="1.8" ry="4.6" fill="#241a16"/>
    <path d="M29 40 L35 40 L32 43.5z" fill="#ff7aa0" stroke="#241a16" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M32 43.5 Q29 47.5 25 45.5 M32 43.5 Q35 47.5 39 45.5" fill="none" stroke="#241a16" stroke-width="2" stroke-linecap="round"/>
    <path d="M4 38 L16 39 M4 44 L16 42 M60 38 L48 39 M60 44 L48 42" stroke="#241a16" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`;
}

/** Click handler on a button that also unlocks audio and plays the click. */
export function onTap(el: HTMLElement, fn: (e: Event) => void, sound: (() => void) | null = uiClick): void {
  el.addEventListener('click', (e) => {
    initAudio();
    if (el.getAttribute('aria-disabled') !== 'true' && sound) sound();
    fn(e);
  });
}

// ---------- modals ----------
const modalStack: { el: HTMLElement; onClose?: () => void; returnFocus: Element | null }[] = [];

export function openModal(el: HTMLElement, onClose?: () => void): void {
  modalStack.push({ el, onClose, returnFocus: document.activeElement });
  el.classList.remove('hidden');
  document.body.classList.add('modal-open');
  focusFirst(el);
}

export function closeModal(): boolean {
  const m = modalStack.pop();
  if (!m) return false;
  m.el.classList.add('hidden');
  if (!modalStack.length) document.body.classList.remove('modal-open');
  m.onClose?.();
  if (m.returnFocus instanceof HTMLElement && document.contains(m.returnFocus)) m.returnFocus.focus({ preventScroll: true });
  return true;
}

export const modalOpen = () => modalStack.length > 0;
export const topModal = () => modalStack[modalStack.length - 1]?.el ?? null;

/** Where keyboard navigation happens right now: the top modal, else the current screen. */
export function navScope(): HTMLElement | null {
  const m = topModal();
  if (m) return m;
  const id = screens.current();
  return id ? document.getElementById(id) : null;
}

// ---------- focus and arrows ----------
function visible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>('button, input, [data-focus]')].filter((e) => !(e as HTMLButtonElement).disabled && visible(e));
}

/** Focus the scope's [data-primary] element (or its first focusable). */
export function focusFirst(scope: HTMLElement): void {
  const p = scope.querySelector<HTMLElement>('[data-primary]');
  const el = p && visible(p) ? p : focusables(scope)[0];
  el?.focus({ preventScroll: false });
}

/** Move focus to the nearest focusable in a direction (spatial navigation). */
export function moveFocus(dx: number, dy: number): void {
  const scope = navScope();
  if (!scope) return;
  const list = focusables(scope);
  if (!list.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !scope.contains(cur) || !list.includes(cur)) {
    focusFirst(scope);
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const vx = bx - ax;
    const vy = by - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus({ preventScroll: false });
    best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    uiMove();
  }
}

/** Count a number up with an ease-out; returns a cancel function. */
export function countUp(dur: number, step: (k: number) => void, done?: () => void): () => void {
  const t0 = performance.now();
  let raf = 0;
  let live = true;
  const f = () => {
    if (!live) return;
    const k = Math.min(1, (performance.now() - t0) / dur);
    step(1 - (1 - k) ** 3);
    if (k < 1) raf = requestAnimationFrame(f);
    else done?.();
  };
  f();
  return () => {
    live = false;
    cancelAnimationFrame(raf);
  };
}

/** Small toast at the bottom of the screen. */
export function toast(text: string, ms = 1800): void {
  const t = $('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  t.getAnimations().forEach((a) => a.cancel());
  t.animate(
    [
      { opacity: 0, transform: 'translate(-50%, 20px)' },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.12 },
      { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.85 },
      { opacity: 0, transform: 'translate(-50%, 10px)' },
    ],
    { duration: ms, easing: 'ease-out', fill: 'forwards' },
  );
}

/** Give an element a quick shake (denied action). */
export function wiggle(el: HTMLElement): void {
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 300 });
}
