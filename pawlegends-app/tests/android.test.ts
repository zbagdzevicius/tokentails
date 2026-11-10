/**
 * The Android app's fixed decisions (docs/plans/moba/PLAY-STORE.md), checked from the committed project files so a
 * `cap add` / `cap sync` or a template update cannot silently undo them, plus Google Play's listing limits.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import config from '../capacitor.config';

const app = join(__dirname, '..');
const android = join(app, 'android');
const read = (p: string) => readFileSync(join(android, p), 'utf8');
const listing = join(app, 'fastlane/metadata_android/en-US');

describe('Android project', () => {
  it('serves from https://localhost (the origin the backend allows) and never changes it', () => {
    expect(config.server?.androidScheme).toBe('https');
    expect(config.server?.hostname).toBeUndefined();
    expect(config.appId).toBe('com.tokentails.pawlegends');
    expect(config.android?.adjustMarginsForEdgeToEdge).toBe('disable');
    const cors = readFileSync(join(app, '../backend/src/shared/cors-origins.ts'), 'utf8');
    expect(cors).toContain("'https://localhost'");
  });
  it('targets API 36 (Play rule since Aug 31 2026) with an AGP that supports it', () => {
    const vars = read('variables.gradle');
    expect(vars).toMatch(/compileSdkVersion = 36/);
    expect(vars).toMatch(/targetSdkVersion = 36/);
    expect(vars).toMatch(/minSdkVersion = 26/);
    const [, agp] = /com\.android\.tools\.build:gradle:([0-9.]+)/.exec(read('build.gradle')) ?? [];
    const [maj, min, patch] = agp.split('.').map(Number);
    expect(maj * 10000 + min * 100 + patch).toBeGreaterThanOrEqual(80901);
  });
  it('versions from package.json, a CI build number and env-only signing', () => {
    const g = read('app/build.gradle');
    expect(g).toContain('applicationId "com.tokentails.pawlegends"');
    expect(g).toContain('versionName plVersionName');
    expect(g).toContain("project.property('plVersionCode')");
    expect(g).toContain("System.getenv('ANDROID_UPLOAD_KEYSTORE_PATH')");
    expect(g).not.toMatch(/storePassword ['"]/);
  });
  it('locks landscape as a game, needs GLES 3, and allows no cleartext in release', () => {
    const m = read('app/src/main/AndroidManifest.xml');
    expect(m).toContain('android:screenOrientation="sensorLandscape"');
    expect(m).toContain('android:appCategory="game"');
    expect(m).toContain('android:glEsVersion="0x00030000"');
    expect(m).toContain('android:allowBackup="false"');
    expect(read('app/src/main/res/xml/network_security_config.xml')).not.toContain('cleartextTrafficPermitted="true"');
    expect(read('app/src/debug/res/xml/network_security_config.xml')).toContain('localhost');
    expect(m).not.toMatch(/ACCESS_FINE_LOCATION|CAMERA|RECORD_AUDIO|READ_CONTACTS/);
  });
  it('the shell injects the globals the page reads', () => {
    const p = read('app/src/main/java/com/tokentails/pawlegends/ShellPlugin.java');
    for (const g of ['__PL_CHANNEL__', "__PL_PLATFORM__ = 'android'", '__PL_THERMAL__', '__PL_DEVICE__', 'pl-thermal']) expect(p).toContain(g);
    expect(p).toContain('ORIGIN = "https://localhost"');
  });
  it('commits no keystore, build output or local SDK path', () => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'build' || e.name === '.gradle' ? [] : walk(join(d, e.name))) : [join(d, e.name)]));
    const ignored = readFileSync(join(app, '.gitignore'), 'utf8');
    expect(ignored).toMatch(/^\*\.jks$/m);
    expect(walk(android).filter((f) => /\.(jks|keystore|aab|apk)$/.test(f))).toEqual([]);
    expect(readFileSync(join(android, '.gitignore'), 'utf8')).toMatch(/^local\.properties$/m);
  });
});

describe('Google Play listing (fastlane/metadata_android)', () => {
  const text = (f: string) => readFileSync(join(listing, f), 'utf8').trim();
  it('text fits Play limits and says nothing about iPhone', () => {
    expect(text('title.txt').length).toBeLessThanOrEqual(30);
    expect(text('short_description.txt').length).toBeLessThanOrEqual(80);
    expect(text('full_description.txt').length).toBeLessThanOrEqual(4000);
    expect(text('changelogs/default.txt').length).toBeLessThanOrEqual(500);
    for (const f of ['title.txt', 'short_description.txt', 'full_description.txt', 'changelogs/default.txt']) expect(text(f)).not.toMatch(/iPhone|iPad|App Store|Apple/);
  });
  it('icon 512, feature graphic 1024 x 500 without alpha, 2-8 landscape 16:9 phone shots', async () => {
    const icon = await sharp(join(listing, 'images/icon.png')).metadata();
    expect([icon.width, icon.height]).toEqual([512, 512]);
    const fg = await sharp(join(listing, 'images/featureGraphic.png')).metadata();
    expect([fg.width, fg.height, fg.hasAlpha]).toEqual([1024, 500, false]);
    const dir = join(listing, 'images/phoneScreenshots');
    const shots = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(png|jpe?g)$/.test(f)) : [];
    expect(shots.length).toBeGreaterThanOrEqual(2);
    expect(shots.length).toBeLessThanOrEqual(8);
    for (const f of shots) {
      const m = await sharp(join(dir, f)).metadata();
      expect(m.width! / m.height!).toBeCloseTo(16 / 9, 2);
      expect(m.height).toBeGreaterThanOrEqual(1080);
      expect(m.hasAlpha).toBe(false);
    }
  });
});
