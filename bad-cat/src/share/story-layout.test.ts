import { describe, expect, it } from 'vitest';
import { STORY_CARD, storyBands, storyLowerLayout } from './image-card';

// Round 3 QA (full-r3-dl-1-bad-cat-story.png): the stat tiles and "Your cat next?" were drawn over the case-file
// checklist. Every band of the story card must sit below the previous one, inside the card.
describe('story card layout', () => {
  for (const rows of [0, 1, 2, 3]) {
    it(`no band overlaps the next with ${rows} Must-Wreck rows`, () => {
      const bands = storyBands(rows);
      for (const b of bands) {
        expect(b.y1, b.name).toBeGreaterThanOrEqual(b.y0);
        expect(b.y0, b.name).toBeGreaterThanOrEqual(0);
        expect(b.y1, b.name).toBeLessThanOrEqual(STORY_CARD.h);
      }
      for (let i = 1; i < bands.length; i++) {
        const a = bands[i - 1];
        const b = bands[i];
        if (a.y1 === a.y0) continue;
        expect(b.y0, `${b.name} starts below ${a.name}`).toBeGreaterThanOrEqual(a.y1);
      }
    });
  }

  it('lists all three Must-Wreck targets on the story card', () => {
    const lower = storyBands(3).find((b) => b.name === 'list')!;
    expect(lower.y1 - lower.y0).toBeGreaterThanOrEqual(3 * 52);
  });

  it('drops rows rather than overlapping when the panel is short', () => {
    const lay = storyLowerLayout(1000, 1400, 6);
    const [header, list, tiles, dare] = lay.bands;
    expect(list.y0).toBeGreaterThanOrEqual(header.y1);
    expect(tiles.y0).toBeGreaterThanOrEqual(list.y1);
    expect(dare.y0).toBeGreaterThanOrEqual(tiles.y1);
    expect(lay.rows).toBeLessThan(6);
  });
});
