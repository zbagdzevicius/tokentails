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
import { NO_INPUT, SIM_VERSION, type AssetManifest, type Input, type LevelDef, type SimState } from '../types';
import { createRenderer, type GameRenderer } from '../render';
import type { QualityTier } from '../render/quality';
import { clearVoxelCache } from '../render/voxel/sheets';
import { createUI, createInput, type InputController, type UI } from '../ui';
import { createAudio, type HeistAudio } from '../audio';
import { createYard, type YardAPI } from '../yard';
import { getLevel, getLevels, nextLevelId } from '../levels';
import { createLevelSelect, decorateResults, levelName, ProgressStore, type LevelSelect } from '../ui/levels';
import type { InputLog } from '../sim';
import { HeistSession } from './session';
import { mapperFor, type ControlScheme } from './controls';

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
  private level: LevelDef | null = null;
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

  constructor(opts: AppOptions) {
    this.opts = opts;
    this.replaySpeed = opts.replaySpeed ?? 1;
    const levels = getLevels();
    this.progress = new ProgressStore(undefined, levels.map((l) => l.id));
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
      handlers: {
        onStart: (ids) => this.openLevels(ids),
        onYard: () => this.openYard(),
        onYardBack: () => this.closeYard(),
        onPause: () => this.pause(),
        onResume: () => this.resume(),
        onRetry: () => this.retry(),
        onMenu: () => this.toMenu(false),
        onMuteChange: (m) => this.audio.setMuted(m),
        onUserGesture: () => this.audio.unlock(),
        onClick: () => this.audio.play('click'),
      },
    });

    window.addEventListener('blur', this.onBlur);
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

  /** Level select (after the crew pick). `crew` defaults to the cat pick screen's pair. */
  openLevels(crew?: [string, string], levelId?: string): void {
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
  async startRun(catIds: [string, string], replay?: InputLog, levelId?: string): Promise<void> {
    const token = ++this.runToken;
    this.closeYard();
    this.cancelWin();
    this.levelSelect?.hide();
    const level = getLevel(replay?.levelId ?? levelId ?? this.levelId);
    this.level = level;
    this.levelId = level.id;
    this.session = new HeistSession({ level, seed: this.opts.seed ?? 1, catIds, replay });
    const ids = this.session.catIds;
    this.input.setEnabled(false);
    this.input.reset();
    this.setScreen('loading');
    this.ui.hideAll();
    this.ui.setLoading(level.meta.intro ?? `Casing ${levelName(level)}…`);
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
    this.ui.showHUD(level, ids);
    this.setScreen('heist');
    this.session.resetClock();
    // Draw the first frame right away so the HUD never sits over an empty canvas.
    r.update(this.session.prev, this.session.cur, 1);
    this.input.reset();
    this.input.setEnabled(this.session.mode === 'play');
    if (this.session.mode === 'replay') this.ui.toast('Replay', 'info');
    this.audio.startMusic();
  }

  private retry(): void {
    const s = this.session;
    if (!s) return;
    void this.startRun(s.catIds, undefined, s.level.id);
  }

  /** Leave the run (Pause -> Quit, Results -> Menu). The UI shows the title itself unless `showTitle`. */
  toMenu(showTitle = true): void {
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
    if (this.screenName !== 'heist' || this.session?.done) return;
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

  private readonly onBlur = () => this.pause();
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
    if (state.events.length) {
      this.ui.handleEvents(state.events, state);
      this.audio.playEvents(state.events);
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
      if (!this.frozen) s.advance(dt, this.sample, this.onTick, s.mode === 'replay' ? this.replaySpeed : 1);
      this.ui.updateHUD(s.cur);
      if (s.done) this.scheduleResults();
    }
    const throttled = this.screenName === 'pause' && r.qualitySettled;
    if (throttled) {
      if (now - this.lastPausedDraw < PAUSED_FRAME_MS) return;
      this.lastPausedDraw = now;
    }
    if (this.screenName === 'heist' || this.screenName === 'pause' || this.screenName === 'results') {
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
    this.ui.showResults(result, this.level);
    this.audio.stopMusic();
    // Campaign: only real runs count (a watched replay earns nothing).
    const level = this.level;
    const outcome = s.mode === 'play' ? this.progress.record(result, s.cur.won, level) : null;
    const next = nextLevelId(level.id);
    const nextOpen = !!next && this.progress.isUnlocked(next);
    decorateResults(this.ui.root, {
      stars: this.progress.get(level.id).stars,
      newStars: outcome?.newStars ?? 0,
      nextName: next && nextOpen ? levelName(getLevel(next)) : null,
      unlockedNow: !!outcome?.firstWin && nextOpen,
      replay: s.mode === 'replay',
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

  /** Advance n ticks synchronously (ignores the realtime clock). Bulk steps skip audio and toasts. */
  qaStep(n: number, input?: Partial<Input>): SimState | null {
    const s = this.session;
    if (!s) return null;
    const base: Input = { ...NO_INPUT, ...(this.qaInput ?? {}), ...(input ?? {}) };
    const quiet = n > 30;
    for (let i = 0; i < n && !s.done; i++) {
      const inp = i === 0 ? base : { ...base, swap: false, interact: false, meow: false };
      s.stepOnce(inp, quiet ? (st) => this.renderer?.observe(st) : this.onTick);
    }
    s.resetClock();
    if (this.screenName === 'heist' || this.screenName === 'pause') this.ui.updateHUD(s.cur);
    if (s.done && (this.screenName === 'heist' || this.screenName === 'pause')) this.scheduleResults();
    return s.cur;
  }

  qaSetInput(i: Partial<Input> | null): void {
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
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.yard?.dispose();
    this.levelSelect?.dispose();
    this.renderer?.dispose();
    this.ui.dispose();
    this.input.dispose();
    this.audio.dispose();
    clearVoxelCache();
  }
}
