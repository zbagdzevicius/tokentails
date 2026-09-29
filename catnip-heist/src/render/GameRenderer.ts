/**
 * GameRenderer: the three.js implementation of RendererAPI for Catnip Heist.
 *
 *   const r = createRenderer();
 *   r.mount(document.getElementById('app')!);
 *   r.setLevel(level);
 *   r.setCats(['bob', 'oreo']);
 *   await r.ready();
 *   // every animation frame:
 *   r.update(prevState, curState, alpha);
 *
 * Reads SimState only (never mutates it). Events are consumed once per new tick (cur.tick changes).
 * Coordinate mapping: world X = pos.x / SUBTILE, world Z = pos.y / SUBTILE, Y up; 1 tile = 1 unit.
 */
import * as THREE from 'three';
import { ASSET_BASE, PALETTE, SUBTILE, type AssetManifest, type GuardMode, type LevelDef, type RendererAPI, type SimEvent, type SimState, type Vec2i } from '../types';
import { CatView, GuardView, lerpPos, TELEPORT_SUB } from './actors';
import { Backdrop } from './backdrop';
import { CAMERA_YAW, IsoCamera } from './camera';
import { PostFX } from './post';
import { FpsProbe, qualityOverride, startTier, type QualityTier } from './quality';
import { MeowWaves, Particles, Rings } from './fx';
import { LevelView, tileCenter } from './level';
import { ALERT_ART, CHEVRON_ART, QUESTION_ART, voxelArt } from './pixelart';
import { glowTexture } from './textures';
import { compileLevel, inBounds, isOpaque, lineOfSight } from '../sim/grid';
import { VisionCones, type ConeInput } from './vision';
import { loadManifest, loadVoxelSheet, prewarmSheet, rowIndex, type VoxelSheet } from './voxel/sheets';

export const BUDGET = { calls: 150, triangles: 150_000 };

export interface GameRendererOptions {
  /** Asset base URL (default ASSET_BASE, relative 'assets/'). */
  assetBase?: string;
  /** Real-time shadows (default true). */
  shadows?: boolean;
  /** Shadow map size (default 2048 on desktop, 1024 on small/touch screens). */
  shadowMapSize?: number;
  /** Max device pixel ratio (default 2). */
  maxPixelRatio?: number;
  antialias?: boolean;
  /** Log draw calls / triangles to the console periodically and warn over budget (default true). */
  logStats?: boolean;
  /** Mouse-wheel / pinch zoom on the canvas (default true). */
  interactiveZoom?: boolean;
  /** 'auto' (default: measure ~2 s, drop to low if slow), or a forced tier. `?quality=` wins. */
  quality?: 'auto' | QualityTier;
}

const MODE_COLORS: Record<GuardMode, { color: THREE.Color; alpha: number }> = {
  PATROL: { color: new THREE.Color('#ffc62e'), alpha: 0.34 },
  SNIFF: { color: new THREE.Color('#ffe08a'), alpha: 0.26 },
  INVESTIGATE: { color: new THREE.Color('#ff7a1a'), alpha: 0.4 },
  ALERT: { color: new THREE.Color('#ff2e22'), alpha: 0.46 },
};

const MAX_BLOBS = 16;

/** Ring marker shader: soft glow disc, crisp notched ring rotating, pulse. */
function ringMaterial(color: string, intensity: number, glow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uGlow: { value: glow }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uGlow; uniform float uOpacity;
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
        float ring = smoothstep(0.6, 0.64, r) * (1.0 - smoothstep(0.7, 0.74, r));
        float notch = step(0.35, fract(a / 6.2831853 * 6.0 + uTime * 0.35));
        float inner = smoothstep(0.46, 0.5, r) * (1.0 - smoothstep(0.52, 0.56, r)) * 0.55;
        float glow = (1.0 - smoothstep(0.0, 1.0, r)) * uGlow * (0.55 + 0.45 * pulse);
        float alpha = clamp(ring * notch + inner + glow * 0.45, 0.0, 1.0) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }`,
  });
}

/** Radial dark blob for contact shadows. */
function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type RescueMode = 'caged' | 'hop' | 'follow';

export class GameRenderer implements RendererAPI {
  private readonly opts: Required<GameRendererOptions>;
  private readonly base: string;
  private readonly manifest: Promise<AssetManifest>;
  private renderer: THREE.WebGLRenderer | null = null;
  private el: HTMLElement | null = null;
  private resizeObs: ResizeObserver | null = null;
  readonly scene = new THREE.Scene();
  readonly iso = new IsoCamera();
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly backdrop = new Backdrop();
  private post: PostFX | null = null;
  private tier: QualityTier = 'high';
  private probe: FpsProbe | null = null;
  private vignetteEl: HTMLDivElement | null = null;
  private readonly blobs: THREE.InstancedMesh;
  private readonly blobTex = blobTexture();
  private flashAmt = 0;
  private flashColor = '#ff2a1a';
  private readonly reduced: boolean;
  private readonly ringMats: THREE.ShaderMaterial[] = [];
  private readonly actors = new THREE.Group();
  private level: LevelView | null = null;
  private levelDef: LevelDef | null = null;
  private cones: VisionCones | null = null;
  private readonly coneInputs: ConeInput[] = [];
  private readonly particles = new Particles();
  private readonly rings = new Rings(10);
  private readonly waves = new MeowWaves(4);
  private catIds: string[] = [];
  private cats: (CatView | null)[] = [null, null];
  private guards = new Map<string, GuardView>();
  private guardSheets = new Map<string, Promise<VoxelSheet>>();
  private marks: { q: THREE.BufferGeometry | null; e: THREE.BufferGeometry | null } = { q: null, e: null };
  private chevron: THREE.Mesh | null = null;
  private readonly activeRing: THREE.Mesh;
  private readonly idleRing: THREE.Mesh;
  private readonly glowTex = glowTexture();
  private readonly pending = new Set<Promise<unknown>>();
  private lastTick = -1;
  private lastEventTick = -1;
  private observing = false;
  private observed: { prev: SimState; cur: SimState }[] = [];
  private lastLevelId = '';
  private lastActive = -1;
  private lastNow = 0;
  private time = 0;
  private statsNext = 0;
  private overBudgetWarned = false;
  private lastStats = { calls: 0, triangles: 0 };
  /** Frames drawn so far (QA: lets tests wait for a fresh frame instead of sleeping). */
  private drawn = 0;
  private rescue: { mode: RescueMode; t: number; leader: number; trail: { x: number; z: number }[]; lastLeader: { x: number; z: number } } = {
    mode: 'caged',
    t: 0,
    leader: -1,
    trail: [],
    lastLeader: { x: 0, z: 0 },
  };
  private winT = -1;
  private userZoom = 1;
  private disposed = false;
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.userZoom = this.iso.getZoom() * Math.exp(-e.deltaY * 0.0015);
    this.iso.setZoom(this.userZoom);
  };
  private pinchD = 0;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.touches.has(e.pointerId)) return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      const [a, b] = [...this.touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchD > 0) {
        this.userZoom = this.iso.getZoom() * (d / this.pinchD);
        this.iso.setZoom(this.userZoom);
      }
      this.pinchD = d;
    }
  };
  private readonly onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchD = 0;
  };
  private readonly onContextLost = (e: Event) => e.preventDefault();

  constructor(options: GameRendererOptions = {}) {
    const small = typeof window !== 'undefined' && (Math.min(window.innerWidth, window.innerHeight) < 600 || 'ontouchstart' in window);
    const start = startTier();
    const forced = qualityOverride() ?? (options.quality && options.quality !== 'auto' ? options.quality : null);
    this.opts = {
      assetBase: options.assetBase ?? ASSET_BASE,
      shadows: options.shadows ?? true,
      shadowMapSize: options.shadowMapSize ?? (small ? 1024 : 2048),
      maxPixelRatio: options.maxPixelRatio ?? 2,
      antialias: options.antialias ?? true,
      logStats: options.logStats ?? true,
      interactiveZoom: options.interactiveZoom ?? true,
      quality: forced ?? 'auto',
    };
    this.tier = forced ?? start.tier;
    this.probe = forced ? null : start.probe;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.reduced) this.iso.shakeScale = 0;
    this.base = this.opts.assetBase;
    this.manifest = loadManifest(this.base);
    this.track(this.manifest);

    this.scene.background = new THREE.Color(PALETTE.night);
    // Lighting: warm key from the back-left (casts the shadows), cool lavender fill from the camera
    // side and a cool blue rim from behind so dark sprites keep an edge.
    this.hemi = new THREE.HemisphereLight('#c8b8ff', '#2a1640', 0.8);
    this.sun = new THREE.DirectionalLight('#ffd39c', 1.75);
    this.sun.castShadow = this.opts.shadows && this.tier === 'high';
    this.sun.shadow.mapSize.set(this.opts.shadowMapSize, this.opts.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 60;
    this.fill = new THREE.DirectionalLight('#a595ff', 0.75);
    this.rim = new THREE.DirectionalLight('#7fb0ff', 1.1);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target, this.rim, this.rim.target, this.backdrop.mesh, this.actors, this.particles.mesh, this.rings.group, this.waves.group);

    // Contact shadows under every actor (one instanced draw call).
    const blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#0a0312', map: this.blobTex, transparent: true, opacity: 0.62, depthWrite: false }), MAX_BLOBS);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.blobs.name = 'blob-shadows';
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.blobs);

    // Active-cat marker: a glowing notched gold ring; a faint lilac one under the parked cat.
    const ringGeo = new THREE.PlaneGeometry(1.5, 1.5);
    ringGeo.rotateX(-Math.PI / 2);
    const am = ringMaterial(PALETTE.coin, 1.9, 0.9);
    const im = ringMaterial(PALETTE.lilac, 1.0, 0.0);
    im.uniforms.uOpacity.value = 0.5;
    this.ringMats.push(am, im);
    this.activeRing = new THREE.Mesh(ringGeo, am);
    this.activeRing.position.y = 0.03;
    this.activeRing.renderOrder = 1;
    this.activeRing.visible = false;
    this.idleRing = new THREE.Mesh(ringGeo, im);
    this.idleRing.scale.setScalar(0.8);
    this.idleRing.position.y = 0.028;
    this.idleRing.renderOrder = 1;
    this.idleRing.visible = false;
    this.scene.add(this.activeRing, this.idleRing);

    this.track(
      Promise.all([voxelArt(QUESTION_ART, 1), voxelArt(ALERT_ART, 1), voxelArt(CHEVRON_ART, 1)]).then(([q, e, c]) => {
        if (this.disposed) return;
        this.marks = { q, e };
        this.chevron = new THREE.Mesh(c, new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, color: new THREE.Color(1.6, 1.6, 1.6) }));
        this.chevron.rotation.y = CAMERA_YAW;
        this.chevron.scale.setScalar(1 / 18);
        this.chevron.renderOrder = 11;
        this.chevron.visible = false;
        this.scene.add(this.chevron);
      }),
    );
  }

  /** Current quality tier. */
  get quality(): QualityTier {
    return this.tier;
  }

  /** True once the tier is final: forced, remembered, or the auto probe has decided. */
  get qualitySettled(): boolean {
    return !this.probe || this.probe.done;
  }

  /** Switch tiers at runtime (the auto probe calls this once). */
  setQuality(t: QualityTier): void {
    this.tier = t;
    const r = this.renderer;
    const shadows = this.opts.shadows && t === 'high';
    this.sun.castShadow = shadows;
    if (r) {
      r.shadowMap.enabled = shadows;
      r.setPixelRatio(Math.min(t === 'high' ? this.opts.maxPixelRatio : 1.5, window.devicePixelRatio || 1));
      if (t === 'high' && !this.post) this.post = new PostFX(r, this.scene, this.iso.camera, { samples: 4, bloomStrength: 0.9, bloomRadius: 0.6, bloomThreshold: 1.0, vignette: 0.55, saturation: 1.12, contrast: 1.08, exposure: 0.92 });
      if (t === 'low' && this.post) {
        this.post.dispose();
        this.post = null;
      }
      this.resize();
    }
    if (this.vignetteEl) this.vignetteEl.style.display = t === 'low' ? 'block' : 'none';
  }

  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    const done = () => this.pending.delete(p);
    p.then(done, done);
    return p;
  }

  // -------------------------------------------------------------------------------------------
  // RendererAPI
  // -------------------------------------------------------------------------------------------

  mount(el: HTMLElement): void {
    if (this.renderer) return;
    this.el = el;
    const r = new THREE.WebGLRenderer({ antialias: this.opts.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(this.tier === 'high' ? this.opts.maxPixelRatio : 1.5, window.devicePixelRatio || 1));
    r.shadowMap.enabled = this.opts.shadows && this.tier === 'high';
    r.shadowMap.type = THREE.PCFShadowMap;
    r.info.autoReset = false;
    r.domElement.style.display = 'block';
    r.domElement.style.width = '100%';
    r.domElement.style.height = '100%';
    r.domElement.style.touchAction = 'none';
    r.domElement.addEventListener('webglcontextlost', this.onContextLost);
    el.appendChild(r.domElement);
    // Cheap CSS vignette for the low tier (the high tier grades in the post pass).
    const vig = document.createElement('div');
    vig.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 75% 70% at 50% 48%, rgba(13,6,22,0) 55%, rgba(13,6,22,.55) 100%);display:none;';
    el.appendChild(vig);
    this.vignetteEl = vig;
    this.renderer = r;
    this.setQuality(this.tier);
    if (this.opts.interactiveZoom) {
      r.domElement.addEventListener('wheel', this.onWheel, { passive: false });
      r.domElement.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('pointercancel', this.onPointerUp);
    }
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(el);
  }

  setLevel(level: LevelDef): void {
    // A (re)loaded run is not a frame: restart the frame clock, and let an undecided probe warm up
    // again so the rebuild hitch (uploads, shader compiles) is not measured as low fps.
    this.lastNow = 0;
    if (this.probe && !this.probe.done) this.probe.reset();
    this.level?.dispose();
    this.cones?.dispose();
    for (const g of this.guards.values()) g.dispose();
    this.guards.clear();
    this.levelDef = level;
    this.level = new LevelView(level, { manifest: this.manifest, base: this.base, shadows: this.opts.shadows });
    this.scene.add(this.level.group);
    this.track(this.level.ready);
    this.waves.setSize(level.tiles[0]?.length ?? 1, level.tiles.length);
    this.cones = new VisionCones(level.guards.length, Math.max(1, ...level.guards.map((g) => g.visionTiles)));
    this.scene.add(this.cones.mesh);
    this.coneInputs.length = 0;
    for (let i = 0; i < level.guards.length; i++) {
      this.coneInputs.push({ x: 0, z: 0, fx: 1, fz: 0, radius: 0, color: MODE_COLORS.PATROL.color, alpha: 0, visible: false });
    }
    this.resetRun();
    // Guards: one sheet per distinct dog sprite.
    for (const g of level.guards) {
      const view = this.level;
      const p = this.guardSheet(g.sprite).then((sheet) => {
        // Compare the view, not the def: a retry reuses the same LevelDef object.
        if (this.disposed || this.level !== view) return;
        const v = new GuardView(sheet);
        this.guards.set(g.id, v);
        this.actors.add(v.group);
      });
      this.track(p);
    }
    const c = tileCenter(level.catSpawns[0]);
    this.iso.follow(c.x, c.z, true);
  }

  setCats(ids: string[]): void {
    const next = ids.slice(0, 2);
    if (next.join('|') === this.catIds.join('|') && this.cats.every(Boolean)) return;
    this.catIds = next;
    for (const c of this.cats) c?.dispose();
    this.cats = [null, null];
    next.forEach((id, i) => {
      const p = this.manifest.then(async (m) => {
        const entry = m.cats.find((c) => c.id === id) ?? m.cats[i];
        const sheet = await loadVoxelSheet(entry, this.base);
        if (this.disposed || this.catIds[i] !== id) return;
        // Build the rows a playable cat uses up front so there is no hitch on first use.
        prewarmSheet(sheet, ['IDLE', 'WALKING', 'SITTING', 'GROOMING', 'HIT', 'LOAF'].map((n) => rowIndex(sheet, n)).filter((r) => r >= 0));
        const v = new CatView(sheet);
        this.cats[i] = v;
        this.actors.add(v.group);
      });
      this.track(p);
    });
  }

  async ready(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    // Compile every program and warm the render targets now (behind the loading screen), so the
    // first live frames do not stall on shader compilation.
    const r = this.renderer;
    if (r && !this.disposed) {
      try {
        this.iso.update(0);
        // Hidden objects (rings, marks, beams) would compile on first show: include them.
        const hidden: THREE.Object3D[] = [];
        this.scene.traverse((o) => {
          if (!o.visible) {
            hidden.push(o);
            o.visible = true;
          }
        });
        r.compile(this.scene, this.iso.camera);
        for (const o of hidden) o.visible = false;
        r.info.reset();
        if (this.post) this.post.render(0);
        else r.render(this.scene, this.iso.camera);
      } catch (e) {
        console.warn('[render] warm-up failed', e);
      }
    }
  }

  stats(): { calls: number; triangles: number } {
    return { ...this.lastStats };
  }

  /** Number of frames drawn since the renderer was created. */
  get frames(): number {
    return this.drawn;
  }

  private camLock: { x: number; z: number } | null = null;

  /** Pin the camera to a ground point instead of following the active cat (title diorama). */
  lockCamera(p: { x: number; z: number } | null): void {
    this.camLock = p ? { ...p } : null;
  }

  /** Zoom factor (1 = default; clamped to about 0.75..1.5). */
  setZoom(z: number): void {
    this.userZoom = z;
    this.iso.setZoom(z);
  }

  update(prev: SimState, cur: SimState, alpha: number): void {
    const r = this.renderer;
    if (!r || !this.level) return;
    const now = performance.now() / 1000;
    const dt = this.lastNow ? Math.min(0.1, Math.max(0, now - this.lastNow)) : 1 / 60;
    this.lastNow = now;
    this.time += dt;
    const a = Math.max(0, Math.min(1, alpha));
    this.sampleQuality(dt);

    // Restart / level change: reset render-only state.
    if (cur.levelId !== this.lastLevelId || cur.tick < this.lastTick) {
      this.resetRun();
      this.lastLevelId = cur.levelId;
    }
    const newTick = cur.tick !== this.lastTick;
    const snap = this.lastTick < 0;
    this.lastTick = cur.tick;

    // Cats. The active cat is drawn at the input's time (extrapolated when the sim gives a
    // velocity), the parked one interpolated.
    for (let i = 0; i < 2; i++) this.cats[i]?.update(prev.cats[i], cur.cats[i], a, dt, snap, i === cur.activeIndex);
    const active = this.cats[cur.activeIndex];
    const idle = this.cats[cur.activeIndex === 0 ? 1 : 0];
    const ap = active ? { x: active.position.x, z: active.position.z } : lerpPos(prev.cats[cur.activeIndex].pos, cur.cats[cur.activeIndex].pos, a, { x: 0, z: 0 });
    const swapped = newTick && this.lastActive !== cur.activeIndex && this.lastActive >= 0;
    if (swapped) this.iso.glide(0.45);
    if (this.camLock) this.iso.follow(this.camLock.x, this.camLock.z, snap);
    else this.iso.follow(ap.x, ap.z, snap, active?.vel.x ?? 0, active?.vel.z ?? 0);
    if (swapped) {
      // Camera glides to the other cat; pulse its ring.
      this.rings.spawn(ap.x, ap.z, PALETTE.coin, 0.2, 1.3, 0.5, 0.95);
      this.particles.sparkle(ap.x, ap.z, PALETTE.coin);
      active?.kick(0.9);
    }
    this.lastActive = cur.activeIndex;

    this.activeRing.visible = !!active && !cur.won;
    if (active) {
      this.activeRing.position.set(active.position.x, 0.03, active.position.z);
      if (this.chevron) {
        this.chevron.visible = !cur.won;
        this.chevron.position.set(active.position.x, active.headY + 0.42 + Math.sin(this.time * 4) * 0.07, active.position.z);
      }
    }
    this.idleRing.visible = !!idle && !cur.won;
    if (idle) this.idleRing.position.set(idle.position.x, 0.028, idle.position.z);
    for (const m of this.ringMats) m.uniforms.uTime.value = this.time;

    // Level props.
    this.level.update(cur, dt, this.time);

    // Guards + cones.
    // Cones are drawn from the sim's own sight rule (cone + tile line of sight) at the current tick.
    const cl = compileLevel(this.levelDef!);
    const doors = cur.doorsOpen;
    const sees = (gx: number, gy: number, tx: number, ty: number) =>
      inBounds(cl, tx, ty) && !isOpaque(cl, tx, ty, doors) && lineOfSight(cl, { x: gx, y: gy }, { x: tx, y: ty }, doors);
    for (let i = 0; i < cur.guards.length; i++) {
      const gs = cur.guards[i];
      const gp = prev.guards[i]?.id === gs.id ? prev.guards[i] : gs;
      const v = this.guards.get(gs.id);
      if (v) {
        const before = v.mode;
        v.update(gp, gs, a, dt, this.time, this.marks);
        if (before !== gs.mode && gs.mode === 'ALERT') {
          this.rings.spawn(v.position.x, v.position.z, PALETTE.ember, 0.3, 1.6, 0.45, 0.9);
          v.kick(1.2);
        } else if (before !== gs.mode && gs.mode === 'INVESTIGATE') v.kick(0.7);
      }
      const ci = this.coneInputs[i];
      if (!ci) continue;
      const mc = MODE_COLORS[gs.mode];
      // Sim position and facing of this tick (not interpolated/smoothed) so the cone is exact.
      ci.x = gs.pos.x / SUBTILE;
      ci.z = gs.pos.y / SUBTILE;
      ci.fx = gs.facing.x;
      ci.fz = gs.facing.y;
      ci.radius = gs.visionTiles;
      ci.color = mc.color;
      ci.alpha = gs.mode === 'ALERT' ? mc.alpha * (0.8 + 0.2 * Math.sin(this.time * 14)) : mc.alpha;
      ci.visible = !cur.won;
    }
    this.cones?.setTime(this.time, this.post ? 2.4 : 1);
    this.cones?.update(this.coneInputs, sees);

    if (newTick || this.observed.length) this.handleEvents(prev, cur);
    this.updateRescue(prev, cur, a, dt);
    this.updateBlobs();
    this.footsteps();

    // Win: gentle zoom in on the portal.
    if (cur.won) {
      if (this.winT < 0) this.winT = 0;
      this.winT += dt;
    }

    this.particles.update(dt);
    this.rings.update(dt);
    this.waves.update(dt);
    this.iso.update(dt);
    this.placeLights();
    this.draw(dt);
  }

  /** Render the frame (post chain on the high tier) and record stats over all passes. */
  private draw(dt: number): void {
    const r = this.renderer!;
    const el = this.el;
    const aspect = el ? el.clientWidth / Math.max(1, el.clientHeight) : 16 / 9;
    this.backdrop.update(this.iso.target.x, this.iso.target.z, aspect, this.time, !!this.post);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.2);
    r.info.reset();
    if (this.post) {
      this.post.setFlash(this.flashColor, this.flashAmt * 0.55);
      this.post.render(dt);
    } else r.render(this.scene, this.iso.camera);
    this.lastStats = { calls: r.info.render.calls, triangles: r.info.render.triangles };
    this.drawn++;
    this.logStats();
  }

  private sampleQuality(dt: number): void {
    const p = this.probe;
    if (!p || p.done) return;
    const t = p.sample(dt);
    if (!t) return;
    console.info(`[quality] ${p.fps.toFixed(1)} fps over the probe -> ${t}`);
    if (t !== this.tier) this.setQuality(t);
  }

  /** Blob contact shadows under cats, guards and the rescued cat. */
  private updateBlobs(): void {
    let n = 0;
    const put = (x: number, z: number, s: number, lift: number) => {
      if (n >= MAX_BLOBS) return;
      const k = s * (1 - Math.min(0.5, lift * 0.8));
      this.m4.makeScale(k, 1, k * 0.8).setPosition(x, 0.018, z);
      this.blobs.setMatrixAt(n++, this.m4);
    };
    for (const c of this.cats) if (c) put(c.position.x, c.position.z, 0.95, c.sprite.object3d.position.y);
    for (const g of this.guards.values()) put(g.position.x, g.position.z, 1.05, g.sprite.object3d.position.y);
    const rc = this.level?.crateCat;
    if (rc && this.rescue.mode !== 'caged') put(rc.object3d.position.x, rc.object3d.position.z, 0.85, rc.object3d.position.y);
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  /** Footstep dust puffs from walking actors. */
  private footsteps(): void {
    if (this.reduced) return;
    for (const c of this.cats) if (c?.footstep) this.particles.step(c.position.x, c.position.z, c.vel.x, c.vel.z);
    for (const g of this.guards.values()) if (g.footstep && (g.mode === 'ALERT' || g.mode === 'INVESTIGATE')) this.particles.step(g.position.x, g.position.z, g.vel.x, g.vel.z);
  }

  private readonly m4 = new THREE.Matrix4();

  dispose(): void {
    this.disposed = true;
    this.resizeObs?.disconnect();
    this.level?.dispose();
    this.cones?.dispose();
    for (const c of this.cats) c?.dispose();
    for (const g of this.guards.values()) g.dispose();
    this.particles.dispose();
    this.rings.dispose();
    this.waves.dispose();
    this.glowTex.dispose();
    this.blobTex.dispose();
    this.backdrop.dispose();
    this.post?.dispose();
    this.post = null;
    this.vignetteEl?.remove();
    const r = this.renderer;
    if (r) {
      r.domElement.removeEventListener('wheel', this.onWheel);
      r.domElement.removeEventListener('pointerdown', this.onPointerDown);
      r.domElement.removeEventListener('webglcontextlost', this.onContextLost);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
      r.setAnimationLoop(null);
      r.forceContextLoss();
      r.dispose();
      r.domElement.remove();
    }
    this.renderer = null;
    // Voxel geometry cache is shared with other scenes (Cat Yard); the app decides when to clear it.
  }

  /** The underlying WebGLRenderer (for screenshots / advanced integration). */
  get webgl(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  private guardSheet(id: string): Promise<VoxelSheet> {
    let p = this.guardSheets.get(id);
    if (!p) {
      p = this.manifest.then((m) => {
        const entry = m.dogs.find((d) => d.id === id) ?? m.dogs[0];
        return loadVoxelSheet(entry, this.base).then((sheet) => {
          prewarmSheet(sheet, ['WALKING', 'SNIFFING', 'RUNNING', 'CROUCHED'].map((n) => rowIndex(sheet, n)).filter((r) => r >= 0));
          return sheet;
        });
      });
      this.guardSheets.set(id, p);
    }
    return p;
  }

  private resize(): void {
    const el = this.el;
    const r = this.renderer;
    if (!el || !r) return;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    r.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.iso.setViewport(w, h);
  }

  private resetRun(): void {
    this.particles.clear();
    this.lastTick = -1;
    this.lastEventTick = -1;
    this.lastActive = -1;
    this.winT = -1;
    this.iso.setZoom(this.userZoom);
    this.resetRescue();
  }

  private resetRescue(): void {
    const lv = this.level;
    const cat = lv?.crateCat;
    if (lv && cat && cat.object3d.parent !== lv.crateGroup) {
      lv.crateGroup.add(cat.object3d);
      cat.object3d.position.set(0, 0.1, 0);
      cat.object3d.scale.setScalar(1);
      cat.setAnim('LOAF');
    }
    this.rescue = { mode: 'caged', t: 0, leader: -1, trail: [], lastLeader: { x: 0, z: 0 } };
  }

  /**
   * Optional (not part of RendererAPI): feed EVERY state the sim produces, right after each step.
   * `update()` only sees the latest pair, so when the loop runs several ticks per frame (low FPS)
   * the events of the skipped ticks would be missed. Once `observe` has been called, events are
   * taken from the observed states instead of `cur.events`.
   */
  observe(state: SimState): void {
    this.observing = true;
    const last = this.observed[this.observed.length - 1];
    const prev = last && last.cur.tick === state.tick - 1 && last.cur.levelId === state.levelId ? last.cur : state;
    this.observed.push({ prev, cur: state });
    if (this.observed.length > 240) this.observed.shift();
  }

  private handleEvents(prev: SimState, cur: SimState): void {
    const lvl = this.levelDef;
    if (!this.observing) {
      if (cur.tick > this.lastEventTick) for (const e of cur.events) this.handleEvent(e, prev, cur, lvl);
      this.lastEventTick = cur.tick;
      return;
    }
    for (const o of this.observed) {
      if (o.cur.levelId !== cur.levelId || o.cur.tick <= this.lastEventTick || o.cur.tick > cur.tick) continue;
      for (const e of o.cur.events) this.handleEvent(e, o.prev, o.cur, lvl);
      this.lastEventTick = o.cur.tick;
    }
    this.observed.length = 0;
  }

  /** Tile of the entity an event names, when the event carries no tile itself. */
  private tileOfId(e: SimEvent, lvl: LevelDef | null): Vec2i | null {
    if (e.tile) return e.tile;
    if (!lvl || !e.id) return null;
    const id = e.id;
    switch (e.type) {
      case 'COIN':
        return lvl.coins.find((c) => c.id === id)?.tile ?? null;
      case 'DOOR':
        return lvl.doors.find((d) => d.id === id)?.tile ?? null;
      case 'PLATE':
        return lvl.plates.find((p) => p.id === id)?.tile ?? null;
      case 'CHECKPOINT':
        return lvl.checkpoints.find((c) => c.id === id)?.tile ?? null;
      case 'KEY':
        return lvl.key?.tile ?? null;
      default:
        return null;
    }
  }

  private handleEvent(e: SimEvent, prev: SimState, cur: SimState, lvl: LevelDef | null): void {
    const t = this.tileOfId(e, lvl);
    const tile = t ? tileCenter(t) : null;
    const catPos = (s: SimState, i: number) => ({ x: s.cats[i].pos.x / SUBTILE, z: s.cats[i].pos.y / SUBTILE });
    switch (e.type) {
      case 'COIN': {
        const p = tile ?? (e.cat !== undefined ? catPos(cur, e.cat) : null);
        if (p) {
          this.particles.coin(p.x, p.z);
          this.rings.spawn(p.x, p.z, '#b6f36a', 0.1, 0.8, 0.3, 0.8);
        }
        this.iso.zoomPunch(0.012);
        const ac = this.cats[e.cat ?? cur.activeIndex];
        ac?.kick(0.6);
        break;
      }
      case 'KEY': {
        const p = tile ?? (lvl?.key ? tileCenter(lvl.key.tile) : null);
        if (p) {
          this.particles.key(p.x, p.z);
          this.rings.spawn(p.x, p.z, PALETTE.coin, 0.2, 1.4, 0.5, 0.8);
          this.flash('#ffe39a', 0.35);
          this.iso.zoomPunch(0.03);
        }
        break;
      }
      case 'SPOTTED': {
        const i = e.cat ?? cur.activeIndex;
        const from = catPos(prev, i);
        this.particles.puff(from.x, from.z);
        const to = catPos(cur, i);
        if (Math.abs(to.x - from.x) + Math.abs(to.z - from.z) > TELEPORT_SUB / SUBTILE) this.particles.sparkle(to.x, to.z, PALETTE.lilac);
        this.rings.spawn(from.x, from.z, PALETTE.ember, 0.2, 1.8, 0.5, 0.9);
        this.iso.shake(0.24, 0.5);
        this.iso.zoomPunch(0.05);
        this.flash('#ff2a1a', 1);
        break;
      }
      case 'DOOR': {
        if (tile) this.particles.dust(tile.x, tile.z);
        break;
      }
      case 'PLATE': {
        if (tile && e.open !== false) this.rings.spawn(tile.x, tile.z, PALETTE.pink, 0.2, 0.9, 0.35, 0.7);
        break;
      }
      case 'MEOW': {
        const p = tile ?? catPos(cur, e.cat ?? cur.activeIndex);
        const radius = lvl?.meta.meowRadiusTiles ?? 5;
        if (lvl) {
          // Mask the wave to the tiles the sound reaches (sim line of sight from the cat's tile).
          const cl = compileLevel(lvl);
          const from = e.tile ?? { x: Math.floor(p.x), y: Math.floor(p.z) };
          const r2 = (radius + 0.75) * (radius + 0.75);
          this.waves.meow(p.x, p.z, radius, (tx, ty) => {
            const dx = tx - from.x, dy = ty - from.y;
            if (dx * dx + dy * dy > r2) return false;
            return !isOpaque(cl, tx, ty, cur.doorsOpen) && lineOfSight(cl, from, { x: tx, y: ty }, cur.doorsOpen);
          });
        } else this.rings.meow(p.x, p.z, radius);
        break;
      }
      case 'CHECKPOINT': {
        const p = tile ?? catPos(cur, e.cat ?? cur.activeIndex);
        this.particles.sparkle(p.x, p.z, PALETTE.mint);
        break;
      }
      case 'RESCUE': {
        const p = lvl ? tileCenter(lvl.crate.tile) : tile;
        if (p) {
          this.flash('#ff9ec0', 0.3);
          this.particles.hearts(p.x, p.z);
          this.particles.burst(p.x, 0.5, p.z, { count: 16, colors: ['#9b6235', '#cfc3e6'], speed: 2.4, up: 3, size: 0.09, life: 0.8 });
        }
        this.rescue.leader = e.cat ?? cur.activeIndex;
        break;
      }
      case 'WIN': {
        for (let i = 0; i < 2; i++) {
          const p = catPos(cur, i);
          this.particles.confetti(p.x, p.z);
        }
        if (this.level) {
          const c = this.level.exitCenter;
          this.rings.spawn(c.x, c.z, PALETTE.mint, 0.3, 3, 0.9, 0.9);
          this.rings.spawn(c.x, c.z, PALETTE.coin, 0.2, 2.2, 0.7, 0.8);
        }
        this.flash('#fff3d0', 0.6);
        this.iso.setZoom(this.userZoom * 1.25);
        break;
      }
      default:
        break;
    }
  }

  /** The freed shelter cat hops out of its cage, then trails the cat that rescued it. */
  private updateRescue(prev: SimState, cur: SimState, a: number, dt: number): void {
    const lv = this.level;
    const cat = lv?.crateCat;
    if (!lv || !cat) return;
    const R = this.rescue;
    if (!cur.rescued) {
      if (R.mode !== 'caged') this.resetRescue();
      return;
    }
    if (R.leader < 0) {
      // No RESCUE event seen (e.g. resumed state): the rescuer is the cat closest to the crate.
      const ct = this.levelDef!.crate.tile;
      const d = (i: number) => Math.abs(cur.cats[i].pos.x - (ct.x * SUBTILE + 8)) + Math.abs(cur.cats[i].pos.y - (ct.y * SUBTILE + 8));
      R.leader = d(0) <= d(1) ? 0 : 1;
    }
    const leaderPos = lerpPos(prev.cats[R.leader].pos, cur.cats[R.leader].pos, a, { x: 0, z: 0 });
    if (R.mode === 'caged') {
      R.mode = 'hop';
      R.t = 0;
      const wp = lv.crateGroup.position;
      this.actors.add(cat.object3d);
      cat.object3d.position.set(wp.x, 0.1, wp.z);
      cat.setAnim(rowIndex(cat.sheet, 'JUMPING') >= 0 ? 'JUMPING' : 'IDLE', { restart: true });
      R.trail = [{ x: wp.x, z: wp.z }, { ...leaderPos }];
      R.lastLeader = { ...leaderPos };
      // Rescued far from the leader (e.g. the run was resumed mid-way): start next to the leader.
      if (Math.hypot(leaderPos.x - wp.x, leaderPos.z - wp.z) > 2) {
        R.trail = [{ ...leaderPos }];
        cat.object3d.position.set(leaderPos.x, 0.1, leaderPos.z);
      }
    }
    R.t += dt;
    const o = cat.object3d;
    // Grow from the in-cage scale to full size during the hop.
    const s = Math.min(1, 0.78 + R.t * 0.6);
    o.scale.setScalar(s / 0.78);

    // Leader trail (reset on teleports, e.g. the leader got spotted).
    const jump = Math.hypot(leaderPos.x - R.lastLeader.x, leaderPos.z - R.lastLeader.z);
    if (jump > 1.2) {
      R.trail = [{ ...leaderPos }];
      this.particles.puff(o.position.x, o.position.z);
      o.position.set(leaderPos.x, 0, leaderPos.z);
    } else if (jump > 0.04) {
      R.trail.push({ ...leaderPos });
    }
    if (jump > 0.04 || jump > 1.2) R.lastLeader = { ...leaderPos };
    if (R.trail.length > 200) R.trail.splice(0, R.trail.length - 200);

    if (R.mode === 'hop') {
      o.position.y = 0.1 + Math.max(0, Math.sin(Math.min(1, R.t / 0.6) * Math.PI)) * 0.5;
      if (R.t > 0.7) {
        R.mode = 'follow';
        o.position.y = 0;
      }
      cat.update(dt);
      return;
    }
    // Target: ~0.95 tiles behind the leader along its path.
    let dist = 1.1;
    let tx = R.trail[R.trail.length - 1].x;
    let tz = R.trail[R.trail.length - 1].z;
    for (let i = R.trail.length - 1; i > 0; i--) {
      const p0 = R.trail[i], p1 = R.trail[i - 1];
      const seg = Math.hypot(p0.x - p1.x, p0.z - p1.z);
      if (seg >= dist) {
        const k = dist / seg;
        tx = p0.x + (p1.x - p0.x) * k;
        tz = p0.z + (p1.z - p0.z) * k;
        dist = 0;
        break;
      }
      dist -= seg;
      tx = p1.x;
      tz = p1.z;
    }
    const dx = tx - o.position.x;
    const dz = tz - o.position.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, (d > 0.02 ? 2.4 + d * 3 : 0) * dt);
    if (d > 1e-4 && step > 0) {
      o.position.x += (dx / d) * step;
      o.position.z += (dz / d) * step;
      const sx = dx * Math.cos(CAMERA_YAW) - dz * Math.sin(CAMERA_YAW);
      if (Math.abs(sx) > 1e-3) cat.setFacing(sx > 0 ? 1 : -1);
    }
    cat.setAnim(step > 0.004 ? 'WALKING' : 'SITTING');
    cat.update(dt);
  }

  /** Full-screen flash (post pass on high tier; skipped on low, the UI has its own). */
  private flash(color: string, amount: number): void {
    if (this.reduced) amount *= 0.3;
    this.flashColor = color;
    this.flashAmt = Math.max(this.flashAmt, amount);
  }

  private placeLights(): void {
    const t = this.iso.target;
    const vh = this.iso.viewHeight();
    const aspect = this.el ? Math.max(0.2, this.el.clientWidth / Math.max(1, this.el.clientHeight)) : 16 / 9;
    const half = Math.max(vh * aspect, vh * 1.8) * 0.62;
    const cam = this.sun.shadow.camera;
    if (cam.right !== half) {
      cam.left = -half;
      cam.right = half;
      cam.top = half;
      cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
    // Snap the shadow camera to shadow-map texels to avoid shimmering while the camera glides.
    const texel = (2 * half) / this.opts.shadowMapSize;
    const sx = Math.round(t.x / texel) * texel;
    const sz = Math.round(t.z / texel) * texel;
    this.sun.position.set(sx - 4, 11, sz + 6.5);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();
    this.fill.position.set(t.x + 8, 4, t.z + 1);
    this.fill.target.position.set(t.x, 0, t.z);
    this.fill.target.updateMatrixWorld();
    this.rim.position.set(t.x - 5, 7, t.z - 7);
    this.rim.target.position.set(t.x, 0, t.z);
    this.rim.target.updateMatrixWorld();
  }

  private logStats(): void {
    if (!this.opts.logStats) return;
    const s = this.lastStats;
    const over = s.calls > BUDGET.calls || s.triangles > BUDGET.triangles;
    if (over && !this.overBudgetWarned) {
      this.overBudgetWarned = true;
      console.warn(`[render] over budget: ${s.calls} draw calls (max ${BUDGET.calls}), ${s.triangles} triangles (max ${BUDGET.triangles})`);
    }
    if (this.time >= this.statsNext) {
      this.statsNext = this.time + 10;
      console.info(`[render] ${s.calls} draw calls, ${s.triangles} triangles (budget ${BUDGET.calls} / ${BUDGET.triangles})`);
    }
  }
}

/** Factory used by the app layer. */
export function createRenderer(options?: GameRendererOptions): GameRenderer {
  return new GameRenderer(options);
}

