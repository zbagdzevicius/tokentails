/**
 * GLB export for Anitya: the scene baker (hermetic) and a load-back of every file that
 * `npm run export-glb` wrote to export/anitya/ (skipped when the export has not been run, or while
 * one is running: the exporter holds export/anitya/.export-running and publishes its files and the
 * manifest together only at the end, so a finished export is always self-consistent).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { bakeScene, convertMaterial } from './export-bake';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../export/anitya');
const tris = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3;

describe('bakeScene', () => {
  it('expands instances, skips zero-scale ones and bakes instance colours', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    const inst = new THREE.InstancedMesh(geo, mat, 3);
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0));
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0));
    inst.setMatrixAt(2, new THREE.Matrix4().makeScale(0, 0, 0));
    inst.setColorAt(0, new THREE.Color(1, 0, 0));
    inst.setColorAt(1, new THREE.Color(0, 1, 0));
    inst.setColorAt(2, new THREE.Color(0, 0, 1));
    const root = new THREE.Group();
    root.add(inst);
    const { group, stats } = bakeScene(root);
    expect(stats.meshes).toBe(1);
    expect(stats.triangles).toBe(24);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    const col = mesh.geometry.getAttribute('color');
    expect([col.getX(0), col.getY(0), col.getZ(0)]).toEqual([1, 0, 0]);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.max.x).toBeCloseTo(5.5);
  });

  it('applies the post matrix and keeps faces outward under a mirrored transform', () => {
    const plain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial());
    const mirrored = plain.clone();
    mirrored.scale.x = -1;
    const faceZ = (m: THREE.Object3D) => {
      const g = (bakeScene(m, { matrix: new THREE.Matrix4().makeScale(3, 3, 3) }).group.children[0] as THREE.Mesh).geometry;
      const p = g.getAttribute('position');
      const i = g.index!;
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i.getX(k)));
      return { z: new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).z, size: new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute).getSize(new THREE.Vector3()) };
    };
    const a = faceZ(plain);
    const b = faceZ(mirrored);
    expect(a.z).toBeGreaterThan(0);
    expect(b.z).toBeGreaterThan(0);
    expect(a.size.x).toBeCloseTo(3);
  });

  it('drops glTF-less materials and clamps HDR colours', () => {
    expect(convertMaterial(new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }))).toBeNull();
    expect(convertMaterial(new THREE.MeshBasicMaterial({ depthTest: false }))).toBeNull();
    expect(convertMaterial(new THREE.MeshBasicMaterial({ depthFunc: THREE.GreaterDepth }))).toBeNull();
    expect(convertMaterial(new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } } }))).toBeNull();
    const swirl = convertMaterial(new THREE.ShaderMaterial({ uniforms: { uA: { value: new THREE.Color(0.2, 0.4, 0.6) } } }));
    expect(swirl).toBeInstanceOf(THREE.MeshBasicMaterial);
    const hot = convertMaterial(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 0.5) })) as THREE.MeshBasicMaterial;
    expect(hot.color.toArray()).toEqual([1, 1, 0.5]);
    const lit = convertMaterial(new THREE.MeshLambertMaterial({ emissive: '#3a7a20', emissiveIntensity: 0.9 })) as THREE.MeshStandardMaterial;
    expect(lit).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(lit.emissiveIntensity).toBe(0.9);
  });

  it('skips hidden subtrees and the objects `skip` rejects', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial());
    const b = a.clone();
    const c = a.clone();
    b.visible = false;
    c.name = 'nope';
    root.add(a, b, c);
    expect(bakeScene(root, { skip: (o) => o.name === 'nope' }).stats.triangles).toBe(12);
  });
});

interface ManifestFile {
  file: string;
  kind: string;
  bytes: number;
  triangles: number;
  meshes: number;
  lights: number;
  animations: number;
}
interface Manifest {
  limits: { storageBytes: number; worldBytes: number; worldTriangles: number; worldLights: number; assetBytes: number; assetTriangles: number };
  totalBytes: number;
  files: ManifestFile[];
}

/** The pid in the exporter's lock file, when that process is still alive. */
function runningExport(): number | null {
  const lock = join(OUT, '.export-running');
  if (!existsSync(lock)) return null;
  const pid = Number(readFileSync(lock, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM' ? pid : null;
  }
}

const exporting = runningExport();
const manifestPath = join(OUT, 'manifest.json');
const manifest: Manifest | null = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const present = manifest?.files.filter((f) => existsSync(join(OUT, f.file))) ?? [];

describe.skipIf(!present.length || exporting !== null)(`exported GLBs (${exporting !== null ? `export in progress, pid ${exporting}` : 'run `npm run export-glb` first'})`, () => {
  beforeAll(() => {
    // GLTFLoader decodes embedded PNGs with createImageBitmap, which node lacks. The pixels do not
    // matter here, only that every texture resolves.
    const g = globalThis as { createImageBitmap?: unknown; self?: unknown };
    g.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
    g.self ??= globalThis;
  });

  it('stays inside the Anitya limits', () => {
    const L = manifest!.limits;
    expect(manifest!.totalBytes).toBeLessThanOrEqual(L.storageBytes);
    for (const f of manifest!.files) {
      const world = f.kind === 'world';
      expect(f.bytes, f.file).toBeLessThanOrEqual(world ? L.worldBytes : L.assetBytes);
      expect(f.triangles, f.file).toBeLessThanOrEqual(world ? L.worldTriangles : L.assetTriangles);
      if (world) expect(f.lights, f.file).toBeLessThanOrEqual(L.worldLights);
    }
  });

  it.each(present.map((f) => [f.file, f] as const))('%s loads back through GLTFLoader', async (_name, f) => {
    const buf = readFileSync(join(OUT, f.file));
    expect(buf.length).toBe(f.bytes);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const gltf = await new GLTFLoader().parseAsync(ab, '');
    let meshes = 0, triangles = 0, lights = 0;
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        meshes++;
        triangles += tris((o as THREE.Mesh).geometry);
      }
      if ((o as THREE.Light).isLight) lights++;
    });
    expect(meshes).toBe(f.meshes);
    expect(triangles).toBe(f.triangles);
    expect(lights).toBe(f.lights);
    expect(gltf.animations.length).toBe(f.animations);
    if (f.kind === 'world') {
      const names = new Set<string>();
      gltf.scene.traverse((o) => names.add(o.name));
      expect([...names].some((n) => n === 'sun')).toBe(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      // Centred on x/z; the floor is y = 0 with the diorama plinth (2.2 tiles) below it.
      expect(box.min.y).toBeGreaterThan(-8);
      expect(box.max.y).toBeGreaterThan(2);
      expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(6);
      expect(Math.abs(box.min.z + box.max.z)).toBeLessThan(6);
    }
  });
});
