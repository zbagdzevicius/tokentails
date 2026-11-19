#!/usr/bin/env node
/**
 * Sim v38 (docs/plans/moba/V38.md §1) ally spread: do the human's allied bots lane like the enemy bots, or shadow the
 * human? N headless matches, slot 0 a player-bot of `--profile`, the in-sim bots at `--difficulty`.
 *
 *   node tools/ally-spread.mjs [--map crossing|pool|ridge|thicket|quarry|pitch|hearthwood] [--seeds 200] [--from 1]
 *                              [--difficulty easy] [--profile normal] [--mutator blitz] [--procs 2]
 *
 * Prints, for the allies (slots 1–2; Hearthwood 1–4) and the enemy bots (4–5; 6–9), the share of seconds each stands
 * within 10 m of its team's lead (slot 0, or the mirror seat 3 / 5) and in the same lane as it, 0:30–5:00 and 5:00 to
 * the end; the region split (lane, jungle, base) 0:30–5:00; the lead's team's win rate; stuck bots. Read-only
 * (tools/lib/allies-entry.ts).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const seeds = Number(argValue('--seeds') ?? 200);
const from = Number(argValue('--from') ?? 1);
const map = argValue('--map') ?? 'crossing';
const difficulty = argValue('--difficulty') ?? 'easy';
const profile = argValue('--profile') ?? 'normal';
const mutator = argValue('--mutator') ?? 'none';
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? 2), seeds));

if (hasFlag('--worker')) {
  const fz = await importSim('tools/lib/allies-entry.ts');
  const rows = [];
  for (let i = from; i < from + seeds; i++) rows.push(fz.spreadMatch(i, map, difficulty, profile, mutator === 'none' ? undefined : mutator));
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
        const args = [fileURLToPath(import.meta.url), '--worker', '--seeds', String(n), '--from', String(f), '--map', map, '--difficulty', difficulty, '--profile', profile, '--mutator', mutator];
        const c = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('exit', (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`worker exited ${code}`))));
      }),
    );
  }
  const rows = (await Promise.all(jobs)).flat();
  const n = rows.length;
  const slots = rows[0].s.length;
  const half = slots >> 1;
  const allies = [];
  const enemies = [];
  for (let i = 1; i < half; i++) allies.push(i);
  for (let i = half + 1; i < slots; i++) enemies.push(i);
  const pct = (a, b) => (b ? +((100 * a) / b).toFixed(1) : null);
  const agg = (ids, win) => {
    let t = 0, near = 0, lanes = 0, same = 0, ht = 0, hn = 0;
    for (const r of rows) for (const id of ids) {
      const x = r.s[id][win];
      t += x[0]; near += x[1]; lanes += x[2]; same += x[3]; ht += x[4] ?? 0; hn += x[5] ?? 0;
    }
    return { near: pct(near, t), sameLane: pct(same, lanes), ...(ht ? { nearHuman: pct(hn, ht) } : {}) };
  };
  const per1 = (id, win) => agg([id], win);
  const regOf = (ids) => {
    const tot = new Array(rows[0].reg[0].length).fill(0);
    for (const r of rows) for (const id of ids) r.reg[id].forEach((v, k) => (tot[k] += v));
    const sum = tot.reduce((a, b) => a + b, 0);
    return { base: pct(tot[0], sum), jungle: pct(tot[1], sum), lanes: tot.slice(2).map((v) => pct(v, sum)) };
  };
  const mmss = (t) => `${Math.floor(t / 1800)}:${String(Math.floor((t % 1800) / 30)).padStart(2, '0')}`;
  const ticks = rows.map((r) => r.ticks).sort((a, b) => a - b);
  const out = {
    map, n, difficulty, profile, mutator,
    allies: { early: agg(allies, 0), late: agg(allies, 1), perSlot: Object.fromEntries(allies.map((id) => [id, { early: per1(id, 0), late: per1(id, 1) }])), regions: regOf(allies) },
    enemies: { early: agg(enemies, 0), late: agg(enemies, 1), perSlot: Object.fromEntries(enemies.map((id) => [id, { early: per1(id, 0), late: per1(id, 1) }])), regions: regOf(enemies) },
    team0WinPct: pct(rows.filter((r) => r.winner === 0).length, n),
    median: mmss(ticks[ticks.length >> 1]),
    reasons: rows.reduce((a, r) => ((a[r.reason] = (a[r.reason] ?? 0) + 1), a), {}),
    stuckMatches: rows.filter((r) => r.stuckBots > 0).length,
  };
  console.log(JSON.stringify(out));
}
