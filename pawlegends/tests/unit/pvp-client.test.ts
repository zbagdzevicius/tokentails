import { describe, expect, it } from 'vitest';
import { initialParty, reduceParty, screenOf, seatsOf, type PartyEffect, type PartyEvent, type PartyState } from '../../src/party/partyClient';
import type { PartyView, ServerJson } from '../../src/net/proto';
import { queueCardHtml } from '../../src/party/ui/queueCard';
import { acceptCardHtml } from '../../src/party/ui/acceptCard';
import { loadingHtml } from '../../src/party/ui/partyLoading';
import { pickHtml } from '../../src/party/ui/partyPick';
import { onlineMode, setOnlineMode } from '../../src/meta/partyPrefs';
import * as camHeight from '../../src/render/camera/height';
import { voteNote } from '../../src/app/mpHud';

/*
 * Casual PvP M1b on the client (docs/plans/moba/V16.md §5): `reduceParty` in casual mode (PROTO 3), the Accept card,
 * the 45 s move to co-op with Keep waiting, a dodge, the void screen; the pick hides the other team; the loading
 * shows both; the equal-view zoom cap; the remake vote chip.
 */

const welcome = (proto = 3): ServerJson => ({ t: 'welcome', proto, member: 'a', resumeToken: 'tok', serverMs: 0 });
type Ev = ServerJson | PartyEvent;
const run = (s: PartyState, ...evs: Ev[]) => {
  const fx: PartyEffect[] = [];
  for (const ev of evs) {
    const r = reduceParty(s, 'e' in ev ? ev : { e: 'server', m: ev });
    s = r.state;
    fx.push(...r.effects);
  }
  return { s, fx };
};
const sent = (fx: PartyEffect[]) => fx.filter((f) => f.t === 'send').map((f) => (f as { msg: unknown }).msg);

const found: ServerJson = {
  t: 'mm.found',
  mode: 'casual',
  match: 'abcdefghijkl',
  side: 'dog',
  humans: 2,
  bots: 1,
  difficulty: 'hard',
  teams: [
    [2, 1],
    [1, 2],
  ],
  acceptByMs: 10_000,
};

const pvpView = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: '',
  phase: 'pick',
  leader: 'a',
  difficulty: 'hard',
  openSeats: false,
  locked: true,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: true, conn: 'on', slot: 3, hero: 'brutus', locked: true },
    { id: 'b', name: 'Brave Sage', guest: true, conn: 'on', slot: 4 },
    { id: 'c', name: 'Quick Paws', guest: true, conn: 'on', slot: 0 },
  ],
  you: 'a',
  deadlineMs: 30_000,
  mm: { side: 'dog', strangers: true, mode: 'casual', team: 1, species: ['cat', 'dog'] },
  ...over,
});

describe('casual PvP client', () => {
  it('Play PvP sends mm.join casual after a PROTO 3 welcome; a PROTO 2 relay stops it with "update"', () => {
    const { s, fx } = run(initialParty('queue', null, 'any', 'casual'), welcome());
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'casual', side: 'any' }]);
    expect(s.pvpOk).toBe(true);
    const old = run(initialParty('queue', null, 'any', 'casual'), welcome(2));
    expect(sent(old.fx)).toEqual([]);
    expect(old.s.queue?.stopped).toBe('update');
  });

  it('a casual status shows both teams; at 45 s "playing Co-op vs bots" with Keep waiting, which re-sends casual', () => {
    let { s } = run(initialParty('queue', null, 'any', 'casual'), welcome(), { t: 'mm.status', queue: 'casual', side: 'any', waitedMs: 5000, estimateMs: 30_000, found: 2, teams: [2, 1] });
    expect(s.queue).toMatchObject({ mode: 'casual', theirs: 1, toCoop: false });
    const html = queueCardHtml({ side: 'any', waitedS: 5, estimateS: 30, found: 2, lowPriorityS: 0, warn: false, party: false, stopped: null, retryS: 0, match: null, offer: null, pvp: { theirs: 1, toCoop: false, requeued: false } });
    expect(html).toContain('data-mode="pvp"');
    expect(html).toContain('data-theirs="1"');
    ({ s } = run(s, { t: 'mm.status', queue: 'coop', side: 'any', waitedMs: 45_000, estimateMs: 5000, found: 1, from: 'casual' }));
    expect(s.queue?.toCoop).toBe(true);
    const card = queueCardHtml({ side: 'any', waitedS: 45, estimateS: 5, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: null, retryS: 0, match: null, offer: null, pvp: { theirs: 0, toCoop: true, requeued: false } });
    expect(card).toContain('No PvP players right now: playing Co-op vs bots');
    expect(card).toContain('data-testid="mm-keep"');
    const k = run(s, { e: 'keep' });
    expect(sent(k.fx)).toEqual([{ t: 'mm.join', queue: 'casual', side: 'any' }]);
    expect(k.s.queue?.toCoop).toBe(false);
  });

  it('mm.found casual opens the Accept card; Accept sends mm.accept; the pick view closes it', () => {
    let { s, fx } = run(initialParty('queue', null, 'any', 'casual'), welcome(), found);
    expect(screenOf(s)).toBe('accept');
    expect(fx.some((f) => f.t === 'accept-clock')).toBe(true);
    expect(s.accept).toMatchObject({ mine: [2, 1], theirs: [1, 2], need: 3, accepted: false });
    ({ s, fx } = run(s, { e: 'accept', yes: true }));
    expect(sent(fx)).toEqual([{ t: 'mm.accept', match: 'abcdefghijkl', yes: true }]);
    ({ s } = run(s, { t: 'mm.accepted', match: 'abcdefghijkl', yes: 2, need: 3 }));
    expect(s.accept).toMatchObject({ accepted: true, yes: 2 });
    const card = acceptCardHtml({ side: 'dog', mine: [2, 1], theirs: [1, 2], leftS: 7, totalS: 10, accepted: true, yes: 2, need: 3 });
    expect(card).toContain('2 of 3 accepted');
    ({ s } = run(s, pvpView()));
    expect(s.accept).toBeNull();
    expect(screenOf(s)).toBe('pick');
  });

  it('a decline is sent and the relay\'s mm.cancel{declined} stops the card; a newbie lock reads "PvP unlocks after 5 matches"', () => {
    let { s, fx } = run(initialParty('queue', null, 'any', 'casual'), welcome(), found, { e: 'accept', yes: false });
    expect(sent(fx).pop()).toEqual({ t: 'mm.accept', match: 'abcdefghijkl', yes: false });
    ({ s } = run(s, { t: 'mm.cancel', reason: 'declined' }));
    expect(s.queue?.stopped).toBe('declined');
    const card = queueCardHtml({ side: 'any', waitedS: 0, estimateS: null, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: 'declined', retryS: 0, match: null, offer: null, pvp: { theirs: 0, toCoop: false, requeued: false } });
    expect(card).toContain('You declined the match');
    const lock = run(initialParty('queue', null, 'any', 'casual'), welcome(), { t: 'error', code: 'mm_locked', reason: 'pvp_newbie' });
    expect(lock.s.queue?.stopped).toBe('newbie');
  });

  it('a requeue after someone else declined says so', () => {
    const { s } = run(initialParty('queue', null, 'any', 'casual'), welcome(), found, { t: 'mm.status', queue: 'casual', side: 'any', waitedMs: 31_000, estimateMs: 5000, found: 1, teams: [1, 0], requeued: true });
    expect(s.accept).toBeNull();
    expect(s.queue?.requeued).toBe(true);
  });

  it('void: the match ends and the void screen offers Play again (casual)', () => {
    let { s, fx } = run({ ...initialParty('queue'), welcomed: true, mmOk: true, pvpOk: true, inMatch: true, queue: null }, { t: 'void', reason: 'remake' });
    expect(fx.some((f) => f.t === 'voided')).toBe(true);
    expect(screenOf(s)).toBe('void');
    ({ s, fx } = run(s, { e: 'queue', side: 'any', mode: 'casual', requeue: true }));
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'casual', side: 'any' }]);
    expect(s.voided).toBe(false);
  });

  it('the pick strip shows the own team (slots 3..5) and says their picks show at loading; loading shows both', () => {
    const v = pvpView();
    const html = pickHtml({ view: v, hover: 'brutus', trick: 'hiss', secondsLeft: 20, error: null });
    expect(html).toContain('data-pvp="1"');
    expect(html).toContain('Their picks show at loading');
    expect(html).not.toContain('Quick Paws');
    const load = loadingHtml({ ...v, phase: 'loading' });
    expect(load).toContain('data-testid="pvp-load-theirs"');
    expect(load).toContain('Quick Paws');
    expect((load.match(/pp-lc bot/g) ?? []).length).toBe(3);
    expect(seatsOf(v).map((x) => x.slot).sort()).toEqual([0, 3, 4]);
  });

  it('online mode: co-op until 5 matches, then the last one used', () => {
    const store = new Map<string, string>();
    const g = globalThis as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    setOnlineMode('pvp');
    expect(onlineMode(2)).toBe('coop');
    expect(onlineMode(5)).toBe('pvp');
    setOnlineMode('coop');
    expect(onlineMode(9)).toBe('coop');
    g.localStorage = had;
  });

  it('PvP: every Camera height step applies in PvP too (no equal-view override; vision is sim-side)', () => {
    expect('setPvpEqualView' in camHeight).toBe(false);
    for (const h of camHeight.CAMERA_STEPS) expect(camHeight.heightFactor(h)).toBe(camHeight.CAMERA_HEIGHTS[h]);
    expect(camHeight.heightFactor('max')).toBe(1.4);
  });

  it('a remake vote is a Yes/No rail chip until this player voted', () => {
    const n = voteNote({ kind: 'remake', yes: [4], need: 2, leftMs: 15_000 }, 3)!;
    expect(n.title).toBe('Remake 1/2 · 15s');
    expect(n.actions?.map((a) => a.id)).toEqual(['vote-remake-yes', 'vote-remake-no']);
    expect(voteNote({ kind: 'remake', yes: [], need: 2, leftMs: 0, result: 'pass' }, 3)!.title).toBe('Remaking…');
  });
});
