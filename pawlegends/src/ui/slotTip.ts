/**
 * Desktop skill tooltips: the hover card over an ability slot (Q W E R, the Paw Trick, Nap) and over the portrait (the
 * basic attack and the passive). Pure: the words come from ui/heroText.ts and the numbers from src/data through the
 * row helpers below, at the hero's level, ranks and talent picks, so the card reads what the sim does right now.
 * The HUD (ui/hud.ts) shows it on a mouse with a hover-capable pointer only; touch never sees it, and it loads this
 * module on the first desktop hover (its own chunk, out of the first-load budget).
 */
import type { HeroId, TrickId } from '../sim/api';
import { isRangedHero, ULT_LEVEL } from '../input/abilities';
import { GROWTH_FLOOR, HERO_IDS, HEROES, ROLE_GROWTH, type AbilitySlot } from '../data/heroes';
import { TICK_HZ } from '../data/timeline';
import { TRICKS } from '../data/tricks';
import { HERO_RULES } from '../data/xp';
import { abilityRank, kitNumbers, maxRank } from '../sim/heroes/talents';
import { HERO_TEXT, TRICK_TEXT, metres, sec, type Nums } from './heroText';

/** One row of the desktop hover card: a label and its value ("Cooldown", "5.5 s"). */
export type StatRow = readonly [string, string];

/** Reach-like numbers in the order the hover card lists them (at most two show). */
const REACH_ROWS: readonly (readonly [string, string])[] = [
  ['range', 'Range'], ['dash', 'Dash'], ['blink', 'Blink'], ['leap', 'Leap'], ['radius', 'Radius'], ['ringRadius', 'Ring'],
  ['waveRange', 'Wave reach'], ['splash', 'Splash'], ['postRadius', 'Dome'],
];

/** The hover card shows at most this many rows (the cooldown included). */
const MAX_ROWS = 7;

/**
 * Desktop skill tooltips: the numbers of one ability as labelled rows at `level` (damage, heal and shield grow per
 * level as the sim deals them). `a` is a `kitNumbers` slot, so ranks and talents are already in.
 */
function statRows(a: Nums, level: number): StatRow[] {
  const lv = Math.max(1, level) - 1;
  const at = (k: string): number | undefined => (a[k] === undefined ? undefined : (a[k] as number) + (a[`${k}PerLevel`] ?? 0) * lv);
  const pos = (k: string): number | undefined => ((a[k] ?? 0) > 0 ? a[k] : undefined);
  const rows: StatRow[] = [['Cooldown', sec(a.cooldown ?? 0)]];
  let reach = 0;
  for (const [k, label] of REACH_ROWS) {
    const v = pos(k);
    if (v !== undefined && reach < 2) {
      rows.push([label, metres(v)]);
      reach++;
    }
  }
  const dmg = at('dmg');
  if (dmg !== undefined && dmg > 0) rows.push(['Damage', a.every ? `${dmg} every ${sec(a.every)}` : String(dmg)]);
  for (const [k, label] of [['waveDmg', 'Wave damage'], ['heal', 'Heal'], ['shield', 'Shield']] as const) {
    const v = at(k);
    if (v !== undefined && v > 0) rows.push([label, String(v)]);
  }
  for (const [k, label] of [['stun', 'Stun'], ['root', 'Root'], ['fear', 'Fear'], ['charm', 'Charm']] as const) {
    const v = pos(k);
    if (v !== undefined) rows.push([label, sec(v)]);
  }
  const slow = pos('slowBp') ?? pos('slowMaxBp');
  if (slow !== undefined) rows.push(['Slow', `${a.slowBp ? '' : 'up to '}${slow / 100}%${a.slowBp && pos('slow') ? ` for ${sec(a.slow as number)}` : ''}`]);
  const push = pos('push') ?? pos('knockback');
  if (push !== undefined) rows.push(['Push', metres(push)]);
  if (pos('pull') !== undefined) rows.push(['Pull', metres(a.pull as number)]);
  const reduce = pos('reduceBp') ?? pos('postReduceBp');
  if (reduce !== undefined) rows.push(['Damage taken', `−${reduce / 100}%`]);
  if (pos('hasteBp') !== undefined) rows.push(['Move speed', `+${(a.hasteBp as number) / 100}%`]);
  if (pos('attackSpeedBp') !== undefined) rows.push(['Attack speed', `+${(a.attackSpeedBp as number) / 100}%`]);
  const lasts = pos('duration') ?? pos('postDuration');
  if (lasts !== undefined) rows.push(['Lasts', sec(lasts)]);
  return rows.slice(0, MAX_ROWS);
}

/**
 * Desktop skill tooltips: slot `slot`'s numbers (Q W E R) at `level` with the talent `choices` (per tier −1, 0 or 1),
 * as the sim uses them. A taken level-6 shape branch is one of the `choices`, so its slot reads the branch's numbers.
 */
export function abilityRows(hero: HeroId, slot: number, level: number, choices: readonly number[] = []): StatRow[] {
  const key = ('qwer'[slot] ?? 'q') as AbilitySlot;
  return statRows(kitNumbers(HERO_IDS.indexOf(hero), level, choices)[key] as Nums, level);
}

/** Desktop skill tooltips: a Paw Trick's numbers as rows. */
export function trickRows(t: TrickId): StatRow[] {
  const d = TRICKS[t] as Readonly<Record<string, number | undefined>>;
  const rows: StatRow[] = [['Cooldown', sec(d.cooldown ?? 0)]];
  if (d.blink) rows.push(['Blink', metres(d.blink)]);
  if (d.radius) rows.push(['Radius', metres(d.radius)]);
  if (d.healBp) rows.push(['Heal', `${d.healBp / 100}% of max health${d.duration ? ` over ${sec(d.duration)}` : ''}`]);
  if (d.fear) rows.push(['Fear', sec(d.fear)]);
  if (d.immune) rows.push(['Immune', sec(d.immune)]);
  return rows;
}

/** Desktop skill tooltips: Nap's channel (data/xp.ts HERO_RULES). */
export function napRows(): StatRow[] {
  return [['Channel', sec(HERO_RULES.napChannel)]];
}

/**
 * Desktop tooltips: the basic attack at `level` (the portrait's card): range, damage and swings a second, from the
 * same numbers the sim reads (`attackRange`, `attackDamage`, `attackEvery` with the role's level attack speed, before
 * buffs).
 */
export function attackRows(hero: HeroId, level: number): StatRow[] {
  const h = HEROES[hero];
  const b = h.base;
  const lv = Math.max(1, level) - 1;
  const bp = (b.attackSpeedPerLevelBp ?? ROLE_GROWTH[h.role].attackSpeedPerLevelBp) * lv;
  const every = bp <= 0 ? b.attackEvery : Math.max(Math.min(b.attackEvery, GROWTH_FLOOR.attackEveryMin), Math.floor((b.attackEvery * 10000) / (10000 + bp)));
  return [
    ['Range', metres(b.range)],
    ['Damage', String(b.attack + b.attackPerLevel * lv)],
    ['Attack speed', `${(Math.round((TICK_HZ / every) * 100) / 100).toFixed(2)} a second`],
  ];
}

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

/**
 * Above the HUD bar (not just the hovered element: the small D and B slots and the R slot's rank pips sit at
 * different heights, so a card over the element alone would cover the bar's top edge), centred on the element and
 * clamped inside the viewport; left of the minimap where the two would overlap (bottom right on desktop). Below the
 * element only when there is no room above.
 */
export function placeTip(tip: HTMLElement, el: HTMLElement): void {
  const pad = 8;
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bar = el.closest<HTMLElement>('.pl-bar')?.getBoundingClientRect();
  let top = Math.min(r.top, bar && bar.height > 0 ? bar.top : r.top) - h - 10;
  if (top < pad) top = Math.max(pad, Math.min(vh - h - pad, r.bottom + 10));
  let right = vw - pad;
  const mm = document.querySelector<HTMLElement>('.pl-minimap')?.getBoundingClientRect();
  if (mm && mm.width > 0 && top < mm.bottom && top + h > mm.top) right = Math.min(right, mm.left - pad);
  const left = Math.max(pad, Math.min(r.left + r.width / 2 - w / 2, right - w));
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}
