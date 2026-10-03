import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENT_AREAS } from '../../shared-contracts/analytics-core';
import { captureUrl, CONSENT_STORAGE_KEY, createHeistAnalytics, type StorageLike } from '..';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function store(initial: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function setup(consent: string | null, apiKey = 'phc_test') {
  const local = store(consent ? { [CONSENT_STORAGE_KEY]: consent } : {});
  const sent: Array<{ url: string; body: Record<string, unknown> }> = [];
  const analytics = createHeistAnalytics({
    apiKey,
    localStorage: local,
    sessionStorage: store(),
    transport: (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
      return true;
    },
    superProperties: { embed: true },
  });
  return { analytics, sent, local };
}

describe('Heist analytics (F9 mirror)', () => {
  it('sends nothing until consent is granted, and stops when it is revoked', () => {
    for (const consent of [null, 'unset', 'denied']) {
      const { analytics, sent } = setup(consent);
      expect(analytics.track('heist_run_complete', { level: 'heist-01', outcome: 'win' })).toBe(false);
      expect(sent).toHaveLength(0);
    }
    const { analytics, sent, local } = setup('granted');
    expect(analytics.track('heist_run_complete', { level: 'heist-01', outcome: 'win', stars: 3 })).toBe(true);
    local.map.set(CONSENT_STORAGE_KEY, 'denied');
    expect(analytics.track('heist_run_complete', { level: 'heist-01', outcome: 'fail' })).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('sends catalog names to the EU host with no person profile and scrubbed flat properties', () => {
    const { analytics, sent } = setup('granted');
    analytics.track('heist_open', { from: 'standalone jane@example.com' });
    expect(sent[0].url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(ANALYTICS_EVENT_AREAS[sent[0].body.event as 'heist_open']).toBe('heist');
    expect(sent[0].body.properties).toMatchObject({ from: 'standalone [email]', app: 'heist', embed: true, $process_person_profile: false });
    expect(String(sent[0].body.distinct_id)).toMatch(/^heist-/);
  });

  it('sends nothing without a key, refuses events the Heist does not own, and dedupes heist_open', () => {
    expect(setup('granted', '').analytics.track('heist_open', { from: 'x' })).toBe(false);
    const { analytics, sent } = setup('granted');
    expect(analytics.track('heist_save' as never, { status: 'ok' } as never)).toBe(false);
    expect(analytics.trackOnce('heist_open', { from: 'standalone' })).toBe(true);
    expect(analytics.trackOnce('heist_open', { from: 'standalone' })).toBe(false);
    expect(sent).toHaveLength(1);
    expect(captureUrl('https://ph.example/')).toBe('https://ph.example/i/v0/e/');
  });
});

describe('Heist first-run funnel (G10, mode heist)', () => {
  it('sends the run events only with consent, all from the catalog runs area', async () => {
    const { HEIST_RUN_EVENTS, HEIST_SENDABLE_EVENTS } = await import('..');
    expect([...HEIST_RUN_EVENTS].sort()).toEqual(['ftue_first_clear', 'ftue_gate_shown', 'ftue_hint_done', 'ftue_hint_shown', 'game_fail', 'game_finish', 'game_start', 'life_lost']);
    for (const name of HEIST_RUN_EVENTS) {
      expect(ANALYTICS_EVENT_AREAS[name]).toBe('runs');
      expect(HEIST_SENDABLE_EVENTS).toContain(name);
    }
    for (const consent of [null, 'unset', 'denied']) {
      const { analytics, sent } = setup(consent);
      expect(analytics.track('ftue_gate_shown', { mode: 'heist', level: 'heist-01', gate: 'brief' })).toBe(false);
      expect(analytics.track('life_lost', { mode: 'heist', level: 'heist-01', spotted: 1, rewind_offered: true })).toBe(false);
      expect(sent).toHaveLength(0);
    }
    const { analytics, sent } = setup('granted');
    expect(analytics.track('ftue_hint_shown', { mode: 'heist', level: 'heist-01', hint: 'route', trigger: 'idle' })).toBe(true);
    expect(
      analytics.track('ftue_first_clear', { mode: 'heist', level: 'heist-01', duration_s: 150.2, elapsed_s: 211, spotted: 0, rewinds: 1, route_shown: true }),
    ).toBe(true);
    expect(sent.map((s) => s.body.event)).toEqual(['ftue_hint_shown', 'ftue_first_clear']);
    expect(sent[1].body.properties).toMatchObject({ mode: 'heist', level: 'heist-01', elapsed_s: 211, app: 'heist', $process_person_profile: false });
  });

  it('is wired only through main.ts, behind the replay/verify build gate (App imports the type only)', () => {
    const app = readFileSync(join(srcDir, 'app', 'App.ts'), 'utf8');
    expect(app).toMatch(/import type \{[^}]*HeistAnalytics[^}]*\} from '\.\.\/analytics'/);
    expect(app).not.toMatch(/^import \{[^}]*\} from '\.\.\/analytics'/m);
    expect(app).not.toMatch(/import\('\.\.\/analytics'\)/);
    const main = readFileSync(join(srcDir, 'main.ts'), 'utf8');
    expect(main).toMatch(/if \(!CRASH_FALLBACK_BUILD\) return null;\s*try \{\s*const \{ createHeistAnalytics/);
    expect(main).toMatch(/\n\s+analytics,\n/);
  });
});
