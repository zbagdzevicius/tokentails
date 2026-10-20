import { it } from 'vitest';
import { LAUNDRY } from '../core/track/tracks/laundry';
import { KITCHEN } from '../core/track/tracks/kitchen';
import { ROOFTOPS } from '../core/track/tracks/rooftops';
import { raceConfig, world } from '../test/fixtures';
import { playerBot } from '../items-ai/balance/bots';
import { GO_TICK } from '../core/sim/world';
import type { TrackDef } from '../types';

const tracks: Record<string, TrackDef> = { kitchen: KITCHEN, rooftops: ROOFTOPS, laundry: LAUNDRY };

it('dbg', () => {
  const def = tracks[process.env.T ?? 'laundry'];
  const cls = Number(process.env.CLS ?? 1) as 0 | 1 | 2;
  const seed = Number(process.env.SEED ?? 1);
  const w = world({ ...raceConfig(def, { seed, humans: [5], cls }), modifiers: Number(process.env.MODS ?? 0) });
  const k = w.st.karts[5];
  let last = 0;
  while (!w.done && w.tick < 60 * 240) {
    const o = playerBot(w.ctx, 5, 0.2);
    if (w.tick >= GO_TICK) o.gas = true;
    w.step([o]);
    for (; last < w.st.events.length; last++) {
      const e = w.st.events[last];
      if (e.kart === 5 && /stunt|respawn|net|wall|ramp|lap/.test(e.type)) console.log(`t${w.tick} ${e.type} a${e.a} b${e.b} si${k.si} br${k.branch} d${k.d.toFixed(1)} v${Math.hypot(k.vx, k.vz).toFixed(1)} rail${k.rail} su${k.su.toFixed(1)}`);
    }
  }
});
