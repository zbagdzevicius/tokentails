/**
 * Draw-call and triangle estimates for a scene graph (GDD 11.2: <= 80 draw calls, <= 60k triangles on screen).
 * One draw call per Mesh / InstancedMesh / Sprite / Points / Line (multi-material meshes count each group);
 * triangles of an InstancedMesh count once per instance.
 */
import type { BufferGeometry, InstancedMesh, Mesh, Object3D } from 'three';

function isDrawable(o: Object3D): boolean {
  const a = o as unknown as Record<string, boolean>;
  return !!(a.isMesh || a.isSprite || a.isPoints || a.isLine);
}

/** Draw calls of the visible objects (what the renderer submits this frame). `all` counts hidden ones too. */
export function countDrawCalls(root: Object3D, all = false): number {
  let n = 0;
  const visit = (o: Object3D) => {
    if (!isDrawable(o)) return;
    const m = (o as Mesh).material;
    n += Array.isArray(m) ? Math.max(1, m.length) : 1;
  };
  if (all) root.traverse(visit);
  else root.traverseVisible(visit);
  return n;
}

function geoTris(g: BufferGeometry | undefined): number {
  if (!g) return 0;
  if (g.index) return g.index.count / 3;
  const p = g.getAttribute('position');
  return p ? p.count / 3 : 0;
}

/** Triangles of the visible objects (`all` counts hidden ones too). Zero-scaled instances still count. */
export function countTriangles(root: Object3D, all = false): number {
  let n = 0;
  root[all ? 'traverse' : 'traverseVisible']((o) => {
    const a = o as unknown as Record<string, boolean>;
    if (a.isSprite) n += 2;
    else if (a.isMesh) n += geoTris((o as Mesh).geometry) * (a.isInstancedMesh ? (o as InstancedMesh).count : 1);
  });
  return n;
}
