/**
 * Scene baking for the GLB export (tools/export-glb.mjs).
 *
 * The game scene is built for three.js: InstancedMesh, ShaderMaterials, additive glows, x-ray
 * silhouettes, HDR colours above 1 and mirrored sprites. A plain glTF viewer (Anitya's editor) needs
 * none of that. bakeScene() walks a scene graph and returns a flat group with one merged mesh per
 * material: instances are expanded, world transforms are baked into the vertices (winding fixed
 * for mirrored nodes), instance colours are baked into vertex colours, and materials are converted
 * to glTF core PBR (MeshStandardMaterial) or unlit (MeshBasicMaterial). Pure three: runs in the
 * browser page and in node (the unit test).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BakeOptions {
  /** Applied after each object's world matrix (for example a world scale and centring offset). */
  matrix?: THREE.Matrix4;
  /** Return true to leave an object (and its children) out. */
  skip?: (o: THREE.Object3D) => boolean;
  /** Name of the returned group. */
  name?: string;
  /** Shared source -> glTF material map, so several bakes (sprite frames) reuse one material. */
  materials?: Map<THREE.Material, THREE.Material | null>;
}

export interface BakeStats {
  meshes: number;
  materials: number;
  triangles: number;
  vertices: number;
  /** Source meshes left out because their material has no glTF equivalent (glows, shaders, x-ray). */
  dropped: number;
}

export interface BakeResult {
  group: THREE.Group;
  stats: BakeStats;
}

const clamp01 = (c: THREE.Color) => new THREE.Color(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b));

/** First THREE.Color uniform of a ShaderMaterial, used as a flat stand-in colour. */
function shaderColor(m: THREE.ShaderMaterial): THREE.Color | null {
  for (const k of ['uColor', 'uC', 'uA', 'uB']) {
    const v = m.uniforms?.[k]?.value;
    if (v instanceof THREE.Color) return v;
  }
  return null;
}

/**
 * glTF stand-in for a three material, or null when it has none: additive glows and light shafts,
 * x-ray silhouettes (depth tricks), invisible or fully transparent materials, and shaders without a
 * colour uniform. Opaque-looking shaders (the portal swirl) become a flat unlit colour.
 */
export function convertMaterial(m: THREE.Material): THREE.Material | null {
  if (!m.visible) return null;
  if (m.blending === THREE.AdditiveBlending) return null;
  if (m.depthTest === false || m.depthFunc === THREE.GreaterDepth) return null;
  if (m.transparent && m.opacity < 0.05) return null;
  const common = { transparent: m.transparent && m.opacity < 0.999, opacity: m.opacity, side: m.side, name: m.name };
  if ((m as THREE.ShaderMaterial).isShaderMaterial) {
    const c = shaderColor(m as THREE.ShaderMaterial);
    if (!c) return null;
    return new THREE.MeshBasicMaterial({ ...common, color: clamp01(c), transparent: true, opacity: 0.85 });
  }
  const src = m as THREE.MeshLambertMaterial & Partial<THREE.MeshStandardMaterial>;
  const color = src.color ? clamp01(src.color) : new THREE.Color(1, 1, 1);
  const map = src.map ?? null;
  const vertexColors = !!src.vertexColors;
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    return new THREE.MeshBasicMaterial({ ...common, color, map, vertexColors });
  }
  if (!src.isMaterial || !('emissive' in src)) return null;
  const out = new THREE.MeshStandardMaterial({
    ...common,
    color,
    map,
    vertexColors,
    roughness: src.roughness ?? 0.85,
    metalness: src.metalness ?? 0,
  });
  if (src.emissive && (src.emissive.r || src.emissive.g || src.emissive.b)) {
    out.emissive = clamp01(src.emissive);
    out.emissiveIntensity = src.emissiveIntensity ?? 1;
  }
  return out;
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  uv: boolean;
  color: boolean;
}

/** Clone a geometry into the merge layout: indexed, transformed, position/normal (+uv, +color). */
function prepGeometry(src: THREE.BufferGeometry, m: THREE.Matrix4, tint: THREE.Color | null, wantUv: boolean, wantColor: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const pos = src.getAttribute('position');
  const n = pos.count;
  g.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => pos.getComponent((i / 3) | 0, i % 3)), 3));
  const nrm = src.getAttribute('normal');
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => nrm.getComponent((i / 3) | 0, i % 3)), 3));
  const uv = src.getAttribute('uv');
  if (wantUv) {
    const a = new Float32Array(n * 2);
    if (uv) for (let i = 0; i < n; i++) (a[i * 2] = uv.getX(i)), (a[i * 2 + 1] = uv.getY(i));
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  }
  if (wantColor) {
    const col = src.getAttribute('color');
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = col ? col.getX(i) : 1, gg = col ? col.getY(i) : 1, b = col ? col.getZ(i) : 1;
      a[i * 3] = Math.min(1, r * (tint?.r ?? 1));
      a[i * 3 + 1] = Math.min(1, gg * (tint?.g ?? 1));
      a[i * 3 + 2] = Math.min(1, b * (tint?.b ?? 1));
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  let index: number[];
  const si = src.getIndex();
  if (si) index = Array.from({ length: si.count }, (_, i) => si.getX(i));
  else index = Array.from({ length: n }, (_, i) => i);
  const range = src.drawRange;
  if (range.count !== Infinity || range.start > 0) index = index.slice(range.start, range.start + range.count);
  // A mirrored transform (negative determinant) turns front faces inside out: reverse the winding.
  if (m.determinant() < 0) for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  g.setIndex(index);
  g.applyMatrix4(m);
  if (!nrm) g.computeVertexNormals();
  return g;
}

/** Flatten `root` into one merged mesh per material. `root` itself is not modified. */
export function bakeScene(root: THREE.Object3D, opts: BakeOptions = {}): BakeResult {
  root.updateWorldMatrix(true, true);
  const post = opts.matrix ?? new THREE.Matrix4();
  const converted = opts.materials ?? new Map<THREE.Material, THREE.Material | null>();
  const buckets = new Map<string, Bucket>();
  const stats: BakeStats = { meshes: 0, materials: 0, triangles: 0, vertices: 0, dropped: 0 };
  const m4 = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  const tint = new THREE.Color();

  const visit = (o: THREE.Object3D) => {
    if (!o.visible || opts.skip?.(o)) return;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(mesh.material)) {
      let mat = converted.get(mesh.material);
      if (mat === undefined) {
        mat = convertMaterial(mesh.material);
        converted.set(mesh.material, mat);
      }
      if (!mat) stats.dropped++;
      else {
        const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh) : null;
        const tinted = !!inst?.instanceColor;
        const key = mat.uuid + (tinted ? ':tint' : '');
        let b = buckets.get(key);
        if (!b) {
          const bm = tinted && !(mat as THREE.MeshBasicMaterial).vertexColors ? mat.clone() : mat;
          if (tinted) (bm as THREE.MeshBasicMaterial).vertexColors = true;
          b = { mat: bm, geos: [], uv: !!(bm as THREE.MeshBasicMaterial).map, color: !!(bm as THREE.MeshBasicMaterial).vertexColors };
          buckets.set(key, b);
        }
        if (inst) {
          for (let i = 0; i < inst.count; i++) {
            inst.getMatrixAt(i, im);
            if (Math.abs(im.determinant()) < 1e-12) continue; // hidden (scaled to 0) instance
            m4.multiplyMatrices(post, o.matrixWorld).multiply(im);
            if (tinted) inst.getColorAt(i, tint);
            b.geos.push(prepGeometry(mesh.geometry, m4, tinted ? tint : null, b.uv, b.color));
          }
        } else {
          m4.multiplyMatrices(post, o.matrixWorld);
          if (Math.abs(m4.determinant()) > 1e-12) b.geos.push(prepGeometry(mesh.geometry, m4, null, b.uv, b.color));
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(root);

  const group = new THREE.Group();
  group.name = opts.name ?? root.name ?? 'baked';
  let i = 0;
  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) throw new Error(`bake: could not merge ${b.geos.length} geometries for ${b.mat.type}`);
    for (const g of b.geos) if (g !== geo) g.dispose();
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.name = `${group.name}-${b.mat.name || b.mat.type.replace('Material', '').toLowerCase()}-${i++}`;
    group.add(mesh);
    stats.meshes++;
    stats.triangles += (geo.getIndex()?.count ?? geo.getAttribute('position').count) / 3;
    stats.vertices += geo.getAttribute('position').count;
  }
  stats.materials = new Set([...group.children].map((c) => (c as THREE.Mesh).material)).size;
  return { group, stats };
}
