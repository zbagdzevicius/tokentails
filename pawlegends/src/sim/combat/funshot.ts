/**
 * Sim v21 (docs/plans/moba/V21-FUN.md §1.3, §2.2): the two "fun shots", stepped with the other projectiles (step 6).
 * They fly straight like a skillshot (effects/projectile.ts) and, unlike one, stop at a wall cell and on an enemy
 * structure's footprint.
 *
 * - Kibble (the Kibble Cannon): rolls through enemy minions (CANNON.minionDamage each) and one-shots the first enemy
 *   hero it touches (KABOOM: an execute that skips Nine Lives). A parry sends it back; a Guard stops it and breaks
 *   (`cannonBlock`). An enemy
 *   tower or core takes CANNON.structureBp of its max HP, a neutral CANNON.neutralBp; both stop it.
 * - Yarn (the Mega Yarn Ball): pierces; enemy heroes and minions take damage and a knockback along the roll, each once;
 *   an enemy structure takes YARN.structureBp and stops it; allies and neutrals let it through. Where it stops, the
 *   ball rests (units/yarn.ts).
 */
import { CANNON, YARN } from '../../data/fun';
import { MAP } from '../../data/map';
import { EFFECTS } from '../../data/effects';
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_HZ } from '../../data/timeline';
import { applyBp, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, MAX_ENTITIES, RANGE, TEAM_NEUTRAL, pHas } from '../world';
import { cellOfTeam, walkable } from '../map/grid';
import { dealDamage } from './damage';
import { markHit, reflectSkillshot } from '../effects/projectile';
import { alongLine } from '../effects/line';
import { isAbilityTarget } from '../effects/targets';
import { knockback } from '../effects/knockback';
import { breakGuard, domeShields, guardBlocks } from '../heroes/brutus';
import { parryOpen } from '../heroes/clem';
import { isInvulnerable, isStructure, radiusOf } from '../units/kinds';
import { yarnRest } from '../units/yarn';

/** Is projectile kind `k` a fun shot? */
export const isFunShot = (k: number): boolean => k === PROJECTILE_KIND.kibble || k === PROJECTILE_KIND.yarn;

const cand = new Int32Array(MAX_ENTITIES);
const key = new Int32Array(MAX_ENTITIES);

/** May the fun shot of `team` touch `e` (a unit an ability may hit, or an enemy structure that stops it)? */
function touchable(m: MatchHandle, e: number, team: number): boolean {
  const w = m.world;
  if (isStructure(w, e)) return w.alive[e] === 1 && w.team[e] !== team && w.team[e] < TEAM_NEUTRAL;
  return isAbilityTarget(w, e, team) && !domeShields(w, team, e);
}

/** End a fun shot at (x, y): a kibble that hit no hero is a whiff; a yarn ball comes to rest. */
function endShot(m: MatchHandle, p: number, x: number, y: number): void {
  const w = m.world;
  w.pAlive[p] = 0;
  if (w.pKind[p] === PROJECTILE_KIND.yarn) {
    if (w.pEffB[p] >= YARN.strike) m.events.push({ type: 'yarnStrike', tick: w.globals[G.Tick], id: w.pOwner[p], n: w.pEffB[p] });
    yarnRest(m, w.pEffA[p], x, y);
  } else m.events.push({ type: 'cannonWhiff', tick: w.globals[G.Tick], id: w.pOwner[p], x, y });
}

/** A structure's share of max HP (rounded down, at least 1) for a fun shot. */
const share = (m: MatchHandle, e: number, bp: number): number => Math.max(1, applyBp(m.world.maxHp[e], bp));

/** One tick of fun shot `p`. */
export function stepFunShot(m: MatchHandle, p: number): void {
  const w = m.world;
  const step = idiv(w.pSpeed[p], TICK_HZ);
  const move = Math.min(step, w.pTtl[p]);
  const ax = w.pX[p];
  const ay = w.pY[p];
  let bx = ax + idiv(w.pVx[p] * move, step);
  let by = ay + idiv(w.pVy[p] * move, step);
  if (guardBlocks(w, w.pTeam[p], bx, by, -1, ax, ay)) {
    if (w.pKind[p] === PROJECTILE_KIND.kibble) {
      // The Guard (or Guard Post dome) eats the kibble and breaks; Sir Brutus lives. A save, not a whiff.
      w.pAlive[p] = 0;
      const id = breakGuard(w, w.pTeam[p], bx, by, ax, ay);
      m.events.push({ type: 'cannonBlock', tick: w.globals[G.Tick], id, src: w.pOwner[p], x: ax, y: ay });
      return;
    }
    endShot(m, p, ax, ay);
    return;
  }
  // The first wall sample on the way (the centre enters a blocked cell): the shot ends at the sample before it.
  let wall = false;
  const n = idiv(move, EFFECTS.wallStep) + 1;
  for (let k = 1; k <= n; k++) {
    const sx = ax + idiv((bx - ax) * k, n);
    const sy = ay + idiv((by - ay) * k, n);
    if (!walkable(m.grid, cellOfTeam(sx, sy, w.pTeam[p]))) {
      wall = true;
      bx = ax + idiv((bx - ax) * (k - 1), n);
      by = ay + idiv((by - ay) * (k - 1), n);
      break;
    }
  }
  w.pX[p] = bx;
  w.pY[p] = by;
  w.pTtl[p] -= move;
  const team = w.pTeam[p];
  let c = 0;
  for (let e = 0; e < RANGE.end; e++) {
    if (pHas(w, p, e) || !touchable(m, e, team)) continue;
    const along = alongLine(ax, ay, bx, by, w.pRadius[p], w.x[e], w.y[e], radiusOf(w, e));
    if (along < 0) continue;
    let i = c++;
    while (i > 0 && key[i - 1] > along) {
      cand[i] = cand[i - 1];
      key[i] = key[i - 1];
      i--;
    }
    cand[i] = e;
    key[i] = along;
  }
  const kibble = w.pKind[p] === PROJECTILE_KIND.kibble;
  for (let i = 0; i < c; i++) {
    const e = cand[i];
    if (w.alive[e] === 0) continue;
    const owner = w.pOwner[p];
    if (parryOpen(w, e)) {
      reflectSkillshot(w, p, e);
      if (kibble) m.events.push({ type: 'cannonParry', tick: w.globals[G.Tick], id: e });
      return;
    }
    markHit(w, p, e);
    if (isStructure(w, e)) {
      if (!isInvulnerable(w, e)) {
        const bp = kibble ? CANNON.structureBp : YARN.structureBp;
        dealDamage(m, owner, team, Kind.Hero, e, share(m, e, bp), 'ability', { pure: true, backdoor: true });
      }
      endShot(m, p, w.pX[p], w.pY[p]);
      return;
    }
    const hero = w.kind[e] === Kind.Hero;
    if (kibble) {
      if (hero) {
        w.pAlive[p] = 0;
        m.events.push({ type: 'kaboom', tick: w.globals[G.Tick], src: owner, dst: e });
        dealDamage(m, owner, team, Kind.Hero, e, 1, 'ability', { pure: true, execute: true });
        return;
      }
      if (w.team[e] === TEAM_NEUTRAL) {
        dealDamage(m, owner, team, Kind.Hero, e, share(m, e, CANNON.neutralBp), 'ability', { pure: true });
        endShot(m, p, w.pX[p], w.pY[p]);
        return;
      }
      dealDamage(m, owner, team, Kind.Hero, e, CANNON.minionDamage, 'ability');
      continue;
    }
    // Yarn: neutrals let it roll on; enemy heroes and minions are bowled over.
    if (w.team[e] === TEAM_NEUTRAL) continue;
    const dmg = hero ? YARN.heroDamage + applyBp(w.maxHp[e], YARN.heroBp) : YARN.minionDamage;
    dealDamage(m, owner, team, Kind.Hero, e, dmg, 'ability');
    if (hero) w.pEffB[p]++;
    if (w.alive[e] === 1 && w.hp[e] > 0) knockback(m, e, w.x[e] - w.pVx[p], w.y[e] - w.pVy[p], YARN.knock, w.facing[e]);
  }
  if (wall || w.pTtl[p] <= 0 || bx < 0 || by < 0 || bx > MAP.width || by > MAP.height) endShot(m, p, bx, by);
}
