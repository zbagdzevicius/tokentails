import { describe, expect, it } from 'vitest';
import { CUDDLE_TICKS } from '../../types';
import { fallBreak, fixtureRoom, fixtureRun } from '../test-fixtures';
import { clipGates } from './gates';
import {
  CLIP_FRAMES,
  GAME_FRAMES,
  LOOP_FROM_FRAME,
  OPENER_FRAMES,
  SLOW_SPEED,
  clipFrameTick,
  findCandidates,
  planClip,
} from './highlights';

const play = fixtureRoom();

describe('planClip: tension pick (GDD 7.3)', () => {
  it('turned-too-late beats a higher-suspicion candidate', () => {
    const r = fixtureRun([
      ...fallBreak(1, 400),
      { t: 'seen', tick: 380, suspicion: 95_000 },
      ...fallBreak(0, 1000),
      { t: 'seen', tick: 960, suspicion: 20_000 },
      { t: 'human', tick: 1006, human: 0, state: 'look' },
    ]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.pick).toBe('turned_late');
    expect(plan.crime.prop).toBe(0);
    expect(plan.crime.turnGapTicks).toBe(6);
    expect(plan.hook).toBe('He turned around 0.2 seconds too late');
    expect(plan.slowMo).toEqual({ fromTick: 1000, toTick: 1019, speed: SLOW_SPEED });
    expect(plan.crime.breakTick).toBe(1013);
    expect(plan.crime.toTick).toBe(1013 + 45);
    expect(plan.crime.fromTick).toBe(1013 + 45 - 210);
  });

  it('a low-tension crime slides its window to the next turn and ends 1 s after the LOOK starts (round 3)', () => {
    const r = fixtureRun([...fallBreak(0, 100), { t: 'human', tick: 200, human: 0, state: 'telegraph' }, { t: 'human', tick: 224, human: 0, state: 'look' }]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.crime.toTick).toBe(224 + 30);
    expect(plan.crime.fromTick).toBeLessThanOrEqual(100);
    expect(plan.crime.lookTick).toBe(200);
    // the turn is on screen before the loop cut
    let lookFrame = -1;
    for (let f = OPENER_FRAMES; f < LOOP_FROM_FRAME; f++) if (lookFrame < 0 && clipFrameTick(plan, f) >= 224) lookFrame = f;
    expect(lookFrame).toBeGreaterThan(0);
    // a turn more than 4 s after the break keeps the plain window
    const far = planClip(fixtureRun([...fallBreak(0, 100), { t: 'human', tick: 300, human: 0, state: 'telegraph' }, { t: 'human', tick: 324, human: 0, state: 'look' }]), play, 'Mochi');
    expect(far.crime.toTick).toBe(far.crime.breakTick + 45);
    expect(far.crime.lookTick).toBeUndefined();
  });

  it('a LOOK more than 12 ticks after the fall is not "turned too late"', () => {
    const r = fixtureRun([...fallBreak(0, 1000), { t: 'human', tick: 1013, human: 0, state: 'look' }]);
    const c = findCandidates(r, play);
    expect(c[0].turnGapTicks).toBeUndefined();
  });

  it('a fake-out is not a LOOK', () => {
    const r = fixtureRun([...fallBreak(0, 1000), { t: 'human', tick: 1003, human: 0, state: 'fakeout' }]);
    expect(findCandidates(r, play)[0].turnGapTicks).toBeUndefined();
  });

  it('higher peak suspicion wins without a turned-late beat', () => {
    const r = fixtureRun([
      ...fallBreak(1, 400),
      { t: 'seen', tick: 380, suspicion: 80_000 },
      ...fallBreak(4, 1000, 3),
      { t: 'seen', tick: 950, suspicion: 30_000 },
    ]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.pick).toBe('tension');
    expect(plan.crime.prop).toBe(1);
  });

  it('ties go to the earliest candidate; a long fall wins over a short one (review round 1)', () => {
    // two Must-Wreck targets, same height, same tension: the earlier one
    const r = fixtureRun([
      ...fallBreak(4, 1200, 2),
      { t: 'seen', tick: 1150, suspicion: 40_000 },
      ...fallBreak(0, 500, 2),
      { t: 'seen', tick: 450, suspicion: 40_000 },
    ]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.crime.prop).toBe(0);
    expect(plan.pick).toBe('tension');
    // the same tension, but prop 4 falls from L3 and prop 0 from L1: the long fall wins
    const r2 = fixtureRun([
      ...fallBreak(4, 1200, 3),
      { t: 'seen', tick: 1150, suspicion: 40_000 },
      ...fallBreak(0, 500, 1),
      { t: 'seen', tick: 450, suspicion: 40_000 },
    ]);
    expect(planClip(r2, play, 'Mochi').crime.prop).toBe(4);
    // a Must-Wreck target beats a plain fragile prop of the same height and tension
    const r3 = fixtureRun([
      ...fallBreak(1, 500, 2),
      { t: 'seen', tick: 450, suspicion: 40_000 },
      ...fallBreak(0, 1200, 2),
      { t: 'seen', tick: 1150, suspicion: 40_000 },
    ]);
    expect(planClip(r3, play, 'Mochi').crime.prop).toBe(0);
  });
  it('the plan carries the run sim version (the clip pass replays on it)', () => {
    const r = { ...fixtureRun([...fallBreak(1, 500)]), simVersion: 5 };
    expect(planClip(r, play, 'Mochi').simVersion).toBe(5);
  });

  it('froze in the cone and got away adds a bonus', () => {
    const r = fixtureRun([...fallBreak(1, 400), { t: 'seen', tick: 360, suspicion: 10_000 }, { t: 'loaf', tick: 365 }]);
    const c = findCandidates(r, play)[0];
    expect(c.froze).toBe(true);
    expect(c.tension).toBe(10 + 25);
  });

  it('ignores falls of props that are neither targets nor fragile', () => {
    const r = fixtureRun([...fallBreak(2, 300, 0), ...fallBreak(3, 500, 1)]);
    expect(findCandidates(r, play)).toHaveLength(0);
  });

  it('no tension: the first Must-Wreck target wins over an earlier fragile prop', () => {
    const r = fixtureRun([...fallBreak(1, 300), ...fallBreak(4, 700, 3), ...fallBreak(0, 900)]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.pick).toBe('default');
    expect(plan.crime.prop).toBe(4);
  });

  it('default with no falls: the first target push, else the cat', () => {
    const pushOnly = fixtureRun([{ t: 'push', tick: 600, prop: 0 }]);
    const a = planClip(pushOnly, play, 'Mochi');
    expect(a.pick).toBe('default');
    expect(a.crime.prop).toBe(0);
    expect(a.hook).toBe('POV: you left Mochi alone for 75 seconds');

    const empty = planClip(fixtureRun([]), play, '');
    expect(empty.crime.prop).toBe(-1);
    expect(empty.pick).toBe('default');
    expect(empty.hook).toBe('POV: you left Tofu alone for 75 seconds');
    expect(clipGates(empty)).toEqual([]);
  });

  it('caught run: the cuddle is the payoff (no slow motion)', () => {
    const r = fixtureRun([...fallBreak(1, 1400), { t: 'seen', tick: 1420, suspicion: 100_000 }, { t: 'caught', tick: 1450 }], {
      stamp: 'caught',
      ticks: 1450 + CUDDLE_TICKS,
    });
    const plan = planClip(r, play, 'Mochi');
    expect(plan.slowMo.speed).toBe(1);
    expect(plan.crime.toTick).toBe(1450 + CUDDLE_TICKS);
    expect(plan.crime.prop).toBe(1);
    expect(plan.matchCutTick).toBe(1450 + CUDDLE_TICKS - GAME_FRAMES);
    expect(plan.hook).toBe('This is what Mochi does when you leave');
    expect(clipGates(plan)).toEqual([]);
  });

  it('URL line names the short URL and the room; FTUE uses 40 s', () => {
    const plan = planClip(fixtureRun([...fallBreak(0, 300)]), play, 'Mochi');
    expect(plan.urlLine).toBe('tokentails.com/badcat · Kitchen #18');
    const glass = fixtureRoom({ room: { ...play.room, id: 'glass', title: undefined }, dayNo: undefined });
    expect(planClip(fixtureRun([]), glass, 'Mochi').urlLine.endsWith('· The Glass')).toBe(true);
    const ftue = fixtureRoom({ mode: 'ftue' });
    expect(planClip(fixtureRun([], { ticks: 1200, stamp: 'clean' }), ftue, 'Mochi').hook).toBe('POV: you left Mochi alone for 40 seconds');
  });
});

describe('clipFrameTick', () => {
  const r = fixtureRun([...fallBreak(0, 1000), { t: 'human', tick: 1004, human: 0, state: 'look' }]);
  const plan = planClip(r, play, 'Mochi');

  it('holds during the opener and the loop tail', () => {
    expect(clipFrameTick(plan, 0)).toBe(plan.matchCutTick);
    expect(clipFrameTick(plan, OPENER_FRAMES - 1)).toBe(plan.matchCutTick);
    expect(clipFrameTick(plan, CLIP_FRAMES - 1)).toBe(plan.matchCutTick);
  });

  it('is monotonic through the game part, slow inside the window, and ends at the crime end', () => {
    let prev = -1;
    let slowSteps = 0;
    for (let f = OPENER_FRAMES; f < LOOP_FROM_FRAME; f++) {
      const t = clipFrameTick(plan, f);
      expect(t).toBeGreaterThanOrEqual(prev);
      if (prev >= 0 && t - prev < 0.5) slowSteps++;
      prev = t;
    }
    expect(slowSteps).toBeGreaterThan(40);
    expect(Math.abs(clipFrameTick(plan, LOOP_FROM_FRAME - 1) - plan.crime.toTick)).toBeLessThanOrEqual(2);
    // The fall starts on screen after the match cut and well before the loop cut.
    const fallFrame = OPENER_FRAMES + (plan.slowMo.fromTick - plan.matchCutTick);
    expect(fallFrame).toBeGreaterThan(OPENER_FRAMES + 90);
    expect(fallFrame).toBeLessThan(LOOP_FROM_FRAME - 60);
  });
});

// Round 3 (virality review): in all four sampled clips the crime itself did not read (the whole room from 3.5 s to
// 8 s, the fall off-frame). The camera is now locked to the cat-plus-target box; the target has to fill the frame.
describe('clip framing: the crime reads (round 3)', () => {
  it('the target box fills >= 15 % of the frame for >= 40 frames, and >= 25 % of its height on every crime-box frame', async () => {
    const { Vector3 } = await import('three');
    const { shotForFrame } = await import('../../render/clip-pass');
    const { clipPose, screenAreaFrac, screenBox, crimeBoxCat } = await import('../../render/clip-camera');
    const r = fixtureRun([...fallBreak(4, 900, 3), { t: 'seen', tick: 870, suspicion: 40_000 }]);
    const plan = planClip(r, play, 'Mochi');
    expect(plan.crime.prop).toBe(4);
    const prop = new Vector3(1.4, 1.1, -1.6); // a vase on a high shelf
    const min = prop.clone().add(new Vector3(-0.15, 0, -0.15));
    const max = prop.clone().add(new Vector3(0.15, 0.3, 0.15));
    // the cat walks in from 3.5 m away and stands one cell from the vase from the fall on
    const catAt = (tick: number): InstanceType<typeof Vector3> => {
      const k = Math.max(0, Math.min(1, (tick - plan.crime.fromTick) / Math.max(1, plan.crime.breakTick - plan.crime.fromTick - 20)));
      const far = new Vector3(-1.6, 0, 1.4);
      const near = prop.clone().add(new Vector3(-0.4, -0.05, 0));
      return far.lerp(near, k);
    };
    let big = 0;
    let boxFrames = 0;
    for (let f = OPENER_FRAMES; f < LOOP_FROM_FRAME; f++) {
      const tick = clipFrameTick(plan, f);
      const shot = shotForFrame(plan, f, tick);
      if (!shot.crimeBox) continue;
      boxFrames++;
      const cat = catAt(tick);
      const pose = clipPose(shot, cat.clone().add(new Vector3(0, 0.2, 0.1)), cat, prop, [], 720 / 1280);
      const frac = screenAreaFrac(pose, min, max, 720 / 1280);
      if (frac >= 0.15) big++;
      // the target is at least a quarter of the frame height on every crime-box frame
      expect(screenBox(pose, min, max, 720 / 1280).h).toBeGreaterThanOrEqual(0.25);
      // the cat never sits more than CRIME_BOX_W from the target in the framed box
      expect(crimeBoxCat(cat, prop).clone().setY(0).distanceTo(prop.clone().setY(0))).toBeLessThanOrEqual(1.6);
    }
    expect(boxFrames).toBeGreaterThan(100);
    expect(big).toBeGreaterThanOrEqual(40);
  });

  it('9–11 s is a 2-shot of the falling object and the human', async () => {
    const { shotForFrame } = await import('../../render/clip-pass');
    const r = fixtureRun([...fallBreak(4, 900, 3)]);
    const plan = planClip(r, play, 'Mochi');
    expect(shotForFrame(plan, 9 * 30, clipFrameTick(plan, 270)).twoShot).toBe(true);
    expect(shotForFrame(plan, 11 * 30 - 1, clipFrameTick(plan, 329)).twoShot).toBe(true);
    expect(shotForFrame(plan, 8 * 30, clipFrameTick(plan, 240)).crimeBox).toBe(true);
  });
});
