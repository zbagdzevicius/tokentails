/**
 * Sim v33 kill-reward and respawn probe (docs/plans/moba/V33-KILLS.md), bundled for Node by tools/kills-probe.mjs.
 * One PvP match per seed with `normal` pilots in every slot (Hearthwood 5v5 or Crossing 3v3), observed from the
 * outside (it never writes the world):
 * - at 5:00, 10:00 and 15:00 (while the match runs): the top killer (most kills, then fewest deaths) against the
 *   lowest-kill hero of the lobby: kills, levels, Toys and Fish of both;
 * - every death's respawn wait by minute of the match;
 * - comeback: the team behind at the check (5v5 7:00: 2+ towers or 5+ takedowns; 3v3 3:30: takedowns + 3 a tower ≥ 3),
 *   the biggest takedown gap and who led it; the end reason and length.
 */
import type { HeroId, MatchConfig, TrickId } from '../../src/sim/api';
import { createMatch, createPlayerBotFor, playerBotCommands, result, step, type MatchHandle } from '../../src/sim/index';
import { fillPicksParty } from '../../src/sim/party';
import { Rng } from '../../src/sim/rng';
import { G } from '../../src/sim/world';

const CAT_IDS: readonly HeroId[] = ['clem', 'sage', 'gabe', 'meatball', 'duchess', 'aviete', 'bengas', 'lambo', 'pixel', 'stilts', 'mochi', 'ziggy', 'nova', 'dusty'];
const DOG_IDS: readonly HeroId[] = ['brutus', 'cacklejaw', 'nugget', 'marshmallow', 'bravo', 'chili', 'howler', 'rocket', 'frankie', 'domino', 'biscuit', 'champ', 'barkula', 'ranger'];
const TRICKS: readonly TrickId[] = ['pounce', 'snack', 'hiss', 'purrify'];

export interface Snap {
  t: number;
  /** [kills, deaths, level, toys, fishTotal] of the top killer, then of the lowest-kill hero. */
  top: number[];
  low: number[];
  /** Same team? */
  same: boolean;
}

export interface KillsRow {
  seed: number;
  map: string;
  ticks: number;
  winner: number;
  reason: string;
  catsLeft: boolean;
  heroes: HeroId[];
  snaps: Snap[];
  /** [tick, waitTicks, level] per hero death. */
  waits: number[][];
  behind: number;
  maxGap: number;
  maxGapLeader: number;
  kills: [number, number];
  towers: [number, number];
}

export function killsProbe(seed: number, map: 'hearthwood' | 'crossing'): KillsRow {
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
  const row: KillsRow = { seed, map, ticks: 0, winner: -1, reason: '', catsLeft, heroes: picks.slice(0, 2 * n), snaps: [], waits: [], behind: -1, maxGap: 0, maxGapLeader: -1, kills: [0, 0], towers: [0, 0] };
  const checkAt = five ? 12600 : 6300;
  while (!result(m)) {
    const out = pilots.map((p) => playerBotCommands(m, p));
    step(m, out[0], out);
    const tick = w.globals[G.Tick];
    for (const e of m.events) if (e.type === 'death' && e.id >= 0 && e.id < 2 * n) row.waits.push([e.tick, w.timer[e.id], w.level[e.id]]);
    const k0 = w.globals[G.Kills0];
    const k1 = w.globals[G.Kills1];
    if (Math.abs(k0 - k1) > row.maxGap) {
      row.maxGap = Math.abs(k0 - k1);
      row.maxGapLeader = k0 > k1 ? 0 : 1;
    }
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
    if (tick % 9000 === 0 && tick > 0) {
      let top = 0;
      let low = 0;
      for (let h = 1; h < 2 * n; h++) {
        const s = m.stats[h];
        const ts = m.stats[top];
        if (s.kills > ts.kills || (s.kills === ts.kills && s.deaths < ts.deaths)) top = h;
        const ls = m.stats[low];
        if (s.kills < ls.kills || (s.kills === ls.kills && s.deaths > ls.deaths)) low = h;
      }
      const of = (h: number): number[] => [m.stats[h].kills, m.stats[h].deaths, w.level[h], w.toy[h], w.fishTotal[h]];
      row.snaps.push({ t: tick / 1800, top: of(top), low: of(low), same: w.team[top] === w.team[low] });
    }
  }
  const res = result(m)!;
  row.ticks = res.ticks;
  row.winner = res.winner;
  row.reason = res.reason;
  row.kills = [w.globals[G.Kills0], w.globals[G.Kills1]];
  row.towers = [w.globals[G.Towers0], w.globals[G.Towers0 + 1]];
  return row;
}
