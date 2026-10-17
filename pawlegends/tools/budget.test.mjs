import { describe, expect, it } from 'vitest';
import { baseOf, distPath, firstLoadAssets, summarize } from './lib/budget-lib.mjs';

describe('budget-lib', () => {
  const html = '<script type="module" crossorigin src="/pawlegends-game/build/index-a.js"></script><link rel="modulepreload" href="/pawlegends-game/build/three-b.js"><link rel="stylesheet" href="/pawlegends-game/build/index-c.css">';
  it('finds first-load assets and the base', () => {
    const urls = firstLoadAssets(html);
    expect(urls.length).toBe(3);
    const base = baseOf(urls);
    expect(base).toBe('/pawlegends-game/');
    expect(urls.map((u) => distPath(u, base))).toEqual(['build/index-a.js', 'build/three-b.js', 'build/index-c.css']);
  });
  it('sums first-load JS and the total, and flags overs', () => {
    const files = [
      { file: 'build/index-a.js', raw: 1, gzip: 300_000 },
      { file: 'build/three-b.js', raw: 1, gzip: 200_000 },
      { file: 'build/index-c.css', raw: 1, gzip: 5_000 },
      { file: 'build/results-d.js', raw: 1, gzip: 90_000 },
    ];
    const s = summarize(files, ['build/index-a.js', 'build/three-b.js', 'build/index-c.css'], 450, 11_000_000, 10);
    expect(s.firstJs).toBe(500_000);
    expect(s.over).toBe(true);
    expect(s.totalOver).toBe(true);
    expect(summarize(files, ['build/index-a.js'], 450, 1, 10).over).toBe(false);
  });
});
