// @vitest-environment happy-dom
/**
 * Live ops (docs/plans/moba/LIVEOPS.md): the config and me parsers, the baked rotation (the same as the server's), the
 * featured mode's ribbon through `registerMode` (and back at its end), Winter Nap's phases, the vote shares, coats
 * granted into the profile's free unlocks, and the Events cards' markup and buttons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyFeatured,
  applyTwist,
  castVote,
  claimGoal,
  fallbackConfig,
  goalPct,
  initLiveops,
  liveopsState,
  napPhase,
  parseConfig,
  parseMe,
  refreshLiveops,
  resetLiveops,
  rotationFeatured,
  rotationTwist,
  unlocksToAdd,
  voteShares,
} from '../../src/meta/liveops';
import { effectiveState, modeById, modeList, playable, resetModes } from '../../src/ui/modeSelect/modes';
import { liveopsCardsHtml, needsTap } from '../../src/ui/events/eventsPanel';
import { loadProfile, resetProfileCache } from '../../src/meta/profile';
import type { ApiResult } from '../../src/embed/api';

const NOW = Date.parse('2026-11-20T10:00:00Z');

const CONFIG = {
  v: 1,
  now: '2026-11-20T10:00:00.000Z',
  events: [
    { id: 'mode-skirmish', kind: 'mode', mode: 'skirmish', title: 'Featured: Skirmish', sub: 'Until 23 Nov', startsAt: '2026-11-16T00:00:00.000Z', endsAt: '2026-11-23T00:00:00.000Z' },
    { id: 'evil', kind: 'script', title: 'x', sub: '', startsAt: '2026-11-16T00:00:00.000Z', endsAt: '2026-11-23T00:00:00.000Z' },
  ],
  featuredMode: { id: 'skirmish', endsAt: '2026-11-23T00:00:00.000Z' },
  featuredQuests: [],
  goal: {
    id: 'g1-paws-together',
    label: 'Play 2,000 matches together',
    metric: 'matches',
    target: 2000,
    progress: 1500,
    reached: false,
    rewardItem: 'coat.clem.loop.honey',
    rewardName: 'Honey coat for Clem',
    startsAt: '2026-11-13T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
  },
  vote: {
    id: 'v1-winter-coat',
    question: 'Which coat should we make next?',
    options: [
      { id: 'a', name: 'Aurora Frost', hero: 'sage', colors: ['#8fc8ff', '#eef6ff', '#9be3c4'] },
      { id: 'b', name: '<b>Candy</b>', hero: 'brutus', colors: ['#ff3d7f', '#fff3e3', '#c8102e'] },
    ],
    open: true,
    tallies: { a: 3, b: 1 },
    startsAt: '2026-11-13T00:00:00.000Z',
    endsAt: '2026-12-15T00:00:00.000Z',
  },
  nap: {
    id: 'nap-2026',
    name: 'Winter Nap',
    startsAt: '2026-12-15T00:00:00.000Z',
    endsAt: '2027-01-05T00:00:00.000Z',
    open: false,
    today: '2026-11-20',
    gifts: [
      { day: 1, item: 'coat.sage.loop.slate', name: 'Slate coat for Sage' },
      { day: 2, item: 'coat.brutus.loop.ink', name: 'Ink coat for Brutus' },
      { day: 3, item: 'coat.cacklejaw.frost', name: 'Frost coat for Cacklejaw' },
    ],
  },
};

beforeEach(() => {
  localStorage.clear();
  resetProfileCache();
  resetModes();
  resetLiveops(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  resetModes();
  resetLiveops();
});

describe('parsers', () => {
  it('parseConfig keeps the known fields and drops unknown event kinds', () => {
    const c = parseConfig(CONFIG, NOW)!;
    expect(c.live).toBe(true);
    expect(c.events.map((e) => e.kind)).toEqual(['mode']);
    expect(c.featuredMode).toEqual({ id: 'skirmish', endsAt: Date.parse('2026-11-23T00:00:00Z') });
    expect(c.goal).toMatchObject({ progress: 1500, target: 2000, reached: false, rewardItem: 'coat.clem.loop.honey' });
    expect(c.vote?.tallies).toEqual({ a: 3, b: 1 });
    expect(c.nap?.gifts).toHaveLength(3);
  });

  it('refuses a non-v1 body, a non-coat reward and a featured mode it does not know', () => {
    expect(parseConfig({ ...CONFIG, v: 2 }, NOW)).toBeNull();
    expect(parseConfig({ ...CONFIG, goal: { ...CONFIG.goal, rewardItem: 'champ.lambo' } }, NOW)!.goal).toBeNull();
    expect(parseConfig({ ...CONFIG, featuredMode: { id: 'ranked', endsAt: '2026-11-23T00:00:00Z' } }, NOW)!.featuredMode).toEqual(rotationFeatured(NOW));
  });

  it('parseMe cleans the account state', () => {
    expect(parseMe({ goal: { id: 'g', claimed: true }, nap: { days: 2, earned: 2, claimed: 1, playedToday: true }, vote: { id: 'v', choice: 'z' }, items: ['coat.sage.loop.slate', 'champ.x'] })).toEqual({
      goal: { id: 'g', claimed: true },
      nap: { days: 2, earned: 2, claimed: 1, playedToday: true },
      vote: { id: 'v', choice: null },
      items: ['coat.sage.loop.slate'],
    });
  });

  it('the baked rotation matches the server (a mode a week, ending Monday 00:00 UTC)', () => {
    expect(rotationFeatured(Date.parse('2026-11-13T12:00:00Z'))).toEqual({ id: 'blitz', endsAt: Date.parse('2026-11-16T00:00:00Z') });
    expect(rotationFeatured(Date.parse('2026-11-18T12:00:00Z'))).toEqual({ id: 'skirmish', endsAt: Date.parse('2026-11-23T00:00:00Z') });
    expect(rotationFeatured(Date.parse('2026-11-25T12:00:00Z')).id).not.toBe('blitz');
  });

  it('goalPct, napPhase and voteShares', () => {
    expect(goalPct({ progress: 1500, target: 2000 })).toBe(75);
    expect(goalPct({ progress: 9999, target: 2000 })).toBe(100);
    const nap = { startsAt: Date.parse('2026-12-15T00:00:00Z'), endsAt: Date.parse('2027-01-05T00:00:00Z') };
    expect(napPhase(nap, Date.parse('2026-12-14T23:59:59Z'))).toBe('before');
    expect(napPhase(nap, Date.parse('2026-12-15T00:00:00Z'))).toBe('on');
    expect(napPhase(nap, Date.parse('2027-01-05T00:00:00Z'))).toBe('after');
    expect(voteShares({ a: 3, b: 1 })).toEqual({ a: 75, b: 25 });
    expect(voteShares({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });

  it('unlocksToAdd: only palette coats the game draws, never twice', () => {
    expect(unlocksToAdd(['coat.sage.loop.slate'], ['coat.sage.loop.slate', 'coat.cacklejaw.frost', 'coat.nobody.x'])).toEqual(['coat.cacklejaw.frost']);
  });

  it('offline, the fallback still features a mode and shows Winter Nap dates, but no goal or vote', () => {
    const c = fallbackConfig(NOW);
    expect(c.live).toBe(false);
    expect(c.featuredMode?.id).toBeTruthy();
    expect(c.goal).toBeNull();
    expect(c.vote).toBeNull();
    expect(c.nap?.name).toBe('Winter Nap');
  });
});

describe('featured mode ribbon', () => {
  it('registers the live mode as a timed event (still playable), then restores it at the end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const end = Date.parse('2026-11-23T00:00:00Z');
    applyFeatured({ id: 'skirmish', endsAt: end }, NOW);
    const m = modeById('skirmish', modeList(NOW))!;
    expect(effectiveState(m, NOW)).toBe('event');
    expect(playable(m, NOW)).toBe(true);
    vi.setSystemTime(end + 100);
    vi.advanceTimersByTime(end - NOW + 100);
    const after = modeById('skirmish', modeList(end + 100))!;
    expect(after.state).toBe('live');
    expect(playable(after, end + 100)).toBe(true);
  });

  it('never features Ranked (its own always-open tile) or a mode this build does not have', () => {
    applyFeatured({ id: 'ranked', endsAt: NOW + 86_400_000 }, NOW);
    expect(modeById('ranked', modeList(NOW))!.state).toBe('live');
    // a mode that is not in this build's base table (or not live there) is never featured
    applyFeatured({ id: 'arena', endsAt: NOW + 86_400_000 }, NOW);
    expect(modeById('arena', modeList(NOW))).toBeUndefined();
  });
});

describe('the store and the cards', () => {
  const answer = (body: unknown, status = 200): ApiResult => ({ id: 'x', ok: status < 300, status, body });

  it('refresh reads config and me through the host ops, grants listed coats into the free unlocks', async () => {
    const calls: string[] = [];
    initLiveops(async (op) => {
      calls.push(op);
      if (op === 'liveops.config') return answer(CONFIG);
      return answer({ goal: { id: 'g1-paws-together', claimed: false }, nap: null, vote: { id: 'v1-winter-coat', choice: null }, items: ['coat.cacklejaw.frost'] });
    }, () => true);
    await refreshLiveops(0);
    expect(calls.sort()).toEqual(['liveops.config', 'liveops.me']);
    expect(liveopsState().config.goal?.progress).toBe(1500);
    expect(loadProfile().unlocks).toContain('coat.cacklejaw.frost');
    // an open vote not cast asks for a tap
    expect(needsTap(liveopsState(), NOW)).toBe(true);
  });

  it('a guest who never played does not ask for liveops.me', async () => {
    const calls: string[] = [];
    initLiveops(async (op) => {
      calls.push(op);
      return answer(CONFIG);
    }, () => false);
    await refreshLiveops(0);
    expect(calls).toEqual(['liveops.config']);
  });

  it('claim and vote: the answer updates the state, the coat lands in the unlocks', async () => {
    const reached = { ...CONFIG, goal: { ...CONFIG.goal, progress: 2000, reached: true } };
    initLiveops(async (op) => {
      if (op === 'liveops.config') return answer(reached);
      if (op === 'liveops.me') return answer({ goal: { id: 'g1-paws-together', claimed: false }, nap: null, vote: { id: 'v1-winter-coat', choice: null }, items: [] });
      if (op === 'liveops.claim') return answer({ goal: { id: 'g1-paws-together', claimed: true }, nap: null, vote: { id: 'v1-winter-coat', choice: null }, items: ['coat.clem.loop.honey'], granted: ['coat.clem.loop.honey'] });
      if (op === 'liveops.vote') return answer({ goal: { id: 'g1-paws-together', claimed: true }, nap: null, vote: { id: 'v1-winter-coat', choice: 'b' }, items: ['coat.clem.loop.honey'], counted: true, tallies: { a: 3, b: 2 } });
      return answer({}, 400);
    }, () => true);
    await refreshLiveops(0);
    expect(liveopsCardsHtml(liveopsState(), NOW)).toContain('data-testid="lo-claim"');
    expect(await claimGoal()).toBe(true);
    expect(loadProfile().unlocks).toContain('coat.clem.loop.honey');
    expect(liveopsState().toast).toMatch(/unlocked/);
    const html = liveopsCardsHtml(liveopsState(), NOW);
    expect(html).toContain('Claimed ✓');
    expect(await castVote('b')).toBe(true);
    expect(liveopsState().config.vote?.tallies).toEqual({ a: 3, b: 2 });
    const voted = liveopsCardsHtml(liveopsState(), NOW);
    expect(voted).toContain('60%');
    expect(voted).not.toContain('data-testid="lo-vote-a"');
  });

  it('escapes server text and draws the goal bar, the vote buttons and Winter Nap before it starts', async () => {
    initLiveops(async () => answer(CONFIG), () => false);
    await refreshLiveops(0);
    const html = liveopsCardsHtml(liveopsState(), NOW);
    expect(html).toContain('aria-valuenow="1500"');
    expect(html).toContain('width:75%');
    expect(html).toContain('data-testid="lo-vote-a"');
    expect(html).toContain('&lt;b&gt;Candy&lt;/b&gt;');
    expect(html).not.toContain('<b>Candy</b>');
    expect(html).toMatch(/Starts 15 Dec/);
  });

  it('Winter Nap on: one pip per gift, ready gifts glow and open with one button', () => {
    const now = Date.parse('2026-12-17T10:00:00Z');
    const c = parseConfig(CONFIG, now)!;
    const html = liveopsCardsHtml({ config: c, me: { goal: null, vote: null, items: [], nap: { days: 2, earned: 2, claimed: 1, playedToday: true } }, busy: null, toast: null }, now);
    expect((html.match(/class="lo-pip[ "]/g) ?? []).length).toBe(3);
    expect(html).toContain('lo-pip got');
    expect(html).toContain('lo-pip ready');
    expect(html).toContain('Open your gift');
  });
});

describe('sim v27: the Weekly Twist', () => {
  beforeEach(() => {
    resetModes();
    resetLiveops(NOW);
  });

  it('offline, the baked twist is the featured mode (the same weeks as the server); sim v28: Boss Weekend on its weekends', () => {
    const c = fallbackConfig(NOW);
    expect(c.twist).toEqual(rotationTwist(NOW));
    // NOW is a Friday: Boss Weekend (Friday to Monday 00:00 UTC) is featured
    expect(c.featuredMode).toEqual({ id: 'boss', endsAt: Date.parse('2026-11-23T00:00:00Z') });
    expect(c.boss).toEqual({ startsAt: Date.parse('2026-11-20T00:00:00Z'), endsAt: Date.parse('2026-11-23T00:00:00Z') });
    const wed = Date.parse('2026-11-18T10:00:00Z');
    expect(fallbackConfig(wed).featuredMode).toEqual({ id: 'twist', endsAt: rotationTwist(wed).endsAt });
    expect(fallbackConfig(wed).boss).toEqual({ startsAt: Date.parse('2026-11-20T00:00:00Z'), endsAt: Date.parse('2026-11-23T00:00:00Z') });
    expect(c.twist!.endsAt).toBe(Date.parse('2026-11-23T00:00:00Z'));
    const ids = [NOW, NOW + 7 * 86_400_000, NOW + 14 * 86_400_000].map((t) => rotationTwist(t).id);
    expect(new Set(ids).size).toBe(3);
  });

  it('takes the server twist; a featured twist needs one', () => {
    const body = { ...CONFIG, featuredMode: { id: 'twist', endsAt: '2026-11-22T00:00:00.000Z' }, twist: { id: 'bounty', name: 'Bounty Hunt', rules: ['x'], endsAt: '2026-11-22T00:00:00.000Z' } };
    const c = parseConfig(body, NOW)!;
    expect(c.twist).toEqual({ id: 'bounty', name: 'Bounty Hunt', rules: ['x'], endsAt: Date.parse('2026-11-22T00:00:00Z') });
    expect(c.featuredMode).toEqual({ id: 'twist', endsAt: Date.parse('2026-11-22T00:00:00Z') });
    const off = parseConfig({ ...body, twist: null }, NOW)!;
    expect(off.twist).toBeNull();
    expect(off.featuredMode?.id).not.toBe('twist');
    expect(parseConfig({ ...body, twist: { id: 'giants', endsAt: '2026-11-22T00:00:00.000Z' } }, NOW)!.twist).toBeNull();
  });

  it('registers the Weekly Twist tile with its mutator and countdown, and drops it when turned off', () => {
    expect(applyTwist({ id: 'rapid', name: 'Rapid Paws', rules: ['r'], endsAt: NOW + 86_400_000 }, NOW)).toBe(true);
    const t = modeById('twist', modeList(NOW))!;
    expect(t).toMatchObject({ name: 'Rapid Paws', mutator: 'rapid', map: 'crossing', queues: ['bots'] });
    expect(effectiveState(t, NOW)).toBe('event');
    expect(playable(t, NOW)).toBe(true);
    expect(applyFeatured({ id: 'twist', endsAt: NOW + 86_400_000 }, NOW)).toBe(true);
    expect(applyTwist(null, NOW)).toBe(true);
    expect(modeById('twist', modeList(NOW))).toBeUndefined();
  });
});
