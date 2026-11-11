// @vitest-environment happy-dom
/**
 * Sign-in, game side: the app's in-page host channel (`window.__PL_HOST__`, embed/bridge.ts), `session.provider`,
 * the account chip on the title (ui/account.ts through the integration) and the Settings Account row.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_ACTIONS, GAME_TYPES, installBridge, NATIVE_HOST_TYPES, nativeChannel, parseSession, type HostMessage } from '../../src/embed/bridge';
import { installIntegration } from '../../src/embed/integrate';
import { freshProfile, loadProfile, resetProfileCache, saveProfile } from '../../src/meta/profile';
import { resetAppBuild, setAppBuild } from '../../src/meta/roster';
import { Entitlements } from '../../src/money/entitlements';
import { chipLabel, closeAccountPanel } from '../../src/ui/account';
import { settingsPanel } from '../../src/ui/settings';

type Msg = Record<string, unknown>;
const ENV = { ns: 'tt-pawlegends', v: 1 };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** A page like the app shell's: a Capacitor native bridge and the in-page host channel. */
function nativePage(withChannel = true) {
  const toHost: Msg[] = [];
  let receiver: ((m: unknown) => void) | null = null;
  const win = {
    parent: null as unknown,
    location: { search: '' },
    document,
    addEventListener: () => undefined,
    Capacitor: { isNativePlatform: () => true },
    ...(withChannel
      ? {
          __PL_HOST__: {
            post: (m: unknown) => void toHost.push(structuredClone(m) as Msg),
            listen: (cb: (m: unknown) => void) => {
              receiver = cb;
            },
          },
        }
      : {}),
  };
  win.parent = win;
  const send = (m: Msg): void => receiver?.({ ...ENV, ...m });
  return { win: win as unknown as Window, toHost, send };
}

afterEach(() => {
  delete document.documentElement.dataset.host;
  delete document.documentElement.dataset.embed;
  closeAccountPanel();
  resetAppBuild();
});

describe('the app shell host channel', () => {
  it('activates as a native host: nothing goes out before hello, then ready, and the host messages arrive', () => {
    const p = nativePage();
    const bridge = installBridge(p.win, 'app-test');
    expect(bridge.active).toBe(true);
    expect(bridge.kind).toBe('native');
    expect(document.documentElement.dataset.host).toBe('native');
    expect(document.documentElement.dataset.embed).toBeUndefined();
    expect(bridge.post('request-sign-in', { reason: 'save-progress' })).toBe(false);
    const got: HostMessage[] = [];
    bridge.on((m) => void got.push(m));
    p.send({ type: 'hello' });
    expect(p.toHost).toEqual([{ ...ENV, type: 'ready', version: 'app-test' }]);
    p.send({ type: 'session', signedIn: true, provider: 'apple' });
    p.send({ type: 'nonsense' });
    expect(got.map((m) => m.type)).toEqual(['hello', 'session']);
    expect(bridge.post('account', { action: 'sign-in' })).toBe(true);
    expect(p.toHost.at(-1)).toEqual({ ...ENV, type: 'account', action: 'sign-in' });
  });

  it('keeps purchases, exit, share, analytics and crash reports off the native host (the game falls back on its own)', () => {
    const p = nativePage();
    const bridge = installBridge(p.win);
    p.send({ type: 'hello' });
    const before = p.toHost.length;
    for (const t of ['purchase-intent', 'open-cat', 'offer-seen', 'champion-offer', 'skin-preview', 'notify', 'share', 'exit', 'analytics', 'client-error'] as const) {
      expect(bridge.post(t, {}), t).toBe(false);
    }
    expect(p.toHost.length).toBe(before);
    for (const t of NATIVE_HOST_TYPES) expect(GAME_TYPES).toContain(t);
  });

  it('is off outside the app, or without a channel (the game plays standalone)', () => {
    const web = nativePage();
    (web.win as unknown as { Capacitor?: unknown }).Capacitor = undefined;
    expect(nativeChannel(web.win)).toBeNull();
    expect(installBridge(web.win).active).toBe(false);
    const bare = nativePage(false);
    const b = installBridge(bare.win);
    expect(b.active).toBe(false);
    expect(b.kind).toBeNull();
    expect(nativeChannel({ Capacitor: { isNativePlatform: () => true }, __PL_HOST__: { post: 1 } })).toBeNull();
  });
});

describe('session.provider', () => {
  it('keeps google, apple or email for a signed-in player only', () => {
    expect(parseSession({ signedIn: true, provider: 'google' })).toMatchObject({ provider: 'google' });
    expect(parseSession({ signedIn: true, provider: 'facebook' })).not.toHaveProperty('provider');
    expect(parseSession({ signedIn: false, provider: 'apple' })).not.toHaveProperty('provider');
    expect(ACCOUNT_ACTIONS).toEqual(['sign-in', 'sign-out', 'manage', 'delete']);
  });
});

function harness(app = false) {
  resetProfileCache();
  setAppBuild(app);
  saveProfile({ ...freshProfile(), sessions: 2, matches: 1 });
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const posted: { type: string; payload: Msg }[] = [];
  const handlers: ((m: HostMessage) => void)[] = [];
  const ent = new Entitlements();
  const bridge = { active: true, kind: 'frame', post: (type: string, payload: Msg = {}) => (posted.push({ type, payload }), true), on: (h: (m: HostMessage) => void) => void handlers.push(h) };
  const integ = installIntegration(bridge as never, { ent, profile: loadProfile, analytics: { track: () => undefined }, onRosterChange: () => undefined, root });
  const emit = (m: Msg): void => {
    const msg = { ...ENV, ...m } as unknown as HostMessage;
    ent.apply(msg);
    handlers.forEach((h) => h(msg));
  };
  const title = (lobby = true): HTMLElement => {
    root.querySelector('.pl-screen')?.remove();
    const el = document.createElement('div');
    el.className = `pl-screen pl-title${lobby ? ' pl-lobby' : ''}`;
    el.innerHTML = `<div class="pl-title-col"><p class="sub"><span class="acct"></span></p></div><div class="${lobby ? 'pl-corner lb-corner' : 'pl-corner'}"><button data-a="settings">S</button><button data-a="mute">M</button></div>`;
    root.appendChild(el);
    integ.refresh();
    return el;
  };
  return { posted, emit, title, integ, root };
}

describe('the account chip', () => {
  beforeEach(() => closeAccountPanel());

  it('is not drawn before a host answers (the plain standalone game has no accounts)', () => {
    const h = harness();
    expect(h.title().querySelector('[data-testid="account-chip"]')).toBeNull();
    expect(h.integ.accountModel()).toBeNull();
  });

  it('signed out: "Sign in" in the corner, before Settings; a tap asks the host to sign in', () => {
    const h = harness();
    h.emit({ type: 'hello' });
    h.emit({ type: 'session', signedIn: false });
    const t = h.title();
    const chip = t.querySelector<HTMLElement>('[data-testid="account-chip"]')!;
    expect(chip.textContent).toBe('Sign in');
    expect(chip.nextElementSibling?.getAttribute('data-a')).toBe('settings');
    chip.click();
    expect(h.posted).toContainEqual({ type: 'account', payload: { action: 'sign-in' } });
    expect(t.querySelector('[data-testid="account-panel"]')).toBeNull();
    // a redraw never doubles it
    h.integ.refresh();
    expect(t.querySelectorAll('[data-testid="account-chip"]')).toHaveLength(1);
  });

  it('signed in on the web: name and method, a panel with Sign out and Manage account', () => {
    const h = harness();
    h.emit({ type: 'hello' });
    h.emit({ type: 'app', isApp: false, store: true });
    h.emit({ type: 'session', signedIn: true, name: 'Pawsome Pat', provider: 'google' });
    const t = h.title();
    const chip = t.querySelector<HTMLElement>('[data-testid="account-chip"]')!;
    expect(chip.dataset.signedIn).toBe('1');
    expect(chip.textContent).toBe('Pawsome P…');
    expect(chip.getAttribute('aria-label')).toContain('Signed in with Google as Pawsome Pat');
    chip.click();
    const panel = t.querySelector<HTMLElement>('[data-testid="account-panel"]')!;
    expect(panel.textContent).toContain('Pawsome Pat');
    expect(panel.querySelector('[data-testid="account-delete"]')).toBeNull();
    panel.querySelector<HTMLElement>('[data-testid="account-manage"]')!.click();
    expect(h.posted).toContainEqual({ type: 'account', payload: { action: 'manage' } });
    expect(t.querySelector('[data-testid="account-panel"]')).toBeNull();
    chip.click();
    t.querySelector<HTMLElement>('[data-testid="account-sign-out"]')!.click();
    expect(h.posted).toContainEqual({ type: 'account', payload: { action: 'sign-out' } });
    // the host signs out and re-sends the session: the chip follows
    h.emit({ type: 'session', signedIn: false });
    expect(t.querySelector<HTMLElement>('[data-testid="account-chip"]')!.textContent).toBe('Sign in');
  });

  it('in the app: Delete account instead of Manage account (App Store 5.1.1(v))', () => {
    const h = harness(true);
    h.emit({ type: 'hello' });
    h.emit({ type: 'app', isApp: true, store: false });
    h.emit({ type: 'session', signedIn: true, provider: 'apple' });
    const t = h.title();
    t.querySelector<HTMLElement>('[data-testid="account-chip"]')!.click();
    expect(t.querySelector('[data-testid="account-manage"]')).toBeNull();
    t.querySelector<HTMLElement>('[data-testid="account-delete"]')!.click();
    expect(h.posted).toContainEqual({ type: 'account', payload: { action: 'delete' } });
  });

  it('labels: the name cut to 10, Account without one, Sign in when signed out', () => {
    expect(chipLabel({ signedIn: false, name: 'X' })).toBe('Sign in');
    expect(chipLabel({ signedIn: true, name: null })).toBe('Account');
    expect(chipLabel({ signedIn: true, name: 'Žygis' })).toBe('Žygis');
  });
});

describe('Settings: the Account row', () => {
  const state = { muted: false, tier: 'med' as const, tipsOn: true, stats: null };
  it('shows only with a host; its actions close Settings and go to the host', () => {
    document.body.innerHTML = '';
    let closed = 0;
    const none = settingsPanel(document.body, { state, onMute: () => undefined, onTier: () => undefined, onTips: () => undefined, onStats: () => undefined, onClose: () => closed++ });
    expect(none.querySelector('[data-testid="settings-account"]')).toBeNull();
    none.remove();
    const sent: string[] = [];
    const el = settingsPanel(document.body, {
      state,
      onMute: () => undefined,
      onTier: () => undefined,
      onTips: () => undefined,
      onStats: () => undefined,
      onClose: () => closed++,
      account: { model: { signedIn: true, name: 'Pat', provider: 'email', isApp: true }, send: (a) => void sent.push(a) },
    });
    const row = el.querySelector<HTMLElement>('[data-testid="settings-account"]')!;
    expect(row.textContent).toContain('Signed in with email');
    row.querySelector<HTMLElement>('[data-testid="account-delete"]')!.click();
    expect(sent).toEqual(['delete']);
    expect(el.isConnected).toBe(false);
    expect(closed).toBe(1);
  });

  it('signed out: Sign in', async () => {
    document.body.innerHTML = '';
    const sent: string[] = [];
    const el = settingsPanel(document.body, {
      state,
      onMute: () => undefined,
      onTier: () => undefined,
      onTips: () => undefined,
      onStats: () => undefined,
      onClose: () => undefined,
      account: { model: { signedIn: false, name: null, provider: null, isApp: false }, send: (a) => void sent.push(a) },
    });
    el.querySelector<HTMLElement>('[data-testid="account-sign-in"]')!.click();
    await tick();
    expect(sent).toEqual(['sign-in']);
  });
});
