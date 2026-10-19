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
import { CLASSES, classTuning } from '../../tuning';
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
import { InputMux } from '../input/mux';
import { applyUnlocks, loadProgress, loadSettings, saveProgress, saveSettings, type Progress, type Settings } from './settings';
import { bestKey } from './save';
import { JuiceBus, type FrameInfo } from '../../juice/bus';
import { StarterAudio } from '../../juice/audio/starter-audio';
import { StarterFeel } from '../../juice/feel';
import { armHaptics } from '../../juice/haptics';
import { SpeedLines } from '../../juice/vfx/speed-lines';
import { shareHooks, type ResultExtras } from '../../share/hooks';
import { trackFromLocation } from '../../ugc/codec/track-codec';
import { buildField, createSimPlugins } from '../../items-ai';
import { ITEM_ICON, fmtTime } from '../hud/hud';
import { displayName } from '../../ugc/actions';
import { OUTLINE_UNIFORMS } from '../render/cat-outline';
import { GO_TICK } from '../sim/world';
import { hasScreen, registerScreen, screens } from './screens';
import { appBus } from './app-bus';
import { setA11y } from '../../ui/a11y';
import { localeFromUrl, setLocale, t } from '../../ui/i18n';
import { button, h, toggle } from '../../ui/kit';
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
  private finishShownAt = -1;
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
  private readonly muxCtx = { racing: false, speedFrac: 0, drifting: false, curve: 0, wall: false };

  constructor(readonly host: HTMLElement) {
    const q = new URLSearchParams(location.search);
    setLocale(localeFromUrl(location.search) ?? this.settings.lang);
    this.stage = new Stage(host);
    this.camera = new ChaseCamera(this.stage.aspect);
    this.stage.scene.add(this.camera.cam);
    this.hud = new Hud(host);
    this.touch = new TouchInput(host);
    this.mux = new InputMux([new KeyboardInput(), new GamepadInput(), this.touch], { autoGas: this.settings.autoGas, oneThumb: this.settings.oneThumb });
    this.touch.oneThumb = this.settings.oneThumb;
    this.bot = q.has('bot');
    this.simSpeed = Math.max(1, Math.min(8, Number(q.get('speed')) || 1));

    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'fm-menu-btn fm-sticker';
    this.menuBtn.setAttribute('aria-label', t('Pause'));
    this.menuBtn.textContent = '☰';
    this.menuBtn.addEventListener('click', () => this.pause(!this.paused));
    host.appendChild(this.menuBtn);
    screens.attach(host);
    screens.onChange((top, prev) => appBus.emit('screen', { id: top, prev }));
    registerScreen('pause', () => ({ mount: (root) => this.mountPause(root) }));
    // the shell fills the results layer itself (showResults); lanes add to it with registerResultSection
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
    window.addEventListener('resize', () => this.onResize());
    // B34: hiding the tab pauses (idempotent: a queued Escape can no longer flip it back) and silences the audio
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.world && !this.world.done) this.pause(true);
        this.audio.suspend();
      } else this.audio.resume();
    });
  }

  /** Push settings into every system that reads them (audio, input, camera, a11y). */
  applySettings(): void {
    const s = this.settings;
    this.audio.setMuted(s.muted);
    this.audio.setMixer({ music: s.musicVol, sfx: s.sfxVol, engine: s.sfxVol });
    this.mux.settings = { autoGas: s.autoGas, oneThumb: s.oneThumb };
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
    // B6: only whole classes, and never one that is still locked (the QA bot may pick any)
    const clsQ = Number(q.get('cls'));
    const want = q.has('cls') && Number.isInteger(clsQ) && clsQ >= 0 && clsQ <= 2 ? clsQ : this.settings.cls;
    const cls = (route?.cls ?? (this.bot ? want : Math.min(want, this.progress.unlocked))) as RaceClass;
    const seed = route?.seed ?? (q.has('seed') ? Number(q.get('seed')) | 0 : newSeed());
    return { track, cls, seed, modifiers: route?.modifiers ?? 0, mode: route?.mode ?? 'race', day: route?.day };
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
    // compile every shader now, on the grid, so the first rendered frames of the countdown never stall (iOS links
    // programs synchronously on first use). The sim step clamps dt, so a slow compile costs no countdown time.
    try {
      this.stage.renderer.compile(this.stage.scene, this.camera.cam);
    } catch {
      /* compiling early is an optimisation only */
    }
    this.last = performance.now();
    this.hintShows = 0;
    this.hintAt = -1;
    this.hud.setTrack(built, hex(this.view.world.theme.accent));
    this.hud.setTouch(this.touchMode());
    this.hud.setModel({ mode, tag: mode === 'daily' && setup.day ? t('Daily Cup #{n}', { n: setup.day }) : undefined });
    this.kartColors = this.racers.map((r) => hex(r.kart.paint[0]));
    this.speedLines = new SpeedLines(this.camera.cam, this.view.world.theme.accent);
    this.recorder = new ReplayRecorder();
    this.eventIdx = 0;
    this.acc = 0;
    this.finishShownAt = -1;
    this.resultsShown = false;
    this.results = null;
    this.resultExtras = undefined;
    this.paused = false;
    screens.remove('pause');
    screens.remove('results');
    this.hud.setVisible(true);
    this.bus.reset();
    this.onResize();
    const hintPounce = this.progress.pounces < 2 && !this.bot;
    this.hud.setHint(hintPounce ? (this.touchMode() ? t('Tap on MEOW! = Pounce Start') : t('↑ on MEOW! = Pounce Start')) : null);
    if (req.waitForInput === false) this.arm();
    if (!this.armed) this.hud.setTapPrompt(this.touchMode() ? t('TAP TO RACE') : t('PRESS ANY KEY'), this.touchMode() ? t('gas is automatic · left thumb steers') : t('←→ steer · ↑ gas · Space drift'));
    this.touch.setGrid(true);
    // a fresh focus: a button that started this race no longer swallows the race keys
    (document.activeElement as HTMLElement | null)?.blur?.();
    (window as unknown as { __fm?: unknown }).__fm = { shell: this, world: this.world };
    appBus.emit('raceStart', { mode, trackId: setup.track.id, cls: setup.cls, cupId: req.cupId, raceIndex: req.raceIndex });
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
    const now = performance.now();
    this.retired.push({
      at: now + RETIRE_MS,
      fn: () => {
        lines?.dispose();
        view?.dispose();
      },
    });
    this.flushRetired(false);
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
    this.mux.frame(dt, mc);
    if (!this.armed && this.mux.any) this.arm();
    const countdown = w.st.tick < GO_TICK;
    this.touch.countdown = countdown;
    this.touch.setGrid(countdown);
    this.hud.setTouch(this.touchMode());
    if (this.mux.pause) this.pause(!this.paused);
    if (this.mux.restart && !this.paused && !this.resultsShown) {
      this.restart();
      return;
    }

    // fixed-step sim (GDD 3.1): at most 5 steps per frame, never wall-clock inside the sim
    const sdt = dt * this.timeScale(dt); // [juice lane] hit-stop / slow-mo
    if (!this.paused && this.armed) {
      this.acc += sdt * this.simSpeed;
      const maxSteps = 5 * this.simSpeed;
      let steps = 0;
      while (this.acc >= DT && steps < maxSteps) {
        const input = this.bot ? this.botDrive() : this.mux.sample(w.tick, mc);
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
      if (e.kart === this.me || e.kart === -1) this.ftue(e.type);
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
    this.touch.setItem(me.item ? (me.rouletteTicks === 0 ? ITEM_ICON[me.item] : '❔') : '', !!me.item && me.rouletteTicks === 0);
    this.driftHint(me);
    this.bus.frame(this.frameInfo);
    this.stage.renderer.render(this.stage.scene, this.camera.cam);

    // finish → results 2.5 s later (the field keeps racing behind the panel, B35: rows fill in live)
    if (me.finished && this.finishShownAt < 0) this.finishShownAt = performance.now();
    if (!this.resultsShown && ((this.finishShownAt > 0 && performance.now() - this.finishShownAt > 2500) || w.done)) this.showResults();
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

  /** Restart: same track, class and mode; a new seed except for dares and rematches (B37). */
  restart(): void {
    if (!this.setup) return;
    const s = this.setup;
    const keepSeed = s.mode === 'dare' || s.mode === 'daily';
    this.start({ ...(this.request ?? s), ...s, seed: keepSeed ? s.seed : newSeed() });
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
    const extras = shareHooks().onResult?.({ result, replay: this.recorder.replay(), cfg: w.cfg, events: w.st.events }) ?? undefined;
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
    void screens.push('results').then((root) => {
      if (!root) return;
      this.results = renderResults(root, {
        result,
        racers: this.racers,
        ghost: extras?.ghost,
        trackName: displayName(setup.track),
        className: `${CLASSES[setup.cls].name} ${CLASSES[setup.cls].cc}`,
        actions: extras?.actions ?? [],
        lines,
        cfg: w.cfg,
        // B43: the unlock is a button that starts the new class
        unlock:
          unlocked != null
            ? {
                label: t('Unlocked: {c} → race it', { c: `${CLASSES[unlocked].name} ${CLASSES[unlocked].cc}` }),
                run: () => {
                  exitTo('next');
                  this.updateSettings({ cls: unlocked });
                  this.start({ ...setup, cls: unlocked, seed: newSeed(), mode: 'race' });
                },
              }
            : undefined,
        extra: hasScreen('menu') ? [{ label: t('Menu'), act: 'menu', run: () => this.quitToMenu() }] : [],
      });
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
        this.start({ track: TRACKS[(i + 1) % TRACKS.length], cls: this.settings.cls <= this.progress.unlocked ? this.settings.cls : setup.cls, seed: newSeed(), modifiers: 0, mode: 'race' });
      });
    });
    this.hud.setVisible(false);
  }

  /** Pause on / off (idempotent, B34). Paused races show the pause screen. */
  pause(on: boolean): void {
    if (!this.world || this.resultsShown) return;
    if (on === this.paused) return;
    this.paused = on;
    if (on) void screens.push('pause');
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
    if (touch) toggles.push(toggle(t('One-thumb drift'), s.oneThumb, (v) => this.updateSettings({ oneThumb: v })));
    else toggles.push(toggle(t('Auto-gas'), s.autoGas, (v) => this.updateSettings({ autoGas: v })));
    const help = touch
      ? s.oneThumb
        ? t('Left thumb steers. Full stick into a bend drifts. Right thumb: tap to hop, swipe up or down for items.')
        : t('Left thumb steers. Hold the right thumb to drift. Swipe up or down for items.')
      : t('Keys: ←→ steer · ↑ gas · ↓ brake · Space drift · Shift item · Q look back · R restart · Esc pause');
    const btns = [
      button(t('Resume'), () => this.pause(false), { primary: true, act: 'resume' }),
      button(t('Restart'), () => this.restart(), { act: 'restart' }),
    ];
    if (hasScreen('settings')) btns.push(button(t('Settings'), () => void screens.push('settings'), { act: 'settings' }));
    if (hasScreen('menu')) btns.push(button(t('Quit to menu'), () => this.quitToMenu(), { act: 'menu' }));
    const panel = h('div', { class: 'fm-panel fm-sticker', role: 'dialog', 'aria-label': t('Paused') }, [
      h('h1', {}, [t('Paused')]),
      h('div', { class: 'fm-settings' }, toggles),
      h('p', { class: 'fm-line' }, [help]),
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
