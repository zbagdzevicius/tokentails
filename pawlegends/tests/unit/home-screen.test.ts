// @vitest-environment happy-dom
/**
 * Home (docs/plans/moba/HOME-MODES.md §4) and the one main queue (MODE-UNLOCKS.md, founder Nov 19): PLAY is one tap
 * into the 3v3 queue; Ranked and Practice sit beside it only once unlocked (the app passes them), revealed once. Home
 * has no other match start (no quick Co-op or PvP, no nameplate or Heroes lock-in, no Friends nav, no Games button); the
 * first visit keeps the guided one-tap match; the app build never shows the Store; names are escaped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableQueues, botsChoice, disposeHome, homeFace, homeScreen, mainQueue, patchHome, pvpLockText, resolveChoice, ringPct, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { modeById, modeList } from '../../src/ui/modeSelect/modes';
import { goalsPanelHtml, questsResetText } from '../../src/ui/home/goalsPanel';

const NOW = Date.now();
const om = (o: { locked?: boolean } = {}) => ({ mode: 'coop' as const, locked: o.locked ?? false, needed: 5, played: 2, onMode: vi.fn() });
const base = (o: Partial<HomeScreenOpts> = {}): HomeScreenOpts => ({
  firstTime: false,
  last: { hero: 'sage', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Sage', sub: 'Sage the Marksman', element: 'WIND', role: 'Marksman' },
  signedIn: false,
  difficulties: ['easy', 'normal', 'hard'],
  onPlay: vi.fn(),
  onChoose: vi.fn(),
  onMute: vi.fn(),
  onStart: vi.fn(),
  profile: { name: 'Guest', tier: null, pct: 0, xp: null, matches: 4 },
  modes: modeList(NOW),
  modeChoice: { mode: 'skirmish', queue: 'bots' },
  onModeChoice: vi.fn(),
  base: './',
  ...o,
});
/** Every online variant this build can start (relay, PvP sim, party server). */
const online = (o: Partial<HomeScreenOpts> = {}): HomeScreenOpts => base({ onOnline: vi.fn(), onParty: vi.fn(), onlineMode: om(), ...o });
const mount = (o: HomeScreenOpts): HTMLElement => homeScreen(document.body, o);
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Mode Select is a lazy chunk: wait for it after PLAY. */
const modesOpen = async (): Promise<HTMLElement> => {
  await vi.waitFor(() => expect(document.querySelector('[data-testid="mode-select"]')).toBeTruthy());
  return document.querySelector<HTMLElement>('[data-testid="mode-select"]')!;
};
const play = (root: HTMLElement): void => root.querySelector<HTMLElement>('[data-testid="home-play"]')!.click();
const click = (ms: HTMLElement, id: string): void => ms.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click();
const esc = (): void => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
/** The Quests panel is its own chunk: click Quests and wait for it. */
const openGoals = async (root: HTMLElement): Promise<HTMLElement> => {
  root.querySelector<HTMLElement>('[data-testid="home-goals"]')!.click();
  await vi.waitFor(() => expect(root.querySelector('[data-testid="goals-panel"]')).toBeTruthy());
  return root.querySelector<HTMLElement>('[data-testid="goals-panel"]')!;
};
const panelOf = (root: HTMLElement): HTMLElement | null => root.querySelector<HTMLElement>('[data-testid="goals-panel"]');

afterEach(() => {
  for (const el of document.querySelectorAll<HTMLElement>('.pl-home')) disposeHome(el);
  document.body.innerHTML = '';
});

describe('home state logic', () => {
  it('offers bots always, co-op with a relay, PvP only with the PvP sim, friends with the party server', () => {
    expect(availableQueues({})).toEqual(['bots']);
    expect(availableQueues({ onOnline: () => undefined })).toEqual(['bots', 'coop']);
    expect(availableQueues({ onOnline: () => undefined, onlineMode: om() })).toEqual(['bots', 'coop', 'pvp']);
    expect(availableQueues({ onOnline: () => undefined, onlineMode: om(), onParty: () => undefined })).toEqual(['bots', 'coop', 'pvp', 'friends']);
  });

  it('locks 3v3 PvP by match count, never 5v5 Classic', () => {
    const o = { onlineMode: om({ locked: true }) };
    expect(pvpLockText(o, { id: 'skirmish' })).toBe('PvP unlocks after 5 matches');
    expect(pvpLockText(o, { id: 'classic' })).toBeNull();
    expect(pvpLockText({}, { id: 'skirmish' })).toBeNull();
  });

  it('resolves the remembered choice: a variant this build offers, Skirmish when the mode cannot be played', () => {
    const modes = modeList(NOW);
    expect(resolveChoice(modes, { mode: 'classic', queue: 'pvp' }, ['bots'], NOW)).toMatchObject({ mode: { id: 'classic' }, queue: 'bots' });
    const vault = { id: 'vault', name: 'Vault', size: '3v3' as const, minutes: '~5 min', queues: ['pvp' as const], art: 'cannon', state: 'locked' as const, rules: ['a', 'b'] };
    expect(resolveChoice([...modes, vault], { mode: 'vault', queue: 'pvp' }, ['bots', 'pvp'], NOW)).toMatchObject({ mode: { id: 'skirmish' }, queue: 'pvp' });
    // round 4: Ranked is always open, so a remembered Ranked stays Ranked
    expect(resolveChoice(modes, { mode: 'ranked', queue: 'pvp' }, ['bots', 'pvp'], NOW)).toMatchObject({ mode: { id: 'ranked' }, queue: 'pvp' });
  });

  it('a bots match carries the map only off the default 3v3 map', () => {
    const last = { hero: 'sage' as const, trick: 'pounce' as const, difficulty: 'easy' as const, map: 'hearthwood' as const };
    expect(botsChoice(last, 'hard', modeById('skirmish')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'hard' });
    expect(botsChoice(last, 'normal', modeById('classic')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'normal', map: 'hearthwood' });
    // sim v22: Blitz is the Crossing with the blitz mutator (no map); another mode drops a remembered mutator
    expect(botsChoice(last, 'easy', modeById('blitz')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'easy', mutator: 'blitz' });
    expect(botsChoice({ ...last, mutator: 'blitz' }, 'easy', modeById('skirmish')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'easy' });
  });

  it('the profile ring shows Season XP progress only when a season is known', () => {
    expect(ringPct({ name: 'a', tier: null, pct: 0.5, xp: null, matches: 0 })).toBe(0);
    expect(ringPct({ name: 'a', tier: 3, pct: 0.456, xp: 900, matches: 0 })).toBe(46);
    expect(ringPct({ name: 'a', tier: 3, pct: 7, xp: 900, matches: 0 })).toBe(100);
  });
});

describe('home screen: one main queue (MODE-UNLOCKS.md, founder Nov 19)', () => {
  it('PLAY is one tap into the 3v3 main queue: PvP where the backend runs it, else co-op, else vs bots', async () => {
    const onStart = vi.fn();
    let root = mount(online({ onStart }));
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
    const btn = root.querySelector<HTMLElement>('[data-testid="home-play"]')!;
    expect(btn.getAttribute('aria-label')).toBe('Play: 3v3 match');
    expect(btn.getAttribute('aria-haspopup')).toBeNull();
    play(root);
    await tick();
    expect(onStart).toHaveBeenLastCalledWith({ mode: 'skirmish', queue: 'pvp' });
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    document.body.innerHTML = '';
    root = mount(base({ onStart, onOnline: vi.fn() }));
    play(root);
    expect(onStart).toHaveBeenLastCalledWith({ mode: 'skirmish', queue: 'coop' });
    document.body.innerHTML = '';
    root = mount(base({ onStart }));
    play(root);
    expect(onStart).toHaveBeenLastCalledWith({ mode: 'skirmish', queue: 'bots' });
    expect(mainQueue(['bots', 'coop', 'pvp', 'friends'])).toBe('pvp');
  });

  it('no other match start on Home, and no mode picker, no timed-mode rows, no Ranked in the nav', () => {
    const root = mount(online({ onCollection: vi.fn(), onJoinCode: vi.fn(), onHeroes: vi.fn(), storeOpen: true, onStore: vi.fn() }));
    for (const sel of ['[data-testid="play-online"]', '[data-testid="play-pvp"]', '[data-testid="play-friends"]', '[data-a="online"]', '[data-a="choose"]', '[data-testid="lobby-exit"]', '[data-testid="mode-pill"]', '[data-testid="play-new"]', '[data-a="modes"]', '.hm-nav [data-a="ranked"]', '.hm-nav [data-a="locked"][data-why*="Ranked"]'])
      expect(root.querySelector(sel), sel).toBeNull();
    expect(root.querySelector('.hm-playc .hm-line')).toBeNull();
    expect(root.textContent).not.toMatch(/Classic|Blitz|Duel|One Lane|Cannon|Boss Weekend|Twist|Unlocks at/);
    expect(root.querySelector('[data-testid="join-code"]')).toBeTruthy();
    expect(root.querySelector('.hm-plate')?.getAttribute('data-a')).toBe('plate');
  });

  it('Party (left stack) opens a party lobby, where Mode Select\'s With Friends was; not on a first visit', () => {
    const onParty = vi.fn();
    const root = mount(online({ onParty }));
    root.querySelector<HTMLElement>('[data-testid="home-party"]')!.click();
    expect(onParty).toHaveBeenCalledTimes(1);
    // Party sits in PLAY's cluster, not in the left stack
    expect(root.querySelector('.hm-playrow [data-testid="home-party"]')).toBeTruthy();
    expect(root.querySelector('.hm-left [data-testid="home-party"]')).toBeNull();
    document.body.innerHTML = '';
    expect(mount(online({ onParty, firstTime: true })).querySelector('[data-testid="home-party"]')).toBeNull();
  });

  it('Ranked and Practice show beside PLAY only when the app passes them (Lv 10, Lv 5): never locked, never teased', async () => {
    const onStart = vi.fn();
    const none = mount(online({ onStart, extras: [] }));
    // Lv 1: the cluster beside PLAY holds Party only (founder Nov 19: Party sits around PLAY)
    expect(Array.from(none.querySelectorAll<HTMLElement>('.hm-alt')).map((x) => x.dataset.mode).filter((m) => m !== 'party')).toEqual([]);
    expect(none.querySelector('[data-testid="home-ranked"], [data-testid="home-practice"]')).toBeNull();
    document.body.innerHTML = '';
    const lv5 = mount(online({ onStart, extras: ['practice'] }));
    expect(lv5.querySelector('[data-testid="home-practice"]')).toBeTruthy();
    expect(lv5.querySelector('[data-testid="home-ranked"]')).toBeNull();
    document.body.innerHTML = '';
    const root = mount(online({ onStart, extras: ['ranked', 'practice'] }));
    const order = Array.from(root.querySelectorAll<HTMLElement>('.hm-alt')).map((b) => b.dataset.mode).filter((m) => m !== 'party');
    expect(order).toEqual(['ranked', 'practice']);
    // inside PLAY's cluster, before PLAY
    expect(root.querySelector('.hm-playrow > .hm-extras + .hm-play')).toBeTruthy();
    root.querySelector<HTMLElement>('[data-testid="home-ranked"]')!.click();
    expect(onStart).toHaveBeenLastCalledWith({ mode: 'ranked', queue: 'pvp' });
    // Practice opens its map pick alone (Mode Select's variant stage for Practice), then the champion select
    root.querySelector<HTMLElement>('[data-testid="home-practice"]')!.click();
    const ms = await modesOpen();
    expect(ms.dataset.stage).toBe('variant');
    expect(ms.querySelector('.ms-title')?.textContent).toBe('Practice');
    expect(ms.querySelector('[data-testid="practice-maps"]')).toBeTruthy();
    expect(ms.querySelectorAll('.ms-pick')).toHaveLength(1);
    click(ms, 'mode-go');
    expect(onStart).toHaveBeenLastCalledWith({ mode: 'practice', queue: 'bots' });
  });

  it('Practice: Back and Esc close the map pick (no mode tiles behind it)', async () => {
    const root = mount(online({ extras: ['practice'] }));
    root.querySelector<HTMLElement>('[data-testid="home-practice"]')!.click();
    await modesOpen();
    esc();
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
  });

  it('a just-unlocked button is revealed once: NEW on it, "New: Ranked", and the app is told', async () => {
    const onRevealed = vi.fn();
    const root = mount(online({ extras: ['ranked', 'practice'], reveal: ['ranked'], onRevealed }));
    const r = root.querySelector<HTMLElement>('[data-testid="home-ranked"]')!;
    expect(r.classList.contains('fresh')).toBe(true);
    expect(r.querySelector('.hm-alt-new')?.textContent).toBe('NEW');
    expect(root.querySelector('[data-testid="home-practice"]')!.classList.contains('fresh')).toBe(false);
    expect(root.querySelector('.hm-toast')?.textContent).toBe('New: Ranked');
    expect(onRevealed).toHaveBeenCalledWith(['ranked']);
    // a reveal for a button not shown (Ranked without the PvP queue) says nothing
    document.body.innerHTML = '';
    const quiet = vi.fn();
    mount(online({ extras: ['practice'], reveal: ['ranked'], onRevealed: quiet }));
    expect(quiet).not.toHaveBeenCalled();
  });

  it('openAt reopens Practice\'s map pick (Back from its champion select); any other mode is ignored', async () => {
    mount(online({ extras: ['practice'], openAt: { mode: 'skirmish', queue: 'bots' } }));
    await tick();
    await tick();
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    document.body.innerHTML = '';
    mount(online({ extras: ['practice'], modes: modeList(NOW), openAt: { mode: 'practice', queue: 'bots' } }));
    const ms = await modesOpen();
    expect(ms.dataset.stage).toBe('variant');
  });

  it('first visit: the guided match in one tap, no Mode Select, the nav shown with Heroes and Pass locked (no Cards item)', async () => {
    const onPlay = vi.fn();
    const onHeroes = vi.fn();
    const root = mount(base({ firstTime: true, onPlay, onHeroes, firstLine: 'Your first match is a guided match.' }));
    expect(root.querySelector('[data-testid="mode-pill"]')).toBeNull();
    expect(root.querySelector('.hm-line')?.textContent).toBe('Your first match is a guided match.');
    const nav = root.querySelector('.hm-nav')!;
    expect(nav.querySelectorAll('.hm-ni.locked').length).toBeGreaterThanOrEqual(2);
    // no Ranked item before Lv 10 (MODE-UNLOCKS.md): not even a locked one
    expect(nav.querySelector('[data-why*="Ranked"], [data-a="ranked"]')).toBeNull();
    expect(nav.querySelector('[data-a="cards"]')).toBeNull();
    (nav.querySelector('.hm-ni.locked') as HTMLElement).click();
    expect(onHeroes).not.toHaveBeenCalled();
    expect(root.querySelector('.hm-toast')?.textContent).toContain('first match');
    play(root);
    await tick();
    expect(onPlay).toHaveBeenCalledWith({ hero: 'clem', trick: 'pounce', difficulty: 'easy' });
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
  });

  it('a dare keeps its direct start', async () => {
    const onPlay = vi.fn();
    const root = mount(base({ onPlay, dare: { hero: 'brutus', trick: 'pounce', difficulty: 'normal', seed: 42, seconds: 300 } }));
    play(root);
    await tick();
    expect(onPlay).toHaveBeenCalledWith({ hero: 'brutus', trick: 'pounce', difficulty: 'normal' }, 42);
  });

  it('Heroes only browses (no match start)', () => {
    const onHeroes = vi.fn();
    const onPlay = vi.fn();
    const onStart = vi.fn();
    const root = mount(base({ onHeroes, onPlay, onStart }));
    root.querySelector<HTMLElement>('[data-a="heroes"]')!.click();
    expect(onHeroes).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    // without a browser the item is not shown (it never falls back to the champion select)
    document.body.innerHTML = '';
    expect(mount(base()).querySelector('[data-a="heroes"]')).toBeNull();
  });

  it('the app build never shows the Store; the web does when the store is open', () => {
    let root = mount(base({ storeOpen: true, isApp: true, onStore: vi.fn() }));
    expect(root.querySelector('[data-a="store"]')).toBeNull();
    expect(root.textContent).not.toMatch(/\$|€|price|buy/i);
    document.body.innerHTML = '';
    root = mount(base({ storeOpen: true, onStore: vi.fn() }));
    expect(root.querySelector('[data-a="store"]')).toBeTruthy();
  });

  it('no promo card on the right edge (founder Nov 19: What\'s New tells the news once)', () => {
    const root = mount(base({ storeOpen: true, onStore: vi.fn(), onCollection: vi.fn() }));
    expect(root.querySelector('.hm-promo, .hm-slide, [data-a="promo"]')).toBeNull();
    // the owning screens stay one tap away in the nav
    expect(root.querySelector('.hm-nav [data-a="store"]')).toBeTruthy();
    expect(root.querySelector('.hm-nav [data-a="collection"]')).toBeTruthy();
  });

  it('escapes host names (profile, champion, title)', () => {
    const x = '<img src=x onerror=alert(1)>';
    const root = mount(base({ profile: { name: x, tier: 2, pct: 0.5, xp: 120, matches: 3 }, identity: { ...base().identity, name: x }, title: x }));
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('.hm-pf-name')?.textContent).toBe(x);
  });

  it('keyboard: Enter plays, H opens Heroes, M does nothing; disposeHome removes the listener', async () => {
    const onStart = vi.fn();
    const onHeroes = vi.fn();
    const root = mount(base({ onStart, onHeroes }));
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'skirmish', queue: 'bots' });
    const btn = root.querySelector<HTMLElement>('[data-testid="home-play"]')!;
    btn.focus();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    await tick();
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(onHeroes).toHaveBeenCalledTimes(1);
    disposeHome(root);
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

// The Home re-render fix (Nov 12): closing a panel, switching Treat Track | Legends Pass or a data refresh redrew Home
// from scratch, which replayed every entrance animation behind the next panel. A redraw now patches the same root.
describe('home patch (no rebuild under modals)', () => {
  it('keeps the root and every unchanged region node; swaps only what changed, still', () => {
    const root = mount(base({ onCollection: vi.fn(), profile: { name: 'Guest', tier: 3, pct: 0.5, xp: 1200, matches: 4 } }));
    expect(root.classList.contains('hm-still')).toBe(false);
    const nav = root.querySelector('.hm-nav');
    const left = root.querySelector('.hm-left');
    const play = root.querySelector('.hm-play');
    // same data: nothing is touched
    expect(patchHome(root, base({ onCollection: vi.fn(), profile: { name: 'Guest', tier: 3, pct: 0.5, xp: 1200, matches: 4 } }))).toBe(true);
    expect(root.querySelector('.hm-nav')).toBe(nav);
    expect(root.querySelector('.hm-play')).toBe(play);
    expect(root.classList.contains('hm-still')).toBe(true);
    // a tier up: the top bar and the nav's tier badge change, the left stack and PLAY stay the same nodes
    const top = root.querySelector('.hm-top');
    expect(patchHome(root, base({ onCollection: vi.fn(), profile: { name: 'Guest', tier: 4, pct: 0.1, xp: 1550, matches: 4 } }))).toBe(true);
    expect(document.querySelectorAll('.pl-home')).toHaveLength(1);
    expect(root.querySelector('.hm-top')).not.toBe(top);
    expect(root.querySelector('.hm-cur')?.textContent).toContain('1,550');
    expect(root.querySelector('.hm-nav .hm-count.tier')?.textContent).toBe('4');
    expect(root.querySelector('.hm-left')).toBe(left);
    expect(root.querySelector('.hm-play')).toBe(play);
  });

  it('the Yarn balance and the account level on Home (founder Nov 17), patched live; the chip opens the unlocks', () => {
    const onYarn = vi.fn();
    const prof = (yarn: number | null) => ({ name: 'Guest', tier: 3, pct: 0.5, xp: 1200, matches: 4, level: { level: 4, pct: 0, toNext: 2 }, yarn });
    const root = mount(base({ onCollection: vi.fn(), onYarn, profile: prof(3500) }));
    const chip = root.querySelector<HTMLButtonElement>('[data-testid="home-yarn"]')!;
    expect(chip.textContent).toContain('3,500');
    expect(chip.getAttribute('aria-label')).toBe('3,500 Yarn. Unlock champions');
    expect(chip.querySelector('img')?.getAttribute('src')).toContain('assets/splash/yarn.svg');
    expect(root.querySelector('.hm-pf-sub')?.textContent).toBe('Lv 4 · Tier 3');
    chip.click();
    expect(onYarn).toHaveBeenCalledTimes(1);
    // a match paid Yarn: the store message redraws Home in place with the new balance
    expect(patchHome(root, base({ onCollection: vi.fn(), onYarn, profile: prof(3604) }))).toBe(true);
    expect(root.querySelector('[data-testid="home-yarn"]')?.textContent).toContain('3,604');
    // no server answer (a standalone page): no chip, never a made-up 0
    expect(patchHome(root, base({ onCollection: vi.fn(), onYarn, profile: prof(null) }))).toBe(true);
    expect(root.querySelector('[data-testid="home-yarn"]')).toBeNull();
    // a web guest (Nov 17 verification): the chip shows its 0 and says Yarn is earned on an account
    expect(patchHome(root, base({ onCollection: vi.fn(), onYarn, profile: { ...prof(0), yarnGuest: true } }))).toBe(true);
    const g = root.querySelector<HTMLButtonElement>('[data-testid="home-yarn"]')!;
    expect(g.textContent).toContain('0');
    expect(g.dataset.guest).toBe('1');
    expect(g.getAttribute('aria-label')).toBe('0 Yarn. Sign in to earn Yarn');
  });

  it('a patch keeps the extras in step: Practice appears when a refresh raised the level', () => {
    const root = mount(online({ extras: [] }));
    expect(root.querySelector('[data-testid="home-practice"]')).toBeNull();
    expect(patchHome(root, online({ extras: ['practice'] }))).toBe(true);
    expect(document.querySelectorAll('.pl-home')).toHaveLength(1);
    expect(root.querySelector('[data-testid="home-practice"]')).toBeTruthy();
    expect(root.dataset.variants).toBe('bots coop pvp friends');
  });

  it('follows a new name on the nameplate, and keeps an open Quests panel open', async () => {
    const quests = [{ quest: { id: 'q1', text: 'Win one', goal: 1 }, value: 0, done: false }] as unknown as HomeScreenOpts['quests'];
    const root = mount(base({ quests }));
    const panel = await openGoals(root);
    const done = [{ quest: { id: 'q1', text: 'Win one', goal: 1 }, value: 1, done: true }] as unknown as HomeScreenOpts['quests'];
    expect(patchHome(root, base({ quests: done, identity: { name: 'Pumpkin', sub: 'Sage the Marksman', element: 'FIRE', role: 'Marksman' } }))).toBe(true);
    expect(root.querySelector('.hm-plate-n')?.textContent).toContain('Pumpkin');
    const now = panelOf(root)!;
    expect(now).not.toBe(panel);
    expect(now.getAttribute('aria-modal')).toBe('true');
    expect(root.querySelector('[data-testid="home-goals"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[data-testid="home-goals"]')?.getAttribute('aria-label')).toBe('Quests: 1 of 1 done today');
    expect(now.querySelector('.hm-qlist .q.done')?.textContent).toContain('Nailed it');
    // the redraw never replays the fade-in (a replayed fade once left the panel at opacity 0)
    expect(now.classList.contains('still')).toBe(true);
    expect(panel.classList.contains('still')).toBe(false);
  });

  it('syncs the Sound switch and keeps the handlers on the new options', () => {
    const onStore = vi.fn();
    const root = mount(base({ storeOpen: true, onStore: vi.fn() }));
    expect(patchHome(root, base({ storeOpen: true, onStore, muted: true }))).toBe(true);
    expect(root.querySelector('[data-a="mute"]')?.getAttribute('aria-pressed')).toBe('false');
    root.querySelector<HTMLElement>('.hm-nav [data-a="store"]')!.click();
    expect(onStore).toHaveBeenCalledTimes(1);
  });

  it('refuses a layout change (first visit → returning, a dare) so the caller builds a still Home', () => {
    const root = mount(base({ firstTime: true }));
    expect(patchHome(root, base({ firstTime: false }))).toBe(false);
    expect(patchHome(root, base({ firstTime: true, dare: { hero: 'clem', trick: 'pounce', difficulty: 'easy', seed: 1 } as HomeScreenOpts['dare'] }))).toBe(false);
    expect(patchHome(null, base())).toBe(false);
    const still = homeScreen(document.body, { ...base(), still: true });
    expect(still.classList.contains('hm-still')).toBe(true);
  });
});

// Founder Nov 19 ("events" and "tasks" overlap too much): one Quests button opens one panel, Today then Events.
describe('Quests panel (Today and Events in one place)', () => {
  const quests = [
    { quest: { id: 'win', text: 'Win a match', goal: 1 }, value: 1, done: true },
    { quest: { id: 'play2', text: 'Play 2 matches', goal: 2 }, value: 1, done: false },
    { quest: { id: 'combo3', text: 'Land 3 combos', goal: 3 }, value: 0, done: false },
    { quest: { id: 'party', text: 'Play 2 matches with a friend', goal: 2, bonus: true }, value: 0, done: false },
  ] as unknown as HomeScreenOpts['quests'];

  it('replaces the Events and Today buttons with one Quests button beside # Join; no season row, no mode row', () => {
    const root = mount(base({ quests, seasonEnd: 'Ends 5 Jan 2027', onJoinCode: vi.fn(), onCollection: vi.fn() }));
    const left = root.querySelector('.hm-left')!;
    expect(left.querySelectorAll('.hm-round')).toHaveLength(2);
    expect(left.querySelector('details')).toBeNull();
    expect(root.querySelector('.hm-events, .hm-today, .hm-evlist')).toBeNull();
    const btn = left.querySelector<HTMLElement>('[data-testid="home-goals"]')!;
    expect(btn.textContent).toContain('Quests');
    expect(btn.getAttribute('aria-label')).toBe('Quests: 1 of 3 done today');
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(goalsPanelHtml({ quests })).not.toContain('Legends Pass season');
    expect(goalsPanelHtml({ quests })).not.toContain('data-mode');
    // the season end moved to the nav Pass item
    const pass = root.querySelector('.hm-nav [data-a="collection"]')!;
    expect(pass.getAttribute('aria-label')).toBe('Pass · season ends 5 Jan 2027');
    expect(pass.getAttribute('title')).toBe('Pass · season ends 5 Jan 2027');
  });

  it('opens Today (progress and Treat XP per quest) and the live events; closes on Esc, the close button and a tap outside', async () => {
    const root = mount(base({ quests }));
    const btn = root.querySelector<HTMLElement>('[data-testid="home-goals"]')!;
    expect(panelOf(root)).toBeNull();
    let panel = await openGoals(root);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(root.classList.contains('hm-gp-on')).toBe(true);
    const rows = panel.querySelectorAll('[data-testid="goals-today"] .q');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toContain('Nailed it');
    expect(rows[1]!.textContent).toContain('1/2');
    expect(rows[1]!.textContent).toContain('+50 XP');
    expect(rows[1]!.getAttribute('aria-label')).toBe('Play 2 matches: 1 of 2. 50 Season XP, added when the match ends');
    expect(rows[3]!.classList.contains('bonus')).toBe(true);
    expect(panel.querySelector('[data-testid="goals-today"] h3')?.textContent).toMatch(/^Today1\/3New in \d+[hm]$/);
    // the Events section holds the live-ops cards
    expect(panel.querySelector('[data-testid="goals-events"] [data-testid="lo-cards"]')).toBeTruthy();
    // Esc closes it (the app's Android back is an Escape) and focus returns to the button
    esc();
    expect(panelOf(root)).toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(root.classList.contains('hm-gp-on')).toBe(false);
    expect(document.activeElement).toBe(btn);
    panel = await openGoals(root);
    panel.querySelector<HTMLElement>('.hm-gp-x')!.click();
    expect(panelOf(root)).toBeNull();
    panel = await openGoals(root);
    // a tap inside keeps it open, a tap outside closes it
    panel.querySelector('.q')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panelOf(root)).toBe(panel);
    root.querySelector('.hm-stage')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panelOf(root)).toBeNull();
    // a tap on the 3D scene (a canvas outside Home's pointer-events:none root) closes it too
    panel = await openGoals(root);
    const scene = document.body.appendChild(document.createElement('canvas'));
    scene.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    scene.remove();
    expect(panelOf(root)).toBeNull();
    // the button toggles
    await openGoals(root);
    btn.click();
    expect(panelOf(root)).toBeNull();
  });

  it('Enter does not start a match while the panel is open', async () => {
    const onStart = vi.fn();
    const root = mount(base({ quests, onStart }));
    await openGoals(root);
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('no Quests button on the first visit or a dare (PLAY is the one job), nor without quests', () => {
    expect(mount(base({ firstTime: true, quests })).querySelector('[data-testid="home-goals"]')).toBeNull();
    document.body.innerHTML = '';
    expect(mount(base({ quests: [] })).querySelector('[data-testid="home-goals"]')).toBeNull();
  });

  it('all done: the ring turns green and the label says so', () => {
    const all = (quests ?? []).map((q) => ({ ...q, value: q.quest.goal, done: !q.quest.bonus || q.done }));
    const root = mount(base({ quests: all }));
    expect(root.querySelector('[data-testid="home-goals"] .hm-qring.all')).toBeTruthy();
    expect(root.querySelector('[data-testid="home-goals"]')?.getAttribute('aria-label')).toBe('Quests: 3 of 3 done today');
  });

  it('questsResetText counts to the next local midnight', () => {
    expect(questsResetText(new Date(2026, 10, 19, 17, 0, 0))).toBe('7h');
    expect(questsResetText(new Date(2026, 10, 19, 23, 15, 0))).toBe('45m');
  });
});

describe('Home Boards (founder Nov 19: under # Join, the leaderboards window)', () => {
  it('sits in the left stack right under Join and opens the Boards in one tap; no Leaderboard pill on the right', () => {
    const onBoards = vi.fn();
    const root = mount(base({ onBoards, onJoinCode: vi.fn() }));
    const btn = root.querySelector<HTMLElement>('[data-testid="home-boards"]')!;
    expect(btn.textContent).toBe('Boards');
    expect(btn.getAttribute('aria-label')).toBe('Leaderboards');
    expect(btn.parentElement!.classList.contains('hm-left')).toBe(true);
    expect(btn.previousElementSibling?.getAttribute('data-testid')).toBe('join-code');
    expect(root.querySelector('[data-testid="home-leaderboard"], .hm-lb')).toBeNull();
    btn.click();
    expect(onBoards).toHaveBeenCalledTimes(1);
  });

  it('a brand-new guest sees it too, under Join (Nov 20: a fresh guest had no Boards); hidden only where the host has no social (no onBoards)', () => {
    const onBoards = vi.fn();
    const first = mount(base({ firstTime: true, onBoards, onJoinCode: vi.fn() }));
    const btn = first.querySelector<HTMLElement>('[data-testid="home-boards"]')!;
    expect(btn).not.toBeNull();
    expect(btn.previousElementSibling?.getAttribute('data-testid')).toBe('join-code');
    btn.click();
    expect(onBoards).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    expect(mount(base()).querySelector('[data-testid="home-boards"]')).toBeNull();
  });

  it('a patched Home keeps one Boards button', () => {
    const onBoards = vi.fn();
    const root = mount(base({ onBoards }));
    expect(patchHome(root, base({ onBoards, muted: true }))).toBe(true);
    expect(root.querySelectorAll('[data-testid="home-boards"]')).toHaveLength(1);
  });
});

describe('Home avatar = my avatar (founder Nov 19: "they must be in sync")', () => {
  it('draws my avatar view (the icon Profile and the friends list draw) and its border, not the Home hero', () => {
    const f = homeFace({ avatar: { i: 'h:nova', f: 'frame.store.goldpaw' }, signedIn: true, portrait: 'https://x.test/sage.webp' });
    expect(f.pic).toContain('nova');
    expect(f.ring).toBe('#f5c542');
    const root = mount(base({ avatar: { i: 'h:nova' }, signedIn: true }));
    expect(root.querySelector('[data-testid="home-avatar"]')!.getAttribute('data-av')).toBe('h:nova');
  });

  it('an earned icon shows its medallion; a guest the paw (as Profile); signed in before the server answers, the hero', () => {
    expect(homeFace({ avatar: { i: 'i:icon.s1.paw' }, signedIn: true, portrait: null })).toMatchObject({ pic: null, letter: '★', guest: false });
    expect(homeFace({ avatar: null, signedIn: false, portrait: 'https://x.test/sage.webp' })).toMatchObject({ pic: null, guest: true });
    expect(homeFace({ avatar: null, signedIn: true, portrait: 'https://x.test/sage.webp' }).pic).toBe('https://x.test/sage.webp');
    const root = mount(base({ avatar: null, signedIn: false }));
    expect(root.querySelector('[data-testid="home-avatar"]')!.getAttribute('data-av')).toBe('guest');
  });

  it('a new avatar patches into the same Home', () => {
    const root = mount(base({ avatar: { i: 'h:nova' }, signedIn: true }));
    expect(patchHome(root, base({ avatar: { i: 'h:clem' }, signedIn: true }))).toBe(true);
    expect(root.querySelector('[data-testid="home-avatar"]')!.getAttribute('data-av')).toBe('h:clem');
  });
});
