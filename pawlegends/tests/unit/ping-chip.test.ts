// @vitest-environment happy-dom
/** LATENCY-PLAN C6: the always-on ping chip of a party match (MULTIPLAYER.md §4.2). */
import { describe, expect, it, vi } from 'vitest';
import { MpHud, pingText, pingTone } from '../../src/app/mpHud';
import { FakeLink, fakeHost } from './mp-helpers';

describe('ping chip', () => {
  it('bands: green < 80 ms, yellow < 150 ms, red from 150 ms', () => {
    expect(pingTone(1)).toBe('good');
    expect(pingTone(79)).toBe('good');
    expect(pingTone(80)).toBe('warn');
    expect(pingTone(149)).toBe('warn');
    expect(pingTone(150)).toBe('bad');
    expect(pingTone(900)).toBe('bad');
    expect(pingText(47.6)).toBe('48 ms');
    expect(pingText(0)).toBe('– ms');
  });

  it('sits beside the clock and follows the link RTT every second', () => {
    vi.useFakeTimers();
    try {
      const link = new FakeLink(0, ['A', 'B', null, null, null, null]);
      let rtt = 40;
      link.net = () => ({ rttMs: rtt, buffer: 1, holds: 0, catchups: 0 });
      const f = fakeHost(['A', 'B', 'C', 'D', 'E', 'F']);
      const plate = document.createElement('div');
      plate.className = 'pl-score';
      plate.innerHTML = '<span class="mid"><span class="clock">0:00</span></span>';
      f.host.ui.appendChild(plate);
      const hud = new MpHud(f.host, link, { hideNames: false });
      const chip = f.host.ui.querySelector<HTMLElement>('.pl-score .mid .mp-ping')!;
      expect(chip).not.toBeNull();
      expect(chip.textContent).toBe('40 ms');
      expect(chip.dataset.tone).toBe('good');
      rtt = 120;
      vi.advanceTimersByTime(1000);
      expect(chip.textContent).toBe('120 ms');
      expect(chip.dataset.tone).toBe('warn');
      rtt = 260;
      vi.advanceTimersByTime(1000);
      expect(chip.dataset.tone).toBe('bad');
      hud.dispose();
      expect(f.host.ui.querySelector('.mp-ping')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
