/**
 * "Your cards" drawer (lobby spec §3b), its own lazy chunk: `import('../ui/deck/deck')`. Every owned Token Tails cat
 * is a card skin every champion can wear; the drawer shows them as real Token Tails cards and wears one on the lobby
 * hero. Looks only: a card never changes a number (render/skins is never sim input).
 *
 * A modal dialog (aria-modal, focus trap, Esc and the scrim close it, focus returns to the opener). The cards are a
 * roving-tabindex row: arrows move, Home / End jump, Enter or Space wears. Desktop: a drawer from the right; short
 * landscape phones: a bottom sheet (deck.css). Wearing a card flies a copy of it toward the hero (reduced motion: a
 * short fade instead).
 *
 * Guests and accounts with no cats see the shelter champions' real cards and how to get their own (empty.ts); the
 * game never invents a card, a price or a buy button.
 */
import type { HeroId } from '../../sim/api';
import { ELEMENT_NAME } from '../../meta/roster';
import { cardFxPreview } from '../cardFxView';
import { HERO_TEXT } from '../heroText';
import { bondLine, classicCard, deckCard, esc, RUNG_NAME, type DeckCard } from './deckCard';
import { emptyCard, postcards, type EmptyCtx, type Postcard } from './empty';
import './deck.css';

export type { DeckCard } from './deckCard';
export type { Postcard } from './empty';

export interface DeckOpts extends EmptyCtx {
  hero: HeroId;
  /** The worn card skin id (`cat.<id>`), or null for the hero's own look. */
  current: string | null;
  /** Owned cards, best first (registry ownedSkins() order). */
  owned: readonly DeckCard[];
  /** Up to two locked featured cards (web, from session 2; Preview only). */
  locked?: readonly DeckCard[];
  /** The shelter champions' card art for the empty state. */
  postcards?: readonly Postcard[];
  /** The hero's portrait in its Classic look (the Classic card). */
  classicPortrait?: string | null;
  /** Wear a card (null = Classic). The app saves it and redraws the hero. */
  onEquip(id: string | null): void;
  /** Spin a locked card on the turntable; false when the previews are used up. */
  onPreview?(id: string): boolean;
  /** An embedded guest asks to sign in. */
  onSignIn?(): void;
  /** A card came into view (its sprite probe may run). */
  onSeen?(id: string): void;
  onClose?(): void;
  /** Where a worn card flies to (the hero on the pedestal), viewport px; default the screen centre. */
  flyTo?(): { x: number; y: number } | null;
}

export interface DeckHandle {
  el: HTMLElement;
  close(): void;
  /** Redraw with new data (a probe landed, the roster changed); keeps the focused card. */
  update(o: Partial<Pick<DeckOpts, 'owned' | 'locked' | 'current' | 'classicPortrait' | 'signedIn'>>): void;
}

const reduced = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let open: DeckHandle | null = null;
/** The drawer on screen, if any. */
export const deckOpen = (): DeckHandle | null => open;

export function openDeck(parent: HTMLElement, opts: DeckOpts): DeckHandle {
  open?.close();
  const o: DeckOpts = { ...opts };
  const opener = (document.activeElement as HTMLElement | null) ?? null;
  const root = document.createElement('div');
  root.className = 'pl-deck';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'pl-deck-title');
  const title = HERO_TEXT[o.hero]?.title ?? 'your hero';
  root.innerHTML = `<div class="dk-scrim" data-a="deck-close"></div>
    <section class="dk-panel">
      <header class="dk-head">
        <div><h2 id="pl-deck-title">Your cards</h2><p class="dk-sub">Wear one on <b>${esc(title)}</b>. It takes the cat's name and look; stats stay the same.</p></div>
        <button type="button" class="dk-close" data-a="deck-close" aria-label="Close cards"><span aria-hidden="true">×</span></button>
      </header>
      <div class="dk-row" role="list" aria-label="Cards to wear on ${esc(title)}"></div>
      <footer class="dk-foot" aria-live="polite"></footer>
      <div class="dk-extra"></div>
    </section>`;
  const row = root.querySelector('.dk-row') as HTMLElement;
  const foot = root.querySelector('.dk-foot') as HTMLElement;
  const extra = root.querySelector('.dk-extra') as HTMLElement;
  let focusId: string | null = null;

  const all = (): DeckCard[] => [...o.owned, ...(o.locked ?? [])];
  const find = (id: string | null): DeckCard | undefined => (id ? all().find((k) => k.id === id) : undefined);

  const items = (): HTMLElement[] => [...row.querySelectorAll<HTMLElement>('.dk-card[data-coat], .dk-preview, .dk-cta')];
  const keyOf = (el: HTMLElement): string => el.dataset.coat ?? el.dataset.preview ?? 'cta';

  const detail = (id: string | null): void => {
    const k = find(id);
    if (!k) {
      foot.innerHTML = o.owned.length
        ? `<p class="dk-line"><b>${esc(`Classic ${title}`)}</b><small>The champion's own look and name.</small></p>`
        : `<p class="dk-line"><b>No cards yet</b><small>${esc(`${title} plays the same with or without a card.`)}</small></p>`;
      return;
    }
    const el = ELEMENT_NAME[k.element] ?? k.element;
    const sub = k.locked ? `${el} · ${RUNG_NAME[k.rung]} · not in your collection` : `${el} · ${RUNG_NAME[k.rung]} · ${bondLine(k)}`;
    foot.innerHTML = `<p class="dk-line"><b>${esc(k.name)}</b><small>${esc(sub)}</small></p>${k.locked ? '' : cardFxPreview({ name: k.name, rung: k.rung, ...(k.tint !== undefined ? { tint: k.tint } : {}) })}`;
  };

  const roving = (target: HTMLElement | null, focus: boolean): void => {
    const list = items();
    if (!list.length) return;
    const t = target && list.includes(target) ? target : list[0];
    for (const el of list) el.tabIndex = el === t ? 0 : -1;
    focusId = keyOf(t);
    if (focus) {
      t.focus({ preventScroll: true });
      t.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    }
    detail(t.dataset.coat || t.dataset.preview || null);
  };

  let io: IntersectionObserver | null = null;
  const watch = (): void => {
    io?.disconnect();
    if (!o.onSeen) return;
    const seen = (el: Element): void => {
      const id = (el as HTMLElement).dataset.coat || (el as HTMLElement).dataset.locked;
      if (id) o.onSeen?.(id);
    };
    const cards = row.querySelectorAll('.dk-card[data-coat], .dk-card[data-locked]');
    if (typeof IntersectionObserver !== 'function') return cards.forEach(seen);
    io = new IntersectionObserver((list) => {
      for (const en of list) if (en.isIntersecting) seen(en.target);
    });
    cards.forEach((c) => io?.observe(c));
  };

  const render = (focus: boolean): void => {
    const cur = o.current;
    const cards = o.owned.map((k) => deckCard(k, o.hero, k.id === cur)).join('');
    const locked = (o.locked ?? []).map((k) => deckCard({ ...k, locked: true }, o.hero, false)).join('');
    const none = !o.owned.length;
    row.innerHTML = `${classicCard(o.hero, !cur || !find(cur), o.classicPortrait)}${cards}${none ? emptyCard(o) : ''}${locked}`;
    root.classList.toggle('empty', none);
    extra.innerHTML = none ? postcards(o.postcards ?? []) : '';
    const want = focusId === null ? (cur ?? '') : focusId;
    const target = items().find((el) => keyOf(el) === want) ?? null;
    roving(target, focus);
    watch();
  };

  /** True when a flight started (the hero rebuild then waits a frame, so the flight is on the compositor first). */
  const fly = (from: HTMLElement): boolean => {
    if (reduced()) {
      from.classList.add('dk-flash');
      setTimeout(() => from.classList.remove('dk-flash'), 500);
      return false;
    }
    const r = from.getBoundingClientRect();
    if (!r.width) return false;
    const to = o.flyTo?.() ?? { x: innerWidth * 0.5, y: innerHeight * 0.45 };
    const ghost = from.cloneNode(true) as HTMLElement;
    ghost.classList.add('dk-ghost');
    ghost.removeAttribute('data-coat');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.tabIndex = -1;
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    // inside the dialog (its card styles apply), fixed to the viewport; the Web Animations API, so a busy frame (the
    // hero's rig rebuilding) cannot swallow the start of a CSS transition
    root.appendChild(ghost);
    const dx = to.x - (r.left + r.width / 2);
    const dy = to.y - (r.top + r.height / 2);
    if (typeof ghost.animate !== 'function') {
      ghost.remove();
      return false;
    }
    const a = ghost.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7 - 30}px) scale(0.6) rotate(-5deg)`, opacity: 0.9, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(-8deg)`, opacity: 0 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' },
    );
    a.finished.then(() => ghost.remove(), () => ghost.remove());
    return true;
  };

  const equip = (btn: HTMLElement): void => {
    const id = btn.dataset.coat || null;
    const same = (id ?? null) === (o.current && find(o.current) ? o.current : null);
    focusId = btn.dataset.coat ?? '';
    if (!same) {
      o.current = id;
      // the hero's rig rebuild is heavy on a slow GPU: two frames later, once the flight has started
      if (fly(btn)) requestAnimationFrame(() => requestAnimationFrame(() => o.onEquip(id)));
      else o.onEquip(id);
    }
    render(true);
  };

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-a="deck-close"]')) return void handle.close();
    const pv = t.closest<HTMLElement>('[data-preview]');
    if (pv) {
      const ok = o.onPreview?.(pv.dataset.preview as string) ?? false;
      pv.classList.add(ok ? 'playing' : 'spent');
      pv.textContent = ok ? 'Previewing' : 'Seen';
      return;
    }
    if (t.closest('[data-a="deck-sign-in"]')) return void o.onSignIn?.();
    const card = t.closest<HTMLElement>('.dk-card[data-coat]');
    if (card) equip(card);
  });
  // the footer follows the pointer too (hover reads a card without wearing it)
  row.addEventListener('pointerover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.dk-card');
    if (c) detail(c.dataset.coat || c.dataset.locked || null);
  });
  row.addEventListener('pointerleave', () => {
    const f = items().find((el) => el.tabIndex === 0);
    detail(f ? f.dataset.coat || f.dataset.preview || null : null);
  });
  row.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (items().includes(t)) roving(t, false);
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return void handle.close();
    }
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i >= 0 && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      e.preventDefault();
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
      roving(list[n], true);
      return;
    }
    if (e.key === 'Tab') {
      // focus trap: the close button and the row's current card
      const f = [root.querySelector<HTMLElement>('.dk-close'), list.find((el) => el.tabIndex === 0) ?? null].filter((x): x is HTMLElement => !!x);
      if (!f.length) return;
      const at = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
    // keys the lobby listens for (Enter = Play, C, H) never leak out of the dialog
    e.stopPropagation();
  });

  // a modal: focus that wanders out (a redraw under the drawer, a click on the page) comes back to the current card,
  // and Esc closes the drawer even when nothing inside it has focus
  const onDocFocus = (e: FocusEvent): void => {
    if (root.isConnected && !root.classList.contains('out') && e.target instanceof Node && !root.contains(e.target)) items().find((el) => el.tabIndex === 0)?.focus({ preventScroll: true });
  };
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !root.isConnected || root.contains(e.target as Node)) return;
    e.preventDefault();
    handle.close();
  };
  document.addEventListener('focusin', onDocFocus);
  document.addEventListener('keydown', onDocKey);

  const handle: DeckHandle = {
    el: root,
    close: () => {
      if (!root.isConnected || root.classList.contains('out')) return;
      document.removeEventListener('focusin', onDocFocus);
      document.removeEventListener('keydown', onDocKey);
      io?.disconnect();
      root.classList.add('out');
      const done = (): void => root.remove();
      if (reduced()) done();
      else setTimeout(done, 180);
      if (open === handle) open = null;
      // the opener may have been redrawn while the drawer was open (the pick screen's card row): its new copy
      // (integrate: the first one that is laid out; the pick screen draws the row twice and hides one per viewport)
      const back = opener?.isConnected ? opener : Array.from(document.querySelectorAll<HTMLElement>('[data-a="deck"], [data-a="cards"]')).find((n) => n.getClientRects().length > 0);
      back?.focus({ preventScroll: true });
      o.onClose?.();
    },
    update: (u) => {
      Object.assign(o, u);
      render(root.contains(document.activeElement));
    },
  };
  parent.appendChild(root);
  render(true);
  requestAnimationFrame(() => root.classList.add('in'));
  open = handle;
  return handle;
}
