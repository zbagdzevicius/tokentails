#!/usr/bin/env node
/**
 * Scene finder (tools/clips/README.md): plays a take headless (clip-driver.ts bundled for Node, the same code the
 * browser harness runs) and lists the interesting moments with their ticks, so a clip spec can target them.
 *
 *   node tools/clips/scenes.mjs --mode skirmish --seeds 1-20 [--variant bots] [--hero clem] [--out scenes.json]
 *   node tools/clips/scenes.mjs --mode classic --seeds 7 --pretty
 *
 * Moment types: firstBlood, kill, multikill (2+ by one hero inside 10 s), ace (a whole team down), teamfight
 * (>= 5 heroes trading hero damage inside 4 s on 3v3, >= 6 on 5v5; `units` also counts minions in the fight),
 * towerDive (a hero kills under an enemy tower), tower (a structure falls), objective (Grizzlechop / Pudding),
 * cannon (pick, fire, kaboom, parry, block), boing (a Boing Bed launch), yarn (kick, STRIKE), clip (a viral move:
 * flop, bigdog, scream, frozen, zzz, footlong, dots), chaos (12 s windows packed with toy moments), ult (an ultimate cast), escape (a hero under 15 % HP after
 * enemy hero damage who lives 5 s more), comeback, shutdown, victory (the core falls).
 * Every moment: { type, tick, t (s), slots (heroes involved, the first is the focus), x, y (mm), score, note }.
 */
import { writeFileSync } from 'node:fs';
import { argValue, hasFlag } from '../lib/args.mjs';
import { importSim } from '../lib/sim-bundle.mjs';

let lib = null;
export async function driver() {
  lib ??= await importSim('tools/clips/clip-driver.ts');
  return lib;
}

/** Game modes as clip specs name them (src/ui/modeSelect/modes.ts). */
export const MODES = {
  blitz: { map: 'crossing', mutator: 'blitz', variants: ['bots'] },
  skirmish: { map: 'crossing', mutator: 'none', variants: ['bots', 'coop', 'pvp'] },
  classic: { map: 'hearthwood', mutator: 'none', variants: ['bots', 'pvp'] },
  practice: { map: 'crossing', mutator: 'none', variants: ['bots'] },
  // trailer 60: Cannon Chaos (sim v27, the Kibble Cannon every 20 s); coop lets a script drive team 0's three seats
  cannon: { map: 'crossing', mutator: 'cannon', variants: ['bots', 'coop'] },
};

/** A take object from a clip spec (mode, variant, seed, heroes). */
export function takeOf(spec) {
  const mode = MODES[spec.mode ?? 'skirmish'];
  if (!mode) throw new Error(`unknown mode ${spec.mode} (${Object.keys(MODES).join(', ')})`);
  const variant = spec.variant ?? 'bots';
  if (!mode.variants.includes(variant)) throw new Error(`mode ${spec.mode} has no variant ${variant}`);
  const per = mode.map === 'hearthwood' ? 5 : 3;
  const picks = [...(spec.teams?.[0] ?? []), ...Array(Math.max(0, per - (spec.teams?.[0]?.length ?? 0))).fill(null), ...(spec.teams?.[1] ?? [])].map((h) => h ?? null);
  return {
    seed: spec.seed >>> 0,
    map: mode.map,
    mutator: mode.mutator,
    variant,
    hero: spec.teams?.[0]?.[0] ?? spec.hero ?? 'clem',
    trick: spec.trick ?? 'pounce',
    difficulty: spec.difficulty ?? (variant === 'pvp' ? 'hard' : 'normal'),
    picks: picks.slice(0, per * 2),
    profile: spec.profile ?? 'normal',
    ...(spec.script ? { script: spec.script } : {}),
  };
}

const HZ = 30;
const WIN = { multi: 10 * HZ, fight: 4 * HZ, escape: 2 * HZ, live: 5 * HZ };

/** Play `take` to the end (or `maxTick`) and list its moments. */
export async function scan(take, { maxTick = 30 * 60 * 30 } = {}) {
  const { ClipRun, RANGE: _R } = await driver();
  const run = new ClipRun(take);
  const RANGE = lib.RANGE;
  const N = run.picks.length;
  const isHero = (id) => id >= 0 && id < N;
  const moments = [];
  const add = (m) => moments.push({ ...m, t: +(m.tick / HZ).toFixed(2) });
  const kills = []; // { tick, killer, victim }
  const hhits = []; // hero-vs-hero hits { tick, src, dst }
  const mhits = []; // hero-minion hits { tick, id }
  const towerHits = new Map(); // hero id -> last tick hit by a tower
  const lastHeroDmg = new Map(); // hero id -> last tick hurt by an enemy hero
  const low = new Map(); // hero id -> tick it went under 15 %
  let ended = null;
  let lastTeamfight = -1e9;
  const pos = (id) => {
    const w = run.match.world;
    return { x: w.x[id], y: w.y[id] };
  };
  while (!run.ended && run.tick < maxTick) {
    const tick = run.tick;
    const ev = run.stepOnce();
    const w = run.match.world;
    for (const e of ev) {
      switch (e.type) {
        case 'hit':
          if (isHero(e.src) && isHero(e.dst) && w.team[e.src] !== w.team[e.dst]) {
            hhits.push({ tick, src: e.src, dst: e.dst });
            lastHeroDmg.set(e.dst, tick);
          } else if (isHero(e.dst) && e.kind === 'tower') towerHits.set(e.dst, tick);
          else if (isHero(e.src) && !isHero(e.dst)) mhits.push({ tick, id: e.src });
          break;
        case 'death':
          if (isHero(e.id)) {
            kills.push({ tick, killer: e.killer, victim: e.id });
            const dive = isHero(e.killer) && tick - (towerHits.get(e.killer) ?? -1e9) < 2 * HZ;
            add({ type: dive ? 'towerDive' : 'kill', tick, slots: [e.killer, e.id].filter(isHero), ...pos(e.id), score: dive ? 7 : 3, note: `${run.picks[e.killer] ?? 'tower/minion'} took down ${run.picks[e.id]}` });
            // multikill: this killer's takedowns inside the window
            if (isHero(e.killer)) {
              const n = kills.filter((k) => k.killer === e.killer && tick - k.tick <= WIN.multi).length;
              if (n >= 2) add({ type: 'multikill', tick, slots: [e.killer], ...pos(e.killer), score: 5 + 3 * n, note: `${run.picks[e.killer]} x${n}` });
            }
            // ace: every hero of the victim's team down
            const team = w.team[e.id];
            let up = 0;
            for (let s = 0; s < N; s++) if (w.team[s] === team && w.alive[s] === 1) up++;
            if (up === 0) add({ type: 'ace', tick, slots: [e.killer, e.id].filter(isHero), ...pos(e.id), score: 12, note: `ace on team ${team}` });
          }
          break;
        case 'firstBlood':
          add({ type: 'firstBlood', tick, slots: [e.killer, e.victim].filter(isHero), ...pos(e.victim), score: 6, note: `${run.picks[e.killer]} draws first blood` });
          break;
        case 'tower':
          add({ type: 'tower', tick, slots: [], ...pos(e.id), score: 5, note: `structure ${e.id} falls to team ${e.destroyedBy}` });
          break;
        case 'objective':
          add({ type: 'objective', tick, slots: isHero(e.slot) ? [e.slot] : [], ...(isHero(e.slot) ? pos(e.slot) : { x: 0, y: 0 }), score: 7, note: `${e.kind} taken by team ${e.team}` });
          break;
        case 'pudding':
          if (e.what === 'calmed' || e.what === 'escort') add({ type: 'objective', tick, slots: [], x: 0, y: 0, score: 4, note: `pudding ${e.what}` });
          break;
        case 'cannonPick':
        case 'cannonFire':
        case 'kaboom':
        case 'cannonParry':
        case 'cannonBlock': {
          const id = e.type === 'kaboom' ? e.dst : e.id;
          const sc = { cannonPick: 2, cannonFire: 5, kaboom: 10, cannonParry: 10, cannonBlock: 9 }[e.type];
          add({ type: 'cannon', sub: e.type, tick, slots: [e.type === 'kaboom' ? e.src : e.id, ...(e.type === 'kaboom' ? [e.dst] : [])].filter(isHero), ...pos(id), score: sc, note: e.type });
          break;
        }
        case 'boing':
          add({ type: 'boing', tick, slots: [e.id], x: e.x, y: e.y, score: 6, note: `${run.picks[e.id]} bounces` });
          break;
        case 'yarnKick':
          add({ type: 'yarn', sub: 'kick', tick, slots: [e.id], ...pos(e.id), score: 4, note: `${run.picks[e.id]} kicks the yarn` });
          break;
        case 'yarnStrike':
          add({ type: 'yarn', sub: 'strike', tick, slots: [e.id], ...pos(e.id), score: 4 + 3 * e.n, note: `yarn hits ${e.n}` });
          break;
        case 'clip':
          add({ type: 'clip', sub: e.what, tick, slots: [e.id], ...pos(e.id), score: 8, note: `${run.picks[e.id]} ${e.what}` });
          break;
        case 'cast':
          if (e.slot === 3 && isHero(e.src)) add({ type: 'ult', tick, slots: [e.src], ...pos(e.src), score: 4, note: `${run.picks[e.src]} ultimate` });
          break;
        case 'comeback':
          add({ type: 'comeback', tick, slots: [], x: 0, y: 0, score: 6, note: `team ${e.team} comeback` });
          break;
        case 'shutdown':
          add({ type: 'shutdown', tick, slots: [e.killer, e.victim].filter(isHero), ...pos(e.victim), score: 6, note: 'shut down' });
          break;
      }
    }
    // teamfight: distinct heroes trading hero damage in the last 4 s
    while (hhits.length && tick - hhits[0].tick > WIN.fight) hhits.shift();
    while (mhits.length && tick - mhits[0].tick > WIN.fight) mhits.shift();
    if (tick - lastTeamfight > 6 * HZ && hhits.length >= 6) {
      const ids = new Set();
      for (const h of hhits) {
        ids.add(h.src);
        ids.add(h.dst);
      }
      // the largest group of engaged, living heroes standing within 14 m of one of them (one place, not two lanes)
      const live = [...ids].filter((id) => w.alive[id] === 1);
      let group = [];
      for (const a of live) {
        const g = live.filter((b) => Math.hypot(w.x[a] - w.x[b], w.y[a] - w.y[b]) <= 14000);
        if (g.length > group.length) group = g;
      }
      const need = N === 10 ? 6 : 4;
      const teams = new Set(group.map((id) => w.team[id]));
      if (group.length >= need && teams.size === 2) {
        lastTeamfight = tick;
        const cx = group.reduce((a, id) => a + w.x[id], 0) / group.length;
        const cy = group.reduce((a, id) => a + w.y[id], 0) / group.length;
        const minions = new Set(mhits.map((m) => m.id).filter((id) => Math.hypot(w.x[id] - cx, w.y[id] - cy) <= 16000)).size;
        let near = 0;
        for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.alive[id] === 1 && Math.hypot(w.x[id] - cx, w.y[id] - cy) <= 12000) near++;
        add({ type: 'teamfight', tick: Math.max(0, tick - WIN.fight / 2), slots: group, x: Math.round(cx), y: Math.round(cy), heroes: group.length, units: group.length + near, score: 4 + 2 * group.length + Math.min(4, near / 2) + minions * 0, note: `${group.length} heroes, ${near} minions` });
      }
    }
    // near-death escapes
    for (let s = 0; s < N; s++) {
      if (w.alive[s] !== 1) {
        low.delete(s);
        continue;
      }
      const under = w.hp[s] * 100 < w.maxHp[s] * 15;
      if (under && !low.has(s) && tick - (lastHeroDmg.get(s) ?? -1e9) < WIN.escape) low.set(s, tick);
      const at = low.get(s);
      if (at !== undefined && tick - at >= WIN.live) {
        low.delete(s);
        add({ type: 'escape', tick: at, slots: [s], ...pos(s), score: 7, note: `${run.picks[s]} escapes on low HP` });
      }
    }
  }
  if (run.ended) {
    ended = run.ended;
    // the losing core (or the last structure standing) is where the victory happens
    const w = run.match.world;
    let core = { x: 0, y: 0 };
    for (let id = RANGE.cores; id < RANGE.fountains; id++) if (w.team[id] === 1 - (ended.winner ?? 0)) core = { x: w.x[id], y: w.y[id] };
    add({ type: 'victory', tick: run.tick, slots: [], ...core, score: 10, note: `team ${ended.winner} wins (${ended.reason})` });
  }
  // toy chaos: 12 s windows with the most toy events (cannon shots and KABOOMs, Boing Bed launches, yarn kicks)
  const toys = moments.filter((m) => (m.type === 'cannon' && m.sub !== 'cannonPick') || m.type === 'boing' || m.type === 'yarn');
  const used = [];
  const wins = toys.map((m) => {
    const inWin = toys.filter((o) => o.tick >= m.tick && o.tick < m.tick + 12 * HZ);
    return { m, n: inWin.length, sc: inWin.reduce((a, o) => a + o.score, 0), kinds: new Set(inWin.map((o) => o.sub ?? o.type)).size };
  }).sort((a, b) => b.sc + 4 * b.kinds - (a.sc + 4 * a.kinds));
  for (const wv of wins) {
    if (used.some((t) => Math.abs(t - wv.m.tick) < 12 * HZ) || wv.n < 2) continue;
    used.push(wv.m.tick);
    add({ type: 'chaos', tick: wv.m.tick, slots: wv.m.slots, x: wv.m.x, y: wv.m.y, score: wv.sc + 4 * wv.kinds, note: `${wv.n} toy moments, ${wv.kinds} kinds` });
  }
  moments.sort((a, b) => a.tick - b.tick);
  return { take, picks: run.picks, endTick: run.tick, winner: ended?.winner ?? null, reason: ended?.reason ?? null, eventHash: run.eventHash, moments };
}

/** The event hash at `tick` (the browser capture checks it). */
export async function hashAt(take, tick) {
  const { ClipRun } = await driver();
  const run = new ClipRun(take);
  run.runTo(tick);
  return run.eventHash;
}

/** The best moment of `type` in a scan (highest score, then earliest), or null. */
export function best(scanRes, type, { after = 0, before = Infinity, pick = 0 } = {}) {
  const list = scanRes.moments.filter((m) => (type === 'any' ? m.type !== 'victory' : m.type === type || m.sub === type) && m.tick >= after && m.tick <= before);
  list.sort((a, b) => b.score - a.score || a.tick - b.tick);
  return list[pick] ?? null;
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let x = a; x <= (b ?? a); x++) out.push(x);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = argValue('--mode') ?? 'skirmish';
  const seeds = parseSeeds(argValue('--seeds') ?? '1');
  const out = argValue('--out');
  const res = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    const take = takeOf({ mode, seed, variant: argValue('--variant'), hero: argValue('--hero'), difficulty: argValue('--difficulty') });
    const r = await scan(take);
    const counts = {};
    for (const m of r.moments) counts[m.type] = (counts[m.type] ?? 0) + 1;
    console.error(`seed ${seed} ${mode}: ${r.endTick} ticks (${(r.endTick / HZ / 60).toFixed(1)} min) winner ${r.winner} ${JSON.stringify(counts)} [${Date.now() - t0} ms]`);
    res.push(r);
  }
  const json = JSON.stringify(res, null, hasFlag('--pretty') ? 2 : 0);
  if (out) writeFileSync(out, json + '\n');
  else if (hasFlag('--pretty')) console.log(json);
}
