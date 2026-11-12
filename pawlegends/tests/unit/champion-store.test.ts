// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import * as game from '../../src/money/catalog';
import * as server from '../../../backend/src/pawlegends/pawlegends-catalog';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { canPlay, champStatus, localChampions, lockReason, ownedCount, parseChampionsState, unlockInfo } from '../../src/meta/champions';
import { Entitlements } from '../../src/money/entitlements';
import { parseSaveResult, parseStoreState } from '../../src/embed/bridge';
import { champBarHtml, pickScreen, type Choice } from '../../src/ui/screens';
import { itemState, priceFor, tabSkus } from '../../src/ui/store';
import { heroBlock, setPickChampLock } from '../../src/party/ui/partyPick';
import { resetAppBuild } from '../../src/meta/roster';
import type { PartyView } from '../../src/net/proto';

/*
 * Champion store (docs/plans/moba/CHAMPION-STORE.md): the catalogue mirror, the roster against the game's heroes,
 * which champions a player may pick (web and app), the host's `store.champions`, the pick screen's locked tiles and
 * Practice, the store's Champions tab and the party pick's lock.
 */

const WEEK0 = Date.parse(game.ROTATION_EPOCH) + 3600_000;
const server0 = (over: Record<string, unknown> = {}) =>
  parseChampionsState({ owned: [], founders: false, rotation: { week: 0 }, yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 }, bundles: [], ...over }, WEEK0)!;

describe('catalogue mirror', () => {
  it('equals the backend (roster, starters, rotation, prices, Yarn, SKUs)', () => {
    expect(game.CHAMPIONS).toEqual(server.CHAMPIONS);
    expect(game.STARTERS).toEqual(server.STARTERS);
    expect(game.ROTATION_EPOCH).toBe(server.ROTATION_EPOCH);
    expect(game.ROTATION_CATS).toEqual(server.ROTATION_CATS);
    expect(game.ROTATION_DOGS).toEqual(server.ROTATION_DOGS);
    expect(game.CHAMP_TIER).toEqual(server.CHAMP_TIER);
    expect(game.TIER_PRICE).toEqual(server.TIER_PRICE);
    expect(game.YARN).toEqual(server.YARN);
    expect(game.CHAMP_PICK_MILESTONES).toEqual(server.CHAMP_PICK_MILESTONES);
    expect(game.CATALOG_SKUS).toEqual(server.CATALOG_SKUS);
    for (let w = -3; w < 10; w++) expect(game.rotationOf(w)).toEqual(server.rotationOf(w));
  });

  it("every champion is a game hero with the same side and role, and every game hero is a champion", () => {
    for (const c of game.CHAMPIONS) {
      const h = HEROES[c.hero as keyof typeof HEROES];
      expect(h, c.hero).toBeTruthy();
      expect(h.side, c.hero).toBe(c.side);
      expect(h.role, c.hero).toBe(c.role);
    }
    expect([...HERO_IDS].sort()).toEqual([...game.CHAMPION_IDS].sort());
  });
});

describe('who may pick what', () => {
  afterEach(() => resetAppBuild());

  it('a new player: the 6 starters and the 6 of the week, nothing else', () => {
    const s = localChampions(WEEK0);
    const open = game.CHAMPION_IDS.filter((h) => canPlay(h, s));
    expect(open).toHaveLength(12);
    for (const h of game.STARTERS) expect(champStatus(h, s)).toBe('starter');
    for (const h of game.rotationOf(0)) expect(champStatus(h, s)).toBe('free');
    expect(champStatus('howler', s)).toBe('locked');
    expect(lockReason('howler', s)).toBe('Unlock with Yarn');
    expect(canPlay('clem', s)).toBe(true);
  });

  it('owned champions; in the app a web purchase is locked, a Yarn unlock is not (founder decision 1)', () => {
    const s = server0({ owned: [{ hero: 'howler', source: 'purchase' }, { hero: 'bravo', source: 'yarn' }, { hero: 'evil', source: 'yarn' }] });
    expect(s.owned.map((o) => o.hero)).toEqual(['howler', 'bravo']);
    expect(canPlay('howler', s)).toBe(true);
    expect(canPlay('howler', s, true)).toBe(false);
    expect(canPlay('bravo', s, true)).toBe(true);
    expect(ownedCount(s)).toBe(8);
    expect(ownedCount(s, true)).toBe(7);
  });

  it('a Founders roster owns every champion', () => {
    const s = server0({ founders: true, owned: game.CHAMPION_IDS.map((hero) => ({ hero, source: 'founders' })) });
    expect(game.CHAMPION_IDS.every((h) => canPlay(h, s, true))).toBe(true);
    expect(ownedCount(s, true)).toBe(20);
  });

  it('unlock info: the Yarn still to earn and the Champion Pick (Tier 1 and 2 only)', () => {
    const s = server0({ yarn: { balance: 2300, matches: 5, picksLeft: 1, nextPickAt: 15 } });
    expect(unlockInfo('pixel', s)).toMatchObject({ yarn: 3500, toGo: 1200, pick: true });
    expect(unlockInfo('aviete', s)).toMatchObject({ yarn: 4800, pick: false });
    expect(unlockInfo('clem', s).yarn).toBeNull();
  });
});

describe('host messages', () => {
  it('store.champions reaches the snapshot; the rotation is the catalogue’s, never the message’s heroes', () => {
    const v = parseStoreState({ items: [], season: null, champions: { owned: [{ hero: 'domino', source: 'founders' }], founders: true, rotation: { week: 1, heroes: ['evil'] }, yarn: { balance: 12, matches: 3, picksLeft: 0, nextPickAt: 5 }, bundles: [{ sku: 'pl_champs_all_s1', cents: { usd: 2799, eur: 2799 } }] } });
    expect(v?.champions?.rotation.heroes).toEqual(game.rotationOf(1));
    expect(v?.champions?.founders).toBe(true);
    const e = new Entitlements();
    e.apply({ type: 'app', isApp: false, store: true });
    e.apply({ type: 'store', items: [], season: null, champions: { owned: [{ hero: 'domino', source: 'founders' }], rotation: { week: 0 }, yarn: {}, bundles: [] } } as never);
    expect(e.snapshot().champions?.owned).toEqual([{ hero: 'domino', source: 'founders' }]);
    e.apply({ type: 'session', signedIn: false });
    expect(e.snapshot().champions).toBeNull();
  });

  it('the save result carries the Yarn and a locked hero', () => {
    const r = parseSaveResult({ matchId: 'abc', status: 'saved', catnipPaid: 0, season: { gained: 0, xp: 10, tier: 0, prevTier: 0, yarn: { gained: 90, balance: 300, newPicks: 1 }, heroLocked: true } });
    expect(r?.season?.yarn).toEqual({ gained: 90, balance: 300, newPicks: 1 });
    expect(r?.season?.heroLocked).toBe(true);
  });
});

describe('pick screen', () => {
  const choice: Choice = { hero: 'clem', trick: 'pounce', difficulty: 'easy' } as Choice;
  const open = (state = localChampions(WEEK0), isApp = false) => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const started: { c: Choice; practice?: boolean }[] = [];
    const unlocks: string[] = [];
    const el = pickScreen(root, {
      initial: choice,
      onHero: () => undefined,
      onStart: (c, o) => started.push({ c, practice: o?.practice }),
      onBack: () => undefined,
      champs: { state: () => state, isApp, store: true, onUnlock: (h, via) => unlocks.push(`${h}:${via}`), onBuy: () => undefined },
    });
    return { el, started, unlocks };
  };

  it('a locked tile is marked; LOCK IN on it is Practice; a starter starts a normal match', () => {
    const { el, started } = open();
    expect(el.querySelector('[data-h="howler"]')?.classList.contains('locked')).toBe(true);
    expect(el.querySelector('[data-h="clem"]')?.classList.contains('locked')).toBe(false);
    expect(el.querySelector('[data-h="meatball"] .champ-free')?.textContent).toBe('Free');
    (el.querySelector('[data-h="howler"]') as HTMLElement).click();
    expect(el.querySelector('.cs-lock')?.textContent).toContain('PRACTICE');
    (el.querySelector('[data-a="start"]') as HTMLElement).click();
    expect(started.pop()).toEqual({ c: { ...choice, hero: 'howler' }, practice: true });
    (el.querySelector('[data-h="clem"]') as HTMLElement).click();
    (el.querySelector('[data-a="start"]') as HTMLElement).click();
    expect(started.pop()?.practice).toBeUndefined();
  });

  it('the unlock row: Yarn to go, a Champion Pick, the price on the web only', () => {
    const poor = server0({ yarn: { balance: 0, matches: 5, picksLeft: 1, nextPickAt: 15 } });
    const web = champBarHtml('pixel', { state: () => poor, isApp: false, store: true, onUnlock: () => undefined, onBuy: () => undefined });
    expect(web).toContain('3,500 Yarn to go');
    expect(web).toContain('Use a Champion Pick');
    expect(web).toMatch(/[$€]3\.99/);
    const app = champBarHtml('pixel', { state: () => poor, isApp: true, store: false, onUnlock: () => undefined, onBuy: () => undefined });
    expect(app).not.toMatch(/[$€]/);
    const rich = server0({ yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } });
    expect(champBarHtml('pixel', { state: () => rich, isApp: true, store: false, onUnlock: () => undefined, onBuy: () => undefined })).toContain('Unlock · 3,500 Yarn');
    // a web-bought champion in the app: no unlock (the server answers "already owned"), no reason given
    const bought = server0({ owned: [{ hero: 'duchess', source: 'purchase' }], yarn: { balance: 9000, matches: 40, picksLeft: 1, nextPickAt: null } });
    expect(champBarHtml('duchess', { state: () => bought, isApp: true, store: false, onUnlock: () => undefined, onBuy: () => undefined })).toBe('');
    expect(lockReason('duchess', bought, true)).toBe('Locked');
    expect(lockReason('duchess', bought, false)).toBe('');
  });

  it('the unlock button asks the host', () => {
    const rich = server0({ yarn: { balance: 9000, matches: 40, picksLeft: 0, nextPickAt: null } });
    const { el, unlocks } = open(rich);
    (el.querySelector('[data-h="howler"]') as HTMLElement).click();
    (el.querySelector('[data-a="unlock"]') as HTMLElement).click();
    expect(unlocks).toEqual(['howler:yarn']);
  });
});

describe('store Champions tab', () => {
  it('lists the 3 bundles then the 14 champions; owned and prorated states', () => {
    const skus = tabSkus('champions');
    expect(skus).toHaveLength(17);
    const pixel = skus.find((d) => d.sku === 'pl_champ_pixel')!;
    const cats = skus.find((d) => d.sku === 'pl_champs_cats_s1')!;
    const s = { items: new Set<string>(), season: null, champions: server0({ owned: [{ hero: 'pixel', source: 'yarn' }], bundles: [{ sku: 'pl_champs_cats_s1', cents: { usd: 1499, eur: 1499 } }] }) };
    expect(itemState(pixel, s)).toBe('owned');
    expect(itemState(cats, s)).toBe('buy');
    expect(priceFor(cats, s)).toEqual({ usd: 1499, eur: 1499 });
  });
});

describe('party pick lock', () => {
  afterEach(() => setPickChampLock(null));
  it('a locked champion is blocked with its reason; without a lock function every hero is open', () => {
    const v = { you: 'm1', leader: 'm1', members: [{ id: 'm1', locked: false }] } as unknown as PartyView;
    expect(heroBlock(v, 'howler')).toBe('');
    const s = localChampions(WEEK0);
    setPickChampLock((h) => lockReason(h, s));
    expect(heroBlock(v, 'howler')).toBe('Unlock with Yarn');
    expect(heroBlock(v, 'clem')).toBe('');
  });
});

describe('time to unlock', () => {
  it('the "about N matches" line uses about 90 Yarn a match, so a T2 champion reads about 39 matches, not 50', async () => {
    const { matchesFor, YARN_PER_MATCH } = await import('../../src/meta/champions');
    expect(YARN_PER_MATCH).toBe(90);
    expect(matchesFor(game.TIER_PRICE.t2.yarn)).toBe(39);
    expect(matchesFor(1)).toBe(1);
  });
});
