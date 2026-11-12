/**
 * The Treat Track and Legends Pass "storybook" shell (brandbook v1 Hearth Storybook, docs/plans/moba/STORE-PASS.md §6):
 * gilded bookmark-ribbon tabs, the round gold-ringed close button Home uses, and the keyboard model shared by the two
 * tabs (Left/Right/Home/End move between the tabs and open the other one; Esc stays with each panel). Markup and
 * look only: what the tabs open, claim and buy lives in collection.ts and passPanel.ts.
 *
 * Art (Gemini, no text or logo in any image): public/assets/pass/*.webp, drawn from CSS so the Low quality tier can
 * swap in the smaller "-lo" files.
 */
import type { HeroId } from '../sim/api';
import { CAT_HEROES, SHELTER_HEROES } from '../render/cosmetics';
import type { IconId } from './heroText';
import { icon } from './icons';
import './passBook.css';

export type BookTab = 'track' | 'pass';

const TABS: readonly { id: BookTab; label: string; icon: IconId }[] = [
  { id: 'track', label: 'Treat Track', icon: 'paw' },
  { id: 'pass', label: 'Legends Pass', icon: 'crown' },
];

/** The two ribbon tabs (`data-a` is the other tab's action, as before: "pass" on the Treat Track, "track" on the Pass). */
export function bookTabs(active: BookTab, label: string): string {
  return `<div class="bk-tabs" role="tablist" aria-label="${label}">${TABS.map((t) => {
    const on = t.id === active;
    return `<button type="button" role="tab" class="bk-tab${on ? ' on' : ''}"${on ? '' : ` data-a="${t.id}"`} aria-selected="${on}" tabindex="${on ? 0 : -1}"><span class="bk-ti" aria-hidden="true">${icon(t.icon)}</span>${t.label}</button>`;
  }).join('')}</div>`;
}

/** The corner close button (Home's round gold ring), a direct child of the card. */
export const bookClose = (what: string): string => `<button type="button" class="pl-x bk-x" data-a="x" aria-label="Close the ${what}">${X_SVG}</button>`;

const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
/** A small padlock (locked tiles and postcards). */
export const LOCK_SVG = '<svg class="bk-lock" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1.5v11h-13V10zm2.5 0h5V8a2.5 2.5 0 0 0-5 0z"/></svg>';
/** A tick (claimed). */
export const TICK_SVG = '<svg class="bk-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Arrow keys on a tab open the other tab (there are two, so every arrow goes to "the other one"); the caller's click
 * handler does the switch, so keyboard and pointer share one path.
 */
export function wireTabs(root: HTMLElement): void {
  root.addEventListener('keydown', (e) => {
    const tab = (e.target as HTMLElement).closest?.('[role="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const other = root.querySelector<HTMLElement>('[role="tab"][aria-selected="false"]');
    if (!other) return;
    const before = TABS.findIndex((t) => other.dataset.a === t.id) === 0;
    if ((e.key === 'Home' && !before) || (e.key === 'End' && before)) return;
    e.preventDefault();
    other.click();
  });
}

/** Focus the selected tab once the panel is on screen (dialog focus; a keyboard tab switch keeps its place). */
export function focusTab(root: HTMLElement): void {
  const go = (): void => {
    if (!root.isConnected || root.contains(document.activeElement)) return;
    (root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? root.querySelector<HTMLElement>('.bk-x'))?.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
  else go();
}

/** Cats first, then dogs (the target chooser's two groups). Shelter champions are cats. */
export const isCat = (h: HeroId): boolean => CAT_HEROES.includes(h) || SHELTER_HEROES.includes(h);

/** A 0xRRGGBB palette number as a CSS colour. */
export const hex = (n: number): string => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
