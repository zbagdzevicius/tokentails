/**
 * In-match skill peek: hold your own skill button (the touch Q W E R, or the HUD slot with a mouse) for
 * PEEK.holdMs without dragging, and the skill's card shows over the play area: name, rank, what it does, the effect
 * tags and the main numbers at your level and talent picks. The game never pauses and the input is untouched (the
 * listeners are passive: a release still casts, a drag still aims). The card takes no pointer events, sits clear of
 * the thumb (above the button, toward the screen's middle), and goes PEEK.lingerMs after the release.
 *
 * This is a learning aid for a skill on cooldown or not learned yet (holding one does nothing else), and a quick
 * reminder mid-fight; the full card with the clip is the champion browser's.
 */
import './champBrowser.css';
import type { HeroId } from '../../data/heroes/types';
import { HERO_COLOR_CSS } from '../../render/palette';
import { HERO_TEXT } from '../heroText';
import { icon } from '../icons';
import { skillCard, type SkillSlot } from '../skillCodex';
import { isRangedHero } from '../../input/abilities';
import { esc, skillCardHtml } from './cardView';

export const PEEK = Object.freeze({ holdMs: 450, movePx: 18, lingerMs: 1800 });

export interface PeekState {
  level: number;
  choices: readonly number[];
  /** The level-6 shape branch is taken (its slot shows the branch ability's words). */
  branch: boolean;
}

/** The touch buttons (`data-b`) and the HUD slots (`data-i`) that are skills. */
const SLOT_OF_B: Readonly<Record<string, SkillSlot>> = { q: 'q', w: 'w', e: 'e', r: 'r' };
const SLOT_OF_I: Readonly<Record<string, SkillSlot>> = { 0: 'q', 1: 'w', 2: 'e', 3: 'r' };

export function slotOfButton(el: Element | null): { slot: SkillSlot; btn: HTMLElement } | null {
  const b = el?.closest<HTMLElement>('.pl-tbtn[data-b], .pl-slot[data-i]');
  if (!b) return null;
  const s = b.dataset.b !== undefined ? SLOT_OF_B[b.dataset.b] : SLOT_OF_I[b.dataset.i ?? ''];
  return s ? { slot: s, btn: b } : null;
}

/** The peek's markup for `hero`'s `slot` at the match state (the branch's own words when it replaced the slot). */
export function peekHtml(hero: HeroId, slot: SkillSlot, st: PeekState): string {
  const br = HERO_TEXT[hero].branch;
  const i = 'qwer'.indexOf(slot);
  if (st.branch && br && br.slot === i) {
    return `<header class="cb-card-head"><span class="cb-card-ico${slot === 'r' ? ' ult' : ''}" aria-hidden="true">${icon(br.icon)}</span><span class="cb-card-name"><small class="cb-kind">Level 6 branch · ${'QWER'[i]}</small><b>${esc(br.name)}</b></span></header><p class="cb-what">${esc(br.text)}</p>`;
  }
  const card = skillCard(hero, slot, { level: st.level, choices: st.choices });
  return skillCardHtml(card, { compact: true, inMatch: true, ranged: isRangedHero(hero) });
}

/**
 * Attach the peek to the match UI root (it holds the touch cluster and the HUD). Returns the detach function.
 * `state()` is read when the card opens (the HUD's level and picks).
 */
export function attachSkillPeek(ui: HTMLElement, hero: HeroId, state: () => PeekState): () => void {
  const card = document.createElement('div');
  card.className = 'pl-skill-peek';
  card.setAttribute('role', 'status');
  card.style.setProperty('--hero', HERO_COLOR_CSS[hero]);
  ui.appendChild(card);
  let hold: { id: number; x: number; y: number; slot: SkillSlot; btn: HTMLElement; timer: ReturnType<typeof setTimeout> } | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const place = (btn: HTMLElement): void => {
    const r = btn.getBoundingClientRect();
    const box = ui.getBoundingClientRect();
    const w = card.offsetWidth || 260;
    const h = card.offsetHeight || 120;
    // above the button, pushed toward the middle (the thumb covers the button and what is right of it)
    const right = r.left + r.width / 2 > box.left + box.width / 2;
    let x = right ? r.left - box.left - w + r.width * 0.3 : r.right - box.left - r.width * 0.3;
    let y = r.top - box.top - h - 12;
    x = Math.max(8, Math.min(box.width - w - 8, x));
    if (y < 8) y = Math.max(8, Math.min(box.height - h - 8, r.top - box.top - h / 2));
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  };

  const show = (slot: SkillSlot, btn: HTMLElement): void => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    card.innerHTML = peekHtml(hero, slot, state());
    card.dataset.slot = slot;
    card.classList.add('on');
    ui.classList.add('pl-peeking');
    place(btn);
    if (typeof document !== 'undefined') document.documentElement.dataset.skillPeek = slot;
  };
  const hide = (after = 0): void => {
    if (hideTimer) clearTimeout(hideTimer);
    const go = (): void => {
      hideTimer = null;
      card.classList.remove('on');
      ui.classList.remove('pl-peeking');
      if (typeof document !== 'undefined') delete document.documentElement.dataset.skillPeek;
    };
    if (after > 0) hideTimer = setTimeout(go, after);
    else go();
  };
  const cancel = (): void => {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  };

  const onDown = (e: PointerEvent): void => {
    const hit = slotOfButton(e.target as Element);
    if (!hit) return;
    cancel();
    const h = { id: e.pointerId, x: e.clientX, y: e.clientY, slot: hit.slot, btn: hit.btn, timer: setTimeout(() => show(h.slot, h.btn), PEEK.holdMs) };
    hold = h;
  };
  const onMove = (e: PointerEvent): void => {
    if (!hold || e.pointerId !== hold.id) return;
    if (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > PEEK.movePx) {
      // a drag is an aim: no card (and one that showed goes at once)
      cancel();
      if (card.classList.contains('on')) hide();
    }
  };
  const onUp = (e: PointerEvent): void => {
    if (!hold || e.pointerId !== hold.id) return;
    cancel();
    if (card.classList.contains('on')) hide(PEEK.lingerMs);
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  ui.addEventListener('pointerdown', onDown, opts);
  window.addEventListener('pointermove', onMove, opts);
  window.addEventListener('pointerup', onUp, opts);
  window.addEventListener('pointercancel', onUp, opts);
  return () => {
    cancel();
    if (hideTimer) clearTimeout(hideTimer);
    ui.removeEventListener('pointerdown', onDown, opts);
    window.removeEventListener('pointermove', onMove, opts);
    window.removeEventListener('pointerup', onUp, opts);
    window.removeEventListener('pointercancel', onUp, opts);
    card.remove();
    ui.classList.remove('pl-peeking');
    if (typeof document !== 'undefined') delete document.documentElement.dataset.skillPeek;
  };
}
