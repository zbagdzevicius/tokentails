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
  duration,
  emptyData,
  formOf,
  highlightsOf,
  honorView,
  nextOf,
  parsePlayerCard,
  shownName,
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
import { collectionOf, ownedSet } from '../../src/ui/profile/collection';
import { crestSvg } from '../../src/ui/profile/crest';

const NOW = Date.UTC(2026, 10, 18, 12);
const info = (o: Partial<NameInfo> = {}): NameInfo => ({ name: 'Witty Biscuit', nick: null, changes: 0, free: true, price: 0, cost: 1500, cooldownDays: 7, nextAt: null, yarn: 200, ...o });
const res = (status: number, body?: unknown): ApiResult => ({ id: 'x', ok: status >= 200 && status < 300, status, body });
const row = (o: Partial<ProfileRow> = {}): ProfileRow => ({ id: 'r', at: NOW - 3600_000, hero: 'sage', outcome: 'won', k: 5, d: 2, a: 7, mode: 'ranked', grade: 'A', mvp: null, map: null, seconds: 0, ...o });
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

  it('rank: unranked (advice only for you), placements, a tier with its points bar, pips and peak, and Legend', () => {
    expect(rankView(null)).toMatchObject({ tier: 'none', label: 'Unranked', line: 'Play Ranked to get a rank.' });
    // another player's: no advice aimed at the viewer
    expect(rankView(null, false).line).toBe('No ranked games this season.');
    expect(rankView({ placementsLeft: 5, placementsOf: 5 }, false, true).label).toBe('Unranked');
    expect(rankView({ placementsLeft: 2, placementsOf: 5 })).toMatchObject({ tier: 'placements', line: '3 of 5 placement matches played', progress: 0.6 });
    const r = rankView({ placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42, peak: 'Alley III' });
    expect(r).toMatchObject({ tier: 'tabby', label: 'Tabby II', line: '42 / 100 pts', progress: 0.42, pips: 2, peak: 'Alley III' });
    // the peak badge hides when it is the current rank
    expect(rankView({ placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42, peak: 'Tabby II' }).peak).toBeNull();
    expect(rankView({ placementsLeft: 0, placementsOf: 5, tierIdx: 12, points: 240 })).toMatchObject({ tier: 'legend', label: 'Legend', progress: null });
  });

  it('crests: one distinct shape per tier', () => {
    const tiers = ['none', 'placements', 'kitten', 'tabby', 'alley', 'lion', 'legend'] as const;
    const svgs = tiers.map((t) => crestSvg(t).replace(/pfx-cg-[a-z]+|data-crest="[a-z]+"|#[0-9a-f]{6}/g, ''));
    expect(new Set(svgs).size).toBe(tiers.length);
    expect(crestSvg('legend')).toContain('data-crest="legend"');
  });

  it("names: a signed-in player is never 'Guest'; another player's public card is checked", () => {
    expect(shownName({ self: true, signedIn: false, name: '' })).toBe('Guest');
    expect(shownName({ self: true, signedIn: true, name: 'Guest' })).toBe('Your profile');
    expect(shownName({ self: true, signedIn: true, name: 'Mira' })).toBe('Mira');
    expect(shownName({ self: false, signedIn: true, name: '' })).toBe('Player');
    expect(parsePlayerCard(null)).toBeNull();
    const c = parsePlayerCard({ matches: 31, ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 7, points: 40, peak: 'Alley I' }, av: { i: 'h:pixel', f: 'frame.store.moonlit', t: 'title.store.moonlit' }, cc: 'LT' })!;
    expect(c).toMatchObject({ matches: 31, none: false, cc: 'LT', ranked: { tierIdx: 7, points: 40 } });
    expect(parsePlayerCard({ matches: -3, ranked: { placementsLeft: 5, placementsOf: 5, none: true }, cc: 'lt<' })).toMatchObject({ matches: 0, none: true, cc: null });
  });

  it('collection: one source of truth (entitlements plus what the server says is worn)', () => {
    const own = ownedSet(['coat.sage.store_silver_tabby', 'frame.store.goldpaw'], { title: 'title.founder', frame: null });
    const c = collectionOf(own);
    expect(c.coats.filter((e) => e.owned).map((e) => e.id)).toEqual(['coat.sage.store_silver_tabby']);
    expect(c.coats.length).toBeGreaterThan(20);
    expect(c.coats[0].owned).toBe(true);
    expect(c.frames.filter((e) => e.owned).map((e) => e.id)).toEqual(['frame.store.goldpaw']);
    // a worn title the catalogue does not list (Founder) still counts as owned
    expect(c.titles.filter((e) => e.owned).map((e) => e.id)).toEqual(['title.founder']);
    expect(c.titles.find((e) => e.id === 'title.founder')!.name).toBe('Founder');
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
    expect(rowOf({ id: 'a', at: 5, hero: 'sage', outcome: 'won', k: 1, d: 2, a: 3, mode: 'pvp', grade: '<b>', mvp: 'mvp', map: 'hearthwood', seconds: 754 })).toMatchObject({ grade: null, mvp: 'mvp', mode: 'pvp', map: 'hearthwood', seconds: 754 });
    expect(rowOf({ hero: 'sage', outcome: 'won', map: '<x>', seconds: -4 })).toMatchObject({ map: null, seconds: 0 });
    expect(duration(754)).toBe('12:34');
    expect(duration(0)).toBe('');
    expect(collectionCounts(['coat.a', 'coat.b', 'frame.store.goldpaw', 'title.founder', 'coat.a'])).toEqual({ coats: 2, frames: 1, titles: 1 });
    expect(wearableFrames(['frame.store.goldpaw', 'frame.bad', 'frame.legend'])).toEqual(['none', 'frame.store.goldpaw', 'frame.legend']);
    expect(tabsFor(true)).toContain('account');
    expect(tabsFor(false)).not.toContain('account');
  });
});

describe('round 3 model', () => {
  it('highlights: only what was earned (streak, best match, MVPs, M7, thumbs-up)', () => {
    const d = emptyData(true, 'A');
    expect(highlightsOf(d)).toEqual([]);
    const rows = [row({ at: 1, outcome: 'won', k: 2, a: 1 }), row({ at: 2, outcome: 'won', k: 9, d: 1, a: 4 }), row({ at: 3, outcome: 'lost', k: 0, a: 0 }), row({ at: 4, outcome: 'won' })];
    const h = highlightsOf({ ...d, rows, stats: statsOfRows(rows), mastery: { sage: { m: 300, w: 200, level: 7 } }, kudos: 3 });
    expect(h.map((x) => x.k)).toEqual(['streak', 'best', 'maxed', 'kudos']);
    expect(h.find((x) => x.k === 'best')!.value).toBe('9/1/4');
  });

  it('honor: the next chest tier and the way to it', () => {
    expect(honorView(7, [5, 15, 30])).toMatchObject({ next: 15, opened: 1 });
    expect(honorView(7, [5, 15, 30]).pct).toBeCloseTo(0.2);
    expect(honorView(40, [5, 15, 30])).toMatchObject({ next: null, pct: 1, opened: 3 });
    expect(honorView(0, [])).toMatchObject({ next: null, opened: 0 });
  });

  it('the history cursor is checked', () => {
    expect(nextOf({ next: 'abc' })).toBe('abc');
    expect(nextOf({ next: '' })).toBeNull();
    expect(nextOf(null)).toBeNull();
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

function open(o: { data?: Partial<ProfileData>; friend?: ProfileScreenOpts['friend']; set?: ApiResult; get?: NameInfo; hist?: ApiResult; fail?: boolean | string[]; noApi?: boolean; tab?: ProfileScreenOpts['tab']; items?: string[]; player?: unknown; extra?: Record<string, (args?: Record<string, unknown>) => ApiResult>; more?: Partial<ProfileScreenOpts> } = {}) {
  const calls: { op: string; args: unknown }[] = [];
  let cur = o.get ?? info();
  let failing: boolean | string[] = o.fail ?? false;
  const api = vi.fn(async (op: string, args?: Record<string, unknown>): Promise<ApiResult> => {
    calls.push({ op, args });
    if (failing === true || (Array.isArray(failing) && failing.includes(op))) return res(0);
    if (op === 'name.get') return res(200, cur);
    if (op === 'social.get') return res(200, { me: { code: 'PL-7KQ2-M9XR', name: cur.name, av: { i: 'h:sage' }, title: 'title.founder', frame: null } });
    if (op === 'ranked.me') return res(200, { ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 4, points: 42 } });
    if (op === 'history.list')
      return (
        o.hist ??
        res(200, { owner: { name: o.friend ? 'Mira Real' : cur.name, self: !o.friend }, rows: [{ id: 'a', at: NOW - 60_000, mode: 'ranked', map: 'hearthwood', seconds: 754, hero: 'lambo', outcome: 'won', k: 7, d: 2, a: 9, grade: 'S', mvp: 'mvp' }], next: null, stats: { name: 'Season 1', matches: 24, wins: 14, winRate: 58, kda: 3.4, mvp: 5, favourites: [{ hero: 'lambo', matches: 10, wins: 7, winRate: 70 }] }, ...(o.friend && o.player !== undefined ? { player: o.player } : {}) })
      );
    if (op === 'name.set') {
      if (o.set) return o.set;
      cur = info({ name: String(args?.name), nick: String(args?.name), changes: 1, free: false, price: 1500 });
      return res(200, { ...cur, paid: 0 });
    }
    if (op === 'social.me') return res(200, { me: { av: { i: `h:${args?.avatarRef ?? 'sage'}` }, title: args?.title ?? null, frame: args?.frame ?? null } });
    if (op === 'club.get') return res(200, { club: { code: 'C1', name: 'Night Owls', size: 3, cap: 30, owner: false, thread: 't', tier: 'text', members: [], chest: {} }, kudos: { month: '2026-11', endsAt: '', n: 7, tiers: [5, 15, 30], paid: [5], got: [], next: { id: 'x', name: 'x' } } });
    if (o.extra?.[op]) return o.extra[op](args);
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
    ...(o.items ? { items: () => o.items! } : {}),
    message: vi.fn(),
    invite: vi.fn(),
    onName,
    suggest: () => 'Zyg',
    now: () => NOW,
    ...o.more,
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
    // the favourite champion's splash stands behind the whole screen
    expect(q('.pfx-backdrop').innerHTML).toContain('lambo-');
    expect(q('.pfx-recent').textContent).toContain('Lambo');
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
    expect(q('[data-testid="profile-note"]').textContent).toBe('Saved');
  });

  it("failed loads: each card says it couldn't load (never an empty state), the name is never 'Guest', Try again reloads", async () => {
    const t = open({ fail: true, data: { name: '' } });
    await flush();
    expect(q('[data-testid="profile-name"]').textContent).toBe('Your profile');
    expect(q('.pfx-rank').textContent).toMatch(/Couldn't load your rank/);
    expect(q('.pfx-rank').textContent).not.toMatch(/Unranked|Play Ranked/);
    expect(q('.pfx-recent').textContent).toMatch(/Couldn't load matches/);
    expect(q('.pfx-recent').textContent).not.toMatch(/No matches yet/);
    expect(q('.pfx-top').textContent).not.toMatch(/Play matches to earn/);
    expect(q('.pfx-season').textContent).toMatch(/Couldn't load/);
    t.unfail();
    q('[data-testid="profile-failed"] [data-a="retry"]').click();
    await flush();
    expect(document.querySelectorAll('[data-testid="profile-failed"]')).toHaveLength(0);
    expect(q('[data-testid="profile-rank"]').textContent).toBe('Tabby II');
    expect(q('[data-testid="profile-name"]').textContent).toBe('Witty Biscuit');
  });

  it('one failed source keeps the others: ranked down, the rest shown; a retry asks only for what failed', async () => {
    const t = open({ fail: ['ranked.me'] });
    await flush();
    expect(q('.pfx-rank').textContent).toMatch(/Couldn't load/);
    expect(q('.pfx-recent').textContent).toContain('Victory');
    t.unfail();
    const before = t.calls.length;
    q('.pfx-rank [data-a="retry"]').click();
    await flush();
    expect(t.calls.slice(before).map((c) => c.op)).toEqual(['ranked.me']);
  });

  it('Collection and Overview agree: the worn Founder title is owned, and the counts match the items', async () => {
    open({ items: ['coat.sage.store_silver_tabby', 'frame.store.goldpaw', 'title.store.goldpaw'], tab: 'collection' });
    await flush();
    expect(q('[data-testid="profile-count-titles"]').textContent).toMatch(/^2 \//);
    expect(q('[data-testid="profile-count-coats"]').textContent).toMatch(/^1 \//);
    expect(q('[data-testid="profile-count-frames"]').textContent).toMatch(/^1 \//);
    expect(q('[data-a="wear"][data-id="title.founder"]').getAttribute('aria-pressed')).toBe('true');
    expect(q('.pfx-coat.own')).not.toBeNull();
    expect(q('.pfx-coat:not(.own) .pfx-lock')).not.toBeNull();
  });

  it('tabs follow the ARIA pattern: one Tab stop, arrows, Home and End', async () => {
    open();
    await flush();
    const tabs = [...document.querySelectorAll<HTMLElement>('.cst-tab')];
    expect(tabs.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    tabs[0].focus();
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('matches');
    expect((document.activeElement as HTMLElement).dataset.tab).toBe('matches');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('account');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('overview');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('account');
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('overview');
  });

  it("another player's profile: read-only, their history by code inline on Matches, a row opens that match", async () => {
    const t = open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira', av: { i: 'h:howler' } }, tab: 'matches' });
    await flush();
    expect(t.calls.map((c) => c.op)).toEqual(['history.list']);
    expect(t.calls[0].args).toEqual({ code: 'PL-AAAA-BBBB' });
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('matches');
    expect(q('[data-testid="profile-tab-account"]')).toBeNull();
    expect(q('[data-testid="profile-edit"]')).toBeNull();
    // no Recordings for someone else (they are this device's)
    expect(q('[data-testid="profile-recordings"]')).toBeNull();
    q('[data-testid="profile-match-list"] [data-a="match"]').click();
    expect(t.openHistory).toHaveBeenCalledWith({ code: 'PL-AAAA-BBBB', name: 'Mira Real' }, 'a');
  });

  it("Match history shows once on another player's Overview: no banner button, the card links to the Matches tab", async () => {
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira' } });
    await flush();
    expect(q('[data-testid="profile-history"]')).toBeNull();
    expect(document.querySelectorAll('.pfx-who [data-a="history"]')).toHaveLength(0);
    q('[data-testid="open-history"]').click();
    expect(q('[data-testid="profile-screen"]').dataset.tab).toBe('matches');
  });

  it('a player who is not a friend: Add friend by code, Block asked once', async () => {
    const t = open({ friend: { code: 'PL-AAAA-BBBB', name: 'Rex' }, extra: { 'friend.add': () => res(201, { state: 'sent' }), 'block.add': () => res(200, {}) } });
    await flush();
    expect(q('[data-testid="profile-message"]')).toBeNull();
    q('[data-testid="profile-add-friend"]').click();
    await flush();
    expect(t.calls.find((c) => c.op === 'friend.add')?.args).toEqual({ code: 'PL-AAAA-BBBB' });
    expect(q('[data-testid="profile-request-sent"]').textContent).toBe('Request sent');
    q('[data-testid="profile-block"]').click();
    expect(t.calls.some((c) => c.op === 'block.add')).toBe(false);
    q('[data-testid="profile-block-yes"]').click();
    await flush();
    expect(t.calls.find((c) => c.op === 'block.add')?.args).toEqual({ code: 'PL-AAAA-BBBB' });
    expect(q('[data-testid="profile-blocked"]')).not.toBeNull();
    // a refused request says why and offers the button again
    document.body.innerHTML = '';
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Rex' }, extra: { 'friend.add': () => res(403, { code: 'PAWLEGENDS_SOCIAL_REFUSED' }) } });
    await flush();
    q('[data-testid="profile-add-friend"]').click();
    await flush();
    expect(q('[data-testid="profile-note"]').textContent).toBe("You can't add this player.");
    expect(q('[data-testid="profile-add-friend"]')).not.toBeNull();
  });

  it('Matches tab: the full history pages inline (Show more sends the cursor), mode filters ask again, rows open the detail', async () => {
    let n = 0;
    const page = (id: string, next: string | null) => res(200, { owner: { name: 'Witty Biscuit', self: true }, rows: [{ id, at: NOW - 60_000 - n * 1000, mode: 'pvp', hero: 'sage', outcome: 'lost', k: 1, d: 4, a: 2 }], next });
    const t = open({ tab: 'matches', hist: page('a', 'cur1'), extra: {} });
    await flush();
    // the harness's history.list is fixed; swap it for paging
    (t.calls as unknown[]).length = 0;
    const api = vi.fn(async (op: string, args?: Record<string, unknown>) => {
      t.calls.push({ op, args });
      n++;
      return args?.before ? page('b', null) : page('c', 'cur2');
    });
    document.body.innerHTML = '';
    const data: ProfileData = { ...emptyData(true, 'W'), signedIn: true, level: levelInfo(5) };
    const openHistory = vi.fn();
    profileScreen(document.body, { data, tab: 'matches', api: api as never, base: '/', onClose: vi.fn(), signIn: vi.fn(), openHistory, openSettings: vi.fn(), now: () => NOW });
    await flush();
    expect(document.querySelectorAll('[data-testid="profile-match-list"] [data-a="match"]')).toHaveLength(1);
    q('[data-testid="profile-more"]').click();
    await flush();
    expect(t.calls.find((c) => (c.args as { before?: string } | undefined)?.before)?.args).toEqual({ before: 'cur2' });
    expect(document.querySelectorAll('[data-testid="profile-match-list"] [data-a="match"]')).toHaveLength(2);
    expect(q('[data-testid="profile-more"]')).toBeNull();
    q('[data-a="filter"][data-f="ranked"]').click();
    await flush();
    expect(t.calls.at(-1)?.args).toEqual({ mode: 'ranked' });
    expect(q('[data-a="filter"][data-f="ranked"]').getAttribute('aria-pressed')).toBe('true');
    q('[data-testid="profile-match-list"] [data-a="match"]').click();
    expect(openHistory).toHaveBeenCalledWith(null, 'c');
  });

  it("your Matches tab lists this device's recordings with Watch; device rows open as local matches", async () => {
    const watch = vi.fn();
    open({ noApi: true, tab: 'matches', data: { signedIn: false, rows: [row({ id: 'dev1' })], replays: [{ id: 'dev1', at: NOW - 5000, hero: 'sage', outcome: 'won', best: 'Triple Pounce' }] }, more: { watch } });
    await flush();
    expect(q('[data-testid="profile-recordings"]').textContent).toContain('Triple Pounce');
    q('[data-testid="profile-watch"]').click();
    expect(watch).toHaveBeenCalledWith('dev1');
    document.body.innerHTML = '';
    const t = open({ noApi: true, tab: 'matches', data: { signedIn: false, rows: [row({ id: 'dev1' })] } });
    await flush();
    expect(q('[data-testid="profile-recordings"]').textContent).toMatch(/No replays yet/);
    q('[data-testid="profile-match-list"] [data-a="match"]').click();
    expect(t.openHistory).toHaveBeenCalledWith(null, 'local:dev1');
  });

  it('Stats with no matches: one empty state with Play your first match, not five empty cards', async () => {
    const play = vi.fn();
    const t = open({ tab: 'stats', hist: res(200, { owner: { name: 'W', self: true }, rows: [], next: null, stats: { name: 'Season 1', matches: 0, wins: 0, winRate: null, kda: 0, mvp: 0, favourites: [] } }), more: { play } });
    await flush();
    expect(q('[data-testid="profile-stats-empty"]')).not.toBeNull();
    expect(document.querySelectorAll('.pfx-sgrid .pfx-card')).toHaveLength(0);
    q('[data-testid="profile-play-first"]').click();
    expect(play).toHaveBeenCalled();
    expect(t.onClose).toHaveBeenCalled();
  });

  it('Stats read newest first like the Overview, and say Lost and Deaths', async () => {
    const rows = [row({ id: '1', at: NOW - 3000, outcome: 'lost' }), row({ id: '2', at: NOW - 1000, outcome: 'won' }), row({ id: '3', at: NOW - 2000, outcome: 'won' })];
    open({ noApi: true, tab: 'stats', data: { signedIn: false, rows } });
    await flush();
    const bars = [...document.querySelectorAll<HTMLElement>('.pfx-formbars span[data-r]:not([data-r=""])')].map((b) => b.dataset.r);
    expect(bars).toEqual(['W', 'W', 'L']);
    expect(bars).toEqual(formOf(rows, 10));
    expect(q('.pfx-wr').textContent).toContain('Lost');
    expect(q('.pfx-wr').textContent).not.toContain('Not won');
    expect(q('.pfx-per').textContent).toContain('Deaths');
  });

  it("Overview: honor (this month's thumbs-up toward the chest, the club), the ranked ladder, and highlights", async () => {
    open({ data: { mastery: { lambo: { m: 40, w: 30, level: 5 } } } });
    await flush();
    expect(q('[data-testid="profile-kudos"]').textContent).toBe('7');
    expect(q('.pfx-honor').textContent).toContain('8 more for the next monthly chest');
    expect(q('.pfx-honor').textContent).toContain('Night Owls');
    expect(q('.pfx-ladder [aria-current="true"]').textContent).toBe('Tabby');
    expect(q('.pfx-hl').textContent).toContain('MVPs');
    expect(q('.pfx-hl').textContent).toContain('Thumbs-up');
  });

  it("the Pass: a failed host load says Couldn't load (never 'once it loads'); none yet says so plainly", async () => {
    open({ fail: true });
    await flush();
    expect(q('.pfx-pass').textContent).toMatch(/Couldn't load the Pass/);
    expect(q('.pfx-pass').textContent).not.toMatch(/once it loads/);
    document.body.innerHTML = '';
    open();
    await flush();
    expect(q('.pfx-pass').textContent).toMatch(/No Season XP yet/);
    document.body.innerHTML = '';
    open({ more: { pass: () => ({ tier: 4, tiers: 30, pct: 0.5, xp: 800, premium: false, name: 'Season 1: First Paws' }) } });
    await flush();
    expect(q('.pfx-pass').textContent).toContain('4 / 30');
  });

  it('Edit profile: no pink Change without the Yarn, labelled Icon / Border / Title groups, a title saves with the look', async () => {
    const t = open({ get: info({ name: 'Mira', nick: 'Mira', changes: 1, free: false, price: 1500, yarn: 922 }), items: ['title.store.goldpaw', 'frame.store.goldpaw'] });
    await flush();
    q('[data-testid="profile-edit"]').click();
    const change = q('[data-testid="profile-nick-change"]') as HTMLButtonElement;
    expect(change.disabled).toBe(true);
    expect(change.classList.contains('ghost')).toBe(true);
    expect(q('[data-testid="profile-earn"]')).not.toBeNull();
    expect(q('[data-testid="profile-borders"]').textContent).toContain('Goldpaw');
    expect(document.querySelectorAll('[data-testid="profile-picker"] [aria-pressed="true"]')).toHaveLength(1);
    q('[data-a="pick-title"][data-id="title.store.goldpaw"]').click();
    q('[data-testid="profile-avatar-save"]').click();
    await flush();
    expect(t.calls.find((c) => c.op === 'social.me')?.args).toMatchObject({ title: 'title.store.goldpaw' });
  });

  it('Account: Manage account is the pink primary, Sign out a ghost, Delete a red link', async () => {
    const sent: string[] = [];
    open({ tab: 'account', more: { account: { model: { signedIn: true, name: 'Pat', provider: 'google', isApp: false }, send: (a) => void sent.push(a) } } });
    await flush();
    expect(q('[data-testid="account-manage"]').classList.contains('ghost')).toBe(false);
    expect(q('[data-testid="account-sign-out"]').classList.contains('ghost')).toBe(true);
    expect(q('[data-testid="profile-delete"]').getAttribute('href')).toBe('https://pawlegends.app/account');
    q('[data-testid="account-sign-out"]').click();
    expect(sent).toEqual(['sign-out']);
  });

  it("another player's card: their rank, level, flag, title and border; Message and Invite for a friend", async () => {
    open({
      friend: { code: 'PL-AAAA-BBBB', name: 'Mira', friend: true },
      player: { matches: 31, ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 7, points: 40, peak: 'Alley I' }, av: { i: 'h:pixel', f: 'frame.store.moonlit', t: 'title.store.moonlit' }, cc: 'LT' },
    });
    await flush();
    expect(q('[data-testid="profile-rank"]').textContent).toBe('Alley II');
    expect(q('[data-testid="profile-peak"]').textContent).toBe('Best: Alley I');
    expect(q('[data-testid="profile-level"]').textContent).toMatch(/^Lv \d+/);
    expect(q('[data-testid="profile-flag-shown"]')).not.toBeNull();
    expect(q('[data-testid="profile-title"]').textContent).toBe('Moonlit');
    expect(q('[data-testid="profile-message"]')).not.toBeNull();
    expect(q('[data-testid="profile-invite"]')).not.toBeNull();
    // never ranked: Unranked without advice aimed at the viewer
    document.body.innerHTML = '';
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira' }, player: { matches: 3, ranked: { placementsLeft: 5, placementsOf: 5, none: true } } });
    await flush();
    expect(q('.pfx-rank').textContent).toContain('No ranked games this season.');
    expect(q('.pfx-rank').textContent).not.toMatch(/Play Ranked/);
    expect(q('[data-testid="profile-message"]')).toBeNull();
    // an older backend sends no card: the rank card hides rather than guessing
    document.body.innerHTML = '';
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira' } });
    await flush();
    expect(q('.pfx-rank')).toBeNull();
    // mastery unknown for another player: no "Score 0" chips; played counts read whole
    q('[data-testid="profile-tab-champions"]').click();
    expect(q('.pfx-pane').textContent).not.toMatch(/Mastery score|M7/);
    expect(q('.pfx-played').textContent).toBe('10 played · 70% won');
  });

  it("a private history says so", async () => {
    open({ friend: { code: 'PL-AAAA-BBBB', name: 'Mira' }, hist: res(403, { code: 'PAWLEGENDS_HISTORY_PRIVATE' }) });
    await flush();
    expect(q('.pfx-recent').textContent).toMatch(/private/);
  });

  it('device only (no host): local rows, Back closes', async () => {
    const t = open({ noApi: true, data: { signedIn: false, rows: [row(), row({ outcome: 'lost' })] } });
    await flush();
    expect(q('.pfx-season h3').textContent).toMatch(/^This season\s*this device$/);
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
