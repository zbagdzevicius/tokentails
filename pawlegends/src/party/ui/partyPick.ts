/**
 * The shared pick (docs/plans/moba/MULTIPLAYER.md §5.1, §8, lane P7): 30 s, simultaneous. Top: the team strip with
 * the three human seats (a pulsing outline while hovering, a solid frame once locked) and bot seats as "?". Middle:
 * the existing pick cards in one grid; a hero another human locked is greyed with that player's name; the other side
 * is greyed and the header says "Leader chose cats" (the leader's hover decides the side); a "New? Try this" badge on the easy hero for a new
 * player. Bottom: the Paw Trick row, the timer and Lock in.
 *
 * Pure markup; the party client dispatches the `data-p` actions (`hero`, `trick`, `lock`).
 */
import { HERO_IDS, HEROES, type HeroId } from '../../data/heroes';
import { TRICK_IDS } from '../../data/tricks';
import type { MemberView, PartyView } from '../../net/proto';
import { portraitUrl } from '../../render/portraits';
import { HERO_TEXT, TRICK_TEXT } from '../../ui/heroText';
import { icon } from '../../ui/icons';
import { heroTile } from '../../ui/screens';
import { COPY, DIFF_LABEL, esc, sideText } from './copy';
import { seatsPerTeam, shownName } from './partyLobby';

/** The "New? Try this" hero (the relay's newbie auto-lock uses the same one). */
export const NEWBIE_HERO: HeroId = 'clem';

export interface PickModel {
  view: PartyView;
  /** This player's current hover and trick (local until locked). */
  hover: string;
  trick: string;
  /** Seconds left on the pick timer. */
  secondsLeft: number;
  error: string | null;
  hideNames?: boolean;
  /** Quick Play: the match the queue found ("2 players + 1 bot · Dogs · Normal"), shown under the title. */
  found?: { humans: number; bots: number; side: string; difficulty: string } | null;
}

/** The first hero of `side` this player can lock now ('' when none): the default hover of a Quick Play pick. */
export function firstFree(v: PartyView, side: 'cat' | 'dog', prefer?: string): string {
  if (prefer && sideOf(prefer) === side && !heroBlock(v, prefer)) return prefer;
  return HERO_IDS.find((h) => HEROES[h].side === side && !heroBlock(v, h)) ?? '';
}

/**
 * Quick Play: the side the queue assigned, as a plain badge ("Your team: Dogs"). Not a disabled CATS/DOGS toggle: on a
 * phone that looked tappable and did nothing. It stays visible at every height.
 */
function sideBadgeHtml(side: 'cat' | 'dog'): string {
  return `<p class="pp-side-note pp-team" role="status" data-testid="mm-side-switch" data-side="${side}"><span data-testid="mm-your-team">${esc(COPY.yourTeam(sideText(side)))}</span></p>`;
}

const sideOf = (h: string | undefined): 'cat' | 'dog' | null => (h && h in HEROES ? HEROES[h as HeroId].side : null);

/** Heroes another human locked: hero → their name. */
export function lockedByOthers(v: PartyView, hide = false): Map<string, string> {
  return new Map(v.members.filter((m) => m.id !== v.you && m.locked && m.hero).map((m) => [m.hero!, shownName(v, m, hide)]));
}

/** Why `hero` cannot be picked by this player now ('' when it can). */
export function heroBlock(v: PartyView, hero: string, hide = false): string {
  const other = lockedByOthers(v, hide).get(hero);
  if (other) return other;
  // Quick Play: the side is fixed for the whole team (M1A-IMPL.md §1.5)
  if (v.mm) return sideOf(hero) === v.mm.side ? '' : COPY.teamSide(sideText(v.mm.side));
  if (v.leader === v.you) return '';
  const side = sideOf(v.members.find((m) => m.id === v.leader)?.hero);
  if (side && sideOf(hero) !== side) return COPY.leaderChose(side);
  return '';
}

function stripSeat(v: PartyView, m: MemberView | undefined, hide: boolean): string {
  if (!m) return `<li class="pp-ts bot"><span class="pp-ts-face">?</span><b>${COPY.bot}</b></li>`;
  const hero = m.hero && m.hero in HEROES ? (m.hero as HeroId) : null;
  const pic = hero ? portraitUrl(hero) : null;
  const face = pic ? `<span class="pp-ts-face" style="background-image:url('${esc(pic)}')"></span>` : '<span class="pp-ts-face">?</span>';
  const heroName = hero ? HERO_TEXT[hero].title : '…';
  return `<li class="pp-ts" data-hero="${hero ?? ''}" data-locked="${!!m.locked}" data-hover="${!!hero && !m.locked}"${m.id === v.you ? ' data-me="1"' : ''} title="${esc(`${shownName(v, m, hide)}: ${heroName}`)}">${face}<b>${esc(shownName(v, m, hide))}</b><small class="pp-ts-hero">${esc(heroName)}</small></li>`;
}

export function pickHtml(o: PickModel): string {
  const v = o.view;
  const hide = o.hideNames === true;
  const me = v.members.find((m) => m.id === v.you);
  const locked = !!me?.locked;
  const humans = [...v.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
  // casual PvP (V16.md §5): the own team only, by seat (the other team's picks show at loading)
  const per = seatsPerTeam(v);
  const casual = v.mm?.mode === 'casual' || (!!v.mm && per === 5);
  const team = v.mm?.team ?? 0;
  const strip = casual
    ? Array.from({ length: per }, (_, i) => stripSeat(v, v.members.find((m) => m.slot === team * per + i), hide)).join('')
    : Array.from({ length: per }, (_, i) => stripSeat(v, humans[i], hide)).join('');
  const hidden = casual ? `<p class="pp-side-note pp-their" data-testid="pvp-their-hidden">${COPY.opponentsHidden}</p>` : '';
  const leaderSide = sideOf(v.members.find((m) => m.id === v.leader)?.hero);
  // one grid (cats then dogs): two rows of six fit a 375 px tall phone
  // Quick Play: only the assigned side's heroes (the other side is never pickable)
  const mm = v.mm?.side ?? null;
  const order = mm
    ? HERO_IDS.filter((h) => HEROES[h].side === mm)
    : [...HERO_IDS.filter((h) => HEROES[h].side === 'cat'), ...HERO_IDS.filter((h) => HEROES[h].side === 'dog')];
  const found = mm && o.found ? `<p class="pp-side-note pp-found-line" data-testid="mm-found-line">${esc(COPY.foundLine(o.found.humans, o.found.bots, sideText(o.found.side), DIFF_LABEL[o.found.difficulty] ?? o.found.difficulty))}</p>` : '';
  const sideNote = mm
    ? `${sideBadgeHtml(mm)}${found}${hidden}`
    : v.leader !== v.you && leaderSide
      ? `<p class="pp-side-note" data-testid="party-side-note">${esc(COPY.leaderChose(leaderSide))}</p>`
      : '';
  const rows = `<div class="pp-heroes">${order.map((h) => heroTile(h, h === o.hover, portraitUrl(h), undefined)).join('')}</div>`;
  const tricks = TRICK_IDS.map(
    (t) =>
      `<button type="button" class="chip pp-trick ${t === o.trick ? 'on' : ''}" data-p="trick" data-v="${t}" aria-pressed="${t === o.trick}" ${locked ? 'disabled' : ''} title="${esc(TRICK_TEXT[t].text)}">${icon(TRICK_TEXT[t].icon)}${esc(TRICK_TEXT[t].name)}</button>`,
  ).join('');
  const err = o.error ? `<p class="pp-err" role="alert">${esc(o.error)}</p>` : '';
  // Lock in only for a hero this player can really get (a hero someone just locked, or the other side, is refused)
  const canLock = !locked && !!o.hover && !heroBlock(v, o.hover, hide);
  const lockBtn = locked
    ? `<button type="button" class="pl-btn ghost" data-p="unlock" data-testid="party-unlock">${COPY.changeHero}</button><button type="button" class="pl-btn big" data-p="lock" data-testid="party-lock" disabled>${COPY.lockedIn}</button>`
    : `<button type="button" class="pl-btn big" data-p="lock" data-testid="party-lock" ${canLock ? '' : 'disabled'}>${COPY.lockIn}</button>`;
  // Quick Play: a way out of the pick (two taps, as in the friend lobby); a bot takes the seat
  // champion browser: the hovered hero's skills and lore (the "i" on each card opens any hero; locked cards cannot take
  // a tap, so this button is the way in once locked)
  const info = o.hover && o.hover in HEROES ? `<button type="button" class="pl-btn ghost small pp-info" data-p="info" data-v="${esc(o.hover)}" data-testid="party-info" aria-haspopup="dialog">${icon('spell')}${esc(COPY.skillsLore)}</button>` : '';
  const leave = mm ? `<button type="button" class="pl-btn ghost small pp-pick-leave" data-p="leave" data-testid="party-leave">${COPY.leaveMatch}</button>` : '';
  return `<div class="pp-card pp-pick" data-locked="${locked}"${mm ? ` data-mm="${mm}"` : ''}${casual ? ` data-pvp="${team}"` : ''}>
    <div class="pp-head"><h2>${COPY.pickTitle}</h2>${sideNote}<ul class="pp-strip" aria-label="Team">${strip}</ul><span class="pp-timer" data-timer data-testid="party-timer">${Math.max(0, o.secondsLeft)}s</span></div>
    <div class="pp-roster">${rows}</div>
    <div class="pp-pick-foot"><div class="pp-tricks" role="group" aria-label="${COPY.trick}">${tricks}</div>${err}${info}${leave}${lockBtn}</div>
  </div>`;
}

/**
 * After `pickHtml` is in the DOM: turn each hero card into a party pick button (`data-p="hero"`), greyed with the
 * locker's name or the side note, and badge the newbie hero.
 */
export function decoratePick(root: HTMLElement, v: PartyView, hide = false): void {
  const me = v.members.find((m) => m.id === v.you);
  for (const el of root.querySelectorAll<HTMLElement>('.pp-heroes [data-h]')) {
    const h = el.dataset.h!;
    el.dataset.p = 'hero';
    el.dataset.v = h;
    el.dataset.testid = `party-hero-${h}`;
    const dot = el.querySelector<HTMLElement>('.hero-info');
    if (dot) {
      dot.dataset.p = 'info';
      dot.dataset.v = h;
    }
    const why = heroBlock(v, h, hide);
    const taken = lockedByOthers(v, hide).get(h);
    if (why && !taken) el.dataset.side = 'off';
    if (why || me?.locked) {
      (el as HTMLButtonElement).disabled = true;
      el.setAttribute('aria-disabled', 'true');
    }
    if (taken) {
      el.dataset.taken = '1';
      el.insertAdjacentHTML('beforeend', `<span class="pp-taken">${esc(taken)}</span>`);
    }
    if (me?.newbie && h === NEWBIE_HERO && !why) el.insertAdjacentHTML('beforeend', `<span class="pp-try">${COPY.tryThis}</span>`);
  }
}
