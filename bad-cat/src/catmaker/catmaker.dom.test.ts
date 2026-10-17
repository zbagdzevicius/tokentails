// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAT, rgb565, type RenderApi } from '../types';
import { openCatMaker } from './CatMaker';
import { createPhotoStore } from './photo-store';

const render = {} as RenderApi;
const stubPreview = () => ({ update: () => undefined, dispose: () => undefined });
const btn = (host: HTMLElement, id: string): HTMLButtonElement => {
  const b = host.querySelector<HTMLButtonElement>(`[data-bcm="${id}"]`);
  if (!b) throw new Error(`no ${id}`);
  return b;
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('cat maker flow', () => {
  it('skip resolves with DEFAULT_CAT in one tap', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = openCatMaker(host, { fromLink: true, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    expect(btn(host, 'skip').textContent).toBe('Skip, use a house cat');
    btn(host, 'skip').click();
    const r = await p;
    expect(r.method).toBe('skipped');
    expect(r.spec).toEqual(DEFAULT_CAT);
    expect(r.face).toBeUndefined();
    expect(host.querySelector('.bcm')).toBeNull();
  });

  it('pick by hand → chips → confirm returns a manual CatSpec with the typed name', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = openCatMaker(host, { fromLink: false, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    btn(host, 'hand').click();
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.bcm-chip')];
    chips.find((c) => c.textContent === 'Chonk')!.click();
    chips.find((c) => c.textContent === 'Solid')!.click();
    chips.find((c) => c.getAttribute('aria-label') === 'Ginger')!.click();
    expect(chips.find((c) => c.textContent === 'Chonk')!.getAttribute('aria-pressed')).toBe('true');
    const name = host.querySelector<HTMLInputElement>('[data-bcm="name"]')!;
    name.value = '  Mochi  ';
    btn(host, 'confirm').click();
    const r = await p;
    expect(r.method).toBe('manual');
    expect(r.spec.name).toBe('Mochi');
    expect(r.spec.body).toBe('chonk');
    expect(r.spec.pattern).toBe('solid');
    expect(r.spec.base).toBe(rgb565(0xd9823b));
  });

  it('empty name falls back to the house cat name', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const p = openCatMaker(host, { fromLink: true, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    btn(host, 'hand').click();
    btn(host, 'confirm').click();
    expect((await p).spec.name).toBe(DEFAULT_CAT.name);
  });

  it('from home with a saved cat, the skip button keeps it', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const initial = { ...DEFAULT_CAT, name: 'Luna', eyes: 3 };
    const p = openCatMaker(host, { initial, fromLink: false, render, store: createPhotoStore(undefined), previewFactory: stubPreview });
    expect(btn(host, 'skip').textContent).toBe('Keep Luna');
    btn(host, 'skip').click();
    const r = await p;
    expect(r.spec.name).toBe('Luna');
    expect(r.spec.eyes).toBe(3);
  });
});
