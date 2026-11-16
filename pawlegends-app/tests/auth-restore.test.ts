/**
 * Session restore on a cold start (the "logged out after closing the app" bug): Firebase reads the saved user from
 * IndexedDB asynchronously, and `signInAnonymously` replaces a signed-in account with a new guest. Nothing may make a
 * guest, or send a request, before the restore has finished.
 */
import { describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({ anonymous: 0 }));
vi.mock('firebase/app', () => ({ getApps: () => [], getApp: () => ({}), initializeApp: () => ({}) }));
vi.mock('firebase/auth', () => ({
  indexedDBLocalPersistence: {},
  initializeAuth: () => ({}),
  onIdTokenChanged: () => () => undefined,
  signOut: async () => undefined,
  signInAnonymously: async (auth: FakeFirebaseAuth) => {
    fb.anonymous++;
    auth.currentUser = user('guest-new', true);
  },
}));
vi.mock('@capacitor-firebase/authentication', () => ({ FirebaseAuthentication: {} }));
vi.mock('@/context/auth/link', () => ({}));
vi.mock('@/context/auth/lastMethod', () => ({ methodFromProviders: () => null, readLastMethod: () => null }));

import { NativeAuth } from '../src/host/auth';
import { HostApi } from '../src/host/api';

type FbUser = { uid: string; isAnonymous: boolean; providerData: { providerId: string }[]; email: string | null; emailVerified: boolean; getIdToken(): Promise<string> };
const user = (uid: string, isAnonymous = false): FbUser => ({
  uid,
  isAnonymous,
  providerData: isAnonymous ? [] : [{ providerId: 'google.com' }],
  email: null,
  emailVerified: true,
  getIdToken: async () => `id-${uid}`,
});

/** The Firebase `Auth` as the SDK behaves after a cold start: no user until IndexedDB is read. */
class FakeFirebaseAuth {
  currentUser: FbUser | null = null;
  private done!: () => void;
  private readonly restoredP = new Promise<void>((r) => (this.done = r));
  authStateReady(): Promise<void> {
    return this.restoredP;
  }
  restore(saved: FbUser | null): void {
    this.currentUser = saved;
    this.done();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('cold start session restore', () => {
  it('a guest request before the restore waits and uses the saved account (no new guest)', async () => {
    fb.anonymous = 0;
    const fa = new FakeFirebaseAuth();
    const auth = new NativeAuth(fa as never, { apple: false, google: false });
    const made = auth.ensureGuest(true);
    const token = auth.token();
    await tick();
    fa.restore(user('acct-1'));
    await expect(made).resolves.toBe(true);
    await expect(token).resolves.toBe('fbid-acct-1');
    expect(fb.anonymous).toBe(0);
    expect(auth.current()?.uid).toBe('acct-1');
  });

  it('with nothing saved, the lazy guest is still made once, after the restore', async () => {
    fb.anonymous = 0;
    const fa = new FakeFirebaseAuth();
    const auth = new NativeAuth(fa as never, { apple: false, google: false });
    const a = auth.ensureGuest(true);
    const b = auth.ensureGuest(true);
    await tick();
    expect(fb.anonymous).toBe(0);
    fa.restore(null);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(fb.anonymous).toBe(1);
  });

  it('a restored guest keeps its uid (and its progress)', async () => {
    fb.anonymous = 0;
    const fa = new FakeFirebaseAuth();
    const auth = new NativeAuth(fa as never, { apple: false, google: false });
    const made = auth.ensureGuest(true);
    fa.restore(user('guest-old', true));
    await expect(made).resolves.toBe(true);
    expect(fb.anonymous).toBe(0);
    await expect(auth.token()).resolves.toBe('fbid-guest-old');
  });

  it('HostApi: an account call before the restore is sent with the restored token instead of a 401', async () => {
    const fa = new FakeFirebaseAuth();
    const auth = new NativeAuth(fa as never, { apple: false, google: false });
    const headers: string[] = [];
    const api = new HostApi({
      origin: 'https://api.test',
      fetch: (async (_url: string, init: RequestInit) => {
        headers.push(String((init.headers as Record<string, string>).accesstoken));
        return { status: 200, json: async () => ({}), headers: { get: () => null } } as unknown as Response;
      }) as typeof fetch,
      ready: () => auth.ready(),
      token: () => auth.token(),
      isAccount: () => !!auth.current() && !auth.current()!.isAnonymous,
      ensureUser: () => auth.ensureGuest(true),
    });
    const call = api.call('GET', '/user/me', { auth: 'account' });
    await tick();
    fa.restore(user('acct-1'));
    await expect(call).resolves.toMatchObject({ status: 200 });
    expect(headers).toEqual(['fbid-acct-1']);
  });
});
