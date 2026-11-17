#!/usr/bin/env node
/**
 * Sim v28 (docs/plans/moba/V28.md §5) mode sanity: N headless matches of a mode, slot 0 a player-bot.
 *
 *   node tools/modes-sanity.mjs --mutator onelane|duel|boss [--seeds 40] [--from 1] [--difficulty normal] [--profile normal] [--procs N]
 *
 * Prints the length (p50, p90), the end reasons, the human team's wins, takedowns a minute and, for Boss Weekend, the
 * boss's phase and HP at the end. Read-only (tools/lib/maps-entry.ts).
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 40);
const from = Number(argValue('--from') ?? 1);
const mutator = argValue('--mutator') ?? 'none';
const map = argValue('--map') ?? 'ridge';
const difficulty = argValue('--difficulty') ?? 'normal';
const profile = argValue('--profile') ?? 'normal';
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));

if (hasFlag('--worker')) {
  const fz = await importSim('tools/lib/maps-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.mapMatch(Math.imul(i, 0x9e3779b1) >>> 0, map, difficulty, profile, mutator === 'none' ? undefined : mutator));
  process.stdout.write(JSON.stringify(rows), () => process.exit(0));
} else {
  const per = Math.ceil(seeds / procs);
  const jobs = [];
  for (let p = 0; p < procs; p++) {
    const f = from + p * per;
    const n = Math.min(per, from + seeds - f);
    if (n <= 0) continue;
    jobs.push(
      new Promise((res, rej) => {
        const args = [fileURLToPath(import.meta.url), '--worker', '--seeds', String(n), '--from', String(f), '--mutator', mutator, '--map', map, '--difficulty', difficulty, '--profile', profile];
        const c = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('exit', (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`worker exited ${code}`))));
      }),
    );
  }
  const rows = (await Promise.all(jobs)).flat();
  const n = rows.length;
  const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))];
  const mmss = (t) => `${Math.floor(t / 1800)}:${String(Math.floor((t % 1800) / 30)).padStart(2, '0')}`;
  const reasons = {};
  for (const r of rows) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const won = rows.filter((r) => r.winner === 0).length;
  const tdm = rows.reduce((a, r) => a + r.kills[0] + r.kills[1], 0) / rows.reduce((a, r) => a + r.ticks / 1800, 0);
  const objN = rows.map((r) => r.obj[0] + r.obj[1]);
  const behind = rows.filter((r) => r.lead330 !== 0);
  const comeback = behind.filter((r) => (r.lead330 < 0 && r.winner === 0) || (r.lead330 > 0 && r.winner === 1)).length;
  const out = {
    map, n, profile, difficulty,
    p50: mmss(pct(rows.map((r) => r.ticks), 50)), p95: mmss(pct(rows.map((r) => r.ticks), 95)),
    reasons, team0WinPct: +((100 * won) / n).toFixed(1), takedownsPerMin: +tdm.toFixed(2),
    objPerMatchP50: pct(objN, 50), objAtLeastOnePct: +((100 * rows.filter((r) => r.obj[0] + r.obj[1] > 0).length) / n).toFixed(1),
    firstObjP50: mmss(Math.max(0, pct(rows.filter((r) => r.firstObjAt >= 0).map((r) => r.firstObjAt), 50) ?? 0)),
    puddingCalms: rows.reduce((a, r) => a + r.pudding, 0),
    trailingAt330WinsPct: behind.length ? +((100 * comeback) / behind.length).toFixed(1) : null,
    stuckBots: rows.reduce((a, r) => a + r.stuckBots, 0), stuckMatches: rows.filter((r) => r.stuckBots > 0).length,
    stuckSamples: rows.filter((r) => r.stuckAt.length).slice(0, 5).map((r) => [r.seed, ...r.stuckAt]),
    blockedSamples: rows.reduce((a, r) => a + r.blocked, 0),
    blockedAt: rows.filter((r) => r.blockedAt.length).slice(0, 4).map((r) => [r.seed, ...r.blockedAt]),
    safetyRows: rows.filter((r) => r.reason === 'safetyEnd').slice(0, 4).map((r) => ({ seed: r.seed, kills: r.kills, towers: r.towers, obj: r.obj })),
  };
  console.log(JSON.stringify(out));
}
