// @vitest-environment happy-dom
/**
 * PERF-IOS (docs/plans/moba/PERF-IOS.md): phone detection, the frame pacer, the thermal governor, the phone profile
 * and the per-device preferences (Battery saver, the remembered tier).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { isIosWebKit, isPhoneDevice } from '../../src/render/perf/device';
import { FramePacer, MATCH_FPS, MENU_FPS, PAUSED_FPS, SAVER_FPS, paceTarget } from '../../src/render/perf/pacer';
import { GOV, GOV_MAX, GOV_STEP, ThermalGovernor, type ThermalState } from '../../src/render/perf/governor';
import { autoBatterySaver, batterySaver, resetPerfPrefs, savePerfStep, savedPerfStep, setBatterySaver } from '../../src/render/perf/prefs';
import { parseThermal } from '../../src/render/perf/thermal';
import { rememberTier, rememberedTier, startTier, tierSettings } from '../../src/render/quality';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const IPAD_OS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

describe('phone detection', () => {
  const base = { shell: null, ua: DESKTOP, coarse: false, maxTouchPoints: 0, shortSide: 1080 } as const;
  it('the iOS app shell is a phone, the Mac app never is', () => {
    expect(isPhoneDevice({ ...base, shell: 'ios' })).toBe(true);
    expect(isPhoneDevice({ ...base, shell: 'mac', ua: IPHONE, coarse: true, shortSide: 390 })).toBe(false);
  });
  it('iPhone, iPadOS (a touch "Macintosh") and coarse Android are phones; a desktop is not', () => {
    expect(isPhoneDevice({ ...base, ua: IPHONE })).toBe(true);
    expect(isPhoneDevice({ ...base, ua: IPAD_OS, maxTouchPoints: 5 })).toBe(true);
    expect(isPhoneDevice({ ...base, ua: IPAD_OS, maxTouchPoints: 0 })).toBe(false);
    expect(isPhoneDevice({ ...base, ua: ANDROID, coarse: true })).toBe(true);
    expect(isPhoneDevice(base)).toBe(false);
    expect(isPhoneDevice({ ...base, coarse: true, shortSide: 412 })).toBe(true);
    expect(isPhoneDevice({ ...base, coarse: true, shortSide: 900 })).toBe(false);
  });
  it('iOS WebKit covers the shell, iPhone and iPadOS', () => {
    expect(isIosWebKit({ shell: 'ios', ua: '', maxTouchPoints: 0 })).toBe(true);
    expect(isIosWebKit({ shell: null, ua: IPAD_OS, maxTouchPoints: 5 })).toBe(true);
    expect(isIosWebKit({ shell: null, ua: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });
});

describe('frame pacer', () => {
  it('targets: match 60, Battery saver 30, menus 30, paused or covered 15', () => {
    expect(paceTarget({ inMatch: true, paused: false, covered: false, saver: false })).toBe(MATCH_FPS);
    expect(paceTarget({ inMatch: true, paused: false, covered: false, saver: true })).toBe(SAVER_FPS);
    expect(paceTarget({ inMatch: true, paused: true, covered: false, saver: false })).toBe(PAUSED_FPS);
    expect(paceTarget({ inMatch: false, paused: false, covered: false, saver: false })).toBe(MENU_FPS);
    expect(paceTarget({ inMatch: false, paused: false, covered: true, saver: false })).toBe(PAUSED_FPS);
  });
  const drawn = (hz: number, fps: number, seconds = 2, jitter = 0): number => {
    const p = new FramePacer();
    let n = 0;
    const step = 1000 / hz;
    for (let i = 0; i < hz * seconds; i++) if (p.due(i * step + (i % 2 ? jitter : -jitter), fps)) n++;
    return n / seconds;
  };
  it('a 60 Hz display keeps 60 at a 60 target, even with jitter', () => {
    expect(drawn(60, 60)).toBe(60);
    expect(drawn(60, 60, 2, 1.2)).toBe(60);
  });
  it('a 120 Hz display is capped to 60; 60 Hz → 30 and 15 exactly', () => {
    expect(drawn(120, 60)).toBe(60);
    expect(drawn(60, 30)).toBe(30);
    expect(drawn(60, 30, 2, 1)).toBe(30);
    expect(drawn(60, 15)).toBe(15);
  });
  it('an uncapped 600 Hz loop draws only the target', () => {
    expect(drawn(600, 60)).toBeLessThanOrEqual(61);
    expect(drawn(600, 30)).toBeLessThanOrEqual(31);
  });
});

/** Run the governor for `seconds` at a frame interval / JS time; returns the steps it went through. */
function run(g: ThermalGovernor, at: { t: number }, seconds: number, frameMs: number, workMs: number, targetMs = 1000 / 60, thermal: ThermalState | null = null): number[] {
  const steps: number[] = [];
  const end = at.t + seconds * 1000;
  while (at.t < end) {
    at.t += frameMs;
    const r = g.sample({ frameMs, workMs, targetMs, now: at.t, thermal });
    if (r !== null) steps.push(r);
  }
  return steps;
}

describe('thermal governor', () => {
  it('a smooth 60 fps match never steps', () => {
    const g = new ThermalGovernor();
    expect(run(g, { t: 0 }, 120, 16.7, 4)).toEqual([]);
    expect(g.step).toBe(0);
  });
  it('steps down one at a time on late frames, cheapest first, down to the 30 fps step', () => {
    const g = new ThermalGovernor();
    const at = { t: 0 };
    const s = run(g, at, 3 * 4 + 1, 22, 4);
    expect(s).toEqual([1, 2, 3, 4]);
    expect(g.step).toBe(GOV_STEP.fps30);
    expect(g.throttled()).toBe(true);
    expect(g.lastReason).toMatch(/late frames/);
  });
  it('steps down on JS time alone (busy main thread)', () => {
    const g = new ThermalGovernor();
    expect(run(g, { t: 0 }, 3.5, 16.7, 10)).toEqual([1]);
    expect(g.lastReason).toMatch(/busy/);
  });
  it('never steps past the last step', () => {
    const g = new ThermalGovernor(GOV_MAX);
    expect(run(g, { t: 0 }, 30, 40, 4)).toEqual([]);
    expect(g.step).toBe(GOV_MAX);
  });
  it('hysteresis: up one step only after 45 s clean and a minute since the last change, no bouncing', () => {
    const g = new ThermalGovernor();
    const at = { t: 0 };
    run(g, at, 6.5, 22, 4);
    expect(g.step).toBe(2);
    run(g, at, 1, 1000, 0); // a stall: the half-filled window is dropped
    // 30 s clean: not yet (45 s clean needed)
    expect(run(g, at, 30, 16.7, 3)).toEqual([]);
    // to ~55 s clean and > 60 s since the change: one step up
    expect(run(g, at, 32, 16.7, 3)).toEqual([1]);
    // and not the next one right away: another minute at least
    expect(run(g, at, 40, 16.7, 3)).toEqual([]);
    expect(run(g, at, 30, 16.7, 3)).toEqual([0]);
  });
  it('a borderline window (not bad, not clean) holds the step and restarts the clean clock', () => {
    const g = new ThermalGovernor(2);
    const at = { t: 0 };
    // 5% late frames: under the 10% down line, over the 3% clean line
    let steps: number[] = [];
    const end = at.t + 120_000;
    let i = 0;
    while (at.t < end) {
      const f = i++ % 20 === 0 ? 20 : 16.7;
      at.t += f;
      const r = g.sample({ frameMs: f, workMs: 3, targetMs: 1000 / 60, now: at.t });
      if (r !== null) steps = [...steps, r];
    }
    expect(steps).toEqual([]);
    expect(g.step).toBe(2);
  });
  it('the 30 fps target judges late frames against 33 ms', () => {
    const g = new ThermalGovernor(GOV_STEP.fps30);
    const at = { t: 0 };
    expect(run(g, at, 30, 33.4, 6, 1000 / 30)).toEqual([]);
    expect(run(g, at, 4, 45, 6, 1000 / 30)).toEqual([GOV_STEP.res85]);
  });
  it('ignores stalls over 250 ms (tab switch, shader compile)', () => {
    const g = new ThermalGovernor();
    const at = { t: 0 };
    for (let i = 0; i < 20; i++) {
      at.t += 900;
      expect(g.sample({ frameMs: 900, workMs: 2, targetMs: 16.7, now: at.t })).toBeNull();
    }
    expect(g.step).toBe(0);
  });
  it('iOS serious steps down at once and sets a floor it never climbs above; critical goes to 30 fps', () => {
    const g = new ThermalGovernor();
    const at = { t: 0 };
    expect(run(g, at, 1, 16.7, 3, 1000 / 60, 'serious')).toEqual([1]);
    expect(g.floor).toBe(1);
    expect(g.throttled('serious')).toBe(true);
    // cool and clean for 3 minutes: never above the floor
    expect(run(g, at, 180, 16.7, 3, 1000 / 60, 'nominal')).toEqual([]);
    expect(g.step).toBe(1);
    const c = new ThermalGovernor();
    expect(run(c, { t: 0 }, 1, 16.7, 3, 1000 / 60, 'critical')).toEqual([GOV_STEP.fps30]);
  });
  it('a serious state keeps stepping down every DOWN_GAP_MS', () => {
    const g = new ThermalGovernor();
    const s = run(g, { t: 0 }, (GOV.DOWN_GAP_MS * 2.5) / 1000, 16.7, 3, 1000 / 60, 'serious');
    expect(s).toEqual([1, 2, 3]);
  });
});

describe('phone profile and governor steps (tierSettings)', () => {
  it('desktop tiers are unchanged', () => {
    expect(tierSettings('med')).toMatchObject({ shadows: true, shadowMap: 1024, shadowEvery: 1, outlineScope: 'all', forestHalf: false, vfxTier: 'med', overheadDpr: 2, fpsCap: 60, resScale: 1 });
    expect(tierSettings('high').shadowMap).toBe(2048);
    expect(tierSettings('low')).toMatchObject({ maxDpr: 1.25, shadows: false, outlines: false, outlineScope: 'none' });
  });
  it('a phone on Medium: 512² shadows every second frame, own + enemy outlines, half forest, Low particles, overlay 1.5×, minimap 15 Hz', () => {
    expect(tierSettings('med', { phone: true })).toMatchObject({
      tier: 'med',
      shadows: true,
      shadowMap: 512,
      shadowEvery: 2,
      outlineScope: 'key',
      forestHalf: true,
      vfxTier: 'low',
      overheadDpr: 1.5,
      minimapHz: 15,
      maxDpr: 1.25,
      bloom: false,
    });
  });
  it('a phone on Low keeps the own hero outlined (readability floor)', () => {
    expect(tierSettings('low', { phone: true })).toMatchObject({ outlineScope: 'own', outlines: true });
  });
  it('steps: shadows → overlay and minimap → Low → 30 fps → resolution', () => {
    const at = (step: number) => tierSettings('med', { phone: true, step });
    expect(at(1)).toMatchObject({ shadows: false, forestHalf: true, overheadDpr: 1.5 });
    expect(at(2)).toMatchObject({ shadows: false, overheadDpr: 1.25, minimapHz: 10, vfxTier: 'low', tier: 'med' });
    expect(at(3)).toMatchObject({ tier: 'low', outlineScope: 'own', fpsCap: 60 });
    expect(at(4)).toMatchObject({ tier: 'low', fpsCap: 30, resScale: 1 });
    expect(at(5).resScale).toBe(0.85);
    expect(at(6).resScale).toBe(0.7);
    // a desktop forced to Low by the governor keeps its own hero's outline too
    expect(tierSettings('high', { step: 3 })).toMatchObject({ tier: 'low', outlineScope: 'own' });
  });
});

describe('per-device preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    resetPerfPrefs();
  });
  it('the tier is remembered in localStorage (survives a relaunch), with who chose it', () => {
    expect(rememberedTier()).toBeNull();
    expect(startTier('').probe).not.toBeNull();
    rememberTier('low', 'user');
    expect(rememberedTier()).toEqual({ tier: 'low', by: 'user' });
    expect(startTier('')).toMatchObject({ tier: 'low', probe: null });
    expect(startTier('?quality=high')).toMatchObject({ tier: 'high', probe: null });
  });
  it('Battery saver: off by default, turned on by the game once, never over a player choice', () => {
    expect(batterySaver()).toEqual({ on: false, by: 'default' });
    expect(autoBatterySaver()).toBe(true);
    expect(batterySaver()).toEqual({ on: true, by: 'auto' });
    expect(autoBatterySaver()).toBe(false);
    setBatterySaver(false);
    expect(autoBatterySaver()).toBe(false);
    expect(batterySaver().on).toBe(false);
    resetPerfPrefs();
    expect(batterySaver()).toEqual({ on: false, by: 'user' });
  });
  it('the governor step is kept between launches', () => {
    expect(savedPerfStep()).toBe(0);
    savePerfStep(4);
    expect(savedPerfStep()).toBe(4);
  });
  it('the shell thermal value parses defensively', () => {
    expect(parseThermal({ state: 'serious', lowPower: true })).toEqual({ state: 'serious', lowPower: true });
    expect(parseThermal({ state: 'hot' })).toEqual({ state: null, lowPower: false });
    expect(parseThermal(undefined)).toEqual({ state: null, lowPower: false });
  });
});
