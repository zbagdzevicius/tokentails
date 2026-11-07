// @vitest-environment happy-dom
/**
 * Quick Play M1a (docs/plans/moba/M1A-IMPL.md §1.5, §9.3): the shared pick of a matched party. The CATS/DOGS switch
 * is locked on the assigned side, the grid shows that side only, the header says "Your team: Dogs", and empty
 * teammate seats read Bot.
 */
import { describe, expect, it } from 'vitest';
import { HEROES, HERO_IDS } from '../../src/data/heroes';
import type { PartyView } from '../../src/net/proto';
import { decoratePick, firstFree, heroBlock, pickHtml } from '../../src/party/ui/partyPick';
import { loadingHtml } from '../../src/party/ui/partyLoading';

const view = (over: Partial<PartyView> = {}): PartyView => ({
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
  you: 'b',
  deadlineMs: 30_000,
  mm: { side: 'dog', strangers: true },
  ...over,
});
const dogs = HERO_IDS.filter((h) => HEROES[h].side === 'dog');
const cats = HERO_IDS.filter((h) => HEROES[h].side === 'cat');

const mount = (v: PartyView, hover = ''): HTMLElement => {
  const d = document.createElement('div');
  d.innerHTML = pickHtml({ view: v, hover, trick: 'pounce', secondsLeft: 30, error: null, found: { humans: 2, bots: 1, side: 'dog', difficulty: 'normal' } });
  decoratePick(d, v);
  return d;
};

describe('Quick Play pick (M1a)', () => {
  it('the side switch is locked on the assigned side, with the team line', () => {
    const d = mount(view());
    const sw = d.querySelector('[data-testid="mm-side-switch"]')!;
    expect(sw.getAttribute('data-side')).toBe('dog');
    const opts = [...sw.querySelectorAll('button')];
    expect(opts.every((b) => b.disabled)).toBe(true);
    expect(opts.find((b) => b.getAttribute('aria-checked') === 'true')?.textContent).toBe('DOGS');
    expect(d.querySelector('[data-testid="mm-your-team"]')?.textContent).toBe('Your team: Dogs');
    expect(d.querySelector('[data-testid="mm-found-line"]')?.textContent).toContain('2 players + 1 bot');
  });

  it('the grid shows the assigned side only; the other side is blocked even for the leader', () => {
    const d = mount(view());
    const shown = [...d.querySelectorAll<HTMLElement>('.pp-heroes [data-h]')].map((e) => e.dataset.h);
    expect(shown.sort()).toEqual([...dogs].sort());
    const asLeader = view({ you: 'a' });
    for (const c of cats) expect(heroBlock(asLeader, c)).not.toBe('');
    for (const g of dogs) expect(heroBlock(asLeader, g)).toBe('');
  });

  it('the default hover moves to a free hero of the side (the preferred one when free)', () => {
    const v = view();
    expect(dogs).toContain(firstFree(v, 'dog'));
    expect(firstFree(v, 'dog', dogs[1])).toBe(dogs[1]);
    expect(firstFree(v, 'dog', cats[0])).toBe(dogs[0]);
    const taken = view({ members: [{ id: 'a', name: 'A', guest: true, conn: 'on', slot: 0, hero: dogs[0], locked: true }, { id: 'b', name: 'B', guest: true, conn: 'on', slot: 1 }] });
    expect(firstFree(taken, 'dog', dogs[0])).not.toBe(dogs[0]);
  });

  it('empty teammate seats read Bot in the pick strip and on the loading screen', () => {
    const d = mount(view());
    expect([...d.querySelectorAll('.pp-ts.bot')].map((e) => e.textContent)).toEqual(['?Bot']);
    const l = document.createElement('div');
    l.innerHTML = loadingHtml(view({ phase: 'loading' }));
    expect(l.querySelectorAll('.pp-lc.bot')).toHaveLength(1);
    expect(l.textContent).toContain('Bot');
  });

  it('a friend party (no mm) keeps both sides in the grid and no switch', () => {
    const d = mount(view({ mm: undefined, code: 'K7QX2M' }));
    expect(d.querySelector('[data-testid="mm-side-switch"]')).toBeNull();
    expect(d.querySelectorAll('.pp-heroes [data-h]')).toHaveLength(HERO_IDS.length);
  });
});
