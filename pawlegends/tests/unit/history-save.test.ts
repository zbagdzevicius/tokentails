// @vitest-environment happy-dom
/**
 * Founder, Nov 19: "sometimes matches not recorded in match history ... it appears in recordings but not in matches
 * list. also I got a error 'not available' when I try to click 'watch'", then "I can't see stats of last match, only
 * watch recording".
 *
 * - Watch: a Quick Play, party or PvP match stored the MatchEnd's display stub (`inputs: ''`, `party: {...}`),
 *   which the viewer refuses as 'party' ("Replay not available"). The kept record is `party.record`; rows stored
 *   Nov 18-19 are read the same way.
 * - The last match's stats: the device row keeps both teams' scoreboard (boardOf), shown with the account's match
 *   detail (localMatch); Profile → Matches lists device rows the account does not have yet (mergeDeviceRows) with
 *   their save status (noteSave, saveLine); a Recordings card opens the same detail; an older replay says why first.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keptRecord, loadHistory, noteSave, recordMoment, replayOf, replayState, type HistoryEntry, type KVStore } from '../../src/replay/store';
import { boardOf } from '../../src/replay/board';
import { replayable, ReplayCore } from '../../src/replay/core';
import { localMatch, saveLine, serverModeOf } from '../../src/ui/history/localMatch';
import { emptyData, mergeDeviceRows, rowOf, type ProfileData, type ProfileRow } from '../../src/ui/profile/model';
import { profileScreen } from '../../src/ui/profile/profileScreen';
import { installIntegration } from '../../src/embed/integrate';
import { freshProfile, loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { Entitlements } from '../../src/money/entitlements';
import { gradeMatch } from '../../src/meta/grade';
import { SIM_VERSION, type MatchResult, type PvpReplayRecord, type ReplayRecord, type SlotStats } from '../../src/sim/index';
import type { ApiResult } from '../../src/embed/api';
import { levelInfo } from '../../src/meta/accountLevel';
import { limit } from './cpu-budget';

class Mem implements KVStore {
  m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

const NOW = Date.UTC(2026, 10, 19, 12);
const pvp = (): PvpReplayRecord => JSON.parse(readFileSync(join(__dirname, `../../../backend/src/vendor/pawlegends-sim/v${SIM_VERSION}/pvp-replay.fixture.json`), 'utf8')) as PvpReplayRecord;
/** What NetHost hands the app at a party match's end (net-host.ts maybeEnd): a v1 stub around the real record. */
const stub = (record: PvpReplayRecord | null): ReplayRecord & { party: unknown } => ({
  v: 1,
  simVersion: record?.simVersion ?? SIM_VERSION,
  seed: record?.seed ?? 1,
  difficulty: 'normal',
  hero: 'sage',
  trick: 'pounce',
  ticks: record?.ticks ?? 900,
  inputs: '',
  outcome: 'won',
  finalHash: record?.finalHash ?? '0000000a',
  mutator: 'none',
  party: { room: 'r0om12abc', slot: 3, record, scored: true, names: ['A', null, null, 'Me', null, null] },
});
const entry = (id: string, extra: Partial<HistoryEntry> = {}): Omit<HistoryEntry, 'replay'> => ({ id, at: NOW - 60_000, hero: 'sage', mode: 'pvp', difficulty: 'normal', outcome: 'won', grade: 'A', k: 3, d: 1, a: 4, seconds: 300, simVersion: SIM_VERSION, ...extra });

const stat = (slot: number, o: Partial<SlotStats> = {}): SlotStats => ({ slot, hero: (['sage', 'clem', 'lambo', 'mochi', 'ranger', 'barkula'] as const)[slot], kills: slot, deaths: 1, assists: 2, heroDamage: 1000 * (slot + 1), towerDamage: 300, level: 9, damageTaken: 800, healShield: 0, objective: 0, fish: 2000 + slot, toys: 2, lastHits: 40 + slot, toy1At: -1, toy2At: -1, toy3At: -1, toy4At: -1, ...o });
const result = (): MatchResult => ({ outcome: 'won', winner: 0, reason: 'core', ticks: 9000, finalHash: '0badc0de', stats: [0, 1, 2, 3, 4, 5].map((s) => stat(s)) });

describe('Watch: a Quick Play, party or PvP match keeps its real record', () => {
  it('the display stub was what got stored: the viewer refused it as "party"; the kept record is party.record', () => {
    const rec = pvp();
    // the bug: the stub itself is a record the viewer refuses
    expect(replayable(stub(rec) as never)).toBe('party');
    const s = new Mem();
    const row = recordMoment(entry('q1', { slot: 3 }), stub(rec) as never, s);
    expect(row.replay).toBe(true);
    const kept = replayOf('q1', s)!;
    expect(kept).toEqual(rec);
    expect(replayable(kept)).toBeNull();
    expect(replayState(row, s)).toBe('watch');
  });

  it('a row stored Nov 18-19 with the stub plays too (read through keptRecord); a stub without a record keeps none', () => {
    const rec = pvp();
    expect(keptRecord(stub(rec))).toEqual(rec);
    expect(keptRecord(stub(null))).toBeNull();
    const s = new Mem();
    s.setItem('tt.pawlegends.history.v1', JSON.stringify([{ ...entry('old'), replay: true, slot: 3 }]));
    s.setItem('tt.pawlegends.replays.v1', JSON.stringify({ old: stub(rec) }));
    expect(replayOf('old', s)).toEqual(rec);
    const none = recordMoment(entry('q2'), stub(null) as never, s);
    expect(none.replay).toBe(false);
  });

  it('the viewer core re-runs the kept record from the player seat to its saved end hash', () => {
    const rec = pvp();
    const core = new ReplayCore();
    const me = rec.humans.find((h) => h.slot >= 3)!.slot;
    expect(core.load({ ...(keptRecord(stub(rec)) as PvpReplayRecord), me })).toBeNull();
    let guard = 0;
    while (!core.info.done && guard++ < 5000) core.scoutFor(900, 1e9, () => performance.now());
    expect(core.info.ok).toBe(true);
  }, limit(120_000));

  it('a replay of another game version is "older" before the tap', () => {
    const s = new Mem();
    const rec = { ...pvp(), simVersion: SIM_VERSION - 1 };
    const row = recordMoment(entry('o1', { simVersion: SIM_VERSION - 1 }), rec, s);
    expect(replayState(row, s)).toBe('older');
  });
});

describe('the last match: its scoreboard and its save status on the device row', () => {
  it('boardOf keeps both teams, grades, MVP and SVP; localMatch gives the account match shape', () => {
    const r = result();
    const g = gradeMatch(r);
    const board = boardOf(r, g, { names: ['Me', 'x', 'y', 'z', 'w', 'v'], humans: new Set([0]), me: 0 })!;
    expect(board.players).toHaveLength(6);
    expect(board.players.filter((p) => !p.bot).map((p) => p.s)).toEqual([0]);
    expect(board.players[0]).toMatchObject({ n: 'Me', k: 0, cs: 40, f: 2000, hd: 1000, t: 0 });
    expect(board.players[4]).toMatchObject({ n: null, bot: true, t: 1 });
    expect(board.mvp).toBe(g.mvp);
    expect(board.svp).toBe(g.best[1]);
    const m = localMatch({ ...entry('b1', { mode: 'skirmish', map: 'ridge' }), replay: false, board })!;
    expect(m.players.find((p) => p.owner)?.slot).toBe(0);
    expect(m).toMatchObject({ mode: 'skirmish', map: 'ridge', winner: 0, mvpSlot: g.mvp });
    // a row from before Nov 19 has no scoreboard
    expect(localMatch({ ...entry('b2'), replay: false })).toBeNull();
    expect(serverModeOf({ mode: 'party' })).toBe('coop');
    expect(serverModeOf({ mode: 'skirmish', board: { mutator: 'cannon' } })).toBe('arcade');
  });

  it('noteSave: the row that posted the match takes every status; a late "saving" never undoes an answer', () => {
    const s = new Mem();
    recordMoment({ ...entry('s1'), save: { id: 'match-1', st: 'saving' } }, null, s);
    recordMoment({ ...entry('s2'), save: { st: 'off', why: 'practice' } }, null, s);
    expect(noteSave('other', 'saved', null, s)).toBeNull();
    expect(noteSave('match-1', 'failed', null, s)?.save).toEqual({ id: 'match-1', st: 'failed' });
    expect(noteSave('match-1', 'saved', null, s)?.save?.st).toBe('saved');
    expect(noteSave('match-1', 'saving', null, s)).toBeNull();
    expect(loadHistory(s).find((r) => r.id === 's1')?.save?.st).toBe('saved');
  });

  it('saveLine says where a save stands (nothing once saved)', () => {
    expect(saveLine({ st: 'saving' }).text).toBe('Saving…');
    expect(saveLine({ st: 'failed' }).text).toBe("Couldn't save, retrying");
    expect(saveLine({ st: 'queued' }, false).text).toMatch(/Sign in/);
    expect(saveLine({ st: 'rejected', code: 'PAWLEGENDS_SIM_VERSION' }).text).toMatch(/update/);
    expect(saveLine({ st: 'saved' }).text).toBe('');
    expect(saveLine({ st: 'saved', code: 'PAWLEGENDS_PARTY_AFK' }).text).toMatch(/bot played/);
    expect(saveLine({ st: 'off', why: 'practice' }).text).toMatch(/Practice/);
  });

  it('every host save-result reaches the app, also one for an earlier match than the results on screen', () => {
    resetProfileCache();
    saveProfile({ ...freshProfile(), sessions: 2, matches: 1 });
    document.body.innerHTML = '<div id="app"></div>';
    const handlers: ((m: unknown) => void)[] = [];
    const seen: unknown[] = [];
    const integ = installIntegration({ active: true, post: () => true, on: (h: (m: unknown) => void) => void handlers.push(h) } as never, {
      ent: new Entitlements(),
      profile: loadProfile,
      analytics: { track: () => undefined },
      onRosterChange: () => undefined,
      root: document.getElementById('app')!,
      onSaveResult: (v) => seen.push(v),
    });
    integ.nextMatchId();
    for (const h of handlers) h({ ns: 'tt-pawlegends', v: 1, type: 'save-result', matchId: 'zzzz0000', status: 'failed', catnipPaid: 0, catnipTotal: null, fastestWin: null });
    expect(seen).toEqual([{ matchId: 'zzzz0000', status: 'failed' }]);
  });
});

describe('Profile → Matches: the last match shows at once, with its full stats', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const res = (status: number, body?: unknown): ApiResult => ({ id: 'x', ok: status >= 200 && status < 300, status, body });
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
  const server = { id: 'srv1', at: NOW - 3 * 3600_000, mode: 'arcade', map: 'crossing', seconds: 400, hero: 'sage', outcome: 'lost', k: 1, d: 4, a: 2, grade: 'C', mvp: null, key: 'aaaaaaaa:9000' };

  it('mergeDeviceRows: a device row the account lacks comes first; one it has is not doubled', () => {
    const srv = [rowOf(server, 's0')!];
    const pending: ProfileRow = { ...rowOf({ ...entry('d1'), key: '0badc0de:9000' }, 'd1')! };
    const saved: ProfileRow = { ...rowOf({ ...entry('d2', { at: NOW - 3 * 3600_000 }), key: 'aaaaaaaa:9000' }, 'd2')! };
    const old: ProfileRow = { ...rowOf({ ...entry('d3', { at: NOW - 9 * 3600_000 }), key: 'bbbbbbbb:9000' }, 'd3')! };
    const m = mergeDeviceRows(srv, [pending, saved, old], false);
    expect(m.map((r) => [r.id, !!r.local])).toEqual([
      ['d1', true],
      ['srv1', false],
    ]);
    // the whole history (no next page): the older device row too
    expect(mergeDeviceRows(srv, [pending, saved, old], true).map((r) => r.id)).toEqual(['d1', 'srv1', 'd3']);
  });

  it('the newest match (not on the account yet) is listed with "Saving…" and opens both teams; Recordings opens the same detail', async () => {
    const r = result();
    const board = boardOf(r, gradeMatch(r), { names: ['Me'], humans: new Set([0]), me: 0 })!;
    const dev: HistoryEntry = { ...entry('d1', { mode: 'skirmish', map: 'ridge', key: '0badc0de:9000', board, save: { id: 'm-1', st: 'saving' } }), replay: true };
    let rows: ProfileRow[] = [rowOf(dev, dev.id)!];
    let hist = 0;
    const api = vi.fn(async (op: string): Promise<ApiResult> => {
      if (op === 'history.list') {
        hist++;
        return res(200, { owner: { name: 'Me', self: true }, rows: hist > 1 ? [{ ...server, id: 'srv2', at: NOW - 60_000, key: '0badc0de:9000', outcome: 'won', mode: 'skirmish' }, server] : [server], next: null });
      }
      return res(200, {});
    });
    const watch = vi.fn();
    const data: ProfileData = { ...emptyData(true, 'Me'), signedIn: true, level: levelInfo(3), rows, replays: [{ id: 'd1', at: dev.at, hero: 'sage', outcome: 'won', best: 'Shut down!' }, { id: 'old', at: NOW - 86_400_000, hero: 'clem', outcome: 'lost', best: null, older: true }] };
    const panel = profileScreen(document.body, {
      data,
      tab: 'matches',
      api: api as never,
      base: '/',
      onClose: vi.fn(),
      signIn: vi.fn(),
      openHistory: vi.fn(),
      openSettings: vi.fn(),
      watch,
      localMatch: (id) => (id === 'd1' ? { row: rows[0], match: localMatch(dev), watch: 'watch' } : null),
      deviceRows: () => rows,
      now: () => NOW,
    });
    await flush();
    const list = () => [...document.querySelectorAll<HTMLElement>('[data-testid="profile-match-list"] [data-a="match"]')];
    expect(list().map((b) => b.dataset.id)).toEqual(['local:d1', 'srv1']);
    expect(list()[0].querySelector('[data-testid="profile-row-save"]')?.textContent).toBe('Saving…');
    // the row opens the full detail: both teams, Watch inside
    list()[0].click();
    await flush();
    expect(document.querySelectorAll('[data-testid="history-match"] tr[data-slot]')).toHaveLength(6);
    expect(q('[data-testid="history-save"]').textContent).toBe('Saving…');
    q('[data-testid="history-watch"]').click();
    expect(watch).toHaveBeenCalledWith('d1');
    // a recording card opens the same detail; an older one says why, with no Watch
    document.body.innerHTML = '';
    const p2 = profileScreen(document.body, { data: { ...data, rows: [...rows] }, tab: 'matches', base: '/', onClose: vi.fn(), signIn: vi.fn(), openHistory: vi.fn(), openSettings: vi.fn(), watch, localMatch: (id) => (id === 'd1' ? { row: rows[0], match: localMatch(dev), watch: 'watch' } : null), now: () => NOW });
    expect(document.querySelectorAll('[data-testid="profile-rec"]')).toHaveLength(2);
    expect(q('[data-testid="profile-rec-older"]').textContent).toBe('Older version');
    expect(document.querySelectorAll('[data-testid="profile-watch"]')).toHaveLength(1);
    q('[data-testid="profile-rec"][data-id="local:d1"] .pfx-oc').click();
    expect(document.querySelectorAll('[data-testid="history-match"] tr[data-slot]')).toHaveLength(6);
    p2.close();
    // the save lands: the screen asks the account again and lists its row once (no doubled match)
    document.body.innerHTML = '';
    const p3 = profileScreen(document.body, { data: { ...data, rows: [...rows] }, tab: 'matches', api: api as never, base: '/', onClose: vi.fn(), signIn: vi.fn(), openHistory: vi.fn(), openSettings: vi.fn(), deviceRows: () => rows, now: () => NOW });
    await flush();
    rows = [{ ...rows[0], save: { id: 'm-1', st: 'saved' } } as ProfileRow];
    p3.refresh();
    await flush();
    expect(list().map((b) => b.dataset.id)).toEqual(['srv2', 'srv1']);
    p3.close();
    panel.close();
  });
});
