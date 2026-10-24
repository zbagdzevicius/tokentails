// Pure layout maths shared by the set pieces, the stage scripts and the tests. SETPIECES lane.
// No three.js scene, no DOM: node-importable.

/** offset of fish i in a row (shape line | arc | wave) */
const off = { x: 0, y: 0 };
export function fishOffset(shape: string, i: number, n: number, x0: number, y0: number, h: number, amp: number): { x: number; y: number } {
  off.x = x0;
  off.y = y0;
  const u = n > 1 ? i / (n - 1) : 0.5;
  if (shape === 'arc') off.y = y0 + h * Math.sin(Math.PI * u);
  else if (shape === 'wave') off.x = x0 + amp * Math.sin(u * Math.PI * 2);
  else if (shape === 'curve') off.x = x0 + amp * (u * 2 - 1);
  return off;
}

/** tail vault geometry: plant the tail `PLANT` u before the chasm, land `LAND` u after it */
export const VAULT = { plant: 4, land: 4, window: 30 };
export const vaultHeight = (len: number): number => 4 + len * 0.09;
export function vaultArc(gapS: number, len: number): { plant: number; land: number; height: number; mid: number } {
  const plant = gapS - VAULT.plant;
  const land = gapS + len + VAULT.land;
  return { plant, land, height: vaultHeight(len), mid: (plant + land) / 2 };
}
/** height of the vault arc at s (0 outside it) */
export function vaultYAt(gapS: number, len: number, s: number): number {
  const a = vaultArc(gapS, len);
  const u = (s - a.plant) / (a.land - a.plant);
  if (u <= 0 || u >= 1) return 0;
  return 4 * a.height * u * (1 - u);
}

/** puff cloud: ride height above the canyon line */
export const CLOUD_H = 3;

/** hazard types (cost a heart) and how they are passed */
export const HAZARDS: Record<string, 'jump' | 'slide' | 'dodge'> = {
  log: 'jump',
  rock: 'dodge',
  branch: 'slide',
  driftlog: 'jump',
  riverrock: 'dodge',
  bamboo: 'dodge',
  fence: 'jump',
};
/** a gap narrower than this between a hurt box and the path edge looks passable but is not: it is closed */
export const MIN_EDGE_GAP = 1.2;
/**
 * The lateral extent [x0, x1] of a bamboo gate at x (stalks spread over `spread`) on a path `pathW` wide. A side that
 * would leave a sliver under MIN_EDGE_GAP to the path edge is extended past the edge (with stalks), so the open side
 * is clearly the only way through.
 */
export function bambooExtent(x: number, spread: number, pathW: number): [number, number] {
  const half = pathW / 2;
  let x0 = x - spread / 2 - 0.25;
  let x1 = x + spread / 2 + 0.25;
  if (half - x1 < MIN_EDGE_GAP && x1 < half + 0.6) x1 = half + 0.6;
  if (x0 + half < MIN_EDGE_GAP && x0 > -half - 0.6) x0 = -half - 0.6;
  return [x0, x1];
}
/** lateral half extent of a hazard spec (for spacing checks) */
export function hazardHalfWidth(type: string, params: Record<string, unknown> | undefined, pathW: number): number {
  const p = params ?? {};
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : d);
  if (type === 'log' || type === 'driftlog' || type === 'fence') return n('w', pathW + 1) / 2;
  if (type === 'branch') return pathW / 2 + 1;
  if (type === 'rock') return n('r', 0.8) * 0.9;
  if (type === 'riverrock') return n('r', 1) * 0.9;
  if (type === 'bamboo') return n('spread', 1.2) / 2 + 0.25;
  return 0.5;
}
