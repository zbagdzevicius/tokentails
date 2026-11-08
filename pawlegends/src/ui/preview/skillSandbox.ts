/**
 * Skill preview sandbox (pure: no DOM, no three; Node-importable for the tests).
 *
 * A real sim match (src/sim, read only: createMatch / step / snapshot) set up as a tiny training arena: the previewed
 * hero (slot 0), an allied hero beside it (slot 1, hurt, so heals and shields read) and an enemy dummy (slot 3) in the
 * open jungle by the river, every seat a human (a PvP match with six humans, so no in-sim bot moves anyone), at a
 * clock past the first wave so no minion walks in. A short script casts the slot at the dummy (or at the ally for an
 * ally-targeted skill), recasts it when the kit opens a recast window, and loops. Because the sim is the real one, the
 * clip always matches the shipped skill: windups, dashes, projectiles, zones, crowd control and damage numbers.
 *
 * The world is touched only here, at setup, on this sandbox's own private match (positions, level, HP): never the
 * sim code, never a live match.
 */
import { HERO_IDS, HEROES } from '../../data/heroes';
import type { CastSlot, Command, HeroId, MatchConfig, SimEvent, Snapshot, TrickId } from '../../sim/api';
import { NO_TARGET, Op } from '../../sim/api';
import { canCast, createMatch, snapshot, step, type MatchHandle } from '../../sim';
import { levelUp } from '../../sim/progression/levels';
import { G, Order, UnitState } from '../../sim/world';
import { XP } from '../../data/xp';
import { aimFor, type AimSpec } from '../../input/abilities';
import { SIM_TIMING } from '../../render/anim/timing';

export type PreviewSlot = 'q' | 'w' | 'e' | 'r';
export const PREVIEW_SLOTS: readonly PreviewSlot[] = Object.freeze(['q', 'w', 'e', 'r'] as PreviewSlot[]);
const SLOT_INDEX: Readonly<Record<PreviewSlot, CastSlot>> = { q: 0, w: 1, e: 2, r: 3 };

/** Sim seats: the hero, its ally, the dummy. */
export const ME = 0;
export const ALLY = 1;
export const DUMMY = 3;

/**
 * The arena centre (mm): the open jungle between the rat camp walls (x ≤ 37 m) and the river (x ≥ 46 m), on the
 * mid line. No brush, no wall, no tower within 15 m; camps and Pudding wake long after a loop ends.
 */
export const ARENA = Object.freeze({ x: 41500, y: 30000 });
/** The sim clock a loop starts at: past the barrier drop and the first wave (240), well before the second (840). */
export const START_TICK = 300;
/** The hero's level in the preview: the ultimate is unlocked. */
export const PREVIEW_LEVEL = Math.max(XP.ultimateLevel, 4);
/** Ticks the hero stands before casting (the viewer sees the setup first). */
export const CAST_AT = 18;
/** Loop length bounds (ticks at 30 Hz): 3 to 6 s. */
export const LOOP_MIN = 90;
export const LOOP_MAX = 180;

/** The dummy: the other side's tank (melee, sturdy). The ally: a hero of the hero's own side that is not the hero. */
export function dummyFor(hero: HeroId): HeroId {
  return HEROES[hero].side === 'cat' ? 'bravo' : 'meatball';
}
export function allyFor(hero: HeroId): HeroId {
  const pref: HeroId = HEROES[hero].side === 'cat' ? 'lambo' : 'brutus';
  return pref === hero ? (HEROES[hero].side === 'cat' ? 'meatball' : 'bravo') : pref;
}

export interface SkillScenario {
  hero: HeroId;
  slot: PreviewSlot;
  aim: AimSpec;
  /** Who the cast aims at. */
  at: 'enemy' | 'ally' | 'self';
  /** Hero ↔ dummy distance (mm). */
  gap: number;
  /** Relative tick of the first cast, and of the recast (−1 none). */
  castAt: number;
  recastAt: number;
  /** Loop length (ticks); the sandbox restarts after it. */
  loop: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The hero ↔ dummy gap that shows the skill: inside its reach, not so close the dummy's swing fills the clip. */
function gapFor(aim: AimSpec): number {
  const r = aim.range > 0 ? aim.range : 3000;
  switch (aim.kind) {
    case 'self':
      // a ring or cone around the hero: the dummy well inside its edge
      return clamp(Math.round(r * 0.6), 1900, 4200);
    case 'unit':
    case 'point':
      return clamp(Math.round(r * 0.7), 2600, 5200);
    default:
      if (aim.shape === 'dash') return aim.away ? 2600 : clamp(r, 2600, 5200);
      return clamp(Math.round(r * 0.65), 2400, 5200);
  }
}

/** The scripted scenario of a hero's slot (pure; the tests walk every hero × slot). */
export function scenarioFor(hero: HeroId, slot: PreviewSlot): SkillScenario {
  const aim = aimFor(hero, SLOT_INDEX[slot]);
  const t = SIM_TIMING[hero].slots[slot];
  const at: SkillScenario['at'] = aim.smart === 'ally' ? 'ally' : aim.kind === 'self' ? 'self' : 'enemy';
  const recast = t.recasts > 0 || t.recastWindow > 0 || (aim.returnTicks ?? 0) > 0;
  const window = t.recastWindow > 0 ? t.recastWindow : (aim.returnTicks ?? 0);
  // the recast lands mid-window (never past 1.2 s), after the first cast and its dash or windup
  const recastAt = recast ? CAST_AT + t.windup + Math.max(t.dashTicks, 8) + clamp(Math.floor(window / 3), 10, 36) : -1;
  // what has to play out: the windup, the travel, an arming zone, a short state; then a tail for the hits to read
  const body = t.windup + Math.max(t.dashTicks, Math.min(t.projTicks, 45), t.arm + 15, Math.min(t.duration, 75));
  const loop = clamp(Math.max(CAST_AT + body + 45, recastAt > 0 ? recastAt + 50 : 0), LOOP_MIN, LOOP_MAX);
  return { hero, slot, aim, at, gap: gapFor(aim), castAt: CAST_AT, recastAt, loop };
}

/** The sandbox match config: six humans (no bots), the hero, its ally and the dummy; the rest of the seats at home. */
function configFor(hero: HeroId): MatchConfig {
  const dummy = dummyFor(hero);
  const ally = allyFor(hero);
  const sameSide = HERO_IDS.filter((h) => HEROES[h].side === HEROES[hero].side && h !== hero && h !== ally);
  const otherSide = HERO_IDS.filter((h) => HEROES[h].side !== HEROES[hero].side && h !== dummy);
  const tricks: TrickId[] = ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'];
  return {
    seed: 7,
    difficulty: 'hard',
    mode: 'pvp',
    humans: [0, 1, 2, 3, 4, 5],
    picks: [hero, ally, sameSide[0], dummy, otherSide[0], otherSide[1]],
    tricks,
  } as MatchConfig;
}

/** One frame of the sandbox: the team-0 snapshot of this tick and whether the hero's cast landed in the sim on it. */
export interface SandboxFrame {
  snap: Snapshot;
  /** Relative tick in the loop (0..loop-1). */
  t: number;
  /** True on the tick the sim emitted the previewed slot's `cast` event for the hero. */
  cast: boolean;
}

/**
 * The live sim behind one preview. `next()` advances one sim tick (30 Hz) and returns its snapshot; after `loop`
 * ticks it starts over from a fresh match (a few ms), so every loop is identical (the sim is deterministic).
 */
export class SkillSandbox {
  readonly scenario: SkillScenario;
  private m!: MatchHandle;
  private t = 0;
  /** Casts of the previewed slot the sim registered this loop (`cast` events from the hero). */
  casts = 0;
  /** Loops completed. */
  loops = 0;
  /** Every cast tick of the current loop (relative), for the tests. */
  readonly castTicks: number[] = [];

  constructor(
    readonly hero: HeroId,
    readonly slot: PreviewSlot,
  ) {
    this.scenario = scenarioFor(hero, slot);
    this.reset();
  }

  /** Back to the loop's first tick (a fresh match). */
  reset(): void {
    this.m = createMatch(configFor(this.hero)) as MatchHandle;
    this.setup();
    this.t = 0;
    this.casts = 0;
    this.castTicks.length = 0;
  }

  private place(id: number, x: number, y: number, facing: number): void {
    const w = this.m.world;
    w.x[id] = x;
    w.y[id] = y;
    w.moveX[id] = x;
    w.moveY[id] = y;
    w.facing[id] = facing;
    w.order[id] = Order.None;
    w.state[id] = UnitState.Idle;
    w.target[id] = -1;
    w.pathLen[id] = 0;
    w.zoomT[id] = 0;
  }

  private setup(): void {
    const m = this.m;
    const w = m.world;
    const sc = this.scenario;
    w.globals[G.Tick] = START_TICK;
    for (const id of [ME, ALLY, DUMMY]) while (w.level[id] < PREVIEW_LEVEL) levelUp(m, id);
    const half = sc.gap >> 1;
    this.place(ME, ARENA.x - half, ARENA.y, 0);
    this.place(DUMMY, ARENA.x + half, ARENA.y, 2048);
    // the ally stands behind the hero's shoulder, out of the dummy's swing; hurt, so a heal or shield shows
    this.place(ALLY, ARENA.x - half - 2200, ARENA.y + 3000, 0);
    w.hp[ALLY] = Math.round((w.maxHp[ALLY] * 55) / 100);
    w.hp[ME] = Math.round((w.maxHp[ME] * 80) / 100);
    // the setup's own events (level-ups, talent offers) are not part of the clip
    m.events = [];
    w.globals[G.HumanActAt] = START_TICK;
  }

  /** The cast command of the scenario at this tick, aimed from the live positions. */
  private command(): Command {
    const w = this.m.world;
    const sc = this.scenario;
    const slot = SLOT_INDEX[sc.slot];
    if (sc.at === 'self') return { op: Op.Cast, slot, x: w.x[ME], y: w.y[ME], id: NO_TARGET };
    const tgt = sc.at === 'ally' ? ALLY : DUMMY;
    const id = sc.aim.kind === 'unit' ? tgt : NO_TARGET;
    return { op: Op.Cast, slot, x: w.x[tgt], y: w.y[tgt], id };
  }

  /** Advance one sim tick. */
  next(): SandboxFrame {
    if (this.t >= this.scenario.loop) {
      this.loops++;
      this.reset();
    }
    const sc = this.scenario;
    const t = this.t;
    let cmds: Command[] | undefined;
    if (t === sc.castAt || (t === sc.recastAt && canCast(this.m.world, ME, SLOT_INDEX[sc.slot]))) cmds = [this.command()];
    // every other seat idles (an empty stream: the human gates see no command)
    step(this.m, cmds, undefined);
    const snap = snapshot(this.m, 0);
    let cast = false;
    const want = SLOT_INDEX[sc.slot];
    for (const e of this.m.events as SimEvent[]) {
      if (e.type === 'cast' && e.src === ME && e.slot === want) {
        cast = true;
        this.casts++;
        this.castTicks.push(t);
      }
    }
    this.t = t + 1;
    return { snap, t, cast };
  }

  /** Relative tick of the next `next()`. */
  get tick(): number {
    return this.t;
  }
}
