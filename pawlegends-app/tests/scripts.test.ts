/**
 * The release scripts' building blocks: the reproducible zip (read back with the system unzip) and the haptics
 * bridge that maps the game's vibrate patterns to the Taptic Engine.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFiles, zipBuffers, zipDir } from '../scripts/lib/zip.mjs';
import { impactsFor, installVibrate, styleFor } from '../src/shell/haptics';

describe('zip', () => {
  it('is reproducible and readable by unzip, with index.html at the root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plzip-'));
    mkdirSync(join(dir, 'build'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title>'.repeat(50));
    writeFileSync(join(dir, 'build/app.js'), 'console.log(1)');
    writeFileSync(join(dir, '.DS_Store'), 'junk');
    expect(listFiles(dir)).toEqual(['build/app.js', 'index.html']);
    const a = zipDir(dir);
    const b = zipDir(dir);
    expect(a.equals(b)).toBe(true);
    const out = join(dir, 'out.zip');
    writeFileSync(out, a);
    const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' });
    expect(listing).toContain('index.html');
    expect(listing).toContain('build/app.js');
    const dest = join(dir, 'x');
    execFileSync('unzip', ['-q', out, '-d', dest]);
    expect(readFileSync(join(dest, 'build/app.js'), 'utf8')).toBe('console.log(1)');
  });
  it('stores small entries that do not compress', () => {
    const z: Buffer = zipBuffers([{ name: 'a', data: Buffer.from('x') }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50);
    expect(z.readUInt16LE(8)).toBe(0);
  });
});

describe('haptics bridge', () => {
  it('maps buzz lengths to impact styles', () => {
    expect(styleFor(8)).toBe('LIGHT');
    expect(styleFor(15)).toBe('MEDIUM');
    expect(styleFor(200)).toBe('HEAVY');
    expect(styleFor(0)).toBeNull();
  });
  it('plays the buzzes of a vibrate-pause-vibrate pattern at their times', () => {
    expect(impactsFor([10, 40, 10])).toEqual([
      { at: 0, style: 'LIGHT' },
      { at: 50, style: 'LIGHT' },
    ]);
  });
  it('installs navigator.vibrate only where it is missing', () => {
    const calls: string[] = [];
    const later: number[] = [];
    const nav = {} as Navigator;
    expect(installVibrate(nav, { impact: async (o) => void calls.push(o.style) }, (_fn, ms) => later.push(ms))).toBe(true);
    expect((nav as unknown as { vibrate: (p: number[]) => boolean }).vibrate([25, 40, 8])).toBe(true);
    expect(calls).toEqual(['HEAVY']);
    expect(later).toEqual([65]);
    const real = { vibrate: () => true } as unknown as Navigator;
    expect(installVibrate(real, { impact: async () => undefined })).toBe(false);
  });
  it('force replaces the WebView vibrate (Android)', () => {
    const calls: string[] = [];
    const nav = { vibrate: () => false } as unknown as Navigator;
    expect(installVibrate(nav, { impact: async (o) => void calls.push(o.style) }, setTimeout, true)).toBe(true);
    expect((nav as unknown as { vibrate: (p: number) => boolean }).vibrate(8)).toBe(true);
    expect(calls).toEqual(['LIGHT']);
  });
});
