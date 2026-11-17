#!/usr/bin/env node
/**
 * Sim v33 kill rewards and respawn probe (docs/plans/moba/V33-KILLS.md):
 *
 *   node tools/kills-probe.mjs [--map hearthwood|crossing] [--seeds 200] [--from 60001] [--procs 2] [--json]
 *                              [--tune patches.json]
 *
 * One PvP match a seed with `normal` pilots in every slot (tools/lib/kills-entry.ts). Prints the top killer against
 * the lowest-kill hero at 5:00, 10:00 and 15:00 (kills, levels, Toys, Fish), the respawn waits by minute, the
 * comeback rows (behind at the check wins; down 10+ takedowns wins), the end reasons and the length.
 * `--tune` (experiment only): `[{ file, from, to, re? }]` source rewrites in this run's bundle.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const map = argValue('--map') ?? 'hearthwood';
const seeds = Number(argValue('--seeds') ?? 200);
const from = Number(argValue('--from') ?? 60001);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? 2), seeds));
const tune = argValue('--tune');

function patches() {
  if (!tune) return [];
  return JSON.parse(readFileSync(tune, 'utf8')).map((p, i) => ({ file: p.file, from: p.re ? new RegExp(p.from, p.flags ?? '') : p.from, to: p.to, name: `tune ${i}` }));
}

async function worker() {
  const fz = await importSim('tools/lib/kills-entry.ts', patches());
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.killsProbe(Math.imul(i, 0x9e3779b1) >>> 0, map));
  process.stdout.write(JSON.stringify(rows));
}

function runJobs() {
  const per = Math.ceil(seeds / procs);
  const jobs = [];
  for (let p = 0; p < procs; p++) {
    const start = from + p * per;
    const n = Math.min(per, from + seeds - start);
    if (n <= 0) continue;
    const args = [fileURLToPath(import.meta.url), '--worker', '--map', map, '--seeds', String(n), '--from', String(start)];
    if (tune) args.push('--tune', tune);
    jobs.push(
      new Promise((res, rej) => {
        const c = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('exit', (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`worker exited ${code}`))));
      }),
    );
  }
  return Promise.all(jobs).then((a) => a.flat());
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor((s.length * p) / 100))] : 0;
};
const mmss = (t) => `${Math.floor(t / 1800)}:${String(Math.floor((t % 1800) / 30)).padStart(2, '0')}`;
const share = (n, d) => (d ? r1((100 * n) / d) : 0);

export function summarise(rows) {
  const out = { map, matches: rows.length, at: {}, waits: {}, ends: {} };
  for (const t of [5, 10, 15]) {
    const s = rows.flatMap((r) => r.snaps.filter((x) => x.t === t));
    const big = s.filter((x) => x.top[0] - x.low[0] >= 8);
    out.at[t] = {
      n: s.length,
      killGap: r1(mean(s.map((x) => x.top[0] - x.low[0]))),
      levelGap: r1(mean(s.map((x) => x.top[2] - x.low[2]))),
      toyGap: r1(mean(s.map((x) => x.top[3] - x.low[3]))),
      fishGap: Math.round(mean(s.map((x) => x.top[4] - x.low[4]))),
      big8: { n: big.length, killGap: r1(mean(big.map((x) => x.top[0] - x.low[0]))), levelGap: r1(mean(big.map((x) => x.top[2] - x.low[2]))), toyGap: r1(mean(big.map((x) => x.top[3] - x.low[3]))), lvl2plus: share(big.filter((x) => x.top[2] - x.low[2] >= 2).length, big.length) },
    };
  }
  const waits = rows.flatMap((r) => r.waits);
  for (const [name, a, b] of [['0-5', 0, 5], ['5-10', 5, 10], ['10-13', 10, 13], ['13-15', 13, 15], ['15+', 15, 99]]) {
    const w = waits.filter((x) => x[0] >= a * 1800 && x[0] < b * 1800).map((x) => x[1] / 30);
    out.waits[name] = { n: w.length, mean: r1(mean(w)), p90: r1(pct(w, 90)) };
  }
  const behind = rows.filter((r) => r.behind >= 0);
  const down10 = rows.filter((r) => r.maxGap >= 10);
  out.comeback = { behindWins: share(behind.filter((r) => r.winner === r.behind).length, behind.length), behindN: behind.length, down10Wins: share(down10.filter((r) => r.winner !== r.maxGapLeader).length, down10.length), down10N: down10.length };
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  out.ends = { reasons, coreShare: share(reasons.core ?? 0, rows.length), p50: mmss(pct(rows.map((r) => r.ticks), 50)), p90: mmss(pct(rows.map((r) => r.ticks), 90)), team0: share(rows.filter((r) => r.winner === 0).length, rows.length), cats: share(rows.filter((r) => (r.winner === 0) === r.catsLeft && r.winner >= 0).length, rows.length) };
  // per hero win rate
  const per = {};
  const n = rows[0]?.heroes.length / 2;
  for (const r of rows) r.heroes.forEach((h, i) => {
    per[h] ??= [0, 0];
    per[h][1]++;
    if (r.winner === (i < n ? 0 : 1)) per[h][0]++;
  });
  out.heroes = Object.fromEntries(Object.entries(per).map(([h, [w, s]]) => [h, r1((100 * w) / s)]));
  return out;
}

if (hasFlag('--worker')) await worker();
else {
  const t0 = Date.now();
  const rows = await runJobs();
  const outFile = argValue('--out');
  if (outFile) (await import('node:fs')).writeFileSync(outFile, JSON.stringify(rows));
  const s = summarise(rows);
  if (hasFlag('--json')) console.log(JSON.stringify(s));
  else {
    console.log(`kills probe ${map}: ${s.matches} matches in ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const [t, a] of Object.entries(s.at)) console.log(`  ${t}:00 (n ${a.n}) top killer vs lowest: kills +${a.killGap}, levels +${a.levelGap}, Toys +${a.toyGap}, Fish +${a.fishGap}; kill gap 8+ (n ${a.big8.n}): +${a.big8.killGap} kills, +${a.big8.levelGap} levels (2+ in ${a.big8.lvl2plus}%), +${a.big8.toyGap} Toys`);
    console.log(`  respawn waits (s): ${Object.entries(s.waits).map(([k, v]) => `${k} min ${v.mean} (p90 ${v.p90}, n ${v.n})`).join('; ')}`);
    console.log(`  comeback: behind wins ${s.comeback.behindWins}% of ${s.comeback.behindN}; down 10+ wins ${s.comeback.down10Wins}% of ${s.comeback.down10N}`);
    console.log(`  ends: ${JSON.stringify(s.ends.reasons)} core ${s.ends.coreShare}%, length p50 ${s.ends.p50} p90 ${s.ends.p90}; team 0 ${s.ends.team0}%, cats ${s.ends.cats}%`);
  }
}
