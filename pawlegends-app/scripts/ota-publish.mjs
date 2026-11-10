#!/usr/bin/env node
/**
 * Publish the built web bundle (`www/`, from scripts/build-web.mjs) as an over-the-air update for the iOS and
 * Android apps (both run the same bundle):
 *
 *   client/public/pawlegends-app/updates/ios/<compat>/bundles/<version>.zip   (encrypted, see lib/capgo-crypto.mjs)
 *   client/public/pawlegends-app/updates/<platform>/<compat>/manifest-beta.json   (signed; TestFlight installs read it)
 *   client/public/pawlegends-app/updates/<platform>/<compat>/manifest.json        (signed; App Store and Play installs)
 *
 * <platform> is ios and android. The bundles stay under ios/ (the first iOS binaries accept only that path); each
 * platform's manifests point at the same zip with its own minNative and rollback state.
 *
 * A new bundle goes to the beta channel only. `--promote` later copies the beta manifest to stable (signed again)
 * once the bundle is at least --soak-hours old (its seq is its UTC build time), so TestFlight sees every update a day
 * before App Store and Google Play players. tokentails.com (Vercel, client/public) serves the files once committed to
 * main. Older bundles beyond --keep are removed, never the ones a manifest of any platform names (a rollback can use
 * any kept one).
 *
 * Usage:
 *   node scripts/ota-publish.mjs [--min-native 1.0.0] [--min-native-ios x] [--min-native-android y] [--keep 3] [--check-sim]
 *                                                             publish www/ to beta (both platforms)
 *   node scripts/ota-publish.mjs --promote [--soak-hours 24]  beta -> stable per platform when soaked (0 = now)
 *   node scripts/ota-publish.mjs --rollback <version>         point beta AND stable at a kept bundle (signed again);
 *                                                             Android only when the bundle's record says android: true
 *   --platform ios|android                                    any of the above for one platform only
 *
 * --min-native sets both platforms; the per-platform flags win. Without them each platform keeps its current value.
 * The private key: OTA_PRIVATE_KEY (PEM text, CI), else OTA_PRIVATE_KEY_PATH, else ota/.keys/private-key.pem.
 * --check-sim: refuse unless api.tokentails.com accepts this bundle's SIM_VERSION (GET /pawlegends/sim → simVersions).
 * The workflow also runs the stricter `npm run vendor-sim:check-remote` in pawlegends/ (same sim bundle sha256).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptBundle, publicPemOf, signManifest } from './lib/capgo-crypto.mjs';
import { zipDir } from './lib/zip.mjs';
import { API_ORIGIN, APP_DIR, BUNDLES_PLATFORM, LOCAL_PRIVATE_KEY_PATH, NATIVE_COMPAT, OTA_PLATFORMS, PUBLIC_KEY_PATH, SOAK_HOURS, UPDATES_DIR, UPDATES_URL as SITE_UPDATES_URL } from './lib/app-config.mjs';

/** OTA_UPDATES_URL overrides where the bundles are served (scripts/ota-local.mjs: the local test server). */
const UPDATES_URL = process.env.OTA_UPDATES_URL || SITE_UPDATES_URL;

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

function privateKey() {
  if (process.env.OTA_PRIVATE_KEY?.includes('PRIVATE KEY')) return process.env.OTA_PRIVATE_KEY;
  const path = process.env.OTA_PRIVATE_KEY_PATH || LOCAL_PRIVATE_KEY_PATH;
  if (!existsSync(path)) {
    console.error(`ota-publish: no private key (set OTA_PRIVATE_KEY, or run node scripts/ota-keygen.mjs for ${LOCAL_PRIVATE_KEY_PATH})`);
    process.exit(2);
  }
  return readFileSync(path, 'utf8');
}

const key = privateKey();
// OTA_PUBLIC_KEY_PATH and OTA_WWW_DIR: tests only (tests/publish.test.ts runs this script with a throwaway key pair)
const committed = readFileSync(process.env.OTA_PUBLIC_KEY_PATH || PUBLIC_KEY_PATH, 'utf8').trim();
if (publicPemOf(key).trim() !== committed) {
  console.error('ota-publish: the private key does not match ota/public-key.pem (the app would reject the bundle)');
  process.exit(2);
}

const bundlesDir = join(UPDATES_DIR, BUNDLES_PLATFORM, String(NATIVE_COMPAT), 'bundles');
/** The manifest files per platform: `updates/<platform>/<compat>/manifest(-beta).json`. */
const manifestPath = (platform, channel) => join(UPDATES_DIR, platform, String(NATIVE_COMPAT), channel === 'stable' ? 'manifest.json' : 'manifest-beta.json');
const PLATFORMS = (() => {
  const only = arg('--platform');
  if (!only) return OTA_PLATFORMS;
  if (!OTA_PLATFORMS.includes(only)) throw new Error(`ota-publish: --platform must be one of ${OTA_PLATFORMS.join(', ')}`);
  return [only];
})();
mkdirSync(bundlesDir, { recursive: true });

/** The accepted sims on the backend, or null when it cannot be read. */
async function acceptedSims() {
  try {
    const r = await fetch(`${API_ORIGIN}/pawlegends/sim`, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const list = j.simVersions ?? (Number.isInteger(j.simVersion) ? [j.simVersion] : null);
    return Array.isArray(list) ? list.map(Number).filter(Number.isInteger) : null;
  } catch {
    return null;
  }
}

/** The manifest fields for one platform (exactly the signed keys: the shell rebuilds them before it verifies). */
function fieldsFor(platform, record, minNative, rollback) {
  return {
    schema: 1,
    platform,
    compat: record.compat,
    version: record.version,
    seq: record.seq,
    url: record.url,
    checksum: record.checksum,
    sessionKey: record.sessionKey,
    simVersion: record.simVersion,
    minNative,
    rollback,
  };
}

function writeManifest(platform, channel, fields) {
  const m = { ...fields };
  delete m.signature;
  m.signature = signManifest(m, key);
  mkdirSync(join(UPDATES_DIR, platform, String(NATIVE_COMPAT)), { recursive: true });
  writeFileSync(manifestPath(platform, channel), `${JSON.stringify(m, null, 2)}\n`);
  return m;
}

function readManifest(platform, channel) {
  try {
    return JSON.parse(readFileSync(manifestPath(platform, channel), 'utf8'));
  } catch {
    return null;
  }
}

/** Every bundle version a manifest of any platform names (never pruned). */
function namedVersions() {
  const out = [];
  for (const p of OTA_PLATFORMS) for (const c of ['beta', 'stable']) out.push(readManifest(p, c)?.version);
  return out.filter(Boolean);
}

/** A platform's minNative: --min-native-<platform>, else --min-native, else what its manifests say, else 1.0.0. */
function minNativeFor(platform) {
  return arg(`--min-native-${platform}`, arg('--min-native', readManifest(platform, 'beta')?.minNative ?? readManifest(platform, 'stable')?.minNative ?? '1.0.0'));
}

/** Keep the newest `keep` bundles plus every one a manifest names. */
function prune(keep, current) {
  const zips = readdirSync(bundlesDir)
    .filter((f) => f.endsWith('.zip'))
    .sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]));
  for (const f of zips.slice(keep)) if (!current.includes(f.replace(/\.zip$/, ''))) rmSync(join(bundlesDir, f));
}

/** A seq is the UTC build time, yyyymmddHHMM or yyyymmddHHMMSS: its epoch ms, or NaN. */
function seqTime(seq) {
  const s = String(seq);
  if (!/^[0-9]{12}([0-9]{2})?$/.test(s)) return NaN;
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), s.length === 14 ? +s.slice(12, 14) : 0);
}

const keep = Math.max(1, Number(arg('--keep', 3)));
const rollbackTo = arg('--rollback');

if (rollbackTo) {
  const meta = join(bundlesDir, `${rollbackTo}.json`);
  if (!existsSync(meta)) {
    console.error(`ota-publish: no kept bundle ${rollbackTo} (see ${bundlesDir})`);
    process.exit(1);
  }
  const prev = JSON.parse(readFileSync(meta, 'utf8'));
  let rolled = 0;
  for (const platform of PLATFORMS) {
    // a bundle built before the Android shell existed (no `android` in its record) only knows the iOS manifest and
    // has no Android back handler: Android installs would follow the iOS manifest and lose the back button
    if (platform !== BUNDLES_PLATFORM && !prev[platform]) {
      console.log(`ota-publish: ${platform}: skipped, ${rollbackTo} predates the ${platform} shell (its manifests stay as they are)`);
      continue;
    }
    // both channels: otherwise the next scheduled promote would push the bad beta bundle to stable again. The bundle
    // record holds the iOS minNative; Android keeps its own.
    const minNative = platform === BUNDLES_PLATFORM ? prev.minNative : readManifest(platform, 'beta')?.minNative ?? readManifest(platform, 'stable')?.minNative ?? '1.0.0';
    writeManifest(platform, 'beta', fieldsFor(platform, prev, minNative, true));
    const m = writeManifest(platform, 'stable', fieldsFor(platform, prev, minNative, true));
    console.log(`ota-publish: ${platform} beta and stable rolled back to ${m.version}`);
    rolled++;
  }
  process.exit(rolled > 0 ? 0 : 1);
}

/** Promote one platform's beta to stable once soaked. Returns false on an error. */
function promote(platform) {
  const beta = readManifest(platform, 'beta');
  const stable = readManifest(platform, 'stable');
  if (!beta) {
    console.log(`ota-publish: ${platform}: no beta manifest, nothing to promote`);
    return true;
  }
  if (stable && stable.version === beta.version) {
    console.log(`ota-publish: ${platform}: stable is already ${beta.version}`);
    return true;
  }
  const soakHours = Number(arg('--soak-hours', SOAK_HOURS));
  const age = (Date.now() - seqTime(beta.seq)) / 3_600_000;
  // 0 = promote now (a manual promote_now), whatever the build clock said
  if (soakHours > 0 && !(age >= soakHours)) {
    console.log(`ota-publish: ${platform}: beta ${beta.version} is ${Number.isFinite(age) ? age.toFixed(1) : '?'} h old; promotes after ${soakHours} h`);
    return true;
  }
  if (!existsSync(join(bundlesDir, `${beta.version}.zip`))) {
    console.error(`ota-publish: ${platform}: the beta bundle ${beta.version}.zip is missing`);
    return false;
  }
  // an older seq than the live stable (a beta rollback) must be marked so store installs accept it
  const m = writeManifest(platform, 'stable', { ...beta, rollback: beta.rollback || (stable ? beta.seq <= stable.seq : false) });
  console.log(`ota-publish: ${platform}: promoted ${m.version} to stable`);
  return true;
}

if (args.includes('--promote')) {
  let ok = true;
  for (const platform of PLATFORMS) ok = promote(platform) && ok;
  process.exit(ok ? 0 : 1);
}

const www = process.env.OTA_WWW_DIR || join(APP_DIR, 'www');
const stamp = JSON.parse(readFileSync(join(www, 'bundle.json'), 'utf8'));
if (stamp.compat !== NATIVE_COMPAT) throw new Error(`ota-publish: www was built for compat ${stamp.compat}, not ${NATIVE_COMPAT}`);
for (const platform of PLATFORMS) {
  for (const p of [readManifest(platform, 'beta'), readManifest(platform, 'stable')]) {
    if (p && p.seq >= stamp.seq && !p.rollback) throw new Error(`ota-publish: seq ${stamp.seq} is not newer than the live ${platform} ${p.seq}`);
  }
}

if (args.includes('--check-sim')) {
  const sims = await acceptedSims();
  if (!sims) {
    console.error(`ota-publish: cannot read the accepted sims from ${API_ORIGIN}/pawlegends/sim`);
    process.exit(3);
  }
  if (!sims.includes(stamp.simVersion)) {
    console.error(`ota-publish: the backend accepts sims ${sims.join(', ')}, not this bundle's ${stamp.simVersion}. Deploy the backend first.`);
    process.exit(3);
  }
}

const zip = zipDir(www);
const enc = encryptBundle(zip, key);
writeFileSync(join(bundlesDir, `${stamp.version}.zip`), enc.data);
const minNative = Object.fromEntries(PLATFORMS.map((p) => [p, minNativeFor(p)]));
// per-bundle record (unsigned; the iOS fields, as before Android) so a rollback can re-point the manifests without
// rebuilding. `android: true` (outside the signed fields) marks a bundle that runs in the Android shell: a rollback
// re-points the Android manifests only at such bundles.
const record = fieldsFor(BUNDLES_PLATFORM, {
  compat: NATIVE_COMPAT,
  version: stamp.version,
  seq: stamp.seq,
  url: `${UPDATES_URL}/${BUNDLES_PLATFORM}/${NATIVE_COMPAT}/bundles/${stamp.version}.zip`,
  checksum: enc.checksum,
  sessionKey: enc.sessionKey,
  simVersion: stamp.simVersion,
}, minNative.ios ?? minNativeFor('ios'), false);
writeFileSync(join(bundlesDir, `${stamp.version}.json`), `${JSON.stringify({ ...record, android: true }, null, 2)}\n`);
for (const platform of PLATFORMS) {
  const m = writeManifest(platform, 'beta', fieldsFor(platform, record, minNative[platform], false));
  console.log(`ota-publish: ${m.version} (${(enc.data.length / 1024 / 1024).toFixed(1)} MB, sim ${m.simVersion}, minNative ${m.minNative}) -> ${manifestPath(platform, 'beta')}`);
}
prune(keep, namedVersions());
for (const f of readdirSync(bundlesDir).filter((x) => x.endsWith('.json'))) {
  if (!existsSync(join(bundlesDir, f.replace(/\.json$/, '.zip')))) rmSync(join(bundlesDir, f));
}
