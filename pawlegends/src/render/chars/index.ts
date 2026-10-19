/**
 * Upright PPK-style characters (render only): cached geometry per hero / team / look / detail, live instances with
 * their own skeleton and animator, baked minion geometry for the instanced part shader, Companion Kittens.
 *
 * An instance is `object` (place it, set `rotation.y` to the snapshot yaw: models face +X like every other view) →
 * `inner` (turns PPK's +Z-forward character to +X and scales H to metres) → the rig root (bones) + one skinned mesh
 * (+ an optional outline hull sharing the skeleton).
 */
import * as THREE from 'three';
import type { HeroId } from '../../sim/api';
import { DEFAULT_LOOK, lookKey, type Coat, type Look } from '../cosmetics';
import { buildChibi } from './chibi';
import { charMaterial, outlineMaterial, type CharMaterial } from './charMaterial';
import { Animator } from './motion';
import { BONE_INDEX, Rig, type BoneName, type Layout } from './skeleton';
import { HERO_HEIGHT, HERO_MOTION, KITTEN_POSE, POSES_PL, heroSpec, kittenSpec, minionSpec, type HeroCtx, type MotionProfile } from './specs';
import type { CoatSpec } from './chibi';
import { PPK_POSES } from './skeleton';

export { HERO_HEIGHT, HERO_MOTION, HERO_TOP } from './specs';
export type { CharState, MotionInput } from './motion';

const POSES = { ...PPK_POSES, ...POSES_PL };

interface Built {
  geometry: THREE.BufferGeometry;
  lay: Layout;
}

interface Cached extends Built {
  key: string;
  refs: number;
}

/**
 * Hero geometry by hero / team / look / detail / context, shared by live characters, the lobby and the portraits.
 * A reference-counted LRU (card skins: up to 24 cats × 8 champions): at most HERO_CACHE_MAX entries; the least
 * recently used entry with no live character is disposed when a new one is built. An entry in use is never evicted.
 */
export const HERO_CACHE_MAX = 32;
const heroCache = new Map<string, Cached>();
const owner = new WeakMap<THREE.BufferGeometry, Cached>();

function evict(): void {
  if (heroCache.size <= HERO_CACHE_MAX) return;
  for (const [k, c] of heroCache) {
    if (heroCache.size <= HERO_CACHE_MAX) break;
    if (c.refs > 0) continue;
    heroCache.delete(k);
    c.geometry.dispose();
  }
}

/** Tests: entries, and how many are in use. */
export const heroCacheStats = (): { size: number; inUse: number } => ({ size: heroCache.size, inUse: [...heroCache.values()].filter((c) => c.refs > 0).length });

/** Mesh detail per quality tier (segment scale). */
export const DETAIL = Object.freeze({ low: 0.62, med: 1, high: 1, lobby: 1.5 });

/** The cached hero geometry (indexed, skinned) for a team, look and detail. */
export function heroBuilt(hero: HeroId, team: 0 | 1, look: Look | null = DEFAULT_LOOK, detail = 1, ctx: HeroCtx = {}): Built {
  const k = `${hero}:${team}:${lookKey(look)}:${detail}${ctx.match ? (ctx.self ? ':ms' : ':m') : ''}`;
  let b = heroCache.get(k);
  if (b) {
    // most recently used last
    heroCache.delete(k);
    heroCache.set(k, b);
    return b;
  }
  const built = buildChibi(heroSpec(hero, team, look ?? DEFAULT_LOOK, detail, ctx));
  b = { ...built, key: k, refs: 0 };
  owner.set(b.geometry, b);
  heroCache.set(k, b);
  evict();
  return b;
}

export interface Character {
  object: THREE.Group;
  inner: THREE.Group;
  mesh: THREE.SkinnedMesh;
  outline: THREE.SkinnedMesh | null;
  material: CharMaterial;
  rig: Rig;
  anim: Animator;
  height: number;
  dispose(): void;
}

/** A live character on shared geometry: its own bones, animator and material. */
export function makeCharacter(built: Built, profile: MotionProfile, height: number, o: { outline?: boolean; shadows?: boolean; name?: string } = {}): Character {
  const cached = owner.get(built.geometry);
  if (cached) cached.refs++;
  let released = false;
  const rig = new Rig(built.lay, POSES);
  const material = charMaterial();
  const mesh = new THREE.SkinnedMesh(built.geometry, material);
  mesh.name = o.name ?? 'char';
  mesh.frustumCulled = false;
  mesh.castShadow = o.shadows ?? true;
  rig.root.add(mesh);
  mesh.bind(rig.skeleton, new THREE.Matrix4());
  let outline: THREE.SkinnedMesh | null = null;
  const oMat = o.outline ? outlineMaterial() : null;
  if (oMat) {
    outline = new THREE.SkinnedMesh(built.geometry, oMat);
    outline.name = `${mesh.name}-outline`;
    outline.frustumCulled = false;
    outline.castShadow = false;
    rig.root.add(outline);
    outline.bind(rig.skeleton, new THREE.Matrix4());
  }
  const inner = new THREE.Group();
  inner.rotation.y = Math.PI / 2;
  inner.scale.setScalar(height);
  inner.add(rig.root);
  const object = new THREE.Group();
  object.add(inner);
  const anim = new Animator(rig, profile);
  return {
    object,
    inner,
    mesh,
    outline,
    material,
    rig,
    anim,
    height,
    dispose() {
      material.dispose();
      oMat?.dispose();
      rig.skeleton.dispose();
      if (cached && !released) {
        released = true;
        cached.refs = Math.max(0, cached.refs - 1);
        evict();
      }
    },
  };
}

export function makeHero(hero: HeroId, team: 0 | 1, look: Look | null, o: { detail?: number; outline?: boolean; shadows?: boolean; match?: boolean; self?: boolean } = {}): Character {
  const c = makeCharacter(heroBuilt(hero, team, look, o.detail ?? 1, { match: o.match === true, self: o.self === true }), HERO_MOTION[hero], HERO_HEIGHT[hero], { ...o, name: `hero-${hero}` });
  // settle the idle pose before the first frame (portraits, lobby)
  c.anim.update(1, { state: 'idle', speed: 0, height: c.height, yawRate: 0 });
  return c;
}

// ------------------------------------------------------------------------------------------------ kittens

export const KITTEN_HEIGHT = 0.95;
const KITTEN_MOTION: MotionProfile = { idle: KITTEN_POSE.idle, run: KITTEN_POSE.run, cast: 'cheer', attack: 'paw', stride: 1.4 };

/** `full`: a card skin's coat (GDD §7.2: the kitten matches the champion wearing the same cat). */
export function makeKitten(coat: Coat, collar: number, tabby = false, full?: CoatSpec): Character {
  const built = buildChibi(kittenSpec(coat, collar, tabby, full));
  const c = makeCharacter(built, KITTEN_MOTION, KITTEN_HEIGHT, { name: 'kitten', shadows: false });
  const dispose = c.dispose;
  c.dispose = () => {
    dispose();
    built.geometry.dispose();
  };
  return c;
}

// ------------------------------------------------------------------------------------------------ minions

/** Part ids of the upright instanced part shader (views/rig.ts `uprightMaterial`). */
export const UPRIGHT_PART = Object.freeze({ Body: 0, Head: 1, ArmL: 2, ArmR: 3, LegL: 4, LegR: 5, Tail: 6 });

const PART_OF: Partial<Record<BoneName, number>> = {
  head: 1, mouth: 1, earL: 1, earR: 1, eyeL: 1, eyeR: 1,
  shoulderL: 2, elbowL: 2, pawL: 2,
  shoulderR: 3, elbowR: 3, pawR: 3, weapon: 3,
  thighL: 4, kneeL: 4, footL: 4,
  thighR: 5, kneeR: 5, footR: 5,
  tail0: 6, tail1: 6, tail2: 6, tail3: 6, tail4: 6, tail5: 6,
};
const PIVOT_BONE: BoneName[] = ['body', 'head', 'shoulderL', 'shoulderR', 'thighL', 'thighR', 'tail0'];

/**
 * An upright minion (kitten squire or pup guard) as unskinned geometry for an InstancedMesh: built with the chibi
 * builder, posed in `stand` on the CPU, each vertex tagged with its body part and the part's joint (aPart, aPivot),
 * turned to face +X. Units H (the instance scale sets the height).
 */
export function uprightMinionGeometry(team: 0 | 1, ranged: boolean): THREE.BufferGeometry {
  const { geometry: g, lay } = buildChibi(minionSpec(team, ranged));
  const rig = new Rig(lay, POSES);
  const snap = rig.snapshot('stand');
  rig.bones.forEach((b, i) => {
    b.quaternion.copy(snap.q[i]);
    b.position.copy(snap.p[i]);
  });
  rig.root.updateMatrixWorld(true);
  const skin = rig.bones.map((b, i) => b.matrixWorld.clone().multiply(rig.skeleton.boneInverses[i]));
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const si = g.getAttribute('skinIndex');
  const n = pos.count;
  const part = new Float32Array(n);
  const piv = new Float32Array(n * 3);
  const pivots = PIVOT_BONE.map((b) => new THREE.Vector3().setFromMatrixPosition(rig.bones[BONE_INDEX[b]].matrixWorld));
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
  for (const p of pivots) p.applyMatrix4(turn);
  for (let i = 0; i < n; i++) {
    const bi = si.getX(i);
    const m = skin[bi];
    v.fromBufferAttribute(pos, i).applyMatrix4(m).applyMatrix4(turn);
    pos.setXYZ(i, v.x, v.y, v.z);
    nm.getNormalMatrix(m);
    v.fromBufferAttribute(nrm, i).applyMatrix3(nm).applyMatrix4(turn).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
    const pt = PART_OF[rig.bones[bi].name as BoneName] ?? 0;
    part[i] = pt;
    piv[i * 3] = pivots[pt].x;
    piv[i * 3 + 1] = pivots[pt].y;
    piv[i * 3 + 2] = pivots[pt].z;
  }
  g.deleteAttribute('skinIndex');
  g.deleteAttribute('skinWeight');
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  g.computeBoundingSphere();
  rig.skeleton.dispose();
  return g;
}

export type { Layout };
