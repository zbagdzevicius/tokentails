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
 *   --grace-hours <n>                                         (publish) this release is optional for n hours on each
 *                                                             channel before it is required (default 0; a new sim is
 *                                                             always required at once)
 *   --compat <n> [--force]                                    work on another native compat level's manifests: only
 *                                                             the bridge bundle (`build-web.mjs --bridge`, OTA_WWW_DIR
 *                                                             or --www www-bridge) may be published below
 *                                                             NATIVE_COMPAT, and only once unless --force
 *   --www <dir>                                               the built bundle to publish (default www/)
 *   --maintenance "<message>" [--until <iso>] | --maintenance off
 *                                                             switch the maintenance screen on or off (policy only)
 *   --write-policy                                            (re)write and sign policy.json from the manifests
 *
 * Every action also writes `updates/<platform>/<compat>/policy.json` (docs/plans/moba/FORCE-UPDATE.md §3.1): the
 * channels' versions and sims, when each becomes required, the store links and any maintenance window, signed with
 * the same key and read by the shell's update gate and by GET /pawlegends/client-policy. It is rewritten only when its
 * content changes, so an hourly promote that moves nothing leaves it alone.
 *
 * --min-native sets both platforms; the per-platform flags win. Without them each platform keeps its current value.
 * The private key: OTA_PRIVATE_KEY (PEM text, CI), else OTA_PRIVATE_KEY_PATH, else ota/.keys/private-key.pem.
 * --check-sim: refuse unless api.tokentails.com accepts this bundle's SIM_VERSION (GET /pawlegends/sim → simVersions).
 * The workflow also runs the stricter `npm run vendor-sim:check-remote` in pawlegends/ (same sim bundle sha256).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encryptBundle, publicPemOf, signManifest, signPolicy } from './lib/capgo-crypto.mjs';
import { zipDir } from './lib/zip.mjs';
import {
  API_ORIGIN,
  APP_DIR,
  BUNDLES_PLATFORM,
  LOCAL_PRIVATE_KEY_PATH,
  MIN_COMPAT,
  NATIVE_COMPAT,
  OTA_PLATFORMS,
  POLICY_FILE,
  PUBLIC_KEY_PATH,
  REQUIRED_GRACE_HOURS,
  SOAK_HOURS,
  STORE_URLS,
  UPDATES_DIR,
  UPDATES_URL as SITE_UPDATES_URL,
  WEB_PLAY_URL,
} from './lib/app-config.mjs';

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

/** The native compat level this run works on: NATIVE_COMPAT, or a lower one for the bridge bundle (--compat). */
const COMPAT = Number(arg('--compat', NATIVE_COMPAT));
if (!Number.isInteger(COMPAT) || COMPAT < 1 || COMPAT > NATIVE_COMPAT) {
  console.error(`ota-publish: --compat must be 1..${NATIVE_COMPAT}`);
  process.exit(2);
}
const bundlesDir = join(UPDATES_DIR, BUNDLES_PLATFORM, String(COMPAT), 'bundles');
/** The manifest files per platform: `updates/<platform>/<compat>/manifest(-beta).json`. */
const manifestPath = (platform, channel) => join(UPDATES_DIR, platform, String(COMPAT), channel === 'stable' ? 'manifest.json' : 'manifest-beta.json');
const policyPath = (platform) => join(UPDATES_DIR, platform, String(COMPAT), POLICY_FILE);
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
  mkdirSync(join(UPDATES_DIR, platform, String(COMPAT)), { recursive: true });
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

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** A kept bundle's record (bundles/<version>.json), or null. */
function recordOf(version) {
  return readJsonFile(join(bundlesDir, `${version}.json`));
}

/** --maintenance "<message>" [--until <iso>] | off: the new window, `null` (off) or undefined (leave it). */
function maintenanceArg() {
  const m = arg('--maintenance');
  if (m === undefined) return undefined;
  if (m === 'off' || m === '') return null;
  const until = arg('--until', null);
  if (until !== null && Number.isNaN(Date.parse(until))) throw new Error(`ota-publish: bad --until ${until}`);
  if (m.length > 280) throw new Error('ota-publish: the maintenance message is longer than 280 characters');
  return { message: m, until: until ? new Date(until).toISOString() : null };
}

const iso = (ms) => new Date(ms).toISOString();
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Write and sign `policy.json` for one platform from its manifests (FORCE-UPDATE.md §3.1). Each channel entry mirrors
 * its manifest. `requiredFrom` is kept while the entry's version and rollback state do not change; a new entry is
 * required at its publish time + the release's grace (its record's `graceHours`, else REQUIRED_GRACE_HOURS), and at
 * once when it changes the sim or is a rollback. Written only when the content changed.
 */
function writePolicy(platform, maintenance = undefined) {
  const prev = readJsonFile(policyPath(platform));
  const now = Date.now();
  const channels = {};
  for (const channel of ['stable', 'beta']) {
    const m = readManifest(platform, channel);
    if (!m) continue;
    const before = prev?.channels?.[channel];
    let requiredFrom;
    if (before && before.version === m.version && before.rollback === m.rollback && typeof before.requiredFrom === 'string') {
      requiredFrom = before.requiredFrom;
    } else {
      const graceHours = Number(recordOf(m.version)?.graceHours ?? REQUIRED_GRACE_HOURS);
      const newSim = !before || before.simVersion !== m.simVersion;
      const grace = m.rollback || (newSim && before) || !(graceHours > 0) ? 0 : graceHours;
      requiredFrom = iso(now + grace * 3_600_000);
    }
    channels[channel] = { version: m.version, seq: m.seq, simVersion: m.simVersion, minNative: m.minNative, rollback: m.rollback, requiredFrom };
  }
  if (!Object.keys(channels).length) return null;
  let window = maintenance === undefined ? prev?.maintenance ?? null : maintenance;
  // an ended window is dropped on the next write
  if (window?.until && Date.parse(window.until) <= now) window = null;
  const body = {
    schema: 1,
    kind: 'policy',
    platform,
    compat: COMPAT,
    minCompat: MIN_COMPAT,
    minSim: Math.min(...Object.values(channels).map((c) => c.simVersion)),
    channels,
    store: STORE_URLS[platform],
    web: WEB_PLAY_URL,
    maintenance: window,
  };
  if (prev) {
    const { issuedAt: _i, signature: _s, ...old } = prev;
    if (sameJson(old, body)) return prev;
  }
  const p = { ...body, issuedAt: iso(now) };
  p.signature = signPolicy(p, key);
  mkdirSync(join(UPDATES_DIR, platform, String(COMPAT)), { recursive: true });
  writeFileSync(policyPath(platform), `${JSON.stringify(p, null, 2)}\n`);
  console.log(`ota-publish: ${platform}: policy ${policyPath(platform)} (minSim ${p.minSim}, ${Object.entries(channels).map(([c, e]) => `${c} ${e.version} from ${e.requiredFrom}`).join(', ')}${window ? `, maintenance until ${window.until ?? 'switched off'}` : ''})`);
  return p;
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

/**
 * Keep the newest `keep` bundles, every one a manifest names, and every one younger than twice the soak: on a busy day
 * (many pushes) the newest-`keep` rule alone deleted each bundle before it could soak, so stable never moved.
 */
function prune(keep, current) {
  const young = Date.now() - 2 * SOAK_HOURS * 3_600_000;
  const zips = readdirSync(bundlesDir)
    .filter((f) => f.endsWith('.zip'))
    .sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]));
  for (const f of zips.slice(keep)) {
    const name = f.replace(/\.zip$/, '');
    if (current.includes(name) || seqTime(name.split('-')[0]) >= young) continue;
    rmSync(join(bundlesDir, f));
    const meta = join(bundlesDir, `${name}.json`);
    if (existsSync(meta)) rmSync(meta);
  }
}

/** A seq is the UTC build time, yyyymmddHHMM or yyyymmddHHMMSS: its epoch ms, or NaN. */
function seqTime(seq) {
  const s = String(seq);
  if (!/^[0-9]{12}([0-9]{2})?$/.test(s)) return NaN;
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), s.length === 14 ? +s.slice(12, 14) : 0);
}

const keep = Math.max(1, Number(arg('--keep', 3)));
const rollbackTo = arg('--rollback');

if (args.includes('--write-policy') || (args.includes('--maintenance') && !rollbackTo && !args.includes('--promote'))) {
  const window = maintenanceArg();
  let wrote = 0;
  for (const platform of PLATFORMS) if (writePolicy(platform, window)) wrote++;
  if (!wrote) console.log(`ota-publish: no manifests for compat ${COMPAT}: no policy written`);
  process.exit(0);
}

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
    // the rollback is required at once: gated phones move to it on their next check or retry
    writePolicy(platform, maintenanceArg());
    rolled++;
  }
  process.exit(rolled > 0 ? 0 : 1);
}

/** Kept bundle records (bundles/<version>.json) newest first. */
function keptRecords() {
  return readdirSync(bundlesDir)
    .filter((f) => f.endsWith('.json') && existsSync(join(bundlesDir, f.replace(/\.json$/, '.zip'))))
    .map((f) => JSON.parse(readFileSync(join(bundlesDir, f), 'utf8')))
    .sort((a, b) => b.seq - a.seq);
}

/**
 * Promote one platform to stable. Every push to main publishes a new beta bundle, so waiting for the CURRENT beta to
 * be --soak-hours old starved stable for days while main was busy. The rule now:
 * 1. the newest kept bundle newer than stable that has soaked --soak-hours (the current beta or an earlier one), else
 * 2. when stable is missing or already --soak-hours behind beta, the newest kept bundle that is --min-soak-hours old
 *    (not only a quiet current beta: on a busy day there is no quiet spell), so store installs stay within hours.
 * --soak-hours 0 (a manual promote_now) promotes the current beta at once. Returns false on an error.
 */
function promote(platform) {
  const beta = readManifest(platform, 'beta');
  const stable = readManifest(platform, 'stable');
  if (!beta) {
    console.log(`ota-publish: ${platform}: no beta manifest, nothing to promote`);
    return true;
  }
  if (stable && stable.version === beta.version) {
    console.log(`ota-publish: ${platform}: stable is already ${beta.version}`);
    writePolicy(platform);
    return true;
  }
  const soakHours = Number(arg('--soak-hours', SOAK_HOURS));
  const minSoakHours = Number(arg('--min-soak-hours', 2));
  const now = Date.now();
  const ageOf = (seq) => (now - seqTime(seq)) / 3_600_000;
  const fmt = (h) => (Number.isFinite(h) ? h.toFixed(1) : '?');
  let target = null;
  let why = '';
  if (!(soakHours > 0)) {
    target = beta;
    why = 'manual promote';
  } else {
    // 1. the newest soaked bundle between stable and beta (never past beta: a beta rollback stays the ceiling)
    const soaked = keptRecords().find(
      (r) => r.seq <= beta.seq && (!stable || r.seq > stable.seq) && ageOf(r.seq) >= soakHours && (platform === BUNDLES_PLATFORM || r[platform])
    );
    if (soaked) {
      target = soaked.version === beta.version ? beta : fieldsFor(platform, soaked, beta.minNative, false);
      why = `soaked ${fmt(ageOf(soaked.seq))} h`;
    } else if (!stable || ageOf(stable.seq) - ageOf(beta.seq) >= soakHours) {
      // 2. stable is missing or --soak-hours behind: the newest kept bundle that has been out --min-soak-hours (on a
      // busy day the current beta is never quiet that long, so an earlier bundle of the day goes instead)
      const settled = keptRecords().find(
        (r) => r.seq <= beta.seq && (!stable || r.seq > stable.seq) && ageOf(r.seq) >= minSoakHours && (platform === BUNDLES_PLATFORM || r[platform])
      );
      if (settled) {
        target = settled.version === beta.version ? beta : fieldsFor(platform, settled, beta.minNative, false);
        why = stable ? `stable ${fmt(ageOf(stable.seq) - ageOf(beta.seq))} h behind, ${settled.version} out ${fmt(ageOf(settled.seq))} h` : `no stable yet, ${settled.version} out ${fmt(ageOf(settled.seq))} h`;
      }
    }
  }
  if (!target) {
    console.log(`ota-publish: ${platform}: beta ${beta.version} is ${fmt(ageOf(beta.seq))} h old; promotes after ${soakHours} h (or ${minSoakHours} h once stable is ${soakHours} h behind)`);
    writePolicy(platform);
    return true;
  }
  if (!existsSync(join(bundlesDir, `${target.version}.zip`))) {
    console.error(`ota-publish: ${platform}: the bundle ${target.version}.zip is missing`);
    return false;
  }
  // an older seq than the live stable (a beta rollback) must be marked so store installs accept it
  const m = writeManifest(platform, 'stable', { ...target, rollback: target.rollback || (stable ? target.seq <= stable.seq : false) });
  console.log(`ota-publish: ${platform}: promoted ${m.version} to stable (${why})`);
  writePolicy(platform);
  return true;
}

if (args.includes('--promote')) {
  let ok = true;
  for (const platform of PLATFORMS) ok = promote(platform) && ok;
  process.exit(ok ? 0 : 1);
}

const wwwArg = arg('--www');
const www = wwwArg ? resolve(APP_DIR, wwwArg) : process.env.OTA_WWW_DIR || join(APP_DIR, 'www');
const stamp = JSON.parse(readFileSync(join(www, 'bundle.json'), 'utf8'));
if (stamp.compat !== COMPAT) throw new Error(`ota-publish: www was built for compat ${stamp.compat}, not ${COMPAT} (pass --compat ${stamp.compat})`);
// below the shell's own level only the bridge bundle (no game, simVersion 0) may go out: a game bundle built for
// today's shell must never reach an older binary
const bridge = stamp.bridge === true && stamp.simVersion === 0;
if (COMPAT < NATIVE_COMPAT && !bridge) throw new Error(`ota-publish: only the bridge bundle (build-web.mjs --bridge) may be published to compat ${COMPAT}`);
if (bridge && !args.includes('--force')) {
  const live = PLATFORMS.map((p) => readManifest(p, 'beta')).filter(Boolean);
  if (live.length === PLATFORMS.length && live.every((m) => recordOf(m.version)?.bridge === true)) {
    console.log(`ota-publish: compat ${COMPAT} beta already runs the bridge ${live[0].version}: nothing published (--force to publish again)`);
    process.exit(0);
  }
}
const graceHours = Number(arg('--grace-hours', REQUIRED_GRACE_HOURS));
if (!(graceHours >= 0 && graceHours <= 24 * 14)) throw new Error('ota-publish: --grace-hours must be 0..336');
for (const platform of PLATFORMS) {
  for (const p of [readManifest(platform, 'beta'), readManifest(platform, 'stable')]) {
    if (p && p.seq >= stamp.seq && !p.rollback) throw new Error(`ota-publish: seq ${stamp.seq} is not newer than the live ${platform} ${p.seq}`);
  }
}

if (args.includes('--check-sim') && !bridge) {
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
  compat: COMPAT,
  version: stamp.version,
  seq: stamp.seq,
  url: `${UPDATES_URL}/${BUNDLES_PLATFORM}/${COMPAT}/bundles/${stamp.version}.zip`,
  checksum: enc.checksum,
  sessionKey: enc.sessionKey,
  simVersion: stamp.simVersion,
}, minNative.ios ?? minNativeFor('ios'), false);
// `graceHours` (outside the signed fields): how long this release stays optional on each channel (policy.json);
// `bridge`: the compat-1 bridge bundle (never a game)
const extra = { android: true, ...(graceHours > 0 ? { graceHours } : {}), ...(bridge ? { bridge: true } : {}) };
writeFileSync(join(bundlesDir, `${stamp.version}.json`), `${JSON.stringify({ ...record, ...extra }, null, 2)}\n`);
for (const platform of PLATFORMS) {
  const m = writeManifest(platform, 'beta', fieldsFor(platform, record, minNative[platform], false));
  console.log(`ota-publish: ${m.version} (${(enc.data.length / 1024 / 1024).toFixed(1)} MB, sim ${m.simVersion}, minNative ${m.minNative}) -> ${manifestPath(platform, 'beta')}`);
  writePolicy(platform, maintenanceArg());
}
prune(keep, namedVersions());
for (const f of readdirSync(bundlesDir).filter((x) => x.endsWith('.json'))) {
  if (!existsSync(join(bundlesDir, f.replace(/\.json$/, '.zip')))) rmSync(join(bundlesDir, f));
}
