/**
 * Fake GameServices for the shell flow tests (happy-dom). Every lane is a small fake; the sim scores 100 per
 * swat and ends after RUN_TICKS. Not shipped (only *.test.ts files import it).
 */
import {
  DEFAULT_CAT,
  NO_INPUT,
  type AnalyticsEvent,
  type DailyEntry,
  type DayRecord,
  type EnvInfo,
  type GameServices,
  type LinkState,
  type MoneyApi,
  type PaywallContext,
  type PaywallOffer,
  type PlayableRoom,
  type Profile,
  type Renderer,
  type RoomDef,
  type RunResult,
  type SimState,
  type TickInput,
} from '../types';

export const RUN_TICKS = 8;

export function fakeSim(): GameServices['sim'] {
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
      wish: 0,
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
    runToEnd(play, _cat, inputs) {
      const s = init(play);
      const ev: never[] = [];
      for (let i = 0; !s.ended; i++) this.stepSim(s, play, inputs[i] ?? NO_INPUT, ev);
      return { roomId: play.room.id, mode: play.mode, simVersion: 5, score: s.finalScore, stamp: 'perfect', rank: 'x', maxCombo: 1, seenCount: 0, targets: 0, framed: 0, ticks: s.tick, timeline: '', inputs: [...inputs], events: [], finalHash: 1 };
    },
    hashState: (s) => s.tick * 31,
  };
}

export const room = (id: string, title: string, extra: Partial<RoomDef> = {}): RoomDef => ({
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
  ...extra,
});

export interface World {
  services: GameServices;
  events: { e: AnalyticsEvent; p: Record<string, unknown> }[];
  days: Map<number, DayRecord>;
  kv: Map<string, unknown>;
  profile: { p: Profile };
  link: LinkState;
  env: EnvInfo;
  /** Options every catMaker.open got. */
  catmakerOpens: Record<string, unknown>[];
  /** Options every exportClip got. */
  exports: Record<string, unknown>[];
  entries: Map<number, Partial<DailyEntry>>;
  rooms: Map<number, RoomDef>;
  loaded: { cats: string[] }[];
}

export function world(link: LinkState, opts: { env?: Partial<EnvInfo>; shared?: World } = {}): World {
  const shared = opts.shared;
  const events = shared?.events ?? [];
  const days = shared?.days ?? new Map<number, DayRecord>();
  const kv = shared?.kv ?? new Map<string, unknown>();
  const profile = shared?.profile ?? {
    p: { cats: [DEFAULT_CAT], active: 0, createdAt: 0, sessions: 0, settings: { audio: false, reduceMotion: true, showPhotoInClips: true } },
  };
  const entries = shared?.entries ?? new Map<number, Partial<DailyEntry>>();
  const rooms = shared?.rooms ?? new Map<number, RoomDef>();
  const catmakerOpens: Record<string, unknown>[] = [];
  const exports: Record<string, unknown>[] = [];
  const loaded: { cats: string[] }[] = [];
  const env: EnvInfo = {
    isIOS: false,
    isAndroid: false,
    isTouch: true,
    inApp: 'none',
    dev: false,
    qa: true,
    presaleUrl: null,
    shortUrl: 'tokentails.com/badcat',
    canShareFiles: false,
    webcodecs: false,
    audioEncoder: false,
    ...(opts.env ?? {}),
  };
  const renderer = (): Renderer => ({
    canvas: document.createElement('canvas'),
    load: async (_p, cats) => void loaded.push({ cats: cats.map((c) => c.name) }),
    frame: () => undefined,
    setTarget: () => undefined,
    setClipShot: () => undefined,
    onContextLost: () => undefined,
    dispose: () => undefined,
  });
  const dailyRoom = (n: number): RoomDef => rooms.get(n) ?? room(`daily-${n}`, `Kitchen #${n}: Breakfast Heist`);
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
      consent: () => (kv.get('consent') as 'granted' | 'denied' | undefined) ?? 'unset',
      setConsent: (g) => void kv.set('consent', g ? 'granted' : 'denied'),
    },
    content: {
      dayNoFor: () => 18,
      dailyRoom,
      glassRoom: () => room('glass', 'The Glass'),
      pickerRooms: (n) => [{ room: room('glass', 'The Glass'), label: 'The Glass' }, ...Array.from({ length: 15 }, (_, i) => ({ dayNo: n - i, room: dailyRoom(n - i), label: `Kitchen #${n - i}` }))],
      resolve: (r, mode, dayNo) => ({ room: r, mode, dayNo, shell: {} as never, routine: { name: 'Chef Dad', cue: 'stove timer', kind: r.boss ? 'boss' : 'chef' } as never }),
      validate: () => ({ ok: true, errors: [], firstTargetTicks: 0 }),
      dailyEntry: (n) => ({ dayNo: n, date: '2026-11-16', weekday: 0, roomId: `daily-${n}`, title: dailyRoom(n).title ?? '', label: `Kitchen #${n}`, shell: 0, routine: 0, human: 'Chef Dad', event: 'Toast pops', targets: [], ...(entries.get(n) ?? {}) }) as DailyEntry,
      roomLabel: (n) => `Kitchen #${n}`,
      routines: [{ name: 'Chef Dad', kind: 'chef' }, { name: 'Grandma', kind: 'napper' }] as never,
    },
    codec: {
      encodeCat: () => 'AAAAAAAAAAAAAAA',
      decodeCat: (_c, name) => ({ ...DEFAULT_CAT, name: name ?? 'Guest' }),
      parseLink: () => link,
      buildLink: (s, base) => `${base}/d/${s.dayNo ?? 'glass'}${s.ghosts.length ? '?g=x' : ''}`,
      filterName: (r) => r.slice(0, 12),
      payloadHash: (p) => `h-${p}`,
    },
    sim: fakeSim(),
    render: { createRenderer: renderer, renderFrames: async () => undefined },
    createAudio: () => {
      throw new Error('no audio in tests');
    },
    catMaker: {
      open: async (_h, o) => {
        catmakerOpens.push(o as unknown as Record<string, unknown>);
        return { spec: { ...DEFAULT_CAT, name: 'Mochi' }, method: o.reAdd ? 'skipped' : 'manual' };
      },
      loadFace: async () => null,
      loadOpener: async () => null,
    },
    loadShare: async () => ({
      planClip: () => ({ matchCutTick: 0, crime: { prop: 0, fromTick: 0, breakTick: 1, toTick: 2 }, slowMo: { fromTick: 0, toTick: 1, speed: 0.35 }, pick: 'default', hook: '', urlLine: '' }),
      exportClip: async (_r, _rr, _p, _c, _run, o) => {
        exports.push(o as unknown as Record<string, unknown>);
        return { blob: new Blob(['mp4'], { type: 'video/mp4' }), mime: 'video/mp4', encoder: 'webcodecs', audio: false, ms: 5 };
      },
      shareClip: async () => 'download',
      copyHandoffLink: async () => true,
      formats: (ctx) => [
        { format: 'pov', artifact: 'clip', label: 'POV', caption: 'c', needsHandle: false, available: true },
        { format: 'household', artifact: 'clip', label: `${ctx.cat.name} vs ${ctx.secondName ?? 'your other cat'}`, caption: 'h', needsHandle: false, available: ctx.hasSecondCat },
      ],
    }),
  };
  return { services, events, days, kv, profile, link, env, catmakerOpens, exports, entries, rooms, loaded };
}

/** A fake money lane: offline status with checkout on, and a paywall that follows the GDD 9.2 gates. */
export function fakeMoney(over: Partial<MoneyApi> = {}): MoneyApi & { offers: PaywallContext[]; shown: PaywallOffer[] } {
  const offers: PaywallContext[] = [];
  const shown: PaywallOffer[] = [];
  const ent = { club: false, skus: [], cosmetics: [], maxCats: 1, freezesPerWeek: 1, archiveDays: 14, seasonTiers: 15, expiresAt: 0, source: 'free' as const };
  const card = (host: HTMLElement, cls: string, text: string, onClose?: () => void): (() => void) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    if (onClose) {
      const b = document.createElement('button');
      b.className = `${cls}-close`;
      b.textContent = 'close';
      b.onclick = onClose;
      d.append(b);
    }
    host.append(d);
    return () => d.remove();
  };
  const api: MoneyApi & { offers: PaywallContext[]; shown: PaywallOffer[] } = {
    offers,
    shown,
    status: async () => ({ enabled: true, checkout: true, cameos: false, gifts: false, restoreEmail: false, faceUploads: false, creatorCodes: false, brand: false, testMode: true }),
    entitlements: () => ent,
    refreshEntitlements: async () => ent,
    checkout: async () => ({ ok: false }),
    completeCheckout: async () => ({ status: 'complete', entitlements: { ...ent, club: true } }) as never,
    setClubCat: async () => true,
    restore: async () => ({ ok: true }),
    verifyRestore: async () => null,
    portal: async () => ({}),
    redeem: async () => ({ ok: false }) as never,
    cameos: async (dayNo) => ({ dayNo, shuffle: 0, spectators: [], fridge: [], guestStars: [], source: 'offline' }),
    seen: async () => null,
    uploadFace: async () => false,
    requestCreatorCode: async () => ({ ok: false }),
    paywall: (ctx) => {
      offers.push(ctx);
      if (ctx.sessionIndex < 2 || ctx.shownThisSession) return null;
      if ((ctx.trigger === 'post_share' || ctx.trigger === 'perfect_crime') && !ctx.afterShare) return null;
      if (ctx.trigger === 'gift_s1' || ctx.trigger === 'perfect_crime') return null;
      return { trigger: ctx.trigger, offer: 'club', sku: 'club_monthly', title: `Offer ${ctx.trigger}`, body: 'b', cta: 'Join', abArm: 'A' };
    },
    markPaywallShown: (o) => void shown.push(o),
    mount: {
      club: (h, p) => card(h, 'fake-club', 'club', p.onClose),
      thanks: (h, p) => {
        const un = card(h, 'fake-thanks', 'thanks');
        queueMicrotask(() => p.onDone({ status: 'complete', entitlements: { ...ent, club: true } } as never));
        return un;
      },
      redeem: (h) => card(h, 'fake-redeem', 'redeem'),
      restore: (h, p) => card(h, 'fake-restore', 'restore', p.onBack),
      cameo: (h, p) => card(h, 'fake-cameo', 'cameo', p.onClose),
      gift: (h, p) => card(h, 'fake-gift', 'gift', p.onClose),
      shop: (h, p) => card(h, 'fake-shop', 'shop', p.onClose),
      brand: (h, p) => card(h, 'fake-brand', 'brand', p.onClose),
      offerCard: (h, p) => {
        shown.push(p.offer);
        const un = card(h, 'fake-offer', p.offer.title, p.onDismiss);
        const yes = document.createElement('button');
        yes.className = 'fake-offer-yes';
        yes.textContent = 'yes';
        yes.onclick = () => p.onAccept();
        h.querySelector('.fake-offer')?.append(yes);
        return un;
      },
    },
    ...over,
  };
  return api;
}

export async function until(fn: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 15));
  }
}

export const qa = () => window.__BADCAT_QA__!;

export function click(sel: string, text?: string): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !text || e.textContent?.includes(text));
  if (!els.length) throw new Error(`no ${sel} ${text ?? ''}`);
  els[0].click();
}

export const inputs = (n: number): TickInput[] => Array.from({ length: n }, (_, i) => ({ dir: 0, speed: 0, buttons: i === 2 ? 1 : 0 }) as TickInput);

export async function playRun(): Promise<RunResult> {
  return qa().play(inputs(RUN_TICKS));
}
