import { describe, expect, it } from 'vitest';
import { JOIN_NOT_FOUND_RETRIES, JOIN_NOT_FOUND_RETRY_MS, initialParty, reduceParty, screenOf, type PartyState } from '../../src/party/partyClient';
import type { MatchMsg, PartyView, ServerJson } from '../../src/net/proto';

/* Party play P3 (MULTIPLAYER.md §5, §12 P3): the client's reducer from server frames. */

const view = (over: Partial<PartyView> = {}): PartyView => ({
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
const welcome: ServerJson = { t: 'welcome', proto: 1, member: 'a', resumeToken: 'tok', serverMs: 0 };
const run = (s: PartyState, ...ms: (ServerJson | 'decide')[]) => {
  const fx = [];
  for (const m of ms) {
    const r = reduceParty(s, m === 'decide' ? { e: 'decide' } : { e: 'server', m });
    s = r.state;
    fx.push(...r.effects);
  }
  return { s, fx };
};

describe('party client reducer (P3)', () => {
  it('create: after welcome it waits, then creates once (the first tap)', () => {
    const { s, fx } = run(initialParty('create'), welcome, 'decide', 'decide');
    expect(fx.filter((f) => f.t === 'decide-later')).toHaveLength(1);
    expect(fx.filter((f) => f.t === 'send').map((f) => (f as { msg: { t: string } }).msg.t)).toEqual(['party.create']);
    expect(screenOf(s)).toBe('connecting');
  });

  it('join by link: joins the code; the party frame shows the lobby', () => {
    const r = run(initialParty('join', 'K7QX2M'), welcome, 'decide');
    expect(r.fx).toContainEqual({ t: 'send', msg: { t: 'party.join', code: 'K7QX2M' } });
    expect(screenOf(r.s)).toBe('connecting');
    const { s } = run(r.s, view({ you: 'b' }));
    expect(screenOf(s)).toBe('lobby');
  });

  it('a resumed seat gets its party right after welcome: no create, no join', () => {
    const { s, fx } = run(initialParty('create'), welcome, view(), 'decide');
    expect(fx.some((f) => f.t === 'send')).toBe(false);
    expect(screenOf(s)).toBe('lobby');
  });

  it('resume mode without a party closes (back to the title)', () => {
    const { fx } = run(initialParty('resume'), welcome, 'decide');
    expect(fx).toContainEqual({ t: 'close' });
  });

  it('code mode shows the code boxes until a join is sent; a wrong code comes back to them with the error', () => {
    let s = initialParty('code');
    expect(screenOf(s)).toBe('joincode');
    s = run(s, welcome, 'decide').s;
    expect(screenOf(s)).toBe('joincode');
    s = reduceParty(s, { e: 'join', code: 'ABCDEF' }).state;
    expect(screenOf(s)).toBe('connecting');
    // LIVE-MATCH-DEPLOYS.md §14: a fresh connection tries again (another relay may hold it) before the boxes say so
    for (let i = 0; i < JOIN_NOT_FOUND_RETRIES; i++) {
      const r = run(s, { t: 'error', code: 'party_not_found' });
      expect(r.fx).toEqual([{ t: 'reconnect', ms: JOIN_NOT_FOUND_RETRY_MS }]);
      expect(screenOf(r.s)).toBe('connecting');
      const again = run(r.s, welcome, 'decide');
      expect(again.fx).toContainEqual({ t: 'send', msg: { t: 'party.join', code: 'ABCDEF' } });
      s = again.s;
    }
    s = run(s, { t: 'error', code: 'party_not_found' }).s;
    expect(screenOf(s)).toBe('joincode');
    expect(s.error?.code).toBe('party_not_found');
  });

  it('a closed tab resumes by its kept code: it joins again; a party that is gone closes quietly', () => {
    const { s, fx } = run(initialParty('resume', 'K7QX2M'), welcome, 'decide');
    expect(fx).toContainEqual({ t: 'send', msg: { t: 'party.join', code: 'K7QX2M' } });
    const gone = reduceParty(s, { e: 'server', m: { t: 'error', code: 'party_ended' } });
    expect(gone.effects).toContainEqual({ t: 'close' });
  });

  it('an expired link shows "This party has ended" (never a bare not found)', () => {
    const { s } = run(initialParty('join', 'K7QX2M'), welcome, 'decide', { t: 'error', code: 'party_ended' });
    expect(screenOf(s)).toBe('ended');
  });

  it('kicked: the party is gone and the screen says so', () => {
    const { s } = run(initialParty('create'), welcome, view({ you: 'b' }), { t: 'error', code: 'kicked' });
    expect(s.view).toBeNull();
    expect(screenOf(s)).toBe('ended');
    expect(s.error?.code).toBe('kicked');
  });

  it('update_required and seat_elsewhere are fatal error screens', () => {
    expect(screenOf(run(initialParty('create'), { t: 'error', code: 'update_required' }).s)).toBe('error');
    expect(screenOf(run(initialParty('create'), welcome, view(), { t: 'error', code: 'seat_elsewhere' }).s)).toBe('error');
  });

  it('phases: pick, loading and the results lobby', () => {
    expect(screenOf(run(initialParty('create'), view({ phase: 'pick', deadlineMs: 30_000 })).s)).toBe('pick');
    expect(screenOf(run(initialParty('create'), view({ phase: 'loading' })).s)).toBe('loading');
    expect(screenOf(run(initialParty('create'), view({ phase: 'results' })).s)).toBe('lobby');
  });

  it('a party of one: `local` starts the normal solo match (LocalHost) and the party stays open', () => {
    const { s, fx } = run(initialParty('create'), welcome, view({ members: [{ id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' }] }), { t: 'local', difficulty: 'normal' });
    expect(fx).toContainEqual({ t: 'solo', difficulty: 'normal' });
    expect(s.view).not.toBeNull();
    expect(screenOf(s)).toBe('match');
  });

  it('`match` starts the party match once (a resume `match` is ignored while in it)', () => {
    const m = { t: 'match', room: 'r1', you: { slot: 0 } } as unknown as MatchMsg;
    const { s, fx } = run(initialParty('create'), welcome, view({ phase: 'match' }), m, m);
    expect(fx.filter((f) => f.t === 'match')).toHaveLength(1);
    expect(s.inMatch).toBe(true);
  });

  it('the party view keeps updating in a match (results land on a current lobby)', () => {
    const m = { t: 'match', room: 'r1', you: { slot: 0 } } as unknown as MatchMsg;
    const { s, fx } = run(initialParty('create'), welcome, view({ phase: 'match' }), m, view({ phase: 'results' }));
    expect(s.view?.phase).toBe('results');
    expect(fx.some((f) => f.t === 'note')).toBe(false);
  });

  it('joins, leaves and a new leader become notes (outside a match)', () => {
    const one = view({ members: [{ id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on' }] });
    const { fx } = run(initialParty('create'), welcome, one, view(), view({ members: [view().members[1]], leader: 'b', you: 'b' }));
    const titles = fx.filter((f) => f.t === 'note').map((f) => (f as { note: { title: string } }).note.title);
    expect(titles).toContain('Brave Sage joined');
  });

  it('nudge: a note naming the sender and a vibration', () => {
    const { fx } = run(initialParty('create'), welcome, view({ you: 'b' }), { t: 'nudge', from: 'a' });
    expect(fx).toContainEqual({ t: 'note', note: { key: 'mp-nudge', title: 'Sunny Tabby nudged you', tone: 'info', ttl: 4000 } });
    expect(fx).toContainEqual({ t: 'vibrate' });
  });

  it('a rematch vote that passed: "Leader started a rematch" for 3 s', () => {
    const { fx } = run(initialParty('create'), welcome, view({ phase: 'results' }), { t: 'vote', kind: 'rematch', result: 'pass' });
    expect(fx).toContainEqual({ t: 'note', note: { key: 'mp-rematch', title: 'Leader started a rematch', tone: 'info', ttl: 3000 } });
  });

  it('server_busy: the leader retries the start after retryMs; members only see it', () => {
    const lead = run(initialParty('create'), welcome, view(), { t: 'error', code: 'server_busy', retryMs: 12_000 });
    expect(lead.fx).toContainEqual({ t: 'retry-start', ms: 12_000 });
    const member = run(initialParty('create'), welcome, view({ you: 'b' }), { t: 'error', code: 'server_busy', retryMs: 12_000 });
    expect(member.fx.some((f) => f.t === 'retry-start')).toBe(false);
    expect(member.s.error?.code).toBe('server_busy');
  });

  it('the next good view clears a refused action error', () => {
    const { s } = run(initialParty('create'), welcome, view(), { t: 'error', code: 'rate_limited' }, view());
    expect(s.error).toBeNull();
  });

  it('leaving (`left`) closes', () => {
    const { fx } = run(initialParty('create'), welcome, view(), { ...view(), code: '', left: true } as unknown as ServerJson);
    expect(fx).toContainEqual({ t: 'close' });
  });

  it('a reconnect with the view kept does not re-create or re-join', () => {
    const { fx } = run(initialParty('create'), welcome, view(), welcome, 'decide');
    expect(fx.filter((f) => f.t === 'send')).toHaveLength(0);
  });
});
