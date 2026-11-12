// @vitest-environment happy-dom
/** Sim v22: the loading veil's 5v5 map preview draws from mapInfo, and only for Hearthwood. */
import { describe, expect, it } from 'vitest';
import { mapInfo } from '../../src/sim/map/info';
import { PREVIEW_KEY, drawMapPreview } from '../../src/ui/mapPreview';

describe('map preview (sim v22)', () => {
  it('is a labelled square canvas with a colour for every camp kind and pit', () => {
    const info = mapInfo('hearthwood');
    const c = drawMapPreview(info, 128);
    expect([c.width, c.height]).toEqual([128, 128]);
    expect(c.getAttribute('aria-label')).toMatch(/Hearthwood/);
    for (const cp of info.camps) expect(PREVIEW_KEY[cp.kind]).toMatch(/^#/);
    for (const o of info.objectives) expect(PREVIEW_KEY[o.kind]).toMatch(/^#/);
  });
});
