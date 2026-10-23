// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/camera/Occluders.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/camera/Occluders.js  (owner: camera) — "tree fade" (tech.md §8: trees are faded, not collided):
// fadeable props that come between the camera and the subject (or swallow the camera) fade to
// CAMERA.treeFadeOpacity and back.
//
// Registration (world tags; the camera scans every loaded level on E.LEVEL_LOADED):
//   object.userData.camFade = true      Mesh, InstancedMesh (every instance), BatchedMesh (every instance), or a
//                                       Group (a GLB tree clone: all its meshes fade together as one unit)
//   batched.userData.camFadeIds = ids   BatchedMesh: only these instance ids (Array / Set of addInstance() ids)
//   batched.userData.camFade = (id) => bool   BatchedMesh / InstancedMesh: per-instance predicate
//   object.userData.camFade = false     never fade (overrides the name heuristic)
//   ctx.cam.addFadeable(obj) / removeFadeable(obj) / refreshFadeable(obj)   for props added after the level load
//   userData.camFadeBox = true                     a lattice (gate leaf, fence rails): fade on the box test, no triangle refinement
// Fallback heuristic: Mesh / InstancedMesh / small groups named like trees or foliage (never a BatchedMesh: one
// batch holds every prop of a level, so it must be tagged explicitly).
//
// How a faded unit is drawn (world materials and shaders are never patched):
//   Mesh           its material is swapped for a transparent clone while faded (restored after);
//   InstancedMesh  the instance gets a zero-scale matrix and a pooled single-instance InstancedMesh draws it
//                  transparently (same shader path, so instance-aware world shaders such as tree wind match);
//   BatchedMesh    the instance is hidden (setVisibleAt) and a pooled proxy draws the instance's geometry range
//                  (a view geometry sharing the batch's GPU buffers; views are never disposed for that reason).
// Occlusion test: segment (camera → subject points) vs the unit's per-part oriented boxes; big units (canopies)
// are refined against their real triangles so a wide canopy box doesn't fade a tree the line only passes under.
// Lens test: short segments from the camera through a grid of the view (~2 m deep) vs the boxes only, so a fence
// rail / post right in front of the lens fades even when the line to her slips between its rails.
// Tests run at CHECK_HZ; the fade itself animates every frame.
//
// Solid occluders (M2: town houses, the castle, the Bell Tower, statues, boss-arena pillars): props whose colliders
// DO stop the spring arm, but which still fade when they hide her from the lens (eaves and roofs overhang their
// footprint collider; lock-on / boss / cutscene framings look past corners). Registered by
//   object.userData.camFade = 'solid'          Mesh / Group / InstancedMesh / BatchedMesh (all instances)
//   batched.userData.camFadeSolidIds = ids     BatchedMesh: only these instance ids
//   scanSolids(root, footprints)               automatically: every untagged static prop (batch instance or mesh)
//                                              at least SOLID_MIN_H tall standing on a solid collider footprint;
//                                              smaller props inside its box join its unit (a house and its chimney)
//   object.userData.camOccluder = false        never auto-register this object / batch
// Solid units never make their colliders camera-transparent (covers() ignores them), and their lens test is
// triangle-accurate (the camera pressed against a wall is inside the house's box but must not fade it).
//
// Iso camera rules (research/CONTROLS_SPEC.md §3):
//   - targets are CAPSULES: update(dt, cam, targets, { n, radii, her }) grows each test by radii[i] (her chest 1.0 m,
//     engaged enemies / the selection 0.6, the next waypoint 0.4). The capsule ends r m short of the subject (toward
//     the lens), so its round end reaches the subject's depth but never past it: only what is lens-side of her fades
//     (a tall stone just behind her, screen-up of her, stays solid);
//   - roofs and solid units fade further (`archOpacity`) than trees (`minOpacity`): a big saturated roof at the tree
//     opacity still reads as a heavy tinted screen-door over the street;
//   - the fade is DITHERED (`dither`, default on): the faded clone stays opaque (depth writes, no sorting, shadows
//     unchanged) and discards fragments whose opacity is under a 4×4 ordered screen threshold (makeFadeMaterial).
//     ShaderMaterials (nothing to patch) keep the blended fallback. Linear timing: `fadeIn` / `fadeOut` seconds (0 = the old
//     exponential `speed`);
//   - CROWNS (tree units: FADE_NAME names, `camFade: 'crown'`): trunks never fade. A part named / with a material named
//     like a trunk (TRUNK_NAME) is never faded; a part named like foliage (CROWN_NAME) fades whole; a merged tree fades
//     only above `crownFrac` of its local height (a shader cut in the faded clone; world may set a per-template
//     `userData.crownFrac`). A crown also fades when it rises
//     within `crownR` m horizontally of a target capsule (the view from above);
//   - ROOFS: `camFade: 'roof'` (Mesh / Group / InstancedMesh / BatchedMesh) or `batched.userData.camFadeRoofIds`:
//     fade when `her` stands inside the roof's footprint grown by `roofPad` m (and under it), or the roof cuts a
//     capsule. Tag the roof parts only: walls stay. `object.userData.roofPad` (m) overrides `roofPad` for that root
//     (an arch over a passage: the lintel / raised portcullis fade while she walks the whole passage).
import * as THREE from 'three';

export const FADE_NAME = /(^|[^a-z])(tree|trees|pine|oak|birch|willow|fir|spruce|trunk|leaves|leaf|foliage|canopy|hedge)([^a-z]|$)/i;

/** Units with a bounding radius above this get the triangle-accurate refinement (m). */
export const PRECISE_RADIUS = 1.5;
/** Occlusion re-test rate (Hz). */
export const CHECK_HZ = 20;
/** Skip the triangle refinement for meshes heavier than this (box test only). */
const PRECISE_MAX_TRIS = 40000;
/** auto solid occluders: at least this tall (m): taller than her eye line (crates, low walls and rocks stay solid) */
export const SOLID_MIN_H = 1.8;
/** parts of a crown unit that never fade (trunks); matched on the mesh and the material name */
export const TRUNK_NAME = /(^|[^a-z])(trunk|trunks|bark|stem|stump|roots?)([^a-z]|$)/i;
/** parts of a crown unit that fade whole (no height cut) */
export const CROWN_NAME = /(^|[^a-z])(leaves|leaf|foliage|canopy|crown|needles)([^a-z]|$)/i;
/** tree-like names (crown rules); fences, hedges and posts fade whole on the capsule test only */
const TREE_NAME = /(^|[^a-z])(tree|trees|pine|oak|birch|willow|fir|spruce|leaves|leaf|foliage|canopy)([^a-z]|$)/i;
/** auto solid occluders: largest prop footprint (m²) considered (terrain, water, grass are far bigger) */
const SOLID_MAX_AREA = 1600;
/** update(): a query whose points all moved less than this (m) since the last full check reuses its hit set */
export const QUERY_EPS = 0.01;
/** ...but a full check still runs at least every QUERY_TTL checks (0.5 s at 20 Hz) */
const QUERY_TTL = 10;
/** the query key's capacity (12 header slots + 4 per subject + 3 per lens point); a bigger query always re-checks */
const QUERY_KEY_MAX = 160;
const near = (a, b) => Math.abs(a - b) < QUERY_EPS;
/** Grow box b [minX, minY, minZ, maxX, maxY, maxZ] by the point (x, y, z) ± g. */
function grow(b, x, y, z, g) {
  if (x - g < b[0]) b[0] = x - g; if (y - g < b[1]) b[1] = y - g; if (z - g < b[2]) b[2] = z - g;
  if (x + g > b[3]) b[3] = x + g; if (y + g > b[4]) b[4] = y + g; if (z + g > b[5]) b[5] = z + g;
}

const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();
const _box = new THREE.Box3();
const _side = new THREE.Vector3(), _up = new THREE.Vector3(), _off = new THREE.Vector3(), _a2 = new THREE.Vector3(), _b2 = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _hits = [];
const _rayDir = new THREE.Vector3(), _end = new THREE.Vector3();
let _scratch = null;          // lazily built Mesh used for the triangle refinement (DoubleSide: any face counts)

/**
 * Segment (a → b) vs axis-aligned box, slab method. True if any part of the segment is inside the box.
 * @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b @param {THREE.Box3} box
 */
export function segmentHitsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  // unrolled per axis (no per-call arrays: this runs for every candidate unit at CHECK_HZ)
  if (Math.abs(dx) < 1e-9) { if (a.x < box.min.x || a.x > box.max.x) return false; } else {
    let ta = (box.min.x - a.x) / dx, tb = (box.max.x - a.x) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  if (Math.abs(dy) < 1e-9) { if (a.y < box.min.y || a.y > box.max.y) return false; } else {
    let ta = (box.min.y - a.y) / dy, tb = (box.max.y - a.y) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (a.z < box.min.z || a.z > box.max.z) return false; } else {
    let ta = (box.min.z - a.z) / dz, tb = (box.max.z - a.z) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  return true;
}

/** Squared distance from point p to segment a–b. */
export function distSqPointSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}

/** A material we can fade by opacity (built-in materials and ShaderMaterials with an `opacity` uniform). */
function fadeableMaterial(m) {
  return !!m && (!m.isShaderMaterial || !!m.uniforms?.opacity);
}

/** GLSL: the 4×4 ordered (Bayer) threshold at a pixel, in (0, 1). */
const BAYER_GLSL = `
float camBayer4(vec2 p) {
  const float M[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  ivec2 q = ivec2(mod(floor(p), 4.0));
  return (M[q.x + q.y * 4] + 0.5) / 16.0;
}`;

/**
 * A faded clone of `m`.
 * Dithered (`dither`, built-in materials): opaque with depth writes; the fragment keeps itself when its opacity beats
 * a 4×4 ordered screen threshold (a clean screen-door pattern; three's own alphaHash is per-pixel noise, which reads as
 * static over a canopy that fills the frame). No blending, no sorting, shadows unchanged (the depth pass ignores it).
 * Blended otherwise (ShaderMaterials have no chunk to patch, and genuinely translucent sources).
 * `crownY` (geometry-local y): fragments below it keep the base opacity (a merged tree's trunk never fades).
 * @param {THREE.Material} m @param {{ dither?: boolean, crownY?: number }} [o]
 */
export function makeFadeMaterial(m, { dither = false, crownY = -Infinity } = {}) {
  const f = m.clone();
  const base = m.onBeforeCompile, key = m.customProgramCacheKey;
  if (base) f.onBeforeCompile = base;                                   // keep world patches (height fog, wind...)
  if (key) f.customProgramCacheKey = key;
  const baseA = m.opacity ?? 1;
  const dith = dither && !m.isShaderMaterial && !(m.transparent && baseA < 1);
  f.userData = { ...m.userData, camFadeClone: true, baseOpacity: baseA, camDither: dith };
  if (!dith) { f.transparent = true; f.depthWrite = false; return f; }
  f.transparent = false;
  f.alphaHash = false;
  f.depthWrite = m.depthWrite !== false;
  const uCrownY = { value: Number.isFinite(crownY) ? crownY : -1e9 }, uBaseA = { value: baseA };
  f.userData.camCrownY = uCrownY;
  f.onBeforeCompile = function (sh, r) {
    base?.call(this, sh, r);
    sh.uniforms.uCamCrownY = uCrownY; sh.uniforms.uCamBaseA = uBaseA;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCamLocalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamLocalY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vCamLocalY;
uniform float uCamCrownY, uCamBaseA;${BAYER_GLSL}`)
      .replace('#include <alphahash_fragment>', `#include <alphahash_fragment>
if (vCamLocalY >= uCamCrownY && diffuseColor.a < camBayer4(gl_FragCoord.xy)) discard;   // cam fade (dithered)
diffuseColor.a = uCamBaseA;`);
  };
  f.customProgramCacheKey = () => (key ? key.call(m) : '') + '|camDither';
  return f;
}

function setOpacity(mat, v) {
  if (mat.isShaderMaterial && mat.uniforms?.opacity) mat.uniforms.opacity.value = v;
  mat.opacity = v;
}

function triCount(geo) {
  if (!geo) return 0;
  const n = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
  const dr = geo.drawRange;
  return Math.floor(Math.min(n, dr && Number.isFinite(dr.count) ? dr.count : n) / 3);
}

/** BatchedMesh instance ids that are alive (three r16x+ keeps `_instanceInfo`; else 0..instanceCount-1). */
function batchedIds(bm) {
  const info = bm._instanceInfo;
  const out = [];
  if (Array.isArray(info)) { for (let i = 0; i < info.length; i++) if (info[i]?.active !== false) out.push(i); }
  else { const n = bm.instanceCount ?? 0; for (let i = 0; i < n; i++) out.push(i); }
  return out;
}

/** Which instances of a tagged InstancedMesh / BatchedMesh fade. */
function instanceFilter(obj) {
  const ud = obj.userData ?? {};
  if (ud.camFadeIds != null) { const s = ud.camFadeIds instanceof Set ? ud.camFadeIds : new Set(ud.camFadeIds); return (i) => s.has(i); }
  if (typeof ud.camFade === 'function') return ud.camFade;
  return () => true;
}

export class OccluderFader {
  /**
   * @param {{ minOpacity?: number, archOpacity?: number, speed?: number, margin?: number, maxProxies?: number, checkHz?: number,
   *   dither?: boolean, fadeIn?: number, fadeOut?: number, crownR?: number, crownFrac?: number, roofPad?: number }} [opts]
   *   fadeIn / fadeOut: linear fade times (s); 0 = exponential at `speed`. crownR 0 disables the crown proximity rule.
   *   archOpacity: the faded opacity of roof and solid units (houses, towers, statues); minOpacity for the rest.
   */
  constructor({ minOpacity = 0.3, archOpacity = minOpacity, speed = 7, margin = 0.15, maxProxies = 16, checkHz = CHECK_HZ, dither = true,
    fadeIn = 0, fadeOut = 0, crownR = 0, crownFrac = 0.35, roofPad = 1.5 } = {}) {
    this.minOpacity = minOpacity; this.archOpacity = archOpacity; this.speed = speed; this.margin = margin; this.maxProxies = maxProxies;
    this.dither = dither; this.fadeIn = fadeIn; this.fadeOut = fadeOut;
    this.crownR = crownR; this.crownFrac = crownFrac; this.roofPad = roofPad;
    this.checkInterval = checkHz > 0 ? 1 / checkHz : 0;
    /** @type {any[]} registered units (one per tagged mesh / group / instance) */
    this.units = [];
    /** units currently faded (f > 0) */
    this.active = new Set();
    this._roots = new Set();
    this._proxyParent = null;
    this._proxies = [];
    /** BatchedMesh → Map(geometryId → view geometry); never disposed (they share the batch's GPU buffers) */
    this._views = new WeakMap();
    this._checkT = 0;
    this.enabled = true;
    /** world AABBs of every registered part, built lazily by covers() (null = stale) @type {THREE.Box3[]|null} */
    this._aabbs = null;
    /** registration version (bumped on add / remove / clear): part of the update() query key */
    this._ver = 0;
    /** the last full check's query (see _sameQuery) */
    this._qk = new Float64Array(QUERY_KEY_MAX);
    this._qOk = false;
    this._qAge = 0;
    this._qb = new Float64Array(6);
    /** cull units whose bounding sphere misses the query box before the hit rules (off only for tests) */
    this.broadPhase = true;
  }

  get count() { return this.units.length; }
  get fadedCount() { let n = 0; for (const u of this.active) if (u.f > 0.05) n++; return n; }
  /** registered solid occluder units (houses, towers, statues, pillars) */
  get solidCount() { let n = 0; for (const u of this.units) if (u.solid) n++; return n; }
  /** roof units (`camFade: 'roof'`) */
  get roofCount() { let n = 0; for (const u of this.units) if (u.roof) n++; return n; }
  /** crown units (trees) */
  get crownCount() { let n = 0; for (const u of this.units) if (u.crown) n++; return n; }
  /** solid occluder units currently faded */
  get fadedSolidCount() { let n = 0; for (const u of this.active) if (u.solid && u.f > 0.05) n++; return n; }

  /** Register `obj` (and, for groups, all its meshes as one unit). Static props only (bounds are cached). */
  add(obj, parentForProxies = null, { solid = false, roof = false, crown = null } = {}) {
    if (!obj || this._roots.has(obj)) return 0;
    if (parentForProxies) this._proxyParent = parentForProxies;
    obj.updateWorldMatrix(true, true);
    const before = this.units.length;
    const ud = obj.userData ?? {};
    if (ud.camFade === 'roof') roof = true;
    else if (ud.camFade === 'solid') solid = true;           // refresh() / addFadeable() keep a tagged solid solid
    this._crown = !roof && !solid && (crown ?? (ud.camFade === 'crown' || TREE_NAME.test(obj.name ?? '')));
    // world's per-template leaf start (`userData.crownFrac`, 0..1 of the local height), else the global default
    this._crownFracNow = Number.isFinite(ud.crownFrac) ? Math.min(0.95, Math.max(0, ud.crownFrac)) : this.crownFrac;
    if (obj.isBatchedMesh) this._addBatched(obj, obj);
    else if (obj.isInstancedMesh) this._addInstanced(obj, obj);
    else if (obj.isMesh) this._addUnit(obj, [obj]);
    else {
      const meshes = [];
      obj.traverse((o) => {
        if (o.userData?.cameraOwned) return;
        if (o.isBatchedMesh) this._addBatched(o, obj);
        else if (o.isInstancedMesh) this._addInstanced(o, obj);
        else if (o.isMesh && o.visible !== false) meshes.push(o);
      });
      if (meshes.length) this._addUnit(obj, meshes);
    }
    this._crown = false; this._crownFracNow = null;
    const pad = Number.isFinite(ud.roofPad) ? Math.max(0, ud.roofPad) : null;
    const lattice = ud.camFadeBox === true;                  // rails / lattices: the box test alone (gaps let sight lines through)
    for (let i = before; i < this.units.length; i++) { const u = this.units[i]; if (solid) u.solid = true; if (roof) u.roof = true; if (pad != null) u.roofPad = pad; if (lattice) u.precise = false; }
    if (this.units.length > before) { this._roots.add(obj); this._aabbs = null; }
    return this.units.length - before;
  }

  /** Unregister everything that came from `obj` (restoring it first). */
  remove(obj) {
    if (!this._roots.has(obj)) return;
    this._roots.delete(obj);
    this._aabbs = null; this._ver++;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.root !== obj) continue;
      this._restore(u);
      this.active.delete(u);
      this.units.splice(i, 1);
    }
  }

  /** Re-register `obj` (its instances or matrices changed). */
  refresh(obj, parentForProxies = null) { this.remove(obj); return this.add(obj, parentForProxies); }

  /**
   * Find fadeables under a level root: `userData.camFade` / `camFadeIds`, else the name heuristic.
   * @param {THREE.Object3D} root @param {THREE.Object3D} proxyParent where proxies live (the scene)
   */
  scan(root, proxyParent) {
    if (!root) return 0;
    this._proxyParent = proxyParent ?? this._proxyParent;
    let n = 0;
    const visit = (o, named) => {
      const ud = o.userData;
      if (ud?.camFade === false || ud?.cameraOwned) return;
      if (ud?.camFade === 'solid') { n += this.add(o, null, { solid: true }); return; }
      if (ud?.camFade === 'roof') { n += this.add(o, null, { roof: true }); return; }
      if (ud?.camFadeRoofIds != null && o.isBatchedMesh) {
        const ids = ud.camFadeRoofIds instanceof Set ? ud.camFadeRoofIds : new Set(ud.camFadeRoofIds);
        const before = this.units.length;
        o.updateWorldMatrix(true, false);
        this._addBatched(o, o, (i) => ids.has(i));
        for (let i = before; i < this.units.length; i++) this.units[i].roof = true;
        n += this.units.length - before; this._aabbs = null;
      }
      if (ud?.camFadeSolidIds != null && o.isBatchedMesh) {
        const ids = ud.camFadeSolidIds instanceof Set ? ud.camFadeSolidIds : new Set(ud.camFadeSolidIds);
        const before = this.units.length;
        o.updateWorldMatrix(true, false);
        this._addBatched(o, o, (i) => ids.has(i));
        for (let i = before; i < this.units.length; i++) this.units[i].solid = true;
        n += this.units.length - before; this._aabbs = null;
        if (ud.camFadeIds == null && typeof ud.camFade !== 'function' && ud.camFade !== true) return;
      }
      if (ud?.camFade === true || ud?.camFade === 'crown' || ud?.camFadeIds != null || (typeof ud?.camFade === 'function' && (o.isBatchedMesh || o.isInstancedMesh))) {
        n += this.add(o, null, { crown: ud.camFade === 'crown' || TREE_NAME.test(o.name ?? '') || (named && !o.isBatchedMesh) }); return;
      }
      if (o.isBatchedMesh && ud?.camFadeRoofIds != null) return;
      if (o.isBatchedMesh) return;                                   // untagged batch: may hold houses, fences...
      const isNamed = named || FADE_NAME.test(o.name ?? '');
      if (isNamed && (o.isMesh || o.isInstancedMesh)) { n += this.add(o, null, { crown: true }); return; }
      if (isNamed && o.children.length && o.children.every((c) => c.isMesh && !c.isInstancedMesh && !c.isBatchedMesh)) { n += this.add(o, null, { crown: true }); return; }   // a tree group
      for (const c of o.children) visit(c, isNamed);
    };
    visit(root, false);
    return n;
  }

  /**
   * Is a static collider footprint (world AABB in XZ, top y1) the footprint of a registered fadeable part, i.e. it
   * lies inside one part's world box (+ `slack` m), covers at least a quarter of its ground area (so a crate under a
   * wide canopy doesn't count) and doesn't rise above it? Such colliders (fence rails, posts of
   * a `fade` prop set) must not pull the camera in: the camera fades the prop instead (tech.md §8).
   * @param {number} minX @param {number} maxX @param {number} minZ @param {number} maxZ @param {number} y1
   * @param {number} [slack]
   */
  covers(minX, maxX, minZ, maxZ, y1, slack = 0.25) {
    if (!this._aabbs) {
      this._aabbs = [];
      const m = this.margin;
      for (const u of this.units) for (const p of u.parts) {
        if (u.solid || u.roof) continue;                         // solid occluders / roofs keep blocking the arm
        const b = p.box.clone().applyMatrix4(p.world);           // back to the prop's own extent (the box has the fade margin)
        b.min.x += m; b.min.z += m; b.max.x -= m; b.max.z -= m; b.max.y -= m;
        if (b.max.x < b.min.x) b.min.x = b.max.x = (b.min.x + b.max.x) / 2;
        if (b.max.z < b.min.z) b.min.z = b.max.z = (b.min.z + b.max.z) / 2;
        this._aabbs.push(b);
      }
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    for (const b of this._aabbs) {
      if (minX >= b.min.x - slack && maxX <= b.max.x + slack && minZ >= b.min.z - slack && maxZ <= b.max.z + slack
        && !(y1 > b.max.y + slack) && area >= 0.25 * (b.max.x - b.min.x) * (b.max.z - b.min.z)) return true;
    }
    return false;
  }

  /** Restore every faded prop and forget all registrations (level unload). */
  clear() {
    for (const u of this.units) this._restore(u);
    this.units.length = 0; this.active.clear(); this._roots.clear(); this._aabbs = null; this._ver++; this._qOk = false;
    for (const p of this._proxies) this._releaseProxy(p);
    this._checkT = 0;
  }

  dispose() {
    this.clear();
    for (const p of this._proxies) { p.mesh.removeFromParent(); p.mesh.material?.dispose?.(); if (p.instanced) p.mesh.dispose(); }
    this._proxies.length = 0;
  }

  // ------------------------------------------------------------------ registration
  /**
   * Add one part (a mesh, or one instance) to `unit`: local box (+ margin), world matrix, inverse, precise geometry.
   * @param {any} unit @param {THREE.Mesh} mesh @param {THREE.Box3} localBox @param {THREE.Matrix4} world
   * @param {THREE.BufferGeometry|null} rayGeo geometry for the triangle refinement (null = box only)
   */
  _part(unit, mesh, localBox, world, rayGeo) {
    if (!localBox || localBox.isEmpty()) return null;
    const sx = _a.setFromMatrixColumn(world, 0).length(), sy = _a.setFromMatrixColumn(world, 1).length(), sz = _a.setFromMatrixColumn(world, 2).length();
    if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) return null;
    const box = localBox.clone();
    box.min.x -= this.margin / sx; box.max.x += this.margin / sx;
    box.min.y -= this.margin / sy; box.max.y += this.margin / sy;
    box.min.z -= this.margin / sz; box.max.z += this.margin / sz;
    const sphere = box.getBoundingSphere(new THREE.Sphere()).applyMatrix4(world);
    const part = { mesh, box, world: world.clone(), inv: world.clone().invert(), index: -1, matrix: null, proxy: null, orig: null, faded: null,
      kind: 'mesh', geoId: -1, rayGeo: rayGeo && triCount(rayGeo) <= PRECISE_MAX_TRIS ? rayGeo : null, hidByUs: false,
      sx, sy, sz, crownY: -Infinity, never: false };
    if (unit.crown) {
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const nm = `${mesh.name ?? ''} ${mat?.name ?? ''}`;
      if (TRUNK_NAME.test(nm) && !CROWN_NAME.test(nm)) part.never = true;               // trunks never fade
      else if (!CROWN_NAME.test(nm)) part.crownY = localBox.min.y + (this._crownFracNow ?? this.crownFrac) * (localBox.max.y - localBox.min.y);
    }
    unit.parts.push(part);
    unit.aabb.union(_box.copy(box).applyMatrix4(world));
    unit.center.add(sphere.center);
    unit._spheres.push(sphere);
    return part;
  }

  _newUnit(root) {
    return { root, parts: [], center: new THREE.Vector3(), radius: 0, f: 0, hit: false, precise: false, solid: false, roof: false,
      crown: !!this._crown, aabb: new THREE.Box3(), _spheres: [] };
  }

  _finishUnit(u) {
    if (!u.parts.length || u.parts.every((p) => p.never)) return false;     // a lone trunk: nothing to fade
    u.center.multiplyScalar(1 / u._spheres.length);
    let r = 0;
    for (const s of u._spheres) r = Math.max(r, u.center.distanceTo(s.center) + s.radius);
    u.radius = r; u._spheres = null;
    u.precise = r > PRECISE_RADIUS && u.parts.every((p) => !!p.rayGeo);
    this.units.push(u);
    this._ver++;
    return true;
  }

  _addUnit(root, meshes) {
    const u = this._newUnit(root);
    for (const m of meshes) {
      const g = m.geometry;
      if (!g) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      this._part(u, m, g.boundingBox, m.matrixWorld, m.isSkinnedMesh ? null : g);
    }
    this._finishUnit(u);
  }

  _addInstanced(inst, root) {
    const n = inst.count ?? 0;
    const g = inst.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const want = instanceFilter(inst);
    for (let i = 0; i < n; i++) {
      if (!want(i)) continue;
      inst.getMatrixAt(i, _m);
      if (_m.elements[0] === 0 && _m.elements[5] === 0 && _m.elements[10] === 0) continue;   // hidden slot
      const local = _m.clone();
      const world = _m.premultiply(inst.matrixWorld);
      const u = this._newUnit(root);
      const part = this._part(u, inst, g.boundingBox, world, g);
      if (part) { part.kind = 'inst'; part.index = i; part.matrix = local; part.base = inst.matrixWorld.clone(); }
      this._finishUnit(u);
    }
  }

  _addBatched(bm, root, want = instanceFilter(bm)) {
    if (typeof bm.getGeometryIdAt !== 'function') return;
    const boxes = new Map();
    for (const i of batchedIds(bm)) {
      if (!want(i)) continue;
      let geoId;
      try { geoId = bm.getGeometryIdAt(i); } catch { continue; }
      if (!(geoId >= 0)) continue;
      let lb = boxes.get(geoId);
      if (lb === undefined) { lb = bm.getBoundingBoxAt(geoId, new THREE.Box3()); boxes.set(geoId, lb); }
      if (!lb) continue;
      bm.getMatrixAt(i, _m);
      const world = _m.premultiply(bm.matrixWorld);
      const u = this._newUnit(root);
      const part = this._part(u, bm, lb, world, this._view(bm, geoId));
      if (part) { part.kind = 'batch'; part.index = i; part.geoId = geoId; }
      this._finishUnit(u);
    }
  }

  /** A geometry that draws one geometry range of a BatchedMesh (shares its attributes and index). */
  _view(bm, geoId) {
    let views = this._views.get(bm);
    if (!views) { views = new Map(); this._views.set(bm, views); }
    let g = views.get(geoId);
    if (g) return g;
    const src = bm.geometry;
    if (!src?.attributes?.position) return null;
    g = new THREE.BufferGeometry();
    g.name = 'cam:batchView';
    for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
    if (src.index) g.setIndex(src.index);
    const r = bm.getGeometryRangeAt(geoId);
    g.setDrawRange(r.start, r.count);
    g.boundingBox = bm.getBoundingBoxAt(geoId, new THREE.Box3());
    g.boundingSphere = bm.getBoundingSphereAt?.(geoId, new THREE.Sphere()) ?? g.boundingBox.getBoundingSphere(new THREE.Sphere());
    g.userData.camFadeView = true;            // shares GPU buffers with the batch: never dispose()
    views.set(geoId, g);
    return g;
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {number} dt @param {THREE.Vector3} camPos @param {THREE.Vector3[]} targets subject points (chest, head)
   * @param {number} [nTargets]
   * @param {THREE.Vector3[]} [lens] end points of short "lens" segments (camera → a grid of points ~2 m into the view):
   *   any fadeable whose (margin-grown) box they touch fades, box test only, so a fence rail or post right in front of
   *   the lens fades even when the sight line to the subject slips between its rails
   * @param {number} [nLens]
   * @param {boolean} [solidOnly] only solid occluders may fade (a medium / far shot: trees stay, a house never hides her)
   * Iso form: update(dt, camPos, targets, { n, radii, her, crowns = true, lens, nLens, solidOnly }) — capsule radii per
   * target, `her` feet (the roof rule), crowns (the crown proximity rule).
   */
  update(dt, camPos, targets, nTargets = targets.length, lens = null, nLens = lens ? lens.length : 0, solidOnly = false) {
    let radii = null, her = null, crowns = false;                         // positional (classic) form: no crown rule
    if (nTargets && typeof nTargets === 'object') {                     // update(dt, cam, targets, { n, radii, her, ... })
      const o = nTargets;
      nTargets = o.n ?? targets.length; radii = o.radii ?? null; her = o.her ?? null;
      lens = o.lens ?? null; nLens = o.nLens ?? (lens ? lens.length : 0); solidOnly = !!o.solidOnly; crowns = o.crowns !== false;
    }
    if (!this.units.length) return;
    this._checkT -= dt;
    const tick = this._checkT <= 0;
    let check = tick;
    if (tick) {
      this._checkT = this.checkInterval;
      // PERF (AUTOCAM §9.6): the lens, subjects, options and registrations all unchanged (< 1 cm) since the last
      // full check → the hit set stands; a full pass still runs every QUERY_TTL checks (a prop re-shown / moved)
      if (this._sameQuery(camPos, targets, nTargets, radii, her, lens, nLens, solidOnly, crowns)) check = false;
      else {
        // broad phase over the whole query: the box around the lens, every subject (+ its capsule radius, the crown
        // reach) and lens point, her feet (+ the roof pad); a unit whose bounding sphere misses it cannot be hit
        const qb = this._queryBox(camPos, targets, nTargets, radii, her, lens, nLens, crowns);
        for (const u of this.units) {
          // crowns: the rule measures from the crown's box centre (≤ R from u.center) → 2R; crowns and roofs hide her
          // from above, so a unit above the box still counts (no max-y test)
          const c = u.center, R = u.radius * (u.crown ? 2 : 1) + (u.roof && u.roofPad > this.roofPad ? u.roofPad - this.roofPad : 0);
          if (this.broadPhase && (c.x + R < qb[0] || c.x - R > qb[3] || c.y + R < qb[1] || (!u.crown && !u.roof && c.y - R > qb[4]) || c.z + R < qb[2] || c.z - R > qb[5])) {
            u.hit = false;
            continue;
          }
          // the cheap analytic rules first: a crown / roof hit skips the capsule's triangle raycasts
          u.hit = this.enabled && (!solidOnly || u.solid) && (
            (u.roof && !!her && this._underRoof(u, her))
            || (crowns && u.crown && this.crownR > 0 && this._nearCrown(u, camPos, targets, nTargets, radii))
            || this._occludes(u, camPos, targets, nTargets, radii)
            || this._nearLens(u, camPos, lens, nLens));
          if (u.hit) this.active.add(u);                 // `active` = hit or still faded: the only units eased below
        }
      }
    }
    if (!this.active.size) return;
    // opacity easing at render rate over the hot units only (the hit tests above run at checkHz)
    const linear = this.fadeIn > 0 && this.fadeOut > 0;
    const k = 1 - Math.exp(-this.speed * dt);
    for (const u of this.active) {
      const hit = u.hit;
      if (linear) u.f = hit ? Math.min(1, u.f + dt / this.fadeIn) : Math.max(0, u.f - dt / this.fadeOut);
      else {
        u.f += ((hit ? 1 : 0) - u.f) * k;
        if (!hit && u.f < 0.02) u.f = 0;
        if (hit && u.f > 0.98) u.f = 1;
      }
      if (u.f > 0) this._applyFade(u, tick);
      else if (!hit) { this._restore(u); this.active.delete(u); }
    }
  }

  /**
   * Is this occlusion query the same as the last full check's (every point within QUERY_EPS m, same options, same
   * registrations / enabled flag)? Stores the query when it is not. No allocation (a fixed Float64Array key).
   */
  _sameQuery(camPos, targets, nTargets, radii, her, lens, nLens, solidOnly, crowns) {
    const nT = Math.min(nTargets, targets.length), nL = lens ? Math.min(nLens, lens.length) : 0;
    const need = 12 + nT * 4 + nL * 3;
    if (need > QUERY_KEY_MAX) { this._qOk = false; return false; }
    const q = this._qk, flags = (this.enabled ? 1 : 0) | (solidOnly ? 2 : 0) | (crowns ? 4 : 0) | (her ? 8 : 0);
    let same = this._qOk && ++this._qAge < QUERY_TTL && q[0] === this._ver && q[1] === flags && q[2] === nT && q[3] === nL
      && near(q[4], camPos.x) && near(q[5], camPos.y) && near(q[6], camPos.z)
      && (!her || (near(q[7], her.x) && near(q[8], her.y) && near(q[9], her.z)));
    let o = 12;
    for (let i = 0; same && i < nT; i++, o += 4) {
      const p = targets[i];
      same = near(q[o], p.x) && near(q[o + 1], p.y) && near(q[o + 2], p.z) && q[o + 3] === (radii ? (radii[i] ?? 0) : 0);
    }
    for (let i = 0; same && i < nL; i++, o += 3) { const p = lens[i]; same = near(q[o], p.x) && near(q[o + 1], p.y) && near(q[o + 2], p.z); }
    if (same) return true;
    this._qOk = true; this._qAge = 0;
    q[0] = this._ver; q[1] = flags; q[2] = nT; q[3] = nL; q[4] = camPos.x; q[5] = camPos.y; q[6] = camPos.z;
    q[7] = her ? her.x : 0; q[8] = her ? her.y : 0; q[9] = her ? her.z : 0;
    o = 12;
    for (let i = 0; i < nT; i++, o += 4) { const p = targets[i]; q[o] = p.x; q[o + 1] = p.y; q[o + 2] = p.z; q[o + 3] = radii ? (radii[i] ?? 0) : 0; }
    for (let i = 0; i < nL; i++, o += 3) { const p = lens[i]; q[o] = p.x; q[o + 1] = p.y; q[o + 2] = p.z; }
    return false;
  }

  /**
   * The update() broad-phase box [minX, minY, minZ, maxX, maxY, maxZ] (reused Float64Array): the lens, the subjects
   * grown by their capsule radius and the crown reach, the lens points, her feet grown by the roof pad.
   */
  _queryBox(camPos, targets, nTargets, radii, her, lens, nLens, crowns) {
    const b = this._qb;
    b[0] = b[3] = camPos.x; b[1] = b[4] = camPos.y; b[2] = b[5] = camPos.z;
    let rMax = 0;
    for (let t = 0; t < nTargets; t++) {
      const p = targets[t];
      grow(b, p.x, p.y, p.z, 0);
      if (radii && radii[t] > rMax) rMax = radii[t];
    }
    if (lens) for (let t = 0; t < nLens; t++) grow(b, lens[t].x, lens[t].y, lens[t].z, 0);
    // the capsules (r around every segment), the crown reach (horizontal crownR + r / 2), the box margin
    const g = rMax + (crowns && this.crownR > 0 ? this.crownR : 0) + this.margin;
    b[0] -= g; b[1] -= g; b[2] -= g; b[3] += g; b[4] += g; b[5] += g;
    if (her) grow(b, her.x, her.y, her.z, this.roofPad);
    return b;
  }

  /** Force the next update() check to re-test every unit (a caller moved a registered prop in place). */
  invalidate() { this._qOk = false; this._checkT = 0; }

  /**
   * Does the unit cut the capsule camera → any subject point (radius radii[t], default 0)? A capsule (r > 0) ends r m
   * short of the subject, toward the lens: its round end then reaches the subject's depth but not beyond, so props
   * behind her (farther from the lens, screen-up of her at the iso pitch) never fade.
   */
  _occludes(u, camPos, targets, nTargets, radii = null) {
    for (let t = 0; t < nTargets; t++) {
      const r = radii ? (radii[t] ?? 0) : 0;
      let p = targets[t];
      if (r > 0) {
        _end.subVectors(camPos, p);
        const len = _end.length();
        if (len > 1e-6) { p = _end.multiplyScalar(Math.min(r, len * 0.5) / len).add(targets[t]); }
      }
      const R = u.radius + r;
      if (distSqPointSegment(u.center, camPos, p) > R * R) continue;    // broad phase
      for (const part of u.parts) {
        if (part.never) continue;
        _b.copy(camPos).applyMatrix4(part.inv);
        _c.copy(p).applyMatrix4(part.inv);
        let box = part.box;
        if (r > 0) {
          box = _box.copy(part.box);
          box.min.x -= r / part.sx; box.max.x += r / part.sx; box.min.y -= r / part.sy; box.max.y += r / part.sy;
          box.min.z -= r / part.sz; box.max.z += r / part.sz;
        }
        if (!segmentHitsBox(_b, _c, box)) continue;
        if (!u.precise || this._capsuleHitsTriangles(part, camPos, p, r, targets[t])) return true;
      }
    }
    return false;
  }

  /**
   * Triangle test of a capsule: the centre line a → `subject` (any face on it is lens-side of her), then 4 lines offset
   * by 0.7 r around it, ending at `b` (the capsule's shortened end).
   */
  _capsuleHitsTriangles(part, a, b, r, subject = b) {
    if (this._segmentHitsTriangles(part, a, subject)) return true;
    if (!(r > 0)) return false;
    _rayDir.subVectors(b, a).normalize();
    _side.set(-_rayDir.z, 0, _rayDir.x);
    if (_side.lengthSq() < 1e-8) _side.set(1, 0, 0); else _side.normalize();
    _up.crossVectors(_side, _rayDir).normalize();
    const o = r * 0.7;
    for (let i = 0; i < 4; i++) {
      const sx = i === 0 ? o : i === 1 ? -o : 0, sy = i === 2 ? o : i === 3 ? -o : 0;
      _off.copy(_side).multiplyScalar(sx).addScaledVector(_up, sy);
      _a2.copy(a).addScaledVector(_off, 0.15);                         // capsules taper toward the lens
      _b2.copy(b).add(_off);
      if (this._segmentHitsTriangles(part, _a2, _b2)) return true;
    }
    return false;
  }

  /**
   * Crown rule (§3): a canopy within crownR m horizontally of a target capsule's ground track that rises above the
   * capsule there (it hides that patch of ground from above).
   */
  _nearCrown(u, camPos, targets, nTargets, radii) {
    const bx = u.aabb, cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2;
    const half = Math.hypot(bx.max.x - bx.min.x, bx.max.z - bx.min.z) * 0.35;  // ~ the crown's own horizontal radius
    for (let t = 0; t < nTargets; t++) {
      const p = targets[t], r = radii ? (radii[t] ?? 0) : 0;
      const dx = p.x - camPos.x, dz = p.z - camPos.z, l2 = dx * dx + dz * dz;
      let s = l2 > 1e-8 ? ((cx - camPos.x) * dx + (cz - camPos.z) * dz) / l2 : 1;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const hx = camPos.x + dx * s - cx, hz = camPos.z + dz * s - cz;
      const d = Math.hypot(hx, hz) - half;
      if (d > this.crownR + r * 0.5) continue;
      const segY = camPos.y + (p.y - camPos.y) * s;
      if (bx.max.y < segY - r) continue;                                  // the crown stays below the sight line
      if (bx.max.y < p.y + 0.6) continue;                                  // a low bush beside her hides nothing
      return true;
    }
    return false;
  }

  /** Roof rule (§3): she stands under the roof footprint grown by roofPad. */
  _underRoof(u, her) {
    const bx = u.aabb, pad = u.roofPad ?? this.roofPad;
    return her.x >= bx.min.x - pad && her.x <= bx.max.x + pad && her.z >= bx.min.z - pad && her.z <= bx.max.z + pad
      && bx.max.y > her.y + 1.0;
  }

  /** Does any lens segment (camera → lens[i]) touch one of the unit's part boxes? (no triangle refinement) */
  _nearLens(u, camPos, lens, nLens) {
    if (!lens || !nLens) return false;
    for (let t = 0; t < nLens; t++) {
      const p = lens[t];
      if (distSqPointSegment(u.center, camPos, p) > u.radius * u.radius) continue;
      for (const part of u.parts) {
        if (part.never) continue;
        _b.copy(camPos).applyMatrix4(part.inv);
        _c.copy(p).applyMatrix4(part.inv);
        if (!segmentHitsBox(_b, _c, part.box)) continue;
        // solid occluders: the lens is often inside a house's box (pressed against its wall): real faces only
        if (!u.solid || !u.precise || this._segmentHitsTriangles(part, camPos, p)) return true;
      }
    }
    return false;
  }

  /**
   * Auto-register solid occluders under `root` (see the header): every untagged BatchedMesh instance and plain Mesh
   * at least `minHeight` tall whose world box stands on one of `footprints` (solid static collider records with
   * minX/maxX/minZ/maxZ/y0/y1, e.g. physics toRecord()) becomes a solid unit; smaller untagged props whose box lies
   * inside such a box join that unit. Already registered parts and `skip(obj, instanceId)` are left alone.
   * @param {THREE.Object3D} root @param {{minX:number,maxX:number,minZ:number,maxZ:number,y0:number,y1:number,src?:any}[]} footprints
   * @param {{minHeight?: number, skip?: (obj: THREE.Object3D, id: number) => boolean, proxyParent?: THREE.Object3D}} [opts]
   * @returns {{units: number, matched: Set<any>}} new units and the footprints (their `src`, else the record) used
   */
  scanSolids(root, footprints, { minHeight = SOLID_MIN_H, skip = null, proxyParent = null } = {}) {
    const matched = new Set();
    if (!root || !footprints?.length) return { units: 0, matched };
    if (proxyParent) this._proxyParent = proxyParent;
    root.updateWorldMatrix(true, true);
    const taken = new Set();
    for (const u of this.units) for (const p of u.parts) taken.add(p.kind === 'batch' || p.kind === 'inst' ? `${p.mesh.id}:${p.index}` : p.mesh.id);
    // 1. candidates: world boxes of batch instances and plain meshes
    const cands = [];
    const boxes = new Map();
    const visit = (o) => {
      const ud = o.userData ?? {};
      if (ud.cameraOwned || ud.camFade === false || ud.camOccluder === false || o.visible === false) return;
      if (o.isBatchedMesh && typeof o.getGeometryIdAt === 'function') {
        boxes.clear();
        for (const i of batchedIds(o)) {
          if (taken.has(`${o.id}:${i}`) || skip?.(o, i)) continue;
          let geoId;
          try { geoId = o.getGeometryIdAt(i); } catch { continue; }
          if (!(geoId >= 0)) continue;
          let lb = boxes.get(geoId);
          if (lb === undefined) { lb = o.getBoundingBoxAt(geoId, new THREE.Box3()); boxes.set(geoId, lb); }
          if (!lb || lb.isEmpty()) continue;
          o.getMatrixAt(i, _m);
          const world = _m.clone().premultiply(o.matrixWorld);
          cands.push({ kind: 'batch', obj: o, id: i, geoId, lb: lb.clone(), world, aabb: lb.clone().applyMatrix4(world), unit: null, area: 0 });
        }
        return;
      }
      if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !taken.has(o.id) && !skip?.(o, -1) && o.geometry?.attributes?.position) {
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (!g.boundingBox.isEmpty()) cands.push({ kind: 'mesh', obj: o, id: -1, lb: g.boundingBox, world: o.matrixWorld, aabb: g.boundingBox.clone().applyMatrix4(o.matrixWorld), unit: null, area: 0 });
      }
      for (const c of o.children) visit(c);
    };
    visit(root);
    // 2. main props: tall, standing on a solid footprint that covers a good part of their ground area
    const area = (b) => Math.max(0, b.max.x - b.min.x) * Math.max(0, b.max.z - b.min.z);
    const mains = [];
    for (const c of cands) {
      const b = c.aabb, a = area(b);
      if (b.max.y - b.min.y < minHeight || a <= 0 || a > SOLID_MAX_AREA) continue;
      for (const f of footprints) {
        const fx = (f.minX + f.maxX) / 2, fz = (f.minZ + f.maxZ) / 2;
        if (fx < b.min.x - 0.3 || fx > b.max.x + 0.3 || fz < b.min.z - 0.3 || fz > b.max.z + 0.3) continue;
        const fa = Math.max(0, f.maxX - f.minX) * Math.max(0, f.maxZ - f.minZ);
        if (fa < 0.2 * a || fa > 2.5 * a) continue;                       // a crate under a tree / a wall past a post
        if (Number.isFinite(f.y1) && f.y1 < b.min.y + 1.0) continue;     // a low curb under a tall thing
        matched.add(f.src ?? f);
        if (!c.unit) { c.unit = this._newUnit(root); c.unit.solid = true; c.area = a; mains.push(c); }
      }
    }
    if (!mains.length) return { units: 0, matched };
    mains.sort((x, y) => y.area - x.area);
    // 3. small untagged props inside a main prop's box join it (chimney, sign, roof parts of a multi-part model)
    for (const c of cands) {
      if (c.unit) continue;
      const b = c.aabb;
      for (const m of mains) {
        const M = m.aabb;
        if (b.min.x >= M.min.x - 0.25 && b.max.x <= M.max.x + 0.25 && b.min.z >= M.min.z - 0.25 && b.max.z <= M.max.z + 0.25
          && b.min.y >= M.min.y - 0.5 && b.max.y <= M.max.y + 0.5) { c.unit = m.unit; break; }
      }
    }
    for (const c of cands) {
      if (!c.unit) continue;
      if (c.kind === 'batch') {
        const part = this._part(c.unit, c.obj, c.lb, c.world, this._view(c.obj, c.geoId));
        if (part) { part.kind = 'batch'; part.index = c.id; part.geoId = c.geoId; }
      } else this._part(c.unit, c.obj, c.lb, c.world, c.obj.geometry);
    }
    let n = 0;
    for (const m of mains) if (this._finishUnit(m.unit)) n++;
    if (n) { this._roots.add(root); this._aabbs = null; }
    return { units: n, matched };
  }

  /** Triangle-accurate test of the world segment a → b against a part's geometry (any face side). */
  _segmentHitsTriangles(part, a, b) {
    const geo = part.rayGeo;
    if (!geo) return true;
    if (!_scratch) { _scratch = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); _scratch.matrixAutoUpdate = false; }
    _rayDir.subVectors(b, a);
    const len = _rayDir.length();
    if (len < 1e-6) return false;
    _scratch.geometry = geo;
    _scratch.matrixWorld.copy(part.world);
    _raycaster.set(a, _rayDir.multiplyScalar(1 / len));
    _raycaster.near = 0; _raycaster.far = len + this.margin;
    _hits.length = 0;
    _scratch.raycast(_raycaster, _hits);
    const hit = _hits.length > 0;
    _hits.length = 0;
    return hit;
  }

  /**
   * Apply a unit's fade. A settled unit (opacity unchanged since the last apply) is skipped between checks; on a
   * check (`full`) its batch sources are re-hidden if world re-showed them (culling), without a per-frame
   * setVisibleAt (that re-sorts the BatchedMesh draw list).
   */
  _applyFade(u, full = true) {
    const op = 1 - u.f * (1 - (u.roof || u.solid ? this.archOpacity : this.minOpacity));
    if (op === u.op && !full) return;
    u.op = op;
    for (const part of u.parts) {
      if (part.never) continue;                         // trunks never fade
      const mesh = part.mesh;
      if (part.kind === 'inst' || part.kind === 'batch') {
        if (!part.proxy) {
          if (part.kind === 'batch' && !this._batchVisible(part)) continue;     // culled / hidden by world: nothing to fade
          part.proxy = this._takeProxy(part);
          if (!part.proxy) continue;                   // pool exhausted: leave it opaque
          this._hideSource(part);
        } else if (part.kind === 'batch' && part.hidByUs && this._batchVisible(part)) mesh.setVisibleAt(part.index, false);   // world re-showed it
        setOpacity(part.proxy.mesh.material, (part.proxy.mesh.material.userData.baseOpacity ?? 1) * op);
        continue;
      }
      if (!part.faded) {
        const m = mesh.material;
        if (Array.isArray(m)) {
          if (!m.every(fadeableMaterial)) { part.orig = m; part.faded = 'hide'; continue; }
          part.orig = m; part.faded = m.map((x) => makeFadeMaterial(x, this._fadeOpts(part)));
        } else if (!fadeableMaterial(m)) { part.orig = m; part.faded = 'hide'; }
        else { part.orig = m; part.faded = makeFadeMaterial(m, this._fadeOpts(part)); }
        if (part.faded !== 'hide') mesh.material = part.faded;
      }
      if (part.faded === 'hide') { mesh.visible = u.f < 0.5; continue; }
      const list = Array.isArray(part.faded) ? part.faded : [part.faded];
      for (const fm of list) setOpacity(fm, (fm.userData.baseOpacity ?? 1) * op);
    }
  }

  /** makeFadeMaterial options for a part (dither, the crown cut). */
  _fadeOpts(part) { return { dither: this.dither, crownY: part.crownY }; }

  _batchVisible(part) {
    try { return part.mesh.getVisibleAt(part.index) !== false; } catch { return false; }
  }

  _hideSource(part) {
    const mesh = part.mesh;
    if (part.kind === 'inst') { mesh.setMatrixAt(part.index, _zero); mesh.instanceMatrix.needsUpdate = true; return; }
    try { mesh.setVisibleAt(part.index, false); part.hidByUs = true; } catch { part.hidByUs = false; }
  }

  _showSource(part) {
    const mesh = part.mesh;
    if (part.kind === 'inst') { mesh.setMatrixAt(part.index, part.matrix); mesh.instanceMatrix.needsUpdate = true; return; }
    if (part.hidByUs) { try { mesh.setVisibleAt(part.index, true); } catch { /* instance deleted meanwhile */ } }
    part.hidByUs = false;
  }

  _restore(u) {
    for (const part of u.parts) {
      if (part.kind === 'inst' || part.kind === 'batch') {
        if (part.proxy) {
          this._showSource(part);
          this._releaseProxy(part.proxy);
          part.proxy = null;
        }
        continue;
      }
      if (!part.faded) continue;
      if (part.faded === 'hide') part.mesh.visible = true;
      else {
        part.mesh.material = part.orig;
        const list = Array.isArray(part.faded) ? part.faded : [part.faded];
        for (const fm of list) fm.dispose();
      }
      part.faded = null; part.orig = null;
    }
    u.f = 0; u.op = 1;
  }

  /**
   * A pooled transparent proxy that draws one part. Instanced sources get a single-instance InstancedMesh (same
   * USE_INSTANCING shader path: world shaders that read instanceMatrix / instanceColor, e.g. the tree wind phase,
   * render identically); batch instances get a Mesh on a view of the batch geometry.
   */
  _takeProxy(part) {
    if (!this._proxyParent) return null;
    const instanced = part.kind === 'inst';
    let p = this._proxies.find((x) => !x.used && x.instanced === instanced);
    if (!p) {
      if (this._proxies.length >= this.maxProxies) {
        const i = this._proxies.findIndex((x) => !x.used);          // recycle an idle proxy of the other kind
        if (i < 0) return null;
        const old = this._proxies[i];
        old.mesh.removeFromParent(); old.mesh.material?.dispose?.();
        if (old.instanced) old.mesh.dispose();                       // its own instance buffers only
        this._proxies.splice(i, 1);
      }
      const mesh = instanced ? new THREE.InstancedMesh(undefined, new THREE.MeshBasicMaterial(), 1) : new THREE.Mesh(undefined, new THREE.MeshBasicMaterial());
      mesh.matrixAutoUpdate = false; mesh.name = 'cam:fadeProxy';
      mesh.userData.cameraOwned = true;
      mesh.frustumCulled = false;
      p = { mesh, used: false, instanced };
      this._proxies.push(p);
    }
    const src = part.mesh, mesh = p.mesh;
    const geo = part.kind === 'batch' ? this._view(src, part.geoId) : src.geometry;
    if (!geo) return null;
    const srcMat = Array.isArray(src.material) ? src.material[0] : src.material;
    mesh.material?.dispose?.();
    mesh.material = fadeableMaterial(srcMat) ? makeFadeMaterial(srcMat, this._fadeOpts(part)) : new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    mesh.geometry = geo;
    if (instanced) {
      mesh.setMatrixAt(0, part.matrix); mesh.instanceMatrix.needsUpdate = true;
      if (src.instanceColor) mesh.setColorAt(0, _color.fromBufferAttribute(src.instanceColor, part.index));
      else if (mesh.instanceColor) mesh.setColorAt(0, _color.setRGB(1, 1, 1));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.matrix.copy(part.base);
    } else {
      if (part.kind === 'batch' && mesh.material.color) { try { src.getColorAt(part.index, _color); mesh.material.color.multiply(_color); } catch { /* no colours */ } }
      mesh.matrix.copy(part.world);
    }
    mesh.matrixWorld.copy(mesh.matrix);
    mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow;
    mesh.visible = true;
    p.used = true;
    if (mesh.parent !== this._proxyParent) this._proxyParent.add(mesh);
    return p;
  }

  _releaseProxy(p) {
    if (!p.used) return;
    p.used = false;
    p.mesh.visible = false;
  }
}
