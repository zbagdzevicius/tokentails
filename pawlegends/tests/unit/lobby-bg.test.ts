/** UX pass 2: the painted lobby scene per visit and its size (render/lobby/lobbyBg.ts). Pure. */
import { describe, expect, it } from 'vitest';
import { lobbyBgFor, lobbyBgOverride, lobbyBgUrl, lobbyBgVisit, screenBg } from '../../src/render/lobby/lobbyBg';

describe('lobby background', () => {
  it('the first visit is the daylight castles; then the meadow, then the arena, in turn', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(lobbyBgFor)).toEqual(['castles', 'meadow', 'arena', 'castles', 'meadow', 'arena', 'castles']);
    expect(lobbyBgFor(0)).toBe('castles');
  });

  it('the pick screen shows the stage; results show the species victory or defeat scene', () => {
    expect(screenBg('pick', { won: false, side: 'dog' })).toBe('stage');
    expect(screenBg('results', { won: true, side: 'cat' })).toBe('win-cat');
    expect(screenBg('results', { won: false, side: 'dog' })).toBe('lose-dog');
    expect(screenBg('title', { won: true, side: 'cat' })).toBeNull();
    expect(screenBg(undefined, { won: true, side: 'cat' })).toBeNull();
    expect(lobbyBgUrl('stage', { base: './', bufferWidth: 844, low: false })).toBe('./assets/screens/pick-stage-1280.webp');
    expect(lobbyBgUrl('win-dog', { base: './', bufferWidth: 2880, low: false })).toBe('./assets/screens/win-dog-1920.webp');
    expect(lobbyBgUrl('castles', { base: './', bufferWidth: 2880, low: false })).toBe('./assets/lobby/castles-1920.webp');
  });

  it('1280 px for phones and Low tier, 1920 px for wide screens', () => {
    expect(lobbyBgUrl('meadow', { base: './', bufferWidth: 844 * 2, low: false })).toBe('./assets/lobby/meadow-1920.webp');
    expect(lobbyBgUrl('meadow', { base: './', bufferWidth: 844, low: false })).toBe('./assets/lobby/meadow-1280.webp');
    expect(lobbyBgUrl('arena', { base: '/pawlegends-game/', bufferWidth: 2880, low: true })).toBe('/pawlegends-game/assets/lobby/arena-1280.webp');
  });

  it('counts visits in storage; blocked storage reads as a first visit', () => {
    const m = new Map<string, string>();
    const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
    expect([lobbyBgVisit(store), lobbyBgVisit(store), lobbyBgVisit(store)]).toEqual([1, 2, 3]);
    const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => undefined };
    expect(lobbyBgVisit(blocked)).toBe(1);
    expect(lobbyBgVisit(null)).toBe(1);
  });

  it('?lobbybg= picks a known scene only', () => {
    expect(lobbyBgOverride('?lobbybg=arena')).toBe('arena');
    expect(lobbyBgOverride('?lobbybg=castles')).toBe('castles');
    expect(lobbyBgOverride('?lobbybg=win-cat')).toBeNull();
    expect(lobbyBgOverride('?lobbybg=../x')).toBeNull();
    expect(lobbyBgOverride('')).toBeNull();
  });
});
