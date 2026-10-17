import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, HumanSt, NOISE, NO_INPUT, ROOM_EVENT_NAMES, SIM_VERSION, type GhostRef, type SimEvent, type SimState } from '../../types';
import { sim } from '../../sim';
import { makeBossRoom, makeRoom } from '../../sim/fixtures';
import { eventBannerText, EVENT_TAGLINES, HUD_COPY, pronounOf, stackNoun } from './copy-hud';
import { createGhostLanes, ghostChip, ghostRules, stepGhostLanes } from './ghosts';
import { eyeAnchor, eyeVisible, EYE_LIFT, EYE_MIN_Y, humanPip, noisePct, noiseView, NOISE_PULSE_PCT, suspicionPct, watchedHuman } from './meters';
import { crimePopFor, crimePops, hapticFor, HAPTIC, MAX_POPS_PER_FRAME, POP_PRIO, popTilt, type PopCtx } from './popups';

const ctx: PopCtx = { kindOf: (i) => (i === 7 ? 3 : i === 8 ? 15 : -1), accompliceName: 'Mila', pronoun: 'she' };
const st = (over: Record<string, unknown> = {}): SimState =>
  ({ tick: 100, humans: [{ state: HumanSt.BUSY, x: 0, z: 0 }], suspicion: 0, noise: 0, napper: -1, ...over }) as unknown as SimState;

describe('crime stickers (pure)', () => {
  const cases: [SimEvent, string, string][] = [
    [{ t: 'framed', tick: 1, prop: 2 }, 'FRAMED THE ROOMBA +300', 'framed'],
    [{ t: 'slide', tick: 1, fromX: 1, fromZ: 1, x: 2, z: 1 }, 'WHEEE', 'slide'],
    [{ t: 'pull', tick: 1, prop: 3, dir: 0, kind: 'cloth', moved: 2 }, 'YANK!', 'pull'],
    [{ t: 'pull', tick: 1, prop: 3, dir: 0, kind: 'cable', moved: 1 }, 'YANK!', 'pull'],
    [{ t: 'topple', tick: 1, prop: 4, cells: 4, dir: 2 }, 'TIMBER!', 'topple'],
    [{ t: 'stack', tick: 1, prop: 7, items: 4, points: 320 }, 'x4 PLATES!', 'stack'],
    [{ t: 'stack', tick: 1, prop: 8, items: 5, points: 200 }, 'x5 BOOKS!', 'stack'],
    [{ t: 'wish', tick: 1 }, 'Mila is thrilled +500', 'wish'],
    [{ t: 'enter', tick: 1, prop: 5 }, 'If I fits, I sits', 'box'],
    [{ t: 'break', tick: 1, prop: 5, points: 300, combo: 1, cam: true }, '+50% ON CAMERA', 'cam'],
    [{ t: 'wake', tick: 1, human: 0 }, "SHE'S AWAKE!", 'wake'],
    [{ t: 'target', tick: 1, prop: 1 }, '🎯 MUST-WRECK +1,000', 'target'],
    [{ t: 'stash', tick: 1, prop: 1 }, '🛏️ STASHED +500', 'stash'],
  ];
  it.each(cases)('%j → %s', (e, text, kind) => {
    const p = crimePopFor(e, ctx)!;
    expect(p.text).toBe(text);
    expect(p.kind).toBe(kind);
    expect(p.prio).toBe(POP_PRIO[p.kind]);
    expect(Math.abs(p.tilt)).toBeLessThanOrEqual(6);
  });
  it('no sticker for plain events or an off-camera crash', () => {
    expect(crimePopFor({ t: 'break', tick: 1, prop: 1, points: 300, combo: 1 }, ctx)).toBeNull();
    expect(crimePopFor({ t: 'step', tick: 1, level: 0, speed: 1 }, ctx)).toBeNull();
    expect(crimePopFor({ t: 'puddle', tick: 1, x: 0, z: 0, kind: 1 }, ctx)).toBeNull();
    expect(crimePopFor({ t: 'break', tick: 1, prop: 1, points: 0, combo: 1, cam: true }, ctx)).toBeNull();
  });
  it('anchors: props at the prop, slide at its cell, wake at the human, wish under the score', () => {
    expect(crimePopFor({ t: 'topple', tick: 1, prop: 4, cells: 4, dir: 2 }, ctx)!.anchor).toEqual({ at: 'prop', prop: 4 });
    expect(crimePopFor({ t: 'slide', tick: 1, fromX: 1, fromZ: 1, x: 2, z: 3 }, ctx)!.anchor).toEqual({ at: 'cell', x: 2, z: 3, level: 0 });
    expect(crimePopFor({ t: 'wake', tick: 1, human: 1 }, ctx)!.anchor).toEqual({ at: 'human', human: 1 });
    expect(crimePopFor({ t: 'wish', tick: 1 }, ctx)!.anchor).toEqual({ at: 'under' });
  });
  it('priority: rarest first, capped per frame, one per kind and anchor', () => {
    const evs: SimEvent[] = [
      { t: 'slide', tick: 5, fromX: 1, fromZ: 1, x: 2, z: 1 },
      { t: 'enter', tick: 5, prop: 5 },
      { t: 'pull', tick: 5, prop: 3, dir: 0, kind: 'cloth', moved: 1 },
      { t: 'wish', tick: 5 },
      { t: 'topple', tick: 5, prop: 4, cells: 4, dir: 2 },
      { t: 'topple', tick: 5, prop: 4, cells: 4, dir: 2 },
    ];
    const out = crimePops(evs, ctx);
    expect(out.map((p) => p.kind)).toEqual(['wish', 'topple', 'pull']);
    expect(out.length).toBe(MAX_POPS_PER_FRAME);
    expect(POP_PRIO.wish).toBeGreaterThan(POP_PRIO.framed);
    expect(POP_PRIO.framed).toBeGreaterThan(POP_PRIO.slide);
    expect(crimePops(evs, ctx, 10).length).toBe(5);
  });
  it('tilt is deterministic', () => {
    expect(popTilt(120, 3)).toBe(popTilt(120, 3));
    for (let t = 0; t < 50; t++) expect(Math.abs(popTilt(t, 7))).toBeLessThanOrEqual(6);
  });
  it('wish without a name still reads', () => {
    expect(crimePopFor({ t: 'wish', tick: 1 }, { ...ctx, accompliceName: '' })!.text).toBe('Your accomplice is thrilled +500');
  });
});

describe('haptics', () => {
  it('light for slide/pull, strong for topple, medium for crashes, none for steps', () => {
    expect(hapticFor({ t: 'slide', tick: 1, fromX: 1, fromZ: 1, x: 2, z: 1 })).toBe(HAPTIC.light);
    expect(hapticFor({ t: 'pull', tick: 1, prop: 3, dir: 0, kind: 'cable', moved: 1 })).toBe(HAPTIC.light);
    expect(hapticFor({ t: 'topple', tick: 1, prop: 4, cells: 4, dir: 2 })).toBe(HAPTIC.strong);
    expect(hapticFor({ t: 'break', tick: 1, prop: 1, points: 1, combo: 1 })).toBe(HAPTIC.medium);
    expect(hapticFor({ t: 'swat', tick: 1, prop: 1 })).toBe(12);
    expect(hapticFor({ t: 'step', tick: 1, level: 0, speed: 1 })).toBe(0);
    expect(HAPTIC.strong).toBeGreaterThan(HAPTIC.medium);
  });
});

describe('event banners: all 12 room events', () => {
  it('title "NAME n seconds", sub "NAME tagline"', () => {
    expect(ROOM_EVENT_NAMES.length).toBe(12);
    expect(EVENT_TAGLINES.length).toBe(12);
    expect(eventBannerText(5, 180).title).toBe('SURPRISE! 6 seconds');
    expect(eventBannerText(6, 31, 'he').sub).toBe("ALARM! he's not snoozing it");
    expect(eventBannerText(6, 31, 'he').tag).toBe("he's not snoozing it");
    expect(eventBannerText(6, 30, 'she').title).toBe('ALARM! 1 second');
    expect(eventBannerText(11, 90, 'she').sub).toBe("YOU'RE ON MUTE! she's unmuting");
    for (let k = 0; k < 12; k++) {
      const b = eventBannerText(k, 60, 'she');
      expect(b.title.startsWith(ROOM_EVENT_NAMES[k])).toBe(true);
      expect(b.sub).not.toContain('{p}');
    }
    expect(eventBannerText(99, 60).title.startsWith('DELIVERY!')).toBe(true);
  });
  it('pronouns and stack nouns', () => {
    expect(pronounOf({ name: 'Skincare Sis', persona: 'skincare-sis' })).toBe('she');
    expect(pronounOf({ name: 'Napper', kind: 'napper' })).toBe('she');
    expect(pronounOf({ name: 'Chef Dad', persona: 'chef-dad' })).toBe('he');
    expect(HUD_COPY.mirror('she')).toContain('she can see you in the mirror');
    expect(stackNoun('Cups tower')).toBe('CUPS');
    expect(stackNoun('Champagne tower')).toBe('GLASSES');
    expect(stackNoun('Mystery')).toBe('PIECES');
  });
});

describe('noise meter and eye (pure)', () => {
  it('maps NOISE.max to 100 % and clamps', () => {
    expect(noisePct(NOISE.max)).toBe(100);
    expect(noisePct(0)).toBe(0);
    expect(noisePct(NOISE.max / 2)).toBe(50);
    expect(noisePct(NOISE.max * 3)).toBe(100);
    expect(noisePct(-5)).toBe(0);
    expect(noisePct(undefined)).toBe(0);
    expect(suspicionPct(100_000)).toBe(100);
  });
  it('Zzz bar while the napper sleeps; pulse and warn at 75 %; frozen during the event; gone when she looks', () => {
    const nap = (state: number, noise: number) => st({ napper: 0, noise, humans: [{ state, x: 0, z: 0 }] });
    expect(noiseView(st())).toBeNull();
    expect(noiseView(nap(HumanSt.NAP, 10_000))).toMatchObject({ pct: 10, pulse: false, warn: false, frozen: false });
    expect(noiseView(nap(HumanSt.NAP, (NOISE.max * NOISE_PULSE_PCT) / 100))).toMatchObject({ pulse: true, warn: true });
    expect(noiseView(nap(HumanSt.TELEGRAPH, NOISE.max))).toMatchObject({ warn: true });
    expect(noiseView(nap(HumanSt.EVENT, 30_000))).toMatchObject({ frozen: true });
    expect(noiseView(nap(HumanSt.LOOK, NOISE.max))).toBeNull();
    expect(eyeVisible(nap(HumanSt.NAP, 0))).toBe(false);
    expect(eyeVisible(nap(HumanSt.LOOK, 0))).toBe(true);
    expect(eyeVisible(st())).toBe(true);
  });
  it('real sim: a napper room starts asleep with the Zzz bar at 0 and no eye', () => {
    const play = makeBossRoom({ napper: true });
    const s = sim.initSim(play, DEFAULT_CAT);
    expect(noiseView(s)).toMatchObject({ pct: 0, human: s.napper });
    expect(eyeVisible(s)).toBe(false);
  });
  it('watched human: LOOK beats TELEGRAPH beats BUSY; pips', () => {
    const two = (a: number, b: number) => st({ humans: [{ state: a }, { state: b }] });
    expect(watchedHuman(two(HumanSt.BUSY, HumanSt.LOOK))).toBe(1);
    expect(watchedHuman(two(HumanSt.TELEGRAPH, HumanSt.LOOK))).toBe(1);
    expect(watchedHuman(two(HumanSt.TELEGRAPH, HumanSt.BUSY))).toBe(0);
    expect(watchedHuman(two(HumanSt.BUSY, HumanSt.BUSY))).toBe(0);
    expect([HumanSt.TELEGRAPH, HumanSt.LOOK, HumanSt.NAP, HumanSt.BUSY].map(humanPip)).toEqual(['?', '!', 'z', '']);
  });
  it('projectWorld fallback: the eye floats above an on-screen head, else the corner (null)', () => {
    expect(eyeAnchor(null)).toBeNull();
    expect(eyeAnchor(undefined)).toBeNull();
    expect(eyeAnchor({ x: 0.5, y: 0.5, onScreen: false })).toBeNull();
    expect(eyeAnchor({ x: Number.NaN, y: 0.5, onScreen: true })).toBeNull();
    expect(eyeAnchor({ x: 1.4, y: 0.5, onScreen: true })).toBeNull();
    expect(eyeAnchor({ x: 0.5, y: 0.5, onScreen: true })).toEqual({ x: 0.5, y: 0.5 - EYE_LIFT });
    expect(eyeAnchor({ x: 0.02, y: 0.05 })!.y).toBe(EYE_MIN_Y);
    expect(eyeAnchor({ x: 0.02, y: 0.05 })!.x).toBe(0.1);
  });
});

describe('ghost race', () => {
  const inputs = Array.from({ length: 400 }, (_, i) => ({ dir: (i % 90 < 40 ? 3 : 0) as never, speed: 1 as never, buttons: i % 23 === 0 ? 1 : 0 }));
  it('a v4 ghost steps under rules 4 and is replay only; a v5 ghost races', () => {
    const play = makeRoom();
    const refs: GhostRef[] = [
      { inputs, cat: { ...DEFAULT_CAT, name: 'Oldie' }, name: 'Oldie', simVersion: 4, replayOnly: true },
      { inputs, cat: { ...DEFAULT_CAT, name: 'Mochi' }, name: 'Mochi', simVersion: SIM_VERSION },
    ];
    expect(ghostRules(refs[0])).toEqual({ simVersion: 4, replayOnly: true });
    expect(ghostRules({ inputs, cat: DEFAULT_CAT, simVersion: 4 })).toEqual({ simVersion: 4, replayOnly: true });
    expect(ghostRules({ inputs, cat: DEFAULT_CAT })).toEqual({ simVersion: SIM_VERSION, replayOnly: false });
    const lanes = createGhostLanes(sim, play, refs);
    expect(lanes.map((l) => l.state.rules)).toEqual([4, SIM_VERSION]);
    expect(lanes.map((l) => l.replayOnly)).toEqual([true, false]);
    for (let t = 0; t < 400; t++) stepGhostLanes(sim, play, lanes);
    // lockstep replay equals the offline replay under the same rule set
    const off = sim.initSim(play, refs[0].cat, { simVersion: 4 });
    for (let t = 0; t < 400; t++) sim.stepSim(off, play, inputs[off.tick] ?? NO_INPUT, []);
    expect(lanes[0].state.tick).toBe(400);
    expect(sim.hashState(lanes[0].state)).toBe(sim.hashState(off));
    expect(lanes[0].state.score).toBe(off.score);
    const chipOld = ghostChip(lanes[0], 1e9);
    expect(chipOld.tag).toBe('replay only (older version)');
    expect(chipOld.lead).toBeNull();
    const chipNew = ghostChip(lanes[1], -1);
    expect(chipNew.tag).toBe('');
    expect(chipNew.lead).toBe('behind');
    expect(chipNew.label.startsWith('Mochi ')).toBe(true);
  });
  it('a broken ghost is skipped, the others still race', () => {
    const play = makeRoom();
    const lanes = createGhostLanes(sim, play, [
      { inputs, cat: DEFAULT_CAT, name: 'Broken', simVersion: 2 },
      { inputs, cat: DEFAULT_CAT, name: 'Fine' },
    ]);
    expect(lanes.map((l) => l.name)).toEqual(['Fine']);
  });
  it('chip label "Mochi 4,210"', () => {
    const c = ghostChip({ name: 'Mochi', replayOnly: false, state: { ended: 0, score: 4210, finalScore: 0 } as unknown as SimState }, 5000);
    expect(c.label).toBe('Mochi 4,210');
    expect(c.lead).toBe('ahead');
    const done = ghostChip({ name: 'A very long cat name', replayOnly: false, state: { ended: 1, score: 1, finalScore: 900 } as unknown as SimState }, 900);
    expect(done.score).toBe(900);
    expect(done.lead).toBe('tie');
    expect(done.done).toBe(true);
    expect(done.name.length).toBeLessThanOrEqual(12);
  });
});

describe('sticker placement', () => {
  it('a long sticker near the edge slides inward; unmeasured keeps the 8..92 % band', async () => {
    const { clampX } = await import('./pool');
    expect(clampX(0.02, 0, 0)).toBe(0.08);
    expect(clampX(0.99, 0, 0)).toBe(0.92);
    expect(clampX(0.1, 270, 390)).toBeCloseTo((135 + 8) / 390);
    expect(clampX(0.9, 270, 390)).toBeCloseTo(1 - (135 + 8) / 390);
    expect(clampX(0.3, 500, 390)).toBe(0.5);
    expect(clampX(0.5, 100, 390)).toBe(0.5);
  });
});
