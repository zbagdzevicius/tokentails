/**
 * App shell (integrator-owned): boots straight onto the starting grid (deep links and v1 behaviour; the modes lane
 * puts a title and menu in front through the screen stack), runs the fixed-step loop with render interpolation
 * (GDD 3.1), feeds the HUD, juice bus and camera, and shows pause and results as screens.
 *
 * Lanes plug in through: SimPlugins (items-ai / tracks / modes), JuiceBus listeners (juice, audio-ui), ShareHooks
 * (share), TrackCodec (ugc), screens + app bus + result sections + `hudExtras` (iteration 2, src/lanes.ts).
 *
 * Iteration 2 API for the modes lane: `startRace(req)` resolves once the player leaves the results (Again / Next /
 * Menu) or quits, so a Grand Prix can chain races; `pause(on)`, `quitToMenu()`, `setCameraMode(m)`,
 * `hudExtras(model)`.
 */
import { DT, type RaceClass, type RaceConfig, type RaceMode, type RaceResult, type RacerInfo, type TickInput, type TrackDef, type KartLook } from '../../types';
import { classTuning } from '../../tuning';
import { SimWorld } from '../sim/world';
import { ReplayRecorder } from '../sim/replay';
import { curvatureAhead } from '../sim/autopilot';
import { playerBot } from '../../items-ai/balance/bots';
import { speedOf } from '../sim/kart';
import { buildTrack } from '../track/build';
import { TRACKS, trackById } from '../track/tracks';
import { Stage } from '../render/scene';
import { RaceView } from '../render/race-view';
import { ChaseCamera, type CameraMode, type CameraModeParams } from '../camera/chase-camera';
import { Hud, type HudModel } from '../hud/hud';
import { renderResults, type ResultsHandle } from '../hud/results';
import { KeyboardInput } from '../input/keyboard';
import { GamepadInput } from '../input/gamepad';
import { TouchInput } from '../input/touch';
import { InputMux, type MuxContext } from '../input/mux';
import { edgeLook, type EdgeLook } from './edge-look';
import { applyUnlocks, loadProgress, loadSettings, saveProgress, saveSettings, type Progress, type Settings } from './settings';
import { bestKey, save as saveStore } from './save';
import { restartSeed } from './restart';
import { JuiceBus, type FrameInfo } from '../../juice/bus';
import { StarterAudio } from '../../juice/audio/starter-audio';
import { StarterFeel } from '../../juice/feel';
import { armHaptics } from '../../juice/haptics';
import { SpeedLines } from '../../juice/vfx/speed-lines';
import { shareHooks, type ResultExtras } from '../../share/hooks';
import { trackFromLocation } from '../../ugc/codec/track-codec';
import { buildField, createSimPlugins } from '../../items-ai';
import { ITEM_ICON, fmtTime, rouletteIcon } from '../hud/hud';
import { displayName } from '../../ugc/actions';
import { OUTLINE_UNIFORMS } from '../render/cat-outline';
import { GO_TICK } from '../sim/world';
import { hasScreen, registerScreen, screens } from './screens';
import { appBus } from './app-bus';
import { driftTierColors, setA11y } from '../../ui/a11y';
import { localeFromUrl, setLocale, t } from '../../ui/i18n';
import { button, h, modalOpen, toggle } from '../../ui/kit';
import { BackGuard } from './back-guard';
import { classUnlockLabel, finishWaitStep, nextRaceModifiers, raceTag, resultsDue, raceClassLabel, touchHelp } from './race-labels';
import type { WebGLRenderTarget } from 'three';
import '../hud/hud.css';

export interface RaceSetup {
  track: TrackDef;
  cls: RaceClass;
  seed: number;
  modifiers: number;
  /** default 'race' */
  mode?: RaceMode;
  /** Daily Cup day number (banner, HUD tag) */
  day?: number;
}

/** What a mode asks the shell to race (iteration 2). */
export interface RaceRequest extends RaceSetup {
  cupId?: string;
  raceIndex?: number;
  /** replaces the default field (modes: GP grid order, rival flags); the player's slot is `playerSlot` */
  racers?: RacerInfo[];
  playerSlot?: number;
  /** the player's kart look (garage) */
  playerKart?: KartLook;
  /** battle round length, ticks */
  timeLimitTicks?: number;
  /** keep the countdown waiting for a first input (default true; false for chained GP races) */
  waitForInput?: boolean;
  /**
   * [modes lane] The attract race behind the title and menus: the scripted bot drives the player's kart, no HUD, no
   * pause, no results, no progress and no `raceStart`; when it is over it just stops (the modes lane starts another).
   */
  attract?: boolean;
  /**
   * [modes lane] Mode results (Grand Prix, time trial, battle): these buttons replace Again / Next and the class-unlock
   * button. Each one resolves `startRace` with its exit and starts nothing itself (the mode decides what comes next).
   */
  actions?: Array<{ label: string; exit: 'again' | 'next' | 'continue'; primary?: boolean }>;
}

/** How a race request ended. */
export interface RaceOutcome {
  result: RaceResult | null;
  /** 'again' | 'next' | 'menu' | 'quit' | 'continue' */
  exit: 'again' | 'next' | 'menu' | 'quit' | 'continue';
}

const PLAYER_SLOT = 5; // 6th on the grid: overtakes come early
/** GPU resources of a finished race are freed this long after the next one starts (B61: programs still compiling) */
const RETIRE_MS = 1500;

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

const newSeed = (): number => (Math.random() * 0x7fffffff) | 0;

export class Shell {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly touch: TouchInput;
  readonly mux: InputMux;
  readonly bus = new JuiceBus();
  readonly audio = new StarterAudio();
  readonly camera: ChaseCamera;
  readonly screens = screens;
  readonly appBus = appBus;
  settings: Settings = loadSettings();
  progress: Progress = loadProgress();
  /** [juice lane] real-time scale for hit-stop / slow-mo, set by installJuice; the sim still steps whole ticks */
  timeScale: (dt: number) => number = () => 1;

  world: SimWorld | null = null;
  view: RaceView | null = null;
  setup: RaceSetup | null = null;
  racers: RacerInfo[] = [];
  private speedLines: SpeedLines | null = null;
  private recorder = new ReplayRecorder();
  private acc = 0;
  private last = 0;
  private eventIdx = 0;
  private paused = false;
  /** unpaused seconds since the player finished (-1: not yet); the results come up at RESULTS_DELAY */
  private finishWait = -1;
  private resultsShown = false;
  private results: ResultsHandle | null = null;
  private resultExtras: ResultExtras | undefined;
  private readonly menuBtn: HTMLButtonElement;
  private readonly bot: boolean;
  /** QA only (`?speed=4`): sim steps per real second multiplier, for the e2e smoke */
  private readonly simSpeed: number;
  private me = PLAYER_SLOT;
  /** the grid waits for the first input (tap / key / pad): audio unlocks with it, then 3-2-1 */
  private armed = false;
  /** drift hint: shown this race, when it went up */
  private hintShows = 0;
  /** seconds R / Select has been held (restart at 0.6 s), and a latch until it is let go */
  /**
   * Extra buttons for the pause panel and the results footer (ugc: "🏁 Tracks", "✏️ Edit track"). Each provider
   * returns null when it has nothing for this race (a Grand Prix, a battle).
   */
  readonly raceMenuExtras: Array<(where: 'pause' | 'results') => { label: string; act: string; run: () => void } | null> = [];
  private restartHold = 0;
  /** frames drawn since the race paused (B: stop rendering a paused race) */
  private pausedDraws = 0;
  private restartLatch = false;
  private hintAt = -1;
  /** B32: the "Pounce Start" hint's timer (cleared on every start, so a stale one never hits the next race) */
  private pounceTimer: ReturnType<typeof setTimeout> | null = null;
  private frameInfo!: FrameInfo;
  private kartColors: string[] = [];
  private request: RaceRequest | null = null;
  /** bumped on every start: late async results of an older race are ignored (B49) */
  raceToken = 0;
  private outcome: ((o: RaceOutcome) => void) | null = null;
  private retired: Array<{ at: number; fn: () => void }> = [];
  private readonly snap = { x: 0, y: 0, z: 0, heading: 0 };
  /**
   * [modes lane] One-shot filter for the next `start()` (main.ts starts the race from the URL right after the lanes
   * install): the modes lane turns a plain visit's boot race into the attract race behind its title screen.
   */
  startFilter: ((s: RaceSetup | RaceRequest) => RaceSetup | RaceRequest) | null = null;
  /** [modes lane] asked before the pause screen's "Quit to menu" (a Grand Prix in progress); false keeps racing */
  quitGuard: (() => Promise<boolean>) | null = null;
  /**
   * [feel lane] the render target the race camera's frames are drawn into (the bloom chain's scene target), or null
   * for the screen. The grid compile uses it: a program's variant depends on its target's colour space, and the
   * screen variants alone left the post chain's programs to link mid-race.
   */
  warmTarget: (() => WebGLRenderTarget | null) | null = null;
  private readonly backGuard: BackGuard;
  private readonly muxCtx: Required<MuxContext> = { racing: false, speedFrac: 0, drifting: false, curve: 0, wall: false, edgeL: 99, edgeR: 99, edgeHeading: 0, onRail: false, air: false, driftDir: 0 };
  /** iteration 4 (F2): the player's travel heading at the last sim tick seen, for the edge look-ahead's turn rate */
  private readonly yawTrack = { tick: -1, th: 0, rate: 0 };
  private readonly edge: EdgeLook = { edgeL: 99, edgeR: 99, edgeHeading: 0 };

  constructor(readonly host: HTMLElement) {
    const q = new URLSearchParams(location.search);
    setLocale(localeFromUrl(location.search) ?? this.settings.lang);
    this.stage = new Stage(host);
    this.camera = new ChaseCamera(this.stage.aspect);
    this.stage.scene.add(this.camera.cam);
    this.hud = new Hud(host);
    this.touch = new TouchInput(host);
    this.mux = new InputMux([new KeyboardInput(), new GamepadInput(), this.touch], { autoGas: this.settings.autoGas, oneThumb: this.settings.oneThumb, smartSteer: this.settings.smartSteer });
    this.touch.oneThumb = this.settings.oneThumb;
    this.bot = q.has('bot');
    this.simSpeed = Math.max(1, Math.min(8, Number(q.get('speed')) || 1));

    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'fm-menu-btn fm-sticker';
    this.menuBtn.setAttribute('aria-label', t('Pause'));
    this.menuBtn.textContent = '☰';
    this.menuBtn.addEventListener('click', () => {
      // a dialog ("Quit the cup?") owns the race state until it is answered
      if (!modalOpen()) this.pause(!this.paused);
    });
    host.appendChild(this.menuBtn);
    screens.attach(host);
    screens.onChange((top, prev) => appBus.emit('screen', { id: top, prev }));
    // hardware / browser Back steps back inside the game (after the listeners that clean the address bar)
    this.backGuard = new BackGuard(window, { wanted: () => this.backWanted(), handle: () => this.onBack() });
    screens.onChange(() => queueMicrotask(() => this.backGuard.sync()));
    registerScreen('pause', () => ({ mount: (root) => this.mountPause(root) }));
    // the shell fills the results layer itself (showResults); lanes add to it with registerResultSection
    // another tab wrote the save: the core slot is re-read so this tab's next write does not undo it
    saveStore.onExternalChange(() => {
      this.progress = loadProgress();
    });
    registerScreen('results', () => ({ mount: () => ({ back: () => (this.quitToMenuIfAny(), true) }) }));

    this.audio.muted = this.settings.muted;
    this.bus.add(this.audio);
    this.bus.add(
      new StarterFeel({
        trauma: (v) => this.camera.addTrauma(v),
        burst: (k, color, n, speed) => {
          const s = this.world?.st.karts[k];
          if (s && this.view) this.view.burst(s.x, s.y + 0.4, s.z, color, n, speed);
        },
        reducedMotion: () => this.settings.reducedMotion,
      }),
    );
    this.applySettings();

    this.armed = this.bot;
    const unlock = () => {
      this.audio.unlock();
      armHaptics();
      this.arm();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => {
      this.pausedDraws = 0;
      this.onResize();
    });
    // B34: hiding the tab pauses (idempotent: a queued Escape can no longer flip it back) and silences the audio
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.world && !this.world.done) this.pause(true);
        this.audio.suspend();
      } else this.audio.resume();
    });
  }

  /**
   * Iteration 4 (F2): the Smart Steer inputs. The turn rate is the travel heading's change between sim ticks (smoothed);
   * the projection is `edge-look.ts`. Before GO, on a rail or in the air the edges read as far away.
   */
  private fillEdgeLook(w: SimWorld, me: SimWorld['st']['karts'][number], mc: Required<MuxContext>): void {
    mc.onRail = me.rail > 0;
    mc.air = !!me.air;
    mc.driftDir = me.driftDir;
    const y = this.yawTrack;
    const th = Math.atan2(me.vx, me.vz);
    if (w.st.tick !== y.tick) {
      if (y.tick >= 0 && w.st.tick > y.tick && Math.hypot(me.vx, me.vz) > 1) {
        let d = th - y.th;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        const rate = d / ((w.st.tick - y.tick) * DT);
        y.rate += (Math.max(-3, Math.min(3, rate)) - y.rate) * 0.5;
      } else y.rate = 0;
      y.tick = w.st.tick;
      y.th = th;
    }
    if (!mc.racing || mc.onRail || w.track.arena) {
      mc.edgeL = mc.edgeR = 99;
      mc.edgeHeading = 0;
      return;
    }
    const e = edgeLook(w.track, me, y.rate, 0.5, this.edge);
    mc.edgeL = e.edgeL;
    mc.edgeR = e.edgeR;
    mc.edgeHeading = e.edgeHeading;
  }

  /** Push settings into every system that reads them (audio, input, camera, a11y). */
  applySettings(): void {
    const s = this.settings;
    this.audio.setMuted(s.muted);
    this.audio.setMixer({ music: s.musicVol, sfx: s.sfxVol, engine: s.sfxVol });
    this.mux.settings = { autoGas: s.autoGas, oneThumb: s.oneThumb, smartSteer: s.smartSteer };
    this.touch.oneThumb = s.oneThumb;
    this.camera.feel.reducedMotion = s.reducedMotion;
    setA11y({ reducedMotion: s.reducedMotion, colourblind: s.colourblind, highContrast: s.highContrast, textScale: s.textScale, captions: s.captions, haptics: s.haptics });
  }

  /** Change and save settings (the settings screen, the pause toggles). */
  updateSettings(next: Partial<Settings>): void {
    Object.assign(this.settings, next);
    saveSettings(this.settings);
    this.applySettings();
    for (const k of Object.keys(next)) appBus.emit('settingsChanged', { key: k });
  }

  /** First input: start the countdown. */
  private arm(): void {
    if (this.armed) return;
    this.armed = true;
    this.hud.setTapPrompt(null);
    this.last = performance.now();
    this.acc = 0;
  }

  private onResize(): void {
    this.stage.resize();
    this.camera.setAspect(this.stage.aspect);
    OUTLINE_UNIFORMS.uRes.value.set(this.host.clientWidth * this.stage.dpr, this.host.clientHeight * this.stage.dpr);
  }

  /** Default race from the URL (`?track=rooftops&cls=1&seed=7`) or the share lane's route parser. */
  setupFromUrl(): RaceSetup {
    const q = new URLSearchParams(location.search);
    const route = shareHooks().resolveRoute?.(location) ?? null;
    // ugc lane: `?t=CODE` / `#t=CODE` races a shared track (a broken code falls back; the ugc hub says so)
    const shared = trackFromLocation(location);
    const track = shared?.ok ? shared.track : trackById(route?.trackId ?? q.get('track'));
    // an arena (`?track=rug`) is for Balloon Battle only: a lap race there had no laps to count, so it is a battle
    const mode = track.kind === 'arena' ? 'battle' : (route?.mode ?? 'race');
    // B6: only whole classes, and never one that is still locked (the QA bot may pick any)
    const clsQ = Number(q.get('cls'));
    const want = q.has('cls') && Number.isInteger(clsQ) && clsQ >= 0 && clsQ <= 2 ? clsQ : this.settings.cls;
    const cls = (route?.cls ?? (this.bot ? want : Math.min(want, this.progress.unlocked))) as RaceClass;
    const seed = route?.seed ?? (q.has('seed') ? Number(q.get('seed')) | 0 : newSeed());
    return { track, cls, seed, modifiers: route?.modifiers ?? 0, mode, day: route?.day };
  }

  /**
   * Race a request and resolve when the player leaves its results (or quits). The modes lane chains Grand Prix
   * races with this; `start()` is the same race without the promise.
   */
  startRace(req: RaceRequest): Promise<RaceOutcome> {
    this.finishOutcome({ result: null, exit: 'quit' });
    return new Promise((resolve) => {
      this.start(req);
      this.outcome = resolve;
    });
  }

  private finishOutcome(o: RaceOutcome): void {
    const fn = this.outcome;
    this.outcome = null;
    fn?.(o);
  }

  start(setup: RaceSetup | RaceRequest): void {
    // [modes lane] one-shot boot filter (the title screen's attract race)
    if (this.startFilter) {
      const f = this.startFilter;
      this.startFilter = null;
      setup = f(setup);
    }
    const req = setup as RaceRequest;
    // a race started some other way ends a pending startRace() (its caller hears 'quit')
    this.finishOutcome({ result: null, exit: 'quit' });
    this.teardown();
    this.raceToken++;
    this.request = req;
    this.setup = { track: setup.track, cls: setup.cls, seed: setup.seed, modifiers: setup.modifiers, mode: setup.mode ?? 'race', day: setup.day };
    const mode = this.setup.mode ?? 'race';
    // share lane: the player's own cat from the cat maker, when one is saved (share/hooks.ts playerRacer)
    const own = shareHooks().playerRacer?.() ?? null;
    const slot = req.playerSlot ?? PLAYER_SLOT;
    this.racers = req.racers ?? buildField({ seed: setup.seed, cls: setup.cls, playerSlot: slot, playerName: own?.name ?? 'You', playerCat: own?.cat, playerKart: req.playerKart });
    this.me = slot;
    const cfg: RaceConfig = {
      track: setup.track,
      seed: setup.seed,
      cls: setup.cls,
      modifiers: setup.modifiers,
      racers: this.racers,
      humans: [slot],
      forgiving: this.progress.races === 0,
      mode,
      cupId: req.cupId,
      raceIndex: req.raceIndex,
      timeLimitTicks: req.timeLimitTicks,
    };
    const built = buildTrack(setup.track, setup.modifiers);
    this.world = new SimWorld(cfg, createSimPlugins(cfg), built);
    this.view = new RaceView(this.stage.scene, built, this.racers);
    this.view.capture(this.world.st);
    this.view.capture(this.world.st);
    const k = this.world.st.karts[this.me];
    this.camera.snap(k.x, k.y, k.z, k.heading);
    this.camera.setMode('chase');
    this.last = performance.now();
    this.hintShows = 0;
    this.hintAt = -1;
    this.hud.setTrack(built, hex(this.view.world.theme.accent));
    this.hud.setTouch(this.touchMode());
    this.hud.setModel({ mode, tag: raceTag(mode, setup.day, setup.modifiers) }); // [modes lane] F11: the Daily Cup or Wild Card mutator
    this.kartColors = this.racers.map((r) => hex(r.kart.paint[0]));
    this.speedLines = new SpeedLines(this.camera.cam, this.view.world.theme.accent);
    this.recorder = new ReplayRecorder();
    this.eventIdx = 0;
    this.acc = 0;
    this.finishWait = -1;
    this.resultsShown = false;
    this.results = null;
    this.resultExtras = undefined;
    this.paused = false;
    screens.remove('pause');
    screens.remove('results');
    this.hud.setVisible(true);
    this.bus.reset();
    this.onResize();
    this.warmShaders();
    const hintPounce = this.progress.pounces < 2 && !this.bot;
    if (req.waitForInput === false || req.attract) this.arm();
    // the tap prompt goes up before the hint (polish 7: the hint was drawn on top of the prompt card's subtitle); the
    // HUD holds the hint back while the prompt shows and gives it the slot under the countdown
    if (!this.armed && !req.attract) this.hud.setTapPrompt(this.touchMode() ? t('TAP TO RACE') : t('PRESS ANY KEY'), this.touchMode() ? t('gas is automatic · left thumb steers') : t('←→ steer · ↑ gas · Space drift'));
    this.hud.setHint(hintPounce ? (this.touchMode() ? t('Tap on MEOW! = Pounce Start') : t('↑ on MEOW! = Pounce Start')) : null);
    if (req.attract) {
      // [modes lane] the attract race is scenery: no HUD, hints or thumbs, and nobody hears about it
      this.hud.setHint(null);
      this.hud.setVisible(false);
      this.touch.setGrid(false);
      (window as unknown as { __fm?: unknown }).__fm = { shell: this, world: this.world };
      return;
    }
    this.touch.setGrid(true);
    // a fresh focus: a button that started this race no longer swallows the race keys
    (document.activeElement as HTMLElement | null)?.blur?.();
    (window as unknown as { __fm?: unknown }).__fm = { shell: this, world: this.world };
    appBus.emit('raceStart', { mode, trackId: setup.track.id, cls: setup.cls, cupId: req.cupId, raceIndex: req.raceIndex });
    this.backGuard.sync();
  }

  /** Back has something to step back from: a dialog, a menu layer under the title, or a race in progress. */
  private backWanted(): boolean {
    if (modalOpen()) return true;
    const top = screens.top();
    if (top) return top !== 'title';
    return !!this.world && !this.attract && !this.resultsShown;
  }

  /** One hardware / browser Back: Esc for a dialog or menu layer, pause for a running race; false leaves the game. */
  private onBack(): boolean {
    if (modalOpen()) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      return true;
    }
    const top = screens.top();
    // the title is the root: Back there leaves the game (every other layer goes back as Esc does; pause resumes)
    if (top === 'title') return false;
    if (top) {
      screens.back();
      return true;
    }
    if (this.world && !this.attract && !this.resultsShown) {
      this.pause(true);
      return true;
    }
    return false;
  }

  /** [modes lane] the current race is the attract race behind the menus */
  get attract(): boolean {
    return !!this.request?.attract;
  }

  /**
   * [modes lane] Leave the current race without opening anything (the podium and the kart showroom draw their own
   * scene on the shared renderer while no race runs). A pending `startRace` resolves with 'quit'.
   */
  leaveRace(): void {
    this.finishOutcome({ result: null, exit: 'quit' });
    this.paused = false;
    screens.remove('pause');
    screens.remove('results');
    this.teardown();
    this.setup = null;
    this.request = null;
    this.hud.setVisible(false);
    this.hud.setTapPrompt(null);
    this.touch.setGrid(false);
  }

  private touchMode(): boolean {
    return this.touch.active || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  }

  /**
   * Leave the current race. Its GPU resources are freed a little later (B61: disposing programs that are still
   * being linked logged dozens of GL_INVALID_VALUE warnings after a restart during the countdown); the next race
   * re-uses the same programs from three's cache meanwhile.
   */
  private teardown(): void {
    if (this.pounceTimer) clearTimeout(this.pounceTimer);
    this.pounceTimer = null;
    const lines = this.speedLines;
    const view = this.view;
    this.speedLines = null;
    this.view = null;
    this.world = null;
    if (view) for (const kv of view.karts) kv.root.visible = false;
    if (view) view.world.group.visible = false;
    // the speed-lines overlay hangs off the shared race camera: off it now, or it stays drawn, frozen, over the next grid
    lines?.detach();
    this.retire(() => {
      lines?.dispose();
      view?.dispose();
    });
    this.flushRetired(false);
  }

  /**
   * Compile every shader of the new race now, on the grid, so the first rendered frames of the countdown never stall
   * (iOS links programs synchronously on first use; the sim step clamps dt, so a slow compile costs no countdown
   * time). Runs after the juice bus reset: the per-race effects (kart FX, sky, tunnel, ghosts) exist by then, and the
   * last race's are already out of the scene (B61: compiling them and freeing them a moment later logged
   * GL_INVALID_VALUE warnings). The karts' see-through variants (KartView.setFade near the camera) compile too, so the
   * first close rival mid-race does not link a program.
   */
  private warmShaders(): void {
    const r = this.stage.renderer;
    const karts = this.view?.karts ?? [];
    const prevTarget = r.getRenderTarget();
    try {
      // the bloom chain draws the scene into its own target: compile the variants the frames will use
      r.setRenderTarget(this.warmTarget?.() ?? null);
      r.compile(this.stage.scene, this.camera.cam);
      for (const v of ['see', 'solid'] as const) {
        for (const kv of karts) kv.fadeVariant(v);
        r.compile(this.stage.scene, this.camera.cam);
      }
    } catch {
      /* compiling early is an optimisation only */
    } finally {
      for (const kv of karts) kv.fadeVariant(null);
      r.setRenderTarget(prevTarget);
    }
  }

  /**
   * Free GPU resources of a torn-down race a little later (B61): a lane's per-race objects leave the scene at once and
   * hand their dispose here, so programs that may still be linking are never deleted under the driver.
   */
  retire(fn: () => void): void {
    this.retired.push({ at: performance.now() + RETIRE_MS, fn });
  }

  /** Free retired races whose time has come (all of them when `all`). */
  private flushRetired(all: boolean): void {
    const now = performance.now();
    const keep: typeof this.retired = [];
    for (const r of this.retired) {
      if (all || r.at <= now) {
        try {
          r.fn();
        } catch (err) {
          console.warn('[shell] dispose failed', err);
        }
      } else keep.push(r);
    }
    this.retired = keep;
  }

  run(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.retired.length) this.flushRetired(false);
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    const w = this.world;
    const v = this.view;
    if (!w || !v || !this.setup) return;
    this.stage.govern(dt);
    const top = classTuning(this.setup.cls).topSpeed;
    const me = w.st.karts[this.me];
    const mc = this.muxCtx; // B58: reused every frame
    mc.racing = w.st.tick >= GO_TICK;
    mc.speedFrac = speedOf(me) / top;
    mc.drifting = me.driftDir !== 0;
    mc.curve = curvatureAhead(w.ctx, me.si, 4, 24);
    mc.wall = !!me.wall;
    this.fillEdgeLook(w, me, mc);
    this.mux.frame(dt, mc);
    if (!this.armed && this.mux.any) this.arm();
    const countdown = w.st.tick < GO_TICK;
    const attract = this.attract;
    this.touch.countdown = countdown;
    this.touch.setGrid(countdown && !attract);
    this.hud.setTouch(this.touchMode());
    // Start / Esc / P wait while a dialog is up (the race used to resume under "Quit the cup?")
    const dialog = modalOpen();
    if (this.mux.pause && !attract && !dialog) this.pause(!this.paused);
    // restart is a 0.6 s hold of R / Select (a stray tap next to E or W used to throw a race away), once per hold
    if (this.mux.restart && !this.paused && !this.resultsShown && !attract && !dialog) {
      if (!this.restartLatch) {
        if (this.restartHold === 0) this.hud.say(t('Keep holding to restart'), { prio: 1, ms: 700 });
        this.restartHold += dt;
        if (this.restartHold >= 0.6) {
          this.restartHold = 0;
          this.restartLatch = true;
          this.restart();
          return;
        }
      }
    } else {
      this.restartHold = 0;
      if (!this.mux.restart) this.restartLatch = false;
    }

    // fixed-step sim (GDD 3.1): at most 5 steps per frame, never wall-clock inside the sim
    const sdt = dt * this.timeScale(dt); // [juice lane] hit-stop / slow-mo
    if (!this.paused && this.armed) {
      this.acc += sdt * this.simSpeed;
      const maxSteps = 5 * this.simSpeed;
      let steps = 0;
      while (this.acc >= DT && steps < maxSteps) {
        const input = this.bot || attract ? this.botDrive() : this.mux.sample(w.tick, mc);
        this.recorder.push(input);
        w.step([input]);
        v.capture(w.st);
        this.acc -= DT;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
    }
    const alpha = this.paused ? 1 : this.acc / DT;

    // events → HUD + juice (B58: no slice; the bus walks the new range)
    const events = w.st.events;
    this.frameInfo = { st: w.st, me: this.me, dt, alpha, topSpeed: top, paused: this.paused };
    const from = this.eventIdx;
    this.eventIdx = events.length;
    for (let i = from; i < events.length; i++) {
      const e = events[i];
      this.hud.onEvent(e, this.me);
      // B32: race-wide events (kart -1, e.g. GO) reach the FTUE too
      if ((e.kart === this.me || e.kart === -1) && !attract) this.ftue(e.type);
    }
    if (from < events.length) this.bus.emitRange(events, from, this.frameInfo);

    // render
    v.update(w.st, alpha, this.paused ? 0 : sdt, top); // [juice lane] sdt
    const snap = v.lerpKart(this.me, alpha, this.snap);
    this.camera.lookBack = this.mux.lookBack;
    this.camera.update(me, snap.x, snap.y, snap.z, snap.heading, speedOf(me), top, this.paused ? 0 : dt);
    this.speedLines?.update(dt, speedOf(me), top, me.boostTicks > 0, this.settings.reducedMotion);
    this.hud.update(w.st, this.me, top, GO_TICK, this.kartColors);
    this.hud.wrongWay(me, w.track, dt, w.st.tick > GO_TICK);
    if (me.driftDir !== 0 && me.driftTier > 0) this.touch.setDrift(me.driftTier, '#' + driftTierColors()[me.driftTier - 1].toString(16).padStart(6, '0'));
    else this.touch.setDrift(me.driftDir !== 0 ? 0 : null);
    this.touch.setItem(me.item ? (me.rouletteTicks === 0 ? ITEM_ICON[me.item] : rouletteIcon(w.st.tick, me.rouletteTicks)) : '', !!me.item && me.rouletteTicks === 0);
    if (!attract) this.driftHint(me);
    this.bus.frame(this.frameInfo);
    // paused: a few frames to settle the blurred backdrop, then the canvas keeps its last frame (battery on phones);
    // a resize draws again
    if (!this.paused || this.resultsShown) this.pausedDraws = 0;
    if (this.pausedDraws < 4) {
      if (this.paused && !this.resultsShown) this.pausedDraws++;
      this.stage.renderer.render(this.stage.scene, this.camera.cam);
    }
    if (attract) return; // [modes lane] the attract race never shows results

    // finish → results 2.5 s later (the field keeps racing behind the panel, B35: rows fill in live)
    // the wait counts unpaused time only, and the results never come up over the pause screen (they used to lift it)
    this.finishWait = finishWaitStep(this.finishWait, !!me.finished, this.paused, dt);
    if (!this.resultsShown && resultsDue(this.finishWait, this.paused, w.done)) this.showResults();
    else if (this.resultsShown && this.results) {
      let n = 0;
      for (const k of w.st.karts) n += k.finished;
      if (n !== this.finishedRows) {
        this.finishedRows = n;
        this.results.update(w.result(), this.resultExtras?.ghost);
      }
    }
  }

  /** karts finished when the results rows were last drawn (B35) */
  private finishedRows = 0;

  /** `?bot=1`: the player kart is driven by the scripted average-player bot (e2e smoke, attract mode). */
  private botDrive(): TickInput {
    return playerBot(this.world!.ctx, this.me);
  }

  /** FTUE counters: hints stop once the player has done each action twice (GDD 1.1). */
  private ftue(type: string): void {
    if (type === 'pounce') {
      this.progress.pounces++;
      this.hud.setHint(null);
    }
    if (type === 'go') {
      if (this.pounceTimer) clearTimeout(this.pounceTimer);
      this.pounceTimer = setTimeout(() => {
        this.pounceTimer = null;
        this.hud.setHint(null);
      }, 1200);
    }
    if (type === 'driftStart') {
      // any drift start counts (short taps too): the hint is for players who have not found drifting yet
      this.progress.drifts++;
      if (this.hintAt >= 0) {
        this.hud.setHint(null);
        this.hintAt = -1;
      }
    }
  }

  /** Drift hint: before a real bend, at most 3 times a race, up for 3 s at most, gone the moment a drift starts. */
  private driftHint(k: { si: number; driftDir: number }): void {
    const w = this.world!;
    const now = w.st.tick;
    if (this.hintAt >= 0) {
      if (k.driftDir !== 0 || now - this.hintAt > 180) {
        this.hud.setHint(null);
        this.hintAt = -1;
      }
      return;
    }
    if (this.bot || this.progress.drifts >= 2 || this.hintShows >= 3 || now < GO_TICK + 90 || k.driftDir !== 0) return;
    const c = curvatureAhead(w.ctx, k.si, 10, 40);
    if (Math.abs(c) <= 0.03) return;
    const arrow = c > 0 ? '↩' : '↪'; // curvature + = left turn
    // B28: the hint names the drift method that is actually on
    const text = this.touchMode()
      ? this.settings.oneThumb
        ? t('FULL STICK INTO THE TURN = DRIFT {a}', { a: arrow })
        : t('HOLD RIGHT THUMB = DRIFT {a}', { a: arrow })
      : t('HOLD SPACE TO DRIFT {a}', { a: arrow });
    this.hud.setHint(text);
    this.hintAt = now;
    this.hintShows++;
  }

  /** Restart: same track, class and mode; the seed rule is `restartSeed` (B37). */
  restart(): void {
    if (!this.setup) return;
    const s = this.setup;
    // [modes lane] a restart (pause, R, Select) is the same race again: a pending startRace keeps waiting for it
    const pending = this.outcome;
    this.outcome = null;
    this.start({ ...(this.request ?? s), ...s, seed: restartSeed(s.mode, s.seed, newSeed) });
    this.outcome = pending;
  }

  private showResults(): void {
    const w = this.world!;
    const setup = this.setup!;
    this.resultsShown = true;
    this.finishedRows = w.st.karts.reduce((n, k) => n + k.finished, 0);
    this.paused = false;
    screens.remove('pause');
    const result = w.result();
    const me = w.st.karts[this.me];
    this.progress.races++;
    let extras: ResultExtras | undefined;
    try {
      extras = shareHooks().onResult?.({ result, replay: this.recorder.replay(), cfg: w.cfg, events: w.st.events, mode: setup.mode, day: setup.day }) ?? undefined;
    } catch (e) {
      // a lane's extras must never cost the results screen (e.g. a corrupted save it reads)
      console.error('[shell] result extras failed', e);
      extras = undefined;
    }
    this.resultExtras = extras || undefined;
    // the Daily Cup and dares run at a fixed class: they never unlock a class
    const unlocked = extras?.noUnlock ? null : applyUnlocks(this.progress, setup.cls, result.player.place, !!me.finished);
    const mode = setup.mode ?? 'race';
    // B36: bests per mode, track, class and modifiers (a Daily Cup run is not a normal best)
    const key = bestKey(mode, setup.track.id, setup.cls, setup.modifiers);
    if (result.player.time != null) {
      const best = this.progress.bestTimes[key];
      if (best == null || result.player.time < best) this.progress.bestTimes[key] = result.player.time;
    }
    saveProgress(this.progress);
    const lines = [...(extras?.lines ?? [])];
    const best = this.progress.bestTimes[key];
    if (best != null) lines.push(t('Your best here: {t}', { t: fmtTime(best) }));
    appBus.emit('raceEnd', { result, stats: result.stats, mode });
    if (unlocked != null) appBus.emit('unlock', { kind: 'class', id: String(unlocked) });
    const exitTo = (exit: RaceOutcome['exit']) => this.finishOutcome({ result, exit });
    // [modes lane] mode results: the mode's buttons instead of Again / Next / the unlock button
    const modeActions = this.request?.actions;
    void screens.push('results').then((root) => {
      if (!root) return;
      this.results = renderResults(root, {
        result,
        racers: this.racers,
        ghost: extras?.ghost,
        trackName: displayName(setup.track),
        className: raceClassLabel(setup.cls, setup.modifiers),
        actions: extras?.actions ?? [],
        lines,
        cfg: w.cfg,
        // B43: the unlock is a button that starts the new class
        unlock:
          unlocked != null && !modeActions
            ? {
                label: classUnlockLabel(unlocked), // [modes lane] F13
                run: () => {
                  exitTo('next');
                  this.updateSettings({ cls: unlocked });
                  this.start({ ...setup, cls: unlocked, seed: newSeed(), mode: 'race' });
                },
              }
            : undefined,
        extra: [
          ...(modeActions ?? []).map((a) => ({ label: a.label, act: `mode-${a.exit}`, run: () => exitTo(a.exit) })),
          ...(hasScreen('menu') ? [{ label: t('Menu'), act: 'menu', run: () => this.quitToMenu() }] : []),
          ...this.raceMenuExtras.map((p) => p('results')).filter((x): x is { label: string; act: string; run: () => void } => !!x),
        ],
      });
      if (modeActions) {
        root.querySelector('[data-act="again"]')?.remove();
        root.querySelector('[data-act="next"]')?.remove();
        for (const a of modeActions) {
          if (!a.primary) continue;
          const b = root.querySelector<HTMLElement>(`[data-act="mode-${a.exit}"]`);
          // the mode's main step (Continue) leads the row, full width
          if (b) {
            b.classList.add('primary', 'big');
            b.parentElement?.prepend(b);
          }
        }
      }
      // B15 / B18: an arena (a battle opened from a link) and the Daily Cup have no "next track": Next used to start a
      // normal lap race on another track from there
      if (setup.track.kind === 'arena' || mode === 'battle' || mode === 'daily') {
        root.querySelector('[data-act="next"]')?.remove();
        const again = root.querySelector<HTMLElement>('[data-act="again"]');
        if (again && mode === 'daily') again.textContent = t('Practice ↻');
        if (again && !root.querySelector('.fm-res-main .primary')) again.classList.add('primary', 'big');
      }
      // results that arrive late (the dare ghost's recomputed time): only for these results, still on screen
      const token = this.raceToken;
      void extras?.later?.then((late) => {
        if (!late || token !== this.raceToken || !this.results) return;
        if (late.ghost) {
          this.resultExtras = { ...(this.resultExtras ?? {}), ghost: late.ghost };
          this.results.update(this.world ? this.world.result() : result, late.ghost);
        }
        if (late.lines?.length) this.results.addLines(late.lines);
      });
      root.querySelector('[data-act="again"]')?.addEventListener('click', () => {
        exitTo('again');
        this.restart();
      });
      root.querySelector('[data-act="next"]')?.addEventListener('click', () => {
        exitTo('next');
        // B43: Next keeps the newest unlocked class the player picked; a normal race on the next authored track
        const i = TRACKS.findIndex((x) => x.id === setup.track.id);
        this.start({ track: TRACKS[(i + 1) % TRACKS.length], cls: this.settings.cls <= this.progress.unlocked ? this.settings.cls : setup.cls, seed: newSeed(), modifiers: nextRaceModifiers(setup.modifiers), mode: 'race' });
      });
    });
    this.hud.setVisible(false);
  }

  /** Pause on / off (idempotent, B34). Paused races show the pause screen. */
  pause(on: boolean): void {
    if (!this.world || this.resultsShown || this.attract) return;
    if (on === this.paused) return;
    this.paused = on;
    if (on)
      void screens.push('pause').then(() => {
        // [integrator] resumed while the pause layer was still loading (☰ or Esc twice quickly): take it down again
        if (!this.paused) screens.remove('pause');
      });
    else {
      screens.remove('settings');
      screens.remove('pause');
      this.last = performance.now();
    }
  }

  /** v1 name, kept for the ugc hub. */
  togglePause(): void {
    this.pause(!this.paused);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Esc / B on the results: the menu when there is one (modes lane), else nothing. */
  private quitToMenuIfAny(): void {
    if (hasScreen('menu')) this.quitToMenu();
  }

  /** Leave the race for the menu (modes lane registers the 'menu' screen; without one the race restarts). */
  quitToMenu(): void {
    this.finishOutcome({ result: this.world && this.resultsShown ? this.world.result() : null, exit: 'menu' });
    this.paused = false;
    screens.clear();
    if (hasScreen('menu')) {
      this.teardown();
      this.hud.setVisible(false);
      void screens.push('menu');
    } else if (this.setup) this.restart();
  }

  /** Camera modes (iteration 2): flyover, finish orbit, podium and attract come from the feel lane. */
  setCameraMode(m: CameraMode, params?: CameraModeParams): void {
    this.camera.setMode(m, params);
  }

  /** Fields for the HUD model (modes: balloons, timer, splits, GP race; progression: rival). */
  hudExtras(model: Partial<HudModel>): void {
    this.hud.setModel(model);
  }

  /** The pause screen (B38: no track / class selects; B42: only the controls of the input in use, real toggles). */
  private mountPause(root: HTMLElement): { back(): boolean; unmount(): void } {
    const s = this.settings;
    const touch = this.touchMode();
    const toggles: HTMLElement[] = [
      toggle(t('Sound'), !s.muted, (v) => this.updateSettings({ muted: !v })),
      toggle(t('Reduced motion'), s.reducedMotion, (v) => this.updateSettings({ reducedMotion: v })),
    ];
    const helpLine = h('p', { class: 'fm-line' }, [touch ? touchHelp(s.oneThumb) : t('Keys: ←→ steer · ↑ gas · ↓ brake · Space drift · Shift item · Q look back · hold R restart · Esc pause')]);
    if (touch)
      toggles.push(
        toggle(t('One-thumb drift'), s.oneThumb, (v) => {
          this.updateSettings({ oneThumb: v });
          // the help line describes the drift method that is on now
          helpLine.textContent = touchHelp(v);
        }),
      );
    else toggles.push(toggle(t('Auto-gas'), s.autoGas, (v) => this.updateSettings({ autoGas: v })));
    const btns = [
      button(t('Resume'), () => this.pause(false), { primary: true, act: 'resume' }),
      button(t('Restart'), () => this.restart(), { act: 'restart' }),
    ];
    if (hasScreen('settings')) btns.push(button(t('Settings'), () => void screens.push('settings'), { act: 'settings' }));
    if (hasScreen('menu'))
      btns.push(
        button(
          t('Quit to menu'),
          () => {
            // [modes lane] a Grand Prix in progress asks first
            const guard = this.quitGuard;
            if (!guard) return this.quitToMenu();
            void guard().then((ok) => {
              if (ok) this.quitToMenu();
            });
          },
          { act: 'menu' },
        ),
      );
    for (const p of this.raceMenuExtras) {
      const x = p('pause');
      if (x) btns.push(button(x.label, x.run, { act: x.act }));
    }
    const panel = h('div', { class: 'fm-panel fm-sticker', role: 'dialog', 'aria-label': t('Paused') }, [
      h('h1', {}, [t('Paused')]),
      h('div', { class: 'fm-settings' }, toggles),
      helpLine,
      h('div', { class: 'fm-row-btns sticky' }, btns),
    ]);
    root.append(panel);
    return {
      back: () => {
        this.pause(false);
        return true;
      },
      unmount: () => {
        if (this.paused && !this.resultsShown) {
          // removed from outside (a screen replaced it): keep the race paused state honest
          this.paused = false;
          this.last = performance.now();
        }
      },
    };
  }
}

export { newSeed };
