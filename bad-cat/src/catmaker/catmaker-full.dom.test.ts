// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CAT, PATTERNS, type CatMakerResult, type RenderApi } from '../types';
import { openCatMaker, type CatMakerOptions } from './CatMaker';
import { manageCats, UPSELL_TEXT } from './CatManager';
import { createPhotoStore } from './photo-store';

const render = {} as RenderApi;
const stubPreview = () => ({ update: () => undefined, dispose: () => undefined });
const q = <T extends HTMLElement = HTMLButtonElement>(host: HTMLElement, id: string): T => {
  const b = host.querySelector<T>(`[data-bcm="${id}"]`);
  if (!b) throw new Error(`no ${id}`);
  return b;
};
const mount = (): HTMLElement => {
  const host = document.createElement('div');
  document.body.append(host);
  return host;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.replaceChildren();
});

describe('studio / reply template', () => {
  it('asks for a screenshot, shows the @handle field, the name starts blank, returns the filtered handle', async () => {
    const host = mount();
    const p = openCatMaker(host, { fromLink: false, studio: true, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    expect(q(host, 'choose').textContent).toBe('Drop a screenshot of their video');
    q(host, 'hand').click();
    const handle = q<HTMLInputElement>(host, 'handle');
    expect(q<HTMLInputElement>(host, 'name').value).toBe('');
    handle.value = '@Luna.Mom!!';
    handle.dispatchEvent(new Event('input'));
    expect(handle.value).toBe('@luna.mom');
    expect(q(host, 'handle-caption').textContent).toContain('@luna.mom');
    q<HTMLInputElement>(host, 'name').value = 'Luna';
    q(host, 'confirm').click();
    const r = await p;
    expect(r.handle).toBe('@luna.mom');
    expect(r.spec.name).toBe('Luna');
    expect(r.catIndex).toBe(0);
  });

  it('catIndex -1 keeps the studio cat in memory: no slot is read, written or cleared', async () => {
    const host = mount();
    const calls: string[] = [];
    const spy = {
      put: async () => void calls.push('put'),
      get: async () => (calls.push('get'), null),
      remove: async () => void calls.push('remove'),
      move: async () => void calls.push('move'),
      persistent: true,
    };
    const p = openCatMaker(host, { fromLink: false, studio: true, catIndex: -1, render, store: spy, previewFactory: stubPreview });
    q(host, 'hand').click();
    q<HTMLInputElement>(host, 'name').value = 'Luna';
    q(host, 'confirm').click();
    const r = await p;
    expect(r.spec.name).toBe('Luna');
    expect(r.catIndex).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('no handle field outside studio mode, and no handle in the result', async () => {
    const host = mount();
    const p = openCatMaker(host, { fromLink: false, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    q(host, 'hand').click();
    expect(host.querySelector('[data-bcm="handle"]')).toBeNull();
    q(host, 'confirm').click();
    expect((await p).handle).toBeUndefined();
  });
});

describe('re-add after an in-app handoff', () => {
  it('one-tap screen; Skip resolves with the initial spec untouched', async () => {
    const host = mount();
    const initial = { ...DEFAULT_CAT, name: 'Mochi', pattern: 'calico' as const, eyes: 4, hat: 4 };
    const p = openCatMaker(host, { initial, fromLink: true, reAdd: { name: 'Mochi' }, catIndex: 2, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    expect(host.querySelector('h1')!.textContent).toBe('Add Mochi’s photo again for the clip opener');
    q(host, 'readd-skip').click();
    const r = await p;
    expect(r.method).toBe('skipped');
    expect(r.spec).toEqual(initial);
    expect(r.catIndex).toBe(2);
  });
});

describe('dress-up screen', () => {
  const open = (extra: Partial<CatMakerOptions> = {}): { host: HTMLElement; p: Promise<CatMakerResult> } => {
    const host = mount();
    const p = openCatMaker(host, { fromLink: false, render, store: createPhotoStore(undefined), previewFactory: stubPreview, ...extra });
    q(host, 'hand').click();
    return { host, p };
  };

  it('all 7 pattern chips are enabled, and the colour rows follow the pattern', async () => {
    const { host, p } = open();
    const pat = host.querySelector('[data-bcm-group="pattern"]')!;
    const chips = [...pat.querySelectorAll<HTMLButtonElement>('.bcm-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(PATTERNS.map((x) => x[0].toUpperCase() + x.slice(1)));
    expect(chips.every((c) => !c.disabled)).toBe(true);
    const sec = host.querySelector<HTMLElement>('[data-bcm-group="secondary"]')!;
    const ter = host.querySelector<HTMLElement>('[data-bcm-group="tertiary"]')!;
    chips.find((c) => c.textContent === 'Calico')!.click();
    expect(sec.hidden).toBe(false);
    expect(sec.querySelector('.bcm-label')!.textContent).toBe('Dark patches');
    expect(ter.hidden).toBe(false);
    chips.find((c) => c.textContent === 'Solid')!.click();
    expect(sec.hidden).toBe(true);
    expect(ter.hidden).toBe(true);
    chips.find((c) => c.textContent === 'Tortie')!.click();
    q(host, 'confirm').click();
    expect((await p).spec.pattern).toBe('tortie');
  });

  it('cosmetic rows are hidden without owned items', () => {
    const { host } = open();
    expect(host.querySelector('[data-bcm-group="collar"]')).toBeNull();
    expect(host.querySelector('[data-bcm-group="hat"]')).toBeNull();
  });

  it('owned collars and hats show as chips and land in the spec', async () => {
    const { host, p } = open({ owned: { collars: [2], hats: [4, 5] } });
    const collar = host.querySelector('[data-bcm-group="collar"]')!;
    const hat = host.querySelector('[data-bcm-group="hat"]')!;
    expect(collar.querySelectorAll('.bcm-chip')).toHaveLength(2); // None + Pink Paw
    expect(hat.querySelectorAll('.bcm-chip')).toHaveLength(3);
    [...collar.querySelectorAll<HTMLButtonElement>('.bcm-chip')].find((c) => c.textContent?.includes('Pink Paw'))!.click();
    [...hat.querySelectorAll<HTMLButtonElement>('.bcm-chip')].find((c) => c.textContent?.includes('Tiny crown'))!.click();
    q(host, 'confirm').click();
    const r = await p;
    expect(r.spec.collar).toBe(2);
    expect(r.spec.hat).toBe(5);
  });
});

describe('your cats (manage)', () => {
  const cats = [
    { ...DEFAULT_CAT, name: 'Mochi' },
    { ...DEFAULT_CAT, name: 'Luna' },
  ];

  it('switches the star and resolves on Done', async () => {
    const host = mount();
    const p = manageCats(host, { cats, active: 0, maxCats: 5, render, store: createPhotoStore(undefined) });
    q(host, 'cat-1').click();
    await tick();
    expect(q(host, 'cat-1').getAttribute('aria-pressed')).toBe('true');
    q(host, 'manage-done').click();
    const r = await p;
    expect(r.active).toBe(1);
    expect(r.cats.map((c) => c.name)).toEqual(['Mochi', 'Luna']);
  });

  it('add opens the maker into the next slot; delete needs two taps and forgets the slot', async () => {
    const host = mount();
    const store = createPhotoStore(undefined);
    await store.put(1, { opener: { media: new Blob(['luna']), kind: 'photo' } });
    const openMaker = vi.fn(async (_h: HTMLElement, o: CatMakerOptions): Promise<CatMakerResult> => ({ spec: { ...DEFAULT_CAT, name: 'Pip' }, method: 'manual', catIndex: o.catIndex }));
    const p = manageCats(host, { cats, active: 0, maxCats: 5, render, store, openMaker });
    q(host, 'add').click();
    await tick();
    await tick();
    expect(openMaker.mock.calls[0][1].catIndex).toBe(2);
    expect(q(host, 'cat-2').getAttribute('aria-pressed')).toBe('true');
    q(host, 'delete-1').click();
    expect(q(host, 'delete-1').textContent).toBe('Sure? Tap again');
    q(host, 'delete-1').click();
    await tick();
    await tick();
    expect(await store.get(1)).toBeNull();
    q(host, 'manage-done').click();
    const r = await p;
    expect(r.cats.map((c) => c.name)).toEqual(['Mochi', 'Pip']);
    expect(r.active).toBe(1);
  });

  it('at the free cap shows the cheeky Club row instead of Add', async () => {
    const host = mount();
    const onUpsell = vi.fn();
    const p = manageCats(host, { cats: [cats[0]], active: 0, maxCats: 1, render, onUpsell, store: createPhotoStore(undefined) });
    expect(host.querySelector('[data-bcm="add"]')).toBeNull();
    expect(q(host, 'upsell').textContent).toContain(UPSELL_TEXT);
    q(host, 'upsell').click();
    expect(onUpsell).toHaveBeenCalledTimes(1);
    expect(q(host, 'delete-0').disabled).toBe(true);
    q(host, 'manage-done').click();
    await p;
  });
});
