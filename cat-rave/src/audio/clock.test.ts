import { describe, expect, it } from 'vitest';
import { ARRANGEMENT, BPM } from '../config';
import type { BeatEvent, BeatEventPayload } from '../types';
import { createBeatClock } from './index';
import { keyShift, leadAt, leadLength, LEAD, LEAD_STEPS, rollRate } from './music';
import { FIRST_LOOP_BARS, LOOP_BARS, Timeline, firstPassStart, energyAt, kickOn, sectionStart } from './timeline';

const SPB = 60 / BPM;
const BAR = SPB * 4;

function fakeClock() {
  let t = 1000;
  const clock = createBeatClock({ muted: true, now: () => t });
  const seen: { event: BeatEvent; bar: number; cause?: string }[] = [];
  for (const e of ['section', 'build', 'drop'] as BeatEvent[]) {
    clock.on(e, (p: BeatEventPayload) => seen.push({ event: e, bar: p.beat.bar, cause: p.cause }));
  }
  /** Advance in ~60 fps frames, ticking like main does. */
  const advance = (seconds: number) => {
    const end = t + seconds;
    while (t < end) {
      t = Math.min(end, t + 1 / 60);
      clock.tick();
    }
  };
  clock.tick();
  return { clock, seen, advance, set: (s: number) => (t = s) };
}

describe('timeline', () => {
  it('loops the arrangement', () => {
    const tl = new Timeline();
    expect(LOOP_BARS).toBe(ARRANGEMENT.reduce((n, s) => n + s.bars, 0));
    expect(tl.at(0).section).toBe('intro');
    expect(tl.at(sectionStart('drop')).section).toBe('drop');
    expect(tl.at(sectionStart('drop')).sectionBar).toBe(0);
    expect(tl.at(LOOP_BARS).section).toBe('intro');
    expect(tl.at(LOOP_BARS + sectionStart('build') + 3)).toMatchObject({ section: 'build', sectionBar: 3 });
  });

  it('anchors jump to a section and continue the loop from there', () => {
    const tl = new Timeline();
    tl.jumpTo(6, 'drop', 'viewer');
    expect(tl.at(5).section).toBe('groove');
    expect(tl.at(6)).toMatchObject({ section: 'drop', sectionBar: 0, startBar: 6, cause: 'viewer' });
    expect(tl.at(7)).toMatchObject({ section: 'drop', sectionBar: 1, cause: 'viewer' });
    expect(tl.at(6 + 16)).toMatchObject({ section: 'breakdown', cause: 'arrangement' });
    // A later anchor overrides only from its bar on.
    tl.jumpTo(10, 'build', 'viewer');
    expect(tl.at(9).section).toBe('drop');
    expect(tl.at(10).section).toBe('build');
  });

  it('drops the kick on the last arranged build bar, keeps it while held', () => {
    const tl = new Timeline();
    const last = tl.at(sectionStart('build') + 7);
    expect(kickOn(last, 0, false)).toBe(0);
    expect(kickOn(last, 0, true)).toBe(1);
    const bd = tl.at(sectionStart('breakdown'));
    expect(kickOn(bd, 0, false)).toBeGreaterThan(0);
    expect(kickOn(bd, 1, false)).toBe(0);
    expect(energyAt(tl.at(sectionStart('drop')), 0, false)).toBe(1);
  });
});

describe('loop variation', () => {
  it('alternates long and short drops and counts loops', () => {
    const tl = new Timeline();
    const d0 = tl.at(sectionStart('drop'));
    const d1 = tl.at(LOOP_BARS + sectionStart('drop'));
    expect(d0).toMatchObject({ section: 'drop', bars: 16, loop: 0 });
    expect(d1).toMatchObject({ section: 'drop', bars: 8, loop: 1 });
    expect(tl.at(LOOP_BARS + sectionStart('drop') + 8)).toMatchObject({ section: 'breakdown', sectionBar: 0, loop: 1 });
    expect(tl.at(2 * LOOP_BARS).loop).toBe(2);
  });
  it('the short first pass drops at bar 12, then loop 1 is the full arrangement', () => {
    const tl = new Timeline({ shortFirstPass: true });
    expect(FIRST_LOOP_BARS).toBe(LOOP_BARS - 12);
    expect(tl.at(4)).toMatchObject({ section: 'groove', sectionBar: 0, bars: 4 });
    expect(tl.at(8)).toMatchObject({ section: 'build', sectionBar: 0, bars: 4 });
    expect(tl.at(11)).toMatchObject({ section: 'build', sectionBar: 3 });
    expect(kickOn(tl.at(11), 0, false)).toBe(0);
    expect(tl.at(12)).toMatchObject({ section: 'drop', sectionBar: 0, loop: 0, bars: 16 });
    expect(tl.at(FIRST_LOOP_BARS)).toMatchObject({ section: 'intro', sectionBar: 0, loop: 1 });
    expect(tl.at(FIRST_LOOP_BARS + sectionStart('drop'))).toMatchObject({ section: 'drop', loop: 1, bars: 8 });
    expect(tl.at(FIRST_LOOP_BARS + LOOP_BARS).loop).toBe(2);
    // A hold in the short groove jumps to the build of the same loop.
    tl.jumpTo(6, 'build', 'viewer');
    expect(tl.at(6)).toMatchObject({ section: 'build', loop: 0, sectionBar: 0, bars: 8 });
  });
  it('a drop requested from the breakdown starts the next loop', () => {
    const tl = new Timeline();
    const bd = sectionStart('breakdown') + 2;
    tl.jumpTo(bd, 'drop', 'viewer');
    expect(tl.at(bd)).toMatchObject({ section: 'drop', loop: 1 });
  });
  it('key and lead change per loop', () => {
    expect(keyShift(0)).toBe(0);
    expect(keyShift(1)).not.toBe(0);
    expect(leadAt(0, 0, 0)?.note).toBe(LEAD[0][0]);
    expect(leadAt(1, 0, 2)).not.toBeNull(); // the 8th-note arpeggio
    expect(leadAt(0, 0, 2)).toBeNull();
  });
});

describe('music data', () => {
  it('lead rows fit the rhythm', () => {
    for (const row of LEAD) expect(row).toHaveLength(LEAD_STEPS.length);
    expect(LEAD_STEPS.reduce((n, _s, i) => n + leadLength(i), LEAD_STEPS[0])).toBe(16);
  });
  it('snare roll doubles and divides the bar', () => {
    expect([0, 2, 4, 7].map((b) => rollRate(b, false))).toEqual([4, 8, 16, 16]);
    for (let b = 0; b < 8; b++) expect(16 % rollRate(b, b % 2 === 0)).toBe(0);
  });
});

describe('BeatClock (silent, fake clock)', () => {
  it('beat math', () => {
    const { clock, set } = fakeClock();
    set(1000 + BAR + SPB * 0.5);
    const b = clock.now();
    expect(b.bpm).toBe(BPM);
    expect(b.bar).toBe(1);
    expect(b.beatInBar).toBe(0);
    expect(b.phase).toBeCloseTo(0.5, 6);
    expect(b.section).toBe('intro');
    expect(b.kick).toBeGreaterThan(0);
    expect(b.kick).toBeLessThan(0.1);
    expect(clock.unlocked).toBe(false);
  });

  it('follows the arrangement and emits build then drop (short first pass: drop at bar 12, ~21 s)', () => {
    const { seen, advance } = fakeClock();
    advance(BAR * (firstPassStart('drop') + 0.5));
    const builds = seen.filter((s) => s.event === 'build');
    const drops = seen.filter((s) => s.event === 'drop');
    expect(firstPassStart('drop')).toBe(12);
    expect(BAR * 12).toBeLessThan(22);
    expect(builds.map((s) => s.bar)).toEqual([firstPassStart('build')]);
    expect(drops).toEqual([{ event: 'drop', bar: firstPassStart('drop'), cause: 'arrangement' }]);
  });

  it('hold builds from the next bar, release drops on the next downbeat', () => {
    const { clock, seen, advance } = fakeClock();
    advance(BAR * 5.3); // bar 5, groove
    clock.beginBuild();
    expect(clock.now().held).toBe(true);
    advance(BAR * 1); // into bar 6
    expect(clock.now().section).toBe('build');
    expect(seen.find((s) => s.event === 'build')?.bar).toBe(6);
    advance(BAR * 1.2); // bar 7
    clock.endBuild();
    expect(clock.now().held).toBe(false);
    advance(BAR);
    const drop = seen.find((s) => s.event === 'drop');
    expect(drop).toEqual({ event: 'drop', bar: 8, cause: 'viewer' });
    expect(clock.now().section).toBe('drop');
  });

  it('a hold longer than 8 bars drops by itself', () => {
    const { clock, seen, advance } = fakeClock();
    advance(BAR * 5.5);
    clock.beginBuild();
    advance(BAR * 10);
    const drop = seen.find((s) => s.event === 'drop');
    expect(drop?.bar).toBe(6 + 8);
    expect(drop?.cause).toBe('viewer');
    expect(clock.now().held).toBe(false);
  });

  it('queueDrop lands on the next bar and is ignored within 2 bars of a drop', () => {
    const { clock, seen, advance } = fakeClock();
    advance(BAR * 2.5);
    clock.queueDrop('new-cat');
    advance(BAR);
    expect(seen.filter((s) => s.event === 'drop')).toEqual([{ event: 'drop', bar: 3, cause: 'new-cat' }]);
    clock.queueDrop('viewer'); // 0 bars into the drop
    advance(BAR); // bar 4, 1 bar in
    clock.queueDrop('viewer');
    advance(BAR * 0.5);
    expect(seen.filter((s) => s.event === 'drop')).toHaveLength(1);
    advance(BAR); // bar 5, 2 bars in: allowed again
    clock.queueDrop('viewer');
    advance(BAR);
    expect(seen.filter((s) => s.event === 'drop').map((s) => s.bar)).toEqual([3, 6]);
  });

  it('unlock is a safe no-op without WebAudio', async () => {
    const { clock } = fakeClock();
    expect(await clock.unlock()).toBe(false);
    clock.setMuted(false);
    expect(clock.muted).toBe(false);
    clock.tap();
    clock.meow();
    clock.cheer();
    clock.dispose();
  });
});
