#!/usr/bin/env node
/**
 * Sim v28 (docs/plans/moba/V28.md §5) mode sanity: N headless matches of a mode, slot 0 a player-bot.
 *
 *   node tools/modes-sanity.mjs --mutator onelane|duel|boss [--seeds 40] [--from 1] [--difficulty normal] [--profile normal] [--procs N]
 *
 * Prints the length (p50, p90), the end reasons, the human team's wins, takedowns a minute and, for Boss Weekend, the
 * boss's phase and HP at the end. Read-only (tools/lib/modes-entry.ts).
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 40);
const from = Number(argValue('--from') ?? 1);
const mutator = argValue('--mutator') ?? 'onelane';
const difficulty = argValue('--difficulty') ?? 'normal';
const profile = argValue('--profile') ?? 'normal';
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));

if (hasFlag('--worker')) {
  const fz = await importSim('tools/lib/modes-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.modeMatch(Math.imul(i, 0x9e3779b1) >>> 0, mutator, difficulty, profile));
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
        const args = [fileURLToPath(import.meta.url), '--worker', '--seeds', String(n), '--from', String(f), '--mutator', mutator, '--difficulty', difficulty, '--profile', profile];
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
  console.log(`${mutator}: ${n} matches, ${profile} vs ${difficulty}`);
  console.log(`  length p50 ${mmss(pct(rows.map((r) => r.ticks), 50))}  p90 ${mmss(pct(rows.map((r) => r.ticks), 90))}`);
  console.log(`  reasons ${JSON.stringify(reasons)}  human team won ${((100 * won) / n).toFixed(1)}%  takedowns a minute ${tdm.toFixed(2)}`);
  console.log(`  stuck bots (5 s walking on the spot) ${rows.reduce((a, r) => a + r.stuckBots, 0)} in ${rows.filter((r) => r.stuckBots > 0).length} matches`);
  if (mutator === 'boss') {
    const ph = [0, 0, 0];
    for (const r of rows) ph[r.bossPhase]++;
    console.log(`  boss phase at the end ${JSON.stringify(ph)}  boss HP left p50 ${pct(rows.map((r) => r.bossHpBp), 50) / 100}%  hero deaths p50 ${pct(rows.map((r) => r.heroDeaths), 50)}`);
  }
}
