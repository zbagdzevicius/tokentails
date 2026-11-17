/**
 * Mode unlocks by account level (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 17): the relay refuses 5v5 Classic below
 * Lv 3 (`mm_locked`, reason `mode_level`, `{mode, level, have, need}`). The queue card says which level and how far the
 * player is, names a party member when this player has the level, and offers Casual instead of searching again.
 */
import { describe, expect, it } from 'vitest';
import { initialParty, reduceParty } from '../../src/party/partyClient';
import { queueCardHtml, RANKED_TO_CASUAL, type QueueModel } from '../../src/party/ui/queueCard';

describe('a mode above the account level', () => {
  it('the refusal stops the search with the level and the matches', () => {
    let s = { ...initialParty('queue', null, 'any', 'classic'), welcomed: true, mmOk: true, pvpOk: true };
    s = reduceParty(s, { e: 'queue', side: 'any', mode: 'classic' }).state;
    const r = reduceParty(s, { e: 'server', m: { t: 'error', code: 'mm_locked', reason: 'mode_level', mode: 'classic', level: 3, have: 3, need: 4 } as never });
    expect(r.state.queue).toMatchObject({ stopped: 'mode_level', modeLock: { mode: 'classic', level: 3, have: 3, need: 4 } });
    expect(r.effects).toContainEqual({ t: 'track', event: 'mode_locked_queue', props: { mode: 'classic', level: 3 } });
    // a plain rate lock is still the generic one
    const plain = reduceParty(s, { e: 'server', m: { t: 'error', code: 'mm_locked', retryMs: 5000 } as never }).state;
    expect(plain.queue).toMatchObject({ stopped: 'locked' });
  });

  it('the card: your own level line, or a party member; Casual instead of Search again', () => {
    const base: QueueModel = { side: 'any', waitedS: 0, estimateS: null, found: 1, lowPriorityS: 0, warn: false, party: false, stopped: 'mode_level', retryS: 0, match: null, offer: null };
    const own = queueCardHtml({ ...base, modeLock: { mode: 'classic', level: 3, have: 3, need: 4, mine: false } });
    expect(own).toContain('5v5 Classic unlocks at Lv 3: finish 1 more match (3/4)');
    expect(own).toContain('data-testid="mm-play-casual"');
    expect(own).not.toContain('data-testid="mm-again"');
    const mate = queueCardHtml({ ...base, party: true, modeLock: { mode: 'classic', level: 3, have: 0, need: 4, mine: true } });
    expect(mate).toContain('A party member has not reached Lv 3 for 5v5 Classic yet');
    expect(RANKED_TO_CASUAL.has('mode_level')).toBe(true);
    // no payload (an older relay): the Classic numbers, Lv 3 = 4 matches (Nov 17 verification: it said "0/2")
    expect(queueCardHtml(base)).toContain('5v5 Classic unlocks at Lv 3: finish 4 more matches (0/4)');
  });
});
