// @vitest-environment happy-dom
/**
 * Round 6 ranked (docs/plans/moba/SOCIAL-RANKED.md §7.12, §7.13): the game's copies of the backend's draft and grade
 * constants, the ban phase screen (the other team's species, BAN, the own team's votes), the bans strip in the pick and
 * the banned tiles, and the honest S-grade results line from the server's numbers.
 */
import { describe, expect, it } from 'vitest';
import * as backendDraft from '../../../backend/src/pawlegends/ranked/draft';
import * as backendGrade from '../../../backend/src/pawlegends/ranked/grade';
import { HEROES, HERO_IDS } from '../../src/data/heroes';
import { GRADE_THRESHOLDS, GRADE_WEIGHTS, gradeMatch } from '../../src/meta/grade';
import { parseRankedCard, RANKED_DRAFT, RANKED_GRADE, rankedResult, type RankedCard } from '../../src/meta/ranked';
import type { PartyView } from '../../src/net/proto';
import { PROTO, PROTO_DRAFT, parseClientJson } from '../../src/net/proto';
import { banBlock, bannedHeroes, heroBlock, pickHtml } from '../../src/party/ui/partyPick';
import { rankedBlockHtml } from '../../src/ui/screens';
import type { SlotStats } from '../../src/sim/api';

describe('mirrors of the backend (ranked/draft.ts, ranked/grade.ts)', () => {
  it('draft and grade constants deep-equal the server copies', () => {
    expect(RANKED_DRAFT).toEqual(backendDraft.RANKED_DRAFT);
    expect(RANKED_GRADE).toEqual(backendGrade.RANKED_GRADE);
    expect(GRADE_WEIGHTS).toEqual(backendGrade.GRADE_WEIGHTS);
    expect(GRADE_THRESHOLDS).toEqual(backendGrade.GRADE_THRESHOLDS);
  });

  it('every hero has the same role on the server (a new champion must be added to HERO_ROLES)', () => {
    for (const h of HERO_IDS) expect([h, backendGrade.HERO_ROLES[h]]).toEqual([h, HEROES[h].role]);
    // the bots ban every champion of their species in some order
    for (const h of HERO_IDS) expect(backendDraft.BOT_BAN_ORDER[HEROES[h].side]).toContain(h);
  });

  it('the server grades a match exactly like the results screen', () => {
    const heroes = ['clem', 'brutus', 'gabe', 'nugget', 'pixel', 'stilts'] as const;
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
    for (let round = 0; round < 40; round++) {
      const stats = heroes.map(
        (hero, slot) =>
          ({ slot, hero, kills: rnd(8), deaths: rnd(8), assists: rnd(10), heroDamage: rnd(9000), towerDamage: rnd(4000), damageTaken: rnd(9000), healShield: rnd(3000), level: 9 }) as unknown as SlotStats,
      );
      const client = gradeMatch({ stats, winner: 0 });
      for (const row of client.slots) expect(backendGrade.slotGrade(stats as never, row.slot)).toBe(row.grade);
    }
  });
});

describe('PROTO 8: pick.ban', () => {
  it('is typed and bounded', () => {
    expect(PROTO).toBeGreaterThanOrEqual(PROTO_DRAFT);
    expect(parseClientJson(JSON.stringify({ t: 'pick.ban', hero: 'chili' }))).toEqual({ t: 'pick.ban', hero: 'chili' });
    expect(() => parseClientJson(JSON.stringify({ t: 'pick.ban' }))).toThrow();
    expect(() => parseClientJson(JSON.stringify({ t: 'pick.ban', hero: 'chili', x: 1 }))).toThrow();
  });
});

const view = (over: Partial<PartyView> = {}): PartyView => ({
  t: 'party',
  code: '',
  phase: 'pick',
  leader: 'a',
  difficulty: 'hard',
  openSeats: false,
  locked: true,
  members: [
    { id: 'a', name: 'Sunny Tabby', guest: false, conn: 'on', slot: 0 },
    { id: 'b', name: 'Brave Sage', guest: false, conn: 'on', slot: 1 },
  ],
  you: 'b',
  deadlineMs: 15_000,
  mm: { side: 'cat', strangers: true, mode: 'casual', team: 0, species: ['cat', 'dog'] },
  ...over,
});
const dogs = HERO_IDS.filter((h) => HEROES[h].side === 'dog');
const cats = HERO_IDS.filter((h) => HEROES[h].side === 'cat');
const mount = (v: PartyView, hover = ''): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = pickHtml({ view: v, hover, trick: 'pounce', secondsLeft: 15, error: null });
  return d;
};

describe('the ban phase (§7.13)', () => {
  const ban = view({
    draft: {
      stage: 'ban',
      target: 'dog',
      bans: [
        { team: 0, by: 'open' },
        { team: 1, by: 'open' },
      ],
      votes: [{ member: 'a', hero: 'chili' }],
    },
  });

  it('shows the other team species with BAN, the rule, the mates vote, and their ban hidden', () => {
    const d = mount(ban, 'frankie');
    const shown = [...d.querySelectorAll<HTMLElement>('.pp-heroes [data-h]')].map((e) => e.dataset.h);
    expect(shown.sort()).toEqual([...dogs].sort());
    expect(d.querySelector('.pp-draft')).not.toBeNull();
    expect(d.querySelector('[data-testid="party-lock"]')?.textContent).toContain('BAN');
    expect(d.querySelector('[data-testid="party-lock"]')?.hasAttribute('disabled')).toBe(false);
    expect(d.querySelector('[data-testid="draft-rule"]')?.textContent).toContain('bans one of the Dogs');
    expect(d.querySelector('[data-testid="draft-bans"]')?.getAttribute('data-stage')).toBe('ban');
    expect(d.querySelector('[data-ban="open"][data-team="1"]')?.textContent).toContain('Hidden');
    expect(d.querySelector('[data-h="chili"]')?.textContent).toContain('Team vote');
  });

  it('nothing can be picked while the bans run; only the other species can be banned', () => {
    for (const c of cats) expect(heroBlock(ban, c)).toBe('Bans first');
    expect(banBlock(ban, 'chili')).toBe('');
    expect(banBlock(ban, 'clem')).not.toBe('');
    expect(bannedHeroes(ban)).toEqual([]);
  });

  it('in the pick: both bans shown (a bot ban labelled), banned tiles blocked for both teams', () => {
    const pick = view({
      deadlineMs: 30_000,
      draft: {
        stage: 'pick',
        target: 'dog',
        bans: [
          { team: 0, by: 'team', hero: 'chili' },
          { team: 1, by: 'bot', hero: 'clem' },
        ],
      },
    });
    expect(bannedHeroes(pick)).toEqual(['chili', 'clem']);
    expect(heroBlock(pick, 'clem')).toBe('Banned');
    expect(heroBlock(pick, 'sage')).toBe('');
    const d = mount(pick, 'sage');
    expect(d.querySelector('[data-testid="draft-ban-ours"]')?.textContent).toContain('Your ban');
    expect(d.querySelector('[data-testid="draft-ban-theirs"]')?.textContent).toContain('Bot ban');
    expect(d.querySelector('.pp-pick')?.getAttribute('data-draft')).toBe('pick');
  });

  it('a blind ranked pick (no draft) shows no strip', () => {
    const d = mount(view({ deadlineMs: 30_000 }), 'sage');
    expect(d.querySelector('[data-testid="draft-bans"]')).toBeNull();
  });
});

describe('the S-grade results line (§7.12)', () => {
  const card = (o: Partial<RankedCard>): RankedCard => ({ placementsLeft: 0, placementsOf: 5, tierIdx: 7, points: 40, shield: 1, ...o });

  it('says what the S grade kept, from the server numbers only', () => {
    const after = parseRankedCard({ ranked: { placementsLeft: 0, tierIdx: 7, points: 33, shield: 1, last: { won: false, delta: -7, grade: 'S', saved: 8 } } });
    const r = rankedResult(card({}), after, false)!;
    expect(r.change).toBe('-7 pts');
    expect(r.grade).toBe('S grade: lost 7 instead of 15');
    expect(rankedBlockHtml(r)).toContain('data-testid="ranked-grade"');
  });

  it('no line for a win, another grade, or a card without the server numbers', () => {
    expect(rankedResult(card({}), card({ points: 58, last: { won: true, delta: 18, grade: 'S' } }), true)!.grade).toBeUndefined();
    expect(rankedResult(card({}), card({ points: 25, last: { won: false, delta: -15, grade: 'A' } }), false)!.grade).toBeUndefined();
    expect(rankedResult(card({}), card({ points: 25 }), false)!.grade).toBeUndefined();
    expect(parseRankedCard({ ranked: { placementsLeft: 0, last: { won: 'no', delta: 3 } } })!.last).toBeUndefined();
  });
});
