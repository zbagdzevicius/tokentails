/**
 * Planner bot (QA round 3 balance): walks the shortest path to the best knock-off it can reach and swats it,
 * optionally letting go `react` ticks after any turn warning starts (a human's TELEGRAPH / LOOK / FAKEOUT or the
 * mirror's glint) until it is over. It is a yardstick for rooms, not a human: the validator's feel rules and the
 * per-room rank table (tools/par.mjs) read it. Deterministic: no RNG of its own, the sim's RNG only.
 */
import { BTN_JUMP, BTN_SWAT, DEFAULT_CAT, DIR_DX, DIR_DZ, HumanSt, NO_INPUT, isDiagonal, type Dir8, type Facing, type PlayableRoom, type SimEvent, type SimState, type TickInput } from '../types';
import { canJump, canStep, findSwatTarget } from './cat';
import { coneCellsOf } from './cone';
import { initSim, stepSim } from './sim';
import { mirrorPhase, mirrorSees } from './v5';

export interface PlannerOpts {
  /** Let go after a warning (true) or never freeze (false). */
  freeze?: boolean;
  /** Ticks between the warning and letting go (6 = 0.2 s). */
  react?: number;
  simVersion?: number;
  /** Called after every sim step (balance scripts, debugging). */
  onStep?: (s: SimState, play: PlayableRoom) => void;
  /** Called with every tick's input before it is stepped (server replay tests record the bot's log). */
  onInput?: (input: TickInput) => void;
}

export interface PlannerRun {
  score: number;
  /** Tick of the catch, -1 when never caught. */
  caughtTick: number;
  /** Peak suspicion in percent. */
  maxSuspPct: number;
  targets: number;
  /** Share of ticks (percent) with a turn warning, a look or a live mirror check: time spent waiting. */
  waitPct: number;
  wakes: number;
  redPaws: number;
  ticks: number;
}

const levelAt = (s: SimState, x: number, z: number): number => s.grid.level[z * s.grid.w + x];

/** Value of swatting from (x, z, level) facing `facing`: 0 when nothing would fall. */
function knockValue(s: SimState, x: number, z: number, level: number, facing: Facing, banned: Set<string>): number {
  if (banned.has(`${x},${z},${level},${facing}`)) return 0;
  const c = s.cat;
  const keep = { x: c.x, z: c.z, level: c.level, facing: c.facing };
  c.x = x;
  c.z = z;
  c.level = level as typeof c.level;
  c.facing = facing;
  const t = findSwatTarget(s);
  c.x = keep.x;
  c.z = keep.z;
  c.level = keep.level;
  c.facing = keep.facing;
  if (t.prop < 0 || t.grab) return 0;
  if (t.pull) return 40;
  const p = s.props[t.prop];
  const dx = Math.sign(p.x - x);
  const dz = Math.sign(p.z - z);
  const tx = p.x + (dx || DIR_DX[facing]);
  const tz = p.z + (dz || DIR_DZ[facing]);
  if (tx < 0 || tz < 0 || tx >= s.grid.w || tz >= s.grid.d) return 0;
  if (levelAt(s, tx, tz) >= p.level) return 0;
  return 50 + (p.target ? 150 : 0) + p.level * 10;
}

/** First input toward the best knock-off (Dijkstra over cell × facing), or a swat right now. */
function plan(s: SimState, banned: Set<string>): { first: TickInput | null; swatNow: boolean; goal?: string } {
  const c = s.cat;
  if (knockValue(s, c.x, c.z, c.level, c.facing as Facing, banned) > 0) return { first: null, swatNow: true };
  const W = s.grid.w;
  const key = (x: number, z: number, f: number): number => (z * W + x) * 9 + f;
  const dist = new Map<number, number>();
  const firstMv = new Map<number, TickInput>();
  interface N {
    x: number;
    z: number;
    l: number;
    f: Facing;
    d: number;
  }
  const open: N[] = [{ x: c.x, z: c.z, l: c.level, f: c.facing as Facing, d: 0 }];
  dist.set(key(c.x, c.z, c.facing), 0);
  let best: { v: number; mv: TickInput; goal: string } | null = null;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].d < open[bi].d) bi = i;
    const n = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    const k = key(n.x, n.z, n.f);
    if (n.d > (dist.get(k) ?? Infinity)) continue;
    if (n.d > 0) {
      const v = knockValue(s, n.x, n.z, n.l, n.f, banned);
      if (v > 0) {
        const sc = n.d - v;
        if (!best || sc < best.v) best = { v: sc, mv: firstMv.get(k)!, goal: `${n.x},${n.z},${n.l},${n.f}` };
      }
    }
    if (n.d > 400) continue;
    for (let d = 1; d <= 8; d++) {
      const dir = d as Dir8;
      const tx = n.x + DIR_DX[dir];
      const tz = n.z + DIR_DZ[dir];
      let cost = -1;
      let nl = n.l;
      let btn = 0;
      if (canStep(s, n.x, n.z, n.l, dir)) {
        cost = isDiagonal(dir) ? 10 : 7;
        nl = levelAt(s, tx, tz);
      } else if (canJump(s, n.x, n.z, n.l, dir)) {
        cost = 12;
        nl = levelAt(s, tx, tz);
        btn = BTN_JUMP;
      } else {
        // turn in place to face it
        const nk = key(n.x, n.z, dir);
        const nd = n.d + 2;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          firstMv.set(nk, n.d === 0 ? { dir, speed: 2, buttons: 0 } : firstMv.get(k)!);
          open.push({ x: n.x, z: n.z, l: n.l, f: dir as Facing, d: nd });
        }
        continue;
      }
      const nk = key(tx, tz, dir);
      const nd = n.d + cost;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        firstMv.set(nk, n.d === 0 ? { dir, speed: 2, buttons: btn } : firstMv.get(k)!);
        open.push({ x: tx, z: tz, l: nl, f: dir as Facing, d: nd });
      }
    }
  }
  return { first: best ? best.mv : null, swatNow: false, goal: best?.goal };
}

/**
 * The cat has to hold still now: a turn warning, a look or a fake-out (you cannot tell it from a turn), or the
 * mirror's glint / check while the cat is in (or one cell from) the mirror's cone. The mirror only watches its own
 * short cone, so a cat elsewhere keeps working: that is not waiting.
 */
export function warningOn(s: SimState, play: PlayableRoom): boolean {
  if (s.humans.some((h) => h.state === HumanSt.TELEGRAPH || h.state === HumanSt.LOOK || h.state === HumanSt.FAKEOUT)) return true;
  if (mirrorPhase(s, play) === 'off') return false;
  const c = s.cat;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx;
      const z = c.z + dz;
      if (x >= 0 && z >= 0 && x < s.grid.w && z < s.grid.d && mirrorSees(s, play, x, z, c.level)) return true;
    }
  return false;
}

/** One planner run on `play` (ranked rules unless the room says otherwise). */
export function plannerRun(play: PlayableRoom, opts: PlannerOpts = {}): PlannerRun {
  const freeze = opts.freeze !== false;
  const react = opts.react ?? 6;
  const banned = new Set<string>();
  const s = initSim(play, DEFAULT_CAT, opts.simVersion ? { simVersion: opts.simVersion } : undefined);
  const ev: SimEvent[] = [];
  let warn = -1;
  let cur: TickInput = NO_INPUT;
  let warned = 0;
  const swats = new Map<string, number>();
  let lastPos = '';
  let still = 0;
  // a goal the bot keeps walking to without scoring (its model of a swat and the sim's disagree) gets banned
  const goals = new Map<string, number>();
  let lastScore = 0;
  const cap = s.ticks + 200;
  while (!s.ended && s.tick < cap) {
    const on = warningOn(s, play);
    if (on) warned++;
    if (freeze && on) {
      if (warn < 0) warn = s.tick;
      if (s.tick - warn >= react) {
        opts.onInput?.(NO_INPUT);
        stepSim(s, play, NO_INPUT, ev);
        opts.onStep?.(s, play);
        continue;
      }
    } else warn = -1;
    const c = s.cat;
    const atRest = c.stepTicks === 0 || c.stepProgress >= c.stepTicks;
    const free = c.actTimer === 0 && (atRest || c.stepProgress >= c.stepTicks - 1);
    let inp: TickInput;
    if (free) {
      if (s.score !== lastScore) {
        lastScore = s.score;
        goals.clear();
      }
      const p = plan(s, banned);
      if (p.goal) {
        const n = (goals.get(p.goal) ?? 0) + 1;
        goals.set(p.goal, n);
        if (n > 40) banned.add(p.goal);
      }
      const kk = `${c.x},${c.z},${c.level},${c.facing}`;
      if (p.swatNow) {
        const n = (swats.get(kk) ?? 0) + 1;
        swats.set(kk, n);
        if (n > 3) banned.add(kk);
      }
      if (kk === lastPos) still++;
      else {
        still = 0;
        lastPos = kk;
      }
      if (still > 40) {
        inp = { dir: (1 + (s.tick % 8)) as Dir8, speed: 2, buttons: s.tick % 3 === 0 ? BTN_JUMP : 0 };
        still = 0;
      } else if (p.swatNow) inp = { dir: 0, speed: 0, buttons: BTN_SWAT };
      else inp = p.first ?? NO_INPUT;
      cur = inp;
    } else inp = { dir: cur.dir, speed: cur.speed, buttons: 0 };
    opts.onInput?.(inp);
    stepSim(s, play, inp, ev);
    opts.onStep?.(s, play);
  }
  let wakes = 0;
  let redPaws = 0;
  for (const e of ev) {
    if (e.t === 'wake') wakes++;
    else if (e.t === 'redpaw') redPaws++;
  }
  return {
    score: s.finalScore,
    caughtTick: s.caughtTick,
    maxSuspPct: Math.round(s.maxSuspicion / 1000),
    targets: s.targetsHit,
    waitPct: Math.round((100 * warned) / Math.max(1, s.tick)),
    wakes,
    redPaws,
    ticks: s.tick,
  };
}

/**
 * Share (percent) of the cells where the cat stands to swat a raised prop (same level, orthogonally next to it)
 * that some look facing of some human covers (cone after occlusion, from the human's home spot).
 */
export function swatCellCoverage(play: PlayableRoom): number {
  const s = initSim(play, DEFAULT_CAT);
  const W = s.grid.w;
  const D = s.grid.d;
  const covered = new Set<number>();
  for (let i = 0; i < s.humans.length; i++) {
    const h = s.humans[i];
    const r = i === 1 && play.routine2 ? play.routine2 : play.routine;
    const keep = { state: h.state, facing: h.facing };
    for (const f of r.lookFacings) {
      h.state = HumanSt.LOOK;
      h.facing = f;
      for (const c of coneCellsOf(s, i)) covered.add(c);
    }
    h.state = keep.state;
    h.facing = keep.facing;
  }
  const stand = new Set<number>();
  for (const p of play.room.props) {
    const lv = s.grid.level[p.z * W + p.x];
    if (lv <= 0) continue;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = p.x + dx;
      const z = p.z + dz;
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      if (s.grid.level[z * W + x] === lv) stand.add(z * W + x);
    }
  }
  if (!stand.size) return 100;
  let n = 0;
  for (const c of stand) if (covered.has(c)) n++;
  return Math.round((100 * n) / stand.size);
}
