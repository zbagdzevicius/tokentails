#!/usr/bin/env node
/**
 * Geode Job (trailers-hq): find ability moments for the shot list. Plays clip takes headless (the clip engine's
 * ClipRun, same sim the browser harness runs) and lists, per seed, every cast of the wanted hero/slot with the enemy
 * heroes it hit inside 1.5 s, the heroes near it, the caster's level, plus objective events (gems, surge, shrines,
 * cannon, victory).
 *
 *   node tools/trailers-hq/geode-job/castscan.mjs '<take json>' <seedA-seedB> [hero:slot,hero:slot] [--events]
 *   take json: { "mode": "skirmish", "map": "quarry", "teams": [[..],[..]] }
 */
import { argValue, hasFlag, positionals } from '../../lib/args.mjs';
import { takeOf, driver } from '../../clips/scenes.mjs';

const [takeJson, range = '1-10', wantArg = ''] = positionals([]);
const [a, b] = range.split('-').map(Number);
const want = wantArg ? wantArg.split(',').map((s) => { const [h, k] = s.split(':'); return { h, k: Number(k) }; }) : [];
const HZ = 30;
const { ClipRun } = await driver();
const rows = [];
for (let seed = a; seed <= (b || a); seed++) {
  const take = takeOf({ ...JSON.parse(takeJson), seed });
  const run = new ClipRun(take);
  const N = run.picks.length;
  const casts = [];
  const other = [];
  const open = [];
  const napping = new Uint8Array(N);
  while (!run.ended && run.tick < 30 * 60 * 20) {
    const tick = run.tick;
    const ev = run.stepOnce();
    const w = run.match.world;
    for (const e of ev) {
      if (e.type === 'cast' && e.src < N) {
        const h = run.picks[e.src];
        if (want.length && !want.some((q) => q.h === h && q.k === e.slot)) continue;
        const near = [];
        for (let s = 0; s < N; s++) if (s !== e.src && w.alive[s] === 1 && Math.hypot(w.x[s] - w.x[e.src], w.y[s] - w.y[e.src]) < 10000) near.push(run.picks[s]);
        const c = { t: +(tick / HZ).toFixed(2), hero: h, src: e.src, slot: e.slot, lvl: w.level[e.src], x: w.x[e.src], y: w.y[e.src], hits: new Set(), near };
        casts.push(c);
        open.push(c);
      } else if (e.type === 'hit' && e.src < N && e.dst < N && w.team[e.src] !== w.team[e.dst]) {
        for (const c of open) if (c.src === e.src && tick / HZ - c.t <= 1.5) c.hits.add(run.picks[e.dst]);
      } else if (hasFlag('--events') && ['gemSurge', 'gemCountdown', 'shrineCapture', 'cannonFire', 'kaboom', 'death', 'gemDrop'].includes(e.type)) {
        other.push({ t: +(tick / HZ).toFixed(2), type: e.type, team: e.team, who: run.picks[e.id ?? e.src] ?? null, dst: run.picks[e.dst] ?? null, killer: run.picks[e.killer] ?? null, n: e.n });
      }
    }
    if (hasFlag('--events')) for (let s = 0; s < N; s++) {
      const nap = w.napT[s] > 0 ? 1 : 0;
      if (nap && !napping[s]) other.push({ t: +(tick / HZ).toFixed(2), type: 'nap', who: run.picks[s], x: w.x[s], y: w.y[s] });
      napping[s] = nap;
    }
    while (open.length && tick / HZ - open[0].t > 1.5) open.shift();
  }
  const ended = run.ended;
  rows.push({ seed, picks: run.picks, end: +(run.tick / HZ).toFixed(1), winner: ended?.winner ?? null, reason: ended?.reason ?? null, casts: casts.map((c) => ({ ...c, hits: [...c.hits] })), events: other });
}
const out = argValue('--out');
if (out) (await import('node:fs')).writeFileSync(out, JSON.stringify(rows));
for (const r of rows) {
  const good = r.casts.filter((c) => c.hits.length >= (Number(argValue('--min') ?? 1))).sort((x, y) => y.hits.length - x.hits.length).slice(0, Number(argValue('--top') ?? 6));
  console.log(`seed ${r.seed} end ${r.end}s winner ${r.winner} (${r.reason}) casts ${r.casts.length}`);
  for (const c of good) console.log(`  ${c.t}s ${c.hero}[${c.slot}] L${c.lvl} hits ${c.hits.join(',')} near ${c.near.join(',')}`);
  const evf = argValue('--ev')?.split(',');
  if (hasFlag('--events')) for (const e of r.events.filter((e) => (evf ? evf.includes(e.type) : e.type !== 'death'))) console.log(`  ev ${e.t}s ${e.type} team ${e.team ?? ''} ${e.who ?? ''} ${e.dst ?? ''} ${e.n ?? ''}`);
}
