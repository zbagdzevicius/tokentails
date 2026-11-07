/**
 * OTA manifest rules (src/shell/manifest.ts) against bundles made by the real publish crypto
 * (scripts/lib/capgo-crypto.mjs): parse, signature, compat, the update decision and when it is safe to apply.
 */
import { createDecipheriv, createHash, createPublicKey, publicDecrypt, constants } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalManifest as scriptCanonical, encryptBundle, generateKeys, signManifest, spkiPem } from '../scripts/lib/capgo-crypto.mjs';
import { canonicalManifest, compareVersions, decide, parseManifest, safeToApply, verifyManifest, type BundleStamp, type OtaManifest } from '../src/shell/manifest';

const keys = generateKeys() as { privatePem: string; publicPem: string };
const other = generateKeys() as { privatePem: string; publicPem: string };

function manifest(over: Partial<OtaManifest> = {}, key = keys.privatePem): OtaManifest {
  const enc = encryptBundle(Buffer.from('zip bytes'), key);
  const fields = {
    schema: 1 as const,
    platform: 'ios' as const,
    compat: 1,
    version: '202611071530-abc1234',
    seq: 202611071530,
    url: 'https://tokentails.com/pawlegends-app/updates/ios/1/bundles/202611071530-abc1234.zip',
    checksum: enc.checksum as string,
    sessionKey: enc.sessionKey as string,
    simVersion: 14,
    minNative: '1.0.0',
    rollback: false,
    ...over,
  };
  return { ...fields, signature: over.signature ?? (signManifest(fields, key) as string) };
}

const own: BundleStamp = { version: '202611011200-0000000', seq: 202611011200, compat: 1, simVersion: 14 };

describe('parseManifest', () => {
  it('accepts a published manifest', () => {
    const m = manifest();
    expect(parseManifest(JSON.parse(JSON.stringify(m)), 1)).toEqual(m);
  });
  it('refuses another compat level, another host, http, and malformed fields', () => {
    expect(parseManifest(manifest(), 2)).toBeNull();
    expect(parseManifest(manifest({ url: 'https://evil.example/pawlegends-app/updates/ios/1/bundles/x.zip' }), 1)).toBeNull();
    expect(parseManifest(manifest({ url: 'http://tokentails.com/pawlegends-app/updates/ios/1/bundles/x.zip' }), 1)).toBeNull();
    expect(parseManifest({ ...manifest(), seq: -1 }, 1)).toBeNull();
    expect(parseManifest({ ...manifest(), checksum: 'abc' }, 1)).toBeNull();
    expect(parseManifest({ ...manifest(), sessionKey: 'x:y' }, 1)).toBeNull();
    expect(parseManifest({ ...manifest(), version: '../../etc' }, 1)).toBeNull();
    expect(parseManifest(null, 1)).toBeNull();
    expect(parseManifest('{}', 1)).toBeNull();
  });
});

describe('signature', () => {
  it('the shell and the publish script sign the same bytes', () => {
    const m = manifest();
    expect(canonicalManifest(m)).toBe(scriptCanonical(m));
    expect(canonicalManifest(m)).not.toContain('signature');
  });
  it('verifies with the SPKI form of the committed public key', async () => {
    expect(await verifyManifest(manifest(), spkiPem(keys.publicPem))).toBe('ok');
  });
  it('refuses a tampered field or another key', async () => {
    const m = manifest();
    expect(await verifyManifest({ ...m, minNative: '0.1' }, spkiPem(keys.publicPem))).toBe('bad');
    expect(await verifyManifest({ ...m, rollback: true }, spkiPem(keys.publicPem))).toBe('bad');
    expect(await verifyManifest(manifest({}, other.privatePem), spkiPem(keys.publicPem))).toBe('bad');
    expect(await verifyManifest(m, 'not a key')).toBe('bad');
  });
  it('reports a WebView without WebCrypto (the native checksum still guards the bundle)', async () => {
    expect(await verifyManifest(manifest(), spkiPem(keys.publicPem), null)).toBe('unavailable');
  });
});

describe('bundle encryption (what the updater decrypts natively)', () => {
  it('session key and checksum recover with the public key; the zip decrypts to the original', () => {
    const zip = Buffer.from('PK... a fake zip, any bytes');
    const enc = encryptBundle(zip, keys.privatePem);
    const pub = createPublicKey(keys.publicPem);
    const [ivB64, keyB64] = (enc.sessionKey as string).split(':');
    const aes = publicDecrypt({ key: pub, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(keyB64, 'base64'));
    expect(aes.length).toBe(16);
    const d = createDecipheriv('aes-128-cbc', aes, Buffer.from(ivB64, 'base64'));
    const plain = Buffer.concat([d.update(enc.data), d.final()]);
    expect(plain.equals(zip)).toBe(true);
    const sha = publicDecrypt({ key: pub, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(enc.checksum, 'hex'));
    expect(sha.toString('hex')).toBe(createHash('sha256').update(zip).digest('hex'));
    // RSA-2048 blocks are 256 bytes (CryptoCipher.swift refuses anything else)
    expect(Buffer.from(enc.checksum, 'hex').length).toBe(256);
    expect(keys.publicPem.startsWith('-----BEGIN RSA PUBLIC KEY-----')).toBe(true);
  });
});

describe('decide', () => {
  it('downloads a newer bundle', () => {
    expect(decide(manifest(), own, '1.0.0', []).act).toBe('download');
  });
  it('skips the bundle it runs, an older one, and one that failed before', () => {
    expect(decide(manifest({ version: own.version, seq: own.seq }), own, '1.0.0', [])).toEqual({ act: 'none', why: 'same' });
    expect(decide(manifest({ seq: 202601010000 }), own, '1.0.0', [])).toEqual({ act: 'none', why: 'older' });
    expect(decide(manifest(), own, '1.0.0', ['202611071530-abc1234'])).toEqual({ act: 'none', why: 'failed-before' });
  });
  it('a rollback manifest moves devices to an older bundle', () => {
    expect(decide(manifest({ seq: 202601010000, rollback: true }), own, '1.0.0', []).act).toBe('download');
  });
  it('waits for the App Store update when the bundle needs a newer native shell', () => {
    expect(decide(manifest({ minNative: '1.2' }), own, '1.1.9', [])).toEqual({ act: 'none', why: 'native-too-old' });
    expect(decide(manifest({ minNative: '1.2' }), own, '1.2.0', []).act).toBe('download');
  });
});

describe('compareVersions', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.9', '1')).toBe(-1);
  });
});

describe('safeToApply', () => {
  it('only on the title, with no party', () => {
    expect(safeToApply({ screen: 'title', partyOpen: false, partySeat: false })).toBe(true);
    for (const screen of ['match', 'pick', 'results', undefined]) expect(safeToApply({ screen, partyOpen: false, partySeat: false })).toBe(false);
    expect(safeToApply({ screen: 'title', partyOpen: true, partySeat: false })).toBe(false);
    expect(safeToApply({ screen: 'title', partyOpen: false, partySeat: true })).toBe(false);
  });
});
