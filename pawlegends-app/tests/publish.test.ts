/**
 * scripts/ota-publish.mjs end to end with a throwaway key pair in a scratch folder: a new bundle lands on beta only,
 * `--promote` waits for the soak and then copies it to stable, and a rollback points both channels at a kept bundle.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateKeys } from '../scripts/lib/capgo-crypto.mjs';

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
  const read = (f: string) => JSON.parse(readFileSync(join(updates, 'ios/1', f), 'utf8'));
  const build = (seq: number) => writeFileSync(join(www, 'bundle.json'), JSON.stringify({ version: `${seq}-abc1234`, seq, compat: 1, simVersion: 14 }));

  it('publishes to beta, promotes after the soak, rolls both channels back', () => {
    const first = utc(new Date(Date.now() - 48 * 3_600_000));
    build(first);
    run('--keep', '5');
    expect(read('manifest-beta.json').version).toBe(`${first}-abc1234`);
    expect(existsSync(join(updates, 'ios/1/manifest.json'))).toBe(false);
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
  });

  it('V20-CHASE.md R8: with beta republished faster than it soaks, --promote takes the newest kept bundle that has soaked', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'plpub2-'));
    const env2 = { ...env, OTA_UPDATES_DIR: join(d2, 'updates') };
    const run2 = (...a: string[]) => execFileSync(process.execPath, [script, ...a], { env: env2, encoding: 'utf8' });
    const read2 = (f: string) => JSON.parse(readFileSync(join(d2, 'updates/ios/1', f), 'utf8'));
    const old = utc(new Date(Date.now() - 72 * 3_600_000));
    build(old);
    run2('--keep', '2');
    expect(run2('--promote')).toContain('promoted');
    const soaked = utc(new Date(Date.now() - 30 * 3_600_000));
    build(soaked);
    run2('--keep', '2');
    // three fresh betas after it (more than --keep): the soaked one is kept and promoted
    for (const h of [5, 3, 1]) {
      build(utc(new Date(Date.now() - h * 3_600_000)));
      run2('--keep', '2');
    }
    expect(existsSync(join(d2, 'updates/ios/1/bundles', `${soaked}-abc1234.zip`))).toBe(true);
    expect(run2('--promote')).toContain('promoted');
    expect(read2('manifest.json').version).toBe(`${soaked}-abc1234`);
    expect(read2('manifest.json').rollback).toBe(false);
  });
});
