// Shared toon look for every CAT-AUDIO model (Mochi, the dog, the puff cloud, the leaf, Grandma, the yarn ball).
// Materials and geometries are cached per module and flagged userData.shared, so rigs can be rebuilt every stage
// start without leaking GPU memory and core's despawn disposal never frees them.
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;
/** 4-step cel ramp: a soft shadow band, a mid tone and a bright top, like the reference's painted toon look. */
export function toonRamp(): THREE.DataTexture {
  if (gradient) return gradient;
  const d = new Uint8Array([110, 110, 110, 255, 175, 175, 175, 255, 228, 228, 228, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map<string, THREE.Material>();
/** A cached toon material. key must be unique per look. */
export function toon(key: string, color: number, opts: { map?: THREE.Texture; emissive?: number; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const k = `toon:${key}`;
  let m = matCache.get(k) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), map: opts.map ?? null });
    if (opts.emissive !== undefined) {
      m.emissive.setHex(opts.emissive);
      m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    }
    if (opts.transparent) {
      m.transparent = true;
      m.opacity = opts.opacity ?? 1;
      m.depthWrite = false;
    }
    matCache.set(k, m);
  }
  return m;
}
/** A cached unlit material (eyes, highlights, outlines). */
export function flat(key: string, color: number, side: THREE.Side = THREE.FrontSide): THREE.MeshBasicMaterial {
  const k = `flat:${key}`;
  let m = matCache.get(k) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side });
    matCache.set(k, m);
  }
  return m;
}
/** Inverted-hull outline material (dark warm brown, back faces only). */
export const outlineMat = (color = 0x3a2416) => flat(`outline${color}`, color, THREE.BackSide);

const geoCache = new Map<string, THREE.BufferGeometry>();
/** A cached geometry flagged as shared (never disposed by core). */
export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}
export const SPHERE = () => geo('sphere', () => new THREE.SphereGeometry(1, 22, 16));
export const SPHERE_LO = () => geo('sphereLo', () => new THREE.SphereGeometry(1, 12, 9));

type V3 = [number, number, number];
/** Add a mesh to parent at p with scale s. */
export function part(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, p: V3, s: V3 = [1, 1, 1], shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  m.castShadow = shadow;
  parent.add(m);
  return m;
}
/** Give a mesh an inverted-hull outline child (k = relative thickness). */
export function outline(m: THREE.Mesh, k = 0.07, color?: number): THREE.Mesh {
  const o = new THREE.Mesh(m.geometry, outlineMat(color));
  o.scale.setScalar(1 + k);
  o.castShadow = false;
  o.userData.outline = true;
  m.add(o);
  return o;
}

/** Show or hide every outline under root (outlines cost a draw call each, so LOW quality drops them). */
export function setOutlines(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o.userData.outline) o.visible = on;
  });
}

const texCache = new Map<string, THREE.CanvasTexture>();
/** A cached canvas texture (w x h) painted once. */
export function canvasTex(key: string, w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

/** Deterministic tiny PRNG for painted textures (same look every load). */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
