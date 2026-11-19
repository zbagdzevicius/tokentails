#!/usr/bin/env node
/**
 * Trailer "Wild Rivals": gag search. Plays a take headless (tools/clips/clip-driver.ts, with the take's script rules)
 * over a seed range and lists the casts of the heroes asked for, each with the enemy and allied heroes near it, the
 * enemy heroes it hits within 2 s and the casts of other heroes around it, plus clip events (flop, ...) and deaths.
 *
 *   node tools/wildrivals/search.mjs --take '<json: mode, map, variant, teams, script>' --seeds 1-40 \
 *     --casts chili:2,nova:3 [--clips flop] [--victory] [--until 600] [--out f.json]
 */
import { writeFileSync } from 'node:fs';
import { argValue, hasFlag } from '../lib/args.mjs';
import { driver, takeOf } from '../clips/scenes.mjs';

const base = JSON.parse(argValue('--take'));
const [a, b] = (argValue('--seeds') ?? '1-20').split('-').map(Number);
const want = (argValue('--casts') ?? '').split(',').filter(Boolean).map((s) => s.split(':')).map(([h, k]) => [h, k === undefined ? -1 : +k]);
const clips = (argValue('--clips') ?? '').split(',').filter(Boolean);
const until = +(argValue('--until') ?? 900);
const { ClipRun } = await driver();
const HZ = 30;
const rows = [];
for (let seed = a; seed <= (b ?? a); seed++) {
  const run = new ClipRun(takeOf({ ...base, seed }));
  const w = run.match.world;
  const picks = run.picks;
  const N = picks.length;
  const found = [];
  const recent = [];
  while (!run.ended && run.tick < until * HZ) {
    const ev = run.stepOnce();
    for (const e of ev) {
      if (e.type === 'cast' && e.src < N) {
        recent.push({ tick: e.tick, hero: picks[e.src], key: e.slot });
        const hit = want.some(([h, k]) => h === picks[e.src] && (k < 0 || k === e.slot));
        if (hit) {
          const near = [];
          for (let s = 0; s < N; s++) {
            if (s === e.src || w.alive[s] !== 1) continue;
            const d = Math.hypot(w.x[s] - w.x[e.src], w.y[s] - w.y[e.src]);
            if (d < 9000) near.push(`${w.team[s] === w.team[e.src] ? '+' : '-'}${picks[s]}@${(d / 1000).toFixed(1)}`);
          }
          found.push({ kind: 'cast', t: +(e.tick / HZ).toFixed(2), hero: picks[e.src], key: e.slot, slot: e.src, x: w.x[e.src], y: w.y[e.src], hp: Math.round((100 * w.hp[e.src]) / w.maxHp[e.src]), near, hits: new Set(), around: [] });
        }
      }
      if (e.type === 'hit' && e.src < N && e.dst < N && w.team[e.src] !== w.team[e.dst]) {
        for (const f of found) if (f.kind === 'cast' && f.slot === e.src && e.tick - f.t * HZ <= 2 * HZ && e.tick >= f.t * HZ) f.hits.add(picks[e.dst]);
      }
      if (e.type === 'clip' && clips.includes(e.what)) {
        const near = [];
        for (let s = 0; s < N; s++) if (s !== e.id && w.alive[s] === 1 && Math.hypot(w.x[s] - w.x[e.id], w.y[s] - w.y[e.id]) < 9000) near.push(`${w.team[s] === w.team[e.id] ? '+' : '-'}${picks[s]}`);
        found.push({ kind: 'clip', what: e.what, t: +(e.tick / HZ).toFixed(2), hero: picks[e.id], slot: e.id, x: w.x[e.id], y: w.y[e.id], near, around: [] });
      }
      if (e.type === 'death' && e.id < N) found.push({ kind: 'death', t: +(e.tick / HZ).toFixed(2), hero: picks[e.id], by: picks[e.killer] ?? e.killer });
    }
  }
  // the other casts within 3 s of each found cast/clip (who answered it)
  for (const f of found) if (f.kind !== 'death') f.around = recent.filter((c) => Math.abs(c.tick - f.t * HZ) <= 3 * HZ && !(c.hero === f.hero && c.key === f.key)).map((c) => `${c.hero}:${'QWER'[c.key] ?? c.key}@${((c.tick - f.t * HZ) / HZ).toFixed(1)}`);
  const res = run.ended;
  const out = { seed, picks, end: +(run.tick / HZ).toFixed(1), winner: res?.winner ?? null, found: found.filter((f) => f.kind !== 'death' || hasFlag('--deaths')).map((f) => ({ ...f, hits: f.hits ? [...f.hits] : undefined })) };
  rows.push(out);
  const casts = out.found.filter((f) => f.kind !== 'death');
  console.error(`seed ${seed}: end ${out.end}s winner ${out.winner} ${casts.length} found`);
}
const of = argValue('--out');
if (of) writeFileSync(of, JSON.stringify(rows, null, 1) + '\n');
else console.log(JSON.stringify(rows));
process.exit(0);
