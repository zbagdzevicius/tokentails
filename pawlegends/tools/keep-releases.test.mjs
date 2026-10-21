import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANIFEST, planReleases, recordRelease } from './lib/keep-releases.mjs';

// R2: a redeploy keeps the previous releases' hashed build/ files, so an open tab's next match still loads its Worker.

describe('keep-releases', () => {
  it('first run keeps what is on disk as one earlier release', () => {
    const p = planReleases(null, ['index-b.js', 'w-b.js'], ['index-a.js', 'w-a.js', 'index-b.js', 'w-b.js']);
    expect(p.releases).toEqual([['index-b.js', 'w-b.js'], ['index-a.js', 'w-a.js']]);
    expect(p.remove).toEqual([]);
  });

  it('prunes files older than the kept releases, keeping files shared with a kept one', () => {
    const prev = [['three.js', 'x2.js'], ['three.js', 'x1.js'], ['old.js', 'x0.js']];
    const p = planReleases(prev, ['three.js', 'x3.js'], ['three.js', 'x0.js', 'x1.js', 'x2.js', 'x3.js', 'old.js', 'stray.js'], 3);
    expect(p.releases).toEqual([['three.js', 'x3.js'], ['three.js', 'x2.js'], ['three.js', 'x1.js']]);
    expect(p.remove).toEqual(['old.js', 'stray.js', 'x0.js']);
  });

  it('a rebuild of the same sources does not push the older releases out', () => {
    const prev = [['a.js'], ['b.js']];
    const p = planReleases(prev, ['a.js'], ['a.js', 'b.js'], 2);
    expect(p.releases).toEqual([['a.js'], ['b.js']]);
    expect(p.remove).toEqual([]);
  });

  it('records the manifest and removes stale files outside build/', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-keep-'));
    const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'pl-pub-'));
    fs.mkdirSync(path.join(dir, 'build'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.mkdirSync(path.join(pub, 'assets'));
    fs.writeFileSync(path.join(pub, 'assets', 'cat.png'), 'x');
    for (const f of ['build/w-a.js', 'build/w-b.js', 'index.html', 'assets/cat.png', 'assets/gone.png']) fs.writeFileSync(path.join(dir, f), 'x');
    const r1 = recordRelease(dir, ['index.html', 'build/w-b.js'], pub);
    expect(r1.removed).toEqual(['assets/gone.png']);
    expect(JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')).releases).toEqual([['w-b.js'], ['w-a.js']]);
    fs.writeFileSync(path.join(dir, 'build/w-c.js'), 'x');
    const r2 = recordRelease(dir, ['index.html', 'build/w-c.js'], pub, 2);
    expect(r2.removed).toEqual(['build/w-a.js']);
    expect(fs.readdirSync(path.join(dir, 'build')).sort()).toEqual(['w-b.js', 'w-c.js']);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(pub, { recursive: true, force: true });
  });
});
