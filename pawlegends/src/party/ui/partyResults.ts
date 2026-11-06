/**
 * Results together (docs/plans/moba/MULTIPLAYER.md §7 M6): on the results screen of a party match, one row per
 * player of the team: card art, name, hero, K/D/A, hero damage, and a "bot 34%" chip when a bot flew that player
 * for more than 10% of the match; bot heroes greyed. The actions read "Play again together (1/2)", "Change hero" and
 * "Leave party". Each player sees only their own save status (the results screen's own save chip; nothing about a
 * friend's save is ever sent to a peer).
 *
 * Pure markup and models; the party client fills them and the app's results screen hosts them. Every name is
 * escaped. (The sim keeps no gold per hero, so the row shows hero damage in its place.)
 */
import type { SlotStats } from '../../sim/api';
import type { PartyView } from '../../net/proto';
import { HERO_TEXT } from '../../ui/heroText';
import { portraitUrl } from '../../render/portraits';
import { esc } from './copy';

/** A bot flew a friend for more than this share of the match: the row says so. */
export const BOT_CHIP_PCT = 10;

export interface PartyResultRow {
  slot: number;
  name: string;
  hero: string;
  human: boolean;
  me: boolean;
  art: string | null;
  k: number;
  d: number;
  a: number;
  dmg: number;
  /** Share of the match a bot flew this human (0..100). */
  botPct: number;
}

export interface PartyRowsInput {
  stats: readonly SlotStats[];
  mySlot: number;
  /** The relay's display names per slot (null = a bot slot). */
  partyNames: readonly (string | null)[];
  /** The solo names (bot personas, the player's card name). */
  baseNames: readonly string[];
  pilotPct: readonly number[];
  /** Card art per human slot. */
  art: readonly (string | null)[];
  hide: boolean;
}

/** The team's rows (the player's team, slot order). Pure. */
export function partyRows(o: PartyRowsInput): PartyResultRow[] {
  const team = o.mySlot < 3 ? 0 : 1;
  const out: PartyResultRow[] = [];
  for (let k = 0; k < 3; k++) {
    const slot = team * 3 + k;
    const st = o.stats.find((s) => s.slot === slot);
    if (!st) continue;
    const me = slot === o.mySlot;
    const raw = o.partyNames[slot];
    const human = me || (raw !== null && raw !== undefined);
    const name = me ? (o.baseNames[slot] ?? 'You') : human ? (o.hide ? `Teammate ${slot + 1}` : (raw ?? '')) : (o.baseNames[slot] ?? HERO_TEXT[st.hero]?.title ?? 'Bot');
    out.push({
      slot,
      name,
      hero: st.hero,
      human,
      me,
      art: human ? (o.art[slot] ?? null) : null,
      k: st.kills,
      d: st.deaths,
      a: st.assists,
      dmg: st.heroDamage,
      botPct: human ? Math.max(0, Math.min(100, Math.round(o.pilotPct[slot] ?? 0))) : 0,
    });
  }
  return out;
}

/** The rows block of the results screen. Pure. */
export function partyRowsHtml(rows: readonly PartyResultRow[]): string {
  const row = (r: PartyResultRow): string => {
    const pic = r.art ?? portraitUrl(r.hero as never);
    const av = pic ? `<i class="pr-av" style="background-image:url('${esc(pic)}')"></i>` : '<i class="pr-av"></i>';
    const chip = r.human && r.botPct > BOT_CHIP_PCT ? `<span class="pr-bot" data-testid="party-bot-chip">bot ${r.botPct}%</span>` : '';
    const tag = r.me ? '<span class="pr-you">you</span>' : r.human ? '' : '<span class="pr-tag">bot</span>';
    return `<li class="pr-row${r.human ? ' human' : ' botrow'}${r.me ? ' me' : ''}" data-slot="${r.slot}" data-testid="${r.human ? 'party-result-human' : 'party-result-bot'}">${av}<span class="pr-who"><b>${esc(r.name)}</b><small>${esc(HERO_TEXT[r.hero as keyof typeof HERO_TEXT]?.title ?? r.hero)}</small></span>${tag}${chip}<span class="pr-kda">${r.k}/${r.d}/${r.a}</span><span class="pr-dmg" title="Hero damage">${r.dmg}</span></li>`;
  };
  return `<div class="pl-party-results" data-testid="party-results"><b class="pr-h">Your party</b><ul>${rows.map(row).join('')}</ul></div>`;
}

/** "Play again together (1/2)": who pressed it, out of the party now. Pure. */
export function againLabel(v: PartyView | null, pressed: boolean): string {
  const n = v?.members.length ?? 1;
  const yes = Math.max(pressed ? 1 : 0, v?.members.filter((m) => m.again).length ?? 0);
  return `Play again together (${yes}/${n})`;
}
