// @vitest-environment happy-dom
/// <reference types="vite/client" />
/**
 * The app's in-page host (sign-in, src/host): the same-window channel with the game's real bridge on the other end,
 * the host's answers (app, session, saves, store), the merge and claim prompts after sign-in, sign-out, the account
 * deletion with a fresh Apple code, offline play signed out, and that no purchase message is ever answered with
 * anything but a refusal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostApi } from '../src/host/api';
import { nativeCaps, platformOf, type AuthOutcome, type AuthPort, type UserSnapshot } from '../src/host/auth';
import { createChannel, NATIVE_HOST_ORIGIN } from '../src/host/channel';
import { APPLE_CLIENT_ID, startNativeHost, type NativeHost } from '../src/host/nativeHost';
import type { AskOptions, HostUi, SheetActions } from '../src/host/sheet';
import { DomHostUi, NOT_SET_UP } from '../src/host/sheet';
import { NoAuth } from '../src/host/main';
import { installBridge } from '../../pawlegends/src/embed/bridge';

type Msg = Record<string, unknown>;
const ENV = { ns: 'tt-pawlegends', v: 1 };
const flush = async (n = 6): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

const REPLAY = {
  v: 1,
  simVersion: 19,
  seed: 1234,
  hero: 'clem',
  trick: 'pounce',
  difficulty: 'easy',
  inputs: '',
  ticks: 9000,
  finalHash: 'abcdef12',
  outcome: 'won',
};

class FakeAuth implements AuthPort {
  caps = { apple: true, google: true };
  user: UserSnapshot | null = null;
  listeners = new Set<() => void>();
  guestsMade = 0;
  signedOut = 0;
  next: AuthOutcome = { kind: 'done', linked: true, provider: 'apple' };
  appleCodeValue: string | undefined = 'apple-code-1';
  set(u: UserSnapshot | null): void {
    this.user = u;
    for (const l of this.listeners) l();
  }
  current() {
    return this.user;
  }
  onChange(l: () => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  async token() {
    return this.user ? `fbtoken-${this.user.uid}` : null;
  }
  async ensureGuest(online: boolean) {
    if (this.user) return true;
    if (!online) return false;
    this.guestsMade++;
    this.set({ uid: 'guest-1', isAnonymous: true, providers: [], email: null, emailVerified: false });
    return true;
  }
  async oauth() {
    const out = this.next;
    if (out.kind === 'done' || out.kind === 'merge') this.set({ uid: 'acct-1', isAnonymous: false, providers: ['apple.com'], email: 'pat@privaterelay.appleid.com', emailVerified: true });
    return out;
  }
  async createEmail() {
    return { kind: 'verify', email: 'pat@example.com', justSent: true } as AuthOutcome;
  }
  async signInEmail() {
    this.set({ uid: 'acct-2', isAnonymous: false, providers: ['password'], email: 'pat@example.com', emailVerified: true });
    return { kind: 'done', linked: false, provider: 'email' } as AuthOutcome;
  }
  async reset() {}
  async resend() {}
  async checkVerified() {
    return true;
  }
  async linkPending() {
    return true;
  }
  async signOut() {
    this.signedOut++;
    this.set(null);
  }
  async appleCode() {
    return this.appleCodeValue;
  }
}

class FakeUi implements HostUi {
  sheets: { reason: string; actions: SheetActions }[] = [];
  asks: AskOptions[] = [];
  answers: boolean[] = [];
  toasts: string[] = [];
  errors: unknown[] = [];
  closed = 0;
  openSignIn(reason: string, actions: SheetActions) {
    this.sheets.push({ reason, actions });
  }
  busy() {}
  error(e: unknown) {
    this.errors.push(e);
  }
  message(t: string) {
    this.toasts.push(t);
  }
  verify() {}
  linkAccount() {}
  closeSheet() {
    this.closed++;
  }
  async ask(o: AskOptions) {
    this.asks.push(o);
    return this.answers.length ? this.answers.shift()! : true;
  }
  toast(t: string) {
    this.toasts.push(t);
  }
}

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

function backend(routes: Record<string, (c: Call) => { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('https://api.test', '');
    const c: Call = { method: init.method ?? 'GET', path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const route = routes[`${c.method} ${path}`];
    const r = route ? route(c) : { status: 404, body: { message: 'no route' } };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

const PROFILE = {
  name: 'Pat',
  pawlegendsCatnip: { easy: 20, normal: 0, rookie: 0, hard: 0 },
  pawlegendsMatches: { easy: 3, normal: 0, rookie: 0, hard: 0 },
  pawlegendsFastestWin: { easy: 8123, normal: 0, rookie: 0, hard: 0 },
  cats: [],
};

const defaultRoutes = (): Record<string, (c: Call) => { status: number; body?: unknown }> => ({
  'GET /pawlegends/champions': () => ({ status: 200, body: { cats: [] } }),
  'GET /pawlegends/me': () => ({ status: 200, body: { items: [], season: null } }),
  'GET /user/profile': () => ({ status: 200, body: PROFILE }),
  'POST /user/catbassadors/live': () => ({ status: 201, body: { difficulty: 'easy', outcome: 'won', catnipPaid: 0, catnipCount: 20, fastestWin: 9000 } }),
  'POST /user/guest/merge': () => ({ status: 201, body: { success: true, merged: true } }),
  'DELETE /user/me': () => ({ status: 200, body: { success: true } }),
  'POST /user/guest/session': () => ({ status: 201, body: {} }),
});

function setup(o: { online?: boolean; routes?: Record<string, (c: Call) => { status: number; body?: unknown }>; user?: UserSnapshot | null; platform?: 'ios' | 'android' | 'mac' } = {}) {
  localStorage.clear();
  const toGame: Msg[] = [];
  const channel = createChannel((fn) => void setTimeout(fn, 0));
  channel.game.listen((m) => void toGame.push(m as Msg));
  const auth = new FakeAuth();
  auth.user = o.user ?? null;
  const ui = new FakeUi();
  let online = o.online ?? true;
  const be = backend({ ...defaultRoutes(), ...(o.routes ?? {}) });
  const api = new HostApi({
    origin: 'https://api.test',
    fetch: be.fetch,
    token: () => auth.token(),
    isAccount: () => !!auth.user && !auth.user.isAnonymous,
    ensureUser: () => auth.ensureGuest(online),
  });
  const host: NativeHost = startNativeHost({ channel, auth, api, ui, platform: o.platform ?? 'ios', online: () => online, storage: null });
  const send = (m: Msg): void => channel.game.post({ ...ENV, ...m });
  const last = (type: string): Msg | undefined => [...toGame].reverse().find((m) => m.type === type);
  return { channel, toGame, auth, ui, be, host, send, last, setOnline: (v: boolean) => (online = v) };
}

let hosts: NativeHost[] = [];
const track = <T extends { host: NativeHost }>(h: T): T => (hosts.push(h.host), h);
afterEach(() => {
  for (const h of hosts) h.dispose();
  hosts = [];
  document.body.innerHTML = '';
});

describe('the channel', () => {
  it('copies messages both ways on a later task; the host sees the game as source with the fixed origin', async () => {
    const ch = createChannel();
    const got: MessageEvent[] = [];
    ch.win.addEventListener('message', (e) => void got.push(e));
    const msg = { a: { b: 1 } };
    ch.game.post(msg);
    expect(got).toHaveLength(0);
    await flush();
    expect(got[0].data).toEqual(msg);
    expect(got[0].data).not.toBe(msg);
    expect(got[0].source).toBe(ch.target());
    expect(got[0].origin).toBe(NATIVE_HOST_ORIGIN);
    const toGame: unknown[] = [];
    ch.game.listen((m) => void toGame.push(m));
    ch.target().postMessage({ x: 1 }, 'https://evil.example');
    ch.target().postMessage({ x: 2 }, NATIVE_HOST_ORIGIN);
    await flush();
    expect(toGame).toEqual([{ x: 2 }]);
  });

  it("runs the game's real bridge: hello, ready, then the app and session messages arrive in the game", async () => {
    const h = track(setup());
    // the game's bridge on a page like the app's: a Capacitor native bridge and the shell's channel
    const win = { parent: null as unknown, location: { search: '' }, document, addEventListener: () => undefined, Capacitor: { isNativePlatform: () => true }, __PL_HOST__: null as unknown };
    win.parent = win;
    // re-route the host's posts into the game's bridge: replace the test listener with the game's
    const gameChannel = { post: (m: unknown) => h.channel.game.post(m), listen: (cb: (m: unknown) => void) => h.channel.game.listen(cb) };
    win.__PL_HOST__ = gameChannel;
    const bridge = installBridge(win as unknown as Window, 'app-test');
    const seen: string[] = [];
    bridge.on((m) => void seen.push(m.type));
    await flush(10);
    expect(bridge.kind).toBe('native');
    expect(seen).toContain('hello');
    expect(seen).toContain('app');
    expect(seen).toContain('session');
    expect(h.host.bridge.ready).toBe(true);
  });
});

describe('the native host', () => {
  it('answers hello with an app that has no store, and a signed-out session; nothing is created', async () => {
    const h = track(setup());
    h.send({ type: 'ready', version: 'x' });
    await flush();
    expect(h.last('app')).toMatchObject({ isApp: true, store: false, notify: false });
    expect(h.last('session')).toMatchObject({ signedIn: false });
    expect(h.auth.guestsMade).toBe(0);
    expect(h.be.calls.map((c) => c.path)).toEqual(['/pawlegends/champions']);
  });

  it('never answers a purchase with anything but a refusal, and ignores open-cat, notify and offers', async () => {
    const h = track(setup());
    h.send({ type: 'ready', version: 'x' });
    await flush();
    const before = h.toGame.length;
    h.send({ type: 'purchase-intent', sku: 'pl_coat_clem_calico' });
    h.send({ type: 'purchase-intent', sku: 'pl_founder' });
    h.send({ type: 'open-cat', catalogId: '65a1b2c3d4e5f6a7b8c9d0e1' });
    h.send({ type: 'notify', where: 'results' });
    h.send({ type: 'offer-seen', kind: 'meet', catalogId: '65a1b2c3d4e5f6a7b8c9d0e1' });
    await flush();
    const after = h.toGame.slice(before);
    expect(after.every((m) => m.type === 'purchase-result' && m.ok === false)).toBe(true);
    expect(h.ui.sheets).toHaveLength(0);
    expect(h.be.calls.some((c) => /checkout|offer|notify/.test(c.path))).toBe(false);
  });

  it('offline and signed out: a match waits on the device, no guest is made, nothing is sent', async () => {
    const h = track(setup({ online: false }));
    h.send({ type: 'ready', version: 'x' });
    await flush();
    const calls = h.be.calls.length;
    h.send({ type: 'match-result', matchId: 'm1', replay: REPLAY, summary: {} });
    await flush(10);
    expect(h.auth.guestsMade).toBe(0);
    expect(h.be.calls.length).toBe(calls);
    expect(h.last('save-result')).toMatchObject({ matchId: 'm1', status: 'queued' });
  });

  it('online: the first match makes the guest lazily and saves through /live (428 creates the guest session once)', async () => {
    let first = true;
    const h = track(
      setup({
        routes: {
          'POST /user/catbassadors/live': () => {
            if (first) {
              first = false;
              return { status: 428, body: { code: 'GUEST_SESSION_REQUIRED' } };
            }
            return { status: 201, body: { difficulty: 'easy', outcome: 'won', catnipPaid: 20, catnipCount: 20, fastestWin: 9000 } };
          },
        },
      }),
    );
    h.send({ type: 'ready', version: 'x' });
    await flush();
    h.send({ type: 'match-result', matchId: 'm1', replay: REPLAY, summary: {} });
    await flush(20);
    expect(h.auth.guestsMade).toBe(1);
    const paths = h.be.calls.map((c) => `${c.method} ${c.path}`);
    expect(paths.filter((p) => p === 'POST /user/catbassadors/live')).toHaveLength(2);
    expect(paths).toContain('POST /user/guest/session');
    const live = h.be.calls.find((c) => c.path === '/user/catbassadors/live')!;
    expect(live.headers.accesstoken).toBe('fbtoken-guest-1');
    expect(live.body).toMatchObject({ type: 'PAWLEGENDS', platform: 'ios' });
    expect(h.last('save-result')).toMatchObject({ matchId: 'm1', status: 'saved', catnipPaid: 20 });
  });

  it('sign-in from the game: an existing account asks before merging the guest, then the session carries name and method', async () => {
    const h = track(setup({ user: { uid: 'guest-1', isAnonymous: true, providers: [], email: null, emailVerified: false } }));
    h.send({ type: 'ready', version: 'x' });
    await flush();
    h.auth.next = { kind: 'merge', guestToken: 'guesttoken', provider: 'apple' };
    h.send({ type: 'account', action: 'sign-in' });
    await flush();
    expect(h.ui.sheets).toHaveLength(1);
    h.ui.sheets[0].actions.oauth('apple');
    await flush(20);
    expect(h.ui.asks.map((a) => a.testid)).toContain('native-host-merge');
    const merge = h.be.calls.find((c) => c.path === '/user/guest/merge')!;
    expect(merge.headers['x-guest-token']).toBe('fbguesttoken');
    expect(merge.headers.accesstoken).toBe('fbtoken-acct-1');
    expect(h.last('session')).toMatchObject({ signedIn: true, name: 'Pat', provider: 'apple' });
    expect(h.ui.closed).toBeGreaterThan(0);
  });

  it('"Not now" keeps the guest progress where it is', async () => {
    const h = track(setup({ user: { uid: 'guest-1', isAnonymous: true, providers: [], email: null, emailVerified: false } }));
    h.ui.answers = [false];
    h.auth.next = { kind: 'merge', guestToken: 'guesttoken', provider: 'apple' };
    h.host.signIn('save-progress');
    h.ui.sheets[0].actions.oauth('apple');
    await flush(20);
    expect(h.be.calls.some((c) => c.path === '/user/guest/merge')).toBe(false);
  });

  it('matches played offline before any account: "Add N matches played on this device to your account?"', async () => {
    const h = track(setup({ online: false }));
    h.send({ type: 'ready', version: 'x' });
    await flush();
    h.send({ type: 'match-result', matchId: 'm1', replay: REPLAY, summary: {} });
    h.send({ type: 'match-result', matchId: 'm2', replay: { ...REPLAY, seed: 99 }, summary: {} });
    await flush(10);
    h.setOnline(true);
    h.host.signIn();
    h.ui.sheets[0].actions.email('sign-in', 'pat@example.com', 'secret1');
    await flush(30);
    const claim = h.ui.asks.find((a) => a.testid === 'native-host-claim');
    expect(claim?.text).toBe('Add 2 matches played on this device to your account?');
    expect(h.be.calls.filter((c) => c.path === '/user/catbassadors/live').every((c) => c.headers.accesstoken === 'fbtoken-acct-2')).toBe(true);
    expect(h.be.calls.filter((c) => c.path === '/user/catbassadors/live')).toHaveLength(2);
  });

  it('sign-out from the game: Firebase signs out and the game hears a signed-out session', async () => {
    const h = track(setup({ user: { uid: 'acct-1', isAnonymous: false, providers: ['google.com'], email: 'pat@example.com', emailVerified: true } }));
    h.send({ type: 'ready', version: 'x' });
    await flush(10);
    expect(h.last('session')).toMatchObject({ signedIn: true, provider: 'google' });
    h.send({ type: 'account', action: 'sign-out' });
    await flush(10);
    expect(h.auth.signedOut).toBe(1);
    expect(h.last('session')).toMatchObject({ signedIn: false });
    expect(h.last('store')).toMatchObject({ items: [], season: null });
  });

  it('delete account: last confirmation, a fresh Apple code for an Apple account, DELETE /user/me with the app client id', async () => {
    const h = track(setup({ user: { uid: 'acct-1', isAnonymous: false, providers: ['apple.com'], email: null, emailVerified: true } }));
    h.send({ type: 'ready', version: 'x' });
    await flush(10);
    h.send({ type: 'account', action: 'delete' });
    await flush(20);
    expect(h.ui.asks[0]).toMatchObject({ testid: 'native-host-delete', danger: true });
    const del = h.be.calls.find((c) => c.method === 'DELETE')!;
    expect(del.path).toBe('/user/me');
    expect(del.body).toEqual({ appleAuthorizationCode: 'apple-code-1', appleClientId: APPLE_CLIENT_ID });
    expect(APPLE_CLIENT_ID).toBe('com.tokentails.pawlegends');
    expect(h.auth.signedOut).toBe(1);
    expect(h.last('session')).toMatchObject({ signedIn: false });
  });

  it('delete account: "Keep my account" or a cancelled Apple prompt deletes nothing', async () => {
    const keep = track(setup({ user: { uid: 'acct-1', isAnonymous: false, providers: ['apple.com'], email: null, emailVerified: true } }));
    keep.ui.answers = [false];
    await expect(keep.host.deleteAccount()).resolves.toBe('cancelled');
    const cancel = track(setup({ user: { uid: 'acct-1', isAnonymous: false, providers: ['apple.com'], email: null, emailVerified: true } }));
    cancel.auth.appleCodeValue = undefined;
    await expect(cancel.host.deleteAccount()).resolves.toBe('cancelled');
    expect([...keep.be.calls, ...cancel.be.calls].some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('an email account is deleted without any Apple prompt; Android never asks Apple', async () => {
    const h = track(setup({ platform: 'android', user: { uid: 'acct-2', isAnonymous: false, providers: ['password'], email: 'pat@example.com', emailVerified: true } }));
    await expect(h.host.deleteAccount()).resolves.toBe('deleted');
    expect(h.be.calls.find((c) => c.method === 'DELETE')?.body).toEqual({});
  });
});

describe('providers per build', () => {
  it('reads the native flags: Apple on iPhone and Mac, Google on iPhone and Android, nothing without the plugin', () => {
    const w = { __PL_NATIVE_AUTH__: { apple: true, google: true } };
    expect(nativeCaps(w, 'ios', true)).toEqual({ apple: true, google: true });
    expect(nativeCaps(w, 'android', true)).toEqual({ apple: false, google: true });
    expect(nativeCaps(w, 'mac', true)).toEqual({ apple: true, google: false });
    expect(nativeCaps(w, 'ios', false)).toEqual({ apple: false, google: false });
    expect(nativeCaps({}, 'ios', true)).toEqual({ apple: false, google: false });
    expect(platformOf({ __PL_PLATFORM__: 'mac' })).toBe('mac');
    expect(platformOf({ Capacitor: { getPlatform: () => 'android' } })).toBe('android');
    expect(platformOf({})).toBe('ios');
  });

  it('the sheet says a provider is not set up instead of offering a button that would fail', () => {
    const ui = new DomHostUi(document, 'ios', { apple: true, google: false });
    ui.openSignIn('save-progress', { oauth: () => undefined, email: () => undefined, reset: async () => undefined, resend: async () => undefined, checkVerified: async () => false, closed: () => undefined });
    const sheet = document.querySelector('[data-testid="native-auth-sheet"]')!;
    const buttons = [...sheet.querySelectorAll('.plh-btn')].map((b) => b.textContent?.trim());
    expect(buttons[0]).toBe('Continue with Apple');
    expect(sheet.querySelector('[data-testid="native-auth-google"]')).toBeNull();
    expect(sheet.querySelector('[data-testid="native-auth-google-missing"]')?.textContent).toBe(NOT_SET_UP('Google'));
    const android = new DomHostUi(document, 'android', { apple: false, google: true });
    document.body.innerHTML = '';
    android.openSignIn('sign-in', { oauth: () => undefined, email: () => undefined, reset: async () => undefined, resend: async () => undefined, checkVerified: async () => false, closed: () => undefined });
    expect(document.querySelector('[data-testid="native-auth-apple"]')).toBeNull();
    expect(document.querySelector('[data-testid="native-auth-apple-missing"]')).toBeNull();
    expect(document.querySelector('.plh-btn')?.textContent?.trim()).toBe('Continue with Google');
  });

  it('the email form checks the address and the password before calling Firebase', () => {
    document.body.innerHTML = '';
    const calls: string[] = [];
    const ui = new DomHostUi(document, 'ios', { apple: true, google: true });
    ui.openSignIn('sign-in', { oauth: () => undefined, email: (tab, e) => void calls.push(`${tab}:${e}`), reset: async () => undefined, resend: async () => undefined, checkVerified: async () => false, closed: () => undefined });
    document.querySelector<HTMLElement>('[data-testid="native-auth-email"]')!.click();
    const email = document.querySelector<HTMLInputElement>('[data-testid="native-auth-email-input"]')!;
    email.value = 'not-an-email';
    document.querySelector<HTMLElement>('[data-testid="native-auth-email-submit"]')!.click();
    expect(document.querySelector('[data-testid="native-auth-message"]')?.textContent).toContain('valid email');
    document.querySelector<HTMLInputElement>('[data-testid="native-auth-email-input"]')!.value = 'pat@example.com';
    document.querySelector<HTMLInputElement>('[data-testid="native-auth-password-input"]')!.value = 'secret1';
    document.querySelector<HTMLElement>('[data-testid="native-auth-email-submit"]')!.click();
    expect(calls).toEqual(['sign-in:pat@example.com']);
  });

  it('NoAuth (Firebase could not start): the game plays signed out, sign-in fails politely', async () => {
    const a = new NoAuth();
    expect(a.current()).toBeNull();
    await expect(a.ensureGuest()).resolves.toBe(false);
    await expect(a.oauth()).resolves.toMatchObject({ kind: 'error' });
  });
});

beforeEach(() => {
  vi.useRealTimers();
});
