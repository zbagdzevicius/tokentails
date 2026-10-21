/**
 * Traps (items-ai lane, GDD 4): the Yarn tangle (dropped behind, spins out) and the Cucumber (lobbed ~18 m ahead or
 * dropped; the cat that hits it does the jump-scare leap). Traps live 30 s, at most 12 on the track (the oldest
 * goes first). A Cardboard Box or Zoomies kart clears a trap without being hit. Sim-safe math only.
 *
 * Set pieces (SIM_VERSION 8, ai-ugc lane): a trap never lies under a loop (riders pass above it, so it would sit there
 * for nothing) or in a jump's lip, gap or landing window (a landing kart cannot steer round it). A lobbed cucumber
 * that would land there lands just past the piece; a dropped trap is left just before it.
 *
 * SIM_VERSION 10: "ahead" and "behind" are the way the kart faces (`facing`): a cat driving against the lap (an arena,
 * a spin) lobs its cucumber where it looks and drops its tangle where it came from. A kart on a branch places the trap
 * on the branch (its `d` is measured from the branch's centre line, its width is the branch's).
 */
import { ITEMS, ticks } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { speedOf } from '../../core/sim/kart';
import { clamp } from '../../core/sim/fixed';
import { TrapKind, branchOf, branchSampleAt, facing, itemsOf, routePoint, sampleAt, type Trap } from './state';
import { pieceAtSample } from '../../core/track/stunt';
import { itemHit, touchable } from './hits';

const T = ITEMS.trap;
const pt = { x: 0, y: 0, z: 0, si: 0 };

/** Move a trap spot off a loop or a jump (along +s past it, or back before it). */
function clearOfPieces(ctx: SimContext, dist: number, forward: boolean): number {
  const t = ctx.track;
  if (!t.pieces.length) return dist;
  const i = sampleAt(t, dist);
  const pc = pieceAtSample(t, i);
  if (!pc || !(pc.kind === 'loop' || (pc.kind === 'jump' && pc.gap > 0))) return dist;
  const pad = Math.round(2 / t.step);
  return forward ? dist + ((((pc.end - i) % t.n) + t.n) % t.n + pad) * t.step : dist - ((((i - pc.strip) % t.n) + t.n) % t.n + pad) * t.step;
}

/**
 * Place a trap `ahead` metres from the kart along the way it faces (< 0 = behind it). On a branch the metres are the
 * branch's (lap distance runs `sk` times as fast there).
 */
function place(ctx: SimContext, owner: number, kind: Trap['kind'], ahead: number, flight: number): Trap {
  const s = itemsOf(ctx.st);
  const t = ctx.track;
  const k = ctx.st.karts[owner];
  const b = branchOf(t, k.branch);
  const sgn = facing(t, k) * Math.sign(ahead);
  let dist = k.dist + facing(t, k) * ahead * (b ? b.sk : 1);
  const j = b ? branchSampleAt(t, b, dist) : -1;
  // set pieces are on the main loop only
  if (j < 0) dist = clearOfPieces(ctx, dist, sgn > 0);
  // clamp to the road width where the trap lands, not where it was thrown (B21)
  const lim = (j >= 0 && b ? b.halfW[j] : t.halfW[sampleAt(t, dist)]) - 1;
  const tr: Trap = { id: s.nextId++, kind, owner, x: 0, y: 0, z: 0, dist, d: clamp(k.d, -lim, lim), life: ticks(T.life), flight, flightMax: flight, fx: k.x, fy: k.y + 1, fz: k.z, imm: ticks(T.ownerImmune) };
  routePoint(t, tr.dist, tr.d, j >= 0 ? k.branch : -1, pt);
  tr.x = pt.x;
  tr.y = pt.y;
  tr.z = pt.z;
  while (s.traps.length >= T.max) s.traps.shift();
  s.traps.push(tr);
  return tr;
}

/** Drop a trap just behind the kart. */
export function dropTrap(ctx: SimContext, owner: number, kind: Trap['kind']): void {
  place(ctx, owner, kind, -T.drop, 0);
}

/** Lob a cucumber so it lands about 18 m ahead of where the kart will be. */
export function lobCucumber(ctx: SimContext, owner: number): void {
  const k = ctx.st.karts[owner];
  const C = ITEMS.cucumber;
  const tr = place(ctx, owner, TrapKind.Cucumber, C.lob + speedOf(k) * C.flight, ticks(C.flight));
  // the thrower drives past its own cucumber unharmed (a tap on a phone should never punish the tapper)
  tr.imm = ticks(C.flight + C.ownerPass);
}

export function stepTraps(ctx: SimContext): void {
  const s = itemsOf(ctx.st);
  const ks = ctx.st.karts;
  const r2 = T.radius * T.radius;
  for (const tr of s.traps) {
    if (tr.life <= 0) continue;
    tr.life--;
    if (tr.imm > 0) tr.imm--;
    if (tr.flight > 0) {
      tr.flight--;
      continue;
    }
    for (let j = 0; j < ks.length; j++) {
      const k = ks[j];
      if (!touchable(k) || (j === tr.owner && tr.imm > 0)) continue;
      const dx = k.x - tr.x;
      const dz = k.z - tr.z;
      // a kart passing well above or below (a ramp jump, a bridge) misses it (B20)
      if (dx * dx + dz * dz > r2 || Math.abs(k.y - tr.y) > 1.2) continue;
      itemHit(ctx, j, tr.kind === TrapKind.Cucumber ? 'leap' : 'spin', tr.owner, tr.kind === TrapKind.Cucumber ? 'cucumber' : 'yarn');
      tr.life = 0;
      break;
    }
  }
  let w = 0;
  for (let r = 0; r < s.traps.length; r++) if (s.traps[r].life > 0) s.traps[w++] = s.traps[r];
  s.traps.length = w;
}
