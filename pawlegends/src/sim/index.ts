/**
 * Sim entry: createMatch(config) / step(match, commands) / snapshot(match, team) / hash(match) / result(match).
 * INTEGER ONLY, no DOM, no three: Node-importable and vendored to the backend.
 *
 * The whole POC match: waves, towers and cores, eight hero kits (sim v9: four shelter champions) with talents and Paw Tricks, XP and levels, brush
 * and stealth, the rat camps, Pudding, the §7.3 timeline (Sunset, Sudden Death, the 11:00 safety end) and the
 * in-sim bots for slots 1..5, all in the §4.3 step order marked below.
 */
import { BOTS } from '../data/bots';
import { BRANCH_TALENT, HERO_IDS, HEROES } from '../data/heroes';
import { CAPS, CORE, FOUNTAIN, LANES, TOWER_SPOTS, mirrorX } from '../data/map';
import { CORE_STATS, TOWERS } from '../data/towers';
import { TIMELINE, TIMELINE_BY } from '../data/timeline';
import { TRICK_IDS } from '../data/tricks';
import {
  HUMAN_SLOT,
  Op,
  SLOTS_PER_TEAM,
  SLOT_COUNT,
  teamOfSlot,
  type Command,
  type Difficulty,
  type EntityKind,
  type EntitySnap,
  type HeroId,
  type Match,
  type MatchConfig,
  type MatchResult,
  type ReplayRecord,
  type SimEvent,
  type SlotStats,
  type Snapshot,
  type Team,
  type TrickId,
  type UnitStateName,
} from './api';
import { resolveAttacks, stepProjectiles } from './combat/attack';
import { ageZones, clampTethers, stepHeals, stepZones, tickStatus } from './effects';
import { kitOf, resolveCasts, stepKits, tickCooldowns } from './heroes/kit';
import { refreshFlags, refreshVision, visibleTo } from './map/brush';
import { resolveDeaths } from './combat/damage';
import { encodeCommand, encodeStream, toBase64 } from './commands';
import { fnvBytes, fnvInt } from './hash';
import { createGate, gateCommand, gateForfeit } from './input';
import { createGrid } from './map/grid';
import { heroHp } from './progression/levels';
import { checkWin } from './match';
import { Rng } from './rng';
import { rulesOf } from './rules';
import type { MatchHandle } from './state';
import { clockAt, waveAt } from './timeline';
import { stepSeconds } from './units/core';
import { applyOrder, placeAtFountain, stepHeroes } from './units/hero';
import { checkComeback, spendComeback, spawnWave, stepMinions } from './units/minion';
import { coverStructures, stepStructures } from './units/tower';
import { SIM_VERSION } from './version';
import { COOLDOWN_SLOTS, G, Kind, RANGE, TALENT_TIERS, UnitState, createWorld, hashWorld, type World } from './world';
import { ZONE_KIND } from '../data/effects';
import { CLEM_INDEX } from './heroes/clem';
import { AVIETE_INDEX } from './heroes/aviete';
import { applyPing, stepBots } from './bots';
import { initCamps, spawnCamps, stepCamps } from './units/camp';
import { initPudding, stepPudding, stepPuddingTimeline } from './units/pudding';
import { collectPickups, initPickups, spawnPickups } from './units/pickup';
import { beginTick, stepBonuses } from './effects/bonus';
import { applyBp } from './fixed';
import { DIFFICULTY_RULES } from '../data/bots';
import { PICKUP_KINDS } from '../data/pickups';
import { BOT_TALENT_MODES, PICKUP_ID_BASE } from './api';

export * from './api';
export { SIM_VERSION } from './version';
export { TICK_HZ } from '../data/timeline';


export type { MatchHandle } from './state';
export { tieBreakWinner } from './match';
export { visibleTo } from './map/brush';
export { canCast } from './heroes/kit';
export { createPlayerBot, playerBotCommands, type PlayerBot } from './bots';
export { PLAYER_PROFILES, DIFFICULTIES, type PlayerProfile } from '../data/bots';
export { TIMELINE_BY } from '../data/timeline';
export { BRANCH_HEROES, BRANCH_TALENT } from '../data/heroes';
/** Sunset and Sudden Death ticks of a difficulty. */
export const timelineFor = (d: Difficulty) => TIMELINE_BY[d as keyof typeof TIMELINE_BY] ?? TIMELINE_BY.normal;

const KIND_NAME: readonly EntityKind[] = ['hero', 'hero', 'minion', 'tower', 'core', 'fountain', 'camp', 'pudding'];
const STATE_NAME: readonly UnitStateName[] = ['idle', 'moving', 'attacking', 'casting', 'dead', 'napping'];
const MINION_VARIANT: readonly string[] = ['melee', 'ranged', 'siege'];
const TOWER_VARIANT: readonly string[] = ['outer', 'inner'];

/**
 * Bot picks and tricks from the seed (§6.8): the human takes slot 0, no duplicate hero within a team, duplicates
 * across teams allowed. Sim v10 (GAPS B5): heroes come from `rng.fork('picks')` and tricks from their own
 * `rng.fork('tricks')`, so adding a Paw Trick no longer reshuffles the bots' heroes.
 */
export function fillPicks(seed: number, hero: HeroId, trick: TrickId): { picks: HeroId[]; tricks: TrickId[] } {
  const rng = new Rng(seed).fork('picks');
  const trickRng = new Rng(seed).fork('tricks');
  const picks: HeroId[] = [];
  const tricks: TrickId[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    if (slot === HUMAN_SLOT) {
      picks.push(hero);
      tricks.push(trick);
      continue;
    }
    // Sim v5: species teams (cats vs dogs). The human's allies are of its hero's side, the enemies of the other
    // side; a team takes each hero of its side once before it repeats one (2 heroes a side for 3 slots).
    const teamStart = slot < SLOTS_PER_TEAM ? 0 : SLOTS_PER_TEAM;
    const side = slot < SLOTS_PER_TEAM ? HEROES[hero].side : HEROES[hero].side === 'cat' ? 'dog' : 'cat';
    const kin = HERO_IDS.filter((h) => HEROES[h].side === side);
    const taken = picks.slice(teamStart, slot);
    const fresh = kin.filter((h) => !taken.includes(h));
    const pool = fresh.length > 0 ? fresh : kin;
    picks.push(pool[rng.int(pool.length)]);
    tricks.push(TRICK_IDS[trickRng.int(TRICK_IDS.length)]);
  }
  return { picks, tricks };
}

function validate(config: MatchConfig): void {
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff) throw new RangeError('seed must be a uint32');
  if (config.picks.length !== SLOT_COUNT || config.tricks.length !== SLOT_COUNT) throw new RangeError('picks and tricks need 6 slots');
  for (const h of config.picks) if (!HERO_IDS.includes(h)) throw new RangeError(`unknown hero ${h}`);
  for (const t of config.tricks) if (!TRICK_IDS.includes(t)) throw new RangeError(`unknown trick ${t}`);
  if (!(config.difficulty in BOTS)) throw new RangeError(`unknown difficulty ${config.difficulty}`);
  if (config.botTalents !== undefined && !BOT_TALENT_MODES.includes(config.botTalents)) throw new RangeError(`unknown botTalents ${config.botTalents}`);
  // Sim v5: a team may field a hero twice (species teams: 2 heroes a side for 3 slots).
}

const sideX = (team: number, x: number): number => (team === 0 ? x : mirrorX(x));

/**
 * Start a match. For a replay to verify, `picks` and `tricks` must come from `fillPicks(seed, hero, trick)`: the
 * replay stores only the human's hero and trick and re-derives the bot slots from the seed.
 */
export function createMatch(config: MatchConfig): MatchHandle {
  validate(config);
  const w = createWorld(config.seed >>> 0);
  const stats: SlotStats[] = [];
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const team = teamOfSlot(slot);
    const hero = HEROES[config.picks[slot]];
    w.kind[slot] = Kind.Hero;
    w.team[slot] = team;
    w.sub[slot] = HERO_IDS.indexOf(hero.id);
    w.trick[slot] = TRICK_IDS.indexOf(config.tricks[slot]);
    w.level[slot] = 1;
    w.maxHp[slot] = heroHp(hero.base.hp);
    w.armour[slot] = hero.base.armour;
    placeAtFountain(w, slot);
    stats.push({ slot, hero: hero.id, kills: 0, deaths: 0, assists: 0, heroDamage: 0, towerDamage: 0, level: 1, damageTaken: 0, healShield: 0, objective: 0 });
  }
  const perTeam = TOWER_SPOTS.length;
  const rules = DIFFICULTY_RULES[config.difficulty];
  const phases = TIMELINE_BY[config.difficulty];
  w.globals[G.Sunset] = phases.sunset;
  w.globals[G.SuddenDeath] = phases.suddenDeath;
  w.globals[G.CoreOpenAt] = rules.coreOpenAt;
  w.globals[G.HumanPanic] = rules.humanPanicBp;
  w.globals[G.HumanCoreOpenAt] = rules.humanCoreOpenAt;
  w.globals[G.SideEdge] = rules.sideEdge ? 1 : 0;
  for (let team = 0; team < 2; team++) {
    for (let k = 0; k < perTeam; k++) {
      const id = RANGE.towers + team * perTeam + k;
      const spot = TOWER_SPOTS[k];
      const t = TOWERS[spot.tier];
      w.kind[id] = Kind.Tower;
      w.team[id] = team;
      w.alive[id] = 1;
      w.sub[id] = TOWER_VARIANT.indexOf(spot.tier);
      w.lane[id] = LANES.indexOf(spot.lane);
      w.hp[id] = applyBp(t.hp, rules.structureHpBp);
      w.maxHp[id] = w.hp[id];
      w.armour[id] = t.armour;
      w.x[id] = sideX(team, spot.x);
      w.y[id] = spot.y;
    }
    const core = RANGE.cores + team;
    w.kind[core] = Kind.Core;
    w.team[core] = team;
    w.alive[core] = 1;
    w.hp[core] = applyBp(CORE_STATS.hp, rules.coreHpBp);
    w.maxHp[core] = w.hp[core];
    w.armour[core] = CORE_STATS.armour;
    w.x[core] = sideX(team, CORE.x);
    w.y[core] = CORE.y;
    const fountain = RANGE.fountains + team;
    w.kind[fountain] = Kind.Fountain;
    w.team[fountain] = team;
    w.alive[fountain] = 1;
    w.x[fountain] = sideX(team, FOUNTAIN.x);
    w.y[fountain] = FOUNTAIN.y;
  }
  initCamps(w, TIMELINE.campsUp);
  initPudding(w);
  initPickups(w);
  const m: MatchHandle = { config, world: w, grid: createGrid(), log: [], gate: createGate(), trail: [], events: [], ended: null, stats };
  coverStructures(m);
  refreshVision(w);
  refreshFlags(w);
  return m;
}

/**
 * Advance one tick (§4.3). `commands` are the human's commands for this tick; the latest one wins (see input.ts for
 * the move gate). A no-op after the match ended.
 */
export function step(match: Match, commands?: readonly Command[]): void {
  const m = match as MatchHandle;
  if (m.ended) return;
  const w = m.world;
  const tick = w.globals[G.Tick];
  m.events = [];

  // 0. Hero cooldowns tick (a cooldown of N ticks set on tick t is ready again on tick t + N); the Nine Lives
  //    damage ring forgets this tick's slot.
  tickCooldowns(w);
  beginTick(w);
  // 1. Human command. Sim v10: the tick's ping (if the gate let one through) is logged and applied first.
  const cmd = gateCommand(m.gate, tick, commands);
  const ping = m.gate.ping;
  if (ping && ping.op === Op.Ping) {
    m.log.push({ tick, cmd: ping });
    w.globals[G.InputHash] = fnvBytes(fnvInt(w.globals[G.InputHash], tick), encodeCommand(ping)) | 0;
    applyPing(m, ping);
    w.globals[G.HumanActAt] = tick;
  }
  if (cmd) {
    m.log.push({ tick, cmd });
    w.globals[G.InputHash] = fnvBytes(fnvInt(w.globals[G.InputHash], tick), encodeCommand(cmd)) | 0;
    applyOrder(m, HUMAN_SLOT, cmd);
    w.globals[G.HumanActAt] = tick;
  }
  // Sim v10 (GAPS B2): a forfeit is logged last; the tick still runs and the win check (step 9) ends the match.
  if (gateForfeit(m.gate, tick, commands, rulesOf(m).forfeitFrom)) {
    const ff: Command = { op: Op.Forfeit };
    m.log.push({ tick, cmd: ff });
    w.globals[G.InputHash] = fnvBytes(fnvInt(w.globals[G.InputHash], tick), encodeCommand(ff)) | 0;
  }
  // 2. Bots think (every 6 ticks, staggered by slot).
  stepBots(m);
  // 3. Timeline: waves, rat camps, Pudding, phase events, per-second map rules.
  const wave = waveAt(tick, w.globals[G.SiegeWaves]);
  if (wave >= 0) {
    if (tick >= TIMELINE.siegeFrom) w.globals[G.SiegeWaves]++;
    checkComeback(m);
    w.globals[G.Wave]++;
    spawnWave(m, wave === 1);
    spendComeback(w);
  }
  spawnCamps(m);
  spawnPickups(m);
  stepPuddingTimeline(m, wave >= 0);
  if (tick === w.globals[G.Sunset]) m.events.push({ type: 'sunset', tick });
  if (tick === w.globals[G.SuddenDeath]) m.events.push({ type: 'suddenDeath', tick });
  stepSeconds(m);
  // 4. Movement (heroes by A*, dashes and CC; minions by lane points + separation); swings start here. Then the
  //    status timers, kit timers and heals over time tick, and vision is refreshed for the targeting below.
  stepHeroes(m);
  if (w.x[HUMAN_SLOT] !== w.globals[G.HumanPX] || w.y[HUMAN_SLOT] !== w.globals[G.HumanPY]) {
    w.globals[G.HumanPX] = w.x[HUMAN_SLOT];
    w.globals[G.HumanPY] = w.y[HUMAN_SLOT];
    w.globals[G.HumanActAt] = tick;
  }
  stepMinions(m);
  stepCamps(m);
  stepPudding(m);
  clampTethers(m);
  collectPickups(m);
  stepBonuses(w);
  tickStatus(w);
  ageZones(w);
  stepKits(m);
  stepHeals(w, 0, RANGE.end);
  refreshVision(w);
  // 5. Casts and swings whose windup ends resolve.
  resolveCasts(m);
  resolveAttacks(m);
  // 6. Projectiles and zones.
  stepProjectiles(m);
  stepZones(m);
  // 7. Damage already applied; deaths, XP, level-ups (respawns run in step 4).
  resolveDeaths(m);
  // 8. Towers and cores choose targets and shoot.
  stepStructures(m);

  w.globals[G.Tick] = tick + 1;
  refreshVision(w);
  refreshFlags(w);
  // 9. Win check, hash trail.
  checkWin(m);
  if ((tick + 1) % TIMELINE.hashEvery === 0) m.trail.push(hashWorld(w));
}

/** An event as `team` may see it (POC.md §7.3): nothing from a unit hidden from it, hidden sources anonymised. */
function eventFor(w: World, e: SimEvent, team: Team): SimEvent | null {
  switch (e.type) {
    case 'cast':
    case 'windup':
      return visibleTo(w, e.src, team) ? e : null;
    case 'hit': {
      const srcSeen = e.src < 0 || visibleTo(w, e.src, team);
      if (!srcSeen && !visibleTo(w, e.dst, team)) return null;
      return srcSeen ? e : { ...e, src: -1 };
    }
    case 'talentOffer':
      return teamOfSlot(e.slot) === team ? e : null;
    case 'xp':
      return teamOfSlot(e.id) === team ? e : null;
    case 'buff':
      return visibleTo(w, e.id, team) ? e : null;
    // Sim v10: pings and barks are the human's team's own (enemy bots and their snapshot never see them).
    case 'ping':
    case 'bark':
      return team === teamOfSlot(HUMAN_SLOT) ? e : null;
    default:
      return e;
  }
}

export function snapshot(match: Match, team: Team): Snapshot {
  const m = match as MatchHandle;
  const w = m.world;
  const tick = w.globals[G.Tick];
  const entities: EntitySnap[] = [];
  for (let id = 0; id < RANGE.end; id++) {
    const k = w.kind[id];
    if (k === Kind.None) continue;
    const isHero = k === Kind.Hero;
    if (!isHero && w.alive[id] === 0) continue;
    if (!visibleTo(w, id, team)) continue;
    const kind = KIND_NAME[k];
    const e: EntitySnap = {
      id,
      kind,
      team: w.team[id] as 0 | 1 | 2,
      slot: isHero ? id : kindIndex(id, k),
      x: w.x[id],
      y: w.y[id],
      hp: w.hp[id],
      maxHp: w.maxHp[id],
      shield: w.shield[id] + (isHero ? w.kHonour[id] : 0),
      state: STATE_NAME[w.alive[id] === 0 ? UnitState.Dead : w.state[id]],
      facing: w.facing[id],
      buffs: w.buffs[id],
    };
    if (isHero) {
      e.hero = HERO_IDS[w.sub[id]];
      e.level = w.level[id];
      if (w.team[id] === team) {
        const c = w.cooldowns;
        const b = id * COOLDOWN_SLOTS;
        // A slot whose recast window is open shows ready (the kit's own rule, as canCast reads it).
        e.cooldowns = [recastCd(w, id, 0, c[b]), recastCd(w, id, 1, c[b + 1]), recastCd(w, id, 2, c[b + 2]), recastCd(w, id, 3, c[b + 3]), c[b + 4]];
        e.xp = w.xp[id];
        const t = id * TALENT_TIERS;
        e.talents = [w.talents[t], w.talents[t + 1], w.talents[t + 2]];
        e.resource = w.sub[id] === CLEM_INDEX ? w.kValor[id] : w.sub[id] === AVIETE_INDEX ? w.kRT[id] : 0;
        if (w.sub[id] === AVIETE_INDEX && w.kHuntT[id] > 0) e.lockout = w.kHuntT[id];
      }
      // Sim v10 (GAPS B6): both teams see who took the level-6 shape branch (the enemy portrait shows it).
      if (BRANCH_TALENT[e.hero] !== null && w.talents[id * TALENT_TIERS + 1] === 1) e.branch = true;
      if (w.sub[id] === AVIETE_INDEX && w.kRT[id] > 0 && w.alive[id] === 1) e.charged = true;
      if (w.fearT[id] > 0 && w.fearSrc[id] >= 0) e.charmed = true;
      if (w.alive[id] === 0) e.respawnIn = w.timer[id];
      e.bountyStreak = w.killStreak[id];
    } else if (k === Kind.Minion) {
      e.variant = MINION_VARIANT[w.sub[id]];
      e.lane = LANES[w.lane[id]];
    } else if (k === Kind.Tower) {
      e.variant = TOWER_VARIANT[w.sub[id]];
      e.lane = LANES[w.lane[id]];
    }
    entities.push(e);
  }
  for (let i = 0; i < CAPS.pickups; i++) {
    if (w.pkAlive[i] === 0) continue;
    entities.push({
      id: PICKUP_ID_BASE + i,
      kind: 'pickup',
      team: w.pkTeam[i] as 0 | 1 | 2,
      slot: i,
      sub: PICKUP_KINDS[w.pkKind[i]],
      x: w.pkX[i],
      y: w.pkY[i],
      hp: 0,
      maxHp: 0,
      shield: 0,
      state: 'idle',
      facing: 0,
      buffs: 0,
    });
  }
  const projectiles: Snapshot['projectiles'] = [];
  for (let i = 0; i < CAPS.projectiles; i++) {
    if (w.pAlive[i] === 0) continue;
    projectiles.push({ index: i, team: w.pTeam[i] as Team, owner: w.pOwner[i], x: w.pX[i], y: w.pY[i], vx: w.pVx[i], vy: w.pVy[i], kind: w.pKind[i] });
  }
  const zones: Snapshot['zones'] = [];
  for (let i = 0; i < CAPS.zones; i++) {
    if (w.zAlive[i] === 0) continue;
    // Traps are hidden from the other team.
    if (w.zKind[i] === ZONE_KIND.trap && w.zTeam[i] !== team) continue;
    zones.push({ index: i, team: w.zTeam[i] as 0 | 1 | 2, owner: w.zOwner[i], x: w.zX[i], y: w.zY[i], radius: w.zRadius[i], ttl: w.zTtl[i], kind: w.zKind[i], ...(w.zArm[i] > 0 ? { arm: w.zArm[i] } : {}) });
  }
  return {
    team,
    clock: clockAt(tick, m.ended !== null, w.globals[G.Sunset], w.globals[G.SuddenDeath]),
    score: { kills: [w.globals[G.Kills0], w.globals[G.Kills1]], towers: [w.globals[G.Towers0], w.globals[G.Towers1]] },
    entities,
    projectiles,
    zones,
    events: teamEvents(w, m.events, team),
  };
}

function teamEvents(w: World, all: readonly SimEvent[], team: Team): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < all.length; i++) {
    const e = eventFor(w, all[i], team);
    if (e) out.push(e);
  }
  return out;
}

/** A slot shows ready while its kit opens a recast on it (Clem's and Cacklejaw's Q, Avietė's E return). */
function recastCd(w: World, id: number, slot: number, cd: number): number {
  return cd > 0 && kitOf(w, id).recastReady?.(w, id, slot) === true ? 0 : cd;
}

function kindIndex(id: number, k: number): number {
  switch (k) {
    case Kind.Minion:
      return id - RANGE.minions;
    case Kind.Tower:
      return id - RANGE.towers;
    case Kind.Core:
      return id - RANGE.cores;
    case Kind.Fountain:
      return id - RANGE.fountains;
    case Kind.Camp:
      return id - RANGE.camps;
    default:
      return id - RANGE.pudding;
  }
}

/** uint32 hash of the whole state. */
export function hash(match: Match): number {
  return hashWorld((match as MatchHandle).world);
}

export function hashTrail(match: Match): readonly number[] {
  return (match as MatchHandle).trail;
}

export function result(match: Match): MatchResult | null {
  return (match as MatchHandle).ended;
}

/** The current tick. */
export function tickOf(match: Match): number {
  return (match as MatchHandle).world.globals[G.Tick];
}

/** Replay record of an ended match (the human is slot 0). Null while the match runs. */
export function replayRecord(match: Match): ReplayRecord | null {
  const m = match as MatchHandle;
  if (!m.ended) return null;
  return {
    v: 1,
    simVersion: SIM_VERSION,
    seed: m.config.seed >>> 0,
    difficulty: m.config.difficulty,
    hero: m.config.picks[HUMAN_SLOT],
    trick: m.config.tricks[HUMAN_SLOT],
    ticks: m.ended.ticks,
    inputs: toBase64(encodeStream(m.log)),
    outcome: m.ended.outcome,
    finalHash: m.ended.finalHash,
    mutator: 'none',
  };
}
