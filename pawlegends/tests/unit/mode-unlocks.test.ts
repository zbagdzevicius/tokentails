/**
 * Mode unlocking (docs/plans/moba/MODE-UNLOCKS.md, founder ask Nov 14): never more than 3 big mode tiles; the rest
 * are small strip icons, locked until the player's matches and wins reach the ladder. Veterans keep everything,
 * events stay open while live, a saved locked mode falls back to Skirmish, and the `mode.` ids ride the synced unlocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_MODES, loadModeChoice, modeList, registerMode, resetModes, saveModeChoice, twistModeDef, type ModeDef } from '../../src/ui/modeSelect/modes';
import {
  CORE,
  isUnlocked,
  layoutModes,
  lockLine,
  migrateUnlocks,
  MODE_UNLOCKS,
  needOf,
  needText,
  newlyUnlocked,
  notePlayed,
  playerModes,
  progressOf,
  silentUnlocks,
  unlockId,
  unseenFresh,
  loadModeLocal,
  saveModeLocal,
  type ModeLocal,
} from '../../src/ui/modeSelect/unlocks';
import { mergeProfile } from '../../src/meta/progressCloud';
import { loadProfile } from '../../src/meta/profile';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
  resetModes();
});
afterEach(() => resetModes());

// a Wednesday (no Boss Weekend) and a Saturday (inside one)
const WED = Date.UTC(2026, 10, 18, 12);
const SAT = Date.UTC(2026, 10, 21, 12);
const NONE: ModeLocal = { fresh: [], seen: [] };
const prof = (matches: number, wins: number, unlocks: string[] = []) => ({ matches, wins, unlocks });
const ids = (l: readonly ModeDef[]) => l.map((m) => m.id);
const big = (l: readonly ModeDef[]) => ids(l.filter((m) => m.slot === 'big'));
const more = (l: readonly ModeDef[]) => l.filter((m) => m.slot === 'more');

describe('the ladder', () => {
  it('opens the core and Practice from the start; events are never gated', () => {
    for (const id of ['skirmish', 'classic', 'practice', 'boss', 'twist']) expect(needOf(id)).toBeNull();
    expect(ids(MODE_UNLOCKS.map((u) => ({ id: u.id }) as ModeDef))).toEqual(['blitz', 'duel', 'onelane', 'cannon', 'ranked']);
    // a future mode with no row waits for 4 matches (never lands big by accident)
    expect(needOf('zoomies')).toEqual({ matches: 4 });
  });

  it('reads as plain goals with progress', () => {
    expect(needText({ matches: 1 })).toBe('Finish 1 match');
    expect(needText({ wins: 1 })).toBe('Win 1 match');
    expect(needText({ matches: 10, wins: 3 })).toBe('Finish 10 matches and win 3');
    expect(progressOf('blitz', prof(0, 0))!.line).toBe('Finish 1 match');
    expect(progressOf('duel', prof(1, 0))!.line).toBe('1/2 matches');
    expect(progressOf('onelane', prof(3, 0))!.line).toBe('Win 1 match');
    expect(progressOf('ranked', prof(4, 1))!.line).toBe('4/10 matches');
    expect(progressOf('ranked', prof(12, 1))!.line).toBe('1/3 wins');
    expect(progressOf('ranked', prof(5, 0))!.pct).toBeCloseTo(0.25);
    expect(lockLine('duel', prof(1, 0))).toBe('Finish 2 matches (1/2)');
    expect(lockLine('ranked', prof(4, 1))).toBe('Finish 10 matches and win 3 (4/10, 1/3)');
  });

  it('each threshold unlocks exactly its mode', () => {
    const blitz = BASE_MODES.find((m) => m.id === 'blitz')!;
    const ranked = modeList(WED).find((m) => m.id === 'ranked')!;
    expect(isUnlocked(blitz, prof(0, 0), WED)).toBe(false);
    expect(isUnlocked(blitz, prof(1, 0), WED)).toBe(true);
    expect(isUnlocked(ranked, prof(10, 2), WED)).toBe(false);
    expect(isUnlocked(ranked, prof(10, 3), WED)).toBe(true);
    // a recorded unlock holds even when the counts are lower (a cleared browser, the server's union)
    expect(isUnlocked(ranked, prof(0, 0, [unlockId('ranked')]), WED)).toBe(true);
    expect(newlyUnlocked({ matches: 0, wins: 0 }, prof(1, 1))).toEqual(['blitz', 'onelane']);
    expect(newlyUnlocked({ matches: 1, wins: 0 }, prof(2, 0))).toEqual(['duel']);
    expect(newlyUnlocked({ matches: 3, wins: 1 }, prof(4, 1))).toEqual(['cannon']);
    expect(newlyUnlocked({ matches: 10, wins: 2 }, prof(11, 3))).toEqual(['ranked']);
    expect(newlyUnlocked({ matches: 10, wins: 2 }, prof(11, 2))).toEqual([]);
    // another device announced it already: never twice
    expect(newlyUnlocked({ matches: 0, wins: 0 }, prof(1, 0, [unlockId('blitz')]))).toEqual([]);
  });
});

describe('the layout: never more than 3 big tiles', () => {
  it('a new player sees Skirmish, Classic and Practice; the rest are strip icons with their goals', () => {
    const l = playerModes(modeList(WED), prof(0, 0), NONE, WED, 'skirmish');
    expect(big(l)).toEqual(['skirmish', 'classic', 'practice']);
    const m = more(l);
    expect(ids(m)).toEqual(['blitz', 'duel', 'onelane', 'cannon', 'ranked', 'boss']);
    expect(m.find((x) => x.id === 'blitz')).toMatchObject({ state: 'locked', lockText: 'Finish 1 match (0/1)', progress: { line: 'Finish 1 match' } });
    expect(m.find((x) => x.id === 'duel')!.progress!.line).toBe('0/2 matches');
    // Boss Weekend between windows is "Next: Fri", not locked
    expect(m.find((x) => x.id === 'boss')!.state).not.toBe('locked');
    // static NEW ribbons do not shout at a new player from locked icons
    expect(m.some((x) => x.isNew)).toBe(false);
  });

  it('Boss Weekend takes the third tile while live; Practice drops to the strip, still open', () => {
    const l = playerModes(modeList(SAT), prof(0, 0), NONE, SAT, 'skirmish');
    expect(big(l)).toEqual(['skirmish', 'classic', 'boss']);
    expect(more(l)[0]).toMatchObject({ id: 'practice', state: 'live' });
  });

  it('a just-unlocked mode takes the spotlight with NEW; after a match of it, the last choice holds it', () => {
    const local: ModeLocal = { fresh: ['blitz'], seen: [] };
    const l = playerModes(modeList(WED), prof(1, 0), local, WED, 'skirmish');
    expect(big(l)).toEqual(['skirmish', 'classic', 'blitz']);
    expect(l.find((m) => m.id === 'blitz')).toMatchObject({ isNew: true, fresh: true });
    expect(unseenFresh(local)).toEqual(['blitz']);
    // announced once: no more animation, still NEW
    const seen = { ...local, seen: ['blitz'] };
    expect(playerModes(modeList(WED), prof(1, 0), seen, WED, 'skirmish').find((m) => m.id === 'blitz')).toMatchObject({ isNew: true });
    expect(playerModes(modeList(WED), prof(1, 0), seen, WED, 'skirmish').find((m) => m.id === 'blitz')!.fresh).toBeUndefined();
    const played = notePlayed(seen, 'blitz');
    expect(played).toEqual(NONE);
    expect(big(playerModes(modeList(WED), prof(2, 0), played, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'practice']);
    expect(big(playerModes(modeList(WED), prof(2, 0), played, WED, 'blitz'))).toEqual(['skirmish', 'classic', 'blitz']);
    // the newest of two fresh unlocks leads
    expect(big(playerModes(modeList(WED), prof(1, 1), { fresh: ['blitz', 'onelane'], seen: [] }, WED, 'skirmish'))[2]).toBe('onelane');
  });

  it('a locked last choice never takes the spotlight', () => {
    expect(big(playerModes(modeList(WED), prof(0, 0), NONE, WED, 'ranked'))).toEqual(['skirmish', 'classic', 'practice']);
  });

  it('a featured Blitz is open and big for a new player during its window only', () => {
    const blitz = BASE_MODES.find((m) => m.id === 'blitz')!;
    const ends = WED + 3600_000;
    registerMode({ ...blitz, state: { event: { endsAt: ends } } });
    const during = playerModes(modeList(WED), prof(0, 0), NONE, WED, 'skirmish');
    expect(big(during)).toEqual(['skirmish', 'classic', 'blitz']);
    const after = playerModes(modeList(ends + 1), prof(0, 0), NONE, ends + 1, 'skirmish');
    // the featured entry is still registered but its window is over: soon, never playable; the base entry is locked
    expect(after.find((m) => m.id === 'blitz')!.slot).toBe('more');
    resetModes();
    expect(playerModes(modeList(ends + 1), prof(0, 0), NONE, ends + 1, 'skirmish').find((m) => m.id === 'blitz')!.state).toBe('locked');
  });

  it('the Weekly Twist sits in the strip until 4 matches, then takes an empty spotlight', () => {
    registerMode(twistModeDef({ id: 'twist' as never, name: 'Toy Box', rules: ['Toys.'], endsAt: WED + 86_400_000 }));
    expect(big(playerModes(modeList(WED), prof(1, 0), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'practice']);
    expect(more(playerModes(modeList(WED), prof(1, 0), NONE, WED, 'skirmish')).find((m) => m.id === 'twist')!.state).not.toBe('locked');
    expect(big(playerModes(modeList(WED), prof(4, 1), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'twist']);
    expect(big(playerModes(modeList(WED), prof(4, 1), NONE, WED, 'duel'))).toEqual(['skirmish', 'classic', 'duel']);
  });

  it('never more than 3 big for any profile, event window and choice', () => {
    let seed = 7;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const all = ['skirmish', 'classic', 'practice', 'blitz', 'duel', 'onelane', 'cannon', 'ranked', 'boss', 'twist', null];
    for (let i = 0; i < 400; i++) {
      resetModes();
      const now = WED + rnd(14) * 86_400_000 + rnd(24) * 3600_000;
      if (rnd(2)) registerMode(twistModeDef({ id: 'twist' as never, name: 'Twist', rules: [], endsAt: now + 3600_000 }));
      if (rnd(3) === 0) registerMode({ ...BASE_MODES.find((m) => m.id === ['blitz', 'skirmish', 'classic'][rnd(3)])!, state: { event: { endsAt: now + 3600_000 } } });
      const m = rnd(30);
      const fresh = MODE_UNLOCKS.filter(() => rnd(3) === 0).map((u) => u.id);
      const l = playerModes(modeList(now), prof(m, rnd(m + 1)), { fresh, seen: [] }, now, all[rnd(all.length)]);
      const b = l.filter((x) => x.slot === 'big');
      expect(b.length).toBe(3);
      expect(ids(b).slice(0, 2)).toEqual([...CORE]);
      // the big tiles are always playable; every mode appears exactly once
      expect(b.every((x) => x.state !== 'locked')).toBe(true);
      expect(new Set(ids(l)).size).toBe(l.length);
      expect(l.length).toBe(modeList(now).length);
    }
  });

  it('layoutModes keeps the strip in ladder order', () => {
    const { more: m } = layoutModes(playerModes(modeList(WED), prof(25, 9, MODE_UNLOCKS.map((u) => unlockId(u.id))), NONE, WED), prof(25, 9), NONE, WED, 'skirmish');
    expect(ids(m)).toEqual(['blitz', 'duel', 'onelane', 'cannon', 'ranked', 'boss']);
  });
});

describe('veterans and migration', () => {
  it('a veteran (10+ matches or "played MOBAs before") keeps every mode, silently', () => {
    expect(migrateUnlocks({ ...prof(25, 2), veteran: false }, {}).sort()).toEqual(MODE_UNLOCKS.map((u) => unlockId(u.id)).sort());
    expect(migrateUnlocks({ ...prof(0, 0), veteran: true }, {}).length).toBe(MODE_UNLOCKS.length);
    const l = playerModes(modeList(WED), prof(25, 2, migrateUnlocks(prof(25, 2), {})), NONE, WED, 'skirmish');
    expect(l.filter((m) => m.state === 'locked')).toEqual([]);
    expect(big(l).length).toBe(3);
  });

  it('anyone else keeps what they played: the saved choice, the history and Ranked with a card', () => {
    expect(migrateUnlocks(prof(1, 0), { saved: 'duel', history: ['blitz', 'skirmish', 'pvp'] }).sort()).toEqual(['mode.blitz', 'mode.duel']);
    expect(migrateUnlocks(prof(1, 0), { rankedPlayed: true })).toEqual(['mode.ranked', 'mode.blitz']);
    // the met conditions are recorded too (and a new account marks itself so the veteran rule never fires later)
    expect(migrateUnlocks(prof(6, 3), {}).sort()).toEqual(['mode.blitz', 'mode.cannon', 'mode.duel', 'mode.onelane']);
    expect(migrateUnlocks(prof(0, 0), { saved: 'skirmish', history: ['classic', 'practice'] })).toEqual([]);
  });

  it('an account merged onto a new device: 10+ matches and no mode ids yet gets everything; otherwise only met goals', () => {
    expect(silentUnlocks(prof(25, 1)).veteran).toBe(true);
    expect(silentUnlocks(prof(25, 1)).add.length).toBe(MODE_UNLOCKS.length);
    // an account that ran this build has mode.blitz from its first match: Ranked still needs 3 wins
    const s = silentUnlocks(prof(12, 2, ['mode.blitz']));
    expect(s.veteran).toBe(false);
    expect(s.add.sort()).toEqual(['mode.cannon', 'mode.duel', 'mode.onelane']);
  });
});

describe('entry points and sync', () => {
  it('a saved choice that is locked for this player falls back to Skirmish', () => {
    saveModeChoice({ mode: 'duel', queue: 'bots' });
    const l = playerModes(modeList(WED), prof(1, 0), NONE, WED, 'duel');
    expect(loadModeChoice(l, WED).mode).toBe('skirmish');
    expect(loadModeChoice(playerModes(modeList(WED), prof(2, 0), NONE, WED, 'duel'), WED).mode).toBe('duel');
  });

  it('the NEW state is two short synced lists', () => {
    saveModeLocal({ fresh: ['blitz', 'duel'], seen: ['blitz'] });
    expect(mem.get('pawlegends.modes.new')).toBe('blitz,duel');
    expect(loadModeLocal()).toEqual({ fresh: ['blitz', 'duel'], seen: ['blitz'] });
    expect(MODE_UNLOCKS.map((u) => u.id).join(',').length).toBeLessThanOrEqual(32);
    // a seen id that is no longer fresh is dropped
    mem.set('pawlegends.modes.seen', 'cannon,blitz');
    expect(loadModeLocal().seen).toEqual(['blitz']);
  });

  it('mode ids ride the cloud unlocks union', () => {
    const local = loadProfile();
    const { profile } = mergeProfile(local, { counts: { matches: 3, wins: 1 }, unlocks: ['mode.blitz', 'mode.ranked', 'coat.clem.x'] }, 0);
    expect(profile.unlocks).toEqual(expect.arrayContaining(['mode.blitz', 'mode.ranked']));
    expect(profile.matches).toBe(3);
  });
});
