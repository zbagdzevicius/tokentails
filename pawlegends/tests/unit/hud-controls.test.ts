// @vitest-environment happy-dom
/**
 * Gaps round 3 (hud-controls): the HUD layout editor's rules (input/touch/hudLayout.ts), the editor itself
 * (ui/hudEditor.ts), the per-ability cast mode and aim sensitivity (input/presets.ts), the frame-rate choice
 * (render/perf/prefs.ts, pacer.ts) and the account sync of all of it (meta/progressCloud.ts, backend sanitizer).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultLayout,
  deviceClass,
  fromStored,
  gapBetween,
  HUD_CTLS,
  HUD_EVENT,
  HUD_KEY,
  hudStoreTouched,
  loadHudStore,
  parseStore,
  problemOf,
  problems,
  resetHudStore,
  saveDeviceLayout,
  sized,
  snap,
  storedFor,
  toStored,
  type HudView,
} from '../../src/input/touch/hudLayout';
import { arcLayout } from '../../src/input/touch/touchArc';
import { inStickZone, sensFull } from '../../src/input/touch/touchControls';
import { AIM_SENS, clampSens, formatSlotCast, parseSlotCast, resetControlPrefs, setSlotCast, slotCast, TCAST_KEYS } from '../../src/input/presets';
import { fpsChoicesFor, matchFps, refreshFromIntervals, resetPerfPrefs, setMatchFps } from '../../src/render/perf/prefs';
import { MATCH_FPS, paceTarget, PAUSED_FPS, SAVER_FPS } from '../../src/render/perf/pacer';
import { openHudEditor } from '../../src/ui/hudEditor';
import { settingsPanel } from '../../src/ui/settings';
import { applyView, buildBlob, loadCloud, parseView, SYNCED_KEYS } from '../../src/meta/progressCloud';
import { resetProfileCache } from '../../src/meta/profile';
import { LUCKY_DEFAULT } from '../../src/meta/lucky';
import { sanitizeBlob } from '../../../backend/src/pawlegends/progress/progress-merge';

const SAFE0 = { t: 0, r: 0, b: 0, l: 0 };
const view = (w: number, h: number, o: Partial<HudView> = {}): HudView => ({ w, h, safe: SAFE0, large: false, lefty: false, mmK: 1, ...o });

beforeEach(() => {
  localStorage.clear();
  resetHudStore();
  resetControlPrefs();
  resetPerfPrefs();
  resetProfileCache();
  document.body.innerHTML = '';
});
afterEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('the default layout', () => {
  const sizes: [number, number][] = [
    [667, 375],
    [740, 360],
    [844, 390],
    [932, 430],
    [1024, 768],
    [1180, 820],
  ];
  for (const [w, h] of sizes)
    for (const o of [{}, { lefty: true }, { large: true }, { safe: { t: 0, r: 47, b: 21, l: 47 } }] as Partial<HudView>[])
      it(`${w}x${h} ${JSON.stringify(o)}: every control obeys the rules`, () => {
        const v = view(w, h, o);
        const l = defaultLayout(v);
        expect(problems(l, v)).toEqual([]);
      });

  it('puts the buttons exactly where the touch arc does (the match CSS: cluster 28 px right, 24 px up)', () => {
    const v = view(844, 390);
    const l = defaultLayout(v);
    const arc = arcLayout(844, 390);
    expect(l.attack.x).toBeCloseTo(844 - 28 - arc.attack.rx);
    expect(l.attack.y).toBeCloseTo(390 - 24 - arc.attack.by);
    expect(l.attack.d).toBe(arc.attack.d);
    // the left-handed mirror measures from the left
    expect(defaultLayout(view(844, 390, { lefty: true })).attack.x).toBeCloseTo(28 + arc.attack.rx);
  });

  it('stores nothing for the default, and a moved control as viewport fractions', () => {
    const v = view(844, 390);
    expect(toStored(defaultLayout(v), v)).toBeNull();
    const l = defaultLayout(v);
    l.q = { ...l.q, x: l.q.x - 200, y: l.q.y - 100 };
    const st = toStored(l, v)!;
    expect(Object.keys(st)).toEqual(['q']);
    expect(st.q![0]).toBeCloseTo((l.q.x) / 844, 3);
    expect(fromStored(st, v)!.q.x).toBeCloseTo(l.q.x, 0);
  });
});

describe('rules', () => {
  const v = view(844, 390);
  it('an overlap names the other control', () => {
    const l = defaultLayout(v);
    l.q = { ...l.q, x: l.w.x, y: l.w.y };
    expect(problemOf(l, 'q', v)).toBe('w');
    expect(problems(l, v)).toEqual(expect.arrayContaining(['q', 'w']));
  });
  it('the safe area and the score bar', () => {
    const l = defaultLayout(v);
    expect(problemOf({ ...l, e: { ...l.e, x: 10 } }, 'e', v)).toBe('edge');
    expect(problemOf({ ...l, e: { ...l.e, x: 422, y: 40 } }, 'e', v)).toBe('top');
    // the hero's spot is drawn for reference only: a player may put a button there
    expect(problemOf({ ...l, e: { ...l.e, x: 422, y: 195 } }, 'e', v)).toBeNull();
    const notch = view(844, 390, { safe: { t: 0, r: 0, b: 0, l: 47 } });
    const n = defaultLayout(notch);
    expect(problemOf({ ...n, stick: { ...n.stick, x: 60 } }, 'stick', notch)).toBe('edge');
  });
  it('the minimap group is a rect: a circle in its chat column overlaps it', () => {
    const l = defaultLayout(v);
    expect(gapBetween(l.minimap, { ...l.q, x: l.minimap.x, y: l.minimap.y + l.minimap.h / 2 - 10 })).toBeLessThan(0);
  });
  it('sizes stay 0.8 to 1.4, buttons never under 44 px', () => {
    const l = defaultLayout(v);
    expect(sized(l.nap, 0.8).d).toBe(44);
    expect(sized(l.attack, 2).k).toBe(1.4);
    expect(sized(l.attack, 1.2).d).toBe(Math.round(l.attack.d * 1.2));
  });
  it('snaps to another centre line or the safe edge, with a guide', () => {
    const l = defaultLayout(v);
    const s = snap(l, 'q', l.w.x + 5, 200, v);
    expect(s.x).toBe(l.w.x);
    expect(s.gx).toBe(l.w.x);
    const e = snap(l, 'q', 844 - 4 - l.q.d / 2 - 3, 200, v);
    expect(e.x).toBe(844 - 4 - l.q.d / 2);
    expect(e.gx).toBe(844 - 4);
    expect(snap(l, 'q', 500.4, 222.6, v, ['q'])).toMatchObject({ x: 500, y: 223, gx: null });
  });
  it('a layout that does not fit another screen falls back to the default as a whole', () => {
    const big = view(1180, 820);
    const l = defaultLayout(big);
    // Q just under the tablet's minimap group: legal there
    l.q = { ...l.q, x: 150, y: 260 };
    expect(problems(l, big)).toEqual([]);
    const st = toStored(l, big)!;
    expect(fromStored(st, big)).not.toBeNull();
    // the same fractions on a short phone: Q lands in the minimap group, so nothing of the layout applies
    expect(fromStored(st, view(667, 375))).toBeNull();
  });
  it('the left-handed mirror flips the arc and the stick, never the minimap or the right-edge column', () => {
    const r = view(844, 390);
    const l = defaultLayout(r);
    l.q = { ...l.q, x: l.q.x - 200, y: l.q.y - 100 };
    l.minimap = { ...l.minimap, x: l.minimap.x + 100 };
    const st = toStored(l, r)!;
    const m = fromStored(st, view(844, 390, { lefty: true }))!;
    expect(m.q.x).toBeCloseTo(844 - l.q.x, 0);
    expect(m.minimap.x).toBeCloseTo(l.minimap.x, 0);
    expect(m.nap.x).toBeCloseTo(l.nap.x, 0);
  });
  it('device classes: phone or tablet, landscape or portrait', () => {
    expect(deviceClass(844, 390)).toBe('phone-l');
    expect(deviceClass(390, 844)).toBe('phone-p');
    expect(deviceClass(1180, 820)).toBe('tablet-l');
  });
  it('parses only known controls and finite fractions', () => {
    const s = parseStore({ 'phone-l': { q: [0.5, 0.5, 1.23], bogus: [0.1, 0.1, 1], w: [2, 0.1, 1], e: 'x' }, 'evil-key': { q: [0.1, 0.1, 1] } });
    expect(s).toEqual({ 'phone-l': { q: [0.5, 0.5, 1.2] } });
  });
});

describe('storage and the joystick zone', () => {
  it('saves per device class, announces the change, and remembers a reset', () => {
    let n = 0;
    const on = (): void => void n++;
    window.addEventListener(HUD_EVENT, on);
    expect(hudStoreTouched()).toBe(false);
    saveDeviceLayout('phone-l', { q: [0.6, 0.7, 1] });
    expect(storedFor(844, 390)).toEqual({ q: [0.6, 0.7, 1] });
    expect(storedFor(1180, 820)).toBeNull();
    saveDeviceLayout('phone-l', null);
    window.removeEventListener(HUD_EVENT, on);
    expect(n).toBe(2);
    expect(localStorage.getItem(HUD_KEY)).toBe('{}');
    expect(hudStoreTouched()).toBe(true);
  });
  it('a moved joystick moves its zone', () => {
    expect(inStickZone(100, 300, 844, 390)).toBe(true);
    expect(inStickZone(400, 300, 844, 390)).toBe(false);
    expect(inStickZone(400, 300, 844, 390, false, { dx: 200, dy: 0 })).toBe(true);
    expect(inStickZone(100, 300, 844, 390, false, { dx: 200, dy: 0 })).toBe(false);
  });
});

describe('per-ability cast mode and aim sensitivity', () => {
  it('defaults to Quick at 100% for every slot (today\'s behaviour)', () => {
    for (const s of ['q', 'w', 'e', 'r', 'trick'] as const) expect(slotCast(s)).toEqual({ mode: 'quick', sens: AIM_SENS.def });
  });
  it('stores one short synced key per slot', () => {
    setSlotCast('r', { mode: 'normal', sens: 147 });
    expect(localStorage.getItem('pawlegends.tcast.r')).toBe('n150');
    resetControlPrefs();
    expect(slotCast('r')).toEqual({ mode: 'normal', sens: 150 });
    for (const k of TCAST_KEYS) expect(SYNCED_KEYS).toContain(k);
  });
  it('parses defensively', () => {
    expect(parseSlotCast('i60')).toEqual({ mode: 'indicator', sens: 60 });
    expect(parseSlotCast('x100')).toEqual({ mode: 'quick', sens: 100 });
    expect(parseSlotCast('q999')).toEqual({ mode: 'quick', sens: 200 });
    expect(clampSens(5)).toBe(50);
    expect(formatSlotCast({ mode: 'indicator', sens: 120 })).toBe('i120');
  });
  it('sensitivity shortens the thumb travel for full range', () => {
    expect(sensFull(100, 100)).toBe(100);
    expect(sensFull(100, 200)).toBe(50);
    expect(sensFull(100, 50)).toBe(200);
  });
});

describe('frame rate', () => {
  it('60 by default; Battery saver still holds 30; menus and pauses unchanged', () => {
    expect(matchFps()).toBe(60);
    expect(paceTarget({ inMatch: true, paused: false, covered: false, saver: false })).toBe(MATCH_FPS);
    expect(paceTarget({ inMatch: true, paused: false, covered: false, saver: false, matchFps: 120 })).toBe(120);
    expect(paceTarget({ inMatch: true, paused: false, covered: false, saver: true, matchFps: 120 })).toBe(SAVER_FPS);
    expect(paceTarget({ inMatch: true, paused: true, covered: false, saver: false, matchFps: 120 })).toBe(PAUSED_FPS);
    expect(paceTarget({ inMatch: false, paused: false, covered: false, saver: false, matchFps: 120 })).toBe(30);
    setMatchFps(90);
    resetPerfPrefs();
    expect(matchFps()).toBe(90);
  });
  it('measures the display from rAF intervals and offers only what it keeps up with', () => {
    const at = (ms: number): number[] => Array.from({ length: 120 }, (_, i) => ms + (i % 3) * 0.2);
    expect(refreshFromIntervals(at(16.67))).toBe(60);
    expect(refreshFromIntervals(at(8.33))).toBe(120);
    expect(refreshFromIntervals(at(11.1))).toBe(90);
    expect(refreshFromIntervals(at(33.3))).toBe(60);
    expect(refreshFromIntervals([])).toBe(60);
    expect(fpsChoicesFor(60)).toEqual([30, 60]);
    expect(fpsChoicesFor(90)).toEqual([30, 60, 90]);
    expect(fpsChoicesFor(120)).toEqual([30, 60, 90, 120]);
  });
});

const touchDevice = (): void => {
  (window as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({ matches: q.includes('hover: none') });
};

describe('Settings rows', () => {
  it('touch: HUD layout Edit, ability casting per slot, frame rate', async () => {
    touchDevice();
    const p = settingsPanel(document.body, {
      state: { muted: false, tier: 'high', tipsOn: false, stats: null, fps: 60, fpsChoices: [30, 60, 90, 120] },
      onMute() {},
      onTier() {},
      onTips() {},
      onStats() {},
      onClose() {},
      onFps(f) {
        fps = f;
      },
    });
    let fps = 0;
    expect(p.querySelector('[data-testid="hud-edit"]')).not.toBeNull();
    expect(p.querySelectorAll('.tcast')).toHaveLength(5);
    (p.querySelector('[data-fps="120"]') as HTMLElement).click();
    expect(fps).toBe(120);
    (p.querySelector('[data-slot="e"] [data-tcast="normal"]') as HTMLElement).click();
    expect(slotCast('e').mode).toBe('normal');
    const sens = p.querySelector('[data-sens="q"]') as HTMLInputElement;
    sens.value = '150';
    sens.dispatchEvent(new Event('input', { bubbles: true }));
    expect(slotCast('q').sens).toBe(150);
    (p.querySelector('[data-testid="hud-edit"]') as HTMLElement).click();
    await expect.poll(() => document.querySelector('.pl-hudedit')).not.toBeNull();
  });
  it('offers 90 and 120 only where the display keeps up', () => {
    const p = settingsPanel(document.body, {
      state: { muted: false, tier: 'high', tipsOn: false, stats: null, fps: 60, fpsChoices: [30, 60] },
      onMute() {},
      onTier() {},
      onTips() {},
      onStats() {},
      onClose() {},
      onFps() {},
    });
    expect([...p.querySelectorAll('[data-fps]')].map((b) => (b as HTMLElement).dataset.fps)).toEqual(['30', '60']);
  });
});

describe('the editor', () => {
  const W = 844;
  const H = 390;
  const ptr = (el: Element, type: string, x: number, y: number): void => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { clientX: number; clientY: number; pointerId: number };
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1 });
    el.dispatchEvent(e);
  };
  const centre = (el: HTMLElement): { x: number; y: number } => ({ x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2, y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 });
  beforeEach(() => {
    Object.assign(window, { innerWidth: W, innerHeight: H });
  });

  it('shows every control at its default spot', () => {
    const root = openHudEditor(document.body);
    const def = defaultLayout(view(W, H));
    for (const id of HUD_CTLS) {
      const el = root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
      expect(el, id).not.toBeNull();
      const c = centre(el);
      expect(Math.abs(c.x - def[id].x), id).toBeLessThanOrEqual(1);
      expect(Math.abs(c.y - def[id].y), id).toBeLessThanOrEqual(1);
    }
  });

  it('a drag onto another control slides back; a legal drag is saved for this device class', () => {
    const root = openHudEditor(document.body);
    const q = root.querySelector<HTMLElement>('[data-id="q"]')!;
    const w = centre(root.querySelector<HTMLElement>('[data-id="w"]')!);
    const q0 = centre(q);
    ptr(q, 'pointerdown', q0.x, q0.y);
    ptr(q, 'pointermove', w.x, w.y);
    expect(q.classList.contains('bad')).toBe(true);
    ptr(q, 'pointerup', w.x, w.y);
    expect(centre(q)).toEqual(q0);
    expect(root.querySelector('[data-testid="hud-hint"]')!.textContent).toContain('overlap W');
    // a legal spot: open ground left of the arc
    ptr(q, 'pointerdown', q0.x, q0.y);
    ptr(q, 'pointermove', q0.x - 300, q0.y - 150);
    ptr(q, 'pointerup', q0.x - 300, q0.y - 150);
    const q1 = centre(q);
    expect(q1.x).toBeLessThan(q0.x - 100);
    let saved = 0;
    window.addEventListener(HUD_EVENT, () => void saved++, { once: true });
    (root.querySelector('[data-a="save"]') as HTMLElement).click();
    expect(saved).toBe(1);
    expect(document.querySelector('.pl-hudedit')).toBeNull();
    const st = loadHudStore()['phone-l']!;
    expect(Object.keys(st)).toEqual(['q']);
    expect(st.q![0] * W).toBeCloseTo(q1.x, 0);
  });

  it('resizes the picked control, refuses a size with no room, and resets', () => {
    const root = openHudEditor(document.body);
    const atk = root.querySelector<HTMLElement>('[data-id="attack"]')!;
    const c = centre(atk);
    ptr(atk, 'pointerdown', c.x, c.y);
    ptr(atk, 'pointerup', c.x, c.y);
    const d0 = parseFloat(atk.style.width);
    (root.querySelector('[data-a="smaller"]') as HTMLElement).click();
    expect(parseFloat(atk.style.width)).toBeLessThan(d0);
    expect(root.querySelector('[data-testid="hud-size"]')!.textContent).toBe('ATK 90%');
    // R sits 14 px from W: growing it runs into W, and the size that would overlap is refused
    const r = root.querySelector<HTMLElement>('[data-id="r"]')!;
    const rc = centre(r);
    ptr(r, 'pointerdown', rc.x, rc.y);
    ptr(r, 'pointerup', rc.x, rc.y);
    for (let i = 0; i < 6; i++) (root.querySelector('[data-a="bigger"]') as HTMLElement).click();
    expect(problems(currentLayout(root), view(W, H))).toEqual([]);
    expect(root.querySelector('[data-testid="hud-hint"]')!.textContent).toMatch(/No room to grow R \(ultimate\): it would overlap W/);
    expect(root.querySelector('[data-testid="hud-size"]')!.textContent).toBe('R 120%');
    (root.querySelector('[data-a="reset"]') as HTMLElement).click();
    expect(parseFloat(atk.style.width)).toBe(d0);
    (root.querySelector('[data-a="save"]') as HTMLElement).click();
    expect(loadHudStore()).toEqual({});
  });

  it('the keyboard moves the picked control; Esc cancels without saving', () => {
    const root = openHudEditor(document.body);
    const e = root.querySelector<HTMLElement>('[data-id="e"]')!;
    const c = centre(e);
    ptr(e, 'pointerdown', c.x, c.y);
    ptr(e, 'pointerup', c.x, c.y);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }));
    expect(centre(e).x).toBe(c.x - 10);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.pl-hudedit')).toBeNull();
    expect(localStorage.getItem(HUD_KEY)).toBeNull();
  });
});

/** The editor's current layout read back from its elements (for the no-overlap check). */
function currentLayout(root: HTMLElement): ReturnType<typeof defaultLayout> {
  const l = defaultLayout(view(844, 390));
  for (const id of HUD_CTLS) {
    const el = root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
    const w = parseFloat(el.style.width);
    const h = parseFloat(el.style.height);
    l[id] = { ...l[id], x: parseFloat(el.style.left) + w / 2, y: parseFloat(el.style.top) + h / 2, d: l[id].d > 0 ? w : 0 };
  }
  return l;
}

describe('account sync', () => {
  it('sends the layouts only once this device saved one, and the server keeps them', () => {
    expect(buildBlob(1000).blob.prefs.data.hud).toBeUndefined();
    saveDeviceLayout('phone-l', { q: [0.6, 0.7, 1.2], stick: [0.2, 0.7, 1.1] });
    const { blob } = buildBlob(2000);
    expect(blob.prefs.data.hud).toEqual({ 'phone-l': { q: [0.6, 0.7, 1.2], stick: [0.2, 0.7, 1.1] } });
    expect(sanitizeBlob(JSON.parse(JSON.stringify(blob))).prefs.data).toMatchObject({ hud: { 'phone-l': { q: [0.6, 0.7, 1.2], stick: [0.2, 0.7, 1.1] } } });
  });
  it('a newer account layout lands here and re-lays out the HUD; an answer without one keeps ours', () => {
    saveDeviceLayout('tablet-l', { q: [0.5, 0.5, 1] });
    let n = 0;
    window.addEventListener(HUD_EVENT, () => void n++);
    const base = { treats: { xp: 0, chests: 0, winDay: null }, quests: { day: null, progress: {}, done: [] }, counts: { matches: 0, wins: 0, firstWin: 0, heroMatches: {} }, unlocks: [], applied: [] };
    const v = (prefs: unknown) => parseView({ blob: { ...base, prefs }, grants: [], lucky: { odds: LUCKY_DEFAULT.odds, floor: 10, dailyTreatXp: 150, n: 0, eligible: true }, welcome: null, mastery: {}, today: '2026-11-14' })!;
    applyView(v({ at: 5, data: { profile: {}, keys: { 'pawlegends.tcast.w': 'i150' } } }), loadCloud());
    expect(loadHudStore()).toEqual({ 'tablet-l': { q: [0.5, 0.5, 1] } });
    expect(localStorage.getItem('pawlegends.tcast.w')).toBe('i150');
    applyView(v({ at: 9, data: { profile: {}, keys: {}, hud: { 'phone-l': { w: [0.7, 0.6, 1] } } } }), loadCloud());
    expect(loadHudStore()).toEqual({ 'phone-l': { w: [0.7, 0.6, 1] } });
    expect(n).toBeGreaterThan(0);
  });
});
