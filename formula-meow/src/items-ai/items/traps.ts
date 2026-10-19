/**
 * Traps (items-ai lane, GDD 4): the Yarn tangle (dropped behind, spins out) and the Cucumber (lobbed ~18 m ahead or
 * dropped; the cat that hits it does the jump-scare leap). Traps live 30 s, at most 12 on the track (the oldest
 * goes first). A Cardboard Box or Zoomies kart clears a trap without being hit. Sim-safe math only.
 */
import { ITEMS, ticks } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { speedOf } from '../../core/sim/kart';
import { clamp } from '../../core/sim/fixed';
import { TrapKind, itemsOf, sampleAt, trackPoint, type Trap } from './state';
import { itemHit, touchable } from './hits';

const T = ITEMS.trap;
const pt = { x: 0, y: 0, z: 0, si: 0 };

function place(ctx: SimContext, owner: number, kind: Trap['kind'], dist: number, d: number, flight: number): Trap {
  const s = itemsOf(ctx.st);
  const k = ctx.st.karts[owner];
  // clamp to the road width where the trap lands, not where it was thrown (B21)
  const lim = ctx.track.halfW[sampleAt(ctx.track, dist)] - 1;
  const tr: Trap = { id: s.nextId++, kind, owner, x: 0, y: 0, z: 0, dist, d: clamp(d, -lim, lim), life: ticks(T.life), flight, flightMax: flight, fx: k.x, fy: k.y + 1, fz: k.z, imm: ticks(T.ownerImmune) };
  trackPoint(ctx.track, tr.dist, tr.d, pt);
  tr.x = pt.x;
  tr.y = pt.y;
  tr.z = pt.z;
  while (s.traps.length >= T.max) s.traps.shift();
  s.traps.push(tr);
  return tr;
}

/** Drop a trap just behind the kart. */
export function dropTrap(ctx: SimContext, owner: number, kind: Trap['kind']): void {
  const k = ctx.st.karts[owner];
  place(ctx, owner, kind, k.dist - T.drop, k.d, 0);
}

/** Lob a cucumber so it lands about 18 m ahead of where the kart will be. */
export function lobCucumber(ctx: SimContext, owner: number): void {
  const k = ctx.st.karts[owner];
  const C = ITEMS.cucumber;
  const tr = place(ctx, owner, TrapKind.Cucumber, k.dist + C.lob + speedOf(k) * C.flight, k.d, ticks(C.flight));
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
