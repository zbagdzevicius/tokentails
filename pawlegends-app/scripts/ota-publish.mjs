#!/usr/bin/env node
/**
 * Publish the built web bundle (`www/`, from scripts/build-web.mjs) as an over-the-air update:
 *
 *   client/public/pawlegends-app/updates/ios/<compat>/bundles/<version>.zip   (encrypted, see lib/capgo-crypto.mjs)
 *   client/public/pawlegends-app/updates/ios/<compat>/manifest-beta.json      (signed; TestFlight installs read it)
 *   client/public/pawlegends-app/updates/ios/<compat>/manifest.json           (signed; App Store installs read it)
 *
 * A new bundle goes to the beta channel only. `--promote` later copies the beta manifest to stable (signed again)
 * once the bundle is at least --soak-hours old (its seq is its UTC build time), so TestFlight sees every update a day
 * before App Store players. tokentails.com (Vercel, client/public) serves the files once committed to main. Older
 * bundles beyond --keep are removed, never the ones a manifest names (a rollback can use any kept one).
 *
 * Usage:
 *   node scripts/ota-publish.mjs [--min-native 1.0.0] [--keep 3] [--check-sim]   publish www/ to beta
 *   node scripts/ota-publish.mjs --promote [--soak-hours 24]                      beta -> stable when soaked (0 = now)
 *   node scripts/ota-publish.mjs --rollback <version>     point beta AND stable at a kept bundle (signed again)
 *
 * The private key: OTA_PRIVATE_KEY (PEM text, CI), else OTA_PRIVATE_KEY_PATH, else ota/.keys/private-key.pem.
 * --check-sim: refuse unless api.tokentails.com accepts this bundle's SIM_VERSION (GET /pawlegends/sim → simVersions).
 * The workflow also runs the stricter `npm run vendor-sim:check-remote` in pawlegends/ (same sim bundle sha256).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptBundle, publicPemOf, signManifest } from './lib/capgo-crypto.mjs';
import { zipDir } from './lib/zip.mjs';
import { API_ORIGIN, APP_DIR, LOCAL_PRIVATE_KEY_PATH, NATIVE_COMPAT, PUBLIC_KEY_PATH, SOAK_HOURS, UPDATES_DIR, UPDATES_URL as SITE_UPDATES_URL } from './lib/app-config.mjs';

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

const compatDir = join(UPDATES_DIR, 'ios', String(NATIVE_COMPAT));
const bundlesDir = join(compatDir, 'bundles');
const MANIFESTS = { stable: join(compatDir, 'manifest.json'), beta: join(compatDir, 'manifest-beta.json') };
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

function writeManifest(channel, fields) {
  const m = { ...fields };
  delete m.signature;
  m.signature = signManifest(m, key);
  writeFileSync(MANIFESTS[channel], `${JSON.stringify(m, null, 2)}\n`);
  return m;
}

function readManifest(channel) {
  try {
    return JSON.parse(readFileSync(MANIFESTS[channel], 'utf8'));
  } catch {
    return null;
  }
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
  // both channels: otherwise the next scheduled promote would push the bad beta bundle to stable again
  writeManifest('beta', { ...prev, rollback: true });
  const m = writeManifest('stable', { ...prev, rollback: true });
  console.log(`ota-publish: beta and stable rolled back to ${m.version}`);
  process.exit(0);
}

if (args.includes('--promote')) {
  const beta = readManifest('beta');
  const stable = readManifest('stable');
  if (!beta) {
    console.log('ota-publish: no beta manifest, nothing to promote');
    process.exit(0);
  }
  if (stable && stable.version === beta.version) {
    console.log(`ota-publish: stable is already ${beta.version}`);
    process.exit(0);
  }
  const soakHours = Number(arg('--soak-hours', SOAK_HOURS));
  const age = (Date.now() - seqTime(beta.seq)) / 3_600_000;
  // 0 = promote now (a manual promote_now), whatever the build clock said
  if (soakHours > 0 && !(age >= soakHours)) {
    console.log(`ota-publish: beta ${beta.version} is ${Number.isFinite(age) ? age.toFixed(1) : '?'} h old; promotes after ${soakHours} h`);
    process.exit(0);
  }
  if (!existsSync(join(bundlesDir, `${beta.version}.zip`))) {
    console.error(`ota-publish: the beta bundle ${beta.version}.zip is missing`);
    process.exit(1);
  }
  // an older seq than the live stable (a beta rollback) must be marked so App Store installs accept it
  const m = writeManifest('stable', { ...beta, rollback: beta.rollback || (stable ? beta.seq <= stable.seq : false) });
  console.log(`ota-publish: promoted ${m.version} to stable`);
  process.exit(0);
}

const www = process.env.OTA_WWW_DIR || join(APP_DIR, 'www');
const stamp = JSON.parse(readFileSync(join(www, 'bundle.json'), 'utf8'));
if (stamp.compat !== NATIVE_COMPAT) throw new Error(`ota-publish: www was built for compat ${stamp.compat}, not ${NATIVE_COMPAT}`);
const prev = readManifest('beta');
const live = readManifest('stable');
for (const p of [prev, live]) {
  if (p && p.seq >= stamp.seq && !p.rollback) throw new Error(`ota-publish: seq ${stamp.seq} is not newer than the live ${p.seq}`);
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
const fields = {
  schema: 1,
  platform: 'ios',
  compat: NATIVE_COMPAT,
  version: stamp.version,
  seq: stamp.seq,
  url: `${UPDATES_URL}/ios/${NATIVE_COMPAT}/bundles/${stamp.version}.zip`,
  checksum: enc.checksum,
  sessionKey: enc.sessionKey,
  simVersion: stamp.simVersion,
  minNative: arg('--min-native', prev?.minNative ?? live?.minNative ?? '1.0.0'),
  rollback: false,
};
// per-bundle record (unsigned copy of the fields) so a rollback can re-point the manifest without rebuilding
writeFileSync(join(bundlesDir, `${stamp.version}.json`), `${JSON.stringify(fields, null, 2)}\n`);
const m = writeManifest('beta', fields);
prune(keep, [m.version, live?.version].filter(Boolean));
for (const f of readdirSync(bundlesDir).filter((x) => x.endsWith('.json'))) {
  if (!existsSync(join(bundlesDir, f.replace(/\.json$/, '.zip')))) rmSync(join(bundlesDir, f));
}
console.log(`ota-publish: ${m.version} (${(enc.data.length / 1024 / 1024).toFixed(1)} MB, sim ${m.simVersion}) -> ${MANIFESTS.beta}`);
