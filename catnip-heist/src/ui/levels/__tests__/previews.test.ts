import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEVEL_IDS } from '../../../levels';
import { getLevelPreview } from '../previews';

const ASSETS = resolve(__dirname, '../../../../public/assets');
const size = (rel: string) => statSync(resolve(ASSETS, rel)).size;

describe('level previews', () => {
  it('cover every campaign level with files that exist', () => {
    for (const id of LEVEL_IDS) {
      const p = getLevelPreview(id);
      expect(p, id).not.toBeNull();
      for (const rel of [p!.thumb, p!.thumb2x, p!.loop, p!.hero].filter(Boolean) as string[]) {
        expect(rel.startsWith('images/levels/'), rel).toBe(true);
        expect(existsSync(resolve(ASSETS, rel)), rel).toBe(true);
      }
      expect(p!.alt.length).toBeGreaterThan(20);
      expect(p!.loopType).toBe('video/mp4');
    }
  });

  it('returns null for an unknown level', () => {
    expect(getLevelPreview('custom-map')).toBeNull();
  });

  it('stay inside the size budget (stills <= 60 KB, all files <= 1.5 MB)', () => {
    let total = 0;
    for (const id of LEVEL_IDS) {
      const p = getLevelPreview(id)!;
      expect(size(p.thumb), p.thumb).toBeLessThanOrEqual(60 * 1024);
      expect(size(p.thumb2x!), p.thumb2x).toBeLessThanOrEqual(60 * 1024);
      expect(size(p.loop!), p.loop).toBeLessThanOrEqual(150 * 1024);
      total += size(p.thumb) + size(p.thumb2x!) + size(p.loop!);
    }
    expect(total).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
});
