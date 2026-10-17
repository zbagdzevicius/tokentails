import { describe, expect, it } from 'vitest';
import { createStudio, parseStudioBatch, studioCurrent, studioEnabled, studioExportOptions, studioFileName, studioHook, studioProgress, studioReducer, type StudioState } from './studio';

type S = StudioState<string>;
const run = (s: S, ...a: Parameters<typeof studioReducer<string>>[1][]) => a.reduce((x, y) => studioReducer<string>(x, y), s);

describe('studio session', () => {
  it('walks crop -> name -> practice -> render -> save, then the next cat (batch)', () => {
    let s = createStudio<string>([
      { photo: 'p1', handle: '@luna.mom' },
      { photo: 'p2', handle: 'dad_of_cats', name: 'Mochi', format: 'reply' },
    ]);
    expect(studioCurrent(s)!.step).toBe('crop');
    expect(studioCurrent(s)!.handle).toBe('luna.mom');
    s = run(s, { type: 'name', name: 'Luna' }); // out of order: ignored
    expect(studioCurrent(s)!.step).toBe('crop');
    s = run(s, { type: 'crop', crop: { x: 1, y: 2, w: 3, h: 4 } }, { type: 'name', name: 'Luna' }, { type: 'practiced', runId: 'r1' });
    expect(studioCurrent(s)!.step).toBe('render');
    expect(studioExportOptions(studioCurrent(s)!)).toEqual({ format: 'stitch', overlay: 'luna.mom' });
    expect(studioHook(studioCurrent(s)!)).toBe("I put @luna.mom's cat in my game");
    s = run(s, { type: 'render_failed', error: 'Clip interrupted' });
    expect(studioCurrent(s)!.error).toBe('Clip interrupted');
    s = run(s, { type: 'rendered', clipId: 'c1' }, { type: 'saved' });
    expect(s.current).toBe(1);
    expect(studioCurrent(s)!.format).toBe('reply');
    expect(studioHook(studioCurrent(s)!)).toBe('I put Mochi in the game');
    expect(studioProgress(s)).toEqual({ saved: 1, skipped: 0, total: 2, finished: false });
    s = run(s, { type: 'skip' });
    expect(studioProgress(s)).toEqual({ saved: 1, skipped: 1, total: 2, finished: true });
    expect(studioCurrent(s)).toBeNull();
    s = run(s, { type: 'add', items: [{ photo: 'p3', handle: 'x' }] });
    expect(s.current).toBe(2);
    expect(studioCurrent(s)!.id).toBe(3);
  });

  it('back, remove, select and non-batch mode', () => {
    let s = createStudio<string>([{ photo: 'a' }, { photo: 'b' }], false);
    s = run(s, { type: 'crop', crop: { x: 0, y: 0, w: 1, h: 1 } }, { type: 'back' });
    expect(studioCurrent(s)!.step).toBe('crop');
    s = run(s, { type: 'crop', crop: { x: 0, y: 0, w: 1, h: 1 } }, { type: 'name', name: '   ' });
    expect(studioCurrent(s)!.step).toBe('name');
    s = run(s, { type: 'name', name: 'Bean', handle: '@new' }, { type: 'practiced', runId: 'r' }, { type: 'rendered', clipId: 'c' }, { type: 'saved' });
    expect(s.current).toBe(0); // not batch: stays
    expect(studioCurrent(s)!.handle).toBe('new');
    s = run(s, { type: 'select', index: 1 }, { type: 'remove', index: 0 });
    expect(s.items).toHaveLength(1);
    expect(s.current).toBe(0);
    expect(studioCurrent(s)!.photo).toBe('b');
  });

  it('parses a batch list and names files', () => {
    expect(parseStudioBatch('@luna.mom Luna\n\nr: dad_of_cats, Mochi\nsome.one')).toEqual([
      { handle: 'luna.mom', name: 'Luna', format: 'stitch' },
      { handle: 'dad_of_cats', name: 'Mochi', format: 'reply' },
      { handle: 'some.one', name: '', format: 'stitch' },
    ]);
    const s = createStudio<string>([{ photo: 'p', handle: 'Luna.Mom', name: 'Luna Belle' }]);
    expect(studioFileName(studioCurrent(s)!)).toBe('badcat-luna.mom-luna-belle.mp4');
  });

  it('?studio=1 only in dev or with VITE_BADCAT_STUDIO', () => {
    expect(studioEnabled({ dev: true }, '?studio=1')).toBe(true);
    expect(studioEnabled({ dev: false, studioAllowed: false }, '?studio=1')).toBe(false);
    expect(studioEnabled({ studioAllowed: true }, '?x=1&studio=1')).toBe(true);
    expect(studioEnabled({ dev: true }, '?studio=10')).toBe(false);
  });
});
