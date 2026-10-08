// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShelterPayouts } from '../payouts';

// The title's 3D diorama is held while the payouts modal covers it. Without a GPU each diorama frame
// holds the main thread for seconds, so on a `?payouts` link the modal's rows waited for the scene.
const frames = { created: 0, starts: 0, stops: 0, running: false };
vi.mock('../../render/diorama', () => ({
  createDiorama: () => {
    frames.created++;
    return {
      renderer: {},
      get running() {
        return frames.running;
      },
      start() {
        frames.starts++;
        frames.running = true;
      },
      stop() {
        frames.stops++;
        frames.running = false;
      },
      dispose() {
        frames.running = false;
      },
    };
  },
}));

const { createUI } = await import('../ui');
type UI = ReturnType<typeof createUI>;

const empty = (): ShelterPayouts => ({ status: 'empty', totals: new Map(), chains: [], payouts: [] });
const manifest = { version: 1, frame: 48, cats: [], dogs: [], images: { coin: 'c.png', catnip: 'n.png', heart: 'h.png', paw: 'p.png', logo: 'l.png' } };

describe('title diorama under the payouts modal', () => {
  let ui: UI | null = null;
  afterEach(() => {
    ui?.dispose();
    ui = null;
    Object.assign(frames, { created: 0, starts: 0, stops: 0, running: false });
  });
  const makeUI = () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ui = createUI(document.getElementById('app')!, { manifest, base: '/a/', rail: false, deploymentsUrl: '/d.json', loadPayouts: async () => empty(), handlers: { onStart() {} } } as never);
    return ui;
  };

  it('a deep link (title, then the modal in the same task) draws no diorama frame until the modal closes', () => {
    const u = makeUI();
    u.showTitle();
    u.showPayouts();
    expect(u.payoutsOpen).toBe(true);
    expect(frames.running).toBe(false);
    u.hidePayouts();
    expect(frames.running).toBe(true);
  });

  it('opening the modal from the title holds the scene; closing it starts it again', () => {
    const u = makeUI();
    u.showTitle();
    expect(frames.running).toBe(true);
    u.showPayouts();
    expect(frames.running).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(u.payoutsOpen).toBe(false);
    expect(frames.running).toBe(true);
    expect(frames.created).toBe(1);
  });
});
