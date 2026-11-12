#!/usr/bin/env node
/**
 * Sim v22 5v5 map probe (docs/plans/moba/MAP-5V5-STANDARD.md §10, §14 G9, G10 and the bot checks of §16 step 8):
 *
 *   node tools/map5v5-probe.mjs [--seeds 200] [--from 50001] [--procs N] [--json]
 *
 * One PvP Hearthwood match per seed with ten `normal` pilots (tools/lib/map5v5-probe-entry.ts). Prints the timings
 * (first blood, Prowl at Grizzlechop, first gank, first Grizzlechop take, first tower, first Great Pudding calm, match
 * length), the flow (calm share, longest calm, gank share of takedowns, pit deaths, base fights), the jungle economy at
 * 5:00 and the bot checks (Prowl at Grizzlechop by 2:30 in ≥ 80% of seeds, a gank before 4:00 in ≥ 60%, no hero stuck
 * over 3 s). Exits 1 when a bot check fails.
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 200);
const from = Number(argValue('--from') ?? 50001);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));
const json = hasFlag('--json');
// `--out file.json`: also write every match row (stuck samples, takedowns, gaps) for a closer look.
const outFile = argValue('--out');

async function worker() {
  const fz = await importSim('tools/lib/map5v5-probe-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.probe5v5(Math.imul(i, 0x9e3779b1) >>> 0));
  process.stdout.write(JSON.stringify(rows));
}

function runJobs() {
  const per = Math.ceil(seeds / procs);
  const jobs = [];
  for (let p = 0; p < procs; p++) {
    const start = from + p * per;
    const n = Math.min(per, from + seeds - start);
    if (n <= 0) continue;
    jobs.push(
      new Promise((res, rej) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', '--seeds', String(n), '--from', String(start)], { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('exit', (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`worker exited ${code}`))));
      }),
    );
  }
  return Promise.all(jobs).then((a) => a.flat());
}

const pct = (a, p) => {
  const s = a.filter((v) => v >= 0).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))] : -1;
};
const mmss = (t) => (t < 0 ? '–' : `${Math.floor(t / 1800)}:${String(Math.floor((t % 1800) / 30)).padStart(2, '0')}`);
const share = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

if (hasFlag('--worker')) await worker();
else {
  const t0 = Date.now();
  const rows = await runJobs();
  if (outFile) (await import('node:fs')).writeFileSync(outFile, JSON.stringify(rows));
  const n = rows.length;
  const both = (f) => rows.flatMap((r) => f(r));
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const timing = (name, vals) => ({ name, p10: mmss(pct(vals, 10)), p50: mmss(pct(vals, 50)), p90: mmss(pct(vals, 90)), none: vals.filter((v) => v < 0).length });
  const timings = [
    timing('first blood', rows.map((r) => r.firstBlood)),
    timing('Prowl at Grizzlechop', both((r) => r.prowlGrizz)),
    timing('first gank start', both((r) => r.gankStart)),
    timing('first Grizzlechop take', rows.map((r) => r.firstGrizz)),
    timing('Kibble Cannon first fired', rows.map((r) => r.cannonFired)),
    timing('first tower', rows.map((r) => r.firstTower)),
    timing('first Great Pudding calm', rows.map((r) => r.firstPudding)),
    timing('match length', rows.map((r) => r.ticks)),
  ];
  const prowlBy230 = share(both((r) => r.prowlGrizz).filter((t) => t >= 0 && t <= 4500).length, 2 * n);
  const gankBy4 = share(both((r) => r.gankStart).filter((t) => t >= 0 && t <= 7200).length, 2 * n);
  const stuckSeeds = rows.filter((r) => r.stuck > 0).length;
  const t0w = rows.filter((r) => r.winner === 0).length;
  const catsW = rows.filter((r) => r.winner === (r.catsLeft ? 0 : 1)).length;
  const behind = rows.filter((r) => r.behindAt7 >= 0);
  const comeback = behind.filter((r) => r.winner === r.behindAt7).length;
  const down10 = rows.filter((r) => r.maxGap >= 10);
  const down10Won = down10.filter((r) => r.winner !== r.maxGapLeader).length;
  const out = {
    seeds: n,
    from,
    secs: Math.round((Date.now() - t0) / 1000),
    timings,
    flow: {
      calmPct: share(sum((r) => r.calmTicks), sum((r) => r.aliveTicks)),
      longestCalmP50s: Math.round(pct(rows.map((r) => r.longestCalm), 50) / 30),
      longestCalmP90s: Math.round(pct(rows.map((r) => r.longestCalm), 90) / 30),
      gankTakedownPct: share(sum((r) => r.gankTakedowns), sum((r) => r.takedowns)),
      pitDeathPct: share(sum((r) => r.pitDeaths), sum((r) => r.takedowns)),
      baseFightPct: share(sum((r) => r.baseFights), sum((r) => r.fights)),
      ganksPerMatch: Math.round((sum((r) => r.ganks[0] + r.ganks[1]) / n) * 10) / 10,
    },
    economy5: {
      prowlXpBpP50: pct(both((r) => r.prowlXpBp), 50),
      prowlFishBpP50: pct(both((r) => r.prowlFishBp), 50),
    },
    sides: { team0Pct: share(t0w, n), catsPct: share(catsW, n), comebackPct: share(comeback, behind.length), behindN: behind.length, down10WonPct: share(down10Won, down10.length), down10N: down10.length },
    bots: { prowlBy230Pct: prowlBy230, gankBy4Pct: gankBy4, stuckSeeds, stuckLongestP90: pct(rows.map((r) => r.stuckLongest), 90) },
  };
  const comebackPct = out.sides.comebackPct;
  // G8 (MAP-5V5-STANDARD.md §14): a team behind at 7:00 wins 20–40%; one down 10+ takedowns wins under 5%
  out.g8 = { comebackOk: comebackPct >= 20 && comebackPct <= 40, down10Ok: out.sides.down10WonPct < 5 };
  const pass = prowlBy230 >= 80 && gankBy4 >= 60 && stuckSeeds === 0;
  if (json) console.log(JSON.stringify({ ...out, pass }));
  else {
    console.log(`map5v5 probe: ${n} seeds from ${from} (${out.secs} s)`);
    for (const t of timings) console.log(`  ${t.name.padEnd(28)} p10 ${t.p10}  p50 ${t.p50}  p90 ${t.p90}  none ${t.none}`);
    console.log('  flow', JSON.stringify(out.flow));
    console.log('  economy at 5:00', JSON.stringify(out.economy5));
    console.log('  sides', JSON.stringify(out.sides));
    console.log('  G8 comeback', JSON.stringify(out.g8));
    console.log('  bots', JSON.stringify(out.bots), pass ? 'PASS' : 'FAIL');
  }
  process.exit(pass ? 0 : 1);
}
