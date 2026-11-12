#!/usr/bin/env node
/**
 * npm run measure: the Pawlegends side of the rival scorecard (docs/plans/moba/BENCHMARKS.md, PARITY.md §3.11 and §7).
 * Measured, not guessed; every number comes from code in this repo:
 *
 *   1. Match length: N headless matches on the bundled sim (tools/lib/batch.mjs), two runs: `normal` vs Normal bots
 *      (the balance gate) and `naive` vs Easy bots (the scripted first-timer of the fun gates).
 *   2. Own-input latency at 0 / 50 / 150 ms RTT (plus a jittery 150 ms link): tests/perf/net-rtt.test.ts, the real
 *      relay Room, codec, NetHost, NetCore and Pacer on fake timers.
 *   3. Quick Play queue time: backend/test/mm-sim.ts (the real Matchmaker, Poisson arrivals, 2 h per rate).
 *   4. Download size: first-load JS/CSS (gzip) and the whole web build (default: the shipped
 *      pawlegends-web/public/pawlegends-game), and the iOS app's bundled web payload (the newest signed OTA zip).
 *   5. `--browser`: cold load to the first live match in Chromium (tests/e2e/measure-load.spec.ts), desktop and an
 *      844×390 touch phone with a 4× slower CPU, unthrottled and on simulated 4G. Builds the game (Playwright's
 *      web server), so it takes a few minutes.
 *
 *   node tools/measure.mjs [--seeds 2000] [--naive-seeds 400] [--browser] [--runs 3] [--dist ../pawlegends-web/public/pawlegends-game]
 *                          [--out ../docs/plans/moba/benchmarks/measured.json] [--skip match,latency,queue,size]
 *
 * Writes the JSON and a Markdown table next to it (`.md`), and prints the table.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { runBatch } from './lib/batch.mjs';
import { baseOf, distPath, firstLoadAssets } from './lib/budget-lib.mjs';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PKG, '..');
const TICK_HZ = 30;
const seeds = Number(argValue('--seeds') ?? 2000);
const naiveSeeds = Number(argValue('--naive-seeds') ?? 400);
const out = path.resolve(PKG, argValue('--out') ?? '../docs/plans/moba/benchmarks/measured.json');
const dist = path.resolve(PKG, argValue('--dist') ?? '../pawlegends-web/public/pawlegends-game');
const skip = new Set((argValue('--skip') ?? '').split(',').filter(Boolean));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-measure-'));

const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
};
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
const log = (m) => process.stderr.write(`measure: ${m}\n`);

function lengths(rows) {
  const sec = rows.map((r) => r.ticks / TICK_HZ);
  const hist = {};
  for (const s of sec) {
    const m = Math.floor(s / 60);
    hist[m] = (hist[m] ?? 0) + 1;
  }
  return {
    matches: rows.length,
    p10s: Math.round(q(sec, 0.1)),
    p50s: Math.round(q(sec, 0.5)),
    p90s: Math.round(q(sec, 0.9)),
    p95s: Math.round(q(sec, 0.95)),
    maxS: Math.round(Math.max(...sec)),
    meanS: Math.round(sec.reduce((a, b) => a + b, 0) / sec.length),
    coreEnds: rows.filter((r) => r.reason === 'core').length,
    histogramByMinute: hist,
  };
}

const result = { measuredAt: new Date().toISOString(), git: gitRev(), node: process.version, host: `${os.platform()} ${os.arch()} ${os.cpus().length} cores` };

function gitRev() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

// 1. match length
if (!skip.has('match')) {
  log(`match length: ${seeds} normal-vs-Normal seeds, ${naiveSeeds} naive-vs-Easy seeds`);
  const balance = await runBatch({ profile: 'normal', difficulty: 'normal', from: 1, seeds });
  const naive = await runBatch({ profile: 'naive', difficulty: 'easy', from: 1, seeds: naiveSeeds });
  result.matchLength = { normalVsNormal: lengths(balance.rows), naiveVsEasy: lengths(naive.rows) };
}

// 2. own-input latency
if (!skip.has('latency')) {
  log('own-input latency: tests/perf/net-rtt.test.ts');
  const file = path.join(tmp, 'rtt.json');
  const r = spawnSync(process.execPath, [path.join(PKG, 'node_modules/vitest/vitest.mjs'), 'run', 'tests/perf/net-rtt.test.ts'], {
    cwd: PKG,
    env: { ...process.env, PAWLEGENDS_MEASURE_OUT: file },
    encoding: 'utf8',
    timeout: 900_000,
  });
  if (!fs.existsSync(file)) throw new Error(`latency harness wrote nothing:\n${(r.stdout ?? '') + (r.stderr ?? '')}`.slice(0, 4000));
  result.latency = { ...JSON.parse(fs.readFileSync(file, 'utf8')), targetsMet: r.status === 0 };
}

// 3. queue time
if (!skip.has('queue')) {
  log('queue time: backend/test/mm-sim.ts');
  const backend = path.join(REPO, 'backend');
  const r = spawnSync(path.join(backend, 'node_modules/.bin/ts-node'), ['--transpile-only', 'test/mm-sim.ts', '--json'], { cwd: backend, encoding: 'utf8', timeout: 900_000 });
  if (r.status !== 0) throw new Error(`mm-sim failed: ${r.stderr}`);
  const j = JSON.parse(r.stdout.trim().split('\n').pop());
  result.queue = {
    model: 'Quick Play co-op, Poisson arrivals of solo or duo units, 30% duos, 2 h per rate; bots fill the empty seats',
    fails: j.fails,
    rates: j.results.map((x) => ({
      joinsPerMin: x.rate,
      p10s: +(x.p10 / 1000).toFixed(1),
      p50s: +(x.p50 / 1000).toFixed(1),
      p90s: +(x.p90 / 1000).toFixed(1),
      p95s: +(x.p95 / 1000).toFixed(1),
      maxS: +(x.max / 1000).toFixed(1),
      matches: x.matches,
      shareWith2PlusHumans: x.matches ? +((x.humans[1] + x.humans[2]) / x.matches).toFixed(2) : 0,
    })),
  };
}

// 4. sizes
if (!skip.has('size')) {
  log(`sizes: ${path.relative(REPO, dist)} and the iOS OTA bundle`);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  const urls = firstLoadAssets(html);
  const base = baseOf(urls);
  const first = urls.map((u) => path.join(dist, distPath(u, base))).filter((f) => fs.existsSync(f));
  const gz = (f) => zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length;
  const all = walk(dist).filter((f) => !/build-releases\.json$/.test(f));
  const web = {
    dir: path.relative(REPO, dist),
    firstLoadFiles: first.length,
    firstLoadGzipKB: Math.round(first.reduce((s, f) => s + gz(f), 0) / 1000) + Math.round(zlib.gzipSync(html).length / 1000),
    wholeDirMB: +(all.reduce((s, f) => s + fs.statSync(f).size, 0) / 1e6).toFixed(2),
  };
  const iosDir = path.join(REPO, 'client/public/pawlegends-app/updates/ios');
  let ios = null;
  if (fs.existsSync(iosDir)) {
    for (const compat of fs.readdirSync(iosDir)) {
      const mf = path.join(iosDir, compat, 'manifest.json');
      if (!fs.existsSync(mf)) continue;
      const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
      const zip = path.join(iosDir, compat, 'bundles', `${m.version}.zip`);
      if (fs.existsSync(zip)) ios = { compat: Number(compat), version: m.version, simVersion: m.simVersion, webPayloadZipMB: +(fs.statSync(zip).size / 1e6).toFixed(2) };
    }
  }
  result.size = { web, ios, iosNote: 'The App Store download adds the Capacitor shell (Swift runtime, WebView glue, plugins); no archived .ipa in the repo to measure it.' };
}

// 5. browser cold load
if (hasFlag('--browser')) {
  log('cold load in Chromium (builds the game first)');
  const file = path.join(tmp, 'load.jsonl');
  const r = spawnSync(path.join(PKG, 'node_modules/.bin/playwright'), ['test', 'tests/e2e/measure-load.spec.ts', '--project', 'desktop', '--project', 'landscape'], {
    cwd: PKG,
    env: { PAWLEGENDS_E2E_PORT: '4496', ...process.env, PAWLEGENDS_MEASURE: '1', PAWLEGENDS_MEASURE_LOAD_OUT: file, PAWLEGENDS_MEASURE_RUNS: argValue('--runs') ?? '3' },
    encoding: 'utf8',
    timeout: 1_800_000,
  });
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  if (!rows.length) log(`browser run produced no rows (exit ${r.status}):\n${(r.stdout ?? '').slice(-2000)}`);
  const groups = {};
  for (const x of rows) (groups[`${x.project}/${x.net}`] ??= []).push(x);
  result.coldLoad = Object.entries(groups).map(([k, xs]) => ({
    setup: k,
    cpuSlowdown: xs[0].cpu,
    runs: xs.length,
    titleMsP50: q(xs.map((x) => x.titleMs), 0.5),
    firstMatchMsP50: q(xs.map((x) => x.matchMs), 0.5),
    firstMatchMsMax: Math.max(...xs.map((x) => x.matchMs)),
    transferredKB: q(xs.map((x) => x.kb), 0.5),
  }));
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
const md = table(result);
fs.writeFileSync(out.replace(/\.json$/, '.md'), md);
console.log(md);

function table(r) {
  const lines = [`# Pawlegends measured (${r.measuredAt.slice(0, 10)}, ${r.git})`, '', `Generated by \`pawlegends/tools/measure.mjs\` on ${r.host}, Node ${r.node}. Do not edit by hand.`, ''];
  lines.push('| Metric | Measured | How |', '|---|---|---|');
  if (r.matchLength) {
    const a = r.matchLength.normalVsNormal;
    const b = r.matchLength.naiveVsEasy;
    lines.push(`| Match length, Normal vs Normal bots | p50 ${clock(a.p50s)}, p10–p90 ${clock(a.p10s)}–${clock(a.p90s)}, p95 ${clock(a.p95s)}, max ${clock(a.maxS)} (${a.matches} matches) | headless sim, balance gate |`);
    lines.push(`| Match length, first-timer vs Easy bots | p50 ${clock(b.p50s)}, p10–p90 ${clock(b.p10s)}–${clock(b.p90s)}, p95 ${clock(b.p95s)} (${b.matches} matches) | headless sim, \`naive\` profile |`);
  }
  if (r.latency)
    for (const x of r.latency.results)
      lines.push(
        `| Own input at ${x.rttMs} ms RTT${x.jitterMs >= 20 ? ` + heavy jitter (${x.jitterMs} ms mean)` : ''} | drawn moving p50/p95 ${x.visible.p50}/${x.visible.p95} ms; applied by the sim p50/p95 ${x.auth.p50}/${x.auth.p95} ms (target p95 ≤ ${x.authP95Target}) | real Room + NetHost + NetCore, fake clock, ${x.taps} taps |`,
      );
  if (r.latency) {
    const x = r.latency.results[0];
    lines.push(`| Match data (net payload) | ${((x.bytesDownPerMin + x.bytesUpPerMin) / 1024).toFixed(1)} KB/min, ≈ ${(((x.bytesDownPerMin + x.bytesUpPerMin) * 7) / 1024).toFixed(0)} KB per 7-min match (1 human; headers excluded) | same harness |`);
  }
  if (r.queue) {
    const pick = (n) => r.queue.rates.find((x) => x.joinsPerMin === n);
    for (const n of [0.25, 2, 20, 60]) {
      const x = pick(n);
      if (x) lines.push(`| Quick Play queue at ${n} joins/min | p50 ${x.p50s} s, p95 ${x.p95s} s, max ${x.maxS} s; ${Math.round(x.shareWith2PlusHumans * 100)}% of matches with ≥ 2 humans | mm-sim, real Matchmaker |`);
    }
  }
  if (r.size) {
    lines.push(`| First load (web) | ${r.size.web.firstLoadGzipKB} KB gzip, ${r.size.web.firstLoadFiles} files | \`${r.size.web.dir}\` index.html |`);
    lines.push(`| Whole web build on disk | ${r.size.web.wholeDirMB} MB (incl. kept older releases) | same |`);
    if (r.size.ios) lines.push(`| iOS app web payload | ${r.size.ios.webPayloadZipMB} MB zip (OTA ${r.size.ios.version}, sim v${r.size.ios.simVersion}) | signed OTA bundle; native shell not included |`);
  }
  if (r.coldLoad) for (const c of r.coldLoad) lines.push(`| Cold load to first live match, ${c.setup}${c.cpuSlowdown > 1 ? `, CPU ${c.cpuSlowdown}× slower` : ''} | p50 ${(c.firstMatchMsP50 / 1000).toFixed(1)} s (max ${(c.firstMatchMsMax / 1000).toFixed(1)} s), title at ${(c.titleMsP50 / 1000).toFixed(1)} s, ${c.transferredKB} KB | Chromium, cache off, ${c.runs} runs |`);
  return `${lines.join('\n')}\n`;
}
