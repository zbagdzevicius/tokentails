/**
 * App shell (core lane): boots straight onto the starting grid (no menu, GDD 1.1), runs the fixed-step loop with
 * render interpolation (GDD 3.1), feeds the HUD, juice bus and camera, and shows the results with Again / Next.
 *
 * Lanes plug in through: SimPlugins (items-ai), JuiceBus listeners (juice), ShareHooks (share), TrackCodec (ugc).
 */
import { DT, type RaceClass, type RaceConfig, type RacerInfo, type TickInput, type TrackDef } from '../../types';
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
import { ChaseCamera } from '../camera/chase-camera';
import { Hud } from '../hud/hud';
import { renderResults } from '../hud/results';
import { KeyboardInput } from '../input/keyboard';
import { GamepadInput } from '../input/gamepad';
import { TouchInput } from '../input/touch';
import { InputMux } from '../input/mux';
import { applyUnlocks, loadProgress, loadSettings, saveProgress, saveSettings, type Progress, type Settings } from './settings';
import { JuiceBus, type FrameInfo } from '../../juice/bus';
import { StarterAudio } from '../../juice/audio/starter-audio';
import { StarterFeel } from '../../juice/feel';
import { SpeedLines } from '../../juice/vfx/speed-lines';
import { shareHooks } from '../../share/hooks';
import { buildField, createSimPlugins } from '../../items-ai';
import { ITEM_ICON } from '../hud/hud';
import { OUTLINE_UNIFORMS } from '../render/cat-outline';
import { GO_TICK } from '../sim/world';
import '../hud/hud.css';

export interface RaceSetup {
  track: TrackDef;
  cls: RaceClass;
  seed: number;
  modifiers: number;
}

const PLAYER_SLOT = 5; // 6th on the grid: overtakes come early

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class Shell {
  readonly stage: Stage;
  readonly hud: Hud;
  readonly touch: TouchInput;
  readonly mux: InputMux;
  readonly bus = new JuiceBus();
  readonly audio = new StarterAudio();
  readonly camera: ChaseCamera;
  settings: Settings = loadSettings();
  progress: Progress = loadProgress();

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
  private readonly overlay: HTMLDivElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly bot: boolean;
  /** QA only (`?speed=4`): sim steps per real second multiplier, for the e2e smoke */
  private readonly simSpeed: number;
  private me = PLAYER_SLOT;
  private frameInfo!: FrameInfo;
  private kartColors: string[] = [];

  constructor(readonly host: HTMLElement) {
    this.stage = new Stage(host);
    this.camera = new ChaseCamera(this.stage.aspect);
    this.stage.scene.add(this.camera.cam);
    this.hud = new Hud(host);
    this.touch = new TouchInput(host);
    this.mux = new InputMux([new KeyboardInput(), new GamepadInput(), this.touch], { autoGas: this.settings.autoGas, oneThumb: this.settings.oneThumb });
    const q = new URLSearchParams(location.search);
    this.bot = q.has('bot');
    this.simSpeed = Math.max(1, Math.min(8, Number(q.get('speed')) || 1));

    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'fm-menu-btn fm-sticker';
    this.menuBtn.setAttribute('aria-label', 'Menu');
    this.menuBtn.textContent = '☰';
    this.menuBtn.addEventListener('click', () => this.togglePause());
    host.appendChild(this.menuBtn);
    this.overlay = document.createElement('div');
    this.overlay.className = 'fm-overlay';
    host.appendChild(this.overlay);

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
    this.camera.feel.reducedMotion = this.settings.reducedMotion;

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.world && !this.world.done && !this.paused) this.togglePause();
    });
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
    const track = trackById(route?.trackId ?? q.get('track'));
    const clsQ = Number(q.get('cls'));
    const cls = (route?.cls ?? (clsQ >= 0 && clsQ <= 2 && q.has('cls') ? clsQ : Math.min(this.settings.cls, this.progress.unlocked))) as RaceClass;
    const seed = route?.seed ?? (q.has('seed') ? Number(q.get('seed')) | 0 : (Math.random() * 0x7fffffff) | 0);
    return { track, cls, seed, modifiers: route?.modifiers ?? 0 };
  }

  start(setup: RaceSetup): void {
    this.teardown();
    this.setup = setup;
    this.racers = buildField({ seed: setup.seed, cls: setup.cls, playerSlot: PLAYER_SLOT, playerName: 'You' });
    this.me = PLAYER_SLOT;
    const cfg: RaceConfig = {
      track: setup.track,
      seed: setup.seed,
      cls: setup.cls,
      modifiers: setup.modifiers,
      racers: this.racers,
      humans: [PLAYER_SLOT],
      forgiving: this.progress.races === 0,
    };
    const built = buildTrack(setup.track, setup.modifiers);
    this.world = new SimWorld(cfg, createSimPlugins(), built);
    this.view = new RaceView(this.stage.scene, built, this.racers);
    this.view.capture(this.world.st);
    this.view.capture(this.world.st);
    const k = this.world.st.karts[this.me];
    this.camera.snap(k.x, k.y, k.z, k.heading);
    this.hud.setTrack(built, hex(this.view.world.theme.accent));
    this.kartColors = this.racers.map((r) => hex(r.kart.paint[0]));
    this.speedLines = new SpeedLines(this.camera.cam, this.view.world.theme.accent);
    this.recorder = new ReplayRecorder();
    this.eventIdx = 0;
    this.acc = 0;
    this.finishShownAt = -1;
    this.resultsShown = false;
    this.paused = false;
    this.overlay.classList.remove('on');
    this.hud.setVisible(true);
    this.bus.reset();
    this.onResize();
    const hintPounce = this.progress.pounces < 2;
    this.hud.setHint(hintPounce ? (this.touchMode() ? 'Tap on MEOW! for a Pounce Start' : 'Press ↑ on MEOW! for a Pounce Start') : null);
    (window as unknown as { __fm?: unknown }).__fm = { shell: this, world: this.world };
  }

  private touchMode(): boolean {
    return this.touch.active || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
  }

  private teardown(): void {
    this.speedLines?.dispose();
    this.speedLines = null;
    this.view?.dispose();
    this.view = null;
    this.world = null;
  }

  run(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
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
    const muxCtx = { racing: w.st.tick >= GO_TICK, speedFrac: speedOf(me) / top, drifting: me.driftDir !== 0 };
    this.mux.frame(dt, muxCtx);
    if (this.mux.pause) this.togglePause();
    if (this.mux.restart && !this.paused) {
      this.start({ ...this.setup });
      return;
    }

    // fixed-step sim (GDD 3.1): at most 5 steps per frame, never wall-clock inside the sim
    if (!this.paused) {
      this.acc += dt * this.simSpeed;
      const maxSteps = 5 * this.simSpeed;
      let steps = 0;
      while (this.acc >= DT && steps < maxSteps) {
        const input = this.bot ? this.botDrive() : this.mux.sample(w.tick, muxCtx);
        this.recorder.push(input);
        w.step([input]);
        v.capture(w.st);
        this.acc -= DT;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
    }
    const alpha = this.paused ? 1 : this.acc / DT;

    // events → HUD + juice
    const events = w.st.events;
    this.frameInfo = { st: w.st, me: this.me, dt, alpha, topSpeed: top, paused: this.paused };
    const fresh = events.slice(this.eventIdx);
    this.eventIdx = events.length;
    for (const e of fresh) {
      this.hud.onEvent(e, this.me);
      if (e.kart === this.me) this.ftue(e.type);
    }
    this.bus.emit(fresh, this.frameInfo);

    // render
    v.update(w.st, alpha, this.paused ? 0 : dt, top);
    const snap = v.lerpKart(this.me, alpha, { x: 0, y: 0, z: 0, heading: 0 });
    this.camera.lookBack = this.mux.lookBack;
    this.camera.update(me, snap.x, snap.y, snap.z, snap.heading, speedOf(me), top, this.paused ? 0 : dt);
    this.speedLines?.update(dt, speedOf(me), top, me.boostTicks > 0, this.settings.reducedMotion);
    this.hud.update(w.st, this.me, top, GO_TICK, this.kartColors);
    this.hud.wrongWay(me, w.track, dt, w.st.tick > GO_TICK);
    this.touch.setItem(me.item && me.rouletteTicks === 0 ? ITEM_ICON[me.item] : '', !!me.item && me.rouletteTicks === 0);
    this.driftHint(me);
    this.bus.frame(this.frameInfo);
    this.stage.renderer.render(this.stage.scene, this.camera.cam);

    // finish → results 2.5 s later (the field keeps racing behind the panel)
    if (me.finished && this.finishShownAt < 0) this.finishShownAt = performance.now();
    if (!this.resultsShown && ((this.finishShownAt > 0 && performance.now() - this.finishShownAt > 2500) || w.done)) this.showResults();
  }

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
    if (type === 'go') setTimeout(() => this.hud.setHint(null), 1200);
    if (type === 'miniTurbo') {
      this.progress.drifts++;
      this.hud.setHint(null);
    }
  }

  private driftHint(k: { si: number; driftDir: number }): void {
    const w = this.world!;
    if (this.progress.drifts >= 2 || w.st.tick < GO_TICK + 90 || k.driftDir !== 0) return;
    const c = Math.abs(curvatureAhead(w.ctx, k.si, 10, 40));
    if (c > 0.03) this.hud.setHint(this.touchMode() ? 'HOLD RIGHT SIDE TO DRIFT ↪' : 'HOLD SPACE TO DRIFT ↪');
    else if (c < 0.01) this.hud.setHint(null);
  }

  private showResults(): void {
    const w = this.world!;
    const setup = this.setup!;
    this.resultsShown = true;
    const result = w.result();
    const me = w.st.karts[this.me];
    this.progress.races++;
    const unlocked = applyUnlocks(this.progress, setup.cls, result.player.place, !!me.finished);
    if (result.player.time != null) {
      const key = `${setup.track.id}:${setup.cls}`;
      const best = this.progress.bestTimes[key];
      if (best == null || result.player.time < best) this.progress.bestTimes[key] = result.player.time;
    }
    saveProgress(this.progress);
    const extras = shareHooks().onResult?.({ result, replay: this.recorder.replay(), cfg: w.cfg, events: w.st.events }) ?? undefined;
    const lines = [...(extras?.lines ?? [])];
    if (unlocked != null) lines.unshift(`Unlocked: ${CLASSES[unlocked].name} ${CLASSES[unlocked].cc}`);
    const best = this.progress.bestTimes[`${setup.track.id}:${setup.cls}`];
    if (best != null) lines.push(`Your best here: ${best.toFixed(2)} s`);
    renderResults(this.overlay, {
      result,
      racers: this.racers,
      trackName: setup.track.name,
      className: `${CLASSES[setup.cls].name} ${CLASSES[setup.cls].cc}`,
      actions: extras?.actions ?? [],
      lines,
    });
    this.overlay.querySelector('[data-act="again"]')?.addEventListener('click', () => this.start({ ...setup }));
    this.overlay.querySelector('[data-act="next"]')?.addEventListener('click', () => {
      const i = TRACKS.findIndex((t) => t.id === setup.track.id);
      this.start({ ...setup, track: TRACKS[(i + 1) % TRACKS.length], seed: (Math.random() * 0x7fffffff) | 0 });
    });
    this.overlay.classList.add('on');
    this.hud.setVisible(false);
  }

  togglePause(): void {
    if (!this.world || this.resultsShown) return;
    this.paused = !this.paused;
    if (!this.paused) {
      this.overlay.classList.remove('on');
      this.last = performance.now();
      return;
    }
    const s = this.settings;
    const setup = this.setup!;
    const classOpts = CLASSES.map((c, i) => `<option value="${i}" ${i === setup.cls ? 'selected' : ''} ${i > this.progress.unlocked ? 'disabled' : ''}>${c.name} ${c.cc}${i > this.progress.unlocked ? ' 🔒' : ''}</option>`).join('');
    const trackOpts = TRACKS.map((t) => `<option value="${t.id}" ${t.id === setup.track.id ? 'selected' : ''}>${t.name}</option>`).join('');
    this.overlay.innerHTML = `
      <div class="fm-panel fm-sticker">
        <h1>Paused</h1>
        <div class="fm-settings">
          <label>Track <select data-k="track">${trackOpts}</select></label>
          <label>Class <select data-k="cls">${classOpts}</select></label>
          <label>Sound <input type="checkbox" data-k="sound" ${s.muted ? '' : 'checked'}></label>
          <label>One-thumb drift (touch) <input type="checkbox" data-k="oneThumb" ${s.oneThumb ? 'checked' : ''}></label>
          <label>Auto-gas (keyboard / pad) <input type="checkbox" data-k="autoGas" ${s.autoGas ? 'checked' : ''}></label>
          <label>Reduced motion <input type="checkbox" data-k="reducedMotion" ${s.reducedMotion ? 'checked' : ''}></label>
        </div>
        <p class="fm-line">Keys: ←→ steer · ↑ gas · ↓ brake · Space drift · Shift item · Q look back · R restart</p>
        <div class="fm-row-btns">
          <button class="fm-btn primary" data-act="resume">Resume</button>
          <button class="fm-btn" data-act="restart">Restart</button>
        </div>
      </div>`;
    const get = (k: string) => this.overlay.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-k="${k}"]`)!;
    const persist = () => {
      s.muted = !get('sound').checked;
      s.oneThumb = get('oneThumb').checked;
      s.autoGas = get('autoGas').checked;
      s.reducedMotion = get('reducedMotion').checked;
      this.audio.setMuted(s.muted);
      this.mux.settings = { autoGas: s.autoGas, oneThumb: s.oneThumb };
      this.camera.feel.reducedMotion = s.reducedMotion;
      saveSettings(s);
    };
    this.overlay.querySelectorAll('input').forEach((el) => el.addEventListener('change', persist));
    const restartWith = () => {
      const cls = Number(get('cls').value) as RaceClass;
      s.cls = cls;
      saveSettings(s);
      this.start({ ...setup, track: trackById(get('track').value), cls, seed: (Math.random() * 0x7fffffff) | 0 });
    };
    get('track').addEventListener('change', restartWith);
    get('cls').addEventListener('change', restartWith);
    this.overlay.querySelector('[data-act="resume"]')!.addEventListener('click', () => this.togglePause());
    this.overlay.querySelector('[data-act="restart"]')!.addEventListener('click', () => this.start({ ...setup }));
    this.overlay.classList.add('on');
  }
}

