/**
 * Fish coins (iteration 2 sim rule, integrator-owned). A kart within 1.3 m picks a coin up; it respawns 10 s later.
 * A kart holds at most 10, each adding 0.5 % top speed (core/sim/kart.ts `tuneFor`); a spin or a leap drops 3
 * (applyHit). Events: `coin` (a = coins held) and `coinLoss` (a = dropped). The tracks lane places the rows
 * (TrackDef.coins → BuiltTrack.coins) and draws them. Sim-safe math only.
 */
import { COINS, ticks } from '../../tuning';
import type { SimContext } from './plugins';

const R2 = COINS.radius * COINS.radius;
const RESPAWN = ticks(COINS.respawn);

export function stepCoins(ctx: SimContext): void {
  const { st, track } = ctx;
  const spots = track.coins;
  if (!spots.length) return;
  for (let c = 0; c < spots.length; c++) {
    if (st.coins[c] > 0) {
      st.coins[c]--;
      continue;
    }
    const p = spots[c];
    for (let i = 0; i < st.karts.length; i++) {
      const k = st.karts[i];
      if (k.respawnTicks > 0 || k.out) continue;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const dy = k.y + 0.6 - p.y;
      if (dx * dx + dz * dz > R2 || dy > 2 || dy < -2) continue;
      st.coins[c] = RESPAWN;
      if (k.coins < COINS.max) k.coins++;
      ctx.emit({ type: 'coin', kart: i, a: k.coins });
      break;
    }
  }
}
