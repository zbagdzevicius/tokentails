// @vitest-environment happy-dom
/**
 * Launch findings ftue-3 and ftue-4 (area ftue/objective-chips). ftue-3: the guided Pudding beat of matches 1-3 and
 * the standing "Calm Pudding!" chip of match 4+ must give the same action, and that action is the sim's: damage fills
 * his calm meter and the last hit calms him (src/sim/units/pudding.ts); standing next to him does nothing.
 * ftue-4: on short phone screens the chip keeps its one-line instruction instead of hiding it (LoL pass: the rail).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIMELINE } from '../../src/data/timeline';
import { ObjectiveClock, Objectives, beatText } from '../../src/onboarding/objectives';
import type { Note } from '../../src/ui/notify';
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

describe('ftue-4: phones keep the instruction line (LoL pass: on the top rail)', () => {
  const css = readFileSync(resolve(__dirname, '../../src/ui/css/rail.css'), 'utf8');

  it('a beat on touch says the how-to as its rail note, and the goal stays on the resting line', () => {
    const notes: Note[] = [];
    const rests: (string | null)[] = [];
    const g = new Objectives({ push: (n) => (notes.push(n), true), rest: (_k, t) => void rests.push(t), drop: () => {} }, 'rookie');
    g.touch = true;
    g.start('pudding');
    expect(notes[0].title).toBe('Tap ATK on him in the river');
    expect(rests.at(-1)).toBe('Calm Pudding!');
  });

  it('the rail title is one ellipsised line, never hidden', () => {
    expect(css).toMatch(/\.pl-rail-line \.tt \{[^}]*text-overflow: ellipsis/);
    expect(css).not.toMatch(/\.pl-rail-line \.tt\s*\{[^}]*display:\s*none/);
  });
});
