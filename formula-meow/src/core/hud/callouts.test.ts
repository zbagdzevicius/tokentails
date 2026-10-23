// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Hud } from './hud';

describe('callout pacing (playtest, iteration 4)', () => {
  it('a small callout right after another is dropped; a bigger one still lands', () => {
    const hud = new Hud(document.body);
    hud.say('SLIPSTREAM!', { prio: 1 });
    hud.say('ZOOM!', { prio: 1 });
    expect(hud.saying).toBe('SLIPSTREAM!');
    hud.say('FINAL LAP', { prio: 3 });
    expect(hud.saying).toBe('FINAL LAP');
  });

  it('a stunt call (with an id) is never dropped by the gap', () => {
    const hud = new Hud(document.body);
    hud.say('TUNNEL RUN!', { prio: 1 });
    hud.say('LOOP-DE-MEOW!', { prio: 1, id: 'stunt' });
    expect(hud.saying).toBe('LOOP-DE-MEOW!');
  });
});
