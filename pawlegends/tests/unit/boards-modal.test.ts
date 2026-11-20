// @vitest-environment happy-dom
/**
 * The leaderboards window (founder Nov 20: "top by Account Level (global), top in my country, Cats VS Dogs total wins
 * visual cool representation, Top Ranked"; then "let's show Global ... Country to see which country is #1 OR what's my
 * #"): the Global, Country (Top countries / My country), Cats vs Dogs and Ranked tabs; the last tab remembered;
 * my own row shown once (on the list when I am on the page, else pinned under it, in the same row style); Esc and the
 * scrim close it; the tug-of-war math.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { boardKinds, boardView, countriesView, openBoards, readBoardKind, readCountryScope, rollValue, rowMetric, sidesView, splitPct } from '../../src/social/boardsModal';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = '';
});

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const ok = (body: unknown): ApiResult => ({ id: 'x', ok: true, status: 200, body });

function sheet(answer: (op: string, args: any) => ApiResult | null, signedIn = true) {
  const calls: { op: string; args: any }[] = [];
  const api = vi.fn(async (op: string, args?: any): Promise<ApiResult> => {
    calls.push({ op, args });
    return answer(op, args) ?? ok({});
  });
  const track = vi.fn();
  const onClose = vi.fn();
  const h = openBoards(document.body, { api: api as never, signedIn: () => signedIn, track, onClose, source: 'home' });
  return { h, calls, track, onClose };
}

const levelRows = { period: 'all', page: 0, pages: 1, rows: [{ rank: 1, name: 'Mira', value: 15, m: 61, cc: 'LV' }, { rank: 2, name: 'Sunny', value: 6, m: 12 }] };

describe('the window', () => {
  it('a modal dialog named Leaderboards on Level; leaderboard_open with the tab; Esc closes it, focus goes back', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { h, track, onClose, calls } = sheet((op) => (op === 'board.get' ? ok(levelRows) : null));
    const dlg = document.querySelector('.pl-boards')!;
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById('pl-boards-h')!.textContent).toBe('Leaderboards');
    expect(track).toHaveBeenCalledWith('leaderboard_open', { source: 'home', tab: 'level' });
    await flush();
    expect(calls[0]!.args).toEqual({ kind: 'level', page: 0, name: 'me' });
    expect(track).toHaveBeenCalledWith('board_view', { kind: 'level' });
    expect(document.querySelector('.pl-bd .pl-social-name')!.textContent).toBe('Mira');
    expect(document.querySelector('.pl-bd .pl-bd-metric')!.textContent).toBe('Lv 1561 matches');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(h.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="boards-modal"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the scrim and the close button close it; the pager loads the next page', async () => {
    const { calls } = sheet((op, args) => (op === 'board.get' ? ok({ rows: [{ rank: args.page * 20 + 1, name: 'A', value: 3, m: 4 }], page: args.page, pages: 5 }) : null));
    await flush();
    document.querySelector<HTMLElement>('[data-a="next"]')!.click();
    await flush();
    expect(calls.filter((c) => c.op === 'board.get').map((c) => c.args.page)).toEqual([0, 1]);
    expect(document.querySelector('.pl-pager small')!.textContent).toBe('2/5');
    document.querySelector<HTMLElement>('.pl-boards-scrim')!.click();
    expect(document.querySelector('[data-testid="boards-modal"]')).toBeNull();
    const again = sheet((op) => (op === 'board.get' ? ok({ rows: [], page: 0, pages: 1 }) : null));
    document.querySelector<HTMLElement>('.pl-boards-x')!.click();
    expect(again.h.closed).toBe(true);
  });

  it('an error says so and Try again reloads', async () => {
    let fail = true;
    const { calls } = sheet((op) => (op === 'board.get' ? (fail ? { id: 'x', ok: false, status: 0 } : ok(levelRows)) : null));
    await flush();
    expect(document.querySelector('[data-testid="board-error"]')!.textContent).toBe('No connection. Try again.');
    fail = false;
    document.querySelector<HTMLElement>('[data-a="retry"]')!.click();
    await flush();
    expect(calls).toHaveLength(2);
    expect(document.querySelectorAll('.pl-bd')).toHaveLength(2);
  });
});

describe('tabs', () => {
  it('Global, Country, Cats vs Dogs, Ranked; Global by default; the last one used is remembered', async () => {
    expect(boardKinds()).toEqual(['level', 'country', 'sides', 'ranked']);
    expect(readBoardKind()).toBe('level');
    localStorage.setItem('pl.boards.tab', 'sides');
    expect(readBoardKind()).toBe('sides');
    localStorage.setItem('pl.boards.tab', 'weekly');
    expect(readBoardKind()).toBe('level');
    localStorage.clear();
    const { calls } = sheet((op) => (op === 'board.get' ? ok(levelRows) : null));
    await flush();
    expect([...document.querySelectorAll('.pl-boards-sub .pl-btn')].map((b) => b.textContent)).toEqual(['Global', 'Country', 'Cats vs Dogs', 'Ranked']);
    document.querySelector<HTMLElement>('[data-board="ranked"]')!.click();
    await flush();
    // Ranked is the season ladder (`global`)
    expect(calls.map((c) => c.args.kind)).toEqual(['level', 'global']);
    expect(localStorage.getItem('pl.boards.tab')).toBe('ranked');
  });

  it('signed out: Country asks to sign in without a call; the others load without `me`', async () => {
    localStorage.setItem('pl.boards.tab', 'country');
    const { calls } = sheet((op) => (op === 'board.get' ? ok(levelRows) : null), false);
    await flush();
    expect(calls).toHaveLength(0);
    expect(document.querySelector('[data-testid="board-country-why"]')!.textContent).toMatch(/Sign in to see the top players in your country/);
    document.querySelector<HTMLElement>('[data-board="level"]')!.click();
    await flush();
    expect(calls[0]!.args).toEqual({ kind: 'level', page: 0 });
    expect(document.querySelector('.pl-bd-note')!.textContent).toMatch(/Guests are not ranked/);
  });
});

describe('rows', () => {
  it('the metric: the level badge with matches, the ranked tier with points', () => {
    expect(rowMetric('level', { rank: 1, name: 'A', value: 15, m: 61 })).toEqual({ main: 'Lv 15', sub: '61 matches' });
    expect(rowMetric('country', { rank: 1, name: 'A', value: 1, m: 1 })).toEqual({ main: 'Lv 1', sub: '1 match' });
    expect(rowMetric('ranked', { rank: 1, name: 'A', value: 1240, tier: 'Alley II' })).toEqual({ main: 'Alley II', sub: '1,240 pts' });
  });

  it('no pinned row when I am on the page (marked me by the server)', () => {
    const v = boardView({ rows: [{ rank: 1, name: 'Zygis', value: 0, me: true }, { rank: 2, name: 'Angelinnaa', value: 0 }], me: { rank: 1, value: 0 } });
    expect(v.pinned).toBeNull();
    expect(v.rows.filter((r) => r.me)).toHaveLength(1);
  });

  it('an older server (no me mark): my rank and name on the page still means no pinned row', () => {
    const v = boardView({ rows: [{ rank: 1, name: 'Zygis', value: 0 }], me: { rank: 1, value: 0, name: 'Zygis' } });
    expect(v.pinned).toBeNull();
    expect(v.rows[0]!.me).toBe(true);
  });

  it('off the page: one pinned row with my avatar, flag, name and metric', async () => {
    const av = { i: 'h:clem' };
    const v = boardView({ rows: [{ rank: 1, name: 'A', value: 9 }], me: { rank: 140, value: 3, m: 5, name: 'Zygis', cc: 'LT', av } });
    expect(v.pinned).toEqual({ rank: 140, name: 'Zygis', value: 3, m: 5, tier: undefined, av, cc: 'LT', over: false, me: true });
    expect(boardView({ rows: [], me: null }).pinned).toBeNull();
    sheet((op) => (op === 'board.get' ? ok({ ...levelRows, me: { rank: 140, value: 3, m: 5, name: 'Zygis', cc: 'LT' } }) : null));
    await flush();
    const pin = document.querySelector('[data-testid="board-pinned"]')!;
    expect(pin.textContent).toContain('#140');
    expect(pin.textContent).toContain('Lv 3');
    expect(document.querySelectorAll('.pl-bd.me')).toHaveLength(1);
  });
});

describe('Country', () => {
  const countries = {
    rows: [
      { rank: 1, cc: 'LT', players: 4, levels: 23, me: true },
      { rank: 2, cc: 'LV', players: 1, levels: 18 },
    ],
    mine: null,
    total: 2,
  };
  const answer = { period: 'all', rows: [{ rank: 1, name: 'Zygis', value: 8, m: 18, cc: 'LT', me: true }, { rank: 2, name: 'Irvidas', value: 8, m: 19, cc: 'LT' }], me: { rank: 1, value: 8, m: 18 }, page: 0, pages: 1, local: { cc: 'LT', hidden: false }, countries };

  it('Top countries by default: #1 crowned with its total level, my country marked; My country is one tap, no reload', async () => {
    localStorage.setItem('pl.boards.tab', 'country');
    expect(readCountryScope()).toBe('top');
    const { calls, track } = sheet((op) => (op === 'board.get' ? ok(answer) : null));
    await flush();
    expect(calls).toHaveLength(1);
    expect([...document.querySelectorAll('[data-scope]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Top countries', 'true'],
      ['My country', 'false'],
    ]);
    expect(document.querySelector('[data-testid="board-country-lead"]')!.textContent).toContain('Lithuania is #1');
    const rows = [...document.querySelectorAll('[data-testid="board-countries"] .pl-bd-cc')];
    expect(rows.map((r) => r.getAttribute('data-cc'))).toEqual(['LT', 'LV']);
    expect(rows[0]!.classList.contains('first')).toBe(true);
    expect(rows[0]!.classList.contains('me')).toBe(true);
    expect(rows[0]!.textContent).toContain('23 Lv');
    expect(rows[0]!.textContent).toContain('4 players');
    expect(rows[1]!.textContent).toContain('1 player');
    expect(document.querySelector('.pl-boards-foot')!.hasAttribute('hidden')).toBe(true);
    document.querySelector<HTMLElement>('[data-scope="mine"]')!.click();
    await flush();
    expect(calls).toHaveLength(1);
    expect(localStorage.getItem('pl.boards.country')).toBe('mine');
    expect(track).toHaveBeenCalledWith('board_view', { kind: 'country' });
    expect(document.querySelector('[data-testid="board-country-head"]')!.textContent).toContain('Lithuania');
    expect([...document.querySelectorAll('.pl-bd .pl-social-name')].map((n) => n.textContent)).toEqual(['Zygis', 'Irvidas']);
  });

  it('countriesView: my country below the list is pinned once; junk dropped; no answer is empty', () => {
    const v = countriesView({ countries: { rows: [{ rank: 1, cc: 'LV', players: 9, levels: 80 }, { rank: 2, cc: 'xx', players: 1, levels: 1 }], mine: { rank: 57, cc: 'LT', players: 1, levels: 8 } } });
    expect(v.rows.map((r) => r.cc)).toEqual(['LV']);
    expect(v.leader!.cc).toBe('LV');
    expect(v.pinned).toEqual({ rank: 57, cc: 'LT', players: 1, levels: 8, me: true });
    expect(countriesView({ countries: { rows: [{ rank: 1, cc: 'LT', players: 1, levels: 8, me: true }], mine: { rank: 1, cc: 'LT', players: 1, levels: 8 } } }).pinned).toBeNull();
    expect(countriesView(null)).toEqual({ rows: [], pinned: null, leader: null });
  });

  it('a pinned country under the list', async () => {
    localStorage.setItem('pl.boards.tab', 'country');
    sheet((op) => (op === 'board.get' ? ok({ ...answer, countries: { rows: [{ rank: 1, cc: 'LV', players: 9, levels: 80 }], mine: { rank: 57, cc: 'LT', players: 1, levels: 8 }, total: 57 } }) : null));
    await flush();
    const pin = document.querySelector('[data-testid="board-pinned"]')!;
    expect(pin.textContent).toContain('#57');
    expect(pin.textContent).toContain('Lithuania');
  });

  it('the flag and country over the rows of my country; below its top 100 my rank shows 100+', async () => {
    localStorage.setItem('pl.boards.country', 'mine');
    localStorage.setItem('pl.boards.tab', 'country');
    const { calls } = sheet((op) =>
      op === 'board.get'
        ? ok({ period: 'all', rows: [{ rank: 1, name: 'Irvidas', value: 12, m: 40, cc: 'LT' }], me: { rank: 101, over: true, value: 2, m: 3, name: 'Zygis', cc: 'LT' }, page: 0, pages: 1, local: { cc: 'LT', hidden: false } })
        : null,
    );
    await flush();
    expect(calls[0]!.args).toMatchObject({ kind: 'country', name: 'me' });
    expect(document.querySelector('[data-testid="board-country-head"]')!.textContent).toContain('Lithuania');
    const pin = document.querySelector('[data-testid="board-pinned"]')!;
    expect(pin.textContent).toContain('#100+');
  });

  it('a hidden flag: says why and one tap shows the flag, then the board loads', async () => {
    localStorage.setItem('pl.boards.country', 'mine');
    let hidden = true;
    const { calls } = sheet((op) => {
      if (op === 'flag.set') {
        hidden = false;
        return ok({ cc: 'LT', hideFlag: false });
      }
      if (op === 'board.get')
        return hidden
          ? ok({ rows: [], me: null, page: 0, pages: 1, local: { cc: 'LT', hidden: true } })
          : ok({ rows: [{ rank: 1, name: 'Zygis', value: 10, m: 30, cc: 'LT', me: true }], me: { rank: 1, value: 10, m: 30 }, page: 0, pages: 1, local: { cc: 'LT', hidden: false } });
      return null;
    });
    await flush();
    document.querySelector<HTMLElement>('[data-board="country"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="board-country-why"]')!.textContent).toMatch(/Show your flag to join your country's board/);
    document.querySelector<HTMLElement>('[data-testid="board-show-flag"]')!.click();
    await flush();
    expect(calls.some((c) => c.op === 'flag.set' && c.args?.hideFlag === false)).toBe(true);
    expect(document.querySelector('[data-testid="board-country-why"]')).toBeNull();
    expect(document.querySelectorAll('.pl-bd.me')).toHaveLength(1);
  });

  it('an unknown country and an empty country board explain themselves', async () => {
    localStorage.setItem('pl.boards.tab', 'country');
    localStorage.setItem('pl.boards.country', 'mine');
    sheet((op) => (op === 'board.get' ? ok({ rows: [], me: null, page: 0, pages: 1, local: { cc: null, hidden: false } }) : null));
    await flush();
    expect(document.querySelector('[data-testid="board-country-why"]')!.textContent).toMatch(/don't know your country/);
    document.body.innerHTML = '';
    sheet((op) => (op === 'board.get' ? ok({ rows: [], me: null, page: 0, pages: 1, local: { cc: 'LV', hidden: false } }) : null));
    await flush();
    expect(document.querySelector('.pl-social-empty')!.textContent).toMatch(/No players from Latvia yet/);
  });
});

describe('Cats vs Dogs', () => {
  const sides = {
    season: { id: 's1', name: 'Season 1', cat: 520, dog: 480 },
    all: { cat: 1000, dog: 3000 },
    week: { id: '2026-W47', cat: 55, dog: 45 },
    lastWeek: { id: '2026-W46', cat: 52, dog: 48 },
    mine: { cat: 12, dog: 4 },
  };

  it('the math: whole percents that add to 100, the lead line, the trend and my split', () => {
    expect(splitPct({ cat: 1, dog: 2 })).toEqual({ cat: 33, dog: 67 });
    expect(splitPct({ cat: 0, dog: 0 })).toEqual({ cat: 50, dog: 50 });
    const v = sidesView(sides, 'season');
    expect(v).toMatchObject({ catPct: 52, dogPct: 48, lead: 'cat', headline: 'CATS LEAD by 4%', catShare: 0.52, empty: false });
    expect(v.trend).toBe('This week: Cats 55% · up 3 from last week');
    expect(v.mine).toBe('Your wins this season: 12 as a cat, 4 as a dog');
    expect(sidesView(sides, 'all')).toMatchObject({ catPct: 25, dogPct: 75, headline: 'DOGS LEAD by 50%' });
    expect(sidesView({ season: { cat: 5, dog: 5 } }, 'season')).toMatchObject({ headline: 'DEAD EVEN', trend: null, mine: null });
    expect(sidesView({}, 'season')).toMatchObject({ empty: true, catShare: 0.5, headline: expect.stringMatching(/No wins yet this season/) });
    expect(sidesView({ season: { cat: 1, dog: 1 }, week: { cat: 1, dog: 3 }, lastWeek: { cat: 1, dog: 1 } }, 'season').trend).toBe('This week: Dogs 75% · up 25 from last week');
  });

  it('the counters roll up with an ease-out and land on the number', () => {
    expect(rollValue(0, 1000, 0)).toBe(0);
    expect(rollValue(0, 1000, 0.5)).toBe(875);
    expect(rollValue(0, 1000, 1)).toBe(1000);
    expect(rollValue(1000, 400, 2)).toBe(400);
  });

  it('the tab: the bar at the split, the counters, the period toggle without a second call', async () => {
    localStorage.setItem('pl.boards.tab', 'sides');
    const { calls } = sheet((op) => (op === 'board.get' ? ok(sides) : null));
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args).toEqual({ kind: 'sides', name: 'me' });
    const cvd = document.querySelector<HTMLElement>('[data-testid="cvd"]')!;
    expect(cvd.style.getPropertyValue('--cat')).toBe('52.00%');
    expect(cvd.classList.contains('cat')).toBe(true);
    expect(document.querySelector('[data-testid="cvd-lead"]')!.textContent).toBe('CATS LEAD by 4%');
    expect(document.querySelector('[data-n="cat"]')!.getAttribute('data-to')).toBe('520');
    expect(document.querySelector('[data-testid="cvd-mine"]')!.textContent).toMatch(/12 as a cat/);
    expect(document.querySelector('.pl-cvd-stage')!.getAttribute('aria-label')).toBe('Season 1: cats 520 wins, dogs 480 wins');
    expect(document.querySelector('.pl-boards-foot')!.hasAttribute('hidden')).toBe(true);
    document.querySelector<HTMLElement>('[data-range="all"]')!.click();
    expect(calls).toHaveLength(1);
    expect(document.querySelector('[data-testid="cvd-lead"]')!.textContent).toBe('DOGS LEAD by 50%');
    expect(document.querySelector('[data-range="all"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('reduced motion: the counters show the final numbers at once', async () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      localStorage.setItem('pl.boards.tab', 'sides');
      sheet((op) => (op === 'board.get' ? ok(sides) : null));
      await flush();
      expect(document.querySelector('[data-n="cat"]')!.textContent).toBe('520');
      expect(document.querySelector('[data-testid="cvd"]')!.classList.contains('in')).toBe(true);
    } finally {
      window.matchMedia = mm;
    }
  });
});
