// Copied from bad-cat/src/render/cat-outline.ts at 4889ed41 (copy, never import; adapted for formula-meow).
/**
 * Cat readability at phone size (GDD 11.1 "readability first"): a dark inverted-hull outline of constant
 * screen width (~2 CSS px) around every fur part, and a cream ring on the surface under the player's cat.
 * The outline shares the fur geometry (no copies) and one material for every cat; the renderer feeds the
 * target size each frame through OUTLINE_UNIFORMS. It runs skinned (the rig is one rigidly skinned mesh) and
 * instanced (spectator cats) through three's own skinning/instancing chunks.
 */
import { BackSide, InstancedMesh, Mesh, ShaderMaterial, SkinnedMesh, Vector2, type Object3D } from 'three';

export const OUTLINE_NAME = 'cat-outline';
/** Outline width in target pixels, and the target size in the same pixels. */
export const OUTLINE_UNIFORMS = { uRes: { value: new Vector2(390, 844) }, uPx: { value: 2 } };

const VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform vec2 uRes;
uniform float uPx;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 mv = vec4(transformed, 1.0);
  vec3 nrm = objectNormal;
  #ifdef USE_INSTANCING
    mv = instanceMatrix * mv;
    nrm = mat3(instanceMatrix) * nrm;
  #endif
  mv = modelViewMatrix * mv;
  vec4 clip = projectionMatrix * mv;
  vec4 cn = projectionMatrix * vec4(normalMatrix * nrm, 0.0);
  vec2 d = cn.xy;
  float l = length(d);
  if (l > 1e-5) d /= l;
  clip.xy += d * (uPx * 2.0 / uRes) * clip.w;
  gl_Position = clip;
}`;
const FS = /* glsl */ `
void main() {
  gl_FragColor = vec4(0.1, 0.06, 0.11, 1.0);
}`;

let shared: ShaderMaterial | null = null;
export function outlineMaterial(): ShaderMaterial {
  if (!shared) {
    shared = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: OUTLINE_UNIFORMS, side: BackSide });
    shared.name = 'cat-outline';
  }
  return shared;
}

/** The outline twin of one fur mesh (skinned, instanced or plain), sharing its geometry. */
export function outlineFor(m: Mesh): Mesh {
  const mat = outlineMaterial();
  let o: Mesh;
  if ((m as SkinnedMesh).isSkinnedMesh) {
    const sm = m as SkinnedMesh;
    const so = new SkinnedMesh(sm.geometry, mat);
    so.bind(sm.skeleton, sm.bindMatrix);
    so.position.copy(sm.position);
    so.quaternion.copy(sm.quaternion);
    so.scale.copy(sm.scale);
    o = so;
  } else if ((m as InstancedMesh).isInstancedMesh) {
    const im = m as InstancedMesh;
    const io = new InstancedMesh(im.geometry, mat, im.count);
    io.instanceMatrix = im.instanceMatrix;
    o = io;
  } else o = new Mesh(m.geometry, mat);
  o.name = OUTLINE_NAME;
  o.castShadow = false;
  o.receiveShadow = false;
  o.frustumCulled = m.frustumCulled;
  return o;
}

/** Adds an outline to every fur mesh under `root` (meshes with the aFur attribute). */
export function addCatOutline(root: Object3D): void {
  const fur: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh && m.name !== OUTLINE_NAME && m.geometry?.getAttribute('aFur') && m.geometry.getAttribute('normal')) fur.push(m);
  });
  for (const m of fur) {
    const o = outlineFor(m);
    // a skinned outline must share the fur mesh's parent (its bind matrix is in that space); others ride the mesh
    if ((m as SkinnedMesh).isSkinnedMesh && m.parent) m.parent.add(o);
    else m.add(o);
  }
}

/** Shows or hides a cat's outline (ghost cats have none). */
export function setCatOutline(root: Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o.name === OUTLINE_NAME) o.visible = on;
  });
}
