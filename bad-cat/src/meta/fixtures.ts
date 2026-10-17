/** Sample data for the meta tests and the dev harness (not imported by index.ts, never shipped). */
import { cosmetic, FREE_SEASON_TIERS, SEASON_TIERS, SIM_VERSION, type CrimeView, type DailyEntry, type DayRecord, type FriendGhost, type MyRoom, type Profile, type RapSheetSummary, type SeasonView, type WeeklySummary } from '../types';

const ROOMS = ['Kitchen', 'Living room', 'Bathroom', 'Home office', 'Party room', 'Boss: Birthday Party', 'Bedroom'];
const NAMES = ['Breakfast Heist', 'TV Night', 'Toilet Paper Wednesday', 'Zoom Call', 'Felony Friday', 'Cake Day', 'Laundry Day'];

export function sampleEntries(todayNo: number, count: number): DailyEntry[] {
  const out: DailyEntry[] = [];
  for (let d = todayNo - 1; d >= Math.max(1, todayNo - count); d--) {
    const wd = (((d - 1) % 7) + 7) % 7 as DailyEntry['weekday'];
    const date = new Date(2026, 10, 15 + d);
    out.push({
      dayNo: d,
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      weekday: wd,
      roomId: `daily-${String(d).padStart(3, '0')}`,
      title: `${ROOMS[wd]} #${d}: ${NAMES[wd]}`,
      label: `${ROOMS[wd]} #${d}`,
      shell: wd,
      routine: wd,
      human: 'Chef Dad',
      event: 'doorbell',
      targets: ['vase'],
      boss: wd === 5 || undefined,
      theme: wd === 5 ? (d > 14 ? 'xmas' : 'birthday') : 'default',
      felonyFriday: wd === 4 || undefined,
      par: { bronze: 3000, silver: 6000, gold: 9000 },
    });
  }
  return out;
}

export function sampleRecords(dayNo: number): DayRecord | null {
  if (dayNo % 3 === 0) return null;
  const score = 1500 + ((dayNo * 2971) % 9000);
  return { score, stamp: dayNo % 4 === 0 ? 'caught' : dayNo % 5 === 0 ? 'perfect' : 'clean', rank: 'Menace', shared: false };
}

const CRIMES: [string, string, boolean][] = [
  ['Vase', '🏺', false], ['Wine glass', '🍷', false], ['Cake', '🎂', false], ['Mug', '☕', false], ['Plant', '🪴', false],
  ['Phone', '📱', false], ['Remote', '📺', false], ['Toilet roll', '🧻', false], ['Laptop', '💻', false], ['Fishbowl', '🐠', false],
  ['Lamp', '💡', false], ['Picture frame', '🖼️', false], ['Framed the Roomba', '🤖', true], ['Tablecloth pull', '🧺', true],
  ['Zoom crash', '🎥', true], ['Tree topple', '🎄', true], ['Sock smuggler', '🧦', true], ['Woke the Napper', '😴', true],
];
export function sampleCrimes(club: boolean, empty = false): CrimeView[] {
  return CRIMES.map(([name, icon, special], i) => {
    const count = empty ? 0 : i % 4 === 3 ? 0 : [212, 14, 9, 31, 4, 2, 7, 18, 1, 3, 6, 5, 9, 2, 0, 1, 0, 3][i];
    return { id: special ? name.toLowerCase().replace(/\s+/g, '-') : `kind-${i}`, name, icon, count, firstAt: count ? '2026-11-17' : undefined, gold: club && count >= 5, special };
  });
}
export function sampleSummary(empty = false): RapSheetSummary {
  return empty
    ? { total: 0, distinct: 0, catalog: 76, framed: 0, topCrimes: [], rank: 'Person of Interest', streak: 0 }
    : { total: 318, distinct: 14, catalog: 76, framed: 9, topCrimes: [{ name: 'Vase', icon: '🏺', count: 212 }, { name: 'Mug', icon: '☕', count: 31 }, { name: 'Cake', icon: '🎂', count: 14 }], rank: 'Gremlin', streak: 6 };
}

export function sampleSeason(xp: number, club: boolean, claimed: number[] = []): SeasonView {
  const xpPerTier = 300;
  const tier = Math.min(SEASON_TIERS, Math.floor(xp / xpPerTier));
  const free = [cosmetic('collar', 4), cosmetic('hat', 4), cosmetic('trail', 2), cosmetic('collar', 6), cosmetic('hat', 6)];
  const clubItems = [cosmetic('collar', 3), cosmetic('hat', 1), cosmetic('trail', 1), cosmetic('stamp', 1), cosmetic('hat', 2)];
  const tiers: SeasonView['tiers'] = [];
  for (let t = 1; t <= SEASON_TIERS; t++) {
    const row: SeasonView['tiers'][number] = { tier: t, claimed: claimed.includes(t), unlocked: t <= tier && (t <= FREE_SEASON_TIERS || club) };
    if (t <= FREE_SEASON_TIERS && t % 3 === 0) row.free = free[(t / 3 - 1) % free.length];
    if (t > FREE_SEASON_TIERS && t % 3 === 0) row.club = clubItems[((t - 18) / 3) % clubItems.length];
    tiers.push(row);
  }
  return { id: 's1', name: 'Deck the Halls', start: '2026-12-01', end: '2027-01-10', daysLeft: 23, xp, tier, xpPerTier, tiers };
}

export function sampleProfile(): Profile {
  return {
    cats: [],
    active: 0,
    createdAt: 0,
    sessions: 3,
    settings: { audio: true, reduceMotion: false, showPhotoInClips: true },
    prefs: { master: 0.8, music: 0.5, sfx: 1, captionStyle: 0, reminder: '08:30' },
  };
}

export function sampleFriends(): FriendGhost[] {
  return [
    { roomId: 'daily-018', ghost: 'g1', catCode: 'c-mochi', name: 'Mochi', score: 8120, at: 1, simVersion: SIM_VERSION },
    { roomId: 'daily-018', ghost: 'g2', catCode: 'c-biscuit', name: 'Biscuit', score: 4300, at: 2, simVersion: SIM_VERSION },
    { roomId: 'daily-018', ghost: 'g3', catCode: 'c-pickle', name: 'Pickle', score: 9900, at: 3, simVersion: SIM_VERSION - 1 },
  ];
}

export function sampleWeekly(ready: boolean, empty = false): WeeklySummary {
  return empty
    ? { weekId: '2026-W48', crimes: 0, topCrimes: [], framed: 0, ready }
    : { weekId: '2026-W48', crimes: 41, topCrimes: [{ name: 'Vase', icon: '🏺', count: 9 }, { name: 'Mug', icon: '☕', count: 6 }, { name: 'Remote', icon: '📺', count: 4 }], framed: 3, mostWantedIn: 'Kitchen', seen: 128, mostWanted: ['Mochi', 'Biscuit', 'Sir Pounce'], ready };
}

export function sampleRooms(): MyRoom[] {
  return [
    { code: 'r1', title: 'The Wobbly Shelf', author: 'Tofu', cleared: true, at: Date.UTC(2026, 10, 20), buildMs: 94_000 },
    { code: 'r2', title: 'Grandma’s China', author: 'Tofu', cleared: false, at: Date.UTC(2026, 10, 22), ancestors: ['a1', 'a2'], buildMs: 41_000 },
  ];
}
