// @vitest-environment happy-dom
/**
 * One PostHog project for every Token Tails surface: the game build reads NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and
 * NEXT_PUBLIC_POSTHOG_HOST (vite.config.ts envPrefix), posts to `${host}/capture/` (US Cloud by default), and only after
 * consent. Embedded, nothing goes to PostHog from the frame: every event is relayed to the host, which sends it under its
 * own (shared) distinct id. The app build forces the token empty.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Analytics, CONSENT_KEY, POSTHOG_US_HOST, posthogCaptureUrl, posthogEnv } from '../../src/analytics/posthog';

const kv = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const recorder = () => {
  const calls: { url: string; init: RequestInit }[] = [];
  return { calls, fetch: (url: string, init: RequestInit) => (calls.push({ url, init }), Promise.resolve({ ok: true })) };
};

describe('PostHog env wiring', () => {
  it('reads the shared names, trimmed; anything else is unset', () => {
    expect(posthogEnv({ NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: ' phc_x ', NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com' })).toEqual({ key: 'phc_x', host: 'https://us.i.posthog.com' });
    expect(posthogEnv({ VITE_PAWLEGENDS_POSTHOG_KEY: 'phc_old', NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: '' })).toEqual({ key: null, host: null });
  });

  it('the capture URL comes from the host, with the US host as the fallback', () => {
    expect(POSTHOG_US_HOST).toBe('https://us.i.posthog.com');
    expect(posthogCaptureUrl('https://us.i.posthog.com')).toBe('https://us.i.posthog.com/capture/');
    expect(posthogCaptureUrl('https://eu.i.posthog.com/')).toBe('https://eu.i.posthog.com/capture/');
    for (const bad of [null, undefined, '', 'us.i.posthog.com', 'http://us.i.posthog.com', 'javascript:alert(1)']) expect(posthogCaptureUrl(bad)).toBe('https://us.i.posthog.com/capture/');
  });

  it('vite lets the PostHog pair through, and the app build keeps the shared token (consent and the native gate decide)', () => {
    const vite = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(vite).toMatch(/envPrefix:\s*\['VITE_',\s*'NEXT_PUBLIC_POSTHOG_'\]/);
    const app = readFileSync(resolve(__dirname, '../../../pawlegends-app/scripts/build-web.mjs'), 'utf8');
    expect(app).not.toMatch(/NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN:\s*''/);
    expect(readFileSync(resolve(__dirname, '../../src/analytics/posthog.ts'), 'utf8')).not.toContain('eu.i.posthog.com');
  });
});

describe('consent gating', () => {
  it('nothing leaves before consent; a yes sends the queue to the configured host with keepalive', () => {
    const f = recorder();
    const store = kv();
    const timers: (() => void)[] = [];
    const a = new Analytics({ key: 'phc_test', host: 'https://us.i.posthog.com', fetch: f.fetch, kv: store, setTimer: (fn) => timers.push(fn), common: () => ({ human: true }) });
    a.track('title_view', { first_time: true });
    a.track('match_start', { hero: 'cat', mode: 'skirmish' });
    a.flush();
    timers.forEach((t) => t());
    expect(f.calls).toHaveLength(0);
    expect(store.m.has('tt.pawlegends.anon.v1')).toBe(false);

    a.setConsent(true);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://us.i.posthog.com/capture/');
    expect(f.calls[0]!.init.keepalive).toBe(true);
    expect(f.calls[0]!.init.credentials).toBe('omit');
    const body = JSON.parse(String(f.calls[0]!.init.body)) as { api_key: string; batch: { event: string; properties: Record<string, unknown> }[] };
    expect(body.api_key).toBe('phc_test');
    expect(body.batch.map((e) => e.event)).toEqual(['title_view', 'match_start']);
    // one anonymous id across the batch, the human flag on every event, no person profile
    const ids = new Set(body.batch.map((e) => e.properties.distinct_id));
    expect(ids.size).toBe(1);
    for (const e of body.batch) {
      expect(e.properties.human).toBe(true);
      expect(e.properties.$process_person_profile).toBe(false);
    }
  });

  it('a denial drops the queue and sends nothing', () => {
    const f = recorder();
    const a = new Analytics({ key: 'phc_test', fetch: f.fetch, kv: kv(), setTimer: () => 0 });
    a.track('title_view');
    a.setConsent(false);
    a.track('match_end', { result: 'won' });
    a.flush();
    expect(f.calls).toHaveLength(0);
    expect(a.pending()).toHaveLength(0);
  });

  it('a stored yes sends to the US host when no host is configured', () => {
    const f = recorder();
    const a = new Analytics({ key: 'phc_test', fetch: f.fetch, kv: kv({ [CONSENT_KEY]: 'granted' }), setTimer: () => 0 });
    a.track('title_view');
    a.flush();
    expect(f.calls.map((c) => c.url)).toEqual(['https://us.i.posthog.com/capture/']);
  });
});

describe('identity hand-off (embedded)', () => {
  it('relays every event to the host (which sends it under the shared distinct id) and never calls PostHog itself', () => {
    const f = recorder();
    const relayed: string[] = [];
    const a = new Analytics({ key: 'phc_test', fetch: f.fetch, kv: kv({ [CONSENT_KEY]: 'granted' }), relay: (e) => (relayed.push(e), true) });
    a.track('title_view');
    a.track('chat_open', { party: false });
    a.track('settings_change', { setting: 'sound', value: false });
    a.flush();
    expect(relayed).toEqual(['title_view', 'chat_open', 'settings_change']);
    expect(f.calls).toHaveLength(0);
  });

  it('the host relays the funnel events the game sends', () => {
    const host = readFileSync(resolve(__dirname, '../../../pawlegends-web/analytics/pawlegends-events.ts'), 'utf8');
    for (const e of ['title_view', 'play_open', 'play_start', 'practice_try', 'match_start', 'match_end', 'second_match', 'mode_unlock', 'champ_unlock', 'store_open', 'checkout_start', 'store_item_granted', 'party_share', 'party_invite', 'chat_open', 'settings_change'])
      expect(host).toContain(`"${e}"`);
  });
});
