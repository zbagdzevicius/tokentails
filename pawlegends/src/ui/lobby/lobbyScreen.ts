/**
 * The lobby (title) screen, redesigned (lobby spec §3a). Replaces `titleScreen` in app.ts `showTitle`; the old
 * function stays in ui/screens.ts for its tests.
 *
 * Left column: the logo, the champion's name block (the worn Token Tails cat's name, else the hero title, with
 * "Clem the Fighter", an element chip and a role chip), a big Play with a "3v3 vs Easy bots" line, the bots segment
 * (locked with the existing "More bots after N matches" note), Change hero, Cards (with a count) and the day's quests
 * folded into a "Today 1/3" chip. Bottom right: a fanned peek of up to three owned cards that opens the cards drawer
 * (a "your cats become skins" card when there are none; cards are never invented). Top right: icon buttons.
 *
 * Keyboard: Enter plays (when no button has focus); C opens the cards and H changes hero only while focus is inside
 * the lobby (WCAG 2.1.4: single-key shortcuts stay off for speech input elsewhere); Esc closes the quests popover.
 * Every document listener is removed by `disposeLobby(el)` (app setScreen), so redraws never pile them up.
 * Play runs the stage dolly (`playOut`, skipped with reduced motion) before the match loads.
 *
 * First visit with cards: the peek shows them (not interactive; the first match never wears a card) with "Your 5 cats
 * are here. Wear one after your first match." App builds never point to the web to collect cards.
 *
 * Names are host data: always escaped here. Cosmetic only.
 */
import { MODE_MAP, matchModeHtml, type MatchMode } from './matchMode';
import { logoHtml } from '../brandLogo';
import './lobby.css';
import type { Difficulty, HeroId } from '../../sim/api';
import { ELEMENT_COLOR, FRAME_NAME, type FrameId } from '../../render/cosmetics';
import { ELEMENT_NAME, type CatTier, type Element } from '../../meta/roster';
import type { QuestView } from '../../meta/quests';
import { dareText, type Dare } from '../../share/dare';
import { DIFFICULTY_HINT, DIFFICULTY_TEXT, HERO_TEXT } from '../heroText';
import { icon } from '../icons';
import { cardFrame } from '../cards/frame';
import { cardAttrs } from '../cards/el';
import type { Choice } from '../screens';
import { cssDataUrl, cssUrl } from '../deck/cssUrl';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const cssHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** The champion's display identity on the lobby (from meta/cardName `cardIdentity`, else the hero). */
export interface LobbyIdentity {
  /** Big name: the worn cat's, else the hero title. */
  name: string;
  /** "Clem the Fighter". */
  sub: string;
  element: Element;
  role: string;
  /** True when `name` is a worn card's cat. */
  card: boolean;
  rung?: CatTier | null;
}

/** One card in the bottom-right peek (an owned card skin). */
export interface PeekCard {
  name: string;
  element: Element;
  rung: CatTier;
  art?: string;
  sprite?: string;
}

export interface LobbyScreenOpts {
  firstTime: boolean;
  last: Choice;
  dare: Dare | null;
  muted: boolean;
  identity: LobbyIdentity;
  storeOpen?: boolean;
  frame?: FrameId | null;
  title?: string | null;
  /** The lobby hero's portrait (in its look), inside the frame ring. */
  portrait?: string | null;
  /** "Signed in: wins save to your account." vs "No account needed." */
  signedIn: boolean;
  /** An app build: the empty peek never sends players to the web (anti-steering). */
  isApp?: boolean;
  /** The first match's line ("a guided Rookie match"). */
  firstLine?: string;
  /** Pickable bots (firstSession `pickable()`); a locked segment shows `difficultyNote` instead. */
  difficulties: readonly Difficulty[];
  difficultyNote?: string;
  onDifficulty?(d: Difficulty): void;
  /** Owned card skins (count) and up to three for the peek, worn first. */
  cardCount: number;
  peek: readonly PeekCard[];
  /** The worn card (the peek caption "Wearing <name>"). */
  wearing?: { name: string } | null;
  onCards?(): void;
  /** Party play (MULTIPLAYER.md §8): "Play with friends" creates a party at once; absent = no relay configured. */
  onParty?(): void;
  /** "Join with code" under it (opens the party chunk on the code boxes). */
  onJoinCode?(): void;
  /**
   * Quick Play co-op (M1A-IMPL.md §1, §6): "Play online" queues with strangers in one tap, first in the friends row;
   * absent = no relay. Shown from the very first visit (zero friction; a new guest queues with the newbie hint).
   */
  onOnline?(): void;
  /**
   * Casual PvP (docs/plans/moba/V16.md §5): the "Co-op vs bots · PvP" chip above Play online. Absent = the backend
   * has no PvP sim yet (`GET /pawlegends/sim`), so no chip. `locked`: fewer than 5 matches ("PvP unlocks after 5").
   */
  onlineMode?: { mode: 'coop' | 'pvp'; locked: boolean; onMode(mode: 'coop' | 'pvp'): void };
  /**
   * Sim v19 (MAP-5V5.md §8.1): the 3v3 Quick | 5v5 Classic toggle above Play (remembered by the caller). Absent on
   * the first match and on a dare (both are 3v3).
   */
  matchMode?: { mode: MatchMode; onMode(mode: MatchMode): void };
  onPlay(c: Choice, seed?: number): void;
  onChoose(): void;
  onMute(m: boolean): void;
  onStore?(): void;
  onSettings?(): void;
  onCollection?(): void;
  /**
   * Embedded in Token Tails: "Games" (first in the top-right corner group; the top-left is the title) leaves for the host's games page (the bridge `exit`).
   * The host no longer lays its own close button over the game. Absent = standalone (nothing to leave to).
   */
  onExit?(): void;
  quests?: readonly QuestView[];
  /** The stage dolly before the match loads (Lobby.playOut). */
  playOut?(): Promise<void>;
  /** A UI sound (sfx.play). */
  sound?(name: 'click' | 'magic' | 'horn'): void;
}

const RUNG_NAME: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });

const GEAR =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>';
const SPEAKER = (on: boolean): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4z"/>${
    on
      ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      : '<path d="M16.5 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  }</svg>`;
/** The lobby's "Games" exit (embedded): a chevron back. */
const EXIT = '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CARDS =
  '<svg viewBox="0 0 24 24" aria-hidden="true" class="lb-ico"><rect x="3" y="6" width="11" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-10 8 13)"/><rect x="9" y="3" width="11" height="15" rx="2" fill="currentColor"/></svg>';

/** Today's quests as "done/total". */
export function questTally(qs: readonly QuestView[] | undefined): { done: number; total: number } {
  const list = qs ?? [];
  return { done: list.filter((q) => q.done).length, total: list.length };
}

/** The line under Play: "3v3 vs Easy bots", the guided first match, or the dare. Pure. */
export function playLine(o: Pick<LobbyScreenOpts, 'firstTime' | 'dare' | 'firstLine' | 'last'>): string {
  if (o.dare) return dareText(o.dare);
  if (o.firstTime) return o.firstLine ?? 'Your first match is a guided match.';
  return `${o.last.map === 'hearthwood' ? '5v5 Classic' : '3v3'} vs ${DIFFICULTY_TEXT[o.last.difficulty as keyof typeof DIFFICULTY_TEXT] ?? 'bots'}`;
}

/** The Play button's label. Pure. */
export function playLabel(o: Pick<LobbyScreenOpts, 'firstTime' | 'dare' | 'identity'>): string {
  if (o.dare) return 'Accept the dare';
  if (o.firstTime) return 'Play as Clem';
  return `Play as ${o.identity.name}`;
}

/** A card's cat picture: its art, else its sprite's idle frame (pixelated), else a paw. URLs go through `cssUrl`
 * (QA: a sprite path with `');…` injected CSS through the old `url('…')`). */
function catPic(c: PeekCard): string {
  if (c.art && cssUrl(c.art)) return `<img class="lb-cat" src="${esc(c.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">`;
  // the sprite sheet's idle frame (48 px cell, row 4), as the cards drawer draws it
  const sp = cssUrl(c.sprite);
  if (sp) return `<span class="lb-cat lb-sprite" aria-hidden="true"><i style="background-image:${sp}"></i></span>`;
  return `<span class="lb-cat lb-noart" aria-hidden="true">${icon('paw')}</span>`;
}

/** The peek's fanned card faces (front card first in `cards`). `live`: the front card's Nature moves (not on Low). */
function fanHtml(cards: readonly PeekCard[], live: boolean): string {
  return cards
    .map((c, i) =>
      cardFrame({
        el: c.element,
        tier: c.rung,
        tag: 'span',
        // integrate: the Nature lane's card layer; the front card moves (ui/nature/nature.css, loaded lazily below)
        cls: `lb-mini n${i} pl-nature${i === 0 && live ? ' pl-nature-live' : ''}`,
        foil: i === 0 && live && (c.rung === 'EPIC' || c.rung === 'LEGENDARY') ? 'sweep' : 'none',
        attrs: `data-nature="${c.element}" aria-hidden="true"`,
        inner: `${catPic(c)}<b class="lb-mini-name">${esc(c.name)}</b>`,
      }),
    )
    .reverse()
    .join('');
}

/** "Your 5 cats are here." Pure. */
export function firstPeekLine(n: number): string {
  return n === 1 ? 'Your cat is here.' : `Your ${n} cats are here.`;
}

function peekHtml(o: LobbyScreenOpts, live: boolean): string {
  if (!o.onCards) return '';
  const cards = o.peek.slice(0, 3);
  if (o.firstTime) {
    // QA: a first-time card owner saw nothing of their cards, then met them in the match. Shown, not wearable yet
    // (GDD §7.2: the first match never wears a card); the guided Play stays the one call to action.
    if (!cards.length) return '';
    return `<div class="lb-peek first lb-wait" role="note"><span class="lb-fan" aria-hidden="true">${fanHtml(cards, live)}</span><span class="lb-peek-cap"><b>${esc(firstPeekLine(o.cardCount))}</b><small>Wear one after your first match.</small></span></div>`;
  }
  if (!cards.length) {
    // no cards: never invent one; a plain card back that opens the drawer's empty state (its name is its visible
    // text, WCAG 2.5.3); an app build never points to the web or names another store (App Review 3.1.3)
    const how = o.isApp ? 'No cat cards yet' : 'Collect cards on Token Tails';
    return `<button type="button" class="lb-peek empty" data-a="cards" aria-haspopup="dialog">
      <span class="lb-back" aria-hidden="true">${icon('paw')}</span>
      <span class="lb-peek-cap"><b>Your cats become skins</b> <small>${how}</small></span></button>`;
  }
  const faces = fanHtml(cards, live);
  const cap = o.wearing ? `<span class="lb-peek-cap pl-wearing"><small class="cap">Wearing ${esc(o.wearing.name)}</small></span>` : `<span class="lb-peek-cap"><small>Tap to wear a card</small></span>`;
  // the visible caption leads the accessible name (WCAG 2.5.3), the count follows
  const capText = o.wearing ? `Wearing ${o.wearing.name}` : 'Tap to wear a card';
  return `<button type="button" class="lb-peek lb-wait" data-a="cards" data-count="${cards.length}" aria-haspopup="dialog" aria-label="${esc(`${capText}: your ${o.cardCount} cards`)}"><span class="lb-fan">${faces}</span>${cap}</button>`;
}

function badgeHtml(frame: FrameId | null | undefined, title: string | null | undefined, portrait: string | null | undefined, el: Element): string {
  if (!frame && !title) return '';
  // an internal baked portrait only (data: or blob: URL), never raw into the style attribute
  const pic = cssDataUrl(portrait);
  portrait = pic ? portrait : null;
  const face = pic ? ` style="background-image:${pic}" ${cardAttrs(el, null)}` : '';
  const tip = frame?.startsWith('frame.champ.') ? 'Earned on the Treat Track.' : 'Frames come from cats you adopted by name, by their tier.';
  return `<div class="pl-badge lb-badge" ${frame ? `data-frame="${frame}"` : ''} title="${tip}"><span class="ring${portrait ? ' pic tt-ring' : ''}"${face}></span><span class="lb-badge-t"><small>Profile frame</small>${frame ? esc(FRAME_NAME[frame]) : ''}${title ? ` <b>${esc(title)}</b>` : ''}</span></div>`;
}

/** QA: a first visit shows no unexplained roster tier frame ("Profile frame / Legendary frame"); a bought frame or a
 * title (a restored purchase) still shows. Pure. */
export function firstHidesBadge(o: Pick<LobbyScreenOpts, 'firstTime' | 'frame' | 'title'>): boolean {
  return o.firstTime && !o.title && /^frame\.(rare|epic|legendary)$/.test(o.frame ?? '');
}

function segmentHtml(o: LobbyScreenOpts, cur: Difficulty): string {
  if (o.firstTime || o.dare) return '';
  if (o.difficultyNote) return `<p class="lb-locked" data-locked="bots"><span class="lb-lock" aria-hidden="true">${icon('crown')}</span>${esc(o.difficultyNote)}</p>`;
  if (o.difficulties.length < 2) return '';
  return `<div class="lb-seg" role="radiogroup" aria-label="Bots">${o.difficulties
    .map((d) => {
      const on = d === cur;
      const name = (DIFFICULTY_TEXT as Record<string, string>)[d]?.replace(' bots', '') ?? d;
      return `<button type="button" role="radio" class="${on ? 'on' : ''}" data-d="${d}" aria-checked="${on}" tabindex="${on ? 0 : -1}" title="${esc(DIFFICULTY_HINT[d] ?? '')}">${esc(name)}</button>`;
    })
    .join('')}</div>`;
}

function questsHtml(qs: readonly QuestView[] | undefined): string {
  if (!qs || !qs.length) return '';
  const t = questTally(qs);
  return `<details class="lb-quests"><summary><span class="lb-dot${t.done === t.total ? ' all' : ''}" aria-hidden="true"></span>Today <b>${t.done}/${t.total}</b></summary><div class="lb-qlist" role="list">${qs
    .map((q) => `<div role="listitem" class="q ${q.done ? 'done' : ''}"><span class="tick" aria-hidden="true">${q.done ? '✓' : ''}</span><span class="t">${esc(q.quest.text)}</span><span class="n">${q.done ? 'Done' : `${q.value}/${q.quest.goal}`}</span></div>`)
    .join('')}</div></details>`;
}

const overlayOpen = (): boolean => !!document.querySelector('.pl-menu, [aria-modal="true"], .pl-store, .plc-meet, .pl-offer');

/** Each lobby screen's teardown (its document listeners). */
const teardown = new WeakMap<HTMLElement, () => void>();
/** Remove a lobby screen's document listeners (app setScreen calls it for every screen it replaces; safe on any node). */
export function disposeLobby(el: HTMLElement | null | undefined): void {
  if (!el) return;
  teardown.get(el)?.();
  teardown.delete(el);
}

export function lobbyScreen(parent: HTMLElement, o: LobbyScreenOpts): HTMLElement {
  const root = document.createElement('div');
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  root.className = 'pl-screen pl-title pl-lobby';
  const id = o.identity;
  const elColor = cssHex(ELEMENT_COLOR[id.element]);
  root.style.setProperty('--lb-el', elColor);
  let diff: Difficulty = o.last.difficulty;
  let mode: MatchMode | null = o.matchMode && !o.firstTime && !o.dare ? o.matchMode.mode : null;
  const choice = (): Choice => {
    const c: Choice = { ...o.last, difficulty: diff };
    delete c.map;
    return mode === 'classic' ? { ...c, map: MODE_MAP.classic } : c;
  };
  const dare = o.dare;
  const secondary =
    o.firstTime || dare
      ? ''
      : `<div class="lb-row">
          <button type="button" class="pl-btn ghost lb-btn" data-a="choose" aria-keyshortcuts="H">${icon('paw')}<span>Change hero</span></button>
          ${o.onCards ? `<button type="button" class="pl-btn ghost lb-btn" data-a="cards" aria-keyshortcuts="C">${CARDS}<span>Cards</span>${o.cardCount ? `<span class="lb-count" aria-label="${o.cardCount} cards">${o.cardCount}</span>` : ''}</button>` : ''}
          ${questsHtml(o.quests)}
        </div>`;
  // QA: a card's element is part of its look (no element exists in the sim): "Fire look", never a bare type chip
  const chips = `<span class="lb-chip el" style="--c:${elColor}"${id.card ? ' title="Part of the card\'s look. Stats stay the same."' : ''}><i aria-hidden="true"></i>${esc(id.card ? `${ELEMENT_NAME[id.element]} look` : ELEMENT_NAME[id.element])}</span><span class="lb-chip role">${esc(id.role)}</span>${id.card && id.rung ? `<span class="lb-chip rung" data-rung="${id.rung}">${RUNG_NAME[id.rung]} card</span>` : ''}`;
  // QA: on Low quality the peek's front card stays still (its Nature layer repainted every frame)
  const live = document.documentElement.dataset.quality !== 'low';
  root.innerHTML = `
    <div class="pl-title-col lb-col">
      ${logoHtml()}
      <p class="tag">3v3 cats and dogs. Quick matches, big plays.</p>
      <div class="lb-name" data-card="${id.card ? '1' : '0'}">
        <small class="lb-eyebrow">${id.card ? 'Your Token Tails cat' : 'Your champion'}</small>
        <h2 class="lb-hero">${esc(id.name)}</h2>
        <p class="lb-sub">${esc(id.sub)}</p>
        <div class="lb-chips">${chips}</div>
      </div>
      <div class="lb-play actions">
        ${mode ? matchModeHtml(mode) : ''}
        <button type="button" class="pl-btn big" data-a="${dare ? 'dare' : o.firstTime ? 'clem' : 'quick'}" aria-keyshortcuts="Enter">${esc(playLabel(o))}</button>
        <p class="lb-line${dare ? ' dare-line' : ''}">${esc(playLine({ ...o, last: choice() }))}${dare ? ` <small>as ${esc(HERO_TEXT[dare.hero].title)}</small>` : ''}</p>
        ${segmentHtml(o, diff)}
        ${o.onOnline && o.onlineMode && !dare ? modeChipHtml(o.onlineMode) : ''}
        ${(o.onParty || o.onOnline) && !dare ? `<div class="lb-friends-row">${o.onOnline ? `<button type="button" class="pl-btn small lb-friends lb-online" data-a="online" data-testid="play-online">${o.onlineMode?.mode === 'pvp' ? 'Play PvP' : 'Play online'}</button>` : ''}${o.onParty ? `<button type="button" class="pl-btn ghost small lb-friends" data-a="party" data-testid="play-friends">Play with friends</button>` : ''}${o.onJoinCode ? `<button type="button" class="lb-joincode" data-a="joincode" data-testid="join-code">Join with code</button>` : ''}</div>` : ''}
      </div>
      ${secondary}
      <p class="sub"><span class="acct">${o.signedIn ? 'Signed in: wins save to your account.' : 'No account needed.'}</span></p>
      ${firstHidesBadge(o) ? '' : badgeHtml(o.frame, o.title, o.portrait, id.element)}
    </div>
    ${peekHtml(o, live)}
    <div class="pl-corner lb-corner">
      ${o.onExit ? `<button type="button" class="lb-icon wide lb-exit" data-a="exit" data-testid="lobby-exit" aria-label="Back to Token Tails games" title="Back to Token Tails games">${EXIT}<span>Games</span></button>` : ''}
      ${o.storeOpen ? `<button type="button" class="lb-icon" data-a="store" aria-label="Store">${icon('crown')}<span>Store</span></button>` : ''}
      ${o.onCollection ? `<button type="button" class="lb-icon wide" data-a="collection" aria-label="Treat Track">${icon('crown')}<span>Treat Track</span></button>` : ''}
      ${o.onSettings ? `<button type="button" class="lb-icon" data-a="settings" aria-label="Settings" title="Settings">${GEAR}</button>` : ''}
      <button type="button" class="lb-icon" data-a="mute" aria-label="Sound" aria-pressed="${!o.muted}" title="Sound">${SPEAKER(!o.muted)}</button>
    </div>`;

  let leaving = false;
  const play = (c: Choice, seed?: number): void => {
    if (leaving) return;
    leaving = true;
    root.classList.add('leaving');
    o.sound?.('horn');
    const go = (): void => o.onPlay(c, seed);
    const out = o.playOut?.();
    if (out) void out.then(go, go);
    else go();
  };
  const setDiff = (d: Difficulty, focus = false): void => {
    diff = d;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.lb-seg [data-d]')) {
      const on = b.dataset.d === d;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    const line = root.querySelector('.lb-line');
    if (line) line.textContent = playLine({ ...o, last: choice() });
    o.onDifficulty?.(d);
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    if (d) {
      o.sound?.('click');
      setDiff(d);
      return;
    }
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (leaving && a !== 'mute') return;
    if (a === 'map' && mode) {
      const v = t.closest<HTMLElement>('[data-a="map"]')!.dataset.v === 'classic' ? 'classic' : 'quick';
      if (v === mode) return;
      o.sound?.('click');
      mode = v;
      for (const b of root.querySelectorAll<HTMLElement>('[data-a="map"]')) {
        const on = b.dataset.v === v;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      }
      const line = root.querySelector('.lb-line');
      if (line) line.textContent = playLine({ ...o, last: choice() });
      o.matchMode?.onMode(v);
      return;
    }
    if (a === 'clem') play({ hero: 'clem', trick: 'pounce', difficulty: 'easy' });
    else if (a === 'quick') play(choice());
    else if (a === 'dare' && dare) play({ hero: dare.hero, trick: dare.trick, difficulty: dare.difficulty }, dare.seed);
    else if (a === 'choose') o.onChoose();
    else if (a === 'online') o.onOnline?.();
    else if (a === 'mode' && o.onlineMode) {
      const v = t.closest<HTMLElement>('[data-a="mode"]')!.dataset.v as 'coop' | 'pvp';
      if (v === 'pvp' && o.onlineMode.locked) return;
      o.sound?.('click');
      o.onlineMode.mode = v;
      o.onlineMode.onMode(v);
      for (const b of root.querySelectorAll<HTMLElement>('[data-a="mode"]')) b.setAttribute('aria-checked', String(b.dataset.v === v));
      const play = root.querySelector<HTMLElement>('[data-a="online"]');
      if (play) play.textContent = v === 'pvp' ? 'Play PvP' : 'Play online';
    }
    else if (a === 'party') o.onParty?.();
    else if (a === 'joincode') o.onJoinCode?.();
    else if (a === 'cards') {
      o.sound?.('magic');
      o.onCards?.();
    } else if (a === 'store') o.onStore?.();
    else if (a === 'settings') o.onSettings?.();
    else if (a === 'collection') o.onCollection?.();
    else if (a === 'exit') o.onExit?.();
    else if (a === 'mute') {
      const b = root.querySelector<HTMLElement>('[data-a="mute"]');
      if (!b) return;
      const nowMuted = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', String(!nowMuted));
      b.innerHTML = SPEAKER(!nowMuted);
      o.onMute(nowMuted);
    }
  });
  // the quests popover closes on an outside click
  root.addEventListener('pointerdown', (e) => {
    const q = root.querySelector<HTMLDetailsElement>('.lb-quests[open]');
    if (q && !q.contains(e.target as Node)) q.open = false;
  });
  // arrow keys inside the bots segment (one tab stop, radio-group pattern)
  root.querySelector('.lb-seg')?.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const order = o.difficulties;
    const i = order.indexOf(diff);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || i < 0) return;
    e.preventDefault();
    setDiff(order[(i + step + order.length) % order.length], true);
  });
  const onKey = (e: KeyboardEvent): void => {
    if (!root.isConnected) {
      disposeLobby(root);
      return;
    }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || leaving) return;
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Escape') {
      const q = root.querySelector<HTMLDetailsElement>('.lb-quests[open]');
      if (q) {
        q.open = false;
        q.querySelector('summary')?.focus();
        e.preventDefault();
      }
      return;
    }
    if (overlayOpen()) return;
    const onControl = !!t && t !== document.body && t !== root && !!t.closest('button, a, summary, [role="radio"]');
    if (e.key === 'Enter' && !onControl) {
      e.preventDefault();
      (root.querySelector('.lb-play [data-a]') as HTMLElement | null)?.click();
      return;
    }
    // WCAG 2.1.4: the single-letter shortcuts only while focus is on the lobby itself
    if (!t || !root.contains(t)) return;
    if ((e.key === 'c' || e.key === 'C') && root.querySelector('button[data-a="cards"]')) {
      e.preventDefault();
      (root.querySelector('button[data-a="cards"]') as HTMLElement | null)?.click();
    } else if ((e.key === 'h' || e.key === 'H') && !o.firstTime && !dare) {
      e.preventDefault();
      (root.querySelector('[data-a="choose"]') as HTMLElement | null)?.click();
    }
  };
  if (ac) document.addEventListener('keydown', onKey, { signal: ac.signal });
  else document.addEventListener('keydown', onKey);
  teardown.set(root, () => {
    ac?.abort();
    document.removeEventListener('keydown', onKey);
  });
  parent.appendChild(root);
  // integrate: the card peek's Nature stylesheet stays out of the first load; the fan shows once it is in (QA: the
  // front card flashed without its Nature styling)
  const wait = root.querySelector<HTMLElement>('.lb-peek.lb-wait');
  if (wait)
    void import('../nature/natureCss')
      .catch(() => undefined)
      .then(() => wait.classList.remove('lb-wait'));
  return root;
}

/** The hero's own identity (no card): its title, "Clem the Fighter", its card element and role. */
export function heroIdentity(hero: HeroId, element: Element): LobbyIdentity {
  const t = HERO_TEXT[hero];
  return { name: t.title, sub: `${t.title} the ${t.role}`, element, role: t.role, card: false, rung: null };
}

/** Casual PvP: the online mode chip (Co-op vs bots · PvP), a radio group; PvP locked for newbies (V16.md §5). */
function modeChipHtml(m: { mode: 'coop' | 'pvp'; locked: boolean }): string {
  const btn = (v: 'coop' | 'pvp', label: string) =>
    `<button type="button" role="radio" aria-checked="${m.mode === v}" data-a="mode" data-v="${v}" data-testid="mode-${v}"${v === 'pvp' && m.locked ? ' aria-disabled="true" title="PvP unlocks after 5 matches"' : ''}>${label}${v === 'pvp' && m.locked ? ' <span class="lb-lock" aria-hidden="true">🔒</span>' : ''}</button>`;
  const lockLine = m.locked ? `<small class="lb-mode-lock" data-testid="mode-pvp-locked">PvP unlocks after 5 matches</small>` : '';
  return `<div class="lb-mode" role="radiogroup" aria-label="Online mode" data-testid="online-mode">${btn('coop', 'Co-op vs bots')}${btn('pvp', 'PvP')}</div>${lockLine}`;
}
