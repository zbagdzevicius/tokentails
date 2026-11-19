/**
 * One main queue (docs/plans/moba/MODE-UNLOCKS.md, founder Nov 19): PLAY is the 3v3 queue for everyone; Practice
 * appears beside it from Lv 5 and Ranked from Lv 10, with nothing of them before; the other modes are off the menu. A
 * player who already played Ranked keeps it below Lv 10. The tables equal the backend's copy.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isUnlocked,
  lockLine,
  MAIN_MODE,
  menuExtras,
  MODE_UNLOCKS,
  needOf,
  newlyUnlocked,
  notePlayed,
  RANKED_PLAYED,
  RETIRED_MODES,
  unseenFresh,
  loadModeLocal,
  saveModeLocal,
  isModeUnlock,
} from '../../src/ui/modeSelect/unlocks';
import { BASE_MODES } from '../../src/ui/modeSelect/modes';
import { LEVEL_MATCHES, LEVEL_MAX, LEVEL_STEP_AFTER, levelInfo, levelOf, matchesForLevel } from '../../src/meta/accountLevel';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
});

const prof = (matches: number, unlocks: string[] = []) => ({ matches, wins: 0, unlocks });
/** The finished matches that reach a level. */
const at = (level: number, unlocks: string[] = []) => prof(matchesForLevel(level), unlocks);

describe('the account level', () => {
  it('counts finished matches: Lv 1 at 0, then the table, then every 10 matches', () => {
    expect([0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(levelOf(50)).toBe(14);
    expect(levelOf(60)).toBe(15);
    expect(levelOf(1e9)).toBe(LEVEL_MAX);
    for (let l = 1; l < 40; l++) expect(levelOf(matchesForLevel(l))).toBe(l);
    expect(levelInfo(3)).toEqual({ level: 2, pct: 0.5, toNext: 1 });
  });

  it('is the backend table: the same levels, Ranked at the same level, Classic retired there too', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/src/pawlegends/mode-unlocks.ts'), 'utf8');
    const table = src.match(/LEVEL_MATCHES: readonly number\[\] = Object\.freeze\(\[([^\]]*)\]\)/)![1].split(',').map(Number);
    expect(table).toEqual([...LEVEL_MATCHES]);
    expect(Number(src.match(/LEVEL_STEP_AFTER = (\d+)/)![1])).toBe(LEVEL_STEP_AFTER);
    // the server gates Ranked only (Practice is played on the device: no server gate)
    const q = src.match(/QUEUE_LEVEL = Object\.freeze\(\{ ([^}]*) \}/)![1];
    expect(q).toBe(`ranked: ${needOf('ranked')!.level}`);
    const retired = src.match(/RETIRED_QUEUES[^=]*= Object\.freeze\(\[([^\]]*)\]/)![1].replace(/['\s]/g, '').split(',');
    expect(retired).toEqual(['classic']);
    for (const id of retired) expect(RETIRED_MODES).toContain(id);
    // Ranked's server rule (saved matches) is Lv 10's matches: 25
    expect(matchesForLevel(needOf('ranked')!.level)).toBe(25);
    expect(readFileSync(resolve(__dirname, '../../../backend/src/pawlegends/ranked/tiers.ts'), 'utf8')).toMatch(/RANKED_MIN_MATCHES = matchesForLevel\(QUEUE_LEVEL\.ranked\)/);
  });
});

describe('the menu (founder Nov 19)', () => {
  it('PLAY is the 3v3 main queue; Practice at Lv 5, Ranked at Lv 10; every other mode is off the menu', () => {
    expect(MAIN_MODE).toBe('skirmish');
    expect(MODE_UNLOCKS.map((u) => [u.id, u.need.level])).toEqual([
      ['practice', 5],
      ['ranked', 10],
    ]);
    expect(needOf('skirmish')).toBeNull();
    expect(RETIRED_MODES).toEqual(['classic', 'blitz', 'duel', 'onelane', 'cannon', 'boss', 'twist']);
    // every mode the registry ships is on the menu or retired (a mode added later needs a decision)
    for (const m of BASE_MODES) expect([MAIN_MODE, ...MODE_UNLOCKS.map((u) => u.id), ...RETIRED_MODES]).toContain(m.id);
  });

  it('shows the buttons only once unlocked: Lv 1 and 4 nothing, Lv 5 and 9 Practice, Lv 10 Ranked and Practice', () => {
    expect(menuExtras(at(1))).toEqual([]);
    expect(menuExtras(prof(0))).toEqual([]);
    expect(menuExtras(at(4))).toEqual([]);
    expect(menuExtras(prof(matchesForLevel(5) - 1))).toEqual([]);
    expect(menuExtras(at(5))).toEqual(['practice']);
    expect(menuExtras(at(9))).toEqual(['practice']);
    expect(menuExtras(prof(matchesForLevel(10) - 1))).toEqual(['practice']);
    expect(menuExtras(at(10))).toEqual(['ranked', 'practice']);
    expect(menuExtras(at(30))).toEqual(['ranked', 'practice']);
  });

  it('keeps Ranked for a player who already played it (an earned rank is never taken away)', () => {
    expect(menuExtras(at(6, [RANKED_PLAYED]))).toEqual(['ranked', 'practice']);
    expect(menuExtras(at(2, [RANKED_PLAYED]))).toEqual(['ranked']);
    // the old Lv 6 ladder's `mode.ranked` id (written to everyone at 10 matches) does not count as played
    expect(menuExtras(at(6, ['mode.ranked']))).toEqual(['practice']);
    expect(isModeUnlock(RANKED_PLAYED)).toBe(true);
  });

  it('a retired mode is never open, whatever the level or an old unlock id', () => {
    for (const id of RETIRED_MODES) {
      expect(isUnlocked({ id }, at(40, [`mode.${id}`]))).toBe(false);
      expect(needOf(id)).toBeNull();
    }
    expect(isUnlocked({ id: 'skirmish' }, prof(0))).toBe(true);
    expect(isUnlocked({ id: 'zoomies' }, at(40))).toBe(false);
  });

  it("a friend's Ranked invite says the level and the matches still to play", () => {
    expect(lockLine('ranked', prof(22))).toBe('Unlocks at Lv 10 · 3 more matches');
    expect(lockLine('ranked', prof(24))).toBe('Unlocks at Lv 10 · 1 more match');
    expect(lockLine('skirmish', prof(0))).toBe('');
  });
});

describe('the one-time reveal', () => {
  it('a match crossing Lv 5 or Lv 10 opens that button once; a player who played Ranked hears nothing at Lv 10', () => {
    expect(newlyUnlocked({ matches: 7, wins: 0 }, prof(8))).toEqual(['practice']);
    expect(newlyUnlocked({ matches: 24, wins: 0 }, prof(25))).toEqual(['ranked']);
    expect(newlyUnlocked({ matches: 24, wins: 0 }, prof(25, [RANKED_PLAYED]))).toEqual([]);
    expect(newlyUnlocked({ matches: 8, wins: 0 }, prof(9))).toEqual([]);
    expect(newlyUnlocked({ matches: 1, wins: 0 }, prof(2))).toEqual([]);
  });

  it('reveals menu modes only, once, and a played mode drops out', () => {
    // an old list from the level ladder still names Blitz and Duel: never revealed
    saveModeLocal({ fresh: ['blitz', 'duel', 'ranked'], seen: [] });
    const l = loadModeLocal();
    expect(unseenFresh(l)).toEqual(['ranked']);
    saveModeLocal({ ...l, seen: ['ranked'] });
    expect(unseenFresh(loadModeLocal())).toEqual([]);
    expect(notePlayed(loadModeLocal(), 'ranked')).toEqual({ fresh: ['blitz', 'duel'], seen: [] });
    expect(mem.get('pawlegends.modes.new')).toBe('blitz,duel,ranked');
  });
});
