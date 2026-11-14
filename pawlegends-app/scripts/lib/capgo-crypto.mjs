/**
 * Bundle encryption in the format @capgo/capacitor-updater v7 decrypts natively ("encryption v2", read from
 * ios/Sources/CapacitorUpdaterPlugin/CryptoCipher.swift, RSA.swift and AES.swift of the pinned plugin version):
 *
 * - the zip is encrypted with AES-128-CBC (PKCS#7) under a random 16-byte key and IV;
 * - `sessionKey` = `<base64 iv>:<base64 privateEncrypt(aesKey)>` (RSA-2048, PKCS#1 v1.5 type-1 padding);
 * - `checksum` = hex of `privateEncrypt(sha256(plain zip))`; the app recovers it with the public key and compares
 *   it with the SHA-256 of the zip it decrypted, before anything is unzipped.
 *
 * Only the holder of the private key can make a bundle the app accepts, so this is also the bundle signature. The
 * app's public key (`ota/public-key.pem`, PKCS#1 "RSA PUBLIC KEY") is in capacitor.config.ts.
 *
 * The manifest itself is signed too (RSASSA-PKCS1-v1_5 / SHA-256 over `canonicalManifest`), so the shell can check
 * `version`, `seq` and `minNative` before it downloads anything (src/shell/manifest.ts verifies it).
 */
import { createCipheriv, createHash, createPrivateKey, createPublicKey, generateKeyPairSync, privateEncrypt, randomBytes, sign, constants } from 'node:crypto';

/** A new RSA-2048 key pair: private PKCS#1 PEM (keep secret) and public PKCS#1 PEM (commit). */
export function generateKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicExponent: 0x10001 });
  return {
    privatePem: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  };
}

/** The SPKI ("PUBLIC KEY") PEM of a public or private key: what WebCrypto imports in the shell. */
export function spkiPem(pem) {
  const key = pem.includes('PRIVATE') ? createPublicKey(createPrivateKey(pem)) : createPublicKey(pem);
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

/** The PKCS#1 public PEM of a private key (to check that a private key matches the committed public key). */
export function publicPemOf(privatePem) {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: 'pkcs1', format: 'pem' }).toString();
}

const rsaSignBlock = (privatePem, data) => privateEncrypt({ key: privatePem, padding: constants.RSA_PKCS1_PADDING }, data);

/** Encrypt a zip for the updater. Returns the encrypted bytes, the session key, the encrypted checksum and the plain SHA-256. */
export function encryptBundle(zip, privatePem, rand = randomBytes) {
  const key = rand(16);
  const iv = rand(16);
  const cipher = createCipheriv('aes-128-cbc', key, iv);
  const data = Buffer.concat([cipher.update(zip), cipher.final()]);
  const sha256 = createHash('sha256').update(zip).digest();
  return {
    data,
    sessionKey: `${iv.toString('base64')}:${rsaSignBlock(privatePem, key).toString('base64')}`,
    checksum: rsaSignBlock(privatePem, sha256).toString('hex'),
    sha256: sha256.toString('hex'),
  };
}

/** The bytes a manifest signature covers: every field but `signature`, keys sorted, no whitespace. */
export function canonicalManifest(m) {
  const out = {};
  for (const k of Object.keys(m).sort()) if (k !== 'signature') out[k] = m[k];
  return JSON.stringify(out);
}

/** Sign a manifest (base64 RSASSA-PKCS1-v1_5 SHA-256 over canonicalManifest). */
export function signManifest(m, privatePem) {
  return sign('sha256', Buffer.from(canonicalManifest(m)), { key: privatePem, padding: constants.RSA_PKCS1_PADDING }).toString('base64');
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
  return out;
}

/**
 * The bytes a policy signature covers (docs/plans/moba/FORCE-UPDATE.md §3.1): every field but the top-level
 * `signature`, keys sorted at every depth (a policy has nested channel entries), no whitespace. The twin of
 * shared/client-policy.ts canonicalPolicy, which the shell and the backend verify with.
 */
export function canonicalPolicy(p) {
  const out = {};
  for (const k of Object.keys(p).sort()) if (k !== 'signature') out[k] = sortDeep(p[k]);
  return JSON.stringify(out);
}

/** Sign a policy file (base64 RSASSA-PKCS1-v1_5 SHA-256 over canonicalPolicy), with the manifests' key. */
export function signPolicy(p, privatePem) {
  return sign('sha256', Buffer.from(canonicalPolicy(p)), { key: privatePem, padding: constants.RSA_PKCS1_PADDING }).toString('base64');
}
