#!/usr/bin/env node
/**
 * Publish the built web bundle (`www/`, from scripts/build-web.mjs) as an over-the-air update:
 *
 *   client/public/pawlegends-app/updates/ios/<compat>/bundles/<version>.zip   (encrypted, see lib/capgo-crypto.mjs)
 *   client/public/pawlegends-app/updates/ios/<compat>/manifest.json           (signed; what every app reads)
 *
 * tokentails.com (Vercel, client/public) serves both once committed to main. Older bundles beyond --keep are
 * removed (a rollback can still use any kept one).
 *
 * Usage:
 *   node scripts/ota-publish.mjs [--min-native 1.0.0] [--keep 3] [--check-sim]
 *   node scripts/ota-publish.mjs --rollback <version>     re-point the manifest at a kept bundle (signed again)
 *
 * The private key: OTA_PRIVATE_KEY (PEM text, CI), else OTA_PRIVATE_KEY_PATH, else ota/.keys/private-key.pem.
 * --check-sim: refuse unless api.tokentails.com accepts this bundle's SIM_VERSION (GET /pawlegends/sim → simVersions).
 * The workflow also runs the stricter `npm run vendor-sim:check-remote` in pawlegends/ (same sim bundle sha256).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encryptBundle, publicPemOf, signManifest } from './lib/capgo-crypto.mjs';
import { zipDir } from './lib/zip.mjs';
import { API_ORIGIN, APP_DIR, LOCAL_PRIVATE_KEY_PATH, NATIVE_COMPAT, PUBLIC_KEY_PATH, UPDATES_DIR, UPDATES_URL } from './lib/app-config.mjs';

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
const committed = readFileSync(PUBLIC_KEY_PATH, 'utf8').trim();
if (publicPemOf(key).trim() !== committed) {
  console.error('ota-publish: the private key does not match ota/public-key.pem (the app would reject the bundle)');
  process.exit(2);
}

const compatDir = join(UPDATES_DIR, 'ios', String(NATIVE_COMPAT));
const bundlesDir = join(compatDir, 'bundles');
const manifestPath = join(compatDir, 'manifest.json');
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

function writeManifest(fields) {
  const m = { ...fields };
  m.signature = signManifest(m, key);
  writeFileSync(manifestPath, `${JSON.stringify(m, null, 2)}\n`);
  return m;
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Keep the newest `keep` bundles plus the one the manifest names. */
function prune(keep, current) {
  const zips = readdirSync(bundlesDir)
    .filter((f) => f.endsWith('.zip'))
    .sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]));
  for (const f of zips.slice(keep)) if (f !== `${current}.zip`) rmSync(join(bundlesDir, f));
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
  const m = writeManifest({ ...prev, rollback: true });
  console.log(`ota-publish: manifest rolled back to ${m.version}`);
  process.exit(0);
}

const www = join(APP_DIR, 'www');
const stamp = JSON.parse(readFileSync(join(www, 'bundle.json'), 'utf8'));
if (stamp.compat !== NATIVE_COMPAT) throw new Error(`ota-publish: www was built for compat ${stamp.compat}, not ${NATIVE_COMPAT}`);
const prev = readManifest();
if (prev && prev.seq >= stamp.seq && !prev.rollback) throw new Error(`ota-publish: seq ${stamp.seq} is not newer than the live ${prev.seq}`);

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
  minNative: arg('--min-native', prev?.minNative ?? '1.0.0'),
  rollback: false,
};
// per-bundle record (unsigned copy of the fields) so a rollback can re-point the manifest without rebuilding
writeFileSync(join(bundlesDir, `${stamp.version}.json`), `${JSON.stringify(fields, null, 2)}\n`);
const m = writeManifest(fields);
prune(keep, m.version);
for (const f of readdirSync(bundlesDir).filter((x) => x.endsWith('.json'))) {
  if (!existsSync(join(bundlesDir, f.replace(/\.json$/, '.zip')))) rmSync(join(bundlesDir, f));
}
console.log(`ota-publish: ${m.version} (${(enc.data.length / 1024 / 1024).toFixed(1)} MB, sim ${m.simVersion}) -> ${manifestPath}`);
