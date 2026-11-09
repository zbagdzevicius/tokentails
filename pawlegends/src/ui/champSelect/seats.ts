/**
 * Champion select seats (docs/plans/moba/LANDING-PICK-UX.md §B5): the team column's models, from the solo choice and
 * its bots, or from a party view (slot order; casual PvP shows the own team only; hidden names stay hidden). Humans
 * show their usernames; bots keep champion names (or "Bot" while their hero is not known). Pure.
 */
import { HEROES, type HeroId } from '../../data/heroes';
import type { MemberView, PartyView } from '../../net/proto';
import type { TrickId } from '../../sim/api';
import { DIFFICULTY_TEXT } from '../heroText';
import type { SeatModel } from './champSelect';

const heroOf = (h: string | undefined): HeroId | null => (h && h in HEROES ? (h as HeroId) : null);

/** Solo vs bots: you, then the bots of your team (2 in 3v3, 4 in 5v5), picked at match start. */
export function soloSeats(o: { name?: string | null; hero: HeroId; trick: TrickId; difficulty: string; teamSize?: number; bots?: readonly (HeroId | null)[] }): SeatModel[] {
  const n = Math.max(1, o.teamSize ?? 3);
  const diff = (DIFFICULTY_TEXT as Record<string, string>)[o.difficulty]?.replace(' bots', '') ?? o.difficulty;
  const you: SeatModel = { name: o.name?.trim() || 'You', hero: o.hero, state: 'pick', you: true, trick: o.trick };
  const bots: SeatModel[] = Array.from({ length: n - 1 }, (_, i) => {
    const h = o.bots?.[i] ?? null;
    return { name: 'Bot', hero: h, state: 'bot', sub: `${diff} bot` };
  });
  return [you, ...bots];
}

/** One party member's seat. `hover`: this player's local hover (the relay's copy may lag a tap). */
function memberSeat(v: PartyView, m: MemberView, name: string, hover: string): SeatModel {
  const me = m.id === v.you;
  const hero = heroOf(me && !m.locked ? hover || m.hero : m.hero);
  const state: SeatModel['state'] = m.locked && hero ? 'locked' : hero ? 'hover' : 'empty';
  const trick = m.trick && /^(pounce|snack|hiss|purrify)$/.test(m.trick) ? (m.trick as TrickId) : null;
  return { name, hero, state, you: me, trick: m.locked ? trick : null };
}

/**
 * The party's seats: members by slot (three seats; an empty seat is a bot). Casual PvP: the own team's three slots only.
 * `shown(m)` names a member (its own name for you, "Teammate 2" with hidden names).
 */
export function partySeats(v: PartyView, hover: string, shown: (m: MemberView) => string, teamSize = 3): SeatModel[] {
  const bot: SeatModel = { name: 'Bot', hero: null, state: 'bot', sub: 'Fills the seat' };
  if (v.mm?.mode === 'casual') {
    const team = v.mm.team ?? 0;
    return Array.from({ length: teamSize }, (_, i) => {
      const m = v.members.find((x) => x.slot === team * teamSize + i);
      return m ? memberSeat(v, m, shown(m), hover) : { ...bot };
    });
  }
  const humans = [...v.members].sort((a, b) => (a.slot ?? 9) - (b.slot ?? 9));
  return Array.from({ length: teamSize }, (_, i) => {
    const m = humans[i];
    return m ? memberSeat(v, m, shown(m), hover) : { ...bot };
  });
}
