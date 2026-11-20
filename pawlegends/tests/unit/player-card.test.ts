// @vitest-environment happy-dom
/**
 * The Player Card's end-of-match entry points (docs/plans/moba/PLAYER-CARD.md): on the scoreboard and on your party's
 * rows, another human's name opens their card (`onPlayer(slot, name)`); a bot or a persona keeps a plain name that
 * opens nothing, and the markup never says "bot" for a persona.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resultName, resultsScreen, type ResultRow, type ResultsOpts } from '../../src/ui/screens';
import { partyRows, partyRowsHtml } from '../../src/party/ui/partyResults';
import type { SlotStats } from '../../src/sim/api';
import { API_OPS } from '../../src/embed/api';

afterEach(() => {
  document.body.innerHTML = '';
});

const row = (over: Partial<ResultRow>): ResultRow => ({ name: 'X', rel: 'ally', k: 1, d: 2, a: 3, heroDmg: 100, towerDmg: 0, ...over });
const base: ResultsOpts = {
  won: true, seconds: 400, hero: 'clem', difficulty: 'easy', kills: 3, deaths: 1, assists: 2, level: 7, teamKills: [9, 4], firstWin: false, best: false,
  dareLink: null, onAgain: () => undefined, onChange: () => undefined, onShare: () => undefined,
};
const stats = (slot: number, hero: string): SlotStats => ({ slot, hero, kills: 1, deaths: 1, assists: 1, heroDamage: 10 }) as unknown as SlotStats;

describe('Player Card on the results screen', () => {
  it('resultName: a button for a human seat, plain escaped text otherwise', () => {
    expect(resultName('Rex', 4, true)).toContain('data-pslot="4"');
    expect(resultName('<b>', 4, true)).not.toContain('<b>');
    expect(resultName('Sunny', 2, false)).toBe('Sunny');
    expect(resultName('Sunny', undefined, true)).toBe('Sunny');
  });

  it('the scoreboard: a human name opens the card; a bot or persona row has no button', () => {
    const onPlayer = vi.fn();
    const table = [
      row({ name: 'You', rel: 'self' }),
      row({ name: 'Rex', rel: 'ally', slot: 1, flag: 'can', player: true }),
      row({ name: 'Sunny Biscuit', rel: 'ally' }),
      row({ name: 'Mira', rel: 'enemy', slot: 4, flag: 'can', player: true }),
    ];
    resultsScreen(document.body, { ...base, table, onPlayer });
    const names = [...document.querySelectorAll<HTMLElement>('[data-testid="results-player"]')];
    expect(names.map((n) => n.textContent)).toEqual(['Rex', 'Mira']);
    names[1].click();
    expect(onPlayer).toHaveBeenCalledWith(4, 'Mira');
    expect(document.querySelector('.pl-table')?.textContent).not.toMatch(/\bbot\b/i);
  });

  it('your party rows: another human opens the card; you, a persona and a bot do not', () => {
    const rows = partyRows({
      stats: [0, 1, 2, 3, 4, 5].map((s) => stats(s, 'clem')),
      mySlot: 0,
      partyNames: ['Me', 'Rex', null, null, null, null],
      baseNames: ['Me', 'Rex', 'Bolt', 'd', 'e', 'f'],
      pilotPct: [],
      art: [],
      hide: false,
      personas: new Map([[2, { slot: 2, name: 'Sunny Biscuit' } as never]]),
    });
    const html = partyRowsHtml(rows, true);
    document.body.innerHTML = html;
    const btns = [...document.querySelectorAll<HTMLElement>('[data-testid="party-result-player"]')];
    expect(btns.map((b) => b.dataset.pslot)).toEqual(['1']);
    // without a room to resolve seats (vs AI, an older relay): plain names only
    expect(partyRowsHtml(rows)).not.toContain('data-pslot');
  });

  it('the host op that names a seat is on the bridge list', () => {
    expect(API_OPS).toContain('history.seat');
  });
});
