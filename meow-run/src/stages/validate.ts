// Layout validation and score balance for stage scripts. SETPIECES lane. Pure (node-importable), used by the tests.
import { BELL_POINTS, finishBonus, FISH_POINTS, multAfterPickup, pickupPoints, speedAt, TREAT_POINTS } from '../core/scoring';
import type { Track } from '../core/track';
import { MAX_HEARTS, NO_FLOOR, type PieceSpec, type StageDef } from '../core/types';
import { bambooExtent, CLOUD_H, HAZARDS, hazardHalfWidth, MIN_EDGE_GAP, vaultArc, vaultYAt } from '../setpieces/layout';

/** the reaction time we guarantee between hazards on the same line at the stage's top speed */
export const REACT_S = 0.6;
/** a gap this long or shorter can be cleared with a jump (+ pounce); longer gaps need the vault */
export const MAX_JUMP_GAP = 18;
const RIVER_HAZARDS = new Set(['driftlog', 'riverrock']);

const P = (sp: PieceSpec, k: string, d: number) => (typeof sp.params?.[k] === 'number' ? (sp.params[k] as number) : d);

/** Returns a list of problems (empty = the layout is fair). */
export function validateLayout(stage: StageDef, track: Track, pieces: PieceSpec[], endS = track.length): string[] {
  const out: string[] = [];
  const vmax = stage.speed.max;
  const segs = track.segments;
  const vaults = pieces.filter((p) => p.type === 'vault').map((p) => {
    const gapS = p.s + P(p, 'gap', 30);
    const len = P(p, 'len', 24);
    return { gapS, len, ...vaultArc(gapS, len) };
  });
  const clouds = pieces.filter((p) => p.type === 'cloud').map((p) => ({ edge: p.s + P(p, 'gap', 30), len: P(p, 'len', 80) }));
  const inVault = (s: number, pad = 2) => vaults.some((v) => s > v.plant - pad && s < v.land + pad);

  // ---- segments are covered by their set pieces
  for (const g of segs) {
    if (g.s1 > endS) continue;
    if (g.kind === 'gap') {
      const len = g.s1 - g.s0;
      const v = vaults.find((x) => Math.abs(x.gapS - g.s0) < 0.5);
      if (v && Math.abs(v.len - len) > 0.5) out.push(`vault at ${g.s0} has len ${v.len} but the gap is ${len}`);
      if (!v && len > MAX_JUMP_GAP) out.push(`gap at ${g.s0} (${len} u) is too long to jump and has no vault`);
    }
    if (g.kind === 'cloud' && !clouds.some((c) => Math.abs(c.edge - g.s0) < 0.5 && Math.abs(c.len - (g.s1 - g.s0)) < 0.5)) out.push(`cloud segment at ${g.s0} has no cloud piece`);
    if (g.kind === 'wall' && !pieces.some((p) => p.type === 'wallrun' && Math.abs(p.s - g.s0) < 0.5)) out.push(`wall segment at ${g.s0} has no wallrun piece`);
    if (g.kind === 'river' && !pieces.some((p) => p.type === 'river' && Math.abs(p.s - g.s0) < 0.5)) out.push(`river segment at ${g.s0} has no river piece`);
  }

  // ---- hazards: on a floor, clear of vault arcs and gap rims, river hazards only on the river
  const hz = pieces
    .filter((p) => HAZARDS[p.type])
    .map((p) => {
      const w = track.widthAt(p.s);
      const x = p.x ?? 0;
      const hw = hazardHalfWidth(p.type, p.params, w);
      // a bamboo gate closes an edge sliver: its real extent
      const [x0, x1] = p.type === 'bamboo' ? bambooExtent(x, P(p, 'spread', 1.2), w) : [x - hw, x + hw];
      return { p, s: p.s, x0, x1, w };
    })
    .sort((a, b) => a.s - b.s);
  for (const h of hz) {
    const kind = track.kindAt(h.s);
    // no hurt box may leave a sliver to the path edge that looks passable but is not
    if (h.p.type === 'bamboo') {
      const [b0, b1] = bambooExtent(h.p.x ?? 0, P(h.p, 'spread', 1.2), h.w);
      const half = h.w / 2;
      const gl = b0 + half;
      const gr = half - b1;
      if ((gl > 0 && gl < MIN_EDGE_GAP) || (gr > 0 && gr < MIN_EDGE_GAP)) out.push(`bamboo at ${h.s} leaves a sliver under ${MIN_EDGE_GAP} u to the path edge`);
    }
    if (NO_FLOOR.has(kind)) out.push(`${h.p.type} at ${h.s} floats over a ${kind}`);
    if (inVault(h.s)) out.push(`${h.p.type} at ${h.s} sits in a vault arc`);
    if (RIVER_HAZARDS.has(h.p.type) !== (kind === 'river')) out.push(`${h.p.type} at ${h.s} is on ${kind}`);
    for (const g of segs) {
      if (!NO_FLOOR.has(g.kind)) continue;
      if (h.s > g.s0 - 6 && h.s < g.s0) out.push(`${h.p.type} at ${h.s} is on the take-off rim of the ${g.kind} at ${g.s0}`);
      if (h.s >= g.s1 && h.s < g.s1 + 10) out.push(`${h.p.type} at ${h.s} is on the landing of the ${g.kind} ending at ${g.s1}`);
    }
  }
  // spacing: hazards that block the same line need REACT_S at top speed; side-by-side ones must leave a 1.4 u lane
  const need = REACT_S * vmax;
  for (let i = 0; i < hz.length; i++) {
    for (let j = i + 1; j < hz.length && hz[j].s - hz[i].s < need; j++) {
      const a = hz[i];
      const c = hz[j];
      const overlap = Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > -0.8;
      if (overlap) out.push(`${a.p.type} at ${a.s} and ${c.p.type} at ${c.s} block the same line ${(c.s - a.s).toFixed(1)} u apart (< ${need.toFixed(1)})`);
    }
    // the lane left free at this s (jump/slide hazards that span the path are passable by their action)
    if (HAZARDS[hz[i].p.type] === 'dodge') {
      const near = hz.filter((o) => Math.abs(o.s - hz[i].s) < 1.5 && HAZARDS[o.p.type] === 'dodge');
      const half = hz[i].w / 2;
      let x = -half;
      let free = 0;
      for (const o of near.sort((a, b) => a.x0 - b.x0)) {
        free = Math.max(free, o.x0 - x);
        x = Math.max(x, o.x1);
      }
      free = Math.max(free, half - x);
      if (free < 1.4) out.push(`dodge hazards at ${hz[i].s} leave no 1.4 u lane`);
    }
  }
  // puddles only on plain ground
  for (const p of pieces) if (p.type === 'puddle' && track.kindAt(p.s) !== 'ground') out.push(`puddle at ${p.s} on ${track.kindAt(p.s)}`);

  // ---- pickups inside the path and reachable
  for (const p of pieces) {
    if (!['bell', 'yarn', 'treat', 'fish', 'ring'].includes(p.type)) continue;
    const w = track.widthAt(p.s);
    const x = Math.abs(p.x ?? 0) + (p.type === 'fish' && p.params?.shape === 'wave' ? P(p, 'amp', 2) : 0);
    if (x > w / 2 - 0.3) out.push(`${p.type} at ${p.s} sits outside the path (|x| ${x.toFixed(1)}, width ${w.toFixed(1)})`);
    if (p.type !== 'bell') continue;
    const y = p.y ?? 1;
    const kind = track.kindAt(p.s);
    const v = vaults.find((vv) => p.s > vv.plant && p.s < vv.land);
    if (v) {
      if (Math.abs(y - vaultYAt(v.gapS, v.len, p.s)) > 1.2) out.push(`bell ${p.params?.index} misses the vault arc`);
    } else if (kind === 'cloud') {
      if (y < CLOUD_H || y > CLOUD_H + 3.2) out.push(`bell ${p.params?.index} is out of reach of the cloud`);
    } else if (kind === 'gap') {
      if (y > 4) out.push(`bell ${p.params?.index} over the gap is too high`);
    } else if (y > 3.3) out.push(`bell ${p.params?.index} is out of jump reach`);
    // no ground bell inside a hazard
    if (y < 2) for (const h of hz) if (Math.abs(h.s - p.s) < 3 && (p.x ?? 0) > h.x0 - 0.6 && (p.x ?? 0) < h.x1 + 0.6) out.push(`bell ${p.params?.index} at ${p.s} sits on a ${h.p.type}`);
  }
  return out;
}

/** GDD bell rules for a campaign stage */
export function bellRules(track: Track, pieces: PieceSpec[]): { air: boolean; route: boolean; offLine: boolean } {
  const bells = pieces.filter((p) => p.type === 'bell');
  const vaults = pieces.filter((p) => p.type === 'vault').map((p) => vaultArc(p.s + P(p, 'gap', 30), P(p, 'len', 24)));
  const air = bells.some((b) => (b.y ?? 1) > 2 && !NO_FLOOR.has(track.kindAt(b.s)) && !vaults.some((v) => b.s > v.plant && b.s < v.land));
  const route = bells.some((b) => ['cloud', 'wall', 'river'].includes(track.kindAt(b.s)) || vaults.some((v) => b.s > v.plant && b.s < v.land));
  const offLine = bells.some((b) => Math.abs(b.x ?? 0) >= 2.5);
  return { air, route, offLine };
}

/** seconds to run the stage at its ramped speed (no boosts, no hits) */
export function runSeconds(stage: StageDef, length: number): number {
  let t = 0;
  for (let s = 0; s < length; s += 1) t += 1 / speedAt(stage.speed, s);
  return t;
}

/**
 * The best possible score for a clean run: every pickup in order (multiplier +1 per fish), every set-piece bonus,
 * full hearts at the finish. Near misses (+1 each) are left out, so a great player can beat it a little.
 */
export function perfectScore(pieces: PieceSpec[], finishS: number): number {
  let score = finishS + finishBonus(MAX_HEARTS);
  let mult = 1;
  for (const p of [...pieces].sort((a, b) => a.s - b.s)) {
    if (p.type === 'fish') {
      for (let i = 0; i < P(p, 'n', 5); i++) {
        score += pickupPoints(FISH_POINTS, mult);
        mult = multAfterPickup(mult);
      }
    } else if (p.type === 'bell') score += pickupPoints(BELL_POINTS, mult);
    else if (p.type === 'treat') score += pickupPoints(TREAT_POINTS, mult);
    else if (p.type === 'yarn') score += pickupPoints(150, mult);
    else if (p.type === 'ring') score += pickupPoints(120, mult);
    else if (p.type === 'vault') score += pickupPoints(250, mult);
    else if (p.type === 'wallrun' || p.type === 'river') score += pickupPoints(200, mult);
    else if (p.type === 'dog' || p.type === 'yarnchase') score += pickupPoints(300, mult);
  }
  return Math.round(score);
}

/** what a "good run" means for the third star (see goodRunScore) */
export interface GoodRun {
  /** hits taken, spread evenly over the stage (each halves the multiplier) */
  hits: number;
  /** one fish in every `missEvery` is missed */
  missEvery: number;
  /** hearts left at the finish */
  hearts: number;
}
/**
 * The third-star yardstick (GDD "Score targets"): a strong run, roughly the top third of runs. Every bell and set
 * piece, 9 of every 10 fish, one hit halfway (the multiplier halves) and two hearts left. A clean run beats it
 * comfortably; two early hits or a sloppy fish line do not. Near misses are left out (bonus for great players).
 */
export const GOOD_RUN: GoodRun = { hits: 1, missEvery: 10, hearts: 2 };

export function goodRunScore(pieces: PieceSpec[], finishS: number, run: GoodRun = GOOD_RUN): number {
  let score = finishS + finishBonus(run.hearts);
  let mult = 1;
  let hits = 0;
  let fishSeen = 0;
  for (const p of [...pieces].sort((a, b) => a.s - b.s)) {
    while (hits < run.hits && p.s > (finishS * (hits + 1)) / (run.hits + 1)) {
      hits++;
      mult = Math.max(1, Math.floor(mult / 2));
    }
    if (p.type === 'fish') {
      for (let i = 0; i < P(p, 'n', 5); i++) {
        if (fishSeen++ % run.missEvery === run.missEvery - 1) continue;
        score += pickupPoints(FISH_POINTS, mult);
        mult = multAfterPickup(mult);
      }
    } else if (p.type === 'bell') score += pickupPoints(BELL_POINTS, mult);
    else if (p.type === 'treat') score += pickupPoints(TREAT_POINTS, mult);
    else if (p.type === 'yarn') score += pickupPoints(150, mult);
    else if (p.type === 'ring') score += pickupPoints(120, mult);
    else if (p.type === 'vault') score += pickupPoints(250, mult);
    else if (p.type === 'wallrun' || p.type === 'river') score += pickupPoints(200, mult);
    else if (p.type === 'dog' || p.type === 'yarnchase') score += pickupPoints(300, mult);
  }
  return Math.round(score);
}
