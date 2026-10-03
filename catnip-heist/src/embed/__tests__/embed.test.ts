import { describe, expect, it, vi } from 'vitest';
import { HEIST_BRIDGE_CHANNEL, HEIST_BRIDGE_VERSION, isHeistToHostMessage } from '../../shared-contracts/heist-bridge';
import { HEIST_MUSIC_VOLUME, HEIST_SFX_VOLUME } from '../../audio';
import { applyInsets, clampInsets, createHeistBridgeClient, EMBED_SEED, heistVolumesFor, HOST_DEFAULT_EFFECTS_VOLUME, HOST_DEFAULT_MUSIC_VOLUME, installEmbed, MAX_INSET_PX, newRunId, readLaunchParams, type EmbeddableApp, type HostAudioSettings } from '..';

const ORIGIN = 'https://tokentails.com';

function fakeWindow(origin = ORIGIN) {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    location: { origin },
    addEventListener: (_type: 'message', fn: (event: MessageEvent) => void) => void listeners.add(fn),
    removeEventListener: (_type: 'message', fn: (event: MessageEvent) => void) => void listeners.delete(fn),
    dispatch(data: unknown, source: unknown, from = origin) {
      listeners.forEach((fn) => fn({ data, source, origin: from } as MessageEvent));
    },
    count: () => listeners.size,
  };
}

const parentOf = () => {
  const posted: Array<{ message: unknown; origin: string }> = [];
  return { posted, postMessage: (message: unknown, origin: string) => void posted.push({ message, origin }) };
};

const env = (type: string, extra: Record<string, unknown> = {}) => ({ channel: HEIST_BRIDGE_CHANNEL, v: HEIST_BRIDGE_VERSION, type, ...extra });
const INSETS = { top: 47, right: 0, bottom: 34, left: 0 };
const LOG = { levelId: 'heist-01', simVersion: 3, seed: 1, catIds: ['bob', 'oreo'] as [string, string], ticks: 3, runs: [[1, 0, 0, 3]] as [number, number, number, number][] };

describe('launch params', () => {
  it('forces the campaign seed and ignores ?replay without qa=1 in embed mode', () => {
    expect(readLaunchParams('?embed=1&seed=99&replay=solution', true)).toEqual({ embed: true, qa: false, seed: EMBED_SEED, replay: null });
    expect(readLaunchParams('?embed=1&replay=last', true).replay).toBeNull();
    expect(readLaunchParams('?embed=1&qa=1&replay=solution', true)).toEqual({ embed: true, qa: true, seed: 1, replay: 'solution' });
  });

  it('keeps standalone behaviour, and embed=1 without a parent frame is standalone', () => {
    expect(readLaunchParams('?seed=99&replay=solution', false)).toEqual({ embed: false, qa: false, seed: 99, replay: 'solution' });
    expect(readLaunchParams('?embed=1&seed=7', false)).toMatchObject({ embed: false, seed: 7 });
    expect(readLaunchParams('?seed=-3&replay=other', false)).toMatchObject({ seed: 1, replay: null });
  });
});

describe('insets', () => {
  it('clamps hostile values and writes the overlay and document variables', () => {
    expect(clampInsets({ top: -4, right: 1e6, bottom: Number.NaN, left: 12.6 })).toEqual({ top: 0, right: MAX_INSET_PX, bottom: 0, left: 13 });
    const ui = new Map<string, string>();
    const doc = new Map<string, string>();
    applyInsets({ style: { setProperty: (k: string, v: string) => void ui.set(k, v) } }, { style: { setProperty: (k: string, v: string) => void doc.set(k, v) } }, INSETS);
    expect(Object.fromEntries(ui)).toEqual({ '--ch-sat': '47px', '--ch-sar': '0px', '--ch-sab': '34px', '--ch-sal': '0px' });
    expect(doc.get('--tt-inset-top')).toBe('47px');
  });
});

describe('bridge client', () => {
  it('announces ready, answers every hello from the parent and ignores other sources and origins', () => {
    const win = fakeWindow();
    const parent = parentOf();
    const onConnect = vi.fn();
    const client = createHeistBridgeClient(win, parent, { onConnect });
    expect(parent.posted).toHaveLength(1);
    win.dispatch(env('hello'), parent);
    win.dispatch(env('hello'), parent);
    win.dispatch(env('hello'), {}); // not our parent
    win.dispatch(env('hello'), parent, 'https://evil.example'); // not our origin
    win.dispatch({ type: 'hello' }, parent); // no envelope
    expect(parent.posted).toHaveLength(3);
    expect(parent.posted.every((p) => p.origin === ORIGIN && (p.message as { type: string }).type === 'ready')).toBe(true);
    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(true);
    client.dispose();
    expect(win.count()).toBe(0);
  });

  it('posts nothing to an opaque origin', () => {
    const parent = parentOf();
    createHeistBridgeClient(fakeWindow('null'), parent).exit();
    expect(parent.posted).toHaveLength(0);
  });

  it('sends well-formed run-complete, request-sign-in and exit messages', () => {
    const parent = parentOf();
    const client = createHeistBridgeClient(fakeWindow(), parent);
    client.runComplete({ runId: 'run-1', won: true, levelId: 'heist-01', log: LOG });
    client.requestSignIn();
    client.exit();
    const sent = parent.posted.slice(1).map((p) => p.message);
    expect(sent.map((m) => (m as { type: string }).type)).toEqual(['run-complete', 'request-sign-in', 'exit']);
    expect(sent.every(isHeistToHostMessage)).toBe(true);
  });
});

describe('installEmbed', () => {
  function app() {
    const calls: string[] = [];
    const vars = new Map<string, string>();
    const a: EmbeddableApp & { calls: string[]; vars: Map<string, string>; merged: unknown[]; audio: HostAudioSettings[] } = {
      calls,
      vars,
      merged: [],
      audio: [],
      ui: {
        root: { style: { setProperty: (k: string, v: string) => void vars.set(k, v) } },
        setSignedIn: (v) => void calls.push(`signedIn:${v}`),
      },
      progress: {
        mergeServer(levels) {
          a.merged.push(levels);
          return true;
        },
      },
      hostPause: () => void calls.push('pause'),
      refreshLevels: () => void calls.push('refresh'),
      hostAudio: (settings) => void a.audio.push(settings),
    };
    return a;
  }

  it('applies the session (insets, sign-in state, merged progress) and host pauses', () => {
    const win = fakeWindow();
    const parent = parentOf();
    const target = app();
    installEmbed(win, parent, null, () => target);
    const progress = { levels: { 'heist-01': { won: true, bestScore: 180, stars: 3 } } };
    win.dispatch(env('session', { signedIn: true, progress, insets: INSETS }), parent);
    expect(target.vars.get('--ch-sat')).toBe('47px');
    expect(target.merged).toEqual([progress.levels]);
    win.dispatch(env('pause'), parent);
    win.dispatch(env('save-result', { runId: 'run-1', status: 'saved' }), parent);
    // Save results stay on the host's chip: nothing is repeated in the Heist.
    expect(target.calls).toEqual(['signedIn:true', 'refresh', 'pause']);
  });

  it('calls onFirstSession once, after the first session (and its progress) is applied', () => {
    const win = fakeWindow();
    const parent = parentOf();
    const target = app();
    const seen: number[] = [];
    installEmbed(win, parent, null, () => target, () => seen.push(target.merged.length));
    win.dispatch(env('session', { signedIn: false, progress: { levels: {} }, insets: INSETS }), parent);
    win.dispatch(env('session', { signedIn: true, progress: { levels: {} }, insets: INSETS }), parent);
    expect(seen).toEqual([1]);
  });

  it("applies the shell's sound settings and ignores malformed ones", () => {
    const win = fakeWindow();
    const parent = parentOf();
    const target = app();
    installEmbed(win, parent, null, () => target);
    win.dispatch(env('audio', { muted: true, musicVolume: 0.4, effectsVolume: 0.6 }), parent);
    win.dispatch(env('audio', { muted: false, musicVolume: 2, effectsVolume: 0.6 }), parent); // out of range
    win.dispatch(env('audio', { muted: false, musicVolume: 0.2, effectsVolume: 0.6 }), {}); // another window
    expect(target.audio).toEqual([{ muted: true, musicVolume: 0.4, effectsVolume: 0.6 }]);
  });

  it("maps the shell's volumes onto the Heist mix: its defaults give the authored gains", () => {
    expect(heistVolumesFor({ musicVolume: HOST_DEFAULT_MUSIC_VOLUME, effectsVolume: HOST_DEFAULT_EFFECTS_VOLUME })).toEqual({
      sfx: HEIST_SFX_VOLUME,
      music: HEIST_MUSIC_VOLUME,
    });
    expect(heistVolumesFor({ musicVolume: 0, effectsVolume: 0 })).toEqual({ sfx: 0, music: 0 });
    expect(heistVolumesFor({ musicVolume: 1, effectsVolume: 1 })).toEqual({ sfx: 1, music: 1 });
    expect(heistVolumesFor({ musicVolume: 0.2, effectsVolume: 0.3 }).music).toBeCloseTo(HEIST_MUSIC_VOLUME / 2);
  });

  it('gives every forwarded run its own id', () => {
    const parent = parentOf();
    const embed = installEmbed(fakeWindow(), parent, null, () => null);
    const a = embed.runComplete({ won: true, levelId: 'heist-01', log: LOG });
    const b = embed.runComplete({ won: false, levelId: 'heist-01', log: LOG });
    expect(a).not.toBe(b);
    expect(newRunId(0, () => 0.5)).toBe(`run-0-${Math.floor(0.5 * 0xffffffff).toString(36)}`);
    expect(a.length).toBeLessThanOrEqual(64);
  });
});
