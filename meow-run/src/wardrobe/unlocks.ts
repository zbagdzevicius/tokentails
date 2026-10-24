// Wardrobe unlock rules (pure, node-importable): lifetime counters from the save, ownership, NEW items, the rule
// text a locked tile shows, and normalizeLook (the equipped look may only wear owned items).
import type { SaveData } from '../meta/save';
import { ALL_ITEMS, CATALOG, clampIndex, COUNTERS, type Counter, type Item, type Unlock } from './catalog';
import { LOOK_SLOTS, type Look } from './look';

export type Progress = Record<Counter, number>;

const n0 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** every counter the rules read, from a (migrated) save */
export function progress(save: SaveData): Progress {
  let stars = 0;
  let bells = 0;
  for (const p of Object.values(save.stages ?? {})) {
    if (!p) continue;
    if (Array.isArray(p.stars)) for (const s of p.stars) if (s === true) stars++;
    bells += n0(p.bestBells);
  }
  const u = save.ugcStats ?? ({} as Partial<SaveData['ugcStats']>);
  return {
    stars,
    bells,
    fish: n0(save.totals?.fish),
    distance: n0(save.totals?.distance),
    endlessDist: n0(save.endlessBest?.distance),
    chain: n0(u.bestChain),
    tricks: n0(u.tricks),
    daily: n0(u.dailyPlays),
    challengesWon: n0(u.challengesWon),
    trailsFinished: n0(u.trailsFinished),
    clips: n0(u.clips),
    photos: n0(u.photos),
    shares: n0(u.shares),
  };
}

const isProgress = (x: SaveData | Progress): x is Progress => typeof (x as Progress).stars === 'number' && !('stages' in x);

/** owned = free, or its counter has reached n */
export function isOwned(item: Item, from: SaveData | Progress): boolean {
  const u = item.unlock;
  if (u.kind === 'free') return true;
  const p = isProgress(from) ? from : progress(from);
  return p[u.kind] >= u.n;
}

/** keys of every owned item (catalogue order) */
export function ownedKeys(save: SaveData): string[] {
  const p = progress(save);
  return ALL_ITEMS.filter((it) => isOwned(it, p)).map((it) => it.key);
}

/**
 * owned items the player has not seen yet (NEW badges). The classic items (index 0) never count: they are what
 * Mochi already wears.
 */
export function newlyOwned(save: SaveData): Item[] {
  const p = progress(save);
  const seen = new Set(save.wardrobe?.seen ?? []);
  return ALL_ITEMS.filter((it) => it.index > 0 && isOwned(it, p) && !seen.has(it.key));
}

const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** what a locked tile says ('Collect 14 bells') */
export function ruleText(u: Unlock): string {
  if (u.kind === 'free') return 'Free';
  const n = u.n;
  switch (u.kind) {
    case 'stars':
      return `Earn ${fmt(n)} ${plural(n, 'star', 'stars')}`;
    case 'bells':
      return `Collect ${fmt(n)} ${plural(n, 'bell', 'bells')}`;
    case 'fish':
      return `Catch ${fmt(n)} fish`;
    case 'distance':
      return `Run ${fmt(n)} m in total`;
    case 'endlessDist':
      return `Run ${fmt(n)} m in Endless`;
    case 'chain':
      return `Hit a ${fmt(n)} combo`;
    case 'tricks':
      return `Land ${fmt(n)} ${plural(n, 'trick', 'tricks')}`;
    case 'daily':
      return n === 1 ? 'Play a Daily Run' : `Play ${fmt(n)} Daily Runs`;
    case 'challengesWon':
      return n === 1 ? "Beat a friend's challenge" : `Beat ${fmt(n)} challenges`;
    case 'trailsFinished':
      return n === 1 ? 'Finish a trail' : `Finish ${fmt(n)} trails`;
    case 'clips':
      return n === 1 ? 'Save a clip' : `Save ${fmt(n)} clips`;
    case 'photos':
      return n === 1 ? 'Take a photo' : `Take ${fmt(n)} photos`;
    case 'shares':
      return n === 1 ? 'Share a run' : `Share ${fmt(n)} runs`;
  }
}

/** progress toward a rule: have (capped at need), need, frac 0..1 */
export function ruleProgress(u: Unlock, p: Progress): { have: number; need: number; frac: number } {
  if (u.kind === 'free') return { have: 1, need: 1, frac: 1 };
  const have = Math.min(u.n, Math.floor(p[u.kind]));
  return { have, need: u.n, frac: u.n > 0 ? have / u.n : 1 };
}

/**
 * A wearable look: indices past the catalogue fall back to 0 (classic). With a save, unowned items also fall back
 * to 0: use it for the EQUIPPED look only (looks from challenge links are display-only and never ownership-checked).
 */
export function normalizeLook(look: Partial<Look> | null | undefined, save?: SaveData): Look {
  const p = save ? progress(save) : null;
  const out = {} as Look;
  for (const slot of LOOK_SLOTS) {
    const i = clampIndex(slot, look?.[slot]);
    out[slot] = p && !isOwned(CATALOG[slot][i], p) ? 0 : i;
  }
  return out;
}

/** every counter kind used by at least one rule (the tests check all are reachable) */
export const usedCounters = (): Set<Counter> => new Set(ALL_ITEMS.flatMap((it) => (it.unlock.kind === 'free' ? [] : [it.unlock.kind])));
export { COUNTERS };
