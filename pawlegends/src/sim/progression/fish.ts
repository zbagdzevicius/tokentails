/**
 * Fish and Toys (sim v12, docs/FUN-PROGRESSION-V12.md S1; numbers in data/fish.ts and data/toys.ts).
 *
 * - `grantFish` pays a hero: the full amount counts in `fishRaw` (the comeback check), the human's enemies keep
 *   DifficultyRules.enemyFishBp of it in `fish` and `fishTotal`. Dead heroes are paid. Every reason but the passive
 *   trickle and comeback sends a `fish` event to the hero's team.
 * - `fishTick` (once a second, beside the XP trickle): passive Fish for every hero; from DifficultyRules.catchUpFrom,
 *   comeback Fish to the lowest-Fish hero of the team behind on raw Fish (not when that team is the handicapped one);
 *   then every hero, by slot, buys each Toy tier it can afford (a `buy` event to everyone).
 * - A Toy tier raises max HP (and HP only while the hero is alive: a dead hero respawns at the new max HP).
 */
import { HEROES, HERO_IDS } from '../../data/heroes';
import { FISH } from '../../data/fish';
import { TOY_COST, TOY_PASSIVE, TOY_PASSIVE_TIER, TOY_SUM, TOY_TIER, TOY_TIERS, type ToyStats } from '../../data/toys';
import { HUMAN_SLOT, teamOfSlot, type FishReason } from '../api';
import { BP_ONE, applyBp, dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, RANGE, type World } from '../world';
import { rulesOf } from '../rules';
import { heroHp } from './levels';

/** The summed stats of the Toys hero `id` owns. */
export const toyStats = (w: World, id: number): Readonly<ToyStats> => TOY_SUM[HEROES[HERO_IDS[w.sub[id]]].role][w.toy[id]];

/** Pay hero `id` `amount` Fish before the difficulty handicap. `reason` null: no event (passive, comeback). */
export function grantFish(m: MatchHandle, id: number, amount: number, reason: FishReason | null): number {
  const w = m.world;
  if (amount <= 0 || w.kind[id] !== Kind.Hero) return 0;
  const before = w.fishRaw[id];
  w.fishRaw[id] = before + amount;
  const rules = rulesOf(m);
  // The handicap applies to the running total, so small grants (the passive 1 a second) are not rounded away.
  const net =
    w.team[id] !== teamOfSlot(HUMAN_SLOT) && rules.enemyFishBp < BP_ONE ? applyBp(before + amount, rules.enemyFishBp) - applyBp(before, rules.enemyFishBp) : amount;
  if (net <= 0) return 0;
  w.fish[id] += net;
  w.fishTotal[id] += net;
  m.stats[id].fish += net;
  if (reason !== null) m.events.push({ type: 'fish', tick: w.globals[G.Tick], id, amount: net, reason });
  return net;
}

/** Hero `id` buys its next Toy tier (the caller checked the cost). */
function buyToy(m: MatchHandle, id: number): void {
  const w = m.world;
  const tier = w.toy[id];
  const hero = HEROES[HERO_IDS[w.sub[id]]];
  w.fish[id] -= TOY_COST[tier];
  w.toy[id] = tier + 1;
  const hp = TOY_TIER[hero.role][tier].hpLevels * heroHp(hero.base.hpPerLevel);
  w.maxHp[id] += hp;
  if (w.alive[id] === 1 && w.hp[id] > 0) w.hp[id] += hp;
  const tick = w.globals[G.Tick];
  const s = m.stats[id];
  s.toys = tier + 1;
  if (tier === 0) s.toy1At = tick;
  else if (tier === 1) s.toy2At = tick;
  else if (tier === 2) s.toy3At = tick;
  else s.toy4At = tick;
  m.events.push({ type: 'buy', tick, id, tier: tier + 1 });
}

/** Once a second from the first wave: passive Fish, comeback Fish, then automatic Toy purchases (by slot). */
export function fishTick(m: MatchHandle): void {
  const w = m.world;
  let raw0 = 0;
  let raw1 = 0;
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero) continue;
    grantFish(m, h, FISH.passivePerSecond, null);
    if (w.team[h] === 0) raw0 += w.fishRaw[h];
    else raw1 += w.fishRaw[h];
  }
  const rules = rulesOf(m);
  if (w.globals[G.Tick] >= rules.catchUpFrom && raw0 !== raw1) {
    const behind = raw0 < raw1 ? 0 : 1;
    const handicapped = behind !== teamOfSlot(HUMAN_SLOT) && rules.enemyFishBp < BP_ONE;
    if (!handicapped) {
      let low = -1;
      for (let h = RANGE.heroes; h < RANGE.minions; h++) {
        if (w.kind[h] !== Kind.Hero || w.team[h] !== behind) continue;
        if (low < 0 || w.fishTotal[h] < w.fishTotal[low]) low = h;
      }
      if (low >= 0) grantFish(m, low, FISH.comebackPerSecond, null);
    }
  }
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero) continue;
    while (w.toy[h] < TOY_TIERS && w.fish[h] >= TOY_COST[w.toy[h]]) buyToy(m, h);
  }
}

const roleOf = (w: World, id: number) => HEROES[HERO_IDS[w.sub[id]]].role;

/**
 * Hero `src` deals `raw` to `dst` (before armour): its Toys' damage (never on towers or cores) and, from tier
 * TOY_PASSIVE_TIER, its role passive (marksman far basics, assassin execute, mage abilities).
 */
export function toyOutgoing(w: World, src: number, dst: number, raw: number, kind: string, structure: boolean): number {
  if (structure || w.toy[src] === 0) return raw;
  const s = toyStats(w, src);
  let bp = BP_ONE + s.dmgBp;
  if (w.kind[dst] === Kind.Hero && w.toy[src] >= TOY_PASSIVE_TIER) {
    const role = roleOf(w, src);
    if (role === 'marksman' && kind === 'basic' && dist2(w.x[src], w.y[src], w.x[dst], w.y[dst]) > TOY_PASSIVE.marksmanFarRange * TOY_PASSIVE.marksmanFarRange) bp += TOY_PASSIVE.marksmanFarBp;
    else if (role === 'assassin' && w.hp[dst] * BP_ONE < w.maxHp[dst] * TOY_PASSIVE.assassinExecuteHpBp) bp += TOY_PASSIVE.assassinExecuteBp;
    else if (role === 'mage' && (kind === 'ability' || kind === 'zone')) bp += TOY_PASSIVE.mageAbilityBp;
  }
  return bp === BP_ONE ? raw : applyBp(raw, bp);
}

/** Hero `dst` takes `raw` from enemy hero `src`: a tank's tier-3 passive takes TOY_PASSIVE.tankReduceBp off. */
export function toyIncoming(w: World, dst: number, raw: number): number {
  return w.toy[dst] >= TOY_PASSIVE_TIER && roleOf(w, dst) === 'tank' ? applyBp(raw, BP_ONE - TOY_PASSIVE.tankReduceBp) : raw;
}

/** A fighter's tier-3 passive: its basic attacks on heroes heal it for TOY_PASSIVE.fighterLifestealBp of the damage. */
export function toyLifesteal(w: World, src: number, dmg: number): number {
  return w.toy[src] >= TOY_PASSIVE_TIER && roleOf(w, src) === 'fighter' ? applyBp(dmg, TOY_PASSIVE.fighterLifestealBp) : 0;
}

/** A heal or shield of `amount` given by hero `src`: a support's tier-3 passive makes it TOY_PASSIVE.supportBp stronger. */
export function toySupport(w: World, src: number, amount: number): number {
  if (src < RANGE.heroes || src >= RANGE.minions || w.kind[src] !== Kind.Hero) return amount;
  return w.toy[src] >= TOY_PASSIVE_TIER && roleOf(w, src) === 'support' ? applyBp(amount, BP_ONE + TOY_PASSIVE.supportBp) : amount;
}
