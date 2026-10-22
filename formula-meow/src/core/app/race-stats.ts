/**
 * Race stats (iteration 2 contract, integrator-owned): what every kart did in one race, built from the event log
 * (pure, no DOM, unit tested). Progression's achievements and stats page read only this, never the raw events.
 *
 * `worstPlace` / `bestPlaceGain` need the place history, which the event log only has for humans; SimWorld passes
 * the worst place each kart held after the first lap began (`worst`, optional).
 *
 * Iteration 4 (F12): set pieces go through the juice lane's `StuntTally` (one per kart), so `loops`, `walls`,
 * `cleanLandings` and `bestCombo` follow exactly the rules the HUD calls out (a loop or wall lane counts on a clean
 * exit, a jump on its clean landing, a tunnel run feeds the combo). `style` is the Style score (`STYLE` weights).
 */
import { BoostSource, type RaceEvent, type RaceStats } from '../../types';
import { StuntTally } from '../../juice/stunts';

/** Style score weights (F12): points per stunt, trick and pink mini-turbo, plus a bonus per step of the best combo. */
export const STYLE = {
  loop: 100,
  wall: 60,
  landing: 80,
  trick: 40,
  pinkTurbo: 30,
  /** per combo step from ×2 on (a ×3 combo adds 2 × combo) */
  combo: 50,
} as const;

/** Style score of one kart's stats (pure; never negative). */
export function styleScore(s: Pick<RaceStats, 'loops' | 'walls' | 'cleanLandings' | 'tricks' | 'miniTurbos' | 'bestCombo'>): number {
  return (
    s.loops * STYLE.loop +
    s.walls * STYLE.wall +
    s.cleanLandings * STYLE.landing +
    s.tricks * STYLE.trick +
    s.miniTurbos[2] * STYLE.pinkTurbo +
    Math.max(0, s.bestCombo - 1) * STYLE.combo
  );
}

export function emptyStats(kart: number): RaceStats {
  return {
    kart,
    hitsDealt: 0,
    hitsTaken: 0,
    miniTurbos: [0, 0, 0],
    pounce: false,
    tricks: 0,
    coinsPicked: 0,
    itemsUsed: 0,
    overtakes: 0,
    bestPlaceGain: 0,
    worstPlace: 0,
    wallHits: 0,
    respawns: 0,
    slipstreams: 0,
    shortcuts: 0,
    balloonPops: 0,
    balloonSteals: 0,
    loops: 0,
    walls: 0,
    cleanLandings: 0,
    bestCombo: 0,
    style: 0,
  };
}

export function buildRaceStats(events: readonly RaceEvent[], karts: number, goTick: number, worst?: readonly number[], finalPlace?: readonly number[]): RaceStats[] {
  const out: RaceStats[] = [];
  for (let k = 0; k < karts; k++) out.push(emptyStats(k));
  const at = (k: number | undefined): RaceStats | null => (k != null && k >= 0 && k < karts ? out[k] : null);
  const tallies: StuntTally[] = [];
  for (let k = 0; k < karts; k++) tallies.push(new StuntTally());
  for (const e of events) {
    const s = at(e.kart);
    if (s && (e.type === 'stuntEnter' || e.type === 'stuntExit' || e.type === 'stuntLand' || e.type === 'netCatch')) tallies[e.kart].onEvent(e, e.kart);
    switch (e.type) {
      case 'hit': {
        if (s) s.hitsTaken++;
        const by = at(e.b);
        if (by && e.b !== e.kart) by.hitsDealt++;
        break;
      }
      case 'miniTurbo':
        if (s && e.a != null && e.a >= 1 && e.a <= 3) s.miniTurbos[e.a - 1]++;
        break;
      case 'pounce':
        if (s) s.pounce = true;
        break;
      case 'trick':
        if (s) s.tricks++;
        break;
      case 'coin':
        if (s) s.coinsPicked++;
        break;
      case 'itemUse':
        if (s) s.itemsUsed++;
        break;
      case 'overtake':
        if (s && e.tick >= goTick) s.overtakes++;
        break;
      case 'wall':
        if (s) s.wallHits++;
        break;
      case 'respawn':
        if (s) s.respawns++;
        break;
      case 'boost':
        if (s && e.a === BoostSource.Slipstream) s.slipstreams++;
        break;
      case 'balloonPop': {
        const by = at(e.b);
        if (by) by.balloonPops++;
        break;
      }
      case 'balloonSteal': {
        const by = at(e.b);
        if (by) by.balloonSteals++;
        break;
      }
      default:
        break;
    }
  }
  for (let k = 0; k < karts; k++) {
    const t = tallies[k].summary;
    const s = out[k];
    s.loops = t.loops;
    s.walls = t.walls;
    s.cleanLandings = t.landings;
    s.bestCombo = t.bestCombo;
    s.style = styleScore(s);
  }
  if (worst && finalPlace) {
    for (let k = 0; k < karts; k++) {
      const w = worst[k] ?? 0;
      out[k].worstPlace = w;
      const f = finalPlace[k] ?? 0;
      out[k].bestPlaceGain = w > 0 && f > 0 ? Math.max(0, w - f) : 0;
    }
  }
  return out;
}
