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
 *                                      # (GET /pawlegends/sim → { bundleSha256 }), so the game never ships ahead of it
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
 * 7. forfeit-replay.fixture.json (sim v10, GAPS B2): a Normal match forfeited at 4:00.
 * 8. dog-replay.fixture.json (sim v14): one genuine Easy match played as a new dog (Chili), so the spec shows a v14
 *    dog-human replay verifies (a frozen version that has it lists it in `extra`).
 * 9. new-dog-replay.fixture.json (sim v15): one genuine Easy match played as a sim v15 dog (Frankie), so the spec shows
 *    a v15 new-dog replay verifies and the same record labelled v14 is refused.
 * backend/src/vendor/pawlegends-sim/v10/ to v14/: those files, frozen (FROZEN below; sim v15 is live).
 * backend/src/vendor/pawlegends-sim/index.ts: the dispatcher the backend imports (`simFor(simVersion)`, SIM_VERSIONS,
 * and `verifyReplay` / `checkReplayShape` that pick the sim by the record's `simVersion` and refuse any other).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PKG_ROOT, bundleSim, importSim } from './lib/sim-bundle.mjs';
import { simSourceHash } from './lib/sim-source-hash.mjs';

const repo = resolve(PKG_ROOT, '..');
const outDir = join(repo, 'backend', 'src', 'vendor', 'pawlegends-sim');
/** Party play (MULTIPLAYER.md §2): the wire codec, copied verbatim (src/net/proto.ts has no imports). */
const netDir = join(repo, 'backend', 'src', 'vendor', 'pawlegends-net');
/** Party play: what Vite injects as __SIM_GOLDEN__ (and the sim it was computed for). */
export const STAMP_PATH = join(PKG_ROOT, 'src', 'net', 'sim-stamp.json');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const dry = argv.includes('--dry');
const remoteFlag = argv.indexOf('--check-remote');
const remoteArg = remoteFlag >= 0 ? argv[remoteFlag + 1] : undefined;
const remote = remoteFlag >= 0 ? (remoteArg && !remoteArg.startsWith('--') ? remoteArg : process.env.PAWLEGENDS_BACKEND_URL) : undefined;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** The files of one vendored sim version (its own directory). */
export const VERSION_FILES = ['pawlegends-sim.bundle.ts', 'index.ts', 'pawlegends-sim.sha256.json', 'rookie-replay.fixture.json', 'champion-replay.fixture.json'];

/**
 * Older sims the backend still verifies, copied out of git (GAPS B0). `commit` holds the version's files at `from`;
 * `bundle` pins the sha256 of its bundle, so a wrong commit can never be vendored; `extra` names files beyond
 * VERSION_FILES that version also shipped (v10's forfeit fixture). Sim v11 froze v10 and retired v9 (its replays are
 * refused with PAWLEGENDS_SIM_VERSION; stored v9 rows and their digests stay as they are). Sim v12 (Fish and Toys,
 * docs/FUN-PROGRESSION-V12.md) froze v11 at 6cb57e05 and keeps v10, so the backend verifies 10, 11 and 12. Sim v13
 * (party play, docs/plans/moba/MULTIPLAYER.md) froze the released v12 at 5bf2a938, so the backend verified 10 to 13.
 * Sim v14 (the five original dogs, docs/plans/moba/DOGS-V13.md) froze the released v13 (party play, no dogs; its
 * party API stays served for v13 clients through PARTY_SIMS) at eaba6ae7 and keeps v10 to v12 (v10's 30-day replay
 * window runs to about Dec 1; retire it in the first sim change after that), so the backend verifies 10 to 14.
 * Sim v15 (three more dogs, 10 v 10, docs/plans/moba/DOGS-V15.md) froze the released v14 (seven dogs, party play) at
 * bb18ae2a and keeps v10 to v13 (it landed before Dec 1, so v10 stays), so the backend verifies 10 to 15.
 */
export const FROZEN = Object.freeze([
  Object.freeze({
    simVersion: 10,
    commit: '18cbcf3163fbc58f1759c5d49fa30c958f3993b5',
    from: 'backend/src/vendor/pawlegends-sim/v10',
    bundle: 'edd2b47e63dfa4786efda9da80efde9b8c200c4351d9f78584f694527f5c749a',
    extra: Object.freeze(['forfeit-replay.fixture.json']),
  }),
  Object.freeze({
    simVersion: 11,
    commit: '6cb57e053992e1e3d9bf1e003db16839735ca0f2',
    from: 'backend/src/vendor/pawlegends-sim/v11',
    bundle: '426f9a2ab8434204338a6f9f2e610cc9491779176e3243c24439c6873738eb61',
    extra: Object.freeze(['forfeit-replay.fixture.json']),
  }),
  Object.freeze({
    simVersion: 12,
    commit: '5bf2a938bc520f7dc38eb03f068b3edeb6e53fc7',
    from: 'backend/src/vendor/pawlegends-sim/v12',
    bundle: '59426998be81a7439eba33c06b81635840f34a5ec26adc368e38210159e51531',
    extra: Object.freeze(['forfeit-replay.fixture.json']),
  }),
  Object.freeze({
    simVersion: 13,
    commit: 'eaba6ae742b33cde1333e99fdbf7d14e5e8c19e3',
    from: 'backend/src/vendor/pawlegends-sim/v13',
    bundle: '7daed0d274a9a9f414bab5d12f8e3711c5e5d5a4c13776cf95c64cc22e0e9ea1',
    extra: Object.freeze(['forfeit-replay.fixture.json']),
  }),
  Object.freeze({
    simVersion: 14,
    commit: 'bb18ae2aa3eb822d2ac26104717f68eb457f5416',
    from: 'backend/src/vendor/pawlegends-sim/v14',
    bundle: 'dba1ec165fdb7734339016dfccd55b08d370ee65e98fd900cb36c42f98997c59',
    extra: Object.freeze(['forfeit-replay.fixture.json', 'dog-replay.fixture.json']),
  }),
]);

/** One frozen version's files, byte for byte from git. Throws when git is missing or the bundle sha differs. */
export function frozenFiles(entry) {
  const files = {};
  for (const name of [...VERSION_FILES, ...(entry.extra ?? [])]) {
    files[name] = execFileSync('git', ['show', `${entry.commit}:${entry.from}/${name}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  }
  const got = sha256(files['pawlegends-sim.bundle.ts']);
  if (got !== entry.bundle) throw new Error(`vendor-sim: frozen v${entry.simVersion} bundle at ${entry.commit.slice(0, 8)} is ${got}, pinned ${entry.bundle}`);
  return files;
}

/** The dispatcher the backend imports: one sim per accepted version, chosen by the record's `simVersion`. */
export const dispatcher = (versions, hasPrev = false) => {
  const sorted = [...versions].sort((a, b) => a - b);
  const live = sorted[sorted.length - 1];
  const frozen = FROZEN.filter((f) => sorted.includes(f.simVersion));
  const prevNote = hasPrev ? ' and the previous live bundle (prev/, kept one deep)' : '';
  const partyList = [...sorted.map((v) => `v${v} as PawlegendsSim`), ...(hasPrev ? ['prev as PawlegendsSim'] : [])].join(', ');
  return `/* eslint-disable */
// GENERATED by pawlegends/tools/vendor-sim.mjs. Do not edit; run \`npm run vendor-sim\` in pawlegends/.
//
// The Pawlegends sims this backend verifies with (GAPS B0 dual verifier), one directory per accepted SIM_VERSION:
// v${live} is built from pawlegends/src/sim${frozen.length ? `; ${frozen.map((f) => `v${f.simVersion} is frozen at commit ${f.commit.slice(0, 8)}`).join(', ')} (kept for the switch window, GAPS §8 item 2)` : ''}.
// A replay is re-simulated by the sim of its own \`simVersion\`; any other version is refused.
${sorted.map((v) => `import * as v${v} from './v${v}';`).join('\n')}${hasPrev ? "\nimport * as prev from './prev';" : ''}

export type {
    PawlegendsPartySim,
    PawlegendsPartyReplayRecord,
    PawlegendsPartySeat,
    PawlegendsCommand,
    PawlegendsMatchHandle,
    PawlegendsMatchResult,
    PawlegendsPilot,
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
import type { PawlegendsPartySim, PawlegendsVerifyResult } from './v${live}';

/** One vendored sim version. */
export interface PawlegendsSim {
    SIM_VERSION: number;
    BUNDLE_SHA256: string;
    MAX_TICKS: number;
    MAX_INPUT_CHARS: number;
    checkReplayShape: (record: unknown) => PawlegendsVerifyResult | null;
    verifyReplay: (record: unknown) => PawlegendsVerifyResult;
    /** Party play (MULTIPLAYER.md §2.1): set only on bundles with party code. */
    SIM_SOURCE_HASH?: string;
    SIM_GOLDEN?: string;
    party?: PawlegendsPartySim;
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

/**
 * Party play (MULTIPLAYER.md §2.1 skew window): the sim for a party client's \`{simVersion, simHash}\`, from the live
 * bundle, the frozen ones${prevNote} — only bundles with party code. Null = update_required.
 */
export const PARTY_SIMS: readonly PawlegendsSim[] = Object.freeze([${partyList}].filter((s) => !!s.party && !!s.SIM_SOURCE_HASH));
export const partySimFor = (simVersion: unknown, simHash: unknown): PawlegendsSim | null =>
    PARTY_SIMS.find((s) => s.SIM_VERSION === simVersion && s.SIM_SOURCE_HASH === simHash) ?? null;

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

export const facade = (bundleSha256, simVersion, simHash = '', simGolden = '') => `/* eslint-disable */
// GENERATED by pawlegends/tools/vendor-sim.mjs. Do not edit; run \`npm run vendor-sim\` in pawlegends/.
//
// Typed facade over the vendored Pawlegends sim (POC.md §11.5). The types mirror pawlegends/src/sim/api.ts.
import * as bundle from './pawlegends-sim.bundle';

const sim: any = bundle;

export type PawlegendsHeroId =
    | 'clem'
    | 'sage'
    | 'brutus'
    | 'cacklejaw'
    | 'lambo'
    | 'aviete'
    | 'bengas'
    | 'gabe'
    | 'meatball'
    | 'pixel'
    | 'duchess'
    | 'stilts'
    | 'nugget'
    | 'marshmallow'
    | 'bravo'
    | 'chili'
    | 'howler'
    | 'rocket'
    | 'frankie'
    | 'domino';
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
    /** Sim v10 and later: 'none' (every record from v10 carries it). */
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
    /** Sim v10 and later: damage soaked, heal and shield given, damage to camps and Pudding. */
    damageTaken?: number;
    healShield?: number;
    objective?: number;
    /** Sim v12 and later: Fish earned, Toy tiers owned at the end, lane minion last hits, the tick each Toy tier was bought (−1 never). */
    fish?: number;
    toys?: number;
    lastHits?: number;
    toy1At?: number;
    toy2At?: number;
    toy3At?: number;
    toy4At?: number;
}

export type PawlegendsVerifyCode =
    | 'PAWLEGENDS_REPLAY_INVALID'
    | 'PAWLEGENDS_SIM_VERSION'
    | 'PAWLEGENDS_TOO_LONG'
    | 'PAWLEGENDS_OUTCOME_MISMATCH'
    | 'PAWLEGENDS_HASH_MISMATCH'
    | 'PAWLEGENDS_NOT_ENDED';

export type PawlegendsVerifyResult =
    /** Sim v10 and later (GAPS B2): how the match ended; 'forfeit' = the player forfeited. */
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

// ---------------------------------------------------------------------------------------------------------------
// Party play (docs/plans/moba/MULTIPLAYER.md §1, §2.1): the party verifier and the live-match API the relay's referee
// steps rooms with. Matches and bots are opaque handles; commands are the sim's \`Command\` objects.

/** SIM_HASH of the sim source closure this bundle was built from (the game's __SIM_HASH__). */
export const SIM_SOURCE_HASH = '${simHash}';
/** goldenHash (pawlegends/src/net/golden.ts) of this bundle, 8 hex (the game's __SIM_GOLDEN__). */
export const SIM_GOLDEN = '${simGolden}';

export interface PawlegendsPartySeat {
    slot: number;
    hero: PawlegendsHeroId;
    trick: PawlegendsTrickId;
}

export interface PawlegendsPartyReplayRecord {
    v: 2;
    simVersion: number;
    seed: number;
    difficulty: PawlegendsDifficulty;
    humans: PawlegendsPartySeat[];
    picks: PawlegendsHeroId[];
    tricks: PawlegendsTrickId[];
    ticks: number;
    inputs: string[];
    outcome: PawlegendsOutcome;
    finalHash: string;
    mutator?: PawlegendsMutator;
}

export type PawlegendsCommand = { op: number; [k: string]: number };
export type PawlegendsMatchHandle = { readonly __pawlegendsMatch: true };
export type PawlegendsPilot = { readonly __pawlegendsPilot: true };

export interface PawlegendsMatchResult {
    outcome: PawlegendsOutcome;
    winner: 0 | 1;
    reason: 'core' | 'safetyEnd' | 'forfeit';
    ticks: number;
    finalHash: string;
    stats: PawlegendsSlotStats[];
}

export interface PawlegendsPartySim {
    PARTY_SINCE: number;
    HERO_IDS: readonly PawlegendsHeroId[];
    TRICK_IDS: readonly PawlegendsTrickId[];
    DIFFICULTIES: readonly PawlegendsDifficulty[];
    PLAYER_PROFILES: readonly string[];
    checkPartyShape(record: unknown): PawlegendsVerifyResult | null;
    verifyPartyReplay(record: unknown): PawlegendsVerifyResult;
    fillPicksParty(seed: number, humans: readonly PawlegendsPartySeat[]): { picks: PawlegendsHeroId[]; tricks: PawlegendsTrickId[] };
    createMatch(config: { seed: number; picks: readonly string[]; tricks: readonly string[]; difficulty: string; humans?: readonly number[] }): PawlegendsMatchHandle;
    step(m: PawlegendsMatchHandle, commands?: readonly PawlegendsCommand[], others?: readonly (readonly PawlegendsCommand[] | undefined)[]): void;
    hash(m: PawlegendsMatchHandle): number;
    hashTrail(m: PawlegendsMatchHandle): readonly number[];
    result(m: PawlegendsMatchHandle): PawlegendsMatchResult | null;
    tickOf(m: PawlegendsMatchHandle): number;
    createPlayerBotFor(m: PawlegendsMatchHandle, profile: string, slot: number): PawlegendsPilot;
    playerBotCommands(m: PawlegendsMatchHandle, bot: PawlegendsPilot): PawlegendsCommand[];
    partyReplayRecord(m: PawlegendsMatchHandle): PawlegendsPartyReplayRecord | null;
    decodeCommand(bytes: Uint8Array): PawlegendsCommand;
    encodeCommand(cmd: PawlegendsCommand): Uint8Array;
    /** The tick from which a surrender applies on a difficulty (0 = never). */
    forfeitFromOf(difficulty: string): number;
    /** Bit s = hero slot s (0..2) alive. */
    humanAliveMask(m: PawlegendsMatchHandle): number;
    /** 'cat' | 'dog' for a hero id, else null. */
    heroSideOf(hero: string): string | null;
}

/** The party API of this bundle. */
export const party: PawlegendsPartySim = {
    PARTY_SINCE: sim.PARTY_SINCE,
    HERO_IDS: sim.HERO_IDS,
    TRICK_IDS: sim.TRICK_IDS,
    DIFFICULTIES: sim.DIFFICULTIES,
    PLAYER_PROFILES: sim.PLAYER_PROFILES,
    checkPartyShape: sim.checkPartyShape,
    verifyPartyReplay: sim.verifyPartyReplay,
    fillPicksParty: sim.fillPicksParty,
    createMatch: sim.createMatch,
    step: sim.step,
    hash: sim.hash,
    hashTrail: sim.hashTrail,
    result: sim.result,
    tickOf: sim.tickOf,
    createPlayerBotFor: sim.createPlayerBotFor,
    playerBotCommands: sim.playerBotCommands,
    partyReplayRecord: sim.partyReplayRecord,
    decodeCommand: sim.decodeCommand,
    encodeCommand: sim.encodeCommand,
    forfeitFromOf: sim.forfeitFromOf,
    humanAliveMask: sim.humanAliveMask,
    heroSideOf: sim.heroSideOf,
};
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

/** Seed and hero of the recorded dog fixture (sim v14, docs/plans/moba/DOGS-V13.md §5). */
export const DOG_FIXTURE_SEED = 1313;
export const DOG_FIXTURE_HERO = 'chili';

/** Play one Easy match as a sim v14 dog with the naive player-bot and return its replay record. */
export async function dogFixture(seed = DOG_FIXTURE_SEED) {
  const sim = await importSim('src/sim/index.ts');
  const { picks, tricks } = sim.fillPicks(seed, DOG_FIXTURE_HERO, 'pounce');
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'easy' });
  const bot = sim.createPlayerBot(m, 'naive');
  while (!sim.result(m)) sim.step(m, sim.playerBotCommands(m, bot));
  return sim.replayRecord(m);
}

/** Seed and hero of the recorded new-dog fixture (sim v15, docs/plans/moba/DOGS-V15.md §5). */
export const NEW_DOG_FIXTURE_SEED = 1515;
export const NEW_DOG_FIXTURE_HERO = 'frankie';

/** Play one Easy match as a sim v15 dog with the naive player-bot and return its replay record. */
export async function newDogFixture(seed = NEW_DOG_FIXTURE_SEED) {
  const sim = await importSim('src/sim/index.ts');
  const { picks, tricks } = sim.fillPicks(seed, NEW_DOG_FIXTURE_HERO, 'pounce');
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

/** goldenHash (src/net/golden.ts) of a bundle's text, 8 hex: imported from a temp module like importSim does. */
async function goldenOf(bundleText) {
  const { mkdirSync: mk, writeFileSync: wr } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const dir = join(tmpdir(), 'pawlegends-sim');
  mk(dir, { recursive: true });
  const file = join(dir, `golden-${sha256(bundleText).slice(0, 16)}.mjs`);
  wr(file, bundleText.replace(/^\/\/ @ts-nocheck$/m, ''));
  const sim = await import(pathToFileURL(file).href);
  const golden = await importSim('src/net/golden.ts');
  return (golden.goldenHash(sim) >>> 0).toString(16).padStart(8, '0');
}

/**
 * The prev/ files (MULTIPLAYER.md §2.1 skew window): the live bundle production serves, i.e. the one on `origin/main`
 * (else `main`), when it has party code (a simSourceHash) and differs from this build. Dev iterations never rotate it.
 * Without git or either ref, today's prev/ on disk is kept as it is.
 */
function previousLive(simVersion, simHash) {
  const rel = `backend/src/vendor/pawlegends-sim/v${simVersion}`;
  for (const ref of ['origin/main', 'main']) {
    let info;
    try {
      info = JSON.parse(execFileSync('git', ['show', `${ref}:${rel}/pawlegends-sim.sha256.json`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      continue;
    }
    if (!info.simSourceHash || info.simSourceHash === simHash) return {};
    const out = {};
    for (const name of [...VERSION_FILES, 'forfeit-replay.fixture.json']) {
      try {
        out[name] = execFileSync('git', ['show', `${ref}:${rel}/${name}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch {
        /* a file that version did not ship */
      }
    }
    return out;
  }
  const out = {};
  const prevDir = join(outDir, 'prev');
  if (existsSync(prevDir)) for (const f of readdirSync(prevDir)) out[f] = readFileSync(join(prevDir, f), 'utf8');
  return out;
}

/** backend/src/vendor/pawlegends-net/: proto.ts verbatim (it has no imports) and its sha256. */
export function netFiles() {
  const src = readFileSync(join(PKG_ROOT, 'src', 'net', 'proto.ts'), 'utf8');
  if (/^\s*import\s/m.test(src)) throw new Error('vendor-sim: src/net/proto.ts must not import anything');
  const text = NET_HEADER + src;
  return {
    'pawlegends-net.bundle.ts': text,
    'pawlegends-net.sha256.json': JSON.stringify({ bundle: sha256(text) }, null, 2) + '\n',
  };
}

const NET_HEADER = [
  '/* eslint-disable */',
  '// GENERATED by pawlegends/tools/vendor-sim.mjs from pawlegends/src/net/proto.ts. Do not edit:',
  '// change the protocol there and run `npm run vendor-sim` in pawlegends/ (CI runs `vendor-sim:check`).',
  '',
].join('\n');

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
  const simHash = simSourceHash();
  const simGolden = await goldenOf(text);
  const face = facade(bundleSha, simVersion, simHash, simGolden);
  const info =
    JSON.stringify(
      { bundle: bundleSha, facade: sha256(face), simVersion, vite: viteVersion, modules: modules.length, simSourceHash: simHash, simGolden },
      null,
      2,
    ) + '\n';
  const fixture = JSON.stringify(await rookieFixture(), null, 2) + '\n';
  const champion = JSON.stringify(await championFixture(), null, 2) + '\n';
  const forfeit = JSON.stringify(await forfeitFixture(), null, 2) + '\n';
  const dog = JSON.stringify(await dogFixture(), null, 2) + '\n';
  const newDog = JSON.stringify(await newDogFixture(), null, 2) + '\n';
  const live = {
    'pawlegends-sim.bundle.ts': text,
    'index.ts': face,
    'pawlegends-sim.sha256.json': info,
    'rookie-replay.fixture.json': fixture,
    'champion-replay.fixture.json': champion,
    // Sim v10 (GAPS B2): not in VERSION_FILES (the old flat v9 had none); a frozen version lists it in `extra`
    'forfeit-replay.fixture.json': forfeit,
    // Sim v14: a dog human (Chili); a later freeze lists it in `extra`
    'dog-replay.fixture.json': dog,
    // Sim v15: a new-dog human (Frankie); a later freeze lists it in `extra`
    'new-dog-replay.fixture.json': newDog,
  };
  const files = {};
  for (const entry of FROZEN) for (const [name, body] of Object.entries(frozenFiles(entry))) files[`v${entry.simVersion}/${name}`] = body;
  for (const [name, body] of Object.entries(live)) files[`v${simVersion}/${name}`] = body;
  // Party play (MULTIPLAYER.md §2.1 skew window): when the live sim source changes, the bundle that was live before
  // (if it had party code, i.e. a simSourceHash) moves to prev/, one deep; otherwise prev/ stays as it is.
  const prev = previousLive(simVersion, simHash);
  for (const [name, body] of Object.entries(prev)) files[`prev/${name}`] = body;
  files['index.ts'] = dispatcher([...FROZEN.map((f) => f.simVersion), simVersion], Object.keys(prev).length > 0);
  const net = netFiles();
  const stamp = JSON.stringify({ simVersion, simHash, golden: simGolden }, null, 2) + '\n';
  return { files, net, stamp, bundleSha, simVersion, simHash, simGolden, modules, size: text.length };
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
  // --check-remote is read-only: without a URL it fails instead of falling through to write mode
  if (remoteFlag >= 0 && !remote)
    throw new Error('vendor-sim: --check-remote needs a backend URL (npm run vendor-sim:check-remote -- <url>, or PAWLEGENDS_BACKEND_URL)');
  const { files, net, stamp, bundleSha, modules, size } = await buildFiles();
  if (remote) {
    const url = `${remote.replace(/\/+$/, '')}/pawlegends/sim`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`vendor-sim: ${url} answered ${res.status}`);
    const served = await res.json();
    const servedSha = served.bundleSha256 ?? served.bundle;
    if (servedSha !== bundleSha) {
      console.error(`vendor-sim: ${url} serves bundle ${servedSha}, this build is ${bundleSha}`);
      process.exit(1);
    }
    console.log(`vendor-sim: ${url} serves this sim (${bundleSha.slice(0, 12)})`);
    return;
  }
  if (check) {
    const stale = (dir, list) =>
      Object.entries(list)
        .filter(([name, body]) => {
          const p = join(dir, name);
          return !existsSync(p) || readFileSync(p, 'utf8') !== body;
        })
        .map(([n]) => n);
    const drift = stale(outDir, files);
    drift.push(...strays(files));
    drift.push(...stale(netDir, net).map((n) => `pawlegends-net/${n}`));
    if (!existsSync(STAMP_PATH) || readFileSync(STAMP_PATH, 'utf8') !== stamp) drift.push('pawlegends/src/net/sim-stamp.json');
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
  mkdirSync(netDir, { recursive: true });
  for (const [name, body] of Object.entries(net)) writeFileSync(join(netDir, name), body);
  writeFileSync(STAMP_PATH, stamp);
  console.log(`vendor-sim: wrote ${relative(repo, outDir)} (${summary})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
