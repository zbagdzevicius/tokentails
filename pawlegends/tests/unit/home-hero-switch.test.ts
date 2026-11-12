// @vitest-environment happy-dom
/**
 * Home hero switch (Nov 12, the founder: "maybe it would be enough to add SELECT / BUY as a button in here"): the
 * champion browser's `action` puts one button under the description, above the count. SELECT makes a playable hero
 * the Home hero and keeps the browser open (the button turns SELECTED, not pressable); BUY (web) and UNLOCK (app, no
 * price) close the browser and hand the hero to the store's champion detail. Home's nameplate opens the browser and
 * never starts a match or the champion select.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HeroId } from '../../src/data/heroes/types';
import { HERO_TEXT } from '../../src/ui/heroText';
import { openChampBrowser, openBrowser, type HeroAction, type HeroActionState } from '../../src/ui/champBrowser/champBrowser';
import { disposeHome, homeScreen, patchHome, type HomeScreenOpts } from '../../src/ui/home/homeScreen';
import { modeList } from '../../src/ui/modeSelect/modes';

afterEach(() => {
  openBrowser()?.close();
  for (const el of document.querySelectorAll<HTMLElement>('.pl-home')) disposeHome(el);
  document.body.innerHTML = '';
});

/** A stand-in for the app's rule: `owned` heroes are playable, `home` is the Home hero, the rest buy (or unlock). */
function fakeAction(o: { home: HeroId; owned: HeroId[]; app?: boolean; hidden?: HeroId[] }): HeroAction & { home: HeroId; calls: string[] } {
  const a = {
    home: o.home,
    calls: [] as string[],
    state(h: HeroId): HeroActionState {
      if (o.owned.includes(h)) return h === a.home ? 'selected' : 'select';
      if (o.hidden?.includes(h)) return 'none';
      return o.app ? 'unlock' : 'buy';
    },
    on(h: HeroId, kind: 'select' | 'buy' | 'unlock') {
      a.calls.push(`${kind} ${h}`);
      if (kind === 'select') a.home = h;
    },
  };
  return a;
}
const open = (hero: HeroId, action: HeroAction) => openChampBrowser({ hero, clips: null, portrait: () => null, action });
const btn = (): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>('.pl-champ [data-testid="hero-action"]');

describe('champion browser: SELECT / BUY / UNLOCK', () => {
  it('sits under the description, above the count', () => {
    open('sage', fakeAction({ home: 'clem', owned: ['clem', 'sage'] }));
    const hero = document.querySelector('.cb-hero')!;
    const kids = [...hero.children].map((c) => c.className);
    expect(kids.indexOf('cb-act')).toBeGreaterThan(kids.indexOf('cb-id'));
    expect(kids.indexOf('cb-act')).toBe(kids.indexOf('cb-count') - 1);
  });

  it('SELECT an owned hero: it becomes the Home hero, the browser stays and the button turns SELECTED', () => {
    const a = fakeAction({ home: 'clem', owned: ['clem', 'sage'] });
    const b = open('sage', a);
    expect(btn()!.textContent).toBe('SELECT');
    expect(btn()!.getAttribute('aria-label')).toBe(`Select ${HERO_TEXT.sage.title} as your hero`);
    btn()!.click();
    expect(a.calls).toEqual(['select sage']);
    expect(b.open).toBe(true);
    expect(btn()!.textContent).toBe('SELECTED');
    expect(btn()!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(btn());
    // pressing SELECTED again does nothing
    btn()!.click();
    expect(a.calls).toEqual(['select sage']);
  });

  it('the Home hero opens as SELECTED; the arrows walk on to SELECT and BUY', () => {
    const a = fakeAction({ home: 'clem', owned: ['clem'] });
    const b = open('clem', a);
    expect(btn()!.textContent).toBe('SELECTED');
    b.show('sage');
    expect(btn()!.textContent).toBe('BUY');
  });

  it('Enter on the focused button presses it (a native button)', () => {
    const a = fakeAction({ home: 'clem', owned: ['clem', 'sage'] });
    open('sage', a);
    const b = btn()!;
    expect(b.tagName).toBe('BUTTON');
    expect(b.type).toBe('button');
  });

  it('BUY (web): the browser closes, then the hero goes to the store detail', () => {
    const a = fakeAction({ home: 'clem', owned: ['clem'] });
    let openWhenCalled: boolean | null = null;
    const b = openChampBrowser({
      hero: 'rocket',
      clips: null,
      portrait: () => null,
      action: {
        state: (h) => a.state(h),
        on: (h, k) => {
          openWhenCalled = !!openBrowser();
          a.on(h, k);
        },
      },
    });
    expect(btn()!.textContent).toBe('BUY');
    btn()!.click();
    expect(a.calls).toEqual(['buy rocket']);
    expect(openWhenCalled).toBe(false);
    expect(b.open).toBe(false);
  });

  it('UNLOCK (app): no price and no buy word anywhere on the page', () => {
    const a = fakeAction({ home: 'clem', owned: ['clem'], app: true });
    open('rocket', a);
    expect(btn()!.textContent).toBe('UNLOCK');
    const text = document.querySelector('.pl-champ')!.textContent ?? '';
    expect(text).not.toMatch(/[$€£]|\bBUY\b|\bBuy\b/);
    btn()!.click();
    expect(a.calls).toEqual(['unlock rocket']);
  });

  it('no button for a hero the app does not offer, and none without an action (the store and pick browsers)', () => {
    open('rocket', fakeAction({ home: 'clem', owned: ['clem'], app: true, hidden: ['rocket'] }));
    expect(btn()).toBeNull();
    openBrowser()?.close();
    openChampBrowser({ hero: 'sage', clips: null, portrait: () => null });
    expect(document.querySelector('.cb-act')).toBeNull();
  });
});

const NOW = Date.now();
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

describe('Home nameplate', () => {
  it('opens the champion browser (onHeroes), never a match, the champion select or Mode Select', async () => {
    const o = base({ onHeroes: vi.fn() });
    const root = homeScreen(document.body, o);
    const plate = root.querySelector<HTMLButtonElement>('[data-testid="home-plate"]')!;
    expect(plate.tagName).toBe('BUTTON');
    expect(plate.getAttribute('aria-haspopup')).toBe('dialog');
    expect(plate.getAttribute('aria-label')).toContain('Switch hero');
    expect(plate.querySelector('.hm-plate-cue')).toBeTruthy();
    plate.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(o.onHeroes).toHaveBeenCalledTimes(1);
    expect(o.onPlay).not.toHaveBeenCalled();
    expect(o.onStart).not.toHaveBeenCalled();
    expect(o.onChoose).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="mode-select"]')).toBeNull();
  });

  it('stays a label on the first visit, in a dare, and without the browser', () => {
    for (const o of [base({ firstTime: true, onHeroes: vi.fn() }), base({ onHeroes: undefined })]) {
      const root = homeScreen(document.body, o);
      expect(root.querySelector('.hm-plate')!.tagName).toBe('DIV');
      disposeHome(root);
      root.remove();
    }
  });

  it('a SELECT patches the new hero into the same Home (no rebuild, no entrance replay)', () => {
    const root = homeScreen(document.body, base({ onHeroes: vi.fn() }));
    const nav = root.querySelector(':scope > .hm-nav');
    const play = root.querySelector('[data-testid="home-play"]');
    expect(patchHome(root, base({ onHeroes: vi.fn(), last: { hero: 'rocket', trick: 'pounce', difficulty: 'easy' }, identity: { name: 'Rocket', sub: 'Rocket the Marksman', element: 'FIRE', role: 'Marksman' } }))).toBe(true);
    expect(document.querySelectorAll('.pl-home')).toHaveLength(1);
    expect(root.isConnected).toBe(true);
    expect(root.classList.contains('hm-still')).toBe(true);
    expect(root.querySelector('[data-testid="home-plate"] .hm-plate-n')!.textContent).toContain('Rocket');
    // the regions that did not change are the same nodes (the profile badge follows the hero's element)
    expect(root.querySelector(':scope > .hm-nav')).toBe(nav);
    expect(root.querySelector('[data-testid="home-play"]')).toBe(play);
  });
});
