/**
 * Skill preview player (LoL / Wild Rift style): a short looping clip of a hero casting one skill on a training dummy,
 * drawn live by the game engine. Load this module lazily (`await import('./preview/skillPreview')`): it pulls three.js
 * and the GameView, which the hero picker does not need until a preview opens.
 *
 * mountSkillPreview(el, hero, slot) → { ready, play, stop, set, dispose, stats }
 *
 * - The sim is the real one (skillSandbox.ts): a private match where the hero casts the slot at a dummy (or an ally),
 *   so the clip always matches the shipped skill, with no video assets to keep in sync.
 * - The view is the real GameView (rig, animation director, skill FX kit, projectiles, telegraphs, damage numbers) in
 *   one small WebGL canvas with a fixed close camera framing the three heroes.
 * - Lightweight: Low tier on touch devices and small screens (no shadows, DPR 1.25), 30 fps through the frame pacer,
 *   only the clip's three heroes drawn, bars at DPR ≤ 1.5, no DOM damage numbers, silent (identity layer included)
 *   unless asked (PERF-IOS §8 Track C), the sim and the draw stop while
 *   the element is off screen or the tab is hidden, `set()` switches hero or slot on the same GL context, and
 *   `dispose()` frees the context (forceContextLoss), the scene and the listeners.
 */
import type { HeroId } from '../../data/heroes/types';
import { HEROES } from '../../data/heroes';
import type { SimEvent, TrickId } from '../../sim/api';
import { createRenderer, type GameRenderer } from '../../render/renderer';
import { GameView } from '../../render/gameView';
import { SnapBuffer, type ViewFrame } from '../../render/interp';
import { CAMERA_YAW, cameraYaw, setViewTeam, toX, toZ } from '../../render/coords';
import { setSideSwap, setTeam0Dogs, sidesSwapped, RELATION_CSS } from '../../render/palette';
import type { QualityTier } from '../../render/quality';
import { sfx } from '../../audio/sfx';
import { FramePacer, MENU_FPS } from '../../render/perf/pacer';
import { ALLY, DUMMY, ME, SkillSandbox, allyFor, dummyFor, type PreviewSlot } from './skillSandbox';

export type { PreviewSlot } from './skillSandbox';

export interface SkillPreviewOptions {
  /** Render tier; default: low on touch or narrow screens, med otherwise. */
  tier?: QualityTier;
  /** Start playing once loaded (default true). */
  autoplay?: boolean;
  /** Draw HP bars over the three heroes (default true). */
  bars?: boolean;
  /** Play the skill sounds (default false: a looping clip in a menu stays quiet, as in LoL's previews). */
  sound?: boolean;
}

export interface SkillPreviewStats {
  hero: HeroId;
  slot: PreviewSlot;
  /** Casts the sim registered for the previewed slot, over all loops. */
  casts: number;
  loops: number;
  /** Frames drawn, and the mean / worst frame cost (ms: sim + view + draw) over the last 120 frames. */
  frames: number;
  avgMs: number;
  maxMs: number;
  /** Time from mount (or set) to the first drawn frame (ms). */
  firstFrameMs: number;
  playing: boolean;
  tier: QualityTier;
}

export interface SkillPreview {
  /** Resolves when the heroes' move sets and skill FX are loaded and the first frame is drawn. */
  readonly ready: Promise<void>;
  readonly canvas: HTMLCanvasElement;
  play(): void;
  stop(): void;
  /** Switch to another hero or slot on the same canvas (restarts the loop). */
  set(hero: HeroId, slot: PreviewSlot): Promise<void>;
  /** Tools and tests: advance `seconds` by hand in 1/30 s frames (while stopped) and draw. */
  advance(seconds: number): void;
  stats(): SkillPreviewStats;
  dispose(): void;
}

const TICK_S = 1 / 30;
/**
 * PERF-IOS §8 Track C: the clip draws at the menus' rate through the frame pacer (it ran at every vsync: 10.7M
 * triangles a second, as many as a match), and its HP bars canvas is capped at this DPR.
 */
export const PREVIEW_FPS = MENU_FPS;
export const PREVIEW_BARS_DPR = 1.5;
const TRICKS: TrickId[] = ['pounce', 'pounce', 'pounce', 'pounce', 'pounce', 'pounce'];

/** Low on a phone (touch or a narrow viewport), med elsewhere: the preview is a small extra canvas. */
export function previewTier(): QualityTier {
  if (typeof window === 'undefined') return 'low';
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch || Math.min(window.innerWidth, window.innerHeight) < 600 ? 'low' : 'med';
}

/** Camera framing (m): the heroes' span sets the distance; the view looks down at ~40° from the south. */
export function framing(minX: number, maxX: number, cz: number, aspect: number): { x: number; y: number; z: number; tx: number; ty: number; tz: number } {
  const span = Math.max(9, maxX - minX + 7);
  // a narrow (portrait) box needs more distance for the same width
  const d = (span * 1.25) / Math.min(1.6, Math.max(0.7, aspect));
  const cx = (minX + maxX) / 2;
  return { x: cx, y: d * 0.78, z: cz + d * 0.8, tx: cx, ty: 0.8, tz: cz - 1.2 };
}

export function mountSkillPreview(el: HTMLElement, hero: HeroId, slot: PreviewSlot, opts: SkillPreviewOptions = {}): SkillPreview {
  const tier = opts.tier ?? previewTier();
  const t0 = performance.now();
  // the palette and view-yaw globals the match also sets: restored on dispose
  const prevSwap = sidesSwapped();
  const prevView = Math.abs(cameraYaw() - CAMERA_YAW) > 1e-6 ? 1 : 0;

  const host = document.createElement('div');
  host.className = 'pl-skill-preview';
  host.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;contain:strict';
  el.appendChild(host);
  const gr: GameRenderer = createRenderer(host, tier);
  const canvas = gr.renderer.domElement;
  canvas.id = '';
  canvas.className = 'pl-skill-preview-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  canvas.setAttribute('aria-hidden', 'true');
  const ui = document.createElement('div');
  ui.className = 'pl-skill-preview-ui';
  ui.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  host.appendChild(ui);
  // only the damage and heal numbers show in the box: the match's rail notes (the ult banner), screen flashes, the punch
  // vignette and the lifecycle overlays are sized for a full screen
  const css = document.createElement('style');
  css.textContent = '.pl-skill-preview-ui > :not(.pl-pops){display:none !important}';
  host.appendChild(css);
  const bars = opts.bars === false ? null : document.createElement('canvas');
  if (bars) {
    bars.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    host.appendChild(bars);
  }
  gr.resize();
  const view = new GameView(gr, ui);
  view.juice.shakeScale = 0.5;
  // PERF-IOS §8 Track C: no DOM damage numbers in the box. Their pool sits in the page's full-screen layer, under the
  // browser panel (never seen, 138 style writes a second); without its DOM the pool still counts but writes nothing
  view.effects.numbers.dispose();
  const buffer = new SnapBuffer();
  view.peek = (h, out) => buffer.peekEvents(h, out);

  let sb = new SkillSandbox(hero, slot);
  let raf = 0;
  let wantPlay = opts.autoplay !== false;
  let onScreen = true;
  let disposed = false;
  let loaded = false;
  let acc = 0;
  let last = 0;
  let frames = 0;
  let firstFrameMs = -1;
  let setAt = t0;
  const costs: number[] = [];
  const events: SimEvent[] = [];
  const cam = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, init: false };
  let frame: ViewFrame | null = null;
  let totalCasts = 0;
  let totalLoops = 0;

  const applySides = (h: HeroId): void => {
    view.setTeam(ME, 0, TRICKS);
    view.setSpecies(HEROES[h].side === 'dog');
  };
  applySides(hero);

  /** Fresh loop: the buffer and the director forget the last one, so nothing slides from its end to the start. */
  const restartView = (): void => {
    buffer.reset();
    view.director.reset();
    acc = 0;
  };

  const pushTick = (): void => {
    if (sb.tick >= sb.scenario.loop) {
      totalCasts += sb.casts;
      totalLoops++;
      restartView();
    }
    const f = sb.next();
    buffer.push(f.snap);
    buffer.pushEvents(f.snap.events);
  };

  gr.place = (camera) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let cz = toZ(30000);
    for (const e of frame?.entities ?? []) {
      if (e.kind !== 'hero' || (e.id !== ME && e.id !== DUMMY && e.id !== ALLY)) continue;
      const x = toX(e.fx);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      if (e.id === ME) cz = toZ(e.fy);
    }
    if (!Number.isFinite(minX)) return;
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const f = framing(minX, maxX, toZ(30000) * 0.5 + cz * 0.5, w / h);
    const k = cam.init ? 0.12 : 1;
    cam.init = true;
    cam.x += (f.x - cam.x) * k;
    cam.y += (f.y - cam.y) * k;
    cam.z += (f.z - cam.z) * k;
    cam.tx += (f.tx - cam.tx) * k;
    cam.ty += (f.ty - cam.ty) * k;
    cam.tz += (f.tz - cam.tz) * k;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    camera.aspect = w / h;
  };

  const drawBars = (): void => {
    if (!bars || !frame) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = Math.min(PREVIEW_BARS_DPR, window.devicePixelRatio || 1);
    if (bars.width !== Math.round(w * dpr) || bars.height !== Math.round(h * dpr)) {
      bars.width = Math.round(w * dpr);
      bars.height = Math.round(h * dpr);
    }
    const g = bars.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const bw = Math.max(34, Math.min(64, w * 0.11));
    for (const e of frame.entities) {
      if (e.kind !== 'hero' || (e.id !== ME && e.id !== DUMMY && e.id !== ALLY) || e.state === 'dead') continue;
      const r = view.heroes.rigOf(e.id);
      if (!r || !r.visible) continue;
      v.set(r.pos.x, r.pos.y + 2.6, r.pos.z).project(gr.camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * w - bw / 2;
      const y = (-v.y * 0.5 + 0.5) * h;
      const hp = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
      const sh = Math.max(0, Math.min(1 - hp, e.shield / Math.max(1, e.maxHp)));
      g.fillStyle = 'rgba(20,12,22,0.75)';
      g.fillRect(x - 1, y - 1, bw + 2, 7);
      g.fillStyle = e.id === ME ? RELATION_CSS.self : e.team === 0 ? RELATION_CSS.ally : RELATION_CSS.enemy;
      g.fillRect(x, y, bw * hp, 5);
      if (sh > 0) {
        g.fillStyle = '#f4f1ea';
        g.fillRect(x + bw * hp, y, bw * sh, 5);
      }
    }
  };
  // reused projection scratch (three's Vector3 via the rig's own position type)
  const v = gr.camera.position.clone();

  /**
   * PERF-IOS §8 Track C: the sandbox's other heroes stand far outside the box (its sim needs every slot) but a hero
   * mesh is never frustum-culled: they were drawn every frame (body, hull, x-ray). Only the clip's three are drawn.
   */
  const hideExtras = (): void => {
    for (const e of frame?.entities ?? []) {
      if (e.kind !== 'hero' || e.id === ME || e.id === DUMMY || e.id === ALLY) continue;
      const r = view.heroes.rigOf(e.id);
      if (r) r.ch.object.visible = false;
    }
  };

  const quiet = opts.sound !== true;
  // the GameView plays its cues on the shared sfx bus; a quiet preview holds the bus for this frame only (synchronous,
  // a counter: the mute, the volumes and the sfx methods are never touched, so nothing can be left muted)
  const mute = (): (() => void) => sfx.hold();

  const frameOnce = (dt: number): void => {
    const unmute = quiet ? mute() : null;
    try {
      frameBody(dt);
    } finally {
      unmute?.();
    }
  };

  const frameBody = (dt: number): void => {
    const c0 = performance.now();
    acc += dt;
    let n = 0;
    while (acc >= TICK_S && n < 4) {
      acc -= TICK_S;
      pushTick();
      n++;
    }
    if (n === 4) acc = 0;
    const scale = view.juice.timeScale(dt);
    frame = buffer.advance(dt, scale);
    events.length = 0;
    for (const ev of buffer.takeEvents(events)) view.effects.handle(ev);
    view.update(frame, dt);
    hideExtras();
    gr.render();
    drawBars();
    frames++;
    if (firstFrameMs < 0) firstFrameMs = performance.now() - setAt;
    costs.push(performance.now() - c0);
    if (costs.length > 120) costs.shift();
  };

  const running = (): boolean => wantPlay && onScreen && loaded && !disposed && !(typeof document !== 'undefined' && document.hidden);

  const pacer = new FramePacer();
  const loop = (now: number): void => {
    raf = 0;
    if (!running()) return;
    raf = requestAnimationFrame(loop);
    if (!pacer.due(now, PREVIEW_FPS)) return;
    // the real time since the last drawn frame: the clip plays at its speed whatever the draw rate
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / PREVIEW_FPS;
    last = now;
    frameOnce(dt);
  };
  const kick = (): void => {
    if (raf || !running()) return;
    last = 0;
    pacer.reset();
    raf = requestAnimationFrame(loop);
  };
  const halt = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const onVis = (): void => (document.hidden ? halt() : kick());
  document.addEventListener('visibilitychange', onVis);
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((list) => {
          onScreen = list.some((e) => e.isIntersecting);
          if (onScreen) kick();
          else halt();
        })
      : null;
  io?.observe(host);
  const ro =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          gr.resize();
        })
      : null;
  ro?.observe(host);

  const load = async (h: HeroId): Promise<void> => {
    await view.loadAnim([h, allyFor(h), dummyFor(h)]);
    if (disposed) return;
    loaded = true;
    // the first frame now (also when paused), so the box never shows an empty canvas
    pushTick();
    frameOnce(1 / 60);
    kick();
  };

  let ready = load(hero);

  const api: SkillPreview = {
    get ready() {
      return ready;
    },
    canvas,
    play() {
      wantPlay = true;
      kick();
    },
    stop() {
      wantPlay = false;
      halt();
    },
    set(h: HeroId, s: PreviewSlot) {
      if (disposed) return Promise.resolve();
      halt();
      const same = h === sb.hero;
      totalCasts = 0;
      totalLoops = 0;
      sb = new SkillSandbox(h, s);
      setAt = performance.now();
      firstFrameMs = -1;
      cam.init = false;
      restartView();
      applySides(h);
      if (same) {
        pushTick();
        frameOnce(1 / 60);
        kick();
        ready = Promise.resolve();
      } else {
        loaded = false;
        ready = load(h);
      }
      return ready;
    },
    advance(seconds: number) {
      if (disposed || !loaded) return;
      for (let k = 0; k < Math.max(1, Math.round(seconds * 30)); k++) frameOnce(TICK_S);
    },
    stats() {
      let sum = 0;
      let max = 0;
      for (const c of costs) {
        sum += c;
        max = Math.max(max, c);
      }
      return {
        hero: sb.hero,
        slot: sb.slot,
        casts: totalCasts + sb.casts,
        loops: totalLoops,
        frames,
        avgMs: costs.length ? sum / costs.length : 0,
        maxMs: max,
        firstFrameMs,
        playing: raf !== 0,
        tier,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      halt();
      document.removeEventListener('visibilitychange', onVis);
      io?.disconnect();
      ro?.disconnect();
      view.dispose();
      gr.place = null;
      gr.renderer.forceContextLoss();
      gr.dispose();
      host.remove();
      // the match's globals back as they were (they are set again by the next match anyway)
      setViewTeam(prevView);
      setSideSwap(prevSwap);
      setTeam0Dogs(prevSwap !== (prevView === 1));
    },
  };
  return api;
}
