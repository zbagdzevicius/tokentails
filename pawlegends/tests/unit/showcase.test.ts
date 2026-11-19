/**
 * What's New (meta/showcase.ts, founder Nov 19): the feed is a pure function of the time and the catalogue, the queue
 * shows live unseen pages by priority (at most 4), the seen state follows the account through a ≤ 32 character key, and
 * the copy stays short (blurb ≤ 14 words, burst ≤ 8 characters).
 */
import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DROP_CALENDAR, dropAt, NAP_FALLBACK, type LiveopsNap } from '../../src/meta/liveops';
import {
  DEFAULT_ART,
  EXTRA_ITEMS,
  fromEntry,
  isLive,
  isSeen,
  loadSeen,
  markSeen,
  parseSeen,
  PASS_TIERS,
  PRIORITY,
  queueFor,
  saveSeen,
  SEEN_KEY,
  SEEN_MAX,
  SEEN_SYNC_KEY,
  seenHash,
  showcaseArt,
  showcaseFeed,
  timeLine,
  type ShowcaseCtx,
  type ShowcaseEntry,
  type ShowcaseItem,
} from '../../src/meta/showcase';
import { SYNCED_KEYS } from '../../src/meta/progressCloud';
import { countdownText } from '../../src/ui/modeSelect/modes';

const T = (iso: string): number => Date.parse(iso);
const DAY = 86_400_000;
const NOW = T('2026-11-19T12:00:00Z');
const NAP: LiveopsNap = {
  ...NAP_FALLBACK,
  gifts: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, item: day === 7 ? 'coat.cacklejaw.frost' : `coat.sage.loop.d${day}`, name: day === 7 ? 'Frost coat for Cacklejaw' : `Day ${day} coat for Sage` })),
};
const ctx = (o: Partial<ShowcaseCtx> = {}): ShowcaseCtx => ({ now: NOW, isApp: false, storeOpen: true, drop: dropAt(o.now ?? NOW), nap: NAP, artRoot: 'https://pawlegends.app/pawlegends-art/', lowTier: false, ...o });
const none = new Set<string>();
const item = (o: Partial<ShowcaseItem>): ShowcaseItem => ({
  id: 'x',
  type: 'generic',
  title: 'X',
  blurb: 'Short.',
  art: 'generic',
  startsAt: NOW - DAY,
  endsAt: NOW + DAY,
  priority: 10,
  cta: { label: 'Got it', target: { screen: 'none' } },
  ...o,
});
const mem = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
};

describe('the feed (a pure function of time, live ops and the catalogue)', () => {
  it('Nov 19 2026: the November Drop and Legends Pass Season 1; Winter Nap is not announced yet', () => {
    const f = showcaseFeed(ctx());
    expect(f.map((x) => x.id)).toEqual(['drop-2026-11', 'pass-s1', 'nap-2026']);
    const q = queueFor(f, none, NOW);
    expect(q.map((x) => x.id)).toEqual(['drop-2026-11', 'pass-s1']);
  });

  it('the drop page: its name, coats from the catalogue with their art, the store on the web and a try-on in the apps', () => {
    const art = (i: string) => `https://art/${i}.webp`;
    const web = showcaseFeed(ctx({ thingArt: art }))[0]!;
    expect(web).toMatchObject({ type: 'store-drop', title: 'November Drop', kicker: 'Boardroom & Lunch Rush', burst: 'NEW!', priority: PRIORITY['store-drop'] });
    expect(web.things!.map((t) => t.label)).toEqual(['Chairman of the Board', 'Double Stack', 'Mega Meal']);
    expect(web.things![0]!.art).toBe('https://art/coat.brutus.store_chairman.webp');
    expect(web.things![0]!.sub).toBe('Brutus');
    expect(web.cta).toEqual({ label: 'See the coats', target: { screen: 'store', tab: 'coats' } });
    expect(web.art).toBe('https://pawlegends.app/pawlegends-art/showcase/drop-2026-11-720.webp');
    const app = showcaseFeed(ctx({ isApp: true, storeOpen: false }))[0]!;
    expect(app.cta).toEqual({ label: 'Try it on', target: { screen: 'champion', hero: 'brutus', coat: 'coat.brutus.store_chairman' } });
    // a store closed on the web: the try-on too (never a dead button)
    expect(showcaseFeed(ctx({ storeOpen: false }))[0]!.cta.target.screen).toBe('champion');
  });

  it('the pass page comes from SEASONS by date (not the server snapshot): four free-road rewards, the Pass', () => {
    const p = showcaseFeed(ctx()).find((x) => x.type === 'pass-season')!;
    expect(p).toMatchObject({ id: 'pass-s1', title: 'Legends Pass', kicker: 'Season 1: First Paws', burst: 'SEASON 1', cta: { target: { screen: 'pass' } } });
    expect(p.things!.map((t) => t.label)).toEqual(PASS_TIERS.map((t) => `Tier ${t}`));
    expect(p.startsAt).toBe(T('2026-11-10T00:00:00Z'));
    expect(p.endsAt).toBe(T('2027-01-05T00:00:00Z'));
    // before and after the season: no page
    expect(showcaseFeed(ctx({ now: T('2026-11-01T00:00:00Z') })).some((x) => x.type === 'pass-season')).toBe(false);
    expect(showcaseFeed(ctx({ now: T('2027-01-06T00:00:00Z') })).some((x) => x.type === 'pass-season')).toBe(false);
  });

  it('Winter Nap is pre-announced a week ahead ("Starts in"), with gifts 1 to 3 and the day-7 coat, and opens Quests → Events', () => {
    const at = T('2026-12-09T00:00:00Z');
    const q = queueFor(showcaseFeed(ctx({ now: at })), none, at);
    const nap = q.find((x) => x.type === 'event')!;
    expect(nap.id).toBe('nap-2026');
    expect(nap.cta.target).toEqual({ screen: 'quests', tab: 'events' });
    expect(nap.things!.map((t) => t.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 7']);
    expect(timeLine(nap, at, countdownText)).toBe('Starts in 6d 0h');
    expect(timeLine(nap, T('2026-12-20T00:00:00Z'), countdownText)).toMatch(/^Ends in 16d/);
    // not before its week, not offline without gifts (no strip then)
    expect(queueFor(showcaseFeed(ctx({ now: T('2026-12-07T00:00:00Z') })), none, T('2026-12-07T00:00:00Z')).some((x) => x.type === 'event')).toBe(false);
    expect(showcaseFeed(ctx({ now: at, nap: NAP_FALLBACK })).find((x) => x.type === 'event')!.things).toBeUndefined();
  });

  it('hand-written entries: default art by type, priority by type, a champion gets its splash and kit as notes', () => {
    const champ: ShowcaseEntry = { id: 'champ-nova-202612', type: 'champion', hero: 'nova', title: 'Nova', blurb: 'A star-catching cat.', startsAt: NOW - DAY, endsAt: NOW + DAY, cta: { label: 'Meet Nova', target: { screen: 'champion', hero: 'nova' } } };
    const patch: ShowcaseEntry = { id: 'patch-1-4', type: 'patch', title: 'Patch 1.4', blurb: 'Faster queues.', notes: ['a', 'b', 'c', 'd'], startsAt: NOW - DAY, endsAt: NOW + DAY, cta: { label: 'Got it', target: { screen: 'none' } } };
    const kit = { heroArt: (h: string) => `https://x/splash/${h}.webp`, heroKit: () => ({ side: 'Cat', role: 'Mage', passive: 'Starlight', ultimate: 'Meteor Shower' }) };
    const c = fromEntry(champ, kit);
    expect(c.art).toBe('https://x/splash/nova.webp');
    expect(c.priority).toBe(PRIORITY.champion);
    expect(c.notes).toEqual(['Cat Mage', 'Passive: Starlight', 'Ultimate: Meteor Shower']);
    // no splash or kit known: the type's art, no notes
    const bare = fromEntry(champ, {});
    expect(bare.art).toBe('champion');
    expect(bare.notes).toBeUndefined();
    const p = fromEntry(patch, kit);
    expect(p.art).toBe('patch');
    expect(p.notes).toEqual(['a', 'b', 'c']);
    expect(fromEntry({ ...patch, art: 'generic', priority: 99 }, kit)).toMatchObject({ art: 'generic', priority: 99 });
    // through the feed: the art becomes a URL
    const feed = showcaseFeed(ctx(), [patch]);
    expect(feed.find((x) => x.id === 'patch-1-4')!.art).toBe('https://pawlegends.app/pawlegends-art/showcase/patch-720.webp');
  });

  it('copy rules: blurb ≤ 14 words, burst ≤ 8 characters, ids versioned and stable', () => {
    const all = [
      ...showcaseFeed(ctx({ now: T('2026-12-20T00:00:00Z'), drop: dropAt(T('2026-11-20T00:00:00Z')) })),
      ...showcaseFeed(ctx({ isApp: true, storeOpen: false })),
      ...EXTRA_ITEMS,
    ];
    expect(all.length).toBeGreaterThan(3);
    for (const x of all) {
      expect(x.blurb.split(/\s+/).filter(Boolean).length, x.id).toBeLessThanOrEqual(14);
      if (x.burst) expect(x.burst.length, x.id).toBeLessThanOrEqual(8);
      expect(x.id).toMatch(/^[a-z0-9][a-z0-9._-]{0,47}$/);
      expect(x.blurb).not.toMatch(/\$|€|price|buy/i);
    }
  });

  it('art: a key under showcase/ at 720 (360 on Low or a short phone), an absolute URL as it is; every baked drop has art', () => {
    expect(showcaseArt('nap-2026', { artRoot: 'https://a/', lowTier: true })).toBe('https://a/showcase/nap-2026-360.webp');
    expect(showcaseArt('https://cdn/x.webp', { artRoot: 'https://a/', lowTier: false })).toBe('https://cdn/x.webp');
    const dir = new URL('../../../pawlegends-web/public/pawlegends-art/showcase/', import.meta.url);
    for (const key of [...DROP_CALENDAR.map((d) => d.id), 'pass-s1', 'nap-2026', ...Object.values(DEFAULT_ART)])
      for (const w of [360, 720]) {
        const st = statSync(new URL(`${key}-${w}.webp`, dir));
        expect(st.size, `${key}-${w}`).toBeLessThanOrEqual(120 * 1024);
      }
  });
});

describe('the queue', () => {
  it('priority first, then the soonest end; at most 4; seen items and ended ones out', () => {
    const f = [
      item({ id: 'g', priority: PRIORITY.generic }),
      item({ id: 'p1', type: 'patch', priority: PRIORITY.patch, endsAt: NOW + 5 * DAY }),
      item({ id: 'p2', type: 'patch', priority: PRIORITY.patch, endsAt: NOW + 2 * DAY }),
      item({ id: 'c', type: 'champion', priority: PRIORITY.champion }),
      item({ id: 'd', type: 'store-drop', priority: PRIORITY['store-drop'] }),
      item({ id: 'old', priority: 99, endsAt: NOW - 1 }),
      item({ id: 'later', priority: 99, startsAt: NOW + DAY }),
    ];
    expect(queueFor(f, none, NOW).map((x) => x.id)).toEqual(['d', 'c', 'p2', 'p1']);
    expect(queueFor(f, new Set(['d', 'p2']), NOW).map((x) => x.id)).toEqual(['c', 'p1', 'g']);
    expect(queueFor(f, none, NOW, undefined, 2)).toHaveLength(2);
  });

  it('time windows: showFrom ≤ now < endsAt', () => {
    const x = item({ startsAt: NOW + 2 * DAY, showFrom: NOW - 1, endsAt: NOW + 3 * DAY });
    expect(isLive(x, NOW)).toBe(true);
    expect(isLive(x, NOW - 2)).toBe(false);
    expect(isLive(x, NOW + 3 * DAY)).toBe(false);
    expect(isLive(item({ startsAt: NOW }), NOW)).toBe(true);
  });

  it('web-only items need the web store open', () => {
    const f = [item({ id: 'shop', web: true })];
    expect(queueFor(f, none, NOW, { isApp: false, storeOpen: true })).toHaveLength(1);
    expect(queueFor(f, none, NOW, { isApp: true, storeOpen: true })).toHaveLength(0);
    expect(queueFor(f, none, NOW, { isApp: false, storeOpen: false })).toHaveLength(0);
  });

  it('countdown: "Ends in 3d 4h", "Starts in 2h 5m", nothing once over', () => {
    const x = item({ startsAt: NOW - DAY, endsAt: NOW + 3 * DAY + 4 * 3_600_000 });
    expect(timeLine(x, NOW, countdownText)).toBe('Ends in 3d 4h');
    expect(timeLine(item({ startsAt: NOW + 2 * 3_600_000 + 5 * 60_000 }), NOW, countdownText)).toBe('Starts in 2h 5m');
    expect(timeLine(x, x.endsAt, countdownText)).toBe('');
  });
});

describe('the seen state', () => {
  it('marks, survives a reload, and a new item is not seen', () => {
    const kv = mem();
    const f = showcaseFeed(ctx());
    saveSeen(markSeen(loadSeen(kv), [f[0]!], NOW), kv);
    const s = loadSeen(kv);
    expect(isSeen(s, 'drop-2026-11')).toBe(true);
    expect(isSeen(s, 'pass-s1')).toBe(false);
    expect(queueFor(f, (id) => isSeen(s, id), NOW).map((x) => x.id)).toEqual(['pass-s1']);
    expect(JSON.parse(kv.getItem(SEEN_KEY)!)).toEqual({ v: 1, seen: [['drop-2026-11', f[0]!.endsAt]] });
  });

  it('the synced key fits the account settings (≤ 32 characters) and counts on another device', () => {
    expect(SYNCED_KEYS).toContain(SEEN_SYNC_KEY);
    let s = parseSeen(null, null);
    for (let i = 0; i < 20; i++) s = markSeen(s, [{ id: `patch-${i}`, endsAt: NOW + DAY }], NOW);
    const kv = mem();
    saveSeen(s, kv);
    const synced = kv.getItem(SEEN_SYNC_KEY)!;
    expect(synced.length).toBeLessThanOrEqual(32);
    // another device: only the synced key arrived (progressCloud writes it), the newest ids count as seen
    const other = parseSeen(null, synced);
    expect(isSeen(other, 'patch-19')).toBe(true);
    expect(isSeen(other, 'patch-14')).toBe(true);
    expect(isSeen(other, 'patch-0')).toBe(false);
    // the union: what the account had stays behind the new hashes
    const merged = markSeen(parseSeen(null, seenHash('a')), [{ id: 'b', endsAt: NOW }], NOW);
    expect(merged.synced).toEqual([seenHash('b'), seenHash('a')]);
  });

  it('caps at 60, prunes ids ended over 60 days ago, survives bad data', () => {
    let s = parseSeen(null, null);
    for (let i = 0; i < 70; i++) s = markSeen(s, [{ id: `i-${i}`, endsAt: NOW + DAY }], NOW);
    expect(s.seen).toHaveLength(SEEN_MAX);
    expect(s.seen[0]![0]).toBe('i-10');
    const old = markSeen(parseSeen(null, null), [{ id: 'gone', endsAt: NOW - 61 * DAY }, { id: 'recent', endsAt: NOW - 10 * DAY }], NOW - 100 * DAY);
    const pruned = markSeen(old, [{ id: 'new', endsAt: NOW }], NOW);
    expect(pruned.seen.map(([id]) => id)).toEqual(['recent', 'new']);
    expect(parseSeen('{oops', 'zz,TOO-LONG,abcd')).toEqual({ v: 1, seen: [], synced: ['abcd'] });
    expect(parseSeen(JSON.stringify({ v: 1, seen: [['<b>', 1], ['ok', 'x'], ['fine', 5]] }), null).seen).toEqual([['fine', 5]]);
    // blocked storage never throws
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(loadSeen(bad).seen).toEqual([]);
    expect(() => saveSeen(s, bad)).not.toThrow();
  });
});
