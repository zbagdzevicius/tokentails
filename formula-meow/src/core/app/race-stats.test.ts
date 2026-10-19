import { describe, expect, it } from 'vitest';
import { BoostSource, type RaceEvent } from '../../types';
import { buildRaceStats } from './race-stats';

const ev = (tick: number, type: RaceEvent['type'], kart: number, a?: number, b?: number): RaceEvent => ({ tick, type, kart, a, b });

describe('race stats (iteration 2)', () => {
  it('counts what each kart did from the event log', () => {
    const events: RaceEvent[] = [
      ev(170, 'pounce', 1),
      ev(200, 'hit', 2, 0, 1),
      ev(210, 'hit', 1, 2, -1),
      ev(300, 'miniTurbo', 1, 3),
      ev(310, 'miniTurbo', 1, 1),
      ev(320, 'boost', 1, BoostSource.Slipstream, 1.25),
      ev(330, 'coin', 1, 1),
      ev(340, 'itemUse', 1),
      ev(350, 'overtake', 1, 2, 3),
      ev(360, 'wall', 2, 2),
      ev(370, 'respawn', 2),
      ev(380, 'trick', 1),
      ev(390, 'balloonPop', 3, 0, 1),
    ];
    const s = buildRaceStats(events, 4, 180, [0, 6, 3, 2], [4, 1, 3, 2]);
    expect(s[1].pounce).toBe(true);
    expect(s[1].hitsDealt).toBe(1);
    expect(s[1].hitsTaken).toBe(1);
    expect(s[2].hitsTaken).toBe(1);
    expect(s[1].miniTurbos).toEqual([1, 0, 1]);
    expect(s[1].slipstreams).toBe(1);
    expect(s[1].coinsPicked).toBe(1);
    expect(s[1].itemsUsed).toBe(1);
    expect(s[1].overtakes).toBe(1);
    expect(s[2].wallHits).toBe(1);
    expect(s[2].respawns).toBe(1);
    expect(s[1].tricks).toBe(1);
    expect(s[1].balloonPops).toBe(1);
    expect(s[1].worstPlace).toBe(6);
    expect(s[1].bestPlaceGain).toBe(5);
  });
});
