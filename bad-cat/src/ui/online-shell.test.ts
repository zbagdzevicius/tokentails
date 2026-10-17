// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAT, type OnlineApi, type OnlineFeatures, type RunResult } from '../types';
import { startApp, rankedLine } from './app-shell';
import { meta } from '../meta';
import { click, playRun, qa, until, world, type World } from './shell-world.test-util';

/** Phase 2 in the shell (GDD 10): board and feed links, the ranked save line, Settings → Online. */

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__BADCAT_QA__;
});

const ON: OnlineFeatures = {
  accounts: true,
  scores: true,
  boards: true,
  shortLinks: true,
  feed: true,
  meter: true,
  push: true,
  streakEmail: true,
  creatorDashboard: true,
  livePinkPaw: true,
  yourcat: true,
};

function fakeOnline(features: OnlineFeatures = ON): OnlineApi & { saved: RunResult[] } {
  const saved: RunResult[] = [];
  return {
    saved,
    enabled: true,
    features: async () => features,
    session: () => ({ signedIn: true, guest: false, verified: true }),
    onSession: (fn) => (fn({ signedIn: true, guest: false, verified: true }), () => undefined),
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
    submitRanked: async (r) => {
      saved.push(r);
      return { status: 'saved', save: { dayNo: r.dayNo!, score: r.score, stamp: r.stamp, rank: r.rank, ticks: r.ticks, finalHash: 1, level: `d${r.dayNo}` }, rank: 3 };
    },
    flushRanked: async () => 0,
    board: async (d) => ({ dayNo: d, label: `Kitchen #${d}`, rows: [{ rank: 1, score: 9000, stamp: 'perfect', name: 'Luna' }], updatedAt: 'x' }),
    boardMe: async (d) => ({ dayNo: d, saved: true, guest: false, score: 500, stamp: 'clean', rank: 3 }),
    account: async () => ({ signedIn: true, guest: false, emailVerified: true, ranked: { days: 4, best: 9000, lastDay: 18, streak: 2 }, streakEmail: false, canClaim: true }),
    claimPurchases: async () => null,
    setStreakEmail: async () => true,
    shorten: async (u) => u,
    publishRoom: async () => null,
    feed: async () => ({ rooms: [{ id: 'Ab3dEf7h', code: 'X', title: 'Glass Palace', author: 'Mia', shell: 0, props: 20, plays: 120, ancestors: [], createdAt: 'x' }] }),
    room: async () => null,
    playRoom: async () => undefined,
    reportRoom: async () => true,
    meter: async () => ({ month: '2026-11', cents: 1240, currency: 'usd', collars: 2, updated: '2026-11-20' }),
    pinkPaw: async () => ({}),
    yourcat: async () => null,
    creator: async () => null,
    push: { supported: () => true, state: async () => 'off', subscribe: async () => true, unsubscribe: async () => true },
  };
}

function boot(w: World): HTMLElement {
  w.kv.set('ftueDone', true);
  w.profile.p = { ...w.profile.p, sessions: 1, cats: [{ ...DEFAULT_CAT, name: 'Mochi' }] };
  w.services.meta = meta;
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, w.services);
  return root;
}

describe('Phase 2 online in the shell', () => {
  it('shows the board and feed links, saves a ranked run and shows its rank', async () => {
    const w = world({ ghosts: [] });
    const on = fakeOnline();
    w.services.online = on;
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    await until(() => root.textContent!.includes('Daily board'));
    expect(root.textContent).toContain('Room feed');
    qa().goto!('briefing');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await until(() => qa().screen() === 'result');
    await until(() => root.textContent!.includes("Saved: #3 on today's board."));
    expect(on.saved).toHaveLength(1);
    expect(on.saved[0].mode).toBe('ranked');
    click('.bc-online-board');
    await until(() => qa().screen() === 'board');
    await until(() => root.textContent!.includes('Luna'));
    expect(root.textContent).toContain('You are #3');
  }, 20000);

  it('opens the room feed and Settings → Online', async () => {
    const w = world({ ghosts: [] });
    w.services.online = fakeOnline();
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    qa().goto!('feed');
    await until(() => root.textContent!.includes('Glass Palace'));
    expect(root.textContent).toContain('HOT');
    qa().goto!('settings');
    await until(() => root.textContent!.includes('Online'));
    await until(() => root.textContent!.includes('4 ranked days saved'));
    expect(root.textContent).toContain('Claim my purchases');
    expect(root.textContent).toContain('Daily reminder');
    expect(root.textContent).toContain('Import my cat from /yourcat');
  }, 20000);

  it('stays quiet offline: no links, no saves', async () => {
    const w = world({ ghosts: [] });
    const on = fakeOnline({ ...ON, boards: false, feed: false, scores: false });
    w.services.online = { ...on, enabled: false, features: async () => ({ ...ON, boards: false, feed: false, scores: false }) };
    const root = boot(w);
    await until(() => qa().screen() === 'home');
    await new Promise((r) => setTimeout(r, 50));
    expect(root.textContent).not.toContain('Daily board');
    qa().goto!('briefing');
    await until(() => qa().screen() === 'briefing');
    await playRun();
    await until(() => qa().screen() === 'result');
    expect(on.saved).toHaveLength(0);
  }, 20000);

  it('says what happened to a ranked save', () => {
    expect(rankedLine({ status: 'queued' })).toMatch(/back online/);
    expect(rankedLine({ status: 'off' })).toBe('');
  });
});
