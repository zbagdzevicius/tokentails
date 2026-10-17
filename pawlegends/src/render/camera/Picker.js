// Lifted from Pink Paw Knight (swordcat) at commit 7714dcb: src/camera/Picker.js
// Licence: all rights reserved, pending founder decision (POC.md §17, GDD §12 decision #3). Not MIT.
// Changes: relative imports rewritten by tools/lift-ppk.mjs; any later hand edit is marked "pawlegends:".
// src/camera/Picker.js  (owner: camera) — research/CONTROLS_SPEC.md §7.6 picking for the iso controls.
//   screenToGround(ctx, x, y, out)   CSS px → the walkable ground point under the pointer (terrain + architecture),
//                                    falling back to the horizontal plane at her feet
//   pickAt(ctx, x, y, opts, out)     CSS px → { kind: 'enemy'|'breakable'|'interact'|'npc'|'pickup'|'ground', actor?, id?,
//                                    interact?, point, px } — enemy > breakable > interact / npc > pickup > ground;
//                                    ties → nearest on screen, then nearest to her
// An actor is hit when its projected capsule axis (feet → head) is within max(AIM.pick.px, projected radius +
// AIM.pick.pad) CSS px of the pointer (touch: AIM.pick.touchPx × touchSize). Interactables use a ≥ AIM.pick.interactR m
// pick radius around their spot (Vigil Stones / hub stations: ≤ PROP_PICK_R m at the ground, and a Vigil Stone beyond
// the base px only when the ray hits the stone itself). Crows are also picked at their shadow on the ground.
import * as THREE from 'three';
import { AIM } from '../ppk/core/config.js';
import { reachableIslands } from '../ppk/stubs/physics/Pathfind.js';

const _ndc = new THREE.Vector2(), _ray = new THREE.Raycaster(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _p = new THREE.Vector3(), _plane = new THREE.Plane(), _UP = new THREE.Vector3(0, 1, 0);
const GROUND_OPTS = Object.freeze({ terrain: true, mesh: true, statics: false, tops: true });   // + walkable prop tops (ledges, crates, stumps, caps)
/** The ground ray once it has given up on prop tops (too many too-tall tops in a row). */
const GROUND_NO_TOPS = Object.freeze({ terrain: true, mesh: true, statics: false, tops: false });
/** A prop top higher than this above BOTH the terrain under it and her feet is not a click target (a tall hay stack /
 *  tower the lens looks over, usually faded as an occluder): the click goes through it to the surface below. Root
 *  ledges are 1.5 m. Measuring against her feet too keeps the next stair flight / landing pickable as she climbs. */
const MAX_TOP = 2.8;
/** Authored architecture whose top is always a click target, however high (stair steps, the loft ledge). */
const isWalkTop = (src) => !!src && (src.walkTop === true || src.ledge === true || src.step != null || src.landing === true);
const _ray2 = new THREE.Ray();
/** Max tall tops the ground ray passes through before it gives up on tops (the Bell Tower's box, then a flight). */
const MAX_SKIPS = 4;
const RANK = { enemy: 0, breakable: 1, interact: 2, npc: 2, pickup: 3, ground: 9 };
/** Vigil Stones and hub stations: their pick radius (m, measured on the ground at the spot), and the stone's pick axis
 *  height (m: a click on the obelisk, not only at its foot). A bigger radius turned walking past one into a 'use'. */
const PROP_PICK_R = 0.8, VIGIL_AXIS_H = 1.7;
/** a Vigil Stone click beyond the base px must hit a collider within this (m, horizontal) of the stone */
const VIGIL_HIT_R = 0.9;
const PROP_RAY = Object.freeze({ terrain: true, mesh: true, statics: true });
const NO_OPTS = Object.freeze({});
const _list = [];

/** The canvas rect cache (PERF §4.5: no layout read per pick). Re-read only after a ResizeObserver / window resize /
 *  scroll / visualViewport event, or every RECT_TTL calls as a safety net (a layout shift no event reports). Without
 *  ResizeObserver (node tests) every call reads the element. */
const RECT_TTL = 120;
const _rc = { el: null, rect: null, dirty: true, n: 0, ro: null };
const _markDirty = () => { _rc.dirty = true; };
function watchRect(el) {
  if (_rc.ro) _rc.ro.disconnect();
  _rc.ro = new ResizeObserver(_markDirty);
  _rc.ro.observe(el);
  if (_rc.el === null && typeof addEventListener === 'function') {          // once per page (the listeners are global)
    addEventListener('resize', _markDirty, { passive: true });
    addEventListener('scroll', _markDirty, { passive: true, capture: true });
    addEventListener('orientationchange', _markDirty, { passive: true });
    if (typeof visualViewport !== 'undefined' && visualViewport) visualViewport.addEventListener('resize', _markDirty, { passive: true });
  }
  _rc.el = el;
}

/** The canvas rect (CSS px), cached (see _rc): callers projecting many points read it once and pass it on
 *  (worldToScreen / toNdc / screenToGround take an optional `rect`). Read-only: never mutate the result. */
export function canvasRect(ctx) {
  const el = ctx.renderer?.domElement;
  if (el?.getBoundingClientRect) {
    if (typeof ResizeObserver === 'undefined') {
      const r = el.getBoundingClientRect();
      if (r && r.width > 0) return r;
    } else {
      if (el !== _rc.el) { watchRect(el); _rc.dirty = true; }
      if (_rc.dirty || ++_rc.n >= RECT_TTL || !_rc.rect) {
        const r = el.getBoundingClientRect();
        _rc.n = 0;
        if (r && r.width > 0) { _rc.rect = r; _rc.dirty = false; } else _rc.rect = null;
      }
      if (_rc.rect) return _rc.rect;
    }
  }
  const w = typeof innerWidth !== 'undefined' ? innerWidth : 1280, h = typeof innerHeight !== 'undefined' ? innerHeight : 720;
  return { left: 0, top: 0, width: w, height: h };
}

/** Invalidate the cached canvas rect (a caller that moved / resized the canvas itself). */
export function invalidateCanvasRect() { _rc.dirty = true; }

/** CSS px → NDC (writes `out` Vector2). */
export function toNdc(ctx, x, y, out = _ndc, r = canvasRect(ctx)) {
  return out.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
}

/**
 * World point → CSS px `out` {x, y, z: ndc depth, on: inside the frustum}. Uses the camera as rendered last frame.
 * `r`: the canvas rect when the caller already has it (one layout read per pick, not per point).
 * @param {any} ctx @param {{x:number,y:number,z:number}} p @param {{x:number,y:number,z?:number,on?:boolean}} out
 * @param {{left:number,top:number,width:number,height:number}} [r]
 */
export function worldToScreen(ctx, p, out = { x: 0, y: 0, z: 0, on: false }, r = canvasRect(ctx)) {
  const cam = ctx.camera;
  _p.set(p.x, p.y, p.z).project(cam);
  out.x = r.left + (_p.x + 1) * 0.5 * r.width;
  out.y = r.top + (1 - _p.y) * 0.5 * r.height;
  out.z = _p.z;
  out.on = _p.z > -1 && _p.z < 1 && Math.abs(_p.x) <= 1 && Math.abs(_p.y) <= 1;
  return out;
}

/** Rays never reach past this (m) — the far plane caps it first in practice. */
const RAY_MAX = 400;
const _fwd = new THREE.Vector3();
/**
 * The longest useful pick ray (m) along `dir` from the camera: to the far plane (AUTOCAM §9.3 / PERF §4.5 — nothing
 * beyond it is drawn, so nothing beyond it is a click target), never more than RAY_MAX. The iso far plane is ~55-60 m,
 * so the heightfield DDA walks ≤ ~ far / cell cells and the mesh / prop-top queries stay inside that span.
 */
export function rayLimit(cam, dir) {
  const far = cam?.far;
  if (!(far > 0) || !Number.isFinite(far) || !cam.matrixWorld) return RAY_MAX;
  const e = cam.matrixWorld.elements;
  _fwd.set(-e[8], -e[9], -e[10]);
  const c = _fwd.dot(dir) / (_fwd.length() || 1);
  return c > 1e-3 ? Math.min(RAY_MAX, far / c) : RAY_MAX;
}

/**
 * The ground under CSS px (x, y): terrain + architecture (bridge decks, ledges, stairs, roofs) by raycast, else the
 * horizontal plane through her feet. Returns `out` (Vector3) or null when the ray never meets the ground. The ray is
 * capped at the far plane (rayLimit); terrain is the heightfield's DDA, and the mesh / prop-top tests only search up to
 * the terrain hit (Physics._ray narrows `best`).
 */
export function screenToGround(ctx, x, y, out = new THREE.Vector3(), rect = canvasRect(ctx)) {
  const cam = ctx.camera;
  if (!cam) return null;
  cam.updateMatrixWorld();
  _ray.setFromCamera(toNdc(ctx, x, y, _ndc, rect), cam);
  const ph = ctx.physics;
  const her = ctx.player?.pos ?? null, fy = her?.y ?? 0;
  const lim = rayLimit(cam, _ray.ray.direction);
  let hit = ph?.raycast?.(_ray.ray, lim, GROUND_OPTS);
  // a too-tall top: continue the ray just past it (a reachable top — the next flight — may lie behind / under it)
  _ray2.copy(_ray.ray);
  let left = lim, done = 0;
  for (let n = 0; hit?.kind === 'static' && !topOk(ph, hit, fy, her); n++) {
    done += hit.distance + 0.02;
    left = lim - done;
    if (n >= MAX_SKIPS || left <= 0) { hit = ph.raycast(_ray.ray, lim, GROUND_NO_TOPS); break; }
    _ray2.origin.copy(hit.point).addScaledVector(_ray2.direction, 0.02);
    hit = ph.raycast(_ray2, left, GROUND_OPTS);
  }
  if (hit) return out.copy(hit.point);
  _plane.set(_UP, -fy);
  return _ray.ray.intersectPlane(_plane, out);
}

/**
 * Is this prop-top hit a fair click target? Authored architecture (walkTop / step / ledge / landing), a top within
 * MAX_TOP of the terrain or of her feet, or a top the nav grid connects to the rest of the level (a stair landing, a
 * balcony deck she reaches by hops from crates).
 */
function topOk(ph, hit, fy, her) {
  if (isWalkTop(hit.object)) return true;
  const y = hit.point.y;
  if (y - (ph.heightAt?.(hit.point.x, hit.point.z) ?? y) <= MAX_TOP || y - fy <= MAX_TOP) return true;
  return navConnected(ph.nav, hit.point.x, hit.point.z, y, her);
}

/**
 * The walkable nav cell of the top at (x, z, y): its own cell, else the nearest one within TOP_SNAP cells at that
 * height (a click on a deck's rim, which the agent radius keeps off the nav). -1 when none.
 */
const TOP_SNAP = 2;
function topCell(nav, x, z, y) {
  const k = nav.index(x, z);
  if (k < 0) return -1;
  const ok = (c) => nav.walkable(c) && Math.abs(nav.h[c] - y) <= 0.35;
  if (ok(k)) return k;
  const i0 = k % nav.nx, j0 = (k / nav.nx) | 0;
  let best = -1, bd = Infinity;
  for (let dj = -TOP_SNAP; dj <= TOP_SNAP; dj++) for (let di = -TOP_SNAP; di <= TOP_SNAP; di++) {
    const i = i0 + di, j = j0 + dj, d = di * di + dj * dj;
    if (i < 0 || j < 0 || i >= nav.nx || j >= nav.nz || d >= bd) continue;
    const c = i + j * nav.nx;
    if (ok(c)) { best = c; bd = d; }
  }
  return best;
}

/** Nav cells a plateau search visits before it calls the top isolated (a 10 × 10 m roof). */
const PLATEAU_MAX = 400;
const _seen = new Set(), _queue = [];
let _ncNav = null, _ncVer = -1, _ncLinks = -1, _ncCell = -1, _ncOk = false;
/**
 * Does the walkable top at (x, z, y) lead somewhere? First the island audit (Pathfind.reachableIslands, once built): her
 * island reaches the top's island by walking, automatic jump links (hop / drop / gap / fence) or authored links (a
 * balcony deck reached by hops from crates). Else a nav step (or an authored link) from its plateau down to lower
 * ground. A free-standing hay stack or tower top is an island (no way up, no step down within NAV.stepUp), a stair
 * landing is not. The plateau search is cached per cell + grid version (the hover pick runs every frame).
 */
function navConnected(nav, x, z, y, her = null) {
  if (!nav?.index || !nav.walkable || !nav.step) return false;
  const k0 = topCell(nav, x, z, y);
  if (k0 < 0) return false;
  if (her && nav.comp && nav.comp[k0] >= 0) {
    const kh = nav.index(her.x, her.z);
    if (kh >= 0 && nav.comp[kh] >= 0) {
      const reach = reachableIslands(nav, kh);                  // cached per start island; null while the audit is stale
      if (reach && reach[nav.comp[k0]]) return true;
    }
  }
  if (nav === _ncNav && k0 === _ncCell && nav.version === _ncVer && nav.linkVersion === _ncLinks) return _ncOk;
  _seen.clear(); _queue.length = 0;
  _seen.add(k0); _queue.push(k0);
  let ok = false;
  const nx = nav.nx, nz = nav.nz;
  for (let qi = 0; qi < _queue.length && !ok && _seen.size < PLATEAU_MAX; qi++) {
    const k = _queue[qi];
    if (nav.linkFrom?.get?.(k)?.length) { ok = true; break; }
    const i = k % nx, j = (k / nx) | 0, hk = nav.h[k];
    for (let dj = -1; dj <= 1 && !ok; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const b = ii + jj * nx;
      if (_seen.has(b) || !nav.step(k, b)) continue;
      if (nav.h[b] < hk - 0.05) { ok = true; break; }   // a step down: the top is reachable from below
      _seen.add(b); _queue.push(b);
    }
  }
  _ncNav = nav; _ncVer = nav.version; _ncLinks = nav.linkVersion; _ncCell = k0; _ncOk = ok;
  return ok;
}

const _hp = new THREE.Vector3();
/** The first collider / architecture / terrain hit under CSS px (x, y) → _hp; false when the ray meets nothing. */
function propRay(ctx, x, y, rect) {
  const cam = ctx.camera, ph = ctx.physics;
  if (!cam || !ph?.raycast) return false;
  _ray.setFromCamera(toNdc(ctx, x, y, _ndc, rect), cam);
  const h = ph.raycast(_ray.ray, rayLimit(cam, _ray.ray.direction), PROP_RAY);
  if (!h) return false;
  _hp.copy(h.point);
  return true;
}

/** pickAt's view-projection (camera as rendered last frame), set once per pick: one 4×4 per projected point. */
const _pv = new THREE.Matrix4();
/** pickAt's pixels per metre at view depth 1 (perspective; 0 = no screen-space cull, e.g. an orthographic lens) */
let _ppm1 = 0;
function setPV(cam, r) {
  _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  _ppm1 = cam.isPerspectiveCamera ? Math.abs(cam.projectionMatrix.elements[5]) * r.height * 0.5 : 0;
}
/** worldToScreen with _pv (same result, one matrix product, no Vector3). */
function proj(x, y, z, out, r) {
  const e = _pv.elements;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  const nx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w, ny = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
  out.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  out.x = r.left + (nx + 1) * 0.5 * r.width;
  out.y = r.top + (1 - ny) * 0.5 * r.height;
  out.on = out.z > -1 && out.z < 1 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
  return out;
}

/** Squared distance (px²) from (px, py) to the segment a–b (screen). */
function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)) : 0;
  const dx = px - (ax + vx * t), dy = py - (ay + vy * t);
  return dx * dx + dy * dy;
}

const _sa = { x: 0, y: 0, z: 0, on: false }, _sb = { x: 0, y: 0, z: 0, on: false }, _sr = { x: 0, y: 0, z: 0, on: false };
/** actorScreen's result (scratch: read it before the next call) */
const _as = { d: 0, tol: 0, sy: 0 };

/**
 * Screen distance (px) from the pointer to an actor's projected capsule, and its pick tolerance (px), in the shared
 * `_as` scratch. null when it is behind the camera. `r` = the canvas rect.
 */
function actorScreen(ctx, a, x, y, basePx, r) {
  const pos = a.object3d?.position ?? a.pos;
  if (!pos) return null;
  if (ctx.camera && pos.distanceToSquared?.(ctx.camera.position) > 60 * 60) return null;
  const h = Math.max(0.3, a.height ?? 1), rad = a.radius ?? 0.4;
  const flyer = a.tags?.has?.('flyer') || a.def?.tags?.includes?.('flyer');
  // cheap reject (PERF §4.5): the capsule's mid point only. Everything the full test can hit lies within half its
  // height + its radius (in px at that depth, ×1.25 for the perspective spread) + the tolerance of that mid point.
  if (_ppm1 > 0 && !flyer) {
    const e = _pv.elements, my = pos.y + h * 0.5;
    const cw = e[3] * pos.x + e[7] * my + e[11] * pos.z + e[15];        // view depth (perspective w)
    if (cw > 3 * (h + rad)) {                                           // far enough that the ×1.25 covers the depth spread
      const iw = 1 / cw, ppm = _ppm1 * iw;
      const sx = r.left + ((e[0] * pos.x + e[4] * my + e[8] * pos.z + e[12]) * iw + 1) * 0.5 * r.width;
      const sy = r.top + (1 - (e[1] * pos.x + e[5] * my + e[9] * pos.z + e[13]) * iw) * 0.5 * r.height;
      const reach = (h * 0.5 + rad) * ppm * 1.25 + Math.max(basePx, rad * ppm * 1.25 + AIM.pick.pad) + 2;
      const dx = x - sx, dy = y - sy;
      if (dx * dx + dy * dy > reach * reach) return null;
    }
  }
  _a.set(pos.x, pos.y + Math.min(0.15, h * 0.2), pos.z);
  _b.set(pos.x, pos.y + h, pos.z);
  proj(_a.x, _a.y, _a.z, _sa, r); proj(_b.x, _b.y, _b.z, _sb, r);
  // behind the lens or beyond the far plane: never pickable (a point behind the camera can project onto the screen)
  if (!(_sa.z > -1 && _sa.z < 1) || !(_sb.z > -1 && _sb.z < 1)) return null;
  // projected radius: a point `radius` m to the side of her chest
  const right = ctx.cam?.yaw != null ? ctx.cam.yaw : Math.PI;
  proj(pos.x + Math.cos(right) * rad, pos.y + h * 0.5, pos.z - Math.sin(right) * rad, _sr, r);
  const mx = (_sa.x + _sb.x) / 2, my = (_sa.y + _sb.y) / 2;
  const rpx = Math.hypot(_sr.x - mx, _sr.y - my);
  let d = Math.sqrt(segDist2(x, y, _sa.x, _sa.y, _sb.x, _sb.y));
  // crows: also at their ground shadow
  if (flyer) {
    const gy = ctx.physics?.heightAt?.(pos.x, pos.z) ?? 0;
    proj(pos.x, gy, pos.z, _sa, r);
    d = Math.min(d, Math.hypot(x - _sa.x, y - _sa.y));
  }
  _as.d = d; _as.tol = Math.max(basePx, rpx + AIM.pick.pad); _as.sy = _sb.y;
  return _as;
}

/** Is this actor a live, visible pick candidate? */
function live(a) {
  if (!a || a.alive === false || a.dead || a.hidden) return false;
  if (a.object3d && a.object3d.visible === false) return false;
  return true;
}

/** pickAt's running best (module scratch: no closures / objects per call; pickAt is not re-entrant). */
const B = { kind: null, actor: null, id: null, interact: null, rank: 99, d: Infinity, her: Infinity, kinds: null, hx: 0, hz: 0, hasHer: false };

/** Offer a candidate at world `p` to the running best (rank, then nearest on screen, then nearest to her). */
function consider(kind, actor, id, interact, d, p) {
  if (B.kinds && !B.kinds.has(kind)) return;
  const r = RANK[kind] ?? 5;
  const herD = B.hasHer && p ? Math.hypot(p.x - B.hx, p.z - B.hz) : 0;
  if (r < B.rank || (r === B.rank && (d < B.d - 2 || (Math.abs(d - B.d) <= 2 && herD < B.her)))) {
    B.kind = kind; B.actor = actor; B.id = id; B.interact = interact; B.rank = r; B.d = d; B.her = herD;
  }
}

/**
 * The pick under CSS px (x, y) (§7.6). `opts.touch` widens the tolerance; `opts.kinds` (a Set) limits the kinds;
 * `opts.ground` false skips the ground ray. Writes `out`. One layout read per call, and no allocation once `out.point`
 * exists (the hover pick runs every rendered frame). `rect`: the canvas rect when the caller already has it.
 * @returns {{kind:string, actor:any, id:string|null, interact:any, point:THREE.Vector3|null, px:number}}
 */
export function pickAt(ctx, x, y, opts = NO_OPTS, out = { kind: 'ground', actor: null, id: null, interact: null, point: new THREE.Vector3(), px: 0 }, rect = canvasRect(ctx)) {
  const touch = !!opts.touch, ts = ctx.state?.settings?.touchSize ?? 1;
  const basePx = touch ? AIM.pick.touchPx * ts : AIM.pick.px;
  const her = ctx.player?.pos;
  if (ctx.camera) setPV(ctx.camera, rect); else { _pv.identity(); _ppm1 = 0; }
  B.kind = null; B.actor = null; B.id = null; B.interact = null; B.rank = 99; B.d = Infinity; B.her = Infinity;
  B.kinds = opts.kinds ?? null; B.hasHer = !!her; B.hx = her?.x ?? 0; B.hz = her?.z ?? 0;

  // ---- enemies (hostile, hurtable) and breakables (rope posts, cages, crates, cracked boulders)
  _list.length = 0;
  for (const e of ctx.enemies?.list ?? []) _list.push(e);
  for (const e of _list) {
    if (!live(e) || e.hurtable === false || e.scripted) continue;
    const s = actorScreen(ctx, e, x, y, basePx, rect);
    if (s && s.d <= s.tol) consider('enemy', e, null, null, s.d, e.pos);
  }
  const level = ctx.levels?.current;
  for (const a of ctx.actors?.list ?? []) {
    if (!(a?.breakable === true || a?.assistable === true) || a.faction === 'enemy' || !live(a) || a.hurtable === false) continue;
    if (a.tags?.has?.('player')) continue;
    const s = actorScreen(ctx, a, x, y, basePx, rect);
    if (s && s.d <= s.tol) consider('breakable', a, a.actorId ?? a.id ?? null, null, s.d, a.pos);
  }
  // ---- interactables (Vigil Stones, stations, the Quest Board, signs, cages to open)
  // The radius is projected at the spot's ground (not 0.5 m above it: that grew the near-side tolerance). Vigil Stones
  // and hub stations use ≤ PROP_PICK_R; a stone is picked along its obelisk, and beyond the base px only when the ray
  // actually meets the stone (or the collider right by it): grass a step away stays a move.
  const yaw = ctx.cam?.yaw ?? Math.PI, cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  let vigilRay = 0;                                          // 0 not cast, 1 cast (hit point in _hp), -1 no hit
  for (const it of level?.interactables ?? []) {
    if (!it?.pos || (it.enabled && !it.enabled())) continue;
    proj(it.pos.x, it.pos.y, it.pos.z, _sa, rect);
    if (!(_sa.z > -1 && _sa.z < 1)) continue;
    const vigil = it.kind === 'vigil', prop = vigil || it.kind === 'station';
    const R = prop ? PROP_PICK_R : Math.max(AIM.pick.interactR, Math.min(it.r ?? 1.2, 2.0) * 0.6);
    proj(it.pos.x + cyaw * R, it.pos.y, it.pos.z - syaw * R, _sb, rect);
    const tol = Math.max(basePx, Math.hypot(_sb.x - _sa.x, _sb.y - _sa.y));
    let d;
    if (vigil) {
      proj(it.pos.x, it.pos.y + VIGIL_AXIS_H, it.pos.z, _sb, rect);
      d = Math.sqrt(segDist2(x, y, _sa.x, _sa.y, _sb.x, _sb.y));
    } else d = Math.hypot(x - _sa.x, y - _sa.y);
    // a stone: its foot within the base px, or the ray meeting the stone (its body / top) — never the grass behind it
    let ok = vigil ? Math.hypot(x - _sa.x, y - _sa.y) <= basePx : d <= tol;
    if (vigil && !ok && d <= Math.max(tol, basePx)) {
      if (vigilRay === 0) vigilRay = propRay(ctx, x, y, rect) ? 1 : -1;
      ok = vigilRay > 0 && Math.hypot(_hp.x - it.pos.x, _hp.z - it.pos.z) <= VIGIL_HIT_R && _hp.y > it.pos.y + 0.05;
    }
    if (ok) consider(it.kind === 'npc' ? 'npc' : 'interact', it.actor ?? null, it.id, it, d, it.pos);
  }
  // ---- NPCs, party kittens and lost kittens (companions' pickables)
  _list.length = 0;
  ctx.companions?.pickables?.(_list);
  for (const a of _list) {
    if (!live(a) || !a.pickKind) continue;
    const s = actorScreen(ctx, a, x, y, basePx, rect);
    if (s && s.d <= s.tol) consider('npc', a, a.interactId ?? null, null, s.d, a.pos);
  }
  _list.length = 0;                                          // don't pin despawned actors
  out.kind = B.kind ?? 'ground';
  out.actor = B.actor;
  out.id = B.id;
  out.interact = B.interact;
  out.px = Number.isFinite(B.d) ? B.d : 0;
  B.actor = null; B.interact = null; B.kinds = null;
  const g = opts.ground === false ? null : screenToGround(ctx, x, y, out.point ?? (out.point = new THREE.Vector3()), rect);
  if (!g && out.point) out.point.set(NaN, NaN, NaN);
  return out;
}
