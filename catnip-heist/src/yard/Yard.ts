/**
 * Cat Yard: a garden plaza where every breed from the manifest wanders, sits, grooms and naps.
 * Separate from the heist (no sim), its own renderer and loop.
 *
 *   const yard = createYard(el, manifest, { onSelect: (id) => ... });
 *   await yard.ready;          // all sheets loaded
 *   yard.dispose();            // leaving the yard
 *
 * Budget: 1 draw call per cat (58) + garden (1) + glow (1) + water (1) + droplets (1) +
 * blob shadows (1) + selection ring (1). Cats use the low-detail slab extrusion unless the camera
 * is zoomed in (then on-screen cats switch to full detail, capped) or the cat is selected.
 * Camera: drag to pan, wheel / pinch to zoom, tap a cat for its name card.
 */
import * as THREE from 'three';
import { ASSET_BASE, type AssetManifest, type SheetEntry } from '../types';
import { getFrameGeometry, loadVoxelSheet, rowIndex, SPRITE_EXTRUDE, SPRITE_EXTRUDE_LOD, type VoxelSheet } from '../render/voxel/sheets';
import { VoxelSprite } from '../render/voxel/VoxelSprite';
import { PostFX } from '../render/post';
import { startTier, type QualityTier } from '../render/quality';
import { ensureStyles } from '../ui/styles';
import { createPortrait } from '../ui/portraits';
import { h, prefersReducedMotion } from '../ui/dom';
import { buildGarden, SKY_GLSL, type Garden } from './garden';
import { BEHAVIOUR_LABEL, BEHAVIOUR_ROW, createAgent, poke, release, stepAgents, type YardAgent } from './wander';

export interface YardOptions {
  base?: string;
  /** Called when a cat is selected (tap) or deselected (null). */
  onSelect?(id: string | null): void;
  /** If set, the name card shows a button (label `chooseLabel`) that calls this. */
  onChoose?(id: string): void;
  chooseLabel?: string;
  /** 'auto' (default): LOD by zoom; 'low': always slab; 'high': always full detail. */
  detail?: 'auto' | 'low' | 'high';
  /** Max device pixel ratio. Default 2. */
  maxPixelRatio?: number;
  /** Start the render loop immediately. Default true. */
  autoStart?: boolean;
  /** Subset of cat ids to show (default: all cats in the manifest). */
  cats?: string[];
}

export interface YardStats {
  calls: number;
  triangles: number;
  cats: number;
  loaded: number;
  hiDetail: number;
  fps: number;
  zoom: number;
  /** Cat frames still queued for background extrusion. */
  pendingFrames: number;
}

export interface YardAPI {
  readonly el: HTMLElement;
  /** Resolves when every cat sheet is loaded and placed. */
  readonly ready: Promise<void>;
  readonly selected: string | null;
  start(): void;
  stop(): void;
  select(id: string | null): void;
  /** Pan the camera to a cat (and select it). */
  focus(id: string): void;
  setZoom(z: number): void;
  stats(): YardStats;
  /** Positions of every cat projected to CSS pixels (QA / tests). */
  screenPositions(): { id: string; x: number; y: number; visible: boolean }[];
  dispose(): void;
}

const YAW = Math.PI / 4;
const PITCH = (35 * Math.PI) / 180;
const CAM_DIST = 60;
const CAT_SCALE = 1 / 20;
const ZOOM_MIN = 0.7, ZOOM_MAX = 3.2, HI_ZOOM = 1.7, HI_CAP = 26;

const PREWARM_ROWS = ['IDLE', 'WALKING', 'SITTING', 'GROOMING', 'LOAF', 'SLEEP', 'RUNNING', 'DIGGING', 'JUMPING'];
/** Milliseconds per frame spent pre-building cat geometry. */
const PREWARM_BUDGET_MS = 4;
const FAVOURITES = ['the fountain rim', 'sunny benches', 'the cardboard box', 'the cat tower', 'yarn balls', 'flower beds', 'tree shade', 'the food bowls', 'belly rubs', 'zoomies at dusk'];
const QUIRKS = ['chirps at birds', 'naps in loaves', 'slow-blinks at everyone', 'talks back', 'loves a head bump', 'purrs like an engine', 'kneads blankets', 'chases leaves', 'sleeps belly-up', 'counts catnip'];

interface CatSlot {
  entry: SheetEntry;
  agent: YardAgent;
  sheet: VoxelSheet | null;
  lo: VoxelSprite | null;
  hi: VoxelSprite | null;
  cur: VoxelSprite | null;
  row: string;
  faceX: 1 | -1;
}

const YARD_CSS = `
.chy-root { position: absolute; inset: 0; overflow: hidden; touch-action: none; cursor: grab;
  background: linear-gradient(160deg, #ffd9a0 0%, #f6b9cf 45%, #b68ad8 100%); }
.chy-root.chy-drag { cursor: grabbing; }
.chy-root.chy-hover { cursor: pointer; }
.chy-root canvas { display: block; width: 100%; height: 100%; outline: none; }
.chy-label { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); padding: 3px 10px; border-radius: 10px;
  background: var(--ch-coin); color: var(--ch-ol); border: 3px solid var(--ch-ol); box-shadow: 0 3px 0 var(--ch-ol); font-size: 16px; white-space: nowrap; pointer-events: none; display: none; }
.chy-card { position: absolute; left: 12px; right: 12px; margin: 0 auto; bottom: calc(var(--ch-sab) + 14px); max-width: 380px;
  display: none; gap: 12px; align-items: center; padding: 12px 14px; pointer-events: auto; animation: ch-pop .25s ease-out both; }
.chy-card.chy-on { display: flex; }
.chy-card canvas { width: 80px; height: 80px; flex: 0 0 80px; image-rendering: pixelated; border-radius: 12px; background: radial-gradient(circle at 50% 70%, rgba(255,201,60,.35), rgba(0,0,0,0) 70%); }
.chy-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; text-align: left; }
.chy-info h3 { margin: 0; font-size: 26px; color: var(--ch-coin); font-weight: normal; text-shadow: 0 2px 0 var(--ch-ol); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chy-info p { margin: 0; font-family: system-ui, sans-serif; font-size: 13px; color: var(--ch-lilac); }
.chy-info .chy-act { color: var(--ch-mint); font-family: 'Cat Paw', system-ui, sans-serif; font-size: 16px; }
.chy-btns { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.chy-btns .ch-btn { min-height: 40px; padding: 6px 14px; font-size: 15px; border-radius: 12px; }
.chy-close { position: absolute; top: -14px; right: -14px; width: 40px !important; height: 40px !important; min-width: 40px; min-height: 40px !important; font-size: 18px !important; }
.chy-zoom { position: absolute; right: calc(var(--ch-sar) + 12px); bottom: calc(var(--ch-sab) + 14px); display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.chy-card.chy-on ~ .chy-zoom { bottom: calc(var(--ch-sab) + 150px); }
@media (max-width: 520px) {
  .chy-zoom { display: none; }
  .ch-yard-title { top: calc(var(--ch-sat) + 70px) !important; }
  .ch-yard-title .ch-sub { display: none; }
}
`;

let yardCssInjected = false;

let sharedYardRenderer: THREE.WebGLRenderer | null = null;

export function createYard(container: HTMLElement, manifest: AssetManifest, opts: YardOptions = {}): YardAPI {
  const base = opts.base ?? ASSET_BASE;
  ensureStyles(base);
  if (!yardCssInjected) {
    yardCssInjected = true;
    const st = document.createElement('style');
    st.dataset.ch = 'yard';
    st.textContent = YARD_CSS;
    document.head.appendChild(st);
  }
  const reduced = prefersReducedMotion();
  const detail = opts.detail ?? 'auto';

  // ---- DOM ----------------------------------------------------------------------------------
  const root = h('div.chy-root', { 'data-yard': '' });
  container.appendChild(root);
  const initialTier = startTier();
  let tier: QualityTier = initialTier.tier;
  const probe = initialTier.probe;
  // One WebGL context for every Yard visit: re-creating it each time would recompile every shader
  // (seconds on weak GPUs) and pile up contexts. Materials are left undisposed on exit so their
  // compiled programs stay cached for the next visit.
  const renderer = sharedYardRenderer ?? (sharedYardRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
  const maxPR = opts.maxPixelRatio ?? 2;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, tier === 'high' ? maxPR : Math.min(maxPR, 1.5));
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf6b9cf, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Stats must cover every pass (shadow map + scene + post), so reset once per frame by hand.
  renderer.info.autoReset = false;
  root.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Cat Yard: drag to look around, tap a cat');
  renderer.domElement.tabIndex = 0;

  const overlay = h('div.ch-ui');
  root.appendChild(overlay);
  const label = h('div.chy-label');
  overlay.appendChild(label);

  // ---- scene --------------------------------------------------------------------------------
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  // Golden hour: a warm low sun from the upper left (long shadows to the right), a cool lavender
  // fill from the other side and a peach sky / plum ground hemisphere.
  const hemi = new THREE.HemisphereLight(0xffe2c4, 0x7a4aa8, 1.2);
  const sun = new THREE.DirectionalLight(0xffb86e, 2.45);
  const SUN_DIR = new THREE.Vector3(-6, 7.5, 11).normalize();
  sun.position.copy(SUN_DIR).multiplyScalar(40);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  {
    const c = sun.shadow.camera;
    c.left = -21;
    c.right = 21;
    c.top = 17;
    c.bottom = -17;
    c.near = 5;
    c.far = 80;
    c.updateProjectionMatrix();
  }
  const fill = new THREE.DirectionalLight(0xa9a4ff, 0.7);
  fill.position.set(10, 6, -9);
  scene.add(hemi, sun, sun.target, fill, new THREE.AmbientLight(0xfff0e6, 0.18));

  const garden: Garden = buildGarden();
  scene.add(garden.group);

  // Sky / far haze backdrop: a full-screen quad behind everything (same gradient the far meadow
  // fades into, so the world dissolves into the golden-hour sky instead of ending at an edge).
  const skyMat = new THREE.ShaderMaterial({
    uniforms: garden.sky,
    depthWrite: false,
    depthTest: false,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }',
    fragmentShader: `${SKY_GLSL}\nvoid main() { gl_FragColor = vec4(skyAt(gl_FragCoord.xy / uRes), 1.0);\n#include <colorspace_fragment>\n}`,
  });
  const skyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -100;
  skyMesh.name = 'sky';
  skyMesh.matrixAutoUpdate = false;
  scene.add(skyMesh);

  // Soft radial texture for blob shadows and lamp light pools.
  const softTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  // Warm light pools under the lamp posts and around the fountain (additive, one draw call).
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xffc27a, map: softTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, garden.lamps.length);
  garden.lamps.forEach((l, i) => pools.setMatrixAt(i, new THREE.Matrix4().makeScale(3.6, 1, 3.6).setPosition(l.x, 0.07, l.z)));
  pools.name = 'light-pools';
  pools.renderOrder = 1;
  pools.matrixAutoUpdate = false;
  scene.add(pools);

  // Butterflies: instanced voxel bodies whose wings flap in the vertex shader (one draw call).
  const BUTTERFLIES = 9;
  const bfGeo = (() => {
    const g = new THREE.BoxGeometry(0.035, 0.035, 0.16);
    const wl = new THREE.BoxGeometry(0.15, 0.012, 0.15).translate(-0.093, 0, 0.01);
    const wr = new THREE.BoxGeometry(0.15, 0.012, 0.15).translate(0.093, 0, 0.01);
    const parts = [g, wl, wr];
    const pos: number[] = [], nor: number[] = [], col: number[] = [], wing: number[] = [], idx: number[] = [];
    let base = 0;
    parts.forEach((p, k) => {
      const pa = p.attributes.position, na = p.attributes.normal;
      for (let i = 0; i < pa.count; i++) {
        pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
        nor.push(na.getX(i), na.getY(i), na.getZ(i));
        const c = k === 0 ? 0.18 : 1;
        col.push(c, c, c);
        wing.push(k === 0 ? 0 : 1);
      }
      const ix = p.index!;
      for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
      base += pa.count;
      p.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
    out.setIndex(idx);
    return out;
  })();
  const bfTime = { value: 0 };
  const bfMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a1a2a });
  bfMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = bfTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWing;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (aWing > 0.5) {
          float a = sin(uTime * 15.0 + float(gl_InstanceID) * 1.9) * 1.05;
          float ax = abs(transformed.x);
          transformed.y += ax * sin(a);
          transformed.x = sign(transformed.x) * ax * cos(a);
        }`,
      );
  };
  bfMat.customProgramCacheKey = () => 'yard-butterfly';
  const butterflies = new THREE.InstancedMesh(bfGeo, bfMat, BUTTERFLIES);
  const bfCols = [0xff7aa2, 0xffc93c, 0xc4e2fc, 0xf0c5fd, 0xffffff, 0xee642a, 0xd5f4e5, 0xff7aa2, 0xffc93c];
  const bfPath = Array.from({ length: BUTTERFLIES }, (_, i) => {
    const homes = [[-11, -3.2], [-11, 3.2], [11, 3.2], [11.5, -3.2], [-2.6, -7.8], [2.6, 7.8], [0, 0], [-6, 0], [6, 0]];
    const [hx, hz] = homes[i % homes.length];
    return { hx, hz, r: 1.2 + (i % 3) * 0.6, a: 0.35 + (i % 4) * 0.12, b: 0.5 + (i % 5) * 0.1, p: i * 2.1 };
  });
  bfCols.forEach((c, i) => butterflies.setColorAt(i, new THREE.Color(c)));
  butterflies.frustumCulled = false;
  butterflies.name = 'butterflies';
  butterflies.matrixAutoUpdate = false;
  scene.add(butterflies);

  // Blob shadows (one instanced draw call).
  const shadowGeo = new THREE.PlaneGeometry(0.95, 0.95);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x3a1640, map: softTex, transparent: true, opacity: 0.5, depthWrite: false });
  const allIds = opts.cats?.length ? opts.cats : manifest.cats.map((c) => c.id);
  const entries = allIds.map((id) => manifest.cats.find((c) => c.id === id)).filter((e): e is SheetEntry => !!e);
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, Math.max(1, entries.length));
  shadows.name = 'cat-shadows';
  shadows.matrixAutoUpdate = false;
  shadows.renderOrder = 1;
  shadows.frustumCulled = false;
  scene.add(shadows);

  // Fountain droplets (one instanced draw call).
  const DROPS = 28;
  const dropGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe4f6ff).multiplyScalar(1.12) });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, DROPS);
  drops.name = 'drops';
  drops.matrixAutoUpdate = false;
  drops.frustumCulled = false;
  scene.add(drops);
  const dropSeed = Array.from({ length: DROPS }, (_, i) => ({ a: (i / DROPS) * Math.PI * 2 + (i % 3) * 0.4, v: 1.0 + ((i * 7) % 5) * 0.12, t: (i * 0.137) % 1 }));

  // Selection ring.
  const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc93c).multiplyScalar(1.8), transparent: true, opacity: 0.95, depthWrite: false }));
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);

  // ---- cats ---------------------------------------------------------------------------------
  const world = garden.world;
  const agents: YardAgent[] = [];
  const slots: CatSlot[] = entries.map((entry) => {
    const agent = createAgent(entry.id, world, agents);
    agents.push(agent);
    return { entry, agent, sheet: null, lo: null, hi: null, cur: null, row: '', faceX: agent.rng & 1 ? 1 : -1 };
  });
  const meshToSlot = new Map<THREE.Object3D, number>();
  const prewarm: (() => unknown)[] = [];
  let prewarmHead = 0;
  /** Queue the frames the yard will play so extrusion happens in small slices, not mid-animation. */
  function queuePrewarm(sheet: VoxelSheet, ex: typeof SPRITE_EXTRUDE) {
    for (const name of PREWARM_ROWS) {
      const r = rowIndex(sheet, name);
      for (let f = 0; r >= 0 && f < sheet.rows[r].frames; f++) prewarm.push(() => getFrameGeometry(sheet, r, f, ex));
    }
  }
  let loaded = 0;

  function makeSprite(slot: CatSlot, idx: number, hi: boolean): VoxelSprite {
    // Full-detail cats (zoomed in / selected) also cast real shadows on the high tier; the crowd
    // relies on the soft blob shadows so the shadow pass stays inside the draw-call budget.
    const s = new VoxelSprite(slot.sheet!, { scale: CAT_SCALE, extrude: hi ? SPRITE_EXTRUDE : SPRITE_EXTRUDE_LOD, phase: ((idx * 0.618) % 1), castShadow: hi && tier === 'high' });
    s.object3d.rotation.y = YAW;
    s.setFacing(slot.faceX);
    meshToSlot.set(s.mesh, idx);
    scene.add(s.object3d);
    if (hi && detail === 'auto') queuePrewarm(slot.sheet!, SPRITE_EXTRUDE);
    return s;
  }

  const ready = Promise.all(
    slots.map((slot, i) =>
      loadVoxelSheet(slot.entry, base)
        .then((sheet) => {
          if (disposed) return;
          slot.sheet = sheet;
          slot.lo = makeSprite(slot, i, detail === 'high');
          slot.cur = slot.lo;
          loaded++;
          queuePrewarm(sheet, detail === 'high' ? SPRITE_EXTRUDE : SPRITE_EXTRUDE_LOD);
        })
        .catch((err) => console.warn('[yard] sheet failed', slot.entry.id, err)),
    ),
  ).then(() => undefined);

  // ---- camera state ------------------------------------------------------------------------
  const target = new THREE.Vector3(0, 0, 0.5);
  const vel = new THREE.Vector2();
  let zoom = 1;
  let zoomGoal = 1;
  let viewW = 1, viewH = 1;
  let followIdx = -1;
  const camDir = new THREE.Vector3(Math.sin(YAW) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(YAW) * Math.cos(PITCH));
  const right = new THREE.Vector3(Math.cos(YAW), 0, -Math.sin(YAW));
  const fwd = new THREE.Vector3(-Math.sin(YAW), 0, -Math.cos(YAW));

  function baseHeight(): number {
    // World units visible vertically at zoom 1: fit the plaza on landscape, crop on portrait.
    const aspect = viewW / Math.max(1, viewH);
    return Math.min(30, Math.max(17, 26 / Math.max(0.5, aspect)));
  }
  /** Inputs of the last applyCamera(), so an idle camera costs nothing per frame. */
  let camX = NaN, camZ = NaN, camZoom = NaN, camW = 0, camH = 0;
  function cameraMoved(): boolean {
    return target.x !== camX || target.z !== camZ || zoom !== camZoom || viewW !== camW || viewH !== camH;
  }
  function applyCamera() {
    const halfH = baseHeight() / (2 * zoom);
    const halfW = halfH * (viewW / Math.max(1, viewH));
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    clampTarget();
    camera.position.copy(target).addScaledVector(camDir, CAM_DIST);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    camX = target.x;
    camZ = target.z;
    camZoom = zoom;
    camW = viewW;
    camH = viewH;
  }
  function clampTarget() {
    // In camera axes: the further out the zoom, the less you can pan, so the garden always fills
    // the view (at full zoom-out it stays centred); zoomed in you can still reach the edges.
    const halfH = baseHeight() / (2 * zoom);
    const halfW = halfH * (viewW / Math.max(1, viewH));
    const extR = garden.halfX * Math.abs(right.x) + garden.halfZ * Math.abs(right.z);
    const extF = garden.halfX * Math.abs(fwd.x) + garden.halfZ * Math.abs(fwd.z);
    const maxR = Math.max(1.5, extR - 1.1 * halfW);
    const maxF = Math.max(1.5, extF - (1.1 * halfH) / Math.sin(PITCH));
    const r = target.x * right.x + target.z * right.z;
    const f = target.x * fwd.x + target.z * fwd.z;
    const rc = Math.max(-maxR, Math.min(maxR, r));
    const fc = Math.max(-maxF, Math.min(maxF, f));
    target.x = right.x * rc + fwd.x * fc;
    target.z = right.z * rc + fwd.z * fc;
    target.x = Math.max(-garden.halfX + 2, Math.min(garden.halfX - 2, target.x));
    target.z = Math.max(-garden.halfZ + 2, Math.min(garden.halfZ - 2, target.z));
  }
  function unitsPerPx(): number {
    return baseHeight() / zoom / Math.max(1, viewH);
  }
  function panBy(dxPx: number, dyPx: number) {
    const u = unitsPerPx();
    target.addScaledVector(right, -dxPx * u);
    target.addScaledVector(fwd, (dyPx * u) / Math.sin(PITCH));
    followIdx = -1;
  }
  function setZoomGoal(z: number, immediate = false) {
    zoomGoal = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
    if (immediate || reduced) zoom = zoomGoal;
  }

  const resize = () => {
    const r = root.getBoundingClientRect();
    viewW = Math.max(1, Math.round(r.width));
    viewH = Math.max(1, Math.round(r.height));
    renderer.setSize(viewW, viewH, false);
    post?.setSize(viewW, viewH);
    renderer.getDrawingBufferSize(garden.sky.uRes.value);
    applyCamera();
  };
  // ---- quality tier ------------------------------------------------------------------------
  let post: PostFX | null = null;
  function applyTier() {
    const hi = tier === 'high';
    sun.castShadow = hi;
    garden.setShadows(hi);
    for (const s of slots) if (s.hi) s.hi.mesh.castShadow = hi;
    if (hi && !post) {
      post = new PostFX(renderer, scene, camera, {
        bloomStrength: 0.55,
        bloomRadius: 0.5,
        bloomThreshold: 1.0,
        exposure: 1.02,
        shadowTint: [0.02, 0.004, 0.035],
        highlightTint: [1.05, 1.0, 0.9],
        saturation: 1.1,
        contrast: 1.05,
        vignette: 0.32,
        vignetteColor: [0.12, 0.03, 0.14],
      });
    } else if (!hi && post) {
      post.dispose();
      post = null;
    }
    renderer.setPixelRatio(pixelRatio());
  }
  applyTier();

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(root);
  window.addEventListener('resize', resize);
  resize();

  // ---- pointer input -----------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt = { x: 0, y: 0, t: 0 };
  let moved = 0;
  let pinchDist = 0;
  let lastMoveT = 0;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickAt(clientX: number, clientY: number): number {
    const r = root.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const meshes: THREE.Object3D[] = [];
    for (const s of slots) if (s.cur) meshes.push(s.cur.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (hit) return meshToSlot.get(hit.object) ?? -1;
    // Forgiving tap: nearest cat to the ray on the ground plane within 0.7 units.
    const p = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    if (!raycaster.ray.intersectPlane(plane, p)) return -1;
    let best = -1, bd = 0.7 * 0.7;
    slots.forEach((s, i) => {
      if (!s.cur) return;
      const d = (s.agent.x - p.x) ** 2 + (s.agent.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  const el = renderer.domElement;
  // The canvas is shared between visits: every listener goes away with this visit.
  const listen = new AbortController();
  el.addEventListener('pointerdown', (e) => {
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      moved = 0;
      vel.set(0, 0);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      moved = 99;
    }
    root.classList.add('chy-drag');
  }, { signal: listen.signal });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      // Hover cursor (mouse only, throttled).
      const now = performance.now();
      if (e.pointerType === 'mouse' && now - lastMoveT > 90) {
        lastMoveT = now;
        root.classList.toggle('chy-hover', pickAt(e.clientX, e.clientY) >= 0);
      }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        panBy(dx, dy);
        const now = performance.now();
        const dt = Math.max(1, now - lastMoveT);
        lastMoveT = now;
        vel.set((dx / dt) * 16, (dy / dt) * 16);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) setZoomGoal(zoomGoal * (d / pinchDist), true);
      pinchDist = d;
      panBy(dx / 2, dy / 2);
    }
  }, { signal: listen.signal });
  const endPointer = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      root.classList.remove('chy-drag');
      const quick = performance.now() - downAt.t < 450;
      if (moved <= 6 && quick && e.type === 'pointerup') {
        const idx = pickAt(e.clientX, e.clientY);
        select(idx >= 0 ? slots[idx].entry.id : null);
        vel.set(0, 0);
      } else if (reduced || performance.now() - lastMoveT > 80) vel.set(0, 0);
    } else if (pointers.size === 1) {
      pinchDist = 0;
      vel.set(0, 0);
    }
  };
  el.addEventListener('pointerup', endPointer, { signal: listen.signal });
  el.addEventListener('pointercancel', endPointer, { signal: listen.signal });
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setZoomGoal(zoomGoal * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016)));
    },
    { passive: false, signal: listen.signal },
  );
  el.addEventListener('keydown', (e) => {
    const step = 40;
    if (e.key === 'ArrowLeft') panBy(step, 0);
    else if (e.key === 'ArrowRight') panBy(-step, 0);
    else if (e.key === 'ArrowUp') panBy(0, step);
    else if (e.key === 'ArrowDown') panBy(0, -step);
    else if (e.key === '+' || e.key === '=') setZoomGoal(zoomGoal * 1.25);
    else if (e.key === '-') setZoomGoal(zoomGoal / 1.25);
    else return;
    e.preventDefault();
  }, { signal: listen.signal });

  // Escape closes the name card first (capture phase, before the UI's "leave yard" handler).
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selected) {
      select(null);
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onEscape, true);

  // Zoom buttons (desktop).
  const zoomBtn = (txt: string, k: number, lbl: string) => {
    const b = h('button.ch-btn.ch-icon.ch-ghost', { type: 'button', 'aria-label': lbl }, txt);
    b.addEventListener('click', () => setZoomGoal(zoomGoal * k));
    return b;
  };

  // ---- name card ---------------------------------------------------------------------------
  const cardPortrait = h('div');
  const cardName = h('h3');
  const cardAct = h('p.chy-act');
  const cardFact = h('p');
  const followBtn = h('button.ch-btn.ch-ghost', { type: 'button' }, 'Follow');
  const chooseBtn = opts.onChoose ? h('button.ch-btn.ch-primary', { type: 'button' }, opts.chooseLabel ?? 'Take on heist') : null;
  const closeBtn = h('button.ch-btn.ch-icon.ch-ghost.chy-close', { type: 'button', 'aria-label': 'Close' }, '✕');
  const card = h(
    'div.ch-panel.chy-card',
    { role: 'dialog', 'aria-label': 'Cat card' },
    cardPortrait,
    h('div.chy-info', null, cardName, cardAct, cardFact, h('div.chy-btns', null, followBtn, chooseBtn)),
    closeBtn,
  );
  overlay.append(card, h('div.chy-zoom', null, zoomBtn('+', 1.3, 'Zoom in'), zoomBtn('−', 1 / 1.3, 'Zoom out')));
  closeBtn.addEventListener('click', () => select(null));
  followBtn.addEventListener('click', () => {
    const i = slots.findIndex((s) => s.entry.id === selected);
    followIdx = followIdx === i ? -1 : i;
    followBtn.textContent = followIdx >= 0 ? 'Following' : 'Follow';
    if (followIdx >= 0 && zoomGoal < 1.8) setZoomGoal(2);
  });
  chooseBtn?.addEventListener('click', () => selected && opts.onChoose?.(selected));

  let selected: string | null = null;
  /** Index of the selected slot (-1: none), so the loop does not search for it every frame. */
  let selIdx = -1;
  /** Last label placement written to the DOM (style writes only when it moves). */
  let labelShown = false;
  let labelX = NaN, labelY = NaN;
  function showLabel(on: boolean) {
    if (on === labelShown) return;
    labelShown = on;
    label.style.display = on ? 'block' : 'none';
  }
  function select(id: string | null) {
    const prev = selIdx >= 0 ? slots[selIdx] : undefined;
    if (prev) release(prev.agent);
    selIdx = id ? slots.findIndex((s) => s.entry.id === id) : -1;
    selected = selIdx >= 0 ? id : null;
    const slot = selIdx >= 0 ? slots[selIdx] : undefined;
    followIdx = -1;
    followBtn.textContent = 'Follow';
    if (slot) {
      poke(slot.agent);
      cardPortrait.replaceChildren(createPortrait(slot.entry, { size: 80, base }));
      cardName.textContent = slot.entry.name;
      const seed = slot.agent.sleepy * 1000;
      cardFact.textContent = `Loves ${FAVOURITES[Math.floor(seed) % FAVOURITES.length]} and ${QUIRKS[Math.floor(slot.agent.playful * 1000) % QUIRKS.length]}.`;
      card.classList.add('chy-on');
      label.textContent = slot.entry.name;
      showLabel(true);
    } else {
      card.classList.remove('chy-on');
      showLabel(false);
    }
    opts.onSelect?.(selected);
  }

  // ---- loop ---------------------------------------------------------------------------------
  const mtx = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 0.8);
  let raf = 0;
  let last = 0;
  let running = false;
  let disposed = false;
  let fpsAcc = 0, fpsFrames = 0, fps = 0;
  let time = 0;
  let hiCount = 0;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const bfQ = new THREE.Quaternion();
  const bfUp = new THREE.Vector3(0, 1, 0);
  const bfS = new THREE.Vector3(1.8, 1.8, 1.8);

  function frame(now: number) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    time += dt;
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = Math.round(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }
    if (probe && !probe.done) {
      const t = probe.sample(dt);
      if (t === 'low' && tier !== 'low') {
        tier = 'low';
        console.info(`[quality] yard: ${probe.fps.toFixed(1)} fps -> low tier`);
        applyTier();
        resize();
      }
    }
    renderer.info.reset();
    tick(dt);
    if (post) post.render(dt);
    else renderer.render(scene, camera);
    if (prewarmHead < prewarm.length) {
      const t0 = performance.now();
      while (prewarmHead < prewarm.length && performance.now() - t0 < PREWARM_BUDGET_MS) prewarm[prewarmHead++]();
      if (prewarmHead >= prewarm.length) {
        prewarm.length = 0;
        prewarmHead = 0;
      }
    }
  }

  function tick(dt: number) {
    // Camera: zoom easing, inertia, follow.
    if (Math.abs(zoom - zoomGoal) > 1e-3) zoom += (zoomGoal - zoom) * Math.min(1, dt * 10);
    if (pointers.size === 0 && vel.lengthSq() > 0.01 && !reduced) {
      panBy(vel.x, vel.y);
      vel.multiplyScalar(Math.pow(0.02, dt));
    }
    if (followIdx >= 0) {
      const a = slots[followIdx].agent;
      const k = reduced ? 1 : Math.min(1, dt * 4);
      target.x += (a.x - target.x) * k;
      target.z += (a.z - target.z) * k;
    }
    if (cameraMoved()) applyCamera();

    stepAgents(agents, world, dt);

    const wantHi = detail === 'high' || (detail === 'auto' && zoom >= HI_ZOOM);
    if (wantHi || selIdx >= 0) {
      projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreen);
    }
    hiCount = 0;
    let hiShadows = 0;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const a = s.agent;
      if (!s.lo || !s.sheet) {
        shadows.setMatrixAt(i, zero);
        continue;
      }
      // Level of detail.
      let hi = detail === 'high';
      if (detail === 'auto') {
        const isSel = i === selIdx;
        if (isSel || (wantHi && hiCount < HI_CAP)) {
          sphere.center.set(a.x, 0.5, a.z);
          hi = frustum.intersectsSphere(sphere);
        }
      }
      if (detail === 'auto') {
        if (hi && !s.hi) s.hi = makeSprite(s, i, true);
        const want = hi ? s.hi! : s.lo;
        if (want !== s.cur) {
          if (s.cur) s.cur.object3d.visible = false;
          want.object3d.visible = true;
          want.setFacing(s.faceX);
          if (s.row) want.setAnim(s.row, { restart: true });
          s.cur = want;
        }
      }
      if (s.cur === s.hi) hiCount++;
      const sp = s.cur!;
      // Real shadows for the selected cat and a handful of full-detail ones (budget).
      sp.mesh.castShadow = tier === 'high' && sp === s.hi && (i === selIdx || hiShadows++ < 8);
      // Facing: project velocity on the camera's right vector.
      const vr = a.vx * right.x + a.vz * right.z;
      if (vr > 0.05) s.faceX = 1;
      else if (vr < -0.05) s.faceX = -1;
      sp.setFacing(s.faceX);
      const row = BEHAVIOUR_ROW[a.behaviour];
      if (row !== s.row) {
        s.row = row;
        sp.setAnim(row, { restart: true });
      }
      const hop = a.behaviour === 'HOP' && !reduced ? Math.max(0, Math.sin((0.75 - a.timer) * Math.PI * 2.6)) * 0.3 : 0;
      sp.object3d.position.set(a.x, hop, a.z);
      sp.update(dt);
      const sc = a.behaviour === 'SLEEP' || a.behaviour === 'LOAF' ? 1.15 : 1;
      mtx.makeScale(sc, 1, sc * 0.8).setPosition(a.x, 0.015, a.z);
      shadows.setMatrixAt(i, mtx);
    }
    shadows.instanceMatrix.needsUpdate = true;

    // Droplets: parabolas from the spout into the basin.
    for (let i = 0; i < DROPS; i++) {
      const d = dropSeed[i];
      const t = (time * 0.7 * d.v + d.t) % 1;
      const r = t * 1.35;
      const y = garden.spout.y + 1.2 * t - 2.6 * t * t;
      tmpV.set(Math.cos(d.a) * r, Math.max(0.36, y), Math.sin(d.a) * r);
      mtx.makeTranslation(tmpV.x, tmpV.y, tmpV.z);
      drops.setMatrixAt(i, mtx);
    }
    drops.instanceMatrix.needsUpdate = true;
    garden.water.position.y = 0.38 + Math.sin(time * 2) * 0.012;
    garden.update(reduced ? 0 : time);

    // Butterflies: lazy figure-eight loops around their home flower beds, heading along the path.
    bfTime.value = reduced ? 0.3 : time;
    for (let i = 0; i < BUTTERFLIES; i++) {
      const b = bfPath[i];
      const t = (reduced ? 0 : time) * b.a + b.p;
      const x = b.hx + Math.sin(t) * b.r;
      const z = b.hz + Math.sin(t * 2 * b.b + 0.7) * b.r * 0.7;
      const y = 0.75 + Math.sin(t * 3.1) * 0.22 + Math.sin(t * 7.3) * 0.05;
      const vx = Math.cos(t) * b.r, vz = Math.cos(t * 2 * b.b + 0.7) * b.r * 0.7 * 2 * b.b;
      bfQ.setFromAxisAngle(bfUp, Math.atan2(vx, vz));
      mtx.compose(tmpV.set(x, y, z), bfQ, bfS);
      butterflies.setMatrixAt(i, mtx);
    }
    butterflies.instanceMatrix.needsUpdate = true;

    // Selection ring + floating label.
    const sel = selIdx >= 0 ? slots[selIdx] : undefined;
    if (sel && sel.cur) {
      ring.visible = true;
      const pulse = reduced ? 1 : 1 + Math.sin(time * 5) * 0.06;
      ring.position.set(sel.agent.x, 0.03, sel.agent.z);
      ring.scale.set(pulse, 1, pulse);
      tmpV.set(sel.agent.x, 1.35, sel.agent.z).project(camera);
      const vis = tmpV.x > -1.1 && tmpV.x < 1.1 && tmpV.y > -1.1 && tmpV.y < 1.1;
      showLabel(vis);
      // Whole CSS pixels (a transform only: no layout); skip the write while the cat stays put.
      const lx = Math.round(((tmpV.x + 1) / 2) * viewW), ly = Math.round(((1 - tmpV.y) / 2) * viewH);
      if (vis && (lx !== labelX || ly !== labelY)) {
        labelX = lx;
        labelY = ly;
        label.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -100%)`;
      }
      setTextIfChanged(cardAct, BEHAVIOUR_LABEL[sel.agent.behaviour]);
    } else ring.visible = false;
  }

  function setTextIfChanged(e: HTMLElement, t: string) {
    if (e.textContent !== t) e.textContent = t;
  }

  function start() {
    if (running || disposed) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }
  if (opts.autoStart !== false) start();

  const api: YardAPI = {
    el: root,
    ready,
    get selected() {
      return selected;
    },
    start,
    stop,
    select,
    focus(id) {
      const i = slots.findIndex((s) => s.entry.id === id);
      if (i < 0) return;
      select(id);
      followIdx = i;
      followBtn.textContent = 'Following';
      if (zoomGoal < 1.8) setZoomGoal(2);
    },
    setZoom(z) {
      setZoomGoal(z, true);
      applyCamera();
    },
    stats() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        cats: slots.length,
        loaded,
        hiDetail: hiCount,
        fps,
        zoom,
        pendingFrames: prewarm.length - prewarmHead,
      };
    },
    screenPositions() {
      return slots.map((s) => {
        tmpV.set(s.agent.x, 0.45, s.agent.z).project(camera);
        const r = root.getBoundingClientRect();
        return {
          id: s.entry.id,
          x: r.left + ((tmpV.x + 1) / 2) * viewW,
          y: r.top + ((1 - tmpV.y) / 2) * viewH,
          visible: !!s.cur && Math.abs(tmpV.x) <= 1 && Math.abs(tmpV.y) <= 1,
        };
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onEscape, true);
      for (const s of slots) {
        s.lo?.dispose();
        s.hi?.dispose();
      }
      post?.dispose();
      post = null;
      garden.dispose(true);
      skyMesh.geometry.dispose();
      softTex.dispose();
      poolGeo.dispose();
      pools.dispose();
      bfGeo.dispose();
      butterflies.dispose();
      shadowGeo.dispose();
      dropGeo.dispose();
      ringGeo.dispose();
      shadows.dispose();
      drops.dispose();
      listen.abort();
      renderer.renderLists.dispose();
      renderer.info.reset();
      // The shared canvas outlives this visit: detach it, or it keeps the removed root (and through
      // its listeners this whole visit: scene, cats, card) alive until the next visit.
      renderer.domElement.remove();
      root.remove();
    },
  };
  return api;
}
