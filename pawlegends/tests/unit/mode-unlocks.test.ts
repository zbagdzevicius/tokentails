/**
 * Mode unlocking (docs/plans/moba/MODE-UNLOCKS.md): founder Nov 14, never more than 3 big mode tiles; founder Nov 17, a
 * level-1 player has Skirmish and Practice only and every other mode opens at an account level. Veterans and players
 * who already played a mode keep it, a saved locked mode falls back to Skirmish, and the `mode.` ids ride the synced
 * unlocks.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_MODES, loadModeChoice, modeList, registerMode, resetModes, saveModeChoice, twistModeDef, type ModeDef } from '../../src/ui/modeSelect/modes';
import {
  isUnlocked,
  layoutModes,
  lockLine,
  migrateUnlocks,
  MODE_UNLOCKS,
  MODE_UNLOCKS_SHIPPED,
  playedBefore,
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
import { LEVEL_MATCHES, LEVEL_MAX, LEVEL_STEP_AFTER, levelInfo, levelOf, matchesForLevel } from '../../src/meta/accountLevel';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

describe('the account level', () => {
  it('counts finished matches: Lv 1 at 0, then the table, then every 10 matches', () => {
    expect([0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20].map(levelOf)).toEqual([1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(levelOf(50)).toBe(14);
    expect(levelOf(59)).toBe(14);
    expect(levelOf(60)).toBe(15);
    expect(levelOf(1e9)).toBe(LEVEL_MAX);
    for (let l = 1; l < 40; l++) expect(levelOf(matchesForLevel(l))).toBe(l);
    expect(levelInfo(3)).toEqual({ level: 2, pct: 0.5, toNext: 1 });
  });

  it('is the backend table (the server checks Classic and Ranked on its own saved matches)', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/src/pawlegends/mode-unlocks.ts'), 'utf8');
    const table = src.match(/LEVEL_MATCHES: readonly number\[\] = Object\.freeze\(\[([^\]]*)\]\)/)![1].split(',').map(Number);
    expect(table).toEqual([...LEVEL_MATCHES]);
    expect(Number(src.match(/LEVEL_STEP_AFTER = (\d+)/)![1])).toBe(LEVEL_STEP_AFTER);
    const q = src.match(/QUEUE_LEVEL[^{]*\{ classic: (\d+), ranked: (\d+) \}/)!;
    expect(Number(q[1])).toBe(needOf('classic')!.level);
    expect(Number(q[2])).toBe(needOf('ranked')!.level);
    // Ranked's own server rule (10 saved matches) is the Ranked level's matches
    expect(matchesForLevel(needOf('ranked')!.level)).toBe(10);
  });
});

describe('the ladder', () => {
  it('a level-1 player has Skirmish and Practice; every other mode opens at a level', () => {
    for (const id of ['skirmish', 'practice']) expect(needOf(id)).toBeNull();
    expect(MODE_UNLOCKS.map((u) => [u.id, u.need.level])).toEqual([
      ['blitz', 2],
      ['classic', 3],
      ['duel', 4],
      ['twist', 4],
      ['onelane', 5],
      ['cannon', 5],
      ['boss', 5],
      ['ranked', 6],
    ]);
    // a future mode with no row waits for Lv 5 (never lands big by accident)
    expect(needOf('zoomies')).toEqual({ level: 5 });
  });

  it('reads as the level and the matches still to play', () => {
    expect(needText({ level: 3 })).toBe('Unlocks at Lv 3');
    expect(progressOf('classic', prof(2, 0))).toMatchObject({ line: 'Lv 3', pct: 0.5, short: 'Lv 2, 2/4 matches' });
    expect(progressOf('ranked', prof(5, 0))!.pct).toBeCloseTo(0.5);
    expect(lockLine('classic', prof(3, 0))).toBe('Unlocks at Lv 3 · 1 more match');
    expect(lockLine('ranked', prof(4, 1))).toBe('Unlocks at Lv 6 · 6 more matches');
  });

  it('each level unlocks exactly its modes', () => {
    const blitz = BASE_MODES.find((m) => m.id === 'blitz')!;
    const classic = BASE_MODES.find((m) => m.id === 'classic')!;
    const ranked = modeList(WED).find((m) => m.id === 'ranked')!;
    expect(isUnlocked(blitz, prof(1, 0), WED)).toBe(false);
    expect(isUnlocked(blitz, prof(2, 0), WED)).toBe(true);
    expect(isUnlocked(classic, prof(3, 0), WED)).toBe(false);
    expect(isUnlocked(classic, prof(4, 0), WED)).toBe(true);
    expect(isUnlocked(ranked, prof(9, 9), WED)).toBe(false);
    expect(isUnlocked(ranked, prof(10, 0), WED)).toBe(true);
    // a recorded unlock holds even when the counts are lower (a cleared browser, the server's union, the Nov 14 ladder)
    expect(isUnlocked(ranked, prof(0, 0, [unlockId('ranked')]), WED)).toBe(true);
    // the guided first match leaves the player at Lv 1
    expect(newlyUnlocked({ matches: 0, wins: 0 }, prof(1, 1))).toEqual([]);
    expect(newlyUnlocked({ matches: 1, wins: 0 }, prof(2, 0))).toEqual(['blitz']);
    expect(newlyUnlocked({ matches: 3, wins: 1 }, prof(4, 1))).toEqual(['classic']);
    expect(newlyUnlocked({ matches: 5, wins: 1 }, prof(6, 1))).toEqual(['duel', 'twist']);
    expect(newlyUnlocked({ matches: 7, wins: 1 }, prof(8, 1))).toEqual(['onelane', 'cannon', 'boss']);
    expect(newlyUnlocked({ matches: 9, wins: 2 }, prof(10, 3))).toEqual(['ranked']);
    expect(newlyUnlocked({ matches: 10, wins: 2 }, prof(11, 2))).toEqual([]);
    // another device announced it already: never twice
    expect(newlyUnlocked({ matches: 1, wins: 0 }, prof(2, 0, [unlockId('blitz')]))).toEqual([]);
  });
});

describe('the layout: never more than 3 big tiles', () => {
  it('a level-1 player sees Skirmish and Practice; everything else is a locked strip icon with its level', () => {
    const l = playerModes(modeList(WED), prof(1, 0), NONE, WED, 'skirmish');
    expect(big(l)).toEqual(['skirmish', 'practice']);
    const m = more(l);
    expect(ids(m)).toEqual(['blitz', 'classic', 'duel', 'onelane', 'cannon', 'boss', 'ranked']);
    expect(m.every((x) => x.state === 'locked')).toBe(true);
    expect(m.find((x) => x.id === 'blitz')).toMatchObject({ lockText: 'Unlocks at Lv 2 · 1 more match', progress: { line: 'Lv 2' } });
    expect(m.find((x) => x.id === 'classic')!.progress!.line).toBe('Lv 3');
    expect(m.some((x) => x.isNew)).toBe(false);
  });

  it('reaching Lv 3 opens Classic: it joins the big tiles', () => {
    expect(big(playerModes(modeList(WED), prof(3, 0), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'practice']);
    expect(big(playerModes(modeList(WED), prof(4, 0), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'practice']);
  });

  it('Boss Weekend is locked below Lv 5, and takes the third tile while live from Lv 5', () => {
    expect(playerModes(modeList(SAT), prof(0, 0), NONE, SAT, 'skirmish').find((m) => m.id === 'boss')!.state).toBe('locked');
    const l = playerModes(modeList(SAT), prof(8, 0), NONE, SAT, 'skirmish');
    expect(big(l)).toEqual(['skirmish', 'classic', 'boss']);
    expect(more(l)[0]).toMatchObject({ id: 'practice', state: 'live' });
  });

  it('a just-unlocked mode takes the spotlight with NEW; after a match of it, the last choice holds it', () => {
    const local: ModeLocal = { fresh: ['classic'], seen: [] };
    const l = playerModes(modeList(WED), prof(4, 0), local, WED, 'skirmish');
    expect(l.find((m) => m.id === 'classic')).toMatchObject({ isNew: true, fresh: true });
    const fl: ModeLocal = { fresh: ['blitz'], seen: [] };
    expect(big(playerModes(modeList(WED), prof(4, 0), fl, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'blitz']);
    expect(unseenFresh(fl)).toEqual(['blitz']);
    const seen = { ...fl, seen: ['blitz'] };
    expect(playerModes(modeList(WED), prof(4, 0), seen, WED, 'skirmish').find((m) => m.id === 'blitz')!.fresh).toBeUndefined();
    const played = notePlayed(seen, 'blitz');
    expect(played).toEqual(NONE);
    expect(big(playerModes(modeList(WED), prof(4, 0), played, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'practice']);
    expect(big(playerModes(modeList(WED), prof(4, 0), played, WED, 'blitz'))).toEqual(['skirmish', 'classic', 'blitz']);
    // the newest of two fresh unlocks leads
    expect(big(playerModes(modeList(WED), prof(6, 1), { fresh: ['blitz', 'duel'], seen: [] }, WED, 'skirmish'))[2]).toBe('duel');
  });

  it('a locked last choice never takes the spotlight', () => {
    expect(big(playerModes(modeList(WED), prof(4, 0), NONE, WED, 'ranked'))).toEqual(['skirmish', 'classic', 'practice']);
  });

  it('a featured mode follows its level too (open and big in its window once reached)', () => {
    const blitz = BASE_MODES.find((m) => m.id === 'blitz')!;
    const ends = WED + 3600_000;
    registerMode({ ...blitz, state: { event: { endsAt: ends } } });
    expect(playerModes(modeList(WED), prof(1, 0), NONE, WED, 'skirmish').find((m) => m.id === 'blitz')!.state).toBe('locked');
    expect(big(playerModes(modeList(WED), prof(4, 0), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'blitz']);
  });

  it('the Weekly Twist opens at Lv 4 and then takes an empty spotlight', () => {
    registerMode(twistModeDef({ id: 'twist' as never, name: 'Toy Box', rules: ['Toys.'], endsAt: WED + 86_400_000 }));
    expect(more(playerModes(modeList(WED), prof(4, 0), NONE, WED, 'skirmish')).find((m) => m.id === 'twist')!.state).toBe('locked');
    expect(big(playerModes(modeList(WED), prof(6, 1), NONE, WED, 'skirmish'))).toEqual(['skirmish', 'classic', 'twist']);
    expect(big(playerModes(modeList(WED), prof(6, 1), NONE, WED, 'duel'))).toEqual(['skirmish', 'classic', 'duel']);
  });

  it('never more than 3 big, never a locked big tile, for any profile, event window and choice', () => {
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
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(b.length).toBeLessThanOrEqual(3);
      expect(b[0].id).toBe('skirmish');
      expect(b.every((x) => x.state !== 'locked')).toBe(true);
      expect(new Set(ids(l)).size).toBe(l.length);
      expect(l.length).toBe(modeList(now).length);
    }
  });

  it('layoutModes keeps the strip in ladder order', () => {
    const { more: m } = layoutModes(playerModes(modeList(WED), prof(25, 9, MODE_UNLOCKS.map((u) => unlockId(u.id))), NONE, WED), prof(25, 9), NONE, WED, 'skirmish');
    expect(ids(m)).toEqual(['blitz', 'duel', 'onelane', 'cannon', 'boss', 'ranked']);
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

  it('anyone else keeps what they played: the saved choice, the history (Classic too) and Ranked with a card', () => {
    expect(migrateUnlocks(prof(1, 0), { saved: 'duel', history: ['blitz', 'skirmish', 'pvp'] }).sort()).toEqual(['mode.blitz', 'mode.duel']);
    expect(migrateUnlocks(prof(1, 0), { rankedPlayed: true })).toEqual(['mode.ranked']);
    // the level ladder's pass: a 1-match player who played Classic or Boss Weekend keeps it
    expect(migrateUnlocks(prof(1, 0), { history: ['classic', 'boss'] }).sort()).toEqual(['mode.boss', 'mode.classic']);
    expect(migrateUnlocks(prof(6, 3), {}).sort()).toEqual(['mode.blitz', 'mode.classic', 'mode.duel', 'mode.twist']);
    expect(migrateUnlocks(prof(0, 0), { saved: 'skirmish', history: ['practice'] })).toEqual([]);
  });

  it('modes played in kept replays stay open (history rows only name Skirmish, Classic and Blitz)', () => {
    const before = MODE_UNLOCKS_SHIPPED - 60_000;
    const rows = [
      { id: 'a', at: before },
      { id: 'b', at: before - 1 },
      { id: 'c', at: before - 2 },
      { id: 'd', at: MODE_UNLOCKS_SHIPPED + 60_000 },
      { id: 'e', at: before - 3 },
    ];
    const mut: Record<string, string | undefined> = { a: 'none', b: 'cannon', c: 'duel', d: 'onelane', e: undefined };
    expect(playedBefore(rows, (id) => mut[id]).sort()).toEqual(['cannon', 'duel']);
    // the level pass reads every kept replay
    expect(playedBefore(rows, (id) => mut[id], Number.POSITIVE_INFINITY).sort()).toEqual(['cannon', 'duel', 'onelane']);
    expect(migrateUnlocks(prof(3, 0, ['mode.blitz']), { history: ['cannon', 'duel'] }).sort()).toEqual(['mode.cannon', 'mode.duel']);
  });

  it('an account merged onto a new device: 10+ matches and no mode ids yet gets everything; otherwise only met levels', () => {
    expect(silentUnlocks(prof(25, 1)).veteran).toBe(true);
    expect(silentUnlocks(prof(25, 1)).add.length).toBe(MODE_UNLOCKS.length);
    const s = silentUnlocks(prof(6, 2, ['mode.blitz']));
    expect(s.veteran).toBe(false);
    expect(s.add.sort()).toEqual(['mode.classic', 'mode.duel', 'mode.twist']);
  });
});

describe('entry points and sync', () => {
  it('a saved choice that is locked for this player falls back to Skirmish', () => {
    saveModeChoice({ mode: 'duel', queue: 'bots' });
    const l = playerModes(modeList(WED), prof(5, 0), NONE, WED, 'duel');
    expect(loadModeChoice(l, WED).mode).toBe('skirmish');
    expect(loadModeChoice(playerModes(modeList(WED), prof(6, 0), NONE, WED, 'duel'), WED).mode).toBe('duel');
  });

  it('the NEW state is two short synced lists', () => {
    saveModeLocal({ fresh: ['blitz', 'duel'], seen: ['blitz'] });
    expect(mem.get('pawlegends.modes.new')).toBe('blitz,duel');
    expect(loadModeLocal()).toEqual({ fresh: ['blitz', 'duel'], seen: ['blitz'] });
    // a match crosses one or two levels: the fresh list stays short enough to sync (32 characters)
    expect('classic,duel,twist'.length).toBeLessThanOrEqual(32);
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
