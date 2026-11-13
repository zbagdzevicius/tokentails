// @vitest-environment happy-dom
/**
 * Gap plan P2 `rewards-cloud`, game side: the progress blob and its max-merge back into the Treat Track, quests and
 * profile; grants applied once; the Lucky Treat odds and chest; the Welcome Path; mastery; the friend quest; the
 * progress ops on the bridge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_OPS, cleanApiArgs } from '../../src/embed/api';
import { LUCKY_DEFAULT, parseGrants, parseLuckyTable, untilFloor } from '../../src/meta/lucky';
import { loadMastery, masteryLevel, masteryToNext, parseMastery, resetMasteryCache, MASTERY_STEPS } from '../../src/meta/mastery';
import { freshProfile, loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { applyGrants, applyView, buildBlob, loadCloud, mergeProfile, mergeQuests, mergeTreats, parseView, SYNCED_KEYS } from '../../src/meta/progressCloud';
import { dayKey, FRIEND_QUEST, freshQuests, loadQuests, progressQuests, QUEST_POOL, questViews, saveQuests } from '../../src/meta/quests';
import { freshTreats, loadTreats, saveTreats, TREAT_STEP, treatReward } from '../../src/meta/treats';
import { giftLabel, parseWelcome, WELCOME_PATH, welcomeVisible } from '../../src/meta/welcome';
import { questTally } from '../../src/ui/lobby/lobbyScreen';
import { masteryChipHtml, openLuckyChest, openLuckyOdds, RewardsCloud, todayExtraHtml } from '../../src/ui/rewards/rewards';
import { LUCKY_POOL } from '../../../backend/src/pawlegends/progress/lucky';
import { WELCOME_PATH as SERVER_WELCOME } from '../../../backend/src/pawlegends/progress/welcome';
import { MASTERY_STEPS as SERVER_STEPS } from '../../../backend/src/pawlegends/progress/mastery';

beforeEach(() => {
  localStorage.clear();
  resetProfileCache();
  resetMasteryCache();
  document.body.innerHTML = '';
});
afterEach(() => vi.useRealTimers());

describe('the server mirrors', () => {
  it('every Lucky Treat and Welcome Path cosmetic is one the game already renders', () => {
    for (const ids of Object.values(LUCKY_POOL)) for (const id of ids) expect(treatReward(id), id).not.toBeNull();
    for (const g of SERVER_WELCOME) if (g.item) expect(treatReward(g.item), g.item).not.toBeNull();
    expect(WELCOME_PATH).toEqual(SERVER_WELCOME);
    expect(MASTERY_STEPS).toEqual(SERVER_STEPS);
    // the published default table matches the pool sizes and sums to 100 %
    expect(LUCKY_DEFAULT.odds.map((r) => r.items)).toEqual([LUCKY_POOL.common.length, LUCKY_POOL.rare.length, LUCKY_POOL.epic.length]);
    expect(LUCKY_DEFAULT.odds.reduce((n, r) => n + r.pct, 0)).toBe(100);
  });
});

describe('progress blob', () => {
  it('carries the Treat Track, quests, counters, unlocks and settings', () => {
    const p = { ...freshProfile(), matches: 4, wins: 2, firstWinDone: true, unlocks: ['emote.wave'], tipsOff: true, heroMatches: { clem: 3 } };
    saveProfile(p);
    saveTreats({ ...freshTreats(), xp: 640, chests: 2 });
    localStorage.setItem('pawlegends.leftHanded', '1');
    const { blob, local } = buildBlob(5000);
    expect(blob.treats).toEqual({ xp: 640, chests: 2, winDay: null });
    expect(blob.counts).toEqual({ matches: 4, wins: 2, firstWin: 1, heroMatches: { clem: 3 } });
    expect(blob.unlocks).toEqual(['emote.wave']);
    expect(blob.prefs.data.profile?.tipsOff).toBe(true);
    expect(blob.prefs.data.keys).toEqual({ 'pawlegends.leftHanded': '1' });
    // a device that has played and never synced sends its settings as old (1), so a newer account change wins
    expect(local.prefsAt).toBe(1);
    expect(blob.prefs.at).toBe(1);
    // a fresh device sends 0: it takes the account's settings instead of overwriting them with defaults
    localStorage.clear();
    resetProfileCache();
    expect(buildBlob(5000).blob.prefs.at).toBe(0);
  });

  it('a settings change after a sync is stamped with its time', () => {
    saveProfile({ ...freshProfile(), matches: 1 });
    const first = buildBlob(1000);
    const again = buildBlob(2000, first.local);
    expect(again.local.prefsAt).toBe(first.local.prefsAt);
    saveProfile({ ...loadProfile(), numbers: true });
    expect(buildBlob(3000, first.local).local.prefsAt).toBe(3000);
  });

  it('merges back by max: progress never goes down', () => {
    const t = { ...freshTreats(), xp: 900, chests: 3, winDay: '2026-11-12' };
    expect(mergeTreats(t, { xp: 600, chests: 2, winDay: '2026-11-13' })).toEqual({ ...t, winDay: '2026-11-13' });
    expect(mergeTreats(t, { xp: 1500, chests: 99 })).toEqual({ ...t, xp: 1500, chests: Math.floor(1500 / TREAT_STEP) });
    const q = { v: 1 as const, day: '2026-11-13', progress: { play2: 1 }, done: [] as string[] };
    expect(mergeQuests(q, { day: '2026-11-13', progress: { play2: 2, win: 1 }, done: ['play2'] })).toEqual({ v: 1, day: '2026-11-13', progress: { play2: 2, win: 1 }, done: ['play2'] });
    expect(mergeQuests(q, { day: '2026-11-12', progress: { play2: 2 }, done: ['play2'] })).toBe(q);
    const p = { ...freshProfile(), matches: 5, wins: 1, unlocks: ['emote.wave'], heroMatches: { clem: 2 } };
    const m = mergeProfile(p, { counts: { matches: 3, wins: 3, firstWin: 1, heroMatches: { clem: 1, sage: 4 } }, unlocks: ['coat.sage.midnight', '<x>'] }, 0);
    expect(m.profile.matches).toBe(5);
    expect(m.profile.wins).toBe(3);
    expect(m.profile.firstWinDone).toBe(true);
    expect(m.profile.unlocks).toEqual(expect.arrayContaining(['emote.wave', 'coat.sage.midnight', 'coat.brutus.biscuit']));
    expect(m.profile.unlocks).not.toContain('<x>');
    expect(m.profile.heroMatches).toEqual({ clem: 2, sage: 4 });
    expect(m.prefsTaken).toBe(false);
  });

  it('takes the account settings only when they are newer, through the profile parser', () => {
    const p = { ...freshProfile(), tipsOff: false };
    const newer = mergeProfile(p, { prefs: { at: 10, data: { profile: { tipsOff: true, skinFx: 'bogus', hero: 'sage' } } } }, 5);
    expect(newer.prefsTaken).toBe(true);
    expect(newer.profile.tipsOff).toBe(true);
    expect(newer.profile.skinFx).toBe('all');
    expect(newer.profile.hero).toBe('sage');
    expect(mergeProfile(p, { prefs: { at: 4, data: { profile: { tipsOff: true } } } }, 5).prefsTaken).toBe(false);
  });

  it('a new device takes the whole account (applyView): same Treat Track as the first device', () => {
    const view = parseView({
      blob: {
        treats: { xp: 1250, chests: 4, winDay: '2026-11-13' },
        quests: { day: dayKey(), progress: { play2: 2 }, done: ['play2'] },
        counts: { matches: 14, wins: 9, firstWin: 1, heroMatches: { brutus: 6 } },
        unlocks: ['emote.wave', 'coat.clem.marmalade'],
        applied: [],
        prefs: { at: 77, data: { profile: { numbers: true }, keys: { 'pawlegends.touchSize': 'large', 'evil.key': 'x' } } },
      },
      grants: [],
      lucky: { odds: LUCKY_DEFAULT.odds, floor: 10, dailyTreatXp: 150, n: 3, eligible: true },
      welcome: { days: 2, today: true },
      mastery: { brutus: { m: 6, w: 4 } },
      today: '2026-11-13',
    })!;
    const out = applyView(view, loadCloud());
    expect(out.changed).toBe(true);
    expect(loadTreats()).toMatchObject({ xp: 1250, chests: 4 });
    expect(loadQuests().done).toEqual(['play2']);
    expect(loadProfile()).toMatchObject({ matches: 14, wins: 9, firstWinDone: true, numbers: true });
    expect(localStorage.getItem('pawlegends.touchSize')).toBe('large');
    expect(localStorage.getItem('evil.key')).toBeNull();
    expect(loadMastery().brutus).toEqual({ m: 6, w: 4, level: masteryLevel(6, 4) });
    expect(loadCloud()).toMatchObject({ prefsAt: 77, welcome: { days: 2, today: true }, today: '2026-11-13' });
    // a second answer with the same data changes nothing
    expect(applyView(view, loadCloud()).changed).toBe(false);
  });
});

describe('grants', () => {
  it('apply once: an item joins the unlocks, Treat XP fills the track (and may open a chest)', () => {
    saveTreats({ ...freshTreats(), xp: 250 });
    const grants = parseGrants([
      { id: 'welcome:1', kind: 'welcome', day: '2026-11-13', xp: 100, n: 1 },
      { id: 'lucky:2026-11-13', kind: 'lucky', day: '2026-11-13', item: 'coat.sage.loop.plum', rarity: 'common', n: 1 },
      { id: 'evil:1', kind: 'lucky', item: 'x' },
      { id: 'lucky:x', kind: 'lucky' },
    ]);
    expect(grants.map((g) => g.id)).toEqual(['welcome:1', 'lucky:2026-11-13']);
    const local = loadCloud();
    const out = applyGrants(grants, [], local);
    expect(out.fresh.map((g) => g.id)).toEqual(['welcome:1', 'lucky:2026-11-13']);
    expect(out.chests).toHaveLength(1);
    expect(loadTreats().xp).toBe(350);
    expect(loadProfile().unlocks).toContain('coat.sage.loop.plum');
    expect(local.applied).toEqual(['welcome:1', 'lucky:2026-11-13']);
    // again (this device) or applied elsewhere (the server's list): nothing twice
    expect(applyGrants(grants, [], local).fresh).toEqual([]);
    expect(applyGrants(grants, ['welcome:1', 'lucky:2026-11-13'], loadCloud()).fresh).toEqual([]);
    expect(loadTreats().xp).toBe(350);
  });
});

describe('Lucky Treat', () => {
  it('parses the published table and falls back when it does not add up', () => {
    expect(parseLuckyTable({ odds: [{ rarity: 'common', pct: 50 }], floor: 10 }).odds).toEqual(LUCKY_DEFAULT.odds);
    const t = parseLuckyTable({ odds: LUCKY_DEFAULT.odds, floor: 10, dailyTreatXp: 150, n: 13, eligible: false });
    expect(t.eligible).toBe(false);
    expect(untilFloor(t)).toBe(7);
    expect(untilFloor({ n: 0, floor: 10 })).toBe(10);
  });

  it('the chest shows the odds before it opens, then reveals the reward', () => {
    const g = parseGrants([{ id: 'lucky:2026-11-13', kind: 'lucky', day: '2026-11-13', item: 'frame.champ.lambo', rarity: 'epic', n: 10, floor: true }])[0];
    const done = vi.fn();
    const el = openLuckyChest(g, LUCKY_DEFAULT, done);
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(el.textContent).not.toContain('Lambo frame');
    (el.querySelector('[data-k="odds"]') as HTMLElement).click();
    const sheet = document.querySelector('[data-testid="lucky-odds-sheet"]')!;
    expect(sheet.textContent).toContain('62%');
    expect(sheet.textContent).toContain('28%');
    expect(sheet.textContent).toContain('10%');
    expect(sheet.textContent).toContain('Every 10th Lucky Treat is Rare or better');
    expect(sheet.textContent).toContain('never sold');
    (sheet.querySelector('[data-k="close"]') as HTMLElement).click();
    (el.querySelector('.pl-btn[data-k="open"]') as HTMLElement).click();
    expect(el.textContent).toContain('Lambo frame');
    expect(el.textContent).toContain('Epic');
    expect(el.querySelector('.rw-card')!.className).toContain('r-epic');
    (el.querySelector('[data-k="close"]') as HTMLElement).click();
    expect(done).toHaveBeenCalledTimes(1);
    expect(loadCloud().opened).toContain('lucky:2026-11-13');
    // no price, no store, no purchase words anywhere
    expect(document.body.innerHTML).not.toMatch(/\$|€|buy|purchase|store/i);
  });

  it('the under-16 Daily Treat has no odds and no rarity', () => {
    const g = parseGrants([{ id: 'treat:2026-11-13', kind: 'treat', day: '2026-11-13', xp: 150 }])[0];
    const el = openLuckyChest(g, { ...LUCKY_DEFAULT, eligible: false });
    expect(el.querySelector('[data-k="odds"]')).toBeNull();
    expect(el.textContent).toContain('Daily Treat');
    (el.querySelector('.pl-btn[data-k="open"]') as HTMLElement).click();
    expect(el.textContent).toContain('+150 Treat XP');
    const sheet = openLuckyOdds({ ...LUCKY_DEFAULT, eligible: false });
    expect(sheet.querySelector('table')).toBeNull();
    expect(sheet.textContent).toContain('No random rewards');
  });

  it('the sync loop shows a chest only on Home or results, and tells the server what it applied', async () => {
    vi.useFakeTimers();
    saveProfile({ ...freshProfile(), matches: 2 });
    document.documentElement.dataset.screen = 'match';
    const body = (applied: string[]) => ({
      blob: { treats: { xp: 0, chests: 0 }, counts: { matches: 2 }, unlocks: [], applied, prefs: { at: 0, data: {} } },
      grants: [{ id: 'lucky:2026-11-13', kind: 'lucky', day: '2026-11-13', item: 'coat.clem.loop.peach', rarity: 'common', n: 1 }],
      lucky: { odds: LUCKY_DEFAULT.odds, floor: 10, dailyTreatXp: 150, n: 1, eligible: true },
      welcome: { days: 1, today: true },
      mastery: {},
      today: '2026-11-13',
    });
    const sent: string[][] = [];
    const api = vi.fn(async (_op: string, args?: Record<string, unknown>) => {
      const b = JSON.parse(String(args?.blob)) as { applied: string[] };
      sent.push(b.applied);
      return { id: 'x', ok: true, status: 200, body: body(b.applied) };
    });
    const r = new RewardsCloud({ api: api as never, eligible: () => true, onChange: vi.fn() });
    await r.sync();
    expect(document.querySelector('[data-testid="lucky-treat"]')).toBeNull();
    expect(loadProfile().unlocks).toContain('coat.clem.loop.peach');
    document.documentElement.dataset.screen = 'results';
    r.flush();
    expect(document.querySelector('[data-testid="lucky-treat"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(api).toHaveBeenCalledTimes(2);
    expect(sent[1]).toContain('lucky:2026-11-13');
    r.dispose();
  });
});

describe('Welcome Path and Home Today', () => {
  it('labels gifts and shows while it runs', () => {
    expect(giftLabel(WELCOME_PATH[0])).toBe('+100 Treat XP');
    expect(giftLabel(WELCOME_PATH[1])).toBe('Wave emote');
    expect(welcomeVisible(parseWelcome({ days: 3, today: false }))).toBe(true);
    expect(welcomeVisible(parseWelcome({ days: 7, today: false }))).toBe(false);
    expect(welcomeVisible(null)).toBe(false);
    expect(todayExtraHtml()).toBe('');
    const c = loadCloud();
    localStorage.setItem('tt.pawlegends.cloud.v1', JSON.stringify({ ...c, welcome: { days: 3, today: true }, lucky: LUCKY_DEFAULT }));
    const html = todayExtraHtml();
    expect(html).toContain('Welcome Path');
    expect(html).toContain('Tomorrow: Lilac Clem coat');
    expect(html).toContain('data-rw="odds"');
    expect((html.match(/class="got"/g) ?? []).length).toBe(3);
  });
});

describe('mastery', () => {
  it('levels, the next step and the chip (verified counts only, from the server)', () => {
    expect(masteryLevel(0, 0)).toBe(0);
    expect(masteryLevel(12, 0)).toBe(3);
    expect(masteryToNext({ m: 3, w: 1 })).toBe(1);
    expect(masteryToNext({ m: 100, w: 30 })).toBeNull();
    expect(parseMastery({ clem: { m: 3, w: 8 }, '__proto__': { m: 9 }, sage: 'x' })).toEqual({ clem: { m: 3, w: 3, level: masteryLevel(3, 3) } });
    expect(masteryChipHtml('clem')).toBe('');
    localStorage.setItem('tt.pawlegends.mastery.v1', JSON.stringify({ clem: { m: 20, w: 10 } }));
    resetMasteryCache();
    expect(masteryChipHtml('clem')).toContain('M4');
    expect(masteryChipHtml('clem')).toContain('30 verified matches'.replace('30', '20'));
  });
});

describe('friend quest', () => {
  it('a 4th quest every day, outside the pool and the tally; only a friends party counts', () => {
    expect(QUEST_POOL.some((q) => q.id === FRIEND_QUEST.id)).toBe(false);
    const day = '2026-11-13';
    const views = questViews(freshQuests(day));
    expect(views).toHaveLength(4);
    expect(views[3].quest.id).toBe('party2');
    expect(questTally(views)).toEqual({ done: 0, total: 3 });
    const solo = progressQuests(freshQuests(day), { won: true, hero: 'clem', takedowns: 0, pudding: false, towers: 0, combos: 0 });
    expect(solo.views).toHaveLength(3);
    expect(solo.state.progress.party2 ?? 0).toBe(0);
    const one = progressQuests(solo.state, { won: false, hero: 'clem', takedowns: 0, pudding: false, towers: 0, combos: 0, party: true });
    expect(one.views.find((v) => v.quest.id === 'party2')?.value).toBe(1);
    const two = progressQuests(one.state, { won: false, hero: 'clem', takedowns: 0, pudding: false, towers: 0, combos: 0, party: true });
    const v = two.views.find((x) => x.quest.id === 'party2')!;
    expect(v.done && v.fresh).toBe(true);
    // stored progress survives a reload (the id is known to the parser)
    saveQuests(two.state);
    expect(loadQuests(day).done).toContain('party2');
  });
});

describe('bridge ops', () => {
  it('progress.get and progress.sync, with the blob as one long string arg', () => {
    expect(API_OPS).toEqual(expect.arrayContaining(['progress.get', 'progress.sync']));
    const blob = JSON.stringify({ v: 1, unlocks: Array.from({ length: 300 }, (_, i) => `coat.clem.loop.x${i}`) });
    expect(blob.length).toBeGreaterThan(140);
    expect(cleanApiArgs({ blob })).toEqual({ blob });
    expect(cleanApiArgs({ blob: 'x'.repeat(30001) })).toEqual({});
    expect(cleanApiArgs({ name: 'x'.repeat(141) })).toEqual({});
    expect(SYNCED_KEYS.every((k) => k.length < 40)).toBe(true);
  });
});
