// @vitest-environment happy-dom
/**
 * Home (docs/plans/moba/HOME-MODES.md §4) and the one play path (§5, Nov 12): PLAY opens Mode Select (a returning
 * player), a mode then a variant (vs Bots with its difficulty, Co-op, PvP, With Friends) goes on to `onStart`; the
 * variants show only what the mode supports and lock what this build cannot start; Back and Esc step back one stage.
 * Home has no other match start (no quick Co-op or PvP, no nameplate or Heroes lock-in, no Friends nav, no Games
 * button); the first visit keeps the guided one-tap match; the app build never shows the Store; names are escaped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableQueues, botsChoice, disposeHome, homeScreen, patchHome, pvpLockText, resolveChoice, ringPct, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { modeById, modeList } from '../../src/ui/modeSelect/modes';

const NOW = Date.now();
const om = (o: { locked?: boolean } = {}) => ({ mode: 'coop' as const, locked: o.locked ?? false, needed: 5, played: 2, onMode: vi.fn() });
const base = (o: Partial<HomeScreenOpts> = {}): HomeScreenOpts => ({
  firstTime: false,
  last: { hero: 'sage', trick: 'pounce', difficulty: 'easy' },
  dare: null,
  muted: false,
  identity: { name: 'Sage', sub: 'Sage the Marksman', element: 'WIND', role: 'Marksman', card: false, rung: null },
  signedIn: false,
  difficulties: ['easy', 'normal', 'hard'],
  cardCount: 0,
  peek: [],
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
    expect(resolveChoice(modes, { mode: 'ranked', queue: 'pvp' }, ['bots', 'pvp'], NOW)).toMatchObject({ mode: { id: 'skirmish' }, queue: 'pvp' });
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

describe('home screen: one play path', () => {
  it('one round PLAY, and no other match start on Home', () => {
    const root = mount(online({ onCards: vi.fn(), onCollection: vi.fn(), onJoinCode: vi.fn(), onHeroes: vi.fn(), onExit: vi.fn() }));
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
    expect(root.querySelector('[data-testid="home-play"]')?.getAttribute('aria-label')).toBe('Play: choose a mode');
    // gone: the quick Co-op and PvP buttons, the Friends nav, the nameplate lock-in, the Games button
    for (const sel of ['[data-testid="play-online"]', '[data-testid="play-pvp"]', '[data-testid="play-friends"]', '[data-a="online"]', '[data-a="party"]', '[data-a="name"]', '[data-a="choose"]', '[data-testid="lobby-exit"]', '.hm-quick'])
      expect(root.querySelector(sel), sel).toBeNull();
    expect(root.querySelector('.hm-plate')?.tagName).toBe('DIV');
    // the mode pill is a label of the last choice, not a button
    const pill = root.querySelector('[data-testid="mode-pill"]')!;
    expect(pill.tagName).toBe('P');
    expect(pill.textContent).toContain('Skirmish 3v3 · vs Bots');
    // # Code stays (it joins a party lobby, not a match)
    expect(root.querySelector('[data-testid="join-code"]')).toBeTruthy();
  });

  it('PLAY → Skirmish → vs Bots Hard → Choose champion starts the champion select', async () => {
    const onStart = vi.fn();
    const onDifficulty = vi.fn();
    const onModeChoice = vi.fn();
    const onPlay = vi.fn();
    const root = mount(online({ onStart, onDifficulty, onModeChoice, onPlay }));
    play(root);
    const ms = await modesOpen();
    expect(ms.getAttribute('aria-modal')).toBe('true');
    // five tiles: the separate "Co-op vs Bots" tile is gone (co-op is Skirmish's variant)
    expect(Array.from(ms.querySelectorAll<HTMLElement>('.ms-pick')).map((b) => b.dataset.mode)).toEqual(['blitz', 'skirmish', 'classic', 'ranked', 'cannon']);
    expect(ms.querySelector('.ms-pick.on')?.getAttribute('data-mode')).toBe('skirmish');
    click(ms, 'mode-next');
    expect(ms.dataset.stage).toBe('variant');
    expect(Array.from(ms.querySelectorAll<HTMLElement>('.ms-var')).map((b) => b.dataset.v)).toEqual(['bots', 'coop', 'pvp', 'friends']);
    expect(ms.querySelector('.ms-title')?.textContent).toBe('Skirmish 3v3');
    // the bots difficulty lives on the vs Bots variant
    click(ms, 'bots-hard');
    expect(onDifficulty).toHaveBeenCalledWith('hard');
    expect(ms.querySelector('[data-testid="mode-go"]')?.textContent).toContain('Choose champion');
    click(ms, 'mode-go');
    expect(onModeChoice).toHaveBeenCalledWith({ mode: 'skirmish', queue: 'bots' });
    expect(onStart).toHaveBeenCalledWith({ mode: 'skirmish', queue: 'bots' });
    expect(onPlay).not.toHaveBeenCalled();
    await tick();
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
  });

  it('Co-op and PvP go to the queue, With Friends to the party; the action names it', async () => {
    for (const [v, word] of [
      ['coop', 'Find match'],
      ['pvp', 'Find match'],
      ['friends', 'Open party'],
    ] as const) {
      const onStart = vi.fn();
      const root = mount(online({ onStart }));
      play(root);
      const ms = await modesOpen();
      click(ms, 'mode-next');
      click(ms, `variant-${v}`);
      expect(ms.querySelector(`[data-testid="variant-${v}"]`)?.getAttribute('aria-checked')).toBe('true');
      expect(ms.querySelector('[data-testid="mode-go"]')?.textContent).toContain(word);
      // the bots row shows only on vs Bots
      expect(ms.querySelector('.ms-seg')).toBeNull();
      click(ms, 'mode-go');
      expect(onStart).toHaveBeenCalledWith({ mode: 'skirmish', queue: v });
      disposeHome(root);
      document.body.innerHTML = '';
    }
  });

  it('Classic shows only its own variants (vs Bots, PvP); Blitz only vs Bots', async () => {
    const onStart = vi.fn();
    const root = mount(online({ onStart }));
    play(root);
    const ms = await modesOpen();
    click(ms, 'mode-classic');
    expect(ms.querySelector('.ms-sum')?.textContent).toContain('Classic 5v5');
    click(ms, 'mode-next');
    expect(Array.from(ms.querySelectorAll<HTMLElement>('.ms-var')).map((b) => b.dataset.v)).toEqual(['bots', 'pvp']);
    click(ms, 'variant-bots');
    click(ms, 'mode-go');
    expect(onStart).toHaveBeenCalledWith({ mode: 'classic', queue: 'bots' });
    disposeHome(root);
    document.body.innerHTML = '';
    const r2 = mount(online());
    play(r2);
    const ms2 = await modesOpen();
    click(ms2, 'mode-blitz');
    click(ms2, 'mode-next');
    expect(Array.from(ms2.querySelectorAll<HTMLElement>('.ms-var')).map((b) => b.dataset.v)).toEqual(['bots']);
  });

  it('a variant this build cannot start is locked and says why; the 3v3 PvP lock is explained', async () => {
    const onStart = vi.fn();
    // no relay, no party server: only vs Bots can start
    let root = mount(base({ onStart }));
    play(root);
    let ms = await modesOpen();
    click(ms, 'mode-next');
    const coop = ms.querySelector<HTMLElement>('[data-testid="variant-coop"]')!;
    expect(coop.getAttribute('aria-disabled')).toBe('true');
    expect(coop.textContent).toContain('party server');
    coop.click();
    expect(ms.querySelector('[data-testid="variant-bots"]')?.getAttribute('aria-checked')).toBe('true');
    expect(ms.querySelector('.ms-toast')?.textContent).toContain('party server');
    expect(ms.querySelector('[data-testid="variant-pvp"]')?.textContent).toContain('PvP is offline');
    disposeHome(root);
    document.body.innerHTML = '';
    root = mount(online({ onStart, onlineMode: om({ locked: true }) }));
    play(root);
    ms = await modesOpen();
    click(ms, 'mode-next');
    click(ms, 'variant-pvp');
    expect(ms.querySelector('.ms-toast')?.textContent).toContain('PvP unlocks after 5 matches');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('locked tiles never select; Back and Esc step back one stage, then close', async () => {
    const onStart = vi.fn();
    const root = mount(online({ onStart }));
    play(root);
    const ms = await modesOpen();
    ms.querySelector<HTMLElement>('[data-testid="mode-ranked"]')!.click();
    expect(ms.querySelector('.ms-pick.on')?.getAttribute('data-mode')).toBe('skirmish');
    expect(ms.querySelector('.ms-toast')?.textContent).toContain('Ranked');
    click(ms, 'mode-next');
    expect(ms.dataset.stage).toBe('variant');
    click(ms, 'mode-back');
    expect(ms.dataset.stage).toBe('mode');
    click(ms, 'mode-next');
    esc();
    expect(ms.dataset.stage).toBe('mode');
    esc();
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Enter on a tile goes to the variants, Enter on a variant goes on', async () => {
    const onStart = vi.fn();
    const root = mount(online({ onStart }));
    play(root);
    const ms = await modesOpen();
    const tile = ms.querySelector<HTMLElement>('[data-testid="mode-classic"]')!;
    tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ms.dataset.stage).toBe('variant');
    ms.querySelector<HTMLElement>('[data-testid="variant-pvp"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).toHaveBeenCalledWith({ mode: 'classic', queue: 'pvp' });
  });

  it('openAt reopens Mode Select on the variant (Back from the champion select)', async () => {
    mount(online({ openAt: { mode: 'classic', queue: 'bots' } }));
    const ms = await modesOpen();
    expect(ms.dataset.stage).toBe('variant');
    expect(ms.querySelector('.ms-title')?.textContent).toBe('Classic 5v5');
    expect(ms.querySelector('[data-testid="variant-bots"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('the info button opens the rules; Escape closes it first', async () => {
    const root = mount(base());
    play(root);
    await modesOpen();
    document.querySelector<HTMLElement>('[data-info="classic"]')!.click();
    const pop = document.querySelector<HTMLElement>('.ms-pop')!;
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('Hearthwood Divide');
    esc();
    expect(pop.hidden).toBe(true);
    expect(document.querySelector('[data-testid="mode-select"]')).toBeTruthy();
  });

  it('first visit: the guided match in one tap, no Mode Select, the nav shown with Heroes, Cards and Pass locked', async () => {
    const onPlay = vi.fn();
    const onHeroes = vi.fn();
    const root = mount(base({ firstTime: true, onPlay, onHeroes, onCards: vi.fn(), firstLine: 'Your first match is a guided Rookie match.' }));
    expect(root.querySelector('[data-testid="mode-pill"]')).toBeNull();
    expect(root.querySelector('.hm-line')?.textContent).toBe('Your first match is a guided Rookie match.');
    const nav = root.querySelector('.hm-nav')!;
    expect(nav.querySelectorAll('.hm-ni.locked').length).toBeGreaterThanOrEqual(3);
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

  it('the app build never shows the Store or a store promo; the web does when the store is open', () => {
    const promos = [{ id: 's', title: 'Store', sub: 'New coats', action: 'store' as const }, { id: 'p', title: 'Pass', sub: 'Season', action: 'pass' as const }];
    let root = mount(base({ storeOpen: true, isApp: true, promos, onStore: vi.fn() }));
    expect(root.querySelector('[data-a="store"]')).toBeNull();
    expect(root.querySelector('[data-act="store"]')).toBeNull();
    expect(root.textContent).not.toMatch(/\$|€|price|buy/i);
    document.body.innerHTML = '';
    root = mount(base({ storeOpen: true, promos, onStore: vi.fn() }));
    expect(root.querySelector('[data-a="store"]')).toBeTruthy();
    expect(root.querySelector('[data-act="store"]')).toBeTruthy();
  });

  it('escapes host names (profile, champion, title)', () => {
    const x = '<img src=x onerror=alert(1)>';
    const root = mount(base({ profile: { name: x, tier: 2, pct: 0.5, xp: 120, matches: 3 }, identity: { ...base().identity, name: x }, title: x }));
    expect(root.querySelector('img[src="x"]')).toBeNull();
    expect(root.querySelector('.hm-pf-name')?.textContent).toBe(x);
  });

  it('keyboard: Enter opens Mode Select, M too, H opens Heroes; disposeHome removes the listener', async () => {
    const onPlay = vi.fn();
    const onHeroes = vi.fn();
    const root = mount(base({ onPlay, onHeroes }));
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await modesOpen();
    esc();
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    const prof = root.querySelector<HTMLElement>('[data-testid="home-play"]')!;
    prof.focus();
    prof.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    await modesOpen();
    esc();
    await new Promise((r) => setTimeout(r, 250));
    prof.focus();
    prof.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(onHeroes).toHaveBeenCalledTimes(1);
    disposeHome(root);
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    expect(onPlay).not.toHaveBeenCalled();
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

  it('a patch with openAt opens Mode Select on that variant (Social "Play casual" over a Home still on screen)', async () => {
    const root = mount(online());
    expect(patchHome(root, online({ openAt: { mode: 'skirmish', queue: 'pvp' } }))).toBe(true);
    expect(document.querySelectorAll('.pl-home')).toHaveLength(1);
    const ms = await modesOpen();
    expect(ms.dataset.stage).toBe('variant');
    expect(ms.querySelector('[data-testid="variant-pvp"]')?.getAttribute('aria-checked')).toBe('true');
    expect(root.dataset.variants).toBe('bots coop pvp friends');
  });

  it('follows a new worn card on the nameplate, and keeps an open popover open', () => {
    const quests = [{ quest: { id: 'q1', text: 'Win one', goal: 1 }, value: 0, done: false }] as unknown as HomeScreenOpts['quests'];
    const root = mount(base({ quests }));
    const today = root.querySelector<HTMLDetailsElement>('.hm-today')!;
    today.open = true;
    const done = [{ quest: { id: 'q1', text: 'Win one', goal: 1 }, value: 1, done: true }] as unknown as HomeScreenOpts['quests'];
    expect(patchHome(root, base({ quests: done, identity: { name: 'Pumpkin', sub: 'Sage the Marksman', element: 'FIRE', role: 'Marksman', card: true, rung: null } }))).toBe(true);
    expect(root.querySelector('.hm-plate-n')?.textContent).toContain('Pumpkin');
    expect(root.querySelector('.hm-today')).not.toBe(today);
    expect(root.querySelector<HTMLDetailsElement>('.hm-today')!.open).toBe(true);
    expect(root.querySelector('.hm-today .hm-rl')?.textContent).toBe('1/1');
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
