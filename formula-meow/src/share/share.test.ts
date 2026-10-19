import { describe, expect, it } from 'vitest';
import { Modifier, DEFAULT_CAT, type RaceEvent } from '../types';
import { TRACKS } from '../core/track/tracks';
import { dailySetup, dateOfDay, dayNoFor, EMPTY_DAILY, isDailyRace, recordDaily, type DailyRecord } from './daily/daily';
import { dareUrl, dailyUrl, parseRoute, PUBLIC_BASE } from './links/link';
import { encodeGhostSync, trackKey } from './codec/ghost-codec';
import { encodeCat } from './codec/cat-codec';
import { BANNED_CLAIMS, clipCaption, dailyCardText, dareText, fmtRaceTime, PINK_PAW_SHARE_LINE } from './cards/card-text';
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
    expect(dailySetup(1 + 2 * n, TRACKS).modifiers).toBe(0);
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

  it('parses the daily path and query, ignores junk', () => {
    expect(parseRoute({ ...prod, pathname: '/meow-race/d/12' })).toEqual({ kind: 'daily', day: 12 });
    expect(parseRoute({ ...dev, search: '?daily=4' })).toEqual({ kind: 'daily', day: 4 });
    expect(parseRoute({ ...dev, hash: '#g=nonsense' }).kind).toBe('home');
    expect(parseRoute(prod).kind).toBe('home');
  });
});

describe('share texts are honest (GDD 13)', () => {
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
