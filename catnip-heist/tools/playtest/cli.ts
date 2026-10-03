/**
 * CLI for the synthetic-player playtest (bundled and launched by tools/playtest/run.mjs).
 *
 *   --levels heist-01,heist-02   levels (default: all 8)
 *   --personas novice,rusher     personas (default: novice,cautious,rusher,explorer; 'oracle' is a diagnostic)
 *   --runs 200                   seeded runs per level and persona (seeds seed0 .. seed0+runs-1)
 *   --seed0 1                    first seed
 *   --workers 8                  worker threads (default: cores - 1)
 *   --json out.json              write every episode result plus the summaries
 *   --md playtest/BOT-REPORT.md  write the markdown report (default path; --no-md to skip)
 *   --no-validate                skip the route-follow and determinism checks
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LEVEL_IDS, getLevel, getSolution } from '../../src/levels';
import { HUMAN_PERSONAS, PERSONAS, type PersonaId } from './personas';
import { followRoute, routeFromLog, runEpisode, type EpisodeResult } from './runner';
import { summarize, type CellSummary } from './stats';
import { extractNotes, renderReport, type Validation } from './report';
import { renderAscii } from '../../src/sim/debug';

interface Job {
  levelId: string;
  persona: PersonaId;
  seeds: number[];
}

interface Args {
  levels: string[];
  personas: PersonaId[];
  runs: number;
  seed0: number;
  workers: number;
  json: string | null;
  md: string | null;
  validate: boolean;
  trace: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    levels: [...LEVEL_IDS],
    personas: [...HUMAN_PERSONAS],
    runs: 200,
    seed0: 1,
    workers: Math.max(1, availableParallelism() - 1),
    json: null,
    md: 'playtest/BOT-REPORT.md',
    validate: true,
    trace: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    if (k === '--levels') a.levels = v().split(',').map((s) => (/^\d+$/.test(s) ? `heist-${s.padStart(2, '0')}` : s));
    else if (k === '--personas') a.personas = v().split(',') as PersonaId[];
    else if (k === '--runs') a.runs = Number(v());
    else if (k === '--seed0') a.seed0 = Number(v());
    else if (k === '--workers') a.workers = Math.max(1, Number(v()));
    else if (k === '--json') a.json = v();
    else if (k === '--md') a.md = v();
    else if (k === '--no-md') a.md = null;
    else if (k === '--no-validate') a.validate = false;
    else if (k === '--trace') a.trace = v();
    else if (k === '--help' || k === '-h') {
      console.log('usage: npm run playtest:bots -- [--levels ids] [--personas ids] [--runs n] [--seed0 n] [--workers n] [--json file] [--md file | --no-md] [--no-validate]');
      process.exit(0);
    } else throw new Error(`unknown flag ${k}`);
  }
  for (const id of a.levels) if (!LEVEL_IDS.includes(id)) throw new Error(`unknown level ${id}`);
  for (const p of a.personas) if (!PERSONAS[p]) throw new Error(`unknown persona ${p}`);
  if (!Number.isInteger(a.runs) || a.runs < 1) throw new Error('--runs must be a positive integer');
  return a;
}

function runJob(job: Job): EpisodeResult[] {
  const level = getLevel(job.levelId);
  return job.seeds.map((seed) => runEpisode(level, job.persona, seed));
}

/** Route-follow (the solver's route must win with the recorded hash) and per-seed determinism. */
export function validate(levels: string[]): Validation {
  const routes = levels.map((id) => {
    const level = getLevel(id);
    const sol = getSolution(id);
    const route = routeFromLog(level, sol);
    const end = followRoute(level, route, sol.seed, sol.catIds);
    return { levelId: id, steps: route.length, won: end.won, ticks: end.tick, spotted: end.spottedCount, hashMatches: end.hash === sol.finalHash };
  });
  const determinism: Validation['determinism'] = [];
  for (const id of levels.slice(0, 3)) {
    const level = getLevel(id);
    for (const p of HUMAN_PERSONAS) {
      for (const seed of [1, 2]) {
        const a = runEpisode(level, p, seed);
        const b = runEpisode(level, p, seed);
        determinism.push({ levelId: id, persona: p, seed, same: JSON.stringify(a) === JSON.stringify(b) });
      }
    }
  }
  return { routes, determinism };
}

/** `--trace heist-02:novice:7[:every]`: one episode with its decisions and an ASCII map at spots and at the end. */
function trace(spec: string): void {
  const [lv, persona, seedS, everyS] = spec.split(':');
  const level = getLevel(/^\d+$/.test(lv) ? `heist-${lv.padStart(2, '0')}` : lv);
  const every = Number(everyS ?? 30);
  const dumpAt = new Set((process.env.DUMP ?? '').split(',').filter(Boolean).map(Number));
  let lastWhy = '';
  const r = runEpisode(level, persona as PersonaId, Number(seedS ?? 1), {
    onTick: (s, bot, input) => {
      const spotted = s.events.some((e) => e.type === 'SPOTTED');
      if (bot.lastWhy !== lastWhy || s.tick % every === 0 || spotted) {
        const cs = s.cats.map((c) => `${c.pos.x >> 4},${c.pos.y >> 4}`).join(' ');
        console.log(`t=${s.tick} active=${s.activeIndex + 1} cats=${cs} spotted=${s.spottedCount} coins=${s.coinsCollected} key=${s.keyTaken ? 1 : 0} rescued=${s.rescued ? 1 : 0}  ${bot.lastWhy}${every <= 1 ? `  pos=${s.cats[s.activeIndex].pos.x},${s.cats[s.activeIndex].pos.y} in=${input.dx},${input.dy}${input.swap ? 'S' : ''}${input.interact ? 'I' : ''}${input.meow ? 'M' : ''} path=${bot.debugPath()}` : ''}`);
        lastWhy = bot.lastWhy;
      }
      if (dumpAt.has(s.tick)) console.log(`danger at ${s.tick}:\n${bot.debugDanger(s.cats.map((c) => c.pos))}`);
      if (spotted) {
        for (const e of s.events) if (e.type === 'SPOTTED') console.log(`SPOT cat${(e.cat ?? 0) + 1} by ${e.id} at ${e.tile?.x},${e.tile?.y}; guards ${s.guards.map((g) => `${g.id}@${g.pos.x >> 4},${g.pos.y >> 4} f${g.facing.x},${g.facing.y} ${g.mode}`).join(' | ')}`);
        console.log(renderAscii(level, s));
      }
    },
  });
  console.log(JSON.stringify({ ...r, spots: r.spots.length }, null, 1));
}

export async function main(argv: string[], bundleFile: string): Promise<void> {
  const args = parseArgs(argv);
  if (args.trace) return trace(args.trace);
  const t0 = Date.now();
  const jobs: Job[] = [];
  const CHUNK = 25;
  for (const levelId of args.levels)
    for (const persona of args.personas)
      for (let s = 0; s < args.runs; s += CHUNK) {
        const seeds: number[] = [];
        for (let k = s; k < Math.min(args.runs, s + CHUNK); k++) seeds.push(args.seed0 + k);
        jobs.push({ levelId, persona, seeds });
      }
  const total = args.levels.length * args.personas.length * args.runs;
  console.log(`playtest: ${args.levels.length} levels x ${args.personas.length} personas x ${args.runs} runs = ${total} episodes on ${args.workers} workers`);
  const results: EpisodeResult[] = [];
  let done = 0;
  await new Promise<void>((resolve, reject) => {
    let next = 0;
    let live = 0;
    const n = Math.min(args.workers, jobs.length);
    if (n === 0) return resolve();
    for (let w = 0; w < n; w++) {
      const worker = new Worker(bundleFile, { workerData: { playtestWorker: true } });
      live++;
      const feed = () => {
        if (next < jobs.length) worker.postMessage(jobs[next++]);
        else {
          worker.postMessage(null);
        }
      };
      worker.on('message', (msg: EpisodeResult[]) => {
        results.push(...msg);
        done += msg.length;
        if (done % 400 < msg.length || done === total) process.stdout.write(`  ${done}/${total} episodes (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
        feed();
      });
      worker.on('error', reject);
      worker.on('exit', () => {
        if (--live === 0) resolve();
      });
      feed();
    }
  });
  // Stable order regardless of worker scheduling.
  const li = (id: string) => LEVEL_IDS.indexOf(id);
  const pi = (p: string) => args.personas.indexOf(p as PersonaId);
  results.sort((a, b) => li(a.levelId) - li(b.levelId) || pi(a.persona) - pi(b.persona) || a.seed - b.seed);
  const summaries: CellSummary[] = [];
  for (const levelId of args.levels)
    for (const persona of args.personas) {
      const rs = results.filter((r) => r.levelId === levelId && r.persona === persona);
      if (rs.length) summaries.push(summarize(rs));
    }
  const secs = (Date.now() - t0) / 1000;
  console.log(`done in ${secs.toFixed(1)} s\n`);
  console.log('level     persona   win%  med/par  p90/par  spots/run  stars  quits(spots/stuck/time)');
  for (const s of summaries) {
    const r = (x: number | null) => (x === null ? '   -  ' : (x / s.parTicks).toFixed(2).padStart(6));
    console.log(
      `${s.levelId}  ${s.persona.padEnd(8)} ${(s.completion * 100).toFixed(0).padStart(4)}  ${r(s.medianTicks)}   ${r(s.p90Ticks)}   ${s.spotsMean.toFixed(2).padStart(8)}  ${s.starsMean.toFixed(2)}   ${s.outcomes['quit-spots']}/${s.outcomes['quit-stuck']}/${s.outcomes.timeout}`,
    );
  }
  let validation: Validation | null = null;
  if (args.validate) {
    validation = validate(args.levels);
    console.log('\nvalidation:');
    for (const r of validation.routes) console.log(`  route-follow ${r.levelId}: ${r.won && r.hashMatches && r.spotted === 0 ? 'ok' : 'FAIL'} (${r.ticks} ticks, ${r.steps} steps, hash ${r.hashMatches ? 'matches' : 'differs'})`);
    const bad = validation.determinism.filter((d) => !d.same);
    console.log(`  determinism: ${validation.determinism.length - bad.length}/${validation.determinism.length} identical reruns`);
    if (bad.length || validation.routes.some((r) => !r.won || !r.hashMatches)) process.exitCode = 1;
  }
  const meta = { runs: args.runs, seed0: args.seed0, levels: args.levels, personas: args.personas, seconds: Math.round(secs), episodes: results.length };
  if (args.json) {
    mkdirSync(dirname(args.json) || '.', { recursive: true });
    writeFileSync(args.json, JSON.stringify({ meta, summaries, validation, results }) + '\n');
    console.log(`wrote ${args.json}`);
  }
  if (args.md) {
    mkdirSync(dirname(args.md) || '.', { recursive: true });
    let notes: string | null = null;
    try {
      notes = extractNotes(readFileSync(args.md, 'utf8'));
    } catch {
      notes = null;
    }
    writeFileSync(args.md, renderReport({ meta, summaries, validation, argv, notes }));
    console.log(`wrote ${args.md}`);
  }
}

if (!isMainThread && (workerData as { playtestWorker?: boolean } | null)?.playtestWorker) {
  parentPort!.on('message', (job: Job | null) => {
    if (!job) {
      process.exit(0);
    }
    parentPort!.postMessage(runJob(job));
  });
}
