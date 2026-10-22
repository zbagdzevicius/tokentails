import { it } from 'vitest';
import { TRACKS } from '../track/tracks';
import { runNovice } from './novice';
import { SMART_STEER } from './smart-steer';
it('probe', { timeout: 900_000 }, () => {
  for (const k of ['ramp','headGain','sideGain','max','margin'] as const) if (process.env['FM_'+k]) (SMART_STEER as Record<string, number>)[k] = Number(process.env['FM_'+k]);
  let A = 0, B = 0;
  const ids = (process.env.FM_TRACKS ?? 'kitchen,cafe,shelter').split(',');
  const seeds = Number(process.env.FM_SEEDS ?? 2);
  for (const id of ids) {
    const def = TRACKS.find((t) => t.id === id)!;
    for (let seed = 1; seed <= seeds; seed++) {
      const a = runNovice(def, { smartSteer: false, dead: 6, curve: 1.4, seed });
      const c = runNovice(def, { smartSteer: false, dead: 4, curve: 1.15, seed });
      const b = runNovice(def, { smartSteer: true, dead: 4, curve: 1.15, seed });
      A += a.wallTicks; B += b.wallTicks;
      process.stderr.write([id, seed, 'v10', a.wallTicks, a.time?.toFixed(1), a.place, '| curve', c.wallTicks, c.time?.toFixed(1), '| v11', b.wallTicks, b.time?.toFixed(1), b.place, 'assist', b.assistTicks, 'ai', b.aiMean.toFixed(1)].join(" ") + "\n");
    }
  }
  process.stderr.write(`TOTAL v10 ${A} v11 ${B} ratio ${(B / A).toFixed(3)}\n`);
});
