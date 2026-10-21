import { describe, expect, it } from 'vitest';
import { StartGate } from './start-gate';

describe('time trial start gate', () => {
  it('a loading start dies when the player leaves its screen, cancels, or starts again', () => {
    let top: string | null = 'tt';
    const g = new StartGate(() => top);
    const a = g.begin();
    expect(g.live(a)).toBe(true);
    // Esc back to the menu while the ghost loads
    top = 'menu';
    expect(g.live(a)).toBe(false);
    // Retry on the results, then Menu
    top = 'results';
    const b = g.begin();
    expect(g.live(b)).toBe(true);
    g.cancel(); // goMenu / any race start
    expect(g.live(b)).toBe(false);
    // a second Start supersedes the first
    const c = g.begin();
    const d = g.begin();
    expect(g.live(c)).toBe(false);
    expect(g.live(d)).toBe(true);
  });
});
