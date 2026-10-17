/**
 * Shared bits for the meta screens (W2-META): a mount scope that tracks every document/window listener so unmount
 * removes nodes AND listeners, the scrapbook header with a back button, stamps, empty states and tiny formatters.
 * Pure DOM; nothing touches `window` or `document` at module top level.
 */
import type { CosmeticDef, CosmeticSlot, RoomTheme } from '../types';
import { btn, h } from '../ui/dom';

export interface Scope {
  /** Adds a listener that is removed on unmount. */
  on<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void): void;
  /** Runs `fn` on unmount (timers, promises that must not write after unmount). */
  defer(fn: () => void): void;
  /** True after unmount: async callbacks check it before touching the DOM. */
  readonly dead: boolean;
  /** Mounts `root` into `host`, focuses the first heading and returns the idempotent unmount. */
  mount(host: HTMLElement, root: HTMLElement): () => void;
}

export function scope(): Scope {
  const offs: (() => void)[] = [];
  let dead = false;
  return {
    on(target, type, fn) {
      const l = fn as EventListener;
      target.addEventListener(type, l);
      offs.push(() => target.removeEventListener(type, l));
    },
    defer(fn) {
      offs.push(fn);
    },
    get dead() {
      return dead;
    },
    mount(host, root) {
      host.appendChild(root);
      const head = root.querySelector<HTMLElement>('[data-focus]');
      try {
        head?.focus({ preventScroll: true });
      } catch {
        /* focus is a nicety */
      }
      return () => {
        if (dead) return;
        dead = true;
        for (const off of offs.splice(0)) {
          try {
            off();
          } catch {
            /* keep unmounting */
          }
        }
        root.remove();
      };
    },
  };
}

/** Escape = back (keyboard), ignored while typing in a field. */
export function escapeTo(s: Scope, fn: () => void): void {
  if (typeof document === 'undefined') return;
  s.on(document, 'keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    fn();
  });
}

/** Scrapbook header: back button, title (focus target), optional kicker doodle. */
export function header(title: string, onBack: () => void, kicker?: string, backLabel = 'Back'): HTMLElement {
  const back = btn(`‹ ${backLabel}`, onBack, 'bc-link bmt-back');
  back.setAttribute('aria-label', backLabel);
  return h(
    'header',
    { class: 'bc-head bmt-head' },
    back,
    h('div', { class: 'bmt-head-txt' }, kicker ? h('div', { class: 'bc-kicker bmt-kicker' }, kicker) : null, h('h2', { tabindex: -1, 'data-focus': true }, title)),
  );
}

export function screen(cls: string, ...children: (Node | null | false | undefined)[]): HTMLElement {
  return h('div', { class: `bc-screen bmt ${cls}` }, ...children);
}

/** "No crimes yet. Suspicious." with a doodle. */
export function empty(doodle: string, line: string, sub?: string): HTMLElement {
  return h(
    'div',
    { class: 'bmt-empty', role: 'status' },
    h('div', { class: 'bmt-empty-doodle', 'aria-hidden': 'true' }, doodle),
    h('p', { class: 'bmt-empty-line' }, line),
    sub ? h('p', { class: 'bc-muted bc-small' }, sub) : null,
  );
}

/** A rubber stamp (rotated ink box). */
export function stamp(text: string, tone: 'red' | 'gold' | 'blue' | 'green' | 'ink' = 'red', cls = ''): HTMLElement {
  return h('span', { class: `bmt-stamp bmt-stamp-${tone}${cls ? ` ${cls}` : ''}` }, text);
}

export function chip(text: string, cls = ''): HTMLElement {
  return h('span', { class: `bmt-chip${cls ? ` ${cls}` : ''}` }, text);
}

export const fmt = (n: number): string => {
  const v = Math.trunc(Number.isFinite(n) ? n : 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `-${s}` : s;
};

export const plural = (n: number, one: string, many = `${one}s`): string => `${fmt(n)} ${n === 1 ? one : many}`;

/** "Wine glass" -> "wine glasses", "Framed the Roomba" stays a phrase (handled by the caller). */
export function pluralNoun(name: string, n: number): string {
  const w = name.trim().toLowerCase();
  if (n === 1 || !w) return w;
  if (/(s|x|z|ch|sh)$/.test(w)) return `${w}es`;
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
}

export const hex = (c: number | undefined, fallback = '#ffd27a'): string =>
  typeof c === 'number' && Number.isFinite(c) ? `#${(c & 0xffffff).toString(16).padStart(6, '0')}` : fallback;

/** Deterministic colour for a cat code (the codec is not imported here; the dot only has to be stable). */
export function colourFor(code: string): string {
  let x = 2166136261;
  for (let i = 0; i < code.length; i++) x = Math.imul(x ^ code.charCodeAt(i), 16777619) >>> 0;
  return `hsl(${x % 360}, 70%, 62%)`;
}

export const SLOT_ICON: Readonly<Record<CosmeticSlot, string>> = { collar: '📿', hat: '🎩', trail: '✨', caption: '💬', stamp: '🔖' };

export function cosmeticChip(c: CosmeticDef | undefined, title?: string): HTMLElement {
  if (!c) return h('span', { class: 'bmt-cos bmt-cos-title' }, h('span', { class: 'bmt-cos-ico', 'aria-hidden': 'true' }, '🏷️'), h('span', {}, title || 'Bragging rights'));
  const sw = h('span', { class: 'bmt-cos-sw', 'aria-hidden': 'true' });
  sw.style.background = hex(c.color, 'linear-gradient(135deg,#ffd27a,#ff6f91)');
  return h('span', { class: `bmt-cos bmt-cos-${c.slot}` }, sw, h('span', { class: 'bmt-cos-ico', 'aria-hidden': 'true' }, SLOT_ICON[c.slot]), h('span', { class: 'bmt-cos-name' }, c.name));
}

export const THEME_LABEL: Readonly<Record<RoomTheme, string>> = {
  default: 'House',
  xmas: '🎄 Christmas',
  birthday: '🎂 Birthday',
  wedding: '💍 Wedding',
  nye: '🎆 New Year',
  valentine: '💘 Valentine',
  thanksgiving: '🦃 Thanksgiving',
  spring: '🌷 Spring',
};

/** 0 none, 1 bronze, 2 silver, 3 gold (GDD 4.5; same rule as progress.parPaws, kept local: meta imports only types/dom). */
export function parPaws(score: number, par?: { bronze: number; silver: number; gold: number }): 0 | 1 | 2 | 3 {
  if (!par || !(score > 0)) return 0;
  if (score >= par.gold) return 3;
  if (score >= par.silver) return 2;
  if (score >= par.bronze) return 1;
  return 0;
}

export function pawsEl(n: 0 | 1 | 2 | 3): HTMLElement {
  const names = ['no paws yet', 'bronze paw', 'silver paw', 'gold paw'];
  const el = h('span', { class: `bmt-paws bmt-paws-${n}`, title: names[n], 'aria-label': names[n] });
  for (let i = 1; i <= 3; i++) el.append(h('span', { class: `bmt-paw${i <= n ? ' is-on' : ''}`, 'aria-hidden': 'true' }, '🐾'));
  return el;
}

export function dateLabel(ymd: string | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? '';
  return `${month} ${d}${y ? `, ${y}` : ''}`;
}
