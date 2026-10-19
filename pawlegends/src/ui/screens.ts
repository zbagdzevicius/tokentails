/**
 * Out-of-match screens (POC.md §12): title → pick (8 heroes: a cats row with the four sim v9 shelter champions and
 * a dogs row; Paw Trick, difficulty) → match → results, plus the Esc menu and the portrait rotate prompt. DOM
 * overlays over the lobby turntable. English only.
 */
import './champions.css';
import { accountState } from '../meta/profile';
import { DIFFICULTIES } from '../data/bots';
import { HERO_IDS, HEROES } from '../data/heroes';
import { championOf } from '../data/heroes/shelter';
import { TRICK_IDS } from '../data/tricks';
import type { Difficulty, HeroId, TrickId } from '../sim/api';
import { chromaOptions, ELEMENT_COLOR, FRAME_NAME, resolveLook, wardrobe, wearsCardSkin, type FrameId, type Look, type Owned } from '../render/cosmetics';
import { ELEMENT_NAME, type CatTier, type Element } from '../meta/roster';

const cssHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
import { HERO_COLOR_CSS } from '../render/palette';
import type { Dare } from '../share/dare';
import { dareText } from '../share/dare';
import { DIFFICULTY_HINT, DIFFICULTY_TEXT, HERO_TEXT, TRICK_TEXT, abilityNumbers, pvpNumbers, trickNumbers } from './heroText';
import { portraitUrl } from '../render/portraits';
import { icon } from './icons';
import { wearingCard } from './cards';
import * as TL from '../data/timeline';
import { rookieAvailable } from '../app/firstSession';
import { castMode, trackpadOn } from '../input/presets';
import type { QuestView } from '../meta/quests';
import type { TreatGain } from '../meta/treats';
import type { Grade } from '../meta/grade';
import { toGoText } from './collection';

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

function badge(frame: FrameId | null | undefined, title: string | null | undefined, portrait?: string | null): string {
  if (!frame && !title) return '';
  const face = portrait ? ` style="background-image:url(${portrait})"` : '';
  // round 1: say where frames come from (a Legendary from a pack gives none: decision #19)
  // GAPS A1: a champion frame comes from the Treat Track
  const tip = frame?.startsWith('frame.champ.') ? 'Earned on the Treat Track.' : 'Frames come from cats you adopted by name, by their tier.';
  return `<div class="pl-badge" ${frame ? `data-frame="${frame}"` : ''} title="${tip}"><span class="ring${portrait ? ' pic' : ''}"${face}></span><span>${frame ? esc(FRAME_NAME[frame]) : ''}${title ? ` <b>${esc(title)}</b>` : ''}</span></div>`;
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
      <div class="logo"><span class="paw">${icon('paw')}</span><h1>Paw<b>legends</b></h1></div>
      <p class="tag">3v3 cats and dogs. Quick matches, big plays.</p>
      <div class="actions">${primary}</div>
      <p class="sub"><span class="acct">${accountState().signedIn ? 'Signed in: wins save to your account.' : 'No account needed.'}</span> ${o.firstTime ? (rookieAvailable() ? 'Your first match is a guided Rookie match.' : 'Your first match is a guided match against Easy bots.') : ''}</p>
      ${o.quests && o.quests.length ? `<div class="pl-quests mini"><b>Today</b>${o.quests.map((q) => questRow(q)).join('')}</div>` : ''}
      ${badge(o.frame, o.title, o.portrait)}
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
  /** What the player owns (coats, chromas); the wardrobe row hides when there is only the default. */
  owned?: Owned;
  looks?: Partial<Record<HeroId, Partial<Look>>>;
  onLook?(h: HeroId, look: Look): void;
  onHero(h: HeroId): void;
  onStart(c: Choice): void;
  onBack(): void;
  /** The bots chips (fun plan F1: hidden until the player has played a few matches). */
  difficulties?: readonly Difficulty[];
  /** Shown instead of the chips while they are locked. */
  difficultyNote?: string;
  /** Ability numbers on (round 1: "no numbers anywhere"); the Numbers chip toggles it. */
  numbers?: boolean;
  onNumbers?(on: boolean): void;
  /** Round 1: an experienced player can unlock the chips right away ("I've played MOBAs before"). */
  onVeteran?(): void;
  /**
   * Sim v9 shelter champions: the card art (`catImg`, from the host's `champions` message) and, web only, whether the
   * player owns the card (a badge; app builds pass owned: false). Every champion is free to play either way. No Meet
   * link here (GDD §8.1 #5: no offers on hero pick).
   */
  champions?: Partial<Record<HeroId, { art?: string; owned: boolean }>>;
  /**
   * GDD §7.2 card skins: the player's cats (every one wearable by every champion) and, web only from session 2, up to
   * two locked featured cats with a Preview (no price, no buy button, no link).
   */
  skins?: { owned: readonly SkinTile[]; locked: readonly SkinTile[] };
  /** Spin a locked featured skin on the turntable for a few seconds; false when the session's previews are used up. */
  onPreview?(skinId: string): boolean;
  /** A skin tile scrolled into view (its sprite probe may run). */
  onTileSeen?(skinId: string): void;
}

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
}

const RUNG_NAME: Readonly<Record<CatTier, string>> = Object.freeze({ COMMON: 'Common', RARE: 'Rare', EPIC: 'Epic', LEGENDARY: 'Legendary' });

/** One card skin tile (owned: selectable; locked: greyed with a Preview). */
export function skinTile(k: SkinTile, on: boolean, locked = false): string {
  const art = k.art ? `<img src="${esc(k.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : `<span class="noart">${icon('paw')}</span>`;
  const el = `<i class="el" style="--el:${cssHex(ELEMENT_COLOR[k.element])}" title="${esc(ELEMENT_NAME[k.element])}"></i>`;
  if (locked) {
    return `<div class="skin-tile locked" data-locked="${esc(k.id)}">${art}<b>${esc(k.name)}</b>${el}<button class="chip small" data-preview="${esc(k.id)}">Preview</button></div>`;
  }
  // round 2: a pack cat's missing frame is explained in the tooltip (as on its squad chip), never in visible text
  const title = k.fromPack ? ` title="${esc(`${k.name}: it gives its look and earns Bond; frames come from cats you adopted by name`)}" data-noframe="1"` : '';
  return `<button class="skin-tile ${on ? 'on' : ''}" data-coat="${esc(k.id)}" data-rung="${k.rung}" aria-pressed="${on}"${title}>${art}<b>${esc(k.name)}</b><span class="pip" data-rung="${k.rung}">${RUNG_NAME[k.rung]}</span>${el}<small class="bond">Bond ${k.bond}</small></button>`;
}

/** One pick tile: the portrait, and for a shelter champion its card art and the owner badge. */
function heroTile(h: HeroId, on: boolean, pic: string | null, champ: { art?: string; owned: boolean } | undefined): string {
  const x = HERO_TEXT[h];
  const face = pic ? `<i class="pic" style="background-image:url(${pic})"></i>` : `<i>${esc(x.title.replace('Sir ', '').slice(0, 2))}</i>`;
  const c = championOf(h);
  const card = c && champ?.art ? `<img class="champ-art" src="${esc(champ.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : '';
  const badge = c && champ?.owned ? `<span class="champ-owned" title="${esc(`From ${c.cardName}'s card`)}">Card</span>` : '';
  return `<button class="hero-card ${on ? 'on' : ''}${c ? ' champion' : ''}" data-h="${h}" style="--hero:${HERO_COLOR_CSS[h]}">${face}${card}${badge}<b>${esc(x.title)}</b><small>${x.side} · ${x.role}</small></button>`;
}

const faces = new WeakMap<HTMLElement, () => void>();
/** Redraw a pick screen's hero portraits in place (after a sprite probe changed a palette). */
export const refreshPickFaces = (root: HTMLElement): void => faces.get(root)?.();

export function pickScreen(parent: HTMLElement, o: PickOpts): HTMLElement {
  const root = el('pl-screen pl-pick');
  const c: Choice = { ...o.initial };
  const looks: Partial<Record<HeroId, Partial<Look>>> = { ...(o.looks ?? {}) };
  const lookOf = (h: HeroId): Look | null => (o.owned ? resolveLook(h, o.owned, looks[h]) : null);
  const wardrobeRow = (h: HeroId): string => {
    if (!o.owned) return '';
    const coats = wardrobe(h, o.owned);
    const chromas = chromaOptions(o.owned);
    const owned = o.skins?.owned ?? [];
    const locked = o.skins?.locked ?? [];
    if (coats.length < 2 && chromas.length < 2 && !owned.length && !locked.length) return '';
    const l = lookOf(h) as Look;
    const card = wearsCardSkin(l);
    const strip = owned.length || locked.length ? `<div class="skin-strip" role="list">${owned.map((k) => skinTile(k, k.id === l.coat)).join('')}${locked.map((k) => skinTile(k, false, true)).join('')}</div>` : '';
    return `<div class="row wardrobe skins"><span class="lbl">Skins</span>${coats
      .map((k) => `<button class="chip ${k.id === l.coat ? 'on' : ''}" data-coat="${esc(k.id ?? '')}" data-from="${k.from}">${esc(k.name)}</button>`)
      .join('')}${strip}${chromas.length > 1 && !card ? `<span class="swatches">${chromas.map((k) => `<button class="chip chroma ${k.id === l.chroma ? 'on' : ''}" data-chroma="${esc(k.id ?? '')}" title="${esc(k.name)} chroma" aria-label="${esc(k.name)} chroma" style="--el:${k.id ? cssHex(ELEMENT_COLOR[k.id]) : 'transparent'}"><span>${esc(k.name)}</span></button>`).join('')}</span>` : ''}</div>`;
  };
  let numbers = o.numbers === true;
  const render = (): void => {
    const t = HERO_TEXT[c.hero];
    root.innerHTML = `
      <div class="pl-pick-col">
        <div class="pl-pick-head"><button class="pl-btn ghost small" data-a="back">Back</button><h2>Choose your legend</h2></div>
        ${(['cat', 'dog'] as const)
          .map((side) => `<div class="heroes ${side}s" data-side="${side}">${HERO_IDS.filter((h) => HEROES[h].side === side)
            .map((h) => heroTile(h, h === c.hero, portraitUrl(h, lookOf(h)), o.champions?.[h]))
            .join('')}</div>`)
          .join('')}
        ${wardrobeRow(c.hero)}
        <div class="detail">
          <h3>${esc(t.title)} <small>${t.side}</small><span class="role-label" data-role="${esc(t.role)}">${esc(t.role)}</span>${o.onNumbers ? `<button class="chip numbers ${numbers ? 'on' : ''}" data-a="numbers" aria-pressed="${numbers}">Numbers</button>` : ''}</h3>
          <p class="blurb">${esc(t.blurb)}</p>
          ${championOf(c.hero) ? `<p class="champ-from">${esc(`Inspired by ${championOf(c.hero)?.cardName}'s Token Tails card.`)}${o.champions?.[c.hero]?.owned ? ` <span class="champ-owned">${esc(`From ${championOf(c.hero)?.cardName}'s card`)}</span>` : ''}</p>${t.flavour ? `<p class="champ-flavour">${esc(t.flavour)}</p>` : ''}` : ''}
          <ul class="kit">
            <li><span class="ico passive">${icon('paw')}</span><span class="t"><b>${esc(t.passive.name)}</b> ${esc(t.passive.text)}</span></li>
            ${t.abilities.map((a, i) => `<li title="${esc(`${a.name}: ${a.text} (${abilityNumbers(c.hero, i)})`)}"><span class="ico">${icon(a.icon)}</span><span class="t"><kbd>${'QWER'[i]}</kbd> <b>${esc(a.name)}</b> ${esc(a.text)}${numbers ? `<span class="num">${esc(abilityNumbers(c.hero, i))}</span>` : ''}</span></li>`).join('')}
          </ul>
          ${numbers && pvpNumbers(c.hero) ? `<p class="num pvp">${esc(pvpNumbers(c.hero))}</p>` : ''}
        </div>
        <div class="row"><span class="lbl">Paw Trick</span>${TRICK_IDS.map((tr) => `<button class="chip ${tr === c.trick ? 'on' : ''}" data-t="${tr}" title="${esc(`${TRICK_TEXT[tr].text} (${trickNumbers(tr)})`)}">${icon(TRICK_TEXT[tr].icon)}${esc(TRICK_TEXT[tr].name)}</button>`).join('')}</div>
      </div>
      <div class="pl-pick-foot">
        ${o.difficultyNote ? `<div class="row bots"><span class="lbl">Bots</span><span class="note">${esc(o.difficultyNote)}</span>${o.onVeteran ? `<button class="chip veteran" data-a="veteran">Played MOBAs before? Unlock</button>` : ''}</div>` : `<div class="row bots"><span class="lbl">Bots</span>${(o.difficulties ?? DIFFICULTIES).map((d) => `<button class="chip ${d === c.difficulty ? 'on' : ''}" data-d="${d}" title="${esc(DIFFICULTY_HINT[d] ?? '')}">${esc((DIFFICULTY_TEXT as Record<string, string>)[d] ?? d)}</button>`).join('')}</div>`}
        ${!o.difficultyNote && DIFFICULTY_HINT[c.difficulty] ? `<p class="bots-hint">${esc(DIFFICULTY_HINT[c.difficulty] as string)}</p>` : ''}
        <button class="pl-btn big" data-a="start">Play</button>
      </div>`;
  };
  // probes run lazily, for the tiles the player can see
  const io =
    typeof IntersectionObserver === 'function' && o.onTileSeen
      ? new IntersectionObserver((list) => {
          for (const en of list) if (en.isIntersecting) o.onTileSeen?.((en.target as HTMLElement).dataset.coat ?? (en.target as HTMLElement).dataset.locked ?? '');
        })
      : null;
  const watch = (): void => {
    if (!o.onTileSeen) return;
    for (const el of root.querySelectorAll<HTMLElement>('.skin-tile')) {
      if (io) io.observe(el);
      else o.onTileSeen(el.dataset.coat ?? el.dataset.locked ?? '');
    }
  };
  const render0 = render;
  const renderAll = (): void => {
    io?.disconnect();
    render0();
    watch();
  };
  renderAll();
  // a sprite probe landed: only the hero portraits are redrawn (the picks, a running Preview and the scroll stay)
  faces.set(root, () => {
    for (const box of root.querySelectorAll<HTMLElement>('.heroes[data-side]')) {
      const side = box.dataset.side;
      box.innerHTML = HERO_IDS.filter((h) => HEROES[h].side === side)
        .map((h) => heroTile(h, h === c.hero, portraitUrl(h, lookOf(h)), o.champions?.[h]))
        .join('');
    }
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const h = t.closest<HTMLElement>('[data-h]')?.dataset.h as HeroId | undefined;
    const tr = t.closest<HTMLElement>('[data-t]')?.dataset.t as TrickId | undefined;
    const d = t.closest<HTMLElement>('[data-d]')?.dataset.d as Difficulty | undefined;
    const a = t.closest<HTMLElement>('[data-a]')?.dataset.a;
    const coat = t.closest<HTMLElement>('[data-coat]')?.dataset.coat;
    const chroma = t.closest<HTMLElement>('[data-chroma]')?.dataset.chroma;
    const pb = t.closest<HTMLElement>('.skin-tile [data-preview]');
    const preview = pb?.dataset.preview;
    if (preview) {
      const ok = o.onPreview?.(preview) ?? false;
      const b = pb;
      if (b) {
        b.classList.add(ok ? 'playing' : 'spent');
        b.textContent = ok ? 'Previewing' : 'Seen';
      }
      return;
    }
    if (h) {
      c.hero = h;
      o.onHero(h);
    }
    if (coat !== undefined || chroma !== undefined) {
      const cur = lookOf(c.hero);
      if (cur) {
        const nextCoat = coat !== undefined ? coat || null : cur.coat;
        // card skins never carry a chroma (GDD §7.2)
        const next: Look = { coat: nextCoat, chroma: nextCoat && nextCoat.startsWith('cat.') ? null : chroma !== undefined ? ((chroma || null) as Look['chroma']) : cur.chroma };
        looks[c.hero] = next;
        o.onLook?.(c.hero, next);
      }
      return renderAll();
    }
    if (tr) c.trick = tr;
    if (d) c.difficulty = d;
    if (a === 'numbers') {
      numbers = !numbers;
      o.onNumbers?.(numbers);
      return renderAll();
    }
    if (a === 'veteran') return o.onVeteran?.();
    if (a === 'start') return o.onStart({ ...c });
    if (a === 'back') return o.onBack();
    if (h || tr || d) renderAll();
  });
  parent.appendChild(root);
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
  onShare(url: string): void;
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
  /** GDD §7.2: the card skin worn this match ("<name> fought as <Hero>") and its Bond after it. */
  skin?: { name: string; art?: string; bond: number; next: number | null } | null;
}

export interface ResultGrade {
  grade: Grade;
  /** Treat XP the grade added (GRADE_TREAT_XP). */
  xp: number;
  mvp: { name: string; you: boolean };
  /** A loss only: the best on the player's team. */
  bestOnTeam?: { name: string; you: boolean } | null;
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
}

function resultTable(rows: readonly ResultRow[]): string {
  const graded = rows.some((r) => r.grade);
  const tag = (r: ResultRow): string => (r.mvp ? ' <em class="mvp">MVP</em>' : r.best ? ' <em class="best">Best</em>' : '');
  const tr = (r: ResultRow): string =>
    `<tr class="${r.rel}"><td>${esc(r.name)}${tag(r)}</td><td>${r.k}/${r.d}/${r.a}</td><td>${r.heroDmg}</td><td>${r.towerDmg}</td>${graded ? `<td class="g" data-grade="${r.grade ?? ''}">${r.grade ?? ''}</td>` : ''}</tr>`;
  return `<details class="pl-table"><summary>Scoreboard</summary><table><thead><tr><th>Hero</th><th>K/D/A</th><th>Hero dmg</th><th>Tower dmg</th>${graded ? '<th>Grade</th>' : ''}</tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></details>`;
}

/** Sudden Death starts at 10:00 (data/timeline.ts TIMELINE.suddenDeath): after it the clock, not the player, ends the match. */
export const SUDDEN_DEATH_S = 600;

/** The line under Victory / Defeat, chosen by the margin (a 1–14 loss is not "so close"). Pure. */
export function resultLine(o: Pick<ResultsOpts, 'won' | 'kills' | 'teamKills' | 'difficulty' | 'heroDamage'>): string {
  const [ours, theirs] = o.teamKills;
  if (o.won) {
    // only when the player really stayed out of every fight (real stats, not just no takedowns)
    if (o.heroDamage !== undefined ? o.heroDamage === 0 : o.kills === 0) return 'Your team took the core. Next time, jump into a fight!';
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
      ${o.grade ? gradeBlock(o.grade, o.won) : ''}
      ${o.skin ? `<p class="pl-skin" data-bond="${o.skin.bond}">${o.skin.art ? `<img src="${esc(o.skin.art)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false">` : icon('paw')}<span><b>${esc(o.skin.name)}</b> fought as ${esc(HERO_TEXT[o.hero].title)}<small>Bond ${o.skin.bond}${o.skin.next !== null ? ` · next look at ${o.skin.next}` : ''}</small></span></p>` : ''}
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
        <p>Dare a friend: <b>${o.dareLink ? esc(dareText({ seed: 0, hero: o.hero, trick: 'pounce', difficulty: o.difficulty, seconds: o.seconds < sd ? o.seconds : 0 })) : ''}</b></p>
        <button class="pl-btn ghost" data-a="share">Copy dare link</button>
      </div>
      ${o.storeOpen || o.notifyOpen ? `<div class="extras">${o.storeOpen ? `<button class="pl-btn ghost small" data-a="store">${icon('crown')}Store</button>` : ''}${o.notifyOpen ? `<button class="pl-btn ghost small" data-a="notify">Legends Pass: notify me</button>` : ''}</div>` : ''}
    </div>
    <div class="actions pinned"><button class="pl-btn solid" data-a="change">Switch cat${o.tryHero ? `<small>Try ${esc(HERO_TEXT[o.tryHero].title)}: ${esc(HERO_TEXT[o.tryHero].role)}</small>` : ''}</button><button class="pl-btn big" data-a="again">Run it back<small>${esc(HERO_TEXT[o.hero].title)}, new bots</small></button></div>`;
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'again') o.onAgain();
    else if (a === 'change') o.onChange();
    else if (a === 'store') o.onStore?.();
    else if (a === 'notify') o.onNotify?.();
    else if (a === 'share' && o.dareLink) {
      o.onShare(o.dareLink);
      const b = root.querySelector('[data-a="share"]') as HTMLElement;
      b.textContent = 'Link copied!';
    }
  });
  parent.appendChild(root);
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
  onResume(): void;
  onMute(m: boolean): void;
  onLeave(): void;
}

export function menuScreen(parent: HTMLElement, o: MenuOpts): HTMLElement {
  const root = el('pl-screen pl-menu');
  root.innerHTML = `<div class="card"><h2>Paused</h2>
    <button class="pl-btn big" data-a="resume">Resume</button>
    ${o.onScores ? `<button class="pl-btn ghost" data-a="scores">Scores</button>` : ''}
    <button class="pl-btn ghost" data-a="mute">${o.muted ? 'Sound: off' : 'Sound: on'}</button>
    <button class="pl-btn ghost danger" data-a="leave">Leave match</button>
    ${o.touch ? '' : `<p class="keys">${trackpadOn() ? '<kbd>Click</kbd>' : '<kbd>RMB</kbd>'} move / attack · <kbd>A</kbd>+<kbd>LMB</kbd> attack-move · <kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> ${castMode() === 'hold' ? 'hold to aim, release to cast' : 'cast at the cursor'} · <kbd>D</kbd> Paw Trick · <kbd>B</kbd> Nap · <kbd>S</kbd> stop · <kbd>Space</kbd> centre · <kbd>Tab</kbd> scores</p>`}</div>`;
  let muted = o.muted;
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (a === 'resume') o.onResume();
    else if (a === 'scores') o.onScores?.();
    else if (a === 'leave') o.onLeave();
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
