// @vitest-environment happy-dom
/**
 * Sim v14 (DOGS-V13 §2): the pick screen's CATS / DOGS switch. One side's heroes show at a time (cats 10, dogs 7);
 * a switch selects the side's last hero (else Clem / Sir Brutus) and tells the app; DOGS is locked before the first
 * match is complete (it keeps its count and says when it opens); arrow keys move the radio; a long name never
 * truncates. Looks only: nothing here touches the sim.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickScreen, sideSwitch, type PickOpts } from '../../src/ui/screens';
import { HERO_IDS, HEROES } from '../../src/data/heroes';

const base = (o: Partial<PickOpts> = {}): PickOpts => ({
  initial: { hero: 'clem', trick: 'pounce', difficulty: 'easy' },
  onHero: vi.fn(),
  onStart: vi.fn(),
  onBack: vi.fn(),
  ...o,
});
const mount = (o: Partial<PickOpts> = {}): HTMLElement => pickScreen(document.body, base(o));
const visible = (root: HTMLElement): string[] => [...root.querySelectorAll<HTMLElement>('.heroes:not([hidden]) .hero-card')].map((e) => e.dataset.h ?? '');
const tab = (root: HTMLElement, side: 'cat' | 'dog'): HTMLElement => root.querySelector<HTMLElement>(`.side-tab.${side}`) as HTMLElement;
const on = (root: HTMLElement): string => root.querySelector<HTMLElement>('.hero-card.on')?.dataset.h ?? '';

afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.pickSide;
});

describe('CATS / DOGS switch', () => {
  it('the roster has 10 cats and 7 dogs; the grid shows only the chosen side', () => {
    expect(HERO_IDS.filter((h) => HEROES[h].side === 'cat')).toHaveLength(10);
    expect(HERO_IDS.filter((h) => HEROES[h].side === 'dog')).toHaveLength(7);
    const root = mount();
    expect(visible(root)).toHaveLength(10);
    expect(visible(root).every((h) => HEROES[h as keyof typeof HEROES].side === 'cat')).toBe(true);
    expect(document.documentElement.dataset.pickSide).toBe('cat');
    expect(tab(root, 'cat').getAttribute('aria-checked')).toBe('true');
    expect(tab(root, 'dog').getAttribute('aria-checked')).toBe('false');
    expect(root.querySelector('.side-switch')?.getAttribute('role')).toBe('radiogroup');
    // both side boxes stay in the DOM (the portrait redraw keys on data-side)
    expect(root.querySelectorAll('.heroes[data-side]')).toHaveLength(2);
  });

  it('DOGS selects the side default, calls onHero and onSide, and shows 7 dog tiles', () => {
    const onHero = vi.fn();
    const onSide = vi.fn();
    const root = mount({ onHero, onSide });
    tab(root, 'dog').click();
    expect(onHero).toHaveBeenCalledWith('brutus');
    expect(onSide).toHaveBeenCalledWith('dog', 'brutus', 'clem');
    expect(visible(root)).toEqual(HERO_IDS.filter((h) => HEROES[h].side === 'dog'));
    expect(on(root)).toBe('brutus');
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    expect(tab(root, 'dog').getAttribute('aria-checked')).toBe('true');
  });

  it('switching back restores the last hero picked on each side', () => {
    const root = mount({ initial: { hero: 'sage', trick: 'pounce', difficulty: 'easy' }, lastBySide: { dog: 'chili' } });
    tab(root, 'dog').click();
    expect(on(root)).toBe('chili');
    root.querySelector<HTMLElement>('[data-h="bravo"]')?.click();
    tab(root, 'cat').click();
    expect(on(root)).toBe('sage');
    tab(root, 'dog').click();
    expect(on(root)).toBe('bravo');
  });

  it('Play starts with a hero of the chosen side', () => {
    const onStart = vi.fn();
    const root = mount({ onStart });
    tab(root, 'dog').click();
    root.querySelector<HTMLElement>('[data-h="nugget"]')?.click();
    root.querySelector<HTMLElement>('[data-a="start"]')?.click();
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ hero: 'nugget' }));
  });

  it('locked before the first match: DOGS keeps its count, says when, and does not switch', () => {
    const onHero = vi.fn();
    const root = mount({ dogsLocked: true, onHero });
    const dog = tab(root, 'dog');
    expect(dog.getAttribute('aria-disabled')).toBe('true');
    expect(dog.textContent).toContain('7');
    expect(dog.textContent).toContain('after your first match');
    dog.click();
    expect(onHero).not.toHaveBeenCalled();
    expect(visible(root)).toHaveLength(10);
    expect(document.documentElement.dataset.pickSide).toBe('cat');
  });

  it('a dog dare opens on DOGS even while locked', () => {
    const root = mount({ dogsLocked: true, initial: { hero: 'chili', trick: 'pounce', difficulty: 'easy' } });
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    expect(on(root)).toBe('chili');
    expect(tab(root, 'dog').getAttribute('aria-disabled')).toBeNull();
  });

  it('arrow keys move the radio', () => {
    const onHero = vi.fn();
    const root = mount({ onHero });
    tab(root, 'cat').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.documentElement.dataset.pickSide).toBe('dog');
    expect(onHero).toHaveBeenLastCalledWith('brutus');
    tab(root, 'dog').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.documentElement.dataset.pickSide).toBe('cat');
    expect(onHero).toHaveBeenLastCalledWith('clem');
  });

  it('a long name sets a smaller label instead of an ellipsis', () => {
    const root = mount({ initial: { hero: 'marshmallow', trick: 'pounce', difficulty: 'easy' } });
    expect(root.querySelector<HTMLElement>('[data-h="marshmallow"]')?.dataset.long).toBe('1');
    expect(root.querySelector<HTMLElement>('[data-h="chili"]')?.dataset.long).toBeUndefined();
  });

  it('the switch markup says CATS vs DOGS and the enemy side on tall screens', () => {
    const html = sideSwitch('dog', false);
    expect(html).toContain('CATS');
    expect(html).toContain('DOGS');
    expect(html).toContain('You play the dogs. Your enemies: the cats.');
  });
});
