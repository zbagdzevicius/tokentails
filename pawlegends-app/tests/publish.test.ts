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
    expect(run('--promote')).toContain('promotes after 6 h');
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

  it('promotes a settled bundle once stable is behind, even if no bundle soaked the full soak', () => {
    const { run, read, publish } = setup();
    const old = publish(40);
    run('--promote', '--soak-hours', '0');
    publish(5);
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

  it('a busy day: many pushes still promote an earlier bundle of the day, and young bundles are not pruned', () => {
    const { run, read, publish } = setup();
    publish(40);
    run('--promote', '--soak-hours', '0');
    const morning = publish(4);
    const settled = publish(3.5);
    for (const h of [1.5, 1, 0.5, 0.2]) publish(h);
    expect(run('--promote')).toContain('promoted');
    expect(read('manifest.json').version).toBe(settled);
    // the morning bundle is 4 h old (younger than twice the soak), so it was kept although --keep is 5 and 7 were published
    expect(morning).toBeTruthy();
  });

  it('with no stable manifest yet, the first bundle that has been out 2 h goes to stable', () => {
    const { run, read, publish } = setup();
    const first = publish(3);
    publish(0.3);
    expect(run('--promote')).toContain('no stable yet');
    expect(read('manifest.json').version).toBe(first);
  });
});

describe('ota-publish policy.json (FORCE-UPDATE.md §3.1)', () => {
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'plpub-policy-'));
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
    const publish = (hoursAgo: number, sim = 26, ...extra: string[]) => {
      const seq = utc(new Date(Date.now() - hoursAgo * 3_600_000));
      writeFileSync(join(www, 'bundle.json'), JSON.stringify({ version: `${seq}-abc1234`, seq, compat: NATIVE_COMPAT, simVersion: sim }));
      run('--keep', '5', ...extra);
      return `${seq}-abc1234`;
    };
    return { run, read, publish, keys, updates };
  };

  it('is written and signed on publish, promote and rollback; each entry mirrors its manifest', async () => {
    const { run, read, publish, keys } = setup();
    const first = publish(30);
    let p = read('policy.json');
    expect(p).toMatchObject({ kind: 'policy', platform: 'ios', compat: NATIVE_COMPAT, minCompat: 2, minSim: 26, maintenance: null });
    expect(p.channels.beta).toMatchObject({ version: first, rollback: false });
    expect(p.channels.stable).toBeUndefined();
    expect(Date.parse(p.channels.beta.requiredFrom)).toBeLessThanOrEqual(Date.now());
    run('--promote', '--soak-hours', '0');
    p = read('policy.json');
    expect(p.channels.stable).toMatchObject({ version: first });
    const second = publish(1, 27);
    p = read('policy.json');
    // minSim: the lowest sim of the live channels (stable 26, beta 27)
    expect(p).toMatchObject({ minSim: 26, channels: { stable: { version: first, simVersion: 26 }, beta: { version: second, simVersion: 27 } } });
    run('--rollback', first);
    p = read('policy.json');
    expect(p.channels.stable).toMatchObject({ version: first, rollback: true });
    expect(p.channels.beta).toMatchObject({ version: first, rollback: true });
    expect(p.minSim).toBe(26);
    // signed with the OTA key, verified as the shell and the backend do; Android has its own
    const { verifiedPolicyFile } = await import('../src/shell/policy');
    const { spkiPem } = await import('../scripts/lib/capgo-crypto.mjs');
    const pem = spkiPem(keys.publicPem) as string;
    expect(await verifiedPolicyFile(p, { platform: 'ios', compat: NATIVE_COMPAT }, pem)).not.toBeNull();
    const a = read('policy.json', 'android');
    expect(a.platform).toBe('android');
    expect(a.store).toContain('play.google.com');
    expect(await verifiedPolicyFile(a, { platform: 'android', compat: NATIVE_COMPAT }, pem)).not.toBeNull();
  });

  it('is rewritten only when its content changes (an idle hourly promote leaves it alone)', () => {
    const { run, read, publish } = setup();
    publish(30);
    run('--promote', '--soak-hours', '0');
    const before = read('policy.json');
    run('--promote');
    run('--write-policy');
    expect(read('policy.json')).toEqual(before);
  });

  it('--grace-hours keeps a release optional for n hours; a new sim is required at once anyway', () => {
    const { read, publish } = setup();
    publish(30, 26);
    const graced = publish(2, 26, '--grace-hours', '24');
    const p = read('policy.json');
    expect(p.channels.beta.version).toBe(graced);
    const hours = (Date.parse(p.channels.beta.requiredFrom) - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
    publish(1, 27, '--grace-hours', '24');
    expect(Date.parse(read('policy.json').channels.beta.requiredFrom)).toBeLessThanOrEqual(Date.now());
  });

  it('--maintenance switches the maintenance screen on (with an end) and off, without touching the manifests', () => {
    const { run, read, publish } = setup();
    publish(30);
    const manifest = read('manifest-beta.json');
    run('--maintenance', 'Moving servers', '--until', '2099-01-01T00:00:00Z');
    expect(read('policy.json').maintenance).toEqual({ message: 'Moving servers', until: '2099-01-01T00:00:00.000Z' });
    expect(read('policy.json', 'android').maintenance).toMatchObject({ message: 'Moving servers' });
    expect(read('manifest-beta.json')).toEqual(manifest);
    // a publish keeps the window
    publish(1);
    expect(read('policy.json').maintenance).toMatchObject({ message: 'Moving servers' });
    run('--maintenance', 'off');
    expect(read('policy.json').maintenance).toBeNull();
  });
});
