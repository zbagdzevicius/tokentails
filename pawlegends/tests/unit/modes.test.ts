/**
 * Home and Mode Select (docs/plans/moba/HOME-MODES.md §5): the mode registry's state logic. Locked and coming-soon
 * modes never play, an event plays only inside its window and counts down, the old 3v3 Quick | 5v5 Classic choice
 * migrates (quick → Skirmish, classic → Classic), and another worktree's mode (v22 Blitz) plugs in by id.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BASE_MODES,
  countdownText,
  effectiveState,
  legacyMode,
  loadModeChoice,
  metaLine,
  modeById,
  modeList,
  pillText,
  playable,
  queueFor,
  registerMode,
  resetModes,
  saveModeChoice,
  type ModeDef,
} from '../../src/ui/modeSelect/modes';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});
afterEach(() => {
  resetModes();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const NOW = Date.UTC(2026, 10, 11, 12);

describe('mode registry', () => {
  it('ships the default table: Blitz, Skirmish and Classic live (sim v22), Ranked locked, Cannon Chaos soon', () => {
    const s = (id: string): string => effectiveState(modeById(id)!, NOW);
    expect(s('skirmish')).toBe('live');
    expect(s('classic')).toBe('live');
    expect(s('coop')).toBe('live');
    expect(s('ranked')).toBe('locked');
    expect(s('blitz')).toBe('live');
    expect(s('cannon')).toBe('soon');
    expect(modeById('classic')!.map).toBe('hearthwood');
    expect(modeById('skirmish')!.map).toBe('crossing');
    // sim v22 Blitz: the Crossing, solo against bots at launch (WR-BS-PLAN.md §3a), tiles with the probe minutes
    expect(modeById('blitz')).toMatchObject({ map: 'crossing', size: '3v3', minutes: '~3 min', queues: ['bots'] });
    expect(modeById('skirmish')!.minutes).toBe('~7 min');
    expect(modeById('classic')!.minutes).toBe('~13 min');
    // every mode has art, rules and at least one queue
    for (const m of BASE_MODES) {
      expect(m.art).toMatch(/^[a-z]+$/);
      expect(m.rules.length).toBeGreaterThanOrEqual(2);
      expect(m.queues.length).toBeGreaterThan(0);
    }
  });

  it('lists playable modes first, then locked, then coming soon (registry order inside each group)', () => {
    expect(modeList(NOW).map((m) => m.id)).toEqual(['blitz', 'skirmish', 'classic', 'coop', 'ranked', 'cannon']);
  });

  it('a mode registered by another worktree replaces the base entry by id (v22 Blitz goes live)', () => {
    registerMode({ ...modeById('blitz')!, state: 'live', map: 'crossing' });
    expect(effectiveState(modeById('blitz')!, NOW)).toBe('live');
    expect(modeList(NOW)[0].id).toBe('blitz');
    registerMode({ id: 'arena', name: 'Arena', size: '3v3', minutes: '~5 min', queues: ['bots'], art: 'cannon', state: 'live', rules: ['a', 'b'] });
    expect(modeList(NOW).some((m) => m.id === 'arena')).toBe(true);
  });

  it('an event plays only inside its window', () => {
    const ev = (startsAt: number | undefined, endsAt: number): ModeDef => ({ ...modeById('cannon')!, state: { event: { ...(startsAt !== undefined ? { startsAt } : {}), endsAt } } });
    expect(effectiveState(ev(undefined, NOW + 3600_000), NOW)).toBe('event');
    expect(playable(ev(undefined, NOW + 3600_000), NOW)).toBe(true);
    expect(effectiveState(ev(undefined, NOW - 1), NOW)).toBe('soon');
    expect(playable(ev(NOW + 86400_000, NOW + 2 * 86400_000), NOW)).toBe(false);
    // not live yet: "Next: <weekday>"
    expect(metaLine(ev(Date.UTC(2026, 10, 13, 18), Date.UTC(2026, 10, 15)), NOW)).toBe('Next: Fri');
  });

  it('counts down as "2d 4h", "3h 12m", "9m", never below 1m', () => {
    expect(countdownText((2 * 24 + 4) * 3600_000)).toBe('2d 4h');
    expect(countdownText((3 * 60 + 12) * 60_000)).toBe('3h 12m');
    expect(countdownText(9 * 60_000)).toBe('9m');
    expect(countdownText(5_000)).toBe('1m');
    expect(countdownText(-5)).toBe('1m');
  });

  it('meta line: size and length, the lock text, or Coming soon', () => {
    expect(metaLine(modeById('classic')!, NOW)).toBe('5v5 · ~13 min');
    expect(metaLine(modeById('blitz')!, NOW)).toBe('3v3 · ~3 min');
    expect(metaLine(modeById('ranked')!, NOW)).toBe('Coming soon');
    expect(metaLine(modeById('cannon')!, NOW)).toBe('Coming soon');
  });

  it('pill text and queue fallback', () => {
    expect(pillText(modeById('classic')!, 'bots')).toBe('Classic 5v5 · vs Bots');
    expect(pillText(modeById('skirmish')!, 'pvp')).toBe('Skirmish 3v3 · PvP');
    expect(queueFor(modeById('coop')!, 'bots')).toBe('coop');
    expect(queueFor(modeById('classic')!, 'pvp')).toBe('pvp');
    expect(queueFor(modeById('classic')!, null)).toBe('bots');
  });

  it('maps a mode to the old toggle value (the pick and party screens still read it)', () => {
    expect(legacyMode('classic')).toBe('classic');
    expect(legacyMode('ranked')).toBe('classic');
    expect(legacyMode('skirmish')).toBe('skirmish');
    expect(legacyMode('coop')).toBe('skirmish');
    expect(legacyMode('blitz')).toBe('blitz');
  });
});

describe('saved mode choice', () => {
  it('migrates the old toggle: quick → Skirmish, classic → Classic, vs Bots', () => {
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'skirmish', queue: 'bots' });
    mem.set('pawlegends.matchMode', 'classic');
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'classic', queue: 'bots' });
    mem.set('pawlegends.matchMode', 'quick');
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'skirmish', queue: 'bots' });
    mem.set('pawlegends.matchMode', 'blitz');
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'blitz', queue: 'bots' });
  });

  it('round-trips, and a saved mode that cannot be played falls back to Skirmish', () => {
    saveModeChoice({ mode: 'classic', queue: 'pvp' });
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'classic', queue: 'pvp' });
    saveModeChoice({ mode: 'ranked', queue: 'pvp' });
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'skirmish', queue: 'pvp' });
    saveModeChoice({ mode: 'gone', queue: 'bots' });
    expect(loadModeChoice(modeList(NOW), NOW).mode).toBe('skirmish');
  });

  it('a blocked or corrupt store still gives a choice', () => {
    mem.set('pawlegends.mode.v1', '{not json');
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'skirmish', queue: 'bots' });
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => saveModeChoice({ mode: 'classic', queue: 'bots' })).not.toThrow();
    expect(loadModeChoice(modeList(NOW), NOW)).toEqual({ mode: 'skirmish', queue: 'bots' });
  });
});
