// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../src/embed/api';
import { API_ARG_KEYS, API_OPS } from '../../src/embed/api';
import type { HistoryEntry } from '../../src/replay/store';
import { SIM_VERSION } from '../../src/sim/version';
import { errText, filterOfLocal, historySheet, localKey, matchHtml, mergeRows, modeLabel, seasonHtml, type ServerMatch, type ServerPage, type ServerRow } from '../../src/ui/history/historySheet';

/* MATCH-HISTORY.md: the Wild Rift style history on the client: the account's rows merged with the device's replays,
   filters, season numbers, a match's two teams and damage graph, a friend's history and its privacy answers. */

const NOW = Date.UTC(2026, 10, 14, 12);

const local = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'l1',
  at: NOW - 60_000,
  hero: 'sage',
  heroName: null,
  mode: 'skirmish',
  difficulty: 'normal',
  outcome: 'won',
  grade: 'A',
  k: 3,
  d: 1,
  a: 4,
  seconds: 400,
  simVersion: SIM_VERSION,
  replay: true,
  key: 'aaaa0001:12000',
  ...over,
});

const srow = (over: Partial<ServerRow> = {}): ServerRow => ({
  id: '0123456789abcdef01234567',
  at: NOW - 60_000,
  mode: 'skirmish',
  map: 'crossing',
  mutator: null,
  difficulty: 'normal',
  outcome: 'won',
  seconds: 400,
  hero: 'sage',
  k: 3,
  d: 1,
  a: 4,
  grade: 'A',
  mvp: 'mvp',
  key: 'aaaa0001:12000',
  ...over,
});

const player = (slot: number, over: Partial<ServerMatch['players'][number]> = {}) => ({
  slot,
  team: (slot < 3 ? 0 : 1) as 0 | 1,
  hero: ['sage', 'clem', 'gabe', 'brutus', 'pixel', 'nugget'][slot],
  name: null,
  bot: true,
  owner: false,
  level: 9,
  k: 1,
  d: 1,
  a: 1,
  damage: 1000 * (slot + 1),
  taken: 800,
  tower: 300,
  heal: 0,
  fish: 1500,
  toys: 2,
  cs: 20,
  grade: 'B',
  ...over,
});

const match = (): ServerMatch => ({
  ...srow(),
  slot: 0,
  winner: 0,
  mvpSlot: 0,
  svpSlot: 4,
  reason: 'core',
  players: [player(0, { bot: false, owner: true, name: '<b>Me</b>' }), player(1, { bot: false, name: 'Friend Cat' }), player(2), player(3), player(4), player(5)],
});

const ok = (body: unknown): ApiResult => ({ id: 'x', ok: true, status: 200, body });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('match history: ops and helpers', () => {
  it('the three ops and their args are in the shared list', () => {
    expect(API_OPS).toEqual(expect.arrayContaining(['history.list', 'history.match', 'history.privacy']));
    expect(API_ARG_KEYS).toEqual(expect.arrayContaining(['match', 'visibility', 'mode', 'before', 'code']));
  });

  it('mode labels and filters', () => {
    expect(modeLabel({ mode: 'ranked', map: 'hearthwood', mutator: null })).toBe('Ranked 5v5');
    expect(modeLabel({ mode: 'pvp', map: 'crossing', mutator: null })).toBe('PvP 3v3');
    expect(modeLabel({ mode: 'arcade', map: 'crossing', mutator: 'duel' })).toBe('Duel');
    expect(modeLabel({ mode: 'classic', map: 'hearthwood', mutator: null })).toBe('Classic 5v5');
    expect(filterOfLocal('practice')).toBe('arcade');
    expect(filterOfLocal('party')).toBe('ai');
  });

  it("a device row's key: its own, else its kept replay's", () => {
    expect(localKey(local())).toBe('aaaa0001:12000');
    expect(localKey(local({ key: undefined }), () => ({ finalHash: 'beef', ticks: 9 }))).toBe('beef:9');
    expect(localKey(local({ key: undefined, replay: false }), () => null)).toBeNull();
  });

  it("merges: the account's row takes the device row's replay; device-only rows inside the span; keyless legacy rows out", () => {
    const rows = mergeRows(
      [srow(), srow({ id: '0123456789abcdef01234568', at: NOW - 3_600_000, key: 'bbbb:1' })],
      [local(), local({ id: 'l2', at: NOW - 1000, key: 'cccc:2' }), local({ id: 'l3', at: NOW - 9_000_000, key: 'dddd:3' }), local({ id: 'l4', key: undefined, replay: false })],
      false,
    );
    expect(rows.map((r) => r.sid ?? r.local?.id)).toEqual(['l2', '0123456789abcdef01234567', '0123456789abcdef01234568']);
    expect(rows[1].local?.id).toBe('l1');
    // the last page: older device rows join too
    expect(mergeRows([srow()], [local({ id: 'l3', at: NOW - 9_000_000, key: 'dddd:3' })], true).map((r) => r.local?.id ?? r.sid)).toContain('l3');
  });

  it('season numbers and the empty season', () => {
    const html = seasonHtml({ season: 's1', name: 'Season 1: First Paws', matches: 12, wins: 7, winRate: 58, kda: 3.25, mvp: 2, favourites: [{ hero: 'sage', matches: 5, wins: 4, winRate: 80 }] });
    expect(html).toContain('58%');
    expect(html).toContain('3.3');
    expect(html).toContain('80%');
    expect(seasonHtml({ season: 's1', name: 'S1', matches: 0, wins: 0, winRate: null, kda: 0, mvp: 0, favourites: [] })).toContain('No matches this season');
  });

  it('a match: two teams, bots labelled, names escaped, MVP and SVP, the damage graph', () => {
    const html = matchHtml(match(), NOW, 'l1');
    document.body.innerHTML = html;
    expect(document.querySelectorAll('.mh-team')).toHaveLength(2);
    expect(document.querySelectorAll('.mh-team[data-team="0"] tbody tr')).toHaveLength(3);
    expect(document.querySelectorAll('.mh-bot').length).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('<b>Me</b>');
    expect(html).toContain('&lt;b&gt;Me&lt;/b&gt;');
    expect(document.querySelector('.mh-team[data-team="0"] .mh-mvp.mvp')).toBeTruthy();
    expect(document.querySelector('.mh-team[data-team="1"] .mh-mvp.svp')).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="history-damage"] .mh-grow')).toHaveLength(6);
    expect(document.querySelector('[data-testid="history-watch"]')?.getAttribute('data-watch')).toBe('l1');
  });

  it('privacy and error lines', () => {
    expect(errText({ id: 'x', ok: false, status: 403, body: { code: 'PAWLEGENDS_HISTORY_PRIVATE' } }, 'Mochi')).toBe('Mochi keeps their match history private.');
    expect(errText({ id: 'x', ok: false, status: 0 }, null)).toMatch(/connection/);
  });
});

describe('match history: the sheet', () => {
  it('yours: the account rows, season, filters, a match opens with Watch; Back and Escape', async () => {
    const page: ServerPage = { owner: { name: 'Me', self: true }, rows: [srow()], next: null, stats: { season: 's1', name: 'Season 1', matches: 1, wins: 1, winRate: 100, kda: 7, mvp: 1, favourites: [] }, visibility: 'friends' };
    const api = vi.fn(async (op: string, args?: Record<string, unknown>) => (op === 'history.list' ? ok(page) : op === 'history.match' ? ok(match()) : ok({ visibility: args?.visibility })));
    const onWatch = vi.fn();
    const onClose = vi.fn();
    document.body.innerHTML = '';
    const el = historySheet(document.body, { rows: [local()], now: NOW, api: api as never, signedIn: true, onWatch, onClose });
    await flush();
    expect(api).toHaveBeenCalledWith('history.list', {});
    expect(el.querySelectorAll('.mh-row')).toHaveLength(1);
    expect(el.querySelector('[data-testid="history-winrate"]')?.textContent).toBe('100%');
    expect(el.querySelector('.mh-row .mh-mvp.mvp')).toBeTruthy();
    expect(el.querySelector('.mh-row .mh-watch')).toBeTruthy();
    // privacy
    const sel = el.querySelector<HTMLSelectElement>('[data-testid="history-privacy"]')!;
    sel.value = 'me';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(api).toHaveBeenCalledWith('history.privacy', { visibility: 'me' });
    // a filter asks the server
    el.querySelector<HTMLElement>('[data-filter="ranked"]')!.click();
    await flush();
    expect(api).toHaveBeenCalledWith('history.list', { mode: 'ranked' });
    el.querySelector<HTMLElement>('[data-filter="all"]')!.click();
    await flush();
    // open the match
    el.querySelector<HTMLElement>('.mh-row .mh-main')!.click();
    await flush();
    expect(api).toHaveBeenCalledWith('history.match', { match: '0123456789abcdef01234567' });
    expect(el.querySelector('[data-testid="history-match"]')).toBeTruthy();
    // tabs
    el.querySelector<HTMLElement>('[data-tab="damage"]')!.click();
    expect(el.querySelector<HTMLElement>('[data-pane="damage"]')!.hidden).toBe(false);
    expect(el.querySelector<HTMLElement>('[data-pane="board"]')!.hidden).toBe(true);
    // Escape goes back to the list, a second closes
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.querySelector('[data-testid="history-match"]')).toBeNull();
    expect(el.querySelectorAll('.mh-row')).toHaveLength(1);
    el.querySelector<HTMLElement>('.mh-row .mh-watch')!.click();
    expect(onWatch).toHaveBeenCalledWith('l1');
    expect(onClose).toHaveBeenCalled();
    expect(el.isConnected).toBe(false);
  });

  it('no connection: the device rows, as before', async () => {
    const api = vi.fn(async () => ({ id: 'x', ok: false, status: 0 }) as ApiResult);
    document.body.innerHTML = '';
    const el = historySheet(document.body, { rows: [local()], now: NOW, api: api as never, onWatch: () => undefined, onClose: () => undefined });
    await flush();
    expect(el.querySelectorAll('.mh-row')).toHaveLength(1);
    expect(el.textContent).toContain('Saved on this device');
    expect(el.querySelector('[data-filter]')).toBeNull();
  });

  it("a friend's: by code, no Watch, no privacy; a private history says so", async () => {
    const page: ServerPage = { owner: { name: 'Mochi', self: false }, rows: [srow({ key: undefined })], next: null };
    const api = vi.fn(async () => ok(page));
    document.body.innerHTML = '';
    const el = historySheet(document.body, { rows: [local()], now: NOW, api: api as never, friend: { code: 'PL-7KQ2-M9XR', name: 'Mochi' }, signedIn: true, onWatch: () => undefined, onClose: () => undefined });
    await flush();
    expect(api).toHaveBeenCalledWith('history.list', { code: 'PL-7KQ2-M9XR' });
    expect(el.querySelector('h2')?.textContent).toBe("Mochi's history");
    expect(el.querySelectorAll('.mh-row')).toHaveLength(1);
    expect(el.querySelector('.mh-watch')).toBeNull();
    expect(el.querySelector('[data-testid="history-privacy"]')).toBeNull();
    el.remove();
    const hidden = vi.fn(async () => ({ id: 'x', ok: false, status: 403, body: { code: 'PAWLEGENDS_HISTORY_PRIVATE' } }) as ApiResult);
    const el2 = historySheet(document.body, { now: NOW, api: hidden as never, friend: { code: 'PL-7KQ2-M9XR', name: 'Mochi' }, onWatch: () => undefined, onClose: () => undefined });
    await flush();
    expect(el2.querySelector('[data-testid="history-error"]')?.textContent).toBe('Mochi keeps their match history private.');
  });
});
