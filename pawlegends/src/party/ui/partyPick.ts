/**
 * The shared pick (docs/plans/moba/MULTIPLAYER.md §5.1, §8, lane P7): 30 s, simultaneous. Top: the team strip with
 * the three human seats (a pulsing outline while hovering, a solid frame once locked) and bot seats as "?". Middle:
 * the existing pick cards; a hero another human locked is greyed with that player's name; the other side is greyed
 * with "Leader chose cats" (the leader's hover decides the side); a "New? Try this" badge on the easy hero for a new
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
import { COPY, esc } from './copy';
import { shownName } from './partyLobby';

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
  return `<li class="pp-ts" data-locked="${!!m.locked}" data-hover="${!!hero && !m.locked}"${m.id === v.you ? ' data-me="1"' : ''}>${face}<b>${esc(shownName(v, m, hide))}</b><small>${hero ? esc(HERO_TEXT[hero].title) : '…'}</small></li>`;
}

export function pickHtml(o: PickModel): string {
  const v = o.view;
  const hide = o.hideNames === true;
  const me = v.members.find((m) => m.id === v.you);
  const locked = !!me?.locked;
  const humans = [...v.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
  const strip = [0, 1, 2].map((i) => stripSeat(v, humans[i], hide)).join('');
  const leaderSide = sideOf(v.members.find((m) => m.id === v.leader)?.hero);
  const rows = (['cat', 'dog'] as const)
    .map((side) => {
      const heroes = HERO_IDS.filter((h) => HEROES[h].side === side);
      const dim = v.leader !== v.you && leaderSide && leaderSide !== side;
      return `<div class="pp-heroes" data-side="${side}"${dim ? ' data-dim="1"' : ''}>${heroes.map((h) => heroTile(h, h === o.hover, portraitUrl(h), undefined)).join('')}${dim ? `<span class="pp-side-note">${esc(COPY.leaderChose(leaderSide))}</span>` : ''}</div>`;
    })
    .join('');
  const tricks = TRICK_IDS.map(
    (t) =>
      `<button type="button" class="chip pp-trick ${t === o.trick ? 'on' : ''}" data-p="trick" data-v="${t}" aria-pressed="${t === o.trick}" ${locked ? 'disabled' : ''} title="${esc(TRICK_TEXT[t].text)}">${icon(TRICK_TEXT[t].icon)}${esc(TRICK_TEXT[t].name)}</button>`,
  ).join('');
  const err = o.error ? `<p class="pp-err" role="alert">${esc(o.error)}</p>` : '';
  return `<div class="pp-card pp-pick" data-locked="${locked}">
    <div class="pp-head"><h2>${COPY.pickTitle}</h2><ul class="pp-strip" aria-label="Team">${strip}</ul><span class="pp-timer" data-timer data-testid="party-timer">${Math.max(0, o.secondsLeft)}s</span></div>
    <div class="pp-roster">${rows}</div>
    <div class="pp-pick-foot"><div class="pp-tricks" role="group" aria-label="${COPY.trick}">${tricks}</div>${err}<button type="button" class="pl-btn big" data-p="lock" data-testid="party-lock" ${locked ? 'disabled' : ''}>${locked ? COPY.lockedIn : COPY.lockIn}</button></div>
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
    const why = heroBlock(v, h, hide);
    const taken = lockedByOthers(v, hide).get(h);
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
