import { describe, expect, it, vi } from 'vitest';
import {
  CONSENT_KEY,
  CRASH_COPY,
  CRASH_MAX_PER_SESSION,
  HEARTBEAT_STALL_MS,
  OVERLAY_ID,
  buildCrashPayload,
  createCrashReporter,
  installCrashGuard,
  posthogSender,
  sameOrigin,
  scrub,
  showCrashOverlay,
  type CrashPayload,
  type DocumentLike,
  type StorageLike,
  type WindowLike,
} from '../crash';

// A small fake DOM: enough for the overlay, under vitest's node environment.
class FakeEl {
  id = '';
  textContent: string | null = null;
  attrs: Record<string, string> = {};
  children: FakeEl[] = [];
  listeners: Record<string, Array<() => void>> = {};
  focused = false;
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  appendChild(child: FakeEl) { this.children.push(child); return child; }
  addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
  focus() { this.focused = true; }
  click() { this.listeners.click?.forEach((fn) => fn()); }
  text(): string { return (this.textContent ?? '') + this.children.filter((c) => c.tag !== 'style').map((c) => c.text()).join(''); }
  find(pred: (el: FakeEl) => boolean): FakeEl | null {
    if (pred(this)) return this;
    for (const c of this.children) { const hit = c.find(pred); if (hit) return hit; }
    return null;
  }
}

function fakeDoc() {
  const body = new FakeEl('body');
  const doc = {
    body,
    createElement: (tag: string) => new FakeEl(tag),
    getElementById: (id: string) => body.find((el) => el.id === id),
  };
  return { doc: doc as unknown as DocumentLike, body };
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

type Handler = (event: unknown) => void;
function fakeWin(origin = 'https://tokentails.com') {
  const handlers: Record<string, Handler[]> = {};
  const reload = vi.fn();
  const u = new URL(origin);
  const win = {
    location: { protocol: u.protocol, host: u.host, href: `${origin}/heist/`, pathname: '/heist/', reload },
    addEventListener: (type: string, fn: Handler) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type: string, fn: Handler) => { handlers[type] = (handlers[type] ?? []).filter((h) => h !== fn); },
  };
  const fire = (type: string, event: unknown) => (handlers[type] ?? []).forEach((fn) => fn(event));
  return { win: win as unknown as WindowLike, fire, reload, handlers };
}

const FAKE_SEED = `S${'A'.repeat(55)}`;

describe('showCrashOverlay', () => {
  it('makes the heist UI behind it inert and keeps Tab on RELOAD', () => {
    const { doc, body } = fakeDoc();
    const app = new FakeEl('div');
    app.id = 'app';
    body.appendChild(app);
    const overlay = showCrashOverlay(doc, vi.fn()) as unknown as FakeEl;
    expect(app.attrs.inert).toBe('');
    expect(app.attrs['aria-hidden']).toBe('true');
    expect(overlay.attrs.inert).toBeUndefined();
    const button = overlay.find((el) => el.tag === 'button')!;
    button.focused = false;
    const preventDefault = vi.fn();
    (overlay.listeners.keydown as unknown as Array<(e: unknown) => void>).forEach((fn) => fn({ key: 'Tab', preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(button.focused).toBe(true);
  });

  it('renders the night fallback with RELOAD, focused, once', () => {
    const { doc, body } = fakeDoc();
    const reload = vi.fn();
    const overlay = showCrashOverlay(doc, reload) as unknown as FakeEl;
    expect(overlay.id).toBe(OVERLAY_ID);
    expect(overlay.attrs.role).toBe('alertdialog');
    expect(overlay.text()).toContain(`${CRASH_COPY.title} ${CRASH_COPY.reassurance}`);
    const css = overlay.children.find((c) => c.tag === 'style')!.textContent!;
    expect(css).toContain('#0b0820');
    const button = overlay.find((el) => el.tag === 'button')!;
    expect(button.textContent).toBe('RELOAD');
    expect(button.focused).toBe(true);
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(showCrashOverlay(doc, reload)).toBe(overlay as unknown);
    expect(body.children).toHaveLength(1);
  });
});

describe('scrub', () => {
  it('removes secrets and names but keeps identifiers', () => {
    expect(scrub(`seed ${FAKE_SEED} for jane@example.com`)).toBe('seed [stellar-secret] for [email]');
    expect(scrub(`Cat 'Mister Whiskers' at /api/cat?id=5`)).toBe(`Cat '[name]' at /api/cat?[query]`);
    expect(scrub("reading 'position'")).toBe("reading 'position'");
  });

  it('removes lowercase quoted names outside a code context', () => {
    expect(scrub('Cat name "fluffy" is taken')).toBe('Cat name "[name]" is taken');
    expect(scrub("'mittens_2' rejected")).toBe("'[name]' rejected");
    expect(scrub("texture 'cat-idle' missing")).toBe("texture 'cat-idle' missing");
  });

  it('after our own code words keeps only code-shaped strings (same rules as the client)', () => {
    expect(scrub("key 'fluffy' missing")).toBe("key '[name]' missing");
    expect(scrub("texture 'fluffy'")).toBe("texture '[name]'");
    expect(scrub("event 'fluffy'")).toBe("event '[name]'");
    expect(scrub("texture 'catIdle'")).toBe("texture 'catIdle'");
    expect(scrub("atlas 'ui.close'")).toBe("atlas 'ui.close'");
  });

  it('removes hyphenated personal codes and space-grouped phone numbers', () => {
    expect(scrub('code 3800108-5718 rejected')).toBe('code [number] rejected');
    expect(scrub('call 5512 3456 now')).toBe('call [number] now');
    expect(scrub('call 612 34567 now')).toBe('call [number] now');
    expect(scrub('at a.js:1200:30 v4.0.0 on 2026-10-01')).toBe('at a.js:1200:30 v4.0.0 on 2026-10-01');
  });

  it('removes opaque tokens, did ids and IBANs but keeps bundle names', () => {
    expect(scrub('uid kX9pQ2rT7vW1yZ3aB5cD8eF0gH12 denied')).toBe('uid [token] denied');
    expect(scrub('Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG')).toBe('Bearer [token]');
    expect(scrub('user did:privy:cm3x9abc0001 missing')).toBe('user [did] missing');
    expect(scrub('pay EE382200221020145685 now')).toBe('pay [iban] now');
    expect(scrub('pay EE38 2200 2210 2014 5685 now')).toBe('pay [iban] now');
    expect(scrub('at /heist/assets/index-B4xk29QpLm7Zt1Ya.js:3:9')).toBe('at /heist/assets/index-B4xk29QpLm7Zt1Ya.js:3:9');
  });

  it('keeps stack line and column after a query', () => {
    expect(scrub('at run (/heist/game.js?v=12:10:5)')).toBe('at run (/heist/game.js?[query]:10:5)');
  });

  it('builds the app_error payload', () => {
    const e = new TypeError(`bad ${FAKE_SEED}`);
    e.stack = `TypeError: bad\n    at run (https://tokentails.com/heist/build/index.js?v=2:1:2)`;
    const p = buildCrashPayload('heist_window_error', e, 'window', { origin: 'https://tokentails.com', route: '/heist/?x=1', sessionIndex: 1 });
    expect(p).toMatchObject({ code: 'heist_window_error', source: 'window', level: 'root', error_name: 'TypeError', message: 'bad [stellar-secret]', route: '/heist/', session_index: 1, context: { app: 'heist' } });
    expect(p.stack).not.toContain('https://tokentails.com');
    expect(p.stack).not.toContain('v=2');
  });
});

describe('createCrashReporter', () => {
  const make = (consent: string | null) => {
    const send = vi.fn<(p: CrashPayload) => void>();
    const report = createCrashReporter({
      consentStorage: memoryStorage(consent ? { [CONSENT_KEY]: consent } : {}),
      sessionStorage: memoryStorage(),
      send,
    });
    return { send, report };
  };

  it('sends nothing unless tt-analytics-consent is granted', () => {
    for (const consent of [null, 'denied', 'unset']) {
      const { send, report } = make(consent);
      expect(report('a', new Error('x'), 'boot')).toBe(false);
      expect(send).not.toHaveBeenCalled();
    }
  });

  it('sends one per code and at most 5 per session', () => {
    const { send, report } = make('granted');
    expect(report('a', new Error('x'), 'boot')).toBe(true);
    expect(report('a', new Error('x'), 'boot')).toBe(false);
    for (let i = 0; i < 10; i++) report(`c${i}`, new Error('x'), 'window');
    expect(send).toHaveBeenCalledTimes(CRASH_MAX_PER_SESSION);
  });
});

describe('posthogSender', () => {
  it('does nothing without a key', () => {
    const beacon = vi.fn(() => true);
    posthogSender({ sessionStorage: memoryStorage(), beacon })(buildCrashPayload('a', 'x', 'boot'));
    expect(beacon).not.toHaveBeenCalled();
  });

  it('beacons an anonymous app_error to the capture endpoint', () => {
    const beacon = vi.fn((_url: string, _body: string) => true);
    posthogSender({ apiKey: 'phc_test', sessionStorage: memoryStorage(), beacon })(buildCrashPayload('a', 'x', 'boot'));
    const [url, body] = beacon.mock.calls[0];
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/');
    const sent = JSON.parse(body);
    expect(sent).toMatchObject({ api_key: 'phc_test', event: 'app_error', properties: { code: 'a', app: 'heist', $process_person_profile: false } });
    expect(sent.distinct_id).toMatch(/^heist-/);
  });
});

describe('installCrashGuard', () => {
  const setup = (consent: string | null, reporting = true) => {
    const { doc, body } = fakeDoc();
    const w = fakeWin();
    const send = vi.fn<(p: CrashPayload) => void>();
    const guard = installCrashGuard({
      win: w.win,
      doc,
      localStorage: memoryStorage(consent ? { [CONSENT_KEY]: consent } : {}),
      sessionStorage: memoryStorage(),
      send,
      reporting,
    });
    return { ...w, body, send, guard };
  };

  it('a boot crash shows the overlay and reports with consent', () => {
    const { body, send, guard, reload } = setup('granted');
    guard.crash(new Error('manifest 404'));
    const overlay = body.find((el) => el.id === OVERLAY_ID)!;
    expect(overlay).toBeTruthy();
    overlay.find((el) => el.tag === 'button')!.click();
    expect(reload).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'heist_boot_error', source: 'boot' }));
  });

  it('shows the overlay but reports nothing without consent', () => {
    const { body, send, guard } = setup(null);
    guard.crash(new Error('boom'));
    expect(body.find((el) => el.id === OVERLAY_ID)).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('replays show the overlay but never report', () => {
    const { send, guard } = setup('granted', false);
    guard.crash(new Error('boom'));
    expect(send).not.toHaveBeenCalled();
  });

  it('a single same-origin window error reports without ending the run; foreign ones are ignored', () => {
    const { fire, body, send } = setup('granted');
    fire('error', { filename: 'chrome-extension://x/inject.js', message: 'Script error.' });
    fire('error', { message: 'Script error.' });
    expect(send).not.toHaveBeenCalled();
    fire('error', { filename: 'https://tokentails.com/heist/build/index.js', error: new Error('once') });
    expect(body.children).toHaveLength(0);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'heist_window_error', source: 'window' }));
  });

  it('a burst of same-origin errors shows the overlay', () => {
    let t = 0;
    const { doc, body } = fakeDoc();
    const w = fakeWin();
    const send = vi.fn<(p: CrashPayload) => void>();
    installCrashGuard({
      win: w.win, doc, send, now: () => t,
      localStorage: memoryStorage({ [CONSENT_KEY]: 'granted' }), sessionStorage: memoryStorage(),
    });
    const err = { filename: 'https://tokentails.com/heist/build/index.js', error: new Error('every frame') };
    w.fire('error', err);
    t = 3000;
    w.fire('error', err);
    t = 3100;
    w.fire('error', err);
    expect(body.children).toHaveLength(0);
    t = 3200;
    w.fire('error', err);
    expect(body.find((el) => el.id === OVERLAY_ID)).toBeTruthy();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'heist_error_burst' }));
  });

  describe('frame heartbeat', () => {
    const watch = (visibility: () => DocumentVisibilityState) => {
      let t = 0;
      let tick: () => void = () => {};
      const { doc, body } = fakeDoc();
      Object.defineProperty(doc, 'visibilityState', { get: visibility });
      const guard = installCrashGuard({
        win: fakeWin().win, doc, send: vi.fn(), now: () => t,
        localStorage: null, sessionStorage: null,
        setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => { tick = () => {}; },
      });
      let frame = 0;
      guard.watch(() => frame);
      const advance = (ms: number, moving: boolean) => {
        for (let i = 0; i < ms / 1000; i++) {
          t += 1000;
          if (moving) frame = t;
          tick();
        }
      };
      return { body, advance, guard, setFrame: (n: number) => { frame = n; } };
    };

    it('stays quiet while frames arrive and before the first frame', () => {
      const { body, advance } = watch(() => 'visible');
      advance(20_000, false); // frame still 0: not started
      advance(20_000, true);
      expect(body.children).toHaveLength(0);
    });

    it('shows the overlay when frames stop on a visible page', () => {
      const { body, advance } = watch(() => 'visible');
      advance(2000, true);
      advance(HEARTBEAT_STALL_MS - 1000, false);
      expect(body.children).toHaveLength(0);
      advance(2000, false);
      expect(body.find((el) => el.id === OVERLAY_ID)).toBeTruthy();
    });

    it('does not trip while the tab is hidden', () => {
      let state: DocumentVisibilityState = 'visible';
      const { body, advance } = watch(() => state);
      advance(2000, true);
      state = 'hidden';
      advance(30_000, false);
      state = 'visible';
      advance(2000, true);
      expect(body.children).toHaveLength(0);
    });

    it('dispose stops watching', () => {
      const { body, advance, guard } = watch(() => 'visible');
      advance(2000, true);
      guard.dispose();
      advance(30_000, false);
      expect(body.children).toHaveLength(0);
    });
  });

  it('same-origin compares scheme and host, so custom schemes work', () => {
    const cap = { protocol: 'capacitor:', host: 'localhost', href: 'capacitor://localhost/heist/' };
    expect(sameOrigin('capacitor://localhost/heist/index.js', cap)).toBe(true);
    expect(sameOrigin('/heist/index.js', cap)).toBe(true);
    expect(sameOrigin('https://evil.example/x.js', cap)).toBe(false);
  });

  it('same-origin rejections report without the overlay', () => {
    const { fire, body, send } = setup('granted');
    const ours = new Error('audio');
    ours.stack = 'Error: audio\n    at play (https://tokentails.com/heist/build/index.js:1:2)';
    fire('unhandledrejection', { reason: ours });
    fire('unhandledrejection', { reason: 'plain' });
    expect(body.children).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ code: 'heist_unhandled_rejection' }));
  });

  it('dispose removes the listeners', () => {
    const { guard, handlers } = setup('granted');
    guard.dispose();
    expect(handlers.error).toHaveLength(0);
    expect(handlers.unhandledrejection).toHaveLength(0);
  });
});
