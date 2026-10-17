import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

describe('share lazy loading', () => {
  it('index.ts has no static import of mediabunny or the encoders', () => {
    const src = read('./index.ts');
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s+['"]mediabunny['"]/m);
    expect(src).not.toMatch(/^\s*import\s+['"]mediabunny['"]/m);
    expect(src).not.toMatch(/^\s*import\s(?!type)[^;]*from\s+['"]\.\/clip\/encoder-(webcodecs|mediarecorder)['"]/m);
    expect(src).toMatch(/import\(['"]\.\/clip\/encoder-webcodecs['"]\)/);
  });

  it('no share module statically imports the encoders, the GIF encoder or mediabunny', () => {
    const files = ['./index.ts', './clip/pipeline.ts', './clip/compose.ts', './cards.ts', './formats.ts', './studio.ts', './clip/format-plan.ts', './clip/video-opener.ts', './share-sheet.ts'];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/^\s*import\s(?!type)[^;]*from\s+['"](\.\.?\/)*(clip\/)?(encoder-webcodecs|encoder-mediarecorder|gif)['"]/m);
      expect(src, f).not.toMatch(/from\s+['"]mediabunny['"]/);
    }
    expect(read('./index.ts')).toMatch(/import\(['"]\.\/clip\/gif['"]\)/);
    expect(read('./index.ts')).toMatch(/import\(['"]\.\/clip\/encoder-mediarecorder['"]\)/);
  });

  it('the WebCodecs encoder imports mediabunny only dynamically', () => {
    const src = read('./clip/encoder-webcodecs.ts');
    expect(src).not.toMatch(/^\s*import\s(?!type)[^;]*from\s+['"]mediabunny['"]/m);
    expect(src).toMatch(/import\(['"]mediabunny['"]\)/);
  });

  it('the module imports in Node and exposes the ShareApi', async () => {
    const m = await import('./index');
    expect(typeof m.share.planClip).toBe('function');
    expect(typeof m.share.exportClip).toBe('function');
    expect(typeof m.share.shareClip).toBe('function');
    expect(typeof m.share.copyHandoffLink).toBe('function');
    for (const k of ['formats', 'renderCard', 'renderCarousel', 'androidIntent', 'shareFiles'] as const) expect(typeof m.share[k], k).toBe('function');
    expect(m.share.androidIntent!('https://tokentails.com/badcat')).toBeNull(); // Node: not an Android in-app browser
  });
});
