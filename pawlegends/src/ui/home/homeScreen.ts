/**
 * Home (docs/plans/moba/HOME-MODES.md §4): the lobby rebuilt as a game client home, the way big mobile MOBAs lay it
 * out (structure only; every piece of art and every shape here is our own). It supersedes LANDING-PICK-UX.md Part A
 * (the left column) and keeps its rules: no scroll, 44 px targets, safe areas, no feature flags.
 *
 * Layers, back to front: L0 the painted key art (the 3D lobby's backdrop, render/lobby/lobbyBg.ts `legends`), L1 the
 * 3D picked hero on its pedestal (centred), L2 warm motes on a canvas (motes.ts; Med/High only), L3 two CSS light
 * shafts (off on Low), L4 this UI:
 * - top left: the profile chip (avatar in its frame ring with the Season XP ring, name, XP bar, tier);
 * - top centre: Season XP and tier chips (only numbers that exist; tap opens the pass);
 * - top right (`.lb-corner`, where the account chip mounts): [Games when embedded], Friends and ranked, Settings, Sound;
 * - left edge: Events, Today (quests ring) and # (join with a code), round buttons;
 * - right edge: the promo rotator (pass season, events, store on the web only);
 * - bottom: a glass nav (Heroes, Cards, Pass, Ranked, Store on the web, Friends), on the first visit too with the
 *   items that need a match locked;
 * - bottom right: the PLAY cluster: the mode pill (opens Mode Select), the quick Co-op and PvP buttons (one tap, as
 *   before), and the big round PLAY, which plays the selected mode in one tap.
 * Under the hero: the champion's nameplate (a button that opens the champion select for a returning player).
 *
 * Keyboard: Enter plays (when no button has focus); C cards, H heroes and M modes while focus is inside Home
 * (WCAG 2.1.4); Esc closes a popover. Every document listener is removed by `disposeHome` (app setScreen).
 * Names are host data: always escaped. Cosmetic only. The app build never shows a price or a store.
 */
import './home.css';
import type { LobbyScreenOpts } from '../lobby/lobbyScreen';
import { firstHidesBadge, peekHtml, playLabel, playLine, questTally } from '../lobby/lobbyScreen';
import type { Difficulty } from '../../sim/api';
import { ELEMENT_COLOR, FRAME_NAME } from '../../render/cosmetics';
import { ELEMENT_NAME } from '../../meta/roster';
import { cardAttrs } from '../cards/el';
import { frameRing } from '../avatar';
import { cssDataUrl } from '../deck/cssUrl';
import { icon } from '../icons';
import type { Choice } from '../screens';
import { bindVersionMark, versionMarkHtml } from '../versionMark';
import type { ModeSelectHandle } from '../modeSelect/modeSelect';
import { effectiveState, modeById, pillText, playable, queueFor, type ModeChoice, type ModeDef, type Queue } from '../modeSelect/modes';
import { crestSvg } from '../modeSelect/crest';
import { startMotes } from './motes';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
/** Absolute art URL (a relative url() in a custom property would resolve against the CSS chunk); quotes dropped. */
const absArt = (p: string): string => {
  try {
    return new URL(p, document.baseURI).href.replace(/['"()\\]/g, '');
  } catch {
    return '';
  }
};
const cssHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** The profile strip: the account's name (escaped here), the Season XP tier and progress when the server sent them. */
export interface HomeProfile {
  name: string;
  /** Season tier (null: no season known, guest). */
  tier: number | null;
  /** Progress to the next tier, 0..1. */
  pct: number;
  /** Season XP total (null: unknown). */
  xp: number | null;
  /** Matches played on this device (shown when no season is known). */
  matches: number;
}

/** One promo slide (right edge). `action`: what a tap opens. */
export interface Promo {
  id: string;
  title: string;
  sub: string;
  art?: string;
  action: 'pass' | 'modes' | 'store' | 'heroes';
}

export interface HomeScreenOpts extends LobbyScreenOpts {
  profile: HomeProfile;
  modes: readonly ModeDef[];
  modeChoice: ModeChoice;
  onModeChoice(c: ModeChoice): void;
  promos?: readonly Promo[];
  /** Season end ("ends 5 Jan 2027") for the Events list; '' when unknown. */
  seasonEnd?: string;
  /** Asset base (import.meta.env.BASE_URL). */
  base: string;
  /** Opens the champion browser (champion store worktree plugs in here); falls back to onChoose. */
  onHeroes?(): void;
}

const GEAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const SPEAKER = (on: boolean): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/>${
    on
      ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  }</svg>`;
const EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PEOPLE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.2c2.4.1 4.3 1.6 4.9 4.6"/></svg>';
const CARDS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><rect x="3" y="6" width="11" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-10 8 13)"/><rect x="9" y="3" width="11" height="15" rx="2" fill="currentColor"/></svg>';
const BAG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M6 8h12l1 13H5zM9 8V6a3 3 0 0 1 6 0v2h-2V6a1 1 0 0 0-2 0v2z"/></svg>';
const FRIENDS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><circle cx="9" cy="8" r="3.2" fill="currentColor"/><circle cx="17" cy="9" r="2.6" fill="currentColor" opacity=".8"/><path d="M2.5 20c.6-4 3.3-6 6.5-6s5.9 2 6.5 6zM15 14.2c3 .1 5.6 1.8 6.5 5.8h-4.6" fill="currentColor"/></svg>';
const GLOBE =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const SWORDS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path d="M4 4l10 10M20 4L10 14M6 16l-2 2 2 2 2-2M18 16l2 2-2 2-2-2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/></svg>';
const SCROLL = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M6 3h11a3 3 0 0 1 3 3v1h-3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h3V6a3 3 0 0 1 3-3zm2 5v2h7V8zm0 4v2h7v-2z"/></svg>';
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-ico"><path fill="currentColor" d="M5 2h2v20H5zM8 3h11l-2.5 4L19 11H8z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="hm-lk"><path fill="currentColor" d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
/** The embossed paw on PLAY. */
const PAW =
  '<svg viewBox="0 0 64 64" aria-hidden="true" class="hm-paw"><g fill="currentColor"><ellipse cx="32" cy="42" rx="14" ry="12"/><ellipse cx="15" cy="27" rx="6" ry="7.5" transform="rotate(-20 15 27)"/><ellipse cx="26" cy="17" rx="6" ry="8"/><ellipse cx="38" cy="17" rx="6" ry="8"/><ellipse cx="49" cy="27" rx="6" ry="7.5" transform="rotate(20 49 27)"/></g></svg>';

/** The queues this Home can start: bots always; co-op with a relay; PvP when the backend runs the PvP sim. Pure. */
export function availableQueues(o: Pick<LobbyScreenOpts, 'onOnline' | 'onlineMode'>): Queue[] {
  return ['bots', ...(o.onOnline ? (['coop'] as const) : []), ...(o.onOnline && o.onlineMode ? (['pvp'] as const) : [])];
}

/** The PvP lock line for a mode (3v3 casual PvP's match count; 5v5 Classic never locks), or null. Pure. */
export function pvpLockText(o: Pick<LobbyScreenOpts, 'onlineMode'>, m: Pick<ModeDef, 'id'>): string | null {
  const om = o.onlineMode;
  if (!om?.locked || m.id === 'classic' || m.id === 'ranked') return null;
  return `PvP unlocks after ${om.needed ?? 5} matches`;
}

/** The choice PLAY runs: the saved mode if it can be played, else Skirmish, and a queue this build offers. Pure. */
export function resolveChoice(modes: readonly ModeDef[], c: ModeChoice, avail: readonly Queue[], now: number): { mode: ModeDef; queue: Queue } {
  const pick = modeById(c.mode, modes);
  const mode = pick && playable(pick, now) ? pick : (modeById('skirmish', modes) ?? modes.find((m) => playable(m, now)) ?? modes[0]);
  const qs = mode.queues.filter((q) => avail.includes(q));
  return { mode, queue: queueFor({ queues: qs.length ? qs : ['bots'] }, c.queue) };
}

/** The bots match `Choice` for a mode: the 3v3 default map carries no `map`. Pure. */
export function botsChoice(last: Choice, diff: Difficulty, mode: Pick<ModeDef, 'map'>): Choice {
  const c: Choice = { ...last, difficulty: diff };
  delete c.map;
  return mode.map && mode.map !== 'crossing' ? { ...c, map: mode.map } : c;
}

/** The profile ring: Season XP progress as a conic arc (0 when no season is known). Pure. */
export const ringPct = (p: HomeProfile): number => (p.tier === null ? 0 : Math.round(Math.max(0, Math.min(1, p.pct)) * 100));

function avatarHtml(o: HomeScreenOpts, el: string): string {
  const hide = firstHidesBadge(o);
  const frame = hide ? null : o.frame;
  const pic = cssDataUrl(o.portrait);
  const face = pic ? ` style="background-image:${pic}" ${cardAttrs(o.identity.element, null)}` : '';
  // a worn profile frame tints the outer ring (CHAT-AVATARS.md §7.4 colours; the chat worktree's avatar plugs in here)
  const ring = frame ? frameRing(frame) : null;
  return `<span class="hm-av" style="--p:${ringPct(o.profile)}%;--el:${el}${ring && /^#[0-9a-f]{3,8}$/i.test(ring) ? `;--hm-frame:${ring}` : ''}"${frame ? ` data-frame="${frame}" title="${esc(FRAME_NAME[frame] ?? '')}"` : ''} aria-hidden="true"><span class="hm-av-in${pic ? ' pic' : ''}"${face}>${pic ? '' : icon('paw')}</span></span>`;
}

function profileHtml(o: HomeScreenOpts, el: string): string {
  const p = o.profile;
  const sub = p.tier !== null ? `Tier ${p.tier}` : p.matches > 0 ? `${p.matches} ${p.matches === 1 ? 'match' : 'matches'}` : o.signedIn ? 'Signed in' : 'No account needed';
  const label = `${p.name}. ${sub}${o.title ? `. ${o.title}` : ''}`;
  const inner = `${avatarHtml(o, el)}<span class="hm-pf-t"><b class="hm-pf-name">${esc(p.name)}</b>${o.title ? `<small class="hm-pf-title">${esc(o.title)}</small>` : ''}<span class="hm-xp" aria-hidden="true"><i style="width:${ringPct(p)}%"></i></span><small class="hm-pf-sub">${esc(sub)}</small></span>`;
  return o.onCollection
    ? `<button type="button" class="hm-profile" data-a="profile" data-testid="home-profile" aria-label="${esc(`${label}. Open Treat Track and Legends Pass`)}">${inner}</button>`
    : `<div class="hm-profile" data-testid="home-profile" aria-label="${esc(label)}" role="group">${inner}</div>`;
}

function currencyHtml(o: HomeScreenOpts): string {
  const p = o.profile;
  if (p.xp === null || p.tier === null) return '';
  return `<button type="button" class="hm-cur" data-a="pass" aria-label="${esc(`Season XP ${p.xp}, tier ${p.tier}. Open the pass`)}"${o.onCollection ? '' : ' disabled'}><span class="hm-chip"><i class="hm-gem xp" aria-hidden="true"></i><b>${p.xp.toLocaleString('en-US')}</b><small>Season XP</small></span><span class="hm-chip"><i class="hm-gem tier" aria-hidden="true"></i><b>${p.tier}</b><small>Tier</small></span></button>`;
}

/** The left stack: Events, Today (quests ring) and join with a code. */
function leftHtml(o: HomeScreenOpts, live: boolean): string {
  const qs = o.quests ?? [];
  const t = questTally(qs);
  const pct = Math.round((100 * t.done) / Math.max(1, t.total));
  const today = qs.length
    ? `<details class="hm-today"><summary class="hm-round" aria-label="${esc(`Today's quests: ${t.done} of ${t.total} done`)}"><span class="hm-qring${t.done === t.total ? ' all' : ''}" style="--p:${pct}%" aria-hidden="true">${SCROLL}</span><span class="hm-rl">${t.done}/${t.total}</span></summary><div class="hm-pop hm-qlist" role="list">${qs
        .map((q) => `<div role="listitem" class="q ${q.done ? 'done' : ''}"><span class="tick" aria-hidden="true">${q.done ? '✓' : ''}</span><span class="t">${esc(q.quest.text)}</span><span class="n">${q.done ? 'Done' : `${q.value}/${q.quest.goal}`}</span></div>`)
        .join('')}</div></details>`
    : '';
  const events = `<details class="hm-events"><summary class="hm-round${live ? ' live' : ''}" aria-label="Events">${FLAG}<span class="hm-rl">Events</span>${live ? '<i class="hm-dot" aria-hidden="true"></i>' : ''}</summary><div class="hm-pop hm-evlist" role="list">${eventRows(o)}</div></details>`;
  const code = o.onJoinCode ? `<button type="button" class="hm-round hm-code" data-a="joincode" data-testid="join-code" aria-label="Join with code" title="Join with code"><b aria-hidden="true">#</b><span class="hm-rl">Code</span></button>` : '';
  return `<div class="hm-left">${events}${today}${code}</div>`;
}

function eventRows(o: HomeScreenOpts): string {
  const now = Date.now();
  const rows = o.modes
    .filter((m) => typeof m.state === 'object' || m.id === 'cannon')
    .map((m) => {
      const st = effectiveState(m, now);
      return `<button type="button" role="listitem" class="ev" data-a="modes" data-mode="${esc(m.id)}"><span class="ev-crest" aria-hidden="true">${crestSvg(m.id)}</span><span class="t"><b>${esc(m.name)}</b><small>${st === 'event' ? 'Live now' : 'Coming soon'}</small></span></button>`;
    });
  if (o.seasonEnd) rows.unshift(`<button type="button" role="listitem" class="ev" data-a="pass"><span class="ev-crest" aria-hidden="true">${icon('crown')}</span><span class="t"><b>Legends Pass season</b><small>${esc(o.seasonEnd)}</small></span></button>`);
  return rows.join('') || '<p class="ev-none">No events right now.</p>';
}

function promoHtml(o: HomeScreenOpts): string {
  const ps = (o.promos ?? []).filter((p) => p.action !== 'store' || (o.storeOpen && !o.isApp));
  if (!ps.length) return '';
  const slides = ps
    .map(
      (p, i) =>
        `<button type="button" class="hm-slide${i === 0 ? ' on' : ''}" data-a="promo" data-act="${p.action}" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" aria-label="${esc(`${p.title}. ${p.sub}`)}"${p.art ? ` style="--art:url('${esc(absArt(p.art))}')"` : ''}><span class="hm-slide-t"><b>${esc(p.title)}</b><small>${esc(p.sub)}</small></span></button>`,
    )
    .join('');
  const dots = ps.length > 1 ? `<span class="hm-dots" aria-hidden="true">${ps.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="hm-promo" role="region" aria-label="News" data-n="${ps.length}">${slides}${dots}</div>`;
}

function navHtml(o: HomeScreenOpts, returning: boolean): string {
  const lockedFirst = o.firstTime;
  const item = (a: string, ico: string, label: string, opts: { extra?: string; badge?: string; locked?: string } = {}): string =>
    `<button type="button" class="hm-ni${opts.locked ? ' locked' : ''}" data-a="${opts.locked ? 'locked' : a}"${opts.locked ? ` data-why="${esc(opts.locked)}" aria-label="${esc(`${label}, locked. ${opts.locked}`)}"` : ''}${opts.extra ?? ''}><span class="hm-ni-i">${ico}${opts.locked ? LOCK : ''}${opts.badge ?? ''}</span><span class="hm-nl">${label}</span></button>`;
  const after = 'Unlocks after your first match.';
  const items = [
    item('choose', icon('paw'), 'Heroes', lockedFirst || o.dare ? { locked: o.dare ? 'Finish the dare first.' : after } : { extra: ' aria-keyshortcuts="H"' }),
    o.onCards
      ? item('cards', CARDS, 'Cards', lockedFirst ? { locked: after } : { extra: ` aria-keyshortcuts="C" aria-haspopup="dialog" aria-label="${o.cardCount ? `Cards, ${o.cardCount}` : 'Cards'}"`, badge: o.cardCount ? `<b class="hm-count" aria-hidden="true">${o.cardCount}</b>` : '' })
      : '',
    item('collection', TROPHY, 'Pass', o.onCollection && returning ? { badge: o.profile.tier !== null ? `<b class="hm-count tier" aria-hidden="true">${o.profile.tier}</b>` : '', extra: ' aria-label="Treat Track and Legends Pass"' } : { locked: o.onCollection ? 'Finish the dare first.' : after }),
    item('ranked', crestSvg('ranked').replace('<svg ', '<svg class="hm-ico" '), 'Ranked', { locked: 'Ranked opens in a later season.' }),
    o.storeOpen && !o.isApp ? item('store', BAG, 'Store', { extra: ' aria-label="Store"' }) : '',
    o.onParty ? item('party', FRIENDS, 'Friends', { extra: ' data-testid="play-friends" aria-label="Play with friends"' }) : '',
  ].filter(Boolean);
  return `<nav class="hm-nav" aria-label="Menu" data-n="${items.length}">${items.join('')}</nav>`;
}

/** Quick online buttons beside PLAY (one tap each, as before the redesign): Co-op and PvP. */
function quickHtml(o: HomeScreenOpts, mode: ModeDef): string {
  if (!o.onOnline || o.dare) return '';
  const m = o.onlineMode;
  const lock = m ? pvpLockText(o, mode) : null;
  return `<div class="hm-quick" role="group" aria-label="Play online">
    <button type="button" class="hm-qb hm-online" data-a="online" data-v="coop" data-testid="play-online" aria-label="Play online: co-op vs bots" title="Co-op vs bots with players online">${GLOBE}<span>Co-op</span></button>
    ${m ? `<button type="button" class="hm-qb hm-pvp" data-a="online" data-v="pvp" data-testid="play-pvp"${lock ? ` aria-disabled="true" title="${esc(lock)}" aria-label="PvP, ${esc(lock.toLowerCase())}"` : ' aria-label="Play PvP" title="PvP"'}>${SWORDS}<span>PvP${lock ? ' 🔒' : ''}</span></button>` : ''}
  </div>`;
}

/** Each Home's teardown (document listeners, timers, the motes loop). */
const teardown = new WeakMap<HTMLElement, () => void>();
export function disposeHome(el: HTMLElement | null | undefined): void {
  if (!el) return;
  teardown.get(el)?.();
  teardown.delete(el);
}

const overlayOpen = (): boolean => !!document.querySelector('.pl-menu, [aria-modal="true"], .pl-store, .plc-meet, .pl-offer');

export function homeScreen(parent: HTMLElement, o: HomeScreenOpts): HTMLElement {
  const root = document.createElement('div');
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const quality = document.documentElement.dataset.quality ?? 'med';
  const low = quality === 'low';
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.className = `pl-screen pl-title pl-home${low ? ' low' : ''}`;
  root.dataset.testid = 'home';
  const id = o.identity;
  const elColor = cssHex(ELEMENT_COLOR[id.element]);
  root.style.setProperty('--hm-el', elColor);
  const dare = o.dare;
  const returning = !o.firstTime && !dare;
  let diff: Difficulty = o.last.difficulty;
  let choice: ModeChoice = o.modeChoice;
  const avail = availableQueues(o);
  const now = (): number => Date.now();
  const cur = (): { mode: ModeDef; queue: Queue } => resolveChoice(o.modes, choice, avail, now());
  const liveEvent = o.modes.some((m) => effectiveState(m, now()) === 'event');
  const elName = id.card ? `${ELEMENT_NAME[id.element]} look` : ELEMENT_NAME[id.element];
  const subLine = id.card ? `${id.sub} · ${elName}` : `${id.role} · ${elName}`;
  const plateInner = `<span class="hm-plate-n">${esc(id.name)}${returning ? '<i class="hm-swap" aria-hidden="true">⇄</i>' : ''}</span><small class="hm-plate-s">${esc(subLine)}</small>`;
  const plate = returning
    ? `<button type="button" class="hm-plate" data-a="name" aria-keyshortcuts="H" aria-label="${esc(`${id.name}, ${subLine}. Change hero`)}">${plateInner}</button>`
    : `<div class="hm-plate">${plateInner}</div>`;
  const { mode } = cur();
  const pill =
    returning
      ? `<button type="button" class="hm-pill" data-a="modes" data-testid="mode-pill" aria-haspopup="dialog" aria-keyshortcuts="M"><span class="hm-pill-c" aria-hidden="true">${crestSvg(mode.id)}</span><span class="hm-pill-t">${esc(pillText(mode, cur().queue))}</span><i aria-hidden="true">▾</i></button>`
      : `<p class="hm-line${dare ? ' dare' : ''}">${esc(playLine(o))}</p>`;
  const playWord = dare ? 'DARE' : 'PLAY';
  root.innerHTML = `
    <div class="hm-fx" aria-hidden="true">
      ${low || reduced ? '' : '<i class="hm-shaft a"></i><i class="hm-shaft b"></i>'}
      ${low || reduced ? '' : '<canvas class="hm-motes"></canvas>'}
      <i class="hm-shade"></i>
    </div>
    <header class="hm-top">
      ${profileHtml(o, elColor)}
      ${returning ? currencyHtml(o) : ''}
    </header>
    <div class="pl-corner lb-corner hm-corner">
      ${o.onExit ? `<button type="button" class="hm-icon wide lb-exit" data-a="exit" data-testid="lobby-exit" aria-label="Back to Token Tails games" title="Back to Token Tails games">${EXIT}<span>Games</span></button>` : ''}
      ${o.onSocial && !o.firstTime ? `<button type="button" class="hm-icon lb-social" data-a="social" data-testid="lobby-social" aria-label="Friends and ranked" title="Friends and ranked">${PEOPLE}${o.socialBadge ? `<i class="hm-badge lb-social-badge">${Math.min(9, o.socialBadge)}</i>` : ''}</button>` : ''}
      ${o.onSettings ? `<button type="button" class="hm-icon" data-a="settings" aria-label="Settings" title="Settings">${GEAR}</button>` : ''}
      <button type="button" class="hm-icon hm-mute" data-a="mute" aria-label="Sound" aria-pressed="${!o.muted}" title="Sound">${SPEAKER(!o.muted)}</button>
    </div>
    ${leftHtml(o, liveEvent)}
    <div class="hm-slot lb-cards" data-slot="cards"></div>
    ${returning ? promoHtml(o) : ''}
    <div class="hm-stage">${plate}</div>
    ${navHtml(o, returning)}
    <div class="hm-playc lb-play">
      ${pill}
      <div class="hm-playrow">
        ${quickHtml(o, mode)}
        <button type="button" class="pl-btn big hm-play" data-a="${dare ? 'dare' : o.firstTime ? 'clem' : 'quick'}" data-testid="home-play" aria-keyshortcuts="Enter" aria-label="${esc(playLabel(o))}">
          <span class="hm-play-glow" aria-hidden="true"></span><span class="hm-play-glow b" aria-hidden="true"></span>
          <span class="hm-play-face" aria-hidden="true">${PAW}<b>${playWord}</b><span class="hm-sheen"></span></span>
        </button>
      </div>
    </div>
    ${peekHtml(o, !low)}
    <p class="hm-toast" role="status" aria-live="polite"></p>
    ${versionMarkHtml()}`;

  // ------------------------------------------------------------------------------------------- behaviour
  let leaving = false;
  let modeSel: ModeSelectHandle | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  const toast = (text: string): void => {
    const el = root.querySelector<HTMLElement>('.hm-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('on');
      el.textContent = '';
    }, 3200);
  };
  const shake = (b: HTMLElement): void => {
    b.classList.remove('shake');
    void b.offsetWidth;
    b.classList.add('shake');
  };
  const leave = (go: () => void): void => {
    if (leaving) return;
    leaving = true;
    root.classList.add('leaving');
    o.sound?.('horn');
    const out = o.playOut?.();
    if (out) void out.then(go, go);
    else go();
  };
  const online = (v: 'coop' | 'pvp', m: ModeDef): void => {
    const lock = v === 'pvp' ? pvpLockText(o, m) : null;
    if (lock) {
      o.sound?.('click');
      toast(`${lock}. ${m.id === 'skirmish' ? 'Classic and Co-op are' : 'Co-op is'} open now.`);
      return;
    }
    if (o.onlineMode && o.onlineMode.mode !== v) {
      o.onlineMode.mode = v;
      o.onlineMode.onMode(v);
    }
    o.onOnline?.();
  };
  const playNow = (): void => {
    if (leaving) return;
    const btn = root.querySelector<HTMLElement>('.hm-play');
    btn?.classList.add('pressed');
    if (dare) return leave(() => o.onPlay({ hero: dare.hero, trick: dare.trick, difficulty: dare.difficulty }, dare.seed));
    if (o.firstTime) return leave(() => o.onPlay({ hero: 'clem', trick: 'pounce', difficulty: 'easy' }));
    const { mode: m, queue } = cur();
    if (queue === 'bots') return leave(() => o.onPlay(botsChoice(o.last, diff, m)));
    btn?.classList.remove('pressed');
    online(queue, m);
  };
  const updatePill = (): void => {
    const { mode: m, queue } = cur();
    const t = root.querySelector('.hm-pill-t');
    if (t) t.textContent = pillText(m, queue);
    const c = root.querySelector('.hm-pill-c');
    if (c) c.innerHTML = crestSvg(m.id);
    const q = root.querySelector<HTMLElement>('.hm-quick');
    if (q) q.outerHTML = quickHtml(o, m);
  };
  let modesLoading = false;
  /** Mode Select is its own chunk (loaded on the first open, so Home's first load stays small). */
  const openModes = (focusMode?: string): void => {
    if (modeSel || modesLoading || leaving || !returning) return;
    o.sound?.('click');
    modesLoading = true;
    const want = focusMode ? modeById(focusMode, o.modes) : undefined;
    const start: ModeChoice = { mode: want && playable(want, now()) ? want.id : cur().mode.id, queue: cur().queue };
    void import('../modeSelect/modeSelect')
      .then(({ openModeSelect }) => {
        modesLoading = false;
        if (!root.isConnected || leaving || modeSel) return;
        root.classList.add('hm-dim');
        // a modal: Home behind it leaves the tab order and the accessibility tree (aria-modal alone does not)
        const behind = Array.from(root.children) as HTMLElement[];
        for (const n of behind) n.inert = true;
        modeSel = openModeSelect(root, {
          modes: o.modes,
          choice: start,
          available: avail,
          pvpLock: (m) => pvpLockText(o, m),
          difficulties: o.difficulties,
          difficulty: diff,
          ...(o.difficultyNote ? { difficultyNote: o.difficultyNote } : {}),
          onDifficulty: (d) => {
            diff = d;
            o.onDifficulty?.(d);
          },
          onConfirm: (c) => {
            choice = c;
            o.onModeChoice(c);
            updatePill();
          },
          onClose: () => {
            modeSel = null;
            for (const n of behind) n.inert = false;
            root.classList.remove('hm-dim');
            root.querySelector<HTMLElement>('.hm-pill')?.focus({ preventScroll: true });
          },
          ...(o.sound ? { sound: o.sound } : {}),
          base: o.base,
          low: low || reduced,
        });
      })
      .catch(() => {
        modesLoading = false;
        toast('Could not open the modes. Check the connection and try again.');
      });
  };

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-a]');
    const a = btn?.dataset.a;
    if (!a || (leaving && a !== 'mute')) return;
    if (t.closest('.ms-overlay')) return;
    // a tap on a list row inside a popover closes it
    for (const d of root.querySelectorAll<HTMLDetailsElement>('details[open]')) if (!d.contains(t) || btn?.closest('.hm-pop')) d.open = false;
    if (a === 'clem' || a === 'quick' || a === 'dare') playNow();
    else if (a === 'modes') openModes(btn?.dataset.mode);
    else if (a === 'choose') {
      if (o.onHeroes) o.onHeroes();
      else o.onChoose();
    } else if (a === 'name') o.onChoose();
    else if (a === 'online') online((btn!.dataset.v ?? 'coop') as 'coop' | 'pvp', cur().mode);
    else if (a === 'party') o.onParty?.();
    else if (a === 'joincode') o.onJoinCode?.();
    else if (a === 'cards') {
      o.sound?.('magic');
      o.onCards?.();
    } else if (a === 'store') o.onStore?.();
    else if (a === 'settings') o.onSettings?.();
    else if (a === 'social') o.onSocial?.();
    // the nav Pass item, the profile chip and the Season XP chips all open the Treat Track and its Pass tab
    else if (a === 'collection' || a === 'profile' || a === 'pass') o.onCollection?.();
    else if (a === 'exit') o.onExit?.();
    else if (a === 'locked') {
      o.sound?.('click');
      shake(btn!);
      toast(btn!.dataset.why ?? 'Locked.');
    } else if (a === 'ranked') toast('Ranked opens in a later season.');
    else if (a === 'promo') {
      const act = btn!.dataset.act;
      o.sound?.('click');
      if (act === 'pass') o.onCollection?.();
      else if (act === 'store') o.onStore?.();
      else if (act === 'heroes') (o.onHeroes ?? o.onChoose)();
      else openModes(o.modes.find((m) => typeof m.state === 'object')?.id);
    } else if (a === 'mute') {
      const b = root.querySelector<HTMLElement>('[data-a="mute"]');
      if (!b) return;
      const nowMuted = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!nowMuted));
      b.innerHTML = SPEAKER(!nowMuted);
      o.onMute(nowMuted);
    }
  });
  // popovers close on an outside tap; only one is open at a time
  root.addEventListener('pointerdown', (e) => {
    for (const d of root.querySelectorAll<HTMLDetailsElement>('details[open]')) if (!d.contains(e.target as Node)) d.open = false;
  });
  for (const d of root.querySelectorAll<HTMLDetailsElement>('details')) {
    d.addEventListener('toggle', () => {
      if (d.open) {
        o.sound?.('click');
        for (const x of root.querySelectorAll<HTMLDetailsElement>('details[open]')) if (x !== d) x.open = false;
      }
    });
  }
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) {
      disposeHome(root);
      return;
    }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || leaving) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Escape') {
      const d = root.querySelector<HTMLDetailsElement>('details[open]');
      if (d) {
        d.open = false;
        d.querySelector('summary')?.focus();
        e.preventDefault();
      }
      return;
    }
    if (overlayOpen() || modeSel) return;
    const onControl = !!t && t !== document.body && t !== root && !!t.closest('button, a, summary, [role="radio"]');
    if (e.key === 'Enter' && !onControl) {
      e.preventDefault();
      playNow();
      return;
    }
    if (!t || !root.contains(t)) return;
    const k = e.key.toLowerCase();
    if (k === 'c' && root.querySelector('button[data-a="cards"]')) {
      e.preventDefault();
      root.querySelector<HTMLElement>('button[data-a="cards"]')?.click();
    } else if (k === 'h' && returning) {
      e.preventDefault();
      root.querySelector<HTMLElement>('[data-a="choose"]')?.click();
    } else if (k === 'm' && returning) {
      e.preventDefault();
      openModes();
    }
  };
  if (ac) document.addEventListener('keydown', onKey, { signal: ac.signal });
  else document.addEventListener('keydown', onKey);

  // the promo rotator: a 5 s crossfade (paused while hovered or focused; still on Low or reduced motion)
  let promoTimer: ReturnType<typeof setInterval> | null = null;
  const promo = root.querySelector<HTMLElement>('.hm-promo');
  const slides = promo ? Array.from(promo.querySelectorAll<HTMLElement>('.hm-slide')) : [];
  if (slides.length > 1 && !low && !reduced) {
    let i = 0;
    let hold = false;
    promo!.addEventListener('pointerenter', () => (hold = true));
    promo!.addEventListener('pointerleave', () => (hold = false));
    promo!.addEventListener('focusin', () => (hold = true));
    promo!.addEventListener('focusout', () => (hold = false));
    promoTimer = setInterval(() => {
      if (hold || document.hidden) return;
      i = (i + 1) % slides.length;
      slides.forEach((s, j) => {
        s.classList.toggle('on', j === i);
        s.tabIndex = j === i ? 0 : -1;
      });
      promo!.querySelectorAll('.hm-dots i').forEach((d, j) => d.classList.toggle('on', j === i));
    }, 5000);
  }

  // parallax (pointer): the motes ±18 px and the light ±10 px, lerped at 0.08 on the menu's 30 fps budget
  let raf = 0;
  let stopMotes: () => void = () => undefined;
  if (!low && !reduced) {
    const tgt = { x: 0, y: 0 };
    const p = { x: 0, y: 0 };
    let last = 0;
    const fx = root.querySelector<HTMLElement>('.hm-fx');
    // the loop runs only while the light is catching up with the pointer: idle (no style writes) once it settles,
    // and never on touch phones, which send no hover moves
    const loop = (t: number): void => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33 || document.hidden) return;
      last = t;
      p.x += (tgt.x - p.x) * 0.08;
      p.y += (tgt.y - p.y) * 0.08;
      if (Math.abs(tgt.x - p.x) < 0.002 && Math.abs(tgt.y - p.y) < 0.002) {
        p.x = tgt.x;
        p.y = tgt.y;
        cancelAnimationFrame(raf);
        raf = 0;
      }
      fx?.style.setProperty('--px', p.x.toFixed(3));
      fx?.style.setProperty('--py', p.y.toFixed(3));
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType === 'touch' || !root.isConnected) return;
      tgt.x = (e.clientX / (window.innerWidth || 1)) * 2 - 1;
      tgt.y = (e.clientY / (window.innerHeight || 1)) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, ac ? { signal: ac.signal, passive: true } : { passive: true });
    const cv = root.querySelector<HTMLCanvasElement>('.hm-motes');
    if (cv) stopMotes = startMotes(cv, quality === 'high' ? 48 : 24);
  }

  teardown.set(root, () => {
    if (toastTimer) clearTimeout(toastTimer);
    if (promoTimer) clearInterval(promoTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    stopMotes();
    modeSel?.close();
    ac?.abort();
    document.removeEventListener('keydown', onKey);
  });
  bindVersionMark(root, ac?.signal);
  parent.appendChild(root);
  const wait = root.querySelector<HTMLElement>('.lb-peek.lb-wait');
  if (wait)
    void import('../nature/natureCss')
      .catch(() => undefined)
      .then(() => wait.classList.remove('lb-wait'));
  return root;
}
