// @vitest-environment happy-dom
/**
 * Launch findings ftue-3 and ftue-4 (area ftue/objective-chips). ftue-3: the guided Pudding beat of matches 1-3 and
 * the standing "Calm Pudding!" chip of match 4+ must give the same action, and that action is the sim's: damage fills
 * his calm meter and the last hit calms him (src/sim/units/pudding.ts); standing next to him does nothing.
 * ftue-4: on short phone screens the chip keeps its one-line instruction instead of hiding it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIMELINE } from '../../src/data/timeline';
import { ObjectiveClock, beatText } from '../../src/onboarding/objectives';
import type { MatchClock } from '../../src/sim/index';

const clock = (tick: number): MatchClock => ({ tick, seconds: Math.floor(tick / 30), phase: 'play', nextPhaseIn: 6000 });

function wildChip(): string {
  const c = new ObjectiveClock(0);
  c.frame([], clock(TIMELINE.pudding));
  c.feed({ type: 'pudding', tick: TIMELINE.pudding, what: 'spawn' });
  const chip = c.chip();
  expect(chip).toMatchObject({ key: 'calm', title: 'Calm Pudding!' });
  return chip.sub;
}

describe('ftue-3: the Pudding beat and the standing chip agree', () => {
  for (const pad of [null, true, false] as const) {
    it(`desktop (pad ${String(pad)}): both say "Hit him in the river"`, () => {
      const beat = beatText('pudding', false, undefined, pad);
      const chip = wildChip();
      expect(beat.title).toBe('Calm Pudding!');
      expect(beat.sub.startsWith('Hit him in the river')).toBe(true);
      expect(chip.startsWith('Hit him in the river')).toBe(true);
    });
  }

  it('touch: names the attack button on him in the river', () => {
    const beat = beatText('pudding', true, { q: 'Q', r: 'R' }, null);
    expect(beat.sub).toBe('Tap ATK on him in the river');
    expect(beat.sub).toMatch(/in the river/);
    expect(wildChip()).toMatch(/in the river/);
  });

  it('no line tells the player to stand next to him', () => {
    for (const touch of [false, true]) expect(beatText('pudding', touch).sub).not.toMatch(/stand|next to/i);
    expect(wildChip()).not.toMatch(/stand|next to/i);
  });
});

describe('ftue-4: phone chips keep their instruction line', () => {
  const css = readFileSync(resolve(__dirname, '../../src/ui/ui.css'), 'utf8');

  it('no media query hides the chip or standing chip sub-line', () => {
    expect(css).not.toMatch(/\.pl-goal(\.standing)?\s+\.txt\s+small\s*\{[^}]*display:\s*none/);
  });

  it('the short-screen rule keeps it to one ellipsised line', () => {
    const block = css.match(/@media \(max-height: 460px\) \{[\s\S]*?\n\}/g)?.find((b) => b.includes('.pl-goal .txt small')) ?? '';
    expect(block).toMatch(/\.pl-goal \.txt small \{[^}]*text-overflow: ellipsis/);
  });
});
