// @vitest-environment happy-dom
/**
 * Home (docs/plans/moba/HOME-MODES.md §4) and Mode Select (§5): PLAY plays the selected mode in one tap (bots with
 * the right map, co-op and PvP through the online flow, the PvP lock explained), the mode pill opens Mode Select and
 * Confirm updates the pill, locked tiles never select, the first visit keeps the guided match with the nav items that
 * need a match locked, the app build never shows the Store, and host names are escaped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availableQueues, botsChoice, disposeHome, homeScreen, pvpLockText, resolveChoice, ringPct, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { modeById, modeList } from '../../src/ui/modeSelect/modes';

const NOW = Date.now();
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
  profile: { name: 'Guest', tier: null, pct: 0, xp: null, matches: 4 },
  modes: modeList(NOW),
  modeChoice: { mode: 'skirmish', queue: 'bots' },
  onModeChoice: vi.fn(),
  base: './',
  ...o,
});
const mount = (o: HomeScreenOpts): HTMLElement => homeScreen(document.body, o);
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Mode Select is a lazy chunk: wait for it after the pill. */
const modesOpen = async (): Promise<HTMLElement> => {
  await vi.waitFor(() => expect(document.querySelector('[data-testid="mode-select"]')).toBeTruthy());
  return document.querySelector<HTMLElement>('[data-testid="mode-select"]')!;
};

afterEach(() => {
  for (const el of document.querySelectorAll<HTMLElement>('.pl-home')) disposeHome(el);
  document.body.innerHTML = '';
});

describe('home state logic', () => {
  it('offers bots always, co-op with a relay, PvP only with the PvP sim', () => {
    expect(availableQueues({})).toEqual(['bots']);
    expect(availableQueues({ onOnline: () => undefined })).toEqual(['bots', 'coop']);
    expect(availableQueues({ onOnline: () => undefined, onlineMode: { mode: 'coop', locked: false, onMode: () => undefined } })).toEqual(['bots', 'coop', 'pvp']);
  });

  it('locks 3v3 PvP by match count, never 5v5 Classic', () => {
    const o = { onlineMode: { mode: 'coop' as const, locked: true, needed: 5, onMode: () => undefined } };
    expect(pvpLockText(o, { id: 'skirmish' })).toBe('PvP unlocks after 5 matches');
    expect(pvpLockText(o, { id: 'classic' })).toBeNull();
    expect(pvpLockText({}, { id: 'skirmish' })).toBeNull();
  });

  it('resolves the choice PLAY runs: a queue this build offers, Skirmish when the mode cannot be played', () => {
    const modes = modeList(NOW);
    expect(resolveChoice(modes, { mode: 'classic', queue: 'pvp' }, ['bots'], NOW)).toMatchObject({ mode: { id: 'classic' }, queue: 'bots' });
    expect(resolveChoice(modes, { mode: 'ranked', queue: 'pvp' }, ['bots', 'pvp'], NOW)).toMatchObject({ mode: { id: 'skirmish' }, queue: 'pvp' });
    // Co-op vs Bots without a relay: still something to play (bots)
    expect(resolveChoice(modes, { mode: 'coop', queue: 'coop' }, ['bots'], NOW).queue).toBe('bots');
  });

  it('a bots match carries the map only off the default 3v3 map', () => {
    const last = { hero: 'sage' as const, trick: 'pounce' as const, difficulty: 'easy' as const, map: 'hearthwood' as const };
    expect(botsChoice(last, 'hard', modeById('skirmish')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'hard' });
    expect(botsChoice(last, 'normal', modeById('classic')!)).toEqual({ hero: 'sage', trick: 'pounce', difficulty: 'normal', map: 'hearthwood' });
  });

  it('the profile ring shows Season XP progress only when a season is known', () => {
    expect(ringPct({ name: 'a', tier: null, pct: 0.5, xp: null, matches: 0 })).toBe(0);
    expect(ringPct({ name: 'a', tier: 3, pct: 0.456, xp: 900, matches: 0 })).toBe(46);
    expect(ringPct({ name: 'a', tier: 3, pct: 7, xp: 900, matches: 0 })).toBe(100);
  });
});

describe('home screen', () => {
  it('one round PLAY that plays the selected mode in one tap (bots, 3v3 default map)', async () => {
    const onPlay = vi.fn();
    const root = mount(base({ onPlay }));
    expect(root.querySelectorAll('.pl-btn.big')).toHaveLength(1);
    const play = root.querySelector<HTMLElement>('.pl-btn.big')!;
    expect(play.getAttribute('aria-label')).toBe('Play as Sage');
    expect(root.querySelector('[data-testid="mode-pill"]')?.textContent).toContain('Skirmish 3v3 · vs Bots');
    play.click();
    await tick();
    expect(onPlay).toHaveBeenCalledWith({ hero: 'sage', trick: 'pounce', difficulty: 'easy' });
  });

  it('Classic plays Hearthwood; co-op and PvP go through the online flow; locked PvP explains itself', async () => {
    const onPlay = vi.fn();
    const onOnline = vi.fn();
    const onMode = vi.fn();
    const om = { mode: 'coop' as const, locked: true, needed: 5, played: 2, onMode };
    let root = mount(base({ onPlay, modeChoice: { mode: 'classic', queue: 'bots' } }));
    root.querySelector<HTMLElement>('.pl-btn.big')!.click();
    await tick();
    expect(onPlay.mock.calls[0][0]).toMatchObject({ map: 'hearthwood' });
    document.body.innerHTML = '';
    root = mount(base({ onOnline, onlineMode: { ...om }, modeChoice: { mode: 'classic', queue: 'pvp' } }));
    root.querySelector<HTMLElement>('.pl-btn.big')!.click();
    expect(onMode).toHaveBeenCalledWith('pvp');
    expect(onOnline).toHaveBeenCalledTimes(1);
    document.body.innerHTML = '';
    root = mount(base({ onOnline, onlineMode: { ...om }, modeChoice: { mode: 'skirmish', queue: 'pvp' } }));
    root.querySelector<HTMLElement>('.pl-btn.big')!.click();
    expect(onOnline).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.hm-toast')?.textContent).toContain('PvP unlocks after 5 matches');
    // the one-tap Co-op quick button stays
    root.querySelector<HTMLElement>('[data-testid="play-online"]')!.click();
    expect(onOnline).toHaveBeenCalledTimes(2);
  });

  it('the mode pill opens Mode Select; locked tiles never select; Confirm saves and updates the pill', async () => {
    const onModeChoice = vi.fn();
    const root = mount(base({ onModeChoice, onOnline: vi.fn() }));
    root.querySelector<HTMLElement>('[data-testid="mode-pill"]')!.click();
    const ms = await modesOpen();
    expect(ms.getAttribute('aria-modal')).toBe('true');
    expect(ms.querySelectorAll('.ms-pick')).toHaveLength(6);
    // Ranked is locked: a tap explains and keeps Skirmish
    ms.querySelector<HTMLElement>('[data-testid="mode-ranked"]')!.click();
    expect(ms.querySelector('.ms-pick.on')?.getAttribute('data-mode')).toBe('skirmish');
    expect(ms.querySelector('.ms-toast')?.textContent).toContain('Ranked');
    // Classic, then the Co-op queue (offered by Classic and this build), then Confirm
    ms.querySelector<HTMLElement>('[data-testid="mode-classic"]')!.click();
    expect(ms.querySelector('.ms-pick.on')?.getAttribute('data-mode')).toBe('classic');
    expect(ms.querySelector('[data-testid="queue-pvp"]')).toBeNull();
    ms.querySelector<HTMLElement>('[data-testid="queue-coop"]')!.click();
    ms.querySelector<HTMLElement>('[data-testid="mode-confirm"]')!.click();
    expect(onModeChoice).toHaveBeenCalledWith({ mode: 'classic', queue: 'coop' });
    expect(root.querySelector('[data-testid="mode-pill"]')?.textContent).toContain('Classic 5v5 · Co-op');
  });

  it('the bots difficulty lives in Mode Select', async () => {
    const onDifficulty = vi.fn();
    const root = mount(base({ onDifficulty }));
    root.querySelector<HTMLElement>('[data-testid="mode-pill"]')!.click();
    await modesOpen();
    const seg = document.querySelectorAll<HTMLElement>('.ms-seg [data-d]');
    expect(seg).toHaveLength(3);
    seg[2].click();
    expect(onDifficulty).toHaveBeenCalledWith('hard');
  });

  it('the info button opens the rules; Escape closes it, then the overlay', async () => {
    const root = mount(base());
    root.querySelector<HTMLElement>('[data-testid="mode-pill"]')!.click();
    await modesOpen();
    document.querySelector<HTMLElement>('[data-info="classic"]')!.click();
    const pop = document.querySelector<HTMLElement>('.ms-pop')!;
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('Hearthwood Divide');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(pop.hidden).toBe(true);
    expect(document.querySelector('[data-testid="mode-select"]')).toBeTruthy();
  });

  it('first visit: the guided match, no mode pill, the nav shown with Heroes, Cards and Pass locked', async () => {
    const onPlay = vi.fn();
    const onChoose = vi.fn();
    const root = mount(base({ firstTime: true, onPlay, onChoose, onCards: vi.fn(), firstLine: 'Your first match is a guided Rookie match.' }));
    expect(root.querySelector('[data-testid="mode-pill"]')).toBeNull();
    expect(root.querySelector('.hm-line')?.textContent).toBe('Your first match is a guided Rookie match.');
    const nav = root.querySelector('.hm-nav')!;
    expect(nav.querySelectorAll('.hm-ni.locked').length).toBeGreaterThanOrEqual(3);
    (nav.querySelector('.hm-ni.locked') as HTMLElement).click();
    expect(onChoose).not.toHaveBeenCalled();
    expect(root.querySelector('.hm-toast')?.textContent).toContain('first match');
    root.querySelector<HTMLElement>('.pl-btn.big')!.click();
    await tick();
    expect(onPlay).toHaveBeenCalledWith({ hero: 'clem', trick: 'pounce', difficulty: 'easy' });
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

  it('keyboard: Enter plays, H opens the champion select, M opens Mode Select; disposeHome removes the listener', async () => {
    const onPlay = vi.fn();
    const onChoose = vi.fn();
    const root = mount(base({ onPlay, onChoose }));
    root.querySelector<HTMLElement>('[data-testid="home-profile"]')?.focus();
    const pill = root.querySelector<HTMLElement>('[data-testid="mode-pill"]')!;
    pill.focus();
    pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
    await modesOpen();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
    pill.focus();
    pill.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', bubbles: true }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    disposeHome(root);
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await tick();
    expect(onPlay).not.toHaveBeenCalled();
  });
});
