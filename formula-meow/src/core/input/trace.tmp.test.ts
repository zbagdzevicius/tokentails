import { it } from 'vitest';
import { TRACKS } from '../track/tracks';
import { runNovice } from './novice';
import { SMART_STEER } from './smart-steer';
it('trace', { timeout: 900_000 }, () => {
  for (const k of ['ramp', 'headGain', 'sideGain', 'max', 'margin'] as const) if (process.env['FM_' + k]) (SMART_STEER as Record<string, number>)[k] = Number(process.env['FM_' + k]);
  const def = TRACKS.find((t) => t.id === (process.env.FM_TRACK ?? 'cafe'))!;
  const r = runNovice(def, { smartSteer: process.env.FM_OFF ? false : true, dead: 4, curve: 1.15, seed: Number(process.env.FM_SEED ?? 2) });
  process.stderr.write(`RES ${r.wallTicks} ${r.time}\n`);
});
