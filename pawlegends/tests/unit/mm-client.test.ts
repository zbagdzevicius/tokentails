import { describe, expect, it } from 'vitest';
import { initialParty, isStranger, reduceParty, screenOf, type PartyEffect, type PartyEvent, type PartyState } from '../../src/party/partyClient';
import type { PartyView, ServerJson } from '../../src/net/proto';

/*
 * Quick Play co-op M1a (docs/plans/moba/M1A-IMPL.md §5.5, §5.6, §6, §9.3): `reduceParty` in queue mode. One tap sends
 * `mm.join` after `welcome`; status, found, cancel, the backfill offer and `seat_taken`; the search survives a relay
 * restart; Play again re-queues with the same side; a PROTO 1 relay hides Quick Play.
 */

const welcome = (proto = 2): ServerJson => ({ t: 'welcome', proto, member: 'a', resumeToken: 'tok', serverMs: 0 });
const status = (over: Partial<Extract<ServerJson, { t: 'mm.status' }>> = {}): ServerJson => ({ t: 'mm.status', queue: 'coop', side: 'any', waitedMs: 3000, estimateMs: 15_000, found: 1, ...over });
const mmView = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: '',
  phase: 'pick',
  leader: 'a',
  difficulty: 'normal',
  openSeats: false,
  locked: true,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: true, conn: 'on', slot: 0 },
    { id: 'b', name: 'Brave Sage', guest: true, conn: 'on', slot: 1 },
  ],
  you: 'a',
  deadlineMs: 30_000,
  mm: { side: 'dog', strangers: true },
  ...over,
});
const friendView = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'lobby',
  leader: 'a',
  difficulty: 'easy',
  openSeats: false,
  locked: false,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' },
    { id: 'b', name: 'Brave Sage', guest: true, conn: 'on' },
  ],
  you: 'a',
  ...over,
});

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
const sent = (fx: PartyEffect[]) => fx.filter((f): f is Extract<PartyEffect, { t: 'send' }> => f.t === 'send').map((f) => f.msg);

describe('Quick Play client (M1a)', () => {
  it('one tap: the queue card shows at once (before the socket opens); welcome sends mm.join with the side', () => {
    const s0 = initialParty('queue', null, 'dog');
    expect(screenOf(s0)).toBe('queue');
    expect(s0.queue).toMatchObject({ side: 'dog', stopped: null, status: null });
    const { s, fx } = run(s0, welcome());
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'dog' }]);
    expect(fx.some((f) => f.t === 'decide-later')).toBe(false);
    expect(s.mmOk).toBe(true);
    // a stray decide sends nothing more
    expect(sent(run(s, { e: 'decide' }).fx)).toEqual([]);
  });

  it('mm.status updates the card; the side follows the relay', () => {
    const { s } = run(initialParty('queue'), welcome(), status({ found: 2, side: 'cat', lowPriorityMs: 60_000, warn: 'leaver' }));
    expect(screenOf(s)).toBe('queue');
    expect(s.queue?.status).toEqual({ waitedMs: 3000, estimateMs: 15_000, found: 2, lowPriorityMs: 60_000, warn: 'leaver' });
    expect(s.queue?.side).toBe('cat');
  });

  it('mm.found holds "Match found", then the pick (side fixed) takes over', () => {
    const r = run(initialParty('queue'), welcome(), status(), { t: 'mm.found', side: 'dog', humans: 2, bots: 1, difficulty: 'normal' });
    expect(r.fx).toContainEqual({ t: 'found-hold' });
    expect(r.s.found).toEqual({ side: 'dog', humans: 2, bots: 1, difficulty: 'normal' });
    // the party view in pick follows in the same flush: the card still holds the strip
    const p = run(r.s, mmView());
    expect(screenOf(p.s)).toBe('queue');
    expect(isStranger(p.s.view)).toBe(true);
    const shown = run(p.s, { e: 'found-shown' });
    expect(screenOf(shown.s)).toBe('pick');
    expect(shown.s.found?.humans).toBe(2);
  });

  it('a stranger view has no code and does not close the client', () => {
    const { s, fx } = run(initialParty('queue'), welcome(), mmView());
    expect(fx.some((f) => f.t === 'close')).toBe(false);
    expect(s.view?.code).toBe('');
    expect(screenOf(s)).toBe('pick');
  });

  it('Cancel sends mm.leave and clears the search', () => {
    const { s, fx } = run(initialParty('queue'), welcome(), status(), { e: 'unqueue' });
    expect(sent(fx).map((m) => m.t)).toEqual(['mm.join', 'mm.leave']);
    expect(s.queue).toBeNull();
  });

  it('away for 60 s: the card says so and Search again re-queues with the same side', () => {
    const r = run(initialParty('queue', null, 'cat'), welcome(), status({ side: 'cat' }), { t: 'mm.cancel', reason: 'away' });
    expect(screenOf(r.s)).toBe('queue');
    expect(r.s.queue?.stopped).toBe('away');
    const again = run(r.s, { e: 'queue', side: r.s.queue!.side });
    expect(sent(again.fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'cat' }]);
    expect(again.s.queue?.stopped).toBeNull();
  });

  it('a relay restart keeps the search: mm.cancel{server} then the reconnect re-sends mm.join', () => {
    const r = run(initialParty('queue', null, 'dog'), welcome(), status({ side: 'dog' }), { t: 'mm.cancel', reason: 'server' });
    expect(r.s.queue?.stopped).toBeNull();
    expect(screenOf(r.s)).toBe('queue');
    const back = run(r.s, welcome());
    expect(sent(back.fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'dog' }]);
  });

  it('mm.cancel{server} asks for the watchdog: with no restart welcome the client searches again by itself', () => {
    const r = run(initialParty('queue', null, 'cat'), welcome(), status({ side: 'cat' }), { t: 'mm.cancel', reason: 'server' });
    expect(r.fx.some((f) => f.t === 'server-wait')).toBe(true);
    // the watchdog dispatches `queue` again on the same socket: mm.join goes out
    const again = run(r.s, { e: 'queue', side: 'cat' });
    expect(sent(again.fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'cat' }]);
  });

  it('a search the relay refuses for the party (party_busy) stops with Search again, never spins', () => {
    const r = run(initialParty('queue'), welcome(), { t: 'error', code: 'party_busy' });
    expect(r.s.queue?.stopped).toBe('party');
    expect(screenOf(r.s)).toBe('queue');
  });

  it('back mode (a stranger\'s closed tab): decide sends mm.back; party_not_found closes quietly', () => {
    const w = run(initialParty('back'), welcome(), { e: 'decide' });
    expect(sent(w.fx)).toEqual([{ t: 'mm.back' }]);
    const gone = run(w.s, { t: 'error', code: 'party_not_found' });
    expect(gone.fx.some((f) => f.t === 'close')).toBe(true);
    // a PROTO 1 relay has no mm.back: close
    const old = run(initialParty('back'), welcome(1), { e: 'decide' });
    expect(old.fx.some((f) => f.t === 'close')).toBe(true);
  });

  it('mm_locked and server_busy stop the search with a wait (never the party retry-start)', () => {
    const locked = run(initialParty('queue'), welcome(), { t: 'error', code: 'mm_locked', retryMs: 45_000 });
    expect(locked.s.queue).toMatchObject({ stopped: 'locked', retryMs: 45_000 });
    const busy = run(initialParty('queue'), welcome(), { t: 'error', code: 'server_busy', retryMs: 15_000 });
    expect(busy.s.queue?.stopped).toBe('busy');
    expect(busy.fx.some((f) => f.t === 'retry-start')).toBe(false);
  });

  it('a PROTO 1 relay: Play online stops with "update" and sends nothing', () => {
    const { s, fx } = run(initialParty('queue'), welcome(1));
    expect(sent(fx)).toEqual([]);
    expect(s.mmOk).toBe(false);
    expect(s.queue?.stopped).toBe('update');
  });

  it('the backfill offer: Join answers yes, Keep searching no, a timeout nothing (analytics either way)', () => {
    const offer: ServerJson = { t: 'mm.backfill.offer', offer: 'abcdef123456', side: 'cat', clockS: 42, score: [0, 0], expiresMs: 10_000 };
    const r = run(initialParty('queue'), welcome(), status(), offer);
    expect(r.s.offer).toMatchObject({ id: 'abcdef123456', clockS: 42 });
    expect(r.fx).toContainEqual({ t: 'track', event: 'mm_backfill_offer', props: { clock_s: 42, ahead: false } });
    const yes = run(r.s, { e: 'offer', yes: true });
    expect(sent(yes.fx)).toEqual([{ t: 'mm.backfill', offer: 'abcdef123456', yes: true }]);
    expect(yes.s.offer).toBeNull();
    const no = run(r.s, { e: 'offer', yes: false });
    expect(sent(no.fx)).toEqual([{ t: 'mm.backfill', offer: 'abcdef123456', yes: false }]);
    const late = run(r.s, { e: 'offer', yes: null });
    expect(sent(late.fx)).toEqual([]);
    expect(late.fx).toContainEqual({ t: 'track', event: 'mm_backfill_join', props: { answer: 'timeout', clock_s: 42 } });
  });

  it('seat_taken (even mid-match): the match ends, the ended screen says why; a later left frame never closes it', () => {
    let s: PartyState = { ...run(initialParty('queue'), welcome(), mmView({ phase: 'match' })).s, inMatch: true };
    const r = run(s, { t: 'error', code: 'seat_taken' });
    expect(r.fx).toContainEqual({ t: 'seat-taken' });
    expect(r.s.inMatch).toBe(false);
    expect(screenOf(r.s)).toBe('ended');
    s = r.s;
    const left = run(s, { ...mmView(), left: true } as unknown as ServerJson);
    expect(left.fx.some((f) => f.t === 'close')).toBe(false);
    // Play online from the ended screen
    const again = run(s, { e: 'queue', side: 'any' });
    expect(screenOf(again.s)).toBe('queue');
    expect(sent(again.fx)[0]).toMatchObject({ t: 'mm.join' });
  });

  it('Play again after the match: the stranger re-queues; the relay moving it out of the party keeps the card', () => {
    let s = run(initialParty('queue', null, 'dog'), welcome(), mmView({ phase: 'results' })).s;
    const again = run(s, { e: 'queue', side: 'dog', requeue: true });
    expect(sent(again.fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'dog' }]);
    expect(again.s.queue?.requeue).toBe(true);
    s = again.s;
    const left = run(s, { ...mmView(), left: true } as unknown as ServerJson);
    expect(left.fx.some((f) => f.t === 'close')).toBe(false);
    expect(left.s.view).toBeNull();
    expect(screenOf(left.s)).toBe('queue');
  });

  it('a friend party: the leader queues it; members see the card from the view; a cancel goes back to the lobby', () => {
    let s = run(initialParty('create'), welcome(), friendView()).s;
    const q = run(s, { e: 'queue', side: 'any' });
    expect(sent(q.fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'any' }]);
    expect(q.s.queue?.party).toBe(true);
    expect(screenOf(q.s)).toBe('queue');
    // a party frame from before the relay marked the queue does not end the search
    s = run(q.s, friendView()).s;
    expect(s.queue).not.toBeNull();
    s = run(s, friendView({ queue: { sinceMs: 2000, side: 'any' } }), status({ found: 2 })).s;
    expect(screenOf(s)).toBe('queue');
    const cancel = run(s, { t: 'mm.cancel', reason: 'party' }, friendView());
    expect(cancel.s.queue).toBeNull();
    expect(screenOf(cancel.s)).toBe('lobby');
    expect(cancel.fx.some((f) => f.t === 'note')).toBe(true);
    // a member (not the leader) sees the card from the view alone
    const member = run(initialParty('join', 'K7QX2M'), welcome(), friendView({ you: 'b', queue: { sinceMs: 5000, side: 'cat' } })).s;
    expect(screenOf(member)).toBe('queue');
    expect(member.queue?.side).toBe('cat');
  });

  it('a host friend party matched with a stranger: the friends keep their code, the stranger sees none', () => {
    const friend = mmView({ code: 'K7QX2M', you: 'a' });
    const stranger = mmView({ you: 'b' });
    expect(isStranger(friend)).toBe(false);
    expect(isStranger(stranger)).toBe(true);
    expect(isStranger(friendView())).toBe(false);
  });
});
