/**
 * Sim v34 (docs/plans/moba/V34-MAPS.md §7): the 3v3 map pool on the client. Every Skirmish draws its map from the
 * match seed (`pickMap3v3`, the same rule the party relay and the backend use); a player's first 3 matches stay on
 * Purrhaven Crossing; the client re-draws the seed (at most 8 times) to avoid the map it played last. Practice lets the
 * player pick the map (Random by default). The cards' names and one-line rules are UI text (the sim's MapDef carries
 * the same blurbs for tools).
 */
import { MAP_IDS, MAP_POOL_3V3, pickMap3v3, type MapId } from '../sim/api';
import { mapSchemes, type SeasonId } from '../render/mapSchemes';

export interface MapCard {
  id: MapId;
  name: string;
  /** The short chip label. */
  short: string;
  line: string;
}

export const MAP_CARDS: Readonly<Record<MapId, MapCard>> = Object.freeze({
  crossing: { id: 'crossing', name: 'Purrhaven Crossing', short: 'Crossing', line: 'Two lanes, a rat camp each side, Pudding in the river.' },
  hearthwood: { id: 'hearthwood', name: 'Hearthwood Divide', short: 'Hearthwood', line: 'Three lanes, a big jungle, Grizzlechop and the Great Pudding.' },
  ridge: { id: 'ridge', name: 'Lanternfall Ridge', short: 'Ridge', line: 'One lane on the ridge. Take the Fish Mill in the woods; at 4:30 Pudding wakes there.' },
  thicket: { id: 'thicket', name: 'Twinbark Thicket', short: 'Thicket', line: 'Two Paw Shrines. Hold one to run faster, both to hit towers harder.' },
  quarry: { id: 'quarry', name: 'Geode Quarry', short: 'Quarry', line: 'Grab Catnip Gems from the Geode. Hold 7 for 12 s for a Geode Surge.' },
  pitch: { id: 'pitch', name: 'Pawball Park', short: 'Park', line: 'Kick the yarn ball into their goal. Every goal smashes a tower.' },
});

export const mapName = (id: string | undefined | null): string => MAP_CARDS[(id ?? 'crossing') as MapId]?.name ?? MAP_CARDS.crossing.name;

/** A uint32 from the platform RNG (the match seed is an input; never drawn inside the sim). */
export function drawSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0;
  } catch {
    return (Date.now() ^ 0x9e3779b9) >>> 0;
  }
}

const LAST = 'pl.lastMap3v3';
const PRACTICE = 'pl.practiceMap';
const PRACTICE_SCHEME = 'pl.practiceScheme';

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

/** The map a 3v3 Skirmish played last on this device (null: none or no storage). */
export const lastMap = (): MapId | null => {
  const v = read(LAST);
  return v && (MAP_POOL_3V3 as readonly string[]).includes(v) ? (v as MapId) : null;
};
export const rememberMap = (map: MapId): void => write(LAST, map);

/**
 * A Skirmish seed and its map: `draw()` seeds until the map differs from the last one played (at most 8 tries; the
 * pick is the seed's own, so the backend replays exactly this map).
 */
export function rollMap(draw: () => number, avoid: MapId | null = lastMap()): { seed: number; map: MapId } {
  let seed = draw() >>> 0;
  for (let i = 0; i < 8 && avoid !== null && pickMap3v3(seed) === avoid; i++) seed = draw() >>> 0;
  return { seed, map: pickMap3v3(seed) };
}

/** Practice's map: one of the pool or 'random' (the default). */
export type PracticeMap = MapId | 'random';
export const practiceMap = (): PracticeMap => {
  const v = read(PRACTICE);
  return v && (MAP_POOL_3V3 as readonly string[]).includes(v) ? (v as MapId) : 'random';
};
export const setPracticeMap = (m: PracticeMap): void => write(PRACTICE, m);
export const PRACTICE_CHOICES: readonly PracticeMap[] = Object.freeze(['random', ...MAP_POOL_3V3]);

/**
 * Practice's map colour scheme (render/mapSchemes.ts): 'random' (the match seed picks, the default) or a season. The
 * small swatch chip next to the map chips cycles through the picked map's seasons (with Random maps: every pool map's
 * seasons). A season the drawn map lacks plays the seed's scheme.
 */
export type PracticeScheme = SeasonId | 'random';
/** The seasons offered for a Practice map pick, Random first. */
export function practiceSchemeChoices(map: PracticeMap): readonly PracticeScheme[] {
  if (map !== 'random') return ['random', ...mapSchemes(map).map((s) => s.season)];
  const all: PracticeScheme[] = ['random'];
  for (const m of MAP_POOL_3V3) for (const s of mapSchemes(m)) if (!all.includes(s.season)) all.push(s.season);
  return all;
}
/** The saved scheme when the current map offers it, else 'random'. */
export const practiceScheme = (map: PracticeMap = practiceMap()): PracticeScheme => {
  const v = read(PRACTICE_SCHEME);
  return v && (practiceSchemeChoices(map) as readonly string[]).includes(v) ? (v as PracticeScheme) : 'random';
};
export const setPracticeScheme = (s: PracticeScheme): void => write(PRACTICE_SCHEME, s);
/** The season a Practice match asks for (null: the seed picks). */
export const practiceSchemeWish = (): SeasonId | null => {
  const v = read(PRACTICE_SCHEME);
  return v && v !== 'random' ? (v as SeasonId) : null;
};
/** Display names and swatch colours (ground, trees) of the seasons. */
export const SCHEME_CHIPS: Readonly<Record<PracticeScheme, { name: string; a: string; b: string }>> = Object.freeze({
  random: { name: 'Random colours', a: '#7cc35a', b: '#f2a5c0' },
  native: { name: 'Native colours', a: '#6fbf4a', b: '#2f8a3a' },
  bloom: { name: 'Blossom', a: '#9fd86a', b: '#f6b3cc' },
  verdant: { name: 'Summer', a: '#5fc24a', b: '#1f7a34' },
  harvest: { name: 'Harvest', a: '#d9b04a', b: '#e0602a' },
  frost: { name: 'First snow', a: '#eef3fa', b: '#3d6b6a' },
});

/** A known non-Crossing map id from a message or config (a room's, a record's), else undefined. */
export function poolMapOf(map: string | null | undefined): MapId | undefined {
  return map && map !== 'crossing' && (MAP_IDS as readonly string[]).includes(map) ? (map as MapId) : undefined;
}
