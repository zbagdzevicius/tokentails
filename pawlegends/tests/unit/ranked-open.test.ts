// @vitest-environment happy-dom
/**
 * Ranked (gap plan P4; round 4 low population, SOCIAL-RANKED.md §7.11): always open, the tile shows the searching count
 * and Prime Time from GET /pawlegends/ranked/status, the party client sends `bots: true` and turns the relay's ranked
 * refusals into stops, the queue card says when labelled bots fill and when it becomes vs AI, and the results block
 * reads points, the shield, the tier and what a bot-filled or vs AI match pays.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { effectiveState, metaLine, modeById, modeList, playable, rankedModeDef, registerMode, resetModes } from '../../src/ui/modeSelect/modes';
import {
  parseRankedCard,
  parseRankedStatus,
  primeTimeText,
  RANKED_BOTS,
  RANKED_CASUAL_AFTER_S,
  rankedBotsRule,
  rankedLiveText,
  rankedResult,
  type RankedCard,
  type RankedStatus,
} from '../../src/meta/ranked';
import { regionText } from '../../src/meta/rankedPing';
import { initialParty, mmJoinMsg, reduceParty, rankedStop } from '../../src/party/partyClient';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { acceptCardHtml } from '../../src/party/ui/acceptCard';
import { rankedBlockHtml } from '../../src/ui/screens';
import { rankedNavOpts } from '../../src/ui/home/homeScreen';

const NOW = Date.UTC(2026, 10, 20, 12);
afterEach(() => resetModes());

const status = (o: Partial<RankedStatus> = {}): RankedStatus => ({ open: true, online: 4, searching: 2, regions: [], ...o });

describe('the Ranked tile: always open (round 4)', () => {
  it('live before and after the status answers; PvP only, 3v3 on the Crossing; never a guessed number', () => {
    const none = rankedModeDef(null);
    expect(none).toMatchObject({ state: 'live', queues: ['pvp'], map: 'crossing', size: '3v3' });
    expect(metaLine(none, NOW)).toBe('3v3 · Always open');
    const live = rankedModeDef(status({ searching: 3 }));
    expect(playable(live, NOW)).toBe(true);
    expect(metaLine(live, NOW)).toBe('3v3 · 3 searching');
    expect(live.lockText).toBeUndefined();
    registerMode(live);
    expect(effectiveState(modeById('ranked', modeList(NOW))!, NOW)).toBe('live');
    expect(modeList(NOW).findIndex((m) => m.id === 'ranked')).toBeLessThan(modeList(NOW).findIndex((m) => m.id === 'cannon'));
  });

  it('the rules say bots honestly: when they fill, what they pay, and vs AI', () => {
    const rules = rankedModeDef(status()).rules.join(' ');
    expect(rules).toMatch(/Players first/);
    expect(rules).toContain(`labelled bots fill after ${RANKED_BOTS.fillS} s (half points)`);
    expect(rules).toContain(`alone after ${RANKED_BOTS.fillS + RANKED_BOTS.aiAfterS} s, vs AI (quarter points, none from Alley III)`);
    expect(rankedBotsRule(true)).toContain(`after ${RANKED_BOTS.primeFillS} s`);
    expect(rules).not.toMatch(/no bots/i);
  });

  it('Prime Time: the tile and the variant stage name it (in the player time)', () => {
    const at = new Date(2026, 10, 20, 20, 0).getTime();
    const on = status({ primeTime: { active: true, startsAt: at - 3_600_000, endsAt: at + 3_600_000 } });
    expect(rankedLiveText(on)).toBe('2 searching · Prime Time now');
    expect(primeTimeText(on)).toBe('Prime Time now · until 21:00');
    const next = status({ primeTime: { active: false, startsAt: at, endsAt: at + 4 * 3_600_000 } });
    expect(primeTimeText(next)).toBe('Prime Time 20:00–00:00');
    expect(rankedModeDef(next).variantNote).toMatch(/^Prime Time 20:00–00:00 · players first/);
    expect(primeTimeText(status())).toBe('');
  });

  it('status answers are validated (an older server without searching reads null, never a guess)', () => {
    expect(
      parseRankedStatus({
        open: true,
        online: 30,
        need: 0,
        searching: 3,
        primeTime: { active: false, startsAt: 1, endsAt: 2 },
        regions: [{ id: 'eu', name: 'Europe', ping: '/pawlegends/ping' }, { id: 'BAD', name: 'x', ping: 'http://evil' }],
        season: { id: 's1', endsAt: '2027-01-05' },
      }),
    ).toEqual({
      open: true,
      online: 30,
      searching: 3,
      primeTime: { active: false, startsAt: 1, endsAt: 2 },
      regions: [{ id: 'eu', name: 'Europe', ping: '/pawlegends/ping' }],
      season: { id: 's1', endsAt: '2027-01-05' },
    });
    expect(parseRankedStatus({ open: true, online: 30, need: 24 })).toMatchObject({ searching: null, regions: [] });
    expect(rankedLiveText(parseRankedStatus({ open: true, online: 30, need: 24 }))).toBe('30 online');
    expect(parseRankedStatus({ open: 'yes', online: 30 })).toBeNull();
    expect(parseRankedStatus({ open: true, online: -1 })).toBeNull();
    expect(parseRankedStatus(null)).toBeNull();
  });

  it('Home nav Ranked: live for a returning player (with the count), first-match lock for a new one', () => {
    const modes = [rankedModeDef(status({ searching: 5 }))];
    expect(rankedNavOpts({ modes }, true)).toEqual({ extra: ' aria-label="Ranked: open now, 5 searching" data-live="1"' });
    expect(rankedNavOpts({ modes }, false).locked).toMatch(/first match/);
  });

  it('the region line: name and the measured ping (or … while measuring)', () => {
    expect(regionText({ name: 'Europe', ms: 48 })).toBe('Europe · 48 ms');
    expect(regionText({ name: 'Europe', ms: null })).toBe('Europe · …');
  });
});

describe('ranked in the party client', () => {
  it('maps every ranked refusal to a stop', () => {
    expect(rankedStop('mm_ranked_closed')).toBe('ranked_closed');
    expect(rankedStop('mm_need_account')).toBe('ranked_account');
    expect(rankedStop('mm_ranked_matches')).toBe('ranked_matches');
    expect(rankedStop('mm_ranked_pending')).toBe('ranked_pending');
    expect(rankedStop('party_full', 'ranked_party')).toBe('ranked_party');
    expect(rankedStop('party_full')).toBeNull();
    expect(rankedStop('mm_locked')).toBeNull();
  });

  it('a ranked search: mm.join ranked goes out with bots: true (this game labels them); other queues never send it', () => {
    let s = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    const r = reduceParty(s, { e: 'queue', side: 'any', mode: 'ranked' });
    expect(r.effects).toContainEqual({ t: 'send', msg: { t: 'mm.join', queue: 'ranked', side: 'any', bots: true } });
    expect(mmJoinMsg('casual', 'cat')).toEqual({ t: 'mm.join', queue: 'casual', side: 'cat' });
    // an older relay without the account checks still answers closed: the card stops and offers Casual
    s = reduceParty(r.state, { e: 'server', m: { t: 'error', code: 'mm_ranked_closed', online: 0, need: 0 } as never }).state;
    expect(s.queue).toMatchObject({ stopped: 'ranked_closed' });
  });

  it('mm.status ranked carries the searching count', () => {
    let s = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    s = reduceParty(s, { e: 'server', m: { t: 'mm.status', queue: 'ranked', side: 'any', waitedMs: 2000, estimateMs: 60000, found: 1, teams: [1, 0], searching: 3 } as never }).state;
    expect(s.queue?.status?.searching).toBe(3);
  });

  it('vs AI: mm.found ranked ai is a ranked match of kind ai (no Accept card); a bot-filled Accept card is kind filled', () => {
    let s = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    s = reduceParty(s, { e: 'server', m: { t: 'mm.found', side: 'cat', humans: 1, bots: 2, difficulty: 'normal', queue: 'ranked', ai: true } as never }).state;
    expect(s.accept).toBeNull();
    expect(s.rankedMatch).toBe(true);
    expect(s.rankedKind).toBe('ai');
    expect(s.queue?.found).toMatchObject({ ai: true, humans: 1, bots: 2 });
    let f = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    f = reduceParty(f, {
      e: 'server',
      m: { t: 'mm.found', mode: 'casual', queue: 'ranked', match: 'abcdefghijkl', side: 'cat', humans: 1, bots: 2, difficulty: 'hard', teams: [[1, 2], [1, 2]], acceptByMs: 10000 } as never,
    }).state;
    expect(f.rankedKind).toBe('filled');
    // a plain co-op found is never ranked
    let c = { ...initialParty('queue', null, 'any', 'coop'), welcomed: true, mmOk: true, pvpOk: true };
    c = reduceParty(c, { e: 'server', m: { t: 'mm.found', side: 'cat', humans: 1, bots: 2, difficulty: 'normal' } as never }).state;
    expect(c.rankedMatch).toBe(false);
  });

  it('mm.status ranked keeps the ranked mode; mm.found ranked marks the accept card and the match', () => {
    let s = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    s = reduceParty(s, { e: 'server', m: { t: 'mm.status', queue: 'ranked', side: 'any', waitedMs: 2000, estimateMs: 60000, found: 1, teams: [1, 0] } as never }).state;
    expect(s.queue?.mode).toBe('ranked');
    s = reduceParty(s, {
      e: 'server',
      m: { t: 'mm.found', mode: 'casual', queue: 'ranked', match: 'abcdefghijkl', side: 'cat', humans: 3, bots: 0, difficulty: 'hard', teams: [[3, 0], [3, 0]], acceptByMs: 10000 } as never,
    }).state;
    expect(s.accept?.ranked).toBe(true);
    expect(s.rankedMatch).toBe(true);
    expect(s.rankedKind).toBe('players');
  });
});

describe('the ranked queue card', () => {
  const base: QueueModel = { side: 'any', waitedS: 12, estimateS: 60, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: null, retryS: 0, match: null, offer: null, pvp: { theirs: 0, toCoop: false, requeued: false }, ranked: { casualAfterS: RANKED_CASUAL_AFTER_S } };
  const card = (m: Partial<QueueModel>) => {
    const el = document.createElement('div');
    el.innerHTML = queueCardHtml({ ...base, ...m });
    return el;
  };

  it('players first: says when labelled bots fill and when it becomes vs AI; the live count and the region', () => {
    const early = card({ ranked: { casualAfterS: RANKED_CASUAL_AFTER_S, searching: 2, region: { name: 'Europe', ms: 41 } } });
    expect(early.querySelector('[data-ranked]')).not.toBeNull();
    expect(early.querySelector('[data-testid="mm-ranked-note"]')?.textContent).toBe(`Players first. Bots fill empty seats in ${RANKED_BOTS.fillS - 12}s (half points); vs AI at 1:10 if no one else is searching`);
    expect(early.querySelector('[data-testid="mm-ranked-live"]')?.textContent).toBe('2 searching · Europe · 41 ms');
    expect(early.querySelector('[data-testid="mm-play-casual"]')).toBeNull();
    const prime = card({ ranked: { casualAfterS: RANKED_CASUAL_AFTER_S, prime: true } });
    expect(prime.textContent).toContain(`in ${RANKED_BOTS.primeFillS - 12}s`);
    expect(prime.querySelector('[data-testid="mm-ranked-live"]')?.textContent).toBe('Prime Time');
    const quiet = card({ waitedS: 50 });
    expect(quiet.querySelector('[data-testid="mm-ranked-note"]')?.textContent).toMatch(/^Quiet queue: bots fill/);
    // only a relay that never fills ranked keeps a search this long: the card then offers Casual
    expect(card({ waitedS: RANKED_CASUAL_AFTER_S }).querySelector('[data-testid="mm-play-casual"]')).not.toBeNull();
  });

  it('vs AI found: the strip says your team against bots and quarter points', () => {
    const el = card({ match: { humans: 1, bots: 2, side: 'cat', difficulty: 'normal', ai: true } });
    expect(el.querySelector('[data-ai]')).not.toBeNull();
    expect(el.querySelector('h2')?.textContent).toBe('Ranked vs AI');
    expect(el.querySelector('[data-testid="mm-found-ai"]')?.textContent).toMatch(/against bots · quarter points/);
  });

  it('an older relay (no ranked source) stops closed and offers Casual (Search again cannot help)', () => {
    const el = card({ stopped: 'ranked_closed', ranked: { casualAfterS: 180, online: 0, need: 0 } });
    expect(el.querySelector('[data-testid="mm-play-casual"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="mm-again"]')).toBeNull();
    // an unsaved ranked match: Search again (the save lands in a moment)
    expect(card({ stopped: 'ranked_pending' }).querySelector('[data-testid="mm-again"]')).not.toBeNull();
  });

  it('the Accept card is titled for ranked; bot-filled says so with its half points', () => {
    const html = acceptCardHtml({ side: 'cat', mine: [3, 0], theirs: [3, 0], leftS: 9, totalS: 10, accepted: false, yes: 0, need: 6, ranked: true });
    expect(html).toContain('Ranked match found');
    expect(html).toContain('data-ranked="1"');
    expect(html).not.toContain('mm-ranked-filled');
    const filled = acceptCardHtml({ side: 'cat', mine: [1, 2], theirs: [1, 2], leftS: 9, totalS: 10, accepted: false, yes: 0, need: 2, ranked: true });
    expect(filled).toContain('1 player + 2 bots vs 1 + 2 bots');
    expect(filled).toContain('Bots fill the empty seats (labelled) · half points');
  });
});

describe('the ranked results block', () => {
  const card = (c: Partial<RankedCard>): RankedCard => ({ placementsLeft: 0, placementsOf: 5, ...c });

  it('points, promotions, demotions, the shield and protected tiers', () => {
    expect(rankedResult(card({ tierIdx: 7, points: 40, shield: 1 }), card({ tierIdx: 7, points: 58, shield: 1 }), true)).toMatchObject({ change: '+18 pts', tone: 'up', tier: 'Alley II · 58 / 100', shield: 'Shield ready' });
    expect(rankedResult(card({ tierIdx: 7, points: 95 }), card({ tierIdx: 8, points: 13 }), true)).toMatchObject({ change: 'Promoted to Alley I', tone: 'up' });
    expect(rankedResult(card({ tierIdx: 7, points: 5, shield: 0 }), card({ tierIdx: 6, points: 75, shield: 1 }), false)).toMatchObject({ change: 'Demoted to Alley III', tone: 'down' });
    expect(rankedResult(card({ tierIdx: 7, points: 5, shield: 1 }), card({ tierIdx: 7, points: 5, shield: 0 }), false)).toMatchObject({ change: 'Shield used: no points lost', shield: 'Shield used' });
    expect(rankedResult(card({ tierIdx: 2, points: 30 }), card({ tierIdx: 2, points: 30 }), false)).toMatchObject({ change: 'Kitten and Tabby never lose points', shield: '' });
    expect(rankedResult(card({ tierIdx: 12, points: 200 }), card({ tierIdx: 12, points: 221 }), true)).toMatchObject({ tier: 'Legend · 221 pts', change: '+21 pts' });
  });

  it('placements and the first placement', () => {
    expect(rankedResult(null, { placementsLeft: 3, placementsOf: 5 }, true)).toMatchObject({ tier: 'Placement 2 / 5', tone: 'up' });
    expect(rankedResult({ placementsLeft: 1, placementsOf: 5 }, card({ tierIdx: 4, points: 0 }), true)).toMatchObject({ change: 'Placed in Tabby II' });
    expect(rankedResult(null, null, true)).toBeNull();
  });

  it('parses ranked/me and renders the block (saving line first)', () => {
    expect(parseRankedCard({ ranked: { placementsLeft: 0, placementsOf: 5, tierIdx: 7, points: 40, shield: 1, peak: 'Alley I' } })).toEqual({ placementsLeft: 0, placementsOf: 5, tierIdx: 7, points: 40, shield: 1, peak: 'Alley I' });
    expect(parseRankedCard({ eligible: false })).toBeNull();
    expect(rankedBlockHtml(null)).toContain('saving');
    const html = rankedBlockHtml(rankedResult(card({ tierIdx: 7, points: 40, shield: 1 }), card({ tierIdx: 7, points: 58, shield: 1 }), true));
    expect(html).toContain('data-tone="up"');
    expect(html).toContain('+18 pts');
    expect(html).not.toContain('ranked-kind');
    expect(rankedBlockHtml(null, 'filled')).toContain('Bots filled empty seats · half points');
    expect(rankedBlockHtml(null, 'ai')).toContain('Ranked vs AI · quarter points (none from Alley III)');
  });
});
