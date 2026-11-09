#!/usr/bin/env node
/**
 * Sim v19 Hearthwood side-bias diagnostics (docs/plans/moba/MAP-5V5.md §12.9). Modes:
 *
 *   node tools/hearth-mirror.mjs probe   [--seeds 20]   first tick a mirror match stops mirroring, and what differs
 *   node tools/hearth-mirror.mjs mirror  [--seeds 200]  whole mirror matches: team 0 win rate, Grizzlechop takes, lane fronts
 *   node tools/hearth-mirror.mjs bias    [--t1 2400]    per-tick means of team 0 − team 1 over seeds (* = beyond 3 SE)
 *   node tools/hearth-mirror.mjs splits  [--t1 2400]    per role: first HP split of a slot pair, its events, who was worse
 *   node tools/hearth-mirror.mjs duel    [--max 1800]   mirrored pit duels at Grizzlechop's first spawn
 *   node tools/hearth-mirror.mjs grizz   [--seeds 300]  symmetry pairs with per-side Grizzlechop stats
 *   node tools/hearth-mirror.mjs trace --from N --t0 A --t1 B [--ids 0,5 | --pair k | --fronts]
 *
 * Common: --from, --procs, --json. A mirror match fields the same five heroes in the same slots on both teams and each
 * pilot pair (slot k, k + 5) shares one RNG stream, so team 1 should stay the river mirror (x, y) → (W − y, W − x) of
 * team 0. Experiment-only bundle patches: --same-phase (slot k + 5 thinks on slot k's tick), --fixed-order /
 * --rev-order (`heroAt` always team 0 / team 1 first), --no-waves, --boss-nearest (the boss ignores his last hitter),
 * --idle (mirror: heroes never move).
 */
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { argValue, hasFlag, positionals } from './lib/args.mjs';
import { importSim } from './lib/sim-bundle.mjs';

const mode = positionals(['--seeds', '--from', '--procs', '--kind', '--max', '--t0', '--t1', '--ids', '--pair'])[0] ?? 'probe';
if (!['probe', 'duel', 'grizz', 'mirror', 'trace', 'bias', 'splits'].includes(mode)) throw new Error(`hearth-mirror: unknown mode ${mode} (probe, duel, grizz)`);
const seeds = Number(argValue('--seeds') ?? (mode === 'probe' ? 20 : 300));
const from = Number(argValue('--from') ?? 1);
const procs = Math.max(1, Math.min(Number(argValue('--procs') ?? Math.max(1, cpus().length - 2)), seeds));

function patches() {
  const p = [];
  if (hasFlag('--same-phase')) p.push({ file: 'src/sim/bots/index.ts', from: 'slot - SLOTS_PER_TEAM + (TIMELINE.botThinkEvery >> 1)', to: 'slot - SLOTS_PER_TEAM', name: 'same-phase' });
  if (hasFlag('--fixed-order')) p.push({ file: 'src/sim/world.ts', from: "if (w.mg.length === 0 || (w.globals[G.Tick] & 1) === 0) return k;", to: 'return k;', name: 'fixed-order' });
  // Ablation (experiment bundles only): the boss ignores who hit him last.
  if (hasFlag('--boss-nearest')) p.push({ file: 'src/sim/units/camp.ts', from: 'if (by >= 0 && by < RANGE.minions && targetable(w, by, TEAM_NEUTRAL) && inAttackRange(w, id, by)) t = by;', to: 'if (by < -1) t = by;', name: 'boss-nearest' });
  if (hasFlag('--rev-order')) p.push({ file: 'src/sim/world.ts', from: "if (w.mg.length === 0 || (w.globals[G.Tick] & 1) === 0) return k;", to: 'if (w.mg.length === 0) return k;', name: 'rev-order' });
  if (hasFlag('--no-waves')) p.push({ file: 'src/sim/index.ts', from: 'const wave = waveAt(tick, w.globals[G.SiegeWaves]);', to: 'const wave = -1;', name: 'no-waves' });
  return p;
}

async function worker() {
  const fz = await importSim('tools/lib/mirror-entry.ts', patches());
  if (mode === 'trace') {
    const seed = Math.imul(from, 0x9e3779b1) >>> 0;
    if (argValue('--pair') !== undefined) {
      process.stdout.write(JSON.stringify(fz.pairTrace(seed, Number(argValue('--pair')), Number(argValue('--t1')))));
      return;
    }
    if (hasFlag('--fronts')) {
      process.stdout.write(JSON.stringify(fz.frontTrace(seed, Number(argValue('--t1')))));
      return;
    }
    process.stdout.write(JSON.stringify(fz.mirrorTrace(seed, Number(argValue('--t0')), Number(argValue('--t1')), (argValue('--ids') ?? '0,5').split(',').map(Number))));
    return;
  }
  const rows = [];
  for (let i = from; i < from + seeds; i++) {
    const seed = Math.imul(i, 0x9e3779b1) >>> 0;
    if (mode === 'duel') {
      const { heroes, tricks } = fz.mirrorLineup(seed);
      rows.push(fz.pitDuel(seed, heroes, tricks, Number(argValue('--max') ?? 30 * 60)));
    } else if (mode === 'splits') {
      rows.push(...fz.hpSplits(seed, Number(argValue('--t1') ?? 2400)));
    } else if (mode === 'bias') {
      rows.push(fz.biasTrace(seed, Number(argValue('--t1') ?? 2400)));
    } else if (mode === 'mirror') {
      const { heroes, tricks } = fz.mirrorLineup(seed);
      rows.push(fz.mirrorProbe(seed, heroes, tricks, hasFlag('--idle') ? 5401 : 30 * 60 * 20, hasFlag('--idle') ? false : false, hasFlag('--idle')));
    } else if (mode === 'probe') {
      const { heroes, tricks } = fz.mirrorLineup(seed);
      rows.push(fz.mirrorProbe(seed, heroes, tricks, Number(argValue('--max') ?? 30 * 60 * 16)));
    } else {
      rows.push(fz.grizzRun(seed, true));
      rows.push(fz.grizzRun(seed, false));
    }
  }
  process.stdout.write(JSON.stringify(rows));
}

function runJobs() {
  const n = Math.max(1, Math.min(procs, seeds));
  const per = Math.ceil(seeds / n);
  const jobs = [];
  const pass = process.argv.slice(2).filter((a, i, all) => !['--seeds', '--from', '--procs'].includes(a) && !['--seeds', '--from', '--procs'].includes(all[i - 1]));
  for (let k = 0; k < n; k++) {
    const f = from + k * per;
    const c = Math.min(per, from + seeds - f);
    if (c <= 0) break;
    jobs.push(
      new Promise((resolve, reject) => {
        let out = '';
        let err = '';
        const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), ...pass, '--seeds', String(c), '--from', String(f), '--procs', '1', '--worker']);
        ch.stdout.on('data', (d) => (out += d));
        ch.stderr.on('data', (d) => (err += d));
        ch.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            reject(new Error(`hearth-mirror ${f}..${f + c - 1} failed: ${err.slice(0, 800)}`));
          }
        });
      }),
    );
  }
  return Promise.all(jobs).then((r) => r.flat());
}

const mmss = (t) => `${Math.floor(t / 1800)}:${String(Math.floor((t % 1800) / 30)).padStart(2, '0')}`;
const pct = (a, n) => (n ? ((100 * a) / n).toFixed(1) : '-');

function reportProbe(rows) {
  for (const r of rows) {
    const d = r.first;
    if (!d) console.log(`seed ${r.seed} [${r.heroes.join(',')}]: no divergence in ${r.ticks} ticks (winner ${r.winner})`);
    else console.log(`seed ${r.seed} [${r.heroes.join(',')}]: tick ${d.tick} (${mmss(d.tick)}) ${d.field} of ${d.a}/${d.b}: ${d.va} vs ${d.vb} (mirror wants ${d.want}); cmds ${d.cmds.join(' ') || '-'}`);
  }
  const ticks = rows.map((r) => (r.first ? r.first.tick : r.ticks)).sort((a, b) => a - b);
  console.log(`median first divergence ${mmss(ticks[ticks.length >> 1])}; by field: ${JSON.stringify(rows.reduce((o, r) => ((o[r.first?.field ?? 'none'] = (o[r.first?.field ?? 'none'] ?? 0) + 1), o), {}))}`);
}

function reportDuel(rows) {
  const t = [0, 0];
  let none = 0;
  const d = [0, 0];
  let notPlaced = 0;
  const fields = {};
  for (const r of rows) {
    if (r.taker >= 0) t[r.taker]++;
    else none++;
    d[0] += r.deaths[0];
    d[1] += r.deaths[1];
    if (!r.placed) notPlaced++;
    const f = r.first ? r.first.field : 'none';
    fields[f] = (fields[f] ?? 0) + 1;
    if (hasFlag('--verbose')) console.log(`seed ${r.seed} [${r.heroes.join(',')}]: taker ${r.taker} @${r.takeTick >= 0 ? mmss(r.takeTick) : '-'}, deaths ${r.deaths.join('/')}; first ${r.first ? `${mmss(r.first.tick)} ${r.first.field} ${r.first.a}/${r.first.b} ${r.first.va} vs ${r.first.vb} (want ${r.first.want}) ${r.first.cmds.join(' ')}` : '-'}`);
  }
  console.log(`hearth-mirror duel: ${rows.length} mirrored pit duels; Grizzlechop to team 0 ${pct(t[0], rows.length)}%, team 1 ${pct(t[1], rows.length)}%, nobody ${pct(none, rows.length)}%; team 0 share of takes ${pct(t[0], t[0] + t[1])}%`);
  console.log(`  deaths per duel t0 ${(d[0] / rows.length).toFixed(2)}, t1 ${(d[1] / rows.length).toFixed(2)}; not mirrored when placed ${notPlaced}; first divergence fields ${JSON.stringify(fields)}`);
}

function reportGrizz(rows) {
  const n = rows.length;
  const bd = [0, 0];
  const tb = [0, 0];
  const bites = [0, 0, 0, 0];
  for (const r of rows) {
    for (let k = 0; k < 2; k++) {
      bd[k] += r.bossDmg?.[k] ?? 0;
      tb[k] += r.dmgToBoss?.[k] ?? 0;
    }
    for (let k = 0; k < 4; k++) bites[k] += r.bites?.[k] ?? 0;
  }
  const s = { left: 0, first: [0, 0], none: 0, firstWin: [0, 0], firstN: [0, 0], noneWin: 0, takes: [0, 0], k9: [0, 0], pit: [0, 0], fish9: [0, 0], ft: [[], []], ftick: [[], []] };
  for (const r of rows) {
    if (r.winner === 0) s.left++;
    for (const [t] of r.takes) s.takes[t]++;
    if (r.takes.length) {
      const t = r.takes[0][0];
      s.first[t]++;
      s.firstN[t]++;
      if (r.winner === 0) s.firstWin[t]++;
      s.ftick[t].push(r.takes[0][1]);
    } else {
      s.none++;
      if (r.winner === 0) s.noneWin++;
    }
    for (let k = 0; k < 2; k++) {
      s.k9[k] += r.kills9[k];
      s.pit[k] += r.pitDeaths[k];
      s.fish9[k] += r.fish9[k];
      if (r.firstTower[k] >= 0) s.ft[k].push(r.firstTower[k]);
    }
  }
  const med = (a) => (a.length ? mmss(a.sort((x, y) => x - y)[a.length >> 1]) : '-');
  console.log(`hearth-mirror grizz: ${n} matches; team 0 wins ${pct(s.left, n)}%`);
  console.log(`  first Grizzlechop: team 0 ${pct(s.first[0], n)}%, team 1 ${pct(s.first[1], n)}%, never ${pct(s.none, n)}%; median first take t0 ${med(s.ftick[0])}, t1 ${med(s.ftick[1])}`);
  console.log(`  team 0 win rate when team 0 took first ${pct(s.firstWin[0], s.firstN[0])}%, when team 1 took first ${pct(s.firstWin[1], s.firstN[1])}%, none ${pct(s.noneWin, s.none)}%`);
  console.log(`  takes per match t0 ${(s.takes[0] / n).toFixed(2)}, t1 ${(s.takes[1] / n).toFixed(2)}; kills before 9:00 t0 ${(s.k9[0] / n).toFixed(2)}, t1 ${(s.k9[1] / n).toFixed(2)}`);
  console.log(`  Grizzlechop damage to t0 ${(bd[0] / rows.length).toFixed(0)}, t1 ${(bd[1] / rows.length).toFixed(0)}; damage to him by t0 ${(tb[0] / rows.length).toFixed(0)}, t1 ${(tb[1] / rows.length).toFixed(0)}; bites t0 even/odd ${bites[0]}/${bites[1]}, t1 even/odd ${bites[2]}/${bites[3]}`);
  console.log(`  deaths in the pit t0 ${(s.pit[0] / n).toFixed(2)}, t1 ${(s.pit[1] / n).toFixed(2)}; Fish at 9:00 t0 ${(s.fish9[0] / n).toFixed(0)}, t1 ${(s.fish9[1] / n).toFixed(0)}; first tower t0 ${med(s.ft[0])}, t1 ${med(s.ft[1])}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (hasFlag('--worker')) await worker();
  else {
    const t0 = Date.now();
    const rows = await runJobs();
    if (mode === 'trace') console.log(rows.join('\n'));
    else if (hasFlag('--json')) console.log(JSON.stringify(rows));
    else if (mode === 'probe') reportProbe(rows);
    else if (mode === 'duel') reportDuel(rows);
    else if (mode === 'splits') {
      const roles = ['solo', 'mid', 'fish', 'prowl', 'guard'];
      for (let ro = 0; ro < 5; ro++) {
        const rs = rows.filter((r) => r.role === ro && r.tick >= 0);
        const w0 = rs.filter((r) => r.worse === -1).length;
        const w1 = rs.filter((r) => r.worse === 1).length;
        const ticks = rs.map((r) => r.tick).sort((a, b) => a - b);
        console.log(`${roles[ro]}: ${rs.length} splits, median ${ticks.length ? mmss(ticks[ticks.length >> 1]) : '-'}; 3 s later team 0 worse ${w0}, team 1 worse ${w1}`);
        const kinds = {};
        for (const r of rs) {
          const key = r.hits.split(' ').map((h) => h.replace(/:\d+$/, '')).sort().join(' ') + ` => ${r.worse}`;
          kinds[key] = (kinds[key] ?? 0) + 1;
        }
        for (const [k, v] of Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${v}× ${k}`);
      }
    } else if (mode === 'bias') {
      const names = ['fenceMin', 'yarnMin', 'gutterMin', 'heroHp', 'heroXp', 'heroFish', 'heroDeaths', 'solo', 'mid', 'fish', 'prowl', 'guard'];
      const T = rows[0].length;
      for (let i = 0; i < T; i++) {
        const mean = names.map((_, j) => rows.reduce((a, r) => a + r[i][j], 0) / rows.length);
        const se = names.map((_, j) => Math.sqrt(rows.reduce((a, r) => a + (r[i][j] - mean[j]) ** 2, 0) / rows.length / rows.length));
        console.log(`${mmss((i + 1) * 15)} ${names.map((nm, j) => `${nm} ${mean[j].toFixed(1)}${Math.abs(mean[j]) > 3 * se[j] && se[j] > 0 ? '*' : ''}`).join('  ')}`);
      }
    }
    else if (mode === 'mirror') {
      const n = rows.length;
      const won = rows.filter((r) => r.winner === 0).length;
      const tk = rows.reduce((a, r) => [a[0] + r.takes[0], a[1] + r.takes[1]], [0, 0]);
      const T = [1500, 2400, 3300, 3600, 4500, 5400];
      for (let a = 0; a < T.length; a++) {
        const parts = [];
        for (let lane = 0; lane < 3; lane++) {
          let d = 0;
          for (const r of rows) d += r.fronts[(a * 3 + lane) * 2] - r.fronts[(a * 3 + lane) * 2 + 1];
          parts.push(`${['fence', 'yarn', 'gutter'][lane]} ${(d / n).toFixed(0)}`);
        }
        console.log(`  ${mmss(T[a])} front t0 − t1 (mm of progress): ${parts.join(', ')}`);
      }
      console.log(`hearth-mirror mirror: ${n} mirror matches (same heroes both sides); team 0 wins ${pct(won, n)}%; Grizzlechop takes t0 ${(tk[0] / n).toFixed(2)}, t1 ${(tk[1] / n).toFixed(2)}`);
    }
    else reportGrizz(rows);
    console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s, ${procs} processes${patches().length ? `, patches ${patches().map((p) => p.name).join(',')}` : ''})`);
  }
}
