/**
 * Force update in the game (src/meta/clientPolicy.ts, docs/plans/moba/FORCE-UPDATE.md §5): an outdated web build
 * reloads to the latest build on the title only (never mid-match), a refused sim blocks with a card, a tab never loops
 * on a CDN that still serves the old build, and the app hands over to its shell instead of reloading.
 */
import { describe, expect, it } from 'vitest';
import { CARD_SECONDS, UpdateWatch, WATCH_EVERY_MS, WATCH_TIMER_MS, type UpdateWatchDeps, type WatchMode } from '../../src/meta/clientPolicy';
import { chipState, SIM_VERSION_CODE } from '../../src/embed/integrate';

function setup(o: { mode?: WatchMode; live?: unknown; answer?: unknown; own?: string; title?: boolean } = {}) {
  let t = 1_000_000;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let id = 0;
  const state = { title: o.title ?? true, live: o.live === undefined ? { sha: 'new1234', simVersion: 27 } : o.live, answer: o.answer ?? { schema: 1, action: 'ok', reason: 'current' }, fetches: [] as string[] };
  const reloads: { reason: string; version: string | null }[] = [];
  const events: string[] = [];
  const cards: { blocking: boolean; seconds: number; onNow(): void; closed: boolean }[] = [];
  const store = new Map<string, string>();
  const d: UpdateWatchDeps = {
    mode: o.mode ?? 'web',
    api: 'https://api.tokentails.com',
    versionUrl: '/pawlegends-game/version.json',
    own: { sha: o.own ?? 'old1234', sim: 27 },
    fetchJson: async (url) => {
      state.fetches.push(url);
      const v = url.includes('client-policy') ? state.answer : state.live;
      if (v instanceof Error) throw v;
      return v;
    },
    atTitle: () => state.title,
    now: () => t,
    setTimeout: (fn, ms) => {
      timers.push({ at: t + ms, fn, id: ++id });
      return id;
    },
    clearTimeout: (x) => {
      const i = timers.findIndex((y) => y.id === x);
      if (i >= 0) timers.splice(i, 1);
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    showCard: (c) => {
      const card = { ...c, closed: false };
      cards.push(card);
      return { close: () => void (card.closed = true) };
    },
    reload: (reason, version) => void reloads.push({ reason, version }),
    dispatch: (type) => void events.push(type),
  };
  const watch = new UpdateWatch(d);
  const advance = async (ms: number) => {
    t += ms;
    for (const x of timers.filter((y) => y.at <= t)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return { watch, state, reloads, events, cards, store, advance };
}

describe('UpdateWatch (web)', () => {
  it('current: the live build is this one; nothing happens', async () => {
    const s = setup({ own: 'new1234' });
    expect(await s.watch.check('boot')).toBe('current');
    expect(s.cards).toEqual([]);
    expect(s.state.fetches).toEqual(['/pawlegends-game/version.json', 'https://api.tokentails.com/pawlegends/client-policy?platform=web&sim=27&bundle=new1234']);
  });

  it('outdated on the title: a card, then a reload to the latest build', async () => {
    const s = setup();
    expect(await s.watch.check('boot')).toBe('outdated');
    expect(s.cards).toHaveLength(1);
    expect(s.cards[0]).toMatchObject({ blocking: false, seconds: CARD_SECONDS });
    expect(s.reloads).toEqual([]);
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toEqual([{ reason: 'outdated', version: 'new1234' }]);
  });

  it('"Reload now" reloads at once (once)', async () => {
    const s = setup();
    await s.watch.check('boot');
    s.cards[0].onNow();
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toHaveLength(1);
  });

  it('never mid-match: outdated during a match waits for the title', async () => {
    const s = setup({ title: false });
    expect(await s.watch.check('boot')).toBe('outdated');
    expect(s.cards).toEqual([]);
    await s.advance(60_000);
    expect(s.reloads).toEqual([]);
    s.state.title = true;
    s.watch.onTitle();
    expect(s.cards).toHaveLength(1);
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toHaveLength(1);
  });

  it('Play pressed before the countdown ends: no reload in the pick; the card comes back on the next title', async () => {
    const s = setup();
    await s.watch.check('boot');
    s.state.title = false;
    s.watch.offTitle();
    expect(s.cards[0].closed).toBe(true);
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toEqual([]);
    s.state.title = true;
    s.watch.onTitle();
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toHaveLength(1);
  });

  it('the backend refuses this sim: a blocking card (no way back to Play) and a fast reload', async () => {
    const s = setup({ answer: { schema: 1, action: 'update', reason: 'sim-not-accepted' } });
    expect(await s.watch.check('boot')).toBe('blocking');
    expect(s.cards[0]).toMatchObject({ blocking: true });
    s.watch.offTitle();
    expect(s.cards[0].closed).toBe(false);
    await s.advance(2000);
    expect(s.reloads).toEqual([{ reason: 'sim', version: 'new1234' }]);
  });

  it('a save refused for the sim (PAWLEGENDS_SIM_VERSION) marks the build outdated at once', async () => {
    const s = setup({ title: false });
    expect(await s.watch.check('rejected')).toBe('blocking');
    expect(s.state.fetches).toEqual([]);
    s.state.title = true;
    s.watch.onTitle();
    expect(s.cards[0]).toMatchObject({ blocking: true });
  });

  it('no reload loop: a CDN that still serves the old build gets one reload per 5 minutes', async () => {
    const s = setup();
    await s.watch.check('boot');
    await s.advance(CARD_SECONDS * 1000);
    expect(s.reloads).toHaveLength(1);
    // the "reloaded" page is still the old build (same session storage)
    const again = setup();
    for (const [k, v] of s.store) again.store.set(k, v);
    expect(await again.watch.check('boot')).toBe('outdated');
    expect(again.cards).toEqual([]);
    await again.advance(CARD_SECONDS * 1000);
    expect(again.reloads).toEqual([]);
  });

  it('throttled: the title re-checks at most once a minute, and every 10 minutes while it stays there', async () => {
    const s = setup({ own: 'new1234' });
    s.watch.onTitle();
    await s.advance(0);
    expect(s.state.fetches).toHaveLength(2);
    s.watch.onTitle();
    await s.advance(0);
    expect(s.state.fetches).toHaveLength(2);
    await s.advance(WATCH_EVERY_MS);
    expect(s.state.fetches).toHaveLength(2);
    s.state.live = { sha: 'newer99', simVersion: 27 };
    await s.advance(WATCH_TIMER_MS);
    expect(s.state.fetches).toHaveLength(4);
    expect(s.cards).toHaveLength(1);
  });

  it('offline or API down: nothing (the page is the build the server just sent)', async () => {
    const s = setup({ live: new Error('offline'), answer: new Error('offline') });
    expect(await s.watch.check('boot')).toBe('current');
    expect(s.cards).toEqual([]);
  });

  it('a local build (sha "local") never reloads on a version mismatch', async () => {
    const s = setup({ own: 'local' });
    expect(await s.watch.check('boot')).toBe('current');
  });
});

describe('UpdateWatch (app)', () => {
  it('never fetches or reloads; a refused save tells the shell (pl:update-required)', async () => {
    const s = setup({ mode: 'app' });
    expect(await s.watch.check('boot')).toBe('skipped');
    s.watch.onTitle();
    expect(s.state.fetches).toEqual([]);
    expect(await s.watch.check('rejected')).toBe('skipped');
    expect(s.events).toEqual(['pl:update-required']);
    expect(s.reloads).toEqual([]);
  });
});

describe('the results chip', () => {
  it('a save refused for the sim reads "Update needed", not a silent rejection', () => {
    const save = { matchId: 'abc', status: 'rejected' as const, catnipPaid: 0, catnipTotal: null, fastestWin: null };
    expect(chipState(true, { ...save, code: SIM_VERSION_CODE }, false)).toBe('update');
    expect(chipState(true, { ...save, code: 'PAWLEGENDS_OUTCOME_MISMATCH' }, false)).toBe('rejected');
  });
});
