#!/usr/bin/env node
/**
 * Sim v35 deaths and kill-XP probe (docs/plans/moba/V35-DEATHS.md):
 *
 *   node tools/deaths-probe.mjs [--map hearthwood|crossing|ridge|thicket|quarry|pitch|pool] [--seeds 400] [--from 60001]
 *                               [--procs 2] [--json] [--out rows.json] [--tune patches.json]
 *
 * One PvP match a seed with `normal` pilots in every slot (tools/lib/deaths-entry.ts); `pool` plays the five 3v3 maps
 * in turn (seed i on map i mod 5). Prints the respawn wait by the hero's death number and by minute, the level gap
 * between the top killer and the lowest-kill hero at 5:00, 8:00 and 10:00, the share of XP from champion takedowns,
 * the most-dying hero's share of the match spent dead, the comeback row, the end reasons and the length.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const POOL = ['crossing', 'ridge', 'thicket', 'quarry', 'pitch'];
const map = argValue('--map') ?? 'hearthwood';
const seeds = Number(argValue('--seeds') ?? 400);
const from = Number(argValue('--from') ?? 60001);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? 2), seeds));
const tune = argValue('--tune');

function patches() {
  if (!tune) return [];
  return JSON.parse(readFileSync(tune, 'utf8')).map((p, i) => ({ file: p.file, from: p.re ? new RegExp(p.from, p.flags ?? '') : p.from, to: p.to, name: `tune ${i}` }));
}

async function worker() {
  const fz = await importSim('tools/lib/deaths-entry.ts', patches());
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.deathsProbe(Math.imul(i, 0x9e3779b1) >>> 0, map === 'pool' ? POOL[i % POOL.length] : map));
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
  const out = { map, matches: rows.length, byDeath: {}, byMinute: {}, gaps: {}, xp: {}, misery: {}, comeback: {}, ends: {} };
  const waits = rows.flatMap((r) => r.waits);
  for (let d = 1; d <= 6; d++) {
    const a = waits.filter((x) => (d < 6 ? x[2] === d : x[2] >= 6));
    out.byDeath[d < 6 ? d : '6+'] = { n: a.length, mean: r1(mean(a.map((x) => x[1] / 30))), p90: r1(pct(a.map((x) => x[1] / 30), 90)), atMin: r1(mean(a.map((x) => x[0] / 1800))) };
  }
  for (const [name, a, b] of [['0-3', 0, 3], ['3-5', 3, 5], ['5-8', 5, 8], ['8-10', 8, 10], ['10-13', 10, 13], ['13+', 13, 99]]) {
    const w = waits.filter((x) => x[0] >= a * 1800 && x[0] < b * 1800).map((x) => x[1] / 30);
    out.byMinute[name] = { n: w.length, mean: r1(mean(w)), p90: r1(pct(w, 90)), max: r1(Math.max(0, ...w)) };
  }
  for (const t of [3, 5, 8, 10, 99]) {
    const s = rows.filter((r) => r.snaps[t]).map((r) => r.snaps[t]);
    const gap = [];
    const zero = [];
    const big = [];
    for (const heroes of s) {
      let top = 0;
      let low = 0;
      heroes.forEach((h, i) => {
        if (h[0] > heroes[top][0] || (h[0] === heroes[top][0] && h[1] < heroes[top][1])) top = i;
        if (h[0] < heroes[low][0] || (h[0] === heroes[low][0] && h[1] > heroes[low][1])) low = i;
      });
      gap.push(heroes[top][2] - heroes[low][2]);
      if (heroes[low][0] === 0) zero.push([heroes[top][0], heroes[top][2] - heroes[low][2]]);
      if (heroes[top][0] - heroes[low][0] >= 8) big.push(heroes[top][2] - heroes[low][2]);
    }
    const z5 = zero.filter((x) => x[0] >= 5);
    out.gaps[t] = { n: s.length, topVsLow: r1(mean(gap)), zeroKillN: zero.length, topVsZero: r1(mean(zero.map((x) => x[1]))), top5VsZeroN: z5.length, top5VsZero: r1(mean(z5.map((x) => x[1]))), killGap8N: big.length, killGap8: r1(mean(big)), killGap8Share2: share(big.filter((x) => x >= 2).length, big.length), killGap8Share3: share(big.filter((x) => x >= 3).length, big.length) };
  }
  let td = 0;
  let all = 0;
  const topShare = [];
  for (const r of rows) {
    r.xp.forEach((x) => {
      td += x[0];
      all += x[1];
    });
    const fin = r.snaps[10] ?? r.snaps[8] ?? r.snaps[5];
    if (fin) {
      let top = 0;
      fin.forEach((h, i) => (h[0] > fin[top][0] ? (top = i) : 0));
      if (r.xp[top][1] > 0) topShare.push(r.xp[top][0] / r.xp[top][1]);
    }
  }
  out.xp = { takedownShare: share(td, all), topKillerTakedownShare: r1(100 * mean(topShare)) };
  const mis = rows.map((r) => {
    let worst = 0;
    r.deaths.forEach((d, i) => (d > r.deaths[worst] || (d === r.deaths[worst] && r.dead[i] > r.dead[worst]) ? (worst = i) : 0));
    return [r.dead[worst] / r.ticks, r.deaths[worst]];
  });
  out.misery = { deadShare: r1(100 * mean(mis.map((x) => x[0]))), p90: r1(100 * pct(mis.map((x) => x[0]), 90)), deaths: r1(mean(mis.map((x) => x[1]))) };
  const behind = rows.filter((r) => r.behind >= 0);
  out.comeback = { behindWins: share(behind.filter((r) => r.winner === r.behind).length, behind.length), behindN: behind.length };
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  out.ends = { reasons, coreShare: share((reasons.core ?? 0) + (reasons.goal ?? 0), rows.length), p50: mmss(pct(rows.map((r) => r.ticks), 50)), p90: mmss(pct(rows.map((r) => r.ticks), 90)), team0: share(rows.filter((r) => r.winner === 0).length, rows.length), cats: share(rows.filter((r) => (r.winner === 0) === r.catsLeft && r.winner >= 0).length, rows.length) };
  return out;
}

if (hasFlag('--worker')) await worker();
else {
  const t0 = Date.now();
  const rows = await runJobs();
  const outFile = argValue('--out');
  if (outFile) writeFileSync(outFile, JSON.stringify(rows));
  const s = summarise(rows);
  if (hasFlag('--json')) console.log(JSON.stringify(s));
  else {
    console.log(`deaths probe ${map}: ${s.matches} matches in ${Math.round((Date.now() - t0) / 1000)} s`);
    console.log(`  respawn by death #: ${Object.entries(s.byDeath).map(([k, v]) => `${k}: ${v.mean}s (p90 ${v.p90}, ~${v.atMin}min, n ${v.n})`).join('; ')}`);
    console.log(`  respawn by minute: ${Object.entries(s.byMinute).map(([k, v]) => `${k}: ${v.mean}s (p90 ${v.p90}, max ${v.max}, n ${v.n})`).join('; ')}`);
    for (const [t, g] of Object.entries(s.gaps)) console.log(`  ${t === '99' ? 'end' : `${t}:00`} (n ${g.n}) level gap top killer vs lowest +${g.topVsLow}; vs a 0-kill hero +${g.topVsZero} (n ${g.zeroKillN}); 5+ kills vs 0 +${g.top5VsZero} (n ${g.top5VsZeroN}); kill gap 8+ +${g.killGap8} (2+: ${g.killGap8Share2}%, 3+: ${g.killGap8Share3}%, n ${g.killGap8N})`);
    console.log(`  XP from champion takedowns: ${s.xp.takedownShare}% of all XP; top killer ${s.xp.topKillerTakedownShare}%`);
    console.log(`  most-dying hero: ${s.misery.deaths} deaths, dead ${s.misery.deadShare}% of the match (p90 ${s.misery.p90}%)`);
    console.log(`  comeback: behind at the check wins ${s.comeback.behindWins}% of ${s.comeback.behindN}`);
    console.log(`  ends: ${JSON.stringify(s.ends.reasons)} core ${s.ends.coreShare}%, length p50 ${s.ends.p50} p90 ${s.ends.p90}; team 0 ${s.ends.team0}%, cats ${s.ends.cats}%`);
  }
}
