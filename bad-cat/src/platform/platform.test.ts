import { describe, expect, it } from 'vitest';
import { DEFAULT_CAT, SIM_VERSION, type DayRecord, type EnvInfo } from '../types';
import { createStore, type StorageLike } from './storage';
import { detectEnv, sanitizePresaleUrl, type EnvSource } from './env';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  createPlatform,
  track,
  analyticsQueue,
  clearAnalytics,
  setAnalyticsConsent,
  setAnalyticsSender,
  configureAnalytics,
  accompliceFor,
  pinkPawAdoptUrl,
  PINK_PAW_CATS,
  openPresale,
  getEntitlements,
  FREE_ENTITLEMENTS,
  CLUB_ENTITLEMENTS,
  loadCameos,
  cameosEnabled,
  pinkPawWaiting,
  pinkPawCatSpec,
  sanitizeApiUrl,
  apiUrlFor,
  sanitizePosthogKey,
  sanitizeShortUrl,
  detectAndroidChrome,
  resetAnalytics,
  flushAnalytics,
  posthogBodies,
  classifyEntry,
  linkAttribution,
  readConsent,
  swSkipReason,
  swScope,
  swUrl,
  icsText,
  icsEscape,
  icsFold,
  sanitizeProfile,
  sanitizePrefs,
  profileFor,
  editableCats,
  mergeProfileSave,
  parseTreatMeter,
  treatMeter,
  formatTreatMeter,
  qrSvg,
  parsePinkPawSnapshot,
  pinkPawSnapshot,
  loadPinkPawCats,
  stillWaiting,
  alumni,
  pinkPawBadge,
  pinkPawGuestSpecs,
  pinkPawFaceUrl,
  fridayCriminal,
  FOUND_A_HOME,
} from './index';
import { resetPinkPawCache } from './pink-paw';

function fakeLs(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('store', () => {
  it('persists under the bcd:v1: prefix', () => {
    const ls = fakeLs();
    const s = createStore(undefined, ls);
    expect(s.persistent).toBe(true);
    expect(s.set('profile', { a: 1 })).toBe(true);
    expect(ls.data.get('bcd:v1:profile')).toBe('{"a":1}');
    expect(createStore(undefined, ls).get('profile', null)).toEqual({ a: 1 });
    expect(s.keys()).toEqual(['profile']);
  });

  it('survives a throwing localStorage getter (memory, persistent false)', () => {
    const g = globalThis as Record<string, unknown>;
    const prev = Object.getOwnPropertyDescriptor(g, 'localStorage');
    Object.defineProperty(g, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: access denied');
      },
    });
    try {
      const s = createStore();
      expect(s.persistent).toBe(false);
      expect(s.set('streak', { current: 3 })).toBe(false);
      expect(s.get('streak', null)).toEqual({ current: 3 });
      expect(s.get('missing', 7)).toBe(7);
    } finally {
      if (prev) Object.defineProperty(g, 'localStorage', prev);
      else delete g.localStorage;
    }
  });

  it('survives a throwing setItem/getItem backend', () => {
    const s = createStore('bcd:v1:', throwing);
    expect(s.persistent).toBe(false);
    expect(() => s.set('x', 1)).not.toThrow();
    expect(s.get('x', 0)).toBe(1);
    expect(() => s.remove('x')).not.toThrow();
  });

  it('flips to persistent false when a write fails mid-session (quota)', () => {
    const ls = fakeLs();
    const s = createStore(undefined, ls);
    ls.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(s.set('days', { 1: 2 })).toBe(false);
    expect(s.persistent).toBe(false);
    expect(s.get('days', null)).toEqual({ 1: 2 });
  });

  it('returns the fallback for corrupt JSON and unserialisable values', () => {
    const ls = fakeLs();
    ls.data.set('bcd:v1:profile', '{nope');
    const s = createStore(undefined, ls);
    expect(s.get('profile', 'fb')).toBe('fb');
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(s.set('c', cyc)).toBe(false);
  });
});

const baseSrc: EnvSource = {
  ua: '',
  platform: '',
  maxTouchPoints: 0,
  touchEvent: false,
  dev: false,
  qa: false,
  presaleRaw: undefined,
  webcodecs: false,
  audioEncoder: false,
  canShareFiles: false,
};

describe('env', () => {
  const ua = {
    tiktok: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_32.5.0 BytedanceWebview/d8a21c6',
    tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 trill_320005 BytedanceWebview/d8a21c6',
    instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 307.0.0.34.111',
    facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.0]',
    ipados: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  };
  it('detects the three in-app browsers', () => {
    expect(detectEnv({ ...baseSrc, ua: ua.tiktok }).inApp).toBe('tiktok');
    expect(detectEnv({ ...baseSrc, ua: ua.tiktokAndroid }).inApp).toBe('tiktok');
    expect(detectEnv({ ...baseSrc, ua: ua.instagram }).inApp).toBe('instagram');
    expect(detectEnv({ ...baseSrc, ua: ua.facebook }).inApp).toBe('facebook');
    expect(detectEnv({ ...baseSrc, ua: ua.chromeAndroid }).inApp).toBe('none');
  });
  it('detects iOS incl. iPadOS posing as a Mac, but not a desktop Mac', () => {
    expect(detectEnv({ ...baseSrc, ua: ua.ipados, platform: 'MacIntel', maxTouchPoints: 5 }).isIOS).toBe(true);
    expect(detectEnv({ ...baseSrc, ua: ua.ipados, platform: 'MacIntel', maxTouchPoints: 0 }).isIOS).toBe(false);
    expect(detectEnv({ ...baseSrc, ua: ua.instagram }).isIOS).toBe(true);
    const a = detectEnv({ ...baseSrc, ua: ua.chromeAndroid, maxTouchPoints: 5 });
    expect(a.isAndroid && a.isTouch && !a.isIOS).toBe(true);
  });
  it('presale URL is null when unset or not https', () => {
    expect(sanitizePresaleUrl(undefined)).toBeNull();
    expect(sanitizePresaleUrl('')).toBeNull();
    expect(sanitizePresaleUrl('http://buy.stripe.com/x')).toBeNull();
    expect(sanitizePresaleUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizePresaleUrl('not a url')).toBeNull();
    expect(sanitizePresaleUrl(' https://buy.stripe.com/test_abc ')).toBe('https://buy.stripe.com/test_abc');
    expect(detectEnv({ ...baseSrc, presaleRaw: 'https://buy.stripe.com/x' }).presaleUrl).toBe('https://buy.stripe.com/x');
  });
  it('detectEnv() on Node does not throw', () => {
    expect(() => detectEnv()).not.toThrow();
  });
});

const env = (over: Partial<EnvInfo> = {}): EnvInfo => ({ ...detectEnv(baseSrc), ...over });

describe('platform', () => {
  it('profile defaults to DEFAULT_CAT and survives corrupt saves', () => {
    const p = createPlatform({ store: createStore('t:', null), env: env() });
    expect(p.profile().cats[0]).toEqual(DEFAULT_CAT);
    p.store.set('profile', { cats: [{ name: 'Zed', pattern: 'nope', base: -5 }], active: 9 });
    const prof = p.profile();
    expect(prof.cats[0].name).toBe('Zed');
    expect(prof.cats[0].pattern).toBe(DEFAULT_CAT.pattern);
    expect(prof.active).toBe(0);
  });

  it('day records prune to the newest 400', () => {
    const p = createPlatform({ store: createStore('t:', fakeLs()), env: env() });
    const rec: DayRecord = { score: 10, stamp: 'clean', rank: 'Menace', shared: false };
    for (let d = 1; d <= 405; d++) p.saveDayRecord(d, { ...rec, score: d });
    const days = p.store.get<Record<string, DayRecord>>('days', {});
    expect(Object.keys(days).length).toBe(400);
    expect(p.dayRecord(5)).toBeNull();
    expect(p.dayRecord(6)?.score).toBe(6);
    expect(p.dayRecord(405)?.score).toBe(405);
    // pre-launch preview days are kept apart from the launch-day records
    expect(p.saveDayRecord(0, rec)).toBe(true);
    expect(p.dayRecord(0)?.score).toBe(10);
    expect(p.store.get<Record<string, DayRecord>>('days', {})['0']).toBeUndefined();
    expect(p.saveDayRecord(1.5, rec)).toBe(false);
  });

  it('presaleUrl comes from env; vibrate never throws', () => {
    expect(createPlatform({ store: createStore('t:', null), env: env() }).presaleUrl()).toBeNull();
    const p = createPlatform({ store: createStore('t:', null), env: env({ presaleUrl: 'https://buy.stripe.com/x' }) });
    expect(p.presaleUrl()).toBe('https://buy.stripe.com/x');
    expect(() => p.vibrate(20)).not.toThrow();
  });

  it('entitlements are free', () => {
    expect(getEntitlements()).toMatchObject({ club: false, maxCats: 1, freezesPerWeek: 1 });
  });
});

describe('analytics', () => {
  it('queues locally and sends nothing without consent + endpoint', () => {
    resetAnalytics(); // earlier createPlatform calls set common props
    clearAnalytics();
    const sent: unknown[] = [];
    setAnalyticsSender((b) => sent.push(...b));
    track('bc_boot', { a: 1, bad: NaN as unknown as number });
    expect(analyticsQueue()).toHaveLength(1);
    expect(analyticsQueue()[0].props).toEqual({ a: 1 });
    setAnalyticsConsent(true);
    expect(sent).toHaveLength(0); // no endpoint
    configureAnalytics({ endpoint: 'https://eu.example.test/batch' });
    setAnalyticsConsent(true);
    expect(sent).toHaveLength(1);
    setAnalyticsConsent(false);
    configureAnalytics({ endpoint: null });
    setAnalyticsSender(null);
    clearAnalytics();
  });
});

describe('pink paw + checkout', () => {
  it('rotates the accomplice by dayNo and builds adopt links', () => {
    expect(accompliceFor(1)?.id).toBe(PINK_PAW_CATS[0].id);
    expect(accompliceFor(1 + PINK_PAW_CATS.length)?.id).toBe(PINK_PAW_CATS[0].id);
    expect(accompliceFor(1, PINK_PAW_CATS[3].id)?.id).toBe(PINK_PAW_CATS[3].id);
    expect(pinkPawAdoptUrl(PINK_PAW_CATS[0])).toBe(`https://tokentails.com/cats/${PINK_PAW_CATS[0].id}`);
  });
  it('openPresale is a no-op without an https link', () => {
    const opened: string[] = [];
    const win = { open: (u: string) => (opened.push(u), {}) };
    expect(openPresale(null, { win })).toBe(false);
    expect(openPresale('http://x', { win })).toBe(false);
    expect(openPresale('https://buy.stripe.com/x', { win })).toBe(true);
    expect(opened).toEqual(['https://buy.stripe.com/x']);
  });
});

// ---------------------------------------------------------------------------------------------
// FULL build (W1-PLATFORM)
// ---------------------------------------------------------------------------------------------

describe('env config (FULL build)', () => {
  it('no config and no host: offline, no analytics', () => {
    const e = detectEnv(baseSrc);
    expect(e).toMatchObject({ apiUrl: null, posthogKey: null, shortUrl: 'tokentails.com/badcat', isAndroidChrome: false });
    expect(e).not.toHaveProperty('clubUi');
    expect(e).not.toHaveProperty('studioAllowed');
  });
  it('on tokentails.com the production API is the default; VITE_BADCAT_API_URL overrides it', () => {
    expect(detectEnv({ ...baseSrc, host: 'tokentails.com' }).apiUrl).toBe('https://api.tokentails.com');
    expect(detectEnv({ ...baseSrc, host: 'WWW.tokentails.com' }).apiUrl).toBe('https://api.tokentails.com');
    expect(detectEnv({ ...baseSrc, host: 'tokentails.com', apiRaw: 'https://api.example.test' }).apiUrl).toBe('https://api.example.test');
    expect(detectEnv({ ...baseSrc, host: 'tokentails.com', apiRaw: 'http://evil.example' }).apiUrl).toBe('https://api.tokentails.com');
    expect(detectEnv({ ...baseSrc, host: 'localhost:5174' }).apiUrl).toBeNull();
    expect(detectEnv({ ...baseSrc, host: 'evil.example' }).apiUrl).toBeNull();
    expect(apiUrlFor(undefined, undefined)).toBeNull();
  });
  it('API URL: https origin only; http://localhost only in dev; garbage is null', () => {
    expect(sanitizeApiUrl('https://api.tokentails.com/')).toBe('https://api.tokentails.com');
    expect(sanitizeApiUrl(' https://api.tokentails.com/v1?x=1 ')).toBe('https://api.tokentails.com');
    expect(sanitizeApiUrl('http://api.tokentails.com')).toBeNull();
    expect(sanitizeApiUrl('http://localhost:3005')).toBeNull();
    expect(sanitizeApiUrl('http://localhost:3005', true)).toBe('http://localhost:3005');
    expect(sanitizeApiUrl('http://127.0.0.1:3005', true)).toBe('http://127.0.0.1:3005');
    expect(sanitizeApiUrl('http://evil.com', true)).toBeNull();
    expect(sanitizeApiUrl('https://user:pw@api.tokentails.com')).toBeNull();
    expect(sanitizeApiUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeApiUrl('not a url')).toBeNull();
    expect(sanitizeApiUrl('')).toBeNull();
    expect(detectEnv({ ...baseSrc, apiRaw: 'https://api.example.test' }).apiUrl).toBe('https://api.example.test');
  });
  it('posthog, short URL, Android Chrome', () => {
    expect(sanitizePosthogKey('phc_abcdefgh12345')).toBe('phc_abcdefgh12345');
    expect(sanitizePosthogKey('sk_live_x')).toBeNull();
    expect(sanitizePosthogKey('phc_<script>')).toBeNull();
    expect(sanitizeShortUrl('https://bad.cat/')).toBe('bad.cat');
    expect(sanitizeShortUrl('javascript:alert(1)')).toBe('tokentails.com/badcat');
    expect(detectEnv({ ...baseSrc, shortUrlRaw: 'tokentails.com/bc' }).shortUrl).toBe('tokentails.com/bc');
    const chrome = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
    expect(detectAndroidChrome(chrome)).toBe(true);
    expect(detectAndroidChrome(chrome.replace('Chrome/129.0', 'SamsungBrowser/25.0 Chrome/121.0'))).toBe(false);
    expect(detectAndroidChrome('Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36 Instagram 300')).toBe(false);
    expect(detectAndroidChrome('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120 Mobile')).toBe(false);
  });
});

function consentLs(initial?: string) {
  const m = new Map<string, string>();
  if (initial) m.set('tt-analytics-consent', initial);
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
function fetchSpy() {
  const calls: { url: string; init: { body: string; keepalive: boolean; credentials: string } }[] = [];
  const f = (url: string, init: never) => {
    calls.push({ url, init });
    return Promise.resolve({ ok: true });
  };
  return { f, calls };
}

describe('analytics: PostHog EU with consent', () => {
  it('never sends without a key, even with consent; zero network with no env', () => {
    resetAnalytics();
    const g = globalThis as { fetch?: unknown };
    const prev = g.fetch;
    let globalCalls = 0;
    g.fetch = () => {
      globalCalls++;
      return Promise.resolve({ ok: true, json: async () => ({}) });
    };
    try {
      const p = createPlatform({ store: createStore('t:', fakeLs()), env: env(), consentStorage: consentLs('granted'), href: 'https://tokentails.com/badcat/d/18?g=AA' });
      p.track('bc_boot', { load_ms: 10 });
      p.setConsent!(true);
      expect(flushAnalytics()).toBe(0);
      expect(globalCalls).toBe(0);
      expect(p.consent!()).toBe('granted');
    } finally {
      g.fetch = prev;
      resetAnalytics();
    }
  });

  it('with a key: nothing before consent; batched with common props after; denied stops it', async () => {
    resetAnalytics();
    const ls = consentLs();
    const { f, calls } = fetchSpy();
    const p = createPlatform({
      store: createStore('t:', fakeLs()),
      env: env({ posthogKey: 'phc_testkey1234', isIOS: true }),
      consentStorage: ls,
      fetch: f as never,
      href: 'https://tokentails.com/badcat/d/18?g=AAA&via=catmemes&utm_source=tiktok',
      referrer: '',
    });
    expect(p.consent!()).toBe('unset');
    p.track('bc_boot', { load_ms: 120 });
    p.track('bc_run_start', { ranked: true });
    expect(flushAnalytics()).toBe(0);
    expect(calls).toHaveLength(0);
    configureAnalytics({ common: { day_no: 18, room_id: 'kitchen-18' } });
    p.track('bc_run_end', { score: 4200, day_no: 17 });
    p.setConsent!(true);
    expect(ls.m.get('tt-analytics-consent')).toBe('granted');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://eu.i.posthog.com/capture/');
    expect(calls[0].init.keepalive).toBe(true);
    expect(calls[0].init.credentials).toBe('omit');
    const body = JSON.parse(calls[0].init.body) as { api_key: string; batch: { event: string; properties: Record<string, unknown> }[] };
    expect(body.api_key).toBe('phc_testkey1234');
    expect(body.batch.map((b) => b.event)).toEqual(['bc_boot', 'bc_run_start', 'bc_run_end']);
    const props = body.batch[2].properties;
    expect(props).toMatchObject({
      score: 4200,
      day_no: 17, // the event's own prop wins
      room_id: 'kitchen-18',
      sim_version: SIM_VERSION,
      platform: 'ios',
      entry: 'dare_link',
      via: 'catmemes',
      utm_source: 'tiktok',
      in_app_browser: 'none',
      is_first_session: true,
      $process_person_profile: false,
    });
    expect(typeof props.distinct_id).toBe('string');
    expect(body.batch[0].properties.day_no).toBeUndefined(); // queued before day_no was set
    // batched: several events in one request
    p.track('bc_share_open', { trigger: 'button' });
    p.track('bc_share_action', { artifact: 'clip' });
    expect(flushAnalytics()).toBe(2);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1].init.body).batch).toHaveLength(2);
    p.setConsent!(false);
    p.track('bc_streak', { length: 3 });
    expect(flushAnalytics()).toBe(0);
    expect(calls).toHaveLength(2);
    expect(ls.m.get('tt-analytics-consent')).toBe('denied');
    resetAnalytics();
  });

  it('respects a stored grant at boot and splits big batches under the keepalive cap', () => {
    resetAnalytics();
    const { f, calls } = fetchSpy();
    createPlatform({ store: createStore('t:', fakeLs()), env: env({ posthogKey: 'phc_testkey1234' }), consentStorage: consentLs('granted'), fetch: f as never, href: '' });
    for (let i = 0; i < 19; i++) track('bc_boot', { pad: 'x'.repeat(199) });
    expect(calls).toHaveLength(0); // waits for the batch window
    track('bc_boot', { pad: 'y' });
    expect(calls).toHaveLength(1); // 20 queued: sent at once
    const bodies = posthogBodies('phc_k', 'id', Array.from({ length: 400 }, () => ({ event: 'bc_boot' as const, props: { pad: 'x'.repeat(199) }, at: 0 })));
    expect(bodies.length).toBeGreaterThan(1);
    expect(bodies.every((b) => b.length <= 56_000)).toBe(true);
    expect(bodies.reduce((a, b) => a + JSON.parse(b).batch.length, 0)).toBe(400);
    resetAnalytics();
  });

  it('entry classification', () => {
    expect(classifyEntry('https://tokentails.com/badcat/pick?e=t')).toBe('typed');
    expect(classifyEntry('https://tokentails.com/badcat/d/18')).toBe('daily_link');
    expect(classifyEntry('https://tokentails.com/badcat/d/18?g=AAA&c=BB')).toBe('dare_link');
    expect(classifyEntry('https://tokentails.com/badcat/d/18?rp=AAA&clip=1')).toBe('clip_handoff');
    expect(classifyEntry('https://tokentails.com/badcat/r?r=AgEM&n=x')).toBe('room_link');
    expect(classifyEntry('https://tokentails.com/badcat/c/Bv4LmQ?n=Mochi')).toBe('cat_link');
    expect(classifyEntry('https://example.test/index.html#d=18&g=AA')).toBe('dare_link');
    expect(classifyEntry('https://tokentails.com/badcat', '')).toBe('typed_or_direct');
    expect(classifyEntry('https://tokentails.com/badcat', 'https://t.co/')).toBe('direct');
    expect(classifyEntry('nope')).toBe('direct');
    expect(linkAttribution('https://x.test/?via=cat%20memes&utm_source=x')).toEqual({ utm_source: 'x' });
  });

  it('readConsent never throws on blocked storage', () => {
    expect(readConsent({ getItem: () => { throw new Error('blocked'); }, setItem() {} })).toBe('unset');
    expect(readConsent(null)).toBe('unset');
    expect(readConsent(consentLs('denied'))).toBe('denied');
  });
});

describe('session id + A/B arm', () => {
  it('session id is random per page load and not stored; arm is stable', () => {
    const store = createStore('t:', fakeLs());
    const a = createPlatform({ store, env: env() });
    const b = createPlatform({ store, env: env() });
    expect(a.sessionId!()).toMatch(/^[0-9a-f]{24}$/);
    expect(a.sessionId!()).toBe(a.sessionId!());
    expect(a.sessionId!()).not.toBe(b.sessionId!());
    expect(store.keys().some((k) => store.get<string>(k, '') === a.sessionId!())).toBe(false);
    const arm = a.abArm!();
    expect(['A', 'B']).toContain(arm);
    expect(b.abArm!()).toBe(arm);
    expect(b.profile().abArm).toBe(arm);
    resetAnalytics();
  });
  it('arms split roughly 50/50', () => {
    let bs = 0;
    for (let i = 0; i < 400; i++) if (createPlatform({ store: createStore('t:', null), env: env() }).abArm!() === 'B') bs++;
    expect(bs).toBeGreaterThan(140);
    expect(bs).toBeLessThan(260);
    resetAnalytics();
  });
});

describe('service worker (public/sw.js)', () => {
  const src = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  function load(href = 'https://tokentails.com/badcat-game/sw.js?v=abc123') {
    const listeners: Record<string, unknown> = {};
    const self: Record<string, unknown> = { location: { href }, addEventListener: (t: string, f: unknown) => (listeners[t] = f) };
    const ctx = vm.createContext({ self, URL, Response: class {}, caches: {}, fetch: () => undefined, Promise });
    new vm.Script(src, { filename: 'sw.js' }).runInContext(ctx);
    return { self, listeners, ctx };
  }
  it('parses as plain JS and registers install/activate/fetch', () => {
    const { listeners, ctx } = load();
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install', 'notificationclick', 'push']);
    expect((ctx as unknown as { BC_CACHE: string }).BC_CACHE).toBe('bcd-abc123');
  });
  it('shows the Phase 2 push reminder from its JSON payload', async () => {
    const { self, listeners } = load();
    const shown: { title: string; opts: { body: string; data: { url: string } } }[] = [];
    self.registration = { scope: 'https://tokentails.com/badcat/', showNotification: (title: string, opts: never) => (shown.push({ title, opts }), Promise.resolve()) };
    let wait: Promise<unknown> | null = null;
    const push = listeners.push as (e: unknown) => void;
    push({ data: { json: () => ({ title: "Today's room is open 🐾", body: 'Kitchen #5', url: 'https://tokentails.com/badcat/d/5' }) }, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(shown[0].title).toBe("Today's room is open 🐾");
    expect(shown[0].opts.body).toBe('Kitchen #5');
    expect(shown[0].opts.data.url).toBe('https://tokentails.com/badcat/d/5');
    push({ data: { json: () => { throw new Error('not json'); } }, waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(shown[1].title).toBe("Today's room is open");
  });
  it('routing table', () => {
    const { self } = load();
    const route = self.bcRoute as (u: string, s: string, m?: string, mode?: string) => string;
    const scope = 'https://tokentails.com/badcat-game/';
    const r = (p: string, m = 'GET', mode = 'cors') => route(`https://tokentails.com/badcat-game/${p}`, scope, m, mode);
    expect(r('build/index-abc.js')).toBe('cache-first');
    expect(r('build/three-xyz.js')).toBe('cache-first');
    expect(r('icon.svg')).toBe('cache-first');
    expect(r('icons/maskable.svg')).toBe('cache-first');
    expect(r('manifest.webmanifest')).toBe('cache-first');
    expect(r('')).toBe('network-first');
    expect(r('index.html')).toBe('network-first');
    expect(r('d/18.html')).toBe('network-first');
    expect(r('daily/index.json')).toBe('network-first');
    expect(r('treat-meter.json')).toBe('network-first');
    expect(r('pink-paw-cats.json')).toBe('network-first');
    expect(r('anything', 'GET', 'navigate')).toBe('network-first');
    expect(r('sw.js')).toBe('bypass');
    expect(r('build/x.js', 'POST')).toBe('bypass');
    expect(route('https://api.tokentails.com/badcat/status', scope)).toBe('bypass');
    expect(route('https://eu.i.posthog.com/capture/', scope, 'POST')).toBe('bypass');
    expect(route('https://tokentails.com/other/x.js', scope)).toBe('bypass');
    expect(load('https://x.test/sw.js').ctx.BC_CACHE).toBe('bcd-dev');
    // /badcat/ scope: pages load assets from the sw.js folder (/badcat-game/)
    const route5 = self.bcRoute as (u: string, s: string, m?: string, mode?: string, a?: string) => string;
    const pages = 'https://tokentails.com/badcat/';
    const assets = 'https://tokentails.com/badcat-game/';
    expect(route5('https://tokentails.com/badcat/d/18', pages, 'GET', 'navigate', assets)).toBe('network-first');
    expect(route5('https://tokentails.com/badcat-game/build/index-abc.js', pages, 'GET', 'cors', assets)).toBe('cache-first');
    expect(route5('https://tokentails.com/badcat-game/sw.js', pages, 'GET', 'cors', assets)).toBe('bypass');
    expect(route5('https://tokentails.com/other/x.js', pages, 'GET', 'cors', assets)).toBe('bypass');
    expect(route5('https://tokentails.com/badcat-game/build/index-abc.js', pages)).toBe('bypass');
  });
  it('service worker scope: /badcat/ pages register with the /badcat/ scope', () => {
    expect(swScope('/badcat-game/', '/badcat/d/18')).toBe('/badcat/');
    expect(swScope('/badcat-game/', '/badcat')).toBe('/badcat/');
    expect(swScope('/badcat-game/', '/badcat-game/index.html')).toBe('/badcat-game/');
    expect(swScope('./', '/badcat/d/1')).toBe('./');
    expect(swScope('/badcat-game/', undefined)).toBe('/badcat-game/');
  });
  it('registration is skipped in dev, in-app browsers and without support', () => {
    expect(swSkipReason({ dev: true, inApp: 'none' }, true)).toBe('dev');
    expect(swSkipReason({ dev: false, inApp: 'tiktok' }, true)).toBe('in-app');
    expect(swSkipReason({ dev: false, inApp: 'none' }, false)).toBe('unsupported');
    expect(swSkipReason({ dev: false, inApp: 'none' }, true)).toBeNull();
    expect(swUrl('/badcat-game/', 'abc')).toBe('/badcat-game/sw.js?v=abc');
    expect(swUrl('./', 'x y')).toBe('./sw.js?v=x%20y');
    const registered: string[] = [];
    const win = { document: { readyState: 'complete' }, navigator: { serviceWorker: { register: (u: string) => (registered.push(u), Promise.resolve()) } } };
    const p = createPlatform({ store: createStore('t:', null), env: env({ dev: false, inApp: 'none' }), win });
    p.registerServiceWorker!();
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatch(/sw\.js\?v=/);
    const p2 = createPlatform({ store: createStore('t:', null), env: env({ dev: false, inApp: 'instagram' }), win });
    p2.registerServiceWorker!();
    expect(registered).toHaveLength(1);
    resetAnalytics();
  });
});

describe('A2HS gating', () => {
  function fakeWin(standalone = false) {
    const handlers: Record<string, (e: unknown) => void> = {};
    return { handlers, addEventListener: (t: string, f: (e: unknown) => void) => (handlers[t] = f), matchMedia: () => ({ matches: standalone }) };
  }
  const rec: DayRecord = { score: 10, stamp: 'clean', rank: 'Menace', shared: false };
  it('Android: only after the 2nd daily ranked run, with the captured prompt', async () => {
    const win = fakeWin();
    const p = createPlatform({ store: createStore('t:', fakeLs()), env: env({ isAndroid: true }), win });
    p.registerServiceWorker!(); // captures beforeinstallprompt early
    let prompted = 0;
    let prevented = 0;
    win.handlers.beforeinstallprompt({ preventDefault: () => prevented++, prompt: async () => void prompted++, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    expect(prevented).toBe(1);
    expect(p.a2hs!().available).toBe(false); // 0 dailies
    p.saveDayRecord(1, rec);
    expect(p.a2hs!().available).toBe(false); // 1 daily
    p.saveDayRecord(2, rec);
    const st = p.a2hs!();
    expect(st).toMatchObject({ available: true, ios: false });
    expect(await st.prompt()).toBe(true);
    expect(prompted).toBe(1);
    expect(p.a2hs!().available).toBe(false); // installed
    resetAnalytics();
  });
  it('iOS: available after 2 dailies with the Share tip; not in in-app browsers or standalone', async () => {
    const store = createStore('t:', fakeLs());
    const p = createPlatform({ store, env: env({ isIOS: true }), win: fakeWin() });
    p.saveDayRecord(-1, rec);
    p.saveDayRecord(0, rec); // preview days count too
    const st = p.a2hs!();
    expect(st).toMatchObject({ available: true, ios: true });
    expect(await st.prompt()).toBe(false);
    expect(createPlatform({ store, env: env({ isIOS: true, inApp: 'tiktok' }), win: fakeWin() }).a2hs!().available).toBe(false);
    expect(createPlatform({ store, env: env({ isIOS: true }), win: fakeWin(true) }).a2hs!().available).toBe(false);
    resetAnalytics();
  });
  it('desktop without a prompt event: not available', () => {
    const p = createPlatform({ store: createStore('t:', fakeLs()), env: env(), win: fakeWin() });
    p.saveDayRecord(1, rec);
    p.saveDayRecord(2, rec);
    expect(p.a2hs!().available).toBe(false);
    resetAnalytics();
  });
});

describe('.ics reminder', () => {
  it('valid RFC 5545: CRLF, daily RRULE at local time, VALARM, folded lines', async () => {
    const now = new Date(2026, 10, 20, 21, 0); // after 19:30 → first one tomorrow
    const url = 'https://tokentails.com/badcat/d/5?via=averyveryveryverylongcreatorcode&utm_source=calendar&x=' + 'y'.repeat(40);
    const txt = icsText('19:30', url, { now });
    expect(txt.endsWith('\r\n')).toBe(true);
    expect(txt.replace(/\r\n/g, '').includes('\n')).toBe(false);
    const lines = txt.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('RRULE:FREQ=DAILY');
    expect(lines).toContain('DTSTART:20261121T193000');
    expect(lines).toContain('BEGIN:VALARM');
    expect(lines).toContain('END:VCALENDAR');
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(lines.some((l) => l.startsWith(' '))).toBe(true); // URL got folded
    const unfolded = txt.replace(/\r\n /g, '');
    expect(unfolded).toContain(`URL:${url}`);
    expect(icsText('07:05', 'https://x.test', { now: new Date(2026, 10, 20, 6, 0) })).toContain('DTSTART:20261120T070500');
    expect(icsText('nope', 'https://x.test', { now })).toContain('T190000');
    expect(icsEscape('a,b;c\\d\ne')).toBe(String.raw`a\,b\;c\\d\ne`);
    // multi-byte characters are never split
    const folded = icsFold('SUMMARY:' + '🐾'.repeat(40));
    for (const l of folded.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + '🐾'.repeat(40));
    const blob = createPlatform({ store: createStore('t:', null), env: env() }).icsReminder!('19:30', 'https://x.test');
    expect(blob.type).toContain('text/calendar');
    expect(await blob.text()).toContain('BEGIN:VEVENT');
    resetAnalytics();
  });
});

describe('profile (FULL build)', () => {
  it('keeps prefs, abArm, trails and lastSeenWeekly, validated', () => {
    const p = sanitizeProfile({
      cats: [{ name: 'A' }, { name: 'B' }],
      prefs: { music: 3, sfx: 0.5, master: 'x', streamer: true, captionStyle: 9, clipMusic: false, reminder: '25:00', junk: 1 },
      abArm: 'C',
      trails: [2, 'x', 7, 9],
      lastSeenWeekly: '2026-W48',
      future: { keep: true },
    });
    expect(p.prefs).toEqual({ music: 1, sfx: 0.5, streamer: true, clipMusic: false });
    expect(p.abArm).toBeUndefined();
    expect(p.trails).toEqual([2, 0]);
    expect(p.lastSeenWeekly).toBe('2026-W48');
    expect((p as unknown as { future: unknown }).future).toEqual({ keep: true });
    expect(sanitizeProfile({ prefs: { reminder: '07:45' }, abArm: 'B', lastSeenWeekly: 'w1' })).toMatchObject({ prefs: { reminder: '07:45' }, abArm: 'B' });
    expect(sanitizePrefs([1])).toBeUndefined();
  });
  it('maxCats: 1 free, 5 Club; a lapsed member keeps extras read-only with active forced to 0', () => {
    const cats = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ ...DEFAULT_CAT, name }));
    const stored = sanitizeProfile({ cats, active: 2 });
    expect(stored.cats).toHaveLength(5); // storage cap
    expect(profileFor(stored, 1).active).toBe(0);
    expect(profileFor(stored, 5).active).toBe(2);
    expect(editableCats(stored, 1)).toEqual([0]);
    // free player edits cat 0 and tries to edit extra 1 and add a 6th: only cat 0 changes
    const next = { ...stored, cats: stored.cats.map((c, i) => ({ ...c, name: `X${i}` })).concat([{ ...DEFAULT_CAT, name: 'New' }]), active: 3 };
    const merged = mergeProfileSave(stored, next, 1);
    expect(merged.cats.map((c) => c.name)).toEqual(['X0', 'B', 'C', 'D', 'E']);
    expect(merged.active).toBe(0);
    // a free player with one cat cannot add a second
    expect(mergeProfileSave(sanitizeProfile({ cats: [cats[0]] }), { ...stored }, 1).cats).toHaveLength(1);
    // Club can add up to 5 and pick any
    const club = mergeProfileSave(sanitizeProfile({ cats: [cats[0]] }), { ...stored, active: 4 }, 5);
    expect(club.cats).toHaveLength(5);
    expect(club.active).toBe(4);
    // deleting cats is allowed (shorter list)
    expect(mergeProfileSave(stored, { ...stored, cats: stored.cats.slice(1, 3) }, 1).cats.map((c) => c.name)).toEqual(['B', 'C']);
  });
  it('createPlatform applies the allowance and never deletes extras on save', () => {
    const store = createStore('t:', fakeLs());
    store.set('profile', { cats: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], active: 2 });
    const p = createPlatform({ store, env: env() });
    const prof = p.profile();
    expect(prof.cats).toHaveLength(3);
    expect(prof.active).toBe(0);
    expect(p.saveProfile({ ...prof, cats: [{ ...prof.cats[0], name: 'Mochi' }, ...prof.cats.slice(1)] })).toBe(true);
    expect(p.profile().cats.map((c) => c.name)).toEqual(['Mochi', 'B', 'C']);
    resetAnalytics();
  });
});

describe('treat meter, QR, Pink Paw data', () => {
  it('treat meter: the shipped zero example parses; fetch is same-origin static', async () => {
    const raw = JSON.parse(readFileSync(new URL('../../public/treat-meter.json', import.meta.url), 'utf8'));
    expect(parseTreatMeter(raw)).toEqual({ month: '2026-11', cents: 0, currency: 'usd', collars: 0, updated: '2026-10-16' });
    expect(parseTreatMeter({ month: 'x', cents: 1 })).toBeNull();
    expect(parseTreatMeter({ month: '2026-12', cents: -1 })).toBeNull();
    const urls: string[] = [];
    const m = await treatMeter({ base: '/badcat-game/', fetch: async (u) => (urls.push(u), { ok: true, json: async () => ({ ...raw, cents: 1240 }) }) });
    expect(urls).toEqual(['/badcat-game/treat-meter.json']);
    expect(m?.cents).toBe(1240);
    expect(formatTreatMeter(m!)).toBe('$12.40');
    expect(await treatMeter({ fetch: async () => { throw new Error('offline'); } })).toBeNull();
    expect(await treatMeter({ fetch: async () => ({ ok: false, json: async () => ({}) }) })).toBeNull();
  });
  it('QR SVG is non-empty for a save code and empty when too long', () => {
    const svg = qrSvg('BCD1z' + 'A'.repeat(600));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path d="M');
    expect(qrSvg('https://tokentails.com/badcat/d/18?g=AAAA')).toContain('viewBox');
    expect(qrSvg('Gabė 🐾')).not.toBe('');
    expect(qrSvg('x'.repeat(5000))).toBe('');
    expect(qrSvg('')).toBe('');
  });
  it('public/pink-paw-cats.json parses and matches the snapshot ids', () => {
    const raw = JSON.parse(readFileSync(new URL('../../public/pink-paw-cats.json', import.meta.url), 'utf8'));
    const parsed = parsePinkPawSnapshot(raw)!;
    expect(parsed.cats.map((c) => c.id)).toEqual(PINK_PAW_CATS.map((c) => c.id));
    expect(parsed.cats[1].base).toBe(PINK_PAW_CATS[1].base);
    expect(parsePinkPawSnapshot(pinkPawSnapshot())!.cats).toHaveLength(PINK_PAW_CATS.length);
    expect(parsePinkPawSnapshot({ cats: [{ id: 'nope' }] })).toBeNull();
  });
  it('still waiting, alumni badge, guest specs, face URLs', async () => {
    const snap = pinkPawSnapshot();
    snap.cats[0].status = 'ADOPTED';
    snap.cats[1].photo = 'pink-paw/medutis.webp';
    snap.cats[2].photo = 'https://evil.test/x.jpg';
    resetPinkPawCache();
    const live = await loadPinkPawCats({ base: '/g/', fetch: async () => ({ ok: true, json: async () => snap }) });
    expect(stillWaiting(live.cats)).toHaveLength(PINK_PAW_CATS.length - 1);
    expect(alumni(live.cats)).toEqual([{ cat: live.cats[0], badge: FOUND_A_HOME }]);
    expect(pinkPawBadge(live.cats[0])).toBe('Found a home 🏡');
    expect(pinkPawBadge(live.cats[1])).toBeNull();
    expect(pinkPawFaceUrl(live.cats[1], '/g/')).toBe('/g/pink-paw/medutis.webp');
    expect(pinkPawFaceUrl(live.cats[2])).toBeNull();
    expect(pinkPawFaceUrl(PINK_PAW_CATS[0])).toBeNull();
    const guests = pinkPawGuestSpecs(stillWaiting(live.cats));
    expect(guests[0].spec.name).toBe(live.cats[1].name);
    expect(guests[0].line).toContain('still waiting');
    expect(fridayCriminal(5)?.id).toBe(PINK_PAW_CATS[0].id);
    expect(fridayCriminal(12)?.id).toBe(PINK_PAW_CATS[1].id);
    resetPinkPawCache();
    const fallback = await loadPinkPawCats({ fetch: async () => { throw new Error('offline'); } });
    expect(fallback.cats).toHaveLength(PINK_PAW_CATS.length);
  });
  it('index keeps the money and content seam exports', () => {
    expect(typeof getEntitlements).toBe('function');
    expect(FREE_ENTITLEMENTS).toBeTruthy();
    expect(CLUB_ENTITLEMENTS).toBeTruthy();
    expect(typeof openPresale).toBe('function');
    expect(typeof loadCameos).toBe('function');
    expect(typeof cameosEnabled).toBe('function');
    expect(typeof pinkPawWaiting).toBe('function');
    expect(typeof pinkPawCatSpec).toBe('function');
    expect(PINK_PAW_CATS.length).toBeGreaterThan(0);
  });
});
