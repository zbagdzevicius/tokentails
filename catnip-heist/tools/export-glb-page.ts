/**
 * Browser half of the GLB export (driven by tools/export-glb.mjs through Playwright).
 *
 * Builds the real game views (LevelView, CatView, GuardView, VoxelSprite) exactly as the game does,
 * bakes them with tools/export-bake.ts and serialises them with three's GLTFExporter. No WebGL is
 * needed: the views only use 2D canvases for textures. Exposes window.__export.
 *
 * Units: glTF metres. WORLD_SCALE metres per game tile, so a visitor avatar (about 1.7 m) walks the
 * corridors and walls (0.8 tiles) stand 2.4 m tall. Every file is centred on x/z with y = 0 on the
 * floor; +Z is the front of the characters.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AssetManifest, LevelDef, SheetEntry, SimState } from '../src/types';
import { getLevel, LEVEL_IDS } from '../src/levels';
import { initSim } from '../src/sim';
import { LevelView, tileCenter } from '../src/render/level';
import { CatView, GuardView } from '../src/render/actors';
import { DEFAULT_FPS } from '../src/render/voxel/VoxelSprite';
import { getFrameGeometry, getVoxelMaterial, loadManifest, loadVoxelSheet, rowIndex, VOXEL_WORLD_SCALE, type VoxelSheet } from '../src/render/voxel/sheets';
import { bakeScene, type BakeStats } from './export-bake';

const BASE = '/assets/';

// Actor views randomise their animation phase with Math.random: seed it so exports are reproducible.
let seed = 0x9e3779b9;
Math.random = () => {
  seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
  return seed / 4294967296;
};
/** Metres per game tile. */
export const WORLD_SCALE = 3;
/** The crew placed in every world (the game's default pick). */
const CREW: [string, string] = ['bob', 'oreo'];
const GENERATOR = 'Catnip Heist tools/export-glb.mjs (three GLTFExporter)';

export interface ExportStats extends BakeStats {
  lights: number;
  animations: number;
  size: [number, number, number];
}

export interface ExportResult {
  name: string;
  base64: string;
  stats: ExportStats;
}

/** Private LevelView members the exporter reads (no game code is changed for the export). */
interface LevelViewInternals {
  terrain: { group: THREE.Object3D; lamps: { x: number; z: number; nx: number; nz: number }[] } | null;
  doors: { def: { kind: string }; group: THREE.Object3D }[];
  plates: { pad: THREE.Object3D }[];
  checkpoints: { mesh: THREE.Mesh | null }[];
  coinMesh: THREE.InstancedMesh | null;
  keyGroup: THREE.Group | null;
  crateGroup: THREE.Group;
  exitCenter: THREE.Vector3;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let manifest: Promise<AssetManifest> | null = null;
const getManifest = () => (manifest ??= loadManifest(BASE));

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function toGlb(scene: THREE.Object3D, animations: THREE.AnimationClip[] = []): Promise<ArrayBuffer> {
  const out = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, animations });
  return out as ArrayBuffer;
}

function sizeOf(o: THREE.Object3D): [number, number, number] {
  const b = new THREE.Box3().setFromObject(o);
  const s = b.getSize(new THREE.Vector3());
  return [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)];
}

async function finish(name: string, root: THREE.Object3D, stats: BakeStats, animations: THREE.AnimationClip[] = []): Promise<ExportResult> {
  let lights = 0;
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) lights++;
  });
  const size = sizeOf(root);
  const buf = await toGlb(root, animations);
  return { name, base64: toBase64(buf), stats: { ...stats, lights, animations: animations.length, size } };
}

/** Initial sim state of a level, optionally with every door open so the world can be walked. */
function levelState(level: LevelDef, openDoors: boolean): SimState {
  const s = initSim(level, 1, CREW);
  return openDoors ? { ...s, doorsOpen: s.doorsOpen.map(() => true) } : s;
}

async function buildLevelView(level: LevelDef, state: SimState): Promise<LevelView> {
  const lv = new LevelView(level, { manifest: getManifest(), base: BASE, shadows: false });
  await lv.ready;
  // A long dt settles every door, plate and cage on its goal state in one step.
  lv.update(state, 10, 0);
  return lv;
}

function sheetEntry(m: AssetManifest, kind: 'cat' | 'dog', id: string): SheetEntry {
  const list = kind === 'cat' ? m.cats : m.dogs;
  const e = list.find((x) => x.id === id);
  if (!e) throw new Error(`unknown ${kind} ${id}`);
  return e;
}

/** Glow and light "hints" for a world: sun + lamp, crate, key and portal point lights (at most 16). */
function addLights(out: THREE.Group, lv: LevelView, level: LevelDef, toWorld: (x: number, y: number, z: number) => THREE.Vector3): void {
  const lights = new THREE.Group();
  lights.name = 'lighting-hints';
  const sun = new THREE.DirectionalLight('#ffd39c', 1.75);
  sun.name = 'sun';
  // glTF directional lights shine down their node's -Z: aim the node, keep the target a child.
  sun.position.set(0, 30, 0);
  sun.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0.45, -1, 0.3).normalize());
  sun.add(sun.target);
  sun.target.position.set(0, 0, -1);
  lights.add(sun);
  const point = (name: string, color: string, p: THREE.Vector3, intensity: number, range: number) => {
    const l = new THREE.PointLight(color, intensity, range, 2);
    l.name = name;
    l.position.copy(p);
    lights.add(l);
  };
  const S = WORLD_SCALE;
  const c = tileCenter(level.crate.tile);
  point('crate-light', '#ff7aa2', toWorld(c.x, 1.6, c.z), 30 * S, 4 * S);
  const e = (lv as unknown as LevelViewInternals).exitCenter;
  point('portal-light', '#7cffc4', toWorld(e.x, 1.2, e.z), 25 * S, 4 * S);
  if (level.key) {
    const k = tileCenter(level.key.tile);
    point('key-light', '#ffc93c', toWorld(k.x, 1.0, k.z), 15 * S, 3 * S);
  }
  const lamps = (lv as unknown as LevelViewInternals).terrain?.lamps ?? [];
  const n = Math.min(lamps.length, 16 - lights.children.length);
  for (let i = 0; i < n; i++) {
    const l = lamps[Math.floor((i * lamps.length) / n)];
    point(`lamp-${i}`, '#ffb866', toWorld(l.x + l.nx * 0.3, 0.7, l.z + l.nz * 0.3), 8 * S, 3 * S);
  }
  out.add(lights);
}

/** One heist as a complete world: terrain, props, crew, guards, the shelter-cat crate, light hints. */
async function exportLevel(id: string, opts: { openDoors?: boolean } = {}): Promise<ExportResult> {
  const level = getLevel(id);
  const m = await getManifest();
  const state = levelState(level, opts.openDoors ?? true);
  const lv = await buildLevelView(level, state);
  const root = new THREE.Group();
  root.add(lv.group);
  for (let i = 0; i < 2; i++) {
    const v = new CatView(await loadVoxelSheet(sheetEntry(m, 'cat', CREW[i]), BASE));
    v.update(state.cats[i], state.cats[i], 1, 0, true, false);
    root.add(v.group);
  }
  const marks = { q: null, e: null };
  for (const g of state.guards) {
    const def = level.guards.find((d) => d.id === g.id)!;
    const v = new GuardView(await loadVoxelSheet(sheetEntry(m, 'dog', def.sprite), BASE));
    v.update(g, g, 1, 1 / 60, 0, marks);
    root.add(v.group);
  }
  const w = lv.width, h = lv.height, S = WORLD_SCALE;
  const post = new THREE.Matrix4().makeScale(S, S, S).multiply(new THREE.Matrix4().makeTranslation(-w / 2, 0, -h / 2));
  const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(post);
  const name = `${id}-${slug(level.meta.name ?? id)}`;
  const { group, stats } = bakeScene(root, { matrix: post, name });
  const out = new THREE.Group();
  out.name = name;
  out.add(group);
  addLights(out, lv, level, toWorld);
  const crate = toWorld(tileCenter(level.crate.tile).x, 0, tileCenter(level.crate.tile).z);
  const shelterCat = m.cats.find((c) => c.id === level.crate.catId)?.name ?? level.crate.catId;
  out.userData = {
    title: `Catnip Heist: ${level.meta.name}`,
    level: id,
    generator: GENERATOR,
    metresPerTile: S,
    tiles: [w, h],
    centrepiece: { name: 'shelter-cat crate', cat: shelterCat, position: crate.toArray().map((v) => +v.toFixed(2)) },
    crew: CREW,
    guards: level.guards.map((g) => g.sprite),
    doors: opts.openDoors ?? true ? 'open (walkable)' : 'as in the game',
  };
  lv.dispose();
  return finish(name, out, stats);
}

/**
 * A voxel cat or guard dog. Static: one pose. Animated: every frame of two rows as sibling nodes,
 * with glTF animations that step each frame's scale between 0 and 1 (flipbook, no skinning).
 */
async function exportCharacter(kind: 'cat' | 'dog', id: string, animated: boolean): Promise<ExportResult> {
  const m = await getManifest();
  const sheet: VoxelSheet = await loadVoxelSheet(sheetEntry(m, kind, id), BASE);
  const scale = VOXEL_WORLD_SCALE * (kind === 'dog' ? 0.92 : 1) * WORLD_SCALE;
  const clipsWanted = kind === 'cat' ? ['IDLE', 'WALKING'] : ['WALKING', 'SNIFFING'];
  const rows = clipsWanted.map((n) => ({ name: n, row: rowIndex(sheet, n) })).filter((r) => r.row >= 0);
  if (!rows.length) rows.push({ name: sheet.rows[0].name, row: 0 });
  const used = animated ? rows : rows.slice(0, 1);
  const materials = new Map<THREE.Material, THREE.Material | null>();
  const mat = getVoxelMaterial();
  const out = new THREE.Group();
  out.name = `${kind}-${id}`;
  const total: BakeStats = { meshes: 0, materials: 0, triangles: 0, vertices: 0, dropped: 0 };
  const frameNodes: { row: string; frame: number; node: THREE.Object3D }[] = [];
  for (const r of used) {
    const n = animated ? Math.max(1, sheet.rows[r.row].frames) : 1;
    for (let f = 0; f < n; f++) {
      const mesh = new THREE.Mesh(getFrameGeometry(sheet, r.row, f), mat);
      mesh.scale.setScalar(scale);
      const { group, stats } = bakeScene(mesh, { materials, name: `${r.name}_${f}` });
      for (const k of ['meshes', 'triangles', 'vertices', 'dropped'] as const) total[k] += stats[k];
      if (frameNodes.length) group.scale.setScalar(0); // only the first frame shows at rest
      out.add(group);
      frameNodes.push({ row: r.name, frame: f, node: group });
    }
  }
  total.materials = new Set([...materials.values()].filter(Boolean)).size;
  const clips: THREE.AnimationClip[] = [];
  if (animated) {
    for (const r of used) {
      const fps = DEFAULT_FPS[r.name] ?? 8;
      const count = frameNodes.filter((x) => x.row === r.name).length;
      const dur = count / fps;
      const tracks = frameNodes.map((fn) => {
        if (fn.row !== r.name) return new THREE.VectorKeyframeTrack(`${fn.node.name}.scale`, [0, dur], [0, 0, 0, 0, 0, 0], THREE.InterpolateDiscrete);
        const times: number[] = [];
        const values: number[] = [];
        for (let k = 0; k <= count; k++) {
          times.push(k / fps);
          const on = k === fn.frame ? 1 : 0;
          values.push(on, on, on);
        }
        return new THREE.VectorKeyframeTrack(`${fn.node.name}.scale`, times, values, THREE.InterpolateDiscrete);
      });
      clips.push(new THREE.AnimationClip(r.name, dur, tracks));
    }
  }
  out.userData = { title: `${sheet.name} (${kind === 'cat' ? 'voxel cat' : 'Kibble Corp guard dog'})`, generator: GENERATOR, metresPerTile: WORLD_SCALE, animations: clips.map((c) => c.name) };
  return finish(`${kind}-${id}${animated ? '-animated' : ''}`, out, total, clips);
}

const PROPS = ['shelter-crate', 'key', 'vault-door', 'plate-door', 'pressure-plate', 'exit-portal', 'catnip-coin', 'checkpoint-paw'] as const;
type PropId = (typeof PROPS)[number];

/** One prop from a level's view, centred at the origin. `source` must contain every prop kind. */
async function exportProp(prop: PropId, source = 'heist-08'): Promise<ExportResult> {
  const level = getLevel(source);
  const lv = await buildLevelView(level, levelState(level, false));
  const iv = lv as unknown as LevelViewInternals;
  const S = WORLD_SCALE;
  let target: THREE.Object3D | null = null;
  let only: Set<THREE.Object3D> | null = null;
  let center = new THREE.Vector3();
  switch (prop) {
    case 'shelter-crate':
      target = iv.crateGroup;
      break;
    case 'key':
      target = iv.keyGroup;
      break;
    case 'vault-door':
    case 'plate-door':
      target = iv.doors.find((d) => d.def.kind === (prop === 'vault-door' ? 'VAULT' : 'PLATE'))?.group ?? null;
      break;
    case 'pressure-plate':
      target = iv.plates[0]?.pad.parent ?? null;
      break;
    case 'checkpoint-paw':
      target = iv.checkpoints[0]?.mesh ?? null;
      break;
    case 'catnip-coin':
      if (iv.coinMesh) {
        const coin = new THREE.Mesh(iv.coinMesh.geometry, iv.coinMesh.material);
        coin.scale.setScalar(1 / 28);
        coin.position.y = 0.42;
        target = coin;
      }
      break;
    case 'exit-portal': {
      // The portal is several loose level children (platform, pads, swirl, pylons, sparks, sign).
      const e = iv.exitCenter;
      const tiles = level.exit.tiles;
      const r = 0.9 + 0.5 * Math.max(0, tiles.length - 1);
      only = new Set();
      for (const o of lv.group.children) {
        if (o === iv.terrain?.group) continue;
        const b = new THREE.Box3().setFromObject(o);
        if (b.isEmpty()) continue;
        const c = b.getCenter(new THREE.Vector3());
        if (Math.abs(c.x - e.x) <= r && Math.abs(c.z - e.z) <= r) only.add(o);
      }
      center = new THREE.Vector3(e.x, 0, e.z);
      target = lv.group;
      break;
    }
  }
  if (!target) throw new Error(`${source} has no ${prop}`);
  target.updateWorldMatrix(true, false);
  if (!only) center = new THREE.Vector3().setFromMatrixPosition(target.matrixWorld).setY(0);
  const post = new THREE.Matrix4().makeScale(S, S, S).multiply(new THREE.Matrix4().makeTranslation(-center.x, 0, -center.z));
  const skip = only ? (o: THREE.Object3D) => o.parent === lv.group && !only!.has(o) : undefined;
  const { group, stats } = bakeScene(target, { matrix: post, name: prop, skip });
  group.userData = { title: `Catnip Heist prop: ${prop}`, generator: GENERATOR, metresPerTile: S, source };
  lv.dispose();
  return finish(`prop-${prop}`, group, stats);
}

async function list(): Promise<{ cats: string[]; dogs: string[]; levels: string[]; props: string[]; crateCats: Record<string, string> }> {
  const m = await getManifest();
  const crateCats: Record<string, string> = {};
  for (const id of LEVEL_IDS) crateCats[id] = getLevel(id).crate.catId;
  return { cats: m.cats.map((c) => c.id), dogs: m.dogs.map((d) => d.id), levels: [...LEVEL_IDS], props: [...PROPS], crateCats };
}

function levelInfo(id: string): { id: string; name: string; title: string; intro: string; idea: string; size: [number, number]; guards: number; coins: number; crateCat: string } {
  const l = getLevel(id);
  const meta = l.meta as LevelDef['meta'] & { name?: string; intro?: string; idea?: string };
  return { id, name: meta.name ?? id, title: meta.title, intro: meta.intro ?? '', idea: meta.idea ?? '', size: [l.tiles[0].length, l.tiles.length], guards: l.guards.length, coins: l.coins.length, crateCat: l.crate.catId };
}

/**
 * Load an exported GLB back through GLTFLoader and render a PNG (for the Discord post's
 * screenshots). Needs WebGL (headless Chromium with SwiftShader is enough).
 */
let previewRenderer: THREE.WebGLRenderer | null = null;

async function preview(base64: string, opts: { width?: number; height?: number; yaw?: number; pitch?: number; zoom?: number; focus?: 'centrepiece'; radius?: number; render?: boolean } = {}): Promise<{ png: string; meshes: number; triangles: number; animations: number }> {
  const width = opts.width ?? 1600, height = opts.height ?? 900;
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const gltf = await new GLTFLoader().parseAsync(bin.buffer, '');
  let meshes = 0, triangles = 0;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    triangles += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3;
  });
  if (opts.render === false) return { png: '', meshes, triangles, animations: gltf.animations.length };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1b1030');
  const key = new THREE.DirectionalLight('#fff0dd', 1.4);
  key.position.set(1, 2, 1.5);
  scene.add(new THREE.HemisphereLight('#c8b8ff', '#2a1640', 1.6), key, gltf.scene);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let radius = Math.max(size.x, size.z, size.y * 1.5) * 0.5;
  if (opts.focus === 'centrepiece') {
    // glTF extras come back as userData on the world's root node.
    let pos: number[] | null = null;
    gltf.scene.traverse((o) => (pos ??= (o.userData?.centrepiece?.position as number[] | undefined) ?? null));
    if (pos) {
      center.fromArray(pos).setY(WORLD_SCALE * 0.4);
      radius = opts.radius ?? WORLD_SCALE * 2.2;
    }
  }
  const cam = new THREE.PerspectiveCamera(35, width / height, 0.05, radius * 20);
  const yaw = opts.yaw ?? Math.PI / 4, pitch = opts.pitch ?? THREE.MathUtils.degToRad(40);
  const dist = (radius / Math.tan(THREE.MathUtils.degToRad(35) / 2)) * (opts.zoom ?? 0.72);
  cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(center);
  const r = (previewRenderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
  r.setSize(width, height, false);
  r.render(scene, cam);
  const png = r.domElement.toDataURL('image/png').split(',')[1];
  r.renderLists.dispose();
  return { png, meshes, triangles, animations: gltf.animations.length };
}

const api = { preview, list, levelInfo, exportLevel, exportCharacter, exportProp, WORLD_SCALE };
(window as unknown as { __export: typeof api }).__export = api;
document.body.dataset.ready = '1';
