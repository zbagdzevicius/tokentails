// @vitest-environment happy-dom
/**
 * The game's PostHog path (src/analytics/posthog.ts): the consent state machine (first session after the first match,
 * framed never), the pre-consent queue kept in sessionStorage across a reload and dropped on a no, identity (one
 * `$identify` linking the anonymous id to the account code, person profiles for identified players only, a fresh
 * anonymous id on sign-out and on withdrawal), the native app gate and system props, and the crash stack hash.
 */
import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_ID_RE,
  AID_KEY,
  analyticsCountry,
  ANON_KEY,
  Analytics,
  APP_ANALYTICS_MIN_NATIVE,
  appGate,
  askConsent,
  CONSENT_KEY,
  PENDING_KEY,
  PENDING_MAX,
  systemProps,
  versionAtLeast,
} from '../../src/analytics/posthog';
import { crashCode, crashSender, stackHash } from '../../src/app/crash';

const kv = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
type Row = { event: string; properties: Record<string, unknown> };
const AID = `pl_${'ab12'.repeat(8)}`;

function make(o: { store?: ReturnType<typeof kv>; session?: ReturnType<typeof kv>; gate?: () => boolean | null; system?: () => Record<string, string>; country?: () => string | null } = {}) {
  const bodies: string[] = [];
  const store = o.store ?? kv();
  const session = o.session ?? kv();
  const a = new Analytics({
    key: 'phc_test',
    fetch: async (_u, init) => void bodies.push(String(init.body)),
    kv: store,
    session,
    setTimer: () => 0,
    now: () => 1_700_000_000_000,
    ...(o.gate ? { gate: o.gate } : {}),
    ...(o.system ? { system: o.system } : {}),
    ...(o.country ? { country: o.country } : {}),
  });
  const rows = (): Row[] => bodies.flatMap((b) => (JSON.parse(b) as { batch: Row[] }).batch);
  return { a, bodies, rows, store, session };
}

describe('consent state machine', () => {
  const o = { configured: true, consent: 'unset' as const, embedded: false, sessionNo: 1, matches: 0 };
  it('never before the first match is over; on Home after it in the first session; any Home from the second', () => {
    expect(askConsent(o)).toBe(false);
    expect(askConsent({ ...o, matches: 1 })).toBe(true);
    expect(askConsent({ ...o, sessionNo: 2 })).toBe(true);
    expect(askConsent({ ...o, sessionNo: 2, matches: 7 })).toBe(true);
  });
  it('never framed (the host asks), never answered, never without a key', () => {
    expect(askConsent({ ...o, matches: 1, embedded: true })).toBe(false);
    expect(askConsent({ ...o, matches: 1, consent: 'granted' })).toBe(false);
    expect(askConsent({ ...o, matches: 1, consent: 'denied' })).toBe(false);
    expect(askConsent({ ...o, matches: 1, configured: false })).toBe(false);
  });
  it('unset holds, yes sends and is stored, Settings off withdraws, Settings on sends again', () => {
    const { a, rows, store } = make();
    a.track('match_start', { hero: 'clem' });
    expect(a.live).toBe(false);
    expect(rows()).toHaveLength(0);
    a.setConsent(true);
    expect(store.m.get(CONSENT_KEY)).toBe('granted');
    expect(rows().map((r) => r.event)).toEqual(['match_start']);
    a.setConsent(false);
    expect(store.m.get(CONSENT_KEY)).toBe('denied');
    a.track('match_end');
    a.flush();
    expect(rows()).toHaveLength(1);
    a.setConsent(true);
    a.track('match_end');
    a.flush();
    expect(rows().map((r) => r.event)).toEqual(['match_start', 'match_end']);
  });
});

describe('the pre-consent queue (first session)', () => {
  it('survives a reload in the same tab and goes out after a later yes, in order', () => {
    const store = kv();
    const session = kv();
    const first = make({ store, session });
    first.a.track('title_view', { first_time: true });
    first.a.track('match_start', { hero: 'clem' });
    first.a.track('match_end', { hero: 'clem', won: true });
    expect(first.rows()).toHaveLength(0);
    expect(JSON.parse(session.m.get(PENDING_KEY)!)).toHaveLength(3);
    // a reload: a new page, the same tab
    const second = make({ store, session });
    expect(second.a.pending().map((e) => e.event)).toEqual(['title_view', 'match_start', 'match_end']);
    second.a.track('title_view', { first_time: false });
    second.a.setConsent(true);
    expect(second.rows().map((r) => r.event)).toEqual(['title_view', 'match_start', 'match_end', 'title_view']);
    expect(second.rows()[0].properties.first_time).toBe(true);
    // sent: nothing is kept for the next page
    expect(session.m.get(PENDING_KEY) || '').toBe('');
    expect(make({ store, session }).a.pending()).toHaveLength(0);
  });
  it('No thanks drops the stored events, and a later page never sends them', () => {
    const store = kv();
    const session = kv();
    const first = make({ store, session });
    first.a.track('match_start', { hero: 'clem' });
    first.a.setConsent(false);
    expect(session.m.get(PENDING_KEY) || '').toBe('');
    const second = make({ store, session });
    expect(second.a.pending()).toHaveLength(0);
    second.a.track('match_end');
    second.a.flush();
    expect(second.rows()).toHaveLength(0);
  });
  it('keeps at most PENDING_MAX events, drops junk rows, and never props outside the allowlist', () => {
    const session = kv();
    const { a } = make({ session });
    for (let i = 0; i < PENDING_MAX + 30; i++) a.track('perf_sample', { i });
    expect(JSON.parse(session.m.get(PENDING_KEY)!)).toHaveLength(PENDING_MAX);
    session.m.set(PENDING_KEY, JSON.stringify([{ event: 'match_start', props: { hero: 'clem', email: { x: 1 } }, at: 1 }, { event: 'BAD EVENT', props: {}, at: 1 }, 7, null]));
    const b = make({ session });
    expect(b.a.pending()).toEqual([{ event: 'match_start', props: { hero: 'clem' }, at: 1 }]);
  });
  it('a stored yes (the other tab, Settings) sends what a reload restored with the next batch', () => {
    const store = kv();
    const session = kv();
    make({ store, session }).a.track('title_view');
    store.m.set(CONSENT_KEY, 'granted');
    let timers = 0;
    const b = new Analytics({ key: 'phc_test', fetch: async () => undefined, kv: store, session, setTimer: () => ++timers });
    expect(b.pending().map((e) => e.event)).toEqual(['title_view']);
    expect(timers).toBe(1);
    b.flush();
    expect(b.sent).toBe(1);
  });
});

describe('identity', () => {
  it('anonymous events make no person profile; identify links the anonymous id once and later events carry the code', () => {
    const { a, rows, store } = make();
    a.setConsent(true);
    a.track('title_view');
    a.flush();
    const anon = rows()[0].properties.distinct_id as string;
    expect(anon).toMatch(/^[a-z0-9]{12,40}$/);
    expect(rows()[0].properties.$process_person_profile).toBe(false);
    expect(rows()[0].properties.$geoip_disable).toBe(true);
    a.identify(AID);
    a.track('match_start');
    a.flush();
    const [ident, start] = rows().slice(1);
    expect(ident).toMatchObject({ event: '$identify', properties: { distinct_id: AID, $anon_distinct_id: anon, $process_person_profile: true } });
    expect(start.properties).toMatchObject({ distinct_id: AID, $process_person_profile: true });
    expect(store.m.get(AID_KEY)).toBe(`${AID}:${anon}`);
    // the same account again (every session message): no second $identify
    a.identify(AID);
    a.track('match_end');
    a.flush();
    expect(rows().filter((r) => r.event === '$identify')).toHaveLength(1);
  });
  it('a restart with a stored yes and link starts under the account code, without linking again', () => {
    const store = kv();
    const one = make({ store });
    one.a.setConsent(true);
    one.a.identify(AID);
    one.a.track('title_view');
    one.a.flush();
    const two = make({ store });
    expect(two.a.accountId).toBe(AID);
    two.a.track('title_view');
    two.a.flush();
    expect(two.rows().map((r) => [r.event, r.properties.distinct_id])).toEqual([['title_view', AID]]);
  });
  it('sign-out: what was tracked under the account goes, then a fresh anonymous id', () => {
    const { a, rows, store } = make();
    a.setConsent(true);
    a.identify(AID);
    a.track('title_view');
    a.flush();
    const anon = rows()[0].properties.$anon_distinct_id;
    a.track('match_start');
    a.reset();
    expect(a.accountId).toBeNull();
    expect(rows().at(-1)).toMatchObject({ event: 'match_start', properties: { distinct_id: AID } });
    a.track('title_view');
    a.flush();
    const after = rows().at(-1)!;
    expect(after.properties.distinct_id).not.toBe(anon);
    expect(after.properties.distinct_id).not.toBe(AID);
    expect(after.properties.$process_person_profile).toBe(false);
    expect(store.m.get(AID_KEY)).toBe('');
  });
  it('withdrawal forgets the anonymous id and the link; opting in again links a new anonymous id', () => {
    const { a, rows, store } = make();
    a.setConsent(true);
    a.identify(AID);
    a.flush();
    const anon1 = rows()[0].properties.$anon_distinct_id;
    a.setConsent(false);
    expect(store.m.get(ANON_KEY)).toBe('');
    expect(store.m.get(AID_KEY)).toBe('');
    a.setConsent(true);
    const relink = rows().at(-1)!;
    expect(relink.event).toBe('$identify');
    expect(relink.properties.$anon_distinct_id).not.toBe(anon1);
  });
  it('only a pl_ code of 32 hex is ever an identity (never a uid or an email)', () => {
    const { a } = make();
    for (const bad of ['firebase-uid-123', 'pat@example.com', 'pl_XYZ', `pl_${'a'.repeat(31)}`]) {
      a.identify(bad);
      expect(a.accountId).toBeNull();
    }
    expect(ACCOUNT_ID_RE.test(AID)).toBe(true);
  });
  it('framed, the host identifies: identify and reset do nothing and $identify is never relayed', () => {
    const relayed: string[] = [];
    const a = new Analytics({ key: null, kv: kv(), session: kv(), setTimer: () => 0, relay: (e) => (relayed.push(e), true) });
    a.identify(AID);
    a.track('title_view');
    a.reset();
    expect(relayed).toEqual(['title_view']);
    expect(a.accountId).toBeNull();
  });
});

describe('the native app', () => {
  it('gates on the native version that declares analytics in its store labels (never an older binary over OTA)', () => {
    expect(APP_ANALYTICS_MIN_NATIVE).toBe('1.2.0');
    expect(appGate(null, undefined)).toBe(true);
    expect(appGate('ios', undefined)).toBeNull();
    expect(appGate('ios', '1.1.1')).toBe(false);
    expect(appGate('android', '1.2.0')).toBe(true);
    expect(appGate('mac', '1.10.0')).toBe(true);
    expect(versionAtLeast('2', '1.2.0')).toBe(true);
    expect(versionAtLeast('junk', '1.2.0')).toBe(false);
  });
  it('an older binary is inert: no settings row, no prompt, nothing queued or sent', () => {
    const { a, rows, session } = make({ gate: () => false });
    expect(a.configured).toBe(false);
    a.track('title_view');
    a.setConsent(true);
    a.flush();
    expect(rows()).toHaveLength(0);
    expect(a.pending()).toHaveLength(0);
    expect(session.m.get(PENDING_KEY)).toBeUndefined();
  });
  it('waits while the shell has not said its version, then sends', () => {
    let gate: boolean | null = null;
    const { a, rows } = make({ gate: () => gate });
    a.setConsent(true);
    a.track('title_view');
    a.flush();
    expect(rows()).toHaveLength(0);
    expect(a.configured).toBe(false);
    gate = true;
    a.flush();
    expect(rows().map((r) => r.event)).toEqual(['title_view']);
  });
  it('system props: OS, app version and build, OTA bundle, platform; never an ad or device id', () => {
    const sys = systemProps('ios', { native: '1.2.0', nativeBuild: '42', ota: '20261119-abc1234' }, 'abc1234');
    expect(sys).toEqual({ platform: 'ios', $os: 'iOS', $device_type: 'Mobile', $app_version: '1.2.0', $app_build: '42', ota_bundle: '20261119-abc1234', $lib_version: 'abc1234' });
    expect(systemProps(null, null)).toEqual({ platform: 'web' });
    const { a, rows } = make({ system: () => sys });
    a.setConsent(true);
    a.track('title_view', { platform: 'spoof' });
    a.flush();
    expect(rows()[0].properties).toMatchObject({ $os: 'iOS', $app_version: '1.2.0', ota_bundle: '20261119-abc1234' });
    expect(JSON.stringify(rows())).not.toMatch(/idfa|advertising|gaid/i);
  });
});

describe('country (POSTHOG-PRIVACY.md: GeoIP off, our own coarse country)', () => {
  it('every event carries the ISO country with GeoIP still off; an identified person gets it as $set', () => {
    const { a, rows } = make({ country: () => 'LT' });
    a.setConsent(true);
    a.track('title_view');
    a.flush();
    const [anon] = rows();
    expect(anon.properties).toMatchObject({ country: 'LT', $geoip_disable: true, $process_person_profile: false });
    // no person for an anonymous player
    expect(anon.properties.$set).toBeUndefined();
    a.identify(AID);
    a.track('match_start');
    a.flush();
    const [ident, start] = rows().slice(1);
    expect(ident.event).toBe('$identify');
    expect(ident.properties).toMatchObject({ country: 'LT', $set: { country: 'LT' } });
    expect(start.properties).toMatchObject({ country: 'LT', $set: { country: 'LT' }, $geoip_disable: true });
    // never an address of any kind
    expect(JSON.stringify(rows())).not.toMatch(/\$ip|\d+\.\d+\.\d+\.\d+/);
  });

  it('read at flush time: events queued before the country arrived carry it', () => {
    let cc: string | null = null;
    const { a, rows } = make({ country: () => cc });
    a.track('title_view');
    cc = 'DE';
    a.setConsent(true);
    expect(rows()[0].properties.country).toBe('DE');
  });

  it('unknown, junk or a throwing source: no country at all (never a guess), and an event prop cannot fake one', () => {
    for (const src of [() => null, () => 'XX', () => 'T1', () => 'lt', () => 'LTU', () => { throw new Error('x'); }]) {
      const { a, rows } = make({ country: src as () => string | null });
      a.setConsent(true);
      a.track('title_view', { country: 'FR' });
      a.flush();
      expect(rows()).toHaveLength(1);
      expect('country' in rows()[0].properties).toBe(false);
      expect(rows()[0].properties.$set).toBeUndefined();
    }
    expect(analyticsCountry('LT')).toBe('LT');
    expect(analyticsCountry(undefined)).toBeNull();
  });
});

describe('app_error stack hash', () => {
  const err = (stack: string) => Object.assign(new Error('boom at 3'), { stack });
  it('same frames, same hash, whatever the origin, path or query; different frames differ', () => {
    const a = err('Error: boom\n    at hit (https://pawlegends.app/pawlegends-game/build/match-ab12.js?v=9:10:20)\n    at tick (https://pawlegends.app/pawlegends-game/build/index-cd34.js:5:6)');
    const b = err('Error: boom\n    at hit (capacitor://localhost/build/match-ab12.js:10:20)\n    at tick (capacitor://localhost/build/index-cd34.js:5:6)');
    const c = err('Error: boom\n    at miss (capacitor://localhost/build/match-ab12.js:11:20)');
    expect(stackHash(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(stackHash(a)).toBe(stackHash(b));
    expect(stackHash(a)).not.toBe(stackHash(c));
    // no usable stack: the crash code's hash
    expect(stackHash('plain text')).toBe(stackHash('plain text'));
    expect(crashCode('A@b.c')).not.toContain('@');
  });
  it('rides app_error as stack_hash; nothing after a no', () => {
    const tracked: Record<string, unknown>[] = [];
    let consent: 'granted' | 'denied' | 'unset' = 'granted';
    const hook = crashSender({ consent: () => consent, post: () => false, track: (p) => void tracked.push({ ...p }), flush: () => undefined, context: () => ({ screen: 'title', tier: 'high', sim: 1 }) });
    hook('window', 'boom', 'deadbeef');
    hook('window', 'boom', 'not-a-hash');
    consent = 'denied';
    hook('window', 'boom', 'deadbeef');
    expect(tracked).toEqual([
      { source: 'window', msg: 'boom', screen: 'title', tier: 'high', sim: 1, stack_hash: 'deadbeef' },
      { source: 'window', msg: 'boom', screen: 'title', tier: 'high', sim: 1 },
    ]);
  });
});
