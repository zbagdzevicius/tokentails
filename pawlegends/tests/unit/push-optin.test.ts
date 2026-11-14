import { describe, expect, it } from 'vitest';
import { ASK_AGAIN_MS, defaultPrefs, keyBytes, MAX_ASKS, parsePrefs, PUSH_CATS, pushSupported, shouldAsk } from '../../src/social/push';
import { API_OPS, cleanApiArgs } from '../../src/embed/api';

// SHARE-PUSH.md §2: when the game asks for notifications, what it stores, where web push is offered at all.

const NOW = 1_800_000_000_000;
const base = { won: true, session: 2, supported: true, perm: 'default' as const, prefs: defaultPrefs(), now: NOW };

describe('the notifications card', () => {
  it('asks after a win from the second launch on, never on the first launch or after a loss', () => {
    expect(shouldAsk(base)).toBe(true);
    expect(shouldAsk({ ...base, session: 1 })).toBe(false);
    expect(shouldAsk({ ...base, won: false })).toBe(false);
  });
  it('never when unsupported, already decided in the browser, or already on', () => {
    expect(shouldAsk({ ...base, supported: false })).toBe(false);
    expect(shouldAsk({ ...base, perm: 'denied' })).toBe(false);
    expect(shouldAsk({ ...base, perm: 'granted' })).toBe(false);
    expect(shouldAsk({ ...base, prefs: { ...defaultPrefs(), on: true } })).toBe(false);
  });
  it('"Not now" waits a week, and two asks are the most', () => {
    expect(shouldAsk({ ...base, prefs: { ...defaultPrefs(), asks: 1, lastAsk: NOW - 86_400_000 } })).toBe(false);
    expect(shouldAsk({ ...base, prefs: { ...defaultPrefs(), asks: 1, lastAsk: NOW - ASK_AGAIN_MS } })).toBe(true);
    expect(shouldAsk({ ...base, prefs: { ...defaultPrefs(), asks: MAX_ASKS, lastAsk: 0 } })).toBe(false);
  });
});

describe('push prefs', () => {
  it('all categories on by default; stored values are cleaned', () => {
    expect(defaultPrefs()).toEqual({ v: 1, on: false, cats: [...PUSH_CATS], asks: 0, lastAsk: 0, endpoint: null });
    expect(parsePrefs({ on: true, cats: ['nap', 'bogus', 'invite'], asks: -3, lastAsk: 'x', endpoint: 5 })).toEqual({ v: 1, on: true, cats: ['invite', 'nap'], asks: 0, lastAsk: 0, endpoint: null });
    expect(parsePrefs(null)).toEqual(defaultPrefs());
  });
  it('decodes the base64url server key', () => {
    expect([...keyBytes('BAEC')]).toEqual([4, 1, 2]);
    expect(keyBytes('A'.repeat(87)).length).toBe(65);
  });
  it('web push is never offered in the app shells or without PushManager', () => {
    const nav = { serviceWorker: {} };
    const ok = { isSecureContext: true, navigator: nav, PushManager: function () {}, Notification: function () {} };
    expect(pushSupported(ok)).toBe(true);
    expect(pushSupported({ ...ok, Capacitor: { isNativePlatform: () => true } })).toBe(false);
    expect(pushSupported({ ...ok, PushManager: undefined })).toBe(false);
    expect(pushSupported({ ...ok, isSecureContext: false })).toBe(false);
    expect(pushSupported(undefined)).toBe(false);
  });
  it('the API ops carry the subscription (a long endpoint passes, nothing else may be that long)', () => {
    expect(API_OPS).toEqual(expect.arrayContaining(['push.key', 'push.subscribe', 'push.prefs', 'push.off']));
    const endpoint = `https://fcm.googleapis.com/fcm/send/${'x'.repeat(400)}`;
    expect(cleanApiArgs({ endpoint, pushKey: 'B'.repeat(87), pushAuth: 'A'.repeat(22), cats: 'invite,club', tz: -120 })).toEqual({ endpoint, pushKey: 'B'.repeat(87), pushAuth: 'A'.repeat(22), cats: 'invite,club', tz: -120 });
    expect(cleanApiArgs({ endpoint: 'x'.repeat(1001), name: 'x'.repeat(400) })).toEqual({});
  });
});
