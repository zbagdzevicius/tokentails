// @vitest-environment happy-dom
/**
 * The Profile screen (founder, Nov 18: one full-width, League of Legends style profile): the data mapping (banner
 * champion, mastery, rank, stats, roles, form, collection), the states (guest, new, veteran, another player's
 * read-only, private, failed + retry, device only), the name change with its confirm step, Escape and Back closing it,
 * and the public name cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { myName, refreshMyName, resetMyName, setMyName } from '../../src/meta/myName';
import { daysLeft, nameErrorText, nameProblem, priceLine, type NameInfo } from '../../src/ui/profile/name';
import {
  bannerHero,
  championRows,
  collectionCounts,
  emptyData,
  formOf,
  masteryScore,
  parseStats,
  rankView,
  roleSplit,
  rowOf,
  statsOfRows,
  tabsFor,
  topMastery,
  wearableFrames,
  type ProfileData,
  type ProfileRow,
} from '../../src/ui/profile/model';
import { profileScreen, type ProfileScreenOpts } from '../../src/ui/profile/profileScreen';
import { levelInfo } from '../../src/meta/accountLevel';

const NOW = Date.UTC(2026, 10, 18, 12);
const info = (o: Partial<NameInfo> = {}): NameInfo => ({ name: 'Witty Biscuit', nick: null, changes: 0, free: true, price: 0, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 200, ...o });
const res = (status: number, body?: unknown): ApiResult => ({ id: 'x', ok: status >= 200 && status < 300, status, body });
const row = (o: Partial<ProfileRow> = {}): ProfileRow => ({ id: 'r', at: NOW - 3600_000, hero: 'sage', outcome: 'won', k: 5, d: 2, a: 7, mode: 'ranked', grade: 'A', mvp: null, ...o });
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;

beforeEach(() => {
  localStorage.clear();
  resetMyName();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('profile model', () => {
  it('banner champion: season favourite, else top mastery, else rows, else the avatar, else Clem', () => {
    const d = emptyData(true, 'A');
    expect(bannerHero(d)).toBe('clem');
    expect(bannerHero({ ...d, av: { i: 'h:howler' } })).toBe('howler');
    expect(bannerHero({ ...d, rows: [row({ hero: 'lambo' }), row({ hero: 'lambo' }), row({ hero: 'sage' })] })).toBe('lambo');
    expect(bannerHero({ ...d, mastery: { pixel: { m: 10, w: 5, level: 3 } } })).toBe('pixel');
    expect(bannerHero({ ...d, stats: { matches: 3, wins: 1, winRate: 33, kda: 2, mvp: 0, favourites: [{ hero: 'duchess', matches: 3, wins: 1, winRate: 33 }], from: 'season' } })).toBe('duchess');
  });

  it('mastery: top 3 by level then points, the score, the champion list with unplayed last', () => {
    const m = { sage: { m: 30, w: 20, level: 5 }, clem: { m: 2, w: 1, level: 1 }, lambo: { m: 40, w: 30, level: 5 }, pixel: { m: 8, w: 4, level: 2 } };
    expect(topMastery(m).map((t) => t.hero)).toEqual(['lambo', 'sage', 'pixel']);
    expect(masteryScore(m)).toBe(13);
    const rows = championRows(m, [], true);
    expect(rows[0].hero).toBe('lambo');
    expect(rows.at(-1)!.level).toBe(0);
    // another player: only champions they played
    expect(championRows({}, [{ hero: 'howler', matches: 2, wins: 1, winRate: 50 }], false).map((r) => r.hero)).toEqual(['howler']);
  });

  it('rank: unranked, placements, a tier and Legend', () => {
    expect(rankView(null).label).toBe('Unranked');
    expect(rankView({ placementsLeft: 2, placementsOf: 5 }).line).toBe('3 / 5 placement matches played');
    const r = rankView({ placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42, peak: 'Alley III' });
    expect(r).toEqual({ tier: 'tabby', label: 'Tabby II', line: '42 / 100 pts · Best Alley III' });
    expect(rankView({ placementsLeft: 0, placementsOf: 5, tierIdx: 12, points: 240 }).tier).toBe('legend');
  });

  it('stats: the server answer checked, counted from rows, by role, and the recent form', () => {
    expect(parseStats(null)).toBeNull();
    const s = parseStats({ name: 'Season 1', matches: 24, wins: 14, winRate: 58.3, kda: 3.44, mvp: 5, favourites: [{ hero: 'sage', matches: 10, wins: 7, winRate: 70 }, { hero: 'nope', matches: 1 }] })!;
    expect(s).toMatchObject({ matches: 24, winRate: 58, kda: 3.4, mvp: 5, season: 'Season 1', from: 'season' });
    expect(s.favourites).toHaveLength(1);
    const rows = [row({ at: 3 }), row({ at: 2, outcome: 'lost', d: 6, mvp: 'mvp' }), row({ at: 1, hero: 'lambo', outcome: 'draw' })];
    const c = statsOfRows(rows)!;
    expect(c).toMatchObject({ matches: 3, wins: 1, winRate: 33, mvp: 1, from: 'device' });
    expect(c.kda).toBe(Math.round((15 + 21) / 10 * 10) / 10);
    expect(statsOfRows([])).toBeNull();
    expect(formOf(rows)).toEqual(['W', 'L', 'D']);
    expect(roleSplit(c.favourites)[0].matches).toBe(2);
  });

  it('rows: server and device rows checked; collection and borders', () => {
    expect(rowOf({ hero: 'sage' })).toBeNull();
    expect(rowOf({ id: 'a', at: 5, hero: 'sage', outcome: 'won', k: 1, d: 2, a: 3, mode: 'pvp', grade: '<b>', mvp: 'mvp' })).toMatchObject({ grade: null, mvp: 'mvp', mode: 'pvp' });
    expect(collectionCounts(['coat.a', 'coat.b', 'frame.store.goldpaw', 'title.founder', 'coat.a'])).toEqual({ coats: 2, frames: 1, titles: 1 });
    expect(wearableFrames(['frame.store.goldpaw', 'frame.bad', 'frame.legend'])).toEqual(['none', 'frame.store.goldpaw', 'frame.legend']);
    expect(tabsFor(true)).toContain('account');
    expect(tabsFor(false)).not.toContain('account');
  });
});

describe('name rules', () => {
  it('price line: first free, then Yarn with the balance, then the cooldown in days', () => {
    expect(priceLine(info(), NOW)).toBe('First change free');
    expect(priceLine(info({ changes: 2, free: true }), NOW)).toBe('Your next change is free');
    expect(priceLine(info({ changes: 1, free: false, price: 1500, yarn: 2340 }), NOW)).toBe('Change: 1,500 Yarn · you have 2,340 Yarn');
    expect(priceLine(info({ changes: 1, free: false, price: 1500, nextAt: NOW + 2.5 * 86_400_000 }), NOW)).toBe('Next change in 3 days');
    expect(daysLeft(NOW + 1000, NOW)).toBe(1);
  });

  it('quick check and error lines', () => {
    expect(nameProblem(' x ')).toMatch(/at least 2/);
    expect(nameProblem('a'.repeat(17))).toMatch(/at most 16/);
    expect(nameProblem('<b>')).toMatch(/letters/);
    expect(nameProblem('Žygis the 2nd')).toBeNull();
    const i = info({ changes: 1, free: false, price: 1500, yarn: 100 });
    expect(nameErrorText(res(409, { code: 'PAWLEGENDS_NAME_TAKEN' }), i, NOW)).toMatch(/taken/);
    expect(nameErrorText(res(402, { code: 'PAWLEGENDS_NAME_YARN' }), i, NOW)).toBe('Not enough Yarn: you need 1,500 Yarn, you have 100 Yarn.');
    expect(nameErrorText(res(429, { code: 'PAWLEGENDS_NAME_COOLDOWN', nextAt: NOW + 86_400_000 }), i, NOW)).toMatch(/in 1 day\./);
    expect(nameErrorText(res(0), i, NOW)).toMatch(/connection/);
  });
});

function open(o: { data?: Partial<ProfileData>; friend?: ProfileScreenOpts['friend']; set?: ApiResult; get?: NameInfo; hist?: ApiResult; fail?: boolean; noApi?: boolean; tab?: ProfileScreenOpts['tab'] } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  let cur = o.get ?? info();
  let failing = !!o.fail;
  const api = vi.fn(async (op: string, args?: Record<string, unknown>): Promise<ApiResult> => {
    calls.push({ op, args });
    if (failing) return res(0);
    if (op === 'name.get') return res(200, cur);
    if (op === 'social.get') return res(200, { me: { code: 'PL-7KQ2-M9XR', name: cur.name, av: { i: 'h:sage' }, title: null } });
    if (op === 'ranked.me') return res(200, { ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42 } });
    if (op === 'history.list')
      return (
        o.hist ??
        res(200, { owner: { name: o.friend ? 'Mira Real' : cur.name, self: !o.friend }, rows: [{ id: 'a', at: NOW - 60_000, mode: 'ranked', hero: 'lambo', outcome: 'won', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' }], next: null, stats: { name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'lambo', matches: 10, wins: 7, winRate: 70 }] } })
      );
    if (op === 'name.set') {
      if (o.set) return o.set;
      cur = info({ name: String(args?.name), nick: String(args?.name), changes: 1, free: false, price: 1500 });
      return res(200, { ...cur, paid: 0 });
    }
    if (op === 'social.me') return res(200, { me: { av: { i: `h:${args?.avatarRef ?? 'sage'}` }, title: args?.title ?? null, frame: args?.frame ?? null } });
    return res(200, {});
  });
  const onClose = vi.fn();
  const openHistory = vi.fn();
  const onName = vi.fn();
  const signIn = vi.fn();
  const data: ProfileData = { ...emptyData(!o.friend, 'Witty Biscuit'), signedIn: true, level: levelInfo(15), matches: 15, ...o.data };
  const panel = profileScreen(document.body, {
    data,
    friend: o.friend ?? null,
    ...(o.tab ? { tab: o.tab } : {}),
    ...(o.noApi ? {} : { api: api as never }),
    base: '/',
    onClose,
    signIn,
    openHistory,
    openSettings: vi.fn(),
    onName,
    suggest: () => 'Zyg',
    now: () => NOW,
  });
  return { panel, calls, onClose, openHistory, onName, signIn, unfail: () => (failing = false) };
}

describe('profile screen', () => {
  it('a guest: Sign in on the banner, no host calls, device matches counted, no Edit', async () => {
    const { calls, signIn, onClose } = open({ data: { signedIn: false, matches: 0, level: levelInfo(0) } });
    await flush();
    expect(calls).toHaveLength(0);
    expect(q('[data-testid="profile-edit"]')).toBeNull();
    expect(q('[data-testid="profile-level"]').textContent).toBe('Lv 1');
    expect(q('.pfx-recent').textContent).toMatch(/No matches yet/);
    q('[data-testid="profile-signin"]').click();
    expect(signIn).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(q('[data-testid="profile-screen"]')).toBeNull();
  });

  it('a signed-in veteran: rank, top champions, season numbers and recent matches from the host', async () => {
    open({ data: { mastery: { lambo: { m: 40, w: 30, level: 5 } } } });
    await flush();
    expect(q('[data-testid="profile-name"]').textContent).toBe('Witty Biscuit');
    expect(q('[data-testid="profile-rank"]').textContent).toBe('Tabby II');
    expect(q('.pfx-top').textContent).toContain('M5');
    expect(q('.pfx-season').textContent).toContain('58%');
    expect(q('.pfx-recent').textContent).toContain('Victory');
    expect(q('.pfx-banner').innerHTML).toContain('lambo-');
    // the tabs
    q('[data-testid="profile-tab-champions"]').click();
    expect(q('.pfx-cgrid').children.length).toBeGreaterThan(10);
    q('[data-testid="profile-tab-account"]').click();
    expect(q('[data-testid="profile-code"]').textContent).toBe('PL-7KQ2-M9XR');
  });

  it('first name change from Edit profile: suggestion, confirm step, free, new name on the banner', async () => {
    const { calls, onName } = open();
    await flush();
    q('[data-testid="profile-edit"]').click();
    expect(q('[data-testid="profile-price"]').textContent).toBe('First change free');
    const input = q('[data-testid="profile-nick-input"]') as HTMLInputElement;
    expect(input.value).toBe('Zyg');
    input.value = 'Pawsome Zyg';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(q('[data-testid="profile-confirm"]').textContent).toContain('Pawsome Zyg');
    q('[data-testid="profile-confirm-btn"]').click();
    await flush();
    expect(calls.find((c) => c.op === 'name.set')?.args).toEqual({ name: 'Pawsome Zyg' });
    expect(q('[data-testid="profile-name"]').textContent).toBe('Pawsome Zyg');
    expect(q('[data-testid="profile-price"]').textContent).toContain('1,500 Yarn');
    expect(onName).toHaveBeenLastCalledWith('Pawsome Zyg');
    // Escape closes the editor first, then the screen
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('[data-testid="profile-editor"]')).toBeNull();
    expect(q('[data-testid="profile-screen"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('[data-testid="profile-screen"]')).toBeNull();
  });

  it('a refused name shows the reason; a paid change without Yarn is refused before a call', async () => {
    const { calls } = open({ set: res(409, { code: 'PAWLEGENDS_NAME_TAKEN' }) });
    await flush();
    q('[data-testid="profile-edit"]').click();
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    q('[data-testid="profile-confirm-btn"]').click();
    await flush();
    expect(q('[data-testid="profile-note"]').textContent).toBe('That name is taken. Try another one.');
    document.body.innerHTML = '';
    const b = open({ get: info({ name: 'Mira', nick: 'Mira', changes: 1, free: false, price: 1500, yarn: 100 }) });
    await flush();
    q('[data-testid="profile-edit"]').click();
    const input = q('[data-testid="profile-nick-input"]') as HTMLInputElement;
    input.value = 'Mirabel';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    q('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(q('[data-testid="profile-note"]').textContent).toMatch(/Not enough Yarn/);
    expect(b.calls.some((c) => c.op === 'name.set') || calls.filter((c) => c.op === 'name.set').length > 1).toBe(false);
  });

  it('avatar save goes through social.me', async () => {
    const { calls } = open();
    await flush();
    q('[data-testid="profile-edit"]').click();
    q('[data-a="pick-icon"][data-ref="howler"]').click();
    q('[data-testid="profile-avatar-save"]').click();
    await flush();
    expect(calls.find((c) => c.op === 'social.me')?.args).toEqual({ avatarKind: 'hero', avatarRef: 'howler', frame: 'none' });
    expect(q('[data-testid="profile-note"]').textContent).toBe('Avatar saved');
  });

  it('failed loads show Try again, which loads again', async () => {
    const t = open({ fail: true });
    await flush();
    expect(q('[data-testid="profile-retry"]')).not.toBeNull();
    t.unfail();
    q('[data-testid="profile-retry"]').click();
    await flush();
    expect(q('[data-testid="profile-retry"]')).toBeNull();
    expect(q('[data-testid="profile-rank"]').textContent).toBe('Tabby II');
  });

  it("another player's profile: read-only, their history by code, Matches tab, the full history link", async () => {
    const t = open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira', av: { i: 'h:howler' } }, tab: 'matches' });
    await flush();
    expect(t.calls.map((c) => c.op)).toEqual(['history.list']);
    expect(t.calls[0].args).toEqual({ code: 'PL-AAAA-BBBB' });
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('matches');
    expect(q('[data-testid="profile-tab-account"]')).toBeNull();
    expect(q('[data-testid="profile-edit"]')).toBeNull();
    q('[data-testid="profile-full-history"]').click();
    expect(t.openHistory).toHaveBeenCalledWith({ code: 'PL-AAAA-BBBB', name: 'Mira Real' });
  });

  it("a private history says so", async () => {
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira' }, hist: res(403, { code: 'PAWLEGENDS_HISTORY_PRIVATE' }) });
    await flush();
    expect(q('.pfx-recent').textContent).toMatch(/private/);
  });

  it('device only (no host): local rows, Back closes', async () => {
    const t = open({ noApi: true, data: { signedIn: false, rows: [row(), row({ outcome: 'lost' })] } });
    await flush();
    expect(q('.pfx-season h3').textContent).toBe('On this device');
    expect(q('.pfx-season').textContent).toContain('50%');
    q('[data-testid="profile-back"]').click();
    expect(t.onClose).toHaveBeenCalledTimes(1);
  });
});

describe('public name cache', () => {
  it('kept on the device, refreshed from name.get at most once a minute, cleared on sign-out', async () => {
    expect(myName()).toBeNull();
    const api = vi.fn(async () => res(200, { name: 'Pawsome Zyg' }));
    expect(await refreshMyName(api as never, false, 1_000_000)).toBe(true);
    expect(await refreshMyName(api as never, false, 1_030_000)).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);
    resetMyName();
    expect(myName()).toBe('Pawsome Zyg');
    expect(setMyName(null)).toBe(true);
    expect(localStorage.getItem('pl.myName')).toBeNull();
  });
});
