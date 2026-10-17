import { describe, expect, it } from 'vitest';
import { Router, planFor, reduce, initialRouter, type RouterCtx, type RouterEvent, type RouterState } from './router';

function ctx(over: Partial<RouterCtx> = {}, ranked = new Set<number>()): RouterCtx {
  return {
    entry: { kind: 'direct' },
    todayNo: 18,
    sessionIndex: 1,
    ftueDone: false,
    rankedDone: (d) => ranked.has(d),
    presale: true,
    ...over,
  };
}
function run(c: RouterCtx, events: RouterEvent[]): RouterState[] {
  let s = initialRouter(c);
  const out = [s];
  for (const e of events) {
    s = reduce(c, s, e);
    out.push(s);
  }
  return out;
}

describe('router: FTUE (GDD 8)', () => {
  it('first link visit: linkIntro → catmaker → 40 s FTUE run → result → share → home "ranked ready"', () => {
    const c = ctx({ entry: { kind: 'daily_link', dayNo: 16 } });
    const states = run(c, [
      { t: 'booted' },
      { t: 'introDone' },
      { t: 'catmakerDone' },
      { t: 'start' },
      { t: 'ended' },
      { t: 'toShare' },
      { t: 'shareDone' },
    ]);
    expect(states.map((s) => s.screen)).toEqual(['boot', 'linkIntro', 'catmaker', 'briefing', 'run', 'result', 'share', 'home']);
    expect(states[3].plan).toEqual({ glass: false, dayNo: 16, mode: 'ftue' });
    const end = states[states.length - 1];
    expect(end.readyRanked).toBe(true);
    expect(end.ftueDone).toBe(true);
    expect(end.ftue).toBe(false);
  });

  it('first direct visit also plays the FTUE on today', () => {
    const states = run(ctx(), [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }]);
    expect(states[1].screen).toBe('linkIntro');
    expect(states[3].plan).toEqual({ glass: false, dayNo: 18, mode: 'ftue' });
  });

  it('typed arrival: picker first, then the FTUE on the picked room', () => {
    const c = ctx({ entry: { kind: 'typed', pick: true } });
    const states = run(c, [{ t: 'booted' }, { t: 'picked', dayNo: 12 }, { t: 'introDone' }, { t: 'catmakerDone' }]);
    expect(states.map((s) => s.screen)).toEqual(['boot', 'picker', 'linkIntro', 'catmaker', 'briefing']);
    expect(states[4].plan?.mode).toBe('ftue');
    expect(states[4].plan?.dayNo).toBe(12);
  });

  it('returning visitor: direct → home, link → briefing (no FTUE)', () => {
    expect(run(ctx({ ftueDone: true }), [{ t: 'booted' }])[1].screen).toBe('home');
    const s = run(ctx({ ftueDone: true, entry: { kind: 'glass', glass: true } }), [{ t: 'booted' }])[1];
    expect(s.screen).toBe('briefing');
    expect(s.plan).toEqual({ glass: true, dayNo: undefined, mode: 'practice' });
  });
});

describe('router: offers', () => {
  it('never shows the offer card in session 1', () => {
    const c = ctx({ ftueDone: true, sessionIndex: 1 });
    const states = run(c, [{ t: 'booted' }, { t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(states.some((s) => s.screen === 'offer')).toBe(false);
    expect(states[states.length - 1].screen).toBe('home');
  });

  it('never shows it after the FTUE share, even in a later session', () => {
    const c = ctx({ sessionIndex: 3 });
    const states = run(c, [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(states.some((s) => s.screen === 'offer')).toBe(false);
  });

  it('shows it once per session from session 2, only with a pre-sale link', () => {
    const c = ctx({ ftueDone: true, sessionIndex: 2 });
    const loop: RouterEvent[] = [{ t: 'play', dayNo: 18 }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }];
    const states = run(c, [{ t: 'booted' }, ...loop, { t: 'offerDone' }, ...loop]);
    expect(states.filter((s) => s.screen === 'offer').length).toBe(1);
    const none = run(ctx({ ftueDone: true, sessionIndex: 2, presale: false }), [{ t: 'booted' }, ...loop]);
    expect(none.some((s) => s.screen === 'offer')).toBe(false);
  });
});

describe('router: one ranked run per day', () => {
  it('today is ranked until a ranked record exists, then practice; past days and The Glass are practice', () => {
    const ranked = new Set<number>();
    const c = ctx({ ftueDone: true }, ranked);
    expect(planFor(c, { dayNo: 18 }, false).mode).toBe('ranked');
    expect(planFor(c, { dayNo: 17 }, false).mode).toBe('practice');
    expect(planFor(c, { glass: true }, false).mode).toBe('practice');
    ranked.add(18);
    expect(planFor(c, { dayNo: 18 }, false).mode).toBe('practice');
  });

  it('play again after a ranked run is practice', () => {
    const ranked = new Set<number>();
    const c = ctx({ ftueDone: true }, ranked);
    const r = new Router(c);
    r.send({ t: 'booted' });
    r.send({ t: 'play', dayNo: 18 });
    expect(r.state.plan?.mode).toBe('ranked');
    r.send({ t: 'start' });
    ranked.add(18); // the app saves the day record when the run ends
    r.send({ t: 'ended' });
    r.send({ t: 'playAgain' });
    expect(r.state.screen).toBe('briefing');
    expect(r.state.plan?.mode).toBe('practice');
  });

  it('ignores events that do not apply to the current screen', () => {
    const c = ctx({ ftueDone: true });
    const s0 = initialRouter(c);
    expect(reduce(c, s0, { t: 'start' })).toBe(s0);
    const r = new Router(c);
    r.send({ t: 'booted' });
    expect(r.send({ t: 'ended' })).toBe(false);
    expect(r.send({ t: 'open', screen: 'settings' })).toBe(true);
    expect(r.state.screen).toBe('settings');
    r.send({ t: 'back' });
    expect(r.state.screen).toBe('home');
  });
});

describe('router: dare links and clip handoff (GDD 6.3, 7.3, 8)', () => {
  it('first visit from a dare: cat maker, then the dared ranked run against the ghost (no 40 s first heist)', () => {
    const c = ctx({ entry: { kind: 'dare_link', dayNo: 18 } });
    const states = run(c, [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(states.map((s) => s.screen)).toEqual(['boot', 'linkIntro', 'catmaker', 'briefing', 'run', 'result', 'share', 'home']);
    expect(states[3].plan).toEqual({ glass: false, dayNo: 18, mode: 'ranked' });
    expect(states[5].ftueDone).toBe(true);
  });

  it('returning player opens a dare on a past day: straight to a practice briefing', () => {
    const c = ctx({ entry: { kind: 'dare_link', dayNo: 12 }, ftueDone: true, sessionIndex: 3 });
    const states = run(c, [{ t: 'booted' }]);
    expect(states[1].screen).toBe('briefing');
    expect(states[1].plan).toEqual({ glass: false, dayNo: 12, mode: 'practice' });
  });

  it('clip handoff with a decoded replay opens its result directly', () => {
    const c = ctx({ entry: { kind: 'clip_handoff', dayNo: 18 } });
    const s = reduce(c, initialRouter(c), { t: 'replayReady', dayNo: 18 });
    expect(s.screen).toBe('result');
    expect(s.plan).toEqual({ glass: false, dayNo: 18, mode: 'practice' });
    expect(reduce(c, s, { t: 'toShare' }).screen).toBe('share');
  });
});

describe('leaving the first heist', () => {
  it('quit during the FTUE does not mark it done; the next play is the FTUE again', () => {
    const c = ctx({ ftueDone: false });
    const r = new Router(c);
    r.send({ t: 'booted' });
    r.send({ t: 'introDone' });
    r.send({ t: 'catmakerDone' });
    r.send({ t: 'start' });
    expect(r.state.plan?.mode).toBe('ftue');
    r.send({ t: 'quit' });
    expect(r.state.screen).toBe('home');
    expect(r.state.ftueDone).toBe(false);
    r.send({ t: 'play', dayNo: 18 });
    expect(r.state.plan?.mode).toBe('ftue');
  });
});

describe('router: FULL build routes, sheets and room links (wave-1 integration)', () => {
  it('a route link opens its screen before any first-visit flow', () => {
    expect(run(ctx({ entry: { kind: 'route', route: 'thanks' } }), [{ t: 'booted' }])[1]).toMatchObject({ screen: 'sheet', sheet: 'thanks' });
    expect(run(ctx({ entry: { kind: 'route', route: 'redeem' } }), [{ t: 'booted' }])[1]).toMatchObject({ screen: 'sheet', sheet: 'redeem' });
    expect(run(ctx({ entry: { kind: 'route', route: 'rapsheet' } }), [{ t: 'booted' }])[1].screen).toBe('rapsheet');
    expect(run(ctx({ entry: { kind: 'route', route: 'archive' } }), [{ t: 'booted' }])[1].screen).toBe('archive');
    expect(run(ctx({ entry: { kind: 'route', route: 'settings' } }), [{ t: 'booted' }])[1].screen).toBe('settings');
    const back = run(ctx({ entry: { kind: 'route', route: 'club' } }), [{ t: 'booted' }, { t: 'back' }]);
    expect(back[2].screen).toBe('home');
  });
  it('a room link plays the player room as practice, never ranked or the 40 s heist', () => {
    const first = run(ctx({ entry: { kind: 'room_link', ugc: true } }), [{ t: 'booted' }, { t: 'introDone' }, { t: 'catmakerDone' }]);
    expect(first.map((s) => s.screen)).toEqual(['boot', 'linkIntro', 'catmaker', 'briefing']);
    expect(first[3].plan).toEqual({ glass: false, mode: 'practice', ugc: true });
    const back = run(ctx({ entry: { kind: 'room_link', ugc: true }, ftueDone: true }), [{ t: 'booted' }, { t: 'start' }, { t: 'ended' }, { t: 'playAgain' }]);
    expect(back[1].plan).toEqual({ glass: false, mode: 'practice', ugc: true });
    expect(back[4].plan).toEqual({ glass: false, mode: 'practice', ugc: true });
  });
  it('sheets open from home and return there; the paywall offer replaces the pre-sale', () => {
    const c = ctx({ ftueDone: true, presale: false, sessionIndex: 3, offer: () => true });
    const s = run(c, [{ t: 'booted' }, { t: 'sheet', sheet: 'shop' }, { t: 'back' }, { t: 'open', screen: 'cats' }, { t: 'back' }, { t: 'open', screen: 'rapsheet' }]);
    expect(s.map((x) => x.screen)).toEqual(['boot', 'home', 'sheet', 'home', 'cats', 'home', 'rapsheet']);
    const offer = run(c, [{ t: 'booted' }, { t: 'play' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }, { t: 'sheet', sheet: 'club' }]);
    expect(offer.map((x) => x.screen).slice(-2)).toEqual(['offer', 'sheet']);
    const none = run(ctx({ ftueDone: true, presale: false, sessionIndex: 3, offer: () => false }), [{ t: 'booted' }, { t: 'play' }, { t: 'start' }, { t: 'ended' }, { t: 'toShare' }, { t: 'shareDone' }]);
    expect(none[none.length - 1].screen).toBe('home');
  });
});

describe('router: wave 2 screens (meta, Room Maker)', () => {
  const c = (): RouterCtx => ctx({ ftueDone: true });
  it('season, friends, weekly, rooms and the maker open from home and go back there', () => {
    for (const screen of ['season', 'friends', 'weekly', 'rooms', 'maker'] as const) {
      const s = run(c(), [{ t: 'booted' }, { t: 'open', screen }, { t: 'back' }]);
      expect(s.map((x) => x.screen)).toEqual(['boot', 'home', screen, 'home']);
    }
  });
  it('a maker link opens the Room Maker', () => {
    expect(run(ctx({ entry: { kind: 'route', route: 'maker' } }), [{ t: 'booted' }])[1].screen).toBe('maker');
  });
  it('playtest: maker → briefing → run → back in the maker (no result, never ranked)', () => {
    const s = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'rooms' }, { t: 'open', screen: 'maker' }, { t: 'playtest' }, { t: 'start' }, { t: 'ended' }]);
    expect(s.map((x) => x.screen)).toEqual(['boot', 'home', 'rooms', 'maker', 'briefing', 'run', 'maker']);
    expect(s[4].plan).toEqual({ glass: false, mode: 'practice', ugc: true, playtest: true });
    // quitting the playtest (from the run or the briefing) also lands in the maker
    const q = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'maker' }, { t: 'playtest' }, { t: 'quit' }]);
    expect(q[q.length - 1].screen).toBe('maker');
    const q2 = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'maker' }, { t: 'playtest' }, { t: 'start' }, { t: 'quit' }]);
    expect(q2[q2.length - 1].screen).toBe('maker');
    // a playtest is not replayable from the run
    const again = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'maker' }, { t: 'playtest' }, { t: 'start' }, { t: 'playAgain' }]);
    expect(again[again.length - 1].screen).toBe('run');
    // the maker opened from My rooms returns there
    const back = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'rooms' }, { t: 'open', screen: 'maker' }, { t: 'playtest' }, { t: 'quit' }, { t: 'back' }]);
    expect(back[back.length - 1].screen).toBe('rooms');
  });
  it('playtest only starts from the maker; rooms and friends can start a run', () => {
    expect(run(c(), [{ t: 'booted' }, { t: 'playtest' }])[2].screen).toBe('home');
    expect(run(c(), [{ t: 'booted' }, { t: 'open', screen: 'rooms' }, { t: 'play', ugc: true }])[3].plan).toEqual({ glass: false, mode: 'practice', ugc: true });
    expect(run(c(), [{ t: 'booted' }, { t: 'open', screen: 'friends' }, { t: 'play', dayNo: 18 }])[3].plan).toEqual({ glass: false, dayNo: 18, mode: 'ranked' });
  });
  it('a sheet or the cat manager opened from settings goes back to settings', () => {
    const s = run(c(), [{ t: 'booted' }, { t: 'open', screen: 'settings' }, { t: 'sheet', sheet: 'restore' }, { t: 'back' }, { t: 'open', screen: 'cats' }, { t: 'back' }, { t: 'back' }]);
    expect(s.map((x) => x.screen)).toEqual(['boot', 'home', 'settings', 'sheet', 'settings', 'cats', 'settings', 'home']);
  });
});
