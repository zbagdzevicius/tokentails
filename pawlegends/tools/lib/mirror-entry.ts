/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §7, side-bias hunt): mirrored Hearthwood scenarios, bundled for Node by
 * tools/hearth-mirror.mjs.
 *
 * - mirrorProbe: one 5v5 PvP match whose two teams are exact mirrors: the same five heroes and tricks in the same slots,
 *   and each pilot pair (slot k, slot k + 5) shares one RNG stream. On a point-reflected map a fair sim keeps team 1 the
 *   `reflect` of team 0 until something resolves in an order (who goes first in a tick). The probe steps the match and
 *   reports the first tick and field where hero k and hero k + 5 (or a structure pair) stop being mirror images, with
 *   the pilots' commands of that tick.
 * - grizzRun: one normal symmetry-pair match with the Grizzlechop takes, kills per team and the winner, for the stats.
 */
import { Op, type Command, type HeroId, type MatchConfig, type TrickId } from '../../src/sim/api';
import { createMatch, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { createMem } from '../../src/sim/bots/mem';
import { createPingerMem } from '../../src/sim/bots/pinger';
import type { PlayerBot } from '../../src/sim/bots/index';
import { Rng } from '../../src/sim/rng';
import { ANGLE_STEPS } from '../../src/sim/fixed';
import { G, Kind, MG, RANGE, type World } from '../../src/sim/world';
import { MAP } from '../../src/data/map';

const MAPID = 'hearthwood' as const;
/**
 * The team mirror of Hearthwood is the river mirror (x, y) → (W − y, W − x): it swaps the bases and keeps every lane
 * (Gutterway onto Gutterway) and each objective pit in place. (The point reflection swaps Grizzlechop with the Great
 * Pudding and Fenceline with Gutterway, and roles are physical, MAP-5V5.md D1.) So team 1's x mirrors team 0's y.
 */
const PARTNER: Record<string, string> = { x: 'y', y: 'x', moveX: 'moveY', moveY: 'moveX', botX: 'botY', botY: 'botX', botOrdX: 'botOrdY', botOrdY: 'botOrdX', fmX: 'fmY', fmY: 'fmX' };
const ANGLE = new Set(['facing']);
/** Fields holding an entity id (compared through the mirror map). */
const IDS = new Set(['target', 'lastHitBy', 'botFoe', 'botId', 'botOrdId']);
/** Fields that never mirror by construction (render / bookkeeping) or are compared elsewhere. */
const SKIP = new Set(['moveCarry']);

/** The entity standing at `id`'s reflected spot with its kind and the other team (−1 none); heroes pair k ↔ k ± 5. */
function mirrorId(w: World, id: number): number {
  if (id < 0) return id;
  const half = (RANGE.minions - RANGE.heroes) >> 1;
  if (id >= RANGE.heroes && id < RANGE.minions) return id < half ? id + half : id - half;
  const W = MAP.width;
  for (let j = 0; j < RANGE.end; j++) {
    if (w.kind[j] !== w.kind[id] || w.alive[j] !== w.alive[id]) continue;
    if (w.x[j] === W - w.y[id] && w.y[j] === W - w.x[id] && (w.team[id] > 1 ? w.team[j] === w.team[id] : w.team[j] === 1 - w.team[id])) return j;
  }
  return -2;
}

const TOWER_PAIR: number[] = [];
/** Fields compared on structures (the rest are hero-only or unused there). */
const STRUCT_FIELDS = new Set(['alive', 'hp', 'maxHp', 'shield', 'target', 'buffs']);

type Arr = Int32Array | Uint8Array | Uint16Array | Uint32Array | Int16Array | Int8Array;

/** Per-entity typed arrays of the world (length RANGE.end, or a whole multiple of it). */
function entityFields(w: World): [string, Arr, number][] {
  const out: [string, Arr, number][] = [];
  for (const [k, v] of Object.entries(w)) {
    if (!ArrayBuffer.isView(v) || v instanceof DataView || SKIP.has(k)) continue;
    const a = v as Arr;
    // Per-entity arrays only (cooldowns: COOLDOWN_SLOTS per entity); other multiples are laid out differently.
    if (a.length === RANGE.end || (k === 'cooldowns' && a.length % RANGE.end === 0)) out.push([k, a, a.length / RANGE.end]);
  }
  return out;
}

export interface Divergence {
  tick: number;
  field: string;
  a: number;
  b: number;
  va: number;
  vb: number;
  /** Mirrored expectation of vb (from va). */
  want: number;
  cmds: string[];
}

function mirrorVal(w: World, field: string, v: number): number {
  const W = MAP.width;
  if (PARTNER[field]) return W - v;
  if (ANGLE.has(field)) return (((3 * ANGLE_STEPS) >> 2) - v + ANGLE_STEPS) % ANGLE_STEPS;
  if (IDS.has(field)) return mirrorId(w, v);
  // Bush indices differ across the mirror; only in-or-out must agree (compared as a sign).
  if (field === 'bush') return v < 0 ? -1 : 0;
  // Per-team bit masks (bit t = team t): the mirror swaps the teams.
  if (field === 'seen') return (v & ~3) | ((v & 1) << 1) | ((v >> 1) & 1);
  return v;
}

/** First mismatch between hero pairs and structure pairs, or null. */
function compare(w: World, fields: [string, Arr, number][], tick: number, cmds: string[]): Divergence | null {
  const half = (RANGE.minions - RANGE.heroes) >> 1;
  const nTowers = (RANGE.cores - RANGE.towers) >> 1;
  const pairs: [number, number][] = [];
  for (let k = 0; k < half; k++) pairs.push([RANGE.heroes + k, RANGE.heroes + k + half]);
  for (let k = 0; k < nTowers; k++) pairs.push([RANGE.towers + k, TOWER_PAIR[k] ?? RANGE.towers + nTowers + k]);
  pairs.push([RANGE.cores, RANGE.cores + 1]);
  for (const [a, b] of pairs) {
    for (const [name, arr, per] of fields) {
      // A position field of b mirrors its partner field of a (x ↔ y).
      const src = PARTNER[name] ? (fields.find((f) => f[0] === PARTNER[name])?.[1] ?? arr) : arr;
      for (let s = 0; s < per; s++) {
        const va = src[a * per + s];
        const vb = name === 'bush' ? (arr[b * per + s] < 0 ? -1 : 0) : arr[b * per + s];
        if (name === 'team' || (a >= RANGE.minions && !STRUCT_FIELDS.has(name))) continue;
        // Ids into other arrays (per-hero slots of a per-hero table) are skipped unless named.
        const want = mirrorVal(w, name, va);
        if (want === -2) continue;
        if (vb !== want) return { tick, field: per > 1 ? `${name}[${s}]` : name, a, b, va, vb, want, cmds };
      }
    }
  }
  // Minions, camp monsters, the Pudding: each living unit has a partner on the mirrored spot with the same HP.
  for (let id = RANGE.minions; id < RANGE.end; id++) {
    if (id >= RANGE.towers && id < RANGE.camps) continue;
    if (w.alive[id] === 0 || w.kind[id] === Kind.None) continue;
    if (w.team[id] === 1) continue;
    const j = mirrorId(w, id);
    if (j < 0) {
      let nb = -1;
      let nd = 0;
      const W = MAP.width;
      for (let k = 0; k < RANGE.end; k++) {
        if (w.kind[k] !== w.kind[id] || w.alive[k] === 0 || k === id || (w.team[id] < 2 && w.team[k] === w.team[id])) continue;
        const d = (w.x[k] - (W - w.y[id])) ** 2 + (w.y[k] - (W - w.x[id])) ** 2;
        if (nb < 0 || d < nd) {
          nb = k;
          nd = d;
        }
      }
      const desc = (k: number) => `#${k} t${w.team[k]} (${w.x[k]}, ${w.y[k]}) hp ${w.hp[k]} st ${w.state[k]} tgt ${w.target[k]} wp ${w.waypoint[k]} hit ${w.lastHitBy[k]}`;
      return { tick, field: `unit ${desc(id)} has no mirror; nearest ${nb >= 0 ? desc(nb) : '-'}`, a: id, b: nb, va: 0, vb: 0, want: 0, cmds };
    }
    if (j !== id && w.hp[j] !== w.hp[id]) return { tick, field: 'unit hp', a: id, b: j, va: w.hp[id], vb: w.hp[j], want: w.hp[id], cmds };
  }
  return null;
}

function mirrorCmd(c: Command): string {
  return JSON.stringify(c);
}

/** Pilots for slots 0..9 where slot k and slot k + 5 share one RNG fork (and so take the same random draws). */
function mirroredPilots(seed: number): PlayerBot[] {
  const out: PlayerBot[] = [];
  for (let s = 0; s < 10; s++) out.push({ profile: 'normal', slot: s, mem: createMem(), rng: new Rng(seed >>> 0).fork(`mirror:s${s % 5}`), pings: createPingerMem() });
  return out;
}

export interface MirrorReport {
  seed: number;
  heroes: string[];
  first: Divergence | null;
  /** Ticks stepped. */
  ticks: number;
  winner: number;
  /** Grizzlechop takes per team. */
  takes?: [number, number];
  /** Lane fronts (own most advanced minion's progress, x + y from the own base) at FRONT_TICKS: [tick][lane][team]. */
  fronts?: number[];
}

const FRONT_TICKS = [1500, 2400, 3300, 3600, 4500, 5400];

/** A fully mirrored match: `heroes` (5) on both teams in the same slots, `tricks` likewise. Stops at the first divergence. */
export function mirrorProbe(seed: number, heroes: HeroId[], tricks: TrickId[], maxTicks = 30 * 60 * 16, stop = true, idle = false): MirrorReport {
  const picks = [...heroes, ...heroes];
  const tr = [...tricks, ...tricks];
  const config: MatchConfig = { seed, picks, tricks: tr, difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID };
  const m = createMatch(config) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const fields = entityFields(m.world);
  // Team 0's structure k and its river-mirror partner (the Hearth Guards swap places under the mirror).
  TOWER_PAIR.length = 0;
  for (let k = 0; k < (RANGE.cores - RANGE.towers) >> 1; k++) TOWER_PAIR.push(mirrorId(m.world, RANGE.towers + k));
  let first: Divergence | null = null;
  const takes: [number, number] = [0, 0];
  const fronts: number[] = new Array(FRONT_TICKS.length * 6).fill(0);
  let t = 0;
  while (!result(m) && t < maxTicks) {
    const out = idle ? pilots.map(() => [] as Command[]) : pilots.map((p) => playerBotCommands(m, p));
    const cmds = out.map((c, s) => (c.length ? `s${s}:${c.map(mirrorCmd).join('+')}` : '')).filter(Boolean);
    step(m, out[0], out);
    t++;
    if (!first) first = compare(m.world, fields, m.world.globals[G.Tick], cmds);
    for (const e of m.events) if (e.type === 'objective' && e.kind === 'grizzlechop') takes[e.team]++;
    const tk = m.world.globals[G.Tick];
    const at = FRONT_TICKS.indexOf(tk);
    if (at >= 0) {
      const w = m.world;
      for (let lane = 0; lane < 3; lane++) {
        for (let team = 0; team < 2; team++) {
          let best = 0;
          for (let id = RANGE.minions; id < RANGE.towers; id++) {
            if (w.alive[id] === 0 || w.team[id] !== team || w.lane[id] !== lane) continue;
            const p = team === 0 ? w.x[id] + w.y[id] : 2 * MAP.width - w.x[id] - w.y[id];
            if (p > best) best = p;
          }
          fronts[(at * 3 + lane) * 2 + team] = best;
        }
      }
    }
    if (first && stop) break;
  }
  return { seed, heroes, first, ticks: t, winner: result(m)?.winner ?? -1, takes, fronts };
}

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

/** A random 5-hero line-up and tricks from `seed` (both species mixed). */
export function mirrorLineup(seed: number): { heroes: HeroId[]; tricks: TrickId[] } {
  const r = new Rng(seed).fork('mirror-lineup');
  const pool = [...CAT_IDS, ...DOG_IDS];
  const heroes: HeroId[] = [];
  for (let k = 0; k < 5; k++) heroes.push(pool.splice(r.int(pool.length), 1)[0]);
  return { heroes, tricks: heroes.map(() => TRICKS[r.int(TRICKS.length)]) };
}

export interface GrizzRow {
  seed: number;
  catsLeft: boolean;
  winner: number;
  ticks: number;
  /** Grizzlechop takes: [team, tick]. */
  takes: [number, number][];
  /** Hero kills per team (credited to the killer's team) before 9:00 and overall. */
  kills9: [number, number];
  /** Hero deaths within 15 m of the pit, per dying team. */
  pitDeaths: [number, number];
  /** Tick of the first tower kill per team (−1 none). */
  firstTower: [number, number];
  /** Fish per team at 9:00. */
  fish9: [number, number];
  /** Grizzlechop's damage dealt to each team's heroes, and each team's damage to him. */
  bossDmg: [number, number];
  dmgToBoss: [number, number];
  /** Boss bites started on even / odd ticks, per bitten team: [t0 even, t0 odd, t1 even, t1 odd]. */
  bites: [number, number, number, number];
}

/** One symmetry-pair match (as tools/lib/hearth-entry.ts hearthSymmetryPair) with Grizzlechop stats. */
export function grizzRun(seed: number, catsLeft: boolean): GrizzRow {
  const r = new Rng(seed).fork('hearth-symmetry');
  const draw = (pool: readonly HeroId[]): HeroId[] => {
    const left = pool.slice();
    const out: HeroId[] = [];
    for (let k = 0; k < 5; k++) out.push(left.splice(r.int(left.length), 1)[0]);
    return out;
  };
  const cats = draw(CAT_IDS);
  const dogs = draw(DOG_IDS);
  const catTricks = [0, 1, 2, 3, 4].map(() => TRICKS[r.int(TRICKS.length)]);
  const dogTricks = [0, 1, 2, 3, 4].map(() => TRICKS[r.int(TRICKS.length)]);
  const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const seats = slots.map((slot) => {
    const cat = slot < 5 === catsLeft;
    return { slot, hero: (cat ? cats : dogs)[slot % 5], trick: (cat ? catTricks : dogTricks)[slot % 5] };
  });
  const { picks, tricks } = fillPicksParty(seed, seats, MAPID);
  const m = createMatch({ seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots: PlayerBot[] = slots.map((s) => ({ profile: 'normal', slot: s, mem: createMem(), rng: new Rng(seed >>> 0).fork(s === 0 ? 'player-bot:normal' : `player-bot:normal:s${s}`), pings: createPingerMem() }));
  const row: GrizzRow = { seed, catsLeft, winner: -1, ticks: 0, takes: [], kills9: [0, 0], pitDeaths: [0, 0], firstTower: [-1, -1], fish9: [0, 0], bossDmg: [0, 0], dmgToBoss: [0, 0], bites: [0, 0, 0, 0] };
  const w = m.world;
  let boss = -1;
  for (let id = RANGE.camps; id < RANGE.pudding; id++) if (w.sub[id] === 4) boss = id;
  let prevWind = 0;
  const PX = 92000;
  const PY = 36000;
  while (!result(m)) {
    const out = pilots.map((p) => playerBotCommands(m, p));
    step(m, out[0], out);
    const tick = w.globals[G.Tick];
    if (boss >= 0) {
      const wd = w.windup[boss];
      const t = w.target[boss];
      if (wd > 0 && prevWind === 0 && t >= 0 && t < RANGE.minions) row.bites[w.team[t] * 2 + ((tick - 1) & 1)]++;
      prevWind = wd;
    }
    for (const e of m.events) {
      if (e.type === 'hit' && boss >= 0) {
        if (e.src === boss && e.dst < RANGE.minions) row.bossDmg[w.team[e.dst]] += e.amount;
        if (e.dst === boss && e.src >= 0 && e.src < RANGE.minions) row.dmgToBoss[w.team[e.src]] += e.amount;
      }
      if (e.type === 'objective' && e.kind === 'grizzlechop') row.takes.push([e.team, e.tick]);
      if (e.type === 'death' && (e as { id: number }).id < RANGE.minions) {
        const id = (e as { id: number }).id;
        const dt = w.team[id];
        if (tick < 16200) row.kills9[1 - dt]++;
        const dx = w.x[id] - PX;
        const dy = w.y[id] - PY;
        if (dx * dx + dy * dy <= 15000 * 15000) row.pitDeaths[dt]++;
      }
    }
    if (tick === 16200) {
      for (let h = RANGE.heroes; h < RANGE.minions; h++) row.fish9[w.team[h]] += w.fishTotal[h];
    }
    for (let k = 0; k < 2; k++) {
      if (row.firstTower[k] >= 0) continue;
      const nT = (RANGE.cores - RANGE.towers) >> 1;
      for (let j = 0; j < nT; j++) if (w.alive[RANGE.towers + (1 - k) * nT + j] === 0 && w.kind[RANGE.towers + (1 - k) * nT + j] === Kind.Tower) row.firstTower[k] = tick;
    }
  }
  const res = result(m)!;
  row.winner = res.winner;
  row.ticks = res.ticks;
  void Op;
  return row;
}

export interface DuelReport {
  seed: number;
  heroes: string[];
  /** Team that took Grizzlechop first (−1 nobody within the window) and when. */
  taker: number;
  takeTick: number;
  /** Hero deaths per team in the window. */
  deaths: [number, number];
  /** First divergence after the heroes were placed (null: none in the window). */
  first: Divergence | null;
  /** Were the heroes exact mirrors when placed? */
  placed: boolean;
}

/**
 * The pit duel: a mirrored match where nobody moves until 1:58, then team 0's five heroes stand by their Frog Pond
 * (beside Grizzlechop's pit) and team 1's five on the river-mirrored spots, full HP, and the pilots (pair-shared RNG,
 * fresh memory) play `window` ticks. Any rule that favours a team shows up as a skew in who takes him.
 */
export function pitDuel(seed: number, heroes: HeroId[], tricks: TrickId[], window = 30 * 60): DuelReport {
  const picks = [...heroes, ...heroes];
  const tr = [...tricks, ...tricks];
  const m = createMatch({ seed, picks, tricks: tr, difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const w = m.world;
  const fields = entityFields(w);
  TOWER_PAIR.length = 0;
  for (let k = 0; k < (RANGE.cores - RANGE.towers) >> 1; k++) TOWER_PAIR.push(mirrorId(w, RANGE.towers + k));
  const none: Command[][] = Array.from({ length: 10 }, () => []);
  const at = 3540;
  while (w.globals[G.Tick] < at) step(m, none[0], none);
  const W = MAP.width;
  // Team 0 at its Frog Pond side of the pit, in a small cross; team 1 on the mirrored spots.
  const SPOTS = [
    [80000, 26000],
    [82000, 24000],
    [78000, 28000],
    [80000, 22000],
    [76000, 26000],
  ];
  for (let k = 0; k < 5; k++) {
    for (const [id, x, y] of [
      [RANGE.heroes + k, SPOTS[k][0], SPOTS[k][1]],
      [RANGE.heroes + k + 5, W - SPOTS[k][1], W - SPOTS[k][0]],
    ]) {
      w.x[id] = x;
      w.y[id] = y;
      w.moveX[id] = x;
      w.moveY[id] = y;
      w.moveCarry[id] = 0;
      w.target[id] = -1;
      w.hp[id] = w.maxHp[id];
    }
    w.facing[RANGE.heroes + k] = 0;
    w.facing[RANGE.heroes + k + 5] = (3 * ANGLE_STEPS) >> 2;
  }
  // Only heroes are compared here (lanes far away diverge on their own).
  const heroFields = fields;
  const placedDiv = compareHeroes(w, heroFields, w.globals[G.Tick]);
  const pilots: PlayerBot[] = [];
  for (let s = 0; s < 10; s++) pilots.push({ profile: 'normal', slot: s, mem: createMem(), rng: new Rng(seed >>> 0).fork(`duel:s${s % 5}`), pings: createPingerMem() });
  const rep: DuelReport = { seed, heroes, taker: -1, takeTick: -1, deaths: [0, 0], first: null, placed: placedDiv === null };
  const end = at + window;
  while (!result(m) && w.globals[G.Tick] < end) {
    const out = pilots.map((p) => playerBotCommands(m, p));
    const cmds = out.map((c, s) => (c.length ? `s${s}:${c.map(mirrorCmd).join('+')}` : '')).filter(Boolean);
    step(m, out[0], out);
    for (const e of m.events) {
      if (e.type === 'objective' && e.kind === 'grizzlechop' && rep.taker < 0) {
        rep.taker = e.team;
        rep.takeTick = e.tick;
      }
      if (e.type === 'death' && e.id < RANGE.minions) rep.deaths[w.team[e.id]]++;
    }
    if (!rep.first) rep.first = compareHeroes(w, heroFields, w.globals[G.Tick], cmds);
  }
  return rep;
}

/** Hero pairs only (positions river-mirrored). */
function compareHeroes(w: World, fields: [string, Arr, number][], tick: number, cmds: string[] = []): Divergence | null {
  const half = (RANGE.minions - RANGE.heroes) >> 1;
  for (let k = 0; k < half; k++) {
    const a = RANGE.heroes + k;
    const b = a + half;
    for (const [name, arr, per] of fields) {
      if (name === 'team' || IDS.has(name) || name.startsWith('bot') || name === 'hurtTick') continue;
      const src = PARTNER[name] ? (fields.find((f) => f[0] === PARTNER[name])?.[1] ?? arr) : arr;
      for (let s = 0; s < per; s++) {
        const va = src[a * per + s];
        const vb = name === 'bush' ? (arr[b * per + s] < 0 ? -1 : 0) : arr[b * per + s];
        const want = mirrorVal(w, name, va);
        if (vb !== want) return { tick, field: per > 1 ? `${name}[${s}]` : name, a, b, va, vb, want, cmds };
      }
    }
  }
  return null;
}

/** Debug: the events of ticks [from, to] of a mirrored match (heroes `ids` positions each tick). */
export function mirrorTrace(seed: number, from: number, to: number, ids: number[]): string[] {
  const { heroes, tricks } = mirrorLineup(seed);
  const m = createMatch({ seed, picks: [...heroes, ...heroes], tricks: [...tricks, ...tricks], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const w = m.world;
  const out: string[] = [];
  while (w.globals[G.Tick] <= to) {
    const cmds = pilots.map((p) => playerBotCommands(m, p));
    const tick = w.globals[G.Tick];
    step(m, cmds[0], cmds);
    if (tick < from) continue;
    const pos = ids.map((id) => `${id}:(${w.x[id]},${w.y[id]}) hp${w.hp[id]} st${w.state[id]} tg${w.target[id]} wu${w.windup[id]} at${w.attackTimer[id]}`).join(' | ');
    out.push(`t${tick} ${pos}`);
    cmds.forEach((c, s) => c.length && out.push(`   cmd s${s} ${JSON.stringify(c)}`));
    for (const e of m.events) if (e.type !== 'xp' && e.type !== 'fish') out.push(`   ev ${JSON.stringify(e)}`);
  }
  return out;
}

/** Debug: every 15 ticks to `to`, per lane: both fronts, living minions a team, and the heroes within 15 m of the fronts. */
export function frontTrace(seed: number, to: number): string[] {
  const { heroes, tricks } = mirrorLineup(seed);
  const m = createMatch({ seed, picks: [...heroes, ...heroes], tricks: [...tricks, ...tricks], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const w = m.world;
  const out: string[] = [];
  while (w.globals[G.Tick] <= to) {
    const cmds = pilots.map((p) => playerBotCommands(m, p));
    step(m, cmds[0], cmds);
    const tick = w.globals[G.Tick];
    if (tick % 15 !== 0) continue;
    const parts: string[] = [];
    for (let lane = 0; lane < 3; lane++) {
      const f = [0, 0];
      const n = [0, 0];
      const hp = [0, 0];
      for (let id = RANGE.minions; id < RANGE.towers; id++) {
        if (w.alive[id] === 0 || w.lane[id] !== lane) continue;
        const t = w.team[id];
        n[t]++;
        hp[t] += w.hp[id];
        const p = t === 0 ? w.x[id] + w.y[id] : 2 * MAP.width - w.x[id] - w.y[id];
        if (p > f[t]) f[t] = p;
      }
      parts.push(`L${lane} f${f[0]}/${f[1]} n${n[0]}/${n[1]} hp${hp[0]}/${hp[1]}`);
    }
    const hs: string[] = [];
    for (let h = 0; h < 10; h++) hs.push(`${h}:${w.alive[h] ? w.hp[h] : 'x'}@${w.x[h] >> 10},${w.y[h] >> 10}`);
    out.push(`t${tick} ${parts.join(' | ')} || ${hs.join(' ')}`);
  }
  return out;
}

/**
 * Bias trace: every 15 ticks to `to`, team 0 minus team 1 of: per lane the minions' HP sum, the heroes' HP sum, XP sum
 * and Fish sum, and hero deaths. Averaged over seeds by the caller, the first sample that drifts from 0 is where a rule
 * favours a side (the per-seed order effects cancel out across seeds).
 */
export function biasTrace(seed: number, to: number): number[][] {
  const { heroes, tricks } = mirrorLineup(seed);
  const m = createMatch({ seed, picks: [...heroes, ...heroes], tricks: [...tricks, ...tricks], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const w = m.world;
  const out: number[][] = [];
  const deaths = [0, 0];
  while (w.globals[G.Tick] < to) {
    const cmds = pilots.map((p) => playerBotCommands(m, p));
    step(m, cmds[0], cmds);
    for (const e of m.events) if (e.type === 'death' && e.id < RANGE.minions) deaths[w.team[e.id]]++;
    const tick = w.globals[G.Tick];
    if (tick % 15 !== 0) continue;
    const row: number[] = [];
    for (let lane = 0; lane < 3; lane++) {
      let d = 0;
      for (let id = RANGE.minions; id < RANGE.towers; id++) if (w.alive[id] === 1 && w.lane[id] === lane) d += w.team[id] === 0 ? w.hp[id] : -w.hp[id];
      row.push(d);
    }
    let hp = 0;
    let xp = 0;
    let fish = 0;
    for (let k = 0; k < 5; k++) {
      hp += (w.alive[k] ? w.hp[k] : 0) - (w.alive[k + 5] ? w.hp[k + 5] : 0);
      xp += w.xp[k] - w.xp[k + 5];
      fish += w.fishTotal[k] - w.fishTotal[k + 5];
    }
    row.push(hp, xp, fish, deaths[0] - deaths[1]);
    // Per role (MG.Role of slot k, the same for both teams): HP difference.
    const byRole = [0, 0, 0, 0, 0];
    for (let k = 0; k < 5; k++) byRole[w.mg[MG.Role + k]] += (w.alive[k] ? w.hp[k] : 0) - (w.alive[k + 5] ? w.hp[k + 5] : 0);
    row.push(...byRole);
    out.push(row);
  }
  return out;
}

/** Debug: for slot pair (k, k + 5), the ticks to `to` where their HP differs first, with that tick's hits on them. */
export function pairTrace(seed: number, k: number, to: number): string[] {
  const { heroes, tricks } = mirrorLineup(seed);
  const m = createMatch({ seed, picks: [...heroes, ...heroes], tricks: [...tricks, ...tricks], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const w = m.world;
  const out: string[] = [`roles ${Array.from(w.mg.subarray(MG.Role, MG.Role + 10)).join(',')} heroes ${heroes.join(',')}`];
  const a = k;
  const b = k + 5;
  const W = MAP.width;
  let shown = 0;
  while (w.globals[G.Tick] < to && shown < 4000) {
    const cmds = pilots.map((p) => playerBotCommands(m, p));
    const tick = w.globals[G.Tick];
    step(m, cmds[0], cmds);
    const hits = m.events.filter((e) => ('dst' in e && (e.dst === a || e.dst === b)) || ('src' in e && (e.src === a || e.src === b)) || ('id' in e && (e.id === a || e.id === b)));
    const posOk = w.x[b] === W - w.y[a] && w.y[b] === W - w.x[a];
    if (w.hp[a] !== w.hp[b] || !posOk || cmds[a].length || cmds[b].length || hits.length) {
      if (w.hp[a] !== w.hp[b] || !posOk) shown++;
      out.push(`t${tick} a(${w.x[a]},${w.y[a]}) hp${w.hp[a]} tg${w.target[a]} st${w.state[a]} | b(${w.x[b]},${w.y[b]}) mirror(${W - w.y[a]},${W - w.x[a]}) hp${w.hp[b]} tg${w.target[b]} st${w.state[b]}`);
      if (cmds[a].length) out.push(`   cmd a ${JSON.stringify(cmds[a])}`);
      if (cmds[b].length) out.push(`   cmd b ${JSON.stringify(cmds[b])}`);
      for (const e of hits) out.push(`   ev ${JSON.stringify(e)} src(${e.type === 'hit' || e.type === 'cast' ? `${w.x[e.src]},${w.y[e.src]} k${w.kind[e.src]} sub${w.sub[e.src]}` : ''})`);
    }
  }
  return out;
}

/**
 * For every slot pair: the first tick its HP stops mirroring (or −1 by `to`), which side then has less HP 3 s later
 * (−1 team 0 worse, 1 team 1 worse, 0 even), and that tick's hits on the pair (attacker kind and sub).
 */
export function hpSplits(seed: number, to: number): { k: number; role: number; tick: number; worse: number; hits: string }[] {
  const { heroes, tricks } = mirrorLineup(seed);
  const m = createMatch({ seed, picks: [...heroes, ...heroes], tricks: [...tricks, ...tricks], difficulty: 'hard', humans: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], mode: 'pvp', map: MAPID }) as MatchHandle;
  const pilots = mirroredPilots(seed);
  const w = m.world;
  const res = [0, 1, 2, 3, 4].map((k) => ({ k, role: w.mg[MG.Role + k], tick: -1, worse: 0, hits: '' }));
  const checkAt = [-1, -1, -1, -1, -1];
  while (w.globals[G.Tick] < to) {
    const cmds = pilots.map((p) => playerBotCommands(m, p));
    step(m, cmds[0], cmds);
    const tick = w.globals[G.Tick];
    for (let k = 0; k < 5; k++) {
      const r = res[k];
      if (r.tick < 0 && w.hp[k] !== w.hp[k + 5]) {
        r.tick = tick;
        checkAt[k] = tick + 90;
        r.hits = m.events
          .map((e) => {
            if (e.type === 'hit' && (e.dst === k || e.dst === k + 5)) return `${e.dst < 5 ? 'a' : 'b'}<-k${w.kind[e.src] ?? '?'}s${w.sub[e.src] ?? '?'}:${e.kind}:${e.amount}`;
            if ('id' in e && (e.id === k || e.id === k + 5) && e.type !== 'xp' && e.type !== 'fish') return `${e.id < 5 ? 'a' : 'b'}:${e.type}${'kind' in e ? `:${String(e.kind)}` : ''}`;
            return '';
          })
          .filter(Boolean)
          .join(' ');
      }
      if (checkAt[k] === tick) {
        const d = (w.alive[k] ? w.hp[k] : 0) - (w.alive[k + 5] ? w.hp[k + 5] : 0);
        r.worse = d < 0 ? -1 : d > 0 ? 1 : 0;
      }
    }
  }
  return res;
}
