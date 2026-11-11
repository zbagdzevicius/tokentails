/**
 * scripts/ota-publish.mjs end to end with a throwaway key pair in a scratch folder: a new bundle lands on beta only,
 * `--promote` waits for the soak and then copies it to stable, and a rollback points both channels at a kept bundle
 * (Android only at a bundle built for the Android shell).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateKeys } from '../scripts/lib/capgo-crypto.mjs';
import { NATIVE_COMPAT } from '../scripts/lib/app-config.mjs';

const script = join(__dirname, '../scripts/ota-publish.mjs');

function utc(d: Date): number {
  const p = (n: number) => String(n).padStart(2, '0');
  return Number(`${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`);
}

describe('ota-publish channels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plpub-'));
  const keys = generateKeys() as { privatePem: string; publicPem: string };
  writeFileSync(join(dir, 'private.pem'), keys.privatePem);
  writeFileSync(join(dir, 'public.pem'), keys.publicPem);
  const www = join(dir, 'www');
  mkdirSync(www);
  writeFileSync(join(www, 'index.html'), '<!doctype html><title>t</title>');
  const updates = join(dir, 'updates');
  const env = { ...process.env, OTA_PRIVATE_KEY: '', OTA_PRIVATE_KEY_PATH: join(dir, 'private.pem'), OTA_PUBLIC_KEY_PATH: join(dir, 'public.pem'), OTA_WWW_DIR: www, OTA_UPDATES_DIR: updates };
  const run = (...a: string[]) => execFileSync(process.execPath, [script, ...a], { env, encoding: 'utf8' });
  const read = (f: string, platform = 'ios') => JSON.parse(readFileSync(join(updates, platform, String(NATIVE_COMPAT), f), 'utf8'));
  const build = (seq: number) => writeFileSync(join(www, 'bundle.json'), JSON.stringify({ version: `${seq}-abc1234`, seq, compat: NATIVE_COMPAT, simVersion: 14 }));

  it('publishes to beta, promotes after the soak, rolls both channels back', () => {
    const first = utc(new Date(Date.now() - 48 * 3_600_000));
    build(first);
    run('--keep', '5');
    expect(read('manifest-beta.json').version).toBe(`${first}-abc1234`);
    expect(existsSync(join(updates, `ios/${NATIVE_COMPAT}/manifest.json`))).toBe(false);
    expect(run('--promote')).toContain('promoted');
    expect(read('manifest.json').version).toBe(`${first}-abc1234`);
    expect(read('manifest.json').rollback).toBe(false);

    const second = utc(new Date(Date.now() - 10_000));
    build(second);
    run('--keep', '5');
    expect(read('manifest-beta.json').version).toBe(`${second}-abc1234`);
    // fresh: stable keeps the first bundle until the soak passes (or a manual promote with --soak-hours 0)
    expect(run('--promote')).toContain('promotes after 24 h');
    expect(read('manifest.json').version).toBe(`${first}-abc1234`);
    expect(() => run('--keep', '5')).toThrow();

    run('--rollback', `${first}-abc1234`);
    for (const f of ['manifest.json', 'manifest-beta.json']) {
      expect(read(f).version).toBe(`${first}-abc1234`);
      expect(read(f).rollback).toBe(true);
    }
    expect(run('--promote')).toContain('already');
    // a bundle after the rollback publishes again (beta), and a manual promote moves it now
    const third = utc(new Date());
    build(third);
    run('--keep', '5');
    expect(run('--promote', '--soak-hours', '0')).toContain('promoted');
    expect(read('manifest.json').version).toBe(`${third}-abc1234`);

    // Android followed every step with its own manifests, pointing at the same zip under ios/
    for (const f of ['manifest.json', 'manifest-beta.json']) {
      const a = read(f, 'android');
      const i = read(f);
      expect(a.platform).toBe('android');
      expect(i.platform).toBe('ios');
      expect(a.version).toBe(i.version);
      expect(a.url).toBe(i.url);
      expect(a.url).toContain(`/ios/${NATIVE_COMPAT}/bundles/`);
      expect(a.signature).not.toBe(i.signature);
    }
    expect(existsSync(join(updates, `android/${NATIVE_COMPAT}/bundles`))).toBe(false);
  });

  it('keeps a minNative per platform, and verifies each manifest with the public key', async () => {
    const fourth = utc(new Date(Date.now() + 60_000));
    build(fourth);
    run('--keep', '5', '--min-native-android', '1.2.0');
    expect(read('manifest-beta.json', 'android').minNative).toBe('1.2.0');
    expect(read('manifest-beta.json').minNative).toBe('1.0.0');
    const fifth = utc(new Date(Date.now() + 120_000));
    build(fifth);
    run('--keep', '5');
    expect(read('manifest-beta.json', 'android').minNative).toBe('1.2.0');
    expect(read('manifest-beta.json').minNative).toBe('1.0.0');
    const sixth = utc(new Date(Date.now() + 180_000));
    build(sixth);
    run('--keep', '5', '--min-native', '1.0.1');
    expect(read('manifest-beta.json', 'android').minNative).toBe('1.0.1');
    expect(read('manifest-beta.json').minNative).toBe('1.0.1');

    const { parseManifest, verifyManifest } = await import('../src/shell/manifest');
    const { spkiPem } = await import('../scripts/lib/capgo-crypto.mjs');
    const pem = spkiPem(keys.publicPem) as string;
    for (const platform of ['ios', 'android'] as const) {
      const m = parseManifest(read('manifest-beta.json', platform), NATIVE_COMPAT, false, platform);
      expect(m).not.toBeNull();
      expect(await verifyManifest(m!, pem)).toBe('ok');
    }

    // a rollback re-points both platforms; Android keeps its own minNative
    run('--rollback', `${fourth}-abc1234`);
    expect(read('manifest.json', 'android')).toMatchObject({ version: `${fourth}-abc1234`, rollback: true, minNative: '1.0.1' });
    expect(read('manifest.json')).toMatchObject({ version: `${fourth}-abc1234`, rollback: true, minNative: '1.0.0' });

    // a bundle from before the Android shell (its record has no `android`): only iOS rolls back
    const legacy = join(updates, `ios/${NATIVE_COMPAT}/bundles`, `${fifth}-abc1234.json`);
    const rec = JSON.parse(readFileSync(legacy, 'utf8'));
    expect(rec.android).toBe(true);
    delete rec.android;
    writeFileSync(legacy, JSON.stringify(rec));
    expect(run('--rollback', `${fifth}-abc1234`)).toContain('android: skipped');
    expect(read('manifest.json')).toMatchObject({ version: `${fifth}-abc1234`, rollback: true });
    expect(read('manifest-beta.json').version).toBe(`${fifth}-abc1234`);
    for (const f of ['manifest.json', 'manifest-beta.json']) expect(read(f, 'android').version).toBe(`${fourth}-abc1234`);
    expect(() => run('--rollback', `${fifth}-abc1234`, '--platform', 'android')).toThrow();
  });
});

describe('ota-publish promote while main is busy', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'plpub-busy-'));
    const keys = generateKeys() as { privatePem: string; publicPem: string };
    writeFileSync(join(dir, 'private.pem'), keys.privatePem);
    writeFileSync(join(dir, 'public.pem'), keys.publicPem);
    const www = join(dir, 'www');
    mkdirSync(www);
    writeFileSync(join(www, 'index.html'), '<!doctype html><title>t</title>');
    const updates = join(dir, 'updates');
    const env = { ...process.env, OTA_PRIVATE_KEY: '', OTA_PRIVATE_KEY_PATH: join(dir, 'private.pem'), OTA_PUBLIC_KEY_PATH: join(dir, 'public.pem'), OTA_WWW_DIR: www, OTA_UPDATES_DIR: updates };
    const run = (...a: string[]) => execFileSync(process.execPath, [script, ...a], { env, encoding: 'utf8' });
    const read = (f: string, platform = 'ios') => JSON.parse(readFileSync(join(updates, platform, String(NATIVE_COMPAT), f), 'utf8'));
    const publish = (hoursAgo: number) => {
      const seq = utc(new Date(Date.now() - hoursAgo * 3_600_000));
      writeFileSync(join(www, 'bundle.json'), JSON.stringify({ version: `${seq}-abc1234`, seq, compat: NATIVE_COMPAT, simVersion: 14 }));
      run('--keep', '5');
      return `${seq}-abc1234`;
    };
    return { run, read, publish };
  };

  it('promotes the newest soaked bundle even when a fresher beta landed since', () => {
    const { run, read, publish } = setup();
    const old = publish(60);
    run('--promote', '--soak-hours', '0');
    const soaked = publish(30);
    const fresh = publish(1);
    expect(read('manifest-beta.json').version).toBe(fresh);
    expect(read('manifest.json').version).toBe(old);
    expect(run('--promote')).toContain('promoted');
    expect(read('manifest.json').version).toBe(soaked);
    expect(read('manifest.json').rollback).toBe(false);
    expect(read('manifest-beta.json').version).toBe(fresh);
  });

  it('promotes a quiet beta once stable is a day behind, even if no bundle soaked 24 h', () => {
    const { run, read, publish } = setup();
    const old = publish(40);
    run('--promote', '--soak-hours', '0');
    publish(20);
    const quiet = publish(3);
    expect(read('manifest.json').version).toBe(old);
    expect(run('--promote')).toContain('behind');
    expect(read('manifest.json').version).toBe(quiet);
  });

  it('waits while beta is fresh even if stable is a day behind', () => {
    const { run, read, publish } = setup();
    const old = publish(40);
    run('--promote', '--soak-hours', '0');
    publish(0.5);
    expect(run('--promote')).toContain('promotes after');
    expect(read('manifest.json').version).toBe(old);
  });
});
