/**
 * The shared pick (docs/plans/moba/MULTIPLAYER.md §5.1, §8, lane P7), drawn as the Wild Rift champion select
 * (docs/plans/moba/LANDING-PICK-UX.md Part B, ui/champSelect): 30 s, simultaneous. Left: the team column (the human
 * seats by slot with their usernames, "Selecting…" while hovering and the hero once locked; empty seats are bots). Centre:
 * the side and role tabs over the portrait grid; a hero another human locked is greyed with "Taken: name"; the other
 * side is locked with the leader's side note; a "New? Try this" badge on the easy hero for a new player. Right: the
 * hovered hero's skills. Bottom: Leave (Quick Play and PvP), LOCK IN (or Change hero once locked) and the Paw Trick row.
 *
 * Pure markup; the party client dispatches the `data-p` actions (`hero`, `trick`, `lock`, `unlock`, `info`, `leave`).
 */
import { HERO_IDS, HEROES, type HeroId } from '../../data/heroes';
import type { PartyView } from '../../net/proto';
import { portraitUrl } from '../../render/portraits';
import { HERO_TEXT, trickHint } from '../../ui/heroText';
import { champSelectHtml, type CsModel } from '../../ui/champSelect/champSelect';
import { partySeats } from '../../ui/champSelect/seats';
import { COPY, DIFF_LABEL, esc, sideText } from './copy';
import { seatsPerTeam, shownName } from './partyLobby';

/** The "New? Try this" hero (the relay's newbie auto-lock uses the same one). */
export const NEWBIE_HERO: HeroId = 'clem';

export interface PickModel {
  view: PartyView;
  /** This player's current hover and trick (local until locked). */
  hover: string;
  /** A hero tapped only to read its skills (taken, the other side, or after locking in): the panel shows it, the
   * hover and the seat stay. '' or absent: the panel shows the hover. */
  peek?: string;
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

export interface PickHtmlExtra {
  /** The round-1 numbers pref (the cooldown and facts in the skill text). */
  numbers?: boolean;
}

/** The party pick as a champion select model. Pure. */
export function pickModel(o: PickModel, x: PickHtmlExtra = {}): CsModel {
  const v = o.view;
  const hide = o.hideNames === true;
  const me = v.members.find((m) => m.id === v.you);
  const locked = !!me?.locked;
  // casual PvP (V16.md §5): the own team only, by seat (the other team's picks show at loading)
  const per = seatsPerTeam(v);
  const casual = v.mm?.mode === 'casual' || (!!v.mm && per === 5);
  const team = v.mm?.team ?? 0;
  const mm = v.mm?.side ?? null;
  const leaderSide = sideOf(v.members.find((m) => m.id === v.leader)?.hero);
  // Quick Play: only the assigned side's heroes (the other side is never pickable)
  const order = mm
    ? HERO_IDS.filter((h) => HEROES[h].side === mm)
    : [...HERO_IDS.filter((h) => HEROES[h].side === 'cat'), ...HERO_IDS.filter((h) => HEROES[h].side === 'dog')];
  // Quick Play's found line sits in the header under the side badge (the team column has no room for it with 5 seats)
  const found = mm && o.found ? `<p class="pp-side-note pp-found-line" data-testid="mm-found-line">${esc(COPY.foundLine(o.found.humans, o.found.bots, sideText(o.found.side), DIFF_LABEL[o.found.difficulty] ?? o.found.difficulty))}</p>` : '';
  const teamNote = mm
    ? casual ? `<p class="pp-side-note pp-their" data-testid="pvp-their-hidden">${COPY.opponentsHidden}</p>` : ''
    : !mm && v.leader !== v.you && leaderSide
      ? `<p class="pp-side-note" data-testid="party-side-note">${esc(COPY.leaderChose(leaderSide))}</p>`
      : '';
  const taken = lockedByOthers(v, hide);
  // a teammate's hover: a corner dot in their seat colour
  const mates = new Map<string, number>();
  v.members.forEach((m) => {
    if (m.id !== v.you && !m.locked && m.hero) mates.set(m.hero, Math.max(0, m.slot ?? 0) % per);
  });
  const hover = o.hover && o.hover in HEROES ? (o.hover as HeroId) : null;
  const peek = o.peek && o.peek in HEROES && o.peek !== o.hover ? (o.peek as HeroId) : null;
  const shown = peek ?? hover;
  const block = shown ? heroBlock(v, shown, hide) : '';
  const lockWhy = !shown ? 'Tap a hero' : taken.get(shown) ? `Taken by ${taken.get(shown)}` : block;
  return {
    kind: 'party',
    seats: partySeats(v, o.hover, (m) => shownName(v, m, hide), per, casual),
    heroes: order,
    selected: shown,
    sideTabs: !mm,
    // a member follows the leader's side (the tab moves when the leader changes it; All and the other side stay viewable)
    lockSide: !mm && v.leader !== v.you ? leaderSide : null,
    tile: (h) => {
      const why = heroBlock(v, h, hide);
      const by = taken.get(h);
      return {
        taken: by,
        locked: why && !by ? why : undefined,
        // every tile stays tappable to read its skills (Wild Rift: any champion can be inspected); LOCK IN says why not
        blocked: !!why || locked,
        tryThis: !!me?.newbie && h === NEWBIE_HERO,
        mate: mates.get(h),
      };
    },
    portrait: (h) => portraitUrl(h),
    trick: (o.trick || 'pounce') as CsModel['trick'],
    trickHint: hover ? trickHint(HERO_TEXT[hover].role, HEROES[hover].side) : '',
    tricksDisabled: locked,
    timer: o.secondsLeft,
    title: COPY.pickTitle,
    headRight: mm ? `${sideBadgeHtml(mm)}${found}` : '',
    teamNote,
    footLeft: mm ? `<button type="button" class="pl-btn ghost small pp-pick-leave" data-p="leave" data-testid="party-leave">${COPY.leaveMatch}</button>` : '',
    lock: locked
      ? { enabled: false, locked: true, label: COPY.lockedIn, unlockLabel: COPY.changeHero }
      : { enabled: !lockWhy, label: COPY.lockIn, sub: lockWhy || (shown ? HERO_TEXT[shown].title : '') },
    numbers: x.numbers === true,
    error: o.error,
    rootClass: 'pp-card pp-pick',
    rootAttrs: `data-locked="${locked}"${mm ? ` data-mm="${mm}"` : ''}${casual ? ` data-pvp="${team}"` : ''}`,
  };
}

export function pickHtml(o: PickModel, x: PickHtmlExtra = {}): string {
  return champSelectHtml(pickModel(o, x));
}
