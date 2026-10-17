/**
 * The game renderer (GDD 11): one WebGL context, the whole-room portrait camera, the cozy room, props, the cat,
 * the humans (persona, posture, the Napper, the boss pair), vision cones (human, mirror, webcam), debris, ghosts,
 * the Pink Paw accomplice, cameo spectators and the Club fridge wall, the Room Maker overlay and the clip camera.
 * It only reads SimState (never writes it) and interpolates between ticks with `alpha`. Visual time is
 * `tick + alpha` and every animation integrates with the tick delta between frames, so the clip pass (same ticks,
 * same deltas) redraws a run identically. Budget: ≤ 80 draw calls, 1 hemisphere + 1 directional light, blob
 * shadows on low/mid, one 1024 shadow map on high. The world's moving parts (Roomba, puddles, cloth, tree...) live
 * in `world-dynamics.ts` (W1-RENDER-WORLD), created and driven from here.
 */
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  HemisphereLight,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
  WebGLRenderer,
  PCFShadowMap,
  ACESFilmicToneMapping,
  NoToneMapping,
} from 'three';
import {
  CatAct,
  CELL_M,
  DEFAULT_CAT,
  DIR_DX,
  DIR_DZ,
  JUMP_TICKS,
  GRAB_TICKS,
  NOISE,
  SWAT_TICKS,
  SUSPICION_MAX,
  HumanSt,
  catActGainsSuspicion,
  PropSt,
  propKind,
  type AccompliceView,
  type CameoBundle,
  type CameoEntry,
  type CatSpec,
  type ClipShot,
  type EditorOverlay,
  type FaceDecal,
  type Level,
  type PlayableRoom,
  type RenderLayout,
  type RenderOptions,
  type Renderer,
  type SimEvent,
  type SimState,
} from '../types';
import { applyPose, editorPose, portraitPose, portraitShift, portraitShiftLimit, PORTRAIT_ASPECT, roomPose, streamerPose, type CameraPose } from './camera';
import { CLIP_FOV, CLOSEUP_DIR, FOLLOW_MIN_CAT_DIST, FOLLOW_PUSH_FOV, clipPose, humanCutPose, twoShotPose, unoccludedPose } from './clip-camera';
import { buildCatRig, disposeCatRig, poseCat, setCatGhost, type CatRig } from './cat-rig';
import { ContextLossWatcher } from './context-loss';
import { decalTexture } from './face-decal-material';
import { HumanView, scoopPhase } from './human-rig';
import { BlobShadows, Bubble, ImpactFlash, LookTimerRing, SuspicionRing, labelTexture } from './overlays';
import { OUTLINE_UNIFORMS } from './cat-outline';
import { closeUpPose } from './clip-camera';
import { FtueArrow } from './ftue-arrow';
import { frameableMess } from '../sim';

/** The first heist's paw trail shows this long (10 s). */
export const FTUE_TRAIL_TICKS = 300;
/** QA round 3: still no points this far into a run: the paw trail comes back to the nearest live target (20 s). */
export const ZERO_SCORE_TRAIL_TICK = 600;
import { PAL } from './palette';
import { PropsView, puddleColor, shardColors, type PropFx } from './props-view';
import { DprGovernor, defaultTier, detectDevice, startDpr, type Tier } from './quality';
import { buildRoom, type RoomView } from './room-view';
import { Shards } from './shards';
import { angleDelta, cellX, cellZ, clamp01, damp, facingYaw, lerpAngle, levelY } from './space';
import { VisionCone } from './vision-cone';
import { createWorldDynamics, type WorldDynamics } from './world-dynamics';
import { ExtraCones } from './actors/extra-cones';
import { AccompliceActor } from './actors/accomplice';
import { CameoViews } from './actors/cameos';
import { EditorOverlayView } from './actors/editor-overlay';
import { NameLabel, TrailFx, Zzz } from './actors/fx';
import { clientToNdc, edgeArrow, ndcRay, pickHeightmap, projectCell } from './actors/screen';
import { copyCanvas, registerStillHost, unregisterStillHost, type StillHost } from './actors/stills';

interface CatVis {
  rig: CatRig;
  pos: Vector3;
  yaw: number;
  phase: number;
  loaf: number;
  sit: number;
  init: boolean;
}

/** Internal extras the clip pass sets (not part of the frozen Renderer interface). */
export interface ClipExtras {
  blink: boolean;
  /** Roomba clip format: the Roomba stays in the follow shot. */
  roomba?: boolean;
  /** Held clip frames (opener, tail): a visual-only clock so the cat keeps breathing. */
  poseT?: number;
}

/** Per-human overlays (bubble, LOOK timer ring, edge arrow). */
interface HumanHud {
  bubble: Bubble;
  lookRing: LookTimerRing;
  arrow: Sprite;
  arrowMat: SpriteMaterial;
}

const MAX_GHOSTS = 4;
/** How far (m) the cat sinks into a box so only the ears show. */
export const IN_BOX_SINK = 0.36;

function arrowTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    // a chunky arrow pointing right (+x) with a little head icon
    g.fillStyle = 'rgba(43,29,46,0.85)';
    g.beginPath();
    g.arc(52, 64, 40, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd166';
    g.strokeStyle = '#2b1d2e';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(84, 30);
    g.lineTo(124, 64);
    g.lineTo(84, 98);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = '#f2c4a0';
    g.beginPath();
    g.arc(52, 58, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a3b2e';
    g.fillRect(34, 38, 36, 10);
    g.fillStyle = '#ff4d4d';
    g.beginPath();
    g.arc(52, 92, 6, 0, Math.PI * 2);
    g.fill();
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  } catch {
    return null;
  }
}


export class GameRenderer implements Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(48, 9 / 16, 0.05, 60);
  readonly tier: Tier;
  private readonly reduceMotion: boolean;
  private readonly governor: DprGovernor;
  private readonly watcher: ContextLossWatcher;
  private readonly mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private hemi = new HemisphereLight(0xfff0dc, 0x8a6a6e, 1.9);
  private sun = new DirectionalLight(0xffe0b0, 2.1);
  private play: PlayableRoom | null = null;
  private room: RoomView | null = null;
  private props: PropsView | null = null;
  private dyn: WorldDynamics | null = null;
  private cat: CatVis | null = null;
  private ghosts: CatVis[] = [];
  private ghostSpecs: CatSpec[] = [];
  private ghostStates: SimState[] = [];
  private ghostLabels: NameLabel[] = [];
  private humans: HumanView[] = [];
  private huds: HumanHud[] = [];
  private cone: VisionCone | null = null;
  private extraCones: ExtraCones | null = null;
  private shards = new Shards();
  private blobs = new BlobShadows(2 + 2 + MAX_GHOSTS);
  private suspRing = new SuspicionRing();
  /** Round 3: render tick of the last refused jump ('cantReach'): the cat bumps the edge. -1 none. */
  private bumpT = -1;
  /** Smoothed head turn toward the camera while the player's cat stands still (render only). */
  private camHead = 0;
  /** Red "!" over the player's cat when the human spots it (seen 0 → 1). */
  private catAlert = new Bubble();
  private seenT = -1;
  private lastSeen = 0;
  /** White flash at a break point (4 ticks). */
  private impact = new ImpactFlash();
  /** "YOU" over the player's cat in dare runs (ghosts on screen). */
  private youMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
  private you = new Sprite(this.youMat);
  private youTex: Texture | null = null;
  /** Crash cam (live only): a 1.12× push toward the last break, in render ticks. */
  private crashT = -1;
  private crashPos = new Vector3();
  /** Live camera: the pose for the current aspect, and (phone portrait) its eased x slide toward the cat. */
  private basePose: CameraPose | null = null;
  private portrait = false;
  private camX = 0;
  private camXInit = false;
  /** Cream ring under the player's cat (readability on the patterned rug). */
  private catRing: Mesh;
  /** QA round 3: a square on the floor around the Roomba (its 2-cell framing reach) while a fresh mess sits in it. */
  private frameRing: Mesh;
  private arrow = new FtueArrow();
  private ftueArrowUntil = -1;
  /** Crash juice (render only): translational shake and FOV punch, both in ticks left. */
  private shakeT = 0;
  private shakeAmp = 0;
  private punchT = 0;
  private shakeSeed = 0;
  /** Run intro: 0..1 progress (close-up → live), null when off. */
  private intro: number | null = null;
  private lastState: SimState | null = null;
  private livePose: CameraPose | null = null;
  private poseKey = '';
  private size = { w: 1, h: 1 };
  private clipTarget: { w: number; h: number } | null = null;
  private hud = true;
  private clipShot: ClipShot | null = null;
  private clipExtras: ClipExtras = { blink: false };
  private clipFocus: Vector3 | null = null;
  private clipDist = 0;
  /** Clip pass: the follow pose frozen while the focus prop falls and lands (round 3). */
  private clipLock: CameraPose | null = null;
  private lastShotKind = '';
  private lastT = -1;
  private lastReal = 0;
  private kick = 0;
  private heartTick = -1;
  private resizeObs: ResizeObserver | null = null;
  private lostCbs: ((lost: boolean) => void)[] = [];
  private disposed = false;
  /** Bumped by every load(); an older load that resumes after an await sees a newer generation and stops. */
  private loadGen = 0;
  /** The shader compile of the running load(); a newer load waits for it (unloading mid-compile crashed three). */
  private compiling: Promise<void> | null = null;
  // ----- FULL build
  private layout: RenderLayout = 'portrait';
  private trail = new TrailFx();
  private trailId = 0;
  private zzz = new Zzz();
  private accomplice: AccompliceActor | null = null;
  private accView: AccompliceView | null = null;
  private cameos: CameoViews | null = null;
  private cameoBundle: CameoBundle | null = null;
  private cameoFaces: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement> | undefined;
  private editor: EditorOverlayView | null = null;
  private editorState: EditorOverlay | null = null;
  private arrowTex: Texture | null = null;
  private readonly stillHost: StillHost;

  constructor(
    private readonly container: HTMLElement,
    opts: RenderOptions = {},
  ) {
    const dev = detectDevice();
    this.tier = defaultTier(dev, opts.quality);
    this.reduceMotion = !!opts.reduceMotion;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    this.canvas.setAttribute('aria-label', 'Bad Cat Daily kitchen');
    container.appendChild(this.canvas);
    this.gl = new WebGLRenderer({
      canvas: this.canvas,
      antialias: this.tier !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    });
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = this.tier === 'high' ? ACESFilmicToneMapping : NoToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.governor = new DprGovernor(startDpr(dev), dev.dpr);
    this.gl.setPixelRatio(this.governor.dpr);
    this.gl.shadowMap.enabled = this.tier === 'high';
    this.gl.shadowMap.type = PCFShadowMap;
    this.watcher = new ContextLossWatcher(this.canvas);
    this.watcher.on((lost) => {
      if (!lost) this.governor.resetWindow();
      for (const cb of this.lostCbs.slice()) cb(lost);
    });

    this.scene.background = new Color(PAL.bg);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.shards.mesh, this.shards.puddles, this.blobs.mesh, this.suspRing.sprite);
    const rg = new RingGeometry(0.155, 0.21, 32);
    rg.rotateX(-Math.PI / 2);
    this.catRing = new Mesh(
      rg,
      new MeshBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    // the Roomba's framing reach: Chebyshev 2 cells = a 5 × 5 square (a 4-segment ring turned 45°)
    const fg = new RingGeometry(2.5 * 0.4 * Math.SQRT2 - 0.06, 2.5 * 0.4 * Math.SQRT2, 4, 1, Math.PI / 4);
    fg.rotateX(-Math.PI / 2);
    this.frameRing = new Mesh(fg, new MeshBasicMaterial({ color: 0x7bd389, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.frameRing.name = 'roomba-frame-ring';
    this.frameRing.renderOrder = 1;
    this.frameRing.frustumCulled = false;
    this.frameRing.visible = false;
    this.scene.add(this.frameRing);
    this.catRing.name = 'cat-ring';
    this.catRing.renderOrder = 1;
    this.catRing.frustumCulled = false;
    this.catRing.visible = false;
    this.scene.add(this.catRing, this.arrow.mesh, this.catAlert.sprite, this.catAlert.label, this.impact.sprite, this.you, this.trail.mesh, ...this.zzz.sprites);
    this.you.name = 'you-marker';
    this.you.renderOrder = 10;
    this.you.visible = false;
    this.you.center.set(0.5, 0);
    this.sun.position.set(-1.6, 4.2, -3.2);
    this.sun.target.position.set(0.3, 0, 0.6);
    if (this.tier === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const sc = this.sun.shadow.camera;
      sc.left = -3.4;
      sc.right = 3.4;
      sc.top = 3.4;
      sc.bottom = -3.4;
      sc.near = 0.5;
      sc.far = 12;
      this.sun.shadow.bias = -0.0015;
      this.sun.shadow.normalBias = 0.02;
    }
    this.fitContainer();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => this.fitContainer());
      this.resizeObs.observe(container);
    } else if (typeof window !== 'undefined') window.addEventListener('resize', this.onWinResize);
    this.stillHost = { drawStill: (scene, cam, w, h, clear) => this.drawStill(scene, cam, w, h, clear) };
    registerStillHost(this.stillHost);
    try {
      if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__BADCAT_RENDER__ = this;
    } catch {
      /* no import.meta.env outside vite */
    }
  }

  private readonly onWinResize = () => this.fitContainer();

  /** Live mode: size the drawing buffer to the container (CSS keeps the canvas at 100%). */
  private fitContainer(): void {
    if (this.clipTarget || this.disposed) return;
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width || this.container.clientWidth || 1));
    const h = Math.max(1, Math.round(r.height || this.container.clientHeight || 1));
    this.applySize(w, h, this.governor.dpr);
  }

  private applySize(w: number, h: number, dpr: number): void {
    this.size = { w, h };
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.poseKey = '';
  }

  async load(play: PlayableRoom, cats: CatSpec[], faces?: Map<number, FaceDecal>): Promise<void> {
    const gen = ++this.loadGen;
    // Two overlapping loads: three's compileAsync polls the programs of the first scene, so disposing its materials
    // now throws "reading 'isReady'". Wait for that compile to settle; a load superseded meanwhile stops here.
    while (this.compiling) {
      try {
        await this.compiling;
      } catch {
        /* the older load reports its own failure */
      }
      if (gen !== this.loadGen || this.disposed) return;
    }
    this.unloadScene();
    this.play = play;
    this.room = buildRoom(play, this.mat);
    this.shards.setBounds((play.shell.width * CELL_M) / 2, (play.shell.depth * CELL_M) / 2);
    this.scene.add(this.room.group);
    this.props = new PropsView(play, this.mat);
    this.scene.add(this.props.group);
    this.dyn = createWorldDynamics(play, this.mat);
    this.scene.add(this.dyn.group);
    const W = play.shell.width;
    const D = play.shell.depth;
    this.cone = new VisionCone(W * D);
    this.scene.add(this.cone.mesh, this.cone.dim);
    if ((play.shell.mirror && play.routine.mirror) || (play.shell.webcam && play.routine.onCamera)) {
      this.extraCones = new ExtraCones(play, W * D);
      this.scene.add(...this.extraCones.objects);
    }
    const nHumans = play.routine2 ? 2 : 1;
    for (let i = 0; i < nHumans; i++) {
      const hv = new HumanView(play, this.mat, i);
      this.humans.push(hv);
      this.scene.add(hv.rig.root);
      const hud = this.makeHud();
      this.huds.push(hud);
      this.scene.add(hud.bubble.sprite, hud.bubble.label, hud.lookRing.sprite, hud.arrow);
    }
    if ((play.shell.spectatorSlots?.length ?? 0) > 0 || play.shell.fridgeWall) {
      this.cameos = new CameoViews(play.shell);
      this.scene.add(this.cameos.group);
      this.cameos.set(this.cameoBundle, this.cameoFaces);
    }
    this.editor = new EditorOverlayView(play);
    this.scene.add(this.editor.group);
    // the player's cat (+ face decal)
    let decal = null;
    const face = faces?.get(0);
    if (face?.texture && typeof createImageBitmap !== 'undefined') {
      try {
        const bmp = await createImageBitmap(face.texture);
        decal = decalTexture(bmp);
        bmp.close?.();
      } catch {
        decal = null;
      }
    }
    if (gen !== this.loadGen || this.disposed) {
      // a newer load replaced this scene while the bitmap decoded: building the cat now would leave a stray rig
      (decal as { dispose?: () => void } | null)?.dispose?.();
      return;
    }
    const rig = buildCatRig(cats[0] ?? DEFAULT_CAT, decal);
    this.cat = { rig, pos: new Vector3(), yaw: 0, phase: 0, loaf: 0, sit: 0, init: false };
    this.scene.add(rig.root);
    this.ghostSpecs = cats.slice(1, 1 + MAX_GHOSTS);
    this.ghostLabels = this.ghostSpecs.map((g) => {
      const l = new NameLabel();
      l.set(g.name ? `${g.name}` : 'ghost');
      this.scene.add(l.sprite);
      return l;
    });
    if (this.accView) this.applyAccomplice(this.accView);
    this.setShadowFlags();
    this.resetVisuals();
    // place the actors at their spawn for the first (warm-up) frame behind the briefing card
    rig.root.position.set(cellX(play.room.spawn.x, W), levelY(play.shell.levels[play.room.spawn.z * W + play.room.spawn.x] ?? 0), cellZ(play.room.spawn.z, D));
    rig.root.rotation.y = Math.PI * 0.85;
    poseCat(rig, { T: 0, act: 0, actP: 0, moving: 0, phase: 0, blink: false, loaf: 0 });
    for (const hv of this.humans) {
      hv.spotWorld(hv.rig.root.position);
      hv.rig.root.rotation.y = hv.busyYaw;
    }
    this.camXInit = false;
    this.poseKey = '';
    this.updateLiveCamera(cellX(play.room.spawn.x, W), 0);
    // Compile every program during the briefing (blocks where KHR_parallel_shader_compile is missing). Objects that
    // only show mid-run (cone, dim, bubbles with their textures, the "!" and impact sprites, the suspicion ring, the
    // see-through human) are bound and shown for the compile, so the first turn and the first event never hitch.
    const restore = this.prewarmShow();
    try {
      const anyGl = this.gl as unknown as { compileAsync?: (s: Scene, c: PerspectiveCamera) => Promise<unknown> };
      const compile = async (): Promise<void> => {
        if (anyGl.compileAsync) await anyGl.compileAsync(this.scene, this.camera);
        else this.gl.compile(this.scene, this.camera);
      };
      // compile() only creates the programs; three checks the link (getProgramInfoLog) on first use, which blocks.
      // One hidden draw with everything visible does that now, behind the briefing card, instead of mid-run.
      const draw = (): void => {
        if (gen === this.loadGen && !this.disposed && !this.watcher.lost) this.gl.render(this.scene, this.camera);
      };
      const warm = async (): Promise<void> => {
        await compile();
        draw();
        if (gen === this.loadGen && !this.disposed && this.humans[0]) {
          // the human turns see-through when he hides the cat: that is a second program variant
          for (const hv of this.humans) hv.setFade(0.5, 1);
          await compile();
          draw();
        }
      };
      const p = warm();
      this.compiling = p;
      try {
        await p;
      } finally {
        if (this.compiling === p) this.compiling = null;
      }
    } catch {
      /* compile failures surface on the first render */
    } finally {
      restore();
      for (const hv of this.humans) hv.setFade(1, 1);
    }
    if (gen !== this.loadGen || this.disposed) return;
    if (!this.watcher.lost) this.gl.render(this.scene, this.camera);
  }

  private makeHud(): HumanHud {
    const arrowMat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false });
    const arrow = new Sprite(arrowMat);
    arrow.name = 'human-edge-arrow';
    arrow.renderOrder = 11;
    arrow.visible = false;
    return { bubble: new Bubble(), lookRing: new LookTimerRing(), arrow, arrowMat };
  }

  /** Bind the lazily drawn textures, upload them, and make every mid-run object visible. Returns the undo. */
  private prewarmShow(): () => void {
    const texs: Texture[] = [...this.catAlert.prewarm(), ...this.zzz.prewarm()];
    for (const h of this.huds) {
      texs.push(...h.bubble.prewarm());
      const lr = h.lookRing.prewarm();
      if (lr) texs.push(lr);
    }
    const ring = this.suspRing.prewarm();
    if (ring) texs.push(ring);
    const fl = this.impact.prewarm();
    if (fl) texs.push(fl);
    if (!this.youTex) {
      this.youTex = labelTexture('YOU', '#fff3dc');
      if (this.youTex) {
        this.youMat.map = this.youTex;
        this.youMat.needsUpdate = true;
        texs.push(this.youTex);
      }
    }
    if (!this.arrowTex) this.arrowTex = this.makeArrowTexture();
    if (this.arrowTex) {
      texs.push(this.arrowTex);
      for (const h of this.huds) {
        h.arrowMat.map = this.arrowTex;
        h.arrowMat.needsUpdate = true;
      }
    }
    const rec = this.extraCones?.prewarm();
    if (rec) texs.push(rec);
    if (this.accomplice) texs.push(...this.accomplice.prewarm());
    for (const t of texs) {
      try {
        this.gl.initTexture(t);
      } catch {
        /* uploaded on first use */
      }
    }
    this.cone?.prewarm(true);
    const objs: { visible: boolean }[] = [this.catAlert.sprite, this.catAlert.label, this.suspRing.sprite, this.impact.sprite, this.you, this.catRing, this.arrow.mesh, ...this.zzz.sprites];
    for (const h of this.huds) objs.push(h.bubble.sprite, h.bubble.label, h.lookRing.sprite, h.arrow);
    if (this.extraCones) objs.push(this.extraCones.mirror.mesh, this.extraCones.cam.mesh, this.extraCones.rec);
    const prev = objs.map((o) => o.visible);
    for (const o of objs) o.visible = true;
    return () => {
      objs.forEach((o, i) => (o.visible = prev[i]));
      this.cone?.prewarm(false);
    };
  }

  private makeArrowTexture(): Texture | null {
    return arrowTexture();
  }

  private setShadowFlags(): void {
    const on = this.tier === 'high';
    this.blobs.mesh.visible = !on;
    this.props?.setShadows(on);
  }

  private unloadScene(): void {
    if (this.room) {
      this.scene.remove(this.room.group);
      this.room.dispose();
      this.room = null;
    }
    if (this.props) {
      this.scene.remove(this.props.group);
      this.props.dispose();
      this.props = null;
    }
    if (this.dyn) {
      this.scene.remove(this.dyn.group);
      this.dyn.dispose();
      this.dyn = null;
    }
    if (this.cone) {
      this.scene.remove(this.cone.mesh, this.cone.dim);
      this.cone.dispose();
      this.cone = null;
    }
    if (this.extraCones) {
      this.scene.remove(...this.extraCones.objects);
      this.extraCones.dispose();
      this.extraCones = null;
    }
    for (const h of this.humans) {
      this.scene.remove(h.rig.root);
      h.dispose();
    }
    this.humans = [];
    for (const h of this.huds) {
      this.scene.remove(h.bubble.sprite, h.bubble.label, h.lookRing.sprite, h.arrow);
      h.bubble.dispose();
      h.lookRing.dispose();
      h.arrowMat.dispose();
    }
    this.huds = [];
    if (this.cat) {
      this.scene.remove(this.cat.rig.root);
      disposeCatRig(this.cat.rig);
      this.cat = null;
    }
    for (const g of this.ghosts) {
      this.scene.remove(g.rig.root);
      disposeCatRig(g.rig);
    }
    this.ghosts = [];
    for (const l of this.ghostLabels) {
      this.scene.remove(l.sprite);
      l.dispose();
    }
    this.ghostLabels = [];
    if (this.accomplice) {
      this.scene.remove(this.accomplice.rig.root, this.accomplice.bubble, this.accomplice.badge);
      this.accomplice.dispose();
      this.accomplice = null;
    }
    if (this.cameos) {
      this.scene.remove(this.cameos.group);
      this.cameos.dispose();
      this.cameos = null;
    }
    if (this.editor) {
      this.scene.remove(this.editor.group);
      this.editor.dispose();
      this.editor = null;
    }
  }

  /** Forget all render-side animation state (new run, clip pass start/end). */
  resetVisuals(): void {
    this.props?.reset();
    this.shards.reset();
    this.cone?.reset();
    this.extraCones?.reset();
    for (const h of this.huds) {
      h.bubble.reset();
      h.lookRing.reset();
      h.arrow.visible = false;
    }
    this.suspRing.reset();
    this.bumpT = -1;
    this.camHead = 0;
    this.catAlert.reset();
    this.impact.reset();
    this.you.visible = false;
    this.seenT = -1;
    this.lastSeen = 0;
    this.crashT = -1;
    this.camXInit = false;
    this.arrow.hide();
    this.catRing.visible = false;
    this.shakeT = 0;
    this.punchT = 0;
    this.trail.reset();
    for (const h of this.humans) h.reset();
    if (this.cat) this.cat.init = false;
    for (const g of this.ghosts) g.init = false;
    if (this.accomplice) this.accomplice.grantedT = -1;
    this.lastT = -1;
    this.kick = 0;
    this.heartTick = -1;
    this.clipFocus = null;
    this.clipLock = null;
    this.lastShotKind = '';
  }

  setTarget(size: { w: number; h: number; hud: boolean }): void {
    this.hud = size.hud;
    if (!size.hud) {
      // clip pass: exact pixel size, DPR 1, governor frozen, CSS size untouched
      this.clipTarget = { w: size.w, h: size.h };
      this.governor.freeze();
      this.applySize(size.w, size.h, 1);
      this.size = { w: size.w, h: size.h };
    } else {
      this.clipTarget = null;
      this.governor.unfreeze();
      if (size.w > 0 && size.h > 0) this.applySize(size.w, size.h, this.governor.dpr);
      else this.fitContainer();
    }
  }

  /** The clip pass restores this after rendering. */
  currentTarget(): { w: number; h: number; hud: boolean } {
    return { w: 0, h: 0, hud: true };
  }

  setClipShot(shot: ClipShot | null): void {
    this.clipShot = shot;
    // review round 1: the cameo spectators stay out of clips (one crime, one cat; they crowded the frame)
    if (this.cameos) this.cameos.spectators.group.visible = !shot;
  }

  setClipExtras(x: ClipExtras): void {
    this.clipExtras = x;
  }

  get contextEpoch(): number {
    return this.watcher.epoch;
  }

  get contextLost(): boolean {
    return this.watcher.lost;
  }

  setGhosts(states: SimState[]): void {
    this.ghostStates = states.slice(0, MAX_GHOSTS);
    while (this.ghosts.length < this.ghostStates.length) {
      const spec = this.ghostSpecs[this.ghosts.length] ?? DEFAULT_CAT;
      const rig = buildCatRig(spec, null);
      setCatGhost(rig, 0.45);
      this.scene.add(rig.root);
      this.ghosts.push({ rig, pos: new Vector3(), yaw: 0, phase: 0, loaf: 0, sit: 0, init: false });
      if (!this.ghostLabels[this.ghosts.length - 1]) {
        const l = new NameLabel();
        l.set(spec.name || 'ghost');
        this.scene.add(l.sprite);
        this.ghostLabels.push(l);
      }
    }
    for (let i = 0; i < this.ghosts.length; i++) this.ghosts[i].rig.root.visible = i < this.ghostStates.length;
  }

  onContextLost(cb: (lost: boolean) => void): void {
    this.lostCbs.push(cb);
  }

  /** Draw stats for the dev page / e2e (draw calls must stay ≤ 80). */
  stats(): { calls: number; triangles: number; dpr: number; tier: Tier } {
    return { calls: this.gl.info.render.calls, triangles: this.gl.info.render.triangles, dpr: this.gl.getPixelRatio(), tier: this.tier };
  }

  // ---------------------------------------------------------------------------------------------
  // FULL build API
  // ---------------------------------------------------------------------------------------------

  setLayout(layout: RenderLayout): void {
    if (layout === this.layout) return;
    this.layout = layout;
    this.poseKey = '';
    this.camXInit = false;
  }

  setTrail(id: number): void {
    this.trailId = id | 0;
    this.trail.set(this.reduceMotion ? 0 : this.trailId);
  }

  setCameos(bundle: CameoBundle | null, faces?: ReadonlyMap<string, ImageBitmap | HTMLCanvasElement>): void {
    this.cameoBundle = bundle;
    this.cameoFaces = faces;
    this.cameos?.set(bundle, faces);
  }

  /** The cameo cat (spectator or fridge magnet) under a client point, for name tags; null when none. */
  spectatorAt(clientX: number, clientY: number): CameoEntry | null {
    if (!this.cameos || !this.lastState) return null;
    const ndc = clientToNdc(clientX, clientY, this.canvas.getBoundingClientRect());
    const aspect = this.size.w / Math.max(1, this.size.h);
    return this.cameos.spectators.at(this.camera, ndc.x, ndc.y, aspect) ?? this.cameos.fridge.at(this.camera, ndc.x, ndc.y, aspect);
  }

  setAccomplice(a: AccompliceView | null): void {
    this.accView = a;
    if (!a) {
      if (this.accomplice) {
        this.scene.remove(this.accomplice.rig.root, this.accomplice.bubble, this.accomplice.badge);
        this.accomplice.dispose();
        this.accomplice = null;
      }
      return;
    }
    if (this.play) this.applyAccomplice(a);
  }

  private applyAccomplice(a: AccompliceView): void {
    const kind = a.wishProp >= 0 ? (this.play?.room.props[a.wishProp]?.kind ?? 0) : 0;
    if (!this.accomplice) {
      this.accomplice = new AccompliceActor(a);
      this.accomplice.setView(a, kind);
      this.scene.add(this.accomplice.rig.root, this.accomplice.bubble, this.accomplice.badge);
      return;
    }
    const old = this.accomplice.rig.root;
    if (this.accomplice.setView(a, kind)) {
      this.scene.remove(old);
      this.scene.add(this.accomplice.rig.root);
    }
  }

  setEditorOverlay(o: EditorOverlay | null): void {
    this.editorState = o;
    this.applyEditor();
  }

  private applyEditor(): void {
    if (!this.editor || !this.play) return;
    const props = this.lastState?.props ?? this.play.room.props;
    this.editor.set(this.editorState, props);
  }

  pickCell(clientX: number, clientY: number): { x: number; z: number; level: Level } | null {
    if (!this.play) return null;
    const ndc = clientToNdc(clientX, clientY, this.canvas.getBoundingClientRect());
    const { origin, dir } = ndcRay(this.camera, ndc.x, ndc.y);
    const sh = this.play.shell;
    return pickHeightmap(origin, dir, sh.levels, sh.width, sh.depth);
  }

  projectWorld(x: number, z: number, level: number): { x: number; y: number; onScreen: boolean } | null {
    if (!this.play) return null;
    return projectCell(this.camera, x, z, level, this.play.shell.width, this.play.shell.depth);
  }

  /** Screen position (0..1) of human `i`'s head as last drawn (HUD eye, edge arrow), null when unknown. */
  projectHuman(i: number): { x: number; y: number; onScreen: boolean } | null {
    const hv = this.humans[i];
    if (!hv) return null;
    this.camera.updateMatrixWorld(true);
    const v = hv.headTop(new Vector3()).project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2, onScreen: v.z <= 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  }

  /** Still host: borrow this context for one draw (see actors/stills.ts). */
  private drawStill(scene: Scene, cam: PerspectiveCamera, w: number, h: number, clear: number | null): HTMLCanvasElement | null {
    if (this.disposed || this.watcher.lost) return null;
    const gl = this.gl;
    const prevSize = gl.getSize(new Vector2());
    const prevDpr = gl.getPixelRatio();
    const prevClear = gl.getClearColor(new Color());
    const prevAlpha = gl.getClearAlpha();
    const prevRes = OUTLINE_UNIFORMS.uRes.value.clone();
    try {
      gl.setPixelRatio(1);
      gl.setSize(w, h, false);
      gl.setClearColor(clear ?? PAL.bg, 1);
      OUTLINE_UNIFORMS.uRes.value.set(w, h);
      gl.render(scene, cam);
      return copyCanvas(this.canvas, w, h);
    } catch {
      return null;
    } finally {
      gl.setPixelRatio(prevDpr);
      gl.setSize(prevSize.x, prevSize.y, false);
      gl.setClearColor(prevClear, prevAlpha);
      OUTLINE_UNIFORMS.uRes.value.copy(prevRes);
      // redraw the live frame before the task ends, so the page never shows the still
      if (this.lastState && !this.watcher.lost) {
        try {
          gl.render(this.scene, this.camera);
        } catch {
          /* next frame */
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------------------------------------

  frame(s: SimState, alpha: number, events: readonly SimEvent[]): void {
    // render is state-driven (transitions), so a missed event list never drops a break; only the refused jump
    // (no state change at all) is read from the events
    if (this.disposed || this.watcher.lost || !this.play || !this.cat || !this.props || !this.cone) return;
    for (const e of events) if (e.t === 'cantReach') this.bumpT = s.tick + alpha;
    this.lastState = s;
    const a = clamp01(alpha);
    const T = s.ended ? s.tick : s.tick + a;
    let dtT = this.lastT < 0 ? 0 : T - this.lastT;
    if (dtT < 0) {
      this.resetVisuals();
      dtT = 0;
    }
    if (dtT > 30) dtT = 30;
    this.lastT = T;
    const W = s.grid.w;
    const D = s.grid.d;
    const live = !this.clipShot;
    const hudOn = live && this.hud;

    // ---- world dynamics (Roomba, puddles, cloth, tree...) every frame, the clip pass included
    this.dyn?.update(s, alpha, events);

    // ---- cat
    const cv = this.cat;
    this.updateCat(cv, s, a, T, dtT, true);
    // round 3: "spotted" only while the cat moves in the cone; a frozen cat in sight gets a small grey "?"
    const cuddled = s.cat.act === CatAct.CUDDLED;
    const inCone = s.seen === 1 && !cuddled;
    const spottedMoving = inCone && catActGainsSuspicion(s.cat.act);

    // ---- humans (the nearest one scoops the cat on CAUGHT)
    const caughtTicks = cuddled ? s.tick - Math.max(0, s.caughtTick) + a : 0;
    const catRest = new Vector3(cellX(s.cat.x, W), levelY(s.cat.level), cellZ(s.cat.z, D));
    const scooper = cuddled ? this.nearestHuman(s) : -1;
    for (let i = 0; i < this.humans.length; i++) {
      const hs = s.humans[i] ?? s.humans[0];
      if (!hs) continue;
      this.humans[i].update(hs, {
        T,
        alpha: a,
        dtTicks: dtT,
        seen: spottedMoving || (this.seenT >= 0 && T - this.seenT < 20 && inCone),
        scooping: cuddled && i === scooper,
        caughtOther: cuddled && i !== scooper,
        caughtTicks,
        catWorld: catRest,
        w: W,
        d: D,
      });
    }
    if (cuddled && this.humans[scooper]) this.cuddle(cv, s, a, T, this.humans[scooper], catRest);

    // ---- ghosts (M1) with name labels
    for (let i = 0; i < this.ghosts.length && i < this.ghostStates.length; i++) this.updateCat(this.ghosts[i], this.ghostStates[i], a, T, dtT, false);
    // round 3: two ghosts at the spawn drew their tags on top of each other ("EOldiet"): a tag near an earlier one
    // (or the player's "YOU") stacks one line higher
    const placed: Vector3[] = this.you.visible ? [cv.pos.clone().add(new Vector3(0, 0.42, 0))] : [];
    for (let i = 0; i < this.ghostLabels.length; i++) {
      const g = this.ghosts[i];
      const on = !!g && i < this.ghostStates.length && hudOn;
      if (!on) {
        this.ghostLabels[i].update(null);
        continue;
      }
      const at = g.pos.clone().add(new Vector3(0, 0.5, 0));
      for (let guard = 0; guard < 4 && placed.some((q) => Math.hypot(q.x - at.x, q.z - at.z) < 0.45 && Math.abs(q.y - at.y) < 0.1); guard++) at.y += 0.11;
      placed.push(at);
      this.ghostLabels[i].update(at);
    }

    // ---- props
    cv.rig.root.updateMatrixWorld(true);
    const fx = this.props.update(s, T, a, cv.rig.mouth.matrixWorld, this.hud);
    for (const f of fx) {
      this.applyFx(f, s, T);
      // a crash behind his back: he flinches ("!?") but does not turn (render only)
      if (f.kind === 'break' || f.kind === 'spill') {
        for (let i = 0; i < this.humans.length; i++) if (s.humans[i]?.state === HumanSt.BUSY) this.humans[i].flinch(T);
        this.cameos?.spectators.cheer(T);
      }
    }
    this.shards.update(dtT / 30);
    this.impact.update(T);

    // ---- accomplice and cameos
    if (this.accomplice) {
      const v = this.accomplice.view;
      const wp = v.wishProp >= 0 ? this.props.propPosition(v.wishProp, new Vector3()) : null;
      // round 2 (QA): the ribbon and the wish bubble covered the clip's watermark; no world labels in a clip
    this.accomplice.hideLabels = !!this.clipShot;
    if (this.accomplice.update(T, s.wish === 1, wp, W, D)) {
        // the wish is granted: a heart burst over the accomplice
        this.shards.burst(this.accomplice.pos.clone().add(new Vector3(0, 0.35, 0)), -10, {
          count: 14,
          colors: [PAL.heart, 0xffb3c7, 0xff4d8d],
          seed: Math.floor(T) * 131,
          speed: 0.6,
          up: 1.1,
          gravity: -0.05,
          life: 1.6,
          size: 2,
        });
      }
      this.blobs.set(3, this.accomplice.pos.x, this.accomplice.pos.y, this.accomplice.pos.z, 0.34, 0.4, 0);
    } else this.blobs.hide(3);
    this.cameos?.spectators.update(T);

    // ---- cones, bubbles, blobs
    // the cone fades out over 6 ticks once he scoops the cat up
    this.cone.update(s, T, dtT, !cuddled, hudOn);
    this.extraCones?.update(s, T, dtT, live);
    // spotted moving: a red "!" pops over the cat (0 → 1.4 → 1 over 5 ticks) and lingers 2/3 s; frozen in sight:
    // a 60 %-size grey "?" (he can't tell), no flash
    if (spottedMoving && this.lastSeen === 0) this.seenT = T;
    this.lastSeen = spottedMoving ? 1 : 0;
    const alertOn = !cuddled && (spottedMoving || (inCone && this.seenT >= 0 && T - this.seenT < 20));
    const frozenOn = !cuddled && !alertOn && inCone;
    // anchored just above the cat's head so it never sits on the body
    this.catAlert.update(alertOn ? '!' : frozenOn ? '?g' : null, cv.pos.clone().add(new Vector3(0, 0.48, 0)), T, {
      peak: alertOn ? 1.4 : 1.15,
      ticks: 5,
      dx: 0,
      size: alertOn ? 0.85 : 0.85 * 0.6,
    });
    // the shared suspicion meter sits over the human who is turning or looking (the scooper while caught)
    let ringHuman = 0;
    for (let i = 0; i < this.humans.length; i++) {
      const st = s.humans[i]?.state;
      if (st === HumanSt.LOOK || st === HumanSt.TELEGRAPH) {
        ringHuman = i;
        break;
      }
    }
    for (let i = 0; i < this.humans.length; i++) {
      const hv = this.humans[i];
      const h = s.humans[i];
      const hud = this.huds[i];
      if (!h || !hud) continue;
      const top = hv.headTop(new Vector3());
      const hs = h.state;
      // TELEGRAPH: the "hm?" pops in 0.1 s at twice the size (round 3: it was ~20 CSS px)
      const tg = hs === HumanSt.TELEGRAPH && hv.bubble === '?';
      hud.bubble.update(hv.bubble, top, T, tg ? { ticks: 3, labelScale: 2 } : { labelScale: hs === HumanSt.FAKEOUT ? 1 : 0 });
      hud.lookRing.update(h.timer, h.stateTicks, top.clone().add(new Vector3(0, 0.12, 0)), hudOn && hs === HumanSt.LOOK && !cuddled);
      if (i === ringHuman) {
        const pct = (s.suspicion / SUSPICION_MAX) * 100;
        this.suspRing.update(pct, top, hudOn && !cuddled && (pct > 0.5 || hs === HumanSt.TELEGRAPH || hs === HumanSt.LOOK), T);
      }
      // the Napper's Zzz grow with the noise meter
      if (hv.look.napper) this.zzz.update(top.clone().add(new Vector3(0, -0.25, 0)), T, Math.min(1, (s.noise ?? 0) / NOISE.max), cuddled ? 0 : hv.asleep);
    }
    if (!this.humans.some((h) => h.look.napper)) this.zzz.update(new Vector3(), T, 0, 0);
    // cream ring under the player's cat
    const ringOn = hudOn && !cuddled;
    this.catRing.visible = ringOn;
    if (ringOn) this.catRing.position.set(cv.pos.x, levelY(this.surfaceUnder(s, cv.pos)) + 0.008, cv.pos.z);
    // dare runs: "YOU" over the player's cat and a solid ring, so it never reads as one blob with the ghost
    const dare = this.ghostStates.length > 0;
    (this.catRing.material as MeshBasicMaterial).opacity = dare ? 0.95 : 0.6;
    this.you.visible = ringOn && dare && !!this.youTex;
    if (this.you.visible) {
      this.you.position.set(cv.pos.x, cv.pos.y + 0.42 + Math.sin(T * 0.2) * 0.015, cv.pos.z);
      this.you.scale.set(0.075, 0.028, 1);
    }
    // FTUE: a paw trail along the path to the quickest live Must-Wreck target for the first 10 s (round 2; was a
    // straight 4 s arrow), hidden during the intro close-up (its dots ran across the cat's face)
    // QA round 3: any run still at 0 points after 20 s gets the trail back (a pulsing way to the nearest target)
    const stuck = live && s.score === 0 && s.tick >= ZERO_SCORE_TRAIL_TICK && !cuddled;
    if (live && ((this.play.mode === 'ftue' && s.tick < FTUE_TRAIL_TICKS) || stuck) && this.ftueArrowUntil !== 0 && (this.intro === null || this.intro >= 1)) this.arrow.update(s, cv.pos, T);
    else this.arrow.hide();
    // QA round 3: framing the Roomba is taught before it fires: its 2-cell reach shows while a fresh mess sits in it
    const rb = live && s.roomba ? frameableMess(s) : -1;
    this.frameRing.visible = rb >= 0 && !!s.roomba;
    if (this.frameRing.visible && s.roomba) {
      const rp = this.dyn?.roombaPosition(new Vector3());
      this.frameRing.position.set(rp ? rp.x : cellX(s.roomba.x, W), 0.012, rp ? rp.z : cellZ(s.roomba.z, D));
      (this.frameRing.material as MeshBasicMaterial).opacity = this.reduceMotion ? 0.7 : 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(T * 0.25));
    }
    // cosmetic trail (off with Reduce Motion)
    const surf = levelY(this.surfaceUnder(s, cv.pos));
    this.trail.update(cv.pos, s.cat.stepTicks > 0 && s.cat.act === CatAct.JUMP ? cv.pos.y : surf, cv.yaw, T, dtT, !this.reduceMotion && this.trailId > 0 && !cuddled);
    this.blobs.set(0, cv.pos.x, cuddled ? 0 : surf, cv.pos.z, 0.36, 0.42, cv.yaw);
    for (let i = 0; i < 2; i++) {
      const hv = this.humans[i];
      if (hv) {
        const p = hv.rig.root.position;
        this.blobs.set(1 + i, p.x, 0, p.z, 0.7, 0.55, hv.rig.root.rotation.y);
      } else if (i === 1 && !this.accomplice) this.blobs.hide(2);
    }
    if (this.humans.length < 2) this.blobs.hide(2);
    for (let i = 0; i < MAX_GHOSTS; i++) {
      const g = this.ghosts[i];
      if (g && i < this.ghostStates.length) this.blobs.set(4 + i, g.pos.x, g.pos.y, g.pos.z, 0.3, 0.36, g.yaw);
      else this.blobs.hide(4 + i);
    }
    // Room Maker overlay (the props may have moved)
    if (this.editorState) this.applyEditor();

    // ---- camera
    this.kick *= Math.exp(-dtT * 0.3);
    if (this.clipShot) this.updateClipCamera(s, cv, dtT);
    else {
      this.updateLiveCamera(cv.pos.x, dtT, s);
      if (this.livePose) {
        applyPose(this.camera, this.livePose, this.reduceMotion ? 0 : 2 * this.kick);
        this.liveCameraExtras(s, cv, a, dtT);
      }
      for (const hv of this.humans) this.fadeOccluder(s, cv, hv, dtT);
    }
    this.updateEdgeArrows(hudOn);
    OUTLINE_UNIFORMS.uRes.value.set(Math.max(1, this.size.w), Math.max(1, this.size.h));

    // ---- render + DPR governor (real time, live only)
    this.gl.render(this.scene, this.camera);
    if (!this.clipTarget) {
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      if (this.lastReal > 0 && this.governor.sample((now - this.lastReal) / 1000)) this.fitContainer();
      this.lastReal = now;
    }
  }

  /** Edge arrows: a human whose head is off screen gets an arrow at the screen border pointing at them. */
  private updateEdgeArrows(on: boolean): void {
    const aspect = this.size.w / Math.max(1, this.size.h);
    this.camera.updateMatrixWorld(true);
    for (let i = 0; i < this.huds.length; i++) {
      const hud = this.huds[i];
      const hv = this.humans[i];
      if (!on || !hv || !this.arrowTex) {
        hud.arrow.visible = false;
        continue;
      }
      const ndc = hv.headTop(new Vector3()).project(this.camera);
      const ea = edgeArrow(ndc, aspect, 0.14);
      hud.arrow.visible = !!ea;
      if (!ea) continue;
      // a point just in front of the near plane at that NDC position (screen-constant sprite)
      hud.arrow.position.copy(new Vector3(ea.x, ea.y, -0.5).unproject(this.camera));
      hud.arrowMat.rotation = ea.angle;
      hud.arrow.scale.set(0.07, 0.07, 1);
    }
  }

  private nearestHuman(s: SimState): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < Math.min(this.humans.length, s.humans.length); i++) {
      const h = s.humans[i];
      const d = (h.x - s.cat.x) * (h.x - s.cat.x) + (h.z - s.cat.z) * (h.z - s.cat.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private surfaceUnder(s: SimState, p: Vector3): number {
    const W = s.grid.w;
    const D = s.grid.d;
    const x = Math.max(0, Math.min(W - 1, Math.floor(p.x / 0.4 + W / 2)));
    const z = Math.max(0, Math.min(D - 1, Math.floor(p.z / 0.4 + D / 2)));
    return s.grid.level[z * W + x] ?? 0;
  }

  private updateCat(cv: CatVis, s: SimState, a: number, T: number, dtT: number, player: boolean): void {
    const c = s.cat;
    const W = s.grid.w;
    const D = s.grid.d;
    const moving = c.stepTicks > 0;
    const p = moving ? clamp01((c.stepProgress + a) / c.stepTicks) : 1;
    const x0 = cellX(c.fromX, W);
    const z0 = cellZ(c.fromZ, D);
    const y0 = levelY(c.fromLevel);
    const x1 = cellX(c.x, W);
    const z1 = cellZ(c.z, D);
    const y1 = levelY(c.level);
    let y = y0 + (y1 - y0) * p;
    const jumping = c.act === CatAct.JUMP && moving;
    if (jumping) y += 4 * p * (1 - p) * (0.12 + Math.max(0, y1 - y0) * 0.6);
    cv.pos.set(x0 + (x1 - x0) * p, y, z0 + (z1 - z0) * p);
    // in a box: sitting in it with only the ears showing
    const box = (s.inBox ?? -1) >= 0 && !moving ? s.props[s.inBox ?? -1] : undefined;
    if (box) cv.pos.set(cellX(box.x, W), levelY(box.level) - IN_BOX_SINK, cellZ(box.z, D));
    // At rest against taller furniture the toy-scaled cat would poke into it: ease it back from the face.
    if (!moving && !box && c.act !== CatAct.CUDDLED) {
      const fx = c.x + DIR_DX[c.facing];
      const fz = c.z + DIR_DZ[c.facing];
      if (fx >= 0 && fz >= 0 && fx < W && fz < D && (s.grid.level[fz * W + fx] ?? 0) > c.level) {
        cv.pos.x -= DIR_DX[c.facing] * 0.07;
        cv.pos.z -= DIR_DZ[c.facing] * 0.07;
      }
    }
    // round 3: a refused jump (cantReach) bumps the cat into the edge and back over 8 ticks, with a squash
    let bump = 0;
    if (player && this.bumpT >= 0 && !moving) {
      const u = (T - this.bumpT) / 8;
      if (u >= 0 && u < 1) {
        bump = Math.sin(u * Math.PI);
        cv.pos.x += DIR_DX[c.facing] * 0.06 * bump;
        cv.pos.z += DIR_DZ[c.facing] * 0.06 * bump;
      } else if (u >= 1) this.bumpT = -1;
    }
    let yaw = facingYaw(c.facing);
    if (moving && (c.x !== c.fromX || c.z !== c.fromZ)) yaw = Math.atan2(x1 - x0, z1 - z0);
    const closeUp = player && !!this.clipShot?.closeUp && c.act !== CatAct.CUDDLED;
    if (closeUp) yaw = Math.atan2(CLOSEUP_DIR.x, CLOSEUP_DIR.z);
    if (box) yaw = Math.atan2(this.camera.position.x - cv.pos.x, this.camera.position.z - cv.pos.z);
    if (!cv.init) {
      cv.yaw = yaw;
      cv.init = true;
    }
    cv.yaw = closeUp ? yaw : lerpAngle(cv.yaw, yaw, damp(0.35, dtT));
    const mv = moving && !jumping ? (c.act === CatAct.SNEAK ? 1 : 2) : 0;
    if (mv) cv.phase += dtT * (Math.PI / Math.max(1, c.stepTicks));
    cv.loaf += ((c.act === CatAct.LOAF && !box ? 1 : 0) - cv.loaf) * damp(0.2, dtT);
    cv.sit += ((box ? 1 : 0) - cv.sit) * damp(0.3, dtT);
    let actP = 0;
    if (c.act === CatAct.SWAT) actP = 1 - clamp01((c.actTimer - a) / SWAT_TICKS);
    else if (c.act === CatAct.GRAB) actP = 1 - clamp01((c.actTimer - a) / GRAB_TICKS);
    else if (jumping) actP = p * (c.stepTicks / JUMP_TICKS);
    const poseT = T + (player && this.clipShot ? (this.clipExtras.poseT ?? 0) : 0);
    const ti = Math.floor(poseT);
    // the scoop: eyes open ("uh-oh") until he lifts the cat, then the content closed-eye hug
    const cuddled = c.act === CatAct.CUDDLED;
    const ph = cuddled ? scoopPhase(s.tick - Math.max(0, s.caughtTick) + a) : null;
    let blink = ti % 97 < 4 || (cv.loaf > 0.8 && ti % 70 < 16) || (cuddled && (ph?.lift ?? 1) > 0.5);
    if (player && this.clipShot?.closeUp) blink = this.clipExtras.blink;
    // round 3 readability: standing still, the player's cat turns its head toward the camera (up to 40°, and
    // within ±35° of the clip's close-up direction in the clip), so a cat facing away is not a striped box
    let headYaw: number | undefined = closeUp ? 0 : undefined;
    if (player && !closeUp) {
      const still = !moving && (c.act === CatAct.IDLE || c.act === CatAct.LOAF);
      let want = 0;
      if (still) {
        const camYaw = this.clipShot ? Math.atan2(CLOSEUP_DIR.x, CLOSEUP_DIR.z) : Math.atan2(this.camera.position.x - cv.pos.x, this.camera.position.z - cv.pos.z);
        const lim = this.clipShot ? 0.61 : 0.7;
        want = Math.max(-lim, Math.min(lim, angleDelta(cv.yaw, camYaw)));
      }
      this.camHead += (want - this.camHead) * damp(0.15, dtT);
      if (Math.abs(this.camHead) > 0.01) headYaw = this.camHead;
    }
    poseCat(cv.rig, {
      T: poseT,
      act: c.act,
      actP: clamp01(actP),
      moving: mv,
      phase: cv.phase,
      blink,
      loaf: cv.loaf,
      sit: cv.sit,
      hug: ph ? Math.max(ph.lift, ph.hug) : 0,
      headYaw,
      headPitch: closeUp ? -0.1 : undefined,
      // the signature beat: the clip's slow blink is a smug half-blink on its way down and up
      lid: player && this.clipShot?.closeUp && this.clipExtras.blink ? 'half' : undefined,
    });
    cv.rig.root.position.copy(cv.pos);
    cv.rig.root.rotation.set(0, cv.yaw, 0);
    cv.rig.root.scale.set(1 + bump * 0.06, 1 - bump * 0.1, 1 + bump * 0.06);
  }

  /** CAUGHT: the scoop cuddle. He walks up and leans in, lifts the cat in an arc into his arms and hugs it. */
  private cuddle(cv: CatVis, s: SimState, a: number, T: number, hv: HumanView, rest: Vector3): void {
    hv.rig.root.updateMatrixWorld(true);
    const arms = new Vector3().setFromMatrixPosition(hv.rig.arms.matrixWorld).add(new Vector3(0, -0.14, 0));
    const ph = scoopPhase(s.tick - Math.max(0, s.caughtTick) + a);
    const k = ph.lift;
    // before the lift: an "uh-oh" crouch where it was caught, facing him
    const start = rest.clone();
    cv.pos.copy(start).lerp(arms, k);
    cv.pos.y += Math.sin(Math.PI * k) * 0.2;
    cv.rig.root.position.copy(cv.pos);
    const faceHim = Math.atan2(hv.rig.root.position.x - start.x, hv.rig.root.position.z - start.z);
    // in his arms the cat faces out, the same way he faces
    cv.yaw = lerpAngle(faceHim, hv.rig.root.rotation.y, k);
    // round 3: not a still frame. Sway ±6° at 1.2 Hz, squash 1.0 ↔ 0.92 at 2 Hz, a tail flick every 0.6 s.
    const sec = T / 30;
    const hug = ph.hug;
    cv.rig.root.rotation.set(-0.25 * hug, cv.yaw, Math.sin(sec * Math.PI * 2 * 1.2) * 0.105 * hug);
    const pre = (1 - k) * Math.min(1, (s.tick - Math.max(0, s.caughtTick) + a) / 6);
    const sq = 1 - 0.04 * (1 - Math.cos(sec * Math.PI * 2 * 2)) * hug - 0.08 * pre;
    cv.rig.root.scale.set(1 + (1 - sq) * 0.5, sq, 1);
    const flick = (sec % 0.6) / 0.6;
    const tail = cv.rig.tail[cv.rig.tail.length - 1];
    if (tail && flick < 0.35) tail.rotation.y += Math.sin((flick / 0.35) * Math.PI) * 0.9;
    const ht = Math.floor(T / 12);
    if (hug > 0.2 && ht !== this.heartTick) {
      this.heartTick = ht;
      this.shards.burst(cv.pos.clone().add(new Vector3(0, 0.25, 0)), -10, {
        count: 3,
        colors: [PAL.heart, 0xffb3c7],
        seed: ht * 977,
        speed: 0.25,
        up: 0.5,
        gravity: -0.06,
        life: 1.3,
        size: 2,
      });
    }
  }

  private applyFx(f: PropFx, s: SimState, T: number): void {
    const def = propKind(f.propKind);
    // Must-Wreck props crash bigger: more, faster shards and a bigger flash
    const target = !!s.props[f.prop]?.target;
    if (f.kind === 'break' || f.kind === 'spill') {
      this.impact.fire(f.pos.clone().add(new Vector3(0, 0.06, 0)), T, target ? 0.95 : 0.6);
      if (!this.reduceMotion && !this.clipShot) {
        this.crashT = T;
        this.crashPos.copy(f.pos);
      }
    }
    if (f.kind === 'break') {
      this.shards.burst(f.pos, f.pos.y, {
        count: target ? 60 : def?.material === 'glass' ? 40 : 28,
        colors: shardColors(f.propKind),
        seed: f.seed,
        dirX: f.dirX,
        dirZ: f.dirZ,
        speed: target ? 3.0 : 2.2,
        up: target ? 2.6 : 2.2,
        hero: target ? 5 : 3,
      });
      const pc = puddleColor(f.propKind);
      if (pc) this.shards.puddle(f.pos, pc, f.propKind === 1 ? 0.2 : 0.16, f.seed);
      if (!this.reduceMotion) {
        this.kick = 1;
        this.shake(target ? SHAKE_TARGET_M : SHAKE_BREAK_M, f.seed);
      }
    } else if (f.kind === 'spill') {
      const pc = puddleColor(f.propKind) || (def?.color ?? 0xffffff);
      this.shards.puddle(f.pos, pc, 0.34, f.seed);
      this.shards.burst(f.pos, f.pos.y, { count: 14, colors: shardColors(f.propKind), seed: f.seed, speed: 1.2, up: 1.4, dirX: f.dirX, dirZ: f.dirZ });
      if (!this.reduceMotion) {
        this.kick = 0.6;
        this.shake(SHAKE_SPILL_M, f.seed);
      }
    } else {
      this.shards.burst(f.pos, f.pos.y, { count: 7, colors: [0xf6ead8, 0xe9dcc8], seed: f.seed, speed: 0.6, up: 0.7, life: 0.45, size: 0.8 });
    }
  }

  /**
   * Crash shake (round 3: 0.04 m was ~4 px on a phone): `amp` metres (Must-Wreck 0.10, break 0.06, spill 0.035),
   * SHAKE_TICKS long with SHAKE_CYCLES full oscillations, decaying linearly, plus a 4 % FOV punch-in for 120 ms.
   */
  private shake(amp: number, seed: number): void {
    this.shakeAmp = Math.max(this.shakeT > 0 ? this.shakeAmp : 0, amp);
    this.shakeT = SHAKE_TICKS;
    this.punchT = 3.6;
    this.shakeSeed = seed;
  }

  /** Live-only camera extras on top of the whole-room pose: intro, cuddle push-in, shake, FOV punch. */
  private liveCameraExtras(s: SimState, cv: CatVis, a: number, dtT: number): void {
    const cam = this.camera;
    const pose = this.livePose!;
    let fov = pose.fov;
    // run intro: hold the cat's face close-up, then ease out to the room
    if (this.intro !== null && this.intro < 1) {
      cv.rig.face.updateWorldMatrix(true, false);
      const face = new Vector3().setFromMatrixPosition(cv.rig.face.matrixWorld);
      const cu = closeUpPose(face, 1, this.size.w / Math.max(1, this.size.h));
      const u = clamp01((this.intro - 0.6) / 0.4);
      const k = u * u * (3 - 2 * u);
      cam.position.copy(cu.position).lerp(pose.position, k);
      const look = cu.target.clone().lerp(pose.target, k);
      cam.lookAt(look);
      fov = cu.fov + (pose.fov - cu.fov) * k;
    } else if (s.cat.act === CatAct.CUDDLED && this.humans[0]) {
      // caught: push in 1.6× on the human and the cat over 0.6 s
      const u = clamp01((s.tick - Math.max(0, s.caughtTick) + a) / 18);
      const k = u * u * (3 - 2 * u);
      const focus = cv.pos.clone().add(new Vector3(0, 0.3, 0));
      const off = pose.position.clone().sub(pose.target).multiplyScalar(1 / 1.6);
      cam.position.copy(pose.position).lerp(focus.clone().add(off), k);
      cam.lookAt(pose.target.clone().lerp(focus, k));
    } else if (this.crashT >= 0 && !this.reduceMotion) {
      // crash cam: push 1.12× toward the break over 6 ticks, back over 12
      const t = this.lastT - this.crashT;
      let z = 0;
      if (t < 6) z = smoothK(t / 6);
      else if (t < 18) z = 1 - smoothK((t - 6) / 12);
      else this.crashT = -1;
      if (z > 0) {
        const tgt = pose.target.clone().lerp(this.crashPos, 0.3 * z);
        const off = pose.position.clone().sub(pose.target).multiplyScalar(1 - (1 - 1 / 1.12) * z);
        cam.position.copy(tgt).add(off);
        cam.lookAt(tgt);
      }
    }
    if (this.shakeT > 0) {
      const k = this.shakeT / SHAKE_TICKS;
      const ph = (1 - k) * SHAKE_CYCLES * Math.PI * 2;
      const side = this.shakeSeed & 1 ? 1 : -1;
      cam.position.x += Math.sin(ph) * this.shakeAmp * k * side;
      cam.position.y += Math.sin(ph * 0.5 + 0.6) * this.shakeAmp * k * 0.6;
      this.shakeT = Math.max(0, this.shakeT - dtT);
    }
    if (this.punchT > 0) {
      fov *= 1 - 0.04 * Math.sin((this.punchT / 3.6) * Math.PI * 0.5);
      this.punchT = Math.max(0, this.punchT - dtT);
    }
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  /** The human fades to 40 % while the cat or a falling prop is hidden behind him on screen. */
  private fadeOccluder(s: SimState, cv: CatVis, hv: HumanView, dtT: number): void {
    const cam = this.camera;
    cam.updateMatrixWorld(true);
    const root = hv.rig.root.position;
    const head = hv.headTop(new Vector3());
    const a = root.clone().project(cam);
    const b = head.clone().project(cam);
    const halfW = Math.abs(b.y - a.y) * 0.32 * (this.size.h / Math.max(1, this.size.w));
    const behind = (p: Vector3): boolean => {
      const q = p.clone().project(cam);
      const inside = q.x > Math.min(a.x, b.x) - halfW && q.x < Math.max(a.x, b.x) + halfW && q.y > Math.min(a.y, b.y) && q.y < Math.max(a.y, b.y);
      return inside && p.distanceTo(cam.position) > root.distanceTo(cam.position);
    };
    let hidden = s.cat.act !== CatAct.CUDDLED && behind(cv.pos.clone().add(new Vector3(0, 0.15, 0)));
    if (!hidden && this.props)
      for (let i = 0; i < s.props.length && !hidden; i++) {
        if (s.props[i].state !== PropSt.FALLING) continue;
        const pp = this.props.propPosition(i, new Vector3());
        if (pp && behind(pp)) hidden = true;
      }
    hv.setFade(hidden ? 0.4 : 1, dtT * 0.25);
  }

  /** Run intro progress 0..1 (close-up of the cat → whole room), null = off (GDD 3.1). */
  setIntro(p: number | null): void {
    this.intro = p;
  }

  /** FTUE arrow: false hides it for good this run. */
  setFtueArrow(on: boolean): void {
    this.ftueArrowUntil = on ? -1 : 0;
  }

  /** Screen position (0..1, y down) of prop `i` as last drawn, for the HUD's point pops. */
  projectProp(i: number): { x: number; y: number } | null {
    const p = this.props?.propPosition(i, new Vector3());
    if (!p) return null;
    this.camera.updateMatrixWorld(true);
    p.project(this.camera);
    if (p.z > 1) return null;
    return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
  }

  /** The last live frame as an image (result backdrop). Renders now, so the drawing buffer is fresh. */
  snapshot(type = 'image/jpeg', quality = 0.72): string | null {
    if (this.disposed || this.watcher.lost || !this.lastState) return null;
    try {
      this.gl.render(this.scene, this.camera);
      return this.canvas.toDataURL(type, quality);
    } catch {
      return null;
    }
  }

  snapshotBlob(type = 'image/jpeg', quality = 0.85): Promise<Blob | null> {
    if (this.disposed || this.watcher.lost || !this.lastState) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        this.gl.render(this.scene, this.camera);
        // toBlob copies the bitmap now (same task as the render), then encodes asynchronously
        this.canvas.toBlob((b) => resolve(b), type, quality);
      } catch {
        resolve(null);
      }
    });
  }

  /** Heads of every human at their spots (the live camera keeps them on screen). */
  private spotHeads(): Vector3[] {
    const play = this.play;
    if (!play) return [];
    const sh = play.shell;
    const out = [new Vector3(cellX(sh.humanSpot.x, sh.width), 2.0, cellZ(sh.humanSpot.z, sh.depth))];
    if (play.routine2 && sh.humanSpot2) out.push(new Vector3(cellX(sh.humanSpot2.x, sh.width), 2.0, cellZ(sh.humanSpot2.z, sh.depth)));
    return out;
  }

  /**
   * Live camera. 3:4 and wider: the whole room (back wall included). Phone portrait (aspect < PORTRAIT_ASPECT):
   * an 8-cell window over the full depth that slides with the cat's x, clamped to the room, eased at 1 - 0.9^dt.
   * Streamer layout: the whole room centred at any aspect (16:9 stage).
   */
  private updateLiveCamera(catX: number | null = null, dtT = 0, s: SimState | null = null): void {
    if (!this.room) return;
    const aspect = this.size.w / Math.max(1, this.size.h);
    const key = aspect.toFixed(4) + this.layout;
    const play = this.play;
    const b = this.room.bounds;
    const halfW = play ? (play.shell.width * CELL_M) / 2 : (b.maxX - b.minX) / 2;
    const halfD = play ? (play.shell.depth * CELL_M) / 2 : (b.maxZ - b.minZ) / 2;
    if (key !== this.poseKey || !this.basePose) {
      this.poseKey = key;
      // The human's head never crops (GDD 11.1: the turn must stay readable).
      const heads = this.spotHeads();
      const streamer = this.layout === 'streamer';
      const editor = this.layout === 'editor';
      this.portrait = !streamer && !editor && aspect < PORTRAIT_ASPECT;
      this.basePose = editor
        ? editorPose(aspect, halfW, halfD)
        : streamer
          ? streamerPose(aspect, halfW, halfD, heads)
          : this.portrait
            ? portraitPose(aspect, halfD, heads)
            : roomPose(aspect, halfW, halfD, heads);
    }
    let shift = 0;
    if (this.portrait) {
      const lim = portraitShiftLimit(halfW);
      if (catX !== null) {
        const want = portraitShift(catX, lim, s ? this.nearTargetsX(s) : []);
        if (!this.camXInit) {
          this.camX = want;
          this.camXInit = true;
        } else this.camX += (want - this.camX) * (1 - Math.pow(0.9, Math.max(0, dtT)));
      }
      shift = this.camX;
    }
    const bp = this.basePose;
    this.livePose = {
      fov: bp.fov,
      position: new Vector3(bp.position.x + shift, bp.position.y, bp.position.z),
      target: new Vector3(bp.target.x + shift, bp.target.y, bp.target.z),
    };
    applyPose(this.camera, this.livePose);
  }

  /** World x of live Must-Wreck targets within 2 cells of the cat (the portrait window pans to keep them in). */
  private nearTargetsX(s: SimState): number[] {
    const out: number[] = [];
    const c = s.cat;
    for (const p of s.props) {
      if (!p.target || p.restTick >= 0 || p.state === PropSt.FALLING) continue;
      if (Math.max(Math.abs(p.x - c.x), Math.abs(p.z - c.z)) > 2) continue;
      out.push(cellX(p.x, s.grid.w));
    }
    return out;
  }

  private updateClipCamera(s: SimState, cv: CatVis, dtT: number): void {
    const shot = this.clipShot!;
    const aspect = this.size.w / Math.max(1, this.size.h);
    // round 2 (QA): a run with nothing to follow gets the wide establishing shot of the room
    if (shot.wide && this.play) {
      const halfW = (this.play.shell.width * CELL_M) / 2;
      const halfD = (this.play.shell.depth * CELL_M) / 2;
      this.lastShotKind = 'wide';
      this.clipLock = null;
      applyPose(this.camera, roomPose(aspect, halfW, halfD, this.spotHeads()), 0);
      return;
    }
    // round 2 (QA): the 0.6 s cut to the human as he turns
    if (shot.humanCut && this.humans.length) {
      const hi = this.nearestHuman(s);
      const head = (this.humans[hi] ?? this.humans[0]).headTop(new Vector3());
      this.lastShotKind = 'human';
      this.clipLock = null;
      applyPose(this.camera, this.clearView(humanCutPose(head, cv.pos, aspect), head.clone().add(new Vector3(0, -0.2, 0)), 0.8), 0);
      return;
    }
    // round 3 (virality): 9–11 s, the falling object and the human's double-take in one frame
    if (shot.twoShot && this.humans.length && this.props && shot.focusProp >= 0) {
      const pp = this.props.propPosition(shot.focusProp, new Vector3());
      if (pp) {
        const hi = this.nearestHuman(s);
        const head = (this.humans[hi] ?? this.humans[0]).headTop(new Vector3());
        let pose = twoShotPose(pp, head, aspect);
        pose = unoccludedPose(pose, pp.clone().add(new Vector3(0, 0.1, 0)), s.grid, CELL_M, levelY) ?? pose;
        pose = this.clearView(pose, pp.clone().add(new Vector3(0, 0.1, 0)), 1.2);
        this.lastShotKind = 'two';
        this.clipLock = null;
        applyPose(this.camera, pose, 0);
        return;
      }
    }
    cv.rig.face.updateWorldMatrix(true, false);
    const face = new Vector3().setFromMatrixPosition(cv.rig.face.matrixWorld);
    let prop: Vector3 | null = null;
    const extra: Vector3[] = [];
    const p0 = shot.focusProp >= 0 ? s.props[shot.focusProp] : undefined;
    if (p0 && this.props) {
      prop = this.props.propPosition(shot.focusProp, new Vector3());
      // round 3: the landing point (prop + push direction × 0.4 m, at the landing level) stays in frame
      if (prop && (p0.state === PropSt.REST || p0.state === PropSt.WOBBLE || p0.state === PropSt.FALLING)) {
        let dx = p0.state === PropSt.FALLING ? DIR_DX[p0.dir] ?? 0 : Math.sign(p0.x - s.cat.x);
        let dz = p0.state === PropSt.FALLING ? DIR_DZ[p0.dir] ?? 0 : Math.sign(p0.z - s.cat.z);
        if (!dx && !dz) dz = 1;
        const W = s.grid.w;
        const D = s.grid.d;
        const lx = Math.max(0, Math.min(W - 1, (p0.state === PropSt.FALLING ? p0.fromX : p0.x) + dx));
        const lz = Math.max(0, Math.min(D - 1, (p0.state === PropSt.FALLING ? p0.fromZ : p0.z) + dz));
        const base = p0.state === PropSt.FALLING ? new Vector3(cellX(p0.fromX, W), 0, cellZ(p0.fromZ, D)) : new Vector3(cellX(p0.x, W), 0, cellZ(p0.z, D));
        extra.push(new Vector3(base.x + dx * CELL_M, levelY(s.grid.level[lz * W + lx] ?? 0), base.z + dz * CELL_M));
      }
    }
    // the human's head is optional: it may pull the camera back only up to FOLLOW_MAX_DIST (review round 1)
    const optional: Vector3[] = [];
    if (shot.human && this.humans.length) {
      // the human who turns (the nearest one in boss rooms)
      const hi = this.nearestHuman(s);
      optional.push((this.humans[hi] ?? this.humans[0]).headTop(new Vector3()));
    }
    // framed crimes and the Roomba clip format keep the Roomba in the shot
    if (!shot.closeUp && this.dyn && (this.clipExtras.roomba || p0?.framed === 1)) {
      const rp = this.dyn.roombaPosition(new Vector3());
      if (rp) extra.push(rp.clone().add(new Vector3(0, 0.1, 0)));
    }
    const kind = shot.closeUp ? 'close' : `f${shot.focusProp}`;
    // round 3: hold the camera still for the ~20 ticks around the break (the fall and 10 ticks after it lands)
    const locked =
      !shot.closeUp && !!p0 && (p0.state === PropSt.FALLING || (p0.restTick >= 0 && s.tick >= p0.restTick && s.tick - p0.restTick < 10));
    if (locked && this.clipLock && kind === this.lastShotKind) {
      applyPose(this.camera, { ...this.clipLock, fov: CLIP_FOV * (1 - FOLLOW_PUSH_FOV * shot.push) }, 0);
      return;
    }
    let pose = clipPose(shot, face, cv.pos.clone().add(new Vector3(0, 0.12, 0)), prop, extra, aspect, optional);
    // round 2 (QA): the opening close-up filmed a popcorn bowl and the sofa's back in front of the face
    if (shot.closeUp) pose = this.clearView(pose, face, 0.25);
    // round 3 (virality): an ottoman hid 60 % of the cat's body in the 0–2 s opener: before the match cut (push < 1,
    // FACE_RECT is exact only at the cut) the body needs a clear line too
    if (shot.closeUp && shot.push < 1) {
      const body = cv.pos.clone().add(new Vector3(0, 0.1, 0));
      if (this.blockedAt(pose.position, body) !== Infinity) pose = this.clearView(pose, body, 0.25);
    }
    if (!shot.closeUp) {
      // smooth the follow target (a cut resets it)
      if (kind !== this.lastShotKind || !this.clipFocus) {
        this.clipFocus = pose.target.clone();
        this.clipDist = pose.position.distanceTo(pose.target);
      } else {
        this.clipFocus.lerp(pose.target, damp(0.12, dtT));
        this.clipDist += (pose.position.distanceTo(pose.target) - this.clipDist) * damp(0.12, dtT);
      }
      const off = pose.position.clone().sub(pose.target).setLength(this.clipDist);
      pose = { fov: pose.fov, target: this.clipFocus.clone(), position: this.clipFocus.clone().add(off) };
    }
    if (!shot.closeUp) {
      // round 2 (QA): never inside the cat (a minimum distance) and never behind furniture (line of sight to the cat)
      const catPt = cv.pos.clone().add(new Vector3(0, 0.15, 0));
      const toCam = pose.position.clone().sub(catPt);
      if (toCam.length() < FOLLOW_MIN_CAT_DIST) pose = { ...pose, position: catPt.clone().add(toCam.setLength(FOLLOW_MIN_CAT_DIST)) };
      // round 3 (virality): reject poses whose line to the cat crosses an occluding cell (tall furniture)
      pose = unoccludedPose(pose, catPt, s.grid, CELL_M, levelY) ?? pose;
      pose = this.clearView(pose, catPt, FOLLOW_MIN_CAT_DIST * 0.8);
    }
    this.clipLock = locked ? { fov: pose.fov, target: pose.target.clone(), position: pose.position.clone() } : null;
    this.lastShotKind = kind;
    applyPose(this.camera, pose, 0);
  }

  private readonly ray = new Raycaster();

  /** First room mesh between `from` and `to` (furniture, walls), as a distance from `from`; Infinity when clear. */
  private blockedAt(from: Vector3, to: Vector3, withProps = true): number {
    if (!this.room) return Infinity;
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 1e-3) return Infinity;
    this.ray.set(from, dir.normalize());
    this.ray.near = 0.02;
    this.ray.far = len - 0.12;
    const groups: import('three').Object3D[] = [this.room.group];
    if (withProps && this.props) groups.push(this.props.group);
    for (const hv of this.humans) groups.push(hv.rig.root);
    const solid = (h: { object: import('three').Object3D }): boolean => (h.object as Mesh).isMesh && h.object.visible;
    const hit = this.ray.intersectObjects(groups, true).find(solid);
    if (hit) return hit.distance;
    // a camera INSIDE a mesh (a sofa, a popcorn bowl) sees only its back faces: test from the subject back too
    this.ray.set(to, from.clone().sub(to).normalize());
    this.ray.near = 0.12;
    this.ray.far = len - 0.02;
    const back = this.ray.intersectObjects(groups, true).find(solid);
    return back ? len - back.distance : Infinity;
  }

  /**
   * Round 2 (QA): a pose whose view of `subject` is blocked (the camera inside a sofa or behind a shelf) pivots
   * around the subject (higher first, then left / right), else pulls in to just in front of the blocker, never
   * closer than `minDist`.
   */
  private clearView(pose: CameraPose, subject: Vector3, minDist: number): CameraPose {
    if (this.blockedAt(pose.position, subject) === Infinity) return pose;
    const off = pose.position.clone().sub(subject);
    const dist = off.length();
    const tries: [number, number][] = [[0, 0.35], [0.5, 0.2], [-0.5, 0.2], [0.9, 0.35], [-0.9, 0.35], [0, 0.7]];
    for (const [yaw, lift] of tries) {
      const o = off.clone().applyAxisAngle(new Vector3(0, 1, 0), yaw);
      o.y += lift * dist;
      o.setLength(dist);
      const pos = subject.clone().add(o);
      if (this.blockedAt(pos, subject) === Infinity) return { ...pose, position: pos, target: pose.target.clone().add(pos.clone().sub(pose.position).multiplyScalar(0.3)) };
    }
    const hitD = this.blockedAt(subject, pose.position);
    if (hitD === Infinity) return pose;
    const d = Math.max(minDist, hitD - 0.08);
    return { ...pose, position: subject.clone().add(off.setLength(d)) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    unregisterStillHost(this.stillHost);
    this.resizeObs?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onWinResize);
    this.unloadScene();
    this.shards.dispose();
    this.blobs.dispose();
    this.suspRing.dispose();
    this.catAlert.dispose();
    this.impact.dispose();
    this.youTex?.dispose();
    this.youMat.dispose();
    this.arrowTex?.dispose();
    this.arrow.dispose();
    this.trail.dispose();
    this.zzz.dispose();
    this.frameRing.geometry.dispose();
    (this.frameRing.material as MeshBasicMaterial).dispose();
    this.catRing.geometry.dispose();
    (this.catRing.material as MeshBasicMaterial).dispose();
    this.mat.dispose();
    this.watcher.dispose();
    this.gl.dispose();
    this.canvas.remove();
    this.lostCbs = [];
  }
}

/** Crash shake amplitudes (m) and shape (round 3). */
export const SHAKE_TARGET_M = 0.1;
export const SHAKE_BREAK_M = 0.06;
export const SHAKE_SPILL_M = 0.035;
export const SHAKE_TICKS = 9;
export const SHAKE_CYCLES = 3;

function smoothK(u: number): number {
  const v = u < 0 ? 0 : u > 1 ? 1 : u;
  return v * v * (3 - 2 * v);
}

/** Re-exported for the clip pass. */
export function isGameRenderer(r: Renderer): r is GameRenderer {
  return r instanceof GameRenderer;
}
