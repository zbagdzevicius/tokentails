import { describe, expect, it } from 'vitest';
import type { LinkRoute } from '../types';
import { initialRouter, reduce, routeScreen, type Entry, type RouterCtx, type RouterEvent, type RouterState, type Screen } from './router';

/** Wave 3 (GDD 13.5): every route, the clip handoff, studio, household, the FTUE Glass rule and every paywall placement. */

function ctx(over: Partial<RouterCtx> = {}, ranked = new Set<number>()): RouterCtx {
  return { entry: { kind: 'direct' }, todayNo: 18, sessionIndex: 2, ftueDone: true, rankedDone: (d) => ranked.has(d), presale: false, ...over };
}
function run(c: RouterCtx, events: RouterEvent[], from?: RouterState): RouterState[] {
  let s = from ?? initialRouter(c);
  const out = [s];
  for (const e of events) {
    s = reduce(c, s, e);
    out.push(s);
  }
  return out;
}
const screens = (xs: RouterState[]): Screen[] => xs.map((x) => x.screen);
const last = <T,>(xs: T[]): T => xs[xs.length - 1];

describe('router: every /badcat/<route> link opens its screen first (GDD 6.6)', () => {
  const table: [LinkRoute, Screen, string | undefined][] = [
    ['thanks', 'sheet', 'thanks'],
    ['redeem', 'sheet', 'redeem'],
    ['restore', 'sheet', 'restore'],
    ['club', 'sheet', 'club'],
    ['cameo', 'sheet', 'cameo'],
    ['brand', 'sheet', 'brand'],
    ['maker', 'maker', undefined],
    ['archive', 'archive', undefined],
    ['rapsheet', 'rapsheet', undefined],
    ['settings', 'settings', undefined],
  ];
  it.each(table)('%s → %s', (route, screen, sheet) => {
    expect(routeScreen(route)).toEqual(sheet ? { screen, sheet } : { screen });
    // even on a first visit (a receipt or a gift before the first heist)
    for (const ftueDone of [false, true]) {
      const s = run(ctx({ ftueDone, sessionIndex: 1, entry: { kind: 'route', route } }), [{ t: 'booted' }])[1];
      expect(s.screen).toBe(screen);
      if (sheet) expect(s.sheet).toBe(sheet);
      expect(reduce(ctx(), s, { t: 'back' }).screen).toBe('home');
    }
  });
});

describe('router: boot table (entry × first visit)', () => {
  const rows: [string, Entry, boolean, Screen, Partial<RouterState['plan']> | null][] = [
    ['direct, first visit', { kind: 'direct' }, false, 'linkIntro', { mode: 'ftue', dayNo: 18 }],
    ['direct, returning', { kind: 'direct' }, true, 'home', null],
    ['typed', { kind: 'typed', pick: true }, false, 'picker', null],
    ['typed, returning', { kind: 'typed', pick: true }, true, 'picker', null],
    ['daily link, first', { kind: 'daily_link', dayNo: 12 }, false, 'linkIntro', { mode: 'ftue', dayNo: 12 }],
    ['daily link, returning', { kind: 'daily_link', dayNo: 12 }, true, 'briefing', { mode: 'practice', dayNo: 12 }],
    ['today link, returning', { kind: 'daily_link', dayNo: 18 }, true, 'briefing', { mode: 'ranked', dayNo: 18 }],
    ['glass link, returning', { kind: 'glass', glass: true }, true, 'briefing', { mode: 'practice', glass: true }],
    ['dare, first', { kind: 'dare_link', dayNo: 18 }, false, 'linkIntro', { mode: 'ranked', dayNo: 18 }],
    ['dare, returning', { kind: 'dare_link', dayNo: 18 }, true, 'briefing', { mode: 'ranked', dayNo: 18 }],
    ['room link, returning', { kind: 'room_link', ugc: true }, true, 'briefing', { mode: 'practice', ugc: true }],
    ['cat link, returning', { kind: 'cat_link', catCode: 'x' }, true, 'catmaker', null],
    ['clip handoff without a replay', { kind: 'clip_handoff', dayNo: 12 }, true, 'briefing', { mode: 'practice', dayNo: 12 }],
    ['studio', { kind: 'direct', studio: true }, false, 'studio', null],
  ];
  it.each(rows)('%s', (_name, entry, ftueDone, screen, plan) => {
    const s = run(ctx({ entry, ftueDone }), [{ t: 'booted' }])[1];
    expect(s.screen).toBe(screen);
    if (plan) expect(s.plan).toMatchObject(plan);
  });
});

describe('router: the 40 s first heist on a boss or Napper day plays The Glass (GDD 13.5)', () => {
  const hard = (d: number): boolean => d === 20 || d === 21; // Saturday boss, Sunday Napper
  it('first direct visit on a boss day', () => {
    const s = run(ctx({ todayNo: 20, ftueDone: false, ftueGlass: hard }), [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }]);
    expect(last(s).plan).toEqual({ glass: true, dayNo: undefined, mode: 'ftue' });
  });
  it('first visit from a Sunday daily link; the share then readies the ranked run of today', () => {
    const s = run(ctx({ todayNo: 21, ftueDone: false, ftueGlass: hard, entry: { kind: 'daily_link', dayNo: 21 } }), [
      { t: 'booted' },
      { t: 'introDone' },
      { t: 'catmakerDone' },
      { t: 'start' },
      { t: 'ended' },
      { t: 'toShare' },
      { t: 'shareDone' },
    ]);
    expect(s[3].plan).toEqual({ glass: true, dayNo: undefined, mode: 'ftue' });
    expect(last(s)).toMatchObject({ screen: 'home', readyRanked: true });
  });
  it('a normal weekday keeps the linked room; a ranked boss run is untouched', () => {
    expect(run(ctx({ ftueDone: false, ftueGlass: hard, entry: { kind: 'daily_link', dayNo: 19 } }), [{ t: 'booted' }])[1].plan).toEqual({ glass: false, dayNo: 19, mode: 'ftue' });
    expect(run(ctx({ todayNo: 20, ftueGlass: hard }), [{ t: 'booted' }, { t: 'play', dayNo: 20 }])[2].plan).toEqual({ glass: false, dayNo: 20, mode: 'ranked' });
  });
});

describe('router: clip handoff (?clip=1&rp=…)', () => {
  const c = ctx({ entry: { kind: 'clip_handoff', dayNo: 18 }, ftueDone: false, sessionIndex: 1 });
  it('no photo here: re-add it (skippable) → result → share', () => {
    const s = run(c, [{ t: 'replayReady', dayNo: 18, reAdd: true }, { t: 'catmakerDone' }, { t: 'toShare' }]);
    expect(screens(s)).toEqual(['boot', 'catmaker', 'result', 'share']);
    expect(s[1].reAdd).toBe(true);
    expect(s[2].reAdd).toBe(false);
    expect(s[2].plan).toEqual({ glass: false, dayNo: 18, mode: 'practice' });
  });
  it('with a photo: straight to the result; Glass replays keep The Glass', () => {
    expect(run(c, [{ t: 'replayReady', dayNo: 18 }])[1].screen).toBe('result');
    expect(run(c, [{ t: 'replayReady', glass: true }])[1].plan).toEqual({ glass: true, dayNo: undefined, mode: 'practice' });
  });
  it('replayReady is ignored after boot', () => {
    const s = run(ctx(), [{ t: 'booted' }, { t: 'replayReady', dayNo: 3 }]);
    expect(last(s).screen).toBe('home');
  });
});

describe('router: paywall placements (GDD 9.2)', () => {
  const loop: RouterEvent[] = [{ t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }];
  const table: [string, Partial<RouterCtx>, RouterEvent[], boolean][] = [
    ['post_share in session 2', { offer: () => true }, [{ t: 'booted' }, ...loop], true],
    ['post_share never in session 1', { sessionIndex: 1, offer: () => true }, [{ t: 'booted' }, ...loop], false],
    ['money says no', { offer: () => false }, [{ t: 'booted' }, ...loop], false],
    ['never on the result before the share', { offer: () => true }, [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'ended' }], false],
    ['catmaker_saved from home (session 2)', {}, [{ t: 'booted' }, { t: 'open', screen: 'catmaker' }, { t: 'catmakerDone' }, { t: 'offer' }], true],
    ['catmaker_saved never in session 1', { sessionIndex: 1 }, [{ t: 'booted' }, { t: 'open', screen: 'catmaker' }, { t: 'catmakerDone' }, { t: 'offer' }], false],
    ['streak_break on home', {}, [{ t: 'booted' }, { t: 'offer' }], true],
    ['archive_old from the archive', {}, [{ t: 'booted' }, { t: 'open', screen: 'archive' }, { t: 'offer' }], true],
    ['not from the run', {}, [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'offer' }], false],
    ['not from the briefing', {}, [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'offer' }], false],
  ];
  it.each(table)('%s', (_n, over, events, shown) => {
    const s = run(ctx(over), events);
    expect(s.some((x) => x.screen === 'offer')).toBe(shown);
  });
  it('at most one card per session, whatever the moment', () => {
    const c = ctx({ offer: () => true });
    const s = run(c, [{ t: 'booted' }, { t: 'offer' }, { t: 'offerDone' }, ...loop, { t: 'open', screen: 'archive' }, { t: 'offer' }]);
    expect(s.filter((x) => x.screen === 'offer').length).toBe(1);
    expect(last(s).screen).toBe('archive');
  });
  it('the card returns where it opened; accepting opens the sheet, which goes home', () => {
    const s = run(ctx(), [{ t: 'booted' }, { t: 'open', screen: 'archive' }, { t: 'offer' }, { t: 'offerDone' }]);
    expect(screens(s).slice(-2)).toEqual(['offer', 'archive']);
    const acc = run(ctx(), [{ t: 'booted' }, { t: 'offer' }, { t: 'sheet', sheet: 'club' }, { t: 'back' }]);
    expect(screens(acc).slice(-3)).toEqual(['offer', 'sheet', 'home']);
  });
  it('no offer after a FTUE, a studio or a household share', () => {
    const ftue = run(ctx({ ftueDone: false, offer: () => true }), [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(ftue.some((x) => x.screen === 'offer')).toBe(false);
    const studio = run(ctx({ offer: () => true, entry: { kind: 'direct', studio: true } }), [{ t: 'booted' }, { t: 'studioPlay' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(last(studio).screen).toBe('studio');
  });
});

describe('router: studio session (GDD 6.2)', () => {
  const c = ctx({ entry: { kind: 'direct', studio: true } });
  it('studio → 40 s run → result → share → back to the queue', () => {
    const s = run(c, [{ t: 'booted' }, { t: 'studioPlay', dayNo: 18 }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(screens(s)).toEqual(['boot', 'studio', 'briefing', 'run', 'result', 'share', 'studio']);
    expect(s[2].plan).toEqual({ glass: false, dayNo: 18, mode: 'ftue', studio: true });
  });
  it('The Glass, play again and quitting', () => {
    expect(run(c, [{ t: 'booted' }, { t: 'studioPlay', glass: true }])[2].plan).toEqual({ glass: true, dayNo: undefined, mode: 'ftue', studio: true });
    const again = run(c, [{ t: 'booted' }, { t: 'studioPlay' }, { t: 'start' }, { t: 'ended' }, { t: 'playAgain' }]);
    expect(last(again).plan).toMatchObject({ studio: true, mode: 'ftue' });
    expect(last(run(c, [{ t: 'booted' }, { t: 'studioPlay' }, { t: 'quit' }])).screen).toBe('studio');
    expect(last(run(c, [{ t: 'booted' }, { t: 'back' }])).screen).toBe('home');
    expect(run(ctx(), [{ t: 'booted' }, { t: 'studioPlay' }])[2].screen).toBe('home'); // only from the studio
  });
});

describe('router: household clip ("Play Luna too")', () => {
  const base: RouterEvent[] = [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }];
  it('share → briefing (practice, same room) → run → back on the share with the first plan', () => {
    const s = run(ctx(), [...base, { t: 'household' }, { t: 'start' }, { t: 'ended' }]);
    expect(screens(s).slice(-4)).toEqual(['share', 'briefing', 'run', 'share']);
    expect(s[s.length - 3].plan).toEqual({ glass: false, dayNo: 18, mode: 'practice', household: true });
    expect(last(s).plan).toEqual({ glass: false, dayNo: 18, mode: 'ranked' });
    expect(last(s).hhPlan).toBeUndefined();
  });
  it('quitting the second run goes back to the share; no household inside a household', () => {
    const q = run(ctx(), [...base, { t: 'household' }, { t: 'quit' }]);
    expect(last(q)).toMatchObject({ screen: 'share', plan: { mode: 'ranked' } });
    const nested = run(ctx(), [...base, { t: 'household' }, { t: 'start' }, { t: 'household' }]);
    expect(last(nested).screen).toBe('run');
    expect(run(ctx(), [{ t: 'booted' }, { t: 'household' }])[2].screen).toBe('home');
  });
});

describe('router: side screens open from home and go back (GDD 13.5)', () => {
  const sides = ['archive', 'settings', 'catmaker', 'picker', 'cats', 'rapsheet', 'season', 'friends', 'weekly', 'rooms', 'maker', 'studio'] as const;
  it.each(sides)('%s', (screen) => {
    const s = run(ctx(), [{ t: 'booted' }, { t: 'open', screen }]);
    expect(last(s).screen).toBe(screen);
    if (screen !== 'catmaker') expect(reduce(ctx(), last(s), { t: 'back' }).screen).toBe('home');
  });
  it('never opens over a run', () => {
    const s = run(ctx(), [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'open', screen: 'settings' }, { t: 'sheet', sheet: 'club' }, { t: 'offer' }]);
    expect(last(s).screen).toBe('run');
  });
});
