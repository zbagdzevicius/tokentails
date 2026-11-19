import { limit } from '../tests/unit/cpu-budget.ts';
import { describe, expect, it } from 'vitest';
import { buildFiles } from './vendor-sim.mjs';
import { importSim } from './lib/sim-bundle.mjs';
import { createMatch, fillPicks, replayRecord, result, step } from '../src/sim/index';
import { SIM_VERSION } from '../src/sim/version';

describe('vendor-sim', () => {
  // A time limit, not a budget: esbuild bundles every frozen sim and a match is replayed (seconds when idle, past
  // 60 s with the machine at load 75 on 12 cores, Nov 15, 2026), so the limit leaves room for a loaded machine.
  it('bundles src/sim/server.ts into one import-free module whose verifyReplay accepts a live replay', { timeout: limit(180000) }, async () => {
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
    expect(SIM_VERSION).toBe(38);
    // Sim v38 (the human's allies lane like the enemy bots, V38.md) froze v37 with its fixtures
    expect(JSON.parse(files['v37/pawlegends-sim.sha256.json']).simVersion).toBe(37);
    expect(files['v37/maps-replay.fixture.json']).toBeDefined();
    expect(files['v37/blitz-replay.fixture.json']).toBeDefined();
    // Sim v37 (bots commit to a walk goal, the Blitz refit, V37.md) froze v36 with its fixtures
    expect(JSON.parse(files['v36/pawlegends-sim.sha256.json']).simVersion).toBe(36);
    expect(files['v36/maps-replay.fixture.json']).toBeDefined();
    // Sim v36 (the v35 hero balance pass, V36-BALANCE.md) froze v35 with its fixtures
    expect(JSON.parse(files['v35/pawlegends-sim.sha256.json']).simVersion).toBe(35);
    expect(files['v35/maps-replay.fixture.json']).toBeDefined();
    // Sim v35 (deaths punish more, V35-DEATHS.md) froze v34 with its maps fixture and retired v10 to v19
    expect(JSON.parse(files['v34/pawlegends-sim.sha256.json']).simVersion).toBe(34);
    expect(files['v34/maps-replay.fixture.json']).toBeDefined();
    for (let v = 10; v <= 19; v++) expect(Object.keys(files).some((k) => k.startsWith(`v${v}/`)), `v${v} retired`).toBe(false);
    // Sim v34 (the 3v3 map pool, V34-MAPS.md) froze v33 with its late fixture; the live one records the pool maps
    expect(JSON.parse(files['v33/pawlegends-sim.sha256.json']).simVersion).toBe(33);
    // Sim v33 (kills decide more, V33-KILLS.md) froze v32 with its late fixture
    expect(JSON.parse(files['v32/pawlegends-sim.sha256.json']).simVersion).toBe(32);
    expect(files['v33/late-replay.fixture.json']).toBeDefined();
    // Sim v32 (no Sudden Death) froze v31 with its roster31 fixture
    expect(JSON.parse(files['v31/pawlegends-sim.sha256.json']).simVersion).toBe(31);
    expect(files['v31/roster31-replay.fixture.json']).toBeDefined();
    expect(files['v32/late-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v28/pawlegends-sim.sha256.json']).simVersion).toBe(28);
    expect(JSON.parse(files['v27/pawlegends-sim.sha256.json']).simVersion).toBe(27);
    expect(files['v27/kite-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v26/pawlegends-sim.sha256.json']).simVersion).toBe(26);
    expect(files['v26/kite-replay.fixture.json']).toBeDefined();
    // Sim v37 retired v20 to v23 (backend build memory, V37.md §6)
    for (let v = 20; v <= 23; v++) expect(Object.keys(files).some((k) => k.startsWith(`v${v}/`)), `v${v} retired`).toBe(false);
    expect(JSON.parse(files['v24/pawlegends-sim.sha256.json']).simVersion).toBe(24);
    expect(files['v24/blitz-replay.fixture.json']).toBeDefined();
    expect(JSON.parse(files['v25/pawlegends-sim.sha256.json']).simVersion).toBe(25);
    expect(files['v25/kite-replay.fixture.json']).toBeDefined();
    expect(files[`v${SIM_VERSION}/dog-replay.fixture.json`]).toBeDefined();
    expect(files[`v${SIM_VERSION}/new-dog-replay.fixture.json`]).toBeDefined();
    expect(files['index.ts']).toContain("import * as v24 from './v24';");
    expect(Object.keys(files).some((k) => k.startsWith('v9/'))).toBe(false);
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
