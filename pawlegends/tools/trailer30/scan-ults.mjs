#!/usr/bin/env node
// Trailer 30: rank ultimate casts by impact (distinct enemy heroes the caster hits within 2 s, heroes near the cast,
// takedowns that follow), plus tower falls and the victory, for a set of picks over a seed range.
// node tools/trailer30/scan-ults.mjs --mode classic --teams lambo,clem,sage,bengas,gabe/brutus,cacklejaw,marshmallow,howler,nugget --seeds 1-20 --out ults.json
import { writeFileSync } from 'node:fs';
import { argValue } from '../lib/args.mjs';
import { driver, takeOf } from '../clips/scenes.mjs';

const mode = argValue('--mode') ?? 'classic';
const [ta, tb] = (argValue('--teams') ?? '').split('/').map((s) => s.split(',').filter(Boolean));
const [s0, s1] = (argValue('--seeds') ?? '1-10').split('-').map(Number);
const variant = argValue('--variant') ?? 'bots';
const { ClipRun } = await driver();
const HZ = 30;
const all = [];
for (let seed = s0; seed <= (s1 ?? s0); seed++) {
  const spec = { mode, seed, variant, teams: [ta, tb] };
  const run = new ClipRun(takeOf(spec));
  const N = run.picks.length;
  const isHero = (id) => id >= 0 && id < N;
  const casts = [];
  const towers = [];
  const kills = [];
  let comeback = [];
  while (!run.ended && run.tick < 30 * 60 * 30) {
    const tick = run.tick;
    const ev = run.stepOnce();
    const w = run.match.world;
    for (const e of ev) {
      if (e.type === 'cast' && e.slot === 3 && isHero(e.src)) {
        let near = 0;
        for (let s = 0; s < N; s++) if (w.alive[s] && Math.hypot(w.x[s] - w.x[e.src], w.y[s] - w.y[e.src]) < 12000) near++;
        casts.push({ tick, src: e.src, hero: run.picks[e.src], team: w.team[e.src], x: w.x[e.src], y: w.y[e.src], near, hit: new Set(), kills: 0 });
      }
      if (e.type === 'hit' && isHero(e.src) && isHero(e.dst) && w.team[e.src] !== w.team[e.dst]) {
        for (const c of casts) if (c.src === e.src && tick - c.tick <= 2 * HZ) c.hit.add(e.dst);
      }
      if (e.type === 'death' && isHero(e.id)) {
        kills.push({ tick, killer: e.killer, victim: e.id });
        for (const c of casts) if (c.src === e.killer && tick - c.tick <= 3 * HZ) c.kills++;
      }
      if (e.type === 'tower') towers.push({ tick, t: +(tick / HZ).toFixed(1), id: e.id, by: e.destroyedBy, x: w.x[e.id], y: w.y[e.id] });
      if (e.type === 'comeback') comeback.push({ tick, team: e.team });
    }
  }
  const res = run.ended;
  const out = {
    seed, picks: run.picks, end: run.tick, winner: res?.winner, reason: res?.reason,
    teams: [0, 1].map((t) => run.heroes().filter((h) => h.team === t).map((h) => h.hero)),
    casts: casts.map((c) => ({ ...c, t: +(c.tick / HZ).toFixed(1), hit: c.hit.size, score: c.hit.size * 3 + c.kills * 4 + Math.min(c.near, 8) })),
    towers, comeback, kills: kills.length,
  };
  console.error(`seed ${seed}: ${(out.end / HZ / 60).toFixed(1)} min winner ${out.winner} towers ${towers.length} casts ${casts.length} best ${out.casts.sort((a, b) => b.score - a.score).slice(0, 3).map((c) => `${c.hero}@${c.t}:${c.score}`).join(' ')}`);
  all.push(out);
}
const outFile = argValue('--out');
if (outFile) writeFileSync(outFile, JSON.stringify(all) + '\n');
process.exit(0);
