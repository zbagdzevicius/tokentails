// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAT } from '../types';
import { startApp } from './app-shell';
import { fakeMoney, qa, until, world } from './shell-world.test-util';
import { meta } from '../meta';

// GDD 8 FTUE step 6 (round 3): with Club on, the session-1 home screen listed "Chaos Club · Shop · Gift · Put my
// cat · For brands". No money row in the first session or on the install day; "For brands" lives in Settings.

afterEach(() => {
  document.body.innerHTML = '';
  delete window.__BADCAT_QA__;
});

async function homeLinks(sessionsBefore: number, createdAt: number): Promise<string> {
  const w = world({ ghosts: [] }, { env: { apiUrl: 'https://api.test' } });
  w.kv.set('ftueDone', true);
  w.profile.p = { ...w.profile.p, sessions: sessionsBefore, createdAt, cats: [{ ...DEFAULT_CAT, name: 'Mochi' }] };
  w.services.money = fakeMoney({ status: async () => ({ enabled: true, checkout: true, cameos: true, gifts: true, restoreEmail: false, faceUploads: false, creatorCodes: false, brand: true, testMode: true }) });
  w.services.meta = meta;
  const root = document.createElement('div');
  document.body.appendChild(root);
  startApp(root, w.services);
  await until(() => qa().screen() === 'home');
  await new Promise((r) => setTimeout(r, 0));
  // remount home now that the server status is in
  qa().goto?.('settings');
  await until(() => qa().screen() === 'settings');
  const settingsText = root.textContent ?? '';
  qa().goto?.('home');
  await until(() => qa().screen() === 'home');
  return `${root.querySelector('.bc-home-links')?.textContent ?? ''}|SETTINGS|${settingsText}`;
}

describe('home money row', () => {
  it('session 1: no Club, Shop, Gift or brand buttons on Home', async () => {
    const t = await homeLinks(0, Date.now() - 3 * 86400_000);
    const home = t.split('|SETTINGS|')[0];
    for (const s of ['Chaos Club', 'Shop', 'Gift', 'Put my cat', 'For brands']) expect(home).not.toContain(s);
  });

  it('install day, session 3: still hidden', async () => {
    const home = (await homeLinks(2, Date.now())).split('|SETTINGS|')[0];
    expect(home).not.toContain('Shop');
  });

  it('a later day: the row shows, without "For brands" (that is in Settings)', async () => {
    const [home, settings] = (await homeLinks(3, Date.now() - 3 * 86400_000)).split('|SETTINGS|');
    expect(home).toContain('Shop');
    expect(home).not.toContain('For brands');
    expect(settings).toContain('For brands');
  });
});
