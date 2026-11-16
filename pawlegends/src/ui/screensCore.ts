/**
 * gaps5 polish 8: the screen helpers the first load needs (the rotate prompt, the loading veil, the late Sunset second).
 * The rest of ui/screens.ts (the champion select, the results, the pause menu) is a lazy chunk.
 */
import * as TL from '../data/timeline';
import type { Difficulty } from '../sim/api';
import { icon } from './icons';

function el(cls: string, html = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** A fallback late Sunset second (10:00). The real one is per difficulty (`lateS`, data/timeline.ts TIMELINE_BY;
 *  Rookie 6:15, Easy 7:45, Normal and Hard 8:30): after it structures fall faster every minute, so a match time past it
 *  is no personal best to dare (Sudden Death's second until sim v31, the same numbers). */
export const LATE_S = 600;

/** The late Sunset second for a difficulty (data/timeline.ts, with the fun plan's per-difficulty overrides). */
export function lateS(difficulty: Difficulty): number {
  const by = (TL as unknown as { TIMELINE_BY?: Record<string, { late?: number }> }).TIMELINE_BY;
  const t = by?.[difficulty]?.late ?? TL.TIMELINE.late;
  return Math.floor(t / TL.TICK_HZ);
}

/** Portrait prompt on phones (§9: landscape only). Pure CSS decides when it shows. */
export function rotatePrompt(parent: HTMLElement): HTMLElement {
  const r = el('pl-rotate', `<div>${icon('paw')}<b>Turn your phone sideways</b><small>Paw Legends plays in landscape.</small></div>`);
  parent.appendChild(r);
  return r;
}

/** Loading veil between screens. */
/** GAPS A6: the loading screen's line for this hero: matches played on it. */
export interface VeilHero {
  name: string;
  /** Finished matches on this hero before this one. */
  matches: number;
}

export function loadingVeil(parent: HTMLElement, text: string, sub?: string, hero?: VeilHero | null): HTMLElement {
  const line = hero
    ? `<p class="hero-line" data-hero-matches="${hero.matches}"><span>${hero.matches === 0 ? `First match as ${esc(hero.name)}` : `${hero.matches} ${hero.matches === 1 ? 'match' : 'matches'} as ${esc(hero.name)}`}</span></p>`
    : '';
  const r = el('pl-loading', `<div class="spin">${icon('paw')}</div><b>${esc(text)}</b>${sub ? `<small class="squad">${esc(sub)}</small>` : ''}${line}`);
  parent.appendChild(r);
  return r;
}
