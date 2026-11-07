/** UX pass 2: the painted lobby scene per visit and its size (render/lobby/lobbyBg.ts). Pure. */
import { describe, expect, it } from 'vitest';
import { lobbyBgFor, lobbyBgOverride, lobbyBgUrl, lobbyBgVisit } from '../../src/render/lobby/lobbyBg';

describe('lobby background', () => {
  it('the first visit is the meadow; every third visit the arena', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(lobbyBgFor)).toEqual(['meadow', 'meadow', 'arena', 'meadow', 'meadow', 'arena', 'meadow']);
    expect(lobbyBgFor(0)).toBe('meadow');
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
    expect(lobbyBgOverride('?lobbybg=../x')).toBeNull();
    expect(lobbyBgOverride('')).toBeNull();
  });
});
