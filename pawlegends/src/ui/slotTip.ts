/**
 * Desktop skill tooltips: the hover card over an ability slot (Q W E R, the Paw Trick, Nap) and over the portrait (the
 * basic attack and the passive). Pure: the words come from ui/heroText.ts and the numbers from src/data through the
 * heroText row helpers, at the hero's level, ranks and talent picks, so the card reads what the sim does right now.
 * The HUD (ui/hud.ts) shows it on a mouse with a hover-capable pointer only; touch never sees it.
 */
import type { HeroId, TrickId } from '../sim/api';
import { isRangedHero, ULT_LEVEL } from '../input/abilities';
import { TICK_HZ } from '../data/timeline';
import { abilityRank, maxRank } from '../sim/heroes/talents';
import { HERO_TEXT, TRICK_TEXT, abilityRows, attackRows, napRows, trickRows, type StatRow } from './heroText';

/** The hover card's content. */
export interface SlotTip {
  name: string;
  /** The key that casts it ("Q", "D"), or '' (the portrait). */
  key: string;
  /** A small tag under the name ("Ultimate", "Paw Trick", "Melee"). */
  kind: string;
  text: string;
  rows: StatRow[];
  /** "Rank 2 of 4" (Q W E R), else ''. */
  rank: string;
  /** Why it can't be cast now ("Unlocks at level 4", "Ready in 3.4 s"), or ''. */
  status: string;
  /** The status is a block (locked or cooling down), not just a note. */
  blocked: boolean;
}

/** What the card needs about the own hero right now (the snapshot). */
export interface TipState {
  level: number;
  /** Talent picks per tier (−1, 0 or 1). */
  choices: readonly number[];
  /** The level-6 shape branch is taken. */
  branch: boolean;
  /** Cooldown left in ticks (0 ready). */
  cd: number;
  dead: boolean;
}

const KIND = ['', '', '', 'Ultimate', 'Paw Trick', 'Recall'];

/** Seconds left with one decimal ("3.4 s"); whole seconds from 10 s up. */
function left(ticks: number): string {
  const s = ticks / TICK_HZ;
  return s >= 10 ? `${Math.ceil(s)} s` : `${Math.ceil(s * 10) / 10} s`;
}

/** Slot `slot` (0–3 Q W E R, 4 the Paw Trick, 5 Nap) of `hero`, cast by `key`. */
export function slotTip(hero: HeroId, trick: TrickId, slot: number, key: string, s: TipState): SlotTip {
  const t = HERO_TEXT[hero];
  const br = s.branch && t.branch?.slot === slot ? t.branch : null;
  const ab = slot < 4 ? (br ?? t.abilities[slot]) : slot === 4 ? TRICK_TEXT[trick] : null;
  const name = ab ? ab.name : 'Nap';
  const text = ab ? ab.text : 'Return to your fountain. Damage breaks it.';
  const rows = slot < 4 ? abilityRows(hero, slot, s.level, s.choices) : slot === 4 ? trickRows(trick) : napRows();
  const rk = slot < 4 ? abilityRank(s.level, slot) : 0;
  const rank = slot < 4 && rk > 0 ? `Rank ${rk} of ${maxRank(slot)}` : '';
  const locked = slot === 3 && s.level < ULT_LEVEL;
  let status = '';
  if (locked) status = `Unlocks at level ${ULT_LEVEL}`;
  else if (s.cd > 0) status = `Ready in ${left(s.cd)}`;
  else if (s.dead) status = 'Ready when you are back';
  return { name, key, kind: br ? 'Level 6 branch' : KIND[slot] ?? '', text, rows, rank, status, blocked: locked || s.cd > 0 };
}

/** The portrait's card: the hero, its passive and its basic attack at `level`. */
export function attackTip(hero: HeroId, level: number): SlotTip {
  const t = HERO_TEXT[hero];
  return {
    name: t.title,
    key: '',
    kind: `${t.role} · ${isRangedHero(hero) ? 'Ranged' : 'Melee'} attack`,
    text: `${t.passive.name}: ${t.passive.text}`,
    rows: attackRows(hero, level),
    rank: `Level ${Math.max(1, level)}`,
    status: '',
    blocked: false,
  };
}

const esc = (v: string): string => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** The card's markup (`.pl-slot-tip` children; ui.css styles them). */
export function tipHtml(t: SlotTip): string {
  const rows = t.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  return (
    `<header><b class="nm">${esc(t.name)}</b>${t.key ? `<kbd>${esc(t.key)}</kbd>` : ''}</header>` +
    (t.kind || t.rank ? `<em class="kd">${esc([t.kind, t.rank].filter(Boolean).join(' · '))}</em>` : '') +
    `<p>${esc(t.text)}</p>` +
    (rows ? `<dl>${rows}</dl>` : '') +
    (t.status ? `<small class="st${t.blocked ? ' no' : ''}">${esc(t.status)}</small>` : '')
  );
}
