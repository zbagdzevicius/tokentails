// Debug helper: scan the exact take of a spec (picks/looks/variant) and list moments.
// node tools/clips/dev/scan-spec.mjs '<spec json>' [types,comma] [seedFrom-seedTo]
import { scan, takeOf } from '../scenes.mjs';
const spec = JSON.parse(process.argv[2]);
const types = (process.argv[3] || '').split(',').filter(Boolean);
const [a, b] = (process.argv[4] || String(spec.seed)).split('-').map(Number);
for (let s = a; s <= (b || a); s++) {
  const r = await scan(takeOf({ ...spec, seed: s }));
  const ms = r.moments.filter((m) => !types.length || types.includes(m.type));
  console.log(JSON.stringify({ seed: s, end: Math.round(r.endTick / 30), winner: r.winner, picks: r.picks,
    m: ms.map((m) => [m.type, m.sub, Math.round(m.t), Math.round(m.score * 10) / 10, m.note].filter((x) => x !== undefined)) }));
}
process.exit(0);
