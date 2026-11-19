import { driver, takeOf } from '../../clips/scenes.mjs';
const spec = JSON.parse(process.argv[2]); const ts = process.argv[3].split(',').map(Number);
const { ClipRun } = await driver();
const run = new ClipRun(takeOf(spec));
const out = [];
for (const t of ts) { run.runTo(Math.round(t * 30)); out.push([t, run.match.world.alive[0], run.match.world.hp[0]]); }
console.log(JSON.stringify(out)); process.exit(0);
