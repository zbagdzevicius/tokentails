/**
 * Card skins (GDD §7.2): the committed family table is what the generator makes from the local sheets
 * (`npm run gen:skins --check`), and the PNG decoder reads every sheet.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../../src/render/skins/families.gen';

const ROOT = path.resolve(__dirname, '../..');

describe('gen-cat-skins', () => {
  it('--check matches the committed families.gen.ts', () => {
    const out = execFileSync(process.execPath, ['tools/gen-cat-skins.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('up to date (58 families)');
  });
  it('58 families, every one with a pattern and a face', () => {
    expect(Object.keys(FAMILIES).length).toBe(58);
    for (const [k, r] of Object.entries(FAMILIES)) {
      expect(['solid', 'tabby', 'points', 'spots', 'tuxedo', 'calico'], k).toContain(r.p);
      for (const v of [r.b, r.d, r.l, r.c, r.e, r.n, r.i]) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
