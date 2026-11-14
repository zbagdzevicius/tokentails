/**
 * The compat-1 bridge bundle (docs/plans/moba/FORCE-UPDATE.md §6.1): built by `build-web.mjs --bridge`, published by
 * `ota-publish.mjs --compat 1 --www www-bridge` to the manifests every 1.0.x shell reads. It must carry no game, no
 * host.js and nothing Firebase (the 1.0.x binaries have no auth plugin), link the stores and the web game, mark itself
 * booted and on the title, and its manifests must pass the manifest readers as they shipped in the old binaries.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateKeys, spkiPem } from '../scripts/lib/capgo-crypto.mjs';
import { BRIDGE_COMPAT, NATIVE_COMPAT } from '../scripts/lib/app-config.mjs';
import { parseManifest, verifyManifest } from '../src/shell/manifest';

const app = join(__dirname, '..');
const www = join(app, 'www-bridge');

/** The manifest reader of the first iPhone shells (b5500906; 6548684d only added allowLocal): iOS only. */
function parseManifestB5500906(v: unknown, compat: number): Record<string, unknown> | null {
  const VERSION = /^[0-9]{1,14}-[0-9a-z]{1,40}$/;
  const HTTPS_TT = /^https:\/\/(www\.)?tokentails\.com\/pawlegends-app\/updates\/ios\/[0-9]{1,3}\/bundles\/[0-9a-z.-]{1,80}\.zip$/;
  const HEX = /^[0-9a-f]{512}$/;
  const SESSION = /^[A-Za-z0-9+/=]{24}:[A-Za-z0-9+/=]{344}$/;
  const SEMVER = /^[0-9]{1,4}(\.[0-9]{1,4}){0,2}$/;
  const B64 = /^[A-Za-z0-9+/=]{16,1024}$/;
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (m.schema !== 1 || m.platform !== 'ios' || m.compat !== compat) return null;
  if (typeof m.version !== 'string' || !VERSION.test(m.version)) return null;
  if (typeof m.seq !== 'number' || !Number.isSafeInteger(m.seq) || m.seq <= 0) return null;
  if (typeof m.url !== 'string' || !HTTPS_TT.test(m.url)) return null;
  if (typeof m.checksum !== 'string' || !HEX.test(m.checksum)) return null;
  if (typeof m.sessionKey !== 'string' || !SESSION.test(m.sessionKey)) return null;
  if (typeof m.simVersion !== 'number' || !Number.isInteger(m.simVersion)) return null;
  if (typeof m.minNative !== 'string' || !SEMVER.test(m.minNative)) return null;
  if (typeof m.rollback !== 'boolean') return null;
  if (typeof m.signature !== 'string' || !B64.test(m.signature)) return null;
  return m;
}

/** The old decide (b5500906 … 80692c00, unchanged): download when newer, never a failed or too-new-native bundle. */
function decideOld(m: { version: string; seq: number; minNative: string; rollback: boolean }, own: { version: string; seq: number }): boolean {
  return m.version !== own.version && m.minNative <= '1.0.9' && (m.seq > own.seq || m.rollback);
}

function utc(d: Date): number {
  const p = (n: number) => String(n).padStart(2, '0');
  return Number(`${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}

function sizeOf(dir: string): number {
  return readdirSync(dir).reduce((n, f) => n + statSync(join(dir, f)).size, 0);
}

describe('the compat-1 bridge bundle', () => {
  const seq = utc(new Date());
  execFileSync(process.execPath, [join(app, 'scripts/build-web.mjs'), '--bridge', '--seq', String(seq)], { cwd: app, encoding: 'utf8' });

  it('has no game, no host.js and nothing Firebase; links both stores and the web game; is booted and on the title', () => {
    const files = readdirSync(www).sort();
    expect(files).toEqual(['bundle.json', 'index.html', 'logo.webp', 'shell.js']);
    const html = readFileSync(join(www, 'index.html'), 'utf8');
    const shell = readFileSync(join(www, 'shell.js'), 'utf8');
    expect(html).not.toMatch(/type="module"|host\.js|firebase/i);
    expect(shell).not.toMatch(/firebase|FirebaseAuthentication/i);
    expect(html).toContain('https://apps.apple.com/app/id6832032981');
    expect(html).toContain('https://play.google.com/store/apps/details?id=com.tokentails.pawlegends');
    expect(html).toContain('https://pawlegends.app/play');
    expect(html).toMatch(/<html[^>]*data-ready="1"[^>]*data-screen="title"/);
    expect(html).toContain('<script src="./shell.js"></script>');
    expect(sizeOf(www)).toBeLessThan(300 * 1024);
  });

  it('is stamped compat 1, sim 0, bridge (the shell inside reads the compat-1 manifests)', () => {
    const stamp = JSON.parse(readFileSync(join(www, 'bundle.json'), 'utf8'));
    expect(stamp).toMatchObject({ seq, compat: BRIDGE_COMPAT, simVersion: 0, bridge: true });
    expect(readFileSync(join(www, 'shell.js'), 'utf8')).toMatch(new RegExp(`compat:${BRIDGE_COMPAT}[,}]`));
  });

  it('publishes once to ios/1 and android/1 (the missing Android stable too), and old readers accept it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'plbridge-'));
    const keys = generateKeys() as { privatePem: string; publicPem: string };
    writeFileSync(join(dir, 'private.pem'), keys.privatePem);
    writeFileSync(join(dir, 'public.pem'), keys.publicPem);
    const updates = join(dir, 'updates');
    const env = { ...process.env, OTA_PRIVATE_KEY: '', OTA_PRIVATE_KEY_PATH: join(dir, 'private.pem'), OTA_PUBLIC_KEY_PATH: join(dir, 'public.pem'), OTA_UPDATES_DIR: updates };
    const run = (...a: string[]) => execFileSync(process.execPath, [join(app, 'scripts/ota-publish.mjs'), ...a], { env, encoding: 'utf8' });
    const read = (p: string, f: string, c = BRIDGE_COMPAT) => JSON.parse(readFileSync(join(updates, p, String(c), f), 'utf8'));

    // the live compat-2 game stays byte-identical
    const gameWww = join(dir, 'www');
    mkdirSync(gameWww);
    writeFileSync(join(gameWww, 'index.html'), '<!doctype html><title>t</title>');
    const gameSeq = utc(new Date(Date.now() - 3_600_000));
    writeFileSync(join(gameWww, 'bundle.json'), JSON.stringify({ version: `${gameSeq}-abc1234`, seq: gameSeq, compat: NATIVE_COMPAT, simVersion: 27 }));
    run('--www', gameWww);
    const before = readFileSync(join(updates, `ios/${NATIVE_COMPAT}/manifest-beta.json`), 'utf8');

    // the bridge refuses compat 2, and a game bundle refuses compat 1
    expect(() => run('--www', www)).toThrow();
    expect(() => run('--compat', '1', '--www', gameWww)).toThrow();

    run('--compat', '1', '--www', www, '--keep', '5');
    expect(run('--compat', '1', '--www', www)).toContain('already runs the bridge');
    run('--compat', '1', '--promote', '--soak-hours', '0');
    expect(readFileSync(join(updates, `ios/${NATIVE_COMPAT}/manifest-beta.json`), 'utf8')).toBe(before);

    const pem = spkiPem(keys.publicPem) as string;
    for (const platform of ['ios', 'android'] as const) {
      for (const f of ['manifest.json', 'manifest-beta.json']) {
        const m = read(platform, f);
        expect(m).toMatchObject({ compat: 1, simVersion: 0, platform, version: `${seq}-${m.version.split('-')[1]}` });
        expect(m.url).toContain('/updates/ios/1/bundles/');
        // the current reader (9eae7e8f and later: per platform)
        const parsed = parseManifest(m, 1, false, platform);
        expect(parsed).not.toBeNull();
        expect(await verifyManifest(parsed!, pem)).toBe('ok');
        // the first iPhone shells (b5500906, 6548684d): iOS only
        if (platform === 'ios') expect(parseManifestB5500906(m, 1)).not.toBeNull();
        // the old decide takes it over the last compat-1 game bundle
        expect(decideOld(m, { version: '20261111112457-ef22d35', seq: 20261111112457 })).toBe(true);
      }
      // a compat-1 policy that sends any compat-1 API query to the store
      expect(read(platform, 'policy.json')).toMatchObject({ compat: 1, minCompat: 2, minSim: 0, kind: 'policy' });
    }
    expect(existsSync(join(updates, 'ios/1/bundles', `${read('ios', 'manifest.json').version}.zip`))).toBe(true);
  }, 30_000);
});
