/**
 * App shell: screen state machine + game loop that wires sim, renderer, UI, input, audio and yard.
 *
 *   Title -> Cat pick -> Level select -> (loading) -> Heist <-> Pause -> Results -> Retry | Next level | Heists | Menu
 *   Title -> Cat Yard -> Back | "Take on heist" (starts a run with that cat)
 *
 * The sim runs at a fixed 30 Hz inside `HeistSession.advance`; the renderer draws every animation
 * frame with the interpolation alpha. Per-tick side effects (renderer.observe, UI events, audio) go
 * through `onTick` so no tick's events are lost when a slow frame runs several ticks.
 */
import { NO_INPUT, SIM_VERSION, SUBTILE, TICK_HZ, type AssetManifest, type Input, type LevelDef, type SimState } from '../types';
import { createRenderer, type GameRenderer } from '../render';
import type { QualityTier } from '../render/quality';
import { clearVoxelCache } from '../render/voxel/sheets';
import { createUI, createInput, type InputController, type UI, type UIOptions } from '../ui';
import { createAudio, type HeistAudio } from '../audio';
import { heistVolumesFor, type HostAudioSettings } from '../embed';
import { createYard, type YardAPI } from '../yard';
import { getLevel, getLevels, getSolution, nextLevelId } from '../levels';
import { createLevelSelect, decorateResults, getRescueCatCached, levelName, loadRescueCats, ProgressStore, rescueHudChip, withRescueName, type LevelSelect, type RescueCat } from '../ui/levels';
import { runStars } from '../ui/levels/progress';
import type { InputLog } from '../sim';
import { HeistSession } from './session';
import { sentryWarnings } from '../sim/telegraph';
import { mapperFor, type ControlScheme } from './controls';
import { QA_BUILD } from './qa-build';
import { prefersReducedMotion } from '../ui/dom';
import type { HeistAnalytics, HeistEventName, HeistEventProperties } from '../analytics';
import { FtueStore } from '../onboarding/ftue-store';
import { briefFor } from '../onboarding/brief';
import { buildRoute, pickLeg, routeGeometry, stageIndex, type RouteLeg } from '../onboarding/route';
import { RouteHintTracker, type RouteTrigger } from '../onboarding/hint-tracker';
import { REWIND_OFFER_MS, REWIND_OFFER_TICKS, RewindFunnel, canRewind, rewindTarget } from '../onboarding/rewind';
import { GhostPaws } from '../onboarding/ghost-paws';

/** Tiles from the active cat within which a sentry's turn warning is audible. */
const SENTRY_EARSHOT = 10;

export type AppScreen = 'boot' | 'title' | 'pick' | 'levels' | 'loading' | 'heist' | 'pause' | 'results' | 'yard';

export interface AppOptions {
  root: HTMLElement;
  manifest: AssetManifest;
  base: string;
  levelId?: string;
  seed?: number;
  controls?: ControlScheme;
  /** Replay playback speed multiplier. */
  replaySpeed?: number;
  /** Renderer shadows (off makes SwiftShader/CI much faster). */
  shadows?: boolean;
  /** Embedded in the `/heist` host page: the UI's exit and sign-in buttons (src/embed). */
  embed?: UIOptions['embed'];
  /**
   * A played (not watched) run reached the Results screen. The embed forwards it to the host, which
   * saves won runs through POST /user/catbassadors/live with the log as the replay.
   */
  onRunComplete?(run: CompletedRun): void;
  /**
   * Product analytics (F9), created by main.ts behind the replay/verify build gate. Absent (replay
   * and verify builds, tests) means the first-run funnel sends nothing.
   */
  analytics?: Promise<HeistAnalytics | null>;
  /** First-run memory (brief cards seen). Default: localStorage. */
  ftue?: FtueStore;
}

/** A finished play-mode run, as handed to `AppOptions.onRunComplete`. */
export interface CompletedRun {
  won: boolean;
  levelId: string;
  log: InputLog;
  /** Stars this run earned (bitmask). */
  stars: number;
}

export interface AppStats {
  screen: AppScreen;
  calls: number;
  triangles: number;
  fps: number;
  tick: number;
  /** Heist renderer quality tier (null before the first heist) and whether the auto probe is done. */
  quality: { tier: QualityTier; settled: boolean } | null;
  /** Heist renderer frames drawn so far (0 before the first heist). */
  frame: number;
}

const LAST_REPLAY_KEY = 'catnip-heist.lastReplay';
/** Seconds between the WIN tick and the Results screen (lets the win animation play). */
const RESULTS_DELAY = 1.6;
/**
 * Behind the pause modal the frozen scene only shows idle animation under a blurred panel: redraw
 * it at about 10 fps instead of every display frame, once the start probe is done. Those redraws
 * are passed to the renderer as throttled, so the quality governor (which keeps watching after the
 * probe) does not read them as a slow GPU and drop the tier.
 */
const PAUSED_FRAME_MS = 100;

export class App {
  readonly ui: UI;
  readonly input: InputController;
  readonly audio: HeistAudio;
  private readonly opts: AppOptions;
  private readonly gameLayer: HTMLElement;
  private readonly yardLayer: HTMLElement;
  private renderer: GameRenderer | null = null;
  private yard: YardAPI | null = null;
  private session: HeistSession | null = null;
  /** Sentry warnings (guard * 100003 + turn tick) already announced by the telegraph tick sound. */
  private sentryWarned = new Set<number>();
  private level: LevelDef | null = null;
  /**
   * The run's real shelter cat (Pink Paw) and a UI-only copy of the level whose crate carries its
   * name: for the HUD, toasts, brief and results. The sim, session, replay and progress keep `level`.
   */
  private rescueCat: RescueCat | null = null;
  private uiLevel: LevelDef | null = null;
  private screenName: AppScreen = 'boot';
  private runToken = 0;
  private lastFrame = 0;
  private fps = 0;
  private winTimer = -1;
  private raf = 0;
  private lastPausedDraw = 0;
  /** QA: held input that replaces live input while set. */
  private qaInput: Input | null = null;
  private qaEdgesPending = false;
  /** QA: freeze the realtime clock (only QA step(n) advances the sim). */
  private frozen = false;
  replaySpeed: number;
  /** Campaign progress (stars, best scores, unlocks), persisted in browser storage. */
  readonly progress: ProgressStore;
  private levelSelect: LevelSelect | null = null;
  /** Level of the current / next run (the level select sets it). */
  private levelId: string;
  /** Crew chosen on the cat pick screen, used by the level select. */
  private crew: [string, string] | null = null;

  // First run (plan G10 "Heist"): brief gate, ghost-paw route, Rewind 5 s, run funnel analytics.
  /** Which level briefs this player has seen. */
  readonly ftue: FtueStore;
  /** The brief card is open: the run has not started and the sim clock does not run. */
  private gated = false;
  private hints: RouteHintTracker | null = null;
  private readonly routes = new Map<string, RouteLeg[]>();
  private ghost: GhostPaws | null = null;
  /** Key of the leg last drawn (redraw only when the walking cat's tile or the stage changes). */
  private routeKey = '';
  private routeShownThisRun = false;
  /** Tick of the detection the rewind offer is for (-1: none). */
  private lastSpotTick = -1;
  /** Once-per-run `ftue_hint_shown` / `ftue_hint_done` for the rewind (so done never exceeds shown). */
  private readonly rewindFunnel = new RewindFunnel();
  /** The current run started (brief closed) and has not been reported as finished or failed. */
  private runOpen = false;
  private runIsRestart = false;
  private readonly bootAt = typeof performance !== 'undefined' ? performance.now() : 0;

  /** Time of the last rendered frame (performance.now()), for the crash guard's heartbeat. */
  get lastFrameAt(): number {
    return this.lastFrame;
  }

  constructor(opts: AppOptions) {
    this.opts = opts;
    this.replaySpeed = opts.replaySpeed ?? 1;
    // The real shelter cats behind the crates: one GET per page, local copies when offline.
    void loadRescueCats({ base: opts.base });
    const levels = getLevels();
    this.progress = new ProgressStore(undefined, levels.map((l) => l.id));
    this.ftue = opts.ftue ?? new FtueStore();
    this.levelId = opts.levelId && levels.some((l) => l.id === opts.levelId) ? opts.levelId : levels[0].id;
    const layer = (cls: string) => {
      const el = document.createElement('div');
      el.className = cls;
      el.style.cssText = 'position:absolute;inset:0;display:none;';
      opts.root.appendChild(el);
      return el;
    };
    this.gameLayer = layer('ch-game-layer');
    this.yardLayer = layer('ch-yard-layer');

    this.audio = createAudio();
    this.input = createInput({ mapDir: mapperFor(opts.controls ?? 'screen') });
    this.input.setEnabled(false);
    this.input.onPause = () => this.togglePause();

    this.ui = createUI(opts.root, {
      manifest: opts.manifest,
      base: opts.base,
      input: this.input,
      muted: this.audio.isMuted(),
      embed: opts.embed,
      handlers: {
        onStart: (ids) => this.startFromPick(ids),
        onYard: () => this.openYard(),
        onYardBack: () => this.closeYard(),
        onPause: () => this.pause(),
        onResume: () => this.resume(),
        onRetry: () => this.retry(),
        onMenu: () => this.toMenu(false),
        onMuteChange: (m) => this.audio.setMuted(m),
        onUserGesture: () => this.audio.unlock(),
        onClick: () => this.audio.play('click'),
        onObjectiveTap: () => this.toggleRoute(),
      },
    });

    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.raf = requestAnimationFrame(this.frame);
  }

  // -------------------------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------------------------

  /** Current app-level screen (finer than ui.screen: adds loading and pause). */
  get screen(): AppScreen {
    if (this.screenName === 'title' || this.screenName === 'pick') {
      // The UI moves between title and pick on its own.
      const s = this.ui.screen;
      if (s === 'pick') return 'pick';
      if (s === 'title') return 'title';
    }
    if (this.levelSelect?.visible) return 'levels';
    return this.screenName;
  }

  showTitle(): void {
    this.screenName = 'title';
    this.ui.showTitle();
  }

  private setScreen(s: AppScreen): void {
    this.screenName = s;
    this.gameLayer.style.display = s === 'heist' || s === 'pause' || s === 'results' || s === 'loading' ? 'block' : 'none';
    this.yardLayer.style.display = s === 'yard' ? 'block' : 'none';
  }

  /**
   * After the crew pick. Embedded first-time players (no local or account progress) go straight
   * into level 1, so the `/heist` entry is PLAY then START (plan G2: landing to the first playable
   * level in 3 taps); everyone else gets the level select.
   */
  startFromPick(crew: [string, string]): void {
    if (this.opts.embed && this.progress.isFresh()) {
      this.crew = crew;
      void this.startRun(crew, undefined, getLevels()[0].id);
      return;
    }
    this.openLevels(crew);
  }

  /** Level select (after the crew pick). `crew` defaults to the cat pick screen's pair. */
  openLevels(crew?: [string, string], levelId?: string): void {
    this.endRunUnwon('levels');
    this.runToken++;
    this.cancelWin();
    this.closeYard();
    this.session = null;
    this.input.setEnabled(false);
    this.audio.stopMusic();
    this.crew = crew ?? this.crew ?? this.ui.getPickedCats();
    this.ui.hideAll();
    this.setScreen('levels');
    if (!this.levelSelect) {
      this.levelSelect = createLevelSelect(this.ui.root, {
        levels: getLevels(),
        progress: this.progress,
        manifest: this.opts.manifest,
        base: this.opts.base,
        onPlay: (id) => void this.startRun(this.crew ?? this.ui.getPickedCats(), undefined, id),
        onBack: () => {
          this.levelSelect?.hide();
          this.setScreen('title');
          this.ui.showCatPick();
        },
        onClick: () => this.audio.play('click'),
      });
    }
    this.levelSelect.show(levelId);
  }

  private ensureRenderer(): GameRenderer {
    if (!this.renderer) {
      this.renderer = createRenderer({ assetBase: this.opts.base, shadows: this.opts.shadows, logStats: import.meta.env.DEV });
      this.gameLayer.style.display = 'block';
      this.renderer.mount(this.gameLayer);
    }
    return this.renderer;
  }

  /** Start a heist. With `replay`, plays that input log instead of live input. */
  async startRun(catIds: [string, string], replay?: InputLog, levelId?: string, opts: { restart?: boolean } = {}): Promise<void> {
    this.endRunUnwon(opts.restart ? 'retry' : 'levels');
    const token = ++this.runToken;
    this.closeYard();
    this.cancelWin();
    this.levelSelect?.hide();
    const level = getLevel(replay?.levelId ?? levelId ?? this.levelId);
    this.level = level;
    this.levelId = level.id;
    // Name taken once per run, so a late API answer cannot rename the cat mid-heist.
    this.rescueCat = getRescueCatCached(level.id, { base: this.opts.base });
    this.uiLevel = withRescueName(level, this.rescueCat.name);
    this.session = new HeistSession({ level, seed: this.opts.seed ?? 1, catIds, replay });
    const ids = this.session.catIds;
    this.gated = false;
    this.hideRoute();
    this.input.setEnabled(false);
    this.input.reset();
    this.setScreen('loading');
    this.ui.hideAll();
    this.ui.setLoading(this.uiLevel.meta.intro ?? `Casing ${levelName(level)}…`);
    const r = this.ensureRenderer();
    r.setLevel(level);
    r.setCats(ids);
    try {
      await r.ready();
    } catch (e) {
      console.error('asset load failed', e);
    }
    if (token !== this.runToken) return;
    this.ui.setLoading(null);
    this.ui.showHUD(this.uiLevel ?? level, ids);
    this.mountRescueChip();
    this.setScreen('heist');
    this.session.resetClock();
    // Draw the first frame right away so the HUD never sits over an empty canvas.
    r.update(this.session.prev, this.session.cur, 1);
    this.input.reset();
    this.input.setEnabled(this.session.mode === 'play');
    if (this.session.mode === 'replay') this.ui.toast('Replay', 'info');
    this.audio.startMusic();
    this.beginRunFtue(level, !!opts.restart);
  }

  /** The real cat's photo chip beside the objective, for the whole run (display only). */
  private mountRescueChip(): void {
    const obj = this.ui.root.querySelector<HTMLElement>('.ch-obj');
    obj?.querySelector('.ch-lv-hudcat')?.remove();
    if (!obj || !this.rescueCat || this.rescueCat.levelId !== this.level?.id) return;
    obj.prepend(rescueHudChip(this.rescueCat, { base: this.opts.base }));
  }

  private retry(): void {
    const s = this.session;
    if (!s) return;
    void this.startRun(s.catIds, undefined, s.level.id, { restart: true });
  }

  // -------------------------------------------------------------------------------------------
  // First run (plan G10 "Heist")
  // -------------------------------------------------------------------------------------------

  /** Per run: the hint tracker, and the brief gate on a level's first visit (play mode only). */
  private beginRunFtue(level: LevelDef, restart: boolean): void {
    const s = this.session;
    this.lastSpotTick = -1;
    this.rewindFunnel.reset();
    this.routeShownThisRun = false;
    this.runOpen = false;
    this.runIsRestart = restart;
    if (!s || s.mode !== 'play') {
      this.hints = null;
      return;
    }
    // Levels already won only show the route when asked (a tap); new ones also offer it on their own.
    this.hints = new RouteHintTracker({ auto: !this.progress.get(level.id).won });
    this.hints.reset(level, s.cur);
    if (this.ftue.briefSeen(level.id)) {
      this.openRun();
      return;
    }
    this.gated = true;
    this.input.setEnabled(false);
    this.ui.ftue.showBrief(briefFor(this.uiLevel?.id === level.id ? this.uiLevel : level), {
      touch: this.ui.root.classList.contains('ch-touching'),
      pawSrc: this.opts.base + this.opts.manifest.images.paw,
      onGo: () => this.openGate(),
    });
    this.track('ftue_gate_shown', { mode: 'heist', level: level.id, gate: 'brief' });
  }

  /** The brief closed: the run starts now (the closing key or tap is not passed to the sim). */
  private openGate(): void {
    if (!this.gated) return;
    const s = this.session;
    this.gated = false;
    this.ui.ftue.hideBrief();
    if (!s) return;
    this.ftue.markBriefSeen(s.level.id);
    s.resetClock();
    this.input.reset();
    this.input.setEnabled(s.mode === 'play' && this.screenName === 'heist');
    this.lastFrame = performance.now();
    this.openRun();
  }

  private openRun(): void {
    const s = this.session;
    if (!s || s.mode !== 'play') return;
    this.runOpen = true;
    this.track('game_start', { mode: 'heist', level: s.level.id, is_restart: this.runIsRestart });
  }

  /** A started, unwon run is left (retry, menu, level select, page close): `game_fail`. */
  private endRunUnwon(reason: 'retry' | 'menu' | 'levels' | 'exit'): void {
    const s = this.session;
    if (!s || !this.runOpen || s.mode !== 'play' || s.cur.won) return;
    this.runOpen = false;
    if (s.cur.tick === 0) return;
    this.track('game_fail', { ...this.runEnd(s, 'fail'), reason });
  }

  private runEnd(s: HeistSession, outcome: 'win' | 'fail'): HeistEventProperties['game_finish'] {
    return {
      mode: 'heist',
      level: s.level.id,
      outcome,
      duration_s: Math.round((s.cur.tick / TICK_HZ) * 10) / 10,
      score: s.cur.score,
      catnip: s.cur.coinsCollected,
      spotted: s.cur.spottedCount,
      rewinds: s.rewinds,
    };
  }

  /** Every sim tick of a play-mode run (also bulk QA steps): detections, route triggers. */
  private ftueTick(state: SimState): void {
    const s = this.session;
    const level = s?.level;
    if (!s || !level || s.mode !== 'play') return;
    for (const e of state.events) if (e.type === 'SPOTTED') this.onSpotted(state);
    if (this.lastSpotTick >= 0 && state.tick - this.lastSpotTick > REWIND_OFFER_TICKS) {
      this.lastSpotTick = -1;
      this.ui.ftue.hideRewind();
    }
    const change = this.hints?.observe(level, state) ?? null;
    if (change?.type === 'show') this.showRoute(change.trigger);
    else if (change?.type === 'done') {
      this.hideRoute();
      this.track('ftue_hint_done', { mode: 'heist', level: level.id, hint: 'route', trigger: change.trigger });
    }
    if (this.hints?.active) this.refreshRoute(state);
  }

  private onSpotted(state: SimState): void {
    const s = this.session;
    if (!s || state.won) return;
    const offer = canRewind(s.level.id);
    this.track('life_lost', { mode: 'heist', level: s.level.id, spotted: state.spottedCount, rewind_offered: offer });
    if (!offer) return;
    this.lastSpotTick = state.tick;
    this.ui.ftue.offerRewind({ ms: REWIND_OFFER_MS, onRewind: () => this.rewind() });
    if (this.rewindFunnel.offered()) {
      this.track('ftue_hint_shown', { mode: 'heist', level: s.level.id, hint: 'rewind', trigger: 'spotted' });
    }
  }

  /**
   * Rewind 5 s (decision #72): back to five seconds before the last detection, by cutting the input
   * log and re-simulating it (HeistSession.rewindTo). The run, and the log it saves, continue from
   * there.
   */
  rewind(): boolean {
    const s = this.session;
    if (!s || s.mode !== 'play' || s.done || this.screenName !== 'heist' || this.gated || this.lastSpotTick < 0) return false;
    if (!canRewind(s.level.id)) return false;
    s.rewindTo(rewindTarget(this.lastSpotTick));
    this.lastSpotTick = -1;
    this.ui.ftue.hideRewind();
    this.input.reset();
    this.hints?.reset(s.level, s.cur, true);
    this.routeKey = '';
    if (this.hints?.active) this.refreshRoute(s.cur);
    this.ftue.noteRewind();
    this.renderer?.update(s.prev, s.cur, 1);
    this.ui.updateHUD(s.cur);
    this.ui.toast('Rewound 5 s', 'info');
    this.audio.play('click');
    // Once per run, matching ftue_hint_shown {hint:'rewind'}; the rewind count is on the end events.
    if (this.rewindFunnel.rewound()) {
      this.track('ftue_hint_done', { mode: 'heist', level: s.level.id, hint: 'rewind', trigger: 'spotted' });
    }
    return true;
  }

  /** Objective chip tap or H: show the route for this objective, or hide it. */
  toggleRoute(): void {
    const s = this.session;
    if (!s || !this.hints || this.gated || this.screenName !== 'heist') return;
    const change = this.hints.tap();
    if (change?.type === 'show') {
      this.ftue.noteRouteTap();
      this.showRoute(change.trigger);
    } else this.hideRoute();
  }

  private showRoute(trigger: RouteTrigger): void {
    const s = this.session;
    if (!s) return;
    this.routeShownThisRun = true;
    this.routeKey = '';
    this.refreshRoute(s.cur);
    this.track('ftue_hint_shown', { mode: 'heist', level: s.level.id, hint: 'route', trigger });
  }

  private hideRoute(): void {
    this.routeKey = '';
    this.ghost?.hide();
    this.ui.setRoute('off');
  }

  /** The route legs of a level, built once from its solution file. */
  routeFor(level: LevelDef): RouteLeg[] {
    let legs = this.routes.get(level.id);
    if (!legs) {
      try {
        legs = buildRoute(level, getSolution(level.id));
      } catch (e) {
        console.warn('[ftue] no route for', level.id, e);
        legs = [];
      }
      this.routes.set(level.id, legs);
    }
    return legs;
  }

  private refreshRoute(state: SimState): void {
    const s = this.session;
    if (!s) return;
    const me = state.cats[state.activeIndex].pos;
    const key = `${stageIndex(s.level, state)}:${state.activeIndex}:${me.x >> 4},${me.y >> 4}:${state.cats[1 - state.activeIndex].pos.x >> 4},${state.cats[1 - state.activeIndex].pos.y >> 4}`;
    if (key === this.routeKey) return;
    this.routeKey = key;
    const pick = pickLeg(this.routeFor(s.level), s.level, state);
    const ghost = this.ensureGhost();
    if (!pick) {
      ghost?.hide();
      this.ui.setRoute('on');
      return;
    }
    const geo = routeGeometry(pick);
    ghost?.show(geo.prints, geo.marks);
    this.ui.setRoute(pick.needsSwap ? 'swap' : 'on');
  }

  private ensureGhost(): GhostPaws | null {
    if (this.ghost) return this.ghost;
    const r = this.renderer;
    if (!r) return null;
    try {
      this.ghost = new GhostPaws({ reducedMotion: prefersReducedMotion() });
      r.scene.add(this.ghost.group);
    } catch (e) {
      console.warn('[ftue] ghost paws unavailable', e);
      this.ghost = null;
    }
    return this.ghost;
  }

  private track<K extends HeistEventName>(name: K, properties: HeistEventProperties[K]): void {
    const a = this.opts.analytics;
    if (!a) return;
    void a.then((x) => x?.track(name, properties)).catch(() => undefined);
  }

  /** Leave the run (Pause -> Quit, Results -> Menu). The UI shows the title itself unless `showTitle`. */
  toMenu(showTitle = true): void {
    this.endRunUnwon('menu');
    this.gated = false;
    this.hideRoute();
    this.runToken++;
    this.cancelWin();
    this.session = null;
    this.input.setEnabled(false);
    this.input.reset();
    this.audio.stopMusic();
    this.ui.setLoading(null);
    this.levelSelect?.hide();
    this.setScreen('title');
    if (showTitle) this.ui.showTitle();
  }

  openYard(): void {
    this.closeYard();
    this.setScreen('yard');
    this.yard = createYard(this.yardLayer, this.opts.manifest, {
      base: this.opts.base,
      chooseLabel: 'Take on heist',
      onChoose: (id) => {
        const picked = this.ui.getPickedCats();
        const partner = picked[0] !== id ? picked[0] : picked[1] !== id ? picked[1] : (this.opts.manifest.cats.find((c) => c.id !== id)?.id ?? id);
        void this.startRun([id, partner]);
      },
    });
    this.ui.showYard(this.opts.manifest.cats.length);
  }

  private closeYard(): void {
    if (!this.yard) return;
    this.yard.dispose();
    this.yard = null;
    if (this.screenName === 'yard') this.setScreen('title');
  }

  // -------------------------------------------------------------------------------------------
  // Pause
  // -------------------------------------------------------------------------------------------

  togglePause(): void {
    if (this.screenName === 'heist') this.pause();
    else if (this.screenName === 'pause') this.resume();
  }

  pause(): void {
    // The open brief already holds the run (nothing to pause yet).
    if (this.screenName !== 'heist' || this.session?.done || this.gated) return;
    this.setScreen('pause');
    this.ui.showPause();
    this.input.setEnabled(false);
    this.input.reset();
  }

  resume(): void {
    if (this.screenName !== 'pause' || !this.session) return;
    this.ui.hidePause();
    this.setScreen('heist');
    this.session.resetClock();
    this.input.reset();
    this.input.setEnabled(this.session.mode === 'play');
    this.lastFrame = performance.now();
  }

  /** The host page opened a sheet or modal over the game (embed `pause`): pause a running heist. */
  hostPause(): void {
    this.pause();
    this.input.reset();
  }

  /**
   * Embed `audio`: the shell's mute and volumes (one switch for all sound). Applied for this visit
   * only; the standalone mute preference is left as it was.
   */
  hostAudio(audio: HostAudioSettings): void {
    const { sfx, music } = heistVolumesFor(audio);
    this.audio.setVolume(sfx, music);
    this.audio.setMuted(audio.muted, false);
    this.ui.setMuted(audio.muted);
  }

  /** Re-read campaign progress on the level select (after the host merged server progress). */
  refreshLevels(): void {
    this.levelSelect?.refresh();
  }

  private readonly onBlur = () => this.pause();
  private readonly onPageHide = () => this.endRunUnwon('exit');
  private readonly onVisibility = () => {
    if (document.hidden) this.pause();
  };

  // -------------------------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------------------------

  private sample = (): Input => {
    const live = this.input.sample();
    const q = this.qaInput;
    if (!q) return live;
    const out: Input = { ...q, swap: q.swap && this.qaEdgesPending, interact: q.interact && this.qaEdgesPending, meow: q.meow && this.qaEdgesPending };
    this.qaEdgesPending = false;
    return out;
  };

  private readonly onTick = (state: SimState): void => {
    this.renderer?.observe(state);
    this.ftueTick(state);
    if (state.events.length) {
      this.ui.handleEvents(state.events, state);
      this.audio.playEvents(state.events);
    }
    // Sentry turn telegraph: a tick sound when a nearby sentry's warning starts (see sim/telegraph).
    const level = this.session?.level;
    if (level && !state.won) {
      const me = state.cats[state.activeIndex];
      // Edge-triggered per sentry: the tick plays when a warning appears, also for a sentry that
      // comes back on duty (or walks back to its post) with less than TELEGRAPH_TICKS to go.
      const was = this.sentryWarned;
      const now = new Set<number>();
      let play = false;
      for (const w of sentryWarnings(level, state)) {
        const turnAt = state.tick + w.ticksLeft;
        now.add(w.guard * 100003 + turnAt);
        if (was.has(w.guard * 100003 + turnAt)) continue;
        const g = state.guards[w.guard];
        const dx = (g.pos.x - me.pos.x) / SUBTILE;
        const dy = (g.pos.y - me.pos.y) / SUBTILE;
        if (dx * dx + dy * dy <= SENTRY_EARSHOT * SENTRY_EARSHOT) play = true;
      }
      this.sentryWarned = now;
      if (play) this.audio.play('sentry');
    }
  };

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastFrame ? Math.max(0, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    if (dt > 0) this.fps = this.fps ? this.fps * 0.9 + (1 / dt) * 0.1 : 1 / dt;

    const s = this.session;
    const r = this.renderer;
    if (!s || !r) return;
    if (this.screenName === 'heist') {
      if (!this.frozen && !this.gated) s.advance(dt, this.sample, this.onTick, s.mode === 'replay' ? this.replaySpeed : 1);
      this.ui.updateHUD(s.cur);
      if (s.done) this.scheduleResults();
    }
    const throttled = this.screenName === 'pause' && r.qualitySettled;
    if (throttled) {
      if (now - this.lastPausedDraw < PAUSED_FRAME_MS) return;
      this.lastPausedDraw = now;
    }
    if (this.screenName === 'heist' || this.screenName === 'pause' || this.screenName === 'results') {
      this.ghost?.update(dt);
      r.update(s.prev, s.cur, this.screenName === 'heist' ? s.alpha : 1, throttled);
    }
  };

  private scheduleResults(): void {
    if (this.winTimer >= 0 || !this.session) return;
    const token = this.runToken;
    this.input.setEnabled(false);
    const s = this.session;
    if (s.mode === 'play') {
      try {
        localStorage.setItem(LAST_REPLAY_KEY, JSON.stringify(s.log()));
      } catch {
        /* storage is a convenience only */
      }
    }
    this.winTimer = window.setTimeout(() => {
      this.winTimer = -1;
      if (token !== this.runToken || this.session !== s) return;
      this.showResults();
    }, s.cur.won ? RESULTS_DELAY * 1000 : 300);
  }

  private cancelWin(): void {
    if (this.winTimer >= 0) clearTimeout(this.winTimer);
    this.winTimer = -1;
  }

  private showResults(): void {
    const s = this.session;
    if (!s || !this.level) return;
    this.setScreen('results');
    const result = s.result();
    this.hideRoute();
    const uiLevel = this.uiLevel?.id === this.level.id ? this.uiLevel : this.level;
    // Display copy only: the session's result (hash, score, rescuedName) is left as it is.
    this.ui.showResults({ ...result, rescuedName: uiLevel.crate.catName || result.rescuedName }, uiLevel);
    this.audio.stopMusic();
    // Campaign: only real runs count (a watched replay earns nothing).
    const level = this.level;
    const outcome = s.mode === 'play' ? this.progress.record(result, s.cur.won, level) : null;
    if (s.mode === 'play') {
      this.runOpen = false;
      const end = this.runEnd(s, s.cur.won ? 'win' : 'fail');
      const stars = runStars(result, s.cur.won, level);
      if (s.cur.won) this.track('game_finish', { ...end, stars });
      else this.track('game_fail', end);
      if (outcome?.firstWin) {
        this.track('ftue_first_clear', {
          mode: 'heist',
          level: level.id,
          duration_s: end.duration_s,
          elapsed_s: Math.round((performance.now() - this.bootAt) / 1000),
          spotted: end.spotted,
          rewinds: end.rewinds,
          route_shown: this.routeShownThisRun,
        });
      }
    }
    if (s.mode === 'play' && this.opts.onRunComplete) {
      try {
        this.opts.onRunComplete({ won: s.cur.won, levelId: level.id, log: s.log(), stars: runStars(result, s.cur.won, level) });
      } catch (e) {
        console.warn('run-complete handler failed', e);
      }
    }
    const next = nextLevelId(level.id);
    const nextOpen = !!next && this.progress.isUnlocked(next);
    decorateResults(this.ui.root, {
      stars: this.progress.get(level.id).stars,
      newStars: outcome?.newStars ?? 0,
      nextName: next && nextOpen ? levelName(getLevel(next)) : null,
      unlockedNow: !!outcome?.firstWin && nextOpen,
      replay: s.mode === 'replay',
      rescue: this.rescueCat?.levelId === level.id ? this.rescueCat : null,
      base: this.opts.base,
      onNext: next && nextOpen ? () => void this.startRun(s.catIds, undefined, next) : undefined,
      onLevels: () => this.openLevels(s.catIds, level.id),
      onClick: () => this.audio.play('click'),
    });
  }

  // -------------------------------------------------------------------------------------------
  // QA surface (used by src/app/qa.ts)
  // -------------------------------------------------------------------------------------------

  getSession(): HeistSession | null {
    return this.session;
  }

  getLevelDef(): LevelDef | null {
    return this.level;
  }

  /** QA: the brief card is open (the run waits for it). */
  get briefOpen(): boolean {
    return this.gated;
  }

  /** QA: close the brief as the player would. */
  qaCloseBrief(): void {
    this.openGate();
  }

  /** QA: the ghost-paw route on screen (why, and how many prints). */
  qaRoute(): { shown: string | null; prints: number } {
    return { shown: this.hints?.active ?? null, prints: this.ghost?.printCount ?? 0 };
  }

  /** Advance n ticks synchronously (ignores the realtime clock). Bulk steps skip audio and toasts. */
  qaStep(n: number, input?: Partial<Input>): SimState | null {
    if (!QA_BUILD) return null;
    const s = this.session;
    if (!s) return null;
    if (n > 0) this.openGate();
    const base: Input = { ...NO_INPUT, ...(this.qaInput ?? {}), ...(input ?? {}) };
    const quiet = n > 30;
    const quietTick = (st: SimState) => {
      this.renderer?.observe(st);
      this.ftueTick(st);
    };
    for (let i = 0; i < n && !s.done; i++) {
      const inp = i === 0 ? base : { ...base, swap: false, interact: false, meow: false };
      s.stepOnce(inp, quiet ? quietTick : this.onTick);
    }
    s.resetClock();
    if (this.screenName === 'heist' || this.screenName === 'pause') this.ui.updateHUD(s.cur);
    if (s.done && (this.screenName === 'heist' || this.screenName === 'pause')) this.scheduleResults();
    return s.cur;
  }

  /**
   * Feed these inputs to the current play-mode run, one per tick, exactly as recorded (QA: plays a
   * solution as a real run, so it reaches Results and `onRunComplete` like a human win).
   */
  qaFeed(inputs: readonly Input[]): SimState | null {
    if (!QA_BUILD) return null;
    const s = this.session;
    if (!s || s.mode !== 'play') return null;
    this.openGate();
    for (const inp of inputs) {
      if (s.done) break;
      s.stepOnce(inp, (st) => {
        this.renderer?.observe(st);
        this.ftueTick(st);
      });
    }
    s.resetClock();
    if (this.screenName === 'heist' || this.screenName === 'pause') this.ui.updateHUD(s.cur);
    if (s.done && (this.screenName === 'heist' || this.screenName === 'pause')) this.scheduleResults();
    return s.cur;
  }

  qaSetInput(i: Partial<Input> | null): void {
    if (!QA_BUILD) return;
    this.qaInput = i ? { ...NO_INPUT, ...i } : null;
    this.qaEdgesPending = !!i;
  }

  qaFreeze(on: boolean): void {
    this.frozen = on;
    this.session?.resetClock();
  }

  lastReplay(): InputLog | null {
    try {
      const raw = localStorage.getItem(LAST_REPLAY_KEY);
      if (!raw) return null;
      const log = JSON.parse(raw) as InputLog;
      // Drop logs from another sim version or an unknown level: they cannot be replayed.
      let known = false;
      try {
        known = !!log && typeof log === 'object' && !!getLevel(log.levelId);
      } catch {
        known = false;
      }
      if (!known || log.simVersion !== SIM_VERSION || !Array.isArray(log.runs) || !Array.isArray(log.catIds) || log.catIds.length !== 2) {
        localStorage.removeItem(LAST_REPLAY_KEY);
        return null;
      }
      return log;
    } catch {
      return null;
    }
  }

  stats(): AppStats {
    const scr = this.screen;
    let calls = 0;
    let triangles = 0;
    if (scr === 'yard' && this.yard) {
      const y = this.yard.stats();
      calls = y.calls;
      triangles = y.triangles;
    } else if (this.renderer && (scr === 'heist' || scr === 'pause' || scr === 'results')) {
      const r = this.renderer.stats();
      calls = r.calls;
      triangles = r.triangles;
    }
    const quality = this.renderer ? { tier: this.renderer.quality, settled: this.renderer.qualitySettled } : null;
    return { screen: scr, calls, triangles, fps: Math.round(this.fps * 10) / 10, tick: this.session?.cur.tick ?? 0, quality, frame: this.renderer?.frames ?? 0 };
  }

  yardApi(): YardAPI | null {
    return this.yard;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.cancelWin();
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.ghost?.dispose();
    this.yard?.dispose();
    this.levelSelect?.dispose();
    this.renderer?.dispose();
    this.ui.dispose();
    this.input.dispose();
    this.audio.dispose();
    clearVoxelCache();
  }
}
