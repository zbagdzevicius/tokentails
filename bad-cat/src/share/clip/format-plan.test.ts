import { describe, expect, it } from 'vitest';
import type { ShareFormat } from '../../types';
import { fallBreak, fixtureRoom, fixtureRun } from '../test-fixtures';
import {
  HOUSEHOLD_FRAMES,
  ROOMBA_FRAMES,
  householdCaption,
  householdOutFrame,
  householdTimeline,
  householdVerdict,
  normalizeHandle,
  planFormatClip,
  planHousehold,
  planHouseholdPass,
} from './format-plan';
import { clipGates, layoutFor, rectInside, safeBox } from './gates';
import { clipFrameTick, gameFramesOf, loopFromFrame, planEndTick, planFrames, planSize, urlFromFrame } from './highlights';
import { cueForPass, jobFrameOrder, singleJob, gifWindow, cueOffsets } from './pipeline';
import { DEFAULT_CAT } from '../../types';

const play = fixtureRoom();
const run = fixtureRun([...fallBreak(0, 900), ...fallBreak(4, 1500), { t: 'framed', tick: 1700, prop: 1 }, { t: 'human', tick: 1710, human: 0, state: 'look' }], { framed: 1 });
const run2 = fixtureRun([...fallBreak(4, 600)], { score: 9100 });
const ALL: ShareFormat[] = ['pov', 'stitch', 'reply', 'irl_vs_game', 'roomba', 'carousel', 'still_waiting'];

describe('format plans', () => {
  it('every one-cat format passes every clip gate', () => {
    for (const f of ALL) {
      const plan = planFormatClip(run, play, 'Mochi', { format: f, handle: '@luna.mom', shortUrl: 'tokentails.com/badcat' });
      expect(clipGates(plan), f).toEqual([]);
    }
  });

  it('every caption style keeps the gates green', () => {
    for (let s = 0; s <= 4; s++) expect(clipGates(planFormatClip(run, play, 'Mochi', { format: 'stitch', handle: 'x', captionStyle: s }))).toEqual([]);
  });

  it('household plan passes the gates (card first and last)', () => {
    const plan = planHousehold({ run, name: 'Mochi' }, { run: run2, name: 'Luna' }, play);
    expect(plan.frames).toBe(360);
    expect(plan.hook).toBe("Mochi vs Luna: who's worse?");
    const l = layoutFor(plan);
    expect(l.firstFraming).toBe('card');
    expect(l.lastFraming).toBe('card');
    expect(clipGates(plan)).toEqual([]);
  });

  it('stitch and reply carry the handle pill in the top third from 2 s', () => {
    const s = planFormatClip(run, play, 'Mochi', { format: 'stitch', handle: '@Luna.Mom!!' });
    expect(s.hook).toBe("I put @Luna.Mom's cat in my game");
    expect(s.overlay).toBe('@Luna.Mom');
    const r = planFormatClip(run, play, 'Mochi', { format: 'reply', handle: 'luna_mom' });
    expect(r.overlay).toBe('Replying to @luna_mom');
    expect(r.hook).toBe('I put Mochi in the game');
    const l = layoutFor(s);
    expect(l.overlay.fromFrame).toBe(60);
    expect(l.overlay.rect.y + l.overlay.rect.h).toBeLessThanOrEqual(1280 / 3);
  });

  it('roomba: 180 frames around the frame-up, URL in the last 2 s, loop tail in the last 1 s', () => {
    const p = planFormatClip(run, play, 'Mochi', { format: 'roomba' });
    expect(planFrames(p)).toBe(ROOMBA_FRAMES);
    expect(p.hook).toBe('Framed the Roomba. Again.');
    expect(p.crime.breakTick).toBe(1700);
    expect(p.crime.lookTick).toBe(1710);
    expect(urlFromFrame(p)).toBe(120);
    expect(loopFromFrame(p)).toBe(150);
    expect(gameFramesOf(p)).toBe(90);
    // 1x mapping: the frame-up shows inside the game part
    const f = Array.from({ length: 180 }, (_, i) => clipFrameTick(p, i));
    expect(f[59]).toBe(p.matchCutTick);
    expect(f[60]).toBe(p.matchCutTick);
    expect(f[149]).toBe(p.matchCutTick + 89);
    expect(f[150]).toBe(p.matchCutTick);
    expect(f.slice(60, 150).some((t) => t === 1700)).toBe(true);
    expect(planEndTick(p)).toBe(p.matchCutTick + 89);
  });

  it('roomba without a frame-up still makes a 6 s plan', () => {
    const p = planFormatClip(fixtureRun([...fallBreak(0, 900)]), play, 'Mochi', { format: 'roomba' });
    expect(planFrames(p)).toBe(180);
    expect(clipGates(p)).toEqual([]);
  });

  it('irl_vs_game is a 720 x 640 top half with its own safe box', () => {
    const p = planFormatClip(run, play, 'Mochi', { format: 'irl_vs_game' });
    expect(planSize(p)).toEqual({ w: 720, h: 640 });
    expect(p.opener).toBeUndefined();
    const l = layoutFor(p);
    expect(l.height).toBe(640);
    expect(l.safe!.y).toBe(safeBox(720, 1280).y);
    expect(rectInside(l.watermark.rect, l.safe!)).toBe(true);
    expect(rectInside(l.urlLine.rect, { x: 0, y: 0, w: 720, h: 640 })).toBe(true);
    expect(l.loopToFirst).toBe(true);
    // the 360-frame mapping is unchanged by the size
    const pov = planFormatClip(run, play, 'Mochi');
    for (const i of [0, 59, 60, 200, 329, 330, 359]) expect(clipFrameTick(p, i)).toBe(clipFrameTick(pov, i));
  });

  it('still_waiting ends on the end line, not the URL line; the URL stays in the watermark', () => {
    const p = planFormatClip(run, play, 'Mila', { format: 'still_waiting' });
    expect(p.endLine).toBe('Mila is still waiting');
    expect(p.hook).toBe('Mila wrecked the Kitchen');
    const h = planFormatClip(run, play, 'Mila', { format: 'still_waiting', adopted: true });
    expect(h.endLine).toBe('Mila went home. Her crimes stay in the game.');
    expect(clipGates({ ...p, endLine: '  ' })).toContain('end_line_empty');
  });

  it('gates flag a pill below the top third and an end line with "link in bio"', () => {
    const s = planFormatClip(run, play, 'Mochi', { format: 'stitch', handle: 'x' });
    const l = layoutFor(s);
    expect(clipGates(s, { ...l, overlay: { ...l.overlay, rect: { ...l.overlay.rect, y: 500 } } })).toContain('overlay_not_top_third');
    expect(clipGates({ ...s, endLine: 'link in bio' })).toContain('link_in_bio');
  });

  it('normalizes handles', () => {
    expect(normalizeHandle('@@luna.mom ')).toBe('luna.mom');
    expect(normalizeHandle('a b/c')).toBe('abc');
    expect(normalizeHandle('x'.repeat(40))).toHaveLength(24);
    expect(normalizeHandle(undefined)).toBe('');
  });
});

describe('household timeline', () => {
  it('title 1 s, two 5 s crimes, scores 1 s = 360 frames, each frame once', () => {
    const t = householdTimeline();
    expect(t.map((s) => [s.kind, s.from, s.to])).toEqual([
      ['title', 0, 29],
      ['cat', 30, 179],
      ['cat', 180, 329],
      ['scores', 330, 359],
    ]);
    expect(HOUSEHOLD_FRAMES).toBe(360);
    expect(householdOutFrame(0, 30)).toBe(30);
    expect(householdOutFrame(0, 179)).toBe(179);
    expect(householdOutFrame(1, 60)).toBe(210);
    expect(householdOutFrame(1, 10)).toBe(-1);
  });

  it('each pass is a 180-frame plan with a 1x/0.5x game part', () => {
    const p = planHouseholdPass(run, play, 'Mochi');
    expect(planFrames(p)).toBe(180);
    expect(p.format).toBe('household');
    expect(p.slowMo.speed).toBeLessThanOrEqual(1);
  });

  it('captions: title, suspects, verdict, URL in the last 2 s', () => {
    const plan = planHousehold({ run, name: 'Mochi' }, { run: run2, name: 'Luna' }, play);
    const a = { name: 'Mochi', score: 8420 };
    const b = { name: 'Luna', score: 9100 };
    expect(householdCaption(0, a, b, plan)).toBe("Mochi vs Luna: who's worse?");
    expect(householdCaption(40, a, b, plan)).toBe('Suspect 1: Mochi');
    expect(householdCaption(200, a, b, plan)).toBe('Suspect 2: Luna');
    expect(householdCaption(300, a, b, plan)).toBe(plan.urlLine);
    expect(householdVerdict(a, b)).toBe('Luna is worse 😼');
    expect(householdVerdict(a, { name: '', score: 8420 })).toBe('Tie. Both are menaces.');
  });

  it('audio cues land at clip 2.0 s and 7.0 s', () => {
    const pa = planHouseholdPass(run, play, 'Mochi');
    const t = householdTimeline();
    const ca = cueForPass(pa, run.events, t[1].from, 30);
    const cb = cueForPass(pa, run.events, t[2].from, 30);
    expect(ca.atSec).toBeCloseTo(2);
    expect(cb.atSec).toBeCloseTo(7);
    expect(ca.maxSec).toBeCloseTo(3);
    const o = cueOffsets([ca, cb], 48000);
    expect(o.start).toBeCloseTo(2);
    expect(o.offsets).toEqual([0, 240000]);
  });
});

describe('pipeline frame mapping', () => {
  it('a single-pass job writes every frame once, in order (360, 180 and 720 x 640 plans)', () => {
    for (const f of ['pov', 'roomba', 'irl_vs_game'] as const) {
      const plan = planFormatClip(run, play, 'Mochi', { format: f });
      const job = singleJob(plan, DEFAULT_CAT, run.inputs, run.events);
      const n = planFrames(plan);
      expect(job.totalFrames).toBe(n);
      expect(jobFrameOrder(job)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(job.size).toEqual(planSize(plan));
      expect(job.cues[0].atSec).toBeCloseTo(2);
    }
  });

  it('the GIF window is 30 frames of the slow-motion crash inside the game part', () => {
    const plan = planFormatClip(run, play, 'Mochi');
    const w = gifWindow(plan);
    expect(w.frames).toHaveLength(30);
    expect(w.frames[0]).toBeGreaterThanOrEqual(60);
    expect(w.frames[w.frames.length - 1]).toBeLessThan(330);
    expect(w.frames[1] - w.frames[0]).toBe(2);
    expect(clipFrameTick(plan, w.freeze)).toBeGreaterThanOrEqual(plan.crime.breakTick);
    const r = gifWindow(planFormatClip(run, play, 'Mochi', { format: 'roomba' }));
    expect(r.frames.every((f) => f >= 60 && f < 150)).toBe(true);
  });
});
