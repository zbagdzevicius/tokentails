// Trailers-hq shot finder: scan a spec's exact take over a seed range for one kind of event and rank the hits by how
// readable they are on screen (enemy heroes the caster hits in the next 1.5 s, heroes of both teams within 8 m).
//   node tools/clips/dev/find-cast.mjs '<spec json>' <query> <seedA-seedB> [top]
// query: cast:<slot>:<k> (k 0=Q 1=W 2=E 3=R; slot '*' = any) | hero:<heroId>:<k> | yarn:<slot|*> | goal:<team|*>
//        | pudding:<what> | shrine | gem | surge | cannon:<sub> | clip:<what> | hits:<slot> (enemy heroes hit, 3 s windows)
// Prints JSON rows { seed, t, tick, src, hero, hit, foes, mates, score, end }.
import { driver, takeOf } from '../scenes.mjs';

const spec = JSON.parse(process.argv[2]);
const q = process.argv[3].split(':');
const [a, b] = process.argv[4].split('-').map(Number);
const top = Number(process.argv[5] ?? 12);
const { ClipRun } = await driver();
const rows = [];
for (let seed = a; seed <= (b || a); seed++) {
  const run = new ClipRun(takeOf({ ...spec, seed }));
  const N = run.picks.length;
  const isHero = (id) => id >= 0 && id < N;
  const pending = [];
  const maxTick = (spec.maxT ?? 900) * 30;
  while (!run.ended && run.tick < maxTick) {
    const tick = run.tick;
    const ev = run.stepOnce();
    const w = run.match.world;
    for (const e of ev) {
      if (e.type === 'hit' && isHero(e.src) && isHero(e.dst) && w.team[e.src] !== w.team[e.dst]) for (const p of pending) if (p.src === e.src && tick - p.tick <= 45) p.hitSet.add(e.dst);
      let src = -1;
      let ok = false;
      switch (q[0]) {
        case 'cast':
          ok = e.type === 'cast' && (q[1] === '*' || e.src === +q[1]) && e.slot === +q[2] && isHero(e.src);
          src = e.src;
          break;
        case 'hero':
          ok = e.type === 'cast' && isHero(e.src) && run.picks[e.src] === q[1] && e.slot === +q[2];
          src = e.src;
          break;
        case 'yarn':
          ok = (e.type === 'yarnKick' || e.type === 'yarnStrike') && (q[1] === '*' || e.id === +q[1]);
          src = e.id;
          break;
        case 'goal':
          ok = e.type === 'goal' && (q[1] === '*' || e.team === +q[1]);
          src = e.id;
          break;
        case 'pudding':
          ok = e.type === 'pudding' && (!q[1] || e.what === q[1]);
          break;
        case 'shrine':
          ok = e.type === 'shrineCapture';
          break;
        case 'gem':
          ok = e.type === 'gemPick' || e.type === 'gemDrop';
          src = e.id;
          break;
        case 'surge':
          ok = e.type === 'gemSurge';
          break;
        case 'cannon':
          ok = e.type === q[1];
          src = e.type === 'kaboom' ? e.src : e.id;
          break;
        case 'clip':
          ok = e.type === 'clip' && (!q[1] || e.what === q[1]);
          src = e.id;
          break;
        case 'obj':
          ok = e.type === 'objective' || e.type === 'millCapture';
          break;
      }
      if (!ok || (isHero(src) && w.alive[src] !== 1)) continue; // a cast event can fire for a dead seat (seen on Sir Brutus): skip it
      const row = { seed, t: +(tick / 30).toFixed(2), tick, ev: e.type, what: e.what ?? e.slot ?? e.sub, src, hero: isHero(src) ? run.picks[src] : null, hitSet: new Set(), x: isHero(src) ? w.x[src] : e.x, y: isHero(src) ? w.y[src] : e.y };
      if (isHero(src)) {
        let foes = 0, mates = 0;
        for (let s = 0; s < N; s++) {
          if (s === src || w.alive[s] !== 1) continue;
          if (Math.hypot(w.x[s] - w.x[src], w.y[s] - w.y[src]) > 8000) continue;
          if (w.team[s] === w.team[src]) mates++;
          else foes++;
        }
        row.foes = foes;
        row.mates = mates;
      }
      pending.push(row);
      rows.push(row);
    }
    while (pending.length && run.tick - pending[0].tick > 45) pending.shift();
  }
  for (const r of rows) if (r.seed === seed) r.end = Math.round(run.tick / 30);
}
for (const r of rows) {
  r.hit = r.hitSet.size;
  delete r.hitSet;
  r.score = r.hit * 3 + (r.foes ?? 0) + 0.5 * (r.mates ?? 0);
}
rows.sort((x, y) => y.score - x.score || x.t - y.t);
for (const r of rows.slice(0, top)) console.log(JSON.stringify(r));
console.error(`${rows.length} hits`);
process.exit(0);
