/**
 * Afterimages (ANIM-SPEC §7): a ghost is a SkinnedMesh on the hero's shared geometry with a FROZEN skeleton (its bone
 * matrices copied from the source at spawn, `update()` a no-op) and the source mesh's world matrix. One unlit additive
 * fresnel program, alpha 0.35 → 0 over 180 ms, no outline, drawn below the telegraphs. Enemy ghosts take a
 * low-saturation relation tint. Pool: Low 0, Med 4 (dashes, ults), High 8; none under reduce motion. Spawning copies
 * into preallocated arrays; nothing is created per frame (a pool slot's skeleton grows once if a rig needs more bones).
 */
import * as THREE from 'three';

export const GHOST_TIER = Object.freeze({ low: 0, med: 4, high: 8 });
export const GHOST_LIFE = 0.18;
const GHOST_ALPHA = 0.35;
const MAX = 8;

const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying float vF;
void main() {
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * objectNormal);
  vF = 1.0 - abs(dot(n, normalize(cameraPosition - w.xyz)));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vF;
void main() {
  float a = uAlpha * (0.35 + 0.65 * vF * vF);
  gl_FragColor = vec4(uColor * a * 1.5, a);
}`;

interface Ghost {
  mesh: THREE.SkinnedMesh | null;
  mat: THREE.ShaderMaterial;
  age: number;
  bones: number;
}

const _c = new THREE.Color();

export class Ghosts {
  readonly group = new THREE.Group();
  private readonly pool: Ghost[] = [];
  private cap: number = GHOST_TIER.med;
  private reduced = false;

  constructor() {
    this.group.name = 'ghosts';
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
      });
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
      this.pool.push({ mesh: null, mat, age: 1, bones: 0 });
    }
  }

  setTier(tier: 'low' | 'med' | 'high', reduced: boolean): void {
    this.cap = GHOST_TIER[tier];
    this.reduced = reduced;
  }

  /** Spawn an afterimage of `src` (a character's skinned mesh) tinted `color`. Returns false when none is free. */
  spawn(src: THREE.SkinnedMesh, color: number): boolean {
    if (this.reduced || this.cap <= 0) return false;
    let g: Ghost | null = null;
    for (let i = 0; i < this.cap; i++) if (this.pool[i].age >= GHOST_LIFE) (g = this.pool[i]), (i = this.cap);
    if (!g) return false;
    const sk = src.skeleton;
    const nb = sk.bones.length;
    if (!g.mesh || g.mesh.geometry !== src.geometry || g.bones !== nb) {
      if (g.mesh) {
        this.group.remove(g.mesh);
        g.mesh.skeleton.dispose();
      }
      // a frozen skeleton: its own bones (never moved) and matrices we copy into; update() does nothing
      const bones: THREE.Bone[] = [];
      for (let b = 0; b < nb; b++) bones.push(new THREE.Bone());
      const frozen = new THREE.Skeleton(bones, sk.boneInverses);
      frozen.update = () => {};
      const m = new THREE.SkinnedMesh(src.geometry, g.mat);
      m.bind(frozen, src.bindMatrix);
      m.matrixAutoUpdate = false;
      m.frustumCulled = false;
      m.renderOrder = 2;
      m.name = 'ghost';
      g.mesh = m;
      g.bones = nb;
      this.group.add(m);
    }
    const m = g.mesh;
    src.updateWorldMatrix(true, false);
    sk.update();
    // the bone texture pads its matrices to a square: compute it first, then copy what both arrays hold
    if (!m.skeleton.boneTexture) m.skeleton.computeBoneTexture();
    const bm = m.skeleton.boneMatrices;
    const sm = sk.boneMatrices;
    if (bm && sm) for (let i = 0, n = Math.min(bm.length, sm.length, nb * 16); i < n; i++) bm[i] = sm[i];
    (m.skeleton.boneTexture as THREE.DataTexture).needsUpdate = true;
    m.bindMatrix.copy(src.bindMatrix);
    m.bindMatrixInverse.copy(src.bindMatrixInverse);
    m.matrix.copy(src.matrixWorld);
    m.matrixWorld.copy(src.matrixWorld);
    _c.setHex(color);
    (g.mat.uniforms.uColor.value as THREE.Color).copy(_c);
    g.mat.uniforms.uAlpha.value = GHOST_ALPHA;
    m.visible = true;
    g.age = 0;
    return true;
  }

  update(dt: number): void {
    for (const g of this.pool) {
      if (!g.mesh || g.age >= GHOST_LIFE) continue;
      g.age += dt;
      const k = Math.max(0, 1 - g.age / GHOST_LIFE);
      g.mat.uniforms.uAlpha.value = GHOST_ALPHA * k;
      if (k <= 0) g.mesh.visible = false;
    }
  }

  live(): number {
    let n = 0;
    for (const g of this.pool) if (g.mesh && g.age < GHOST_LIFE) n++;
    return n;
  }

  get poolSize(): number {
    return this.pool.length;
  }

  dispose(): void {
    for (const g of this.pool) {
      g.mat.dispose();
      g.mesh?.skeleton.dispose();
    }
  }
}
