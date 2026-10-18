/**
 * Damage (POC.md §6.1, §5 tower rules, §7.3 phases) and deaths (§4.3 step 7).
 *
 * `dealDamage` applies a hit at once (hp may go below 0); `resolveDeaths` runs once per tick in step 7, so units
 * that hit each other on the same tick both land their hits (no id-order advantage).
 */
import { HERO_RULES } from '../../data/xp';
import { HERO_IDS, HERO_VS_HERO_BP, HEROES, SIDE_EDGE } from '../../data/heroes';
import { RADIUS } from '../../data/map';
import { SUDDEN_DEATH, SUNSET } from '../../data/timeline';
import { TOWERS } from '../../data/towers';
import type { SimEvent } from '../api';
import { ZONE_KIND } from '../../data/effects';
import { applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, Order, RANGE, UnitState, type World } from '../world';
import { attackRange, coreExposed, isInvulnerable, isStructure } from '../units/kinds';
import { onStructureDestroyed } from '../units/tower';
import { clearStatus } from '../effects/status';
import { endArena } from '../effects/tether';
import { kitOf } from '../heroes/kit';
import { campKilled, heroKilled, minionKilled } from '../progression/xp';
import { onRatDied, packBuff } from '../units/camp';
import { onPuddingDown } from '../units/pudding';
import { respawnTicks } from '../progression/respawn';
import { bonusDamage, nineLives } from '../effects/bonus';
import { HUMAN_SLOT, teamOfSlot } from '../api';
import { rulesOf } from '../rules';

export { respawnTicks } from '../progression/respawn';

export type HitKind = Extract<SimEvent, { type: 'hit' }>['kind'];

export interface HitOptions {
  /** Exact amount: no armour, no Sunset or backdoor modifier (fountain, Sudden Death). */
  pure?: boolean;
  /** Ignore structure invulnerability (Sudden Death core damage). */
  pierce?: boolean;
}

/** Is a minion of `team` within TOWERS.backdoorRange of (x, y)? */
function minionNear(w: World, team: number, x: number, y: number): boolean {
  const r2 = TOWERS.backdoorRange * TOWERS.backdoorRange;
  for (let id = RANGE.minions; id < RANGE.towers; id++) {
    if (w.alive[id] === 1 && w.team[id] === team && dist2(w.x[id], w.y[id], x, y) <= r2) return true;
  }
  return false;
}

/**
 * Hit `dst` for `raw` damage from `src` (an entity id, or −1 for the map) of `srcTeam`. `srcKind` is the source's
 * Kind (it may have died since it fired). Returns the damage dealt to HP.
 */
export function dealDamage(
  m: MatchHandle,
  src: number,
  srcTeam: number,
  srcKind: number,
  dst: number,
  raw: number,
  kind: HitKind,
  opts: HitOptions = {},
): number {
  const w = m.world;
  if (w.alive[dst] === 0 || w.hp[dst] <= 0 || raw <= 0) return 0;
  const structure = isStructure(w, dst);
  if (structure && !opts.pierce && isInvulnerable(w, dst)) return 0;
  const tick = w.globals[G.Tick];
  const heroSrc = !opts.pure && srcKind === Kind.Hero && src >= 0 && src < RANGE.minions && w.kind[src] === Kind.Hero;
  if (heroSrc) {
    raw = bonusDamage(w, src, kitOf(w, src).outgoing?.(m, src, dst, raw) ?? raw);
    if (w.kind[dst] === Kind.Hero) {
      raw = applyBp(raw, HERO_VS_HERO_BP);
      if (w.globals[G.SideEdge] !== 0) {
        raw = applyBp(raw, SIDE_EDGE[HEROES[HERO_IDS[w.sub[src]]].side].heroDmgBp);
        raw = applyBp(raw, SIDE_EDGE[HEROES[HERO_IDS[w.sub[dst]]].side].heroTakenBp);
      }
    }
    if (src === HUMAN_SLOT) raw = applyBp(raw, rulesOf(m).humanDamageBp);
  }
  if (dst === HUMAN_SLOT && !opts.pure && srcTeam !== w.team[dst]) raw = applyBp(raw, rulesOf(m).humanTakenBp);
  let dmg = opts.pure ? raw : idiv(raw * HERO_RULES.armourBase, HERO_RULES.armourBase + w.armour[dst]);
  if (structure && !opts.pure) {
    if (tick >= w.globals[G.Sunset]) dmg = applyBp(dmg, SUNSET.structureDamageBp);
    // Backdoor protection: heroes deal half when no minion of their team is near the structure.
    const guarded = w.team[dst] === teamOfSlot(HUMAN_SLOT) || rulesOf(m).enemyBackdoor;
    if (srcKind === Kind.Hero && guarded && !minionNear(w, srcTeam, w.x[dst], w.y[dst])) dmg = applyBp(dmg, TOWERS.backdoorBp);
  }
  const heroDst = w.kind[dst] === Kind.Hero;
  if (heroDst && !opts.pure) dmg = kitOf(w, dst).incoming?.(m, dst, src, dmg) ?? dmg;
  let shielded = 0;
  if (w.shield[dst] > 0) {
    shielded = Math.min(w.shield[dst], dmg);
    w.shield[dst] -= shielded;
    dmg -= shielded;
  }
  if (heroDst && dmg > 0) {
    const extra = kitOf(w, dst).absorb?.(w, dst, dmg) ?? 0;
    shielded += extra;
    dmg -= extra;
  }
  if (heroDst) {
    dmg = nineLives(m, dst, dmg);
    // Zoomies end on any damage.
    if (dmg + shielded > 0) w.zoomT[dst] = 0;
  }
  // Sim v5, Rookie: before DifficultyRules.humanCoreOpenAt the human's core never drops below humanCoreFloorBp of
  // its max HP, so the first match cannot be lost before 6:00 (it can still be nearly lost: an idle human loses it).
  if (w.kind[dst] === Kind.Core && w.team[dst] === teamOfSlot(HUMAN_SLOT) && tick < w.globals[G.HumanCoreOpenAt]) {
    dmg = Math.max(0, Math.min(dmg, w.hp[dst] - applyBp(w.maxHp[dst], rulesOf(m).humanCoreFloorBp)));
  }
  w.hp[dst] -= dmg;
  w.hurtTick[dst] = tick;
  if (src >= 0) w.lastHitBy[dst] = src;
  if (heroDst && src >= 0 && src < RANGE.minions && w.team[src] !== w.team[dst]) {
    w.assistTick[dst * (RANGE.minions - RANGE.heroes) + src] = tick;
    w.kHurt[dst] = tick;
  }
  if (structure && srcTeam < 2) w.globals[srcTeam === 0 ? G.TowerDamage0 : G.TowerDamage1] += dmg;
  if (src >= 0 && src < RANGE.minions) {
    const s = m.stats[src];
    if (w.kind[dst] === Kind.Hero) s.heroDamage += dmg;
    else if (structure) s.towerDamage += dmg;
  }
  m.events.push({ type: 'hit', tick, src, dst, amount: dmg, shielded, kind });
  if (heroSrc) {
    // Attacking breaks stealth (Bush Slink); the kit's outgoing hook already applied Ambush.
    w.stealthT[src] = 0;
    kitOf(w, src).afterDeal?.(m, src, dst, dmg + shielded, kind);
  }
  // Tower aggro (§5): a hero that damages an enemy hero near a structure draws that structure's fire.
  if (srcKind === Kind.Hero && src >= 0 && w.kind[dst] === Kind.Hero && w.alive[src] === 1) forceAggro(w, src, dst);
  // Nap is broken by damage.
  if (heroDst && w.napT[dst] > 0) {
    w.napT[dst] = 0;
    w.state[dst] = UnitState.Idle;
  }
  return dmg;
}

function forceAggro(w: World, attacker: number, victim: number): void {
  const team = w.team[victim];
  for (let id = RANGE.towers; id < RANGE.fountains; id++) {
    if (w.alive[id] === 0 || w.team[id] !== team) continue;
    const reach = attackRange(w, id) + RADIUS.hero;
    const r2 = reach * reach;
    if (dist2(w.x[id], w.y[id], w.x[attacker], w.y[attacker]) > r2) continue;
    if (dist2(w.x[id], w.y[id], w.x[victim], w.y[victim]) > r2) continue;
    w.target[id] = attacker;
    w.forced[id] = 1;
  }
}

/** Death clean-up shared by every unit: statuses, casts, the hero's kit and any arena it owns. */
function clearOnDeath(w: World, id: number): void {
  clearStatus(w, id);
  if (id >= RANGE.minions) return;
  w.castPhase[id] = 0;
  w.castT[id] = 0;
  w.napT[id] = 0;
  kitOf(w, id).reset?.(w, id);
  w.zoomT[id] = 0;
  w.frenzyT[id] = 0;
  w.nineT[id] = 0;
  w.packT[id] = 0;
  for (let z = 0; z < w.zAlive.length; z++) if (w.zAlive[z] === 1 && w.zOwner[z] === id && w.zKind[z] === ZONE_KIND.arena) endArena(w, z);
}

/** Step 7: every unit at or below 0 HP dies, ascending id. */
export function resolveDeaths(m: MatchHandle): void {
  const w = m.world;
  const tick = w.globals[G.Tick];
  for (let id = 0; id < RANGE.end; id++) {
    if (w.alive[id] === 0 || w.hp[id] > 0) continue;
    const k = w.kind[id];
    if (k === Kind.Fountain) continue;
    if (k === Kind.Pudding) {
      onPuddingDown(m);
      continue;
    }
    const killer = w.lastHitBy[id];
    w.alive[id] = 0;
    w.hp[id] = 0;
    w.windup[id] = 0;
    w.target[id] = -1;
    m.events.push({ type: 'death', tick, id, killer });
    clearOnDeath(w, id);
    if (k === Kind.Hero) {
      w.state[id] = UnitState.Dead;
      w.order[id] = Order.None;
      w.pathLen[id] = 0;
      w.timer[id] = respawnTicks(w.level[id], tick, w.globals[G.Sunset]);
      if (id === HUMAN_SLOT) w.timer[id] = Math.max(1, applyBp(w.timer[id], rulesOf(m).humanRespawnBp));
      else if (w.team[id] !== teamOfSlot(HUMAN_SLOT)) w.timer[id] = applyBp(w.timer[id], rulesOf(m).enemyRespawnBp);
      m.stats[id].deaths++;
      const enemy = 1 - w.team[id];
      w.globals[enemy === 0 ? G.Kills0 : G.Kills1]++;
      heroKilled(m, id);
      // From Sunset (v4; Sudden Death before): each takedown deals core damage to the victim's core.
      // Sim v5: before Sudden Death it scales with how open that core is (an inner tower down: the full share, else
      // SUNSET.closedCoreBp), so towers still decide most matches; the human's core is spared while
      // the human's core keeps its DifficultyRules floor before humanCoreOpenAt (Rookie, in dealDamage).
      const victimTeam = w.team[id];
      if (tick >= w.globals[G.Sunset]) {
        const core = RANGE.cores + victimTeam;
        const sd = tick >= w.globals[G.SuddenDeath];
        const bp = sd ? SUDDEN_DEATH.takedownCoreBp : coreExposed(w, victimTeam) ? SUNSET.takedownCoreBp : SUNSET.closedCoreBp;
        dealDamage(m, -1, enemy, Kind.None, core, applyBp(w.maxHp[core], bp), 'zone', { pure: true, pierce: true });
      }
    } else if (k === Kind.Minion) {
      minionKilled(m, id);
    } else if (k === Kind.Camp) {
      const by = campKilled(m, id);
      if (onRatDied(w, id) && by >= 0) packBuff(m, by);
    } else if (k === Kind.Tower || k === Kind.Core) {
      onStructureDestroyed(m, id);
    }
  }
}

