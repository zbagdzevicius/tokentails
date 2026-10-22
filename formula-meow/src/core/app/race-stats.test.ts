import { describe, expect, it } from 'vitest';
import { BoostSource, type RaceEvent } from '../../types';
import { buildRaceStats, STYLE, styleScore } from './race-stats';

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

  it('iteration 4 (F12): set pieces with the stunt tally rules, the best combo and the Style score', () => {
    const events: RaceEvent[] = [
      // kart 1: a loop (clean), a clean landing 2 s later, a wall lane ridden clean: one ×3 combo
      ev(400, 'stuntEnter', 1, 0, 0),
      ev(460, 'stuntExit', 1, 0, 1),
      ev(560, 'stuntEnter', 1, 2, 1),
      ev(590, 'stuntLand', 1, 30, 1),
      ev(700, 'stuntEnter', 1, 1, 2),
      ev(760, 'stuntExit', 1, 1, 1),
      // a messy loop exit and a net catch count nothing (and take nothing away)
      ev(2000, 'stuntExit', 1, 0, 0),
      ev(2100, 'netCatch', 1, 0, 1),
      ev(2200, 'trick', 1),
      ev(2300, 'miniTurbo', 1, 3),
      // kart 2: one loop, then another 10 s later (no combo)
      ev(500, 'stuntExit', 2, 0, 1),
      ev(1100, 'stuntExit', 2, 0, 1),
      // a global event never lands on a kart
      ev(900, 'frenzy', -1),
    ];
    const s = buildRaceStats(events, 4, 180);
    expect([s[1].loops, s[1].walls, s[1].cleanLandings, s[1].bestCombo]).toEqual([1, 1, 1, 3]);
    expect(s[1].style).toBe(STYLE.loop + STYLE.wall + STYLE.landing + STYLE.trick + STYLE.pinkTurbo + 2 * STYLE.combo);
    expect([s[2].loops, s[2].walls, s[2].cleanLandings, s[2].bestCombo]).toEqual([2, 0, 0, 1]);
    expect(s[2].style).toBe(2 * STYLE.loop);
    expect(s[3].style).toBe(0);
    expect(s[3].bestCombo).toBe(0);
    expect(styleScore(s[0])).toBe(0);
  });
});
