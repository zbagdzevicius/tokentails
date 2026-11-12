/**
 * Champion select, adapted from Wild Rift (docs/plans/moba/LANDING-PICK-UX.md Part B). One component for every mode that
 * picks a hero: solo vs bots (ui/screens.ts `pickScreen`), the friend party, Quick Play co-op and casual PvP
 * (party/ui/partyPick.ts). It replaces the old solo column and the party strip-and-grid.
 *
 * Regions: the header (Back or nothing, the title and the 30 s timer, the side badge), the team column (one seat per
 * team member), the filter tabs (All · Cats · Dogs, then the six roles), the portrait grid, the hero panel (name, role,
 * difficulty, Look, the P Q W E R skill row and the tapped skill's text, Preview), and the bottom bar (bots or Leave,
 * LOCK IN, the Paw Trick row).
 *
 * Rules: the screen never scrolls; only the grid may, and then it shows it (a cut last row, a fade, "▾ more", a visible
 * thumb). One tap on a portrait selects it and shows its skills; LOCK IN commits; a double tap on a portrait (300 ms)
 * also locks in. No 3D here: portraits are the baked PNGs (letter fallback), the live clip stays in the champion
 * browser behind Preview. Data is read from HERO_TEXT, the skill codex (loaded lazily, as the browser does), the
 * browser's difficulty table and the trick text; nothing is copied.
 *
 * Pure markup (`champSelectHtml`) plus a wiring (`wireChampSelect`) for the parts that never leave the screen: the
 * filter tabs, the skill tabs, the numbers toggle, the grid's "more" chip, double tap, arrow keys and Ctrl/Cmd+Enter.
 * The mode's own actions stay where they were: `data-a` (solo) and `data-p` (party) on the tiles, tricks, LOCK IN and
 * Preview. `patchChampSelect` redraws a screen in place, region by region, so the grid scroll, the focus and the
 * tapped skill survive a redraw.
 */
import './champSelect.css';
import { HEROES } from '../../data/heroes';
import type { HeroId, HeroRole, HeroSide } from '../../data/heroes/types';
import { TRICK_IDS } from '../../data/tricks';
import type { TrickId } from '../../sim/api';
import { HERO_COLOR_CSS } from '../../render/palette';
import { HERO_TEXT, sec, trickText, type IconId } from '../heroText';
import { icon } from '../icons';
import { laneHint } from '../pingText';
import { cardAttrs, heroElement, heroPic } from '../cards/el';
import { DIFFICULTY_NAME, HERO_DIFFICULTY } from '../champBrowser/meta';
import type { SkillSlot } from '../skillCodex/facts';
import { ROLE_ICON, ROLE_NAME, ROLE_ORDER, SIDE_TAB_CSS, isNewHero } from './roles';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The skill tabs of the panel (no basic attack: the browser has it). */
export type PanelSlot = Exclude<SkillSlot, 'basic'>;
export const PANEL_SLOTS: readonly PanelSlot[] = Object.freeze(['passive', 'q', 'w', 'e', 'r'] as PanelSlot[]);
export type SideFilter = 'all' | HeroSide;

/** One team seat (§B5). */
export interface SeatModel {
  /** The username, "You", or "Bot". */
  name: string;
  hero: HeroId | null;
  /** `pick`: solo's own seat (the selected hero, no lock step). */
  state: 'empty' | 'hover' | 'locked' | 'bot' | 'pick';
  you?: boolean;
  trick?: TrickId | null;
  /** Line 2 for a bot ("Bot · Easy"). */
  sub?: string;
}

/** A tile's state for this player. */
export interface TileState {
  /** Another human locked it: their name. */
  taken?: string;
  /** Not lockable by this player (dogs before match 1, the other side): why. Still viewable unless `disabled`. */
  locked?: string;
  /** A party tile that cannot take a tap. */
  disabled?: boolean;
  /** Viewable but not lockable by this player now (taken, the other side, or this player already locked): the tile
   * still takes a tap to show its skills, and is marked aria-disabled. */
  blocked?: boolean;
  /** "New? Try this" (a new player's easy hero). */
  tryThis?: boolean;
  /** A teammate hovers it: their seat index (a corner dot). */
  mate?: number;
  /** CHAMPION-STORE.md §10: a short champion badge ("Free" this week). */
  champTag?: string | null;
}

export interface CsModel {
  kind: 'solo' | 'party';
  seats: readonly SeatModel[];
  /** The grid's heroes in order (cats then dogs; Quick Play: the assigned side only). */
  heroes: readonly HeroId[];
  /** The hero in the panel (the ring in the grid). */
  selected: HeroId | null;
  /** All · Cats · Dogs (hidden when the side is fixed). */
  sideTabs: boolean;
  /** The only side this player can lock (a friend party's member once the leader chose a side): the side tab moves to
   * it when it changes (not on every redraw, so the player can still look at the other side or All). */
  lockSide?: HeroSide | null;
  /** Dogs locked before match 1 (solo): the Dogs tab shows a lock; the tiles stay viewable. */
  dogsLocked?: boolean;
  tile?(h: HeroId): TileState;
  portrait?(h: HeroId): string | null;
  trick: TrickId;
  tricksDisabled?: boolean;
  /** Sim v10 (GAPS B5): the role's Paw Trick hint ("Tank → Shake Off: …"), '' when none. */
  trickHint?: string;
  /** Seconds left (party modes); null = no timer. */
  timer?: number | null;
  title?: string;
  headLeft?: string;
  headRight?: string;
  /** Under the title (Quick Play's found line). */
  headNote?: string;
  /** Under the seats (casual PvP's hidden-opponents line, the leader's side note). */
  teamNote?: string;
  footLeft?: string;
  lock: { enabled: boolean; label: string; sub?: string; locked?: boolean; unlockLabel?: string };
  /** The round-1 numbers pref: the cooldown and the facts show only when it is on. */
  numbers: boolean;
  /** The numbers toggle in the panel (absent: no toggle). */
  numbersToggle?: boolean;
  /** Solo with the cards drawer: a Look button in the panel header. */
  look?: boolean;
  /** Solo: the open Look sheet (free and store coats, colour tints, the cards drawer), drawn over the panel. */
  lookSheet?: string;
  error?: string | null;
  /** A short-lived line over LOCK IN (the bots' hint after a tap on a phone, where the hint has no room). */
  note?: string | null;
  /** CHAMPION-STORE.md §10: the unlock row over LOCK IN for a locked champion (Yarn, a Champion Pick, the web price). */
  champBar?: string;
  /** Root attributes (party: data-locked, data-mm, data-pvp). */
  rootAttrs?: string;
  rootClass?: string;
}

// ------------------------------------------------------------------------------------------- session state

/** What the player chose on the screen this session: the side and role tabs and the tapped skill (§B3). */
const ui: { side: SideFilter | null; role: HeroRole | null; slot: PanelSlot } = { side: null, role: null, slot: 'passive' };
/** The last `lockSide` the side tab followed. */
let followed: HeroSide | null = null;

/** A new champion select opens: the role filter clears, and the side tab keeps the player's last choice only when it
 * shows `selected` (else the selected hero's side, so ten tiles fit with no scroll). The tapped skill is kept. */
export function openChampSelect(selected: HeroId | null, lockSide: HeroSide | null = null): void {
  ui.role = null;
  followed = lockSide;
  const side = lockSide ?? (selected ? HEROES[selected].side : null);
  if (ui.side && ui.side !== 'all' && side && ui.side !== side) ui.side = null;
  if (!ui.side) ui.side = side ?? 'all';
}

/** The current tab and skill choice (tests, and the solo screen's redraws). */
export const champSelectState = (): Readonly<typeof ui> => ({ ...ui });
/** Reset the session state (tests). */
export function resetChampSelect(): void {
  ui.side = null;
  ui.role = null;
  ui.slot = 'passive';
  followed = null;
}

/** True when `h` passes the side and role filters. Pure. */
export function passesFilter(h: HeroId, side: SideFilter | null, role: HeroRole | null): boolean {
  const d = HEROES[h];
  return (!side || side === 'all' || d.side === side) && (!role || d.role === role);
}

/** "0:27". */
export const timerText = (s: number): string => `0:${String(Math.max(0, Math.min(59, Math.floor(s)))).padStart(2, '0')}`;

// ------------------------------------------------------------------------------------------- skill text

type CodexMod = typeof import('../skillCodex');
let codex: CodexMod | null = null;
let codexLoading = false;
/** The skill codex (its words and real numbers), loaded once, as the champion browser does; the panel shows
 * HERO_TEXT's line until it is in, then redraws in place. */
function loadCodex(): void {
  if (codex || codexLoading) return;
  codexLoading = true;
  void import('../skillCodex')
    .then((m) => {
      codex = m;
      if (typeof document !== 'undefined') for (const p of document.querySelectorAll<HTMLElement>('.cs-panel[data-hero]')) redrawSkill(p);
    })
    .catch(() => undefined)
    .finally(() => {
      codexLoading = false;
    });
}
/** Tests: wait for the codex. */
export async function champCodexReady(): Promise<void> {
  if (!codex) codex = await import('../skillCodex');
}

export interface SkillInfo {
  slot: PanelSlot;
  key: string;
  kind: string;
  name: string;
  icon: IconId;
  what: string;
  /** "8 s" (empty for the passive). */
  cooldown: string;
  /** "Damage 220 (+…)" lines (the codex), first ones first. */
  facts: string[];
}

const KIND: Readonly<Record<PanelSlot, string>> = { passive: 'Passive', q: 'Skill 1', w: 'Skill 2', e: 'Skill 3', r: 'Ultimate' };

/** One skill tab's words and numbers. Pure (the codex adds its own line and facts once loaded). */
export function skillInfo(h: HeroId, slot: PanelSlot): SkillInfo {
  const t = HERO_TEXT[h];
  const i = slot === 'passive' ? -1 : 'qwer'.indexOf(slot);
  const ab = i >= 0 ? t.abilities[i] : undefined;
  const base: SkillInfo = {
    slot,
    key: i >= 0 ? 'QWER'[i] : 'P',
    kind: KIND[slot],
    name: slot === 'passive' ? t.passive.name : (ab?.name ?? ''),
    icon: ab?.icon ?? 'paw',
    what: slot === 'passive' ? t.passive.text : (ab?.text ?? ''),
    cooldown: '',
    facts: [],
  };
  if (i >= 0) {
    const cd = (HEROES[h].abilities as Record<string, { cooldown?: number }>)[slot]?.cooldown;
    if (cd) base.cooldown = sec(cd);
  }
  if (codex) {
    const c = codex.skillCard(h, slot);
    base.what = c.what || base.what;
    const cdFact = c.facts.find((f) => f.label === 'Cooldown');
    if (cdFact) base.cooldown = cdFact.value;
    base.facts = codex.factLines({ ...c, facts: c.facts.filter((f) => f.label !== 'Cooldown') });
  }
  return base;
}

// ------------------------------------------------------------------------------------------------ markup

const GRID =
  '<svg class="pl-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M8 8h9v9H8zM20 8h9v9h-9zM32 8h9v9h-9zM8 20h9v9H8zM20 20h9v9h-9zM32 20h9v9h-9zM8 32h9v9H8zM20 32h9v9h-9zM32 32h9v9h-9z"/></svg>';
const SIDE_ICON: Readonly<Record<HeroSide, IconId>> = { cat: 'paw', dog: 'bone' };
const SIDE_NAME: Readonly<Record<SideFilter, string>> = { all: 'All', cat: 'Cats', dog: 'Dogs' };

function face(h: HeroId | null, pic: string | null | undefined, cls = ''): string {
  if (!h) return `<span class="cs-sf q${cls}" aria-hidden="true">?</span>`;
  return `<span class="cs-sf${cls}" ${cardAttrs(heroElement(h), null)} aria-hidden="true">${heroPic(h, pic ?? null)}</span>`;
}

/** One seat (§B5 table). */
export function seatHtml(s: SeatModel, i: number, portrait: (h: HeroId) => string | null, party: boolean): string {
  const hero = s.hero && s.hero in HEROES ? s.hero : null;
  const title = hero ? HERO_TEXT[hero].title : '';
  let l1: string;
  let l2: string;
  if (s.state === 'bot') {
    l1 = title || 'Bot';
    l2 = s.sub ?? (title ? 'Bot' : 'Picked at start');
  } else if (s.state === 'locked' || s.state === 'pick') {
    l1 = title || 'Selecting…';
    l2 = s.name;
  } else {
    l1 = 'Selecting…';
    l2 = s.name;
  }
  const pic = hero ? portrait(hero) : null;
  const dim = s.state === 'hover' ? ' dim' : '';
  const trick = s.trick && s.state !== 'bot' ? `<i class="cs-strick" title="${esc(trickText(s.trick, hero ?? undefined).name)}">${icon(trickText(s.trick, hero ?? undefined).icon)}</i>` : '';
  const cls = `cs-seat${party ? ' pp-ts' : ''}${s.state === 'bot' ? ' bot' : ''}${s.you ? ' me' : ''}`;
  return `<li class="${cls}" data-i="${i}" data-state="${s.state}" data-hero="${hero ?? ''}" data-locked="${s.state === 'locked'}" data-hover="${s.state === 'hover'}"${s.you ? ' data-me="1"' : ''} title="${esc(`${s.name}: ${l1}`)}">${face(hero, pic, dim)}${s.state === 'locked' ? '<i class="cs-ok" aria-hidden="true">✓</i>' : ''}<span class="cs-st"><b>${esc(l1)}</b><small>${esc(l2)}</small></span>${trick}</li>`;
}

function tabsHtml(m: CsModel): string {
  const side = ui.side ?? 'all';
  const sides = m.sideTabs
    ? `<div class="cs-sides side-switch" role="radiogroup" aria-label="Side">${(['all', 'cat', 'dog'] as SideFilter[])
        .map((sd) => {
          const on = sd === side;
          const n = sd === 'all' ? m.heroes.length : m.heroes.filter((h) => HEROES[h].side === sd).length;
          const lock = sd === 'dog' && m.dogsLocked;
          const label = `${SIDE_NAME[sd]}, ${n} heroes${lock ? ', unlock after your first match' : ''}`;
          return `<button type="button" class="cs-tab side-tab ${sd}${on ? ' on' : ''}"${sd === 'all' ? '' : ` style="--side:${SIDE_TAB_CSS[sd]}"`} role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-cs="side" data-side="${sd}" aria-label="${esc(label)}" title="${esc(label)}">${sd === 'all' ? GRID : icon(SIDE_ICON[sd])}<b>${SIDE_NAME[sd]}</b>${lock ? '<span class="cs-tlock" aria-hidden="true">🔒</span>' : ''}</button>`;
        })
        .join('')}</div><i class="cs-div" aria-hidden="true"></i>`
    : '';
  const roles = `<div class="cs-roles" role="group" aria-label="Role">${ROLE_ORDER.map((r) => {
    const on = ui.role === r;
    return `<button type="button" class="cs-tab role${on ? ' on' : ''}" aria-pressed="${on}" data-cs="role" data-role="${r}" aria-label="${esc(ROLE_NAME[r])}" title="${esc(ROLE_NAME[r])}">${icon(ROLE_ICON[r])}<b>${esc(ROLE_NAME[r])}</b></button>`;
  }).join('')}</div>`;
  return `<div class="cs-tabs">${sides}${roles}</div>`;
}

function tileHtml(m: CsModel, h: HeroId, focusH: HeroId | null): string {
  const t = HERO_TEXT[h];
  const st = m.tile?.(h) ?? {};
  const on = h === m.selected;
  const show = passesFilter(h, m.sideTabs ? ui.side : 'all', ui.role);
  const name = t.title;
  const label = `${t.title}, ${t.side} ${t.role}`;
  const why = st.taken ? `Taken: ${st.taken}` : (st.locked ?? '');
  const party = m.kind === 'party' ? ` data-p="hero" data-v="${h}" data-testid="party-hero-${h}"` : '';
  const dis = st.disabled ? ' disabled aria-disabled="true"' : st.blocked ? ' aria-disabled="true" data-blocked="1"' : '';
  const cls = `cs-tile${on ? ' on' : ''}${st.taken ? ' taken' : ''}${st.locked ? ' locked' : ''}`;
  const badges = [
    `<i class="cs-sb ${HEROES[h].side}" style="--side:${SIDE_TAB_CSS[HEROES[h].side]}" aria-hidden="true">${icon(SIDE_ICON[HEROES[h].side])}</i>`,
    isNewHero(h) ? '<span class="cs-new new-tag">New</span>' : st.champTag && !st.locked ? `<span class="cs-new champ-free">${esc(st.champTag)}</span>` : '',
    st.locked && !st.taken ? '<span class="cs-lk" aria-hidden="true">🔒</span>' : '',
    st.taken ? `<span class="cs-taken pp-taken">${esc(`Taken: ${st.taken}`)}</span>` : '',
    st.tryThis && !st.taken && !st.locked ? '<span class="cs-try pp-try">New? Try this</span>' : '',
    st.mate !== undefined ? `<i class="cs-mate" data-mate="${st.mate}" aria-hidden="true"></i>` : '',
  ].join('');
  return `<button type="button" class="${cls}" data-h="${h}" data-side="${HEROES[h].side}" data-role="${HEROES[h].role}"${isNewHero(h) ? ' data-new="1"' : ''}${name.length > 9 ? ' data-long="1"' : ''}${st.taken ? ' data-taken="1"' : ''}${party} aria-pressed="${on}" aria-label="${esc(why ? `${label}. ${why}` : label)}" tabindex="${h === focusH ? 0 : -1}"${show ? '' : ' hidden'}${dis} style="--hero:${HERO_COLOR_CSS[h]}">${face(h, m.portrait ? m.portrait(h) : undefined, ' cs-face')}<span class="cs-tn">${esc(name)}</span>${badges}</button>`;
}

function dots(h: HeroId): string {
  const d = HERO_DIFFICULTY[h] ?? 1;
  return `<span class="cs-diff" role="img" aria-label="${esc(`Difficulty: ${DIFFICULTY_NAME[d]}`)}" title="${esc(`Difficulty: ${DIFFICULTY_NAME[d]}`)}">${[1, 2, 3].map((i) => `<i class="${i <= d ? 'on' : ''}"></i>`).join('')}<small>${DIFFICULTY_NAME[d]}</small></span>`;
}

/** The selected skill's name, meta line, text and (numbers on) facts. */
function skillTextHtml(h: HeroId, slot: PanelSlot, numbers: boolean, kind: 'solo' | 'party', toggle: boolean): string {
  const s = skillInfo(h, slot);
  const meta = [s.key, s.kind, numbers && s.cooldown ? `Cooldown ${s.cooldown}` : ''].filter(Boolean).join(' · ');
  const preview =
    kind === 'party'
      ? `<button type="button" class="cs-preview pl-btn ghost small pp-info" data-p="info" data-v="${h}" data-slot="${slot}" data-testid="party-info" aria-haspopup="dialog" aria-label="Preview ${esc(s.name)}" title="Watch it and read the lore">▶<span> Preview</span></button>`
      : `<button type="button" class="cs-preview pl-btn ghost small" data-a="codex" data-slot="${slot}" aria-haspopup="dialog" aria-label="Preview ${esc(s.name)}" title="Watch it and read the lore">▶<span> Preview</span></button>`;
  const nt = toggle ? `<button type="button" class="cs-num" data-cs="numbers" aria-pressed="${numbers}" title="Show numbers" aria-label="Show numbers">123</button>` : '';
  const facts = numbers && s.facts.length ? `<ul class="cs-facts">${s.facts.slice(0, 2).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
  return `<b class="cs-sk-name">${esc(s.name)}</b><p class="cs-meta"><span>${esc(meta)}</span>${nt}${preview}</p><p class="cs-what">${esc(s.what)}</p>${facts}`;
}

/** The hero panel (§B2.5). */
export function panelHtml(h: HeroId | null, o: { numbers: boolean; kind: 'solo' | 'party'; look?: boolean; toggle?: boolean; sheet?: string }): string {
  if (!h) return `<section class="cs-panel empty" aria-label="Hero"><p class="cs-what">Tap a hero to see its skills.</p></section>`;
  const t = HERO_TEXT[h];
  const role = HEROES[h].role;
  loadCodex();
  const tabs = PANEL_SLOTS.map((sl) => {
    const info = skillInfo(h, sl);
    const on = sl === ui.slot;
    return `<button type="button" class="cs-sk${sl === 'passive' ? ' passive' : ''}${sl === 'r' ? ' ult' : ''}${on ? ' on' : ''}" role="tab" aria-selected="${on}" aria-controls="cs-skill-text" tabindex="${on ? 0 : -1}" data-cs="slot" data-slot="${sl}" aria-label="${esc(`${info.key === 'P' ? 'Passive' : info.key}: ${info.name}`)}" title="${esc(info.name)}">${icon(info.icon)}<kbd>${info.key}</kbd></button>`;
  }).join('');
  return `<section class="cs-panel" aria-label="${esc(t.title)}" data-hero="${h}" data-kind="${o.kind}" data-numbers="${o.numbers ? 1 : 0}"${o.look ? ' data-look="1"' : ''}${o.toggle ? ' data-toggle="1"' : ''}>
      <div class="cs-ph"><span class="cs-ri" aria-hidden="true">${icon(ROLE_ICON[role])}</span><div class="cs-pn"><b class="cs-name">${esc(t.title)}</b><span class="cs-rl"><span class="cs-role" title="${esc(laneHint(t.role))}">${esc(t.role)} ${dots(h)}</span>${o.look ? `<button type="button" class="cs-look pl-btn ghost small" data-a="look" aria-haspopup="dialog" aria-expanded="${!!o.sheet}">Look</button>` : ''}</span></div></div>
      <div class="cs-skills" role="tablist" aria-label="Skills">${tabs}</div>
      <div class="cs-skill" role="tabpanel" id="cs-skill-text">${skillTextHtml(h, ui.slot, o.numbers, o.kind, !!o.toggle)}</div><p class="cs-lane lane-hint">${esc(laneHint(t.role))}</p>${o.sheet ?? ''}
    </section>`;
}

function redrawSkill(panel: HTMLElement): void {
  const h = panel.dataset.hero as HeroId | undefined;
  const box = panel.querySelector<HTMLElement>('.cs-skill');
  if (!h || !box || !(h in HEROES)) return;
  box.innerHTML = skillTextHtml(h, ui.slot, panel.dataset.numbers === '1', panel.dataset.kind === 'party' ? 'party' : 'solo', panel.dataset.toggle === '1');
  for (const b of panel.querySelectorAll<HTMLElement>('[data-cs="slot"]')) {
    const on = b.dataset.slot === ui.slot;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function tricksHtml(m: CsModel): string {
  const hero = m.selected ?? undefined;
  const cur = trickText(m.trick, hero);
  const btns = TRICK_IDS.map((tr) => {
    const tt = trickText(tr, hero);
    const on = tr === m.trick;
    const act = m.kind === 'party' ? `data-p="trick" data-v="${tr}"` : `data-t="${tr}"`;
    const rec = !!m.trickHint && m.trickHint.includes(tt.name);
    return `<button type="button" class="cs-trick${m.kind === 'party' ? ' pp-trick' : ''}${on ? ' on' : ''}" role="radio" aria-checked="${on}" tabindex="${on ? 0 : -1}" ${act}${m.tricksDisabled ? ' disabled' : ''}${rec ? ' data-rec="1"' : ''} aria-label="${esc(tt.name)}" title="${esc(`${tt.name}: ${tt.text}${rec ? ` (${m.trickHint})` : ''}`)}">${icon(tt.icon)}<span class="cs-vh">${esc(tt.name)}</span></button>`;
  }).join('');
  return `<div class="cs-tricks" role="radiogroup" aria-label="Paw Trick"><small class="cs-trick-name"><span>Paw Trick:</span> ${esc(cur.name)}</small><div class="cs-trow">${btns}</div><p class="cs-trick-text">${esc(m.trickHint || cur.text)}</p>${m.trickHint ? `<p class="cs-vh trick-hint">${esc(m.trickHint)}</p>` : ''}</div>`;
}

function lockHtml(m: CsModel): string {
  const act = m.kind === 'party' ? 'data-p="lock" data-testid="party-lock"' : 'data-a="start"';
  if (m.lock.locked) {
    return `<button type="button" class="pl-btn ghost cs-unlock" data-p="unlock" data-testid="party-unlock">${esc(m.lock.unlockLabel ?? 'Change hero')}</button><button type="button" class="pl-btn big cs-lock done" ${act} disabled><span>${esc(m.lock.label)}</span>${m.lock.sub ? `<small>${esc(m.lock.sub)}</small>` : ''}</button>`;
  }
  return `<button type="button" class="pl-btn big cs-lock" ${act} aria-keyshortcuts="Control+Enter"${m.lock.enabled ? '' : ' disabled'}><span>${esc(m.lock.label)}</span>${m.lock.sub ? `<small class="cs-why">${esc(m.lock.sub)}</small>` : ''}</button>`;
}

/** The whole screen. Pure (reads the session tab and skill choice). */
export function champSelectHtml(m: CsModel): string {
  if (ui.side === null) openChampSelect(m.selected, m.lockSide ?? null);
  else if (m.sideTabs && m.lockSide && m.lockSide !== followed) {
    followed = m.lockSide;
    ui.side = m.lockSide;
  } else if (!m.lockSide) followed = null;
  const portrait = (h: HeroId): string | null => (m.portrait ? m.portrait(h) : null);
  const shown = (h: HeroId): boolean => passesFilter(h, m.sideTabs ? ui.side : 'all', ui.role) && !m.tile?.(h).disabled;
  const focusH = m.selected && m.heroes.includes(m.selected) && shown(m.selected) ? m.selected : (m.heroes.find(shown) ?? null);
  const timer =
    m.timer !== undefined && m.timer !== null
      ? `<span class="cs-timer pp-timer" data-timer data-testid="party-timer"${m.timer < 10 ? ' data-low="1"' : ''}>${timerText(m.timer)}</span>`
      : '';
  const seats = m.seats.map((s, i) => seatHtml(s, i, portrait, m.kind === 'party')).join('');
  const why = m.error ? `<p class="cs-err pp-err" role="alert">${esc(m.error)}</p>` : m.note ? `<p class="cs-err cs-note bots-hint" role="status">${esc(m.note)}</p>` : '';
  return `<div class="cs ${m.rootClass ?? ''}" data-kind="${m.kind}" data-seats="${m.seats.length}"${m.rootAttrs ? ` ${m.rootAttrs}` : ''}>
    <header class="cs-head"><div class="cs-hl">${m.headLeft ?? ''}</div><div class="cs-title"><h2>${esc(m.title ?? 'Choose your legend')}</h2>${timer}${m.headNote ?? ''}</div><div class="cs-hr">${m.headRight ?? ''}</div></header>
    <aside class="cs-team" aria-label="Your team"><ol class="cs-seats pp-strip" style="--n:${Math.max(1, m.seats.length)}">${seats}</ol>${m.teamNote ?? ''}</aside>
    <section class="cs-mid">${tabsHtml(m)}<div class="cs-gridwrap"><div class="cs-grid${m.kind === 'party' ? ' pp-heroes' : ''}" role="group" aria-label="Heroes">${m.heroes.map((h) => tileHtml(m, h, focusH)).join('')}</div><button type="button" class="cs-more" data-cs="more" tabindex="-1" hidden>▾ more</button></div></section>
    ${panelHtml(m.selected, { numbers: m.numbers, kind: m.kind, look: m.look, toggle: m.numbersToggle, sheet: m.lookSheet })}
    <div class="cs-fl">${m.footLeft ?? ''}</div>
    <div class="cs-fc">${why}${m.champBar ? `<div class="cs-champ" role="group" aria-label="Unlock">${m.champBar}</div>` : ''}${lockHtml(m)}</div>
    <div class="cs-fr">${tricksHtml(m)}</div>
  </div>`;
}

// ------------------------------------------------------------------------------------------------ wiring

const REGIONS = ['.cs-head', '.cs-team', '.cs-tabs', '.cs-grid', '.cs-panel', '.cs-fl', '.cs-fc', '.cs-fr'] as const;

/**
 * Redraw the champion select inside `container` from fresh markup, region by region (an unchanged region is left
 * alone), keeping the grid scroll and the focused tile. False when there is no screen to patch (the caller sets the
 * markup itself).
 */
export function patchChampSelect(container: HTMLElement, html: string): boolean {
  const cur = container.querySelector<HTMLElement>(':scope > .cs');
  if (!cur) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const next = tmp.querySelector<HTMLElement>(':scope > .cs');
  if (!next) return false;
  for (const a of [...cur.attributes]) if (!next.hasAttribute(a.name)) cur.removeAttribute(a.name);
  for (const a of [...next.attributes]) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  const active = document.activeElement as HTMLElement | null;
  const focusH = active && cur.contains(active) ? (active.closest<HTMLElement>('[data-h]')?.dataset.h ?? null) : null;
  const focusSel = active && cur.contains(active) && !focusH ? selectorOf(active) : null;
  for (const sel of REGIONS) {
    const a = cur.querySelector<HTMLElement>(sel);
    const b = next.querySelector<HTMLElement>(sel);
    if (!a || !b) continue;
    if (bare(a) === b.outerHTML) continue;
    if (sel === '.cs-grid') {
      const top = a.scrollTop;
      a.innerHTML = b.innerHTML;
      for (const at of [...b.attributes]) a.setAttribute(at.name, at.value);
      a.scrollTop = top;
    } else {
      // a host slot (the integration's squad under the seats) keeps what the host drew in it
      for (const slot of a.querySelectorAll<HTMLElement>(HOST_SLOT)) b.querySelector<HTMLElement>(`${HOST_SLOT}[data-slot="${slot.dataset.slot}"]`)?.replaceChildren(...slot.childNodes);
      a.replaceWith(b);
    }
  }
  if (focusH) cur.querySelector<HTMLElement>(`[data-h="${focusH}"]`)?.focus({ preventScroll: true });
  else if (focusSel && !cur.contains(document.activeElement)) cur.querySelector<HTMLElement>(focusSel)?.focus({ preventScroll: true });
  syncMore(cur);
  return true;
}

/**
 * A host slot: a `<div data-slot>` the embed integration draws into (ui/cards.ts). Only divs: the skill tabs and the
 * Preview button carry `data-slot` too (the skill they name), and their contents are ours, never kept across a redraw.
 */
const HOST_SLOT = 'div[data-slot]';

/** A region's markup without what a host drew into its slots (compared with fresh markup). */
function bare(el: HTMLElement): string {
  if (!el.querySelector(HOST_SLOT)) return el.outerHTML;
  const c = el.cloneNode(true) as HTMLElement;
  for (const s of c.querySelectorAll(HOST_SLOT)) s.replaceChildren();
  return c.outerHTML;
}

function selectorOf(el: HTMLElement): string | null {
  for (const k of ['cs', 'p', 'a', 't', 'd']) {
    const v = el.dataset[k];
    if (v === undefined) continue;
    const attr = k === 'cs' ? 'data-cs' : `data-${k}`;
    const extra = el.dataset.slot ? `[data-slot="${el.dataset.slot}"]` : el.dataset.side ? `[data-side="${el.dataset.side}"]` : el.dataset.role ? `[data-role="${el.dataset.role}"]` : el.dataset.v ? `[data-v="${el.dataset.v}"]` : '';
    return `[${attr}="${v}"]${extra}`;
  }
  return null;
}

/** Show the filter's tiles, mark the tabs, keep the selected tile in view. */
function applyFilter(root: HTMLElement): void {
  const fixed = !root.querySelector('.cs-sides');
  for (const b of root.querySelectorAll<HTMLElement>('[data-cs="side"]')) {
    const on = b.dataset.side === (ui.side ?? 'all');
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const b of root.querySelectorAll<HTMLElement>('[data-cs="role"]')) {
    const on = b.dataset.role === ui.role;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  let first: HTMLElement | null = null;
  let focusable: HTMLElement | null = null;
  for (const t of root.querySelectorAll<HTMLElement>('.cs-grid [data-h]')) {
    const show = passesFilter(t.dataset.h as HeroId, fixed ? 'all' : ui.side, ui.role);
    t.hidden = !show;
    const off = (t as HTMLButtonElement).disabled;
    if (show && !off && !first) first = t;
    if (show && !off && t.classList.contains('on')) focusable = t;
    t.tabIndex = -1;
  }
  const f = focusable ?? first;
  if (f) f.tabIndex = 0;
  const grid = root.querySelector<HTMLElement>('.cs-grid');
  if (grid) grid.scrollTop = 0;
  focusable?.scrollIntoView?.({ block: 'nearest' });
  syncMore(root);
}

/** The grid's "▾ more" chip and fade: shown while rows hide below. */
function syncMore(root: HTMLElement): void {
  const grid = root.querySelector<HTMLElement>('.cs-grid');
  const more = root.querySelector<HTMLElement>('.cs-more');
  if (!grid || !more) return;
  const below = grid.scrollHeight - grid.clientHeight - grid.scrollTop > 4;
  more.hidden = !below;
  grid.closest('.cs-gridwrap')?.classList.toggle('more', below);
}

export interface ChampSelectHandlers {
  /** Solo: Esc goes back. */
  onBack?(): void;
  /** The numbers toggle (the profile pref). */
  onNumbers?(on: boolean): void;
  /** The tapped skill changed (tests). */
  onSlot?(slot: PanelSlot): void;
}

const wired = new WeakMap<HTMLElement, ChampSelectHandlers>();
/** Double-tap window (§B3). */
export const DOUBLE_TAP_MS = 300;

/** The lock button, when it can be pressed. */
const lockButton = (root: HTMLElement): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>('.cs-lock:not([disabled])');

/**
 * Wire the screen's own controls on `container` (the solo screen root, or the party card that holds the markup). Safe
 * to call again: the handlers are replaced, the listeners are added once.
 */
export function wireChampSelect(container: HTMLElement, h: ChampSelectHandlers = {}, now: () => number = () => performance.now()): void {
  const had = wired.has(container);
  wired.set(container, h);
  if (had) return;
  let last = { h: '', t: -1e9 };
  const csRoot = (): HTMLElement | null => (container.classList.contains('cs') ? container : container.querySelector<HTMLElement>(':scope > .cs'));
  container.addEventListener('click', (e) => {
    const root = csRoot();
    if (!root) return;
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>('[data-cs]');
    const hs = wired.get(container) ?? {};
    if (c && root.contains(c)) {
      const k = c.dataset.cs;
      if (k === 'side') {
        ui.side = (c.dataset.side as SideFilter) ?? 'all';
        applyFilter(root);
      } else if (k === 'role') {
        const r = c.dataset.role as HeroRole;
        ui.role = ui.role === r ? null : r;
        applyFilter(root);
      } else if (k === 'slot') {
        ui.slot = (c.dataset.slot as PanelSlot) ?? 'passive';
        const p = root.querySelector<HTMLElement>('.cs-panel');
        if (p) redrawSkill(p);
        hs.onSlot?.(ui.slot);
      } else if (k === 'numbers') {
        const p = root.querySelector<HTMLElement>('.cs-panel');
        const on = p?.dataset.numbers !== '1';
        if (p) {
          p.dataset.numbers = on ? '1' : '0';
          redrawSkill(p);
          p.querySelector<HTMLElement>('[data-cs="numbers"]')?.focus();
        }
        hs.onNumbers?.(on);
      } else if (k === 'more') {
        const g = root.querySelector<HTMLElement>('.cs-grid');
        const tile = g?.querySelector<HTMLElement>('[data-h]:not([hidden])');
        g?.scrollBy?.({ top: (tile?.offsetHeight ?? 60) + 4, behavior: 'smooth' });
        if (g && !g.scrollBy) g.scrollTop += (tile?.offsetHeight ?? 60) + 4;
      }
      return;
    }
    const tile = t.closest<HTMLElement>('.cs-grid [data-h]');
    if (tile && !(tile as HTMLButtonElement).disabled) {
      const hero = tile.dataset.h ?? '';
      const ts = now();
      if (last.h === hero && ts - last.t <= DOUBLE_TAP_MS) {
        last = { h: '', t: -1e9 };
        // after the mode's own handler has selected it (the lock button reflects the new selection)
        queueMicrotask(() => {
          const r = csRoot();
          const b = r ? lockButton(r) : null;
          if (b && r?.querySelector('.cs-tile.on')?.getAttribute('data-h') === hero) b.click();
        });
      } else last = { h: hero, t: ts };
    }
  });
  container.addEventListener('scroll', (e) => {
    const t = e.target as HTMLElement;
    if (t.classList?.contains('cs-grid')) {
      const r = csRoot();
      if (r) syncMore(r);
    }
  }, true);
  container.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    const root = csRoot();
    if (!root) return;
    const t = e.target as HTMLElement;
    // Enter on the tile already selected locks in (the first Enter selects it, as a tap does)
    const onTile = t.closest<HTMLElement>('.cs-grid .cs-tile.on');
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && onTile && !e.repeat) {
      const b = lockButton(root);
      if (b) {
        e.preventDefault();
        b.click();
      }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      const b = lockButton(root);
      if (b) {
        e.preventDefault();
        b.click();
      }
      return;
    }
    if (e.key === 'Escape') {
      const x = root.querySelector<HTMLElement>('.cs-looksheet [data-a="lookclose"]');
      if (x) {
        e.preventDefault();
        x.click();
        return;
      }
      const hs = wired.get(container);
      if (hs?.onBack && !document.querySelector('.pl-champ, [aria-modal="true"]')) {
        e.preventDefault();
        hs.onBack();
      }
      return;
    }
    const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!arrows.includes(e.key)) return;
    // the grid: a roving tabindex through the visible tiles
    const tile = t.closest<HTMLElement>('.cs-grid [data-h]');
    if (tile) {
      // columns from every visible tile (the layout), the steps through the ones that can take focus
      const all = [...root.querySelectorAll<HTMLElement>('.cs-grid [data-h]:not([hidden])')];
      const cols = Math.max(1, all.filter((x) => x.offsetTop === all[0]?.offsetTop).length);
      const ok = (x: HTMLElement | undefined): boolean => !!x && !(x as HTMLButtonElement).disabled;
      const from = all.indexOf(tile);
      if (from < 0) return;
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -cols : e.key === 'ArrowDown' ? cols : 0;
      let k = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : from + step;
      const dir = e.key === 'Home' ? 1 : e.key === 'End' ? -1 : Math.sign(step);
      // a disabled tile is skipped (it cannot take focus): keep going the same way, one tile at a time
      while (k >= 0 && k < all.length && !ok(all[k])) k += Math.abs(step) === cols && step !== 0 ? step : dir;
      const to = k >= 0 && k < all.length ? all[k] : undefined;
      if (!to || to === tile) return;
      e.preventDefault();
      tile.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
      return;
    }
    // the side tabs (radio), the skill tabs (tablist) and the tricks (radio): arrows move and select
    const group = t.closest<HTMLElement>('.cs-sides, .cs-skills, .cs-trow, .cs-bots');
    if (!group) return;
    const items = [...group.querySelectorAll<HTMLElement>('button:not([disabled])')];
    const i = items.indexOf(t.closest('button') as HTMLElement);
    if (i < 0) return;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + d + items.length) % items.length;
    e.preventDefault();
    items[j]?.click();
    // a redraw may have replaced the group: focus its new copy
    const again = selectorOf(items[j] as HTMLElement);
    ((again ? root.querySelector<HTMLElement>(again) : null) ?? items[j])?.focus();
  });
  const root = csRoot();
  if (root) requestAnimationFrame?.(() => {
    syncMore(root);
    root.querySelector<HTMLElement>('.cs-tile.on:not([hidden])')?.scrollIntoView?.({ block: 'nearest' });
  });
}

/** Repaint the portraits of tiles and seats in place (a portrait baked after the screen opened). */
export function refreshFaces(root: HTMLElement, portrait: (h: HeroId) => string | null): void {
  for (const f of root.querySelectorAll<HTMLElement>('.cs-tile .cs-sf, .cs-seat .cs-sf:not(.q)')) {
    const h = (f.closest<HTMLElement>('[data-h]')?.dataset.h ?? f.closest<HTMLElement>('[data-hero]')?.dataset.hero) as HeroId | undefined;
    if (!h || !(h in HEROES)) continue;
    const pic = portrait(h);
    if (pic) f.innerHTML = heroPic(h, pic);
  }
}
