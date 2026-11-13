// @vitest-environment happy-dom
/**
 * Ranked opens by itself (gap plan P4): the tile follows GET /pawlegends/ranked/status (locked with the live gate line,
 * live while open, PvP only), the party client turns the relay's ranked refusals into stops that offer Casual, the queue
 * card says "no bots" and offers Casual after 3:00, and the results block reads points, the shield and the tier.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { effectiveState, metaLine, modeById, modeList, playable, rankedModeDef, registerMode, resetModes } from '../../src/ui/modeSelect/modes';
import {
  parseRankedCard,
  parseRankedStatus,
  RANKED_CASUAL_AFTER_S,
  rankedGateSentence,
  rankedGateText,
  rankedResult,
  type RankedCard,
} from '../../src/meta/ranked';
import { initialParty, reduceParty, rankedStop } from '../../src/party/partyClient';
import { queueCardHtml, type QueueModel } from '../../src/party/ui/queueCard';
import { acceptCardHtml } from '../../src/party/ui/acceptCard';
import { rankedBlockHtml } from '../../src/ui/screens';
import { rankedNavOpts } from '../../src/ui/home/homeScreen';

const NOW = Date.UTC(2026, 10, 20, 12);
afterEach(() => resetModes());

describe('the Ranked tile follows the live gate', () => {
  it('closed: locked with "Opens at 24 online · 9 now"; open: live, PvP only, 3v3 on the Crossing', () => {
    const closed = rankedModeDef({ open: false, online: 9, need: 24 });
    expect(closed.state).toBe('locked');
    expect(metaLine(closed, NOW)).toBe('Opens at 24 online · 9 now');
    expect(playable(closed, NOW)).toBe(false);
    const open = rankedModeDef({ open: true, online: 31, need: 24 });
    expect(open).toMatchObject({ state: 'live', queues: ['pvp'], map: 'crossing', size: '3v3' });
    expect(open.lockText).toBeUndefined();
    expect(open.rules.join(' ')).toMatch(/no bots/i);
    registerMode(open);
    expect(effectiveState(modeById('ranked', modeList(NOW))!, NOW)).toBe('live');
    // a live Ranked sits with the live tiles
    expect(modeList(NOW).findIndex((m) => m.id === 'ranked')).toBeLessThan(modeList(NOW).findIndex((m) => m.id === 'cannon'));
  });

  it('no answer yet: the fallback line, never a guessed count', () => {
    expect(rankedGateText(null)).toBe('Opens at 24 players online');
    expect(rankedGateSentence({ open: false, online: 3, need: 24 })).toBe('Ranked opens at 24 players online. 3 online now.');
    expect(rankedGateSentence({ open: true, online: 30, need: 24 })).toMatch(/open/);
  });

  it('status answers are validated', () => {
    expect(parseRankedStatus({ open: true, online: 30, need: 24, season: { id: 's1', endsAt: '2027-01-05' } })).toEqual({
      open: true,
      online: 30,
      need: 24,
      season: { id: 's1', endsAt: '2027-01-05' },
    });
    expect(parseRankedStatus({ open: 'yes', online: 30, need: 24 })).toBeNull();
    expect(parseRankedStatus({ open: true, online: -1, need: 24 })).toBeNull();
    expect(parseRankedStatus(null)).toBeNull();
  });

  it('Home nav Ranked: live opens Mode Select; locked says the gate', () => {
    const closed = [rankedModeDef({ open: false, online: 9, need: 24 })];
    expect(rankedNavOpts({ modes: closed }, true)).toEqual({ locked: 'Ranked: Opens at 24 online · 9 now.' });
    expect(rankedNavOpts({ modes: closed }, false).locked).toMatch(/first match/);
    expect(rankedNavOpts({ modes: [rankedModeDef({ open: true, online: 30, need: 24 })] }, true).locked).toBeUndefined();
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

  it('a ranked search: mm.join ranked goes out; a closed gate stops it with the counts', () => {
    let s = { ...initialParty('queue', null, 'any', 'ranked'), welcomed: true, mmOk: true, pvpOk: true };
    const r = reduceParty(s, { e: 'queue', side: 'any', mode: 'ranked' });
    expect(r.effects).toContainEqual({ t: 'send', msg: { t: 'mm.join', queue: 'ranked', side: 'any' } });
    s = reduceParty(r.state, { e: 'server', m: { t: 'error', code: 'mm_ranked_closed', online: 9, need: 24 } as never }).state;
    expect(s.queue).toMatchObject({ stopped: 'ranked_closed', ranked: { online: 9, need: 24 } });
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
  });
});

describe('the ranked queue card', () => {
  const base: QueueModel = { side: 'any', waitedS: 12, estimateS: 60, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: null, retryS: 0, match: null, offer: null, pvp: { theirs: 0, toCoop: false, requeued: false }, ranked: { casualAfterS: RANKED_CASUAL_AFTER_S } };
  const card = (m: Partial<QueueModel>) => {
    const el = document.createElement('div');
    el.innerHTML = queueCardHtml({ ...base, ...m });
    return el;
  };

  it('says no bots; offers Casual only after 3:00', () => {
    const early = card({});
    expect(early.querySelector('[data-ranked]')).not.toBeNull();
    expect(early.textContent).toMatch(/no bots/i);
    expect(early.querySelector('[data-testid="mm-play-casual"]')).toBeNull();
    const late = card({ waitedS: RANKED_CASUAL_AFTER_S });
    expect(late.querySelector('[data-testid="mm-play-casual"]')).not.toBeNull();
  });

  it('a closed gate stops with the count and offers Casual (Search again cannot help)', () => {
    const el = card({ stopped: 'ranked_closed', ranked: { casualAfterS: 180, online: 9, need: 24 } });
    expect(el.querySelector('[data-testid="mm-stopped"]')?.textContent).toBe('Ranked opens at 24 players online · 9 online now');
    expect(el.querySelector('[data-testid="mm-play-casual"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="mm-again"]')).toBeNull();
    // an unsaved ranked match: Search again (the save lands in a moment)
    expect(card({ stopped: 'ranked_pending' }).querySelector('[data-testid="mm-again"]')).not.toBeNull();
  });

  it('the Accept card is titled for ranked', () => {
    const html = acceptCardHtml({ side: 'cat', mine: [3, 0], theirs: [3, 0], leftS: 9, totalS: 10, accepted: false, yes: 0, need: 6, ranked: true });
    expect(html).toContain('Ranked match found');
    expect(html).toContain('data-ranked="1"');
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
  });
});
