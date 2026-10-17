import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COSMETICS, PROP_KINDS, type FriendGhost, type MyRoom, type ProgressApi, type SimEvent, type Store } from '../types';
import { createStore, type StorageLike } from '../platform/storage';
import { DAY1 as CONTENT_DAY1, dayNoFor } from '../content';
import {
  DAY1,
  addRunXp,
  claimTier,
  claimableTiers,
  cosmeticFromKey,
  crimeCatalog,
  crimes,
  crimesIn,
  dateOfDay,
  dayNoOf,
  exportSave,
  friends,
  hideFriend,
  importSave,
  isoWeekId,
  myRooms,
  ownedCosmetics,
  parPaws,
  progress,
  rapSheet,
  recordCrimes,
  recordRankedDay,
  saveFriend,
  saveMyRoom,
  season,
  seasonFor,
  seasonTrack,
  streakDetail,
  tierFor,
  weekly,
  weeklyLine,
  weeklyReadyAt,
  xpFor,
  XP_PER_TIER,
  SEASON_TIERS,
  FRIENDS_CAP,
  MY_ROOMS_CAP,
  SPECIAL_CRIMES,
} from './index';

// DST cases need a zone with DST; Vilnius changes on the EU dates (Mar 28 and Oct 31, 2027).
const prevTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Vilnius';
});
afterAll(() => {
  if (prevTz === undefined) delete process.env.TZ;
  else process.env.TZ = prevTz;
});

const mem = (): Store => {
  const data = new Map<string, string>();
  const ls: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  return createStore('t:', ls);
};

describe('dates', () => {
  it('DAY1 and dayNo match content', () => {
    expect(DAY1).toBe(CONTENT_DAY1);
    for (const d of [new Date(2026, 10, 16, 0, 1), new Date(2026, 11, 3, 23, 59), new Date(2027, 2, 28, 3, 30), new Date(2027, 2, 29, 12), new Date(2027, 9, 31, 2, 30)]) {
      expect(dayNoOf(d)).toBe(dayNoFor(d));
    }
    expect(dayNoOf(dateOfDay(134))).toBe(134);
    expect(dayNoOf(dateOfDay(-3))).toBe(-3);
  });
  it('ISO week ids are Monday-based, incl. the 53-week year', () => {
    expect(isoWeekId(new Date(2026, 10, 16))).toBe('2026-W47');
    expect(isoWeekId(new Date(2026, 10, 22, 23, 59))).toBe('2026-W47');
    expect(isoWeekId(new Date(2026, 10, 23, 0, 0))).toBe('2026-W48');
    expect(isoWeekId(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeekId(new Date(2027, 0, 4))).toBe('2027-W01');
  });
  it('week boundaries and Sunday 18:00 hold across DST (spring and autumn)', () => {
    // Spring forward: Sun Mar 28, 2027 has 23 hours.
    const ready = weeklyReadyAt(new Date(2027, 2, 24, 9));
    expect([ready.getDate(), ready.getHours(), ready.getMinutes()]).toEqual([28, 18, 0]);
    expect(isoWeekId(new Date(2027, 2, 28, 23, 59))).toBe(isoWeekId(new Date(2027, 2, 22, 0, 1)));
    expect(isoWeekId(new Date(2027, 2, 29, 0, 0))).not.toBe(isoWeekId(new Date(2027, 2, 28, 23, 59)));
    // Fall back: Sun Oct 31, 2027 has 25 hours.
    const r2 = weeklyReadyAt(new Date(2027, 9, 31, 1));
    expect([r2.getDate(), r2.getHours()]).toEqual([31, 18]);
    expect(isoWeekId(new Date(2027, 9, 31, 23, 30))).toBe('2027-W43');
    expect(isoWeekId(new Date(2027, 10, 1, 0, 30))).toBe('2027-W44');
  });
});

describe('rap sheet (48+)', () => {
  it('catalog: every scoring or grabbable prop kind plus 8+ specials, at least 48', () => {
    const cat = crimeCatalog();
    const kinds = PROP_KINDS.filter((k) => k.base > 0 || k.grabbable).length;
    expect(cat.length).toBe(kinds + SPECIAL_CRIMES.length);
    expect(cat.length).toBeGreaterThanOrEqual(48);
    expect(new Set(cat.map((c) => c.id)).size).toBe(cat.length);
    for (const id of ['framed-roomba', 'tablecloth-pull', 'cable-pull', 'zoom-crash', 'puddle-slide', 'stack-avalanche', 'tree-topple', 'accomplice', 'box-sit']) {
      expect(cat.some((c) => c.id === id)).toBe(true);
    }
    expect(cat.every((c) => c.icon && c.name && c.blurb)).toBe(true);
    expect(cat.some((c) => c.id === 'kind-14' || c.id === 'kind-20')).toBe(false); // tablecloth / roomba are specials
  });

  it('crime ids for v5 events', () => {
    const ev: SimEvent[] = [
      { t: 'pull', tick: 1, prop: 3, dir: 1, kind: 'cloth', moved: 3 },
      { t: 'pull', tick: 2, prop: 4, dir: 1, kind: 'cable', moved: 1 },
      { t: 'slide', tick: 3, fromX: 1, fromZ: 1, x: 2, z: 1 },
      { t: 'stack', tick: 4, prop: 0, items: 4, points: 320 },
      { t: 'break', tick: 4, prop: 0, points: 320, combo: 4 },
      { t: 'topple', tick: 5, prop: 5, cells: 4, dir: 3 },
      { t: 'wish', tick: 6 },
      { t: 'enter', tick: 7, prop: 6 },
      { t: 'framed', tick: 8, prop: 1 },
      { t: 'hit', tick: 8, prop: 1, points: 0, combo: 1, framed: true },
      { t: 'break', tick: 9, prop: 2, points: 300, combo: 2, cam: true },
      { t: 'wake', tick: 10, human: 0 },
      { t: 'end', tick: 2250 },
    ];
    const kinds = [3, 14, 11, 14, 9, 17, 54];
    expect(crimesIn(ev, kinds)).toEqual({
      'tablecloth-pull': 1,
      'cable-pull': 1,
      'puddle-slide': 1,
      'stack-avalanche': 1,
      'kind-3': 1,
      'tree-topple': 1,
      accomplice: 1,
      'box-sit': 1,
      'framed-roomba': 1,
      'zoom-crash': 1,
      'kind-11': 1,
      'woke-napper': 1,
      ghost: 1,
    });
    // v4 stream (no v5 fields) still works; last call wreck
    expect(crimesIn([{ t: 'lastcall', tick: 2100 }, { t: 'break', tick: 2101, prop: 0, points: 1, combo: 1 }, { t: 'seen', tick: 2102, suspicion: 1 }, { t: 'end', tick: 2250 }], [2])).toEqual({ 'last-call': 1, 'kind-2': 1 });
  });

  it('legacy ids migrate; crimes() and rapSheet() with Club gold stamps at 5+', () => {
    const s = mem();
    s.set('rapsheet', { counts: { 'prop:wine-glass': 4, framed: 2, bogus: 'x' }, first: { 'prop:wine-glass': 3 } });
    const now = new Date(2026, 10, 18, 12);
    recordCrimes(s, [{ t: 'break', tick: 1, prop: 0, points: 150, combo: 1 }, { t: 'caught', tick: 2 }, { t: 'end', tick: 2 }], [1], 3, { now });
    const free = crimes(s);
    const club = crimes(s, { club: true });
    const glass = (l: typeof free) => l.find((c) => c.id === 'kind-1')!;
    expect(glass(free)).toMatchObject({ count: 5, gold: false, name: 'Wine glass', icon: '🍷', special: false });
    expect(glass(club).gold).toBe(true);
    expect(club.find((c) => c.id === 'framed-roomba')).toMatchObject({ count: 2, gold: false, special: true });
    expect(club.find((c) => c.id === 'cuddled')?.firstAt).toBe('2026-11-18');
    expect(free.length).toBe(crimeCatalog().length);
    const sum = rapSheet(s);
    expect(sum).toMatchObject({ total: 8, distinct: 3, framed: 2, catalog: crimeCatalog().length, rank: 'Person of Interest' });
    expect(sum.topCrimes[0]).toEqual({ name: 'Wine glass', icon: '🍷', count: 5 });
  });

  it('weekly card: Monday-based week, ready Sunday 18:00, most wanted room, null when empty', () => {
    const s = mem();
    const wreck = (n: number): SimEvent[] => [...Array.from({ length: n }, (_, i) => ({ t: 'break' as const, tick: i, prop: 0, points: 250, combo: 1 })), { t: 'framed', tick: 99, prop: 0 }, { t: 'seen', tick: 100, suspicion: 1 }, { t: 'end', tick: 2250 }];
    const mon = new Date(2026, 10, 23, 9); // Mon, Day 8 (Kitchen)
    const tue = new Date(2026, 10, 24, 20); // Tue, Day 9 (Living room)
    expect(weekly(s, mon)).toBeNull();
    recordCrimes(s, wreck(3), [7], 8, { now: mon });
    recordCrimes(s, wreck(1), [7], 9, { now: tue });
    recordCrimes(s, wreck(2), [7], 8, { now: tue, room: 'Kitchen' });
    const sunEarly = new Date(2026, 10, 29, 17, 59);
    const w = weekly(s, sunEarly, { club: true, seen: 12, mostWanted: ['Mochi', 'Tofu'] })!;
    expect(w).toMatchObject({ weekId: '2026-W48', crimes: 9, framed: 3, mostWantedIn: 'Kitchen', ready: false, seen: 12, mostWanted: ['Mochi', 'Tofu'] });
    expect(w.topCrimes[0]).toEqual({ name: 'Vase with flowers', icon: '💐', count: 6 });
    expect(weekly(s, new Date(2026, 10, 29, 18, 0))!.ready).toBe(true);
    expect(weekly(s, new Date(2026, 10, 29, 18, 0), { seen: 5 })!.seen).toBeUndefined(); // seen counter is Club
    expect(weekly(s, new Date(2026, 10, 30, 0, 1))).toBeNull(); // next week, nothing yet
    expect(weeklyLine('Mochi', w)).toBe("Mochi's week: 9 crimes, 6× vase with flowers, framed the Roomba 3 times. Most wanted in Kitchen.");
  });
});

describe('streak detail + Nine Lives', () => {
  it('atRisk and breaksTonight with 1 (free) vs 3 (Club) freezes', () => {
    const s = mem();
    recordRankedDay(s, 1);
    recordRankedDay(s, 2);
    // Day 3 not played yet: at risk; skipping it uses the free freeze, so it does not break tonight.
    expect(streakDetail(s, 3)).toMatchObject({ current: 2, atRisk: true, breaksTonight: false, freezesLeft: 1, local: false });
    // Day 4 after missing 3: freeze pending; skipping 4 too would break (free) ...
    expect(streakDetail(s, 4)).toMatchObject({ current: 2, atRisk: true, breaksTonight: true, freezesLeft: 0 });
    // ... but not with Club's 3 a week
    const c = mem();
    recordRankedDay(c, 1, { freezesPerWeek: 3 });
    recordRankedDay(c, 2, { freezesPerWeek: 3 });
    expect(streakDetail(c, 4, { freezesPerWeek: 3 })).toMatchObject({ current: 2, atRisk: true, breaksTonight: false, freezesLeft: 2 });
    expect(streakDetail(c, 6, { freezesPerWeek: 3 })).toMatchObject({ current: 2, atRisk: true, breaksTonight: true, freezesLeft: 0 });
    recordRankedDay(s, 4);
    expect(streakDetail(s, 4)).toMatchObject({ current: 3, atRisk: false, breaksTonight: false });
    expect(streakDetail(s, 9)).toMatchObject({ current: 0, atRisk: false });
  });
  it('a blocked store reports local: true', () => {
    expect(streakDetail(createStore('t:', null), 1).local).toBe(true);
  });
});

describe('season track', () => {
  it('maps local dates to seasons, incl. generated ones', () => {
    expect(seasonFor(new Date(2026, 9, 16)).id).toBe('pre');
    expect(seasonFor(new Date(2026, 10, 16, 0, 0)).id).toBe('s0');
    expect(seasonFor(new Date(2026, 11, 1)).id).toBe('s1');
    expect(seasonFor(new Date(2027, 0, 10, 23, 59)).id).toBe('s1');
    expect(seasonFor(new Date(2027, 0, 11)).id).toBe('s2');
    expect(seasonFor(new Date(2027, 3, 4)).id).toBe('s3');
    expect(seasonFor(new Date(2027, 3, 5))).toMatchObject({ id: 's4', start: '2027-04-05', end: '2027-05-16' });
    expect(seasonFor(new Date(2027, 4, 17)).id).toBe('s5');
  });
  it('tier maths', () => {
    expect(xpFor(4321)).toBe(143);
    expect(xpFor(-5)).toBe(100);
    expect([tierFor(0), tierFor(XP_PER_TIER - 1), tierFor(XP_PER_TIER), tierFor(XP_PER_TIER * 99)]).toEqual([0, 0, 1, SEASON_TIERS]);
    const track = seasonTrack('s1');
    expect(track).toHaveLength(30);
    expect(track.filter((t) => t.free).every((t) => t.tier <= 15)).toBe(true);
    expect(track.filter((t) => t.club).every((t) => t.tier > 15)).toBe(true);
    expect(track.some((t) => t.free && t.club)).toBe(false);
    expect(track.find((t) => t.club?.name === 'Santa hat')).toBeTruthy();
    expect(track.every((t) => t.title.length > 0)).toBe(true);
  });
  it('XP caps: ranked once per dayNo, practice 5 runs a local day, new season resets', () => {
    const s = mem();
    const d = new Date(2026, 11, 3, 10);
    const o = (ranked: boolean, dayNo = 18, now = d) => ({ ranked, dayNo, now, club: false });
    expect(addRunXp(s, { score: 4321, mode: 'ranked' }, o(true)).xp).toBe(143);
    expect(addRunXp(s, { score: 4321, mode: 'ranked' }, o(true)).xp).toBe(143 + 143); // 2nd "ranked" = practice 1
    for (let i = 0; i < 4; i++) addRunXp(s, { score: 1000, mode: 'practice' }, o(false));
    const capped = addRunXp(s, { score: 1000, mode: 'practice' }, o(false)).xp;
    expect(capped).toBe(143 * 2 + 4 * 110);
    const nextDay = addRunXp(s, { score: 1000, mode: 'practice' }, o(false, 19, new Date(2026, 11, 4, 9))).xp;
    expect(nextDay).toBe(capped + 110);
    expect(addRunXp(s, { score: 0, mode: 'ftue' }, o(true, 20, new Date(2026, 11, 4, 10))).xp).toBe(nextDay + 100); // ftue = practice
    expect(addRunXp(s, { score: 0, mode: 'ranked' }, o(true, 57, new Date(2027, 0, 11, 9))).xp).toBe(100); // S2 starts fresh
  });
  it('a daily player (ranked + 1 practice at ~4,000) reaches tier 30 in about 5 weeks', () => {
    const s = mem();
    let day = 0;
    for (let i = 0; i < 60; i++) {
      const now = new Date(2026, 11, 1 + i, 20);
      addRunXp(s, { score: 4000, mode: 'ranked' }, { ranked: true, dayNo: 16 + i, now, club: true });
      const v = addRunXp(s, { score: 4000, mode: 'practice' }, { ranked: false, dayNo: 16 + i, now, club: true });
      if (v.tier >= 30) {
        day = i + 1;
        break;
      }
    }
    expect(day).toBeGreaterThanOrEqual(28);
    expect(day).toBeLessThanOrEqual(38);
  });
  it('claims: free tiers 1..15, Club all 30; claim returns the cosmetic once', () => {
    const s = mem();
    const now = new Date(2026, 11, 10, 12);
    addRunXp(s, { score: 2_900_000, mode: 'ranked' }, { ranked: true, dayNo: 25, now, club: false });
    const free = season(s, now, { club: false });
    expect(free).toMatchObject({ id: 's1', name: 'Deck the Halls', tier: 30, xpPerTier: XP_PER_TIER, start: '2026-12-01', end: '2027-01-10', daysLeft: 32 });
    expect(free.tiers[14].unlocked).toBe(true);
    expect(free.tiers[15].unlocked).toBe(false);
    expect(claimableTiers(free)).toHaveLength(15);
    const t5 = claimTier(s, 5, now, { club: false });
    expect(t5).toMatchObject({ slot: 'collar', name: 'Candy-cane collar' });
    expect(claimTier(s, 5, now, { club: false })).toBeNull();
    expect(claimTier(s, 20, now, { club: false })).toBeNull(); // Club tier
    expect(claimTier(s, 1, now, { club: false })).toBeNull(); // title-only tier, still claimed
    expect(season(s, now, { club: false }).tiers[0].claimed).toBe(true);
    expect(claimTier(s, 20, now, { club: true })).toMatchObject({ name: 'Elf collar', source: 'club_track' });
    expect(claimTier(s, 31, now, { club: true })).toBeNull();
    const keys = ownedCosmetics(s);
    expect(keys.map((k) => cosmeticFromKey(k)?.name).sort()).toEqual(['Candy-cane collar', 'Elf collar']);
  });
  it('streak milestones grant the Streak star collar (7 days)', () => {
    const s = mem();
    for (let d = 1; d <= 6; d++) recordRankedDay(s, d);
    expect(ownedCosmetics(s)).toEqual([]);
    recordRankedDay(s, 7);
    const star = COSMETICS.find((c) => c.source === 'streak')!;
    expect(ownedCosmetics(s)).toEqual([star.id]); // collar keys equal the collar id
  });
});

describe('par paws', () => {
  it('bronze, silver, gold; no par = none', () => {
    const par = { bronze: 1000, silver: 3000, gold: 6000 };
    expect([parPaws(999, par), parPaws(1000, par), parPaws(3000, par), parPaws(9000, par), parPaws(9000), parPaws(NaN, par)]).toEqual([0, 1, 2, 3, 0, 0]);
  });
});

describe('friends board + my rooms', () => {
  const g = (i: number, over: Partial<FriendGhost> = {}): FriendGhost => ({ roomId: `d${i % 3}`, ghost: `G${i}x`, catCode: `C${i}`, name: `Cat${i}`, score: i * 10, at: 1000 + i, simVersion: 5, ...over });
  it('per room, best first, dedupe, cap 50 overall, hide list', () => {
    const s = mem();
    for (let i = 0; i < 60; i++) saveFriend(s, g(i));
    const total = ['d0', 'd1', 'd2'].reduce((a, r) => a + friends(s, r).length, 0);
    expect(total).toBe(FRIENDS_CAP);
    const d0 = friends(s, 'd0');
    expect(d0[0].score).toBeGreaterThan(d0[d0.length - 1].score);
    expect(d0.some((x) => x.name === 'Cat0')).toBe(false); // oldest dropped
    // same friend (cat code + name) keeps the better score
    saveFriend(s, g(59, { ghost: 'Worse', score: 1 }));
    expect(friends(s, 'd2').filter((x) => x.name === 'Cat59')).toHaveLength(1);
    expect(friends(s, 'd2').find((x) => x.name === 'Cat59')!.score).toBe(590);
    saveFriend(s, g(59, { ghost: 'Better', score: 9999 }));
    expect(friends(s, 'd2')[0]).toMatchObject({ name: 'Cat59', ghost: 'Better' });
    hideFriend(s, 'd2', 'Better');
    expect(friends(s, 'd2').some((x) => x.ghost === 'Better')).toBe(false);
    saveFriend(s, g(59, { ghost: 'Better', score: 9999 }));
    expect(friends(s, 'd2').some((x) => x.ghost === 'Better')).toBe(false); // hidden stays hidden
    saveFriend(s, { ...g(1), ghost: 'bad ghost!' });
    expect(friends(s, 'd1').some((x) => x.ghost === 'bad ghost!')).toBe(false);
  });
  it('my rooms: newest first, update in place, cap 30', () => {
    const s = mem();
    const r = (i: number): MyRoom => ({ code: `R${i}`, title: `Room ${i}`, author: 'Zyg', cleared: false, at: 100 + i });
    for (let i = 0; i < 35; i++) saveMyRoom(s, r(i));
    expect(myRooms(s)).toHaveLength(MY_ROOMS_CAP);
    expect(myRooms(s)[0].code).toBe('R34');
    saveMyRoom(s, { ...r(34), cleared: true, title: 'Renamed', at: 999 });
    saveMyRoom(s, { ...r(34), cleared: false, at: 1000 });
    expect(myRooms(s).filter((x) => x.code === 'R34')).toHaveLength(1);
    expect(myRooms(s)[0].cleared).toBe(true);
  });
});

describe('save code with every key', () => {
  it('round-trips season, cosmetics, weekly tallies, friends and rooms', async () => {
    const a = mem();
    const now = new Date(2026, 11, 10, 12);
    for (let d = 1; d <= 7; d++) recordRankedDay(a, d);
    recordCrimes(a, [{ t: 'framed', tick: 1, prop: 0 }, { t: 'end', tick: 2 }], undefined, 25, { now });
    addRunXp(a, { score: 200_000, mode: 'ranked' }, { ranked: true, dayNo: 25, now, club: false });
    claimTier(a, 5, now, { club: false });
    saveFriend(a, { roomId: 'd25', ghost: 'AAAA', catCode: 'Bv4', name: 'Mochi', score: 1234, at: 5, simVersion: 5 });
    saveMyRoom(a, { code: 'AgEM', title: 'Zyg kitchen', author: 'Zyg', cleared: true, at: 7 });
    a.set('profile', { cats: [{ name: 'Mochi' }], active: 0, prefs: { reminder: '19:30', music: 0.4 }, abArm: 'B' });
    const code = await exportSave(a);
    const b = mem();
    expect(await importSave(b, code)).toBe(true);
    expect(season(b, now, { club: false }).xp).toBe(season(a, now, { club: false }).xp);
    expect(ownedCosmetics(b)).toEqual(ownedCosmetics(a));
    expect(weekly(b, now)?.framed).toBe(1);
    expect(friends(b, 'd25')[0].name).toBe('Mochi');
    expect(myRooms(b)[0].title).toBe('Zyg kitchen');
    expect(b.get<{ prefs: { reminder: string }; abArm: string }>('profile', null as never)).toMatchObject({ prefs: { reminder: '19:30' }, abArm: 'B' });
    expect(await importSave(b, 'BCD1jnope')).toBe(false);
  });
});

describe('ProgressApi object', () => {
  it('implements every member', () => {
    const keys: (keyof ProgressApi)[] = ['recordRankedDay', 'recordCrimes', 'streakStatus', 'streakDetail', 'rapSheet', 'crimes', 'weekly', 'addRunXp', 'season', 'claimTier', 'parPaws', 'friends', 'saveFriend', 'hideFriend', 'myRooms', 'saveMyRoom', 'ownedCosmetics'];
    for (const k of keys) expect(typeof progress[k]).toBe('function');
    // never throws on a broken store
    const broken = { persistent: true, get() { throw new Error('x'); }, set() { throw new Error('x'); } } as unknown as Store;
    expect(() => {
      progress.recordRankedDay(broken, 1);
      progress.recordCrimes(broken, [], [], 1);
      progress.streakDetail(broken, 1);
      progress.rapSheet(broken);
      progress.crimes(broken);
      progress.weekly(broken, new Date());
      progress.addRunXp(broken, { score: 1, mode: 'ranked' } as never, { ranked: true, dayNo: 1, now: new Date(), club: false });
      progress.season(broken, new Date(), { club: false });
      progress.claimTier(broken, 1, new Date(), { club: false });
      progress.friends(broken, 'x');
      progress.saveFriend(broken, {} as never);
      progress.hideFriend(broken, 'x', 'y');
      progress.myRooms(broken);
      progress.saveMyRoom(broken, {} as never);
      progress.ownedCosmetics(broken);
    }).not.toThrow();
  });
});
