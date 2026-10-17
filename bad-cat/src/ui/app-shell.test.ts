// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CAT,
  NO_INPUT,
  type AnalyticsEvent,
  type DayRecord,
  type EnvInfo,
  type GameServices,
  type LinkState,
  type PlayableRoom,
  type Profile,
  type Renderer,
  type RoomDef,
  type SimState,
  type TickInput,
} from '../types';
import { entryFromLink, startApp } from './app-shell';

const RUN_TICKS = 8;

function fakeSim(): GameServices['sim'] {
  const init = (play: PlayableRoom): SimState =>
    ({
      tick: 0,
      ticks: RUN_TICKS,
      ended: 0,
      score: 0,
      finalScore: 0,
      combo: 1,
      maxCombo: 1,
      suspicion: 0,
      seen: 0,
      seenCount: 0,
      targetsHit: 0,
      framed: 0,
      eventActive: 0,
      lastCall: 0,
      stamp: 0,
      caughtTick: -1,
      cat: { x: play.room.spawn.x, z: play.room.spawn.z, act: 0, carrying: -1, stepTicks: 0 },
      humans: [{ state: 0 }],
      props: [],
    }) as unknown as SimState;
  return {
    initSim: init,
    stepSim(s, _p, input, out) {
      s.tick++;
      if (input.buttons) {
        s.score += 100;
        out.push({ t: 'break', tick: s.tick, prop: 0, points: 100, combo: 1 });
      }
      if (s.tick >= s.ticks) {
        s.ended = 1;
        s.stamp = 1;
        s.finalScore = s.score + Math.floor(s.score / 4);
        out.push({ t: 'end', tick: s.tick });
      }
    },
    runToEnd(play, cat, inputs) {
      const s = init(play);
      const ev: never[] = [];
      for (let i = 0; !s.ended; i++) this.stepSim(s, play, inputs[i] ?? NO_INPUT, ev);
      void cat;
      return { roomId: play.room.id, mode: play.mode, simVersion: 1, score: s.finalScore, stamp: 'perfect', rank: 'x', maxCombo: 1, seenCount: 0, targets: 0, framed: 0, ticks: s.tick, timeline: '', inputs: [...inputs], events: [], finalHash: 1 };
    },
    hashState: (s) => s.tick * 31,
  };
}

const room = (id: string, title: string): RoomDef => ({
  id,
  shell: 0,
  routine: 0,
  event: 0,
  width: 12,
  depth: 10,
  spawn: { x: 1, z: 8 },
  props: [
    { kind: 1, x: 2, z: 0, level: 2, rot: 0, target: true },
    { kind: 2, x: 3, z: 0, level: 2, rot: 0, target: true },
    { kind: 7, x: 4, z: 0, level: 2, rot: 0, target: true },
  ],
  seed: 1,
  ticks: RUN_TICKS,
  title,
});

interface World {
  services: GameServices;
  events: { e: AnalyticsEvent; p: Record<string, unknown> }[];
  days: Map<number, DayRecord>;
  kv: Map<string, unknown>;
  profile: { p: Profile };
  link: LinkState;
}

function world(link: LinkState, shared?: World): World {
  const events = shared?.events ?? [];
  const days = shared?.days ?? new Map<number, DayRecord>();
  const kv = shared?.kv ?? new Map<string, unknown>();
  const profile = shared?.profile ?? {
    p: { cats: [DEFAULT_CAT], active: 0, createdAt: 0, sessions: 0, settings: { audio: false, reduceMotion: true, showPhotoInClips: true } },
  };
  const env: EnvInfo = { isIOS: false, isAndroid: false, isTouch: true, inApp: 'none', dev: false, qa: true, presaleUrl: 'https://buy.example/x', shortUrl: 'tokentails.com/badcat', canShareFiles: false, webcodecs: false, audioEncoder: false };
  const renderer = (): Renderer => ({
    canvas: document.createElement('canvas'),
    load: async () => undefined,
    frame: () => undefined,
    setTarget: () => undefined,
    setClipShot: () => undefined,
    onContextLost: () => undefined,
    dispose: () => undefined,
  });
  const services: GameServices = {
    platform: {
      env,
      store: { get: <T,>(k: string, f: T) => (kv.has(k) ? (kv.get(k) as T) : f), set: (k, v) => (kv.set(k, v), true), persistent: true },
      track: (e, p) => void events.push({ e, p: p ?? {} }),
      profile: () => profile.p,
      saveProfile: (p) => ((profile.p = p), true),
      dayRecord: (d) => days.get(d) ?? null,
      saveDayRecord: (d, r) => (days.set(d, r), true),
      presaleUrl: () => env.presaleUrl,
      vibrate: () => undefined,
    },
    content: {
      dayNoFor: () => 18,
      dailyRoom: (n) => room(`daily-${n}`, `Kitchen #${n}: Breakfast Heist`),
      glassRoom: () => room('glass', 'The Glass'),
      pickerRooms: (n) => [{ room: room('glass', 'The Glass'), label: 'The Glass' }, { dayNo: n, room: room(`daily-${n}`, 'k'), label: `Kitchen #${n}` }],
      resolve: (r, mode, dayNo) => ({ room: r, mode, dayNo, shell: {} as never, routine: { name: 'Chef Dad', cue: 'stove timer' } as never }),
      validate: () => ({ ok: true, errors: [], firstTargetTicks: 0 }),
    },
    codec: {
      encodeCat: () => 'AAAAAAAAAAAAAAA',
      decodeCat: () => null,
      parseLink: () => link,
      buildLink: (s, base) => `${base}/d/${s.dayNo ?? 'glass'}`,
      filterName: (r) => r.slice(0, 12),
    },
    sim: fakeSim(),
    render: { createRenderer: renderer, renderFrames: async () => undefined },
    createAudio: () => {
      throw new Error('no audio in tests');
    },
    catMaker: {
      open: async () => ({ spec: { ...DEFAULT_CAT, name: 'Mochi' }, method: 'skipped' }),
      loadFace: async () => null,
      loadOpener: async () => null,
    },
    loadShare: async () => ({
      planClip: () => ({ matchCutTick: 0, crime: { prop: 0, fromTick: 0, breakTick: 1, toTick: 2 }, slowMo: { fromTick: 0, toTick: 1, speed: 0.35 }, pick: 'default', hook: '', urlLine: '' }),
      exportClip: async () => ({ blob: new Blob(['mp4']), mime: 'video/mp4', encoder: 'webcodecs', audio: false, ms: 5 }),
      shareClip: async () => 'download',
      copyHandoffLink: async () => true,
    }),
  };
  return { services, events, days, kv, profile, link };
}

async function until(fn: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
}
const qa = () => window.__BADCAT_QA__!;
const click = (sel: string, text?: string): void => {
  const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !text || e.textContent?.includes(text));
  if (!els.length) throw new Error(`no ${sel} ${text ?? ''}`);
  els[0].click();
};
const inputs = (n: number): TickInput[] => Array.from({ length: n }, (_, i) => ({ dir: 0, speed: 0, buttons: i === 2 ? 1 : 0 }) as TickInput);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('entryFromLink', () => {
  it('classifies links', () => {
    expect(entryFromLink(null).kind).toBe('direct');
    expect(entryFromLink({ ghosts: [], pick: true, entry: 'typed' }).kind).toBe('typed');
    expect(entryFromLink({ ghosts: [], dayNo: 4 })).toEqual({ kind: 'daily_link', dayNo: 4, via: undefined });
    expect(entryFromLink({ ghosts: [], glass: true }).kind).toBe('glass');
    expect(entryFromLink({ ghosts: [], catCode: 'x' }).kind).toBe('cat_link');
    expect(entryFromLink({ ghosts: [], dayNo: 4, clip: true }).kind).toBe('clip_handoff');
  });
});

describe('app shell with fake services', () => {
  it('first link visit: FTUE order, no offer in session 1, then the ranked run is ready and counted once', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const w = world({ ghosts: [], dayNo: 16 });
    startApp(root, w.services);
    expect(qa().screen()).toBe('boot');
    await until(() => qa().screen() === 'linkIntro');
    click('.bc-boot');
    await until(() => qa().screen() === 'briefing'); // catmaker resolved "skipped" straight away
    expect(root.textContent).toContain('FIRST HEIST');
    const r = await qa().play(inputs(RUN_TICKS));
    expect(r.mode).toBe('ftue');
    expect(r.ticks).toBe(RUN_TICKS);
    expect(r.score).toBe(125);
    expect(r.stamp).toBe('perfect');
    await until(() => qa().screen() === 'result');
    expect(w.kv.get('ftueDone')).toBe(true);
    expect(w.days.size).toBe(0); // FTUE is not ranked
    click('.bc-share-btn');
    await until(() => qa().screen() === 'share');
    await until(() => !(document.querySelector('.bc-post') as HTMLButtonElement).disabled);
    click('.bc-link', 'Done');
    await until(() => qa().screen() === 'home');
    expect(root.textContent).toContain('Your ranked run for Kitchen #18 is ready');
    expect(root.textContent).not.toContain('pre-sale'); // session 1: no offer, no pre-sale button
    const names = w.events.map((x) => x.e);
    expect(names.indexOf('bc_boot')).toBeLessThan(names.indexOf('bc_run_start'));
    expect(names).toContain('bc_catmaker_done');
    expect(names).toContain('bc_run_end');
    expect(names).toContain('bc_clip_export');
    expect(names).not.toContain('bc_paywall_view');
    expect(w.events.find((x) => x.e === 'bc_run_start')!.p.ftue).toBe(true);

    // Ranked run of today, then "play again" is practice.
    click('.bc-today .bc-cta');
    await until(() => qa().screen() === 'briefing');
    expect(root.textContent).toContain('RANKED');
    const ranked = await qa().play(inputs(RUN_TICKS));
    expect(ranked.mode).toBe('ranked');
    await until(() => qa().screen() === 'result');
    expect(w.days.get(18)?.score).toBe(125);
    click('.bc-cta', 'Play again');
    await until(() => qa().screen() === 'briefing');
    expect(root.textContent).toContain('PRACTICE');
  }, 15000);

  it('session 2: a direct visit opens home with the pre-sale button and shows the offer once after a share', async () => {
    const first = world({ ghosts: [] });
    first.kv.set('ftueDone', true);
    first.profile.p = { ...first.profile.p, sessions: 1 };
    const root = document.createElement('div');
    document.body.appendChild(root);
    startApp(root, first.services);
    await until(() => qa().screen() === 'home');
    expect(root.textContent).toContain('pre-sale');
    click('.bc-room-card.is-glass');
    await until(() => qa().screen() === 'briefing');
    await qa().play(inputs(RUN_TICKS));
    await until(() => qa().screen() === 'result');
    click('.bc-share-btn');
    await until(() => qa().screen() === 'share');
    click('.bc-link', 'Done');
    await until(() => qa().screen() === 'offer');
    expect(first.events.some((x) => x.e === 'bc_paywall_view')).toBe(true);
    click('.bc-link', 'Not now');
    await until(() => qa().screen() === 'home');
  }, 15000);
});

describe('entryFromLink (FULL build)', () => {
  it('maps routes, remix and room links', async () => {
    const { entryFromLink } = await import('./app-shell');
    const room = { id: 'ugc-1' } as never;
    expect(entryFromLink({ ghosts: [], route: 'thanks', params: { session_id: 'cs_test_x' } })).toEqual({ kind: 'route', route: 'thanks', via: undefined });
    expect(entryFromLink({ ghosts: [], room, remix: true })).toEqual({ kind: 'route', route: 'maker', via: undefined });
    expect(entryFromLink({ ghosts: [], room })).toEqual({ kind: 'room_link', ugc: true, via: undefined });
    expect(entryFromLink({ ghosts: [{ inputs: [], cat: {} as never }], room })).toEqual({ kind: 'room_link', ugc: true, via: undefined });
    // The clip handoff of a player room replays in that room, not in today's daily room.
    expect(entryFromLink({ ghosts: [], room, clip: true })).toEqual({ kind: 'clip_handoff', ugc: true, via: undefined });
  });
});

describe('app shell: wave 2 wiring (Room Maker playtest, My rooms, meta screens)', () => {
  it('Build a room → playtest runs as a practice run → back in the maker → published → saved to My rooms', async () => {
    const w = world({ ghosts: [] });
    w.kv.set('ftueDone', true);
    w.profile.p = { ...w.profile.p, sessions: 1 };
    const saved: import('../types').MyRoom[] = [];
    const seen: string[] = [];
    let hostDuringRun: string | null = null;
    let playtestResult: import('../types').RunResult | null = null;
    w.services.progress = {
      recordRankedDay: () => ({ current: 1, best: 1 }),
      myRooms: () => saved,
      saveMyRoom: (_s, r) => void saved.push(r),
    };
    const screenDiv = (name: string) => (host: HTMLElement) => {
      seen.push(name);
      const d = document.createElement('div');
      d.className = `bc-screen fake-${name}`;
      d.textContent = name;
      host.appendChild(d);
      return () => d.remove();
    };
    w.services.meta = {
      archive: screenDiv('archive'),
      rapSheet: screenDiv('rapSheet'),
      season: screenDiv('season'),
      settings: screenDiv('settings'),
      friends: screenDiv('friends'),
      weekly: screenDiv('weekly'),
      consent: screenDiv('consent'),
      myRooms: (host, p) => {
        seen.push('myRooms');
        const d = document.createElement('div');
        d.className = 'bc-screen fake-rooms';
        d.textContent = p.rooms.map((r) => r.title).join(',');
        host.appendChild(d);
        return () => d.remove();
      },
    };
    const draft = { ...room('ugc-abc', 'Zyg Kitchen'), author: 'Mochi' };
    w.services.loadEditor = async () => ({
      check: () => ({ ok: true, errors: [], budget: 0 }),
      open: async (host, opts) => {
        const el = document.createElement('div');
        el.className = 'fake-editor';
        host.appendChild(el);
        playtestResult = await opts.playtest(draft);
        return { kind: 'published', room: draft, code: 'ROOMCODE', link: opts.linkFor(draft), buildMs: 4321, card: null };
      },
    });
    const root = document.createElement('div');
    document.body.appendChild(root);
    startApp(root, w.services);
    await until(() => qa().screen() === 'home');
    click('button', 'Build a room');
    await until(() => qa().screen() === 'briefing');
    expect(root.textContent).toContain('Zyg Kitchen');
    expect(root.textContent).toContain('PRACTICE');
    const host = root.querySelector<HTMLElement>('.bc-maker-host');
    expect(host).not.toBeNull();
    const r = qa().play(inputs(RUN_TICKS));
    await until(() => qa().screen() === 'run');
    hostDuringRun = host!.style.display;
    const res = await r;
    expect(res.mode).toBe('practice');
    await until(() => qa().screen() === 'rooms');
    expect(hostDuringRun).toBe('none');
    expect(playtestResult).not.toBeNull();
    expect(playtestResult!.score).toBe(125);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ code: 'ROOMCODE', title: 'Zyg Kitchen', author: 'Mochi', cleared: true, buildMs: 4321 });
    expect(root.textContent).toContain('Zyg Kitchen');
    expect(root.querySelector('.bc-maker-host')).toBeNull();
    // a playtest is never ranked and records nothing
    expect(w.days.size).toBe(0);
    expect(w.events.some((x) => x.e === 'bc_run_end' && x.p.playtest === true)).toBe(true);
    expect(seen).toContain('myRooms');
  }, 15000);

  it('quitting the playtest briefing hands null back to the maker', async () => {
    const w = world({ ghosts: [] });
    w.kv.set('ftueDone', true);
    w.profile.p = { ...w.profile.p, sessions: 1 };
    let got: unknown = 'pending';
    w.services.loadEditor = async () => ({
      check: () => ({ ok: true, errors: [], budget: 0 }),
      open: async (_host, opts) => {
        got = await opts.playtest(room('ugc-q', 'Quit Room'));
        return { kind: 'cancelled' };
      },
    });
    w.services.meta = { myRooms: () => () => undefined } as never;
    const root = document.createElement('div');
    document.body.appendChild(root);
    startApp(root, w.services);
    await until(() => qa().screen() === 'home');
    click('button', 'Build a room');
    await until(() => qa().screen() === 'briefing');
    click('.bc-briefing button', 'Back');
    await until(() => got !== 'pending');
    expect(got).toBeNull();
    await until(() => qa().screen() === 'home');
    expect(root.querySelector('.bc-maker-host')).toBeNull();
  }, 15000);
});
