/**
 * Doodles that start spectacular (iteration 4, F10). Pure, no DOM, seeded, so every result is reproducible (and unit
 * tested in surprise.test.ts):
 *
 * - `autoStunts(def, seed)`: a fresh doodle gets a loop on its longest straight, a jump gap on another straight, and a
 *   tunnel when there is room. Each piece goes through the editor's own snap (`pieces.ts snapPiece`) and is kept only
 *   when `validateSetPieces` passes with it; the set is then test-driven once (`drive-check.ts`) and the last piece is
 *   dropped until the phone bot clears the lap. A doodle with no room for a piece simply gets fewer.
 * - `spiceUp(def, seed)`: re-rolls the item rows, the boost pad and the stunts ("Spice it up 🎲").
 * - `surpriseTrack(seed)`: a random closed stroke through the editor's pipeline (`doodleToPoints`, `starterFeatures`),
 *   a random theme and name, plus `autoStunts`; only a track the full validator (drive check included) accepts.
 *   `src/test/doodles.ts` re-exports the stroke generator for the AI wall tests.
 */
import type { SetPiece, SetPieceKind, ThemeId, TrackDef, TrackFeature } from '../../types';
import { buildTrack, type BuiltTrack } from '../../core/track/build';
import { doodleToPoints, sampleToS, starterFeatures, straightestSample, type P2 } from './doodle';
import { driveLap } from './drive-check';
import { lapsFor, PIECE_LIMITS, validateTrack } from './validate';
import { metresToUnits, pieceIssueCount, snapPiece } from './pieces';

/** A small seeded generator (LCG, the same one the test doodles always used). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Spread a small seed over 32 bits (seeds 1, 2, 3 would start the LCG on almost the same numbers). */
export function mix(seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A seed from a doodle's points (the same drawing gets the same stunts). */
export function seedOf(def: Pick<TrackDef, 'points'>): number {
  let h = 0x811c9dc5;
  for (const p of def.points) {
    h = Math.imul(h ^ (p.x & 0xff), 0x01000193);
    h = Math.imul(h ^ (p.z & 0xff), 0x01000193);
  }
  return h >>> 0;
}

/** A wobbly closed stroke (world metres), like a finger loop: `rnd` drives every choice. */
export function randomStroke(rnd: () => number): P2[] {
  const R = 55 + rnd() * 45;
  const a1 = rnd() * 0.3;
  const a2 = rnd() * 0.2;
  const p1 = rnd() * 6.28;
  const p2 = rnd() * 6.28;
  const sx = 0.7 + rnd() * 0.6;
  const stroke: P2[] = [];
  for (let k = 0; k <= 90; k++) {
    const th = (k / 90) * Math.PI * 2 * 0.985;
    const r = R * (1 + a1 * Math.sin(2 * th + p1) + a2 * Math.sin(3 * th + p2));
    stroke.push({ x: Math.cos(th) * r * sx, z: Math.sin(th) * r });
  }
  return stroke;
}

/**
 * The Surprise track's stroke: a squircle (flat sides, so a loop fits) with a random aspect, a little wobble and a
 * random turn, so no two look alike.
 */
export function surpriseStroke(rnd: () => number): P2[] {
  const R = 70 + rnd() * 35;
  const p = 3 + rnd() * 2.5;
  const ax = 0.8 + rnd() * 0.5;
  const az = 0.65 + rnd() * 0.35;
  const wob = rnd() * 0.12;
  const ph = rnd() * 6.28;
  const rot = rnd() * Math.PI;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const stroke: P2[] = [];
  for (let k = 0; k <= 120; k++) {
    const th = (k / 120) * Math.PI * 2 * 0.99;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const r = (R * (1 + wob * Math.sin(3 * th + ph))) / Math.pow(Math.abs(ct) ** p + Math.abs(st) ** p, 1 / p);
    const x = ct * r * ax;
    const z = st * r * az;
    stroke.push({ x: x * c - z * s, z: x * s + z * c });
  }
  return stroke;
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n;

/** Lap units (0..255) ordered by how straight the road is over `len` metres ahead of them, straightest first. */
function straightOrder(def: TrackDef, t: BuiltTrack, len: number, rnd: () => number, jitter: number): number[] {
  const w = Math.max(2, Math.round(len / t.step));
  const out: Array<{ s: number; score: number }> = [];
  for (let s = 0; s < 256; s += 4) {
    const i0 = wrap(Math.round((s / 256) * t.n) - startSample(def, t), t.n);
    let c = 0;
    for (let k = 0; k <= w; k += 2) c += Math.abs(t.curv[wrap(i0 + k, t.n)]);
    out.push({ s, score: c * (1 + jitter * rnd()) });
  }
  out.sort((a, b) => a.score - b.score);
  return out.map((x) => x.s);
}

function startSample(def: TrackDef, t: BuiltTrack): number {
  const st = def.features.find((f) => f.kind === 'start');
  return st ? Math.round((st.s / 256) * t.n) % t.n : 0;
}

/**
 * Try a piece at the best spots in `order`: the first spot the set-piece rules accept as it is wins; when none of the
 * first `tries` does, the editor's snap (`pieces.ts snapPiece`) searches round the best one. Kept (true) only when
 * `validateSetPieces` passes with it.
 */
function tryPlace(def: TrackDef, t: BuiltTrack, make: (s: number) => SetPiece, order: number[], tries = 8): boolean {
  const pcs = def.setPieces ?? (def.setPieces = []);
  const kind = make(0).kind;
  if (pcs.length >= PIECE_LIMITS.total || pcs.filter((p) => p.kind === kind).length >= PIECE_LIMITS[kind]) return false;
  const picked: number[] = [];
  for (const s of order) {
    if (picked.length >= tries) break;
    // spots within 6 units of one already tried are the same spot
    if (picked.some((q) => Math.min(Math.abs(q - s), 256 - Math.abs(q - s)) < 6)) continue;
    picked.push(s);
  }
  for (const s of picked) {
    const trial: TrackDef = { ...def, setPieces: [...pcs, make(s)] };
    if (pieceIssueCount(trial) === 0) {
      // already valid: the snap keeps it where it is
      pcs.push(snapPiece(trial, t, pcs.length));
      return true;
    }
  }
  if (!picked.length) return false;
  const trial: TrackDef = { ...def, setPieces: [...pcs, make(picked[0])] };
  const snapped = snapPiece(trial, t, pcs.length);
  if (pieceIssueCount({ ...def, setPieces: [...pcs, snapped] }) === 0) {
    pcs.push(snapped);
    return true;
  }
  return false;
}

/**
 * The start flag sits on the straightest stretch of a fresh doodle, which is where a loop wants to go too: move the
 * start to the next straight spot that keeps the grid valid and lets a loop in (piece and sticker positions are lap
 * units from point 0, so nothing else moves). True when the loop went in.
 */
function loopWithStartMoved(def: TrackDef, t: BuiltTrack, loopOrder: number[], rnd: () => number): boolean {
  const st = def.features.find((f) => f.kind === 'start');
  if (!st) return false;
  const s0 = st.s;
  // start spots: the grid wants the 30 m behind the line straight, so order by the 40 m from 30 m behind the line
  const back = Math.round((30 / t.length) * 256);
  const starts = straightOrder(def, t, 40, rnd, 0).map((s) => (s + back) % 256);
  let tried = 0;
  for (const s of starts) {
    const sep = Math.min(Math.abs(s - s0), 256 - Math.abs(s - s0));
    if (sep < 24) continue;
    if (++tried > 5) break;
    st.s = s;
    const bare: TrackDef = { ...def, setPieces: [] };
    if (!validateTrack(bare, { drive: false }).ok) continue;
    let t2: BuiltTrack;
    try {
      t2 = buildTrack(bare);
    } catch {
      continue;
    }
    if (tryPlace(def, t2, (q) => ({ kind: 'loop', s: q }), loopOrder, 4)) return true;
  }
  st.s = s0;
  return false;
}

/** The kinds `autoStunts` adds, in order (the loop first: it is the hardest to fit). */
export const AUTO_KINDS: readonly SetPieceKind[] = ['loop', 'jump', 'tunnel'];

/**
 * Add stunts to `def` (in place; existing pieces are replaced): a loop on the longest straight, a jump gap, a tunnel
 * when there is room, then the drive check. Returns the kinds placed.
 */
export function autoStunts(def: TrackDef, seed: number): SetPieceKind[] {
  delete def.setPieces;
  let t: BuiltTrack;
  try {
    t = buildTrack(def);
  } catch {
    return [];
  }
  const rnd = rng(mix(seed));
  def.setPieces = [];
  // the loop's zone starts ~15 m into the straight: order spots by the 70 m ahead of them
  const loopOrder = straightOrder(def, t, 70, rnd, 0.25);
  if (!tryPlace(def, t, (s) => ({ kind: 'loop', s }), loopOrder, 4) && loopWithStartMoved(def, t, loopOrder, rnd)) t = buildTrack({ ...def, setPieces: [] });
  const gap = 8 + Math.floor(rnd() * 5); // 8–12 m
  const drop = Math.round(rnd() * 3) * 0.5; // 0–1.5 m
  const jumpOrder = straightOrder(def, t, 40, rnd, 0.6);
  tryPlace(def, t, (s) => ({ kind: 'jump', s, gap, ...(drop ? { drop } : {}) }), jumpOrder);
  const tunM = 50 + Math.floor(rnd() * 3) * 10; // 50–70 m
  const tunOrder = straightOrder(def, t, tunM, rnd, 1.5);
  tryPlace(def, t, (s) => ({ kind: 'tunnel', s, len: metresToUnits(t, tunM) }), tunOrder, 4);
  // the phone bot must clear the lap: drop the last piece until it does
  while (def.setPieces.length && driveLap(def)) def.setPieces.pop();
  const kinds = def.setPieces.map((p) => p.kind);
  if (!def.setPieces.length) delete def.setPieces;
  return kinds;
}

/** Item rows and a boost pad at seeded spots (the start and the other stickers stay). */
export function rerollItems(def: TrackDef, seed: number): void {
  const rnd = rng(seed ^ 0x9e3779b9);
  const keep = def.features.filter((f) => f.kind !== 'items' && f.kind !== 'pad');
  def.features = keep;
  let t: BuiltTrack;
  try {
    t = buildTrack(def);
  } catch {
    return;
  }
  const at = (frac: number): number => sampleToS(def, t, Math.round(frac * t.n) % t.n);
  const f1 = 0.15 + rnd() * 0.2;
  const f2 = 0.55 + rnd() * 0.2;
  const rows: TrackFeature[] = [
    { s: at(f1), kind: 'items' },
    { s: at(f2), kind: 'items' },
  ];
  const padI = straightestSample(t, 30, [0, Math.round(f1 * t.n), Math.round(f2 * t.n)], 50 + rnd() * 40);
  const side = ([0, -1, 1] as const)[Math.floor(rnd() * 3)];
  def.features = [...keep, ...rows, { s: sampleToS(def, t, padI), kind: 'pad', side }];
}

/** "Spice it up 🎲": new item spots and new stunts from `seed`. Returns the stunt kinds placed. */
export function spiceUp(def: TrackDef, seed: number): SetPieceKind[] {
  rerollItems(def, seed);
  return autoStunts(def, seed);
}

const NAME_A = ['Zoomies', 'Whisker', 'Catnip', 'Purr', 'Midnight', 'Tuna', 'Yarn', 'Pounce', 'Fluffy', 'Paw'];
const NAME_B = ['Ring', 'Loop', 'Dash', 'Circuit', 'Run', 'Sprint', 'Spiral', 'Speedway', 'Rally', 'Raceway'];
const THEMES: readonly ThemeId[] = [0, 1, 2, 3, 4, 5, 6];

/** Night themes race after dark (as in the editor). */
const nightOf = (theme: ThemeId): 0 | 2 => (theme === 1 || theme === 4 ? 2 : 0);

/**
 * A ready-to-race random doodle: a closed stroke through the editor's pipeline, a random theme and name, stunts. Only
 * a track the full validator (the drive check included) accepts; `null` after `tries` strokes (never seen in tests).
 */
export function surpriseTrack(seed: number, tries = 12): TrackDef | null {
  const rnd = rng(mix(seed));
  for (let k = 0; k < tries; k++) {
    const pts = doodleToPoints(surpriseStroke(rnd), (2 + (k % 2)) as 2 | 3);
    if (!pts.ok) continue;
    const theme = THEMES[Math.floor(rnd() * THEMES.length)];
    let def: TrackDef;
    try {
      def = starterFeatures(pts.points, theme);
    } catch {
      continue;
    }
    def.timeOfDay = nightOf(theme);
    def.name = `${NAME_A[Math.floor(rnd() * NAME_A.length)]} ${NAME_B[Math.floor(rnd() * NAME_B.length)]}`;
    if (!validateTrack(def).ok) continue;
    autoStunts(def, (seed + k * 7919) >>> 0);
    const v = validateTrack(def);
    if (!v.ok) {
      // the stunts never cost a drivable track
      delete def.setPieces;
      if (!validateTrack(def).ok) continue;
    }
    if (v.built) def.laps = lapsFor(v.length);
    return def;
  }
  return null;
}

/** Seeded random doodle loops through the editor's pipeline, valid ones only (moved here from `test/doodles.ts`). */
export function randomDoodles(count: number, seed = 1): TrackDef[] {
  const out: TrackDef[] = [];
  const rnd = rng(seed);
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const pts = doodleToPoints(randomStroke(rnd), (2 + (tries % 2)) as 2 | 3);
    if (!pts.ok) continue;
    const def = { ...starterFeatures(pts.points, 0), id: `doodle-${tries}`, name: `Doodle ${tries}` };
    if (!validateTrack(def).ok) continue;
    out.push(def);
  }
  return out;
}
