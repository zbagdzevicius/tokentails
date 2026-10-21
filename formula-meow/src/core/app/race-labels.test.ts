import { describe, expect, it } from 'vitest';
import { Modifier } from '../../types';
import { finishWaitStep, nextRaceModifiers, raceClassLabel, resultsDue, touchHelp } from './race-labels';
import { BackGuard } from './back-guard';

describe('results class label and Next (Mirror single race)', () => {
  it('a mirrored 150cc race says Mirror, not 150cc Zoomies', () => {
    expect(raceClassLabel(2, 0)).toBe('Zoomies 150cc');
    expect(raceClassLabel(2, Modifier.Mirror)).toBe('Mirror');
    expect(raceClassLabel(0, Modifier.Mirror | Modifier.Night)).toBe('Kitten 50cc · Mirror');
  });

  it('Next keeps the mirror (as Again does) and drops the other modifiers', () => {
    expect(nextRaceModifiers(Modifier.Mirror)).toBe(Modifier.Mirror);
    expect(nextRaceModifiers(Modifier.Mirror | Modifier.CatnipRain)).toBe(Modifier.Mirror);
    expect(nextRaceModifiers(Modifier.Night)).toBe(0);
  });
});

describe('touch help follows the drift setting', () => {
  it('one-thumb and two-thumb lines differ', () => {
    expect(touchHelp(true)).toContain('Full stick');
    expect(touchHelp(false)).toContain('Hold the right thumb');
  });
});

describe('finish → results wait', () => {
  it('counts unpaused time only and never shows the results over the pause screen', () => {
    let w = finishWaitStep(-1, false, false, 0.1);
    expect(w).toBe(-1);
    w = finishWaitStep(w, true, false, 0.1);
    expect(w).toBe(0);
    for (let i = 0; i < 10; i++) w = finishWaitStep(w, true, false, 0.1); // 1 s racing
    // paused for 10 s: the wait does not move, and nothing comes up
    for (let i = 0; i < 100; i++) {
      w = finishWaitStep(w, true, true, 0.1);
      expect(resultsDue(w, true, false)).toBe(false);
    }
    expect(w).toBeCloseTo(1, 5);
    expect(resultsDue(w, true, true)).toBe(false); // even a finished field waits for the resume
    for (let i = 0; i < 16; i++) w = finishWaitStep(w, true, false, 0.1);
    expect(resultsDue(w, false, false)).toBe(true);
  });
});

describe('hardware / browser Back', () => {
  function fakeWin() {
    const entries: string[] = ['https://x/meow-race?daily=1'];
    let at = 0;
    let pop: (() => void) | null = null;
    const loc = { get href() { return entries[at]; } };
    return {
      entries,
      get at() { return at; },
      backs: 0,
      win: {
        location: loc,
        history: {
          pushState: (_s: unknown, _t: string, url?: string | URL | null) => {
            entries.splice(at + 1);
            entries.push(String(url));
            at++;
          },
          replaceState: (_s: unknown, _t: string, url?: string | URL | null) => {
            entries[at] = String(url);
          },
          back() {
            (this as unknown as { n?: number }).n = 1;
          },
        },
        addEventListener: (_: 'popstate', fn: () => void) => (pop = fn),
      },
      /** the user presses Back */
      press() {
        at--;
        pop?.();
      },
      clean(url: string) {
        entries[at] = url;
      },
    };
  }

  it('a Back during a race is a game Back (pause), and the guard comes back', () => {
    const f = fakeWin();
    let handled = 0;
    const g = new BackGuard(f.win, { wanted: () => true, handle: () => (handled++, true) });
    f.clean('https://x/meow-race'); // the modes lane cleaned the route
    g.sync();
    expect(f.entries.length).toBe(2);
    expect(g.isArmed).toBe(true);
    f.press();
    expect(handled).toBe(1);
    expect(g.isArmed).toBe(true);
    // still on the page, and the entry under the guard no longer carries the spent ?daily route
    expect(f.entries).toEqual(['https://x/meow-race', 'https://x/meow-race']);
    expect(f.at).toBe(1);
  });

  it('on the title nothing is guarded, so Back leaves; an unhandled Back goes on back', () => {
    const f = fakeWin();
    let want = false;
    const backs: number[] = [];
    f.win.history.back = () => void backs.push(1);
    const g = new BackGuard(f.win, { wanted: () => want, handle: () => false });
    g.sync();
    expect(f.entries.length).toBe(1);
    want = true;
    g.sync();
    f.press();
    expect(g.isArmed).toBe(false);
    expect(backs.length).toBe(1);
  });
});
