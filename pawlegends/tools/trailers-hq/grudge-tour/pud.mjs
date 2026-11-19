// pudding hops with both teams near: node pud.mjs '<spec>' a-b   (cwd = pawlegends)
import { driver, takeOf } from '../../clips/scenes.mjs';
const spec = JSON.parse(process.argv[2]); const [a, b] = process.argv[3].split('-').map(Number);
const { ClipRun, Kind } = await driver();
const out = [];
for (let seed = a; seed <= b; seed++) {
  const run = new ClipRun(takeOf({ ...spec, seed })); const N = run.picks.length;
  while (!run.ended && run.tick < 900 * 30) {
    const ev = run.stepOnce(); const w = run.match.world;
    for (const e of ev) if (e.type === 'pudding' && (e.what === 'hop' || e.what === 'calmed')) {
      let pid = -1; for (let id = N; id < w.kind.length; id++) if (w.kind[id] === Kind.Pudding && w.alive[id] === 1) pid = id;
      const px = pid >= 0 ? w.x[pid] : 0, py = pid >= 0 ? w.y[pid] : 0;
      const near = [0, 0]; for (let s = 0; s < N; s++) if (w.alive[s] === 1 && Math.hypot(w.x[s] - px, w.y[s] - py) < 7000) near[w.team[s]]++;
      out.push({ seed, t: +(run.tick / 30).toFixed(2), what: e.what, near, pid, px, py });
    }
  }
}
out.filter((r) => r.near[0] && r.near[1]).sort((x, y) => (y.near[0] + y.near[1]) - (x.near[0] + x.near[1])).slice(0, 30).forEach((r) => console.log(JSON.stringify(r)));
console.log('calmed', JSON.stringify(out.filter((r) => r.what === 'calmed').map((r) => [r.seed, r.t, r.near])));
process.exit(0);
