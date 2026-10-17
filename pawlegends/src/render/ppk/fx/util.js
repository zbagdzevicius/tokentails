// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/fx/util.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/fx/util.js  (owner: fx) — small, allocation-free helpers shared by the fx modules. Pure; node-safe (no DOM, no GL).
//
// Visual positions: fx always draws at the *interpolated* actor transform (`actor.object3d`, written in the actor's
// render() which runs before fx.render), never at the raw sim position, so effects never lag a moving actor.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _box = new THREE.Box3();
const _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion();

/** True if `a` looks like a core Actor (has an object3d and a sim position). */
export const isActor = (a) => !!(a && a.object3d?.isObject3D && a.pos?.isVector3);

/**
 * Resolve an actor reference: an Actor passes through; a string is looked up as a cutscene actor id
 * (`ctx.actors.get`, e.g. 'swordcat', 'pudding'); anything else → null.
 */
export function resolveActor(ctx, ref) {
  if (isActor(ref)) return ref;
  if (typeof ref === 'string') return ctx?.actors?.get?.(ref) ?? (ref === 'player' ? ctx?.player ?? null : null);
  return null;
}

/** World position of an actor's visual root (interpolated), written into `out`. */
export function actorWorldPos(actor, out) {
  const o = actor.object3d;
  if (!o.parent || o.parent.isScene) return out.copy(o.position);
  o.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(o.matrixWorld);
}

/**
 * Write a position-like value into `out`: Vector3, actor (visual position), level anchor `{pos}`,
 * `[x, y, z]`, `[x, z]` (y = 0), `{x, y?, z}` or an Object3D (world position). Returns `out`, or null.
 * @param {any} p @param {THREE.Vector3} out
 */
export function toVec3(p, out) {
  if (p == null) return null;
  if (p.isVector3) return out.copy(p);
  if (isActor(p)) return actorWorldPos(p, out);
  if (p.isObject3D) { p.updateWorldMatrix(true, false); return out.setFromMatrixPosition(p.matrixWorld); }
  if (p.pos && typeof p.pos.x === 'number') return out.set(p.pos.x, p.pos.y ?? 0, p.pos.z ?? 0);
  if (Array.isArray(p) || ArrayBuffer.isView(p)) {
    if (p.length >= 3) return out.set(+p[0] || 0, +p[1] || 0, +p[2] || 0);
    if (p.length === 2) return out.set(+p[0] || 0, 0, +p[1] || 0);
    return null;
  }
  if (typeof p.x === 'number') return out.set(p.x, p.y ?? 0, p.z ?? 0);
  return null;
}

/**
 * Resolve an anchor-ish reference to `{ pos, facing }` written into `outPos`; returns the facing (radians) or null
 * when nothing could be resolved. Accepts actors, actor ids, level anchor names, `{pos, facing}`, vectors, arrays.
 */
export function resolveAnchor(ctx, ref, outPos) {
  if (ref == null) return null;
  if (typeof ref === 'string') {
    const a = ctx?.actors?.get?.(ref);
    if (a) { actorWorldPos(a, outPos); return a.facing ?? 0; }
    const la = ctx?.levels?.anchor?.(ref);
    if (la?.pos) { outPos.copy(la.pos); return la.facing ?? 0; }
    return null;
  }
  if (isActor(ref)) { actorWorldPos(ref, outPos); return ref.facing ?? 0; }
  if (ref.pos && typeof ref.pos.x === 'number') { outPos.set(ref.pos.x, ref.pos.y ?? 0, ref.pos.z ?? 0); return ref.facing ?? 0; }
  if (toVec3(ref, outPos)) return typeof ref.facing === 'number' ? ref.facing : 0;
  return null;
}

/** Ground height at (x, z) via physics (falls back to `fallback`). */
export function groundY(ctx, x, z, fallback = 0) {
  const h = ctx?.physics?.heightAt?.(x, z);
  return Number.isFinite(h) ? h : fallback;
}

/** Parse anything THREE.Color accepts (hex string, number, Color) into `out` (linear working space). */
export function setColor(out, c, fallback = 0xffffff) {
  if (c == null) return out.set(fallback);
  if (c.isColor) return out.copy(c);
  try { return out.set(c); } catch { return out.set(fallback); }
}

/** Deterministic hash → [0, 1) for an integer (used for per-instance variety without an rng stream). */
export function hash01(n) {
  let x = (n | 0) + 0x9E3779B9;
  x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B);
  x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** True when `o` and all its ancestors are visible (a hidden / sheathed sword has no trail). */
export function isShown(o) {
  for (let x = o; x; x = x.parent) if (x.visible === false) return false;
  return true;
}

/**
 * The object that renders an actor's own holy aura (fur rim, aura hull, blade emissive + streak), i.e. the first of
 * `actor`, `actor.model.k` (player SwordcatModel → buildKitten rig), `actor.visual.k` / `actor.visual` (companions'
 * KittenVisual), `actor.k`, `actor.kitten` that has a `setHoly(v)` method; null when the actor has none (GLB actors,
 * the M0 placeholder) and fx must draw its fallback halo + streak.
 */
export function auraOwner(actor) {
  if (!actor) return null;
  if (typeof actor.setHoly === 'function') return actor;
  const c = [actor.model?.k, actor.visual?.k, actor.visual, actor.k, actor.kitten];
  for (const o of c) if (o && typeof o.setHoly === 'function') return o;
  return null;
}

// ------------------------------------------------------------------ blade (sword) lookup
const _bladeCache = new WeakMap();

/**
 * Measure a held blade once: in `holder` space (origin = grip pivot), find the long axis of the model's bounding box
 * and return the far end (tip) and a point ~18% along it from the grip (the hilt end of the swing ribbon).
 * @param {THREE.Object3D} holder
 */
function measureHolder(holder) {
  let m = _bladeCache.get(holder);
  if (m !== undefined) return m;
  holder.updateWorldMatrix(true, true);
  _inv.copy(holder.matrixWorld).invert();
  _box.makeEmpty();
  holder.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.boundingBox ?? o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb || bb.isEmpty()) return;
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(o.matrixWorld).applyMatrix4(_inv);
      _box.expandByPoint(_v);
    }
  });
  if (_box.isEmpty()) { _bladeCache.set(holder, null); return null; }
  const size = _box.getSize(_w);
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  // the tip is the end farther from the grip pivot (holder origin)
  const lo = _box.min[axis], hi = _box.max[axis];
  const tipSign = Math.abs(hi) >= Math.abs(lo) ? 1 : -1;
  const tip = new THREE.Vector3(), hilt = new THREE.Vector3();
  _box.getCenter(tip); hilt.copy(tip);
  tip[axis] = tipSign > 0 ? hi : lo;
  const base = tipSign > 0 ? Math.max(lo, 0) : Math.min(hi, 0);
  hilt[axis] = base + (tip[axis] - base) * 0.18;
  m = { tip, hilt, length: Math.abs(tip[axis] - base) };
  _bladeCache.set(holder, m);
  return m;
}

/**
 * Find the world-space hilt and tip of an actor's blade (for the sword trail and the holy streak). Duck-typed:
 *  1. `actor.trailSegment(outHilt, outTip)` → true                       (explicit hook)
 *  2. a characters sword `{ tip, grip }` on `actor.sword | kitten.sword | model.sword | k.sword | visual.sword`
 *  3. `actor.swordHold` (an Object3D whose origin is the grip; the M0 placeholder)
 *  4. `actor.sword.root` / `actor.weapon` model roots (measured once by bounding box)
 * Returns false if nothing usable was found.
 * @param {any} actor @param {THREE.Vector3} outHilt @param {THREE.Vector3} outTip
 */
export function resolveBlade(actor, outHilt, outTip) {
  if (!actor) return false;
  if (typeof actor.trailSegment === 'function') return !!actor.trailSegment(outHilt, outTip);
  const s = actor.sword ?? actor.model?.k?.sword ?? actor.visual?.k?.sword ?? actor.kitten?.sword ?? actor.model?.sword
    ?? actor.k?.sword ?? actor.visual?.sword ?? null;
  if (s?.tip?.isObject3D) {
    if (!isShown(s.tip)) return false;
    s.tip.updateWorldMatrix(true, false);
    outTip.setFromMatrixPosition(s.tip.matrixWorld);
    const g = s.grip ?? s.group ?? s.mid;
    if (g?.isObject3D) { g.updateWorldMatrix(true, false); outHilt.setFromMatrixPosition(g.matrixWorld).lerp(outTip, 0.3); }
    else outHilt.copy(outTip);
    return true;
  }
  const holder = actor.swordHold?.isObject3D ? actor.swordHold
    : s?.root?.isObject3D ? (s.root.parent ?? s.root)
    : actor.weapon?.isObject3D ? actor.weapon : actor.weapon?.root?.isObject3D ? actor.weapon.root : null;
  if (!holder) return false;
  const m = measureHolder(holder);
  if (!m) return false;
  holder.updateWorldMatrix(true, false);
  outTip.copy(m.tip).applyMatrix4(holder.matrixWorld);
  outHilt.copy(m.hilt).applyMatrix4(holder.matrixWorld);
  return true;
}

/**
 * An actor's weapon point for glints (telegraphs): `telegraphAnchor | weaponTip | weapon.tip` Object3Ds when present,
 * else the blade tip (resolveBlade), else a point at 70% height in front of its right shoulder.
 * @param {any} actor @param {THREE.Vector3} out
 */
export function weaponPoint(actor, out) {
  const o = actor.telegraphAnchor ?? actor.weaponTip ?? actor.weapon?.tip ?? null;
  if (o?.isObject3D) { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); }
  if (resolveBlade(actor, _w, out)) return out;
  actorWorldPos(actor, out);
  const f = actor.object3d?.rotation?.y ?? actor.facing ?? 0, h = actor.height ?? 1, r = actor.radius ?? 0.35;
  // in front (+Z) and to the actor's right (−X when facing +Z)
  out.x += Math.sin(f) * (r + 0.15) - Math.cos(f) * r * 0.8;
  out.z += Math.cos(f) * (r + 0.15) + Math.sin(f) * r * 0.8;
  out.y += h * 0.7;
  return out;
}

/** Point above an actor's head (for "!" marks, dizzy stars): `headPoint(actor, out, lift)`. */
export function headPoint(actor, out, lift = 0.3) {
  const head = actor.headAnchor;
  if (head?.isObject3D) { head.updateWorldMatrix(true, false); out.setFromMatrixPosition(head.matrixWorld); out.y += lift; return out; }
  actorWorldPos(actor, out);
  out.y += (actor.height ?? 1) * (actor.object3d?.scale?.y ?? 1) + lift;
  return out;
}

/** World quaternion of an actor's visual (for local-frame effects). */
export function actorWorldQuat(actor, out = _q) { actor.object3d.getWorldQuaternion(out); return out; }

/** Envelope: 0 → 1 → 0 over `dur`, peaking at `peakAt` (fraction), smooth. */
export function spikeEnvelope(t, dur, peakAt = 0.25) {
  if (!(dur > 0) || t <= 0 || t >= dur) return 0;
  const u = t / dur;
  if (u < peakAt) { const k = u / peakAt; return k * k * (3 - 2 * k); }
  const k = (u - peakAt) / (1 - peakAt);
  return 1 - k * k * (3 - 2 * k);
}

/** Frame dt for visuals: 0 while hitstop / the pause menu, scaled by slow motion. */
export function visualDt(ctx, frameDt) {
  const g = ctx?.game;
  if (!g) return frameDt;
  if (g.mode === 'menu' || g.hitstopT > 0) return 0;
  return frameDt * (g.loop?.timeScale ?? 1);
}
