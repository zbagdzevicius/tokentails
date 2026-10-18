/**
 * Token Tails cat cards in the game (integration plan §3.6): the "Your squad" strip on pick, progress badges, the
 * "Save your wins" button and the Meet card on the title (lobby), and on results the save chip with the catnip
 * count-up, the "New fastest!" stamp, the companion card flip and the featured guest card.
 *
 * Pure DOM builders: every function takes a view model and callbacks and returns an element; embed/integrate.ts
 * owns the state and mounts them into `[data-slot]`. Names and art URLs go in through textContent and properties,
 * never innerHTML. Copy rules (docs/CLAIMS.md): no price, no money, shelter or impact words, no pack visuals. The
 * price lives only on the host's own sheet.
 */
import type { FeaturedCat, Progress, SaveResult } from '../embed/bridge';
import { LEVEL_CATNIP, PROGRESS_LEVELS, type ProgressLevel } from '../embed/bridge';
import { ELEMENT_NAME, type Element } from '../meta/roster';
import { ELEMENT_COLOR } from '../render/cosmetics';
import { icon } from './icons';
import './cards.css';

const LEVEL_NAME: Readonly<Record<ProgressLevel, string>> = Object.freeze({ easy: 'Easy', normal: 'Normal', rookie: 'Rookie' });
const TICK_HZ = 30;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const isElement = (v: string): v is Element => v in ELEMENT_NAME;
export const elementName = (v: string): string => (isElement(v) ? ELEMENT_NAME[v] : 'Mystery');
export const elementColor = (v: string): string => (isElement(v) ? hex(ELEMENT_COLOR[v]) : '#ffd34d');

/** "4:12" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface CardCat {
  name: string;
  type: string;
  art?: string;
  /** Small ribbon in the corner ("Guest", "New!"). */
  ribbon?: string;
}

/**
 * One cat card: art (or an element-tinted paw when there is none or it fails to load), the name and the element.
 * `opts.flip` starts it face down and flips it in after `delay` ms.
 */
export function catCard(c: CardCat, opts: { flip?: boolean; delay?: number; guest?: boolean; small?: boolean } = {}): HTMLElement {
  const card = h('div', `plc-card${opts.guest ? ' guest' : ''}${opts.small ? ' small' : ''}${opts.flip ? ' flip' : ''}`);
  card.dataset.el = c.type;
  card.style.setProperty('--el', elementColor(c.type));
  const inner = h('div', 'plc-card-in');
  const front = h('div', 'plc-face front');
  const art = h('div', 'plc-art');
  const paw = h('span', 'plc-paw');
  paw.innerHTML = icon('paw');
  art.appendChild(paw);
  if (c.art) {
    const img = h('img');
    img.alt = c.name;
    img.decoding = 'async';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    img.addEventListener('load', () => art.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
    img.src = c.art;
    art.appendChild(img);
  }
  front.appendChild(art);
  front.appendChild(h('b', 'plc-name', c.name));
  front.appendChild(h('small', 'plc-el', `${elementName(c.type)} chroma`));
  front.appendChild(h('i', 'plc-shine'));
  if (c.ribbon) front.appendChild(h('span', 'plc-ribbon', c.ribbon));
  const back = h('div', 'plc-face back');
  back.innerHTML = icon('paw');
  inner.append(front, back);
  card.appendChild(inner);
  if (opts.flip) {
    const go = (): void => card.classList.add('in');
    if (opts.delay) setTimeout(go, opts.delay);
    else requestAnimationFrame(go);
  }
  // a little tilt toward the pointer (desktop): a card should feel like a card
  card.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = card.getBoundingClientRect();
    if (!r.width) return;
    card.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
    card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
  });
  card.addEventListener('pointerleave', () => {
    card.style.removeProperty('--rx');
    card.style.removeProperty('--ry');
  });
  return card;
}

// ------------------------------------------------------------------------------------------------- title

export interface LevelBadge {
  level: ProgressLevel;
  /** Catnip earned on this level (null = unknown: a guest). */
  catnip: number | null;
  /** Fastest win in seconds, or null. */
  fastest: number | null;
}

/** Per-level badges from the account progress (signed in) or the local profile (guest). Pure. */
export function levelBadges(progress: Progress | null, localFastest: Partial<Record<ProgressLevel, number>>): LevelBadge[] {
  return PROGRESS_LEVELS.map((level) => {
    const ticks = progress?.fastestWin[level] ?? 0;
    const server = ticks > 0 ? Math.max(1, Math.ceil(ticks / TICK_HZ)) : null;
    const local = localFastest[level] ?? null;
    const fastest = server !== null && local !== null ? Math.min(server, local) : (server ?? local);
    return { level, catnip: progress ? progress.catnip[level] : null, fastest };
  });
}

export function progressStrip(badges: readonly LevelBadge[]): HTMLElement {
  const row = h('div', 'plc-levels');
  for (const b of badges) {
    const won = b.fastest !== null || (b.catnip ?? 0) > 0;
    const chip = h('div', `plc-level${won ? ' won' : ''}`);
    chip.dataset.level = b.level;
    chip.appendChild(h('b', '', LEVEL_NAME[b.level]));
    if (won) {
      const line = [b.catnip ? `${b.catnip} catnip` : '', b.fastest !== null ? `best ${clock(b.fastest)}` : ''].filter(Boolean).join(' · ');
      chip.appendChild(h('small', '', line || 'won'));
    } else chip.appendChild(h('small', 'goal', `First win: +${LEVEL_CATNIP[b.level]} catnip`));
    row.appendChild(chip);
  }
  return row;
}

export interface MeetCardOpts {
  cat: FeaturedCat;
  /** Waiting for the host to open its sheet. */
  waiting?: boolean;
  onMeet(): void;
  onClose(): void;
}

/** The session's single offer: "Meet ‹name›". No price here (the host sheet shows it). */
export function meetCard(o: MeetCardOpts): HTMLElement {
  const root = h('div', 'plc-meet');
  root.dataset.offer = 'meet';
  root.dataset.catalog = o.cat.catalogId;
  const x = h('button', 'plc-x', '✕');
  x.setAttribute('aria-label', 'Close');
  x.dataset.a = 'meet-close';
  const body = h('div', 'plc-meet-body');
  body.appendChild(h('small', 'plc-kicker', 'A new squad mate?'));
  body.appendChild(h('b', 'plc-meet-name', o.cat.name));
  body.appendChild(h('p', 'plc-meet-line', `${elementName(o.cat.type)} cat. Walks with your waves and unlocks the ${elementName(o.cat.type)} chroma for every hero.`));
  const btn = h('button', 'pl-btn small plc-meet-go', o.waiting ? 'Opening...' : `Meet ${o.cat.name} ›`);
  btn.dataset.a = 'meet';
  btn.disabled = !!o.waiting;
  body.appendChild(btn);
  // say where the tap goes: an adoption on Token Tails, not a free in-game unlock (round 0)
  body.appendChild(h('small', 'plc-meet-where', 'Adopt on Token Tails'));
  root.append(x, catCard({ name: o.cat.name, type: o.cat.type, art: o.cat.art }, { small: true }), body);
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'meet') {
      e.stopPropagation();
      o.onMeet();
    } else if (a === 'meet-close') {
      e.stopPropagation();
      root.classList.add('out');
      setTimeout(() => root.remove(), 260);
      o.onClose();
    }
  });
  requestAnimationFrame(() => root.classList.add('in'));
  return root;
}

export function saveWinsButton(onClick: () => void, label = 'Save your wins'): HTMLElement {
  const b = h('button', 'pl-btn ghost small plc-save-wins');
  b.dataset.a = 'save-wins';
  b.innerHTML = icon('crown');
  b.appendChild(document.createTextNode(label));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export interface TitleCardsModel {
  badges: LevelBadge[];
  /** Show "Save your wins" (a host is there, the player is signed out and has played). */
  askSignIn: boolean;
  meet: Omit<MeetCardOpts, 'onClose'> | null;
  /** A cat just joined (after a purchase): a short celebration line. */
  joined?: string | null;
  /** Signed-in players' squad, read-only (not an offer, so session 1 may show it). */
  squad?: SquadMate[];
}

export function titleCards(m: TitleCardsModel, on: { signIn(): void; meetClosed(): void }): HTMLElement {
  const root = h('div', 'plc plc-title');
  if (m.joined) {
    const j = h('div', 'plc-joined');
    j.setAttribute('role', 'status');
    j.appendChild(h('b', '', 'New squad mate!'));
    j.appendChild(h('span', '', `${m.joined} walks with your waves from the next match.`));
    root.appendChild(j);
  }
  if (m.squad?.length) {
    const sq = h('div', 'plc-squad');
    sq.dataset.squad = m.squad.map((c) => c.name).join(',');
    sq.appendChild(h('small', '', 'Your squad'));
    for (const c of m.squad.slice(0, 2)) {
      const chip = h('span', 'plc-squad-cat', c.name);
      chip.style.setProperty('--el', elementColor(c.type));
      if (c.tier && c.tier !== 'COMMON') chip.dataset.tier = c.tier.toLowerCase();
      sq.appendChild(chip);
    }
    root.appendChild(sq);
  }
  if (m.badges.some((b) => b.fastest !== null || (b.catnip ?? 0) > 0) || m.askSignIn) root.appendChild(progressStrip(m.badges));
  if (m.askSignIn) root.appendChild(saveWinsButton(on.signIn));
  if (m.meet) root.appendChild(meetCard({ ...m.meet, onClose: on.meetClosed }));
  return root;
}

// -------------------------------------------------------------------------------------------------- pick

export interface SquadMate extends CardCat {
  id: string;
  tier?: string;
}

export interface PickCardsModel {
  squad: SquadMate[];
  /** Other owned cats: a tap swaps one into the squad (round 0: any owned cat can walk, chosen by the player). */
  bench?: SquadMate[];
  /** No cats of their own: a featured guest card shows what a squad mate looks like (display only). */
  guest: FeaturedCat | null;
  /** Signed out with a host: "Sign in to bring your cats". */
  askSignIn: boolean;
}

export function pickCards(m: PickCardsModel, on: { signIn(): void; choose?(id: string): void }): HTMLElement {
  const root = h('div', 'plc plc-pick');
  const head = h('div', 'plc-head');
  head.appendChild(h('b', '', 'Your squad'));
  head.appendChild(h('small', '', m.squad.length ? 'They walk with your waves and nap at the fountain.' : 'Your Token Tails cats walk with your waves.'));
  root.appendChild(head);
  const row = h('div', 'plc-row');
  m.squad.slice(0, 2).forEach((c, i) => row.appendChild(catCard(c, { flip: true, delay: 80 + i * 140, small: true })));
  if (!m.squad.length && m.guest) row.appendChild(catCard({ name: m.guest.name, type: m.guest.type, art: m.guest.art, ribbon: 'Guest' }, { guest: true, small: true }));
  if (row.childElementCount) root.appendChild(row);
  if (m.squad.length) {
    const trails = h('div', 'plc-trails');
    for (const c of m.squad.slice(0, 2)) {
      const sw = h('span', 'plc-swatch');
      sw.style.setProperty('--el', elementColor(c.type));
      sw.title = `${elementName(c.type)} chroma`;
      trails.appendChild(sw);
    }
    trails.appendChild(h('small', '', 'Chromas for every hero'));
    root.appendChild(trails);
  }
  if (m.bench?.length && on.choose) {
    const swap = h('div', 'plc-bench');
    swap.appendChild(h('small', '', 'Swap in:'));
    for (const c of m.bench.slice(0, 10)) {
      const b = h('button', 'plc-bench-cat', c.name);
      b.dataset.a = 'squad-swap';
      b.dataset.cat = c.id;
      b.style.setProperty('--el', elementColor(c.type));
      if (c.tier && c.tier !== 'COMMON') b.dataset.tier = c.tier.toLowerCase();
      b.title = `${elementName(c.type)} cat: walk with ${c.name}`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        on.choose?.(c.id);
      });
      swap.appendChild(b);
    }
    root.appendChild(swap);
  }
  if (!m.squad.length && m.askSignIn) root.appendChild(saveWinsButton(on.signIn, 'Sign in to bring your cats'));
  return root;
}

// ----------------------------------------------------------------------------------------------- results

export type ChipState = 'waiting' | 'local' | SaveResult['status'];

export interface SaveChipModel {
  state: ChipState;
  catnipPaid: number;
  catnipTotal: number | null;
  newFastest: boolean;
  /** Show "Save your wins" on a kept-on-device chip. */
  askSignIn: boolean;
}

const CHIP_TEXT: Readonly<Record<ChipState, string>> = Object.freeze({
  waiting: 'Saving your match...',
  saving: 'Saving your match...',
  saved: 'Saved to your account',
  queued: 'Kept on this device',
  local: 'Kept on this device',
  failed: 'Not saved yet. Trying again soon.',
  rejected: "This match didn't count",
});

/** Animate a number from 0 to `to` (ease out) into `el`. */
export function countUp(el: HTMLElement, to: number, ms = 900, prefix = '+'): void {
  const t0 = performance.now();
  const step = (now: number): void => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = `${prefix}${Math.round(to * (1 - Math.pow(1 - k, 3)))}`;
    if (k < 1) requestAnimationFrame(step);
    else el.classList.add('done');
  };
  el.textContent = `${prefix}0`;
  requestAnimationFrame(step);
}

export function saveChip(m: SaveChipModel, on: { signIn(): void }): HTMLElement {
  const root = h('div', `plc plc-save state-${m.state}`);
  root.dataset.save = m.state;
  root.setAttribute('role', 'status');
  const chip = h('div', 'plc-chip');
  const dot = h('i', 'plc-dot');
  chip.append(dot, h('span', '', CHIP_TEXT[m.state]));
  root.appendChild(chip);
  if (m.state === 'saved' && m.catnipPaid > 0) {
    const pop = h('div', 'plc-catnip');
    const n = h('b', 'plc-catnip-n', '+0');
    pop.append(n, h('span', '', 'catnip'));
    if (m.catnipTotal !== null) pop.appendChild(h('small', '', `${m.catnipTotal} total`));
    root.appendChild(pop);
    countUp(n, m.catnipPaid);
  }
  if (m.newFastest) root.appendChild(h('div', 'plc-stamp', 'New fastest!'));
  if (m.askSignIn && (m.state === 'queued' || m.state === 'local')) root.appendChild(saveWinsButton(on.signIn));
  return root;
}

export interface ResultsCardsModel {
  won: boolean;
  companion: SquadMate | null;
  guest: FeaturedCat | null;
  /** The live Meet offer on this screen (the guest card then gets its button). */
  meet: Omit<MeetCardOpts, 'onClose'> | null;
  notify: boolean;
}

export function resultsCards(m: ResultsCardsModel, on: { meetClosed(): void; notify(): void }): HTMLElement {
  const root = h('div', 'plc plc-results');
  const row = h('div', 'plc-row');
  if (m.companion) {
    const wrap = h('div', 'plc-with');
    wrap.appendChild(catCard(m.companion, { flip: true, delay: 600 }));
    wrap.appendChild(h('small', '', m.won ? `${m.companion.name} cheered the win` : `${m.companion.name} marched with you`));
    row.appendChild(wrap);
  }
  if (m.meet) row.appendChild(meetCard({ ...m.meet, onClose: on.meetClosed }));
  else if (m.guest && !m.companion) {
    const wrap = h('div', 'plc-with');
    wrap.appendChild(catCard({ name: m.guest.name, type: m.guest.type, art: m.guest.art, ribbon: 'Guest' }, { flip: true, delay: 600, guest: true }));
    wrap.appendChild(h('small', '', 'Token Tails cats can join your squad'));
    row.appendChild(wrap);
  }
  if (row.childElementCount) root.appendChild(row);
  if (m.notify) {
    const b = h('button', 'pl-btn ghost small plc-notify', 'Legends Pass: notify me');
    b.dataset.a = 'plc-notify';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      b.textContent = "You're on the list";
      b.disabled = true;
      on.notify();
    });
    root.appendChild(b);
  }
  return root;
}
