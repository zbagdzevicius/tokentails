/**
 * Synthetic player for Catnip Heist. It plays through the real sim's input interface and never sees
 * the solver's plan. What it knows comes from a delayed, camera-limited view of the world:
 *
 * - Perception: `perceive(seen)` gets the sim state from `reaction` ticks ago (the runner keeps the
 *   history). Guards, cones, doors, coins and the key/crate/exit are only learned while on screen
 *   around the active cat (src/render/camera.ts footprint scaled by `viewScale`). The bot's own two
 *   cats are known exactly (efference copy: the player knows what they pressed).
 * - Memory: tiles once seen stay known; a dog that leaves the screen is remembered for 2 s and
 *   extrapolated; sentries' observed facings and the bot's own spot locations become soft costs.
 * - Planning: plate-door puzzles are a breadth-first search over (cat 0 region, cat 1 region), where
 *   regions are the known floor split by plate doors and a door move needs the partner on a plate of
 *   that door in its own region (plates are colour-matched to doors, so a link is known once both are
 *   seen). Movement is a Dijkstra over known tiles that refuses tiles a visible dog is predicted to
 *   see around the arrival time (straight-line extrapolation over `horizon`), with waits, flees,
 *   lures (meow when a stationary dog blocks every safe path) and an impatience dash.
 * - Execution: the path is steered every tick in grid directions with human slop (sloppy keys,
 *   overshoot, wrong swaps, reading pauses).
 */
import { NO_INPUT, SUBTILE, type Axis, type GuardState, type Input, type LevelDef, type SimState, type Vec2i } from '../../src/types';
import { HALF, T_FLOOR, centerOf, compileLevel, lineOfSight, tileOf, type CompiledLevel } from '../../src/sim/grid';
import { hudHint, objectiveText } from '../../src/sim/hud';
import { TELEGRAPH_TICKS, sentryTurnAhead } from '../../src/sim/telegraph';
import { DX4, DY4, Heap, buildRegions, steerDir, coneTiles, doorEdges, inView, jointSearch, viewRadius, type Regions } from './nav';
import type { Persona } from './personas';
import type { Rng } from './rng';

/** Ticks a plain cardinal tile move takes from rest. */
const STEP_TICKS = 6;
/** Danger layers are this many ticks apart. */
const LAYER_TICKS = 3;
/** Ticks a dog that left the screen is still tracked. */
const GUARD_MEMORY = 60;
/** Ticks after a patrol dog stops before the player expects it to turn. */
const TURN_TICKS = 8;
/** Ticks a dog must have been watched before the player trusts its observed beat. */
const BEAT_TICKS = 150;
/** Ticks a stopped patrol dog is expected to pause before walking on. */
const RESUME_TICKS = 20;

export type Stage = 'key' | 'rescue' | 'exit' | 'won';

export interface BotParams {
  reaction: number;
  meowRadius: number;
}

interface GuardMemory {
  state: GuardState | null;
  seenTick: number;
  /** Tile where the dog was first seen standing still (and the tick), for stationary detection. */
  stillTile: number;
  stillSince: number;
  /** Facings observed while standing on stillTile ("x,y"). */
  facings: Set<string>;
  /** Seen walking at some point (a patrol dog, not a post-keeper). */
  everMoved: boolean;
  /** Last tick it was seen investigating (walking back to its post afterwards is not patrolling). */
  investigatedAt: number;
  /** Tiles this dog was seen on while patrolling, and for how many ticks it has been watched. */
  beat: Uint8Array;
  watched: number;
  /** Sentry rhythm: current facing, when it last turned (as observed), and observed hold lengths. */
  lastFacing: string;
  lastTurn: number;
  holds: number[];
  /**
   * Sentry turn telegraph as drawn on screen in the perceived frame: ticks until the turn and the
   * facing it turns to (null when no warning shows), or undefined when the dog was not on its post.
   */
  telegraph?: { left: number; fx: number; fy: number } | null;
}

type Intent =
  | { kind: 'idle'; why: string }
  | { kind: 'swap'; why: string }
  | { kind: 'button'; button: 'interact' | 'meow'; why: string }
  | { kind: 'path'; path: number[]; stop: boolean; why: string };

export interface BotStats {
  swaps: number;
  wrongSwaps: number;
  meows: number;
  lures: number;
  flees: number;
  dashes: number;
  hintsRead: number;
  waitTicks: number;
  retries: number;
}

const DIR8: readonly [Axis, Axis][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

export class Bot {
  readonly c: CompiledLevel;
  readonly params: BotParams;
  readonly stats: BotStats = { swaps: 0, wrongSwaps: 0, meows: 0, lures: 0, flees: 0, dashes: 0, hintsRead: 0, waitTicks: 0, retries: 0 };
  readonly n: number;

  // ---- belief
  readonly known: Uint8Array;
  private knownCount = 0;
  private doorBelief: boolean[];
  private coinTaken: boolean[];
  private guards: GuardMemory[];
  private spotTiles: number[] = [];
  /** Chebyshev distance (capped at 3) to the nearest tile a dog was seen on. */
  private trackDist: Uint8Array;
  /** Tiles a watched patrol dog can see from somewhere on its beat (facing along it, any way at its ends). */
  private exposed: Uint8Array;
  private beatDirty = false;
  private spotsBy = new Map<string, number>();
  private learnedRoutes = false;
  private spotTicks: number[] = [];
  knowsLure: boolean;
  knowsPlates: boolean;
  private readTexts = new Set<string>();

  // ---- progress / frustration
  private lastProgress = 0;
  private discoveredSinceProgress = 0;
  private exitReached = [false, false];
  private doorsEverOpen: boolean[];

  // ---- danger field (rebuilt each replan)
  private nLayers = 1;
  private dashing = false;
  private hard: Uint8Array[] = [];
  private owner: Int8Array[] = [];
  private soft: Float32Array;

  // ---- planning state
  private tick = 0;
  private seen: SimState | null = null;
  private regions: Regions | null = null;
  private path: number[] = [];
  private pathIdx = 0;
  private pathStop = true;
  private pendingButton: 'swap' | 'interact' | 'meow' | null = null;
  private busyUntil = 0;
  private lastSwap = -1000;
  private lastInteract = -1000;
  private lastMeow = -1000;
  private waitingSince = -1;
  private riskUntil = -1;
  private stuckSince = -1;
  private lure: { guard: number; tile: number; until: number } | null = null;
  private lastLureAt = new Map<number, number>();
  /** Waiting to see whether the last meow made the dog come over (else the player meowed from too far). */
  private lureCheck: { guard: string; gi: number; tick: number } | null = null;
  private myMeow: { tile: number; tick: number; gi: number; vision: number; arrive: number } | null = null;
  private coinCommit = -1;
  private wobbleLeft = 0;
  private wobbleTurn = 0;
  private overshootLeft = 0;
  private lastDir: [Axis, Axis] = [0, 0];
  private arrivedHandled = true;
  /** Last decision, for debugging and tests. */
  lastWhy = '';

  // scratch
  private dist: Float64Array;
  private time: Int32Array;
  private prev: Int32Array;
  private heap = new Heap();
  private bfsA: Int32Array;
  private bfsB: Int32Array;
  private bfsQ: Int32Array;

  constructor(
    readonly level: LevelDef,
    readonly persona: Persona,
    private readonly rng: Rng,
  ) {
    this.c = compileLevel(level);
    this.n = this.c.w * this.c.h;
    this.known = new Uint8Array(this.n);
    this.soft = new Float32Array(this.n);
    this.trackDist = new Uint8Array(this.n).fill(3);
    this.exposed = new Uint8Array(this.n);
    this.dist = new Float64Array(this.n);
    this.time = new Int32Array(this.n);
    this.prev = new Int32Array(this.n);
    this.bfsA = new Int32Array(this.n);
    this.bfsB = new Int32Array(this.n);
    this.bfsQ = new Int32Array(this.n);
    this.doorBelief = level.doors.map(() => false);
    this.doorsEverOpen = level.doors.map(() => false);
    this.coinTaken = level.coins.map(() => false);
    this.guards = level.guards.map(() => ({ state: null, seenTick: -1e9, stillTile: -1, stillSince: 0, facings: new Set<string>(), everMoved: false, investigatedAt: -1e9, beat: new Uint8Array(this.c.w * this.c.h), watched: 0, lastFacing: '', lastTurn: -1e9, holds: [], telegraph: undefined }));
    this.params = {
      reaction: rng.range(persona.reaction),
      meowRadius: level.meta.meowRadiusTiles * (persona.meowRadiusBelief[0] + rng.next() * (persona.meowRadiusBelief[1] - persona.meowRadiusBelief[0])),
    };
    this.knowsLure = persona.knowsLure;
    this.knowsPlates = persona.knowsPlates;
    if (persona.fullKnowledge) {
      this.known.fill(1);
      this.knownCount = this.n;
    }
    // The level select and loading screen show the intro line.
    if (level.meta.intro && rng.chance(persona.readsHints)) this.learnFrom(level.meta.intro);
  }

  // ---------------------------------------------------------------------------------------------
  // Perception
  // ---------------------------------------------------------------------------------------------

  /** Feed the delayed world state for this tick (call every tick before `act`). */
  perceive(tick: number, seen: SimState): void {
    this.tick = tick;
    this.seen = seen;
    for (const e of seen.events) {
      switch (e.type) {
        case 'SPOTTED':
          this.spotTicks.push(tick);
          if (e.id) {
            const n = (this.spotsBy.get(e.id) ?? 0) + 1;
            this.spotsBy.set(e.id, n);
            if (n >= 2) this.learnedRoutes = true;
          }
          if (e.tile) this.spotTiles.push(e.tile.y * this.c.w + e.tile.x);
          // Getting caught resets the plan (the cat is back at its checkpoint).
          this.path = [];
          this.lure = null;
          break;
        case 'INVESTIGATE':
          if (this.lureCheck && e.id === this.lureCheck.guard) this.lureCheck = null;
          break;
        case 'COIN':
        case 'KEY':
        case 'RESCUE':
          this.progress();
          break;
        case 'CHECKPOINT':
          this.progress();
          break;
        case 'DOOR': {
          const di = this.level.doors.findIndex((d) => d.id === e.id);
          if (di >= 0 && e.open && !this.doorsEverOpen[di]) {
            this.doorsEverOpen[di] = true;
            this.progress();
          }
          break;
        }
        default:
          break;
      }
    }
    if (seen.rescued) {
      for (let i = 0; i < 2; i++) {
        const t = tileOf(seen.cats[i].pos);
        if (!this.exitReached[i] && this.c.exitAt[t.y * this.c.w + t.x]) {
          this.exitReached[i] = true;
          this.progress();
        }
      }
    }
    if (this.lureCheck && tick > this.lureCheck.tick + this.params.reaction + 15) {
      // The dog did not come: next time get closer, and try again soon.
      this.params.meowRadius = Math.max(1.5, this.params.meowRadius - 0.5);
      this.lastLureAt.set(this.lureCheck.gi, tick - 240);
      this.lastMeow = tick - 120;
      this.lureCheck = null;
    }
    for (let i = 0; i < seen.coins.length; i++) if (seen.coins[i].taken && !this.coinTaken[i] && this.isKnown(seen.coins[i].tile)) this.coinTaken[i] = true;
  }

  private progress(): void {
    this.lastProgress = this.tick;
    this.discoveredSinceProgress = 0;
  }

  private isKnown(t: Vec2i): boolean {
    return this.known[t.y * this.c.w + t.x] === 1;
  }

  /** Update the tile map, door, coin and guard memories from what is on screen. */
  private look(seen: SimState): void {
    const c = this.c;
    const cam = seen.cats[seen.activeIndex].pos;
    const scale = this.persona.viewScale;
    const ct = tileOf(cam);
    const r = viewRadius(scale);
    let fresh = 0;
    for (let y = Math.max(0, ct.y - r); y <= Math.min(c.h - 1, ct.y + r); y++)
      for (let x = Math.max(0, ct.x - r); x <= Math.min(c.w - 1, ct.x + r); x++) {
        const i = y * c.w + x;
        if (this.known[i]) continue;
        if (!inView(cam.x, cam.y, x, y, scale)) continue;
        this.known[i] = 1;
        fresh++;
      }
    this.knownCount += fresh;
    this.discoveredSinceProgress += fresh;
    if (this.discoveredSinceProgress >= 15) this.progress();
    this.level.doors.forEach((d, di) => {
      if (inView(cam.x, cam.y, d.tile.x, d.tile.y, scale)) this.doorBelief[di] = seen.doorsOpen[di];
      else if (d.kind === 'PLATE' && this.isKnown(d.tile)) {
        // Off screen: the player knows whether one of their cats stands on a plate of that colour.
        let held = false;
        for (const pi of c.doorPlates[di]) {
          const pt = this.level.plates[pi].tile;
          if (!this.isKnown(pt)) continue;
          for (const cat of seen.cats) {
            const t = tileOf(cat.pos);
            if (t.x === pt.x && t.y === pt.y) held = true;
          }
        }
        this.doorBelief[di] = held;
      }
      // A plate door held open only by the cat being played closes as soon as it walks off: the
      // player does not plan a route through it (without this the bot paced on and off the plate).
      if (d.kind === 'PLATE' && this.doorBelief[di]) {
        let byOther = false;
        let byMe = false;
        for (const pi of c.doorPlates[di]) {
          const pt = this.level.plates[pi].tile;
          seen.cats.forEach((cat, ci) => {
            const t = tileOf(cat.pos);
            if (t.x !== pt.x || t.y !== pt.y) return;
            if (ci === seen.activeIndex) byMe = true;
            else byOther = true;
          });
        }
        if (byMe && !byOther) this.doorBelief[di] = false;
      }
    });
    seen.coins.forEach((co, i) => {
      if (inView(cam.x, cam.y, co.tile.x, co.tile.y, scale)) this.coinTaken[i] = co.taken;
    });
    seen.guards.forEach((g, gi) => {
      const t = tileOf(g.pos);
      if (!inView(cam.x, cam.y, t.x, t.y, scale)) return;
      const m = this.guards[gi];
      const ti = t.y * c.w + t.x;
      if (g.mode === 'INVESTIGATE' || g.mode === 'ALERT') m.investigatedAt = this.tick;
      else if (this.tick - m.investigatedAt > 900) {
        if (!m.beat[ti]) this.beatDirty = true;
        m.beat[ti] = 1;
        m.watched += this.persona.decisionEvery;
      }
      if (g.moving && g.mode === 'PATROL' && this.tick - m.investigatedAt > 900) m.everMoved = true;
      if (g.moving || ti !== m.stillTile) {
        m.stillTile = g.moving ? -1 : ti;
        m.stillSince = this.tick;
        if (g.moving) m.facings.clear();
      }
      if (!g.moving && g.mode === 'PATROL') {
        const fs = `${g.facing.x},${g.facing.y}`;
        m.facings.add(fs);
        if (fs !== m.lastFacing) {
          const contiguous = this.tick - m.seenTick <= 2 * this.persona.decisionEvery;
          if (contiguous && m.lastFacing && m.lastTurn > -1e8) m.holds.push(this.tick - m.lastTurn);
          m.lastTurn = contiguous && m.lastFacing ? this.tick : -1e9;
          m.lastFacing = fs;
        }
      } else m.lastFacing = '';
      m.state = g;
      m.seenTick = this.tick;
      // The ghost cone of a sentry about to turn is on screen like any cone.
      const turn = sentryTurnAhead(this.level, seen, gi, g);
      m.telegraph = turn ? (turn.ticksLeft <= TELEGRAPH_TICKS ? { left: turn.ticksLeft, fx: turn.next.x, fy: turn.next.y } : null) : undefined;
      if (this.trackDist[ti] !== 0) {
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = t.x + dx;
            const y = t.y + dy;
            if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            const j = y * c.w + x;
            if (d < this.trackDist[j]) this.trackDist[j] = d;
          }
      }
    });
  }

  private learnFrom(text: string): void {
    if (/meow|lure/i.test(text)) this.knowsLure = true;
    if (/plate|hold/i.test(text)) this.knowsPlates = true;
  }

  /** HUD hint and objective lines: a novice stops to read them and learns the mechanic they name. */
  private readHud(seen: SimState): boolean {
    let paused = false;
    const me = seen.cats[seen.activeIndex];
    const mt = tileOf(me.pos);
    if (this.hard.length && this.threatened(mt.y * this.c.w + mt.x, 45)) return false;
    const texts = [hudHint(this.level, seen), objectiveText(this.level, seen)];
    for (const t of texts) {
      if (!t || this.readTexts.has(t)) continue;
      this.readTexts.add(t);
      if (!this.rng.chance(this.persona.readsHints)) continue;
      this.learnFrom(t);
      this.stats.hintsRead++;
      const pause = this.rng.range(this.persona.hintRead);
      if (pause > 0) {
        this.busyUntil = Math.max(this.busyUntil, this.tick + pause);
        paused = true;
      }
    }
    return paused;
  }

  // ---------------------------------------------------------------------------------------------
  // Frustration
  // ---------------------------------------------------------------------------------------------

  /** True when the player has had no plan for long enough to hit Retry. */
  wantsRetry(tick: number): boolean {
    return this.stuckSince >= 0 && tick - this.stuckSince > this.persona.retryAfterSec * 30;
  }

  /**
   * Pause > Retry: the level restarts. The player keeps what they learned (map, plates, dog routes,
   * mechanics, where they were caught) but everything dynamic resets.
   */
  retry(tick: number): void {
    this.tick = tick;
    this.doorBelief.fill(false);
    this.coinTaken.fill(false);
    this.exitReached = [false, false];
    for (const m of this.guards) {
      m.state = null;
      m.seenTick = -1e9;
      m.stillTile = -1;
    }
    this.path = [];
    this.pendingButton = null;
    this.lure = null;
    this.lureCheck = null;
    this.myMeow = null;
    this.coinCommit = -1;
    this.waitingSince = -1;
    this.riskUntil = -1;
    this.stuckSince = -1;
    this.busyUntil = tick + 45;
    this.lastSwap = this.lastInteract = this.lastMeow = -1000;
    this.lastLureAt.clear();
    this.progress();
    this.stats.retries++;
  }

  /** Why the player would quit now, or null. */
  quitReason(tick: number): 'quit-spots' | 'quit-stuck' | null {
    const q = this.persona.quit;
    const from = tick - q.windowSec * 30;
    let recent = 0;
    for (let i = this.spotTicks.length - 1; i >= 0 && this.spotTicks[i] > from; i--) recent++;
    if (recent >= q.spots) return 'quit-spots';
    if (tick - this.lastProgress > q.noProgressSec * 30) return 'quit-stuck';
    return null;
  }

  // ---------------------------------------------------------------------------------------------
  // Danger field
  // ---------------------------------------------------------------------------------------------

  private guardWalkable(x: number, y: number): boolean {
    const c = this.c;
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return false;
    const i = y * c.w + x;
    if (c.terrain[i] !== T_FLOOR || i === c.crateIdx) return false;
    const d = c.doorAt[i];
    if (d > 0) {
      const door = this.level.doors[d - 1];
      return door.kind === 'VAULT' && this.doorBelief[d - 1];
    }
    return true;
  }

  private buildDanger(risk: boolean): void {
    const c = this.c;
    const p = this.persona;
    const L = risk ? 2 : Math.ceil(p.horizon / LAYER_TICKS) + 1;
    this.nLayers = L;
    while (this.hard.length < L) {
      this.hard.push(new Uint8Array(this.n));
      this.owner.push(new Int8Array(this.n));
    }
    for (let k = 0; k < L; k++) this.hard[k].fill(0);
    this.soft.fill(0);
    const doors = this.doorBelief;
    const mark = (k: number, i: number, gi: number) => {
      this.hard[k][i] = 1;
      this.owner[k][i] = gi;
    };
    this.guards.forEach((m, gi) => {
      const g = m.state;
      if (!g) return;
      const age = this.tick - m.seenTick;
      if (age > GUARD_MEMORY) return;
      const def = this.level.guards[gi];
      const speed = def.speed;
      let x = g.pos.x;
      let y = g.pos.y;
      let fx = g.facing.x;
      let fy = g.facing.y;
      let moving = g.moving && (g.mode === 'PATROL' || g.mode === 'INVESTIGATE');
      // A patrol dog that sniffs, or reaches the end of the beat the player has watched it walk,
      // turns: from TURN_TICKS after it stops any direction is possible, and after RESUME_TICKS it
      // walks on along its beat (a sentry standing on its post is handled by its facings instead).
      const patroller = def.waypoints.length > 1;
      const knowsBeat = m.watched >= BEAT_TICKS;
      // Time is relative to now (the snapshot is `age` ticks old).
      let now = -age;
      // An investigating dog looks around at random once it gets where it is going.
      const investigating = g.mode === 'INVESTIGATE';
      const vis = g.visionTiles + p.coneMargin;
      let stoppedAt = !moving && (patroller || investigating) && g.mode !== 'ALERT' ? now : Infinity;
      const resume = () => {
        // Leave along a beat tile other than the one it came from; else turn back.
        const tx = x >> 4;
        const ty = y >> 4;
        let back = -1;
        for (let d = 0; d < 4; d++) {
          if (!this.guardWalkable(tx + DX4[d], ty + DY4[d]) || !m.beat[(ty + DY4[d]) * c.w + tx + DX4[d]]) continue;
          if (DX4[d] === -fx && DY4[d] === -fy) back = d;
          else {
            fx = DX4[d];
            fy = DY4[d];
            return true;
          }
        }
        if (back < 0) return false;
        fx = DX4[back];
        fy = DY4[back];
        return true;
      };
      const advance = (ticks: number) => {
        for (let t = 0; t < ticks; t++, now++) {
          if (!moving) {
            if (knowsBeat && patroller && stoppedAt !== Infinity && now - stoppedAt >= RESUME_TICKS && resume()) {
              moving = true;
              stoppedAt = Infinity;
            } else continue;
          }
          if ((x & (SUBTILE - 1)) === HALF && (y & (SUBTILE - 1)) === HALF) {
            const tx = x >> 4;
            const ty = y >> 4;
            const offBeat = knowsBeat && g.mode === 'PATROL' && !m.beat[(ty + fy) * c.w + tx + fx];
            if (!this.guardWalkable(tx + fx, ty + fy) || offBeat) {
              moving = false;
              if (patroller || investigating) stoppedAt = now;
              continue;
            }
          }
          x += fx * speed;
          y += fy * speed;
        }
      };
      advance(age);
      for (let k = 0; k < L; k++) {
        if (k > 0) advance(LAYER_TICKS);
        const tx = x >> 4;
        const ty = y >> 4;
        const cone = coneTiles(c, tx, ty, fx, fy, vis, doors);
        for (let j = 0; j < cone.length; j++) mark(k, cone[j], gi);
        if (!moving && now - stoppedAt >= (investigating ? 12 : TURN_TICKS)) {
          for (let d = 0; d < 4; d++) {
            if (DX4[d] === fx && DY4[d] === fy) continue;
            // Looking around turns 90 degrees at a time: the back comes into view later.
            if (investigating && DX4[d] === -fx && DY4[d] === -fy && now - stoppedAt < 36) continue;
            const cone2 = coneTiles(c, tx, ty, DX4[d], DY4[d], vis, doors);
            for (let j = 0; j < cone2.length; j++) mark(k, cone2[j], gi);
          }
        }
        // Bumping into the dog spots you too.
        mark(k, ty * c.w + tx, gi);
        if (moving) {
          const nx = tx + fx;
          const ny = ty + fy;
          if (nx >= 0 && ny >= 0 && nx < c.w && ny < c.h) mark(k, ny * c.w + nx, gi);
        }
      }
      // Telegraph: a sentry about to turn shows its next cone; one that shows none will not turn
      // within the warning time.
      const tg = m.telegraph;
      if (tg && !patroller && m.stillTile >= 0) {
        const sx = m.stillTile % c.w;
        const sy = (m.stillTile - sx) / c.w;
        const turnAt = tg.left - age;
        for (let k = 0; k < L; k++) {
          if (k * LAYER_TICKS + p.timeBuffer < turnAt) continue;
          const cone = coneTiles(c, sx, sy, tg.fx, tg.fy, vis, doors);
          for (let j = 0; j < cone.length; j++) mark(k, cone[j], gi);
        }
      }
      // Sentries the player has watched turn: once the shortest hold seen so far has run out it may
      // face any of the directions it was seen facing.
      if (p.sentryCaution > 0 && !patroller && m.facings.size > 1 && m.lastTurn > -1e8 && g.mode === 'PATROL' && !g.moving && m.stillTile >= 0) {
        const minHold = m.holds.length ? Math.min(...m.holds) : 60;
        let T = m.lastTurn + minHold - this.tick;
        if (tg === null) T = Math.max(T, TELEGRAPH_TICKS - age);
        else if (tg) T = Math.max(T, tg.left - age + minHold);
        const sx = m.stillTile % c.w;
        const sy = (m.stillTile - sx) / c.w;
        for (let k = 0; k < L; k++) {
          if (k * LAYER_TICKS + p.timeBuffer < T) continue;
          for (const f of m.facings) {
            const [ffx, ffy] = f.split(',').map(Number);
            const cone = coneTiles(c, sx, sy, ffx, ffy, g.visionTiles, doors);
            for (let j = 0; j < cone.length; j++) mark(k, cone[j], gi);
          }
        }
      }
      // Sentries: the other directions this dog has been seen facing from the same post.
      if (p.sentryCaution > 0 && m.stillTile >= 0 && m.facings.size > 1) {
        const sx = m.stillTile % c.w;
        const sy = (m.stillTile - sx) / c.w;
        for (const f of m.facings) {
          const [ffx, ffy] = f.split(',').map(Number);
          const cone = coneTiles(c, sx, sy, ffx, ffy, g.visionTiles, doors);
          for (let j = 0; j < cone.length; j++) this.soft[cone[j]] += p.sentryCaution;
        }
      }
    });
    // After meowing, the dog will come and look around where the meow was: get out of its sight.
    if (this.myMeow && this.tick - this.myMeow.tick < 240) {
      const mt = this.myMeow.tile;
      const mx = mt % c.w;
      const my = (mt - mx) / c.w;
      const R = this.myMeow.vision;
      const from = Math.max(0, Math.ceil((this.myMeow.arrive - (this.tick - this.myMeow.tick)) / LAYER_TICKS));
      for (let y = Math.max(0, my - R); y <= Math.min(c.h - 1, my + R); y++)
        for (let x = Math.max(0, mx - R); x <= Math.min(c.w - 1, mx + R); x++) {
          const i = y * c.w + x;
          if (c.terrain[i] !== T_FLOOR || (x - mx) ** 2 + (y - my) ** 2 > R * R) continue;
          if (!lineOfSight(c, { x: mx, y: my }, { x, y }, doors)) continue;
          for (let k = Math.min(from, L - 1); k < L; k++) mark(k, i, this.myMeow.gi);
        }
    }
    if (p.spotMemoryCost > 0)
      for (const i of this.spotTiles) {
        const sx = i % c.w;
        const sy = (i - sx) / c.w;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = sx + dx;
            const y = sy + dy;
            if (x >= 0 && y >= 0 && x < c.w && y < c.h) this.soft[y * c.w + x] += p.spotMemoryCost;
          }
      }
  }

  /**
   * Hard danger at tile i for an arrival `arr` ticks from now (+- buffer). Past the look-ahead the
   * player assumes each dog stays where its extrapolation ends (the last layer persists).
   */
  private hardAt(i: number, arr: number, buf: number): number {
    const L = this.nLayers;
    let lo = Math.max(0, Math.floor((arr - buf) / LAYER_TICKS));
    if (lo >= L) {
      // Dashing players ignore predicted movement but still respect the cones on screen now.
      if (this.dashing) return this.hard[0][i] ? this.owner[0][i] : -1;
      lo = L - 1;
    }
    const hi = Math.min(L - 1, Math.ceil((arr + buf) / LAYER_TICKS));
    for (let k = lo; k <= hi; k++) if (this.hard[k][i]) return this.owner[k][i];
    return -1;
  }

  /** True when tile i is in danger at any layer up to `ticks` from now. */
  private threatened(i: number, ticks: number): boolean {
    const hi = Math.min(this.nLayers - 1, Math.ceil(ticks / LAYER_TICKS));
    for (let k = 0; k <= hi; k++) if (this.hard[k][i]) return true;
    return false;
  }

  // ---------------------------------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------------------------------

  /** Walkable for the cat as the player believes it (known tile, open door, vault with the key in hand). */
  private passable(i: number): boolean {
    const c = this.c;
    if (!this.known[i] || c.terrain[i] !== T_FLOOR || i === c.crateIdx) return false;
    const d = c.doorAt[i];
    if (d > 0) {
      if (this.doorBelief[d - 1]) return true;
      return this.level.doors[d - 1].kind === 'VAULT' && !!this.seen?.hasKey;
    }
    return true;
  }

  /**
   * Dijkstra from `start` to any tile in `targets`. With `safe`, tiles in predicted danger at the
   * arrival time are refused. Returns the tile path (start first) or null.
   */
  private findPath(start: number, targets: Set<number>, safe: boolean, maxSteps = 400): number[] | null {
    const { dist, time, prev, heap } = this;
    dist.fill(Infinity);
    heap.clear();
    dist[start] = 0;
    time[start] = 0;
    prev[start] = -1;
    heap.push(0, start);
    const w = this.c.w;
    const buf = this.persona.timeBuffer;
    while (heap.size) {
      const u = heap.pop()!;
      if (targets.has(u)) {
        const out: number[] = [];
        for (let v = u; v >= 0; v = prev[v]) out.push(v);
        return out.reverse();
      }
      const du = dist[u];
      if (time[u] / STEP_TICKS > maxSteps) continue;
      const ux = u % w;
      const uy = (u - ux) / w;
      for (let k = 0; k < 4; k++) {
        const nx = ux + DX4[k];
        const ny = uy + DY4[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.c.h) continue;
        const v = ny * w + nx;
        if (!this.passable(v)) continue;
        const arr = time[u] + STEP_TICKS;
        if (safe && this.hardAt(v, arr, buf) >= 0) continue;
        const nd = du + STEP_TICKS + this.soft[v];
        if (nd < dist[v]) {
          dist[v] = nd;
          time[v] = arr;
          prev[v] = u;
          heap.push(nd, v);
        }
      }
    }
    return null;
  }

  /** Plain 4-neighbour BFS distances (in steps, -1 unreachable) over believed-walkable tiles. */
  private bfs(sources: Iterable<number>, d: Int32Array): { d: Int32Array; minOver: (t: Iterable<number>) => number } {
    d.fill(-1);
    const q = this.bfsQ;
    let qt = 0;
    for (const s of sources) {
      if (d[s] < 0) {
        d[s] = 0;
        q[qt++] = s;
      }
    }
    const w = this.c.w;
    for (let qh = 0; qh < qt; qh++) {
      const u = q[qh];
      const ux = u % w;
      const uy = (u - ux) / w;
      for (let k = 0; k < 4; k++) {
        const nx = ux + DX4[k];
        const ny = uy + DY4[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.c.h) continue;
        const v = ny * w + nx;
        if (d[v] >= 0 || !this.passable(v)) continue;
        d[v] = d[u] + 1;
        q[qt++] = v;
      }
    }
    return {
      d,
      minOver: (ts: Iterable<number>) => {
        let m = Infinity;
        for (const t of ts) if (d[t] >= 0 && d[t] < m) m = d[t];
        return m;
      },
    };
  }

  private updateExposure(): void {
    if (!this.beatDirty) return;
    this.beatDirty = false;
    const c = this.c;
    this.exposed.fill(0);
    this.guards.forEach((m, gi) => {
      const def = this.level.guards[gi];
      if (def.waypoints.length < 2) return;
      const vision = m.state?.visionTiles ?? def.visionTiles;
      for (let b = 0; b < this.n; b++) {
        if (!m.beat[b]) continue;
        const bx = b % c.w;
        const by = (b - bx) / c.w;
        const dirs: number[] = [];
        for (let d = 0; d < 4; d++) {
          const nx = bx + DX4[d];
          const ny = by + DY4[d];
          if (nx >= 0 && ny >= 0 && nx < c.w && ny < c.h && m.beat[ny * c.w + nx]) dirs.push(d);
        }
        const look = dirs.length <= 1 ? [0, 1, 2, 3] : dirs;
        for (const d of look) {
          const cone = coneTiles(c, bx, by, DX4[d], DY4[d], vision, this.doorBelief);
          for (let j = 0; j < cone.length; j++) this.exposed[cone[j]] = 1;
        }
      }
    });
  }

  /**
   * A spot where this player is willing to stand and wait: not visible from the beats of the dogs
   * it has watched (trackClearance 0), also not on a beat (1), or not even next to one (2).
   */
  private goodSpot(i: number): boolean {
    // Players with no sense of routes learn one after being caught twice by the same dog.
    const tc = this.persona.trackClearance < 0 && this.learnedRoutes ? 0 : this.persona.trackClearance;
    if (tc < 0) return true;
    this.updateExposure();
    if (this.exposed[i]) return false;
    return tc === 0 || this.trackDist[i] >= tc;
  }

  /** Nearby tile that stays out of every predicted cone, reached safely; null if none. */
  private findRefuge(start: number): number[] | null {
    const targets = new Set<number>();
    const w = this.c.w;
    const sx = start % w;
    const sy = (start - sx) / w;
    const R = 8;
    for (let y = Math.max(0, sy - R); y <= Math.min(this.c.h - 1, sy + R); y++)
      for (let x = Math.max(0, sx - R); x <= Math.min(w - 1, sx + R); x++) {
        const i = y * w + x;
        if (i !== start && this.passable(i) && !this.threatened(i, this.nLayers * LAYER_TICKS) && this.goodSpot(i)) targets.add(i);
      }
    if (!targets.size) {
      // Nothing off the routes: any tile out of the cones will do.
      for (let y = Math.max(0, sy - R); y <= Math.min(this.c.h - 1, sy + R); y++)
        for (let x = Math.max(0, sx - R); x <= Math.min(w - 1, sx + R); x++) {
          const i = y * w + x;
          if (i !== start && this.passable(i) && !this.threatened(i, this.nLayers * LAYER_TICKS)) targets.add(i);
        }
    }
    if (!targets.size) return null;
    const path = this.findPath(start, targets, true, 12);
    return path ? this.intoNicheEnd(start, path) : null;
  }

  /**
   * A refuge in a dead-end niche: go to the end of it, as a player ducking into a niche does (the
   * first niche tile is still in view of a dog passing in the corridor). Extends the path by up to 3
   * tiles along a 1-wide dead end, never onto a tile a cone is about to cover.
   */
  private intoNicheEnd(start: number, path: number[]): number[] {
    const w = this.c.w;
    const nbrs = (i: number) => {
      const x = i % w;
      const y = (i - x) / w;
      const out: number[] = [];
      for (let k = 0; k < 4; k++) {
        const nx = x + DX4[k];
        const ny = y + DY4[k];
        if (nx >= 0 && ny >= 0 && nx < w && ny < this.c.h && this.passable(ny * w + nx)) out.push(ny * w + nx);
      }
      return out;
    };
    let prev = path.length > 1 ? path[path.length - 2] : start;
    let cur = path[path.length - 1];
    const ext: number[] = [];
    for (let k = 0; k < 3; k++) {
      const n = nbrs(cur);
      if (n.length === 1 && n[0] === prev) return path.concat(ext); // dead end reached
      if (n.length !== 2) return path;
      const next = n[0] === prev ? n[1] : n[0];
      if (this.threatened(next, this.nLayers * LAYER_TICKS)) return path;
      ext.push(next);
      prev = cur;
      cur = next;
    }
    return nbrs(cur).length === 1 ? path.concat(ext) : path;
  }

  // ---------------------------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------------------------

  /** Region of a cat; a cat standing in a plate doorway belongs to the side it is facing. */
  private regionOf(cat: { pos: Vec2i; facing: Vec2i }): number {
    const r = this.regions!;
    const c = this.c;
    const t = tileOf(cat.pos);
    const i = t.y * c.w + t.x;
    if (r.id[i] >= 0) return r.id[i];
    const ahead = (t.y + cat.facing.y) * c.w + (t.x + cat.facing.x);
    if (ahead >= 0 && ahead < this.n && r.id[ahead] >= 0) return r.id[ahead];
    for (let k = 0; k < 4; k++) {
      const x = t.x + DX4[k];
      const y = t.y + DY4[k];
      if (x >= 0 && y >= 0 && x < c.w && y < c.h && r.id[y * c.w + x] >= 0) return r.id[y * c.w + x];
    }
    return -1;
  }

  private stage(s: SimState): Stage {
    if (s.won) return 'won';
    if (this.level.key && !s.keyTaken) return 'key';
    if (!s.rescued) return 'rescue';
    return 'exit';
  }

  private crateTargets(): number[] {
    const c = this.c;
    const ct = this.level.crate.tile;
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = ct.x + dx;
        const y = ct.y + dy;
        if ((dx || dy) && x >= 0 && y >= 0 && x < c.w && y < c.h && this.passable(y * c.w + x)) out.push(y * c.w + x);
      }
    return out;
  }

  private frontier(): number[] {
    const c = this.c;
    const out: number[] = [];
    for (let i = 0; i < this.n; i++) {
      if (!this.known[i] || !this.passable(i)) continue;
      const x = i % c.w;
      const y = (i - x) / c.w;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX4[k];
        const ny = y + DY4[k];
        if (nx >= 0 && ny >= 0 && nx < c.w && ny < c.h && !this.known[ny * c.w + nx]) {
          out.push(i);
          break;
        }
      }
    }
    return out;
  }

  /**
   * One replan: returns what the active cat should do now. `cur` supplies only the bot's own cats
   * (positions and which one is active); everything else comes from the delayed view.
   */
  private decide(cur: SimState): Intent {
    const c = this.c;
    const me = cur.cats[cur.activeIndex];
    if (me.stunTicks > 0) return { kind: 'idle', why: 'stunned' };
    const here = tileOf(me.pos);
    const hereI = here.y * c.w + here.x;

    // Fat-fingered swap.
    if (this.rng.chance((this.persona.wrongSwapPerMin * this.persona.decisionEvery) / 1800)) {
      this.stats.wrongSwaps++;
      return { kind: 'swap', why: 'wrong swap' };
    }

    const risk = this.tick < this.riskUntil;
    this.dashing = risk;
    this.buildDanger(risk);

    const intent = this.plan(cur, hereI, here);
    // Staying put while a cone is about to sweep over me: get out first.
    const staying = intent.kind === 'idle' || intent.kind === 'button' || (intent.kind === 'path' && intent.path.length <= 1);
    // A dash ignores where the dogs are going while the cat runs, but a cat standing still still
    // sees the dog walking at it: check that with the full look-ahead.
    if (staying && risk) {
      this.dashing = false;
      this.buildDanger(false);
    }
    if (staying && this.threatened(hereI, Math.max(12, this.persona.horizon))) {
      const ref = this.findRefuge(hereI);
      if (ref) {
        this.stats.flees++;
        return { kind: 'path', path: ref, stop: true, why: 'flee' };
      }
    }
    // Waiting: stand on the tile the plan thinks the cat is on. The bots reason per tile, but the
    // sim sees the exact centre, so a cat stopped at a niche's mouth (one step in) is still in view
    // of the corridor; a player who ducks into a niche walks all the way in.
    if (intent.kind === 'idle' && !me.moving) {
      const cc = centerOf(here);
      if (Math.abs(cc.x - me.pos.x) > 3 || Math.abs(cc.y - me.pos.y) > 3) return { kind: 'path', path: [hereI], stop: true, why: `${intent.why} (settle)` };
    }
    return intent;
  }

  private plan(cur: SimState, hereI: number, here: Vec2i): Intent {
    const seen = this.seen!;
    const c = this.c;
    const a = cur.activeIndex;
    const o = (1 - a) as 0 | 1;
    const me = cur.cats[a];
    // A lure in progress.
    if (this.lure) {
      const lu = this.lure;
      if (this.tick > lu.until) this.lure = null;
      else if (hereI === lu.tile) {
        const cc = centerOf(here);
        if (Math.abs(cc.x - me.pos.x) > 3 || Math.abs(cc.y - me.pos.y) > 3 || me.moving) return { kind: 'path', path: [hereI], stop: true, why: 'settle on lure tile' };
        this.lure = null;
        return this.fireMeow(lu.guard);
      } else {
        const p = this.findPath(hereI, new Set([lu.tile]), true);
        if (p) return { kind: 'path', path: p, stop: true, why: 'to lure tile' };
        this.lure = null;
      }
    }

    // Regions and the plate-door graph as the player understands it.
    const passable = (i: number) => this.passable(i);
    const plateDoorAt = (i: number) => {
      const d = c.doorAt[i];
      return d > 0 && this.level.doors[d - 1].kind === 'PLATE';
    };
    this.regions = buildRegions(c, passable, plateDoorAt);
    const regions = this.regions;
    const edges = this.knowsPlates
      ? doorEdges(
          c,
          this.level,
          regions,
          (d) => this.isKnown(this.level.doors[d].tile),
          (p) => this.isKnown(this.level.plates[p].tile),
        )
      : [];
    const plateRegion = (p: number) => regions.id[this.level.plates[p].tile.y * c.w + this.level.plates[p].tile.x];
    const regs: [number, number] = [this.regionOf(cur.cats[0]), this.regionOf(cur.cats[1])];
    const regionSet = (tiles: number[]) => {
      const s = new Set<number>();
      for (const t of tiles) if (regions.id[t] >= 0) s.add(regions.id[t]);
      return s;
    };

    const stage = this.stage(seen);
    const knownCoins = this.level.coins
      .map((co, i) => ({ i, t: co.tile.y * c.w + co.tile.x }))
      .filter((x) => !this.coinTaken[x.i] && this.known[x.t]);

    /**
     * Try to make progress towards `tiles`. `both`: both cats must get there (the exit). Returns an
     * intent, or null when the player cannot see a way.
     */
    const pursue = (tiles: number[], both: boolean, why: string, interactAtGoal = false): Intent | null => {
      if (!tiles.length) return null;
      const goalRegions = regionSet(tiles);
      if (!goalRegions.size) return null;
      const goal = both ? (r0: number, r1: number) => goalRegions.has(r0) && goalRegions.has(r1) : (r0: number, r1: number) => goalRegions.has(r0) || goalRegions.has(r1);
      const res = jointSearch(regs, edges, plateRegion, goal);
      if (res === null) return null;
      const tileSet = new Set(tiles);
      if (res === 'here') {
        let actor: 0 | 1;
        if (both) {
          const onA = tileSet.has(hereI);
          actor = onA ? o : a;
        } else actor = goalRegions.has(regs[a]) ? a : o;
        if (actor !== a) return this.swapIntent(`${why}: other cat`, cur);
        if (tileSet.has(hereI)) {
          if (interactAtGoal) {
            if (this.tick - this.lastInteract > this.params.reaction + 8) {
              this.lastInteract = this.tick;
              return { kind: 'button', button: 'interact', why: 'rescue' };
            }
            return { kind: 'idle', why: 'waiting for rescue' };
          }
          return { kind: 'idle', why: `${why}: there` };
        }
        return this.moveIntent(hereI, tileSet, `${why}`, knownCoins, true);
      }
      // A plate door move: the holder stands on a plate in its region, then the mover walks through.
      const m = res.mover;
      const h = (1 - m) as 0 | 1;
      const holderTile = tileOf(cur.cats[h].pos);
      const holderI = holderTile.y * c.w + holderTile.x;
      const plateTiles = res.plates.map((p) => this.level.plates[p].tile.y * c.w + this.level.plates[p].tile.x);
      const onPlate = plateTiles.includes(holderI);
      const door = this.level.doors[res.door];
      if (!onPlate) {
        if (a !== h) return this.swapIntent(`hold ${door.id}: go to holder`, cur);
        return this.moveIntent(hereI, new Set(plateTiles), `hold ${door.id}`, knownCoins, true);
      }
      if (a !== m) return this.swapIntent(`hold ${door.id}: holder in place`, cur, false);
      // Look after the holder when it is on screen.
      if (this.rng.chance(this.persona.watchHolder) && inView(me.pos.x, me.pos.y, holderTile.x, holderTile.y, this.persona.viewScale) && this.threatened(holderI, 15)) {
        return this.swapIntent(`holder of ${door.id} in danger`, cur, false);
      }
      const beyond: number[] = [];
      for (let k = 0; k < 4; k++) {
        const x = door.tile.x + DX4[k];
        const y = door.tile.y + DY4[k];
        if (x >= 0 && y >= 0 && x < c.w && y < c.h && regions.id[y * c.w + x] === res.to) beyond.push(y * c.w + x);
      }
      const direct = tiles.filter((t) => regions.id[t] === res.to);
      const targets = new Set(direct.length && res.moves === 1 ? direct : beyond);
      return this.moveIntent(hereI, targets, `through ${door.id}`, knownCoins, false);
    };

    const exploreTiles = () => this.frontier();
    let intent: Intent | null = null;
    if (this.persona.exploreAll) {
      intent = pursue(
        knownCoins.map((x) => x.t),
        false,
        'all coins',
      );
      if (!intent) intent = pursue(exploreTiles(), false, 'explore all');
    }
    if (!intent) {
      if (stage === 'key' && this.level.key && this.isKnown(this.level.key.tile)) intent = pursue([this.level.key.tile.y * c.w + this.level.key.tile.x], false, 'key');
      else if (stage === 'rescue' && this.isKnown(this.level.crate.tile)) intent = pursue(this.crateTargets(), false, 'crate', true);
      else if (stage === 'exit') {
        const ex = this.level.exit.tiles.filter((t) => this.isKnown(t)).map((t) => t.y * c.w + t.x);
        intent = pursue(ex, true, 'exit');
      }
    }
    if (!intent) intent = pursue(exploreTiles(), false, 'explore');
    if (!intent) {
      // No idea what to do: novices eventually try the mechanics they have not been told about.
      if (this.stuckSince < 0) this.stuckSince = this.tick;
      if (this.tick - this.stuckSince > this.persona.experimentAfter) {
        this.knowsPlates = true;
        this.knowsLure = true;
      }
      return { kind: 'idle', why: 'stuck' };
    }
    this.stuckSince = -1;
    return intent;
  }

  private swapIntent(why: string, cur: SimState, park = true): Intent {
    if (this.tick - this.lastSwap < 15) return { kind: 'idle', why: 'swap cooldown' };
    if (park && this.persona.parkSafely > 0) {
      const me = cur.cats[cur.activeIndex];
      const t = tileOf(me.pos);
      const i = t.y * this.c.w + t.x;
      const exposed = !this.goodSpot(i) || this.trackDist[i] === 0 || this.threatened(i, this.nLayers * LAYER_TICKS);
      if (exposed && this.rng.chance(this.persona.parkSafely)) {
        const targets = new Set<number>();
        const w = this.c.w;
        for (let y = Math.max(0, t.y - 6); y <= Math.min(this.c.h - 1, t.y + 6); y++)
          for (let x = Math.max(0, t.x - 6); x <= Math.min(w - 1, t.x + 6); x++) {
            const j = y * w + x;
            if (this.passable(j) && this.goodSpot(j) && this.trackDist[j] >= 1 && this.c.doorAt[j] === 0 && this.c.plateAt[j] === 0 && !this.threatened(j, this.nLayers * LAYER_TICKS)) targets.add(j);
          }
        const p = targets.size ? this.findPath(i, targets, true, 10) : null;
        if (p && p.length > 1) return { kind: 'path', path: p, stop: true, why: 'park before swap' };
      }
    }
    return { kind: 'swap', why };
  }

  /**
   * Move the active cat towards `targets` (picking up a coin on the way when the detour is small),
   * avoiding predicted cones. Falls back to lure, wait or an impatient dash.
   */
  private moveIntent(start: number, targets: Set<number>, why: string, coins: { i: number; t: number }[], stop: boolean): Intent {
    const c = this.c;
    let goal = targets;
    let label = why;
    // Coin detour (coins on screen or remembered): extra steps = d(start, coin) + d(coin, target) - d(start, target).
    const detour = this.persona.coinDetour;
    if (detour > 0 && coins.length) {
      const dS = this.bfs([start], this.bfsA);
      const dT = this.bfs(targets, this.bfsB);
      const baseLen = dS.minOver(targets);
      let best = -1;
      let bestCost = Infinity;
      const sx = start % c.w;
      const sy = (start - sx) / c.w;
      for (const co of coins) {
        const a = dS.d[co.t];
        const b = dT.d[co.t];
        if (a < 0 || b < 0) continue;
        if (co.i !== this.coinCommit && !this.persona.exploreAll) {
          const t = this.level.coins[co.i].tile;
          if (Math.abs(t.x - sx) + Math.abs(t.y - sy) > detour + 6) continue;
        }
        const cost = a + b - baseLen;
        const allowed = co.i === this.coinCommit ? detour + 3 : detour;
        if (cost <= allowed && cost < bestCost) {
          bestCost = cost;
          best = co.i;
        }
      }
      if (best >= 0) {
        const co = this.level.coins[best].tile;
        goal = new Set([co.y * c.w + co.x]);
        label = `${why} (coin)`;
        this.coinCommit = best;
        stop = false;
      } else this.coinCommit = -1;
    }
    // Stick with the current route while it still leads there safely (no dithering between equal routes).
    const kept = this.keepPath(start, goal);
    if (kept) return { kind: 'path', path: kept, stop, why: label };
    const safe = this.findPath(start, goal, true);
    if (safe) {
      if (goal === targets) this.waitingSince = -1;
      return { kind: 'path', path: safe, stop, why: label };
    }
    if (goal !== targets) {
      // The coin is not safe: go for the real target instead.
      const p = this.findPath(start, targets, true);
      if (p) {
        this.waitingSince = -1;
        return { kind: 'path', path: p, stop, why };
      }
    }
    const raw = this.findPath(start, targets, false);
    if (!raw) return { kind: 'idle', why: `${why}: no path` };
    // Which dog blocks the way?
    let blocker = -1;
    for (let k = 1; k < raw.length && blocker < 0; k++) blocker = this.hardAt(raw[k], k * STEP_TICKS, this.persona.timeBuffer);
    if (blocker >= 0) {
      const lure = this.planLure(start, blocker, raw);
      if (lure) return lure;
    }
    // Get as close as is safe, then wait there.
    const adv = this.advance(start, targets);
    if (adv) {
      this.waitingSince = -1;
      return { kind: 'path', path: adv, stop: true, why: `${why}: advance` };
    }
    if (this.waitingSince < 0) this.waitingSince = this.tick;
    this.stats.waitTicks += this.persona.decisionEvery;
    if (this.tick - this.waitingSince > this.persona.patience) {
      this.riskUntil = this.tick + 45;
      this.waitingSince = -1;
      this.stats.dashes++;
    }
    return { kind: 'idle', why: `${why}: waiting for a gap` };
  }

  /** Remainder of the current path from `start` if it ends in `goal` and is still safe at the predicted times. */
  private keepPath(start: number, goal: Set<number>): number[] | null {
    if (!this.path.length || !goal.has(this.path[this.path.length - 1])) return null;
    const at = this.path.indexOf(start);
    if (at < 0) return null;
    const rest = this.path.slice(at);
    const buf = this.persona.timeBuffer;
    for (let j = 1; j < rest.length; j++) if (!this.passable(rest[j]) || this.hardAt(rest[j], j * STEP_TICKS, buf) >= 0) return null;
    return rest;
  }

  /**
   * The safely reachable tile closest (by walking distance) to the targets that stays out of every
   * predicted cone once reached, if it is closer than where the cat stands now.
   */
  private advance(start: number, targets: Set<number>): number[] | null {
    const dT = this.bfs(targets, this.bfsB).d;
    const d0 = dT[start];
    if (d0 <= 0) return null;
    this.findPath(start, new Set<number>(), true, 30);
    let best = -1;
    let bestD = d0;
    let bestT = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.dist[i] === Infinity || i === start || dT[i] < 0) continue;
      if (dT[i] > bestD || (dT[i] === bestD && this.time[i] >= bestT)) continue;
      if (dT[i] === d0) continue;
      if (!this.goodSpot(i) && !targets.has(i)) continue;
      if (this.spotTiles.includes(i)) continue;
      // Must stay unseen from the arrival on (the last layer stands for "after that").
      const k0 = Math.min(this.nLayers - 1, Math.floor(this.time[i] / LAYER_TICKS));
      let ok = true;
      for (let k = k0; k < this.nLayers && ok; k++) if (this.hard[k][i]) ok = false;
      if (!ok) continue;
      best = i;
      bestD = dT[i];
      bestT = this.time[i];
    }
    if (best < 0) return null;
    const out: number[] = [];
    for (let v = best; v >= 0; v = this.prev[v]) out.push(v);
    return out.reverse();
  }

  private fireMeow(gi: number): Intent {
    const me = this.seen!.cats[this.seen!.activeIndex];
    const t = tileOf(me.pos);
    const g = this.guards[gi].state;
    const gt = g ? tileOf(g.pos) : t;
    const speed = this.level.guards[gi].speed;
    // Rough walking time of the dog to the meow tile (it sees vision tiles ahead, so earlier than that).
    const steps = Math.abs(gt.x - t.x) + Math.abs(gt.y - t.y);
    this.myMeow = { tile: t.y * this.c.w + t.x, tick: this.tick, gi, vision: g?.visionTiles ?? 4, arrive: (steps * SUBTILE) / speed };
    this.lastMeow = this.tick;
    this.lastLureAt.set(gi, this.tick);
    this.lureCheck = { guard: this.level.guards[gi].id, gi, tick: this.tick };
    this.stats.meows++;
    return { kind: 'button', button: 'meow', why: 'meow lure' };
  }

  /** Meow lure against a dog that stands still in the way. */
  private planLure(start: number, gi: number, raw: number[]): Intent | null {
    const m = this.guards[gi];
    const g = m.state;
    if (!g || g.moving || m.stillTile < 0 || m.everMoved) return null;
    // A sentry seen turning (or showing its turn telegraph) is waited out, not lured: it turns away.
    if (m.facings.size > 1 || m.telegraph) return null;
    if (this.tick - m.seenTick > 3) return null;
    if (this.tick - m.stillSince < 45) return null;
    if (this.tick - this.lastMeow < 150) return null;
    if (this.tick - (this.lastLureAt.get(gi) ?? -1e9) < 300) return null;
    if (!this.knowsLure) {
      if (this.stuckSince < 0) this.stuckSince = this.tick;
      if (this.tick - this.stuckSince > this.persona.experimentAfter) this.knowsLure = true;
      return null;
    }
    const c = this.c;
    const gt = tileOf(g.pos);
    const R = this.params.meowRadius;
    const route = new Set(raw);
    const minD = Math.min(g.visionTiles + 0.5, R - 0.4);
    let bestTile = -1;
    let bestPath: number[] | null = null;
    const cand = new Set<number>();
    const Ri = Math.ceil(R);
    for (let y = gt.y - Ri; y <= gt.y + Ri; y++)
      for (let x = gt.x - Ri; x <= gt.x + Ri; x++) {
        if (x < 0 || y < 0 || x >= c.w || y >= c.h) continue;
        const i = y * c.w + x;
        if (!this.passable(i) || this.threatened(i, this.nLayers * LAYER_TICKS)) continue;
        if ((x - gt.x) ** 2 + (y - gt.y) ** 2 > R * R) continue;
        // Out of its sight: the dog turns towards the sound and walks over.
        if ((x - gt.x) ** 2 + (y - gt.y) ** 2 <= minD * minD) continue;
        if (!lineOfSight(c, gt, { x, y }, this.doorBelief)) continue;
        // Lure the dog away from the route, not onto it.
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) if (route.has((y + dy) * c.w + x + dx) && (x + dx !== gt.x || y + dy !== gt.y)) near = Math.abs(dx) + Math.abs(dy) <= 1;
        if (near) continue;
        cand.add(i);
      }
    if (!cand.size) return null;
    if (cand.has(start)) bestTile = start;
    else {
      bestPath = this.findPath(start, cand, true);
      if (bestPath) bestTile = bestPath[bestPath.length - 1];
    }
    if (bestTile < 0) return null;
    this.lure = { guard: gi, tile: bestTile, until: this.tick + 600 };
    this.stats.lures++;
    if (bestTile === start) {
      const me = this.seen!.cats[this.seen!.activeIndex];
      const cc = centerOf({ x: start % c.w, y: Math.floor(start / c.w) });
      if (Math.abs(cc.x - me.pos.x) <= 3 && Math.abs(cc.y - me.pos.y) <= 3) {
        this.lure = null;
        return this.fireMeow(gi);
      }
      return { kind: 'path', path: [start], stop: true, why: 'settle on lure tile' };
    }
    return { kind: 'path', path: bestPath!, stop: true, why: 'to lure tile' };
  }

  // ---------------------------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------------------------

  /** Input for this tick. Call after `perceive`. `cur` is the live state (only the bot's own cats are read). */
  act(cur: SimState): Input {
    const tick = this.tick;
    if (tick % this.persona.decisionEvery === 0 && this.seen) {
      this.look(this.seen);
      if (tick >= this.busyUntil) {
        if (this.persona.readsHints > 0) this.readHud(this.seen);
      }
      if (tick >= this.busyUntil) this.apply(this.decide(cur), cur);
    }
    if (tick < this.busyUntil) return NO_INPUT;
    if (this.pendingButton) {
      const b = this.pendingButton;
      this.pendingButton = null;
      if (b === 'swap') {
        this.stats.swaps++;
        this.lastSwap = tick;
        this.busyUntil = tick + Math.max(6, this.params.reaction);
        this.path = [];
        return { ...NO_INPUT, swap: true };
      }
      return { ...NO_INPUT, interact: b === 'interact', meow: b === 'meow' };
    }
    return this.steer(cur);
  }

  private apply(intent: Intent, cur: SimState): void {
    this.lastWhy = intent.why;
    switch (intent.kind) {
      case 'idle':
        this.path = [];
        return;
      case 'swap':
        this.pendingButton = 'swap';
        return;
      case 'button':
        this.path = [];
        this.pendingButton = intent.button;
        return;
      case 'path': {
        const same = this.path.length && this.path[this.path.length - 1] === intent.path[intent.path.length - 1];
        this.path = intent.path;
        this.pathIdx = 0;
        this.pathStop = intent.stop;
        if (!same) this.arrivedHandled = false;
        if (this.wobbleLeft === 0 && this.rng.chance(this.persona.pathNoise)) {
          this.wobbleLeft = this.rng.range(this.persona.wobble);
          this.wobbleTurn = this.rng.chance(0.5) ? 1 : -1;
        }
        void cur;
        return;
      }
    }
  }

  private steer(cur: SimState): Input {
    const cat = cur.cats[cur.activeIndex];
    if (cat.stunTicks > 0) {
      this.path = [];
      return NO_INPUT;
    }
    const c = this.c;
    const pos = cat.pos;
    const t = tileOf(pos);
    const ti = t.y * c.w + t.x;
    // Skip path tiles already passed.
    const at = this.path.indexOf(ti, this.pathIdx);
    if (at > this.pathIdx) this.pathIdx = at;
    while (this.pathIdx < this.path.length) {
      const i = this.path[this.pathIdx];
      if (i !== ti) break;
      const cc = centerOf({ x: i % c.w, y: Math.floor(i / c.w) });
      const last = this.pathIdx === this.path.length - 1;
      if (last) {
        if (!this.pathStop || (Math.abs(cc.x - pos.x) <= 2 && Math.abs(cc.y - pos.y) <= 2)) this.pathIdx++;
        else break;
      } else {
        const nx = this.path[this.pathIdx + 1];
        const legX = nx % c.w !== i % c.w;
        const perp = legX ? Math.abs(cc.y - pos.y) : Math.abs(cc.x - pos.x);
        if (perp <= 3) this.pathIdx++;
        else break;
      }
    }
    if (this.pathIdx >= this.path.length) {
      if (!this.arrivedHandled) {
        this.arrivedHandled = true;
        this.overshootLeft = this.path.length > 1 ? this.rng.range(this.persona.overshoot) : 0;
      }
      if (this.overshootLeft > 0 && (this.lastDir[0] || this.lastDir[1])) {
        this.overshootLeft--;
        return { ...NO_INPUT, dx: this.lastDir[0], dy: this.lastDir[1] };
      }
      this.lastDir = [0, 0];
      return NO_INPUT;
    }
    const nxt = this.path[this.pathIdx];
    let [dx, dy] = steerDir(pos, nxt % c.w, Math.floor(nxt / c.w));
    if (this.wobbleLeft > 0) {
      this.wobbleLeft--;
      const k = DIR8.findIndex(([x, y]) => x === dx && y === dy);
      if (k >= 0) [dx, dy] = DIR8[(k + this.wobbleTurn + 8) % 8];
    }
    this.lastDir = [dx, dy];
    return { ...NO_INPUT, dx, dy };
  }

  /** Coarse state for reports. */
  stageOf(s: SimState): Stage {
    return this.stage(s);
  }

  /** ASCII of the last danger field: layer 0 cones 'x', later layers 'o', unknown '?', walls '#'. */
  debugDanger(cats: Vec2i[]): string {
    const c = this.c;
    const out: string[] = [];
    for (let y = 0; y < c.h; y++) {
      let row = '';
      for (let x = 0; x < c.w; x++) {
        const i = y * c.w + x;
        let ch = !this.known[i] ? '?' : c.terrain[i] === T_FLOOR ? '.' : '#';
        if (this.hard.length) {
          if (this.hard[0][i]) ch = 'x';
          else if (this.hard.slice(1, this.nLayers).some((h) => h[i])) ch = 'o';
        }
        if (cats.some((t) => (t.x >> 4) === x && (t.y >> 4) === y)) ch = '@';
        row += ch;
      }
      out.push(row);
    }
    return out.join('\n');
  }

  /** Current path as "x,y" tiles from the next one (debug traces). */
  debugPath(): string {
    const w = this.c.w;
    return this.path
      .slice(this.pathIdx, this.pathIdx + 6)
      .map((i) => `${i % w},${Math.floor(i / w)}`)
      .join(' ');
  }

  get knownTiles(): number {
    return this.knownCount;
  }
}
