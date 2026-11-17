// @vitest-environment happy-dom
/**
 * gaps5 polish: the emote sidecar on the history row (it feeds the "Emote storm" highlight), a Ranked duo refusal that
 * is about the friend, the invite toast's Ranked lock line, and the first-load screen helpers.
 */
import { describe, expect, it } from 'vitest';
import type { ReplayRecord } from '../../src/sim/api';
import { SIM_VERSION } from '../../src/sim/version';
import { EMOTES_MAX, HISTORY_KEY, cleanEmotes, loadHistory, recordMoment, type KVStore } from '../../src/replay/store';
import { rankedMate } from '../../src/party/partyClient';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { inviteCard } from '../../src/social/inviteInbox';
import { lockLine } from '../../src/ui/modeSelect/unlocks';
import * as core from '../../src/ui/screensCore';
import * as screens from '../../src/ui/screens';

class Mem implements KVStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const rec = { v: 1, simVersion: SIM_VERSION, seed: 9, difficulty: 'easy', hero: 'clem', trick: 'pounce', ticks: 9000, inputs: 'AA==', outcome: 'won', finalHash: 'abcd1234' } as ReplayRecord;
const row = { id: 'a', at: 1, hero: 'clem', mode: 'skirmish' as const, difficulty: 'easy', outcome: 'won' as const, grade: 'A', k: 1, d: 0, a: 0, seconds: 300, simVersion: SIM_VERSION };

describe('emote sidecar (polish 3)', () => {
  it('a solo row with a replay keeps the emote ticks, sorted and capped; a row without a replay keeps none', () => {
    const s = new Mem();
    recordMoment({ ...row, emotes: [600, 90, 180] }, rec, s);
    expect(loadHistory(s)[0].emotes).toEqual([90, 180, 600]);
    recordMoment({ ...row, id: 'b', emotes: [10, 20], noReplay: 'party' }, null, s);
    expect(loadHistory(s)[0].emotes).toBeUndefined();
    expect(JSON.parse(s.getItem(HISTORY_KEY)!)[0]).not.toHaveProperty('emotes');
  });

  it('cleanEmotes drops bad ticks and keeps at most EMOTES_MAX', () => {
    expect(cleanEmotes([3, -1, 1.5, 'x', 2])).toEqual([2, 3]);
    expect(cleanEmotes([])).toBeUndefined();
    expect(cleanEmotes('nope')).toBeUndefined();
    expect(cleanEmotes(Array.from({ length: 100 }, (_, i) => i))).toHaveLength(EMOTES_MAX);
  });
});

describe('Ranked duo (polish 4)', () => {
  const duo = { members: [{ id: 'a' }, { id: 'b' }] } as never;
  const solo = { members: [{ id: 'a' }] } as never;
  const stop = { stopped: 'ranked_matches' as const, ranked: { have: 4, needMatches: 10 } };

  it('a "not enough matches" refusal of a duo is the friend\'s when this player has the matches', () => {
    expect(rankedMate(stop, duo, 25)).toBe(true);
    // this player is the one short: their own line
    expect(rankedMate(stop, duo, 4)).toBe(false);
    // solo: always their own
    expect(rankedMate(stop, solo, 25)).toBe(false);
    expect(rankedMate({ ...stop, stopped: 'ranked_party' as never }, duo, 25)).toBe(false);
  });

  it('the queue card names the duo partner', () => {
    const base: QueueModel = { side: 'any', waitedS: 0, estimateS: null, found: 2, lowPriorityS: 0, warn: false, party: true, stopped: 'ranked_matches', retryS: 0, match: null, offer: null };
    const mate = queueCardHtml({ ...base, ranked: { casualAfterS: 180, have: 4, needMatches: 10, mate: true } });
    expect(mate).toContain('Your duo partner has not unlocked Ranked yet');
    expect(mate).toContain('4/10');
    const own = queueCardHtml({ ...base, ranked: { casualAfterS: 180, have: 4, needMatches: 10 } });
    expect(own).toContain('Ranked unlocks after 10 matches · 4/10');
  });

  it('the invite toast says Ranked duo, with the lock line when this player has not unlocked Ranked', () => {
    const locked = lockLine('ranked', { matches: 4, wins: 1 });
    expect(locked).toBe('Unlocks at Lv 6 (you are Lv 3: 6 more matches)');
    // SOCIAL-INVITES.md: the LoL-style invite card (Accept / Decline) replaced the Join-only toast
    const inv = (mode?: 'ranked') => ({ id: '', from: { code: '', name: 'Sam' }, party: 'K7QX2M', ttl: 50, ...(mode ? { mode } : {}) });
    const cb = { onAccept: () => undefined, onDecline: () => undefined };
    const el = inviteCard(document, inv('ranked'), { ...cb, locked });
    expect(el.textContent).toContain('Sam invites you to a Ranked duo');
    expect(el.dataset.ranked).toBe('locked');
    expect(el.querySelector('[data-testid="invite-ranked-lock"]')?.textContent).toBe(`Ranked is locked for you: ${locked}. Join to play Casual together`);
    expect(el.querySelector('[data-testid="invite-accept"]')?.textContent).toBe('Accept');
    const open = inviteCard(document, inv('ranked'), { ...cb, locked: null });
    expect(open.dataset.ranked).toBe('open');
    expect(open.querySelector('.pl-invite-lock')).toBeNull();
    const plain = inviteCard(document, inv(), cb);
    expect(plain.textContent).toContain('Sam invites you to a party');
    expect(plain.dataset.ranked).toBeUndefined();
  });
});

describe('first-load screen helpers (polish 8)', () => {
  it('ui/screens re-exports the core helpers (one implementation)', () => {
    expect(screens.loadingVeil).toBe(core.loadingVeil);
    expect(screens.rotatePrompt).toBe(core.rotatePrompt);
    expect(screens.lateS).toBe(core.lateS);
    expect(core.lateS('easy')).toBeGreaterThan(300);
    const veil = core.loadingVeil(document.body, 'Into the <Crossing>', undefined, { name: 'Clem', matches: 1 });
    expect(veil.querySelector('b')?.textContent).toBe('Into the <Crossing>');
    expect(veil.querySelector('.hero-line')?.textContent).toBe('1 match as Clem');
  });
});
