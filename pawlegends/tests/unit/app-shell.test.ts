/**
 * The App Store build (docs/plans/moba/APP-STORE.md "IAP, crypto and donations on iOS"): inside the native shell the
 * game is an app build for good. No checkout, no notify sign-up, no purchased cosmetics, no link to another site,
 * and dare links point at the public web game, never at `capacitor://localhost`.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { coarsePointer, inAppShell, PUBLIC_GAME_URL, shareBase, shellPlatform } from '../../src/app/platform';
import { isAppBuild, lockAppBuild, parseRoster, resetAppBuild, setAppBuild } from '../../src/meta/roster';
import { Entitlements } from '../../src/money/entitlements';

afterEach(() => resetAppBuild());

describe('inAppShell', () => {
  it('is on with the build flag', () => {
    expect(inAppShell(true, undefined)).toBe(true);
  });
  it('is on when a Capacitor native bridge is on the page', () => {
    expect(inAppShell(false, { Capacitor: { isNativePlatform: () => true } })).toBe(true);
  });
  it('is off on the web (no bridge, a web Capacitor, or a throwing one)', () => {
    expect(inAppShell(false, {})).toBe(false);
    expect(inAppShell(false, { Capacitor: { isNativePlatform: () => false } })).toBe(false);
    expect(
      inAppShell(false, {
        Capacitor: {
          isNativePlatform: () => {
            throw new Error('x');
          },
        },
      }),
    ).toBe(false);
  });
});

describe('shareBase', () => {
  it('the app shares the public game, never its own capacitor:// address', () => {
    expect(shareBase({ appShell: true, embedded: false, referrer: '', href: 'capacitor://localhost/index.html' })).toBe(PUBLIC_GAME_URL);
    expect(PUBLIC_GAME_URL).toBe('https://pawlegends.app/');
  });
  it('embedded: Paw Legends\' own domain on a production host, a preview host page; standalone web: this page', () => {
    expect(shareBase({ appShell: false, embedded: true, referrer: 'https://tokentails.com/pawlegends/play?x=1', href: 'https://h/g' })).toBe('https://pawlegends.app/');
    expect(shareBase({ appShell: false, embedded: true, referrer: 'https://pawlegends.app/play', href: 'https://h/g' })).toBe('https://pawlegends.app/');
    expect(shareBase({ appShell: false, embedded: true, referrer: 'https://preview-1.vercel.app/pawlegends/play', href: 'https://h/g' })).toBe('https://preview-1.vercel.app/pawlegends');
    expect(shareBase({ appShell: false, embedded: false, referrer: '', href: 'https://h/g?a=1' })).toBe('https://h/g?a=1');
    expect(shareBase({ appShell: false, embedded: true, referrer: 'not a url', href: 'https://h/g' })).toBe('https://h/g');
  });
});

describe('lockAppBuild', () => {
  it('a host message cannot turn the app build off once the shell locked it', () => {
    lockAppBuild();
    setAppBuild(false);
    expect(isAppBuild()).toBe(true);
  });
  it('keeps starter and redeemed cats only', () => {
    lockAppBuild();
    const cats = parseRoster([
      { id: 'a1', name: 'Bought', origin: 'purchase', sprite: 'assets/BLACK/a.png' },
      { id: 'a2', name: 'Free', origin: 'starter', sprite: 'assets/BLACK/a.png' },
    ]);
    expect(cats.map((c) => c.id)).not.toContain('a1');
  });
});

describe('Entitlements in the app shell', () => {
  it('no checkout, no notify, no purchased cosmetics even when a host offers them', () => {
    lockAppBuild();
    const ent = new Entitlements();
    ent.apply({ type: 'app', isApp: false, store: true, notify: true });
    const s = ent.snapshot();
    expect(s.isApp).toBe(true);
    expect(s.catCheckout).toBe(false);
    expect(s.notifyOpen).toBe(false);
    expect(s.items.size).toBe(0);
  });
  it('the web build is unchanged', () => {
    const ent = new Entitlements();
    ent.apply({ type: 'app', isApp: false, store: true });
    expect(ent.snapshot().catCheckout).toBe(true);
  });
});

describe('shellPlatform and coarsePointer (the Mac app)', () => {
  const mac = { Capacitor: { isNativePlatform: () => true }, __PL_PLATFORM__: 'mac' };
  it('names the native shell from window.__PL_PLATFORM__', () => {
    expect(shellPlatform(false, mac)).toBe('mac');
    expect(shellPlatform(false, { Capacitor: { isNativePlatform: () => true }, __PL_PLATFORM__: 'ios' })).toBe('ios');
    // an iPhone binary from before the platform key
    expect(shellPlatform(true, {})).toBe('ios');
    expect(shellPlatform(false, { __PL_PLATFORM__: 'mac' })).toBe(null);
  });
  it('names the Android app from __PL_PLATFORM__, or from Capacitor when the WebView ran no start script', () => {
    expect(shellPlatform(false, { Capacitor: { isNativePlatform: () => true }, __PL_PLATFORM__: 'android' })).toBe('android');
    expect(shellPlatform(false, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } })).toBe('android');
    expect(shellPlatform(false, { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' } })).toBe('ios');
    expect(shellPlatform(false, { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'android' } })).toBe(null);
    expect(coarsePointer('android', () => ({ matches: true }))).toBe(true);
  });
  it('never starts touch controls in the Mac app', () => {
    const coarse = () => ({ matches: true });
    expect(coarsePointer('mac', coarse)).toBe(false);
    expect(coarsePointer('ios', coarse)).toBe(true);
    expect(coarsePointer(null, coarse)).toBe(true);
    expect(coarsePointer(null, () => ({ matches: false }))).toBe(false);
    expect(coarsePointer(null, undefined)).toBe(false);
  });
});
