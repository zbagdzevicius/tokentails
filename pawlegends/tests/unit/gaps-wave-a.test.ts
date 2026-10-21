// @vitest-environment happy-dom
/**
 * GAPS.md Wave A items A0, A1 and A6 (docs/plans/moba/GAPS.md §3): Cacklejaw's coats, the 30-chest Treat Track with
 * its loop, champion titles, frames and postcards, the target hero, the 17-quest pool with its round-robin hero slot,
 * the version 1 → 2 track migration, the first win of the day, the loading line, the pick role label and the ally
 * barks. All render or meta: nothing here reaches the sim.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { HeroId } from '../../src/sim/api';
import { laneHint } from '../../src/ui/pingText';
import { HERO_IDS } from '../../src/data/heroes';
import { CHAMPION_IDS } from '../../src/data/heroes/shelter';
import {
  addTreatXp,
  firstWinBonus,
  freshTreats,
  heroTrack,
  LOOP_REWARDS,
  matchesToGo,
  migrateTreats,
  nextReward,
  TRACK_CHAMPIONS,
  TRACK_ORIGINALS,
  TREAT_REWARDS,
  TREAT_STEP,
  TREAT_XP,
  type TreatState,
} from '../../src/meta/treats';
import { dailyQuests, dayIndex, followsHero, freshQuests, progressQuests, QUEST_POOL, questHero } from '../../src/meta/quests';
import { parseProfile, resetProfileCache, UNLOCKS_MAX } from '../../src/meta/profile';
import { bestFrame, FREE_COATS, lookCoat, titleOf, wardrobe, type Owned } from '../../src/render/cosmetics';
import { EMPTY_ROSTER } from '../../src/meta/roster';
import { heroBuilt } from '../../src/render/chars';
import { Announcer, BARKS, WINDOW } from '../../src/render/announcer';
import { collectionPanel, postcardStory } from '../../src/ui/collection';
import { loadingVeil, pickScreen } from '../../src/ui/screens';

const owned = (unlocks: string[] = [], items: string[] = []): Owned => ({ items: new Set(items), unlocks: new Set(unlocks), roster: EMPTY_ROSTER });
const geomHash = (hero: HeroId, coat: string | null): string => {
  const g = heroBuilt(hero, 0, { coat, chroma: null }, 1).geometry;
  const c = g.getAttribute('color').array as Float32Array;
  let a = 0x811c9dc5;
  for (const v of c) {
    a ^= Math.round(v * 1e5);
    a = Math.imul(a, 0x01000193) >>> 0;
  }
  return a.toString(16);
};
/** Card-owner perks: never on the free track (GAPS A1 compliance). */
const CARD_PERK = /chroma|kitten|companion|badge|^cat\.|^skin\./i;

describe('A0: Cacklejaw coats', () => {
  it('his two original Track coats and the new ones change his look; the default stays as before', () => {
    const base = geomHash('cacklejaw', null);
    const ids = Object.keys(FREE_COATS).filter((id) => FREE_COATS[id].hero === 'cacklejaw');
    expect(ids).toEqual(expect.arrayContaining(['coat.cacklejaw.spotted', 'coat.cacklejaw.dusk']));
    const seen = new Set<string>([base]);
    for (const id of ids) {
      expect(lookCoat('cacklejaw', { coat: id, chroma: null })).not.toBeNull();
      const h = geomHash('cacklejaw', id);
      expect(h, id).not.toBe(base);
      seen.add(h);
    }
    // every coat looks different from every other
    expect(seen.size).toBe(ids.length + 1);
    // another hero's coat does nothing on him (the golden fixture covers the rest)
    expect(geomHash('cacklejaw', 'coat.brutus.ember')).toBe(base);
  });
});

describe('A1: Treat Track, 30 chests then a loop', () => {
  it('30 unique rewards cover all 8 heroes: originals get coats and palette variants, champions a title, frame and postcard', () => {
    expect(TREAT_REWARDS).toHaveLength(30);
    const ids = [...TREAT_REWARDS, ...LOOP_REWARDS].map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const h of TRACK_ORIGINALS) {
      const coats = TREAT_REWARDS.filter((r) => r.hero === h && r.kind === 'coat');
      expect(coats.length, h).toBeGreaterThanOrEqual(3);
    }
    for (const h of TRACK_CHAMPIONS) {
      const mine = TREAT_REWARDS.filter((r) => r.hero === h);
      expect(mine.map((r) => r.kind).sort(), h).toEqual(['frame', 'postcard', 'title']);
    }
    expect(new Set(TREAT_REWARDS.map((r) => r.hero).filter(Boolean))).toEqual(new Set(HERO_IDS));
    // never a card perk, and never a recolour of a real cat
    for (const r of [...TREAT_REWARDS, ...LOOP_REWARDS]) {
      expect(r.id, r.id).not.toMatch(CARD_PERK);
      if (r.kind === 'coat') expect(CHAMPION_IDS as readonly string[]).not.toContain(r.hero);
    }
  });

  it('every coat reward is wearable by its hero (and only by it); champions keep only Classic', () => {
    const all = [...TREAT_REWARDS, ...LOOP_REWARDS].filter((r) => r.kind === 'coat');
    const o = owned(all.map((r) => r.id));
    for (const r of all) {
      expect(lookCoat(r.hero as HeroId, { coat: r.id, chroma: null }), r.id).not.toBeNull();
      expect(wardrobe(r.hero as HeroId, o).some((c) => c.id === r.id), r.id).toBe(true);
    }
    for (const h of CHAMPION_IDS) expect(wardrobe(h, o).map((c) => c.id)).toEqual([null]);
  });

  it('the track never runs dry: 500 chests in a row always hold a reward, and the loop follows chest 30', () => {
    let s: TreatState = freshTreats();
    const have = new Set<string>();
    const got: string[] = [];
    for (let i = 0; i < 500; i++) {
      const g = addTreatXp(s, TREAT_STEP, have);
      expect(g.rewards).toHaveLength(1);
      expect(g.next).toBeTruthy();
      for (const r of g.rewards) {
        have.add(r.id);
        got.push(r.id);
      }
      s = g.state;
    }
    expect(got.slice(0, 30)).toEqual(TREAT_REWARDS.map((r) => r.id));
    expect(got.slice(30, 30 + LOOP_REWARDS.length)).toEqual(LOOP_REWARDS.map((r) => r.id));
    expect(s.chests).toBe(500);
    // a fresh profile keeps every reward within the unlock cap
    expect(1 + TREAT_REWARDS.length + LOOP_REWARDS.length).toBeLessThanOrEqual(UNLOCKS_MAX);
  });

  it('pick your next target: the next chest is that hero’s next reward, in its fixed order; N matches to go', () => {
    const s: TreatState = { ...freshTreats(), target: 'lambo', xp: 30 };
    expect(nextReward(new Set(), 'lambo').id).toBe('postcard.lambo');
    const g1 = addTreatXp(s, TREAT_STEP, new Set());
    expect(g1.rewards.map((r) => r.id)).toEqual(['postcard.lambo']);
    expect(g1.next.id).toBe('title.champ.lambo');
    const g2 = addTreatXp(g1.state, TREAT_STEP * 2, new Set(['postcard.lambo']));
    expect(g2.rewards.map((r) => r.id)).toEqual(['title.champ.lambo', 'frame.champ.lambo']);
    // a champion with nothing left falls back to the track order
    expect(nextReward(new Set(['postcard.lambo', 'title.champ.lambo', 'frame.champ.lambo']), 'lambo').id).toBe('emote.wave');
    expect(heroTrack('lambo', new Set(['postcard.lambo']))).toMatchObject({ have: 1, total: 3 });
    // an original goes on into the loop
    const clemAll = new Set([...TREAT_REWARDS, ...LOOP_REWARDS].filter((r) => r.hero === 'clem' && !r.loop).map((r) => r.id));
    expect(nextReward(clemAll, 'clem').loop).toBe(true);
    expect(matchesToGo({ xp: 0 })).toBe(Math.ceil(TREAT_STEP / 120));
    expect(matchesToGo({ xp: TREAT_STEP - 1 })).toBe(1);
    expect(g1.toGo).toBe(matchesToGo(g1.state));
  });

  it('titles and frames from the track are worn only when chosen and owned', () => {
    const o = owned(['title.champ.gabe', 'frame.champ.bengas'], ['title.founder']);
    expect(titleOf(o)).toBe('Founder');
    expect(titleOf(o, 'title.champ.gabe')).toMatch(/Pal$/);
    expect(titleOf(o, 'title.champ.lambo')).toBe('Founder');
    expect(bestFrame(o, 'frame.champ.bengas')).toBe('frame.champ.bengas');
    expect(bestFrame(o, 'frame.champ.lambo')).toBeNull();
  });
});

describe('A1: migration from the 9-chest track', () => {
  const V1 = TREAT_REWARDS.slice(0, 9).map((r) => r.id);

  it('chests that opened empty after the old track ran out are paid once; nothing is granted twice', () => {
    // 12 chests: 8 rewards (the Biscuit coat came from the first win) and 4 empty
    const raw = JSON.stringify({ v: 1, xp: 12 * TREAT_STEP + 50, chests: 12 });
    const m = migrateTreats(raw, new Set(V1));
    expect(m.migrated).toBe(true);
    expect(m.grants.map((r) => r.id)).toEqual(TREAT_REWARDS.slice(9, 13).map((r) => r.id));
    expect(m.state).toMatchObject({ v: 2, xp: 12 * TREAT_STEP + 50, chests: 12, target: null });
    // the same old record again (a blocked second write): nothing new
    const again = migrateTreats(raw, new Set([...V1, ...m.grants.map((r) => r.id)]));
    expect(again.grants).toEqual([]);
    // the new record: not migrated again
    expect(migrateTreats(JSON.stringify(m.state), new Set(V1)).migrated).toBe(false);
  });

  it('no reward lost: a player mid-track keeps what they have and the next chest goes on in order', () => {
    const raw = JSON.stringify({ v: 1, xp: 3 * TREAT_STEP + 10, chests: 3 });
    const have = new Set(V1.slice(0, 3));
    const m = migrateTreats(raw, have);
    expect(m.grants).toEqual([]);
    expect(m.state.chests).toBe(3);
    const g = addTreatXp(m.state, TREAT_STEP, have);
    expect(g.rewards.map((r) => r.id)).toEqual([V1[3]]);
    // an empty or corrupt record migrates to a fresh bar
    expect(migrateTreats(null, new Set()).grants).toEqual([]);
    expect(migrateTreats('nope', new Set()).state).toEqual(freshTreats());
  });

  it('profiles keep up to UNLOCKS_MAX unlocks, the champions’ match counts seed heroMatches, and worn ids are checked', () => {
    resetProfileCache();
    const many = Array.from({ length: 100 }, (_, i) => `coat.clem.loop.x${i}`);
    const p = parseProfile(JSON.stringify({ unlocks: many, championMatches: { lambo: 4 }, wornTitle: 'title.champ.gabe', wornFrame: 'frame.<script>' }));
    expect(p.unlocks).toHaveLength(100);
    expect(p.heroMatches.lambo).toBe(4);
    expect(p.wornTitle).toBe('title.champ.gabe');
    expect(p.wornFrame).toBeNull();
  });
});

describe('A1: quests for all 8 heroes', () => {
  it('17 quests; every hero has a win quest; the hero slot is round-robin (each hero every 8 days)', () => {
    expect(QUEST_POOL).toHaveLength(17);
    expect(new Set(QUEST_POOL.map((q) => q.id)).size).toBe(17);
    for (const h of HERO_IDS) expect(QUEST_POOL.filter((q) => q.metric === 'win' && q.hero === h), h).toHaveLength(1);
    expect(QUEST_POOL.map((q) => q.id)).toEqual(expect.arrayContaining(['win_lambo', 'win_aviete', 'win_bengas', 'win_gabe', 'champion', 'pudding2']));
    const start = Date.UTC(2026, 9, 20);
    const day = (i: number): string => new Date(start + i * 86400000).toISOString().slice(0, 10);
    for (let k = 0; k < 4; k++) {
      const week = Array.from({ length: 8 }, (_, i) => questHero(day(k * 8 + i)));
      expect(new Set(week)).toEqual(new Set(HERO_IDS));
    }
    for (let i = 0; i < 40; i++) {
      const q = dailyQuests(day(i));
      expect(q).toHaveLength(3);
      expect(q.filter((x) => x.hero)).toEqual([QUEST_POOL.find((x) => x.hero === questHero(day(i)))]);
      expect(q.filter((x) => x.metric === 'pudding').length).toBeLessThanOrEqual(1);
      expect(q.filter((x) => x.metric === 'takedowns').length).toBeLessThanOrEqual(1);
    }
    expect(dayIndex(day(1)) - dayIndex(day(0))).toBe(1);
    expect(followsHero(0)).toBe(true);
    expect(followsHero(3)).toBe(false);
  });

  it('"Play a shelter champion" and "Calm Pudding twice" count, and a quest gives Treat XP only', () => {
    const d = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10)).find((x) => dailyQuests(x).some((q) => q.id === 'champion'))!;
    const r = progressQuests(freshQuests(d), { won: false, hero: 'gabe', takedowns: 0, pudding: false, towers: 0, combos: 0 });
    expect(r.views.find((v) => v.quest.id === 'champion')?.done).toBe(true);
    const r2 = progressQuests(freshQuests(d), { won: false, hero: 'clem', takedowns: 0, pudding: false, towers: 0, combos: 0 });
    expect(r2.views.find((v) => v.quest.id === 'champion')?.done).toBe(false);
    const p = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 9, 1) + i * 86400000).toISOString().slice(0, 10)).find((x) => dailyQuests(x).some((q) => q.id === 'pudding2'))!;
    const m = { won: false, hero: 'clem' as HeroId, takedowns: 0, pudding: true, towers: 0, combos: 0 };
    const a = progressQuests(freshQuests(p), m);
    expect(a.views.find((v) => v.quest.id === 'pudding2')?.done).toBe(false);
    const b = progressQuests(a.state, m);
    expect(b.views.find((v) => v.quest.id === 'pudding2')?.done).toBe(true);
    expect(Object.keys(b)).toEqual(['state', 'views', 'xp']);
  });
});

describe('A6: first win of the day', () => {
  it('+150 Treat XP for the first win of each local day, none on a loss, no streak to lose', () => {
    expect(TREAT_XP.firstWinOfDay).toBe(150);
    expect(firstWinBonus(null, true, '2026-10-20')).toBe(150);
    expect(firstWinBonus('2026-10-20', true, '2026-10-20')).toBe(0);
    expect(firstWinBonus(null, false, '2026-10-20')).toBe(0);
    let s = freshTreats();
    const loss = addTreatXp(s, 60, new Set(), { won: false, day: '2026-10-20' });
    expect(loss.dayBonus).toBe(0);
    expect(loss.state.winDay).toBeNull();
    const w1 = addTreatXp(loss.state, 100, new Set(), { won: true, day: '2026-10-20' });
    expect(w1.dayBonus).toBe(150);
    expect(w1.gained).toBe(250);
    expect(w1.state.winDay).toBe('2026-10-20');
    const w2 = addTreatXp(w1.state, 100, new Set(), { won: true, day: '2026-10-20' });
    expect(w2.dayBonus).toBe(0);
    // days skipped cost nothing: the next win still gets it
    const w3 = addTreatXp(w2.state, 100, new Set(), { won: true, day: '2026-10-27' });
    expect(w3.dayBonus).toBe(150);
    s = w3.state;
    expect(s.v).toBe(2);
  });
});

describe('A6: loading line, pick role, ally barks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('the loading screen shows the Bond badge and the match count on this hero', () => {
    const v = loadingVeil(document.body, 'Into the Crossing...', undefined, null, { name: 'Sage', matches: 7, bond: 3 });
    expect(v.querySelector('[data-hero-matches]')?.textContent).toContain('7 matches as Sage');
    expect(v.querySelector('.bond')?.textContent).toBe('Bond 3');
    const f = loadingVeil(document.body, 'x', undefined, null, { name: 'Clem', matches: 0, bond: null });
    expect(f.textContent).toContain('First match as Clem');
    expect(f.querySelector('.bond')).toBeNull();
  });

  it('the pick screen shows the role label and (GAPS B1, since the lane swap) one lane hint', () => {
    const root = pickScreen(document.body, { initial: { hero: 'lambo', trick: 'pounce', difficulty: 'easy' }, onHero: () => undefined, onStart: () => undefined, onBack: () => undefined });
    expect(root.querySelector('.role-label')?.textContent).toBe('Tank');
    expect(root.querySelectorAll('.lane-hint')).toHaveLength(1);
    expect(root.querySelector('.lane-hint')?.textContent).toBe(laneHint('Tank'));
  });

  it('allied bots cheer the player’s takedowns and assists, in turn, at most once per 8 s; never an enemy takedown', () => {
    const a = new Announcer(0, 0);
    const death = (tick: number, id: number, killer: number) => ({ type: 'death' as const, tick, id, killer });
    const b1 = a.feed(death(600, 3, 0)).find((m) => m.size === 'bark');
    expect(b1).toMatchObject({ key: 'barkKill', title: BARKS.kill[0], slot: 1, tone: 'good' });
    expect(a.feed(death(700, 4, 0)).some((m) => m.size === 'bark')).toBe(false);
    // an assist: the player hit the victim, ally 2 made the kill and thanks the player
    a.feed({ type: 'hit', tick: 600 + WINDOW.bark + 10, src: 0, dst: 5, amount: 40, shielded: 0, kind: 'basic' });
    const b2 = a.feed(death(600 + WINDOW.bark + 20, 5, 2)).find((m) => m.size === 'bark');
    expect(b2).toMatchObject({ key: 'barkAssist', title: BARKS.assist[1], slot: 2 });
    // the enemy's takedown: no bark
    expect(a.feed(death(2000, 1, 3)).some((m) => m.size === 'bark')).toBe(false);
  });
});

describe('A1: collection panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('chooses a target, shows N matches to go, unlocked postcards with the card art and a CLAIMS-safe story, and wears titles', () => {
    const targets: (HeroId | null)[] = [];
    const worn: [string, string | null][] = [];
    let closed = false;
    const root = collectionPanel(document.body, {
      treats: { ...freshTreats(), xp: 100 },
      owned: new Set(['postcard.lambo', 'title.champ.lambo']),
      art: { lambo: 'https://example.test/lambo.png' },
      portrait: () => null,
      wornTitle: null,
      wornFrame: null,
      onTarget: (h) => targets.push(h),
      onWear: (k, id) => worn.push([k, id]),
      onClose: () => {
        closed = true;
      },
    });
    expect(root.querySelector('[data-togo]')?.textContent).toBe('about 2 matches to go');
    expect(root.querySelector('[data-postcard="lambo"] img')?.getAttribute('src')).toBe('https://example.test/lambo.png');
    expect(root.querySelector('[data-postcard="gabe"]')?.classList.contains('locked')).toBe(true);
    (root.querySelector('[data-target="gabe"]') as HTMLElement).click();
    expect(targets).toEqual(['gabe']);
    expect(root.querySelector('[data-next]')?.getAttribute('data-next')).toBe('postcard.gabe');
    (root.querySelector('[data-wear="title"][data-id="title.champ.lambo"]') as HTMLElement).click();
    expect(worn).toEqual([['title', 'title.champ.lambo']]);
    // no purchase, no price, no link
    expect(root.querySelector('a, [data-sku], [data-buy]')).toBeNull();
    expect(root.textContent ?? '').not.toMatch(/\$|buy|price|adopt|donat|fund|help|save/i);
    (root.querySelector('[data-a="close"]') as HTMLElement).click();
    expect(closed).toBe(true);
  });

  it('the stories name the real cat without money or impact words', () => {
    for (const h of CHAMPION_IDS) {
      const s = postcardStory(h);
      expect(s).toMatch(/real Pink Paw cat/);
      expect(s).not.toMatch(/\$|money|donat|fund|feed|save|help|rescue|support|shelter|vet|sick|ill/i);
    }
  });
});
