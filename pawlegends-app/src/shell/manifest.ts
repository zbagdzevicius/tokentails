/**
 * The OTA manifest (docs/plans/moba/APP-STORE.md "OTA flow"): one static JSON file per native compat level, served
 * by tokentails.com at `/pawlegends-app/updates/ios/<compat>/manifest.json` and written by
 * `scripts/ota-publish.mjs`. Pure functions only (tests/manifest.test.ts): parse, verify, and decide.
 */

export interface OtaManifest {
  schema: 1;
  platform: 'ios';
  /** Native compat level: the shell only reads the folder of its own level. */
  compat: number;
  /** Bundle version (`<seq>-<sha>`): the id of the web build. */
  version: string;
  /** Publish order: a larger seq is newer. */
  seq: number;
  /** Encrypted zip (https on tokentails.com). */
  url: string;
  /** RSA-encrypted SHA-256 of the plain zip (hex), checked natively before unzip. */
  checksum: string;
  /** `<iv>:<encrypted AES key>`, base64 both. */
  sessionKey: string;
  /** The game's SIM_VERSION in this bundle (the publish job checked the backend accepts it). */
  simVersion: number;
  /** Lowest native app version (CFBundleShortVersionString) that may run this bundle. */
  minNative: string;
  /** Point everyone at this version even if it is older (a rollback). */
  rollback: boolean;
  /** RSASSA-PKCS1-v1_5 / SHA-256 over canonicalManifest, base64. */
  signature: string;
}

/** The bundle the running page came from (stamped into shell.js by scripts/build-web.mjs). */
export interface BundleStamp {
  version: string;
  seq: number;
  compat: number;
  simVersion: number;
}

const VERSION = /^[0-9]{1,14}-[0-9a-z]{1,40}$/;
const HTTPS_TT = /^https:\/\/(www\.)?tokentails\.com\/pawlegends-app\/updates\/ios\/[0-9]{1,3}\/bundles\/[0-9a-z.-]{1,80}\.zip$/;
const HEX = /^[0-9a-f]{512}$/;
const SESSION = /^[A-Za-z0-9+/=]{24}:[A-Za-z0-9+/=]{344}$/;
const SEMVER = /^[0-9]{1,4}(\.[0-9]{1,4}){0,2}$/;
const B64 = /^[A-Za-z0-9+/=]{16,1024}$/;

/** A manifest, or null for anything malformed or not meant for this compat level. Never throws. */
export function parseManifest(v: unknown, compat: number): OtaManifest | null {
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
  return {
    schema: 1,
    platform: 'ios',
    compat,
    version: m.version,
    seq: m.seq,
    url: m.url,
    checksum: m.checksum,
    sessionKey: m.sessionKey,
    simVersion: m.simVersion,
    minNative: m.minNative,
    rollback: m.rollback,
    signature: m.signature,
  };
}

/** The bytes the signature covers (same rule as scripts/lib/capgo-crypto.mjs canonicalManifest). */
export function canonicalManifest(m: object): string {
  const src = m as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) if (k !== 'signature') out[k] = src[k];
  return JSON.stringify(out);
}

/** Compare dotted versions numerically (missing parts are 0). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x) || 0);
  const pb = b.split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type Decision =
  | { act: 'none'; why: 'same' | 'older' | 'failed-before' | 'native-too-old' }
  | { act: 'download'; manifest: OtaManifest };

/**
 * Whether to fetch the manifest's bundle. A newer seq downloads; an older one only when the manifest is a rollback.
 * A version that already failed to boot on this device is never tried again (Capgo rolled it back), and a bundle
 * that needs a newer native shell waits for the App Store update.
 */
export function decide(m: OtaManifest, own: BundleStamp, nativeVersion: string, failed: readonly string[]): Decision {
  if (m.version === own.version) return { act: 'none', why: 'same' };
  if (failed.includes(m.version)) return { act: 'none', why: 'failed-before' };
  if (compareVersions(nativeVersion, m.minNative) < 0) return { act: 'none', why: 'native-too-old' };
  if (m.seq <= own.seq && !m.rollback) return { act: 'none', why: 'older' };
  return { act: 'download', manifest: m };
}

/**
 * Safe to swap the web bundle now (a reload): only on the title screen, with no party open or resumable. Never in
 * a match, on the pick screen or on results (the player would lose them).
 */
export function safeToApply(o: { screen: string | undefined; partyOpen: boolean; partySeat: boolean }): boolean {
  return o.screen === 'title' && !o.partyOpen && !o.partySeat;
}

const PEM = /-----BEGIN PUBLIC KEY-----([\s\S]+?)-----END PUBLIC KEY-----/;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Check the manifest signature with the SPKI public key. `'unavailable'` when this WebView has no WebCrypto (then
 * the native RSA checksum of the bundle is still enforced by the updater before anything is unzipped).
 */
export async function verifyManifest(m: OtaManifest, spkiPem: string, subtle: SubtleCrypto | null | undefined = globalThis.crypto?.subtle): Promise<'ok' | 'bad' | 'unavailable'> {
  if (!subtle) return 'unavailable';
  const pem = PEM.exec(spkiPem);
  if (!pem) return 'bad';
  try {
    const key = await subtle.importKey('spki', b64ToBytes(pem[1]), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await subtle.verify('RSASSA-PKCS1-v1_5', key, b64ToBytes(m.signature), new TextEncoder().encode(canonicalManifest(m)));
    return ok ? 'ok' : 'bad';
  } catch {
    return 'bad';
  }
}
