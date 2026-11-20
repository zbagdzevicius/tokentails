// @vitest-environment happy-dom
/**
 * The leaver grace (docs/plans/moba/M1A-IMPL.md §4.3, founder 2026-11-20: "it should handle gracefully"): a search
 * from the title while this player's own match is still live offers Rejoin match first; Search new match gives the
 * seat up on purpose; a reload by our own update says so in the hello; the Short wait says why in one sentence.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { initialParty, reduceParty, screenOf, type PartyEffect, type PartyEvent, type PartyState } from '../../src/party/partyClient';
import { parseClientJson, parseServerJson, type ServerJson } from '../../src/net/proto';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { markUpdateReload, resetUpdateReload, takeUpdateReload, updateReloaded, UPDATE_RELOAD_KEY } from '../../src/net/reloadReason';

const welcome = (member = 'a'): ServerJson => ({ t: 'welcome', proto: 8, member, resumeToken: 'tok', serverMs: 0 });
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
const rejoin: ServerJson = { t: 'mm.rejoin', mode: 'casual', clockS: 252 };

describe('rejoin first', () => {
  it('Play online asks (held: ask); the relay offers the live match: no search, the card shows Rejoin match', () => {
    let { s, fx } = run(initialParty('queue', null, 'any', 'casual'), welcome());
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'casual', side: 'any', held: 'ask' }]);
    ({ s } = run(s, rejoin));
    expect(s.queue?.rejoin).toEqual({ mode: 'casual', clockS: 252 });
    expect(screenOf(s)).toBe('queue');
  });

  it('Rejoin match sends mm.back; the twin welcome, the party view and the match take the seat back', () => {
    let { s } = run(initialParty('queue', null, 'any', 'casual'), welcome(), rejoin);
    let fx: PartyEffect[];
    ({ s, fx } = run(s, { e: 'rejoin', yes: true }));
    expect(sent(fx)).toEqual([{ t: 'mm.back' }]);
    expect(s.queue).toBeNull();
    expect(s.backFrom).toMatchObject({ mode: 'casual', side: 'any' });
    ({ s, fx } = run(s, welcome('twin')));
    expect(sent(fx)).toEqual([]); // no new search
    ({ s } = run(s, {
      t: 'party',
      code: '',
      phase: 'match',
      leader: 'x',
      difficulty: 'normal',
      openSeats: false,
      locked: true,
      members: [{ id: 'twin', name: 'Sunny Tabby', guest: true, conn: 'on', slot: 2 }],
      you: 'twin',
      mm: { side: 'cat', strangers: true },
    }));
    expect(s.backFrom).toBeUndefined();
  });

  it('Rejoin match, but the match just ended (party_not_found): the search starts as meant, no error screen', () => {
    let { s } = run(initialParty('queue', null, 'cat', 'coop'), welcome(), { t: 'mm.rejoin', mode: 'coop', clockS: 30 }, { e: 'rejoin', yes: true });
    let fx: PartyEffect[];
    ({ s, fx } = run(s, { t: 'error', code: 'party_not_found' }));
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'coop', side: 'cat', held: 'ask' }]);
    expect(s.queue).toMatchObject({ mode: 'coop', side: 'cat', stopped: null });
    expect(s.error).toBeNull();
    expect(fx.some((f) => f.t === 'close')).toBe(false);
  });

  it('Search new match gives the seat up on purpose (held: leave) and searches', () => {
    let { s } = run(initialParty('queue', null, 'dog', 'casual'), welcome(), rejoin);
    let fx: PartyEffect[];
    ({ s, fx } = run(s, { e: 'rejoin', yes: false }));
    expect(sent(fx)).toEqual([{ t: 'mm.join', queue: 'casual', side: 'dog', held: 'leave' }]);
    expect(s.queue?.rejoin).toBeUndefined();
    ({ s } = run(s, { t: 'mm.status', queue: 'casual', side: 'dog', waitedMs: 0, estimateMs: 15_000, found: 1 }));
    expect(s.queue?.status).toBeTruthy();
  });

  it('Back on the offer sends no mm.leave (nothing was queued)', () => {
    const { s } = run(initialParty('queue', null, 'any', 'coop'), welcome(), rejoin);
    const r = reduceParty(s, { e: 'unqueue' });
    expect(sent(r.effects)).toEqual([]);
    expect(r.state.queue).toBeNull();
  });
});

describe('the cards', () => {
  const model = (o: Partial<QueueModel> = {}): QueueModel => ({
    side: 'any',
    waitedS: 0,
    estimateS: null,
    found: 1,
    lowPriorityS: 0,
    warn: false,
    party: false,
    stopped: null,
    retryS: 0,
    match: null,
    offer: null,
    ...o,
  });
  const dom = (html: string): HTMLElement => {
    const d = document.createElement('div');
    d.innerHTML = html;
    return d;
  };

  it('the rejoin card: the mode and clock, Rejoin match first, Search new match says what it costs', () => {
    const d = dom(queueCardHtml(model({ rejoin: { mode: 'casual', clockS: 252 } })));
    expect(d.querySelector('[data-testid="mm-queue"]')?.getAttribute('data-state')).toBe('rejoin');
    expect(d.querySelector('[data-testid="mm-rejoin-line"]')?.textContent).toBe('3v3 · 4:12');
    const buttons = [...d.querySelectorAll('button')].map((b) => b.getAttribute('data-p'));
    expect(buttons).toEqual(['mm-rejoin', 'mm-rejoin-no', 'mm-cancel']);
    expect(d.querySelector('[data-testid="mm-rejoin-hint"]')?.textContent).toMatch(/counts as leaving early/);
  });

  it('the Short wait says why in one plain sentence, with the count', () => {
    const two = dom(queueCardHtml(model({ lowPriorityS: 60, warn: true, left: 2 })));
    expect(two.querySelector('[data-testid="mm-low"]')?.textContent).toBe('You left 2 matches early this week, so your search starts after a short wait.');
    const one = dom(queueCardHtml(model({ lowPriorityS: 60, warn: true, left: 1 })));
    expect(one.querySelector('[data-testid="mm-low"]')?.textContent).toMatch(/^You left a match early this week/);
    // an older relay without the count keeps the general sentence
    const old = dom(queueCardHtml(model({ lowPriorityS: 60, warn: true })));
    expect(old.querySelector('[data-testid="mm-low"]')?.textContent).toMatch(/^You left matches early/);
  });

  it('mm.status carries the count only with the warning', () => {
    let { s } = run(initialParty('queue', null, 'any', 'coop'), welcome());
    ({ s } = run(s, { t: 'mm.status', queue: 'coop', side: 'any', waitedMs: 0, estimateMs: 70_000, found: 1, lowPriorityMs: 60_000, warn: 'leaver', left: 2 }));
    expect(s.queue?.status).toMatchObject({ left: 2, warn: 'leaver' });
  });
});

describe('the wire', () => {
  it('mm.join held, hint.reload and mm.rejoin parse; anything else is refused', () => {
    expect(parseClientJson('{"t":"mm.join","queue":"coop","side":"any","held":"ask"}')).toMatchObject({ held: 'ask' });
    expect(parseClientJson('{"t":"mm.join","queue":"coop","side":"any","held":"leave"}')).toMatchObject({ held: 'leave' });
    expect(() => parseClientJson('{"t":"mm.join","queue":"coop","side":"any","held":"yes"}')).toThrow();
    const hello = (hint: unknown) => JSON.stringify({ t: 'hello', proto: 8, sim: 38, simHash: '0123456789abcdef', build: 'dev', hint });
    expect(parseClientJson(hello({ maxDifficulty: 'easy', newbie: false, reload: 'update' }))).toMatchObject({ hint: { reload: 'update' } });
    expect(() => parseClientJson(hello({ maxDifficulty: 'easy', newbie: false, reload: 'crash' }))).toThrow();
    expect(parseServerJson('{"t":"mm.rejoin","mode":"coop","clockS":12}')).toEqual({ t: 'mm.rejoin', mode: 'coop', clockS: 12 });
  });
});

describe('reload reason', () => {
  afterEach(() => {
    resetUpdateReload();
    localStorage.clear();
  });
  const kv = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('an update marks the reload; the next boot takes it once and says so for 10 minutes', () => {
    const s = kv();
    markUpdateReload(1_000, s);
    expect(s.m.get(UPDATE_RELOAD_KEY)).toBe('1000');
    expect(takeUpdateReload(3_000, s)).toBe(true);
    expect(s.m.has(UPDATE_RELOAD_KEY)).toBe(false);
    expect(updateReloaded(3_000 + 9 * 60_000)).toBe(true);
    expect(updateReloaded(3_000 + 10 * 60_000)).toBe(false);
  });

  it('a stale mark or none: an ordinary boot', () => {
    const s = kv();
    expect(takeUpdateReload(5_000, s)).toBe(false);
    markUpdateReload(0 + 1, s);
    expect(takeUpdateReload(1 + 3 * 60_000, s)).toBe(false);
    expect(updateReloaded(1 + 3 * 60_000)).toBe(false);
  });
});
