#!/usr/bin/env node
/**
 * Trailer seed search (storyboard §8 step 1): plays seeded Normal matches headless (sim SIM_VERSION, slot 0 = the
 * player-bot 'normal' through take-driver.ts) and finds, for every take, a seed whose event log holds the shot's
 * moment (a CLANK on Sir Brutus, a Moonshot that lands, Pudding's bounce, the core falling, ...). Writes takes.json:
 * seed, hero, trick, script, the key ticks, the slots to frame and the event-log hash the browser capture must match.
 *
 *   node tools/trailer/seed-search.mjs [--seeds 2000] [--from 1] [--only A,B] [--procs N]
 *
 * A take is "strict" when every condition of the storyboard holds; otherwise the best partial match is kept and
 * listed under `relaxed` with what it misses (the capture still works; the report names the change).
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argValue, hasFlag } from '../lib/args.mjs';
import { importSim } from '../lib/sim-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'takes.json');
const SEEDS = Number(argValue('--seeds') ?? 2000);
const FROM = Number(argValue('--from') ?? 1);
const ONLY = (argValue('--only') ?? '').split(',').filter(Boolean);

const d = await importSim('tools/trailer/take-driver.ts');
const HZ = d.TICK_HZ;
const S = (sec) => Math.round(sec * HZ);
const RIVER = 50000;
const CORE_IDS = [d.RANGE.cores, d.RANGE.cores + 1];
const isTower = (id) => id >= d.RANGE.towers && id < d.RANGE.cores;
const isCore = (id) => id >= d.RANGE.cores && id < d.RANGE.fountains;
const teamOf = (slot) => (slot < 3 ? 0 : 1);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pos = (w, id) => ({ x: w.x[id], y: w.y[id] });
const hpPct = (w, id) => (w.maxHp[id] > 0 ? (100 * w.hp[id]) / w.maxHp[id] : 0);
/** Where each tower and core stands (read while they are alive: a dead structure's position is not kept). */
const spotCache = new WeakMap();
function spotOf(run, id) {
  let m = spotCache.get(run);
  if (!m) {
    m = {};
    spotCache.set(run, m);
  }
  const w = run.match.world;
  if (!m[id] && w.alive[id]) m[id] = [w.x[id], w.y[id]];
  return m[id];
}
function noteSpots(run) {
  for (let id = d.RANGE.towers; id < d.RANGE.fountains; id++) spotOf(run, id);
}

/**
 * Take predicates. `hero`: slot 0's hero. `make()` returns an object
 * with `tick(run, t, events)` and `result()` → { score, strict, keys, roles, points, miss } | null.
 */
const TAKES = {
  // S01: Clem's Paw Combo swipe lands on Sir Brutus's raised guard: "CLANK!".
  A: {
    hero: 'clem',
    make() {
      let lastQ = -999;
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 0) lastQ = t;
            if (e.type !== 'hit' || e.src !== 0 || e.shielded <= 0 || run.picks[e.dst] !== 'brutus' || teamOf(e.dst) !== 1) continue;
            if (t - lastQ > 40) continue;
            const dd = dist(pos(w, 0), pos(w, e.dst));
            if (dd > 4500) continue;
            const inTime = t >= S(40) && t <= S(90);
            const bridge = Math.abs(w.x[0] - RIVER) < 9000;
            const guard = (w.buffs[e.dst] & d.Buff.Blocking) !== 0;
            const score = (inTime ? 10 : 0) + (bridge ? 5 : 0) + (guard ? 3 : 0) - t / 100000;
            if (!best || score > best.score) {
              best = { score, strict: inTime && bridge, keys: { clank: t, q: lastQ }, roles: { brutus: e.dst }, miss: [!inTime && 'time 0:40-1:30', !bridge && 'at the bridge'].filter(Boolean) };
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S02-S03: Sage's Moonshot from 10 m+ lands on a dog hero (Cacklejaw first).
  B: {
    hero: 'sage',
    make() {
      let wind = -1;
      let cast = null;
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'windup' && e.src === 0 && e.slot === 3) wind = t;
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) {
              let near = Infinity;
              for (let s = 3; s < 6; s++) if (w.alive[s]) near = Math.min(near, dist(pos(w, 0), pos(w, s)));
              cast = { t, wind, near };
            }
            if (e.type === 'hit' && e.src === 0 && e.kind === 'ability' && cast && t - cast.t <= 90 && t > cast.t && teamOf(e.dst) === 1 && e.dst < 6) {
              const far = dist(pos(w, 0), pos(w, e.dst));
              if (far < 9000) continue;
              const cackle = run.picks[e.dst] === 'cacklejaw';
              // the Bullseye lands on an opaque dog: not in stealth or in a bush at the hit (a ghost reads as a miss)
              if ((w.buffs[e.dst] & (d.Buff.Stealth | d.Buff.InBrush)) !== 0) continue;
              // a flight long enough to ride along (the storyboard's f52-f90 is ~30 ticks at its ramp)
              const flight = t - cast.t;
              const score = (cast.near >= 10000 ? 5 : 0) + (cackle ? 3 : 0) + Math.min(5, far / 4000) + (cast.wind >= 0 ? 1 : 0) + Math.min(8, flight / 2);
              if (!best || score > best.score) best = { score, strict: cackle && far >= 10000 && flight >= 12, keys: { windup: cast.wind, release: cast.t, hit: t }, roles: { target: e.dst }, miss: [!cackle && 'target Cacklejaw', flight < 12 && `flight ${flight} ticks`].filter(Boolean) };
              cast = null;
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S06: the first minion waves clash at the river with heroes around (the best-attended moment of the first fight).
  C: {
    hero: 'clem',
    make() {
      let best = null;
      return {
        tick(run, t, ev) {
          if (t < S(18) || t > S(45)) return;
          const w = run.match.world;
          for (const e of ev) {
            if (e.type !== 'hit' || e.src < d.RANGE.minions || e.src >= d.RANGE.towers || e.dst < d.RANGE.minions || e.dst >= d.RANGE.towers) continue;
            const p = pos(w, e.dst);
            if (Math.abs(p.x - RIVER) > 9000) continue;
            const near = [0, 0];
            for (let s = 0; s < 6; s++) if (w.alive[s] && dist(pos(w, s), p) <= 12000) near[teamOf(s)]++;
            const score = Math.min(near[0], near[1]) * 10 + near[0] + near[1] - t / 10000;
            if (!best || score > best.score) best = { score, strict: near[0] >= 3 && near[1] >= 3, keys: { clash: t }, roles: {}, points: { clash: [p.x, p.y] }, miss: [`${near[0]}v${near[1]} heroes within 12 m`] };
            return;
          }
        },
        result: () => best,
      };
    },
  },
  // S07: Sir Brutus's Pug Charge knocks back a cat 4-8 m in front.
  D: {
    hero: 'brutus',
    make() {
      let cast = null;
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 2) {
              let near = Infinity;
              for (let s = 3; s < 6; s++) if (w.alive[s]) near = Math.min(near, dist(pos(w, 0), pos(w, s)));
              cast = { t, near };
            }
            if (e.type === 'hit' && e.src === 0 && cast && t - cast.t <= 20 && e.dst >= 3 && e.dst < 6) {
              const ok = cast.near >= 4000 && cast.near <= 8000;
              const score = (ok ? 10 : 0) + (t > S(60) ? 2 : 0) + Math.min(3, e.amount / 100);
              if (!best || score > best.score) best = { score, strict: ok, keys: { charge: cast.t, hit: t }, roles: { victim: e.dst }, miss: [!ok && 'cat 4-8 m in front'].filter(Boolean) };
              cast = null;
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S08: Avietė's Short Circuit blinks onto Sir Brutus.
  E: {
    hero: 'aviete',
    make() {
      let cast = null;
      let best = null;
      return {
        tick(run, t, ev) {
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) cast = { t, target: e.target };
            if (e.type === 'hit' && e.src === 0 && cast && t - cast.t <= 12 && e.dst >= 3 && e.dst < 6) {
              const brutus = run.picks[e.dst] === 'brutus';
              const score = (brutus ? 10 : 0) + (t > S(90) ? 2 : 0) + Math.min(3, e.amount / 100);
              if (!best || score > best.score) best = { score, strict: brutus, keys: { cast: cast.t, hit: t }, roles: { target: e.dst }, miss: [!brutus && 'target Sir Brutus'].filter(Boolean) };
              cast = null;
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S09: Bengas's Curtains Up! with two dogs inside the stage.
  F: {
    hero: 'bengas',
    make() {
      let cast = null;
      let best = null;
      return {
        tick(run, t, ev) {
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) {
              if (cast) close(cast);
              cast = { t, x: e.x, y: e.y, hit: new Set() };
            }
            if (e.type === 'hit' && e.src === 0 && cast && t - cast.t <= 45 && e.dst >= 3 && e.dst < 6) cast.hit.add(e.dst);
          }
          if (cast && t - cast.t > 45) {
            close(cast);
            cast = null;
          }
        },
        result: () => best,
      };
      function close(c) {
        const n = c.hit.size;
        const score = n * 10;
        if (n > 0 && (!best || score > best.score)) best = { score, strict: n >= 2, keys: { cast: c.t }, roles: { victim: [...c.hit][0] }, points: { stage: [c.x, c.y] }, miss: [n < 2 && 'two dogs in the stage'].filter(Boolean) };
      }
    },
  },
  // S10: Cacklejaw slinks in a bush, then Pack Hunt leaps at a cat under 40% HP.
  G: {
    hero: 'cacklejaw',
    make() {
      let slink = null;
      let leap = null;
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 2) slink = { t, bush: (w.buffs[0] & d.Buff.InBrush) !== 0 };
            // slot 0 plays Cacklejaw, so team 0 is the dogs: the cats are slots 3..5
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) {
              let low = -1;
              let lowPct = 101;
              for (let s = 3; s < 6; s++) if (w.alive[s] && hpPct(w, s) < lowPct && dist(pos(w, 0), pos(w, s)) < 10000) (lowPct = hpPct(w, s)), (low = s);
              leap = { t, low, lowPct, slink: slink && t - slink.t <= 75 ? slink : null };
            }
            if (e.type === 'hit' && e.src === 0 && leap && t - leap.t <= 30 && e.dst >= 3 && e.dst < 6) {
              const s = leap.slink;
              const score = (s ? 6 : 0) + (s?.bush ? 4 : 0) + (leap.lowPct < 40 ? 5 : 0);
              if (!best || score > best.score) best = { score, strict: !!s && leap.lowPct < 40, keys: { slink: s ? s.t : leap.t - 12, leap: leap.t, hit: t }, roles: { victim: e.dst }, miss: [!s && 'Bush Slink before', s && !s.bush && 'in a bush', leap.lowPct >= 40 && 'victim under 40%'].filter(Boolean) };
              leap = null;
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S11: Lambo's Tangled Lights pulls two dogs, then Belly Flop lands.
  H: {
    hero: 'lambo',
    make() {
      let pull = null;
      let best = null;
      return {
        tick(run, t, ev) {
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) pull = { t, hit: new Set(), flop: -1 };
            if (!pull) continue;
            if (e.type === 'hit' && e.src === 0 && t - pull.t <= 24 && e.dst >= 3 && e.dst < 6 && pull.flop < 0) pull.hit.add(e.dst);
            if (e.type === 'cast' && e.src === 0 && e.slot === 2 && t - pull.t <= 90) pull.flop = t;
            if (e.type === 'hit' && e.src === 0 && pull.flop >= 0 && t - pull.flop <= 40 && e.dst >= 3 && e.dst < 6) {
              const n = pull.hit.size;
              const score = n * 5 + 5;
              if (!best || score > best.score) best = { score, strict: n >= 2, keys: { pull: pull.t, flop: pull.flop, land: t }, roles: { victim: e.dst }, miss: [n < 2 && 'two dogs pulled'].filter(Boolean) };
              pull = null;
            }
          }
          if (pull && t - pull.t > 140) pull = null;
        },
        result: () => best,
      };
    },
  },
  // S12: Gabė charms Sir Brutus (Under Her Spell) and pops a Heart Balloon on him.
  I: {
    hero: 'gabe',
    make() {
      let spell = null;
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) {
              let br = -1;
              let far = 0;
              for (let s = 3; s < 6; s++) if (run.picks[s] === 'brutus' && w.alive[s] && dist(pos(w, 0), pos(w, s)) < 8000) (br = s), (far = dist(pos(w, 0), pos(w, s)));
              // a clean two-shot: nobody else within 4 m of the line between them
              let crowd = 0;
              if (br >= 0) {
                const mid = { x: (w.x[0] + w.x[br]) / 2, y: (w.y[0] + w.y[br]) / 2 };
                for (let s = 1; s < 6; s++) if (s !== br && w.alive[s] && dist(pos(w, s), mid) < far / 2 + 3000) crowd++;
              }
              spell = { t, br, far, crowd, balloon: -1 };
            }
            if (!spell) continue;
            if (e.type === 'cast' && e.src === 0 && e.slot === 0 && t - spell.t <= 120) spell.balloon = t;
            if (e.type === 'hit' && e.src === 0 && spell.balloon >= 0 && t > spell.balloon && t - spell.balloon <= 45 && e.dst >= 3 && e.dst < 6) {
              const brutus = e.dst === spell.br;
              const span = spell.far >= 4000 && spell.far <= 8000;
              const score = (brutus ? 10 : 0) + (spell.br >= 0 ? 3 : 0) + (span ? 6 : 0) + Math.max(0, 4 - spell.crowd * 2) + Math.min(3, spell.far / 2500);
              if (!best || score > best.score) best = { score, strict: brutus && span && spell.crowd === 0, keys: { spell: spell.t, balloon: spell.balloon, pop: t }, roles: { target: e.dst }, miss: [!brutus && 'Sir Brutus charmed and popped', !span && 'charm at 4-8 m', spell.crowd > 0 && `${spell.crowd} others in the two-shot`].filter(Boolean) };
              spell = null;
            }
          }
          if (spell && t - spell.t > 200) spell = null;
        },
        result: () => best,
      };
    },
  },
  // S13-S14: two 'Group on me' pings 2 s apart: both allies answer, then the hurt one refuses ("Healing first!").
  J: {
    hero: 'clem',
    scripted: true,
    make() {
      const hp = [[], [], []];
      /** Allies' distance to slot 0 (mm) by tick: in frame for the shot when both are within 16 m. */
      const near = [[], [], []];
      const cands = [];
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (let s = 0; s < 3; s++) {
            hp[s][t] = w.alive[s] ? hpPct(w, s) : -1;
            near[s][t] = dist(pos(w, 0), pos(w, s));
          }
          const t0 = t - 60;
          if (t0 < S(120) || t0 > S(180) || t0 % 3 !== 0 || cands.length >= 12) return;
          if (hp[0][t0] < 0) return;
          for (const [a, b] of [[1, 2], [2, 1]]) {
            if (hp[a][t0] >= 80 && hp[b][t0] >= 38 && hp[b][t] >= 0 && hp[b][t] < 30 && hp[a][t] >= 40) cands.push({ t: t0, healer: b, ok: a, close: near[a][t0] <= 16000 && near[b][t0] <= 16000 && near[b][t] <= 16000 });
          }
        },
        // close ones first: the allies run in from the sides of the frame
        result: () => (cands.length ? { cands: cands.sort((x, y) => Number(y.close) - Number(x.close)) } : null),
      };
    },
    // phase 2: replay with the pings and check the barks
    verify(spec, c) {
      const run = new d.TakeRun({ ...spec, script: [] });
      const p1 = c.t;
      const p2 = c.t + 60;
      run.runTo(p1);
      const w = run.match.world;
      const script = [{ tick: p1, cmd: { op: d.Op.Ping, kind: d.PING_KIND.Group, x: w.x[0], y: w.y[0], id: d.NO_TARGET } }];
      const run2 = new d.TakeRun({ ...spec, script });
      run2.runTo(p2);
      script.push({ tick: p2, cmd: { op: d.Op.Ping, kind: d.PING_KIND.Group, x: run2.match.world.x[0], y: run2.match.world.y[0], id: d.NO_TARGET } });
      const run3 = new d.TakeRun({ ...spec, script });
      const barks = [];
      while (run3.tick < p2 + 40 && !run3.ended) for (const e of run3.stepOnce()) if (e.type === 'bark' || e.type === 'ping') barks.push(e);
      const first = barks.filter((e) => e.type === 'bark' && e.tick >= p1 && e.tick < p2);
      const second = barks.filter((e) => e.type === 'bark' && e.tick >= p2);
      const okBoth = first.filter((e) => e.what === 'ok').length;
      const heal = second.find((e) => e.what === 'heal');
      if (!okBoth || !heal) return null;
      // the same cat says both lines: she answers the first ping ("Coming to you!"), then refuses the second
      const okEv = first.find((e) => e.what === 'ok' && e.id === heal.id);
      if (!okEv) return null;
      // no dog hero near Clem or her when the pings land (else the line reads as a taunt in a fight)
      const enemyNear = (ww, id, r) => {
        for (let s = 0; s < 6; s++) if (teamOf(s) !== teamOf(id) && ww.alive[s] && dist(pos(ww, s), pos(ww, id)) < r) return true;
        return false;
      };
      const r1 = new d.TakeRun({ ...spec, script: script.slice(0, 1) });
      r1.runTo(p1);
      const calm1 = !enemyNear(r1.match.world, 0, 8000) && !enemyNear(r1.match.world, heal.id, 8000);
      const r2 = new d.TakeRun({ ...spec, script });
      r2.runTo(p2);
      const calm2 = !enemyNear(r2.match.world, heal.id, 6000);
      if (!calm1) return null;
      // the gag reads only if the low ally really turns for home (her own side, west for the cats) and walks out of
      // the crowd: 3 m or more toward her fountain within 2 s, no dog hero within 5 m of her a second later
      const hx0 = run3.match.world.x[heal.id];
      run3.runTo(heal.tick + 60);
      const w3 = run3.match.world;
      const home = (teamOf(heal.id) === 0 ? hx0 - w3.x[heal.id] : w3.x[heal.id] - hx0) >= 3000 && w3.alive[heal.id] === 1;
      let crowd = 0;
      for (let s = 0; s < 6; s++) if (teamOf(s) !== teamOf(heal.id) && w3.alive[s] && dist(pos(w3, s), pos(w3, heal.id)) < 5000) crowd++;
      const alone = home && crowd === 0;
      const score = okBoth * 5 + 10 + (c.close ? 10 : 0) + (home ? 12 : 0) + (alone ? 6 : 0) + (calm2 ? 6 : 0);
      return { score, strict: c.close && alone && calm2, script, keys: { ping1: p1, ping2: p2, bark1: okEv.tick, bark2: heal.tick }, roles: { healer: heal.id, ok: okEv.id }, miss: [okBoth < 2 && 'both allies answer the first ping', !c.close && 'allies within 16 m', !home && 'the low ally walks home', home && !alone && 'no dog next to her'].filter(Boolean) };
    },
  },
  // S15-S17: Pudding bounces a crowd, the cats calm him, his escort brings down a dog tower.
  K: {
    hero: 'clem',
    make() {
      let land = null;
      const hops = [];
      let calm = -1;
      let tower = null;
      let escort = -1;
      let march = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          const P = d.RANGE.pudding;
          noteSpots(run);
          for (const e of ev) {
            if (e.type === 'pudding' && e.what === 'hop') land = t + 24;
            if (e.type === 'pudding' && e.what === 'calmed' && e.team === 0 && calm < 0) calm = t;
            if (e.type === 'pudding' && e.what === 'escort' && e.team === 0 && calm >= 0 && escort < 0) escort = t;
            if (e.type === 'tower' && e.destroyedBy === 0 && calm >= 0 && !tower && isTower(e.id) && w.alive[P] && w.team[P] === 0) {
              const [x, y] = spotOf(run, e.id);
              tower = { t, id: e.id, x, y, pud: dist(pos(w, P), { x, y }) };
            }
          }
          // the march: after he joins the cats' wave, the tick with the most cat heroes walking within 9 m of him
          if (escort >= 0 && !tower && w.alive[P] && w.team[P] === 0 && t - escort >= 10 && t - escort <= S(25)) {
            let n = 0;
            for (let s = 0; s < 3; s++) if (w.alive[s] && dist(pos(w, s), pos(w, P)) <= 9000) n++;
            let mins = 0;
            for (let id = d.RANGE.minions; id < d.RANGE.towers; id++) if (w.alive[id] && w.team[id] === 0 && dist(pos(w, id), pos(w, P)) <= 9000) mins++;
            const v = n * 3 + Math.min(mins, 6);
            if (!march || v > march.v) march = { t, v, n };
          }
          if (land !== null && t === land && calm < 0) {
            const n = [0, 0];
            for (let s = 0; s < 6; s++) if (w.alive[s] && dist(pos(w, s), pos(w, P)) <= 7000) n[teamOf(s)]++;
            hops.push({ t, n, x: w.x[P], y: w.y[P] });
          }
        },
        result() {
          if (calm < 0) return null;
          const before = hops.filter((h) => h.t <= calm && calm - h.t <= S(20));
          if (!before.length) return null;
          const hop = before.reduce((a, b) => (b.n[0] + b.n[1] + Math.min(b.n[0], b.n[1]) > a.n[0] + a.n[1] + Math.min(a.n[0], a.n[1]) ? b : a));
          const crowd = hop.n[0] + hop.n[1];
          const ok = crowd >= 4 && hop.n[0] > 0 && hop.n[1] > 0;
          const score = crowd * 3 + (tower ? 10 : 0) + (tower && tower.pud < 12000 ? 5 : 0) + (tower && tower.pud < 7000 ? 6 : 0) + (march ? march.n * 4 : 0);
          return {
            score,
            strict: ok && !!tower && tower.pud < 7000,
            keys: { bounce: hop.t, calm, ...(escort >= 0 ? { escort } : {}), ...(march ? { march: march.t } : {}), ...(tower ? { tower: tower.t } : {}) },
            roles: { pudding: d.RANGE.pudding, ...(tower ? { tower: tower.id } : {}) },
            points: { bounce: [hop.x, hop.y], ...(tower ? { tower: [tower.x, tower.y] } : {}) },
            miss: [!ok && `${crowd} heroes in the bounce`, !tower && 'escort takes a tower', tower && tower.pud >= 7000 && 'Pudding at the tower (7 m)'].filter(Boolean),
          };
        },
      };
    },
  },
  // S18-S20: the cats fall behind (COMEBACK), a cat tower falls, Clem is stunned and Purr-ifies.
  L: {
    hero: 'clem',
    trick: 'purrify',
    make() {
      let comeback = -1;
      let comebackDead = false;
      const towers = [];
      let stunAt = -1;
      let prevStun = false;
      const purrs = [];
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          noteSpots(run);
          const stunned = (w.buffs[0] & d.Buff.Stunned) !== 0;
          if (stunned && !prevStun) stunAt = t;
          for (const e of ev) {
            // the banner needs the centre band: Clem alive (a death recap holds it) and still alive 2 s later
            if (e.type === 'comeback' && e.team === 0 && comeback < 0) comeback = t;
            if (e.type === 'tower' && e.destroyedBy === 1 && isTower(e.id)) {
              const [x, y] = spotOf(run, e.id);
              towers.push({ t, id: e.id, x, y });
            }
            if (e.type === 'cast' && e.src === 0 && e.slot === 4 && (prevStun || stunned) && t - stunAt <= 30) purrs.push({ stun: stunAt, t });
          }
          prevStun = stunned;
          if (comeback >= 0 && t <= comeback + S(2) && !w.alive[0]) comebackDead = true;
        },
        result() {
          if (comeback < 0) return null;
          const tw = towers.filter((x) => x.t <= comeback).pop() ?? towers[0];
          // one story from one match: the HUD shot (stunned, then Purr-ify) after 3:00, with the cats already behind
          // (after a lost tower) and before the COMEBACK banner, so the clock and score on screen agree with the beat
          const inStory = purrs.filter((p) => p.t >= S(180) && p.t < comeback && (!tw || p.t > tw.t - S(40)));
          const purr = inStory.length ? inStory.reduce((a, b) => (Math.abs(b.t - comeback) < Math.abs(a.t - comeback) ? b : a)) : null;
          const score = 10 + (tw ? 5 : 0) + (purr ? 10 : 0) + (comebackDead ? 0 : 12) - (purr ? Math.abs(purr.t - comeback) / 1000 : 0);
          return {
            score,
            strict: !!tw && !!purr && !comebackDead,
            keys: { comeback, ...(tw ? { towerLost: tw.t } : {}), ...(purr ? { stun: purr.stun, purrify: purr.t } : {}) },
            roles: tw ? { tower: tw.id } : {},
            points: tw ? { tower: [tw.x, tw.y] } : {},
            miss: [!tw && 'a cat tower falls', !purr && 'stunned, then Purr-ify after 3:00, before the COMEBACK', comebackDead && 'Clem alive for the COMEBACK banner'].filter(Boolean),
          };
        },
      };
    },
  },
  // S21: Golden Hour, then two dog heroes knocked out, the second a "Shut down!".
  M: {
    hero: 'clem',
    make() {
      let gh = -1;
      const deaths = [];
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 3) gh = t;
            if (e.type === 'death' && e.id >= 3 && e.id < 6) deaths.push({ t, id: e.id, x: w.x[e.id], y: w.y[e.id] });
            if (e.type === 'shutdown' && teamOf(e.killer) === 0 && e.victim >= 3) {
              const prev = deaths.filter((x) => x.id !== e.victim && t - x.t <= 60 && t - x.t > 0).pop();
              const ghOk = gh >= 0 && t - gh <= 240;
              const score = 10 + (prev ? 8 : 0) + (ghOk ? 5 : 0) + (Math.abs(w.x[e.victim] - RIVER) < 15000 ? 2 : 0);
              if (!best || score > best.score) best = { score, strict: !!prev && ghOk, keys: { ...(gh >= 0 ? { gh } : {}), ...(prev ? { ko1: prev.t } : {}), ko2: t }, roles: { victim: e.victim, ...(prev ? { victim1: prev.id } : {}) }, miss: [!prev && 'two knockouts in 2 s', !ghOk && 'Golden Hour first'].filter(Boolean) };
            }
          }
        },
        result: () => best,
      };
    },
  },
  // S23-S26: the late brawl, Lambo's Belly Flop over the dog core as it falls, Victory!
  N: {
    hero: 'lambo',
    make() {
      let flop = null;
      const ults = [];
      let brawl = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          noteSpots(run);
          for (const e of ev) {
            if (e.type === 'cast' && e.src === 0 && e.slot === 2) flop = { t, x: w.x[0], y: w.y[0] };
            if (e.type === 'cast' && e.slot === 3 && e.src < 6) {
              ults.push(t);
              while (ults.length && t - ults[0] > S(3)) ults.shift();
              if (ults.length >= 4 && t >= S(330) && t <= S(450) && !brawl) {
                let n = 0;
                const c = pos(w, e.src);
                for (let s = 0; s < 6; s++) if (w.alive[s] && dist(pos(w, s), c) <= 10000) n++;
                if (n >= 6) brawl = { t: ults[0], x: c.x, y: c.y };
              }
            }
          }
        },
        result: (run) => {
          const r = run.ended;
          if (!r || r.winner !== 0 || r.reason !== 'core') return null;
          const end = r.ticks - 1;
          const core = CORE_IDS[1];
          const w = run.match.world;
          const [cx, cy] = spotOf(run, core);
          const near = dist(pos(w, 0), { x: cx, y: cy });
          const flopOk = flop && end - flop.t <= 60;
          // Belly Flop's landing right on the break: its cast 3-20 ticks before the core dies, Lambo at the core
          const onBreak = flop && end - flop.t >= 3 && end - flop.t <= 20;
          const close = near < 7000;
          const score = (flopOk ? 10 : 0) + (onBreak ? 12 : 0) + (close ? 6 : 0) + (near < 12000 ? 5 : 0) + (brawl ? 5 : 0) + (end >= S(330) && end <= S(510) ? 3 : 0);
          return {
            score,
            strict: !!onBreak && close && !!brawl,
            keys: { core: end, ...(flop ? { flop: flop.t } : {}), ...(brawl ? { brawl: brawl.t } : {}) },
            roles: { core },
            points: { core: [cx, cy], ...(brawl ? { brawl: [brawl.x, brawl.y] } : {}) },
            miss: [!onBreak && 'Belly Flop 3-20 ticks before the core falls', !close && 'Lambo within 7 m of the core', !flopOk && 'Belly Flop lands as the core falls', near >= 12000 && 'Lambo at the core', !brawl && '6-hero brawl with 4 ultimates in 3 s (5:30-7:30)'].filter(Boolean),
          };
        },
      };
    },
  },
};

// S17: a dog tower falls to the cats with the attackers in one frame: Pudding (calmed, ours), cat heroes and a wave
// within 12 m of it at the death tick.
TAKES.T = {
  hero: 'clem',
  make() {
    let best = null;
    return {
      tick(run, t, ev) {
        const w = run.match.world;
        noteSpots(run);
        for (const e of ev) {
          if (e.type !== 'tower' || e.destroyedBy !== 0 || !isTower(e.id)) continue;
          const [x, y] = spotOf(run, e.id);
          const at = { x, y };
          let heroes = 0;
          for (let s = 0; s < 3; s++) if (w.alive[s] && dist(pos(w, s), at) <= 12000) heroes++;
          let mins = 0;
          for (let id = d.RANGE.minions; id < d.RANGE.towers; id++) if (w.alive[id] && w.team[id] === 0 && dist(pos(w, id), at) <= 12000) mins++;
          const P = d.RANGE.pudding;
          const pud = w.alive[P] && w.team[P] === 0 && dist(pos(w, P), at) <= 12000;
          // the attackers stand on one side of the tower (they walked in up the lane), so one camera holds them all
          const score = (pud ? 10 : 0) + heroes * 4 + Math.min(mins, 6);
          if (!best || score > best.score) best = { score, strict: pud && heroes >= 2 && mins >= 2, keys: { tower: t }, roles: { tower: e.id, pudding: P }, points: { tower: [x, y] }, miss: [!pud && 'Pudding at the tower', heroes < 2 && `${heroes} cat heroes at the tower`, mins < 2 && 'a wave at the tower'].filter(Boolean) };
        }
      },
      result: () => best,
    };
  },
};

/** S23: one ultimate per cut (that hero is slot 0, but any slot's cast counts), in a fight, late game first. */
const ULTS = { U1: ['clem', 3], U2: ['sage', 3], U3: ['brutus', 3], U4: ['aviete', 2], U5: ['cacklejaw', 1], U6: ['bengas', 3] };
for (const [id, [hero, slot]] of Object.entries(ULTS)) {
  TAKES[id] = {
    hero,
    make() {
      let best = null;
      return {
        tick(run, t, ev) {
          const w = run.match.world;
          for (const e of ev) {
            if (e.type !== 'cast' || e.slot !== slot || e.src >= 6 || run.picks[e.src] !== hero) continue;
            let foes = 0;
            let mates = 0;
            for (let s = 0; s < 6; s++) {
              if (!w.alive[s] || s === e.src || dist(pos(w, s), pos(w, e.src)) > 9000) continue;
              if (teamOf(s) === teamOf(e.src)) mates++;
              else foes++;
            }
            const late = t >= S(330) && t <= S(450);
            const score = foes * 4 + mates * 2 + (late ? 6 : 0);
            if (!best || score > best.score) best = { score, strict: foes >= 2 && late, keys: { cast: t }, roles: { caster: e.src }, miss: [!late && '5:30-7:30', foes < 2 && 'two enemies near'].filter(Boolean) };
          }
        },
        result: () => best,
      };
    },
  };
}


/** Search seeds for every take whose human hero is `hero` (and the any-slot ones), in this process. */
function searchHero(hero, ids, from, n) {
  const mine = ids.filter((id) => TAKES[id].hero === hero);
  const found = {};
  const tricks = [...new Set(mine.map((id) => TAKES[id].trick ?? 'pounce'))];
  for (const trick of tricks) {
    const group = mine.filter((id) => (TAKES[id].trick ?? 'pounce') === trick);
    for (let seed = from; seed < from + n; seed++) {
      const open = group.filter((id) => !found[id]?.strict);
      if (!open.length) break;
      const spec = { seed, hero, trick, difficulty: 'normal' };
      const run = new d.TakeRun(spec);
      const st = open.map((id) => [id, TAKES[id].make()]);
      while (!run.ended) {
        const t = run.tick;
        const ev = run.stepOnce();
        for (const [, p] of st) p.tick(run, t, ev);
      }
      for (const [id, p] of st) {
        let r = p.result(run);
        if (!r) continue;
        if (TAKES[id].scripted) {
          let best = null;
          for (const c of r.cands) {
            const v = TAKES[id].verify(spec, c);
            if (v && (!best || v.score > best.score)) best = v;
            if (best?.strict) break;
          }
          r = best;
          if (!r) continue;
        }
        if (!found[id] || r.score > found[id].score) found[id] = { ...r, seed, hero, trick, picks: run.picks, length: run.ended.ticks };
      }
    }
  }
  return found;
}

/** Re-run a found take with its script to its last key tick + 10 s and record the hashes the browser must match. */
function seal(id, f) {
  const spec = { seed: f.seed, hero: f.hero, trick: f.trick, difficulty: 'normal', script: f.script ?? [] };
  const run = new d.TakeRun(spec);
  const last = Math.max(...Object.values(f.keys));
  const check = Math.min(f.length, last + S(10));
  run.runTo(check);
  return { id, ...spec, picks: f.picks, keys: f.keys, roles: f.roles, points: f.points ?? {}, strict: f.strict, miss: f.strict ? [] : f.miss, score: Math.round(f.score * 100) / 100, check: { tick: run.tick, eventHash: run.eventHash, stateHash: run.stateHash }, simVersion: d.SIM_VERSION, length: f.length };
}

/**
 * `--fixed`: seal the v2 takes of fixed-takes.mjs (seeds and key ticks from the moment scan) into takes.json, each
 * played to its last key + 300 ticks or the match end, with the hashes the browser capture must match.
 */
async function sealFixed() {
  const { FIXED } = await import('./fixed-takes.mjs');
  const ids = ONLY.length ? ONLY : Object.keys(FIXED);
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { takes: {} };
  const takes = { ...prev.takes };
  for (const id of ids) {
    const c = FIXED[id];
    if (!c) throw new Error(`no fixed take ${id}`);
    const spec = { seed: c.seed, hero: c.hero, trick: 'pounce', difficulty: 'normal', script: [] };
    const run = new d.TakeRun(spec);
    run.runTo(Math.max(...Object.values(c.keys)) + 300);
    takes[id] = { id, ...spec, picks: run.picks, keys: c.keys, roles: c.roles, points: c.points ?? {}, strict: true, miss: [], fixed: true, check: { tick: run.tick, eventHash: run.eventHash, stateHash: run.stateHash }, simVersion: d.SIM_VERSION, length: run.ended?.ticks ?? null };
    console.error(`  ${id}: seed ${c.seed} ${c.hero} picks ${run.picks.join(' ')} check ${run.tick} ${run.eventHash}`);
  }
  writeFileSync(OUT, `${JSON.stringify({ simVersion: d.SIM_VERSION, generated: 'tools/trailer/seed-search.mjs', takes }, null, 1)}\n`);
  console.error(`wrote ${OUT}`);
}

const ids = ONLY.length ? ONLY : Object.keys(TAKES);
if (hasFlag('--fixed')) await sealFixed();
else if (hasFlag('--worker')) {
  const hero = argValue('--hero');
  const found = searchHero(hero, ids, FROM, SEEDS);
  process.stdout.write(JSON.stringify(found));
} else {
  const procs = Math.max(1, Number(argValue('--procs') ?? cpus().length - 2));
  const t0 = Date.now();
  // one process per take (they search independently; the slowest takes no longer queue behind each other)
  const jobs = ids.slice();
  const results = {};
  let next = 0;
  async function runOne(id) {
    const hero = TAKES[id].hero;
    const args = [fileURLToPath(import.meta.url), '--worker', '--hero', hero, '--seeds', String(SEEDS), '--from', String(FROM), '--only', id];
    const out = await new Promise((res, rej) => {
      const p = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      p.stdout.on('data', (c) => (buf += c));
      p.on('close', (code) => (code === 0 ? res(buf) : rej(new Error(`${hero} exited ${code}`))));
    });
    Object.assign(results, JSON.parse(out));
    console.error(`  ${id} (${hero}): ${Object.keys(JSON.parse(out)).length ? 'found' : 'nothing'} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await Promise.all(Array.from({ length: Math.min(procs, jobs.length) }, async () => {
    while (next < jobs.length) await runOne(jobs[next++]);
  }));
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { takes: {} };
  const takes = { ...prev.takes };
  for (const id of ids) {
    if (!results[id]) {
      console.error(`  ${id}: NOT FOUND in seeds ${FROM}..${FROM + SEEDS - 1}`);
      continue;
    }
    takes[id] = seal(id, results[id]);
    const t = takes[id];
    console.error(`  ${id}: seed ${t.seed} ${t.hero}${t.strict ? '' : ` (relaxed: ${t.miss.join('; ')})`} keys ${JSON.stringify(t.keys)}`);
  }
  writeFileSync(OUT, `${JSON.stringify({ simVersion: d.SIM_VERSION, generated: 'tools/trailer/seed-search.mjs', takes }, null, 1)}\n`);
  console.error(`wrote ${OUT} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
