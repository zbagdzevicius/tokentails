/**
 * L-CROWD: the instanced cream kittens on hind legs, paws raised with hot-pink glowing pads.
 * InstancedMesh + vertex-shader dance, near meshes + far impostors, vortex formation, jump,
 * drop-in, CPU picking. SPEC.md "Crowd".
 *
 * Draw calls: near cats (1), impostors (1), ghost paw prints + landing rings (1), the next-cat
 * hologram (1, only while the floor has room), the find-my-cat beam + ring (2, only while set),
 * the arriving holograms of paid Moon Rave orders (1 instanced, only while some are arriving).
 *
 * Flags: each cat whose buyer country is known holds that country's flag (part of the cat mesh and
 * the impostor SDF, sampling one canvas atlas: no extra draw calls). Countries come from
 * `RaveCat.country` when L-DATA sets it, or from `setCountries()` (index = cat index).
 */
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type IUniform,
} from 'three';
import { PALETTE, QUALITY } from '../config';
import type { CrowdApi, CrowdFormation, FrameContext, QualityProfile, RaveCat, WorldApi } from '../types';
import { buildCatGeometry } from './catGeometry';
import { createFlagAtlas } from './flags';
import { buildGrid, pickCat, type PickState } from './pick';
import {
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  DECAL_FRAGMENT,
  DECAL_VERTEX,
  ARRIVING_VERTEX,
  HOLO_FRAGMENT,
  HOLO_VERTEX,
  IMPOSTOR_FRAGMENT,
  IMPOSTOR_VERTEX,
  NEAR_FRAGMENT,
  NEAR_VERTEX,
} from './shaders';
import { buildSlots, catAxis, catLook, DROP_IN_SECONDS, extentOf, type CatAxis } from './slots';

/** Ghost paw prints on the next empty slots (SPEC.md "States"). */
const GHOSTS = 12;
/** Ghost prints only while the crowd is small enough for them to matter. */
const GHOST_MAX_CATS = 600;
/** Arriving holograms drawn at most (they stand on the ghost paw prints after the next-cat slot). */
export const ARRIVING_MAX = GHOSTS;
/** Landing shockwave rings that can run at once. */
const RINGS = 8;
/** Seconds between LOD re-sorts (near meshes vs impostors). */
const LOD_SECONDS = 0.25;
/** "Not dropping": a start time far in the past. */
const NO_DROP = -1e6;

/** A cat that may carry its buyer's country (ISO 3166-1 alpha-2, L-DATA `countries.ts`). */
export type FlagCat = RaveCat & { country?: string | null };

/** CrowdApi plus the flag extras (kept here until types.ts gains them). */
export interface CrowdWithFlags extends CrowdApi {
  /**
   * Buyer country per cat index (`'LT'`, null = no flag). Overrides `RaveCat.country`; entries past
   * the end keep what `setCats` gave. Cheap to call on every orders change (only changes re-upload).
   */
  setCountries(countries: readonly (string | null | undefined)[]): void;
  /** Cats on the floor holding a flag right now. */
  readonly flagCount: number;
}

export function createCrowd(world: WorldApi, profile: QualityProfile): CrowdWithFlags {
  let prof = profile;
  const group = new Group();
  group.name = 'crowd';
  world.scene.add(group);

  // ---- Layout: computed once for the largest tier, plus room for the hologram and ghosts. ----
  const maxSlots = Math.max(...Object.values(QUALITY).map((q) => q.maxCats)) + GHOSTS + 1;
  const layout = buildSlots(maxSlots);
  const grid = buildGrid(layout, 2);

  // ---- Per-cat CPU state, indexed by cat index (= slot index). ----
  let alloc = 0;
  let seed = new Float32Array(0);
  let fur = new Float32Array(0);
  let scale = new Float32Array(0);
  let dropAt = new Float32Array(0);
  /** Flag atlas cell per cat, −1 = no flag. */
  let flagCell = new Float32Array(0);
  /** Country per cat index from setCats (RaveCat.country) and setCountries (wins). */
  let catCountry: (string | null)[] = [];
  let overrideCountry: (string | null | undefined)[] = [];
  const atlas = createFlagAtlas();
  let hiIndex: number | null = null;
  /** Cats highlighted from hiIndex on (a $5 payout made 5 cats: all of them glow). */
  let hiCount = 1;
  let shown = 0;
  let cats: readonly RaveCat[] = [];
  let extent = extentOf(layout, 0);
  let nextProgress = 0;
  let now = 0;
  let lastDropStart = -Infinity;
  const pending: { index: number; end: number; rung: boolean; resolve: () => void }[] = [];

  // ---- Shared uniforms (same {value} objects in every crowd material). ----
  const lin = (hex: number) => new Color(hex);
  const shared: Record<string, IUniform> = {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uKick: { value: 0 },
    uEnergy: { value: 0.5 },
    uBuild: { value: 0 },
    uDrop: { value: 0 },
    uPulse: { value: 0 },
    uVortex: { value: 0 },
    uVortexT: { value: 0 },
    uJump: { value: [0, 0, -100, 0] },
    uWave: { value: 0 },
    // POV clearing: camera xz, forward xz (unit); amount 0..1.
    uCone: { value: [0, 0, 0, -1] },
    uConeAmt: { value: 0 },
    // Crowd albedo (reference: mid-tone cream-ginger, few pure whites) and the glowing pad pink.
    uCream: { value: lin(PALETTE.furCream) },
    uMid: { value: lin(PALETTE.furCream).lerp(lin(PALETTE.furGinger), 0.5) },
    uGinger: { value: lin(PALETTE.furGinger) },
    uPink: { value: lin(PALETTE.pawPink) },
    uGreen: { value: lin(PALETTE.floorGlow) },
    uFill: { value: lin(0x3dff6a) },
    uInnerEar: { value: lin(0xffa3bf) },
    uFlags: { value: atlas.texture },
  };
  const jumpVec = shared.uJump.value as number[];
  let coneAmt = 0;
  let coneTarget = 0;
  const withFog = (u: Record<string, IUniform>) => ({ ...UniformsUtils.clone(UniformsLib.fog), ...u });

  const nearMat = new ShaderMaterial({ uniforms: withFog(shared), vertexShader: NEAR_VERTEX, fragmentShader: NEAR_FRAGMENT, fog: true });
  const farMat = new ShaderMaterial({ uniforms: withFog(shared), vertexShader: IMPOSTOR_VERTEX, fragmentShader: IMPOSTOR_FRAGMENT, fog: true });
  const catGeo = buildCatGeometry();
  // x -0.75..0.75, y -0.06..1.26: wide and tall enough for the flag (pole top 1.14, cloth out to
  // x 0.49) with the flag arm's clamped swing (shaders.ts: outer top corner stays under x 0.65).
  const impGeo = new PlaneGeometry(1.5, 1.32, 1, 1);
  impGeo.translate(0, 0.6, 0);

  let near: InstancedMesh | null = null;
  let far: InstancedMesh | null = null;
  let nearSlot: InstancedBufferAttribute | null = null;
  let nearData: InstancedBufferAttribute | null = null;
  let farSlot: InstancedBufferAttribute | null = null;
  let farData: InstancedBufferAttribute | null = null;
  let nearFlag: InstancedBufferAttribute | null = null;
  let farFlag: InstancedBufferAttribute | null = null;

  function makeMesh(geo: BufferGeometry, mat: ShaderMaterial, n: number, name: string) {
    const g = geo.clone();
    const slot = new InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(DynamicDrawUsage);
    const data = new InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(DynamicDrawUsage);
    const flag = new InstancedBufferAttribute(new Float32Array(n).fill(-1), 1).setUsage(DynamicDrawUsage);
    g.setAttribute('aSlot', slot);
    g.setAttribute('aData', data);
    g.setAttribute('aFlag', flag);
    const mesh = new InstancedMesh(g, mat, n);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false; // positions come from the shader
    // Far impostors stay out of the high tier's planar mirror pass (most of its triangles).
    mesh.userData.noMirror = name === 'crowd-far';
    group.add(mesh);
    return { mesh, slot, data, flag };
  }

  /** Grow CPU arrays and GPU instance buffers to hold `n` cats. */
  function ensureAlloc(n: number) {
    if (n <= alloc) return;
    const size = Math.max(n, 64);
    const grow = (src: Float32Array, fill: number) => {
      const out = new Float32Array(size).fill(fill);
      out.set(src.subarray(0, Math.min(src.length, size)));
      return out;
    };
    seed = grow(seed, 0.5);
    fur = grow(fur, 0);
    scale = grow(scale, 1);
    dropAt = grow(dropAt, NO_DROP);
    flagCell = grow(flagCell, -1);
    for (const m of [near, far]) {
      if (!m) continue;
      group.remove(m);
      m.geometry.dispose();
      m.dispose();
    }
    const nm = makeMesh(catGeo, nearMat, size, 'crowd-near');
    const fm = makeMesh(impGeo, farMat, size, 'crowd-far');
    near = nm.mesh;
    nearSlot = nm.slot;
    nearData = nm.data;
    far = fm.mesh;
    farSlot = fm.slot;
    farData = fm.data;
    nearFlag = nm.flag;
    farFlag = fm.flag;
    alloc = size;
  }

  // ---- LOD: the nearest `nearCats` get the full mesh, the rest impostors. ----
  let lodDirty = true;
  let lodAge = Infinity;
  const lastCam = new Vector3(1e9, 0, 0);
  let dist = new Float32Array(0);
  let scratch = new Float32Array(0);
  const axis: CatAxis = { cx: 0, cy: 0, cz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fz: 1 };
  let vortexT = 0;
  let vortex = 0;
  let formation: CrowdFormation = 'floor';

  function writeCat(slotArr: Float32Array, dataArr: Float32Array, flagArr: Float32Array, k: number, i: number) {
    flagArr[k] = flagCell[i];
    const o = k * 4;
    slotArr[o] = layout.x[i];
    slotArr[o + 1] = layout.z[i];
    slotArr[o + 2] = scale[i];
    slotArr[o + 3] = fur[i];
    dataArr[o] = seed[i];
    dataArr[o + 1] = dropAt[i];
    dataArr[o + 2] = hiIndex !== null && i >= hiIndex && i < hiIndex + hiCount ? 1 : 0;
    dataArr[o + 3] = i;
  }

  /** k-th smallest of a[0..n) (in place, Hoare quickselect). */
  function kth(a: Float32Array, n: number, k: number): number {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const pivot = a[(lo + hi) >> 1];
      let i = lo;
      let j = hi;
      while (i <= j) {
        while (a[i] < pivot) i++;
        while (a[j] > pivot) j--;
        if (i <= j) {
          const t = a[i];
          a[i] = a[j];
          a[j] = t;
          i++;
          j--;
        }
      }
      if (k <= j) hi = j;
      else if (k >= i) lo = i;
      else return a[k];
    }
    return a[k];
  }

  function repack(cam: Vector3 | null) {
    if (!near || !far || !nearSlot || !nearData || !farSlot || !farData || !nearFlag || !farFlag) return;
    const nf = nearFlag.array as Float32Array;
    const ff = farFlag.array as Float32Array;
    const n = shown;
    const nearN = Math.min(prof.nearCats, n);
    const ns = nearSlot.array as Float32Array;
    const nd = nearData.array as Float32Array;
    const fs = farSlot.array as Float32Array;
    const fd = farData.array as Float32Array;
    let kn = 0;
    let kf = 0;
    if (nearN >= n || !cam) {
      for (let i = 0; i < n; i++) {
        if (kn < nearN) writeCat(ns, nd, nf, kn++, i);
        else writeCat(fs, fd, ff, kf++, i);
      }
    } else {
      if (dist.length < n) {
        dist = new Float32Array(alloc);
        scratch = new Float32Array(alloc);
      }
      for (let i = 0; i < n; i++) {
        catAxis(layout.x[i], layout.z[i], scale[i], vortexT, vortex, axis, i);
        const dx = axis.cx - cam.x;
        const dy = axis.cy - cam.y;
        const dz = axis.cz - cam.z;
        dist[i] = dx * dx + dy * dy + dz * dz;
      }
      scratch.set(dist.subarray(0, n));
      const thr = kth(scratch, n, nearN - 1);
      // Strictly closer first, then ties until the near set is full; the rest are impostors.
      for (let i = 0; i < n; i++) if (dist[i] < thr) writeCat(ns, nd, nf, kn++, i);
      for (let i = 0; i < n; i++) {
        if (dist[i] < thr) continue;
        if (dist[i] === thr && kn < nearN) writeCat(ns, nd, nf, kn++, i);
        else writeCat(fs, fd, ff, kf++, i);
      }
    }
    near.count = kn;
    far.count = kf;
    nearSlot.needsUpdate = true;
    nearData.needsUpdate = true;
    farSlot.needsUpdate = true;
    farData.needsUpdate = true;
    nearFlag.needsUpdate = true;
    farFlag.needsUpdate = true;
    lodDirty = false;
    lodAge = 0;
    if (cam) lastCam.copy(cam);
  }

  // ---- Next-cat hologram + ghost paw prints + landing rings. ----
  const holoMat = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uProgress: { value: 0 },
      uTime: shared.uTime,
      uKick: shared.uKick,
      uCream: shared.uCream,
      uPink: shared.uPink,
      uGreen: shared.uGreen,
    },
    vertexShader: HOLO_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const holo = new Mesh(buildCatGeometry({ flag: false }), holoMat);
  holo.name = 'crowd-next-cat';
  holo.renderOrder = 2;
  group.add(holo);

  // Arriving holograms: paid orders whose payout is not in the feed yet. Pink, never counted.
  const arrivingMat = new ShaderMaterial({
    uniforms: {
      ...UniformsUtils.clone(UniformsLib.fog),
      uProgress: { value: 0 },
      uTime: shared.uTime,
      uKick: shared.uKick,
      uCream: shared.uCream,
      uPink: shared.uPink,
      uGreen: { value: lin(PALETTE.pawPink).multiplyScalar(1.25) },
    },
    vertexShader: ARRIVING_VERTEX,
    fragmentShader: HOLO_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const arrivingMesh = new InstancedMesh(holo.geometry, arrivingMat, ARRIVING_MAX);
  arrivingMesh.name = 'crowd-arriving';
  arrivingMesh.renderOrder = 2;
  arrivingMesh.frustumCulled = false;
  arrivingMesh.count = 0;
  arrivingMesh.visible = false;
  group.add(arrivingMesh);
  /** Arriving cats wanted (may exceed what is drawn) and the slots drawn for them. */
  let arrivingWanted = 0;
  const arrivingSlots: number[] = [];

  const decalCount = GHOSTS + 1 + RINGS;
  const decalGeo = new PlaneGeometry(1, 1);
  decalGeo.rotateX(-Math.PI / 2);
  const decalAttr = new InstancedBufferAttribute(new Float32Array(decalCount * 4), 4).setUsage(DynamicDrawUsage);
  decalGeo.setAttribute('aDecal', decalAttr);
  const decalMat = new ShaderMaterial({
    uniforms: { ...UniformsUtils.clone(UniformsLib.fog), uTime: shared.uTime, uKick: shared.uKick, uPink: shared.uPink, uGreen: shared.uGreen },
    vertexShader: DECAL_VERTEX,
    fragmentShader: DECAL_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const decals = new InstancedMesh(decalGeo, decalMat, decalCount);
  decals.name = 'crowd-ghosts';
  decals.frustumCulled = false;
  decals.renderOrder = 1;
  group.add(decals);
  const m4 = new Matrix4();
  const hiddenM = new Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < decalCount; k++) decals.setMatrixAt(k, hiddenM);
  let ringNext = 0;
  const ringEnds: number[] = new Array(RINGS).fill(-1);

  function placeDecal(k: number, x: number, z: number, size: number, yaw: number) {
    m4.makeRotationY(yaw);
    m4.scale(new Vector3(size, 1, size));
    m4.setPosition(x, 0.015, z);
    decals.setMatrixAt(k, m4);
  }

  function layoutNext() {
    const room = shown < capacityNow();
    const hs = shown;
    holo.visible = room && hs < layout.count;
    if (holo.visible) {
      const x = layout.x[hs];
      const z = layout.z[hs];
      holo.position.set(x, 0, z);
      holo.rotation.set(0, Math.atan2(-x, -z), 0);
      holo.scale.setScalar(catLook(0.37).scale);
    }
    const da = decalAttr.array as Float32Array;
    for (let g = 0; g <= GHOSTS; g++) {
      const i = hs + g;
      const show = room && i < layout.count && i < capacityNow() && (g === 0 || hs < GHOST_MAX_CATS);
      if (!show) {
        decals.setMatrixAt(g, hiddenM);
        continue;
      }
      const x = layout.x[i];
      const z = layout.z[i];
      placeDecal(g, x, z, g === 0 ? 0.95 : 0.62, Math.atan2(-x, -z) + Math.PI);
      da[g * 4] = g === 0 ? 1 : Math.max(0.15, 0.85 - g * 0.06);
      da[g * 4 + 1] = 0;
      da[g * 4 + 3] = (i * 0.618) % 1;
    }
    decals.instanceMatrix.needsUpdate = true;
    decalAttr.needsUpdate = true;
    layoutArriving(room);
  }

  /** Arriving holograms stand on the slots after the next-cat hologram (shown + 1, + 2, …). */
  function layoutArriving(room: boolean) {
    arrivingSlots.length = 0;
    const want = Math.min(ARRIVING_MAX, arrivingWanted);
    for (let k = 0; k < want; k++) {
      const i = shown + 1 + k;
      if (!room || i >= layout.count) break;
      const x = layout.x[i];
      const z = layout.z[i];
      m4.makeRotationY(Math.atan2(-x, -z));
      m4.scale(new Vector3(1, 1, 1).multiplyScalar(catLook(0.37 + k * 0.07).scale));
      m4.setPosition(x, 0.04, z);
      arrivingMesh.setMatrixAt(k, m4);
      arrivingSlots.push(i);
    }
    arrivingMesh.count = arrivingSlots.length;
    arrivingMesh.visible = arrivingSlots.length > 0;
    arrivingMesh.instanceMatrix.needsUpdate = true;
  }

  function ring(x: number, z: number, start: number) {
    const k = GHOSTS + 1 + ringNext;
    ringEnds[ringNext] = start + 1;
    ringNext = (ringNext + 1) % RINGS;
    placeDecal(k, x, z, 4.5, 0);
    const da = decalAttr.array as Float32Array;
    da[k * 4] = 1;
    da[k * 4 + 1] = 1;
    da[k * 4 + 2] = start;
    decals.instanceMatrix.needsUpdate = true;
    decalAttr.needsUpdate = true;
  }

  // ---- Find-my-cat beam + floor ring. ----
  const tmpBeacon = new Vector3();
  const beamGeo = new CylinderGeometry(0.3, 0.42, 9, 20, 1, true);
  beamGeo.translate(0, 4.5, 0);
  const beamMat = new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uOpacity: { value: 0 }, uColor: { value: lin(PALETTE.floorGlow).multiplyScalar(1.6) } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const beam = new Mesh(beamGeo, beamMat);
  beam.name = 'crowd-find-beam';
  beam.visible = false;
  beam.renderOrder = 3;
  group.add(beam);
  const hiRingGeo = new RingGeometry(0.46, 0.6, 40);
  hiRingGeo.rotateX(-Math.PI / 2);
  const hiRingMat = new ShaderMaterial({
    uniforms: { uTime: shared.uTime, uOpacity: { value: 0 }, uColor: { value: lin(PALETTE.pawPink).multiplyScalar(3) } },
    vertexShader: BEAM_VERTEX.replace('vH = uv.y;', 'vH = 0.0;'),
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpacity; uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor * uOpacity * (0.7 + 0.3 * sin(uTime * 8.0)), 1.0); }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const hiRing = new Mesh(hiRingGeo, hiRingMat);
  hiRing.visible = false;
  hiRing.renderOrder = 3;
  group.add(hiRing);

  // ---- Music-driven envelopes. ----
  let wave = 0;
  let conga = 0;
  let build = 0;
  let drop = 0;
  let lastSection = '';
  const capacityNow = () => prof.maxCats;

  function setShown(n: number) {
    const prev = shown;
    shown = Math.max(0, Math.min(n, capacityNow(), layout.count - GHOSTS - 1));
    ensureAlloc(shown);
    for (let i = prev; i < shown; i++) if (dropAt[i] > now) dropAt[i] = NO_DROP;
    for (let i = shown; i < prev; i++) dropAt[i] = NO_DROP;
    extent = extentOf(layout, Math.max(shown, 1));
    if (hiIndex !== null && hiIndex >= shown) setHighlight(null);
    layoutNext();
    lodDirty = true;
  }

  function setHighlight(index: number | null, count = 1) {
    hiIndex = index !== null && index >= 0 && index < shown ? index : null;
    hiCount = Math.max(1, Math.min(Math.floor(count) || 1, shown - (hiIndex ?? 0)));
    beam.visible = hiIndex !== null;
    hiRing.visible = hiIndex !== null;
    lodDirty = true;
  }

  /** Re-resolve flag cells for the cats on the floor; marks the instance buffers dirty on change. */
  function refreshFlags() {
    let changed = false;
    for (let i = 0; i < shown; i++) {
      const o = overrideCountry[i];
      const cell = atlas.cellOf(o !== undefined ? o : (catCountry[i] ?? null));
      if (flagCell[i] !== cell) {
        flagCell[i] = cell;
        changed = true;
      }
    }
    if (changed) lodDirty = true;
  }

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pickState: PickState = {
    layout,
    grid,
    shown: 0,
    scale,
    vortexT: 0,
    vortex: 0,
    visible: (i) => dropAt[i] <= now,
  };

  ensureAlloc(64);
  layoutNext();

  const api: CrowdWithFlags = {
    get capacity() {
      return capacityNow();
    },
    get extentRadius() {
      return extent;
    },
    get count() {
      return shown;
    },

    setCats(next) {
      cats = next;
      const n = Math.min(cats.length, capacityNow());
      ensureAlloc(n);
      catCountry = new Array(n);
      for (let i = 0; i < n; i++) {
        const s = cats[i].seed;
        const look = catLook(s);
        seed[i] = s;
        fur[i] = look.fur;
        scale[i] = look.scale;
        catCountry[i] = (cats[i] as FlagCat).country ?? null;
      }
      setShown(n);
      refreshFlags();
    },

    setCountries(countries) {
      // Every orders poll sends the list again: skip the walk when nothing changed.
      if (countries.length === overrideCountry.length && countries.every((c, i) => c === overrideCountry[i])) return;
      overrideCountry = countries.slice();
      refreshFlags();
    },

    get flagCount() {
      let k = 0;
      for (let i = 0; i < shown; i++) if (flagCell[i] >= 0) k++;
      return k;
    },

    dropIn(index, delayS = 0) {
      if (index < 0 || index >= shown) return Promise.resolve();
      // Several new cats at once land one after another.
      const start = Math.max(now + 0.05 + Math.max(0, delayS), lastDropStart + 0.28);
      lastDropStart = start;
      dropAt[index] = start;
      lodDirty = true;
      const end = start + DROP_IN_SECONDS;
      return new Promise<void>((resolve) => pending.push({ index, end, rung: false, resolve }));
    },

    jump(strength = 1, origin) {
      jumpVec[0] = origin ? origin.x : 0;
      jumpVec[1] = origin ? origin.z : 0;
      jumpVec[2] = now;
      jumpVec[3] = Math.max(0, Math.min(1.5, strength));
      shared.uPulse.value = Math.max(shared.uPulse.value as number, strength * 0.5);
    },

    pulsePaws(strength = 1) {
      shared.uPulse.value = Math.max(shared.uPulse.value as number, Math.min(1.5, strength));
    },

    setFormation(f) {
      formation = f;
    },

    pick(ndcX, ndcY, camera: Camera) {
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      pickState.shown = shown;
      pickState.scale = scale;
      pickState.vortexT = vortexT;
      pickState.vortex = vortex;
      return pickCat(raycaster.ray, pickState);
    },

    catPosition(index, out) {
      // The half-formed next cat (hologram) answers too, so find can fly to a forming cat.
      if (index === shown && holo.visible) return out.set(holo.position.x, 0.55, holo.position.z);
      if (index < 0 || index >= shown) return null;
      catAxis(layout.x[index], layout.z[index], scale[index], vortexT, vortex, axis, index);
      return out.set(axis.cx, axis.cy, axis.cz);
    },

    highlight(index, count) {
      setHighlight(index, count);
    },

    clearCone(amount) {
      coneTarget = Math.max(0, Math.min(1, amount));
    },

    setNextCat(progress) {
      nextProgress = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
      holoMat.uniforms.uProgress.value = nextProgress;
    },

    setArriving(n) {
      const next = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
      if (next === arrivingWanted) return;
      arrivingWanted = next;
      layoutArriving(shown < capacityNow());
    },

    get arrivingShown() {
      return arrivingSlots.length;
    },

    pickArriving(ndcX, ndcY, camera: Camera) {
      if (!arrivingSlots.length) return null;
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      const o = raycaster.ray.origin;
      const d = raycaster.ray.direction;
      const dxz = d.x * d.x + d.z * d.z;
      let best: number | null = null;
      let bestT = Infinity;
      arrivingSlots.forEach((i, k) => {
        const cx = layout.x[i];
        const cz = layout.z[i];
        // Closest approach of the ray to the hologram's vertical axis, within its body (0..1.25 m).
        const t = dxz > 1e-9 ? ((cx - o.x) * d.x + (cz - o.z) * d.z) / dxz : 0;
        if (t <= 0) return;
        const px = o.x + d.x * t - cx;
        const pz = o.z + d.z * t - cz;
        const y = o.y + d.y * t;
        if (px * px + pz * pz < 0.45 * 0.45 && y > -0.05 && y < 1.25 && t < bestT) {
          bestT = t;
          best = k;
        }
      });
      return best;
    },

    arrivingPosition(k, out) {
      const i = arrivingSlots[k];
      return i === undefined ? null : out.set(layout.x[i], 0.55, layout.z[i]);
    },

    update(frame: FrameContext) {
      const dt = frame.dt;
      now = frame.time;
      const b = frame.beat;
      shared.uTime.value = now;
      shared.uBeat.value = b.beat % 256;
      shared.uKick.value = b.kick;
      shared.uEnergy.value = b.energy;

      // Build: rises through the build section or while the viewer holds; drop: the drop section.
      const buildTarget = b.held ? 1 : b.section === 'build' ? Math.min(1, 0.25 + b.sectionProgress) : 0;
      build += (buildTarget - build) * Math.min(1, dt * (buildTarget > build ? 3 : 8));
      const dropTarget = b.section === 'drop' ? 1 : 0;
      drop += (dropTarget - drop) * Math.min(1, dt * (dropTarget > drop ? 10 : 1.5));
      shared.uBuild.value = build;
      shared.uDrop.value = drop;
      if (b.section !== lastSection) {
        if (b.section === 'drop' && lastSection !== '') shared.uPulse.value = 1.2;
        lastSection = b.section;
      }
      shared.uPulse.value = (shared.uPulse.value as number) * Math.exp(-dt * 3.5);

      // Later loops unlock new moves so the second pass does not look like the first:
      // loop 1, 4, 7…: a wave ripple rolls out from the booth (groove, drop); loop 2, 5, 8…: a slow
      // conga swirl carries the whole floor round the booth (groove, breakdown).
      const loop = b.loop ?? 0;
      const waveOn = loop % 3 === 1 && (b.section === 'groove' || b.section === 'drop');
      const congaOn = loop % 3 === 2 && (b.section === 'groove' || b.section === 'breakdown') && formation === 'floor';
      wave += ((waveOn ? 1 : 0) - wave) * Math.min(1, dt * 0.8);
      shared.uWave.value = wave;
      // POV: push cats out of a cone in front of the camera (no ear filling the lens).
      coneAmt += (coneTarget - coneAmt) * Math.min(1, dt * 4);
      shared.uConeAmt.value = coneAmt;
      if (coneAmt > 0.001) {
        const cam = frame.camera;
        cam.getWorldDirection(tmpBeacon);
        const fl = Math.hypot(tmpBeacon.x, tmpBeacon.z) || 1;
        const c = shared.uCone.value as number[];
        c[0] = cam.position.x;
        c[1] = cam.position.z;
        c[2] = tmpBeacon.x / fl;
        c[3] = tmpBeacon.z / fl;
      }
      conga += ((congaOn ? 1 : 0) - conga) * Math.min(1, dt * 0.6);

      // Formation: blend in/out; in floor mode the swirl unwinds back to the slots.
      const vt = formation === 'vortex' ? 1 : 0;
      vortex += (vt - vortex) * Math.min(1, dt * 1.1);
      if (Math.abs(vortex - vt) < 1e-3) vortex = vt;
      vortexT += dt * vortex;
      if (formation === 'floor') {
        if (conga > 0.01) vortexT += dt * 0.32 * conga;
        else {
          vortexT *= Math.exp(-dt * 1.4);
          if (Math.abs(vortexT) < 1e-3) vortexT = 0;
        }
      }
      shared.uVortex.value = vortex;
      shared.uVortexT.value = vortexT;

      // Drop-ins that have landed: shockwave + resolve.
      for (let k = pending.length - 1; k >= 0; k--) {
        const p = pending[k];
        if (now >= p.end - DROP_IN_SECONDS * 0.28 && !p.rung) {
          p.rung = true;
          ring(layout.x[p.index], layout.z[p.index], now);
          shared.uPulse.value = Math.max(shared.uPulse.value as number, 0.6);
        }
        if (now >= p.end) {
          pending.splice(k, 1);
          p.resolve();
        }
      }
      for (let r = 0; r < RINGS; r++) {
        if (ringEnds[r] > 0 && now > ringEnds[r]) {
          ringEnds[r] = -1;
          decals.setMatrixAt(GHOSTS + 1 + r, hiddenM);
          decals.instanceMatrix.needsUpdate = true;
        }
      }

      // Hologram: hovers and shimmers.
      if (holo.visible) holo.position.y = 0.04 + 0.03 * Math.sin(now * 2.2);

      // Find-my-cat beacon follows the cat.
      if (hiIndex !== null) {
        catAxis(layout.x[hiIndex], layout.z[hiIndex], scale[hiIndex], vortexT, vortex, axis, hiIndex);
        beam.position.set(axis.cx, 0, axis.cz);
        hiRing.position.set(axis.cx, 0.02, axis.cz);
        // Fade the beacon as the camera closes in (a find fly-to must not tint the cat green).
        const camD = frame.camera.position.distanceTo(tmpBeacon.set(axis.cx, axis.cy, axis.cz));
        const o = (0.4 + 0.12 * Math.sin(now * 5)) * Math.min(1, Math.max(0.12, (camD - 2.5) / 6));
        beamMat.uniforms.uOpacity.value = o;
        hiRingMat.uniforms.uOpacity.value = 0.6 + 0.6 * b.kick;
      }

      // LOD re-sort, throttled; immediately when data changed.
      lodAge += dt;
      const cam = frame.camera.position;
      const moving = vortex > 0 || vortexT !== 0 || cam.distanceToSquared(lastCam) > 0.5;
      if (lodDirty || (shown > prof.nearCats && moving && lodAge >= LOD_SECONDS)) repack(cam);
    },

    setQuality(p) {
      prof = p;
      setShown(Math.min(cats.length, capacityNow()));
      refreshFlags();
    },

    dispose() {
      for (const p of pending.splice(0)) p.resolve();
      world.scene.remove(group);
      for (const m of [near, far]) {
        if (!m) continue;
        m.geometry.dispose();
        m.dispose();
      }
      catGeo.dispose();
      atlas.dispose();
      impGeo.dispose();
      holo.geometry.dispose();
      arrivingMat.dispose();
      decalGeo.dispose();
      beamGeo.dispose();
      hiRingGeo.dispose();
      for (const m of [nearMat, farMat, holoMat, decalMat, beamMat, hiRingMat]) m.dispose();
      decals.dispose();
    },
  };
  return api;
}
