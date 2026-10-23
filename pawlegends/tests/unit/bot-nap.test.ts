/**
 * Bots never start Nap next to a visible enemy hero (playtest: a Normal bot read "Napping" ~6 m from the player).
 * The rule (sim/bots/brain.ts retreat → BOT_AI.napSafeRange) scans EVERY visible enemy hero, not only the nearest
 * lane opponent; a nap that started out of range is only broken by damage, so a hero walking up afterwards still
 * sees "Napping". This pins the rule for each enemy slot.
 */
import { describe, expect, it } from 'vitest';
import { BOT_AI } from '../../src/data/bots';
import { G, UnitState } from '../../src/sim/world';
import { heroMatch, hold, place, steps } from './heroes/kit-helpers';

const BOT = 4;
const AT = { x: 60000, y: 30000 };

describe('bot nap safety (napSafeRange)', () => {
  for (const near of [0, 1, 2]) {
    it(`does not nap while enemy hero ${near} stands ${BOT_AI.napSafeRange / 2000} m away (others far)`, () => {
      const m = heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'clem', 'sage']);
      m.world.globals[G.BotsOff] = 0;
      const w = m.world;
      place(m, BOT, AT.x, AT.y);
      w.hp[BOT] = Math.trunc(w.maxHp[BOT] / 50); // 2%: under BOT_AI.retreatAlwaysBp of the retreat line (sim v4)
      for (const s of [0, 1, 2]) {
        if (s === near) place(m, s, AT.x - BOT_AI.napSafeRange / 2, AT.y);
        else place(m, s, 8000, 8000);
        hold(m, s);
      }
      let napped = false;
      for (let t = 0; t < 45; t++) {
        steps(m, 1);
        // keep the threat beside the bot as it walks away (and visible: not in brush, same open ground)
        place(m, near, w.x[BOT] - BOT_AI.napSafeRange / 2, w.y[BOT]);
        if (w.state[BOT] === UnitState.Napping || w.napT[BOT] > 0) napped = true;
      }
      expect(napped).toBe(false);
    });
  }

  it('does nap once no enemy hero is within range', () => {
    const m = heroMatch(['clem', 'sage', 'brutus', 'cacklejaw', 'clem', 'sage']);
    m.world.globals[G.BotsOff] = 0;
    const w = m.world;
    place(m, BOT, AT.x, AT.y);
    w.hp[BOT] = Math.trunc(w.maxHp[BOT] / 50); // 2%: under BOT_AI.retreatAlwaysBp of the retreat line (sim v4)
    for (const s of [0, 1, 2]) {
      place(m, s, 8000, 8000);
      hold(m, s);
    }
    let napped = false;
    for (let t = 0; t < 90 && !napped; t++) {
      steps(m, 1);
      if (w.state[BOT] === UnitState.Napping || w.napT[BOT] > 0) napped = true;
    }
    expect(napped).toBe(true);
  });
});
