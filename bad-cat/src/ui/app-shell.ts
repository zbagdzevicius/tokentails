/**
 * App shell: owns the stage (renderer canvas + HUD + touch controls), the screen layer, the router, the
 * live run and the clip job. Other lanes are reached only through GameServices (plus swatTarget).
 */
import './styles.css';
import { swatTarget } from '../sim';
import { accompliceFor, pinkPawWaiting, platformOf, cosmeticsForSkus, formatTreatMeter, fridayCriminal, linkAttribution, pinkPawAdoptUrl, pinkPawBadge, pinkPawCatSpec, qrSvg, livePinkPawStatus, setLivePinkPawStatus } from '../platform';
import { cosmeticFromKey, crimeDef, exportSave, importSave, wearOwned } from '../progress';
import {
  COSMETICS,
  DEFAULT_CAT,
  propKind,
  BOSS_TICKS,
  ROOM_EVENT_NAMES,
  RUN_TICKS,
  TICK_HZ,
  SIM_VERSION,
  type AccompliceView,
  type AnalyticsEvent,
  type AnalyticsProps,
  type AudioEngine,
  type BadcatServerStatus,
  type BadcatSku,
  type CameoBundle,
  type CheckoutMeta,
  type Entitlements,
  type PaywallContext,
  type PaywallOffer,
  type PaywallTrigger,
  type CatSpec,
  type DayRecord,
  type EnvInfo,
  type FormatTemplate,
  type FriendGhost,
  type MyRoom,
  type OnlineFeatures,
  type OnlineSession,
  type RankedSaveOutcome,
  type FeedRoom,
  type RoomMakerResult,
  type ShareFormat,
  type PlatformApi,
  type FaceDecal,
  type GameServices,
  type GhostRef,
  type HouseholdSecond,
  type LinkState,
  type PlayableRoom,
  type Profile,
  type Renderer,
  type RoomDef,
  type RunResult,
  type TickInput,
} from '../types';
import { LINK_ROUTES } from '../codec/link';
import { humanLine } from './hud/copy-hud';
import { roomThumbSvg } from '../meta/room-thumb';
import { catFaceSvg } from '../meta/cat-face';
import { ClipJob } from './clip-job';
import { emojiCard as chatCard } from '../share/emoji-card';
import { COPY, formatScore, isShareableDay, kitchenLabel, propEmoji, roomLabel, shareText } from './copy';
import { btn, copyText, h, toast } from './dom';
import { createInput, type GameInput } from './input/source';
import { encodeInputs } from '../sim';
import { Router, planFor, type Entry, type RouterState, type RunPlan, type SheetKind } from './router';
import { RunSession } from './run';
import { mountBoot } from './screens/Boot';
import { mountBriefing } from './screens/Briefing';
import { createHud, targetName, type Hud } from './screens/Hud';
import { mountHome } from './screens/Home';
import { mountPicker, type PickerItem } from './screens/Picker';
import { mountResult } from './screens/Result';
import { mountShare, type ShareHandle } from './screens/Share';
import { mountOffer, mountSettings } from './screens/Side';
import { mountRapSheet } from './screens/RapSheet';
import { mountStudio, type StudioHandle } from './screens/Studio';
import { mountSidePanels, type SidePanels } from './screens/SidePanels';
import {
  analyticsEntry,
  dareOutcomes,
  felonyLine,
  felonyOptions,
  hide as hidePayload,
  isHidden,
  mayOffer,
  roomChips,
  sameLocalDay,
  secondCatIndex,
  seenLine,
  tierText,
  tomorrowLine,
  xpLine,
  type AnalyticsEntry,
  type FelonyOption,
} from './shell-model';

export interface QaHook {
  screen(): string;
  state(): import('../types').SimState | null;
  play(inputs: TickInput[]): Promise<RunResult>;
  /** Jump to a screen (home, picker, archive, settings, rapsheet, season, friends, weekly, rooms, studio, briefing). */
  goto?(screen: string, opts?: { dayNo?: number; glass?: boolean; mode?: 'ranked' | 'practice' | 'ftue' }): void;
  /** Pretend today is day `n` (weekday rooms, boss Saturday, Napper Sunday); remounts the current screen. */
  setDay?(n: number): void;
  /** The live GameServices (e2e may swap money for a fake: services().money = …). */
  services?(): GameServices;
  /** Router state snapshot (plan, flags). */
  router?(): RouterState;
  /** Analytics events sent so far this page (name + props), newest last. */
  events?(): { e: string; p: Record<string, unknown> }[];
  /**
   * QA only: a seeded search over the real sim for a script that scores (and is not caught) on the current plan;
   * `minTargets` also asks for that many Must-Wreck targets (Room Maker "clear it" e2e).
   */
  scoring?(maxTries?: number, minTargets?: number): TickInput[] | null;
}

declare global {
  interface Window {
    __BADCAT_QA__?: QaHook;
  }
}

/** A silent engine for when the audio lane is missing or throws. */
export function silentAudio(): AudioEngine {
  return {
    unlock: async () => undefined,
    unlocked: false,
    onEvents: () => undefined,
    setMusic: () => undefined,
    stinger: () => undefined,
    setVolumes: () => undefined,
    setMuted: () => undefined,
    captureStream: () => null,
    dispose: () => undefined,
  };
}

/** A new session starts after this long without activity (GDD 14 session_index). */
export const SESSION_IDLE_MS = 30 * 60 * 1000;
const KEY_LAST_ACTIVE = 'lastActiveAt';

/** A hash that opens a link or a page route: dare/room/clip params, `#route=…` or a bare `#club`-style route. */
export function isRoutableHash(hash: string): boolean {
  if (typeof hash !== 'string' || !hash) return false;
  if (/[#&](d|g|rp|glass|pick|cat|r|route)(=|&|$)/.test(hash)) return true;
  const bare = /^#([a-z]+)([?&]|$)/.exec(hash);
  return !!bare && (LINK_ROUTES as readonly string[]).includes(bare[1]);
}

/** Query and hash parameters of the page URL (raw ghost payloads for the friends board). */
function rawLinkParams(): URLSearchParams {
  const out = new URLSearchParams();
  try {
    const u = new URL(window.location.href);
    u.searchParams.forEach((v, k) => out.set(k, v));
    new URLSearchParams(u.hash.replace(/^#/, '')).forEach((v, k) => out.set(k, v));
  } catch {
    /* none */
  }
  return out;
}

/** LinkState → router entry (pure). */
export function entryFromLink(l: LinkState | null): Entry {
  if (!l) return { kind: 'direct' };
  const via = l.via;
  // FULL build: /badcat/<route> links (Stripe return, gifts, restore, Room Maker remix...) and player room links.
  if (l.route) return { kind: 'route', route: l.route, via };
  if (l.remix && l.room) return { kind: 'route', route: 'maker', via };
  // A clip handoff from a player room carries the room too: it replays there (GDD 7.3).
  if (l.clip && l.room) return { kind: 'clip_handoff', ugc: true, via };
  if (l.room) return { kind: 'room_link', ugc: true, via };
  if (l.pick) return { kind: 'typed', pick: true, via };
  if (l.clip) return { kind: 'clip_handoff', dayNo: l.dayNo, glass: l.glass, via };
  if (l.ghosts?.length && !l.room) return { kind: 'dare_link', dayNo: l.glass ? undefined : l.dayNo, glass: l.glass, via };
  if (l.glass) return { kind: 'glass', glass: true, via };
  if (l.catCode) return { kind: 'cat_link', catCode: l.catCode, via };
  if (l.dayNo !== undefined) return { kind: 'daily_link', dayNo: l.dayNo, via };
  if (l.entry === 'typed') return { kind: 'typed', pick: true, via };
  return { kind: 'direct', via };
}

export function startApp(root: HTMLElement, services: GameServices): void {
  const app = new App(root, services);
  app.boot();
}


/** Offline: every Phase 2 feature off. */
const OFFLINE_FEATURES: OnlineFeatures = Object.freeze({
  accounts: false,
  scores: false,
  boards: false,
  shortLinks: false,
  feed: false,
  meter: false,
  push: false,
  streakEmail: false,
  creatorDashboard: false,
  livePinkPaw: false,
  yourcat: false,
});

/** The result line of a ranked save (empty when there is nothing to say). */
export function rankedLine(o: RankedSaveOutcome): string {
  switch (o.status) {
    case 'saved':
      return o.rank ? `Saved: #${o.rank.toLocaleString('en-US')} on today's board.` : 'Saved to the daily board.';
    case 'already':
      return "Today's ranked run is already on the board.";
    case 'queued':
      return 'Saved on this device. It goes on the board when you are back online.';
    case 'stale_sim':
      return 'Saved on this device. The board catches up with this version soon.';
    case 'rejected':
      return 'The board could not check this run, so it stays on this device.';
    case 'closed':
      return 'That day is closed on the board.';
    default:
      return '';
  }
}

/** VITE_BADCAT_TREAT_URL: the existing guest treat page (https only), or null. */
export function treatUrl(): string | null {
  try {
    const raw = (import.meta.env ?? {}).VITE_BADCAT_TREAT_URL as string | undefined;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const u = new URL(raw.trim());
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

class App {
  private readonly p: PlatformApi;
  private readonly env: EnvInfo;
  private readonly bootT = typeof performance !== 'undefined' ? performance.now() : 0;
  private readonly appEl: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly layer: HTMLElement;
  private router!: Router;
  private unmount: (() => void) | null = null;
  private renderer: Renderer | null = null;
  private rendererFailed = false;
  private audio: AudioEngine;
  private input: GameInput | null = null;
  private profile: Profile;
  private cat: CatSpec;
  private face: FaceDecal | null = null;
  private todayNo = 1;
  private entry: Entry = { kind: 'direct' };
  private link: LinkState | null = null;
  private pendingCat: CatSpec | null = null;
  private play: PlayableRoom | null = null;
  private session: RunSession | null = null;
  private hud: Hud | null = null;
  private result: RunResult | null = null;
  private resultPlay: PlayableRoom | null = null;
  private clip: ClipJob | null = null;
  private practiceIndex = 0;
  private runT0 = 0;
  private qaWaiters: ((r: RunResult) => void)[] = [];
  private qaScript: TickInput[] | null = null;
  /** Ghosts received through a dare link (GDD 6.3), with their scores on the dared room. */
  private dareGhosts: GhostRef[] = [];
  private dareScores = new Map<GhostRef, number>();
  private dareNote: string | undefined;
  private streakNote: string | undefined;
  /** FULL build: server feature switches (all false offline; fetched once at boot, no request without the flags). */
  private status: BadcatServerStatus | null = null;
  /** The paywall offer decided for the 'offer' screen (null: the pre-sale card). */
  private pendingOffer: PaywallOffer | null = null;
  private offerShownThisSession = false;
  /** Sheet parameters for sheets opened from inside the app (route sheets read the link's params). */
  private sheetParams: Record<string, string> = {};
  private sheetTrigger: CheckoutMeta['trigger'] = 'home';
  /** Studio / reply template @handle from the cat maker (never stored). */
  studioHandle: string | undefined;
  /** Accomplice of the loaded room (render), so the wish can flip it to granted mid-run. */
  private accomplice: AccompliceView | null = null;
  /** "$12.40 to Pink Paw this month" from the static treat meter (hidden at zero). */
  private treatLine: string | undefined;
  /** The player room in play (room link, My rooms, a Room Maker draft) and its link payload for re-sharing. */
  private ugc: { room: RoomDef; roomCode?: string } | null = null;
  /** Room Maker session: it survives its own playtest run (the host is hidden, not removed). */
  private maker: { host: HTMLElement; playtest: ((r: RunResult | null) => void) | null } | null = null;
  /** Analytics consent banner (home only, until the player answers). */
  private consentUn: (() => void) | null = null;
  private stageObs: ResizeObserver | null = null;
  /** Share screen: the chosen "Post as..." format of the clip. */
  private shareFormat: ShareFormat = 'pov';
  private shareTemplates: FormatTemplate[] = [];
  // ----- wave 3 -----
  /** GDD 14 `entry` and `utm_source` of this page load (common analytics props). */
  private aEntry: AnalyticsEntry = 'direct';
  private utm: string | undefined;
  /** The cat that plays this run when it is not the player's own (Felony Friday, household, studio). */
  private runCat: CatSpec | null = null;
  private runCatSource: 'mine' | 'pinkpaw' | 'guest_star' | 'household' | 'studio' = 'mine';
  /** Felony Friday choice on the briefing (per run, never stored). */
  private felonyChoice = 'mine';
  /** Household clip: the first run (the share's run) and the second cat's run once recorded. */
  private household: { result: RunResult; play: PlayableRoom; second: HouseholdSecond | null; secondIdx: number } | null = null;
  /** Result extras of the last run (new stamps, XP). */
  private newStamps: { icon: string; name: string }[] = [];
  private xpNote: string | undefined;
  private dareExtra: string[] = [];
  /** Club seen counter for the home screen (fetched once per page load when online). */
  private seenWeek: number | null = null;
  /** Studio session (?studio=1): the share module's queue reducer, loaded lazily. */
  private studio: { state: import('../share').StudioState<null>; glass: boolean; item: number | null } | null = null;
  private sides: SidePanels | null = null;
  /** In-app browsers start muted until the first tap (GDD 12). */
  private audioGate = false;
  private analyticsLog: { e: string; p: Record<string, unknown> }[] = [];
  // ----- Phase 2 (src/online) -----
  /** What the backend has ready (all false offline; one GET /badcat/status when the game has an API origin). */
  private onlineFeatures: OnlineFeatures = OFFLINE_FEATURES;
  private onlineSession: OnlineSession | null = null;
  /** The ranked save of the last run (the result screen shows its line). */
  private rankedSave: Promise<RankedSaveOutcome> | null = null;
  /** Short links made ahead of the tap (the share sheet must open inside the gesture). */
  private shortLinks = new Map<string, string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly sv: GameServices,
  ) {
    this.p = sv.platform;
    this.env = this.p.env;
    this.root.innerHTML = '';
    this.stage = h('div', { class: 'bc-stage' });
    this.layer = h('div', { class: 'bc-layer' });
    this.appEl = h(
      'div',
      { class: 'bc-app' },
      h('div', { class: 'bc-stage-wrap' }, this.stage),
      this.layer,
      // phone held sideways (CSS shows it): the portrait stage would be too narrow to play
      h('div', { class: 'bc-rotate', role: 'status' }, h('div', { class: 'bc-rotate-ico', 'aria-hidden': 'true' }, '📱'), COPY.rotate),
    );
    this.root.appendChild(this.appEl);
    this.profile = this.safe(() => this.p.profile(), null) ?? {
      cats: [DEFAULT_CAT],
      active: 0,
      createdAt: Date.now(),
      sessions: 0,
      settings: { audio: true, reduceMotion: false, showPhotoInClips: true },
    };
    this.cat = this.profile.cats[this.profile.active] ?? DEFAULT_CAT;
    this.audio = this.safe(() => this.sv.createAudio(), null) ?? silentAudio();
  }

  // ------------------------------------------------------------------------------------------- boot

  /**
   * Round 3: the in-game Reduce motion setting reaches the page UI too (the Post clip pulse ran forever; only the OS
   * setting stopped it). A root class mirrors `prefers-reduced-motion` in styles.css.
   */
  private applyReduceMotion(): void {
    try {
      document.documentElement.classList.toggle('bc-reduce-motion', !!this.profile.settings.reduceMotion);
    } catch {
      /* no DOM */
    }
  }

  boot(): void {
    this.applyReduceMotion();
    // A session is a visit after 30+ minutes idle (GDD 14), not a page load: a reload or the player's own dare
    // link in a new tab must not turn session 1 into session 2 (the paywall waits for session 2).
    if (this.isNewSession()) {
      this.profile = { ...this.profile, sessions: (this.profile.sessions | 0) + 1 };
      this.safe(() => this.p.saveProfile(this.profile), false);
    }
    this.touchActive(true);
    // Pre-launch days are <= 0 (preview rotation); their ranked records and streak live under separate keys.
    this.todayNo = this.safe(() => this.sv.content.dayNoFor(new Date()), 1) | 0;
    this.link = this.safe(() => this.sv.codec.parseLink(new URL(window.location.href)), null);
    this.entry = entryFromLink(this.link);
    // ?studio=1 alone: the founder's clip studio opens first (GDD 6.2)
    if (this.link?.studio && this.entry.kind === 'direct') this.entry = { ...this.entry, studio: true };
    this.adoptLinkRoom();
    if (this.entry.catCode) this.pendingCat = this.safe(() => this.sv.codec.decodeCat(this.entry.catCode!, (this.link as { catName?: string } | null)?.catName), null);
    const ftueDone = this.p.store.get<boolean>('ftueDone', false) === true;
    this.setAnalyticsEntry();

    this.router = new Router({
      entry: this.entry,
      todayNo: this.todayNo,
      sessionIndex: this.profile.sessions,
      ftueDone,
      rankedDone: (d) => this.safe(() => this.p.dayRecord(d), null) !== null,
      presale: !!this.safe(() => this.p.presaleUrl(), null),
      offer: () => this.decideOffer(),
      ftueGlass: (d) => this.isHardDay(d),
    });
    // Pink Paw treat meter: a static JSON next to the game (hand-edited monthly), no API.
    void this.p
      .treatMeter?.()
      .then((m) => {
        if (m && m.cents > 0) this.treatLine = `${formatTreatMeter(m)} to Pink Paw shelter cats this month`;
      })
      .catch(() => undefined);
    // Money: offline (no API origin) answers locally with zero requests; online it follows GET /badcat/status.
    if (this.sv.money)
      void this.sv.money
        .status()
        .then((st) => {
          this.status = st;
          const m = this.sv.money as (GameServices['money'] & { needsRefresh?(): boolean }) | undefined;
          if (st.enabled && m?.needsRefresh?.()) void m.refreshEntitlements().catch(() => undefined);
        })
        .catch(() => undefined);
    this.router.on((s, prev) => this.onRoute(s, prev));
    // Phase 2 online services: zero requests without an API origin.
    this.bootOnline();

    // GDD 12: muted by default in in-app browsers until a tap; the player's volumes apply from the start
    this.audioGate = this.env.inApp !== 'none';
    this.audio.setMuted(this.audioGate || !this.profile.settings.audio);
    this.applyVolumes();
    const unlock = (): void => {
      void this.audio.unlock().catch(() => undefined);
      if (this.audioGate) {
        this.audioGate = false;
        this.safe(() => this.audio.setMuted(!this.profile.settings.audio), undefined);
      }
    };
    // pointerdown alone is not a user activation for touch on WebKit; pointerup / touchend / click are.
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => this.touchActive(), { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.session?.pause('pause');
      // Coming back after 30+ minutes in the same tab is a new session too.
      if (document.visibilityState === 'visible' && this.isNewSession()) {
        this.profile = { ...this.profile, sessions: (this.profile.sessions | 0) + 1 };
        this.safe(() => this.p.saveProfile(this.profile), false);
        this.offerShownThisSession = false;
      }
      this.touchActive(true);
    });
    // A phone turned sideways shows the rotate overlay: pause the run under it.
    try {
      const mq = window.matchMedia?.('(orientation: landscape) and (max-height: 500px) and (min-aspect-ratio: 6/5)');
      mq?.addEventListener?.('change', (e) => {
        if (e.matches) this.session?.pause('rotate');
      });
    } catch {
      /* old browsers: the overlay still shows */
    }
    // A dare / room link (#d=…, #g=…) or any page route (#route=club|cameo|redeem|restore|thanks…, #club) opened
    // in a tab that already runs the game: route it like a fresh open (checkout's same-tab return included).
    window.addEventListener('hashchange', () => {
      if (isRoutableHash(window.location.hash)) {
        this.session?.pause('pause');
        window.location.reload();
      }
    });
    // Block page gestures that escape the stage (pinch, double-tap zoom on iOS).
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

    this.track('bc_boot', { load_ms: Math.round(performance.now()), in_app_browser: this.env.inApp, quality_tier: 'auto' });
    if (this.env.qa) this.installQa();

    this.mount(this.router.state);
    const minBoot = new Promise<void>((res) => setTimeout(res, 250));
    void Promise.all([minBoot, this.resolveLink()]).then(async () => {
      if (this.entry.kind !== 'direct')
        this.track('bc_link_open', {
          link_type: this.entry.kind,
          ghosts: this.link?.ghosts?.length ?? 0,
          has_room: !!this.link?.room,
        });
      if (this.entry.kind === 'clip_handoff') this.track('bc_inapp_handoff', { step: 'arrived', purpose: 'clip' });
      if (this.entry.kind === 'clip_handoff' && this.link?.replay && (await this.prepareReplay(this.link.replay))) {
        // a new browser has no photo for the opener: offer to add it again (skippable), then the clip renders
        const face = this.face ?? (await this.sv.catMaker.loadFace(this.profile.active).catch(() => null));
        this.router.send({ t: 'replayReady', dayNo: this.entry.dayNo ?? this.todayNo, glass: this.entry.glass, reAdd: !face });
        return;
      }
      this.router.send({ t: 'booted' });
    });
    // Club seen counter (GDD 6.5): one request per page load, only online and only for members
    void this.loadSeen();
  }

  /** No activity stored, or the last one 30+ minutes ago (or in the future: a changed clock). */
  private isNewSession(): boolean {
    const last = this.safe(() => this.p.store.get<number>(KEY_LAST_ACTIVE, 0), 0);
    const now = Date.now();
    if ((this.profile.sessions | 0) <= 0) return true;
    return !(typeof last === 'number' && last > 0 && last <= now && now - last < SESSION_IDLE_MS);
  }

  private lastTouch = 0;
  /** Stores the last-active time (at most every 30 s unless forced). */
  private touchActive(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastTouch < 30_000) return;
    this.lastTouch = now;
    this.safe(() => this.p.store.set(KEY_LAST_ACTIVE, now), undefined);
  }

  /** GDD 14 common props: `entry` (incl. typed_or_direct) and `utm_source` of this page load. */
  private setAnalyticsEntry(): void {
    let href = '';
    let referrer = '';
    try {
      href = window.location.href;
      referrer = document.referrer;
    } catch {
      /* not a browser */
    }
    this.aEntry = analyticsEntry(this.entry.kind, href, referrer);
    this.utm = this.safe(() => linkAttribution(href).utm_source, undefined);
  }

  /** Master / music / SFX volumes from the settings (W2-META sliders). */
  private applyVolumes(): void {
    const v = this.profile.prefs ?? {};
    this.safe(() => this.audio.setVolumes({ master: v.master, music: v.music, sfx: v.sfx }), undefined);
  }

  /** A boss room or a Napper day (GDD 13.5: the 40 s first heist plays The Glass instead). */
  private isHardDay(dayNo: number): boolean {
    return this.safe(() => {
      const e = this.sv.content.dailyEntry?.(dayNo);
      if (e?.boss) return true;
      const room = this.sv.content.dailyRoom(dayNo);
      if (room.boss) return true;
      const routines = this.sv.content.routines;
      const r1 = routines?.[room.routine];
      const r2 = room.routine2 !== undefined ? routines?.[room.routine2] : undefined;
      return r1?.kind === 'napper' || r2?.kind === 'napper';
    }, false);
  }

  private async loadSeen(): Promise<void> {
    const money = this.sv.money;
    if (!money || !this.env.apiUrl) return;
    try {
      const st = this.status ?? (await money.status());
      if (!st.enabled || !st.cameos || !this.entitlements().club) return;
      const res = await money.seen(this.sv.codec.encodeCat(this.cat));
      if (!res) return;
      this.seenWeek = res.week;
      this.track('bc_cameo_seen', { loads: res.week });
      if (this.router.state.screen === 'home') this.mount(this.router.state);
    } catch {
      /* the counter is a nicety */
    }
  }

  /** The room of a room link becomes the player room in play. */
  private adoptLinkRoom(): void {
    const room = this.link?.room;
    if (room && this.hiddenPayload(this.link?.roomCode)) {
      // a room this device hid and reported: never shown again (GDD 6.7); the link opens home instead
      this.ugc = null;
      this.link = { ...this.link!, room: undefined, roomCode: undefined, ghosts: [] };
      this.entry = { kind: 'direct', via: this.entry.via };
      this.hiddenRoomNote = true;
      return;
    }
    if (room) this.ugc = { room, ...(this.link?.roomCode ? { roomCode: this.link.roomCode } : {}) };
  }

  private hiddenRoomNote = false;

  private payloadHash(payload: string | null | undefined): string {
    if (!payload) return '';
    return this.safe(() => this.sv.codec.payloadHash?.(payload) ?? '', '');
  }

  private hiddenPayload(payload: string | null | undefined): boolean {
    const hash = this.payloadHash(payload);
    return !!hash && isHidden(this.p.store, hash);
  }

  /** Decode dare ghosts (async: a deflated payload needs DecompressionStream) and refresh the entry. */
  private async resolveLink(): Promise<void> {
    const parseFull = this.sv.codec.parseLinkFull;
    if (!parseFull || typeof window === 'undefined') return;
    const href = window.location.href;
    if (!/[?#&](g|rp)=/.test(href)) return;
    try {
      const full = await Promise.race([
        parseFull(new URL(href)),
        new Promise<null>((res) => setTimeout(() => res(null), 2500)),
      ]);
      if (!full) return;
      this.link = full;
      // GDD 6.7: ghosts this device hid ("Hide and report") never race again
      const raw = rawLinkParams();
      this.dareGhosts = full.ghosts.slice(0, 2).filter((_, i) => !this.hiddenPayload(raw.get(i === 0 ? 'g' : 'g2')));
      this.entry = entryFromLink(full);
      this.adoptLinkRoom();
      this.router.ctx.entry = this.entry;
    } catch (err) {
      if (this.env.dev) console.warn('[bad-cat ui] dare link could not be decoded', err);
    }
  }

  /** Clip handoff (GDD 7.3): re-simulate the replay from the link and load its room for the clip pass. */
  private async prepareReplay(rp: GhostRef): Promise<boolean> {
    try {
      // A player room travels in the link (`r`): replay in that room, never in today's daily room.
      const ugcRoom = this.link?.room ?? this.ugc?.room;
      const glass = !ugcRoom && !!this.entry.glass;
      const dayNo = glass || ugcRoom ? undefined : this.entry.dayNo ?? this.todayNo;
      const room = ugcRoom ?? (glass ? this.sv.content.glassRoom() : this.sv.content.dailyRoom(dayNo!));
      const play = this.sv.content.resolve(room, this.link?.ftue && !ugcRoom ? 'ftue' : 'practice', dayNo);
      const res = this.sv.sim.runToEnd(play, rp.cat, rp.inputs, { simVersion: rp.simVersion });
      // A fresh browser has only the default cat: adopt the cat from the link (it is the same player).
      if (this.isFreshProfile()) {
        // a collar or hat this device has not bought comes off (the ghost itself still replays as recorded)
        this.cat = wearOwned({ ...rp.cat, name: rp.name ?? rp.cat.name }, this.safe(() => this.ownedChips(), { collars: [] as number[], hats: [] as number[] }));
        const cats = [...this.profile.cats];
        cats[this.profile.active] = this.cat;
        this.profile = { ...this.profile, cats };
        this.safe(() => this.p.saveProfile(this.profile), false);
      }
      const r = this.ensureRenderer();
      if (r) await r.load(play, [rp.cat]);
      this.safe(() => this.audio.setRoom?.(play), undefined);
      this.play = play;
      this.result = res;
      this.resultPlay = play;
      this.clip = this.makeClipJob(res, play, rp.cat, this.cat === rp.cat || this.isSameCat(this.cat, rp.cat) ? 'mine' : 'other');
      return true;
    } catch (err) {
      if (this.env.dev) console.warn('[bad-cat ui] clip handoff replay failed', err);
      return false;
    }
  }

  /** "Mochi dared you: 6,375" for a dare arrival (the ghost's score on the dared room), else undefined. */
  private dareLine(): string | undefined {
    const g = this.dareGhosts[0];
    const link = this.link;
    if (!g || !link) return undefined;
    return this.safe(() => {
      const glass = !!link.glass;
      if (!glass && link.dayNo === undefined && !link.room) return undefined;
      const room = link.room ?? (glass ? this.sv.content.glassRoom() : this.sv.content.dailyRoom(link.dayNo!));
      const play = this.sv.content.resolve(room, 'practice', glass || link.room ? undefined : link.dayNo);
      const who = g.name || g.cat.name || 'Your friend';
      // a ghost from older rules replays as it was, but it is not a score to beat
      if (g.replayOnly) return `${who}'s ghost (older rules): watch it, then set your own score`;
      const score = this.ghostScore(play, g);
      // round 3: "Biscuit dared you: 0" read like a bug: a 0-point ghost dares you to make any mess at all
      return score > 0 ? `${who} dared you: ${formatScore(score)}` : `${who} napped through it. Dared you to make a mess`;
    }, undefined);
  }

  /** Same cat (colours, pattern, cosmetics), whatever the name. */
  private isSameCat(a: CatSpec, b: CatSpec): boolean {
    const strip = (c: CatSpec): string => JSON.stringify({ ...c, name: '' });
    return strip(a) === strip(b);
  }

  /** A really fresh browser: first session and the untouched default cat (a returning player keeps their cat). */
  private isFreshProfile(): boolean {
    if ((this.profile.sessions | 0) > 1 || this.profile.cats.length > 1) return false;
    const strip = (c: CatSpec): string => JSON.stringify({ ...c, name: '' });
    return strip(this.cat) === strip(DEFAULT_CAT);
  }

  /** Dare ghosts that belong to this room (a dare pins its dayNo or The Glass). */
  private ghostsFor(play: PlayableRoom | null): GhostRef[] {
    // The first heist moves the spawn (content.resolve), so a ranked ghost would desync there: no ghosts in FTUE.
    if (!play || play.mode === 'ftue' || !this.dareGhosts.length || !this.link) return [];
    const same = this.link.room
      ? play.room.id === this.link.room.id
      : this.link.glass
        ? play.room.id === 'glass'
        : this.link.dayNo !== undefined && play.dayNo === this.link.dayNo && play.room.id !== 'glass';
    return same ? this.dareGhosts : [];
  }

  private ghostScore(play: PlayableRoom, g: GhostRef): number {
    let v = this.dareScores.get(g);
    if (v === undefined) {
      v = this.safe(() => this.sv.sim.runToEnd(play, g.cat, g.inputs, { simVersion: g.simVersion }).score, 0);
      this.dareScores.set(g, v);
    }
    return v;
  }

  // ------------------------------------------------------------------------------------ helpers

  private safe<T>(fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      if (this.env?.dev) console.warn('[bad-cat ui]', err);
      return fallback;
    }
  }

  private baseProps(): AnalyticsProps {
    const plan = this.router?.state.plan;
    const props: AnalyticsProps = {
      sim_version: SIM_VERSION,
      entry: this.aEntry,
      in_app_browser: this.env.inApp,
      is_first_session: this.profile.sessions <= 1,
      platform: platformOf(this.env),
    };
    if (plan?.dayNo !== undefined) props.day_no = plan.dayNo;
    if (this.play) props.room_id = this.play.room.id;
    if (this.entry.via) props.via = this.entry.via;
    if (this.utm) props.utm_source = this.utm;
    return props;
  }

  private track(e: AnalyticsEvent, props: AnalyticsProps = {}): void {
    try {
      const all = { ...this.baseProps(), ...props };
      if (this.env.qa) this.analyticsLog.push({ e, p: all });
      this.p.track(e, all);
    } catch {
      /* analytics never breaks the game */
    }
  }

  private roomFor(plan: RunPlan): RoomDef {
    if (plan.ugc) {
      const room = this.ugc?.room ?? this.link?.room;
      if (room) return room;
    }
    return plan.glass ? this.sv.content.glassRoom() : this.sv.content.dailyRoom(plan.dayNo ?? this.todayNo);
  }

  private labelFor(plan: RunPlan | null): string {
    if (!plan) return '';
    const room = this.safe(() => this.roomFor(plan), null);
    return roomLabel(plan.glass, plan.dayNo, room?.title);
  }

  /** "Kitchen #18" for a daily, the title of a player room, undefined for The Glass (copy falls back). */
  private shortLabel(play: PlayableRoom | null): string | undefined {
    if (!play || play.room.id === 'glass') return undefined;
    if (play.room.id.startsWith('ugc-')) return play.room.title || 'a player room';
    return play.dayNo !== undefined ? this.safe(() => this.sv.content.roomLabel?.(play.dayNo!), undefined) : undefined;
  }

  private linkBase(): string {
    return `https://${this.env.shortUrl}`;
  }

  /** The player room of a room link, as a link target (re-shares its original payload so ghost ids match). */
  private ugcTarget(play: PlayableRoom | null): Pick<LinkState, 'room' | 'roomCode'> | null {
    const room = this.ugc?.room;
    if (!play || !room || play.room.id !== room.id) return null;
    return { room, ...(this.ugc?.roomCode ? { roomCode: this.ugc.roomCode } : {}) };
  }

  private dailyLink(play: PlayableRoom | null): string {
    const ugc = this.ugcTarget(play);
    if (ugc) return this.safe(() => this.sv.codec.buildLink({ ghosts: [], via: this.entry.via, ...ugc }, this.linkBase()), this.linkBase());
    const glass = play?.room.id === 'glass';
    const day = play?.dayNo ?? this.todayNo;
    // preview days (<= 0) stay out of share URLs: the plain link opens today's room
    const s: LinkState = { ghosts: [], via: this.entry.via, ...(glass ? { glass: true } : isShareableDay(day) ? { dayNo: day } : {}) };
    return this.safe(() => this.sv.codec.buildLink(s, this.linkBase()), s.dayNo !== undefined ? `${this.linkBase()}/d/${s.dayNo}` : this.linkBase());
  }

  private ensureInput(): GameInput {
    if (!this.input) {
      this.input = createInput(this.stage, this.env);
      this.input.setEnabled(false);
    }
    return this.input;
  }

  private ensureRenderer(): Renderer | null {
    if (this.renderer || this.rendererFailed) return this.renderer;
    try {
      const r = this.sv.render.createRenderer(this.stage, { reduceMotion: this.profile.settings.reduceMotion });
      if (!r.canvas.parentElement) this.stage.prepend(r.canvas);
      r.canvas.classList.add('bc-canvas');
      r.onContextLost((lost) => {
        if (lost) this.session?.pause('context');
        else if (this.session?.paused === 'context') {
          this.session.resume();
          this.session.pause('pause');
        }
      });
      let fitQueued = false;
      const fit = (): void => {
        // A resize during a clip export (rotation, iOS toolbar) must not touch the clip-sized target;
        // refit once the export has handed the renderer back.
        const job = this.clip;
        if (job?.busy) {
          if (!fitQueued) {
            fitQueued = true;
            void job.idle().then(() => {
              fitQueued = false;
              fit();
            });
          }
          return;
        }
        const w = this.stage.clientWidth;
        const hgt = this.stage.clientHeight;
        if (w > 0 && hgt > 0) this.safe(() => r.setTarget({ w, h: hgt, hud: true }), undefined);
      };
      fit();
      if (typeof ResizeObserver !== 'undefined') {
        this.stageObs = new ResizeObserver(() => {
          if (this.renderer === r) fit();
        });
        this.stageObs.observe(this.stage);
      } else
        window.addEventListener('resize', () => {
          if (this.renderer === r) fit();
        });
      this.renderer = r;
    } catch (err) {
      this.rendererFailed = true;
      if (this.env.dev) console.warn('[bad-cat ui] renderer unavailable', err);
    }
    return this.renderer;
  }

  /**
   * Hand the WebGL context over (Room Maker: one context at a time, FULL-PLAN decision 5). The clip job is
   * cancelled first; the next briefing creates a fresh renderer.
   */
  private async releaseRenderer(): Promise<void> {
    const job = this.clip;
    if (job?.busy) await Promise.race([job.cancel(), new Promise<void>((res) => setTimeout(res, 1500))]);
    const r = this.renderer;
    if (!r) return;
    this.renderer = null;
    this.clip = null;
    this.stageObs?.disconnect();
    this.stageObs = null;
    this.safe(() => r.dispose(), undefined);
    r.canvas.remove();
  }

  // ------------------------------------------------------------------------------------- routing

  private backdropEl: HTMLImageElement | null = null;
  private backdropUrl: string | null = null;
  private bestFrame: Promise<Blob | null> | null = null;

  private setBackdrop(on: boolean): void {
    const url = on ? this.backdropUrl : null;
    this.stage.classList.toggle('is-backdrop', on);
    if (!url) {
      this.backdropEl?.remove();
      this.backdropEl = null;
      return;
    }
    if (!this.backdropEl) {
      this.backdropEl = h('img', { class: 'bc-backdrop', alt: '', 'aria-hidden': 'true' }) as HTMLImageElement;
      this.stage.appendChild(this.backdropEl);
    }
    if (this.backdropEl.src !== url) this.backdropEl.src = url;
  }

  private onRoute(s: RouterState, prev: RouterState): void {
    if (prev.screen === 'run' && s.screen !== 'run') this.endSession();
    if (s.screen !== prev.screen || s.plan !== prev.plan) this.mount(s);
  }

  private mount(s: RouterState): void {
    this.unmount?.();
    this.unmount = null;
    this.appEl.dataset.screen = s.screen;
    this.appEl.classList.toggle('is-run', s.screen === 'run');
    this.appEl.classList.toggle('is-stage', s.screen === 'run' || s.screen === 'briefing');
    // Result / share: a still of the last live frame (blurred) instead of the canvas, which the clip pass uses.
    this.setBackdrop(s.screen === 'result' || s.screen === 'share');
    const L = this.layer;
    if (s.screen !== 'run' && s.screen !== 'briefing') {
      this.sides?.dispose();
      this.sides = null;
    }
    switch (s.screen) {
      case 'studio':
        this.unmount = this.mountStudioScreen();
        break;
      case 'boot':
        this.unmount = mountBoot(L, { inApp: this.env.inApp !== 'none' });
        break;
      case 'linkIntro':
        this.unmount = mountBoot(L, {
          inApp: this.env.inApp !== 'none',
          roomLabel: this.labelFor(s.plan),
          dare: this.dareLine(),
          onNext: () => this.router.send({ t: 'introDone' }),
        });
        break;
      case 'picker':
        this.unmount = this.mountPicker(s.screen);
        break;
      case 'archive':
        this.unmount = this.mountArchive() ?? this.mountPicker(s.screen);
        break;
      case 'season':
        this.unmount = this.mountSeason();
        break;
      case 'friends':
        this.unmount = this.mountFriends();
        break;
      case 'weekly':
        this.unmount = this.mountWeekly();
        break;
      case 'rooms':
        this.unmount = this.mountRooms();
        break;
      case 'board':
        this.unmount = this.mountBoard();
        break;
      case 'feed':
        this.unmount = this.mountFeed();
        break;
      case 'maker':
        this.unmount = this.mountMaker();
        break;
      case 'catmaker':
        this.unmount = this.mountCatmaker(s);
        break;
      case 'home':
        this.unmount = this.mountHome(s);
        break;
      case 'briefing':
        this.unmount = this.mountBriefing(s);
        break;
      case 'run':
        this.unmount = this.startRun();
        break;
      case 'result':
        this.unmount = this.mountResult();
        break;
      case 'share':
        this.unmount = this.mountShare(s);
        break;
      case 'offer': {
        const offer = this.pendingOffer;
        const money = this.sv.money;
        if (offer && money) {
          // money tracks bc_paywall_view and records the one-card-per-session rule (markPaywallShown)
          this.offerShownThisSession = true;
          // GDD 9.2: a small card over content, never its own empty screen: Home stays visible behind a scrim
          const behind = this.safe(() => this.mountHome({ ...s, screen: 'home' }), () => undefined);
          const scrim = h('div', { class: 'bc-offer-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': offer.title });
          const host = h('div', { class: 'bc-offer-sheet bc-offer-host' });
          scrim.appendChild(host);
          L.appendChild(scrim);
          const open = (sku: BadcatSku): void => this.openOfferSheet(offer, sku);
          scrim.addEventListener('click', (e) => {
            if (e.target === scrim) this.router.send({ t: 'offerDone' });
          });
          const un = money.mount.offerCard(host, {
            offer,
            onAccept: () => open(offer.sku),
            onDismiss: () => this.router.send({ t: 'offerDone' }),
            onSecondary: (sku) => open(sku),
          });
          this.unmount = () => {
            un();
            scrim.remove();
            behind();
          };
          break;
        }
        this.track('bc_paywall_view', { trigger: 'post_share', offer: 'presale', session_index: this.profile.sessions });
        this.unmount = mountOffer(L, { onPresale: () => this.openPresale('offer'), onClose: () => this.router.send({ t: 'offerDone' }) });
        break;
      }
      case 'sheet':
        this.unmount = this.mountSheet(s.sheet ?? 'club');
        break;
      case 'cats':
        this.unmount = this.mountCats();
        break;
      case 'rapsheet':
        this.unmount = this.mountRap();
        break;
      case 'settings':
        this.unmount = this.mountMetaSettings() ?? mountSettings(L, {
          settings: this.profile.settings,
          persistent: this.p.store.persistent,
          hasPhoto: this.face
            ? true
            : this.sv.catMaker
                .loadFace(this.profile.active)
                .then((f) => {
                  if (f && !this.face) this.face = f;
                  return !!f;
                })
                .catch(() => false),
          onChange: (st) => {
            this.profile = { ...this.profile, settings: st };
            this.safe(() => this.p.saveProfile(this.profile), false);
            this.audio.setMuted(!st.audio);
            this.applyReduceMotion();
          },
          consent: this.p.consent
            ? {
                granted: this.safe(() => this.p.consent!(), 'unset') === 'granted',
                onChange: (on) => this.safe(() => this.p.setConsent?.(on), undefined),
              }
            : undefined,
          actions: this.settingsActions(),
          onBack: () => this.router.send({ t: 'back' }),
        });
        break;
    }
    this.syncConsent(s.screen === 'home');
  }

  private mountPicker(screen: 'picker' | 'archive'): () => void {
    const rooms = this.safe(() => this.sv.content.pickerRooms(this.todayNo), []);
    const items: PickerItem[] = rooms.length
      ? rooms.map((r) => ({
          label: r.label,
          glass: r.room.id === 'glass' || r.dayNo === undefined,
          dayNo: r.dayNo,
          thumb: this.ogThumb(r.dayNo, r.room.id === 'glass' || r.dayNo === undefined),
          icon: this.roomIcon(r.room),
          // the target icons tell the rooms apart (preview days share one title)
          sub:
            (r.dayNo === this.todayNo ? 'Today' : r.dayNo !== undefined ? `${this.todayNo - r.dayNo} day${this.todayNo - r.dayNo === 1 ? '' : 's'} ago` : COPY.glassSub) +
            (r.dayNo !== undefined ? ` · ${r.room.props.filter((p) => p.target).map((p) => propEmoji(p.kind)).join('')}` : ''),
          badge: r.dayNo === this.todayNo ? 'NEW' : undefined,
        }))
      : [
          { label: COPY.glassLabel, glass: true, sub: COPY.glassSub },
          { label: kitchenLabel(this.todayNo), dayNo: this.todayNo, sub: 'Today', badge: 'NEW' },
        ];
    return mountPicker(this.layer, {
      title: screen === 'picker' ? COPY.pickerTitle : COPY.archiveTitle,
      items,
      onPick: (it) => {
        this.track('bc_picker', {
          choice: it.glass ? 'glass' : it.dayNo === this.todayNo ? 'today' : 'past',
          days_back: it.dayNo !== undefined ? this.todayNo - it.dayNo : 0,
        });
        const sel = it.glass ? { glass: true } : { dayNo: it.dayNo };
        if (screen === 'picker') this.router.send({ t: 'picked', ...sel });
        else this.router.send({ t: 'play', ...sel });
      },
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  /** OG still of a launch day (og/d/<n>.png, written by tools/render-og.mjs) or The Glass (og/glass.png). */
  private ogThumb(dayNo: number | undefined, glass: boolean): string | undefined {
    let base = './';
    try {
      base = (import.meta.env?.BASE_URL as string | undefined) ?? './';
    } catch {
      /* default */
    }
    if (glass) return `${base}og/glass.png`;
    return dayNo !== undefined && dayNo >= 1 ? `${base}og/d/${dayNo}.png` : undefined;
  }

  /** Icon per shell (picker fallback when the still is missing). */
  private roomIcon(room: RoomDef): string {
    if (room.id === 'glass') return '🍷';
    if (room.boss) return '👑';
    const name = this.safe(() => this.sv.content.shells?.[room.shell]?.name ?? '', '').toLowerCase();
    if (name.includes('living') || name.includes('zoom')) return '🛋️';
    if (name.includes('bath')) return '🛁';
    if (name.includes('bed')) return '🛏️';
    if (name.includes('party')) return '🎉';
    if (name.includes('office')) return '💻';
    return '🍳';
  }

  private mountCatmaker(s: RouterState): () => void {
    const host = h('div', { class: 'bc-screen bc-catmaker-host' });
    this.layer.appendChild(host);
    let alive = true;
    const t0 = performance.now();
    this.track('bc_catmaker_open', { from_link: s.ftue, ...(s.reAdd ? { re_add: true } : {}) });
    // catmaker_saved paywall moment (GDD 9.2): session 2+, never in the first visit, never on the handoff re-add
    const offerAfter = !s.ftue && !s.reAdd;
    const finish = (saved = false): void => {
      if (!alive) return;
      const offer = saved && offerAfter ? this.decideMoment('catmaker_saved') : false;
      this.router.send({ t: 'catmakerDone' });
      if (offer) this.router.send({ t: 'offer' });
    };
    const owned = this.safe(() => this.ownedChips(), { collars: [] as number[], hats: [] as number[] });
    // A /c/ link opened by a returning player is someone else's cat: it never overwrites the player's slot
    // (round 3 data loss). First visits adopt it as their own cat (fromLink).
    const linkedCat = this.pendingCat;
    const linked = !!linkedCat && !s.ftue && !s.reAdd;
    const maxCats = Math.max(1, this.entitlements().maxCats | 0);
    const canAdd = linked && this.profile.cats.length < maxCats;
    const initial = linkedCat ?? this.cat;
    this.pendingCat = null;
    Promise.resolve()
      .then(() =>
        this.sv.catMaker.open(host, {
          initial,
          fromLink: s.ftue,
          render: this.sv.render,
          dare: s.ftue ? this.dareLine() : undefined,
          catIndex: this.profile.active,
          owned,
          ...(linked ? { linked: { keepName: this.cat.name || 'my cat', canAdd } } : {}),
          // ?studio=1: the Stitch / reply template asks for the poster's @handle
          studio: !!this.link?.studio,
          // clip handoff in a new browser: "Add Mochi's photo again for the clip opener" (spec untouched)
          ...(s.reAdd ? { reAdd: { name: this.cat.name || 'your cat' } } : {}),
        }),
      )
      .then((res) => {
        if (!alive) return;
        if (s.reAdd) {
          this.face = res.face ?? this.face;
          this.track('bc_catmaker_done', { method: res.method, face_decal: !!res.face, pattern: this.cat.pattern, ms: Math.round(performance.now() - t0), re_add: true });
          // the clip job reads the opener when it starts: rebuild it with the new face crop
          if (this.result && this.resultPlay) this.clip = this.makeClipJob(this.result, this.resultPlay, this.cat, 'mine');
          finish();
          return;
        }
        if (linked) {
          this.track('bc_catmaker_done', { method: res.kept ? 'kept' : 'adopted', face_decal: false, pattern: res.spec.pattern, ms: Math.round(performance.now() - t0), linked: true });
          if (res.adopted) {
            const name = this.safe(() => this.sv.codec.filterName(res.spec.name, 12), res.spec.name) || '';
            const cat = { ...res.spec, name };
            if (canAdd) {
              // a free slot (Club): the friend's cat joins the gang; the player's own cats stay as they are
              const cats = [...this.profile.cats, cat];
              this.profile = { ...this.profile, cats, active: cats.length - 1 };
              this.safe(() => this.p.saveProfile(this.profile), false);
              this.syncClubCat();
            }
            // no free slot: play as the friend's cat this visit only (nothing saved; Home > My Cat brings yours back)
            this.cat = cat;
            this.face = null;
            if (!canAdd) queueMicrotask(() => toast(this.layer, `Playing as ${name || 'this cat'} this visit. Your cat stays saved.`, 3000));
          }
          finish();
          return;
        }
        const name = this.safe(() => this.sv.codec.filterName(res.spec.name, 12), res.spec.name) || '';
        this.cat = { ...res.spec, name };
        const slot = Math.max(0, Math.min(res.catIndex ?? this.profile.active, this.profile.cats.length));
        const cats = [...this.profile.cats];
        cats[slot] = this.cat;
        this.profile = { ...this.profile, cats, active: slot };
        this.safe(() => this.p.saveProfile(this.profile), false);
        this.face = res.face ?? null;
        if (res.handle) this.studioHandle = res.handle;
        this.track('bc_catmaker_done', { method: res.method, face_decal: !!res.face, pattern: res.spec.pattern, ms: Math.round(performance.now() - t0) });
        this.syncClubCat();
        finish(res.method !== 'skipped');
      })
      .catch((err) => {
        if (this.env.dev) console.warn('[bad-cat ui] cat maker failed, using the current cat', err);
        if (!alive) return;
        // Fallback: one-tap skip card so the FTUE never blocks on the cat maker.
        host.innerHTML = '';
        host.append(
          h(
            'div',
            { class: 'bc-card bc-center' },
            h('div', { class: 'bc-logo', 'aria-hidden': 'true' }, '🐱'),
            h('h2', {}, `Play as ${this.cat.name || 'Tofu'}`),
            btn('Skip, use a house cat', () => {
              this.track('bc_catmaker_done', { method: 'skipped', face_decal: false, pattern: this.cat.pattern, ms: Math.round(performance.now() - t0) });
              finish();
            }, 'bc-cta bc-cta-big'),
          ),
        );
      });
    return () => {
      alive = false;
      host.remove();
    };
  }

  private mountHome(s: RouterState): () => void {
    const record = this.safe(() => this.p.dayRecord(this.todayNo), null);
    const presale = this.profile.sessions >= 2 ? this.safe(() => this.p.presaleUrl(), null) : null;
    const room = this.safe(() => this.sv.content.dailyRoom(this.todayNo), null);
    const entry = this.safe(() => this.sv.content.dailyEntry?.(this.todayNo) ?? null, null);
    const next = this.safe(() => this.sv.content.dailyEntry?.(this.todayNo + 1) ?? null, null);
    const ent = this.entitlements();
    const streak = this.safe(() => this.sv.progress?.streakDetail?.(this.p.store, this.todayNo, { freezesPerWeek: ent.freezesPerWeek }) ?? null, null);
    const week = this.weeklySummary();
    const routineName = this.safe(() => {
      if (entry?.human) return entry.human;
      const rs = this.sv.content.routines;
      if (!room || !rs) return undefined;
      const a = rs[room.routine]?.name;
      const b = room.routine2 !== undefined ? rs[room.routine2]?.name : undefined;
      return [a, b].filter(Boolean).join(' + ') || undefined;
    }, undefined);
    if (this.hiddenRoomNote) {
      this.hiddenRoomNote = false;
      queueMicrotask(() => toast(this.layer, 'You hid that room. It stays hidden on this device.'));
    }
    const a2hs = this.safe(() => {
      const a = this.p.a2hs?.();
      if (!a?.available) return null;
      if (!this.a2hsTracked) {
        this.a2hsTracked = true;
        this.track('bc_a2hs', { shown: true, accepted: false });
      }
      return {
        ios: a.ios,
        onInstall: () =>
          void a
            .prompt()
            .then((ok) => this.track('bc_a2hs', { shown: true, accepted: !!ok }))
            .catch(() => false),
      };
    }, null);
    return mountHome(this.layer, {
      todayNo: this.todayNo,
      todayLabel: room?.title ?? this.sv.content.roomLabel?.(this.todayNo) ?? kitchenLabel(this.todayNo),
      todayShort: this.safe(() => (this.todayNo >= 1 ? this.sv.content.roomLabel?.(this.todayNo) : undefined), undefined),
      rankedSeconds: Math.round((room?.ticks || (entry?.boss || room?.boss ? BOSS_TICKS : RUN_TICKS)) / TICK_HZ),
      record,
      readyRanked: s.readyRanked,
      linkAgain: this.safe(() => this.linkAgain(), null),
      catName: this.cat.name,
      presale: !!presale,
      storagePersistent: this.p.store.persistent,
      streak: this.safe(() => this.sv.progress?.streakStatus?.(this.p.store, this.todayNo) ?? null, null),
      week: this.safe(() => this.homeWeek(), []),
      seasonLine: this.safe(() => {
        const v = this.sv.progress?.season?.(this.p.store, new Date(), { club: this.entitlements().club });
        return v ? `${v.name} · ${tierText(v.tier)} · ${v.xp % v.xpPerTier}/${v.xpPerTier} XP` : undefined;
      }, undefined),
      onRapSheet: this.sv.progress?.rapSheet ? () => this.router.send({ t: 'open', screen: 'rapsheet' }) : undefined,
      links: this.safe(() => this.homeLinks(), []),
      treatLine: this.treatLine,
      a2hs,
      room: room
        ? {
            chips: roomChips(entry),
            human: routineName,
            twist: entry?.twist,
            boss: !!(entry?.boss ?? room.boss),
            theme: entry?.theme,
            credit: entry?.community ? `Community Sunday: built by ${entry.community.author}` : room.author ? `Built by ${room.author}` : undefined,
          }
        : null,
      tomorrow: tomorrowLine(next),
      freezes: streak ? { left: streak.freezesLeft, perWeek: ent.freezesPerWeek } : null,
      seenLine: this.seenWeek ? seenLine(this.cat.name, this.seenWeek) : undefined,
      weeklyReady: week?.ready && this.profile.lastSeenWeekly !== week.weekId ? () => this.router.send({ t: 'open', screen: 'weekly' }) : null,
      // streak_break (GDD 9.2): the streak breaks tonight and no Nine Lives are left; a small card, never a modal
      offerSlot:
        streak?.breaksTonight && streak.freezesLeft === 0 && !record
          ? (host) => {
              const money = this.sv.money;
              if (!money || !this.decideMoment('streak_break')) return;
              const offer = this.pendingOffer!;
              this.offerShownThisSession = true;
              return money.mount.offerCard(host, {
                offer,
                onAccept: () => this.openOfferSheet(offer, offer.sku),
                onDismiss: () => host.remove(),
                onSecondary: (sku) => this.openOfferSheet(offer, sku),
              });
            }
          : undefined,
      onPlayToday: () => this.router.send({ t: 'play', dayNo: this.todayNo }),
      onGlass: () => this.router.send({ t: 'play', glass: true }),
      onArchive: () => this.router.send({ t: 'open', screen: 'archive' }),
      // Club (up to 5 cats) opens the cat manager; one cat goes straight to the maker
      onMyCat: () => this.router.send({ t: 'open', screen: this.entitlements().maxCats > 1 && this.sv.catMaker.manage ? 'cats' : 'catmaker' }),
      onSettings: () => this.router.send({ t: 'open', screen: 'settings' }),
      onPresale: () => this.openPresale('home'),
    });
  }

  /** The last 7 days (oldest first) with their ranked stamps, for the home week row. */
  private homeWeek(): { label: string; stamp: DayRecord['stamp'] | null; today: boolean }[] {
    const names = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const out: { label: string; stamp: DayRecord['stamp'] | null; today: boolean }[] = [];
    const now = new Date();
    for (let k = 6; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k);
      const rec = this.safe(() => this.p.dayRecord(this.todayNo - k), null);
      out.push({ label: names[d.getDay()], stamp: rec?.stamp ?? null, today: k === 0 });
    }
    return out;
  }

  private a2hsTracked = false;

  /** An offer card was accepted: open its sheet (Club, cameo or gift) with the chosen SKU. */
  /**
   * The pending offer as a bottom sheet over the current screen (the archive stays visible behind a scrim) instead
   * of its own empty screen. Returns false when there is nothing to show.
   */
  private overlayOffer(): boolean {
    const offer = this.pendingOffer;
    const money = this.sv.money;
    if (!offer || !money) return false;
    this.offerShownThisSession = true;
    const scrim = h('div', { class: 'bc-offer-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': offer.title });
    const host = h('div', { class: 'bc-offer-sheet' });
    scrim.appendChild(host);
    this.layer.appendChild(scrim);
    let un: () => void = () => undefined;
    const close = (): void => {
      un();
      scrim.remove();
    };
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    un = money.mount.offerCard(host, {
      offer,
      onAccept: () => {
        close();
        this.openOfferSheet(offer, offer.sku);
      },
      onDismiss: close,
      onSecondary: (sku) => {
        close();
        this.openOfferSheet(offer, sku);
      },
    });
    return true;
  }

  private openOfferSheet(offer: PaywallOffer, sku: BadcatSku): void {
    this.sheetParams = { sku };
    this.sheetTrigger = offer.trigger;
    this.router.send({ t: 'sheet', sheet: offer.offer === 'cameo' ? 'cameo' : offer.offer === 'gift' ? 'gift' : 'club' });
  }

  private openPresale(from: string): void {
    const url = this.safe(() => this.p.presaleUrl(), null);
    if (!url) return;
    this.track('bc_checkout_start', { sku: 'presale', from, from_in_app: this.env.inApp !== 'none' });
    // No 'noopener' feature: with it window.open always returns null and the fallback would also navigate
    // this tab away. Cut the opener by hand instead.
    let w: Window | null = null;
    try {
      w = window.open(url, '_blank');
    } catch {
      w = null;
    }
    if (w) {
      try {
        w.opener = null;
      } catch {
        /* ignore */
      }
    } else window.location.href = url;
  }

  private mountBriefing(s: RouterState): () => void {
    const plan = s.plan!;
    let play: PlayableRoom;
    try {
      play = this.sv.content.resolve(this.roomFor(plan), plan.mode, plan.dayNo);
    } catch (err) {
      if (this.env.dev) console.warn('[bad-cat ui] room failed to load', err);
      const card = h(
        'div',
        { class: 'bc-screen bc-center' },
        h('div', { class: 'bc-card' }, h('h2', {}, 'This room is not ready yet'), btn(COPY.back, () => this.router.send({ t: 'back' }), 'bc-cta')),
      );
      this.layer.appendChild(card);
      return () => card.remove();
    }
    this.play = play;
    const targets = play.room.props.filter((p) => p.target).map((p) => ({ kind: p.kind, name: targetName(p.kind) }));
    const dareGhost = this.ghostsFor(play)[0];
    const entry = play.dayNo !== undefined && play.room.id.startsWith('daily-') ? this.safe(() => this.sv.content.dailyEntry?.(play.dayNo!) ?? null, null) : null;
    let handle: ReturnType<typeof mountBriefing> | null = null;
    let alive = true;
    // who plays this run: the player's cat, or the household / studio / Felony Friday cat
    this.pickRunCat(plan);
    const felony = !!entry?.felonyFriday && plan.mode !== 'ftue' && !plan.studio && !plan.household;
    // today's Pink Paw cat is the accomplice in the room and the playable criminal (GDD 4.6), so the card names one cat
    const pinkPaw = felony ? this.safe(() => accompliceFor(play.dayNo!, entry?.accomplice ?? play.room.accomplice?.pinkPawId) ?? fridayCriminal(play.dayNo!), null) : null;
    let guests: { id: string; name: string; spec: CatSpec }[] = [];
    const options = (): FelonyOption[] => felonyOptions(this.cat.name, pinkPaw?.name ?? null, guests);
    const choose = (id: string, reload: boolean): void => {
      const opt = options().find((o) => o.id === id) ?? options()[0];
      this.felonyChoice = opt.id;
      if (opt.source === 'pinkpaw' && pinkPaw) {
        this.runCat = pinkPawCatSpec(pinkPaw);
        this.runCatSource = 'pinkpaw';
      } else if (opt.source === 'guest_star') {
        const g = guests.find((x) => `guest:${x.id}` === opt.id);
        this.runCat = g?.spec ?? null;
        this.runCatSource = g ? 'guest_star' : 'mine';
      } else {
        this.runCat = null;
        this.runCatSource = 'mine';
      }
      handle?.setChooserLine?.(felonyLine(this.cat.name, opt));
      if (reload) void this.loadStage(play, () => alive);
    };
    const chooser = (): Parameters<typeof mountBriefing>[1]['chooser'] =>
      felony && pinkPaw
        ? { title: '🚨 Felony Friday: who commits the crime?', options: options(), selected: this.felonyChoice, onPick: (id) => choose(id, true), line: felonyLine(this.cat.name, options().find((o) => o.id === this.felonyChoice)) }
        : undefined;
    if (felony && pinkPaw) {
      // GDD 3.5: today's Pink Paw cat plays by default; the player may still pick their own cat
      if (!options().some((o) => o.id === this.felonyChoice) || this.felonyChoice === 'mine') this.felonyChoice = 'pinkpaw';
      choose(this.felonyChoice, false);
    }
    handle = mountBriefing(this.layer, {
      label: roomLabel(plan.glass, plan.dayNo, play.room.title),
      dare: dareGhost
        ? dareGhost.replayOnly
          ? `${dareGhost.name || dareGhost.cat.name || 'Your friend'}'s ghost runs on older rules: replay only`
          : this.ghostScore(play, dareGhost) > 0
            ? `Beat ${dareGhost.name || dareGhost.cat.name || 'your friend'}'s ghost: ${formatScore(this.ghostScore(play, dareGhost))}`
            : `${dareGhost.name || dareGhost.cat.name || 'Your friend'}'s ghost made no mess: any crash wins`
        : undefined,
      notes: this.safe(() => this.briefingNotes(play), []),
      ...((): { humanName: string; humanIcon: string; warning: string } => {
        const line = humanLine(play.routine, play.routine2);
        return { humanName: line.name, humanIcon: line.icon, warning: line.warning };
      })(),
      eventName: ROOM_EVENT_NAMES[play.room.event] ?? 'The room event',
      mode: plan.mode,
      targets,
      touch: this.env.isTouch,
      ready: false,
      banner: plan.household
        ? `🐾 ${this.runCat?.name || 'Your other cat'}'s turn: same room, then the household clip`
        : play.room.boss
          ? `👑 BOSS ROOM · ${Math.round((play.room.ticks || 2700) / 30)} s${play.routine2 ? ' · two humans' : ''}`
          : undefined,
      chooser: chooser(),
      onStart: () => {
        void this.audio.unlock().catch(() => undefined);
        this.router.send({ t: 'start' });
      },
      onBack: () => this.router.send({ t: 'quit' }),
    });
    // Warm-up behind the card: load the room, draw the first frame. A clip export still holding the renderer
    // ("Play again" while it renders) is cancelled, never waited on: it hands the canvas size and the live camera
    // back after its current frame, and the start button never waits for it.
    const warm = async (): Promise<void> => {
      const job = this.clip;
      if (job?.busy) await Promise.race([job.cancel(), new Promise<void>((res) => setTimeout(res, 1500))]);
      if (!alive) return;
      this.ensureInput();
      await this.loadStage(play, () => alive);
    };
    warm()
      .catch(() => undefined)
      .finally(() => {
        if (alive) handle?.setReady(true);
        if (this.rendererFailed && alive) toast(this.layer, COPY.noRenderer, 3500);
      });
    // Felony Friday guest stars come with the cameo bundle (server only; offline there are none)
    if (felony && pinkPaw && this.sv.money && play.dayNo !== undefined)
      void this.sv.money
        .cameos(play.dayNo, { spectators: play.shell.spectatorSlots?.length ?? 0 })
        .then((b) => {
          if (!alive || !b.guestStars.length) return;
          guests = b.guestStars
            .map((c) => ({ id: c.id, name: c.name, spec: this.safe(() => this.sv.codec.decodeCat(c.catCode, c.name), null) }))
            .filter((g): g is { id: string; name: string; spec: CatSpec } => !!g.spec)
            .slice(0, 3);
          if (guests.length) handle?.setChooser?.(chooser() ?? null);
        })
        .catch(() => undefined);
    // Desktop side panels (and the Club streamer layout with its dare QR)
    this.mountSides(play, targets);
    return () => {
      alive = false;
      handle?.dispose();
    };
  }

  /** The run's cat: the household's second cat, the studio cat, else the player's (Felony Friday may change it). */
  private pickRunCat(plan: RunPlan): void {
    if (plan.household && this.household) {
      this.runCat = this.profile.cats[this.household.secondIdx] ?? null;
      this.runCatSource = 'household';
      return;
    }
    if (plan.studio && this.studioCat) {
      this.runCat = this.studioCat;
      this.runCatSource = 'studio';
      return;
    }
    this.runCat = null;
    this.runCatSource = 'mine';
  }

  /** The cat that plays now. */
  private get playCat(): CatSpec {
    return this.runCat ?? this.cat;
  }

  /** Face decal of the cat that plays now (the player's photo, the household cat's photo, none for guests). */
  private async playFace(): Promise<FaceDecal | null> {
    if (this.runCatSource === 'household' && this.household) return this.sv.catMaker.loadFace(this.household.secondIdx).catch(() => null);
    if (this.runCatSource === 'studio') return this.studioFace;
    if (this.runCat) return null;
    if (!this.face) this.face = await this.sv.catMaker.loadFace(this.profile.active).catch(() => null);
    return this.face;
  }

  /**
   * Load the room into the stage with the cat that plays, the ghosts and the room extras; draw frame 0. Loads are
   * serialised: a second renderer.load() while the first one still compiles its shaders (compileAsync) throws inside
   * three.js (a Felony Friday chip tapped during the warm-up), so each load waits for the previous one.
   */
  private stageQueue: Promise<void> = Promise.resolve();
  private loadStage(play: PlayableRoom, alive: () => boolean): Promise<void> {
    const run = this.stageQueue.then(() => (alive() ? this.loadStageNow(play, alive) : undefined));
    this.stageQueue = run.catch(() => undefined);
    return run;
  }

  private async loadStageNow(play: PlayableRoom, alive: () => boolean): Promise<void> {
    const r = this.ensureRenderer();
    if (!r) return;
    const faces = new Map<number, FaceDecal>();
    const face = await this.playFace();
    if (!alive()) return;
    if (face) faces.set(0, face);
    try {
      r.setClipShot(null);
      const club = this.entitlements().club;
      this.safe(() => r.setLayout?.(club && this.profile.prefs?.streamer ? 'streamer' : 'portrait'), undefined);
      const ghosts = this.ghostsFor(play);
      const cat = this.playCat;
      await r.load(play, [cat, ...ghosts.map((g) => g.cat)], faces);
      if (!alive()) return;
      const s0 = this.sv.sim.initSim(play, cat);
      r.setGhosts?.(ghosts.map((g) => this.sv.sim.initSim(play, g.cat, { simVersion: g.simVersion })));
      this.decorate(r, play);
      // review round 1: the first run on a phone showed 1.5 s of black (HUD only) while the intro's close-up
      // compiled and uploaded on its first frame. Draw that close-up once here, behind the briefing card.
      if (r.setIntro) {
        this.safe(() => {
          r.setIntro!(0);
          r.frame(s0, 0, []);
          r.setIntro!(0.5);
          r.frame(s0, 0, []);
          r.setIntro!(null);
        }, undefined);
      }
      r.frame(s0, 0, []);
    } catch (err) {
      if (this.env.dev) console.warn('[bad-cat ui] renderer load failed', err);
    }
  }

  private studioCat: CatSpec | null = null;
  private studioFace: FaceDecal | null = null;

  /** Desktop side panels: targets + accomplice left, ghosts + Rap Sheet right, dare QR in the streamer layout. */
  private mountSides(play: PlayableRoom, targets: { kind: number; name: string }[]): void {
    this.sides?.dispose();
    this.sides = null;
    if (this.env.isTouch) return;
    const club = this.entitlements().club;
    const streamer = club && !!this.profile.prefs?.streamer;
    const acc = this.accompliceView(play, false);
    const wish = acc && acc.wishProp >= 0 ? play.room.props[acc.wishProp] : undefined;
    const rap = this.safe(() => this.sv.progress?.rapSheet?.(this.p.store, { club }) ?? null, null);
    const ghosts = this.ghostsFor(play).map((g) => `${g.name || g.cat.name || 'Friend'}${g.replayOnly ? ' (replay only)' : ` · ${formatScore(this.ghostScore(play, g))}`}`);
    const link = this.dailyLink(play);
    this.sides = mountSidePanels(this.appEl, {
      targets: targets.map((t) => ({ icon: propEmoji(t.kind), name: t.name })),
      accomplice: acc ? (wish ? `${acc.name} wants the ${propKind(wish.kind)?.name?.toLowerCase() ?? 'thing'}` : `${acc.name} is watching`) : undefined,
      ghosts,
      rapLine: rap ? `${formatScore(rap.total)} crimes · ${rap.distinct} of ${rap.catalog} stamps` : undefined,
      streamer,
      qr: streamer ? { svg: this.safe(() => qrSvg(link), ''), caption: link.replace(/^https?:\/\//, '') } : null,
    });
  }

  /** FULL build briefing lines: weekday twist, boss, accomplice wish, Felony Friday, sponsor, community credit. */
  private briefingNotes(play: PlayableRoom): { icon: string; text: string }[] {
    const out: { icon: string; text: string }[] = [];
    const entry = play.dayNo !== undefined && play.room.id.startsWith('daily-') ? this.safe(() => this.sv.content.dailyEntry?.(play.dayNo!) ?? null, null) : null;
    if (play.routine2 && !play.room.boss && !entry?.twist) out.push({ icon: '👀', text: 'Two humans, one shared suspicion meter' });
    if (entry?.twist) out.push({ icon: '✨', text: entry.twist });
    else if (play.routine.mirror) out.push({ icon: '🪞', text: 'Mirror: when it glints she checks it. Freeze until she looks away' });
    else if (play.routine.onCamera) out.push({ icon: '🎥', text: 'On camera: crashes in the webcam view score +50 %' });
    const nap = play.routine.kind === 'napper' || play.routine2?.kind === 'napper';
    if (nap && !entry?.twist) out.push({ icon: '💤', text: 'Napper: noise fills the meter. Sneak, or she wakes up' });
    const acc = this.accompliceView(play, false);
    if (acc) {
      const wish = acc.wishProp >= 0 ? play.room.props[acc.wishProp] : undefined;
      out.push({
        icon: '🐾',
        text: wish
          ? `${acc.name} from Pink Paw is your accomplice. Wish: ${propEmoji(wish.kind)} ${propKind(wish.kind)?.name ?? 'that'} (+500)`
          : `${acc.name} from Pink Paw is watching`,
      });
    }
    if (entry?.felonyFriday && !entry.twist && play.mode === 'ftue') out.push({ icon: '🚨', text: 'Felony Friday: a real Pink Paw cat is in on the crime' });
    const sponsor = play.room.sponsor?.label ?? entry?.sponsor?.label;
    if (sponsor) out.push({ icon: '⭐', text: `Today's prop: ${sponsor}` });
    // Community Sunday (GDD 3.5) credits the player who built it; player rooms credit their author and remix line
    if (entry?.community) out.push({ icon: '🛠️', text: `Community Sunday: built by ${entry.community.author}` });
    else if (play.room.author) out.push({ icon: '🛠️', text: `Built by ${play.room.author}${play.room.ancestors?.[0] ? ` · remix of ${play.room.ancestors[0]}'s room` : ''}` });
    return out;
  }

  /** Today's Pink Paw accomplice as the renderer draws it (null without one). */
  /** The room of the link the player arrived by, when it is not today's room: "Play Bathroom #3 again". */
  private linkAgain(): { label: string; onPlay(): void } | null {
    const e = this.entry;
    if (e.glass) return { label: `Play ${COPY.glassLabel} again`, onPlay: () => this.router.send({ t: 'play', glass: true }) };
    if (e.ugc && this.ugc?.room) return { label: `Play ${this.ugc.room.title || 'that room'} again`, onPlay: () => this.router.send({ t: 'play', ugc: true }) };
    const d = e.dayNo;
    if (d === undefined || d === this.todayNo) return null;
    const label = this.safe(() => this.sv.content.roomLabel?.(d) ?? kitchenLabel(d), kitchenLabel(d));
    return { label: `Play ${label.split(' · ')[0]} again`, onPlay: () => this.router.send({ t: 'play', dayNo: d }) };
  }

  /**
   * The Pink Paw cat keeping watch in this room (briefing, render, result wish line, adopt link and post formats all
   * read this one resolver). Felony Friday (round 2): when today's Pink Paw cat commits the crime, a different one
   * keeps watch (the same cat as accomplice and criminal read as a bug); round 3: the result named the criminal.
   */
  private accompliceCat(play: PlayableRoom): ReturnType<typeof accompliceFor> {
    const a = play.room.accomplice;
    if (!a) return null;
    let cat = this.safe(() => accompliceFor(play.dayNo ?? this.todayNo, a.pinkPawId), null);
    if (!cat) return null;
    const runName = this.runCatSource === 'pinkpaw' ? this.runCat?.name : null;
    if (runName && cat.name === runName) {
      const pool = this.safe(() => pinkPawWaiting(), []);
      const at = pool.findIndex((c) => c.name === runName);
      const other = pool.length > 1 ? pool[(at + 1) % pool.length] : null;
      if (other && other.name !== runName) cat = other;
    }
    return cat;
  }

  private accompliceView(play: PlayableRoom, granted: boolean): AccompliceView | null {
    const a = play.room.accomplice;
    if (!a) return null;
    const cat = this.accompliceCat(play);
    if (!cat) return null;
    const spot = play.shell.accompliceSpot;
    const x = a.x ?? spot?.x;
    const z = a.z ?? spot?.z;
    const level = a.level ?? spot?.level;
    if (x === undefined || z === undefined || level === undefined) return null;
    return {
      spec: pinkPawCatSpec(cat),
      name: cat.name,
      x,
      z,
      level,
      wishProp: a.wishPropIndex ?? -1,
      granted,
      badge: pinkPawBadge(cat) ? 'alumni' : 'accomplice',
    };
  }

  /** Render extras of the loaded room: trail, accomplice, cameo spectators (and approved faces when online). */
  private decorate(r: Renderer, play: PlayableRoom): void {
    this.safe(() => r.setTrail?.(this.profile.trails?.[this.profile.active] ?? 0), undefined);
    this.accomplice = this.accompliceView(play, false);
    this.safe(() => r.setAccomplice?.(this.accomplice), undefined);
    const money = this.sv.money;
    const slots = play.shell.spectatorSlots?.length ?? 0;
    if (!r.setCameos) return;
    if (!money || !slots || play.dayNo === undefined || play.mode === 'ftue') {
      this.safe(() => r.setCameos?.(null), undefined);
      return;
    }
    void money
      .cameos(play.dayNo, { spectators: slots })
      .then(async (bundle) => {
        const faces = await this.cameoFaces(bundle);
        if (this.play === play) r.setCameos?.(bundle, faces);
      })
      .catch(() => undefined);
  }

  /** Approved cameo faces (server bundles only): the API origin + the relative faceUrl, decoded here (GDD 6.5). */
  private async cameoFaces(bundle: CameoBundle): Promise<Map<string, ImageBitmap>> {
    const out = new Map<string, ImageBitmap>();
    const api = this.env.apiUrl;
    if (bundle.source !== 'server' || !api || typeof createImageBitmap === 'undefined') return out;
    const all = [...bundle.spectators, ...bundle.fridge, ...bundle.guestStars].filter((c) => c.faceUrl);
    await Promise.all(
      all.slice(0, 24).map(async (c) => {
        try {
          const url = /^https:\/\//.test(c.faceUrl!) ? c.faceUrl! : `${api.replace(/\/$/, '')}${c.faceUrl!.startsWith('/') ? '' : '/'}${c.faceUrl}`;
          const res = await fetch(url, { credentials: 'omit' });
          if (res.ok) out.set(c.id, await createImageBitmap(await res.blob()));
        } catch {
          /* default face */
        }
      }),
    );
    return out;
  }

  /** Collar / hat chips the cat maker may offer: season + streak rewards, shop SKUs, the Club collar. */
  private ownedChips(): { collars: number[]; hats: number[] } {
    const collars = new Set<number>();
    const hats = new Set<number>();
    const add = (slot: string, id: number): void => {
      if (slot === 'collar') collars.add(id);
      else if (slot === 'hat') hats.add(id);
    };
    for (const k of this.safe(() => this.sv.progress?.ownedCosmetics?.(this.p.store) ?? [], [] as number[])) {
      const d = cosmeticFromKey(k);
      if (d) add(d.slot, d.id);
    }
    const ent = this.entitlements();
    for (const c of this.safe(() => cosmeticsForSkus(ent.skus), [])) add(c.slot, c.id);
    if (ent.club) for (const c of COSMETICS) if (c.source === 'club') add(c.slot, c.id);
    return { collars: [...collars], hats: [...hats] };
  }

  private entitlements(): Entitlements {
    return this.safe(() => this.sv.money?.entitlements() ?? null, null) ?? {
      club: false,
      skus: [],
      cosmetics: [],
      maxCats: 1,
      freezesPerWeek: 1,
      archiveDays: 14,
      seasonTiers: 15,
      expiresAt: 0,
      source: 'free',
    };
  }

  /** Club UI is on: the game is online (API origin) and the server answered its status. */
  private clubOnline(): boolean {
    return !!(this.env.apiUrl && this.status?.enabled);
  }

  /** Paywall context of this session (GDD 9.2); money decides, the shell only adds its own gate. */
  private paywallCtx(trigger: PaywallTrigger, extra: Partial<PaywallContext> = {}): PaywallContext {
    const r = this.result;
    const streak = this.safe(() => this.sv.progress?.streakDetail?.(this.p.store, this.todayNo, { freezesPerWeek: this.entitlements().freezesPerWeek }) ?? null, null);
    return {
      trigger,
      sessionIndex: this.profile.sessions,
      shownThisSession: this.offerShownThisSession,
      afterShare: false,
      abArm: this.safe(() => this.p.abArm?.() ?? 'A', 'A' as const),
      club: this.entitlements().club,
      now: new Date(),
      catName: this.cat.name,
      nextDayLabel: this.sv.content.roomLabel?.(this.todayNo + 1) ?? kitchenLabel(this.todayNo + 1),
      streak: streak?.current ?? this.sv.progress?.streakStatus?.(this.p.store, this.todayNo).current,
      ...(streak ? { freezesLeft: streak.freezesLeft, breaksTonight: streak.breaksTonight } : {}),
      stamp: r?.stamp,
      serverCheckout: !!(this.status?.checkout && this.env.apiUrl),
      ...extra,
    };
  }

  /** A paywall moment outside the share flow (catmaker_saved, streak_break, archive_old); null = nothing to show. */
  private decideMoment(trigger: PaywallTrigger, extra: Partial<PaywallContext> = {}): boolean {
    this.pendingOffer = null;
    const money = this.sv.money;
    if (!money || !mayOffer(this.profile.sessions, this.offerShownThisSession, sameLocalDay(this.profile.createdAt, Date.now()))) return false;
    const offer = this.safe(() => money.paywall(this.paywallCtx(trigger, extra)), null);
    this.pendingOffer = offer;
    return !!offer;
  }

  /**
   * Paywall moment after the share sheet was shared or dismissed (GDD 9.2): post_share (arm A) or perfect_crime
   * (arm B, perfect runs), else the S1 gift card. Never after the first heist, a studio or household run.
   */
  private decideOffer(): boolean {
    this.pendingOffer = null;
    const plan = this.router?.state.plan;
    if (plan?.studio || plan?.mode === 'ftue' || plan?.playtest) return false;
    for (const t of ['post_share', 'perfect_crime', 'gift_s1'] as const) {
      if (t === 'perfect_crime' && this.result?.stamp !== 'perfect') continue;
      if (this.decideMoment(t, { afterShare: true })) return true;
    }
    return false;
  }

  /** Club members: the active cat is the one in the weekly cameo and on the fridge wall (GDD 6.5, 9.2). */
  private syncClubCat(): void {
    const money = this.sv.money;
    if (!money || !this.clubOnline() || !this.entitlements().club) return;
    const code = this.safe(() => this.sv.codec.encodeCat(this.cat), '');
    if (code) void money.setClubCat(code, this.cat.name || 'Tofu').catch(() => false);
  }

  // ------------------------------------------------------------------------- FULL build side screens

  private dayLabel = (d: number): string => this.safe(() => this.sv.content.roomLabel?.(d) ?? null, null) ?? `Day #${d}`;

  /** Money and link sheets (GDD 6.6 routes, 9). Offline every money screen shows its own "Coming soon" card. */
  private mountSheet(kind: SheetKind): () => void {
    const host = h('div', { class: 'bc-screen bc-sheet-host' });
    this.layer.appendChild(host);
    const fromRoute = this.entry.kind === 'route' && this.entry.route === kind;
    const params: Record<string, string> = fromRoute ? { ...(this.link?.params ?? {}) } : { ...this.sheetParams };
    this.sheetParams = {};
    const trigger = this.sheetTrigger;
    this.sheetTrigger = 'home';
    let alive = true;
    let un: (() => void) | null = null;
    const close = (): void => {
      if (fromRoute) this.clearRouteUrl();
      this.router.send({ t: 'back' });
    };
    const card = (title: string, body: string, extra?: HTMLElement): void => {
      host.append(
        h('header', { class: 'bc-head' }, btn(`‹ ${COPY.back}`, close, 'bc-link')),
        h('section', { class: 'bc-card bc-center' }, h('div', { class: 'bc-logo', 'aria-hidden': 'true' }, '🐾'), h('h2', {}, title), h('p', { class: 'bc-muted' }, body), extra ?? null),
      );
    };
    if (kind === 'maker') {
      // The Room Maker (W2-EDITOR) is not in this build yet: a remix link still plays the room.
      const room = this.link?.room;
      card(
        'The Room Maker is almost ready',
        room ? `You can already play ${room.title || 'this room'}${room.author ? ` by ${room.author}` : ''}. Remixing opens soon.` : 'Building your own rooms opens soon.',
        room
          ? btn('Play this room', () => {
              this.entry = { kind: 'room_link', ugc: true, via: this.entry.via };
              this.router.ctx.entry = this.entry;
              this.router.send({ t: 'back' });
              this.router.send({ t: 'play', ugc: true });
            }, 'bc-cta')
          : undefined,
      );
      return () => {
        alive = false;
        host.remove();
      };
    }
    const money = this.sv.money;
    if (!money) {
      card('Coming soon', 'This part of Bad Cat Daily is not open yet.');
      return () => host.remove();
    }
    const onEntitlements = (e: Entitlements | null): void => {
      if (e) {
        // GDD 8 / 9.2: up to 5 cats, 3 Nine Lives a week, the full archive, all 30 season tiers, caption styles,
        // the streamer flag and the cosmetics all read money.entitlements() from now on; the profile is re-read
        // through the platform's cat allowance, and a Club member's cat goes on the fridge wall
        this.profile = this.safe(() => this.p.profile(), this.profile);
        this.cat = this.profile.cats[this.profile.active] ?? this.cat;
        if (e.club) {
          this.syncClubCat();
          toast(this.layer, `Welcome to the Chaos Club, ${this.cat.name || 'bad cat'}!`, 3000);
        } else if (e.skus.length) toast(this.layer, 'Unlocked. Thank you!', 2500);
      }
      close();
    };
    void money
      .status()
      .then((status) => {
        if (!alive) return;
        this.status = status;
        const inApp = this.env.inApp !== 'none';
        switch (kind) {
          case 'thanks':
            un = money.mount.thanks(host, {
              sessionId: params.session_id ?? '',
              cat: this.cat,
              face: async () => this.face?.texture ?? null,
              todayNo: this.todayNo,
              dayLabel: this.dayLabel,
              onDone: (c) => onEntitlements(c.entitlements ?? null),
            });
            break;
          case 'redeem':
            un = money.mount.redeem(host, { code: params.code ?? '', cats: this.profile.cats, todayNo: this.todayNo, dayLabel: this.dayLabel, onDone: onEntitlements });
            break;
          case 'restore':
            un = money.mount.restore(host, { token: params.t, onDone: onEntitlements, onBack: close });
            break;
          case 'cameo':
            un = money.mount.cameo(host, { cat: this.cat, todayNo: this.todayNo, dayLabel: this.dayLabel, guestStar: params.sku === 'guest_star', status, onClose: close });
            break;
          case 'brand':
            un = money.mount.brand(host, { status, todayNo: this.todayNo, dayLabel: this.dayLabel, onClose: close });
            break;
          case 'shop':
            un = money.mount.shop(host, { entitlements: money.entitlements(), status, onClose: close });
            break;
          case 'gift':
            un = money.mount.gift(host, { status, onClose: close });
            break;
          default:
            un = money.mount.club(host, {
              trigger,
              catName: this.cat.name,
              entitlements: money.entitlements(),
              status,
              inApp,
              onClose: close,
              ...(params.sku ? { sku: params.sku as BadcatSku } : {}),
            } as Parameters<typeof money.mount.club>[1]);
        }
      })
      .catch(() => {
        if (alive) card('Coming soon', 'This part of Bad Cat Daily is not open yet.');
      });
    return () => {
      alive = false;
      un?.();
      host.remove();
    };
  }

  /** A /badcat/<route> page left: drop the route (and its one-time params) from the address bar. */
  private clearRouteUrl(): void {
    try {
      const u = new URL(window.location.href);
      // every LINK_ROUTES entry (round 3: gift and shop were missing, so a reload reopened the sheet)
      const routes = LINK_ROUTES.join('|');
      if (new RegExp(`route=|^#(${routes})\\b`).test(u.hash)) u.hash = '';
      u.pathname = u.pathname.replace(new RegExp(`/(${routes})(\\.html)?/?$`), '/');
      u.search = '';
      window.history.replaceState(null, '', u.toString());
    } catch {
      /* cosmetic */
    }
  }

  /** Your cats (Club: up to 5): switch, add, delete; free players see their one cat and the Club row. */
  private mountCats(): () => void {
    const host = h('div', { class: 'bc-screen bc-catmaker-host' });
    this.layer.appendChild(host);
    let alive = true;
    const manage = this.sv.catMaker.manage;
    const done = (): void => {
      if (alive) this.router.send({ t: 'back' });
    };
    if (!manage) {
      queueMicrotask(() => this.router.send({ t: 'open', screen: 'catmaker' }));
      return () => host.remove();
    }
    const maxCats = Math.max(1, this.entitlements().maxCats | 0);
    const upsell = this.clubOnline() && this.status?.checkout && this.profile.sessions > 1;
    manage(host, {
      cats: this.profile.cats,
      active: this.profile.active,
      maxCats,
      render: this.sv.render,
      onUpsell: upsell
        ? () => {
            this.sheetTrigger = 'settings';
            this.router.send({ t: 'sheet', sheet: 'club' });
          }
        : undefined,
    })
      .then((res) => {
        if (!alive) return;
        this.profile = { ...this.profile, cats: res.cats.length ? res.cats : [DEFAULT_CAT], active: Math.max(0, Math.min(res.active, res.cats.length - 1)) };
        this.safe(() => this.p.saveProfile(this.profile), false);
        this.cat = this.profile.cats[this.profile.active] ?? DEFAULT_CAT;
        this.face = null; // reloaded for the new star on the next briefing
        this.syncClubCat();
        done();
      })
      .catch(() => done());
    return () => {
      alive = false;
      host.remove();
    };
  }

  private mountRap(): () => void {
    const prog = this.sv.progress;
    const store = this.p.store;
    const club = this.entitlements().club;
    const now = new Date();
    const meta = this.sv.meta;
    const summary = this.safe(() => prog?.rapSheet?.(store, { club }) ?? null, null);
    if (meta && summary)
      return meta.rapSheet(this.layer, {
        catName: this.cat.name,
        mugshot: this.safe(() => catFaceSvg(this.cat), undefined),
        summary,
        crimes: this.safe(() => prog?.crimes?.(store, { club }) ?? [], []),
        onShareCard: () => this.shareRapCard(null),
        onBack: () => this.router.send({ t: 'back' }),
      });
    return mountRapSheet(this.layer, {
      catName: this.cat.name,
      rap: this.safe(() => prog?.rapSheet?.(store, { club }) ?? null, null),
      crimes: this.safe(() => prog?.crimes?.(store, { club }) ?? [], []),
      weekly: this.safe(() => prog?.weekly?.(store, now, { club }) ?? null, null),
      season: this.safe(() => prog?.season?.(store, now, { club }) ?? null, null),
      streak: this.safe(() => prog?.streakDetail?.(store, this.todayNo, { freezesPerWeek: this.entitlements().freezesPerWeek }) ?? null, null),
      club,
      onClaim: prog?.claimTier
        ? (tier) => {
            const got = this.safe(() => prog.claimTier!(store, tier, new Date(), { club }), null);
            if (got) toast(this.layer, `Unlocked: ${got.name}`);
            return got ? got.name : null;
          }
        : undefined,
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  // ------------------------------------------------------------------------- wave 2: meta screens

  /** A side screen whose lane is missing: a friendly card with a way back. */
  private placeholder(title: string, body: string): () => void {
    const card = h(
      'div',
      { class: 'bc-screen bc-center' },
      h('section', { class: 'bc-card bc-center' }, h('div', { class: 'bc-logo', 'aria-hidden': 'true' }, '🐾'), h('h2', {}, title), h('p', { class: 'bc-muted' }, body), btn(COPY.back, () => this.router.send({ t: 'back' }), 'bc-cta')),
    );
    this.layer.appendChild(card);
    return () => card.remove();
  }

  /** Club sheet when the server takes checkouts, else a friendly toast (offline builds never call the server). */
  private openClub(trigger: CheckoutMeta['trigger']): void {
    // Offline builds show no Club UI at all (GDD 7.4, 0c), so nothing should reach here; if something does, it
    // stays silent rather than teasing a Club that does not exist.
    if (!this.clubOnline() || !this.status?.checkout) return;
    this.sheetTrigger = trigger;
    this.router.send({ t: 'sheet', sheet: 'club' });
  }

  /** The archive (GDD 8): every past daily with its record; older than the free window = Club (paywall moment). */
  private mountArchive(): (() => void) | null {
    const meta = this.sv.meta;
    const archive = this.sv.content.archive;
    if (!meta || !archive) return null;
    const ent = this.entitlements();
    const freeDays = Math.max(1, ent.archiveDays | 0 || 14);
    const count = ent.club ? 400 : freeDays + 30;
    const entries = this.safe(() => archive.call(this.sv.content, this.todayNo, count), []);
    if (!entries.length) return null;
    return meta.archive(this.layer, {
      todayNo: this.todayNo,
      entries,
      records: (d) => this.safe(() => this.p.dayRecord(d), null),
      club: ent.club,
      clubUi: this.clubOnline(),
      freeDays,
      onPlay: (dayNo) => {
        this.track('bc_picker', { choice: dayNo === this.todayNo ? 'today' : 'past', days_back: this.todayNo - dayNo });
        this.router.send({ t: 'play', dayNo });
      },
      onGlass: () => this.router.send({ t: 'play', glass: true }),
      onLocked: (dayNo) => {
        // archive_old (GDD 9.2): a small offer card when money says so; else a friendly line (session 1, offline)
        if (this.decideMoment('archive_old') && this.overlayOffer()) return;
        toast(this.layer, this.clubOnline() ? `${this.dayLabel(dayNo)} is older than ${freeDays} days: the full archive comes with the Chaos Club.` : `${this.dayLabel(dayNo)} is older than ${freeDays} days: it stays locked for now.`, 3000);
      },
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  private mountSeason(): () => void {
    const prog = this.sv.progress;
    const meta = this.sv.meta;
    const store = this.p.store;
    const club = this.entitlements().club;
    const view = this.safe(() => prog?.season?.(store, new Date(), { club }) ?? null, null);
    if (!meta || !view) return this.placeholder('Season track', 'The season track is warming up. Play a run and come back.');
    return meta.season(this.layer, {
      view,
      club,
      clubUi: this.clubOnline(),
      onClaim: (tier) => {
        const got = this.safe(() => prog?.claimTier?.(store, tier, new Date(), { club }) ?? null, null);
        toast(this.layer, got ? `Unlocked: ${got.name}` : 'Claimed. Bragging rights secured.');
      },
      onJoinClub: () => this.openClub('settings'),
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  /** Room id of today's daily (friends board key). */
  private todayRoomId(): string | null {
    return this.safe(() => this.sv.content.dailyRoom(this.todayNo).id, null);
  }

  private friendEntries(): FriendGhost[] {
    const id = this.todayRoomId();
    return id ? this.safe(() => this.sv.progress?.friends?.(this.p.store, id) ?? [], []) : [];
  }

  /** Friends board (GDD 6.3): the dare ghosts received for today's room; Race replays one as a ghost. */
  private mountFriends(): () => void {
    const meta = this.sv.meta;
    if (!meta || !this.sv.progress?.friends) return this.placeholder('Friends board', 'Dares from friends show up here.');
    return meta.friends(this.layer, {
      roomLabel: this.safe(() => this.sv.content.roomLabel?.(this.todayNo) ?? null, null) ?? kitchenLabel(this.todayNo),
      entries: this.friendEntries(),
      myScore: this.safe(() => this.p.dayRecord(this.todayNo)?.score, undefined),
      onRace: (g) => void this.raceFriend(g),
      onHide: (g) => this.safe(() => this.sv.progress?.hideFriend?.(this.p.store, g.roomId, g.ghost), undefined),
      // round 3: the empty board had nothing to tap: dare a friend with this session's run of today, else play it first
      onDare: () => {
        const r = this.result;
        const play = this.resultPlay;
        if (r && play && r.mode !== 'ftue' && play.dayNo === this.todayNo) this.shareDare(r, play);
        else {
          toast(this.layer, "Play today's room, then tap Dare a friend", 3000);
          this.router.send({ t: 'play', dayNo: this.todayNo });
        }
      },
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  /** Re-decode a stored ghost payload (as a dare link of today's room) and race it. */
  private async raceFriend(g: FriendGhost): Promise<void> {
    const parse = this.sv.codec.parseLinkFull;
    const day = this.todayNo;
    const slug = day >= 1 ? String(day) : `p${-day}`;
    try {
      if (!parse) throw new Error('no ghost decoder');
      const full = await parse(new URL(`https://badcat.invalid/?d=${slug}&g=${encodeURIComponent(g.ghost)}`));
      const ref = full.ghosts[0];
      if (!ref) throw new Error('no ghost');
      const ghost: GhostRef = { ...ref, name: ref.name || g.name, simVersion: ref.simVersion ?? g.simVersion };
      this.link = { ghosts: [ghost], dayNo: day };
      this.dareGhosts = [ghost];
      this.router.send({ t: 'play', dayNo: day });
    } catch {
      toast(this.layer, 'That ghost got away. Ask for a fresh dare.');
    }
  }

  private weeklySummary(): import('../types').WeeklySummary | null {
    const club = this.entitlements().club;
    return this.safe(() => this.sv.progress?.weekly?.(this.p.store, new Date(), { club }) ?? null, null);
  }

  /** Weekly Rap Sheet card (GDD 3.5): ready Sunday 18:00; Club gets the animated version. */
  private mountWeekly(): () => void {
    const meta = this.sv.meta;
    const week = this.weeklySummary();
    if (!meta || !week) return this.placeholder('Your week', 'Your weekly card shows up after your first crimes.');
    if (week.ready && this.profile.lastSeenWeekly !== week.weekId) {
      this.profile = { ...this.profile, lastSeenWeekly: week.weekId };
      this.safe(() => this.p.saveProfile(this.profile), false);
    }
    return meta.weekly(this.layer, {
      summary: week,
      catName: this.cat.name,
      animated: this.entitlements().club && !this.profile.settings.reduceMotion,
      onShare: () => this.shareRapCard(week),
      onClose: () => this.router.send({ t: 'back' }),
    });
  }

  /** Rap Sheet mugshot card (or the week's card); Club members share the 3 s animated loop when it renders. */
  private shareRapCard(week: import('../types').WeeklySummary | null): void {
    const prog = this.sv.progress;
    const club = this.entitlements().club;
    const summary = this.safe(() => prog?.rapSheet?.(this.p.store, { club }) ?? null, null);
    if (!summary) {
      toast(this.layer, 'No crimes on file yet. Suspicious.');
      return;
    }
    toast(this.layer, 'Printing the mugshot…', 1500);
    // round 3: "Make your cat" on the mugshot pointed at today's day link: it is the cat link now
    const link = this.catLinkShort();
    const text = `${this.cat.name || 'My cat'}'s Rap Sheet: ${summary.total} crimes and counting. ${link} #badcatdaily`;
    void this.sv
      .loadShare()
      .then(async (sh) => {
        const portrait = await (this.sv.render.renderCatPortrait?.(this.cat, null, { w: 540, h: 720, pose: 'mugshot' }) ?? Promise.resolve(null)).catch(() => null);
        const input = { kind: 'rapsheet' as const, cat: this.cat, portrait, summary, week, link, club };
        if (club && sh.renderRapSheetLoop && sh.shareClip) {
          const loop = await sh.renderRapSheetLoop(input).catch(() => null);
          if (loop?.blob) {
            const m = await sh.shareClip(loop.blob, text);
            if (m !== 'cancelled') this.track('bc_share_action', { artifact: 'rapsheet', method: m, animated: true });
            return;
          }
        }
        const blob = await sh.renderCard?.(input);
        if (!blob || !sh.shareImage) {
          toast(this.layer, 'The card could not be drawn here.');
          return;
        }
        const m = await sh.shareImage(blob, text, week ? `bad-cat-week-${week.weekId}.png` : 'bad-cat-rap-sheet.png');
        if (m !== 'cancelled') this.track('bc_share_action', { artifact: 'rapsheet', method: m });
      })
      .catch(() => toast(this.layer, 'Sharing failed. Try again.'));
  }

  /** Full settings (W2-META): sliders, clip options, consent, reminder, save code + QR, account rows. */
  private mountMetaSettings(): (() => void) | null {
    const meta = this.sv.meta;
    if (!meta) return null;
    const club = this.entitlements().club;
    const store = this.p.store;
    return meta.settings(this.layer, {
      profile: this.profile,
      persistent: store.persistent,
      club,
      consent: this.safe(() => this.p.consent?.() ?? 'unset', 'unset' as const),
      hasPhoto: this.face
        ? true
        : this.sv.catMaker
            .loadFace(this.profile.active)
            .then((f) => {
              if (f && !this.face) this.face = f;
              return !!f;
            })
            .catch(() => false),
      a2hs: this.safe(() => this.p.a2hs?.() ?? null, null),
      exportSave: () => exportSave(store),
      importSave: async (code) => {
        const ok = await importSave(store, code.trim()).catch(() => false);
        if (ok) {
          toast(this.layer, 'Save loaded. Restarting…');
          setTimeout(() => window.location.reload(), 900);
        }
        return ok;
      },
      qr: (text) => this.safe(() => qrSvg(text), ''),
      onIcs: (time) => this.downloadIcs(time),
      onChange: (pr) => {
        this.profile = pr;
        this.safe(() => this.p.saveProfile(this.profile), false);
        this.applyReduceMotion();
        this.audio.setMuted(!pr.settings.audio);
        const v = pr.prefs ?? {};
        this.safe(() => this.audio.setVolumes({ master: v.master, music: v.music, sfx: v.sfx }), undefined);
      },
      onConsent: (granted) => this.safe(() => this.p.setConsent?.(granted), undefined),
      onRestore: () => {
        if (this.clubOnline()) this.router.send({ t: 'sheet', sheet: 'restore' });
        else toast(this.layer, 'Nothing to restore yet: purchases open with the Chaos Club.');
      },
      onPortal: () => {
        void this.sv.money
          ?.portal()
          .then((r) => {
            if (r.url) window.location.assign(r.url);
            else toast(this.layer, 'The portal is not available right now');
          })
          .catch(() => toast(this.layer, 'The portal is not available right now'));
      },
      onManageCats: () => this.router.send({ t: 'open', screen: this.sv.catMaker.manage ? 'cats' : 'catmaker' }),
      onCreatorCode: () => void this.requestCreatorCode(),
      onClub: () => this.openClub('settings'),
      clubUi: this.clubOnline(),
      ...(this.clubOnline() && this.status?.brand ? { onBrand: () => this.router.send({ t: 'sheet', sheet: 'brand' }) } : {}),
      ...(this.onlineOn() ? { online: this.onlineSettings() } : {}),
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  private downloadIcs(time: string): void {
    try {
      if (!this.p.icsReminder) throw new Error('no ics');
      const blob = this.p.icsReminder(time, this.linkBase());
      const a = h('a', { href: URL.createObjectURL(blob), download: 'bad-cat-daily.ics' });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    } catch {
      toast(this.layer, 'Could not make the calendar file');
    }
  }

  /** Creator code request (server feature; offline builds say so without a request). */
  private async requestCreatorCode(): Promise<void> {
    const money = this.sv.money;
    if (!money || !this.clubOnline() || !this.status?.creatorCodes) {
      toast(this.layer, 'Creator codes open soon. Tag us in your clips meanwhile!');
      return;
    }
    const raw = typeof window.prompt === 'function' ? window.prompt('Your creator code (6 to 12 letters, digits or _)') : null;
    if (!raw) return;
    const code = this.safe(() => this.sv.codec.creatorCode?.(raw) ?? null, null);
    if (!code) {
      toast(this.layer, 'That code does not fit the rules (6 to 12 of a-z, 0-9, _).');
      return;
    }
    const email = window.prompt('Email for the creator report') ?? '';
    if (!email.includes('@')) return;
    const res = await money.requestCreatorCode(code, email.trim()).catch(() => ({ ok: false }));
    toast(this.layer, res.ok ? `Requested ${code}. We will email you.` : 'That did not work. Try another code.');
  }

  /** Consent banner (GDD 14): on home only, until the player picks; only where analytics could ever send. */
  private consentHost: HTMLElement | null = null;

  private syncConsent(show: boolean): void {
    const meta = this.sv.meta;
    // GDD 14: asked in session 2 (the first visit is for the clip), only where analytics could ever send
    const want = show && this.profile.sessions >= 2 && !!meta && !!this.p.consent && !!(this.env.posthogKey || this.env.dev) && this.safe(() => this.p.consent!(), 'unset') === 'unset';
    if (!want) {
      this.consentUn?.();
      this.consentUn = null;
      this.appEl.classList.remove('has-consent');
      return;
    }
    // Round 2: the banner sits at the end of the Home screen's own scroll (in the flow), so it never covers the
    // "Past rooms" and "My cat" buttons; a remounted Home gets it again.
    const screens = this.layer.querySelectorAll<HTMLElement>('.bc-screen');
    const screen = screens[screens.length - 1] ?? this.appEl;
    if (this.consentUn && this.consentHost === screen && screen.isConnected) return;
    this.consentUn?.();
    this.consentHost = screen;
    if (screen === this.appEl) this.appEl.classList.add('has-consent');
    this.consentUn = meta!.consent(screen, {
      onChoice: (granted) => {
        this.safe(() => this.p.setConsent?.(granted), undefined);
        // the banner tucks itself away; drop the handle so it is not shown again this session
        const un = this.consentUn;
        this.consentUn = null;
        this.appEl.classList.remove('has-consent');
        setTimeout(() => un?.(), 400);
      },
    });
  }

  // ------------------------------------------------------------------------- wave 2: Room Maker

  /** My rooms (GDD 6.4): play, share (cleared only), remix, new. */
  private mountRooms(): () => void {
    const meta = this.sv.meta;
    const prog = this.sv.progress;
    if (!meta || !prog?.myRooms) return this.placeholder('My rooms', 'Rooms you build show up here.');
    return meta.myRooms(this.layer, {
      rooms: this.safe(() => prog.myRooms!(this.p.store), [] as MyRoom[]),
      thumb: (r) => {
        const room = this.decodeMyRoom(r);
        const shell = room ? this.sv.content.shells?.[room.shell] : undefined;
        return room && shell ? roomThumbSvg(room, shell) : null;
      },
      onPlay: (r) => {
        const room = this.decodeMyRoom(r);
        if (!room) return;
        this.ugc = { room, roomCode: r.code };
        this.router.send({ t: 'play', ugc: true });
      },
      onShare: (r) => {
        const room = this.decodeMyRoom(r);
        if (room) this.shareRoomLink(room, r.code, null);
      },
      onRemix: (r) => {
        const room = this.decodeMyRoom(r);
        if (!room) return;
        this.makerInitial = room;
        this.router.send({ t: 'open', screen: 'maker' });
      },
      onNew: () => {
        this.makerInitial = null;
        this.router.send({ t: 'open', screen: 'maker' });
      },
      ...(this.onlineFeatures.feed ? { onFeed: (r: MyRoom) => void this.postRoomToFeed(r) } : {}),
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  private makerInitial: RoomDef | null = null;

  private decodeMyRoom(r: MyRoom): RoomDef | null {
    const room = this.safe(() => this.sv.codec.decodeRoom?.(r.code) ?? null, null);
    if (!room) toast(this.layer, 'That room got scrambled. Build it again?');
    return room;
  }

  /** Native share of a room link (+ its card when there is one), else copy the link. Called inside the tap. */
  private shareRoomLink(room: RoomDef, code: string | undefined, card: Blob | null | undefined): void {
    const long = this.safe(() => this.sv.codec.buildLink({ ghosts: [], room, ...(code ? { roomCode: code } : {}) }, this.linkBase()), this.linkBase());
    const url = this.shortLinks.get(long) ?? long;
    this.warmShort(long, { kind: 'room', name: room.author || undefined });
    const text = `I built ${room.title || 'a room'} in Bad Cat Daily. Can your cat wreck it? ${url}`;
    const done = (method: string): void => this.track('bc_share_action', { artifact: 'room', method });
    const copy = (): void => {
      void copyText(text).then((ok) => {
        toast(this.layer, ok ? 'Room link copied' : 'Could not copy');
        if (ok) done('clipboard');
      });
    };
    if (card) {
      void this.sv
        .loadShare()
        .then((sh) => sh.shareImage?.(card, text, 'bad-cat-room.png'))
        .then((m) => {
          if (!m) copy();
          else if (m !== 'cancelled') done(m);
        })
        .catch(copy);
      return;
    }
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function' && this.env.isTouch) {
      nav
        .share({ title: 'Bad Cat Daily', text, url })
        .then(() => done('native_share'))
        .catch((e: { name?: string }) => {
          if (e?.name !== 'AbortError') copy();
        });
      return;
    }
    copy();
  }

  /**
   * The Room Maker (W2-EDITOR, lazy chunk). It owns its own renderer while open: the shell hands its WebGL
   * context over first (one context at a time). "Clear it" runs a real practice run of the draft through the
   * router (maker → briefing → run → maker); the maker's DOM is only hidden meanwhile.
   */
  private mountMaker(): () => void {
    const existing = this.maker;
    if (existing) {
      // back from the playtest run: hand the context back to the editor, then resolve its playtest
      existing.host.style.display = '';
      const settle = existing.playtest;
      existing.playtest = null;
      const res = this.playtestResult;
      this.playtestResult = null;
      void this.releaseRenderer().then(() => settle?.(res));
      return this.makerUnmount(existing);
    }
    const loadEditor = this.sv.loadEditor;
    if (!loadEditor) return this.placeholder('The Room Maker is almost ready', 'Building your own rooms opens soon.');
    const host = h('div', { class: 'bc-screen bc-maker-host' });
    this.layer.appendChild(host);
    const session: NonNullable<App['maker']> = { host, playtest: null };
    this.maker = session;
    // a remix link opens the maker on the linked room; My rooms passes its own
    const fromRoute = this.entry.kind === 'route' && this.entry.route === 'maker';
    const initial = this.makerInitial ?? (fromRoute ? this.link?.room : undefined) ?? undefined;
    this.makerInitial = null;
    // admin (no budget, every shell, Export JSON, skip the clear) only when asked for: ?admin=1 on a dev build, or
    // the founder's studio (round 3: every dev build opened in admin, so QA saw Export JSON and could skip step 5)
    const admin = (this.env.dev && rawLinkParams().get('admin') === '1') || !!this.link?.studio;
    void this.releaseRenderer()
      .then(() => loadEditor())
      .then((ed) => {
        if (this.maker !== session) return null;
        return ed.open(host, {
          render: this.sv.render,
          content: this.sv.content,
          codec: this.sv.codec,
          initial,
          author: this.safe(() => this.sv.codec.filterName(this.cat.name || '', 12), ''),
          cat: this.cat,
          speedBuild: this.link?.params?.speed === '1',
          admin,
          playtest: (room) =>
            new Promise<RunResult | null>((resolve) => {
              if (this.maker !== session) return resolve(null);
              session.playtest = resolve;
              this.ugc = { room };
              host.style.display = 'none';
              this.router.send({ t: 'playtest' });
            }),
          linkFor: (room) => this.safe(() => this.sv.codec.buildLink({ room, ghosts: [] }, this.linkBase()), this.linkBase()),
          track: (e, props) => this.track(e, props),
          onExit: () => undefined,
        });
      })
      .then((res) => {
        if (!res || this.maker !== session) return;
        this.onMakerDone(res);
      })
      .catch((err) => {
        if (this.env.dev) console.warn('[bad-cat ui] room maker failed', err);
        if (this.maker !== session) return;
        host.innerHTML = '';
        host.append(
          h('section', { class: 'bc-card bc-center' }, h('h2', {}, 'The Room Maker tripped over the cat'), h('p', { class: 'bc-muted' }, 'Try again in a moment.'), btn(COPY.back, () => this.router.send({ t: 'back' }), 'bc-cta')),
        );
      });
    return this.makerUnmount(session);
  }

  /** Result of the latest playtest run (set by onRunEnd before the router returns to the maker). */
  private playtestResult: RunResult | null = null;

  private makerUnmount(session: NonNullable<App['maker']>): () => void {
    return () => {
      // leaving for the playtest run: keep the editor alive, hidden
      if (session.playtest && this.maker === session) {
        session.host.style.display = 'none';
        return;
      }
      if (this.maker === session) this.maker = null;
      session.host.remove();
    };
  }

  /** Published: saved to My rooms, then shared (the editor resolves inside the Share/Done tap). */
  private onMakerDone(res: RoomMakerResult): void {
    const session = this.maker;
    if (res.kind === 'published' && res.room && res.code) {
      const room = res.room;
      this.safe(
        () =>
          this.sv.progress?.saveMyRoom?.(this.p.store, {
            code: res.code!,
            title: room.title || 'Untitled Room',
            author: room.author || '',
            cleared: true,
            at: Date.now(),
            ...(room.ancestors?.length ? { ancestors: room.ancestors } : {}),
            ...(res.buildMs !== undefined ? { buildMs: res.buildMs } : {}),
            // Phase 2: the playtest that cleared it, so the server can replay it before the room enters the feed
            ...(this.playtestResult?.inputs.length ? { clear: encodeInputs(this.playtestResult.inputs).map((x) => [x[0], x[1], x[2], x[3]] as [number, number, number, number]) } : {}),
          }),
        undefined,
      );
      this.warmRoomShort(room, res.code);
      this.ugc = { room, roomCode: res.code };
      this.shareRoomLink(room, res.code, res.card);
    }
    if (session) session.playtest = null;
    if (this.router.state.screen === 'maker') {
      this.router.send(res.kind === 'published' && this.sv.progress?.myRooms ? { t: 'open', screen: 'rooms' } : { t: 'back' });
    }
  }

  /** Settings rows beyond the toggles: cats, reminder, save code, home screen, Club account. */
  private settingsActions(): { label: string; sub?: string; onClick(): void }[] {
    const out: { label: string; sub?: string; onClick(): void }[] = [];
    if (this.sv.catMaker.manage) out.push({ label: 'Your cats', sub: this.entitlements().maxCats > 1 ? 'Up to 5 cats with Club' : undefined, onClick: () => this.router.send({ t: 'open', screen: 'cats' }) });
    if (this.sv.progress?.rapSheet) out.push({ label: 'Rap Sheet and season', onClick: () => this.router.send({ t: 'open', screen: 'rapsheet' }) });
    if (this.p.icsReminder)
      out.push({
        label: 'Daily reminder (calendar)',
        sub: 'A calendar file with a 9:00 reminder. Nothing is sent from us.',
        onClick: () => {
          try {
            const blob = this.p.icsReminder!(this.profile.prefs?.reminder ?? '09:00', this.linkBase());
            const a = h('a', { href: URL.createObjectURL(blob), download: 'bad-cat-daily.ics' });
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
              URL.revokeObjectURL(a.href);
              a.remove();
            }, 1000);
          } catch {
            toast(this.layer, 'Could not make the calendar file');
          }
        },
      });
    out.push({
      label: 'Copy my save code',
      sub: 'Move your streak, Rap Sheet and cats to another device.',
      onClick: () => {
        void exportSave(this.p.store)
          .then((code) => copyText(code))
          .then((ok) => toast(this.layer, ok ? 'Save code copied' : 'Could not copy'))
          .catch(() => toast(this.layer, 'Could not copy'));
      },
    });
    out.push({
      label: 'Load a save code',
      onClick: () => {
        const code = typeof window.prompt === 'function' ? window.prompt('Paste your save code') : null;
        if (!code) return;
        void importSave(this.p.store, code.trim())
          .then((ok) => {
            toast(this.layer, ok ? 'Save loaded. Restarting…' : 'That code did not work');
            if (ok) setTimeout(() => window.location.reload(), 900);
          })
          .catch(() => toast(this.layer, 'That code did not work'));
      },
    });
    if (this.clubOnline()) {
      out.push({ label: 'Restore purchases', sub: 'We email you a link.', onClick: () => this.router.send({ t: 'sheet', sheet: 'restore' }) });
      if (this.entitlements().club)
        out.push({
          label: 'Manage Club',
          onClick: () => {
            void this.sv.money
              ?.portal()
              .then((r) => {
                if (r.url) window.location.assign(r.url);
                else toast(this.layer, 'The portal is not available right now');
              })
              .catch(() => undefined);
          },
        });
    }
    return out;
  }

  /** Home extras: Club, shop and gifts only with the Club UI flag and a live server (FULL-PLAN 7.4). */
  private homeLinks(): { label: string; onClick(): void }[] {
    const out: { label: string; onClick(): void }[] = [];
    const sheet = (sheet: SheetKind): void => {
      this.sheetTrigger = 'home';
      this.router.send({ t: 'sheet', sheet });
    };
    if (this.entitlements().maxCats > 1) out.push({ label: 'Your cats', onClick: () => this.router.send({ t: 'open', screen: 'cats' }) });
    // wave 2 meta screens
    const meta = this.sv.meta;
    const prog = this.sv.progress;
    if (meta) {
      const week = this.weeklySummary();
      if (week && (week.crimes > 0 || week.ready)) {
        const fresh = week.ready && this.profile.lastSeenWeekly !== week.weekId;
        // a fresh card also gets the big gold button on home (weeklyReady)
        if (!fresh) out.push({ label: 'Your week', onClick: () => this.router.send({ t: 'open', screen: 'weekly' }) });
      }
      if (prog?.season) out.push({ label: 'Season track', onClick: () => this.router.send({ t: 'open', screen: 'season' }) });
      const friends = this.friendEntries().length;
      if (friends) out.push({ label: `Friends board (${friends})`, onClick: () => this.router.send({ t: 'open', screen: 'friends' }) });
      if (this.sv.loadEditor) {
        const mine = this.safe(() => prog?.myRooms?.(this.p.store).length ?? 0, 0);
        out.push(
          mine && prog?.myRooms
            ? { label: `My rooms (${mine})`, onClick: () => this.router.send({ t: 'open', screen: 'rooms' }) }
            : {
                label: '🛠️ Build a room',
                onClick: () => {
                  this.makerInitial = null;
                  this.router.send({ t: 'open', screen: 'maker' });
                },
              },
        );
      }
    }
    // Phase 2: the daily board and the room feed (server features)
    if (this.onlineFeatures.boards) out.push({ label: '🏆 Daily board', onClick: () => this.router.send({ t: 'open', screen: 'board' }) });
    if (this.onlineFeatures.feed) out.push({ label: '🧱 Room feed', onClick: () => this.router.send({ t: 'open', screen: 'feed' }) });
    // GDD 8 FTUE step 6: no money buttons in the first session or on the install day (members still get theirs).
    // "For brands" lives in Settings, never on Home.
    const firstDay = (this.profile.sessions | 0) < 2 || this.safe(() => sameLocalDay(this.profile.createdAt, Date.now()), false);
    if (this.clubOnline() && (!firstDay || this.entitlements().club)) {
      if (!this.entitlements().club && this.status?.checkout) out.push({ label: 'Chaos Club', onClick: () => sheet('club') });
      if (this.status?.checkout) out.push({ label: 'Shop', onClick: () => sheet('shop') });
      if (this.status?.gifts) out.push({ label: 'Gift a cat owner', onClick: () => sheet('gift') });
      if (this.status?.cameos) out.push({ label: 'Put my cat in the room', onClick: () => sheet('cameo') });
      // Club: the active cat is the weekly cameo and the fridge magnet (switch cats in "Your cats")
      if (this.entitlements().club && this.status?.cameos)
        out.push({
          label: `🧲 Fridge cat: ${this.cat.name || 'Tofu'}`,
          onClick: () => {
            this.syncClubCat();
            toast(this.layer, `${this.cat.name || 'Your cat'} is on the fridge wall this week.`);
          },
        });
    }
    return out;
  }


  // ------------------------------------------------------------------------------- Phase 2 online

  private onlineOn(): boolean {
    return !!this.sv.online?.enabled;
  }

  /** One GET /badcat/status (only online), then the live meter, Pink Paw, the session and the queue. */
  private bootOnline(): void {
    const on = this.sv.online;
    if (!on?.enabled) return;
    void on
      .features()
      .then((f) => {
        this.onlineFeatures = f;
        if (f.meter)
          void on.meter().then((m) => {
            if (m) this.treatLine = m.cents > 0 ? `${formatTreatMeter(m)} to Pink Paw shelter cats this month` : this.treatLine;
          });
        if (f.livePinkPaw) void on.pinkPaw().then((map) => map && setLivePinkPawStatus(map));
        if (f.accounts)
          on.onSession((sess) => {
            const was = this.onlineSession?.signedIn;
            this.onlineSession = sess;
            if (was !== sess?.signedIn && this.router.state.screen === 'settings') this.mount(this.router.state);
          });
        if (f.scores) void on.flushRanked().catch(() => undefined);
        // the home links (board, feed) appear once the server answered
        if ((f.boards || f.feed) && this.router.state.screen === 'home') this.mount(this.router.state);
      })
      .catch(() => undefined);
  }

  /** Settings → Online (only the rows whose server feature is on). */
  private onlineSettings(): import('../types').OnlineSettingsProps {
    const on = this.sv.online!;
    const f = this.onlineFeatures;
    const sess = this.onlineSession;
    const hour = this.safe(() => this.p.store.get<number>('pushHour', 9), 9);
    return {
      features: f,
      session: sess,
      ...(sess?.signedIn && f.accounts ? { account: on.account().catch(() => null) } : {}),
      ...(f.push
        ? {
            push: {
              state: on.push.state().catch(() => 'unsupported' as const),
              hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 9,
              onToggle: async (want: boolean, hr: number) => {
                this.safe(() => this.p.store.set('pushHour', hr), false);
                const ok = want ? await on.push.subscribe(hr) : await on.push.unsubscribe();
                this.track('bc_push', { on: want, ok });
                return ok;
              },
            },
          }
        : {}),
      onSignIn: () => {
        this.track('bc_account', { step: 'sign_in' });
        on.signIn(window.location.href);
      },
      onSignOut: () => {
        void on.signOut().then(() => toast(this.layer, 'Signed out. Your cat stays on this device.'));
      },
      onClaim: () => void this.claimPurchases(),
      ...(f.streakEmail ? { onStreakEmail: (want: boolean) => on.setStreakEmail(want) } : {}),
      ...(f.yourcat ? { onYourcat: () => void this.importYourcat() } : {}),
      ...(f.feed ? { onFeed: () => this.router.send({ t: 'open', screen: 'feed' }) } : {}),
      ...(f.creatorDashboard ? { onCreator: () => void this.showCreator() } : {}),
    };
  }

  /** "Claim my purchases": the verified account email's purchases become this device's entitlement token. */
  private async claimPurchases(): Promise<void> {
    const on = this.sv.online;
    const res = await on?.claimPurchases().catch(() => null);
    const money = this.sv.money as (GameServices['money'] & { adoptToken?(r: unknown): Entitlements | null }) | undefined;
    if (!res?.token) {
      toast(this.layer, 'Nothing to claim with this account yet.');
      return;
    }
    const ok = !!this.safe(() => money?.adoptToken?.(res) ?? null, null);
    toast(this.layer, ok ? (res.entitlements.club ? 'Chaos Club is on for this device 🎉' : 'Your purchases are on this device.') : 'Claimed. Restart the game to see them.');
    this.track('bc_account', { step: 'claim', club: !!res.entitlements.club });
  }

  /** "Import my cat from /yourcat": the /yourcat family coat on the active cat (shape, cosmetics and name stay). */
  private async importYourcat(): Promise<void> {
    const imp = await this.sv.online?.yourcat().catch(() => null);
    if (!imp) {
      toast(this.layer, 'No /yourcat cat on this account yet. Make one at tokentails.com/yourcat.', 3200);
      return;
    }
    const cat: CatSpec = { ...this.cat, ...imp.spec, ...(imp.name && !this.cat.name ? { name: this.safe(() => this.sv.codec.filterName(imp.name!, 12), '') } : {}) };
    this.cat = cat;
    const cats = [...this.profile.cats];
    cats[this.profile.active] = cat;
    this.profile = { ...this.profile, cats };
    this.safe(() => this.p.saveProfile(this.profile), false);
    this.syncClubCat();
    toast(this.layer, `${cat.name || 'Your cat'} got the ${imp.familyLabel} coat from /yourcat.`, 3000);
    this.track('bc_catmaker_done', { method: 'yourcat', face_decal: false, pattern: cat.pattern, ms: 0 });
  }

  /** Creator dashboard: the account's creator codes and what they earned (a small card). */
  private async showCreator(): Promise<void> {
    const dash = await this.sv.online?.creator().catch(() => null);
    if (!dash || !dash.rows.length) {
      toast(this.layer, 'No creator code on this account email yet. Ask for one in Settings.', 3200);
      return;
    }
    const money = (c: number): string => `$${(c / 100).toFixed(2)}`;
    const scrim = h('div', { class: 'bc-offer-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Creator dashboard' });
    const close = (): void => scrim.remove();
    scrim.appendChild(
      h(
        'section',
        { class: 'bc-card bc-offer-sheet bc-creator' },
        h('h2', {}, '📈 Your creator codes'),
        ...dash.rows.map((r) =>
          h('p', {}, h('strong', {}, r.code), ` · ${r.status} · ${r.purchases} purchases · ${money(r.grossCents)} gross · your share ${money(r.shareCents)}`),
        ),
        h('p', { class: 'bc-muted bc-small' }, `Paid out by hand once your share reaches ${money(dash.minPayoutCents)}. Fees are estimated.`),
        btn('Close', close, 'bc-cta'),
      ),
    );
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close();
    });
    this.layer.appendChild(scrim);
  }

  private mountBoard(): () => void {
    const meta = this.sv.meta;
    const on = this.sv.online;
    if (!meta?.board || !on || !this.onlineFeatures.boards) return this.placeholder('Daily board', 'The board opens soon.');
    const day = Math.max(1, this.todayNo);
    return meta.board(this.layer, {
      dayNo: day,
      todayNo: day,
      label: this.safe(() => this.sv.content.roomLabel?.(day) ?? kitchenLabel(day), kitchenLabel(day)),
      load: (d) => on.board(d),
      loadMe: (d) => on.boardMe(d),
      signedIn: !!this.onlineSession?.signedIn || !!this.onlineSession?.guest,
      localScore: (d) => this.safe(() => this.p.dayRecord(d)?.score, undefined),
      onSignIn: () => on.signIn(window.location.href),
      onPlay: (d) => this.router.send({ t: 'play', dayNo: d }),
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  private mountFeed(): () => void {
    const meta = this.sv.meta;
    const on = this.sv.online;
    if (!meta?.feed || !on || !this.onlineFeatures.feed) return this.placeholder('Room feed', 'Player rooms show up here soon.');
    return meta.feed(this.layer, {
      load: (sort, cursor) => on.feed(sort, cursor),
      thumb: (code, shellIdx) => {
        const room = this.safe(() => this.sv.codec.decodeRoom?.(code) ?? null, null);
        const shell = this.sv.content.shells?.[room?.shell ?? shellIdx];
        return room && shell ? roomThumbSvg(room, shell) : null;
      },
      onPlay: (fr: FeedRoom) => {
        const room = this.safe(() => this.sv.codec.decodeRoom?.(fr.code) ?? null, null);
        if (!room) {
          toast(this.layer, 'That room got away. Try another one.');
          return;
        }
        void on.playRoom(fr.id);
        this.ugc = { room, roomCode: fr.code };
        this.track('bc_room_maker', { step: 'feed_play', props: room.props.length, ms: 0 });
        this.router.send({ t: 'play', ugc: true });
      },
      onReport: (fr) => on.reportRoom(fr.id),
      onBuild: () => {
        this.makerInitial = null;
        this.router.send({ t: 'open', screen: 'maker' });
      },
      onBack: () => this.router.send({ t: 'back' }),
    });
  }

  /** My rooms → "Post to feed": the server checks the room and replays its clear run, then it waits for review. */
  private async postRoomToFeed(r: MyRoom): Promise<void> {
    const on = this.sv.online;
    if (!on || !r.clear?.length) return;
    const res = await on.publishRoom(r.code, r.clear, true).catch(() => null);
    if (!res) {
      toast(this.layer, 'The feed did not take it. Clear the room again in the Room Maker, then try again.', 3500);
      return;
    }
    this.safe(() => this.sv.progress?.markMyRoomFeed?.(this.p.store, r.code, res.id, res.feed), undefined);
    if (res.url) this.shortLinks.set(this.safe(() => this.sv.codec.buildLink({ ghosts: [], room: this.decodeMyRoom(r)!, roomCode: r.code }, this.linkBase()), ''), res.url);
    toast(this.layer, res.status === 'approved' ? 'Posted! Your room is in the feed.' : 'Posted! It shows in the feed after a quick look.', 3000);
    this.track('bc_room_maker', { step: 'feed', props: 0, ms: 0 });
    if (this.router.state.screen === 'rooms') this.mount(this.router.state);
  }

  /** A server short link for a long game link, made ahead of the tap (the next share uses it). */
  private warmShort(long: string, meta: { kind: 'dare' | 'room' | 'cat' | 'day' | 'other'; name?: string; score?: number; dayNo?: number }): void {
    const on = this.sv.online;
    if (!on || !this.onlineFeatures.shortLinks || !long || this.shortLinks.has(long)) return;
    void on
      .shorten(long, meta)
      .then((short) => {
        if (short && short !== long) this.shortLinks.set(long, short);
      })
      .catch(() => undefined);
  }

  private warmRoomShort(room: RoomDef, code: string): void {
    const long = this.safe(() => this.sv.codec.buildLink({ ghosts: [], room, roomCode: code }, this.linkBase()), '');
    if (long) this.warmShort(long, { kind: 'room', name: room.author || undefined });
  }

  /** PERFECT CRIME: one sponsored treat on the existing guest treat page (never a new spend path). */
  private openTreat(): void {
    const url = treatUrl();
    if (!url) return;
    this.track('bc_treat_click', { day_no: this.resultPlay?.dayNo ?? this.todayNo });
    try {
      const w = window.open(url, '_blank');
      if (w) w.opener = null;
      else window.location.href = url;
    } catch {
      /* blocked */
    }
  }

  // ------------------------------------------------------------------------------------------ run

  private startRun(): () => void {
    const play = this.play;
    const plan = this.router.state.plan;
    if (!play || !plan) {
      queueMicrotask(() => this.router.send({ t: 'quit' }));
      return () => undefined;
    }
    const input = this.ensureInput();
    const practice = plan.mode === 'practice';
    this.safe(() => this.audio.setRoom?.(play), undefined);
    this.dareNote = undefined;
    this.streakNote = undefined;
    if (practice) this.practiceIndex++;
    // a restart re-arms the wish bubble
    if (this.accomplice?.granted) {
      this.accomplice = { ...this.accomplice, granted: false };
      this.safe(() => this.renderer?.setAccomplice?.(this.accomplice), undefined);
    }
    const hud = createHud(this.stage, {
      play,
      // the first-ever run coaches too when a dare skipped the 40 s first heist
      ftue: plan.mode === 'ftue' || (this.router.state.ftue && !this.router.state.ftueDone),
      touch: this.env.isTouch,
      practice,
      onPause: () => this.session?.pause('pause'),
      onResume: () => this.session?.resume(),
      onQuit: () => this.quitRun(),
      onRestart: () => this.restartRun(),
      locate: (i) => this.safe(() => this.renderer?.projectProp?.(i) ?? null, null),
      ...(this.accomplice?.name ? { accompliceName: this.accomplice.name } : {}),
    });
    this.hud = hud;
    let session: RunSession;
    try {
      session = new RunSession({
        sim: this.sv.sim,
        play,
        cat: this.playCat,
        input,
        audio: this.audio,
        renderer: this.renderer,
        hud,
        vibrate: (ms) => this.safe(() => this.p.vibrate(ms), undefined),
        swatTarget,
        ghosts: this.ghostsFor(play),
        intro: !this.profile.settings.reduceMotion && !this.qaScript,
        repeat: (this.profile.sessions | 0) > 1,
        onFirstCrash: (tick) => this.track('bc_first_crash', { ms_from_start: Math.round((tick * 1000) / 30) }),
        onEvents: (evs) => {
          // desktop side panel: strike wrecked targets through
          if (this.sides) for (const e of evs) if (e.t === 'target') this.sides.hit(this.targetSlot(play, (e as { prop?: number }).prop));
          // the accomplice's wish came true: her bubble turns into a heart (render)
          if (this.accomplice && !this.accomplice.granted && evs.some((e) => e.t === 'wish')) {
            this.accomplice = { ...this.accomplice, granted: true };
            this.safe(() => this.renderer?.setAccomplice?.(this.accomplice), undefined);
          }
        },
        onEnd: (r) => this.onRunEnd(r, play),
        onRenderError: (err) => {
          if (this.env.dev) console.warn('[bad-cat ui] renderer.frame failed', err);
        },
      });
    } catch (err) {
      if (this.env.dev) console.warn('[bad-cat ui] sim failed to start', err);
      hud.dispose();
      this.hud = null;
      queueMicrotask(() => this.router.send({ t: 'quit' }));
      return () => undefined;
    }
    this.session = session;
    input.setHandlers({
      onPause: () => (session.paused ? session.resume() : session.pause('pause')),
      onRestart: () => {
        if (practice) this.restartRun();
      },
    });
    if (this.qaScript) {
      session.setScript(this.qaScript);
      this.qaScript = null;
    }
    this.runT0 = performance.now();
    this.safe(() => this.audio.setMusic(this.profile.settings.audio), undefined);
    session.start();
    this.track('bc_run_start', {
      ranked: plan.mode === 'ranked',
      ftue: plan.mode === 'ftue',
      practice_index: practice ? this.practiceIndex : 0,
      cat_source:
        this.runCatSource === 'pinkpaw' || this.runCatSource === 'guest_star'
          ? this.runCatSource
          : this.runCat
            ? 'manual'
            : this.face
              ? 'photo'
              : this.cat === DEFAULT_CAT || this.cat.name === 'Tofu'
                ? 'default'
                : 'manual',
      ...(plan.household ? { household: true } : {}),
      ...(plan.studio ? { studio: true } : {}),
    });
    return () => undefined; // endSession() tears down when the route leaves 'run'
  }

  /** Index of a prop among the room's Must-Wreck targets (briefing order), -1 when it is not one. */
  private targetSlot(play: PlayableRoom, prop: number | undefined): number {
    if (prop === undefined) return -1;
    let k = 0;
    for (let i = 0; i < play.room.props.length; i++) {
      if (!play.room.props[i].target) continue;
      if (i === prop) return k;
      k++;
    }
    return -1;
  }

  private endSession(): void {
    this.safe(() => this.renderer?.setGhosts?.([]), undefined);
    this.session?.dispose();
    this.session = null;
    this.hud?.dispose();
    this.hud = null;
    this.input?.setHandlers({});
    this.safe(() => this.audio.setMusic(false), undefined);
  }

  private quitRun(): void {
    const s = this.session?.s;
    if (s)
      this.track('bc_run_end', {
        score: s.score,
        stamp: 'none',
        combo_max: s.maxCombo,
        targets: s.targetsHit,
        seen: s.seenCount,
        caught_tick: s.caughtTick,
        duration_ms: Math.round(performance.now() - this.runT0),
        quit: true,
      });
    this.router.send({ t: 'quit' });
  }

  private restartRun(): void {
    if (this.router.state.screen !== 'run') return;
    this.endSession();
    this.unmount = this.startRun();
  }

  private onRunEnd(r: RunResult, play: PlayableRoom): void {
    if (this.router.state.screen !== 'run') return;
    // Room Maker "clear it" run: no records, no XP, no clip; the maker reads the targets
    if (this.router.state.plan?.playtest) {
      this.playtestResult = r;
      this.track('bc_run_end', { score: r.score, stamp: r.stamp, targets: r.targets, duration_ms: Math.round(performance.now() - this.runT0), quit: false, playtest: true });
      const waiters = this.qaWaiters;
      this.qaWaiters = [];
      for (const w of waiters) w(r);
      this.router.send({ t: 'ended' });
      return;
    }
    // Household: the second cat's run of the same room goes back to the share screen as pass B of the clip
    if (this.router.state.plan?.household && this.household) {
      this.track('bc_run_end', { score: r.score, stamp: r.stamp, targets: r.targets, duration_ms: Math.round(performance.now() - this.runT0), quit: false, household: true });
      void this.onHouseholdRun(r).finally(() => {
        const waiters = this.qaWaiters;
        this.qaWaiters = [];
        for (const w of waiters) w(r);
        this.router.send({ t: 'ended' });
      });
      return;
    }
    this.newStamps = [];
    this.xpNote = undefined;
    this.dareExtra = [];
    // Grab the last live frame before the clip pass takes the canvas over (result backdrop), and the best crash.
    this.backdropUrl = this.safe(() => this.renderer?.snapshot?.('image/jpeg', 0.7) ?? null, null);
    this.bestFrame = this.session?.bestFrame ?? null;
    if (play.mode === 'ftue' || this.router.state.ftue) this.p.store.set('ftueDone', true);
    this.rankedSave = null;
    if (play.mode === 'ranked' && play.dayNo !== undefined) {
      this.safe(() => this.p.saveDayRecord(play.dayNo!, { score: r.score, stamp: r.stamp, rank: r.rank, shared: false }), false);
      // Phase 2: the one score route replays the run on the server (queued when offline or signed out)
      if (this.onlineFeatures.scores && this.sv.online && r.mode === 'ranked' && !this.router.state.plan?.studio && this.runCatSource !== 'household' && this.runCatSource !== 'studio')
        this.rankedSave = this.sv.online
          .submitRanked(r, { name: this.playCat.name || undefined, catCode: this.safe(() => this.sv.codec.encodeCat(this.playCat), undefined) })
          .catch(() => ({ status: 'queued' }) as RankedSaveOutcome);
      const prog = this.sv.progress;
      if (prog) {
        const fpw = this.entitlements().freezesPerWeek;
        const before = this.safe(() => prog.streakDetail?.(this.p.store, play.dayNo!, { freezesPerWeek: fpw }) ?? null, null);
        const streak = this.safe(() => prog.recordRankedDay(this.p.store, play.dayNo!, { freezesPerWeek: fpw }), null);
        const after = this.safe(() => prog.streakDetail?.(this.p.store, play.dayNo!, { freezesPerWeek: fpw }) ?? null, null);
        if (streak) {
          const freezeUsed = !!(before && after && after.freezesLeft < before.freezesLeft);
          this.track('bc_streak', { length: streak.current, freeze_used: freezeUsed });
          if (streak.current > 1) this.streakNote = `🔥 ${streak.current}-day streak${freezeUsed ? ' (a Nine Lives saved it)' : ''}`;
        }
        const fresh = this.safe(() => prog.recordCrimes?.(this.p.store, r.events, play.room.props.map((p) => p.kind), play.dayNo) ?? [], [] as string[]);
        const total = this.safe(() => prog.rapSheet?.(this.p.store, { club: this.entitlements().club }).distinct ?? 0, 0);
        for (const id of fresh) {
          const d = this.safe(() => crimeDef(id), undefined);
          this.newStamps.push({ icon: d?.icon ?? '🐾', name: d?.name ?? id });
          this.track('bc_rapsheet_new', { crime_id: id, total });
        }
      }
    }
    // Season XP for every finished run (ranked once a day; practice and FTUE capped by progress).
    const prog = this.sv.progress;
    if (prog?.addRunXp) {
      const club = this.entitlements().club;
      const v0 = this.safe(() => prog.season?.(this.p.store, new Date(), { club }) ?? null, null);
      const v1 = this.safe(() => prog.addRunXp!(this.p.store, r, { ranked: play.mode === 'ranked', dayNo: play.dayNo ?? this.todayNo, now: new Date(), club }), null);
      if (v1 && v1.tier > (v0?.tier ?? 0)) this.streakNote = [this.streakNote, `⭐ Season tier ${v1.tier}`].filter(Boolean).join(' · ');
      this.xpNote = xpLine(v0, v1, v1?.tiers.length || 30);
    }
    const ghosts = this.ghostsFor(play);
    if (ghosts.length) {
      // GDD 6.3: one line per ghost (g and g2); replay-only ghosts (older rules) are watched, never beaten
      const label = this.shortLabel(play) ?? roomLabel(play.room.id === 'glass', play.dayNo, play.room.title);
      const outs = dareOutcomes(r.score, ghosts.map((g) => ({ ref: g, score: this.ghostScore(play, g) })), label);
      for (const o of outs) if (!o.replayOnly) this.track('bc_dare_result', { beat: !!o.beat, margin: o.margin ?? 0, ghosts: ghosts.length });
      this.dareNote = outs[0]?.line;
      this.dareExtra = outs.slice(1).map((o) => o.line);
      this.saveFriends(play, ghosts);
    }
    this.track('bc_run_end', {
      score: r.score,
      stamp: r.stamp,
      combo_max: r.maxCombo,
      targets: r.targets,
      seen: r.seenCount,
      caught_tick: this.session?.s.caughtTick ?? -1,
      duration_ms: Math.round(performance.now() - this.runT0),
      quit: false,
    });
    this.safe(() => this.audio.stinger(r.stamp === 'perfect' ? 'perfect' : r.stamp === 'caught' ? 'caught' : 'stamp'), undefined);
    this.result = r;
    this.resultPlay = play;
    this.household = null;
    this.clip = this.makeClipJob(r, play, this.playCat);
    if (this.router.state.plan?.studio) this.studioStep('practiced');
    const waiters = this.qaWaiters;
    this.qaWaiters = [];
    for (const w of waiters) w(r);
    this.router.send({ t: 'ended' });
  }

  /** Friends board (local): the dare ghosts received for this room, with their scores. */
  private saveFriends(play: PlayableRoom, ghosts: readonly GhostRef[]): void {
    const save = this.sv.progress?.saveFriend;
    if (!save) return;
    const raw = rawLinkParams();
    ghosts.forEach((g, i) => {
      const payload = raw.get(i === 0 ? 'g' : 'g2');
      if (!payload) return;
      this.safe(
        () =>
          save(this.p.store, {
            roomId: play.room.id,
            ghost: payload,
            catCode: this.sv.codec.encodeCat(g.cat),
            name: g.name || g.cat.name || 'Friend',
            score: this.ghostScore(play, g),
            at: Date.now(),
            simVersion: g.simVersion ?? SIM_VERSION,
          }),
        undefined,
      );
    });
  }

  // ------------------------------------------------------------------------------ result + share

  /**
   * The clip of a run, rendered behind the result screen. `who` picks the opener photo and face crop: the player's
   * own cat ('mine'), the studio cat (its screenshot), or a cat without a photo here (Pink Paw, guest star).
   */
  private makeClipJob(r: RunResult, play: PlayableRoom, cat: CatSpec = this.cat, who: 'mine' | 'studio' | 'other' = this.clipOwner()): ClipJob {
    const studio = who === 'studio' ? this.studioItemOptions() : null;
    const face = who === 'mine' ? this.face : who === 'studio' ? this.studioFace : null;
    return new ClipJob({
      loadShare: () => this.sv.loadShare(),
      render: this.sv.render,
      renderer: this.renderer,
      play,
      cat,
      result: r,
      audio: this.audio,
      faceCrop: face?.crop ?? null,
      // Club caption style and the "Add music to clips" setting (W2-META settings); studio: stitch/reply + @handle
      options: {
        ...(this.entitlements().club && (this.profile.prefs?.captionStyle ?? 0) > 0 ? { captionStyle: this.profile.prefs!.captionStyle } : {}),
        ...(this.profile.prefs?.clipMusic === true ? { music: true } : {}),
        ...(studio ?? {}),
        // the live renderer goes back to the cat that played (with its face) after a household pass
        restore: { cats: [cat], ...(face ? { faces: new Map([[0, face]]) } : {}) },
      },
      opener: async () => {
        if (who === 'studio') return this.studioOpener ?? undefined;
        if (who !== 'mine' || !this.profile.settings.showPhotoInClips) return undefined;
        const o = await this.sv.catMaker.loadOpener(this.profile.active).catch(() => null);
        return o?.media;
      },
      onDone: (res, plan) => {
        this.track('bc_clip_export', {
          ok: !!res.blob && !res.error,
          encoder: res.encoder,
          codec: res.blob?.type || res.mime || '',
          audio: res.audio,
          ms: Math.round(res.ms),
          bytes: res.blob?.size ?? 0,
          error_code: res.error ?? '',
          crime_pick: plan?.pick ?? 'default',
        });
        if (who === 'studio') this.studioStep(res.blob && !res.error ? 'rendered' : 'render_failed', res.error);
      },
    });
  }

  /** Whose clip the current run makes. */
  private clipOwner(): 'mine' | 'studio' | 'other' {
    if (this.runCatSource === 'studio') return 'studio';
    return this.runCat ? 'other' : 'mine';
  }

  private mountResult(): () => void {
    const r = this.result;
    const play = this.resultPlay;
    if (!r || !play) {
      queueMicrotask(() => this.router.send({ t: 'back' }));
      return () => undefined;
    }
    const plan = this.router.state.plan;
    this.prepareShortDare(r, play);
    // round 3: a 0-chaos run that was not caught has nothing to clip (the cuddle still makes one)
    const clippable = r.score > 0 || r.stamp === 'caught';
    const handle = mountResult(this.layer, {
      result: r,
      label: roomLabel(!!plan?.glass, play.dayNo, play.room.title),
      timeline: r.timeline || '🐾',
      dareNote: this.dareNote,
      dareLines: this.dareExtra,
      bestNote: this.streakNote,
      paws: this.parPawsFor(r, play),
      newStamps: this.newStamps,
      xpLine: this.xpNote,
      wish: this.wishView(r, play),
      onDare: r.mode !== 'ftue' ? () => this.shareDare(r, play) : undefined,
      reduceMotion: this.profile.settings.reduceMotion,
      onStamp: () => this.safe(() => this.audio.stinger('stamp'), undefined),
      onShare: clippable
        ? () => {
            if (this.clip?.state.status === 'error') void this.clip.start();
            this.router.send({ t: 'toShare' });
          }
        : undefined,
      // review round 1: a 0-chaos run still gets a share (the "try again" line with the room link)
      onShareLine: clippable ? undefined : () => this.shareNapLine(play),
      onPlayAgain: () => this.router.send({ t: 'playAgain' }),
      onHome: () => this.router.send({ t: 'back' }),
      ...(treatUrl() ? { onTreat: () => this.openTreat() } : {}),
    });
    // Phase 2: the ranked save's line ("#12 on today's board") once the server has replayed the run
    const save = r.mode === 'ranked' ? this.rankedSave : null;
    if (save)
      void save.then((o) => {
        const line = rankedLine(o);
        if (line) handle.setOnline?.(line, this.onlineFeatures.boards && (o.status === 'saved' || o.status === 'already') ? () => this.router.send({ t: 'open', screen: 'board' }) : undefined);
        if (o.status === 'signed_out' && this.onlineFeatures.accounts) handle.setOnline?.('Sign in to put this run on the daily board. It waits here.', undefined);
      });
    const off = this.clip?.subscribe((v) => handle.setClip(v));
    // Render the clip behind the result screen (after the count-up so the stamp animation stays smooth).
    const t = clippable ? setTimeout(() => void this.clip?.start(), this.env.qa ? 0 : 400) : 0;
    return () => {
      clearTimeout(t);
      off?.();
      handle.dispose();
    };
  }

  /** Par paws (GDD 8) when the room has a par (dailies with recorded runs); undefined otherwise. */
  private parPawsFor(r: RunResult, play: PlayableRoom): 0 | 1 | 2 | 3 | undefined {
    if (play.dayNo === undefined || !play.room.id.startsWith('daily-') || r.mode === 'ftue') return undefined;
    const par = this.safe(() => this.sv.content.dailyEntry?.(play.dayNo!)?.par, undefined);
    if (!par || !this.sv.progress?.parPaws) return undefined;
    return this.safe(() => this.sv.progress!.parPaws!(r.score, par), undefined);
  }

  /** Today's accomplice on the result screen: wish granted or not, and the adopt link (GDD 3.4). */
  private wishView(r: RunResult, play: PlayableRoom): { name: string; granted: boolean; onAdopt?(): void } | undefined {
    const a = play.room.accomplice;
    if (!a) return undefined;
    const cat = this.accompliceCat(play);
    if (!cat) return undefined;
    const granted = !!r.wish || r.events.some((e) => e.t === 'wish');
    const url = cat.adoptUrl ?? this.safe(() => pinkPawAdoptUrl(cat), '');
    return {
      name: cat.name,
      granted,
      onAdopt: url
        ? () => {
            this.track('bc_pinkpaw_adopt_click', { cat_id: cat.id });
            try {
              const w = window.open(url, '_blank');
              if (w) w.opener = null;
              else window.location.href = url;
            } catch {
              /* blocked */
            }
          }
        : undefined,
    };
  }

  private mountShare(s: RouterState): () => void {
    const r = this.result;
    const play = this.resultPlay;
    const job = this.clip;
    this.track('bc_share_open', { trigger: this.router.state.plan?.household ? 'auto' : 'button' });
    const inApp = this.env.inApp !== 'none';
    if (inApp) this.track('bc_inapp_handoff', { step: 'shown', purpose: 'clip' });
    const link = this.dailyLink(play);
    const handle = mountShare(this.layer, {
      inApp,
      showPhoto: this.profile.settings.showPhotoInClips,
      hasOpener: !!this.face,
      onTogglePhoto: (on) => {
        this.profile = { ...this.profile, settings: { ...this.profile.settings, showPhotoInClips: on } };
        this.safe(() => this.p.saveProfile(this.profile), false);
        if (job && job.state.status !== 'rendering') {
          job.state = { ...job.state, status: 'idle' };
          void job.start();
        }
      },
      onPost: () => {
        if (this.shareFormat === 'carousel') {
          this.postCarousel(handle.toast);
          return;
        }
        const blob = job?.state.blob;
        if (!blob || !job?.share) return;
        const tpl = this.shareTemplates.find((t) => t.format === this.shareFormat);
        const text = tpl && this.shareFormat !== 'pov' ? tpl.caption : shareText(this.cat.name, !!s.plan?.glass, play?.dayNo, link, this.shortLabel(play));
        const format = this.shareFormat;
        const studio = !!s.plan?.studio;
        // Called synchronously inside the tap (fresh gesture for navigator.share on iOS).
        job.share
          .shareClip(blob, text)
          .then((method) => {
            if (method === 'cancelled') return;
            if (studio) this.studioStep('saved');
            this.track('bc_share_action', { artifact: tpl?.artifact ?? (format === 'stitch' || format === 'reply' ? 'reply_video' : 'clip'), format, method });
            this.track('bc_clip_saved', {
              in_app_browser: this.env.inApp,
              method,
              ...(this.profile.sessions <= 1 ? { link_to_clip_ms: Math.round(performance.now() - this.bootT) } : {}),
            });
            this.markShared(play);
            if (method === 'download') handle.toast(COPY.savedToast);
            // 'long_press': shareClip already shows the clip to long-press; the screen shows it inline too
          })
          .catch(() => handle.toast('Sharing failed. Try again.'));
      },
      onRetry: () => void job?.start(),
      onCopyHandoff: async () => {
        const handoff = this.handoffLink(r, play);
        const ok = job?.share ? await job.share.copyHandoffLink(handoff).catch(() => false) : await copyText(handoff);
        if (ok) this.track('bc_inapp_handoff', { step: 'link_copied', purpose: 'clip' });
        return ok;
      },
      onCopyChat: async () => {
        if (!r) return false;
        if (!play) return false;
        // per-room title and icon (round 3: every room copied "Kitchen 🍳")
        const text = chatCard(r, play, { shortUrl: this.env.shortUrl, link: link.replace(/^https?:\/\//, '') });
        const ok = await copyText(text);
        if (ok) {
          this.track('bc_share_action', { artifact: 'emoji_chat', method: 'clipboard' });
          this.markShared(play);
        }
        return ok;
      },
      onPracticeAgain: () => this.router.send({ t: 'playAgain' }),
      // after the first heist "again" opens today's ranked run: say so
      againLabel: s.plan && this.safe(() => planFor(this.router.ctx, { dayNo: s.plan!.dayNo, glass: s.plan!.glass }, false).mode, 'practice') === 'ranked' ? COPY.playRanked : COPY.practiceAgain,
      onDare: r && r.mode !== 'ftue' && play ? () => this.shareDare(r, play) : undefined,
      onCard: r && play ? () => this.shareCard(handle.toast) : undefined,
      onDone: () => this.router.send({ t: 'shareDone' }),
      onFormat: (f) => void this.pickFormat(f, handle),
      extras: this.shareExtras(play),
      more: r && play ? this.shareMore(r, play, (t) => handle.toast(t)) : undefined,
      music: {
        on: job?.options.music === true,
        onToggle: (on) => {
          this.profile = { ...this.profile, prefs: { ...(this.profile.prefs ?? {}), clipMusic: on } };
          this.safe(() => this.p.saveProfile(this.profile), false);
          void job?.setOptions({ music: on });
        },
      },
      handoff: inApp ? this.handoffCopy() : undefined,
      onIntent: () => this.track('bc_inapp_handoff', { step: 'intent_opened', purpose: 'clip' }),
    });
    this.shareFormat = (job?.options.format as ShareFormat | undefined) ?? 'pov';
    this.shareTemplates = [];
    this.carouselSlides = null;
    // "Post as..." templates and the Android intent:// handoff come with the lazy share module
    if (r && play)
      void this.sv
        .loadShare()
        .then((sh) => {
          const tpls = this.safe(() => sh.formats?.(this.formatContext(r, play)) ?? [], [] as FormatTemplate[]);
          this.shareTemplates = tpls;
          handle.setFormats?.(tpls.map((t) => ({ format: t.format, label: t.label, available: t.available, reason: t.reason })), this.shareFormat);
          if (inApp) handle.setIntent?.(this.safe(() => sh.androidIntent?.(this.handoffLink(r, play)) ?? null, null));
        })
        .catch(() => undefined);
    // Pre-render the result card so its share call stays inside the tap (fresh gesture).
    this.cardBlob = null;
    if (r && play) {
      void Promise.all([this.sv.loadShare(), this.cardArt(play)])
        .then(async ([sh, art]) => {
          this.shareMod = sh;
          try {
            // the card shows the run's biggest crash (else the room) and the cat's own render or photo (GDD 7.4)
            return await sh.renderResultCard?.({ run: r, play, cat: this.playCat, link: link.replace(/^https?:\/\//, ''), freeze: art.freeze, photo: art.photo, catArt: art.catArt });
          } finally {
            art.release();
          }
        })
        .then((b) => {
          this.cardBlob = b ?? null;
        })
        .catch(() => undefined);
    }
    handle.setPoster(this.backdropUrl);
    const off = job?.subscribe((v) => {
      handle.setClip(v);
      if (v.status === 'ready' && job.state.blob && this.shareFormat !== 'carousel') handle.showInline(job.state.blob);
    });
    if (!job) handle.setClip({ status: 'unavailable', progress: 0 });
    else if (job.state.status === 'idle') void job.start();
    return () => {
      off?.();
      handle.dispose();
    };
  }

  private cardBlob: Blob | null = null;

  /**
   * Pictures for the result and story cards (round 2: a beige placeholder and a generic cat): the run's best crash,
   * else the last live frame, else a still of the room; the player's own cat rendered on its plinth (with its face
   * decal); the real photo only when the player allows photos in clips.
   */
  private async cardArt(play: PlayableRoom): Promise<{ freeze: ImageBitmap | null; photo: ImageBitmap | null; catArt: HTMLCanvasElement | null; release(): void }> {
    const bitmap = (b: Blob | null | undefined): Promise<ImageBitmap | null> =>
      b && typeof createImageBitmap !== 'undefined' ? createImageBitmap(b).catch(() => null) : Promise.resolve(null);
    const fromUrl = async (url: string | null): Promise<ImageBitmap | null> => {
      if (!url) return null;
      try {
        return await bitmap(await (await fetch(url)).blob());
      } catch {
        return null;
      }
    };
    let freeze = await (this.bestFrame ?? Promise.resolve(null)).then(bitmap).catch(() => null);
    if (!freeze) freeze = await fromUrl(this.backdropUrl);
    if (!freeze && this.sv.render.renderRoomStill) freeze = await this.sv.render.renderRoomStill(play, { w: 1080, h: 900 }).then(bitmap).catch(() => null);
    const facePhoto = this.profile.settings.showPhotoInClips ? this.face?.texture : null;
    const photo = await bitmap(facePhoto as Blob | null | undefined);
    const decal = this.runCat ? null : await bitmap(this.face?.texture);
    const catArt = await (this.sv.render.renderCatPortrait?.(this.playCat, decal, { w: 360, h: 360, pose: 'plinth' }) ?? Promise.resolve(null)).catch(() => null);
    decal?.close?.();
    return {
      freeze,
      photo,
      catArt,
      release: () => {
        freeze?.close?.();
        photo?.close?.();
      },
    };
  }
  private shareMod: import('../types').ShareApi | null = null;

  /** FormatContext for the "Post as..." templates of this run. */
  private formatContext(r: RunResult, play: PlayableRoom): import('../types').FormatContext {
    const acc = this.accomplice ?? this.accompliceView(play, false);
    const pp = acc ? this.accompliceCat(play) : null;
    return {
      run: r,
      play,
      cat: this.cat,
      dayLabel: this.shortLabel(play) ?? roomLabel(play.room.id === 'glass', play.dayNo, play.room.title),
      shortUrl: this.env.shortUrl,
      club: this.entitlements().club,
      streak: this.safe(() => this.sv.progress?.streakStatus?.(this.p.store, this.todayNo).current ?? 0, 0),
      hasPhoto: !!this.face,
      // household (Club, up to 5 cats): "Play Luna too" records the second cat's run of this room
      hasSecondCat: secondCatIndex(this.profile.cats, this.profile.active) >= 0 && r.mode !== 'ftue' && !this.router.state.plan?.studio,
      ...(secondCatIndex(this.profile.cats, this.profile.active) >= 0 ? { secondName: this.profile.cats[secondCatIndex(this.profile.cats, this.profile.active)].name || 'your other cat' } : {}),
      ...(this.studioHandle ? { handle: this.studioHandle } : {}),
      ...(pp ? { pinkPaw: { name: pp.name, waiting: livePinkPawStatus(pp) !== 'ADOPTED', ...(pp.adoptUrl ? { adoptUrl: pp.adoptUrl } : {}) } } : {}),
    };
  }

  /**
   * A "Post as..." chip: the clip in that format. The chip already picked does nothing; a format rendered before comes
   * from the clip cache; stitch / reply ask for the @handle inline (in-app browsers block window.prompt); the
   * carousel shows its first slide in the preview instead of the last format's clip.
   */
  private async pickFormat(f: ShareFormat, ui: ShareHandle): Promise<void> {
    const say = ui.toast;
    const job = this.clip;
    const tpl = this.shareTemplates.find((t) => t.format === f);
    if (!job || !tpl?.available) return;
    if (f === this.shareFormat && f !== 'stitch' && f !== 'reply') return;
    let overlay: string | undefined;
    if (tpl.needsHandle) {
      const ask = ui.askText
        ? ui.askText(f === 'stitch' ? 'Whose cat video are you stitching? (@handle)' : 'Whose comment are you replying to? (@handle)', {
            placeholder: '@handle',
            initial: this.studioHandle ? `@${this.studioHandle}` : '',
          })
        : Promise.resolve(typeof window.prompt === 'function' ? window.prompt('Whose clip are you replying to? (@handle)') : null);
      const raw = await ask;
      if (raw === null) return;
      const handle = raw.trim().replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, 30);
      if (!handle) {
        say('That one needs an @handle');
        return;
      }
      if (f === this.shareFormat && handle === this.studioHandle) return;
      this.studioHandle = handle;
      overlay = handle;
    }
    if (f === 'household' && !this.household?.second) {
      // the household clip needs the second cat's run of this room first
      const idx = secondCatIndex(this.profile.cats, this.profile.active);
      say(`Play ${this.profile.cats[idx]?.name || 'your other cat'} too: same room, then the clip`);
      this.startHousehold();
      return;
    }
    this.shareFormat = f;
    this.track('bc_share_action', { artifact: tpl.artifact, format: f, method: 'format_pick' });
    // round 3: the chip said "Replying to @user…" after a handle was typed: re-label the chips with it
    if (overlay && this.result && this.resultPlay) {
      const r = this.result;
      const play = this.resultPlay;
      void this.sv
        .loadShare()
        .then((sh) => {
          const tpls = this.safe(() => sh.formats?.(this.formatContext(r, play)) ?? [], [] as FormatTemplate[]);
          if (!tpls.length) return;
          this.shareTemplates = tpls;
          ui.setFormats?.(tpls.map((t) => ({ format: t.format, label: t.label, available: t.available, reason: t.reason })), this.shareFormat);
        })
        .catch(() => undefined);
    }
    if (f === 'carousel') {
      void this.carouselPreview().then((slide) => {
        if (slide && this.shareFormat === 'carousel') ui.showInline(slide);
      });
      say('Carousel: tap Post to share the slides');
      return;
    }
    const pp = this.shareTemplates.length && this.resultPlay ? this.formatContext(this.result!, this.resultPlay).pinkPaw : undefined;
    const hh = f === 'household' ? this.household?.second : undefined;
    const changed = await job.setOptions({ format: f, overlay, adopted: f === 'still_waiting' && pp ? !pp.waiting : undefined, ...(hh ? { second: hh } : {}) });
    // back from the carousel to a format already rendered: put its clip back in the preview
    if (!changed && job.state.status === 'ready' && job.state.blob) ui.showInline(job.state.blob);
  }

  private carouselSlides: Promise<Blob[]> | null = null;

  /** The carousel's first slide (the cat photo, "Rate how bad … 1–10"), drawn once per share screen. */
  private carouselPreview(): Promise<Blob | null> {
    const sh = this.shareMod ?? this.clip?.share;
    const card = this.cardBlob;
    if (!sh?.renderCarousel || !card) return Promise.resolve(card);
    if (!this.carouselSlides) {
      const photo = this.profile.settings.showPhotoInClips ? this.face?.texture ?? null : null;
      this.carouselSlides = sh.renderCarousel({ cards: [card], photo, shortUrl: this.env.shortUrl }).catch(() => [] as Blob[]);
    }
    return this.carouselSlides.then((slides) => slides[0] ?? card);
  }

  /** Carousel post (TikTok photo mode / IG): the photo, the result card, the Rap Sheet card, "Your cat next?". */
  private postCarousel(say: (t: string) => void): void {
    const card = this.cardBlob;
    const sh = this.shareMod ?? this.clip?.share;
    if (!card || !sh?.renderCarousel || !sh.shareFiles) {
      say('The cards are still drawing. Try again in a second.');
      return;
    }
    const tpl = this.shareTemplates.find((t) => t.format === 'carousel');
    const photo = this.profile.settings.showPhotoInClips ? this.face?.texture ?? null : null;
    void sh
      .renderCarousel({ cards: [card], photo, shortUrl: this.env.shortUrl })
      .then((slides) => (slides.length ? sh.shareFiles!(slides, tpl?.caption ?? '', 'bad-cat-carousel') : 'cancelled'))
      .then((method) => {
        if (method !== 'cancelled') {
          this.track('bc_share_action', { artifact: 'card', format: 'carousel', method });
          this.markShared(this.resultPlay);
        }
      })
      .catch(() => say('Sharing failed. Try again.'));
  }

  /** Share-screen extras for a player room: remix it, or hide-and-report it (GDD 6.4, 6.7). */
  private shareExtras(play: PlayableRoom | null): { label: string; onClick(): void }[] {
    const out: { label: string; onClick(): void }[] = [];
    const ugc = this.ugcTarget(play);
    if (!ugc?.room) return out;
    if (this.sv.loadEditor && ugc.room.shell !== undefined)
      out.push({
        label: '🛠️ Remix this room',
        onClick: () => {
          this.makerInitial = ugc.room!;
          this.router.send({ t: 'back' });
          this.router.send({ t: 'open', screen: 'maker' });
        },
      });
    const own = this.safe(() => this.sv.progress?.myRooms?.(this.p.store).some((m) => m.code === ugc.roomCode) ?? false, false);
    if (!own && ugc.roomCode)
      out.push({
        label: 'Hide and report this room',
        onClick: () => {
          // GDD 6.7: hidden on this device at once; the report carries only the payload hash
          const hash = this.payloadHash(ugc.roomCode);
          if (hash) {
            hidePayload(this.p.store, hash);
            this.track('ugc_reported', { payload_hash: hash, kind: 'room' });
          }
          this.ugc = null;
          toast(this.layer, 'Hidden. Thanks, we will take a look.');
          this.router.send({ t: 'shareDone' });
        },
      });
    return out;
  }

  /** "More ways to brag" on the share screen (GDD 7.4, 7.5): cards, links, hide-and-report for a dare ghost. */
  private shareMore(r: RunResult, play: PlayableRoom, say: (t: string) => void): { label: string; onClick(): void }[] {
    const out: { label: string; onClick(): void }[] = [];
    const ent = this.entitlements();
    const link = this.dailyLink(play).replace(/^https?:\/\//, '');
    out.push({ label: '📱 Story card', onClick: () => void this.shareStory(r, play, say) });
    if (this.sv.progress?.rapSheet) out.push({ label: '🗂️ Rap Sheet mugshot', onClick: () => this.shareRapCard(null) });
    out.push({ label: '🐱 Cat card', onClick: () => void this.shareCatCard('cat', say) });
    const cameo = ent.club || ent.skus.includes('cameo') || ent.skus.includes('guest_star');
    if (cameo) out.push({ label: '⭐ Cameo card', onClick: () => void this.shareCatCard('cameo', say) });
    // draw them now so the tap shares inside its gesture (iOS); the cat card first, it is the one most people tap
    setTimeout(() => {
      void this.prepareCatCard('cat').then(() => (cameo ? this.prepareCatCard('cameo') : null));
    }, 1500);
    const ugc = this.ugcTarget(play);
    if (ugc?.room) out.push({ label: '🔗 Room link', onClick: () => this.shareRoomLink(ugc.room!, ugc.roomCode, null) });
    // a ghost that came in a link can be hidden and reported (GDD 6.7)
    const raw = rawLinkParams();
    this.ghostsFor(play).forEach((g, i) => {
      const payload = raw.get(i === 0 ? 'g' : 'g2');
      if (!payload) return;
      out.push({
        label: `🙈 Hide and report ${g.name || g.cat.name || 'this'} ghost`,
        onClick: () => {
          const hash = this.payloadHash(payload);
          if (hash) {
            hidePayload(this.p.store, hash);
            this.track('ugc_reported', { payload_hash: hash, kind: 'ghost' });
          }
          this.dareGhosts = this.dareGhosts.filter((x) => x !== g);
          this.safe(() => this.sv.progress?.hideFriend?.(this.p.store, play.room.id, payload), undefined);
          say('Hidden on this device. Thanks for the report.');
        },
      });
    });
    void link;
    return out;
  }

  /** 1080 x 1920 story card of this run (GDD 7.4). */
  private async shareStory(r: RunResult, play: PlayableRoom, say: (t: string) => void): Promise<void> {
    try {
      const sh = this.shareMod ?? (await this.sv.loadShare());
      const link = this.dailyLink(play).replace(/^https?:\/\//, '');
      const art = await this.cardArt(play);
      const blob = await sh.renderResultCard?.({ run: r, play, cat: this.playCat, link, format: 'story', freeze: art.freeze, photo: art.photo, catArt: art.catArt }).finally(() => art.release());
      if (!blob || !sh.shareImage) return say('The card could not be drawn here.');
      const m = await sh.shareImage(blob, shareText(this.cat.name, play.room.id === 'glass', play.dayNo, this.dailyLink(play), this.shortLabel(play)), 'bad-cat-story.png');
      if (m !== 'cancelled') this.track('bc_share_action', { artifact: 'story', method: m });
    } catch {
      say('Sharing failed. Try again.');
    }
  }

  /** The player's cat link without the scheme (cat card, cameo card, mugshot). */
  private catLinkShort(): string {
    return this.safe(() => this.sv.codec.buildLink({ ghosts: [], catCode: this.sv.codec.encodeCat(this.cat) }, this.linkBase()), this.linkBase()).replace(/^https?:\/\//, '');
  }

  /** Cat and cameo card blobs drawn ahead of the tap (keyed by kind + cat), like the result card's cardBlob. */
  private catCards = new Map<string, { blob: Blob | null; ready: Promise<Blob | null> }>();

  /**
   * Round 3 (iOS): share({ files }) needs the tap's user gesture, and a WebGL portrait plus a canvas card in between
   * used it up (the card downloaded instead). Draw the card when the share screen opens; the tap only shares.
   */
  private prepareCatCard(kind: 'cat' | 'cameo'): Promise<Blob | null> {
    const key = `${kind}:${JSON.stringify(this.cat)}:${this.entitlements().club ? 1 : 0}`;
    const have = this.catCards.get(key);
    if (have) return have.ready;
    const entry: { blob: Blob | null; ready: Promise<Blob | null> } = { blob: null, ready: Promise.resolve(null) };
    entry.ready = (async (): Promise<Blob | null> => {
      try {
        const sh = this.shareMod ?? (await this.sv.loadShare());
        if (!sh.renderCard) return null;
        const tex = this.face?.texture;
        const bmp = tex && typeof createImageBitmap !== 'undefined' ? await createImageBitmap(tex).catch(() => null) : null;
        const portrait = await (this.sv.render.renderCatPortrait?.(this.cat, bmp, { w: 720, h: 900, pose: 'plinth' }) ?? Promise.resolve(null)).catch(() => null);
        bmp?.close?.();
        const catLink = this.catLinkShort();
        const club = this.entitlements().club;
        const blob =
          kind === 'cat'
            ? await sh.renderCard({ kind: 'cat', cat: this.cat, portrait, link: catLink })
            : await sh.renderCard({ kind: 'cameo', cat: this.cat, portrait, dayLabel: this.sv.content.roomLabel?.(this.todayNo) ?? kitchenLabel(this.todayNo), where: club ? 'fridge' : 'window', link: catLink });
        entry.blob = blob ?? null;
        return entry.blob;
      } catch {
        return null;
      }
    })();
    for (const k of [...this.catCards.keys()]) if (k.startsWith(`${kind}:`)) this.catCards.delete(k);
    this.catCards.set(key, entry);
    return entry.ready;
  }

  /** Cat card (plinth portrait) or cameo card of the player's cat. */
  private async shareCatCard(kind: 'cat' | 'cameo', say: (t: string) => void): Promise<void> {
    try {
      const key = `${kind}:${JSON.stringify(this.cat)}:${this.entitlements().club ? 1 : 0}`;
      const sh = this.shareMod ?? (await this.sv.loadShare());
      if (!sh.renderCard || !sh.shareImage) return say('The card could not be drawn here.');
      // ready before the tap: share at once (inside the gesture); otherwise draw it now (desktop / slow phones)
      const blob = this.catCards.get(key)?.blob ?? (await this.prepareCatCard(kind));
      if (!blob) return say('The card could not be drawn here.');
      const catLink = this.catLinkShort();
      const text = kind === 'cat' ? `Meet ${this.cat.name || 'my cat'}, a very bad cat. ${catLink} #badcatdaily` : `${this.cat.name || 'My cat'} is in Bad Cat Daily rooms this week. ${catLink} #badcatdaily`;
      const m = await sh.shareImage(blob, text, `bad-cat-${kind}.png`);
      if (m !== 'cancelled') this.track('bc_share_action', { artifact: kind, method: m });
    } catch {
      say('Sharing failed. Try again.');
    }
  }

  /** In-app browser steps (GDD 7.3): iOS has no intent, so the steps are spelled out. */
  private handoffCopy(): { title: string; steps: string[] } {
    const app = this.env.inApp === 'tiktok' ? 'TikTok' : this.env.inApp === 'instagram' ? 'Instagram' : 'this app';
    if (this.env.isAndroid)
      return { title: 'Save your clip in Chrome', steps: ['Tap “Open in Chrome” below (or ⋮ → Open in Chrome)', 'Your run travels in the link: the clip renders there'] };
    return {
      title: `${app} cannot save clips: open Safari`,
      steps: ['Tap “Copy link” below', `Tap ••• in ${app}, then “Open in browser” (or paste the link in Safari)`, 'Your run travels in the link: the clip renders there'],
    };
  }

  private shareCard(say: (t: string) => void): void {
    const blob = this.cardBlob;
    const share = this.shareMod ?? this.clip?.share;
    if (!blob || !share?.shareImage) {
      say('The card is still drawing. Try again in a second.');
      return;
    }
    const play = this.resultPlay;
    const text = shareText(this.cat.name, play?.room.id === 'glass', play?.dayNo, this.dailyLink(play), this.shortLabel(play));
    share
      .shareImage(blob, text, `bad-cat-card-${play?.room.id === 'glass' ? 'glass' : isShareableDay(play?.dayNo) ? play!.dayNo : 'preview'}.png`)
      .then((method) => {
        if (method === 'cancelled') return;
        this.track('bc_share_action', { artifact: 'card', method });
        this.markShared(play);
      })
      .catch(() => say('Sharing failed. Try again.'));
  }

  /** Dare link with this run as the ghost; a received ghost rides along as g2 so dares chain (GDD 6.3). */
  private dareLink(r: RunResult, play: PlayableRoom): string {
    if (this.shortDare && this.shortDare.run === r) return this.shortDare.url;
    return this.safe(() => this.sv.codec.buildLink(this.dareState(r, play), this.linkBase()), this.dailyLink(play));
  }

  private dareState(r: RunResult, play: PlayableRoom): LinkState {
    const ghosts: GhostRef[] = [{ inputs: r.inputs, cat: this.playCat, name: this.playCat.name }];
    const prev = this.ghostsFor(play)[0];
    if (prev) ghosts.push(prev);
    const glass = play.room.id === 'glass';
    const ugc = this.ugcTarget(play);
    if (ugc) return { ghosts, via: this.entry.via, ...ugc };
    return { ghosts, via: this.entry.via, ...(glass ? { glass: true } : { dayNo: play.dayNo ?? this.todayNo }) };
  }

  /** Deflated dare link, built ahead of the tap (the share sheet must open inside the gesture). */
  private shortDare: { run: RunResult; url: string } | null = null;
  private prepareShortDare(r: RunResult, play: PlayableRoom): void {
    if (this.shortDare?.run === r || play.mode === 'ftue') return;
    const build = this.sv.codec.buildLinkAsync;
    if (!build) return;
    let st: LinkState;
    try {
      st = this.dareState(r, play);
    } catch {
      return;
    }
    build(st, this.linkBase())
      .then((url) => {
        const sync = this.safe(() => this.sv.codec.buildLink(st, this.linkBase()), '');
        if (url && (!sync || url.length < sync.length)) this.shortDare = { run: r, url };
        // Phase 2: a server short link with its own OG card ("Mochi scored 8,420. Your cat can't.")
        const long = this.shortDare?.run === r ? this.shortDare.url : sync || url;
        if (long && this.onlineFeatures.shortLinks && this.sv.online)
          void this.sv.online
            .shorten(long, { kind: 'dare', name: this.playCat.name || undefined, score: r.score, ...(play.dayNo !== undefined ? { dayNo: play.dayNo } : {}), catCode: this.safe(() => this.sv.codec.encodeCat(this.playCat), undefined) })
            .then((short) => {
              if (short !== long && this.result === r) this.shortDare = { run: r, url: short };
            })
            .catch(() => undefined);
      })
      .catch(() => undefined);
  }

  /** Called inside the tap: native share sheet with the link, else copy it. */
  /** 0 chaos: "Mochi napped through Kitchen #18. Can your cat do worse?" with the room link. */
  private shareNapLine(play: PlayableRoom): void {
    const label = roomLabel(play.room.id === 'glass', play.dayNo, play.room.title);
    const text = `${this.cat.name || 'My cat'} napped through ${label}: 0 chaos. Can your cat do worse?`;
    this.shareTextLink(text, this.dailyLink(play), 'card', 'Link copied. Send it to a friend');
  }

  private shareDare(r: RunResult, play: PlayableRoom): void {
    const url = this.dareLink(r, play);
    const label = roomLabel(play.room.id === 'glass', play.dayNo, play.room.title);
    const text = `${this.cat.name || 'My cat'} scored ${formatScore(r.score)} on ${label}. Can your cat beat that?`;
    this.shareTextLink(text, url, 'dare', COPY.dareCopied);
  }

  /** Native share on touch, else copy "text url" (one toast). */
  private shareTextLink(text: string, url: string, artifact: 'dare' | 'card', copiedToast: string): void {
    const done = (method: string): void => {
      this.track('bc_share_action', { artifact, method });
    };
    const copy = (): void => {
      void copyText(`${text} ${url}`).then((ok) => {
        toast(this.layer, ok ? copiedToast : 'Could not copy');
        if (ok) done('clipboard');
      });
    };
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function' && this.env.isTouch) {
      nav
        .share({ title: 'Bad Cat Daily', text, url })
        .then(() => done('native_share'))
        .catch((e: { name?: string }) => {
          if (e?.name !== 'AbortError') copy();
        });
      return;
    }
    copy();
  }

  private handoffLink(r: RunResult | null, play: PlayableRoom | null): string {
    const glass = play?.room.id === 'glass';
    // A player room carries its room code, so the replay is keyed to (and re-simulated in) that room.
    const ugc = this.ugcTarget(play);
    const st: LinkState = {
      ghosts: [],
      clip: true,
      via: this.entry.via,
      ...(play?.mode === 'ftue' && !ugc ? { ftue: true } : {}),
      ...(ugc ? ugc : glass ? { glass: true } : { dayNo: play?.dayNo ?? this.todayNo }),
      ...(r ? { replay: { inputs: r.inputs, cat: this.playCat, name: this.playCat.name } } : {}),
    };
    return this.safe(() => this.sv.codec.buildLink(st, this.linkBase()), this.dailyLink(play));
  }

  private markShared(play: PlayableRoom | null): void {
    if (!play || play.mode !== 'ranked' || play.dayNo === undefined) return;
    const rec = this.safe(() => this.p.dayRecord(play.dayNo!), null);
    if (rec && !rec.shared) this.safe(() => this.p.saveDayRecord(play.dayNo!, { ...rec, shared: true }), false);
  }

  // ------------------------------------------------------------------------- household clip (M2)

  /** "Play Luna too": keep this run as pass A and record the second cat's run of the same room. */
  private startHousehold(): void {
    const r = this.result;
    const play = this.resultPlay;
    const idx = secondCatIndex(this.profile.cats, this.profile.active);
    if (!r || !play || idx < 0) return;
    this.household = { result: r, play, second: null, secondIdx: idx };
    this.router.send({ t: 'household' });
  }

  /** The second run is in: reload the first cat for pass A, then render the household clip. */
  private async onHouseholdRun(r: RunResult): Promise<void> {
    const hh = this.household;
    if (!hh) return;
    const idx = hh.secondIdx;
    const cat = this.profile.cats[idx] ?? this.playCat;
    const [face, opener] = await Promise.all([
      this.sv.catMaker.loadFace(idx).catch(() => null),
      this.profile.settings.showPhotoInClips ? this.sv.catMaker.loadOpener(idx).catch(() => null) : Promise.resolve(null),
    ]);
    hh.second = { cat, run: r, ...(opener?.media ? { opener: opener.media } : {}), faceCrop: face?.crop ?? null };
    this.result = hh.result;
    this.resultPlay = hh.play;
    this.runCat = null;
    this.runCatSource = 'mine';
    const mine = new Map<number, FaceDecal>();
    if (this.face) mine.set(0, this.face);
    try {
      await this.renderer?.load(hh.play, [this.cat], mine);
    } catch {
      /* the export reloads it anyway */
    }
    this.shareFormat = 'household';
    await this.clip?.setOptions({ format: 'household', second: hh.second, ...(face ? { secondFaces: new Map([[0, face]]) } : {}) });
  }

  // ------------------------------------------------------------------------- studio (?studio=1, GDD 6.2)

  private studioOpener: Blob | null = null;
  private studioMod: typeof import('../share') | null = null;

  private studioStep(type: 'practiced' | 'rendered' | 'render_failed' | 'saved', error?: string): void {
    const st = this.studio;
    const m = this.studioMod;
    if (!st || !m || st.item === null) return;
    const a =
      type === 'practiced'
        ? { type, runId: String(Date.now()) }
        : type === 'rendered'
          ? { type, clipId: String(Date.now()) }
          : type === 'render_failed'
            ? { type, error: error ?? 'clip failed' }
            : { type };
    st.state = m.studioReducer(st.state, a as import('../share').StudioAction<null>);
  }

  /** Clip options of the studio item in work: stitch / reply with its @handle pill. */
  private studioItemOptions(): { format: ShareFormat; overlay?: string } | null {
    const st = this.studio;
    const it = st && st.item !== null ? st.state.items[st.item] : null;
    if (!it) return this.studioHandle ? { format: 'stitch', overlay: this.studioHandle.replace(/^@+/, '') } : null;
    const handle = (it.handle || this.studioHandle || '').replace(/^@+/, '');
    return { format: it.format, ...(handle ? { overlay: handle } : {}) };
  }

  private mountStudioScreen(): () => void {
    let alive = true;
    let handle: StudioHandle | null = null;
    let cmHost: HTMLElement | null = null;
    const label = (): string => (this.studio?.glass ? COPY.glassLabel : this.sv.content.roomLabel?.(this.todayNo) ?? kitchenLabel(this.todayNo));
    const draw = (): void => {
      handle?.dispose();
      const st = this.studio;
      const m = this.studioMod;
      if (!alive || !st || !m) return;
      const cur = m.studioCurrent(st.state);
      const pr = m.studioProgress(st.state);
      handle = mountStudio(this.layer, {
        rows: st.state.items.map((it, i) => ({
          label: `${it.handle ? `@${it.handle.replace(/^@+/, '')}` : 'no handle'} · ${it.name || 'unnamed'}`,
          sub: `${it.format} · ${it.saved ? 'saved' : it.skipped ? 'skipped' : it.step}${it.error ? ` · ${it.error}` : ''}`,
          state: it.saved ? 'saved' : it.skipped ? 'skipped' : cur && i === st.state.current ? 'current' : 'todo',
        })),
        progress: `${pr.saved} saved · ${pr.skipped} skipped · ${pr.total} in the queue`,
        batch: st.state.batch,
        roomLabel: label(),
        onNext: () => void next(),
        onSkip: () => {
          st.state = m.studioReducer(st.state, { type: 'skip' });
          draw();
        },
        onAddList: (text) => {
          const items = m.parseStudioBatch(text).map((x) => ({ ...x, photo: null }));
          st.state = m.studioReducer(st.state, { type: 'add', items });
          draw();
        },
        onBatch: (on) => {
          st.state = m.studioReducer(st.state, { type: 'set_batch', batch: on });
        },
        onToggleRoom: () => {
          st.glass = !st.glass;
          draw();
        },
        onBack: () => this.router.send({ t: 'back' }),
      });
    };
    const next = async (): Promise<void> => {
      const st = this.studio;
      const m = this.studioMod;
      if (!st || !m || cmHost) return;
      if (!m.studioCurrent(st.state)) st.state = m.studioReducer(st.state, { type: 'add', items: [{ photo: null }] });
      st.item = st.state.current;
      const it = m.studioCurrent(st.state)!;
      handle?.dispose();
      handle = null;
      cmHost = h('div', { class: 'bc-screen bc-catmaker-host' });
      this.layer.appendChild(cmHost);
      try {
        // studio mode: the screenshot of their video, the @handle and a name; memory only (no cat slot is touched)
        const res = await this.sv.catMaker.open(cmHost, {
          initial: { ...DEFAULT_CAT, name: it.name || '' },
          fromLink: false,
          render: this.sv.render,
          studio: true,
          catIndex: -1,
        });
        if (!alive) return;
        this.studioCat = { ...res.spec, name: this.safe(() => this.sv.codec.filterName(res.spec.name, 12), res.spec.name) || 'Kitty' };
        this.studioFace = res.face ?? null;
        this.studioOpener = res.opener?.media ?? null;
        if (res.handle) this.studioHandle = res.handle.replace(/^@+/, '');
        st.state = m.studioReducer(st.state, { type: 'crop', crop: res.face?.crop ?? { x: 0, y: 0, w: 1, h: 1 } });
        st.state = m.studioReducer(st.state, { type: 'name', name: this.studioCat.name, ...(res.handle ? { handle: res.handle } : {}) });
        cmHost.remove();
        cmHost = null;
        this.router.send({ t: 'studioPlay', ...(st.glass ? { glass: true } : { dayNo: this.todayNo }) });
      } catch {
        cmHost?.remove();
        cmHost = null;
        draw();
      }
    };
    if (this.studio && this.studioMod) draw();
    else
      void import('../share')
        .then((m) => {
          this.studioMod = m;
          this.studio = { state: m.createStudio<null>([], true), glass: false, item: null };
          draw();
        })
        .catch(() => {
          if (alive) this.unmount = this.placeholder('Studio', 'The studio could not load here.');
        });
    return () => {
      alive = false;
      handle?.dispose();
      cmHost?.remove();
    };
  }

  // ------------------------------------------------------------------------------------------- QA

  private installQa(): void {
    const hook: QaHook = {
      screen: () => this.router.state.screen,
      state: () => this.session?.s ?? null,
      play: (inputs) =>
        new Promise<RunResult>((resolve, reject) => {
          const scr = this.router.state.screen;
          if (scr === 'run' && this.session) {
            this.qaWaiters.push(resolve);
            this.session.setScript(inputs);
            return;
          }
          if (scr === 'briefing') {
            this.qaWaiters.push(resolve);
            this.qaScript = inputs;
            const go = (): void => {
              if (!this.router.send({ t: 'start' })) setTimeout(go, 50);
            };
            go();
            return;
          }
          // Not in a run: headless replay on the current (or today's) room.
          try {
            const plan = this.router.state.plan ?? { glass: false, dayNo: this.todayNo, mode: 'practice' as const };
            const play = this.play ?? this.sv.content.resolve(this.roomFor(plan), plan.mode, plan.dayNo);
            resolve(this.sv.sim.runToEnd(play, this.cat, inputs));
          } catch (err) {
            reject(err);
          }
        }),
    };
    hook.goto = (screen, opts = {}) => {
      if (screen === 'briefing' || screen === 'run') {
        const sel = opts.glass ? { glass: true } : { dayNo: opts.dayNo ?? this.todayNo };
        const plan: RunPlan = opts.mode ? { glass: !!opts.glass, dayNo: opts.glass ? undefined : sel.dayNo, mode: opts.mode } : planFor(this.router.ctx, sel, false);
        this.router.jump({ screen: 'briefing', plan, ftue: false, offerShown: this.router.state.offerShown });
        return;
      }
      const ok = ['home', 'picker', 'archive', 'settings', 'rapsheet', 'season', 'friends', 'weekly', 'rooms', 'studio', 'cats', 'catmaker', 'maker', 'board', 'feed'];
      if (!ok.includes(screen)) throw new Error(`qa.goto: unknown screen ${screen}`);
      const same = this.router.state.screen === screen;
      this.router.jump({ screen: screen as RouterState['screen'], back: 'home', ftue: false });
      if (same) this.mount(this.router.state);
    };
    hook.setDay = (n) => {
      this.todayNo = n | 0;
      this.router.ctx.todayNo = this.todayNo;
      // remount the current screen with the new day (the router only remounts on a screen or plan change)
      if (this.router.state.screen !== 'run') this.mount(this.router.state);
    };
    hook.services = () => this.sv;
    hook.router = () => this.router.state;
    hook.events = () => this.analyticsLog.slice();
    hook.scoring = (maxTries = 600, minTargets = 0) => {
      const plan = this.router.state.plan ?? { glass: false, dayNo: this.todayNo, mode: 'practice' as const };
      const play = this.sv.content.resolve(this.roomFor(plan), plan.mode, plan.dayNo);
      let seed = 0x5eed1234;
      const rnd = (n: number): number => {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        seed >>>= 0;
        return (seed >>> 8) % n;
      };
      // segments (dir, ticks, jump) → inputs; random restarts first, then a hill climb on the best (targets first)
      type Seg = [number, number, number];
      const toInputs = (segs: Seg[]): TickInput[] => {
        const inputs: TickInput[] = [];
        for (const [dir, n, jump] of segs) for (let t = 0; t < n && inputs.length < 2400; t++) inputs.push({ dir: dir as TickInput['dir'], speed: 2, buttons: t === 0 ? jump : t % 6 === 0 ? 1 : 0 });
        return inputs;
      };
      const randomSeg = (): Seg => [1 + rnd(8), 10 + rnd(40), rnd(10) < 3 ? 2 : 0];
      const randomSegs = (): Seg[] => {
        const segs: Seg[] = [];
        let n = 0;
        while (n < 2400) {
          const sg = randomSeg();
          segs.push(sg);
          n += sg[1];
        }
        return segs;
      };
      const fit = (r: RunResult): number => r.targets * 100000 + r.score - (r.stamp === 'caught' ? 50000 : 0);
      let best: { segs: Seg[]; f: number; r: RunResult } | null = null;
      let fallback: TickInput[] | null = null;
      for (let k = 0; k < maxTries; k++) {
        let segs: Seg[];
        if (best && minTargets > 0 && k > maxTries / 4) {
          segs = best.segs.map((x) => [...x] as Seg);
          for (let m = 1 + rnd(3); m > 0; m--) segs[rnd(segs.length)] = randomSeg();
        } else segs = randomSegs();
        const inputs = toInputs(segs);
        const r = this.sv.sim.runToEnd(play, this.playCat, inputs);
        if (r.score > 0 && r.stamp !== 'caught' && r.targets >= minTargets) return inputs;
        if (r.score > 0 && !fallback && r.targets >= minTargets) fallback = inputs;
        const f = fit(r);
        if (!best || f >= best.f) best = { segs, f, r };
      }
      return fallback;
    };
    window.__BADCAT_QA__ = hook;
  }
}
