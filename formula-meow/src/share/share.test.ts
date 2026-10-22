import { describe, expect, it } from 'vitest';
import { Modifier, DEFAULT_CAT, SIM_VERSION, type RaceEvent, type RaceMode } from '../types';
import { TRACKS } from '../core/track/tracks';
import { dailyResultDay, dailySetup, dateOfDay, dayNoFor, EMPTY_DAILY, isDailyRace, migrateDaily, recordDaily, type DailyRecord } from './daily/daily';
import { dareableMode, dareUrl, dailyUrl, parseRoute, PUBLIC_BASE } from './links/link';
import { encodeGhostSync, peekGhost, trackKey } from './codec/ghost-codec';
import { pickHeadline } from './cards/headline';
import { duelable, duelGap, gapText, shadowConfig } from './links/duel';
import { dareRace } from './links/dare-flow';
import { encodeCat } from './codec/cat-codec';
import { BANNED_CLAIMS, clipCaption, rivalsLine, dailyCardText, dareText, fmtRaceTime, PINK_PAW_SHARE_LINE } from './cards/card-text';
import { bestWindow, eventScore, planClip } from './clip/highlight';
import { ledgerLine, recordDuel } from './links/rivalry';

const prod = { pathname: '/meow-race', search: '', hash: '', origin: 'https://tokentails.com', hostname: 'tokentails.com' };
const dev = { pathname: '/', search: '', hash: '', origin: 'http://127.0.0.1:5175', hostname: '127.0.0.1' };

describe('daily cup (GDD 14)', () => {
  it('counts UTC days from Day 1', () => {
    expect(dayNoFor(new Date('2026-10-19T00:00:00Z'))).toBe(1);
    expect(dayNoFor(new Date('2026-10-19T23:59:59Z'))).toBe(1);
    expect(dayNoFor(new Date('2026-10-20T00:00:01Z'))).toBe(2);
    expect(dateOfDay(12)).toBe('2026-10-30');
  });

  it('rotates tracks, mirrors every other rotation, same seed for everyone', () => {
    const n = TRACKS.length;
    const d1 = dailySetup(1, TRACKS);
    expect(d1.track.id).toBe(TRACKS[0].id);
    expect(d1.modifiers).toBe(0);
    expect(dailySetup(1 + n, TRACKS).modifiers).toBe(Modifier.Mirror);
    expect(dailySetup(1 + 2 * n, TRACKS).modifiers & Modifier.Mirror).toBe(0); // F11: from day 9 a mutator rides along
    expect(dailySetup(5, TRACKS).seed).toBe(dailySetup(5, TRACKS).seed);
    expect(dailySetup(5, TRACKS).seed).not.toBe(dailySetup(6, TRACKS).seed);
    const d = dailySetup(3, TRACKS);
    expect(isDailyRace(3, TRACKS, { trackId: d.track.id, seed: d.seed, cls: d.cls, modifiers: d.modifiers })).toBe(true);
    expect(isDailyRace(3, TRACKS, { trackId: d.track.id, seed: d.seed + 1, cls: d.cls, modifiers: d.modifiers })).toBe(false);
  });

  it('the first finish of a day is the ranked run; the streak counts consecutive days', () => {
    const rec: DailyRecord = structuredClone(EMPTY_DAILY);
    expect(recordDaily(rec, { day: 4, place: 3, time: 90, laps: [5, 4, 3] })).not.toBeNull();
    expect(recordDaily(rec, { day: 4, place: 1, time: 80, laps: [1, 1, 1] })).toBeNull();
    expect(rec.runs['4'].place).toBe(3);
    recordDaily(rec, { day: 5, place: 2, time: 85, laps: [2, 2, 2] });
    expect(rec.streak).toBe(2);
    recordDaily(rec, { day: 7, place: 2, time: 85, laps: [2] });
    expect(rec.streak).toBe(1);
  });
});

describe('routes and links (GDD 8.3)', () => {
  const ghost = encodeGhostSync({ trackKey: trackKey('rooftops'), seed: 99, cls: 1, modifiers: 0, forgiving: false, slot: 5 }, [0x17, 0x17]);

  it('builds pretty links in production and hash links elsewhere', () => {
    const u = dareUrl(prod, { ghost, cat: DEFAULT_CAT, name: 'Mochi' });
    expect(u.startsWith(`${PUBLIC_BASE}/r#g=`)).toBe(true);
    expect(dailyUrl(prod, 12)).toBe(`${PUBLIC_BASE}/d/12`);
    expect(dareUrl(dev, { ghost }).startsWith('http://127.0.0.1:5175/#g=')).toBe(true);
    expect(dailyUrl(dev, 3)).toBe('http://127.0.0.1:5175/?daily=3');
  });

  it('parses a dare from the hash or the query, with the cat and a filtered name', () => {
    const r = parseRoute({ ...prod, pathname: '/meow-race/r', hash: `#g=${ghost}&c=${encodeCat(DEFAULT_CAT)}&n=Mochi` });
    expect(r.kind).toBe('dare');
    if (r.kind !== 'dare') return;
    expect(r.header.seed).toBe(99);
    expect(r.name).toBe('Mochi');
    expect(r.cat?.base).toBe(DEFAULT_CAT.base);
    const q = parseRoute({ ...dev, search: `?g=${ghost}&n=${encodeURIComponent('visit http://x.y')}` });
    expect(q.kind).toBe('dare');
    if (q.kind === 'dare') expect(q.name).not.toContain('http');
  });

  it('only field races make a dare link (a solo time trial, a cup or a battle arena ghost cannot be replayed)', () => {
    for (const m of [undefined, 'race', 'dare', 'daily', 'tt'] as const) expect(dareableMode(m)).toBe(true);
    for (const m of ['gp', 'battle'] as const) expect(dareableMode(m)).toBe(false);
  });

  it('parses the daily path and query, ignores junk', () => {
    expect(parseRoute({ ...prod, pathname: '/meow-race/d/12' })).toEqual({ kind: 'daily', day: 12 });
    expect(parseRoute({ ...dev, search: '?daily=4' })).toEqual({ kind: 'daily', day: 4 });
    expect(parseRoute({ ...dev, hash: '#g=nonsense' }).kind).toBe('dare-broken');
    expect(parseRoute(prod).kind).toBe('home');
  });
});

describe('share texts are honest (GDD 13)', () => {
  it('the clip intro counts the rivals the run really had (none in a solo time trial)', () => {
    expect(rivalsLine(8)).toBe('vs 7 real Pink Paw shelter cats');
    expect(rivalsLine(2)).toBe('vs 1 real Pink Paw shelter cat');
    expect(rivalsLine(1)).toBeNull();
  });

  it('never claim money, counts or global ranks', () => {
    const texts = [
      dareText({ trackName: 'Kitchen Counter GP', time: 84.31, place: 2, link: 'https://tokentails.com/meow-race/r#g=x' }),
      dareText({ trackName: 'Kitchen Counter GP', time: 84.31, place: 2, link: 'x', beat: 'Mochi' }),
      clipCaption({ trackName: 'Kaunas Neon Rooftops', time: 95.1, place: 1, link: 'x' }),
      dailyCardText({ day: 12, place: 3, time: 101.22, laps: [5, 4, 3], link: 'x', streak: 3 }),
      PINK_PAW_SHARE_LINE,
    ];
    for (const t of texts) for (const re of BANNED_CLAIMS) expect(t).not.toMatch(re);
    expect(PINK_PAW_SHARE_LINE).toContain('https://tokentails.com/shelter-payouts');
  });

  it('formats times and the Wordle-style daily card', () => {
    expect(fmtRaceTime(84.314)).toBe('1:24.31');
    expect(fmtRaceTime(null)).toBe('DNF');
    expect(dailyCardText({ day: 12, place: 3, time: 101.22, laps: [5, 7, 3], link: 'L' })).toBe('Formula Meow Daily #12 · 3rd/8 · 1:41.22\n🟧⬜🟪\nL');
    expect(dailyCardText({ day: 12, place: 3, time: 101.22, laps: [5, 7, 3], link: 'L', ghost: true })).toBe('Formula Meow Daily #12 · 3rd/8 · 1:41.22\n🟧⬜🟪\nBeat my 1:41.22 👻\nL');
  });
});

describe('clip plan (GDD 9.1)', () => {
  const ev = (tick: number, type: RaceEvent['type'], kart: number, a?: number, b?: number): RaceEvent => ({ tick, type, kart, a, b });

  it('scores only the player’s moments', () => {
    expect(eventScore(ev(1, 'overtake', 5), 5)).toBe(2);
    expect(eventScore(ev(1, 'overtake', 2), 5)).toBe(0);
    expect(eventScore(ev(1, 'hit', 2, 1, 5), 5)).toBe(4);
    expect(eventScore(ev(1, 'hit', 2, 0, 5), 5)).toBe(3);
    expect(eventScore(ev(1, 'miniTurbo', 5, 3), 5)).toBe(2);
    expect(eventScore(ev(1, 'miniTurbo', 5, 2), 5)).toBe(0);
  });

  it('finds the busiest window and keeps the shots in time order', () => {
    const events = [ev(2000, 'overtake', 5), ev(2050, 'overtake', 5), ev(2100, 'trick', 5), ev(3000, 'overtake', 5), ev(5000, 'finish', 5, 1)];
    const s = bestWindow(events, 5, 180, 4964, 420);
    expect(s).toBeLessThanOrEqual(2000);
    expect(s + 420).toBeGreaterThan(2100);
    const p = planClip(events, 5, 180, 5400);
    expect(p.introTick).toBe(90);
    expect(p.finishTick).toBe(5000);
    expect(p.hlStart + p.hlLen).toBeLessThanOrEqual(p.finishStart!);
    expect(p.hlLen).toBe(420);
  });

  it('a window where the player respawns or gets hit loses to an otherwise equal one', () => {
    // every window around the 3000 overtake also holds a respawn or a hit taken
    const events = [ev(1000, 'overtake', 5), ev(2950, 'respawn', 5), ev(3000, 'overtake', 5), ev(3050, 'hit', 5, 0, 2), ev(5000, 'finish', 5, 1)];
    const s = bestWindow(events, 5, 180, 4964, 420);
    expect(s).toBeLessThanOrEqual(1000);
    expect(s + 420).toBeGreaterThan(1000);
    expect(eventScore(ev(10, 'respawn', 5), 5)).toBeLessThanOrEqual(-6);
  });

  it('a short race still plans (no finish = no finish shot)', () => {
    const p = planClip([], 5, 180, 400);
    expect(p.finishStart).toBeNull();
    expect(p.hlStart).toBe(180);
    expect(p.hlLen).toBe(220);
  });
});

describe('rivalry ledger (GDD 8.2)', () => {
  it('counts wins and losses per opponent', () => {
    const l = {};
    recordDuel(l, 'Mochi', true);
    recordDuel(l, 'Mochi', true);
    recordDuel(l, 'Mochi', false);
    expect(ledgerLine(l, 'Mochi')).toBe('Rivalry: You 2 · Mochi 1');
    expect(ledgerLine(l, 'Luna')).toBeNull();
  });
});

describe('daily cup across UTC midnight', () => {
  const race = (day: number) => {
    const d = dailySetup(day, TRACKS);
    return { trackId: d.track.id, seed: d.seed, cls: d.cls, modifiers: d.modifiers };
  };

  it('judges the race by the day it started, not the day the page loaded', () => {
    // page loaded on day 10, the tab stayed open: day 12's cup started and finished on day 12
    expect(dailyResultDay(TRACKS, race(12), { setupDay: 12, startDay: 12, nowDay: 12 })).toEqual({ day: 12, rankable: true });
    // started at 23:59 on day 12, finished on day 13: still day 12's ranked run
    expect(dailyResultDay(TRACKS, race(12), { setupDay: 12, startDay: 12, nowDay: 13 })).toEqual({ day: 12, rankable: true });
    // restarted after midnight: yesterday's cup is practice
    expect(dailyResultDay(TRACKS, race(12), { setupDay: 12, startDay: 13, nowDay: 13 })).toEqual({ day: 12, rankable: false });
    // an old daily link is practice
    expect(dailyResultDay(TRACKS, race(5), { setupDay: 5, startDay: 13, nowDay: 13 })).toEqual({ day: 5, rankable: false });
    // a dare on today's daily seed (no setup day) is the same race
    expect(dailyResultDay(TRACKS, race(13), { startDay: 13, nowDay: 13 })).toEqual({ day: 13, rankable: true });
    // not a daily race at all
    expect(dailyResultDay(TRACKS, { ...race(13), seed: race(13).seed + 1 }, { startDay: 13, nowDay: 13 })).toBeNull();
    // a future day is not out yet
    expect(dailyResultDay(TRACKS, race(14), { setupDay: 14, startDay: 13, nowDay: 13 })).toBeNull();
  });

  it('a malformed fm:daily record is repaired, never thrown on', () => {
    for (const raw of [null, 5, 'x', [], { runs: 5 }, { runs: [1, 2] }, { runs: null, streak: 'a', lastDay: -3 }]) {
      const rec = migrateDaily(raw);
      expect(rec).toEqual({ runs: {}, streak: 0, lastDay: 0 });
      expect(() => recordDaily(rec, { day: 3, place: 1, time: 80, laps: [1] })).not.toThrow();
    }
    const good = migrateDaily({ runs: { '3': { day: 3, place: 2, time: 81.5, laps: [2, 2, 'x'] }, '4': { day: 9 }, '5': 7 }, streak: 2, lastDay: 3 });
    expect(good).toEqual({ runs: { '3': { day: 3, place: 2, time: 81.5, laps: [2, 2] } }, streak: 2, lastDay: 3 });
    // a fresh object every time: recording never mutates the shared EMPTY_DAILY
    recordDaily(migrateDaily(undefined), { day: 3, place: 1, time: 80, laps: [1] });
    expect(EMPTY_DAILY.runs).toEqual({});
  });
});

describe('results headline (iteration 4, F7)', () => {
  type Row = { kart: number; name: string; place: number; time: number | null; bestLap: number | null; gap?: number | null };
  const res = (rows: Row[], me: number, mode: RaceMode = 'race') => {
    const p = rows.find((r) => r.kart === me)!;
    return { places: rows, player: { kart: me, place: p.place, time: p.time, bestLap: null }, mode };
  };
  const row = (kart: number, place: number, time: number | null, name = `Cat ${kart}`, gap?: number): Row => ({ kart, name, place, time, bestLap: null, ...(gap != null ? { gap } : {}) });

  it('a dare ghost first: won by, lost by, still checking', () => {
    const r = res([row(5, 1, 80)], 5);
    expect(pickHeadline({ result: r, ghost: { name: 'Zyg', time: 81.2 } })).toMatchObject({ kind: 'ghost', tone: 'win', text: "You beat Zyg's ghost by 1.20 s" });
    expect(pickHeadline({ result: r, ghost: { name: 'Zyg', time: 79.69 } })).toMatchObject({ tone: 'lose', text: "Lost to Zyg's ghost by 0.31 s" });
    expect(pickHeadline({ result: r, ghost: { name: 'Zyg', time: null } })?.text).toBe("You beat Zyg's ghost");
    expect(pickHeadline({ result: r, ghost: { name: 'Zyg', time: null }, ghostPending: true })?.kind).toBe('pending');
    // the same run replayed (or a real tie to the hundredth): a dead heat, not a loss by 0.00 s
    expect(pickHeadline({ result: r, ghost: { name: 'Zyg', time: 80.001 } })).toMatchObject({ tone: 'photo', text: "Dead heat with Zyg's ghost!" });
  });

  it('then a photo finish, the rival margin, a new best', () => {
    // 2nd, 0.07 s behind the winner: a photo finish
    expect(pickHeadline({ result: res([row(1, 1, 80, 'Medutis'), row(5, 2, 80.07), row(2, 3, 84)], 5) })?.text).toBe('PHOTO FINISH by 0.07 s');
    // 2nd, 0.4 s behind: who beat you
    expect(pickHeadline({ result: res([row(1, 1, 80, 'Medutis'), row(5, 2, 80.4), row(2, 3, 84)], 5) })?.text).toBe('Medutis beat you by 0.40 s');
    // a clear win
    expect(pickHeadline({ result: res([row(5, 1, 80), row(1, 2, 81.8, 'Medutis')], 5) })).toMatchObject({ tone: 'win', text: 'WON BY 1.80 s' });
    // 3rd, the 4th cat 0.9 s back and nothing else: a new best beats "held off"
    const third = res([row(1, 1, 78), row(2, 2, 79), row(5, 3, 80), row(3, 4, 80.9, 'Luna')], 5);
    expect(pickHeadline({ result: third, prevBest: 81 })?.text).toBe('New best by 1.00 s');
    expect(pickHeadline({ result: third, prevBest: 79 })?.text).toBe('You held off Luna by 0.90 s');
    // a cat still racing (projected) is never a photo finish
    expect(pickHeadline({ result: res([row(5, 1, 80), row(1, 2, null, 'Medutis', 0.1)], 5), prevBest: 70 })?.kind).not.toBe('photo');
  });

  it('a time trial: new best, or how far off it; a battle and a DNF have none', () => {
    expect(pickHeadline({ result: res([row(0, 1, 60)], 0, 'tt'), prevBest: null })?.text).toBe('First record set!');
    expect(pickHeadline({ result: res([row(0, 1, 60)], 0, 'race'), prevBest: null })?.text).toBe('New best');
    expect(pickHeadline({ result: res([row(0, 1, 60)], 0, 'tt'), prevBest: 61.5 })?.text).toBe('New best by 1.50 s');
    expect(pickHeadline({ result: res([row(0, 1, 60)], 0, 'tt'), prevBest: 59.25 })).toMatchObject({ tone: 'plain', text: '0.75 s off your best' });
    expect(pickHeadline({ result: res([row(5, 1, 60)], 5, 'battle') })).toBeNull();
    expect(pickHeadline({ result: res([row(1, 1, 80), row(5, 2, null)], 5), prevBest: 70 })).toBeNull();
  });
});

describe('ghost duels (iteration 4, F9)', () => {
  it('the live gap: when the ghost was where I am now, with the sub-tick crossing', () => {
    // the ghost moves 1 m a tick from GO (tick 10)
    const dist = new Float32Array(200);
    for (let i = 0; i < 200; i++) dist[i] = Math.max(0, i - 10);
    const tr = { dist, ticks: 199, go: 10 };
    expect(duelGap(tr, 5, 0)).toBeNull();
    // at tick 100 I am at 80 m; the ghost was there at tick 90: 10 ticks behind
    expect(duelGap(tr, 100, 80)).toBeCloseTo(10 / 60, 5);
    // ahead: at tick 100 I am at 95 m, the ghost gets there at tick 105
    expect(duelGap(tr, 100, 95)).toBeCloseTo(-5 / 60, 5);
    expect(duelGap(tr, 100, 80.5)).toBeCloseTo(9.5 / 60, 5);
    // past the ghost's last point: ahead by at least the time to its end, then no reading
    expect(duelGap(tr, 150, 500)).toBeCloseTo(-49 / 60, 5);
    expect(duelGap(tr, 250, 500)).toBeNull();
    expect(gapText(0.4234)).toEqual({ text: '+0.42', ahead: false });
    expect(gapText(-0.18)).toEqual({ text: '−0.18', ahead: true });
  });

  it('the shadow race: eight karts for a race ghost, the lone kart for a time trial or a duel run', () => {
    const track = TRACKS[0];
    const base = { trackKey: trackKey(track.id), seed: 5, cls: 1 as const, modifiers: 0, forgiving: false, slot: 5, simVersion: SIM_VERSION, ticks: 10, rival: 2 };
    const race = shadowConfig(base, track, 'Mia', null);
    expect(race.racers).toHaveLength(8);
    expect(race.humans).toEqual([5]);
    expect(race.racers[2].rival).toBe(true);
    const tt = shadowConfig({ ...base, slot: 0, mode: 'tt' }, track, 'Mia', null);
    expect(tt.racers).toHaveLength(1);
    expect(tt.humans).toEqual([0]);
    expect(tt.mode).toBe('tt');
    const solo = shadowConfig({ ...base, slot: 0, mode: 'dare', solo: true }, track, 'Mia', null);
    expect(solo.racers).toHaveLength(1);
    expect(solo.mode).toBe('dare');
  });

  it('a dare of this build is a duel (1v1, or the pack); a time trial dare is a time trial; older ones are target-time races', () => {
    const g = { simVersion: SIM_VERSION, mode: 'race' as const, slot: 5 };
    expect(dareRace(g, false)).toEqual({ mode: 'dare', solo: true });
    expect(dareRace(g, true)).toEqual({ mode: 'dare', solo: false });
    expect(dareRace({ ...g, mode: 'tt', slot: 0 }, true)).toEqual({ mode: 'tt', solo: true });
    expect(dareRace({ ...g, simVersion: SIM_VERSION - 1 }, false)).toEqual({ mode: 'dare', solo: false });
    expect(duelable({ ...g, simVersion: SIM_VERSION - 1 })).toBe(false);
    expect(duelable({ ...g, mode: 'gp' })).toBe(false);
    expect(duelable({ ...g, mode: 'battle' })).toBe(false);
  });

  it('the ghost header carries the duel bit in the old reserved bit (older links read false)', () => {
    const h = { trackKey: 1, seed: 2, cls: 1 as const, modifiers: 0, forgiving: false, slot: 0, mode: 'dare' as const };
    expect(peekGhost(encodeGhostSync({ ...h, solo: true }, [0x17]))?.solo).toBe(true);
    expect(peekGhost(encodeGhostSync(h, [0x17]))?.solo).toBeUndefined();
  });
});

describe('headline copy at 390 px (playtest, iteration 4)', () => {
  it('a time never wraps away from its "s": the seconds in the headline lines are joined by a no-break space', async () => {
    const { SHARE_EN } = await import('../ui/strings/share.en');
    for (const k of ["You beat {name}'s ghost by {s} s", "Lost to {name}'s ghost by {s} s", '{name} beat you by {s} s', 'You held off {name} by {s} s']) {
      expect(SHARE_EN[k]).toContain('{s} s');
    }
  });
});
