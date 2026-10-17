import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, type GhostRef, type Store } from '../types';
import {
  analyticsEntry,
  dareOutcomes,
  felonyLine,
  felonyOptions,
  hiddenList,
  hide,
  HIDDEN_CAP,
  isHidden,
  mayOffer,
  sameLocalDay,
  roomChips,
  roomNickname,
  secondCatIndex,
  seenLine,
  tomorrowLine,
  xpLine,
} from './shell-model';

function mem(): Store {
  const m = new Map<string, unknown>();
  return { get: <T,>(k: string, f: T) => (m.has(k) ? (m.get(k) as T) : f), set: (k, v) => (m.set(k, v), true), persistent: true };
}

describe('analyticsEntry (GDD 14 entry values)', () => {
  it.each([
    ['typed', 'typed'],
    ['daily_link', 'daily_link'],
    ['glass', 'daily_link'],
    ['dare_link', 'dare_link'],
    ['room_link', 'room_link'],
    ['cat_link', 'cat_link'],
    ['clip_handoff', 'clip_handoff'],
    ['route', 'direct'],
  ] as const)('%s → %s', (kind, want) => {
    expect(analyticsEntry(kind, 'https://tokentails.com/badcat/d/3')).toBe(want);
  });
  it('direct: typed_or_direct without a referrer and without parameters', () => {
    expect(analyticsEntry('direct', 'https://tokentails.com/badcat/')).toBe('typed_or_direct');
    expect(analyticsEntry('direct', 'https://tokentails.com/badcat/', 'https://www.tiktok.com/')).toBe('direct');
    expect(analyticsEntry('direct', 'https://tokentails.com/badcat/?utm_source=x')).toBe('direct');
    expect(analyticsEntry('direct', 'not a url')).toBe('direct');
  });
});

describe('home lines', () => {
  it('tomorrow teaser names the room, boss days say so', () => {
    expect(roomNickname('Bathroom #3: Toilet Paper Wednesday')).toBe('Toilet Paper Wednesday');
    expect(tomorrowLine({ title: 'Bathroom #3: Toilet Paper Wednesday' })).toBe('Tomorrow: Toilet Paper Wednesday');
    expect(tomorrowLine({ title: 'Boss: Birthday Party #6', boss: true })).toBe('Tomorrow: boss room, Birthday Party #6');
    expect(tomorrowLine(null)).toBeUndefined();
  });
  it('room chips: weekday, theme, Felony Friday, Community Sunday', () => {
    expect(roomChips({ weekday: 4, felonyFriday: true })).toEqual(['Fri', '🚨 Felony Friday']);
    expect(roomChips({ weekday: 6, community: { code: 'x', title: 't', author: 'Mia' }, theme: 'xmas' })).toEqual(['Sun', '🎄 Christmas', '🛠️ Community Sunday']);
    expect(roomChips({ weekday: 0, preview: true })).toEqual([]);
    expect(roomChips(null)).toEqual([]);
  });
  it('seen counter line', () => {
    expect(seenLine('Mochi', 3214)).toBe('Mochi was seen in 3,214 rooms this week');
    expect(seenLine('', 1)).toBe('Your cat was seen in 1 room this week');
    expect(seenLine('Mochi', 0)).toBeUndefined();
  });
  it('season XP line', () => {
    expect(xpLine({ xp: 100, tier: 1 }, { xp: 312, tier: 2 })).toBe('+212 season XP · tier 2 of 30');
    expect(xpLine({ xp: 100, tier: 1 }, { xp: 100, tier: 1 })).toBeUndefined();
    expect(xpLine(null, null)).toBeUndefined();
  });
});

describe('Felony Friday (GDD 3.5)', () => {
  it('options: mine, the Pink Paw cat, up to 3 guest stars', () => {
    const o = felonyOptions('Mochi', 'Medutis', [
      { id: 'a', name: 'Luna' },
      { id: 'b', name: 'Bob' },
      { id: 'c', name: 'Cid' },
      { id: 'd', name: 'Dot' },
    ]);
    expect(o.map((x) => x.id)).toEqual(['mine', 'pinkpaw', 'guest:a', 'guest:b', 'guest:c']);
    expect(o[1]).toMatchObject({ source: 'pinkpaw', label: '🐾 Medutis' });
    expect(felonyOptions('', null, [])).toEqual([{ id: 'mine', label: '🐱 My cat', source: 'mine' }]);
  });
  it('the card names both cats', () => {
    const o = felonyOptions('Mochi', 'Medutis', [{ id: 'a', name: 'Luna' }]);
    expect(felonyLine('Mochi', o[1])).toBe('Medutis from Pink Paw commits the crime. Mochi is the getaway driver.');
    expect(felonyLine('Mochi', o[2])).toBe('Guest star Luna commits the crime. Mochi keeps watch.');
    expect(felonyLine('Mochi', o[0])).toBe('Mochi commits the crime. Felony Friday!');
  });
});

describe('dare outcomes (GDD 6.3)', () => {
  const g = (name: string, replayOnly = false): GhostRef => ({ inputs: [], cat: DEFAULT_CAT, name, simVersion: replayOnly ? 4 : 5, replayOnly });
  it('beat, lose, tie and replay-only ghosts', () => {
    const o = dareOutcomes(5000, [{ ref: g('Mochi'), score: 3760 }, { ref: g('Luna'), score: 9000 }, { ref: g('Oldie', true), score: 1 }, { ref: g('Twin'), score: 5000 }], 'Kitchen #18');
    expect(o.map((x) => x.line)).toEqual([
      'You beat Mochi by 1,240',
      'Luna still rules Kitchen #18',
      "Oldie's ghost ran on older rules (replay only): no score to beat",
      'Dead heat with Twin',
    ]);
    expect(o[0]).toMatchObject({ beat: true, margin: 1240, replayOnly: false });
    expect(o[2].beat).toBeUndefined();
  });
});

describe('hide list (GDD 6.7)', () => {
  it('hides, dedupes and caps', () => {
    const s = mem();
    expect(isHidden(s, 'abc')).toBe(false);
    hide(s, 'abc');
    hide(s, 'abc');
    expect(hiddenList(s)).toEqual(['abc']);
    expect(isHidden(s, 'abc')).toBe(true);
    for (let i = 0; i < HIDDEN_CAP + 10; i++) hide(s, `h${i}`);
    expect(hiddenList(s).length).toBe(HIDDEN_CAP);
    expect(isHidden(s, 'abc')).toBe(false);
    expect(hide(s, '')).toBe(false);
  });
  it('ignores junk in storage', () => {
    const s = mem();
    s.set('hidden', [1, null, 'ok', 'x'.repeat(100)]);
    expect(hiddenList(s)).toEqual(['ok']);
  });
});

describe('gates', () => {
  it('mayOffer: never in session 1, once per session', () => {
    expect(mayOffer(1, false)).toBe(false);
    expect(mayOffer(2, false)).toBe(true);
    expect(mayOffer(5, true)).toBe(false);
    // round 2: never on the calendar day of the first visit
    expect(mayOffer(2, false, true)).toBe(false);
    expect(sameLocalDay(new Date(2026, 9, 16, 9).getTime(), new Date(2026, 9, 16, 22).getTime())).toBe(true);
    expect(sameLocalDay(new Date(2026, 9, 16, 9).getTime(), new Date(2026, 9, 17, 9).getTime())).toBe(false);
    expect(sameLocalDay(0, Date.now())).toBe(false);
  });
  it('second cat for the household clip', () => {
    expect(secondCatIndex([1], 0)).toBe(-1);
    expect(secondCatIndex([1, 2], 0)).toBe(1);
    expect(secondCatIndex([1, 2, 3], 1)).toBe(0);
  });
});
