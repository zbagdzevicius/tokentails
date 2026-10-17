import { describe, expect, it } from 'vitest';
import { createStore } from '../platform/storage';
import { sanitizeCat } from '../platform/records';
import { DEFAULT_CAT } from '../types';
import { wearOwned } from './cosmetics';
import { importSaveCode } from './savecode';

// Round 3 (security): a cat link, a clip handoff or a save code carried paid collar / hat ids into the profile
// without a purchase. Unowned ones come off on adopt, import and sanitize.

const b64url = (s: string): string => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('cosmetic entitlement on adopt / import / sanitize', () => {
  it('wearOwned keeps owned ids and drops the rest', () => {
    const cat = { ...DEFAULT_CAT, collar: 2, hat: 5 };
    expect(wearOwned(cat, { collars: [], hats: [] })).toMatchObject({ collar: 0, hat: 0 });
    expect(wearOwned(cat, { collars: [2], hats: [] })).toMatchObject({ collar: 2, hat: 0 });
    expect(wearOwned(cat, undefined)).toMatchObject({ collar: 2, hat: 5 });
  });

  it('sanitizeCat drops ids that are not in the catalogue', () => {
    expect(sanitizeCat({ ...DEFAULT_CAT, collar: 999, hat: 65535 })).toMatchObject({ collar: 0, hat: 0 });
    expect(sanitizeCat({ ...DEFAULT_CAT, collar: 4, hat: 4 })).toMatchObject({ collar: 4, hat: 4 });
  });

  it('a save code moves cats, not purchases: unbought collars and hats come off', async () => {
    const store = createStore('t:', null);
    const data = { v: 1, profile: { cats: [{ ...DEFAULT_CAT, name: 'Mochi', collar: 2, hat: 5 }, { ...DEFAULT_CAT, name: 'Tofu', collar: 4, hat: 0 }], active: 0, createdAt: 1, sessions: 1, settings: { audio: true, reduceMotion: false, showPhotoInClips: true } }, cosmetics: { owned: ['collar:4'] } };
    const res = await importSaveCode(store, `BCD1j${b64url(JSON.stringify(data))}`);
    expect(res.ok).toBe(true);
    const prof = store.get<{ cats: { name: string; collar: number; hat: number }[] }>('profile', { cats: [] });
    expect(prof.cats[0]).toMatchObject({ name: 'Mochi', collar: 0, hat: 0 }); // Pink Paw collar + crown: paid
    expect(prof.cats[1]).toMatchObject({ name: 'Tofu', collar: 4 }); // Bell collar: earned on the free track
  });
});
