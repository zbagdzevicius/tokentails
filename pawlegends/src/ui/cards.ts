/**
 * The lobby and results slots (integration plan §3.6): progress badges, the "Save your wins" button and the shelter
 * champion's info panel on the title (lobby), and on results the save chip with Season XP and Yarn, the "New fastest!"
 * stamp and the notify button.
 *
 * Paw Legends stands on its own (docs/plans/moba/NO-TOKENTAILS.md, 2026-11-12): no cat cards, squad, Meet card or
 * catnip here. Pure DOM builders: every function takes a view model and callbacks and returns an element;
 * embed/integrate.ts owns the state and mounts them into `[data-slot]`. Names and art URLs go in through textContent
 * and properties, never innerHTML. Copy rules (docs/CLAIMS.md): no price, no money or impact words.
 */
import type { Progress, SaveResult } from '../embed/bridge';
import { PROGRESS_LEVELS, type ProgressLevel } from '../embed/bridge';
import { ELEMENT_NAME, type Element } from '../meta/roster';
import { ELEMENT_COLOR } from '../render/cosmetics';
import { icon } from './icons';
import './cards.css';

const LEVEL_NAME: Readonly<Record<ProgressLevel, string>> = Object.freeze({ easy: 'Easy', normal: 'Normal', rookie: 'Rookie', hard: 'Hard' });
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
  /** The line under the name (default "<Element> chroma"). */
  sub?: string;
  /** A tier frame the card shows (CSS `data-frame`). */
  frame?: string;
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
  front.appendChild(h('small', 'plc-el', c.sub ?? `${elementName(c.type)} chroma`));
  if (c.frame) card.dataset.frame = c.frame;
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
  /** Server reward count on this level (null = unknown: a guest); only read as "won", never shown. */
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
    // Rookie is match 1 only and never pickable later, so an unwon Rookie chip would be a goal nobody can reach (ftue-6)
    if (!won && b.level === 'rookie') continue;
    const chip = h('div', `plc-level${won ? ' won' : ''}`);
    chip.dataset.level = b.level;
    chip.appendChild(h('b', '', LEVEL_NAME[b.level]));
    // NO-TOKENTAILS.md (Your call 2): catnip is not a Paw Legends currency, so the chips show times and badges only
    if (won) chip.appendChild(h('small', '', b.fastest !== null ? `best ${clock(b.fastest)}` : 'won'));
    else chip.appendChild(h('small', 'goal', 'First win: badge'));
    row.appendChild(chip);
  }
  return row;
}

export interface ChampionInfoModel {
  /** The champion's in-game name (Raspberry). */
  name: string;
  /** The real Pink Paw cat's name in plain letters (Aviete); omitted when it is the same. */
  realName?: string;
  pronoun: 'he' | 'she';
  type: string;
  art?: string;
  flavour?: string;
}

/**
 * The lobby's champion info (sim v9): an "About <name>" chip that opens a panel with the champion's art and where the
 * champion comes from (a real Pink Paw shelter cat). Information only: nothing to buy. Never on pick, loading, in a
 * match or on results.
 */
export function championInfo(m: ChampionInfoModel): HTMLElement {
  const root = h('div', 'plc-champ');
  root.dataset.champion = m.name;
  const chip = h('button', 'pl-btn ghost small plc-champ-chip', `About ${m.name}`);
  chip.dataset.a = 'champion-info';
  chip.setAttribute('aria-expanded', 'false');
  const panel = h('div', 'plc-champ-panel');
  panel.hidden = true;
  const real = m.realName ?? m.name;
  const them = m.pronoun === 'she' ? 'her' : 'him';
  panel.appendChild(catCard({ name: real, type: m.type, art: m.art, sub: elementName(m.type) }, { small: true }));
  const body = h('div', 'plc-champ-body');
  body.appendChild(h('small', 'plc-kicker', 'Pawlegends champion'));
  const line = real === m.name
    ? `${m.name} is a real cat from the Pink Paw shelter. Every player can pick ${them}.`
    : `${m.name} is based on ${real}, a real cat from the Pink Paw shelter. Every player can pick ${them}.`;
  body.appendChild(h('p', 'plc-champ-line', line));
  if (m.flavour) body.appendChild(h('p', 'plc-champ-flavour', m.flavour));
  panel.appendChild(body);
  root.append(chip, panel);
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'champion-info') {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      chip.setAttribute('aria-expanded', String(!panel.hidden));
    }
  });
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
}

export function titleCards(m: TitleCardsModel, on: { signIn(): void }): HTMLElement {
  const root = h('div', 'plc plc-title');
  if (m.badges.some((b) => b.fastest !== null || (b.catnip ?? 0) > 0) || m.askSignIn) root.appendChild(progressStrip(m.badges));
  if (m.askSignIn) root.appendChild(saveWinsButton(on.signIn));
  return root;
}

// ----------------------------------------------------------------------------------------------- results

export type ChipState = 'waiting' | 'local' | SaveResult['status'];

export interface SaveChipModel {
  state: ChipState;
  newFastest: boolean;
  /** Show "Save your wins" on a kept-on-device chip. */
  askSignIn: boolean;
  /** Legends Pass Season XP the save paid (STORE-PASS.md §5), its Yarn and a locked hero (CHAMPION-STORE.md). */
  season?: { gained: number; tier: number; prevTier: number; yarn?: { gained: number; newPicks: number }; heroLocked?: true } | null;
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
  // Legends Pass (STORE-PASS.md §6): "+N Season XP" next to the save, and a tier-up line. XP, never money.
  if (m.state === 'saved' && m.season && m.season.gained > 0) {
    const sx = h('div', 'plc-season');
    sx.dataset.seasonXp = String(m.season.gained);
    sx.append(h('b', '', `+${m.season.gained}`), h('span', '', 'Season XP'));
    root.appendChild(sx);
    if (m.season.tier > m.season.prevTier) root.appendChild(h('div', 'plc-stamp plc-tierup', `Pass tier ${m.season.tier}!`));
  }
  // CHAMPION-STORE.md §10: "+90 Yarn" (earned by playing; unlocks champions, never money) and a Champion Pick line
  if (m.state === 'saved' && m.season?.yarn && m.season.yarn.gained > 0) {
    const yx = h('div', 'plc-season plc-yarn');
    yx.dataset.yarn = String(m.season.yarn.gained);
    yx.append(h('b', '', `+${m.season.yarn.gained}`), h('span', '', 'Yarn'));
    root.appendChild(yx);
    if (m.season.yarn.newPicks > 0) root.appendChild(h('div', 'plc-stamp plc-pick', 'Champion Pick earned: unlock a champion free!'));
  }
  if (m.state === 'saved' && m.season?.heroLocked) root.appendChild(h('div', 'plc-stamp plc-locked', 'No rewards: that champion is not unlocked yet.'));
  if (m.newFastest) root.appendChild(h('div', 'plc-stamp', 'New fastest!'));
  if (m.askSignIn && (m.state === 'queued' || m.state === 'local')) root.appendChild(saveWinsButton(on.signIn));
  return root;
}

export interface ResultsCardsModel {
  notify: boolean;
}

/** The results corner: the "Legends Pass: notify me" button (web, while the pass is not open yet). */
export function resultsCards(m: ResultsCardsModel, on: { notify(): void }): HTMLElement {
  const root = h('div', 'plc plc-results');
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
