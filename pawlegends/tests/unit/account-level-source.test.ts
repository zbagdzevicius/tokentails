// @vitest-environment happy-dom
/**
 * The account level's one source (LEADERBOARDS.md, founder Nov 20: "my level ( Zygis ) is 8 and tier 2, but it shows
 * LV 4"): a signed-in player's Home, Profile and mode unlocks show the server's count (the same as the Global board),
 * plus the matches this device finished since the answer; a guest keeps the device count. "Tier" is the Legends Pass
 * tier (Season XP), never the level.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { levelInfo, levelOf, shownMatches } from '../../src/meta/accountLevel';
import { freshProfile, loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { applyView, loadCloud, parseAccount, parseView } from '../../src/meta/progressCloud';
import { isUnlocked, newlyUnlocked } from '../../src/ui/modeSelect/unlocks';
import { accountMatchesOf, legacyCredit } from '../../../backend/src/pawlegends/account-level';
import { levelOf as serverLevelOf } from '../../../backend/src/pawlegends/mode-unlocks';
import { CURRENT_SEASON_ID, SEASONS } from '../../../backend/src/pawlegends/pawlegends-catalog';

beforeEach(() => {
  localStorage.clear();
  resetProfileCache();
});

describe('shownMatches', () => {
  it('a guest (no answer): the device count', () => {
    expect(shownMatches(17, null)).toBe(17);
    expect(shownMatches(-3, null)).toBe(0);
  });

  it("signed in: the server's count, plus matches finished here since the answer, never minus", () => {
    expect(shownMatches(16, { matches: 18, dev: 16 })).toBe(18);
    expect(shownMatches(17, { matches: 18, dev: 16 })).toBe(19);
    // another device's count merged lower here: the server still decides
    expect(shownMatches(4, { matches: 18, dev: 16 })).toBe(18);
    // a device far ahead (forfeits, unsaved party matches) never lifts the level above the server's
    expect(shownMatches(40, { matches: 6, dev: 40 })).toBe(6);
  });
});

describe('the level and the pass tier', () => {
  it("the founder's numbers: 6 saved (Lv 4) + 12 frozen credit = 18 (Lv 8), the same on both sides", () => {
    const server = accountMatchesOf({ pawlegendsMatches: { normal: 6 }, pawlegendsLegacyMatches: legacyCredit(18, 6) });
    expect(server).toBe(18);
    expect(serverLevelOf(server)).toBe(8);
    expect(levelOf(server)).toBe(8);
    expect(levelInfo(shownMatches(18, { matches: server, dev: 18 })).level).toBe(8);
    for (let m = 0; m < 400; m++) expect(levelOf(m)).toBe(serverLevelOf(m));
  });

  it('tier 2 is the Legends Pass tier from Season XP, not the account level', () => {
    const season = SEASONS.find((s) => s.id === CURRENT_SEASON_ID)!;
    const tierOf = (xp: number) => Math.floor(xp / season.xpPerTier);
    expect(tierOf(2 * season.xpPerTier)).toBe(2);
    // a Lv 8 account can be on pass tier 2: two separate numbers
    expect(levelOf(18)).toBe(8);
  });
});

describe('the progress answer carries the account level', () => {
  it('parsed, stored with the device count at the answer, and used by the mode unlocks', () => {
    expect(parseAccount({ matches: 18.7 }, 3)).toEqual({ matches: 18, dev: 3 });
    expect(parseAccount({ matches: -1 })).toBeNull();
    expect(parseAccount(null)).toBeNull();
    saveProfile({ ...freshProfile(), matches: 16 });
    const v = parseView({ blob: { v: 1, counts: { matches: 16 } }, grants: [], account: { matches: 18, level: 8 } })!;
    expect(v.account).toEqual({ matches: 18, dev: 0 });
    const out = applyView(v, loadCloud());
    expect(out.changed).toBe(true);
    expect(loadCloud().account).toEqual({ matches: 18, dev: 16 });
    // an older server without `account`: the stored answer stays
    applyView(parseView({ blob: { v: 1, counts: { matches: 16 } }, grants: [] })!, loadCloud());
    expect(loadCloud().account).toEqual({ matches: 18, dev: 16 });
    // the unlocks read the same number: Practice (Lv 5) open, Ranked (Lv 10) not yet
    const p = { ...loadProfile(), matches: shownMatches(loadProfile().matches, loadCloud().account) };
    expect(isUnlocked({ id: 'practice' }, p)).toBe(true);
    expect(isUnlocked({ id: 'ranked' }, p)).toBe(false);
    // a saved match crossing Lv 10 is announced from the same count
    expect(newlyUnlocked({ matches: 24, wins: 0 }, { ...p, matches: 25 })).toEqual(['ranked']);
  });
});
