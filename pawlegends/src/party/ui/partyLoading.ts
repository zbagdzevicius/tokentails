/**
 * Party loading (docs/plans/moba/MULTIPLAYER.md §5.1, §8, lane P8). Match assets load during the lobby and the pick,
 * so this phase is normally a blink. The team's cards (humans named, bot seats as "?") with each human's load bar;
 * after the deadline a "Bot covers until Mira loads" line (the late member is piloted from tick 0 and reclaims on
 * arrival).
 */
import { HEROES, type HeroId } from '../../data/heroes';
import type { PartyView } from '../../net/proto';
import { portraitUrl } from '../../render/portraits';
import { HERO_TEXT } from '../../ui/heroText';
import { COPY, esc, sideText } from './copy';
import { shownName } from './partyLobby';

export function loadingHtml(v: PartyView, hideNames = false): string {
  const humans = [...v.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
  // casual PvP (V16.md §5): both teams, every bot seat labelled Bot, the own team first
  if (v.mm?.mode === 'casual') {
    const mine = v.mm.team ?? 0;
    const team = (t: number) => [0, 1, 2].map((i) => card(v.members.find((m) => m.slot === t * 3 + i))).join('');
    const species = v.mm.species ?? ['cat', 'dog'];
    return `<div class="pp-card pp-narrow pp-loading" data-testid="party-loading" data-pvp="1"><h2>${COPY.loadingTitle}</h2><p class="pp-dim">${esc(COPY.yourTeam(sideText(species[mine])))}</p><ul class="pp-lcs" data-testid="pvp-load-mine">${team(mine)}</ul><p class="pp-dim">${esc(`${COPY.theirTeam}: ${sideText(species[1 - mine])}`)}</p><ul class="pp-lcs their" data-testid="pvp-load-theirs">${team(1 - mine)}</ul></div>`;
  }
  const cards = [0, 1, 2]
    .map((i) => card(humans[i]))
    .join('');
  const late = (v.deadlineMs ?? 1) <= 0 ? humans.find((m) => (m.loadPct ?? 0) < 100 && m.id !== v.you) : undefined;
  const line = late ? COPY.botCovers(shownName(v, late, hideNames)) : COPY.botsCover;
  return `<div class="pp-card pp-narrow pp-loading" data-testid="party-loading"><h2>${COPY.loadingTitle}</h2><ul class="pp-lcs">${cards}</ul><p class="pp-dim">${esc(line)}</p></div>`;

  function card(m: (typeof v.members)[number] | undefined): string {
      if (!m) return `<li class="pp-lc bot"><span class="pp-ts-face">?</span><b>${COPY.bot}</b></li>`;
      const hero = m.hero && m.hero in HEROES ? (m.hero as HeroId) : null;
      const pic = hero ? portraitUrl(hero) : null;
      const pct = Math.max(0, Math.min(100, Math.round(m.loadPct ?? 0)));
      return `<li class="pp-lc"${m.id === v.you ? ' data-me="1"' : ''}><span class="pp-ts-face"${pic ? ` style="background-image:url('${esc(pic)}')"` : ''}></span><b>${esc(shownName(v, m, hideNames))}</b><small>${hero ? esc(HERO_TEXT[hero].title) : ''}</small><span class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span></li>`;
  }
}
