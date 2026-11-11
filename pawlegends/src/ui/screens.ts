/**
 * Out-of-match screens (POC.md §12): title → pick (8 heroes: a cats row with the four sim v9 shelter champions and
 * a dogs row; Paw Trick, difficulty) → match → results, plus the Esc menu and the portrait rotate prompt. DOM
 * overlays over the lobby turntable. English only.
 */
import { flagHtml } from '../social/report';
import { logoHtml } from './brandLogo';
import { progressBlock, type ProgressSummary } from './progressSummary';
import './champions.css';
import { accountState } from '../meta/profile';
import { DIFFICULTIES } from '../data/bots';
import { HEROES } from '../data/heroes';
import { championOf } from '../data/heroes/shelter';
import type { Difficulty, HeroId, MapId, TrickId } from '../sim/api';
import { chromaOptions, ELEMENT_COLOR, FRAME_NAME, resolveLook, wardrobe, wearsCardSkin, type FrameId, type Look, type Owned } from '../render/cosmetics';
import { ELEMENT_NAME } from '../meta/roster';
import type { CatTier, Element } from '../meta/roster';
import type { Dare } from '../share/dare';
import { dareText } from '../share/dare';
import { DIFFICULTY_HINT, DIFFICULTY_TEXT, HERO_TEXT, trickHint } from './heroText';
import { portraitUrl } from '../render/portraits';
import { icon } from './icons';
import { wearingCard } from './cards';
import * as TL from '../data/timeline';
import { rookieAvailable } from '../app/firstSession';
import { castMode, trackpadOn } from '../input/presets';
import { bindCameraHeightRow, cameraHeightRowHtml } from './cameraHeightRow';
import type { CameraHeight } from '../render/camera/height';
import type { QuestView } from '../meta/quests';
import { TREAT_XP, type TreatGain } from '../meta/treats';
import type { Grade } from '../meta/grade';
import { toGoText } from './collection';
import { cardFxPreview } from './cardFxView';
import { cardIdentity } from '../meta/cardName';
// Token Tails card art (ui/cards/): pick tiles as collectible cards, skin mini cards, the title badge, the MVP card
import { cardAttrs, heroElement } from './cards/el';
import { openChampInfo } from './champBrowser/open';
import { BROWSE_ORDER } from './champBrowser/meta';
import type { SkillSlot } from './skillCodex/facts';
import { champSelectHtml, openChampSelect, patchChampSelect, refreshFaces, wireChampSelect, type CsModel } from './champSelect/champSelect';
import { soloSeats } from './champSelect/seats';

function el(cls: string, html = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return d;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export interface Choice {
  hero: HeroId;
  trick: TrickId;
  difficulty: Difficulty;
  /** Sim v19: the map (omitted = 'crossing', 3v3 Quick; 'hearthwood' = 5v5 Classic). */
  map?: MapId;
}

// ------------------------------------------------------------------------------------------------- title

export interface TitleOpts {
  firstTime: boolean;
  last: Choice;
  dare: Dare | null;
  muted: boolean;
  /** Store button (web, host store ready). */
  storeOpen?: boolean;
  frame?: FrameId | null;
  title?: string | null;
  /** The lobby hero's portrait (in its look), drawn inside the frame ring. */
  portrait?: string | null;
  onPlay(c: Choice, seed?: number): void;
  onChoose(): void;
  onMute(m: boolean): void;
  onStore?(): void;
  onSettings?(): void;
  /** GAPS A1: the Treat Track chest screen and profile shelf (shown once the player has finished a match). */
  onCollection?(): void;
  /** Today's quests (fun plan F4), shown under the play button. */
  quests?: readonly QuestView[];
  /** GDD §7.2: the card skin the lobby hero wears ("Wearing <name>"), or null. */
  wearing?: { name: string; type: string; art?: string; frame?: string } | null;
}

function questRow(q: QuestView): string {
  return `<div class="q ${q.done ? 'done' : ''} ${q.fresh ? 'fresh' : ''}"><span class="tick">${q.done ? '✓' : ''}</span><span class="t">${esc(q.quest.text)}</span><span class="n">${q.done ? '' : `${q.value}/${q.quest.goal}`}</span></div>`;
}

function badge(frame: FrameId | null | undefined, title: string | null | undefined, portrait?: string | null, el?: Element): string {
  if (!frame && !title) return '';
  // Token Tails cards: the portrait sits in its hero's element frame (the element art and border behind the face)
  const face = portrait ? ` style="background-image:url(${portrait})"${el ? ` ${cardAttrs(el, null)}` : ''}` : '';
  // round 1: say where frames come from (a Legendary from a pack gives none: decision #19)
  // GAPS A1: a champion frame comes from the Treat Track
  const tip = frame?.startsWith('frame.champ.') ? 'Earned on the Treat Track.' : 'Frames come from cats you adopted by name, by their tier.';
  return `<div class="pl-badge" ${frame ? `data-frame="${frame}"` : ''} title="${tip}"><span class="ring${portrait ? ' pic' : ''}${portrait && el ? ' tt-ring' : ''}"${face}></span><span>${frame ? esc(FRAME_NAME[frame]) : ''}${title ? ` <b>${esc(title)}</b>` : ''}</span></div>`;
}

export function titleScreen(parent: HTMLElement, o: TitleOpts): HTMLElement {
  const root = el('pl-screen pl-title');
  const dare = o.dare;
  const primary = dare
    ? `<button class="pl-btn big" data-a="dare">Accept the dare</button><p class="dare-line">${esc(dareText(dare))} <small>as ${esc(HERO_TEXT[dare.hero].title)}</small></p>`
    : o.firstTime
      ? `<button class="pl-btn big" data-a="clem">Play as Clem</button>`
      : `<button class="pl-btn big" data-a="quick">Play as ${esc(HERO_TEXT[o.last.hero].title)}</button><button class="pl-btn ghost" data-a="choose">Choose hero</button>`;
  root.innerHTML = `
    <div class="pl-title-col">
      ${logoHtml()}
      <p class="tag">3v3 cats and dogs. Quick matches, big plays.</p>
      <div class="actions">${primary}</div>
      <p class="sub"><span class="acct">${accountState().signedIn ? 'Signed in: wins save to your account.' : 'No account needed.'}</span> ${o.firstTime ? (rookieAvailable() ? 'Your first match is a guided Rookie match.' : 'Your first match is a guided match against Easy bots.') : ''}</p>
      ${o.quests && o.quests.length ? `<div class="pl-quests mini"><b>Today</b>${o.quests.map((q) => questRow(q)).join('')}</div>` : ''}
      ${badge(o.frame, o.title, o.portrait, heroElement(o.last.hero))}
    </div>
    <div class="pl-corner">
      ${o.storeOpen ? `<button class="pl-btn ghost small" data-a="store">${icon('crown')}Store</button>` : ''}
      ${o.onCollection ? `<button class="pl-btn ghost small" data-a="collection">${icon('crown')}Treat Track</button>` : ''}
      ${o.onSettings ? `<button class="pl-btn ghost small" data-a="settings">Settings</button>` : ''}
      <button class="pl-mute" data-a="mute" aria-label="Sound">${o.muted ? 'Sound off' : 'Sound on'}</button>
    </div>`;
  if (o.wearing) root.querySelector('.pl-title-col')?.appendChild(wearingCard(o.wearing));
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'clem') o.onPlay({ hero: 'clem', trick: 'pounce', difficulty: 'easy' });
    else if (a === 'quick') o.onPlay(o.last);
    else if (a === 'choose') o.onChoose();
    else if (a === 'dare' && dare) o.onPlay({ hero: dare.hero, trick: dare.trick, difficulty: dare.difficulty }, dare.seed);
    else if (a === 'store') o.onStore?.();
    else if (a === 'settings') o.onSettings?.();
    else if (a === 'collection') o.onCollection?.();
    else if (a === 'mute') {
      const b = root.querySelector('.pl-mute') as HTMLElement;
      const m = b.textContent === 'Sound on';
      b.textContent = m ? 'Sound off' : 'Sound on';
      o.onMute(m);
    }
  });
  parent.appendChild(root);
  return root;
}

// -------------------------------------------------------------------------------------------------- pick

export interface PickOpts {
  initial: Choice;
  /** Sim v19: seats per team (5 when the next solo match is 5v5 Classic; default 3). */
  teamSize?: number;
  /** What the player owns (coats, chromas, card skins): the tiles name a hero after its worn card. */
  owned?: Owned;
  looks?: Partial<Record<HeroId, Partial<Look>>>;
  onHero(h: HeroId): void;
  onStart(c: Choice): void;
  onBack(): void;
  /** The bots radio (fun plan F1: hidden until the player has played a few matches). */
  difficulties?: readonly Difficulty[];
  /** Shown instead of the radio while it is locked. */
  difficultyNote?: string;
  /** Ability numbers on (round 1: "no numbers anywhere"); the panel's 123 toggle switches it. */
  numbers?: boolean;
  onNumbers?(on: boolean): void;
  /** Round 1: an experienced player can unlock the bots right away ("I've played MOBAs before"). */
  onVeteran?(): void;
  /**
   * Lobby spec §3b: the panel's Look button. With free or store coats or colour tints it opens the Look sheet (those,
   * and "Cards" for the drawer); else it opens the "Your cards" drawer at once. No prices, no store.
   */
  onDeck?(hero: HeroId): void;
  /** A coat or colour tint was chosen on the Look sheet. */
  onLook?(h: HeroId, look: Look): void;
  /** Sim v14: dogs wait for the guided first match (their tiles show a lock and can be viewed, not locked in). */
  dogsLocked?: boolean;
  /** The player's username on their seat ("You" when unknown). */
  playerName?: string | null;
  /**
   * Sim v9 shelter champions, web only: whether the player owns the champion's card (a "Card" badge on its tile; app
   * builds pass owned: false). Every champion is free to play either way. No Meet link here (GDD §8.1 #5).
   */
  champions?: Partial<Record<HeroId, { art?: string; owned: boolean }>>;
}

export { isNewHero, SIDE_TAB_CSS } from './champSelect/roles';

export interface SkinTile {
  id: string;
  name: string;
  element: Element;
  rung: CatTier;
  bond: number;
  art?: string;
  fromPack?: boolean;
  /** The next bond threshold (null at Legendary). */
  next?: number | null;
  /** Wave C (C4): the coat glow its card effects use. */
  tint?: number;
}

const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="cs-back-ico"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const DOGS_LOCKED = 'Dogs unlock after your first match';

const faces = new WeakMap<HTMLElement, () => void>();
const relook = new WeakMap<HTMLElement, (h: HeroId, look: Look) => void>();
/** Lobby spec §3b: the drawer wore a card on `h`; redraw the pick screen in place (the trick and bots stay). */
export const setPickLook = (root: HTMLElement, h: HeroId, look: Look): void => relook.get(root)?.(h, look);
/** Redraw a pick screen's hero portraits in place (after a sprite probe or a bake changed one). */
export const refreshPickFaces = (root: HTMLElement): void => faces.get(root)?.();

/**
 * The solo champion select (docs/plans/moba/LANDING-PICK-UX.md Part B, solo vs bots and "Try hero"): the shared
 * Wild Rift layout (ui/champSelect). One tap on a portrait selects the hero (the landing and the 3D stage follow) and
 * shows its skills; LOCK IN, a double tap or Ctrl/Cmd+Enter starts the match; Back (or Esc) keeps the choice. Dogs
 * before match 1 can be viewed but not locked in. Redraws are in place: the trick, the bots, the tabs and the grid
 * scroll survive a look change or a baked portrait.
 */
export function pickScreen(parent: HTMLElement, o: PickOpts): HTMLElement {
  const root = el('pl-screen pl-pick');
  const c: Choice = { ...o.initial };
  let viewing: HeroId = c.hero;
  let numbers = o.numbers === true;
  const looks: Partial<Record<HeroId, Partial<Look>>> = { ...(o.looks ?? {}) };
  const lookOf = (h: HeroId): Look | null => (o.owned ? resolveLook(h, o.owned, looks[h]) : null);
  // sim v14: a dog dare opens on the dogs even before match 1
  const dogsLocked = o.dogsLocked === true && HEROES[c.hero]?.side !== 'dog';
  const why = (h: HeroId): string => (dogsLocked && HEROES[h].side === 'dog' ? DOGS_LOCKED : '');
  const markSide = (): void => {
    document.documentElement.dataset.pickSide = HEROES[c.hero]?.side ?? 'cat';
  };
  const diffs = o.difficulties ?? DIFFICULTIES;
  // the Look sheet: coats and colour tints the player owns (the cards live in the drawer)
  let lookOpen = false;
  const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
  const lookChoices = (h: HeroId): { coats: ReturnType<typeof wardrobe>; chromas: ReturnType<typeof chromaOptions> } =>
    o.owned ? { coats: wardrobe(h, o.owned), chromas: chromaOptions(o.owned) } : { coats: [], chromas: [] };
  const hasLookChoices = (h: HeroId): boolean => {
    const { coats, chromas } = lookChoices(h);
    return coats.length > 1 || chromas.length > 1;
  };
  const sheetHtml = (): string => {
    if (!lookOpen) return '';
    const h = c.hero;
    const l = lookOf(h);
    const { coats, chromas } = lookChoices(h);
    const card = !!l && wearsCardSkin(l);
    // pawlegends (QA): the swatches are colour tints, said so ("Ice colour tint, looks only")
    const tint = (k: { id: Element | null }): string => (k.id ? `${ELEMENT_NAME[k.id]} colour tint, looks only` : 'No colour tint');
    const coatChips = coats.length > 1 ? `<div class="cs-ls-row" role="group" aria-label="Coats">${coats.map((k) => `<button type="button" class="chip ${!card && k.id === (l?.coat ?? null) ? 'on' : ''}" data-coat="${esc(k.id ?? '')}" aria-pressed="${!card && k.id === (l?.coat ?? null)}">${esc(k.name)}</button>`).join('')}</div>` : '';
    const sw = chromas.length > 1 && !card ? `<div class="cs-ls-row swatches" role="group" aria-label="Colour tints">${chromas.map((k) => `<button type="button" class="chip chroma ${k.id === (l?.chroma ?? null) ? 'on' : ''}" data-chroma="${esc(k.id ?? '')}" title="${esc(tint(k))}" aria-label="${esc(tint(k))}" style="--el:${k.id ? hex(ELEMENT_COLOR[k.id]) : 'transparent'}"></button>`).join('')}</div>` : '';
    return `<div class="cs-looksheet" role="dialog" aria-label="${esc(`Look: ${HERO_TEXT[h].title}`)}"><div class="cs-ls-head"><b>Look</b><button type="button" class="cs-ls-x" data-a="lookclose" aria-label="Close">✕</button></div><button type="button" class="pl-btn ghost small cs-ls-cards" data-a="deck" aria-haspopup="dialog">${icon('paw')}Cards</button>${coatChips}${sw}${hasLookChoices(h) ? '' : `<p class="cs-ls-none">${esc(`No other coats for ${HERO_TEXT[h].title} yet. Cards dress your heroes.`)}</p>`}</div>`;
  };
  const botsHtml = (): string => {
    if (o.difficultyNote)
      return `<div class="cs-bots locked"><span class="note">${esc(o.difficultyNote)}</span>${o.onVeteran ? `<button type="button" class="cs-vet" data-a="veteran">I've played MOBAs before</button>` : ''}</div>`;
    const hint = DIFFICULTY_HINT[c.difficulty] ?? '';
    return `<div class="cs-bots" role="radiogroup" aria-label="Bots"><span class="cs-bl">Bots</span>${diffs
      .map((d) => {
        const on = d === c.difficulty;
        const name = (DIFFICULTY_TEXT as Record<string, string>)[d]?.replace(' bots', '') ?? d;
        return `<button type="button" role="radio" class="${on ? 'on' : ''}" data-d="${d}" aria-checked="${on}" tabindex="${on ? 0 : -1}" title="${esc(DIFFICULTY_HINT[d] ?? '')}">${esc(name)}</button>`;
      })
      .join('')}</div>${hint ? `<p class="cs-bots-hint bots-hint">${esc(hint)}</p>` : ''}`;
  };
  // phones: the hint has no room under the bots, so a tap on a difficulty shows it over LOCK IN for a few seconds
  let note = '';
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  const showNote = (text: string): void => {
    note = text;
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      note = '';
      if (root.isConnected) render();
    }, 3500);
  };
  const model = (): CsModel => {
    const no = why(viewing);
    const vs = (DIFFICULTY_TEXT as Record<string, string>)[c.difficulty] ?? 'bots';
    return {
      kind: 'solo',
      seats: soloSeats({ name: o.playerName, hero: c.hero, trick: c.trick, difficulty: c.difficulty, teamSize: o.teamSize }),
      heroes: BROWSE_ORDER,
      selected: viewing,
      sideTabs: true,
      dogsLocked,
      tile: (h) => {
        const id = cardIdentity(h, lookOf(h));
        return { locked: why(h) || undefined, cardName: id?.name ?? null, rung: id?.rung ?? null, owned: o.champions?.[h]?.owned ? (championOf(h)?.cardName ?? null) : null };
      },
      portrait: (h) => portraitUrl(h, lookOf(h)),
      trick: c.trick,
      trickHint: trickHint(HERO_TEXT[c.hero].role, HEROES[c.hero].side),
      headLeft: `<button type="button" class="pl-btn ghost small cs-back" data-a="back" aria-label="Back" aria-keyshortcuts="Escape">${BACK}<span>Back</span></button>`,
      // the Token Tails squad (embed integration) walks with the team: its slot sits under the seats
      teamNote: '<div class="cs-squad" data-slot="cards"></div>',
      footLeft: botsHtml(),
      lock: { enabled: !no, label: 'LOCK IN', sub: no || `vs ${vs}` },
      note,
      numbers,
      numbersToggle: !!o.onNumbers,
      look: !!o.onDeck,
      lookSheet: sheetHtml(),
    };
  };
  const render = (): void => {
    const html = champSelectHtml(model());
    if (!patchChampSelect(root, html)) root.innerHTML = html;
  };
  openChampSelect(c.hero);
  render();
  markSide();
  relook.set(root, (h, look) => {
    looks[h] = look;
    render();
  });
  faces.set(root, () => {
    const cs = root.querySelector<HTMLElement>('.cs');
    if (cs) refreshFaces(cs, (h) => portraitUrl(h, lookOf(h)));
  });
  const select = (h: HeroId): void => {
    viewing = h;
    lookOpen = false;
    if (!why(h) && h !== c.hero) {
      c.hero = h;
      o.onHero(h);
      markSide();
    }
    render();
  };
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const h = t.closest<HTMLElement>('.cs-grid [data-h]')?.dataset.h as HeroId | undefined;
    if (h && HEROES[h]) return select(h);
    const tr = t.closest<HTMLElement>('[data-t]')?.dataset.t as TrickId | undefined;
    if (tr) {
      c.trick = tr;
      return render();
    }
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    if (d) {
      c.difficulty = d;
      showNote(DIFFICULTY_HINT[d] ?? '');
      return render();
    }
    const btn = t.closest<HTMLElement>('[data-a]');
    const a = btn?.dataset.a;
    if (a === 'start') {
      if (why(viewing)) return;
      return o.onStart({ ...c });
    }
    if (a === 'back') return o.onBack();
    if (a === 'veteran') return o.onVeteran?.();
    if (a === 'look') {
      // always the small sheet (coats, colour tints, and Cards for the drawer): the pick screen never opens the
      // drawer, with its offers, by itself
      lookOpen = !lookOpen;
      render();
      root.querySelector<HTMLElement>(lookOpen ? '.cs-ls-cards' : '.cs-look')?.focus();
      return;
    }
    if (a === 'lookclose') {
      lookOpen = false;
      render();
      root.querySelector<HTMLElement>('.cs-look')?.focus();
      return;
    }
    if (a === 'deck') {
      // the drawer gives focus back to its opener: the Look button (the sheet closes first)
      const wasOpen = lookOpen;
      lookOpen = false;
      render();
      if (wasOpen) root.querySelector<HTMLElement>('.cs-look')?.focus();
      return o.onDeck?.(c.hero);
    }
    const coat = t.closest<HTMLElement>('.cs-looksheet [data-coat]')?.dataset.coat;
    const chroma = t.closest<HTMLElement>('.cs-looksheet [data-chroma]')?.dataset.chroma;
    if (coat !== undefined || chroma !== undefined) {
      const cur = lookOf(c.hero);
      if (!cur) return;
      const nextCoat = coat !== undefined ? coat || null : cur.coat;
      // card skins never carry a chroma (GDD §7.2)
      const next: Look = { coat: nextCoat, chroma: nextCoat && nextCoat.startsWith('cat.') ? null : chroma !== undefined ? ((chroma || null) as Look['chroma']) : cur.chroma };
      looks[c.hero] = next;
      o.onLook?.(c.hero, next);
      return render();
    }
    if (a === 'codex') {
      // the live clip and the lore: only here, on demand (the pick screen itself draws no 3D)
      void openChampInfo({
        hero: viewing,
        slot: (btn?.dataset.slot as SkillSlot | undefined) ?? 'q',
        within: root,
        // CARD-SKINS.md: the clip wears the player's chosen look, so its skin effects show
        look: (x) => lookOf(x),
        pick: { label: 'Select', can: (x) => why(x), on: (x) => select(x) },
      });
    }
  });
  wireChampSelect(root, {
    onBack: () => o.onBack(),
    onNumbers: (on) => {
      numbers = on;
      o.onNumbers?.(on);
    },
  });
  parent.appendChild(root);
  // keyboard: focus starts on the selected portrait (arrows walk the grid, Enter again locks in); no scroll jump
  requestAnimationFrame(() => {
    if (root.isConnected && !root.contains(document.activeElement)) root.querySelector<HTMLElement>('.cs-tile.on:not([hidden])')?.focus({ preventScroll: true });
  });
  return root;
}

// ----------------------------------------------------------------------------------------------- results

export interface ResultsOpts {
  won: boolean;
  seconds: number;
  hero: HeroId;
  difficulty: Difficulty;
  kills: number;
  deaths: number;
  /** Round 1: shown as K / D / A, the same takedowns (K + A) the quests and personal bests count. */
  assists?: number;
  level: number;
  teamKills: [number, number];
  firstWin: boolean;
  best: boolean;
  dareLink: string | null;
  /** What knocked the player out, by killer kind (results tip). */
  deathsBy?: Record<string, number>;
  /** Touch controls (tip wording). */
  touch?: boolean;
  storeOpen?: boolean;
  notifyOpen?: boolean;
  /** Match speed (e2e and the 64× check); the staged reveal runs this much faster. */
  speed?: number;
  onAgain(): void;
  onChange(): void;
  /** Audit UX-08: Home (the lobby) from the results, top right. */
  onHome?(): void;
  /** `text`: the dare line ("Beat my 7:12 vs Easy bots in Pawlegends!"), sent with the link to the share sheet (PUB-06). */
  onShare(url: string, text: string): void;
  onStore?(): void;
  onNotify?(): void;
  /** The player's damage to enemy heroes (0 = never joined a fight). */
  heroDamage?: number;
  /** The best moment's title ("Triple Pounce"), or null. */
  bestMoment?: string | null;
  /** Treat Track progress from this match (fun plan F4). */
  treats?: TreatGain | null;
  /** Today's quests after this match. */
  quests?: readonly QuestView[];
  /** Per-player rows (round 0: a veteran wants to see why it lost): own team first. */
  table?: readonly ResultRow[];
  /** Bot-ladder rating after this match and its change (meta/ladder.ts); null on Rookie. */
  ladder?: { rating: number; delta: number; placement?: number; impact?: number; grade?: Grade } | null;
  /**
   * GAPS A2: the player's grade, its Treat XP, the match MVP (best on the winning team) and, on a loss, the best on
   * the player's team. Names are display names; `you` marks the player.
   */
  grade?: ResultGrade | null;
  /** "New personal best: fastest Clem win" (meta/ladder.ts), or null. */
  personal?: string | null;
  /** Round 2: what decided the match, one line (app/endCause.ts). */
  cause?: string;
  /** Round 2: a returning player (4+ matches or the veteran flag) gets Play again at End + RESULTS_REVEAL_MS.quick. */
  quick?: boolean;
  /** Round 2: a hero to tease on the Change hero button ("Try Sage: ranged healer"). */
  tryHero?: HeroId | null;
  /** pawlegends: the champion's display name this match (the worn cat's, "Ficus"); default the hero title. */
  heroName?: string | null;
  /**
   * Party play (MULTIPLAYER.md §7 M6): the party's rows (src/party/ui/partyResults.ts markup, escaped there), and the
   * party actions: "Play again together (1/2)" (onAgain), "Change hero" (onChange), "Leave party".
   */
  /** PvP reports (SOCIAL-RANKED.md §8.1): a tap on a row's flag (the reason chips open over it). */
  onReport?(slot: number, anchor: HTMLElement): void;
  /** Party results; Quick Play strangers: `leave` "Back", no Change hero (`change: false`). */
  party?: { rowsHtml: string; again: string; onLeave(): void; leave?: string; change?: boolean; coop?: boolean };
  /** Lane F (F5): per-hero level, Toys, Fish, last hits and Toy timings, medals, and the player's Fish by source. */
  progress?: ProgressSummary | null;
  /** GDD §7.2: the card skin worn this match ("<name> fought as <Hero>") and its Bond after it. */
  skin?: { name: string; art?: string; bond: number; next: number | null; rung?: CatTier; tint?: number } | null;
}

export interface ResultGrade {
  grade: Grade;
  /** Treat XP the grade added (GRADE_TREAT_XP). */
  xp: number;
  /** Token Tails cards: `hero` (and `portrait`, `tier` for the player's own look) draw the MVP card. */
  mvp: { name: string; you: boolean; hero?: HeroId; portrait?: string | null; tier?: CatTier | null; awakened?: 0 | 1 | 2 | 3 | null };
  /** A loss only: the best on the player's team (its `hero` draws the results card in place of the enemy MVP). */
  bestOnTeam?: { name: string; you: boolean; hero?: HeroId; portrait?: string | null; tier?: CatTier | null; awakened?: 0 | 1 | 2 | 3 | null } | null;
}

export interface ResultRow {
  name: string;
  /** GAPS A2: this slot's grade, and MVP / best-on-a-losing-team markers. */
  grade?: Grade;
  mvp?: boolean;
  best?: boolean;
  /** 'self' | 'ally' | 'enemy' */
  rel: string;
  k: number;
  d: number;
  a: number;
  heroDmg: number;
  towerDmg: number;
  /** PvP reports (SOCIAL-RANKED.md §8.1): this row's slot and its flag ('can', or 'done' once reported). */
  slot?: number;
  flag?: 'can' | 'done';
}

function resultTable(rows: readonly ResultRow[]): string {
  const graded = rows.some((r) => r.grade);
  const tag = (r: ResultRow): string => (r.mvp ? ' <em class="mvp">MVP</em>' : r.best ? ' <em class="best">Best</em>' : '');
  const tr = (r: ResultRow): string =>
    `<tr class="${r.rel}"><td>${esc(r.name)}${tag(r)}${r.flag && r.slot !== undefined ? flagHtml(r.slot, r.name, r.flag === 'done') : ''}</td><td>${r.k}/${r.d}/${r.a}</td><td>${r.heroDmg}</td><td>${r.towerDmg}</td>${graded ? `<td class="g" data-grade="${r.grade ?? ''}">${r.grade ?? ''}</td>` : ''}</tr>`;
  return `<details class="pl-table"><summary>Scoreboard</summary><table><thead><tr><th>Hero</th><th>K/D/A</th><th>Hero dmg</th><th>Tower dmg</th>${graded ? '<th>Grade</th>' : ''}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></details>`;
}

/** A fallback Sudden Death second (10:00). The real one is per difficulty (`suddenDeathS`, data/timeline.ts TIMELINE_BY;
 *  sim v12: Rookie 6:30, Easy 7:45, Normal and Hard 8:30): after it the clock, not the player, ends the match. */
export const SUDDEN_DEATH_S = 600;

/**
 * Audit GP-05: below this share of the team's takedowns (K + A over the team's) and of its hero damage, a win says
 * "jump into a fight", not "with your help" (an idle player won 50.5% of match 1 and only 4 of 101 such wins had 0
 * hero damage, so the old "0 damage" rule praised waiting).
 */
export const FIGHT_SHARE = Object.freeze({ kp: 0.25, heroDmg: 0.15 });

/** Did the player take a real part in the fights? From the results table's own team rows when present. Pure. */
export function joinedFights(o: Pick<ResultsOpts, 'kills' | 'assists' | 'teamKills' | 'heroDamage' | 'table'>): boolean {
  const team = (o.table ?? []).filter((r) => r.rel === 'self' || r.rel === 'ally');
  const self = team.find((r) => r.rel === 'self');
  if (!self) return o.heroDamage !== undefined ? o.heroDamage > 0 : o.kills > 0;
  const dmg = team.reduce((a, r) => a + r.heroDmg, 0);
  const kp = (self.k + self.a) / Math.max(1, o.teamKills[0]);
  return kp >= FIGHT_SHARE.kp || (dmg > 0 && self.heroDmg / dmg >= FIGHT_SHARE.heroDmg);
}

/** The line under Victory / Defeat, chosen by the margin (a 1–14 loss is not "so close"). Pure. */
export function resultLine(o: Pick<ResultsOpts, 'won' | 'kills' | 'teamKills' | 'difficulty' | 'heroDamage'> & Partial<Pick<ResultsOpts, 'assists' | 'table'>>): string {
  const [ours, theirs] = o.teamKills;
  if (o.won) {
    // GP-05: only a real part in the fights earns "with your help" (a share of the team's takedowns or hero damage)
    if (!joinedFights(o)) return 'Your team took the core. Next time, jump into a fight!';
    if (o.kills === 0) return 'Your team took the core, with your help.';
    return ours - theirs >= 6 ? 'A clean sweep. The core is yours.' : 'The core is yours.';
  }
  const gap = theirs - ours;
  if (gap >= 6) return o.difficulty === 'hard' ? 'Hard bots punish a lone hero. Fight next to your team.' : o.difficulty === 'normal' ? 'Tough one. Try Easy bots or a new hero.' : 'Tough one. The tip below helps.';
  if (gap >= 3) return 'They pulled ahead. You can turn the next one.';
  return 'So close. The next one is yours.';
}

/** One concrete tip from how the match went (null when there is nothing useful to say). Pure. */
export function resultTip(o: Pick<ResultsOpts, 'won' | 'kills' | 'deaths' | 'level' | 'seconds' | 'deathsBy' | 'touch'>): string | null {
  const by = o.deathsBy ?? {};
  const towers = (by.tower ?? 0) + (by.core ?? 0);
  const heroes = by.hero ?? 0;
  const nap = o.touch ? 'tap Nap' : 'press B to Nap';
  if (towers >= 2) return `Towers knocked you out ${towers} times. Walk in behind your minions: the tower hits them first.`;
  if (heroes >= 3 && o.deaths >= 4) return `Enemy heroes caught you ${heroes} times. Under a third of your health, step back to your tower or ${nap}.`;
  if (o.level <= 3 && o.seconds >= 300) return 'Stand near enemy minions when they fall: that is where your levels come from.';
  if (o.kills === 0 && !o.won) return `Use your abilities when an enemy hero comes close: they do most of a hero's damage.`;
  if (o.deaths >= 5) return `Under a third of your health, step back or ${nap}: your fountain heals you fast.`;
  return null;
}

/** The Sudden Death second for a difficulty (data/timeline.ts, with the fun plan's per-difficulty overrides). */
export function suddenDeathS(difficulty: Difficulty): number {
  const by = (TL as unknown as { TIMELINE_BY?: Record<string, { suddenDeath?: number }> }).TIMELINE_BY;
  const t = by?.[difficulty]?.suddenDeath ?? TL.TIMELINE.suddenDeath;
  return Math.floor(t / TL.TICK_HZ);
}

/** "Bot ladder 1012 +12", "Placement 2 of 3: no points lost", "+4 (small share: more takedowns, fewer knockouts)". */
function ladderLine(l: NonNullable<ResultsOpts['ladder']>, won: boolean): string {
  const sign = l.delta > 0 ? '+' : '';
  const note = l.placement
    ? `<small>Placement ${l.placement} of 3${won ? '' : ': no points lost'}</small>`
    : won && (l.impact ?? 1) < 0.75
      ? '<small>Small share: more takedowns, fewer knockouts</small>'
      : !won && (l.grade === 'S' || l.grade === 'A')
        ? `<small>Grade ${l.grade}: half the points lost</small>`
        : '';
  return `<p class="pl-ladder" data-rating="${l.rating}">Bot ladder <b>${l.rating}</b> <span class="${l.delta >= 0 ? 'up' : 'down'}">${l.delta === 0 ? '±0' : `${sign}${l.delta}`}</span>${note}</p>`;
}

/** GAPS A2: the grade badge, its Treat XP, the MVP and (on a loss) the best on the player's team. */
function gradeBlock(g: ResultGrade, won: boolean): string {
  const who = (x: { name: string; you: boolean }): string => (x.you ? 'You' : esc(x.name));
  const lines = [`<span class="mvp" data-mvp="${g.mvp.you ? 'you' : 'other'}">MVP: <b>${who(g.mvp)}</b></span>`];
  if (!won && g.bestOnTeam) lines.push(`<span class="best" data-best="${g.bestOnTeam.you ? 'you' : 'other'}">Best on your team: <b>${who(g.bestOnTeam)}</b></span>`);
  return `<div class="pl-grade" data-grade="${g.grade}">
    <b class="letter">${g.grade}</b>
    <span class="what"><b>Grade ${g.grade}</b><small>${g.xp > 0 ? `+${g.xp} Treat XP` : 'Join more fights for a B'}</small></span>
    <span class="who">${lines.join('')}</span>
  </div>`;
}

/**
 * Audit UX-04: the rewards pinned beside Run it back (on phones the Treat Track, chest and share sat 600 px below the
 * fold): the grade, the Treat XP bar, a chest toast and the dare link. The full blocks stay in the column.
 */
export function rewardStrip(o: Pick<ResultsOpts, 'grade' | 'treats' | 'dareLink'>): string {
  const parts: string[] = [];
  if (o.grade) parts.push(`<span class="rw-grade" data-grade="${o.grade.grade}" title="Grade ${o.grade.grade}"><b>${o.grade.grade}</b><small>Grade</small></span>`);
  const t = o.treats;
  if (t) {
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const opened = t.rewards.length > 0;
    parts.push(`<span class="rw-treat" style="--from:${pct(t.before)};--to:${pct(opened ? 1 : t.after)}"><small>+${t.gained} Treat XP</small><i class="bar"><i class="fill"></i></i></span>`);
    if (opened) parts.push(`<span class="rw-chest">${icon('crown')}<span><b>Chest opened</b><small>${esc(t.rewards.map((r) => r.name).join(', '))}</small></span></span>`);
  }
  if (o.dareLink) parts.push(`<button class="pl-btn ghost small rw-share" data-a="share" title="Copy dare link">Dare a friend</button>`);
  return parts.length ? `<div class="pl-reward" data-reward>${parts.join('')}</div>` : '';
}

function treatBlock(t: TreatGain): string {
  const pct = (v: number): string => `${Math.round(v * 100)}%`;
  const opened = t.rewards.length > 0;
  const fillTo = opened ? 1 : t.after;
  return `<div class="pl-treats ${opened ? 'chest' : ''}" style="--from:${pct(t.before)};--to:${pct(fillTo)};--after:${pct(t.after)}">
    <div class="head"><b>Treat Track</b><small>+${t.gained} Treat XP</small></div>
    <div class="bar"><i class="fill"></i></div>
    ${opened ? `<div class="open">${icon('crown')}<span><b>Chest opened: ${esc(t.rewards.map((r) => r.name).join(', '))}</b><small>Free, yours to keep.</small></span></div>` : ''}
    ${t.dayBonus > 0 ? `<p class="bonus" data-daybonus="${t.dayBonus}">First win of the day: +${t.dayBonus} Treat XP</p>` : ''}
    <p class="next">Next chest: <b>${esc(t.next.name)}</b> <small data-togo="${t.toGo}">${esc(toGoText(t.toGo))}</small></p>
  </div>`;
}

export function resultsScreen(parent: HTMLElement, o: ResultsOpts): HTMLElement {
  const root = el(`pl-screen pl-results ${o.won ? 'won' : 'lost'}`);
  const m = Math.floor(o.seconds / 60);
  const s = String(o.seconds % 60).padStart(2, '0');
  const tip = resultTip(o);
  const sd = suddenDeathS(o.difficulty);
  const dareLine = dareText({ seed: 0, hero: o.hero, trick: 'pounce', difficulty: o.difficulty, seconds: o.seconds < sd ? o.seconds : 0 });
  root.innerHTML = `
    <div class="pl-results-col">
      <h1>${o.won ? 'Victory!' : 'Defeat'}</h1>
      <p class="sub">${esc(resultLine(o))}</p>
      ${o.cause ? `<p class="pl-cause" data-cause>${esc(o.cause)}</p>` : ''}
      <div class="stats">
        <div><b>${m}:${s}</b><small>Match time${o.won && o.best && o.seconds < sd ? ' · best!' : ''}</small></div>
        <div data-kda="${o.kills}/${o.deaths}/${o.assists ?? 0}"><b>${o.kills} / ${o.deaths} / ${o.assists ?? 0}</b><small>K / D / A</small></div>
        <div><b>${o.level}</b><small>Level</small></div>
        <div><b>${o.teamKills[0]} – ${o.teamKills[1]}</b><small>Team takedowns</small></div>
      </div>
      ${o.progress && o.progress.rows.length ? progressBlock(o.progress) : ''}
      ${o.party ? o.party.rowsHtml : ''}
      ${o.grade ? gradeBlock(o.grade, o.won) : ''}
      ${o.skin ? `<p class="pl-skin" data-bond="${o.skin.bond}">${o.skin.art ? `<img src="${esc(o.skin.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : icon('paw')}<span><b>${esc(o.skin.name)}</b> fought as ${esc(HERO_TEXT[o.hero].title)}<small>Bond ${o.skin.bond}${o.skin.next !== null ? ` · next look at ${o.skin.next}` : ''}</small></span></p>${o.skin.rung ? cardFxPreview({ name: o.skin.name, rung: o.skin.rung, ...(o.skin.tint !== undefined ? { tint: o.skin.tint } : {}) }, 'card-fx pl-skin-fx') : ''}` : ''}
      ${o.bestMoment ? `<p class="pl-best">${icon('crown')}<span>Best moment: <b>${esc(o.bestMoment)}</b></span></p>` : ''}
      ${o.ladder ? ladderLine(o.ladder, o.won) : ''}
      ${o.personal ? `<p class="pl-personal">${icon('crown')}<span>${esc(o.personal)}</span></p>` : ''}
      ${o.table && o.table.length ? resultTable(o.table) : ''}
      ${tip ? `<p class="pl-result-tip">${icon('paw')}<span>${esc(tip)}</span></p>` : ''}
      <div data-slot="save"></div>
      ${o.treats ? treatBlock(o.treats) : ''}
      ${o.quests && o.quests.length ? `<div class="pl-quests"><b>Daily quests</b>${o.quests.map((q) => questRow(q)).join('')}</div>` : ''}
      ${o.firstWin ? `<div class="unlock">${icon('crown')}<span><b>Sir Brutus Biscuit coat unlocked</b><small>Free, yours to keep.</small></span></div>` : ''}
      <div class="dare ${o.dareLink ? '' : 'hidden'}">
        <p>Dare a friend: <b>${o.dareLink ? esc(dareLine) : ''}</b></p>
        <button class="pl-btn ghost" data-a="share">Copy dare link</button>
      </div>
      ${o.storeOpen || o.notifyOpen ? `<div class="extras">${o.storeOpen ? `<button class="pl-btn ghost small" data-a="store">${icon('crown')}Store</button>` : ''}${o.notifyOpen ? `<button class="pl-btn ghost small" data-a="notify">Legends Pass: notify me</button>` : ''}</div>` : ''}
    </div>
    ${(o.won ? o.grade?.mvp.hero : (o.grade?.bestOnTeam?.hero ?? o.grade?.mvp.hero)) ? '<div class="tt-mvp-slot" data-slot="mvp"></div>' : ''}
    ${o.onHome && !o.party ? `<button class="pl-btn ghost small pl-home" data-a="home" aria-label="Home">${icon('paw')}<span>Home</span></button>` : ''}
    ${o.party ? '' : rewardStrip(o)}
    ${
      o.party
        ? `<div class="actions pinned party"><button class="pl-btn ghost small" data-a="leave-party" data-testid="party-leave-results">${esc(o.party.leave ?? 'Leave party')}</button>${o.party.change === false ? '' : '<button class="pl-btn solid" data-a="change" data-testid="party-change">Change hero</button>'}<button class="pl-btn big" data-a="again" data-testid="party-again">${esc(o.party.again)}</button></div>`
        : `<div class="actions pinned"><button class="pl-btn solid" data-a="change">${HEROES[o.hero]?.side === 'dog' ? 'Switch dog' : 'Switch cat'}${o.tryHero ? `<small>Try ${esc(HERO_TEXT[o.tryHero].title)}: ${esc(HERO_TEXT[o.tryHero].role)}</small>` : ''}</button><button class="pl-btn big" data-a="again">Run it back<small>${esc(o.heroName || HERO_TEXT[o.hero].title)}, new bots</small></button></div>`
    }`;
  root.addEventListener('click', (e) => {
    const flag = (e.target as HTMLElement).closest<HTMLElement>('[data-report]');
    if (flag) {
      e.preventDefault();
      if (!flag.hasAttribute('disabled')) o.onReport?.(Number(flag.dataset.report), flag);
      return;
    }
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'again') o.onAgain();
    else if (a === 'change') o.onChange();
    else if (a === 'leave-party') o.party?.onLeave();
    else if (a === 'home') o.onHome?.();
    else if (a === 'store') o.onStore?.();
    else if (a === 'notify') o.onNotify?.();
    else if (a === 'share' && o.dareLink) {
      o.onShare(o.dareLink, dareLine);
      for (const b of root.querySelectorAll<HTMLElement>('[data-a="share"]')) b.textContent = 'Link copied!';
    }
  });
  parent.appendChild(root);
  // cards: the MVP card (its own chunk, ui/cards/mvp.ts) drops into its slot; it flips on '.in' like the rest
  // on a defeat: the best on the player's team, with a calmer card (no sunburst rays for the side that lost)
  const best = !o.won && o.grade?.bestOnTeam?.hero ? o.grade.bestOnTeam : null;
  const mvp = best ?? o.grade?.mvp;
  if (mvp?.hero) {
    const mvpHero = mvp.hero;
    void import('./cards/mvp')
      .then((m) => {
        const slot = root.querySelector<HTMLElement>('[data-slot="mvp"]');
        if (slot) slot.outerHTML = m.mvpCard({ hero: mvpHero, name: mvp.you ? 'You' : mvp.name, you: mvp.you, portrait: mvp.portrait, tier: mvp.tier ?? null, awakened: mvp.awakened ?? null, won: o.won, ...(best ? { ribbon: 'TEAM BEST' } : {}) });
      })
      .catch(() => undefined);
  }
  // Staged reveal (§12): the screen opens at End + RESULTS_AFTER_END_MS with the stats and the unlock; the dare link
  // at End + 5 s, "Play again" at End + 10 s (both inert until then, so a stray tap does not skip them).
  requestAnimationFrame(() => root.classList.add('in'));
  const k = 1 / Math.max(1, o.speed ?? 1);
  const dareAt = o.quick ? RESULTS_REVEAL_MS.quick : RESULTS_REVEAL_MS.dare;
  const actionsAt = o.quick ? RESULTS_REVEAL_MS.quick : RESULTS_REVEAL_MS.actions;
  setTimeout(() => root.classList.add('dare-in'), Math.max(0, dareAt - RESULTS_AFTER_END_MS) * k);
  setTimeout(() => root.classList.add('actions-in'), Math.max(0, actionsAt - RESULTS_AFTER_END_MS) * k);
  return root;
}

/** The match view keeps playing this long after the end before the results screen opens (matchSession onEnd). */
export const RESULTS_AFTER_END_MS = 2200;
/** POC.md §12: the dare link at End + 5 s, "Play again" at End + 10 s; a returning player both at End + 2.5 s (round 2). */
export const RESULTS_REVEAL_MS = Object.freeze({ dare: 5000, actions: 10000, quick: 2500 });

// ---------------------------------------------------------------------------------------------- Esc menu

export interface MenuOpts {
  muted: boolean;
  /** Touch: no key list (the pause button opened this menu). */
  touch?: boolean;
  /** Show the scoreboard (touch has no Tab key). */
  onScores?(): void;
  /** Audit UX-09: full Settings from the pause menu. */
  onSettings?(): void;
  onResume(): void;
  onMute(m: boolean): void;
  onLeave(): void;
  /**
   * Audit UX-03: Leave asks first; `leaveCounts` (from match 4, solo, off Rookie: the matches that offer Forfeit)
   * says the leave is recorded as a forfeit loss.
   */
  leaveCounts?: boolean;
  /**
   * GAPS B2: Forfeit, offered from match tick `from` (the menu opened at `tick`; before `from` the button is disabled
   * and names the time). Absent: no Forfeit button (matches 1–3, Rookie).
   */
  forfeit?: { from: number; tick: number };
  onForfeit?(): void;
  /**
   * Party play (MULTIPLAYER.md §4.6, §7 M5): the menu is a local overlay over a running match: "Menu" and "Back to
   * match"; Pause becomes "Vote pause" and Forfeit "Vote surrender" (no confirm step: friends answer the vote).
   */
  party?: {
    onVotePause(): void;
    coop?: boolean;
    /** Casual PvP (V16.md §5): no Vote pause; Vote remake while `remake` (1:00 to 3:00); Mute opponents. */
    pvp?: boolean;
    remake?: boolean;
    onVoteRemake?(): void;
    onMuteOpponents?(): void;
  };
  /** Feel pass B1: the Camera height row picked a step (already saved): the match view follows at once. */
  onCameraHeight?(h: CameraHeight): void;
}

const clockText = (ticks: number): string => {
  const sec = Math.ceil(ticks / 30);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export function menuScreen(parent: HTMLElement, o: MenuOpts): HTMLElement {
  const root = el('pl-screen pl-menu');
  let muted = o.muted;
  const ff = o.forfeit && o.onForfeit ? o.forfeit : null;
  const ffReady = !!ff && ff.tick >= ff.from;
  const party = o.party ?? null;
  const main = (): void => {
    root.innerHTML = `<div class="card"><h2>${party ? 'Menu' : 'Paused'}</h2>
    <button class="pl-btn big" data-a="resume">${party ? 'Back to match' : 'Resume'}</button>
    ${party && !party.pvp ? '<button class="pl-btn ghost" data-a="vote-pause" data-testid="vote-pause">Vote pause</button>' : ''}
    ${party?.pvp && party.remake ? '<button class="pl-btn ghost" data-a="vote-remake" data-testid="vote-remake">Vote remake</button>' : ''}
    ${party?.pvp ? '<button class="pl-btn ghost" data-a="mute-opp" data-testid="mute-opponents">Mute opponents</button>' : ''}
    ${o.onScores ? `<button class="pl-btn ghost" data-a="scores">Scores</button>` : ''}
    <button class="pl-btn ghost" data-a="mute">${muted ? 'Sound: off' : 'Sound: on'}</button>
    ${o.onSettings ? '<button class="pl-btn ghost" data-a="settings">Settings</button>' : ''}
    ${o.onCameraHeight ? cameraHeightRowHtml() : ''}
    ${ff ? `<button class="pl-btn ghost danger" data-a="forfeit"${ffReady ? '' : ' disabled'}>${party ? (ffReady ? 'Vote surrender' : `Vote surrender from ${clockText(ff.from)}`) : ffReady ? 'Forfeit' : `Forfeit from ${clockText(ff.from)}`}</button>` : ''}
    <button class="pl-btn ghost danger" data-a="leave">Leave match</button>
    ${o.touch ? '' : `<p class="keys">${trackpadOn() ? '<kbd>Click</kbd>' : '<kbd>RMB</kbd>'} move / attack · <kbd>A</kbd>+<kbd>LMB</kbd> attack-move · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> ${castMode() === 'hold' ? 'hold to aim, release to cast' : 'cast at the cursor'} · <kbd>D</kbd> Paw Trick · <kbd>B</kbd> Nap · <kbd>S</kbd> stop · <kbd>Space</kbd> centre · <kbd>Wheel</kbd> camera height · <kbd>Tab</kbd> scores</p>`}</div>`;
  };
  // GAPS B2: the confirm step names what a forfeit costs before anything is sent
  const confirm = (): void => {
    root.innerHTML = `<div class="card pl-forfeit"><h2>Forfeit this match?</h2>
    <p class="sub">It counts as a loss. You get ${TREAT_XP.forfeit} Treat XP, no quest progress, and the full ladder loss.</p>
    <button class="pl-btn big" data-a="forfeit-no">Keep playing</button>
    <button class="pl-btn ghost danger" data-a="forfeit-yes">Forfeit</button></div>`;
  };
  // Audit UX-03: Leave was one free tap (nothing recorded); now a confirm step that says what it costs
  const leaveAsk = (): void => {
    root.innerHTML = `<div class="card pl-leave"><h2>Leave this match?</h2>
    <p class="sub">${party?.coop ? 'Leaving early adds a short wait before your next online match. Another player or a bot takes your place.' : party ? 'You go back to your party. Bots take your place.' : o.leaveCounts ? 'It counts as a loss on your record, like a forfeit.' : 'This match is not saved.'}</p>
    <button class="pl-btn big" data-a="leave-no">Keep playing</button>
    <button class="pl-btn ghost danger" data-a="leave-yes">Leave match</button></div>`;
  };
  main();
  if (o.onCameraHeight) bindCameraHeightRow(root, o.onCameraHeight);
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'resume') o.onResume();
    else if (a === 'scores') o.onScores?.();
    else if (a === 'settings') o.onSettings?.();
    else if (a === 'leave') leaveAsk();
    else if (a === 'leave-yes') o.onLeave();
    // the camera height row's listeners sit on `root` (bound once above), so a redrawn card keeps them
    else if (a === 'leave-no') main();
    else if (a === 'forfeit' && ffReady) {
      if (party) o.onForfeit?.();
      else confirm();
    } else if (a === 'vote-pause') party?.onVotePause();
    else if (a === 'vote-remake') party?.onVoteRemake?.();
    else if (a === 'mute-opp') party?.onMuteOpponents?.();
    else if (a === 'forfeit-no') main();
    else if (a === 'forfeit-yes') o.onForfeit?.();
    else if (a === 'mute') {
      muted = !muted;
      (root.querySelector('[data-a="mute"]') as HTMLElement).textContent = muted ? 'Sound: off' : 'Sound: on';
      o.onMute(muted);
    }
  });
  parent.appendChild(root);
  return root;
}

/** Portrait prompt on phones (§9: landscape only). Pure CSS decides when it shows. */
export function rotatePrompt(parent: HTMLElement): HTMLElement {
  const r = el('pl-rotate', `<div>${icon('paw')}<b>Turn your phone sideways</b><small>Pawlegends plays in landscape.</small></div>`);
  parent.appendChild(r);
  return r;
}

/** Loading veil between screens. */
/** GAPS A6: the loading screen's line for this hero: matches played on it and, in a card skin, that cat's Bond. */
export interface VeilHero {
  name: string;
  /** Finished matches on this hero before this one. */
  matches: number;
  /** Bond with the worn card skin's cat, or null. */
  bond: number | null;
}

export function loadingVeil(parent: HTMLElement, text: string, sub?: string, wearing?: { name: string; type: string; art?: string; frame?: string } | null, hero?: VeilHero | null): HTMLElement {
  const line = hero
    ? `<p class="hero-line" data-hero-matches="${hero.matches}">${hero.bond !== null ? `<span class="bond" data-bond="${hero.bond}">Bond ${hero.bond}</span>` : ''}<span>${hero.matches === 0 ? `First match as ${esc(hero.name)}` : `${hero.matches} ${hero.matches === 1 ? 'match' : 'matches'} as ${esc(hero.name)}`}</span></p>`
    : '';
  const r = el('pl-loading', `<div class="spin">${icon('paw')}</div><b>${esc(text)}</b>${sub ? `<small class="squad">${esc(sub)}</small>` : ''}${line}`);
  if (wearing) r.appendChild(wearingCard(wearing));
  parent.appendChild(r);
  return r;
}
