/**
 * The chase harness (founder: "it's still can't hit properly while chasing"; V18-CHASE.md, V20-CHASE.md §3). For a hero
 * as chaser vs a fleeing enemy hero (straight, zig-zag, kiting to its tower, slowed, dashing) at target speed
 * -10/-5/0/+5/+10% of the chaser's, through four command paths:
 *   - `order`:  one sim Attack order (desktop right-click, bot, touch lock),
 *   - `hold`:   touch ATK held (a repeat every 350 ms: the sticky hero, else attackPreview) + the stick held toward the
 *               target (AttackYield / STICK_YIELD), the client view `lag` ticks behind the sim,
 *   - `tap`:    touch ATK tapped every 900 ms (no hold), the stick held toward the target,
 *   - `aclick`: desktop A-move on the ground at the target every 250 ms,
 * it counts swing starts, landed hits, cancelled windups with the reason, stick moves, windups cancelled with the timer
 * still spent, and time to first hit after first contact. Used by chase-harness.test.ts (JSON dump) and
 * chase-gate.test.ts (`npm run chase-gate`, the V20 regression gate).
 */
import { HERO_RULES } from '../../src/data/xp';
import type { Command, HeroId } from '../../src/sim/api';
import { Op } from '../../src/sim/api';
import { step } from '../../src/sim/index';
import { applyOrder } from '../../src/sim/units/hero';
import { attackRange, moveSpeed, radiusOf, targetable } from '../../src/sim/units/kinds';
import { inAttackRange } from '../../src/sim/combat/attack';
import { Kind, RANGE } from '../../src/sim/world';
import type { MatchHandle } from '../../src/sim/state';
import { AttackYield, stickTowardTarget, stickyAttackTarget } from '../../src/input/touch/assist';
import { attackPreview, type Unit } from '../../src/input/targeting';
import { heroMatch, hold, place, tanky } from '../../tests/unit/heroes/kit-helpers';

export const ME = 0;
export const FOE = 3;
export const TICKS = 30 * 6;
export const TICK_MS = 1000 / 30;

export type Path = 'straight' | 'zigzag' | 'tower' | 'slowedFoe' | 'slowedMe' | 'dash';
export type Mode = 'order' | 'hold' | 'tap' | 'aclick' | 'amove';

export interface Result {
  hero: HeroId;
  ranged: boolean;
  path: Path;
  mode: Mode;
  speedPct: number;
  lag: number;
  starts: number;
  hits: number;
  cancels: Record<string, number>;
  contactTick: number;
  firstHitTick: number;
  /** ticks in contact (centre distance <= reach) with the attack timer ready and no windup: lost swing time */
  idleReady: number;
  endGap: number;
  /** stick Move commands sent (touch modes) */
  moves: number;
  /** windups cancelled with the attack timer still running afterwards (v20: always 0) */
  timerLost: number;
}

export function reach(m: MatchHandle): number {
  return attackRange(m.world, ME) + radiusOf(m.world, ME) + radiusOf(m.world, FOE);
}

export function unitsOf(m: MatchHandle, hist: { x: number; y: number }[][], lag: number): Unit[] {
  const w = m.world;
  const out: Unit[] = [];
  const snap = hist[Math.max(0, hist.length - 1 - lag)];
  for (let id = 0; id < RANGE.towers + 40 && id < RANGE.end; id++) {
    if (w.kind[id] === Kind.None || w.alive[id] === 0) continue;
    if (w.kind[id] !== Kind.Hero && w.kind[id] !== Kind.Minion && w.kind[id] !== Kind.Tower && w.kind[id] !== Kind.Core) continue;
    if (w.team[id] !== 0 && !targetable(w, id, 0) && w.kind[id] !== Kind.Tower && w.kind[id] !== Kind.Core) continue;
    const p = id < RANGE.minions && snap ? snap[id] : { x: w.x[id], y: w.y[id] };
    const kind = w.kind[id] === Kind.Hero ? 'hero' : w.kind[id] === Kind.Minion ? 'minion' : w.kind[id] === Kind.Tower ? 'tower' : 'core';
    out.push({ id, kind, team: w.team[id], x: p.x, y: p.y, hp: w.hp[id], maxHp: w.maxHp[id], state: 'idle' } as Unit);
  }
  return out;
}

export function run(hero: HeroId, path: Path, mode: Mode, speedPct: number, lag = 0): Result {
  const m = heroMatch([hero, 'clem', 'clem', 'clem', 'clem', 'clem']);
  const w = m.world;
  for (let id = 0; id < 6; id++) place(m, id, 10000 + id * 3000, 58000, 0);
  hold(m, 1, 2, 4, 5, FOE);
  tanky(m, FOE, ME);
  let X0 = 30000;
  let Y = 35000;
  let goalX = X0 + 60000;
  let goalY = Y;
  if (path === 'tower') {
    // the nearest living team 1 tower: the target walks to it, starting 14 m short of it on open ground
    let best = -1;
    for (let id = RANGE.towers; id < RANGE.end; id++) if (w.kind[id] === Kind.Tower && w.team[id] === 1 && w.alive[id] === 1) best = best < 0 || w.x[id] < w.x[best] ? id : best;
    goalX = w.x[best];
    goalY = w.y[best];
    X0 = goalX - 16000;
    Y = goalY;
  }
  place(m, ME, X0, Y, 0);
  place(m, FOE, X0 + reach(m) - 100, Y, 0);
  const R = reach(m);
  const ranged = attackRange(w, ME) > HERO_RULES.meleeMaxRange;
  const meSpeed = moveSpeed(w, ME);
  const res: Result = { hero, ranged, path, mode, speedPct, lag, starts: 0, hits: 0, cancels: {}, contactTick: -1, firstHitTick: -1, idleReady: 0, endGap: 0, moves: 0, timerLost: 0 };
  const hist: { x: number; y: number }[][] = [];
  let lastAtk = -1e9;
  const yieldTo = new AttackYield();
  let lastStickAt = -1e9;
  let stickGoal = { x: w.x[ME], y: w.y[ME] };
  let lastStickA = NaN;
  let zig = 1;
  let dashed = false;
  const cancel = (why: string): void => {
    res.cancels[why] = (res.cancels[why] ?? 0) + 1;
  };
  for (let t = 0; t < TICKS; t++) {
    const now = t * TICK_MS;
    // target speed = chaser speed × (1 + pct); slows/hastes are re-applied every tick
    w.hasteT[FOE] = 5;
    w.slowT[FOE] = 5;
    w.hasteBp[FOE] = 0;
    w.slowBp[FOE] = 0;
    const base = moveSpeed(w, FOE);
    const want = Math.round((meSpeed * (100 + speedPct)) / 100);
    let bp = Math.round((want * 10000) / base) - 10000;
    if (path === 'slowedFoe' && t < 45) bp -= 3000;
    if (bp >= 0) w.hasteBp[FOE] = bp;
    else w.slowBp[FOE] = -bp;
    if (path === 'slowedMe' && t < 45) {
      w.slowT[ME] = 2;
      w.slowBp[ME] = 3000;
    }
    // target route
    if (path === 'zigzag') {
      if (t % 12 === 0) {
        zig = -zig;
        goalX = w.x[FOE] + 2000;
        goalY = Y + zig * 1500;
        applyOrder(m, FOE, { op: Op.Move, x: goalX, y: goalY });
      }
    } else if (t === 0) applyOrder(m, FOE, { op: Op.Move, x: goalX, y: goalY });
    if (path === 'dash' && !dashed && w.windup[ME] > 0) {
      dashed = true;
      applyOrder(m, FOE, { op: Op.Trick, x: w.x[FOE] + (w.x[FOE] - w.x[ME] >= 0 ? 6000 : -6000), y: w.y[FOE] });
    }
    if (path === 'dash' && dashed && w.order[FOE] === 0 && w.castPhase[FOE] === 0 && w.fmKind[FOE] === 0) applyOrder(m, FOE, { op: Op.Move, x: goalX, y: goalY });

    hist.push(Array.from({ length: RANGE.minions }, (_, i) => ({ x: w.x[i], y: w.y[i] })));
    const cmds: Command[] = [];
    if (mode === 'order') {
      if (t === 0) cmds.push({ op: Op.Attack, id: FOE });
    } else if (mode === 'aclick' || mode === 'amove') {
      // desktop, every 250 ms: A armed + a click on the target (aclick: the client sends Attack(id)) or on the ground
      // at it (amove: an attack-move, the sim acquires the nearest enemy)
      if (now - lastAtk >= 250) {
        lastAtk = now;
        cmds.push(mode === 'aclick' ? { op: Op.Attack, id: FOE } : { op: Op.AttackMove, x: w.x[FOE], y: w.y[FOE] });
      }
    } else {
      // touch, modelled with the client's own pure rules (V20-CHASE.md I1-I3): the ATK pick (sticky hero, else
      // attackPreview), AttackYield (the stick yields while the Attack order stands), the stick held at the target
      const units = unitsOf(m, hist, lag);
      const me = units.find((u) => u.id === ME)!;
      const range = attackRange(w, ME);
      const every = mode === 'hold' ? 350 : 900;
      if (now - lastAtk >= every) {
        lastAtk = now;
        const sticky = stickyAttackTarget(units, me, 0, range, yieldTo.check(units, me, 0, range));
        const id = sticky ?? attackPreview(units, me, 0, range, 'heroes');
        if (id !== null) {
          yieldTo.set(id);
          cmds.push({ op: Op.Attack, id });
        }
      }
      // stick held toward where the player SEES the target
      const ft = units.find((u) => u.id === FOE);
      const a = ft ? Math.atan2(ft.y - me.y, ft.x - me.x) : 0;
      const yid = yieldTo.check(units, me, 0, range);
      const tgt = yid !== null ? units.find((u) => u.id === yid) : undefined;
      const yields = !!tgt && stickTowardTarget(me.x, me.y, a, tgt);
      if (!yields) {
        const turn = Number.isNaN(lastStickA) ? Infinity : Math.abs(a - lastStickA);
        const near = Math.hypot(me.x - stickGoal.x, me.y - stickGoal.y) < 1000;
        if ((turn > (Math.PI * 2) / 32 || near) && now - lastStickAt >= 100) {
          stickGoal = { x: Math.round(me.x + Math.cos(a) * 2000), y: Math.round(me.y + Math.sin(a) * 2000) };
          lastStickAt = now;
          lastStickA = a;
          cmds.push({ op: Op.Move, x: stickGoal.x, y: stickGoal.y });
          res.moves++;
          // a move is a new command: a tapped order is over (a held ATK re-orders it on its next repeat)
          if (mode === 'tap') yieldTo.clear();
        }
      } else {
        lastStickA = NaN;
      }
    }
    const prevWind = w.windup[ME];
    const prevTimer = w.attackTimer[ME];
    const contact = inAttackRange(w, ME, FOE);
    if (contact && res.contactTick < 0) res.contactTick = t;
    step(m, cmds);
    let hit = false;
    for (const e of m.events) if (e.type === 'hit' && e.src === ME && e.dst === FOE && e.kind === 'basic') hit = true;
    if (hit) {
      res.hits++;
      if (res.firstHitTick < 0) res.firstHitTick = t;
    }
    if (prevWind === 0 && w.windup[ME] > 0) res.starts++;
    if (contact && prevWind === 0 && prevTimer === 0 && w.windup[ME] === 0) res.idleReady++;
    if (prevWind > 1 && w.windup[ME] === 0 && process.env.CHASE_DEBUG) console.log('cancel', hero, path, mode, 't', t, 'order', w.order[ME], 'fm', w.fmKind[ME], 'cmds', JSON.stringify(cmds));
    // a windup cut short with the attack timer still spent (v19: always; v20 S1: never)
    if (prevWind > 1 && w.windup[ME] === 0 && w.attackTimer[ME] > 0) res.timerLost++;
    if (prevWind > 1 && w.windup[ME] === 0) cancel(w.order[ME] === 0 || w.order[ME] === 1 ? 'orderReplaced(move/stop)' : 'cc/busy');
    if (prevWind === 1) {
      const tgt = w.target[ME];
      if (tgt !== FOE) {
        cancel('retarget');
        if (process.env.CHASE_DEBUG) console.log('retarget', hero, path, mode, 't', t, 'to', tgt, 'kind', w.kind[tgt], 'gap', Math.round(Math.hypot(w.x[FOE] - w.x[ME], w.y[FOE] - w.y[ME]) - R));
      }
      else if (!targetable(w, FOE, 0)) cancel('untargetable');
      else if (!inAttackRange(w, ME, FOE, HERO_RULES.swingBreak)) {
        cancel('outOfRangeAtEnd');
        if (w.attackTimer[ME] > 0) res.timerLost++;
      }
    }
  }
  res.endGap = Math.round(Math.hypot(w.x[FOE] - w.x[ME], w.y[FOE] - w.y[ME]) - R);
  return res;
}

