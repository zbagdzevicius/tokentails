// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAT, type CatMakerResult } from '../types';
import { startApp } from './app-shell';
import { qa, until, world, type World } from './shell-world.test-util';

// Round 3 (data loss): a returning player who opened /c/<code> had their own cat overwritten by the stranger's
// unnamed cat on every exit of the cat maker.

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__BADCAT_QA__;
});

function linked(result: Partial<CatMakerResult>, cats = [{ ...DEFAULT_CAT, name: 'Mochi', collar: 0 }]): World {
  const w = world({ ghosts: [], catCode: 'AAAA', catName: 'Biscuit' } as never);
  w.kv.set('ftueDone', true);
  w.profile.p = { ...w.profile.p, sessions: 3, cats, active: 0 };
  w.services.codec.decodeCat = (_c, name) => ({ ...DEFAULT_CAT, base: 0x1234, collar: 2, hat: 5, name: name ?? '' });
  w.services.catMaker.open = async (_h, o) => {
    w.catmakerOpens.push(o as unknown as Record<string, unknown>);
    return { spec: { ...(o.initial ?? DEFAULT_CAT) }, method: 'skipped', ...result };
  };
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, w.services);
  return w;
}

describe('cat link for a returning player', () => {
  it('opens the maker in linked mode with the friend\'s name, and unowned paid cosmetics come off', async () => {
    const w = linked({ kept: true });
    await until(() => w.catmakerOpens.length > 0);
    const o = w.catmakerOpens[0] as { fromLink: boolean; linked?: { keepName: string }; initial: { name: string } };
    expect(o.linked?.keepName).toBe('Mochi');
    expect(o.initial.name).toBe('Biscuit');
    await until(() => qa().screen() === 'home');
  });

  it('"Keep my cat" leaves the slot, the name and the face untouched', async () => {
    const w = linked({ kept: true });
    await until(() => qa().screen() === 'home');
    expect(w.profile.p.cats).toHaveLength(1);
    expect(w.profile.p.cats[0].name).toBe('Mochi');
    expect(w.profile.p.cats[0].base).toBe(DEFAULT_CAT.base);
  });

  it('"Play as" with no free slot plays the friend\'s cat this visit only (nothing saved)', async () => {
    const w = linked({ adopted: true });
    await until(() => qa().screen() === 'home');
    expect(w.profile.p.cats).toHaveLength(1);
    expect(w.profile.p.cats[0].name).toBe('Mochi');
  });
});
