import { describe, expect, it } from 'vitest';
import { CLIP_W } from '../../types';
import { fallBreak, fixtureRoom, fixtureRun } from '../test-fixtures';
import { DEFAULT_LAYOUT, clipGates, safeBox, type ClipLayout } from './gates';
import { planClip } from './highlights';

const plan = planClip(fixtureRun([...fallBreak(0, 900)]), fixtureRoom(), 'Mochi');

describe('clipGates', () => {
  it('passes for the default layout', () => {
    expect(clipGates(plan, DEFAULT_LAYOUT)).toEqual([]);
  });

  it('safe box keeps the top 11 %, right 16 % and bottom 25 % clear', () => {
    const b = safeBox(720, 1280);
    expect(b.y).toBe(141);
    expect(b.x + b.w).toBe(604);
    expect(b.y + b.h).toBe(960);
  });

  it('flags a watermark in the right 16 %', () => {
    const layout: ClipLayout = {
      ...DEFAULT_LAYOUT,
      watermark: { ...DEFAULT_LAYOUT.watermark, rect: { x: CLIP_W - 200, y: 160, w: 180, h: 52 } },
    };
    expect(clipGates(plan, layout)).toContain('watermark_outside_safe_box');
  });

  it('flags UI in the first second, a missing URL line in the last 2 s and a loop mismatch', () => {
    const layout: ClipLayout = {
      ...DEFAULT_LAYOUT,
      uiFromFrame: 0,
      watermark: { ...DEFAULT_LAYOUT.watermark, fromFrame: 10 },
      urlLine: { ...DEFAULT_LAYOUT.urlLine, fromFrame: 330 },
      lastFraming: 'room',
    };
    const v = clipGates(plan, layout);
    expect(v).toEqual(expect.arrayContaining(['ui_in_first_second', 'watermark_in_first_second', 'url_not_in_last_2s', 'loop_framing_mismatch']));
  });

  it('flags "link in bio", a long caption and a URL-less line', () => {
    expect(clipGates({ ...plan, hook: 'Link in bio!' })).toContain('link_in_bio');
    expect(clipGates({ ...plan, hook: 'x'.repeat(80) })).toContain('caption_too_long');
    expect(clipGates({ ...plan, urlLine: '' })).toContain('url_line_missing');
  });
});
