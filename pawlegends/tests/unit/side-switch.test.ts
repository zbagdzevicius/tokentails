// @vitest-environment happy-dom
/**
 * Champion select side tabs (docs/plans/moba/LANDING-PICK-UX.md §B2.3, §B4): All · Cats · Dogs filter the portrait
 * grid (10 cats, 10 dogs); the screen opens on the selected hero's side so ten tiles fit with no scroll; a tab is a
 * filter, never a pick. Before match 1 the dogs can be viewed (a lock on the tab and the tiles) but not locked in; a dog
 * dare opens on the dogs, unlocked. Arrow keys move the radio. Looks only: nothing here touches the sim.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickScreen, type PickOpts } from '../../src/ui/screens';
import { HERO_IDS, HEROES } from '../../src/data/heroes';
import { resetChampSelect } from '../../src/ui/champSelect/champSelect';

const base = (o: Partial<PickOpts> = {}): PickOpts => ({
  initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  onHero: vi.fn(),
  onStart: vi.fn(),
  onBack: vi.fn(),
  ...o,
});
const mount = (o: Partial<PickOpts> = {}): HTMLElement => pickScreen(document.body, base(o));
const visible = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('.cs-grid [data-h]:not([hidden])')].map((e) => e.dataset.h ?? '');
const tab = (root: HTMLElement, side: 'all' | 'cat' | 'dog'): HTMLElement => root.querySelector<HTMLElement>(`.side-tab.${side}`) as HTMLElement;
const on = (root: HTMLElement): string => root.querySelector<HTMLElement>('.cs-tile.on')?.dataset.h ?? '';
const cats = HERO_IDS.filter((h) => HEROES[h].side === 'cat');
const dogs = HERO_IDS.filter((h) => HEROES[h].side === 'dog');

beforeEach(() => resetChampSelect());
afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.pickSide;
});

describe('side tabs (All · Cats · Dogs)', () => {
  it('the roster has 10 cats and 10 dogs; the screen opens on the selected hero side (ten tiles, no scroll)', () => {
    expect(cats).toHaveLength(10);
    expect(dogs).toHaveLength(10);
    const root = mount();
    expect(visible(root)).toEqual(cats);
    expect(root.querySelectorAll('.cs-grid [data-h]')).toHaveLength(20);
    expect(document.documentElement.dataset.pickSide).toBe('cat');
    expect(tab(root, 'cat').getAttribute('aria-checked')).toBe('true');
    expect(tab(root, 'dog').getAttribute('aria-checked')).toBe('false');
    expect(root.querySelector('.cs-sides')?.getAttribute('role')).toBe('radiogroup');
  });

  it('a tab filters only: Dogs shows the dogs and picks nothing; All shows cats then dogs', () => {
    const onHero = vi.fn();
    const root = mount({ onHero });
    tab(root, 'dog').click();
    expect(visible(root)).toEqual(dogs);
    expect(onHero).not.toHaveBeenCalled();
    expect(on(root)).toBe('clem');
    tab(root, 'all').click();
    expect(visible(root)).toEqual([...cats, ...dogs]);
  });

  it('a dog tile selects the dog (the side follows the hero) and LOCK IN starts with it', () => {
    const onStart = vi.fn();
    const onHero = vi.fn();
    const root = mount({ onStart, onHero });
    tab(root, 'dog').click();
    root.querySelector<HTMLElement>('[data-h="nugget"]')?.click();
    expect(onHero).toHaveBeenCalledWith('nugget');
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    root.querySelector<HTMLElement>('[data-a="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ hero: 'nugget' }));
  });

  it('locked before the first match: Dogs shows a lock, a dog can be viewed but not locked in, and LOCK IN says why', () => {
    const onHero = vi.fn();
    const onStart = vi.fn();
    const root = mount({ dogsLocked: true, onHero, onStart });
    expect(tab(root, 'dog').getAttribute('aria-label')).toContain('unlock after your first match');
    tab(root, 'dog').click();
    expect(visible(root)).toEqual(dogs);
    const brutus = root.querySelector<HTMLElement>('[data-h="brutus"]') as HTMLElement;
    expect(brutus.classList.contains('locked')).toBe(true);
    brutus.click();
    // the panel shows the dog; the pick stays Clem
    expect(root.querySelector('.cs-panel')?.getAttribute('data-hero')).toBe('brutus');
    expect(onHero).not.toHaveBeenCalled();
    const lock = root.querySelector<HTMLButtonElement>('[data-a="start"]') as HTMLButtonElement;
    expect(lock.disabled).toBe(true);
    expect(lock.textContent).toContain('Dogs unlock after your first match');
    lock.click();
    expect(onStart).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.pickSide).toBe('cat');
  });

  it('a dog dare opens on the dogs, unlocked', () => {
    const root = mount({ dogsLocked: true, initial: { hero: 'chili', trick: 'pounce', difficulty: 'easy' } });
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    expect(on(root)).toBe('chili');
    expect(visible(root)).toEqual(dogs);
    expect(root.querySelector('.cs-tile.locked')).toBeNull();
  });

  it('arrow keys move the radio (and the filter with it)', () => {
    const root = mount();
    tab(root, 'cat').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tab(root, 'dog').getAttribute('aria-checked')).toBe('true');
    expect(visible(root)).toEqual(dogs);
    tab(root, 'dog').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(visible(root)).toEqual(cats);
  });

  it('a long name sets a smaller label instead of an ellipsis', () => {
    const root = mount({ initial: { hero: 'marshmallow', trick: 'pounce', difficulty: 'easy' } });
    expect(root.querySelector<HTMLElement>('[data-h="marshmallow"]')?.dataset.long).toBe('1');
    expect(root.querySelector<HTMLElement>('[data-h="chili"]')?.dataset.long).toBeUndefined();
  });
});
