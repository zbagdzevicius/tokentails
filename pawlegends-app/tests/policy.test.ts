/**
 * The force-update policy (docs/plans/moba/FORCE-UPDATE.md §3): the shared decision (shared/client-policy.ts, the
 * copy the shell bundles), the signed policy.json (signed by the publish script, verified here as the shell does), the
 * hedged fetch (API, then the signed mirror, then nothing) and the offline rule over the kept answer.
 */
import { describe, expect, it } from 'vitest';
import { generateKeys, signPolicy, spkiPem } from '../scripts/lib/capgo-crypto.mjs';
import {
  canonicalPolicy,
  clientPolicyQueryString,
  decidePolicy,
  parseClientPolicyAnswer,
  parseClientPolicyQuery,
  parsePolicyFile,
  type ClientPolicyAnswer,
  type PolicyChannelEntry,
  type PolicyFile,
} from '@/shared-contracts/client-policy';
import { fetchPolicy, offlineVerdict, POLICY_KEYS, verifiedPolicyFile, type PolicyDeps } from '../src/shell/policy';
import type { KV } from '../src/shell/ota';

const keys = generateKeys() as { privatePem: string; publicPem: string };
const PEM = spkiPem(keys.publicPem) as string;
const NOW = Date.parse('2026-11-14T12:00:00Z');

const entry = (over: Partial<PolicyChannelEntry> = {}): PolicyChannelEntry => ({
  version: '20261114000348-d4e754c',
  seq: 20261114000348,
  simVersion: 26,
  minNative: '1.0.0',
  rollback: false,
  requiredFrom: '2026-11-14T06:00:00Z',
  ...over,
});

function policy(over: Record<string, unknown> = {}): Record<string, unknown> {
  const p: Record<string, unknown> = {
    schema: 1,
    kind: 'policy',
    platform: 'ios',
    compat: 2,
    minCompat: 2,
    minSim: 26,
    channels: { stable: entry(), beta: entry({ version: '20261114031325-9c5c82e', seq: 20261114031325, simVersion: 27, requiredFrom: '2026-11-14T03:14:00Z' }) },
    store: 'https://apps.apple.com/app/id6832032981',
    web: 'https://pawlegends.app/play',
    maintenance: null,
    issuedAt: '2026-11-14T06:20:00Z',
    ...over,
  };
  p.signature = signPolicy(p, keys.privatePem);
  return p;
}

const file = (over: Record<string, unknown> = {}): PolicyFile => parsePolicyFile(policy(over))!;
const SIMS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const OWN = { platform: 'ios' as const, compat: 2, channel: 'stable' as const, bundle: '20261113220028-f4b8472', seq: 20261113220028, sim: 26, native: '1.1.0' };

describe('decidePolicy: every branch', () => {
  const decide = (client: Parameters<typeof decidePolicy>[0]['client'], f: PolicyFile | null = file(), acceptedSims: number[] | null = SIMS, now = NOW) =>
    decidePolicy({ policy: f, acceptedSims, client, now });

  it('ok: the installed bundle is the channel latest', () => {
    expect(decide({ ...OWN, bundle: '20261114000348-d4e754c', seq: 20261114000348 })).toMatchObject({ action: 'ok', reason: 'current', latest: { version: '20261114000348-d4e754c' } });
  });
  it('an old client that says nothing about itself gets ok', () => {
    expect(decide({})).toMatchObject({ action: 'ok' });
    expect(decide({}, null, null)).toMatchObject({ action: 'ok', latest: null });
  });
  it('update: a newer bundle on its channel that is required by now (older-bundle)', () => {
    expect(decide(OWN)).toMatchObject({ action: 'update', reason: 'older-bundle', latest: { version: '20261114000348-d4e754c', simVersion: 26 } });
    // beta (and dev, which follows beta) read the beta entry
    expect(decide({ ...OWN, channel: 'beta' })).toMatchObject({ action: 'update', latest: { version: '20261114031325-9c5c82e' } });
    expect(decide({ ...OWN, channel: 'dev' })).toMatchObject({ action: 'update', latest: { version: '20261114031325-9c5c82e' } });
  });
  it('a grace period keeps a newer bundle optional until requiredFrom (ok with latest)', () => {
    const f = file({ channels: { stable: entry({ requiredFrom: '2026-11-15T00:00:00Z' }) } });
    expect(decide(OWN, f)).toMatchObject({ action: 'ok', latest: { version: '20261114000348-d4e754c' } });
    expect(decide(OWN, f, SIMS, Date.parse('2026-11-15T00:00:01Z'))).toMatchObject({ action: 'update' });
  });
  it('a new sim ignores the grace: sim below the floor updates at once (sim-too-old)', () => {
    const f = file({ minSim: 27, channels: { stable: entry({ simVersion: 27, requiredFrom: '2026-11-20T00:00:00Z' }) } });
    expect(decide(OWN, f)).toMatchObject({ action: 'update', reason: 'sim-too-old' });
  });
  it('the backend no longer replays the sim: update (sim-not-accepted), or store when no bundle fixes it', () => {
    expect(decide({ ...OWN, sim: 9 })).toMatchObject({ action: 'update', reason: 'sim-not-accepted' });
    // the channel latest IS the installed bundle: nothing to download, only the store helps
    expect(decide({ ...OWN, sim: 9, bundle: '20261114000348-d4e754c' })).toMatchObject({ action: 'store', reason: 'sim-not-accepted' });
    // the backend floor wins over a lower policy floor
    expect(decide({ ...OWN, sim: 12 }, file({ minSim: 10 }), [20, 26])).toMatchObject({ action: 'update', reason: 'sim-not-accepted' });
  });
  it('rollback: a rollback entry moves phones DOWN to it, even from a newer seq', () => {
    const f = file({ channels: { stable: entry({ version: '20261110123949-cfc4fb7', seq: 20261110123949, rollback: true }) } });
    expect(decide({ ...OWN, bundle: '20261114000348-d4e754c', seq: 20261114000348 }, f)).toMatchObject({ action: 'update', reason: 'rollback', latest: { version: '20261110123949-cfc4fb7' } });
    // a non-rollback older entry never downgrades
    const g = file({ channels: { stable: entry({ version: '20261110123949-cfc4fb7', seq: 20261110123949 }) } });
    expect(decide({ ...OWN, bundle: '20261114000348-d4e754c', seq: 20261114000348 }, g)).toMatchObject({ action: 'ok' });
  });
  it('store: the native shell is too old for the required bundle (native-too-old)', () => {
    const f = file({ channels: { stable: entry({ minNative: '1.2.0' }) } });
    expect(decide(OWN, f)).toMatchObject({ action: 'store', reason: 'native-too-old' });
    expect(decide({ ...OWN, sim: 9 }, f)).toMatchObject({ action: 'store', reason: 'native-too-old' });
    expect(decide({ ...OWN, native: '1.2.0' }, f)).toMatchObject({ action: 'update' });
  });
  it('store: a retired native compat level (compat-retired)', () => {
    expect(decide({ ...OWN, compat: 1 })).toMatchObject({ action: 'store', reason: 'compat-retired' });
    expect(decide({ ...OWN, compat: 2 }, file({ minCompat: 3 }))).toMatchObject({ action: 'store', reason: 'compat-retired' });
  });
  it('maintenance: on until `until`, then the normal decision', () => {
    const f = file({ maintenance: { message: 'Moving servers', until: '2026-11-14T13:00:00Z' } });
    expect(decide(OWN, f)).toMatchObject({ action: 'maintenance', reason: 'maintenance' });
    expect(decide(OWN, f, SIMS, Date.parse('2026-11-14T13:00:01Z'))).toMatchObject({ action: 'update' });
    expect(decide(OWN, file({ maintenance: { message: 'x', until: null } }))).toMatchObject({ action: 'maintenance' });
  });
  it('web: the version.json entry decides; a sim the backend refuses always reloads', () => {
    const latest = entry({ version: 'abc1234', seq: 0, simVersion: 27, requiredFrom: new Date(0).toISOString() });
    expect(decidePolicy({ policy: null, latest, acceptedSims: SIMS, client: { platform: 'web', bundle: 'abc1234', sim: 27 }, now: NOW })).toMatchObject({ action: 'ok' });
    expect(decidePolicy({ policy: null, latest, acceptedSims: SIMS, client: { platform: 'web', bundle: 'old0001', sim: 27 }, now: NOW })).toMatchObject({ action: 'update', reason: 'older-bundle' });
    expect(decidePolicy({ policy: null, latest: null, acceptedSims: SIMS, client: { platform: 'web', bundle: 'old0001', sim: 9 }, now: NOW })).toMatchObject({ action: 'update', reason: 'sim-not-accepted' });
  });
  it('mac (no OTA, no policy file): ok, or store when the backend refuses its sim', () => {
    expect(decidePolicy({ policy: null, acceptedSims: SIMS, client: { platform: 'mac', sim: 26 }, now: NOW })).toMatchObject({ action: 'ok' });
    expect(decidePolicy({ policy: null, acceptedSims: SIMS, client: { platform: 'mac', sim: 9 }, now: NOW })).toMatchObject({ action: 'store' });
  });
});

describe('policy files and answers', () => {
  it('the publish script signs; the shell verifies (keys sorted at every depth), and rejects a tampered file', async () => {
    const raw = policy();
    expect(await verifiedPolicyFile(raw, { platform: 'ios', compat: 2 }, PEM)).not.toBeNull();
    // the same content with another key order still verifies (deep canonical form)
    const reordered = JSON.parse(JSON.stringify({ signature: raw.signature, channels: raw.channels, ...raw }));
    expect(canonicalPolicy(reordered)).toBe(canonicalPolicy(raw));
    const tampered = { ...raw, minSim: 1 };
    expect(await verifiedPolicyFile(tampered, { platform: 'ios', compat: 2 }, PEM)).toBeNull();
    // another platform's or compat's file is not this shell's
    expect(await verifiedPolicyFile(raw, { platform: 'android', compat: 2 }, PEM)).toBeNull();
    expect(await verifiedPolicyFile(raw, { platform: 'ios', compat: 1 }, PEM)).toBeNull();
  });
  it('rejects malformed files and answers', () => {
    expect(parsePolicyFile({ ...policy(), store: 'http://evil' })).toBeNull();
    expect(parsePolicyFile({ ...policy(), channels: { stable: { version: 'x' } } })).toBeNull();
    expect(parsePolicyFile({ ...policy(), kind: 'manifest' })).toBeNull();
    expect(parseClientPolicyAnswer({ schema: 1, action: 'nuke', reason: 'current' })).toBeNull();
    expect(parseClientPolicyAnswer({ schema: 1, action: 'ok', reason: 'current', latest: null, maintenance: null })).toMatchObject({ action: 'ok', retryAfterSec: 60 });
  });
  it('the query round-trips; junk is dropped, never an error', () => {
    const q = { platform: 'ios' as const, compat: 2, channel: 'beta' as const, bundle: '20261114000348-d4e754c', seq: 20261114000348, sim: 26, native: '1.1.0' };
    const parsed = parseClientPolicyQuery(Object.fromEntries(new URLSearchParams(clientPolicyQueryString(q))));
    expect(parsed).toEqual(q);
    expect(parseClientPolicyQuery({ platform: 'windows', compat: '-1', sim: 'x', bundle: '<script>', native: '1.0.0.0.0' })).toEqual({});
  });
});

// ------------------------------------------------------------------------------------------------ hedged fetch

function kv(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const answer = (over: Partial<ClientPolicyAnswer> = {}): ClientPolicyAnswer => ({
  schema: 1,
  action: 'ok',
  reason: 'current',
  latest: null,
  minSim: 26,
  acceptedSims: SIMS,
  liveSim: 27,
  store: 'https://apps.apple.com/app/id6832032981',
  web: 'https://pawlegends.app/play',
  maintenance: null,
  retryAfterSec: 60,
  checkedAt: '2026-11-14T12:00:00Z',
  ...over,
});

/** A fake clock: sleep(ms) resolves when the test advances time past it. */
function clock() {
  let t = NOW;
  const waits: { at: number; res: () => void }[] = [];
  return {
    now: () => t,
    sleep: (ms: number) => new Promise<void>((res) => waits.push({ at: t + ms, res })),
    async advance(ms: number) {
      t += ms;
      for (const w of waits.splice(0)) {
        if (w.at <= t) w.res();
        else waits.push(w);
      }
      for (let i = 0; i < 10; i++) await Promise.resolve();
    },
  };
}

function deps(o: { api?: () => Promise<unknown>; mirror?: () => Promise<unknown>; store?: ReturnType<typeof kv>; c?: ReturnType<typeof clock> }) {
  const c = o.c ?? clock();
  const calls: string[] = [];
  const d: PolicyDeps = {
    getJson: (url) => {
      calls.push(url.includes('client-policy') ? 'api' : 'mirror');
      return url.includes('client-policy') ? (o.api ?? (() => Promise.reject(new Error('down'))))() : (o.mirror ?? (() => Promise.reject(new Error('down'))))();
    },
    apiUrl: 'https://api.tokentails.com/pawlegends/client-policy',
    mirrorUrl: 'https://tokentails.com/pawlegends-app/updates/ios/2/policy.json',
    query: OWN,
    spkiPem: PEM,
    kv: o.store ?? kv(),
    now: c.now,
    sleep: c.sleep,
  };
  return { d, calls, c };
}

describe('fetchPolicy (API → signed mirror → none)', () => {
  it('the API wins when it answers; the mirror is never asked', async () => {
    const { d, calls } = deps({ api: async () => answer({ action: 'update', reason: 'older-bundle' }) });
    const out = await fetchPolicy(d);
    expect(out).toMatchObject({ source: 'api', decision: { action: 'update' } });
    expect(calls).toEqual(['api']);
    expect(JSON.parse(d.kv.getItem(POLICY_KEYS.last)!).answer.action).toBe('update');
  });
  it('API down (with the static fallback): the signed mirror decides, with the last known backend sims', async () => {
    const store = kv();
    store.m.set(POLICY_KEYS.last, JSON.stringify({ answer: answer({ acceptedSims: [26, 27] }), answerAt: NOW - 1000 }));
    const { d, calls } = deps({ mirror: async () => policy(), store });
    const out = await fetchPolicy(d);
    expect(out).toMatchObject({ source: 'mirror', decision: { action: 'update', reason: 'older-bundle' } });
    expect(calls).toEqual(['api', 'mirror']);
    expect(JSON.parse(store.m.get(POLICY_KEYS.last)!).file.kind).toBe('policy');
  });
  it('a slow API: the mirror starts after 1 s; the API times out at 2.5 s and the mirror decides', async () => {
    const c = clock();
    const { d, calls } = deps({ c, api: () => new Promise(() => undefined), mirror: async () => policy() });
    const p = fetchPolicy(d);
    await c.advance(999);
    expect(calls).toEqual(['api']);
    await c.advance(2);
    expect(calls).toEqual(['api', 'mirror']);
    await c.advance(1600);
    expect(await p).toMatchObject({ source: 'mirror' });
  });
  it('a forged mirror is ignored', async () => {
    const { d } = deps({ mirror: async () => ({ ...policy(), minSim: 99 }) });
    expect(await fetchPolicy(d)).toEqual({ source: 'none' });
  });
  it('a malformed API answer counts as down', async () => {
    const { d } = deps({ api: async () => ({ hello: 1 }), mirror: async () => policy({ channels: { stable: entry({ version: OWN.bundle, seq: OWN.seq }) } }) });
    expect(await fetchPolicy(d)).toMatchObject({ source: 'mirror', decision: { action: 'ok' } });
  });
  it('both down: none (the offline rule decides)', async () => {
    const { d } = deps({});
    expect(await fetchPolicy(d)).toEqual({ source: 'none' });
  });
});

describe('offlineVerdict (the kept answer, evaluated now)', () => {
  const q = { platform: 'ios' as const, compat: 2, sim: 26 };
  it('no cache (first launch offline): play', () => {
    expect(offlineVerdict(null, q, NOW)).toBe('play');
  });
  it('offline, accepted: the kept answer still accepts this sim → play (even if a newer bundle is required)', () => {
    expect(offlineVerdict({ answer: answer({ action: 'update' }), answerAt: NOW - 3_600_000 }, q, NOW)).toBe('play');
    expect(offlineVerdict({ file: policy(), fileAt: NOW - 3_600_000 }, q, NOW)).toBe('play');
  });
  it('offline, rejected: the backend no longer replays this sim, or the floor is above it → block', () => {
    expect(offlineVerdict({ answer: answer({ acceptedSims: [27] }), answerAt: NOW - 1000 }, q, NOW)).toBe('block');
    expect(offlineVerdict({ file: policy({ minSim: 27 }), fileAt: NOW - 1000 }, q, NOW)).toBe('block');
    expect(offlineVerdict({ file: policy({ minCompat: 3 }), fileAt: NOW - 1000 }, q, NOW)).toBe('block');
  });
  it('a kept answer older than 7 days no longer blocks', () => {
    expect(offlineVerdict({ answer: answer({ acceptedSims: [27] }), answerAt: NOW - 8 * 24 * 3_600_000 }, q, NOW)).toBe('play');
  });
});
