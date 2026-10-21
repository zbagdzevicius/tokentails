#!/usr/bin/env node
/**
 * Vendors the Pawlegends sim into the backend (POC.md §3.1, §11.5; pattern: bad-cat/tools/vendor-sim.mjs).
 * `POST /user/catbassadors/live` with `type: 'PAWLEGENDS'` re-sims every saved match with exactly this code.
 *
 *   npm run vendor-sim                 # rebuild backend/src/vendor/pawlegends-sim/ (v<SIM_VERSION>/, the frozen dirs, index.ts)
 *   npm run vendor-sim -- --dry        # build and report only, write nothing
 *   npm run vendor-sim:check           # CI: exit 1 when a vendored copy (live or frozen) differs from a fresh build
 *   npm run vendor-sim:check-remote -- <backend url>
 *                                      # deploy gate: exit 1 unless that backend serves this exact bundle
 *                                      # (GET /pawlegends/sim → { bundle }), so the game never ships ahead of it
 *
 * Dual verifier (sim v10, GAPS B0): the backend keeps one directory per SIM_VERSION it accepts and re-sims a replay
 * with the sim of its own `simVersion`, so a cached tab or an app build that still posts v9 keeps saving after the
 * switch (GAPS §8 item 2: v9 and v10 for 30 days). The live sim is built from src/sim; every older one is FROZEN:
 * copied byte for byte out of git at the commit pinned in FROZEN (its bundle sha256 is pinned too), never rebuilt.
 * To retire v9 after the window, delete its FROZEN entry and run `npm run vendor-sim` (the dir is removed).
 *
 * backend/src/vendor/pawlegends-sim/v<SIM_VERSION>/ (the live sim):
 * 1. A Vite library build of src/sim/server.ts (and everything it imports) into one ES module, unminified.
 * 2. pawlegends-sim.bundle.ts behind `/* eslint-disable *\/` and `// @ts-nocheck`.
 * 3. index.ts: the typed facade of that version.
 * 4. pawlegends-sim.sha256.json: sha256 of the bundle and the facade, the sim version and the tool versions.
 * 5. rookie-replay.fixture.json: one genuine Rookie match (the naive player-bot, seed ROOKIE_FIXTURE_SEED) recorded
 *    with this sim, so the backend's /live spec re-sims a real replay (`vendor-sim:check` catches a stale one).
 * 6. champion-replay.fixture.json (sim v9): one genuine Easy match played as a shelter champion (Gabė), so the spec
 *    shows a champion replay verifies (every champion is free: no entitlement check) and its v8 twin is refused.
 * 7. forfeit-replay.fixture.json (sim v10, GAPS B2): a Normal match forfeited at 4:00 (live version only).
 * backend/src/vendor/pawlegends-sim/v9/: the first five files, frozen (FROZEN below).
 * backend/src/vendor/pawlegends-sim/index.ts: the dispatcher the backend imports (`simFor(simVersion)`, SIM_VERSIONS,
 * and `verifyReplay` / `checkReplayShape` that pick the sim by the record's `simVersion` and refuse any other).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PKG_ROOT, bundleSim, importSim } from './lib/sim-bundle.mjs';

const repo = resolve(PKG_ROOT, '..');
const outDir = join(repo, 'backend', 'src', 'vendor', 'pawlegends-sim');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const dry = argv.includes('--dry');
const remoteFlag = argv.indexOf('--check-remote');
const remote = remoteFlag >= 0 ? argv[remoteFlag + 1] || process.env.PAWLEGENDS_BACKEND_URL : undefined;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The files of one vendored sim version (its own directory). */
export const VERSION_FILES = ['pawlegends-sim.bundle.ts', 'index.ts', 'pawlegends-sim.sha256.json', 'rookie-replay.fixture.json', 'champion-replay.fixture.json'];

/**
 * Older sims the backend still verifies, copied out of git (GAPS B0). `commit` holds the version's files at `from`
 * (the flat pre-v10 layout); `bundle` pins the sha256 of its bundle, so a wrong commit can never be vendored.
 */
export const FROZEN = Object.freeze([
  Object.freeze({
    simVersion: 9,
    commit: 'eb4ebf7a09f9280f12b6084b2dae2f62de281745',
    from: 'backend/src/vendor/pawlegends-sim',
    bundle: '8738321d56637df66f36b5003ee603d6d7e091f2e89e1b8508010b60df0c4497',
  }),
]);

/** One frozen version's files, byte for byte from git. Throws when git is missing or the bundle sha differs. */
export function frozenFiles(entry) {
  const files = {};
  for (const name of VERSION_FILES) {
    files[name] = execFileSync('git', ['show', `${entry.commit}:${entry.from}/${name}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  }
  const got = sha256(files['pawlegends-sim.bundle.ts']);
  if (got !== entry.bundle) throw new Error(`vendor-sim: frozen v${entry.simVersion} bundle at ${entry.commit.slice(0, 8)} is ${got}, pinned ${entry.bundle}`);
  return files;
}

/** The dispatcher the backend imports: one sim per accepted version, chosen by the record's `simVersion`. */
export const dispatcher = (versions) => {
  const sorted = [...versions].sort((a, b) => a - b);
  const live = sorted[sorted.length - 1];
  const frozen = FROZEN.filter((f) => sorted.includes(f.simVersion));
  return `/* eslint-disable */
// GENERATED by pawlegends/tools/vendor-sim.mjs. Do not edit; run \`npm run vendor-sim\` in pawlegends/.
//
// The Pawlegends sims this backend verifies with (GAPS B0 dual verifier), one directory per accepted SIM_VERSION:
// v${live} is built from pawlegends/src/sim${frozen.length ? `; ${frozen.map((f) => `v${f.simVersion} is frozen at commit ${f.commit.slice(0, 8)}`).join(', ')} (kept for the switch window, GAPS §8 item 2)` : ''}.
// A replay is re-simulated by the sim of its own \`simVersion\`; any other version is refused.
${sorted.map((v) => `import * as v${v} from './v${v}';`).join('\n')}

export type {
    PawlegendsDifficulty,
    PawlegendsHeroId,
    PawlegendsMutator,
    PawlegendsOutcome,
    PawlegendsReplay,
    PawlegendsReplayRecord,
    PawlegendsSlotStats,
    PawlegendsTrickId,
    PawlegendsVerifyCode,
    PawlegendsVerifyResult,
} from './v${live}';
import type { PawlegendsVerifyResult } from './v${live}';

/** One vendored sim version. */
export interface PawlegendsSim {
    SIM_VERSION: number;
    BUNDLE_SHA256: string;
    MAX_TICKS: number;
    MAX_INPUT_CHARS: number;
    checkReplayShape: (record: unknown) => PawlegendsVerifyResult | null;
    verifyReplay: (record: unknown) => PawlegendsVerifyResult;
}

/** Every accepted sim, by SIM_VERSION. */
export const SIMS: Readonly<Record<number, PawlegendsSim>> = Object.freeze({ ${sorted.map((v) => `${v}: v${v} as PawlegendsSim`).join(', ')} });
/** The SIM_VERSIONs this backend verifies, ascending. */
export const SIM_VERSIONS: readonly number[] = Object.freeze([${sorted.join(', ')}]);
/** The live (newest) sim: what the current game posts and \`GET /pawlegends/sim\` names. */
export const SIM_VERSION: number = v${live}.SIM_VERSION;
/** sha256 of the live bundle (\`npm run vendor-sim:check-remote\`). */
export const BUNDLE_SHA256: string = v${live}.BUNDLE_SHA256;
/** sha256 of every accepted bundle, by SIM_VERSION. */
export const BUNDLE_SHA256_BY_VERSION: Readonly<Record<number, string>> = Object.freeze({ ${sorted.map((v) => `${v}: v${v}.BUNDLE_SHA256`).join(', ')} });
/** The largest bounds of any accepted version (each sim still applies its own). */
export const MAX_TICKS: number = Math.max(${sorted.map((v) => `v${v}.MAX_TICKS`).join(', ')});
export const MAX_INPUT_CHARS: number = Math.max(${sorted.map((v) => `v${v}.MAX_INPUT_CHARS`).join(', ')});
/** False: these are the real sims, not the placeholder that refuses every replay. */
export const PLACEHOLDER = false;

/** The sim of \`simVersion\`, or null when this backend does not verify that version. */
export const simFor = (simVersion: unknown): PawlegendsSim | null =>
    typeof simVersion === 'number' && Object.prototype.hasOwnProperty.call(SIMS, simVersion) ? SIMS[simVersion] : null;

const refuse = (record: unknown): PawlegendsVerifyResult => ({
    ok: false,
    code: 'PAWLEGENDS_SIM_VERSION',
    message: \`simVersion \${String((record as { simVersion?: unknown } | null)?.simVersion)} is not one of \${SIM_VERSIONS.join(', ')}\`,
});

/** Shape and bounds only, with the sim of the record's version: null when well-formed. */
export const checkReplayShape = (record: unknown): PawlegendsVerifyResult | null => {
    const sim = simFor((record as { simVersion?: unknown } | null)?.simVersion);
    return sim ? sim.checkReplayShape(record) : refuse(record);
};
/** Re-simulate a replay with the sim of its own version (up to ~1.5 s: call it from a worker thread). */
export const verifyReplay = (record: unknown): PawlegendsVerifyResult => {
    const sim = simFor((record as { simVersion?: unknown } | null)?.simVersion);
    return sim ? sim.verifyReplay(record) : refuse(record);
};
`;
};
const viteVersion = JSON.parse(readFileSync(join(PKG_ROOT, 'node_modules', 'vite', 'package.json'), 'utf8')).version;

const HEADER = [
  '/* eslint-disable */',
  '// @ts-nocheck',
  '// GENERATED by pawlegends/tools/vendor-sim.mjs from pawlegends/src/sim/server.ts. Do not edit:',
  '// change the Pawlegends sim and run `npm run vendor-sim` in pawlegends/ (CI runs `vendor-sim:check`).',
  '',
].join('\n');

export const facade = (bundleSha256, simVersion) => `/* eslint-disable */
// GENERATED by pawlegends/tools/vendor-sim.mjs. Do not edit; run \`npm run vendor-sim\` in pawlegends/.
//
// Typed facade over the vendored Pawlegends sim (POC.md §11.5). The types mirror pawlegends/src/sim/api.ts.
import * as bundle from './pawlegends-sim.bundle';

const sim: any = bundle;

export type PawlegendsHeroId = 'clem' | 'sage' | 'brutus' | 'cacklejaw' | 'lambo' | 'aviete' | 'bengas' | 'gabe';
export type PawlegendsTrickId = string;
export type PawlegendsDifficulty = 'easy' | 'normal' | 'rookie' | 'hard';
export type PawlegendsOutcome = 'won' | 'lost';
/** Sim v10: only 'none' exists. */
export type PawlegendsMutator = 'none';

export interface PawlegendsReplay {
    v: 1;
    simVersion: number;
    seed: number;
    difficulty: PawlegendsDifficulty;
    hero: PawlegendsHeroId;
    trick: PawlegendsTrickId;
    ticks: number;
    inputs: string;
    outcome: PawlegendsOutcome;
    finalHash: string;
    /** Sim v10: 'none' (v10 records carry it; v9 records have no field). */
    mutator?: PawlegendsMutator;
}

/** The replay record the backend stores and re-sims (same shape as PawlegendsReplay). */
export type PawlegendsReplayRecord = PawlegendsReplay;

export interface PawlegendsSlotStats {
    slot: number;
    hero: PawlegendsHeroId;
    kills: number;
    deaths: number;
    assists: number;
    heroDamage: number;
    towerDamage: number;
    level: number;
    /** Sim v10 (absent from v9 results): damage soaked, heal and shield given, damage to camps and Pudding. */
    damageTaken?: number;
    healShield?: number;
    objective?: number;
}

export type PawlegendsVerifyCode =
    | 'PAWLEGENDS_REPLAY_INVALID'
    | 'PAWLEGENDS_SIM_VERSION'
    | 'PAWLEGENDS_TOO_LONG'
    | 'PAWLEGENDS_OUTCOME_MISMATCH'
    | 'PAWLEGENDS_HASH_MISMATCH'
    | 'PAWLEGENDS_NOT_ENDED';

export type PawlegendsVerifyResult =
    /** Sim v10 (GAPS B2): how the match ended (absent from v9 results); 'forfeit' = the player forfeited. */
    | { ok: true; outcome: PawlegendsOutcome; finalHash: string; ticks: number; stats: PawlegendsSlotStats[]; reason?: 'core' | 'safetyEnd' | 'forfeit' }
    | { ok: false; code: PawlegendsVerifyCode; message: string };

export const SIM_VERSION: number = sim.SIM_VERSION;
export const MAX_TICKS: number = sim.MAX_TICKS;
export const MAX_INPUT_CHARS: number = sim.MAX_INPUT_CHARS;
/** sha256 of pawlegends-sim.bundle.ts: which sim this backend replays with (GET /pawlegends/sim). */
export const BUNDLE_SHA256 = '${bundleSha256}';
/** The SIM_VERSION this bundle was built with (${simVersion}). */
export const BUNDLE_SIM_VERSION = ${simVersion};
/** False: this is the real sim, not the placeholder that refuses every replay. */
export const PLACEHOLDER = false;

/** Shape and bounds only, no simulation: null when well-formed. Cheap; run it before queueing a re-sim. */
export const checkReplayShape: (record: unknown) => PawlegendsVerifyResult | null = sim.checkReplayShape;
/** Re-simulate a replay (up to ~1.5 s for an 11:00 match: call it from a worker thread). */
export const verifyReplay: (record: unknown) => PawlegendsVerifyResult = sim.verifyReplay;
`;

/** Seed of the recorded Rookie fixture (any seed works; this one is a win). */
export const ROOKIE_FIXTURE_SEED = 4242;

/** Play one Rookie match with the naive player-bot and return its replay record (what the client posts to /live). */
export async function rookieFixture(seed = ROOKIE_FIXTURE_SEED) {
  const sim = await importSim('src/sim/index.ts');
  const { picks, tricks } = sim.fillPicks(seed, 'brutus', 'pounce');
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'rookie' });
  const bot = sim.createPlayerBot(m, 'naive');
  while (!sim.result(m)) sim.step(m, sim.playerBotCommands(m, bot));
  return sim.replayRecord(m);
}

/** Seed and hero of the recorded champion fixture (sim v9). */
export const CHAMPION_FIXTURE_SEED = 909;
export const CHAMPION_FIXTURE_HERO = 'gabe';

/** Play one Easy match as a shelter champion with the naive player-bot and return its replay record. */
export async function championFixture(seed = CHAMPION_FIXTURE_SEED) {
  const sim = await importSim('src/sim/index.ts');
  const { picks, tricks } = sim.fillPicks(seed, CHAMPION_FIXTURE_HERO, 'snack');
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'easy' });
  const bot = sim.createPlayerBot(m, 'naive');
  while (!sim.result(m)) sim.step(m, sim.playerBotCommands(m, bot));
  return sim.replayRecord(m);
}

/** Seed and forfeit tick of the recorded forfeit fixture (sim v10, GAPS B2): a Normal match forfeited at 4:00. */
export const FORFEIT_FIXTURE_SEED = 1010;
export const FORFEIT_FIXTURE_TICK = 7200;

/** Play a Normal match with the normal player-bot to 4:00, forfeit (Op.Forfeit = 10) and return its replay record. */
export async function forfeitFixture(seed = FORFEIT_FIXTURE_SEED) {
  const sim = await importSim('src/sim/index.ts');
  const { picks, tricks } = sim.fillPicks(seed, 'sage', 'pounce');
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'normal' });
  const bot = sim.createPlayerBot(m, 'normal');
  while (!sim.result(m) && sim.tickOf(m) < FORFEIT_FIXTURE_TICK) sim.step(m, sim.playerBotCommands(m, bot));
  if (sim.result(m)) throw new Error(`vendor-sim: forfeit fixture seed ${seed} ended before tick ${FORFEIT_FIXTURE_TICK}`);
  sim.step(m, [{ op: 10 }]);
  const r = sim.result(m);
  if (!r || r.reason !== 'forfeit') throw new Error('vendor-sim: the forfeit fixture did not end by forfeit');
  return sim.replayRecord(m);
}

/**
 * Every file under backend/src/vendor/pawlegends-sim/, keyed by its path there: `v<N>/<file>` for the live and the
 * frozen versions, and the root `index.ts` dispatcher.
 */
export async function buildFiles() {
  const { code, modules } = await bundleSim('src/sim/server.ts', 'pawlegends-sim.js');
  const text = HEADER + code;
  const bundleSha = sha256(text);
  const simVersion = Number(/SIM_VERSION = (\d+)/.exec(readFileSync(join(PKG_ROOT, 'src', 'sim', 'version.ts'), 'utf8'))?.[1] ?? 0);
  if (FROZEN.some((f) => f.simVersion >= simVersion)) throw new Error(`vendor-sim: SIM_VERSION ${simVersion} is not newer than every frozen version`);
  const face = facade(bundleSha, simVersion);
  const info =
    JSON.stringify({ bundle: bundleSha, facade: sha256(face), simVersion, vite: viteVersion, modules: modules.length }, null, 2) + '\n';
  const fixture = JSON.stringify(await rookieFixture(), null, 2) + '\n';
  const champion = JSON.stringify(await championFixture(), null, 2) + '\n';
  const forfeit = JSON.stringify(await forfeitFixture(), null, 2) + '\n';
  const live = {
    'pawlegends-sim.bundle.ts': text,
    'index.ts': face,
    'pawlegends-sim.sha256.json': info,
    'rookie-replay.fixture.json': fixture,
    'champion-replay.fixture.json': champion,
    // Sim v10 (GAPS B2): live only (the frozen v9 has no forfeit), so not in VERSION_FILES
    'forfeit-replay.fixture.json': forfeit,
  };
  const files = {};
  for (const entry of FROZEN) for (const [name, body] of Object.entries(frozenFiles(entry))) files[`v${entry.simVersion}/${name}`] = body;
  for (const [name, body] of Object.entries(live)) files[`v${simVersion}/${name}`] = body;
  files['index.ts'] = dispatcher([...FROZEN.map((f) => f.simVersion), simVersion]);
  return { files, bundleSha, simVersion, modules, size: text.length };
}

/** Paths under the vendor dir that `buildFiles` does not produce (the pre-v10 flat files, a retired version). */
function strays(files) {
  if (!existsSync(outDir)) return [];
  const out = [];
  for (const name of readdirSync(outDir, { withFileTypes: true })) {
    const rel = name.name;
    if (name.isDirectory()) {
      if (!Object.keys(files).some((k) => k.startsWith(`${rel}/`))) out.push(rel + '/');
      else for (const f of readdirSync(join(outDir, rel))) if (!(`${rel}/${f}` in files)) out.push(`${rel}/${f}`);
    } else if (!(rel in files)) out.push(rel);
  }
  return out;
}

const versionsOf = (files) =>
  Object.keys(files)
    .filter((k) => k.endsWith('/pawlegends-sim.bundle.ts'))
    .map((k) => `${k.split('/')[0]}${FROZEN.some((f) => `v${f.simVersion}` === k.split('/')[0]) ? ' (frozen)' : ''}`)
    .join(', ');

async function main() {
  const { files, bundleSha, modules, size } = await buildFiles();
  if (remote) {
    const url = `${remote.replace(/\/+$/, '')}/pawlegends/sim`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`vendor-sim: ${url} answered ${res.status}`);
    const served = await res.json();
    if (served.bundle !== bundleSha) {
      console.error(`vendor-sim: ${url} serves bundle ${served.bundle}, this build is ${bundleSha}`);
      process.exit(1);
    }
    console.log(`vendor-sim: ${url} serves this sim (${bundleSha.slice(0, 12)})`);
    return;
  }
  if (check) {
    const drift = Object.entries(files)
      .filter(([name, body]) => {
        const p = join(outDir, name);
        return !existsSync(p) || readFileSync(p, 'utf8') !== body;
      })
      .map(([n]) => n);
    drift.push(...strays(files));
    if (drift.length) {
      console.error(`vendor-sim: backend/src/vendor/pawlegends-sim is stale (${drift.join(', ')}); run npm run vendor-sim`);
      process.exit(1);
    }
    console.log(`vendor-sim: backend copy is current (${versionsOf(files)})`);
    return;
  }
  const summary = `${versionsOf(files)}; live ${modules.length} modules, ${(size / 1024).toFixed(0)} KB, sha ${bundleSha.slice(0, 12)}`;
  if (dry) {
    console.log(`vendor-sim: dry run, would write ${relative(repo, outDir)} (${summary})`);
    return;
  }
  for (const stray of strays(files)) rmSync(join(outDir, stray), { recursive: true, force: true });
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(outDir, name)), { recursive: true });
    writeFileSync(join(outDir, name), body);
  }
  console.log(`vendor-sim: wrote ${relative(repo, outDir)} (${summary})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
