import { describe, expect, it } from 'vitest';
import { buildFiles } from './vendor-sim.mjs';
import { importSim } from './lib/sim-bundle.mjs';
import { createMatch, fillPicks, replayRecord, result, step } from '../src/sim/index';
import { SIM_VERSION } from '../src/sim/version';

describe('vendor-sim', () => {
  it('bundles src/sim/server.ts into one import-free module whose verifyReplay accepts a live replay', { timeout: 60000 }, async () => {
    const { files, modules } = await buildFiles();
    const bundle = files['pawlegends-sim.bundle.ts'];
    expect(bundle.startsWith('/* eslint-disable */')).toBe(true);
    expect(/^\s*import\s/m.test(bundle)).toBe(false);
    expect(modules.every((m) => m.startsWith('src/sim/') || m.startsWith('src/data/'))).toBe(true);
    expect(JSON.parse(files['pawlegends-sim.sha256.json']).simVersion).toBe(SIM_VERSION);

    const server = await importSim('src/sim/server.ts');
    const seed = 31337;
    const { picks, tricks } = fillPicks(seed, 'cacklejaw', 'pounce');
    const m = createMatch({ seed, picks, tricks, difficulty: 'easy' });
    for (let t = 0; !result(m); t++) step(m, t % 50 === 0 ? [{ op: 2, x: 30000 + (t % 7) * 4000, y: 30000 }] : []);
    const rec = replayRecord(m);
    expect(server.verifyReplay(rec)).toMatchObject({ ok: true, finalHash: rec.finalHash });
    expect(server.verifyReplay({ ...rec, outcome: rec.outcome === 'won' ? 'lost' : 'won' }).ok).toBe(false);
  });
});
