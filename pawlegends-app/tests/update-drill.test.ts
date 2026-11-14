// @vitest-environment happy-dom
/**
 * The force-update drill (docs/plans/moba/FORCE-UPDATE.md §8): the real shell modules (gate.ts, policy.ts, ota.ts,
 * manifest.ts) against a local HTTP server standing in for tokentails.com, with manifests, bundles and policy.json
 * written by the real scripts/ota-publish.mjs under a throwaway key. The native updater is emulated the way
 * @capgo/capacitor-updater checks a bundle (RSA-recovered AES key and SHA-256 checksum, before anything is unzipped),
 * and the API is a stand-in that decides exactly as GET /pawlegends/client-policy does (signed policy.json verified with
 * the OTA key, decidePolicy over the backend's accepted sims), with switches for down, offline and stale.
 *
 * One device per scenario; every scenario names the letter of the drill it covers.
 */
import { execFileSync } from 'node:child_process';
import { constants, createDecipheriv, createHash, publicDecrypt, verify } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, get as httpGet, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalPolicy,
  decidePolicy,
  effectiveMinSim,
  parseClientPolicyQuery,
  parsePolicyFile,
  type ClientPolicyAnswer,
} from '@/shared-contracts/client-policy';
import { generateKeys, signPolicy, spkiPem } from '../scripts/lib/capgo-crypto.mjs';
import * as old from './fixtures/manifest-compat1';
import { Gate, type GateResult } from '../src/shell/gate';
import { decide, parseManifest, safeToApply, verifyManifest, type BundleStamp } from '../src/shell/manifest';
import { Ota, type BundleRef, type KV, type UpdaterLike } from '../src/shell/ota';
import { fetchPolicy, offlineVerdict, readCache } from '../src/shell/policy';

const script = join(__dirname, '../scripts/ota-publish.mjs');

function utc(d: Date): number {
  const p = (n: number) => String(n).padStart(2, '0');
  return Number(`${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}

// ------------------------------------------------------------------------------------------------ the "site"

const dir = mkdtempSync(join(tmpdir(), 'pldrill-'));
const keys = generateKeys() as { privatePem: string; publicPem: string };
const other = generateKeys() as { privatePem: string; publicPem: string };
writeFileSync(join(dir, 'private.pem'), keys.privatePem);
writeFileSync(join(dir, 'public.pem'), keys.publicPem);
const updates = join(dir, 'updates');
const SPKI = spkiPem(keys.publicPem) as string;

const site = {
  offline: false,
  apiDown: false,
  staticDown: false,
  /** Serve this frozen policy.json to the API (a stale cache) instead of the live file. */
  apiStalePolicy: null as unknown,
  acceptedSims: [26, 27] as number[],
  corruptZip: null as string | null,
  tamperManifest: false,
  policyOverride: null as unknown,
  apiCalls: 0,
  apiDelayMs: 0,
};
let base = '';
let server: Server;

function apiAnswer(qs: URLSearchParams): ClientPolicyAnswer {
  const q = parseClientPolicyQuery(Object.fromEntries(qs.entries()));
  let policy = null;
  if ((q.platform === 'ios' || q.platform === 'android') && q.compat !== undefined) {
    let raw: unknown = site.apiStalePolicy;
    if (!raw) {
      try {
        raw = JSON.parse(readFileSync(join(updates, q.platform, String(q.compat), 'policy.json'), 'utf8'));
      } catch {
        raw = null;
      }
    }
    const f = parsePolicyFile(raw);
    // the backend's check (client-policy.service.ts verifiedPolicy)
    const ok =
      !!f &&
      verify('sha256', Buffer.from(canonicalPolicy(raw as object)), { key: keys.publicPem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(f.signature, 'base64'));
    policy = ok && f && f.platform === q.platform && f.compat === q.compat ? f : null;
  }
  const now = Date.now();
  const decision = decidePolicy({ policy, acceptedSims: site.acceptedSims, client: q, now });
  return {
    schema: 1,
    ...decision,
    minSim: effectiveMinSim(policy ? policy.minSim : null, site.acceptedSims),
    acceptedSims: [...site.acceptedSims],
    liveSim: Math.max(...site.acceptedSims),
    store: policy?.store ?? null,
    web: 'https://pawlegends.app/play',
    maintenance: policy?.maintenance ?? null,
    retryAfterSec: 60,
    checkedAt: new Date(now).toISOString(),
  };
}

function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (code: number, body: Buffer | string, type = 'application/json') => {
      res.writeHead(code, { 'content-type': type });
      res.end(body);
    };
    if (url.pathname === '/api/pawlegends/client-policy') {
      site.apiCalls++;
      if (site.apiDown) return send(503, '{"error":"down"}');
      const answer = apiAnswer(url.searchParams);
      if (site.apiDelayMs) return void setTimeout(() => send(200, JSON.stringify(answer)), site.apiDelayMs);
      return send(200, JSON.stringify(answer));
    }
    const prefix = '/pawlegends-app/updates/';
    if (!url.pathname.startsWith(prefix) || url.pathname.includes('..')) return send(404, 'no');
    if (site.staticDown) return send(503, 'down');
    const rel = url.pathname.slice(prefix.length);
    if (rel.endsWith('policy.json') && site.policyOverride) return send(200, JSON.stringify(site.policyOverride));
    let body: Buffer;
    try {
      body = readFileSync(join(updates, rel));
    } catch {
      return send(404, 'no');
    }
    if (site.corruptZip && rel.endsWith(`${site.corruptZip}.zip`)) {
      body = Buffer.from(body);
      body[body.length - 40] ^= 0xff;
    }
    if (site.tamperManifest && /manifest(-beta)?\.json$/.test(rel)) {
      const m = JSON.parse(body.toString('utf8'));
      m.minNative = '0.0.1';
      body = Buffer.from(JSON.stringify(m));
    }
    send(200, body, rel.endsWith('.zip') ? 'application/zip' : 'application/json');
  });
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
      r();
    }),
  );
}

/** Native HTTP (CapacitorHttp and the updater's own client): node:http, not the page's fetch. */
function nativeGet(url: string, timeoutMs = 8000): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = httpGet(url, { agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function nativeJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const r = await nativeGet(url, timeoutMs);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body.toString('utf8'));
}

// ------------------------------------------------------------------------------------------------ releases

const stamps = new Map<string, BundleStamp>();

function publish(seq: number, sim: number, ...flags: string[]): BundleStamp {
  const www = join(dir, `www-${seq}`);
  mkdirSync(www, { recursive: true });
  const stamp: BundleStamp = { version: `${seq}-abc1234`, seq, compat: 2, simVersion: sim };
  writeFileSync(join(www, 'index.html'), `<!doctype html><title>${seq}</title>`);
  writeFileSync(join(www, 'bundle.json'), JSON.stringify(stamp));
  run('--keep', '10', '--www', www, ...flags);
  stamps.set(stamp.version, stamp);
  return stamp;
}

function run(...a: string[]): string {
  return execFileSync(process.execPath, [script, ...a], {
    encoding: 'utf8',
    env: {
      ...process.env,
      OTA_PRIVATE_KEY: '',
      OTA_PRIVATE_KEY_PATH: join(dir, 'private.pem'),
      OTA_PUBLIC_KEY_PATH: join(dir, 'public.pem'),
      OTA_UPDATES_DIR: updates,
      OTA_UPDATES_URL: `${base}/pawlegends-app/updates`,
    },
  });
}

const promote = () => run('--promote', '--soak-hours', '0');

// ------------------------------------------------------------------------------------------------ the device

function memKv(): KV & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

/** The native updater, checked the way @capgo/capacitor-updater v7 checks an encrypted bundle. */
class NativeUpdater implements UpdaterLike {
  bundles = new Map<string, BundleRef>();
  next = 1;
  setTo: string | null = null;
  downloads = 0;
  async notifyAppReady() {
    return {};
  }
  async download(o: { url: string; version: string; checksum: string; sessionKey: string }): Promise<BundleRef> {
    this.downloads++;
    if (site.offline) throw new Error('offline');
    const r = await nativeGet(o.url);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const enc = r.body;
    const [ivB64, keyB64] = o.sessionKey.split(':');
    const aesKey = publicDecrypt({ key: keys.publicPem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(keyB64, 'base64'));
    let zip: Buffer;
    try {
      const d = createDecipheriv('aes-128-cbc', aesKey, Buffer.from(ivB64, 'base64'));
      zip = Buffer.concat([d.update(enc), d.final()]);
    } catch {
      throw new Error('decrypt failed');
    }
    const want = publicDecrypt({ key: keys.publicPem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(o.checksum, 'hex')).toString('hex');
    if (createHash('sha256').update(zip).digest('hex') !== want) throw new Error('checksum mismatch');
    const b = { id: `b${this.next++}`, version: o.version, status: 'success' };
    this.bundles.set(b.id, b);
    return b;
  }
  async set(o: { id: string }) {
    if (!this.bundles.has(o.id)) throw new Error('no bundle');
    this.setTo = o.id;
    return {};
  }
  async list() {
    return { bundles: [...this.bundles.values()] };
  }
  async delete(o: { id: string }) {
    this.bundles.delete(o.id);
    return {};
  }
}

interface BootResult {
  result: GateResult;
  ms: number;
  screen: string | null;
  title: string | null;
  gate: Gate;
}

class Device {
  kv = memKv();
  updater = new NativeUpdater();
  screen = 'title';
  /** Party or match started from outside (an invite) while the gate runs. */
  onPolicy: (() => void) | null = null;
  timers: (() => void)[] = [];
  constructor(public stamp: BundleStamp) {}

  private getJson = async (url: string, timeoutMs = 8000): Promise<unknown> => {
    if (site.offline) throw new Error('offline');
    return nativeJson(url, timeoutMs);
  };

  query() {
    return { platform: 'ios' as const, compat: 2, channel: 'stable' as const, bundle: this.stamp.version, seq: this.stamp.seq, sim: this.stamp.simVersion, native: '1.1.0' };
  }

  /** A cold start (or the reload after an apply) on whatever bundle the updater was set to. */
  async boot(trigger = 'boot'): Promise<BootResult> {
    if (this.updater.setTo) {
      const b = this.updater.bundles.get(this.updater.setTo)!;
      this.stamp = stamps.get(b.version)!;
      this.updater.setTo = null;
    }
    document.body.innerHTML = '<div id="app"></div>';
    document.documentElement.dataset.ready = '1';
    this.timers = [];
    const ota = new Ota({
      updater: this.updater,
      getJson: (u) => this.getJson(u),
      stamp: this.stamp,
      nativeVersion: async () => '1.1.0',
      manifestUrl: `${base}/pawlegends-app/updates/ios/2/manifest.json`,
      platform: 'ios',
      allowLocal: true,
      spkiPem: SPKI,
      kv: this.kv,
      gameState: () => ({ screen: this.screen, partyOpen: false, partySeat: false }),
      now: () => Date.now(),
      subtle: globalThis.crypto.subtle,
    });
    const booted = ota.booted();
    const gate = new Gate({
      doc: document,
      policy: async () => {
        const out = await fetchPolicy({
          getJson: this.getJson,
          apiUrl: `${base}/api/pawlegends/client-policy`,
          mirrorUrl: `${base}/pawlegends-app/updates/ios/2/policy.json`,
          query: this.query(),
          spkiPem: SPKI,
          kv: this.kv,
          now: () => Date.now(),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
          subtle: globalThis.crypto.subtle,
        });
        this.onPolicy?.();
        return out;
      },
      offline: () => offlineVerdict(readCache(this.kv), { platform: 'ios', compat: 2, sim: this.stamp.simVersion }, Date.now()),
      ota,
      ready: () => booted,
      atTitle: () => safeToApply({ screen: this.screen, partyOpen: false, partySeat: false }),
      onOk: () => undefined,
      kv: this.kv,
      now: () => Date.now(),
      // short waits run for real (the busy poll); retries and chips are kept and fired by hand
      setTimeout: (fn, ms) => (ms <= 1000 ? setTimeout(fn, ms) : void this.timers.push(fn)),
      clearTimeout: () => undefined,
      version: this.stamp.version,
      platform: 'ios',
      storeUrl: 'https://apps.apple.com/app/id6832032981',
      webUrl: 'https://pawlegends.app/play',
      openUrl: () => undefined,
    });
    const t0 = performance.now();
    const result = await gate.run(trigger);
    const el = document.getElementById('pl-gate');
    return { result, ms: performance.now() - t0, screen: el?.dataset.screen ?? null, title: el?.querySelector('h1')?.textContent ?? null, gate };
  }

  /** Boot, and follow every apply with a reload, at most `max` times (a loop shows as running out). */
  async bootUntilSettled(max = 4): Promise<BootResult[]> {
    const out: BootResult[] = [];
    for (let i = 0; i < max; i++) {
      const r = await this.boot();
      out.push(r);
      if (r.result !== 'applying') break;
    }
    return out;
  }
}

// ------------------------------------------------------------------------------------------------ the drill

const now = Date.now();
let v1: BundleStamp, v2: BundleStamp, v3: BundleStamp, v4: BundleStamp;

beforeAll(async () => {
  await startServer();
  v1 = publish(utc(new Date(now - 50 * 3_600_000)), 26);
  promote();
  v2 = publish(utc(new Date(now - 49 * 3_600_000)), 26);
  promote();
});

afterAll(() => {
  server?.close();
  rmSync(dir, { recursive: true, force: true });
});

const reset = () =>
  Object.assign(site, { offline: false, apiDown: false, staticDown: false, apiStalePolicy: null, corruptZip: null, tamperManifest: false, policyOverride: null, apiDelayMs: 0 });

describe('force-update drill', () => {
  it('(a) a compat-2 app one bundle behind updates before play, then starts once', async () => {
    reset();
    const d = new Device(v1);
    const boots = await d.bootUntilSettled();
    expect(boots.map((b) => b.result)).toEqual(['applying', 'ok']);
    expect(boots[0].screen).toBe('updating');
    expect(d.stamp.version).toBe(v2.version);
    expect(d.updater.downloads).toBe(1);
    // and the next launch neither downloads nor blocks
    const again = await d.boot();
    expect(again.result).toBe('ok');
    expect(d.updater.downloads).toBe(1);
  });

  it('(b) up to date: the gate settles well under 1 s and never shows', async () => {
    reset();
    const d = new Device(v2);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await d.boot();
      expect(r.result).toBe('ok');
      expect(document.getElementById('pl-gate')).toBeNull();
      times.push(r.ms);
    }
    expect(Math.max(...times)).toBeLessThan(1000);
    // a slow API (900 ms): still answered by the API, the mirror is never needed
    site.apiDelayMs = 900;
    const calls = site.apiCalls;
    const slow = await d.boot();
    expect(site.apiCalls - calls).toBe(1);
    expect(slow.result).toBe('ok');
    expect(slow.ms).toBeLessThan(1500);
  });

  it('(c) offline with an accepted bundle: plays with a notice', async () => {
    reset();
    const d = new Device(v1);
    // one earlier online answer is kept on the device (accepted sims 26, 27)
    await fetchPolicy({ getJson: (u) => nativeJson(u), apiUrl: `${base}/api/pawlegends/client-policy`, mirrorUrl: null, query: d.query(), spkiPem: SPKI, kv: d.kv, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    site.offline = true;
    const r = await d.boot();
    expect(r.result).toBe('offline-play');
    expect(document.getElementById('pl-gate')).toBeNull();
    expect(document.getElementById('pl-gate-chip')?.textContent).toContain('Offline');
    // a first launch offline (nothing kept) also plays
    const fresh = new Device(v1);
    expect((await fresh.boot()).result).toBe('offline-play');
  });

  it('(d) offline with a rejected bundle: a retry screen (no crash, no loop), freed once back online', async () => {
    reset();
    v3 = publish(utc(new Date(now - 48 * 3_600_000)), 27);
    promote();
    site.acceptedSims = [27];
    const d = new Device(v2);
    await fetchPolicy({ getJson: (u) => nativeJson(u), apiUrl: `${base}/api/pawlegends/client-policy`, mirrorUrl: null, query: d.query(), spkiPem: SPKI, kv: d.kv, now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
    site.offline = true;
    const r = await d.boot();
    expect(r.result).toBe('blocked:offline');
    expect(r.title).toBe("Can't reach the update server");
    expect(d.timers.length).toBe(1);
    // still offline: the scheduled retry keeps the screen, with one timer (backoff), not a spin
    d.timers.shift()!();
    await new Promise((res) => setTimeout(res, 50));
    expect(document.getElementById('pl-gate')?.dataset.screen).toBe('offline');
    // back online: the next retry installs v3
    site.offline = false;
    await new Promise((res) => setTimeout(res, 50));
    const res = await r.gate.run('retry');
    expect(res).toBe('applying');
    const after = await d.boot();
    expect(after.result).toBe('ok');
    expect(d.stamp.version).toBe(v3.version);
    site.acceptedSims = [26, 27];
  });

  it('(e) API down, signed static policy reachable: decides from the mirror and updates', async () => {
    reset();
    site.apiDown = true;
    const d = new Device(v2);
    const boots = await d.bootUntilSettled();
    expect(boots.map((b) => b.result)).toEqual(['applying', 'ok']);
    expect(d.stamp.version).toBe(v3.version);
    // API and mirror both down, nothing kept: plays (never bricked)
    site.staticDown = true;
    const e = new Device(v2);
    expect((await e.boot()).result).toBe('offline-play');
  });

  it('(e2) a policy.json signed by another key or edited is ignored (no signature bypass)', async () => {
    reset();
    site.apiDown = true;
    const good = JSON.parse(readFileSync(join(updates, 'ios/2/policy.json'), 'utf8'));
    // forged: maintenance forever, signed by a key that is not the OTA key
    const forged = { ...good, maintenance: { message: 'pwned', until: null }, issuedAt: new Date().toISOString() };
    delete forged.signature;
    forged.signature = signPolicy(forged, other.privatePem);
    site.policyOverride = forged;
    const d = new Device(v3);
    const r = await d.boot();
    expect(r.result).toBe('offline-play');
    // edited after signing (the real signature, a changed field)
    site.policyOverride = { ...good, maintenance: { message: 'pwned', until: null } };
    expect((await new Device(v3).boot()).result).toBe('offline-play');
  });

  it('(f) a corrupted bundle is refused and the old one kept; a tampered manifest is refused', async () => {
    reset();
    v4 = publish(utc(new Date(now - 47 * 3_600_000)), 27);
    promote();
    site.corruptZip = v4.version;
    const d = new Device(v3);
    const r1 = await d.boot();
    expect(r1.result).toBe('blocked:retry');
    expect(d.updater.setTo).toBeNull();
    // the automatic retries stop after 3 attempts; v3 is still accepted, so it plays with a notice
    let last: GateResult = r1.result;
    for (let i = 0; i < 4 && last === 'blocked:retry'; i++) last = await r1.gate.run('retry');
    expect(last).toBe('fallback-play');
    expect(d.stamp.version).toBe(v3.version);
    expect(d.updater.setTo).toBeNull();
    expect([...d.updater.bundles.values()].some((b) => b.version === v4.version)).toBe(false);

    // the manifest is edited in transit (its signature no longer matches): nothing is downloaded
    site.corruptZip = null;
    site.tamperManifest = true;
    const e = new Device(v3);
    const r2 = await e.boot();
    expect(r2.result).toBe('blocked:retry');
    expect(e.updater.downloads).toBe(0);
    // and when the backend no longer replays v3's sim, the retry ends on a manual "Couldn't update", not a loop
    site.acceptedSims = [28];
    let l2: GateResult = r2.result;
    for (let i = 0; i < 4 && l2 === 'blocked:retry'; i++) l2 = await r2.gate.run('retry');
    expect(['blocked:failed', 'blocked:store']).toContain(l2);
    site.acceptedSims = [26, 27];
  });

  it('(g) a rollback release moves phones back to the kept bundle, once', async () => {
    reset();
    run('--rollback', v3.version);
    const d = new Device(v4);
    const boots = await d.bootUntilSettled();
    expect(boots.map((b) => b.result)).toEqual(['applying', 'ok']);
    expect(d.stamp.version).toBe(v3.version);
    expect((await d.boot()).result).toBe('ok');
    // a phone already on v3 is not touched
    const e = new Device(v3);
    expect((await e.boot()).result).toBe('ok');
    expect(e.updater.downloads).toBe(0);
  });

  it('no loop: a stale API answer (an older latest) never sends a newer phone backwards', async () => {
    reset();
    const fresh = JSON.parse(readFileSync(join(updates, 'ios/2/policy.json'), 'utf8'));
    // the policy as it was before v4 and the rollback, i.e. stable = v3, not a rollback
    const v5 = publish(utc(new Date(now - 46 * 3_600_000)), 27);
    promote();
    site.apiStalePolicy = fresh;
    const d = new Device(v5);
    const r = await d.boot();
    // the stale entry is the v3 rollback: the phone retries a few times at most, then plays (bounded, no reload loop)
    let last = r.result;
    for (let i = 0; i < 4 && last === 'blocked:retry'; i++) last = await r.gate.run('retry');
    expect(['ok', 'fallback-play']).toContain(last);
    expect(d.updater.setTo).toBeNull();
    expect(d.stamp.version).toBe(v5.version);
  });

  it('a backend that lags (an instance replaying only older sims) never blocks a newer phone, online or offline', async () => {
    reset();
    site.acceptedSims = [26];
    const latest = stamps.get([...stamps.keys()].find((v) => v.startsWith(String(utc(new Date(now - 46 * 3_600_000)))))!)!;
    const d = new Device(latest);
    expect((await d.boot()).result).toBe('ok');
    site.offline = true;
    expect((await d.boot()).result).toBe('offline-play');
    site.acceptedSims = [26, 27];
  });

  it('never mid-match: a match started while the gate downloads is not reloaded', async () => {
    reset();
    const v6 = publish(utc(new Date(now - 45 * 3_600_000)), 27);
    promote();
    const d = new Device(stamps.get([...stamps.keys()].find((v) => v.startsWith(String(utc(new Date(now - 46 * 3_600_000)))))!)!);
    // a party invite takes the player into a pick while the policy is in flight (the layer swallows taps, an invite
    // does not need one)
    d.onPolicy = () => {
      d.screen = 'pick';
    };
    const r = await d.boot('resume');
    expect(r.result).toBe('deferred');
    expect(d.updater.setTo).toBeNull();
    expect(document.getElementById('pl-gate')).toBeNull();
    expect(r.gate.owed).toBe(true);
    // back on the title: the owed check installs it
    d.onPolicy = null;
    d.screen = 'title';
    expect(await r.gate.run('title')).toBe('applying');
    expect((await d.boot()).result).toBe('ok');
    expect(d.stamp.version).toBe(v6.version);
  });
});

// ------------------------------------------------------------------------------------------------ (h) the bridge

describe('(h) a compat-1 shell and the bridge bundle', () => {
  it('the 1.0.x shell code (from git) accepts, verifies and downloads the bridge; only the bridge may go to compat 1', async () => {
    reset();
    // a game bundle may never be published to compat 1
    const game = join(dir, 'www-game-c1');
    mkdirSync(game, { recursive: true });
    writeFileSync(join(game, 'index.html'), '<!doctype html>');
    writeFileSync(join(game, 'bundle.json'), JSON.stringify({ version: `${utc(new Date())}-abc1234`, seq: utc(new Date()), compat: 1, simVersion: 26 }));
    expect(() => run('--compat', '1', '--www', game)).toThrow();

    // the bridge (build-web.mjs --bridge output shape: index.html, shell.js, logo, bundle.json with bridge: true)
    const bridge = join(dir, 'www-bridge');
    mkdirSync(bridge, { recursive: true });
    cpSync(join(__dirname, '../bridge/index.html'), join(bridge, 'index.html'));
    writeFileSync(join(bridge, 'shell.js'), '/* shell */');
    const seq = utc(new Date());
    writeFileSync(join(bridge, 'bundle.json'), JSON.stringify({ version: `${seq}-abc1234`, seq, compat: 1, simVersion: 0, bridge: true }));
    stamps.set(`${seq}-abc1234`, { version: `${seq}-abc1234`, seq, compat: 1, simVersion: 0, bridge: true });
    run('--compat', '1', '--www', bridge, '--min-native', '1.0.0');
    // once only, unless --force
    expect(run('--compat', '1', '--www', bridge)).toContain('already runs the bridge');

    // the compat-1 era shell module (tests/fixtures/manifest-compat1.ts, frozen from git ccd7ca75~1) decides over the
    // published compat-1 manifest
    {
      const raw = JSON.parse(readFileSync(join(updates, 'ios/1/manifest-beta.json'), 'utf8'));
      // the stuck 1.0.x bundle
      const own = { version: '20261111112457-ef22d35', seq: 20261111112457, compat: 1, simVersion: 26 };
      const m = old.parseManifest(raw, 1, true, 'ios')!;
      expect(m).not.toBeNull();
      expect(await old.verifyManifest(m, SPKI, globalThis.crypto.subtle)).toBe('ok');
      for (const native of ['1.0.0', '1.0.2']) expect(old.decide(m, own, native, []).act).toBe('download');
      const android = old.parseManifest(JSON.parse(readFileSync(join(updates, 'android/1/manifest-beta.json'), 'utf8')), 1, true, 'android');
      expect(android && (await old.verifyManifest(android, SPKI, globalThis.crypto.subtle))).toBe('ok');
      // the 1.0.x native updater accepts the bundle bytes
      const up = new NativeUpdater();
      const b = await up.download({ url: m.url, version: m.version, checksum: m.checksum, sessionKey: m.sessionKey });
      expect(b.version).toBe(`${seq}-abc1234`);
      // today's shell agrees, and never offers the bridge to a compat-2 shell
      expect(parseManifest(raw, 1, true, 'ios')).not.toBeNull();
      expect(parseManifest(raw, 2, true, 'ios')).toBeNull();
      expect(decide(parseManifest(raw, 1, true, 'ios')!, own, '1.0.2', []).act).toBe('download');
      expect(await verifyManifest(parseManifest(raw, 1, true, 'ios')!, SPKI, globalThis.crypto.subtle)).toBe('ok');
    }

    // the bridge page boots by itself (the old updater's watchdog sees html[data-ready]) and is a "title" (a later
    // bundle, e.g. a rollback of the bridge, applies on it)
    const html = readFileSync(join(__dirname, '../bridge/index.html'), 'utf8');
    expect(html).toMatch(/<html[^>]*data-ready="1"/);
    expect(html).toMatch(/<html[^>]*data-screen="title"/);
    expect(html).toContain('./shell.js');
    expect(html).not.toMatch(/target="_blank"/);
  });
});
