/**
 * Sim v35 deaths and kill-XP probe (docs/plans/moba/V35-DEATHS.md), bundled for Node by tools/deaths-probe.mjs.
 * One PvP match per seed with `normal` pilots in every slot, observed from the outside (it never writes the world):
 * - every hero death: [tick, respawn wait (ticks), the hero's death number in this match (1 = first), level];
 * - at 5:00, 8:00 and 10:00: [kills, deaths, level] of every hero;
 * - XP earned by source (champion takedowns = 'kill' + 'assist'; everything else);
 * - ticks spent dead per hero (the most-dying hero's share of the match is the "misery" number);
 * - comeback: the team behind at the check (5v5 7:00: 2+ towers or 5+ takedowns; 3v3 3:30: takedowns + 3 a tower ≥ 3).
 */
import type { HeroId, MapId, MatchConfig, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { Rng } from '../../src/sim/rng';
import { G } from '../../src/sim/world';

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts', 'mochi', 'ziggy', 'nova', 'dusty'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino', 'biscuit', 'champ', 'barkula', 'ranger'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

export interface DeathsRow {
  seed: number;
  map: string;
  ticks: number;
  winner: number;
  reason: string;
  catsLeft: boolean;
  heroes: HeroId[];
  /** [tick, waitTicks, deathNumber, level] per hero death. */
  waits: number[][];
  /** minute → per hero [kills, deaths, level]; 99: at the end. */
  snaps: Record<number, number[][]>;
  /** XP per hero: [takedown XP (kill + assist), all XP]. */
  xp: number[][];
  /** Ticks dead per hero, and deaths per hero at the end. */
  dead: number[];
  deaths: number[];
  behind: number;
  kills: [number, number];
}

export function deathsProbe(seed: number, map: MapId): DeathsRow {
  const five = map === 'hearthwood';
  const n = five ? 5 : 3;
  const r = new Rng(seed).fork('kills-probe');
  const draw = (pool: readonly HeroId[]): HeroId[] => {
    const left = pool.slice();
    const out: HeroId[] = [];
    for (let k = 0; k < n; k++) out.push(left.splice(r.int(left.length), 1)[0]);
    return out;
  };
  const cats = draw(CAT_IDS);
  const dogs = draw(DOG_IDS);
  const catsLeft = (seed & 1) === 0;
  const slots = Array.from({ length: 2 * n }, (_, i) => i);
  const seats = slots.map((slot) => {
    const cat = slot < n === catsLeft;
    return { slot, hero: (cat ? cats : dogs)[slot % n], trick: TRICKS[r.int(TRICKS.length)] };
  });
  const { picks, tricks } = fillPicksParty(seed, seats, map);
  const config: MatchConfig = { seed, picks, tricks, difficulty: 'hard', humans: slots, mode: 'pvp', map };
  const m = createMatch(config) as MatchHandle;
  const w = m.world;
  const pilots = slots.map((s) => createPlayerBotFor(m, 'normal', s));
  const row: DeathsRow = {
    seed, map, ticks: 0, winner: -1, reason: '', catsLeft, heroes: picks.slice(0, 2 * n), waits: [], snaps: {},
    xp: slots.map(() => [0, 0]), dead: slots.map(() => 0), deaths: slots.map(() => 0), behind: -1, kills: [0, 0],
  };
  const checkAt = five ? 12600 : 6300;
  while (!result(m)) {
    const out = pilots.map((p) => playerBotCommands(m, p));
    step(m, out[0], out);
    const tick = w.globals[G.Tick];
    for (const e of m.events) {
      if (e.type === 'death' && e.id >= 0 && e.id < 2 * n) {
        row.deaths[e.id]++;
        row.waits.push([e.tick, w.timer[e.id], row.deaths[e.id], w.level[e.id]]);
      } else if (e.type === 'xp' && e.id >= 0 && e.id < 2 * n) {
        row.xp[e.id][1] += e.amount;
        if (e.reason === 'kill' || e.reason === 'assist') row.xp[e.id][0] += e.amount;
      }
    }
    for (let h = 0; h < 2 * n; h++) if (w.alive[h] === 0) row.dead[h]++;
    const k0 = w.globals[G.Kills0];
    const k1 = w.globals[G.Kills1];
    const t0 = w.globals[G.Towers0];
    const t1 = w.globals[G.Towers0 + 1];
    if (tick === checkAt) {
      if (five) {
        if (t0 - t1 >= 2 || k0 - k1 >= 5) row.behind = 1;
        else if (t1 - t0 >= 2 || k1 - k0 >= 5) row.behind = 0;
      } else {
        const s = k0 - k1 + 3 * (t0 - t1);
        if (s >= 3) row.behind = 1;
        else if (s <= -3) row.behind = 0;
      }
    }
    for (const min of [3, 5, 8, 10, 12]) {
      if (tick === min * 1800) row.snaps[min] = slots.map((h) => [m.stats[h].kills, m.stats[h].deaths, w.level[h]]);
    }
  }
  const res = result(m)!;
  row.ticks = res.ticks;
  row.winner = res.winner;
  row.reason = res.reason;
  row.kills = [w.globals[G.Kills0], w.globals[G.Kills1]];
  row.snaps[99] = slots.map((h) => [m.stats[h].kills, m.stats[h].deaths, w.level[h]]);
  return row;
}
