// @vitest-environment happy-dom
/** Results screen (POC.md §12): stats at once, the dare link at End + 5 s, "Play again" at End + 10 s. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESULTS_AFTER_END_MS, RESULTS_REVEAL_MS, resultsScreen } from '../../src/ui/screens';

const opts = {
  won: true,
  seconds: 432,
  hero: 'clem' as const,
  difficulty: 'easy' as const,
  kills: 2,
  deaths: 1,
  level: 6,
  teamKills: [9, 4] as [number, number],
  firstWin: true,
  best: false,
  dareLink: 'https://example.test/pawlegends?dare=x',
  onAgain: () => {},
  onChange: () => {},
  onShare: () => {},
};

describe('results reveal', () => {
  afterEach(() => vi.useRealTimers());

  it('the dare button shares the link with the dare line shown on the screen (PUB-06)', () => {
    const onShare = vi.fn();
    const root = resultsScreen(document.body, { ...opts, seconds: 312, onShare });
    root.querySelector<HTMLElement>('[data-a="share"]')!.click();
    expect(onShare).toHaveBeenCalledWith(opts.dareLink, 'Beat my 5:12 vs Easy bots in Pawlegends!');
    expect(root.querySelector('.dare b')!.textContent).toBe('Beat my 5:12 vs Easy bots in Pawlegends!');
    root.remove();
  });

  it('shows the dare at End + 5 s and Play again at End + 10 s (the screen opens at End + 2.2 s)', () => {
    vi.useFakeTimers();
    const root = resultsScreen(document.body, opts);
    const at = (ms: number) => vi.advanceTimersByTime(ms);
    expect(root.querySelector('h1')!.textContent).toBe('Victory!');
    expect(root.classList.contains('dare-in')).toBe(false);
    at(RESULTS_REVEAL_MS.dare - RESULTS_AFTER_END_MS - 10);
    expect(root.classList.contains('dare-in')).toBe(false);
    at(20);
    expect(root.classList.contains('dare-in')).toBe(true);
    expect(root.classList.contains('actions-in')).toBe(false);
    at(RESULTS_REVEAL_MS.actions - RESULTS_REVEAL_MS.dare - 20);
    expect(root.classList.contains('actions-in')).toBe(false);
    at(20);
    expect(root.classList.contains('actions-in')).toBe(true);
    expect(RESULTS_REVEAL_MS).toEqual({ dare: 5000, actions: 10000, quick: 2500 });
    root.remove();
  });

  it('runs faster with the match speed', () => {
    vi.useFakeTimers();
    const root = resultsScreen(document.body, { ...opts, speed: 64 });
    vi.advanceTimersByTime(Math.ceil((RESULTS_REVEAL_MS.actions - RESULTS_AFTER_END_MS) / 64) + 1);
    expect(root.classList.contains('actions-in')).toBe(true);
    root.remove();
  });
});
