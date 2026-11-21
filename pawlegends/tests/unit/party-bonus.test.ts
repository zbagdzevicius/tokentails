// @vitest-environment happy-dom
/**
 * PARTY-XP.md (founder, Nov 20: "create a feature that party gives 50%+ xp boost"): the client mirror of the party XP
 * bonus: the numbers, the chip on the party lobby and the queue card, the Party pill's line on Home and the results'
 * Pass block line. The server pays the real Season XP (backend party-bonus.ts).
 */
import { describe, expect, it } from 'vitest';
import { friendMates, PARTY_BUTTON_LINE, PARTY_PILL_CHIP, PARTY_XP_BONUS, partyBonusChipHtml, partyBonusLineHtml, partyBonusPct, partyBonusXp } from '../../src/meta/partyBonus';
import { lobbyHtml, type LobbyModel } from '../../src/party/ui/partyLobby';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { extrasHtml } from '../../src/ui/home/homeScreen';
import type { PartyView } from '../../src/net/proto';

const dom = (html: string): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
};

const view = (n: number, over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: 'K7QX2M',
  phase: 'lobby',
  leader: 'm0',
  difficulty: 'normal',
  openSeats: false,
  locked: false,
  members: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, name: `Cat ${i}`, guest: false, conn: 'on' as const })),
  you: 'm0',
  ...over,
});
const lobby = (v: PartyView, over: Partial<LobbyModel> = {}): LobbyModel => ({ view: v, qr: '', error: null, startAnyway: false, nudged: new Set(), difficulties: ['easy', 'normal'], ...over });
const queue = (o: Partial<QueueModel> = {}): QueueModel => ({ side: 'any', waitedS: 0, estimateS: null, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: null, retryS: 0, match: null, offer: null, ...o });

describe('party XP bonus: the numbers (the backend pays the same)', () => {
  it('+50% with one party mate, +75% with two or more', () => {
    expect(PARTY_XP_BONUS).toEqual({ oneMate: 50, moreMates: 75 });
    expect([0, 1, 2, 4].map(partyBonusPct)).toEqual([0, 50, 75, 75]);
    expect(partyBonusXp(130, 1)).toBe(65);
    expect(partyBonusXp(130, 2)).toBe(98);
    expect(partyBonusXp(130, 0)).toBe(0);
    expect(partyBonusXp(20, 1)).toBe(10);
  });

  it('counts only the other members of the player\'s own friend party', () => {
    const v = view(3);
    expect(friendMates(v, new Set(['m0', 'm1', 'm2']))).toBe(2);
    // a stranger the queue added is no mate
    expect(friendMates(v, new Set(['m0', 'm1']))).toBe(1);
    expect(friendMates(v, new Set())).toBe(0);
    expect(friendMates(null, new Set(['m0']))).toBe(0);
  });
});

describe('party XP bonus: the chip', () => {
  it('a party alone hints at the bonus; with a friend it is on', () => {
    const alone = dom(partyBonusChipHtml(0)).querySelector('[data-testid="party-xp-bonus"]')!;
    expect(alone.textContent).toBe('Invite a friend: +50% XP');
    expect(alone.classList.contains('on')).toBe(false);
    const duo = dom(partyBonusChipHtml(1)).querySelector('[data-testid="party-xp-bonus"]')!;
    expect(duo.textContent).toBe('Party bonus +50% XP');
    expect(duo.classList.contains('on')).toBe(true);
    expect(dom(partyBonusChipHtml(2)).textContent).toBe('Party bonus +75% XP');
  });

  it('the party lobby shows it from the members (or the friends the client counted)', () => {
    expect(dom(lobbyHtml(lobby(view(1)))).querySelector('[data-testid="party-xp-bonus"]')!.getAttribute('data-pct')).toBe('0');
    expect(dom(lobbyHtml(lobby(view(2)))).querySelector('[data-testid="party-xp-bonus"]')!.textContent).toBe('Party bonus +50% XP');
    expect(dom(lobbyHtml(lobby(view(3)))).querySelector('[data-testid="party-xp-bonus"]')!.textContent).toBe('Party bonus +75% XP');
    // a matched party's results: only the player's own friends count
    expect(dom(lobbyHtml(lobby(view(3), { partyMates: 1 }))).querySelector('[data-testid="party-xp-bonus"]')!.getAttribute('data-pct')).toBe('50');
  });

  it('the queue card shows it only for a party with a friend in it', () => {
    expect(dom(queueCardHtml(queue())).querySelector('[data-testid="party-xp-bonus"]')).toBeNull();
    expect(dom(queueCardHtml(queue({ party: true, partyMates: 1 }))).querySelector('[data-testid="party-xp-bonus"]')!.textContent).toBe('Party bonus +50% XP');
    expect(dom(queueCardHtml(queue({ party: true, partyMates: 1, pvp: { theirs: 0, toCoop: false, requeued: false } }))).querySelector('[data-testid="party-xp-bonus"]')).not.toBeNull();
    // a found match shows the found line, not the chip
    expect(dom(queueCardHtml(queue({ party: true, partyMates: 1, match: { humans: 2, bots: 1, side: 'cat', difficulty: 'normal' } }))).querySelector('[data-testid="party-xp-bonus"]')).toBeNull();
  });

  it("Home's Party pill says it: a short chip, the full line in its tooltip", () => {
    expect(PARTY_BUTTON_LINE).toBe('Play with friends · +50% XP');
    expect(PARTY_PILL_CHIP).toBe('+50% XP');
    const d = dom(extrasHtml({ modes: [] } as never, true));
    expect(d.querySelector('[data-testid="home-party-line"]')!.textContent).toBe('+50% XP');
    expect(d.querySelector('[data-testid="home-party"]')!.getAttribute('title')).toBe('Play with friends · +50% XP');
  });
});

describe('party XP bonus: the results line', () => {
  it('names the percent and the XP; nothing without a bonus', () => {
    const p = dom(partyBonusLineHtml({ pct: 50, xp: 40 })).querySelector('[data-testid="results-party-bonus"]')!;
    expect(p.textContent).toBe('Party bonus +50%: +40 Season XP');
    expect(partyBonusLineHtml(null)).toBe('');
    expect(partyBonusLineHtml({ pct: 50, xp: 0 })).toBe('');
  });
});
