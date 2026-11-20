/**
 * Party loading (docs/plans/moba/MULTIPLAYER.md §5.1, §8, lane P8). Match assets load during the lobby and the pick,
 * so this phase is normally a blink. The team's cards (humans named, bot seats as "?") with each human's load bar;
 * after the deadline a "Bot covers until Mira loads" line (the late member is piloted from tick 0 and reclaims on
 * arrival).
 */
import { ccHtml } from '../../social/flags';
import { HEROES, type HeroId } from '../../data/heroes';
import type { PartyView } from '../../net/proto';
import { portraitUrl } from '../../render/portraits';
import { HERO_TEXT } from '../../ui/heroText';
import { COPY, esc, sideText } from './copy';
import { seatsPerTeam, shownName } from './partyLobby';
import { avatarHtml, titleText } from '../../ui/avatar';
import { personaMap, type Persona } from '../personas';

export function loadingHtml(v: PartyView, hideNames = false): string {
  const humans = [...v.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
  // always a way out: a load that never finishes (or a match the others play on) never traps a player here
  const leave = `<button type="button" class="pl-btn ghost small" data-p="leave" data-testid="party-leave">${COPY.leaveMatch}</button>`;
  // casual PvP (V16.md §5): both teams, the own team first; a bot seat the relay shows as a player (`mm.fill`) loads
  // like one, every other bot seat is labelled Bot
  const per = seatsPerTeam(v);
  if (v.mm?.mode === 'casual' || (v.mm && per === 5)) {
    const mine = v.mm.team ?? 0;
    const personas = personaMap(v.mm.fill, 2 * per);
    const seat = (slot: number) => {
      const m = v.members.find((x) => x.slot === slot);
      const p = m ? undefined : personas.get(slot);
      return p ? personaCard(p, slot % per) : card(m);
    };
    const team = (t: number) => Array.from({ length: per }, (_, i) => seat(t * per + i)).join('');
    const species = v.mm.species ?? ['cat', 'dog'];
    return `<div class="pp-card pp-narrow pp-loading" data-testid="party-loading" data-pvp="1"><h2>${COPY.loadingTitle}</h2><p class="pp-dim">${esc(COPY.yourTeam(sideText(species[mine])))}</p><ul class="pp-lcs" data-testid="pvp-load-mine">${team(mine)}</ul><p class="pp-dim">${esc(`${COPY.theirTeam}: ${sideText(species[1 - mine])}`)}</p><ul class="pp-lcs their" data-testid="pvp-load-theirs">${team(1 - mine)}</ul>${leave}</div>`;
  }
  // matched co-op (founder, 2026-11-20): a bot seat the relay shows as a player loads like one
  const coopPersonas = v.mm ? personaMap(v.mm.fill, 2 * per) : new Map<number, Persona>();
  const cards = Array.from({ length: per }, (_, i) => i)
    .map((i) => {
      if (!coopPersonas.size) return card(humans[i]);
      const m = v.members.find((x) => x.slot === i);
      const p = m ? undefined : coopPersonas.get(i);
      return p ? personaCard(p, i) : card(m);
    })
    .join('');
  const late = (v.deadlineMs ?? 1) <= 0 ? humans.find((m) => (m.loadPct ?? 0) < 100 && m.id !== v.you) : undefined;
  // only when someone is late: who the bot covers for (the bot cards say the rest)
  const line = late ? `<p class="pp-dim">${esc(COPY.botCovers(shownName(v, late, hideNames)))}</p>` : '';
  return `<div class="pp-card pp-narrow pp-loading" data-testid="party-loading"><h2>${COPY.loadingTitle}</h2><ul class="pp-lcs">${cards}</ul>${line}${leave}</div>`;

  /** A persona: a player's card (avatar, flag, name, champion), fully loaded. */
  function personaCard(p: Persona, i: number): string {
    const hero = p.hero && p.hero in HEROES ? (p.hero as HeroId) : null;
    const pic = hero ? portraitUrl(hero) : null;
    const av = `<span class="pp-lc-av" data-testid="loading-avatar">${avatarHtml(p.av ?? undefined, 40, { guest: false })}</span>`;
    const name = hideNames ? `Teammate ${i + 1}` : p.name;
    return `<li class="pp-lc">${av}<span class="pp-ts-face"${pic ? ` style="background-image:url('${esc(pic)}')"` : ''}></span><b>${ccHtml(hideNames ? null : p.cc)}${esc(name)}</b><small>${hero ? esc(HERO_TEXT[hero].title) : ''}</small><span class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i style="width:100%"></i></span></li>`;
  }

  function card(m: (typeof v.members)[number] | undefined): string {
      if (!m) return `<li class="pp-lc bot"><span class="pp-ts-face">?</span><b>${COPY.bot}</b></li>`;
      const hero = m.hero && m.hero in HEROES ? (m.hero as HeroId) : null;
      const pic = hero ? portraitUrl(hero) : null;
      const pct = Math.max(0, Math.min(100, Math.round(m.loadPct ?? 0)));
      // CHAT-AVATARS §7.4: every player's avatar, border and title from the party view (no extra fetch); the hero
      // portrait and the load bar stay
      const av = `<span class="pp-lc-av" data-testid="loading-avatar">${avatarHtml(m.av, 40, { guest: m.guest })}</span>`;
      const title = m.av?.t ? `<small class="pp-title">${esc(titleText(m.av.t))}</small>` : '';
      return `<li class="pp-lc"${m.id === v.you ? ' data-me="1"' : ''}>${av}<span class="pp-ts-face"${pic ? ` style="background-image:url('${esc(pic)}')"` : ''}></span><b>${ccHtml(hideNames && m.id !== v.you ? null : m.cc)}${esc(shownName(v, m, hideNames))}</b>${title}<small>${hero ? esc(HERO_TEXT[hero].title) : ''}</small><span class="pp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span></li>`;
  }
}
