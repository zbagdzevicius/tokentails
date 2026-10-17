// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { content } from '../content';
import { codec } from '../codec';
import type { EditorOverlay, PlayableRoom, RenderApi, Renderer, RoomDef, RoomMakerResult, RunResult } from '../types';
import { editor } from './index';
import type { RoomMakerOptionsX } from './RoomMaker';
import { validKitchen } from './test-util';

interface FakeRenderer extends Renderer {
  loads: PlayableRoom[];
  overlays: (EditorOverlay | null)[];
  disposed: number;
}

function fakeRenderer(): FakeRenderer {
  const r = {
    canvas: document.createElement('canvas'),
    loads: [] as PlayableRoom[],
    overlays: [] as (EditorOverlay | null)[],
    disposed: 0,
    async load(play: PlayableRoom) {
      r.loads.push(play);
    },
    frame() {},
    setTarget() {},
    setClipShot() {},
    onContextLost() {},
    dispose() {
      r.disposed++;
    },
    setLayout: vi.fn(),
    setEditorOverlay(o: EditorOverlay | null) {
      r.overlays.push(o);
    },
    // 10 px per cell: (x, z) is at client (x * 10 + 5, z * 10 + 5)
    pickCell(cx: number, cy: number) {
      const x = Math.floor(cx / 10);
      const z = Math.floor(cy / 10);
      return x >= 0 && z >= 0 && x < 12 && z < 10 ? { x, z, level: 0 as const } : null;
    },
  };
  return r as unknown as FakeRenderer;
}

const run = (targets: number): RunResult => ({ roomId: 'x', mode: 'practice', simVersion: 5, score: 1000, stamp: 'clean', rank: 'x', maxCombo: 1, seenCount: 0, targets, framed: 0, ticks: 100, timeline: '', inputs: [], events: [], finalHash: 0 });

function setup(over: Partial<RoomMakerOptionsX> = {}) {
  const r = fakeRenderer();
  const render = { createRenderer: vi.fn(() => r), renderFrames: vi.fn(), renderRoomStill: vi.fn(async () => null) } as unknown as RenderApi;
  const track = vi.fn();
  const onExit = vi.fn();
  const runs: number[] = [];
  const playtest = vi.fn(async (_room: RoomDef) => run(runs.shift() ?? 3));
  const host = document.createElement('div');
  document.body.append(host);
  const opts: RoomMakerOptionsX = {
    render,
    content,
    codec,
    author: 'Mia',
    playtest,
    linkFor: (room) => codec.buildLink({ room, ghosts: [] }, 'https://tokentails.com/badcat'),
    track,
    onExit,
    longPressMs: 20,
    ...over,
  };
  const done = editor.open(host, opts);
  const q = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const e = host.querySelector<T>(`[data-bce="${id}"]`);
    if (!e) throw new Error(`no [data-bce=${id}] in step ${host.querySelector<HTMLElement>('.bce')?.dataset.step}`);
    return e;
  };
  const click = (id: string): void => q<HTMLButtonElement>(id).click();
  const stage = (): HTMLElement => q('stage');
  const ptr = (type: string, x: number, z: number, dx = 5, dz = 5): void => {
    stage().dispatchEvent(new PointerEvent(type, { clientX: x * 10 + dx, clientY: z * 10 + dz, pointerId: 1, bubbles: true }));
  };
  const tap = (x: number, z: number): void => {
    ptr('pointerdown', x, z);
    ptr('pointerup', x, z);
  };
  const step = (): string => host.querySelector<HTMLElement>('.bce')?.dataset.step ?? '';
  const count = (): string => q('count').textContent ?? '';
  return { r, render, track, onExit, playtest, runs, host, done, q, click, ptr, tap, step, count, stage };
}

const flush = () => new Promise((res) => setTimeout(res, 0));
const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
const lv = (x: number, z: number): number => content.shells![0].levels[z * 12 + x];

afterEach(() => {
  document.body.replaceChildren();
});

describe('Room Maker flow', () => {
  it('step 1 shows the 6 maker shells and swaps the room on the renderer', async () => {
    const t = setup();
    await flush();
    expect(t.step()).toBe('shell');
    expect(t.host.querySelectorAll('[data-bce^="shell-"]').length).toBe(6);
    expect(t.host.querySelectorAll('svg.bce-thumb').length).toBe(6);
    expect(t.r.setLayout).toHaveBeenCalledWith('editor');
    expect(t.track).toHaveBeenCalledWith('bc_room_maker', expect.objectContaining({ step: 'open', props: 0 }));
    t.click('shell-3');
    await flush();
    expect(t.r.loads.at(-1)?.room.shell).toBe(3);
    expect(t.q('shell-3').classList.contains('is-on')).toBe(true);
    t.click('close');
    expect(await t.done).toEqual({ kind: 'cancelled' });
    expect(t.onExit).toHaveBeenCalledTimes(1);
    expect(t.r.disposed).toBe(1);
  });

  it('step 2: palette tabs, tap to place (snapped), tap to rotate, drag to move, long-press to delete, undo/redo', async () => {
    const t = setup();
    t.click('next');
    expect(t.step()).toBe('props');
    expect(t.host.querySelectorAll('[data-bce^="tab-"]').length).toBe(6);
    t.click('tab-food');
    expect(t.q('tab-food').classList.contains('is-on')).toBe(true);
    expect(t.host.querySelector('[data-bce="kind-roomba"]')).toBeNull();
    t.click('tab-fragile');
    t.click('kind-mug');
    // a counter cell (L2) and a floor cell
    let cx = -1;
    let cz = -1;
    for (let z = 0; z < 10 && cx < 0; z++) for (let x = 0; x < 12 && cx < 0; x++) if (lv(x, z) === 2) [cx, cz] = [x, z];
    t.tap(cx, cz);
    expect(t.count()).toBe('1/40');
    await flush();
    const placed = t.r.loads.at(-1)!.room.props[0];
    expect(placed).toMatchObject({ kind: 2, x: cx, z: cz, level: 2, rot: 0 });
    expect(t.track).toHaveBeenCalledWith('bc_room_maker', expect.objectContaining({ step: 'placed', props: 1 }));
    // tap again: rotate
    t.tap(cx, cz);
    await flush();
    expect(t.r.loads.at(-1)!.room.props[0].rot).toBe(1);
    // drag to the next free counter cell
    const nx = cx + 1;
    expect(lv(nx, cz)).toBe(2);
    t.ptr('pointerdown', cx, cz);
    t.ptr('pointermove', nx, cz);
    t.ptr('pointerup', nx, cz);
    await flush();
    expect(t.r.loads.at(-1)!.room.props[0]).toMatchObject({ x: nx, z: cz });
    // undo the move, redo it
    t.click('undo');
    await flush();
    expect(t.r.loads.at(-1)!.room.props[0]).toMatchObject({ x: cx, z: cz });
    t.click('redo');
    await flush();
    expect(t.r.loads.at(-1)!.room.props[0]).toMatchObject({ x: nx, z: cz });
    // long-press: delete
    t.ptr('pointerdown', nx, cz);
    await wait(40);
    t.ptr('pointerup', nx, cz);
    expect(t.count()).toBe('0/40');
    expect(t.host.querySelector('.bce-toast')?.textContent).toMatch(/Poof/);
    // a refused spot gets a cheeky toast
    const sh = content.shells![0];
    t.tap(sh.humanSpot.x, sh.humanSpot.z);
    expect(t.host.querySelector('.bce-toast')?.textContent).toMatch(/human/);
    // the chaos meter moves
    t.tap(cx, cz);
    expect(t.q('budget').textContent).toBe('100 / 3,000');
  });

  it('tablecloth (Fabric) gets the w x d resize controls', async () => {
    const t = setup();
    t.click('shell-4');
    t.click('next');
    t.click('tab-fabric');
    t.click('kind-tablecloth');
    const sh = content.shells![4];
    let at: [number, number] | null = null;
    for (let z = 0; z < 10 && !at; z++) for (let x = 0; x < 12 && !at; x++) if (sh.levels[z * 12 + x] === 2 && z > 2) at = [x, z];
    t.tap(at![0], at![1]);
    const cloth = t.q('cloth');
    expect(cloth.textContent).toMatch(/Tablecloth \d × \d/);
    const before = cloth.textContent;
    t.click('cloth-w-');
    expect(t.q('cloth').textContent).not.toBe(before);
  });

  it('step 3: the 4 maker humans and the room event', async () => {
    const t = setup();
    t.click('shell-3'); // Home office: has the webcam the WFH Worker needs
    t.click('next');
    t.click('next');
    expect(t.step()).toBe('human');
    const names = [...t.host.querySelectorAll('[data-bce^="routine-"] .bce-card-name')].map((e) => e.textContent);
    expect(names).toEqual(expect.arrayContaining(['Chef Dad', 'Couch Potato', 'WFH Worker', 'Napper']));
    expect(names.length).toBe(4);
    // only the events that fit a home office (no SPEECHES!, no KETTLE!)
    expect(t.host.querySelectorAll('[data-bce^="event-"]').length).toBe(5);
    expect(t.host.querySelector('[data-bce="event-7"]')).toBeNull();
    t.click('event-9');
    await flush();
    expect(t.r.loads.at(-1)!.room.event).toBe(9);
    t.click('routine-8');
    await flush();
    expect(t.r.loads.at(-1)!.room.routine).toBe(8);
  });

  it('remix -> targets (gold rings) -> clear (1 of 3) -> publish with link, card and ancestors', async () => {
    const initial: RoomDef = { ...validKitchen(3), id: 'ugc-abc', title: "Zyg's Kitchen", author: 'Zyg' };
    const t = setup({ initial });
    t.runs.push(0, 1);
    await flush();
    expect(t.step()).toBe('props');
    expect(t.track).toHaveBeenCalledWith('bc_room_maker', expect.objectContaining({ step: 'remix' }));
    t.click('next'); // human
    t.click('next'); // targets
    expect(t.step()).toBe('targets');
    expect(t.q('check-ok')).toBeTruthy();
    expect(t.r.overlays.at(-1)?.targets).toHaveLength(3);
    // untick one: the check complains and Next is blocked
    const tgt = initial.props.find((p) => p.target)!;
    t.tap(tgt.x, tgt.z);
    expect(t.r.overlays.at(-1)?.targets).toHaveLength(2);
    expect(t.q('errors').textContent).toMatch(/Mark 1 more/);
    t.click('next');
    expect(t.step()).toBe('targets');
    t.tap(tgt.x, tgt.z);
    expect(t.r.overlays.at(-1)?.targets).toHaveLength(3);
    t.click('next');
    expect(t.step()).toBe('clear');
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(true);
    // first run: 0 of 3, not enough
    t.click('play');
    await flush();
    await flush();
    expect(t.playtest).toHaveBeenCalledTimes(1);
    const played = t.playtest.mock.calls[0][0];
    expect(played.id).toMatch(/^ugc-/); // the decoded room receivers play
    expect(t.q('clear-msg').textContent).toMatch(/Zero wrecked/);
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(true);
    // second run: 1 of 3 clears it (round 2: publishing accepts 1 of 3)
    t.click('play');
    await flush();
    await flush();
    expect(t.q('clear-msg').textContent).toMatch(/Cleared/);
    expect(t.track).toHaveBeenCalledWith('bc_room_maker', expect.objectContaining({ step: 'cleared' }));
    t.click('next');
    expect(t.step()).toBe('publish');
    const title = t.q<HTMLInputElement>('title');
    expect(title.value).toBe("Zyg's Kitchen");
    title.value = 'Mia wrecks it www.spam.com';
    title.dispatchEvent(new Event('input'));
    expect(t.q('preview').textContent).toMatch(/Remix of “Zyg's Kitchen”/); // the original's own title (round 2)
    t.click('publish');
    for (let i = 0; i < 5; i++) await flush();
    expect(t.step()).toBe('done');
    expect(t.q<HTMLInputElement>('link').value).toMatch(/\/r\?r=/);
    t.click('done');
    const res: RoomMakerResult = await t.done;
    expect(res.kind).toBe('published');
    expect(res.room?.author).toBe('Mia');
    expect(res.room?.ancestors).toEqual(['Zyg']);
    expect(res.room?.title).not.toMatch(/spam/);
    expect(res.code && codec.decodeRoom!(res.code)?.id).toBe(res.room?.id);
    expect(res.link).toContain(encodeURIComponent(res.code!).slice(0, 10));
    expect(res.buildMs).toBeGreaterThanOrEqual(0);
    expect(t.track).toHaveBeenCalledWith('bc_room_maker', expect.objectContaining({ step: 'published', props: initial.props.length }));
    expect(t.onExit).toHaveBeenCalled();
    expect(res.card).toBeNull(); // happy-dom has no 2D canvas: the shell shares the link alone
  });

  it('editing after a clear locks Publish again', async () => {
    const t = setup({ initial: { ...validKitchen(), author: 'Zyg' } });
    t.click('next');
    t.click('next');
    t.click('next');
    t.click('play');
    await flush();
    await flush();
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(false);
    t.click('back'); // targets
    t.click('undo'); // undo the last edit of the remix? nothing to undo: the clear stays
    t.click('next');
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(false);
    t.click('back');
    const p = validKitchen().props.find((q) => q.target)!;
    t.tap(p.x, p.z); // untick
    t.tap(p.x, p.z); // tick again: same room, still cleared
    t.click('next');
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(false);
    t.click('back');
    t.click('back');
    t.click('back'); // props
    const c = validKitchen().props[0];
    t.tap(c.x, c.z); // rotate: the gameplay changed
    t.click('next');
    t.click('next');
    t.click('next');
    expect(t.step()).toBe('clear');
    expect(t.q<HTMLButtonElement>('next').disabled).toBe(true);
    expect(t.q('clear-msg').textContent).toMatch(/changed the room/);
  });

  it('speed build shows a 90 s clock and the badge', async () => {
    let now = 0;
    const t = setup({ speedBuild: true, now: () => now, initial: { ...validKitchen(), author: 'Zyg' } });
    expect(t.q('clock').textContent).toBe('⏱ 1:30');
    now = 3000;
    t.click('next');
    expect(t.q('clock').textContent).toBe('⏱ 1:27');
    t.click('next');
    t.click('next');
    now = 87_000;
    t.click('play');
    await flush();
    await flush();
    now = 120_000;
    t.click('next');
    expect(t.q('badge').textContent).toBe('⏱ built in 1:27');
    t.click('publish');
    for (let i = 0; i < 5; i++) await flush();
    t.click('share');
    const res = await t.done;
    expect(res.buildMs).toBe(87_000);
  });

  it('admin: every shell once by name, Export JSON, no budget', async () => {
    const t = setup({ admin: true });
    expect(t.host.querySelectorAll('[data-bce^="shell-"]').length).toBe(new Set(content.shells!.map((s) => s.name)).size);
    t.click('next');
    t.click('export');
    const json = JSON.parse(t.q<HTMLTextAreaElement>('export-json').value) as RoomDef;
    expect(json.shell).toBe(0);
    expect(Array.isArray(json.props)).toBe(true);
    expect(t.q('budget').textContent).toBe('0');
  });

  it('falls back to a tappable grid without a renderer, and never throws on analytics', async () => {
    const render = { createRenderer: () => { throw new Error('no webgl'); }, renderFrames: vi.fn() } as unknown as RenderApi;
    const host = document.createElement('div');
    document.body.append(host);
    const done = editor.open(host, {
      render,
      content,
      codec,
      author: 'Mia',
      playtest: async () => null,
      linkFor: () => '',
      track: () => {
        throw new Error('analytics down');
      },
      onExit: () => undefined,
    });
    expect(host.querySelector('[data-bce="grid"]')).toBeTruthy();
    expect(host.querySelectorAll('.bce-cell').length).toBe(120);
    (host.querySelector('[data-bce="close"]') as HTMLButtonElement).click();
    expect((await done).kind).toBe('cancelled');
  });
});

describe('room card', () => {
  function stubCanvas() {
    const texts: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_t, k) {
          if (k === 'fillText') return (s: string) => texts.push(s);
          if (k === 'measureText') return (s: string) => ({ width: s.length * 10 });
          if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
          return () => undefined;
        },
        set: () => true,
      },
    );
    const real = document.createElement.bind(document);
    const sizes: [number, number][] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const e = real(tag);
      if (tag === 'canvas') {
        (e as HTMLCanvasElement).getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
        (e as HTMLCanvasElement).toBlob = (cb: BlobCallback) => {
          sizes.push([(e as HTMLCanvasElement).width, (e as HTMLCanvasElement).height]);
          cb(new Blob(['png'], { type: 'image/png' }));
        };
      }
      return e;
    }) as typeof document.createElement);
    return { texts, sizes };
  }

  it('is 1200 x 630 with title, author, remix line, tagline and the speed badge (flat fallback)', async () => {
    const { makeRoomCard, CARD_TAGLINE } = await import('./publish');
    const s = stubCanvas();
    const room = { ...validKitchen(), title: "Zyg's Kitchen", author: 'Mia', ancestors: ['Zyg'] };
    const blob = await makeRoomCard(content.resolve(room, 'practice'), { title: "Zyg's Kitchen", author: 'Mia', remix: "Remix of Zyg's Kitchen by Mia", badge: 'built in 1:27', shellName: 'Kitchen' });
    vi.restoreAllMocks();
    expect(blob).toBeInstanceOf(Blob);
    expect(s.sizes).toEqual([[1200, 630]]);
    expect(s.texts).toEqual(expect.arrayContaining(["Zyg's Kitchen", 'by Mia · Kitchen', "Remix of Zyg's Kitchen by Mia", CARD_TAGLINE, 'built in 1:27']));
    expect(s.texts).toContain('☕'); // prop icons of the flat illustration
  });

  it('uses the renderer still when there is one', async () => {
    const { makeRoomCard } = await import('./publish');
    const s = stubCanvas();
    const g = globalThis as unknown as { createImageBitmap?: unknown };
    const had = g.createImageBitmap;
    g.createImageBitmap = async () => ({ close() {} });
    const still = vi.fn(async () => new Blob(['x']));
    const blob = await makeRoomCard(content.resolve(validKitchen(), 'practice'), { title: 'T', author: 'A', remix: '', badge: '', shellName: 'Kitchen' }, { renderRoomStill: still });
    g.createImageBitmap = had;
    vi.restoreAllMocks();
    expect(still).toHaveBeenCalledWith(expect.anything(), { w: 1200, h: 630 });
    expect(blob).toBeInstanceOf(Blob);
    expect(s.texts).not.toContain('☕');
  });
});

describe('review round 1: Remix today, tap snapping, the view area', () => {
  it('Remix today starts from the day layout within the maker limits', async () => {
    const t = setup();
    const btn = t.host.querySelector<HTMLButtonElement>('[data-bce="remix-today"]');
    expect(btn).not.toBeNull();
    btn!.click();
    await flush();
    expect(t.step()).toBe('props');
    const last = t.r.loads.at(-1)!.room;
    expect(last.props.length).toBeGreaterThan(5);
    expect(last.props.filter((p) => p.target).length).toBe(3);
  });
});
