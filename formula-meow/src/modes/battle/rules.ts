/**
 * Balloon battle rules (`RaceConfig.mode = 'battle'` on an arena, inside the sim, GDD 3.1 math only).
 *
 * 8 cats, 3 balloons each, a 2:30 round scored in points (MK8 style, SIM_VERSION 6). An item hit that lands pops one
 * balloon and scores a point for the thrower (then 3 s of balloon immunity); a bump while boosting (mini-turbo, pad,
 * Catnip, Zoomies) at a closing speed above 6 m/s steals one and scores a point (the thief can hold up to 5). At 0
 * balloons a cat is popped out: it loses one point, greys and cannot be hit for `outTime` s, then comes back with 3
 * balloons and immunity. Nobody is out for good, so every cat plays the whole round. The round ends when the time is
 * up. SIM_VERSION 11: from `FRENZY_TICK` (the last 30 s, a `frenzy` event) pops and steals score 2. Ranking: points, then balloons held, then fewer hits taken, then the lower slot. On the last tick the ranking
 * becomes `RaceState.order` (and each kart's place), so the results show it; nobody gets a finish time.
 *
 * The free-roam AI (battle/ai.ts) replaces the racing-line driver for the round. State: `RaceState.mode.battle`.
 */
import { TICK_HZ, type HitKind, type RaceState } from '../../types';
import type { ModeRules, SimContext } from '../../core/sim/plugins';
import { fnvInt } from '../../core/sim/hash';
import { atan2L, PI } from '../../core/sim/fixed';
import { queryTrack, type TrackHit } from '../../core/track/query';
import { Surface } from '../../types';
import { SLOT, createBattleAI } from './ai';

export const BATTLE = {
  balloons: 3,
  maxBalloons: 5,
  /** round length, seconds */
  time: 150,
  /** closing speed (m/s) a boosting bump needs to steal a balloon */
  stealSpeed: 6,
  /** balloon immunity after losing one (and after coming back), seconds */
  immune: 3,
  /** a popped-out cat sits out this long, then comes back with full balloons, seconds */
  outTime: 2.5,
  /** points lost when popped out */
  outCost: 1,
  /** SIM_VERSION 11 (iteration 4, F14): the last this-many seconds are a frenzy: pops and steals score `frenzyPoints` */
  frenzy: 30,
  frenzyPoints: 2,
} as const;

export const BATTLE_TICKS = BATTLE.time * TICK_HZ;
/** SIM_VERSION 11: ticks after GO from which pops and steals score double (the `frenzy` event fires on this tick) */
export const FRENZY_TICK = BATTLE_TICKS - BATTLE.frenzy * TICK_HZ;
const IMMUNE = Math.round(BATTLE.immune * TICK_HZ);
const OUT_TICKS = Math.round(BATTLE.outTime * TICK_HZ);
/** hairball, yarn, cucumber, catnip, box, bell, zoomies, laser (no Laser Dot in battle) */
export const BATTLE_ITEMS: readonly number[] = [16, 18, 18, 18, 14, 4, 8, 0];

export interface BattleState {
  /** balloon immunity ticks per kart */
  imm: number[];
  /** tick a kart went out (0 = still in) */
  outAt: number[];
  /** points: pops and steals scored, minus one per pop-out (never below 0) */
  score: number[];
  /** times each kart was popped out */
  outs: number[];
  hitsTaken: number[];
  pops: number[];
  steals: number[];
  /** per ordered pair steal cooldown (a × n + b) */
  stealCd: number[];
  over: number;
  /** the final ranking (kart indices, winner first), set on the last tick */
  rank: number[];
  /** free-roam AI scratch per kart (battle/ai.ts), plain data so it is hashed */
  ai: number[];
}

export const battleOf = (st: RaceState): BattleState => (st.mode as { battle: BattleState }).battle;

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };

/** Spread the field round the arena, every other cat facing the other way (fights start at once, not in a queue). */
export function spreadField(ctx: SimContext): void {
  const { st, track: t } = ctx;
  const n = st.karts.length;
  for (let i = 0; i < n; i++) {
    const k = st.karts[i];
    const j = Math.floor((i * t.n) / n + t.n / (2 * n)) % t.n;
    const lim = Math.max(0, t.halfW[j] - 3);
    const d = i % 2 === 0 ? lim * 0.4 : -lim * 0.4;
    k.x = t.px[j] - t.tz[j] * d;
    k.z = t.pz[j] + t.tx[j] * d;
    const fwd = atan2L(t.tx[j], t.tz[j]);
    k.heading = i % 2 === 0 ? fwd : fwd + PI;
    queryTrack(t, k.x, k.z, j, hit);
    k.y = hit.y;
    k.si = hit.i;
    k.s = hit.s;
    k.d = hit.d;
    k.dist = hit.s;
    k.progDist = hit.s;
  }
}

export function createBattleRules(): ModeRules {
  const eliminate = (ctx: SimContext, i: number) => {
    const st = ctx.st;
    const b = battleOf(st);
    const k = st.karts[i];
    if (k.out) return;
    k.out = 1;
    k.balloons = 0;
    k.item = null;
    k.itemCount = 0;
    k.rouletteTicks = 0;
    k.itemBuf = 0;
    b.outAt[i] = st.tick;
    b.outs[i]++;
    b.score[i] = Math.max(0, b.score[i] - BATTLE.outCost);
    ctx.emit({ type: 'eliminated', kart: i });
  };

  const revive = (ctx: SimContext, i: number) => {
    const b = battleOf(ctx.st);
    const k = ctx.st.karts[i];
    k.out = 0;
    k.balloons = BATTLE.balloons;
    b.outAt[i] = 0;
    b.imm[i] = IMMUNE;
    k.invTicks = Math.max(k.invTicks, IMMUNE);
  };

  const lose = (ctx: SimContext, victim: number) => {
    const st = ctx.st;
    const b = battleOf(st);
    const k = st.karts[victim];
    k.balloons--;
    b.imm[victim] = IMMUNE;
    // SIM_VERSION 10: balloon immunity is invulnerability (applyHit blocks the hit): an item that cannot pop a balloon
    // no longer spins the cat again and costs it its speed for nothing (about a quarter of all battle hits did)
    k.invTicks = Math.max(k.invTicks, IMMUNE);
    if (k.balloons <= 0) eliminate(ctx, victim);
  };

  /** Points a pop or a steal scores now (double in the frenzy: the last 30 s of the round). */
  const pts = (ctx: SimContext): number => (ctx.st.tick - ctx.goTick >= FRENZY_TICK ? BATTLE.frenzyPoints : 1);

  /** Rank and end the round (`isOver` writes the ranking into the race order after positions ran). */
  const finish = (ctx: SimContext) => {
    const st = ctx.st;
    const b = battleOf(st);
    const n = st.karts.length;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((x, y) => {
      const kx = st.karts[x];
      const ky = st.karts[y];
      const bx = kx.out ? 0 : kx.balloons;
      const by = ky.out ? 0 : ky.balloons;
      return b.score[y] - b.score[x] || by - bx || b.hitsTaken[x] - b.hitsTaken[y] || x - y;
    });
    b.rank = idx;
    for (let r = 0; r < n; r++) ctx.emit({ type: 'finish', kart: idx[r], a: r + 1 });
    b.over = 1;
  };

  return {
    init(ctx) {
      const st = ctx.st;
      const n = st.karts.length;
      const z = () => new Array<number>(n).fill(0);
      (st.mode as { battle?: BattleState }).battle = { imm: z(), outAt: z(), hitsTaken: z(), pops: z(), steals: z(), score: z(), outs: z(), stealCd: new Array<number>(n * n).fill(0), over: 0, rank: [], ai: new Array<number>(n * SLOT).fill(0) };
      for (const k of st.karts) {
        k.balloons = BATTLE.balloons;
        k.out = 0;
      }
      spreadField(ctx);
      // the free-roam driver replaces the racing-line one for this round (same plugins object as SimWorld's)
      if (ctx.plugins) {
        ctx.plugins.ai = createBattleAI();
        ctx.plugins.ai.init?.(ctx);
      }
    },
    onHit(ctx, victim, by, kind: HitKind) {
      const st = ctx.st;
      const b = battleOf(st);
      const k = st.karts[victim];
      if (b.over || k.out || b.imm[victim] > 0) return;
      // a Laser-Dot style chase is a nuisance, not a pop (there is no Laser Dot in battle, keep it honest anyway)
      if (kind === 'chase') return;
      b.hitsTaken[victim]++;
      if (by >= 0 && by !== victim) {
        b.pops[by]++;
        b.score[by] += pts(ctx);
      }
      ctx.emit({ type: 'balloonPop', kart: victim, b: by });
      lose(ctx, victim);
    },
    onBump(ctx, a, c, vrel) {
      const st = ctx.st;
      const b = battleOf(st);
      if (b.over || vrel < BATTLE.stealSpeed) return;
      const ka = st.karts[a];
      const kc = st.karts[c];
      const boostA = ka.boostTicks > 0 || ka.autoTicks > 0;
      const boostC = kc.boostTicks > 0 || kc.autoTicks > 0;
      if (boostA === boostC) return;
      const thief = boostA ? a : c;
      const victim = boostA ? c : a;
      const kt = st.karts[thief];
      const kv = st.karts[victim];
      const n = st.karts.length;
      const p = thief * n + victim;
      if (kt.out || kv.out || kv.respawnTicks > 0 || kv.shieldTicks > 0 || kv.invTicks > 0 || b.imm[victim] > 0 || b.stealCd[p] > 0) return;
      b.stealCd[p] = IMMUNE * 2;
      b.steals[thief]++;
      b.score[thief] += pts(ctx);
      b.hitsTaken[victim]++;
      if (kt.balloons < BATTLE.maxBalloons) kt.balloons++;
      ctx.emit({ type: 'balloonSteal', kart: victim, b: thief });
      lose(ctx, victim);
    },
    step(ctx) {
      const st = ctx.st;
      const b = battleOf(st);
      if (b.over) return;
      for (let i = 0; i < b.imm.length; i++) if (b.imm[i] > 0) b.imm[i]--;
      for (let i = 0; i < b.stealCd.length; i++) if (b.stealCd[i] > 0) b.stealCd[i]--;
      for (let i = 0; i < st.karts.length; i++) if (st.karts[i].out && st.tick - b.outAt[i] >= OUT_TICKS) revive(ctx, i);
      // the round clock is 2:30 even if `timeLimitTicks` is longer (tests pass a safety margin)
      const limit = Math.min(ctx.cfg.timeLimitTicks ?? BATTLE_TICKS, BATTLE_TICKS);
      if (st.tick - ctx.goTick === FRENZY_TICK) ctx.emit({ type: 'frenzy', kart: -1 });
      if (st.tick + 1 - ctx.goTick >= limit) finish(ctx);
    },
    isOver(ctx) {
      const st = ctx.st;
      const b = battleOf(st);
      if (b.over !== 1) return false;
      // runs after positions on the last tick: the battle ranking is the race order
      for (let r = 0; r < b.rank.length; r++) {
        st.order[r] = b.rank[r];
        st.karts[b.rank[r]].place = r + 1;
      }
      return true;
    },
    itemRow: () => BATTLE_ITEMS,
    hash(st, h) {
      const b = battleOf(st);
      if (!b) return h;
      for (const a of [b.imm, b.outAt, b.hitsTaken, b.pops, b.steals, b.score, b.outs, b.stealCd, b.ai, b.rank]) for (const v of a) h = fnvInt(h, Math.round(v * 1000));
      return fnvInt(h, b.over);
    },
  };
}
