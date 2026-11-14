/**
 * Damage (POC.md §6.1, §5 tower rules, §7.3 phases) and deaths (§4.3 step 7).
 *
 * `dealDamage` applies a hit at once (hp may go below 0); `resolveDeaths` runs once per tick in step 7, so units
 * that hit each other on the same tick both land their hits (no id-order advantage).
 */
import { HERO_RULES, RESPAWN } from '../../data/xp';
import { HERO_BASIC_VS_HERO_BP, HERO_IDS, HERO_VS_HERO_BP, HEROES } from '../../data/heroes';
import { BRUSH_ATTACK_REVEAL_TICKS, RADIUS } from '../../data/map';
import { SUDDEN_DEATH, SUNSET } from '../../data/timeline';
import { TOWERS } from '../../data/towers';
import type { SimEvent } from '../api';
import { ZONE_KIND } from '../../data/effects';
import { BP_ONE, applyBp, dist2, idiv } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, Order, RANGE, UnitState, type World, TEAM_NEUTRAL } from '../world';
import { attackRange, coreExposed, isInvulnerable, isStructure } from '../units/kinds';
import { onStructureDestroyed } from '../units/tower';
import { clearStatus } from '../effects/status';
import { endArena } from '../effects/tether';
import { kitOf } from '../heroes/kit';
import { campKilled, executed, heroKilled, minionKilled } from '../progression/xp';
import { campReward, onRatDied, packBuff, stealJungleBuffs } from '../units/camp';
import { HEARTHWOOD_PVP, HEARTHWOOD_RULES } from '../../data/maps/hearthwood';
import { onPuddingDown } from '../units/pudding';
import { sugared } from '../units/sugar';
import { SUGAR_RUSH } from '../../data/pudding';
import { respawnTicks } from '../progression/respawn';
import { toyIncoming, toyLifesteal, toyOutgoing } from '../progression/fish';
import { creditHealShield, heal } from '../effects/heal';
import { bonusDamage, nineLives } from '../effects/bonus';
import { HUMAN_SLOT, teamOfSlot } from '../api';
import { isHumanSlot } from '../humans';
import { rulesOf } from '../rules';
import { fortifyUntilOf, mutOf, mutatorRespawn } from '../mutator';
import { BOSS } from '../../data/boss';
import { bossDamageBp, isBoss } from '../units/boss';

export { respawnTicks } from '../progression/respawn';

export type HitKind = Extract<SimEvent, { type: 'hit' }>['kind'];

export interface HitOptions {
  /** Exact amount: no armour, no Sunset or backdoor modifier (fountain, Sudden Death). */
  pure?: boolean;
  /** Ignore structure invulnerability (Sudden Death core damage). */
  pierce?: boolean;
  /**
   * Sim v21 (V21-FUN.md §1.3, the Kibble Cannon's KABOOM): a hero target loses all its HP and shield at once; no kit
   * hook and no Nine Lives can reduce it. Dodges, parries and blocks happen before (combat/funshot.ts).
   */
  execute?: boolean;
  /** Sim v21: a `pure` hit on a structure still halves under backdoor protection (the fun shots). */
  backdoor?: boolean;
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

/** Sim v26 chip floor (TOWERS.chipFloorBp); sim v27 (V27.md §1.B): Hearthwood's own, HEARTHWOOD_RULES.chipFloorBp. */
const chipFloorOf = (w: World): number => (w.mg.length > 0 ? HEARTHWOOD_RULES.chipFloorBp : TOWERS.chipFloorBp);

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
    // Sim v12: the source's Toys (not on towers or cores) and its tier-3 role passive; a tank's passive on the victim.
    raw = toyOutgoing(w, src, dst, raw, kind, structure);
    if (w.kind[dst] === Kind.Hero && w.team[src] !== w.team[dst]) raw = toyIncoming(w, dst, raw);
    if (w.kind[dst] === Kind.Hero) {
      raw = applyBp(raw, HERO_VS_HERO_BP);
      if (kind === 'basic') raw = applyBp(raw, HERO_BASIC_VS_HERO_BP);
      if (w.globals[G.SideEdge] !== 0) {
        raw = applyBp(raw, HEROES[HERO_IDS[w.sub[src]]].pvp.dmgBp);
        raw = applyBp(raw, HEROES[HERO_IDS[w.sub[dst]]].pvp.takenBp);
      }
      // Sim v19: Hearthwood's own hero-vs-hero row (per species, then per hero).
      if (w.mg.length > 0) {
        const s = HEROES[HERO_IDS[w.sub[src]]];
        const d = HEROES[HERO_IDS[w.sub[dst]]];
        raw = applyBp(raw, HEARTHWOOD_PVP[s.side].dmgBp);
        raw = applyBp(raw, HEARTHWOOD_PVP[d.side].takenBp);
        const hs = HEARTHWOOD_PVP.hero[s.id];
        const hd = HEARTHWOOD_PVP.hero[d.id];
        if (hs) raw = applyBp(raw, hs.dmgBp);
        if (hd) raw = applyBp(raw, hd.takenBp);
      }
      // Sim v22: a mutator's own hero-vs-hero scale and per-hero row (Blitz's balance pass).
      const mut = mutOf(w);
      if (mut.heroVsHeroBp !== BP_ONE) raw = applyBp(raw, mut.heroVsHeroBp);
      const ms = mut.hero[HERO_IDS[w.sub[src]]];
      const md = mut.hero[HERO_IDS[w.sub[dst]]];
      if (ms) raw = applyBp(raw, ms.dmgBp);
      if (md) raw = applyBp(raw, md.takenBp);
      // Sim v28 (V28.md §4): Boss Weekend's boss hits harder (and enraged), and takes its own share.
      if (mut.boss) {
        if (isBoss(w, src)) raw = applyBp(raw, bossDamageBp(w));
        if (isBoss(w, dst)) raw = applyBp(raw, BOSS.takenBp);
      }
    }
    if (isHumanSlot(w, src)) raw = applyBp(raw, rulesOf(m).humanDamageBp);
  }
  if (isHumanSlot(w, dst) && !opts.pure && srcTeam !== w.team[dst]) raw = applyBp(raw, rulesOf(m).humanTakenBp);
  let dmg = opts.pure ? raw : idiv(raw * HERO_RULES.armourBase, HERO_RULES.armourBase + w.armour[dst]);
  // Sim v22 (Hearthwood) Sugar Rush: minions beside an allied Sugar Rush hero take less and hit structures harder.
  if (w.mg.length > 0 && !opts.pure) {
    if (w.kind[dst] === Kind.Minion && sugared(w, dst)) dmg = applyBp(dmg, SUGAR_RUSH.takenBp);
    else if (structure && srcKind === Kind.Minion && src >= 0 && w.kind[src] === Kind.Minion && w.alive[src] === 1 && sugared(w, src)) dmg = applyBp(dmg, SUGAR_RUSH.structBp);
  }
  if (structure && !opts.pure) {
    if (tick >= w.globals[G.Sunset]) dmg = applyBp(dmg, SUNSET.structureDamageBp);
    // Sim v21 Fortified: heroes deal TOWERS.fortifyBp (sim v27: DifficultyRules.fortifyHeroBp) to towers early (V21-FUN.md §3.1); sim v26 (V26-TOWERS.md §1.B):
    // minions and the escort Pudding's breath deal TOWERS.fortifyMinionBp.
    if (w.kind[dst] === Kind.Tower && tick < fortifyUntilOf(w)) {
      if (srcKind === Kind.Hero) dmg = applyBp(dmg, rulesOf(m).fortifyHeroBp);
      else if (srcKind === Kind.Minion || srcKind === Kind.Pudding) dmg = applyBp(dmg, TOWERS.fortifyMinionBp);
    }
  }
  if (structure && (!opts.pure || opts.backdoor === true)) {
    // Backdoor protection: heroes deal half when no minion of their team is near the structure.
    const guarded = w.team[dst] === teamOfSlot(HUMAN_SLOT) || rulesOf(m).enemyBackdoor;
    if (srcKind === Kind.Hero && guarded && !minionNear(w, srcTeam, w.x[dst], w.y[dst])) dmg = applyBp(dmg, TOWERS.backdoorBp);
  }
  const heroDst = w.kind[dst] === Kind.Hero;
  const execute = heroDst && opts.execute === true;
  if (heroDst && !opts.pure) dmg = kitOf(w, dst).incoming?.(m, dst, src, dmg) ?? dmg;
  let shielded = 0;
  if (execute) {
    // Sim v21 KABOOM: the shield and every HP point go at once.
    shielded = w.shield[dst];
    w.shield[dst] = 0;
    dmg = w.hp[dst];
  } else if (w.shield[dst] > 0) {
    shielded = Math.min(w.shield[dst], dmg);
    w.shield[dst] -= shielded;
    dmg -= shielded;
  }
  if (heroDst && dmg > 0 && !execute) {
    const extra = kitOf(w, dst).absorb?.(m, dst, dmg) ?? 0;
    shielded += extra;
    dmg -= extra;
  }
  if (heroDst) {
    if (!execute) dmg = nineLives(m, dst, dmg);
    // Zoomies end on any damage.
    if (dmg + shielded > 0) w.zoomT[dst] = 0;
  }
  // Sim v5, Rookie: before DifficultyRules.humanCoreOpenAt the human's core never drops below humanCoreFloorBp of
  // its max HP, so the first match cannot be lost before 6:00 (it can still be nearly lost: an idle human loses it).
  if (w.kind[dst] === Kind.Core && w.team[dst] === teamOfSlot(HUMAN_SLOT) && tick < w.globals[G.HumanCoreOpenAt]) {
    dmg = Math.max(0, Math.min(dmg, w.hp[dst] - applyBp(w.maxHp[dst], rulesOf(m).humanCoreFloorBp)));
  }
  w.hp[dst] -= dmg;
  // Sim v19 (Hearthwood): both teams on one neutral objective in the same tick. Hits resolve in an order, so "the last
  // hit wins" would hand every same-tick finish to whichever team resolves later; the credit goes to team 0 on even
  // ticks and team 1 on odd ticks instead (the camp's aggro follows it).
  const keep =
    w.mg.length > 0 &&
    w.team[dst] === TEAM_NEUTRAL &&
    w.hurtTick[dst] === tick &&
    w.lastHitBy[dst] >= 0 &&
    src >= 0 &&
    w.team[w.lastHitBy[dst]] === (tick & 1) &&
    w.team[src] !== (tick & 1);
  w.hurtTick[dst] = tick;
  if (src >= 0 && !keep) w.lastHitBy[dst] = src;
  if (heroDst && src >= 0 && src < RANGE.minions && w.team[src] !== w.team[dst]) {
    w.assistTick[dst * (RANGE.minions - RANGE.heroes) + src] = tick;
    w.kHurt[dst] = tick;
  }
  if (structure && srcTeam < 2) w.globals[srcTeam === 0 ? G.TowerDamage0 : G.TowerDamage1] += dmg;
  if (src >= 0 && src < RANGE.minions) {
    const s = m.stats[src];
    if (w.kind[dst] === Kind.Hero) s.heroDamage += dmg;
    else if (structure) s.towerDamage += dmg;
    // Sim v10: the rat camp and Pudding (stats only, outside the world hash).
    else if (w.kind[dst] === Kind.Camp || w.kind[dst] === Kind.Pudding) s.objective += dmg;
  }
  // Sim v10: what a hero soaked, shields included (the tank grade, src/meta/grade.ts).
  if (heroDst && dst < RANGE.minions) m.stats[dst].damageTaken += dmg + shielded;
  m.events.push({ type: 'hit', tick, src, dst, amount: dmg, shielded, kind });
  if (heroSrc) {
    // Sim v16 (MAP-GAPS B11): a hit from a bush reveals the attacker for BRUSH_ATTACK_REVEAL_TICKS.
    if (w.bush[src] >= 0) w.revealT[src] = Math.max(w.revealT[src], BRUSH_ATTACK_REVEAL_TICKS);
    // Sim v12: a fighter's tier-3 Toy passive heals it for part of its basic-attack damage to enemy heroes.
    if (heroDst && kind === 'basic' && dmg > 0 && w.alive[src] === 1 && w.team[src] !== w.team[dst]) {
      const steal = toyLifesteal(w, src, dmg);
      if (steal > 0) creditHealShield(m, src, heal(w, src, steal));
    }
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

/** Sim v8: the standing tower of `team` that can be hit with the lowest HP share (lowest id on a tie), else its core, else −1. */
function weakestTower(w: World, team: number): number {
  let best = -1;
  let bestBp = 0;
  let floored = false;
  for (let id = RANGE.towers; id < RANGE.cores; id++) {
    if (w.alive[id] === 0 || w.team[id] !== team || w.hp[id] <= 0 || isInvulnerable(w, id)) continue;
    const bp = idiv(w.hp[id] * BP_ONE, Math.max(1, w.maxHp[id]));
    // Sim v26 (V26-TOWERS.md §1.A): a tower at or below TOWERS.chipFloorBp takes no chip.
    if (w.hp[id] <= applyBp(w.maxHp[id], chipFloorOf(w))) {
      floored = true;
      continue;
    }
    if (best < 0 || bp < bestBp) {
      best = id;
      bestBp = bp;
    }
  }
  if (best >= 0) return best;
  if (floored) return -1;
  const core = RANGE.cores + team;
  return w.alive[core] === 1 && !isInvulnerable(w, core) ? core : -1;
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
      // Sim v22 (Blitz): a flat wait rising from 6 s to 8 s over the match replaces the level wait, Sunset and the lead
      // pressure; the difficulty's human and enemy edges still apply.
      const flat = mutatorRespawn(w, tick);
      w.timer[id] = flat > 0 ? flat : respawnTicks(w.level[id], tick, w.globals[G.Sunset]);
      if (isHumanSlot(w, id)) w.timer[id] = Math.max(1, applyBp(w.timer[id], rulesOf(m).humanRespawnBp));
      else if (w.team[id] !== teamOfSlot(HUMAN_SLOT)) w.timer[id] = applyBp(w.timer[id], rulesOf(m).enemyRespawnBp);
      m.stats[id].deaths++;
      const enemy = 1 - w.team[id];
      // Sim v27 (V27.md §1.A): an execution (no enemy hero credited) is not a takedown: no kill score, no chip.
      const takedown = !executed(m, id);
      if (takedown) w.globals[enemy === 0 ? G.Kills0 : G.Kills1]++;
      // Sim v7: a team that keeps losing fights stays down longer (DifficultyRules.leadPressure).
      // Fun pass (playtest #10): a struggling human (RESPAWN.humanStreakFrom+ deaths in a row) waits RESPAWN.humanStreakBp
      // of the wait and no lead pressure. Not on Rookie, whose human respawn has its own rule (humanRespawnBp), nor in
      // PvP (sim v16, DifficultyRules.humanStreakRespawn: a human-only wait would favour one team).
      const struggling = isHumanSlot(w, id) && w.deathStreak[id] >= RESPAWN.humanStreakFrom && rulesOf(m).humanRespawnBp >= BP_ONE && rulesOf(m).humanStreakRespawn;
      if (struggling) w.timer[id] = Math.max(1, applyBp(w.timer[id], RESPAWN.humanStreakBp));
      if (rulesOf(m).leadPressure && !struggling && flat <= 0) {
        const gap = w.globals[enemy === 0 ? G.Kills0 : G.Kills1] - w.globals[enemy === 0 ? G.Kills1 : G.Kills0] - RESPAWN.gapFree;
        if (gap > 0) w.timer[id] = applyBp(w.timer[id], BP_ONE + Math.min(RESPAWN.gapCapBp, gap * RESPAWN.gapPerBp));
      }
      // Sim v12 (docs/FUN-PROGRESSION-V12.md S3): no wait is longer than RESPAWN.hardCap.
      w.timer[id] = Math.min(w.timer[id], RESPAWN.hardCap);
      // Sim v19 (Hearthwood, MAP-5V5.md §1.9): waits × 1.3, capped at 25 s; the victim's jungle buffs go to its killer.
      if (w.mg.length > 0) {
        w.timer[id] = Math.min(applyBp(w.timer[id], HEARTHWOOD_RULES.respawnBp), HEARTHWOOD_RULES.respawnCap);
        stealJungleBuffs(m, id, killer);
      }
      heroKilled(m, id);
      // From Sunset (v4; Sudden Death before): each takedown deals core damage to the victim's core.
      // Sim v5: before Sudden Death it scales with how open that core is (an inner tower down: the full share, else
      // SUNSET.closedCoreBp), so towers still decide most matches; the human's core is spared while
      // the human's core keeps its DifficultyRules floor before humanCoreOpenAt (Rookie, in dealDamage).
      const victimTeam = w.team[id];
      const chip = takedown ? rulesOf(m).takedownChipBp : 0;
      // Sim v28: where no structure takes damage (Boss Weekend), takedowns chip nothing.
      if (!takedown || !mutOf(w).structures) {
        // Sim v27: an execution deals no takedown core or tower damage.
      } else if (tick < w.globals[G.Sunset]) {
        // Sim v7: every takedown chips the victim's core (DifficultyRules.takedownChipBp). Sim v8: only until the chips
        // total takedownChipCapBp; before Sunset each takedown of this team so far was a chip, so its takedown count
        // (this one included) is the number of chips.
        const chips = w.globals[enemy === 0 ? G.Kills0 : G.Kills1];
        // Past the cap the chips go on only into an open base (an inner tower of that side down), else to its weakest tower.
        if (chip > 0 && (chips * chip <= rulesOf(m).takedownChipCapBp || coreExposed(w, victimTeam))) {
          const core = RANGE.cores + victimTeam;
          dealDamage(m, -1, enemy, Kind.None, core, applyBp(applyBp(w.maxHp[core], chip), mutOf(w).takedownCoreBp), 'chip', { pure: true, pierce: true });
        } else if (chip > 0 && rulesOf(m).takedownTowerChipBp > 0 && tick >= fortifyUntilOf(w)) {
          // Sim v26 (V26-TOWERS.md §1.A): no tower chip while Fortified, and a chip never takes a tower below
          // TOWERS.chipFloorBp (heroes and minions finish it).
          const t = weakestTower(w, victimTeam);
          if (t >= 0) {
            let amount = applyBp(w.maxHp[t], rulesOf(m).takedownTowerChipBp);
            if (w.kind[t] === Kind.Tower) amount = Math.min(amount, w.hp[t] - applyBp(w.maxHp[t], chipFloorOf(w)));
            if (amount > 0) dealDamage(m, -1, enemy, Kind.None, t, amount, 'chip', { pure: true });
          }
        }
      } else if (!isHumanSlot(w, id) || rulesOf(m).humanDeathCore) {
        // Sim v7: on Rookie the human's own deaths cost its core nothing (DifficultyRules.humanDeathCore).
        const core = RANGE.cores + victimTeam;
        const sd = tick >= w.globals[G.SuddenDeath];
        const bp = sd ? SUDDEN_DEATH.takedownCoreBp : coreExposed(w, victimTeam) ? SUNSET.takedownCoreBp : SUNSET.closedCoreBp;
        // Sim v22: a mutator may scale it (mutOf(w).takedownCoreBp)
        dealDamage(m, -1, enemy, Kind.None, core, applyBp(applyBp(w.maxHp[core], bp), mutOf(w).takedownCoreBp), 'zone', { pure: true, pierce: true });
      }
    } else if (k === Kind.Minion) {
      minionKilled(m, id);
    } else if (k === Kind.Camp) {
      const by = campKilled(m, id);
      const cleared = onRatDied(w, id);
      // Sim v19: Hearthwood's camps give their own rewards (no Pack buff there); Crossing's rats as in v18.
      if (w.mg.length > 0) campReward(m, id, by);
      else if (cleared && by >= 0) packBuff(m, by);
    } else if (k === Kind.Tower || k === Kind.Core) {
      onStructureDestroyed(m, id);
    }
  }
}

