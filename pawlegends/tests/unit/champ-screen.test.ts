// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROTATION_EPOCH } from '../../src/money/catalog';
import { parseChampionsState, type ChampionsState } from '../../src/meta/champions';
import { champCard, heroBar } from '../../src/ui/champStore/model';
import { storePanel } from '../../src/ui/store';
import type { CheckoutBridge } from '../../src/money/checkoutBridge';
import type { StoreSnapshot } from '../../src/money/entitlements';

/*
 * The champion screen (founder Nov 18, ui/store.ts hero detail): full screen like Home, the splash on the champion's
 * side, the kit as P Q W E R chips with one line for the chosen one, the price and terms lines folded away, and one
 * bar at the foot whose state `heroBar` decides: owned, starter, free this week, affordable, short of Yarn, and the app
 * build that never shows a price.
 */

const WEEK0 = Date.parse(ROTATION_EPOCH) + 3600_000;
const state = (over: Record<string, unknown> = {}): ChampionsState =>
  parseChampionsState({ owned: [], founders: false, rotation: { week: 0 }, yarn: { balance: 0, matches: 0, picksLeft: 0, nextPickAt: 5 }, bundles: [], ...over }, WEEK0)!;
const yarn = (balance: number, picksLeft = 0) => ({ yarn: { balance, matches: 9, picksLeft, nextPickAt: null } });

describe('heroBar: the bottom bar state', () => {
  it('owned and starter: a done line, no unlock, no buy, no fine print', () => {
    const s = state({ owned: [{ hero: 'pixel', source: 'yarn' }] });
    expect(heroBar(champCard('pixel', s, false)!, 0, true)).toEqual({ kind: 'owned', free: false, unlock: null, pick: false, buy: false, fine: false });
    expect(heroBar(champCard('clem', s, false)!, 0, true).kind).toBe('starter');
  });

  it('affordable: the unlock is enabled and the bar is full', () => {
    const s = state(yarn(5000));
    const b = heroBar(champCard('duchess', s, false)!, 5000, true);
    expect(b.kind).toBe('unlock');
    expect(b.unlock).toEqual({ cost: 3500, have: 5000, toGo: 0, enabled: true, pct: 100 });
    expect(b.buy).toBe(true);
    expect(b.fine).toBe(true);
  });

  it('short of Yarn: disabled, with the share of the cost already earned', () => {
    const s = state(yarn(922));
    const b = heroBar(champCard('duchess', s, false)!, 922, true);
    expect(b.unlock).toEqual({ cost: 3500, have: 922, toGo: 2578, enabled: false, pct: 26 });
    expect(b.pick).toBe(false);
  });

  it('a Champion Pick shows its own button', () => {
    const s = state(yarn(0, 1));
    expect(heroBar(champCard('duchess', s, false)!, 0, true).pick).toBe(true);
  });

  it('free this week: still unlockable for keeps, flagged free', () => {
    const s = state(yarn(0));
    const free = s.rotation.heroes[0] as never;
    const b = heroBar(champCard(free, s, false)!, 0, true);
    expect(b.free).toBe(true);
    expect(b.kind).toBe('unlock');
  });

  it('app build: no buy and no price lines, the Yarn unlock stays; a web-bought champion is locked with nothing to do', () => {
    const s = state({ ...yarn(5000), owned: [{ hero: 'stilts', source: 'purchase' }] });
    const b = heroBar(champCard('duchess', s, true)!, 5000, false);
    expect(b.buy).toBe(false);
    expect(b.fine).toBe(false);
    expect(b.unlock?.enabled).toBe(true);
    expect(heroBar(champCard('stilts', s, true)!, 5000, false).kind).toBe('locked');
  });
});

const checkout = { buy: () => true, waitingSku: () => null, onResult: () => () => undefined } as unknown as CheckoutBridge;
const snap = (c: ChampionsState, isApp: boolean): StoreSnapshot =>
  ({ embedded: true, isApp, storeOpen: !isApp, catCheckout: false, notifyOpen: false, signedIn: true, items: new Set(), skus: new Set(), season: null, champions: c }) as StoreSnapshot;
const openOn = (hero: string, c: ChampionsState, isApp = false) =>
  storePanel(document.body, { snapshot: () => snap(c, isApp), checkout, onClose: vi.fn(), onUnlock: () => undefined, hero: hero as never, termsUrl: '/terms' }).el;

describe('the champion screen', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('full screen on the champion\'s side: cats left, dogs right; Back first', () => {
    const cat = openOn('pixel', state(yarn(922)));
    const p = cat.querySelector('.cst-hd')!;
    expect(p.getAttribute('data-cside')).toBe('cat');
    expect(p.querySelector('[data-a="detail-close"]')!.getAttribute('aria-label')).toBe('Back');
    document.body.innerHTML = '';
    expect(openOn('brutus', state()).querySelector('.cst-hd')!.getAttribute('data-cside')).toBe('dog');
  });

  it('the kit: five chips, one line for the chosen one; a tap switches it', () => {
    const el = openOn('pixel', state(yarn(922)));
    const chips = el.querySelectorAll<HTMLButtonElement>('.cst-skill');
    expect(chips).toHaveLength(5);
    expect([...chips].map((b) => b.querySelector('.k')!.textContent)).toEqual(['P', 'Q', 'W', 'E', 'R']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
    const first = el.querySelector('.cst-skill-line .on')!.textContent;
    chips[1].click();
    expect(el.querySelector('.cst-skill[data-skill="1"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.cst-skill-line .on')!.textContent).not.toBe(first);
    expect(el.querySelector('.cst-skill-line .on .k')!.textContent).toBe('Q');
    expect(el.querySelectorAll('.cst-skill-line .on')).toHaveLength(1);
    expect(el.querySelectorAll('.cst-skill-line [aria-hidden="false"]')).toHaveLength(1);
  });

  // founder Nov 20: "if I click on skills here it results in screen rerendering"
  it('a chip changes only the chosen state and the line: the splash, the screen and the chips stay the same nodes', () => {
    const el = openOn('meatball', state(yarn(922)));
    const img = el.querySelector('.cst-hd-art img');
    const panel = el.querySelector('.cst-hd');
    const chips = [...el.querySelectorAll<HTMLButtonElement>('.cst-skill')];
    const lines = [...el.querySelectorAll('.cst-skill-line .cst-sl')];
    expect(lines).toHaveLength(5);
    let changed = 0;
    const mo = new MutationObserver((r) => (changed += r.filter((x) => x.type === 'childList').length));
    mo.observe(el, { childList: true, subtree: true });
    for (const i of [2, 4, 0, 1, 3]) {
      chips[i].click();
      expect(el.querySelector('.cst-hd-art img')).toBe(img);
      expect(el.querySelector('.cst-hd')).toBe(panel);
      expect([...el.querySelectorAll('.cst-skill')]).toEqual(chips);
      expect(el.querySelector('.cst-skill-line .on')).toBe(lines[i]);
      expect(chips.map((b) => b.getAttribute('aria-pressed'))).toEqual(chips.map((_, j) => String(j === i)));
    }
    mo.disconnect();
    expect(changed).toBe(0);
  });

  it('the keyboard: P Q W E R pick an ability, the arrows walk the chips from a chip', () => {
    const el = openOn('meatball', state(yarn(922)));
    const img = el.querySelector('.cst-hd-art img');
    const on = (): string => el.querySelector('.cst-skill-line .on .k')!.textContent!;
    const key = (k: string, t: EventTarget = document.body): void => void t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    key('w');
    expect(on()).toBe('W');
    key('R');
    expect(on()).toBe('R');
    const chip = el.querySelector<HTMLButtonElement>('.cst-skill[data-skill="4"]')!;
    chip.focus();
    key('ArrowRight', chip);
    expect(on()).toBe('P');
    expect(document.activeElement).toBe(el.querySelector('.cst-skill[data-skill="0"]'));
    key('ArrowLeft', document.activeElement!);
    expect(on()).toBe('R');
    expect(el.querySelector('.cst-hd-art img')).toBe(img);
  });

  it('Prices and terms fold out in place: the splash stays the same node', () => {
    const el = openOn('pixel', state(yarn(922)));
    const img = el.querySelector('.cst-hd-art img');
    el.querySelector<HTMLElement>('[data-a="fine"]')!.click();
    expect(el.querySelector('.cst-finebox')).not.toBeNull();
    expect(el.querySelector('[data-a="fine"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.cst-hd-art img')).toBe(img);
    el.querySelector<HTMLElement>('[data-a="fine"]')!.click();
    expect(el.querySelector('.cst-finebox')).toBeNull();
    expect(el.querySelector('.cst-hd-art img')).toBe(img);
  });

  it('short of Yarn: the bar shows the progress and what is missing; the price lines open on tap', () => {
    const el = openOn('pixel', state(yarn(922)));
    const bar = el.querySelector('.cst-hd-bar')!;
    expect(bar.querySelector<HTMLButtonElement>('[data-unlock="yarn"]')!.disabled).toBe(true);
    expect(bar.querySelector('.cst-prog i')!.getAttribute('style')).toContain('width:26%');
    expect(bar.querySelector('[data-testid="store-togo"]')!.textContent).toMatch(/You have 922 Yarn\. 2,578 more to go \(about \d+ matches\)/);
    expect(bar.querySelector('[data-buy="pl_champ_pixel"]')).not.toBeNull();
    // the unlock is the last control of the bar (bottom-right, like PLAY)
    expect(bar.lastElementChild!.getAttribute('data-unlock')).toBe('yarn');
    expect(el.querySelector('.cst-finebox')).toBeNull();
    el.querySelector<HTMLElement>('[data-a="fine"]')!.click();
    expect(el.querySelector('.cst-finebox')!.textContent).toContain('A bought champion plays the same');
    expect(el.querySelector('.cst-finebox a[href="/terms"]')).not.toBeNull();
  });

  it('owned: the bar says so, nothing to buy', () => {
    const el = openOn('pixel', state({ owned: [{ hero: 'pixel', source: 'yarn' }] }));
    expect(el.querySelector('.cst-hd')!.getAttribute('data-bar')).toBe('owned');
    expect(el.querySelector('.cst-hd-bar')!.textContent).toContain('Owned');
    expect(el.querySelector('.cst-hd [data-buy], .cst-hd [data-unlock], [data-a="fine"]')).toBeNull();
  });

  it('app build: the Yarn unlock only, no price, no terms toggle', () => {
    const el = openOn('pixel', state(yarn(5000)), true);
    expect(el.querySelector<HTMLButtonElement>('[data-unlock="yarn"]')!.disabled).toBe(false);
    expect(el.querySelector('[data-buy], [data-a="fine"]')).toBeNull();
    expect(el.querySelector('.cst-hd')!.textContent).not.toMatch(/\$|€/);
  });
});
