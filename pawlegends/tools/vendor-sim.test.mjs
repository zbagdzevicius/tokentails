import { describe, expect, it } from 'vitest';
import { buildFiles } from './vendor-sim.mjs';
import { importSim } from './lib/sim-bundle.mjs';
import { createMatch, fillPicks, replayRecord, result, step } from '../src/sim/index';
import { SIM_VERSION } from '../src/sim/version';

describe('vendor-sim', () => {
  it('bundles src/sim/server.ts into one import-free module whose verifyReplay accepts a live replay', { timeout: 60000 }, async () => {
    const { files, modules, simVersion } = await buildFiles();
    expect(simVersion).toBe(SIM_VERSION);
    const bundle = files[`v${SIM_VERSION}/pawlegends-sim.bundle.ts`];
    expect(bundle.startsWith('/* eslint-disable */')).toBe(true);
    expect(/^\s*import\s/m.test(bundle)).toBe(false);
    expect(modules.every((m) => m.startsWith('src/sim/') || m.startsWith('src/data/'))).toBe(true);
    expect(JSON.parse(files[`v${SIM_VERSION}/pawlegends-sim.sha256.json`]).simVersion).toBe(SIM_VERSION);
    // GAPS B0 dual verifier: v10 to v26 (v19: 5v5 Classic on Hearthwood Divide; v20: Wild Rift basic attacks; v21: the
    // Kibble Cannon; v22: the standard 5v5 layout and Blitz; v23: Op.Kite; v24: instant Boing Beds; v25: deliberate fun
    // toys; v26: stronger towers early) stay frozen beside the live sim v27 (executions, Cannon Chaos, the Practice
    // ground and the weekly twists, docs/plans/moba/V27.md) stays frozen too beside the live sim v28 (One Lane Brawl, the
    // Duel, Boss Weekend, docs/plans/moba/V28.md; v9 retired), and the root index dispatches by simVersion.
    expect(SIM_VERSION).toBe(28);
    expect(JSON.parse(files['v27/pawlegends-sim.sha256.json']).simVersion).toBe(27);
    expect(files['v27/kite-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v26/pawlegends-sim.sha256.json']).simVersion).toBe(26);
    expect(files['v26/kite-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v20/pawlegends-sim.sha256.json']).simVersion).toBe(20);
    expect(JSON.parse(files['v21/pawlegends-sim.sha256.json']).simVersion).toBe(21);
    expect(files['v20/hearthwood-pvp.fixture.json']).toBeDefined();
    expect(files['v21/hearthwood-pvp.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v22/pawlegends-sim.sha256.json']).simVersion).toBe(22);
    expect(files['v22/blitz-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v23/pawlegends-sim.sha256.json']).simVersion).toBe(23);
    expect(files['v23/kite-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v24/pawlegends-sim.sha256.json']).simVersion).toBe(24);
    expect(files['v24/blitz-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v25/pawlegends-sim.sha256.json']).simVersion).toBe(25);
    expect(files['v25/kite-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v10/pawlegends-sim.sha256.json']).simVersion).toBe(10);
    expect(JSON.parse(files['v11/pawlegends-sim.sha256.json']).simVersion).toBe(11);
    expect(JSON.parse(files['v12/pawlegends-sim.sha256.json']).simVersion).toBe(12);
    expect(JSON.parse(files['v13/pawlegends-sim.sha256.json']).simVersion).toBe(13);
    expect(JSON.parse(files['v14/pawlegends-sim.sha256.json']).simVersion).toBe(14);
    expect(JSON.parse(files['v15/pawlegends-sim.sha256.json']).simVersion).toBe(15);
    expect(files['v15/new-dog-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v16/pawlegends-sim.sha256.json']).simVersion).toBe(16);
    expect(files['v16/pvp-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v17/pawlegends-sim.sha256.json']).simVersion).toBe(17);
    expect(files['v17/pvp-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v18/pawlegends-sim.sha256.json']).simVersion).toBe(18);
    expect(files['v18/pvp-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v19/pawlegends-sim.sha256.json']).simVersion).toBe(19);
    expect(files['v19/hearthwood-pvp.fixture.json']).toBeDefined();
    expect(files['v10/forfeit-replay.fixture.json']).toBeDefined();
    expect(files['v11/forfeit-replay.fixture.json']).toBeDefined();
    expect(files['v12/forfeit-replay.fixture.json']).toBeDefined();
    expect(files['v13/forfeit-replay.fixture.json']).toBeDefined();
    expect(files['v14/forfeit-replay.fixture.json']).toBeDefined();
    expect(files['v14/dog-replay.fixture.json']).toBeDefined();
    expect(files[`v${SIM_VERSION}/dog-replay.fixture.json`]).toBeDefined();
    expect(files[`v${SIM_VERSION}/new-dog-replay.fixture.json`]).toBeDefined();
    expect(Object.keys(files).some((k) => k.startsWith('v9/'))).toBe(false);
    expect(files['index.ts']).toContain("import * as v10 from './v10';");
    expect(files['index.ts']).toContain("import * as v11 from './v11';");
    expect(files['index.ts']).toContain("import * as v12 from './v12';");
    expect(files['index.ts']).toContain("import * as v13 from './v13';");
    expect(files['index.ts']).toContain("import * as v14 from './v14';");
    expect(files['index.ts']).toContain("import * as v15 from './v15';");
    expect(files['index.ts']).toContain("import * as v16 from './v16';");
    expect(files['index.ts']).toContain("import * as v17 from './v17';");
    expect(files['index.ts']).toContain("import * as v18 from './v18';");
    expect(files['index.ts']).toContain(`import * as v${SIM_VERSION} from './v${SIM_VERSION}';`);

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
