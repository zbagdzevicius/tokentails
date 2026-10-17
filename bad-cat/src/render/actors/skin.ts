/**
 * Rigid skinning (GDD 11.2: "one skinned material (cat, human)"): a rig built from rigid parts on pivots is merged
 * into ONE SkinnedMesh whose bones are the pivots, so a cat is one fur draw call (plus its outline and face) and a
 * human is one draw call, instead of one per part. Each vertex follows exactly one bone (weight 1). The pivots stay
 * plain Object3D-compatible Bones, so pose code rotates them as before. Also bakes a posed rig into a static
 * geometry (instanced spectator cats). Pure three.js maths (works in Node).
 */
import { Bone, BufferAttribute, BufferGeometry, Matrix4, Object3D, Skeleton, SkinnedMesh, Vector3, type Material } from 'three';

export interface RigidPart {
  geo: BufferGeometry;
  bone: Bone;
}

const _m = new Matrix4();
const _inv = new Matrix4();
const _v = new Vector3();

/**
 * Merge rigid parts (each geometry in its bone's local space) into one non-indexed geometry in `root` space with
 * skinIndex/skinWeight. Keeps `color`, `aFur` (0 when missing); `withCat` adds `aCat` = the rest position.
 * Call after the hierarchy is assembled (matrices are updated here).
 */
export function mergeRigid(parts: readonly RigidPart[], bones: readonly Bone[], root: Object3D, withCat = false): BufferGeometry {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  let n = 0;
  for (const p of parts) n += p.geo.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const fur = new Float32Array(n);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  let o = 0;
  for (const p of parts) {
    const bi = bones.indexOf(p.bone);
    if (bi < 0) throw new Error('mergeRigid: bone not in the skeleton');
    _m.multiplyMatrices(_inv, p.bone.matrixWorld);
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    const P = g.getAttribute('position');
    const C = g.getAttribute('color');
    const F = g.getAttribute('aFur');
    for (let i = 0; i < P.count; i++, o++) {
      _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(_m);
      pos[o * 3] = _v.x;
      pos[o * 3 + 1] = _v.y;
      pos[o * 3 + 2] = _v.z;
      col[o * 3] = C ? C.getX(i) : 1;
      col[o * 3 + 1] = C ? C.getY(i) : 1;
      col[o * 3 + 2] = C ? C.getZ(i) : 1;
      fur[o] = F ? F.getX(i) : 0;
      si[o * 4] = bi;
      sw[o * 4] = 1;
    }
    if (g !== p.geo) g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('color', new BufferAttribute(col, 3));
  out.setAttribute('aFur', new BufferAttribute(fur, 1));
  if (withCat) out.setAttribute('aCat', new BufferAttribute(pos.slice(), 3));
  out.setAttribute('skinIndex', new BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** SkinnedMesh on `root` bound to `bones` (rest pose = the current pose). */
export function skinnedMesh(geo: BufferGeometry, mat: Material, bones: Bone[], root: Object3D, skeleton?: Skeleton): SkinnedMesh {
  root.updateMatrixWorld(true);
  const mesh = new SkinnedMesh(geo, mat);
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton ?? new Skeleton(bones), mesh.matrixWorld);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * The skinned mesh's current pose as a static geometry in `space` (e.g. the cat root): positions skinned on the
 * CPU, flat normals recomputed; skin attributes dropped, the rest (color, aFur, aCat) kept.
 */
export function bakePosed(mesh: SkinnedMesh, space: Object3D): BufferGeometry {
  space.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const toSpace = new Matrix4().copy(space.matrixWorld).invert().multiply(mesh.matrixWorld);
  const src = mesh.geometry;
  const P = src.getAttribute('position');
  const pos = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    _v.set(P.getX(i), P.getY(i), P.getZ(i));
    mesh.applyBoneTransform(i, _v);
    _v.applyMatrix4(toSpace);
    pos[i * 3] = _v.x;
    pos[i * 3 + 1] = _v.y;
    pos[i * 3 + 2] = _v.z;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  for (const name of ['color', 'aFur', 'aCat']) {
    const a = src.getAttribute(name);
    if (a) out.setAttribute(name, a.clone());
  }
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}
