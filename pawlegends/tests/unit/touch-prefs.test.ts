// @vitest-environment happy-dom
/**
 * UX pass 2 (Wild Rift practices): the left-handed mirror (buttons left, joystick right) and the Large button size.
 * Both are Settings rows on touch, stored per device, and the touch controls lay out again at once.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { leftHanded, resetControlPrefs, setLeftHanded, setTouchSize, touchSize, TOUCH_PREFS_EVENT } from '../../src/input/presets';
import { ARC_LARGE, arcLayout, arcStyle, minGap } from '../../src/input/touch/touchArc';
import { settingsPanel } from '../../src/ui/settings';

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* none */
  }
  resetControlPrefs();
  document.body.innerHTML = '';
});

describe('left-handed mirror and button size', () => {
  it('defaults off / Normal; choices persist and announce a relayout', () => {
    expect(leftHanded()).toBe(false);
    expect(touchSize()).toBe('normal');
    let events = 0;
    const on = (): void => void events++;
    window.addEventListener(TOUCH_PREFS_EVENT, on);
    setLeftHanded(true);
    setTouchSize('large');
    window.removeEventListener(TOUCH_PREFS_EVENT, on);
    expect(events).toBe(2);
    resetControlPrefs();
    expect(leftHanded()).toBe(true);
    expect(touchSize()).toBe('large');
  });

  it('the mirror measures the same arc from the left edge', () => {
    const s = { rx: 160, by: 30, d: 60 };
    expect(arcStyle(s, true)).toEqual({ left: '130px', right: '', bottom: '0px', width: '60px', height: '60px' });
    expect(arcStyle(s)).toEqual({ left: '', right: '130px', bottom: '0px', width: '60px', height: '60px' });
  });

  it('Large scales every button and gap up; nothing touches on a 667x375 phone and the cluster still fits', () => {
    for (const [w, h] of [[667, 375], [844, 390]]) {
      const n = arcLayout(w, h);
      const l = arcLayout(w, h, true);
      expect(l.attack.d).toBeGreaterThan(n.attack.d);
      expect(l.q.d / n.q.d).toBeCloseTo(ARC_LARGE, 1);
      expect(minGap(l).gap).toBeGreaterThan(minGap(n).gap);
      for (const [id, s] of Object.entries(l)) {
        // Large reaches a little past the middle on a 667 px phone (the joystick still has the left 45%)
        expect(s.rx + s.d / 2 + 28).toBeLessThan(w * 0.56);
        // feel pass B3: the right-edge column reaches up to just under the 24 px top strip, the arc stays low
        expect(s.by + s.d / 2 + 24, id).toBeLessThanOrEqual((['lasthit', 'tower', 'nap'].includes(id) ? h - 30 : h - 60) + 0.5);
      }
    }
  });

  it('Settings on a touch device shows both rows and they change the prefs', () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('hover: none'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const p = settingsPanel(document.body, { state: { muted: false, tier: 'med', tipsOn: true, stats: null }, onMute() {}, onTier() {}, onTips() {}, onStats() {}, onClose() {} });
      expect(p.querySelector('[data-a="lefty"]')?.textContent).toBe('Off');
      (p.querySelector('[data-a="lefty"]') as HTMLElement).click();
      expect(leftHanded()).toBe(true);
      expect(p.querySelector('[data-tsize="normal"]')?.classList.contains('on')).toBe(true);
      (p.querySelector('[data-tsize="large"]') as HTMLElement).click();
      expect(touchSize()).toBe('large');
    } finally {
      window.matchMedia = mm;
    }
  });
});
