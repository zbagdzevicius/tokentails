/**
 * Clip compiler (ANIM-SPEC §1, §2): a ClipDef's pose keys become per-bone quaternions and positions through the rig's
 * pose snapshots (PPK poses, IK solved once by Rig.snapshot), packed in Float32Arrays. Once per (rig layout, clip),
 * lazily, so only the heroes in a match pay. Root channels and markers are packed too. Never per frame.
 */
import * as THREE from 'three';
import { BONE_INDEX, BONE_NAMES, type BoneName, type Layout, type Rig } from '../chars/skeleton';
import { EASE_INDEX } from './ease';
import { BONES, MASKS } from './masks';
import { ROOT_CHANNELS, type ClipDef, type Cue, type RootChannel } from './types';

export interface ClipBin {
  def: ClipDef;
  id: string;
  len: number;
  additive: boolean;
  prio: number;
  blendIn: number;
  blendOut: number;
  mask: Float32Array;
  nKeys: number;
  times: Float32Array;
  ease: Uint8Array;
  /** nKeys × BONES × 4 */
  q: Float32Array;
  /** nKeys × BONES × 3 (override only) */
  p: Float32Array;
  /** Per root channel: [t, v, ease] triples, or null. */
  root: (Float32Array | null)[];
  /** Max |v| per root channel (caps, reduce-motion calm). */
  rootMax: Float32Array;
  /** Reduce-motion factor per root channel. */
  calm: Float32Array;
  markerNames: string[];
  /** Float64: a marker at exactly the warped contact time must fire on that frame (Float32 rounds 8/30 up). */
  markerTimes: Float64Array;
  cueTimes: Float64Array;
  cues: readonly Cue[];
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const ROT: ReadonlySet<RootChannel> = new Set(['yaw', 'pitch', 'roll']);

/** Compiled clips per rig layout (layouts are cached and shared, so this is per hero look). */
const bins = new WeakMap<Layout, WeakMap<ClipDef, ClipBin>>();

/** Compile `def` for `rig`. `idle` is the pose a null first key and a hidden weapon fall back to. */
export function compileClip(def: ClipDef, rig: Rig, idle = 'idle'): ClipBin {
  let byLay = bins.get(rig.lay);
  if (!byLay) bins.set(rig.lay, (byLay = new WeakMap()));
  const hit = byLay.get(def);
  if (hit) return hit;
  const bin = build(def, rig, idle);
  byLay.set(def, bin);
  return bin;
}

function build(def: ClipDef, rig: Rig, idle: string): ClipBin {
  const additive = def.mode === 'additive';
  const keys = def.keys.length ? def.keys : [[0, null, null] as const];
  const n = keys.length;
  const times = new Float32Array(n);
  const ease = new Uint8Array(n);
  const q = new Float32Array(n * BONES * 4);
  const p = new Float32Array(additive ? 0 : n * BONES * 3);
  const idleSnap = rig.snapshot(idle);
  let pose = idle;
  for (let k = 0; k < n; k++) {
    const [t, name, deltas, e] = keys[k];
    times[k] = Math.max(0, Math.min(def.len, t));
    ease[k] = EASE_INDEX[e ?? 'inOut'];
    if (name) pose = name;
    const snap = rig.snapshot(pose);
    const hidden = snap.weapon.mode === 'hidden';
    for (let b = 0; b < BONES; b++) {
      if (additive) _q.identity();
      else _q.copy(hidden && b === BONE_INDEX.weapon ? idleSnap.q[b] : snap.q[b]);
      const d = deltas?.[BONE_NAMES[b] as BoneName];
      if (d) _q.multiply(new THREE.Quaternion().setFromEuler(_e.set(d[0], d[1], d[2], 'XYZ')));
      _q.normalize();
      q.set([_q.x, _q.y, _q.z, _q.w], (k * BONES + b) * 4);
      if (!additive) {
        const v = hidden && b === BONE_INDEX.weapon ? idleSnap.p[b] : snap.p[b];
        p.set([v.x, v.y, v.z], (k * BONES + b) * 3);
      }
    }
  }
  // keep each quaternion on the same hemisphere as the previous key, so slerp takes the short way
  for (let k = 1; k < n; k++)
    for (let b = 0; b < BONES; b++) {
      const i = (k * BONES + b) * 4;
      const j = ((k - 1) * BONES + b) * 4;
      if (q[i] * q[j] + q[i + 1] * q[j + 1] + q[i + 2] * q[j + 2] + q[i + 3] * q[j + 3] < 0) for (let c = 0; c < 4; c++) q[i + c] = -q[i + c];
    }
  const root: (Float32Array | null)[] = [];
  const rootMax = new Float32Array(ROOT_CHANNELS.length);
  const calm = new Float32Array(ROOT_CHANNELS.length);
  ROOT_CHANNELS.forEach((ch, c) => {
    const ks = def.root?.[ch];
    if (!ks || ks.length === 0) {
      root.push(null);
      calm[c] = 1;
      return;
    }
    const arr = new Float32Array(ks.length * 3);
    let max = 0;
    ks.forEach(([t, v, e], i) => {
      arr[i * 3] = t;
      arr[i * 3 + 1] = v;
      arr[i * 3 + 2] = EASE_INDEX[e ?? 'inOut'];
      const dev = ch === 'sx' || ch === 'sy' ? Math.abs(v - 1) : Math.abs(v);
      max = Math.max(max, dev);
    });
    root.push(arr);
    rootMax[c] = max;
    const given = def.calm?.[ch];
    calm[c] = given ?? (ROT.has(ch) ? (max > 0.25 ? 0 : 1) : ch === 'up' ? 0.5 : 1);
  });
  const markerNames = Object.keys(def.markers);
  const markerTimes = new Float64Array(markerNames.map((m) => def.markers[m]));
  const cues = def.cues ?? [];
  const cueTimes = new Float64Array(cues.map(([at]) => (typeof at === 'number' ? at : (def.markers[at] ?? 0))));
  return {
    def,
    id: def.id,
    len: Math.max(1e-3, def.len),
    additive,
    prio: def.prio,
    blendIn: def.blendIn ?? 0.05,
    blendOut: def.blendOut ?? 0.12,
    mask: MASKS[def.mask],
    nKeys: n,
    times,
    ease,
    q,
    p,
    root,
    rootMax,
    calm,
    markerNames,
    markerTimes,
    cueTimes,
    cues,
  };
}

/** Root channel index by name. */
export const ROOT_INDEX: Readonly<Record<RootChannel, number>> = Object.freeze(Object.fromEntries(ROOT_CHANNELS.map((c, i) => [c, i])) as Record<RootChannel, number>);
