#!/usr/bin/env node
/**
 * Trailer 60 gag search: plays Cannon Chaos takes headless (tools/clips/clip-driver.ts with the take's script rules)
 * over a seed range and lists the story moments each seed contains, so specs.mjs can point at real ticks.
 *
 *   node tools/trailer60/search.mjs --take '<json: teams, script, variant>' --seeds 1-200 [--gags fumble,miss,zzz,flop] [--out f.json]
 *
 * Gags:
 * - fumble: a cannonDrop 'fumble' by an enemy of Bravo within 2 s after Bravo's R cast (the ENCORE! payoff), then who
 *   picks the dropped cannon, whether it is fired and whether the kibble finishes a structure.
 * - miss: a cat picks the cannon while Rocket is within 3.2 m of it (Rocket miss #1).
 * - zzz: Rocket casts R and naps within 5 m of an enemy carrier (Rocket miss #2).
 * - flop: Bravo's Dramatic Flop (clip 'flop') with his W cast in the 3 s before and the last hit's source.
 * - ult: every ultimate cast with the heroes it hit within 2 s (the credits and the fights).
 * - victory / tower: who won, when; every structure death with its last hit.
 */
import { writeFileSync } from 'node:fs';
import { argValue } from '../lib/args.mjs';
import { takeOf, driver } from '../clips/scenes.mjs';

const base = JSON.parse(argValue('--take'));
const [a, b] = (argValue('--seeds') ?? '1-20').split('-').map(Number);
const GAGS = (argValue('--gags') ?? 'fumble,miss,zzz,flop,ult,victory,tower').split(',');
const { ClipRun } = await driver();
const HZ = 30;
const rows = [];
for (let seed = a; seed <= (b ?? a); seed++) {
  const take = takeOf({ mode: 'cannon', ...base, seed });
  const run = new ClipRun(take);
  const w = run.match.world;
  const picks = run.picks;
  const slotOf = (h) => picks.indexOf(h);
  const bravo = slotOf('bravo'), rocket = slotOf('rocket');
  const found = [];
  const casts = []; // {tick, src, slot}
  const hits = []; // {tick, src, dst}
  let lastR = { bravo: -1e9 };
  let lastW = -1e9;
  let pendingFumble = null;
  const lastHitOn = new Map();
  let prevBushR = -1, prevBushM = -1, bushSince = null;
  while (!run.ended && run.tick < 20 * 60 * HZ) {
    const ev = run.stepOnce();
    const tick = run.tick - 1;
    for (const e of ev) {
      if (e.type === 'cast') {
        casts.push({ tick: e.tick, src: e.src, slot: e.slot });
        if (e.src === bravo && e.slot === 3) lastR.bravo = e.tick;
        if (e.src === bravo && e.slot === 1) {
          lastW = e.tick;
          if (GAGS.includes('audition')) {
            const u = casts.filter((c) => c.slot === 3 && c.src !== bravo && e.tick - c.tick <= 30 && ['sage', 'nova', 'champ'].includes(picks[c.src])).at(-1);
            if (u) found.push({ gag: 'audition', t: +(e.tick / HZ).toFixed(2), ult: picks[u.src], ultT: +(u.tick / HZ).toFixed(2), d: Math.round(Math.hypot(w.x[bravo] - w.x[u.src], w.y[bravo] - w.y[u.src])), bravoHp: Math.round((100 * w.hp[bravo]) / w.maxHp[bravo]) });
          }
        }
        if (e.src === rocket && e.slot === 3) found.push({ gag: 'rocketR', t: +(e.tick / HZ).toFixed(2), carrier: w.globals[44] === 2 ? picks[w.globals[47]] ?? null : null });
        if (e.slot === 3 && GAGS.includes('ult')) found.push({ gag: 'ult', t: +(e.tick / HZ).toFixed(2), hero: picks[e.src], slot: e.src, x: w.x[e.src], y: w.y[e.src] });
      }
      if (e.type === 'hit') {
        if (e.src < picks.length) hits.push({ tick: e.tick, src: e.src, dst: e.dst });
        lastHitOn.set(e.dst, e);
        if (pendingFumble?.fire && !pendingFumble.structHit && e.src === slotOf(pendingFumble.fire.hero) && (w.kind[e.dst] === 3 || w.kind[e.dst] === 4) && e.tick - pendingFumble.fire.t * HZ < 45) pendingFumble.structHit = { id: e.dst, kind: w.kind[e.dst], hpLeft: w.hp[e.dst], max: w.maxHp[e.dst], t: +(e.tick / HZ).toFixed(2) };
      }
      if (e.type === 'cannonDrop' && e.why === 'fumble' && GAGS.includes('fumble')) {
        const dt = e.tick - lastR.bravo;
        pendingFumble = { gag: 'fumble', t: +(e.tick / HZ).toFixed(2), carrier: picks[e.id], encoreDt: dt, bravo: [w.x[bravo], w.y[bravo]], at: [e.x, e.y], byBravo: dt >= 0 && dt <= 60 };
        found.push(pendingFumble);
      }
      if (e.type === 'cannonPick') {
        if (pendingFumble && !pendingFumble.pick) pendingFumble.pick = { hero: picks[e.id], t: +(e.tick / HZ).toFixed(2) };
        if (GAGS.includes('miss') && rocket >= 0 && w.team[e.id] !== w.team[rocket] && w.alive[rocket] === 1) {
          const d = Math.hypot(w.x[rocket] - w.x[e.id], w.y[rocket] - w.y[e.id]);
          if (d < 3200) found.push({ gag: 'miss', t: +(e.tick / HZ).toFixed(2), taker: picks[e.id], rocketD: Math.round(d) });
        }
      }
      if (e.type === 'cannonFire' && pendingFumble && pendingFumble.pick && !pendingFumble.fire) pendingFumble.fire = { hero: picks[e.id], t: +(e.tick / HZ).toFixed(2), ax: e.ax, ay: e.ay };
      if (e.type === 'kaboom' || e.type === 'tower') {
        if (pendingFumble?.fire && !pendingFumble.result && e.tick - pendingFumble.fire.t * HZ < 60) pendingFumble.result = { type: e.type, t: +(e.tick / HZ).toFixed(2), ...(e.type === 'tower' ? { id: e.id } : { dst: e.dst }) };
      }
      if (e.type === 'clip' && e.what === 'flop' && e.id === bravo && GAGS.includes('flop')) {
        const h = lastHitOn.get(bravo);
        found.push({ gag: 'flop', t: +(e.tick / HZ).toFixed(2), wAgo: +((e.tick - lastW) / HZ).toFixed(2), by: h ? (h.src < picks.length ? picks[h.src] : `unit${h.src}`) : null, kind: h?.kind, at: [w.x[bravo], w.y[bravo]] });
      }
      if (e.type === 'tower' && GAGS.includes('tower')) {
        const h = lastHitOn.get(e.id);
        found.push({ gag: 'tower', t: +(e.tick / HZ).toFixed(2), id: e.id, kind: w.kind[e.id], team: w.team[e.id], by: h ? (h.src < picks.length ? picks[h.src] : `unit${h.src}`) : null, at: [w.x[e.id], w.y[e.id]] });
      }
    }
    if (GAGS.includes('bush')) {
      const rg = slotOf('ranger'), mb = slotOf('meatball');
      if (rg >= 0 && mb >= 0 && w.alive[rg] === 1 && w.alive[mb] === 1) {
        const br = w.bush[rg], bm = w.bush[mb];
        if (br >= 0 && bm === br && prevBushM !== br && (found.at(-1)?.gag !== 'bush' || tick - found.at(-1).tick > 90)) found.push({ gag: 'bush', t: +(tick / HZ).toFixed(2), tick, bush: br, rangerSince: +((tick - (bushSince ?? tick)) / HZ).toFixed(2), at: [w.x[rg], w.y[rg]] });
        if (br >= 0 && prevBushR !== br) bushSince = tick;
        prevBushR = br;
        prevBushM = bm;
      }
    }
    // Rocket's nap next to an enemy carrier
    if (GAGS.includes('zzz') && rocket >= 0 && w.kRT[rocket] > 0 && (found.at(-1)?.gag !== 'zzz' || tick - found.at(-1).tick > 60)) {
      const by = w.globals[47];
      if (w.globals[44] === 2 && by >= 0 && w.team[by] !== w.team[rocket]) {
        const d = Math.hypot(w.x[rocket] - w.x[by], w.y[rocket] - w.y[by]);
        if (d < 6000) found.push({ gag: 'zzz', t: +(tick / HZ).toFixed(2), tick, carrier: picks[by], d: Math.round(d) });
      }
    }
  }
  // ultimate quality: enemy heroes the caster hit in the 2 s after the cast, and kills by the caster
  for (const f of found) if (f.gag === 'ult') {
    const t0 = Math.round(f.t * HZ);
    f.hit = new Set(hits.filter((h) => h.src === f.slot && h.tick >= t0 && h.tick <= t0 + 60 && h.dst < picks.length && w.team[h.dst] !== w.team[f.slot]).map((h) => h.dst)).size;
  }
  const r = run.ended;
  if (GAGS.includes('victory')) found.push({ gag: 'victory', t: +(run.tick / HZ).toFixed(2), winner: r?.winner, reason: r?.reason });
  rows.push({ seed, picks, found });
  const summary = Object.entries(found.reduce((o, f) => ((o[f.gag] = (o[f.gag] ?? 0) + 1), o), {})).map(([k, v]) => `${k}:${v}`).join(' ');
  process.stderr.write(`seed ${seed} ${summary}\n`);
}
const out = argValue('--out');
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
else console.log(JSON.stringify(rows.map((r) => ({ seed: r.seed, found: r.found.filter((f) => f.gag !== 'ult' && f.gag !== 'tower') }))));
