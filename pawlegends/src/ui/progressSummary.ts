/**
 * Lane F (docs/FUN-PROGRESSION-V12.md F5): the results screen's progression summary. Per hero: level, Toy tier, Fish
 * earned, lane last hits and when each Toy was bought (mm:ss chips); the player's Fish by source; the MVP and Gold,
 * Silver and Bronze medals. Everything comes from the sim's own SlotStats (sim v12) and the player's `fish` events,
 * so it is the same numbers the replay verifies. Pure: data in, HTML out.
 */
import type { SlotStats } from '../sim/api';
import { TOY_TIERS } from '../data/toys';
import { mmss } from './toyText';

export type Medal = 'mvp' | 'gold' | 'silver' | 'bronze';

export const MEDAL_TEXT: Readonly<Record<Medal, string>> = Object.freeze({ mvp: 'MVP', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' });

/**
 * The MVP (the grade's pick) and the next three best scores across both teams (ties: more takedowns, then the lower
 * slot) as Gold, Silver and Bronze. Pure.
 */
export function medals(stats: readonly Pick<SlotStats, 'slot' | 'kills' | 'assists'>[], scores: readonly { slot: number; score: number }[], mvp: number): Map<number, Medal> {
  const out = new Map<number, Medal>();
  if (mvp >= 0) out.set(mvp, 'mvp');
  const td = (slot: number): number => {
    const s = stats.find((x) => x.slot === slot);
    return s ? s.kills + s.assists : 0;
  };
  const rest = scores.filter((s) => s.slot !== mvp).sort((a, b) => b.score - a.score || td(b.slot) - td(a.slot) || a.slot - b.slot);
  const steps: Medal[] = ['gold', 'silver', 'bronze'];
  for (let i = 0; i < steps.length && i < rest.length; i++) out.set(rest[i].slot, steps[i]);
  return out;
}

export interface FishSource {
  key: string;
  label: string;
  amount: number;
}

/** Source groups in a fixed order: what the `fish` event reasons add up to; "Trickle" is the rest of the total. */
const GROUPS: readonly { key: string; label: string; reasons: readonly string[] }[] = [
  { key: 'lastHit', label: 'Last hits', reasons: ['lastHit'] },
  { key: 'minion', label: 'Lane share', reasons: ['minion'] },
  { key: 'takedown', label: 'Takedowns', reasons: ['kill', 'assist', 'firstBlood', 'shutdown'] },
  { key: 'camp', label: 'Rat camp', reasons: ['camp'] },
  { key: 'objective', label: 'Objectives', reasons: ['tower', 'pudding'] },
  { key: 'snack', label: 'Snacks', reasons: ['pickup'] },
];

/**
 * The player's Fish by source: the event reasons grouped, and the passive and comeback trickle (no events) as what
 * is left of the match total `total` (SlotStats.fish). Only sources above 0. Pure.
 */
export function fishSources(by: Readonly<Record<string, number>>, total: number): FishSource[] {
  const out: FishSource[] = [];
  let seen = 0;
  for (const g of GROUPS) {
    let n = 0;
    for (const r of g.reasons) n += Math.max(0, by[r] ?? 0);
    seen += n;
    if (n > 0) out.push({ key: g.key, label: g.label, amount: n });
  }
  const trickle = Math.max(0, total - seen);
  if (trickle > 0) out.push({ key: 'trickle', label: 'Trickle', amount: trickle });
  return out;
}

export interface ProgressRow {
  slot: number;
  name: string;
  /** 'self' | 'ally' | 'enemy' */
  rel: string;
  level: number;
  toys: number;
  fish: number;
  lastHits: number;
  /** Ticks each tier was bought, −1 never (SlotStats.toy1At..toy4At). */
  toyAt: readonly number[];
  medal?: Medal;
}

export interface ProgressSummary {
  rows: readonly ProgressRow[];
  sources: readonly FishSource[];
}

/** The rows from the sim's stats (own team first). */
export function progressRows(stats: readonly SlotStats[], mySlot: number, nameOf: (slot: number) => string, medalOf: ReadonlyMap<number, Medal>): ProgressRow[] {
  const myTeam = mySlot < 3 ? 0 : 1;
  return stats
    .map((st) => ({
      slot: st.slot,
      name: nameOf(st.slot),
      rel: st.slot === mySlot ? 'self' : (st.slot < 3 ? 0 : 1) === myTeam ? 'ally' : 'enemy',
      level: st.level,
      toys: st.toys ?? 0,
      fish: st.fish ?? 0,
      lastHits: st.lastHits ?? 0,
      toyAt: [st.toy1At ?? -1, st.toy2At ?? -1, st.toy3At ?? -1, st.toy4At ?? -1],
      ...(medalOf.has(st.slot) ? { medal: medalOf.get(st.slot) } : {}),
    }))
    .sort((a, b) => Number(a.rel === 'enemy') - Number(b.rel === 'enemy') || a.slot - b.slot);
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The summary block (a compact table and the Fish-by-source bar). */
export function progressBlock(p: ProgressSummary): string {
  const chips = (r: ProgressRow): string => {
    let h = '';
    for (let i = 0; i < TOY_TIERS; i++) {
      const at = r.toyAt[i] ?? -1;
      h += `<i class="tc${at >= 0 ? ' on' : ''}" title="Toy ${i + 1}${at >= 0 ? ` at ${mmss(at)}` : ': not bought'}">${at >= 0 ? mmss(at) : '–'}</i>`;
    }
    return h;
  };
  const medal = (m: Medal | undefined): string => (m ? `<em class="md ${m}" data-medal="${m}" title="${MEDAL_TEXT[m]}">${m === 'mvp' ? 'MVP' : ''}</em>` : '');
  const rows = p.rows
    .map(
      (r) =>
        `<tr class="${r.rel}" data-slot="${r.slot}" data-toys="${r.toys}"><td class="nm">${medal(r.medal)}<span>${esc(r.name)}</span></td><td>${r.level}</td><td class="tys">${chips(r)}</td><td class="f">${r.fish}</td><td>${r.lastHits}</td></tr>`,
    )
    .join('');
  const total = p.sources.reduce((a, s) => a + s.amount, 0);
  const bar = total
    ? `<div class="src" data-fish-total="${total}"><b>Your Fish</b><span class="bar">${p.sources.map((s) => `<i class="s-${s.key}" style="flex:${s.amount}" title="${esc(s.label)}: ${s.amount}"></i>`).join('')}</span><span class="lg">${p.sources
        .map((s) => `<span class="s-${s.key}" data-src="${s.key}"><i></i>${esc(s.label)} ${Math.round((s.amount / total) * 100)}%</span>`)
        .join('')}</span></div>`
    : '';
  return `<div class="pl-prog"><table><thead><tr><th>Hero</th><th title="Level">Lv</th><th>Toys</th><th title="Fish earned">Fish</th><th title="Lane minion last hits">LH</th></tr></thead><tbody>${rows}</tbody></table>${bar}</div>`;
}
