/** Party play N1 (MULTIPLAYER.md §2, §12 N1): the net bundle, SIM_HASH, the golden self-test value and prev/. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFiles, dispatcher, netFiles, STAMP_PATH } from './vendor-sim.mjs';
import { bundleSim, importSim, PKG_ROOT } from './lib/sim-bundle.mjs';
import { simClosure, simSourceHash } from './lib/sim-source-hash.mjs';
import { createHash } from 'node:crypto';

const sha = (t) => createHash('sha256').update(t).digest('hex');

describe('vendor-sim party (N1)', () => {
  it('the net bundle is proto.ts verbatim, sha-pinned, and import-free', () => {
    const net = netFiles();
    const src = readFileSync(join(PKG_ROOT, 'src', 'net', 'proto.ts'), 'utf8');
    expect(net['pawlegends-net.bundle.ts'].endsWith(src)).toBe(true);
    expect(JSON.parse(net['pawlegends-net.sha256.json']).bundle).toBe(sha(net['pawlegends-net.bundle.ts']));
    expect(/^\s*import\s/m.test(src)).toBe(false);
  });

  it('simSourceHash covers every module Vite bundles, equals the stamp, and the golden equals a vendored-bundle run', { timeout: 120_000 }, async () => {
    const { modules } = await bundleSim('src/sim/server.ts');
    const closure = new Set(simClosure());
    for (const m of modules) expect(closure.has(m)).toBe(true);
    const built = await buildFiles();
    expect(built.simHash).toBe(simSourceHash());
    const stamp = JSON.parse(readFileSync(STAMP_PATH, 'utf8'));
    expect(stamp).toEqual({ simVersion: built.simVersion, simHash: built.simHash, golden: built.simGolden });
    const info = JSON.parse(built.files[`v${built.simVersion}/pawlegends-sim.sha256.json`]);
    expect(info.simSourceHash).toBe(built.simHash);
    expect(info.simGolden).toBe(built.simGolden);
    // the game's own sim (not the vendored bundle) gives the same golden
    const golden = await importSim('src/net/golden.ts');
    const live = await importSim('src/sim/server.ts');
    expect((golden.goldenHash(live) >>> 0).toString(16).padStart(8, '0')).toBe(built.simGolden);
  });

  it('the dispatcher lists prev/ only when it exists and exposes partySimFor', () => {
    expect(dispatcher([10, 11], false)).not.toContain("from './prev'");
    const d = dispatcher([10, 11], true);
    expect(d).toContain("import * as prev from './prev';");
    expect(d).toContain('prev as PawlegendsSim');
    expect(d).toContain('export const partySimFor');
    // Sim v15: the frozen v14 (seven dogs, party play) keeps serving v14 party clients during the rollout.
    const v15 = dispatcher([10, 11, 12, 13, 14, 15], false);
    expect(v15).toContain('v13 as PawlegendsSim');
    expect(v15).toContain('v14 as PawlegendsSim');
    expect(v15).toContain('v15 as PawlegendsSim');
    // Sim v16: the frozen v15 (ten dogs) keeps serving v15 party clients.
    const v16 = dispatcher([10, 11, 12, 13, 14, 15, 16], false);
    expect(v16).toContain('v15 as PawlegendsSim');
    expect(v16).toContain('v16 as PawlegendsSim');
    // Sim v17: the frozen v16 (casual PvP) keeps serving v16 party and PvP clients.
    const v17 = dispatcher([10, 11, 12, 13, 14, 15, 16, 17], false);
    expect(v17).toContain('v16 as PawlegendsSim');
    expect(v17).toContain('v17 as PawlegendsSim');
  });
});
