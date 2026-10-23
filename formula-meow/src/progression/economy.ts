/**
 * Fish coins (ITERATION-2 progression): an in-game currency only. No real money, no purchase path, no ads.
 *
 * Per race: coins held at the finish (max 10) + coins picked up + a place bonus 10/8/6/5/4/3/2/1 times the class
 * multiplier (1 / 1.25 / 1.5; Mirror counts as 150cc). Time trial pays medals 15/10/5; a battle win pays 15 (the rest
 * of a battle field gets 2 per balloon popped or stolen, at most 10). A DNF keeps its coins only.
 */
import type { RaceClass, RaceMode, RaceResult, RaceStats } from '../types';
import { BODY_IDS, HAT_IDS, BODY_NAMES } from '../content/ids';
import { BODY_PRICES, HAT_INFO, HAT_PRICES } from '../content/cosmetics';
import type { ProgSave } from './state';

export const PLACE_FISH: readonly number[] = [10, 8, 6, 5, 4, 3, 2, 1];
export const CLASS_MULT: readonly number[] = [1, 1.25, 1.5];
export const MEDAL_FISH: readonly number[] = [15, 10, 5];
export const BATTLE_WIN_FISH = 15;
export const MAX_COINS_HELD = 10;

/** One line of the fish breakdown (label is a `t()` key, vars fill it). */
export interface FishLine {
  key: string;
  vars?: Record<string, string | number>;
  amount: number;
}

export interface RaceFishInput {
  mode: RaceMode;
  cls: RaceClass;
  /** player's place (1-based) and whether they finished */
  place: number;
  finished: boolean;
  /** coins held at the end and picked up during the race */
  coinsHeld: number;
  coinsPicked: number;
  /** battle */
  battleWin?: boolean;
  balloonsTaken?: number;
  /** a lone kart (a 1v1 ghost duel): no one to place against, so no place bonus */
  solo?: boolean;
}

export function placeBonus(place: number, cls: RaceClass): number {
  const base = PLACE_FISH[place - 1] ?? 0;
  return Math.round(base * (CLASS_MULT[cls] ?? 1));
}

/** The fish a race pays, as breakdown lines (pure). */
export function fishForRace(r: RaceFishInput): FishLine[] {
  const out: FishLine[] = [];
  if (r.mode === 'tt') return out; // medals are paid separately (recordMedal)
  if (r.mode === 'battle') {
    if (r.battleWin) out.push({ key: 'Battle win', amount: BATTLE_WIN_FISH });
    else if (r.balloonsTaken) out.push({ key: 'Balloons popped', amount: Math.min(10, r.balloonsTaken * 2) });
    return out;
  }
  const held = Math.max(0, Math.min(MAX_COINS_HELD, Math.floor(r.coinsHeld)));
  const picked = Math.max(0, Math.floor(r.coinsPicked));
  if (r.finished && !r.solo) {
    const b = placeBonus(r.place, r.cls);
    if (b > 0) out.push({ key: 'Place {p}', vars: { p: r.place }, amount: b });
  }
  if (picked > 0) out.push({ key: 'Fish picked up', amount: picked });
  if (held > 0 && r.finished) out.push({ key: 'Fish held at the line', amount: held });
  return out;
}

export function raceFishInput(result: RaceResult, stats: RaceStats | undefined): RaceFishInput {
  const me = result.player;
  const mode = result.mode ?? 'race';
  const battleWin = mode === 'battle' && me.place === 1;
  return {
    mode,
    cls: result.cls,
    place: me.place,
    finished: me.time != null || battleWin,
    coinsHeld: result.coins ?? 0,
    coinsPicked: stats?.coinsPicked ?? 0,
    battleWin,
    balloonsTaken: (stats?.balloonPops ?? 0) + (stats?.balloonSteals ?? 0),
    solo: result.places.length <= 1,
  };
}

export function sumFish(lines: readonly FishLine[]): number {
  let s = 0;
  for (const l of lines) s += l.amount;
  return s;
}

export function medalFish(medal: number): number {
  return MEDAL_FISH[medal - 1] ?? 0;
}

/** Something the player can buy (shop catalogue, cheapest first). */
export interface ShopItem {
  kind: 'body' | 'hat';
  id: number;
  name: string;
  icon: string;
  price: number;
}

export function shopCatalogue(): ShopItem[] {
  const out: ShopItem[] = [];
  for (const b of BODY_IDS) if (BODY_PRICES[b] > 0) out.push({ kind: 'body', id: b, name: BODY_NAMES[b], icon: '🏎️', price: BODY_PRICES[b] });
  HAT_IDS.forEach((h, i) => {
    if (i > 0) out.push({ kind: 'hat', id: i, name: HAT_INFO[h].name, icon: HAT_INFO[h].icon, price: HAT_PRICES[h] });
  });
  return out.sort((a, b) => a.price - b.price || a.id - b.id);
}

export function owns(s: ProgSave, kind: 'body' | 'hat', id: number): boolean {
  return kind === 'body' ? s.owned.bodies.includes(id) : s.owned.hats.includes(id);
}

/**
 * The "next goal" line: the cheapest thing not owned yet. `affordable` is true when the fish already cover it (the
 * results then offer the garage). Null when everything is owned.
 */
export function nextGoal(s: ProgSave): { item: ShopItem; missing: number; affordable: boolean } | null {
  const items = shopCatalogue().filter((i) => !owns(s, i.kind, i.id));
  if (!items.length) return null;
  const can = items.filter((i) => i.price <= s.fish);
  // something affordable: point at the priciest one they can buy now; otherwise the cheapest one still out of reach
  const item = can.length ? can[can.length - 1] : items[0];
  return { item, missing: Math.max(0, item.price - s.fish), affordable: item.price <= s.fish };
}

export type BuyResult = { ok: true; save: ProgSave } | { ok: false; reason: 'owned' | 'fish' | 'unknown' };

/** Buy a body or a hat (pure: returns a new save). */
export function buy(s: ProgSave, kind: 'body' | 'hat', id: number): BuyResult {
  const item = shopCatalogue().find((i) => i.kind === kind && i.id === id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (owns(s, kind, id)) return { ok: false, reason: 'owned' };
  if (s.fish < item.price) return { ok: false, reason: 'fish' };
  const n: ProgSave = { ...s, fish: s.fish - item.price, owned: { ...s.owned } };
  if (kind === 'body') n.owned.bodies = [...s.owned.bodies, id].sort();
  else n.owned.hats = [...s.owned.hats, id].sort();
  return { ok: true, save: n };
}
